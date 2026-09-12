"""Audio -> chroma features, tempo, and a per-frame silence mask."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np

from .config import AnalysisParams
from .ffmpeg_setup import transcode_to_wav

log = logging.getLogger("chordscribe")


@dataclass
class Features:
    chroma: np.ndarray          # (12, n_frames), beat-synced if params.beat_sync
    times: np.ndarray           # (n_frames,) start time of each frame, seconds
    silence_mask: np.ndarray    # (n_frames,) bool
    duration_sec: float
    bpm: float | None


def _load_audio(path: str, sample_rate: int) -> tuple[np.ndarray, int]:
    """Load audio at `sample_rate`, mono. `soundfile` (librosa's only backend
    now) reads WAV/FLAC/OGG/MP3 directly; anything else (MP4/MOV/WEBM, or an
    MP3 an older libsndfile can't parse) is transcoded via ffmpeg first."""
    try:
        return librosa.load(path, sr=sample_rate, mono=True)
    except Exception as exc:  # noqa: BLE001 - soundfile raises its own error type
        log.info("soundfile couldn't read %s directly (%s); transcoding via ffmpeg", path, exc)
        wav_path = transcode_to_wav(path, sample_rate)
        try:
            return librosa.load(wav_path, sr=sample_rate, mono=True)
        finally:
            Path(wav_path).unlink(missing_ok=True)


def extract(path: str, params: AnalysisParams) -> Features:
    y, sr = _load_audio(path, params.sample_rate)
    duration = float(len(y) / sr)

    # Real recordings are rarely tuned to exactly A440; a fixed semitone grid
    # would smear energy across bins for anything off by more than ~10 cents.
    tuning = librosa.estimate_tuning(y=y, sr=sr)

    # Harmonic-percussive separation keeps drums/transients out of the chroma.
    y_harm = librosa.effects.harmonic(y, margin=3.0)

    chroma = librosa.feature.chroma_cqt(
        y=y_harm,
        sr=sr,
        hop_length=params.hop_length,
        tuning=tuning,
        bins_per_octave=36,  # 3 bins/semitone, sharpens the post-tuning grid
    )
    frame_times = librosa.frames_to_time(
        np.arange(chroma.shape[1]), sr=sr, hop_length=params.hop_length
    )

    rms = librosa.feature.rms(y=y, hop_length=params.hop_length)[0]
    rms = librosa.util.fix_length(rms, size=chroma.shape[1])

    bpm: float | None = None
    if params.beat_sync:
        try:
            tempo, beats = librosa.beat.beat_track(
                y=y, sr=sr, hop_length=params.hop_length, units="frames"
            )
            bpm = float(np.atleast_1d(tempo)[0])
            if len(beats) >= 2:
                chroma = librosa.util.sync(chroma, beats, aggregate=np.median)
                beat_times = librosa.frames_to_time(
                    beats, sr=sr, hop_length=params.hop_length
                )
                frame_times = _sync_frame_times(beat_times, duration)
                rms = librosa.util.sync(rms[np.newaxis, :], beats, aggregate=np.median)[0]
        except Exception:  # noqa: BLE001 - beat tracking is best-effort
            bpm = None

    chroma = librosa.util.normalize(chroma, axis=0, norm=2)
    silence_mask = _silence_mask(rms, params.silence_rms)

    return Features(
        chroma=chroma,
        times=frame_times[: chroma.shape[1]],
        silence_mask=silence_mask[: chroma.shape[1]],
        duration_sec=duration,
        bpm=bpm,
    )


def _silence_mask(rms: np.ndarray, ratio: float) -> np.ndarray:
    """Frames quiet relative to *this track's* loud passages, not an absolute
    level — a quietly-mastered recording shouldn't be flagged as all silence,
    and a hot one shouldn't let noise floor hum read as a held chord."""
    loud = np.percentile(rms, 90) if rms.size else 0.0
    threshold = max(ratio * loud, 1e-4)
    return rms < threshold


def _sync_frame_times(beat_times: np.ndarray, duration: float) -> np.ndarray:
    """`librosa.util.sync` prepends a segment for the pre-first-beat audio."""
    return np.concatenate([[0.0], beat_times, [duration]])[: len(beat_times) + 1]

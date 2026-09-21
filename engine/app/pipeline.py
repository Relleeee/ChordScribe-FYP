"""Glue: ingested audio -> AnalysisResult."""

from __future__ import annotations

import logging

import numpy as np

from . import __version__
from . import separate as stems_mod
from .chords import label_frames, merge_short_segments, segments_from_frames
from .config import DEFAULT_PARAMS, AnalysisParams
from .features import extract
from .ffmpeg_setup import ensure_readable
from .ingest import Ingested
from .keys import estimate_key
from .schemas import AnalysisResult, ChordSegment, EngineInfo, SourceInfo

log = logging.getLogger("chordscribe")

METHOD_TEMPLATE = "chroma-cqt + binary-template matching + Viterbi smoothing"
METHOD_BTC = "BTC bi-directional transformer (pretrained, {vocab})"
_VOCAB_DESC = {"large": "large vocabulary: 7ths/sus/dim/aug", "majmin": "maj/min"}


def _template_segments(feats, params: AnalysisParams) -> list[dict]:
    labels, confidence = label_frames(
        feats.chroma,
        transition_penalty=params.transition_penalty,
        emission_temperature=params.emission_temperature,
        silence_mask=feats.silence_mask,
    )
    return segments_from_frames(
        labels,
        confidence,
        feats.times,
        end_time=feats.duration_sec,
        min_segment_sec=params.min_segment_sec,
    )


def analyze(
    ingested: Ingested,
    *,
    kind: str,
    params: AnalysisParams = DEFAULT_PARAMS,
    separate: bool | None = None,
) -> AnalysisResult:
    """``separate``: run Demucs first so chords/key are read from the harmonic
    stem (drums and vocal removed). None = the server default (GPU-only)."""
    # Decode once to something both backends can read (MP4/odd MP3 -> WAV).
    audio_path = ensure_readable(ingested.path)

    # Chroma still gives us tempo, key and duration regardless of the chord backend.
    feats = extract(audio_path, params)

    # Chords and key are harmony: read them from the mix minus drums and vocals.
    harmonic_path = audio_path
    stems_used = False
    if stems_mod.enabled(separate):
        try:
            harmonic_path = stems_mod.separate(audio_path).harmonic
            stems_used = True
        except Exception:  # noqa: BLE001 - separation is an upgrade, never a hard requirement
            log.exception("stem separation failed; analysing the full mix")

    method = METHOD_TEMPLATE
    if params.chord_backend == "btc":
        try:
            from .chords_btc import recognize as btc_recognize

            raw_segments = merge_short_segments(
                btc_recognize(
                    harmonic_path,
                    vocab=params.chord_vocab,
                    extended_floor=params.extended_floor,
                ),
                params.min_segment_sec,
            )
            vocab = _VOCAB_DESC.get(params.chord_vocab, params.chord_vocab)
            method = METHOD_BTC.format(vocab=vocab)
        except Exception:  # noqa: BLE001 - fall back rather than fail the request
            log.exception("BTC backend failed; falling back to the template matcher")
            raw_segments = _template_segments(feats, params)
    else:
        raw_segments = _template_segments(feats, params)
    if stems_used:
        method += " on Demucs harmonic stem"

    segments = [ChordSegment(**s) for s in raw_segments]
    key_chroma = feats.chroma
    if stems_used:  # key from the harmony alone — cymbals/vocal smear the profile
        key_chroma = extract(harmonic_path, params).chroma
    key = estimate_key(np.asarray(key_chroma).mean(axis=1))

    return AnalysisResult(
        source=SourceInfo(
            kind=kind,  # type: ignore[arg-type]
            reference=ingested.reference,
            title=ingested.title,
            durationSec=round(feats.duration_sec, 2),
        ),
        bpm=round(feats.bpm, 1) if feats.bpm else None,
        key=key,
        segments=segments,
        engine=EngineInfo(version=__version__, method=method, params=params.as_dict()),
    )

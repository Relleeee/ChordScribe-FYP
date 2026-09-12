"""Signal-processing parameters, in one place so evaluation runs are reproducible."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _default_backend() -> str:
    # "btc" = pretrained transformer (accurate, default); "template" = the
    # chroma/Viterbi baseline. Override with CHORD_BACKEND.
    return os.environ.get("CHORD_BACKEND", "btc").strip().lower()


@dataclass(frozen=True)
class AnalysisParams:
    # Which chord recogniser to use — see chords_btc.py / chords.py.
    chord_backend: str = field(default_factory=_default_backend)
    sample_rate: int = 22050
    hop_length: int = 2048
    # Softmax temperature applied to template similarities before decoding.
    # Lower => more confident per-frame estimates, more willing to switch.
    emission_temperature: float = 0.2
    # Log-domain cost of switching chords between frames; higher => fewer, longer
    # segments. There's a sharp instability past ~2.0 at this temperature: on a
    # dense full-band mix (real songs, not a clean solo instrument) the
    # per-frame emission gap between the right chord and a wrong one shrinks,
    # and once the penalty exceeds that gap the decoder can freeze onto one
    # label for minutes. 1.5 was the largest value that stayed well clear of
    # that cliff when tuned against a real, dense-mix commercial recording —
    # see engine/README.md#accuracy-notes.
    transition_penalty: float = 1.5
    # Frames quieter than this fraction of the track's own loud passages
    # (90th-percentile RMS) are treated as "no chord". Relative, not absolute,
    # so it adapts to quietly- or hot-mastered recordings alike.
    silence_rms: float = 0.05
    # Drop segments shorter than this (seconds) by merging into a neighbour —
    # cleans up the odd one-frame flicker the lower transition_penalty allows.
    min_segment_sec: float = 1.0
    beat_sync: bool = True

    def as_dict(self) -> dict[str, float | str | bool]:
        return {
            "chord_backend": self.chord_backend,
            "sample_rate": self.sample_rate,
            "hop_length": self.hop_length,
            "emission_temperature": self.emission_temperature,
            "transition_penalty": self.transition_penalty,
            "silence_rms": self.silence_rms,
            "min_segment_sec": self.min_segment_sec,
            "beat_sync": self.beat_sync,
        }


DEFAULT_PARAMS = AnalysisParams()

PITCH_CLASSES: tuple[str, ...] = (
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
)

"""Feature extraction: reference-pitch (tuning) offset and the beat grid."""

from __future__ import annotations

import numpy as np
import pytest
import soundfile as sf

from app.config import DEFAULT_PARAMS
from app.features import extract

SR = 22050


def _chord_wav(path, cents: float, seconds: float = 8.0) -> str:
    t = np.arange(int(seconds * SR)) / SR
    shift = 2 ** (cents / 1200)
    y = sum(
        np.sin(2 * np.pi * f * shift * t) for f in (220.0, 277.18, 329.63, 440.0)
    )
    # Pulse it at 120 BPM so the beat tracker has something to lock on to.
    y = y * (0.4 + 0.6 * np.exp(-6 * (t % 0.5)))
    sf.write(path, (0.2 * y).astype(np.float32), SR)
    return str(path)


@pytest.mark.parametrize("cents", [0.0, 30.0, -25.0])
def test_tuning_cents(tmp_path, cents):
    feats = extract(_chord_wav(tmp_path / "a.wav", cents), DEFAULT_PARAMS)
    assert feats.tuning_cents == pytest.approx(cents, abs=6)


def test_beat_grid(tmp_path):
    feats = extract(_chord_wav(tmp_path / "a.wav", 0.0), DEFAULT_PARAMS)
    assert feats.beat_times is not None and len(feats.beat_times) >= 8
    assert feats.beat_strength is not None and len(feats.beat_strength) == len(feats.beat_times)

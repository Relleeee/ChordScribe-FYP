"""Unit tests for the chord matcher — no audio, just synthetic chroma."""

from __future__ import annotations

import numpy as np

from app.chords import (
    LABELS,
    NO_CHORD,
    build_templates,
    label_frames,
    segments_from_frames,
)
from app.config import DEFAULT_PARAMS

PEN = DEFAULT_PARAMS.transition_penalty
TEMP = DEFAULT_PARAMS.emission_temperature


def test_vocabulary_is_24_triads() -> None:
    labels, matrix = build_templates()
    assert len(labels) == 24
    assert matrix.shape == (24, 12)
    assert "C" in labels and "Cm" in labels and "F#" in labels


def _chroma_for(sequence: list[str], frames_each: int) -> np.ndarray:
    """Build a clean (12, N) chroma from a list of chord labels."""
    _, matrix = build_templates()
    idx = {lab: i for i, lab in enumerate(LABELS)}
    cols: list[np.ndarray] = []
    for lab in sequence:
        cols.extend([matrix[idx[lab]]] * frames_each)
    return np.array(cols).T


def _majority_blocks(labels: list[str], seq_len: int, frames_each: int) -> list[str]:
    out = []
    for i in range(seq_len):
        window = labels[i * frames_each : (i + 1) * frames_each]
        out.append(max(set(window), key=window.count))
    return out


def test_recovers_clean_progression() -> None:
    seq = ["C", "G", "Am", "F", "C", "Em", "F", "G"]
    chroma = _chroma_for(seq, frames_each=3)
    labels, conf = label_frames(
        chroma, transition_penalty=PEN, emission_temperature=TEMP
    )
    assert _majority_blocks(labels, len(seq), 3) == seq
    assert np.mean(conf) > 0.95


def test_survives_moderate_noise() -> None:
    rng = np.random.default_rng(0)
    seq = ["C", "G", "Am", "F"] * 2
    _, matrix = build_templates()
    idx = {lab: i for i, lab in enumerate(LABELS)}
    cols = [
        matrix[idx[lab]] + 0.3 * rng.random(12)
        for lab in seq
        for _ in range(4)
    ]
    labels, _ = label_frames(
        np.array(cols).T, transition_penalty=PEN, emission_temperature=TEMP
    )
    assert _majority_blocks(labels, len(seq), 4) == seq


def test_silence_mask_forces_no_chord() -> None:
    chroma = _chroma_for(["C", "C"], frames_each=4)
    mask = np.array([False, False, False, False, True, True, True, True])
    labels, _ = label_frames(chroma, transition_penalty=PEN, silence_mask=mask)
    assert labels[-1] == NO_CHORD
    assert labels[0] == "C"


def test_segments_merge_and_drop_slivers() -> None:
    labels = ["C", "C", "C", "G", "C", "C"]
    conf = np.full(6, 0.9)
    times = np.array([0.0, 1.0, 2.0, 3.0, 3.1, 4.0])
    segs = segments_from_frames(
        labels, conf, times, end_time=5.0, min_segment_sec=0.5
    )
    assert len(segs) == 1
    assert segs[0]["label"] == "C"
    assert segs[0]["end"] == 5.0

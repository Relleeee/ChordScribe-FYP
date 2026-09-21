"""Extended-vocabulary chord handling: BTC label mapping, triad fallback, and tab."""

from __future__ import annotations

import numpy as np
import pytest

from app.chords_btc import _collapse_to_triad, _frames_to_segments, _map_label
from app.tab import (
    _BARRE,
    _INTERVALS,
    _OPEN_STD,
    _STD,
    _standard_shape,
    chord_grip,
    chord_pitch_classes,
)

SHARP = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("C", "C"),
        ("C:min", "Cm"),
        ("F#:min7", "F#m7"),
        ("G:7", "G7"),
        ("A:maj7", "Amaj7"),
        ("D:sus4", "Dsus4"),
        ("B:hdim7", "Bm7b5"),
        ("E:minmaj7", "EmMaj7"),
        ("A#:maj6", "A#6"),
        ("N", "N"),
        ("X", "N"),
    ],
)
def test_btc_label_mapping(raw: str, expected: str) -> None:
    assert _map_label(raw) == expected


@pytest.mark.parametrize(
    ("label", "triad"),
    [
        ("Cmaj7", "C"),
        ("G7", "G"),
        ("Dsus4", "D"),
        ("Am7", "Am"),
        ("F#m7b5", "F#m"),
        ("Bbmaj7", "Bb"),
        ("Bdim", "Bm"),
        ("C", "C"),
        ("Em", "Em"),
        ("N", "N"),
    ],
)
def test_collapse_to_triad(label: str, triad: str) -> None:
    assert _collapse_to_triad(label) == triad


def test_frames_to_segments_groups_runs() -> None:
    labels = ["C", "C", "G7", "G7", "G7"]
    segs = _frames_to_segments(labels, np.array([0.9, 0.7, 0.8, 0.8, 0.8]), 1.0)
    got = [(s["label"], s["start"], s["end"]) for s in segs]
    assert got == [("C", 0.0, 2.0), ("G7", 2.0, 5.0)]
    assert segs[0]["confidence"] == pytest.approx(0.8)


def test_every_map_label_is_understood_by_tab() -> None:
    """Every quality the engine can emit must have chord tones and a fretting."""
    from app.chords_btc import _QUALITY

    for suffix in _QUALITY.values():
        assert suffix in _INTERVALS, f"tab.py has no intervals for quality {suffix!r}"
        assert suffix in _BARRE, f"tab.py has no barre shape for quality {suffix!r}"


def test_chord_pitch_classes_extended() -> None:
    assert chord_pitch_classes("Cmaj7") == frozenset({0, 4, 7, 11})
    assert chord_pitch_classes("G7") == frozenset({7, 11, 2, 5})
    assert chord_pitch_classes("Am7") == frozenset({9, 0, 4, 7})
    assert chord_pitch_classes("Dsus4") == frozenset({2, 7, 9})
    assert chord_pitch_classes("N") == frozenset()
    assert chord_pitch_classes("H#weird") == frozenset()


@pytest.mark.parametrize("suffix", sorted(_INTERVALS))
@pytest.mark.parametrize("root", SHARP)
def test_standard_shapes_are_playable_chords(root: str, suffix: str) -> None:
    """Every ported voicing sounds only chord tones, and always the root."""
    label = root + suffix
    shape = _standard_shape(label)
    assert shape is not None, f"no shape for {label}"
    sounded = {(_STD[i] + f) % 12 for i, f in enumerate(shape) if f is not None}
    tones = chord_pitch_classes(label)
    assert sounded <= tones, f"{label} {shape} sounds non-chord tones {sounded - tones}"
    assert SHARP.index(root) in sounded, f"{label} {shape} omits the root"


def test_chord_grip_uses_extended_open_shape() -> None:
    assert dict(chord_grip("Cmaj7", _STD)) == {1: 3, 2: 2, 3: 0, 4: 0, 5: 0}
    assert "Cmaj7" in _OPEN_STD


def test_chord_grip_extended_in_alternate_tuning_is_chord_tones_only() -> None:
    drop_d = (38, 45, 50, 55, 59, 64)
    grip = chord_grip("G7", drop_d)
    assert len(grip) >= 3
    assert {(drop_d[s] + f) % 12 for s, f in grip} <= chord_pitch_classes("G7")

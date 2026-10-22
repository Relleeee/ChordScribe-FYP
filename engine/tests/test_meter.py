"""Time signature / downbeat estimation from chord changes."""

from __future__ import annotations

import numpy as np

from app.meter import estimate_meter

BEAT = 0.5  # 120 BPM


def grid(n: int) -> np.ndarray:
    return np.arange(n) * BEAT


def test_four_four_with_pickup():
    beats = grid(64)
    # One-beat pickup, then a chord change every bar of 4.
    changes = [beats[i] for i in range(1, 64, 4)][1:]
    m = estimate_meter(beats, changes)
    assert m is not None
    assert (m.beats_per_bar, m.first_downbeat) == (4, 1)
    assert m.confidence == 1.0


def test_three_four_waltz():
    beats = grid(60)
    changes = [beats[i] for i in range(3, 60, 3)]
    m = estimate_meter(beats, changes)
    assert (m.beats_per_bar, m.first_downbeat) == (3, 0)


def test_half_bar_changes_still_read_as_four():
    beats = grid(64)
    # Changes every 2 beats fit 4/4 at phase 0 or 2 equally; the prior keeps 4/4.
    changes = [beats[i] for i in range(2, 64, 2)]
    m = estimate_meter(beats, changes)
    assert m.beats_per_bar == 4
    assert m.first_downbeat in (0, 2)


def test_accent_breaks_ties_when_harmony_is_static():
    beats = grid(32)
    strength = np.ones(32)
    strength[2::4] = 3.0  # accents on beat index 2, 6, 10…
    m = estimate_meter(beats, [], strength)
    assert (m.beats_per_bar, m.first_downbeat) == (4, 2)


def test_off_grid_changes_are_ignored_and_short_tracks_give_none():
    beats = grid(32)
    m = estimate_meter(beats, [beats[4] + 0.2, beats[8]])  # 0.2s = 40% of a beat: off grid
    assert m.confidence == 1.0
    assert estimate_meter(grid(5), [1.0]) is None

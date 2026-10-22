"""Time signature + downbeat estimation from the beat grid and the chord changes.

Harmony is the strongest bar-level cue in popular music: chords overwhelmingly
change on the downbeat (bar line), occasionally on the half-bar, rarely
elsewhere. So for each candidate meter (3/4, 4/4) and each phase (which beat is
"one"), we measure how many chord changes land on a bar line and how accented
(onset strength) those beats are, and keep the best. A small prior favours 4/4,
which covers the large majority of the repertoire.

This is a heuristic — no learned downbeat model — but it is cheap, explainable,
and right on songs with a regular harmonic rhythm. ``confidence`` reports the
fraction of chord changes that fall on bar lines under the chosen grid, so the UI
can say "estimated" when it is low.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

METERS = (4, 3)
PRIOR = {4: 0.08, 3: 0.0}
ACCENT_WEIGHT = 0.15
SNAP = 0.3  # a change counts as "on" a beat within this fraction of a beat period


@dataclass
class Meter:
    beats: list[float]
    beats_per_bar: int
    first_downbeat: int  # index into beats
    confidence: float


def _change_beats(beat_times: np.ndarray, change_times: list[float]) -> list[int]:
    """Index of the beat each chord change lands on (changes off the grid are dropped)."""
    if len(beat_times) < 2:
        return []
    period = float(np.median(np.diff(beat_times)))
    out = []
    for t in change_times:
        i = int(np.argmin(np.abs(beat_times - t)))
        if abs(beat_times[i] - t) <= SNAP * period:
            out.append(i)
    return out


def estimate_meter(
    beat_times: np.ndarray,
    change_times: list[float],
    beat_strength: np.ndarray | None = None,
) -> Meter | None:
    """Pick (beats per bar, phase) from beat times, chord-change times and the
    per-beat onset strength. None if there are too few beats to say anything."""
    beat_times = np.asarray(beat_times, dtype=float)
    if len(beat_times) < 8:
        return None
    on_beat = _change_beats(beat_times, change_times)

    strength = None
    if beat_strength is not None and len(beat_strength) == len(beat_times):
        s = np.asarray(beat_strength, dtype=float)
        if s.max() > 0:
            strength = s / s.max()

    best: tuple[float, int, int, float] | None = None  # (score, meter, phase, hit rate)
    for m in METERS:
        for phase in range(m):
            hits = sum(1 for i in on_beat if (i - phase) % m == 0)
            hit_rate = hits / len(on_beat) if on_beat else 0.0
            accent = 0.0
            if strength is not None:
                accent = float(strength[phase::m].mean() - strength.mean())
            score = hit_rate + ACCENT_WEIGHT * accent + PRIOR[m]
            if best is None or score > best[0]:
                best = (score, m, phase, hit_rate)

    assert best is not None
    _, m, phase, hit_rate = best
    return Meter(
        beats=[round(float(t), 3) for t in beat_times],
        beats_per_bar=m,
        first_downbeat=phase,
        confidence=round(hit_rate, 3),
    )

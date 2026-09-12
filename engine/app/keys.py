"""Krumhansl-Schmuckler key estimation from an averaged chroma vector."""

from __future__ import annotations

import numpy as np

from .config import PITCH_CLASSES

# Krumhansl & Kessler (1982) probe-tone profiles.
_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)


def estimate_key(chroma_mean: np.ndarray) -> str | None:
    """chroma_mean: length-12 vector -> "C major" / "A minor", or None."""
    if chroma_mean.size != 12 or not np.any(chroma_mean):
        return None
    vec = chroma_mean - chroma_mean.mean()

    best_score = -np.inf
    best_label: str | None = None
    for tonic in range(12):
        for profile, name in ((_MAJOR, "major"), (_MINOR, "minor")):
            rotated = np.roll(profile - profile.mean(), tonic)
            score = float(np.corrcoef(vec, rotated)[0, 1])
            if score > best_score:
                best_score = score
                best_label = f"{PITCH_CLASSES[tonic]} {name}"
    return best_label

"""Chroma -> chord labels via template matching with a Viterbi smoothing pass.

The vocabulary is the 24 major/minor triads plus a "no chord" symbol ("N"), which
is the standard MIREX major/minor task. Templates are binary chord-tone masks; a
frame's chroma is compared to each template by cosine similarity.
"""

from __future__ import annotations

import numpy as np

from .config import PITCH_CLASSES

# Interval (semitones from root) -> weight, for the two triad qualities.
# (Tried upweighting the third, since it's the only thing that distinguishes
# major from minor — root/fifth are shared and never help discriminate. It
# tests worse on a real recording: when a voicing is root/fifth-heavy with a
# genuinely weak third (e.g. a power-chord-style backing track), amplifying
# that near-empty, noisy dimension flips the *root* to a neighbouring chord
# instead of just leaving the quality uncertain. Equal weights are more
# stable — see engine/README.md#accuracy-notes.)
_QUALITIES: dict[str, dict[int, float]] = {
    "": {0: 1.0, 4: 1.0, 7: 1.0},   # major -> label is just the root, e.g. "C"
    "m": {0: 1.0, 3: 1.0, 7: 1.0},  # minor -> root + "m", e.g. "Am"
}

NO_CHORD = "N"


def build_templates() -> tuple[list[str], np.ndarray]:
    """Return (labels, matrix) where matrix is (n_chords, 12), L2-normalised."""
    labels: list[str] = []
    rows: list[np.ndarray] = []
    for quality, weights in _QUALITIES.items():
        for root in range(12):
            vec = np.zeros(12, dtype=np.float64)
            for interval, weight in weights.items():
                vec[(root + interval) % 12] = weight
            vec /= np.linalg.norm(vec)
            rows.append(vec)
            labels.append(f"{PITCH_CLASSES[root]}{quality}")
    return labels, np.vstack(rows)


LABELS, TEMPLATES = build_templates()


def frame_similarities(chroma: np.ndarray) -> np.ndarray:
    """chroma: (12, n_frames) -> similarity matrix (n_chords, n_frames) in [0, 1]."""
    norms = np.linalg.norm(chroma, axis=0)
    norms[norms == 0] = 1e-9
    unit = chroma / norms
    sims = TEMPLATES @ unit  # (n_chords, n_frames)
    return np.clip(sims, 0.0, 1.0)


def _log_emission(sims: np.ndarray, temperature: float) -> np.ndarray:
    """Turn raw template similarities into per-frame log-posteriors via softmax.

    Softmax sharpens the gap between the best chord and its near-neighbours
    (e.g. a major triad vs its relative minor, which share two notes), which the
    Viterbi pass needs to be willing to switch on short segments.
    """
    logits = sims / max(temperature, 1e-3)
    logits -= logits.max(axis=0, keepdims=True)
    log_norm = np.log(np.exp(logits).sum(axis=0, keepdims=True))
    return logits - log_norm


def viterbi_decode(
    sims: np.ndarray, transition_penalty: float, temperature: float = 0.2
) -> np.ndarray:
    """Most likely chord path. Emission = softmax over template similarity;
    switching chords between frames costs `transition_penalty`.

    Returns an array of chord indices (into LABELS), one per frame.
    """
    n_chords, n_frames = sims.shape
    log_emit = _log_emission(sims, temperature)

    trans = np.full((n_chords, n_chords), -transition_penalty, dtype=np.float64)
    np.fill_diagonal(trans, 0.0)

    score = log_emit[:, 0].copy()
    back = np.zeros((n_chords, n_frames), dtype=np.int32)
    for t in range(1, n_frames):
        total = score[:, None] + trans  # (prev, curr)
        best_prev = np.argmax(total, axis=0)
        score = total[best_prev, np.arange(n_chords)] + log_emit[:, t]
        back[:, t] = best_prev

    path = np.zeros(n_frames, dtype=np.int32)
    path[-1] = int(np.argmax(score))
    for t in range(n_frames - 1, 0, -1):
        path[t - 1] = back[path[t], t]
    return path


def label_frames(
    chroma: np.ndarray,
    *,
    transition_penalty: float,
    emission_temperature: float = 0.2,
    silence_mask: np.ndarray | None = None,
) -> tuple[list[str], np.ndarray]:
    """Return (per-frame labels, per-frame confidence in [0, 1])."""
    sims = frame_similarities(chroma)
    path = viterbi_decode(sims, transition_penalty, emission_temperature)
    labels = [LABELS[i] for i in path]
    confidence = sims[path, np.arange(sims.shape[1])]

    if silence_mask is not None:
        for i, silent in enumerate(silence_mask):
            if silent:
                labels[i] = NO_CHORD
                confidence[i] = 1.0 - float(np.max(sims[:, i]))
    return labels, confidence


def segments_from_frames(
    labels: list[str],
    confidence: np.ndarray,
    times: np.ndarray,
    *,
    end_time: float,
    min_segment_sec: float,
) -> list[dict]:
    """Collapse consecutive equal labels into timed segments, then drop slivers."""
    if not labels:
        return []

    raw: list[dict] = []
    run_start_idx = 0
    for i in range(1, len(labels) + 1):
        if i == len(labels) or labels[i] != labels[run_start_idx]:
            start = float(times[run_start_idx])
            end = float(times[i]) if i < len(times) else end_time
            conf = float(np.mean(confidence[run_start_idx:i]))
            raw.append(
                {
                    "start": start,
                    "end": end,
                    "label": labels[run_start_idx],
                    "confidence": conf,
                }
            )
            run_start_idx = i

    return merge_short_segments(raw, min_segment_sec)


def merge_short_segments(segments: list[dict], min_segment_sec: float) -> list[dict]:
    if len(segments) <= 1:
        return segments
    out = [dict(segments[0])]
    for seg in segments[1:]:
        prev = out[-1]
        if seg["end"] - seg["start"] < min_segment_sec:
            # Absorb the sliver into whichever neighbour it resembles more.
            prev["end"] = seg["end"]
            prev["confidence"] = (prev["confidence"] + seg["confidence"]) / 2
        elif seg["label"] == prev["label"]:
            prev["end"] = seg["end"]
            prev["confidence"] = (prev["confidence"] + seg["confidence"]) / 2
        else:
            out.append(dict(seg))
    return out

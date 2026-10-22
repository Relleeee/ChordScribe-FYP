"""Render a small synthetic dataset (WAV + ground-truth .lab) for smoke-testing the harness.

    python -m eval.make_synthetic --out eval/data/synthetic --songs 5

Each "song" is a random progression of 8–12 chords played as harmonic-rich
sustained tones over a bass root, with an optional strummed-texture variant.
It proves the plumbing end to end and gives an easy upper bound — it is NOT a
substitute for real recordings with human annotations (see eval/README.md).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf

from .labels import split_root, write_lab

SR = 22050
NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
INTERVALS = {
    "": (0, 4, 7), "m": (0, 3, 7), "7": (0, 4, 7, 10), "maj7": (0, 4, 7, 11),
    "m7": (0, 3, 7, 10), "sus4": (0, 5, 7), "dim": (0, 3, 6),
}
# Weighted so the progressions look like real songs: mostly triads.
QUALITIES = ["", "", "", "m", "m", "m", "7", "maj7", "m7", "sus4", "dim"]


def _tone(freq: float, n: int, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(n) / SR
    # Decaying harmonics, slightly detuned, like a plucked/bowed string.
    out = np.zeros(n)
    for h in range(1, 7):
        out += (0.6 ** (h - 1)) * np.sin(2 * np.pi * freq * h * (1 + rng.normal(0, 0.0005)) * t)
    return out


def _chord(label: str, dur: float, rng: np.random.Generator, strum: bool) -> np.ndarray:
    n = int(dur * SR)
    root, q = split_root(label)
    r = NAMES.index(root)
    out = 0.8 * _tone(440 * 2 ** ((r - 9 - 24) / 12), n, rng)  # bass root, two octaves down
    for iv in INTERVALS[q]:
        midi = 48 + ((r + iv) % 12)  # voice the chord around C3–B3 and C4–B4
        for octave in (0, 12):
            out += 0.35 * _tone(440 * 2 ** ((midi + octave - 69) / 12), n, rng)
    t = np.arange(n) / SR
    if strum:  # re-attack on every beat at ~100 BPM
        env = np.exp(-3.0 * (t % 0.6))
    else:
        env = np.minimum(1, t / 0.02) * np.exp(-0.4 * t)
    fade = np.minimum(1, (n - np.arange(n)) / (0.01 * SR))
    return out * env * fade


def make_song(rng: np.random.Generator, strum: bool) -> tuple[np.ndarray, list[dict]]:
    audio, segs, t = [], [], 0.0
    for _ in range(int(rng.integers(8, 13))):
        label = NAMES[rng.integers(12)] + QUALITIES[rng.integers(len(QUALITIES))]
        dur = float(rng.choice([1.8, 2.4, 3.6]))
        audio.append(_chord(label, dur, rng, strum))
        segs.append({"start": t, "end": t + dur, "label": label})
        t += dur
    y = np.concatenate(audio)
    y += rng.normal(0, 0.01, y.shape)  # a little noise floor
    return (0.9 * y / np.abs(y).max()).astype(np.float32), segs


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=Path("eval/data/synthetic"))
    ap.add_argument("--songs", type=int, default=5)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    for i in range(args.songs):
        y, segs = make_song(rng, strum=i % 2 == 1)
        stem = args.out / f"synthetic_{i + 1:02d}"
        sf.write(stem.with_suffix(".wav"), y, SR)
        write_lab(stem.with_suffix(".lab"), segs)
    print(f"wrote {args.songs} songs to {args.out}")


if __name__ == "__main__":
    main()

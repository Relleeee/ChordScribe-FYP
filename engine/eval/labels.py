"""App chord labels ("C", "Am", "F#m7b5", "N") <-> Harte syntax ("C:maj", "A:min")."""

from __future__ import annotations

# App suffix -> Harte shorthand. Mirrors chords_btc._QUALITY in reverse.
_HARTE = {
    "": "maj", "m": "min", "dim": "dim", "aug": "aug", "6": "maj6", "m6": "min6",
    "7": "7", "maj7": "maj7", "m7": "min7", "mMaj7": "minmaj7", "dim7": "dim7",
    "m7b5": "hdim7", "sus2": "sus2", "sus4": "sus4",
}


def split_root(label: str) -> tuple[str, str]:
    """"F#m7" -> ("F#", "m7")."""
    n = 2 if len(label) > 1 and label[1] in "#b" else 1
    return label[:n], label[n:]


def to_harte(label: str) -> str:
    """Convert an app label to Harte syntax for mir_eval. Unknown qualities raise."""
    if label in ("N", "X", ""):
        return "N"
    root, suffix = split_root(label)
    if suffix not in _HARTE:
        raise ValueError(f"unknown chord quality in {label!r}")
    return f"{root}:{_HARTE[suffix]}"


def write_lab(path, segments) -> None:
    """Write ``[{start, end, label}, ...]`` (app labels) as a MIREX .lab file."""
    with open(path, "w", encoding="utf-8") as f:
        for s in segments:
            f.write(f"{s['start']:.3f}\t{s['end']:.3f}\t{to_harte(s['label'])}\n")

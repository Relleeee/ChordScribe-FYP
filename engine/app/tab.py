"""Guitar tab straight from the audio, guided by the detected chords.

  1. polyphonic note transcription with **basic-pitch** — the notes actually
     played, at the song's real pitch;
  2. drop what doesn't belong: overtones, and quiet notes that aren't in the
     chord under them (usually vocal / other-instrument bleed);
  3. fret assignment — a strummed chord is written as that chord's grip; a
     lead line keeps its transcribed notes but is fretted near the chord's
     hand position. A beam search keeps the fretting hand from jumping around;
  4. render to timed ASCII tab on a sixteenth-note grid.

basic-pitch is a general-instrument transcriber, so this is most faithful on a
solo or sparsely-arranged guitar recording and gets noisier as the mix fills up.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import lru_cache

log = logging.getLogger("chordscribe")

MAX_FRET = 19

# Open-string MIDI numbers per tuning preset (low → high).
TUNING_MIDI: dict[str, tuple[int, ...]] = {
    "standard": (40, 45, 50, 55, 59, 64),  # E2 A2 D3 G3 B3 E4
    "drop-d": (38, 45, 50, 55, 59, 64),
    "drop-c": (36, 43, 48, 53, 57, 62),
    "eb-standard": (39, 44, 49, 54, 58, 63),
    "d-standard": (38, 43, 48, 53, 57, 62),
    "dadgad": (38, 45, 50, 55, 57, 62),
    "open-g": (38, 43, 50, 55, 59, 62),
    "open-d": (38, 45, 50, 54, 57, 62),
}
_STD = TUNING_MIDI["standard"]
_SHARP = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


class TabUnavailable(RuntimeError):
    """basic-pitch isn't installed — surfaced to the client as HTTP 501."""


@lru_cache(maxsize=1)
def _predict():
    try:
        from basic_pitch.inference import predict  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - optional dep
        raise TabUnavailable(
            "basic-pitch is not installed — see engine/requirements.txt"
        ) from exc
    return predict


@dataclass
class Note:
    start: float
    midi: int
    amp: float


def transcribe_notes(audio_path: str) -> list[Note]:
    predict = _predict()
    _, _, raw = predict(
        audio_path,
        onset_threshold=0.55,
        frame_threshold=0.30,
        minimum_note_length=90.0,  # ms — drop pick-noise blips
        minimum_frequency=73.0,  # ~D2, below a dropped low string
        maximum_frequency=1320.0,  # ~E6, 24th fret of the high e
        multiple_pitch_bends=False,
        melodia_trick=True,
    )
    notes = [Note(round(s, 3), int(m), float(a)) for s, _e, m, a, *_ in raw]
    if not notes:
        return []

    amps = sorted(n.amp for n in notes)
    floor = amps[len(amps) // 4] * 0.5
    notes = [n for n in notes if n.amp >= floor]
    notes.sort(key=lambda n: (n.start, -n.midi))
    return notes


# --- chord helpers ---------------------------------------------------------

_NAT = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_OPEN_STD: dict[str, tuple[int | None, ...]] = {
    "C": (None, 3, 2, 0, 1, 0),
    "A": (None, 0, 2, 2, 2, 0),
    "G": (3, 2, 0, 0, 0, 3),
    "E": (0, 2, 2, 1, 0, 0),
    "D": (None, None, 0, 2, 3, 2),
    "Am": (None, 0, 2, 2, 1, 0),
    "Em": (0, 2, 2, 0, 0, 0),
    "Dm": (None, None, 0, 2, 3, 1),
}
_E_MAJ, _E_MIN = (0, 2, 2, 1, 0, 0), (0, 2, 2, 0, 0, 0)
_A_MAJ, _A_MIN = (None, 0, 2, 2, 2, 0), (None, 0, 2, 2, 1, 0)


def _root_pc(root: str) -> int | None:
    m = re.match(r"^([A-G])([#b]?)$", root)
    if not m:
        return None
    return (_NAT[m.group(1)] + {"#": 1, "b": -1, "": 0}[m.group(2)]) % 12


def chord_pitch_classes(label: str | None) -> frozenset[int]:
    m = re.match(r"^([A-G][#b]?)(m?)$", label or "")
    if not m:
        return frozenset()
    pc = _root_pc(m.group(1))
    if pc is None:
        return frozenset()
    third = 3 if m.group(2) == "m" else 4
    return frozenset({pc, (pc + third) % 12, (pc + 7) % 12})


def _standard_shape(label: str) -> tuple[int | None, ...] | None:
    m = re.match(r"^([A-G][#b]?)(m?)$", label)
    if not m:
        return None
    root, minor = m.group(1), m.group(2)
    if label in _OPEN_STD:
        return _OPEN_STD[label]
    pc = _root_pc(root)
    if pc is None:
        return None
    e_fret, a_fret = (pc - 4) % 12, (pc - 9) % 12
    if e_fret >= 1 and (e_fret <= a_fret or a_fret < 1):
        tmpl, base = (_E_MIN if minor else _E_MAJ), e_fret
    else:
        tmpl, base = (_A_MIN if minor else _A_MAJ), max(a_fret, 1)
    return tuple(None if x is None else x + base for x in tmpl)


@lru_cache(maxsize=256)
def chord_grip(label: str | None, open_midi: tuple[int, ...]) -> tuple[tuple[int, int], ...]:
    """(string, fret) positions of the chord's home voicing in this tuning."""
    if not label:
        return ()
    if open_midi == _STD:
        shp = _standard_shape(label)
        return tuple((s, f) for s, f in enumerate(shp) if f is not None) if shp else ()

    pcs = chord_pitch_classes(label)
    if not pcs:
        return ()
    m = re.match(r"^([A-G][#b]?)", label)
    root = _root_pc(m.group(1)) if m else None
    best: tuple[float, tuple[tuple[int, int], ...]] | None = None
    for base in range(12):
        pos: list[tuple[int, int]] = []
        for si, om in enumerate(open_midi):
            for f in range(base, base + 4):
                if f >= 0 and (om + f) % 12 in pcs:
                    pos.append((si, f))
                    break
        if len(pos) < 3:
            continue
        frets = [f for _, f in pos if f > 0]
        if len(frets) >= 2 and max(frets) - min(frets) > 4:
            continue
        bass = (open_midi[pos[0][0]] + pos[0][1]) % 12
        score = len(pos) * 2 + (1.5 if bass == root else 0) - base * 0.55
        if best is None or score > best[0]:
            best = (score, tuple(pos))
    return best[1] if best else ()


# --- event building ------------------------------------------------------

_HARMONIC_INTERVALS = (12, 19, 24, 28, 31)


def _clean_event(notes: list[Note], pcs: frozenset[int]) -> list[Note]:
    """Drop overtones of louder notes, very quiet notes, and quiet notes that
    aren't in the chord under this beat (bleed from voice / other instruments)."""
    notes = sorted(notes, key=lambda n: -n.amp)
    peak = notes[0].amp
    kept: list[Note] = []
    for n in notes:
        if n.amp < 0.4 * peak:
            continue
        if any(
            (n.midi - k.midi) in _HARMONIC_INTERVALS and n.amp < 0.75 * k.amp
            for k in kept
        ):
            continue
        if pcs and (n.midi % 12) not in pcs and n.amp < 0.7 * peak:
            continue
        kept.append(n)
    return sorted(kept, key=lambda n: -n.midi)[:6]


def _chord_at(t: float, chords: list[dict]) -> str | None:
    for c in chords:
        if c["start"] <= t < c["end"]:
            lbl = c.get("label")
            return lbl if lbl and lbl != "N" else None
    return None


def _events(notes: list[Note], chords: list[dict], merge: float = 0.07):
    raw: list[list[Note]] = []
    for n in notes:
        if raw and n.start - raw[-1][0].start <= merge:
            raw[-1].append(n)
        else:
            raw.append([n])

    out: list[tuple[list[Note], str | None]] = []
    for group in raw:
        label = _chord_at(group[0].start, chords)
        cleaned = _clean_event(group, chord_pitch_classes(label))
        if cleaned:
            out.append((cleaned, label))
    return out


def _is_strum(notes: list[Note], pcs: frozenset[int]) -> bool:
    if len(notes) < 3 or not pcs:
        return False
    hits = sum(1 for n in notes if n.midi % 12 in pcs)
    return hits >= max(3, round(0.6 * len(notes)))


# --- fretboard assignment ----------------------------------------------

def _voicings(
    midis: list[int],
    open_midi: tuple[int, ...],
    prev_centre: float | None,
    grip: tuple[tuple[int, int], ...],
) -> list[tuple[float, list[tuple[int, int]]]]:
    ms = sorted(set(midis), reverse=True)[:6]
    grip_map = dict(grip)
    grip_frets = [f for _, f in grip if f > 0]
    grip_centre = sum(grip_frets) / len(grip_frets) if grip_frets else None
    out: list[tuple[float, list[tuple[int, int]]]] = []

    def rec(i: int, used: int, chosen: list[tuple[int, int]]) -> None:
        if i == len(ms):
            fretted = [f for _, f in chosen if f > 0]
            span = max(fretted) - min(fretted) if len(fretted) >= 2 else 0
            if span > 5:
                return
            centre = sum(fretted) / len(fretted) if fretted else (prev_centre or 0.0)
            cost = span * 1.4 + centre * 0.5
            cost += sum(max(0, f - 5) for _, f in chosen) * 0.4
            if prev_centre is not None:
                cost += min(abs(centre - prev_centre), 10) * 0.4
            if grip_map:  # pull toward the chord's grip
                cost += sum(0.0 if grip_map.get(s) == f else 2.2 for s, f in chosen)
                if grip_centre is not None:
                    cost += abs(centre - grip_centre) * 1.4
            out.append((cost, sorted(chosen)))
            return
        m = ms[i]
        for s in range(6):
            if used & (1 << s):
                continue
            f = m - open_midi[s]
            if 0 <= f <= MAX_FRET:
                rec(i + 1, used | (1 << s), [*chosen, (s, f)])

    rec(0, 0, [])
    out.sort(key=lambda x: x[0])
    return out[:6]


@dataclass
class TabEvent:
    time: float
    positions: list[tuple[int, int]]  # (string index 0=low, fret)


def _centre(positions) -> float | None:
    fr = [f for _, f in positions if f > 0]
    return sum(fr) / len(fr) if fr else None


def assign_fretboard(events, open_midi: tuple[int, ...]) -> list[TabEvent]:
    beam: list[tuple[float, list[TabEvent], float | None]] = [(0.0, [], None)]
    for cleaned, label in events:
        t = cleaned[0].start
        pcs = chord_pitch_classes(label)

        # A strum of the detected chord → write the chord's grip.
        if label and _is_strum(cleaned, pcs):
            grip = list(chord_grip(label, open_midi))
            if len(grip) >= 3:
                gc = _centre(grip)
                beam = [
                    (total, [*path, TabEvent(t, grip)], gc if gc is not None else centre)
                    for total, path, centre in beam
                ]
                continue

        grip = chord_grip(label, open_midi) if label else ()
        midis = [n.midi for n in cleaned]
        nxt: list[tuple[float, list[TabEvent], float | None]] = []
        for total, path, centre in beam:
            options = _voicings(midis, open_midi, centre, grip)
            if not options:
                nxt.append((total, path, centre))
                continue
            for cost, pos in options:
                nc = _centre(pos)
                nxt.append(
                    (total + cost, [*path, TabEvent(t, pos)], nc if nc is not None else centre)
                )
        nxt.sort(key=lambda x: x[0])
        beam = nxt[:12]
    return beam[0][1] if beam else []


# --- render -----------------------------------------------------------

def _labels(open_midi: tuple[int, ...]) -> list[str]:
    out = [_SHARP[m % 12] for m in open_midi]
    out[-1] = out[-1].lower()
    return out


def render(events: list[TabEvent], open_midi: tuple[int, ...], bpm: float | None) -> str:
    if not events:
        return ""

    step = 60.0 / bpm / 4.0 if bpm and bpm > 30 else 0.25  # sixteenth-note grid
    col = 3
    slots_per_bar = 16
    bars_per_line = 2

    slot_of: dict[int, TabEvent] = {}
    for ev in events:
        s = max(0, round(ev.time / step))
        while s in slot_of:
            s += 1
        slot_of[s] = ev
    total = max(slot_of) + 1
    labels = _labels(open_midi)

    blocks: list[str] = []
    line_slots = slots_per_bar * bars_per_line
    for line_start in range(0, total, line_slots):
        line_end = min(line_start + line_slots, total)
        rows = ["" for _ in range(6)]
        for slot in range(line_start, line_end):
            barline = slot % slots_per_bar == 0 and slot != line_start
            ev = slot_of.get(slot)
            for si in range(6):
                if barline:
                    rows[si] += "|"
                cell = "-" * col
                if ev:
                    for s, f in ev.positions:
                        if s == si:
                            cell = f"-{f}".ljust(col, "-")[:col]
                rows[si] += cell
        block = [f"{labels[si].rjust(2)}|-{rows[si]}|" for si in range(5, -1, -1)]
        blocks.append("\n".join(block))

    return "\n\n".join(blocks)


def build_tab(
    audio_path: str,
    *,
    tuning: str = "standard",
    bpm: float | None = None,
    chords: list[dict] | None = None,
) -> dict:
    open_midi = TUNING_MIDI.get(tuning, _STD)
    notes = transcribe_notes(audio_path)
    events = _events(notes, chords or [])
    return {
        "ascii": render(assign_fretboard(events, open_midi), open_midi, bpm),
        "note_count": len(notes),
        "bpm": bpm,
    }

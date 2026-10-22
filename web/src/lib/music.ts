/**
 * Chord transposition + capo helpers.
 *
 * Labels parse as an `A–G` root with an optional `#`/`b`; whatever suffix follows
 * (`m`, `7`, `maj7`, `sus4`, …) is kept as-is, so any engine vocabulary transposes.
 */

import { hasOpenShape } from "./chordShapes";

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

interface ParsedChord {
  rootIndex: number;
  suffix: string;
}

function parseChord(label: string): ParsedChord | null {
  const m = /^([A-G])([#b]?)(.*)$/.exec(label);
  if (!m) return null;
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return { rootIndex: (NATURAL[m[1]] + accidental + 12) % 12, suffix: m[3] };
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Shift a chord label by `semitones` (may be negative). `"N"` passes through. */
export function transposeChord(label: string, semitones: number, preferFlats = false): string {
  const parsed = parseChord(label);
  if (!parsed) return label;
  const names = preferFlats ? FLAT : SHARP;
  return names[mod12(parsed.rootIndex + semitones)] + parsed.suffix;
}

/** Shift a key label like `"C major"` / `"A minor"`. */
export function transposeKey(
  key: string | null,
  semitones: number,
  preferFlats = false,
): string | null {
  if (!key) return null;
  const m = /^([A-G][#b]?)\s+(major|minor)$/i.exec(key.trim());
  if (!m) return key;
  return `${transposeChord(m[1], semitones, preferFlats)} ${m[2].toLowerCase()}`;
}


export interface CapoSuggestion {
  /** Fret to clamp the capo at (0 = none). */
  fret: number;
  /** The chord shapes you'd finger with the capo on. */
  shapes: string[];
  /** Key those shapes are in. */
  shapeKey: string | null;
  openCount: number;
  total: number;
  coversAll: boolean;
}

function suggestionAt(distinct: string[], key: string | null, fret: number): CapoSuggestion {
  const shapes = distinct.map((c) => transposeChord(c, -fret));
  // A chord counts as "open" if it has a hand-tuned no-barre voicing.
  const openCount = shapes.filter(hasOpenShape).length;
  return {
    fret,
    shapes,
    shapeKey: transposeKey(key, -fret),
    openCount,
    total: distinct.length,
    coversAll: openCount === distinct.length,
  };
}

/**
 * Find the capo position (0–7) that turns the most of `chords` into open shapes.
 * A higher fret is only preferred when it clearly helps — each fret costs ~⅓ of
 * an open chord in the score — and a capo is only *suggested* if it beats open
 * position outright. `chords` and `key` are the *sounding* chords, i.e. after
 * any transpose the user has dialled in.
 */
export function suggestCapo(chords: string[], key: string | null): CapoSuggestion | null {
  const distinct = [...new Set(chords.filter((c) => c && c !== "N"))];
  if (distinct.length === 0) return null;

  const open = suggestionAt(distinct, key, 0);
  let best = open;
  let bestScore = open.openCount;
  for (let fret = 1; fret <= 7; fret++) {
    const s = suggestionAt(distinct, key, fret);
    const score = s.openCount - fret / 3;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  // Don't nudge someone up the neck for no gain in open chords.
  return best.fret > 0 && best.openCount <= open.openCount ? open : best;
}

export interface TuneDownSuggestion {
  /** Semitones to tune every string down (1 = E♭ standard, 2 = D standard). */
  semitones: 1 | 2;
  /** Preset id in `lib/tuning.ts`. */
  tuningId: "eb-standard" | "d-standard";
  shapes: string[];
  shapeKey: string | null;
  openCount: number;
  total: number;
  coversAll: boolean;
}

/**
 * Songs recorded with the guitar tuned down (very common in rock and blues) come
 * out in E♭ or D with awkward barre chords — no capo fixes that, because a capo
 * only raises pitch. If tuning the whole guitar down ½ or 1 step turns clearly
 * more of the chords into open shapes than the best capo option does, suggest it.
 */
export function suggestTuneDown(chords: string[], key: string | null): TuneDownSuggestion | null {
  const distinct = [...new Set(chords.filter((c) => c && c !== "N"))];
  if (distinct.length === 0) return null;
  const capo = suggestCapo(chords, key);
  const capoOpen = capo ? capo.openCount - capo.fret / 3 : 0;

  let best: TuneDownSuggestion | null = null;
  for (const semitones of [1, 2] as const) {
    const s = suggestionAt(distinct, key, -semitones);
    // Each step of retuning costs a little more than a capo fret (you have to
    // retune back afterwards), so it must clearly win.
    if (s.openCount - semitones / 2 <= capoOpen) continue;
    if (best && s.openCount <= best.openCount) continue;
    best = {
      semitones,
      tuningId: semitones === 1 ? "eb-standard" : "d-standard",
      shapes: s.shapes,
      shapeKey: s.shapeKey,
      openCount: s.openCount,
      total: s.total,
      coversAll: s.coversAll,
    };
  }
  return best;
}

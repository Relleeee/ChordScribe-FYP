/**
 * Chord transposition + capo helpers.
 *
 * The engine only emits major (`"C"`) and minor (`"Cm"`) triads plus `"N"`, but
 * these parse any `A–G` root with an optional `#`/`b` and keep whatever suffix
 * follows, so they're safe if the vocabulary grows.
 */

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

// Chords a beginner can play in open position. Suggestions steer toward these.
const OPEN_SHAPES = new Set(["C", "D", "E", "G", "A", "Am", "Dm", "Em"]);

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
  const openCount = shapes.filter((c) => OPEN_SHAPES.has(c)).length;
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

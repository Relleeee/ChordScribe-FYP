/**
 * Guitar fingerings for the major/minor triads the app shows.
 *
 * Frets are low-E → high-e (index 0 = low E string): `null` = don't play,
 * `0` = open, otherwise an absolute fret. In standard tuning the hand-tuned open
 * shapes are used and everything else is a movable E-shape or A-shape barre —
 * exactly how a guitarist would play them. For any other tuning
 * (`lib/tuning.ts`) the shape is solved from the open-string pitches.
 */

import { STANDARD, isStandard, type Tuning } from "./tuning";

const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface ChordShape {
  /** 6 entries, low E → high e. */
  frets: (number | null)[];
  /** Lowest fret in the diagram window (1 for open chords). */
  baseFret: number;
  /** True when the index finger bars across at `baseFret`. */
  barre: boolean;
}

function pitchClass(root: string): number | null {
  const m = /^([A-G])([#b]?)$/.exec(root);
  if (!m) return null;
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (NATURAL[m[1]] + acc + 12) % 12;
}

// Distance (semitones) from the open string to a given pitch class.
const fromOpen = (openPc: number, targetPc: number) => (targetPc - openPc + 12) % 12;

const OPEN: Record<string, (number | null)[]> = {
  C: [null, 3, 2, 0, 1, 0],
  A: [null, 0, 2, 2, 2, 0],
  G: [3, 2, 0, 0, 0, 3],
  E: [0, 2, 2, 1, 0, 0],
  D: [null, null, 0, 2, 3, 2],
  Am: [null, 0, 2, 2, 1, 0],
  Em: [0, 2, 2, 0, 0, 0],
  Dm: [null, null, 0, 2, 3, 1],
};

// Movable barre templates, relative to the barre fret.
const E_MAJOR = [0, 2, 2, 1, 0, 0];
const E_MINOR = [0, 2, 2, 0, 0, 0];
const A_MAJOR = [null, 0, 2, 2, 2, 0];
const A_MINOR = [null, 0, 2, 2, 1, 0];

function barreShape(template: (number | null)[], fret: number): ChordShape {
  return {
    frets: template.map((n) => (n === null ? null : n + fret)),
    baseFret: fret,
    barre: true,
  };
}

function standardShape(root: string, minor: string): ChordShape | null {
  const key = `${root}${minor}`;
  if (OPEN[key]) return { frets: OPEN[key], baseFret: 1, barre: false };

  const pc = pitchClass(root);
  if (pc === null) return null;

  const eFret = fromOpen(NATURAL.E, pc); // root on the low-E string
  const aFret = fromOpen(NATURAL.A, pc); // root on the A string

  // Prefer whichever barre sits lower on the neck (ties to the E-shape).
  const useE = eFret >= 1 && (eFret <= aFret || aFret < 1);
  return useE
    ? barreShape(minor ? E_MINOR : E_MAJOR, eFret)
    : barreShape(minor ? A_MINOR : A_MAJOR, Math.max(aFret, 1));
}

const MAJOR_INTERVALS = [0, 4, 7];
const MINOR_INTERVALS = [0, 3, 7];

/**
 * Adapt the standard-tuning shape to another tuning the way a guitarist does:
 *
 * - A uniform retune (E♭, D standard) is played with the *same* shapes — only
 *   the pitch drops — so the standard shape is returned unchanged.
 * - When only some strings move (Drop D, DADGAD, Open G…), the unchanged strings
 *   keep their fret and each retuned string is re-fretted to the nearest chord
 *   tone within reach, or muted if there isn't one.
 *
 * Not a full chord dictionary, but it produces the voicings players actually use
 * for the common tunings.
 */
function adaptShape(root: string, minor: string, tuning: Tuning): ChordShape | null {
  const base = standardShape(root, minor);
  const rootPc = pitchClass(root);
  if (!base || rootPc === null) return null;

  const deltas = tuning.pitches.map(
    (p, i) => (((p - STANDARD.pitches[i]) % 12) + 12) % 12,
  );
  if (deltas.every((d) => d === deltas[0])) return base;

  const tones = new Set(
    (minor === "m" ? MINOR_INTERVALS : MAJOR_INTERVALS).map((i) => (rootPc + i) % 12),
  );
  const ceiling = base.baseFret + 4;

  const frets = base.frets.map((f, i) => {
    if (deltas[i] === 0 || f === null) return f;
    // Same absolute pitch on the retuned string…
    const shifted = ((f - deltas[i]) % 12 + 12) % 12;
    if (shifted <= ceiling && tones.has((tuning.pitches[i] + shifted) % 12)) return shifted;
    // …otherwise the lowest chord tone in the first few frets, or mute.
    for (let g = 0; g <= 5; g++) {
      if (tones.has((tuning.pitches[i] + g) % 12)) return g;
    }
    return null;
  });

  const droppedBass = deltas[0] !== 0 || deltas[1] !== 0;
  return { frets, baseFret: base.baseFret, barre: base.barre && !droppedBass };
}

export interface NamedShape extends ChordShape {
  /** Human label for the voicing, e.g. "Open", "E-shape barre". */
  name: string;
}

/**
 * Every voicing worth showing for a chord, easiest first: the open shape if one
 * exists, then the movable E-shape and A-shape barres. Non-standard tunings get
 * the single adapted shape.
 */
export function getChordShapes(label: string, tuning: Tuning = STANDARD): NamedShape[] {
  const m = /^([A-G][#b]?)(m?)$/.exec(label);
  if (!m) return [];
  const [, root, minor] = m;

  if (!isStandard(tuning)) {
    const s = adaptShape(root, minor, tuning);
    return s ? [{ ...s, name: tuning.name.replace(/\s*\(.*\)\s*/, "") }] : [];
  }

  const pc = pitchClass(root);
  if (pc === null) return [];

  const out: NamedShape[] = [];
  const key = `${root}${minor}`;
  if (OPEN[key]) out.push({ frets: OPEN[key], baseFret: 1, barre: false, name: "Open" });

  const eFret = fromOpen(NATURAL.E, pc); // root on the low-E string
  if (eFret >= 1) {
    out.push({ ...barreShape(minor ? E_MINOR : E_MAJOR, eFret), name: "E-shape barre" });
  }
  const aFret = fromOpen(NATURAL.A, pc); // root on the A string
  if (aFret >= 1) {
    out.push({ ...barreShape(minor ? A_MINOR : A_MAJOR, aFret), name: "A-shape barre" });
  }

  return out.sort((a, b) => a.baseFret - b.baseFret).slice(0, 3);
}

/** The primary (easiest) fingering for a chord in the given tuning. */
export function getChordShape(label: string, tuning: Tuning = STANDARD): ChordShape | null {
  return getChordShapes(label, tuning)[0] ?? null;
}

/** Played string indices (low → high) for a shape, or [] if unplayable. */
function playedStrings(shape: ChordShape): number[] {
  return shape.frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
}

/**
 * Write a chord progression as a fingerpicking arrangement in ASCII tab: a
 * rolling arpeggio (bass → up → alternate bass → down) applied to each detected
 * chord. The engine reads chords, not individual notes, so this is a *playable
 * pattern over the chords* — not a transcription of the exact picking on the
 * recording.
 */
export function chordsToFingerpickTab(
  chords: { label: string; start: number }[],
  tuning: Tuning = STANDARD,
  perRow = 2,
): string {
  const STEP = 3; // characters per plucked note
  const PLUCKS = 8; // notes per chord (one bar of eighth-notes)

  const cells = chords.map((c) => {
    const shape = getChordShape(c.label, tuning);
    if (!shape) return null;
    const played = playedStrings(shape);
    if (played.length === 0) return null;

    const bass = played[0];
    const altBass = played.find((i) => i > bass && i <= 3) ?? played[Math.min(1, played.length - 1)];
    const treble = played.slice(-3);
    while (treble.length < 3) treble.unshift(treble[0]);
    const [t0, t1, t2] = treble;

    // bass, up the top three, alt-bass, back down
    const sequence = [bass, t0, t1, t2, altBass, t2, t1, t0];
    return { label: c.label, shape, sequence };
  });

  const rows: string[] = [];
  const chordWidth = PLUCKS * STEP;
  const stringLabels = tuning.labels;

  for (let i = 0; i < cells.length; i += perRow) {
    const chunk = cells.slice(i, i + perRow);

    const header = "   " + chunk.map((c) => (c?.label ?? "·").padEnd(chordWidth)).join("");

    const stringLines = stringLabels.map((sl, stringIdx) => {
      let body = "";
      for (const c of chunk) {
        for (let p = 0; p < PLUCKS; p++) {
          if (c && c.sequence[p] === stringIdx) {
            const fret = c.shape.frets[stringIdx];
            const token = fret === null ? "x" : String(fret);
            body += ("-" + token).padEnd(STEP, "-").slice(0, STEP);
          } else {
            body += "-".repeat(STEP);
          }
        }
      }
      return `${sl.padStart(2)}|-${body}|`;
    });
    stringLines.reverse();

    rows.push([header, ...stringLines].join("\n"));
  }

  return rows.join("\n\n");
}

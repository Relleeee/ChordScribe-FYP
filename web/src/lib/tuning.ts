/**
 * Guitar tunings for the chord diagrams and the fingerpicking tab.
 *
 * The engine reads chords from chroma, which is tuning-agnostic — so tuning only
 * affects how a chord is *fingered*, never what chord is detected. Everything
 * here is 6 strings, low → high.
 */

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface Tuning {
  /** Stable id stored on the analysis. */
  id: string;
  name: string;
  /** Open-string pitch classes, low → high (0 = C). Standard = E A D G B E. */
  pitches: number[];
  /** Row labels for the tab, low → high. */
  labels: string[];
}

/** E A D G B E */
const STANDARD_PITCHES = [4, 9, 2, 7, 11, 4];

function labelsFor(pitches: number[]): string[] {
  // Low string uppercase, high e lowercase, to match the classic tab look.
  return pitches.map((p, i) => {
    const n = SHARP[((p % 12) + 12) % 12];
    return i === pitches.length - 1 ? n.toLowerCase() : n;
  });
}

function make(id: string, name: string, pitches: number[]): Tuning {
  return { id, name, pitches, labels: labelsFor(pitches) };
}

export const STANDARD = make("standard", "Standard (E A D G B E)", STANDARD_PITCHES);

export const TUNINGS: Tuning[] = [
  STANDARD,
  make("drop-d", "Drop D (D A D G B E)", [2, 9, 2, 7, 11, 4]),
  make("drop-c", "Drop C (C G C F A D)", [0, 7, 0, 5, 9, 2]),
  make("eb-standard", "Half step down (E♭)", [3, 8, 1, 6, 10, 3]),
  make("d-standard", "Full step down (D)", [2, 7, 0, 5, 9, 2]),
  make("dadgad", "DADGAD (D A D G A D)", [2, 9, 2, 7, 9, 2]),
  make("open-g", "Open G (D G D G B D)", [2, 7, 2, 7, 11, 2]),
  make("open-d", "Open D (D A D F♯ A D)", [2, 9, 2, 6, 9, 2]),
];

const BY_ID = new Map(TUNINGS.map((t) => [t.id, t]));

/** Parse a "c,g,c,f,a,d" custom spec into a Tuning, or null if malformed. */
export function parseCustomTuning(spec: string): Tuning | null {
  const parts = spec.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 6) return null;
  const pitches: number[] = [];
  for (const part of parts) {
    const m = /^([A-Ga-g])([#b]?)$/.exec(part.trim());
    if (!m) return null;
    const nat: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
    pitches.push((nat[m[1].toUpperCase()] + acc + 12) % 12);
  }
  return make(`custom:${pitches.join(",")}`, "Custom", pitches);
}

/** Resolve a stored tuning value (preset id, custom spec, or null) to a Tuning. */
export function resolveTuning(value: string | null | undefined): Tuning {
  if (!value) return STANDARD;
  const preset = BY_ID.get(value);
  if (preset) return preset;
  if (value.startsWith("custom:")) {
    return parseCustomTuning(value.slice("custom:".length).replace(/,/g, " ")) ?? STANDARD;
  }
  return parseCustomTuning(value) ?? STANDARD;
}

export const isStandard = (t: Tuning) => t.id === "standard";

// MIDI note numbers of the standard open strings: E2 A2 D3 G3 B3 E4.
const STANDARD_MIDI = [40, 45, 50, 55, 59, 64];

const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Target frequency (Hz) of each open string for `t`, low → high. Alternate
 *  tunings are placed by the *nearest* semitone move from the standard string,
 *  which covers every preset here (Drop D, E♭, DADGAD, Open G/D…). */
export function stringTargets(
  t: Tuning,
): { name: string; octave: number; freq: number }[] {
  return t.pitches.map((pc, i) => {
    const raw = ((pc - STANDARD.pitches[i]) % 12 + 18) % 12 - 6; // −6…+5 semitones
    const midi = STANDARD_MIDI[i] + raw;
    return {
      name: SHARP[((midi % 12) + 12) % 12],
      octave: Math.floor(midi / 12) - 1,
      freq: midiToFreq(midi),
    };
  });
}

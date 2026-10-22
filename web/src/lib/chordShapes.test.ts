import { describe, expect, it } from "vitest";
import { getChordShape, getChordShapes, hasOpenShape } from "./chordShapes";
import { STANDARD, TUNINGS, resolveTuning, uniformDrop } from "./tuning";

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pc = (root: string) =>
  (NOTE[root[0]] + (root[1] === "#" ? 1 : root[1] === "b" ? -1 : 0) + 12) % 12;
const QUALITY: Record<string, number[]> = {
  "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
};

/** Pitch classes actually sounded by a shape in a tuning. */
function sounded(frets: (number | null)[], pitches: number[]): Set<number> {
  const out = new Set<number>();
  frets.forEach((f, i) => {
    if (f !== null) out.add((pitches[i] + f) % 12);
  });
  return out;
}

const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

describe("getChordShapes (standard tuning)", () => {
  it("puts the open shape first when there is one", () => {
    const [first] = getChordShapes("C");
    expect(first.name).toBe("Open");
    expect(first.frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(hasOpenShape("C")).toBe(true);
  });

  it("uses a barre for chords with no open voicing", () => {
    expect(hasOpenShape("F#m")).toBe(false);
    expect(getChordShape("F#m")?.barre).toBe(true);
  });

  it("returns nothing for unsupported labels and no-chord", () => {
    expect(getChordShapes("N")).toEqual([]);
    expect(getChordShapes("C13#11")).toEqual([]);
  });

  it("orders voicings from the lowest fret up and caps them at 3", () => {
    for (const root of ROOTS) {
      const shapes = getChordShapes(root);
      expect(shapes.length).toBeGreaterThan(0);
      expect(shapes.length).toBeLessThanOrEqual(3);
      const bases = shapes.map((s) => s.baseFret);
      expect([...bases].sort((a, b) => a - b)).toEqual(bases);
    }
  });

  // The important property: every voicing sounds only notes of the chord,
  // and always includes the root and the third (which decides major/minor).
  for (const [quality, intervals] of Object.entries(QUALITY)) {
    it(`every ${quality || "major"} voicing plays only chord tones`, () => {
      for (const root of ROOTS) {
        const allowed = new Set(intervals.map((iv) => (pc(root) + iv) % 12));
        for (const shape of getChordShapes(root + quality)) {
          const notes = sounded(shape.frets, STANDARD.pitches);
          for (const n of notes) expect(allowed, `${root}${quality} ${shape.name}`).toContain(n);
          expect(notes).toContain(pc(root));
          expect(notes).toContain((pc(root) + intervals[1]) % 12);
        }
      }
    });
  }
});

describe("getChordShapes (alternate tunings)", () => {
  // A whole-guitar retune (E♭, D standard) keeps the familiar shapes — players
  // read the chart "as if" in standard, and the pitch just drops.
  const uniform = (t: (typeof TUNINGS)[number]) =>
    new Set(t.pitches.map((p, i) => (p - STANDARD.pitches[i] + 12) % 12)).size === 1;

  it("keeps standard shapes for a uniform retune", () => {
    for (const tuning of TUNINGS.slice(1).filter(uniform)) {
      expect(getChordShape("C", tuning)?.frets).toEqual(getChordShape("C")?.frets);
    }
  });

  it("re-fingers chords for partial retunes so they still sound right", () => {
    for (const tuning of TUNINGS.slice(1).filter((t) => !uniform(t))) {
      for (const label of ["C", "G", "D", "Am", "Em"]) {
        const shape = getChordShape(label, tuning);
        expect(shape, `${label} in ${tuning.id}`).not.toBeNull();
        const root = label.replace("m", "");
        const intervals = QUALITY[label.endsWith("m") ? "m" : ""];
        const allowed = new Set(intervals.map((iv) => (pc(root) + iv) % 12));
        for (const n of sounded(shape!.frets, tuning.pitches)) {
          expect(allowed, `${label} in ${tuning.id}`).toContain(n);
        }
      }
    }
  });
});

describe("resolveTuning", () => {
  it("resolves presets, custom specs and junk", () => {
    expect(resolveTuning(null).id).toBe("standard");
    expect(resolveTuning("drop-d").pitches).toEqual([2, 9, 2, 7, 11, 4]);
    expect(resolveTuning("c,g,c,f,a,d").pitches).toEqual([0, 7, 0, 5, 9, 2]);
    expect(resolveTuning("not a tuning").id).toBe("standard");
  });
});

describe("uniformDrop", () => {
  it("measures whole-guitar retunes only", () => {
    expect(uniformDrop(resolveTuning("standard"))).toBe(0);
    expect(uniformDrop(resolveTuning("eb-standard"))).toBe(1);
    expect(uniformDrop(resolveTuning("d-standard"))).toBe(2);
    expect(uniformDrop(resolveTuning("drop-d"))).toBe(0);
    expect(uniformDrop(resolveTuning("open-g"))).toBe(0);
  });
});

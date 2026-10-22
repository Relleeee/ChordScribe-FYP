import { describe, expect, it } from "vitest";
import { barText, buildBars, tempoGrid } from "./bars";

const seg = (start: number, end: number, label: string) => ({ start, end, label, confidence: 1 });
const beats = (n: number, period = 0.5) => Array.from({ length: n }, (_, i) => i * period);

describe("buildBars", () => {
  it("lays chords on a 4/4 grid with a pickup bar", () => {
    // 1-beat pickup on N, then G for a bar, then C/G split, then Am.
    const segments = [seg(0, 0.5, "N"), seg(0.5, 2.5, "G"), seg(2.5, 3.5, "C"), seg(3.5, 4.5, "G"), seg(4.5, 6.5, "Am")];
    const sheet = buildBars(segments, { beats: beats(13), beatsPerBar: 4, firstDownbeat: 1, confidence: 1 }, 6.5);
    expect(sheet.bars.map(barText)).toEqual(["G . . .", "C . G .", "Am . . ."]);
    expect(sheet.bars[0].start).toBe(0.5);
  });

  it("repeats a held chord at the start of each bar", () => {
    const sheet = buildBars([seg(0, 4, "D")], { beats: beats(8), beatsPerBar: 4, firstDownbeat: 0, confidence: 1 }, 4);
    expect(sheet.bars.map(barText)).toEqual(["D . . .", "D . . ."]);
  });

  it("supports 3/4", () => {
    const sheet = buildBars(
      [seg(0, 1.5, "C"), seg(1.5, 3, "F")],
      { beats: beats(6), beatsPerBar: 3, firstDownbeat: 0, confidence: 0.9 },
      3,
    );
    expect(sheet.bars.map(barText)).toEqual(["C . .", "F . ."]);
    expect(sheet.confidence).toBe(0.9);
  });
});

describe("tempoGrid", () => {
  it("builds a 4/4 grid from the BPM starting at the first chord", () => {
    const grid = tempoGrid([seg(0, 1, "N"), seg(1, 5, "C")], 120, 5);
    expect(grid?.beats.slice(0, 3)).toEqual([1, 1.5, 2]);
    expect(grid?.beatsPerBar).toBe(4);
  });

  it("returns null without a tempo", () => {
    expect(tempoGrid([seg(0, 4, "C")], null, 4)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { safeFilename, toChordPro, toPlainText, type SheetMeta } from "./chordSheet";
import { layoutLyrics } from "./lyricsLayout";

const seg = (start: number, end: number, label: string) => ({ start, end, label, confidence: 1 });
const meta: SheetMeta = { title: "Song", key: "G major", bpm: 96.4, capo: 2, tuning: null };

const segments = [seg(0, 4, "G"), seg(4, 8, "C"), seg(8, 10, "C"), seg(10, 12, "N"), seg(12, 16, "D")];

describe("layoutLyrics", () => {
  it("places chords proportionally without word timings", () => {
    const layout = layoutLyrics({
      segments,
      durationSec: 16,
      lyrics: "first line here\nsecond line",
      alignment: null,
      words: null,
    });
    expect(layout.timed).toBe(false);
    expect(layout.chords.map((c) => c.label)).toEqual(["G", "C", "D"]);
    expect(layout.byLine.get(0)?.[0]).toMatchObject({ label: "G", ch: 0 });
  });

  it("puts chords outside the sung words on instrumental rows", () => {
    const layout = layoutLyrics({
      segments: [seg(0, 5, "Em"), seg(5, 8, "G"), seg(30, 34, "C")],
      durationSec: 34,
      lyrics: "hello world",
      alignment: null,
      words: [
        { t: 5, w: "hello" },
        { t: 6, w: "world" },
      ],
    });
    expect(layout.instrRows.get(-1)?.map((c) => c.label)).toEqual(["Em"]);
    expect(layout.byLine.get(0)?.map((c) => c.label)).toEqual(["G"]);
    expect(layout.instrRows.get(0)?.map((c) => c.label)).toEqual(["C"]);
  });

  it("honours a manual placement", () => {
    const layout = layoutLyrics({
      segments: [seg(0, 4, "A")],
      durationSec: 4,
      lyrics: "one two three",
      alignment: { placements: [{ t: 0, line: 0, ch: 8 }] },
      words: null,
    });
    expect(layout.placed[0].ch).toBe(8);
  });
});

describe("toChordPro", () => {
  it("writes directives and a chord-only body when there are no lyrics", () => {
    const out = toChordPro(meta, segments, null);
    expect(out).toBe("{title: Song}\n{key: G}\n{tempo: 96}\n{capo: 2}\n\n[G] [C] [D]\n");
  });

  it("inlines chords into lyric lines", () => {
    const layout = layoutLyrics({
      segments: [seg(0, 4, "Am")],
      durationSec: 4,
      lyrics: "hello there",
      alignment: { placements: [{ t: 0, line: 0, ch: 6 }] },
      words: null,
    });
    expect(toChordPro({ ...meta, key: "A minor" }, [], layout)).toContain(
      "{key: Am}\n{tempo: 96}\n{capo: 2}\n\nhello [Am]there\n",
    );
  });
});

describe("toPlainText", () => {
  it("puts the chord line above the words", () => {
    const layout = layoutLyrics({
      segments: [seg(0, 2, "C"), seg(2, 4, "G")],
      durationSec: 4,
      lyrics: "let it be",
      alignment: {
        placements: [
          { t: 0, line: 0, ch: 0 },
          { t: 2, line: 0, ch: 7 },
        ],
      },
      words: null,
    });
    const out = toPlainText({ ...meta, capo: 0, bpm: null }, [], layout);
    expect(out).toBe("Song\nKey: G major\n\nC      G\nlet it be\n");
  });

  it("lists timed chord rows without lyrics", () => {
    expect(toPlainText(meta, segments, null)).toContain("  0:00  G      C      D");
  });
});

describe("safeFilename", () => {
  it("strips characters Windows can't store", () => {
    expect(safeFilename('AC/DC: "Back in Black"?')).toBe("ACDC Back in Black");
    expect(safeFilename("   ")).toBe("chords");
  });
});

describe("toPlainText with bars", () => {
  it("prints a lead sheet with aligned bar lines", async () => {
    const { buildBars } = await import("./bars");
    const segs = [seg(0, 2, "G"), seg(2, 3, "C"), seg(3, 4, "Em")];
    const sheet = buildBars(segs, { beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], beatsPerBar: 4, firstDownbeat: 0, confidence: 1 }, 4);
    const out = toPlainText({ ...meta, key: null, bpm: null, capo: 0 }, segs, null, sheet);
    expect(out).toBe("Song\nTime: 4/4\n\n  0:00  | G . . .  | C . Em . |\n");
  });
});

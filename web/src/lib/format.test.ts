import { describe, expect, it } from "vitest";
import { chordVocabulary, formatTime, mergeRepeats } from "./format";
import { centsFrom, detectPitch, freqToNote, median } from "./pitch";

const seg = (start: number, end: number, label: string, confidence = 1) => ({
  start,
  end,
  label,
  confidence,
});

describe("formatTime", () => {
  it.each([
    [0, "0:00"],
    [5.4, "0:05"],
    [59.6, "1:00"],
    [754, "12:34"],
    [3725, "1:02:05"],
    [-3, "0:00"],
  ])("%d s -> %s", (s, out) => expect(formatTime(s)).toBe(out));
});

describe("mergeRepeats", () => {
  it("joins adjacent identical chords and averages confidence", () => {
    const out = mergeRepeats([seg(0, 2, "C", 1), seg(2, 4, "C", 0.5), seg(4, 6, "G")]);
    expect(out).toEqual([seg(0, 4, "C", 0.75), seg(4, 6, "G")]);
  });

  it("keeps identical chords separated by a gap apart", () => {
    expect(mergeRepeats([seg(0, 2, "C"), seg(3, 4, "C")])).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const input = [seg(0, 2, "C"), seg(2, 4, "C")];
    mergeRepeats(input);
    expect(input[0].end).toBe(2);
  });
});

describe("chordVocabulary", () => {
  it("lists distinct chords in first-appearance order, without N", () => {
    const segs = [seg(0, 1, "N"), seg(1, 2, "G"), seg(2, 3, "C"), seg(3, 4, "G"), seg(4, 5, "D")];
    expect(chordVocabulary(segs)).toEqual(["G", "C", "D"]);
  });
});

describe("pitch helpers", () => {
  it("names notes and measures cents", () => {
    expect(freqToNote(440)).toEqual({ name: "A", octave: 4, cents: 0 });
    expect(freqToNote(82.41).name).toBe("E");
    expect(freqToNote(82.41).octave).toBe(2);
    expect(Math.round(centsFrom(446, 440))).toBe(23);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(-1);
  });

  it("detects the pitch of every standard guitar string within 1 cent", () => {
    const sr = 44100;
    for (const f of [82.41, 110, 146.83, 196, 246.94, 329.63]) {
      const buf = new Float32Array(4096);
      for (let i = 0; i < buf.length; i++) {
        const t = i / sr;
        // Fundamental plus strong harmonics, like a real plucked string.
        buf[i] =
          Math.sin(2 * Math.PI * f * t) +
          0.6 * Math.sin(2 * Math.PI * 2 * f * t) +
          0.3 * Math.sin(2 * Math.PI * 3 * f * t);
      }
      expect(Math.abs(centsFrom(detectPitch(buf, sr), f))).toBeLessThan(1);
    }
  });
});

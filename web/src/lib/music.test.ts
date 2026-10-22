import { describe, expect, it } from "vitest";
import { suggestCapo, suggestTuneDown, transposeChord, transposeKey } from "./music";

describe("transposeChord", () => {
  it.each([
    ["C", 2, "D"],
    ["Am", 3, "Cm"],
    ["B", 1, "C"],
    ["C", -1, "B"],
    ["F#m7b5", 1, "Gm7b5"],
    ["Bbmaj7", 2, "Cmaj7"],
    ["Gsus4", 12, "Gsus4"],
    ["E7", -14, "D7"],
  ])("%s + %i = %s", (label, n, expected) => {
    expect(transposeChord(label, n)).toBe(expected);
  });

  it("spells with flats when asked", () => {
    expect(transposeChord("C", 1, true)).toBe("Db");
    expect(transposeChord("Am", 1, true)).toBe("Bbm");
  });

  it("passes no-chord and unparseable labels through", () => {
    expect(transposeChord("N", 5)).toBe("N");
    expect(transposeChord("??", 5)).toBe("??");
  });

  it("round-trips", () => {
    for (let n = -11; n <= 11; n++) {
      expect(transposeChord(transposeChord("F#m7", n), -n)).toBe("F#m7");
    }
  });
});

describe("transposeKey", () => {
  it("shifts the tonic and normalises the mode", () => {
    expect(transposeKey("C major", 7)).toBe("G major");
    expect(transposeKey("A Minor", -2)).toBe("G minor");
    expect(transposeKey("E minor", 1, true)).toBe("F minor");
  });

  it("leaves null and odd keys alone", () => {
    expect(transposeKey(null, 3)).toBeNull();
    expect(transposeKey("unknown", 3)).toBe("unknown");
  });
});

describe("suggestCapo", () => {
  it("returns null for an empty or no-chord song", () => {
    expect(suggestCapo([], null)).toBeNull();
    expect(suggestCapo(["N", "N"], null)).toBeNull();
  });

  it("does not suggest a capo when every chord is already open", () => {
    const s = suggestCapo(["G", "C", "D", "Em"], "G major");
    expect(s?.fret).toBe(0);
    expect(s?.coversAll).toBe(true);
  });

  it("finds capo 1 for a song in A♭ (G shapes)", () => {
    const s = suggestCapo(["G#", "C#", "D#", "Fm"], "G# major");
    expect(s?.fret).toBe(1);
    expect(s?.shapes).toEqual(["G", "C", "D", "Em"]);
    expect(s?.shapeKey).toBe("G major");
  });

  it("counts distinct chords only", () => {
    expect(suggestCapo(["C", "C", "G", "N"], null)?.total).toBe(2);
  });
});

describe("suggestTuneDown", () => {
  it("suggests E♭ standard when only a high capo would otherwise help", () => {
    // "Sweet Child O' Mine": D♭ C♭ G♭ — capo 4 or tune down ½ step for D C G.
    const s = suggestTuneDown(["C#", "B", "F#"], "C# major");
    expect(s?.tuningId).toBe("eb-standard");
    expect(s?.shapes).toEqual(["D", "C", "G"]);
    expect(s?.coversAll).toBe(true);
  });

  it("stays quiet when a low capo already does the job", () => {
    // E♭ A♭ B♭ D♭ = capo 1 on D G A C.
    expect(suggestTuneDown(["D#", "G#", "A#", "C#"], "D# major")).toBeNull();
    expect(suggestTuneDown(["G#", "C#", "D#", "Fm"], "G# major")).toBeNull();
    expect(suggestTuneDown(["G", "C", "D"], "G major")).toBeNull();
  });
});

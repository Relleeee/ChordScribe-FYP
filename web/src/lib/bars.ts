/**
 * Group chord segments into bars on the engine's beat grid — a lead sheet:
 *
 *   | G . . . | C . G . | Am . . . | D . . . |
 *
 * Each bar has one slot per beat. A slot shows the chord that starts on that
 * beat; the first slot of every bar repeats the chord being held, as printed
 * charts do. Beats before the first downbeat form a short pickup bar.
 */

import type { ChordSegment, MeterInfo } from "./types";

export interface Bar {
  start: number;
  end: number;
  /** Beat start times within the bar. */
  beatTimes: number[];
  /** One entry per beat: chord label starting there, or null (keep playing). */
  slots: (string | null)[];
  pickup: boolean;
}

export interface BarSheet {
  bars: Bar[];
  beatsPerBar: number;
  /** "engine" = detected beats + meter; "tempo" = a flat 4/4 grid from the BPM. */
  source: "engine" | "tempo";
  confidence: number | null;
}

/** Beat grid when the analysis predates meter detection: 4/4 from the BPM,
 *  starting at the first chord. */
export function tempoGrid(
  segments: ChordSegment[],
  bpm: number | null | undefined,
  durationSec: number,
): MeterInfo | null {
  if (!bpm || bpm <= 0) return null;
  const first = segments.find((s) => s.label !== "N")?.start ?? 0;
  const period = 60 / bpm;
  const beats: number[] = [];
  for (let t = first; t < durationSec; t += period) beats.push(Math.round(t * 1000) / 1000);
  return beats.length >= 4 ? { beats, beatsPerBar: 4, firstDownbeat: 0, confidence: 0 } : null;
}

/** The chord sounding at time `t` (segments are sorted, non-overlapping). */
function chordAt(segments: ChordSegment[], t: number): string | null {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].end <= t) lo = mid + 1;
    else if (segments[mid].start > t) hi = mid - 1;
    else return segments[mid].label;
  }
  return null;
}

export function buildBars(
  segments: ChordSegment[],
  meter: MeterInfo,
  durationSec: number,
  source: BarSheet["source"] = "engine",
): BarSheet {
  const { beats, beatsPerBar: m, firstDownbeat } = meter;
  const period = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;
  const beatEnd = (i: number) => beats[i + 1] ?? Math.min(beats[i] + period, durationSec);

  // A chord "lands" on the beat nearest its start; labels are read at the
  // middle of each beat so a change a hair early or late still counts.
  const labelAt = (i: number) => chordAt(segments, (beats[i] + beatEnd(i)) / 2);

  const bars: Bar[] = [];
  const pushBar = (from: number, to: number, pickup: boolean) => {
    const idx = Array.from({ length: to - from }, (_, k) => from + k);
    let prev = from > 0 ? labelAt(from - 1) : null;
    const slots = idx.map((i, k) => {
      const label = labelAt(i);
      const show = k === 0 || label !== prev;
      prev = label;
      return show ? (label ?? "N") : null;
    });
    bars.push({
      start: beats[from],
      end: beatEnd(to - 1),
      beatTimes: idx.map((i) => beats[i]),
      slots,
      pickup,
    });
  };

  if (firstDownbeat > 0) pushBar(0, Math.min(firstDownbeat, beats.length), true);
  for (let i = firstDownbeat; i < beats.length; i += m) {
    pushBar(i, Math.min(i + m, beats.length), false);
  }

  // Drop leading/trailing bars that are all no-chord (silence before/after the song).
  const isEmpty = (b: Bar) => b.slots.every((s) => s === null || s === "N");
  while (bars.length && isEmpty(bars[0])) bars.shift();
  while (bars.length && isEmpty(bars[bars.length - 1])) bars.pop();

  return {
    bars,
    beatsPerBar: m,
    source,
    confidence: source === "engine" ? meter.confidence : null,
  };
}

/** A bar as lead-sheet text: "G . . ." / "C . G ." */
export function barText(bar: Bar): string {
  return bar.slots.map((s) => (s === "N" ? "N.C." : s ?? ".")).join(" ");
}

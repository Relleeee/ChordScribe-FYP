/**
 * Where each chord sits over the lyrics — the pure logic behind `LyricsView`,
 * shared with the chord-sheet exports so a downloaded sheet matches the screen.
 */

import { mergeRepeats } from "./format";
import type {
  ChordSegment,
  LyricAlignment,
  LyricPlacement,
  TranscriptWord,
} from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Millisecond key for a segment start — stable across transpose. */
export const timeKey = (t: number) => Math.round(t * 1000);

// A chord counts as "instrumental" — shown on its own row, no word beneath — if
// it plays before the first sung word, after the last, or in a long gap.
const INTRO_LEAD = 0.5;
const OUTRO_TRAIL = 3;
const GAP = 6;

/** Left-to-right column for each label so adjacent labels never overlap. */
export function layoutColumns(labels: { ch: number; label: string }[], gap = 1): number[] {
  const out: number[] = [];
  let cursor = 0;
  for (const c of labels) {
    const col = Math.max(c.ch, cursor);
    out.push(col);
    cursor = col + c.label.length + gap;
  }
  return out;
}

/** Index of the last entry in the ascending `times` array that is ≤ `t`. */
function lastAtOrBefore(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export interface PlacedChord {
  /** Segment start (seconds) — stable across transpose. */
  t: number;
  label: string;
  end: number;
  line: number;
  ch: number;
  /** Set when the chord is instrumental: the lyric line it follows (-1 = intro). */
  instrAfter?: number;
}

export interface LyricsLayoutInput {
  segments: ChordSegment[];
  durationSec: number;
  lyrics: string;
  alignment: LyricAlignment | null;
  words: TranscriptWord[] | null;
}

export interface LyricsLayout {
  lines: string[];
  /** Chords (no-chord removed, repeats merged) in time order. */
  chords: ChordSegment[];
  placed: PlacedChord[];
  /** Sung chords above each lyric line, left to right. */
  byLine: Map<number, PlacedChord[]>;
  /** Instrumental chords keyed by the lyric line they follow (-1 = before line 0). */
  instrRows: Map<number, PlacedChord[]>;
  lastLineIdx: number;
  /** True when Whisper word timings drove the placement. */
  timed: boolean;
  empty: boolean;
}

/**
 * Chords positioned above the words, the way a printed song sheet reads.
 *
 * If the lyrics were transcribed, each Whisper word carries a timestamp, so a
 * chord lands above the word being sung when it starts — and chords that play
 * while nobody is singing (intro, solo, outro) get their own row with no words.
 * Without timings the fallback spreads each line over a slice of the track
 * proportional to its length. A manual placement always wins.
 */
export function layoutLyrics({
  segments,
  durationSec,
  lyrics,
  alignment,
  words,
}: LyricsLayoutInput): LyricsLayout {
  const lines = lyrics.replace(/\r\n?/g, "\n").split("\n");
  const chords = mergeRepeats(segments).filter((s) => s.label !== "N");

  // Every word of the visible lyrics, in order, with where it sits.
  const textWords: { line: number; ch: number }[] = [];
  lines.forEach((line, li) => {
    for (const m of line.matchAll(/\S+/g)) textWords.push({ line: li, ch: m.index ?? 0 });
  });

  // Whisper word start times (ascending), when available.
  const wordTimes = words && words.length ? words.map((w) => w.t) : null;

  // Start time of the first sung word on each lyric line (null for blank lines).
  let lineStartTime: (number | null)[] | null = null;
  if (wordTimes) {
    const counts = lines.map((l) => (l.trim() ? l.trim().split(/\s+/).length : 0));
    const firstIdx = counts.map((_, i) => counts.slice(0, i).reduce((a, b) => a + b, 0));
    lineStartTime = lines.map((l, i) =>
      l.trim() && firstIdx[i] < wordTimes.length ? wordTimes[firstIdx[i]] : null,
    );
  }

  // Fallback: time window each lyric line occupies, weighted by its length.
  const weights = lines.map((l) => Math.max(l.trim().length, 1));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const dur = durationSec || chords.at(-1)?.end || 1;
  const endWeight = weights.map((_, i) => weights.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const lineWindows = weights.map((w, i) => ({
    start: ((endWeight[i] - w) / total) * dur,
    end: (endWeight[i] / total) * dur,
  }));

  const manual = new Map<number, LyricPlacement>();
  for (const p of alignment?.placements ?? []) manual.set(timeKey(p.t), p);

  // Priority: manual placement → Whisper word timing (with instrumental rows) →
  // proportional estimate.
  const wordScale = wordTimes ? wordTimes.length / Math.max(textWords.length, 1) : 0;
  const first = wordTimes?.[0] ?? 0;
  const last = wordTimes?.[wordTimes.length - 1] ?? 0;

  const placed = chords.map((c): PlacedChord => {
    const base = { t: c.start, label: c.label, end: c.end };

    const hit = manual.get(timeKey(c.start));
    if (hit) {
      const line = clamp(hit.line, 0, lines.length - 1);
      return { ...base, line, ch: clamp(hit.ch, 0, lines[line]?.length ?? 0) };
    }

    if (wordTimes && textWords.length) {
      const wi = lastAtOrBefore(wordTimes, c.start);
      const nearest = Math.min(
        Math.abs(wordTimes[wi] - c.start),
        Math.abs((wordTimes[wi + 1] ?? Infinity) - c.start),
      );
      const instrumental =
        c.start < first - INTRO_LEAD || c.start > last + OUTRO_TRAIL || nearest > GAP;

      if (instrumental && lineStartTime) {
        let after = -1;
        lineStartTime.forEach((s, i) => {
          if (s != null && s <= c.start) after = i;
        });
        return { ...base, line: after, ch: 0, instrAfter: after };
      }

      const ti = clamp(Math.round(wi / wordScale), 0, textWords.length - 1);
      const tw = textWords[ti];
      if (tw) return { ...base, line: tw.line, ch: tw.ch };
    }

    let li = lineWindows.findIndex((w) => c.start < w.end);
    if (li < 0) li = lines.length - 1;
    const win = lineWindows[li] ?? { start: 0, end: 1 };
    const frac = (c.start - win.start) / Math.max(win.end - win.start, 1e-6);
    const ch = clamp(Math.round(frac * (lines[li]?.length ?? 0)), 0, lines[li]?.length ?? 0);
    return { ...base, line: li, ch };
  });

  const byLine = new Map<number, PlacedChord[]>();
  const instrRows = new Map<number, PlacedChord[]>();
  for (const p of placed) {
    const map = p.instrAfter === undefined ? byLine : instrRows;
    const k = p.instrAfter ?? p.line;
    map.set(k, [...(map.get(k) ?? []), p]);
  }
  for (const arr of byLine.values()) arr.sort((a, b) => a.ch - b.ch || a.t - b.t);
  for (const arr of instrRows.values()) arr.sort((a, b) => a.t - b.t);

  return {
    lines,
    chords,
    placed,
    byLine,
    instrRows,
    lastLineIdx: lines.reduce((acc, l, i) => (l.trim() ? i : acc), 0),
    timed: wordTimes !== null,
    empty: lines.every((l) => l.trim() === ""),
  };
}

/** "intro" / "instrumental" / "outro" for an instrumental row. */
export function instrTag(after: number, lastLineIdx: number): string {
  return after === -1 ? "intro" : after >= lastLineIdx ? "outro" : "instrumental";
}

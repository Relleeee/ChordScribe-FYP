"use client";

import { useMemo, useRef, useState } from "react";
import type {
  ChordSegment,
  LyricAlignment,
  LyricPlacement,
  TranscriptWord,
} from "@/lib/types";
import { mergeRepeats } from "@/lib/format";
import { ChordName } from "./ChordName";

interface Props {
  /** Transposed/capoed segments — same array the other views render. */
  segments: ChordSegment[];
  durationSec: number;
  lyrics: string;
  alignment: LyricAlignment | null;
  /** Whisper word timings for these lyrics, if transcribed. */
  words: TranscriptWord[] | null;
  sourceKind: "upload" | "youtube";
  positionSec?: number;
  onSeek?: (seconds: number) => void;
  onEditLyrics: () => void;
  onAlignmentChange: (next: LyricAlignment | null) => void;
  /** Kick off transcription. `file` is required for upload sources. */
  onTranscribe: (file?: File) => void;
  transcribing: boolean;
  transcribeError: string | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const key = (t: number) => Math.round(t * 1000);

// A chord counts as "instrumental" — shown on its own row, no word beneath — if
// it plays before the first sung word, after the last, or in a long gap.
const INTRO_LEAD = 0.5;
const OUTRO_TRAIL = 3;
const GAP = 6;

/** Left-to-right column for each label so adjacent labels never overlap. */
function layoutColumns(labels: { ch: number; label: string }[], gap = 1): number[] {
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

interface PlacedChord {
  /** Segment start (seconds) — stable across transpose. */
  t: number;
  label: string;
  end: number;
  line: number;
  ch: number;
  /** Set when the chord is instrumental: the lyric line it follows (-1 = intro). */
  instrAfter?: number;
}

/**
 * Chords positioned above the words, the way a printed song sheet reads.
 *
 * If the lyrics were transcribed, each Whisper word carries a timestamp, so a
 * chord lands above the word being sung when it starts — and chords that play
 * while nobody is singing (intro, solo, outro) get their own row with no words.
 * Without timings the fallback spreads each line over a slice of the track
 * proportional to its length. Either way, "Adjust" pins a chord to an exact word.
 */
export function LyricsView({
  segments,
  durationSec,
  lyrics,
  alignment,
  words,
  sourceKind,
  positionSec,
  onSeek,
  onEditLyrics,
  onAlignmentChange,
  onTranscribe,
  transcribing,
  transcribeError,
}: Props) {
  const [adjust, setAdjust] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const lines = useMemo(() => lyrics.replace(/\r\n?/g, "\n").split("\n"), [lyrics]);

  const chords = useMemo(
    () => mergeRepeats(segments).filter((s) => s.label !== "N"),
    [segments],
  );

  // Every word of the visible lyrics, in order, with where it sits.
  const textWords = useMemo(() => {
    const out: { line: number; ch: number }[] = [];
    lines.forEach((line, li) => {
      for (const m of line.matchAll(/\S+/g)) out.push({ line: li, ch: m.index ?? 0 });
    });
    return out;
  }, [lines]);

  // Whisper word start times (ascending), when available.
  const wordTimes = useMemo(
    () => (words && words.length ? words.map((w) => w.t) : null),
    [words],
  );

  // Start time of the first sung word on each lyric line (null for blank lines).
  const lineStartTime = useMemo(() => {
    if (!wordTimes) return null;
    const counts = lines.map((l) => (l.trim() ? l.trim().split(/\s+/).length : 0));
    const firstIdx = counts.map((_, i) => counts.slice(0, i).reduce((a, b) => a + b, 0));
    return lines.map((l, i) =>
      l.trim() && firstIdx[i] < wordTimes.length ? wordTimes[firstIdx[i]] : null,
    );
  }, [lines, wordTimes]);

  // Fallback: time window each lyric line occupies, weighted by its length.
  const lineWindows = useMemo(() => {
    const weights = lines.map((l) => Math.max(l.trim().length, 1));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const dur = durationSec || chords.at(-1)?.end || 1;
    const endWeight = weights.map((_, i) =>
      weights.slice(0, i + 1).reduce((a, b) => a + b, 0),
    );
    return weights.map((w, i) => ({
      start: ((endWeight[i] - w) / total) * dur,
      end: (endWeight[i] / total) * dur,
    }));
  }, [lines, durationSec, chords]);

  const manual = useMemo(() => {
    const m = new Map<number, LyricPlacement>();
    for (const p of alignment?.placements ?? []) m.set(key(p.t), p);
    return m;
  }, [alignment]);

  // Priority: manual placement → Whisper word timing (with instrumental rows) →
  // proportional estimate.
  const placed = useMemo<PlacedChord[]>(() => {
    const wordScale = wordTimes ? wordTimes.length / Math.max(textWords.length, 1) : 0;
    const first = wordTimes?.[0] ?? 0;
    const last = wordTimes?.[wordTimes.length - 1] ?? 0;

    return chords.map((c): PlacedChord => {
      const base = { t: c.start, label: c.label, end: c.end };

      const hit = manual.get(key(c.start));
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
  }, [chords, manual, wordTimes, textWords, lineStartTime, lineWindows, lines]);

  // Sung chords above their lyric line.
  const byLine = useMemo(() => {
    const map = new Map<number, PlacedChord[]>();
    for (const p of placed) {
      if (p.instrAfter !== undefined) continue;
      const arr = map.get(p.line) ?? [];
      arr.push(p);
      map.set(p.line, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.ch - b.ch || a.t - b.t);
    return map;
  }, [placed]);

  // Instrumental chords keyed by the lyric line they follow (-1 = before line 0).
  const instrRows = useMemo(() => {
    const map = new Map<number, PlacedChord[]>();
    for (const p of placed) {
      if (p.instrAfter === undefined) continue;
      const arr = map.get(p.instrAfter) ?? [];
      arr.push(p);
      map.set(p.instrAfter, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.t - b.t);
    return map;
  }, [placed]);

  const lastLineIdx = useMemo(
    () => lines.reduce((acc, l, i) => (l.trim() ? i : acc), 0),
    [lines],
  );

  function place(line: number, ch: number) {
    if (selected == null) return;
    const others = (alignment?.placements ?? []).filter((p) => key(p.t) !== key(selected));
    onAlignmentChange({ placements: [...others, { t: selected, line, ch }] });
  }

  const activeT = useMemo(() => {
    if (positionSec == null) return null;
    const cur = chords.find((c) => positionSec >= c.start && positionSec < c.end);
    return cur ? key(cur.start) : null;
  }, [chords, positionSec]);

  const empty = lines.every((l) => l.trim() === "");

  const transcribeButton = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onTranscribe(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={transcribing}
        onClick={() => (sourceKind === "youtube" ? onTranscribe() : fileRef.current?.click())}
        className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-accent-soft disabled:opacity-50"
      >
        {transcribing
          ? "Transcribing… (up to a minute)"
          : empty
            ? "Transcribe from audio"
            : "Re-transcribe"}
      </button>
    </>
  );

  if (empty) {
    return (
      <div className="space-y-2 text-sm text-foreground/60">
        <p>
          No lyrics yet — <span className="font-medium">transcribe them from the audio</span>{" "}
          (rough, editable) or{" "}
          <button
            type="button"
            onClick={onEditLyrics}
            className="font-medium text-accent hover:underline"
          >
            type them in
          </button>
          . Then the chords lay out over the words.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">{transcribeButton}</div>
        {sourceKind === "upload" && (
          <p className="text-xs text-foreground/45">
            The file isn&apos;t stored on the server, so pick it again to transcribe.
          </p>
        )}
        {transcribeError && <p className="text-xs text-red-500">{transcribeError}</p>}
      </div>
    );
  }

  const chordButton = (c: PlacedChord, left: string) => (
    <button
      key={c.t}
      type="button"
      onClick={() => {
        if (adjust) setSelected((s) => (s === c.t ? null : c.t));
        else onSeek?.(c.t);
      }}
      style={{ left }}
      className={`absolute top-0 font-semibold ${
        selected === c.t
          ? "text-accent underline"
          : activeT === key(c.t)
            ? "text-accent"
            : "text-accent/90"
      } ${adjust || onSeek ? "cursor-pointer hover:text-accent" : ""}`}
    >
      {c.label}
    </button>
  );

  const renderInstrRow = (after: number) => {
    const cs = instrRows.get(after);
    if (!cs || cs.length === 0) return null;
    const cols = layoutColumns(cs, 2);
    const width = cols[cols.length - 1] + (cs[cs.length - 1]?.label.length ?? 0);
    const tag = after === -1 ? "intro" : after >= lastLineIdx ? "outro" : "instrumental";
    return (
      <div key={`instr-${after}`} className="mb-2">
        <div className="relative h-5 whitespace-pre" style={{ minWidth: `${width}ch` }}>
          {cs.map((c, i) => chordButton(c, `${cols[i]}ch`))}
        </div>
        <div className="text-xs italic text-foreground/35">({tag})</div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={onEditLyrics}
          className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-accent-soft"
        >
          Edit lyrics
        </button>
        {transcribeButton}
        <button
          type="button"
          onClick={() => {
            setAdjust((a) => !a);
            setSelected(null);
          }}
          className={`rounded-md border px-2.5 py-1 font-medium ${
            adjust ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-accent-soft"
          }`}
        >
          {adjust ? "Done adjusting" : "Adjust chords"}
        </button>
        {alignment && alignment.placements.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onAlignmentChange(null);
              setSelected(null);
            }}
            className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-accent-soft"
          >
            Reset alignment
          </button>
        )}
        {adjust && (
          <span className="text-foreground/50">
            {selected == null ? "Pick a chord, then click a word." : "Click the word it belongs over."}
          </span>
        )}
      </div>

      {transcribeError && <p className="text-xs text-red-500">{transcribeError}</p>}
      {!wordTimes && (
        <p className="text-xs text-foreground/45">
          Chord positions are estimated from line length. Transcribe the lyrics for
          word-accurate placement.
        </p>
      )}

      <div className="themed-scrollbar overflow-x-auto rounded-lg border border-border bg-surface p-3">
        <div className="min-w-fit font-mono text-sm leading-tight">
          {renderInstrRow(-1)}
          {lines.map((line, li) => {
            const cs = byLine.get(li) ?? [];
            const cols = layoutColumns(cs);

            return (
              <div key={li}>
                <div className="mb-2">
                  <div className="relative h-5 whitespace-pre">
                    {cs.map((c, i) => chordButton(c, `${cols[i]}ch`))}
                  </div>
                  <LyricLine
                    text={line || " "}
                    adjust={adjust && selected != null}
                    onPick={(ch) => place(li, ch)}
                  />
                </div>
                {renderInstrRow(li)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Fingering diagrams for the vocabulary, reusing the hover cards. */}
      <div className="flex flex-wrap gap-2">
        {[...new Set(placed.map((p) => p.label))].map((label) => (
          <ChordName
            key={label}
            label={label}
            className="rounded-full bg-accent-soft px-3 py-1 font-mono text-xs font-semibold text-accent"
          />
        ))}
      </div>
    </div>
  );
}

function LyricLine({
  text,
  adjust,
  onPick,
}: {
  text: string;
  adjust: boolean;
  onPick: (ch: number) => void;
}) {
  if (!adjust) return <div className="whitespace-pre text-foreground/90">{text}</div>;

  // Word-level click targets while adjusting.
  const tokens = text.split(/(\s+)/);
  const starts = tokens.map((_, i) =>
    tokens.slice(0, i).reduce((a, t) => a + t.length, 0),
  );
  return (
    <div className="whitespace-pre text-foreground/90">
      {tokens.map((tok, i) => {
        const start = starts[i];
        if (tok.trim() === "") return <span key={i}>{tok}</span>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(start)}
            className="rounded-sm hover:bg-accent-soft hover:text-accent"
          >
            {tok}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import type { ChordSegment, LyricAlignment, TranscriptWord } from "@/lib/types";
import {
  instrTag,
  layoutColumns,
  layoutLyrics,
  timeKey as key,
  type PlacedChord,
} from "@/lib/lyricsLayout";
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

  const layout = useMemo(
    () => layoutLyrics({ segments, durationSec, lyrics, alignment, words }),
    [segments, durationSec, lyrics, alignment, words],
  );
  const { lines, chords, placed, byLine, instrRows, lastLineIdx, timed, empty } = layout;

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
    const tag = instrTag(after, lastLineIdx);
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
      <div className="flex flex-wrap items-center gap-2 text-xs print:hidden">
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
      {!timed && (
        <p className="text-xs text-foreground/45 print:hidden">
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
      <div className="flex flex-wrap gap-2 print:hidden">
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

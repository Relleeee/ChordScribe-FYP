/**
 * Chord-sheet exports: ChordPro (the standard format songbook apps import —
 * OnSong, SongbookPro, ChordPro CLI…) and a plain-text "chords over words" sheet.
 * Both reflect what's on screen: transpose, capo and tuning are already applied
 * to the segments passed in.
 */

import { barText, type BarSheet } from "./bars";
import { formatTime, mergeRepeats } from "./format";
import { instrTag, layoutColumns, type LyricsLayout } from "./lyricsLayout";
import type { ChordSegment } from "./types";

export interface SheetMeta {
  title: string;
  /** Sounding key, after transpose. */
  key: string | null;
  bpm: number | null;
  capo: number;
  /** Display name, or null for standard tuning. */
  tuning: string | null;
}

const CHORDS_PER_ROW = 4;

/** Chords only, grouped into rows with the time each row starts. */
function chordRows(segments: ChordSegment[]): { t: number; labels: string[] }[] {
  const chords = mergeRepeats(segments).filter((s) => s.label !== "N");
  const rows: { t: number; labels: string[] }[] = [];
  for (let i = 0; i < chords.length; i += CHORDS_PER_ROW) {
    const slice = chords.slice(i, i + CHORDS_PER_ROW);
    rows.push({ t: slice[0].start, labels: slice.map((c) => c.label) });
  }
  return rows;
}

/** Insert `[Chord]` markers into a lyric line at the given columns. */
function inlineChords(line: string, chords: { ch: number; label: string }[]): string {
  let out = line;
  // Right to left so earlier insertions don't shift later columns.
  for (const c of [...chords].sort((a, b) => b.ch - a.ch)) {
    const at = Math.min(c.ch, out.length);
    out = `${out.slice(0, at).padEnd(c.ch, " ")}[${c.label}]${out.slice(at)}`;
  }
  return out;
}

export function toChordPro(meta: SheetMeta, segments: ChordSegment[], layout: LyricsLayout | null) {
  const out = [`{title: ${meta.title}}`];
  if (meta.key) out.push(`{key: ${meta.key.replace(/ major$/, "").replace(/ minor$/, "m")}}`);
  if (meta.bpm) out.push(`{tempo: ${Math.round(meta.bpm)}}`);
  if (meta.capo) out.push(`{capo: ${meta.capo}}`);
  if (meta.tuning) out.push(`{comment: Tuning: ${meta.tuning}}`);
  out.push("");

  if (!layout || layout.empty) {
    for (const row of chordRows(segments)) {
      out.push(`${row.labels.map((l) => `[${l}]`).join(" ")}`);
    }
    return out.join("\n") + "\n";
  }

  const instr = (after: number) => {
    const cs = layout.instrRows.get(after);
    if (!cs?.length) return;
    out.push(`{comment: ${instrTag(after, layout.lastLineIdx)}}`);
    for (let i = 0; i < cs.length; i += CHORDS_PER_ROW) {
      out.push(cs.slice(i, i + CHORDS_PER_ROW).map((c) => `[${c.label}]`).join(" "));
    }
  };
  instr(-1);
  layout.lines.forEach((line, li) => {
    out.push(inlineChords(line, layout.byLine.get(li) ?? []));
    instr(li);
  });
  return out.join("\n") + "\n";
}

export function toPlainText(
  meta: SheetMeta,
  segments: ChordSegment[],
  layout: LyricsLayout | null,
  bars: BarSheet | null = null,
) {
  const facts = [
    meta.key && `Key: ${meta.key}`,
    meta.bpm && `${Math.round(meta.bpm)} BPM`,
    meta.capo && `Capo ${meta.capo}`,
    meta.tuning && `Tuning: ${meta.tuning}`,
  ].filter(Boolean);
  const out = [meta.title, ...(facts.length ? [facts.join(" · ")] : []), ""];

  if ((!layout || layout.empty) && bars?.bars.length) {
    // Lead-sheet layout: four bars per line, slots padded so bar lines align.
    const cells = bars.bars.map(barText);
    const width = Math.max(...cells.map((c) => c.length));
    out[out.length - 1] = `Time: ${bars.beatsPerBar}/4`;
    out.push("");
    for (let i = 0; i < cells.length; i += 4) {
      const row = cells.slice(i, i + 4).map((c) => ` ${c.padEnd(width)} `);
      out.push(`${formatTime(bars.bars[i].start).padStart(6)}  |${row.join("|")}|`);
    }
    return out.join("\n") + "\n";
  }

  if (!layout || layout.empty) {
    for (const row of chordRows(segments)) {
      out.push(`${formatTime(row.t).padStart(6)}  ${row.labels.map((l) => l.padEnd(7)).join("")}`.trimEnd());
    }
    return out.join("\n") + "\n";
  }

  const chordLine = (cs: { ch: number; label: string }[], gap?: number) => {
    const cols = layoutColumns(cs, gap);
    let s = "";
    cs.forEach((c, i) => {
      s = s.padEnd(cols[i], " ") + c.label;
    });
    return s;
  };
  const instr = (after: number) => {
    const cs = layout.instrRows.get(after);
    if (!cs?.length) return;
    out.push(`(${instrTag(after, layout.lastLineIdx)})`, chordLine(cs, 2), "");
  };
  instr(-1);
  layout.lines.forEach((line, li) => {
    const cs = layout.byLine.get(li) ?? [];
    if (cs.length) out.push(chordLine(cs));
    out.push(line);
    instr(li);
  });
  return out.join("\n") + "\n";
}

/** Trigger a browser download of `text`. */
export function downloadText(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A filesystem-safe base name from a song title. */
export function safeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "chords";
}

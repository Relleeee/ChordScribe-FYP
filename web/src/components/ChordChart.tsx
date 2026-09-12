"use client";

import { useMemo } from "react";
import type { ChordSegment } from "@/lib/types";
import { formatTime, mergeRepeats } from "@/lib/format";
import { ChordName } from "./ChordName";

interface Props {
  segments: ChordSegment[];
  /** Chords per row in the printed chart. */
  perRow?: number;
  /** Current playhead position — highlights the chord being played. */
  positionSec?: number;
  onSeek?: (seconds: number) => void;
}

/** A readable, timestamped chord sheet — the artefact a guitarist actually reads.
 *  Hover (or tap) a chord to see its finger pattern. */
export function ChordChart({ segments, perRow = 6, positionSec, onSeek }: Props) {
  const merged = useMemo(
    () => mergeRepeats(segments).filter((s) => s.label !== "N"),
    [segments],
  );

  const rows = useMemo(() => {
    const chunked: ChordSegment[][] = [];
    for (let i = 0; i < merged.length; i += perRow) {
      chunked.push(merged.slice(i, i + perRow));
    }
    return chunked;
  }, [merged, perRow]);

  if (rows.length === 0) {
    return <p className="text-sm text-foreground/50">No chords detected.</p>;
  }

  return (
    <div className="space-y-2 font-mono">
      {rows.map((row, r) => (
        <div key={r} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {row.map((seg, c) => {
            const active =
              positionSec != null && positionSec >= seg.start && positionSec < seg.end;
            return (
              <div
                key={`${r}-${c}`}
                onClick={onSeek ? () => onSeek(seg.start) : undefined}
                className={`flex flex-col items-start rounded-md border px-3 py-2 transition-colors ${
                  active ? "border-accent bg-accent-soft" : "border-border bg-surface"
                } ${onSeek ? "cursor-pointer hover:border-accent" : ""}`}
              >
                <ChordName label={seg.label} className="text-lg font-bold text-accent" />
                <span className="text-xs text-foreground/50">{formatTime(seg.start)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import type { ChordSegment } from "@/lib/types";
import { formatTime, mergeRepeats } from "@/lib/format";

interface Props {
  segments: ChordSegment[];
  durationSec: number;
  /** Current playhead position in seconds, if a player is wired up. */
  positionSec?: number;
  onSeek?: (seconds: number) => void;
}

/** A proportional horizontal bar of chord spans across the whole track. */
export function ChordTimeline({ segments, durationSec, positionSec, onSeek }: Props) {
  const spans = useMemo(() => mergeRepeats(segments), [segments]);
  const total = durationSec || spans.at(-1)?.end || 1;

  return (
    <div className="w-full">
      <div className="relative flex h-14 w-full overflow-hidden rounded-lg border border-border">
        {spans.map((seg, i) => {
          const widthPct = ((seg.end - seg.start) / total) * 100;
          const isNoChord = seg.label === "N";
          return (
            <button
              key={`${seg.start}-${i}`}
              type="button"
              onClick={() => onSeek?.(seg.start)}
              title={`${seg.label} · ${formatTime(seg.start)}–${formatTime(seg.end)} · ${Math.round(
                seg.confidence * 100,
              )}%`}
              style={
                isNoChord
                  ? { width: `${widthPct}%` }
                  : { width: `${widthPct}%`, opacity: 0.4 + seg.confidence * 0.6 }
              }
              className={`group flex h-full min-w-[2px] items-center justify-center border-r border-background/40 text-xs font-semibold last:border-r-0 ${
                isNoChord
                  ? "bg-surface-2 text-foreground/40"
                  : "bg-accent text-accent-contrast hover:brightness-110"
              } ${onSeek ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className="truncate px-1">{isNoChord ? "" : seg.label}</span>
            </button>
          );
        })}
        {positionSec != null && (
          <div
            className="pointer-events-none absolute top-0 h-full w-0.5 bg-red-500"
            style={{ left: `${Math.min(100, (positionSec / total) * 100)}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-foreground/50">
        <span>0:00</span>
        <span>{formatTime(total)}</span>
      </div>
    </div>
  );
}

"use client";

import type { BarSheet } from "@/lib/bars";
import { formatTime } from "@/lib/format";
import { ChordName } from "./ChordName";

interface Props {
  sheet: BarSheet;
  /** Bars per row (4 = the usual lead-sheet phrase). */
  perRow?: number;
  positionSec?: number;
  onSeek?: (seconds: number) => void;
}

/** The chord sheet as a lead sheet: bar lines, one slot per beat. */
export function BarChart({ sheet, perRow = 4, positionSec, onSeek }: Props) {
  const { bars, beatsPerBar, source, confidence } = sheet;
  if (bars.length === 0) return <p className="text-sm text-foreground/50">No chords detected.</p>;

  const rows: (typeof bars)[] = [];
  for (let i = 0; i < bars.length; i += perRow) rows.push(bars.slice(i, i + perRow));
  const low = source === "tempo" || (confidence !== null && confidence < 0.5);

  return (
    <div className="space-y-2">
      <p className="text-xs text-foreground/50">
        <span className="font-semibold text-foreground/70">{beatsPerBar}/4</span>
        {source === "tempo"
          ? " · bar lines estimated from the tempo — re-analyse the song for detected bars."
          : ` · ${Math.round((confidence ?? 0) * 100)}% of chord changes fall on a bar line`}
        {low && source === "engine" && " — the bar grid may be shifted on this song."}
      </p>

      <div className="themed-scrollbar overflow-x-auto">
        <div className="min-w-[36rem] space-y-1 font-mono">
          {rows.map((row, r) => (
            <div key={r} className="flex items-stretch">
              <span className="w-12 shrink-0 self-center pr-2 text-right text-[10px] text-foreground/40">
                {formatTime(row[0].start)}
              </span>
              <div
                className="grid flex-1 border-l-2 border-foreground/40"
                style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
              >
                {row.map((bar, b) => {
                  const inBar =
                    positionSec != null && positionSec >= bar.start && positionSec < bar.end;
                  return (
                    <div
                      key={b}
                      onClick={onSeek ? () => onSeek(bar.start) : undefined}
                      className={`grid border-r-2 border-foreground/40 px-1.5 py-2 transition-colors ${
                        inBar ? "bg-accent-soft" : ""
                      } ${onSeek ? "cursor-pointer hover:bg-accent-soft" : ""} ${
                        bar.pickup ? "border-dashed" : ""
                      }`}
                      style={{ gridTemplateColumns: `repeat(${bar.slots.length}, minmax(0, 1fr))` }}
                    >
                      {bar.slots.map((slot, s) => {
                        const onBeat =
                          inBar &&
                          positionSec! >= bar.beatTimes[s] &&
                          positionSec! < (bar.beatTimes[s + 1] ?? bar.end);
                        return (
                          <span
                            key={s}
                            className={`min-w-0 truncate text-left text-base ${
                              onBeat ? "underline decoration-accent decoration-2 underline-offset-4" : ""
                            }`}
                          >
                            {slot === null ? (
                              <span className="text-foreground/25">·</span>
                            ) : slot === "N" ? (
                              <span className="text-xs text-foreground/40">N.C.</span>
                            ) : (
                              <ChordName label={slot} className="font-bold text-accent" />
                            )}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

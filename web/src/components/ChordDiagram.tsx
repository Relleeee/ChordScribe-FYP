"use client";

import { getChordShape, type ChordShape } from "@/lib/chordShapes";
import { isStandard } from "@/lib/tuning";
import { useTuning } from "./TuningContext";

const STRINGS = 6;
const FRETS = 4;

/** A chord box: nut/frets, x/o markers, finger dots, optional barre.
 *  Pass an explicit `shape` to draw a specific voicing; otherwise the primary
 *  one for `label` in the active tuning is computed. `scale` multiplies the box
 *  size (1 = 96×116). */
export function ChordDiagram({
  label,
  shape,
  scale = 1,
}: {
  label: string;
  shape?: ChordShape;
  scale?: number;
}) {
  const tuning = useTuning();
  const s = shape ?? getChordShape(label, tuning);
  if (!s) return null;

  const showNotes = !isStandard(tuning);
  const w = 96 * scale;
  const h = (showNotes ? 128 : 116) * scale;
  const padX = 12 * scale;
  const padTop = 22 * scale;
  const padBottom = (showNotes ? 26 : 14) * scale;
  const gridW = w - padX * 2;
  const gridH = h - padTop - padBottom;
  const colGap = gridW / (STRINGS - 1);
  const rowGap = gridH / FRETS;

  // Fret numbers relative to the top of the box.
  const played = s.frets.map((f) => (f === null ? null : f - (s.baseFret - 1)));

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`${label} chord diagram`}
    >
      <text
        x={w / 2}
        y={12 * scale}
        textAnchor="middle"
        className="fill-foreground"
        fontSize={13 * scale}
        fontWeight="700"
      >
        {label}
      </text>

      {/* open / muted string markers */}
      {s.frets.map((f, i) => {
        const x = padX + i * colGap;
        if (f === null) {
          return (
            <text
              key={i}
              x={x}
              y={padTop - 5 * scale}
              textAnchor="middle"
              className="fill-foreground/50"
              fontSize={9 * scale}
            >
              ×
            </text>
          );
        }
        if (played[i] === 0) {
          return (
            <circle
              key={i}
              cx={x}
              cy={padTop - 8 * scale}
              r={3 * scale}
              className="fill-none stroke-foreground/50"
              strokeWidth={scale}
            />
          );
        }
        return null;
      })}

      {/* nut (thick) when the box starts at fret 1, else a starting-fret label */}
      {s.baseFret === 1 ? (
        <line
          x1={padX}
          y1={padTop}
          x2={w - padX}
          y2={padTop}
          className="stroke-foreground"
          strokeWidth={2.5 * scale}
        />
      ) : (
        <text
          x={padX - 5 * scale}
          y={padTop + rowGap / 2 + 3 * scale}
          textAnchor="end"
          className="fill-foreground/60"
          fontSize={9 * scale}
        >
          {s.baseFret}fr
        </text>
      )}

      {/* fret lines */}
      {Array.from({ length: FRETS + 1 }).map((_, r) => (
        <line
          key={`f${r}`}
          x1={padX}
          y1={padTop + r * rowGap}
          x2={w - padX}
          y2={padTop + r * rowGap}
          className="stroke-foreground/25"
          strokeWidth={scale}
        />
      ))}

      {/* string lines */}
      {Array.from({ length: STRINGS }).map((_, i) => (
        <line
          key={`s${i}`}
          x1={padX + i * colGap}
          y1={padTop}
          x2={padX + i * colGap}
          y2={padTop + gridH}
          className="stroke-foreground/25"
          strokeWidth={scale}
        />
      ))}

      {/* barre bar */}
      {s.barre &&
        (() => {
          const lowest = played.findIndex((n) => n !== null && n > 0);
          if (lowest < 0) return null;
          return (
            <rect
              x={padX + lowest * colGap - 4 * scale}
              y={padTop + 0.5 * rowGap - 5 * scale}
              width={(STRINGS - 1 - lowest) * colGap + 8 * scale}
              height={10 * scale}
              rx={5 * scale}
              className="fill-accent"
            />
          );
        })()}

      {/* finger dots */}
      {played.map((n, i) => {
        if (n === null || n <= 0) return null;
        const x = padX + i * colGap;
        const y = padTop + (n - 0.5) * rowGap;
        return <circle key={`d${i}`} cx={x} cy={y} r={4.5 * scale} className="fill-accent" />;
      })}

      {/* open-string note names, for non-standard tunings */}
      {showNotes &&
        tuning.labels.map((nm, i) => (
          <text
            key={`n${i}`}
            x={padX + i * colGap}
            y={h - 8 * scale}
            textAnchor="middle"
            className="fill-foreground/45"
            fontSize={8 * scale}
          >
            {nm}
          </text>
        ))}
    </svg>
  );
}

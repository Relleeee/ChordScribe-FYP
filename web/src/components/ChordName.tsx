"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getChordShapes } from "@/lib/chordShapes";
import { useTuning } from "./TuningContext";
import { ChordDiagram } from "./ChordDiagram";

interface Coords {
  left: number;
  top: number;
  /** true when the card sits above the trigger (arrow points down). */
  flipped: boolean;
}

/** Place a `width`×`height` card next to `anchor`, flipping above / clamping to
 *  the viewport so it never renders off-screen. */
function placeCard(anchor: DOMRect, width: number, height: number): Coords {
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const roomBelow = vh - anchor.bottom;
  const flipped = roomBelow < height + gap && anchor.top > roomBelow;

  const top = flipped ? anchor.top - gap - height : anchor.bottom + gap;
  let left = anchor.left + anchor.width / 2 - width / 2;
  left = Math.max(8, Math.min(left, vw - width - 8));

  return { left, top: Math.max(8, top), flipped };
}

/**
 * A chord label that shows its fingering. Hovering (or focusing) pops a quick
 * card with the primary shape; clicking opens a larger popover with every
 * common voicing — open shape plus the movable barres — captioned. Dismiss with
 * Escape, a click outside, or by clicking the label again.
 */
export function ChordName({ label, className = "" }: { label: string; className?: string }) {
  const tuning = useTuning();
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const [hover, setHover] = useState<Coords | null>(null);
  const [open, setOpen] = useState<Coords | null>(null);

  const shapes = label === "N" ? [] : getChordShapes(label, tuning);
  const hasAlternatives = shapes.length > 1;

  const showHover = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setHover(placeCard(r, 120, 150));
  }, []);

  const toggleOpen = useCallback(() => {
    setHover(null);
    setOpen((cur) => {
      if (cur) return null;
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return null;
      // Width scales with the number of voicings; height fits one diagram row.
      const width = Math.min(96 + (shapes.length - 1) * 132 + 28, window.innerWidth - 16);
      return placeCard(r, width, 210);
    });
  }, [shapes.length]);

  // Close the popover on Escape or an outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onDown = (e: PointerEvent) => {
      if (
        !cardRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Keep the popover anchored if the page scrolls/resizes while it's open.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect();
      const c = cardRef.current?.getBoundingClientRect();
      if (r && c) setOpen(placeCard(r, c.width, c.height));
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  if (label === "N") return <span className={className}>{label}</span>;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open != null}
        title={`${label} — click for fingerings`}
        onClick={(e) => {
          e.stopPropagation();
          toggleOpen();
        }}
        onMouseEnter={showHover}
        onMouseLeave={() => setHover(null)}
        onFocus={showHover}
        onBlur={() => setHover(null)}
        className={`cursor-pointer ${className}`}
      >
        {label}
      </button>

      {/* Quick hover/focus preview — primary shape only. */}
      {hover && !open && shapes[0] && (
        <div
          style={{ position: "fixed", left: hover.left, top: hover.top, zIndex: 50 }}
          className="pointer-events-none rounded-lg border border-border bg-surface p-1.5 shadow-xl"
        >
          <ChordDiagram label={label} shape={shapes[0]} />
          {hasAlternatives && (
            <p className="px-1 pb-0.5 text-center text-[10px] text-foreground/45">
              click for {shapes.length} shapes
            </p>
          )}
        </div>
      )}

      {/* Click popover — every voicing, captioned. */}
      {open && shapes.length > 0 && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label={`${label} fingerings`}
          style={{ position: "fixed", left: open.left, top: open.top, zIndex: 60 }}
          className="rounded-xl border border-border bg-surface p-3 shadow-2xl"
        >
          <div className="mb-1.5 flex items-center justify-between gap-4">
            <span className="font-mono text-sm font-semibold text-accent">{label}</span>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Close"
              className="-my-1 -mr-1 rounded px-1.5 py-0.5 text-foreground/50 hover:bg-accent-soft hover:text-accent"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            {shapes.map((shape) => (
              <figure key={shape.name} className="flex flex-col items-center">
                <ChordDiagram label={label} shape={shape} />
                <figcaption className="mt-0.5 text-center text-[11px] font-medium text-foreground/55">
                  {shape.name}
                  {shape.baseFret > 1 ? ` · ${shape.baseFret}fr` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

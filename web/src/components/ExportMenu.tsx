"use client";

import { useEffect, useRef, useState } from "react";

export type ExportFormat = "print" | "chordpro" | "text";

const OPTIONS: { format: ExportFormat; label: string; hint: string }[] = [
  { format: "print", label: "Print / Save as PDF", hint: "The current view, on paper" },
  { format: "chordpro", label: "ChordPro (.cho)", hint: "For OnSong, SongbookPro…" },
  { format: "text", label: "Plain text (.txt)", hint: "Chords over the words" },
];

/** Toolbar dropdown for downloading or printing the chord sheet. */
export function ExportMenu({ onExport }: { onExport: (format: ExportFormat) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-medium hover:bg-accent-soft"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.format}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                // Let the menu close before the print dialog snapshots the page.
                requestAnimationFrame(() => onExport(o.format));
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-accent-soft"
            >
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-foreground/50">{o.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

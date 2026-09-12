"use client";

import { useState } from "react";
import { GuitarTuner } from "./GuitarTuner";

/** Topbar entry point for the microphone tuner. */
export function TunerButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent-soft hover:text-accent"
      >
        {/* tuning fork */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 3v8a4 4 0 0 0 8 0V3" />
          <path d="M12 15v6" />
        </svg>
        <span className="hidden sm:inline">Tuner</span>
      </button>
      {open && <GuitarTuner onClose={() => setOpen(false)} />}
    </>
  );
}

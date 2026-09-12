"use client";

import { useState } from "react";

/** Plain textarea for the song lyrics. Saving/persistence is the caller's job. */
export function LyricsEditor({
  initial,
  busy,
  error,
  note,
  onSave,
  onCancel,
}: {
  initial: string;
  busy: boolean;
  error: string | null;
  note?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);

  return (
    <div className="space-y-2">
      {note && <p className="text-xs text-foreground/55">{note}</p>}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={12}
        placeholder="Paste the lyrics here — one line per line of the song…"
        className="themed-scrollbar w-full rounded-lg border border-border bg-transparent p-3 font-mono text-sm outline-none focus:border-accent"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={busy}
          className="rounded-lg bg-accent-strong px-3 py-1.5 text-sm font-semibold text-accent-contrast hover:bg-accent-strong-hover disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent-soft"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

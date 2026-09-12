"use client";

import { useRef, useState } from "react";
import type { AnalysisSummary, SessionUser } from "@/lib/types";

interface Props {
  user: SessionUser;
  analyses: AnalysisSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNew: () => void;
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function Sidebar({ user, analyses, activeId, onSelect, onDelete, onRename, onNew }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(a: AnalysisSummary) {
    setEditingId(a.id);
    setDraft(a.title);
    // Focus after the input mounts.
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commitEdit() {
    const title = draft.trim();
    if (editingId && title) onRename(editingId, title);
    setEditingId(null);
  }

  return (
    <div className="flex h-full flex-col bg-surface-2">
      <div className="border-b border-border p-4">
        <div className="text-sm font-semibold">{user.name}</div>
        <div className="truncate text-xs text-foreground/60">{user.email}</div>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-lg bg-accent-strong px-3 py-2 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong-hover"
        >
          + New analysis
        </button>
      </div>

      <div className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-foreground/50">
        Recent Songs
      </div>

      <nav className="themed-scrollbar flex-1 space-y-1 overflow-y-auto p-2">
        {analyses.length === 0 && (
          <p className="px-2 py-4 text-sm text-foreground/60">
            Nothing yet — analyse a song to see it here.
          </p>
        )}
        {analyses.map((a) => (
          <div
            key={a.id}
            className={`group flex items-start gap-1 rounded-lg px-2 py-2 text-sm transition-colors ${
              a.id === activeId ? "bg-accent-soft" : "hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            {editingId === a.id ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                autoFocus
                maxLength={100}
                className="min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 py-0.5 text-sm outline-none"
              />
            ) : (
              <button type="button" onClick={() => onSelect(a.id)} className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium">{a.title}</div>
                <div className="truncate text-xs text-foreground/50">
                  {a.key ?? "key ?"} · {a.bpm ? `${Math.round(a.bpm)} BPM · ` : ""}
                  {relativeDate(a.createdAt)}
                </div>
              </button>
            )}

            {editingId !== a.id && (
              <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => startEdit(a)}
                  aria-label={`Rename ${a.title}`}
                  className="rounded p-1 text-foreground/40 hover:text-accent"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  aria-label={`Delete ${a.title}`}
                  className="rounded p-1 text-foreground/40 hover:text-red-500"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3 text-[11px] text-foreground/40">
        ChordScribe · FYP prototype
      </div>
    </div>
  );
}

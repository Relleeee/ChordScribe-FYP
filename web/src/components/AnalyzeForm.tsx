"use client";

import { useState } from "react";
import type { AnalysisStatus, ApiError, SavedAnalysis } from "@/lib/types";

type Tab = "youtube" | "upload";

const ACCEPTED = ".mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.webm,audio/*,video/mp4";

export function AnalyzeForm({ onResult }: { onResult: (result: SavedAnalysis) => void }) {
  const [tab, setTab] = useState<Tab>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = status === "uploading" || status === "analyzing";

  async function run() {
    setError(null);
    try {
      let res: Response;
      if (tab === "youtube") {
        if (!youtubeUrl.trim()) return;
        setStatus("analyzing");
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtube_url: youtubeUrl.trim() }),
        });
      } else {
        if (!file) return;
        setStatus("uploading");
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/analyze", { method: "POST", body: form });
      }

      setStatus("analyzing");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(
          body?.detail ? `${body.error}: ${body.detail}` : body?.error ?? `HTTP ${res.status}`,
        );
      }
      onResult((await res.json()) as SavedAnalysis);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
        {(["youtube", "upload"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === t ? "bg-accent text-accent-contrast shadow-sm" : "text-foreground/60"
            }`}
          >
            {t === "youtube" ? "YouTube link" : "Upload file"}
          </button>
        ))}
      </div>

      {tab === "youtube" ? (
        <input
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
        />
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-foreground/60 hover:border-accent">
          <input
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <span className="font-medium text-foreground">{file.name}</span>
          ) : (
            <span>Drop an MP3 / MP4 here, or tap to choose (max 200&nbsp;MB)</span>
          )}
        </label>
      )}

      <button
        type="button"
        onClick={run}
        disabled={busy || (tab === "youtube" ? !youtubeUrl.trim() : !file)}
        className="mt-4 w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "uploading" ? "Uploading…" : status === "analyzing" ? "Analysing…" : "Get chords"}
      </button>

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

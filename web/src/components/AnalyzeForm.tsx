"use client";

import { useEffect, useState } from "react";
import { readNdjson } from "@/lib/ndjson";
import type {
  AnalysisStage,
  AnalysisStatus,
  AnalyzeEvent,
  ApiError,
  SavedAnalysis,
} from "@/lib/types";

type Tab = "youtube" | "upload";

const ACCEPTED = ".mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.webm,audio/*,video/mp4";

/** Progress steps, in pipeline order. "upload" is the browser → server leg. */
type Step = "upload" | AnalysisStage;
const ORDER: Step[] = ["upload", "fetch", "decode", "features", "separate", "chords", "key"];

function stepLabel(step: Step, tab: Tab): string {
  switch (step) {
    case "upload":
      return "Uploading file";
    case "fetch":
      return tab === "youtube" ? "Downloading audio from YouTube" : "Receiving file";
    case "decode":
      return "Decoding audio";
    case "features":
      return "Measuring tempo and harmony";
    case "separate":
      return "Separating vocals and drums";
    case "chords":
      return "Recognising chords";
    case "key":
      return "Detecting key and bar lines";
  }
}

function plannedSteps(tab: Tab, highAccuracy: boolean): Step[] {
  return ORDER.filter(
    (s) => (s !== "upload" || tab === "upload") && (s !== "separate" || highAccuracy),
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function AnalyzeForm({ onResult }: { onResult: (result: SavedAnalysis) => void }) {
  const [tab, setTab] = useState<Tab>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [highAccuracy, setHighAccuracy] = useState(false);
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [current, setCurrent] = useState<Step | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);

  const busy = status === "uploading" || status === "analyzing";

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [busy]);

  async function run() {
    setError(null);
    const plan = plannedSteps(tab, highAccuracy);
    setSteps(plan);
    setCurrent(plan[0]);
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      let res: Response;
      const headers = { Accept: "application/x-ndjson" };
      if (tab === "youtube") {
        if (!youtubeUrl.trim()) return;
        setStatus("analyzing");
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ youtube_url: youtubeUrl.trim(), highAccuracy }),
        });
      } else {
        if (!file) return;
        setStatus("uploading");
        const form = new FormData();
        form.append("file", file);
        if (highAccuracy) form.append("highAccuracy", "1");
        res = await fetch("/api/analyze", { method: "POST", headers, body: form });
      }

      setStatus("analyzing");
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(
          body?.detail ? `${body.error}: ${body.detail}` : body?.error ?? `HTTP ${res.status}`,
        );
      }

      for await (const event of readNdjson<AnalyzeEvent>(res.body)) {
        if (event.type === "stage") {
          setCurrent(event.stage);
          // The server is the authority on which steps actually run (e.g. no GPU
          // and separation disabled), so add any step we didn't plan for.
          setSteps((s) =>
            s.includes(event.stage)
              ? s
              : [...s, event.stage].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)),
          );
        } else if (event.type === "error") {
          throw new Error(event.detail ? `${event.error}: ${event.detail}` : event.error);
        } else {
          onResult(event.analysis);
          setStatus("done");
          return;
        }
      }
      throw new Error("The connection closed before the analysis finished");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  const currentIndex = current ? steps.indexOf(current) : -1;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
        {(["youtube", "upload"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            disabled={busy}
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) run();
          }}
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
        />
      ) : (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-foreground/60 hover:border-accent"
        >
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

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={highAccuracy}
          disabled={busy}
          onChange={(e) => setHighAccuracy(e.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span>
          <span className="font-medium">High-accuracy mode</span>
          <span className="block text-xs text-foreground/50">
            Separates the drums and vocals first so chords and key are read from the guitar and
            keys alone. Better on full-band songs; takes a few minutes longer.
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={run}
        disabled={busy || (tab === "youtube" ? !youtubeUrl.trim() : !file)}
        className="mt-4 w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? `Analysing… ${formatElapsed(now - startedAt)}` : "Get chords"}
      </button>

      {busy && steps.length > 0 && (
        <ol className="mt-4 space-y-1.5 text-sm" aria-live="polite">
          {steps.map((step, i) => {
            const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
            return (
              <li key={step} className="flex items-center gap-2.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {state === "done" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-accent">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : state === "active" ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/25" />
                  )}
                </span>
                <span
                  className={
                    state === "active"
                      ? "font-medium text-foreground"
                      : state === "done"
                        ? "text-foreground/60"
                        : "text-foreground/35"
                  }
                >
                  {stepLabel(step, tab)}
                  {state === "active" && step === "separate" && (
                    <span className="ml-1.5 text-xs text-foreground/45">(the slow part on CPU)</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

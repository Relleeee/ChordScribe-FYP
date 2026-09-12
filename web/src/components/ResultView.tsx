"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChordSegment,
  LyricAlignment,
  SavedAnalysis,
  TabData,
  TranscriptWord,
} from "@/lib/types";
import { chordVocabulary, formatTime } from "@/lib/format";
import { suggestCapo, transposeChord, transposeKey, type CapoSuggestion } from "@/lib/music";
import { isStandard, resolveTuning, TUNINGS } from "@/lib/tuning";
import { ChordTimeline } from "./ChordTimeline";
import { ChordChart } from "./ChordChart";
import { ChordTab } from "./ChordTab";
import { ChordName } from "./ChordName";
import { LyricsView } from "./LyricsView";
import { LyricsEditor } from "./LyricsEditor";
import { TuningProvider } from "./TuningContext";
import { MediaPlayer } from "./MediaPlayer";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-foreground/50">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Stepper({
  label,
  display,
  onDec,
  onInc,
  onReset,
  canReset,
}: {
  label: string;
  display: string;
  onDec: () => void;
  onInc: () => void;
  onReset: () => void;
  canReset: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-foreground/60">{label}</span>
      <div className="flex items-center rounded-md border border-border">
        <button
          type="button"
          onClick={onDec}
          aria-label={`${label} down`}
          className="px-2 py-0.5 text-base leading-none hover:bg-accent-soft"
        >
          −
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          title={canReset ? "Reset" : undefined}
          className="min-w-[3rem] border-x border-border px-1 py-0.5 text-center font-mono text-xs tabular-nums disabled:cursor-default"
        >
          {display}
        </button>
        <button
          type="button"
          onClick={onInc}
          aria-label={`${label} up`}
          className="px-2 py-0.5 text-base leading-none hover:bg-accent-soft"
        >
          +
        </button>
      </div>
    </div>
  );
}

function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function capoText(s: CapoSuggestion): string {
  if (s.fret === 0) {
    if (s.coversAll) return "These are all open chords — no capo needed.";
    if (s.openCount >= s.total - 1) return "Already mostly open chords — a capo won't help much.";
    return "No capo position makes these easier.";
  }
  const where = s.shapeKey ? `, in the key of ${s.shapeKey}` : "";
  return s.coversAll
    ? `Capo ${s.fret} — every chord becomes an open shape${where}: ${s.shapes.join(" · ")}`
    : `Capo ${s.fret} — ${s.openCount} of ${s.total} shapes become open${where}`;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function ResultView({ result }: { result: SavedAnalysis }) {
  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(0);
  const [preferFlats, setPreferFlats] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [view, setView] = useState<"chords" | "lyrics" | "tab">("chords");
  const [positionSec, setPositionSec] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const seekRef = useRef<((s: number) => void) | null>(null);

  // --- persisted per-analysis settings -------------------------------------
  const [tuningId, setTuningId] = useState(result.tuning ?? "standard");
  const [lyrics, setLyrics] = useState(result.lyrics ?? "");
  const [alignment, setAlignment] = useState<LyricAlignment | null>(result.lyricAlignment);
  const [lyricWords, setLyricWords] = useState<TranscriptWord[] | null>(result.lyricWords);
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [draftSeed, setDraftSeed] = useState<string | null>(null);
  const [pendingWords, setPendingWords] = useState<TranscriptWord[] | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabData | null>(result.tab);
  const [tabbing, setTabbing] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  const tuning = useMemo(() => resolveTuning(tuningId), [tuningId]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/analyses/${result.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `HTTP ${res.status}`);
      }
    },
    [result.id],
  );

  const changeTuning = useCallback(
    (id: string) => {
      setTuningId(id);
      void patch({ tuning: id }).catch(() => {});
    },
    [patch],
  );

  const changeAlignment = useCallback(
    (next: LyricAlignment | null) => {
      setAlignment(next);
      void patch({ lyricAlignment: next }).catch(() => {});
    },
    [patch],
  );

  const saveLyrics = useCallback(
    async (text: string) => {
      setLyricsBusy(true);
      setLyricsError(null);
      // A fresh transcription carries its word timings; a plain edit keeps them.
      const body: Record<string, unknown> = { lyrics: text };
      if (pendingWords) body.lyricWords = pendingWords;
      try {
        await patch(body);
        setLyrics(text.trim());
        if (pendingWords) setLyricWords(pendingWords);
        else if (!text.trim()) setLyricWords(null);
        setPendingWords(null);
        setDraftSeed(null);
        setEditingLyrics(false);
      } catch (err) {
        setLyricsError(err instanceof Error ? err.message : "Couldn't save");
      } finally {
        setLyricsBusy(false);
      }
    },
    [patch, pendingWords],
  );

  const transcribe = useCallback(
    async (file?: File) => {
      setTranscribing(true);
      setTranscribeError(null);
      try {
        const res = file
          ? await fetch(`/api/analyses/${result.id}/transcribe`, {
              method: "POST",
              body: (() => {
                const fd = new FormData();
                fd.append("file", file);
                return fd;
              })(),
            })
          : await fetch(`/api/analyses/${result.id}/transcribe`, { method: "POST" });
        const body = (await res.json().catch(() => null)) as
          | { text?: string; words?: TranscriptWord[]; error?: string }
          | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        setPendingWords(body?.words ?? []);
        setDraftSeed(body?.text ?? "");
        setEditingLyrics(true);
      } catch (err) {
        setTranscribeError(
          err instanceof Error ? err.message : "Couldn't transcribe the audio",
        );
      } finally {
        setTranscribing(false);
      }
    },
    [result.id],
  );

  const generateTab = useCallback(
    async (file?: File) => {
      setTabbing(true);
      setTabError(null);
      const qs = `?tuning=${encodeURIComponent(tuningId)}`;
      try {
        const res = file
          ? await fetch(`/api/analyses/${result.id}/tab${qs}`, {
              method: "POST",
              body: (() => {
                const fd = new FormData();
                fd.append("file", file);
                return fd;
              })(),
            })
          : await fetch(`/api/analyses/${result.id}/tab${qs}`, { method: "POST" });
        const body = (await res.json().catch(() => null)) as
          | { ascii?: string; note_count?: number; error?: string }
          | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        const next: TabData = {
          ascii: body?.ascii ?? "",
          tuning: tuningId,
          noteCount: body?.note_count ?? 0,
        };
        setTab(next);
        void patch({ tab: next }).catch(() => {});
      } catch (err) {
        setTabError(err instanceof Error ? err.message : "Couldn't transcribe the tab");
      } finally {
        setTabbing(false);
      }
    },
    [result.id, tuningId, patch],
  );

  const seek = useCallback((s: number) => {
    seekRef.current?.(s);
    setPositionSec(s);
  }, []);

  const offset = transpose - capo;

  const shownSegments = useMemo<ChordSegment[]>(
    () =>
      result.segments.map((s) => ({
        ...s,
        label: transposeChord(s.label, offset, preferFlats),
      })),
    [result.segments, offset, preferFlats],
  );

  const shownVocab = useMemo(() => chordVocabulary(shownSegments), [shownSegments]);
  const originalKey = result.key ?? null;
  const soundingKey = transposeKey(originalKey, transpose, preferFlats);
  const shapeKey = transposeKey(originalKey, offset, preferFlats);

  const suggestion = useMemo(() => {
    // Capo suggestions assume standard open shapes.
    if (!isStandard(tuning)) return null;
    const soundingVocab = chordVocabulary(result.segments).map((c) =>
      transposeChord(c, transpose, preferFlats),
    );
    return suggestCapo(soundingVocab, transposeKey(originalKey, transpose, preferFlats));
  }, [result.segments, transpose, preferFlats, originalKey, tuning]);

  // Auto-scroll the chord sheet.
  useEffect(() => {
    if (!scrolling) return;
    const el = getScrollParent(rootRef.current);
    if (!el) return;

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += speed * 16 * ((now - last) / 1000); // ~32 px/s at speed 2
      last = now;
      const whole = Math.floor(acc);
      if (whole >= 1) {
        const before = el.scrollTop;
        el.scrollTop = before + whole;
        acc -= whole;
        if (el.scrollTop === before || el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setScrolling(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const stop = () => setScrolling(false);
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchmove", stop, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, [scrolling, speed]);

  return (
    <TuningProvider value={tuning}>
    <section ref={rootRef} className="space-y-6">
      <header className="space-y-1">
        <h2 className="font-display text-xl font-semibold">
          {result.source.title ?? result.source.reference}
        </h2>
        <p className="text-sm text-foreground/60">
          {result.source.kind === "youtube" ? "YouTube" : "Upload"} ·{" "}
          {formatTime(result.source.durationSec)}
        </p>
      </header>

      {/* Sticky playing-tools bar */}
      <div className="sticky top-0 z-10 -mx-4 border-y border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Stepper
            label="Transpose"
            display={transpose > 0 ? `+${transpose}` : `${transpose}`}
            canReset={transpose !== 0}
            onDec={() => setTranspose((t) => clamp(t - 1, -11, 11))}
            onInc={() => setTranspose((t) => clamp(t + 1, -11, 11))}
            onReset={() => setTranspose(0)}
          />
          <Stepper
            label="Capo"
            display={capo === 0 ? "None" : `${capo}`}
            canReset={capo !== 0}
            onDec={() => setCapo((c) => clamp(c - 1, 0, 9))}
            onInc={() => setCapo((c) => clamp(c + 1, 0, 9))}
            onReset={() => setCapo(0)}
          />
          <label className="flex items-center gap-1.5">
            <span className="text-foreground/60">Tuning</span>
            <select
              value={tuningId}
              onChange={(e) => changeTuning(e.target.value)}
              className="rounded-md border border-border bg-transparent px-1.5 py-1 text-xs outline-none focus:border-accent"
            >
              {TUNINGS.map((t) => (
                <option key={t.id} value={t.id} className="bg-surface">
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setScrolling((s) => !s)}
              className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-accent-soft"
            >
              {scrolling ? "❚❚ Stop" : "▶ Auto-scroll"}
            </button>
            {scrolling && (
              <div className="flex items-center rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setSpeed((s) => clamp(s - 1, 1, 6))}
                  aria-label="Slower"
                  className="px-2 py-0.5 text-base leading-none hover:bg-accent-soft"
                >
                  −
                </button>
                <span className="border-x border-border px-2 py-0.5 font-mono text-xs">{speed}</span>
                <button
                  type="button"
                  onClick={() => setSpeed((s) => clamp(s + 1, 1, 6))}
                  aria-label="Faster"
                  className="px-2 py-0.5 text-base leading-none hover:bg-accent-soft"
                >
                  +
                </button>
              </div>
            )}
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-1 text-xs text-foreground/60">
            <input
              type="checkbox"
              checked={preferFlats}
              onChange={(e) => setPreferFlats(e.target.checked)}
            />
            prefer ♭
          </label>
        </div>

        {suggestion && (
          <p className="mt-1.5 text-xs text-foreground/70">
            🎸 {capoText(suggestion)}
            {suggestion.fret > 0 && suggestion.fret !== capo && (
              <button
                type="button"
                onClick={() => setCapo(suggestion.fret)}
                className="ml-1.5 font-medium text-accent underline"
              >
                use it
              </button>
            )}
          </p>
        )}
      </div>

      <MediaPlayer source={result.source} onTime={setPositionSec} seekRef={seekRef} />

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-4">
        <Stat label="Key" value={soundingKey ?? "—"} />
        <Stat label="Tempo" value={result.bpm ? `${Math.round(result.bpm)} BPM` : "—"} />
        <Stat label="Chords" value={String(shownVocab.length)} />
        <Stat label="Method" value={result.engine.method} />
      </div>

      {shownVocab.length > 0 && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-2">
            {shownVocab.map((c) => (
              <ChordName
                key={c}
                label={c}
                className="rounded-full bg-accent-soft px-3 py-1 font-mono text-sm font-semibold text-accent"
              />
            ))}
          </div>
          <p className="text-xs text-foreground/50">
            Hover a chord to see its finger pattern.
            {capo > 0
              ? ` Shapes shown are for capo ${capo}${shapeKey ? ` (in ${shapeKey})` : ""}.`
              : ""}
            {!isStandard(tuning) ? ` Fingerings are for ${tuning.name}.` : ""}
          </p>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Timeline
        </h3>
        <ChordTimeline
          segments={shownSegments}
          durationSec={result.source.durationSec}
          positionSec={positionSec}
          onSeek={seek}
        />
      </div>

      <div className="space-y-3">
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-sm sm:w-fit">
          {(["chords", "lyrics", "tab"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`flex-1 rounded-md px-4 py-1.5 font-medium capitalize transition-colors sm:flex-none ${
                view === v ? "bg-accent text-accent-contrast shadow-sm" : "text-foreground/60"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {view === "chords" && (
          <ChordChart segments={shownSegments} positionSec={positionSec} onSeek={seek} />
        )}
        {view === "tab" && (
          <ChordTab
            tab={tab}
            sourceKind={result.source.kind}
            onGenerate={generateTab}
            generating={tabbing}
            error={tabError}
          />
        )}
        {view === "lyrics" &&
          (editingLyrics ? (
            <LyricsEditor
              initial={draftSeed ?? lyrics}
              busy={lyricsBusy}
              error={lyricsError}
              note={
                draftSeed !== null
                  ? "Auto-transcribed from the audio — fix any wrong words, then Save."
                  : undefined
              }
              onSave={saveLyrics}
              onCancel={() => {
                setDraftSeed(null);
                setPendingWords(null);
                setEditingLyrics(false);
              }}
            />
          ) : (
            <LyricsView
              segments={shownSegments}
              durationSec={result.source.durationSec}
              lyrics={lyrics}
              alignment={alignment}
              words={lyricWords}
              sourceKind={result.source.kind}
              positionSec={positionSec}
              onSeek={seek}
              onEditLyrics={() => {
                setLyricsError(null);
                setEditingLyrics(true);
              }}
              onAlignmentChange={changeAlignment}
              onTranscribe={transcribe}
              transcribing={transcribing}
              transcribeError={transcribeError}
            />
          ))}
      </div>

      <details className="text-xs text-foreground/50">
        <summary className="cursor-pointer">Engine details</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-black/5 p-3 dark:bg-white/5">
          {JSON.stringify(result.engine, null, 2)}
        </pre>
      </details>
    </section>
    </TuningProvider>
  );
}

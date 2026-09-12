"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { centsFrom, detectPitch, freqToNote, median } from "@/lib/pitch";
import { resolveTuning, stringTargets, TUNINGS } from "@/lib/tuning";

type Phase = "starting" | "running" | "denied" | "error" | "insecure";

interface Reading {
  /** Octave-corrected detected frequency. */
  freq: number;
  note: { name: string; octave: number };
  string: { index: number; name: string; octave: number };
  /** Signed cents from the target string (negative = flat). */
  cents: number;
}

const IN_TUNE_CENTS = 4;

/** A microphone chromatic/guitar tuner. Autocorrelation pitch detection with
 *  median smoothing; snaps to the nearest string of the chosen tuning. */
export function GuitarTuner({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [tuningId, setTuningId] = useState("standard");
  const [reading, setReading] = useState<Reading | null>(null);

  // String indices confirmed in tune this session — they stay green so you can
  // see which strings are still to do.
  const [tuned, setTuned] = useState<ReadonlySet<number>>(() => new Set());

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const histRef = useRef<number[]>([]);
  const lastRunRef = useRef(0);
  const silentRef = useRef(0);
  const streakRef = useRef({ i: -1, count: 0 });
  const tuningRef = useRef(tuningId);
  useEffect(() => {
    tuningRef.current = tuningId;
  }, [tuningId]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    streamRef.current = null;
    ctxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setPhase("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("insecure");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Browser DSP mangles pitch — turn it all off.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext;
      const ctx = new AudioCtx();
      ctxRef.current = ctx;
      await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser); // not to destination — no feedback

      const buf = new Float32Array(analyser.fftSize);
      histRef.current = [];
      lastRunRef.current = 0;
      silentRef.current = 0;

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        const now = performance.now();
        if (now - lastRunRef.current < 55) return; // ~18 Hz detection
        lastRunRef.current = now;

        analyser.getFloatTimeDomainData(buf);
        const f = detectPitch(buf, ctx.sampleRate);
        const hist = histRef.current;

        if (f <= 0) {
          if (!silentRef.current) silentRef.current = now;
          else if (now - silentRef.current > 450) {
            histRef.current = [];
            setReading(null);
          }
          return;
        }
        silentRef.current = 0;

        hist.push(f);
        if (hist.length > 8) hist.shift();
        if (hist.length < 4) return;

        const spreadCents = 1200 * Math.log2(Math.max(...hist) / Math.min(...hist));
        if (spreadCents > 55) return; // still settling

        const med = median(hist);
        const targets = stringTargets(resolveTuning(tuningRef.current));

        // Pick the string + octave of `med` that lands closest to a target.
        let best = { i: 0, cents: Infinity, freq: med };
        for (const cand of [med, med / 2, med * 2]) {
          targets.forEach((t, i) => {
            const c = centsFrom(cand, t.freq);
            if (Math.abs(c) < Math.abs(best.cents)) best = { i, cents: c, freq: cand };
          });
        }

        const n = freqToNote(best.freq);
        const s = targets[best.i];
        const cents = Math.round(best.cents);
        setReading({
          freq: best.freq,
          note: { name: n.name, octave: n.octave },
          string: { index: best.i, name: s.name, octave: s.octave },
          cents,
        });

        // Held in tune for a handful of frames → lock this string in as done.
        const streak = streakRef.current;
        if (Math.abs(cents) <= IN_TUNE_CENTS) {
          const count = streak.i === best.i ? streak.count + 1 : 1;
          streakRef.current = { i: best.i, count };
          if (count >= 4) {
            setTuned((prev) => (prev.has(best.i) ? prev : new Set(prev).add(best.i)));
          }
        } else if (streak.i === best.i) {
          streakRef.current = { i: best.i, count: 0 };
        }
      };

      setPhase("running");
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  }, []);

  useEffect(() => {
    // Starting the mic is the whole point of mounting this dialog; it reports
    // permission/progress through `phase`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
    return stop;
  }, [start, stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A permission prompt the user leaves unanswered keeps getUserMedia pending
  // forever — after a bit, hint at where to look.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlow(false);
    if (phase !== "starting") return;
    const id = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(id);
  }, [phase]);

  const targets = stringTargets(resolveTuning(tuningId));
  const cents = reading?.cents ?? 0;
  const inTune = reading != null && Math.abs(cents) <= IN_TUNE_CENTS;
  const needlePct = 50 + Math.max(-50, Math.min(50, cents));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Guitar tuner"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Guitar tuner</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tuner"
            className="rounded px-1.5 py-0.5 text-foreground/50 hover:bg-accent-soft hover:text-accent"
          >
            ✕
          </button>
        </div>

        <label className="mb-4 flex items-center gap-2 text-xs text-foreground/60">
          Tuning
          <select
            value={tuningId}
            onChange={(e) => {
              setTuningId(e.target.value);
              histRef.current = [];
              streakRef.current = { i: -1, count: 0 };
              setTuned(new Set());
            }}
            className="rounded-md border border-border bg-transparent px-1.5 py-1 text-xs outline-none focus:border-accent"
          >
            {TUNINGS.map((t) => (
              <option key={t.id} value={t.id} className="bg-surface">
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {phase === "running" ? (
          <>
            <div className="text-center">
              <div
                className={`font-display text-5xl font-bold tabular-nums ${
                  inTune ? "text-green-500" : "text-foreground"
                }`}
              >
                {reading ? `${reading.string.name}${reading.string.octave}` : "—"}
              </div>
              <div className="mt-1 h-4 text-sm text-foreground/55">
                {reading ? `${reading.freq.toFixed(1)} Hz` : "play one string"}
              </div>
            </div>

            {/* cents meter */}
            <div className="mt-4">
              <div className="relative h-9 rounded-lg border border-border bg-surface-2">
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-foreground/25" />
                {[-40, -20, 20, 40].map((m) => (
                  <div
                    key={m}
                    className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-foreground/15"
                    style={{ left: `${50 + m}%` }}
                  />
                ))}
                {reading && (
                  <div
                    className={`absolute top-1 h-7 w-1 -translate-x-1/2 rounded-full transition-[left] duration-100 ${
                      inTune ? "bg-green-500" : "bg-accent"
                    }`}
                    style={{ left: `${needlePct}%` }}
                  />
                )}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-foreground/40">
                <span>♭ &minus;50</span>
                <span>
                  {reading
                    ? inTune
                      ? "in tune ✓"
                      : `${cents > 0 ? "+" : ""}${cents}¢ — tune ${cents < 0 ? "up" : "down"}`
                    : ""}
                </span>
                <span>+50 ♯</span>
              </div>
            </div>

            {/* string chips */}
            <div className="mt-4 flex justify-between gap-1">
              {targets.map((t, i) => {
                const isNear = reading?.string.index === i;
                const done = tuned.has(i);
                const green = done || (isNear && inTune);
                return (
                  <div
                    key={i}
                    className={`relative flex-1 rounded-md border py-1.5 text-center font-mono text-sm transition-colors ${
                      green
                        ? "border-green-500 bg-green-500/10 text-green-500"
                        : isNear
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border text-foreground/55"
                    }`}
                  >
                    {t.name}
                    <span className="text-[10px] opacity-60">{t.octave}</span>
                    {done && (
                      <span className="absolute right-0.5 top-0 text-[9px] text-green-500">✓</span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-center text-[11px] text-foreground/40">
              {tuned.size === targets.length
                ? "All strings in tune 🎉"
                : "Mic is live — pick one string at a time, near the pickup."}
              {tuned.size > 0 && tuned.size < targets.length && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => {
                      streakRef.current = { i: -1, count: 0 };
                      setTuned(new Set());
                    }}
                    className="underline hover:text-accent"
                  >
                    reset
                  </button>
                </>
              )}
            </p>
          </>
        ) : phase === "starting" ? (
          <p className="py-6 text-center text-sm text-foreground/60">
            Waiting for microphone access…
            {slow && (
              <span className="mt-1 block text-xs text-foreground/45">
                Look for a permission prompt near your address bar.
              </span>
            )}
          </p>
        ) : (
          <div className="space-y-3 py-4 text-sm text-foreground/70">
            <p>
              {phase === "denied"
                ? "Microphone access was blocked. Allow it for this site in your browser, then retry."
                : phase === "insecure"
                  ? "The tuner needs microphone access, which browsers only allow over HTTPS or on localhost."
                  : "Couldn't start the microphone."}
            </p>
            {phase !== "insecure" && (
              <button
                type="button"
                onClick={() => void start()}
                className="rounded-lg bg-accent-strong px-3 py-1.5 text-sm font-semibold text-accent-contrast hover:bg-accent-strong-hover"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

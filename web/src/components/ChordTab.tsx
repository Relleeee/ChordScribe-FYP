"use client";

import { useRef } from "react";
import type { TabData } from "@/lib/types";
import { resolveTuning } from "@/lib/tuning";
import { useTuning } from "./TuningContext";

interface Props {
  tab: TabData | null;
  sourceKind: "upload" | "youtube";
  onGenerate: (file?: File) => void;
  generating: boolean;
  error: string | null;
}

/**
 * Guitar tab transcribed from the audio — the notes actually played, not a
 * generic pattern over the detected chords. The engine runs `basic-pitch`
 * (polyphonic note transcription) then assigns each note to a string/fret.
 * Opt-in and slow; most faithful on solo or sparsely-arranged guitar.
 */
export function ChordTab({ tab, sourceKind, onGenerate, generating, error }: Props) {
  const tuning = useTuning();
  const fileRef = useRef<HTMLInputElement>(null);
  const stale = tab != null && tab.tuning !== tuning.id;

  const button = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onGenerate(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={generating}
        onClick={() => (sourceKind === "youtube" ? onGenerate() : fileRef.current?.click())}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft disabled:opacity-50"
      >
        {generating
          ? "Transcribing notes… (up to a couple of minutes)"
          : tab
            ? "Re-transcribe"
            : "Transcribe tab from audio"}
      </button>
    </>
  );

  if (!tab) {
    return (
      <div className="space-y-2 text-sm text-foreground/60">
        <p>
          This transcribes the <span className="font-medium">notes actually played</span> from
          the audio and lays them out as tab. It works best on solo or lightly-arranged
          guitar — a dense band mix comes out noisier.
        </p>
        <div className="flex flex-wrap items-center gap-2">{button}</div>
        {sourceKind === "upload" && (
          <p className="text-xs text-foreground/45">
            The file isn&apos;t stored on the server, so pick it again to transcribe.
          </p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
        <span>
          {tab.noteCount.toLocaleString()} notes transcribed
          {tab.tuning !== "standard" && ` · ${resolveTuning(tab.tuning).name}`}
        </span>
        {button}
      </div>
      {stale && (
        <p className="text-xs text-amber-500">
          Fret positions were assigned for {resolveTuning(tab.tuning).name}. Re-transcribe for{" "}
          {tuning.name}.
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <pre className="themed-scrollbar overflow-x-auto rounded-lg border border-border bg-surface p-3 text-xs leading-5 text-foreground/90">
        {tab.ascii}
      </pre>
      <p className="text-[11px] text-foreground/40">
        Transcribed with basic-pitch. Note detection is solid on clean recordings; string/fret
        choices are one playable option, not necessarily the easiest.
      </p>
    </div>
  );
}

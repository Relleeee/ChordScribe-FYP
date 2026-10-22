import { readNdjson } from "./ndjson";
import type { AnalysisResult, AnalysisStage } from "./types";

/**
 * Base URL of the Python chord-recognition service (`engine/`).
 * Defaults to the local dev port used by `uvicorn app.main:app`.
 */
export const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:8000";

/** Set ENGINE_MOCK=1 to bypass the Python service and return sample data. */
export const ENGINE_MOCK = process.env.ENGINE_MOCK === "1";

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

async function readError(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { detail?: string; error?: string };
    return body.detail ?? body.error;
  } catch {
    return undefined;
  }
}

/** Per-request engine options. */
export interface AnalyzeOptions {
  /** Separate vocals/drums first (Demucs) — slower, more accurate on dense mixes. */
  highAccuracy?: boolean;
}

/** Ask the engine to analyse an uploaded audio/video file. */
export async function analyzeUpload(
  file: File,
  opts: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (opts.highAccuracy) form.append("separate", "1");

  const res = await fetch(`${ENGINE_URL}/analyze`, { method: "POST", body: form });
  if (!res.ok) {
    throw new EngineError("Engine failed to analyse upload", res.status, await readError(res));
  }
  return (await res.json()) as AnalysisResult;
}

/** Ask the engine to fetch a YouTube video and analyse its audio. */
export async function analyzeYouTube(
  youtubeUrl: string,
  opts: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const res = await fetch(`${ENGINE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      youtube_url: youtubeUrl,
      ...(opts.highAccuracy ? { separate: true } : {}),
    }),
  });
  if (!res.ok) {
    throw new EngineError("Engine failed to analyse YouTube URL", res.status, await readError(res));
  }
  return (await res.json()) as AnalysisResult;
}

/** A line of the engine's NDJSON progress stream (`POST /analyze`, Accept: application/x-ndjson). */
export type EngineEvent =
  | { type: "stage"; stage: AnalysisStage }
  | { type: "result"; result: AnalysisResult }
  | { type: "error"; status: number; detail: string };

export type AnalyzeInput = { kind: "youtube"; url: string } | { kind: "upload"; file: File };

/**
 * Analyse with live progress: yields each pipeline stage as the engine starts
 * it, then the result (or an error event). Request-level failures (engine
 * down, bad input) throw `EngineError` before anything is yielded.
 */
export async function* analyzeStream(
  input: AnalyzeInput,
  opts: AnalyzeOptions = {},
): AsyncGenerator<EngineEvent> {
  let body: BodyInit;
  const headers: Record<string, string> = { Accept: "application/x-ndjson" };
  if (input.kind === "upload") {
    const form = new FormData();
    form.append("file", input.file, input.file.name);
    if (opts.highAccuracy) form.append("separate", "1");
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      youtube_url: input.url,
      ...(opts.highAccuracy ? { separate: true } : {}),
    });
  }

  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/analyze`, { method: "POST", headers, body });
  } catch {
    throw new EngineError("Chord engine is not reachable", 0, `Is it running at ${ENGINE_URL}?`);
  }
  if (!res.ok || !res.body) {
    throw new EngineError("Engine failed to analyse the track", res.status, await readError(res));
  }
  yield* readNdjson<EngineEvent>(res.body);
}

export async function engineHealth(): Promise<{ ok: boolean; version?: string }> {
  try {
    const res = await fetch(`${ENGINE_URL}/health`, { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { version?: string };
    return { ok: true, version: body.version };
  } catch {
    return { ok: false };
  }
}

import type { AnalysisResult } from "./types";

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

/** Ask the engine to analyse an uploaded audio/video file. */
export async function analyzeUpload(file: File): Promise<AnalysisResult> {
  const form = new FormData();
  form.append("file", file, file.name);

  const res = await fetch(`${ENGINE_URL}/analyze`, { method: "POST", body: form });
  if (!res.ok) {
    throw new EngineError("Engine failed to analyse upload", res.status, await readError(res));
  }
  return (await res.json()) as AnalysisResult;
}

/** Ask the engine to fetch a YouTube video and analyse its audio. */
export async function analyzeYouTube(youtubeUrl: string): Promise<AnalysisResult> {
  const res = await fetch(`${ENGINE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ youtube_url: youtubeUrl }),
  });
  if (!res.ok) {
    throw new EngineError("Engine failed to analyse YouTube URL", res.status, await readError(res));
  }
  return (await res.json()) as AnalysisResult;
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

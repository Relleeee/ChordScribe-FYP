import type { NextRequest } from "next/server";
import {
  analyzeStream,
  analyzeUpload,
  analyzeYouTube,
  EngineError,
  ENGINE_MOCK,
  type AnalyzeInput,
  type EngineEvent,
} from "@/lib/engine";
import { MOCK_RESULT } from "@/lib/mock";
import { getCurrentUser } from "@/lib/auth";
import { saveAnalysis } from "@/lib/analyses";
import { ndjsonStream } from "@/lib/ndjson";
import type { AnalysisResult, AnalysisStage, AnalyzeEvent, ApiError } from "@/lib/types";

// Chord analysis can take a while; give the handler room on platforms that cap it.
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // a phone-recorded MP4 easily passes 50MB

function bad(status: number, error: string, detail?: string): Response {
  return Response.json({ error, detail } satisfies ApiError, { status });
}

type Parsed = { input: AnalyzeInput; highAccuracy: boolean } | { error: Response };

async function parse(request: NextRequest): Promise<Parsed> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      youtube_url?: string;
      highAccuracy?: boolean;
    } | null;
    const url = body?.youtube_url?.trim();
    if (!url) return { error: bad(400, "Missing 'youtube_url'") };
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
      return { error: bad(400, "Not a recognised YouTube URL") };
    }
    return { input: { kind: "youtube", url }, highAccuracy: body?.highAccuracy === true };
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return { error: bad(400, "Missing 'file' field") };
    if (file.size === 0) return { error: bad(400, "Uploaded file is empty") };
    if (file.size > MAX_UPLOAD_BYTES) {
      return { error: bad(413, `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`) };
    }
    return { input: { kind: "upload", file }, highAccuracy: form.get("highAccuracy") === "1" };
  }

  return { error: bad(415, "Send JSON ({ youtube_url }) or multipart/form-data ({ file })") };
}

/** ENGINE_MOCK: walk through the stages quickly so the progress UI is testable. */
async function* mockEvents(): AsyncGenerator<EngineEvent | { type: "mock-result" }> {
  const stages: AnalysisStage[] = ["fetch", "decode", "features", "chords", "key"];
  for (const stage of stages) {
    yield { type: "stage", stage };
    await new Promise((r) => setTimeout(r, 250));
  }
  yield { type: "mock-result" };
}

/**
 * POST /api/analyze — analyse a YouTube URL (JSON) or an upload (multipart) and
 * save it. With `Accept: application/x-ndjson` the response streams
 * `AnalyzeEvent`s (each pipeline stage, then the saved analysis) so the UI can
 * show progress; otherwise it's a single JSON `SavedAnalysis`.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return bad(401, "Sign in to analyse a track");

  const parsed = await parse(request);
  if ("error" in parsed) return parsed.error;
  const { input, highAccuracy } = parsed;
  const userId = user.id;

  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    async function* events(): AsyncGenerator<AnalyzeEvent> {
      try {
        let result: AnalysisResult | null = null;
        const source = ENGINE_MOCK ? mockEvents() : analyzeStream(input, { highAccuracy });
        for await (const e of source) {
          if (e.type === "stage") yield e;
          else if (e.type === "mock-result") result = MOCK_RESULT;
          else if (e.type === "result") result = e.result;
          else if (e.type === "error") {
            yield { type: "error", error: "Analysis failed", detail: e.detail };
            return;
          }
        }
        if (!result) throw new Error("engine stream ended without a result");
        yield { type: "result", analysis: await saveAnalysis(userId, result) };
      } catch (err) {
        if (err instanceof EngineError) {
          yield { type: "error", error: err.message, detail: err.detail };
        } else {
          console.error("[analyze] unexpected error", err);
          yield { type: "error", error: "Unexpected error while analysing" };
        }
      }
    }
    return new Response(ndjsonStream(events()), {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
    });
  }

  try {
    const result = ENGINE_MOCK
      ? MOCK_RESULT
      : input.kind === "youtube"
        ? await analyzeYouTube(input.url, { highAccuracy })
        : await analyzeUpload(input.file, { highAccuracy });
    return Response.json(await saveAnalysis(user.id, result));
  } catch (err) {
    if (err instanceof EngineError) {
      return bad(err.status === 0 ? 502 : err.status, err.message, err.detail);
    }
    console.error("[analyze] unexpected error", err);
    return bad(500, "Unexpected error while analysing");
  }
}

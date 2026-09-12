import type { NextRequest } from "next/server";
import { analyzeUpload, analyzeYouTube, EngineError, ENGINE_MOCK } from "@/lib/engine";
import { MOCK_RESULT } from "@/lib/mock";
import { getCurrentUser } from "@/lib/auth";
import { saveAnalysis } from "@/lib/analyses";
import type { AnalysisResult, ApiError } from "@/lib/types";

// Chord analysis can take a while; give the handler room on platforms that cap it.
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // a phone-recorded MP4 easily passes 50MB

function bad(status: number, error: string, detail?: string): Response {
  return Response.json({ error, detail } satisfies ApiError, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return bad(401, "Sign in to analyse a track");

  const contentType = request.headers.get("content-type") ?? "";

  try {
    let result: AnalysisResult;

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as { youtube_url?: string } | null;
      const url = body?.youtube_url?.trim();
      if (!url) return bad(400, "Missing 'youtube_url'");
      if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
        return bad(400, "Not a recognised YouTube URL");
      }
      result = ENGINE_MOCK ? MOCK_RESULT : await analyzeYouTube(url);
    } else if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return bad(400, "Missing 'file' field");
      if (file.size === 0) return bad(400, "Uploaded file is empty");
      if (file.size > MAX_UPLOAD_BYTES) {
        return bad(413, `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`);
      }
      result = ENGINE_MOCK ? MOCK_RESULT : await analyzeUpload(file);
    } else {
      return bad(415, "Send JSON ({ youtube_url }) or multipart/form-data ({ file })");
    }

    const saved = await saveAnalysis(user.id, result);
    return Response.json(saved);
  } catch (err) {
    if (err instanceof EngineError) {
      return bad(err.status === 0 ? 502 : err.status, err.message, err.detail);
    }
    console.error("[analyze] unexpected error", err);
    return bad(500, "Unexpected error while analysing");
  }
}

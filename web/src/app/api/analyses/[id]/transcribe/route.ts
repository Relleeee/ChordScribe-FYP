import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAnalysis } from "@/lib/analyses";
import { ENGINE_URL } from "@/lib/engine";
import type { ApiError, TranscriptionResult } from "@/lib/types";

// Whisper on CPU is slow — give the handler room on platforms that cap it.
export const maxDuration = 300;

function bad(status: number, error: string, detail?: string): Response {
  return Response.json({ error, detail } satisfies ApiError, { status });
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/analyses/[id]/transcribe">,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return bad(401, "Not signed in");

  const { id } = await ctx.params;
  const analysis = await getAnalysis(user.id, id);
  if (!analysis) return bad(404, "Not found");

  const contentType = req.headers.get("content-type") ?? "";

  let engineRes: Response;
  try {
    if (contentType.includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File) || file.size === 0) return bad(400, "Missing audio file");
      const fwd = new FormData();
      fwd.append("file", file, file.name);
      engineRes = await fetch(`${ENGINE_URL}/transcribe`, { method: "POST", body: fwd });
    } else if (analysis.source.kind === "youtube") {
      engineRes = await fetch(`${ENGINE_URL}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtube_url: `https://www.youtube.com/watch?v=${analysis.source.reference}`,
        }),
      });
    } else {
      return bad(400, "Pick the audio file to transcribe", "upload-needs-file");
    }
  } catch {
    return bad(502, "The transcription engine isn't reachable — is it running?");
  }

  if (!engineRes.ok) {
    const b = (await engineRes.json().catch(() => null)) as ApiError | null;
    if (engineRes.status === 501) {
      return bad(501, "Transcription isn't set up on the engine (needs faster-whisper)");
    }
    return bad(502, b?.detail ?? b?.error ?? "Transcription failed");
  }

  const result = (await engineRes.json()) as TranscriptionResult;
  return Response.json(result);
}

import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAnalysis } from "@/lib/analyses";
import { ENGINE_URL } from "@/lib/engine";
import type { ApiError, TabResult } from "@/lib/types";

// Note transcription on CPU is slow — give the handler room.
export const maxDuration = 300;

function bad(status: number, error: string, detail?: string): Response {
  return Response.json({ error, detail } satisfies ApiError, { status });
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/analyses/[id]/tab">,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return bad(401, "Not signed in");

  const { id } = await ctx.params;
  const analysis = await getAnalysis(user.id, id);
  if (!analysis) return bad(404, "Not found");

  const url = new URL(req.url);
  const tuning = url.searchParams.get("tuning") ?? "standard";
  const contentType = req.headers.get("content-type") ?? "";

  // The chord segments guide the tab: strums are written as the chord's grip,
  // and stray non-chord notes (vocal / other-instrument bleed) are pruned.
  const chords = JSON.stringify(
    analysis.segments.map((s) => ({ start: s.start, end: s.end, label: s.label })),
  );

  let engineRes: Response;
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return bad(400, "Missing audio file");
      const fwd = new FormData();
      fwd.append("file", file, file.name);
      fwd.append("tuning", tuning);
      fwd.append("chords", chords);
      if (analysis.bpm != null) fwd.append("bpm", String(analysis.bpm));
      engineRes = await fetch(`${ENGINE_URL}/tab`, { method: "POST", body: fwd });
    } else if (analysis.source.kind === "youtube") {
      engineRes = await fetch(`${ENGINE_URL}/tab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtube_url: `https://www.youtube.com/watch?v=${analysis.source.reference}`,
          tuning,
          bpm: analysis.bpm ?? null,
          chords: JSON.parse(chords),
        }),
      });
    } else {
      return bad(400, "Pick the audio file to transcribe", "upload-needs-file");
    }
  } catch {
    return bad(502, "The engine isn't reachable — is it running?");
  }

  if (!engineRes.ok) {
    const b = (await engineRes.json().catch(() => null)) as ApiError | null;
    if (engineRes.status === 501) {
      return bad(501, "Tab transcription isn't set up on the engine (needs basic-pitch)");
    }
    return bad(502, b?.detail ?? b?.error ?? "Tab generation failed");
  }

  const result = (await engineRes.json()) as TabResult;
  return Response.json(result);
}

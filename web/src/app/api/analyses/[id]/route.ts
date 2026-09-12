import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAnalysis } from "@/lib/analyses";
import type { TabData } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/analyses/[id]">,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  const analysis = await getAnalysis(user.id, id);
  if (!analysis) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(analysis);
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/analyses/[id]">,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | {
        title?: string;
        lyrics?: string | null;
        tuning?: string | null;
        lyricAlignment?: unknown;
        lyricWords?: unknown;
        tab?: unknown;
      }
    | null;

  const data: {
    title?: string;
    lyrics?: string | null;
    tuning?: string | null;
    lyricAlignment?: string | null;
    lyricWords?: string | null;
    tab?: string | null;
  } = {};

  if (body?.title !== undefined) {
    const title = body.title.trim();
    if (!title) return Response.json({ error: "Title can't be empty" }, { status: 400 });
    if (title.length > 100) return Response.json({ error: "Title is too long" }, { status: 400 });
    data.title = title;
  }

  if (body?.lyrics !== undefined) {
    const lyrics = body.lyrics?.trim() ?? "";
    if (lyrics.length > 20_000) {
      return Response.json({ error: "Lyrics are too long" }, { status: 400 });
    }
    data.lyrics = lyrics || null;
    // Word timings belong to a specific transcript — drop them when the lyrics
    // are cleared, unless the same request supplies a fresh set.
    if (!data.lyrics && body.lyricWords === undefined) data.lyricWords = null;
  }

  if (body?.lyricWords !== undefined) {
    const w = body.lyricWords;
    if (w === null) {
      data.lyricWords = null;
    } else if (
      Array.isArray(w) &&
      w.every(
        (e) =>
          e && typeof e === "object" && typeof e.t === "number" && typeof e.w === "string",
      )
    ) {
      const serialised = JSON.stringify(w);
      if (serialised.length > 200_000) {
        return Response.json({ error: "Transcript is too large" }, { status: 400 });
      }
      data.lyricWords = serialised;
    } else {
      return Response.json({ error: "Word timings are malformed" }, { status: 400 });
    }
  }

  if (body?.tuning !== undefined) {
    const tuning = body.tuning?.trim() ?? "";
    if (tuning.length > 64) {
      return Response.json({ error: "Tuning value is invalid" }, { status: 400 });
    }
    data.tuning = tuning && tuning !== "standard" ? tuning : null;
  }

  if (body?.tab !== undefined) {
    const t = body.tab;
    if (t === null) {
      data.tab = null;
    } else if (
      t &&
      typeof t === "object" &&
      typeof (t as TabData).ascii === "string" &&
      typeof (t as TabData).tuning === "string"
    ) {
      const serialised = JSON.stringify(t);
      if (serialised.length > 200_000) {
        return Response.json({ error: "Tab is too large" }, { status: 400 });
      }
      data.tab = serialised;
    } else {
      return Response.json({ error: "Tab is malformed" }, { status: 400 });
    }
  }

  if (body?.lyricAlignment !== undefined) {
    const a = body.lyricAlignment;
    if (a === null) {
      data.lyricAlignment = null;
    } else if (
      typeof a === "object" &&
      Array.isArray((a as { placements?: unknown }).placements)
    ) {
      const serialised = JSON.stringify(a);
      if (serialised.length > 100_000) {
        return Response.json({ error: "Alignment is too large" }, { status: 400 });
      }
      data.lyricAlignment = serialised;
    } else {
      return Response.json({ error: "Alignment is malformed" }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const { count } = await prisma.analysis.updateMany({ where: { id, userId: user.id }, data });
  if (count === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, ...data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/analyses/[id]">,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await ctx.params;
  const { count } = await prisma.analysis.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}

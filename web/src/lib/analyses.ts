import "server-only";

import type { Analysis } from "@prisma/client";
import { prisma } from "./db";
import type {
  AnalysisResult,
  AnalysisSummary,
  LyricAlignment,
  SavedAnalysis,
  TabData,
  TranscriptWord,
} from "./types";

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveAnalysis(
  userId: string,
  result: AnalysisResult,
): Promise<SavedAnalysis> {
  const row = await prisma.analysis.create({
    data: {
      userId,
      title: result.source.title ?? result.source.reference,
      sourceKind: result.source.kind,
      sourceRef: result.source.reference,
      durationSec: result.source.durationSec,
      bpm: result.bpm ?? null,
      musicalKey: result.key ?? null,
      result: JSON.stringify(result),
    },
  });
  return {
    ...result,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lyrics: null,
    lyricAlignment: null,
    lyricWords: null,
    tab: null,
    tuning: null,
  };
}

export function toSummary(row: Analysis): AnalysisSummary {
  return {
    id: row.id,
    title: row.title,
    sourceKind: row.sourceKind === "youtube" ? "youtube" : "upload",
    key: row.musicalKey,
    bpm: row.bpm,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAnalyses(userId: string, take = 50): Promise<AnalysisSummary[]> {
  const rows = await prisma.analysis.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(toSummary);
}

export async function getAnalysis(userId: string, id: string): Promise<SavedAnalysis | null> {
  const row = await prisma.analysis.findFirst({ where: { id, userId } });
  if (!row) return null;
  const result = JSON.parse(row.result) as AnalysisResult;
  return {
    ...result,
    // `row.title` is the single source of truth for display name — it may
    // have been renamed since the original media title was captured.
    source: { ...result.source, title: row.title },
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lyrics: row.lyrics,
    lyricAlignment: parseJson<LyricAlignment>(row.lyricAlignment),
    lyricWords: parseJson<TranscriptWord[]>(row.lyricWords),
    tab: parseJson<TabData>(row.tab),
    tuning: row.tuning,
  };
}

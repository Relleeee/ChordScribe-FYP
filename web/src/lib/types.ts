/**
 * Shared types for the ChordScribe analysis pipeline.
 * These mirror the Pydantic schemas in `engine/app/schemas.py` — keep them in sync.
 */

/** A single detected chord held over a span of the track. */
export interface ChordSegment {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  /** Chord label, e.g. "C", "Am", "G", or "N" for no-chord / silence. */
  label: string;
  /** Matcher confidence in [0, 1]. */
  confidence: number;
}

/** Metadata about the analysed source. */
export interface SourceInfo {
  kind: "upload" | "youtube";
  /** Original filename or YouTube video id. */
  reference: string;
  title?: string;
  durationSec: number;
}

/** The full result returned by the engine for one track. */
export interface AnalysisResult {
  source: SourceInfo;
  /** Estimated tempo in BPM, if the engine computed one. */
  bpm?: number;
  /** Detected musical key, e.g. "C major", if available. */
  key?: string;
  /** Ordered, non-overlapping chord segments covering the track. */
  segments: ChordSegment[];
  /** Engine version + parameters used, for reproducibility in evaluation. */
  engine: {
    version: string;
    method: string;
    params: Record<string, number | string | boolean>;
  };
}

/** Manual chord↔lyric placement for the Lyrics view. Keyed by segment start
 *  time so it survives transpose/capo (which change labels, not timing). */
export interface LyricPlacement {
  /** Segment start time in seconds (rounded to ms). */
  t: number;
  /** 0-based lyric line index. */
  line: number;
  /** 0-based character offset within that line. */
  ch: number;
}

export interface LyricAlignment {
  placements: LyricPlacement[];
}

/** One transcribed word with its start time, from the engine's `/transcribe`. */
export interface TranscriptWord {
  /** Start time in seconds. */
  t: number;
  /** The word as sung. */
  w: string;
}

/** An AnalysisResult persisted for a user, as returned by the API. */
export interface SavedAnalysis extends AnalysisResult {
  id: string;
  createdAt: string;
  /** User-supplied lyrics for the chord sheet (not auto-transcribed). */
  lyrics: string | null;
  /** Manual chord placements over the lyrics; null => auto-align. */
  lyricAlignment: LyricAlignment | null;
  /** Whisper word timings for the current lyrics; null => never transcribed. */
  lyricWords: TranscriptWord[] | null;
  /** Guitar tab transcribed from the audio; null => never generated. */
  tab: TabData | null;
  /** Guitar tuning: a preset id ("drop-d") or custom spec; null => standard. */
  tuning: string | null;
}

/** Response from `POST /api/analyses/[id]/transcribe`. */
export interface TranscriptionResult {
  text: string;
  words: TranscriptWord[];
  language?: string | null;
}

/** Transcribed guitar tab, persisted per analysis. `tuning` records which
 *  tuning the fret positions were assigned for. */
export interface TabData {
  ascii: string;
  tuning: string;
  noteCount: number;
}

/** Raw response from `POST /api/analyses/[id]/tab` (before it's saved). */
export interface TabResult {
  ascii: string;
  note_count: number;
  bpm?: number | null;
}

/** Lightweight row for the sidebar history list. */
export interface AnalysisSummary {
  id: string;
  title: string;
  sourceKind: "upload" | "youtube";
  key: string | null;
  bpm: number | null;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export type AnalysisStatus = "idle" | "uploading" | "analyzing" | "done" | "error";

export interface AnalyzeRequestYouTube {
  youtubeUrl: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}

import type { ChordSegment } from "./types";

/** Format seconds as `m:ss` (or `h:mm:ss` past an hour). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Collapse consecutive identical labels into single spans. */
export function mergeRepeats(segments: ChordSegment[]): ChordSegment[] {
  const out: ChordSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.label === seg.label && Math.abs(prev.end - seg.start) < 1e-3) {
      prev.end = seg.end;
      prev.confidence = (prev.confidence + seg.confidence) / 2;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

/** The distinct chords used in the track, in first-appearance order. */
export function chordVocabulary(segments: ChordSegment[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const { label } of segments) {
    if (label === "N" || seen.has(label)) continue;
    seen.add(label);
    order.push(label);
  }
  return order;
}

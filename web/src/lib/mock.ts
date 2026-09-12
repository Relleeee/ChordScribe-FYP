import type { AnalysisResult } from "./types";

/**
 * A hand-made sample result (12-bar-ish progression in G) used for UI work and
 * as a fallback when `ENGINE_MOCK=1`. Not produced by the real pipeline.
 */
export const MOCK_RESULT: AnalysisResult = {
  source: {
    kind: "youtube",
    reference: "dQw4w9WgXcQ",
    title: "Sample Track (mock)",
    durationSec: 24,
  },
  bpm: 120,
  key: "G major",
  segments: [
    { start: 0.0, end: 4.0, label: "G", confidence: 0.91 },
    { start: 4.0, end: 8.0, label: "Em", confidence: 0.86 },
    { start: 8.0, end: 12.0, label: "C", confidence: 0.9 },
    { start: 12.0, end: 16.0, label: "D", confidence: 0.88 },
    { start: 16.0, end: 20.0, label: "G", confidence: 0.92 },
    { start: 20.0, end: 22.0, label: "C", confidence: 0.79 },
    { start: 22.0, end: 24.0, label: "D", confidence: 0.81 },
  ],
  engine: {
    version: "mock",
    method: "hand-authored",
    params: {},
  },
};

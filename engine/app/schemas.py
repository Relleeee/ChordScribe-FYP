"""Response schemas — mirror `web/src/lib/types.ts`. Keep the two in sync."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChordSegment(BaseModel):
    start: float = Field(description="Start time in seconds")
    end: float = Field(description="End time in seconds")
    label: str = Field(description='Chord label, e.g. "C", "Am", or "N" for no-chord')
    confidence: float = Field(ge=0.0, le=1.0)


class SourceInfo(BaseModel):
    kind: Literal["upload", "youtube"]
    reference: str
    title: str | None = None
    durationSec: float


class EngineInfo(BaseModel):
    version: str
    method: str
    params: dict[str, float | str | bool]


class AnalysisResult(BaseModel):
    source: SourceInfo
    bpm: float | None = None
    key: str | None = None
    segments: list[ChordSegment]
    engine: EngineInfo


class YouTubeRequest(BaseModel):
    youtube_url: str


class TranscriptWord(BaseModel):
    t: float = Field(description="Word start time in seconds")
    w: str = Field(description="The word as sung")


class TranscriptionResult(BaseModel):
    text: str = Field(description="Full transcript, newline between sung phrases")
    words: list[TranscriptWord]
    language: str | None = None


class TabResult(BaseModel):
    ascii: str = Field(description="Rendered guitar tab, ready for a <pre> block")
    note_count: int = Field(description="Notes transcribed from the audio")
    bpm: float | None = None

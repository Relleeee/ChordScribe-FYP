"""FastAPI entrypoint for the ChordScribe engine.

Run locally:
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .ffmpeg_setup import ensure_ffmpeg, ensure_readable
from .ingest import Ingested, fetch_youtube, make_workdir, save_upload, youtube_id
from .pipeline import analyze
from .schemas import AnalysisResult, TabResult, TranscriptionResult

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("chordscribe")

ensure_ffmpeg()  # MP3/MP4 decoding and YouTube extraction both need this on PATH

app = FastAPI(title="ChordScribe Engine", version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # a phone-recorded MP4 easily passes 50MB


async def _ingest_from_request(
    request: Request, workdir: Path
) -> tuple[Ingested, str, dict]:
    """Turn a `/analyze`-style request (multipart file or JSON youtube_url) into a
    local audio file. Also returns the other params (form fields / JSON keys).
    Shared by `/analyze`, `/transcribe` and `/tab`."""
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise HTTPException(400, "Missing 'file' field")
        data = await upload.read()
        if not data:
            raise HTTPException(400, "Uploaded file is empty")
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "File too large")
        extra = {k: v for k, v in form.items() if k != "file"}
        return save_upload(upload.filename or "upload", data, workdir), "upload", extra

    body = await request.json() or {}
    url = str(body.get("youtube_url", "")).strip()
    if not url:
        raise HTTPException(400, "Missing 'youtube_url'")
    if youtube_id(url) is None:
        raise HTTPException(400, "Could not parse a YouTube video id")
    try:
        return fetch_youtube(url, workdir), "youtube", body
    except Exception as exc:  # noqa: BLE001
        log.exception("yt-dlp failed")
        raise HTTPException(502, f"Failed to fetch YouTube audio: {exc}") from exc


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "version": __version__}


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_endpoint(request: Request) -> AnalysisResult:
    workdir = make_workdir()
    try:
        ingested, kind, _ = await _ingest_from_request(request, workdir)
        try:
            return analyze(ingested, kind=kind)
        except Exception as exc:  # noqa: BLE001
            log.exception("analysis failed")
            raise HTTPException(500, f"Analysis failed: {exc}") from exc
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.post("/transcribe", response_model=TranscriptionResult)
async def transcribe_endpoint(request: Request) -> TranscriptionResult:
    """Transcribe the vocal to timestamped words. Opt-in, slow, English-leaning."""
    from .transcribe import TranscriptionUnavailable, transcribe

    workdir = make_workdir()
    try:
        ingested, _kind, _ = await _ingest_from_request(request, workdir)
        audio_path = ensure_readable(ingested.path)
        try:
            return TranscriptionResult(**transcribe(audio_path))
        except TranscriptionUnavailable as exc:
            raise HTTPException(501, str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            log.exception("transcription failed")
            raise HTTPException(500, f"Transcription failed: {exc}") from exc
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.post("/tab", response_model=TabResult)
async def tab_endpoint(request: Request) -> TabResult:
    """Transcribe the notes actually played and lay them out as guitar tab.
    Opt-in and slow; most faithful on solo / sparse guitar recordings."""
    from .tab import TabUnavailable, build_tab

    workdir = make_workdir()
    try:
        ingested, _kind, extra = await _ingest_from_request(request, workdir)
        audio_path = ensure_readable(ingested.path)
        bpm = extra.get("bpm")
        raw_chords = extra.get("chords")
        if isinstance(raw_chords, str):
            import json  # noqa: PLC0415

            raw_chords = json.loads(raw_chords or "[]")
        try:
            result = build_tab(
                audio_path,
                tuning=str(extra.get("tuning") or "standard"),
                bpm=float(bpm) if bpm not in (None, "", "null") else None,
                chords=raw_chords if isinstance(raw_chords, list) else None,
            )
        except TabUnavailable as exc:
            raise HTTPException(501, str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            log.exception("tab generation failed")
            raise HTTPException(500, f"Tab generation failed: {exc}") from exc
        return TabResult(**result)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

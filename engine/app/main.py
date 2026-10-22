"""FastAPI entrypoint for the ChordScribe engine.

Run locally:
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import __version__
from . import separate as stems_mod
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


@dataclass
class _Source:
    """A validated request, before any slow work: an upload's bytes or a YouTube URL."""

    kind: str  # "upload" | "youtube"
    extra: dict  # the other params (form fields / JSON keys)
    url: str = ""
    filename: str = ""
    data: bytes = b""


async def _read_request(request: Request) -> _Source:
    """Parse a `/analyze`-style request (multipart file or JSON youtube_url)."""
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
        return _Source("upload", extra, filename=upload.filename or "upload", data=data)

    body = await request.json() or {}
    url = str(body.get("youtube_url", "")).strip()
    if not url:
        raise HTTPException(400, "Missing 'youtube_url'")
    if youtube_id(url) is None:
        raise HTTPException(400, "Could not parse a YouTube video id")
    return _Source("youtube", body, url=url)


def _fetch(source: _Source, workdir: Path) -> Ingested:
    """Materialise the source as a local file (blocking: YouTube downloads)."""
    if source.kind == "upload":
        return save_upload(source.filename, source.data, workdir)
    try:
        return fetch_youtube(source.url, workdir)
    except Exception as exc:  # noqa: BLE001
        log.exception("yt-dlp failed")
        raise HTTPException(502, f"Failed to fetch YouTube audio: {exc}") from exc


async def _ingest_from_request(
    request: Request, workdir: Path
) -> tuple[Ingested, str, dict]:
    """Turn a `/analyze`-style request into a local audio file. Also returns the
    other params. Shared by `/analyze`, `/transcribe` and `/tab`."""
    source = await _read_request(request)
    ingested = await run_in_threadpool(_fetch, source, workdir)
    return ingested, source.kind, source.extra


def _flag(extra: dict, key: str) -> bool | None:
    """Optional boolean request field ("1"/"true"/True). None = not given."""
    v = extra.get(key)
    if v in (None, "", "null"):
        return None
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _stems_or_none(audio_path: str, requested: bool | None):
    """Separate stems if this request wants them; on any failure carry on with the
    plain mix — separation is an accuracy upgrade, never a reason to 500."""
    if not stems_mod.enabled(requested):
        return None
    try:
        return stems_mod.separate(audio_path)
    except Exception:  # noqa: BLE001
        log.exception("stem separation failed; using the full mix")
        return None


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "version": __version__,
        "stems": {"mode": stems_mod.mode(), "gpu": stems_mod.has_gpu()},
    }


NDJSON = "application/x-ndjson"


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_endpoint(request: Request):
    """Analyse an upload or YouTube URL. With ``Accept: application/x-ndjson`` the
    response is a stream of progress events instead, one JSON object per line:
    ``{"type": "stage", "stage": "fetch"|"decode"|"features"|"separate"|"chords"|"key"}``
    then ``{"type": "result", "result": AnalysisResult}`` or
    ``{"type": "error", "status": int, "detail": str}``."""
    if NDJSON in request.headers.get("accept", ""):
        return StreamingResponse(_analyze_stream(await _read_request(request)), media_type=NDJSON)

    workdir = make_workdir()
    try:
        ingested, kind, extra = await _ingest_from_request(request, workdir)
        try:
            return await run_in_threadpool(
                analyze, ingested, kind=kind, separate=_flag(extra, "separate")
            )
        except Exception as exc:  # noqa: BLE001
            log.exception("analysis failed")
            raise HTTPException(500, f"Analysis failed: {exc}") from exc
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


async def _analyze_stream(source: _Source) -> AsyncIterator[bytes]:
    loop = asyncio.get_running_loop()
    events: asyncio.Queue[dict] = asyncio.Queue()

    def emit(event: dict) -> None:  # called from the worker thread
        loop.call_soon_threadsafe(events.put_nowait, event)

    def work() -> None:
        workdir = make_workdir()
        try:
            emit({"type": "stage", "stage": "fetch"})
            ingested = _fetch(source, workdir)
            result = analyze(
                ingested,
                kind=source.kind,
                separate=_flag(source.extra, "separate"),
                on_stage=lambda s: emit({"type": "stage", "stage": s}),
            )
            emit({"type": "result", "result": result.model_dump()})
        except HTTPException as exc:
            emit({"type": "error", "status": exc.status_code, "detail": exc.detail})
        except Exception as exc:  # noqa: BLE001
            log.exception("analysis failed")
            emit({"type": "error", "status": 500, "detail": f"Analysis failed: {exc}"})
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    task = loop.run_in_executor(None, work)
    while True:
        event = await events.get()
        yield (json.dumps(event) + "\n").encode()
        if event["type"] in ("result", "error"):
            break
    await task


@app.post("/transcribe", response_model=TranscriptionResult)
async def transcribe_endpoint(request: Request) -> TranscriptionResult:
    """Transcribe the vocal to timestamped words. Opt-in, slow, English-leaning."""
    from .transcribe import TranscriptionUnavailable, transcribe

    workdir = make_workdir()
    try:
        ingested, _kind, extra = await _ingest_from_request(request, workdir)
        hint = str(extra.get("lyrics") or "").strip() or None

        def work() -> dict:
            audio_path = ensure_readable(ingested.path)
            stems = _stems_or_none(audio_path, _flag(extra, "separate"))
            return transcribe(
                stems.vocals if stems else audio_path,
                isolated_vocals=stems is not None,
                lyrics_hint=hint,
            )

        try:
            return TranscriptionResult(**await run_in_threadpool(work))
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
        bpm = extra.get("bpm")
        raw_chords = extra.get("chords")
        if isinstance(raw_chords, str):
            raw_chords = json.loads(raw_chords or "[]")

        def work() -> dict:
            audio_path = ensure_readable(ingested.path)
            stems = _stems_or_none(audio_path, _flag(extra, "separate"))
            if stems:  # transcribe notes from the guitar, not from the whole band
                audio_path = stems_mod.guitar_source(stems)
            return build_tab(
                audio_path,
                tuning=str(extra.get("tuning") or "standard"),
                bpm=float(bpm) if bpm not in (None, "", "null") else None,
                chords=raw_chords if isinstance(raw_chords, list) else None,
            )

        try:
            result = await run_in_threadpool(work)
        except TabUnavailable as exc:
            raise HTTPException(501, str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            log.exception("tab generation failed")
            raise HTTPException(500, f"Tab generation failed: {exc}") from exc
        return TabResult(**result)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

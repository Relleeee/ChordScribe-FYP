"""Turn a user input (uploaded file or YouTube URL) into a local audio file path."""

from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Ingested:
    path: str
    reference: str          # video id or original filename
    title: str | None


_YT_ID = re.compile(r"(?:v=|youtu\.be/|/shorts/)([\w-]{11})")


def youtube_id(url: str) -> str | None:
    m = _YT_ID.search(url)
    return m.group(1) if m else None


def save_upload(filename: str, data: bytes, workdir: Path) -> Ingested:
    safe = re.sub(r"[^\w.\-]", "_", filename or "upload")
    dest = workdir / safe
    dest.write_bytes(data)
    return Ingested(path=str(dest), reference=safe, title=safe)


def fetch_youtube(url: str, workdir: Path) -> Ingested:
    """Download bestaudio and transcode to wav via yt-dlp + ffmpeg."""
    import yt_dlp  # imported lazily so the module loads without it installed

    from .ffmpeg_setup import ensure_ffmpeg

    ffmpeg_path = ensure_ffmpeg()

    out_tmpl = str(workdir / "%(id)s.%(ext)s")
    opts = {
        "format": "bestaudio/best",
        "outtmpl": out_tmpl,
        "quiet": True,
        "noplaylist": True,
        "ffmpeg_location": ffmpeg_path,
        # YouTube's signature/PO-token challenges need a JS engine; Node is far
        # more commonly already installed than yt-dlp's default (Deno).
        "js_runtimes": {"node": {}},
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "wav"}
        ],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    vid = info.get("id", "video")
    wav = workdir / f"{vid}.wav"
    if not wav.exists():
        # Fall back to whatever file yt-dlp produced.
        candidates = list(workdir.glob(f"{vid}.*"))
        if not candidates:
            raise RuntimeError("yt-dlp produced no output file")
        wav = candidates[0]
    return Ingested(path=str(wav), reference=vid, title=info.get("title"))


def make_workdir() -> Path:
    return Path(tempfile.mkdtemp(prefix="chordscribe_"))

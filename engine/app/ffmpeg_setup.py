"""Make sure a real `ffmpeg` binary is available, and use it to decode anything
`soundfile` (libsndfile) can't read directly.

Modern `librosa.load` only tries `soundfile` — it no longer falls back to
`audioread`/ffmpeg on failure. `soundfile` handles WAV/FLAC/OGG and (on recent
libsndfile builds) MP3 fine, but not MP4/MOV/WEBM containers or oddly-encoded
uploads. `yt-dlp` needs ffmpeg too, for its own audio extraction. So: resolve one
ffmpeg binary (system, or a bundled static fallback), and expose a transcode
helper that `features.py` uses whenever the fast `soundfile` path fails.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger("chordscribe")

_resolved: str | None = None


def ensure_ffmpeg() -> str:
    """Return a path to a working ffmpeg binary, provisioning one if needed."""
    global _resolved
    if _resolved:
        return _resolved

    found = shutil.which("ffmpeg")
    if found:
        log.info("Using system ffmpeg: %s", found)
        _resolved = found
        return found

    import imageio_ffmpeg

    src = Path(imageio_ffmpeg.get_ffmpeg_exe())
    bin_dir = Path(__file__).resolve().parent.parent / "bin"
    bin_dir.mkdir(exist_ok=True)
    dest = bin_dir / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if not dest.exists():
        shutil.copy2(src, dest)
        if os.name != "nt":
            dest.chmod(0o755)

    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}"
    log.warning("No system ffmpeg found; using bundled static build at %s", dest)
    _resolved = str(dest)
    return _resolved


def transcode_to_wav(src_path: str, sample_rate: int) -> str:
    """Decode `src_path` (any container/codec ffmpeg understands) to a mono WAV
    at `sample_rate`, next to the source. Returns the new path; the caller owns
    cleanup (it lives in the same per-request workdir as the source)."""
    ffmpeg = ensure_ffmpeg()
    dest = f"{src_path}.decoded.wav"
    result = subprocess.run(
        [
            ffmpeg, "-y", "-v", "error",
            "-i", src_path,
            "-ac", "1", "-ar", str(sample_rate),
            dest,
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0 or not Path(dest).exists():
        raise RuntimeError(
            f"ffmpeg could not decode this file: {result.stderr.strip()[:500] or 'unknown error'}"
        )
    return dest


def ensure_readable(src_path: str, sample_rate: int = 44100) -> str:
    """Return a path `soundfile` can open. If `src_path` already works, that's
    it; otherwise transcode to a WAV alongside it (MP4/MOV/WEBM, odd MP3s).
    The result lives in the same per-request workdir, cleaned up by the caller.
    """
    import soundfile as sf  # noqa: PLC0415

    try:
        sf.SoundFile(src_path).close()
        return src_path
    except Exception:  # noqa: BLE001 - soundfile raises its own error type
        log.info("soundfile can't open %s directly; transcoding", src_path)
        return transcode_to_wav(src_path, sample_rate)

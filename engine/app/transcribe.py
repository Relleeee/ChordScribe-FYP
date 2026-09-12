"""Optional vocal transcription with faster-whisper.

The chord backends read harmony; this reads the words. It's kept separate and
strictly opt-in — the model is a ~145 MB download and inference is slow on CPU
(roughly 0.3–0.6x realtime for the `base` model), so it should never sit in the
hot path of a normal `/analyze` call.

Word-level timestamps are the point: they let the UI put each chord above the
word being sung when that chord lands, instead of guessing from line length.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

log = logging.getLogger("chordscribe")

# Override with WHISPER_MODEL (tiny | base | small | medium | …).
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base").strip()


class TranscriptionUnavailable(RuntimeError):
    """faster-whisper isn't installed — surfaced to the client as HTTP 501."""


@lru_cache(maxsize=1)
def _load_model():
    try:
        from faster_whisper import WhisperModel  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - depends on optional dep
        raise TranscriptionUnavailable(
            "faster-whisper is not installed — run `pip install faster-whisper`"
        ) from exc

    log.info("loading faster-whisper '%s' (first run downloads the model)", MODEL_SIZE)
    return WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")


def transcribe(audio_path: str) -> dict:
    """Return ``{"text": "line\\nline…", "words": [{"t": sec, "w": token}], "language": "en"}``.

    Lines are Whisper's own segment boundaries. ``words`` is a flat, time-ordered
    list across the whole track.
    """
    model = _load_model()

    segments, info = model.transcribe(
        audio_path,
        word_timestamps=True,
        # No VAD: the Silero voice-activity model treats a sung vocal over a full
        # band as "non-speech" and would drop most of the song (it cut ~90% of a
        # test track). Whisper windows long audio on its own anyway.
        vad_filter=False,
        # Songs repeat lines; not feeding the previous text back avoids the
        # decoder locking into a repetition loop on a repeated chorus.
        condition_on_previous_text=False,
    )

    lines: list[str] = []
    words: list[dict] = []
    for seg in segments:
        text = (seg.text or "").strip()
        if text:
            lines.append(text)
        for w in seg.words or []:
            token = (w.word or "").strip()
            if token:
                words.append({"t": round(float(w.start), 2), "w": token})

    return {
        "text": "\n".join(lines),
        "words": words,
        "language": getattr(info, "language", None),
    }

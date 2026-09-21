"""Source separation with Demucs (``htdemucs_6s``: drums, bass, vocals, guitar, piano, other).

On a dense full-band mix every downstream model is fighting the drums and the
vocal: chord models see cymbal noise as harmony, Whisper hears the band as
competing speech, and note transcribers hallucinate notes from the vocal line.
Separating first gives each task the signal it actually wants:

  * chords  -> the *harmonic* mix (everything except drums and vocals)
  * lyrics  -> the vocal stem alone
  * tab     -> the guitar stem alone

Separation is the slowest step in the engine (minutes on CPU, seconds on a
GPU), so it is opt-in and the stems are cached by file hash — `/analyze`,
`/transcribe` and `/tab` on the same song pay for it once.
"""

from __future__ import annotations

import hashlib
import logging
import os
import shutil
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

log = logging.getLogger("chordscribe")

MODEL_NAME = os.environ.get("DEMUCS_MODEL", "htdemucs_6s")
CACHE_DIR = Path(
    os.environ.get("STEM_CACHE_DIR", Path(__file__).resolve().parent.parent / ".cache" / "stems")
)
CACHE_KEEP = 8  # songs; oldest are evicted

# What counts as "the harmony" for chord recognition.
HARMONIC_STEMS = ("bass", "guitar", "piano", "other")


class SeparationUnavailable(RuntimeError):
    """demucs isn't installed — callers fall back to the unseparated mix."""


def mode() -> str:
    """``STEM_SEPARATION``: ``off`` | ``auto`` (only with a GPU) | ``on``."""
    return os.environ.get("STEM_SEPARATION", "auto").strip().lower()


def has_gpu() -> bool:
    try:
        import torch  # noqa: PLC0415

        return bool(torch.cuda.is_available())
    except ImportError:
        return False


def enabled(requested: bool | None = None) -> bool:
    """Should this request separate stems? An explicit request wins over the
    server default; ``auto`` means "only when it will be fast"."""
    if requested is not None:
        return requested
    m = mode()
    return m == "on" or (m == "auto" and has_gpu())


@dataclass(frozen=True)
class Stems:
    dir: Path
    sample_rate: int

    def path(self, name: str) -> Path:
        return self.dir / f"{name}.flac"

    def has(self, name: str) -> bool:
        return self.path(name).exists()

    @property
    def vocals(self) -> str:
        return str(self.path("vocals"))

    @property
    def guitar(self) -> str:
        return str(self.path("guitar"))

    @property
    def harmonic(self) -> str:
        return str(self.path("harmonic"))


def guitar_source(stems: Stems) -> str:
    """Best audio to transcribe guitar from.

    ``htdemucs_6s`` sometimes files a clean or acoustic guitar under ``other``
    (or piano), leaving the guitar stem thin. If the guitar stem is much
    quieter than ``other``, transcribe their sum so notes aren't lost.
    """
    import soundfile as sf  # noqa: PLC0415

    g, sr = sf.read(stems.path("guitar"), dtype="float32")
    o, _ = sf.read(stems.path("other"), dtype="float32")
    rms = lambda a: float(np.sqrt(np.mean(np.square(a)))) + 1e-9  # noqa: E731
    if rms(g) >= 0.5 * rms(o):
        return stems.guitar
    n = min(len(g), len(o))
    mixed = stems.dir / "guitar_plus_other.flac"
    sf.write(mixed, np.clip(g[:n] + o[:n], -1.0, 1.0), sr, subtype="PCM_16")
    return str(mixed)


def _file_key(audio_path: str) -> str:
    h = hashlib.sha1(usedforsecurity=False)
    h.update(MODEL_NAME.encode())
    with open(audio_path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()[:20]


def _evict_old() -> None:
    if not CACHE_DIR.exists():
        return
    entries = sorted(
        (p for p in CACHE_DIR.iterdir() if p.is_dir() and not p.name.endswith(".tmp")),
        key=lambda p: p.stat().st_mtime,
    )
    for old in entries[:-CACHE_KEEP]:
        shutil.rmtree(old, ignore_errors=True)


@lru_cache(maxsize=1)
def _load_model():
    try:
        import torch  # noqa: PLC0415
        from demucs.pretrained import get_model  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - optional dep
        raise SeparationUnavailable(
            "demucs is not installed — run `pip install demucs`"
        ) from exc

    log.info("loading Demucs '%s' (first run downloads ~55 MB of weights)", MODEL_NAME)
    model = get_model(MODEL_NAME)
    model.eval()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    return model, device


def separate(audio_path: str) -> Stems:
    """Split ``audio_path`` into stems (cached). Raises ``SeparationUnavailable``
    if Demucs isn't installed."""
    import soundfile as sf  # noqa: PLC0415

    out = CACHE_DIR / _file_key(audio_path)
    stems = Stems(dir=out, sample_rate=44100)
    if (out / "DONE").exists():
        out.touch()
        return stems

    import librosa  # noqa: PLC0415
    import torch  # noqa: PLC0415
    from demucs.apply import apply_model  # noqa: PLC0415

    model, device = _load_model()
    sr = int(model.samplerate)

    t0 = time.time()
    wav, _ = librosa.load(audio_path, sr=sr, mono=False)  # (channels, n) or (n,)
    if wav.ndim == 1:
        wav = np.stack([wav, wav])
    elif wav.shape[0] == 1:
        wav = np.concatenate([wav, wav])
    wav = wav[:2].astype(np.float32)

    # Demucs was trained on normalised input; undo it after.
    ref = wav.mean(0)
    mean, std = float(ref.mean()), float(ref.std()) or 1.0
    x = torch.from_numpy((wav - mean) / std)[None]

    with torch.no_grad():
        # shifts=0 keeps CPU runtime sane; overlap 0.25 is the Demucs default.
        sources = apply_model(model, x, device=device, shifts=0, split=True, overlap=0.25)[0]
    sources = sources * std + mean

    tmp = out.with_name(out.name + ".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True, exist_ok=True)

    named = {name: sources[i].cpu().numpy() for i, name in enumerate(model.sources)}
    for name, data in named.items():
        sf.write(tmp / f"{name}.flac", data.T, sr, subtype="PCM_16")
    harmonic = sum(named[n] for n in HARMONIC_STEMS if n in named)
    sf.write(tmp / "harmonic.flac", np.clip(harmonic, -1.0, 1.0).T, sr, subtype="PCM_16")
    (tmp / "DONE").write_text(MODEL_NAME)

    shutil.rmtree(out, ignore_errors=True)
    tmp.rename(out)
    _evict_old()
    log.info(
        "separated %.0fs of audio on %s in %.1fs", wav.shape[1] / sr, device, time.time() - t0
    )
    return stems

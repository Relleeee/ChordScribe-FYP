"""Chord recognition with BTC (Bi-directional Transformer for Chord recognition).

A pretrained deep model — far more accurate on real recordings than the
chroma-template baseline in `chords.py`. Upstream + weights: see
`engine/vendor/btc/`. Output is mapped to the app's label format
("C", "Cm", "N").
"""

from __future__ import annotations

import logging
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np

log = logging.getLogger("chordscribe")

_BTC_DIR = Path(__file__).resolve().parent.parent / "vendor" / "btc"
if str(_BTC_DIR) not in sys.path:
    sys.path.insert(0, str(_BTC_DIR))

N_TIMESTEP = 108  # frames per transformer window (from run_config.yaml)


def _map_label(raw: str) -> str:
    """BTC maj/min labels → this app's format."""
    if raw in ("N", "X"):
        return "N"
    return raw.replace(":min", "m")


@lru_cache(maxsize=1)
def _load_model():
    import torch  # noqa: PLC0415 — heavy, load lazily
    from fetch_models import ensure_models  # type: ignore  # noqa: PLC0415

    ensure_models()

    from btc_model import BTC_model  # type: ignore  # noqa: PLC0415
    from utils.hparams import HParams  # type: ignore  # noqa: PLC0415
    from utils.mir_eval_modules import idx2chord  # type: ignore  # noqa: PLC0415

    config = HParams.load(str(_BTC_DIR / "run_config.yaml"))
    model = BTC_model(config=config.model)

    ckpt_path = str(_BTC_DIR / "models" / "btc_model.pt")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    model.load_state_dict(ckpt["model"])
    model.eval()
    log.info("BTC chord model loaded (maj/min)")

    return model, config, np.asarray(ckpt["mean"]), np.asarray(ckpt["std"]), idx2chord


def recognize(audio_path: str) -> list[dict]:
    """Return chord segments: [{start, end, label, confidence}, …]."""
    import torch  # noqa: PLC0415
    from utils.mir_eval_modules import audio_file_to_features  # type: ignore  # noqa: PLC0415

    model, config, mean, std, idx2chord = _load_model()

    feature, seconds_per_frame, _ = audio_file_to_features(audio_path, config)
    feature = ((feature.T - mean) / std).astype(np.float32)  # (frames, 144)
    n_real = feature.shape[0]

    pad = (N_TIMESTEP - n_real % N_TIMESTEP) % N_TIMESTEP
    if pad:
        feature = np.pad(feature, ((0, pad), (0, 0)))
    windows = feature.shape[0] // N_TIMESTEP

    preds = np.empty(feature.shape[0], dtype=np.int64)
    confs = np.empty(feature.shape[0], dtype=np.float32)

    with torch.no_grad():
        tensor = torch.from_numpy(feature).unsqueeze(0)
        for w in range(windows):
            chunk = tensor[:, w * N_TIMESTEP : (w + 1) * N_TIMESTEP, :]
            hidden, _ = model.self_attn_layers(chunk)
            logits = model.output_layer.output_projection(hidden)
            probs = torch.softmax(logits, dim=-1).squeeze(0)
            conf, idx = probs.max(dim=-1)
            sl = slice(w * N_TIMESTEP, (w + 1) * N_TIMESTEP)
            preds[sl] = idx.numpy()
            confs[sl] = conf.numpy()

    return _frames_to_segments(preds[:n_real], confs[:n_real], seconds_per_frame, idx2chord)


def _frames_to_segments(
    preds: np.ndarray, confs: np.ndarray, dt: float, idx2chord: list[str]
) -> list[dict]:
    segments: list[dict] = []
    run_start = 0
    for i in range(1, len(preds) + 1):
        if i == len(preds) or preds[i] != preds[run_start]:
            label = _map_label(idx2chord[int(preds[run_start])])
            segments.append(
                {
                    "start": round(run_start * dt, 3),
                    "end": round(i * dt, 3),
                    "label": label,
                    "confidence": float(np.mean(confs[run_start:i])),
                }
            )
            run_start = i
    return segments

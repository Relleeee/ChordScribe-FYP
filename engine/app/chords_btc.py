"""Chord recognition with BTC (Bi-directional Transformer for Chord recognition).

A pretrained deep model — far more accurate on real recordings than the
chroma-template baseline in `chords.py`. Upstream + weights: see
`engine/vendor/btc/`. Two checkpoints ship with it:

  * ``majmin`` — 25 labels (12 roots x major/minor + N)
  * ``large``  — 170 labels: 12 roots x 14 qualities (min, maj, dim, aug, 6, m6,
                 7, m7, maj7, mMaj7, dim7, m7b5, sus2, sus4) + N + X. This is the
                 default: an advanced player wants to see the Cmaj7 / G7 / Dsus4,
                 not just C / G / D. (BTC has no slash-chord/inversion output.)

Output is mapped to the app's label format ("C", "Cm", "Cmaj7", "N").
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
STRIDE = N_TIMESTEP // 2  # windows overlap 50% — see recognize()

# BTC quality name -> suffix in this app's label format.
_QUALITY = {
    "min": "m", "maj": "", "dim": "dim", "aug": "aug", "min6": "m6", "maj6": "6",
    "min7": "m7", "minmaj7": "mMaj7", "maj7": "maj7", "7": "7", "dim7": "dim7",
    "hdim7": "m7b5", "sus2": "sus2", "sus4": "sus4",
}

# When the model isn't confident enough to commit to an extended chord, fall back
# to the triad it is built on rather than assert a 7th/sus that may not be there.
_TRIAD_OF = {
    "maj7": "", "7": "", "6": "", "sus2": "", "sus4": "", "aug": "",
    "m7": "m", "m6": "m", "mMaj7": "m", "dim": "m", "dim7": "m", "m7b5": "m",
}


def _map_label(raw: str) -> str:
    """BTC label ("C#:min7", "F", "N", "X") -> this app's format."""
    if raw in ("N", "X"):
        return "N"
    root, _, quality = raw.partition(":")
    return root + _QUALITY.get(quality or "maj", "")


def _collapse_to_triad(label: str) -> str:
    if label == "N":
        return label
    root = label[:2] if len(label) > 1 and label[1] in "#b" else label[:1]
    return root + _TRIAD_OF.get(label[len(root):], label[len(root):])


@lru_cache(maxsize=2)
def _load_model(vocab: str):
    import torch  # noqa: PLC0415 — heavy, load lazily
    from fetch_models import ensure_models  # type: ignore  # noqa: PLC0415

    ensure_models()

    from btc_model import BTC_model  # type: ignore  # noqa: PLC0415
    from utils.hparams import HParams  # type: ignore  # noqa: PLC0415
    from utils.mir_eval_modules import idx2chord, idx2voca_chord  # type: ignore  # noqa: PLC0415

    config = HParams.load(str(_BTC_DIR / "run_config.yaml"))
    if vocab == "large":
        config.feature["large_voca"] = True
        config.model["num_chords"] = 170
        labels = [_map_label(idx2voca_chord()[i]) for i in range(170)]
        ckpt_name = "btc_model_large_voca.pt"
    else:
        labels = [_map_label(c) for c in idx2chord]
        ckpt_name = "btc_model.pt"

    model = BTC_model(config=config.model)
    ckpt = torch.load(str(_BTC_DIR / "models" / ckpt_name), map_location="cpu", weights_only=False)
    model.load_state_dict(ckpt["model"])
    model.eval()
    log.info("BTC chord model loaded (%s, %d labels)", vocab, len(labels))

    return model, config, np.asarray(ckpt["mean"]), np.asarray(ckpt["std"]), labels


def recognize(
    audio_path: str,
    *,
    vocab: str = "large",
    extended_floor: float = 0.0,
) -> list[dict]:
    """Return chord segments: [{start, end, label, confidence}, …].

    Inference runs over 50%-overlapping windows and averages the class
    probabilities (centre-weighted). BTC's original recipe cuts the song into
    hard, non-overlapping 10 s windows, so every window edge is decoded with
    half its context missing — a common source of spurious chords exactly at
    the boundaries. ``extended_floor``: an extended chord (7th/sus/dim/…) whose
    confidence falls below it is reported as its triad instead.
    """
    import torch  # noqa: PLC0415
    from utils.mir_eval_modules import audio_file_to_features  # type: ignore  # noqa: PLC0415

    model, config, mean, std, labels = _load_model(vocab)

    feature, seconds_per_frame, _ = audio_file_to_features(audio_path, config)
    feature = ((feature.T - mean) / std).astype(np.float32)  # (frames, 144)
    n_real = feature.shape[0]

    # Pad so the last window ends exactly on a stride boundary.
    n_windows = max(1, int(np.ceil(max(n_real - N_TIMESTEP, 0) / STRIDE)) + 1)
    total = (n_windows - 1) * STRIDE + N_TIMESTEP
    feature = np.pad(feature, ((0, total - n_real), (0, 0)))

    weight = np.hanning(N_TIMESTEP + 2)[1:-1].astype(np.float32)  # favour window centres
    acc = np.zeros((total, len(labels)), dtype=np.float32)
    norm = np.zeros(total, dtype=np.float32)

    with torch.no_grad():
        tensor = torch.from_numpy(feature).unsqueeze(0)
        for w in range(n_windows):
            s = w * STRIDE
            hidden, _ = model.self_attn_layers(tensor[:, s : s + N_TIMESTEP, :])
            logits = model.output_layer.output_projection(hidden)
            probs = torch.softmax(logits, dim=-1).squeeze(0).numpy()
            acc[s : s + N_TIMESTEP] += probs * weight[:, None]
            norm[s : s + N_TIMESTEP] += weight

    probs = acc[:n_real] / norm[:n_real, None]
    idx = probs.argmax(axis=1)
    confs = probs.max(axis=1)

    frame_labels = [labels[i] for i in idx]
    if extended_floor > 0:
        frame_labels = [
            _collapse_to_triad(lab) if conf < extended_floor else lab
            for lab, conf in zip(frame_labels, confs, strict=True)
        ]

    return _frames_to_segments(frame_labels, confs, seconds_per_frame)


def _frames_to_segments(labels: list[str], confs: np.ndarray, dt: float) -> list[dict]:
    segments: list[dict] = []
    run_start = 0
    for i in range(1, len(labels) + 1):
        if i == len(labels) or labels[i] != labels[run_start]:
            segments.append(
                {
                    "start": round(run_start * dt, 3),
                    "end": round(i * dt, 3),
                    "label": labels[run_start],
                    "confidence": float(np.clip(np.mean(confs[run_start:i]), 0.0, 1.0)),
                }
            )
            run_start = i
    return segments

"""Download the BTC pretrained weights from the original repository."""

from __future__ import annotations

import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/jayg996/BTC-ISMIR19/master/test/"
MODELS = Path(__file__).parent / "models"


def ensure_models() -> None:
    MODELS.mkdir(exist_ok=True)
    for name in ("btc_model.pt", "btc_model_large_voca.pt"):
        dest = MODELS / name
        if dest.exists() and dest.stat().st_size > 1_000_000:
            continue
        print(f"[btc] downloading {name} …")
        urllib.request.urlretrieve(BASE + name, dest)


if __name__ == "__main__":
    ensure_models()
    print("[btc] models ready")

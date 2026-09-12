# BTC (vendored)

Inference-only subset of **BTC-ISMIR19** — "A Bi-Directional Transformer for
Musical Chord Recognition" (Park, Choi, Jeon, Kim, Nam; ISMIR 2019).

Upstream: <https://github.com/jayg996/BTC-ISMIR19> · MIT licence (see `LICENSE`).

Vendored here: `btc_model.py`, `run_config.yaml`, `utils/{transformer_modules,hparams,mir_eval_modules}.py`.
Local edits: `utils/hparams.py` uses `yaml.SafeLoader` (PyYAML ≥ 6 compatibility).

Pretrained weights (`models/*.pt`, ~12 MB each) are **not committed** — they
download on first use, or run:

```bash
python vendor/btc/fetch_models.py
```

`engine/app/chords_btc.py` wraps this for the ChordScribe pipeline.

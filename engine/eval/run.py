"""Score the chord recogniser against reference annotations (WCSR via mir_eval).

    python -m eval.run --data eval/data/synthetic
    python -m eval.run --data eval/data/real --configs btc-large btc-large+stems template

The data folder holds pairs ``<name>.<audio ext>`` + ``<name>.lab`` (MIREX/Harte
format, e.g. the Isophonics Beatles annotations). Every configuration runs the
real ``pipeline.analyze`` — the same code path the web app uses.

Writes ``eval/results/<timestamp>/``:
  results.csv   one row per (song, config): duration, runtime, every mir_eval metric
  summary.md    duration-weighted (WCSR) table per config — paste into the report
  chart.svg     the same table as a grouped bar chart
  est/<config>/<song>.lab   the estimated chord sequences, for inspection
"""

from __future__ import annotations

import argparse
import csv
import logging
import time
from dataclasses import replace
from datetime import datetime
from pathlib import Path

import mir_eval

from app.config import DEFAULT_PARAMS
from app.ingest import Ingested
from app.pipeline import analyze

from .labels import write_lab

AUDIO_EXTS = (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".mp4")

# name -> (param overrides, run Demucs first?)
CONFIGS: dict[str, tuple[dict, bool]] = {
    "btc-large": ({"chord_backend": "btc", "chord_vocab": "large"}, False),
    "btc-majmin": ({"chord_backend": "btc", "chord_vocab": "majmin"}, False),
    "template": ({"chord_backend": "template"}, False),
    "btc-large+stems": ({"chord_backend": "btc", "chord_vocab": "large"}, True),
    "btc-majmin+stems": ({"chord_backend": "btc", "chord_vocab": "majmin"}, True),
    "template+stems": ({"chord_backend": "template"}, True),
}
DEFAULT_CONFIGS = ["btc-large", "btc-majmin", "template"]

# The mir_eval comparisons worth reporting, in increasing strictness.
METRICS = ["root", "majmin", "mirex", "thirds", "triads", "sevenths", "tetrads"]


def find_pairs(data: Path) -> list[tuple[Path, Path]]:
    pairs = []
    for lab in sorted(data.glob("*.lab")):
        audio = next((lab.with_suffix(e) for e in AUDIO_EXTS if lab.with_suffix(e).exists()), None)
        if audio is None:
            print(f"  ! no audio for {lab.name}, skipped")
        else:
            pairs.append((audio, lab))
    return pairs


def score(ref_lab: Path, est_lab: Path) -> dict[str, float]:
    ref_i, ref_l = mir_eval.io.load_labeled_intervals(str(ref_lab))
    est_i, est_l = mir_eval.io.load_labeled_intervals(str(est_lab))
    scores = mir_eval.chord.evaluate(ref_i, ref_l, est_i, est_l)
    return {m: float(scores[m]) for m in METRICS}


def weighted(rows: list[dict], metric: str) -> float:
    """WCSR: per-song scores weighted by annotated duration."""
    total = sum(r["duration"] for r in rows)
    return sum(r[metric] * r["duration"] for r in rows) / total if total else 0.0


def write_svg(path: Path, summary: dict[str, dict[str, float]]) -> None:
    configs = list(summary)
    palette = ["#d97706", "#2563eb", "#059669", "#db2777", "#7c3aed", "#64748b"]
    w, h, left, top, bottom = 760, 340, 44, 40, 40
    plot_h = h - top - bottom
    group_w = (w - left - 10) / len(METRICS)
    bar_w = (group_w - 12) / len(configs)
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        'font-family="system-ui, sans-serif" font-size="11">',
        f'<rect width="{w}" height="{h}" fill="#fff"/>',
    ]
    for pct in range(0, 101, 20):
        y = top + plot_h * (1 - pct / 100)
        out.append(f'<line x1="{left}" x2="{w - 10}" y1="{y}" y2="{y}" stroke="#e5e7eb"/>')
        out.append(
            f'<text x="{left - 6}" y="{y + 4}" text-anchor="end" fill="#6b7280">{pct}%</text>'
        )
    for gi, metric in enumerate(METRICS):
        gx = left + gi * group_w + 6
        for ci, cfg in enumerate(configs):
            v = summary[cfg][metric]
            bh = plot_h * v
            x = gx + ci * bar_w
            out.append(
                f'<rect x="{x:.1f}" y="{top + plot_h - bh:.1f}" width="{bar_w - 2:.1f}" '
                f'height="{bh:.1f}" fill="{palette[ci % len(palette)]}"><title>{cfg} · {metric}: '
                f'{v:.1%}</title></rect>'
            )
        out.append(
            f'<text x="{gx + (group_w - 12) / 2:.1f}" y="{h - bottom + 16}" text-anchor="middle" '
            f'fill="#374151">{metric}</text>'
        )
    lx = left
    for ci, cfg in enumerate(configs):
        colour = palette[ci % len(palette)]
        out.append(f'<rect x="{lx}" y="12" width="10" height="10" fill="{colour}"/>')
        out.append(f'<text x="{lx + 14}" y="21" fill="#374151">{cfg}</text>')
        lx += 24 + 7 * len(cfg)
    out.append("</svg>")
    path.write_text("\n".join(out), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="ChordScribe chord-accuracy evaluation")
    ap.add_argument(
        "--data", type=Path, required=True, help="folder of <name>.<audio> + <name>.lab"
    )
    ap.add_argument("--configs", nargs="+", default=DEFAULT_CONFIGS, choices=list(CONFIGS))
    ap.add_argument("--out", type=Path, default=Path("eval/results"))
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING)

    pairs = find_pairs(args.data)
    if not pairs:
        raise SystemExit(f"no <name>.lab + audio pairs found in {args.data}")
    out = args.out / datetime.now().strftime("%Y%m%d-%H%M%S")
    print(f"{len(pairs)} songs x {len(args.configs)} configs -> {out}")

    rows: list[dict] = []
    for cfg in args.configs:
        overrides, stems = CONFIGS[cfg]
        params = replace(DEFAULT_PARAMS, **overrides)
        (out / "est" / cfg).mkdir(parents=True, exist_ok=True)
        for audio, ref in pairs:
            t0 = time.perf_counter()
            result = analyze(
                Ingested(path=str(audio), reference=audio.name, title=audio.stem),
                kind="upload",
                params=params,
                separate=stems,
            )
            runtime = time.perf_counter() - t0
            est = out / "est" / cfg / f"{audio.stem}.lab"
            write_lab(est, [s.model_dump() for s in result.segments])
            ref_i, _ = mir_eval.io.load_labeled_intervals(str(ref))
            row = {
                "song": audio.stem,
                "config": cfg,
                "duration": float(ref_i[-1, 1] - ref_i[0, 0]),
                "runtime_sec": runtime,
                **score(ref, est),
            }
            rows.append(row)
            print(f"  {cfg:<18} {audio.stem:<32} majmin {row['majmin']:6.1%}  ({runtime:.1f}s)")

    with open(out / "results.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    summary = {
        cfg: {m: weighted([r for r in rows if r["config"] == cfg], m) for m in METRICS}
        for cfg in args.configs
    }
    speed = {
        cfg: sum(r["runtime_sec"] for r in rows if r["config"] == cfg)
        / sum(r["duration"] for r in rows if r["config"] == cfg)
        for cfg in args.configs
    }
    lines = [
        f"# Chord recognition accuracy — {args.data.name}",
        "",
        f"{len(pairs)} songs, {sum(r['duration'] for r in rows) / len(args.configs) / 60:.1f} min "
        "of annotated audio. Scores are WCSR (duration-weighted chord symbol recall, mir_eval "
        f"{mir_eval.__version__}). Real-time factor = processing time / audio length.",
        "",
        "| Config | " + " | ".join(METRICS) + " | Real-time factor |",
        "|---|" + "---:|" * (len(METRICS) + 1),
    ]
    for cfg, s in summary.items():
        lines.append(
            f"| {cfg} | " + " | ".join(f"{s[m]:.1%}" for m in METRICS) + f" | {speed[cfg]:.2f}× |"
        )
    lines += [
        "",
        "- **root** — only the root must match. **majmin** — root + major/minor (the MIREX",
        "  headline metric). **mirex** — at least 3 notes in common. **sevenths/tetrads** — the",
        "  7th (or full chord) must match too.",
        "",
        "![chart](chart.svg)",
    ]
    (out / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    write_svg(out / "chart.svg", summary)
    print("\n" + "\n".join(lines[4 : 6 + len(summary)]))
    print(f"\nfull results in {out}")


if __name__ == "__main__":
    main()

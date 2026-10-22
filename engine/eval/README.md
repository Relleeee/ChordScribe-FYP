# Evaluation harness (proposal objective 3)

Scores the chord recogniser against human chord annotations with
[`mir_eval`](https://craffel.github.io/mir_eval/), reporting **WCSR** (weighted
chord symbol recall — each song's score weighted by its duration) for every
standard MIREX comparison, plus processing speed.

## Quick start

```powershell
cd engine
# 1. Smoke test on generated audio (seconds; proves the pipeline end to end)
.venv\Scripts\python.exe -m eval.make_synthetic --out eval/data/synthetic --songs 5
.venv\Scripts\python.exe -m eval.run --data eval/data/synthetic

# 2. The real evaluation
.venv\Scripts\python.exe -m eval.run --data eval/data/real `
    --configs btc-large btc-majmin template btc-large+stems
```

Results land in `eval/results/<timestamp>/`: `summary.md` (table for the report),
`chart.svg` (grouped bar chart), `results.csv` (per song) and `est/` (the
estimated `.lab` files, to diff against the reference by hand).

## Building a real dataset

Put pairs `song_name.mp3` (or wav/flac/m4a/mp4) + `song_name.lab` in
`eval/data/real/` — names must match. `eval/data/` is gitignored: commercial audio
must not be committed.

- **Reference annotations:** the [Isophonics](http://isophonics.net/datasets)
  Beatles/Queen/Carole King `.lab` files are the standard MIREX set; the
  [Billboard (McGill)](https://ddmal.music.mcgill.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset)/)
  set is larger. You supply the matching audio from your own copies — check the
  annotation's start offset matches your recording (different masters differ by
  a second or two, which costs accuracy for no real reason).
- **Your own guitar songs:** annotate with
  [Sonic Visualiser](https://www.sonicvisualiser.org/) or by hand. One line per
  chord: `start<TAB>end<TAB>label`, labels in Harte syntax (`C:maj`, `A:min`,
  `G:7`, `F:maj7`, `N` for no chord).

A dozen songs (~40 minutes) of mixed genres is a defensible FYP-scale test set;
report the guitar-heavy subset separately if it differs.

## Configs

| Name | Backend | Notes |
|---|---|---|
| `btc-large` | BTC transformer, 170 labels | the app's default |
| `btc-majmin` | BTC transformer, 25 labels | comparable to MIREX majmin results |
| `template` | chroma + templates + Viterbi | the from-scratch baseline |
| `*+stems` | any of the above on the Demucs harmonic stem | slow on CPU (~0.7× real time) |

## Reading the metrics

`root` < `majmin` < `thirds`/`triads` < `sevenths` < `tetrads` in strictness.
`majmin` is the usual headline number. Chords outside a metric's vocabulary
(e.g. a reference `C:sus4` under `majmin`) are excluded from that metric, which is
why `majmin` can come out higher than `root`.

Synthetic results are an **upper bound** (clean, isolated chords); only the
real-dataset numbers belong in the report's results chapter.

# Model & API selection — chord + tab output for advanced guitarists

_Decision record, September 2026. Companion to `ARCHITECTURE.md` §9 (limitations)._

## What "advanced guitarist" asks of the output

| Need | Why it matters | Was | Now |
|------|----------------|-----|-----|
| Chord **quality** (7ths, sus, dim, aug, m7b5…) | A Cmaj7 played as C, or a G7 as G, is simply wrong for a player who cares | maj/min only | 14 qualities per root |
| Chords that survive a **dense mix** | Real songs have drums, vocals, keys | full mix straight in | optional Demucs harmonic stem |
| Tab from the **actual notes**, in the right tuning | Learning a riff or voicing, not an approximation | basic-pitch on the full mix | basic-pitch on the guitar stem |
| **Slash chords / inversions** (C/E, D/F#) | Bass movement is half of a folk or pop arrangement | not supported | **still not supported** — see "Open gap" |

## Decision

A **local, open-source pipeline** — no per-song API cost, no data leaving the
machine, every step inspectable and scoreable, which suits a final-year project:

1. **Separation — Demucs `htdemucs_6s`.** The only widely deployed open model that
   returns a *guitar* stem (and piano) at usable quality. BS-RoFormer is reported
   meaningfully better only on bass, and is a 4-stem system with no guitar output, so it can't do
   the guitar-tab job. (`engine/app/separate.py`)
2. **Chords — BTC large-vocabulary (170 labels).** Already vendored; the gain over
   the previous setup was purely wiring it through (`chords_btc.py`, `chordShapes.ts`,
   `tab.py`). 50%-overlap inference and a triad fallback for low-confidence extended
   chords were added on top.
3. **Notes → tab — basic-pitch on the guitar stem**, then the existing chord-guided
   fretting search (`tab.py`).

## Alternatives considered

| Option | Verdict |
|--------|---------|
| **Klangio API** — REST; MusicXML/MIDI/PDF/Guitar Pro output, per-instrument models (guitar and bass models trained specifically on those instruments), chord recognition, beat tracking | The strongest *purpose-built* guitar-tab option found, and the one to try if tab fidelity is the bottleneck. **Not integrated**: I couldn't verify pricing, quotas or licence terms, and it needs an account/key. It would slot in as a second backend behind `/tab` (same `TabResult`). |
| **Moises API** | Offers separation plus chord/key/BPM detection, but is a closed, general musician toolkit — no evidence found that it beats the local stack on guitar tab. Pricing unverified. |
| **ChordFormer** (2025, conformer, large vocabulary, reports ~+2% frame accuracy and +6% class-wise accuracy over prior large-vocab models) | Promising and the natural successor to BTC, but I did not confirm public pretrained weights or a licence. Revisit when they are available. |
| **CREMA** (structured chord model; ~602 classes incl. bass) | The likeliest route to **slash chords**. Older architecture; worth benchmarking against BTC on your own clips before adopting. |
| Keep maj/min BTC | Rejected: on the synthetic 7th-chord test it got every root but **0% of chords exactly right**. |

## Open gap: slash chords

BTC emits root + quality only. To show C/E or D/F# you need a bass-aware model
(CREMA, ChordFormer) or a separate bass-note estimator run on the `bass` stem and
merged into the chord label. The stem is already produced, so the second route is
the cheapest next step.

## How to confirm this on real music (not done yet)

Everything measured so far used **synthetic** audio (`engine/README.md` → "Stem
separation"): it validates the plumbing and shows the direction, not a real-world
accuracy number. Before quoting one:

1. Take 10–20 songs you can play — mix of solo guitar and full band — and write a
   `.lab` reference for each (or use GuitarSet for solo guitar).
2. Score `majmin` vs `large`, with and without separation, using the `mir_eval`
   recipe in `engine/README.md` (`majmin`, `sevenths`, `root`, WCSR).
3. Tune `extended_floor` (default 0.45, untuned) on that set.
4. Only then decide whether a paid tab API earns its cost.

## Sources

- [htdemucs vs BS-RoFormer vs Spleeter: a 2026 benchmark](https://dev.to/codesugar_lin_037a57b06a4/htdemucs-vs-bs-roformer-vs-spleeter-2026-audio-source-separation-benchmark-2ll8)
- [Klangio — all products & API](https://klang.io/products/), [Guitar2Tabs](https://klang.io/guitar2tabs/)
- [ChordFormer (arXiv 2502.11840)](https://arxiv.org/abs/2502.11840)
- [BTC — A Bi-directional Transformer for Musical Chord Recognition](https://arxiv.org/pdf/1907.02698)
- [CREMA model reference](https://crema.readthedocs.io/en/stable/models.html)

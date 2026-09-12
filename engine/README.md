# ChordScribe Engine

Python chord-recognition service. Takes an audio/video file or a YouTube URL and
returns a timestamped chord chart as JSON.

## Pipeline

1. **Ingest** (`ingest.py`) — save the upload, or download audio with `yt-dlp`.
2. **Decode** (`ffmpeg_setup.py`) — hand both backends a file `soundfile` can
   read, transcoding MP4/MOV/WEBM (or odd MP3s) to WAV when needed.
3. **Chords** — one of two backends (`config.py::AnalysisParams.chord_backend`,
   env `CHORD_BACKEND`):
   - **`btc`** (default) — **BTC**, a pretrained bi-directional transformer
     (`chords_btc.py`, vendored in `vendor/btc/`). Much more accurate on real
     recordings; see Accuracy notes.
   - **`template`** — the chroma baseline (`chords.py` + `features.py`):
     tuning-corrected CQT chroma → 24 maj/min triad templates → softmax +
     Viterbi smoothing → segment merge. Kept for comparison / offline use.
4. **Key & tempo** (`keys.py`, `features.py`) — Krumhansl–Schmuckler key on the
   mean chroma, `librosa` beat tracking for BPM. Run for both backends.

Sub-1 s chord slivers are merged either way. All tunables are echoed back in the
response under `engine.params` for reproducible evaluation runs.

## Requirements

- Python 3.11+
- `torch` (CPU is fine — see `requirements.txt`) for the default BTC backend.
  Its ~12 MB weights download on first use, or run `python vendor/btc/fetch_models.py`.
  Set `CHORD_BACKEND=template` to skip Torch entirely.
- **ffmpeg** — not a hard requirement. `ffmpeg_setup.py` looks for a system
  install first; if there isn't one, it provisions the static build bundled by
  `imageio-ffmpeg` into `engine/bin/` automatically on first run (no admin
  rights needed). Used for YouTube extraction (`yt-dlp`) and as a decode
  fallback for any upload `soundfile` can't read directly (MP4/MOV/WEBM, or an
  MP3 an older libsndfile chokes on).

## Accuracy notes

**Default backend is now BTC (pretrained transformer), not the template matcher.**
The chroma-template baseline tops out low on real music — it systematically
confused major/minor on thin voicings and threw spurious chords on dense mixes.
On a real "C–Am–F–G" backing track the template matcher labelled the Am chord
as **A major** on nearly every repeat; BTC gets **Am** right on every repeat
(~0.95 confidence) and produces a clean 4-chord vocabulary. On a full-band Oasis
track the template matcher emitted 11 chords with many spurious minors (Am, Em,
Dm, C#m…); BTC returns the actual F#m / A / E / B / D. Inference is ~2–5 s for a
5-minute song on CPU.

BTC here uses the **maj/min** model (25 labels), matching the app's chord
vocabulary. The repo also ships a large-vocabulary model (170 labels: 7ths, sus,
dim, aug, slash chords) — using it needs the frontend's transpose/capo/diagram
code taught those qualities, so it's left as follow-up.

The notes below are about the **`template` backend**, kept for the record.

---

**The transition penalty had a stability cliff on dense mixes — fixed.**
Early real-world testing (a full-band Oasis track, and MP3s of two pop songs)
showed the decoder freezing on a single chord for 30–90+ seconds in the middle
of a song that clearly keeps changing chords. Root cause: `transition_penalty`
(the Viterbi cost of switching chords between frames) was tuned only against
clean/synthetic audio, where the gap between the right chord's score and a
wrong one is large. On a real full-band mix that gap shrinks — more
instruments means more pitch classes have *some* energy — and once the penalty
exceeds that shrunken gap, the decoder can never justify switching and locks
onto one label. Swept `transition_penalty` against a real, dense-mix recording
and found a sharp instability past ~2.0 at the default temperature; **1.5** is
the highest value that stayed clear of it while still avoiding frame-to-frame
flicker (confirmed no segment longer than ~7s on that recording, vs. an 87s
freeze at the old default of 3.0). `min_segment_sec` raised 0.5 → 1.0 to mop up
the odd short spurious segment the lower penalty allows.

**Root detection is solid; major/minor quality is the harder part.** Verified
against a real, publicly-posted "C–Am–F–G" guitar backing track: chord *root*
was correct for every repeat of the 4-bar loop across the full 5-minute track.
The one recurring miss was major/minor *quality* on the Am chord in that
recording — its voicing is root+fifth-heavy with almost no third present in
the mix (a "power chord" style arrangement), so there's genuinely little
acoustic evidence to distinguish Am from A. This is a known limitation of
chroma/template matching in general, not specific to this implementation —
it's exactly the "accuracy decreases for more complex chords / dense mixes"
effect the project proposal calls out. Two things that look like fixes but
made it *worse* in testing, kept here so they aren't retried blindly:

- **Upweighting the third relative to root/fifth in the templates** (the third
  is the only interval that discriminates major/minor) sounds right, but when
  the third is nearly silent, amplifying it amplifies noise — it flipped the
  *root* to a neighbouring chord instead of just leaving quality uncertain.
  Reverted; templates are equal-weighted.
- **Chroma sharpening** (raising chroma to a power before matching) further
  suppresses an already-weak third relative to a dominant root/fifth. Not used.

A more principled fix exists in the literature — NNLS/non-negative-least-
-squares chroma (Mauch & Dixon, 2010) explicitly deconvolves each note's own
harmonic series before folding to chroma, which is what actually removes the
"5th harmonic reads as a major third" artifact. That's future work, not
implemented here.

## Setup

```bash
cd engine
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

## Endpoints

| Method | Path       | Body                              |
| ------ | ---------- | -------------------------------- |
| GET    | `/health`  | —                               |
| POST   | `/analyze` | `multipart/form-data` (`file`)   |
| POST   | `/analyze` | `application/json` (`youtube_url`) |

## Tests

```bash
pytest          # chord-matcher unit tests (no audio needed)
ruff check .
```

## Evaluation (objective 3 in the proposal)

`chords.py` emits MIREX-style `maj/min` labels, so you can score against reference
`.lab` files with [`mir_eval`](https://craffel.github.io/mir_eval/):

```python
import mir_eval
ref_i, ref_l = mir_eval.io.load_labeled_intervals("ref.lab")
est_i, est_l = mir_eval.io.load_labeled_intervals("est.lab")
print(mir_eval.chord.evaluate(ref_i, ref_l, est_i, est_l))  # includes WCSR
```

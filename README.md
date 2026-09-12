# ChordScribe

Automatic guitar chord recognition from audio and video input — paste a YouTube
link or upload an MP3/MP4 and get a readable, timestamped chord sheet.

Final Year Project · BSc Computing · Joshua Rhei J. Liao

## Structure

```
chord-scribe/
├── web/      Next.js 16 app — auth, UI, history, API proxy (TypeScript, Tailwind, Prisma/SQLite)
└── engine/   Python service — chroma extraction + chord recognition (FastAPI, librosa)
```

The browser talks only to the Next.js app. `web/src/app/api/analyze/route.ts`
checks the session, forwards the request to the engine at `ENGINE_URL`, then saves
the result. Types on the two sides are kept in sync:
`web/src/lib/types.ts` ↔ `engine/app/schemas.py`.

## Accounts & data

- Email + password auth. Passwords are bcrypt-hashed; the session is a signed
  JWT in an httpOnly cookie (`web/src/lib/auth.ts`), gated by `web/proxy.ts`.
- Users and their saved conversions live in a local SQLite file
  (`web/prisma/dev.db`), via Prisma (`web/prisma/schema.prisma`).
- The signed-in user sees their name and recent songs in the sidebar; each can
  be renamed (pencil) or deleted (trash). "Log out" is top-right. Layout is
  responsive — usable on a phone.

## Running locally

Two terminals.

**1. Engine** (Python 3.11+; installs Torch for the BTC chord model — CPU build
is fine; `ffmpeg` is bundled automatically if the host lacks it — see
`engine/README.md`):

```bash
cd engine
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

**2. Web:**

```bash
cd web
cp .env.example .env.local        # then set AUTH_SECRET (openssl rand -base64 32)
echo 'DATABASE_URL="file:./dev.db"' > .env
npm install
npx prisma migrate dev            # create the SQLite schema
npm run dev                       # http://localhost:3000
```

Testing on your phone: run `npm run dev`, then open `http://<your-computer-ip>:3000`
on the phone (same Wi-Fi). Set `ENGINE_MOCK=1` in `.env.local` to use sample data
when the Python engine isn't running.

## Method

Chords come from **BTC**, a pretrained bi-directional transformer for chord
recognition (Park et al., ISMIR 2019), vendored in `engine/vendor/btc/`. It's
markedly more accurate on real recordings than the original chroma-template
baseline, which is still in the tree (`CHORD_BACKEND=template`) for comparison.
Key is estimated with the Krumhansl–Schmuckler profiles; tempo via `librosa`
beat tracking.

See **`engine/README.md` → Accuracy notes** for the before/after on real songs,
the maj/min-vs-large-vocabulary tradeoff, and the `mir_eval` recipe for scoring
accuracy / WCSR.

## Mapping to the proposal objectives

| Objective                                     | Where                                        |
| --------------------------------------------- | -------------------------------------------- |
| Ingestion pipeline (MP3/MP4/YouTube)          | `engine/app/ingest.py`, `web` analyze route  |
| Chord recognition (BTC transformer + chroma baseline) | `engine/app/chords_btc.py`, `engine/app/chords.py`, `engine/app/features.py` |
| Evaluation (chord accuracy, WCSR)             | `engine/README.md` → `mir_eval` recipe       |
| Timestamped chord chart interface             | `web/src/components/ChordChart.tsx`, `ChordTimeline.tsx` |

# Statillion

One in a statillion. A free daily sports trivia web game where the rarest valid answer wins. Seven prompts a day, 25 seconds each; deep cuts send a pixel runner toward the marathon line.

## Stack

- Next.js (App Router, TypeScript) on Vercel
- Neon (Postgres) - answers and tiers stay server-side until a run is complete
- Python pipeline under `/pipeline` built on nflverse (nflreadpy)

## Development

```bash
npm install
npm run dev
```

Environment variables (`.env.local`, also set on Vercel):

```
DATABASE_URL=postgresql://... (Neon connection string, server only)
```

Run the matching unit tests:

```bash
npm test
```

## Data pipeline

```bash
cd pipeline
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python generate.py
```

`generate.py` writes one JSON per prompt to `pipeline/output/` for review, flagging any prompt with fewer than 200 answers. Tier assignments, aliases, and `suggested_hail_mary` picks are all editable there. After review:

```bash
set DATABASE_URL=...
.venv\Scripts\python load_db.py --start-date 2026-11-01
```

## Swapping in final runner art

The runner is a swappable sprite-sheet component. Drop PNG sheets (one row per animation, transparent background, 64x64 frames) into `public/sprites/` along with `public/sprites/manifest.json`:

```json
{
  "idle":      { "src": "/sprites/idle.png",      "frames": 4, "frameWidth": 64, "frameHeight": 64, "fps": 5 },
  "jog":       { "src": "/sprites/jog.png",       "frames": 6, "frameWidth": 64, "frameHeight": 64, "fps": 10 },
  "sprint":    { "src": "/sprites/sprint.png",    "frames": 8, "frameWidth": 64, "frameHeight": 64, "fps": 14 },
  "dip":       { "src": "/sprites/dip.png",       "frames": 4, "frameWidth": 64, "frameHeight": 64, "fps": 8, "loop": false },
  "celebrate": { "src": "/sprites/celebrate.png", "frames": 4, "frameWidth": 64, "frameHeight": 64, "fps": 6 }
}
```

The current sheets are packed from the 128x128 frames in `art/runner/` by `tools/pack_runner.py` (`python tools/pack_runner.py art/runner public/sprites`, needs Pillow and numpy); feet sit on row 121. Idle, dip and celebrate currently reuse single run frames until dedicated art exists. Without a manifest the game draws a code-generated placeholder runner.

## Swapping in final sounds

Replace the files in `public/sounds/` keeping the same names (`whistle`, `bwomp`, `cheer-small`, `cheer-mid`, `cheer-big`, `hail-mary`, `landmark`, `heartbeat`, `finish`, `jingle`, `crowd-loop`). All playback routes through `lib/audio.ts`; sound stays off until the first tap and the mute preference is remembered per device.

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

## Runner art

The runner is a sprite-sheet component. Frames live in `art/runner/` as 128x128 transparent PNGs (feet on row 121): `runner_01..08` (run cycle), `idle_bouncing/breathing/stretching_01..08`, `exhausted_stop_01..12`, `trip_and_fall_01..12`, `finish_line_lean_01..08`, `celebration_01..12`. Pack them into `public/sprites/` with:

```bash
python tools/pack_runner.py art/runner public/sprites
```

(needs Pillow and numpy). The manifest it writes maps game animations to sheets: `idle` (bouncing loop before the run), `rest` (hands-on-knees breathing between prompts), `jog`, `sprint`, `stop` (plays once, then `next: rest`), `fall` (plays once, holds), `dip` (finish lean, then `next: celebrate`) and `celebrate` (loop). Without a manifest the game draws a code-generated placeholder runner.

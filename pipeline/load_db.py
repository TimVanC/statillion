"""Loads reviewed answer-set JSON into the Neon Postgres database.

Run ONLY after the output JSON has been reviewed.

Usage:
  set DATABASE_URL=postgresql://...
  python load_db.py --start-date 2026-11-01

Assigns 7 prompts per day over 2 days, replacing any existing daily
sets for those dates. Re-running replaces each prompt's answers.
"""

import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import psycopg

OUTPUT_DIR = Path(__file__).parent / "output"

# Two daily sets of 7, each mixing broad stat prompts, a teammate web,
# a draft or season prompt, and one narrow change-up.
DAY_PLAN: list[list[str]] = [
    [
        "nfl-rushing-td",
        "nfl-900-receiving-yards",
        "nfl-teammate-brady",
        "nfl-5-interceptions",
        "nfl-td-2025",
        "nfl-first-round-pick",
        "nfl-penalty",
    ],
    [
        "nfl-thrown-td-pass",
        "nfl-800-rushing-yards",
        "nfl-70-receptions",
        "nfl-8-sacks",
        "nfl-teammate-manning",
        "nfl-kicker-100-points",
        "nfl-super-bowl-winner",
    ],
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-date", required=True, help="YYYY-MM-DD for day 1")
    args = parser.parse_args()
    start = date.fromisoformat(args.start_date)

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("Set DATABASE_URL first.")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        slug_to_id: dict[str, str] = {}
        for day in DAY_PLAN:
            for slug in day:
                path = OUTPUT_DIR / f"{slug}.json"
                if not path.exists():
                    sys.exit(f"Missing {path}; run generate.py first.")
                data = json.loads(path.read_text(encoding="utf-8"))

                # Reuse a prompt with the same text if already loaded;
                # otherwise create it. Its answers are replaced either way.
                cur.execute(
                    "select id from prompts where prompt_text = %s",
                    (data["prompt_text"],),
                )
                row = cur.fetchone()
                if row:
                    prompt_id = row[0]
                    cur.execute(
                        "delete from answers where prompt_id = %s", (prompt_id,)
                    )
                else:
                    cur.execute(
                        """
                        insert into prompts (sport, prompt_text, prompt_type)
                        values (%s, %s, %s) returning id
                        """,
                        (data["sport"], data["prompt_text"], data["prompt_type"]),
                    )
                    prompt_id = cur.fetchone()[0]
                slug_to_id[slug] = prompt_id

                cur.executemany(
                    """
                    insert into answers
                      (prompt_id, answer, aliases, is_person, tier, points, score, quip)
                    values (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        (
                            prompt_id,
                            a["answer"],
                            a["aliases"],
                            a["is_person"],
                            a["tier"],
                            a["points"],
                            a["score"],
                            a.get("quip"),
                        )
                        for a in data["answers"]
                    ],
                )
                print(f"Loaded {slug}: {len(data['answers'])} answers")

        for day_index, day in enumerate(DAY_PLAN):
            day_date = start + timedelta(days=day_index)
            cur.execute("delete from daily_sets where date = %s", (day_date,))
            cur.executemany(
                "insert into daily_sets (date, position, prompt_id) values (%s, %s, %s)",
                [
                    (day_date, pos + 1, slug_to_id[slug])
                    for pos, slug in enumerate(day)
                ],
            )
            print(f"Daily set for {day_date}: {', '.join(day)}")

        conn.commit()
    print("Done.")


if __name__ == "__main__":
    main()

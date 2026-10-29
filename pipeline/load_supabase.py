"""Loads reviewed answer-set JSON into Supabase.

Run ONLY after the output JSON has been reviewed.

Usage:
  set SUPABASE_URL=https://xxx.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=...
  python load_supabase.py --start-date 2026-11-01

Assigns 7 prompts per day over 2 days, replacing any existing rows for
those prompts and dates.
"""

import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import requests

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


class Client:
    def __init__(self) -> None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.")
        self.base = url.rstrip("/") + "/rest/v1"
        self.session = requests.Session()
        self.session.headers.update({
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        })

    def insert(self, table: str, rows: list[dict], returning: bool = False) -> list[dict]:
        headers = {"Prefer": "return=representation" if returning else "return=minimal"}
        resp = self.session.post(
            f"{self.base}/{table}", json=rows, headers=headers, timeout=60
        )
        if resp.status_code >= 300:
            sys.exit(f"Insert into {table} failed: {resp.status_code} {resp.text[:500]}")
        return resp.json() if returning else []

    def delete(self, table: str, params: dict) -> None:
        resp = self.session.delete(f"{self.base}/{table}", params=params, timeout=60)
        if resp.status_code >= 300:
            sys.exit(f"Delete from {table} failed: {resp.status_code} {resp.text[:500]}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-date", required=True, help="YYYY-MM-DD for day 1")
    args = parser.parse_args()
    start = date.fromisoformat(args.start_date)

    client = Client()

    slug_to_id: dict[str, str] = {}
    for day in DAY_PLAN:
        for slug in day:
            path = OUTPUT_DIR / f"{slug}.json"
            if not path.exists():
                sys.exit(f"Missing {path}; run generate.py first.")
            data = json.loads(path.read_text(encoding="utf-8"))

            created = client.insert(
                "prompts",
                [{
                    "sport": data["sport"],
                    "prompt_text": data["prompt_text"],
                    "prompt_type": data["prompt_type"],
                }],
                returning=True,
            )
            prompt_id = created[0]["id"]
            slug_to_id[slug] = prompt_id

            rows = [
                {
                    "prompt_id": prompt_id,
                    "answer": a["answer"],
                    "aliases": a["aliases"],
                    "is_person": a["is_person"],
                    "tier": a["tier"],
                    "points": a["points"],
                    "score": a["score"],
                    "quip": a.get("quip"),
                }
                for a in data["answers"]
            ]
            for i in range(0, len(rows), 500):
                client.insert("answers", rows[i : i + 500])
            print(f"Loaded {slug}: {len(rows)} answers (prompt {prompt_id})")

    for day_index, day in enumerate(DAY_PLAN):
        day_date = (start + timedelta(days=day_index)).isoformat()
        client.delete("daily_sets", {"date": f"eq.{day_date}"})
        client.insert(
            "daily_sets",
            [
                {"date": day_date, "position": pos + 1, "prompt_id": slug_to_id[slug]}
                for pos, slug in enumerate(day)
            ],
        )
        print(f"Daily set for {day_date}: {', '.join(day)}")

    print("Done.")


if __name__ == "__main__":
    main()

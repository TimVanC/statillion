"""Builds the 14 NFL prompt answer sets and writes JSON for review.

Usage:  python generate.py
Output: pipeline/output/<slug>.json plus summary.json

Nothing touches Supabase here; load_supabase.py runs separately
after the JSON has been reviewed.
"""

import json
from pathlib import Path

import nflreadpy as nfl
import polars as pl

from aliases import aliases_for_player
from familiarity import pageviews_for
from static_data import (
    NFL_PENALTIES,
    PENALTY_QUIPS,
    SUPER_BOWL_WINNERS,
    TEAM_QUIPS,
)
from tiers import bucket

OUTPUT_DIR = Path(__file__).parent / "output"
MIN_ANSWERS = 200
CURRENT_SEASON = 2025


def stat_prompt(stats: pl.DataFrame, column: str, threshold: float) -> list[str]:
    """Players with column >= threshold in any single season."""
    hit = (
        stats.filter(pl.col(column) >= threshold)
        .select("player_display_name")
        .drop_nulls()
        .unique()
    )
    return sorted(hit["player_display_name"].to_list())


def teammates_of(rosters: pl.DataFrame, star_name: str) -> list[str]:
    star = rosters.filter(pl.col("full_name") == star_name)
    if star.height == 0:
        raise ValueError(f"No roster rows for {star_name}")
    team_seasons = star.select("season", "team").unique()
    mates = (
        rosters.join(team_seasons, on=["season", "team"])
        .filter(pl.col("full_name") != star_name)
        .select("full_name")
        .unique()
    )
    return sorted(mates["full_name"].to_list())


def build_player_prompt(
    slug: str,
    text: str,
    prompt_type: str,
    names: list[str],
    note: str = "",
) -> dict:
    print(f"[{slug}] {len(names)} raw answers")
    views = pageviews_for(names, label=f"({slug})")
    answers = [
        {
            "answer": name,
            "aliases": aliases_for_player(name),
            "is_person": True,
            "score": views[name],
            "quip": None,
        }
        for name in names
    ]
    answers = bucket(answers)  # ranked by familiarity for easier review
    return {
        "slug": slug,
        "sport": "NFL",
        "prompt_text": text,
        "prompt_type": prompt_type,
        "note": note,
        "answer_count": len(answers),
        "flagged_under_200": len(answers) < MIN_ANSWERS,
        "answers": answers,
    }


def build_static_prompt(
    slug: str,
    text: str,
    prompt_type: str,
    rows: list[tuple[str, list[str], str]],
    quips: dict[str, str],
    note: str,
) -> dict:
    points = {
        "ten_day": 10,
        "trick_play": 15,
        "role_player": 30,
        "all_star": 60,
        "hall_of_famer": 85,
        "hail_mary": 100,
    }
    answers = [
        {
            "answer": answer,
            "aliases": aliases,
            "is_person": False,
            "score": 0,
            "tier": tier,
            "points": points[tier],
            "quip": quips.get(answer),
        }
        for answer, aliases, tier in rows
    ]
    print(f"[{slug}] {len(answers)} hand-written answers")
    return {
        "slug": slug,
        "sport": "NFL",
        "prompt_text": text,
        "prompt_type": prompt_type,
        "note": note,
        "answer_count": len(answers),
        "flagged_under_200": len(answers) < MIN_ANSWERS,
        "answers": answers,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)

    print("Loading nflverse data (cached by nflreadpy after first run)...")
    stats = nfl.load_player_stats(seasons=True, summary_level="reg")
    print(f"  player stats: {stats.height} rows, seasons "
          f"{stats['season'].min()}-{stats['season'].max()}")
    draft = nfl.load_draft_picks()
    rosters = nfl.load_rosters(seasons=list(range(1998, CURRENT_SEASON + 1)))
    print(f"  rosters: {rosters.height} rows")

    stats_note = (
        f"From nflverse player stats, regular season, "
        f"{stats['season'].min()}-{stats['season'].max()}"
    )

    prompts: list[dict] = []

    prompts.append(build_player_prompt(
        "nfl-thrown-td-pass",
        "Name an NFL player who has thrown a touchdown pass since 1999",
        "stat_threshold",
        stat_prompt(stats, "passing_tds", 1),
        stats_note,
    ))

    prompts.append(build_player_prompt(
        "nfl-800-rushing-yards",
        "Name an NFL player with an 800-yard rushing season since 1999",
        "stat_threshold",
        stat_prompt(stats, "rushing_yards", 800),
        stats_note,
    ))

    prompts.append(build_player_prompt(
        "nfl-900-receiving-yards",
        "Name an NFL player with a 900-yard receiving season since 1999",
        "stat_threshold",
        stat_prompt(stats, "receiving_yards", 900),
        stats_note,
    ))

    prompts.append(build_player_prompt(
        "nfl-70-receptions",
        "Name an NFL player with a 70-catch season since 1999",
        "stat_threshold",
        stat_prompt(stats, "receptions", 70),
        stats_note,
    ))

    prompts.append(build_player_prompt(
        "nfl-rushing-td",
        "Name an NFL player who has scored a rushing touchdown since 1999",
        "stat_threshold",
        stat_prompt(stats, "rushing_tds", 1),
        stats_note,
    ))

    prompts.append(build_player_prompt(
        "nfl-8-sacks",
        "Name an NFL player with an 8-sack season since 1999",
        "stat_threshold",
        stat_prompt(stats, "def_sacks", 8),
        stats_note,
    ))

    prompts.append(build_player_prompt(
        "nfl-5-interceptions",
        "Name an NFL player with a 5-interception season since 1999",
        "stat_threshold",
        stat_prompt(stats, "def_interceptions", 5),
        stats_note,
    ))

    kicker_points = stats.with_columns(
        (pl.col("fg_made") * 3 + pl.col("pat_made")).alias("kicking_points")
    )
    prompts.append(build_player_prompt(
        "nfl-kicker-100-points",
        "Name an NFL kicker with a 100-point season since 1999",
        "stat_threshold",
        stat_prompt(kicker_points, "kicking_points", 100),
        stats_note + "; intentionally narrow change-up",
    ))

    td_scorers = stats.filter(pl.col("season") == CURRENT_SEASON).with_columns(
        (
            pl.col("rushing_tds").fill_null(0)
            + pl.col("receiving_tds").fill_null(0)
            + pl.col("special_teams_tds").fill_null(0)
            + pl.col("def_tds").fill_null(0)
        ).alias("tds_scored")
    )
    prompts.append(build_player_prompt(
        f"nfl-td-{CURRENT_SEASON}",
        f"Name an NFL player who scored a touchdown in the {CURRENT_SEASON} season",
        "stat_threshold",
        stat_prompt(td_scorers, "tds_scored", 1),
        f"Rushing, receiving, return, and defensive touchdowns, {CURRENT_SEASON} regular season",
    ))

    first_rounders = (
        draft.filter(pl.col("round") == 1)
        .select("pfr_player_name")
        .drop_nulls()
        .unique()
    )
    prompts.append(build_player_prompt(
        "nfl-first-round-pick",
        "Name a first-round NFL draft pick since 1980",
        "draft",
        sorted(first_rounders["pfr_player_name"].to_list()),
        f"Draft classes {draft['season'].min()}-{draft['season'].max()}",
    ))

    prompts.append(build_player_prompt(
        "nfl-teammate-brady",
        "Name a teammate of Tom Brady",
        "teammate_web",
        teammates_of(rosters, "Tom Brady"),
        "Shared an NFL roster with Brady in any season, 2000-2022",
    ))

    prompts.append(build_player_prompt(
        "nfl-teammate-manning",
        "Name a teammate of Peyton Manning",
        "teammate_web",
        teammates_of(rosters, "Peyton Manning"),
        "Shared an NFL roster with Manning in any season, 1998-2015",
    ))

    prompts.append(build_static_prompt(
        "nfl-penalty",
        "Name an NFL penalty",
        "rules",
        NFL_PENALTIES,
        PENALTY_QUIPS,
        "Hand-written wildcard; intentionally narrow change-up",
    ))

    prompts.append(build_static_prompt(
        "nfl-super-bowl-winner",
        "Name a team that has won the Super Bowl",
        "franchise",
        SUPER_BOWL_WINNERS,
        TEAM_QUIPS,
        "Hand-written; intentionally narrow change-up",
    ))

    summary = []
    for p in prompts:
        path = OUTPUT_DIR / f"{p['slug']}.json"
        path.write_text(json.dumps(p, indent=2), encoding="utf-8")
        summary.append({
            "slug": p["slug"],
            "prompt_text": p["prompt_text"],
            "answer_count": p["answer_count"],
            "flagged_under_200": p["flagged_under_200"],
        })

    (OUTPUT_DIR / "summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )

    print("\nSummary:")
    for s in summary:
        flag = "  ** UNDER 200 **" if s["flagged_under_200"] else ""
        print(f"  {s['slug']}: {s['answer_count']} answers{flag}")
    print(f"\nWrote {len(prompts)} prompt files to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()

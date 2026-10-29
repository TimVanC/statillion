# Reviewing the answer sets

Each file in `pipeline/output/` is one prompt. `summary.json` lists all 14 with counts. Three are flagged under 200 answers: `nfl-kicker-100-points` (109), and the two intentional change-ups, `nfl-penalty` (50) and `nfl-super-bowl-winner` (20).

What to look at per file, most important first:

1. **Top of the list (10-Day Contracts and Role Players).** Answers are ranked by 60-day Wikipedia pageviews. Name collisions with famous non-players inflate a few journeymen; demote anyone who does not belong (for example, a "Chris Brown" or "James Stewart" ranked high by someone else's pageviews). Just edit the `tier` and `points` fields (ten_day 10, trick_play 15, role_player 30, all_star 60, hall_of_famer 85, hail_mary 100).
2. **Hail Mary gems.** Up to 3 answers per file carry `"suggested_hail_mary": true` (lowest pageviews that still have a Wikipedia page). To make one a gem: set its `tier` to `"hail_mary"`, `points` to 100, and write a one-line `quip`. One to three per prompt.
3. **Trick Play flags.** Hand-flag the "obscure pick everyone thinks is obscure" by setting `tier` to `"trick_play"` and `points` to 15.
4. **Aliases.** Nicknames come from a curated dictionary in `pipeline/aliases.py`; add any that are missing (the rejected-guess log will surface more over time).

Era caveat baked into the prompt texts: nflverse stats start in 1999 and draft data in 1980, so prompts say "since 1999" or "since 1980". Older legends are not in those answer sets by design.

After editing, reload everything with:

```
set DATABASE_URL=...
.venv\Scripts\python load_db.py --start-date <YYYY-MM-DD>
```

It replaces each prompt's answers and the two daily sets, so it is safe to re-run.

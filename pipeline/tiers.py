"""Tier bucketing per PRD: rank by familiarity, then
top ~10 = 10-Day Contract, next ~30 = Role Player,
next ~200 = All-Star, rest = Hall of Famer.

Trick Play flags and Hail Mary picks are manual; the generator
suggests Hail Mary candidates for the review pass.
"""

TEN_DAY_COUNT = 10
ROLE_PLAYER_COUNT = 30
ALL_STAR_COUNT = 200
HAIL_MARY_SUGGESTIONS = 3


def bucket(answers: list[dict]) -> list[dict]:
    """Assigns tier/points in place given 'score' on each answer dict."""
    ranked = sorted(answers, key=lambda a: a["score"], reverse=True)
    for i, a in enumerate(ranked):
        if i < TEN_DAY_COUNT:
            a["tier"] = "ten_day"
            a["points"] = 10
        elif i < TEN_DAY_COUNT + ROLE_PLAYER_COUNT:
            a["tier"] = "role_player"
            a["points"] = 30
        elif i < TEN_DAY_COUNT + ROLE_PLAYER_COUNT + ALL_STAR_COUNT:
            a["tier"] = "all_star"
            a["points"] = 60
        else:
            a["tier"] = "hall_of_famer"
            a["points"] = 85

    # Suggest Hail Mary gems: the least-viewed answers that still have a
    # real Wikipedia page, so real fans could plausibly know them.
    with_pages = [a for a in ranked if a["score"] > 0]
    for a in sorted(with_pages, key=lambda a: a["score"])[:HAIL_MARY_SUGGESTIONS]:
        a["suggested_hail_mary"] = True

    return ranked

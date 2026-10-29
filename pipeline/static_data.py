"""Hand-written answer sets for the two non-player change-up prompts.

These are intentionally narrow prompts per the PRD and will be flagged
as under 200 answers. Tiers here are hand-assigned, not pageview-based.
"""

# (answer, aliases, tier)
NFL_PENALTIES: list[tuple[str, list[str], str]] = [
    ("Holding", ["Offensive holding", "Defensive holding"], "ten_day"),
    ("Pass interference", ["PI", "Defensive pass interference", "Offensive pass interference", "DPI", "OPI"], "ten_day"),
    ("False start", [], "ten_day"),
    ("Offside", ["Offsides", "Defensive offside"], "ten_day"),
    ("Facemask", ["Face mask"], "ten_day"),
    ("Roughing the passer", [], "ten_day"),
    ("Unnecessary roughness", [], "ten_day"),
    ("Unsportsmanlike conduct", [], "ten_day"),
    ("Delay of game", [], "ten_day"),
    ("Encroachment", [], "role_player"),
    ("Neutral zone infraction", [], "role_player"),
    ("Illegal formation", [], "role_player"),
    ("Illegal motion", [], "role_player"),
    ("Illegal shift", [], "all_star"),
    ("Intentional grounding", [], "role_player"),
    ("Targeting", [], "role_player"),
    ("Horse collar tackle", ["Horse collar"], "role_player"),
    ("Chop block", [], "role_player"),
    ("Clipping", [], "role_player"),
    ("Block in the back", ["Illegal block in the back"], "role_player"),
    ("Tripping", [], "all_star"),
    ("Taunting", [], "role_player"),
    ("Illegal contact", [], "all_star"),
    ("Illegal use of hands", ["Hands to the face"], "all_star"),
    ("Illegal touching", ["Illegal touching of a forward pass"], "all_star"),
    ("Ineligible receiver downfield", ["Ineligible man downfield"], "all_star"),
    ("Illegal forward pass", [], "all_star"),
    ("Illegal blindside block", ["Blindside block"], "all_star"),
    ("Roughing the kicker", [], "all_star"),
    ("Running into the kicker", [], "all_star"),
    ("Illegal substitution", ["Too many men on the field", "12 men on the field"], "all_star"),
    ("Leverage", [], "hall_of_famer"),
    ("Leaping", [], "hall_of_famer"),
    ("Fair catch interference", [], "hall_of_famer"),
    ("Invalid fair catch signal", [], "hall_of_famer"),
    ("Illegal crackback block", ["Crackback block"], "hall_of_famer"),
    ("Illegal cut block", ["Cut block"], "hall_of_famer"),
    ("Illegal peelback block", ["Peelback block"], "hall_of_famer"),
    ("Illegal wedge", ["Wedge block"], "hall_of_famer"),
    ("Illegal batting", ["Batting the ball"], "hall_of_famer"),
    ("Illegal kicking", ["Illegally kicking the ball"], "hall_of_famer"),
    ("Palpably unfair act", [], "hail_mary"),
    ("Illegal touching of a kick", [], "hall_of_famer"),
    ("Kick catch interference", [], "hall_of_famer"),
    ("Illegal snap", ["False snap"], "hall_of_famer"),
    ("Disqualification", ["Ejection"], "hall_of_famer"),
    ("Sideline infraction", ["Sideline violation"], "hall_of_famer"),
    ("Illegal return", [], "hall_of_famer"),
    ("Failure to report", ["Failure to report as eligible"], "hall_of_famer"),
    ("Low block", [], "hall_of_famer"),
]

PENALTY_QUIPS = {
    "Palpably unfair act": "The rarest flag in football; the refs can award any score they see fit.",
}

# (answer, aliases, tier) -- every franchise with a Super Bowl win.
SUPER_BOWL_WINNERS: list[tuple[str, list[str], str]] = [
    ("New England Patriots", ["Patriots", "Pats", "New England"], "ten_day"),
    ("Pittsburgh Steelers", ["Steelers", "Pittsburgh"], "ten_day"),
    ("Kansas City Chiefs", ["Chiefs", "KC Chiefs", "Kansas City"], "ten_day"),
    ("San Francisco 49ers", ["49ers", "Niners", "San Francisco"], "ten_day"),
    ("Dallas Cowboys", ["Cowboys", "Dallas"], "ten_day"),
    ("Green Bay Packers", ["Packers", "Green Bay"], "ten_day"),
    ("New York Giants", ["Giants", "NY Giants"], "ten_day"),
    ("Denver Broncos", ["Broncos", "Denver"], "ten_day"),
    ("Philadelphia Eagles", ["Eagles", "Philly", "Philadelphia"], "ten_day"),
    ("Las Vegas Raiders", ["Raiders", "Oakland Raiders", "LA Raiders", "Los Angeles Raiders", "Vegas"], "role_player"),
    ("Washington Commanders", ["Commanders", "Washington Redskins", "Redskins", "Washington"], "role_player"),
    ("Miami Dolphins", ["Dolphins", "Miami"], "role_player"),
    ("Baltimore Ravens", ["Ravens", "Baltimore"], "role_player"),
    ("Indianapolis Colts", ["Colts", "Baltimore Colts", "Indy"], "role_player"),
    ("Seattle Seahawks", ["Seahawks", "Seattle"], "role_player"),
    ("Los Angeles Rams", ["Rams", "St. Louis Rams", "LA Rams"], "role_player"),
    ("Tampa Bay Buccaneers", ["Buccaneers", "Bucs", "Tampa Bay", "Tampa"], "role_player"),
    ("New Orleans Saints", ["Saints", "New Orleans"], "all_star"),
    ("Chicago Bears", ["Bears", "Chicago"], "all_star"),
    ("New York Jets", ["Jets", "NY Jets"], "hall_of_famer"),
]

TEAM_QUIPS = {
    "New York Jets": "One and done: Namath guaranteed Super Bowl III and the Jets never won another.",
}

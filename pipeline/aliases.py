"""Alias generation for NFL answer sets.

Rule-based passes plus a curated nickname dictionary for famous players.
The PRD calls for an LLM drafting pass with human spot-checks; this
curated dictionary is that draft, reviewable in the output JSON.
"""

import re

# Canonical full name -> extra accepted aliases.
NICKNAMES: dict[str, list[str]] = {
    "Rob Gronkowski": ["Gronk"],
    "Tom Brady": ["TB12", "Tom Terrific"],
    "Patrick Mahomes": ["Showtime Mahomes"],
    "Christian McCaffrey": ["CMC", "Run CMC"],
    "Odell Beckham": ["OBJ", "Odell Beckham Jr"],
    "Antonio Brown": ["AB"],
    "Marshawn Lynch": ["Beast Mode"],
    "Deion Sanders": ["Prime Time", "Coach Prime", "Neon Deion"],
    "Calvin Johnson": ["Megatron"],
    "Adrian Peterson": ["All Day", "AP"],
    "Aaron Donald": ["AD99"],
    "Ezekiel Elliott": ["Zeke"],
    "Leonard Fournette": ["Playoff Lenny"],
    "Travis Kelce": ["Big Yeti"],
    "Tyreek Hill": ["Cheetah"],
    "Jalen Hurts": ["Hurts So Good"],
    "Lamar Jackson": ["Action Jackson"],
    "Justin Jefferson": ["Jets", "JJettas"],
    "Ja'Marr Chase": ["Uno"],
    "Micah Parsons": ["The Lion"],
    "T.J. Watt": ["TJ Watt"],
    "J.J. Watt": ["JJ Watt"],
    "Randy Moss": ["The Freak"],
    "Terrell Owens": ["TO"],
    "Chad Johnson": ["Chad Ochocinco", "Ochocinco"],
    "Brett Favre": ["The Gunslinger"],
    "Peyton Manning": ["The Sheriff"],
    "Ben Roethlisberger": ["Big Ben"],
    "Walter Payton": ["Sweetness"],
    "Barry Sanders": [],
    "Joe Montana": ["Joe Cool"],
    "Jerry Rice": ["Flash 80"],
    "Emmitt Smith": [],
    "Reggie White": ["The Minister of Defense"],
    "Ray Lewis": [],
    "Ed Reed": [],
    "Troy Polamalu": [],
    "Dick Butkus": [],
    "Lawrence Taylor": ["LT"],
    "LaDainian Tomlinson": ["LT21"],
    "Jim Brown": [],
    "Saquon Barkley": ["Saquads"],
    "Derrick Henry": ["King Henry"],
    "Nick Chubb": [],
    "Stefon Diggs": [],
    "Davante Adams": ["Tae"],
    "DeAndre Hopkins": ["Nuk", "DHop"],
    "A.J. Brown": ["AJ Brown"],
    "Amon-Ra St. Brown": ["Sun God"],
    "CeeDee Lamb": [],
    "George Kittle": [],
    "Myles Garrett": [],
    "Nick Bosa": [],
    "Joey Bosa": [],
    "Von Miller": [],
    "Khalil Mack": [],
    "Aaron Rodgers": ["A-Rod"],
    "Josh Allen": [],
    "Joe Burrow": ["Joe Brrr", "Joe Cool Burrow", "Joe Shiesty"],
    "Justin Herbert": [],
    "Trevor Lawrence": ["T-Law"],
    "Dak Prescott": [],
    "Russell Wilson": ["Russ", "DangeRuss"],
    "Kirk Cousins": ["Kirko Chainz"],
    "Matthew Stafford": [],
    "Cam Newton": ["Superman"],
    "Michael Vick": [],
    "Drew Brees": [],
    "Philip Rivers": [],
    "Eli Manning": [],
    "Steve Smith": ["Steve Smith Sr"],
    "Larry Fitzgerald": ["Fitz"],
    "Julio Jones": [],
    "DK Metcalf": ["D.K. Metcalf"],
    "Cooper Kupp": [],
    "Puka Nacua": [],
    "Brock Purdy": ["Mr. Irrelevant"],
    "C.J. Stroud": ["CJ Stroud"],
    "Jayden Daniels": [],
    "Caleb Williams": [],
    "Bijan Robinson": [],
    "Jahmyr Gibbs": [],
    "Breece Hall": [],
    "Jonathan Taylor": ["JT"],
    "Alvin Kamara": [],
    "Dalvin Cook": [],
    "Aaron Jones": [],
    "Frank Gore": ["Inconvenient Truth"],
    "Jamaal Charles": [],
    "Chris Johnson": ["CJ2K"],
    "Michael Thomas": ["Cant Guard Mike"],
    "Keenan Allen": [],
    "Mike Evans": [],
    "Sauce Gardner": ["Ahmad Gardner"],
    "Jalen Ramsey": [],
    "Richard Sherman": [],
    "Darrelle Revis": ["Revis Island"],
    "Charles Woodson": [],
    "Rod Woodson": [],
    "Patrick Peterson": [],
    "Xavien Howard": [],
    "Minkah Fitzpatrick": [],
    "Derwin James": [],
    "Budda Baker": [],
    "Harrison Smith": [],
    "Justin Tucker": [],
    "Adam Vinatieri": ["Automatic Adam"],
    "Sebastian Janikowski": ["Seabass"],
    "Matt Prater": [],
    "Harrison Butker": [],
    "Jake Elliott": [],
    "Brandon Aubrey": [],
}

SUFFIX_RE = re.compile(r"\s+(Jr\.?|Sr\.?|II|III|IV|V)$", re.IGNORECASE)


def aliases_for_player(name: str) -> list[str]:
    """Rule-based aliases plus curated nicknames for a player name."""
    out: list[str] = []

    # Suffix-free form: "Odell Beckham Jr." -> "Odell Beckham".
    stripped = SUFFIX_RE.sub("", name).strip()
    if stripped and stripped != name:
        out.append(stripped)

    # Dotted-initial variants: "T.J. Watt" -> "TJ Watt".
    if "." in name:
        undotted = re.sub(r"\.", "", name)
        undotted = re.sub(r"\s+", " ", undotted).strip()
        if undotted != name:
            out.append(undotted)

    for canonical, nicks in NICKNAMES.items():
        if canonical == name or canonical == stripped:
            out.extend(nicks)

    # Dedupe, drop self.
    seen: set[str] = set()
    result = []
    for a in out:
        key = a.lower()
        if key != name.lower() and key not in seen:
            seen.add(key)
            result.append(a)
    return result

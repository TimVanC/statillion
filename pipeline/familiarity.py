"""Familiarity scoring via Wikipedia pageviews.

Uses the MediaWiki Action API's prop=pageviews (last 60 days, up to 50
titles per request) as the familiarity signal. Results are cached on
disk so re-runs are cheap.
"""

import json
import time
from pathlib import Path

import requests

API = "https://en.wikipedia.org/w/api.php"
HEADERS = {
    "User-Agent": "Statillion-pipeline/0.1 (sports trivia prototype; timvancau@gmail.com)"
}
CACHE_PATH = Path(__file__).parent / "cache" / "pageviews.json"
BATCH = 50


def _load_cache() -> dict[str, int]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def _save_cache(cache: dict[str, int]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, indent=0), encoding="utf-8")


def _query_batch(
    session: requests.Session, titles: list[str]
) -> tuple[dict[str, int], set[str]]:
    """Returns (views by requested title, titles that hit a disambiguation page)."""
    base_params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "pageviews|pageprops",
        "ppprop": "disambiguation",
        "redirects": "1",
        "titles": "|".join(titles),
    }

    # prop=pageviews is returned in chunks: follow the continue token and
    # merge page data until the batch is complete.
    forward: dict[str, str] = {t: t for t in titles}
    by_final: dict[str, dict] = {}
    cont: dict = {}
    for _ in range(40):
        params = {**base_params, **cont}
        resp = session.get(API, params=params, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        query = data.get("query", {})

        for n in query.get("normalized", []):
            for req, cur in list(forward.items()):
                if cur == n["from"]:
                    forward[req] = n["to"]
        for r in query.get("redirects", []):
            for req, cur in list(forward.items()):
                if cur == r["from"]:
                    forward[req] = r["to"]

        for p in query.get("pages", []):
            existing = by_final.setdefault(p["title"], p)
            if existing is not p:
                pv = existing.get("pageviews") or {}
                pv.update(p.get("pageviews") or {})
                existing["pageviews"] = pv
                if "pageprops" in p:
                    existing["pageprops"] = p["pageprops"]

        if "continue" not in data:
            break
        cont = data["continue"]
        time.sleep(0.05)

    views: dict[str, int] = {}
    disambigs: set[str] = set()
    for requested, final in forward.items():
        page = by_final.get(final)
        if page is None or page.get("missing"):
            continue
        if "disambiguation" in page.get("pageprops", {}):
            disambigs.add(requested)
            continue
        pv = page.get("pageviews") or {}
        views[requested] = sum(v for v in pv.values() if isinstance(v, int))
    return views, disambigs


def pageviews_for(names: list[str], label: str = "") -> dict[str, int]:
    """60-day Wikipedia pageviews per name. Missing pages score 0.

    Names that resolve to a disambiguation page are retried with the
    " (American football)" qualifier.
    """
    cache = _load_cache()
    todo = [n for n in dict.fromkeys(names) if n not in cache]
    if todo:
        print(f"  fetching pageviews for {len(todo)} names {label}")
        session = requests.Session()
        retry_with_qualifier: list[str] = []
        for i in range(0, len(todo), BATCH):
            batch = todo[i : i + BATCH]
            views, disambigs = _query_batch(session, batch)
            for name in batch:
                if name in views:
                    cache[name] = views[name]
                elif name in disambigs:
                    retry_with_qualifier.append(name)
                else:
                    cache[name] = 0
            time.sleep(0.15)

        for i in range(0, len(retry_with_qualifier), BATCH):
            batch = retry_with_qualifier[i : i + BATCH]
            qualified = [f"{n} (American football)" for n in batch]
            views, _ = _query_batch(session, qualified)
            for name, q in zip(batch, qualified):
                cache[name] = views.get(q, 0)
            time.sleep(0.15)

        _save_cache(cache)
    return {n: cache.get(n, 0) for n in names}

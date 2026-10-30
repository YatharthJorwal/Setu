"""Fetch recent news for the Rudraprayag area and keep only what is relevant.

Usage:  python -m pipeline.news

Writes data/processed/news.json. Run by the scheduled GitHub Actions job (every few hours) so the hosted
site stays current, and by hand with `run.bat news`. Headlines and image links come from the GDELT Project
(gdeltproject.org); each item links to its publisher. A failed fetch never stops a build: the file is written
with an `error` note and the app says news is unavailable. When some queries fail, headlines already in the file
are kept (still within the age limit) so a bad run never leaves the card emptier than it was.
"""

from __future__ import annotations

import html
import json
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import requests

from .config import ROOT

PROCESSED = ROOT / "data" / "processed"
GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
USER_AGENT = "Setu-news/0.1 (https://github.com/YatharthJorwal/Setu)"
MIN_GAP_S = 6.0  # GDELT asks for at most one request every 5 seconds
TIMEOUT_S = 60  # GDELT is often slow; a short timeout was losing queries
ATTEMPTS = 4  # tries per query for timeouts, dropped connections, rate limits and server errors
ROUNDS = 2  # a second pass for queries that still failed, after RETRY_WAIT_S
RETRY_WAIT_S = 45.0
RATE_LIMIT_WAIT_S = 30.0  # GDELT limits shared addresses (GitHub runners, offices) hard; short waits just get limited again
MAX_AGE_DAYS = 30
MAX_ARTICLES = 16
SOURCE_NOTE = "Headlines and images found through the GDELT Project (gdeltproject.org). Each item links to its publisher."

QUERIES = [
    '("Rudraprayag" OR "Kedarnath" OR "Guptkashi" OR "Ukhimath" OR "Agastmuni" OR "Karnaprayag" OR "Sonprayag" '
    'OR "Gaurikund" OR "Chopta" OR "Tungnath" OR "Mandakini") sourcelang:english',
]
# Two more queries (Uttarakhand-wide roads and weather, and a Hindi one) were removed on 2026-10-31: they kept failing
# against GDELT's limits and made every run take minutes (docs/DECISIONS.md ADR-021). The headline filters still handle
# Hindi and region-wide items if a query for them is added back here.

# Words that tie a headline to the corridor itself ...
AREA = [
    "rudraprayag", "guptkashi", "ukhimath", "agastmuni", "augustmuni", "karnaprayag", "sonprayag", "gaurikund",
    "chopta", "tungnath", "mandakini", "kedarnath",
    "रुद्रप्रयाग", "केदारनाथ", "गुप्तकाशी", "ऊखीमठ", "अगस्त्यमुनि", "कर्णप्रयाग", "सोनप्रयाग", "गौरीकुंड", "चोपता",
    "तुंगनाथ", "मंदाकिनी",
]
# ... and to the wider region, which only counts when the headline is also about roads, weather or health.
REGION = ["uttarakhand", "garhwal", "char dham", "chardham", "उत्तराखंड", "गढ़वाल", "चारधाम"]
# "Kedarnath" is also a film; a headline about the film is not about the place.
FILM = ["film", "movie", "trailer", "bollywood", "sushant", "sara ali khan", "box office", "netflix", "ott "]
KEDARNATH_CONTEXT = ["uttarakhand", "yatra", "temple", "pilgrim", "shrine", "landslide", "helicopter", "mandakini", "dham"]
TOPICS = {
    "roads": ["landslide", "road", "highway", "blocked", "bridge", "traffic", "भूस्खलन", "सड़क", "हाईवे", "मार्ग", "जाम"],
    "weather": ["rain", "flood", "cloudburst", "snow", "alert", "imd", "monsoon", "weather", "बारिश", "बाढ़", "बादल", "बर्फबारी", "मौसम", "अलर्ट"],
    "health": ["hospital", "ambulance", "doctor", "medical", "health", "aiims", "अस्पताल", "एम्बुलेंस", "चिकित्सा", "स्वास्थ्य"],
}
SOURCE_NAMES = {
    "timesofindia.indiatimes.com": "Times of India", "hindustantimes.com": "Hindustan Times", "thehindu.com": "The Hindu",
    "indianexpress.com": "The Indian Express", "tribuneindia.com": "The Tribune", "ndtv.com": "NDTV",
    "news18.com": "News18", "indiatoday.in": "India Today", "amarujala.com": "Amar Ujala",
    "livehindustan.com": "Live Hindustan", "jagran.com": "Dainik Jagran", "newindianexpress.com": "The New Indian Express",
    "business-standard.com": "Business Standard", "deccanherald.com": "Deccan Herald", "dailypioneer.com": "The Pioneer",
    "etvbharat.com": "ETV Bharat", "navbharattimes.indiatimes.com": "Navbharat Times", "zeenews.india.com": "Zee News",
}


def _has(text: str, word: str) -> bool:
    """Word match. English words match at a word start ('road' matches 'roads', not 'broad'); Devanagari matches anywhere."""
    if word.isascii():
        return re.search(rf"(?<![a-z]){re.escape(word)}", text) is not None
    return word in text


def classify(title: str) -> list[str] | None:
    """Tags for a headline, or None if it is not relevant. Tags: area or region, then any of roads, weather, health."""
    t = title.lower()
    is_area = any(_has(t, k) for k in AREA)
    if is_area and "kedarnath" in t and any(_has(t, f) for f in FILM):
        # only the film unless the headline also names the region or pilgrimage
        others = [k for k in AREA if k != "kedarnath" and k.isascii()]
        if not any(_has(t, k) for k in KEDARNATH_CONTEXT + others):
            is_area = False
    topics = [name for name, words in TOPICS.items() if any(_has(t, w) for w in words)]
    if is_area:
        return ["area", *topics]
    if any(_has(t, k) for k in REGION) and topics:
        return ["region", *topics]
    return None


def source_name(domain: str) -> str:
    d = domain.lower().removeprefix("www.")
    return SOURCE_NAMES.get(d, d)


def parse_seen(value: str) -> datetime | None:
    """GDELT dates look like 20261026T103000Z."""
    try:
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _clean_title(raw: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(raw)).strip()


def _title_key(title: str) -> str:
    return re.sub(r"[^\w]+", "", title.lower())[:60]


def build_news(responses: list[dict], now: datetime) -> dict:
    """Merge the GDELT answers into the file the app reads: relevant, de-duplicated, newest first."""
    cutoff = now - timedelta(days=MAX_AGE_DAYS)
    found: list[dict] = []
    for resp in responses:
        for a in resp.get("articles", []) if isinstance(resp, dict) else []:
            url = a.get("url") or ""
            title = _clean_title(a.get("title") or "")
            seen = parse_seen(a.get("seendate", ""))
            if not title or not url.startswith(("http://", "https://")) or seen is None or seen < cutoff or seen > now + timedelta(days=1):
                continue
            tags = classify(title)
            if tags is None:
                continue
            image = a.get("socialimage") or ""
            image = image if image.startswith("https://") and not re.search(r"logo|favicon|placeholder", image, re.I) else None
            domain = a.get("domain") or urlparse(url).netloc
            found.append(
                {
                    "title": title,
                    "url": url,
                    "image": image,
                    "source": source_name(domain),
                    "published": seen.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "lang": "hi" if a.get("language", "").lower() == "hindi" else "en",
                    "tags": tags,
                }
            )
    return {
        "version": 1,
        "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SOURCE_NOTE,
        "articles": _newest_unique(found),
    }


def _newest_unique(found: list[dict]) -> list[dict]:
    """Newest first, one item per headline and per link, at most MAX_ARTICLES."""
    found = sorted(found, key=lambda x: x["published"], reverse=True)
    seen_keys: set[str] = set()
    seen_urls: set[str] = set()
    out: list[dict] = []
    for item in found:
        key = _title_key(item["title"])
        if key in seen_keys or item["url"] in seen_urls:
            continue
        seen_keys.add(key)
        seen_urls.add(item["url"])
        out.append(item)
        if len(out) >= MAX_ARTICLES:
            break
    return out


def load_previous(path) -> list[dict]:
    """Articles from an earlier news.json, or [] if there is none or it cannot be read."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    items = data.get("articles") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return []
    return [
        a for a in items
        if isinstance(a, dict) and a.get("title") and str(a.get("url", "")).startswith(("http://", "https://")) and a.get("published")
    ]


def merge_previous(result: dict, previous: list[dict], now: datetime) -> dict:
    """Add earlier headlines that are still recent to a result that came from a partly failed run."""
    cutoff = now - timedelta(days=MAX_AGE_DAYS)
    keep = []
    for a in previous:
        try:
            when = datetime.strptime(a["published"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
        if cutoff <= when <= now + timedelta(days=1):
            keep.append(a)
    return {**result, "articles": _newest_unique([*result["articles"], *keep])}


def fetch_query(query: str, get=requests.get, sleep=time.sleep) -> dict:
    """One GDELT request. Retries politely on rate limits, timeouts, dropped connections and server errors.

    Returns {} when there is nothing. Raises RuntimeError saying WHY when it gives up, so the log shows the real cause.
    """
    params = {"query": query, "mode": "artlist", "format": "json", "maxrecords": 75, "timespan": "30d", "sort": "datedesc"}
    why = "no attempt made"
    for attempt in range(ATTEMPTS):
        wait = MIN_GAP_S * (attempt + 2)
        try:
            r = get(GDELT_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT_S)
        except requests.RequestException as exc:  # timeout, connection reset, DNS, TLS
            why = type(exc).__name__
        else:
            body = (r.text or "").strip()
            if r.status_code == 200 and body.startswith("{"):
                try:
                    return r.json()
                except ValueError:
                    why = "reply was cut off"  # retry: GDELT sometimes drops the connection mid-answer
            elif r.status_code == 200 and body == "":
                return {}
            elif r.status_code == 429 or "limit" in body[:200].lower():
                why = "rate limited"
                wait = RATE_LIMIT_WAIT_S * (attempt + 1)
            elif r.status_code >= 500:
                why = f"HTTP {r.status_code}"
            else:  # GDELT answers a query it dislikes with plain text; retrying will not change that
                raise RuntimeError(f"GDELT did not return usable data (HTTP {r.status_code}: {body[:120]})")
        if attempt < ATTEMPTS - 1:
            print(f"  GDELT is busy ({why}); waiting {wait:.0f} s before trying again (Ctrl+C keeps what is on file)", flush=True)
            sleep(wait)
    raise RuntimeError(f"GDELT did not return usable data ({why}, {ATTEMPTS} tries)")


def main() -> None:
    now = datetime.now(timezone.utc)
    responses: dict[int, dict] = {}
    errors: dict[int, str] = {}
    stopped = False
    try:
        for round_no in range(ROUNDS):
            todo = [i for i in range(len(QUERIES)) if i not in responses]
            if not todo:
                break
            if round_no:
                print(f"  {len(todo)} of {len(QUERIES)} queries failed; trying them again in {RETRY_WAIT_S:.0f} seconds (Ctrl+C keeps what is on file)", flush=True)
                time.sleep(RETRY_WAIT_S)
            for n, i in enumerate(todo):
                if n:
                    time.sleep(MIN_GAP_S)
                print(f"  asking GDELT, query {i + 1} of {len(QUERIES)}", flush=True)
                try:
                    responses[i] = fetch_query(QUERIES[i])
                    errors.pop(i, None)
                except Exception as exc:  # noqa: BLE001 - one failed query must not lose the others
                    errors[i] = f"query {i + 1}: {exc}"
    except KeyboardInterrupt:  # the person got tired of waiting: keep whatever arrived, never write a broken file
        stopped = True
        print("\n  Stopped. Keeping the headlines already on file.")
        if not responses:
            return
    result = build_news([responses[i] for i in sorted(responses)], now)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    out = PROCESSED / "news.json"
    if errors or stopped:
        result = merge_previous(result, load_previous(out), now)
        result["error"] = "; ".join([errors[i] for i in sorted(errors)] + (["stopped before every query finished"] if stopped else []))[:300]
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"news.json: {len(result['articles'])} articles ({len(errors)} of {len(QUERIES)} queries failed)")
    for msg in (errors[i] for i in sorted(errors)):
        print(f"  FAILED {msg}")
    for item in result["articles"][:5]:
        print(f"  {item['published'][:10]}  {item['source']}: {item['title'][:80]}")


if __name__ == "__main__":
    main()

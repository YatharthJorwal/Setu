"""Fetch recent news for the Rudraprayag area and keep only what is relevant.

Usage:  python -m pipeline.news

Writes data/processed/news.json. Run by the scheduled GitHub Actions job (every few hours) so the hosted
site stays current, and by hand with `run.bat news`. Headlines and image links come from the GDELT Project
(gdeltproject.org); each item links to its publisher. A failed fetch never stops a build: the file is written
with an `error` note and the app says news is unavailable.
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
MAX_AGE_DAYS = 30
MAX_ARTICLES = 16
SOURCE_NOTE = "Headlines and images found through the GDELT Project (gdeltproject.org). Each item links to its publisher."

QUERIES = [
    '("Rudraprayag" OR "Kedarnath" OR "Guptkashi" OR "Ukhimath" OR "Agastmuni" OR "Karnaprayag" OR "Sonprayag" '
    'OR "Gaurikund" OR "Chopta" OR "Tungnath" OR "Mandakini") sourcelang:english',
    '("Uttarakhand" OR "Garhwal") (landslide OR cloudburst OR "road blocked" OR highway OR flood OR "heavy rain" '
    'OR "Char Dham") sourcelang:english',
    "(रुद्रप्रयाग OR केदारनाथ OR गुप्तकाशी OR ऊखीमठ OR अगस्त्यमुनि OR कर्णप्रयाग OR सोनप्रयाग) sourcelang:hindi",
]

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
    found.sort(key=lambda x: x["published"], reverse=True)
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
    return {
        "version": 1,
        "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SOURCE_NOTE,
        "articles": out,
    }


def fetch_query(query: str, get=requests.get, sleep=time.sleep) -> dict:
    """One GDELT request. Retries politely when told to slow down. Returns {} when there is nothing."""
    params = {"query": query, "mode": "artlist", "format": "json", "maxrecords": 75, "timespan": "30d", "sort": "datedesc"}
    for attempt in range(3):
        r = get(GDELT_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=40)
        body = (r.text or "").strip()
        if r.status_code == 200 and body.startswith("{"):
            return r.json()
        if r.status_code == 200 and body == "":
            return {}
        if r.status_code == 429 or "limit" in body[:200].lower():
            sleep(MIN_GAP_S * (attempt + 2))
            continue
        break
    raise RuntimeError(f"GDELT did not return usable data (HTTP {r.status_code})")


def main() -> None:
    now = datetime.now(timezone.utc)
    responses: list[dict] = []
    errors: list[str] = []
    for i, q in enumerate(QUERIES):
        if i:
            time.sleep(MIN_GAP_S)
        try:
            responses.append(fetch_query(q))
        except Exception as exc:  # noqa: BLE001 - one failed query must not lose the others
            errors.append(str(exc))
    result = build_news(responses, now)
    if errors:
        result["error"] = "; ".join(errors)[:300]
    PROCESSED.mkdir(parents=True, exist_ok=True)
    out = PROCESSED / "news.json"
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"news.json: {len(result['articles'])} articles ({len(errors)} of {len(QUERIES)} queries failed)")
    for item in result["articles"][:5]:
        print(f"  {item['published'][:10]}  {item['source']}: {item['title'][:80]}")


if __name__ == "__main__":
    main()

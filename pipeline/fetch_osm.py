"""Fetch OpenStreetMap data for an area from the Overpass API.

Usage:  python -m pipeline.fetch_osm --area rudraprayag

Writes raw JSON to data/raw/osm/. Be polite to the public Overpass servers:
run this once, reuse the files, and do not loop it. Data is (c) OpenStreetMap
contributors, ODbL; attribution must be shown in the app.
"""

from __future__ import annotations

import argparse
import json
import time

import requests

from .config import RAW, Area, get_area

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "Setu-data-audit/0.1 (https://github.com/YatharthJorwal/Setu)"

ROAD_CLASSES = (
    "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|"
    "tertiary|tertiary_link|unclassified|residential|living_street|service|track"
)


def _bbox(area: Area) -> str:
    # Overpass order is (south, west, north, east).
    return f"{area.south},{area.west},{area.north},{area.east}"


def queries(area: Area) -> dict[str, str]:
    b = _bbox(area)
    head = "[out:json][timeout:180];"
    return {
        "roads": f'{head}way["highway"~"^({ROAD_CLASSES})$"]({b});out geom tags;',
        "health": (
            f'{head}(nwr["amenity"~"^(hospital|clinic|doctors)$"]({b});'
            f'nwr["healthcare"]({b}););out center tags;'
        ),
        "places": (
            f'{head}node["place"~"^(city|town|village|hamlet|suburb|isolated_dwelling)$"]({b});'
            "out tags;"
        ),
        "buildings_count": f'{head}way["building"]({b});out count;',
    }


def run_query(query: str, retries: int = 4) -> dict:
    delay = 15.0
    for attempt in range(1, retries + 1):
        resp = requests.post(
            OVERPASS_URL,
            data={"data": query},
            headers={"User-Agent": USER_AGENT},
            timeout=240,
        )
        if resp.status_code in (429, 502, 503, 504) and attempt < retries:
            print(f"  Overpass busy (HTTP {resp.status_code}); retrying in {delay:.0f}s")
            time.sleep(delay)
            delay *= 2
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError("unreachable")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--area", default="rudraprayag")
    args = parser.parse_args()
    area = get_area(args.area)

    out_dir = RAW / "osm"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, query in queries(area).items():
        dest = out_dir / f"{area.key}_{name}.json"
        print(f"{name}: querying Overpass ...")
        data = run_query(query)
        dest.write_text(json.dumps(data), encoding="utf-8")
        print(f"  saved {dest} ({len(data.get('elements', []))} elements)")
        time.sleep(5)  # pause between queries


if __name__ == "__main__":
    main()

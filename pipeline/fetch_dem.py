"""Download Copernicus GLO-30 DEM tiles covering an area.

Usage:  python -m pipeline.fetch_dem --area rudraprayag

Tiles come from the public AWS bucket (no account needed). A 404 means the tile
is not in the public GLO-30 set; the script reports it instead of failing
silently. Read the Copernicus licence before shipping any derived data, and
record the attribution wording in docs/DATA.md.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import requests

from .config import RAW, Area, get_area

BUCKET_URL = "https://copernicus-dem-30m.s3.amazonaws.com"


def tile_name(lat_floor: int, lon_floor: int) -> str:
    """Tile id for the 1x1 degree tile whose south-west corner is (lat_floor, lon_floor)."""
    ns = "N" if lat_floor >= 0 else "S"
    ew = "E" if lon_floor >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat_floor):02d}_00_{ew}{abs(lon_floor):03d}_00_DEM"


def tile_names(area: Area) -> list[str]:
    lats = range(math.floor(area.south), math.floor(area.north) + 1)
    lons = range(math.floor(area.west), math.floor(area.east) + 1)
    return [tile_name(lat, lon) for lat in lats for lon in lons]


def tile_url(name: str) -> str:
    return f"{BUCKET_URL}/{name}/{name}.tif"


def download(name: str, dest_dir: Path) -> str:
    dest = dest_dir / f"{name}.tif"
    if dest.exists() and dest.stat().st_size > 0:
        return "exists"
    resp = requests.get(tile_url(name), stream=True, timeout=60)
    if resp.status_code == 404:
        return "NOT FOUND (tile not in the public GLO-30 set?)"
    resp.raise_for_status()
    tmp = dest.with_suffix(".part")
    with open(tmp, "wb") as fh:
        for chunk in resp.iter_content(chunk_size=1 << 20):
            fh.write(chunk)
    tmp.rename(dest)
    return f"downloaded ({dest.stat().st_size / 1e6:.1f} MB)"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--area", default="rudraprayag")
    args = parser.parse_args()
    area = get_area(args.area)

    dest_dir = RAW / "dem"
    dest_dir.mkdir(parents=True, exist_ok=True)
    for name in tile_names(area):
        print(f"{name}: {download(name, dest_dir)}")


if __name__ == "__main__":
    main()

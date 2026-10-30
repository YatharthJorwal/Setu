"""Estimate how many people live at each village, from a gridded population dataset.

Usage:
    python -m pipeline.population                       # reads the WorldPop 2020 India grid over the web, only the corridor
    python -m pipeline.population --raster path/to.tif  # or a file you downloaded
    python -m pipeline.build_graph --area rudraprayag   # then rebuild the graph to attach the numbers

Needs data/processed/terrain.json (run pipeline.build) and the raw OSM places (pipeline.fetch_osm).
Writes data/processed/population.json.

Method: every raster cell holds a number of people. A cell's people are shared equally among the places that fall
inside the cell; a cell with no place inside goes to the nearest place within MAX_KM; people farther than that from
any place are reported as unallocated. This is a MODELLED ESTIMATE (WorldPop, 2020), not a census count.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

from .build import PROCESSED, mesh_box
from .build_graph import place_rows
from .config import RAW, get_area

# WorldPop 2020, India, 100 m, constrained to built-settlement areas, people per pixel.
DEFAULT_RASTER = "https://worldpop-public-data.soton.ac.uk/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/IND/ind_ppp_2020_constrained.tif"
MAX_KM = 3.0
SOURCE = {
    "name": "WorldPop 2020 estimate",
    "year": 2020,
    "kind": "modelled",
    "licence": "CC BY 4.0",
    "citation": "WorldPop (www.worldpop.org), University of Southampton. Constrained individual countries 2020 (100 m), India.",
    "note": "Modelled estimate shared out to villages by proximity, not a census count.",
}


def allocate_population(
    cell_lon: np.ndarray,
    cell_lat: np.ndarray,
    cell_pop: np.ndarray,
    place_lon: np.ndarray,
    place_lat: np.ndarray,
    cell_size_m: float,
    max_km: float = MAX_KM,
    chunk: int = 1500,
) -> tuple[np.ndarray, float]:
    """Share each cell's people among places. Returns (people per place, people left unallocated). Nothing is lost."""
    out = np.zeros(len(place_lon))
    if len(place_lon) == 0:
        return out, float(cell_pop.sum())
    unallocated = 0.0
    r_cell_km = cell_size_m * 0.7072 / 1000.0  # half the cell's diagonal
    for start in range(0, len(cell_pop), chunk):
        sl = slice(start, start + chunk)
        clon, clat, pop = cell_lon[sl], cell_lat[sl], cell_pop[sl]
        dx = (place_lon[None, :] - clon[:, None]) * np.cos(np.radians(clat))[:, None] * 111.32
        dy = (place_lat[None, :] - clat[:, None]) * 110.86
        d = np.hypot(dx, dy)  # kilometres, cells by places
        within = d <= r_cell_km
        count = within.sum(axis=1)
        inside = count > 0
        if inside.any():
            share = np.where(inside, pop / np.maximum(count, 1), 0.0)
            out += (within * share[:, None]).sum(axis=0)
        rest = ~inside
        if rest.any():
            drest, prest = d[rest], pop[rest]
            nearest = drest.argmin(axis=1)
            dmin = drest[np.arange(len(nearest)), nearest]
            ok = dmin <= max_km
            np.add.at(out, nearest[ok], prest[ok])
            unallocated += float(prest[~ok].sum())
    return out, unallocated


def read_window(source: str, box: tuple[float, float, float, float]) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """People per cell inside the box, as flat arrays of cell lon, lat, people, plus the cell size in metres."""
    import rasterio  # noqa: PLC0415
    from rasterio.windows import from_bounds  # noqa: PLC0415

    west, south, east, north = box
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="3", GDAL_HTTP_RETRY_DELAY="2"
    ):
        with rasterio.open(source) as ds:
            if ds.crs is None or ds.crs.to_epsg() != 4326:
                raise SystemExit(f"Expected a raster in EPSG:4326 (WorldPop), got {ds.crs}.")
            win = from_bounds(west, south, east, north, ds.transform).round_offsets().round_lengths()
            arr = ds.read(1, window=win, masked=True).astype("float64")
            tr = ds.window_transform(win)
    rows, cols = np.indices(arr.shape)
    lon = tr.c + (cols + 0.5) * tr.a
    lat = tr.f + (rows + 0.5) * tr.e
    pop = np.ma.filled(arr, 0.0)
    pop[pop < 0] = 0.0  # nodata values are large negatives
    keep = pop > 0
    lat0 = (south + north) / 2
    cell_m = abs(tr.a) * 111_320.0 * math.cos(math.radians(lat0))
    return lon[keep], lat[keep], pop[keep], float(cell_m)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--area", default="rudraprayag")
    parser.add_argument("--raster", default=DEFAULT_RASTER, help="path or URL of a WorldPop people-per-pixel GeoTIFF")
    args = parser.parse_args()
    area = get_area(args.area)

    terrain = PROCESSED / "terrain.json"
    places_path = RAW / "osm" / f"{area.key}_places.json"
    for p, hint in ((terrain, f"python -m pipeline.build --area {area.key}"), (places_path, f"python -m pipeline.fetch_osm --area {area.key}")):
        if not p.exists():
            raise SystemExit(f"Missing {p}. Run: {hint}")
    box = mesh_box(json.loads(terrain.read_text(encoding="utf-8")))
    places = place_rows(json.loads(places_path.read_text(encoding="utf-8")), box)
    if not places:
        raise SystemExit("No places found. Re-fetch places: python -m pipeline.fetch_osm --only places")

    print(f"Reading population from {args.raster}")
    print("(a remote read can take a few minutes; a downloaded file is quicker)")
    clon, clat, cpop, cell_m = read_window(args.raster, box)
    box_total = float(cpop.sum())
    print(f"  {len(cpop)} populated cells, about {cell_m:.0f} m each, {box_total:,.0f} people inside the corridor box")

    per_place, unallocated = allocate_population(
        clon, clat, cpop,
        np.array([p["lon"] for p in places]), np.array([p["lat"] for p in places]),
        cell_size_m=cell_m,
    )
    result = {
        "version": 1,
        "source": {**SOURCE, "url": args.raster if args.raster.startswith("http") else Path(args.raster).name},
        "method": (
            "Each raster cell's people are shared equally among the places inside the cell; a cell with no place inside goes "
            f"to the nearest place within {MAX_KM:g} km; people farther than that are unallocated."
        ),
        "cell_size_m": round(cell_m),
        "box_total": round(box_total),
        "allocated_total": round(float(per_place.sum())),
        "unallocated_total": round(unallocated),
        "places": {p["id"]: int(round(v)) for p, v in zip(places, per_place)},
    }
    out = PROCESSED / "population.json"
    out.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print(f"population.json: {result['allocated_total']:,} people given to {len(places)} places, {result['unallocated_total']:,} unallocated")
    print("Sanity check: this should be well below the whole district's population. Then run: python -m pipeline.build_graph --area " + area.key)


if __name__ == "__main__":
    main()

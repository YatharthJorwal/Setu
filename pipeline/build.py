"""Build processed artifacts for the web app from data/raw.

Usage:
    python -m pipeline.build --area rudraprayag [--cols 320]

Reads  data/raw/dem/*.tif and data/raw/osm/<area>_*.json
Writes data/processed/{terrain.json, terrain.f32, roads.json, facilities.json,
                       places.json (if usable), provenance.json}

M2 scope: what the viewer needs. The routing graph for the simulation (M3) is
a separate step. Facility tiers here are name-based GUESSES (see ADR-008).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
from pathlib import Path

import numpy as np

from .audit import base_class, guess_tier, haversine_m, point_of
from .config import RAW, ROOT, Area, get_area

PROCESSED = ROOT / "data" / "processed"

CLASS_ORDER = [
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "service",
    "living_street",
    "track",
]
DP_TOLERANCE_DEG = 0.00005  # about 5 m: line simplification for rendering only
COORD_DECIMALS = 5  # about 1 m

Box = tuple[float, float, float, float]  # xmin (lon), ymin (lat), xmax, ymax
Pt = tuple[float, float]


# ------------------------------------------------------------- geometry utils


def _perp_dist(p: Pt, a: Pt, b: Pt) -> float:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify_dp(pts: list[Pt], tol: float) -> list[Pt]:
    """Douglas-Peucker, iterative (no recursion limit on long ways)."""
    n = len(pts)
    if n < 3:
        return list(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        dmax, idx = 0.0, -1
        for k in range(i + 1, j):
            d = _perp_dist(pts[k], pts[i], pts[j])
            if d > dmax:
                dmax, idx = d, k
        if idx != -1 and dmax > tol:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(pts, keep) if k]


def clip_segment(p0: Pt, p1: Pt, box: Box) -> tuple[Pt, Pt, float, float] | None:
    """Liang-Barsky. Returns (start, end, t0, t1) of the part inside the box, or None."""
    xmin, ymin, xmax, ymax = box
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x0 - xmin), (dx, xmax - x0), (-dy, y0 - ymin), (dy, ymax - y0)):
        if p == 0:
            if q < 0:
                return None
        else:
            r = q / p
            if p < 0:
                if r > t1:
                    return None
                t0 = max(t0, r)
            else:
                if r < t0:
                    return None
                t1 = min(t1, r)
    return (x0 + t0 * dx, y0 + t0 * dy), (x0 + t1 * dx, y0 + t1 * dy), t0, t1


def clip_polyline(pts: list[Pt], box: Box) -> list[list[Pt]]:
    """Split a polyline into the pieces that lie inside the box."""
    out: list[list[Pt]] = []
    cur: list[Pt] = []
    for a, b in zip(pts, pts[1:]):
        res = clip_segment(a, b, box)
        if res is None:
            if len(cur) >= 2:
                out.append(cur)
            cur = []
            continue
        start, end, t0, t1 = res
        if t0 > 0.0 or not cur:
            if len(cur) >= 2:
                out.append(cur)
            cur = [start]
        cur.append(end)
        if t1 < 1.0:  # leaves the box here
            if len(cur) >= 2:
                out.append(cur)
            cur = []
    if len(cur) >= 2:
        out.append(cur)
    return out


# -------------------------------------------------------------------- terrain


def build_terrain(area: Area, cols: int, dem_dir: Path, out_dir: Path) -> dict:
    """Mosaic the DEM tiles and resample (area average) to a coarse grid for the mesh."""
    import rasterio  # noqa: PLC0415
    from rasterio.enums import Resampling  # noqa: PLC0415
    from rasterio.merge import merge  # noqa: PLC0415

    files = sorted(dem_dir.glob("*.tif"))
    if not files:
        raise SystemExit(f"No DEM tiles in {dem_dir}. Run: python -m pipeline.fetch_dem --area {area.key}")

    lat0 = (area.south + area.north) / 2
    dx = (area.east - area.west) / cols
    dy = dx * (111_320.0 * math.cos(math.radians(lat0))) / 110_860.0  # roughly square cells in metres

    sources = [rasterio.open(f) for f in files]
    try:
        arr, transform = merge(sources, bounds=area.bbox_wsen, res=(dx, dy), resampling=Resampling.average)
    finally:
        for s in sources:
            s.close()

    grid = arr[0].astype("float32")
    rows, cols_actual = grid.shape
    grid[grid < -100] = np.nan  # treat obvious nodata as voids
    n_void = int(np.isnan(grid).sum())
    if n_void:
        grid[np.isnan(grid)] = np.nanmin(grid)

    out_dir.mkdir(parents=True, exist_ok=True)
    grid.astype("<f4").tofile(out_dir / "terrain.f32")

    cell_lon = float(transform.a)
    cell_lat = float(-transform.e)
    meta = {
        "version": 1,
        "source": "Copernicus GLO-30 DEM, area-averaged to a coarse grid",
        "west": float(transform.c),
        "north": float(transform.f),
        "east": float(transform.c) + cols_actual * cell_lon,
        "south": float(transform.f) - rows * cell_lat,
        "cols": int(cols_actual),
        "rows": int(rows),
        "cell_lon_deg": cell_lon,
        "cell_lat_deg": cell_lat,
        "cell_size_m": round(cell_lon * 111_320.0 * math.cos(math.radians(lat0)), 1),
        "elevation_min_m": round(float(grid.min()), 1),
        "elevation_max_m": round(float(grid.max()), 1),
        "voids_filled": n_void,
        "encoding": "float32 little-endian, row-major, north to south, metres, sample at cell centre",
        "file": "terrain.f32",
    }
    (out_dir / "terrain.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def mesh_box(meta: dict) -> Box:
    """Extent of the terrain mesh (vertices sit at cell centres). Roads are clipped to this."""
    hx, hy = meta["cell_lon_deg"] / 2, meta["cell_lat_deg"] / 2
    return (meta["west"] + hx, meta["south"] + hy, meta["east"] - hx, meta["north"] - hy)


# ---------------------------------------------------------------------- roads


def build_roads(roads_raw: dict, box: Box) -> dict:
    classes = list(CLASS_ORDER)
    index = {c: i for i, c in enumerate(classes)}
    out: list[dict] = []
    total_m = 0.0
    ways = 0
    for way in roads_raw.get("elements", []):
        tags = way.get("tags", {})
        cls = base_class(tags.get("highway", ""))
        geom = way.get("geometry") or []
        if not cls or len(geom) < 2:
            continue
        if cls not in index:
            index[cls] = len(classes)
            classes.append(cls)
        pts = [(g["lon"], g["lat"]) for g in geom]
        bridge = 0 if tags.get("bridge") in (None, "no") else 1
        used = False
        for piece in clip_polyline(pts, box):
            piece = simplify_dp(piece, DP_TOLERANCE_DEG)
            if len(piece) < 2:
                continue
            used = True
            total_m += sum(haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(piece, piece[1:]))
            flat: list[float] = []
            for lon, lat in piece:
                flat += [round(lon, COORD_DECIMALS), round(lat, COORD_DECIMALS)]
            out.append({"c": index[cls], "b": bridge, "p": flat})
        ways += 1 if used else 0
    return {"version": 1, "classes": classes, "total_km": round(total_m / 1000, 1), "ways": ways, "roads": out}


# ------------------------------------------------------- facilities and places


def _inside(pt: Pt, box: Box) -> bool:
    return box[0] <= pt[0] <= box[2] and box[1] <= pt[1] <= box[3]


def build_facilities(health_raw: dict, box: Box) -> dict:
    rows = []
    for el in health_raw.get("elements", []):
        pt = point_of(el)
        if pt is None or not _inside(pt, box):
            continue
        tags = el.get("tags", {})
        rows.append(
            {
                "id": f"{el.get('type', 'x')}/{el.get('id', '')}",
                "name": tags.get("name", ""),
                "kind": tags.get("amenity") or tags.get("healthcare", ""),
                "tier_guess": guess_tier(tags),
                "lon": round(pt[0], COORD_DECIMALS),
                "lat": round(pt[1], COORD_DECIMALS),
            }
        )
    return {"version": 1, "facilities": rows}


def build_places(places_raw: dict, box: Box) -> dict | None:
    elements = places_raw.get("elements", [])
    rows = []
    for el in elements:
        pt = point_of(el)
        if pt is None or not _inside(pt, box):
            continue
        tags = el.get("tags", {})
        rows.append(
            {
                "name": tags.get("name", ""),
                "kind": tags.get("place", ""),
                "lon": round(pt[0], COORD_DECIMALS),
                "lat": round(pt[1], COORD_DECIMALS),
            }
        )
    if elements and not rows:
        return None  # elements without coordinates: the fetch query is wrong
    return {"version": 1, "places": rows}


# ----------------------------------------------------------------- provenance


def _retrieved(paths: list[Path]) -> str:
    stamps = [dt.datetime.fromtimestamp(p.stat().st_mtime, dt.timezone.utc) for p in paths if p.exists()]
    return max(stamps).date().isoformat() if stamps else "unknown"


def build_provenance(area: Area, terrain_meta: dict, dem_files: list[Path], osm_files: list[Path]) -> list[dict]:
    return [
        {
            "dataset": "Terrain: Copernicus DEM GLO-30",
            "source_url": "https://registry.opendata.aws/copernicus-dem/",
            "licence": "Copernicus DEM licence (free for the general public); wording to be confirmed from the licence text",
            "retrieved_on": _retrieved(dem_files),
            "coverage_note": f"Area-averaged to about {terrain_meta['cell_size_m']:.0f} m cells for display.",
            "gaps": "Surface model (includes buildings and vegetation). No voids found in the corridor.",
            "manual_patches": [],
        },
        {
            "dataset": "Roads, health facilities, places: OpenStreetMap",
            "source_url": "https://www.openstreetmap.org/copyright",
            "licence": "ODbL 1.0, (c) OpenStreetMap contributors",
            "retrieved_on": _retrieved(osm_files),
            "coverage_note": "Fetched via the Overpass API for the corridor bounding box.",
            "gaps": (
                "Hill road attributes are sparse (most roads are tagged unclassified; few names, surfaces or speeds). "
                "Facility tiers are name-based guesses, not official classifications. "
                "Village positions are OSM place nodes; population is not included."
            ),
            "manual_patches": [],
        },
    ]


# ------------------------------------------------------------------------ CLI


def _load(area: Area, name: str) -> dict:
    path = RAW / "osm" / f"{area.key}_{name}.json"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run: python -m pipeline.fetch_osm --area {area.key}")
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, obj: object) -> None:
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.name} ({path.stat().st_size / 1024:.0f} KB)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--area", default="rudraprayag")
    parser.add_argument("--cols", type=int, default=320, help="terrain grid columns (default 320, about 105 m cells)")
    args = parser.parse_args()
    area = get_area(args.area)

    PROCESSED.mkdir(parents=True, exist_ok=True)
    dem_dir = RAW / "dem"
    print("terrain ...")
    meta = build_terrain(area, args.cols, dem_dir, PROCESSED)
    print(
        f"  grid {meta['cols']} x {meta['rows']}, {meta['cell_size_m']} m cells, "
        f"elevation {meta['elevation_min_m']} to {meta['elevation_max_m']} m, voids filled {meta['voids_filled']}"
    )
    box = mesh_box(meta)

    print("roads ...")
    roads = build_roads(_load(area, "roads"), box)
    _write(PROCESSED / "roads.json", roads)
    print(f"  {roads['ways']} ways, about {roads['total_km']} km inside the mesh")

    print("facilities ...")
    fac = build_facilities(_load(area, "health"), box)
    _write(PROCESSED / "facilities.json", fac)
    print(f"  {len(fac['facilities'])} facilities inside the mesh")

    print("places ...")
    places = build_places(_load(area, "places"), box)
    places_path = PROCESSED / "places.json"
    if places is None:
        places_path.unlink(missing_ok=True)
        print("  SKIPPED: place elements have no coordinates. Re-fetch: python -m pipeline.fetch_osm --only places")
    else:
        _write(places_path, places)
        print(f"  {len(places['places'])} places inside the mesh")

    osm_files = sorted((RAW / "osm").glob(f"{area.key}_*.json"))
    prov = build_provenance(area, meta, sorted(dem_dir.glob("*.tif")), osm_files)
    _write(PROCESSED / "provenance.json", prov)
    print("done. Next: cd web && npm install && npm run dev")


if __name__ == "__main__":
    main()

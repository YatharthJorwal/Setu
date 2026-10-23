"""Data audit: is the raw data for a corridor good enough to build Setu on?

Usage:
    python -m pipeline.fetch_osm --area rudraprayag
    python -m pipeline.fetch_dem --area rudraprayag
    python -m pipeline.audit --area rudraprayag

Writes data/audit/<area>.json and prints a summary you can paste into the
audit log in docs/DATA.md. The audit measures; it does not judge. Thresholds
below are audit heuristics, not model assumptions.

Key question it answers: how many villages and clinics sit on the main road
network, and how fragmented is that network? A fragmented or sparse network
means gaps to patch by hand (see docs/RULES.md D2) before the sim can be trusted.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import networkx as nx
import numpy as np

from .config import AUDIT, RAW, Area, get_area

SNAP_FACILITY_M = 300.0  # facility counts as "on the network" within this distance
SNAP_PLACE_M = 500.0  # village counts as "on the network" within this distance
MIN_FRAGMENT_KM = 0.3  # report detached road fragments longer than this

TAGS_OF_INTEREST = ("name", "ref", "surface", "maxspeed", "bridge")


# ----------------------------------------------------------------- geometry


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def node_key(pt: dict) -> tuple[float, float]:
    return (round(pt["lon"], 6), round(pt["lat"], 6))


def point_of(el: dict) -> tuple[float, float] | None:
    if "lat" in el and "lon" in el:
        return el["lon"], el["lat"]
    center = el.get("center")
    if center:
        return center["lon"], center["lat"]
    return None


def base_class(highway: str) -> str:
    return highway.removesuffix("_link")


# ------------------------------------------------------------------ network


def build_graph(ways: list[dict], include_tracks: bool) -> nx.Graph:
    graph = nx.Graph()
    for way in ways:
        cls = base_class(way.get("tags", {}).get("highway", ""))
        if not cls or (cls == "track" and not include_tracks):
            continue
        geom = way.get("geometry") or []
        for a, b in zip(geom, geom[1:]):
            u, v = node_key(a), node_key(b)
            if u == v:
                continue
            length = haversine_m(a["lon"], a["lat"], b["lon"], b["lat"])
            if graph.has_edge(u, v):
                length = min(length, graph[u][v]["length_m"])
            graph.add_edge(u, v, length_m=length, cls=cls)
    return graph


class Network:
    """Connected components by road length, plus nearest-node lookups."""

    def __init__(self, graph: nx.Graph):
        self.graph = graph
        self.comp_of: dict[tuple[float, float], int] = {}
        self.length_m: dict[int, float] = defaultdict(float)
        self.centroid: dict[int, tuple[float, float]] = {}
        for i, comp in enumerate(nx.connected_components(graph)):
            pts = np.array(list(comp))
            self.centroid[i] = (float(pts[:, 0].mean()), float(pts[:, 1].mean()))
            for n in comp:
                self.comp_of[n] = i
        for u, _v, d in graph.edges(data=True):
            self.length_m[self.comp_of[u]] += d["length_m"]
        self.main = max(self.length_m, key=self.length_m.get) if self.length_m else None
        self._nodes = list(graph.nodes)
        arr = np.array(self._nodes) if self._nodes else np.empty((0, 2))
        self._lon, self._lat = arr[:, 0], arr[:, 1]

    def nearest(self, lon: float, lat: float) -> tuple[tuple[float, float] | None, float]:
        if not self._nodes:
            return None, math.inf
        dx = (self._lon - lon) * math.cos(math.radians(lat)) * 111_320.0
        dy = (self._lat - lat) * 110_540.0
        i = int(np.argmin(dx * dx + dy * dy))
        return self._nodes[i], float(math.hypot(dx[i], dy[i]))

    def summary(self) -> dict:
        total = sum(self.length_m.values())
        main_len = self.length_m.get(self.main, 0.0) if self.main is not None else 0.0
        fragments = [
            {
                "length_km": round(length / 1000, 2),
                "centroid_lon": round(self.centroid[i][0], 5),
                "centroid_lat": round(self.centroid[i][1], 5),
            }
            for i, length in sorted(self.length_m.items(), key=lambda kv: -kv[1])
            if i != self.main and length / 1000 >= MIN_FRAGMENT_KM
        ]
        return {
            "nodes": self.graph.number_of_nodes(),
            "edges": self.graph.number_of_edges(),
            "total_length_km": round(total / 1000, 1),
            "components": len(self.length_m),
            "main_component_km": round(main_len / 1000, 1),
            "main_component_share": round(main_len / total, 3) if total else 0.0,
            "detached_fragments_over_min": fragments[:25],
            "detached_fragment_count": len(fragments),
        }


# ------------------------------------------------------------------- audits


def road_stats(ways: list[dict]) -> dict:
    length_by_class: Counter = Counter()
    tag_counts: Counter = Counter()
    for way in ways:
        tags = way.get("tags", {})
        cls = base_class(tags.get("highway", "unknown"))
        geom = way.get("geometry") or []
        length_by_class[cls] += sum(
            haversine_m(a["lon"], a["lat"], b["lon"], b["lat"]) for a, b in zip(geom, geom[1:])
        )
        for t in TAGS_OF_INTEREST:
            if t in tags:
                tag_counts[t] += 1
    n = max(len(ways), 1)
    return {
        "ways": len(ways),
        "length_km_by_class": {k: round(v / 1000, 1) for k, v in length_by_class.most_common()},
        "tag_coverage": {t: round(tag_counts[t] / n, 3) for t in TAGS_OF_INTEREST},
        "bridges": int(tag_counts["bridge"]),
    }


def points_on_network(
    items: list[dict], net: Network, snap_m: float
) -> tuple[dict, list[dict]]:
    """Snap items to the nearest road node; report how many are on the main network."""
    rows = []
    no_coords = 0
    for it in items:
        pt = point_of(it)
        if pt is None:
            no_coords += 1
            continue
        node, dist = net.nearest(*pt)
        comp = net.comp_of.get(node) if node else None
        rows.append(
            {
                "name": it.get("tags", {}).get("name", ""),
                "kind": it.get("tags", {}).get("place")
                or it.get("tags", {}).get("amenity")
                or it.get("tags", {}).get("healthcare", ""),
                "lon": round(pt[0], 5),
                "lat": round(pt[1], 5),
                "tier_guess": guess_tier(it.get("tags", {})),
                "dist_to_road_m": round(dist, 0) if math.isfinite(dist) else None,
                "within_snap": dist <= snap_m,
                "on_main_network": comp is not None and comp == net.main and dist <= snap_m,
            }
        )
    n = len(rows)
    stats = {
        "count": n,
        "elements_without_coordinates": no_coords,  # nonzero means the fetch query is wrong
        "within_snap": sum(r["within_snap"] for r in rows),
        "on_main_network": sum(r["on_main_network"] for r in rows),
        "snap_threshold_m": snap_m,
    }
    return stats, rows


def guess_tier(tags: dict) -> str:
    """Best-effort health facility tier from OSM tags. A GUESS: curate by hand (RULES D2)."""
    name = tags.get("name", "").lower()
    if re.search(r"\b(itbp|echs)\b", name):
        return "restricted_access"
    if "district hospital" in name or "district women" in name:
        return "district_hospital"
    if "trauma" in name:
        return "trauma_centre"
    if re.search(r"\bchc\b|community health", name):
        return "chc"
    if re.search(r"\baphc\b|\bphc\b|primary health", name):
        return "phc"
    if re.search(r"sub\s*-?\s*centre|subcenter", name):
        return "sub_centre"
    if "hospital" in name or tags.get("amenity") == "hospital":
        return "hospital_other"
    if tags.get("amenity") in ("clinic", "doctors"):
        return "clinic_other"
    return "unknown"


def dem_stats(area: Area) -> dict:
    try:
        import rasterio  # noqa: PLC0415
        from rasterio.windows import from_bounds  # noqa: PLC0415
    except ImportError:
        return {"status": "skipped", "reason": "rasterio not installed (pip install rasterio)"}
    files = sorted((RAW / "dem").glob("*.tif"))
    if not files:
        return {"status": "skipped", "reason": "no tiles in data/raw/dem; run pipeline.fetch_dem"}

    total = voids = 0
    vmin, vmax = math.inf, -math.inf
    tiles = []
    for f in files:
        with rasterio.open(f) as ds:
            west = max(area.west, ds.bounds.left)
            east = min(area.east, ds.bounds.right)
            south = max(area.south, ds.bounds.bottom)
            north = min(area.north, ds.bounds.top)
            if west >= east or south >= north:
                continue
            win = from_bounds(west, south, east, north, ds.transform)
            arr = ds.read(1, window=win, masked=True)
            n_void = int(np.ma.count_masked(arr))
            total += arr.size
            voids += n_void
            if arr.count():
                vmin, vmax = min(vmin, float(arr.min())), max(vmax, float(arr.max()))
            tiles.append(f.name)
    return {
        "status": "ok" if total else "no_overlap",
        "tiles_used": tiles,
        "samples_in_bbox": total,
        "void_share": round(voids / total, 5) if total else None,
        "elevation_min_m": None if vmin is math.inf else round(vmin, 1),
        "elevation_max_m": None if vmax == -math.inf else round(vmax, 1),
    }


def run_audit(
    area: Area,
    roads: dict,
    health: dict,
    places: dict,
    buildings_count: dict,
    with_dem: bool = True,
) -> dict:
    ways = roads.get("elements", [])
    strict = Network(build_graph(ways, include_tracks=False))
    loose = Network(build_graph(ways, include_tracks=True))

    fac_stats, fac_rows = points_on_network(health.get("elements", []), strict, SNAP_FACILITY_M)
    place_stats, place_rows = points_on_network(places.get("elements", []), strict, SNAP_PLACE_M)
    place_stats_tracks, _ = points_on_network(places.get("elements", []), loose, SNAP_PLACE_M)

    count_el = next((e for e in buildings_count.get("elements", []) if e.get("type") == "count"), {})
    buildings = int(count_el.get("tags", {}).get("total", 0))

    place_kinds = Counter(r["kind"] for r in place_rows)
    return {
        "area": area.key,
        "bbox_wsen": area.bbox_wsen,
        "roads": road_stats(ways),
        "network_without_tracks": strict.summary(),
        "network_with_tracks": loose.summary(),
        "facilities": {
            "stats": fac_stats,
            "tier_guess_counts": dict(Counter(r["tier_guess"] for r in fac_rows)),
            "unknown_tier_names": sorted({r["name"] or "(unnamed)" for r in fac_rows if r["tier_guess"] == "unknown"}),
            "list": fac_rows,
        },
        "places": {
            "stats_without_tracks": place_stats,
            "stats_with_tracks": place_stats_tracks,
            "by_kind": dict(place_kinds),
            "unconnected": [r for r in place_rows if not r["on_main_network"]][:60],
        },
        "buildings_total": buildings,
        "dem": dem_stats(area) if with_dem else {"status": "skipped", "reason": "--skip-dem"},
    }


# --------------------------------------------------------------------- CLI


def _load(area: Area, name: str) -> dict:
    path = RAW / "osm" / f"{area.key}_{name}.json"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run: python -m pipeline.fetch_osm --area {area.key}")
    return json.loads(path.read_text(encoding="utf-8"))


def markdown_summary(rep: dict) -> str:
    net = rep["network_without_tracks"]
    fac = rep["facilities"]["stats"]
    pl = rep["places"]["stats_without_tracks"]
    plt_ = rep["places"]["stats_with_tracks"]
    dem = rep["dem"]
    warn = []
    for label, st in (("facilities", fac), ("places", pl)):
        if st["elements_without_coordinates"]:
            warn.append(f"WARNING: {st['elements_without_coordinates']} {label} elements have no coordinates; "
                        "re-fetch with pipeline.fetch_osm")
    lines = warn + [
        f"### Audit run: {rep['area']}",
        f"- Roads: {rep['roads']['ways']} ways; length by class (km): {rep['roads']['length_km_by_class']}",
        f"- Tag coverage (share of ways): {rep['roads']['tag_coverage']}; bridges tagged: {rep['roads']['bridges']}",
        f"- Network without tracks: {net['total_length_km']} km, {net['components']} components; "
        f"main component holds {net['main_component_share']:.0%} of length; "
        f"{net['detached_fragment_count']} detached fragments over {MIN_FRAGMENT_KM} km",
        f"- Facilities: {fac['count']} found; {fac['within_snap']} within {fac['snap_threshold_m']:.0f} m of a road; "
        f"{fac['on_main_network']} on the main network",
        f"- Places: {pl['count']} found; on main network (no tracks): {pl['on_main_network']}; "
        f"(with tracks): {plt_['on_main_network']}",
        f"- Facility tier guesses (name-based, curate by hand): {rep['facilities']['tier_guess_counts']}; "
        f"unknown: {rep['facilities']['unknown_tier_names']}",
        f"- Buildings in OSM: {rep['buildings_total']}",
        f"- DEM: {dem}",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--area", default="rudraprayag")
    parser.add_argument("--skip-dem", action="store_true")
    args = parser.parse_args()
    area = get_area(args.area)

    rep = run_audit(
        area,
        roads=_load(area, "roads"),
        health=_load(area, "health"),
        places=_load(area, "places"),
        buildings_count=_load(area, "buildings_count"),
        with_dem=not args.skip_dem,
    )
    AUDIT.mkdir(parents=True, exist_ok=True)
    out: Path = AUDIT / f"{area.key}.json"
    out.write_text(json.dumps(rep, indent=2), encoding="utf-8")
    print(markdown_summary(rep))
    print(f"\nFull report: {out}")


if __name__ == "__main__":
    main()

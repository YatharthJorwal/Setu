"""Build the routing graph used by the simulation (M3).

Usage:
    python -m pipeline.build_graph --area rudraprayag
    python -m pipeline.build_graph --area rudraprayag --write-tier-template

Needs data/processed/terrain.json (run pipeline.build first) and the raw OSM files.
Writes data/processed/graph.json.

Choices (ADR-010):
- Drivable roads only: tracks are excluded.
- Ways are clipped to the terrain mesh box, like the viewer.
- Chains of degree-2 vertices collapse into single edges; edges also break where the road
  class or bridge flag changes, and at any vertex a village or facility snaps to.
- Villages and facilities snap to the nearest road vertex. Beyond the snap distance they
  are left unconnected (node = null) and the simulation reports them as such.
- Facility tiers come from pipeline/patches/facility_tiers.csv when curated, otherwise
  from the name-based guess (ADR-008).
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .audit import base_class, guess_tier, haversine_m, point_of
from .build import CLASS_ORDER, DP_TOLERANCE_DEG, PROCESSED, Box, clip_polyline, mesh_box, simplify_dp
from .config import RAW, ROOT, get_area

Key = tuple[float, float]

DRIVABLE = frozenset(
    {"trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service", "living_street"}
)
PLACE_KINDS = frozenset({"city", "town", "village", "hamlet", "isolated_dwelling"})  # suburbs excluded
SNAP_FACILITY_M = 300.0
SNAP_PLACE_M = 500.0
TIERS = (
    "district_hospital",
    "trauma_centre",
    "chc",
    "phc",
    "sub_centre",
    "hospital_other",
    "clinic_other",
    "restricted_access",
    "unknown",
)
TIER_CSV = ROOT / "pipeline" / "patches" / "facility_tiers.csv"
TIER_CSV_FIELDS = ["lon", "lat", "name", "tier_guess", "tier", "note"]


@dataclass(frozen=True)
class Seg:
    u: Key
    v: Key
    length: float
    cls: str
    bridge: int
    label: str


def node_key(pt: tuple[float, float]) -> Key:
    return (round(pt[0], 6), round(pt[1], 6))


def coord_key(lon: float, lat: float) -> tuple[float, float]:
    """Key used to match a facility between files (5 decimals, same as the viewer files)."""
    return (round(lon, 5), round(lat, 5))


# ------------------------------------------------------------------ segments


def build_segments(roads_raw: dict, box: Box) -> list[Seg]:
    segs: list[Seg] = []
    seen: set[frozenset] = set()
    for way in roads_raw.get("elements", []):
        tags = way.get("tags", {})
        cls = base_class(tags.get("highway", ""))
        geom = way.get("geometry") or []
        if cls not in DRIVABLE or len(geom) < 2:
            continue
        bridge = 0 if tags.get("bridge") in (None, "no") else 1
        label = tags.get("name") or tags.get("ref") or ""
        pts = [(g["lon"], g["lat"]) for g in geom]
        for piece in clip_polyline(pts, box):
            for a, b in zip(piece, piece[1:]):
                u, v = node_key(a), node_key(b)
                if u == v:
                    continue
                pair = frozenset((u, v))
                if pair in seen:
                    continue
                seen.add(pair)
                segs.append(Seg(u, v, haversine_m(a[0], a[1], b[0], b[1]), cls, bridge, label))
    return segs


# ---------------------------------------------------------------- snapping


class Snapper:
    def __init__(self, keys: list[Key]):
        self.keys = keys
        arr = np.array(keys) if keys else np.empty((0, 2))
        self.lon, self.lat = arr[:, 0], arr[:, 1]

    def nearest(self, lon: float, lat: float) -> tuple[Key | None, float]:
        if not self.keys:
            return None, math.inf
        dx = (self.lon - lon) * math.cos(math.radians(lat)) * 111_320.0
        dy = (self.lat - lat) * 110_860.0
        i = int(np.argmin(dx * dx + dy * dy))
        return self.keys[i], float(math.hypot(dx[i], dy[i]))


# ------------------------------------------------------- facilities / places


def load_tier_overrides(path: Path) -> dict[tuple[float, float], str]:
    """Curated tiers: rows with a non-blank `tier`. Invalid tiers raise, so typos cannot slip in."""
    if not path.exists():
        return {}
    out: dict[tuple[float, float], str] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for n, row in enumerate(csv.DictReader(fh), start=2):
            tier = (row.get("tier") or "").strip()
            if not tier:
                continue
            if tier not in TIERS:
                raise ValueError(f"{path.name} line {n}: unknown tier '{tier}'. Allowed: {', '.join(TIERS)}")
            out[coord_key(float(row["lon"]), float(row["lat"]))] = tier
    return out


def _inside(pt: tuple[float, float], box: Box) -> bool:
    return box[0] <= pt[0] <= box[2] and box[1] <= pt[1] <= box[3]


def facility_rows(health_raw: dict, box: Box, overrides: dict) -> list[dict]:
    rows = []
    for el in health_raw.get("elements", []):
        pt = point_of(el)
        if pt is None or not _inside(pt, box):
            continue
        tags = el.get("tags", {})
        key = coord_key(*pt)
        curated = overrides.get(key)
        rows.append(
            {
                "id": f"{el.get('type', 'x')}/{el.get('id', '')}",
                "name": tags.get("name", ""),
                "kind": tags.get("amenity") or tags.get("healthcare", ""),
                "tier": curated or guess_tier(tags),
                "tier_source": "curated" if curated else "guess",
                "lon": round(pt[0], 5),
                "lat": round(pt[1], 5),
            }
        )
    return rows


def place_rows(places_raw: dict, box: Box) -> list[dict]:
    rows = []
    for el in places_raw.get("elements", []):
        pt = point_of(el)
        tags = el.get("tags", {})
        if pt is None or not _inside(pt, box) or tags.get("place") not in PLACE_KINDS:
            continue
        rows.append(
            {
                "id": f"{el.get('type', 'x')}/{el.get('id', '')}",
                "name": tags.get("name", ""),
                "kind": tags["place"],
                "lon": round(pt[0], 5),
                "lat": round(pt[1], 5),
            }
        )
    return rows


def write_tier_template(health_raw: dict, box: Box, path: Path = TIER_CSV) -> int:
    """Write (or refresh) the review sheet. Existing curated tiers and notes are preserved."""
    existing: dict[tuple[float, float], dict] = {}
    if path.exists():
        with open(path, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                existing[coord_key(float(row["lon"]), float(row["lat"]))] = row
    rows = facility_rows(health_raw, box, {})
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=TIER_CSV_FIELDS)
        writer.writeheader()
        for r in sorted(rows, key=lambda r: (r["name"].lower(), r["lon"], r["lat"])):
            old = existing.get(coord_key(r["lon"], r["lat"]), {})
            writer.writerow(
                {
                    "lon": r["lon"],
                    "lat": r["lat"],
                    "name": r["name"],
                    "tier_guess": r["tier"],
                    "tier": old.get("tier", ""),
                    "note": old.get("note", ""),
                }
            )
    return len(rows)


# -------------------------------------------------------------------- graph


def build_graph(
    roads_raw: dict,
    health_raw: dict,
    places_raw: dict,
    box: Box,
    tier_overrides: dict | None = None,
    population: dict | None = None,
) -> dict:
    segs = build_segments(roads_raw, box)
    incident: dict[Key, list[int]] = defaultdict(list)
    for i, s in enumerate(segs):
        incident[s.u].append(i)
        incident[s.v].append(i)
    snapper = Snapper(sorted(incident))

    facilities = facility_rows(health_raw, box, tier_overrides or {})
    places = place_rows(places_raw, box)

    terminals: set[Key] = set()

    def snap_all(rows: list[dict], limit: float) -> list[tuple[Key | None, float]]:
        """One result per row, by position (ids can repeat across lists, so they are not used as keys)."""
        out = []
        for r in rows:
            key, dist = snapper.nearest(r["lon"], r["lat"])
            ok = key is not None and dist <= limit
            out.append((key if ok else None, dist))
            if ok:
                terminals.add(key)
        return out

    fac_snaps = snap_all(facilities, SNAP_FACILITY_M)
    place_snaps = snap_all(places, SNAP_PLACE_M)

    keep: set[Key] = {n for n, inc in incident.items() if len(inc) != 2} | terminals
    for n, inc in incident.items():
        if len(inc) == 2:
            a, b = segs[inc[0]], segs[inc[1]]
            if (a.cls, a.bridge) != (b.cls, b.bridge):
                keep.add(n)

    node_index: dict[Key, int] = {}
    nodes: list[list[float]] = []

    def index_of(key: Key) -> int:
        if key not in node_index:
            node_index[key] = len(nodes)
            nodes.append([key[0], key[1]])
        return node_index[key]

    class_idx = {c: i for i, c in enumerate(CLASS_ORDER)}
    visited: set[int] = set()
    edges: list[dict] = []
    for start in sorted(keep):
        for first in incident[start]:
            if first in visited:
                continue
            path: list[Key] = [start]
            length = 0.0
            seg_i, cur = first, start
            while True:
                visited.add(seg_i)
                s = segs[seg_i]
                nxt = s.v if s.u == cur else s.u
                path.append(nxt)
                length += s.length
                if nxt in keep:
                    break
                inc = incident[nxt]
                seg_i = inc[1] if inc[0] == seg_i else inc[0]
                cur = nxt
            if path[0] == path[-1]:
                continue  # a loop: irrelevant for routing
            head = segs[first]
            label = next((segs[i].label for i in _seg_chain(path, incident, segs) if segs[i].label), "")
            simple = simplify_dp(path, DP_TOLERANCE_DEG)
            flat: list[float] = []
            for lon, lat in simple:
                flat += [round(lon, 5), round(lat, 5)]
            edges.append(
                {
                    "a": index_of(path[0]),
                    "b": index_of(path[-1]),
                    "len": round(length, 1),
                    "c": class_idx[head.cls],
                    "br": head.bridge,
                    "p": flat,
                    "n": label,
                }
            )

    people = (population or {}).get("places", {})

    def attach(rows: list[dict], snaps: list[tuple[Key | None, float]], with_population: bool = False) -> list[dict]:
        out = []
        for r, (key, dist) in zip(rows, snaps):
            node = node_index.get(key) if key is not None else None
            row = {**r, "node": node, "snap_m": round(dist, 0) if math.isfinite(dist) else None}
            if with_population and r["id"] in people:
                row["population"] = int(people[r["id"]])
            out.append(row)
        return out

    graph = {
        "version": 1,
        "classes": list(CLASS_ORDER),
        "nodes": nodes,
        "edges": edges,
        "places": attach(places, place_snaps, with_population=True),
        "facilities": attach(facilities, fac_snaps),
    }
    if population and population.get("source"):
        graph["population_source"] = population["source"]
    graph["stats"] = graph_stats(graph)
    return graph


def _seg_chain(path: list[Key], incident: dict[Key, list[int]], segs: list[Seg]) -> list[int]:
    """Segment indices along a collapsed path (used to pick a label)."""
    out = []
    for a, b in zip(path, path[1:]):
        for i in incident[a]:
            s = segs[i]
            if {s.u, s.v} == {a, b}:
                out.append(i)
                break
    return out


def graph_stats(graph: dict) -> dict:
    n = len(graph["nodes"])
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for e in graph["edges"]:
        ra, rb = find(e["a"]), find(e["b"])
        if ra != rb:
            parent[ra] = rb
    length_by_root: dict[int, float] = defaultdict(float)
    for e in graph["edges"]:
        length_by_root[find(e["a"])] += e["len"]
    total = sum(length_by_root.values())
    main_root = max(length_by_root, key=length_by_root.get) if length_by_root else None

    def in_main(row: dict) -> bool:
        return row["node"] is not None and main_root is not None and find(row["node"]) == main_root

    return {
        "nodes": n,
        "edges": len(graph["edges"]),
        "total_km": round(total / 1000, 1),
        "components": len(length_by_root),
        "main_component_share": round(length_by_root.get(main_root, 0.0) / total, 3) if total else 0.0,
        "places_total": len(graph["places"]),
        "places_snapped": sum(r["node"] is not None for r in graph["places"]),
        "places_in_main": sum(in_main(r) for r in graph["places"]),
        "facilities_total": len(graph["facilities"]),
        "facilities_snapped": sum(r["node"] is not None for r in graph["facilities"]),
        "facilities_in_main": sum(in_main(r) for r in graph["facilities"]),
        "places_with_population": sum("population" in r for r in graph["places"]),
        "population_total": sum(r.get("population", 0) for r in graph["places"]),
        "facility_tiers_guess": sum(r["tier_source"] == "guess" for r in graph["facilities"]),
        "facility_tiers_curated": sum(r["tier_source"] == "curated" for r in graph["facilities"]),
    }


# ---------------------------------------------------------------------- CLI


def _load(area_key: str, name: str) -> dict:
    path = RAW / "osm" / f"{area_key}_{name}.json"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run: python -m pipeline.fetch_osm --area {area_key}")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--area", default="rudraprayag")
    parser.add_argument("--write-tier-template", action="store_true", help="write or refresh pipeline/patches/facility_tiers.csv")
    args = parser.parse_args()
    area = get_area(args.area)

    terrain_path = PROCESSED / "terrain.json"
    if not terrain_path.exists():
        raise SystemExit(f"Missing {terrain_path}. Run: python -m pipeline.build --area {area.key}")
    box = mesh_box(json.loads(terrain_path.read_text(encoding="utf-8")))
    health = _load(area.key, "health")

    if args.write_tier_template:
        n = write_tier_template(health, box)
        print(f"Wrote {n} facilities to {TIER_CSV}")
        print("Open it, fill the `tier` column where the guess is wrong or blank, save, then run this again without the flag.")
        print("Allowed tiers: " + ", ".join(TIERS))
        return

    overrides = load_tier_overrides(TIER_CSV)
    pop_path = PROCESSED / "population.json"
    population = json.loads(pop_path.read_text(encoding="utf-8")) if pop_path.exists() else None
    graph = build_graph(_load(area.key, "roads"), health, _load(area.key, "places"), box, overrides, population)
    out = PROCESSED / "graph.json"
    out.write_text(json.dumps(graph, separators=(",", ":")), encoding="utf-8")
    s = graph["stats"]
    print(f"graph.json: {out.stat().st_size / 1024:.0f} KB")
    print(f"  nodes {s['nodes']}, edges {s['edges']}, {s['total_km']} km, components {s['components']}, main holds {s['main_component_share']:.0%}")
    print(f"  places: {s['places_snapped']}/{s['places_total']} snapped, {s['places_in_main']} on the main network")
    print(f"  facilities: {s['facilities_snapped']}/{s['facilities_total']} snapped, {s['facilities_in_main']} on the main network")
    if s["places_with_population"]:
        print(f"  population: {s['population_total']:,} people across {s['places_with_population']} places ({graph['population_source']['name']})")
    else:
        print("  population: none loaded (run: python -m pipeline.population)")
    print(f"  facility tiers: {s['facility_tiers_curated']} curated, {s['facility_tiers_guess']} still name-based guesses")


if __name__ == "__main__":
    main()

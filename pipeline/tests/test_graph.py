"""Offline tests for pipeline.build_graph on tiny synthetic networks."""

import csv
import tempfile
import unittest
from pathlib import Path

from pipeline.build_graph import (
    SNAP_PLACE_M,
    build_graph,
    load_tier_overrides,
    write_tier_template,
)

BOX = (78.0, 30.0, 79.0, 31.0)


def way(points, highway="secondary", **tags):
    return {"type": "way", "tags": {"highway": highway, **tags},
            "geometry": [{"lon": x, "lat": y} for x, y in points]}


_next_id = [0]


def node(lon, lat, **tags):
    _next_id[0] += 1
    return {"type": "node", "id": _next_id[0], "lon": lon, "lat": lat, "tags": tags}


def empty():
    return {"elements": []}


def graph(roads, health=None, places=None, overrides=None):
    return build_graph({"elements": roads}, health or empty(), places or empty(), BOX, overrides)


class CollapseTests(unittest.TestCase):
    def test_straight_chain_collapses_to_one_edge(self):
        g = graph([way([(78.1, 30.5), (78.11, 30.5), (78.12, 30.5), (78.13, 30.5)])])
        self.assertEqual(len(g["edges"]), 1)
        self.assertEqual(len(g["nodes"]), 2)
        self.assertAlmostEqual(g["edges"][0]["len"], 2877, delta=20)  # 0.03 degrees of longitude at 30.5 N

    def test_junction_splits_edges(self):
        g = graph([
            way([(78.1, 30.5), (78.2, 30.5), (78.3, 30.5)]),
            way([(78.2, 30.5), (78.2, 30.6)]),
        ])
        self.assertEqual(len(g["edges"]), 3)
        self.assertEqual(len(g["nodes"]), 4)

    def test_class_change_and_bridge_split_a_chain(self):
        g = graph([
            way([(78.1, 30.5), (78.2, 30.5)], "primary"),
            way([(78.2, 30.5), (78.3, 30.5)], "primary", bridge="yes"),
            way([(78.3, 30.5), (78.4, 30.5)], "tertiary"),
        ])
        self.assertEqual(len(g["edges"]), 3)
        self.assertEqual([e["br"] for e in g["edges"]], [0, 1, 0])

    def test_tracks_are_excluded(self):
        g = graph([way([(78.1, 30.5), (78.2, 30.5)], "track")])
        self.assertEqual(g["edges"], [])

    def test_roads_outside_the_box_are_dropped_and_crossing_roads_clipped(self):
        g = graph([way([(70.0, 30.5), (71.0, 30.5)]), way([(78.5, 30.5), (80.0, 30.5)])])
        self.assertEqual(len(g["edges"]), 1)
        self.assertLessEqual(max(g["edges"][0]["p"][0::2]), 79.0 + 1e-9)

    def test_loops_are_dropped(self):
        ring = [(78.1, 30.5), (78.2, 30.5), (78.2, 30.6), (78.1, 30.6), (78.1, 30.5)]
        self.assertEqual(graph([way(ring)])["edges"], [])

    def test_label_prefers_name_then_ref(self):
        g = graph([way([(78.1, 30.5), (78.2, 30.5)], ref="NH 7")])
        self.assertEqual(g["edges"][0]["n"], "NH 7")

    def test_output_is_deterministic(self):
        roads = [way([(78.1, 30.5), (78.2, 30.5), (78.3, 30.5)]), way([(78.2, 30.5), (78.2, 30.6)])]
        self.assertEqual(graph(roads), graph(roads))


class SnapTests(unittest.TestCase):
    ROAD = [way([(78.1, 30.5), (78.11, 30.5), (78.12, 30.5), (78.13, 30.5)])]

    def test_place_snaps_and_splits_the_chain_there(self):
        g = graph(self.ROAD, places={"elements": [node(78.11, 30.5003, place="village", name="V")]})
        place = g["places"][0]
        self.assertIsNotNone(place["node"])
        self.assertLess(place["snap_m"], SNAP_PLACE_M)
        self.assertEqual(len(g["edges"]), 2)  # the snapped vertex became a node

    def test_far_place_stays_unconnected(self):
        g = graph(self.ROAD, places={"elements": [node(78.5, 30.9, place="village", name="Far")]})
        self.assertIsNone(g["places"][0]["node"])
        self.assertEqual(g["stats"]["places_snapped"], 0)

    def test_elements_sharing_an_id_are_snapped_independently(self):
        roads = self.ROAD + [way([(78.6, 30.8), (78.65, 30.8), (78.7, 30.8)])]
        a = {"type": "node", "id": 7, "lon": 78.11, "lat": 30.5, "tags": {"place": "village", "name": "A"}}
        b = {"type": "node", "id": 7, "lon": 78.65, "lat": 30.8, "tags": {"place": "village", "name": "B"}}
        g = graph(roads, places={"elements": [a, b]})
        self.assertNotEqual(g["places"][0]["node"], g["places"][1]["node"])

    def test_suburbs_are_not_counted_as_places(self):
        g = graph(self.ROAD, places={"elements": [node(78.11, 30.5, place="suburb", name="S")]})
        self.assertEqual(g["places"], [])

    def test_facility_tier_guess_and_override(self):
        health = {"elements": [node(78.12, 30.5001, name="SubCentre, X", healthcare="centre")]}
        self.assertEqual(graph(self.ROAD, health=health)["facilities"][0]["tier"], "sub_centre")
        g = graph(self.ROAD, health=health, overrides={(78.12, 30.5001): "phc"})
        self.assertEqual(g["facilities"][0]["tier"], "phc")
        self.assertEqual(g["facilities"][0]["tier_source"], "curated")

    def test_stats_report_main_component(self):
        roads = self.ROAD + [way([(78.6, 30.8), (78.65, 30.8), (78.7, 30.8)])]
        places = {"elements": [node(78.11, 30.5, place="village", name="A"), node(78.65, 30.8, place="hamlet", name="B")]}
        g = graph(roads, places=places)
        self.assertEqual(g["stats"]["components"], 2)
        self.assertEqual(g["stats"]["places_snapped"], 2)
        self.assertEqual(g["stats"]["places_in_main"], 1)


class TierSheetTests(unittest.TestCase):
    def test_template_roundtrip_preserves_curated_rows_and_validates_tiers(self):
        health = {"elements": [node(78.2, 30.5, name="CHC Test", healthcare="centre"),
                               node(78.3, 30.5, name="Mystery", healthcare="centre")]}
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "tiers.csv"
            self.assertEqual(write_tier_template(health, BOX, path), 2)
            with open(path, encoding="utf-8") as fh:
                rows = list(csv.DictReader(fh))
            self.assertEqual({r["name"]: r["tier_guess"] for r in rows}, {"CHC Test": "chc", "Mystery": "unknown"})

            # a person fills in one tier and a note
            for r in rows:
                if r["name"] == "Mystery":
                    r["tier"], r["note"] = "phc", "checked on map"
            with open(path, "w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
                w.writeheader()
                w.writerows(rows)

            write_tier_template(health, BOX, path)  # refresh must not lose the edit
            self.assertEqual(load_tier_overrides(path), {(78.3, 30.5): "phc"})

            rows[0]["tier"] = "not_a_tier"
            with open(path, "w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
                w.writeheader()
                w.writerows(rows)
            with self.assertRaises(ValueError):
                load_tier_overrides(path)

    def test_missing_sheet_means_no_overrides(self):
        self.assertEqual(load_tier_overrides(Path("/nonexistent/tiers.csv")), {})


if __name__ == "__main__":
    unittest.main()

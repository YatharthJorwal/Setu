"""Offline tests for the audit logic using a tiny synthetic corridor.

Run from the repo root:  python -m unittest discover -s pipeline/tests -t .
"""

import unittest

from pipeline.audit import Network, build_graph, guess_tier, haversine_m, point_of, run_audit
from pipeline.config import Area
from pipeline.fetch_dem import tile_name, tile_names

AREA = Area("t", 78.90, 30.25, 79.25, 30.68, "EPSG:32644", "test")


def way(points, highway="secondary", **tags):
    return {
        "type": "way",
        "tags": {"highway": highway, **tags},
        "geometry": [{"lon": lon, "lat": lat} for lon, lat in points],
    }


# Main road: three nodes along a line. Second road shares the middle node (a junction).
MAIN = way([(79.00, 30.40), (79.01, 30.40), (79.02, 30.40)], "primary", name="NH", bridge="yes")
BRANCH = way([(79.01, 30.40), (79.01, 30.41)], "tertiary")
# Detached fragment, about 1.1 km, far from the main road.
ISLAND = way([(79.15, 30.60), (79.16, 30.60)], "residential")
# Track connecting the island to the main road (only counted with tracks).
TRACK = way([(79.02, 30.40), (79.15, 30.60)], "track")


class AuditTests(unittest.TestCase):
    def test_haversine_one_degree_latitude(self):
        self.assertAlmostEqual(haversine_m(79, 30, 79, 31), 111_195, delta=200)

    def test_point_of_handles_node_and_center(self):
        self.assertEqual(point_of({"lon": 1, "lat": 2}), (1, 2))
        self.assertEqual(point_of({"center": {"lon": 3, "lat": 4}}), (3, 4))
        self.assertIsNone(point_of({}))

    def test_junction_connects_branch_to_main(self):
        net = Network(build_graph([MAIN, BRANCH, ISLAND], include_tracks=False))
        self.assertEqual(len(net.length_m), 2)  # main+branch, and the island
        self.assertEqual(net.summary()["detached_fragment_count"], 1)

    def test_track_only_counts_when_included(self):
        strict = Network(build_graph([MAIN, ISLAND, TRACK], include_tracks=False))
        loose = Network(build_graph([MAIN, ISLAND, TRACK], include_tracks=True))
        self.assertEqual(len(strict.length_m), 2)
        self.assertEqual(len(loose.length_m), 1)

    def test_run_audit_counts_facilities_and_places(self):
        roads = {"elements": [MAIN, BRANCH, ISLAND, TRACK]}
        health = {
            "elements": [
                {"type": "node", "lon": 79.0101, "lat": 30.4001, "tags": {"amenity": "hospital", "name": "Near"}},
                {"type": "way", "center": {"lon": 78.95, "lat": 30.30}, "tags": {"amenity": "clinic", "name": "Far"}},
            ]
        }
        places = {
            "elements": [
                {"type": "node", "lon": 79.0102, "lat": 30.4101, "tags": {"place": "village", "name": "OnMain"}},
                {"type": "node", "lon": 79.1601, "lat": 30.6001, "tags": {"place": "hamlet", "name": "OnIsland"}},
                {"type": "node", "lon": 78.92, "lat": 30.27, "tags": {"place": "village", "name": "Nowhere"}},
            ]
        }
        buildings = {"elements": [{"type": "count", "tags": {"total": "42"}}]}
        rep = run_audit(AREA, roads, health, places, buildings, with_dem=False)

        self.assertEqual(rep["facilities"]["stats"]["count"], 2)
        self.assertEqual(rep["facilities"]["stats"]["on_main_network"], 1)
        self.assertEqual(rep["places"]["stats_without_tracks"]["count"], 3)
        self.assertEqual(rep["places"]["stats_without_tracks"]["on_main_network"], 1)
        # With the track, the island joins the main network; the third village is still out.
        self.assertEqual(rep["places"]["stats_with_tracks"]["on_main_network"], 2)
        self.assertEqual(rep["buildings_total"], 42)
        self.assertEqual(rep["roads"]["bridges"], 1)
        names = {p["name"] for p in rep["places"]["unconnected"]}
        self.assertEqual(names, {"OnIsland", "Nowhere"})

    def test_elements_without_coordinates_are_flagged(self):
        places = {"elements": [{"type": "node", "id": 1, "tags": {"place": "village", "name": "NoCoords"}}]}
        rep = run_audit(AREA, {"elements": [MAIN]}, {"elements": []}, places, {"elements": []}, with_dem=False)
        self.assertEqual(rep["places"]["stats_without_tracks"]["count"], 0)
        self.assertEqual(rep["places"]["stats_without_tracks"]["elements_without_coordinates"], 1)

    def test_guess_tier(self):
        cases = {
            "District Hospital Rudraprayag": "district_hospital",
            "CHC Karanprayag": "chc",
            "Community Health Centre, Ratura": "chc",
            "Ukhimath Primary Health Centre": "phc",
            "APHC Gaucher": "phc",
            "SubCentre, Kalimath": "sub_centre",
            "Trauma Centre": "trauma_centre",
            "ITBP Hospital": "restricted_access",
            "ECHS PolyClinic": "restricted_access",
            "Government Hospital, Basukedar": "hospital_other",
            "Augustmuni": "unknown",
        }
        for name, tier in cases.items():
            self.assertEqual(guess_tier({"name": name}), tier, name)
        self.assertEqual(guess_tier({"name": "Semwal Clinic", "amenity": "clinic"}), "clinic_other")

    def test_empty_inputs_do_not_crash(self):
        rep = run_audit(AREA, {"elements": []}, {"elements": []}, {"elements": []}, {"elements": []}, with_dem=False)
        self.assertEqual(rep["network_without_tracks"]["components"], 0)
        self.assertEqual(rep["facilities"]["stats"]["count"], 0)


class DemTileTests(unittest.TestCase):
    def test_tile_name_format(self):
        self.assertEqual(tile_name(30, 78), "Copernicus_DSM_COG_10_N30_00_E078_00_DEM")
        self.assertEqual(tile_name(-5, -70), "Copernicus_DSM_COG_10_S05_00_W070_00_DEM")

    def test_rudraprayag_needs_two_tiles(self):
        self.assertEqual(
            tile_names(AREA),
            ["Copernicus_DSM_COG_10_N30_00_E078_00_DEM", "Copernicus_DSM_COG_10_N30_00_E079_00_DEM"],
        )


if __name__ == "__main__":
    unittest.main()

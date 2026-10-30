"""Offline tests for the population allocation (the raster reading itself needs rasterio and real files)."""

import unittest

import numpy as np

from pipeline.build_graph import build_graph
from pipeline.population import allocate_population

BOX = (78.0, 30.0, 79.0, 31.0)
LAT, LON = 30.5, 78.5
KM_LON = 1 / (111.32 * np.cos(np.radians(LAT)))  # degrees of longitude per km
KM_LAT = 1 / 110.86


def arr(*v):
    return np.array(v, dtype=float)


class AllocationTests(unittest.TestCase):
    def test_a_cell_is_shared_equally_among_places_inside_it(self):
        # one 1 km cell holding 100 people, two places within it, one far away
        out, un = allocate_population(arr(LON), arr(LAT), arr(100), arr(LON, LON + 0.1 * KM_LON, LON + 20 * KM_LON), arr(LAT, LAT, LAT), 1000)
        self.assertEqual(list(np.round(out, 6)), [50.0, 50.0, 0.0])
        self.assertEqual(un, 0.0)

    def test_a_cell_with_no_place_inside_goes_to_the_nearest_within_range(self):
        # a 100 m cell, places 1 km and 2 km away
        out, un = allocate_population(arr(LON), arr(LAT), arr(40), arr(LON + 1 * KM_LON, LON + 2 * KM_LON), arr(LAT, LAT), 100)
        self.assertEqual(list(np.round(out, 6)), [40.0, 0.0])
        self.assertEqual(un, 0.0)

    def test_people_too_far_from_any_place_are_reported_not_lost(self):
        out, un = allocate_population(arr(LON), arr(LAT), arr(70), arr(LON + 10 * KM_LON), arr(LAT), 100)
        self.assertEqual(out.sum(), 0.0)
        self.assertEqual(un, 70.0)

    def test_nothing_is_created_or_lost(self):
        rng = np.random.default_rng(3)
        n = 400
        clon = LON + rng.uniform(-0.1, 0.1, n)
        clat = LAT + rng.uniform(-0.1, 0.1, n)
        pop = rng.uniform(0, 30, n)
        plon = LON + rng.uniform(-0.12, 0.12, 25)
        plat = LAT + rng.uniform(-0.12, 0.12, 25)
        out, un = allocate_population(clon, clat, pop, plon, plat, 100)
        self.assertAlmostEqual(out.sum() + un, pop.sum(), places=6)

    def test_chunk_size_does_not_change_the_answer(self):
        rng = np.random.default_rng(5)
        n = 300
        clon, clat = LON + rng.uniform(-0.05, 0.05, n), LAT + rng.uniform(-0.05, 0.05, n)
        pop = rng.uniform(1, 20, n)
        plon, plat = LON + rng.uniform(-0.06, 0.06, 12), LAT + rng.uniform(-0.06, 0.06, 12)
        a, ua = allocate_population(clon, clat, pop, plon, plat, 1000, chunk=1)
        b, ub = allocate_population(clon, clat, pop, plon, plat, 1000, chunk=1000)
        self.assertTrue(np.allclose(a, b))
        self.assertAlmostEqual(ua, ub)

    def test_no_places_means_everyone_is_unallocated(self):
        out, un = allocate_population(arr(LON), arr(LAT), arr(9), arr(), arr(), 100)
        self.assertEqual(len(out), 0)
        self.assertEqual(un, 9.0)


class GraphAttachTests(unittest.TestCase):
    ROADS = {"elements": [{"type": "way", "tags": {"highway": "secondary"},
                           "geometry": [{"lon": 78.1 + i * 0.01, "lat": 30.5} for i in range(5)]}]}
    PLACES = {"elements": [{"type": "node", "id": 7, "lon": 78.11, "lat": 30.5, "tags": {"place": "village", "name": "A"}},
                           {"type": "node", "id": 8, "lon": 78.13, "lat": 30.5, "tags": {"place": "hamlet", "name": "B"}}]}

    def test_population_is_attached_by_place_id_with_its_source(self):
        pop = {"source": {"name": "Test estimate", "kind": "modelled"}, "places": {"node/7": 120}}
        g = build_graph(self.ROADS, {"elements": []}, self.PLACES, BOX, None, pop)
        by_name = {p["name"]: p for p in g["places"]}
        self.assertEqual(by_name["A"]["population"], 120)
        self.assertNotIn("population", by_name["B"])  # unknown stays unknown, never zero
        self.assertEqual(g["population_source"]["name"], "Test estimate")
        self.assertEqual(g["stats"]["population_total"], 120)
        self.assertEqual(g["stats"]["places_with_population"], 1)

    def test_without_population_nothing_changes(self):
        g = build_graph(self.ROADS, {"elements": []}, self.PLACES, BOX)
        self.assertNotIn("population_source", g)
        self.assertTrue(all("population" not in p for p in g["places"]))
        self.assertEqual(g["stats"]["population_total"], 0)


if __name__ == "__main__":
    unittest.main()

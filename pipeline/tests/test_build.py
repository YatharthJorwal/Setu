"""Offline tests for the pure parts of pipeline.build (no rasterio needed)."""

import unittest

from pipeline.build import (
    build_facilities,
    build_places,
    build_roads,
    clip_polyline,
    clip_segment,
    mesh_box,
    simplify_dp,
)

BOX = (0.0, 0.0, 10.0, 10.0)


class GeometryTests(unittest.TestCase):
    def test_simplify_drops_collinear_points(self):
        pts = [(0, 0), (1, 0.00001), (2, 0), (3, 0)]
        self.assertEqual(simplify_dp(pts, 0.001), [(0, 0), (3, 0)])

    def test_simplify_keeps_real_corners(self):
        pts = [(0, 0), (5, 0), (5, 5)]
        self.assertEqual(simplify_dp(pts, 0.001), pts)

    def test_simplify_short_inputs_unchanged(self):
        self.assertEqual(simplify_dp([(0, 0), (1, 1)], 0.1), [(0, 0), (1, 1)])

    def test_clip_segment_fully_inside_and_outside(self):
        self.assertIsNotNone(clip_segment((1, 1), (2, 2), BOX))
        self.assertIsNone(clip_segment((-5, -5), (-1, -1), BOX))

    def test_clip_segment_crossing(self):
        start, end, t0, t1 = clip_segment((-5, 5), (15, 5), BOX)
        self.assertEqual((start, end), ((0.0, 5.0), (10.0, 5.0)))
        self.assertAlmostEqual(t0, 0.25)
        self.assertAlmostEqual(t1, 0.75)

    def test_clip_polyline_splits_when_leaving_and_reentering(self):
        # inside, out the right side, back in on the way down
        pts = [(2, 5), (12, 5), (12, 2), (8, 2)]
        pieces = clip_polyline(pts, BOX)
        self.assertEqual(len(pieces), 2)
        self.assertEqual(pieces[0][0], (2, 5))
        self.assertEqual(pieces[0][-1], (10.0, 5.0))
        self.assertAlmostEqual(pieces[1][0][0], 10.0)
        self.assertEqual(pieces[1][-1], (8, 2))

    def test_clip_polyline_fully_inside_is_one_piece(self):
        self.assertEqual(clip_polyline([(1, 1), (2, 2), (3, 1)], BOX), [[(1, 1), (2, 2), (3, 1)]])


def way(points, highway="primary", **tags):
    return {"type": "way", "tags": {"highway": highway, **tags},
            "geometry": [{"lon": x, "lat": y} for x, y in points]}


class BuildTests(unittest.TestCase):
    def test_roads_classes_bridges_and_clipping(self):
        raw = {"elements": [
            way([(1, 1), (4, 1)], "primary", bridge="yes"),
            way([(8, 5), (14, 5)], "track"),            # clipped at x = 10
            way([(20, 20), (30, 30)], "secondary"),      # entirely outside: dropped
            way([(1, 9), (3, 9)], "weird_new_class"),    # unknown class appended
        ]}
        out = build_roads(raw, BOX)
        self.assertEqual(out["ways"], 3)
        self.assertEqual(len(out["roads"]), 3)
        self.assertEqual(out["classes"][out["roads"][0]["c"]], "primary")
        self.assertEqual(out["roads"][0]["b"], 1)
        self.assertEqual(out["roads"][1]["b"], 0)
        self.assertEqual(out["roads"][1]["p"][-2], 10.0)  # clipped end longitude
        self.assertIn("weird_new_class", out["classes"])
        self.assertEqual(len(out["roads"][0]["p"]) % 2, 0)

    def test_facilities_filter_by_box_and_guess_tier(self):
        raw = {"elements": [
            {"type": "node", "id": 1, "lon": 5, "lat": 5, "tags": {"name": "CHC Test", "healthcare": "centre"}},
            {"type": "node", "id": 2, "lon": 50, "lat": 5, "tags": {"name": "Far"}},
            {"type": "way", "id": 3, "center": {"lon": 2, "lat": 2}, "tags": {"name": "SubCentre, X"}},
        ]}
        rows = build_facilities(raw, BOX)["facilities"]
        self.assertEqual([r["id"] for r in rows], ["node/1", "way/3"])
        self.assertEqual(rows[0]["tier_guess"], "chc")
        self.assertEqual(rows[1]["tier_guess"], "sub_centre")

    def test_places_without_coordinates_returns_none(self):
        self.assertIsNone(build_places({"elements": [{"type": "node", "id": 1, "tags": {"place": "village"}}]}, BOX))
        self.assertEqual(build_places({"elements": []}, BOX), {"version": 1, "places": []})

    def test_places_with_coordinates(self):
        raw = {"elements": [{"type": "node", "id": 1, "lon": 3, "lat": 3, "tags": {"place": "village", "name": "V"}}]}
        self.assertEqual(build_places(raw, BOX)["places"][0]["name"], "V")

    def test_mesh_box_is_inset_by_half_a_cell(self):
        meta = {"west": 0, "east": 10, "south": 0, "north": 10, "cell_lon_deg": 2, "cell_lat_deg": 4}
        self.assertEqual(mesh_box(meta), (1, 2, 9, 8))


if __name__ == "__main__":
    unittest.main()

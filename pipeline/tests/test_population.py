"""Offline tests for the population allocation (the raster reading itself needs rasterio and real files)."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import requests

from pipeline import population
from pipeline.build_graph import build_graph
from pipeline.population import allocate_population, download_raster, local_raster, looks_like_geotiff

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


TIFF = b"II*\x00" + bytes(range(200))  # a TIFF header followed by some bytes


class FakeResp:
    """Just enough of requests.Response for download_raster."""

    def __init__(self, status=200, body=b"", headers=None):
        self.status_code, self._body = status, body
        self.headers = {"Content-Length": str(len(body))} if headers is None else headers

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_content(self, n):
        for i in range(0, len(self._body), n):
            yield self._body[i : i + n]


def serving(*replies):
    """A fake requests.get that gives the replies in order and records the headers it was asked with."""
    calls, it = [], iter(replies)

    def get(url, **kw):
        calls.append((url, kw.get("headers", {})))
        reply = next(it)
        if isinstance(reply, Exception):
            raise reply
        return reply

    get.calls = calls
    return get


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dest = Path(self._tmp.name) / "w" / "ind.tif"
        self.say = lambda *a: None

    def test_geotiff_header_check(self):
        self.assertTrue(looks_like_geotiff(b"II*\x00rest"))
        self.assertTrue(looks_like_geotiff(b"MM\x00*rest"))
        self.assertTrue(looks_like_geotiff(b"II+\x00rest"))  # BigTIFF
        self.assertFalse(looks_like_geotiff(b"<!DOCTYPE html>"))

    def test_downloads_once_and_leaves_no_partial_file(self):
        get = serving(FakeResp(200, TIFF))
        out = download_raster("https://h/x.tif", self.dest, get=get, say=self.say)
        self.assertEqual(out, self.dest)
        self.assertEqual(self.dest.read_bytes(), TIFF)
        self.assertFalse(self.dest.with_name("ind.tif.part").exists())
        # a second call reuses the file and does not touch the network
        self.assertEqual(download_raster("https://h/x.tif", self.dest, get=serving(), say=self.say), self.dest)

    def test_an_html_error_page_is_never_saved_as_the_raster(self):
        get = serving(*[FakeResp(200, b"<html>blocked</html>")] * 3)
        with self.assertRaises(RuntimeError):
            download_raster("https://h/x.tif", self.dest, get=get, say=self.say)
        self.assertFalse(self.dest.exists())
        self.assertFalse(self.dest.with_name("ind.tif.part").exists())

    def test_resumes_a_partial_file_when_the_server_allows_it(self):
        self.dest.parent.mkdir(parents=True)
        part = self.dest.with_name("ind.tif.part")
        part.write_bytes(TIFF[:50])
        get = serving(FakeResp(206, TIFF[50:]))
        download_raster("https://h/x.tif", self.dest, get=get, say=self.say)
        self.assertEqual(get.calls[0][1].get("Range"), "bytes=50-")
        self.assertEqual(self.dest.read_bytes(), TIFF)

    def test_a_server_that_ignores_the_resume_request_restarts_cleanly(self):
        self.dest.parent.mkdir(parents=True)
        self.dest.with_name("ind.tif.part").write_bytes(TIFF[:50])
        download_raster("https://h/x.tif", self.dest, get=serving(FakeResp(200, TIFF)), say=self.say)
        self.assertEqual(self.dest.read_bytes(), TIFF)  # not 50 bytes of old data glued on the front

    def test_a_cut_off_download_is_kept_for_resuming_but_not_accepted(self):
        short = FakeResp(200, TIFF[:100], headers={"Content-Length": str(len(TIFF))})
        with self.assertRaises(RuntimeError):
            download_raster("https://h/x.tif", self.dest, get=serving(short, requests.ConnectionError("reset"), requests.Timeout("slow")), say=self.say)
        self.assertFalse(self.dest.exists())
        self.assertEqual(self.dest.with_name("ind.tif.part").read_bytes(), TIFF[:100])  # kept, so the next run can resume

    def test_a_dropped_connection_is_retried(self):
        get = serving(requests.ConnectionError("reset"), FakeResp(200, TIFF))
        download_raster("https://h/x.tif", self.dest, get=get, say=self.say)
        self.assertEqual(self.dest.read_bytes(), TIFF)


class LocalRasterTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.cache = Path(self._tmp.name) / "cache"
        patcher = mock.patch.object(population, "CACHE_DIR", self.cache)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.say = lambda *a: None

    def test_a_file_path_is_used_as_given_and_a_missing_one_stops_with_a_message(self):
        f = Path(self._tmp.name) / "mine.tif"
        f.write_bytes(TIFF)
        self.assertEqual(local_raster(str(f), say=self.say), str(f))
        with self.assertRaises(SystemExit):
            local_raster(str(f) + ".nope", say=self.say)

    def test_a_url_is_downloaded_into_the_cache_and_reused(self):
        get = serving(FakeResp(200, TIFF))
        path = local_raster("https://h/a/ind.tif", get=get, say=self.say)
        self.assertEqual(Path(path), self.cache / "ind.tif")
        self.assertEqual(local_raster("https://h/a/ind.tif", get=serving(), say=self.say), path)

    def test_falls_back_to_the_mirror_when_the_first_host_fails(self):
        get = serving(*[FakeResp(403, b"no")] * 3, FakeResp(200, TIFF))
        path = local_raster("https://one/ind.tif", mirrors=["https://two/ind.tif"], get=get, say=self.say)
        self.assertEqual(Path(path).read_bytes(), TIFF)
        self.assertEqual(get.calls[-1][0], "https://two/ind.tif")

    def test_when_every_host_fails_the_message_says_what_to_do(self):
        get = serving(*[FakeResp(403, b"no")] * 6)
        with self.assertRaises(SystemExit) as cm:
            local_raster("https://one/ind.tif", mirrors=["https://two/ind.tif"], get=get, say=self.say)
        self.assertIn("run.bat population", str(cm.exception))
        self.assertIn("https://one/ind.tif", str(cm.exception))


if __name__ == "__main__":
    unittest.main()

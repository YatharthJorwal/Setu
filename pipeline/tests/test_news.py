"""Offline tests for pipeline.news on canned GDELT-shaped data."""

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

import requests

from pipeline import news
from pipeline.news import MAX_ARTICLES, build_news, classify, fetch_query, load_previous, merge_previous, parse_seen, source_name

NOW = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)


def art(title, seen="20261026T080000Z", url=None, image="https://img.example.com/a.jpg", domain="thehindu.com", lang="English"):
    return {"url": url or f"https://{domain}/{abs(hash(title))}", "title": title, "seendate": seen,
            "socialimage": image, "domain": domain, "language": lang, "sourcecountry": "India"}


class ClassifyTests(unittest.TestCase):
    def test_area_headlines_are_local_and_get_topic_tags(self):
        self.assertEqual(classify("Landslide blocks Rudraprayag highway near Guptkashi"), ["area", "roads"])
        self.assertEqual(classify("Heavy rain alert for Rudraprayag district"), ["area", "weather"])

    def test_region_headlines_need_a_topic(self):
        self.assertEqual(classify("Uttarakhand landslide: Char Dham highway reopens"), ["region", "roads"])
        self.assertIsNone(classify("Uttarakhand assembly passes new bill"))

    def test_unrelated_and_film_headlines_are_dropped(self):
        self.assertIsNone(classify("Mumbai monsoon floods local trains"))
        self.assertIsNone(classify("Kedarnath film trailer: Sushant Singh Rajput's last movie"))
        self.assertEqual(classify("Kedarnath yatra suspended after landslide on Mandakini route"), ["area", "roads"])

    def test_word_matching_does_not_fire_inside_other_words(self):
        self.assertIsNone(classify("Uttarakhand broadband policy announced"))  # 'road' inside 'broadband'

    def test_hindi_headlines(self):
        self.assertEqual(classify("रुद्रप्रयाग में भूस्खलन से केदारनाथ मार्ग बंद"), ["area", "roads"])


class BuildTests(unittest.TestCase):
    def test_keeps_relevant_newest_first_with_clean_fields(self):
        resp = {"articles": [
            art("Old but local: Rudraprayag bridge repaired", seen="20261001T000000Z"),
            art("Mumbai traffic jam"),
            art("Rudraprayag road &amp; bridge closed after landslide", seen="20261027T060000Z"),
        ]}
        out = build_news([resp], NOW)
        titles = [a["title"] for a in out["articles"]]
        self.assertEqual(titles, ["Rudraprayag road & bridge closed after landslide", "Old but local: Rudraprayag bridge repaired"])
        first = out["articles"][0]
        self.assertEqual(first["published"], "2026-10-27T06:00:00Z")
        self.assertEqual(first["source"], "The Hindu")
        self.assertEqual(first["lang"], "en")
        self.assertEqual(out["updated"], "2026-10-27T12:00:00Z")

    def test_drops_old_future_and_unusable_items(self):
        resp = {"articles": [
            art("Rudraprayag landslide ancient story", seen="20250101T000000Z"),
            art("Rudraprayag landslide from the future", seen="20271101T000000Z"),
            art("Rudraprayag landslide bad date", seen="soon"),
            art("Rudraprayag landslide no link", url="ftp://nope"),
            art("", seen="20261026T080000Z"),
        ]}
        self.assertEqual(build_news([resp], NOW)["articles"], [])

    def test_images_must_be_https_and_not_logos(self):
        resp = {"articles": [
            art("Rudraprayag landslide one", image="http://insecure.example.com/a.jpg"),
            art("Rudraprayag landslide two", image="https://cdn.example.com/site-logo.png"),
            art("Rudraprayag landslide three", image=""),
            art("Rudraprayag landslide four", image="https://cdn.example.com/photo.jpg"),
        ]}
        images = {a["title"]: a["image"] for a in build_news([resp], NOW)["articles"]}
        self.assertIsNone(images["Rudraprayag landslide one"])
        self.assertIsNone(images["Rudraprayag landslide two"])
        self.assertIsNone(images["Rudraprayag landslide three"])
        self.assertEqual(images["Rudraprayag landslide four"], "https://cdn.example.com/photo.jpg")

    def test_removes_duplicates_across_queries_and_caps_the_list(self):
        a = art("Rudraprayag landslide blocks NH107", domain="thehindu.com")
        b = art("Rudraprayag Landslide Blocks NH107!", domain="ndtv.com")  # same story, another outlet
        out = build_news([{"articles": [a]}, {"articles": [b, a]}], NOW)
        self.assertEqual(len(out["articles"]), 1)
        many = {"articles": [art(f"Rudraprayag landslide story number {i}x{i}", seen=f"202610{10 + i % 15:02d}T000000Z") for i in range(40)]}
        self.assertEqual(len(build_news([many], NOW)["articles"]), MAX_ARTICLES)

    def test_hindi_language_and_empty_inputs(self):
        hi = build_news([{"articles": [art("रुद्रप्रयाग में भूस्खलन", lang="Hindi", domain="amarujala.com")]}], NOW)
        self.assertEqual(hi["articles"][0]["lang"], "hi")
        self.assertEqual(hi["articles"][0]["source"], "Amar Ujala")
        self.assertEqual(build_news([{}, {"articles": []}], NOW)["articles"], [])


class HelperTests(unittest.TestCase):
    def test_dates_and_source_names(self):
        self.assertEqual(parse_seen("20261026T103000Z"), datetime(2026, 10, 26, 10, 30, tzinfo=timezone.utc))
        self.assertIsNone(parse_seen("nope"))
        self.assertEqual(source_name("www.thehindu.com"), "The Hindu")
        self.assertEqual(source_name("www.somelocal.in"), "somelocal.in")


class FetchTests(unittest.TestCase):
    class Resp:
        def __init__(self, status, text, data=None):
            self.status_code, self.text, self._data = status, text, data
        def json(self):
            return self._data

    def test_returns_json_retries_when_rate_limited_and_gives_up_cleanly(self):
        ok = self.Resp(200, '{"articles": []}', {"articles": []})
        slept = []
        replies = iter([self.Resp(429, "Please limit requests to one every 5 seconds"), ok])
        self.assertEqual(fetch_query("q", get=lambda *a, **k: next(replies), sleep=slept.append), {"articles": []})
        self.assertEqual(len(slept), 1)
        self.assertEqual(fetch_query("q", get=lambda *a, **k: self.Resp(200, ""), sleep=lambda s: None), {})
        with self.assertRaises(RuntimeError):
            fetch_query("q", get=lambda *a, **k: self.Resp(500, "boom"), sleep=lambda s: None)


    def test_timeouts_dropped_connections_server_errors_and_cut_off_replies_are_retried(self):
        class Cut(self.Resp):
            def json(self):
                raise ValueError("truncated")

        ok = self.Resp(200, '{"articles": []}', {"articles": []})
        replies = iter([requests.Timeout("slow"), requests.ConnectionError("reset"), self.Resp(503, "busy"), Cut(200, '{"articles": ['), ok])

        def get(*a, **k):
            r = next(replies)
            if isinstance(r, Exception):
                raise r
            return r

        with mock.patch.object(news, "ATTEMPTS", 5):  # four failures, then the good reply
            self.assertEqual(fetch_query("q", get=get, sleep=lambda s: None), {"articles": []})

    def test_rate_limits_are_waited_out_for_longer_each_time(self):
        slept = []
        replies = iter([self.Resp(429, "limit"), self.Resp(429, "limit"), self.Resp(200, '{"articles": []}', {"articles": []})])
        fetch_query("q", get=lambda *a, **k: next(replies), sleep=slept.append)
        self.assertEqual(slept, [news.RATE_LIMIT_WAIT_S, news.RATE_LIMIT_WAIT_S * 2])
        self.assertGreaterEqual(news.RATE_LIMIT_WAIT_S, 30)

    def test_giving_up_says_why(self):
        with self.assertRaises(RuntimeError) as cm:
            fetch_query("q", get=lambda *a, **k: (_ for _ in ()).throw(requests.Timeout("slow")), sleep=lambda s: None)
        self.assertIn("Timeout", str(cm.exception))
        with self.assertRaises(RuntimeError) as cm:
            fetch_query("q", get=lambda *a, **k: self.Resp(200, "The specified phrase is too short."), sleep=lambda s: None)
        self.assertIn("too short", str(cm.exception))  # a query GDELT rejects is reported, not just "HTTP 200"

    def test_a_query_gdelt_rejects_is_not_retried(self):
        calls = []

        def get(*a, **k):
            calls.append(1)
            return self.Resp(400, "bad query")

        with self.assertRaises(RuntimeError):
            fetch_query("q", get=get, sleep=lambda s: None)
        self.assertEqual(len(calls), 1)


def item(title, published="2026-10-26T08:00:00Z", url=None):
    return {"title": title, "url": url or f"https://x.example/{abs(hash(title))}", "image": None, "source": "x", "published": published, "lang": "en", "tags": ["area"]}


class PreviousTests(unittest.TestCase):
    def test_earlier_headlines_are_kept_when_still_recent_and_not_duplicated(self):
        fresh = {"version": 1, "updated": "x", "source": "s", "articles": [item("Rudraprayag road reopens", "2026-10-27T09:00:00Z")]}
        previous = [
            item("Rudraprayag road reopens", "2026-10-27T09:00:00Z", url=fresh["articles"][0]["url"]),  # same story: not doubled
            item("Kedarnath yatra update", "2026-10-20T00:00:00Z"),
            item("Too old to keep", "2026-08-01T00:00:00Z"),
            {"title": "no link", "published": "2026-10-25T00:00:00Z"},  # unusable
            item("Bad date", "not-a-date"),
        ]
        out = merge_previous(fresh, [a for a in previous if a.get("url")], NOW)
        self.assertEqual([a["title"] for a in out["articles"]], ["Rudraprayag road reopens", "Kedarnath yatra update"])
        self.assertEqual(out["updated"], "x")  # the rest of the file is untouched

    def test_load_previous_survives_missing_and_broken_files(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "news.json"
            self.assertEqual(load_previous(path), [])
            path.write_text("{not json", encoding="utf-8")
            self.assertEqual(load_previous(path), [])
            path.write_text(json.dumps({"articles": [item("A"), {"title": "no url"}, "junk"]}), encoding="utf-8")
            self.assertEqual([a["title"] for a in load_previous(path)], ["A"])


class MainTests(unittest.TestCase):
    """The whole script with the network replaced: two of three queries fail, as in the real log."""

    def run_main(self, folder, answers):
        with mock.patch.object(news, "PROCESSED", Path(folder)), mock.patch.object(news.time, "sleep", lambda s: None), \
                mock.patch.object(news, "QUERIES", ["a", "b", "c"]), mock.patch.object(news, "fetch_query", side_effect=answers):
            news.main()
        return json.loads((Path(folder) / "news.json").read_text(encoding="utf-8"))

    def test_failed_queries_are_retried_in_a_second_pass_and_can_recover(self):
        good = {"articles": [art("Landslide blocks Rudraprayag highway", seen="20261027T080000Z")]}
        # pass 1: ok, fail, fail. pass 2 (only the two failures): ok, ok
        with tempfile.TemporaryDirectory() as d, mock.patch.object(news, "datetime", wraps=datetime) as dt:
            dt.now.return_value = NOW
            out = self.run_main(d, [good, RuntimeError("x"), RuntimeError("y"), {"articles": []}, {"articles": []}])
        self.assertNotIn("error", out)
        self.assertEqual(len(out["articles"]), 1)

    def test_ctrl_c_before_anything_arrives_leaves_the_file_exactly_as_it_was(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "news.json"
            path.write_text('{"articles": ["untouched"]}', encoding="utf-8")
            with mock.patch.object(news, "PROCESSED", Path(d)), mock.patch.object(news, "fetch_query", side_effect=KeyboardInterrupt):
                news.main()
            self.assertEqual(path.read_text(encoding="utf-8"), '{"articles": ["untouched"]}')

    def test_ctrl_c_after_some_headlines_arrived_saves_them_with_the_old_ones(self):
        good = {"articles": [art("Landslide blocks Rudraprayag highway", seen="20261027T080000Z")]}
        with tempfile.TemporaryDirectory() as d, mock.patch.object(news, "datetime", wraps=datetime) as dt:
            dt.now.return_value = NOW
            (Path(d) / "news.json").write_text(json.dumps({"articles": [item("Older Kedarnath yatra headline", "2026-10-20T00:00:00Z")]}), encoding="utf-8")
            out = self.run_main(d, [good, KeyboardInterrupt()])
        self.assertEqual({a["title"] for a in out["articles"]}, {"Landslide blocks Rudraprayag highway", "Older Kedarnath yatra headline"})
        self.assertIn("stopped", out["error"])

    def test_a_partly_failed_run_keeps_the_headlines_already_on_file_and_says_what_failed(self):
        good = {"articles": [art("Landslide blocks Rudraprayag highway", seen="20261027T080000Z")]}
        with tempfile.TemporaryDirectory() as d, mock.patch.object(news, "datetime", wraps=datetime) as dt:
            dt.now.return_value = NOW
            (Path(d) / "news.json").write_text(json.dumps({"articles": [item("Older Kedarnath yatra headline", "2026-10-20T00:00:00Z")]}), encoding="utf-8")
            boom = RuntimeError("GDELT did not return usable data (Timeout, 4 tries)")
            out = self.run_main(d, [good, boom, boom, boom, boom])
        self.assertEqual({a["title"] for a in out["articles"]}, {"Landslide blocks Rudraprayag highway", "Older Kedarnath yatra headline"})
        self.assertIn("query 2", out["error"])
        self.assertIn("Timeout", out["error"])


if __name__ == "__main__":
    unittest.main()

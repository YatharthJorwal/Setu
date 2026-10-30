"""Offline tests for pipeline.news on canned GDELT-shaped data."""

import unittest
from datetime import datetime, timezone

from pipeline.news import MAX_ARTICLES, build_news, classify, fetch_query, parse_seen, source_name

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


if __name__ == "__main__":
    unittest.main()

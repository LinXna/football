import unittest

from football_live import resolved_trends, timeline_trends


class TimelineTrendTest(unittest.TestCase):
    def event(self):
        return {
            "id": "1",
            "homeTeam": {"name": "主队"},
            "awayTeam": {"name": "客队"},
            "_live_text": {
                "entries": [
                    "21'",
                    "- 第3个角球 - (主队)",
                    "18'- 客队单刀射门，主队门将扑出",
                    "10'",
                    "- 第1个进球！球进啦！主队取得领先！",
                ]
            },
            "_recent_trends": {
                "last_5_minutes": {"available": False, "reason": "no_baseline"},
                "last_15_minutes": {"available": False, "reason": "no_baseline"},
            },
        }

    def test_timeline_is_available_on_first_export(self):
        trends = timeline_trends(self.event(), 21)
        five = trends["last_5_minutes"]
        fifteen = trends["last_15_minutes"]
        self.assertTrue(five["available"])
        self.assertEqual(five["source"], "leisu_text_timeline")
        self.assertEqual(five["corners"]["home"], 1)
        self.assertEqual(five["shots"]["away"], 1)
        self.assertEqual(five["shots_on_target"]["away"], 1)
        self.assertEqual(fifteen["goals"]["home"], 1)

    def test_resolver_replaces_no_baseline(self):
        trends = resolved_trends(self.event(), {}, [], 1000, 21)
        self.assertTrue(trends["last_5_minutes"]["available"])
        self.assertTrue(trends["last_15_minutes"]["available"])


if __name__ == "__main__":
    unittest.main()

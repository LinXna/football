import unittest

from football_live import MarketMatch, contextual_match_score, is_excluded_electronic_match


class EventFilterTests(unittest.TestCase):
    def test_dream_duel_is_excluded(self):
        self.assertTrue(is_excluded_electronic_match("梦幻对垒", "阿森纳", "切尔西"))

    def test_vs_hyphen_electronic_is_excluded(self):
        self.assertTrue(is_excluded_electronic_match("VS-电子足球", "A", "B"))
        self.assertTrue(is_excluded_electronic_match("", "VS-曼城", "利物浦"))

    def test_real_match_is_kept(self):
        self.assertFalse(is_excluded_electronic_match("英超", "阿森纳", "切尔西"))

    def test_short_format_electronic_is_excluded(self):
        self.assertTrue(is_excluded_electronic_match("瓦尔哈拉杯 2026 (8分钟)", "河床", "弗拉门戈"))
        self.assertTrue(is_excluded_electronic_match("开云电竞", "A", "B"))

    def test_exact_alias_pair_survives_one_goal_feed_delay(self):
        market = MarketMatch(
            source_file="test.json",
            source_match_id="1",
            league="测试",
            home="主队",
            away="客队",
            commence_time=None,
            captured_at=None,
            markets=[],
            home_score=0,
            away_score=0,
            clock="51:47",
        )
        event = {
            "_minute": 52,
            "homeScore": {"current": 0},
            "awayScore": {"current": 1},
        }
        self.assertGreaterEqual(contextual_match_score(1.0, market, event), 0.72)


if __name__ == "__main__":
    unittest.main()

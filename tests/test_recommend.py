import unittest
from datetime import datetime, timezone

from recommend_live import asian_line, assess, build_parlay
from review_recommendations import settle_spread, settle_total


def candidate(name: str, odds: float = 1.8) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    companies = [
        {
            "company": f"book-{index}",
            "total_goals": {
                "opening": {"line": "3.5"},
                "current": {"line": "3.5"},
            },
        }
        for index in range(6)
    ]
    return {
        "match": {
            "home": f"{name} home",
            "away": f"{name} away",
            "league": "Test",
            "minute": 60,
            "score": {"home": 0, "away": 0},
            "score_source": "ybty_market",
            "state_source": "ybty",
        },
        "market_source": {
            "captured_at": now,
            "league": "Test",
            "home": f"{name} home",
            "away": f"{name} away",
            "markets": [
                {
                    "line_index": 0,
                    "market": "full_total",
                    "options": [
                        {
                            "selection": "3.5",
                            "odds": "1.90",
                            "suspended": False,
                        },
                        {
                            "selection": "3.5",
                            "odds": str(odds),
                            "suspended": False,
                        },
                    ],
                }
            ],
        },
        "live_statistics": {
            "shots": {"home": 4, "away": 4},
            "shots_on_target": {"home": 1, "away": 1},
        },
        "recent_trends": {
            "last_5_minutes": {
                "available": True,
                "shots": {"home": 0, "away": 0},
                "shots_on_target": {"home": 0, "away": 0},
            },
            "last_15_minutes": {
                "available": True,
                "shots": {"home": 1, "away": 1},
                "shots_on_target": {"home": 0, "away": 0},
            },
        },
        "reference_odds": {
            "detail": {
                "normalized": {
                    "companies": companies,
                }
            }
        },
    }


class RecommendationTest(unittest.TestCase):
    def test_null_reference_odds_detail_is_supported(self) -> None:
        item = candidate("null-detail")
        item["reference_odds"] = {
            "detail": None,
            "current": {"total_goals": {"line": "3.5"}},
        }
        decision = assess(item, datetime.now(timezone.utc))
        self.assertIn(decision["status"], {"WATCH", "PASS"})

    def test_quarter_line_parser(self) -> None:
        self.assertEqual(asian_line("1.5/2"), 1.75)
        self.assertEqual(asian_line("-0/0.5"), -0.25)
        self.assertEqual(asian_line("2/2.5"), 2.25)

    def test_single_and_five_x_parlay(self) -> None:
        now = datetime.now(timezone.utc)
        decisions = [assess(candidate(str(index)), now) for index in range(3)]
        self.assertTrue(all(item["status"] == "WATCH" for item in decisions))
        self.assertTrue(all(item["recommendation"]["market"] == "全场小球" for item in decisions))
        parlay = build_parlay(decisions)
        self.assertIsNotNone(parlay)
        self.assertEqual(len(parlay["legs"]), 3)
        self.assertGreaterEqual(parlay["combined_odds"], 5.0)

    def test_live_total_is_compared_as_full_match_total(self) -> None:
        item = candidate("full-total")
        item["match"]["score"] = {"home": 2, "away": 1}
        item["market_source"]["markets"][0]["options"][0]["selection"] = "1.5/2"
        item["market_source"]["markets"][0]["options"][1]["selection"] = "1.5/2"
        for company in item["reference_odds"]["detail"]["normalized"]["companies"]:
            company["total_goals"]["current"]["line"] = "1.75"
        decision = assess(item, datetime.now(timezone.utc))
        self.assertEqual(decision["status"], "WATCH")
        self.assertEqual(decision["recommendation"]["market"], "全场大球")
        self.assertEqual(decision["recommendation"]["basis"], "full_match_total")

    def test_halftime_stale_snapshot_does_not_create_fake_under_edge(self) -> None:
        item = candidate("halftime")
        item["match"]["minute"] = 45
        item["match"]["score"] = {"home": 0, "away": 2}
        item["market_source"]["markets"][0]["options"][0]["selection"] = "3.5"
        item["market_source"]["markets"][0]["options"][1]["selection"] = "3.5"
        item["recent_trends"] = {
            "last_5_minutes": {
                "available": False,
                "reason": "insufficient_active_play",
            },
            "last_15_minutes": {
                "available": False,
                "reason": "insufficient_active_play",
            },
        }
        decision = assess(item, datetime.now(timezone.utc))
        self.assertNotEqual(
            (decision.get("recommendation") or {}).get("market"),
            "全场小球",
        )

    def test_spread_is_evaluated_when_total_is_suspended(self) -> None:
        item = candidate("spread")
        for option in item["market_source"]["markets"][0]["options"]:
            option["suspended"] = True
        item["market_source"]["markets"].append(
            {
                "line_index": 0,
                "market": "full_spread",
                "options": [
                    {"selection": "-0.5", "odds": "1.90", "suspended": False},
                    {"selection": "+0.5", "odds": "1.90", "suspended": False},
                ],
            }
        )
        item["live_statistics"] = {
            "shots": {"home": 14, "away": 3},
            "shots_on_target": {"home": 6, "away": 1},
            "dangerous_attacks": {"home": 60, "away": 20},
        }
        item["recent_trends"] = {
            "last_5_minutes": {
                "available": True,
                "shots": {"home": 3, "away": 0},
                "shots_on_target": {"home": 1, "away": 0},
                "dangerous_attacks": {"home": 6, "away": 0},
            },
            "last_15_minutes": {
                "available": True,
                "shots": {"home": 5, "away": 1},
                "shots_on_target": {"home": 2, "away": 0},
                "dangerous_attacks": {"home": 10, "away": 2},
            },
        }
        decision = assess(item, datetime.now(timezone.utc))
        self.assertEqual(decision["status"], "WATCH")
        self.assertEqual(decision["recommendation"]["market"], "主队后续时段让球")
        self.assertEqual(decision["recommendation"]["scope"], "remaining_time")

    def test_early_quiet_match_does_not_trigger_under(self) -> None:
        item = candidate("early")
        item["match"]["minute"] = 22
        decision = assess(item, datetime.now(timezone.utc))
        self.assertNotEqual(
            (decision.get("recommendation") or {}).get("market"),
            "全场小球",
        )

    def test_missing_zero_statistics_are_rejected(self) -> None:
        item = candidate("missing")
        item["live_statistics"] = {
            "shots": {"home": 0, "away": 0},
            "shots_on_target": {"home": 0, "away": 0},
        }
        decision = assess(item, datetime.now(timezone.utc))
        self.assertEqual(decision["status"], "PASS")
        self.assertTrue(any("疑似数据缺失" in value for value in decision["stop_conditions"]))

    def test_incomplete_trends_are_penalized_not_hard_blocked(self) -> None:
        item = candidate("trend")
        item["recent_trends"]["last_5_minutes"]["available"] = False
        decision = assess(item, datetime.now(timezone.utc))
        self.assertTrue(any("趋势未完全形成" in value for value in decision["risks"]))
        self.assertNotEqual(
            (decision.get("recommendation") or {}).get("market"),
            "全场小球",
        )

    def test_quarter_total_and_spread_settlement(self) -> None:
        self.assertEqual(settle_total("全场小球", 2.25, 2), "half_win")
        self.assertEqual(settle_total("全场大球", 2.75, 3), "half_win")
        self.assertEqual(settle_spread("主队让球", -0.75, 1, 0), "half_win")
        self.assertEqual(settle_spread("主队让球", -1.25, 1, 0), "half_loss")


if __name__ == "__main__":
    unittest.main()

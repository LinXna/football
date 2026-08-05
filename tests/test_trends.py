import unittest

from football_live import calculate_trends


class TrendValidityTest(unittest.TestCase):
    def test_halftime_wall_clock_does_not_count_as_active_play(self):
        history = [
            {
                "timestamp": 1000,
                "event_id": "e1",
                "minute": 45,
                "statistics": {
                    "shots": {"home": 2, "away": 3},
                    "shots_on_target": {"home": 2, "away": 2},
                },
            }
        ]
        trends = calculate_trends(
            "e1",
            {
                "shots": {"home": 2, "away": 3},
                "shots_on_target": {"home": 2, "away": 2},
            },
            history,
            now=1900,
            current_minute=45,
        )
        self.assertFalse(trends["last_5_minutes"]["available"])
        self.assertEqual(
            trends["last_5_minutes"]["reason"], "insufficient_active_play"
        )

    def test_regressed_statistics_are_invalid(self):
        history = [
            {
                "timestamp": 1000,
                "event_id": "e1",
                "minute": 30,
                "statistics": {"shots": {"home": 8, "away": 5}},
            }
        ]
        trends = calculate_trends(
            "e1",
            {"shots": {"home": 6, "away": 7}},
            history,
            now=1900,
            current_minute=45,
        )
        self.assertFalse(trends["last_15_minutes"]["available"])
        self.assertEqual(
            trends["last_15_minutes"]["reason"], "statistics_regressed"
        )


if __name__ == "__main__":
    unittest.main()

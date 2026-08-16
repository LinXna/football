import unittest

from scripts.python.interface_features import calculate_live_efficiency, extract_interface_features


class InterfaceFeatureTest(unittest.TestCase):
    def test_all_formal_feature_groups_affect_prediction_features(self):
        candidate = {
            "recent_trends": {"historical_analysis": {
                "analysis_match_context": {"record": {"match_id": 1}},
                "recent_matches": {
                    "home": [{"result": "胜", "goals": 3}],
                    "away": [{"result": "负", "goals": 1}],
                },
                "head_to_head": [{"home_scores": [2], "away_scores": [1]}],
                "league_standings": {
                    "home_team": {"total": {"total": 10, "points": 24}},
                    "away_team": {"total": {"total": 10, "points": 8}},
                },
                "goal_distribution": {
                    "home": {"all": {"scored": [[2, 20, 61, 75]]}},
                    "away": {"all": {"scored": [[1, 10, 76, 90]]}},
                },
                "trend_summary": {
                    "home": {"table": [{"big_ratio": "60%"}]},
                    "away": {"table": [{"big_ratio": "40%"}]},
                },
                "future_schedule": {"home": [{"match_id": 2}]},
            }},
            "lineups": {"available": True, "raw": {
                "home_injuries": [{"name": "伤员"}], "away_injuries": []
            }},
        }
        features = extract_interface_features(candidate)
        self.assertEqual(features["calibration_status"], "descriptive_only_not_scored")
        self.assertGreater(features["descriptive"]["recent_goal_average"], 0)
        self.assertGreater(features["descriptive"]["standing_points_per_game"]["home"], features["descriptive"]["standing_points_per_game"]["away"])
        self.assertTrue(all(features["coverage"].values()))
        self.assertTrue(any("未来赛程" in risk for risk in features["risks"]))
        self.assertTrue(any("伤停" in risk for risk in features["risks"]))

    def test_absent_interface_data_is_neutral(self):
        features = extract_interface_features({})
        self.assertEqual(features["calibration_status"], "descriptive_only_not_scored")
        self.assertIsNone(features["descriptive"]["recent_goal_average"])

    def test_live_efficiency_and_goalkeeper_save_rates_use_valid_denominators(self):
        metrics = calculate_live_efficiency(
            {
                "shots": {"home": 10, "away": 8},
                "shots_on_target": {"home": 5, "away": 4},
                "shots_off_target": {"home": 5, "away": 4},
            },
            {"home": 2, "away": 1},
        )
        self.assertEqual(metrics["teams"]["home"]["shot_accuracy"], 0.5)
        self.assertEqual(metrics["teams"]["home"]["goal_conversion_per_recorded_shot"], 0.2)
        self.assertEqual(metrics["teams"]["home"]["goal_conversion_per_shot_on_target"], 0.4)
        self.assertEqual(metrics["goalkeepers"]["away"]["saves"], 3)
        self.assertEqual(metrics["goalkeepers"]["away"]["save_rate"], 0.6)

    def test_live_efficiency_rejects_goal_above_shots_on_target(self):
        metrics = calculate_live_efficiency(
            {"shots_on_target": {"home": 1, "away": 0}, "shots_off_target": {"home": 2, "away": 1}},
            {"home": 2, "away": 0},
        )
        self.assertIsNone(metrics["teams"]["home"]["goal_conversion_per_shot_on_target"])
        self.assertFalse(metrics["goalkeepers"]["away"]["data_consistent"])
        self.assertTrue(any("不同步" in warning for warning in metrics["warnings"]))


if __name__ == "__main__":
    unittest.main()

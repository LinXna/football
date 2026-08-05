import unittest

from football_live import repair_leisu_event


class LeisuScoreRepairTest(unittest.TestCase):
    def test_null_odds_detail_does_not_break_repair(self) -> None:
        event = {
            "_provider": "leisu",
            "raw_text": "测试联赛 20' 主队 0 0 客队",
            "homeTeam": {"name": "主队"},
            "awayTeam": {"name": "客队"},
            "homeScore": {"current": 0},
            "awayScore": {"current": 0},
            "status": {"type": "inprogress"},
            "odds": {"detail": None},
        }
        repaired = repair_leisu_event(event)
        self.assertIsNone(repaired["odds"]["detail"])

    def test_canvas_score_wins_over_misleading_row_text_numbers(self) -> None:
        event = {
            "_provider": "leisu",
            "raw_text": "美青杯 63' 1 萨尔瓦多U20 （中） 美国U20 1 数据 走势",
            "_row_canvas_text": "10:00 0-2 0-1 1-2 0.900 -0.75 0.900",
            "homeTeam": {"name": "萨尔瓦多U20 （中）"},
            "awayTeam": {"name": "美国U20"},
            "homeScore": {"current": 1},
            "awayScore": {"current": 1},
            "status": {"type": "inprogress"},
        }
        repaired = repair_leisu_event(event)
        self.assertEqual(repaired["homeScore"]["current"], 0)
        self.assertEqual(repaired["awayScore"]["current"], 2)
        self.assertEqual(repaired["_score_source"], "score_canvas")

    def test_first_canvas_score_is_full_time_score(self) -> None:
        event = {
            "_provider": "leisu",
            "raw_text": "中美洲杯 58' 迪利安格恩 阿马多尔广场 数据 走势",
            "_row_canvas_text": "10:00 3-0 3-0 2-6 0.970 0.25 0.820",
            "homeTeam": {"name": "迪利安格恩"},
            "awayTeam": {"name": "阿马多尔广场"},
            "homeScore": {"current": 0},
            "awayScore": {"current": 1},
            "status": {"type": "inprogress"},
        }
        repaired = repair_leisu_event(event)
        self.assertEqual(repaired["homeScore"]["current"], 3)
        self.assertEqual(repaired["awayScore"]["current"], 0)

    def test_named_text_live_goals_replace_stale_list_score(self) -> None:
        event = {
            "_provider": "leisu",
            "raw_text": "中美洲杯 32' CD奥林匹亚 0 0 拉科鲁尼亚米斯科 数据",
            "homeTeam": {"name": "CD奥林匹亚"},
            "awayTeam": {"name": "拉科鲁尼亚米斯科"},
            "status": {"type": "inprogress"},
            "_live_text": {
                "entries": [
                    "27'",
                    "- 第1个进球！球进啦！CD奥林匹亚取得本场比赛领先！",
                ]
            },
        }
        repaired = repair_leisu_event(event)
        self.assertEqual(repaired["homeScore"]["current"], 1)
        self.assertEqual(repaired["awayScore"]["current"], 0)
        self.assertTrue(repaired["_score_validation"]["corrected"])


if __name__ == "__main__":
    unittest.main()

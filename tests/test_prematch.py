import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PrematchPipelineTest(unittest.TestCase):
    def test_notstarted_events_are_matched_and_queued(self):
        with tempfile.TemporaryDirectory() as folder:
            temp = Path(folder)
            market = {
                "captured_at": "2026-07-28T01:00:00Z",
                "matches": [
                    {
                        "source_match_id": "m1",
                        "league": "Test League",
                        "home": "Alpha",
                        "away": "Beta",
                        "captured_at": "2026-07-28T01:00:00Z",
                        "clock": "30分钟后开赛",
                        "markets": [
                            {
                                "line_index": 0,
                                "market": "full_total",
                                "options": [
                                    {"selection": "2.5", "odds": "1.90", "suspended": False},
                                    {"selection": "2.5", "odds": "1.90", "suspended": False},
                                ],
                            }
                        ],
                    }
                ],
            }
            fixture = {
                "events": [
                    {
                        "id": "e1",
                        "_provider": "leisu",
                        "tournament": {"name": "Test League"},
                        "homeTeam": {"name": "Alpha"},
                        "awayTeam": {"name": "Beta"},
                        "status": {"type": "notstarted"},
                        "homeScore": {"current": 0},
                        "awayScore": {"current": 0},
                        "_weather": {"available": True, "text": ["晴", "24°C"]},
                        "_lineups": {
                            "available": False,
                            "status": "squad_only_no_confirmed_match_lineup",
                            "home": {"players": ["A1"]},
                            "away": {"players": ["B1"]},
                        },
                        "odds": {
                            "current": {
                                "total_goals": {
                                    "over": "0.90",
                                    "line": "2.5",
                                    "under": "0.90",
                                }
                            }
                        },
                    }
                ]
            }
            market_file = temp / "market.json"
            fixture_file = temp / "leisu.json"
            candidate_file = temp / "candidate.json"
            decision_file = temp / "decision.json"
            market_file.write_text(json.dumps(market), encoding="utf-8")
            fixture_file.write_text(json.dumps(fixture), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "football_live.py"),
                    str(market_file),
                    "--live-fixture",
                    str(fixture_file),
                    "--mode",
                    "prematch",
                    "--output",
                    str(candidate_file),
                ],
                check=True,
            )
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "recommend_prematch.py"),
                    str(candidate_file),
                    "--output",
                    str(decision_file),
                ],
                check=True,
            )
            candidates = json.loads(candidate_file.read_text(encoding="utf-8"))
            decisions = json.loads(decision_file.read_text(encoding="utf-8"))
            self.assertEqual(candidates["summary"]["prematch_events"], 1)
            self.assertEqual(candidates["summary"]["matched"], 1)
            self.assertEqual(decisions["summary"]["research"], 1)
            self.assertIsNone(decisions["single_best"])
            self.assertEqual(decisions["decisions"][0]["ybty_match"], "Alpha vs Beta")
            self.assertTrue(decisions["decisions"][0]["weather"]["available"])
            self.assertEqual(
                decisions["decisions"][0]["lineups"]["home"]["players"], ["A1"]
            )
            self.assertEqual(
                decisions["decisions"][0]["ybty_start_time_beijing"],
                "2026-07-28 09:30",
            )


if __name__ == "__main__":
    unittest.main()

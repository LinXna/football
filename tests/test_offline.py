import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from football_live import MarketMatch, authoritative_match_state, derive_commence_time


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    market = [{
        "match_id": "local-1",
        "league": "Test League",
        "teams": {"home": "Atletico Goianiense", "away": "Operario PR"},
        "commence_time_utc": "2026-07-28T00:00:00Z",
        "clock": "45:00",
        "home_score": "1",
        "away_score": "0",
        "market_odds": {"demo": {"totals": [{"name": "Over", "point": 2.5, "price": 1.9}]}}
    }]
    live = {"events": [{
        "id": 123,
        "startTimestamp": 1785196800,
        "tournament": {"name": "Test League"},
        "homeTeam": {"name": "Atlético Goianiense"},
        "awayTeam": {"name": "Operário-PR"},
        "status": {"type": "halftime"},
        "_minute": 58,
        "homeScore": {"current": 2},
        "awayScore": {"current": 2},
        "_weather": {"available": True, "text": ["晴", "25°C"]},
        "_lineups": {
            "available": True,
            "home": {"starters": [{"name": "Home One"}], "substitutes": []},
            "away": {"starters": [{"name": "Away One"}], "substitutes": []},
        },
        "_live_text": {"available": True, "entries": ["40' 主队进球"]},
        "time": {}
    }]}
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        market_path, live_path, output_path = folder / "market.json", folder / "live.json", folder / "out.json"
        market_path.write_text(json.dumps(market), encoding="utf-8")
        live_path.write_text(json.dumps(live), encoding="utf-8")
        result = subprocess.run(
            [
                sys.executable, str(ROOT / "football_live.py"), str(market_path),
                "--live-fixture", str(live_path), "--aliases", str(ROOT / "team_aliases.json"),
                "--output", str(output_path), "--history", str(folder / "history.json"),
            ],
            check=True, capture_output=True, text=True,
        )
        output = json.loads(output_path.read_text(encoding="utf-8"))
        assert output["summary"]["matched"] == 1, result.stdout
        assert output["candidates"][0]["match_confidence"] >= 0.8
        assert output["candidates"][0]["match"]["minute"] == 45
        assert output["candidates"][0]["match"]["score"] == {"home": 1, "away": 0}
        assert output["candidates"][0]["match"]["score_source"] == "ybty_market"
        assert output["candidates"][0]["match"]["provider_state"]["minute"] == 58
        assert output["candidates"][0]["match"]["provider_state"]["score"] == {
            "home": 2,
            "away": 2,
        }
        assert output["candidates"][0]["weather"]["available"]
        assert output["candidates"][0]["lineups"]["available"]
        assert output["candidates"][0]["live_text"]["available"]
        text_market = folder / "market.txt"
        text_market.write_text(
            "测试联赛\nAtlético Goianiense vs Operário-PR\n大小球 2.5 大 1.90\n",
            encoding="utf-8",
        )
        text_output = folder / "text-out.json"
        subprocess.run(
            [
                sys.executable, str(ROOT / "football_live.py"), str(text_market),
                "--live-fixture", str(live_path), "--aliases", str(ROOT / "team_aliases.json"),
                "--output", str(text_output), "--history", str(folder / "text-history.json"),
            ],
            check=True, capture_output=True, text=True,
        )
        parsed = json.loads(text_output.read_text(encoding="utf-8"))
        assert parsed["summary"]["matched"] == 1
        assert "大小球 2.5" in parsed["candidates"][0]["market_source"]["markets"]["raw_text"]
        print("offline integration test: PASS")


class OfflineIntegrationTest(unittest.TestCase):
    def test_reliable_leisu_score_is_used_when_ybty_score_is_missing(self):
        market = MarketMatch(
            source_file="test.json",
            source_match_id="1",
            league="Test",
            home="Alpha",
            away="Beta",
            commence_time=None,
            captured_at=None,
            markets={},
            clock="35:00",
        )
        event = {
            "_provider": "leisu",
            "_score_source": "score_canvas",
            "_minute": 36,
            "homeScore": {"current": 2},
            "awayScore": {"current": 1},
        }
        state = authoritative_match_state(market, event, "live")
        self.assertEqual(state["score"], {"home": 2, "away": 1})
        self.assertEqual(state["score_source"], "score_canvas")
        self.assertEqual(state["state_source"]["score"], "provider")
        self.assertEqual(state["minute"], 35)

    def test_unreliable_leisu_row_score_is_not_used_as_fallback(self):
        market = MarketMatch(
            source_file="test.json",
            source_match_id="1",
            league="Test",
            home="Alpha",
            away="Beta",
            commence_time=None,
            captured_at=None,
            markets={},
            clock="35:00",
        )
        event = {
            "_provider": "leisu",
            "_score_source": "row_text_fallback",
            "homeScore": {"current": 2},
            "awayScore": {"current": 1},
        }
        state = authoritative_match_state(market, event, "live")
        self.assertEqual(state["score"], {"home": None, "away": None})
        self.assertIsNone(state["score_source"])

    def test_ybty_countdown_is_converted_to_kickoff_time(self):
        self.assertEqual(
            derive_commence_time(
                None,
                "1小时26分钟后开赛",
                "2026-07-29T20:03:30Z",
            ),
            "2026-07-29T21:29:30Z",
        )

    def test_pipeline(self) -> None:
        main()


if __name__ == "__main__":
    unittest.main()

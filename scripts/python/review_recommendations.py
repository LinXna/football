#!/usr/bin/env python3
"""Review recorded recommendations against a later Leisu export."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
try:
    from scripts.python.json_store_lock import atomic_write_json, locked_json_operation
except ModuleNotFoundError:
    from json_store_lock import atomic_write_json, locked_json_operation
from typing import Any


OVER_MARKETS = {"全场大球", "鍏ㄥ満澶х悆"}
UNDER_MARKETS = {"全场小球", "鍏ㄥ満灏忕悆"}
HOME_SPREAD_MARKETS = {"主队让球", "主队后续时段让球", "涓婚槦璁╃悆", "涓婚槦鍚庣画鏃舵璁╃悆"}
AWAY_SPREAD_MARKETS = {"客队让球", "客队后续时段让球", "瀹㈤槦璁╃悆", "瀹㈤槦鍚庣画鏃舵璁╃悆"}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    value = value.replace("（中）", "").replace("(中)", "")
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", value)


def final_event(event: dict[str, Any]) -> bool:
    raw = str(event.get("raw_text") or "")
    return (
        event.get("status", {}).get("type") in {"finished", "ended"}
        or "完" in raw
        or (event.get("_minute") or 0) >= 90
    )


def split_asian_line(line: float) -> list[float]:
    """Expand quarter lines into the two independently settled half stakes."""
    quarter = round(line * 4)
    if quarter % 2 == 0:
        return [line]
    return [(quarter - 1) / 4, (quarter + 1) / 4]


def combine_half_outcomes(outcomes: list[str]) -> str:
    if len(outcomes) == 1 or outcomes[0] == outcomes[-1]:
        return outcomes[0]
    values = {"win": 1, "push": 0, "loss": -1}
    total = sum(values[item] for item in outcomes)
    if total == 1:
        return "half_win"
    if total == -1:
        return "half_loss"
    return "push"


def settle_total(market: str, line: float, goals: int) -> str:
    is_over = market in OVER_MARKETS
    outcomes = []
    for component in split_asian_line(line):
        if goals == component:
            outcomes.append("push")
        elif is_over:
            outcomes.append("win" if goals > component else "loss")
        else:
            outcomes.append("win" if goals < component else "loss")
    return combine_half_outcomes(outcomes)


def settle_spread(market: str, line: float, home: int, away: int) -> str:
    margin = home - away if market in HOME_SPREAD_MARKETS else away - home
    outcomes = []
    for component in split_asian_line(line):
        adjusted = margin + component
        outcomes.append("win" if adjusted > 0 else "push" if adjusted == 0 else "loss")
    return combine_half_outcomes(outcomes)


def settle(record: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
    start = record.get("score_at_recommendation", {})
    final_home = event.get("homeScore", {}).get("current", 0)
    final_away = event.get("awayScore", {}).get("current", 0)
    start_home = start.get("home")
    start_away = start.get("away")
    added_home = final_home - (start_home or 0)
    added_away = final_away - (start_away or 0)
    added_goals = added_home + added_away

    recommendation = record["recommendation"]
    line = recommendation.get("line")
    market = recommendation.get("market")
    basis = recommendation.get("basis")
    score_verified = record.get("score_verified")
    if score_verified is None:
        score_verified = record.get("match_snapshot", {}).get("score_verified")

    uses_live_baseline = basis in {"remaining_goals", "remaining_period_dominance"}
    if uses_live_baseline and (
        not score_verified
        or not isinstance(start_home, (int, float))
        or not isinstance(start_away, (int, float))
        or added_home < 0
        or added_away < 0
    ):
        return {
            "status": "reviewed",
            "final_score": {"home": final_home, "away": final_away},
            "outcome": "invalid_data",
            "reason": "推荐时比分未经可靠校验，不能结算剩余时段盘口",
        }

    outcome = "manual_review"
    if isinstance(line, (int, float)) and market in OVER_MARKETS | UNDER_MARKETS:
        goals = added_goals if basis == "remaining_goals" else final_home + final_away
        outcome = settle_total(market, float(line), goals)
    elif isinstance(line, (int, float)) and market in HOME_SPREAD_MARKETS | AWAY_SPREAD_MARKETS:
        if basis == "remaining_period_dominance":
            outcome = settle_spread(market, float(line), added_home, added_away)
        else:
            outcome = settle_spread(market, float(line), final_home, final_away)
    return {
        "status": "reviewed",
        "final_score": {"home": final_home, "away": final_away},
        "added_score": {"home": added_home, "away": added_away},
        "added_goals": added_goals,
        "outcome": outcome,
    }


@locked_json_operation
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("leisu_file", type=Path)
    parser.add_argument("--ledger", type=Path, default=Path("output/recommendation_ledger.json"))
    parser.add_argument(
        "--recompute",
        action="store_true",
        help="Recompute previously reviewed records using corrected settlement rules.",
    )
    args = parser.parse_args()
    records = json.loads(args.ledger.read_text(encoding="utf-8")) if args.ledger.exists() else []
    events = json.loads(args.leisu_file.read_text(encoding="utf-8")).get("events", [])

    for record in records:
        if record.get("review", {}).get("status") == "reviewed" and not args.recompute:
            continue
        left, _, right = record["match"].partition(" vs ")
        target = next(
            (
                event
                for event in events
                if final_event(event)
                and normalize(left) == normalize(event.get("homeTeam", {}).get("name", ""))
                and normalize(right) == normalize(event.get("awayTeam", {}).get("name", ""))
            ),
            None,
        )
        if target:
            record["review"] = settle(record, target)
            record["review"]["outcome_source"] = "verified_leisu_result"
            record["review"]["outcome_recorded_at"] = datetime.now(timezone.utc).isoformat()

    atomic_write_json(args.ledger, records)
    reviewed = [item for item in records if item.get("review", {}).get("status") == "reviewed"]
    summary = {
        "total": len(records),
        "reviewed": len(reviewed),
        "win": sum(item["review"].get("outcome") == "win" for item in reviewed),
        "loss": sum(item["review"].get("outcome") == "loss" for item in reviewed),
        "push": sum(item["review"].get("outcome") == "push" for item in reviewed),
        "half_win": sum(item["review"].get("outcome") == "half_win" for item in reviewed),
        "half_loss": sum(item["review"].get("outcome") == "half_loss" for item in reviewed),
        "invalid_data": sum(item["review"].get("outcome") == "invalid_data" for item in reviewed),
        "formal_recommendations": sum(bool(item.get("formal_recommendation")) for item in records),
        "machine_candidates": sum(item.get("record_type") == "machine_candidate" for item in records),
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

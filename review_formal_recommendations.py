#!/usr/bin/env python3
"""Settle formal prematch parlays from a small, verified result file."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from football_live import repair_mojibake
from review_recommendations import normalize, settle_spread, settle_total


def clean(value: Any) -> str:
    return repair_mojibake(str(value or ""))


def find_result(match: str, results: list[dict[str, Any]]) -> dict[str, Any] | None:
    left, _, right = clean(match).partition(" vs ")
    for result in results:
        home, _, away = clean(result.get("match")).partition(" vs ")
        if normalize(left) == normalize(home) and normalize(right) == normalize(away):
            return result
    return None


def line_value(text: str) -> float | None:
    found = re.search(r"([+-]?\d+(?:\.\d+)?)(?:/([+-]?\d+(?:\.\d+)?))?", text)
    if not found:
        return None
    first = float(found.group(1))
    return (first + float(found.group(2))) / 2 if found.group(2) else first


def settle_leg(leg: dict[str, Any], result: dict[str, Any]) -> str:
    selection = clean(leg.get("selection"))
    match = clean(leg.get("match"))
    home_name, _, away_name = match.partition(" vs ")
    home = int(result["home"])
    away = int(result["away"])
    if "独赢" in selection:
        team = selection.replace("独赢", "").strip()
        if normalize(team) == normalize(home_name):
            return "win" if home > away else "loss"
        if normalize(team) == normalize(away_name):
            return "win" if away > home else "loss"
    line = line_value(selection)
    if line is not None and "全场小" in selection:
        return settle_total("全场小球", line, home + away)
    if line is not None:
        team = selection[: selection.rfind(str(selection.split()[-1]))].strip()
        if normalize(team) == normalize(home_name):
            return settle_spread("主队让球", line, home, away)
        if normalize(team) == normalize(away_name):
            return settle_spread("客队让球", line, home, away)
    return "manual_review"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("results_file", type=Path)
    parser.add_argument("--ledger", type=Path, default=Path("output/recommendation_ledger.json"))
    args = parser.parse_args()
    records = json.loads(args.ledger.read_text(encoding="utf-8"))
    results = json.loads(args.results_file.read_text(encoding="utf-8"))["results"]

    updated = 0
    for record in records:
        if not record.get("formal_recommendation"):
            continue
        legs = record.get("recommendation", {}).get("legs") or []
        leg_results = []
        for leg in legs:
            result = find_result(leg.get("match", ""), results)
            if not result:
                leg_results.append(
                    {
                        "match": clean(leg.get("match")),
                        "selection": clean(leg.get("selection")),
                        "outcome": "pending",
                    }
                )
                continue
            leg_results.append(
                {
                    "match": clean(leg.get("match")),
                    "selection": clean(leg.get("selection")),
                    "final_score": {"home": result["home"], "away": result["away"]},
                    "outcome": settle_leg(leg, result),
                    "source": result.get("source"),
                }
            )
        outcomes = [item["outcome"] for item in leg_results]
        if "loss" in outcomes:
            outcome = "loss"
            status = "reviewed"
        elif outcomes and all(item not in {"pending", "manual_review"} for item in outcomes):
            outcome = "win" if all(item in {"win", "push"} for item in outcomes) else "partial"
            status = "reviewed"
        else:
            outcome = "pending"
            status = "partial"
        record["review"] = {
            "status": status,
            "outcome": outcome,
            "leg_results": leg_results,
            "review_method": "verified_result_file",
        }
        updated += 1

    args.ledger.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"formal_records_updated": updated}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

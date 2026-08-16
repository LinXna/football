#!/usr/bin/env python3
"""Record a verified result and diagnosis for one formal recommendation."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
try:
    from scripts.python.json_store_lock import atomic_write_json, locked_json_operation
except ModuleNotFoundError:
    from json_store_lock import atomic_write_json, locked_json_operation

from review_recommendations import settle_total


def repair_cli_text(value: str) -> str:
    """Repair Windows PowerShell arguments that arrived as GBK bytes in Latin-1."""
    try:
        repaired = value.encode("latin-1").decode("gbk")
        return repaired if any("\u4e00" <= char <= "\u9fff" for char in repaired) else value
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


@locked_json_operation
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", type=Path, required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--home", type=int, required=True)
    parser.add_argument("--away", type=int, required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--error-type", action="append", default=[])
    parser.add_argument("--diagnosis", action="append", default=[])
    args = parser.parse_args()

    records = json.loads(args.ledger.read_text(encoding="utf-8"))
    record = next((item for item in records if item.get("id") == args.id), None)
    if not record:
        raise SystemExit(f"Recommendation not found: {args.id}")
    recommendation = record.get("recommendation", {})
    if recommendation.get("market") in {"全场大球", "全场小球"}:
        recommendation["basis"] = "full_match_total"
        outcome = settle_total(
            recommendation["market"],
            float(recommendation["line"]),
            args.home + args.away,
        )
    else:
        outcome = "manual_review"
    record["review"] = {
        "status": "reviewed",
        "final_score": {"home": args.home, "away": args.away},
        "outcome": outcome,
        "outcome_source": "manual_user_confirmed",
        "outcome_recorded_at": datetime.now(timezone.utc).isoformat(),
        "source": repair_cli_text(args.source),
        "error_types": [repair_cli_text(item) for item in args.error_type],
        "diagnosis": [repair_cli_text(item) for item in args.diagnosis],
        "model_corrections": [
            "滚球全场大小球改用已有进球加预计剩余进球，与全场盘口同口径比较",
            "趋势窗口必须包含足够的实际比赛分钟，中场静止时间不再计入低压趋势",
            "累计技术统计回退时趋势直接判无效，禁止产生负射门或负进攻增量",
        ],
    }
    atomic_write_json(args.ledger, records)
    print(json.dumps(record["review"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

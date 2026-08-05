#!/usr/bin/env python3
"""Promote one reviewed machine candidate into the formal recommendation ledger."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", type=Path, required=True)
    parser.add_argument("--ybty-home", required=True)
    parser.add_argument("--start-time-beijing", required=True)
    parser.add_argument("--start-time-source", required=True)
    parser.add_argument("--grade", default="B")
    parser.add_argument("--evidence", action="append", default=[])
    parser.add_argument("--risk", action="append", default=[])
    parser.add_argument("--stop-condition", action="append", default=[])
    args = parser.parse_args()

    records = json.loads(args.ledger.read_text(encoding="utf-8"))
    candidates = [
        item
        for item in records
        if item.get("record_type") == "machine_candidate"
        and item.get("ybty_home") == args.ybty_home
    ]
    if not candidates:
        raise SystemExit(f"No machine candidate found for {args.ybty_home}")
    source = max(candidates, key=lambda item: item.get("created_at", ""))
    created_at = datetime.now(timezone.utc).isoformat()
    raw_id = "|".join(
        (
            source.get("ybty_match", ""),
            str(source.get("minute")),
            str(source.get("score_at_recommendation")),
            str(source.get("recommendation")),
            created_at,
        )
    )
    formal = {
        **source,
        "id": "formal-live-" + hashlib.sha256(raw_id.encode()).hexdigest()[:16],
        "created_at": created_at,
        "record_type": "formal_ai_recommendation",
        "formal_recommendation": True,
        "grade": args.grade,
        "ybty_start_time_beijing": args.start_time_beijing,
        "start_time_source": args.start_time_source,
        "evidence": args.evidence or source.get("evidence", []),
        "risks": args.risk or source.get("risks", []),
        "stop_conditions": args.stop_condition,
        "review": {"status": "pending"},
    }
    records.append(formal)
    args.ledger.write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(formal, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

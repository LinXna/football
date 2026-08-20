#!/usr/bin/env python3
"""Build a conservative prematch research queue from matched market snapshots."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
try:
    from scripts.python.json_store_lock import atomic_write_json, locked_json_operation
except ModuleNotFoundError:
    from json_store_lock import atomic_write_json, locked_json_operation
from typing import Any
from zoneinfo import ZoneInfo

from recommend_live import asian_line, number, ybty_h2h, ybty_spread, ybty_total
try:
    from scripts.python.interface_features import extract_interface_features
except ModuleNotFoundError:
    from interface_features import extract_interface_features


SIMULATION_MARKERS = ("eafc", "电竞", "电子足球", "模拟", "panda")
BEIJING = ZoneInfo("Asia/Shanghai")


def display_start_time(value: Any) -> str | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return str(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(BEIJING).strftime("%Y-%m-%d %H:%M")


def resolve_start_time(
    ybty_time: Any,
    provider_time: Any,
    captured_at: Any,
) -> tuple[str | None, str | None]:
    if ybty_time:
        return display_start_time(ybty_time), "YBTY"
    match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", str(provider_time or ""))
    if not match or not captured_at:
        return None, None
    try:
        captured = datetime.fromisoformat(str(captured_at).replace("Z", "+00:00"))
    except ValueError:
        return None, None
    if captured.tzinfo is None:
        captured = captured.replace(tzinfo=timezone.utc)
    local = captured.astimezone(BEIJING)
    kickoff = local.replace(
        hour=int(match.group(1)),
        minute=int(match.group(2)),
        second=0,
        microsecond=0,
    )
    if kickoff < local:
        kickoff += timedelta(days=1)
    return kickoff.strftime("%Y-%m-%d %H:%M"), "雷速补充"


def reference_number(value: Any) -> float | None:
    """Read the first numeric value from duplicated canvas text."""
    if value is None:
        return None
    match = re.search(r"[+-]?\d+(?:\.\d+)?", str(value))
    return float(match.group()) if match else None


def assess(candidate: dict[str, Any]) -> dict[str, Any]:
    match = candidate["match"]
    source = candidate["market_source"]
    total = ybty_total(candidate)
    spread = ybty_spread(candidate)
    h2h = ybty_h2h(candidate)
    reference = candidate.get("reference_odds", {}).get("current", {})
    weather = candidate.get("weather", {})
    lineups = candidate.get("lineups", {})
    player_candidates = candidate.get("player_candidates", {})
    interface_features = extract_interface_features(candidate)
    ref_total = reference.get("total_goals", {})
    identity = " ".join(
        str(value).lower()
        for value in (
            source.get("league"),
            source.get("home"),
            source.get("away"),
            match.get("league"),
            match.get("home"),
            match.get("away"),
        )
        if value
    )
    blockers: list[str] = []
    evidence: list[str] = [
        f"赛事匹配置信度 {candidate.get('match_confidence', 0):.0%}"
    ]
    risks: list[str] = []
    if any(marker in identity for marker in SIMULATION_MARKERS):
        blockers.append("疑似模拟或电竞赛事")
    if candidate.get("match_confidence", 0) < 0.80:
        blockers.append("球队名称匹配置信度不足80%")
    if not any((total, spread, h2h)):
        blockers.append("缺少可读取的赛前盘口")

    market_alignment = 0
    if total and total.get("line") is not None:
        ref_line = reference_number(ref_total.get("line"))
        if ref_line is not None:
            gap = abs(total["line"] - ref_line)
            evidence.append(
                f"总进球线：YBTY {total['line']:.2f} / 雷速 {ref_line:.2f}"
            )
            if gap <= 0.25:
                market_alignment += 12
            elif gap > 0.5:
                risks.append("两个来源的总进球线差异超过0.5球")
        else:
            risks.append("雷速未提供可解析的总进球参考线")
    if spread and spread.get("home_line") is not None:
        evidence.append(f"YBTY主队让球线 {spread['home_line']:+.2f}")
        market_alignment += 5
    if h2h:
        available = sum(
            value is not None
            for value in (
                h2h.get("home_odds"),
                h2h.get("draw_odds"),
                h2h.get("away_odds"),
            )
        )
        if available >= 2:
            market_alignment += 5
    if weather.get("available"):
        evidence.append(
            f"雷速当地天气：{'、'.join(map(str, weather.get('text', [])[:6]))}"
        )
        market_alignment += 2
    if lineups.get("available"):
        home_starters = len(lineups.get("home", {}).get("starters", []))
        away_starters = len(lineups.get("away", {}).get("starters", []))
        evidence.append(f"正式阵容已映射：主队{home_starters}人、客队{away_starters}人")
        market_alignment += 5
    elif lineups.get("status") == "squad_only_no_confirmed_match_lineup":
        risks.append("已有双方注册名单，但本场正式首发尚未确认")

    prior = interface_features.get("quantitative_prior", {})
    if prior and prior.get("lambda_total_prior"):
        evidence.append(
            f"基本面泊松先验总进球期望：{prior['lambda_total_prior']:.2f} (主队{prior.get('lambda_home_prior', 0):.2f} - 客队{prior.get('lambda_away_prior', 0):.2f})"
        )
        if total and total.get("line") is not None:
            prior_gap = abs(total["line"] - prior["lambda_total_prior"])
            if prior_gap <= 0.35:
                market_alignment += 4

    evidence.extend(interface_features["evidence"])
    risks.extend(interface_features["risks"])
    completeness = candidate.get("candidate", {}).get("score", 0)
    # Interface fundamentals are reported as research evidence with quantitative prior linkage
    score = round(min(79, completeness * 0.75 + market_alignment), 1)
    status = "RESEARCH" if not blockers and score >= 50 else "PASS"
    grade = "B" if status == "RESEARCH" and score >= 68 else "C"
    if status == "RESEARCH":
        risks.append("尚未核验积分战意、近期状态、首发伤停及当地媒体信息")
    ybty_start_time = source.get("commence_time")
    start_time_beijing, start_time_source = resolve_start_time(
        ybty_start_time,
        match.get("provider_start_time"),
        source.get("captured_at"),
    )
    return {
        "match": f"{match.get('home')} vs {match.get('away')}",
        "ybty_match": f"{source.get('home')} vs {source.get('away')}",
        "ybty_home": source.get("home"),
        "ybty_away": source.get("away"),
        "league": source.get("league") or match.get("league"),
        "ybty_league": source.get("league"),
        "leisu_league": match.get("league"),
        "start_time": ybty_start_time,
        "ybty_start_time": ybty_start_time,
        "ybty_start_time_beijing": start_time_beijing,
        "start_time_source": start_time_source,
        "status": status,
        "grade": grade,
        "model_score": score,
        "match_confidence": candidate.get("match_confidence"),
        "ybty_markets": {
            "h2h": h2h,
            "spread": spread,
            "total": total,
        },
        "reference_market": reference,
        "weather": weather,
        "lineups": lineups,
        "player_candidates": player_candidates,
        "detail_context": candidate.get("detail_context", {}),
        "interface_features": interface_features,
        "evidence": evidence,
        "risks": risks,
        "stop_conditions": blockers,
        "required_research": [
            "确认开赛时间和赛事性质",
            "积分排名、战意与赛程密度",
            "近5至10场及主客场表现",
            "正式首发、伤停、停赛和轮换",
            "当地媒体与至少一个独立统计来源",
            "初盘至当前盘变化及热门风险",
        ],
        "recommendation": None,
    }


@locked_json_operation
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("matched_file", type=Path)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("output/ybty_leisu_prematch_decisions.json"),
    )
    parser.add_argument(
        "--brief-output",
        type=Path,
        default=None,
    )
    args = parser.parse_args()
    brief_output = args.brief_output or args.output.with_name("prematch_ai_brief.json")
    data = json.loads(args.matched_file.read_text(encoding="utf-8"))
    decisions = [assess(item) for item in data.get("candidates", [])]
    research = sorted(
        (item for item in decisions if item["status"] == "RESEARCH"),
        key=lambda item: item["model_score"],
        reverse=True,
    )
    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "prematch",
        "summary": {
            "assessed": len(decisions),
            "research": len(research),
            "pass": sum(item["status"] == "PASS" for item in decisions),
            "b_grade": sum(item["grade"] == "B" for item in research),
        },
        "research_queue": research,
        "single_best": None,
        "parlay_5x": None,
        "decisions": decisions,
        "notice": (
            "这是赛前自动筛选结果，不是最终投注建议。"
            "最终单场和串子必须由AI完成基本面、战意、阵容、媒体和盘口变化核验后生成。"
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(args.output, result)
    brief = {
        "generated_at": result["generated_at"],
        "purpose": "AI赛前深度核验输入；不是直接投注建议",
        "candidates": [
            {
                "match": item["match"],
                "ybty_match": item["ybty_match"],
                "ybty_home": item["ybty_home"],
                "ybty_away": item["ybty_away"],
                "league": item["league"],
                "start_time": item["start_time"],
                "ybty_start_time": item["ybty_start_time"],
                "ybty_start_time_beijing": item["ybty_start_time_beijing"],
                "start_time_source": item["start_time_source"],
                "market_score": item["model_score"],
                "ybty_markets": item["ybty_markets"],
                "reference_market": item["reference_market"],
                "weather": item["weather"],
                "lineups": item["lineups"],
                "player_candidates": item["player_candidates"],
                "detail_context": item["detail_context"],
                "evidence": item["evidence"],
                "risks": item["risks"],
                "required_research": item["required_research"],
            }
            for item in research
            if item["grade"] == "B"
        ],
    }
    brief_output.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(brief_output, brief)
    print(json.dumps(result["summary"], ensure_ascii=False))
    print(f"Output: {args.output.resolve()}")
    print(f"AI brief: {brief_output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

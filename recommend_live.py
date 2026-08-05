#!/usr/bin/env python3
"""Conservative live-football recommendation model."""

from __future__ import annotations

import argparse
import itertools
import json
import statistics
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


SIMULATION_MARKERS = ("eafc", "电竞", "电子足球", "模拟", "vs世界杯", "panda")
FRIENDLY_MARKERS = ("友谊", "friendly", "friendlies")
MIN_B_SCORE = 72.0
MAX_LIVE_MARKET_AGE_SECONDS = 300
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


def number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def asian_line(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if "/" not in text:
        return number(text)
    sign = -1 if text.startswith("-") else 1
    unsigned = text[1:] if text[:1] in {"+", "-"} else text
    parts = [number(item) for item in unsigned.split("/", 1)]
    if any(item is None for item in parts):
        return None
    return sign * sum(parts) / 2


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def market_age_seconds(candidate: dict[str, Any], now: datetime) -> float | None:
    captured = parse_time(candidate.get("market_source", {}).get("captured_at"))
    return (now - captured).total_seconds() if captured else None


def ybty_market(candidate: dict[str, Any], market_name: str) -> dict[str, Any] | None:
    rows = candidate.get("market_source", {}).get("markets", [])
    row = next(
        (
            item
            for item in rows
            if item.get("market") == market_name and item.get("line_index") == 0
        ),
        None,
    )
    if not row:
        return None
    options = row.get("options", [])
    return {"options": options, "raw": row}


def ybty_total(candidate: dict[str, Any]) -> dict[str, Any] | None:
    market = ybty_market(candidate, "full_total")
    if not market or len(market["options"]) < 2:
        return None
    over, under = market["options"][:2]
    return {
        "line": asian_line(over.get("selection")),
        "over_odds": number(over.get("odds")),
        "under_odds": number(under.get("odds")),
        "over_suspended": over.get("suspended", False),
        "under_suspended": under.get("suspended", False),
    }


def ybty_spread(candidate: dict[str, Any]) -> dict[str, Any] | None:
    market = ybty_market(candidate, "full_spread")
    if not market or len(market["options"]) < 2:
        return None
    home, away = market["options"][:2]
    return {
        "home_line": asian_line(home.get("selection")),
        "away_line": asian_line(away.get("selection")),
        "home_odds": number(home.get("odds")),
        "away_odds": number(away.get("odds")),
        "home_suspended": home.get("suspended", False),
        "away_suspended": away.get("suspended", False),
    }


def ybty_h2h(candidate: dict[str, Any]) -> dict[str, Any] | None:
    market = ybty_market(candidate, "full_h2h")
    if not market:
        return None
    output = {
        "home_odds": None,
        "draw_odds": None,
        "away_odds": None,
        "home_suspended": True,
        "draw_suspended": True,
        "away_suspended": True,
    }
    for option in market["options"]:
        label = str(option.get("selection") or "")
        key = "home" if label == "主" else "away" if label == "客" else "draw" if label == "平" else None
        if key:
            output[f"{key}_odds"] = number(option.get("odds"))
            output[f"{key}_suspended"] = option.get("suspended", False)
    return output


def reference_total(candidate: dict[str, Any]) -> dict[str, Any]:
    reference_odds = candidate.get("reference_odds")
    reference_odds = reference_odds if isinstance(reference_odds, dict) else {}
    detail = reference_odds.get("detail")
    detail = detail if isinstance(detail, dict) else {}
    normalized = detail.get("normalized")
    normalized = normalized if isinstance(normalized, dict) else {}
    companies = normalized.get("companies", [])
    opening: list[float] = []
    current: list[float] = []
    for company in companies:
        market = company.get("total_goals", {})
        opening_line = number(market.get("opening", {}).get("line"))
        current_line = number(market.get("current", {}).get("line"))
        if opening_line is not None:
            opening.append(opening_line)
        if current_line is not None:
            current.append(current_line)
    current_odds = reference_odds.get("current")
    current_odds = current_odds if isinstance(current_odds, dict) else {}
    list_current = current_odds.get("total_goals")
    list_current = list_current if isinstance(list_current, dict) else {}
    return {
        "company_count": len(current),
        "opening_line": statistics.median(opening) if opening else None,
        "current_line": (
            statistics.median(current)
            if current
            else number(list_current.get("line"))
        ),
        "source": "detail_consensus" if current else "list_current",
    }


def trend_pressure(candidate: dict[str, Any]) -> tuple[float, list[str]]:
    trends = candidate.get("recent_trends", {})
    evidence: list[str] = []
    pressure = 0.0
    for minutes, weight in ((5, 1.0), (15, 0.45)):
        trend = trends.get(f"last_{minutes}_minutes", {})
        if not trend.get("available"):
            continue
        shots = trend.get("shots", {})
        on_target = trend.get("shots_on_target", {})
        dangerous = trend.get("dangerous_attacks", {})
        shot_total = (number(shots.get("home")) or 0) + (number(shots.get("away")) or 0)
        target_total = (number(on_target.get("home")) or 0) + (
            number(on_target.get("away")) or 0
        )
        danger_total = (number(dangerous.get("home")) or 0) + (
            number(dangerous.get("away")) or 0
        )
        pressure += weight * (target_total * 0.18 + shot_total * 0.035 + danger_total * 0.008)
        evidence.append(
            f"最近{minutes}分钟：射门{shot_total:.0f}、射正{target_total:.0f}"
        )
    return pressure, evidence


def assess(candidate: dict[str, Any], now: datetime) -> dict[str, Any]:
    match = candidate["match"]
    source = candidate.get("market_source", {})
    stats = candidate.get("live_statistics", {})
    minute = match.get("minute")
    score = match.get("score", {})
    score_source = match.get("score_source")
    score_verified = bool(
        score.get("home") is not None
        and score.get("away") is not None
        and score_source in {"ybty_market", "score_canvas", "leisu_text_live", "provider_api"}
    )
    goals = (number(score.get("home")) or 0) + (number(score.get("away")) or 0)
    age = market_age_seconds(candidate, now)
    risks: list[str] = []
    stops: list[str] = []
    weather = candidate.get("weather", {})
    lineups = candidate.get("lineups", {})
    live_text = candidate.get("live_text", {})
    text_entries = [
        str(item)
        for item in live_text.get("entries", [])
        if str(item).strip()
    ]
    text_blob = " ".join(text_entries).lower()

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
    if any(marker in identity for marker in SIMULATION_MARKERS):
        stops.append("疑似模拟或电竞赛事")
    if age is None:
        stops.append("无法确认YBTY盘口采集时间")
    elif age > MAX_LIVE_MARKET_AGE_SECONDS:
        stops.append(f"YBTY盘口已过期约{int(age // 60)}分钟")
    if minute is None:
        stops.append("比赛分钟无法确认")
    elif minute < 15 or minute > 75:
        stops.append("不在15至75分钟的滚球价值窗口")
    if not stats.get("shots") or not stats.get("shots_on_target"):
        stops.append("缺少射门或射正数据")
    if not score_verified:
        stops.append("YBTY比分缺失，且雷速没有可可靠回退的比分")
    if any(marker in text_blob for marker in ("红牌", "red card", "var", "点球")):
        risks.append("文字直播存在红牌、VAR或点球等重大事件，需确认盘口已稳定")

    trend_complete = all(
        candidate.get("recent_trends", {})
        .get(f"last_{minutes}_minutes", {})
        .get("available")
        for minutes in (5, 15)
    )
    trend_5_available = bool(
        candidate.get("recent_trends", {})
        .get("last_5_minutes", {})
        .get("available")
    )
    trend_15_available = bool(
        candidate.get("recent_trends", {})
        .get("last_15_minutes", {})
        .get("available")
    )
    if not trend_complete:
        risks.append("5/15分钟趋势未完全形成，采用首次快照保守评分")
    elif any(
        candidate.get("recent_trends", {})
        .get(f"last_{minutes}_minutes", {})
        .get("coverage") == "incident_timeline"
        for minutes in (5, 15)
    ):
        risks.append("5/15分钟趋势来自雷速分钟事件；攻防累计增量覆盖有限")

    total = ybty_total(candidate)
    spread = ybty_spread(candidate)
    h2h = ybty_h2h(candidate)
    total_active = bool(
        total
        and total["line"] is not None
        and not (total["over_suspended"] and total["under_suspended"])
    )
    spread_active = bool(
        spread
        and not (spread["home_suspended"] and spread["away_suspended"])
    )
    h2h_active = bool(
        h2h
        and not (
            h2h["home_suspended"]
            and h2h["draw_suspended"]
            and h2h["away_suspended"]
        )
    )
    if not any((total_active, spread_active, h2h_active)):
        stops.append("YBTY大小球、让球和胜平负均无可投注盘口")
    elif not total_active:
        risks.append("YBTY大小球缺失或暂停，改为评估让球和胜平负")

    reference = reference_total(candidate)
    if (
        total_active
        and total
        and total["line"] is not None
        and reference["current_line"] is not None
        and abs(total["line"] - reference["current_line"]) > 0.5
    ):
        stops.append("YBTY与雷速当前总进球盘口差异超过0.5球")

    decision = {
        "match": f"{match.get('home')} vs {match.get('away')}",
        "ybty_match": f"{source.get('home')} vs {source.get('away')}",
        "ybty_home": source.get("home"),
        "ybty_away": source.get("away"),
        "ybty_start_time": source.get("commence_time"),
        "ybty_start_time_beijing": display_start_time(source.get("commence_time")),
        "provider_start_time": match.get("provider_start_time"),
        "minute": minute,
        "score": score,
        "score_source": score_source,
        "score_verified": score_verified,
        "status": "PASS",
        "grade": "C",
        "model_score": 0,
        "recommendation": None,
        "market_age_seconds": age,
        "reference_market": reference,
        "weather": weather,
        "lineups": lineups,
        "player_candidates": candidate.get("player_candidates", {}),
        "live_text": live_text,
        "incidents": candidate.get("incidents", []),
        "state_source": match.get("state_source"),
        "provider_state": match.get("provider_state", {}),
        "evidence": [],
        "risks": risks,
        "stop_conditions": stops,
    }
    if stops:
        return decision

    shots = stats["shots"]
    on_target = stats["shots_on_target"]
    total_shots = (number(shots.get("home")) or 0) + (number(shots.get("away")) or 0)
    total_on_target = (number(on_target.get("home")) or 0) + (
        number(on_target.get("away")) or 0
    )
    dangerous = stats.get("dangerous_attacks", {})
    attacks = stats.get("attacks", {})
    possession = stats.get("possession", {})
    total_dangerous = (number(dangerous.get("home")) or 0) + (
        number(dangerous.get("away")) or 0
    )
    if total_shots == 0 and total_on_target == 0 and total_dangerous == 0:
        decision["stop_conditions"].append("实时技术统计全为0，疑似数据缺失")
        return decision

    assert minute
    remaining = max(0, 90 - minute)
    base_rate = (total_on_target * 0.25 + total_shots * 0.03) / max(minute, 1)
    recent_pressure, trend_evidence = trend_pressure(candidate)
    observed_projection = base_rate * remaining + recent_pressure
    # The pre-match total is a prior for the whole match. Blend its time-adjusted
    # remainder with the noisy live sample so an early quiet spell cannot force
    # the forecast unrealistically close to zero.
    prior_total = reference["opening_line"]
    prior_remaining = (
        max(0.25, prior_total * remaining / 90)
        if prior_total is not None
        else None
    )
    projected_extra = (
        observed_projection * 0.6 + prior_remaining * 0.4
        if prior_remaining is not None
        else observed_projection
    )
    projected_total = goals + projected_extra
    evidence = [
        f"累计射门{total_shots:.0f}、射正{total_on_target:.0f}",
        f"模型预计剩余进球约{projected_extra:.2f}",
        f"模型预计全场总进球约{projected_total:.2f}",
    ]
    weather_text = weather.get("text", []) if weather.get("available") else []
    if weather_text:
        evidence.append(f"当地天气：{'、'.join(map(str, weather_text[:6]))}")
    if lineups.get("available"):
        home_starters = len(lineups.get("home", {}).get("starters", []))
        away_starters = len(lineups.get("away", {}).get("starters", []))
        evidence.append(f"正式阵容已映射：主队{home_starters}人、客队{away_starters}人")
    elif lineups.get("status") == "squad_only_no_confirmed_match_lineup":
        risks.append("仅取得双方注册名单，未确认本场正式首发")
    if text_entries:
        evidence.append(f"已取得文字直播事件{len(text_entries)}条")
    evidence.extend(trend_evidence)
    if reference["opening_line"] is not None and reference["current_line"] is not None:
        evidence.append(
            f"雷速多公司总进球：赛前初盘{reference['opening_line']:.2f}；滚球剩余线{reference['current_line']:.2f}"
        )
        evidence.append("赛前总进球与滚球剩余进球口径不同，不直接计算升降")
    else:
        risks.append("缺少多公司初盘至即时盘对比")

    market_choices: list[dict[str, Any]] = []
    if total_active and total:
        line = total["line"]
        # The displayed YBTY live total is a full-match total. Compare it with
        # projected final goals, not merely the goals expected after the bet.
        edge_under = line - projected_total
        edge_over = projected_total - line
        if (
            minute >= 30
            and trend_5_available
            and edge_under >= 0.55
            and total["under_odds"]
            and 1.65 <= total["under_odds"] <= 3.5
        ):
            market_choices.append(
                {
                    "market": "全场小球",
                    "line": line,
                    "odds": total["under_odds"],
                    "edge": edge_under,
                    "basis": "full_match_total",
                }
            )
        if (
        edge_over >= 0.55
        and total["over_odds"]
        and 1.65 <= total["over_odds"] <= 3.5
        ):
            market_choices.append(
                {
                    "market": "全场大球",
                    "line": line,
                    "odds": total["over_odds"],
                    "edge": edge_over,
                    "basis": "full_match_total",
                }
            )

    home_shots = number(shots.get("home")) or 0
    away_shots = number(shots.get("away")) or 0
    home_target = number(on_target.get("home")) or 0
    away_target = number(on_target.get("away")) or 0
    dominance = (
        (home_target - away_target) * 1.8
        + (home_shots - away_shots) * 0.35
        + ((number(dangerous.get("home")) or 0) - (number(dangerous.get("away")) or 0)) * 0.04
        + ((number(attacks.get("home")) or 0) - (number(attacks.get("away")) or 0)) * 0.015
        + ((number(possession.get("home")) or 50) - (number(possession.get("away")) or 50)) * 0.025
    )
    score_margin = (number(score.get("home")) or 0) - (number(score.get("away")) or 0)
    evidence.append(f"实时优势指数：主队{dominance:+.2f}")
    if possession:
        evidence.append(
            "控球率："
            f"{number(possession.get('home')) or 0:.0f}%—"
            f"{number(possession.get('away')) or 0:.0f}%"
        )
    if attacks or dangerous:
        evidence.append(
            "进攻/危险进攻："
            f"{number(attacks.get('home')) or 0:.0f}/"
            f"{number(dangerous.get('home')) or 0:.0f}—"
            f"{number(attacks.get('away')) or 0:.0f}/"
            f"{number(dangerous.get('away')) or 0:.0f}"
        )

    if spread_active and spread:
        home_line = spread["home_line"]
        away_line = spread["away_line"]
        trends = candidate.get("recent_trends", {})
        recent_5 = trends.get("last_5_minutes", {})
        recent_15 = trends.get("last_15_minutes", {})

        def side_pressure(side: str) -> tuple[float, float, float, float]:
            return (
                number(recent_5.get("shots", {}).get(side)) or 0,
                number(recent_5.get("shots_on_target", {}).get(side)) or 0,
                number(recent_5.get("dangerous_attacks", {}).get(side)) or 0,
                number(recent_15.get("shots_on_target", {}).get(side)) or 0,
            )

        home_5_shots, home_5_target, home_5_danger, home_15_target = side_pressure("home")
        away_5_shots, away_5_target, away_5_danger, away_15_target = side_pressure("away")
        # YBTY's live handicap is settled on the score *after the wager*, not
        # the score already on the board.  A leading team therefore still has
        # to win the remaining period to cover -0.5.  Do not turn a historical
        # lead into a false reason to buy a further handicap.
        home_remainder_pressure = (
            trend_5_available
            and trend_15_available
            and home_5_shots >= 2
            and home_5_target >= 1
            and home_5_danger >= 4
            and home_15_target >= 1
        )
        away_remainder_pressure = (
            trend_5_available
            and trend_15_available
            and away_5_shots >= 2
            and away_5_target >= 1
            and away_5_danger >= 4
            and away_15_target >= 1
        )
        home_deep_ok = not (
            home_line is not None
            and home_line <= -0.75
            and (
                minute < 30
                or not home_remainder_pressure
                or dominance < 5.0
                or home_target - away_target < 2
            )
        )
        away_deep_ok = not (
            away_line is not None
            and away_line <= -0.75
            and (
                minute < 30
                or not away_remainder_pressure
                or dominance > -5.0
                or away_target - home_target < 2
            )
        )
        if (
            dominance >= 3.5
            and home_remainder_pressure
            and home_deep_ok
            and spread["home_odds"]
            and 1.65 <= spread["home_odds"] <= 3.5
        ):
            market_choices.append(
                {
                    "market": "主队后续时段让球",
                    "line": spread["home_line"],
                    "odds": spread["home_odds"],
                    "edge": min(1.4, dominance / 5),
                    "basis": "remaining_period_dominance",
                    "scope": "remaining_time",
                }
            )
        elif (
            dominance <= -3.5
            and away_remainder_pressure
            and away_deep_ok
            and spread["away_odds"]
            and 1.65 <= spread["away_odds"] <= 3.5
        ):
            market_choices.append(
                {
                    "market": "客队后续时段让球",
                    "line": spread["away_line"],
                    "odds": spread["away_odds"],
                    "edge": min(1.4, abs(dominance) / 5),
                    "basis": "remaining_period_dominance",
                    "scope": "remaining_time",
                }
            )

    if h2h_active and h2h and minute <= 65:
        if dominance >= 4.5 and score_margin >= 0 and h2h["home_odds"] and 1.65 <= h2h["home_odds"] <= 4.0:
            market_choices.append(
                {
                    "market": "主队独赢",
                    "line": None,
                    "odds": h2h["home_odds"],
                    "edge": min(1.2, dominance / 6),
                    "basis": "dominance",
                }
            )
        elif dominance <= -4.5 and score_margin <= 0 and h2h["away_odds"] and 1.65 <= h2h["away_odds"] <= 4.0:
            market_choices.append(
                {
                    "market": "客队独赢",
                    "line": None,
                    "odds": h2h["away_odds"],
                    "edge": min(1.2, abs(dominance) / 6),
                    "basis": "dominance",
                }
            )

    market_choices.sort(key=lambda item: item["edge"], reverse=True)
    recommendation = market_choices[0] if market_choices else None
    edge = recommendation["edge"] if recommendation else 0.0

    if not recommendation:
        decision["evidence"] = evidence
        decision["risks"].append("实时进球压力与可投注盘口之间没有足够安全边际")
        return decision

    model_score = 52 + min(20, edge * 18)
    model_score += min(8, reference["company_count"] * 0.8)
    model_score += 7 if trend_complete else 0
    model_score += 5 if total_on_target >= 4 else 0
    model_score += 3 if lineups.get("available") else 0
    model_score += 2 if weather.get("available") else 0
    model_score += 2 if text_entries else 0
    if not trend_5_available:
        model_score -= 8
    elif not trend_15_available:
        model_score -= 3
    is_friendly = any(marker in identity for marker in FRIENDLY_MARKERS)
    if is_friendly:
        model_score -= 12
        risks.append("友谊赛轮换风险，模型评分下调12分")
    model_score = round(max(0, min(92, model_score)), 1)
    if model_score < MIN_B_SCORE:
        decision["evidence"] = evidence
        decision["risks"] = risks
        decision["stop_conditions"].append(
            f"模型评分{model_score:.1f}低于B级门槛{MIN_B_SCORE:.0f}"
        )
        return decision
    grade = "A" if model_score >= 80 and reference["company_count"] >= 5 else "B"

    decision.update(
        status="WATCH",
        grade=grade,
        model_score=model_score,
        recommendation={
            key: value for key, value in recommendation.items() if key != "edge"
        },
        evidence=evidence,
    )
    return decision


def build_parlay(decisions: list[dict[str, Any]]) -> dict[str, Any] | None:
    eligible = [
        item
        for item in decisions
        if item["status"] == "WATCH"
        and item["grade"] in {"A", "B"}
        and item.get("recommendation", {}).get("odds")
    ]
    eligible.sort(key=lambda item: item["model_score"], reverse=True)
    for size in (2, 3):
        for items in itertools.combinations(eligible, size):
            product = 1.0
            for item in items:
                product *= item["recommendation"]["odds"]
            if product >= 5.0:
                return {
                    "legs": [
                        {
                            "match": item["match"],
                            "grade": item["grade"],
                            **item["recommendation"],
                        }
                        for item in items
                    ],
                    "combined_odds": round(product, 2),
                    "risk": "任一场盘口变化、暂停或超过停止下注条件时整组取消",
                }
    return None


def ledger_key(item: dict[str, Any]) -> tuple[Any, ...]:
    recommendation = item.get("recommendation", {})
    score = item.get("score_at_recommendation", {})
    return (
        item.get("match"),
        item.get("minute"),
        score.get("home"),
        score.get("away"),
        recommendation.get("market"),
        recommendation.get("line"),
        recommendation.get("odds"),
    )


def append_ledger(path: Path, result: dict[str, Any]) -> None:
    existing: list[dict[str, Any]] = []
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            existing = []
    # Normalize legacy rows and collapse exact duplicates created by repeated
    # analysis runs. Different minutes or changed prices remain separate snapshots.
    deduplicated: list[dict[str, Any]] = []
    positions: dict[tuple[Any, ...], int] = {}
    for item in existing:
        if "record_type" not in item:
            item["record_type"] = (
                "formal_ai_recommendation"
                if item.get("recommendation", {}).get("legs")
                or str(item.get("id", "")).startswith("prematch-")
                else "machine_candidate"
            )
        item.setdefault("formal_recommendation", item["record_type"] == "formal_ai_recommendation")
        key = ledger_key(item)
        if key in positions:
            current = deduplicated[positions[key]]
            if (
                current.get("review", {}).get("status") != "reviewed"
                and item.get("review", {}).get("status") == "reviewed"
            ):
                deduplicated[positions[key]] = item
            continue
        positions[key] = len(deduplicated)
        deduplicated.append(item)
    existing = deduplicated
    known_keys = {ledger_key(item) for item in existing}
    for decision in result["decisions"]:
        if decision["status"] != "WATCH" or not decision.get("recommendation"):
            continue
        recommendation = decision["recommendation"]
        candidate_record = {
            "match": decision["match"],
            "minute": decision["minute"],
            "score_at_recommendation": decision["score"],
            "recommendation": recommendation,
        }
        key = ledger_key(candidate_record)
        if key in known_keys:
            continue
        raw_id = "|".join(
            (
                decision["match"],
                str(decision["minute"]),
                str(decision["score"].get("home")),
                str(decision["score"].get("away")),
                decision["recommendation"]["market"],
                str(decision["recommendation"].get("line")),
                str(decision["recommendation"].get("odds")),
            )
        )
        record_id = hashlib.sha256(raw_id.encode("utf-8")).hexdigest()[:16]
        existing.append(
            {
                "id": record_id,
                "created_at": result["generated_at"],
                "record_type": "machine_candidate",
                "formal_recommendation": False,
                "match": decision["match"],
                "ybty_match": decision.get("ybty_match"),
                "ybty_home": decision.get("ybty_home"),
                "ybty_away": decision.get("ybty_away"),
                "ybty_start_time": decision.get("ybty_start_time"),
                "ybty_start_time_beijing": decision.get("ybty_start_time_beijing"),
                "minute": decision["minute"],
                "score_at_recommendation": decision["score"],
                "score_source": decision.get("score_source"),
                "score_verified": decision.get("score_verified", False),
                "grade": decision["grade"],
                "model_score": decision["model_score"],
                "recommendation": recommendation,
                "evidence": decision["evidence"],
                "risks": decision["risks"],
                "data_context": {
                    "state_source": decision.get("state_source"),
                    "provider_state": decision.get("provider_state", {}),
                    "weather": decision.get("weather", {}),
                    "lineups": decision.get("lineups", {}),
                    "live_text": decision.get("live_text", {}),
                    "incidents": decision.get("incidents", []),
                },
                "review": {"status": "pending"},
            }
        )
        known_keys.add(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("matched_file", type=Path)
    parser.add_argument(
        "-o", "--output", type=Path, default=Path("output/live_decisions.json")
    )
    parser.add_argument(
        "--ledger",
        type=Path,
        default=Path("output/recommendation_ledger.json"),
    )
    args = parser.parse_args()
    data = json.loads(args.matched_file.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    decisions = [assess(item, now) for item in data.get("candidates", [])]
    ranked = sorted(
        (item for item in decisions if item["status"] == "WATCH"),
        key=lambda item: item["model_score"],
        reverse=True,
    )
    result = {
        "generated_at": now.isoformat(),
        "summary": {
            "assessed": len(decisions),
            "watch": len(ranked),
            "pass": sum(item["status"] == "PASS" for item in decisions),
            "a_grade": sum(item["grade"] == "A" for item in ranked),
            "b_grade": sum(item["grade"] == "B" for item in ranked),
        },
        "single_best": ranked[0] if ranked else None,
        "parlay_5x": build_parlay(decisions),
        "decisions": decisions,
        "notice": "模型只输出满足数据、时效和盘口一致性要求的候选，不承诺获利。",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    append_ledger(args.ledger, result)
    print(json.dumps(result["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

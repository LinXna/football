"""Deterministic features derived from the Leisu interface export contract."""
from __future__ import annotations
from typing import Any

def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}

def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []

def _number(value: Any) -> float | None:
    try: return float(value)
    except (TypeError, ValueError): return None

def _average(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None

def _rate(numerator: float, denominator: float) -> float | None:
    return round(numerator / denominator, 4) if denominator > 0 else None

def calculate_live_efficiency(stats: dict[str, Any], score: dict[str, Any]) -> dict[str, Any]:
    """Calculate observed, non-xG shooting and goalkeeper rates with validation."""
    shots = _dict(stats.get("shots"))
    on_target = _dict(stats.get("shots_on_target"))
    off_target = _dict(stats.get("shots_off_target"))
    output: dict[str, Any] = {"teams": {}, "goalkeepers": {}, "warnings": []}
    for side, opponent in (("home", "away"), ("away", "home")):
        goals = _number(score.get(side)) or 0
        sot = _number(on_target.get(side)) or 0
        off = _number(off_target.get(side))
        recorded = _number(shots.get(side))
        if recorded is None and off is not None: recorded = sot + off
        consistent = sot >= goals
        output["teams"][side] = {
            "goals": goals, "recorded_shots": recorded, "shots_on_target": sot,
            "shots_off_target": off,
            "shot_accuracy": _rate(sot, recorded) if recorded is not None else None,
            "goal_conversion_per_recorded_shot": _rate(goals, recorded) if recorded is not None else None,
            "goal_conversion_per_shot_on_target": _rate(goals, sot) if consistent else None,
            "sample_reliable": bool(recorded is not None and recorded >= 5 and sot >= 3),
            "data_consistent": consistent,
        }
        saves = max(0.0, sot - goals) if consistent else None
        output["goalkeepers"][opponent] = {
            "shots_on_target_faced": sot, "goals_conceded": goals, "saves": saves,
            "save_rate": _rate(saves, sot) if saves is not None else None,
            "sample_reliable": sot >= 3, "data_consistent": consistent,
        }
        if not consistent:
            output["warnings"].append(f"{side}进球数大于射正数，可能含乌龙球或数据源不同步")
        elif sot < 3:
            output["warnings"].append(f"{opponent}门将仅面对{sot:.0f}次射正，扑救率样本不足")
    output["definitions"] = {
        "recorded_shots": "当前接口射正+射偏；不含无法识别的封堵射门",
        "shot_accuracy": "射正/当前可记录射门",
        "goal_conversion_per_recorded_shot": "进球/当前可记录射门",
        "goal_conversion_per_shot_on_target": "进球/射正",
        "save_rate": "(面对射正-失球)/面对射正；不是PSxG校正扑救表现",
    }
    return output

def extract_interface_features(candidate: dict[str, Any]) -> dict[str, Any]:
    trends = _dict(candidate.get("recent_trends"))
    history = _dict(trends.get("historical_analysis"))
    recent = _dict(history.get("recent_matches"))
    standings = _dict(history.get("league_standings"))
    distribution = _dict(history.get("goal_distribution"))
    trend_summary = _dict(history.get("trend_summary"))
    lineups = _dict(candidate.get("lineups"))
    raw_lineup = _dict(lineups.get("raw")) or lineups
    evidence: list[str] = []
    risks: list[str] = []

    recent_goals: list[float] = []
    recent_strength: dict[str, float] = {}
    for side in ("home", "away"):
        rows = [_dict(row) for row in _list(recent.get(side))[:10]]
        recent_goals.extend(value for value in (_number(row.get("goals")) for row in rows) if value is not None)
        if rows:
            wins = sum(str(row.get("result")) in {"胜", "赢", "win"} for row in rows)
            losses = sum(str(row.get("result")) in {"负", "输", "loss"} for row in rows)
            recent_strength[side] = (wins - losses) / len(rows)
    recent_goal_average = _average(recent_goals)
    if recent_goal_average is not None:
        evidence.append(f"雷速双方近期比赛平均总进球{recent_goal_average:.2f}")
    standing_strength: dict[str, float] = {}
    for side, key in (("home", "home_team"), ("away", "away_team")):
        total = _dict(_dict(standings.get(key)).get("total"))
        games, points = _number(total.get("total")), _number(total.get("points"))
        if games and points is not None: standing_strength[side] = points / games
    if standing_strength:
        evidence.append("雷速联赛积分/场均积分已结构化，等待历史校准")

    h2h_goals: list[float] = []
    h2h = [_dict(row) for row in _list(history.get("head_to_head"))[:10]]
    for row in h2h:
        home_scores, away_scores = row.get("home_scores"), row.get("away_scores")
        if isinstance(home_scores, list) and isinstance(away_scores, list) and home_scores and away_scores:
            home_goal, away_goal = _number(home_scores[0]), _number(away_scores[0])
            if home_goal is not None and away_goal is not None: h2h_goals.append(home_goal + away_goal)
    h2h_goal_average = _average(h2h_goals)
    if h2h_goal_average is not None:
        evidence.append(f"近{len(h2h_goals)}次交锋平均总进球{h2h_goal_average:.2f}")

    big_ratios: list[float] = []
    for side in ("home", "away"):
        table = _list(_dict(trend_summary.get(side)).get("table"))
        if table:
            ratio = _number(str(_dict(table[0]).get("big_ratio", "")).rstrip("%"))
            if ratio is not None: big_ratios.append(ratio / 100)
    big_ratio = _average(big_ratios)
    if big_ratio is not None:
        evidence.append(f"雷速历史大球率均值{big_ratio:.0%}")

    late_goals = 0.0
    for side in ("home", "away"):
        for bucket in _list(_dict(_dict(distribution.get(side)).get("all")).get("scored")):
            if isinstance(bucket, list) and len(bucket) >= 4 and (_number(bucket[2]) or 0) >= 61:
                late_goals += _number(bucket[0]) or 0
    if distribution:
        evidence.append(f"进球时段分布已计入，61分钟后样本进球{late_goals:.0f}")

    future_schedule = _dict(history.get("future_schedule"))
    schedule_count = sum(len(_list(value)) for value in future_schedule.values())
    if schedule_count:
        risks.append(f"未来赛程共{schedule_count}场，需考虑轮换与体能")
    injuries = len(_list(raw_lineup.get("home_injuries"))) + len(_list(raw_lineup.get("away_injuries")))
    if lineups.get("available"):
        evidence.append("正式阵容、阵型与教练信息已结构化，等待历史校准")
    if injuries:
        risks.append(f"雷速阵容记录伤停{injuries}人")
    context_available = bool(history.get("analysis_match_context"))

    coverage = {
        "recent_matches": bool(recent), "head_to_head": bool(h2h),
        "league_standings": bool(standings), "goal_distribution": bool(distribution),
        "trend_summary": bool(trend_summary), "future_schedule": bool(future_schedule),
        "lineup": bool(lineups), "analysis_match_context": context_available,
    }
    return {
        "calibration_status": "descriptive_only_not_scored",
        "coverage": coverage,
        "descriptive": {
            "recent_goal_average": recent_goal_average,
            "recent_result_balance": recent_strength,
            "standing_points_per_game": standing_strength,
            "head_to_head_goal_average": h2h_goal_average,
            "historical_big_ratio": big_ratio,
            "late_goal_count": late_goals if distribution else None,
            "future_schedule_count": schedule_count,
            "injury_count": injuries,
        },
        "evidence": evidence,
        "risks": risks,
    }

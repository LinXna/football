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

    # Quantitative Poisson prior calculation based on recent form, standings, and H2H
    home_standing_ppg = standing_strength.get("home", 1.35)
    away_standing_ppg = standing_strength.get("away", 1.15)
    standing_diff = home_standing_ppg - away_standing_ppg

    # Baseline goal expectancy
    base_h = 1.45 + (standing_diff * 0.25) + (recent_strength.get("home", 0.0) * 0.3)
    base_a = 1.15 - (standing_diff * 0.20) + (recent_strength.get("away", 0.0) * 0.25)
    if h2h_goal_average is not None and len(h2h_goals) >= 2:
        h2h_weight = 0.30
        h2h_target = h2h_goal_average / 2.0
        base_h = base_h * (1.0 - h2h_weight) + h2h_target * h2h_weight
        base_a = base_a * (1.0 - h2h_weight) + h2h_target * h2h_weight

    base_h = round(max(0.4, min(3.8, base_h)), 2)
    base_a = round(max(0.3, min(3.2, base_a)), 2)
    lambda_total = round(base_h + base_a, 2)

    quantitative_prior = {
        "lambda_home_prior": base_h,
        "lambda_away_prior": base_a,
        "lambda_total_prior": lambda_total,
        "projected_baseline_margin": round(base_h - base_a, 2),
        "home_standing_ppg": home_standing_ppg,
        "away_standing_ppg": away_standing_ppg,
        "injury_count": injuries,
    }

    # Evaluate 8 Grand Pillars Tactical Physics Matrix
    tactical_matrix = calculate_tactical_physics_matrix(candidate, {
        "standing_diff": standing_diff,
        "home_standing_ppg": home_standing_ppg,
        "away_standing_ppg": away_standing_ppg,
        "recent_strength": recent_strength,
        "recent_goal_avg": recent_goal_average,
        "h2h_goal_avg": h2h_goal_average,
        "injuries": injuries,
        "lambda_total_prior": lambda_total,
    })
    evidence.extend(tactical_matrix.get("evidence", []))
    risks.extend(tactical_matrix.get("risks", []))

    return {
        "calibration_status": "descriptive_only_not_scored",
        "quantitative_prior": quantitative_prior,
        "tactical_physics_matrix": tactical_matrix,
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


def calculate_tactical_physics_matrix(candidate: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """
    8 Grand Pillars of Tactical Physics Synthesis (Synchronized with TS Advanced Engines).
    Returns bounded normalized multipliers (0.75x ~ 1.30x) and detailed evidence.
    """
    evidence: list[str] = []
    risks: list[str] = []

    match = _dict(candidate.get("match"))
    source = _dict(candidate.get("market_source"))
    stats = _dict(candidate.get("live_statistics")) or _dict(match.get("stats"))
    incidents = _list(candidate.get("incidents")) or _list(candidate.get("focused_incidents", {}).get("red_cards"))
    lineups = _dict(candidate.get("lineups"))
    weather = _dict(candidate.get("weather"))
    ref_odds = _dict(candidate.get("reference_odds"))
    minute = _number(candidate.get("minute")) or _number(match.get("minute")) or 0.0
    score = _dict(candidate.get("score")) or _dict(match.get("score"))
    home_g = _number(score.get("home")) or 0.0
    away_g = _number(score.get("away")) or 0.0
    goal_diff = home_g - away_g

    # -------------------------------------------------------------
    # Pillar 1: Formations & Positional Absence Mechanics
    # -------------------------------------------------------------
    home_injuries = _list(_dict(lineups.get("raw")).get("home_injuries")) or _list(lineups.get("home_injuries"))
    away_injuries = _list(_dict(lineups.get("raw")).get("away_injuries")) or _list(lineups.get("away_injuries"))
    
    home_gk_missing = any("门将" in str(inj.get("position", "")) or "gk" in str(inj.get("position", "")).lower() for inj in home_injuries if isinstance(inj, dict))
    away_gk_missing = any("门将" in str(inj.get("position", "")) or "gk" in str(inj.get("position", "")).lower() for inj in away_injuries if isinstance(inj, dict))
    
    p1_home_att_mod = 1.0 - (0.04 * min(len(home_injuries), 3))
    p1_away_att_mod = 1.0 - (0.04 * min(len(away_injuries), 3))
    p1_home_def_leak = 1.0 + (0.15 if home_gk_missing else 0.0) + (0.03 * min(len(home_injuries), 4))
    p1_away_def_leak = 1.0 + (0.15 if away_gk_missing else 0.0) + (0.03 * min(len(away_injuries), 4))
    
    if home_gk_missing or away_gk_missing:
        side_txt = "主队" if home_gk_missing else "客队"
        risks.append(f"【Pillar 1 阵容防线真空】{side_txt}主力门将缺阵，防守失误率与丢球系数上调+15%")

    # -------------------------------------------------------------
    # Pillar 2: Game-State Momentum & Psychology (Rage Surge & Collapse)
    # -------------------------------------------------------------
    p2_home_surge = 1.0
    p2_away_surge = 1.0
    p2_total_pace = 1.0

    # 1) Favorite HT Rage Surge (Strong team down at HT: 45'-60' surge)
    standing_diff = context.get("standing_diff", 0.0)
    home_poss = _number(_dict(stats.get("possession")).get("home")) or 50.0
    if 45 <= minute <= 65:
        if standing_diff >= 0.40 and goal_diff <= -1 and home_poss >= 55.0:
            p2_home_surge = 1.20
            p2_total_pace = 1.15
            evidence.append("【Pillar 2 豪门落后暴怒反扑】强队主场落后进入下半场狂攻，进攻强度系数激活1.20x加权")
        elif standing_diff <= -0.40 and goal_diff >= 1:
            p2_away_surge = 1.20
            p2_total_pace = 1.15
            evidence.append("【Pillar 2 强客落后反扑】强队客场落后提速，客队追分进攻期望激活1.20x加权")

    # 2) 2-Goal Deficit Collapse (Weak team down by 2: collapse risk)
    if goal_diff >= 2 and standing_diff >= 0.20:
        p2_away_surge *= 0.85
        p1_away_def_leak *= 1.25
        p2_total_pace *= 1.12
        evidence.append("【Pillar 2 两球落后雪崩模型】客队两球落后防线面临心理瓦解，失球期望率扩大1.25x")
    elif goal_diff <= -2 and standing_diff <= -0.20:
        p2_home_surge *= 0.85
        p1_home_def_leak *= 1.25
        p2_total_pace *= 1.12
        evidence.append("【Pillar 2 两球落后雪崩模型】主队大比分落后心理防线受创，失球期望率扩大1.25x")

    # -------------------------------------------------------------
    # Pillar 3: Referee Discipline & Tactical Foul Drag
    # -------------------------------------------------------------
    p3_tempo_drag = 1.0
    fouls = _dict(stats.get("fouls"))
    home_f = _number(fouls.get("home")) or 0.0
    away_f = _number(fouls.get("away")) or 0.0
    total_fouls = home_f + away_f
    if minute >= 30 and (total_fouls / max(minute, 1.0) * 90.0) >= 28.0:
        p3_tempo_drag = 0.90
        evidence.append(f"【Pillar 3 战术犯规降速】双方累计犯规{total_fouls:.0f}次(推算全场超28次)，比赛节奏被切割，大球期望施加0.90x阻尼")

    # -------------------------------------------------------------
    # Pillar 4: Corner Squeeze & Set-Piece Dynamics
    # -------------------------------------------------------------
    p4_corner_boost = 1.0
    corners = _dict(stats.get("corners")) or _dict(stats.get("corner_kicks"))
    home_c = _number(corners.get("home")) or 0.0
    away_c = _number(corners.get("away")) or 0.0
    total_c = home_c + away_c
    if minute >= 20:
        corner_velocity = (total_c / minute) * 10.0
        if corner_velocity >= 1.4:
            p4_corner_boost = 1.12
            evidence.append(f"【Pillar 4 禁区高压挤压】每10分钟产出{corner_velocity:.1f}个角球，边路连续攻门高压，进球期望上调1.12x")

    # -------------------------------------------------------------
    # Pillar 5: Non-Linear Fatigue & Substitution Acceleration
    # -------------------------------------------------------------
    p5_fatigue_mod = 1.0
    if 56 <= minute <= 75:
        p5_fatigue_mod = 1.10 # Sub fresh legs surge
    elif minute >= 76:
        p5_fatigue_mod = 1.18 # Defensive collapse variance

    # -------------------------------------------------------------
    # Pillar 6: Microstructure & Odds Steam Divergence
    # -------------------------------------------------------------
    p6_market_bias = 0.0
    # Euro-Asian parity check if available
    curr_ref = _dict(ref_odds.get("current"))
    total_ref = _dict(curr_ref.get("total_goals"))
    ref_line = _number(total_ref.get("line"))
    if ref_line is not None and context.get("lambda_total_prior"):
        gap = ref_line - context["lambda_total_prior"]
        if abs(gap) >= 0.5:
            p6_market_bias = 0.05 if gap > 0 else -0.05
            risks.append(f"【Pillar 6 欧亚盘口偏离】机构即时总进球线与基本面先验存在{gap:+.2f}球偏离")

    # -------------------------------------------------------------
    # Pillar 7: Strategic Motivation & Relegation Urgency
    # -------------------------------------------------------------
    p7_home_motive = 1.0
    p7_away_motive = 1.0
    home_ppg = context.get("home_standing_ppg", 1.35)
    away_ppg = context.get("away_standing_ppg", 1.15)
    # Relegation desperation
    if home_ppg <= 0.85:
        p7_home_motive = 1.10
        evidence.append("【Pillar 7 保级抢分死战】主队深陷保级区战意拉满，主场逼抢动力上调1.10x")
    if away_ppg <= 0.85:
        p7_away_motive = 1.10
        evidence.append("【Pillar 7 保级抢分死战】客队深陷保级区，抗受让防守韧性上调1.10x")

    # -------------------------------------------------------------
    # Pillar 8: Pitch Environment & Extreme Weather Physics
    # -------------------------------------------------------------
    p8_env_damping = 1.0
    weather_text = " ".join(_list(weather.get("text"))).lower()
    if any(k in weather_text for k in ("暴雨", "大雨", "rain", "雪", "snow", "积水")):
        p8_env_damping = 0.88
        risks.append("【Pillar 8 恶劣雨雪天气阻尼】场地积水严重影响球速与地面配合渗透，总进球期望乘数0.88x")

    # -------------------------------------------------------------
    # Unified Bounded Multiplier Synthesis (Triple Convergence Guard)
    # -------------------------------------------------------------
    # Home attack multiplier
    alpha_home = p1_home_att_mod * p2_home_surge * p7_home_motive * p1_away_def_leak
    # Away attack multiplier
    alpha_away = p1_away_att_mod * p2_away_surge * p7_away_motive * p1_home_def_leak
    # Total match tempo multiplier
    beta_tempo = p2_total_pace * p3_tempo_drag * p4_corner_boost * p5_fatigue_mod * p8_env_damping

    # Hard Clamping to [0.75, 1.30] to prevent divergence
    alpha_home = round(max(0.75, min(1.30, alpha_home)), 3)
    alpha_away = round(max(0.75, min(1.30, alpha_away)), 3)
    beta_tempo = round(max(0.75, min(1.30, beta_tempo)), 3)

    return {
        "alpha_home_attack": alpha_home,
        "alpha_away_attack": alpha_away,
        "beta_match_tempo": beta_tempo,
        "gamma_market_bias": p6_market_bias,
        "evidence": evidence,
        "risks": risks,
    }


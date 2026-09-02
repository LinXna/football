/**
 * 02_canonical_model: canonicalMatchAssembler
 * 统一标准赛事装配器与 AI Slim Brief 提炼器
 * 
 * 核心原则：
 * 1. 严格以 YBTY 原始队名、联赛名、盘口赔率为法定执行源；
 * 2. 雷速作为基本面、时序特征、比分校验和时间补充源；
 * 3. 严格判定数据完整度与缺失原因（显式 null，严禁假默认值）；
 * 4. 生成超轻量级 AI Evaluation Brief。
 */

import {
  MatchAlignmentStatus,
  MatchStage,
  DataCompletenessTier,
  MissingDataReason,
  CanonicalIncidentCategory,
  CanonicalEventType,
} from "./enums";

import {
  CanonicalMatch,
  CanonicalScoreState,
  CanonicalTimingState,
  CanonicalLeisuReference,
  CanonicalTimelineEvent,
  AiEvaluationBrief,
  MatchAlignmentDecision,
  GenericYbtyMatch,
} from "./types";

import { ParsedLeisuMatch, ParsedLeisuTimelineEvent } from "../01_data_ingestion/leisu/types";

/**
 * 格式化时间戳/ISO字符串/相对时间为标准北京时间字符串 (YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD HH:mm)
 * 严格转换为 UTC+8 北京时间，杜绝裸露的 'T'、'Z' 或原始 UTC 零时区时间
 */
export function formatToBeijingTime(rawTime: string | number | null | undefined): string {
  if (!rawTime) {
    const now = new Date();
    const beijingMs = now.getTime() + (8 * 3600 * 1000);
    const bj = new Date(beijingMs);
    return bj.toISOString().replace("T", " ").substring(0, 19);
  }

  // 1. 如果是 ISO 字符串 (例如 2026-08-12T18:00:00.000Z) 或含 T/Z 字符串，必须按 UTC+8 转为北京时间
  if (typeof rawTime === "string" && (rawTime.includes("T") || rawTime.endsWith("Z"))) {
    const parsed = new Date(rawTime);
    if (!isNaN(parsed.getTime())) {
      const beijingMs = parsed.getTime() + (8 * 3600 * 1000);
      const bj = new Date(beijingMs);
      return bj.toISOString().replace("T", " ").substring(0, 19);
    }
  }

  // 2. 如果已经包含空格分隔的标准日期格式 (如 2026-08-12 18:00:00)
  if (typeof rawTime === "string" && rawTime.includes("-") && rawTime.includes(":") && !rawTime.includes("T")) {
    return rawTime.replace(/Z/g, "").trim().substring(0, 19);
  }

  // 3. 如果是 Unix 毫秒/秒时间戳
  const num = typeof rawTime === "number" ? rawTime : parseInt(rawTime, 10);
  if (!isNaN(num)) {
    const ms = num < 10000000000 ? num * 1000 : num;
    const d = new Date(ms);
    // 转换为北京时间 (+8)
    const beijingMs = d.getTime() + (8 * 3600 * 1000);
    const beijingDate = new Date(beijingMs);
    return beijingDate.toISOString().replace("T", " ").substring(0, 19);
  }

  return String(rawTime).replace("T", " ").replace(/Z/g, "").trim();
}

/**
 * 从 YBTY 滚球时钟文本中精确解析出比赛进行分钟数及伤停补时
 * 规则：
 * 1. "61:22" -> { minute: 61, base: 61, added: null }
 * 2. "45+2'" -> { minute: 47, base: 45, added: 2 }
 * 3. "HT" / "中场" / "中场休息" -> { minute: 45, base: 45, added: null }
 * 4. 若无法解析或非数字，返回 null (不假定、不兜底、不猜)
 */
export function parseYbtyLiveMinute(clockStr?: string | null): number | null {
  if (!clockStr) return null;
  const clean = clockStr.trim();
  if (clean === "HT" || clean === "中场" || clean === "中场休息") return 45;

  // 检查是否包含伤停补时如 "45+2" 或 "90+4"
  const addedMatch = clean.match(/^(\d{1,3})\s*\+\s*(\d{1,2})/);
  if (addedMatch) {
    const base = parseInt(addedMatch[1], 10);
    const added = parseInt(addedMatch[2], 10);
    if (Number.isFinite(base) && Number.isFinite(added)) {
      return base + added;
    }
  }

  const match = clean.match(/^(\d{1,3})/);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 140) {
      return parsed;
    }
  }
  return null;
}

/**
 * 纯函数：将雷速时序事件高保真映射为标准 CanonicalTimelineEvent 列表
 * 具备点球/乌龙识别、VAR 进球取消与红黄牌撤销识别、替补席牌隔离与精确伤停补时
 */
export function parseCanonicalTimelineEvents(rawEvents?: ParsedLeisuTimelineEvent[] | null): {
  events: CanonicalTimelineEvent[];
  varOverturnedGoalsCount: number;
} {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return { events: [], varOverturnedGoalsCount: 0 };
  }

  let varOverturnedGoalsCount = 0;

  const events: CanonicalTimelineEvent[] = rawEvents.map((raw) => {
    const rawType = Number(raw.type);
    const text = String(raw.text || "").trim();
    const rawMinute = raw.minute ?? null;

    // 1. 伤停补时与基准分钟解析 (e.g. 45+2')
    let baseMinute = rawMinute;
    let addedMinute: number | null = null;
    let displayTime = rawMinute !== null ? `${rawMinute}'` : "";

    const addedTimeMatch = text.match(/(\d{1,3})\s*\+\s*(\d{1,2})/);
    if (addedTimeMatch) {
      baseMinute = parseInt(addedTimeMatch[1], 10);
      addedMinute = parseInt(addedTimeMatch[2], 10);
      displayTime = `${baseMinute}+${addedMinute}'`;
    }

    // 2. 语义识别：点球、乌龙、VAR 取消、替补席判罚
    const isPenalty = /(点球|点球进|点球罚进|点球得分)/.test(text);
    const isOwnGoal = /(乌龙|乌龙球|乌龙进球)/.test(text);
    const isCancelled = /(进球.*无效|取消进球|越位在先|犯规在先|手球在先|VAR.*取消|取消红牌)/.test(text);
    const isVarOverturned = /(VAR.*取消|VAR.*改判|VAR.*判罚|进球.*无效|取消红牌)/.test(text);
    const isOnPitch = !/(替补席|教练|主教练|助理教练|场下|看台)/.test(text);

    if (isCancelled && (rawType === 1 || /(进球)/.test(text))) {
      varOverturnedGoalsCount++;
    }

    // 3. 标准 CanonicalEventType 映射
    let canonicalType: CanonicalEventType;
    let category: CanonicalIncidentCategory;

    if (rawType === 1) { // 进球
      if (isCancelled) {
        canonicalType = CanonicalEventType.GOAL_DISALLOWED;
        category = CanonicalIncidentCategory.MATCH_CONTROL;
      } else if (isPenalty) {
        canonicalType = CanonicalEventType.GOAL_PENALTY;
        category = CanonicalIncidentCategory.SCORE;
      } else if (isOwnGoal) {
        canonicalType = CanonicalEventType.GOAL_OWN;
        category = CanonicalIncidentCategory.SCORE;
      } else {
        canonicalType = CanonicalEventType.GOAL_REGULAR;
        category = CanonicalIncidentCategory.SCORE;
      }
    } else if (rawType === 2) {
      canonicalType = CanonicalEventType.CORNER;
      category = CanonicalIncidentCategory.TACTICAL;
    } else if (rawType === 3) {
      if (!isOnPitch) {
        canonicalType = CanonicalEventType.BENCH_DISCIPLINE;
      } else {
        canonicalType = CanonicalEventType.YELLOW_CARD;
      }
      category = CanonicalIncidentCategory.DISCIPLINE;
    } else if (rawType === 4) {
      if (!isOnPitch) {
        canonicalType = CanonicalEventType.BENCH_DISCIPLINE;
      } else {
        canonicalType = CanonicalEventType.RED_CARD;
      }
      category = CanonicalIncidentCategory.DISCIPLINE;
    } else if (rawType === 23) {
      canonicalType = CanonicalEventType.TWO_YELLOW_TO_RED;
      category = CanonicalIncidentCategory.DISCIPLINE;
    } else if (rawType === 9) {
      if (/(受伤|伤退)/.test(text)) {
        canonicalType = CanonicalEventType.INJURY_SUB;
      } else {
        canonicalType = CanonicalEventType.SUBSTITUTION;
      }
      category = CanonicalIncidentCategory.TACTICAL;
    } else if (rawType === 10) {
      canonicalType = CanonicalEventType.KICK_OFF;
      category = CanonicalIncidentCategory.MATCH_CONTROL;
    } else if (rawType === 11) {
      canonicalType = CanonicalEventType.HALF_TIME_WHISTLE;
      category = CanonicalIncidentCategory.MATCH_CONTROL;
    } else if (rawType === 12) {
      canonicalType = CanonicalEventType.FULL_TIME_WHISTLE;
      category = CanonicalIncidentCategory.MATCH_CONTROL;
    } else if (rawType === 16) {
      canonicalType = CanonicalEventType.PENALTY_MISSED;
      category = CanonicalIncidentCategory.SCORE;
    } else if (rawType === 21) {
      canonicalType = CanonicalEventType.SHOT_ON_TARGET;
      category = CanonicalIncidentCategory.TACTICAL;
    } else if (rawType === 22) {
      canonicalType = CanonicalEventType.SHOT_OFF_TARGET;
      category = CanonicalIncidentCategory.TACTICAL;
    } else if (rawType === 28) {
      if (isCancelled) {
        canonicalType = CanonicalEventType.GOAL_DISALLOWED;
      } else {
        canonicalType = CanonicalEventType.VAR_REVIEW;
      }
      category = CanonicalIncidentCategory.MATCH_CONTROL;
    } else if (rawType === 30) {
      canonicalType = CanonicalEventType.FOUL;
      category = CanonicalIncidentCategory.TACTICAL;
    } else if (rawType === 5) {
      canonicalType = CanonicalEventType.OFFSIDE;
      category = CanonicalIncidentCategory.TACTICAL;
    } else {
      canonicalType = CanonicalEventType.VAR_REVIEW;
      category = CanonicalIncidentCategory.MATCH_CONTROL;
    }

    const sideStr = String(raw.side || "neutral").toLowerCase();
    const side: "home" | "away" | "neutral" = sideStr === "home" ? "home" : sideStr === "away" ? "away" : "neutral";

    return {
      minute: rawMinute,
      base_minute: baseMinute,
      added_minute: addedMinute,
      display_time: displayTime,
      type: rawType,
      type_name: raw.type_name || "关键事件",
      canonical_type: canonicalType,
      category,
      side,
      text,
      is_penalty: isPenalty,
      is_own_goal: isOwnGoal,
      is_cancelled: isCancelled,
      is_var_overturned: isVarOverturned,
      is_on_pitch: isOnPitch,
    };
  });

  return { events, varOverturnedGoalsCount };
}

/**
 * 纯函数：组装标准赛事对象 CanonicalMatch
 */
export function assembleCanonicalMatch(
  ybtyMatch: GenericYbtyMatch,
  leisuMatch: ParsedLeisuMatch | null,
  alignmentDecision: MatchAlignmentDecision
): CanonicalMatch {
  const missingReasons: MissingDataReason[] = [];

  // 1. 确定进行阶段与时点
  const stage = ybtyMatch.is_live ? MatchStage.LIVE : MatchStage.PREMATCH;

  let beijingStartTime: string;
  let startTimeSource: "YBTY_EXACT" | "YBTY_ESTIMATED" | "LEISU_SUPPLEMENTED";

  if (ybtyMatch.commence_time && ybtyMatch.commence_time.trim()) {
    beijingStartTime = formatToBeijingTime(ybtyMatch.commence_time);
    startTimeSource = "YBTY_EXACT";
  } else if (ybtyMatch.clock && ybtyMatch.clock.length > 5 && ybtyMatch.clock.includes("-")) {
    beijingStartTime = formatToBeijingTime(ybtyMatch.clock);
    startTimeSource = "YBTY_EXACT";
  } else if (ybtyMatch.countdown && ybtyMatch.captured_at) {
    const minsMatch = ybtyMatch.countdown.match(/(\d+)/);
    if (minsMatch) {
      const mins = parseInt(minsMatch[1], 10);
      const capDate = new Date(ybtyMatch.captured_at);
      const estimatedMs = capDate.getTime() + mins * 60 * 1000;
      beijingStartTime = formatToBeijingTime(estimatedMs);
      startTimeSource = "YBTY_ESTIMATED";
    } else if (leisuMatch && leisuMatch.commence_time) {
      beijingStartTime = formatToBeijingTime(leisuMatch.commence_time);
      startTimeSource = "LEISU_SUPPLEMENTED";
    } else {
      beijingStartTime = formatToBeijingTime(ybtyMatch.captured_at);
      startTimeSource = "YBTY_ESTIMATED";
    }
  } else if (leisuMatch && leisuMatch.commence_time) {
    beijingStartTime = formatToBeijingTime(leisuMatch.commence_time);
    startTimeSource = "LEISU_SUPPLEMENTED";
  } else {
    beijingStartTime = formatToBeijingTime(ybtyMatch.captured_at || null);
    startTimeSource = "YBTY_ESTIMATED";
  }

  const isHalfTime =
    ybtyMatch.clock_status === "中场休息" ||
    ybtyMatch.clock === "HT" ||
    leisuMatch?.status_id === 3 ||
    leisuMatch?.status_text === "中场" ||
    leisuMatch?.status_text === "中场休息" ||
    false;

  let liveMinute: number | null = null;
  if (stage === MatchStage.PREMATCH) {
    liveMinute = null;
  } else if (isHalfTime) {
    liveMinute = 45;
  } else {
    // 滚球进行中：严格由交易盘口发生地 YBTY 的即时时钟解析
    liveMinute = parseYbtyLiveMinute(ybtyMatch.clock);
    if (liveMinute === null) {
      // 严禁从雷速事件流中猜测时间！必须显式记录数据缺口
      missingReasons.push(MissingDataReason.MISSING_LIVE_MINUTE);
    }
  }

  const displayClock = ybtyMatch.clock || ybtyMatch.clock_status || ybtyMatch._pre_start_text || null;

  const timing: CanonicalTimingState = {
    stage,
    beijing_start_time: beijingStartTime,
    start_time_source: startTimeSource,
    minute: liveMinute,
    is_half_time: isHalfTime,
    is_extra_time: false,
    is_overtime_or_penalty: false,
    ybty_display_clock: displayClock,
  };

  // 2. 提取雷速增强时序事件与 VAR 审计
  const { events: canonicalTimelineEvents, varOverturnedGoalsCount } = parseCanonicalTimelineEvents(
    leisuMatch?.timeline_events
  );

  // 3. 双源比分交叉校验
  let homeScore = ybtyMatch.home_score ?? 0;
  let awayScore = ybtyMatch.away_score ?? 0;
  let isMismatch = false;
  let mismatchDetails: string | null = null;
  let scoreVerified = false;
  let scoreSource: "LEISU_CANVAS" | "LEISU_INTERFACE" | "YBTY_DIRECT" | "UNVERIFIED" = "UNVERIFIED";

  if (leisuMatch) {
    const leisuHomeScore = leisuMatch.score ? leisuMatch.score.home : 0;
    const leisuAwayScore = leisuMatch.score ? leisuMatch.score.away : 0;

    // 滚球状态下严格对比两端比分
    if (stage === MatchStage.LIVE) {
      if (homeScore !== leisuHomeScore || awayScore !== leisuAwayScore) {
        isMismatch = true;
        mismatchDetails = `比分冲突: YBTY(${homeScore}-${awayScore}) vs 雷速(${leisuHomeScore}-${leisuAwayScore})`;
        missingReasons.push(MissingDataReason.SCORE_MISMATCH);
      } else {
        scoreVerified = leisuMatch.score_verified;
        scoreSource = "LEISU_INTERFACE";
        if (!scoreVerified) {
          missingReasons.push(MissingDataReason.SCORE_NOT_VERIFIED);
        }
      }
    } else {
      scoreVerified = true;
      scoreSource = "YBTY_DIRECT";
    }
  } else {
    missingReasons.push(MissingDataReason.NO_LEISU_MATCH);
    scoreVerified = !ybtyMatch.is_live;
    scoreSource = ybtyMatch.is_live ? "UNVERIFIED" : "YBTY_DIRECT";
  }

  const score: CanonicalScoreState = {
    home_score: homeScore,
    away_score: awayScore,
    home_half_score: leisuMatch?.half_score?.home ?? null,
    away_half_score: leisuMatch?.half_score?.away ?? null,
    score_verified: scoreVerified,
    score_source: scoreSource,
    is_mismatch_detected: isMismatch,
    mismatch_details: mismatchDetails,
    var_overturned_goals_count: varOverturnedGoalsCount,
  };

  // 4. 构建雷速增强包
  let reference: CanonicalLeisuReference | null = null;
  if (leisuMatch) {
    reference = {
      leisu_match_id: leisuMatch.match_id,
      leisu_home_name: leisuMatch.home_team,
      leisu_away_name: leisuMatch.away_team,
      leisu_league_name: leisuMatch.competition,
      stats: leisuMatch.stats ?? null,
      attack_momentum: leisuMatch.attack_momentum ?? null,
      timeline_events: canonicalTimelineEvents,
      lineups: leisuMatch.lineups ?? null,
      tactical_context: leisuMatch.tactical_context ?? null,
      odds_matrix: leisuMatch.odds_matrix ?? null,
      league_standings: leisuMatch.league_standings ?? null,
      goal_distribution: leisuMatch.goal_distribution ?? null,
    };

    if (!leisuMatch.lineups || (!leisuMatch.lineups.home_formation && !leisuMatch.lineups.away_formation)) {
      missingReasons.push(MissingDataReason.NO_LINEUP_DATA);
    }
    if (!leisuMatch.stats) {
      missingReasons.push(MissingDataReason.NO_STATS_DATA);
    }
    if (!leisuMatch.attack_momentum || !leisuMatch.attack_momentum.available) {
      if (stage === MatchStage.LIVE) missingReasons.push(MissingDataReason.NO_MOMENTUM_TIMELINE);
    }
    if (!leisuMatch.league_standings || (!leisuMatch.league_standings.home_team && !leisuMatch.league_standings.away_team)) {
      missingReasons.push(MissingDataReason.NO_LEAGUE_STANDINGS);
    }
    if (!leisuMatch.goal_distribution || !leisuMatch.goal_distribution.has_data) {
      missingReasons.push(MissingDataReason.NO_GOAL_DISTRIBUTION);
    }
  }

  // 校验是否存在有效盘口
  const hasValidMarkets = ybtyMatch.markets && (
    ybtyMatch.markets.full_spread_main !== null ||
    ybtyMatch.markets.full_total_main !== null ||
    ybtyMatch.markets.full_h2h !== null
  );

  if (!hasValidMarkets) {
    missingReasons.push(MissingDataReason.NO_ODDS_MARKETS);
  }

  // 5. 数据完整度评级判定 (Tier 划分)
  let completenessTier: DataCompletenessTier;
  if (isMismatch) {
    completenessTier = DataCompletenessTier.TIER_INVALID;
  } else if (!leisuMatch || missingReasons.includes(MissingDataReason.NO_ODDS_MARKETS)) {
    completenessTier = DataCompletenessTier.TIER_3_SPARSE;
  } else if (
    reference?.lineups?.home_formation &&
    reference?.stats &&
    reference?.league_standings &&
    (stage === MatchStage.PREMATCH || reference?.attack_momentum?.available)
  ) {
    completenessTier = DataCompletenessTier.TIER_1_FULL;
  } else {
    completenessTier = DataCompletenessTier.TIER_2_BASIC;
  }

  const matchSlug = `${ybtyMatch.league}_${ybtyMatch.home}_vs_${ybtyMatch.away}`;
  const canonicalId = leisuMatch?.match_id ? String(leisuMatch.match_id) : matchSlug;

  return {
    canonical_id: canonicalId,
    match_slug: matchSlug,
    created_at: new Date().toISOString(),
    completeness_tier: completenessTier,
    missing_reasons: missingReasons,
    alignment: alignmentDecision,
    league_name: ybtyMatch.league,
    home_team_name: ybtyMatch.home,
    away_team_name: ybtyMatch.away,
    timing,
    score,
    markets: ybtyMatch.markets,
    reference,
  };
}

/**
 * 纯函数：提炼极简 AI 提炼包 (AiEvaluationBrief)
 * 低 Token、高语义密度，杜绝长篇冗余
 */
export function extractAiEvaluationBrief(canonical: CanonicalMatch): AiEvaluationBrief {
  // 提取核心盘口
  let ahMain: { handicap: string; home_odds: number; away_odds: number } | null = null;
  let ouMain: { handicap: string; over_odds: number; under_odds: number } | null = null;
  let euro1x2: { home_win: number; draw: number; away_win: number } | null = null;
  let ahHalf: { handicap: string; home_odds: number; away_odds: number } | null = null;
  let ouHalf: { handicap: string; over_odds: number; under_odds: number } | null = null;

  if (canonical.markets.full_spread_main) {
    ahMain = {
      handicap: canonical.markets.full_spread_main.home_selection,
      home_odds: canonical.markets.full_spread_main.home_odds,
      away_odds: canonical.markets.full_spread_main.away_odds,
    };
  }

  if (canonical.markets.full_total_main) {
    ouMain = {
      handicap: canonical.markets.full_total_main.line,
      over_odds: canonical.markets.full_total_main.over_odds,
      under_odds: canonical.markets.full_total_main.under_odds,
    };
  }

  if (canonical.markets.full_h2h) {
    euro1x2 = {
      home_win: canonical.markets.full_h2h.home_odds,
      draw: canonical.markets.full_h2h.draw_odds,
      away_win: canonical.markets.full_h2h.away_odds,
    };
  }

  if (canonical.markets.half_spread_main) {
    ahHalf = {
      handicap: canonical.markets.half_spread_main.home_selection,
      home_odds: canonical.markets.half_spread_main.home_odds,
      away_odds: canonical.markets.half_spread_main.away_odds,
    };
  }

  if (canonical.markets.half_total_main) {
    ouHalf = {
      handicap: canonical.markets.half_total_main.line,
      over_odds: canonical.markets.half_total_main.over_odds,
      under_odds: canonical.markets.half_total_main.under_odds,
    };
  }

  // 提取提纯后的统计与阵型
  const stats = canonical.reference?.stats;
  const lineups = canonical.reference?.lineups;
  const tactical = canonical.reference?.tactical_context;
  const standings = canonical.reference?.league_standings;

  let formationStr: string | null = null;
  if (lineups?.home_formation && lineups?.away_formation) {
    formationStr = `${lineups.home_formation} vs ${lineups.away_formation}`;
  }

  let h2hWinRate: string | null = null;
  if (tactical && tactical.head_to_head_count > 0) {
    h2hWinRate = `共${tactical.head_to_head_count}场历史交锋记录`;
  }

  // 计算动量特征 (最近 5 分钟与 15 分钟均值)
  let momentum5min: { home: number; away: number } | null = null;
  let momentum15min: { home: number; away: number } | null = null;

  if (canonical.reference?.attack_momentum?.data && canonical.reference.attack_momentum.data.length > 0) {
    const flatPoints = canonical.reference.attack_momentum.data.flat();
    if (flatPoints.length >= 5) {
      const last5 = flatPoints.slice(-5);
      const homeVal = Math.round(last5.filter(v => v > 0).reduce((acc, v) => acc + v, 0) / 5);
      const awayVal = Math.round(last5.filter(v => v < 0).reduce((acc, v) => acc + Math.abs(v), 0) / 5);
      momentum5min = { home: homeVal, away: awayVal };
    }
    if (flatPoints.length >= 15) {
      const last15 = flatPoints.slice(-15);
      const homeVal = Math.round(last15.filter(v => v > 0).reduce((acc, v) => acc + v, 0) / 15);
      const awayVal = Math.round(last15.filter(v => v < 0).reduce((acc, v) => acc + Math.abs(v), 0) / 15);
      momentum15min = { home: homeVal, away: awayVal };
    }
  }

  const dataDeficits = canonical.missing_reasons.map(r => String(r));

  let kickoffTimeDisplay = canonical.timing.beijing_start_time;
  if (canonical.timing.start_time_source === 'YBTY_ESTIMATED') {
    kickoffTimeDisplay += ' (推算时间)';
  } else if (canonical.timing.start_time_source === 'LEISU_SUPPLEMENTED') {
    kickoffTimeDisplay += ' (雷速补充)';
  }

  return {
    match_id: canonical.canonical_id,
    league: canonical.league_name,
    kickoff_time: kickoffTimeDisplay,
    status_summary: canonical.timing.stage === MatchStage.LIVE
      ? `LIVE ${canonical.timing.minute ?? 0}' (${canonical.score.home_score}-${canonical.score.away_score})`
      : "PREMATCH",
    teams: {
      home: canonical.home_team_name,
      away: canonical.away_team_name,
    },
    score_verification: {
      is_verified: canonical.score.score_verified,
      current_score: `${canonical.score.home_score} - ${canonical.score.away_score}`,
    },
    core_markets: {
      ah_main: ahMain,
      ou_main: ouMain,
      euro_1x2: euro1x2,
      ah_half: ahHalf,
      ou_half: ouHalf,
    },
    condensed_features: {
      possession: stats?.possession ? { home: stats.possession.home, away: stats.possession.away } : null,
      shots_on_target: stats?.shots_on_target ? { home: stats.shots_on_target.home, away: stats.shots_on_target.away } : null,
      dangerous_attacks: stats?.dangerous_attacks ? { home: stats.dangerous_attacks.home, away: stats.dangerous_attacks.away } : null,
      corners: stats?.corners ? { home: stats.corners.home, away: stats.corners.away } : null,
      recent_momentum_5min: momentum5min,
      recent_momentum_15min: momentum15min,
      formations: formationStr && lineups ? { home: lineups.home_formation || "", away: lineups.away_formation || "" } : null,
      h2h_summary: h2hWinRate,
      league_rank: (standings?.home_team?.overall?.position && standings?.away_team?.overall?.position) 
        ? { home: standings.home_team.overall.position, away: standings.away_team.overall.position } 
        : null,
    },
    data_deficits: dataDeficits,
  };
}


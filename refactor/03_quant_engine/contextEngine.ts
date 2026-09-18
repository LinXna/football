/**
 * @file contextEngine.ts
 * @description Layer 03 M2: 数据时效性衰减、情境清洗、L0熔断判定与先验战力折损计算引擎
 * 
 * 核心职责：
 * 1. L0 级绝对红线数据完整性校验 (Minute, Verified Score, Markets) -> 触发一票否决熔断
 * 2. 历史交锋 (H2H) 时间指数半衰期衰减 (超过 730 天强制归零)
 * 3. 近期战绩 (Recent Form) 主客场同构筛选与赛事性质加权过滤
 * 4. 阵容首发与主力伤停真实战力折损率 (Lineup Impact Score, LIS)
 * 5. 联赛积分榜战意生命周期因子 (Motivation & Urgency Index, MUI)
 * 6. 进球时间段分布最小有效样本检验 (N < 8 触发贝叶斯收缩)
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage } from '../02_canonical_model/enums.js';
import {
  LeisuRawRecentMatch,
  LeisuRawH2HStats,
  ParsedStandingRecord,
  ParsedTeamStanding,
  ParsedTeamGoalDistribution,
  ParsedGoalInterval,
  ParsedPlayer
} from '../01_data_ingestion/leisu/types.js';
import {
  CleanedContextFeatures,
  L0CircuitBreakerResult,
  HistoricalMatchWeight,
  RecentFormContextWeight,
  RecentFormDetailedAnalytics,
  H2HDetailedAnalytics,
  DataDeficitSeverity,
  L0MissingReason,
  Layer03OpId,
  Layer03FeatureId,
  IsoVenueStandingRecord,
  GoalDistributionDNAFeatures,
  TacticalFormationFeatures,
  LineupStatus,
  LineupImpactFeatures
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';
import {
  getAdaptiveLookbackWindow,
  getTeamStrengthProfile,
  resolveTeamTier
} from './globalTierMatrix.js';

/**
 * 校验 L0 级不可缺失要素 (一票否决熔断器)
 * @param match CanonicalMatch 标准赛事
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function checkL0CircuitBreaker(
  match: CanonicalMatch,
  collector?: DeficitCollector,
  tracer?: Tracer
): L0CircuitBreakerResult {
  tracer?.info(
    Layer03OpId.CLEAN_CONTEXT,
    'L0_CHECK',
    'Executing L0 Circuit Breaker validation',
    undefined,
    match.canonical_id
  );

  const reasons: L0MissingReason[] = [];
  const details: string[] = [];

  const isPrematch = match.timing.stage === MatchStage.PREMATCH;

  // 1. 检查比赛进行分钟数 (滚球必须有有效非负分钟)
  if (!isPrematch) {
    if (match.timing.minute === null || match.timing.minute === undefined || match.timing.minute < 0) {
      reasons.push(L0MissingReason.MINUTE_UNDEFINED);
      details.push('Live match missing valid elapsed minute in timing state');
    }
  }

  // 2. 检查客观比分及其校验状态
  if (!isPrematch) {
    if (
      match.score.home_score === null ||
      match.score.home_score === undefined ||
      match.score.away_score === null ||
      match.score.away_score === undefined
    ) {
      reasons.push(L0MissingReason.UNVERIFIED_SCORE);
      details.push('Live match score numbers are null or missing');
    } else if (!match.score.score_verified) {
      reasons.push(L0MissingReason.UNVERIFIED_SCORE);
      details.push('Live match score is not verified via canvas or reliable source');
    }
  }

  // 3. 检查 YBTY 标的盘口与赔率 (至少需要全场让球、全场大小球或全场独赢中的一个完整有效盘口)
  const hasSpread = !!(
    match.markets.full_spread_main &&
    match.markets.full_spread_main.home_odds > 1.0 &&
    match.markets.full_spread_main.away_odds > 1.0
  );
  const hasTotal = !!(
    match.markets.full_total_main &&
    match.markets.full_total_main.over_odds > 1.0 &&
    match.markets.full_total_main.under_odds > 1.0
  );
  const hasH2H = !!(
    match.markets.full_h2h &&
    match.markets.full_h2h.home_odds > 1.0 &&
    match.markets.full_h2h.away_odds > 1.0
  );

  if (!hasSpread && !hasTotal && !hasH2H) {
    reasons.push(L0MissingReason.TARGET_MARKET_MISSING);
    details.push('No valid full_spread_main, full_total_main, or full_h2h markets found in YBTY markets');
  }

  const isTriggered = reasons.length > 0;

  if (isTriggered && collector) {
    collector.record(
      'L0_CIRCUIT_BREAKER_TRIGGERED',
      Layer03OpId.CLEAN_CONTEXT,
      'RC-L0-FUSE',
      `Match ${match.canonical_id} triggered L0 Circuit Breaker: ${reasons.join(', ')}`,
      undefined,
      match.canonical_id
    );
  }

  return Object.freeze({
    is_triggered: isTriggered,
    reasons: reasons,
    details: details
  });
}

/**
 * 计算历史交锋记录的时效性指数衰减、赛事级别、盘口博弈与攻防场面克制
 * 半衰期模型: w = exp(-ln(2) * delta_days / half_life)
 * - half_life = 365 天
 * - delta_days <= 180 天: w ≈ 1.0
 * - delta_days > 730 天 (2年): 强制截断归零 (w = 0.0, is_valid = false)
 */
/**
 * 历史交锋全指标双向客观真实校验门禁 (Full-Metric Two-Way Tactical Integrity Gate)
 * 必须主客双方均有客观真实的攻防记录，均有角球数据，才能判定为有效深层战术对抗样本
 */
export function checkH2HTacticalIntegrity(
  homeStats: LeisuRawH2HStats | null | undefined,
  awayStats: LeisuRawH2HStats | null | undefined,
  cornerHome: number | undefined | null,
  cornerAway: number | undefined | null,
  daysAgo: number
): { isValid: boolean; reason?: string } {
  // 1. 战术时效性门禁：超过 730 天 (2年) 的深层攻防战术失去了人员教练连续性
  if (daysAgo > 730) {
    return { isValid: false, reason: 'EXCEEDS_MAX_TACTICAL_DAYS_730' };
  }
  // 2. 双向 stats 对象必须均存在且非空字典
  if (!homeStats || !awayStats || typeof homeStats !== 'object' || typeof awayStats !== 'object') {
    return { isValid: false, reason: 'MISSING_STATS_OBJECT' };
  }
  if (Object.keys(homeStats).length === 0 || Object.keys(awayStats).length === 0) {
    return { isValid: false, reason: 'EMPTY_STATS_OBJECT' };
  }

  // 3. 双向角球必须客观有效（非-1，且两队之和必须 >= 1）
  if (cornerHome == null || cornerAway == null || cornerHome < 0 || cornerAway < 0) {
    return { isValid: false, reason: 'INVALID_OR_MISSING_CORNERS' };
  }
  if (cornerHome + cornerAway === 0) {
    return { isValid: false, reason: 'ZERO_TOTAL_CORNERS_UNVERIFIED' };
  }

  // 4. 双向危险进攻必须真实客观存在且大于 0
  const daH = homeStats.dangerous_attack;
  const daA = awayStats.dangerous_attack;
  if (daH == null || daA == null || typeof daH !== 'number' || typeof daA !== 'number') {
    return { isValid: false, reason: 'MISSING_DANGEROUS_ATTACK' };
  }
  if (daH <= 0 || daA <= 0) {
    return { isValid: false, reason: 'NON_POSITIVE_DANGEROUS_ATTACK' };
  }

  // 5. 双向常规进攻必须真实客观存在且不低于危险进攻
  const attH = homeStats.attack;
  const attA = awayStats.attack;
  if (attH != null && attA != null) {
    if (attH <= 0 || attA <= 0 || attH < daH || attA < daA) {
      return { isValid: false, reason: 'ILLOGICAL_ATTACK_STATS' };
    }
  }

  // 6. 双向总射门必须客观真实且大于 0，且双方总射门 >= 3
  const shotsH = homeStats.shots;
  const shotsA = awayStats.shots;
  if (shotsH == null || shotsA == null || typeof shotsH !== 'number' || typeof shotsA !== 'number') {
    return { isValid: false, reason: 'MISSING_SHOTS' };
  }
  if (shotsH <= 0 || shotsA <= 0) {
    return { isValid: false, reason: 'NON_POSITIVE_SHOTS' };
  }
  if (shotsH + shotsA < 3) {
    return { isValid: false, reason: 'TOTAL_SHOTS_LESS_THAN_3' };
  }

  // 7. 双向控球率必须客观真实存在且符合守恒定律 (95% ~ 105%)
  const possH = homeStats.ball_possession;
  const possA = awayStats.ball_possession;
  if (possH == null || possA == null || typeof possH !== 'number' || typeof possA !== 'number') {
    return { isValid: false, reason: 'MISSING_BALL_POSSESSION' };
  }
  if (possH <= 0 || possA <= 0 || possH + possA < 95 || possH + possA > 105) {
    return { isValid: false, reason: 'INVALID_POSSESSION_CONSERVATION' };
  }

  return { isValid: true };
}

/**
 * 计算交锋历史时间连续指数衰减权重、赛事级别加权与球风克制指数
 */
export function calculateH2HDecayWeights(
  match: CanonicalMatch,
  halfLifeDays: number = 365,
  currentTimestamp: number = Date.now()
): { weights: HistoricalMatchWeight[]; analytics: H2HDetailedAnalytics } {
  const h2hList = match.reference?.tactical_context?.h2h_raw || [];
  if (h2hList.length === 0) {
    return {
      weights: [],
      analytics: {
        sample_count: 0,
        valid_count: 0,
        tactical_valid_count: 0,
        tactical_metrics_available: false,
        total_decayed_weight: 0,
        tactical_decayed_weight: 0,
        net_goal_differential_weighted: 0,
        historical_h2h_advantage_home: 0,
        historical_under_rate: null,
        historical_avg_corners: null,
        historical_avg_red_cards: null,
        tactical_stylistic_clash_index: 0
      }
    };
  }

  const adaptiveWindow = getAdaptiveLookbackWindow(
    match.league_name || match.reference?.leisu_league_name,
    match.home_team_name,
    match.away_team_name
  );
  const maxValidDays = adaptiveWindow.maxDays;
  const effectiveHalfLife = typeof halfLifeDays === 'number' ? halfLifeDays : adaptiveWindow.halfLifeDays;
  const decayConstant = Math.LN2 / effectiveHalfLife;

  const currentHomeId = match.reference?.home_team_id ?? match.reference?.league_standings?.home_team?.team_id ?? null;
  const currentAwayId = match.reference?.away_team_id ?? match.reference?.league_standings?.away_team?.team_id ?? null;
  const currentLeague = match.league_name || match.reference?.leisu_league_name || '';
  const isCurrentMatchFriendly = /友谊|Friendly|球会友谊/i.test(currentLeague);

  let totalDecayedWeight = 0;
  let weightedNetGoals = 0;
  let validUnderCount = 0;
  let totalRedCards = 0;
  let validCount = 0;

  // 深度战术攻防样本聚合器 (仅限通过全指标双向真实门禁的样本)
  let tacticalDecayedWeight = 0;
  let tacticalValidCount = 0;
  let totalTacticalCorners = 0;
  let totalClashScore = 0;

  // 预判近 365 天内有效样本数，若近 1 年内对战极其稀缺 (<= 1 场)，启动赛会/大赛周期历史样本稀缺度补偿
  const recentH2HCount = h2hList.filter((item) => {
    let matchTime = 0;
    if (typeof item.match_time === 'number' && item.match_time > 0) {
      matchTime = item.match_time > 1e11 ? item.match_time : item.match_time * 1000;
    } else if (item.match_time) {
      const parsed = new Date(String(item.match_time)).getTime();
      if (!isNaN(parsed)) matchTime = parsed;
    }
    const days = matchTime > 0 ? Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24))) : 9999;
    return days <= 365;
  }).length;
  const isH2HScarcity = recentH2HCount <= 1;

  // 自适应多级历史交锋时间窗 (青年队/杯赛/大赛 1460 天，俱乐部常规联赛 730 天)
  const weights: HistoricalMatchWeight[] = h2hList.map((h2h) => {
    let matchTime = 0;
    let dateStr = '';
    if (typeof h2h.match_time === 'number' && h2h.match_time > 0) {
      matchTime = h2h.match_time > 1e11 ? h2h.match_time : h2h.match_time * 1000;
      dateStr = new Date(matchTime).toISOString().slice(0, 10);
    } else if (h2h.match_time) {
      const parsed = new Date(String(h2h.match_time)).getTime();
      if (!isNaN(parsed) && parsed > 0) {
        matchTime = parsed;
        dateStr = String(h2h.match_time).slice(0, 10);
      }
    }

    const hasValidTime = matchTime > 0;
    const daysAgo = hasValidTime ? Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24))) : 9999;
    const isValidTimeWindow = hasValidTime && daysAgo >= 0 && daysAgo <= maxValidDays;

    const homeScores = h2h.home_scores || [];
    const awayScores = h2h.away_scores || [];
    const hasValidScore =
      Number.isInteger(homeScores[0]) && homeScores[0] >= 0 &&
      Number.isInteger(awayScores[0]) && awayScores[0] >= 0;

    const currentHomeName = match.home_team_name;
    const currentAwayName = match.away_team_name;
    const h2hWithNames = h2h as typeof h2h & { home_team_name?: string; away_team_name?: string };
    const h2hHomeName = h2hWithNames.home_team_name;
    const h2hAwayName = h2hWithNames.away_team_name;
    const identityMatched =
      (currentHomeId != null && (h2h.home_team_id === currentHomeId || h2h.away_team_id === currentHomeId)) ||
      (currentAwayId != null && (h2h.home_team_id === currentAwayId || h2h.away_team_id === currentAwayId)) ||
      (Boolean(currentHomeName) && (h2hHomeName === currentHomeName || h2hAwayName === currentHomeName)) ||
      (Boolean(currentAwayName) && (h2hHomeName === currentAwayName || h2hAwayName === currentAwayName));

    let decayWeight = 0.0;
    // 只有在通过自适应前置物理时间隔离门禁、身份匹配、比分有效时才赋予非零指数衰减权重
    const isValid = identityMatched && isValidTimeWindow && hasValidScore;
    if (isValid) {
      decayWeight = Math.exp(-decayConstant * daysAgo);
      // 稀缺度加权补偿：当近 365 天内对战记录极少/为零时，两年或四年周期大赛历史交锋赋予有效保底权重 (>= 0.20)
      if (isH2HScarcity && daysAgo <= maxValidDays) {
        decayWeight = Math.max(decayWeight, 0.20 * Math.exp(- (daysAgo / maxValidDays)));
      }
    }

    const h2hCompName = String(h2h.league_name || (h2h as any).competition_name || (h2h as any).competition || '');
    const isH2HFriendly = /友谊|Friendly|球会友谊/i.test(h2hCompName);

    let compImp = 1.0;
    if (isH2HFriendly) {
      if (!isCurrentMatchFriendly) {
        // 规则 A：若当前分析比赛为正规联赛/正规杯赛，历史样本中的球会友谊赛严格隔离归零
        compImp = 0.0;
      } else {
        // 规则 B：若当前分析比赛本身即球会友谊赛，历史友谊赛样本正常保留 1.0 权重并参与时间衰减
        compImp = 1.0;
      }
    }

    // 方案 1 历史对赛改造：双重锚定校验当前主队在该历史对决中是主场出战还是客场出战
    let isCurrentHomePlayingHome = true;
    if (currentHomeId != null && h2h.home_team_id != null && h2h.home_team_id === currentHomeId) {
      isCurrentHomePlayingHome = true;
    } else if (currentHomeId != null && h2h.away_team_id != null && h2h.away_team_id === currentHomeId) {
      isCurrentHomePlayingHome = false;
    } else if (currentAwayId != null && h2h.away_team_id != null && h2h.away_team_id === currentAwayId) {
      isCurrentHomePlayingHome = true;
    } else if (currentAwayId != null && h2h.home_team_id != null && h2h.home_team_id === currentAwayId) {
      isCurrentHomePlayingHome = false;
    } else if (currentHomeName && h2hHomeName === currentHomeName) {
      isCurrentHomePlayingHome = true;
    } else if (currentHomeName && h2hAwayName === currentHomeName) {
      isCurrentHomePlayingHome = false;
    } else if (currentAwayName && h2hAwayName === currentAwayName) {
      isCurrentHomePlayingHome = true;
    } else if (currentAwayName && h2hHomeName === currentAwayName) {
      isCurrentHomePlayingHome = false;
    }

    const homeGoals = typeof homeScores[0] === 'number' ? homeScores[0] : 0;
    const awayGoals = typeof awayScores[0] === 'number' ? awayScores[0] : 0;
    const halfHomeGoals = typeof homeScores[1] === 'number' ? homeScores[1] : 0;
    const halfAwayGoals = typeof awayScores[1] === 'number' ? awayScores[1] : 0;
    const redHome = typeof homeScores[2] === 'number' ? homeScores[2] : 0;
    const redAway = typeof awayScores[2] === 'number' ? awayScores[2] : 0;
    const cornerHome = typeof homeScores[4] === 'number' ? homeScores[4] : -1;
    const cornerAway = typeof awayScores[4] === 'number' ? awayScores[4] : -1;

    // 当前主队视角的历史净胜球：若是当前主队主场为 (homeGoals - awayGoals)；若是客场为 (awayGoals - homeGoals)
    const netGoalsForCurrentHome = isCurrentHomePlayingHome
      ? (homeGoals - awayGoals)
      : (awayGoals - homeGoals);

    // 解析让球初盘与即时盘
    let ahOpenLine: number | null = null;
    let ahCurrLine: number | null = null;
    if (h2h.opening_odds && h2h.opening_odds[0]) {
      const parts = h2h.opening_odds[0].split(',');
      if (parts.length >= 2) {
        const parsed = parseFloat(parts[1]);
        if (!isNaN(parsed)) ahOpenLine = parsed;
      }
    }
    if (h2h.current_odds && h2h.current_odds[0]) {
      const parts = h2h.current_odds[0].split(',');
      if (parts.length >= 2) {
        const parsed = parseFloat(parts[1]);
        if (!isNaN(parsed)) ahCurrLine = parsed;
      }
    }

    // 执行深层战术全指标双向真实门禁检验
    const invalidReason = !hasValidTime
      ? 'MISSING_MATCH_TIME'
      : daysAgo > maxValidDays
        ? (maxValidDays === 365 ? 'EXCEEDS_MAX_VALID_DAYS_365' : `EXCEEDS_MAX_VALID_DAYS_${maxValidDays}`)
        : !hasValidScore
          ? 'MISSING_MATCH_SCORE'
          : 'INVALID_H2H_SAMPLE';
    const tacticalCheck = isValid
      ? checkH2HTacticalIntegrity(h2h.home_stats, h2h.away_stats, cornerHome, cornerAway, daysAgo)
      : { isValid: false, reason: invalidReason };

    const isTacticalValid = tacticalCheck.isValid;
    let daRatio: number | null = null;
    let shotsRatio: number | null = null;

    if (isValid) {
      const effWeight = decayWeight * compImp;
      totalDecayedWeight += effWeight;
      weightedNetGoals += netGoalsForCurrentHome * effWeight;
      validCount++;

      if (homeGoals + awayGoals <= 2) {
        validUnderCount += effWeight;
      }
      if (redHome >= 0 && redAway >= 0) {
        totalRedCards += (redHome + redAway);
      }

      // 仅当通过全套客观真实攻防门禁时，才计入角球与球风克制
      if (isTacticalValid) {
        tacticalValidCount++;
        tacticalDecayedWeight += effWeight;
        totalTacticalCorners += (cornerHome + cornerAway);

        const homeStats = h2h.home_stats!;
        const awayStats = h2h.away_stats!;
        const daH = homeStats.dangerous_attack as number;
        const daA = awayStats.dangerous_attack as number;
        const shotsH = homeStats.shots as number;
        const shotsA = awayStats.shots as number;

        // 对齐当前主队统治视角：主场出战取 daH/daTot，客场出战取 daA/daTot
        daRatio = isCurrentHomePlayingHome
          ? Number((daH / (daH + daA)).toFixed(3))
          : Number((daA / (daH + daA)).toFixed(3));
        shotsRatio = isCurrentHomePlayingHome
          ? Number((shotsH / (shotsH + shotsA)).toFixed(3))
          : Number((shotsA / (shotsH + shotsA)).toFixed(3));

        // 当前主队球风压制得分: (危攻比 - 0.5) * 1.2 + (射门比 - 0.5) * 0.8
        totalClashScore += ((daRatio - 0.5) * 1.2 + (shotsRatio - 0.5) * 0.8) * effWeight;
      }
    }

    return Object.freeze({
      match_id: String(h2h.match_id || ''),
      date: dateStr,
      days_ago: daysAgo,
      decay_weight: Number(decayWeight.toFixed(4)),
      is_valid: isValid,
      competition_importance: compImp,
      home_goals: homeGoals,
      away_goals: awayGoals,
      half_home_goals: halfHomeGoals,
      half_away_goals: halfAwayGoals,
      red_cards_home: redHome,
      red_cards_away: redAway,
      corners_home: cornerHome,
      corners_away: cornerAway,
      handicap_opening_line: ahOpenLine,
      handicap_current_line: ahCurrLine,
      dangerous_attack_ratio: daRatio,
      shots_ratio: shotsRatio,
      is_tactical_valid: isTacticalValid,
      tactical_invalidation_reason: tacticalCheck.reason
    });
  });

  const netDiffWeighted = totalDecayedWeight > 0 ? Number((weightedNetGoals / totalDecayedWeight).toFixed(3)) : 0;
  const h2hAdvantage = Math.max(-0.20, Math.min(0.20, netDiffWeighted * 0.08));
  const underRate = totalDecayedWeight > 0 ? Number((validUnderCount / totalDecayedWeight).toFixed(3)) : null;
  const avgReds = validCount > 0 ? Number((totalRedCards / validCount).toFixed(2)) : null;

  // 严禁假 0 或假 9.0，仅当具备真实有效战术攻防样本时计算
  const tacticalAvailable = tacticalValidCount >= 1;
  const avgCorners = tacticalAvailable ? Number((totalTacticalCorners / tacticalValidCount).toFixed(1)) : null;
  const clashIndex = (tacticalAvailable && tacticalDecayedWeight > 0)
    ? Math.max(-1.0, Math.min(1.0, Number((totalClashScore / tacticalDecayedWeight).toFixed(3))))
    : 0.0;

  return {
    weights,
    analytics: {
      sample_count: h2hList.length,
      valid_count: validCount,
      tactical_valid_count: tacticalValidCount,
      tactical_metrics_available: tacticalAvailable,
      total_decayed_weight: Number(totalDecayedWeight.toFixed(3)),
      tactical_decayed_weight: Number(tacticalDecayedWeight.toFixed(3)),
      net_goal_differential_weighted: netDiffWeighted,
      historical_h2h_advantage_home: h2hAdvantage,
      historical_under_rate: underRate,
      historical_avg_corners: avgCorners,
      historical_avg_red_cards: avgReds,
      tactical_stylistic_clash_index: clashIndex
    }
  };
}

/**
 * 计算近期战绩时间连续衰减、赛事层级过滤与半场/下半场攻防解耦
 */
export function calculateRecentFormWeights(
  match: CanonicalMatch,
  currentTimestamp: number = Date.now()
): {
  home: RecentFormContextWeight[];
  away: RecentFormContextWeight[];
  home_analytics: RecentFormDetailedAnalytics;
  away_analytics: RecentFormDetailedAnalytics;
} {
  const homeRecent = match.reference?.tactical_context?.home_recent_matches || [];
  const awayRecent = match.reference?.tactical_context?.away_recent_matches || [];

  const evaluateRecentMatches = (
    matches: LeisuRawRecentMatch[],
    targetTeamName: string,
    targetLeisuName: string | undefined,
    targetTeamId: number | null,
    isTargetHome: boolean
  ): { weights: RecentFormContextWeight[]; analytics: RecentFormDetailedAnalytics } => {
    if (matches.length === 0) {
      return {
        weights: [],
        analytics: {
          sample_count: 0,
          valid_count: 0,
          weighted_scored_per_game: 0,
          weighted_conceded_per_game: 0,
          first_half_scored_avg: 0,
          first_half_conceded_avg: 0,
          second_half_scored_avg: 0,
          second_half_conceded_avg: 0,
          slow_starter_index: 0,
          second_half_surge_rate: 0,
          clean_sheet_rate: 0,
          failed_to_score_rate: 0,
          handicap_win_rate: 0,
          over_goals_rate: 0
        }
      };
    }

    const currentLeagueName = match.league_name || match.reference?.leisu_league_name || '';
    const isCurrentMatchFriendly = /友谊|Friendly|球会友谊/i.test(currentLeagueName);
    const adaptiveWindow = getAdaptiveLookbackWindow(currentLeagueName, targetTeamName);
    const isTournamentOrYouth = /U23|U21|U20|U19|杯|Cup|锦标|亚运|奥运|Asian Games|Tournament|国奥|青年|World Cup|Asian Cup|Euro|洲际/i.test(currentLeagueName);
    const maxLookbackDays = isTournamentOrYouth ? adaptiveWindow.maxDays : 365;
    const halfLifeDays = isTournamentOrYouth ? adaptiveWindow.halfLifeDays : 120;

    // 预判近 365 天内有效样本数，若近 1 年正赛极其稀缺 (<= 2 场)，启动赛会/大赛周期历史样本稀缺度补偿
    const recent365Count = matches.filter((item) => {
      let matchTime = 0;
      if (typeof item.match_time === 'number' && item.match_time > 0) {
        matchTime = item.match_time > 1e11 ? item.match_time : item.match_time * 1000;
      } else if (item.match_date) {
        const parsed = new Date(String(item.match_date)).getTime();
        if (!isNaN(parsed)) matchTime = parsed;
      }
      const days = matchTime > 0 ? Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24))) : 9999;
      return days <= 365;
    }).length;
    const isSampleScarcity = recent365Count <= 2;

    let totalEffectiveWeight = 0;
    let sumScored = 0;
    let sumConceded = 0;
    let sumHalfScored = 0;
    let sumHalfConceded = 0;
    let sumSecondHalfScored = 0;
    let sumSecondHalfConceded = 0;
    let cleanSheetCount = 0;
    let failedToScoreCount = 0;
    let handicapWinCount = 0;
    let overGoalsCount = 0;
    let validCount = 0;

    const weights: RecentFormContextWeight[] = matches.map((item) => {
      // 1. 时间过滤与指数衰减 (自适应半衰期, 青年队/杯赛/大赛自适应扩展至 1460 天)
      let matchTime = 0;
      let dateStr = '';
      if (typeof item.match_time === 'number' && item.match_time > 0) {
        matchTime = item.match_time > 1e11 ? item.match_time : item.match_time * 1000;
        dateStr = new Date(matchTime).toISOString().slice(0, 10);
      } else if (item.match_date) {
        const parsed = new Date(String(item.match_date)).getTime();
        if (!isNaN(parsed) && parsed > 0) {
          matchTime = parsed;
          dateStr = String(item.match_date).slice(0, 10);
        }
      }

      const hasValidTime = matchTime > 0;
      const daysAgo = Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24)));
      const isValidTime = hasValidTime && daysAgo >= 0 && daysAgo <= maxLookbackDays;
      let timeDecay = 0.0;
      if (isValidTime) {
        if (daysAgo <= 30) {
          timeDecay = 1.0;
        } else {
          timeDecay = Math.exp(- (Math.LN2 / halfLifeDays) * (daysAgo - 30));
          // 稀缺度加权补偿：当近 1 年正赛少于 3 场时，前置 1~4 年比赛保留有效基线权重
          if (isSampleScarcity && daysAgo <= maxLookbackDays) {
            timeDecay = Math.max(timeDecay, 0.25 * Math.exp(- (daysAgo / maxLookbackDays)));
          }
        }
      }

      // 2. 赛事层级与同赛事优先过滤
      let compWeight = 0.8;
      const compName = String(item.league_name || item.competition_name || item.competition || '');
      const isItemFriendly = /友谊|Friendly|球会友谊/i.test(compName);

      if (isItemFriendly) {
        if (!isCurrentMatchFriendly) {
          // 规则 A：若当前分析比赛为正规联赛/正规杯赛，历史样本中的球会友谊赛严格隔离归 0.0，杜绝商业热身假象污染
          compWeight = 0.0;
        } else {
          // 规则 B：若当前分析比赛本身就是球会友谊赛，历史友谊赛样本正常赋予 1.0 权重并参与时间衰减
          compWeight = 1.0;
        }
      } else if (currentLeagueName && (compName.includes(currentLeagueName) || currentLeagueName.includes(compName))) {
        compWeight = 1.0; // 同名同级别联赛最高准度
      } else if (compName.includes('杯') || compName.includes('Cup') || compName.includes('Trophy')) {
        compWeight = 0.60; // 杯赛权重
      }

      // 3. 近期战绩必须先确认样本确实属于目标球队；无法确认时不得猜测主客方向。
      let itemIsHome = false;
      let teamIdentityMatched = false;
      if (targetTeamId != null && item.home_team_id != null && item.home_team_id === targetTeamId) {
        itemIsHome = true;
        teamIdentityMatched = true;
      } else if (targetTeamId != null && item.away_team_id != null && item.away_team_id === targetTeamId) {
        itemIsHome = false;
        teamIdentityMatched = true;
      } else {
        const isHomeName = item.home_team_name === targetTeamName || (Boolean(targetLeisuName) && item.home_team_name === targetLeisuName);
        const isAwayName = item.away_team_name === targetTeamName || (Boolean(targetLeisuName) && item.away_team_name === targetLeisuName);
        if (isHomeName && !isAwayName) {
          itemIsHome = true;
          teamIdentityMatched = true;
        } else if (!isHomeName && isAwayName) {
          itemIsHome = false;
          teamIdentityMatched = true;
        }
      }

      const isVenueMatched = isTargetHome ? itemIsHome : !itemIsHome;
      const venueWeight = isVenueMatched ? 1.0 : 0.65;

      const finalWeight = Number((timeDecay * compWeight * venueWeight).toFixed(4));

      // 对手层级与战力归一化 (Opponent Tier / Strength Normalization)
      const opponentName = (itemIsHome ? item.away_team_name : item.home_team_name) || undefined;
      const oppProfile = getTeamStrengthProfile(opponentName || '', compName);
      const oppTier = oppProfile.tier;
      const oppStrengthFactor = oppProfile.defense_toughness_multiplier;
      const oppAttackFactor = oppProfile.attack_strength_multiplier;

      // 4. 解析进球明细 (全场、半场、下半场)
      const ftHome = item.fulltime_score?.home;
      const ftAway = item.fulltime_score?.away;
      const htHome = item.halftime_score?.home;
      const htAway = item.halftime_score?.away;
      const hasValidFinalScore =
        typeof ftHome === 'number' && Number.isFinite(ftHome) && ftHome >= 0 &&
        typeof ftAway === 'number' && Number.isFinite(ftAway) && ftAway >= 0;
      const hasValidHalfScore =
        (htHome === null || htHome === undefined || (typeof htHome === 'number' && Number.isFinite(htHome) && htHome >= 0)) &&
        (htAway === null || htAway === undefined || (typeof htAway === 'number' && Number.isFinite(htAway) && htAway >= 0)) &&
        (htHome === null || htHome === undefined || (ftHome !== undefined && ftHome !== null && htHome <= ftHome)) &&
        (htAway === null || htAway === undefined || (ftAway !== undefined && ftAway !== null && htAway <= ftAway));
      const hasValidScore = hasValidFinalScore && hasValidHalfScore;

      if (!teamIdentityMatched || !hasValidScore || !isValidTime || !compName.trim()) {
        return Object.freeze({
          match_id: String(item.match_id || ''),
          match_date: dateStr,
          days_ago: daysAgo,
          time_decay_weight: 0,
          venue_homomorphism_weight: 0,
          competition_importance_weight: 0,
          final_composite_weight: 0,
          is_valid_time_window: false,
          scored_full: 0,
          conceded_full: 0,
          scored_half: 0,
          conceded_half: 0,
          scored_second_half: 0,
          conceded_second_half: 0,
          is_clean_sheet: false,
          is_failed_to_score: false,
          handicap_result: 'UNKNOWN' as const,
          goals_trend_result: 'UNKNOWN' as const,
          opponent_name: opponentName,
          opponent_tier: oppTier,
          opponent_strength_factor: oppStrengthFactor
        });
      }
      const scoredFull = itemIsHome ? ftHome : ftAway;
      const concededFull = itemIsHome ? ftAway : ftHome;
      const scoredHalf = (itemIsHome ? htHome : htAway) ?? 0;
      const concededHalf = (itemIsHome ? htAway : htHome) ?? 0;

      const scoredSecondHalf = Math.max(0, scoredFull - scoredHalf);
      const concededSecondHalf = Math.max(0, concededFull - concededHalf);

      const isCleanSheet = concededFull === 0;
      const isFailedToScore = scoredFull === 0;

      // 盘路结果
      let handicapRes: 'WIN' | 'LOSS' | 'DRAW' | 'UNKNOWN' = 'UNKNOWN';
      if (item.handicap_trend?.result === '赢') handicapRes = 'WIN';
      else if (item.handicap_trend?.result === '输') handicapRes = 'LOSS';
      else if (item.handicap_trend?.result === '走' || item.handicap_trend?.result === '和') handicapRes = 'DRAW';

      let goalsTrendRes: 'BIG' | 'SMALL' | 'UNKNOWN' = 'UNKNOWN';
      if (item.goals_trend?.result === '大') goalsTrendRes = 'BIG';
      else if (item.goals_trend?.result === '小') goalsTrendRes = 'SMALL';

      if (teamIdentityMatched && hasValidScore && isValidTime && finalWeight > 0) {
        // 对手防守坚韧度归一化进球，对手进攻强度归一化失球
        const normalizedScored = scoredFull * oppStrengthFactor;
        const normalizedConceded = concededFull / Math.max(0.40, oppAttackFactor);

        totalEffectiveWeight += finalWeight;
        sumScored += normalizedScored * finalWeight;
        sumConceded += normalizedConceded * finalWeight;
        sumHalfScored += (scoredHalf * oppStrengthFactor) * finalWeight;
        sumHalfConceded += (concededHalf / Math.max(0.40, oppAttackFactor)) * finalWeight;
        sumSecondHalfScored += (scoredSecondHalf * oppStrengthFactor) * finalWeight;
        sumSecondHalfConceded += (concededSecondHalf / Math.max(0.40, oppAttackFactor)) * finalWeight;

        if (isCleanSheet) cleanSheetCount += finalWeight;
        if (isFailedToScore) failedToScoreCount += finalWeight;
        if (handicapRes === 'WIN') handicapWinCount += finalWeight;
        if (goalsTrendRes === 'BIG') overGoalsCount += finalWeight;
        validCount++;
      }

      return Object.freeze({
        match_id: String(item.match_id || ''),
        match_date: dateStr,
        days_ago: daysAgo,
        time_decay_weight: Number(timeDecay.toFixed(4)),
        venue_homomorphism_weight: venueWeight,
        competition_importance_weight: compWeight,
        final_composite_weight: finalWeight,
        is_valid_time_window: isValidTime,
        scored_full: scoredFull,
        conceded_full: concededFull,
        scored_half: scoredHalf,
        conceded_half: concededHalf,
        scored_second_half: scoredSecondHalf,
        conceded_second_half: concededSecondHalf,
        is_clean_sheet: isCleanSheet,
        is_failed_to_score: isFailedToScore,
        handicap_result: handicapRes,
        goals_trend_result: goalsTrendRes,
        opponent_name: opponentName,
        opponent_tier: oppTier,
        opponent_strength_factor: oppStrengthFactor
      });
    });

    const denom = totalEffectiveWeight > 0 ? totalEffectiveWeight : 1.0;
    let avgScored = totalEffectiveWeight > 0 ? Number((sumScored / denom).toFixed(2)) : 0;
    let avgConceded = totalEffectiveWeight > 0 ? Number((sumConceded / denom).toFixed(2)) : 0;

    // 弱样本/小样本经验贝叶斯平滑收缩 (Empirical Bayes Shrinkage toward 1.30 baseline)
    if (validCount > 0 && validCount < 4) {
      const shrinkWeight = validCount / (validCount + 2.0);
      avgScored = Number((shrinkWeight * avgScored + (1.0 - shrinkWeight) * 1.30).toFixed(2));
      avgConceded = Number((shrinkWeight * avgConceded + (1.0 - shrinkWeight) * 1.30).toFixed(2));
    }
    const avgHalfScored = totalEffectiveWeight > 0 ? Number((sumHalfScored / denom).toFixed(2)) : 0;
    const avgHalfConceded = totalEffectiveWeight > 0 ? Number((sumHalfConceded / denom).toFixed(2)) : 0;
    const avgSecondScored = totalEffectiveWeight > 0 ? Number((sumSecondHalfScored / denom).toFixed(2)) : 0;
    const avgSecondConceded = totalEffectiveWeight > 0 ? Number((sumSecondHalfConceded / denom).toFixed(2)) : 0;

    const totalScoredSum = sumHalfScored + sumSecondHalfScored;
    const slowStarter = totalScoredSum > 0 ? Number((sumSecondHalfScored / totalScoredSum).toFixed(3)) : 0;

    return {
      weights,
      analytics: {
        sample_count: matches.length,
        valid_count: validCount,
        weighted_scored_per_game: avgScored,
        weighted_conceded_per_game: avgConceded,
        first_half_scored_avg: avgHalfScored,
        first_half_conceded_avg: avgHalfConceded,
        second_half_scored_avg: avgSecondScored,
        second_half_conceded_avg: avgSecondConceded,
        slow_starter_index: slowStarter,
        second_half_surge_rate: slowStarter > 0.60 ? 1.0 : (slowStarter < 0.40 ? 0.0 : 0.5),
        clean_sheet_rate: Number((cleanSheetCount / denom).toFixed(3)),
        failed_to_score_rate: Number((failedToScoreCount / denom).toFixed(3)),
        handicap_win_rate: Number((handicapWinCount / denom).toFixed(3)),
        over_goals_rate: Number((overGoalsCount / denom).toFixed(3))
      }
    };
  };

  const homeTargetId = match.reference?.home_team_id ?? match.reference?.league_standings?.home_team?.team_id ?? null;
  const awayTargetId = match.reference?.away_team_id ?? match.reference?.league_standings?.away_team?.team_id ?? null;

  const homeResult = evaluateRecentMatches(
    homeRecent,
    match.home_team_name,
    match.reference?.leisu_home_name,
    homeTargetId,
    true
  );
  const awayResult = evaluateRecentMatches(
    awayRecent,
    match.away_team_name,
    match.reference?.leisu_away_name,
    awayTargetId,
    false
  );

  return {
    home: homeResult.weights,
    away: awayResult.weights,
    home_analytics: homeResult.analytics,
    away_analytics: awayResult.analytics
  };
}

/**
 * 解析身价数值 (如 "1.2亿", "850万", "€15.5M")
 */
export function parseMarketValueToNumber(mvText: string | null | undefined): number {
  if (!mvText) return 0;
  const cleaned = mvText.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  if (isNaN(val)) return 0;
  if (mvText.includes('亿') || mvText.toUpperCase().includes('B')) return val * 10000;
  if (mvText.includes('万') || mvText.toUpperCase().includes('M')) return val;
  return val;
}

/**
 * 提取主客场同构独立战绩 (Iso-Venue Standings)
 */
export function extractIsoVenueStandings(
  match: CanonicalMatch
): { home_at_home: IsoVenueStandingRecord | null; away_at_away: IsoVenueStandingRecord | null } {
  const standings = match.reference?.league_standings;
  if (!standings || !standings.has_data) {
    return { home_at_home: null, away_at_away: null };
  }

  const mapStanding = (record: ParsedStandingRecord | null): IsoVenueStandingRecord | null => {
    if (!record || !Number.isFinite(record.matches_played) || record.matches_played <= 0) return null;
    const nonNegativeValues = [
      record.won, record.draw, record.loss, record.goals_scored,
      record.goals_conceded, record.points
    ];
    if (nonNegativeValues.some((value) => !Number.isFinite(value) || value < 0) ||
        !Number.isFinite(record.goal_difference) ||
        record.won + record.draw + record.loss > record.matches_played ||
        record.goal_difference !== record.goals_scored - record.goals_conceded) {
      return null;
    }
    const mp = record.matches_played;
    return Object.freeze({
      matches_played: record.matches_played,
      won: record.won,
      draw: record.draw,
      loss: record.loss,
      goals_scored: record.goals_scored,
      goals_conceded: record.goals_conceded,
      goal_difference: record.goal_difference,
      points: record.points,
      goals_per_game_scored: Number((record.goals_scored / mp).toFixed(2)),
      goals_per_game_conceded: Number((record.goals_conceded / mp).toFixed(2))
    });
  };

  const homeHome = standings.home_team?.home || standings.home_team?.overall ? mapStanding((standings.home_team.home || standings.home_team.overall)!) : null;
  const awayAway = standings.away_team?.away || standings.away_team?.overall ? mapStanding((standings.away_team.away || standings.away_team.overall)!) : null;

  return {
    home_at_home: homeHome,
    away_at_away: awayAway
  };
}

/**
 * 提取进球时段分布 DNA (Goal Distribution DNA)
 * 6 个 15 分钟区间占比: [0-15', 16-30', 31-45', 46-60', 61-75', 76-90']
 */
export function extractGoalDistributionDNA(
  match: CanonicalMatch
): GoalDistributionDNAFeatures {
  const goalDist = match.reference?.goal_distribution;
  const hasCompleteIntervals = (teamDist: ParsedTeamGoalDistribution | undefined): boolean => {
    const intervals = teamDist?.home?.scored_intervals || teamDist?.away?.scored_intervals || teamDist?.all?.scored_intervals || [];
    return intervals.length >= 6 &&
      intervals.slice(0, 6).every((interval) =>
        typeof interval.goals === 'number' && Number.isFinite(interval.goals) && interval.goals >= 0
      );
  };
  const UNIFORM_6 = [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667];
  if (!goalDist || !goalDist.has_data || !hasCompleteIntervals(goalDist.home_team) || !hasCompleteIntervals(goalDist.away_team)) {
    // 返回中性展示值，但 has_data=false，调用方不得把它作为先验使用。
    return Object.freeze({
      has_data: false,
      home_scored_weights: UNIFORM_6,
      away_scored_weights: UNIFORM_6,
      home_late_game_dna: 0.1667,
      away_late_game_dna: 0.1667,
      home_early_game_dna: 0.3333,
      away_early_game_dna: 0.3333,
      home_sample_size: 0,
      away_sample_size: 0,
      home_confidence: 'INSUFFICIENT',
      away_confidence: 'INSUFFICIENT',
      is_home_specific: false,
      is_away_specific: false
    });
  }

  const extractWeightsForSide = (
    teamDist: ParsedTeamGoalDistribution | undefined,
    preferVenue: 'home' | 'away'
  ): {
    weights: number[];
    late: number;
    early: number;
    sampleSize: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
    isSpecific: boolean;
  } => {
    // 辅助函数：解析指定切片的 6 区间进球原始频数与总进球数
    const parseIntervalGoals = (ivs: ParsedGoalInterval[] | undefined): { rawGoals: number[]; totalGoals: number; isValid: boolean } => {
      const rawGoals = new Array(6).fill(0);
      let totalGoals = 0;
      if (!Array.isArray(ivs) || ivs.length < 6) {
        return { rawGoals, totalGoals: 0, isValid: false };
      }
      ivs.forEach((iv: ParsedGoalInterval, idx: number) => {
        if (idx < 6 && typeof iv.goals === 'number' && Number.isFinite(iv.goals) && iv.goals >= 0) {
          rawGoals[idx] = iv.goals;
          totalGoals += iv.goals;
        }
      });
      return { rawGoals, totalGoals, isValid: totalGoals > 0 };
    };

    // 辅助函数：对原始频数进行狄利克雷-多项式共轭贝叶斯平滑
    const smoothIntervals = (rawGoals: number[], totalGoals: number): number[] => {
      const ALPHA = 1.0;
      const K = 6;
      const denom = totalGoals + K * ALPHA;
      const posterior = new Array(6);
      for (let i = 0; i < 6; i++) {
        posterior[i] = (rawGoals[i] + ALPHA) / denom;
      }
      return posterior;
    };

    // 1. 分别提取：总体切片 (All) 与 专属主客场切片 (Venue: Home / Away)
    const allScope = teamDist?.all;
    const venueScope = preferVenue === 'home' ? teamDist?.home : teamDist?.away;

    const allParsed = parseIntervalGoals(allScope?.scored_intervals);
    const venueParsed = parseIntervalGoals(venueScope?.scored_intervals);

    const nAll = allParsed.totalGoals;
    const nVenue = venueParsed.totalGoals;

    // 2. 样本量底线安全阀 (Sample Size Floor)：
    // 若全赛季总进球 N_all < 5，整支球队样本极小/假规律，100% 回退至中性均匀分布
    if (nAll < 5) {
      return {
        weights: UNIFORM_6,
        late: 0.1667,
        early: 0.3333,
        sampleSize: Math.max(nAll, nVenue),
        confidence: 'INSUFFICIENT',
        isSpecific: false
      };
    }

    // 总体后验分布
    const posteriorAll = smoothIntervals(allParsed.rawGoals, nAll);

    // 3. “总 + 专属”自适应分层加权融合：
    // 根据专属主/客场样本量 nVenue 动态分配专属切片与总体切片的融合比例
    let finalFusedProbs: number[];
    let isSpecific = false;
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

    if (venueParsed.isValid && nVenue >= 12) {
      // 规则 1：专属切片样本充足 (nVenue >= 12) -> 70% 专属切片 + 30% 总体切片
      const posteriorVenue = smoothIntervals(venueParsed.rawGoals, nVenue);
      finalFusedProbs = new Array(6);
      for (let i = 0; i < 6; i++) {
        finalFusedProbs[i] = posteriorVenue[i] * 0.70 + posteriorAll[i] * 0.30;
      }
      isSpecific = true;
      confidence = 'HIGH';
    } else if (venueParsed.isValid && nVenue >= 5) {
      // 规则 2：专属切片样本中等 (5 <= nVenue < 12) -> 50% 专属切片 + 50% 总体切片
      const posteriorVenue = smoothIntervals(venueParsed.rawGoals, nVenue);
      finalFusedProbs = new Array(6);
      for (let i = 0; i < 6; i++) {
        finalFusedProbs[i] = posteriorVenue[i] * 0.50 + posteriorAll[i] * 0.50;
      }
      isSpecific = true;
      confidence = nAll >= 15 ? 'HIGH' : 'MEDIUM';
    } else {
      // 规则 3：专属切片样本过小或缺失 (nVenue < 5) -> 100% 采用总体切片 (All)
      // 若总体切片样本在 5 ~ 15 之间，采用样本成熟度信度因子平滑向中性均匀先验收缩
      if (nAll >= 15) {
        finalFusedProbs = posteriorAll;
        confidence = 'HIGH';
      } else {
        // 当 5 <= nAll < 15 时，信度因子 lambda = (nAll - 5) / 10.0 ∈ [0.0, 1.0)
        // 确保当 nAll=5 时平滑收敛到中性先验 1/6，当 nAll 逼近 15 时平滑过渡到全狄利克雷后验，消除跳跃阶跃
        const shrinkage = Math.max(0.0, Math.min(1.0, (nAll - 5.0) / 10.0));
        finalFusedProbs = new Array(6);
        for (let i = 0; i < 6; i++) {
          finalFusedProbs[i] = posteriorAll[i] * shrinkage + (1.0 / 6.0) * (1.0 - shrinkage);
        }
        confidence = 'MEDIUM';
      }
      isSpecific = false;
    }

    // 4. 归一化与特征派生
    const finalWeights = new Array(6);
    let sumProbs = 0;
    for (let i = 0; i < 6; i++) {
      sumProbs += finalFusedProbs[i];
    }
    const normFactor = sumProbs > 0 ? 1.0 / sumProbs : 1.0;
    for (let i = 0; i < 6; i++) {
      finalWeights[i] = Number((finalFusedProbs[i] * normFactor).toFixed(4));
    }

    // 精度微调保和为 1.0
    const sumAfter = finalWeights.reduce((a, b) => a + b, 0);
    if (Math.abs(sumAfter - 1.0) > 0.0001) {
      const diff = 1.0 - sumAfter;
      finalWeights[5] = Number((finalWeights[5] + diff).toFixed(4));
    }

    const late = finalWeights[5] ?? 0.1667;
    const early = Number(((finalWeights[0] ?? 0.1667) + (finalWeights[1] ?? 0.1667)).toFixed(4));

    return {
      weights: finalWeights,
      late,
      early,
      sampleSize: Math.max(nAll, nVenue),
      confidence,
      isSpecific
    };
  };

  const homeDna = extractWeightsForSide(goalDist.home_team, 'home');
  const awayDna = extractWeightsForSide(goalDist.away_team, 'away');

  return Object.freeze({
    has_data: true,
    home_scored_weights: homeDna.weights,
    away_scored_weights: awayDna.weights,
    home_late_game_dna: homeDna.late,
    away_late_game_dna: awayDna.late,
    home_early_game_dna: homeDna.early,
    away_early_game_dna: awayDna.early,
    home_sample_size: homeDna.sampleSize,
    away_sample_size: awayDna.sampleSize,
    home_confidence: homeDna.confidence,
    away_confidence: awayDna.confidence,
    is_home_specific: homeDna.isSpecific,
    is_away_specific: awayDna.isSpecific
  });
}

/**
 * 提取战术阵型与空间张力特征 (Tactical Formation Dynamics)
 */
export function extractTacticalFormationFeatures(
  match: CanonicalMatch
): TacticalFormationFeatures {
  const lineup = match.reference?.lineups;
  const homeFormation = lineup?.home_formation || 'UNKNOWN';
  const awayFormation = lineup?.away_formation || 'UNKNOWN';

  let wingVulnerabilityHome = 0.30;
  let wingVulnerabilityAway = 0.30;
  let midfieldCongestion = 0.50;
  let desc = '双方阵型处于常规对称攻防';

  if (homeFormation !== 'UNKNOWN' && awayFormation !== 'UNKNOWN') {
    // 识别 3 后卫/5 后卫阵型 (如 3-5-2, 5-3-2, 3-4-3)
    const is3Back = (f: string) => f.startsWith('3-') || f.startsWith('5-');
    // 识别 3 前锋高位压迫阵型 (如 4-3-3, 3-4-3)
    const is3Front = (f: string) => f.endsWith('-3') || f.endsWith('-3-3');

    if (is3Front(homeFormation) && is3Back(awayFormation)) {
      wingVulnerabilityAway = 0.75;
      desc = `主队 ${homeFormation} 三前锋高位压迫，客队 ${awayFormation} 边翼卫身后肋部空档承压极大`;
    } else if (is3Front(awayFormation) && is3Back(homeFormation)) {
      wingVulnerabilityHome = 0.75;
      desc = `客队 ${awayFormation} 三前锋反击冲击，主队 ${homeFormation} 边路防守面临单挑过载`;
    } else if (homeFormation.includes('4-2-3-1') && awayFormation.includes('4-2-3-1')) {
      midfieldCongestion = 0.85;
      desc = '双方均采用 4-2-3-1 双后腰绞杀阵型，中路渗透空间极度压缩';
    }
  }

  const bothKnown = homeFormation !== 'UNKNOWN' && awayFormation !== 'UNKNOWN';
  const formationMatched = bothKnown && (homeFormation === awayFormation);

  return Object.freeze({
    home_formation: homeFormation,
    away_formation: awayFormation,
    both_formations_known: bothKnown,
    formation_matched: formationMatched,
    wing_space_vulnerability_home: wingVulnerabilityHome,
    wing_space_vulnerability_away: wingVulnerabilityAway,
    midfield_congestion_index: midfieldCongestion,
    formation_tactical_description: desc
  });
}

/**
 * 计算阵容首发与主力伤停战力折损率 (Lineup Impact Score, LIS)
 * 方案 4：阵容首发三态化门禁 (CONFIRMED / PROJECTED / NOT_ANNOUNCED)
 */
export function calculateLineupImpactScores(
  match: CanonicalMatch
): LineupImpactFeatures {
  const lineup = match.reference?.lineups;
  let homeMv = parseMarketValueToNumber(lineup?.home_market_value);
  let awayMv = parseMarketValueToNumber(lineup?.away_market_value);

  // 兜底回退：若 lineups 未提供身价文本，尝试从 tactical_context.squad_market_value 提取
  const tacticalSquadMv = (match.reference?.tactical_context as any)?.squad_market_value;
  if (homeMv === 0 && tacticalSquadMv?.home_total_market_value_eur) {
    homeMv = Number(tacticalSquadMv.home_total_market_value_eur) / 10000; // 换算为万欧元
  }
  if (awayMv === 0 && tacticalSquadMv?.away_total_market_value_eur) {
    awayMv = Number(tacticalSquadMv.away_total_market_value_eur) / 10000;
  }

  const homeStarters = lineup?.home_starters || [];
  const awayStarters = lineup?.away_starters || [];
  const hasBothStarters = homeStarters.length > 0 && awayStarters.length > 0;

  let lineupStatus: LineupStatus = 'NOT_ANNOUNCED';
  let isLineupConfirmed = false;

  if (lineup && hasBothStarters) {
    if (lineup.confirmed === true) {
      lineupStatus = 'CONFIRMED';
      isLineupConfirmed = true;
    } else {
      lineupStatus = 'PROJECTED';
      isLineupConfirmed = false;
    }
  } else {
    lineupStatus = 'NOT_ANNOUNCED';
    isLineupConfirmed = false;
  }

  // 若赛前未公布首发（starters 为空），LIS 维持基准 1.0，禁止误判为核心缺席扣分
  if (lineupStatus === 'NOT_ANNOUNCED') {
    return {
      home_lis: 1.0,
      away_lis: 1.0,
      lineup_status: 'NOT_ANNOUNCED',
      is_lineup_confirmed: false,
      home_missing_core_players: [],
      away_missing_core_players: [],
      home_striker_missing: false,
      away_striker_missing: false,
      home_defender_missing: false,
      away_defender_missing: false,
      home_attack_injury_factor: 1.0,
      away_attack_injury_factor: 1.0,
      home_defense_leak_factor: 1.0,
      away_defense_leak_factor: 1.0,
      home_talisman_missing: false,
      away_talisman_missing: false,
      home_market_value_num: homeMv,
      away_market_value_num: awayMv,
      home_best_player_active: true,
      away_best_player_active: true
    };
  }

  const normalizePositionZone = (posStr?: string | null): 'FW' | 'MF' | 'DF' | 'GK' => {
    const s = String(posStr || '').toUpperCase();
    if (s.includes('FW') || s.includes('ST') || s.includes('CF') || s.includes('LW') || s.includes('RW') || s.includes('前锋')) return 'FW';
    if (s.includes('DF') || s.includes('CB') || s.includes('LB') || s.includes('RB') || s.includes('后卫')) return 'DF';
    if (s.includes('GK') || s.includes('门将') || s.includes('守门员')) return 'GK';
    return 'MF'; // 默认中场
  };

  const getPlayerMv = (p: ParsedPlayer): number => {
    if (typeof p.market_value === 'number' && p.market_value > 0) return p.market_value;
    const mvStr = p.market_value_text || (typeof p.market_value === 'string' ? p.market_value : null);
    if (mvStr) {
      const parsed = parseMarketValueToNumber(mvStr);
      if (parsed > 0) return parsed * 10000; // 换算为欧元
    }
    return 0;
  };

  const evaluateAbsences = (
    injuries: ParsedPlayer[],
    starters: ParsedPlayer[],
    teamSquadMvTenK: number
  ): {
    lis: number;
    missing: string[];
    strikerMissing: boolean;
    defenderMissing: boolean;
    attackInjuryFactor: number;
    defenseLeakFactor: number;
    talismanMissing: boolean;
    talismanName?: string;
    bestPlayerActive: boolean;
  } => {
    const missing: string[] = [];
    let strikerMissing = false;
    let defenderMissing = false;

    const hasBestInStarters = starters.some((p: ParsedPlayer) => p.best_player === true);

    // 1. 统计首发阵容各战术位置身价总额、人均身价以及找出全队（首发+伤停）大腿球员 (Talisman)
    const posStartersMv: Record<'FW' | 'MF' | 'DF' | 'GK', { total: number; count: number }> = {
      FW: { total: 0, count: 0 },
      MF: { total: 0, count: 0 },
      DF: { total: 0, count: 0 },
      GK: { total: 0, count: 0 }
    };
    let startersTotalMvEur = 0;

    for (const s of starters) {
      const zone = normalizePositionZone(s.position || s.position_name || s.position_code);
      const mv = getPlayerMv(s);
      posStartersMv[zone].total += mv;
      posStartersMv[zone].count += 1;
      startersTotalMvEur += mv;
    }

    // 全队身价基准 (欧元)
    const teamSquadMvEur = teamSquadMvTenK > 0 ? teamSquadMvTenK * 10000 : startersTotalMvEur * 1.35;
    const effectiveSquadMvEur = Math.max(100000, teamSquadMvEur);

    // 2. 识别全队“大腿球员” (Talisman)
    // 依据真实客观标准：在全队所有可统计身价人员中，身价第一且超第二名 1.5 倍以上，且占总身价 >= 20%
    const allKnownPlayers = [...starters, ...injuries].map(p => ({
      name: p.name || 'Unknown',
      zone: normalizePositionZone(p.position || p.position_name || p.position_code),
      mv: getPlayerMv(p),
      isInjury: injuries.includes(p),
      raw: p
    })).filter(p => p.mv > 0).sort((a, b) => b.mv - a.mv);

    let talismanName: string | undefined = undefined;
    let isTalismanMissing = false;
    let talismanZone: 'FW' | 'MF' | 'DF' | 'GK' | undefined = undefined;

    if (allKnownPlayers.length >= 1) {
      const top1 = allKnownPlayers[0];
      const top2 = allKnownPlayers[1];
      const dominanceOverSecond = top2 ? (top1.mv / Math.max(1, top2.mv)) : 2.5;
      const shareOfTotal = top1.mv / effectiveSquadMvEur;

      // 满足大腿条件，或雷速标注为最佳球员
      if ((dominanceOverSecond >= 1.45 && shareOfTotal >= 0.18) || (top1.raw.best_player === true && top1.mv > 0)) {
        talismanName = top1.name;
        talismanZone = top1.zone;
        if (top1.isInjury) {
          isTalismanMissing = true;
        }
      }
    }

    let totalWeightedInjuryLoss = 0.0;
    let totalAttackLoss = 0.0;
    let totalDefenseLoss = 0.0;

    // 3. 逐一遍历伤停名单：基于客观真实数据（同位置比对、停赛性质、核心标签）过滤边缘杂鱼并量化战力折损
    for (const p of injuries) {
      const name = p.name || 'Unknown';
      const zone = normalizePositionZone(p.position || p.position_name || p.position_code);
      missing.push(name);

      const pMv = getPlayerMv(p);
      const posStat = posStartersMv[zone];
      const posStarterAvgMv = posStat.count > 0 ? posStat.total / posStat.count : (startersTotalMvEur / 11);

      // 客观事实印证：是否为停赛/红黄牌事件（通过 incidents 数组或扩展字段排查）
      const hasSuspensionIncident = Array.isArray(p.incidents) && p.incidents.some(inc => {
        const desc = String(inc.reason_desc || inc.reason_type || inc.type_name || '').toLowerCase();
        return desc.includes('停赛') || desc.includes('红牌') || desc.includes('黄牌') || desc.includes('suspended');
      });
      const reasonStr = String((p as any).reason || (p as any).injury_reason || '').toLowerCase();
      const isSuspended = hasSuspensionIncident || reasonStr.includes('停赛') || reasonStr.includes('suspended') || reasonStr.includes('red card') || reasonStr.includes('yellow');
      const isCurrentTalisman = Boolean(talismanName && talismanName === name && isTalismanMissing);

      let singlePlayerLoss = 0.0;
      let isSubstantialKeyPlayer = false;

      if (pMv > 0) {
        const valRatio = posStarterAvgMv > 0 ? (pMv / posStarterAvgMv) : (pMv / Math.max(1, startersTotalMvEur / 11));
        const isCoreRole = Boolean(p.best_player || p.captain || p.starter || isSuspended || isCurrentTalisman);

        // 真实足球物理门禁：若伤员身价连首发同位置均价的三成都不及，且无核心主力/停赛标签，严格作为边缘人员滤除 (Loss = 0)
        if (valRatio < 0.30 && !isCoreRole) {
          singlePlayerLoss = 0.0;
          isSubstantialKeyPlayer = false;
        } else {
          // 产生实质战力空洞的主力/核心/重要轮换
          isSubstantialKeyPlayer = true;
          // 位置替代落差
          const posDropRatio = valRatio >= 1.0 ? Math.min(2.2, valRatio) : Math.max(0.20, valRatio);
          const squadValueShare = Math.max(0.01, Math.min(0.30, pMv / effectiveSquadMvEur));
          let roleMultiplier = 1.0;
          if (p.best_player === true || isCurrentTalisman) roleMultiplier *= 1.35;
          if (p.captain === true) roleMultiplier *= 1.15;
          if (p.starter === true || isSuspended) roleMultiplier *= 1.10;

          singlePlayerLoss = posDropRatio * squadValueShare * roleMultiplier * 3.5;
        }
      } else {
        // 无身价数据联赛优雅退化：依据客观标签与停赛判定，绝不无脑平摊
        if (p.best_player === true || isCurrentTalisman) {
          singlePlayerLoss = 0.35;
          isSubstantialKeyPlayer = true;
        } else if (p.captain === true) {
          singlePlayerLoss = 0.25;
          isSubstantialKeyPlayer = true;
        } else if (p.starter === true || isSuspended) {
          singlePlayerLoss = 0.15;
          isSubstantialKeyPlayer = true;
        } else if (startersTotalMvEur === 0) {
          // 无身价联赛：按伤员序号阶梯赋予平滑折损，杜绝超过2人时断崖跌入 0.0
          const injuryIdx = injuries.indexOf(p);
          if (injuryIdx < 2) {
            singlePlayerLoss = 0.10;
            isSubstantialKeyPlayer = true;
          } else if (injuryIdx < 5) {
            singlePlayerLoss = 0.06;
            isSubstantialKeyPlayer = true;
          } else {
            singlePlayerLoss = 0.02;
            isSubstantialKeyPlayer = false;
          }
        } else {
          // 边缘人员噪声，战力折损严格为 0.0
          singlePlayerLoss = 0.0;
          isSubstantialKeyPlayer = false;
        }
      }

      // 注：身价大腿/核心球员战术加权已在 roleMultiplier 及无身价分支统一单次赋权 (1.35x)，杜绝二次复合乘算
      totalWeightedInjuryLoss += singlePlayerLoss;

      // 分位置解耦：进攻端折损 vs 防守端漏洞加剧
      if (isSubstantialKeyPlayer) {
        if (zone === 'FW') {
          strikerMissing = true;
          totalAttackLoss += singlePlayerLoss * 1.25;
        } else if (zone === 'DF') {
          defenderMissing = true;
          totalDefenseLoss += singlePlayerLoss * 1.25;
        } else if (zone === 'GK') {
          defenderMissing = true;
          // 主力门将缺阵是系统级防守漏洞，赋予高权重防守恶化
          totalDefenseLoss += Math.max(0.30, singlePlayerLoss * 1.50);
        } else {
          // 中场攻防均担
          totalAttackLoss += singlePlayerLoss * 0.50;
          totalDefenseLoss += singlePlayerLoss * 0.50;
        }
      }
    }

    // 4. 严格指数饱和保底模型：LIS = 0.75 + 0.25 * exp(-0.40 * totalWeightedInjuryLoss)
    const lis = totalWeightedInjuryLoss > 0
      ? Math.max(0.75, Number((0.75 + 0.25 * Math.exp(-0.40 * totalWeightedInjuryLoss)).toFixed(3)))
      : 1.0;

    // 进攻战力保持率 [0.65, 1.00]
    const attackInjuryFactor = totalAttackLoss > 0
      ? Math.max(0.65, Number((0.65 + 0.35 * Math.exp(-0.45 * totalAttackLoss)).toFixed(3)))
      : 1.0;

    // 防守漏洞恶化乘子 [1.00, 1.50]
    const defenseLeakFactor = totalDefenseLoss > 0
      ? Math.min(1.50, Number((1.0 + 0.50 * (1.0 - Math.exp(-0.45 * totalDefenseLoss))).toFixed(3)))
      : 1.0;

    return {
      lis,
      missing,
      strikerMissing,
      defenderMissing,
      attackInjuryFactor,
      defenseLeakFactor,
      talismanMissing: isTalismanMissing,
      talismanName,
      bestPlayerActive: hasBestInStarters
    };
  };

  const homeInjuries = lineup?.home_injuries || [];
  const awayInjuries = lineup?.away_injuries || [];

  const homeRes = evaluateAbsences(homeInjuries, homeStarters, homeMv);
  const awayRes = evaluateAbsences(awayInjuries, awayStarters, awayMv);

  // 战术中轴骨干身价 (Spine: GK - CB - CM/DM - CF)
  const calcSpineMv = (starters: ParsedPlayer[]): number => {
    let sum = 0;
    for (const s of starters) {
      const pos = String(s.position || s.position_name || s.position_code || '').toUpperCase();
      const isSpine = pos.includes('GK') || pos.includes('CB') || pos.includes('DM') || pos.includes('CM') || pos.includes('CF') || pos.includes('ST') || pos.includes('门将') || pos.includes('中卫') || pos.includes('后腰') || pos.includes('中锋');
      if (isSpine) {
        sum += getPlayerMv(s);
      }
    }
    return sum;
  };
  const homeSpineMv = calcSpineMv(homeStarters);
  const awaySpineMv = calcSpineMv(awayStarters);

  // 平均年龄与体能/经验差
  const calcAvgAge = (starters: ParsedPlayer[], fallbackAge?: number): number | undefined => {
    if (typeof fallbackAge === 'number' && fallbackAge > 15 && fallbackAge < 50) return fallbackAge;
    const ages = starters.map(p => typeof p.age === 'number' && p.age > 15 && p.age < 50 ? p.age : 0).filter(a => a > 0);
    if (ages.length >= 5) {
      return Number((ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1));
    }
    return undefined;
  };
  const homeAvgAge = calcAvgAge(homeStarters, (lineup as any)?.home_average_age);
  const awayAvgAge = calcAvgAge(awayStarters, (lineup as any)?.away_average_age);
  const ageGap = (homeAvgAge && awayAvgAge) ? Number(Math.abs(homeAvgAge - awayAvgAge).toFixed(1)) : undefined;

  // 阵型相克风险 (如 4-1-4-1 单后腰遭遇 3 中场绞杀)
  const homeFormationStr = String(lineup?.home_formation || '').trim();
  const awayFormationStr = String(lineup?.away_formation || '').trim();
  const formationClashRisk = Boolean(
    (homeFormationStr === '4-1-4-1' && (awayFormationStr === '4-3-3' || awayFormationStr === '4-2-3-1')) ||
    (awayFormationStr === '4-1-4-1' && (homeFormationStr === '4-3-3' || homeFormationStr === '4-2-3-1'))
  );

  return {
    home_lis: homeRes.lis,
    away_lis: awayRes.lis,
    lineup_status: lineupStatus,
    is_lineup_confirmed: isLineupConfirmed,
    home_missing_core_players: homeRes.missing,
    away_missing_core_players: awayRes.missing,
    home_striker_missing: homeRes.strikerMissing,
    away_striker_missing: awayRes.strikerMissing,
    home_defender_missing: homeRes.defenderMissing,
    away_defender_missing: awayRes.defenderMissing,
    home_attack_injury_factor: homeRes.attackInjuryFactor,
    away_attack_injury_factor: awayRes.attackInjuryFactor,
    home_defense_leak_factor: homeRes.defenseLeakFactor,
    away_defense_leak_factor: awayRes.defenseLeakFactor,
    home_talisman_missing: homeRes.talismanMissing,
    away_talisman_missing: awayRes.talismanMissing,
    home_talisman_name: homeRes.talismanName,
    away_talisman_name: awayRes.talismanName,
    home_market_value_num: homeMv,
    away_market_value_num: awayMv,
    home_best_player_active: homeRes.bestPlayerActive,
    away_best_player_active: awayRes.bestPlayerActive,
    home_spine_market_value: homeSpineMv,
    away_spine_market_value: awaySpineMv,
    home_average_age: homeAvgAge,
    away_average_age: awayAvgAge,
    age_gap: ageGap,
    formation_clash_risk: formationClashRisk
  };
}

/**
 * 计算联赛积分榜战意生命周期因子 (Motivation & Urgency Index, MUI)
 * 方案 6：中小联赛与杯赛动态战意百分位 (Dynamic Percentile MUI)
 */
export function calculateMotivationAndUrgencyIndex(
  match: CanonicalMatch
): { home_mui: number; away_mui: number; home_context: string; away_context: string } {
  // 杯赛、友谊赛、欧冠淘汰赛场景下，强制关闭联赛积分榜战意映射，避免跨赛事战意误植
  const leagueName = String(match.league_name || match.reference?.leisu_league_name || '').toLowerCase();
  const isCupOrTournament =
    leagueName.includes('杯') ||
    leagueName.includes('cup') ||
    leagueName.includes('trophy') ||
    leagueName.includes('fa ') ||
    leagueName.includes('copa') ||
    leagueName.includes('coppa') ||
    leagueName.includes('coupe') ||
    leagueName.includes('pokal') ||
    leagueName.includes('友谊') ||
    leagueName.includes('friendly') ||
    leagueName.includes('锦标赛') ||
    leagueName.includes('淘汰赛') ||
    leagueName.includes('资格赛') ||
    leagueName.includes('附加赛') ||
    leagueName.includes('playoff') ||
    leagueName.includes('play-off');

  if (isCupOrTournament) {
    return {
      home_mui: 1.0,
      away_mui: 1.0,
      home_context: 'CUP_OR_TOURNAMENT_NEUTRAL',
      away_context: 'CUP_OR_TOURNAMENT_NEUTRAL'
    };
  }

  const standings = match.reference?.league_standings;
  if (!standings || !standings.home_team || !standings.away_team) {
    return {
      home_mui: 1.0,
      away_mui: 1.0,
      home_context: 'NO_STANDINGS_DATA',
      away_context: 'NO_STANDINGS_DATA'
    };
  }

  // 估算或提取联赛总参赛队伍数与总轮次，支持中小联赛 (如10队/12队/16队/20队)
  const homeRank = standings.home_team.overall?.position;
  const awayRank = standings.away_team.overall?.position;
  const maxObservedRank = Math.max(homeRank || 0, awayRank || 0);

  const LEAGUE_TOTAL_TEAMS_MAP: Record<string, number> = {
    '英超': 20, 'premier league': 20,
    '西甲': 20, 'la liga': 20,
    '意甲': 20, 'serie a': 20,
    '法甲': 18, 'ligue 1': 18,
    '德甲': 18, 'bundesliga': 18,
    '荷甲': 18, 'eredivisie': 18,
    '葡超': 18, 'primeira liga': 18,
    '日职': 20, 'j1 league': 20, '日职联': 20,
    '日职乙': 20, 'j2 league': 20,
    '韩k联': 12, 'k league 1': 12, '韩k1': 12,
    '中超': 16, 'csl': 16,
    '瑞士超': 12,
    '奥甲': 12, 'austrian bundesliga': 12,
    '苏超': 12, 'scottish premiership': 12,
    '比甲': 16, 'belgian pro league': 16,
    '俄超': 16,
    '土超': 19,
    '美职联': 29, 'mls': 29,
    '巴甲': 20, 'brasileiro': 20,
    '澳超': 12, 'a-league': 12
  };

  let totalTeams = 20;
  for (const [key, cnt] of Object.entries(LEAGUE_TOTAL_TEAMS_MAP)) {
    if (leagueName.includes(key)) {
      totalTeams = cnt;
      break;
    }
  }
  totalTeams = Math.max(totalTeams, maxObservedRank > 0 ? maxObservedRank : 20);
  const totalRounds = Math.max(10, (totalTeams - 1) * 2);

  const evaluateTeam = (teamStanding: ParsedTeamStanding): { mui: number; context: string } => {
    const overall = teamStanding.overall;
    if (!overall) {
      return { mui: 1.0, context: 'OVERALL_MISSING' };
    }

    const rank = overall.position;
    const played = overall.matches_played;

    // 严禁假数据：若积分榜未提供具体名次或场次，绝不脑补假排名，忠实返回中性 1.0
    if (rank === null || rank === undefined || played === null || played === undefined) {
      return { mui: 1.0, context: 'METRICS_INCOMPLETE' };
    }

    // 方案 6：动态百分位计算 (争冠/欧战区 <= 0.20, 降级危险区 >= 0.80, 赛季末收官 >= 0.75)
    const rankPercentile = rank / totalTeams;
    const seasonProgress = played / totalRounds;

    const isLateSeason = seasonProgress >= 0.75;
    const isEarlySeason = seasonProgress <= 0.20 || played <= 5;

    let baseMui = 1.0;
    let context = 'MID_TABLE_NORMAL';

    if (rankPercentile <= 0.20) {
      baseMui = isLateSeason ? 1.25 : 1.10;
      context = isLateSeason ? 'TITLE_OR_UCL_RACE_LATE_SEASON' : 'TITLE_OR_UCL_RACE';
    } else if (rankPercentile >= 0.80) {
      baseMui = isLateSeason ? 1.35 : 1.15;
      context = isLateSeason ? 'RELEGATION_BATTLE_LATE_SEASON' : 'RELEGATION_BATTLE';
    } else if (rankPercentile > 0.35 && rankPercentile < 0.70) {
      baseMui = isLateSeason ? 0.75 : 0.95;
      context = isLateSeason ? 'MID_TABLE_SECURE_LATE_SEASON' : 'MID_TABLE_SECURE';
    }

    if (isEarlySeason) {
      baseMui = 1.0 + (baseMui - 1.0) * 0.3;
      context += '_EARLY_SEASON_DAMPENED';
    }

    return { mui: Number(baseMui.toFixed(3)), context };
  };

  const homeEval = evaluateTeam(standings.home_team);
  const awayEval = evaluateTeam(standings.away_team);

  return {
    home_mui: homeEval.mui,
    away_mui: awayEval.mui,
    home_context: homeEval.context,
    away_context: awayEval.context
  };
}

/**
 * 检验进球时间段分布样本有效性 (N < 8 场自动标记贝叶斯收缩)
 */
export function evaluateGoalTimingValidity(
  match: CanonicalMatch
): { sample_count: number; is_valid: boolean; requires_shrinkage: boolean } {
  const goalDist = match.reference?.goal_distribution;
  if (!goalDist || !goalDist.has_data) {
    return { sample_count: 0, is_valid: false, requires_shrinkage: true };
  }

  const hasCompleteIntervals = (teamDist: ParsedTeamGoalDistribution | undefined): boolean => {
    const intervals = teamDist?.all?.scored_intervals || teamDist?.home?.scored_intervals || [];
    return intervals.length >= 6 &&
      intervals.slice(0, 6).every((interval) =>
        typeof interval.goals === 'number' && Number.isFinite(interval.goals) && interval.goals >= 0
      );
  };
  if (!hasCompleteIntervals(goalDist.home_team) || !hasCompleteIntervals(goalDist.away_team)) {
    return { sample_count: 0, is_valid: false, requires_shrinkage: true };
  }
  const homeMatches = goalDist.home_team?.all?.matches_count ?? 0;
  const awayMatches = goalDist.away_team?.all?.matches_count ?? 0;
  const minSample = Math.min(homeMatches, awayMatches);
  const isValid = minSample >= 8;

  return {
    sample_count: minSample,
    is_valid: isValid,
    requires_shrinkage: !isValid
  };
}

/**
 * Layer 03 M2 主调度入口：执行完整的数据清洗、时效衰减与情境战力提炼
 * @param match CanonicalMatch
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function extractCleanedContextFeatures(
  match: CanonicalMatch,
  collector?: DeficitCollector,
  tracer?: Tracer
): CleanedContextFeatures {
  const circuitBreaker = checkL0CircuitBreaker(match, collector, tracer);
  const h2hResult = calculateH2HDecayWeights(match);
  const recentForm = calculateRecentFormWeights(match);
  const isoStandings = extractIsoVenueStandings(match);
  const goalDna = extractGoalDistributionDNA(match);
  const formationFeatures = extractTacticalFormationFeatures(match);
  const lineupImpact = calculateLineupImpactScores(match);
  const muiResult = calculateMotivationAndUrgencyIndex(match);
  const timingValidity = evaluateGoalTimingValidity(match);

  const result: CleanedContextFeatures = Object.freeze({
    circuit_breaker: circuitBreaker,
    h2h_weights: h2hResult.weights,
    h2h_analytics: Object.freeze(h2hResult.analytics),
    recent_form_weights: {
      home: recentForm.home,
      away: recentForm.away
    },
    recent_form_analytics: {
      home: Object.freeze(recentForm.home_analytics),
      away: Object.freeze(recentForm.away_analytics)
    },
    iso_venue_standings: isoStandings,
    goal_distribution_dna: goalDna,
    tactical_formation: formationFeatures,
    lineup_impact: Object.freeze({
      home_lis: lineupImpact.home_lis,
      away_lis: lineupImpact.away_lis,
      lineup_status: lineupImpact.lineup_status,
      is_lineup_confirmed: lineupImpact.is_lineup_confirmed,
      home_missing_core_players: lineupImpact.home_missing_core_players,
      away_missing_core_players: lineupImpact.away_missing_core_players,
      home_striker_missing: lineupImpact.home_striker_missing,
      away_striker_missing: lineupImpact.away_striker_missing,
      home_defender_missing: lineupImpact.home_defender_missing,
      away_defender_missing: lineupImpact.away_defender_missing,
      home_attack_injury_factor: lineupImpact.home_attack_injury_factor,
      away_attack_injury_factor: lineupImpact.away_attack_injury_factor,
      home_defense_leak_factor: lineupImpact.home_defense_leak_factor,
      away_defense_leak_factor: lineupImpact.away_defense_leak_factor,
      home_talisman_missing: lineupImpact.home_talisman_missing,
      away_talisman_missing: lineupImpact.away_talisman_missing,
      home_talisman_name: lineupImpact.home_talisman_name,
      away_talisman_name: lineupImpact.away_talisman_name,
      home_market_value_num: lineupImpact.home_market_value_num,
      away_market_value_num: lineupImpact.away_market_value_num,
      home_best_player_active: lineupImpact.home_best_player_active,
      away_best_player_active: lineupImpact.away_best_player_active
    }),
    motivation_urgency: Object.freeze({
      home_mui: muiResult.home_mui,
      away_mui: muiResult.away_mui,
      home_stage_context: muiResult.home_context,
      away_stage_context: muiResult.away_context
    }),
    goal_timing_validity: Object.freeze({
      sample_count: timingValidity.sample_count,
      is_valid_sample: timingValidity.is_valid,
      requires_bayesian_shrinkage: timingValidity.requires_shrinkage
    })
  });

  tracer?.info(
    Layer03OpId.CLEAN_CONTEXT,
    'CONTEXT_EXTRACTED',
    'Context features extracted successfully with Iso-Venue and Formation features',
    {
      circuit_breaker_triggered: circuitBreaker.is_triggered,
      home_lis: lineupImpact.home_lis,
      away_lis: lineupImpact.away_lis,
      home_formation: formationFeatures.home_formation,
      away_formation: formationFeatures.away_formation
    },
    match.canonical_id
  );

  return result;
}

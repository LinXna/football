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
  homeStats: any,
  awayStats: any,
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

  // 7. 双向射正必须客观合理 (<= 总射门)
  const sogH = homeStats.shots_on_goal;
  const sogA = awayStats.shots_on_goal;
  if (sogH != null && sogA != null) {
    if (sogH < 0 || sogA < 0 || sogH > shotsH || sogA > shotsA) {
      return { isValid: false, reason: 'ILLOGICAL_SHOTS_ON_GOAL' };
    }
  }

  // 8. 双向控球率必须客观真实存在且符合守恒定律 (95% ~ 105%)
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
        historical_under_rate: 0.5,
        historical_avg_corners: null,
        historical_avg_red_cards: 0.0,
        tactical_stylistic_clash_index: 0
      }
    };
  }

  const decayConstant = Math.LN2 / halfLifeDays;
  const MAX_VALID_DAYS = 730;

  const currentHomeId = match.reference?.home_team_id ?? match.reference?.league_standings?.home_team?.team_id ?? null;
  const currentAwayId = match.reference?.away_team_id ?? match.reference?.league_standings?.away_team?.team_id ?? null;

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

    // 方案 2 严禁假默认值：若时间缺失或无效，严禁赋予 365 天等假值，直接置为无效
    const hasValidTime = matchTime > 0;
    const daysAgo = hasValidTime
      ? Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24)))
      : -1;

    let decayWeight = 0.0;
    const isValid = hasValidTime && daysAgo >= 0 && daysAgo <= MAX_VALID_DAYS;
    if (isValid) {
      decayWeight = Math.exp(-decayConstant * daysAgo);
    }

    // 赛事级别加权 (同名赛事 1.0, 杯赛/其他 0.75)
    let compImp = 1.0;
    // @ts-ignore
    if (h2h.competition_id && match.reference?.competition_id) {
      // @ts-ignore
      compImp = h2h.competition_id === match.reference.competition_id ? 1.0 : 0.75;
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
    }

    const homeScores = h2h.home_scores || [];
    const awayScores = h2h.away_scores || [];
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
    const tacticalCheck = isValid
      ? checkH2HTacticalIntegrity(h2h.home_stats, h2h.away_stats, cornerHome, cornerAway, daysAgo)
      : { isValid: false, reason: hasValidTime ? 'EXCEEDS_MAX_VALID_DAYS_730' : 'MISSING_MATCH_TIME' };

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
  const underRate = totalDecayedWeight > 0 ? Number((validUnderCount / totalDecayedWeight).toFixed(3)) : 0.5;
  const avgReds = validCount > 0 ? Number((totalRedCards / validCount).toFixed(2)) : 0.0;

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
      // 1. 时间过滤与指数衰减 (60天半衰期, >180天强制截断为0)
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

      // 方案 2 严禁假默认值：若时间缺失或无效，严禁赋予 45 天等假值，直接置为无效
      const hasValidTime = matchTime > 0;
      const daysAgo = hasValidTime
        ? Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24)))
        : -1;

      const isValidTime = hasValidTime && daysAgo >= 0 && daysAgo <= 730;
      let timeDecay = 0.0;
      if (isValidTime) {
        if (daysAgo <= 30) {
          timeDecay = 1.0;
        } else {
          timeDecay = Math.exp(- (Math.LN2 / 120) * (daysAgo - 30)); // 延长半衰期至120天
        }
      }

      // 2. 赛事层级与同赛事优先过滤
      let compWeight = 0.8;
      const compName = String(item.league_name || item.competition_name || item.competition || '');
      if (currentLeagueName && (compName.includes(currentLeagueName) || currentLeagueName.includes(compName))) {
        compWeight = 1.0; // 同名同级别联赛最高准度
      } else if (compName.includes('友谊') || compName.includes('Friendly') || compName.includes('球会友谊')) {
        compWeight = daysAgo <= 30 ? 0.10 : 0.0; // 友谊赛仅在近期30天保留极低体能参考，超期一律归零
      } else if (compName.includes('杯') || compName.includes('Cup') || compName.includes('Trophy')) {
        compWeight = 0.60; // 杯赛权重
      }

      // 3. 方案 1 近期战绩改造：优先使用 team_id 判定是否为主队出战，彻底切断客队判定借用主队雷速名的错误
      let itemIsHome = true;
      if (targetTeamId != null && item.home_team_id != null && item.home_team_id === targetTeamId) {
        itemIsHome = true;
      } else if (targetTeamId != null && item.away_team_id != null && item.away_team_id === targetTeamId) {
        itemIsHome = false;
      } else {
        const isHomeName = item.home_team_name === targetTeamName || (Boolean(targetLeisuName) && item.home_team_name === targetLeisuName);
        const isAwayName = item.away_team_name === targetTeamName || (Boolean(targetLeisuName) && item.away_team_name === targetLeisuName);
        if (isHomeName && !isAwayName) {
          itemIsHome = true;
        } else if (!isHomeName && isAwayName) {
          itemIsHome = false;
        } else {
          itemIsHome = isHomeName;
        }
      }

      const isVenueMatched = isTargetHome ? itemIsHome : !itemIsHome;
      const venueWeight = isVenueMatched ? 1.0 : 0.65;

      const finalWeight = Number((timeDecay * compWeight * venueWeight).toFixed(4));

      // 4. 解析进球明细 (全场、半场、下半场)
      const ftHome = item.fulltime_score?.home;
      const ftAway = item.fulltime_score?.away;
      const htHome = item.halftime_score?.home;
      const htAway = item.halftime_score?.away;

      if (ftHome == null || ftAway == null) {
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
          goals_trend_result: 'UNKNOWN' as const
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

      if (isValidTime && finalWeight > 0) {
        totalEffectiveWeight += finalWeight;
        sumScored += scoredFull * finalWeight;
        sumConceded += concededFull * finalWeight;
        sumHalfScored += scoredHalf * finalWeight;
        sumHalfConceded += concededHalf * finalWeight;
        sumSecondHalfScored += scoredSecondHalf * finalWeight;
        sumSecondHalfConceded += concededSecondHalf * finalWeight;

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
        goals_trend_result: goalsTrendRes
      });
    });

    const denom = totalEffectiveWeight > 0 ? totalEffectiveWeight : 1.0;
    const avgScored = totalEffectiveWeight > 0 ? Number((sumScored / denom).toFixed(2)) : 0;
    const avgConceded = totalEffectiveWeight > 0 ? Number((sumConceded / denom).toFixed(2)) : 0;
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
    if (!record || record.matches_played === 0) return null;
    const mp = record.matches_played || 1;
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
  if (!goalDist || !goalDist.has_data) {
    // 默认平均分布 (1/6 = 0.1667)
    const uniform = [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667];
    return Object.freeze({
      has_data: false,
      home_scored_weights: uniform,
      away_scored_weights: uniform,
      home_late_game_dna: 0.1667,
      away_late_game_dna: 0.1667,
      home_early_game_dna: 0.3333,
      away_early_game_dna: 0.3333
    });
  }

  const extractWeights = (teamDist: ParsedTeamGoalDistribution | undefined): { weights: number[]; late: number; early: number } => {
    const intervals = teamDist?.all?.scored_intervals || teamDist?.home?.scored_intervals || [];
    if (intervals.length === 0) {
      return { weights: [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667], late: 0.1667, early: 0.3333 };
    }

    // 方案 5：狄利克雷-多项式贝叶斯共轭平滑 (Dirichlet-Multinomial Bayesian Conjugate Smoothing)
    // 假设无信息先验 Alpha_i = 1.0 (K = 6, 均匀先验和为 6.0)
    // 后验估计: P(interval_i) = (goals_i + 1.0) / (totalGoals + 6.0)
    const rawGoals = new Array(6).fill(0);
    let totalGoals = 0;
    intervals.forEach((iv: ParsedGoalInterval, idx: number) => {
      if (idx < 6 && typeof iv.goals === 'number') {
        rawGoals[idx] = iv.goals;
        totalGoals += iv.goals;
      }
    });

    const ALPHA = 1.0;
    const K = 6;
    const denom = totalGoals + K * ALPHA;
    const weights = new Array(6);
    for (let i = 0; i < 6; i++) {
      weights[i] = Number(((rawGoals[i] + ALPHA) / denom).toFixed(4));
    }

    const late = weights[5] ?? 0.1667;
    const early = Number(((weights[0] ?? 0.1667) + (weights[1] ?? 0.1667)).toFixed(4));

    return { weights, late, early };
  };

  const homeDna = extractWeights(goalDist.home_team);
  const awayDna = extractWeights(goalDist.away_team);

  return Object.freeze({
    has_data: true,
    home_scored_weights: homeDna.weights,
    away_scored_weights: awayDna.weights,
    home_late_game_dna: homeDna.late,
    away_late_game_dna: awayDna.late,
    home_early_game_dna: homeDna.early,
    away_early_game_dna: awayDna.early
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

  return Object.freeze({
    home_formation: homeFormation,
    away_formation: awayFormation,
    formation_matched: homeFormation !== 'UNKNOWN' && awayFormation !== 'UNKNOWN',
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
  const homeMv = parseMarketValueToNumber(lineup?.home_market_value);
  const awayMv = parseMarketValueToNumber(lineup?.away_market_value);

  const homeStarters = lineup?.home_starters || [];
  const awayStarters = lineup?.away_starters || [];
  const hasStarters = homeStarters.length > 0 || awayStarters.length > 0;

  let lineupStatus: LineupStatus = 'NOT_ANNOUNCED';
  let isLineupConfirmed = false;

  if (lineup && hasStarters) {
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
      home_market_value_num: homeMv,
      away_market_value_num: awayMv,
      home_best_player_active: true,
      away_best_player_active: true
    };
  }

  const evaluateAbsences = (injuries: ParsedPlayer[], starters: ParsedPlayer[]): {
    lis: number;
    missing: string[];
    strikerMissing: boolean;
    defenderMissing: boolean;
    bestPlayerActive: boolean;
  } => {
    let deduction = 0.0;
    const missing: string[] = [];
    let strikerMissing = false;
    let defenderMissing = false;

    const hasBestInStarters = starters.some((p: ParsedPlayer) => p.best_player === true);

    for (const p of injuries) {
      const name = p.name || 'Unknown';
      const pos = String(p.position || p.position_name || '').toUpperCase();
      missing.push(name);

      if (pos.includes('FW') || pos.includes('ST') || pos.includes('前锋')) {
        deduction += 0.20;
        strikerMissing = true;
      } else if (pos.includes('DF') || pos.includes('CB') || pos.includes('GK') || pos.includes('后卫') || pos.includes('门将')) {
        deduction += 0.22;
        defenderMissing = true;
      } else {
        deduction += 0.10;
      }
    }

    const lis = Math.max(0.40, Number((1.0 - deduction).toFixed(3)));
    return {
      lis,
      missing,
      strikerMissing,
      defenderMissing,
      bestPlayerActive: hasBestInStarters
    };
  };

  const homeInjuries = lineup?.home_injuries || [];
  const awayInjuries = lineup?.away_injuries || [];

  const homeRes = evaluateAbsences(homeInjuries, homeStarters);
  const awayRes = evaluateAbsences(awayInjuries, awayStarters);

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
    home_market_value_num: homeMv,
    away_market_value_num: awayMv,
    home_best_player_active: homeRes.bestPlayerActive,
    away_best_player_active: awayRes.bestPlayerActive
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

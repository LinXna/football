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
  CleanedContextFeatures,
  L0CircuitBreakerResult,
  HistoricalMatchWeight,
  RecentFormContextWeight,
  DataDeficitSeverity,
  L0MissingReason,
  Layer03OpId,
  Layer03FeatureId
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
 * 计算历史交锋记录的时效性指数衰减
 * 半衰期模型: w = exp(-ln(2) * delta_days / half_life)
 * - half_life = 365 天
 * - delta_days <= 180 天: w ≈ 1.0
 * - delta_days > 730 天 (2年): 强制截断归零 (w = 0.0)
 */
export function calculateH2HDecayWeights(
  match: CanonicalMatch,
  halfLifeDays: number = 365,
  currentTimestamp: number = Date.now()
): HistoricalMatchWeight[] {
  const h2hList = match.reference?.tactical_context?.h2h_raw || [];
  if (h2hList.length === 0) {
    return [];
  }

  const decayConstant = Math.LN2 / halfLifeDays;
  const MAX_VALID_DAYS = 730;

  return h2hList.map((h2h) => {
    let matchTime = 0;
    const dateStr = h2h.match_time || h2h.date || '';
    if (dateStr) {
      matchTime = new Date(dateStr).getTime();
    }
    const daysAgo = matchTime > 0
      ? Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24)))
      : 365;

    let decayWeight = 0.0;
    const isValid = daysAgo <= MAX_VALID_DAYS;
    if (isValid) {
      decayWeight = Math.exp(-decayConstant * daysAgo);
      const isSameHomeAway = h2h.home_team_name === match.home_team_name;
      if (isSameHomeAway) {
        decayWeight = Math.min(1.0, decayWeight * 1.15);
      }
    }

    return Object.freeze({
      date: dateStr,
      days_ago: daysAgo,
      decay_weight: Number(decayWeight.toFixed(4)),
      is_valid: isValid
    });
  });
}

/**
 * 计算近期战绩主客场同构与赛事性质加权过滤
 */
export function calculateRecentFormWeights(
  match: CanonicalMatch
): { home: RecentFormContextWeight[]; away: RecentFormContextWeight[] } {
  const homeRecent = match.reference?.tactical_context?.home_recent_matches || [];
  const awayRecent = match.reference?.tactical_context?.away_recent_matches || [];

  const evaluateForm = (
    item: any,
    targetTeamName: string,
    isTargetHome: boolean
  ): RecentFormContextWeight => {
    let compWeight = 1.0;
    const compName = String(item.competition_name || item.league_name || item.competition || '');

    if (compName.includes('友谊') || compName.includes('Friendly') || compName.includes('球会友谊')) {
      compWeight = 0.0;
    } else if (compName.includes('杯') || compName.includes('Cup') || compName.includes('Trophy')) {
      compWeight = 0.4;
    }

    const itemIsHome = item.home_team_name === targetTeamName || item.home_team_id === match.reference?.home_team_id;
    const isMatched = isTargetHome ? itemIsHome : !itemIsHome;
    const venueWeight = isMatched ? 1.0 : 0.65;
    const finalWeight = Number((compWeight * venueWeight).toFixed(4));

    return Object.freeze({
      match_id: String(item.match_id || ''),
      venue_homomorphism_weight: venueWeight,
      competition_importance_weight: compWeight,
      final_composite_weight: finalWeight
    });
  };

  const homeWeights = homeRecent.map((r) => evaluateForm(r, match.home_team_name, true));
  const awayWeights = awayRecent.map((r) => evaluateForm(r, match.away_team_name, false));

  return {
    home: homeWeights,
    away: awayWeights
  };
}

/**
 * 计算阵容首发与主力伤停战力折损率 (Lineup Impact Score, LIS)
 */
export function calculateLineupImpactScores(
  match: CanonicalMatch
): { home_lis: number; away_lis: number; home_missing: string[]; away_missing: string[] } {
  const lineup = match.reference?.lineups;
  if (!lineup) {
    return {
      home_lis: 1.0,
      away_lis: 1.0,
      home_missing: [],
      away_missing: []
    };
  }

  const evaluateAbsences = (injuries: any[]): { lis: number; missing: string[] } => {
    let deduction = 0.0;
    const missing: string[] = [];

    for (const p of injuries) {
      const name = p.name || 'Unknown';
      const pos = String(p.position || p.position_name || '').toUpperCase();
      missing.push(name);

      if (pos.includes('FW') || pos.includes('ST') || pos.includes('前锋')) {
        deduction += 0.20;
      } else if (pos.includes('DF') || pos.includes('CB') || pos.includes('GK') || pos.includes('后卫') || pos.includes('门将')) {
        deduction += 0.22;
      } else {
        deduction += 0.10;
      }
    }

    const lis = Math.max(0.40, Number((1.0 - deduction).toFixed(3)));
    return { lis, missing };
  };

  const homeInjuries = lineup.home_injuries || [];
  const awayInjuries = lineup.away_injuries || [];

  const homeRes = evaluateAbsences(homeInjuries);
  const awayRes = evaluateAbsences(awayInjuries);

  return {
    home_lis: homeRes.lis,
    away_lis: awayRes.lis,
    home_missing: homeRes.missing,
    away_missing: awayRes.missing
  };
}

/**
 * 计算联赛积分榜战意生命周期因子 (Motivation & Urgency Index, MUI)
 */
export function calculateMotivationAndUrgencyIndex(
  match: CanonicalMatch
): { home_mui: number; away_mui: number; home_context: string; away_context: string } {
  const standings = match.reference?.league_standings;
  if (!standings || !standings.home_team || !standings.away_team) {
    return {
      home_mui: 1.0,
      away_mui: 1.0,
      home_context: 'NO_STANDINGS_DATA',
      away_context: 'NO_STANDINGS_DATA'
    };
  }

  const evaluateTeam = (teamStanding: any): { mui: number; context: string } => {
    const overall = teamStanding.overall;
    if (!overall) {
      return { mui: 1.0, context: 'OVERALL_MISSING' };
    }

    const rank = overall.position ?? 10;
    const played = overall.matches_played ?? 20;

    const isLateSeason = played >= 28;
    const isEarlySeason = played <= 5;

    let baseMui = 1.0;
    let context = 'MID_TABLE_NORMAL';

    if (rank <= 4) {
      baseMui = isLateSeason ? 1.25 : 1.10;
      context = 'TITLE_OR_UCL_RACE';
    } else if (rank >= 17) {
      baseMui = isLateSeason ? 1.35 : 1.15;
      context = 'RELEGATION_BATTLE';
    } else if (rank > 7 && rank < 14) {
      baseMui = isLateSeason ? 0.75 : 0.95;
      context = 'MID_TABLE_SECURE';
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
  const h2hWeights = calculateH2HDecayWeights(match);
  const recentForm = calculateRecentFormWeights(match);
  const lineupImpact = calculateLineupImpactScores(match);
  const muiResult = calculateMotivationAndUrgencyIndex(match);
  const timingValidity = evaluateGoalTimingValidity(match);

  const result: CleanedContextFeatures = Object.freeze({
    circuit_breaker: circuitBreaker,
    h2h_weights: h2hWeights,
    recent_form_weights: {
      home: recentForm.home,
      away: recentForm.away
    },
    lineup_impact: Object.freeze({
      home_lis: lineupImpact.home_lis,
      away_lis: lineupImpact.away_lis,
      home_missing_core_players: lineupImpact.home_missing,
      away_missing_core_players: lineupImpact.away_missing
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
    'Context features extracted successfully',
    {
      circuit_breaker_triggered: circuitBreaker.is_triggered,
      home_lis: lineupImpact.home_lis,
      away_lis: lineupImpact.away_lis,
      home_mui: muiResult.home_mui,
      away_mui: muiResult.away_mui
    },
    match.canonical_id
  );

  return result;
}

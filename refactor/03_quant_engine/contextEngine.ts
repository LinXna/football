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
import { checkL0CircuitBreaker, checkH2HTacticalIntegrity } from './l0CircuitBreaker.js';
export { checkL0CircuitBreaker, checkH2HTacticalIntegrity };
import { resolveMatchAnchorTimestamp, calculateH2HDecayWeights } from './h2hDecay.js';
export { resolveMatchAnchorTimestamp, calculateH2HDecayWeights };
import { calculateRecentFormWeights } from './recentForm.js';
export { calculateRecentFormWeights };
import { parseMarketValueToNumber, extractIsoVenueStandings, extractTacticalFormationFeatures, calculateLineupImpactScores } from './lineupImpact.js';
export { parseMarketValueToNumber, extractIsoVenueStandings, extractTacticalFormationFeatures, calculateLineupImpactScores };
import { extractGoalDistributionDNA, evaluateGoalTimingValidity } from './goalDistribution.js';
export { extractGoalDistributionDNA, evaluateGoalTimingValidity };
import { calculateMotivationAndUrgencyIndex } from './motivationUrgency.js';
export { calculateMotivationAndUrgencyIndex };

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
  const anchorTimestamp = resolveMatchAnchorTimestamp(match);
  const circuitBreaker = checkL0CircuitBreaker(match, collector, tracer);
  const h2hResult = calculateH2HDecayWeights(match, 365, anchorTimestamp);
  const recentForm = calculateRecentFormWeights(match, anchorTimestamp);
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

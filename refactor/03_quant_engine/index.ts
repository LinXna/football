/**
 * @file index.ts
 * @description Layer 03 M6: 最高统帅部量化博弈总指挥中枢 (Battlefield Quantitative Commander)
 * 
 * 核心职责：
 * 1. 统一串联与编排：
 *    - M2: 数据时效衰减、情境清洗与 L0 熔断判定 (extractCleanedContextFeatures)
 *    - M3: 实时物理攻防与危攻时序微分提取 (extractMomentumTimelineFeatures, extractRealTimePhysicalStats)
 *    - M4: 滚球 0:0 实时重置 Forward 泊松推演 (calculateInPlayPoissonFeatures)
 *    - M5: 多源去抽水与四分之一盘复合 EV 仲裁 (calculateDeviggedMarketFeatures)
 * 2. 战场统治权指数 (BDI: Battlefield Dominance Index, [-100, +100]) 综合计算
 * 3. 破门相变临界预警 (Goal Phase Alert) 综合识别 (时序积分 + 5m斜率 + 绝境搏命态)
 * 4. L0/L1/L2 容错熔断、优雅降级与量化置信度 (Confidence Score: 0~100) 扣减法则
 * 5. 输出统一不可变结构体 QuantitativeFeatures
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage } from '../02_canonical_model/enums.js';
import {
  QuantitativeFeatures,
  QuantEngineOptions,
  GoalPhaseAlert,
  PositiveEVSignal,
  QuantAlert,
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  CleanedContextFeatures,
  DeviggedMarketFeatures,
  BookmakerPosture,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { extractCleanedContextFeatures } from './contextEngine.js';
import { synthesizePrematchPrior } from './prematchPriorEngine.js';
import { calibrateWithMarketOdds } from './marketDivergenceEngine.js';
import { extractMomentumTimelineFeatures, extractRealTimePhysicalStats } from './momentumQuantEngine.js';
import { extractSpatioTemporalEventFeatures } from './eventMomentumFusion.js';
import { calculateInPlayPoissonFeatures } from './poissonDecayModel.js';
import { calculateDeviggedMarketFeatures } from './devigCalculator.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

export * from './enums.js';
export * from './types.js';
export * from './contextEngine.js';
export * from './prematchPriorEngine.js';
export * from './marketDivergenceEngine.js';
export * from './momentumQuantEngine.js';
export * from './eventMomentumFusion.js';
export * from './poissonDecayModel.js';
export * from './devigCalculator.js';

/**
 * 计算战场统治权指数 (Battlefield Dominance Index, BDI ∈ [-100, +100])
 * 融合 15m 动量积分、5m 斜率、xT 穿透威胁与全场危攻压迫
 */
export function calculateBattlefieldDominanceIndex(
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures
): number {
  // 1. 动量时序贡献 (权重 40%)
  const momentumScore = Math.max(-100, Math.min(100, (timeline.integral_15m.net / 6.0) + (timeline.slope_5m * 2.0)));

  // 2. xT 威胁贡献 (权重 35%)
  const totalXT = physical.xt_proxy.home_xt + physical.xt_proxy.away_xt;
  let xtScore = 0.0;
  if (totalXT > 0) {
    xtScore = ((physical.xt_proxy.home_xt - physical.xt_proxy.away_xt) / totalXT) * 100.0;
  }

  // 3. 禁区危攻压迫贡献 (权重 25%)
  const daScore = physical.pressure_index * 100.0;

  const bdi = (momentumScore * 0.40) + (xtScore * 0.35) + (daScore * 0.25);
  return Number(Math.max(-100, Math.min(100, bdi)).toFixed(2));
}

/**
 * 识别破门相变临界预警 (Goal Phase Alert)
 */
export function evaluateGoalPhaseAlert(
  elapsedMinute: number,
  scoreDiff: number,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  expectedGoalsRest: number
): { alert: GoalPhaseAlert; trigger_team?: 'home' | 'away'; rationale: string } {
  const isLateGame = elapsedMinute >= 70;
  const isOneGoalDiff = Math.abs(scoreDiff) === 1;

  // 1. 紧急绝境破门相变 (IMMINENT_GOAL):
  if (timeline.is_sustained_siege && isLateGame) {
    const team = timeline.integral_15m.net > 0 ? 'home' : 'away';
    return {
      alert: GoalPhaseAlert.IMMINENT_GOAL,
      trigger_team: team,
      rationale: `${team.toUpperCase()} is executing a sustained siege in late-game with suppressed opponent clearance.`
    };
  }

  if (isLateGame && isOneGoalDiff && (Math.abs(timeline.slope_5m) >= 18.0 || Math.abs(timeline.integral_5m.net) >= 150)) {
    const team = timeline.slope_5m > 0 ? 'home' : 'away';
    return {
      alert: GoalPhaseAlert.IMMINENT_GOAL,
      trigger_team: team,
      rationale: `${team.toUpperCase()} triggered desperate momentum surge in close-margin late game.`
    };
  }

  // 2. 攻防僵局 (DEADLOCK_STALEMATE):
  if (timeline.inflection_count_recent_15m >= 4 && Math.abs(timeline.integral_15m.net) < 60) {
    return {
      alert: GoalPhaseAlert.DEADLOCK_STALEMATE,
      rationale: 'Frequent back-and-forth midfield turnovers without penetration.'
    };
  }

  // 3. 垃圾时间低强度 (LOW_INTENSITY_GARBAGE_TIME):
  if (Math.abs(scoreDiff) >= 3 && elapsedMinute >= 75) {
    return {
      alert: GoalPhaseAlert.LOW_INTENSITY_GARBAGE_TIME,
      rationale: 'Large margin lead with pacing control; offensive urgency extinguished.'
    };
  }

  return {
    alert: GoalPhaseAlert.NONE,
    rationale: 'Normal game flow dynamics without extreme phase transition.'
  };
}

/**
 * 综合评估量化置信度评分 (Confidence Score ∈ [0, 100]) 与风控警报
 */
export function calculateConfidenceAndAlerts(
  context: CleanedContextFeatures,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  devig: DeviggedMarketFeatures,
  stage: MatchStage = MatchStage.LIVE
): { confidence_score: number; risk_flags: QuantAlert[]; positive_ev_signals: PositiveEVSignal[] } {
  let score = 100;
  const riskFlags: QuantAlert[] = [];
  const positiveEVSignals: PositiveEVSignal[] = [];

  // L0 熔断判定：一票否决
  if (context.circuit_breaker.is_triggered) {
    return {
      confidence_score: 0,
      risk_flags: [QuantAlert.L0_FATAL_DATA_MISSING],
      positive_ev_signals: []
    };
  }

  // L1 缺陷扣分：仅对滚球 (LIVE) 比赛扣减动量点阵缺失分；赛前 (PREMATCH) 比赛点阵天然为空，豁免扣分与警报
  if (timeline.total_points === 0) {
    if (stage === MatchStage.LIVE) {
      score -= 20; // 滚球缺失点阵
      riskFlags.push(QuantAlert.MOMENTUM_DATA_DEFICIT);
    }
  }

  if (physical.tactical_anomaly.home_barren_dominance || physical.tactical_anomaly.away_barren_dominance) {
    score -= 8;
    riskFlags.push(QuantAlert.BARREN_DOMINANCE_WARNING);
  }

  if (physical.tactical_anomaly.home_lethal_counter || physical.tactical_anomaly.away_lethal_counter) {
    riskFlags.push(QuantAlert.LETHAL_COUNTER_WARNING);
  }

  if (physical.red_card_penalty.home_attack_multiplier < 1.0 || physical.red_card_penalty.away_attack_multiplier < 1.0) {
    riskFlags.push(QuantAlert.RED_CARD_TACTICAL_COLLAPSE);
  }

  if (devig.bookmaker_posture === BookmakerPosture.TRAP_HIGH_ODDS) {
    riskFlags.push(QuantAlert.TRAP_HIGH_ODDS_WARNING);
  } else if (devig.bookmaker_posture === BookmakerPosture.DISPERSED_UNCERTAIN) {
    score -= 10;
    riskFlags.push(QuantAlert.HIGH_LINE_DISPERSION);
  }

  // L2 背景缺失微调
  if (context.goal_timing_validity.requires_bayesian_shrinkage) {
    score -= 2;
  }
  if (context.h2h_weights.length === 0) {
    score -= 2;
  }

  // 提取让球与大小球的正 EV 信号
  if (devig.spread_main_ev.is_positive_ev && devig.spread_main_ev.preferred_side !== 'none') {
    const side = devig.spread_main_ev.preferred_side;
    const ev = side === 'home' ? devig.spread_main_ev.home_ev : devig.spread_main_ev.away_ev;
    const odds = side === 'home' ? devig.spread_main_ev.home_odds : devig.spread_main_ev.away_odds;
    const kelly = devig.spread_main_ev.kelly_fraction ?? 0;
    positiveEVSignals.push(Object.freeze({
      market: 'ASIAN_HANDICAP_MAIN',
      line: devig.spread_main_ev.line,
      side: side,
      odds: odds,
      ev: ev,
      confidence: Math.max(50, score),
      kelly_fraction: kelly
    }));
  }

  if (devig.total_main_ev.is_positive_ev && devig.total_main_ev.preferred_side !== 'none') {
    const side = devig.total_main_ev.preferred_side;
    const ev = side === 'over' ? devig.total_main_ev.over_ev : devig.total_main_ev.under_ev;
    const odds = side === 'over' ? devig.total_main_ev.over_odds : devig.total_main_ev.under_odds;
    const kelly = devig.total_main_ev.kelly_fraction ?? 0;
    positiveEVSignals.push(Object.freeze({
      market: 'TOTAL_GOALS_MAIN',
      line: devig.total_main_ev.line,
      side: side,
      odds: odds,
      ev: ev,
      confidence: Math.max(50, score),
      kelly_fraction: kelly
    }));
  }

  return {
    confidence_score: Math.max(0, Math.min(100, score)),
    risk_flags: riskFlags,
    positive_ev_signals: positiveEVSignals
  };
}

/**
 * Layer 03 统一主调度入口：计算全量确定性量化博弈特征
 * @param match CanonicalMatch 标准赛事
 * @param options 可选配置
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function calculateQuantitativeFeatures(
  match: CanonicalMatch,
  options?: QuantEngineOptions,
  collector?: DeficitCollector,
  tracer?: Tracer
): QuantitativeFeatures {
  tracer?.info(
    Layer03OpId.ORCHESTRATE_QUANT,
    'ORCHESTRATION_START',
    `Starting Layer 03 Quantitative orchestration for match ${match.canonical_id}`,
    undefined,
    match.canonical_id
  );

  // 1. M2: 数据时效衰减与情境清洗
  const contextFeatures = extractCleanedContextFeatures(match, collector, tracer);

  // 1.1 Stage 1: 赛前多维关联理论先验合成 (首发 + 身价 + 伤停LIS + 近态同构 + MUI)
  const prematchPrior = synthesizePrematchPrior(match, contextFeatures, collector, tracer);

  // 1.2 Stage 1.1: 机构盘口博弈偏差检验与基准进球期望校准 (Shin去抽水 + 机构设防/诱盘姿态识别)
  const marketCalibration = calibrateWithMarketOdds(match, prematchPrior, collector, tracer);

  // 2. M3: 实时物理攻防与危攻时序微分
  const timelineFeatures = extractMomentumTimelineFeatures(match, collector, tracer);
  const physicalStatsFeatures = extractRealTimePhysicalStats(match, collector, tracer);

  // 2.5 M3.5: 战局势能与关键事件因果共生分析 (EPI 转化、战术相变与破门临界探测)
  const spatioTemporalFeatures = extractSpatioTemporalEventFeatures(
    match,
    timelineFeatures,
    physicalStatsFeatures,
    tracer
  );

  // 3. M4: 滚球 0:0 Forward 泊松时间衰减推演 (注入博弈校准基准、物理场与战术相变乘子)
  const poissonFeatures = calculateInPlayPoissonFeatures(
    match,
    contextFeatures,
    timelineFeatures,
    physicalStatsFeatures,
    spatioTemporalFeatures,
    marketCalibration,
    collector,
    tracer
  );

  // 4. M5: 多源微观去抽水与四分之一盘复合 EV 仲裁
  const devigFeatures = calculateDeviggedMarketFeatures(
    match,
    poissonFeatures,
    collector,
    tracer
  );

  // 5. 综合计算战场统治权指数 (BDI)
  const bdi = calculateBattlefieldDominanceIndex(timelineFeatures, physicalStatsFeatures);

  // 6. 识别破门相变临界预警 (融合战局势能与事件临界)
  const elapsedMinute = match.timing.minute ?? 0;
  const scoreDiff = (match.score.home_score ?? 0) - (match.score.away_score ?? 0);
  const goalPhase = evaluateGoalPhaseAlert(
    elapsedMinute,
    scoreDiff,
    timelineFeatures,
    physicalStatsFeatures,
    poissonFeatures.expected_goals_rest
  );

  // 7. 评估量化置信度与风控信号 (扣减机构诱盘/离散度惩罚)
  const { confidence_score, risk_flags, positive_ev_signals } = calculateConfidenceAndAlerts(
    contextFeatures,
    timelineFeatures,
    physicalStatsFeatures,
    devigFeatures,
    match.timing.stage
  );

  let adjustedConfidence = Math.max(0, confidence_score - marketCalibration.market_confidence_penalty);

  const finalRiskFlags = [...risk_flags];
  if (marketCalibration.market_stance === 'TRAP_INDUCEMENT' as any) {
    if (!finalRiskFlags.includes(QuantAlert.TRAP_HIGH_ODDS_WARNING)) {
      finalRiskFlags.push(QuantAlert.TRAP_HIGH_ODDS_WARNING);
    }
  }

  // 若破门临界爆发，追加 GOAL_CLIMAX_TRIGGERED 警报
  if (spatioTemporalFeatures.goal_climax.is_imminent_threat) {
    if (!finalRiskFlags.includes(QuantAlert.GOAL_CLIMAX_TRIGGERED)) {
      finalRiskFlags.push(QuantAlert.GOAL_CLIMAX_TRIGGERED);
    }
  }

  const result: QuantitativeFeatures = Object.freeze({
    canonical_id: match.canonical_id,
    calculated_at: new Date().toISOString(),
    context: contextFeatures,
    prematch_prior: prematchPrior,
    market_calibration: marketCalibration,
    timeline: timelineFeatures,
    physical_stats: physicalStatsFeatures,
    poisson: poissonFeatures,
    devig: devigFeatures,
    spatio_temporal_events: spatioTemporalFeatures,
    battlefield_dominance_index: bdi,
    goal_phase_alert: spatioTemporalFeatures.goal_climax.is_imminent_threat ? GoalPhaseAlert.IMMINENT_GOAL : goalPhase.alert,
    positive_ev_signals: positive_ev_signals,
    risk_flags: finalRiskFlags,
    confidence_score: adjustedConfidence
  });

  tracer?.info(
    Layer03OpId.ORCHESTRATE_QUANT,
    'ORCHESTRATION_COMPLETE',
    `Layer 03 Quantitative orchestration completed. Confidence: ${confidence_score}, BDI: ${bdi}`,
    {
      confidence_score,
      bdi,
      goal_phase_alert: goalPhase.alert,
      positive_ev_count: positive_ev_signals.length
    },
    match.canonical_id
  );

  return result;
}

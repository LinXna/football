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
import { MatchAlignmentStatus, MatchStage } from '../02_canonical_model/enums.js';
import {
  QuantitativeFeatures,
  QuantEngineOptions,
  GoalPhaseAlert,
  PositiveEVSignal,
  OosMarket,
  QuantCalibrationProfile,
  QuantAlert,
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  LiveThreatTrinityFeatures,
  UnifiedMatchState,
  CleanedContextFeatures,
  DeviggedMarketFeatures,
  BookmakerPosture,
  MarketStanceType,
  SpreadEVAssessment,
  TotalEVAssessment,
  Layer03OpId,
  Layer03FeatureId,
  Layer03CandidatePipeline
} from './types.js';
import { selectOosCalibrationProfile } from './oosCalibrationEngine.js';
import { extractCleanedContextFeatures } from './contextEngine.js';
import { synthesizePrematchPrior } from './prematchPriorEngine.js';
import { calibrateWithMarketOdds } from './marketDivergenceEngine.js';
import { extractMomentumTimelineFeatures, extractRealTimePhysicalStats } from './momentumQuantEngine.js';
import { extractSpatioTemporalEventFeatures } from './eventMomentumFusion.js';
import { calculateInPlayPoissonFeatures } from './poissonDecayModel.js';
import { calculateDeviggedMarketFeatures, invertHandicapString, parseAsianHandicapLine } from './devigCalculator.js';
import { buildLayer03DataAudit, buildLayer03ProductionGate } from './dataAudit.js';
import { evaluateCandidatePipeline } from './candidateStateMachine.js';
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
export * from './dataAudit.js';
export * from './oosCalibrationEngine.js';
export * from './candidateStateMachine.js';

/**
 * 计算战场统治权指数 (Battlefield Dominance Index, BDI ∈ [-100, +100])
 * 融合 15m 动量积分、5m 斜率、xT 穿透威胁与全场危攻压迫
 */
export function calculateBattlefieldDominanceIndex(
  state: UnifiedMatchState
): number {
  return Number(Math.max(-100, Math.min(100, state.dominance_index)).toFixed(2));
}

function toOosMarket(signal: PositiveEVSignal | undefined): OosMarket | undefined {
  if (signal?.market === 'ASIAN_HANDICAP_MAIN' || signal?.market === 'ASIAN_HANDICAP_SECONDARY') return 'ASIAN_HANDICAP_MAIN';
  if (signal?.market === 'TOTAL_GOALS_MAIN' || signal?.market === 'TOTAL_GOALS_SECONDARY') return 'TOTAL_GOALS_MAIN';
  if (signal?.market === 'MONEYLINE_1X2') return 'MONEYLINE_1X2';
  return undefined;
}

function isValidatedOosProfile(profile: QuantCalibrationProfile | undefined): boolean {
  return profile?.status === 'VALIDATED' &&
    profile.effective_sample_size >= 200 &&
    profile.oos_brier_score !== null;
}

/** 将三源证据、战术状态和进球后冷却凝结为下游唯一可消费的实时状态。 */
export function buildUnifiedMatchState(
  spatioTemporal: QuantitativeFeatures['spatio_temporal_events'],
  physical?: RealTimePhysicalStatsFeatures
): UnifiedMatchState {
  const trinity = spatioTemporal.live_threat_trinity;
  const cooldown = spatioTemporal.goal_climax.post_goal_cooldown_active ? 0.70 : 1.0;
  const homeIntensity = trinity.home.calibrated_threat * cooldown;
  const awayIntensity = trinity.away.calibrated_threat * cooldown;
  const effectiveHomeIntensity = homeIntensity * spatioTemporal.regime.regime_multiplier_home;
  const effectiveAwayIntensity = awayIntensity * spatioTemporal.regime.regime_multiplier_away;
  return Object.freeze({
    home_intensity: Number(Math.max(0, Math.min(1.5, homeIntensity)).toFixed(3)),
    away_intensity: Number(Math.max(0, Math.min(1.5, awayIntensity)).toFixed(3)),
    regime_multiplier_home: spatioTemporal.regime.regime_multiplier_home,
    regime_multiplier_away: spatioTemporal.regime.regime_multiplier_away,
    dominance_index: Number(((effectiveHomeIntensity - effectiveAwayIntensity) * 100).toFixed(2)),
    imminent_goal: spatioTemporal.goal_climax.is_imminent_threat,
    post_goal_cooldown_active: spatioTemporal.goal_climax.post_goal_cooldown_active,
    has_evidence_conflict: trinity.has_material_conflict,
    // 动量、事件与技术统计来自同一雷速上游：一致性不获得“独立来源”额外加成。
    source_lineage_discount: 1.0,
    red_card_attack_multiplier_home: physical?.red_card_penalty?.home_attack_multiplier ?? 1.0,
    red_card_attack_multiplier_away: physical?.red_card_penalty?.away_attack_multiplier ?? 1.0,
    red_card_defense_leak_multiplier_home: physical?.red_card_penalty?.home_defense_leak_multiplier ?? 1.0,
    red_card_defense_leak_multiplier_away: physical?.red_card_penalty?.away_defense_leak_multiplier ?? 1.0
  });
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

  // 滚球缺失客观攻防统计扣分
  if (!physical.stats_available && stage === MatchStage.LIVE) {
    score -= 25;
    riskFlags.push(QuantAlert.TECHNICAL_METRICS_DEFICIT);
  }

  if (physical.tactical_anomaly.home_barren_dominance || physical.tactical_anomaly.away_barren_dominance) {
    score -= 8;
    riskFlags.push(QuantAlert.BARREN_DOMINANCE_WARNING);
  }

  if (physical.tactical_anomaly.home_lethal_counter || physical.tactical_anomaly.away_lethal_counter) {
    riskFlags.push(QuantAlert.LETHAL_COUNTER_WARNING);
  }

  if ((physical.red_card_penalty?.home_attack_multiplier ?? 1.0) < 1.0 || (physical.red_card_penalty?.away_attack_multiplier ?? 1.0) < 1.0) {
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

  // 提取独赢、让球与大小球的正 EV 信号
  if (devig.h2h_devig && devig.h2h_devig.is_positive_ev && devig.h2h_devig.preferred_side && devig.h2h_devig.preferred_side !== 'none') {
    const side = devig.h2h_devig.preferred_side;
    const ev = side === 'home' ? (devig.h2h_devig.home_ev ?? 0) : side === 'draw' ? (devig.h2h_devig.draw_ev ?? 0) : (devig.h2h_devig.away_ev ?? 0);
    const odds = side === 'home'
      ? (devig.h2h_devig.market_odds?.[0] ?? 0)
      : side === 'draw'
      ? (devig.h2h_devig.market_odds?.[1] ?? 0)
      : (devig.h2h_devig.market_odds?.[2] ?? 0);
    const prob = side === 'home'
      ? devig.h2h_devig.model_probabilities?.[0]
      : side === 'draw'
      ? devig.h2h_devig.model_probabilities?.[1]
      : devig.h2h_devig.model_probabilities?.[2];
    const kelly = devig.h2h_devig.kelly_fraction ?? 0.0;
    positiveEVSignals.push(Object.freeze({
      market: 'MONEYLINE_1X2',
      line: '0',
      side: side,
      odds: odds,
      ev: ev,
      model_probability: prob,
      confidence: Math.max(50, score),
      kelly_fraction: kelly
    }));
  }

  // 2. 全场让球 (主盘 + 全部副盘)
  const allSpreads: { assessment: SpreadEVAssessment; isMain: boolean }[] = [];
  if (devig.spread_main_ev) {
    allSpreads.push({ assessment: devig.spread_main_ev, isMain: true });
  }
  if (devig.spread_secondary_ev && Array.isArray(devig.spread_secondary_ev)) {
    for (const sub of devig.spread_secondary_ev) {
      if (sub) allSpreads.push({ assessment: sub, isMain: false });
    }
  }

  for (const { assessment, isMain } of allSpreads) {
    if (assessment.is_positive_ev && assessment.preferred_side !== 'none') {
      const side = assessment.preferred_side;
      const ev = side === 'home' ? assessment.home_ev : assessment.away_ev;
      const odds = side === 'home' ? assessment.home_odds : assessment.away_odds;
      const kelly = assessment.kelly_fraction ?? 0.0;
      const actualLine = side === 'away' ? invertHandicapString(assessment.line) : assessment.line;
      positiveEVSignals.push(Object.freeze({
        market: isMain ? 'ASIAN_HANDICAP_MAIN' : 'ASIAN_HANDICAP_SECONDARY',
        line: actualLine,
        side: side,
        odds: odds,
        ev: ev,
        model_probability: side === 'home'
          ? assessment.home_model_probability
          : assessment.away_model_probability,
        confidence: Math.max(50, score),
        kelly_fraction: kelly
      }));
    }
  }

  // 3. 全场大小球 (主盘 + 全部副盘)
  const allTotals: { assessment: TotalEVAssessment; isMain: boolean }[] = [];
  if (devig.total_main_ev) {
    allTotals.push({ assessment: devig.total_main_ev, isMain: true });
  }
  if (devig.total_secondary_ev && Array.isArray(devig.total_secondary_ev)) {
    for (const sub of devig.total_secondary_ev) {
      if (sub) allTotals.push({ assessment: sub, isMain: false });
    }
  }

  for (const { assessment, isMain } of allTotals) {
    if (assessment.is_positive_ev && assessment.preferred_side !== 'none') {
      const side = assessment.preferred_side;
      const ev = side === 'over' ? assessment.over_ev : assessment.under_ev;
      const odds = side === 'over' ? assessment.over_odds : assessment.under_odds;
      const kelly = assessment.kelly_fraction ?? 0.0;
      positiveEVSignals.push(Object.freeze({
        market: isMain ? 'TOTAL_GOALS_MAIN' : 'TOTAL_GOALS_SECONDARY',
        line: assessment.line,
        side: side,
        odds: odds,
        ev: ev,
        model_probability: side === 'over'
          ? assessment.over_model_probability
          : assessment.under_model_probability,
        confidence: Math.max(50, score),
        kelly_fraction: kelly
      }));
    }
  }

  return {
    confidence_score: Math.max(0, Math.min(100, score)),
    risk_flags: riskFlags,
    positive_ev_signals: positiveEVSignals
  };
}

function resolveMarketConflicts(
  signals: PositiveEVSignal[],
  match: CanonicalMatch,
  poissonGrid?: number[][]
): PositiveEVSignal[] {
  const spreadSignals = signals.filter(s => s.market === 'ASIAN_HANDICAP_MAIN' || s.market === 'ASIAN_HANDICAP_SECONDARY');
  const totalSignals = signals.filter(s => s.market === 'TOTAL_GOALS_MAIN' || s.market === 'TOTAL_GOALS_SECONDARY');
  
  if (spreadSignals.length === 0 || totalSignals.length === 0 || !poissonGrid) return signals;

  let currentSignals = [...signals];

  for (const spread of spreadSignals) {
    for (const total of totalSignals) {
      if (!currentSignals.includes(spread) || !currentSignals.includes(total)) continue;

      let bothWinProb = 0.0;
      const spreadLineNum = parseAsianHandicapLine(spread.line);
      const totalLineNum = parseAsianHandicapLine(total.line);
      const currentHome = match.score?.home_score ?? 0;
      const currentAway = match.score?.away_score ?? 0;

      for (let dH = 0; dH < poissonGrid.length; dH++) {
        for (let dA = 0; dA < poissonGrid[dH].length; dA++) {
          const prob = poissonGrid[dH][dA];
          if (prob <= 0) continue;

          const netRest = spread.side === 'home' ? (dH - dA) : (dA - dH);
          const isSpreadWin = (netRest + spreadLineNum) > 0;

          const finalTotal = currentHome + currentAway + dH + dA;
          const isTotalWin = total.side === 'over' 
            ? finalTotal > totalLineNum 
            : finalTotal < totalLineNum;

          if (isSpreadWin && isTotalWin) {
            bothWinProb += prob;
          }
        }
      }

      if (bothWinProb < 0.05) {
        if (spread.ev >= total.ev) {
          currentSignals = currentSignals.filter(s => s !== total);
        } else {
          currentSignals = currentSignals.filter(s => s !== spread);
        }
      }
    }
  }

  return currentSignals;
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

  const alignmentStatus = match.alignment.status;
  if (alignmentStatus !== MatchAlignmentStatus.MATCHED_BY_ALIAS &&
      alignmentStatus !== MatchAlignmentStatus.MATCHED_AUTO) {
    collector?.record(
      'MATCH_ALIGNMENT_FAILED',
      Layer03OpId.ORCHESTRATE_QUANT,
      'RC-001',
      `Layer 03 requires confirmed entity alignment; received ${alignmentStatus}.`,
      undefined,
      match.canonical_id
    );
    throw new Error(`MATCH_ALIGNMENT_FAILED: Match ${match.canonical_id} has unconfirmed alignment status ${alignmentStatus}.`);
  }

  // 0. 核心定价要素前置强阻断检查 (Hard Block)
  if ((match.timing.stage === MatchStage.LIVE && (match.timing.minute === null || match.timing.minute === undefined)) ||
      ((match.timing.stage === MatchStage.LIVE || match.timing.stage === MatchStage.FINISHED) &&
        (match.score.home_score === null || match.score.home_score === undefined || match.score.away_score === null || match.score.away_score === undefined || !match.score.score_verified))) {
    collector?.record('UNPRICEABLE_MATCH', Layer03OpId.ORCHESTRATE_QUANT, 'RC-005', 'Core pricing data (minute or verified score) is missing. Cannot evaluate expected values.', undefined, match.canonical_id);
    throw new Error(`UNPRICEABLE_MATCH: Core pricing data is missing, blocking Quantitative Engine execution for match ${match.canonical_id}.`);
  }

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
    collector,
    tracer
  );
  const matchState = buildUnifiedMatchState(spatioTemporalFeatures, physicalStatsFeatures);

  // 3. M4: 滚球 0:0 Forward 泊松时间衰减推演 (注入博弈校准基准、物理场与战术相变乘子)
  const rawPoissonFeatures = calculateInPlayPoissonFeatures(
    match,
    contextFeatures,
    matchState,
    marketCalibration,
    undefined,
    collector,
    tracer
  );

  // 4. M5: 多源微观去抽水与四分之一盘复合 EV 仲裁
  const rawDevigFeatures = calculateDeviggedMarketFeatures(
    match,
    rawPoissonFeatures,
    collector,
    tracer
  );

  const rawConfidence = calculateConfidenceAndAlerts(
    contextFeatures,
    timelineFeatures,
    physicalStatsFeatures,
    rawDevigFeatures,
    match.timing.stage
  );
  const resolveProfile = (market: OosMarket): QuantCalibrationProfile | undefined =>
    options?.calibration_profile?.market === market
      ? options.calibration_profile
      : selectOosCalibrationProfile(options?.calibration_archive, match, market);
  const totalCalibrationProfile = resolveProfile('TOTAL_GOALS_MAIN');
  const totalCalibrationIsValidated = isValidatedOosProfile(totalCalibrationProfile);
  const poissonFeatures = totalCalibrationIsValidated
    ? calculateInPlayPoissonFeatures(match, contextFeatures, matchState, marketCalibration, totalCalibrationProfile, collector, tracer)
    : rawPoissonFeatures;
  const devigFeatures = totalCalibrationIsValidated
    ? calculateDeviggedMarketFeatures(match, poissonFeatures, collector, tracer)
    : rawDevigFeatures;

  // 5. 综合计算战场统治权指数 (BDI)
  const bdi = calculateBattlefieldDominanceIndex(matchState);

  // 6. 识别破门相变临界预警 (融合战局势能与事件临界)
  const goalPhase = matchState.imminent_goal
    ? GoalPhaseAlert.IMMINENT_GOAL : GoalPhaseAlert.NONE;

  // 7. 评估量化置信度与风控信号 (扣减机构诱盘/离散度惩罚)
  const { confidence_score, risk_flags, positive_ev_signals } = calculateConfidenceAndAlerts(
    contextFeatures,
    timelineFeatures,
    physicalStatsFeatures,
    devigFeatures,
    match.timing.stage
  );

  const resolved_positive_ev_signals = resolveMarketConflicts(positive_ev_signals, match, poissonFeatures.score_probability_grid);

  let adjustedConfidence = Math.max(0, confidence_score - marketCalibration.market_confidence_penalty);
  if (match.timing.stage === MatchStage.LIVE && !physicalStatsFeatures.stats_available) {
    adjustedConfidence = Math.min(adjustedConfidence, 55);
  }
  if (spatioTemporalFeatures.live_threat_trinity.has_material_conflict) {
    adjustedConfidence = Math.min(adjustedConfidence, 65);
  }

  const metricAvailability = Object.values(physicalStatsFeatures.available_metrics)
    .filter((available) => available).length / Object.keys(physicalStatsFeatures.available_metrics).length;

  // 严禁假数据：按比赛阶段真实评估数据质量，赛前评估基本面维度真实齐备度，滚球评估客观攻防与动量波形
  const dataQualityScore = match.timing.stage === MatchStage.PREMATCH
    ? Math.round(100 * (
        0.40 * (match.reference?.lineups?.confirmed ? 1 : ((match.reference?.lineups?.home_starters?.length ?? 0) > 0 ? 0.6 : 0)) +
        0.35 * (match.reference?.league_standings?.has_data ? 1 : 0) +
        0.25 * (match.reference?.goal_distribution?.has_data ? 1 : 0)
      ))
    : Math.round(100 * (
        0.45 * metricAvailability +
        0.30 * (timelineFeatures.total_points > 0 ? 1 : 0) +
        0.25 * (match.score.score_verified ? 1 : 0)
      ));
  const modelStabilityScore = Math.round(100 * Math.max(0, Math.min(1,
    0.45 + 0.55 * Math.min(
      spatioTemporalFeatures.live_threat_trinity.home.alignment_score,
      spatioTemporalFeatures.live_threat_trinity.away.alignment_score
    ) - (spatioTemporalFeatures.goal_climax.post_goal_cooldown_active ? 0.20 : 0)
  )));
  const candidatePipeline = evaluateCandidatePipeline({
    rawSignals: resolved_positive_ev_signals,
    resolveOosMarket: toOosMarket,
    resolveOosProfile: resolveProfile,
    adjustedConfidence,
    dataQualityScore,
    modelStabilityScore,
    canPriceMarket: !poissonFeatures.is_stoppage_time_unpriceable,
    liveStatsAvailable: physicalStatsFeatures.stats_available,
    stage: match.timing.stage,
    hasEvidenceConflict: matchState.has_evidence_conflict,
    postGoalCooldownActive: matchState.post_goal_cooldown_active,
    permissiveOosMode: options?.permissive_oos_mode ?? true
  });
  const machineCandidateSignals = [...candidatePipeline.machine_candidate_signals];
  const edgeConfidenceScore = candidatePipeline.edge_confidence_score;
  const screeningIntegrityScore = Math.min(adjustedConfidence, dataQualityScore, modelStabilityScore);

  const finalRiskFlags = [...risk_flags];
  if (marketCalibration.market_stance === MarketStanceType.TRAP_INDUCEMENT) {
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

  const dataAudit = buildLayer03DataAudit(match, contextFeatures, timelineFeatures, physicalStatsFeatures);
  const productionGate = buildLayer03ProductionGate(
    match,
    dataAudit,
    {
      state: candidatePipeline.state,
      machine_candidate_count: candidatePipeline.machine_candidate_signals.length,
      blockers: candidatePipeline.blockers
    }
  );
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
    match_state: matchState,
    battlefield_dominance_index: bdi,
    goal_phase_alert: goalPhase,
    raw_positive_ev_signals: positive_ev_signals,
    positive_ev_signals: machineCandidateSignals,
    risk_flags: finalRiskFlags,
    confidence_score: Math.min(screeningIntegrityScore, adjustedConfidence),
    confidence_breakdown: {
      data_quality_score: dataQualityScore,
      model_stability_score: modelStabilityScore,
      edge_confidence_score: edgeConfidenceScore
    },
    data_audit: dataAudit,
    production_gate: productionGate,
    candidate_pipeline: Object.freeze({
      state: candidatePipeline.state,
      raw_signal_count: candidatePipeline.raw_signals.length,
      oos_validated_count: candidatePipeline.oos_validated_signals.length,
      machine_candidate_count: candidatePipeline.machine_candidate_signals.length,
      validations: Object.freeze(candidatePipeline.validations.map((item) => Object.freeze({
        market: item.market,
        status: item.status,
        effective_sample_size: item.effective_sample_size,
        oos_brier_score: item.oos_brier_score,
        blockers: item.blockers
      }))),
      blockers: candidatePipeline.blockers,
      transitions: Object.freeze(candidatePipeline.transitions)
    } as Layer03CandidatePipeline)
  });

  tracer?.info(
    Layer03OpId.ORCHESTRATE_QUANT,
    'ORCHESTRATION_COMPLETE',
    `Layer 03 Quantitative orchestration completed. Screening integrity: ${screeningIntegrityScore}, BDI: ${bdi}`,
    {
      screening_integrity_score: screeningIntegrityScore,
      data_quality_score: dataQualityScore,
      model_stability_score: modelStabilityScore,
      edge_confidence_score: edgeConfidenceScore,
      bdi,
      goal_phase_alert: goalPhase,
      raw_positive_ev_count: positive_ev_signals.length,
      machine_candidate_count: machineCandidateSignals.length
    },
    match.canonical_id
  );

  return result;
}

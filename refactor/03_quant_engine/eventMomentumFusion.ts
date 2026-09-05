/**
 * @file eventMomentumFusion.ts
 * @description Layer 03 M3.5: 时空事件共生与攻防转换动态建模引擎 (Spatio-Temporal Event Co-Evolution)
 * 
 * 核心职责：
 * 1. 攻防势能转化指数 (Event Pressure Conversion Index, EPI):
 *    - 严格杜绝“无效控球/干打雷不下雨”的伪优势；
 *    - 评估时序危攻动量积分与实质事件 (角球、射门、射正、绝佳机会、进球) 的转化比率；
 *    - 划分 LETHAL_SIEGE (致命压迫), BARREN_DOMINANCE (虚火无效控球), CLINICAL_COUNTER (高效反击), LOW_ENGAGEMENT (消极胶着)。
 * 2. 战术相变与事件后态势 (Tactical Regime Shift):
 *    - 追踪进球/红牌后 15 分钟内的战术响应；
 *    - 识别领先后收缩防反 (PARK_THE_BUS)、落后绝境反扑 (DESPERATE_CHASE)、少打一人收缩、以及两球领先后节奏放缓。
 * 3. 破门临界态探测 (Goal Climax Tipping Point):
 *    - 融合近 5 分钟动量二阶加速度 (d²M/dt²)、高密度事件触发与防线崩溃征兆，输出 [0, 100] 的破门势能分值。
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch, CanonicalTimelineEvent } from '../02_canonical_model/types.js';
import {
  MatchStage,
  CanonicalEventType,
  CanonicalIncidentCategory
} from '../02_canonical_model/enums.js';
import {
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  EventPressureConversionFeatures,
  TeamEPIFeatures,
  LiveThreatTrinityFeatures,
  EventPressureConversionType,
  TacticalRegimeFeatures,
  TacticalRegimeType,
  GoalClimaxFeatures,
  GoalClimaxLevel,
  SpatioTemporalEventFeatures,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

/**
 * 辅助函数：安全提取事件归属方
 */
function getEventSide(event: CanonicalTimelineEvent): 'home' | 'away' | 'neutral' {
  return event.side;
}

/**
 * 辅助函数：安全提取事件分钟数
 */
function getEventMinute(event: CanonicalTimelineEvent): number {
  return event.minute ?? 0;
}

/**
 * 计算单个事件的物理威胁基准度
 */
function getEventThreatWeight(event: CanonicalTimelineEvent): number {
  if (event.is_cancelled || event.is_var_overturned) return 0.0;

  // 1. 进球类
  if (
    event.category === CanonicalIncidentCategory.SCORE ||
    event.canonical_type === CanonicalEventType.GOAL_REGULAR ||
    event.canonical_type === CanonicalEventType.GOAL_PENALTY ||
    event.type === 1
  ) {
    return 3.0;
  }

  // 2. 点球类
  if (
    event.canonical_type === CanonicalEventType.PENALTY_MISSED ||
    event.is_penalty
  ) {
    return 2.5;
  }

  // 3. 红黄牌与纪律事件 (防线压力征兆)
  if (
    event.canonical_type === CanonicalEventType.RED_CARD_DIRECT ||
    event.canonical_type === CanonicalEventType.RED_CARD_SECOND_YELLOW ||
    event.type === 4
  ) {
    return 2.0;
  }

  if (
    event.canonical_type === CanonicalEventType.YELLOW_CARD ||
    event.type === 3
  ) {
    return event.is_on_pitch !== false ? 0.6 : 0.0;
  }

  // 4. 战术角球与射正
  if (
    event.canonical_type === CanonicalEventType.CORNER ||
    event.type === 2
  ) {
    return 0.65;
  }

  if (
    event.canonical_type === CanonicalEventType.SHOT_ON_TARGET ||
    event.type === 21
  ) {
    return 1.4;
  }

  if (
    event.canonical_type === CanonicalEventType.SUBSTITUTION ||
    event.canonical_type === CanonicalEventType.INJURY_SUB ||
    event.type === 9
  ) {
    return 0.3;
  }

  return 0.2;
}

/**
 * 计算带时间半衰期指数衰减的事件威胁积分
 * @param events 事件数组
 * @param currentMinute 当前比赛进行分钟
 * @param halfLife 半衰期（分钟，默认 15 分钟）
 */
export function calculateDecayedEventScore(
  events: CanonicalTimelineEvent[],
  currentMinute: number,
  halfLife: number = 15
): { home: number; away: number } {
  let homeScore = 0.0;
  let awayScore = 0.0;

  for (const ev of events) {
    if (ev.is_cancelled || ev.is_var_overturned) continue;
    const m = getEventMinute(ev);
    if (m > currentMinute) continue;

    const deltaT = Math.max(0, currentMinute - m);
    // 指数时间衰减权重 e^(-deltaT / halfLife)
    const decayWeight = Math.exp(-deltaT / halfLife);
    const baseWeight = getEventThreatWeight(ev);
    const effectiveWeight = baseWeight * decayWeight;

    const side = getEventSide(ev);
    if (side === 'home') {
      homeScore += effectiveWeight;
    } else if (side === 'away') {
      awayScore += effectiveWeight;
    }
  }

  return {
    home: Number(homeScore.toFixed(3)),
    away: Number(awayScore.toFixed(3))
  };
}

function isGoalEvent(event: CanonicalTimelineEvent): boolean {
  return event.category === CanonicalIncidentCategory.SCORE ||
    event.canonical_type === CanonicalEventType.GOAL_REGULAR ||
    event.canonical_type === CanonicalEventType.GOAL_PENALTY ||
    (event as { type?: string | number }).type === 'GOAL' ||
    (event as { type?: string | number }).type === 1;
}

/** 三源一致性求解：不把累计统计伪装成近窗增量，只作为按时间归一化的质量基线。 */
export function calculateLiveThreatTrinity(
  timeline: MomentumTimelineFeatures,
  events: CanonicalTimelineEvent[],
  physical: RealTimePhysicalStatsFeatures,
  currentMinute: number
): LiveThreatTrinityFeatures {
  const eventScores = calculateDecayedEventScore(events, currentMinute, 15);
  const bounded = (value: number) => Math.max(0, Math.min(1, value));
  const solveTeam = (side: 'home' | 'away') => {
    const energy = timeline.integral_15m[side] as number;
    const eventScore = eventScores[side];
    const xt = (side === 'home' ? physical.xt_proxy?.home_xt : physical.xt_proxy?.away_xt) ?? 0;
    const penetration = (side === 'home' ? physical.penetration_rate?.home_penetration : physical.penetration_rate?.away_penetration) ?? 0;
    const accuracy = (side === 'home' ? physical.shot_efficiency?.home_accuracy : physical.shot_efficiency?.away_accuracy) ?? 0;
    const corners = (physical.corner_pressure?.window_source === 'SNAPSHOT_DELTA' || physical.corner_pressure?.window_source === 'EVENT_TIMELINE')
      ? ((side === 'home' ? physical.corner_pressure.home_corners_total : physical.corner_pressure.away_corners_total) ?? 0) : 0;
    const momentumSupport = bounded(1 - Math.exp(-Math.max(0, energy) / 150));
    const eventSupport = bounded(1 - Math.exp(-eventScore / 2.2));
    const statsSupport = physical.stats_available
      ? bounded(1 - Math.exp(-Math.max(0, xt * 0.32 + penetration * 1.2 + accuracy * 1.5 + corners * 0.08))) : 0;
    const activeSupports = physical.stats_available
      ? [momentumSupport, eventSupport, statsSupport]
      : [momentumSupport, eventSupport];
    const minSupport = Math.min(...activeSupports);
    const maxSupport = Math.max(...activeSupports);
    const alignmentScore = bounded(1 - (maxSupport - minSupport));
    const conflict = momentumSupport >= 0.62 && (eventSupport < 0.20 || (physical.stats_available && statsSupport < 0.20));
    const baseThreat = physical.stats_available
      ? (0.45 * momentumSupport + 0.30 * eventSupport + 0.25 * statsSupport)
      : (0.60 * momentumSupport + 0.40 * eventSupport);
    const conflictDamping = conflict
      ? (Math.max(eventSupport, statsSupport) >= 0.35 ? 0.75 : 0.45)
      : 1;
    const calibratedThreat = bounded(baseThreat * (0.55 + 0.45 * alignmentScore) * conflictDamping);
    return {
      momentum_support: Number(momentumSupport.toFixed(3)),
      event_support: Number(eventSupport.toFixed(3)),
      stats_support: Number(statsSupport.toFixed(3)),
      alignment_score: Number(alignmentScore.toFixed(3)),
      calibrated_threat: Number(calibratedThreat.toFixed(3)),
      has_conflict: conflict
    };
  };
  const home = solveTeam('home');
  const away = solveTeam('away');
  const dominant_side = home.calibrated_threat > away.calibrated_threat + 0.08 ? 'home' : away.calibrated_threat > home.calibrated_threat + 0.08 ? 'away' : 'none';
  const hasMaterialConflict = home.has_conflict || away.has_conflict;
  return {
    home,
    away,
    dominant_side,
    has_material_conflict: hasMaterialConflict,
    rationale: hasMaterialConflict ? ['高危攻动量未获近窗事件或统计质量基线共同确认，已执行威胁折损。'] : ['动量、事件与技术统计质量基线已进入同一威胁校准链。']
  };
}

/**
 * 维度一：计算攻防势能转化指数 (EPI)
 * 采用近 15 分钟时间窗口与全时序多尺度衰减走势联合评估，防止中场或比赛间隙时将全场时序事件截断导致假性虚假繁荣 (BARREN_DOMINANCE)
 */
export function calculateEventPressureConversion(
  timeline: MomentumTimelineFeatures,
  events: CanonicalTimelineEvent[],
  trinity: LiveThreatTrinityFeatures,
  currentMinute: number
): EventPressureConversionFeatures {
  const windowStart = Math.max(0, currentMinute - 15);
  const recentEvents = events.filter(e => {
    const m = getEventMinute(e);
    return m >= windowStart && m <= currentMinute && !e.is_cancelled;
  });

  // 1. 统计近 15 分钟双方事件加权总分 (带时效半衰期) 与全时序连续衰减事件总分
  const decayedScores15m = calculateDecayedEventScore(recentEvents, currentMinute, 15);
  const fullDecayedScores = calculateDecayedEventScore(events, currentMinute, 15);
  const homeEventScore = decayedScores15m.home;
  const awayEventScore = decayedScores15m.away;
  const homeFullEventScore = fullDecayedScores.home;
  const awayFullEventScore = fullDecayedScores.away;

  // 2. 获取近 15 分钟危攻能量
  const homeEnergy = timeline.integral_15m ? timeline.integral_15m.home : 0;
  const awayEnergy = timeline.integral_15m ? timeline.integral_15m.away : 0;

  // 3. 计算转化比率: EventScore / (Energy / 50)
  const homeNormEnergy = Math.max(1.0, homeEnergy / 50.0);
  const awayNormEnergy = Math.max(1.0, awayEnergy / 50.0);

  const homeRatio = Number((homeEventScore / homeNormEnergy).toFixed(3));
  const awayRatio = Number((awayEventScore / awayNormEnergy).toFixed(3));

  // 4. 连续隶属度战术类型软分类 (Continuous Membership Soft Classification)
  // 结合全场时序事件走势 (fullDecayedScore)，避免 15m 截断导致前序进球被踢出而误判为 BARREN_DOMINANCE
  const classify = (
    energy: number,
    score: number,
    ratio: number,
    integrity: number,
    conflict: boolean,
    fullDecayedScore: number
  ): EventPressureConversionType => {
    // 连续 Sigmoid 激活函数 S(x, x0, k)
    const sig = (x: number, x0: number, k: number) => 1.0 / (1.0 + Math.exp(-(x - x0) / k));

    // 结合全场时序事件支撑（如 27 分钟进球）：提供平滑的时序事件转化补偿与得分支撑
    const effectiveRatio = Math.max(ratio, Math.min(1.0, fullDecayedScore / 1.5));
    const effectiveScore = Math.max(score, fullDecayedScore * 0.8);

    const pLethal = sig(energy, 150, 25) * sig(effectiveRatio, 0.70, 0.12) * sig(integrity, 0.55, 0.12);

    // 虚假繁荣 (BARREN_DOMINANCE) 核心特征是“空有危攻/控球，但全场时序缺乏转化”
    // 若全场时序已有实质事件且尚未完全湮灭（fullDecayedScore > 0），则按其显著度指数压制虚假繁荣的误判
    const barrenSuppression = Math.exp(-fullDecayedScore / 0.45);
    const pBarren = sig(energy, 150, 25) * (1.0 - sig(effectiveRatio, 0.40, 0.12)) * (conflict ? 1.35 : 1.0) * barrenSuppression;

    const pCounter = (1.0 - sig(energy, 130, 25)) * sig(effectiveScore, 1.20, 0.35);
    const pLow = (1.0 - sig(energy, 60, 18)) * (1.0 - sig(effectiveScore, 0.60, 0.20));
    const pBalanced = 0.20; // 基础均衡先验

    const scores = [
      { type: EventPressureConversionType.LETHAL_SIEGE, val: pLethal },
      { type: EventPressureConversionType.BARREN_DOMINANCE, val: pBarren },
      { type: EventPressureConversionType.CLINICAL_COUNTER, val: pCounter },
      { type: EventPressureConversionType.LOW_ENGAGEMENT, val: pLow },
      { type: EventPressureConversionType.BALANCED_CONTEST, val: pBalanced }
    ];

    scores.sort((a, b) => b.val - a.val);
    return scores[0].type;
  };

  const homeTeam: TeamEPIFeatures = {
    conversion_ratio: homeRatio,
    event_score_15m: Number(homeEventScore.toFixed(2)),
    energy_15m: homeEnergy,
    classification: classify(homeEnergy, homeEventScore, homeRatio, trinity.home.calibrated_threat, trinity.home.has_conflict, homeFullEventScore)
  };

  const awayTeam: TeamEPIFeatures = {
    conversion_ratio: awayRatio,
    event_score_15m: Number(awayEventScore.toFixed(2)),
    energy_15m: awayEnergy,
    classification: classify(awayEnergy, awayEventScore, awayRatio, trinity.away.calibrated_threat, trinity.away.has_conflict, awayFullEventScore)
  };

  return {
    home: homeTeam,
    away: awayTeam,
    potency_differential: Number((homeRatio - awayRatio).toFixed(3))
  };
}

/**
 * 维度二：计算战术相变与事件后态势 (Tactical Regime)
 * 物理原理：
 * 构建连续平滑的战术相变张量场 (Continuous Tactical Regime Field)，
 * 消除离散分差与分钟数的硬编码阶跃。
 */
export function evaluateTacticalRegime(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures,
  epi: EventPressureConversionFeatures,
  physical: RealTimePhysicalStatsFeatures
): TacticalRegimeFeatures {
  const currentMinute = Math.max(0, (match.timing.minute ?? 0));
  const events = match.reference?.timeline_events ?? [];
  const homeScore = match.score.home_score ?? 0;
  const awayScore = match.score.away_score ?? 0;
  const scoreDiff = homeScore - awayScore;

  // 1. 查找最近进球事件
  const goalEvents = events.filter((e: CanonicalTimelineEvent) => {
    const isGoal = e.category === CanonicalIncidentCategory.SCORE || 
                   e.canonical_type === CanonicalEventType.GOAL_REGULAR ||
             e.canonical_type === CanonicalEventType.GOAL_PENALTY ||
             e.type === 1;
    return isGoal && !e.is_cancelled;
  });
  let lastGoalMinute: number | undefined = undefined;
  let lastGoalScorer: 'home' | 'away' | undefined = undefined;

  if (goalEvents.length > 0) {
    const lastGoal = goalEvents[goalEvents.length - 1];
    lastGoalMinute = getEventMinute(lastGoal);
    const side = getEventSide(lastGoal);
    if (side === 'home' || side === 'away') {
      lastGoalScorer = side;
    }
  }

  // 2. 查找红牌情况与时间半衰期
  const redCardHome = (physical.red_card_penalty?.home_attack_multiplier ?? 1.0) < 0.9;
  const redCardAway = (physical.red_card_penalty?.away_attack_multiplier ?? 1.0) < 0.9;
  let redSide: 'home' | 'away' | 'both' | 'none' = 'none';
  if (redCardHome && redCardAway) redSide = 'both';
  else if (redCardHome) redSide = 'home';
  else if (redCardAway) redSide = 'away';

  const redEvents = events.filter((e: CanonicalTimelineEvent) => {
    const isRed = e.canonical_type === CanonicalEventType.RED_CARD_DIRECT ||
                  e.canonical_type === CanonicalEventType.RED_CARD_SECOND_YELLOW ||
                  e.type === 4;
    return isRed && !e.is_cancelled;
  });
  let redMinute: number | undefined = undefined;
  if (redEvents.length > 0) {
    redMinute = getEventMinute(redEvents[redEvents.length - 1]);
  }

  // 3. 连续战术相变激活势能求解 (Continuous Activation Field)
  const sig = (x: number, x0: number, k: number) => 1.0 / (1.0 + Math.exp(-(x - x0) / k));

  // (A) 红牌相变激活度
  const aRedHome = redSide === 'home' ? 1.0 : (redSide === 'both' ? 0.5 : 0.0);
  const aRedAway = redSide === 'away' ? 1.0 : (redSide === 'both' ? 0.5 : 0.0);

  // (B) 领先收缩防反 (弹性防守) 连续激活度
  const aCounterHome = sig(scoreDiff, 0.5, 0.45) * sig(epi.away.energy_15m, 140, 30) * (1.0 - sig(epi.home.energy_15m, 100, 25));
  const aCounterAway = sig(-scoreDiff, 0.5, 0.45) * sig(epi.home.energy_15m, 140, 30) * (1.0 - sig(epi.away.energy_15m, 100, 25));

  // (C) 绝境反扑态连续激活度 (终盘 68'+，一球落后高斯核)
  const timeLateSig = sig(currentMinute, 68, 4.5);
  const oneGoalDiffGaussian = Math.exp(-Math.pow(Math.abs(scoreDiff) - 1.0, 2) / 0.5);
  const aDesperation = timeLateSig * oneGoalDiffGaussian;

  // (D) 进球后领先控制 / 节奏放缓连续激活度 (60'+，两球以上优势)
  const controlTimeSig = sig(currentMinute, 58, 5.0);
  const controlDiffSig = sig(Math.abs(scoreDiff), 1.6, 0.45);
  const aControl = controlTimeSig * controlDiffSig;

  // 4. 连续动态期望乘子合成 (平滑可微)
  let regimeMultiplierHome = 1.0;
  let regimeMultiplierAway = 1.0;

  // 叠加红牌效应
  regimeMultiplierHome += (0.35 * aRedAway - 0.35 * aRedHome);
  regimeMultiplierAway += (0.35 * aRedHome - 0.35 * aRedAway);

  // 叠加防反效应
  regimeMultiplierHome += (-0.15 * aCounterHome + 0.15 * aCounterAway);
  regimeMultiplierAway += (0.15 * aCounterHome - 0.15 * aCounterAway);

  // 叠加绝境反扑效应 (落后方全线压上，领先方反击空间扩大)
  if (scoreDiff < 0) {
    regimeMultiplierHome += 0.25 * aDesperation;
    regimeMultiplierAway += 0.10 * aDesperation;
  } else if (scoreDiff > 0) {
    regimeMultiplierHome += 0.10 * aDesperation;
    regimeMultiplierAway += 0.25 * aDesperation;
  }

  // 叠加控场放缓效应
  regimeMultiplierHome -= 0.10 * aControl;
  regimeMultiplierAway -= 0.10 * aControl;

  // 5. 战术相变类型软投影 (选取最高激活能量状态)
  const stateCandidates = [
    { regime: TacticalRegimeType.RED_CARD_COLLAPSE, energy: Math.max(aRedHome, aRedAway), desc: aRedHome > aRedAway ? '主队染红少打一人，防线承压增大' : '客队染红少打一人，主队获得压制优势' },
    { regime: TacticalRegimeType.ELASTIC_COUNTER, energy: Math.max(aCounterHome, aCounterAway), desc: aCounterHome > aCounterAway ? '主队比分领先转入深度防守，客队大举围攻' : '客队比分领先转入深度防守，主队大举围攻' },
    { regime: TacticalRegimeType.DESPERATION_ASSAULT, energy: aDesperation, desc: scoreDiff < 0 ? '主队一球落后进入终盘绝境搏命，前场全线压上' : '客队一球落后进入终盘绝境搏命，节奏急剧加速' },
    { regime: TacticalRegimeType.GAME_CONTROL_DECELERATION, energy: aControl, desc: '领先优势确立，控场节奏放缓' },
    { regime: TacticalRegimeType.NEUTRAL_EQUILIBRIUM, energy: 0.30, desc: '双方势均力敌，处于常规攻防转换期' }
  ];

  stateCandidates.sort((a, b) => b.energy - a.energy);
  const bestState = stateCandidates[0];

  return {
    current_regime: bestState.regime,
    last_goal_elapsed_minutes: lastGoalMinute !== undefined ? Math.max(0, currentMinute - lastGoalMinute) : undefined,
    last_goal_scorer: lastGoalScorer,
    red_card_active_side: redSide,
    red_card_elapsed_minutes: redMinute !== undefined ? Math.max(0, currentMinute - redMinute) : undefined,
    tactical_description: bestState.desc,
    regime_multiplier_home: Number(Math.max(0.40, Math.min(1.80, regimeMultiplierHome)).toFixed(3)),
    regime_multiplier_away: Number(Math.max(0.40, Math.min(1.80, regimeMultiplierAway)).toFixed(3))
  };
}

/**
 * 维度三：破门势能临界态探测 (Goal Climax Tipping Point)
 * 物理原理：
 * 建立基于双曲正切 (tanh) 与指数饱和的统一连续多维破门临界积分方程：
 * Climax(t) = 15.0 + Φ_slope + Φ_acc + Φ_density + Φ_epi ∈ [0, 100]
 */
export function evaluateGoalClimax(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures,
  epi: EventPressureConversionFeatures,
  trinity: LiveThreatTrinityFeatures
): GoalClimaxFeatures {
  const currentMinute = Math.max(0, (match.timing.minute ?? 0));
  const events = match.reference?.timeline_events ?? [];

  // 1. 统计近 5 分钟极近事件密度
  const window5m = Math.max(0, currentMinute - 5);
  const events5m = events.filter((e: CanonicalTimelineEvent) => {
    const m = getEventMinute(e);
    return m >= window5m && m <= currentMinute && !e.is_cancelled;
  });

  const recentIncidentDensity = events5m.length;

  // 2. 动量二阶变化 / 斜率强度
  const slope5m = timeline.slope_5m as number;
  const slope15m = timeline.slope_15m as number;
  const momentumAcceleration = Number((slope5m - slope15m).toFixed(2));

  // 3. 连续多维势能积分求解
  // (A) 斜率平滑势能 (双曲正切连续映射，最高 25 分)
  const phiSlope = 25.0 * Math.tanh(Math.abs(slope5m) / 12.0);

  // (B) 二阶加速度平滑势能 (最高 10 分)
  const phiAcceleration = 10.0 * Math.tanh(Math.abs(momentumAcceleration) / 8.0);

  // (C) 近 5 分钟高密度事件指数饱和势能 (最高 30 分)
  const phiDensity = 30.0 * (1.0 - Math.exp(-recentIncidentDensity / 2.2));

  // (D) EPI 转化势能平滑加权 (最高 20 分)
  const maxRatio = Math.max(epi.home.conversion_ratio, epi.away.conversion_ratio);
  const integrity = Math.max(trinity.home.calibrated_threat, trinity.away.calibrated_threat);
  const phiEpi = 20.0 * Math.tanh(maxRatio / 0.75) * (0.35 + 0.65 * integrity);

  // 综合平滑连续破门临界分值
  let lastGoalMinute: number | undefined;
  for (const event of events) {
    if (!event.is_cancelled && isGoalEvent(event)) {
      const eventMinute = getEventMinute(event);
      if (lastGoalMinute === undefined || eventMinute > lastGoalMinute) {
        lastGoalMinute = eventMinute;
      }
    }
  }
  const postGoalCooldownActive = lastGoalMinute !== undefined && currentMinute >= lastGoalMinute && currentMinute - lastGoalMinute < 4;
  const rawClimax = (15.0 + phiSlope + phiAcceleration + phiDensity + phiEpi) * (postGoalCooldownActive ? 0.55 : 1.0);
  const climaxScore = Number(Math.min(100.0, Math.max(0.0, rawClimax)).toFixed(1));

  // (E) 判定主要进攻方 (基于连续动量与能量比率)
  let attackingSide: 'home' | 'away' | 'none' = 'none';
  if (trinity.dominant_side === 'home' || (slope5m > 5 && trinity.home.alignment_score >= 0.45)) {
    attackingSide = 'home';
  } else if (trinity.dominant_side === 'away' || (slope5m < -5 && trinity.away.alignment_score >= 0.45)) {
    attackingSide = 'away';
  }

  // 4. 等级连续划分
  let climaxLevel = GoalClimaxLevel.DORMANT;
  if (climaxScore >= 78.0) {
    climaxLevel = GoalClimaxLevel.EXTREME_IMMINENT;
  } else if (climaxScore >= 52.0) {
    climaxLevel = GoalClimaxLevel.HIGH_PRESSURE;
  } else if (climaxScore >= 32.0) {
    climaxLevel = GoalClimaxLevel.MODERATE_BUILDUP;
  }

  return {
    climax_score: climaxScore,
    climax_level: climaxLevel,
    attacking_side: attackingSide,
    momentum_acceleration_5m: momentumAcceleration,
    recent_incident_density_5m: recentIncidentDensity,
    post_goal_cooldown_active: postGoalCooldownActive,
    is_imminent_threat: !postGoalCooldownActive && climaxScore >= 65.0
  };
}

/**
 * Layer 03 M3.5 统帅部入口函数：计算时空事件共生综合特征
 */
export function calculateSpatioTemporalFeatures(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  collector?: DeficitCollector,
  tracer?: Tracer
): SpatioTemporalEventFeatures {
  const currentMinute = Math.max(0, (match.timing.minute ?? 0));
  const events = match.reference?.timeline_events ?? [];

  // 1. 三位一体实时威胁校准，再由同一证据链生成 EPI。
  const liveThreatTrinity = calculateLiveThreatTrinity(timeline, events, physical, currentMinute);
  const epi = calculateEventPressureConversion(timeline, events, liveThreatTrinity, currentMinute);

  // 2. 战术相变
  const regime = evaluateTacticalRegime(match, timeline, epi, physical);

  // 3. 破门临界态
  const goalClimax = evaluateGoalClimax(match, timeline, epi, liveThreatTrinity);

  const activeTracer = tracer ?? Tracer.getInstance();
  activeTracer.log(
    'INFO',
    'QUANT_03_SPATIO_TEMPORAL',
    'SOLVED_SUCCESS',
    `Spatio-Temporal Event Co-Evolution Solved. Minute: ${currentMinute}', Regime: ${regime.current_regime}, Climax: ${goalClimax.climax_score} (${goalClimax.climax_level})`,
    {
      minute: currentMinute,
      epi_home: epi.home.classification,
      epi_away: epi.away.classification,
      trinity_conflict: liveThreatTrinity.has_material_conflict,
      regime: regime.current_regime,
      climax_score: goalClimax.climax_score,
      attacking_side: goalClimax.attacking_side
    },
    match.canonical_id
  );

  return {
    live_threat_trinity: liveThreatTrinity,
    epi,
    regime,
    goal_climax: goalClimax
  };
}

/**
 * 兼容别名导出
 */
export const extractSpatioTemporalEventFeatures = calculateSpatioTemporalFeatures;

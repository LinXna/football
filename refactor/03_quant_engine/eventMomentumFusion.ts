/**
 * @file eventMomentumFusion.ts
 * @description Layer 03 战局势能（危攻时序）与关键事件因果共生引擎 (Dynamic Match State & Event Co-Evolution)
 * 
 * 核心设计遵循顶级职业足球分析师战术认知：
 * 1. 攻防势能转化指数 (EPI): 识别【真实致命压迫】、【无效围攻虚火】与【刺客高效反击】；
 * 2. 战术相变与事件后态势 (Tactical Regime): 进球后态势 (碾压追击/弹性防反/恐慌崩盘) 与红牌后抗压半衰期；
 * 3. 势能破门临界探测 (Goal Climax): 动量二阶加速度 d²M/dt² + 尾端事件密集度；
 * 4. 纯函数无副作用、不可变返回。
 */

import { CanonicalMatch, CanonicalTimelineEvent } from '../02_canonical_model/types.js';
import { CanonicalIncidentCategory, CanonicalEventType } from '../02_canonical_model/enums.js';
import {
  SpatioTemporalEventFeatures,
  EventPressureConversionFeatures,
  TeamEPIFeatures,
  EventPressureConversionType,
  TacticalRegimeFeatures,
  TacticalRegimeType,
  GoalClimaxFeatures,
  GoalClimaxLevel,
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures
} from './types.js';
import { Tracer } from '../00_common/Tracer.js';

/**
 * 辅助函数：安全提取事件归属方
 */
function getEventSide(event: CanonicalTimelineEvent): 'home' | 'away' | 'neutral' {
  if (event.side) return event.side;
  if ((event as any).team_side) return (event as any).team_side;
  return 'neutral';
}

/**
 * 辅助函数：安全提取事件分钟数
 */
function getEventMinute(event: CanonicalTimelineEvent): number {
  if (typeof event.minute === 'number') return event.minute;
  if (typeof (event as any).time === 'number') return (event as any).time;
  return 0;
}

/**
 * 计算单个事件的威胁度权重
 */
function getEventThreatWeight(event: CanonicalTimelineEvent): number {
  if (event.is_cancelled || event.is_var_overturned) return 0.0;

  // 1. 进球类
  if (
    event.category === CanonicalIncidentCategory.SCORE ||
    event.canonical_type === CanonicalEventType.GOAL_REGULAR ||
    event.canonical_type === CanonicalEventType.GOAL_PENALTY ||
    (event as any).type === 'GOAL' ||
    (event as any).type === 1
  ) {
    return 3.0;
  }

  // 2. 点球类
  if (
    event.canonical_type === CanonicalEventType.PENALTY_MISSED ||
    event.is_penalty ||
    (event as any).type === 'PENALTY'
  ) {
    return 2.5;
  }

  // 3. 红黄牌纪律类
  if (
    event.canonical_type === CanonicalEventType.RED_CARD ||
    event.canonical_type === CanonicalEventType.TWO_YELLOW_TO_RED ||
    (event as any).type === 'RED_CARD' ||
    (event as any).type === 4
  ) {
    return 2.0;
  }

  if (
    event.canonical_type === CanonicalEventType.YELLOW_CARD ||
    (event as any).type === 'YELLOW_CARD' ||
    (event as any).type === 3
  ) {
    return event.is_on_pitch !== false ? 0.6 : 0.0;
  }

  // 4. 战术角球与射正
  if (
    event.canonical_type === CanonicalEventType.CORNER ||
    (event as any).type === 'CORNER'
  ) {
    return 0.8;
  }

  if (
    event.canonical_type === CanonicalEventType.SHOT_ON_TARGET ||
    (event as any).type === 'SHOT_ON_TARGET'
  ) {
    return 1.2;
  }

  if (
    event.canonical_type === CanonicalEventType.SUBSTITUTION ||
    event.canonical_type === CanonicalEventType.INJURY_SUB ||
    (event as any).type === 'SUB' ||
    (event as any).type === 9
  ) {
    return 0.3;
  }

  return 0.2;
}

/**
 * 维度一：计算攻防势能转化指数 (EPI)
 */
export function calculateEventPressureConversion(
  timeline: MomentumTimelineFeatures,
  events: CanonicalTimelineEvent[],
  currentMinute: number
): EventPressureConversionFeatures {
  const windowStart = Math.max(0, currentMinute - 15);
  const recentEvents = events.filter(e => {
    const m = getEventMinute(e);
    return m >= windowStart && m <= currentMinute && !e.is_cancelled;
  });

  // 1. 统计近 15 分钟双方事件加权总分
  let homeEventScore = 0.0;
  let awayEventScore = 0.0;

  for (const ev of recentEvents) {
    const w = getEventThreatWeight(ev);
    const side = getEventSide(ev);
    if (side === 'home') {
      homeEventScore += w;
    } else if (side === 'away') {
      awayEventScore += w;
    }
  }

  // 2. 获取近 15 分钟危攻能量
  const homeEnergy = timeline.integral_15m ? timeline.integral_15m.home : 0;
  const awayEnergy = timeline.integral_15m ? timeline.integral_15m.away : 0;

  // 3. 计算转化比率: EventScore / (Energy / 50)
  const homeNormEnergy = Math.max(1.0, homeEnergy / 50.0);
  const awayNormEnergy = Math.max(1.0, awayEnergy / 50.0);

  const homeRatio = Number((homeEventScore / homeNormEnergy).toFixed(3));
  const awayRatio = Number((awayEventScore / awayNormEnergy).toFixed(3));

  // 4. 战术类型分类
  const classify = (energy: number, score: number, ratio: number): EventPressureConversionType => {
    if (energy >= 180 && ratio >= 0.8) return EventPressureConversionType.LETHAL_SIEGE;
    if (energy >= 180 && ratio < 0.35) return EventPressureConversionType.BARREN_DOMINANCE;
    if (energy < 120 && score >= 1.8) return EventPressureConversionType.CLINICAL_COUNTER;
    if (energy < 50 && score < 0.5) return EventPressureConversionType.LOW_ENGAGEMENT;
    return EventPressureConversionType.BALANCED_CONTEST;
  };

  const homeTeam: TeamEPIFeatures = {
    conversion_ratio: homeRatio,
    event_score_15m: Number(homeEventScore.toFixed(2)),
    momentum_energy_15m: homeEnergy,
    classification: classify(homeEnergy, homeEventScore, homeRatio)
  };

  const awayTeam: TeamEPIFeatures = {
    conversion_ratio: awayRatio,
    event_score_15m: Number(awayEventScore.toFixed(2)),
    momentum_energy_15m: awayEnergy,
    classification: classify(awayEnergy, awayEventScore, awayRatio)
  };

  return {
    home: homeTeam,
    away: awayTeam,
    potency_differential: Number((homeRatio - awayRatio).toFixed(3))
  };
}

/**
 * 维度二：计算战术相变与事件后态势 (Tactical Regime)
 */
export function evaluateTacticalRegime(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures,
  epi: EventPressureConversionFeatures,
  physical: RealTimePhysicalStatsFeatures
): TacticalRegimeFeatures {
  const currentMinute = match.timing.minute ?? 0;
  const events = match.timeline_events ?? [];
  const homeScore = match.score.home_score ?? 0;
  const awayScore = match.score.away_score ?? 0;
  const scoreDiff = homeScore - awayScore;

  // 1. 查找最近进球事件
  const goalEvents = events.filter(e => {
    const isGoal = e.category === CanonicalIncidentCategory.SCORE || 
                   e.canonical_type === CanonicalEventType.GOAL_REGULAR || 
                   e.canonical_type === CanonicalEventType.GOAL_PENALTY ||
                   (e as any).type === 'GOAL' ||
                   (e as any).type === 1;
    return isGoal && !e.is_cancelled;
  });
  let lastGoalMinute: number | undefined = undefined;
  let lastGoalScorer: 'home' | 'away' | undefined = undefined;

  if (goalEvents.length > 0) {
    const lastGoal = goalEvents[goalEvents.length - 1];
    lastGoalMinute = getEventMinute(lastGoal);
    const side = getEventSide(lastGoal);
    lastGoalScorer = side === 'home' || side === 'away' ? side : undefined;
  }

  // 2. 查找红牌事件
  const redEvents = events.filter(e => {
    const isRed = e.canonical_type === CanonicalEventType.RED_CARD || 
                  e.canonical_type === CanonicalEventType.TWO_YELLOW_TO_RED ||
                  (e as any).type === 'RED_CARD' ||
                  (e as any).type === 4;
    return isRed && e.is_on_pitch !== false;
  });
  let redSide: 'home' | 'away' | 'both' | 'none' = 'none';
  let redMinute: number | undefined = undefined;

  if (redEvents.length > 0) {
    const hasHomeRed = redEvents.some(e => getEventSide(e) === 'home');
    const hasAwayRed = redEvents.some(e => getEventSide(e) === 'away');
    if (hasHomeRed && hasAwayRed) redSide = 'both';
    else if (hasHomeRed) redSide = 'home';
    else if (hasAwayRed) redSide = 'away';
    redMinute = getEventMinute(redEvents[redEvents.length - 1]);
  }

  let regime = TacticalRegimeType.NEUTRAL_EQUILIBRIUM;
  let desc = '双方攻防势均力敌，处于常规战术博弈均衡态。';
  let multHome = 1.0;
  let multAway = 1.0;

  const redElapsed = redMinute !== undefined ? Math.max(0, currentMinute - redMinute) : undefined;
  const goalElapsed = lastGoalMinute !== undefined ? Math.max(0, currentMinute - lastGoalMinute) : undefined;

  // (A) 红牌态优先判定
  if (redSide === 'home' || redSide === 'away') {
    const advantagedSide = redSide === 'home' ? 'away' : 'home';
    const disadvantagedSide = redSide;

    // 少打一人超过 15 分钟且优势方保持高压
    const advSlope = advantagedSide === 'home' ? timeline.slope_5m : -timeline.slope_5m;

    if ((redElapsed ?? 0) >= 15 && advSlope > 10) {
      regime = TacticalRegimeType.RED_CARD_COLLAPSE;
      desc = `受罚方 (${disadvantagedSide === 'home' ? '主队' : '客队'}) 少打一人已超 15 分钟，防线进入体能衰竭与结构崩盘期。`;
      if (advantagedSide === 'home') {
        multHome = 1.35;
        multAway = 0.50;
      } else {
        multHome = 0.50;
        multAway = 1.35;
      }
    } else {
      regime = TacticalRegimeType.RED_CARD_RESILIENCE;
      desc = `受罚方 (${disadvantagedSide === 'home' ? '主队' : '客队'}) 积极构筑密集低位防线，尚具备组织弹性。`;
      if (advantagedSide === 'home') {
        multHome = 1.15;
        multAway = 0.70;
      } else {
        multHome = 0.70;
        multAway = 1.15;
      }
    }
  }
  // (B) 进球后态势与分差判定
  else if (scoreDiff !== 0) {
    const leadingSide = scoreDiff > 0 ? 'home' : 'away';
    const chasingSide = scoreDiff > 0 ? 'away' : 'home';
    const chasingEpi = chasingSide === 'home' ? epi.home : epi.away;
    const leadingSlope = leadingSide === 'home' ? timeline.slope_5m : -timeline.slope_5m;

    // 1. 连续短时间内崩盘 (5~10 分钟内连续失球)
    if (goalEvents.length >= 2) {
      const g1 = goalEvents[goalEvents.length - 1];
      const g2 = goalEvents[goalEvents.length - 2];
      const side1 = getEventSide(g1);
      const side2 = getEventSide(g2);
      const m1 = getEventMinute(g1);
      const m2 = getEventMinute(g2);
      if (side1 === side2 && Math.abs(m1 - m2) <= 10) {
        regime = TacticalRegimeType.COLLAPSING_PANIC;
        desc = `失球方 (${chasingSide === 'home' ? '主队' : '客队'}) 遭遇短时间内连续丢球，防守阵型出现恐慌性溃散。`;
        if (leadingSide === 'home') {
          multHome = 1.30;
          multAway = 0.60;
        } else {
          multHome = 0.60;
          multAway = 1.30;
        }
      }
    }

    if (regime === TacticalRegimeType.NEUTRAL_EQUILIBRIUM) {
      // 2. 领先后稳健收缩控场态
      if (goalElapsed !== undefined && goalElapsed <= 15 && leadingSlope < -5) {
        regime = TacticalRegimeType.LEADING_CONSOLIDATION;
        desc = `领先方 (${leadingSide === 'home' ? '主队' : '客队'}) 进球后主动回收防线打防守反击，比赛进入攻守互易期。`;
        if (leadingSide === 'home') {
          multHome = 0.85;
          multAway = 1.10;
        } else {
          multHome = 1.10;
          multAway = 0.85;
        }
      }
      // 3. 盲目压上被反击态 (落后方狂攻但零转化，领先方致命反击)
      else if (chasingEpi.classification === EventPressureConversionType.BARREN_DOMINANCE) {
        regime = TacticalRegimeType.VULNERABLE_OVEREXTENSION;
        desc = `落后方 (${chasingSide === 'home' ? '主队' : '客队'}) 盲目全线压上但缺乏实质威胁，极易被领先方打出致命反击。`;
        if (leadingSide === 'home') {
          multHome = 1.25;
          multAway = 0.70;
        } else {
          multHome = 0.70;
          multAway = 1.25;
        }
      }
      // 4. 终盘一球绝境搏命态
      else if (Math.abs(scoreDiff) === 1 && currentMinute >= 75) {
        regime = TacticalRegimeType.DESPERATION_ASSAULT;
        desc = `终盘 75'+ 一球落后，落后方 (${chasingSide === 'home' ? '主队' : '客队'}) 全线压上搏命，中后场空间彻底开放。`;
        multHome = 1.20;
        multAway = 1.20;
      }
      // 5. 秩序追赶态
      else if (chasingEpi.classification === EventPressureConversionType.LETHAL_SIEGE) {
        regime = TacticalRegimeType.ORDERED_CHASE;
        desc = `落后方 (${chasingSide === 'home' ? '主队' : '客队'}) 组织有序，持续制造有威胁攻门，防守方抗压面临严峻考验。`;
        if (chasingSide === 'home') {
          multHome = 1.20;
          multAway = 0.85;
        } else {
          multHome = 0.85;
          multAway = 1.20;
        }
      }
    }
  }

  return {
    current_regime: regime,
    last_goal_elapsed_minutes: goalElapsed,
    last_goal_scorer: lastGoalScorer,
    red_card_active_side: redSide,
    red_card_elapsed_minutes: redElapsed,
    tactical_description: desc,
    regime_multiplier_home: multHome,
    regime_multiplier_away: multAway
  };
}

/**
 * 维度三：计算破门势能临界态 (Goal Climax Tipping Point)
 */
export function evaluateGoalClimax(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures,
  epi: EventPressureConversionFeatures
): GoalClimaxFeatures {
  const currentMinute = match.timing.minute ?? 0;
  const events = match.timeline_events ?? [];
  const recentEvents = events.filter(e => {
    const m = getEventMinute(e);
    return m >= currentMinute - 5 && m <= currentMinute && !e.is_cancelled;
  });

  // 1. 二阶动量加速度: 近 5 分钟斜率 - 近 15 分钟斜率
  const slope5 = timeline.slope_5m;
  const slope15 = timeline.slope_15m;
  const acceleration = Number((slope5 - slope15).toFixed(2));

  // 2. 尾端 5 分钟事件密集度
  let homeIncidents = 0;
  let awayIncidents = 0;

  for (const ev of recentEvents) {
    const side = getEventSide(ev);
    if (side === 'home') homeIncidents++;
    else if (side === 'away') awayIncidents++;
  }

  // 3. 计算主客双方临界破门得分
  // 综合: 5m 能量 + 5m 斜率 + 二阶加速度 + 尾端事件密集度
  const homeEnergy5m = timeline.integral_5m ? timeline.integral_5m.home : 0;
  const awayEnergy5m = timeline.integral_5m ? timeline.integral_5m.away : 0;

  const homeScoreRaw = (homeEnergy5m / 100.0) * 25.0 + Math.max(0, slope5) * 1.5 + Math.max(0, acceleration) * 1.0 + (homeIncidents * 15.0);
  const awayScoreRaw = (awayEnergy5m / 100.0) * 25.0 + Math.max(0, -slope5) * 1.5 + Math.max(0, -acceleration) * 1.0 + (awayIncidents * 15.0);

  const dominantSide: 'home' | 'away' | 'none' = homeScoreRaw > awayScoreRaw && homeScoreRaw > 30 ? 'home' : (awayScoreRaw > homeScoreRaw && awayScoreRaw > 30 ? 'away' : 'none');
  const climaxScore = Number(Math.min(100, Math.max(0, Math.max(homeScoreRaw, awayScoreRaw))).toFixed(1));

  let level = GoalClimaxLevel.DORMANT;
  if (climaxScore >= 75) level = GoalClimaxLevel.EXTREME_IMMINENT;
  else if (climaxScore >= 55) level = GoalClimaxLevel.HIGH_PRESSURE;
  else if (climaxScore >= 35) level = GoalClimaxLevel.MODERATE_BUILDUP;

  return {
    climax_score: climaxScore,
    climax_level: level,
    attacking_side: dominantSide,
    momentum_acceleration_5m: acceleration,
    recent_incident_density_5m: dominantSide === 'home' ? homeIncidents : (dominantSide === 'away' ? awayIncidents : 0),
    is_imminent_threat: level === GoalClimaxLevel.EXTREME_IMMINENT
  };
}

/**
 * 统帅部主函数：提取全量时空事件共生特征
 */
export function extractSpatioTemporalEventFeatures(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  tracer?: Tracer
): SpatioTemporalEventFeatures {
  const currentMinute = match.timing.minute ?? 0;
  const events = match.timeline_events ?? [];

  // 1. EPI 转化
  const epi = calculateEventPressureConversion(timeline, events, currentMinute);

  // 2. 战术相变
  const regime = evaluateTacticalRegime(match, timeline, epi, physical);

  // 3. 破门临界
  const goalClimax = evaluateGoalClimax(match, timeline, epi);

  const activeTracer = tracer ?? Tracer.getInstance();
  activeTracer.log(
    'INFO',
    'QUANT_03_EVENT_MOMENTUM_FUSION',
    'SPATIO_TEMPORAL_SOLVED',
    `Event-Momentum Spatio-Temporal fusion complete. Regime: ${regime.current_regime}, Climax: ${goalClimax.climax_level} (${goalClimax.climax_score})`,
    {
      regime: regime.current_regime,
      climax_score: goalClimax.climax_score,
      home_epi: epi.home.classification,
      away_epi: epi.away.classification
    },
    match.canonical_id
  );

  return {
    epi,
    regime,
    goal_climax: goalClimax
  };
}

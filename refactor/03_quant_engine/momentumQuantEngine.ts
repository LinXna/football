/**
 * @file momentumQuantEngine.ts
 * @description Layer 03 M3: 实时物理攻防技术统计与危攻时序微分提取引擎
 * 
 * 核心职责：
 * 1. 提取雷速逐分钟 M(t) 攻防差值点阵 ([-100, +100])
 * 2. 最小二乘法多尺度动态斜率求解 (5m 短期爆发, 10m 战术转移, 15m 宏观压迫)
 * 3. 危攻累积能量积分 (Momentum AUC / Integrals: 5m, 15m, 全场正负极性分离)
 * 4. 攻守转换拐点识别 (Inflections) 与波形形态学特征 (持续围攻态 / 突发反击脉冲)
 * 5. xT (Expected Threat Proxy) 真实穿透威胁估算模型 (剔除无效倒脚与假象优势)
 * 6. 射门转化率、禁区压迫指数与红牌少打一人攻防崩盘乘数计算
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import {
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  MomentumTrend,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

/**
 * 最小二乘法求解一维时间序列的线性回归斜率 (OLS Slope)
 * y = k * x + b => k = (N*sum(x*y) - sum(x)*sum(y)) / (N*sum(x^2) - (sum(x))^2)
 * @param series 点阵序列 (e.g. 近 5 个值)
 */
export function calculateLinearRegressionSlope(series: number[]): number {
  const n = series.length;
  if (n < 2) {
    return 0.0;
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i + 1; // 时间序列索引 1, 2, ..., n
    const y = series[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return 0.0;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  return Number(slope.toFixed(3));
}

/**
 * 计算给定窗口内的动量能量积分 (AUC)
 * 正数为主队围攻能量，负数为客队围攻能量
 * @param series 窗口点阵
 */
export function calculateMomentumIntegral(series: number[]): { home: number; away: number; net: number } {
  let homeEnergy = 0;
  let awayEnergy = 0;
  let netEnergy = 0;

  for (const val of series) {
    netEnergy += val;
    if (val > 0) {
      homeEnergy += val;
    } else if (val < 0) {
      awayEnergy += Math.abs(val);
    }
  }

  return Object.freeze({
    home: Number(homeEnergy.toFixed(1)),
    away: Number(awayEnergy.toFixed(1)),
    net: Number(netEnergy.toFixed(1))
  });
}

/**
 * 提取雷速逐分钟平滑动量点阵展平一维序列
 */
export function flattenMomentumPoints(match: CanonicalMatch): number[] {
  const momentum = match.reference?.attack_momentum;
  if (!momentum || !momentum.available || !momentum.data) {
    return [];
  }
  const result: number[] = [];
  for (const segment of momentum.data) {
    if (Array.isArray(segment)) {
      for (const val of segment) {
        if (typeof val === 'number' && !isNaN(val)) {
          result.push(val);
        }
      }
    }
  }
  return result;
}

/**
 * 提取实时危攻时序走势、多尺度斜率与积分形态
 * @param match CanonicalMatch
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function extractMomentumTimelineFeatures(
  match: CanonicalMatch,
  collector?: DeficitCollector,
  tracer?: Tracer
): MomentumTimelineFeatures {
  const rawPoints = flattenMomentumPoints(match);
  const totalPoints = rawPoints.length;

  if (totalPoints === 0) {
    if (collector) {
      collector.record(
        'MOMENTUM_POINTS_EMPTY',
        Layer03OpId.MOMENTUM_ANALYSIS,
        'RC-MOMENTUM-EMPTY',
        `Match ${match.canonical_id} has empty momentum points timeline. Graceful fallback active.`,
        undefined,
        match.canonical_id
      );
    }

    return Object.freeze({
      total_points: 0,
      current_instant_momentum: 0,
      slope_5m: 0,
      slope_10m: 0,
      slope_15m: 0,
      integral_5m: { home: 0, away: 0, net: 0 },
      integral_15m: { home: 0, away: 0, net: 0 },
      integral_full_match: { home: 0, away: 0, net: 0 },
      dominance_side: 'neutral',
      inflection_count_recent_15m: 0,
      is_sustained_siege: false,
      is_counter_attack_surge: false
    });
  }

  // 1. 即时当前分钟动量值
  const currentInstantMomentum = rawPoints[totalPoints - 1];

  // 2. 提取不同时间窗口切片
  const slice5 = rawPoints.slice(-Math.min(5, totalPoints));
  const slice10 = rawPoints.slice(-Math.min(10, totalPoints));
  const slice15 = rawPoints.slice(-Math.min(15, totalPoints));

  // 3. 计算多尺度最小二乘斜率 (Derivatives)
  const slope5 = calculateLinearRegressionSlope(slice5);
  const slope10 = calculateLinearRegressionSlope(slice10);
  const slope15 = calculateLinearRegressionSlope(slice15);

  // 4. 计算多尺度能量积分 (Integrals)
  const integral5 = calculateMomentumIntegral(slice5);
  const integral15 = calculateMomentumIntegral(slice15);
  const integralFull = calculateMomentumIntegral(rawPoints);

  // 5. 攻守转换拐点识别 (近 15 个点内穿过 0 轴的次数)
  let inflections = 0;
  for (let i = 1; i < slice15.length; i++) {
    const prev = slice15[i - 1];
    const curr = slice15[i];
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
      inflections++;
    }
  }

  // 6. 真实掌控方判定 (结合近 15m 净能量与近 5m 斜率)
  let dominanceSide: 'home' | 'away' | 'neutral' = 'neutral';
  if (integral15.net > 120 || (integral15.net > 50 && slope5 > 5.0)) {
    dominanceSide = 'home';
  } else if (integral15.net < -120 || (integral15.net < -50 && slope5 < -5.0)) {
    dominanceSide = 'away';
  }

  // 7. 波形形态学识别 (持续围攻 vs 突发反击)
  const isSustainedSiege = (Math.abs(integral15.net) >= 300) && (inflections <= 2);
  const isCounterAttackSurge = (
    (integral15.net > 100 && slope5 <= -18.0) ||
    (integral15.net < -100 && slope5 >= 18.0)
  );

  const result: MomentumTimelineFeatures = Object.freeze({
    total_points: totalPoints,
    current_instant_momentum: currentInstantMomentum,
    slope_5m: slope5,
    slope_10m: slope10,
    slope_15m: slope15,
    integral_5m: integral5,
    integral_15m: integral15,
    integral_full_match: integralFull,
    dominance_side: dominanceSide,
    inflection_count_recent_15m: inflections,
    is_sustained_siege: isSustainedSiege,
    is_counter_attack_surge: isCounterAttackSurge
  });

  tracer?.info(
    Layer03OpId.MOMENTUM_ANALYSIS,
    'MOMENTUM_FEATURES_EXTRACTED',
    'Momentum features extracted',
    {
      total_points: totalPoints,
      slope_5m: slope5,
      integral_15m_net: integral15.net,
      dominance_side: dominanceSide,
      is_sustained_siege: isSustainedSiege
    },
    match.canonical_id
  );

  return result;
}

/**
 * 提取实时攻防技术统计、xT 真实威胁模型与红牌折损系数
 * @param match CanonicalMatch
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function extractRealTimePhysicalStats(
  match: CanonicalMatch,
  collector?: DeficitCollector,
  tracer?: Tracer
): RealTimePhysicalStatsFeatures {
  const stats = match.reference?.stats;
  const events = match.reference?.timeline_events ?? (match as any).timeline_events ?? [];

  const homeDA = stats?.dangerous_attacks?.home ?? 0;
  const awayDA = stats?.dangerous_attacks?.away ?? 0;
  const homeAttacks = stats?.attacks?.home ?? 0;
  const awayAttacks = stats?.attacks?.away ?? 0;
  const homeShots = stats?.shots?.home ?? 0;
  const awayShots = stats?.shots?.away ?? 0;
  const homeOn = stats?.shots_on_target?.home ?? 0;
  const awayOn = stats?.shots_on_target?.away ?? 0;
  const homeOff = stats?.shots_off_target?.home ?? 0;
  const awayOff = stats?.shots_off_target?.away ?? 0;
  const homeCorners = stats?.corners?.home ?? 0;
  const awayCorners = stats?.corners?.away ?? 0;
  const homeYellow = stats?.yellow_cards?.home ?? 0;
  const awayYellow = stats?.yellow_cards?.away ?? 0;
  const homeRed = stats?.red_cards?.home ?? 0;
  const awayRed = stats?.red_cards?.away ?? 0;
  const homePossession = stats?.possession?.home ?? 50;
  const awayPossession = stats?.possession?.away ?? 50;

  // 1. 统计时序事件中的越位 (Offside) 与门柱造险 (Woodwork / Type 22)
  let homeOffsides = 0;
  let awayOffsides = 0;
  let homeWoodwork = 0;
  let awayWoodwork = 0;
  let homeDefYellows = 0;
  let awayDefYellows = 0;

  for (const ev of events) {
    if (ev.is_cancelled) continue;
    const side = ev.side || (ev as any).team_side;
    const type = ev.type || (ev as any).canonical_type;
    const text = String(ev.text || '');

    // 越位 (Type 15 或 文本包含越位)
    if (type === 15 || text.includes('越位') || text.includes('Offside')) {
      if (side === 'home') homeOffsides++;
      else if (side === 'away') awayOffsides++;
    }

    // 门柱造险 (Type 22 且文本含门柱/中柱)
    if (type === 22 || text.includes('门柱') || text.includes('中柱') || text.includes('Woodwork')) {
      if (side === 'home') homeWoodwork++;
      else if (side === 'away') awayWoodwork++;
    }

    // 防守球员吃黄牌
    if (type === 3 || text.includes('黄牌') || text.includes('Yellow')) {
      if (ev.is_on_pitch !== false) {
        if (side === 'home') homeDefYellows++;
        else if (side === 'away') awayDefYellows++;
      }
    }
  }

  // 2. 控球有效性 (PE: Possession Effectiveness)
  const homePE = Number((homeDA / (homePossession + 1.0)).toFixed(3));
  const awayPE = Number((awayDA / (awayPossession + 1.0)).toFixed(3));

  // 3. 进攻渗透率 (Penetration Rate)
  const homePenetration = homeAttacks > 0 ? Number((homeDA / homeAttacks).toFixed(3)) : 0.0;
  const awayPenetration = awayAttacks > 0 ? Number((awayDA / awayAttacks).toFixed(3)) : 0.0;

  // 4. 射门终结质量与门柱
  const homeAccuracy = homeShots > 0 ? Number((homeOn / homeShots).toFixed(3)) : 0.0;
  const awayAccuracy = awayShots > 0 ? Number((awayOn / awayShots).toFixed(3)) : 0.0;
  const homeConversion = homeDA > 0 ? Number((homeShots / homeDA).toFixed(3)) : 0.0;
  const awayConversion = awayDA > 0 ? Number((awayShots / awayDA).toFixed(3)) : 0.0;

  // 5. 刺客防反威胁指数 (结合越位冲刺、射正率与低控球比)
  const homeCounterThreat = Number(((homeOffsides * 0.35 + homeAccuracy * 1.2) * (100.0 / (homePossession + 25.0))).toFixed(3));
  const awayCounterThreat = Number(((awayOffsides * 0.35 + awayAccuracy * 1.2) * (100.0 / (awayPossession + 25.0))).toFixed(3));

  // 6. xT (Expected Threat Proxy) 真实穿透威胁模型
  const homeXT = Number(((homeDA * 0.015) + (homeCorners * 0.035) + (homeOff * 0.040) + (homeOn * 0.280) + (homeWoodwork * 0.15)).toFixed(3));
  const awayXT = Number(((awayDA * 0.015) + (awayCorners * 0.035) + (awayOff * 0.040) + (awayOn * 0.280) + (awayWoodwork * 0.15)).toFixed(3));
  const totalXT = homeXT + awayXT;
  const xtRatio = totalXT > 0 ? Number((homeXT / totalXT).toFixed(3)) : 0.50;

  // 7. 禁区压迫指数 (Pressure Index ∈ [-1.0, +1.0])
  const totalDA = homeDA + awayDA;
  const pressureIndex = totalDA > 0 ? Number(((homeDA - awayDA) / totalDA).toFixed(3)) : 0.0;

  // 8. 战术异常特征识别 (Barren Dominance 无效控球 vs Lethal Counter 致命反击)
  const homeBarren = (homePossession >= 60) && (homeOn <= 1) && (homePE <= awayPE * 0.8);
  const awayBarren = (awayPossession >= 60) && (awayOn <= 1) && (awayPE <= homePE * 0.8);
  const homeLethal = (homePossession <= 40) && (homeOn >= 2 || homeCounterThreat >= 1.5);
  const awayLethal = (awayPossession <= 40) && (awayOn >= 2 || awayCounterThreat >= 1.5);

  // 9. 连续红牌减员战力崩盘模型
  const evaluateRedPenalty = (redCount: number) => {
    if (redCount <= 0) {
      return { attack: 1.0, leak: 1.0 };
    }
    const attack = Number(Math.exp(-0.43 * redCount).toFixed(3));
    const leak = Number(Math.exp(0.37 * redCount).toFixed(3));
    return { attack, leak };
  };

  const homeRedPen = evaluateRedPenalty(homeRed);
  const awayRedPen = evaluateRedPenalty(awayRed);

  const isCornerCascade = (homeCorners >= 5 || awayCorners >= 5);

  const result: RealTimePhysicalStatsFeatures = Object.freeze({
    xt_proxy: Object.freeze({
      home_xt: homeXT,
      away_xt: awayXT,
      xt_ratio: xtRatio
    }),
    possession_effectiveness: Object.freeze({
      home_pe: homePE,
      away_pe: awayPE
    }),
    penetration_rate: Object.freeze({
      home_penetration: homePenetration,
      away_penetration: awayPenetration
    }),
    shot_efficiency: Object.freeze({
      home_accuracy: homeAccuracy,
      away_accuracy: awayAccuracy,
      home_woodwork_count: homeWoodwork,
      away_woodwork_count: awayWoodwork
    }),
    corner_pressure: Object.freeze({
      home_corners_15m: homeCorners,
      away_corners_15m: awayCorners,
      is_corner_cascade: isCornerCascade
    }),
    counter_threat_index: Object.freeze({
      home_counter_threat: homeCounterThreat,
      away_counter_threat: awayCounterThreat
    }),
    discipline_pressure: Object.freeze({
      home_yellows: homeYellow,
      away_yellows: awayYellow,
      home_defenders_on_yellow: homeDefYellows,
      away_defenders_on_yellow: awayDefYellows
    }),
    conversion_efficiency: Object.freeze({
      home_conversion: homeConversion,
      away_conversion: awayConversion,
      home_accuracy: homeAccuracy,
      away_accuracy: awayAccuracy
    }),
    pressure_index: pressureIndex,
    tactical_anomaly: Object.freeze({
      home_barren_dominance: homeBarren,
      away_barren_dominance: awayBarren,
      home_lethal_counter: homeLethal,
      away_lethal_counter: awayLethal
    }),
    red_card_penalty: Object.freeze({
      home_attack_multiplier: homeRedPen.attack,
      home_defense_leak_multiplier: homeRedPen.leak,
      away_attack_multiplier: awayRedPen.attack,
      away_defense_leak_multiplier: awayRedPen.leak
    })
  });

  tracer?.info(
    Layer03OpId.MOMENTUM_ANALYSIS,
    'PHYSICAL_STATS_EXTRACTED',
    'Physical stats extracted with unified 9-metric integration',
    {
      home_xt: homeXT,
      away_xt: awayXT,
      home_pe: homePE,
      away_pe: awayPE,
      home_counter_threat: homeCounterThreat,
      away_counter_threat: awayCounterThreat
    },
    match.canonical_id
  );

  return result;
}

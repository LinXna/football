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
import { CanonicalEventType } from '../02_canonical_model/enums.js';
import { ParsedPlayer } from '../01_data_ingestion/leisu/types.js';
import {
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  MomentumTrend,
  YellowCardContextType,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { classifyYellowCardContext } from './eventMomentumFusion.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

/**
 * 辅助函数：提取首发阵容球员位置映射
 */
function buildPlayerPositionMap(starters?: ParsedPlayer[]): Map<string, 'DF' | 'GK' | 'MF' | 'FW'> {
  const map = new Map<string, 'DF' | 'GK' | 'MF' | 'FW'>();
  if (!starters || !Array.isArray(starters)) return map;
  for (const p of starters) {
    if (!p.name) continue;
    const posStr = String(p.position || p.position_name || p.position_code || '').toUpperCase();
    let zone: 'DF' | 'GK' | 'MF' | 'FW' = 'MF';
    if (posStr.includes('GK') || posStr.includes('门将') || posStr.includes('守门员') || posStr === 'G') zone = 'GK';
    else if (posStr.includes('DF') || posStr.includes('CB') || posStr.includes('LB') || posStr.includes('RB') || posStr.includes('后卫') || posStr.includes('DM') || posStr.includes('CDM') || posStr.includes('后腰') || posStr === 'D' || posStr.includes('DEF')) zone = 'DF';
    else if (posStr.includes('FW') || posStr.includes('ST') || posStr.includes('CF') || posStr.includes('LW') || posStr.includes('RW') || posStr.includes('前锋') || posStr === 'F') zone = 'FW';
    map.set(p.name.trim().toLowerCase(), zone);
  }
  return map;
}

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

interface TimedMomentumPoint {
  minute: number;
  value: number;
}

function getTimedMomentumPoints(match: CanonicalMatch): {
  points: TimedMomentumPoint[];
  basis: MomentumTimelineFeatures['window_basis'];
  cutoffMinute: number | null;
  temporalLagMinutes: number;
  temporalInversionDetected: boolean;
} {
  const momentum = match.reference?.attack_momentum;
  const cutoffMinute = match.timing.stage === 'LIVE'
    ? match.timing.minute
    : null;

  if (!momentum || !momentum.available || !momentum.data || momentum.data.length === 0) {
    return {
      points: [],
      basis: 'UNAVAILABLE',
      cutoffMinute,
      temporalLagMinutes: 0,
      temporalInversionDetected: false
    };
  }

  const segmentMinutes = momentum.nominal_segment_minutes;
  let allPoints: TimedMomentumPoint[] = [];

  if (segmentMinutes === null || segmentMinutes === undefined || !Number.isFinite(segmentMinutes) || segmentMinutes <= 0) {
    allPoints = flattenMomentumPoints(match).map((value, index) => ({ minute: index + 1, value }));
  } else {
    momentum.data.forEach((segment, segmentIndex) => {
      if (!Array.isArray(segment)) return;
      segment.forEach((value, pointIndex) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return;
        const minute = segmentIndex * segmentMinutes + pointIndex + 1;
        allPoints.push({ minute, value });
      });
    });
  }

  // 方案 6：多源时钟一致性与严格截断
  // 1. 检查是否存在未来倒挂数据（即雷速点阵分钟 > YBTY 权威滚球时钟 cutoffMinute）
  let temporalInversionDetected = false;
  if (cutoffMinute !== null && allPoints.some(p => p.minute > cutoffMinute)) {
    temporalInversionDetected = true;
  }

  // 严格物理截断：绝不让未来点进入即时评估
  const validPoints = cutoffMinute === null
    ? allPoints
    : allPoints.filter(p => p.minute <= cutoffMinute);

  // 2. 检查雷速时序是否存在严重滞后
  const maxAvailableMinute = validPoints.length > 0 ? validPoints[validPoints.length - 1].minute : 0;
  const temporalLagMinutes = (cutoffMinute !== null && maxAvailableMinute > 0)
    ? Math.max(0, cutoffMinute - maxAvailableMinute)
    : 0;

  const basis = (segmentMinutes === null || segmentMinutes === undefined || !Number.isFinite(segmentMinutes) || segmentMinutes <= 0)
    ? 'POINT_COUNT_FALLBACK'
    : 'MINUTE_ALIGNED';

  return {
    points: validPoints,
    basis,
    cutoffMinute,
    temporalLagMinutes,
    temporalInversionDetected
  };
}

function calculateTimedSlope(points: TimedMomentumPoint[]): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.minute, 0);
  const sumY = points.reduce((sum, point) => sum + point.value, 0);
  const sumXY = points.reduce((sum, point) => sum + point.minute * point.value, 0);
  const sumXX = points.reduce((sum, point) => sum + point.minute * point.minute, 0);
  const denominator = n * sumXX - sumX * sumX;
  return denominator === 0 ? 0 : Number(((n * sumXY - sumX * sumY) / denominator).toFixed(3));
}

function selectTimedWindow(points: TimedMomentumPoint[], cutoffMinute: number | null, duration: number): number[] {
  if (points.length === 0) return [];
  const end = cutoffMinute ?? points[points.length - 1].minute;
  return points
    .filter((point) => point.minute > end - duration && point.minute <= end)
    .map((point) => point.value);
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
  const timed = getTimedMomentumPoints(match);
  const timedPoints = timed.points;
  const rawPoints = timedPoints.map((point) => point.value);
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
      window_basis: timed.basis,
      cutoff_minute: timed.cutoffMinute,
      window_coverage_minutes: { from: null, to: timed.cutoffMinute },
      window_sample_counts: { five: 0, ten: 0, fifteen: 0 },
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
      is_counter_attack_surge: false,
      adaptive_window_ratio: { five: 0, ten: 0, fifteen: 0 },
      is_early_match_dampened: false,
      temporal_inversion_detected: timed.temporalInversionDetected,
      temporal_lag_warning: timed.temporalLagMinutes > 8,
      temporal_lag_minutes: timed.temporalLagMinutes,
      momentum_pyramid: Object.freeze({
        composite_slope: 0,
        composite_energy: 0,
        consistency: 'DIVERGENT' as const,
        trend_hierarchy: Object.freeze({
          short_term_5m: 0,
          medium_term_10m: 0,
          macro_15m: 0
        })
      })
    });
  }

  // 1. 即时当前分钟动量值
  const currentInstantMomentum = rawPoints[totalPoints - 1];

  // 2. 方案 6：自适应窗口调和 (Adaptive Window Harmonization)
  // 当开场时间较短 (如 cutoffMinute = 7' < 15') 时，实际可用时间不足目标 duration
  const currentElapsed = timed.cutoffMinute ?? (timedPoints[timedPoints.length - 1]?.minute ?? 90);
  const isEarlyMatch = currentElapsed < 15;

  const actualDuration5 = Math.min(5, Math.max(1, currentElapsed));
  const actualDuration10 = Math.min(10, Math.max(1, currentElapsed));
  const actualDuration15 = Math.min(15, Math.max(1, currentElapsed));

  const slice5 = selectTimedWindow(timedPoints, timed.cutoffMinute, 5);
  const slice10 = selectTimedWindow(timedPoints, timed.cutoffMinute, 10);
  const slice15 = selectTimedWindow(timedPoints, timed.cutoffMinute, 15);

  const ratio5 = Number((Math.min(slice5.length, actualDuration5) / 5.0).toFixed(2));
  const ratio10 = Number((Math.min(slice10.length, actualDuration10) / 10.0).toFixed(2));
  const ratio15 = Number((Math.min(slice15.length, actualDuration15) / 15.0).toFixed(2));

  // 3. 计算多尺度最小二乘斜率 (Derivatives)
  const slope5 = calculateTimedSlope(timedPoints.filter((point) => point.minute > (timed.cutoffMinute ?? point.minute) - 5 && point.minute <= (timed.cutoffMinute ?? point.minute)));
  const slope10 = calculateTimedSlope(timedPoints.filter((point) => point.minute > (timed.cutoffMinute ?? point.minute) - 10 && point.minute <= (timed.cutoffMinute ?? point.minute)));
  const slope15 = calculateTimedSlope(timedPoints.filter((point) => point.minute > (timed.cutoffMinute ?? point.minute) - 15 && point.minute <= (timed.cutoffMinute ?? point.minute)));

  // 4. 计算多尺度能量积分 (Integrals)
  const rawIntegral5 = calculateMomentumIntegral(slice5);
  const rawIntegral15 = calculateMomentumIntegral(slice15);
  const integralFull = calculateMomentumIntegral(rawPoints);

  // 自适应能量调和：在开场样本不足时，按实际有效分钟数进行物理等效归一化，杜绝直接除以 15 带来的假稀释
  const effectiveNorm5 = Math.max(1, slice5.length);
  const effectiveNorm15 = Math.max(1, slice15.length);
  const energy5 = Number((rawIntegral5.net / effectiveNorm5).toFixed(2));
  const energy15 = Number((rawIntegral15.net / effectiveNorm15).toFixed(2));

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
  if (rawIntegral15.net > 120 || (rawIntegral15.net > 50 && slope5 > 5.0)) {
    dominanceSide = 'home';
  } else if (rawIntegral15.net < -120 || (rawIntegral15.net < -50 && slope5 < -5.0)) {
    dominanceSide = 'away';
  }

  // 7. 波形形态学识别 (持续围攻 vs 突发反击)
  const isSustainedSiege = (Math.abs(rawIntegral15.net) >= 300) && (inflections <= 2);
  const isCounterAttackSurge = (
    (rawIntegral15.net > 100 && slope5 <= -18.0) ||
    (rawIntegral15.net < -100 && slope5 >= 18.0)
  );

  // 8. 多尺度动量金字塔模型 (5m: 40%, 10m: 35%, 15m: 25%)
  const pyramidCompositeSlope = Number((0.40 * slope5 + 0.35 * slope10 + 0.25 * slope15).toFixed(3));
  const pyramidCompositeEnergy = Number((0.40 * currentInstantMomentum + 0.35 * energy5 + 0.25 * energy15).toFixed(2));

  let pyramidConsistency: 'ALIGNED' | 'DIVERGENT' | 'TURNING' = 'DIVERGENT';
  const isSlope5NonZero = Math.abs(slope5) >= 1.0;
  const isSlope10NonZero = Math.abs(slope10) >= 1.0;
  const isSlope15NonZero = Math.abs(slope15) >= 1.0;
  const sameSign = (slope5 > 0 && slope10 > 0 && slope15 > 0) || (slope5 < 0 && slope10 < 0 && slope15 < 0);

  if (isSlope5NonZero && isSlope10NonZero && isSlope15NonZero && sameSign) {
    pyramidConsistency = 'ALIGNED';
  } else if ((slope5 * slope15 < 0) && Math.abs(slope5 - slope15) >= 10.0) {
    pyramidConsistency = 'TURNING';
  } else {
    pyramidConsistency = 'DIVERGENT';
  }

  const momentumPyramid = Object.freeze({
    composite_slope: pyramidCompositeSlope,
    composite_energy: pyramidCompositeEnergy,
    consistency: pyramidConsistency,
    trend_hierarchy: Object.freeze({
      short_term_5m: slope5,
      medium_term_10m: slope10,
      macro_15m: slope15
    })
  });

  const result: MomentumTimelineFeatures = Object.freeze({
    total_points: totalPoints,
    window_basis: timed.basis,
    cutoff_minute: timed.cutoffMinute,
    window_coverage_minutes: {
      from: timedPoints[0]?.minute ?? null,
      to: timedPoints[timedPoints.length - 1]?.minute ?? timed.cutoffMinute
    },
    window_sample_counts: {
      five: slice5.length,
      ten: slice10.length,
      fifteen: slice15.length
    },
    current_instant_momentum: currentInstantMomentum,
    slope_5m: slope5,
    slope_10m: slope10,
    slope_15m: slope15,
    integral_5m: rawIntegral5,
    integral_15m: rawIntegral15,
    integral_full_match: integralFull,
    dominance_side: dominanceSide,
    inflection_count_recent_15m: inflections,
    is_sustained_siege: isSustainedSiege,
    is_counter_attack_surge: isCounterAttackSurge,
    adaptive_window_ratio: {
      five: ratio5,
      ten: ratio10,
      fifteen: ratio15
    },
    is_early_match_dampened: isEarlyMatch,
    temporal_inversion_detected: timed.temporalInversionDetected,
    temporal_lag_warning: timed.temporalLagMinutes > 8,
    temporal_lag_minutes: timed.temporalLagMinutes,
    momentum_pyramid: momentumPyramid
  });

  tracer?.info(
    Layer03OpId.MOMENTUM_ANALYSIS,
    'MOMENTUM_FEATURES_EXTRACTED',
    'Momentum features extracted',
    {
      total_points: totalPoints,
      slope_5m: slope5,
      integral_15m_net: rawIntegral15.net,
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
  const hasPair = (values: { home: number | null; away: number | null } | null | undefined): boolean =>
    values?.home !== null && values?.home !== undefined && values?.away !== null && values?.away !== undefined;
  const availableMetrics = Object.freeze({
    dangerous_attacks: hasPair(stats?.dangerous_attacks),
    attacks: hasPair(stats?.attacks),
    shots: hasPair(stats?.shots),
    shots_on_target: hasPair(stats?.shots_on_target),
    shots_off_target: hasPair(stats?.shots_off_target),
    corners: hasPair(stats?.corners),
    possession: hasPair(stats?.possession),
    yellow_cards: hasPair(stats?.yellow_cards),
    red_cards: hasPair(stats?.red_cards)
  });
  const statsAvailable = availableMetrics.dangerous_attacks && availableMetrics.attacks &&
    availableMetrics.shots && availableMetrics.shots_on_target && availableMetrics.possession;
  if (!statsAvailable) {
    const missingMetrics = Object.entries(availableMetrics)
      .filter(([, available]) => !available)
      .map(([metric]) => metric);
    collector?.record('LIVE_STATS_UNAVAILABLE', Layer03OpId.MOMENTUM_ANALYSIS, 'RC-002', `Live technical statistics are incomplete (${missingMetrics.join(', ')}); zero is not a match fact.`, undefined, match.canonical_id);
  }
  const events = match.reference?.timeline_events ?? [];

  const homeDA = stats?.dangerous_attacks?.home;
  const awayDA = stats?.dangerous_attacks?.away;
  const homeAttacks = stats?.attacks?.home;
  const awayAttacks = stats?.attacks?.away;
  const homeShots = stats?.shots?.home;
  const awayShots = stats?.shots?.away;
  const homeOn = stats?.shots_on_target?.home;
  const awayOn = stats?.shots_on_target?.away;
  const homeOff = stats?.shots_off_target?.home;
  const awayOff = stats?.shots_off_target?.away;
  const homeCorners = stats?.corners?.home;
  const awayCorners = stats?.corners?.away;
  const homeYellow = stats?.yellow_cards?.home;
  const awayYellow = stats?.yellow_cards?.away;
  const homeRed = stats?.red_cards?.home;
  const awayRed = stats?.red_cards?.away;
  const homePossession = stats?.possession?.home;
  const awayPossession = stats?.possession?.away;

  // 1. 统计时序事件中的越位、门柱造险、攻防射门角球聚类与黄牌微观语义分类
  const currentMinute = Math.max(0, (match.timing?.minute ?? 0));
  const window10m = Math.max(0, currentMinute - 10);
  const pressureWindow15m = Math.max(0, currentMinute - 15); // 覆盖前置 15 分钟围攻压迫与狂轰滥炸
  const homeStarters = match.reference?.lineups?.home_starters;
  const awayStarters = match.reference?.lineups?.away_starters;
  const homePositionMap = buildPlayerPositionMap(homeStarters);
  const awayPositionMap = buildPlayerPositionMap(awayStarters);

  let homeOffsides = 0;
  let awayOffsides = 0;
  let homeWoodwork = 0;
  let awayWoodwork = 0;
  let homeDefYellows = 0;
  let awayDefYellows = 0;
  let homeTacticalYellows = 0;
  let awayTacticalYellows = 0;
  let homeDissentYellows = 0;
  let awayDissentYellows = 0;
  let homeSiegeYellows10m = 0;
  let awaySiegeYellows10m = 0;
  let homeYellowBurst10m = 0;
  let awayYellowBurst10m = 0;
  let homeShots15m = 0;
  let awayShots15m = 0;
  let homeCorners15m = 0;
  let awayCorners15m = 0;
  let homeRedDefGkCount = 0;
  let awayRedDefGkCount = 0;
  let homeRedFwCount = 0;
  let awayRedFwCount = 0;
  let homeRedMfCount = 0;
  let awayRedMfCount = 0;
  let homeBigChanceThreat = 0;
  let awayBigChanceThreat = 0;
  let homeKeeperSavesSeverity = 0;
  let awayKeeperSavesSeverity = 0;

  // 射正扑救与重大险情正则解析器
  const BIG_CHANCE_SAVE_REGEX = /神勇|飞身|极限|门线解围|单刀|扑救脱手|脱手险|近距离扑救|必进球|brilliant save|point-blank|off the line|big chance/i;
  const ROUTINE_SAVE_REGEX = /抱住|没收|角度太正|轻松化解|comfortable save|routine save/i;

  // 第一阶段：先行提取近 15 分钟双方真实射门与角球压制频次（为黄牌因果共振提供依据）
  for (const ev of events) {
    if (ev.is_cancelled || ev.is_var_overturned) continue;
    const side = ev.side;
    const type = ev.type;
    const evMinute = ev.minute ?? (typeof ev.text === 'string' ? Number(ev.text.match(/\b(\d{1,3})['’]/)?.[1]) : null);
    const inWindow15m = evMinute !== null && !isNaN(evMinute) && evMinute >= pressureWindow15m && evMinute <= currentMinute;

    if (inWindow15m) {
      const isShot = type === 21 || type === 22 || type === 1 ||
                     ev.canonical_type === CanonicalEventType.SHOT_ON_TARGET ||
                     ev.canonical_type === CanonicalEventType.SHOT_OFF_TARGET ||
                     ev.canonical_type === CanonicalEventType.GOAL_REGULAR ||
                     ev.canonical_type === CanonicalEventType.GOAL_PENALTY;
      const isCorner = type === 2 || ev.canonical_type === CanonicalEventType.CORNER;
      if (isShot) {
        if (side === 'home') homeShots15m++;
        else if (side === 'away') awayShots15m++;
      }
      if (isCorner) {
        if (side === 'home') homeCorners15m++;
        else if (side === 'away') awayCorners15m++;
      }
    }
  }

  // 第二阶段：遍历所有事件，提取越位、门柱险情、扑救成色，并进行黄牌语义精准分流
  for (const ev of events) {
    if (ev.is_cancelled || ev.is_var_overturned) continue;
    const side = ev.side;
    const type = ev.type;
    const text = String(ev.text || '');
    const evMinute = ev.minute ?? (typeof ev.text === 'string' ? Number(ev.text.match(/\b(\d{1,3})['’]/)?.[1]) : null);
    const inWindow10m = evMinute !== null && !isNaN(evMinute) && evMinute >= window10m && evMinute <= currentMinute;

    // 越位 (标准事件代码 5 或标准事件类型)
    if (type === 5 || ev.canonical_type === CanonicalEventType.OFFSIDE || text.includes('越位') || text.includes('Offside')) {
      if (side === 'home') homeOffsides++;
      else if (side === 'away') awayOffsides++;
    }

    // Type 22 是射偏，只有明确文本提及门柱/中柱时才记录为门柱险情。
    if (text.includes('门柱') || text.includes('中柱') || text.includes('Woodwork')) {
      if (side === 'home') homeWoodwork++;
      else if (side === 'away') awayWoodwork++;
    }

    // 建议 3：射正扑救成色代理 (Big Chance Threat & Keeper Saves Severity)
    if (BIG_CHANCE_SAVE_REGEX.test(text)) {
      if (side === 'home') {
        homeBigChanceThreat += 0.45;
        awayKeeperSavesSeverity += 0.45; // 客队门将承受神扑解围负荷
      } else if (side === 'away') {
        awayBigChanceThreat += 0.45;
        homeKeeperSavesSeverity += 0.45; // 主队门将承受神扑解围负荷
      }
    } else if (ROUTINE_SAVE_REGEX.test(text)) {
      if (side === 'home') {
        homeBigChanceThreat += 0.10;
        awayKeeperSavesSeverity += 0.10;
      } else if (side === 'away') {
        awayBigChanceThreat += 0.10;
        homeKeeperSavesSeverity += 0.10;
      }
    }

    // 纪律黄牌事件：按语义分类器精确分流
    const isYellow = type === 3 || ev.canonical_type === CanonicalEventType.YELLOW_CARD || text.includes('黄牌') || text.includes('Yellow');
    if (isYellow && ev.is_on_pitch !== false) {
      if (inWindow10m) {
        if (side === 'home') homeYellowBurst10m++;
        else if (side === 'away') awayYellowBurst10m++;
      }

      // 获取受罚球员战术位置
      const pName = String(ev.player_name || '').trim().toLowerCase();
      const posMap = side === 'home' ? homePositionMap : awayPositionMap;
      let playerRole: 'DF' | 'GK' | 'MF' | 'FW' | null = (pName && posMap.has(pName)) ? posMap.get(pName)! : null;
      if (!playerRole) {
        if (text.includes('门将') || text.includes('守门员')) playerRole = 'GK';
        else if (text.includes('后卫') || text.includes('中卫') || text.includes('边卫') || text.includes('后腰') || text.includes('防守中场') || text.includes('cdm') || text.includes('dm')) playerRole = 'DF';
        else if (text.includes('前锋')) playerRole = 'FW';
      }

      // 获取受罚时刻对方的进攻施压特征 (以 15 分钟窗口覆盖前置高压围攻，确保同窗因果性完整)
      const oppShots = side === 'home' ? awayShots15m : homeShots15m;
      const oppCorners = side === 'home' ? awayCorners15m : homeCorners15m;
      const oppDALead = side === 'home' ? ((awayDA ?? 0) - (homeDA ?? 0)) : ((homeDA ?? 0) - (awayDA ?? 0));

      const yellowCtx = classifyYellowCardContext(ev, {
        playerRole,
        oppRecentShots10m: inWindow10m ? oppShots : 0,
        oppRecentCorners10m: inWindow10m ? oppCorners : 0,
        oppMomentumLead: inWindow10m ? oppDALead : 0
      });

      if (yellowCtx === YellowCardContextType.NON_TACTICAL_DISSENT) {
        // 非战术情绪/拖延时间黄牌：零防守减损，不计入崩溃池
        if (side === 'home') homeDissentYellows++;
        else if (side === 'away') awayDissentYellows++;
      } else if (yellowCtx === YellowCardContextType.TACTICAL_DISRUPTION) {
        // 战术牺牲犯规：合理战术延缓，不判定为防守能力下降，不计入崩溃池
        if (side === 'home') homeTacticalYellows++;
        else if (side === 'away') awayTacticalYellows++;
      } else if (yellowCtx === YellowCardContextType.DEFENSIVE_COLLAPSE_BREACH) {
        // 受迫失位高危犯规：后防失守/被动挨打 (严格限定防守球员或明确高危禁区失守犯规，杜绝未识别人员泛化)
        const isDangerousFoulText = /dangerous|box|penalty area|last man|sliding|reckless|铲球|禁区|防线失守|单刀阻截|禁区前|禁区内|绊倒/i.test(text);
        if (playerRole === 'DF' || playerRole === 'GK' || isDangerousFoulText) {
          if (side === 'home') homeDefYellows++;
          else if (side === 'away') awayDefYellows++;
        }
        if (inWindow10m) {
          if (side === 'home') homeSiegeYellows10m++;
          else if (side === 'away') awaySiegeYellows10m++;
        }
      } else {
        // 常规争抢犯规
        if (playerRole === 'DF' || playerRole === 'GK') {
          if (side === 'home') homeDefYellows++;
          else if (side === 'away') awayDefYellows++;
        }
      }
    }

    // 纪律红牌事件：按球员角色（DF/GK 核心防守 vs FW 前锋 vs MF 中场）分类统计
    const isRed = type === 4 ||
                  ev.canonical_type === CanonicalEventType.RED_CARD_DIRECT ||
                  ev.canonical_type === CanonicalEventType.RED_CARD_SECOND_YELLOW ||
                  text.includes('红牌') || text.includes('Red');
    if (isRed && ev.is_on_pitch !== false) {
      const pName = String(ev.player_name || '').trim().toLowerCase();
      const posMap = side === 'home' ? homePositionMap : awayPositionMap;
      let playerRole: 'DF' | 'GK' | 'MF' | 'FW' | null = (pName && posMap.has(pName)) ? posMap.get(pName)! : null;
      if (!playerRole) {
        if (text.includes('门将') || text.includes('守门员')) playerRole = 'GK';
        else if (text.includes('后卫') || text.includes('中卫') || text.includes('边卫') || text.includes('后腰') || text.includes('防守中场') || text.includes('cdm') || text.includes('dm')) playerRole = 'DF';
        else if (text.includes('前锋')) playerRole = 'FW';
      }

      if (side === 'home') {
        if (playerRole === 'DF' || playerRole === 'GK') homeRedDefGkCount++;
        else if (playerRole === 'FW') homeRedFwCount++;
        else homeRedMfCount++;
      } else if (side === 'away') {
        if (playerRole === 'DF' || playerRole === 'GK') awayRedDefGkCount++;
        else if (playerRole === 'FW') awayRedFwCount++;
        else awayRedMfCount++;
      }
    }
  }

  // 1.1 因果共振判定后防连续受迫染黄崩溃风险与防守漏洞恶化乘子 (Discipline Leak Factor)
  // 严格因果共振条件：
  // 1. 10 分钟内同一方连续吃到 >= 2 张受迫失位高危黄牌 (siegeYellows10m >= 2)
  // 2. 且伴随对手密集攻门/角球压制 (oppShots15m + oppCorners15m >= 2 || (oppDA && teamDA && oppDA >= teamDA + 15))
  // 或防线核心受迫染黄严重积聚 (defYellows >= 3 且对方持续压迫)
  const awayHasHeavyPressure = (awayShots15m + awayCorners15m >= 2) || (awayDA !== undefined && homeDA !== undefined && awayDA >= homeDA + 15);
  const homeHasHeavyPressure = (homeShots15m + homeCorners15m >= 2) || (homeDA !== undefined && awayDA !== undefined && homeDA >= awayDA + 15);

  const homeYellowCollapse = (homeSiegeYellows10m >= 2 && awayHasHeavyPressure) || (homeDefYellows >= 3 && awayHasHeavyPressure);
  const awayYellowCollapse = (awaySiegeYellows10m >= 2 && homeHasHeavyPressure) || (awayDefYellows >= 3 && homeHasHeavyPressure);

  // 指数平滑饱和漏洞方程：未崩溃为 1.00；崩溃失控严格在 [1.05, 1.25] 区间动态上浮
  const homeEffectiveSiege = Math.max(homeSiegeYellows10m, homeDefYellows >= 3 ? 2 : 0);
  const awayEffectiveSiege = Math.max(awaySiegeYellows10m, awayDefYellows >= 3 ? 2 : 0);

  const homeDisciplineLeak = homeYellowCollapse
    ? Number((Math.min(1.25, Math.max(1.05, 1.05 + 0.20 * (1.0 - Math.exp(-0.45 * Math.max(1, homeEffectiveSiege - 1)))))).toFixed(3))
    : 1.00;
  const awayDisciplineLeak = awayYellowCollapse
    ? Number((Math.min(1.25, Math.max(1.05, 1.05 + 0.20 * (1.0 - Math.exp(-0.45 * Math.max(1, awayEffectiveSiege - 1)))))).toFixed(3))
    : 1.00;

  // 2. 控球有效性 (PE: Possession Effectiveness)
  const homePE = (homeDA !== undefined && homePossession !== undefined) ? Number((homeDA / (homePossession + 1.0)).toFixed(3)) : undefined;
  const awayPE = (awayDA !== undefined && awayPossession !== undefined) ? Number((awayDA / (awayPossession + 1.0)).toFixed(3)) : undefined;

  // 3. 进攻渗透率 (Penetration Rate)
  const homePenetration = (homeDA !== undefined && homeAttacks !== undefined) ? (homeAttacks > 0 ? Number((homeDA / homeAttacks).toFixed(3)) : 0.0) : undefined;
  const awayPenetration = (awayDA !== undefined && awayAttacks !== undefined) ? (awayAttacks > 0 ? Number((awayDA / awayAttacks).toFixed(3)) : 0.0) : undefined;

  // 4. 射门终结质量与门柱
  const homeAccuracy = (homeOn !== undefined && homeShots !== undefined) ? (homeShots > 0 ? Number((homeOn / homeShots).toFixed(3)) : 0.0) : undefined;
  const awayAccuracy = (awayOn !== undefined && awayShots !== undefined) ? (awayShots > 0 ? Number((awayOn / awayShots).toFixed(3)) : 0.0) : undefined;
  const homeConversion = (homeShots !== undefined && homeDA !== undefined) ? (homeDA > 0 ? Number((homeShots / homeDA).toFixed(3)) : 0.0) : undefined;
  const awayConversion = (awayShots !== undefined && awayDA !== undefined) ? (awayDA > 0 ? Number((awayShots / awayDA).toFixed(3)) : 0.0) : undefined;

  // 5. 刺客防反威胁指数 (结合越位冲刺、射正率与低控球比)
  const homeCounterThreat = (homePossession !== undefined && homeAccuracy !== undefined) ? Number(((homeOffsides * 0.35 + homeAccuracy * 1.2) * (100.0 / (homePossession + 25.0))).toFixed(3)) : undefined;
  const awayCounterThreat = (awayPossession !== undefined && awayAccuracy !== undefined) ? Number(((awayOffsides * 0.35 + awayAccuracy * 1.2) * (100.0 / (awayPossession + 25.0))).toFixed(3)) : undefined;

  // 5.5 建议 2：纵向反击锐度比 (Directness Ratio = DA * (SOT + 0.5) / (max(Attacks, 1) * (Possession + 15)) * 100)
  let homeDirectnessRatio: number | undefined = undefined;
  let awayDirectnessRatio: number | undefined = undefined;
  let highDirectnessSide: 'home' | 'away' | 'none' = 'none';

  if (homeDA !== undefined && homeAttacks !== undefined && homePossession !== undefined && homeOn !== undefined) {
    const denom = Math.max(homeAttacks, 1) * (homePossession + 15.0);
    homeDirectnessRatio = Number(((homeDA * (homeOn + 0.5) / denom) * 100.0).toFixed(3));
  }
  if (awayDA !== undefined && awayAttacks !== undefined && awayPossession !== undefined && awayOn !== undefined) {
    const denom = Math.max(awayAttacks, 1) * (awayPossession + 15.0);
    awayDirectnessRatio = Number(((awayDA * (awayOn + 0.5) / denom) * 100.0).toFixed(3));
  }

  // 高锐度反击方判定：控球率 <= 45%, 直接度 >= 2.5, 射正 >= 2
  if (homeDirectnessRatio !== undefined && (homePossession ?? 50) <= 45 && homeDirectnessRatio >= 2.5 && (homeOn ?? 0) >= 2) {
    highDirectnessSide = 'home';
  } else if (awayDirectnessRatio !== undefined && (awayPossession ?? 50) <= 45 && awayDirectnessRatio >= 2.5 && (awayOn ?? 0) >= 2) {
    highDirectnessSide = 'away';
  }

  // 6. xT (Expected Threat Proxy) 真实穿透威胁模型
  const homeXT = (homeDA !== undefined && homeCorners !== undefined && homeOff !== undefined && homeOn !== undefined) ? Number(((homeDA * 0.015) + (homeCorners * 0.035) + (homeOff * 0.040) + (homeOn * 0.280) + (homeWoodwork * 0.15)).toFixed(3)) : undefined;
  const awayXT = (awayDA !== undefined && awayCorners !== undefined && awayOff !== undefined && awayOn !== undefined) ? Number(((awayDA * 0.015) + (awayCorners * 0.035) + (awayOff * 0.040) + (awayOn * 0.280) + (awayWoodwork * 0.15)).toFixed(3)) : undefined;
  const totalXT = (homeXT !== undefined && awayXT !== undefined) ? homeXT + awayXT : undefined;
  const xtRatio = (totalXT !== undefined && homeXT !== undefined) ? (totalXT > 0 ? Number((homeXT / totalXT).toFixed(3)) : 0.50) : undefined;

  // 7. 禁区压迫指数 (Pressure Index ∈ [-1.0, +1.0])
  const totalDA = (homeDA !== undefined && awayDA !== undefined) ? homeDA + awayDA : undefined;
  const pressureIndex = (totalDA !== undefined && homeDA !== undefined && awayDA !== undefined) ? (totalDA > 0 ? Number(((homeDA - awayDA) / totalDA).toFixed(3)) : 0.0) : undefined;

  // 8. 战术异常特征识别 (Barren Dominance 无效控球 vs Lethal Counter 致命反击)
  const homeBarren = (homePossession !== undefined && homeOn !== undefined && homePE !== undefined && awayPE !== undefined) ? ((homePossession >= 60) && (homeOn <= 1) && (homePE <= awayPE * 0.8)) : undefined;
  const awayBarren = (awayPossession !== undefined && awayOn !== undefined && awayPE !== undefined && homePE !== undefined) ? ((awayPossession >= 60) && (awayOn <= 1) && (awayPE <= homePE * 0.8)) : undefined;
  const homeLethal = (homePossession !== undefined && homeOn !== undefined && homeCounterThreat !== undefined) ? ((homePossession <= 40) && (homeOn >= 2 || homeCounterThreat >= 1.5)) : undefined;
  const awayLethal = (awayPossession !== undefined && awayOn !== undefined && awayCounterThreat !== undefined) ? ((awayPossession <= 40) && (awayOn >= 2 || awayCounterThreat >= 1.5)) : undefined;

  // 8.5 进攻威胁转化指数 (TTI, Threat Transformation Index = 射门转化率 * 危险进攻强度 * 进区触球代理)
  let ttiFeatures: RealTimePhysicalStatsFeatures['threat_transformation_index'] = undefined;
  if (statsAvailable && homeDA !== undefined && awayDA !== undefined && homeAttacks !== undefined && awayAttacks !== undefined &&
      homeShots !== undefined && awayShots !== undefined && homeOn !== undefined && awayOn !== undefined &&
      homePossession !== undefined && awayPossession !== undefined) {
    const calculateSideTTI = (shots: number, da: number, attacks: number, sot: number, poss: number) => {
      const shotConversion = da > 0 ? shots / da : 0.0;
      const daIntensity = attacks > 0 ? da / attacks : 0.0;
      const boxProxy = Math.min(5.0, (da * (sot + 1.0)) / (poss + 10.0));
      return Number((shotConversion * daIntensity * boxProxy * 10.0).toFixed(3));
    };

    const homeTTIVal = calculateSideTTI(homeShots, homeDA, homeAttacks, homeOn, homePossession);
    const awayTTIVal = calculateSideTTI(awayShots, awayDA, awayAttacks, awayOn, awayPossession);
    const totalTTI = homeTTIVal + awayTTIVal;
    const ttiRatio = totalTTI > 0 ? Number((homeTTIVal / totalTTI).toFixed(3)) : 0.50;

    let advSide: 'home' | 'away' | 'neutral' = 'neutral';
    if (homeTTIVal >= awayTTIVal * 1.35 && homeTTIVal >= 1.2) {
      advSide = 'home';
    } else if (awayTTIVal >= homeTTIVal * 1.35 && awayTTIVal >= 1.2) {
      advSide = 'away';
    }

    const classifySideTTI = (val: number, sot: number, poss: number): 'LETHAL_PENETRATION' | 'EFFECTIVE_ATTACK' | 'STERILE_POSSESSION' | 'LOW_ACTIVITY' => {
      if (val >= 2.5 && sot >= 2) return 'LETHAL_PENETRATION';
      if (val >= 1.2) return 'EFFECTIVE_ATTACK';
      if (poss >= 55.0 && val < 0.8) return 'STERILE_POSSESSION';
      return 'LOW_ACTIVITY';
    };

    ttiFeatures = Object.freeze({
      home_tti: homeTTIVal,
      away_tti: awayTTIVal,
      ratio: ttiRatio,
      advantage_side: advSide,
      classification: Object.freeze({
        home: classifySideTTI(homeTTIVal, homeOn, homePossession),
        away: classifySideTTI(awayTTIVal, awayOn, awayPossession)
      })
    });
  }

  // 9. 滚球红牌场景分流 (领先/平局/落后) 与豪门覆盖策略 (Strategy Override Pattern)
  const currentHomeScore = match.score?.home_score ?? 0;
  const currentAwayScore = match.score?.away_score ?? 0;
  const currentScoreDiff = currentHomeScore - currentAwayScore; // >0 主领先, <0 客领先, =0 平局

  const mainSpread = match.markets?.full_spread_main?.home_selection ?? '0';
  const parsedLineNum = Math.abs(parseFloat(mainSpread.replace('+', '').replace('-', '')) || 0);
  const isMainSpreadDeep = parsedLineNum >= 1.0;
  const isHomeElite = (isMainSpreadDeep && (mainSpread.startsWith('-') || mainSpread.startsWith('0/-'))) ||
    ((homePossession ?? 50) >= 56.0 && (homeDA ?? 0) >= (awayDA ?? 0) * 1.4);
  const isAwayElite = (isMainSpreadDeep && (mainSpread.startsWith('+') || mainSpread.startsWith('0/+'))) ||
    ((awayPossession ?? 50) >= 56.0 && (awayDA ?? 0) >= (homeDA ?? 0) * 1.4);

  const evaluateRedPenaltyWithTactics = (
    redCount: number | undefined,
    teamScoreDiff: number,
    isEliteFavorite: boolean,
    roleBreakdown?: {
      defender_or_gk_count: number;
      forward_count: number;
      midfielder_count: number;
    }
  ) => {
    if (redCount === undefined || redCount <= 0) {
      return {
        attack: 1.0,
        leak: 1.0,
        scenario: 'NONE' as const,
        eliteOverride: false,
        overrideFactor: 1.0
      };
    }

    let scenario: 'LEADING_PARK_BUS' | 'DRAW_BALANCED_ATTRITION' | 'TRAILING_COLLAPSE_RISK';
    let baseAttack: number;
    let baseLeak: number;

    if (teamScoreDiff > 0) {
      scenario = 'LEADING_PARK_BUS';
      baseAttack = Math.exp(-0.65 * redCount);
      baseLeak = Math.exp(0.20 * redCount);
    } else if (teamScoreDiff === 0) {
      scenario = 'DRAW_BALANCED_ATTRITION';
      baseAttack = Math.exp(-0.45 * redCount);
      baseLeak = Math.exp(0.38 * redCount);
    } else {
      scenario = 'TRAILING_COLLAPSE_RISK';
      baseAttack = Math.exp(-0.35 * redCount);
      baseLeak = Math.exp(0.55 * redCount);
    }

    // 职业战术位置解耦：DF/GK 染红直接造成防线失守与制空权剥夺，FW 染红主要削减反击期望
    if (roleBreakdown) {
      const { defender_or_gk_count, forward_count } = roleBreakdown;
      if (defender_or_gk_count > 0) {
        // 后防核心每少一人，漏球乘子放大 (落后或平局时防线重组受创更剧烈)
        const defImpact = teamScoreDiff <= 0 ? 0.15 : 0.08;
        baseLeak *= Math.pow(1.0 + defImpact, defender_or_gk_count);
      }
      if (forward_count > 0 && defender_or_gk_count === 0) {
        // 仅有前锋染红时，防守结构基本保持完整，防守漏洞虚高上浮抑制 35%
        const leakExcess = baseLeak - 1.0;
        if (leakExcess > 0) {
          baseLeak = 1.0 + leakExcess * 0.65;
        }
        // 前锋缺阵更进一步压低反击输出
        baseAttack *= Math.pow(0.85, forward_count);
      }
    }

    if (isEliteFavorite) {
      const bufferedLeak = 1.0 + (baseLeak - 1.0) * 0.75;
      const bufferedAttack = 1.0 - (1.0 - baseAttack) * 0.70;
      return {
        attack: Number(bufferedAttack.toFixed(3)),
        leak: Number(bufferedLeak.toFixed(3)),
        scenario,
        eliteOverride: true,
        overrideFactor: 0.75
      };
    }

    return {
      attack: Number(baseAttack.toFixed(3)),
      leak: Number(baseLeak.toFixed(3)),
      scenario,
      eliteOverride: false,
      overrideFactor: 1.0
    };
  };

  const homeRoleBreakdown = {
    defender_or_gk_count: homeRedDefGkCount,
    forward_count: homeRedFwCount,
    midfielder_count: homeRedMfCount
  };
  const awayRoleBreakdown = {
    defender_or_gk_count: awayRedDefGkCount,
    forward_count: awayRedFwCount,
    midfielder_count: awayRedMfCount
  };

  const homeRedPen = evaluateRedPenaltyWithTactics(homeRed ?? undefined, currentScoreDiff, isHomeElite, homeRoleBreakdown);
  const awayRedPen = evaluateRedPenaltyWithTactics(awayRed ?? undefined, -currentScoreDiff, isAwayElite, awayRoleBreakdown);

  const isCornerCascade = availableMetrics.corners
    ? ((homeCorners ?? 0) >= 5 || (awayCorners ?? 0) >= 5)
    : undefined;

  // 角球转化成色校准：当近 15m 累计多个角球 (>=3) 但近 15m 射门为 0 时，判定为顺风/追分垃圾角球刷角
  const homeSterileCornerDiscount = Boolean(availableMetrics.corners && (homeCorners15m >= 3) && (homeShots15m === 0));
  const awaySterileCornerDiscount = Boolean(availableMetrics.corners && (awayCorners15m >= 3) && (awayShots15m === 0));
  const homeCornerQualityFactor = homeSterileCornerDiscount ? 0.75 : 1.00;
  const awayCornerQualityFactor = awaySterileCornerDiscount ? 0.75 : 1.00;

  const anyEliteActive = homeRedPen.eliteOverride || awayRedPen.eliteOverride;
  const eliteSide = homeRedPen.eliteOverride ? 'home' : (awayRedPen.eliteOverride ? 'away' : 'none');

  const result: RealTimePhysicalStatsFeatures = Object.freeze({
    stats_available: statsAvailable,
    stats_basis: statsAvailable ? 'CUMULATIVE_QUALITY_BASELINE' : 'UNAVAILABLE',
    available_metrics: availableMetrics,
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
      away_woodwork_count: awayWoodwork,
      home_big_chance_threat: Number(homeBigChanceThreat.toFixed(3)),
      away_big_chance_threat: Number(awayBigChanceThreat.toFixed(3)),
      home_keeper_saves_severity: Number(homeKeeperSavesSeverity.toFixed(3)),
      away_keeper_saves_severity: Number(awayKeeperSavesSeverity.toFixed(3))
    }),
    corner_pressure: Object.freeze({
      home_corners_total: homeCorners,
      away_corners_total: awayCorners,
      is_corner_cascade: isCornerCascade,
      window_source: statsAvailable ? 'CUMULATIVE_BASELINE' : 'UNAVAILABLE',
      home_sterile_corner_discount: homeSterileCornerDiscount,
      away_sterile_corner_discount: awaySterileCornerDiscount,
      home_corner_quality_factor: homeCornerQualityFactor,
      away_corner_quality_factor: awayCornerQualityFactor
    }),
    counter_threat_index: Object.freeze({
      home_counter_threat: homeCounterThreat,
      away_counter_threat: awayCounterThreat,
      home_directness_ratio: homeDirectnessRatio,
      away_directness_ratio: awayDirectnessRatio,
      high_directness_counter_side: highDirectnessSide
    }),
    discipline_pressure: Object.freeze({
      home_yellows: homeYellow,
      away_yellows: awayYellow,
      home_defenders_on_yellow: homeDefYellows,
      away_defenders_on_yellow: awayDefYellows,
      home_yellow_burst_10m: homeYellowBurst10m,
      away_yellow_burst_10m: awayYellowBurst10m,
      home_tactical_foul_yellows: homeTacticalYellows,
      away_tactical_foul_yellows: awayTacticalYellows,
      home_dissent_time_yellows: homeDissentYellows,
      away_dissent_time_yellows: awayDissentYellows,
      home_siege_yellows_10m: homeSiegeYellows10m,
      away_siege_yellows_10m: awaySiegeYellows10m,
      home_yellow_collapse_risk: homeYellowCollapse,
      away_yellow_collapse_risk: awayYellowCollapse,
      home_discipline_leak_factor: homeDisciplineLeak,
      away_discipline_leak_factor: awayDisciplineLeak
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
    threat_transformation_index: ttiFeatures,
    red_card_penalty: Object.freeze({
      home_attack_multiplier: homeRedPen.attack,
      home_defense_leak_multiplier: homeRedPen.leak,
      away_attack_multiplier: awayRedPen.attack,
      away_defense_leak_multiplier: awayRedPen.leak,
      home_scenario: homeRedPen.scenario,
      away_scenario: awayRedPen.scenario,
      elite_override_active: anyEliteActive,
      elite_override_side: eliteSide,
      elite_override_factor: anyEliteActive ? 0.75 : 1.0,
      home_role_breakdown: Object.freeze(homeRoleBreakdown),
      away_role_breakdown: Object.freeze(awayRoleBreakdown)
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

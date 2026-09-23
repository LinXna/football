/**
 * @file momentumTimeline.ts
 * @description Layer 03 M3 子模块：实时危攻时序走势、多尺度斜率与积分形态提取
 *
 * 从 momentumQuantEngine.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MomentumTimelineFeatures, Layer03OpId } from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';
import { flattenMomentumPoints, calculateMomentumIntegral, TimedMomentumPoint } from './momentumMath.js';

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
      waveform_calculus: Object.freeze({
        first_derivative_dM_dt: 0,
        second_derivative_d2M_dt2: 0,
        waveform_auc_5m: Object.freeze({ home: 0, away: 0, net: 0 }),
        waveform_auc_15m: Object.freeze({ home: 0, away: 0, net: 0 }),
        is_pressure_crest: false,
        is_choking_siege: false
      }),
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

  // 9. 时空时序波段微积分 (Momentum Waveform Calculus)
  const calcWaveformCalculus = () => {
    const points = timedPoints.length >= 2
      ? timedPoints.map(p => ({ t: p.minute, v: p.value }))
      : rawPoints.map((v, i) => ({ t: i, v }));
    const n = points.length;
    if (n < 2) {
      return {
        first_derivative_dM_dt: 0,
        second_derivative_d2M_dt2: 0,
        waveform_auc_5m: { home: 0, away: 0, net: 0 },
        waveform_auc_15m: { home: 0, away: 0, net: 0 },
        is_pressure_crest: false,
        is_choking_siege: false
      };
    }

    const calcAuc = (windowSize: number) => {
      const windowSlice = points.slice(-Math.min(n, windowSize));
      let hAuc = 0;
      let aAuc = 0;
      for (let i = 0; i < windowSlice.length - 1; i++) {
        const p1 = windowSlice[i];
        const p2 = windowSlice[i + 1];
        const dt = Math.max(0.5, Math.abs(p2.t - p1.t));
        const avgM = (p1.v + p2.v) / 2.0;
        if (avgM > 0) hAuc += avgM * dt;
        else if (avgM < 0) aAuc += Math.abs(avgM) * dt;
      }
      return {
        home: Number(hAuc.toFixed(2)),
        away: Number(aAuc.toFixed(2)),
        net: Number((hAuc - aAuc).toFixed(2))
      };
    };

    const auc5 = calcAuc(5);
    const auc15 = calcAuc(15);

    const lastPt = points[n - 1];
    const prevPt = points[Math.max(0, n - 3)];
    const dtVel = Math.max(0.5, lastPt.t - prevPt.t);
    const dM_dt = Number(((lastPt.v - prevPt.v) / dtVel).toFixed(3));

    let d2M_dt2 = 0;
    if (n >= 5) {
      const priorPt = points[Math.max(0, n - 5)];
      const dtPrior = Math.max(0.5, prevPt.t - priorPt.t);
      const prior_dM = (prevPt.v - priorPt.v) / dtPrior;
      d2M_dt2 = Number(((dM_dt - prior_dM) / dtVel).toFixed(3));
    }

    const is_pressure_crest = (Math.abs(dM_dt) >= 12.0 && Math.abs(lastPt.v) >= 35.0) ||
      (Math.abs(dM_dt) >= 8.0 && Math.abs(d2M_dt2) >= 2.0 && Math.abs(lastPt.v) >= 40.0);
    const is_choking_siege = (Math.abs(auc15.net) >= 220.0) && (inflections <= 1);

    return {
      first_derivative_dM_dt: dM_dt,
      second_derivative_d2M_dt2: d2M_dt2,
      waveform_auc_5m: auc5,
      waveform_auc_15m: auc15,
      is_pressure_crest,
      is_choking_siege
    };
  };

  const waveformCalculus = calcWaveformCalculus();

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
    waveform_calculus: Object.freeze(waveformCalculus),
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

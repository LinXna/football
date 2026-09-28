/**
 * @file momentumMath.ts
 * @description Layer 03 M3 子模块：动量数学基础（OLS 斜率、AUC 能量积分、点阵展平）
 *
 * 从 momentumQuantEngine.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';

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
 * 计算带时间戳的动量能量积分（梯形 dt 加权，与 momentumTimeline 的 waveform AUC 统一口径）
 * P1-22 修复：按分钟坐标的梯形积分，消除「按采样点累加」在采样率变化/时间间隙时的失真。
 * @param points 带分钟坐标的动量点阵
 */
export function calculateTimedMomentumIntegral(points: TimedMomentumPoint[]): { home: number; away: number; net: number } {
  let homeEnergy = 0;
  let awayEnergy = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dt = Math.max(0.5, Math.abs(p2.minute - p1.minute));
    const avg = (p1.value + p2.value) / 2.0;
    if (avg > 0) homeEnergy += avg * dt;
    else if (avg < 0) awayEnergy += Math.abs(avg) * dt;
  }
  return Object.freeze({
    home: Number(homeEnergy.toFixed(1)),
    away: Number(awayEnergy.toFixed(1)),
    net: Number((homeEnergy - awayEnergy).toFixed(1))
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

export interface TimedMomentumPoint {
  minute: number;
  value: number;
}

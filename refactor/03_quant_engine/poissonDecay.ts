/**
 * @file poissonDecay.ts
 * @description Layer 03 M4 子模块：进球时段 DNA 时间衰减、双变量泊松网格、连续威胁强度张量
 *
 * 从 poissonDecayModel.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { poissonPMF } from './poissonCore.js';
import { PoissonDecayCurve, UnifiedMatchState } from './types.js';

/**
 * 计算基于进球时段 DNA 的精确剩余时间积分比例 (Goal DNA Phased Decay Integration)
 * @param elapsedMinute 已进行分钟数 (0~90)
 * @param weights 6 个 15 分钟区间权重占比数组
 */
export function calculatePhasedDNATimeFraction(
  elapsedMinute: number,
  weights: number[] = [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667]
): number {
  if (elapsedMinute <= 0) return 1.0;
  if (elapsedMinute >= 90) return 0.0;

  // 45' 半场休息 (Half-Time) 物理边界保护门禁:
  // 当比赛处于第 45 分钟或中场休息时，上半场 3 个时段 (0-15', 16-30', 31-45') 积分精确归零；
  // 下半场 3 个时段 (46-60', 61-75', 76-90') 100% 完整保留，剩余积分严格等于区间 3、4、5 权重之和。
  // 杜绝 45/15=3 时导致的下半场首个时段提前进入消耗。
  if (elapsedMinute === 45) {
    const secondHalfIntegral = (weights[3] ?? 0.1667) + (weights[4] ?? 0.1667) + (weights[5] ?? 0.1667);
    return Number(Math.max(0.0, Math.min(1.0, secondHalfIntegral)).toFixed(4));
  }

  const currentIntervalIndex = Math.min(5, Math.floor(elapsedMinute / 15));
  const intervalEndMinute = (currentIntervalIndex + 1) * 15;
  const fractionInCurrentInterval = Math.max(0, (intervalEndMinute - elapsedMinute) / 15.0);

  let remainingIntegral = fractionInCurrentInterval * (weights[currentIntervalIndex] ?? 0.1667);

  for (let i = currentIntervalIndex + 1; i < 6; i++) {
    remainingIntegral += (weights[i] ?? 0.1667);
  }

  // 保证单调平滑递减
  return Number(Math.max(0.0, Math.min(1.0, remainingIntegral)).toFixed(4));
}

/**
 * 计算基于进球时段 DNA 的上半场截断剩余时间积分比例 (First-Half Phased Decay Integration)
 * 仅积分上半场 3 个 15 分钟区间 (0-15', 16-30', 31-45')，当 elapsedMinute >= 45 时严格返回 0.0
 * @param elapsedMinute 已进行分钟数 (0~45)
 * @param weights 6 个 15 分钟区间权重占比数组
 */
export function calculateFirstHalfPhasedDNATimeFraction(
  elapsedMinute: number,
  weights: number[] = [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667]
): number {
  if (elapsedMinute <= 0) {
    const totalFirstHalf = (weights[0] ?? 0.1667) + (weights[1] ?? 0.1667) + (weights[2] ?? 0.1667);
    return Number(Math.max(0.0, Math.min(1.0, totalFirstHalf)).toFixed(4));
  }
  if (elapsedMinute >= 45) return 0.0;

  const currentIntervalIndex = Math.min(2, Math.floor(elapsedMinute / 15));
  const intervalEndMinute = (currentIntervalIndex + 1) * 15;
  const fractionInCurrentInterval = Math.max(0, (intervalEndMinute - elapsedMinute) / 15.0);

  let remainingIntegral = fractionInCurrentInterval * (weights[currentIntervalIndex] ?? 0.1667);
  for (let i = currentIntervalIndex + 1; i < 3; i++) {
    remainingIntegral += (weights[i] ?? 0.1667);
  }

  return Number(Math.max(0.0, Math.min(1.0, remainingIntegral)).toFixed(4));
}

/**
 * 计算非线性时间衰减与局势搏命放大系数 (Time & Game-State Factor)
 * 物理原理：
 * 建立统一平滑的连续紧迫度势场 U(t, ΔS)，消除 70/75 分钟与分差断崖式的离散阶跃。
 * @param elapsedMinute 已进行分钟数 (t ∈ [0, 90])
 * @param scoreDiff 主客比分差 (home - away)
 * @param homeWeights 主队进球 DNA 时段权重
 * @param awayWeights 客队进球 DNA 时段权重
 * @param priorStrengthRatio 先验实力比
 * @param remainingMinutesOverride 统一剩余时间 SSOT (覆盖默认 90 - elapsed)
 */
export function calculateTimeDecayAndUrgencyMultiplier(
  elapsedMinute: number,
  scoreDiff: number = 0,
  homeWeights?: number[],
  awayWeights?: number[],
  priorStrengthRatio: number = 1.0,
  remainingMinutesOverride?: number
): {
  time_fraction: number;
  time_fraction_home: number;
  time_fraction_away: number;
  urgency_multiplier: number;
  curve: PoissonDecayCurve;
} {
  const remainingMinutes = remainingMinutesOverride !== undefined
    ? Math.max(0, remainingMinutesOverride)
    : Math.max(0, 90 - elapsedMinute);
  const uniformTimeFraction = Number(Math.min(1.0, remainingMinutes / 90.0).toFixed(4));

  const dnaFractionH = homeWeights && homeWeights.length === 6
    ? calculatePhasedDNATimeFraction(elapsedMinute, homeWeights)
    : uniformTimeFraction;

  const dnaFractionA = awayWeights && awayWeights.length === 6
    ? calculatePhasedDNATimeFraction(elapsedMinute, awayWeights)
    : uniformTimeFraction;

  if (elapsedMinute <= 0) {
    return {
      time_fraction: 1.0,
      time_fraction_home: 1.0,
      time_fraction_away: 1.0,
      urgency_multiplier: 1.0,
      curve: PoissonDecayCurve.LINEAR_UNIFORM
    };
  }

  // 1. 终盘阶段连续过渡平滑权重: S_late(t) = 1 / (1 + e^(-(t - 72)/4.0))
  const lateFactor = 1.0 / (1.0 + Math.exp(-(elapsedMinute - 72.0) / 4.0));

  // 2. 分差连续势场响应函数:
  // (A) 单球落后绝境搏命势能高斯核: 当 |ΔS| ≈ 1 时达到极大值 +0.38，并引入非对称实力差乘子
  const absDiff = Math.abs(scoreDiff);

  let strengthMultiplier = 1.0;
  if (scoreDiff < 0) {
    // 主队落后
    strengthMultiplier = priorStrengthRatio;
  } else if (scoreDiff > 0) {
    // 客队落后
    strengthMultiplier = 1.0 / Math.max(0.1, priorStrengthRatio);
  }
  // 限制乘子极值防止指数爆炸
  strengthMultiplier = Math.max(0.5, Math.min(2.0, strengthMultiplier));

  const desperationGaussian = Math.exp(-Math.pow(absDiff - 1.0, 2) / 0.45);
  const eDesperation = 0.38 * desperationGaussian * strengthMultiplier;

  // (B) 两球以上领先控场降速势能 Sigmoid: 当 |ΔS| >= 2 时达到 -0.22
  const decelerationSigmoid = 1.0 / (1.0 + Math.exp(-(absDiff - 1.8) / 0.30));
  const eDeceleration = 0.22 * decelerationSigmoid;

  // (C) 平局决战微加速势能高斯核: 当 ΔS = 0 时达到 +0.06
  const drawGaussian = Math.exp(-Math.pow(absDiff, 2) / 0.25);
  const eDraw = 0.06 * drawGaussian;

  // 3. 连续紧迫度乘子综合求解: U(t, ΔS) = 1.0 + S_late(t) * (E_desperation - E_deceleration + E_draw)
  const urgencyRaw = 1.0 + lateFactor * (eDesperation - eDeceleration + eDraw);
  const urgency = Number(Math.max(0.70, Math.min(1.45, urgencyRaw)).toFixed(3));

  // 4. 动态曲线类型判定 (基于连续势能强度平滑映射)
  let curve = PoissonDecayCurve.LINEAR_UNIFORM;
  if (lateFactor >= 0.35) {
    if (urgency >= 1.18) {
      curve = PoissonDecayCurve.DESPERATION_BURST;
    } else if (urgency <= 0.88) {
      curve = PoissonDecayCurve.DECELERATED_SLOWDOWN;
    } else if (urgency > 1.02) {
      curve = PoissonDecayCurve.ACCELERATED_LATE;
    }
  }

  return {
    time_fraction: uniformTimeFraction,
    time_fraction_home: dnaFractionH,
    time_fraction_away: dnaFractionA,
    urgency_multiplier: urgency,
    curve
  };
}

/**
 * 求解双变量独立泊松分布网格 (0~maxGoals 矩阵与胜平负概率)
 */
export function calculateBivariatePoissonGrid(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals: number = 7,
  couplingState?: {
    field_tilt_home?: number;
    field_tilt_away?: number;
    zero_shot_deprivation_home?: boolean;
    zero_shot_deprivation_away?: boolean;
  }
): {
  grid: number[][];
  prob_home_win_rest: number;
  prob_draw_rest: number;
  prob_away_win_rest: number;
  rho_used?: number;
  rho_source?: 'DEFAULT_ASSUMPTION' | 'CALIBRATED_ESTIMATE';
  dixon_coles_tau?: {
    tau_0_0: number;
    tau_0_1: number;
    tau_1_0: number;
    tau_1_1: number;
  };
} {
  const grid: number[][] = [];
  let probHomeWin = 0.0;
  let probDraw = 0.0;
  let probAwayWin = 0.0;

  // Dixon-Coles dependence parameter (positive rho inflates draws/low-scoring games)
  const rho = 0.05;
  const tau_0_0 = Math.max(0, 1 - lambdaHome * lambdaAway * rho);
  const tau_0_1 = Math.max(0, 1 + lambdaHome * rho);
  const tau_1_0 = Math.max(0, 1 + lambdaAway * rho);
  const tau_1_1 = Math.max(0, 1 - rho);

  const homeDeprived = couplingState?.zero_shot_deprivation_home === true;
  const awayDeprived = couplingState?.zero_shot_deprivation_away === true;
  const homeTilt = couplingState?.field_tilt_home ?? 0.5;
  const awayTilt = couplingState?.field_tilt_away ?? 0.5;

  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    const pHome = poissonPMF(h, lambdaHome);
    for (let a = 0; a <= maxGoals; a++) {
      const pAway = poissonPMF(a, lambdaAway);
      let prob = pHome * pAway;

      // Apply Dixon-Coles correction for low-scoring combinations
      if (h === 0 && a === 0) {
        prob *= tau_0_0;
      } else if (h === 0 && a === 1) {
        prob *= tau_0_1;
      } else if (h === 1 && a === 0) {
        prob *= tau_1_0;
      } else if (h === 1 && a === 1) {
        prob *= tau_1_1;
      }

      // 场面剥夺攻防耦合：零射门且深陷半场围攻的球队，在对方零进球时逆势破门零封的概率被物理抑制
      if (homeDeprived && h >= 1 && a === 0) {
        const homeDeprivationFactor = Math.max(0.15, Math.min(1.0, Math.pow(homeTilt / 0.35, 1.5)));
        prob *= homeDeprivationFactor;
      }
      if (awayDeprived && a >= 1 && h === 0) {
        const awayDeprivationFactor = Math.max(0.15, Math.min(1.0, Math.pow(awayTilt / 0.35, 1.5)));
        prob *= awayDeprivationFactor;
      }

      // 弱队防线疲劳与连环失球溃败修正 (Defensive Cascade Conceding):
      // 当一方被深度剥夺(零射门且 Tilt <= 0.30)且自身未能进球(h=0或a=0)时，
      // 一旦围攻强队打入首球打破僵局，弱队防守纪律崩塌或被迫压出，多球失球(>=2球)的概率显著升高，
      // 消除弱队在深盘受让下依赖走盘机制(单球失球退钱)产生的虚假数学安全边际。
      if (homeDeprived && h === 0 && a >= 1) {
        const cascadeFactor = Math.max(0.20, (0.35 - homeTilt) / 0.35);
        if (a === 1) {
          prob *= (1.0 - 0.25 * cascadeFactor);
        } else if (a >= 2) {
          prob *= (1.0 + 0.35 * cascadeFactor);
        }
      }
      if (awayDeprived && a === 0 && h >= 1) {
        const cascadeFactor = Math.max(0.20, (0.35 - awayTilt) / 0.35);
        if (h === 1) {
          prob *= (1.0 - 0.25 * cascadeFactor);
        } else if (h >= 2) {
          prob *= (1.0 + 0.35 * cascadeFactor);
        }
      }

      row.push(prob);
    }
    grid.push(row);
  }

  // Second pass: Normalization
  let sumGrid = 0.0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      sumGrid += grid[h][a];
    }
  }

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      if (sumGrid > 0) {
        grid[h][a] = grid[h][a] / sumGrid;
      }
      const prob = grid[h][a];
      grid[h][a] = Number(prob.toFixed(6));

      if (h > a) probHomeWin += prob;
      else if (h === a) probDraw += prob;
      else probAwayWin += prob;
    }
  }

  // 归一化微调
  const total = probHomeWin + probDraw + probAwayWin;
  if (total > 0 && Math.abs(total - 1.0) > 0.0001) {
    probHomeWin = probHomeWin / total;
    probDraw = probDraw / total;
    probAwayWin = probAwayWin / total;
  }

  return {
    grid,
    prob_home_win_rest: Number(probHomeWin.toFixed(4)),
    prob_draw_rest: Number(probDraw.toFixed(4)),
    prob_away_win_rest: Number(probAwayWin.toFixed(4)),
    rho_used: rho,
    rho_source: 'DEFAULT_ASSUMPTION',
    dixon_coles_tau: {
      tau_0_0: Number(tau_0_0.toFixed(4)),
      tau_0_1: Number(tau_0_1.toFixed(4)),
      tau_1_0: Number(tau_1_0.toFixed(4)),
      tau_1_1: Number(tau_1_1.toFixed(4))
    }
  };
}

/**
 * 计算连续多维攻防威胁强度张量 (Continuous Threat Intensity Tensor)
 * 物理原理：
 * 整合 9 项实战攻防技术统计（PE控球有效性、渗透率、射正/中柱质量、角球脉冲、反击越位威胁、黄牌纪律防守动作受限）、
 * 动量 OLS 斜率与 AUC 能量积分，建立连续平滑的统一实时攻防态势场 Φ(t) ∈ [0.4, 1.6]。
 */
export function calculateContinuousThreatTensor(
  state: UnifiedMatchState
): { homeThreat: number; awayThreat: number } {
  // intensity 是已校准的相对威胁分数，0.5 表示中性，不应被当作绝对衰减率。
  const mapIntensity = (intensity: number, opponentIntensity: number, tti?: number, slopeThrust?: number) => {
    let val = 0.65 + Math.max(0, Math.min(1, intensity)) * 0.7;
    // 只有明确的深度压制才额外折损，避免普通均势被误判为低进球。
    if (opponentIntensity >= 0.85 && intensity <= 0.20) {
      val *= 0.85;
    }
    // 融入 TTI 真实进攻威胁转化指数调整
    if (typeof tti === 'number' && Number.isFinite(tti)) {
      if (tti >= 2.0) {
        val *= Math.min(1.15, 1.0 + (tti - 1.0) * 0.05);
      } else if (tti < 0.6 && intensity >= 0.50) {
        // 无效空占控球倒脚
        val *= 0.92;
      }
    }
    // 融入多尺度动量金字塔推力微调 (Pyramid Slope Thrust)
    if (typeof slopeThrust === 'number' && Number.isFinite(slopeThrust)) {
      val *= (1.0 + slopeThrust);
    }
    return Number(Math.max(0.20, Math.min(1.60, val)).toFixed(3));
  };

  const pyramidSlope = state.pyramid_slope ?? 0;
  const homeThrust = Math.tanh(Math.max(0, pyramidSlope) / 25.0) * 0.05;
  const awayThrust = Math.tanh(Math.max(0, -pyramidSlope) / 25.0) * 0.05;

  return {
    homeThreat: mapIntensity(state.home_intensity, state.away_intensity, state.home_tti, homeThrust),
    awayThreat: mapIntensity(state.away_intensity, state.home_intensity, state.away_tti, awayThrust)
  };
}

/**
 * @file poissonDecayModel.ts
 * @description Layer 03 M4: 滚球 0:0 实时重置 Forward 泊松时间衰减与进球概率矩阵引擎
 * 
 * 核心职责：
 * 1. 严格以法定分钟数 t 为自变量，推导剩余比赛有效时间 (90 - t)
 * 2. 滚球 0:0 实时重置铁律：彻底抛弃历史已有进球，纯前向推演剩余时段主客期望 (lambda_home_rest, lambda_away_rest)
 * 3. 市场盘口反推 (Market Implied Lambda) 与联赛 DNA 动态期望体系，彻底根治赛前 2-1 坍塌
 * 4. 非线性时间衰减与绝境搏命爆发因子 (分差为 1 球且 t >= 75 分钟进球率激增)
 * 5. 连续多维攻防威胁张量 (Continuous Threat Intensity Tensor)：
 *    - 融合射门、射正、角球、危攻 AUC、xT 穿透与时间指数半衰期，平滑连续映射威胁衰减，杜绝离散硬编码规则
 * 6. 融合 M2 (先验战意/阵容折损) 与 M3 (实时危攻积分/斜率/xT威胁/红牌) 的动态加权
 * 7. 双变量独立泊松分布网格求解 (0~7 球剩余比分矩阵)，输出 Top 3 完场比分概率阵列
 * 8. 输出剩余时段胜平负概率、剩余大小球理论分布与全场投影比分
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch, CanonicalTimelineEvent } from '../02_canonical_model/types.js';
import { MatchStage, CanonicalEventType } from '../02_canonical_model/enums.js';
import {
  InPlayPoissonFeatures,
  CleanedContextFeatures,
  MarketCalibrationResult,
  MarketStanceType,
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  SpatioTemporalEventFeatures,
  UnifiedMatchState,
  QuantCalibrationProfile,
  PoissonDecayCurve,
  ScoreProbabilityItem,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

/**
 * 常见联赛历史场均进球基准 (League DNA Base Total Goals)
 */
export const LEAGUE_DNA_MAP: Record<string, number> = {
  // 高进球联赛 (>= 3.0)
  '荷甲': 3.12, '荷乙': 3.25, '德甲': 3.18, '德乙': 3.08, '瑞士超': 3.05,
  '挪超': 3.02, '瑞典超': 2.88, '奥甲': 2.95, '冰岛超': 3.20,
  // 中性主流联赛 (2.5 ~ 2.9)
  '英超': 3.20, '西甲': 2.58, '意甲': 2.62, '法甲': 2.70, '葡超': 2.65,
  '欧冠': 3.05, '欧联': 2.90, '欧协联': 2.92, '中超': 2.95, '韩K联': 2.55, '日职联': 2.52,
  // 防守/低进球联赛 (<= 2.4)
  '西乙': 2.18, '法乙': 2.22, '意乙': 2.32, '阿甲': 2.15, '巴甲': 2.38,
  '日职乙': 2.36, '希腊超': 2.30, '俄超': 2.40,
};

/**
 * 获取联赛基准进球数
 */
function getLeagueBaseGoals(leagueName: string): number {
  if (!leagueName) return 2.70;
  for (const [key, val] of Object.entries(LEAGUE_DNA_MAP)) {
    if (leagueName.includes(key)) return val;
  }
  return 2.70;
}

/**
 * 从盘口字符串解析数值（如 "-0.5", "2.5", "2/2.5"）
 */
function parseHandicapOrTotalLine(lineStr: string): number {
  if (!lineStr || typeof lineStr !== 'string') return 0.0;
  const clean = lineStr.trim();
  if (clean.includes('/')) {
    const isExplicitMinus = clean.startsWith('-');
    const parts = clean.split('/');
    if (parts.length === 2) {
      const p1 = parseFloat(parts[0]);
      const p2 = parseFloat(parts[1]);
      if (!isNaN(p1) && !isNaN(p2)) {
        const isNegative = isExplicitMinus || p1 < 0 || p2 < 0 || Object.is(p1, -0) || Object.is(p2, -0);
        const avg = (Math.abs(p1) + Math.abs(p2)) / 2.0;
        return isNegative ? -avg : avg;
      }
    }
  }
  const val = parseFloat(clean);
  return isNaN(val) ? 0.0 : val;
}

/**
 * 泊松概率质量函数 (Poisson Probability Mass Function)
 * P(X = k) = (lambda^k * e^(-lambda)) / k!
 */
export function poissonPMF(k: number, lambda: number): number {
  if (lambda <= 0) {
    return k === 0 ? 1.0 : 0.0;
  }
  if (k < 0) {
    return 0.0;
  }

  let factorial = 1.0;
  for (let i = 2; i <= k; i++) {
    factorial *= i;
  }

  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}

/**
 * 计算非线性时间衰减与局势搏命放大系数 (Time & Game-State Factor)
 * 物理原理：
 * 建立统一平滑的连续紧迫度势场 U(t, ΔS)，消除 70/75 分钟与分差断崖式的离散阶跃。
 * @param elapsedMinute 已进行分钟数 (t ∈ [0, 90])
 * @param scoreDiff 主客比分差 (home - away)
 */
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
 * 计算非线性时间衰减与局势搏命放大系数 (Time & Game-State Factor)
 * 物理原理：
 * 建立统一平滑的连续紧迫度势场 U(t, ΔS)，消除 70/75 分钟与分差断崖式的离散阶跃。
 * @param elapsedMinute 已进行分钟数 (t ∈ [0, 90])
 * @param scoreDiff 主客比分差 (home - away)
 * @param homeWeights 主队进球 DNA 时段权重
 * @param awayWeights 客队进球 DNA 时段权重
 */
export function calculateTimeDecayAndUrgencyMultiplier(
  elapsedMinute: number,
  scoreDiff: number = 0,
  homeWeights?: number[],
  awayWeights?: number[],
  priorStrengthRatio: number = 1.0
): {
  time_fraction: number;
  time_fraction_home: number;
  time_fraction_away: number;
  urgency_multiplier: number;
  curve: PoissonDecayCurve;
} {
  const remainingMinutes = Math.max(0, 90 - elapsedMinute);
  const uniformTimeFraction = Number((remainingMinutes / 90.0).toFixed(4));

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
  maxGoals: number = 7
): {
  grid: number[][];
  prob_home_win_rest: number;
  prob_draw_rest: number;
  prob_away_win_rest: number;
} {
  const grid: number[][] = [];
  let probHomeWin = 0.0;
  let probDraw = 0.0;
  let probAwayWin = 0.0;

  // Dixon-Coles dependence parameter (positive rho inflates draws/low-scoring games)
  const rho = 0.05;

  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    const pHome = poissonPMF(h, lambdaHome);
    for (let a = 0; a <= maxGoals; a++) {
      const pAway = poissonPMF(a, lambdaAway);
      let prob = pHome * pAway;
      
      // Apply Dixon-Coles correction for low-scoring combinations
      if (h === 0 && a === 0) {
        prob *= Math.max(0, 1 - lambdaHome * lambdaAway * rho);
      } else if (h === 0 && a === 1) {
        prob *= Math.max(0, 1 + lambdaHome * rho);
      } else if (h === 1 && a === 0) {
        prob *= Math.max(0, 1 + lambdaAway * rho);
      } else if (h === 1 && a === 1) {
        prob *= Math.max(0, 1 - rho);
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
    prob_away_win_rest: Number(probAwayWin.toFixed(4))
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
  // 当队伍处于极端被动（零射正、零角球、低强度）时，允许威胁度下探，严禁给予0.65的虚高硬性保底
  const mapIntensity = (intensity: number, opponentIntensity: number) => {
    let val: number;
    if (intensity <= 0.15) {
      // 极端被动/零威胁/无射正态势，威胁阻尼线性下沉至 0.05 ~ 0.25
      val = 0.05 + intensity * 1.33;
    } else {
      val = 0.25 + (intensity - 0.15) * 0.85;
    }
    // 场面被绝对压制惩罚 (对方绝对统治且自身微弱)
    if (opponentIntensity >= 0.60 && intensity <= 0.20) {
      val *= 0.50; // 深度压制折损 50%
    }
    return Number(Math.max(0.02, Math.min(2.50, val)).toFixed(3));
  };
  return {
    homeThreat: mapIntensity(state.home_intensity, state.away_intensity),
    awayThreat: mapIntensity(state.away_intensity, state.home_intensity)
  };
}

/**
 * 统帅部主函数：求解滚球 0:0 实时重置 Forward 泊松与进球概率模型
 */
export function calculateInPlayPoissonFeatures(
  match: CanonicalMatch,
  context: CleanedContextFeatures,
  matchState: UnifiedMatchState,
  calibration?: MarketCalibrationResult,
  oosCalibration?: QuantCalibrationProfile,
  collector?: DeficitCollector,
  tracer?: Tracer
): InPlayPoissonFeatures {
  if ((match.timing.stage === MatchStage.LIVE && (match.timing.minute === null || match.timing.minute === undefined)) ||
    ((match.timing.stage === MatchStage.LIVE || match.timing.stage === MatchStage.FINISHED) &&
      (match.score.home_score === null || match.score.home_score === undefined || match.score.away_score === null || match.score.away_score === undefined || !match.score.score_verified))) {
    
    // 强制阻断 (Hard Block): 没有核验的比分或时间，绝不可提供虚假的泊松预期
    collector?.record('UNPRICEABLE_MATCH', Layer03OpId.POISSON_FORWARD_MODEL, 'RC-005', 'Core pricing data (minute or verified score) is missing. Cannot evaluate expected values.', undefined, match.canonical_id);
    throw new Error('UNPRICEABLE_MATCH: Core pricing data is missing, blocking Poisson deduction to prevent fake EV.');
  }
  const elapsedMinute = Math.min(90, Math.max(0, match.timing.minute as number));
  const remainingMinutes = Math.max(0, 90 - elapsedMinute);
  const isFinished = match.timing.stage === MatchStage.FINISHED;
  const isUnpriceableStoppageTime = !isFinished && match.timing.stage === MatchStage.LIVE && elapsedMinute >= 90;
  const currentHomeScore = match.score.home_score as number;
  const currentAwayScore = match.score.away_score as number;
  const scoreDiff = currentHomeScore - currentAwayScore;

  // 完赛直接返回固定概率
  if (isFinished || isUnpriceableStoppageTime) {
    const isHomeWin = currentHomeScore > currentAwayScore;
    const isDraw = currentHomeScore === currentAwayScore;
    const isAwayWin = currentHomeScore < currentAwayScore;

    return {
      elapsed_minute: elapsedMinute,
      remaining_minutes: 0,
      is_stoppage_time_unpriceable: isUnpriceableStoppageTime,
      time_decay_curve: PoissonDecayCurve.LINEAR_UNIFORM,
      lambda_home_rest: 0.0,
      lambda_away_rest: 0.0,
      expected_goals_rest: 0.0,
      lambda_source: 'FALLBACK',
      top_final_scores: [{
        home: currentHomeScore,
        away: currentAwayScore,
        probability: 1.0,
        percentage_str: '100.0%'
      }],
      rest_score_matrix: {
        prob_home_win_rest: isHomeWin ? 1.0 : 0.0,
        prob_draw_rest: isDraw ? 1.0 : 0.0,
        prob_away_win_rest: isAwayWin ? 1.0 : 0.0
      },
      projected_final_score: {
        home: currentHomeScore,
        away: currentAwayScore,
        most_likely_score: `${currentHomeScore}-${currentAwayScore}`
      }
    };
  }

  // 1. 建立全场 90 分钟先验基准 Lambda (Base Lambda Prior)
  let baseTotalGoals = 2.70;
  let baseGoalDiff = 0.0;
  let lambdaSource: 'MARKET_IMPLIED' | 'LEAGUE_DNA' | 'FALLBACK' = 'LEAGUE_DNA';
  let baseHomeLambda = 1.35;
  let baseAwayLambda = 1.35;

  if (calibration && calibration.market_stance !== MarketStanceType.MARKET_DATA_MISSING) {
    baseHomeLambda = calibration.lambda_base_home;
    baseAwayLambda = calibration.lambda_base_away;
    baseTotalGoals = baseHomeLambda + baseAwayLambda;
    lambdaSource = 'MARKET_IMPLIED';
  } else {
    const leagueName = match.league_name ?? '';
    baseTotalGoals = getLeagueBaseGoals(leagueName);
    baseHomeLambda = (baseTotalGoals + baseGoalDiff) / 2.0;
    baseAwayLambda = (baseTotalGoals - baseGoalDiff) / 2.0;
  }

  baseHomeLambda = Math.max(0.3, baseHomeLambda);
  baseAwayLambda = Math.max(0.3, baseAwayLambda);

  // 2. 注入 M2 先验战意与阵容折损乘子 (MUI / LIS)
  if (context && context.motivation_urgency && context.lineup_impact) {
    baseHomeLambda *= (context.motivation_urgency.home_mui * context.lineup_impact.home_lis);
    baseAwayLambda *= (context.motivation_urgency.away_mui * context.lineup_impact.away_lis);
  }

  if (oosCalibration?.market === 'TOTAL_GOALS_MAIN' && oosCalibration.status === 'VALIDATED' && oosCalibration.effective_sample_size >= 200) {
    const multiplier = Math.exp(oosCalibration.lambda_log_adjustment);
    baseHomeLambda *= multiplier;
    baseAwayLambda *= multiplier;
  }

  // 3. 计算时间衰减与局势非线性搏命因子 (结合 15 分钟进球时段 DNA 与 先验实力差)
  const homeWeights = context?.goal_distribution_dna?.home_scored_weights;
  const awayWeights = context?.goal_distribution_dna?.away_scored_weights;
  const priorStrengthRatio = baseHomeLambda / Math.max(0.1, baseAwayLambda);
  const timeDecay = calculateTimeDecayAndUrgencyMultiplier(elapsedMinute, scoreDiff, homeWeights, awayWeights, priorStrengthRatio);

  // 4. 唯一实时状态已经融合 xT、动量、事件、红牌与战术相变；本函数不得再次读取原始特征。
  const regimeMultiplierHome = 1.0;
  const regimeMultiplierAway = 1.0;
  const redPenaltyHome = 1.0;
  const redPenaltyAway = 1.0;

  // 4.5 由唯一状态映射连续威胁强度张量。
  // 代替离散硬编码 if 语句，以连续数学模型动态调整真实进球期望
  const threatTensor = calculateContinuousThreatTensor(matchState);
  const threatDampingHome = threatTensor.homeThreat;
  const threatDampingAway = threatTensor.awayThreat;
  const postGoalCooldownMultiplier = matchState.post_goal_cooldown_active ? 0.70 : 1.0;

  // 5. 综合求解滚球 0:0 剩余时段动态进球期望 (lambda_home_rest, lambda_away_rest)
  const remainingFactorHome = timeDecay.time_fraction_home * timeDecay.urgency_multiplier;
  const remainingFactorAway = timeDecay.time_fraction_away * timeDecay.urgency_multiplier;

  // xT, shots, corners and momentum are already fused in the single threat tensor; do not multiply them again.
  let lambdaHomeRest = baseHomeLambda * remainingFactorHome * redPenaltyHome * regimeMultiplierHome * threatDampingHome * postGoalCooldownMultiplier;
  let lambdaAwayRest = baseAwayLambda * remainingFactorAway * redPenaltyAway * regimeMultiplierAway * threatDampingAway * postGoalCooldownMultiplier;

  // 极值安全钳位
  lambdaHomeRest = Math.max(0.01, Math.min(3.50, Number(lambdaHomeRest.toFixed(3))));
  lambdaAwayRest = Math.max(0.01, Math.min(3.50, Number(lambdaAwayRest.toFixed(3))));
  const expectedGoalsRest = Number((lambdaHomeRest + lambdaAwayRest).toFixed(3));

  // 6. 求解双变量泊松网格 (0~7 球)
  const poissonResult = calculateBivariatePoissonGrid(lambdaHomeRest, lambdaAwayRest, 7);
  const poissonGrid = poissonResult.grid;

  // 7. 投影全场最终比分与 Top 3~5 概率分布
  const projectedHomeFinal = Number((currentHomeScore + lambdaHomeRest).toFixed(2));
  const projectedAwayFinal = Number((currentAwayScore + lambdaAwayRest).toFixed(2));

  const allScoresList: ScoreProbabilityItem[] = [];

  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      const prob = poissonGrid[h][a];
      const finalH = currentHomeScore + h;
      const finalA = currentAwayScore + a;

      allScoresList.push({
        home: finalH,
        away: finalA,
        probability: prob,
        percentage_str: `${(prob * 100).toFixed(1)}%`
      });
    }
  }

  // 排序并取 Top 5 比分
  allScoresList.sort((a, b) => b.probability - a.probability);
  const topFinalScores = allScoresList.slice(0, 5).map(item => ({
    ...item,
    probability: Number(item.probability.toFixed(4))
  }));

  const mostLikely = topFinalScores[0] ? `${topFinalScores[0].home}-${topFinalScores[0].away}` : `${currentHomeScore}-${currentAwayScore}`;

  const activeTracer = tracer ?? Tracer.getInstance();
  activeTracer.log(
    'INFO',
    'QUANT_03_POISSON_DECAY',
    'SOLVED_SUCCESS',
    `Solved Forward In-Play Poisson Decay. Minute: ${elapsedMinute}', Score: ${currentHomeScore}-${currentAwayScore}, LambdaRest: ${lambdaHomeRest}+${lambdaAwayRest}=${expectedGoalsRest}`,
    {
      minute: elapsedMinute,
      current_score: `${currentHomeScore}-${currentAwayScore}`,
      lambda_home_rest: lambdaHomeRest,
      lambda_away_rest: lambdaAwayRest,
      expected_goals_rest: expectedGoalsRest,
      curve: timeDecay.curve,
      top_scores: topFinalScores.slice(0, 3).map(s => `${s.home}-${s.away}(${s.percentage_str})`)
    },
    match.canonical_id
  );

  return {
    elapsed_minute: elapsedMinute,
    remaining_minutes: remainingMinutes,
    is_stoppage_time_unpriceable: false,
    time_decay_curve: timeDecay.curve,
    lambda_home_rest: lambdaHomeRest,
    lambda_away_rest: lambdaAwayRest,
    expected_goals_rest: expectedGoalsRest,
    lambda_source: lambdaSource,
    top_final_scores: topFinalScores,
    rest_score_matrix: {
      prob_home_win_rest: poissonResult.prob_home_win_rest,
      prob_draw_rest: poissonResult.prob_draw_rest,
      prob_away_win_rest: poissonResult.prob_away_win_rest
    },
    projected_final_score: {
      home: projectedHomeFinal,
      away: projectedAwayFinal,
      most_likely_score: mostLikely
    }
  };
}

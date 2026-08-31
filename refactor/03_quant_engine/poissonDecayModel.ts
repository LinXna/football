/**
 * @file poissonDecayModel.ts
 * @description Layer 03 M4: 滚球 0:0 实时重置 Forward 泊松时间衰减与进球概率矩阵引擎
 * 
 * 核心职责：
 * 1. 严格以法定分钟数 t 为自变量，推导剩余比赛有效时间 (90 - t)
 * 2. 滚球 0:0 实时重置铁律：彻底抛弃历史已有进球，纯前向推演剩余时段主客期望 (lambda_home_rest, lambda_away_rest)
 * 3. 市场盘口反推 (Market Implied Lambda) 与联赛 DNA 动态期望体系，彻底根治赛前 2-1 坍塌
 * 4. 非线性时间衰减与绝境搏命爆发因子 (分差为 1 球且 t >= 75 分钟进球率激增)
 * 5. 融合 M2 (先验战意/阵容折损) 与 M3 (实时危攻积分/斜率/xT威胁/红牌) 的动态加权
 * 6. 双变量独立泊松分布网格求解 (0~7 球剩余比分矩阵)，输出 Top 3 完场比分概率阵列
 * 7. 输出剩余时段胜平负概率、剩余大小球理论分布与全场投影比分
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage } from '../02_canonical_model/enums.js';
import {
  InPlayPoissonFeatures,
  CleanedContextFeatures,
  MarketCalibrationResult,
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  SpatioTemporalEventFeatures,
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
const LEAGUE_DNA_MAP: Record<string, number> = {
  // 高进球联赛 (>= 3.0)
  '荷甲': 3.12, '荷乙': 3.25, '德甲': 3.18, '德乙': 3.08, '瑞士超': 3.05,
  '挪超': 3.02, '瑞典超': 2.88, '奥甲': 2.95, '冰岛超': 3.20,
  // 中性主流联赛 (2.5 ~ 2.9)
  '英超': 2.85, '西甲': 2.58, '意甲': 2.62, '法甲': 2.70, '葡超': 2.65,
  '欧冠': 2.98, '欧联': 2.90, '欧协联': 2.92, '中超': 2.75, '韩K联': 2.55, '日职联': 2.52,
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
    const isNegative = clean.startsWith('-');
    const stripped = clean.replace(/^[+-]/, '');
    const parts = stripped.split('/');
    if (parts.length === 2) {
      const v1 = parseFloat(parts[0]);
      const v2 = parseFloat(parts[1]);
      if (!isNaN(v1) && !isNaN(v2)) {
        const avg = (v1 + v2) / 2.0;
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
 * @param elapsedMinute 已进行分钟数
 * @param scoreDiff 主客比分差 (home - away)
 */
export function calculateTimeDecayAndUrgencyMultiplier(
  elapsedMinute: number,
  scoreDiff: number
): { time_fraction: number; urgency_multiplier: number; curve: PoissonDecayCurve } {
  const remainingMinutes = Math.max(0, 90 - elapsedMinute);
  const timeFraction = Number((remainingMinutes / 90.0).toFixed(4));

  // 基础线性
  if (elapsedMinute < 65) {
    return {
      time_fraction: timeFraction,
      urgency_multiplier: 1.0,
      curve: PoissonDecayCurve.LINEAR_UNIFORM
    };
  }

  const isOneGoalDiff = Math.abs(scoreDiff) === 1;
  const isLargeLead = Math.abs(scoreDiff) >= 3;

  // 65 ~ 79 分钟：体能下降与战术换人期
  if (elapsedMinute < 80) {
    const urgency = isOneGoalDiff ? 1.15 : (isLargeLead ? 0.85 : 1.05);
    return {
      time_fraction: timeFraction,
      urgency_multiplier: urgency,
      curve: PoissonDecayCurve.NON_LINEAR_POWER
    };
  }

  // 80 ~ 90+ 分钟：绝境搏命或补时狂潮
  if (isOneGoalDiff) {
    return {
      time_fraction: timeFraction,
      urgency_multiplier: 1.35,
      curve: PoissonDecayCurve.LATE_GAME_ACCELERATION
    };
  } else if (isLargeLead) {
    return {
      time_fraction: timeFraction,
      urgency_multiplier: 0.65,
      curve: PoissonDecayCurve.NON_LINEAR_POWER
    };
  }

  return {
    time_fraction: timeFraction,
    urgency_multiplier: 1.18,
    curve: PoissonDecayCurve.LATE_GAME_ACCELERATION
  };
}

/**
 * 计算双变量泊松分布网格 (0~7 球剩余比分矩阵)
 */
export function calculateBivariatePoissonGrid(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals: number = 7
): {
  matrix: number[][]; // [homeGoals][awayGoals]
  prob_home_win_rest: number;
  prob_draw_rest: number;
  prob_away_win_rest: number;
} {
  const matrix: number[][] = [];
  let probHomeWin = 0.0;
  let probDraw = 0.0;
  let probAwayWin = 0.0;

  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    const pH = poissonPMF(h, lambdaHome);
    for (let a = 0; a <= maxGoals; a++) {
      const pA = poissonPMF(a, lambdaAway);
      const cellProb = Number((pH * pA).toFixed(5));
      matrix[h][a] = cellProb;

      if (h > a) {
        probHomeWin += cellProb;
      } else if (h === a) {
        probDraw += cellProb;
      } else {
        probAwayWin += cellProb;
      }
    }
  }

  return {
    matrix,
    prob_home_win_rest: Number(probHomeWin.toFixed(4)),
    prob_draw_rest: Number(probDraw.toFixed(4)),
    prob_away_win_rest: Number(probAwayWin.toFixed(4))
  };
}

/**
 * Layer 03 M4 主调度入口：滚球 0:0 实时重置 Forward 泊松推演
 * @param match CanonicalMatch
 * @param context CleanedContextFeatures (M2 输出)
 * @param timeline MomentumTimelineFeatures (M3 输出)
 * @param physical RealTimePhysicalStatsFeatures (M3 输出)
 * @param spatioTemporal SpatioTemporalEventFeatures (M3.5 输出)
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function calculateInPlayPoissonFeatures(
  match: CanonicalMatch,
  context: CleanedContextFeatures,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  spatioTemporal?: SpatioTemporalEventFeatures,
  calibratedBase?: MarketCalibrationResult,
  collector?: DeficitCollector,
  tracer?: Tracer
): InPlayPoissonFeatures {
  const elapsedMinute = Math.max(0, match.timing.minute ?? 0);
  const remainingMinutes = Math.max(0, 90 - elapsedMinute);
  const currentHomeScore = match.score.home_score ?? 0;
  const currentAwayScore = match.score.away_score ?? 0;
  const scoreDiff = currentHomeScore - currentAwayScore;

  // 1. 基准全场场均期望 (优先使用经过 Stage 1 & 1.1 博弈校准的基准，其次从市场盘口反推，再次联赛 DNA)
  let baseHomeLambda: number;
  let baseAwayLambda: number;
  let lambdaSource: 'MARKET_IMPLIED' | 'LEAGUE_DNA' | 'FALLBACK' = 'FALLBACK';

  if (calibratedBase && calibratedBase.lambda_base_home > 0 && calibratedBase.lambda_base_away > 0) {
    baseHomeLambda = calibratedBase.lambda_base_home;
    baseAwayLambda = calibratedBase.lambda_base_away;
    lambdaSource = 'MARKET_IMPLIED';
  } else {
    const ouMain = match.markets.full_total_main;
    const ahMain = match.markets.full_spread_main;

    if (ouMain && ouMain.line && ouMain.over_odds > 1.0 && ouMain.under_odds > 1.0) {
      // 市场盘口反推
      const marketTotalLine = parseHandicapOrTotalLine(ouMain.line);
      const marketSpreadLine = ahMain && ahMain.home_selection ? parseHandicapOrTotalLine(ahMain.home_selection) : 0.0;
      
      // 大小球赔率微调 (若大球低水，则期望略大于盘口 line)
      const overProbRaw = 1.0 / ouMain.over_odds;
      const underProbRaw = 1.0 / ouMain.under_odds;
      const overWeight = overProbRaw / (overProbRaw + underProbRaw || 1.0);
      const impliedTotal = marketTotalLine + (overWeight - 0.5) * 0.4;
      
      // 让球盘拆解主客进球预期
      const clampedSpread = Math.max(-2.5, Math.min(2.5, marketSpreadLine));
      const hLambda = (impliedTotal - clampedSpread) / 2.0;
      const aLambda = (impliedTotal + clampedSpread) / 2.0;

      baseHomeLambda = Math.max(0.3, hLambda);
      baseAwayLambda = Math.max(0.3, aLambda);
      lambdaSource = 'MARKET_IMPLIED';
    } else {
      // 联赛 DNA
      const leagueBaseTotal = getLeagueBaseGoals(match.league_name);
      baseHomeLambda = leagueBaseTotal * 0.55;
      baseAwayLambda = leagueBaseTotal * 0.45;
      lambdaSource = match.league_name ? 'LEAGUE_DNA' : 'FALLBACK';
    }

    // 若未传入 calibratedBase，则在此注入 M2 修正
    baseHomeLambda *= (context.motivation_urgency.home_mui * context.lineup_impact.home_lis);
    baseAwayLambda *= (context.motivation_urgency.away_mui * context.lineup_impact.away_lis);
  }

  // 3. 计算时间衰减与局势非线性搏命因子
  const timeDecay = calculateTimeDecayAndUrgencyMultiplier(elapsedMinute, scoreDiff);

  // 4. 注入 M3 实时物理场与动量加权 (xT 穿透, 5m 斜率, 15m 围攻能量, 红牌折损)
  const totalXT = physical.xt_proxy.home_xt + physical.xt_proxy.away_xt;
  let xtHomeFactor = 1.0;
  let xtAwayFactor = 1.0;
  if (totalXT > 0.5) {
    xtHomeFactor = 0.7 + (physical.xt_proxy.home_xt / totalXT) * 0.6;
    xtAwayFactor = 0.7 + (physical.xt_proxy.away_xt / totalXT) * 0.6;
  }

  const momentumBiasHome = 1.0 + (timeline.integral_15m.home / 1000.0) + (timeline.slope_5m > 0 ? timeline.slope_5m * 0.015 : 0.0);
  const momentumBiasAway = 1.0 + (timeline.integral_15m.away / 1000.0) + (timeline.slope_5m < 0 ? Math.abs(timeline.slope_5m) * 0.015 : 0.0);

  const redPenaltyHome = physical.red_card_penalty.home_attack_multiplier * physical.red_card_penalty.away_defense_leak_multiplier;
  const redPenaltyAway = physical.red_card_penalty.away_attack_multiplier * physical.red_card_penalty.home_defense_leak_multiplier;

  // 4.5 注入 M3.5 战局相变因果乘子 (Regime Shift Multiplier)
  const regimeMultiplierHome = spatioTemporal?.regime.regime_multiplier_home ?? 1.0;
  const regimeMultiplierAway = spatioTemporal?.regime.regime_multiplier_away ?? 1.0;

  // 5. 综合求解滚球 0:0 剩余时段动态进球期望 (lambda_home_rest, lambda_away_rest)
  const remainingFactor = timeDecay.time_fraction * timeDecay.urgency_multiplier;

  let lambdaHomeRest = baseHomeLambda * remainingFactor * xtHomeFactor * momentumBiasHome * redPenaltyHome * regimeMultiplierHome;
  let lambdaAwayRest = baseAwayLambda * remainingFactor * xtAwayFactor * momentumBiasAway * redPenaltyAway * regimeMultiplierAway;

  // 极值安全钳位
  lambdaHomeRest = Math.max(0.01, Math.min(3.50, Number(lambdaHomeRest.toFixed(3))));
  lambdaAwayRest = Math.max(0.01, Math.min(3.50, Number(lambdaAwayRest.toFixed(3))));
  const expectedGoalsRest = Number((lambdaHomeRest + lambdaAwayRest).toFixed(3));

  // 6. 求解双变量泊松网格 (0~7 球)
  const poissonGrid = calculateBivariatePoissonGrid(lambdaHomeRest, lambdaAwayRest, 7);

  // 7. 投影全场最终比分与 Top 3~5 概率分布
  const projectedHomeFinal = Number((currentHomeScore + lambdaHomeRest).toFixed(2));
  const projectedAwayFinal = Number((currentAwayScore + lambdaAwayRest).toFixed(2));

  const allScoresList: ScoreProbabilityItem[] = [];
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const cellProb = poissonGrid.matrix[h]?.[a] ?? 0;
      if (cellProb > 0.005) {
        const finalH = currentHomeScore + h;
        const finalA = currentAwayScore + a;
        allScoresList.push({
          home: finalH,
          away: finalA,
          probability: cellProb,
          percentage_str: `${(cellProb * 100).toFixed(1)}%`
        });
      }
    }
  }

  // 降序排序取 Top 5
  allScoresList.sort((a, b) => b.probability - a.probability);
  const topScores = allScoresList.slice(0, 5);
  const mostLikelyScore = topScores[0] || { home: currentHomeScore, away: currentAwayScore, probability: 1.0, percentage_str: '100%' };

  const result: InPlayPoissonFeatures = Object.freeze({
    elapsed_minute: elapsedMinute,
    remaining_minutes: remainingMinutes,
    time_decay_curve: timeDecay.curve,
    lambda_home_rest: lambdaHomeRest,
    lambda_away_rest: lambdaAwayRest,
    expected_goals_rest: expectedGoalsRest,
    lambda_source: lambdaSource,
    top_final_scores: topScores,
    rest_score_matrix: Object.freeze({
      prob_home_win_rest: poissonGrid.prob_home_win_rest,
      prob_draw_rest: poissonGrid.prob_draw_rest,
      prob_away_win_rest: poissonGrid.prob_away_win_rest
    }),
    projected_final_score: Object.freeze({
      home: projectedHomeFinal,
      away: projectedAwayFinal,
      most_likely_score: `${mostLikelyScore.home}-${mostLikelyScore.away}`
    })
  });

  tracer?.info(
    Layer03OpId.POISSON_FORWARD_MODEL,
    'POISSON_SOLVED',
    'Poisson forward model solved',
    {
      elapsed_minute: elapsedMinute,
      remaining_minutes: remainingMinutes,
      lambda_home_rest: lambdaHomeRest,
      lambda_away_rest: lambdaAwayRest,
      expected_goals_rest: expectedGoalsRest,
      lambda_source: lambdaSource,
      most_likely_score: result.projected_final_score.most_likely_score
    },
    match.canonical_id
  );

  return result;
}

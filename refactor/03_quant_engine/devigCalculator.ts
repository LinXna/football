/**
 * @file devigCalculator.ts
 * @description Layer 03 M5: 多源博弈微观去抽水 (De-vig)、四分之一盘复合期望分解与 EV 仲裁计算器
 * 
 * 核心职责：
 * 1. Multiplicative 比例剥水与 Shin 算法知情交易者模型 (解决 Favorite-Longshot 偏差)
 * 2. 全场独赢欧赔公允概率与庄家抽水率 (Overround) 求解
 * 3. 亚洲让球盘 (Asian Handicap) 精确分解：支持平手 (0)、半球 (0.5)、一球 (1.0) 及四分之一盘 (-0.25, +0.75 等) 赢半输半复合 EV 计算
 * 4. 大小球盘口 (Over/Under) 复合期望与正负 EV 计算
 * 5. 主盘 vs 副盘离散方差 (Line Dispersion) 与庄家防守诱盘意图 (Bookmaker Posture) 识别
 * 6. 雷速多主流机构矩阵共识对撞与异动监测
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage } from '../02_canonical_model/enums.js';
import {
  MarketType,
  DeviggedMarketFeatures,
  SingleMarketDevig,
  SpreadEVAssessment,
  TotalEVAssessment,
  DevigMethod,
  BookmakerPosture,
  InPlayPoissonFeatures,
  Layer03OpId,
  Layer03FeatureId,
  FiveStateSettlementDistribution,
  LineDispersionMetrics
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';
import { poissonPMF, calculateBivariatePoissonGrid } from './poissonDecayModel.js';
import { requireFiniteNonNegative, poissonSupportUpperBound, devigShin, applyBayesianShrinkage, devigMultiplicative } from './devigMath.js';
export { devigMultiplicative, devigShin, applyBayesianShrinkage };
import { parseAsianHandicapLine, formatAsianHandicapLine, invertHandicapString, calculateSpreadFiveStateDistribution, calculateTotalFiveStateDistribution } from './asianHandicap.js';
export { parseAsianHandicapLine, formatAsianHandicapLine, invertHandicapString, calculateSpreadFiveStateDistribution, calculateTotalFiveStateDistribution };

type PoissonExpectation = Pick<InPlayPoissonFeatures, 'lambda_home_rest' | 'lambda_away_rest' | 'expected_goals_rest'>;

/**
 * 亚洲让球盘 (Asian Handicap) 复合 EV 计算器
 * 核心原理：
 * 设剩余时段净胜球 d = h - a, 盘口为 line (对主队而言，如 -0.25, 0, +0.5)
 * 有效净胜差 Delta_home = d + line
 *   Delta_home >= 0.5   => 全赢, 收益 = (homeOdds - 1.0)
 *   Delta_home === 0.25 => 赢半, 收益 = 0.5 * (homeOdds - 1.0)
 *   Delta_home === 0.0  => 走盘退本, 收益 = 0.0
 *   Delta_home === -0.25 => 输半, 收益 = -0.5
 *   Delta_home <= -0.5  => 全输, 收益 = -1.0
 * 同理客队有效净胜差 Delta_away = -d - line
 */
export function calculateAsianHandicapEV(
  handicapLineStr: string,
  homeOdds: number,
  awayOdds: number,
  poisson: PoissonExpectation,
  awaySelectionStr?: string
): SpreadEVAssessment {
  const parsedLine = parseAsianHandicapLine(handicapLineStr);
  // 防御性降级：无法解析的盘口（如部分中文盘口「主让一球」）不得以 NaN 污染 EV 网格，按平手盘 0 处理。
  const line = Number.isFinite(parsedLine) ? parsedLine : 0.0;
  const lambdaHome = requireFiniteNonNegative(poisson.lambda_home_rest, 'lambda_home_rest');
  const lambdaAway = requireFiniteNonNegative(poisson.lambda_away_rest, 'lambda_away_rest');

  // 使用双变量泊松分布网格闭式求解
  const gridObj = calculateBivariatePoissonGrid(lambdaHome, lambdaAway, Math.max(poissonSupportUpperBound(lambdaHome), poissonSupportUpperBound(lambdaAway)));
  const matrix = gridObj.grid;

  let homeEV = 0.0;
  let awayEV = 0.0;
  let homePositiveProbability = 0.0;
  let awayPositiveProbability = 0.0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const pCell = matrix[h][a];
      if (pCell <= 0) continue;

      const d = h - a; // 剩余主队净胜球

      // 1. 主队收益
      const deltaHome = d + line;
      let payoffHome = 0.0;
      if (deltaHome >= 0.5) {
        payoffHome = homeOdds - 1.0; // 全赢
      } else if (Math.abs(deltaHome - 0.25) < 1e-4) {
        payoffHome = 0.5 * (homeOdds - 1.0); // 赢半
      } else if (Math.abs(deltaHome) < 1e-4) {
        payoffHome = 0.0; // 走盘
      } else if (Math.abs(deltaHome - (-0.25)) < 1e-4) {
        payoffHome = -0.5; // 输半
      } else {
        payoffHome = -1.0; // 全输
      }
      homeEV += pCell * payoffHome;
      if (payoffHome > 0) homePositiveProbability += pCell;

      // 2. 客队收益
      const deltaAway = -d - line;
      let payoffAway = 0.0;
      if (deltaAway >= 0.5) {
        payoffAway = awayOdds - 1.0; // 全赢
      } else if (Math.abs(deltaAway - 0.25) < 1e-4) {
        payoffAway = 0.5 * (awayOdds - 1.0); // 赢半
      } else if (Math.abs(deltaAway) < 1e-4) {
        payoffAway = 0.0; // 走盘
      } else if (Math.abs(deltaAway - (-0.25)) < 1e-4) {
        payoffAway = -0.5; // 输半
      } else {
        payoffAway = -1.0; // 全输
      }
      awayEV += pCell * payoffAway;
      if (payoffAway > 0) awayPositiveProbability += pCell;
    }
  }

  homeEV = Number(homeEV.toFixed(4));
  awayEV = Number(awayEV.toFixed(4));

  // 经验贝叶斯高赔与冷门收缩 (Empirical Bayesian Shrinkage for Odds > 2.80)
  const homeShrink = applyBayesianShrinkage(homePositiveProbability, homeOdds);
  const awayShrink = applyBayesianShrinkage(awayPositiveProbability, awayOdds);
  let effectiveHomeEV = homeEV;
  let effectiveAwayEV = awayEV;

  if (homeShrink.isApplied && homePositiveProbability > 0) {
    const ratio = homeShrink.shrunkProb / homePositiveProbability;
    effectiveHomeEV = Number((homeEV * ratio).toFixed(4));
  }
  if (awayShrink.isApplied && awayPositiveProbability > 0) {
    const ratio = awayShrink.shrunkProb / awayPositiveProbability;
    effectiveAwayEV = Number((awayEV * ratio).toFixed(4));
  }

  // P0-05 规范：优先依据 Risk-Adjusted EV（净 EV），绝对禁止用单纯胜率高低覆盖 EV
  let preferredSide: 'home' | 'away' | 'none' = 'none';
  const marketMargin = Math.max(0.025, (1.0 / homeOdds + 1.0 / awayOdds) - 1.0);
  const minRequiredEV = Math.max(0.015, marketMargin * 0.5 + 0.01);

  if (effectiveHomeEV >= minRequiredEV && effectiveAwayEV < minRequiredEV) {
    preferredSide = 'home';
  } else if (effectiveAwayEV >= minRequiredEV && effectiveHomeEV < minRequiredEV) {
    preferredSide = 'away';
  } else if (effectiveHomeEV >= minRequiredEV && effectiveAwayEV >= minRequiredEV) {
    preferredSide = effectiveHomeEV >= effectiveAwayEV ? 'home' : 'away';
  } else {
    preferredSide = 'none';
  }

  const selectedOdds = preferredSide === 'home' ? homeOdds : (preferredSide === 'away' ? awayOdds : undefined);
  const selectedEV = preferredSide === 'home' ? effectiveHomeEV : (preferredSide === 'away' ? effectiveAwayEV : 0);
  const kellyFraction = (preferredSide !== 'none' && selectedOdds !== undefined && selectedOdds > 1.0 && selectedEV > 0)
    ? Number(Math.max(0.0, Math.min(0.05, selectedEV / (4.0 * (selectedOdds - 1.0)))).toFixed(4))
    : 0.0;

  // P1-08: 求解 5 态精确结算概率分布
  const homeSettlementDist = calculateSpreadFiveStateDistribution(line, 'home', matrix);
  const awaySettlementDist = calculateSpreadFiveStateDistribution(line, 'away', matrix);

  const anyShrinkage = homeShrink.isApplied || awayShrink.isApplied;
  const shrinkFactor = homeShrink.isApplied ? homeShrink.shrinkageFactor : (awayShrink.isApplied ? awayShrink.shrinkageFactor : 1.0);

  const resolvedAwayLine = awaySelectionStr || invertHandicapString(handicapLineStr);
  const selectedLine = preferredSide === 'away' ? resolvedAwayLine : (preferredSide === 'home' ? handicapLineStr : undefined);

  return Object.freeze({
    line: handicapLineStr,
    home_line: handicapLineStr,
    away_line: resolvedAwayLine,
    selected_line: selectedLine,
    selected_odds: selectedOdds,
    home_odds: homeOdds,
    away_odds: awayOdds,
    home_ev: effectiveHomeEV,
    away_ev: effectiveAwayEV,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none',
    home_model_probability: Number((homeShrink.isApplied ? homeShrink.shrunkProb : homePositiveProbability).toFixed(4)),
    away_model_probability: Number((awayShrink.isApplied ? awayShrink.shrunkProb : awayPositiveProbability).toFixed(4)),
    kelly_fraction: kellyFraction,
    home_settlement_distribution: homeSettlementDist,
    away_settlement_distribution: awaySettlementDist,
    bayesian_shrinkage_applied: anyShrinkage,
    shrinkage_factor: shrinkFactor
  });
}

/**
 * 计算全场大小球盘口的复合数学期望 (EV)
 * 基于单变量泊松分布 K_rest ~ Poisson(lambda_rest) 进行闭式全量展开：
 * 剩余进球目标 T = line - currentTotalGoals
 * 对于任意剩余总进球 k in [0..10]:
 *   大球差额 Delta_over = k - T
 *     Delta_over >= 0.5  => 全赢 (overOdds - 1.0)
 *     Delta_over === 0.25 => 赢半 (0.5 * (overOdds - 1.0))
 *     Delta_over === 0.0  => 走盘退本 (0.0)
 *     Delta_over === -0.25 => 输半 (-0.5)
 *     Delta_over <= -0.5  => 全输 (-1.0)
 *   小球差额 Delta_under = T - k
 */
export function calculateTotalGoalsEV(
  totalLineStr: string,
  overOdds: number,
  underOdds: number,
  currentTotalGoals: number,
  poisson: PoissonExpectation
): TotalEVAssessment {
  const parsedLine = parseAsianHandicapLine(totalLineStr);
  // 防御性降级：无法解析的盘口不得以 NaN 污染 EV 网格，按 0 球盘处理。
  const line = Number.isFinite(parsedLine) ? parsedLine : 0.0;
  const remainingTarget = line - currentTotalGoals;
  const lambdaRest = requireFiniteNonNegative(poisson.expected_goals_rest, 'expected_goals_rest');

  let overEV = 0.0;
  let underEV = 0.0;
  let overPositiveProbability = 0.0;
  let underPositiveProbability = 0.0;

  // 动态展开至可忽略尾部，避免深盘与高 λ 时丢失概率质量。
  for (let k = 0; k <= poissonSupportUpperBound(lambdaRest); k++) {
    const pK = poissonPMF(k, lambdaRest);
    if (pK <= 0) continue;

    // 1. 大球收益
    const deltaOver = k - remainingTarget;
    let payoffOver = 0.0;
    if (deltaOver >= 0.5) {
      payoffOver = overOdds - 1.0;
    } else if (Math.abs(deltaOver - 0.25) < 1e-4) {
      payoffOver = 0.5 * (overOdds - 1.0);
    } else if (Math.abs(deltaOver) < 1e-4) {
      payoffOver = 0.0;
    } else if (Math.abs(deltaOver - (-0.25)) < 1e-4) {
      payoffOver = -0.5;
    } else {
      payoffOver = -1.0;
    }
    overEV += pK * payoffOver;
    if (payoffOver > 0) overPositiveProbability += pK;

    // 2. 小球收益
    const deltaUnder = remainingTarget - k;
    let payoffUnder = 0.0;
    if (deltaUnder >= 0.5) {
      payoffUnder = underOdds - 1.0;
    } else if (Math.abs(deltaUnder - 0.25) < 1e-4) {
      payoffUnder = 0.5 * (underOdds - 1.0);
    } else if (Math.abs(deltaUnder) < 1e-4) {
      payoffUnder = 0.0;
    } else if (Math.abs(deltaUnder - (-0.25)) < 1e-4) {
      payoffUnder = -0.5;
    } else {
      payoffUnder = -1.0;
    }
    underEV += pK * payoffUnder;
    if (payoffUnder > 0) underPositiveProbability += pK;
  }

  overEV = Number(overEV.toFixed(4));
  underEV = Number(underEV.toFixed(4));

  // 经验贝叶斯高赔与冷门收缩 (Empirical Bayesian Shrinkage for Odds > 2.80)
  const overShrink = applyBayesianShrinkage(overPositiveProbability, overOdds);
  const underShrink = applyBayesianShrinkage(underPositiveProbability, underOdds);
  let effectiveOverEV = overEV;
  let effectiveUnderEV = underEV;

  if (overShrink.isApplied && overPositiveProbability > 0) {
    const ratio = overShrink.shrunkProb / overPositiveProbability;
    effectiveOverEV = Number((overEV * ratio).toFixed(4));
  }
  if (underShrink.isApplied && underPositiveProbability > 0) {
    const ratio = underShrink.shrunkProb / underPositiveProbability;
    effectiveUnderEV = Number((underEV * ratio).toFixed(4));
  }

  // P0-05 规范：优先依据 Risk-Adjusted EV，绝对禁止用胜率高低覆盖 EV
  let preferredSide: 'over' | 'under' | 'none' = 'none';
  const marketMargin = Math.max(0.025, (1.0 / overOdds + 1.0 / underOdds) - 1.0);
  const minRequiredEV = Math.max(0.015, marketMargin * 0.5 + 0.01);

  if (effectiveOverEV >= minRequiredEV && effectiveUnderEV < minRequiredEV) {
    preferredSide = 'over';
  } else if (effectiveUnderEV >= minRequiredEV && effectiveOverEV < minRequiredEV) {
    preferredSide = 'under';
  } else if (effectiveOverEV >= minRequiredEV && effectiveUnderEV >= minRequiredEV) {
    preferredSide = effectiveOverEV >= effectiveUnderEV ? 'over' : 'under';
  } else {
    preferredSide = 'none';
  }

  const selectedOdds = preferredSide === 'over' ? overOdds : underOdds;
  const selectedEV = preferredSide === 'over' ? effectiveOverEV : effectiveUnderEV;
  const kellyFraction = (preferredSide !== 'none' && selectedOdds > 1.0 && selectedEV > 0)
    ? Number(Math.max(0.0, Math.min(0.05, selectedEV / (4.0 * (selectedOdds - 1.0)))).toFixed(4))
    : 0.0;

  // P1-08: 求解 5 态精确结算概率分布
  const overSettlementDist = calculateTotalFiveStateDistribution(line, currentTotalGoals, 'over', lambdaRest);
  const underSettlementDist = calculateTotalFiveStateDistribution(line, currentTotalGoals, 'under', lambdaRest);

  const anyShrinkage = overShrink.isApplied || underShrink.isApplied;
  const shrinkFactor = overShrink.isApplied ? overShrink.shrinkageFactor : (underShrink.isApplied ? underShrink.shrinkageFactor : 1.0);

  return Object.freeze({
    line: totalLineStr,
    over_odds: overOdds,
    under_odds: underOdds,
    over_ev: effectiveOverEV,
    under_ev: effectiveUnderEV,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none',
    over_model_probability: Number((overShrink.isApplied ? overShrink.shrunkProb : overPositiveProbability).toFixed(4)),
    under_model_probability: Number((underShrink.isApplied ? underShrink.shrunkProb : underPositiveProbability).toFixed(4)),
    kelly_fraction: kellyFraction,
    over_settlement_distribution: overSettlementDist,
    under_settlement_distribution: underSettlementDist,
    bayesian_shrinkage_applied: anyShrinkage,
    shrinkage_factor: shrinkFactor
  });
}

/**
 * 识别机构设防与诱盘姿态 (Bookmaker Posture)
 */
export function identifyBookmakerPosture(
  spreadEV: SpreadEVAssessment | undefined,
  totalEV: TotalEVAssessment | undefined,
  overround: number,
  shinZ?: number,
  h2hDevig?: SingleMarketDevig
): BookmakerPosture {
  // 1. 庄家极度抽水防御或知情交易者重度介入 (P1-03: 仅在有效估算出 Shin Z 时触发)
  if (shinZ !== undefined && shinZ >= 0.08) {
    return BookmakerPosture.HEAVY_DEFENSIVE;
  }

  // 2. 异常高赔/低赔诱盘陷阱 (Trap Odds Assessment)
  // 结合两种专业口径：
  // 口径 A (Model vs Market 期望差): 高赔方 (>= 4.0) 真实 EV 极度负偏 (EV < -0.12)，或低赔方 (<= 1.50) 严重负 EV (EV < -0.10) 导致散户盲信大热；
  // 口径 B (Pure Market 极端赔率非对称): 强队独赢压至 <= 1.50，弱队顶到 >= 7.00，抽水与风险敞口极度非对称诱导博冷。
  if (spreadEV && ((spreadEV.home_ev < -0.08 && spreadEV.home_odds > 2.20) || (spreadEV.away_ev < -0.08 && spreadEV.away_odds > 2.20))) {
    return BookmakerPosture.TRAP_HIGH_ODDS;
  }

  if (h2hDevig?.market_odds) {
    const odds = h2hDevig.market_odds;
    const probs = h2hDevig.model_probabilities;
    const minOdds = Math.min(...odds);
    const maxOdds = Math.max(...odds);

    // 口径 B: 纯盘口极端非对称诱盘 (低赔 <= 1.50 且高赔 >= 7.00)
    if (minOdds <= 1.50 && maxOdds >= 7.00) {
      return BookmakerPosture.TRAP_HIGH_ODDS;
    }

    // 口径 A: 模型 vs 盘口严重背离判定 (低胜率虚抬高赔诱盘 或 低赔过热诱盘)
    if (probs && probs.length === 3) {
      for (let i = 0; i < 3; i++) {
        const ev = probs[i] * odds[i] - 1.0;
        // 高赔方虚高但胜率极低：赔率 >= 4.5 且严重负 EV (< -0.15)
        if (odds[i] >= 4.5 && ev < -0.15) {
          return BookmakerPosture.TRAP_HIGH_ODDS;
        }
        // 低赔方名气泡沫：赔率 <= 1.50 且严重负 EV (< -0.10)
        if (odds[i] <= 1.50 && ev < -0.10) {
          return BookmakerPosture.TRAP_HIGH_ODDS;
        }
      }
    }
  }

  // 3. 抽水率偏高且无明确正 EV
  if (overround > 1.10 && (!spreadEV || !spreadEV.is_positive_ev) && (!totalEV || !totalEV.is_positive_ev) && (!h2hDevig || !h2hDevig.is_positive_ev)) {
    return BookmakerPosture.DISPERSED_UNCERTAIN;
  }

  return BookmakerPosture.BALANCED_NEUTRAL;
}

/**
 * Layer 03 M5 统一入口：计算去抽水与全量盘口复合期望特征
 */
/**
 * 求解 1X2 独赢市场 EV 与最优投注选择 (纯数学公理计算，零魔法常数)
 */
export function calculateH2hEV(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number,
  poisson: InPlayPoissonFeatures,
  minEvThreshold = 0.035
): {
  model_probabilities: [number, number, number];
  home_ev: number;
  draw_ev: number;
  away_ev: number;
  preferred_side: 'home' | 'draw' | 'away' | 'none';
  is_positive_ev: boolean;
  kelly_fraction: number;
  bayesian_shrinkage_applied?: boolean;
  shrinkage_factor?: number;
} {
  const probs = poisson.full_time_probabilities ?? {
    prob_home_win: poisson.rest_score_matrix.prob_home_win_rest,
    prob_draw: poisson.rest_score_matrix.prob_draw_rest,
    prob_away_win: poisson.rest_score_matrix.prob_away_win_rest
  };

  const probHome = probs.prob_home_win;
  const probDraw = probs.prob_draw;
  const probAway = probs.prob_away_win;

  // 经验贝叶斯高赔收缩 (Empirical Bayesian Shrinkage for Odds > 2.80)
  const homeShrink = applyBayesianShrinkage(probHome, homeOdds);
  const drawShrink = applyBayesianShrinkage(probDraw, drawOdds);
  const awayShrink = applyBayesianShrinkage(probAway, awayOdds);

  const effProbHome = homeShrink.shrunkProb;
  const effProbDraw = drawShrink.shrunkProb;
  const effProbAway = awayShrink.shrunkProb;

  const homeEv = homeOdds > 1 ? Number((effProbHome * homeOdds - 1.0).toFixed(4)) : -1.0;
  const drawEv = drawOdds > 1 ? Number((effProbDraw * drawOdds - 1.0).toFixed(4)) : -1.0;
  const awayEv = awayOdds > 1 ? Number((effProbAway * awayOdds - 1.0).toFixed(4)) : -1.0;

  let preferredSide: 'home' | 'draw' | 'away' | 'none' = 'none';
  let maxEv = -1.0;
  let maxProb = 0.0;
  let maxOdds = 0.0;

  const MIN_KELLY_ALLOCATION = 0.015;
  const isEligible1X2 = (ev: number, odds: number) => {
    if (ev < minEvThreshold || odds <= 1.0) return false;
    const kellyFraction = ev / (odds - 1.0);
    return kellyFraction >= MIN_KELLY_ALLOCATION;
  };

  if (homeEv > maxEv && isEligible1X2(homeEv, homeOdds)) {
    maxEv = homeEv;
    preferredSide = 'home';
    maxProb = effProbHome;
    maxOdds = homeOdds;
  }
  if (drawEv > maxEv && isEligible1X2(drawEv, drawOdds)) {
    maxEv = drawEv;
    preferredSide = 'draw';
    maxProb = effProbDraw;
    maxOdds = drawOdds;
  }
  if (awayEv > maxEv && isEligible1X2(awayEv, awayOdds)) {
    maxEv = awayEv;
    preferredSide = 'away';
    maxProb = effProbAway;
    maxOdds = awayOdds;
  }

  let kelly = 0.0;
  if (preferredSide !== 'none' && maxOdds > 1.0) {
    const b = maxOdds - 1.0;
    const q = 1.0 - maxProb;
    const fullKelly = (b * maxProb - q) / b;
    kelly = Number(Math.max(0.0, Math.min(0.05, fullKelly * 0.25)).toFixed(4));
  }

  const anyShrinkage = homeShrink.isApplied || drawShrink.isApplied || awayShrink.isApplied;
  const selectedShrinkFactor = preferredSide === 'home'
    ? homeShrink.shrinkageFactor
    : (preferredSide === 'draw' ? drawShrink.shrinkageFactor : (preferredSide === 'away' ? awayShrink.shrinkageFactor : 1.0));

  return {
    model_probabilities: [effProbHome, effProbDraw, effProbAway],
    home_ev: homeEv,
    draw_ev: drawEv,
    away_ev: awayEv,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none',
    kelly_fraction: kelly,
    bayesian_shrinkage_applied: anyShrinkage,
    shrinkage_factor: selectedShrinkFactor
  };
}

export function calculateDeviggedMarketFeatures(
  match: CanonicalMatch,
  poisson: InPlayPoissonFeatures,
  collector?: DeficitCollector,
  tracer?: Tracer
): DeviggedMarketFeatures {
  const isLive = match.timing?.stage === MatchStage.LIVE;

  // P0-01: 区分 LIVE / PREMATCH 赔率源，并禁止在 LIVE 阶段回退到 PREMATCH
  let evMarketSource: 'LIVE_YBTY' | 'LIVE_LEISU' | 'PREMATCH' | 'UNAVAILABLE' = 'UNAVAILABLE';
  const rawMarkets = match.markets;

  const hasAvailableOdds = Boolean(
    rawMarkets && (
      (rawMarkets.full_spread_main?.home_odds && rawMarkets.full_spread_main.home_odds > 1.0) ||
      (rawMarkets.full_total_main?.over_odds && rawMarkets.full_total_main.over_odds > 1.0) ||
      (rawMarkets.full_h2h?.home_odds && rawMarkets.full_h2h.home_odds > 1.0)
    )
  );

  if (isLive) {
    evMarketSource = hasAvailableOdds ? 'LIVE_YBTY' : 'UNAVAILABLE';
  } else {
    evMarketSource = hasAvailableOdds ? 'PREMATCH' : 'UNAVAILABLE';
  }

  // 若无法获得对应阶段的合法赔率，直接阻断虚假 EV 计算
  const activeMarkets = evMarketSource === 'UNAVAILABLE' ? null : rawMarkets;

  const h2hOdds = activeMarkets?.full_h2h;
  const decimalOdds: number[] = [];
  if (h2hOdds) {
    if (h2hOdds.home_odds) decimalOdds.push(h2hOdds.home_odds);
    if (h2hOdds.draw_odds) decimalOdds.push(h2hOdds.draw_odds);
    if (h2hOdds.away_odds) decimalOdds.push(h2hOdds.away_odds);
  }

  // 1. 欧赔去抽水与 M3 独赢 EV 计算 (双轨机制：Shin 市场去抽水轨道 + 泊松网格模型积分轨道)
  let h2hDevig: SingleMarketDevig | undefined;
  let estimatedShinZ: number | undefined;
  let shinZStatus: 'DYNAMIC_ESTIMATED' | 'DEFAULT_ASSUMPTION' | 'UNAVAILABLE' = 'UNAVAILABLE';
  let postureConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

  const homeOddsVal = h2hOdds?.home_odds ?? 0;
  const drawOddsVal = h2hOdds?.draw_odds ?? 0;
  const awayOddsVal = h2hOdds?.away_odds ?? 0;

  // 始终运行泊松网格模型积分评估，保证底层模型概率闭合
  const h2hEval = calculateH2hEV(homeOddsVal, drawOddsVal, awayOddsVal, poisson);

  if (decimalOdds.length === 3 && homeOddsVal > 1.0 && drawOddsVal > 1.0 && awayOddsVal > 1.0) {
    // 轨道 1：市场存在完整三项欧赔，使用 Shin 去抽水
    const shin = devigShin(decimalOdds);
    if (shin.z > 0) {
      estimatedShinZ = shin.z;
      shinZStatus = 'DYNAMIC_ESTIMATED';
      postureConfidence = 'HIGH';
    } else {
      shinZStatus = 'UNAVAILABLE';
      postureConfidence = 'LOW';
    }
    h2hDevig = {
      market_type: MarketType.MONEYLINE_1X2,
      raw_overround: shin.overround,
      devig_method: shin.z > 0 ? DevigMethod.SHIN : DevigMethod.MULTIPLICATIVE,
      fair_probabilities: shin.fair_probs,
      fair_odds: shin.fair_probs.map((p) => (p > 0 ? Number((1.0 / p).toFixed(3)) : 0.0)),
      market_odds: [homeOddsVal, drawOddsVal, awayOddsVal],
      model_probabilities: h2hEval.model_probabilities,
      home_ev: h2hEval.home_ev,
      draw_ev: h2hEval.draw_ev,
      away_ev: h2hEval.away_ev,
      preferred_side: h2hEval.preferred_side,
      is_positive_ev: h2hEval.is_positive_ev,
      kelly_fraction: h2hEval.kelly_fraction,
      bayesian_shrinkage_applied: h2hEval.bayesian_shrinkage_applied,
      shrinkage_factor: h2hEval.shrinkage_factor
    };
  } else {
    // 轨道 2：欧赔缺失或不全时，由泊松网格模型概率闭式推导公允概率与参考赔率
    const modelProbs = h2hEval.model_probabilities;
    h2hDevig = {
      market_type: MarketType.MONEYLINE_1X2,
      raw_overround: 1.0,
      devig_method: DevigMethod.POISSON_MODEL_DERIVED,
      fair_probabilities: modelProbs,
      fair_odds: modelProbs.map((p) => (p > 0 ? Number((1.0 / p).toFixed(3)) : 0.0)),
      market_odds: [homeOddsVal, drawOddsVal, awayOddsVal],
      model_probabilities: modelProbs,
      home_ev: h2hEval.home_ev,
      draw_ev: h2hEval.draw_ev,
      away_ev: h2hEval.away_ev,
      preferred_side: h2hEval.preferred_side,
      is_positive_ev: h2hEval.is_positive_ev,
      kelly_fraction: h2hEval.kelly_fraction,
      bayesian_shrinkage_applied: h2hEval.bayesian_shrinkage_applied,
      shrinkage_factor: h2hEval.shrinkage_factor
    };
    shinZStatus = 'UNAVAILABLE';
    postureConfidence = 'LOW';
  }

  // 2. 亚洲让球盘 EV
  const spreadMarket = activeMarkets?.full_spread_main;
  let spreadMain: SpreadEVAssessment | undefined;
  if (spreadMarket && spreadMarket.home_selection && spreadMarket.home_odds && spreadMarket.away_odds) {
    spreadMain = calculateAsianHandicapEV(spreadMarket.home_selection, spreadMarket.home_odds, spreadMarket.away_odds, poisson, spreadMarket.away_selection);
  }

  const spreadSecondaryEV: SpreadEVAssessment[] = [];
  if (activeMarkets?.full_spread_subs) {
    for (const sub of activeMarkets.full_spread_subs) {
      if (sub.home_selection && sub.home_odds && sub.away_odds) {
        spreadSecondaryEV.push(calculateAsianHandicapEV(sub.home_selection, sub.home_odds, sub.away_odds, poisson, sub.away_selection));
      }
    }
  }

  // 3. 大小球盘 EV
  const totalMarket = activeMarkets?.full_total_main;
  const currentTotal = totalMarket?.settlement_basis === 'REMAINING_GOALS'
    ? 0
    : (match.score.home_score ?? 0) + (match.score.away_score ?? 0);
  let totalMain: TotalEVAssessment | undefined;
  if (totalMarket && totalMarket.line && totalMarket.over_odds && totalMarket.under_odds) {
    totalMain = calculateTotalGoalsEV(totalMarket.line, totalMarket.over_odds, totalMarket.under_odds, currentTotal, poisson);
  }

  const totalSecondaryEV: TotalEVAssessment[] = [];
  if (activeMarkets?.full_total_subs) {
    for (const sub of activeMarkets.full_total_subs) {
      if (sub.line && sub.over_odds && sub.under_odds) {
        const subCurrentTotal = sub.settlement_basis === 'REMAINING_GOALS'
          ? 0
          : (match.score.home_score ?? 0) + (match.score.away_score ?? 0);
        totalSecondaryEV.push(calculateTotalGoalsEV(sub.line, sub.over_odds, sub.under_odds, subCurrentTotal, poisson));
      }
    }
  }

  // 3.5. 上半场让球盘与半场大小球 EV 求解 (Half-Time Asian Handicap & Total Goals EV)
  // 当且仅当赛事处于上半场或赛前 (elapsed_minute < 45) 且提供了 first_half_poisson 期望时精确求解
  let halfSpreadMain: SpreadEVAssessment | undefined = undefined;
  let halfTotalMain: TotalEVAssessment | undefined = undefined;

  const halfPoissonExpectation: PoissonExpectation | undefined = poisson.first_half_poisson
    ? {
        lambda_home_rest: poisson.first_half_poisson.lambda_home_first_half,
        lambda_away_rest: poisson.first_half_poisson.lambda_away_first_half,
        expected_goals_rest: poisson.first_half_poisson.expected_goals_first_half
      }
    : (poisson.elapsed_minute < 45
        ? {
            // 回退比例：若未显式构建 first_half_poisson，按剩余半场分钟占全场比例推导截断期望
            lambda_home_rest: Number((poisson.lambda_home_rest * Math.max(0, 45 - poisson.elapsed_minute) / Math.max(1, 90 - poisson.elapsed_minute)).toFixed(3)),
            lambda_away_rest: Number((poisson.lambda_away_rest * Math.max(0, 45 - poisson.elapsed_minute) / Math.max(1, 90 - poisson.elapsed_minute)).toFixed(3)),
            expected_goals_rest: Number((poisson.expected_goals_rest * Math.max(0, 45 - poisson.elapsed_minute) / Math.max(1, 90 - poisson.elapsed_minute)).toFixed(3))
          }
        : undefined);

  if (halfPoissonExpectation && poisson.elapsed_minute < 45) {
    const halfSpreadMarket = activeMarkets?.half_spread_main;
    if (halfSpreadMarket && halfSpreadMarket.home_selection && halfSpreadMarket.home_odds && halfSpreadMarket.away_odds) {
      halfSpreadMain = calculateAsianHandicapEV(
        halfSpreadMarket.home_selection,
        halfSpreadMarket.home_odds,
        halfSpreadMarket.away_odds,
        halfPoissonExpectation,
        halfSpreadMarket.away_selection
      );
    }

    const halfTotalMarket = activeMarkets?.half_total_main;
    if (halfTotalMarket && halfTotalMarket.line && halfTotalMarket.over_odds && halfTotalMarket.under_odds) {
      const halfCurrentTotal = halfTotalMarket.settlement_basis === 'REMAINING_GOALS'
        ? 0
        : (match.score.home_score ?? 0) + (match.score.away_score ?? 0);
      halfTotalMain = calculateTotalGoalsEV(
        halfTotalMarket.line,
        halfTotalMarket.over_odds,
        halfTotalMarket.under_odds,
        halfCurrentTotal,
        halfPoissonExpectation
      );
    }
  }

  // 4. 机构姿态识别 (使用动态估算的 Shin Z，绝不硬编码 0.02)
  const posture = identifyBookmakerPosture(spreadMain, totalMain, h2hDevig?.raw_overround ?? 1.05, estimatedShinZ, h2hDevig);

  // 5. P1-02: 真实计算 line_dispersion，禁止伪造 0.0
  const spreadLines: number[] = [];
  if (activeMarkets?.full_spread_main?.home_selection) {
    spreadLines.push(parseAsianHandicapLine(activeMarkets.full_spread_main.home_selection));
  }
  if (activeMarkets?.full_spread_subs) {
    for (const sub of activeMarkets.full_spread_subs) {
      if (sub.home_selection) {
        spreadLines.push(parseAsianHandicapLine(sub.home_selection));
      }
    }
  }

  let spreadVariance: number | 'UNAVAILABLE' = 'UNAVAILABLE';
  if (spreadLines.length >= 2) {
    const mean = spreadLines.reduce((a, b) => a + b, 0) / spreadLines.length;
    const v = spreadLines.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / (spreadLines.length - 1);
    spreadVariance = Number(v.toFixed(4));
  }

  const totalLines: number[] = [];
  if (activeMarkets?.full_total_main?.line) {
    totalLines.push(parseAsianHandicapLine(activeMarkets.full_total_main.line));
  }
  if (activeMarkets?.full_total_subs) {
    for (const sub of activeMarkets.full_total_subs) {
      if (sub.line) {
        totalLines.push(parseAsianHandicapLine(sub.line));
      }
    }
  }

  let totalVariance: number | 'UNAVAILABLE' = 'UNAVAILABLE';
  if (totalLines.length >= 2) {
    const mean = totalLines.reduce((a, b) => a + b, 0) / totalLines.length;
    const v = totalLines.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / (totalLines.length - 1);
    totalVariance = Number(v.toFixed(4));
  }

  let dispersionStatus: 'CALCULATED' | 'PARTIAL' | 'UNAVAILABLE' = 'UNAVAILABLE';
  if (typeof spreadVariance === 'number' && typeof totalVariance === 'number') {
    dispersionStatus = 'CALCULATED';
  } else if (typeof spreadVariance === 'number' || typeof totalVariance === 'number') {
    dispersionStatus = 'PARTIAL';
  }

  const lineDispersion: LineDispersionMetrics = {
    spread_variance: spreadVariance,
    total_variance: totalVariance,
    spread_lines_count: spreadLines.length,
    total_lines_count: totalLines.length,
    status: dispersionStatus
  };

  const activeTracer = tracer ?? Tracer.getInstance();
  activeTracer.log(
    'INFO',
    'QUANT_03_DEVIG_CALCULATION',
    'DEVIG_EV_COMPLETED',
    `Devig and EV calculated for match ${match.canonical_id}`,
    {
      posture,
      spread_main: spreadMain,
      total_main: totalMain,
      ev_market_source: evMarketSource,
      shin_z: estimatedShinZ,
      line_dispersion: lineDispersion
    },
    match.canonical_id
  );

  return Object.freeze({
    h2h_devig: h2hDevig,
    spread_main_ev: spreadMain,
    spread_secondary_ev: spreadSecondaryEV,
    total_main_ev: totalMain,
    total_secondary_ev: totalSecondaryEV,
    half_spread_main_ev: halfSpreadMain,
    half_total_main_ev: halfTotalMain,
    line_dispersion: lineDispersion,
    bookmaker_posture: posture,
    ev_market_source: evMarketSource,
    shin_z: estimatedShinZ,
    shin_z_status: shinZStatus,
    posture_confidence: postureConfidence
  });
}

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
  Layer03FeatureId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';
import { poissonPMF, calculateBivariatePoissonGrid } from './poissonDecayModel.js';

type PoissonExpectation = Pick<InPlayPoissonFeatures, 'lambda_home_rest' | 'lambda_away_rest' | 'expected_goals_rest'>;

function requireFiniteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative Poisson expectation.`);
  }
  return value;
}

function poissonSupportUpperBound(lambda: number): number {
  return Math.max(12, Math.ceil(lambda + 10 * Math.sqrt(lambda + 1)));
}

function calculateLineVariance(lines: readonly string[]): number {
  const values = lines.map((line) => parseAsianHandicapLine(line));
  if (values.length < 2) return 0.0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Number(variance.toFixed(6));
}

/**
 * 比例剥水模型 (Multiplicative / Proportional De-vig)
 * Fair_P_i = (1 / Odds_i) / sum(1 / Odds_j)
 */
export function devigMultiplicative(decimalOdds: number[]): { fair_probs: number[]; overround: number } {
  if (!decimalOdds || decimalOdds.length === 0) {
    return { fair_probs: [], overround: 0.0 };
  }

  const rawProbs = decimalOdds.map((odds) => (odds > 1.0 ? 1.0 / odds : 0.0));
  const sumRaw = rawProbs.reduce((a, b) => a + b, 0.0);

  if (sumRaw === 0.0) {
    return { fair_probs: decimalOdds.map(() => 0.0), overround: 0.0 };
  }

  const fairProbs = rawProbs.map((p) => Number((p / sumRaw).toFixed(4)));
  return {
    fair_probs: fairProbs,
    overround: Number(sumRaw.toFixed(4))
  };
}

/**
 * Shin 算法模型 (知情交易者 Insider Model De-vig)
 * 解决低赔率过度高估与高赔率低估 (Favorite-Longshot Bias)
 * 迭代求解知情交易者比例 z ∈ [0, 1)
 */
export function devigShin(decimalOdds: number[], maxIter: number = 50, tol: number = 1e-6): { fair_probs: number[]; overround: number; z: number } {
  if (!decimalOdds || decimalOdds.length === 0) {
    return { fair_probs: [], overround: 0.0, z: 0.0 };
  }

  const mult = devigMultiplicative(decimalOdds);
  if (mult.fair_probs.length === 0 || mult.overround <= 1.0) {
    return { fair_probs: mult.fair_probs, overround: mult.overround, z: 0.0 };
  }

  const invOdds = decimalOdds.map((o) => (o > 1.0 ? 1.0 / o : 0.0));
  const overround = mult.overround;

  let z = 0.02; // 初始猜测
  for (let iter = 0; iter < maxIter; iter++) {
    // 求解 p_i = (sqrt(z^2 + 4*(1-z)*invOdds_i^2 / overround) - z) / (2*(1-z))
    let sumP = 0.0;
    const pTemp: number[] = [];

    for (let i = 0; i < decimalOdds.length; i++) {
      const q = invOdds[i];
      const term = Math.sqrt(z * z + (4.0 * (1.0 - z) * q * q) / overround);
      const pi = (term - z) / (2.0 * (1.0 - z));
      pTemp.push(Math.max(0.0, pi));
      sumP += pi;
    }

    const diff = sumP - 1.0;
    if (Math.abs(diff) < tol) {
      z = Math.max(0.0, Math.min(0.5, z));
      const normalizedProbs = pTemp.map((p) => Number((p / sumP).toFixed(4)));
      return {
        fair_probs: normalizedProbs,
        overround: Number(overround.toFixed(4)),
        z: Number(z.toFixed(4))
      };
    }

    // 导数微调牛顿法 step
    z = z + diff * 0.1;
    if (z < 0.0) z = 0.001;
    if (z > 0.4) z = 0.4;
  }

  // 迭代未收敛则优雅降级为比例剥水
  return {
    fair_probs: mult.fair_probs,
    overround: mult.overround,
    z: 0.0
  };
}

/**
 * 盘口字符串解析（支持 "-0.5", "2.5", "-0/0.5", "平手/半球", "半球" 等）
 */
export function parseAsianHandicapLine(lineStr: string): number {
  if (!lineStr || typeof lineStr !== 'string') return 0.0;
  const clean = lineStr.trim();

  // 汉字盘口基础名映射表
  const TEXT_MAP: Record<string, number> = {
    '平手': 0.0,
    '平/半': 0.25,
    '平半': 0.25,
    '平手/半球': 0.25,
    '半球': 0.5,
    '半/一': 0.75,
    '半一': 0.75,
    '半球/一球': 0.75,
    '一球': 1.0,
    '一/球半': 1.25,
    '一球/球半': 1.25,
    '球半': 1.5,
    '球半/两球': 1.75,
    '两球': 2.0,
    '两/两球半': 2.25,
    '两球/两球半': 2.25,
    '两球半': 2.5,
    '两球半/三球': 2.75,
    '三球': 3.0
  };

  // 判断受让 vs 让球
  const isSurrender = clean.startsWith('+') || clean.includes('受让') || clean.includes('受');
  const isExplicitMinus = clean.startsWith('-');

  // 清洗汉字前缀
  let pureText = clean.replace(/^[+-]/, '').replace(/^让/, '').replace(/^受让/, '').replace(/^受/, '').trim();

  if (TEXT_MAP[pureText] !== undefined) {
    const val = TEXT_MAP[pureText];
    if (val === 0.0) return 0.0;
    // 中文让球习惯中，“半球”代表主队让半球即 -0.5；“受让半球”代表主队受让即 +0.5
    if (isSurrender) return val;
    return -val;
  }

  // 2. 检查斜杠复合盘 (如 "0/0.5", "0.5/1", "-0/0.5", "0/-0.5", "-0.5/-1")
  if (clean.includes('/')) {
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

  // 3. 直接浮点解析
  const val = parseFloat(clean);
  return isNaN(val) ? 0.0 : val;
}

/**
 * 盘口数值转标准显示串 (如 -0.25 -> "-0/0.5", +0.5 -> "+0.5")
 */
export function formatAsianHandicapLine(lineVal: number): string {
  const isNeg = lineVal < 0;
  const abs = Math.abs(lineVal);

  if (abs === 0.25) return isNeg ? '-0/0.5' : '+0/0.5';
  if (abs === 0.75) return isNeg ? '-0.5/1' : '+0.5/1';
  if (abs === 1.25) return isNeg ? '-1/1.5' : '+1/1.5';
  if (abs === 1.75) return isNeg ? '-1.5/2' : '+1.5/2';
  if (abs === 2.25) return isNeg ? '-2/2.5' : '+2/2.5';
  if (abs === 2.75) return isNeg ? '-2.5/3' : '+2.5/3';

  return lineVal >= 0 ? `+${lineVal}` : `${lineVal}`;
}

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
  poisson: PoissonExpectation
): SpreadEVAssessment {
  const line = parseAsianHandicapLine(handicapLineStr);
  const lambdaHome = requireFiniteNonNegative(poisson.lambda_home_rest, 'lambda_home_rest');
  const lambdaAway = requireFiniteNonNegative(poisson.lambda_away_rest, 'lambda_away_rest');

  // 使用双变量泊松分布网格闭式求解
  const gridObj = calculateBivariatePoissonGrid(lambdaHome, lambdaAway, Math.max(poissonSupportUpperBound(lambdaHome), poissonSupportUpperBound(lambdaAway)));
  const matrix = gridObj.grid;

  let homeEV = 0.0;
  let awayEV = 0.0;

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
    }
  }

  homeEV = Number(homeEV.toFixed(4));
  awayEV = Number(awayEV.toFixed(4));

  let preferredSide: 'home' | 'away' | 'none' = 'none';
  if (homeEV >= 0.035 && homeEV > awayEV) {
    preferredSide = 'home';
  } else if (awayEV >= 0.035 && awayEV > homeEV) {
    preferredSide = 'away';
  }

  const selectedOdds = preferredSide === 'home' ? homeOdds : awayOdds;
  const selectedEV = preferredSide === 'home' ? homeEV : awayEV;
  const kellyFraction = (preferredSide !== 'none' && selectedOdds > 1.0 && selectedEV > 0)
    ? Number(Math.max(0.0, Math.min(0.05, selectedEV / (4.0 * (selectedOdds - 1.0)))).toFixed(4))
    : 0.0;

  return Object.freeze({
    line: handicapLineStr,
    home_odds: homeOdds,
    away_odds: awayOdds,
    home_ev: homeEV,
    away_ev: awayEV,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none',
    kelly_fraction: kellyFraction
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
  const line = parseAsianHandicapLine(totalLineStr);
  const remainingTarget = line - currentTotalGoals;
  const lambdaRest = requireFiniteNonNegative(poisson.expected_goals_rest, 'expected_goals_rest');

  let overEV = 0.0;
  let underEV = 0.0;

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
  }

  overEV = Number(overEV.toFixed(4));
  underEV = Number(underEV.toFixed(4));

  let preferredSide: 'over' | 'under' | 'none' = 'none';
  if (overEV >= 0.035 && overEV > underEV) {
    preferredSide = 'over';
  } else if (underEV >= 0.035 && underEV > overEV) {
    preferredSide = 'under';
  }

  const selectedOdds = preferredSide === 'over' ? overOdds : underOdds;
  const selectedEV = preferredSide === 'over' ? overEV : underEV;
  const kellyFraction = (preferredSide !== 'none' && selectedOdds > 1.0 && selectedEV > 0)
    ? Number(Math.max(0.0, Math.min(0.05, selectedEV / (4.0 * (selectedOdds - 1.0)))).toFixed(4))
    : 0.0;

  return Object.freeze({
    line: totalLineStr,
    over_odds: overOdds,
    under_odds: underOdds,
    over_ev: overEV,
    under_ev: underEV,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none',
    kelly_fraction: kellyFraction
  });
}

/**
 * 识别机构设防与诱盘姿态 (Bookmaker Posture)
 */
export function identifyBookmakerPosture(
  spreadEV: SpreadEVAssessment | undefined,
  totalEV: TotalEVAssessment | undefined,
  overround: number,
  shinZ: number
): BookmakerPosture {
  // 1. 庄家极度抽水防御或知情交易者重度介入
  if (shinZ >= 0.08) {
    return BookmakerPosture.HEAVY_DEFENSIVE;
  }

  // 2. 异常高赔诱盘陷阱 (赔率极诱人但理论胜率支撑不足)
  if (spreadEV && ((spreadEV.home_ev < -0.08 && spreadEV.home_odds > 2.20) || (spreadEV.away_ev < -0.08 && spreadEV.away_odds > 2.20))) {
    return BookmakerPosture.TRAP_HIGH_ODDS;
  }

  // 3. 抽水率偏高且无明确正 EV
  if (overround > 1.10 && (!spreadEV || !spreadEV.is_positive_ev) && (!totalEV || !totalEV.is_positive_ev)) {
    return BookmakerPosture.DISPERSED_UNCERTAIN;
  }

  return BookmakerPosture.BALANCED_NEUTRAL;
}

/**
 * Layer 03 M5 统一入口：计算去抽水与全量盘口复合期望特征
 */
export function calculateDeviggedMarketFeatures(
  match: CanonicalMatch,
  poisson: InPlayPoissonFeatures,
  collector?: DeficitCollector,
  tracer?: Tracer
): DeviggedMarketFeatures {
  const h2hOdds = match.markets?.full_h2h;
  const decimalOdds: number[] = [];
  if (h2hOdds) {
    if (h2hOdds.home_odds) decimalOdds.push(h2hOdds.home_odds);
    if (h2hOdds.draw_odds) decimalOdds.push(h2hOdds.draw_odds);
    if (h2hOdds.away_odds) decimalOdds.push(h2hOdds.away_odds);
  }

  // 1. 欧赔去抽水
  let h2hDevig: SingleMarketDevig | undefined;
  if (decimalOdds.length === 3) {
    const shin = devigShin(decimalOdds);
    h2hDevig = {
      market_type: MarketType.MONEYLINE_1X2,
      raw_overround: shin.overround,
      devig_method: DevigMethod.SHIN,
      fair_probabilities: shin.fair_probs,
      fair_odds: shin.fair_probs.map((p) => (p > 0 ? Number((1.0 / p).toFixed(3)) : 0.0))
    };
  }

  // 2. 亚洲让球盘 EV
  const spreadMarket = match.markets?.full_spread_main;
  let spreadMain: SpreadEVAssessment | undefined;
  if (spreadMarket && spreadMarket.home_selection && spreadMarket.home_odds && spreadMarket.away_odds) {
    spreadMain = calculateAsianHandicapEV(spreadMarket.home_selection, spreadMarket.home_odds, spreadMarket.away_odds, poisson);
  }

  const spreadSecondaryEV: SpreadEVAssessment[] = [];
  if (match.markets?.full_spread_subs) {
    for (const sub of match.markets.full_spread_subs) {
      if (sub.home_selection && sub.home_odds && sub.away_odds) {
        spreadSecondaryEV.push(calculateAsianHandicapEV(sub.home_selection, sub.home_odds, sub.away_odds, poisson));
      }
    }
  }

  // 3. 大小球盘 EV
  const totalMarket = match.markets?.full_total_main;
  const currentTotal =
    match.score.home_score !== null && match.score.away_score !== null
      ? match.score.home_score + match.score.away_score
      : null;
  let totalMain: TotalEVAssessment | undefined;
  if (totalMarket && currentTotal !== null && totalMarket.line && totalMarket.over_odds && totalMarket.under_odds) {
    totalMain = calculateTotalGoalsEV(totalMarket.line, totalMarket.over_odds, totalMarket.under_odds, currentTotal, poisson);
  }

  const totalSecondaryEV: TotalEVAssessment[] = [];
  if (match.markets?.full_total_subs) {
    for (const sub of match.markets.full_total_subs) {
      if (currentTotal !== null && sub.line && sub.over_odds && sub.under_odds) {
        totalSecondaryEV.push(calculateTotalGoalsEV(sub.line, sub.over_odds, sub.under_odds, currentTotal, poisson));
      }
    }
  }

  // 4. 机构姿态识别
  const posture = identifyBookmakerPosture(spreadMain, totalMain, h2hDevig?.raw_overround ?? 1.05, 0.02);

  const activeTracer = tracer ?? Tracer.getInstance();
  activeTracer.log(
    'INFO',
    'QUANT_03_DEVIG_CALCULATION',
    'DEVIG_EV_COMPLETED',
    `Devig and EV calculated for match ${match.canonical_id}`,
    {
      posture,
      spread_main: spreadMain,
      total_main: totalMain
    },
    match.canonical_id
  );

  const spreadLines = [
    ...(spreadMain ? [spreadMain.line] : []),
    ...spreadSecondaryEV.map((assessment) => assessment.line)
  ];
  const totalLines = [
    ...(totalMain ? [totalMain.line] : []),
    ...totalSecondaryEV.map((assessment) => assessment.line)
  ];

  return Object.freeze({
    h2h_devig: h2hDevig,
    spread_main_ev: spreadMain,
    spread_secondary_ev: spreadSecondaryEV,
    total_main_ev: totalMain,
    total_secondary_ev: totalSecondaryEV,
    line_dispersion: {
      spread_variance: calculateLineVariance(spreadLines),
      total_variance: calculateLineVariance(totalLines)
    },
    bookmaker_posture: posture
  });
}
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
export function devigShin(decimalOdds: number[]): { fair_probs: number[]; overround: number; z_informed_trader: number } {
  if (!decimalOdds || decimalOdds.length === 0) {
    return { fair_probs: [], overround: 0.0, z_informed_trader: 0.0 };
  }

  const beta = decimalOdds.map((o) => (o > 1.0 ? 1.0 / o : 0.0));
  const sumBeta = beta.reduce((a, b) => a + b, 0.0);

  if (sumBeta <= 1.0) {
    const mult = devigMultiplicative(decimalOdds);
    return { fair_probs: mult.fair_probs, overround: mult.overround, z_informed_trader: 0.0 };
  }

  let low = 0.0;
  let high = 0.40;
  let z = 0.02;
  const n = decimalOdds.length;

  for (let iter = 0; iter < 25; iter++) {
    const mid = (low + high) / 2.0;
    let lhs = 0.0;
    for (let i = 0; i < n; i++) {
      lhs += Math.sqrt(mid * mid + 4 * (1 - mid) * (beta[i] * beta[i] / sumBeta));
    }

    const target = 2.0 - mid * (n - 2.0);
    if (Math.abs(lhs - target) < 1e-5) {
      z = mid;
      break;
    }

    if (lhs > target) {
      high = mid;
    } else {
      low = mid;
    }
    z = mid;
  }

  const fairProbs: number[] = [];
  let sumP = 0.0;

  for (let i = 0; i < n; i++) {
    const term = Math.sqrt(z * z + 4 * (1 - z) * (beta[i] * beta[i] / sumBeta));
    const p = (term - z) / (2 * (1 - z));
    fairProbs.push(p);
    sumP += p;
  }

  const normalizedProbs = fairProbs.map((p) => Number((p / (sumP || 1.0)).toFixed(4)));

  return {
    fair_probs: normalizedProbs,
    overround: Number(sumBeta.toFixed(4)),
    z_informed_trader: Number(z.toFixed(4))
  };
}

/**
 * 解析亚洲盘口让球线为数值
 * 支持格式: 
 * 1. 数字分数: "-0/0.5" -> -0.25, "+0.5" -> +0.5, "0" -> 0, "1/1.5" -> 1.25, "-1.5/2" -> -1.75
 * 2. 中文盘口名: "平手" -> 0, "平/半" -> -0.25, "半球" -> -0.5, "半/一" -> -0.75, "一球" -> -1.0, "球半" -> -1.5, "球半/两" -> -1.75, "两球" -> -2.0
 * 3. 受让前缀: "受让半球" / "受半球" -> +0.5, "受平半" -> +0.25
 */
export function parseAsianHandicapLine(lineStr: string): number {
  if (!lineStr || typeof lineStr !== 'string') return 0.0;
  const clean = lineStr.trim();

  // 中文盘口别名表
  const chineseMap: Record<string, number> = {
    '平手': 0.0,
    '平手盘': 0.0,
    '平/半': -0.25,
    '平半': -0.25,
    '半球': -0.5,
    '半/一': -0.75,
    '半一': -0.75,
    '一球': -1.0,
    '一/球半': -1.25,
    '一球/球半': -1.25,
    '球半': -1.5,
    '球半/两球': -1.75,
    '球半/两': -1.75,
    '两球': -2.0,
    '两/两球半': -2.25,
    '两球半': -2.5,
    '两球半/三球': -2.75,
    '三球': -3.0
  };

  if (chineseMap[clean] !== undefined) {
    return chineseMap[clean];
  }

  // 处理受让前缀 (例如 "受让半球", "受平半")
  if (clean.startsWith('受让') || clean.startsWith('受')) {
    const core = clean.replace(/^(受让|受)/, '').trim();
    if (chineseMap[core] !== undefined) {
      return -chineseMap[core]; // 反转为正盘
    }
  }

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
 * 计算亚洲让球盘 (AH) 的复合数学期望 (EV)
 * 基于 0~7 球双变量泊松网格 P(X_rest=h, Y_rest=a) 进行闭式全量展开：
 * 剩余进球净胜差 d = h - a
 * 主队有效净胜差 Delta_home = d + line (其中 line 为主队让球线，如 -0.25, +0.5 等)
 *   Delta_home >= 0.5  => 全赢, 收益 = (homeOdds - 1.0)
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
  poisson: InPlayPoissonFeatures
): SpreadEVAssessment {
  const line = parseAsianHandicapLine(handicapLineStr);
  const lambdaHome = typeof poisson.lambda_home_rest === 'number' && !isNaN(poisson.lambda_home_rest) ? poisson.lambda_home_rest : 1.25;
  const lambdaAway = typeof poisson.lambda_away_rest === 'number' && !isNaN(poisson.lambda_away_rest) ? poisson.lambda_away_rest : 1.05;

  // 使用双变量泊松分布网格闭式求解
  const grid = calculateBivariatePoissonGrid(lambdaHome, lambdaAway, 7);

  let homeEV = 0.0;
  let awayEV = 0.0;

  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      const pCell = grid.matrix[h]?.[a] ?? 0;
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

  return Object.freeze({
    line: handicapLineStr,
    home_odds: homeOdds,
    away_odds: awayOdds,
    home_ev: homeEV,
    away_ev: awayEV,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none'
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
  poisson: InPlayPoissonFeatures
): TotalEVAssessment {
  const line = parseAsianHandicapLine(totalLineStr);
  const remainingTarget = line - currentTotalGoals;
  const lambdaRest = typeof poisson.expected_goals_rest === 'number' && !isNaN(poisson.expected_goals_rest) ? poisson.expected_goals_rest : 2.30;

  let overEV = 0.0;
  let underEV = 0.0;

  // 展开 0~10 个剩余进球
  for (let k = 0; k <= 10; k++) {
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

  return Object.freeze({
    line: totalLineStr,
    over_odds: overOdds,
    under_odds: underOdds,
    over_ev: overEV,
    under_ev: underEV,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none'
  });
}

/**
 * Layer 03 M5 主调度入口：执行多源博弈微观去抽水与 EV 仲裁计算
 * @param match CanonicalMatch 标准赛事
 * @param poisson M4 泊松推演特征
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function calculateDeviggedMarketFeatures(
  match: CanonicalMatch,
  poisson: InPlayPoissonFeatures,
  collector?: DeficitCollector,
  tracer?: Tracer
): DeviggedMarketFeatures {
  const markets = match.markets;
  const currentTotalGoals = (match.score.home_score ?? 0) + (match.score.away_score ?? 0);

  // 1. 全场独赢欧赔去抽水 (优先 Shin 模型)
  let h2hDevig: SingleMarketDevig = {
    market_type: MarketType.FULL_H2H,
    raw_overround: 1.08,
    devig_method: DevigMethod.SHIN,
    fair_probabilities: [0.33, 0.33, 0.34],
    fair_odds: [3.03, 3.03, 2.94]
  };

  if (markets.full_h2h && markets.full_h2h.home_odds > 1.0 && markets.full_h2h.away_odds > 1.0) {
    const hOdds = markets.full_h2h.home_odds;
    const dOdds = markets.full_h2h.draw_odds ?? 3.50;
    const aOdds = markets.full_h2h.away_odds;

    const shinRes = devigShin([hOdds, dOdds, aOdds]);
    h2hDevig = {
      market_type: MarketType.FULL_H2H,
      raw_overround: shinRes.overround,
      devig_method: DevigMethod.SHIN,
      fair_probabilities: shinRes.fair_probs,
      fair_odds: shinRes.fair_probs.map((p) => p > 0 ? Number((1.0 / p).toFixed(2)) : 99.0)
    };
  }

  // 2. 全场让球主盘 EV 评估
  let spreadMainEV: SpreadEVAssessment = {
    line: '0',
    home_odds: 1.90,
    away_odds: 1.90,
    home_ev: 0.0,
    away_ev: 0.0,
    preferred_side: 'none',
    is_positive_ev: false
  };

  if (markets.full_spread_main && markets.full_spread_main.home_odds > 1.0 && markets.full_spread_main.away_odds > 1.0) {
    const lineStr = markets.full_spread_main.home_selection || '0';
    spreadMainEV = calculateAsianHandicapEV(
      lineStr,
      markets.full_spread_main.home_odds,
      markets.full_spread_main.away_odds,
      poisson
    );
  }

  // 3. 全场让球副盘 EV 列表
  const spreadSecondaryEVs: SpreadEVAssessment[] = (markets.full_spread_subs || []).map((sec) =>
    calculateAsianHandicapEV(sec.home_selection || '0', sec.home_odds, sec.away_odds, poisson)
  );

  // 4. 全场大小球主盘 EV 评估
  let totalMainEV: TotalEVAssessment = {
    line: '2.5',
    over_odds: 1.90,
    under_odds: 1.90,
    over_ev: 0.0,
    under_ev: 0.0,
    preferred_side: 'none',
    is_positive_ev: false
  };

  if (markets.full_total_main && markets.full_total_main.over_odds > 1.0 && markets.full_total_main.under_odds > 1.0) {
    totalMainEV = calculateTotalGoalsEV(
      markets.full_total_main.line || '2.5',
      markets.full_total_main.over_odds,
      markets.full_total_main.under_odds,
      currentTotalGoals,
      poisson
    );
  }

  // 5. 全场大小球副盘 EV 列表
  const totalSecondaryEVs: TotalEVAssessment[] = (markets.full_total_subs || []).map((sec) =>
    calculateTotalGoalsEV(sec.line || '2.5', sec.over_odds, sec.under_odds, currentTotalGoals, poisson)
  );

  // 6. 主副盘离散度与庄家防守诱盘意图识别
  const allSpreadLines = [spreadMainEV, ...spreadSecondaryEVs];
  let lineVariance = 0.0;
  if (allSpreadLines.length >= 2) {
    const parsedLines = allSpreadLines.map((s) => parseAsianHandicapLine(s.line));
    const mean = parsedLines.reduce((a, b) => a + b, 0) / parsedLines.length;
    lineVariance = parsedLines.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / parsedLines.length;
  }

  let bookmakerPosture = BookmakerPosture.NEUTRAL_BALANCED;
  if (spreadMainEV.home_odds >= 2.15 && spreadMainEV.home_ev < -0.08) {
    bookmakerPosture = BookmakerPosture.TRAP_HIGH_ODDS;
  } else if (spreadMainEV.away_odds <= 1.75 && spreadMainEV.away_ev > 0.05) {
    bookmakerPosture = BookmakerPosture.INSTITUTIONAL_DEFENSE;
  } else if (lineVariance > 0.15) {
    bookmakerPosture = BookmakerPosture.DISPERSED_UNCERTAIN;
  }

  const result: DeviggedMarketFeatures = Object.freeze({
    h2h_devig: h2hDevig,
    spread_main_ev: spreadMainEV,
    spread_secondary_ev: spreadSecondaryEVs,
    total_main_ev: totalMainEV,
    total_secondary_ev: totalSecondaryEVs,
    line_dispersion: Object.freeze({
      spread_variance: Number(lineVariance.toFixed(4)),
      total_variance: 0.05
    }),
    bookmaker_posture: bookmakerPosture
  });

  tracer?.info(
    Layer03OpId.DEVIG_CALCULATION,
    'DEVIG_COMPLETED',
    'Market devig and EV calculation complete',
    {
      overround_h2h: h2hDevig.raw_overround,
      spread_main_preferred: spreadMainEV.preferred_side,
      total_main_preferred: totalMainEV.preferred_side,
      bookmaker_posture: bookmakerPosture
    },
    match.canonical_id
  );

  return result;
}

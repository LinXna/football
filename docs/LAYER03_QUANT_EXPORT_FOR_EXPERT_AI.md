# Layer 03 量化引擎 (Quant Engine) 专家级诊断与重构指南

## 1. 核心诉求 (Mission Objective)
本系统的 Layer 03 是一个实时（In-Play）足球量化引擎。目前在两个核心逻辑处存在严重缺陷：
1. **胜率与 EV 的平衡悖论 (`devigCalculator.ts`)**：目前代码强制要求 `胜率必须 > 50%` 才会采纳为 `preferred_side`，导致大量“胜率40%、赔率3.0”的高价值 (+EV) 深盘资产被丢弃。**诉求：需要设计一套“最低胜率底线 (MVP) + EV优先”的复合提取规则。**
2. **OOS 门禁穿透 (`index.ts`)**：历史样本外验证 (OOS) 如果样本数 `sampleCount === 0`，原本应该归零置信度，但当前逻辑继承了基础评分，产生了极高的“伪置信度”。**诉求：严格重构置信度评分公式，0样本 = 0边缘置信度。**
3. **前端渲染脱节**：前端由于拿不到后端被拦截的 `positive_ev_signals`，导致渲染出来的 EV 极高，但顶部徽章却显示 `REJECTED`。**诉求：在后端拆分出 `raw_positive_ev_signals` (未经 OOS 的原始异动) 和 `machineCandidateSignals` (经 OOS 验证的可自动交易候选)，以修复数据管道。**

---

## 2. 真实全量输入数据 (Real Payload Snapshot)
为了让专家 AI 能对计算过程进行黑盒推演，以下截取了在场第 62 分钟 (0-1) 时，输入到 Layer 03 的核心量化特征 (Quant Features) 和赛况数据。这是 `calculateQuantitativeFeatures` 实际运行时使用的输入剖面：

```json
{
  "match_id": "4562395",
  "timing": {
    "stage": "LIVE",
    "minute": 62
  },
  "score": {
    "home_score": 0,
    "away_score": 1
  },
  "markets": {
    "live": {
      "match_winner": { "home_odds": 8.70, "draw_odds": 3.75, "away_odds": 1.43 },
      "asian_handicap": { "line": -0.25, "home_odds": 2.20, "away_odds": 1.71 },
      "total_goals": { "line": 2.0, "over_odds": 1.91, "under_odds": 1.95 }
    }
  },
  "physical_stats": {
    "possession": { "home": 60, "away": 40 },
    "dangerous_attacks": { "home": 38, "away": 30 },
    "shots_on_target": { "home": 3, "away": 3 },
    "corners": { "home": 6, "away": 7 }
  },
  "momentum": {
    "recent_5min": { "home": 32, "away": 20 },
    "recent_15min": { "home": 24, "away": 25 }
  }
}
```
*(注：完整输入数据可参见工程内的 `refactor/samples/02_canonical_model/canonical_match_sample.json`)*

---

## 3. 中间层计算输出结果 (Engine Intermediate State)
在 62 分钟时，引擎经过泊松时间衰减和势能推演，算出的真实剩余进球期望 (`lambda`) 如下：
* `lambda_home_rest` = 1.184
* `lambda_away_rest` = 1.041

带入双变量泊松网格后，算出该场比赛客队受让平半 (`+0/0.5` 即 line `-0.25`) 的去抽水胜负概率：
* 主队真实模型胜率 (`home_model_probability`): 46.58%
* 客队真实模型胜率 (`away_model_probability`): 38.46% (加盘口后的综合概率)

带入赔率计算 EV (期望值)：
* 主队 EV: -22.40%
* 客队 EV: +17.10%

**【爆发点】**：此时客队 EV 高达 +17.10%，本是优质资产，但因为客队胜率 38.46% < 主队 46.58%，在下面 `devigCalculator.ts` 中被直接抛弃！

---

## 4. 完整的源码切片 (Source Code to Refactor)

### 4.1 `refactor/03_quant_engine/devigCalculator.ts` 源码 (产生 EV/胜率平衡问题的源头)
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

export function invertHandicapString(lineStr: string): string {
  if (!lineStr || lineStr === '0' || lineStr === '0.0') return '0';
  if (lineStr.startsWith('+')) return lineStr.replace('+', '-');
  if (lineStr.startsWith('-')) return lineStr.replace('-', '+');
  return '-' + lineStr;
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

  let preferredSide: 'home' | 'away' | 'none' = 'none';
  const marketMargin = Math.max(0.025, (1.0 / homeOdds + 1.0 / awayOdds) - 1.0);
  const minRequiredEV = Math.max(0.015, marketMargin * 0.5 + 0.01);

  if (homePositiveProbability > awayPositiveProbability && homeEV >= minRequiredEV) {
    preferredSide = 'home';
  } else if (awayPositiveProbability > homePositiveProbability && awayEV >= minRequiredEV) {
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
    home_model_probability: Number(homePositiveProbability.toFixed(4)),
    away_model_probability: Number(awayPositiveProbability.toFixed(4)),
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

  let preferredSide: 'over' | 'under' | 'none' = 'none';
  const marketMargin = Math.max(0.025, (1.0 / overOdds + 1.0 / underOdds) - 1.0);
  const minRequiredEV = Math.max(0.015, marketMargin * 0.5 + 0.01);

  if (overPositiveProbability > underPositiveProbability && overEV >= minRequiredEV) {
    preferredSide = 'over';
  } else if (underPositiveProbability > overPositiveProbability && underEV >= minRequiredEV) {
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
    over_model_probability: Number(overPositiveProbability.toFixed(4)),
    under_model_probability: Number(underPositiveProbability.toFixed(4)),
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
} {
  const probs = poisson.full_time_probabilities ?? {
    prob_home_win: poisson.rest_score_matrix.prob_home_win_rest,
    prob_draw: poisson.rest_score_matrix.prob_draw_rest,
    prob_away_win: poisson.rest_score_matrix.prob_away_win_rest
  };

  const probHome = probs.prob_home_win;
  const probDraw = probs.prob_draw;
  const probAway = probs.prob_away_win;

  const homeEv = homeOdds > 1 ? Number((probHome * homeOdds - 1.0).toFixed(4)) : -1.0;
  const drawEv = drawOdds > 1 ? Number((probDraw * drawOdds - 1.0).toFixed(4)) : -1.0;
  const awayEv = awayOdds > 1 ? Number((probAway * awayOdds - 1.0).toFixed(4)) : -1.0;

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
    maxProb = probHome;
    maxOdds = homeOdds;
  }
  if (drawEv > maxEv && isEligible1X2(drawEv, drawOdds)) {
    maxEv = drawEv;
    preferredSide = 'draw';
    maxProb = probDraw;
    maxOdds = drawOdds;
  }
  if (awayEv > maxEv && isEligible1X2(awayEv, awayOdds)) {
    maxEv = awayEv;
    preferredSide = 'away';
    maxProb = probAway;
    maxOdds = awayOdds;
  }

  let kelly = 0.0;
  if (preferredSide !== 'none' && maxOdds > 1.0) {
    const b = maxOdds - 1.0;
    const q = 1.0 - maxProb;
    const fullKelly = (b * maxProb - q) / b;
    kelly = Number(Math.max(0.0, Math.min(0.05, fullKelly * 0.25)).toFixed(4));
  }

  return {
    model_probabilities: [probHome, probDraw, probAway],
    home_ev: homeEv,
    draw_ev: drawEv,
    away_ev: awayEv,
    preferred_side: preferredSide,
    is_positive_ev: preferredSide !== 'none',
    kelly_fraction: kelly
  };
}

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

  // 1. 欧赔去抽水与 M3 独赢 EV 计算
  let h2hDevig: SingleMarketDevig | undefined;
  if (decimalOdds.length === 3 && h2hOdds?.home_odds && h2hOdds?.draw_odds && h2hOdds?.away_odds) {
    const shin = devigShin(decimalOdds);
    const h2hEval = calculateH2hEV(h2hOdds.home_odds, h2hOdds.draw_odds, h2hOdds.away_odds, poisson);
    h2hDevig = {
      market_type: MarketType.MONEYLINE_1X2,
      raw_overround: shin.overround,
      devig_method: DevigMethod.SHIN,
      fair_probabilities: shin.fair_probs,
      fair_odds: shin.fair_probs.map((p) => (p > 0 ? Number((1.0 / p).toFixed(3)) : 0.0)),
      market_odds: [h2hOdds.home_odds, h2hOdds.draw_odds, h2hOdds.away_odds],
      model_probabilities: h2hEval.model_probabilities,
      home_ev: h2hEval.home_ev,
      draw_ev: h2hEval.draw_ev,
      away_ev: h2hEval.away_ev,
      preferred_side: h2hEval.preferred_side,
      is_positive_ev: h2hEval.is_positive_ev,
      kelly_fraction: h2hEval.kelly_fraction
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
  // M4 predicts future goals. For a full-match line, convert it to a
  // remaining-goals target by subtracting the verified current score. A
  // remaining-goals line must be explicitly marked by the source parser.
  const currentTotal = totalMarket?.settlement_basis === 'REMAINING_GOALS'
    ? 0
    : (match.score.home_score ?? 0) + (match.score.away_score ?? 0);
  let totalMain: TotalEVAssessment | undefined;
  if (totalMarket && totalMarket.line && totalMarket.over_odds && totalMarket.under_odds) {
    totalMain = calculateTotalGoalsEV(totalMarket.line, totalMarket.over_odds, totalMarket.under_odds, currentTotal, poisson);
  }

  const totalSecondaryEV: TotalEVAssessment[] = [];
  if (match.markets?.full_total_subs) {
    for (const sub of match.markets.full_total_subs) {
      if (sub.line && sub.over_odds && sub.under_odds) {
        const subCurrentTotal = sub.settlement_basis === 'REMAINING_GOALS'
          ? 0
          : (match.score.home_score ?? 0) + (match.score.away_score ?? 0);
        totalSecondaryEV.push(calculateTotalGoalsEV(sub.line, sub.over_odds, sub.under_odds, subCurrentTotal, poisson));
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

  return Object.freeze({
    h2h_devig: h2hDevig,
    spread_main_ev: spreadMain,
    spread_secondary_ev: spreadSecondaryEV,
    total_main_ev: totalMain,
    total_secondary_ev: totalSecondaryEV,
    line_dispersion: {
      spread_variance: 0.0,
      total_variance: 0.0
    },
    bookmaker_posture: posture
  });
}
### 4.2 `refactor/03_quant_engine/index.ts` 源码 (产生 OOS 门禁与前后端脱节的源头)
/**
 * @file index.ts
 * @description Layer 03 M6: 最高统帅部量化博弈总指挥中枢 (Battlefield Quantitative Commander)
 * 
 * 核心职责：
 * 1. 统一串联与编排：
 *    - M2: 数据时效衰减、情境清洗与 L0 熔断判定 (extractCleanedContextFeatures)
 *    - M3: 实时物理攻防与危攻时序微分提取 (extractMomentumTimelineFeatures, extractRealTimePhysicalStats)
 *    - M4: 滚球 0:0 实时重置 Forward 泊松推演 (calculateInPlayPoissonFeatures)
 *    - M5: 多源去抽水与四分之一盘复合 EV 仲裁 (calculateDeviggedMarketFeatures)
 * 2. 战场统治权指数 (BDI: Battlefield Dominance Index, [-100, +100]) 综合计算
 * 3. 破门相变临界预警 (Goal Phase Alert) 综合识别 (时序积分 + 5m斜率 + 绝境搏命态)
 * 4. L0/L1/L2 容错熔断、优雅降级与量化置信度 (Confidence Score: 0~100) 扣减法则
 * 5. 输出统一不可变结构体 QuantitativeFeatures
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchAlignmentStatus, MatchStage } from '../02_canonical_model/enums.js';
import {
  QuantitativeFeatures,
  QuantEngineOptions,
  GoalPhaseAlert,
  PositiveEVSignal,
  OosMarket,
  QuantCalibrationProfile,
  QuantAlert,
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  LiveThreatTrinityFeatures,
  UnifiedMatchState,
  CleanedContextFeatures,
  DeviggedMarketFeatures,
  BookmakerPosture,
  MarketStanceType,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { selectOosCalibrationProfile } from './oosCalibrationEngine.js';
import { extractCleanedContextFeatures } from './contextEngine.js';
import { synthesizePrematchPrior } from './prematchPriorEngine.js';
import { calibrateWithMarketOdds } from './marketDivergenceEngine.js';
import { extractMomentumTimelineFeatures, extractRealTimePhysicalStats } from './momentumQuantEngine.js';
import { extractSpatioTemporalEventFeatures } from './eventMomentumFusion.js';
import { calculateInPlayPoissonFeatures } from './poissonDecayModel.js';
import { calculateDeviggedMarketFeatures, invertHandicapString, parseAsianHandicapLine } from './devigCalculator.js';
import { buildLayer03DataAudit, buildLayer03ProductionGate } from './dataAudit.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

export * from './enums.js';
export * from './types.js';
export * from './contextEngine.js';
export * from './prematchPriorEngine.js';
export * from './marketDivergenceEngine.js';
export * from './momentumQuantEngine.js';
export * from './eventMomentumFusion.js';
export * from './poissonDecayModel.js';
export * from './devigCalculator.js';
export * from './dataAudit.js';
export * from './oosCalibrationEngine.js';

/**
 * 计算战场统治权指数 (Battlefield Dominance Index, BDI ∈ [-100, +100])
 * 融合 15m 动量积分、5m 斜率、xT 穿透威胁与全场危攻压迫
 */
export function calculateBattlefieldDominanceIndex(
  state: UnifiedMatchState
): number {
  return Number(Math.max(-100, Math.min(100, state.dominance_index)).toFixed(2));
}

function toOosMarket(signal: PositiveEVSignal | undefined): OosMarket | undefined {
  if (signal?.market === 'ASIAN_HANDICAP_MAIN') return 'ASIAN_HANDICAP_MAIN';
  if (signal?.market === 'TOTAL_GOALS_MAIN') return 'TOTAL_GOALS_MAIN';
  return undefined;
}

function isValidatedOosProfile(profile: QuantCalibrationProfile | undefined): profile is QuantCalibrationProfile {
  return profile?.status === 'VALIDATED' &&
    profile.effective_sample_size >= 200 &&
    profile.oos_brier_score !== null;
}

type ValidatedOosProfile = QuantCalibrationProfile & { oos_brier_score: number };

function hasValidatedOosProfile(profile: QuantCalibrationProfile | undefined): profile is ValidatedOosProfile {
  return isValidatedOosProfile(profile) && typeof profile.oos_brier_score === 'number';
}

/** 将三源证据、战术状态和进球后冷却凝结为下游唯一可消费的实时状态。 */
export function buildUnifiedMatchState(
  spatioTemporal: QuantitativeFeatures['spatio_temporal_events'],
  physical?: RealTimePhysicalStatsFeatures
): UnifiedMatchState {
  const trinity = spatioTemporal.live_threat_trinity;
  const cooldown = spatioTemporal.goal_climax.post_goal_cooldown_active ? 0.70 : 1.0;
  const homeIntensity = trinity.home.calibrated_threat * cooldown;
  const awayIntensity = trinity.away.calibrated_threat * cooldown;
  const effectiveHomeIntensity = homeIntensity * spatioTemporal.regime.regime_multiplier_home;
  const effectiveAwayIntensity = awayIntensity * spatioTemporal.regime.regime_multiplier_away;
  return Object.freeze({
    home_intensity: Number(Math.max(0, Math.min(1.5, homeIntensity)).toFixed(3)),
    away_intensity: Number(Math.max(0, Math.min(1.5, awayIntensity)).toFixed(3)),
    regime_multiplier_home: spatioTemporal.regime.regime_multiplier_home,
    regime_multiplier_away: spatioTemporal.regime.regime_multiplier_away,
    dominance_index: Number(((effectiveHomeIntensity - effectiveAwayIntensity) * 100).toFixed(2)),
    imminent_goal: spatioTemporal.goal_climax.is_imminent_threat,
    post_goal_cooldown_active: spatioTemporal.goal_climax.post_goal_cooldown_active,
    has_evidence_conflict: trinity.has_material_conflict,
    // 动量、事件与技术统计来自同一雷速上游：一致性不获得“独立来源”额外加成。
    source_lineage_discount: 1.0,
    red_card_attack_multiplier_home: physical?.red_card_penalty?.home_attack_multiplier ?? 1.0,
    red_card_attack_multiplier_away: physical?.red_card_penalty?.away_attack_multiplier ?? 1.0,
    red_card_defense_leak_multiplier_home: physical?.red_card_penalty?.home_defense_leak_multiplier ?? 1.0,
    red_card_defense_leak_multiplier_away: physical?.red_card_penalty?.away_defense_leak_multiplier ?? 1.0
  });
}

/**
 * 识别破门相变临界预警 (Goal Phase Alert)
 */
export function evaluateGoalPhaseAlert(
  elapsedMinute: number,
  scoreDiff: number,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  expectedGoalsRest: number
): { alert: GoalPhaseAlert; trigger_team?: 'home' | 'away'; rationale: string } {
  const isLateGame = elapsedMinute >= 70;
  const isOneGoalDiff = Math.abs(scoreDiff) === 1;

  // 1. 紧急绝境破门相变 (IMMINENT_GOAL):
  if (timeline.is_sustained_siege && isLateGame) {
    const team = timeline.integral_15m.net > 0 ? 'home' : 'away';
    return {
      alert: GoalPhaseAlert.IMMINENT_GOAL,
      trigger_team: team,
      rationale: `${team.toUpperCase()} is executing a sustained siege in late-game with suppressed opponent clearance.`
    };
  }

  if (isLateGame && isOneGoalDiff && (Math.abs(timeline.slope_5m) >= 18.0 || Math.abs(timeline.integral_5m.net) >= 150)) {
    const team = timeline.slope_5m > 0 ? 'home' : 'away';
    return {
      alert: GoalPhaseAlert.IMMINENT_GOAL,
      trigger_team: team,
      rationale: `${team.toUpperCase()} triggered desperate momentum surge in close-margin late game.`
    };
  }

  // 2. 攻防僵局 (DEADLOCK_STALEMATE):
  if (timeline.inflection_count_recent_15m >= 4 && Math.abs(timeline.integral_15m.net) < 60) {
    return {
      alert: GoalPhaseAlert.DEADLOCK_STALEMATE,
      rationale: 'Frequent back-and-forth midfield turnovers without penetration.'
    };
  }

  // 3. 垃圾时间低强度 (LOW_INTENSITY_GARBAGE_TIME):
  if (Math.abs(scoreDiff) >= 3 && elapsedMinute >= 75) {
    return {
      alert: GoalPhaseAlert.LOW_INTENSITY_GARBAGE_TIME,
      rationale: 'Large margin lead with pacing control; offensive urgency extinguished.'
    };
  }

  return {
    alert: GoalPhaseAlert.NONE,
    rationale: 'Normal game flow dynamics without extreme phase transition.'
  };
}

/**
 * 综合评估量化置信度评分 (Confidence Score ∈ [0, 100]) 与风控警报
 */
export function calculateConfidenceAndAlerts(
  context: CleanedContextFeatures,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  devig: DeviggedMarketFeatures,
  stage: MatchStage = MatchStage.LIVE
): { confidence_score: number; risk_flags: QuantAlert[]; positive_ev_signals: PositiveEVSignal[] } {
  let score = 100;
  const riskFlags: QuantAlert[] = [];
  const positiveEVSignals: PositiveEVSignal[] = [];

  // L0 熔断判定：一票否决
  if (context.circuit_breaker.is_triggered) {
    return {
      confidence_score: 0,
      risk_flags: [QuantAlert.L0_FATAL_DATA_MISSING],
      positive_ev_signals: []
    };
  }

  // L1 缺陷扣分：仅对滚球 (LIVE) 比赛扣减动量点阵缺失分；赛前 (PREMATCH) 比赛点阵天然为空，豁免扣分与警报
  if (timeline.total_points === 0) {
    if (stage === MatchStage.LIVE) {
      score -= 20; // 滚球缺失点阵
      riskFlags.push(QuantAlert.MOMENTUM_DATA_DEFICIT);
    }
  }

  // 滚球缺失客观攻防统计扣分
  if (!physical.stats_available && stage === MatchStage.LIVE) {
    score -= 25;
    riskFlags.push(QuantAlert.TECHNICAL_METRICS_DEFICIT);
  }

  if (physical.tactical_anomaly.home_barren_dominance || physical.tactical_anomaly.away_barren_dominance) {
    score -= 8;
    riskFlags.push(QuantAlert.BARREN_DOMINANCE_WARNING);
  }

  if (physical.tactical_anomaly.home_lethal_counter || physical.tactical_anomaly.away_lethal_counter) {
    riskFlags.push(QuantAlert.LETHAL_COUNTER_WARNING);
  }

  if ((physical.red_card_penalty?.home_attack_multiplier ?? 1.0) < 1.0 || (physical.red_card_penalty?.away_attack_multiplier ?? 1.0) < 1.0) {
    riskFlags.push(QuantAlert.RED_CARD_TACTICAL_COLLAPSE);
  }

  if (devig.bookmaker_posture === BookmakerPosture.TRAP_HIGH_ODDS) {
    riskFlags.push(QuantAlert.TRAP_HIGH_ODDS_WARNING);
  } else if (devig.bookmaker_posture === BookmakerPosture.DISPERSED_UNCERTAIN) {
    score -= 10;
    riskFlags.push(QuantAlert.HIGH_LINE_DISPERSION);
  }

  // L2 背景缺失微调
  if (context.goal_timing_validity.requires_bayesian_shrinkage) {
    score -= 2;
  }
  if (context.h2h_weights.length === 0) {
    score -= 2;
  }

  // 提取独赢、让球与大小球的正 EV 信号
  if (devig.h2h_devig && devig.h2h_devig.is_positive_ev && devig.h2h_devig.preferred_side && devig.h2h_devig.preferred_side !== 'none') {
    const side = devig.h2h_devig.preferred_side;
    const ev = side === 'home' ? (devig.h2h_devig.home_ev ?? 0) : side === 'draw' ? (devig.h2h_devig.draw_ev ?? 0) : (devig.h2h_devig.away_ev ?? 0);
    const odds = side === 'home'
      ? (devig.h2h_devig.market_odds?.[0] ?? 0)
      : side === 'draw'
      ? (devig.h2h_devig.market_odds?.[1] ?? 0)
      : (devig.h2h_devig.market_odds?.[2] ?? 0);
    const prob = side === 'home'
      ? devig.h2h_devig.model_probabilities?.[0]
      : side === 'draw'
      ? devig.h2h_devig.model_probabilities?.[1]
      : devig.h2h_devig.model_probabilities?.[2];
    const kelly = devig.h2h_devig.kelly_fraction ?? 0.0;
    positiveEVSignals.push(Object.freeze({
      market: 'MONEYLINE_1X2',
      line: '0',
      side: side,
      odds: odds,
      ev: ev,
      model_probability: prob,
      confidence: Math.max(50, score),
      kelly_fraction: kelly
    }));
  }

  if (devig.spread_main_ev && devig.spread_main_ev.is_positive_ev && devig.spread_main_ev.preferred_side !== 'none') {
    const side = devig.spread_main_ev.preferred_side;
    const ev = side === 'home' ? devig.spread_main_ev.home_ev : devig.spread_main_ev.away_ev;
    const odds = side === 'home' ? devig.spread_main_ev.home_odds : devig.spread_main_ev.away_odds;
    const kelly = devig.spread_main_ev.kelly_fraction ?? 0.0;
    const actualLine = side === 'away' ? invertHandicapString(devig.spread_main_ev.line) : devig.spread_main_ev.line;
    positiveEVSignals.push(Object.freeze({
      market: 'ASIAN_HANDICAP_MAIN',
      line: actualLine,
      side: side,
      odds: odds,
      ev: ev,
      model_probability: side === 'home'
        ? devig.spread_main_ev.home_model_probability
        : devig.spread_main_ev.away_model_probability,
      confidence: Math.max(50, score),
      kelly_fraction: kelly
    }));
  }

  if (devig.total_main_ev && devig.total_main_ev.is_positive_ev && devig.total_main_ev.preferred_side !== 'none') {
    const side = devig.total_main_ev.preferred_side;
    const ev = side === 'over' ? devig.total_main_ev.over_ev : devig.total_main_ev.under_ev;
    const odds = side === 'over' ? devig.total_main_ev.over_odds : devig.total_main_ev.under_odds;
    const kelly = devig.total_main_ev.kelly_fraction ?? 0.0;
    positiveEVSignals.push(Object.freeze({
      market: 'TOTAL_GOALS_MAIN',
      line: devig.total_main_ev.line,
      side: side,
      odds: odds,
      ev: ev,
      model_probability: side === 'over'
        ? devig.total_main_ev.over_model_probability
        : devig.total_main_ev.under_model_probability,
      confidence: Math.max(50, score),
      kelly_fraction: kelly
    }));
  }

  return {
    confidence_score: Math.max(0, Math.min(100, score)),
    risk_flags: riskFlags,
    positive_ev_signals: positiveEVSignals
  };
}

function resolveMarketConflicts(
  signals: PositiveEVSignal[],
  match: CanonicalMatch,
  poissonGrid?: number[][]
): PositiveEVSignal[] {
  const spread = signals.find(s => s.market === 'ASIAN_HANDICAP_MAIN');
  const total = signals.find(s => s.market === 'TOTAL_GOALS_MAIN');
  
  if (!spread || !total || !poissonGrid) return signals;

  let bothWinProb = 0.0;
  const spreadLineNum = parseAsianHandicapLine(spread.line);
  const totalLineNum = parseAsianHandicapLine(total.line);
  const currentHome = match.score?.home_score ?? 0;
  const currentAway = match.score?.away_score ?? 0;

  for (let dH = 0; dH < poissonGrid.length; dH++) {
    for (let dA = 0; dA < poissonGrid[dH].length; dA++) {
      const prob = poissonGrid[dH][dA];
      if (prob <= 0) continue;

      const netRest = spread.side === 'home' ? (dH - dA) : (dA - dH);
      const isSpreadWin = (netRest + spreadLineNum) > 0;

      const finalTotal = currentHome + currentAway + dH + dA;
      const isTotalWin = total.side === 'over' 
        ? finalTotal > totalLineNum 
        : finalTotal < totalLineNum;

      if (isSpreadWin && isTotalWin) {
        bothWinProb += prob;
      }
    }
  }

  if (bothWinProb < 0.05) {
    if (spread.ev >= total.ev) {
      return signals.filter(s => s.market !== 'TOTAL_GOALS_MAIN');
    } else {
      return signals.filter(s => s.market !== 'ASIAN_HANDICAP_MAIN');
    }
  }

  return signals;
}

/**
 * Layer 03 统一主调度入口：计算全量确定性量化博弈特征
 * @param match CanonicalMatch 标准赛事
 * @param options 可选配置
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function calculateQuantitativeFeatures(
  match: CanonicalMatch,
  options?: QuantEngineOptions,
  collector?: DeficitCollector,
  tracer?: Tracer
): QuantitativeFeatures {
  tracer?.info(
    Layer03OpId.ORCHESTRATE_QUANT,
    'ORCHESTRATION_START',
    `Starting Layer 03 Quantitative orchestration for match ${match.canonical_id}`,
    undefined,
    match.canonical_id
  );

  const alignmentStatus = match.alignment.status;
  if (alignmentStatus !== MatchAlignmentStatus.MATCHED_BY_ALIAS &&
      alignmentStatus !== MatchAlignmentStatus.MATCHED_AUTO) {
    collector?.record(
      'MATCH_ALIGNMENT_FAILED',
      Layer03OpId.ORCHESTRATE_QUANT,
      'RC-001',
      `Layer 03 requires confirmed entity alignment; received ${alignmentStatus}.`,
      undefined,
      match.canonical_id
    );
    throw new Error(`MATCH_ALIGNMENT_FAILED: Match ${match.canonical_id} has unconfirmed alignment status ${alignmentStatus}.`);
  }

  // 0. 核心定价要素前置强阻断检查 (Hard Block)
  if ((match.timing.stage === MatchStage.LIVE && (match.timing.minute === null || match.timing.minute === undefined)) ||
      ((match.timing.stage === MatchStage.LIVE || match.timing.stage === MatchStage.FINISHED) &&
        (match.score.home_score === null || match.score.home_score === undefined || match.score.away_score === null || match.score.away_score === undefined || !match.score.score_verified))) {
    collector?.record('UNPRICEABLE_MATCH', Layer03OpId.ORCHESTRATE_QUANT, 'RC-005', 'Core pricing data (minute or verified score) is missing. Cannot evaluate expected values.', undefined, match.canonical_id);
    throw new Error(`UNPRICEABLE_MATCH: Core pricing data is missing, blocking Quantitative Engine execution for match ${match.canonical_id}.`);
  }

  // 1. M2: 数据时效衰减与情境清洗
  const contextFeatures = extractCleanedContextFeatures(match, collector, tracer);

  // 1.1 Stage 1: 赛前多维关联理论先验合成 (首发 + 身价 + 伤停LIS + 近态同构 + MUI)
  const prematchPrior = synthesizePrematchPrior(match, contextFeatures, collector, tracer);

  // 1.2 Stage 1.1: 机构盘口博弈偏差检验与基准进球期望校准 (Shin去抽水 + 机构设防/诱盘姿态识别)
  const marketCalibration = calibrateWithMarketOdds(match, prematchPrior, collector, tracer);

  // 2. M3: 实时物理攻防与危攻时序微分
  const timelineFeatures = extractMomentumTimelineFeatures(match, collector, tracer);
  const physicalStatsFeatures = extractRealTimePhysicalStats(match, collector, tracer);

  // 2.5 M3.5: 战局势能与关键事件因果共生分析 (EPI 转化、战术相变与破门临界探测)
  const spatioTemporalFeatures = extractSpatioTemporalEventFeatures(
    match,
    timelineFeatures,
    physicalStatsFeatures,
    collector,
    tracer
  );
  const matchState = buildUnifiedMatchState(spatioTemporalFeatures, physicalStatsFeatures);

  // 3. M4: 滚球 0:0 Forward 泊松时间衰减推演 (注入博弈校准基准、物理场与战术相变乘子)
  const rawPoissonFeatures = calculateInPlayPoissonFeatures(
    match,
    contextFeatures,
    matchState,
    marketCalibration,
    undefined,
    collector,
    tracer
  );

  // 4. M5: 多源微观去抽水与四分之一盘复合 EV 仲裁
  const rawDevigFeatures = calculateDeviggedMarketFeatures(
    match,
    rawPoissonFeatures,
    collector,
    tracer
  );

  const rawConfidence = calculateConfidenceAndAlerts(
    contextFeatures,
    timelineFeatures,
    physicalStatsFeatures,
    rawDevigFeatures,
    match.timing.stage
  );
  const resolveProfile = (market: OosMarket): QuantCalibrationProfile | undefined =>
    options?.calibration_profile?.market === market
      ? options.calibration_profile
      : selectOosCalibrationProfile(options?.calibration_archive, match, market);
  const totalCalibrationProfile = resolveProfile('TOTAL_GOALS_MAIN');
  const totalCalibrationIsValidated = isValidatedOosProfile(totalCalibrationProfile);
  const poissonFeatures = totalCalibrationIsValidated
    ? calculateInPlayPoissonFeatures(match, contextFeatures, matchState, marketCalibration, totalCalibrationProfile, collector, tracer)
    : rawPoissonFeatures;
  const devigFeatures = totalCalibrationIsValidated
    ? calculateDeviggedMarketFeatures(match, poissonFeatures, collector, tracer)
    : rawDevigFeatures;

  // 5. 综合计算战场统治权指数 (BDI)
  const bdi = calculateBattlefieldDominanceIndex(matchState);

  // 6. 识别破门相变临界预警 (融合战局势能与事件临界)
  const goalPhase = matchState.imminent_goal
    ? GoalPhaseAlert.IMMINENT_GOAL : GoalPhaseAlert.NONE;

  // 7. 评估量化置信度与风控信号 (扣减机构诱盘/离散度惩罚)
  const { confidence_score, risk_flags, positive_ev_signals } = calculateConfidenceAndAlerts(
    contextFeatures,
    timelineFeatures,
    physicalStatsFeatures,
    devigFeatures,
    match.timing.stage
  );

  const resolved_positive_ev_signals = resolveMarketConflicts(positive_ev_signals, match, poissonFeatures.rest_score_matrix?.grid);

  let adjustedConfidence = Math.max(0, confidence_score - marketCalibration.market_confidence_penalty);
  if (match.timing.stage === MatchStage.LIVE && !physicalStatsFeatures.stats_available) {
    adjustedConfidence = Math.min(adjustedConfidence, 55);
  }
  if (spatioTemporalFeatures.live_threat_trinity.has_material_conflict) {
    adjustedConfidence = Math.min(adjustedConfidence, 65);
  }

  const metricAvailability = Object.values(physicalStatsFeatures.available_metrics)
    .filter((available) => available).length / Object.keys(physicalStatsFeatures.available_metrics).length;

  // 严禁假数据：按比赛阶段真实评估数据质量，赛前评估基本面维度真实齐备度，滚球评估客观攻防与动量波形
  const dataQualityScore = match.timing.stage === MatchStage.PREMATCH
    ? Math.round(100 * (
        0.40 * (match.reference?.lineups?.confirmed ? 1 : ((match.reference?.lineups?.home_starters?.length ?? 0) > 0 ? 0.6 : 0)) +
        0.35 * (match.reference?.league_standings?.has_data ? 1 : 0) +
        0.25 * (match.reference?.goal_distribution?.has_data ? 1 : 0)
      ))
    : Math.round(100 * (
        0.45 * metricAvailability +
        0.30 * (timelineFeatures.total_points > 0 ? 1 : 0) +
        0.25 * (match.score.score_verified ? 1 : 0)
      ));
  const modelStabilityScore = Math.round(100 * Math.max(0, Math.min(1,
    0.45 + 0.55 * Math.min(
      spatioTemporalFeatures.live_threat_trinity.home.alignment_score,
      spatioTemporalFeatures.live_threat_trinity.away.alignment_score
    ) - (spatioTemporalFeatures.goal_climax.post_goal_cooldown_active ? 0.20 : 0)
  )));
  const validatedSignalProfiles = resolved_positive_ev_signals
    .map((signal) => {
      const market = toOosMarket(signal);
      return { signal, profile: market === undefined ? undefined : resolveProfile(market) };
    })
    .filter((item): item is { signal: PositiveEVSignal; profile: ValidatedOosProfile } => hasValidatedOosProfile(item.profile));
  
  const sampleCount = validatedSignalProfiles.length;
  const MATURE_THRESHOLD = 200;
  const baseScore = Math.min(adjustedConfidence, dataQualityScore, modelStabilityScore);
  
  const historyScore = sampleCount > 0
    ? Math.round(Math.max(0, Math.min(100,
        Math.max(...validatedSignalProfiles.map(({ profile }) =>
          (adjustedConfidence - profile.oos_brier_score * 100) * Math.min(1, profile.effective_sample_size / 1000)
        ))
      )))
    : baseScore;

  const maturityRatio = Math.min(1.0, sampleCount / MATURE_THRESHOLD);
  const edgeConfidenceScore = Math.round((1 - maturityRatio) * baseScore + maturityRatio * historyScore);
  const screeningIntegrityScore = baseScore;

  const machineCandidateSignals =
    !poissonFeatures.is_stoppage_time_unpriceable &&
    (match.timing.stage !== MatchStage.LIVE || physicalStatsFeatures.stats_available) &&
    dataQualityScore >= 80 &&
    modelStabilityScore >= 70 &&
    !matchState.has_evidence_conflict &&
    !matchState.post_goal_cooldown_active
    ? resolved_positive_ev_signals : [];

  const finalRiskFlags = [...risk_flags];
  if (marketCalibration.market_stance === MarketStanceType.TRAP_INDUCEMENT) {
    if (!finalRiskFlags.includes(QuantAlert.TRAP_HIGH_ODDS_WARNING)) {
      finalRiskFlags.push(QuantAlert.TRAP_HIGH_ODDS_WARNING);
    }
  }

  // 若破门临界爆发，追加 GOAL_CLIMAX_TRIGGERED 警报
  if (spatioTemporalFeatures.goal_climax.is_imminent_threat) {
    if (!finalRiskFlags.includes(QuantAlert.GOAL_CLIMAX_TRIGGERED)) {
      finalRiskFlags.push(QuantAlert.GOAL_CLIMAX_TRIGGERED);
    }
  }

  const dataAudit = buildLayer03DataAudit(match, contextFeatures, timelineFeatures, physicalStatsFeatures);
  const productionGate = buildLayer03ProductionGate(
    match,
    dataAudit,
    validatedSignalProfiles.length > 0
  );
  const result: QuantitativeFeatures = Object.freeze({
    canonical_id: match.canonical_id,
    calculated_at: new Date().toISOString(),
    context: contextFeatures,
    prematch_prior: prematchPrior,
    market_calibration: marketCalibration,
    timeline: timelineFeatures,
    physical_stats: physicalStatsFeatures,
    poisson: poissonFeatures,
    devig: devigFeatures,
    spatio_temporal_events: spatioTemporalFeatures,
    match_state: matchState,
    battlefield_dominance_index: bdi,
    goal_phase_alert: goalPhase,
    raw_positive_ev_signals: positive_ev_signals,
    positive_ev_signals: machineCandidateSignals,
    risk_flags: finalRiskFlags,
    confidence_score: Math.min(screeningIntegrityScore, adjustedConfidence),
    confidence_breakdown: {
      data_quality_score: dataQualityScore,
      model_stability_score: modelStabilityScore,
      edge_confidence_score: edgeConfidenceScore
    },
    data_audit: dataAudit,
    production_gate: productionGate
  });

  tracer?.info(
    Layer03OpId.ORCHESTRATE_QUANT,
    'ORCHESTRATION_COMPLETE',
    `Layer 03 Quantitative orchestration completed. Screening integrity: ${screeningIntegrityScore}, BDI: ${bdi}`,
    {
      screening_integrity_score: screeningIntegrityScore,
      data_quality_score: dataQualityScore,
      model_stability_score: modelStabilityScore,
      edge_confidence_score: edgeConfidenceScore,
      bdi,
      goal_phase_alert: goalPhase,
      raw_positive_ev_count: positive_ev_signals.length,
      machine_candidate_count: machineCandidateSignals.length
    },
    match.canonical_id
  );

  return result;
}
---

## 5. 专家 AI 待交付物 (Expected Deliverables from Expert AI)
1. 提供 `devigCalculator.ts` 中针对让球盘 (asian handicap)、大小球盘 (total goals) 的重构代码段，实现 `底线胜率阈值 (如35%)` + `EV择优` 的新逻辑。
2. 提供 `index.ts` 中针对 `edgeConfidenceScore` 的重构代码段，堵住 `sampleCount === 0` 时的伪置信度漏洞。
3. 提供 `index.ts` 中数据返回结构的重构，向外层暴露 `raw_positive_ev_signals` 数组，分离 `machineCandidateSignals`。

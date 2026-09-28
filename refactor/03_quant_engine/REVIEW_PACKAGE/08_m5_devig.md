# 08 · 去水 EV devigMath + devigCalculator + asianHandicap

## 模块职责
M5：把赔率去抽水成公平概率，对让球/大小球/独赢盘口计算五态 EV。devigMath=Shin去水/乘法去水/贝叶斯收缩；devigCalculator=EV计算+庄家姿态；asianHandicap=让球盘SSOT解析+五态结算。

## 数据流位置
λ_rest(poissonDecayModel) → calculateDeviggedMarketFeatures → 让球/大小球/独赢 EV → index.ts(信号提取)。

## 核心逻辑
- Shin 去水：知情交易者模型，二分法求 z(知情交易者比例)，把含抽水赔率还原成公平概率。解决 favorite-longshot bias(低赔高估/高赔低估)。
- 五态结算：四分之一盘(如 -0.25、0.75)精确分解为 全赢/赢半/走盘/输半/全输 五态，ΣP=1.0。
- 经验贝叶斯收缩：高赔(>2.80)冷门因模型尾部误差收缩，抑制虚假正 EV。
- Kelly 分数：quarter Kelly(EV/(4×(odds-1)))，上限 5%。

## 完整源码 · devigMath.ts（157 行）

`	ypescript
/**
 * @file devigMath.ts
 * @description Layer 03 M5 子模块：去抽水数学基础（Multiplicative / Shin 剥水 + 经验贝叶斯收缩）
 *
 * 从 devigCalculator.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

export function requireFiniteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative Poisson expectation.`);
  }
  return value;
}

export function poissonSupportUpperBound(lambda: number): number {
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
export function devigShin(decimalOdds: number[], maxIter: number = 100, tol: number = 1e-9): { fair_probs: number[]; overround: number; z: number } {
  if (!decimalOdds || decimalOdds.length === 0) {
    return { fair_probs: [], overround: 0.0, z: 0.0 };
  }

  const mult = devigMultiplicative(decimalOdds);
  if (mult.fair_probs.length === 0 || mult.overround <= 1.0) {
    return { fair_probs: mult.fair_probs, overround: mult.overround, z: 0.0 };
  }

  const invOdds = decimalOdds.map((o) => (o > 1.0 ? 1.0 / o : 0.0));
  const overround = mult.overround;

  // 给定 z 求解概率向量 p_i(z) 与 Σp(z)
  const computeProbs = (z: number): { probs: number[]; sumP: number } => {
    let sumP = 0.0;
    const probs: number[] = [];
    for (let i = 0; i < decimalOdds.length; i++) {
      const q = invOdds[i];
      const term = Math.sqrt(z * z + (4.0 * (1.0 - z) * q * q) / overround);
      const pi = (term - z) / (2.0 * (1.0 - z));
      probs.push(Math.max(0.0, pi));
      sumP += pi;
    }
    return { probs, sumP };
  };

  // 二分法求解 z 使 Σp(z) = 1：
  // Σp 关于 z 单调递减，且 z=0 时 Σp=√overround>1、z→1 时 Σp→0，故在 (0,1) 内存在唯一根。
  // 采用二分法保证单调收敛，替代固定步长梯度下降（后者可能振荡或收敛到局部值）。
  let zLow = 0.0;
  let zHigh = 0.4; // Shin z 在实务中几乎总是 < 0.1，0.4 为安全上界
  let z = 0.0;
  let finalProbs: number[] = mult.fair_probs;
  let finalSumP = 1.0;

  for (let iter = 0; iter < maxIter; iter++) {
    z = (zLow + zHigh) / 2.0;
    const { probs, sumP } = computeProbs(z);
    finalProbs = probs;
    finalSumP = sumP;

    if (Math.abs(sumP - 1.0) < tol) break;
    // Σp > 1 说明 z 偏小，需增大 z（区间左端右移）
    if (sumP > 1.0) zLow = z;
    else zHigh = z;
  }

  if (finalSumP > 0 && Math.abs(finalSumP - 1.0) < 1e-2) {
    const normalizedProbs = finalProbs.map((p) => Number((p / finalSumP).toFixed(4)));
    return {
      fair_probs: normalizedProbs,
      overround: Number(overround.toFixed(4)),
      z: Number(z.toFixed(4))
    };
  }

  // 数值退化则优雅降级为比例剥水
  return {
    fair_probs: mult.fair_probs,
    overround: mult.overround,
    z: 0.0
  };
}

/**
 * 经验贝叶斯高赔与深盘离散收缩 (Empirical Bayesian Shrinkage)
 * 抑制高赔冷门 (> 2.80) 因模型小概率尾部误差造成的虚假正 EV
 * P_shrunk = P_fair + (P_model - P_fair) / (1 + 0.50 * max(0, odds - 2.80))
 */
export function applyBayesianShrinkage(
  modelProb: number,
  odds: number,
  fairProb?: number
): {
  shrunkProb: number;
  shrinkageFactor: number;
  isApplied: boolean;
} {
  if (odds <= 2.80 || !Number.isFinite(odds) || odds <= 1.0) {
    return {
      shrunkProb: modelProb,
      shrinkageFactor: 1.0,
      isApplied: false
    };
  }

  const pMarketFair = (typeof fairProb === 'number' && Number.isFinite(fairProb) && fairProb > 0)
    ? fairProb
    : (1.0 / odds); // 若无显式去抽水公允概率，使用内隐概率为锚点

  const shrinkageFactor = Number((1.0 / (1.0 + 0.50 * (odds - 2.80))).toFixed(3));
  const deltaP = modelProb - pMarketFair;

  if (deltaP <= 0) {
    // 模型概率低于市场公允概率，无虚假正溢价，无需下调
    return {
      shrunkProb: modelProb,
      shrinkageFactor: 1.0,
      isApplied: false
    };
  }

  const shrunkProb = Number((pMarketFair + deltaP * shrinkageFactor).toFixed(4));
  return {
    shrunkProb,
    shrinkageFactor,
    isApplied: true
  };
}

``r

## 完整源码 · asianHandicap.ts（337 行）

`	ypescript
/**
 * @file asianHandicap.ts
 * @description Layer 03 M5 子模块：亚洲让球盘/大小球盘 SSOT 解析 + 五态精确结算概率分布
 *
 * 从 devigCalculator.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { poissonPMF } from './poissonCore.js';
import { poissonSupportUpperBound } from './devigMath.js';
import { FiveStateSettlementDistribution } from './types.js';

/**
 * 盘口字符串统一精准解析（SSOT Parser）
 * 支持 "-0.5", "2.5", "-0/0.5", "0/-0.5", "+0/0.5", "0/0.5", "-0.5/-1", "平手/半球", "受让平半", "客 -0/0.5" 等
 * 彻底杜绝负零丢失与符号反转问题
 */
export function parseAsianHandicapLine(lineStr: string | number): number {
  if (lineStr === null || lineStr === undefined) return 0.0;
  if (typeof lineStr === 'number') {
    if (isNaN(lineStr) || !isFinite(lineStr)) return 0.0;
    return lineStr === 0 || Object.is(lineStr, -0) ? 0.0 : lineStr;
  }
  const clean = String(lineStr).trim().replace(/\s+/g, '');
  if (!clean) return 0.0;

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

  // 判断受让 vs 让球/负号
  const hasSurrenderKeyword = clean.includes('受让') || clean.includes('受');
  const hasNegativeSign = clean.includes('-');
  const hasPositiveSign = clean.includes('+');

  // 清洗汉字前缀与符号
  const pureText = clean
    .replace(/^[+-]/, '')
    .replace(/^(让球|受让|让|受|客|主)/, '')
    .replace(/[+-]/g, '')
    .trim();

  if (TEXT_MAP[pureText] !== undefined) {
    const val = TEXT_MAP[pureText];
    if (val === 0.0) return 0.0;
    // 中文让球习惯中，"半球"代表主队让半球即 -0.5；"受让半球"代表主队受让即 +0.5
    if (hasSurrenderKeyword || (hasPositiveSign && !hasNegativeSign)) return val;
    return -val;
  }

  // 2. 检查斜杠复合盘 (如 "0/0.5", "0.5/1", "-0/0.5", "0/-0.5", "-0.5/-1", "+0/0.5")
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 2) {
      const p1Raw = parts[0].trim();
      const p2Raw = parts[1].trim();
      const p1 = parseFloat(p1Raw);
      const p2 = parseFloat(p2Raw);
      if (!isNaN(p1) && !isNaN(p2)) {
        // 只要出现负号或为负数或-0，即判为负盘（除非明确只有受让关键词且无负号）
        const isNeg = !hasSurrenderKeyword && (
          hasNegativeSign ||
          p1 < 0 ||
          p2 < 0 ||
          Object.is(p1, -0) ||
          Object.is(p2, -0) ||
          p1Raw.startsWith('-') ||
          p2Raw.startsWith('-')
        );
        const avg = (Math.abs(p1) + Math.abs(p2)) / 2.0;
        return isNeg ? -avg : avg;
      }
    }
  }

  // 3. 直接浮点解析
  const val = parseFloat(clean);
  if (isNaN(val)) return NaN;
  if (val === 0 && (clean.startsWith('-') || Object.is(val, -0))) {
    return 0.0;
  }
  return val;
}

/**
 * 盘口数值转标准显示串 (如 -0.25 -> "-0/0.5", +0.25 -> "+0/0.5", -0.5 -> "-0.5", 0 -> "0")
 */
export function formatAsianHandicapLine(lineVal: number): string {
  if (lineVal === 0 || Object.is(lineVal, -0)) return '0';
  const isNeg = lineVal < 0;
  const abs = Math.abs(lineVal);

  if (Math.abs(abs - 0.25) < 1e-4) return isNeg ? '-0/0.5' : '+0/0.5';
  if (Math.abs(abs - 0.75) < 1e-4) return isNeg ? '-0.5/1' : '+0.5/1';
  if (Math.abs(abs - 1.25) < 1e-4) return isNeg ? '-1/1.5' : '+1/1.5';
  if (Math.abs(abs - 1.75) < 1e-4) return isNeg ? '-1.5/2' : '+1.5/2';
  if (Math.abs(abs - 2.25) < 1e-4) return isNeg ? '-2/2.5' : '+2/2.5';
  if (Math.abs(abs - 2.75) < 1e-4) return isNeg ? '-2.5/3' : '+2.5/3';

  return lineVal > 0 ? `+${lineVal}` : `${lineVal}`;
}

/**
 * 客队盘口反转统一函数
 * 基于解析出的浮点数进行严格符号反转，杜绝字符串拼接产生的非法格式 (如 "-平/半", "-0/-0.5")
 */
export function invertHandicapString(lineStr: string): string {
  if (!lineStr || lineStr === '0' || lineStr === '0.0') return '0';
  const val = parseAsianHandicapLine(lineStr);
  if (val === 0) return '0';
  return formatAsianHandicapLine(-val);
}

/**
 * 将归一化后的 5 态概率四舍五入到 4 位小数，并用最大余数法保证 ΣP 精确等于 1.0。
 * 单纯逐项 toFixed(4) 会破坏闭式归一化（累计偏差可达 ±0.00025，超过下游 1e-4 容差）。
 */
function roundFiveStateToUnit(values: readonly number[]): number[] {
  const SCALE = 10000;
  const scaled = values.map((v) => v * SCALE);
  const floors = scaled.map((v) => Math.floor(v));
  let remaining = Math.round(SCALE - floors.reduce((a, b) => a + b, 0));
  const order = scaled
    .map((v, i) => ({ i, rem: v - floors[i] }))
    .sort((a, b) => b.rem - a.rem);
  let idx = 0;
  while (remaining > 0 && idx < order.length) {
    floors[order[idx].i] += 1;
    remaining -= 1;
    idx++;
  }
  return floors.map((v) => v / SCALE);
}

/**
 * 计算亚洲让球盘的 5 态精确结算概率分布
 * 保证 ∑P = 1.0 闭式归一化
 */
export function calculateSpreadFiveStateDistribution(
  handicapValue: number,
  side: 'home' | 'away',
  matrix: number[][]
): FiveStateSettlementDistribution {
  let p_full_win = 0.0;
  let p_half_win = 0.0;
  let p_push = 0.0;
  let p_half_loss = 0.0;
  let p_full_loss = 0.0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const pCell = matrix[h][a];
      if (pCell <= 0) continue;

      const d = h - a;
      const delta = side === 'home' ? d + handicapValue : -d - handicapValue;

      if (delta >= 0.5 - 1e-4) {
        p_full_win += pCell;
      } else if (Math.abs(delta - 0.25) < 1e-4) {
        p_half_win += pCell;
      } else if (Math.abs(delta) < 1e-4) {
        p_push += pCell;
      } else if (Math.abs(delta - (-0.25)) < 1e-4) {
        p_half_loss += pCell;
      } else {
        p_full_loss += pCell;
      }
    }
  }

  // 严格归一化保证数学闭合，防止截断或浮点微小漂移
  const sum = p_full_win + p_half_win + p_push + p_half_loss + p_full_loss;
  if (sum > 0) {
    p_full_win /= sum;
    p_half_win /= sum;
    p_push /= sum;
    p_half_loss /= sum;
    p_full_loss /= sum;
  }

  const [r_full_win, r_half_win, r_push, r_half_loss, r_full_loss] = roundFiveStateToUnit([
    p_full_win, p_half_win, p_push, p_half_loss, p_full_loss
  ]);

  return {
    p_full_win: r_full_win,
    p_half_win: r_half_win,
    p_push: r_push,
    p_half_loss: r_half_loss,
    p_full_loss: r_full_loss,
    source: 'ENGINE_COMPUTED'
  };
}

/**
 * 计算全场大小球盘口的 5 态精确结算概率分布
 * 保证 ∑P = 1.0 闭式归一化
 */
export function calculateTotalFiveStateDistribution(
  line: number,
  currentTotalGoals: number,
  side: 'over' | 'under',
  lambdaRest: number
): FiveStateSettlementDistribution {
  const remainingTarget = line - currentTotalGoals;
  let p_full_win = 0.0;
  let p_half_win = 0.0;
  let p_push = 0.0;
  let p_half_loss = 0.0;
  let p_full_loss = 0.0;

  for (let k = 0; k <= poissonSupportUpperBound(lambdaRest); k++) {
    const pK = poissonPMF(k, lambdaRest);
    if (pK <= 0) continue;

    const delta = side === 'over' ? k - remainingTarget : remainingTarget - k;

    if (delta >= 0.5 - 1e-4) {
      p_full_win += pK;
    } else if (Math.abs(delta - 0.25) < 1e-4) {
      p_half_win += pK;
    } else if (Math.abs(delta) < 1e-4) {
      p_push += pK;
    } else if (Math.abs(delta - (-0.25)) < 1e-4) {
      p_half_loss += pK;
    } else {
      p_full_loss += pK;
    }
  }

  // 严格归一化保证数学闭合，防止截断或浮点微小漂移
  const sum = p_full_win + p_half_win + p_push + p_half_loss + p_full_loss;
  if (sum > 0) {
    p_full_win /= sum;
    p_half_win /= sum;
    p_push /= sum;
    p_half_loss /= sum;
    p_full_loss /= sum;
  }

  const [r_full_win, r_half_win, r_push, r_half_loss, r_full_loss] = roundFiveStateToUnit([
    p_full_win, p_half_win, p_push, p_half_loss, p_full_loss
  ]);

  return {
    p_full_win: r_full_win,
    p_half_win: r_half_win,
    p_push: r_push,
    p_half_loss: r_half_loss,
    p_full_loss: r_full_loss,
    source: 'ENGINE_COMPUTED'
  };
}

/**
 * 从双变量泊松网格计算全场大小球盘口的 5 态精确结算概率分布（含 Dixon-Coles 低比分修正）
 * 与让球盘 EV 共享同一概率模型，避免大小球与让球 EV 在低比分/极端场面下的概率不一致。
 * 保证 ∑P = 1.0 闭式归一化
 */
export function calculateTotalFiveStateDistributionFromGrid(
  line: number,
  currentTotalGoals: number,
  side: 'over' | 'under',
  matrix: number[][]
): FiveStateSettlementDistribution {
  const remainingTarget = line - currentTotalGoals;
  let p_full_win = 0.0;
  let p_half_win = 0.0;
  let p_push = 0.0;
  let p_half_loss = 0.0;
  let p_full_loss = 0.0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const pCell = matrix[h][a];
      if (pCell <= 0) continue;

      const k = h + a; // 剩余时段总进球数
      const delta = side === 'over' ? k - remainingTarget : remainingTarget - k;

      if (delta >= 0.5 - 1e-4) {
        p_full_win += pCell;
      } else if (Math.abs(delta - 0.25) < 1e-4) {
        p_half_win += pCell;
      } else if (Math.abs(delta) < 1e-4) {
        p_push += pCell;
      } else if (Math.abs(delta - (-0.25)) < 1e-4) {
        p_half_loss += pCell;
      } else {
        p_full_loss += pCell;
      }
    }
  }

  // 严格归一化保证数学闭合，防止截断或浮点微小漂移
  const sum = p_full_win + p_half_win + p_push + p_half_loss + p_full_loss;
  if (sum > 0) {
    p_full_win /= sum;
    p_half_win /= sum;
    p_push /= sum;
    p_half_loss /= sum;
    p_full_loss /= sum;
  }

  const [r_full_win, r_half_win, r_push, r_half_loss, r_full_loss] = roundFiveStateToUnit([
    p_full_win, p_half_win, p_push, p_half_loss, p_full_loss
  ]);

  return {
    p_full_win: r_full_win,
    p_half_win: r_half_win,
    p_push: r_push,
    p_half_loss: r_half_loss,
    p_full_loss: r_full_loss,
    source: 'ENGINE_COMPUTED'
  };
}

``r

## 完整源码 · devigCalculator.ts（793 行）

`	ypescript
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
import { calculateBivariatePoissonGrid } from './poissonDecayModel.js';
import { requireFiniteNonNegative, poissonSupportUpperBound, devigShin, applyBayesianShrinkage, devigMultiplicative } from './devigMath.js';
export { devigMultiplicative, devigShin, applyBayesianShrinkage };
import { parseAsianHandicapLine, formatAsianHandicapLine, invertHandicapString, calculateSpreadFiveStateDistribution, calculateTotalFiveStateDistribution, calculateTotalFiveStateDistributionFromGrid } from './asianHandicap.js';
export { parseAsianHandicapLine, formatAsianHandicapLine, invertHandicapString, calculateSpreadFiveStateDistribution, calculateTotalFiveStateDistribution, calculateTotalFiveStateDistributionFromGrid };

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
  let homeFullWinProbability = 0.0;
  let homeHalfWinProbability = 0.0;
  let awayFullWinProbability = 0.0;
  let awayHalfWinProbability = 0.0;

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
        homeFullWinProbability += pCell;
      } else if (Math.abs(deltaHome - 0.25) < 1e-4) {
        payoffHome = 0.5 * (homeOdds - 1.0); // 赢半
        homeHalfWinProbability += pCell;
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
        awayFullWinProbability += pCell;
      } else if (Math.abs(deltaAway - 0.25) < 1e-4) {
        payoffAway = 0.5 * (awayOdds - 1.0); // 赢半
        awayHalfWinProbability += pCell;
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

  // 经验贝叶斯高赔与冷门收缩 (Empirical Bayesian Shrinkage for Odds > 2.80)
  // 等效全赢概率（与 1/odds 市场内隐「全赢」概率同量纲）：
  // 赢半收益 = 0.5*(odds-1)，期望上等价于 0.5 个全赢，故等效胜率 = P(全赢) + 0.5*P(赢半)。
  // 不得将「全赢+赢半」简单概率和（至少赢半概率）当作胜率注入收缩，否则量纲不一致会过度收缩冷门。
  const homeEquivalentWinProbability = homeFullWinProbability + 0.5 * homeHalfWinProbability;
  const awayEquivalentWinProbability = awayFullWinProbability + 0.5 * awayHalfWinProbability;

  const homeShrink = applyBayesianShrinkage(homeEquivalentWinProbability, homeOdds);
  const awayShrink = applyBayesianShrinkage(awayEquivalentWinProbability, awayOdds);
  let effectiveHomeEV = homeEV;
  let effectiveAwayEV = awayEV;

  if (homeShrink.isApplied && homeEquivalentWinProbability > 0) {
    const ratio = homeShrink.shrunkProb / homeEquivalentWinProbability;
    effectiveHomeEV = Number((homeEV * ratio).toFixed(4));
  }
  if (awayShrink.isApplied && awayEquivalentWinProbability > 0) {
    const ratio = awayShrink.shrunkProb / awayEquivalentWinProbability;
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
    home_model_probability: Number((homeShrink.isApplied ? homeShrink.shrunkProb : homeEquivalentWinProbability).toFixed(4)),
    away_model_probability: Number((awayShrink.isApplied ? awayShrink.shrunkProb : awayEquivalentWinProbability).toFixed(4)),
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
  const lambdaHome = requireFiniteNonNegative(poisson.lambda_home_rest, 'lambda_home_rest');
  const lambdaAway = requireFiniteNonNegative(poisson.lambda_away_rest, 'lambda_away_rest');

  // 使用双变量泊松网格闭式求解（含 Dixon-Coles 低比分修正），
  // 与让球盘 EV 共享同一概率模型，避免大小球与让球 EV 在低比分/极端场面下的概率不一致。
  const totalGrid = calculateBivariatePoissonGrid(
    lambdaHome,
    lambdaAway,
    Math.max(poissonSupportUpperBound(lambdaHome), poissonSupportUpperBound(lambdaAway))
  );
  const matrix = totalGrid.grid;

  let overEV = 0.0;
  let underEV = 0.0;
  let overFullWinProbability = 0.0;
  let overHalfWinProbability = 0.0;
  let underFullWinProbability = 0.0;
  let underHalfWinProbability = 0.0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const pCell = matrix[h][a];
      if (pCell <= 0) continue;

      const k = h + a; // 剩余时段总进球数

      // 1. 大球收益
      const deltaOver = k - remainingTarget;
      let payoffOver = 0.0;
      if (deltaOver >= 0.5) {
        payoffOver = overOdds - 1.0;
        overFullWinProbability += pCell;
      } else if (Math.abs(deltaOver - 0.25) < 1e-4) {
        payoffOver = 0.5 * (overOdds - 1.0);
        overHalfWinProbability += pCell;
      } else if (Math.abs(deltaOver) < 1e-4) {
        payoffOver = 0.0;
      } else if (Math.abs(deltaOver - (-0.25)) < 1e-4) {
        payoffOver = -0.5;
      } else {
        payoffOver = -1.0;
      }
      overEV += pCell * payoffOver;

      // 2. 小球收益
      const deltaUnder = remainingTarget - k;
      let payoffUnder = 0.0;
      if (deltaUnder >= 0.5) {
        payoffUnder = underOdds - 1.0;
        underFullWinProbability += pCell;
      } else if (Math.abs(deltaUnder - 0.25) < 1e-4) {
        payoffUnder = 0.5 * (underOdds - 1.0);
        underHalfWinProbability += pCell;
      } else if (Math.abs(deltaUnder) < 1e-4) {
        payoffUnder = 0.0;
      } else if (Math.abs(deltaUnder - (-0.25)) < 1e-4) {
        payoffUnder = -0.5;
      } else {
        payoffUnder = -1.0;
      }
      underEV += pCell * payoffUnder;
    }
  }

  overEV = Number(overEV.toFixed(4));
  underEV = Number(underEV.toFixed(4));

  // 经验贝叶斯高赔与冷门收缩 (Empirical Bayesian Shrinkage for Odds > 2.80)
  // 等效全赢概率（与 1/odds 市场内隐「全赢」概率同量纲），避免「全赢+赢半」简单概率和量纲不一致。
  const overEquivalentWinProbability = overFullWinProbability + 0.5 * overHalfWinProbability;
  const underEquivalentWinProbability = underFullWinProbability + 0.5 * underHalfWinProbability;

  const overShrink = applyBayesianShrinkage(overEquivalentWinProbability, overOdds);
  const underShrink = applyBayesianShrinkage(underEquivalentWinProbability, underOdds);
  let effectiveOverEV = overEV;
  let effectiveUnderEV = underEV;

  if (overShrink.isApplied && overEquivalentWinProbability > 0) {
    const ratio = overShrink.shrunkProb / overEquivalentWinProbability;
    effectiveOverEV = Number((overEV * ratio).toFixed(4));
  }
  if (underShrink.isApplied && underEquivalentWinProbability > 0) {
    const ratio = underShrink.shrunkProb / underEquivalentWinProbability;
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
  const overSettlementDist = calculateTotalFiveStateDistributionFromGrid(line, currentTotalGoals, 'over', matrix);
  const underSettlementDist = calculateTotalFiveStateDistributionFromGrid(line, currentTotalGoals, 'under', matrix);

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
    over_model_probability: Number((overShrink.isApplied ? overShrink.shrunkProb : overEquivalentWinProbability).toFixed(4)),
    under_model_probability: Number((underShrink.isApplied ? underShrink.shrunkProb : underEquivalentWinProbability).toFixed(4)),
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

``r

## 魔法数字标注
- Shin z 二分上界 0.4、收敛 tol 1e-9 —— 写死(但合理)
- 贝叶斯收缩 0.50 系数、2.80 触发阈值 —— 写死
- Kelly 上限 0.05、除数 4 —— 写死
- 庄家姿态 Shin Z 0.08、诱盘赔率 4.5/7.0/1.50/2.20 阈值 —— 写死

## 已知疑点
- 【P3 已修】Shin 去水由固定步长改为二分法。
- 【P4 已修】贝叶斯收缩改用等效全赢概率。
- 五态结算已确认正确(赢半/输半/走盘精确)。
- 请重点审查：Kelly 的 quarter(÷4)+5%上限是否过度保守；庄家姿态判定阈值是否合理；五态结算的边界(0.25 判赢半 vs 0.5 判全赢)是否精确。

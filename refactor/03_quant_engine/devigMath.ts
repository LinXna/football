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

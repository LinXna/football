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

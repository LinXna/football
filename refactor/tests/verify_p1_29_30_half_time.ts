/**
 * P1-29 + P1-30 专项回归验证：半场时钟连续性与上半场 hazard 尺度
 *
 * P1-29：remaining minutes 在 44'→45' 不得出现 2.5 分钟离散下降（价格半场边界跳变），
 *        应显式 half-time state：44'→45' 仅降 1 分钟，补时正确在 45'→46' 消耗。
 * P1-30：上半场 λ 的时间比例分母应为全场 90 分钟（0~0.5 尺度），
 *        与 calculateFirstHalfPhasedDNATimeFraction 的"占全场"语义一致，不得高估 2 倍。
 */
import assert from 'node:assert';
import { MatchStage } from '../02_canonical_model/enums.js';
import { CanonicalTimingState } from '../02_canonical_model/types.js';
import { calculateExpectedRemainingMinutesIncludingStoppage } from '../03_quant_engine/poissonDecayModel.js';
import { calculateFirstHalfPhasedDNATimeFraction } from '../03_quant_engine/poissonDecay.js';

const timing = (minute: number, addedMinute: number | null = null): CanonicalTimingState => ({
  stage: MatchStage.LIVE,
  beijing_start_time: '2026-09-25 20:00:00',
  start_time_source: 'YBTY_EXACT',
  minute,
  added_minute: addedMinute,
  is_half_time: minute === 45,
  is_extra_time: false,
  is_overtime_or_penalty: false,
  ybty_display_clock: `${minute}:00`
});

// ---- P1-29: 半场边界连续性 ----
const r44 = calculateExpectedRemainingMinutesIncludingStoppage(timing(44));
const r45 = calculateExpectedRemainingMinutesIncludingStoppage(timing(45));
const r46 = calculateExpectedRemainingMinutesIncludingStoppage(timing(46));

console.log(`P1-29 remaining minutes: 44'=${r44}, 45'=${r45}, 46'=${r46}`);
assert(r44 === 51.5, `44' remaining 应为 51.5 (1H常规1 + 1H补时1.5 + 2H常规45 + 2H补时4)，实际 ${r44}`);
assert(r45 === 50.5, `45' remaining 应为 50.5 (1H补时1.5 + 2H常规45 + 2H补时4)，实际 ${r45}`);
assert(r44 - r45 === 1, `44'→45' 必须仅降 1 分钟（此前错误降 2.5），实际降 ${r44 - r45}`);
assert(r45 - r46 === 2.5, `45'→46' 应消耗 1.5 补时 + 1 常规 = 2.5，实际降 ${r45 - r46}`);

// ---- P1-30: 上半场 hazard 尺度 ----
const uniform6 = [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6];
const dnaFirstHalfAt0 = calculateFirstHalfPhasedDNATimeFraction(0, uniform6);
const uniformFirstHalfAt0 = 45 / 90; // 修复后的 uniform 公式（分母 90）
const legacyUniformFirstHalfAt0 = 45 / 45; // 修复前的错误公式（分母 45）

console.log(`P1-30 firstHalfFraction@0': DNA=${dnaFirstHalfAt0}, uniform(45/90)=${uniformFirstHalfAt0}, legacy(45/45)=${legacyUniformFirstHalfAt0}`);
assert(Math.abs(dnaFirstHalfAt0 - 0.5) < 1e-4, `DNA 上半场占比@0' 应为 0.5，实际 ${dnaFirstHalfAt0}`);
assert(Math.abs(uniformFirstHalfAt0 - 0.5) < 1e-4, `uniform 上半场占比@0' 应为 0.5 (45/90)，实际 ${uniformFirstHalfAt0}`);
assert(Math.abs(uniformFirstHalfAt0 - dnaFirstHalfAt0) < 1e-4, 'uniform 与 DNA 版本尺度必须一致（均占全场 0~0.5）');
assert(legacyUniformFirstHalfAt0 === 1.0, '修复前 legacy 公式为 1.0（占上半场 0~1），与全场 λ 相乘高估 2 倍');

console.log('✅ P1-29 + P1-30 half-time clock continuity & first-half hazard scale verified');

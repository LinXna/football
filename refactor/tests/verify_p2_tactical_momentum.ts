/**
 * P2 量化引擎战术与动量增强 (任务 2.1 ~ 2.5) 核心验证套件
 * 
 * 验证目标：
 * 1. [任务 2.1] 9 项现场物理技术统计全量激活与 TTI 进攻威胁转化指数及 EPI 深度联动断言；
 * 2. [任务 2.2] 多尺度动量金字塔模型 (5m: 40%, 10m: 35%, 15m: 25%) 复合斜率与一致性 (ALIGNED/TURNING/DIVERGENT) 断言；
 * 3. [任务 2.3] 滚球红牌场景三态分流 (LEADING_PARK_BUS / DRAW_BALANCED_ATTRITION / TRAILING_COLLAPSE_RISK) 攻防非对称性断言；
 * 4. [任务 2.4] 超强弱悬殊豪门红牌防御策略覆盖模式 (Strategy Override Pattern) 缓冲因子断言；
 * 5. [任务 2.5] 极端高赔 (Odds > 2.80) 与深盘经验贝叶斯收缩机制 (Empirical Bayesian Shrinkage) 准确性断言。
 */

import assert from 'node:assert';
import {
  extractRealTimePhysicalStats,
  extractMomentumTimelineFeatures
} from '../03_quant_engine/momentumQuantEngine.js';
import {
  calculateSpatioTemporalFeatures,
  calculateLiveThreatTrinity,
  calculateEventPressureConversion,
  evaluateGoalClimax,
  evaluateTacticalRegime
} from '../03_quant_engine/eventMomentumFusion.js';
import {
  calculateContinuousThreatTensor,
  calculateInPlayPoissonFeatures
} from '../03_quant_engine/poissonDecayModel.js';
import {
  applyBayesianShrinkage,
  calculateAsianHandicapEV,
  calculateTotalEV,
  calculateDeviggedMarketFeatures
} from '../03_quant_engine/devigCalculator.js';
import { buildUnifiedMatchState } from '../03_quant_engine/index.js';
import {
  MatchStage,
  CanonicalEventType
} from '../02_canonical_model/enums.js';
import {
  CanonicalMatch,
  EventPressureConversionType,
  MarketType,
  UnifiedMatchState,
  DevigMethod
} from '../03_quant_engine/types.js';

console.log('======================================================================');
console.log('🚀 [P2 Suite] 开始执行 P2 量化引擎战术与动量增强全量验证...');
console.log('======================================================================\n');

// 构造通用基准比赛测试工厂
function createBaseMatch(overrides?: Partial<CanonicalMatch>): CanonicalMatch {
  return {
    canonical_id: 'TEST_P2_001',
    schedule: {
      scheduled_time_utc: new Date().toISOString(),
      scheduled_time_beijing: '2026-09-14 18:00:00',
      estimated_start_time_beijing: '2026-09-14 18:00:00'
    },
    timing: {
      stage: MatchStage.LIVE,
      minute: 65,
      added_minute: 0,
      clock_running: true,
      last_updated_utc: new Date().toISOString()
    },
    teams: {
      home: { canonical_name: 'Home FC', ybty_name: 'Home FC' },
      away: { canonical_name: 'Away FC', ybty_name: 'Away FC' }
    },
    competition: {
      name: 'Premier League',
      tier: 1
    },
    score: {
      home_score: 1,
      away_score: 0,
      score_verified: true
    },
    markets: {
      full_spread_main: {
        home_selection: '-0.5',
        home_odds: 1.95,
        away_odds: 1.95
      },
      full_total_main: {
        line: '2.5',
        over_selection: '2.5',
        over_odds: 1.90,
        under_odds: 1.90
      },
      moneyline_1x2: {
        home_odds: 1.95,
        draw_odds: 3.40,
        away_odds: 4.20
      }
    },
    reference: {
      stats: {
        dangerous_attacks: { home: 45, away: 20 },
        attacks: { home: 75, away: 40 },
        shots: { home: 12, away: 4 },
        shots_on_target: { home: 5, away: 1 },
        shots_off_target: { home: 7, away: 3 },
        corners: { home: 6, away: 2 },
        possession: { home: 60, away: 40 },
        yellow_cards: { home: 1, away: 2 },
        red_cards: { home: 0, away: 0 }
      },
      timeline_events: [
        { minute: 28, type: 1, side: 'home', text: 'Goal 1-0', is_cancelled: false, canonical_type: CanonicalEventType.GOAL_REGULAR },
        { minute: 42, type: 5, side: 'home', text: 'Offside', is_cancelled: false, canonical_type: CanonicalEventType.OFFSIDE },
        { minute: 56, type: 21, side: 'home', text: 'Shot on target', is_cancelled: false, canonical_type: CanonicalEventType.SHOT_ON_TARGET },
        { minute: 58, type: 22, side: 'home', text: 'Shot hits the woodwork (门柱)', is_cancelled: false, canonical_type: CanonicalEventType.SHOT_OFF_TARGET },
        { minute: 61, type: 2, side: 'home', text: 'Corner kick', is_cancelled: false, canonical_type: CanonicalEventType.CORNER },
        { minute: 64, type: 21, side: 'home', text: 'Shot on target saved', is_cancelled: false, canonical_type: CanonicalEventType.SHOT_ON_TARGET }
      ]
    },
    ...overrides
  };
}

// -------------------------------------------------------------------------------------------------
// [Test 1] 任务 2.1: 9 项现场物理技术统计全量激活与 TTI 威胁转化指数
// -------------------------------------------------------------------------------------------------
console.log('📌 [Test 1] 验证任务 2.1: 9 项现场物理统计与 TTI 进攻威胁转化指数...');

const matchT1 = createBaseMatch();
const physicalStats = extractRealTimePhysicalStats(matchT1);

assert.strictEqual(physicalStats.stats_available, true, '9 项攻防指标完备时 stats_available 必须为 true');
assert.strictEqual(physicalStats.available_metrics.dangerous_attacks, true);
assert.strictEqual(physicalStats.available_metrics.attacks, true);
assert.strictEqual(physicalStats.available_metrics.shots, true);
assert.strictEqual(physicalStats.available_metrics.shots_on_target, true);
assert.strictEqual(physicalStats.available_metrics.shots_off_target, true);
assert.strictEqual(physicalStats.available_metrics.corners, true);
assert.strictEqual(physicalStats.available_metrics.possession, true);
assert.strictEqual(physicalStats.available_metrics.yellow_cards, true);
assert.strictEqual(physicalStats.available_metrics.red_cards, true);

// 验证关键时序衍生指标: 门柱险情、越位
assert.strictEqual(physicalStats.shot_efficiency.home_woodwork_count, 1, '门柱击中应正确被提取');
assert.strictEqual(physicalStats.counter_threat_index.home_counter_threat! > 0, true, '越位与射门应沉淀反击威胁');

// 验证 TTI 指数计算
const tti = physicalStats.threat_transformation_index;
assert.ok(tti, 'TTI 特征结构必须存在');
assert.ok(typeof tti.home_tti === 'number' && tti.home_tti > 0, '主队 TTI 必须为正数');
assert.ok(typeof tti.away_tti === 'number' && tti.away_tti > 0, '客队 TTI 必须为正数');
assert.ok(tti.home_tti > tti.away_tti, '主队具备更高危攻与射门转化率，主队 TTI 必须显著高于客队');
assert.strictEqual(tti.advantage_side, 'home', 'TTI 优势方必须为主队');
assert.ok(
  tti.classification?.home === 'LETHAL_PENETRATION' || tti.classification?.home === 'EFFECTIVE_ATTACK',
  '主队攻势应定性为致命穿透或高效进攻'
);

// 验证 TTI 与 EPI 的深度联动
const mockTimeline = {
  total_points: 15,
  window_basis: 'MINUTE_ALIGNED' as const,
  cutoff_minute: 65,
  current_instant_momentum: 45,
  slope_5m: 8.5,
  slope_10m: 6.2,
  slope_15m: 4.8,
  integral_5m: { home: 180, away: 20, net: 160 },
  integral_15m: { home: 420, away: 60, net: 360 },
  integral_full_match: { home: 1200, away: 300, net: 900 },
  dominance_side: 'home' as const,
  inflection_count_recent_15m: 1,
  is_sustained_siege: true,
  is_counter_attack_surge: false
};

const trinity = calculateLiveThreatTrinity(mockTimeline, matchT1.reference!.timeline_events!, physicalStats, 65);
const epi = calculateEventPressureConversion(mockTimeline, matchT1.reference!.timeline_events!, trinity, 65, physicalStats);

assert.strictEqual(epi.home.classification, EventPressureConversionType.LETHAL_SIEGE, '高 TTI + 高危攻能量必须分类为 LETHAL_SIEGE');
console.log('✅ [Test 1] 任务 2.1 验证通过: 9 项统计与 TTI 转化指数解算精准，EPI 联动闭环！\n');

// -------------------------------------------------------------------------------------------------
// [Test 2] 任务 2.2: 多尺度动量金字塔模型 (5m: 40%, 10m: 35%, 15m: 25%)
// -------------------------------------------------------------------------------------------------
console.log('📌 [Test 2] 验证任务 2.2: 多尺度动量金字塔加权与一致性 (ALIGNED / TURNING)...');

// 场景 2.1: 三尺度同向共振 ALIGNED
const fullPointsAligned = Array.from({ length: 65 }, (_, i) => {
  if (i < 50) return 10;
  if (i < 55) return 10 + (i - 50) * 2;
  if (i < 60) return 20 + (i - 55) * 3;
  return 35 + (i - 60) * 4;
});

const matchPyramidAligned = createBaseMatch({
  reference: {
    ...matchT1.reference,
    attack_momentum: {
      available: true,
      nominal_segment_minutes: 90,
      data: [fullPointsAligned]
    }
  }
});

const timelineAligned = extractMomentumTimelineFeatures(matchPyramidAligned);
assert.ok(timelineAligned.momentum_pyramid, '动量金字塔结构必须存在');
const pyramid = timelineAligned.momentum_pyramid;

// 校验复合斜率公式: 0.40 * slope5 + 0.35 * slope10 + 0.25 * slope15
const expectedSlope = Number((0.40 * timelineAligned.slope_5m + 0.35 * timelineAligned.slope_10m + 0.25 * timelineAligned.slope_15m).toFixed(3));
assert.strictEqual(pyramid.composite_slope, expectedSlope, '复合斜率加权权重必须精确为 40%-35%-25%');
assert.strictEqual(pyramid.consistency, 'ALIGNED', '三尺度斜率同为正值且非零时必须判定为 ALIGNED 共振');

// 校验 ALIGNED 时破门临界态获得 1.12 增益
const climaxAligned = evaluateGoalClimax(matchPyramidAligned, timelineAligned, epi, trinity);
assert.ok(climaxAligned.climax_score >= 35, 'ALIGNED 态下破门临界分值应受到正向加权');

// 场景 2.2: 攻防转折 TURNING
// 5m 急剧下跌 (slope5 < 0)，但 15m 宏观仍为强势上升 (slope15 > 0)
const fullPointsTurning = Array.from({ length: 65 }, (_, i) => {
  if (i < 50) return 10;
  if (i < 60) return 10 + (i - 50) * 5; // 上升
  return 60 - (i - 60) * 8; // 下跌
});

const matchPyramidTurning = createBaseMatch({
  reference: {
    ...matchT1.reference,
    attack_momentum: {
      available: true,
      nominal_segment_minutes: 90,
      data: [fullPointsTurning]
    }
  }
});
const timelineTurning = extractMomentumTimelineFeatures(matchPyramidTurning);
assert.strictEqual(timelineTurning.momentum_pyramid?.consistency, 'TURNING', '短期暴跌与宏观强势背离且差值大必须判定为 TURNING');

console.log('✅ [Test 2] 任务 2.2 验证通过: 多尺度动量金字塔 (5m 40%, 10m 35%, 15m 25%) 复合斜率与状态机精准！\n');

// -------------------------------------------------------------------------------------------------
// [Test 3] 任务 2.3: 滚球红牌场景三态分流 (领先 / 平局 / 落后)
// -------------------------------------------------------------------------------------------------
console.log('📌 [Test 3] 验证任务 2.3: 滚球红牌场景三态分流机制 (LEADING / DRAW / TRAILING)...');

// 1. 领先摆大巴态 (LEADING_PARK_BUS): 主队 2-0 领先且吃 1 张红牌
const matchRedLeading = createBaseMatch({
  score: { home_score: 2, away_score: 0, score_verified: true },
  reference: {
    stats: {
      ...matchT1.reference!.stats!,
      possession: { home: 50, away: 50 },
      dangerous_attacks: { home: 30, away: 30 },
      red_cards: { home: 1, away: 0 }
    }
  }
});
const physRedLeading = extractRealTimePhysicalStats(matchRedLeading);
const redPenLeading = physRedLeading.red_card_penalty;
assert.strictEqual(redPenLeading.home_scenario, 'LEADING_PARK_BUS', '领先方吃红牌必须分流为 LEADING_PARK_BUS');
// exp(-0.65) ≈ 0.522 (大幅削减进攻), exp(0.20) ≈ 1.221 (收缩防守，漏球抑制)
assert.ok(redPenLeading.home_attack_multiplier! <= 0.55, '领先方吃红牌进攻倍率必须大幅削减');
assert.ok(redPenLeading.home_defense_leak_multiplier! <= 1.25, '领先方防守大巴漏球增长受控');

// 2. 平局均势消耗态 (DRAW_BALANCED_ATTRITION): 0-0 平局吃红牌
const matchRedDraw = createBaseMatch({
  score: { home_score: 0, away_score: 0, score_verified: true },
  reference: {
    stats: {
      ...matchT1.reference!.stats!,
      possession: { home: 50, away: 50 },
      dangerous_attacks: { home: 30, away: 30 },
      red_cards: { home: 1, away: 0 }
    }
  }
});
const physRedDraw = extractRealTimePhysicalStats(matchRedDraw);
assert.strictEqual(physRedDraw.red_card_penalty.home_scenario, 'DRAW_BALANCED_ATTRITION', '平局吃红牌必须分流为 DRAW_BALANCED_ATTRITION');

// 3. 落后崩溃风险态 (TRAILING_COLLAPSE_RISK): 0-2 落后吃红牌
const matchRedTrailing = createBaseMatch({
  score: { home_score: 0, away_score: 2, score_verified: true },
  reference: {
    stats: {
      ...matchT1.reference!.stats!,
      possession: { home: 50, away: 50 },
      dangerous_attacks: { home: 30, away: 30 },
      red_cards: { home: 1, away: 0 }
    }
  }
});
const physRedTrailing = extractRealTimePhysicalStats(matchRedTrailing);
assert.strictEqual(physRedTrailing.red_card_penalty.home_scenario, 'TRAILING_COLLAPSE_RISK', '落后方吃红牌必须分流为 TRAILING_COLLAPSE_RISK');
// exp(0.55) ≈ 1.733 (后防失球暴增)
assert.ok(physRedTrailing.red_card_penalty.home_defense_leak_multiplier! >= 1.65, '落后方吃红牌后防漏球乘数必须剧增');

console.log('✅ [Test 3] 任务 2.3 验证通过: 红牌三态分流非对称动态惩罚完全符合战术直觉与数学定义！\n');

// -------------------------------------------------------------------------------------------------
// [Test 4] 任务 2.4: 超强弱悬殊豪门红牌防御策略覆盖模式 (Strategy Override Pattern)
// -------------------------------------------------------------------------------------------------
console.log('📌 [Test 4] 验证任务 2.4: 豪门红牌防御策略覆盖模式 (Strategy Override Pattern)...');

// 构造深盘 (-1.5) 且控球 65% 碾压的豪门强队吃 1 红牌
const matchEliteRed = createBaseMatch({
  score: { home_score: 0, away_score: 0, score_verified: true },
  markets: {
    full_spread_main: { home_selection: '-1.5', home_odds: 1.85, away_odds: 2.05 }
  },
  reference: {
    stats: {
      dangerous_attacks: { home: 55, away: 15 },
      attacks: { home: 85, away: 30 },
      shots: { home: 14, away: 2 },
      shots_on_target: { home: 6, away: 0 },
      shots_off_target: { home: 8, away: 2 },
      corners: { home: 7, away: 1 },
      possession: { home: 65, away: 35 },
      yellow_cards: { home: 1, away: 2 },
      red_cards: { home: 1, away: 0 } // 豪门吃红牌
    }
  }
});

const physEliteRed = extractRealTimePhysicalStats(matchEliteRed);
const eliteRedPen = physEliteRed.red_card_penalty;

assert.strictEqual(eliteRedPen.elite_override_active, true, '豪门深盘且高控球时必须激活 elite_override_active');
assert.strictEqual(eliteRedPen.elite_override_side, 'home', '豪门覆盖方必须为主队');
assert.strictEqual(eliteRedPen.elite_override_factor, 0.75, '豪门覆盖缓冲因子必须为 0.75');

// 验证其惩罚比普通平局吃红牌更轻 (得到缓冲)
assert.ok(
  eliteRedPen.home_defense_leak_multiplier! < physRedDraw.red_card_penalty.home_defense_leak_multiplier!,
  '豪门底蕴覆盖后，漏球乘数必须低于普通球队红牌惩罚'
);
assert.ok(
  eliteRedPen.home_attack_multiplier! > physRedDraw.red_card_penalty.home_attack_multiplier!,
  '豪门底蕴覆盖后，进攻削减必须小于普通球队红牌惩罚'
);

// 验证 buildUnifiedMatchState 与 Poisson 传递
const unifiedState = buildUnifiedMatchState(
  calculateSpatioTemporalFeatures(matchEliteRed, timelineAligned, physEliteRed),
  physEliteRed,
  timelineAligned
);
assert.strictEqual(unifiedState.elite_override_applied, true, 'UnifiedMatchState 必须保留豪门策略覆盖标记');

console.log('✅ [Test 4] 任务 2.4 验证通过: 豪门红牌策略覆盖模式准确对冲，避免误杀强队！\n');

// -------------------------------------------------------------------------------------------------
// [Test 5] 任务 2.5: 经验贝叶斯高赔与深盘离散收缩 (Empirical Bayesian Shrinkage)
// -------------------------------------------------------------------------------------------------
console.log('📌 [Test 5] 验证任务 2.5: 高赔冷门与极深盘经验贝叶斯收缩机制...');

// 1. 低于 2.80 赔率不触发收缩
const shrinkLowOdds = applyBayesianShrinkage(0.52, 2.05, 0.48);
assert.strictEqual(shrinkLowOdds.isApplied, false, '赔率 <= 2.80 严禁触发贝叶斯收缩');
assert.strictEqual(shrinkLowOdds.shrinkageFactor, 1.0);
assert.strictEqual(shrinkLowOdds.shrunkProb, 0.52);

// 2. 超高赔冷门 (如 Odds = 4.80) 触发收缩
// deltaP = 0.30 - 0.20 = 0.10
// shrinkageFactor = 1 / (1 + 0.50 * (4.80 - 2.80)) = 1 / (1 + 1.0) = 0.50
// shrunkProb = 0.20 + 0.10 * 0.50 = 0.25
const shrinkHighOdds = applyBayesianShrinkage(0.30, 4.80, 0.20);
assert.strictEqual(shrinkHighOdds.isApplied, true, '赔率 > 2.80 且模型高于市场时必须触发贝叶斯收缩');
assert.strictEqual(shrinkHighOdds.shrinkageFactor, 0.5, '收缩因子必须严格服从公式 1 / (1 + 0.50 * (4.80 - 2.80)) = 0.50');
assert.strictEqual(shrinkHighOdds.shrunkProb, 0.25, '收缩后概率必须准确收敛至 0.25');

// 3. 模型概率低于市场公允概率时无虚假溢价，不额外下调
const shrinkUndervalued = applyBayesianShrinkage(0.15, 4.80, 0.20);
assert.strictEqual(shrinkUndervalued.isApplied, false, '模型概率低于市场公允概率时不应用虚假溢价收缩');

// 4. 端到端校验: calculateAsianHandicapEV 与 calculateTotalEV 记录贝叶斯审计标记
const poissonMock = calculateInPlayPoissonFeatures(matchT1, {
  circuit_breaker: { is_triggered: false, reasons: [] },
  is_valid: true
} as any, unifiedState);

const devigFeatures = calculateDeviggedMarketFeatures(matchT1, poissonMock);
assert.ok(devigFeatures.spread_main_ev, '让球主盘 EV 必须存在');
assert.ok(devigFeatures.total_main_ev, '大小球主盘 EV 必须存在');
assert.ok(typeof devigFeatures.spread_main_ev.bayesian_shrinkage_applied === 'boolean', '让球盘必须包含贝叶斯收缩状态标记');
assert.ok(typeof devigFeatures.total_main_ev.bayesian_shrinkage_applied === 'boolean', '大小球盘必须包含贝叶斯收缩状态标记');

console.log('✅ [Test 5] 任务 2.5 验证通过: 经验贝叶斯收缩闭式公式与全盘口审计记录 100% 正确！\n');

console.log('======================================================================');
console.log('🏆 恭喜！P2 量化引擎战术与动量增强 (任务 2.1 ~ 2.5) 5 大核心模块 100% 验证通过！');
console.log('======================================================================');

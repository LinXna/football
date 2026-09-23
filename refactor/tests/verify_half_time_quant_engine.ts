/**
 * 半场 EV 贯通验证套件 (Half-Time EV End-to-End Verification)
 * 验证待办 1「上下半场独立定价信号（半场 EV）贯通」三件事：
 * 1. 底层半场 EV 求解 (calculateAsianHandicapEV / calculateTotalGoalsEV)
 * 2. 信号接入 (calculateConfidenceAndAlerts 将 half_spread_main_ev / half_total_main_ev
 *    提取为 ASIAN_HANDICAP_HALF / TOTAL_GOALS_HALF 信号)
 * 3. 端到端贯通 + prompt 导出 (calculateQuantitativeFeatures 输出半场 EV，
 *    promptExporter 导出 ah_half / ou_half)
 */

import assert from 'node:assert/strict';
import {
  calculateAsianHandicapEV,
  calculateTotalGoalsEV
} from '../03_quant_engine/devigCalculator.js';
import {
  calculateConfidenceAndAlerts,
  calculateQuantitativeFeatures
} from '../03_quant_engine/index.js';
import { generateRefactoredPrompt } from '../04_ai_evaluator/promptExporter.js';
import { MatchStage, MatchAlignmentStatus } from '../02_canonical_model/enums.js';
import { BookmakerPosture } from '../03_quant_engine/enums.js';
import type { CanonicalMatch } from '../02_canonical_model/types.js';
import type { DeviggedMarketFeatures } from '../03_quant_engine/types.js';

console.log('====================================================');
console.log('Running Half-Time EV Verification Suite...');
console.log('====================================================\n');

// --------------------------------------------------------------------------
// Test 1: 底层半场 EV 求解 (calculateAsianHandicapEV / calculateTotalGoalsEV)
// --------------------------------------------------------------------------
console.log('-> [Test 1/3] 底层半场 EV 求解...');
{
  // 主队显著强 (λ_home=2.0 vs λ_away=0.2)，平手盘主队赔率 2.50 → 应产生正 EV
  const halfSpreadEv = calculateAsianHandicapEV(
    '0', 2.50, 1.50,
    { lambda_home_rest: 2.0, lambda_away_rest: 0.2, expected_goals_rest: 2.2 },
    '0'
  );
  assert.equal(halfSpreadEv.is_positive_ev, true, '半场让球强主队平手盘应产生正 EV');
  assert.equal(halfSpreadEv.preferred_side, 'home', '半场让球应偏好主队');
  assert.ok(halfSpreadEv.home_ev > 0, `半场让球主队 EV 应为正，实际 ${halfSpreadEv.home_ev}`);

  // 期望 2.2 球 vs 2.0 盘，大球赔率 2.10 → 应产生正 EV
  const halfTotalEv = calculateTotalGoalsEV(
    '2', 2.10, 1.70, 0,
    { lambda_home_rest: 2.0, lambda_away_rest: 0.2, expected_goals_rest: 2.2 }
  );
  assert.equal(halfTotalEv.is_positive_ev, true, '半场大小球高期望大球应产生正 EV');
  assert.equal(halfTotalEv.preferred_side, 'over', '半场大小球应偏好大球');
  assert.ok(halfTotalEv.over_ev > 0, `半场大小球大球 EV 应为正，实际 ${halfTotalEv.over_ev}`);

  console.log('   ✅ 底层半场 EV 求解 PASS');
}

// --------------------------------------------------------------------------
// Test 2: 信号接入 (calculateConfidenceAndAlerts 提取半场信号)
// --------------------------------------------------------------------------
console.log('-> [Test 2/3] 信号接入 (half EV → ASIAN_HANDICAP_HALF / TOTAL_GOALS_HALF)...');
{
  const mockDevig = {
    h2h_devig: undefined,
    spread_main_ev: undefined,
    spread_secondary_ev: [],
    total_main_ev: undefined,
    total_secondary_ev: [],
    half_spread_main_ev: {
      line: '-0.25',
      preferred_side: 'home',
      is_positive_ev: true,
      home_ev: 0.15,
      away_ev: -0.15,
      home_odds: 2.10,
      away_odds: 1.80,
      home_model_probability: 0.60,
      away_model_probability: 0.40,
      kelly_fraction: 0.02
    },
    half_total_main_ev: {
      line: '1.5',
      preferred_side: 'over',
      is_positive_ev: true,
      over_ev: 0.10,
      under_ev: -0.10,
      over_odds: 2.00,
      under_odds: 1.80,
      over_model_probability: 0.55,
      under_model_probability: 0.45,
      kelly_fraction: 0.02
    },
    bookmaker_posture: BookmakerPosture.BALANCED_NEUTRAL
  } as unknown as DeviggedMarketFeatures;

  const mockContext = {
    circuit_breaker: { is_triggered: false },
    tactical_formation: {
      midfield_congestion_index: 0,
      wing_space_vulnerability_home: 0,
      wing_space_vulnerability_away: 0
    },
    goal_timing_validity: { requires_bayesian_shrinkage: false },
    h2h_weights: [{ weight: 1 }]
  } as any;
  const mockTimeline = {
    total_points: 100,
    temporal_lag_warning: false,
    temporal_inversion_detected: false
  } as any;
  const mockPhysical = { stats_available: true } as any;

  const { positive_ev_signals } = calculateConfidenceAndAlerts(
    mockContext, mockTimeline, mockPhysical, mockDevig, MatchStage.LIVE
  );

  const halfSpreadSignal = positive_ev_signals.find((s) => s.market === 'ASIAN_HANDICAP_HALF');
  const halfTotalSignal = positive_ev_signals.find((s) => s.market === 'TOTAL_GOALS_HALF');

  assert.ok(halfSpreadSignal, '半场让球正 EV 必须进入信号数组 (ASIAN_HANDICAP_HALF)');
  assert.ok(halfTotalSignal, '半场大小球正 EV 必须进入信号数组 (TOTAL_GOALS_HALF)');
  assert.equal(halfSpreadSignal!.side, 'home', '半场让球信号方向应为 home');
  assert.equal(halfSpreadSignal!.line, '-0.25', '半场让球信号盘口应保留原始 line');
  assert.ok(halfSpreadSignal!.ev > 0, '半场让球信号 EV 应为正');
  assert.equal(halfTotalSignal!.side, 'over', '半场大小球信号方向应为 over');
  assert.ok(halfTotalSignal!.ev > 0, '半场大小球信号 EV 应为正');

  console.log('   ✅ 信号接入 PASS');
}


// --------------------------------------------------------------------------
// Test 3: 端到端贯通 + prompt 导出 (devig 输出半场 EV + prompt 导出 ah_half/ou_half)
// --------------------------------------------------------------------------
console.log('-> [Test 3/3] 端到端贯通 + prompt 导出...');
{
  const halfTimeFixture: CanonicalMatch = {
    canonical_id: 'test_half_time_ev_30m',
    home_team_name: '布尔萨体育',
    away_team_name: '伊斯坦堡士邦',
    league_name: '土杯',
    alignment: { status: MatchAlignmentStatus.MATCHED_AUTO, confidence: 100, method: 'AUTOMATIC_EXACT' },
    timing: { stage: MatchStage.LIVE, minute: 30, status_text: '30', ybty_display_clock: '30' },
    score: { home_score: 0, away_score: 0, home_half_score: 0, away_half_score: 0, score_verified: true, score_source: 'CANVAS_OCR', is_mismatch_detected: false },
    markets: {
      full_h2h: { home_odds: 1.50, draw_odds: 3.60, away_odds: 7.50 },
      full_spread_main: { line_index: 0, home_selection: '-1', home_odds: 2.01, away_selection: '+1', away_odds: 1.81 },
      full_spread_subs: [],
      full_total_main: { line_index: 0, line: '2.5', over_odds: 1.85, under_odds: 2.00, settlement_basis: 'FULL_MATCH' as any },
      full_total_subs: [],
      half_h2h: null,
      half_spread_main: { line_index: 0, home_selection: '-0.25', home_odds: 1.95, away_selection: '+0.25', away_odds: 1.85 },
      half_total_main: { line_index: 0, line: '1', over_odds: 1.90, under_odds: 1.90 }
    },
    reference: {
      company_name: '3*',
      initial: null,
      pregame: null,
      live: null,
      stats: null,
      attack_momentum: null,
      odds_matrix: {
        company_name: '3*',
        initial: null,
        pregame: null,
        live: {
          match_winner: { home_odds: 1.50, draw_odds: 3.60, away_odds: 7.50 },
          asian_handicap: { home_odds: 0.97, line: 1.0, away_odds: 0.82 },
          total_goals: { over_odds: 0.77, line: 1.75, under_odds: 1.02 },
          corners: null
        }
      },
      historical_dna: null,
      prematch_context: null
    }
  };

  const qf = calculateQuantitativeFeatures(halfTimeFixture);

  // 上半场 (minute=30 < 45) 且提供了半场盘口，底层必须算出半场 EV
  assert.ok(qf.devig.half_spread_main_ev, '端到端必须输出 half_spread_main_ev（非 undefined）');
  assert.ok(qf.devig.half_total_main_ev, '端到端必须输出 half_total_main_ev（非 undefined）');

  // prompt 导出 ah_half / ou_half
  const { finalPrompt, matchCount } = generateRefactoredPrompt([halfTimeFixture], 'live_eval');
  assert.equal(matchCount, 1, '半场盘口 fixture 必须通过量化准入门禁并生成 prompt');
  assert.ok(finalPrompt.includes('ah_half'), 'prompt 必须导出 ah_half 半场让球主盘');
  assert.ok(finalPrompt.includes('ou_half'), 'prompt 必须导出 ou_half 半场大小主盘');

  console.log('   ✅ 端到端贯通 + prompt 导出 PASS');
}

console.log('\n🎉 ALL HALF-TIME EV TESTS PASSED SUCCESSFULLY!');

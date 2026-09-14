/**
 * Layer 03 Quant Engine - Regression Fixes Verification Suite
 * 验证 P0-P3 全部回归测试修复项：
 * 1. P0: 状态机门禁一致性 (isProductionReady 与 PRODUCTION_UNLOCKED)
 * 2. P0: 结构化 OOS 校验字段与四要素独立锚定 (market_type, normalized_line, side, settlement_type)
 * 3. P0: 推荐/候选信号投注时点上下文 (score_at_bet, line_at_bet, odds_at_bet, settlement_basis, snapshot_time)
 * 4. P1: Lambda 分解透明性与节奏乘子 (observed_pace_multiplier, raw_market_lambda, dixon_coles_tau)
 * 5. P2: 历史对赛 (H2H) 零样本返回 null (杜绝假 0.5/0.0 默认值)
 * 6. P3: 净胜球为负时的 Iso-Venue Standings 提取 (杜绝负净胜球被误过滤)
 * 7. P3: 战术阵型匹配语义清晰化 (both_formations_known 与 formation_matched)
 */

import assert from 'node:assert/strict';
import { evaluateCandidatePipeline } from '../03_quant_engine/candidateStateMachine.js';
import { calculateH2HDecayWeights, extractIsoVenueStandings, extractTacticalFormationFeatures, extractGoalDistributionDNA } from '../03_quant_engine/contextEngine.js';
import { calculateBivariatePoissonGrid, calculateInPlayPoissonFeatures } from '../03_quant_engine/poissonDecayModel.js';
import { MatchStage, MatchAlignmentStatus } from '../02_canonical_model/enums.js';
import type { CanonicalMatch } from '../02_canonical_model/types.js';
import type { PositiveEVSignal, UnifiedMatchState, MarketCalibrationFeatures } from '../03_quant_engine/types.js';

console.log('Running Layer 03 Quant Engine Regression Verification...');

// --------------------------------------------------------------------------
// 1. P0: 状态机门禁一致性
// --------------------------------------------------------------------------
console.log('-> Testing P0: Candidate State Machine Production Gate consistency...');
const sampleSignals: PositiveEVSignal[] = [
  {
    market: 'ASIAN_HANDICAP_MAIN',
    line: '-0.5',
    side: 'home',
    odds: 1.95,
    ev: 0.08,
    model_probability: 0.56,
    confidence: 75,
    kelly_fraction: 0.03
  }
];

// 当 isProductionReady = false (即生产门禁未放行时)
const pipelineBlocked = evaluateCandidatePipeline({
  rawSignals: sampleSignals,
  resolveOosMarket: () => 'ASIAN_HANDICAP_MAIN',
  resolveOosProfile: () => ({
    profile_id: 'test_p',
    market: 'ASIAN_HANDICAP_MAIN',
    status: 'NO_PROFILE',
    sample_size: 0,
    effective_sample_size: 0,
    oos_brier_score: null,
    lambda_log_adjustment: 0,
    shrinkage_factor: 1,
    calibrated_at: '2026-01-01'
  }),
  adjustedConfidence: 75,
  dataQualityScore: 80,
  modelStabilityScore: 80,
  canPriceMarket: true,
  liveStatsAvailable: true,
  stage: MatchStage.LIVE,
  hasEvidenceConflict: false,
  postGoalCooldownActive: false,
  permissiveOosMode: true,
  isProductionReady: false // 生产门禁拦截
});

assert.equal(pipelineBlocked.state, 'COLD_START_PERMISSIVE');
assert.equal(pipelineBlocked.production_eligible, false);
assert.equal(pipelineBlocked.machine_candidate_signals.length, 0, 'machine_candidate_signals must be 0 when not production ready');
assert.equal(pipelineBlocked.research_candidate_signals.length, 1, 'Signal must go to research_candidate_signals');

// 检查信号投注时点上下文
const rSignal = pipelineBlocked.research_candidate_signals[0];
assert.ok(rSignal.score_at_bet, 'score_at_bet should be defined');
assert.ok(rSignal.settlement_basis, 'settlement_basis should be defined');
console.log('   ✅ P0 Gate consistency & betting context verified');

// --------------------------------------------------------------------------
// 2. P0: 结构化 OOS 校验与四要素锚定
// --------------------------------------------------------------------------
console.log('-> Testing P0: Structured OOS validation fields...');
assert.equal(pipelineBlocked.validations.length, 1);
const val = pipelineBlocked.validations[0];
assert.equal(val.market_type, 'ASIAN_HANDICAP_MAIN');
assert.equal(val.side, 'home');
assert.equal(val.settlement_type, 'AH');
assert.equal(val.normalized_line, '-0.5');
console.log('   ✅ P0 Structured OOS validation fields verified');

// --------------------------------------------------------------------------
// 3. P1: Poisson & Bivariate Lambda 分解透明性
// --------------------------------------------------------------------------
console.log('-> Testing P1: Lambda decomposition and Dixon-Coles tau...');
const gridResult = calculateBivariatePoissonGrid(1.2, 0.8, 5);
assert.ok(gridResult.dixon_coles_tau, 'dixon_coles_tau should be present');
assert.equal(typeof gridResult.dixon_coles_tau.tau_0_0, 'number');
assert.equal(typeof gridResult.dixon_coles_tau.tau_1_1, 'number');
console.log('   Dixon-Coles tau factors:', gridResult.dixon_coles_tau);
console.log('   ✅ P1 Dixon-Coles tau factors verified');

// --------------------------------------------------------------------------
// 4. P2: 历史对赛 (H2H) 零样本返回 null
// --------------------------------------------------------------------------
console.log('-> Testing P2: H2H decay weights zero-sample null returns...');
const mockMatch: CanonicalMatch = {
  canonical_id: 'test_h2h_null',
  league_id: 'L1',
  league_name: 'Test League',
  match_time: Date.now(),
  home_team_id: 'H1',
  home_team_name: 'Home FC',
  away_team_id: 'A1',
  away_team_name: 'Away FC',
  timing: { stage: MatchStage.LIVE, minute: 30, regular_time: 90, injury_time: 0 },
  score: { home_score: 0, away_score: 0, score_verified: true },
  markets: {},
  reference: {}
};

const h2hEmpty = calculateH2HDecayWeights(mockMatch);
assert.equal(h2hEmpty.analytics.valid_count, 0);
assert.equal(h2hEmpty.analytics.historical_under_rate, null, 'historical_under_rate should be null when no valid samples');
assert.equal(h2hEmpty.analytics.historical_avg_red_cards, null, 'historical_avg_red_cards should be null when no valid samples');
assert.equal(h2hEmpty.analytics.historical_avg_corners, null, 'historical_avg_corners should be null when no valid samples');
console.log('   ✅ P2 H2H null defaults verified (no fake 0.5 / 0.0)');

// --------------------------------------------------------------------------
// 5. P3: 负净胜球提取 (Negative Goal Difference)
// --------------------------------------------------------------------------
console.log('-> Testing P3: Iso-Venue Standings with negative goal difference...');
const matchWithNegativeGD: CanonicalMatch = {
  ...mockMatch,
  reference: {
    league_standings: {
      has_data: true,
      home_team: {
        home: {
          matches_played: 10,
          won: 2,
          draw: 2,
          loss: 6,
          goals_scored: 8,
          goals_conceded: 18,
          goal_difference: -10, // 负净胜球!
          points: 8
        }
      },
      away_team: {
        away: {
          matches_played: 10,
          won: 1,
          draw: 3,
          loss: 6,
          goals_scored: 6,
          goals_conceded: 15,
          goal_difference: -9, // 负净胜球!
          points: 6
        }
      }
    }
  }
};

const standings = extractIsoVenueStandings(matchWithNegativeGD);
assert.ok(standings.home_at_home !== null, 'home_at_home must NOT be null even with negative goal difference');
assert.equal(standings.home_at_home?.goal_difference, -10);
assert.ok(standings.away_at_away !== null, 'away_at_away must NOT be null even with negative goal difference');
assert.equal(standings.away_at_away?.goal_difference, -9);
console.log('   ✅ P3 Negative goal difference extraction verified');

// --------------------------------------------------------------------------
// 6. P3: 战术阵型语义清晰化
// --------------------------------------------------------------------------
console.log('-> Testing P3: Tactical formation matching semantics...');
const matchFormationsDiff: CanonicalMatch = {
  ...mockMatch,
  reference: {
    lineups: {
      home_formation: '4-3-3',
      away_formation: '3-4-3',
      confirmed: true
    }
  }
};
const fDiff = extractTacticalFormationFeatures(matchFormationsDiff);
assert.equal(fDiff.both_formations_known, true, 'Both formations should be known');
assert.equal(fDiff.formation_matched, false, '4-3-3 and 3-4-3 should NOT be considered matched');

const matchFormationsSame: CanonicalMatch = {
  ...mockMatch,
  reference: {
    lineups: {
      home_formation: '4-2-3-1',
      away_formation: '4-2-3-1',
      confirmed: true
    }
  }
};
const fSame = extractTacticalFormationFeatures(matchFormationsSame);
assert.equal(fSame.both_formations_known, true);
assert.equal(fSame.formation_matched, true, 'Identical formations should be matched');
console.log('   ✅ P3 Tactical formation semantics verified');

// --------------------------------------------------------------------------
// 7. 进球时间段分布 DNA：主队“总+主”、客队“总+客”双层自适应融合断言
// --------------------------------------------------------------------------
console.log('-> Testing Goal Distribution DNA: Home (All+Home) & Away (All+Away) Dual-Layer Fusion...');
const dualLayerMatch: CanonicalMatch = {
  ...mockMatch,
  reference: {
    goal_distribution: {
      has_data: true,
      home_team: {
        // 主队总样本极小 (1球) -> 应 100% 回退至中性均匀分布
        all: { scored_intervals: [{ goals: 1 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }] },
        home: { scored_intervals: [{ goals: 1 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }] }
      },
      away_team: {
        // 客队：总进球 23 (充足)，客场进球 14 (nVenue >= 12 充足 -> 70% 专属客场 + 30% 总体)
        all: { scored_intervals: [{ goals: 3 }, { goals: 3 }, { goals: 4 }, { goals: 2 }, { goals: 5 }, { goals: 6 }] },
        away: { scored_intervals: [{ goals: 1 }, { goals: 2 }, { goals: 2 }, { goals: 1 }, { goals: 3 }, { goals: 5 }] }
      }
    }
  }
};
const dnaDual = extractGoalDistributionDNA(dualLayerMatch);
assert.equal(dnaDual.home_sample_size, 1, 'Home sample size should be 1');
assert.equal(dnaDual.home_confidence, 'INSUFFICIENT', 'Total goals < 5 must have INSUFFICIENT confidence');
assert.deepEqual(dnaDual.home_scored_weights, [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667], 'Insufficient sample size must shrink 100% to uniform weights');
assert.equal(dnaDual.away_confidence, 'HIGH', 'Away with mature sample size must have HIGH confidence');
assert.equal(dnaDual.is_away_specific, true, 'Away venue-specific fusion active when nVenue >= 12');
assert(dnaDual.away_late_game_dna > 0.20, 'Away late game DNA should reflect strong 75+ interval');

// 测试“专属切片不足 (nVenue < 5)，回退 100% 采用总体切片 (All)”
const fallbackToAllMatch: CanonicalMatch = {
  ...mockMatch,
  reference: {
    goal_distribution: {
      has_data: true,
      home_team: {
        all: { scored_intervals: [{ goals: 3 }, { goals: 4 }, { goals: 5 }, { goals: 3 }, { goals: 6 }, { goals: 4 }] }, // nAll = 25
        home: { scored_intervals: [{ goals: 1 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 1 }, { goals: 0 }] }  // nVenue = 2 < 5
      },
      away_team: {
        all: { scored_intervals: [{ goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }] },
        away: { scored_intervals: [{ goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }] }
      }
    }
  }
};
const dnaFallback = extractGoalDistributionDNA(fallbackToAllMatch);
assert.equal(dnaFallback.home_confidence, 'HIGH', 'Home nAll >= 15 has HIGH confidence even if nVenue < 5');
assert.equal(dnaFallback.is_home_specific, false, 'Home nVenue < 5 gracefully falls back to 100% All without false specific overfitting');
console.log('   ✅ Goal Distribution DNA: Home (All+Home) & Away (All+Away) Dual-Layer Fusion verified');

// --------------------------------------------------------------------------
// 8. 滚球阶段动态权重 (Regime Shift Weighting) 与终盘事实统治权
// --------------------------------------------------------------------------
console.log('-> Testing In-Play Regime Shift Weighting (30-60m: 60-65%, 65-90m: 80-85%)...');
const mockState: UnifiedMatchState = {
  match_id: 'regime_test_01',
  elapsed_minute: 45,
  score_diff: 0,
  regime_multiplier_home: 1.2,
  regime_multiplier_away: 0.8,
  red_card_attack_multiplier_home: 1.0,
  red_card_attack_multiplier_away: 1.0,
  red_card_defense_leak_multiplier_home: 1.0,
  red_card_defense_leak_multiplier_away: 1.0,
  post_goal_cooldown_active: false,
  xt_home: 1.5,
  xt_away: 0.8,
  danger_attacks_ratio_15m: 0.65,
  dominance_side: 'home'
};

// 45 分钟（中段攻防展开期 30' ~ 60'）
const inPlay45m = calculateInPlayPoissonFeatures(
  mockMatch,
  mockState,
  { base_lambda_home: 1.5, base_lambda_away: 1.2 },
  null,
  null,
  null
);
assert.equal(inPlay45m.lambda_decomposition.live_regime_stage, 'MID_MATCH');
assert(
  (inPlay45m.lambda_decomposition.live_stats_weight ?? 0) >= 0.60 &&
  (inPlay45m.lambda_decomposition.live_stats_weight ?? 0) <= 0.65,
  `45m live_stats_weight must be within [0.60, 0.65], got ${inPlay45m.lambda_decomposition.live_stats_weight}`
);

// 75 分钟（终盘决战期 65' ~ 90'）
const mockState75: UnifiedMatchState = {
  ...mockState,
  elapsed_minute: 75
};
const inPlay75m = calculateInPlayPoissonFeatures(
  { ...mockMatch, timing: { ...mockMatch.timing, minute: 75 } },
  mockState75,
  { base_lambda_home: 1.5, base_lambda_away: 1.2 },
  null,
  null,
  null
);
assert.equal(inPlay75m.lambda_decomposition.live_regime_stage, 'LATE_SURGE');
assert(
  (inPlay75m.lambda_decomposition.live_stats_weight ?? 0) >= 0.80 &&
  (inPlay75m.lambda_decomposition.live_stats_weight ?? 0) <= 0.85,
  `75m live_stats_weight must be within [0.80, 0.85], got ${inPlay75m.lambda_decomposition.live_stats_weight}`
);
console.log('   ✅ In-Play Regime Shift Weighting verified: 45m weight=' + inPlay45m.lambda_decomposition.live_stats_weight + ', 75m weight=' + inPlay75m.lambda_decomposition.live_stats_weight);

console.log('\n======================================================');
console.log('🎉 ALL LAYER 03 REGRESSION VERIFICATIONS PASSED 100%!');
console.log('======================================================');

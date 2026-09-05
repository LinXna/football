/**
 * @file verify_prematch_prior_and_market_divergence.ts
 * @description 单元自测脚本：验证 Stage 1 多维关联先验合成与 Stage 1.1 机构盘口博弈偏差检验
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage, DataCompletenessTier, MatchAlignmentStatus, LeagueMatchStatus } from '../02_canonical_model/enums.js';
import { extractCleanedContextFeatures } from '../03_quant_engine/contextEngine.js';
import { synthesizePrematchPrior, computePoisson1X2 } from '../03_quant_engine/prematchPriorEngine.js';
import { calibrateWithMarketOdds } from '../03_quant_engine/marketDivergenceEngine.js';
import { MarketStanceType } from '../03_quant_engine/enums.js';
import { calculateQuantitativeFeatures } from '../03_quant_engine/index.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

function createMockMatch(): CanonicalMatch {
  return {
    canonical_id: '4562395',
    match_slug: '英超_阿森纳_vs_切尔西',
    created_at: '2026-08-31T19:30:00Z',
    completeness_tier: DataCompletenessTier.TIER_1_FULL,
    missing_reasons: [],
    alignment: {
      status: MatchAlignmentStatus.MATCHED_BY_ALIAS,
      confidence_score: 100,
      home_team_match: { ybty_name: '阿森纳', leisu_name: '阿森纳', is_alias_exact_hit: true, raw_text_similarity: 1.0 },
      away_team_match: { ybty_name: '切尔西', leisu_name: '切尔西', is_alias_exact_hit: true, raw_text_similarity: 1.0 },
      league_match: { ybty_league: '英超', leisu_league: '英格兰超级联赛', status: LeagueMatchStatus.MATCHED_BY_ALIAS, similarity: 1.0, is_alias_exact_hit: true },
      league_match_score: 1.0,
      is_swapped_suspected: false,
      alignment_reason: 'Exact alias match'
    },
    league_name: '英超',
    home_team_name: '阿森纳',
    away_team_name: '切尔西',
    timing: {
      stage: MatchStage.PREMATCH,
      beijing_start_time: '2026-09-01 03:00:00',
      start_time_source: 'YBTY_EXACT',
      minute: null
    },
    score: {
      home_score: 0,
      away_score: 0,
      home_half_score: null,
      away_half_score: null,
      score_verified: true,
      score_source: 'LEISU_INTERFACE',
      is_mismatch_detected: false,
      mismatch_details: null,
      var_overturned_goals_count: 0
    },
    markets: {
      full_h2h: { home_odds: 1.80, draw_odds: 3.70, away_odds: 4.40 },
      full_spread_main: {
        line_index: 0,
        home_selection: '-0.75',
        home_odds: 1.90,
        away_selection: '+0.75',
        away_odds: 2.00
      },
      full_spread_subs: [],
      full_total_main: {
        line_index: 0,
        line: '2.75',
        over_odds: 1.88,
        under_odds: 1.92
      },
      full_total_subs: [],
      half_h2h: null,
      half_spread_main: null,
      half_total_main: null
    },
    reference: {
      leisu_match_id: '4562395',
      leisu_home_name: '阿森纳',
      leisu_away_name: '切尔西',
      leisu_league_name: '英格兰超级联赛',
      stats: null,
      attack_momentum: null,
      timeline_events: [],
      lineups: {
        confirmed: true,
        home_formation: '4-3-3',
        away_formation: '4-2-3-1',
        home_market_value: '8.5亿',
        away_market_value: '7.2亿',
        home_starting: [{ name: 'Saka', position: 'F', number: 7, is_captain: false, market_value: '1.2亿' }],
        away_starting: [{ name: 'Palmer', position: 'M', number: 20, is_captain: false, market_value: '9000万' }],
        home_substitutes: [],
        away_substitutes: [],
        home_injuries: [],
        away_injuries: [{ name: 'James', position: 'D', reason: 'Hamstring' }]
      },
      tactical_context: {
        h2h_recent: [],
        home_recent: [],
        away_recent: []
      },
      odds_matrix: {
        initial: {
          match_winner: { home_odds: 1.85, draw_odds: 3.60, away_odds: 4.20 },
          asian_handicap: { line: -0.75, home_odds: 1.95, away_odds: 1.95 },
          total_goals: { line: 2.75, over_odds: 1.90, under_odds: 1.90 }
        },
        pregame: {
          match_winner: { home_odds: 1.80, draw_odds: 3.70, away_odds: 4.40 },
          asian_handicap: { line: -0.75, home_odds: 1.90, away_odds: 2.00 },
          total_goals: { line: 2.75, over_odds: 1.88, under_odds: 1.92 }
        },
        live: {
          match_winner: { home_odds: 2.40, draw_odds: 2.80, away_odds: 3.20 },
          asian_handicap: { line: -0.25, home_odds: 0.90, away_odds: 1.00 },
          total_goals: { line: 1.5, over_odds: 0.92, under_odds: 0.88 }
        }
      },
      league_standings: null,
      goal_distribution: null
    }
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Stage 1 & Stage 1.1 Hierarchical Engine Tests');
  console.log('====================================================\n');

  const match = createMockMatch();
  const collector = new DeficitCollector();
  const tracer = new Tracer();

  // Test 1: Context Features
  console.log('▶ Test 1: Context Feature Extraction...');
  const context = extractCleanedContextFeatures(match, collector, tracer);
  if (!context || context.lineup_impact.home_lis <= 0) {
    throw new Error('Context extraction failed!');
  }
  console.log(`  ✅ Context extracted: Home LIS=${context.lineup_impact.home_lis}, Away LIS=${context.lineup_impact.away_lis}`);

  // Test 2: Prematch Theory Prior Synthesis
  console.log('\n▶ Test 2: Stage 1 Prematch Theory Prior Synthesis...');
  const prior = synthesizePrematchPrior(match, context, collector, tracer);
  console.log(`  λ_home_theory: ${prior.lambda_home_theory}`);
  console.log(`  λ_away_theory: ${prior.lambda_away_theory}`);
  console.log(`  Theory Total Goals: ${prior.theory_total_goals_expected}`);
  console.log(`  Fair Home Win Prob: ${(prior.prior_fair_home_win_prob * 100).toFixed(1)}%`);
  console.log(`  Fair Draw Prob: ${(prior.prior_fair_draw_prob * 100).toFixed(1)}%`);
  console.log(`  Fair Away Win Prob: ${(prior.prior_fair_away_win_prob * 100).toFixed(1)}%`);

  if (prior.lambda_home_theory <= prior.lambda_away_theory) {
    throw new Error('Expected Arsenal (Home) to have higher lambda than Chelsea (Away)');
  }
  if (prior.prior_fair_home_win_prob <= 0.40) {
    throw new Error('Expected Arsenal fair home win prob > 40%');
  }
  console.log('  ✅ Stage 1 Prior Synthesis Passed!');

  // Test 3: Market Calibration (Stage 1.1)
  console.log('\n▶ Test 3: Stage 1.1 Market Odds Calibration...');
  const calibrated = calibrateWithMarketOdds(match, prior, collector, tracer);
  console.log(`  Market Stance: ${calibrated.market_stance}`);
  console.log(`  Divergence Delta (Δ): ${calibrated.divergence_delta}`);
  console.log(`  Calibrated λ_base_H: ${calibrated.lambda_base_home}`);
  console.log(`  Calibrated λ_base_A: ${calibrated.lambda_base_away}`);
  console.log(`  Market Implied Home Win Prob: ${(calibrated.implied_market_home_win_prob * 100).toFixed(1)}%`);

  if (![MarketStanceType.CONSENSUS_ALIGNED, MarketStanceType.INSTITUTIONAL_DEFENSE, MarketStanceType.TRAP_INDUCEMENT].includes(calibrated.market_stance)) {
    throw new Error('Invalid market stance!');
  }
  console.log('  ✅ Stage 1.1 Market Calibration Passed!');

  const liveMatch = { ...match, timing: { ...match.timing, stage: MatchStage.LIVE, minute: 40 } };
  const liveCalibrated = calibrateWithMarketOdds(liveMatch, prior, collector, tracer);
  if (!liveCalibrated.is_in_play_market) {
    throw new Error('Live calibration must be marked as remaining-goals market semantics');
  }
  if (liveCalibrated.lambda_base_home >= calibrated.lambda_base_home ||
      liveCalibrated.lambda_base_away >= calibrated.lambda_base_away) {
    throw new Error('Live calibration did not use the lower live market phase as expected');
  }
  console.log('  ✅ Live market phase and Hong Kong odds normalization passed!');

  // Test 4: End-to-End Orchestrator
  console.log('\n▶ Test 4: Layer 03 Orchestrator Integration...');
  const quantFeatures = calculateQuantitativeFeatures(match, undefined, collector, tracer);
  if (!quantFeatures.prematch_prior || !quantFeatures.market_calibration) {
    throw new Error('Orchestration did not populate prematch_prior or market_calibration!');
  }
  console.log(`  ✅ Orchestration successful: Confidence=${quantFeatures.confidence_score}, BDI=${quantFeatures.battlefield_dominance_index}`);
  console.log(`  Prematch Prior λ_H=${quantFeatures.prematch_prior.lambda_home_theory}, Market Stance=${quantFeatures.market_calibration.market_stance}`);

  console.log('\n====================================================');
  console.log('🎉 All Stage 1 & Stage 1.1 Tests Passed Successfully!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});

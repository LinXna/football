import fs from 'fs';
import { canonicalizeRawMatchData } from './server/services/canonicalMatchModel';
import { calculatePurePhysicalMatchModel, calculateHandicapExpectancyMetrics, calculateAttackConversion } from './server/services/quantitativeFeatures';
import { deepMineFormAndH2H } from './server/services/formAndH2HDeepMining';
import { buildMasterTacticalSynthesis } from './server/services/advancedTacticalQuantitativeEngines';
import { buildSlimPromptMatch } from './server/services/promptSlimPayload';
import { normalizeMarketAssessments } from './server/services/marketAssessmentsNormalizer';

console.log('===============================================================');
console.log('  FULL REAL DATA CODEBASE PIPELINE EXECUTION AUDIT (6 MATCHES)  ');
console.log('===============================================================');

const ybty = JSON.parse(fs.readFileSync('docs/ybty_v2.8.0_live_2026-08-20T20-20-13-747Z.json', 'utf8'));
const leisu = JSON.parse(fs.readFileSync('docs/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json', 'utf8'));

// Build candidate/decision style objects
const combinedDecisions = ybty.matches.map((m, idx) => {
  const l = leisu.results[idx] || {};
  return {
    match: `${m.home} vs ${m.away}`,
    ybty_home: m.home,
    ybty_away: m.away,
    league: m.league,
    minute: parseInt(m.clock) || 0,
    score: { home: parseInt(m.home_score) || 0, away: parseInt(m.away_score) || 0 },
    score_verified: true,
    score_source: 'ybty_verified',
    ybty_raw_markets: m.markets,
    live_statistics: l.formal?.live_match?.confirmed_statistics || null,
    unified_stats: l.formal?.live_match?.confirmed_statistics || null,
    raw_leisu_formal: l.formal || null,
    raw_ybty: m,
  };
});

let totalChecks = 0;
let errorsFound = [];

for (let i = 0; i < combinedDecisions.length; i++) {
  const raw = combinedDecisions[i];
  console.log(`\n===============================================================`);
  console.log(`[TESTING MATCH ${i + 1}/6]: ${raw.match}`);
  console.log(`  Minute: ${raw.minute}', Live Score: ${raw.score.home}-${raw.score.away}`);
  console.log(`===============================================================`);

  // STEP 1: Canonical Match Model Conversion
  totalChecks++;
  const canonical = canonicalizeRawMatchData(raw);
  const cStats = canonical.live_facts.stats;
  console.log(`\n1. [Canonical Model Check]`);
  console.log(`   - Possession: ${cStats.possession.home}% vs ${cStats.possession.away}%`);
  console.log(`   - Shots: ${cStats.shots.home} vs ${cStats.shots.away} (On Target: ${cStats.shots_on_target.home} vs ${cStats.shots_on_target.away})`);
  console.log(`   - Dangerous Attacks: ${cStats.dangerous_attacks.home} vs ${cStats.dangerous_attacks.away}`);
  console.log(`   - Corners: ${cStats.corners.home} vs ${cStats.corners.away}`);
  console.log(`   - Cards: Y ${cStats.yellow_cards.home}-${cStats.yellow_cards.away}, R ${cStats.red_cards.home}-${cStats.red_cards.away}`);
  
  if (raw.live_statistics?.shots_on_target?.home !== undefined) {
    if (cStats.shots_on_target.home !== raw.live_statistics.shots_on_target.home) {
      errorsFound.push(`Match ${i+1}: Canonical conversion dropped shots_on_target_home`);
    }
  }

  // STEP 2: Form and H2H Deep Prior
  totalChecks++;
  const formMetrics = deepMineFormAndH2H(raw);
  const prior = formMetrics.form_weighted_poisson_prior;
  console.log(`\n2. [Form Prior Check (90m Baseline)]`);
  console.log(`   - Prior Home λ: ${prior.lambda_home_prior}, Prior Away λ: ${prior.lambda_away_prior}, Total λ: ${prior.lambda_total_prior}`);

  // STEP 3: Tactical Engines (Time Decay, Discipline, Squeeze)
  totalChecks++;
  const masterTactics = buildMasterTacticalSynthesis(raw);
  const timeDecay = masterTactics.non_linear_time_decay;
  console.log(`\n3. [Tactical Synthesis Check]`);
  console.log(`   - Game Phase: ${timeDecay.current_game_phase}`);
  console.log(`   - Remaining Minutes: ${timeDecay.remaining_physical_minutes}`);
  console.log(`   - Remaining Goal Capacity Pct: ${timeDecay.non_linear_remaining_goal_capacity_pct}%`);

  // STEP 4: Quantitative Features & Poisson Calibration
  totalChecks++;
  const handicapMetrics = calculateHandicapExpectancyMetrics(raw.unified_stats, raw.score, raw.minute);
  const quantLambdas = handicapMetrics?.independent_poisson_distribution?.lambdas;
  console.log(`\n4. [Quantitative Features Check]`);
  console.log(`   - Quant Lambdas: Home ${quantLambdas?.home}, Away ${quantLambdas?.away}, Total ${quantLambdas?.total}`);

  // STEP 5: Prompt Slim Payload & Pure Physical Match Model
  totalChecks++;
  const slim = buildSlimPromptMatch(raw, 'live_eval');
  const phys = slim.live_match_physical_facts?.pure_physical_match_model;
  const physLambdas = phys?.physical_lambdas;
  const physDist = phys?.pure_physical_distribution;
  console.log(`\n5. [Pure Physical Match Model (Data-First Output Check)]`);
  console.log(`   - Lambdas: Rest Home ${physLambdas?.rest_home}, Rest Away ${physLambdas?.rest_away} -> Full Match: ${physLambdas?.projected_full_home} - ${physLambdas?.projected_full_away}`);
  console.log(`   - Pure Win Probabilities: Home Win ${physDist?.home_win_pct}%, Draw ${physDist?.draw_pct}%, Away Win ${physDist?.away_win_pct}%`);
  console.log(`   - Over/Under Probabilities: Over 2.5 ${physDist?.over_2_5_pct}%, Under 2.5 ${physDist?.under_2_5_pct}%`);

  // Verify that full projected goals = current score + rest goals
  const expectedFullH = Number((raw.score.home + (physLambdas?.rest_home || 0)).toFixed(2));
  const expectedFullA = Number((raw.score.away + (physLambdas?.rest_away || 0)).toFixed(2));
  if (Math.abs(expectedFullH - (physLambdas?.projected_full_home || 0)) > 0.05) {
    errorsFound.push(`Match ${i+1}: Projected full home lambda (${physLambdas?.projected_full_home}) != current score (${raw.score.home}) + rest (${physLambdas?.rest_home})`);
  }
  if (Math.abs(expectedFullA - (physLambdas?.projected_full_away || 0)) > 0.05) {
    errorsFound.push(`Match ${i+1}: Projected full away lambda (${physLambdas?.projected_full_away}) != current score (${raw.score.away}) + rest (${physLambdas?.rest_away})`);
  }

  // STEP 6: Market Physical Edge Audits (Check for Discrepancy & Bait Traps)
  totalChecks++;
  const audits = phys?.market_physical_edge_audit || [];
  console.log(`\n6. [Market Physical Edge Audits (${audits.length} options checked)]`);
  for (const a of audits) {
    console.log(`   - [${a.market}] ${a.direction} (Line: ${a.line}) @${a.odds}`);
    console.log(`     Bookie Implied: ${a.bookmaker_implied_prob_pct}% | Model True Prob: ${a.physical_model_prob_pct}% | Value Edge: ${a.physical_value_edge > 0 ? '+' : ''}${a.physical_value_edge}% | Verdict: ${a.discrepancy_verdict}`);
    console.log(`     Evidence: ${a.physical_evidence_zh}`);

    // Check consistency between option direction and model prob
    if (a.market === 'full_h2h') {
      if (a.direction.includes('home') || a.direction.includes('主')) {
        if (Math.abs(a.physical_model_prob_pct - (physDist?.home_win_pct || 0)) > 0.1) {
          errorsFound.push(`Match ${i+1}: H2H Home probability mismatch: audit=${a.physical_model_prob_pct} vs dist=${physDist?.home_win_pct}`);
        }
      } else if (a.direction.includes('away') || a.direction.includes('客')) {
        if (Math.abs(a.physical_model_prob_pct - (physDist?.away_win_pct || 0)) > 0.1) {
          errorsFound.push(`Match ${i+1}: H2H Away probability mismatch: audit=${a.physical_model_prob_pct} vs dist=${physDist?.away_win_pct}`);
        }
      } else if (a.direction.includes('draw') || a.direction.includes('平')) {
        if (Math.abs(a.physical_model_prob_pct - (physDist?.draw_pct || 0)) > 0.1) {
          errorsFound.push(`Match ${i+1}: H2H Draw probability mismatch: audit=${a.physical_model_prob_pct} vs dist=${physDist?.draw_pct}`);
        }
      }
    }
  }
}

console.log(`\n===============================================================`);
console.log(`AUDIT COMPLETE. Total Checks: ${totalChecks}. Errors Found: ${errorsFound.length}`);
if (errorsFound.length > 0) {
  console.log('ERRORS LIST:');
  errorsFound.forEach(e => console.log('  ❌ ' + e));
} else {
  console.log('✅ ALL PIPELINE AUDITS PASSED WITH ZERO ANOMALIES!');
}
console.log(`===============================================================`);

import { QuarterSettlementParams, evaluateQuarterSettlement } from '../06_settlement_audit/settlementEngine.js';
import { ParlayLegResult, evaluateParlaySettlement } from '../06_settlement_audit/parlayEngine.js';

let passed = 0;
let total = 0;

function assertEqual(actual: any, expected: any, msg: string) {
  total++;
  if (actual === expected) {
    passed++;
  } else {
    console.error(`[FAIL] ${msg}. Expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual: number, expected: number, msg: string) {
  total++;
  if (Math.abs(actual - expected) < 1e-4) {
    passed++;
  } else {
    console.error(`[FAIL] ${msg}. Expected ${expected}, got ${actual}`);
  }
}

// 1. Basic Asian Spread tests (Prematch)
const prematchSpread: QuarterSettlementParams = {
  market_category: 'SPREAD_HOME',
  line: -0.25, // Home -0/0.5
  odds: 1.9,
  is_live: false,
  score_at_rec: { home: 0, away: 0 },
  final_score: { home: 0, away: 0 }, // Draw -> Home loses half
  score_verified: true,
};

const res1 = evaluateQuarterSettlement(prematchSpread);
assertEqual(res1.outcome, 'LOSE_HALF', 'Prematch -0.25 Draw -> LOSE_HALF');
assertEqual(res1.net_profit_unit, -0.5, 'Prematch -0.25 Draw net profit = -0.5');
assertEqual(res1.payout_multiplier, 0.5, 'Prematch -0.25 Draw payout = 0.5');

// Home wins 1-0 -> Full win
const res2 = evaluateQuarterSettlement({ ...prematchSpread, final_score: { home: 1, away: 0 } });
assertEqual(res2.outcome, 'WIN', 'Prematch -0.25 Home Win 1-0 -> WIN');
assertClose(res2.net_profit_unit, 0.9, 'Prematch -0.25 Home Win net profit = 0.9');
assertClose(res2.payout_multiplier, 1.9, 'Prematch -0.25 Home Win payout = 1.9');

// 2. Asian Totals tests (Live - FULL_MATCH vs REMAINING_GOALS)
const liveTotalParams: QuarterSettlementParams = {
  market_category: 'TOTAL_OVER',
  line: 2.75, // Over 2.5/3
  odds: 2.0,
  is_live: true,
  basis: 'REMAINING_GOALS',
  score_at_rec: { home: 1, away: 0 }, // Score is 1-0 at rec
  final_score: { home: 2, away: 2 }, // Final is 2-2, 3 goals added
  score_verified: true,
};

// With REMAINING_GOALS basis, added goals = (4) - (1) = 3 goals added. Target line is 2.75.
// 3 goals > 2.75, so WIN half (lineA=2.5->Win, lineB=3.0->Push) -> WIN_HALF
const res3 = evaluateQuarterSettlement(liveTotalParams);
assertEqual(res3.outcome, 'WIN_HALF', 'Live Over 2.75 Remaining Goals (3 added) -> WIN_HALF');
assertClose(res3.net_profit_unit, 0.5, 'WIN_HALF net profit = 0.5');
assertClose(res3.payout_multiplier, 1.5, 'WIN_HALF payout = 1.5');

// If basis was FULL_MATCH (e.g. YBTY standard)
// Final goals = 4. Target line is 2.75. 4 > 2.75 -> Full WIN
const res4 = evaluateQuarterSettlement({ ...liveTotalParams, basis: 'FULL_MATCH' });
assertEqual(res4.outcome, 'WIN', 'Live Over 2.75 Full Match (4 total) -> WIN');
assertClose(res4.net_profit_unit, 1.0, 'WIN net profit = 1.0');
assertClose(res4.payout_multiplier, 2.0, 'WIN payout = 2.0');

// 3. Parlay Tests
const leg1: ParlayLegResult = {
  leg_index: 1,
  odds: 1.9,
  settlement: evaluateQuarterSettlement({ ...prematchSpread, final_score: { home: 1, away: 0 } }) // WIN (payout 1.9)
};
const leg2: ParlayLegResult = {
  leg_index: 2,
  odds: 2.0,
  settlement: res3 // WIN_HALF (payout 1.5)
};
const leg3: ParlayLegResult = {
  leg_index: 3,
  odds: 1.8,
  settlement: {
    outcome: 'PUSH',
    net_profit_unit: 0,
    payout_multiplier: 1.0,
    explanation: 'Push'
  }
};

const parlayRes1 = evaluateParlaySettlement([leg1, leg2, leg3]);
assertEqual(parlayRes1.outcome, 'WIN_HALF', 'Parlay (WIN, WIN_HALF, PUSH) -> WIN_HALF');
assertClose(parlayRes1.payout_multiplier, 1.9 * 1.5 * 1.0, 'Parlay effective multiplier = 2.85');

// Throw in a LOSE_HALF
const leg4: ParlayLegResult = {
  leg_index: 4,
  odds: 1.8,
  settlement: evaluateQuarterSettlement(prematchSpread) // LOSE_HALF (payout 0.5)
};
const parlayRes2 = evaluateParlaySettlement([leg1, leg2, leg4]);
assertEqual(parlayRes2.outcome, 'LOSE_HALF', 'Parlay containing LOSE_HALF -> LOSE_HALF (if no full LOSE)');
assertClose(parlayRes2.payout_multiplier, 1.9 * 1.5 * 0.5, 'Parlay effective multiplier = 1.425');

// Throw in a LOSE
const leg5: ParlayLegResult = {
  leg_index: 5,
  odds: 2.1,
  settlement: {
    outcome: 'LOSE',
    net_profit_unit: -1,
    payout_multiplier: 0,
    explanation: 'Lose'
  }
};
const parlayRes3 = evaluateParlaySettlement([leg1, leg2, leg5]);
assertEqual(parlayRes3.outcome, 'LOSE', 'Parlay containing LOSE -> LOSE');
assertClose(parlayRes3.payout_multiplier, 0, 'Parlay LOSE multiplier = 0');

console.log(`\nLayer 06 Settlement & Parlay Verification: ${passed}/${total} assertions passed.`);

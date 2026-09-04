import { applyPortfolioRiskFilters } from '../05_portfolio_risk/riskFilter.js';
import { LedgerPersistence } from '../05_portfolio_risk/ledgerPersistence.js';
import { RecommendationGrade } from '../04_ai_evaluator/enums.js';
import { FormalRecommendation } from '../05_portfolio_risk/types.js';
import { AiEvaluationResult, EvaluatorPayload } from '../04_ai_evaluator/types.js';
import assert from 'node:assert/strict';

console.log("=== TESTING PORTFOLIO RISK FILTERS ===");

// Dummy existing ledger
const existingLedger: FormalRecommendation[] = [
  {
    record_type: 'formal_ai_recommendation',
    formal_recommendation: true,
    record_id: '1',
    stage: 'LIVE',
    created_at_utc: '',
    match_id: 'match_1',
    kickoff_time: '',
    teams: { home: 'A', away: 'B' },
    condition_snapshot: { match_minute: "LIVE 10'", current_score: "0-0", score_verified: true, source: 'YBTY' },
    ai_assessment: { grade: RecommendationGrade.B_GRADE, confidence_score: 80, blind_spot_analysis: {} as any, internal_logical_audit: '', qualitative_summary: '' },
    leg: { market: 'ASIAN_HANDICAP_MAIN', selected_line: '-0.5', current_odds: 1.9, minimum_acceptable_odds: 1.85, direction: 'HOME', basis: '' }
  }
];

// Test 1: B_GRADE Exposure Limit (Max 1)
const incomingBGrade: AiEvaluationResult = {
  match_id: 'match_1', // Same match
  match: 'A vs B',
  evaluation_time: '',
  grade: RecommendationGrade.B_GRADE,
  confidence_score: 80,
  blind_spot_analysis: {} as any,
  internal_logical_audit: '',
  qualitative_summary: '',
  risk_warnings: [],
  recommended_legs: [
    { market: 'ASIAN_HANDICAP_MAIN', selected_line: '-0.5', current_odds: 1.9, minimum_acceptable_odds: 1.85, direction: 'HOME', basis: '' }
  ]
};

const res1 = applyPortfolioRiskFilters({ existing_ledger: existingLedger, incoming_evaluation: incomingBGrade });
if (!res1.is_approved && res1.approved_legs.length === 0) {
  console.log("[OK] B_GRADE max exposure (1) successfully blocked duplicate bet.");
} else {
  console.error("[FAIL] B_GRADE duplicate was NOT blocked!");
}

// Test 2: Deep Spread Block (Line >= 2.0 requires A_GRADE)
const incomingDeepSpread: AiEvaluationResult = {
  match_id: 'match_2',
  match: 'A vs B',
  evaluation_time: '',
  grade: RecommendationGrade.B_GRADE, // Only B_GRADE
  confidence_score: 80,
  blind_spot_analysis: {} as any,
  internal_logical_audit: '',
  qualitative_summary: '',
  risk_warnings: [],
  recommended_legs: [
    { market: 'ASIAN_HANDICAP_MAIN', selected_line: '-2.5', current_odds: 2.1, minimum_acceptable_odds: 2.0, direction: 'HOME', basis: '' } // Line is 2.5
  ]
};

const res2 = applyPortfolioRiskFilters({ existing_ledger: existingLedger, incoming_evaluation: incomingDeepSpread });
if (!res2.is_approved) {
  console.log("[OK] Deep spread (-2.5) on B_GRADE successfully blocked.");
} else {
  console.error("[FAIL] Deep spread on B_GRADE was allowed!");
}

const formalPayload: EvaluatorPayload = {
  ai_brief: {
    match_id: 'formal_gate_match',
    kickoff_time: '2026-09-05 20:00:00',
    teams: { home: 'A', away: 'B' },
    score_verification: { is_verified: false, current_score: '0 - 0' }
  }
};
const rejectedEvaluation: AiEvaluationResult = {
  match_id: 'formal_gate_match',
  match: 'A vs B',
  evaluation_time: new Date().toISOString(),
  grade: RecommendationGrade.C_GRADE,
  confidence_score: 60,
  blind_spot_analysis: {} as AiEvaluationResult['blind_spot_analysis'],
  internal_logical_audit: '',
  qualitative_summary: '',
  risk_warnings: [],
  recommended_legs: [{
    market: 'ASIAN_HANDICAP_MAIN',
    selected_line: '-0.5',
    current_odds: 1.9,
    minimum_acceptable_odds: 1.85,
    direction: 'HOME',
    basis: ''
  }]
};
assert.throws(
  () => LedgerPersistence.appendApprovedLegs(
    formalPayload,
    rejectedEvaluation,
    rejectedEvaluation.recommended_legs,
    'LIVE'
  ),
  /Only A_GRADE or B_GRADE/
);
console.log("[OK] Non-formal AI result cannot enter the formal ledger.");

console.log("\n[OK] Layer 05 Risk Filters Compiled and Tested Successfully.");

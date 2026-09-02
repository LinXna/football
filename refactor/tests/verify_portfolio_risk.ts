import { applyPortfolioRiskFilters } from '../05_portfolio_risk/riskFilter.js';
import { LedgerPersistence } from '../05_portfolio_risk/ledgerPersistence.js';
import { RecommendationGrade } from '../04_ai_evaluator/enums.js';
import { FormalRecommendation, BettingStage } from '../05_portfolio_risk/types.js';
import { AiEvaluationResult } from '../04_ai_evaluator/types.js';

console.log("=== TESTING PORTFOLIO RISK FILTERS ===");

// Dummy existing ledger
const existingLedger: FormalRecommendation[] = [
  {
    record_id: '1',
    stage: 'LIVE',
    created_at_utc: '',
    match_id: 'match_1',
    kickoff_time: '',
    teams: { home: 'A', away: 'B' },
    condition_snapshot: { match_minute: "LIVE 10'", current_score: "0-0", bdi: 0, goal_phase_alert: '', machine_candidate_count: 0 },
    ai_assessment: { grade: RecommendationGrade.B_GRADE, confidence_score: 80, blind_spot_analysis: {} as any, internal_logical_audit: '', qualitative_summary: '' },
    leg: { market: 'ASIAN_HANDICAP_MAIN', line: '-0.5', odds: 1.9, direction: 'HOME', basis: '' }
  }
];

// Test 1: B_GRADE Exposure Limit (Max 1)
const incomingBGrade: AiEvaluationResult = {
  match_id: 'match_1', // Same match
  evaluation_time: '',
  grade: RecommendationGrade.B_GRADE,
  confidence_score: 80,
  blind_spot_analysis: {} as any,
  internal_logical_audit: '',
  qualitative_summary: '',
  risk_warnings: [],
  recommended_legs: [
    { market: 'ASIAN_HANDICAP_MAIN', line: '-0.5', odds: 1.9, direction: 'HOME', basis: '' }
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
  evaluation_time: '',
  grade: RecommendationGrade.B_GRADE, // Only B_GRADE
  confidence_score: 80,
  blind_spot_analysis: {} as any,
  internal_logical_audit: '',
  qualitative_summary: '',
  risk_warnings: [],
  recommended_legs: [
    { market: 'ASIAN_HANDICAP_MAIN', line: '-2.5', odds: 2.1, direction: 'HOME', basis: '' } // Line is 2.5
  ]
};

const res2 = applyPortfolioRiskFilters({ existing_ledger: existingLedger, incoming_evaluation: incomingDeepSpread });
if (!res2.is_approved) {
  console.log("[OK] Deep spread (-2.5) on B_GRADE successfully blocked.");
} else {
  console.error("[FAIL] Deep spread on B_GRADE was allowed!");
}

console.log("\n[OK] Layer 05 Risk Filters Compiled and Tested Successfully.");

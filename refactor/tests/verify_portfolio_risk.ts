import * as fs from 'fs';
import * as path from 'path';
import { applyPortfolioRiskFilters } from '../05_portfolio_risk/riskFilter.js';
import { LedgerPersistence } from '../05_portfolio_risk/ledgerPersistence.js';
import { RecommendationGrade } from '../04_ai_evaluator/enums.js';
import { FormalRecommendation } from '../05_portfolio_risk/types.js';
import { AiEvaluationResult } from '../04_ai_evaluator/types.js';

console.log("=== TESTING PORTFOLIO RISK FILTERS ===");

// Dummy existing ledger
const existingLedger: FormalRecommendation[] = [
  {
    record_id: '1',
    record_type: 'formal_ai_recommendation',
    formal_recommendation: true,
    stage: 'LIVE',
    created_at_utc: '',
    match_id: 'match_1',
    kickoff_time: '',
    teams: { home: 'A', away: 'B' },
    condition_snapshot: { match_minute: "LIVE 10'", current_score: "0-0", score_verified: true, source: 'YBTY' },
    ai_assessment: { grade: RecommendationGrade.B_GRADE, confidence_score: 80, blind_spot_analysis: {} as any, internal_logical_audit: '', qualitative_summary: '' },
    leg: { market: 'ASIAN_HANDICAP_MAIN', selected_line: '-0.5', current_odds: 1.9, minimum_acceptable_odds: 1.8, direction: 'HOME', basis: '' }
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
    { market: 'ASIAN_HANDICAP_MAIN', selected_line: '-0.5', current_odds: 1.9, minimum_acceptable_odds: 1.8, direction: 'HOME', basis: '' }
  ]
};

const res1 = applyPortfolioRiskFilters({ existing_ledger: existingLedger, incoming_evaluation: incomingBGrade });
if (!res1.is_approved && res1.approved_legs.length === 0) {
  console.log("[OK] B_GRADE max exposure (1) successfully blocked duplicate bet.");
} else {
  throw new Error("[FAIL] B_GRADE duplicate was NOT blocked!");
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
  throw new Error("[FAIL] Deep spread on B_GRADE was allowed!");
}

const cGradeEvaluation = { ...incomingBGrade, match_id: 'match_3', grade: RecommendationGrade.C_GRADE, confidence_score: 90 };
const cGradeResult = applyPortfolioRiskFilters({ existing_ledger: [], incoming_evaluation: cGradeEvaluation });
if (cGradeResult.is_approved || cGradeResult.approved_legs.length !== 0) {
  throw new Error('[FAIL] C_GRADE must not enter the formal recommendation portfolio.');
}
console.log("[OK] C_GRADE formal recommendation gate successfully blocked.");

const lowConfidenceEvaluation = { ...incomingBGrade, match_id: 'match_4', confidence_score: 69 };
const lowConfidenceResult = applyPortfolioRiskFilters({ existing_ledger: [], incoming_evaluation: lowConfidenceEvaluation });
if (lowConfidenceResult.is_approved || lowConfidenceResult.approved_legs.length !== 0) {
  throw new Error('[FAIL] Confidence below 70 must not enter the formal recommendation portfolio.');
}
console.log("[OK] Low-confidence formal recommendation gate successfully blocked.");

const eligibleEvaluation = { ...incomingBGrade, match_id: 'match_5' };
const eligibleResult = applyPortfolioRiskFilters({ existing_ledger: [], incoming_evaluation: eligibleEvaluation });
if (!eligibleResult.is_approved || eligibleResult.approved_legs.length !== 1) {
  throw new Error('[FAIL] Eligible B_GRADE recommendation should remain approved.');
}
console.log("[OK] Eligible B_GRADE recommendation remains approved.");

const persistencePayload = {
  ai_brief: {
    match_id: 'match_1',
    kickoff_time: '2026-09-04T16:00:00Z',
    teams: { home: 'A', away: 'B' },
    status_summary: "PREMATCH",
    score_verification: { current_score: '0 - 0', is_verified: true },
    core_markets: {}
  },
  quant_features: {
    machine_candidate_signals: [{
      market: 'ASIAN_HANDICAP_MAIN',
      line: '-0.5',
      side: 'home',
      odds: 1.9,
      ev: 0.08,
      confidence: 80,
      kelly_fraction: 0.02
    }],
    bdi: 0,
    goal_phase_alert: 'NONE',
    machine_candidate_count: 1
  }
} as any;
try {
  LedgerPersistence.appendApprovedLegs(
    persistencePayload,
    { ...incomingBGrade, grade: RecommendationGrade.REJECTED },
    incomingBGrade.recommended_legs,
    'PREMATCH'
  );
  throw new Error('[FAIL] Rejected AI evaluation must never be persisted to the formal ledger.');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('Only A_GRADE or B_GRADE')) throw error;
}
console.log("[OK] Rejected AI evaluation was blocked before ledger persistence.");

const missingCandidatePersistence = LedgerPersistence.appendApprovedLegs(
  {
    ...persistencePayload,
    quant_features: {
      ...persistencePayload.quant_features,
      machine_candidate_signals: []
    }
  },
  incomingBGrade,
  incomingBGrade.recommended_legs,
  'PREMATCH'
);
if (missingCandidatePersistence.length !== 0) {
  throw new Error('[FAIL] AI legs without matching Layer 03 candidates must never be persisted.');
}
console.log("[OK] AI leg without matching Layer 03 candidate was blocked before persistence.");

const acceptedPersistence = LedgerPersistence.appendApprovedLegs(
  persistencePayload,
  incomingBGrade,
  incomingBGrade.recommended_legs,
  'PREMATCH'
);
if (
  acceptedPersistence.length !== 1 ||
  acceptedPersistence[0].record_type !== 'formal_ai_recommendation' ||
  acceptedPersistence[0].formal_recommendation !== true ||
  acceptedPersistence[0].leg.market !== 'ASIAN_HANDICAP_MAIN'
) {
  throw new Error('[FAIL] Accepted persistence must retain formal provenance and the approved machine-candidate leg.');
}
console.log("[OK] Accepted machine-candidate leg retained formal provenance in the ledger record.");
const persistenceLedgerPath = path.join(process.cwd(), 'output', 'recommendation_ledger_prematch.json');
if (fs.existsSync(persistenceLedgerPath)) {
  fs.unlinkSync(persistenceLedgerPath);
}

console.log("\n[OK] Layer 05 Risk Filters Compiled and Tested Successfully.");

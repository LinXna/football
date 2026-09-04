import { buildSystemPrompt, buildUserPrompt } from '../04_ai_evaluator/promptBuilder.js';
import { EvaluatorPayload, AiEvaluationResult } from '../04_ai_evaluator/types.js';
import { RecommendationGrade, TacticalRegimeEvaluation, TrapDetectionResult } from '../04_ai_evaluator/enums.js';
import { verifyStatutoryAlignment, parseHandicapToFloat } from '../04_ai_evaluator/alignmentGuard.js';

// --- Test 1: parseHandicapToFloat ---
console.log("=== TESTING LINE PARSING ===");
const parsingTests = [
  { line: "-0.25", expected: -0.25 },
  { line: "-0/0.5", expected: -0.25 },
  { line: "0/0.5", expected: 0.25 },
  { line: "2/2.5", expected: 2.25 },
  { line: "-0.5/1", expected: -0.75 },
  { line: "2.5", expected: 2.5 }
];

parsingTests.forEach(pt => {
  const parsed = parseHandicapToFloat(pt.line);
  if (parsed === pt.expected) {
    console.log(`[OK] Parsed '${pt.line}' -> ${parsed}`);
  } else {
    console.error(`[FAIL] Parsed '${pt.line}' -> ${parsed}, expected ${pt.expected}`);
  }
});

// --- Test 2: Alignment Guard with Float Equivalents ---
console.log("\n=== RUNNING ALIGNMENT GUARD ===");
const mockPayload: EvaluatorPayload = {
  ai_brief: {
    match_id: '12345',
    league: 'Premier League',
    kickoff_time: '2026-09-02T19:00:00Z',
    status_summary: 'LIVE 75\' (0-1, 0红)',
    teams: { home: 'Arsenal', away: 'Chelsea' },
    score_verification: { is_verified: true, current_score: '0 - 1' },
    core_markets: {
      ah_main: { handicap: '-0/0.5', home_odds: 1.95, away_odds: 1.85 } // Statutory is string '-0/0.5'
    },
    condensed_features: {
      possession: { home: 70, away: 30 },
      shots_on_target: { home: 2, away: 4 },
      dangerous_attacks: { home: 80, away: 20 }
    },
    data_deficits: []
  },
  quant_features: {
    screening_integrity_score: 95,
    data_quality_score: 100,
    model_stability_score: 90,
    edge_confidence_score: 80,
    bdi: 45,
    goal_phase_alert: 'IMMINENT_GOAL',
    raw_positive_ev_count: 1,
    machine_candidate_count: 1,
    raw_mathematical_ev_signals: [{
      market: 'ASIAN_HANDICAP_MAIN',
      line: '-0/0.5',
      side: 'away',
      odds: 1.85,
      ev: 0.08,
      confidence: 80,
      kelly_fraction: 0.02
    }],
    machine_candidate_signals: [{
      market: 'ASIAN_HANDICAP_MAIN',
      line: '-0/0.5',
      side: 'away',
      odds: 1.85,
      ev: 0.08,
      confidence: 80,
      kelly_fraction: 0.02
    }]
  } as any,
  oos_context: {
    similar_situations_analyzed: 1450,
    historical_win_rate: 0.12, 
    average_yield: -0.45,
    insight_note: '...'
  }
};

// Valid AI response using float format '-0.25'
const validAiResult: AiEvaluationResult = {
  match_id: '12345',
  evaluation_time: new Date().toISOString(),
  blind_spot_analysis: {
    "1_global_motivation": "...",
    "2_asian_handicap_reality": "...",
    "3_total_goals_reality": "...",
    tactical_regime_evaluation: TacticalRegimeEvaluation.BARREN_DOMINANCE,
    trap_detection_result: TrapDetectionResult.POTENTIAL_TRAP
  },
  internal_logical_audit: "...",
  grade: RecommendationGrade.B_GRADE,
  confidence_score: 75,
  qualitative_summary: "...",
  risk_warnings: [],
  recommended_legs: [
    {
      market: 'ASIAN_HANDICAP_MAIN',
      selected_line: '-0.25', // -0.25 must be equivalent to statutory -0/0.5
      current_odds: 1.85,
      minimum_acceptable_odds: 1.70,  
      direction: 'AWAY',
      basis: '...'
    }
  ]
};

const guardedValid = verifyStatutoryAlignment(validAiResult, mockPayload);
if (guardedValid.grade === RecommendationGrade.B_GRADE) {
  console.log("[OK] AI Float Leg (-0.25) correctly matched Statutory Leg (-0/0.5).");
} else {
  console.error("[FAIL] Valid leg was rejected!", guardedValid.risk_warnings);
}

const cupPayload: EvaluatorPayload = {
  ...mockPayload,
  ai_brief: { ...mockPayload.ai_brief, league: 'National Cup' },
  lineup_value_matrix: 'NO_LINEUP'
};
const downgradedCup = verifyStatutoryAlignment(
  { ...validAiResult, grade: RecommendationGrade.A_GRADE, confidence_score: 90 },
  cupPayload
);
if (downgradedCup.grade !== RecommendationGrade.C_GRADE || downgradedCup.recommended_legs.length !== 0) {
  throw new Error('[FAIL] Cup lineup gate must downgrade and clear formal recommendation legs.');
}
console.log("[OK] Cup lineup gate cleared recommendation legs after downgrade.");

const lowConfidence = verifyStatutoryAlignment(
  { ...validAiResult, grade: RecommendationGrade.B_GRADE, confidence_score: 69 },
  mockPayload
);
if (lowConfidence.recommended_legs.length !== 0) {
  throw new Error('[FAIL] Confidence below 70 must clear formal recommendation legs.');
}
console.log("[OK] Confidence gate cleared recommendation legs below 70.");

const missingCandidateResult = verifyStatutoryAlignment(
  validAiResult,
  {
    ...mockPayload,
    quant_features: {
      ...mockPayload.quant_features,
      machine_candidate_signals: []
    }
  }
);
if (missingCandidateResult.grade !== RecommendationGrade.REJECTED || missingCandidateResult.recommended_legs.length !== 0) {
  throw new Error('[FAIL] AI legs without Layer 03 machine candidates must be rejected.');
}
console.log("[OK] AI leg without a Layer 03 machine candidate was rejected.");

const secondaryPayload: EvaluatorPayload = {
  ...mockPayload,
  ai_brief: {
    ...mockPayload.ai_brief,
    core_markets: {
      ...mockPayload.ai_brief.core_markets,
      ah_secondary: [{ handicap: '-0.5', home_odds: 1.9, away_odds: 1.9 }],
      ou_secondary: [{ handicap: '2.5', over_odds: 1.9, under_odds: 1.9 }]
    }
  }
};
const secondaryAiResult = verifyStatutoryAlignment(
  {
    ...validAiResult,
    recommended_legs: [{
      ...validAiResult.recommended_legs[0],
      market: 'ASIAN_HANDICAP_SUB',
      selected_line: '-0.5',
      current_odds: 1.9
    }]
  },
  secondaryPayload
);
if (secondaryAiResult.grade !== RecommendationGrade.REJECTED || secondaryAiResult.recommended_legs.length !== 0) {
  throw new Error('[FAIL] Secondary-line AI output must be rejected instead of bypassing Layer 03 machine-candidate gating.');
}
console.log("[OK] Secondary-line AI output was rejected by the statutory alignment guard.");

console.log("\n[OK] Layer 04 Deep Defect Refinement Compiled Successfully.");

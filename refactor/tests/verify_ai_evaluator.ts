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
const unlockedPipeline = {
  state: 'PRODUCTION_UNLOCKED' as const,
  raw_signals: [],
  oos_validated_signals: [],
  machine_candidate_signals: [],
  validations: [],
  blockers: [],
  transitions: [],
  edge_confidence_score: 80
};

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
    candidate_pipeline: unlockedPipeline,
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

// --- Test 3: P0-01 / P1-03 Market Scan Decoupling and VALID_BUT_BLOCKED ---
console.log("\n=== TESTING MARKET SCAN DECOUPLING & VALID_BUT_BLOCKED ===");
const blockedByGradeResult = verifyStatutoryAlignment(
  {
    ...validAiResult,
    grade: RecommendationGrade.WATCH,
    confidence_score: 45,
    market_scan: {
      selected_line: '-0.25',
      market: 'ASIAN_HANDICAP_MAIN',
      market_status: 'VALID_BUT_BLOCKED',
      direction: 'AWAY',
      current_odds: 1.85,
      minimum_acceptable_odds: 1.70,
      raw_ev: 0.08,
      risk_adjusted_ev: 0,
      risk_adjustment_status: 'QUALITATIVE_ONLY',
      is_quarter_line: true,
      quarter_line_settlement_distribution: {
        p_full_win: 0.45,
        p_half_win: 0.15,
        p_push: 0.05,
        p_half_loss: 0.15,
        p_full_loss: 0.20,
        settlement_status: 'VERIFIED'
      },
      mathematically_closed: false,
      actionable: false,
      rejection_reason: 'GATED_BY_GRADE_WATCH'
    }
  },
  mockPayload
);

if (blockedByGradeResult.market_scan?.market_status !== 'VALID_BUT_BLOCKED') {
  throw new Error(`[FAIL] Expected VALID_BUT_BLOCKED, got ${blockedByGradeResult.market_scan?.market_status}`);
}
if (blockedByGradeResult.market_scan?.selected_line !== '-0.25' || blockedByGradeResult.market_scan?.market !== 'ASIAN_HANDICAP_MAIN') {
  throw new Error('[FAIL] VALID_BUT_BLOCKED must retain selected_line and market!');
}
if (blockedByGradeResult.market_scan?.actionable !== false || blockedByGradeResult.recommended_legs.length !== 0) {
  throw new Error('[FAIL] VALID_BUT_BLOCKED must set actionable=false and clear recommended_legs!');
}
console.log("[OK] VALID_BUT_BLOCKED correctly retains selected_line and market with actionable=false.");

// Test 3.2: Erroneous NONE correction when raw signals exist
const erroneousNoneResult = verifyStatutoryAlignment(
  {
    ...validAiResult,
    grade: RecommendationGrade.WATCH,
    confidence_score: 30,
    market_scan: {
      selected_line: 'NONE',
      market: 'NONE',
      direction: 'NONE',
      current_odds: 0,
      minimum_acceptable_odds: 0,
      raw_ev: 0,
      risk_adjusted_ev: 0,
      is_quarter_line: false,
      actionable: false,
      rejection_reason: 'Blocked by watch'
    }
  },
  mockPayload
);
if (erroneousNoneResult.market_scan?.market_status !== 'VALID_BUT_BLOCKED' || erroneousNoneResult.market_scan?.selected_line === 'NONE') {
  throw new Error('[FAIL] Erroneous market=NONE must be corrected to VALID_BUT_BLOCKED when valid raw signals exist!');
}
console.log("[OK] Erroneous market=NONE corrected to VALID_BUT_BLOCKED with retained scanned line.");

// --- Test 4: Line-Specific Mathematically Closed ---
console.log("\n=== TESTING LINE-SPECIFIC MATHEMATICALLY CLOSED ===");
const closedLineResult = verifyStatutoryAlignment(
  {
    ...validAiResult,
    market_scan: {
      selected_line: '1.5',
      market: 'TOTAL_GOALS_MAIN',
      direction: 'OVER',
      current_odds: 1.5,
      minimum_acceptable_odds: 1.4,
      raw_ev: 0.05,
      risk_adjusted_ev: 0,
      is_quarter_line: false,
      actionable: true,
      rejection_reason: 'N/A'
    }
  },
  {
    ...mockPayload,
    ai_brief: {
      ...mockPayload.ai_brief,
      score_verification: { is_verified: true, current_score: '2 - 0' }
    }
  }
);
if (!closedLineResult.market_scan?.mathematically_closed || closedLineResult.market_scan?.market_status !== 'VALID_BUT_BLOCKED') {
  throw new Error('[FAIL] Line 1.5 with score 2-0 must be mathematically_closed and VALID_BUT_BLOCKED!');
}
console.log("[OK] Line-specific 1.5 is mathematically_closed at 2-0 without affecting other lines.");

// --- Test 5: Live Match Robustness & Tactical Integrity Preservation ---
console.log("\n=== TESTING LIVE MATCH ROBUSTNESS & TACTICAL PRESERVATION ===");
const liveMatchPayload: EvaluatorPayload = {
  ...mockPayload,
  ai_brief: {
    ...mockPayload.ai_brief,
    status_summary: "LIVE 65'",
    kickoff_time: '20:00', // Real-world Leisu/YBTY format (local time-only)
  },
  quant_features: {
    ...mockPayload.quant_features,
    prediction_snapshot: {
      prediction_at: '2026-09-02T19:00:00Z'
    }
  } as any
};

const preservedResult = verifyStatutoryAlignment(
  {
    ...validAiResult,
    grade: RecommendationGrade.B_GRADE,
    confidence_score: 75,
    blind_spot_analysis: {
      ...validAiResult.blind_spot_analysis!,
      tactical_regime_evaluation: TacticalRegimeEvaluation.GENUINE_DOMINANCE
    }
  },
  liveMatchPayload
);

if (preservedResult.blind_spot_analysis?.tactical_regime_evaluation !== TacticalRegimeEvaluation.GENUINE_DOMINANCE) {
  throw new Error(`[FAIL] Live match tactical regime must be preserved, got ${preservedResult.blind_spot_analysis?.tactical_regime_evaluation}`);
}
if (preservedResult.grade !== RecommendationGrade.B_GRADE) {
  throw new Error(`[FAIL] Live match grade must not be falsely downgraded, got ${preservedResult.grade}`);
}
console.log("[OK] Live match tactical evaluation preserved without false string clock degradation.");

// --- Test 8: Friendly Match Gating & Warning Verification ---
console.log("\n=== TESTING FRIENDLY MATCH GATING AND RISK ALERTS ===");
const friendlyPayloadWithConfirmedLineup: EvaluatorPayload = {
  ...mockPayload,
  ai_brief: {
    ...mockPayload.ai_brief,
    league: '球会友谊'
  },
  lineup_value_matrix: {
    is_lineup_confirmed: true,
    home_confirmed_count: 11,
    away_confirmed_count: 11,
    lineup_status: 'CONFIRMED'
  } as any
};

const friendlyAiResultWithAGrade: AiEvaluationResult = {
  ...validAiResult,
  grade: RecommendationGrade.A_GRADE,
  confidence_score: 90
};

const gatedFriendlyResult = verifyStatutoryAlignment(friendlyAiResultWithAGrade, friendlyPayloadWithConfirmedLineup);

if (gatedFriendlyResult.grade !== RecommendationGrade.B_GRADE) {
  throw new Error(`[FAIL] Confirmed friendly match with A_GRADE must be capped at B_GRADE, got ${gatedFriendlyResult.grade}`);
}
if (gatedFriendlyResult.confidence_score > 80) {
  throw new Error(`[FAIL] Confirmed friendly match confidence must be capped at 80, got ${gatedFriendlyResult.confidence_score}`);
}
if (!gatedFriendlyResult.risk_warnings.some(w => w.includes('FRIENDLY_HIGH_ROTATION_RISK'))) {
  throw new Error(`[FAIL] Confirmed friendly match must contain FRIENDLY_HIGH_ROTATION_RISK warning`);
}
console.log("[OK] Friendly match with confirmed lineup correctly capped at B_GRADE with FRIENDLY_HIGH_ROTATION_RISK warning.");

// Unconfirmed lineup friendly match must be C_GRADE
const friendlyPayloadUnconfirmed: EvaluatorPayload = {
  ...friendlyPayloadWithConfirmedLineup,
  lineup_value_matrix: {
    is_lineup_confirmed: false,
    lineup_status: 'PREDICTED'
  } as any
};
const unconfirmedFriendlyResult = verifyStatutoryAlignment(friendlyAiResultWithAGrade, friendlyPayloadUnconfirmed);
if (unconfirmedFriendlyResult.grade !== RecommendationGrade.C_GRADE) {
  throw new Error(`[FAIL] Unconfirmed friendly match must be downgraded to C_GRADE, got ${unconfirmedFriendlyResult.grade}`);
}
console.log("[OK] Friendly match with unconfirmed lineup correctly downgraded to C_GRADE.");

console.log("\n[OK] All Advanced Refactoring and Inviolable Laws Verified Successfully.");


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
    machine_candidate_count: 1
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
    late_game_intent_multiplier: "...",
    tactical_regime_evaluation: TacticalRegimeEvaluation.BARREN_DOMINANCE,
    trap_detection_result: TrapDetectionResult.POTENTIAL_TRAP,
    score_effect_leverage: "...",
    lineup_criticality_assessment: "..."
  },
  internal_logical_audit: "...",
  grade: RecommendationGrade.B_GRADE,
  confidence_score: 75,
  qualitative_summary: "...",
  risk_warnings: [],
  recommended_legs: [
    {
      market: 'ASIAN_HANDICAP_MAIN',
      line: '-0.25', // -0.25 must be equivalent to statutory -0/0.5
      odds: 1.85,  
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

console.log("\n[OK] Layer 04 Deep Defect Refinement Compiled Successfully.");

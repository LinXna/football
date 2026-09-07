import { verifyStatutoryAlignment } from '../04_ai_evaluator/alignmentGuard.js';
import { RecommendationGrade, TacticalRegimeEvaluation, TrapDetectionResult } from '../04_ai_evaluator/enums.js';
import { AiEvaluationResult, EvaluatorPayload } from '../04_ai_evaluator/types.js';
import { Layer03CandidatePipeline } from '../03_quant_engine/types.js';

const lockedPipeline: Layer03CandidatePipeline = {
  state: 'OOS_LOCKED', raw_signal_count: 1, oos_validated_count: 0, machine_candidate_count: 0,
  validations: [], blockers: ['NO_PROFILE'], transitions: []
};
const unlockedPipeline: Layer03CandidatePipeline = {
  state: 'PRODUCTION_UNLOCKED', raw_signal_count: 1, oos_validated_count: 1, machine_candidate_count: 1,
  validations: [], blockers: [], transitions: []
};

function baseResult(pipeline: Layer03CandidatePipeline): AiEvaluationResult {
  return {
    match_id: 'm1', match: 'A vs B', evaluation_time: '', candidate_pipeline: pipeline,
    blind_spot_analysis: {
      '1_global_motivation': '', '2_asian_handicap_reality': '', '3_total_goals_reality': '',
      tactical_regime_evaluation: TacticalRegimeEvaluation.GENUINE_DOMINANCE,
      trap_detection_result: TrapDetectionResult.SAFE_VALUE
    },
    internal_logical_audit: '', grade: RecommendationGrade.A_GRADE, confidence_score: 90,
    qualitative_summary: '', risk_warnings: [],
    recommended_legs: [{ market: 'EURO_1X2', selected_line: '1', current_odds: 2,
      minimum_acceptable_odds: 1.9, direction: 'HOME', basis: 'test' }]
  };
}

const payload = (pipeline: Layer03CandidatePipeline): EvaluatorPayload => ({
  ai_brief: { match_id: 'm1', teams: { home: 'A', away: 'B' }, core_markets: {}, score_verification: { is_verified: true, current_score: '0 - 0' } },
  quant_features: { mathematical_ev_signals: [], machine_candidate_signals: [], candidate_pipeline: pipeline, risk_flags: [] }
});

const lockedResult = verifyStatutoryAlignment(baseResult(lockedPipeline), payload(lockedPipeline));
if (lockedResult.grade !== RecommendationGrade.RESEARCH || lockedResult.confidence_score !== 0 || lockedResult.recommended_legs.length !== 0) {
  throw new Error('Layer 04 failed to hard-lock OOS_LOCKED candidate');
}

const unlockedNoLegs = verifyStatutoryAlignment({ ...baseResult(unlockedPipeline), recommended_legs: [] }, payload(unlockedPipeline));
if (unlockedNoLegs.grade !== RecommendationGrade.REJECTED || unlockedNoLegs.recommended_legs.length !== 0) {
  throw new Error('Layer 04 actionable-grade empty-leg hard gate failed');
}

console.log('verify_layer04_05_candidate_boundary: PASS');

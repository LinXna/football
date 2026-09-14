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

// -------------------------------------------------------------
// P1 Task 1.1 & Task 1.2: COLD_START_PERMISSIVE 解耦与台账准入验证
// -------------------------------------------------------------
const coldStartPipeline: Layer03CandidatePipeline = {
  state: 'COLD_START_PERMISSIVE', raw_signal_count: 1, oos_validated_count: 0, machine_candidate_count: 0,
  validations: [], blockers: ['COLD_START_EXEMPTION_ACTIVE'], transitions: []
};

const coldStartCandidateSignal = {
  market: 'EURO_1X2', line: '1', side: 'HOME', odds: 2.0, ev: 0.05
};

const coldStartPayload: EvaluatorPayload = {
  ai_brief: {
    match_id: 'm_cold_1',
    teams: { home: 'Team A', away: 'Team B' },
    core_markets: {
      euro_1x2: { home_win_odds: 2.0, draw_odds: 3.4, away_win_odds: 3.8 }
    },
    score_verification: { is_verified: true, current_score: '0 - 0' }
  },
  lineup_value_matrix: {
    is_lineup_confirmed: true
  } as any,
  quant_features: {
    mathematical_ev_signals: [coldStartCandidateSignal as any],
    machine_candidate_signals: [],
    research_candidate_signals: [coldStartCandidateSignal as any],
    candidate_pipeline: coldStartPipeline,
    risk_flags: []
  }
};

const aiColdResult = baseResult(coldStartPipeline);
aiColdResult.recommended_legs = [{
  market: 'EURO_1X2',
  selected_line: '1',
  current_odds: 2.0,
  minimum_acceptable_odds: 1.9,
  direction: 'HOME',
  basis: 'COLD_START_EXEMPT_TEST'
}];
aiColdResult.grade = RecommendationGrade.A_GRADE; // AI 尝试给 A
aiColdResult.confidence_score = 92; // AI 尝试给 92 分

const coldAlignmentResult = verifyStatutoryAlignment(aiColdResult, coldStartPayload);

// 1. 验证 A 级被强制降级为 B_GRADE
if (coldAlignmentResult.grade !== RecommendationGrade.B_GRADE) {
  throw new Error(`Expected B_GRADE for cold-start permissive, got ${coldAlignmentResult.grade}`);
}

// 2. 验证置信度强制封顶 79
if (coldAlignmentResult.confidence_score !== 79) {
  throw new Error(`Expected confidence capped at 79, got ${coldAlignmentResult.confidence_score}`);
}

// 3. 验证推荐腿保留且打了 OOS_COLD_START_EXEMPT 标签
if (coldAlignmentResult.recommended_legs.length !== 1) {
  throw new Error(`Expected 1 recommended leg for cold start, got ${coldAlignmentResult.recommended_legs.length}`);
}
if (coldAlignmentResult.recommended_legs[0].oos_status !== 'OOS_COLD_START_EXEMPT') {
  throw new Error(`Expected leg oos_status to be OOS_COLD_START_EXEMPT, got ${coldAlignmentResult.recommended_legs[0].oos_status}`);
}

// 4. 验证推荐台账适配器转换 (Task 1.2)
import { convertFormalLedgerRecords } from '../06_settlement_audit/formalLedgerAdapter.js';
import { FormalRecommendation } from '../05_portfolio_risk/types.js';

const mockColdRecommendation: FormalRecommendation = {
  record_id: 'rec_cold_001',
  record_type: 'formal_ai_recommendation',
  formal_recommendation: true,
  stage: 'PREMATCH',
  kickoff_time: '2026-09-14 18:00:00',
  league_key: 'J2_LEAGUE',
  teams: { home: 'Team A', away: 'Team B' },
  candidate_pipeline_state: 'COLD_START_PERMISSIVE',
  oos_status: 'OOS_COLD_START_EXEMPT',
  condition_snapshot: {
    match_minute: 'PREMATCH',
    current_score: '0 - 0',
    candidate_pipeline_state: 'COLD_START_PERMISSIVE',
    oos_status: 'OOS_COLD_START_EXEMPT',
    score_verified: true,
    source: 'YBTY'
  },
  ai_assessment: {
    grade: RecommendationGrade.B_GRADE,
    confidence_score: 79,
    blind_spot_analysis: {} as any,
    internal_logical_audit: 'Pass'
  },
  leg: {
    market: 'EURO_1X2',
    selected_line: '1',
    current_odds: 2.0,
    minimum_acceptable_odds: 1.9,
    direction: 'HOME',
    basis: 'FULL_MATCH_NORMAL',
    oos_status: 'OOS_COLD_START_EXEMPT'
  },
  prediction_snapshot: {
    model_version: '3.0.0',
    prediction_at: '2026-09-14T10:00:00Z',
    score_at_recommendation: { home: 0, away: 0 },
    score_verified: true,
    red_card_state: 'NONE',
    market: 'EURO_1X2',
    line: '1',
    odds: 2.0,
    model_probability: 0.52,
    predicted_lambda: { home: 1.5, away: 1.1 }
  },
  settlement: {
    is_settled: true,
    final_score_verified: '1 - 0',
    outcome: 'WIN',
    settled_at: '2026-09-14T20:00:00Z'
  }
};

const conversionResult = convertFormalLedgerRecords([mockColdRecommendation]);
if (conversionResult.records.length !== 1) {
  throw new Error(`Expected 1 record converted for cold-start exempt, skipped reasons: ${JSON.stringify(conversionResult.skipped)}`);
}
if (conversionResult.records[0].oos_status !== 'OOS_COLD_START_EXEMPT') {
  throw new Error(`Expected converted record oos_status to be OOS_COLD_START_EXEMPT, got ${conversionResult.records[0].oos_status}`);
}

console.log('verify_layer04_05_candidate_boundary: PASS');

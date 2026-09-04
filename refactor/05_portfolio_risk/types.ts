import { AiEvaluationResult, RecommendedLeg } from '../04_ai_evaluator/types.js';

export type BettingStage = 'LIVE' | 'PREMATCH';

export interface FormalRecommendation {
  record_type: 'formal_ai_recommendation';
  formal_recommendation: true;
  record_id: string; // uuid or composite hash
  record_type: 'formal_ai_recommendation';
  formal_recommendation: true;
  stage: BettingStage;
  created_at_utc: string;
  
  match_id: string;
  kickoff_time: string;
  teams: { home: string, away: string };
  
  // A snapshot of the exact conditions when the bet was placed
  condition_snapshot: {
    match_minute: string; // e.g. "LIVE 75'" or "PREMATCH"
    current_score: string; // e.g. "1 - 0" or "0 - 0"
    bdi?: number;
    goal_phase_alert?: string;
    machine_candidate_count?: number;
    score_verified: boolean;
    source: 'YBTY';
  };
  
  ai_assessment: {
    grade: AiEvaluationResult['grade'];
    confidence_score: number;
    blind_spot_analysis: AiEvaluationResult['blind_spot_analysis'];
    internal_logical_audit: AiEvaluationResult['internal_logical_audit'];
    qualitative_summary: string;
  };
  
  leg: RecommendedLeg;
  
  // Post-match verification (Layer 06 populates this later)
  settlement?: {
    is_settled: boolean;
    outcome?: 'WIN' | 'WIN_HALF' | 'DRAW' | 'LOSE_HALF' | 'LOSE' | 'INVALID_DATA' | 'PENDING';
    final_score_verified?: string;
    profit_loss?: number;
  };
}

export interface RiskFilterContext {
  existing_ledger: FormalRecommendation[];
  incoming_evaluation: AiEvaluationResult;
}

export interface RiskFilterResult {
  is_approved: boolean;
  rejection_reason?: string;
  approved_legs: RecommendedLeg[];
}

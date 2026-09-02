import { AiEvaluationBrief } from '../02_canonical_model/types.js';
import { QuantitativeFeatures, OosMarket } from '../03_quant_engine/types.js';
import { RecommendationGrade, TrapDetectionResult, TacticalRegimeEvaluation } from './enums.js';

export interface OosHistoricalContext {
  similar_situations_analyzed: number;
  historical_win_rate: number; // 0.0 to 1.0
  average_yield: number;
  insight_note: string;
}

export interface EvaluatorPayload {
  ai_brief: Partial<AiEvaluationBrief>;
  time_context: {
    statutory_minute: string;
    expected_remaining_minutes_including_stoppage: number;
  };
  tactical_phase_transitions: string[];
  lineup_value_matrix: any;
  team_profiling: any;
  quant_features: {
    devig: any;
    bdi: number;
    ev_signals: any[];
    risk_flags: any[];
    goal_alert: string;
    confidence: number;
  };
  oos_context?: OosHistoricalContext;
}

export interface RecommendedLeg {
  market: string;
  selected_line: string;
  current_odds: number;
  minimum_acceptable_odds: number;
  direction: 'HOME' | 'AWAY' | 'OVER' | 'UNDER' | 'DRAW' | 'NONE';
  basis: string;
}

export interface BlindSpotChecklist {
  "1_global_motivation": string;
  "2_asian_handicap_reality": string;
  "3_total_goals_reality": string;
  tactical_regime_evaluation: TacticalRegimeEvaluation;
  trap_detection_result: TrapDetectionResult;
}

export interface AiEvaluationResult {
  match_id: string;
  evaluation_time: string;
  
  blind_spot_analysis: BlindSpotChecklist;
  
  // Chain-of-Thought (CoT) Checkpoint before issuing the final grade
  internal_logical_audit: string;
  
  grade: RecommendationGrade;
  confidence_score: number; // 0-100
  
  qualitative_summary: string;
  risk_warnings: string[];
  
  recommended_legs: RecommendedLeg[];
}

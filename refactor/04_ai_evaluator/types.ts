import { AiEvaluationBrief } from '../02_canonical_model/types.js';
import { PositiveEVSignal, QuantAlert, DeviggedMarketFeatures, InPlayPoissonFeatures, SpatioTemporalEventFeatures } from '../03_quant_engine/types.js';
import { RecommendationGrade, TrapDetectionResult, TacticalRegimeEvaluation } from './enums.js';

export interface OosHistoricalContext {
  similar_situations_analyzed: number;
  historical_win_rate: number; // 0.0 to 1.0
  average_yield: number;
  insight_note: string;
}

export interface EvaluatorLineupTeamInfo {
  total_value_eur: string;
  lis_score: number;
  status: string;
}

export interface EvaluatorLineupMatrix {
  lineup_status: string;
  is_lineup_confirmed: boolean;
  home: EvaluatorLineupTeamInfo;
  away: EvaluatorLineupTeamInfo;
}

export interface EvaluatorTeamProfile {
  recent_form_summary: string;
  market_performance_ats: string;
}

export interface EvaluatorTeamProfiling {
  h2h_tactical_integrity?: string;
  home?: EvaluatorTeamProfile;
  away?: EvaluatorTeamProfile;
}

export interface EvaluatorQuantFeatures {
  mathematical_ev_signals: readonly PositiveEVSignal[];
  bdi?: number;
  goal_phase_alert?: string;
  machine_candidate_count?: number;
  poisson_expected_goals?: string;
  prediction_snapshot?: {
    model_version: string;
    prediction_at: string;
    predicted_lambda: { home: number; away: number };
    red_card_state: string;
    signals: readonly PositiveEVSignal[];
  };
  market_divergence_insights?: string;
}

export interface LivePhysicalContext {
  expected_remaining_minutes_including_stoppage: number;
  real_time_stats: string;
  environment?: string;
  match_timeline_events: string[];
  attack_momentum_time_series: string[];
}

export interface EvaluatorPayload {
  ai_brief: Omit<Partial<AiEvaluationBrief>, 'core_markets'> & {
    core_markets?: {
      ah_main?: any;
      ah_secondary?: any[];
      ou_main?: any;
      ou_secondary?: any[];
      euro_1x2?: any;
      ah_half?: any;
      ou_half?: any;
    }
  };
  data_blind_spot_warning?: string;
  live_physical_context?: LivePhysicalContext;
  historical_team_profiling?: EvaluatorTeamProfiling;
  lineup_value_matrix?: EvaluatorLineupMatrix | string;
  quant_features?: EvaluatorQuantFeatures;
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

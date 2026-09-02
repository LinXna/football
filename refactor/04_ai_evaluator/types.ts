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
  ai_brief: AiEvaluationBrief;
  quant_features: QuantitativeFeatures;
  oos_context?: OosHistoricalContext; // Added: Few-Shot OOS Context Memory
}

export interface RecommendedLeg {
  market: OosMarket;
  line: string;
  odds: number;
  direction: 'HOME' | 'AWAY' | 'OVER' | 'UNDER';
  basis: string; // The reason for this specific bet
}

export interface BlindSpotChecklist {
  late_game_intent_multiplier: string; 
  tactical_regime_evaluation: TacticalRegimeEvaluation;
  trap_detection_result: TrapDetectionResult;
  score_effect_leverage: string;
  lineup_criticality_assessment: string;
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

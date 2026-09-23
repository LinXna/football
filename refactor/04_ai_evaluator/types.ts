import { AiEvaluationBrief } from '../02_canonical_model/types.js';
import { PositiveEVSignal, QuantAlert, DeviggedMarketFeatures, InPlayPoissonFeatures, SpatioTemporalEventFeatures, Layer03CandidatePipeline, TacticalFormationFeatures } from '../03_quant_engine/types.js';
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
  attack_injury_factor?: number;
  defense_leak_factor?: number;
  talisman_missing?: boolean;
  talisman_name?: string;
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
  /** Canonical Layer 03 tracks; raw is research-only, machine candidates are OOS/data gated. */
  raw_positive_ev_signals?: readonly PositiveEVSignal[];
  raw_mathematical_ev_signals?: readonly PositiveEVSignal[];
  machine_candidate_signals?: readonly PositiveEVSignal[];
  research_candidate_signals?: readonly PositiveEVSignal[];
  candidate_pipeline?: Layer03CandidatePipeline;
  risk_adjusted_ev?: number;
  risk_flags?: QuantAlert[];
  confidence_score?: number;
  tactical_formation?: TacticalFormationFeatures;
  devig?: DeviggedMarketFeatures;
  poisson_expected_goals?: string;
  prediction_snapshot?: {
    model_version: string;
    prediction_at: string;
    predicted_lambda: { home: number; away: number };
    red_card_state: string;
    discipline_state?: string;
    signals: readonly PositiveEVSignal[];
  };
  market_divergence_insights?: string;
  /** Explicit OOS Semantic Status to prevent NO_PROFILE vs VALIDATED confusion */
  oos_semantic_status?: {
    profile_status: 'NO_PROFILE' | 'PROFILE_AVAILABLE' | 'VALIDATED' | 'REJECTED';
    is_oos_validated: boolean;
    effective_sample_size: number;
    audit_rule: string;
    is_circuit_broken?: boolean;
    circuit_breaker_reason?: string;
  };
  /** Explicit Model Stability & Pipeline Hard Gate Bounds */
  stability_and_blockers?: {
    model_stability_score: number;
    has_major_live_conflict: boolean;
    blocker_count: number;
    blockers: string[];
    hard_gate_ceiling: 'A_GRADE' | 'B_GRADE' | 'C_GRADE' | 'WATCH' | 'REJECTED';
  };
}

export interface LivePhysicalContext {
  expected_remaining_minutes_including_stoppage: number;
  real_time_stats: string;
  environment?: string;
  match_timeline_events: string[];
  attack_momentum_time_series: string[];
  adaptive_window_active?: boolean;
  temporal_lag_minutes?: number;
  temporal_inversion_detected?: boolean;
}

/** 让球/大小球盘口对象的宽松但类型安全的形状（YBTY/雷速/annotate 后多态兼容）。 */
export interface CoreMarketLine {
  handicap?: string | number | null;
  line?: string | number | null;
  total_line?: string | number | null;
  total?: string | number | null;
  spread?: string | number | null;
  home_selection?: string | number | null;
  away_selection?: string | number | null;
  selected_line?: string | number | null;
  home_odds?: number;
  away_odds?: number;
  over_odds?: number;
  under_odds?: number;
  current_odds?: number;
  is_quarter_line?: boolean;
}

/** 独赢（1X2）盘口对象的宽松但类型安全的形状。 */
export interface CoreEuroMarket {
  home_win?: number;
  home_odds?: number;
  home_win_odds?: number;
  home?: number;
  draw?: number;
  draw_odds?: number;
  draw_win_odds?: number;
  away_win?: number;
  away_odds?: number;
  away_win_odds?: number;
  away?: number;
}

export interface EvaluatorPayload {
  ai_brief: Omit<Partial<AiEvaluationBrief>, 'core_markets'> & {
    core_markets?: {
      ah_main?: CoreMarketLine | null;
      ah_secondary?: (CoreMarketLine | null | undefined)[] | CoreMarketLine | null;
      ou_main?: CoreMarketLine | null;
      ou_secondary?: (CoreMarketLine | null | undefined)[] | CoreMarketLine | null;
      euro_1x2?: CoreEuroMarket | null;
      ah_half?: CoreMarketLine | null;
      ou_half?: CoreMarketLine | null;
    }
  };
  data_blind_spot_warning?: string;
  live_physical_context?: LivePhysicalContext;
  historical_team_profiling?: EvaluatorTeamProfiling;
  lineup_value_matrix?: EvaluatorLineupMatrix | string;
  quant_features?: EvaluatorQuantFeatures;
  oos_context?: OosHistoricalContext;
}

export interface QuarterLineSettlementDistribution {
  p_full_win?: number;
  p_half_win?: number;
  p_push?: number;
  p_half_loss?: number;
  p_full_loss?: number;
  settlement_status?: 'VERIFIED' | 'SETTLEMENT_UNVERIFIABLE';
}

export interface MarketScanResult {
  selected_line: string;
  market: 'ASIAN_HANDICAP_MAIN' | 'ASIAN_HANDICAP_SECONDARY' | 'TOTAL_GOALS_MAIN' | 'TOTAL_GOALS_SECONDARY' | 'EURO_1X2' | 'NONE' | string;
  market_status?: 'NO_VALID_MARKET' | 'VALID_BUT_BLOCKED' | 'ACTIONABLE';
  direction: 'HOME' | 'AWAY' | 'OVER' | 'UNDER' | 'DRAW' | 'NONE';
  current_odds: number;
  minimum_acceptable_odds: number;
  raw_ev: number;
  // QUALITATIVE_ONLY 时严禁伪造数字，必须为 0 (P1-02)
  risk_adjusted_ev: number;
  risk_adjustment_status?: 'ENGINE_PROVIDED' | 'QUALITATIVE_ONLY' | 'UNAVAILABLE';
  is_quarter_line: boolean;
  quarter_line_settlement_distribution?: QuarterLineSettlementDistribution;
  mathematically_closed?: boolean;
  actionable: boolean;
  rejection_reason?: string;
}

export interface RecommendedLeg {
  market: string;
  selected_line: string;
  current_odds: number;
  minimum_acceptable_odds: number;
  direction: 'HOME' | 'AWAY' | 'OVER' | 'UNDER' | 'DRAW' | 'NONE';
  basis: string;
  oos_status?: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'OOS_COLD_START_EXEMPT' | 'OOS_REJECTED';
  /** 推荐腿的模型概率与滚球分钟（Layer 05 台账持久化读取）。 */
  model_probability?: number;
  probability?: number;
  minute?: number;
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
  match: string;
  /** Immutable Layer 03 candidate authorization snapshot. AI/Risk layers must not infer eligibility independently. */
  candidate_pipeline: Layer03CandidatePipeline;
  evaluation_time: string;
  
  blind_spot_analysis: BlindSpotChecklist;
  
  // Concise decision audit summarizing verified evidence, risk adjustments, and gate decisions
  internal_logical_audit: string;
  
  grade: RecommendationGrade;
  confidence_score: number; // 0-100
  
  qualitative_summary: string;
  risk_warnings: string[];
  
  /** Separated market scan discovery: records best scanned line regardless of actionability */
  market_scan?: MarketScanResult;

  recommended_legs: RecommendedLeg[];
}

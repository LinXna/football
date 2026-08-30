/**
 * @file types.ts
 * @description Layer 03 确定性量化与博弈引擎数据契约与接口定义 (37 项要素 SSOT)
 */

import {
  MarketType,
  DevigMethod,
  PoissonDecayCurve,
  MomentumTrend,
  BookmakerPosture,
  GoalPhaseAlert,
  DataDeficitSeverity,
  L0MissingReason,
  QuantAlert,
  Layer03OpId,
  Layer03FeatureId
} from './enums.js';

export * from './enums.js';

export interface QuantEngineOptions {
  enable_shin_devig?: boolean;
  h2h_half_life_days?: number;
  max_poisson_goals?: number;
  late_game_urgency_minute_threshold?: number;
}

export interface HistoricalMatchWeight {
  date: string;
  days_ago: number;
  decay_weight: number;
  is_valid: boolean;
}

export interface RecentFormContextWeight {
  match_id?: string;
  venue_homomorphism_weight: number;
  competition_importance_weight: number;
  final_composite_weight: number;
}

export interface L0CircuitBreakerResult {
  is_triggered: boolean;
  reasons: L0MissingReason[];
  details: string[];
}

export interface CleanedContextFeatures {
  circuit_breaker: L0CircuitBreakerResult;
  h2h_weights: HistoricalMatchWeight[];
  recent_form_weights: {
    home: RecentFormContextWeight[];
    away: RecentFormContextWeight[];
  };
  lineup_impact: {
    home_lis: number;
    away_lis: number;
    home_missing_core_players: string[];
    away_missing_core_players: string[];
  };
  motivation_urgency: {
    home_mui: number;
    away_mui: number;
    home_stage_context: string;
    away_stage_context: string;
  };
  goal_timing_validity: {
    sample_count: number;
    is_valid_sample: boolean;
    requires_bayesian_shrinkage: boolean;
  };
}

export interface MomentumTimelineFeatures {
  total_points: number;
  current_instant_momentum: number;
  slope_5m: number;
  slope_10m: number;
  slope_15m: number;
  integral_5m: { home: number; away: number; net: number };
  integral_15m: { home: number; away: number; net: number };
  integral_full_match: { home: number; away: number; net: number };
  dominance_side: 'home' | 'away' | 'neutral';
  inflection_count_recent_15m: number;
  is_sustained_siege: boolean;
  is_counter_attack_surge: boolean;
}

export interface RealTimePhysicalStatsFeatures {
  xt_proxy: {
    home_xt: number;
    away_xt: number;
    xt_ratio: number;
  };
  conversion_efficiency: {
    home_conversion: number;
    away_conversion: number;
    home_accuracy: number;
    away_accuracy: number;
  };
  pressure_index: number;
  tactical_anomaly: {
    home_barren_dominance: boolean;
    away_barren_dominance: boolean;
    home_lethal_counter: boolean;
    away_lethal_counter: boolean;
  };
  red_card_penalty: {
    home_attack_multiplier: number;
    home_defense_leak_multiplier: number;
    away_attack_multiplier: number;
    away_defense_leak_multiplier: number;
  };
}

export interface InPlayPoissonFeatures {
  elapsed_minute: number;
  remaining_minutes: number;
  time_decay_curve: PoissonDecayCurve;
  lambda_home_rest: number;
  lambda_away_rest: number;
  expected_goals_rest: number;
  rest_score_matrix: {
    prob_home_win_rest: number;
    prob_draw_rest: number;
    prob_away_win_rest: number;
  };
  projected_final_score: {
    home: number;
    away: number;
    most_likely_score: string;
  };
}

export interface SingleMarketDevig {
  market_type: MarketType;
  raw_overround: number;
  devig_method: DevigMethod;
  fair_probabilities: number[];
  fair_odds: number[];
}

export interface SpreadEVAssessment {
  line: string;
  home_odds: number;
  away_odds: number;
  home_ev: number;
  away_ev: number;
  preferred_side: 'home' | 'away' | 'none';
  is_positive_ev: boolean;
}

export interface TotalEVAssessment {
  line: string;
  over_odds: number;
  under_odds: number;
  over_ev: number;
  under_ev: number;
  preferred_side: 'over' | 'under' | 'none';
  is_positive_ev: boolean;
}

export interface DeviggedMarketFeatures {
  h2h_devig: SingleMarketDevig;
  spread_main_ev: SpreadEVAssessment;
  spread_secondary_ev: SpreadEVAssessment[];
  total_main_ev: TotalEVAssessment;
  total_secondary_ev: TotalEVAssessment[];
  line_dispersion: {
    spread_variance: number;
    total_variance: number;
  };
  bookmaker_posture: BookmakerPosture;
}

export interface PositiveEVSignal {
  market: string;
  line: string;
  side: string;
  odds: number;
  ev: number;
  confidence: number;
}

export interface QuantitativeFeatures {
  canonical_id: string;
  calculated_at: string;
  context: CleanedContextFeatures;
  timeline: MomentumTimelineFeatures;
  physical_stats: RealTimePhysicalStatsFeatures;
  poisson: InPlayPoissonFeatures;
  devig: DeviggedMarketFeatures;
  battlefield_dominance_index: number;
  goal_phase_alert: GoalPhaseAlert;
  positive_ev_signals: PositiveEVSignal[];
  risk_flags: QuantAlert[];
  confidence_score: number;
}

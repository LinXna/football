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
  MarketStanceType,
  EventPressureConversionType,
  TacticalRegimeType,
  GoalClimaxLevel,
  Layer03OpId,
  Layer03FeatureId
} from './enums';

export * from './enums.js';

export interface QuantEngineOptions {
  enable_shin_devig?: boolean;
  h2h_half_life_days?: number;
  max_poisson_goals?: number;
  late_game_urgency_minute_threshold?: number;
}

/**
 * 赛前多维关联理论先验 (Stage 1: Prematch Theory Prior)
 */
export interface PrematchTheoryPrior {
  lambda_home_theory: number;             // 主队理论进球期望 (e.g. 1.65)
  lambda_away_theory: number;             // 客队理论进球期望 (e.g. 0.95)
  squad_strength_differential: number;   // 阵容实力净差值 [-1.0, 1.0]
  form_momentum_differential: number;    // 近态战意净差值 [-1.0, 1.0]
  prior_fair_home_win_prob: number;      // 理论主胜概率
  prior_fair_draw_prob: number;          // 理论平局概率
  prior_fair_away_win_prob: number;      // 理论客胜概率
  theory_total_goals_expected: number;   // 理论总进球期望 (λ_H + λ_A)
}

/**
 * 机构盘口博弈偏差检验与校准 (Stage 1.1: Market Calibration Result)
 */
export interface MarketCalibrationResult {
  lambda_base_home: number;              // 博弈校准后的基准进球期望 λ_base_H
  lambda_base_away: number;              // 博弈校准后的基准进球期望 λ_base_A
  divergence_delta: number;              // 理论 vs 机构偏差量 (Δ)
  market_stance: MarketStanceType;       // 机构姿态识别
  market_confidence_penalty: number;     // 离散度与异常诱盘扣分
  implied_market_home_win_prob: number;  // 机构隐含主胜概率 (Shin去水后)
  implied_market_draw_prob: number;      // 机构隐含平局概率
  implied_market_away_win_prob: number;  // 机构隐含客胜概率
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

export interface ScoreProbabilityItem {
  home: number;
  away: number;
  probability: number;
  percentage_str: string;
}

export interface InPlayPoissonFeatures {
  elapsed_minute: number;
  remaining_minutes: number;
  time_decay_curve: PoissonDecayCurve;
  lambda_home_rest: number;
  lambda_away_rest: number;
  expected_goals_rest: number;
  lambda_source: 'MARKET_IMPLIED' | 'LEAGUE_DNA' | 'FALLBACK';
  top_final_scores: ScoreProbabilityItem[];
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
  kelly_fraction?: number;
}

export interface TotalEVAssessment {
  line: string;
  over_odds: number;
  under_odds: number;
  over_ev: number;
  under_ev: number;
  preferred_side: 'over' | 'under' | 'none';
  is_positive_ev: boolean;
  kelly_fraction?: number;
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
  kelly_fraction: number;
}

/**
  * 攻防势能转化 (Event-to-Pressure Conversion)
  */
export interface TeamEPIFeatures {
  energy_15m: number;
  event_score_15m: number;
  conversion_ratio: number;
  classification: EventPressureConversionType;
}

export interface EventPressureConversionFeatures {
  home: TeamEPIFeatures;
  away: TeamEPIFeatures;
  potency_differential: number; // home.conversion_ratio - away.conversion_ratio
}

/**
 * 战术相变与事件后态势 (Tactical Regime State)
 */
export interface TacticalRegimeFeatures {
  current_regime: TacticalRegimeType;
  last_goal_elapsed_minutes?: number;
  last_goal_scorer?: 'home' | 'away';
  red_card_active_side?: 'home' | 'away' | 'both' | 'none';
  red_card_elapsed_minutes?: number;
  tactical_description: string;
  regime_multiplier_home: number;
  regime_multiplier_away: number;
}

/**
 * 破门势能临界态探测 (Goal Climax Tipping Point)
 */
export interface GoalClimaxFeatures {
  climax_score: number; // 0 ~ 100
  climax_level: GoalClimaxLevel;
  attacking_side: 'home' | 'away' | 'none';
  momentum_acceleration_5m: number; // d²M/dt²
  recent_incident_density_5m: number;
  is_imminent_threat: boolean;
}

/**
 * 时空事件共生综合特征 (Spatio-Temporal Event Co-Evolution)
 */
export interface SpatioTemporalEventFeatures {
  epi: EventPressureConversionFeatures;
  regime: TacticalRegimeFeatures;
  goal_climax: GoalClimaxFeatures;
}

export interface QuantitativeFeatures {
  canonical_id: string;
  calculated_at: string;
  context: CleanedContextFeatures;
  prematch_prior?: PrematchTheoryPrior;
  market_calibration?: MarketCalibrationResult;
  timeline: MomentumTimelineFeatures;
  physical_stats: RealTimePhysicalStatsFeatures;
  poisson: InPlayPoissonFeatures;
  devig: DeviggedMarketFeatures;
  spatio_temporal_events: SpatioTemporalEventFeatures;
  battlefield_dominance_index: number;
  goal_phase_alert: GoalPhaseAlert;
  positive_ev_signals: PositiveEVSignal[];
  risk_flags: QuantAlert[];
  confidence_score: number;
}

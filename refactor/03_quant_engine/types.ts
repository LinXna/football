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
  calibration_profile?: QuantCalibrationProfile;
  calibration_archive?: OosCalibrationArchive;
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
  match_id?: string;
  date: string;
  days_ago: number;
  decay_weight: number;
  is_valid: boolean;
  competition_importance: number;
  home_goals: number;
  away_goals: number;
  half_home_goals: number;
  half_away_goals: number;
  red_cards_home: number;
  red_cards_away: number;
  corners_home: number;
  corners_away: number;
  handicap_opening_line: number | null;
  handicap_current_line: number | null;
  dangerous_attack_ratio: number | null; // 主队危攻占比 home / (home + away)
  shots_ratio: number | null;            // 主队射门占比
  // 深层攻防全指标双向真实门禁
  is_tactical_valid: boolean;           // 是否满足双向全套客观真实攻防统计与有效角球
  tactical_invalidation_reason?: string;// 若深层战术数据无效，记录具体原因
}

export interface RecentFormContextWeight {
  match_id?: string;
  match_date?: string;
  days_ago: number;
  time_decay_weight: number;             // 时间衰减系数 [0.0 ~ 1.0]
  venue_homomorphism_weight: number;     // 主客同构权重 (1.0 vs 0.65)
  competition_importance_weight: number; // 赛事级别与同名赛事权重 [0.0 ~ 1.0]
  final_composite_weight: number;        // 复合权重
  is_valid_time_window: boolean;         // 是否在有效时间窗口 (<=180天)
  scored_full: number;                   // 本队全场进球
  conceded_full: number;                 // 本队全场失球
  scored_half: number;                   // 本队半场进球
  conceded_half: number;                 // 本队半场失球
  scored_second_half: number;            // 本队下半场进球
  conceded_second_half: number;          // 本队下半场失球
  is_clean_sheet: boolean;               // 是否零封
  is_failed_to_score: boolean;           // 是否被零封
  handicap_result: 'WIN' | 'LOSS' | 'DRAW' | 'UNKNOWN';
  goals_trend_result: 'BIG' | 'SMALL' | 'UNKNOWN';
}

export interface RecentFormDetailedAnalytics {
  sample_count: number;
  valid_count: number;
  // 综合得失球期望与方差
  weighted_scored_per_game: number;
  weighted_conceded_per_game: number;
  // 半场与下半场攻防解耦
  first_half_scored_avg: number;
  first_half_conceded_avg: number;
  second_half_scored_avg: number;
  second_half_conceded_avg: number;
  // 战术攻防特性
  slow_starter_index: number;            // 慢热指数: 下半场进球占比 / (全场进球 + ε)
  second_half_surge_rate: number;        // 下半场发力率
  clean_sheet_rate: number;              // 零封率
  failed_to_score_rate: number;          // 哑火率
  // 盘路赢盘能力
  handicap_win_rate: number;             // 赢盘率
  over_goals_rate: number;               // 大球率
}

export interface H2HDetailedAnalytics {
  sample_count: number;                  // 历史交锋总场次
  valid_count: number;                   // 时间与基础比分有效场次 (<=730天)
  tactical_valid_count: number;          // 具备全套双向真实攻防与角球客观统计的有效场次
  tactical_metrics_available: boolean;   // 是否具备充足有效的战术攻防样本 (tactical_valid_count >= 1)
  total_decayed_weight: number;
  tactical_decayed_weight: number;       // 战术攻防样本衰减权重和
  // 历史交锋净胜均值与场面压制 (基于宏观真实比分)
  net_goal_differential_weighted: number;
  historical_h2h_advantage_home: number;  // [-0.20, +0.20]
  historical_under_rate: number;         // 历史交锋小球倾向率
  // 深度战术指标 (严禁假 0 与假默认值，仅当 tactical_metrics_available 时真实计算，否则为 null 或 0.0)
  historical_avg_corners: number | null; // 历史平均角球 (若无有效深层统计则为 null，严禁假 0 或假 9.0)
  historical_avg_red_cards: number;      // 历史平均红牌
  tactical_stylistic_clash_index: number;// 球风相克指数 [-1.0, 1.0] (仅基于有效战术样本，若无有效样本严格为 0.0)
}

export interface L0CircuitBreakerResult {
  is_triggered: boolean;
  reasons: L0MissingReason[];
  details: string[];
}

export interface IsoVenueStandingRecord {
  matches_played: number;
  won: number;
  draw: number;
  loss: number;
  goals_scored: number;
  goals_conceded: number;
  goal_difference: number;
  points: number;
  goals_per_game_scored: number;
  goals_per_game_conceded: number;
}

export interface GoalDistributionDNAFeatures {
  has_data: boolean;
  home_scored_weights: number[]; // 6 个 15 分钟区间占比 [0-15', 16-30', 31-45', 46-60', 61-75', 76-90']
  away_scored_weights: number[];
  home_late_game_dna: number;    // 75'+ 进球占比
  away_late_game_dna: number;
  home_early_game_dna: number;   // 0-30' 进球占比
  away_early_game_dna: number;
}

export interface TacticalFormationFeatures {
  home_formation: string;
  away_formation: string;
  formation_matched: boolean;
  wing_space_vulnerability_home: number; // 边肋部空档暴露度 [0.0 ~ 1.0]
  wing_space_vulnerability_away: number;
  midfield_congestion_index: number;     // 中场绞杀密集度
  formation_tactical_description: string;
}

export interface CleanedContextFeatures {
  circuit_breaker: L0CircuitBreakerResult;
  h2h_weights: HistoricalMatchWeight[];
  h2h_analytics: H2HDetailedAnalytics;
  recent_form_weights: {
    home: RecentFormContextWeight[];
    away: RecentFormContextWeight[];
  };
  recent_form_analytics: {
    home: RecentFormDetailedAnalytics;
    away: RecentFormDetailedAnalytics;
  };
  iso_venue_standings: {
    home_at_home: IsoVenueStandingRecord | null;
    away_at_away: IsoVenueStandingRecord | null;
  };
  goal_distribution_dna: GoalDistributionDNAFeatures;
  tactical_formation: TacticalFormationFeatures;
  lineup_impact: {
    home_lis: number;
    away_lis: number;
    home_missing_core_players: string[];
    away_missing_core_players: string[];
    home_striker_missing: boolean;
    away_striker_missing: boolean;
    home_defender_missing: boolean;
    away_defender_missing: boolean;
    home_market_value_num: number;
    away_market_value_num: number;
    home_best_player_active: boolean;
    away_best_player_active: boolean;
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
  stats_available: boolean;
  stats_basis: 'CUMULATIVE_QUALITY_BASELINE' | 'UNAVAILABLE';
  available_metrics: {
    dangerous_attacks: boolean;
    attacks: boolean;
    shots: boolean;
    shots_on_target: boolean;
    shots_off_target: boolean;
    corners: boolean;
    possession: boolean;
    yellow_cards: boolean;
    red_cards: boolean;
  };
  xt_proxy: {
    home_xt?: number;
    away_xt?: number;
    xt_ratio?: number;
  };
  possession_effectiveness: {
    home_pe?: number; // DA / (Possession + ε)
    away_pe?: number;
  };
  penetration_rate: {
    home_penetration?: number; // DA / Attacks
    away_penetration?: number;
  };
  shot_efficiency: {
    home_accuracy?: number; // SOT / Total Shots
    away_accuracy?: number;
    home_woodwork_count?: number; // 仅由明确的门柱/中柱事件确认，Type 22 仅代表射偏
    away_woodwork_count?: number;
  };
  corner_pressure: {
    home_corners_total?: number;
    away_corners_total?: number;
    is_corner_cascade?: boolean;
    window_source?: 'SNAPSHOT_DELTA' | 'EVENT_TIMELINE' | 'CUMULATIVE_BASELINE' | 'UNAVAILABLE';
  };
  counter_threat_index: {
    home_counter_threat?: number; // 越位 + 单刀打身后指数
    away_counter_threat?: number;
  };
  discipline_pressure: {
    home_yellows?: number;
    away_yellows?: number;
    home_defenders_on_yellow?: number;
    away_defenders_on_yellow?: number;
  };
  conversion_efficiency: {
    home_conversion?: number;
    away_conversion?: number;
    home_accuracy?: number;
    away_accuracy?: number;
  };
  pressure_index?: number;
  tactical_anomaly: {
    home_barren_dominance?: boolean;
    away_barren_dominance?: boolean;
    home_lethal_counter?: boolean;
    away_lethal_counter?: boolean;
  };
  red_card_penalty: {
    home_attack_multiplier?: number;
    home_defense_leak_multiplier?: number;
    away_attack_multiplier?: number;
    away_defense_leak_multiplier?: number;
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
  is_stoppage_time_unpriceable: boolean;
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
  h2h_devig?: SingleMarketDevig;
  spread_main_ev?: SpreadEVAssessment;
  spread_secondary_ev: SpreadEVAssessment[];
  total_main_ev?: TotalEVAssessment;
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

export interface QuantCalibrationProfile {
  status: 'VALIDATED' | 'INSUFFICIENT_EVIDENCE' | 'REJECTED';
  league_key: string;
  team_key?: string;
  minute_band: string;
  score_state: string;
  red_card_state?: string;
  market: OosMarket;
  sample_size: number;
  effective_sample_size: number;
  oos_brier_score: number | null;
  lambda_log_adjustment: number;
}

export type OosMarket = 'ASIAN_HANDICAP_MAIN' | 'TOTAL_GOALS_MAIN';

/** 单条已结算、绝不参与同批模型拟合的 OOS 观测。 */
export interface OosCalibrationSample {
  sample_id: string;
  /** 生成预测所用的冻结量化模型版本。 */
  model_version: string;
  /** 预测在该时间点已经固化；必须严格早于档案训练截止点。 */
  prediction_at: string;
  league_key: string;
  home_team_key: string;
  away_team_key: string;
  stage: 'PREMATCH' | 'LIVE';
  minute: number | null;
  score_state: string;
  red_card_state: string;
  market: OosMarket;
  model_probability: number;
  /** 与 model_probability 对应的二元市场事件结果。 */
  outcome: number;
  predicted_lambda: number;
  observed_goals: number;
}

/** 可持久化的 OOS 校准档案；仅 VALIDATED 档案可解锁机器候选。 */
export interface OosCalibrationArchive {
  schema_version: 1;
  generated_at: string;
  model_version: string;
  training_window_start_at: string;
  training_window_end_at: string;
  prediction_window_start_at: string;
  prediction_window_end_at: string;
  training_cutoff_at: string;
  global_profile: QuantCalibrationProfile;
  profiles: readonly QuantCalibrationProfile[];
}

export interface OosArchiveBuildOptions {
  generated_at: string;
  model_version: string;
  training_window_start_at: string;
  training_window_end_at: string;
  prediction_window_start_at: string;
  prediction_window_end_at: string;
}

/**
 * 三位一体实时威胁完整性：动量给出压制方向，事件给出近窗发生时点，
 * 累计技术统计仅作为按比赛时间归一化的质量基线，三者必须共同确认。
 */
export interface TeamLiveThreatIntegrity {
  momentum_support: number;
  event_support: number;
  stats_support: number;
  alignment_score: number;
  calibrated_threat: number;
  has_conflict: boolean;
}

export interface LiveThreatTrinityFeatures {
  home: TeamLiveThreatIntegrity;
  away: TeamLiveThreatIntegrity;
  dominant_side: 'home' | 'away' | 'none';
  has_material_conflict: boolean;
  rationale: string[];
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
  post_goal_cooldown_active: boolean;
  is_imminent_threat: boolean;
}

/**
 * 时空事件共生综合特征 (Spatio-Temporal Event Co-Evolution)
 */
export interface SpatioTemporalEventFeatures {
  live_threat_trinity: LiveThreatTrinityFeatures;
  epi: EventPressureConversionFeatures;
  regime: TacticalRegimeFeatures;
  goal_climax: GoalClimaxFeatures;
}

/** 唯一实时决策状态：下游不得重新读取原始动量、xT 或累计统计。 */
export interface UnifiedMatchState {
  home_intensity: number;
  away_intensity: number;
  dominance_index: number;
  imminent_goal: boolean;
  post_goal_cooldown_active: boolean;
  has_evidence_conflict: boolean;
  source_lineage_discount: number;
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
  match_state: UnifiedMatchState;
  battlefield_dominance_index: number;
  goal_phase_alert: GoalPhaseAlert;
  positive_ev_signals: PositiveEVSignal[];
  risk_flags: QuantAlert[];
  confidence_score: number;
  confidence_breakdown: {
    data_quality_score: number;
    model_stability_score: number;
    edge_confidence_score: number;
  };
}

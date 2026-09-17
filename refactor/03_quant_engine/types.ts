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
import { MatchStage } from '../02_canonical_model/enums.js';

export * from './enums.js';

export interface QuantEngineOptions {
  enable_shin_devig?: boolean;
  h2h_half_life_days?: number;
  max_poisson_goals?: number;
  late_game_urgency_minute_threshold?: number;
  calibration_profile?: QuantCalibrationProfile;
  calibration_archive?: OosCalibrationArchive;
  permissive_oos_mode?: boolean;
  allow_secondary_lines?: boolean;
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
  is_in_play_market: boolean;            // true means λ base is already remaining-goals semantics
  divergence_delta: number;              // 理论 vs 机构偏差量 (Δ)
  market_stance: MarketStanceType;       // 机构姿态识别
  market_confidence_penalty: number;     // 离散度与异常诱盘扣分
  implied_market_home_win_prob: number;  // 机构隐含主胜概率 (Shin去水后)
  implied_market_draw_prob: number;      // 机构隐含平局概率
  implied_market_away_win_prob: number;  // 机构隐含客胜概率
  market_weight_applied: number;         // 实际生效的市场权重 [0.0 ~ 1.0]
  theory_weight_applied: number;         // 实际生效的理论先验权重 [0.0 ~ 1.0]
  theory_prior?: PrematchTheoryPrior;
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
  historical_under_rate: number | null;         // 历史交锋小球倾向率
  // 深度战术指标 (严禁假 0 与假默认值，仅当 tactical_metrics_available 时真实计算，否则为 null 或 0.0)
  historical_avg_corners: number | null; // 历史平均角球 (若无有效深层统计则为 null，严禁假 0 或假 9.0)
  historical_avg_red_cards: number | null;      // 历史平均红牌
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
  home_sample_size: number;      // 实际进球样本总数 N
  away_sample_size: number;
  home_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT'; // 成熟度
  away_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
  is_home_specific: boolean;     // 是否提取自主场专用切片 (Home Venue)
  is_away_specific: boolean;     // 是否提取自客场专用切片 (Away Venue)
}

export interface TacticalFormationFeatures {
  home_formation: string;
  away_formation: string;
  both_formations_known: boolean;
  formation_matched: boolean;
  wing_space_vulnerability_home: number; // 边肋部空档暴露度 [0.0 ~ 1.0]
  wing_space_vulnerability_away: number;
  midfield_congestion_index: number;     // 中场绞杀密集度
  formation_tactical_description: string;
}

export type LineupStatus = 'CONFIRMED' | 'PROJECTED' | 'NOT_ANNOUNCED';

export interface LineupImpactFeatures {
  home_lis: number;
  away_lis: number;
  lineup_status: LineupStatus;
  is_lineup_confirmed: boolean;
  home_missing_core_players: string[];
  away_missing_core_players: string[];
  home_striker_missing: boolean;
  away_striker_missing: boolean;
  home_defender_missing: boolean;
  away_defender_missing: boolean;
  // 核心战力解耦与大腿球员标识 (SSOT 物理契约)
  home_attack_injury_factor: number;  // 进攻端战力保持率 [0.65, 1.00]
  away_attack_injury_factor: number;
  home_defense_leak_factor: number;   // 防守端漏洞恶化乘子 [1.00, 1.50]
  away_defense_leak_factor: number;
  home_talisman_missing: boolean;     // 是否全队身价断层第一的大腿缺阵
  away_talisman_missing: boolean;
  home_talisman_name?: string;
  away_talisman_name?: string;
  home_market_value_num: number;
  away_market_value_num: number;
  home_best_player_active: boolean;
  away_best_player_active: boolean;
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
  lineup_impact: LineupImpactFeatures;
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
  window_basis?: 'MINUTE_ALIGNED' | 'POINT_COUNT_FALLBACK' | 'UNAVAILABLE';
  cutoff_minute?: number | null;
  window_coverage_minutes?: { from: number | null; to: number | null };
  window_sample_counts?: { five: number; ten: number; fifteen: number };
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
  /** 方案 6：多源动态截断与自适应窗口调和特征 */
  adaptive_window_ratio?: { five: number; ten: number; fifteen: number };
  is_early_match_dampened?: boolean;
  temporal_inversion_detected?: boolean;
  temporal_lag_warning?: boolean;
  temporal_lag_minutes?: number;
  /** 多尺度动量金字塔模型 (5m: 40%, 10m: 35%, 15m: 25%) */
  momentum_pyramid?: {
    composite_slope: number;
    composite_energy: number;
    consistency: 'ALIGNED' | 'DIVERGENT' | 'TURNING';
    trend_hierarchy: {
      short_term_5m: number;
      medium_term_10m: number;
      macro_15m: number;
    };
  };
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
    home_big_chance_threat?: number;       // 射正扑救成色：制造神扑/门线解围/必进球成色加权
    away_big_chance_threat?: number;
    home_keeper_saves_severity?: number;   // 守方门将受迫神扑/扑救脱手险情负荷
    away_keeper_saves_severity?: number;
  };
  corner_pressure: {
    home_corners_total?: number;
    away_corners_total?: number;
    is_corner_cascade?: boolean;
    window_source?: 'SNAPSHOT_DELTA' | 'EVENT_TIMELINE' | 'CUMULATIVE_BASELINE' | 'UNAVAILABLE';
    home_sterile_corner_discount?: boolean;
    away_sterile_corner_discount?: boolean;
    home_corner_quality_factor?: number;
    away_corner_quality_factor?: number;
  };
  counter_threat_index: {
    home_counter_threat?: number; // 越位 + 单刀打身后指数
    away_counter_threat?: number;
    home_directness_ratio?: number;       // 纵向反击锐度比 (Directness Ratio)
    away_directness_ratio?: number;
    high_directness_counter_side?: 'home' | 'away' | 'none'; // 高锐度反击方标识
  };
  discipline_pressure: {
    home_yellows?: number;
    away_yellows?: number;
    home_defenders_on_yellow?: number;
    away_defenders_on_yellow?: number;
    home_yellow_burst_10m?: number;
    away_yellow_burst_10m?: number;
    home_tactical_foul_yellows?: number;
    away_tactical_foul_yellows?: number;
    home_dissent_time_yellows?: number;
    away_dissent_time_yellows?: number;
    home_siege_yellows_10m?: number;
    away_siege_yellows_10m?: number;
    home_yellow_collapse_risk?: boolean;
    away_yellow_collapse_risk?: boolean;
    home_discipline_leak_factor?: number;
    away_discipline_leak_factor?: number;
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
  /** 进攻威胁指数 (TTI, Threat Transformation Index = 射门转化率 * 危险进攻强度 * 进区触球代理) */
  threat_transformation_index?: {
    home_tti?: number;
    away_tti?: number;
    ratio?: number;
    advantage_side?: 'home' | 'away' | 'neutral';
    classification?: {
      home: 'LETHAL_PENETRATION' | 'EFFECTIVE_ATTACK' | 'STERILE_POSSESSION' | 'LOW_ACTIVITY';
      away: 'LETHAL_PENETRATION' | 'EFFECTIVE_ATTACK' | 'STERILE_POSSESSION' | 'LOW_ACTIVITY';
    };
  };
  red_card_penalty: {
    home_attack_multiplier?: number;
    home_defense_leak_multiplier?: number;
    away_attack_multiplier?: number;
    away_defense_leak_multiplier?: number;
    home_scenario?: 'LEADING_PARK_BUS' | 'DRAW_BALANCED_ATTRITION' | 'TRAILING_COLLAPSE_RISK' | 'NONE';
    away_scenario?: 'LEADING_PARK_BUS' | 'DRAW_BALANCED_ATTRITION' | 'TRAILING_COLLAPSE_RISK' | 'NONE';
    elite_override_active?: boolean;
    elite_override_side?: 'home' | 'away' | 'none';
    elite_override_factor?: number;
    home_role_breakdown?: {
      defender_or_gk_count: number;
      forward_count: number;
      midfielder_count: number;
    };
    away_role_breakdown?: {
      defender_or_gk_count: number;
      forward_count: number;
      midfielder_count: number;
    };
  };
}

export interface ScoreProbabilityItem {
  home: number;
  away: number;
  probability: number;
  percentage_str: string;
}

export interface LambdaDecomposition {
  raw_market_lambda_home?: number;
  raw_market_lambda_away?: number;
  theory_lambda_home?: number;
  theory_lambda_away?: number;
  market_base_home: number;
  market_base_away: number;
  market_weight_applied: number;
  theory_weight_applied: number;
  weighted_base_lambda_home?: number;
  weighted_base_lambda_away?: number;
  context_multiplier_home: number;
  context_multiplier_away: number;
  base_after_context_home: number;
  base_after_context_away: number;
  observed_pace_multiplier_home?: number;
  observed_pace_multiplier_away?: number;
  observed_pace_weight?: number;
  observed_pace_full_match_rate?: number;
  time_fraction_home: number;
  time_fraction_away: number;
  urgency_multiplier: number;
  threat_home: number;
  threat_away: number;
  regime_multiplier_home?: number;
  regime_multiplier_away?: number;
  red_attack_home: number;
  red_attack_away: number;
  red_leak_home: number;
  red_leak_away: number;
  post_goal_cooldown_multiplier: number;
  oos_multiplier?: number;
  coherent_state_home?: number;
  coherent_state_away?: number;
  decoherence_applied_home?: boolean;
  decoherence_applied_away?: boolean;
  live_regime_stage?: 'OPENING' | 'MID_MATCH' | 'LATE_SURGE';
  live_stats_weight?: number;
  prior_context_weight?: number;
  lambda_before_live_context_home?: number;
  lambda_before_live_context_away?: number;
  lambda_after_live_context_home?: number;
  lambda_after_live_context_away?: number;
  final_lambda_home?: number;
  final_lambda_away?: number;
}

export interface DixonColesCorrectionTau {
  tau_0_0: number;
  tau_0_1: number;
  tau_1_0: number;
  tau_1_1: number;
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
  rho_used?: number;
  rho_source?: 'CALIBRATED' | 'DEFAULT_ASSUMPTION';
  dixon_coles_tau?: DixonColesCorrectionTau;
  lambda_decomposition: LambdaDecomposition;
  top_final_scores: ScoreProbabilityItem[];
  rest_score_matrix: {
    prob_home_win_rest: number;
    prob_draw_rest: number;
    prob_away_win_rest: number;
  };
  /** 完整剩余比分概率网格，仅供盘口冲突解析与审计，不允许下游自行重算。 */
  score_probability_grid?: number[][];
  full_time_probabilities?: {
    prob_home_win: number;
    prob_draw: number;
    prob_away_win: number;
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
  market_odds?: number[];
  model_probabilities?: number[];
  home_ev?: number;
  draw_ev?: number;
  away_ev?: number;
  preferred_side?: 'home' | 'draw' | 'away' | 'none';
  is_positive_ev?: boolean;
  kelly_fraction?: number;
  bayesian_shrinkage_applied?: boolean;
  shrinkage_factor?: number;
}

export interface FiveStateSettlementDistribution {
  p_full_win: number;
  p_half_win: number;
  p_push: number;
  p_half_loss: number;
  p_full_loss: number;
  source: 'ENGINE_COMPUTED' | 'CALIBRATED' | 'UNAVAILABLE';
}

export interface SpreadEVAssessment {
  line: string;
  home_line?: string;
  away_line?: string;
  selected_line?: string;
  selected_odds?: number;
  home_odds: number;
  away_odds: number;
  home_ev: number;
  away_ev: number;
  preferred_side: 'home' | 'away' | 'none';
  is_positive_ev: boolean;
  home_model_probability?: number;
  away_model_probability?: number;
  kelly_fraction?: number;
  home_settlement_distribution?: FiveStateSettlementDistribution;
  away_settlement_distribution?: FiveStateSettlementDistribution;
  bayesian_shrinkage_applied?: boolean;
  shrinkage_factor?: number;
}

export interface TotalEVAssessment {
  line: string;
  over_odds: number;
  under_odds: number;
  over_ev: number;
  under_ev: number;
  preferred_side: 'over' | 'under' | 'none';
  is_positive_ev: boolean;
  over_model_probability?: number;
  under_model_probability?: number;
  kelly_fraction?: number;
  over_settlement_distribution?: FiveStateSettlementDistribution;
  under_settlement_distribution?: FiveStateSettlementDistribution;
  bayesian_shrinkage_applied?: boolean;
  shrinkage_factor?: number;
}

export interface LineDispersionMetrics {
  spread_variance: number | 'UNAVAILABLE';
  total_variance: number | 'UNAVAILABLE';
  status?: 'CALCULATED' | 'PARTIAL' | 'UNAVAILABLE';
  spread_lines_count?: number;
  total_lines_count?: number;
}

export interface DeviggedMarketFeatures {
  h2h_devig?: SingleMarketDevig;
  spread_main_ev?: SpreadEVAssessment;
  spread_secondary_ev: SpreadEVAssessment[];
  total_main_ev?: TotalEVAssessment;
  total_secondary_ev: TotalEVAssessment[];
  line_dispersion: LineDispersionMetrics;
  bookmaker_posture: BookmakerPosture;
  shin_z?: number;
  shin_z_status?: 'DYNAMIC_ESTIMATED' | 'DEFAULT_ASSUMPTION' | 'UNAVAILABLE';
  posture_confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  ev_market_source: 'LIVE_YBTY' | 'LIVE_LEISU' | 'PREMATCH' | 'UNAVAILABLE';
}

export interface PositiveEVSignal {
  market: string;
  line: string;
  side: string;
  odds: number;
  ev: number;
  confidence: number;
  signal_confidence?: number;
  kelly_fraction: number;
  model_probability?: number;
  oos_status?: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'PERMISSIVE_PASSED' | 'NO_PROFILE' | 'INSUFFICIENT_EVIDENCE' | 'OOS_COLD_START_EXEMPT';
  oos_profile_key?: string;
  line_at_signal?: string;
  side_at_signal?: string;
  odds_at_signal?: number;
  score_at_signal?: string;
  score_at_bet?: string;
  line_at_bet?: string;
  odds_at_bet?: number;
  settlement_basis?: 'REST_OF_MATCH' | 'FULL_MATCH';
  snapshot_time?: string;
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
  stage?: 'PREMATCH' | 'LIVE' | 'ALL';
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
  circuit_breaker_triggered?: boolean;
  circuit_breaker_reason?: string;
}

export type OosMarket = 'ASIAN_HANDICAP_MAIN' | 'TOTAL_GOALS_MAIN' | 'MONEYLINE_1X2' | 'EURO_1X2';

/** 单条已结算、绝不参与同批模型拟合的 OOS 观测。 */
export interface OosCalibrationSample {
  sample_id: string;
  /** 生成预测所用的冻结量化模型版本；样本必须来自声明的 prediction window。 */
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
  /** 兼容与测试套件扩展别名 */
  binary_outcome?: number;
  predicted_probability?: number;
  match_id?: string;
}

/** 可持久化的 OOS 校准档案；仅 VALIDATED 档案可解锁机器候选。 */
export interface OosCalibrationArchive {
  schema_version: 1;
  archive_provenance?: string;
  generated_at: string;
  model_version: string;
  training_window_start_at: string;
  training_window_end_at: string;
  prediction_window_start_at: string;
  prediction_window_end_at: string;
  training_cutoff_at: string;
  global_profile: QuantCalibrationProfile;
  global_profiles?: readonly QuantCalibrationProfile[];
  prematch_global_profiles?: readonly QuantCalibrationProfile[];
  live_global_profiles?: readonly QuantCalibrationProfile[];
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

export interface CandidateRegimeEnergy {
  regime: TacticalRegimeType;
  energy: number;
  description: string;
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
  neutral_equilibrium_threshold?: number;
  candidate_regime_energies?: readonly CandidateRegimeEnergy[];
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
  pressure_signal_nature?: 'RULE_BASED_PRESSURE_SIGNAL';
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
  regime_multiplier_home: number;
  regime_multiplier_away: number;
  dominance_index: number;
  imminent_goal: boolean;
  post_goal_cooldown_active: boolean;
  has_evidence_conflict: boolean;
  source_lineage_discount: number;
  red_card_attack_multiplier_home: number;
  red_card_attack_multiplier_away: number;
  red_card_defense_leak_multiplier_home: number;
  red_card_defense_leak_multiplier_away: number;
  discipline_leak_multiplier_home?: number;
  discipline_leak_multiplier_away?: number;
  yellow_collapse_risk_home?: boolean;
  yellow_collapse_risk_away?: boolean;
  home_tti?: number;
  away_tti?: number;
  pyramid_slope?: number;
  elite_override_applied?: boolean;
}

export interface Layer03LiveSnapshot {
  observed_at: string;
  cutoff_minute: number | null;
  event_cutoff_minute: number | null;
  source_snapshot_at: string | null;
  model_calculated_at: string;
  score: {
    home_score: number | null;
    away_score: number | null;
    score_verified: boolean;
  };
  stats_available: boolean;
  momentum_points: number;
  timeline_events_count: number;
  has_odds: boolean;
  adaptive_window_active?: boolean;
  temporal_lag_minutes?: number;
  temporal_inversion_detected?: boolean;
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
  goal_phase_alert_nature?: 'RULE_BASED_PRESSURE_SIGNAL' | 'NONE';
  live_snapshot?: Layer03LiveSnapshot;
  /** M5 原始正 EV，仅表示数学筛选结果，不代表可交易候选。 */
  raw_positive_ev_signals: PositiveEVSignal[];
  /** 冷启动研究候选，在 COLD_START_PERMISSIVE 下放行供人机研究初筛。 */
  research_candidate_signals?: PositiveEVSignal[];
  /** 仅保留通过数据质量、严格 OOS 档案校准 (ESS>=200) 的生产级 machine candidate。 */
  positive_ev_signals: PositiveEVSignal[];
  risk_flags: QuantAlert[];
  confidence_score: number;
  confidence_breakdown: {
    data_quality_score: number;
    model_stability_score: number;
    edge_confidence_score: number;
    signal_confidence?: number;
    data_quality_confidence?: number;
    market_confidence?: number;
    edge_confidence?: number;
    oos_confidence?: number;
    production_confidence?: number;
    overall_confidence?: number;
  };
  data_audit: Layer03DataAudit;
  production_gate: Layer03ProductionGate;
  candidate_pipeline: Layer03CandidatePipeline;
}

export type Layer03CalculationStatus = 'PRODUCTION_READY' | 'RESEARCH_ONLY' | 'BLOCKED';
export type Layer03CandidateStatus = 'PRODUCTION_UNLOCKED' | 'UNLOCKED' | 'OOS_LOCKED' | 'DATA_LOCKED' | 'COLD_START_PERMISSIVE';

export type Layer03CandidatePipelineState =
  | 'NO_POSITIVE_EV'
  | 'OOS_LOCKED'
  | 'DATA_LOCKED'
  | 'COLD_START_PERMISSIVE'
  | 'PRODUCTION_UNLOCKED';

export const OOS_VALIDATION_MIN_ESS = 30;
export const PRODUCTION_MATURE_ESS = 200;

export interface Layer03CandidateOosValidation {
  market: OosMarket | null;
  market_type?: string;
  normalized_line?: string;
  side?: string;
  settlement_type?: string;
  oos_profile_key?: string;
  status: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'INSUFFICIENT_EVIDENCE' | 'NO_PROFILE' | 'REJECTED' | 'UNSUPPORTED_MARKET' | 'VALIDATED' | 'OOS_COLD_START_EXEMPT';
  effective_sample_size: number;
  oos_brier_score: number | null;
  stage?: 'PREMATCH' | 'LIVE' | 'ALL';
  is_circuit_broken?: boolean;
  circuit_breaker_reason?: string;
  blockers: readonly string[];
}

export interface Layer03CandidatePipelineTransition {
  from: Layer03CandidatePipelineState | 'START';
  to: Layer03CandidatePipelineState;
  reason: string;
}

export interface Layer03CandidatePipeline {
  state: Layer03CandidatePipelineState;
  raw_signal_count: number;
  research_candidate_count: number;
  oos_validated_count: number;
  permissive_unlocked_count: number;
  cold_start_exempt_count?: number;
  is_cold_start_unlocked?: boolean;
  soft_gate_pass_count?: number;
  machine_candidate_count: number;
  production_eligible: boolean;
  validations: readonly Layer03CandidateOosValidation[];
  blockers: readonly string[];
  transitions: readonly Layer03CandidatePipelineTransition[];
  calibration_stage?: 'PREMATCH' | 'LIVE';
  is_stage_isolated?: boolean;
}

export interface Layer03ProductionGate {
  calculation_status: Layer03CalculationStatus;
  candidate_status: Layer03CandidateStatus;
  blockers: readonly string[];
  oos_requirement: string;
}

export type Layer03AuditCategory =
  | 'ATTACK_MOMENTUM'
  | 'LIVE_STATS'
  | 'TIMELINE_EVENTS'
  | 'LINEUPS'
  | 'H2H'
  | 'RECENT_FORM'
  | 'STANDINGS'
  | 'GOAL_DISTRIBUTION'
  | 'ODDS_MATRIX'
  | 'ENVIRONMENT';

export type Layer03AuditStatus = 'USED' | 'DEGRADED' | 'REJECTED' | 'NOT_APPLICABLE';

export interface Layer03AuditItem {
  category: Layer03AuditCategory;
  source: 'YBTY' | 'LEISU' | 'CANONICAL' | 'DERIVED';
  status: Layer03AuditStatus;
  quality_score: number;
  used_by: readonly string[];
  evidence: readonly string[];
  defects: readonly string[];
  sample_size?: number;
  covered_minute_from?: number | null;
  covered_minute_to?: number | null;
  weight?: number | null;
}

export interface Layer03DataAudit {
  generated_at: string;
  canonical_id: string;
  match_stage: MatchStage;
  source_snapshot_at: string | null;
  overall_status: 'PASS' | 'DEGRADED' | 'BLOCKED';
  items: readonly Layer03AuditItem[];
}

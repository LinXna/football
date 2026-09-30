import { AiEvaluationResult, RecommendedLeg } from '../04_ai_evaluator/types.js';
import { Layer03CandidatePipeline, PositiveEVSignal } from '../03_quant_engine/types.js';

export type BettingStage = 'LIVE' | 'PREMATCH';

export interface FormalRecommendation {
  record_type: 'formal_ai_recommendation';
  formal_recommendation: true;
  record_id: string; // uuid or composite hash
  stage: BettingStage;
  created_at_utc: string;
  
  match_id: string;
  kickoff_time: string;
  league_key: string;
  teams: { home: string, away: string };
  reference_teams?: {
    leisu_home?: string;
    leisu_away?: string;
    leisu_league?: string;
  } | null;
  candidate_pipeline_state: 'NO_POSITIVE_EV' | 'OOS_LOCKED' | 'DATA_LOCKED' | 'PRODUCTION_UNLOCKED' | 'TRIAL_UNLOCKED' | 'COLD_START_PERMISSIVE';
  oos_status?: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'OOS_COLD_START_EXEMPT' | 'OOS_REJECTED';
  
  // A snapshot of the exact conditions when the bet was placed
  condition_snapshot: {
    match_minute: string; // e.g. "LIVE 75'" or "PREMATCH"
    current_score: string; // e.g. "1 - 0" or "0 - 0"
    bdi?: number;
    goal_phase_alert?: string;
    machine_candidate_count?: number;
    candidate_pipeline_state?: 'NO_POSITIVE_EV' | 'OOS_LOCKED' | 'DATA_LOCKED' | 'PRODUCTION_UNLOCKED' | 'TRIAL_UNLOCKED' | 'COLD_START_PERMISSIVE';
    oos_status?: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'OOS_COLD_START_EXEMPT' | 'OOS_REJECTED';
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
  prediction_snapshot: {
    model_version: string;
    prediction_at: string;
    market: string;
    line: string;
    odds: number;
    model_probability: number;
    predicted_lambda: { home: number; away: number };
    minute: number | null;
    score_at_recommendation: string;
    score_verified: boolean;
    score_source: string;
    red_card_state: string;
  };
  
  // Post-match verification (Layer 06 populates this later)
  settlement?: {
    is_settled: boolean;
    settled_at?: string;
    outcome?: 'WIN' | 'WIN_HALF' | 'DRAW' | 'LOSE_HALF' | 'LOSE' | 'INVALID_DATA' | 'PENDING';
    final_score_verified?: string;
    final_score_source?: string;
    final_score_verified_at?: string;
    profit_loss?: number;
  };
}

export interface RiskFilterContext {
  existing_ledger: FormalRecommendation[];
  incoming_evaluation: AiEvaluationResult;
  /** Optional explicit snapshot; when supplied it must match incoming_evaluation.candidate_pipeline. */
  candidate_pipeline?: Layer03CandidatePipeline;
}

export interface RiskFilterResult {
  is_approved: boolean;
  candidate_state: Layer03CandidatePipeline['state'];
  rejection_reason?: string;
  approved_legs: RecommendedLeg[];
}

/**
 * 轨道二：全量预测与拦截归因门禁分类
 */
export type GateCategory =
  | 'QUALIFIED_FORMAL'       // A/B 级审核通过，可实盘投注
  | 'BLOCKED_BY_AI_C_GRADE'   // 大模型评估为 C 级拦截
  | 'BLOCKED_BY_AI_WATCH'     // 大模型评估为 WATCH 观望拦截
  | 'BLOCKED_BY_AI_TRAP'      // 大模型评估为 TRAP/REJECT 诱盘拦截
  | 'BLOCKED_BY_LOW_CONF'     // 置信度低于 70 分
  | 'BLOCKED_NO_POSITIVE_EV'  // 量化无 +EV 或处于未解锁态
  | 'BLOCKED_BY_RISK_FILTER'  // 仓位/串关风控拦截
  | 'QUANT_MACHINE_ONLY';     // 仅量化预测，未进行大模型评估

export type AttributionVerdict =
  | 'SUCCESSFUL_AVOIDANCE'    // 避坑成功：门禁拦截正确，该被拦截比赛实际未打出
  | 'MODEL_FALSE_NEGATIVE'    // 模型误杀：门禁拦截错误，该比赛实际打出，暴露模型盲区
  | 'FORMAL_WIN'              // 实盘盈利：A/B 级推荐命中
  | 'FORMAL_LOSE'             // 实盘亏损：A/B 级推荐未命中
  | 'PUSH'                    // 走盘退款
  | 'INVALID_DATA'            // 异常数据
  | 'PENDING';                // 未核销

export interface UniverseAuditAttribution {
  is_gate_correct: boolean;       // 拦截是否正确 (True Negative)
  is_false_negative: boolean;     // 是否误杀 (False Negative)
  verdict_label: AttributionVerdict;
  notes: string;
}

/**
 * 轨道二：全量预测与拦截归因记录实体 (Full-Universe Audit Record)
 */
export interface UniverseAuditRecord {
  record_id: string;
  stage: BettingStage;
  created_at_utc: string;
  match_id: string;
  kickoff_time: string;
  league_key: string;
  teams: { home: string; away: string };
  reference_teams?: {
    leisu_home?: string;
    leisu_away?: string;
    leisu_league?: string;
  } | null;
  minute_or_status: string;
  score_at_prediction: { home: number; away: number };
  score_verified: boolean;

  // 门禁与评估
  gate_category: GateCategory;
  gate_reason_description: string;
  ai_grade?: string;
  ai_confidence?: number;
  ai_summary?: string;

  // 量化特征快照
  quant_snapshot: {
    lambda_home: number;
    lambda_away: number;
    forward_goals_expected: number;
    projected_final_score: string;
    top_scores?: Array<{ score: string; probability: number }>;
    bdi: number;
    ah_line: number | null;
    ou_line: number | null;
    markets?: {
      ah_home_odds?: number | null;
      ah_away_odds?: number | null;
      ou_over_odds?: number | null;
      ou_under_odds?: number | null;
      h2h_home?: number | null;
      h2h_draw?: number | null;
      h2h_away?: number | null;
    };
    ev_direction?: string | null;
    ev_value?: number | null;
    candidate_pipeline_state: string;
  };

  // 预测盘口方向 (用于核销对照)
  predicted_direction?: {
    market: string;
    selection: string;
    line: number;
    odds: number;
    model_probability: number;
  };

  // 结算与核销
  settlement?: {
    is_settled: boolean;
    settled_at?: string;
    final_score?: { home: number; away: number };
    final_score_source?: string;
    outcome?: 'WIN' | 'WIN_HALF' | 'PUSH' | 'LOSE_HALF' | 'LOSE' | 'INVALID_DATA' | 'PENDING';
    profit_loss?: number;
    explanation?: string;
    attribution?: UniverseAuditAttribution;
    reflection?: {
      actual_total_goals: number;
      goal_diff_actual: number;
      score_hit: boolean;
      exact_score_hit: boolean;
      ah_outcome?: 'WIN' | 'LOSE' | 'PUSH' | 'HALF_WIN' | 'HALF_LOSE' | null;
      ou_outcome?: 'WIN' | 'LOSE' | 'PUSH' | 'HALF_WIN' | 'HALF_LOSE' | null;
      diagnostic_notes: string;
    };
  };
}

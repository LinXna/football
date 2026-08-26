/**
 * 02_canonical_model 强类型契约定义
 * 单一事实来源 (SSOT)：全链路核心标准赛事对象 CanonicalMatch 与 AI Slim Payload
 * 
 * 核心红线：
 * 1. 显式 null 记录缺失数据，严禁臆造虚假默认值；
 * 2. YBTY 盘口与原始队名为法定执行源，雷速为参考与增强源；
 * 3. 严格划分赛前与滚球状态；
 */

import {
  MatchAlignmentStatus,
  MatchStage,
  DataCompletenessTier,
  MissingDataReason,
} from "./enums";

import {
  CleanMarketsGroup,
  ParsedYbtyLiveMatch,
  ParsedYbtyPrematchMatch,
} from "../01_data_ingestion/ybty/types";

import {
  ParsedLeisuMatch,
  ParsedLeisuStats,
  ParsedLeisuMomentum,
  ParsedLeisuTimelineEvent,
  ParsedLeisuLineup,
  ParsedLeisuTacticalContext,
  ParsedLeagueStandings,
  ParsedGoalDistribution,
  ParsedLeisuOddsMatrix,
  ScorePair,
} from "../01_data_ingestion/leisu/types";

/**
 * 统一通用的 YBTY 抽象赛事输入类型 (兼容 Live 与 Prematch)
 */
export interface GenericYbtyMatch {
  league: string;
  home: string;
  away: string;
  home_score?: number | null;
  away_score?: number | null;
  clock?: string | null;
  clock_status?: string;
  is_live: boolean;
  markets: CleanMarketsGroup;
}

/**
 * 队名单向映射与匹配打分结果
 */
export interface TeamNameMatchResult {
  ybty_name: string;
  leisu_name: string;
  is_alias_exact_hit: boolean;
  raw_text_similarity: number; // 0.0 ~ 1.0 (保留原文字符顺序，不剔除U19/B队/青年队)
}

/**
 * 整场赛事对齐仲裁决策详情
 */
export interface MatchAlignmentDecision {
  status: MatchAlignmentStatus;
  confidence_score: number;       // 0 ~ 100 综合置信分
  home_team_match: TeamNameMatchResult;
  away_team_match: TeamNameMatchResult;
  league_match_score: number;     // 0 ~ 1.0 联赛相似度
  alignment_reason: string;       // 对齐决策文字说明
}

/**
 * 标准赛事比分状态（双源校验）
 */
export interface CanonicalScoreState {
  home_score: number;
  away_score: number;
  home_half_score: number | null;
  away_half_score: number | null;
  score_verified: boolean;        // 是否通过可靠校验（YBTY一致且雷速比分画布通过）
  score_source: "LEISU_CANVAS" | "LEISU_INTERFACE" | "YBTY_DIRECT" | "UNVERIFIED";
  is_mismatch_detected: boolean;  // 是否检测到双源比分冲突
  mismatch_details?: string | null;
}

/**
 * 标准赛事时点与进行状态
 */
export interface CanonicalTimingState {
  stage: MatchStage;
  beijing_start_time: string;     // YYYY-MM-DD HH:mm:ss
  start_time_source: "YBTY_EXACT" | "YBTY_ESTIMATED" | "LEISU_SUPPLEMENTED";
  minute: number | null;          // 滚球进行分钟 (取自雷速，如 73)
  is_half_time: boolean;          // 是否中场休息
  is_extra_time: boolean;         // 是否加时赛
  is_overtime_or_penalty: boolean;// 是否点球大战
}

/**
 * 结构化雷速增强数据包（参考源，缺省显式为 null）
 */
export interface CanonicalLeisuReference {
  leisu_match_id: string;
  leisu_home_name: string;
  leisu_away_name: string;
  leisu_league_name: string;
  stats: ParsedLeisuStats | null;
  attack_momentum: ParsedLeisuMomentum | null;
  timeline_events: ParsedLeisuTimelineEvent[];
  lineups: ParsedLeisuLineup | null;
  tactical_context: ParsedLeisuTacticalContext | null;
  odds_matrix: ParsedLeisuOddsMatrix | null;
  league_standings: ParsedLeagueStandings | null;
  goal_distribution: ParsedGoalDistribution | null;
}

/**
 * 标准赛事对象 (CanonicalMatch) - 全系统单一事实来源 (SSOT)
 */
export interface CanonicalMatch {
  // 1. 唯一标识与元数据
  canonical_id: string;                  // 格式: HASH(LEAGUE_HOME_AWAY_DATE)
  created_at: string;                    // ISO 时间戳
  completeness_tier: DataCompletenessTier;
  missing_reasons: MissingDataReason[];  // 缺失原因列表

  // 2. 赛事对齐决策与溯源
  alignment: MatchAlignmentDecision;

  // 3. 基础赛事属性（以 YBTY 原始数据为第一法定名称）
  league_name: string;                   // YBTY 原始联赛名
  home_team_name: string;                // YBTY 原始主队名
  away_team_name: string;                // YBTY 原始客队名

  // 4. 时点与进行状态
  timing: CanonicalTimingState;

  // 5. 双源校验比分
  score: CanonicalScoreState;

  // 6. 法定交易盘口（来自 YBTY CleanMarketsGroup，绝不被篡改）
  markets: CleanMarketsGroup;

  // 7. 雷速全量基本面与时序增强包（未匹配或缺失时为 null）
  reference: CanonicalLeisuReference | null;
}

/**
 * 极简 AI 提炼包 (AiEvaluationBrief)
 * 面向 Gemini/LLM 提示词的低 Token、高信息密度提炼载体 (控制在 200~400 tokens/场)
 */
export interface AiEvaluationBrief {
  match_id: string;
  league: string;
  kickoff_time: string;
  status_summary: string;              // 例如 "LIVE 68' (1-0, 0红)" 或 "PREMATCH"
  teams: {
    home: string;                      // YBTY 原始名称
    away: string;                      // YBTY 原始名称
  };
  score_verification: {
    is_verified: boolean;
    current_score: string;             // "1 - 0"
  };
  // 核心交易盘口精简摘要
  core_markets: {
    ah_main?: { handicap: string; home_odds: number; away_odds: number } | null; // 全场让球主盘
    ou_main?: { handicap: string; over_odds: number; under_odds: number } | null; // 全场大小主盘
    euro_1x2?: { home_win: number; draw: number; away_win: number } | null;      // 独赢
    ah_half?: { handicap: string; home_odds: number; away_odds: number } | null; // 半场让球主盘
    ou_half?: { handicap: string; over_odds: number; under_odds: number } | null; // 半场大小主盘
  };
  // 提纯后的关键量化特征（无则显式为 null）
  condensed_features: {
    possession?: { home: number; away: number } | null;
    shots_on_target?: { home: number; away: number } | null;
    dangerous_attacks?: { home: number; away: number } | null;
    corners?: { home: number; away: number } | null;
    recent_momentum_5min?: { home: number; away: number } | null;
    recent_momentum_15min?: { home: number; away: number } | null;
    formations?: { home: string; away: string } | null; // 如 "4-3-3 vs 5-3-2"
    h2h_summary?: string | null;                        // 如 "10场 4胜3平3负"
    league_rank?: { home: number; away: number } | null;
  };
  // 数据缺口提示（供 AI 评估时进行不稳定性熔断）
  data_deficits: string[];
}

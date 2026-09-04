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
  LeagueMatchStatus,
  MatchStage,
  DataCompletenessTier,
  MissingDataReason,
  CanonicalIncidentCategory,
  CanonicalEventType,
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
  added_time?: string | null;
  countdown?: string | null;
  commence_time?: string | null;
  _pre_start_text?: string | null;
  captured_at?: string;
  is_live: boolean;
  markets: CleanMarketsGroup;
}

/**
 * 联赛映射与匹配打分结果
 */
export interface LeagueMatchResult {
  ybty_league: string;
  leisu_league: string;
  status: LeagueMatchStatus;
  similarity: number;           // 0.0 ~ 1.0
  is_alias_exact_hit: boolean;
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
  league_match: LeagueMatchResult;
  league_match_score: number;     // 0 ~ 1.0 联赛相似度
  is_swapped_suspected: boolean;  // 是否疑似主客颠倒 (YBTY主=雷速客, YBTY客=雷速主)
  alignment_reason: string;       // 对齐决策文字说明
}

/**
 * 02 标准赛事单条关键时序事件 (Canonical Timeline Event)
 * 具备点球/乌龙识别、VAR 进球回滚、替补席牌隔离与精确伤停补时
 */
export interface CanonicalTimelineEvent {
  minute: number | null;
  base_minute: number | null;          // 基准分钟 (如 45, 90)
  added_minute: number | null;         // 补时分钟 (如 2, 4)
  display_time: string;                // 显示时钟 (如 "45+2'", "68'")
  type: number;                        // 原始事件代码 (1:进球, 3:黄牌, 4:红牌, 9:换人, 22:射偏, 28:VAR 等)
  type_name: string;                   // 显示名称
  canonical_type: CanonicalEventType;  // 标准语义事件类型枚举
  category: CanonicalIncidentCategory; // 事件所属大类
  side: "home" | "away" | "neutral";   // 所属方
  text: string;                        // 原始文字详情
  is_penalty: boolean;                 // 是否为点球破门
  is_own_goal: boolean;                // 是否为乌龙球
  is_cancelled: boolean;               // 是否被 VAR 或裁判取消/判定无效 (如 VAR 吹掉进球)
  is_var_overturned: boolean;          // 是否为 VAR 介入改判事件
  is_on_pitch: boolean;                // 是否为场上 11 人比赛球员 (区分替补席/教练席吃牌，避免误减员)
  player_name?: string | null;         // 涉事球员姓名
}

/**
 * 标准赛事比分状态（双源校验）
 */
export interface CanonicalScoreState {
  home_score: number | null;
  away_score: number | null;
  home_half_score: number | null;
  away_half_score: number | null;
  score_verified: boolean;        // 是否通过可靠校验（YBTY一致且雷速比分画布通过）
  score_source: "LEISU_CANVAS" | "LEISU_INTERFACE" | "YBTY_DIRECT" | "UNVERIFIED";
  is_mismatch_detected: boolean;  // 是否检测到双源比分冲突
  mismatch_details?: string | null;
  var_overturned_goals_count: number; // 记录被 VAR 吹掉/取消的进球数
}

/**
 * 标准赛事时点与进行状态
 */
export interface CanonicalTimingState {
  stage: MatchStage;
  beijing_start_time: string | null; // YYYY-MM-DD HH:mm:ss
  start_time_source: "YBTY_EXACT" | "YBTY_ESTIMATED" | "LEISU_SUPPLEMENTED";
  minute: number | null;          // 滚球进行分钟 (严格由 YBTY 即时盘口时钟 ybty_display_clock 解析，中场锁定 45，赛前为 null；雷速不提供滚球时钟)
  base_minute?: number | null;    // 基准半场分钟 (如 45, 90)
  added_minute?: number | null;   // 伤停补时分钟 (如 2, 4)
  is_half_time: boolean;          // 是否中场休息
  is_extra_time: boolean;         // 是否加时赛
  is_overtime_or_penalty: boolean;// 是否点球大战
  ybty_display_clock: string | null; // YBTY 页面原生时钟显示（如 "61:22", "HT", "即将开赛"，用于出票核对）
}

/**
 * 结构化雷速增强数据包（参考源，缺省显式为 null）
 */
export interface CanonicalLeisuReference {
  leisu_match_id: string;
  home_team_id?: number | null;
  away_team_id?: number | null;
  leisu_home_name: string;
  leisu_away_name: string;
  leisu_league_name: string;
  stats: ParsedLeisuStats | null;
  attack_momentum: ParsedLeisuMomentum | null;
  timeline_events: CanonicalTimelineEvent[];
  lineups: ParsedLeisuLineup | null;
  tactical_context: ParsedLeisuTacticalContext | null;
  odds_matrix: ParsedLeisuOddsMatrix | null;
  league_standings: ParsedLeagueStandings | null;
  goal_distribution: ParsedGoalDistribution | null;
  environment: import('../01_data_ingestion/leisu/types.js').ParsedLeisuEnvironment | null;
}

/**
 * 标准赛事对象 (CanonicalMatch) - 全系统单一事实来源 (SSOT)
 */
export interface CanonicalMatch {
  // 1. 唯一标识与元数据
  canonical_id: string;                  // 严格确立为雷速赛事 ID (leisu_match_id，如 "4562395")
  match_slug: string;                    // 业务对阵标识: ${league}_${home}_vs_${away}
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

/**
 * 02_canonical_model 枚举定义
 * 严格服从 SYSTEM_ARCHITECTURE_AND_PIPELINE.md 规范
 */

/**
 * 赛事对齐匹配状态
 */
export enum MatchAlignmentStatus {
  MATCHED_BY_ALIAS = "MATCHED_BY_ALIAS",       // 通过静态别名库 100% 命中
  MATCHED_AUTO = "MATCHED_AUTO",               // 纯文本顺序高相似度自动对齐 (Score >= 85)
  NEEDS_MANUAL_SELECTION = "NEEDS_MANUAL_SELECTION", // 低置信度待选 (50 <= Score < 85)，需人工确认
  SWAPPED_HOME_AWAY = "SWAPPED_HOME_AWAY",     // ⚠️ 严重警报：检测到主客场颠倒
  UNMATCHED = "UNMATCHED",                     // 未匹配 (Score < 50)
}

/**
 * 联赛对齐匹配状态
 */
export enum LeagueMatchStatus {
  MATCHED_BY_ALIAS = "MATCHED_BY_ALIAS",       // 枚举/别名库精确命中 (绿色)
  MATCHED_FUZZY = "MATCHED_FUZZY",             // 模糊匹配 (相似度 >= 0.6，黄色)
  UNMATCHED = "UNMATCHED",                     // 未匹配 (红色/灰色)
}

/**
 * 比赛阶段与模式
 */
export enum MatchStage {
  PREMATCH = "PREMATCH",
  LIVE = "LIVE",
  FINISHED = "FINISHED",
}

/**
 * 数据完整度等级（自适应降权与风控依据）
 */
export enum DataCompletenessTier {
  TIER_1_FULL = "TIER_1_FULL",         // 全维度黄金赛事（阵型/时序/统计/积分全部具备）
  TIER_2_BASIC = "TIER_2_BASIC",       // 基础完整（有统计/积分/盘口，但缺少阵型或详细时序）
  TIER_3_SPARSE = "TIER_3_SPARSE",     // 数据断流/稀疏（仅有比分/基础盘口，严禁 AI 推荐与串关）
  TIER_INVALID = "TIER_INVALID",       // 数据异常/比分冲突/源头损坏，熔断不可用
}

/**
 * 核心数据缺口原因清单（显式给前端和风控提示）
 */
export enum MissingDataReason {
  NO_LEISU_MATCH = "NO_LEISU_MATCH",                     // 未成功匹配到雷速对应赛事
  SCORE_MISMATCH = "SCORE_MISMATCH",                     // YBTY 与雷速比分不一致
  SCORE_NOT_VERIFIED = "SCORE_NOT_VERIFIED",             // 雷速比分未经画布/可靠接口校验
  NO_LINEUP_DATA = "NO_LINEUP_DATA",                     // 缺少首发名单与阵型数据
  NO_STATS_DATA = "NO_STATS_DATA",                       // 缺少攻防技术统计（射门/角球等）
  NO_MOMENTUM_TIMELINE = "NO_MOMENTUM_TIMELINE",         // 缺少分钟级攻防动量时序
  NO_LEAGUE_STANDINGS = "NO_LEAGUE_STANDINGS",           // 缺少联赛积分榜数据
  NO_GOAL_DISTRIBUTION = "NO_GOAL_DISTRIBUTION",         // 缺少时段进球分布数据
  NO_ODDS_MARKETS = "NO_ODDS_MARKETS",                   // YBTY 缺少有效交易盘口
}

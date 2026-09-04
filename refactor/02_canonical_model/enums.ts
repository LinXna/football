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
  MISSING_LIVE_MINUTE = "MISSING_LIVE_MINUTE",           // 滚球状态下 YBTY 缺少有效进行中时钟/分钟数
  MISSING_START_TIME = "MISSING_START_TIME",             // 缺少可确认的开赛时间
  MISSING_SCORE = "MISSING_SCORE",                       // 缺少完整比分事实
}

/**
 * 02 标准赛事关键事件大类分类 (Canonical Incident Category)
 */
export enum CanonicalIncidentCategory {
  SCORE = "SCORE",               // 进球/点球/乌龙/加时进球
  DISCIPLINE = "DISCIPLINE",     // 黄牌/两黄变红/直红/替补席牌
  TACTICAL = "TACTICAL",         // 换人/伤退/角球/射正/射偏/扑救/越位/犯规
  MATCH_CONTROL = "MATCH_CONTROL",// 半场哨/完场哨/VAR/进球取消/补时
  MARKET_EVENT = "MARKET_EVENT", // 封盘/重开/重定价
}

/**
 * 02 标准赛事关键事件类型枚举 (Canonical Event Type)
 */
export enum CanonicalEventType {
  GOAL_REGULAR = "GOAL_REGULAR",               // 常规运动战进球
  GOAL_PENALTY = "GOAL_PENALTY",               // 点球破门
  GOAL_OWN = "GOAL_OWN",                       // 乌龙球
  GOAL_EXTRA_TIME = "GOAL_EXTRA_TIME",         // 加时赛进球
  PENALTY_MISSED = "PENALTY_MISSED",           // 点球射失/被扑
  YELLOW_CARD = "YELLOW_CARD",                 // 单张黄牌
  RED_CARD = "RED_CARD",                       // 直接红牌
  RED_CARD_DIRECT = "RED_CARD_DIRECT",         // 直接红牌
  TWO_YELLOW_TO_RED = "TWO_YELLOW_TO_RED",     // 两黄变红
  RED_CARD_SECOND_YELLOW = "RED_CARD_SECOND_YELLOW", // 两黄变红
  BENCH_DISCIPLINE = "BENCH_DISCIPLINE",       // 替补席/教练吃牌（场上不减员）
  CORNER = "CORNER",                           // 角球
  SUBSTITUTION = "SUBSTITUTION",               // 常规换人
  INJURY_SUB = "INJURY_SUB",                   // 伤退被动换人
  SHOT_ON_TARGET = "SHOT_ON_TARGET",           // 射正
  SHOT_OFF_TARGET = "SHOT_OFF_TARGET",         // 射偏/击中门柱（不可细分复合事件）
  GOALKEEPER_SAVE = "GOALKEEPER_SAVE",         // 门将扑救/解围
  OFFSIDE = "OFFSIDE",                         // 越位
  FOUL = "FOUL",                               // 犯规
  KICK_OFF = "KICK_OFF",                       // 开球
  HALF_TIME_WHISTLE = "HALF_TIME_WHISTLE",     // 半场结束
  FULL_TIME_WHISTLE = "FULL_TIME_WHISTLE",     // 全场结束
  VAR_REVIEW = "VAR_REVIEW",                   // VAR介入核查
  GOAL_DISALLOWED = "GOAL_DISALLOWED",         // 进球被判无效/取消
  CARD_OVERTURNED = "CARD_OVERTURNED",         // 红黄牌撤销/改判
  ADDED_TIME = "ADDED_TIME",                   // 伤停补时公布
  MATCH_INTERRUPTED = "MATCH_INTERRUPTED",     // 比赛中断/暂停
  MATCH_ABANDONED = "MATCH_ABANDONED",         // 比赛腰斩/取消
}

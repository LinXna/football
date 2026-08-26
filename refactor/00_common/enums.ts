/**
 * 00 全局公共核心 - 全局领域枚举大典 (enums.ts)
 * 
 * 核心架构准则：
 * 1. 统一命名规范：每个业务子模块各司其职，在各自专属目录下的 enums.ts 中分类维护其私有/特定枚举；
 * 2. 跨模块领域枚举：涉及全链路流转的通用领域概念（如推荐评级、盘口结算结果、实体对齐状态）在此分类维护；
 * 3. 异常与弹窗公共总线：所有子模块统一复用 `refactor/00_common/errors.ts` 的 commonEnumRegistry 与 systemAlertBus。
 */

// ==========================================
// 1. 投资评估推荐评级枚举 (Recommendation Grade)
// ==========================================

export enum RecommendationGrade {
  GRADE_A = "A",         // A 级核心推荐 (评分>=85, 首发战意明确, 跨串最多2组)
  GRADE_B = "B",         // B 级合格推荐 (评分>=75, 独立复核通过, 跨串最多1组)
  GRADE_C = "C",         // C 级观察/不进串关 (首发未出、杯赛友谊赛缺乏数据)
  MACHINE_WATCH = "WATCH", // 程序机器初筛关注
  MACHINE_RESEARCH = "RESEARCH", // 程序机器深度挖掘候选
  REJECTED = "REJECT",   // 风控拦截拒绝
}

// ==========================================
// 2. 盘口结算结果枚举 (Settlement Outcome)
// ==========================================

export enum SettlementOutcome {
  WIN = "WIN",           // 全赢 (1.0)
  WIN_HALF = "WIN_HALF", // 赢半 (0.5)
  PUSH = "PUSH",         // 走盘 (0.0)
  LOSE_HALF = "LOSE_HALF", // 输半 (-0.5)
  LOSE = "LOSE",         // 全输 (-1.0)
  PENDING = "PENDING",   // 比赛进行中/待结算
  INVALID = "INVALID",   // 无效比赛/比分未核验
}

// ==========================================
// 3. 跨源赛事对齐状态枚举 (Entity Alignment Status)
// ==========================================

export enum MatchAlignmentStatus {
  EXACT_MATCH = "exact_match",       // 强ID/别名精确匹配
  FUZZY_MATCH = "fuzzy_match",       // 模糊队名匹配
  CONFLICT_ALERT = "conflict_alert", // 双源信息存在冲突
  UNMATCHED = "unmatched",           // 未能匹配
}

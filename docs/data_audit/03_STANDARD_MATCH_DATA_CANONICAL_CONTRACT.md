# 03. StandardMatchData 统一数据契约规范 (Canonical Data Contract)

## 一、 契约设计原则与架构目标

为彻底终结由于历史升级导致的数据结构混乱、字段命名不一致、多源冲突与类型推断失败，本规范定义了全系统唯一的权威数据契约 —— **`StandardMatchData`**。

### 核心设计原则
1. **单一事实来源与双轨权责分离 (Single Source of Truth & Dual-Track Separation)**：
   - **基准队名与投注执行盘口**：以 YBTY 导出的原始文本与 markets 盘口为不可篡改的法定执行基准；所有推荐、出票、盈亏结算和复盘命中率以此为准。
   - **机构初盘与即盘参考基准**：以雷速 `opening_odds` 与 `odds`（即盘）为辅助预测与价值锚点，结合现场攻势计算盘口衰减（Decay）与战术成色，严禁用作投注赔率。
   - **比赛时钟、实时比分与技术统计**：优先 YBTY 盘口比分与时钟，以雷速 `/api/v3/f/vd` 接口进行交叉核验。
   - **比赛资料、环境、阵容、历史交锋与动量波形**：以雷速 `formal` 结构（接口 Protobuf + 解密数据）为唯一数据源。
2. **纯数值化与强类型化 (Strict Numeric & Strong Typing)**：
   - 所有比分、分钟、技术统计、赔率水位必须为标准数字类型 (`number` / `float` / `int`)，杜绝任何字符串与数字混用。
   - 百分比统一存储为 0~100 的数值（或 0~1 的浮点数），并在字段名中明确标示（如 `possession_pct` 或 `save_rate`）。
3. **确定性与可空性约束 (Deterministic Nullability)**：
   - 区分“数值为0”与“数据缺失 (`null`)”。
   - 赛前未产生的实时数据（如滚球比分、时序动量）明确为 `null` 或未激活对象，不得填充虚假 0。

---

## 二、 StandardMatchData 核心数据模型完整规范

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   StandardMatchData                                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  1. 赛事基础元数据 (Metadata & Identity)                                               │
│     - id, league, home_team, away_team, start_time_utc, start_time_beijing, mode       │
│                                                                                        │
│  2. 实时比赛状态 (Match State & Score)                                                 │
│     - status_id, status_text, minute, score {home, away}, half_score, score_verified   │
│                                                                                        │
│  3. 技术统计核心 (Unified Match Statistics)                                            │
│     - corners, yellow_cards, red_cards, attacks, dangerous_attacks                     │
│     - possession, shots, shots_on_target, shots_off_target                             │
│                                                                                        │
│  4. 攻守动量时序波形 (Attack Momentum Timeline)                                         │
│     - available, segment_count, nominal_segment_minutes, data (number[][])             │
│                                                                                        │
│  5. 结构化文字直播与重要事件 (Timeline Events)                                         │
│     - events: StandardTimelineEvent[] (进球、红黄牌、换人、角球)                        │
│                                                                                        │
│  6. 阵容与战术阵型 (Lineup & Tactical Formations)                                      │
│     - confirmed, home_formation, away_formation, home_manager, away_manager            │
│     - home/away starters & substitutes: Player[]                                       │
│     - home_injuries, away_injuries: Player[]                                           │
│                                                                                        │
│  7. 历史交锋与深度基本面 (Historical & Fundamental Context)                             │
│     - head_to_head, recent_matches, league_standings, goal_distribution, trend_summary  │
│                                                                                        │
│  8. YBTY 实时投注盘口 (YBTY Market Odds)                                               │
│     - spread (让球), total (大小球), h2h (独赢), corner (角球), correct_score (波胆)   │
│                                                                                        │
│  9. 雷速参考赔率矩阵 (Reference Odds Matrix)                                           │
│     - opening (初盘), current (即时盘 - 包含 initial, pregame, live 三阶段)            │
│                                                                                        │
│  10. 衍生特征与攻防效率 (Derived Features & Efficiency Metrics)                        │
│     - live_efficiency: shot_accuracy, goal_conversion, save_rate                       │
│     - historical_metrics: recent_goal_avg, h2h_goal_avg, big_ball_ratio, late_goals   │
│                                                                                        │
│  11. 推荐与风控决策 (Recommendation & Risk Decision)                                   │
│     - grade (A/B/C/PASS), score, recommendations[], kelly_guidance, risk_tags         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、 TypeScript 权威接口契约定义 (`src/types.ts`)

```typescript
/**
 * 基础分数与统计对
 */
export interface MetricPair {
  home: number;
  away: number;
}

export interface Score {
  home: number;
  away: number;
}

/**
 * 1. 统一技术统计 (8大核心指标)
 */
export interface UnifiedMatchStats {
  corners: MetricPair;
  yellow_cards: MetricPair;
  red_cards: MetricPair;
  attacks: MetricPair;
  dangerous_attacks: MetricPair;
  possession: MetricPair;
  shots_on_target: MetricPair;
  shots_off_target: MetricPair;
  shots: MetricPair; // shots = shots_on_target + shots_off_target
}

/**
 * 2. 攻守动量时序波形
 */
export interface AttackMomentumTimeline {
  available: boolean;
  source?: string | null;
  segment_count: number;
  nominal_segment_minutes: number | null;
  data: number[][]; // [上半场每分钟波形数值数组, 下半场每分钟波形数值数组]
}

/**
 * 3. 结构化文字直播事件
 */
export interface StandardTimelineEvent {
  minute: number | null;
  display_time: string;
  type: number; // 雷速事件类型代码 (1进球, 2角球, 3黄牌, 4红牌, 9换人 等)
  position: 0 | 1 | 2; // 0中立/全场, 1主队, 2客队
  side: 'home' | 'away' | 'neutral';
  is_goal: boolean;
  is_corner: boolean;
  is_card: boolean;
  is_sub: boolean;
  text: string;
}

/**
 * 4. 球员与阵容
 */
export interface Player {
  player_id: number | null;
  team_id: number | null;
  name: string;
  shirt_number: number | null;
  position_name: string | null;
  position_code: string | null;
  status: number | null; // 1首发, 2替补, 3伤停
  starter: boolean;
  captain: number;
  rating: number | null;
  best_player: boolean;
  age: number | null;
  market_value: number | null;
  market_value_text: string | null;
}

export interface LineupData {
  available: boolean;
  source?: string | null;
  confirmed: boolean | null;
  venue?: {
    id: number | null;
    name: string | null;
    capacity: number | null;
    city: string | null;
  } | null;
  referee?: {
    id: number | null;
    name: string | null;
    country_name: string | null;
  } | null;
  home_formation: string | null; // 如 "4-3-3", "4-2-3-1"
  away_formation: string | null;
  home_manager?: { name: string | null } | null;
  away_manager?: { name: string | null } | null;
  home: {
    starters: Player[];
    substitutes: Player[];
    formation?: string | null;
  };
  away: {
    starters: Player[];
    substitutes: Player[];
    formation?: string | null;
  };
  home_injuries: Player[];
  away_injuries: Player[];
  home_market_value: number | null;
  away_market_value: number | null;
}

/**
 * 5. 历史与深度基本面分析
 */
export interface MatchRecord {
  match_id: number | string | null;
  league_name: string | null;
  match_time: number | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_score: number | null;
  away_score: number | null;
  half_home_score: number | null;
  half_away_score: number | null;
  result?: '胜' | '平' | '负' | null;
}

export interface HistoricalAnalysisData {
  head_to_head: MatchRecord[];
  recent_matches: {
    home: MatchRecord[];
    away: MatchRecord[];
  };
  league_standings?: {
    home_team?: {
      total?: { rank?: number | string; games?: number; wins?: number; draws?: number; losses?: number; points?: number };
    };
    away_team?: {
      total?: { rank?: number | string; games?: number; wins?: number; draws?: number; losses?: number; points?: number };
    };
  } | null;
  goal_distribution?: {
    home?: { all?: { scored?: any[]; conceded?: any[] } };
    away?: { all?: { scored?: any[]; conceded?: any[] } };
  } | null;
  trend_summary?: {
    home?: { table?: any[] };
    away?: { table?: any[] };
  } | null;
  future_schedule?: {
    home?: MatchRecord[];
    away?: MatchRecord[];
  } | null;
}

/**
 * 6. YBTY 投注盘口与标准盘口快照 (Market Snapshots)
 */
export interface MarketSnapshotOption {
  option_id?: string;
  side: 'home' | 'away' | 'over' | 'under' | 'draw' | string;
  line?: string | number | null;
  odds: number;
  suspended?: boolean;
}

export interface MarketSnapshot {
  market_type: string; // 'full_total' | 'half_total' | 'full_spread' | 'half_spread' | 'full_h2h' | 'half_h2h' | 'total' | 'spread' | 'h2h' | 'corner' | 'correct_score'
  line?: string | number | null;
  market_label?: string;
  is_verified?: boolean;
  status?: string;
  home_or_over_odds?: number | null;
  away_or_under_odds?: number | null;
  draw_odds?: number | null;
  options?: MarketSnapshotOption[];
}

export interface YBTYOption {
  selection: string;
  line: string | null;
  odds: string;
  odds_numeric: number;
  side: 'home' | 'away' | 'over' | 'under' | 'draw' | null;
  side_verified: boolean;
  suspended: boolean;
  text: string;
}

export interface YBTYMarketItem {
  line_index: number;
  market: 'full_h2h' | 'full_spread' | 'full_total' | 'half_h2h' | 'half_spread' | 'half_total' | 'corner' | 'correct_score';
  market_title: string;
  market_type_verified: boolean;
  home_odds?: string;
  away_odds?: string;
  draw_odds?: string;
  options: YBTYOption[];
}

export interface YBTYMarketsGroup {
  h2h?: YBTYMarketItem | null;
  spread?: YBTYMarketItem | null;
  total?: YBTYMarketItem | null;
  half_h2h?: YBTYMarketItem | null;
  half_spread?: YBTYMarketItem | null;
  half_total?: YBTYMarketItem | null;
  corners?: YBTYMarketItem | null;
  raw_markets: YBTYMarketItem[];
}

/**
 * 7. 雷速参考赔率
 */
export interface ReferenceOddsMatrix {
  company_id: number | null;
  company_name: string | null;
  asian_handicap: {
    initial?: { home: number | string; line: number | string; away: number | string } | null;
    pregame?: { home: number | string; line: number | string; away: number | string } | null;
    live?: { home: number | string; line: number | string; away: number | string } | null;
  };
  total_goals: {
    initial?: { over: number | string; line: number | string; under: number | string } | null;
    pregame?: { over: number | string; line: number | string; under: number | string } | null;
    live?: { over: number | string; line: number | string; under: number | string } | null;
  };
  match_winner: {
    initial?: { home: number | string; draw: number | string; away: number | string } | null;
    pregame?: { home: number | string; draw: number | string; away: number | string } | null;
    live?: { home: number | string; draw: number | string; away: number | string } | null;
  };
}

/**
 * 8. 衍生攻防效率与门将表现
 */
export interface LiveEfficiencyMetrics {
  teams: {
    home: {
      goals: number;
      shots: number;
      shots_on_target: number;
      shot_accuracy: number | null; // 射正率 (0-1)
      goal_conversion: number | null; // 进球转化率 (0-1)
    };
    away: {
      goals: number;
      shots: number;
      shots_on_target: number;
      shot_accuracy: number | null;
      goal_conversion: number | null;
    };
  };
  goalkeepers: {
    home: {
      shots_faced: number;
      goals_conceded: number;
      saves: number;
      save_rate: number | null; // 扑救率 (0-1)
    };
    away: {
      shots_faced: number;
      goals_conceded: number;
      saves: number;
      save_rate: number | null;
    };
  };
  warnings: string[];
}

/**
 * 9. 推荐与风控决策项
 */
export interface BettingRecommendationItem {
  id: string;
  market_type: 'full_spread' | 'full_total' | 'full_h2h' | 'btts' | 'corners';
  market_name_zh: string;
  selection_target: string;
  selection_side: 'home' | 'away' | 'over' | 'under' | 'draw';
  handicap_line: string | number;
  odds: number;
  grade: 'A' | 'B' | 'C' | 'PASS';
  score: number;
  recommend_minute?: number | null;
  recommend_score?: Score | null;
  reasoning: string[];
  risk_tags: string[];
  kelly_guidance: {
    stake_pct: number;
    tier: 'CORE_HIGH' | 'CORE_STANDARD' | 'SPECULATIVE_SMALL' | 'NO_STAKE';
    guidance_zh: string;
  };
}

/**
 * 10. 全系统标准赛事数据对象 (The Canonical StandardMatchData)
 */
export interface StandardMatchData {
  id: string;
  mode: 'live' | 'prematch';
  league: string;
  home_team: string; // YBTY 原始主队名
  away_team: string; // YBTY 原始客队名
  provider_home_team?: string | null; // 雷速主队名
  provider_away_team?: string | null; // 雷速客队名
  match_confidence: number; // 匹配置信度 (0-1)
  
  // 时间与时钟
  start_time_utc: string | null;
  start_time_beijing: string | null;
  minute: number | null;
  clock_text: string | null;
  status_id: number; // 1未开赛, 2上半场, 3中场, 4下半场, 8完场
  status_text: string;
  
  // 比分状态
  score: Score;
  half_score?: Score | null;
  score_verified: boolean;
  score_source: 'ybty_market' | 'provider_api' | 'score_canvas' | 'unverified';
  
  // 核心数据模块
  statistics: UnifiedMatchStats;
  momentum_timeline: AttackMomentumTimeline;
  timeline_events: StandardTimelineEvent[];
  lineups: LineupData;
  historical_analysis: HistoricalAnalysisData;
  environment?: {
    weather?: string | null;
    temperature?: string | null;
    wind?: string | null;
    humidity?: string | null;
  } | null;
  
  // 盘口与赔率
  ybty_markets: YBTYMarketsGroup;
  reference_odds: ReferenceOddsMatrix;
  
  // 衍生特征与推荐
  live_efficiency?: LiveEfficiencyMetrics | null;
  candidate_score: number;
  candidate_grade: 'A' | 'B' | 'C' | 'PASS';
  recommendations: BettingRecommendationItem[];
}
```

---

## 四、 Python 管道层标准化 Schema 对齐规则

在 Python 脚本 (`football_live.py`, `interface_features.py`, `recommend_live.py`) 中，所有字典输出均应遵循与上述 TypeScript 完全一致的命名空间与键名规范：

1. `match` 字典：
   - 废除 `sofascore_event_id`，统一使用 `match_id` 或 `source_match_id`。
   - `score` 强制为 `{"home": int, "away": int}`。
2. `live_statistics` 字典：
   - 8大键名固定为：`corners`, `yellow_cards`, `red_cards`, `attacks`, `dangerous_attacks`, `possession`, `shots_on_target`, `shots_off_target`。
   - 每个子项均为 `{"home": int, "away": int}`。
3. `lineups` 字典：
   - 首发阵容统一放置于 `lineups["home"]["starters"]` 与 `lineups["away"]["starters"]`。
   - 阵型放置于 `lineups["home_formation"]` 与 `lineups["away_formation"]`。
4. `recent_trends` 字典：
   - 动量波形置于 `recent_trends["attack_momentum_timeline"]`。
   - 5/15分钟统计增量置于 `recent_trends["last_5_minutes"]` 和 `recent_trends["last_15_minutes"]`。

---

## 五、 契约校验与回退兜底准则

1. **缺失值处理**：
   - 数值类型缺失时返回 `null`，禁止转换为 `0`（避免将“未开角球”与“数据缺失”混淆）。
   - 数组类型缺失时返回空数组 `[]`，禁止返回 `null`，避免前端 `.map()` 或 `.length` 崩溃。
2. **队名基准约束**：
   - 所有面向用户的界面、投注推荐、台账记录，显示的队名**必须且只能使用 YBTY 原始队名**。
   - 雷速队名仅用于后台相似度计算与别名库索引。
3. **时区统一**：
   - 内部存储全部采用 UTC ISO-8601 格式（以 `Z` 结尾）。
   - 面向用户的展示时间统一转换为北京时间（UTC+8，格式 `YYYY-MM-DD HH:mm`）。

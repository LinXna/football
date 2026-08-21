# 全系统统一数据契约与赋值链路标准规范文档
# CODEX SYSTEM UNIFIED DATA SCHEMA & MAPPING CONTRACT
**版本**: `2.8.0-CANONICAL`  
**状态**: `LOCKED_CANONICAL` (全系统唯一最高数据法律，所有模块开发、维护、解析必须无条件遵循)  
**约束级别**: `CRITICAL_LAW`  
**生效范围**: 前端组件 (`src/components/`), 业务逻辑与管道 (`src/lib/`, `src/utils/`), 后端服务 (`server/`), AI Prompt 注入层与导出模块。

---

## 目录
1. [系统总体架构与数据生命周期](#1-系统总体架构与数据生命周期)
2. [原始数据源定义与完整度标准 (Source Specifications v2.8.0)](#2-原始数据源定义与完整度标准-source-specifications-v280)
   - 2.1 [YBTY 原始数据源 (权威盘口与对阵基准)](#21-ybty-原始数据源-权威盘口与对阵基准)
   - 2.2 [雷速 (Leisu) 原始数据源 (基本面、技术统计、事件与动能时序)](#22-雷速-leisu-原始数据源-基本面技术统计事件与动能时序)
3. [StandardMatchData 核心结构与全量字段契约](#3-standardmatchdata-核心结构与全量字段契约)
   - 3.1 [全量 TypeScript 接口定义 (与 src/types.ts 100% 对齐)](#31-全量-typescript-接口定义)
   - 3.2 [每个字段的语义、类型定义与业务边界详解](#32-每个字段的语义类型定义与业务边界详解)
   - 3.3 [服务端派生量化模型 (CanonicalMatchData) 的明确定位](#33-服务端派生量化模型-canonicalmatchdata-的明确定位)
4. [YBTY 与 雷速 到 StandardMatchData 的严格赋值映射链路](#4-ybty-与-雷速-到-standardmatchdata-的严格赋值映射链路)
   - 4.1 [多源对齐与赛事匹配机制 (Match Key Alignment)](#41-多源对齐与赛事匹配机制-match-key-alignment)
   - 4.2 [字段级赋值与回退逻辑全矩阵](#42-字段级赋值与回退逻辑全矩阵)
   - 4.3 [标准转换函数实现标准 (`toStandardMatchData`)](#43-标准转换函数实现标准-canonical-converter-implementation)
5. [数据取值与消费五大防破坏法则 (Anti-Violation Rules)](#5-数据取值与消费五大防破坏法则-anti-violation-rules)

---

## 1. 系统总体架构与数据生命周期

CODEX 系统处理滚球（`live`）与赛前（`prematch`）赛事，统一执行单向无损数据归一化流：

```text
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│          YBTY 原始抓取数据            │       │          雷速 (Leisu) 原始数据        │
│    (权威对阵名称 / 真实可投注盘口)     │       │    (技术统计/事件流/攻势波形/阵容)     │
└──────────────────┬───────────────────┘       └──────────────────┬───────────────────┘
                   │                                              │
                   │           1. 赛事对齐与模糊匹配 (Matching)     │
                   └──────────────────────┬───────────────────────┘
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │           StandardMatchData 归一化           │
                   │       (消除多源字段重名与数据异构核心态)       │
                   └──────────────────────┬───────────────────────┘
                                          │
                   ├──────────────────────┼───────────────────────┤
                   ▼                      ▼                       ▼
      2. 量化特征计算与时序分析    3. 盘口白名单与Prompt注入       4. 决策仲裁与台账记录
         (Momentum/Conversion)      (OptionId / Token Gen)       (Formal Rec / Ledger)
                   │                      │                       │
                   └──────────────────────┼───────────────────────┘
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │            前端展示 / 投注中心 / 导出         │
                   │        (LiveMatches, AiEvaluator, Parlay)    │
                   └──────────────────────────────────────────────┘
```

---

## 2. 原始数据源定义与完整度标准 (Source Specifications)

### 2.1 YBTY 原始数据源 (权威盘口与对阵基准)
- **地位**: **赛事标识与下注盘口的唯一法定权威**。
- **核心原则**: 所有进入推荐台账、展示给用户的队名必须 100% 保持 YBTY 原始字串；所有下注方向、盘口线、赔率必须来自于 YBTY `markets`。

```typescript
export interface YbtyRawMatch {
  source_match_id: string | null;  // YBTY 内部比赛 ID (实际导出中常为 null)
  league: string;                  // YBTY 原始权威联赛名 (如 "英格兰甲级联赛")
  home: string;                    // YBTY 权威主队名 (如 "谢周三")
  away: string;                    // YBTY 权威客队名 (如 "布拉德福德城")
  home_score?: string | number;    // YBTY 即时采集主队比分
  away_score?: string | number;    // YBTY 即时采集客队比分
  clock?: string;                  // 滚球钟表时间 (如 "62:25", "45+", "半场")
  clock_status?: string;           // 比赛进行状态字串
  commence_time?: string | null;   // 开赛时间
  captured_at?: string;            // 快照采集时间 (ISO 8601)
  markets: YbtyRawMarket[];        // 真实可投注盘口列表
}

export interface YbtyRawMarket {
  market: 'full_total' | 'half_total' | 'full_spread' | 'half_spread' | 'full_h2h' | string;
  market_title?: string;           // 盘口中文标题 (如 "全场让球")
  line_index?: number;             // 盘口线路序号 (0=主盘, 1=副盘1, 2=副盘2)
  market_type_verified?: boolean;  // 盘口类型语义是否校验
  home_selection?: string | null;  // 让球盘口主队线路 (如 "-0/0.5")
  away_selection?: string | null;  // 让球盘口客队线路 (如 "+0/0.5")
  options: YbtyRawOption[];
}

export interface YbtyRawOption {
  side: 'over' | 'under' | 'home' | 'away' | 'draw' | string;
  line?: string | null;            // 大小球盘口数值 (如 "2.5"；让球盘口通常为 null，盘口在 selection 或 side 语义中)
  odds: string | number;           // 实时赔率 (如 "1.91", "2.20")
  suspended?: boolean;             // 是否封盘
  side_verified?: boolean;         // 方向是否校验
  text?: string;                   // 原始 DOM 文本
}
```

### 2.2 雷速 (Leisu) 原始数据源 (基本面、技术统计、事件与动能时序)
- **地位**: **比赛基本面、伤停、阵容、事件流、技术统计及攻势时序的提供源**。
- **核心原则**: 雷速队名仅用于多维模糊匹配与交叉比对，绝不可替代 YBTY 队名；雷速指数仅用于机构意图分析，严禁用作投注赔率。

```typescript
export interface LeisuRawExport {
  export_version: string;         // "2.8.0"
  export_type: string;            // "leisu_interface_data"
  captured_at: string;            // 快照采集时间
  results: Array<{
    match_id: string | number;
    available: boolean;
    formal: LeisuFormalData;
  }>;
}

export interface LeisuFormalData {
  static_match: {
    id: number;
    matchTime: number;            // Unix 秒级时间戳
    homeTeam: { id: number; name: string; shortName?: string; rank?: string };
    awayTeam: { id: number; name: string; shortName?: string; rank?: string };
    competition: { id: number; name: string; shortName?: string };
    environment?: { weather?: string; temperature?: string; wind?: string; humidity?: string };
  };
  live_match?: {
    status_id: number;            // 1=未开赛, 2=上半场, 3=中场, 4=下半场, 8=完场
    home_scores: { score: number; halfScore?: number; redCard?: number; yellowCard?: number; corner?: number };
    away_scores: { score: number; halfScore?: number; redCard?: number; yellowCard?: number; corner?: number };
    confirmed_statistics?: {
      possession?: { home: number; away: number };
      shots_on_target?: { home: number; away: number };
      shots_off_target?: { home: number; away: number };
      dangerous_attacks?: { home: number; away: number };
      attacks?: { home: number; away: number };
      corners?: { home: number; away: number };
      yellow_cards?: { home: number; away: number };
      red_cards?: { home: number; away: number };
    };
    text_live?: Array<{
      time: string;               // 字符串时间，如 "47'"
      type: number;               // 1=进球, 2=角球, 3=黄牌, 4=红牌, 5=越位, 21=射正, 22=射偏
      position: number;           // 1=主队, 2=客队, 0=中立/裁判
      data: string;               // 文字直播明细
    }>;
    attack_momentum_timeline?: {
      available: boolean;
      data: number[][];           // [ [上半场差值], [下半场差值] ]
    };
    trend?: { data: number[][] };
  };
  head_to_head?: any[];           // 历史交手
  recent_matches?: { home: any[]; away: any[] }; // 近期战绩
  lineup?: any;                   // 首发与替补名单
  odds?: any;                     // 机构参考指数
}
```

---

## 3. StandardMatchData 核心结构与全量字段契约

### 3.1 全量 TypeScript 接口定义

```typescript
export interface StandardMatchData {
  // 1. 基础标识与队名 (严格以 YBTY 为准)
  id: string;                                 // 唯一赛事标识
  match_id: string;                           // 雷速 match_id 或混合关联 ID
  match: string;                              // 对阵名称: "${ybty_home} vs ${ybty_away}"
  ybty_home: string;                          // 权威 YBTY 主队名 (非空)
  ybty_away: string;                          // 权威 YBTY 客队名 (非空)
  home_team: string;                          // 别名兼容 (= ybty_home)
  away_team: string;                          // 别名兼容 (= ybty_away)
  leisu_home?: string;                        // 雷速对照主队名 (辅助展示)
  leisu_away?: string;                        // 雷速对照客队名 (辅助展示)
  league: string;                             // 归一化联赛名称
  ybty_league?: string;                       // YBTY 原始联赛名
  leisu_league?: string;                      // 雷速原始联赛名

  // 2. 时间与进度状态
  minute: number;                             // 比赛进行分钟 (滚球: 1-90+, 赛前: 0)
  clock_status?: string;                      // 原始时钟字串 (如 "68:15", "HT")
  commence_time: string;                      // 标准 ISO 8601 UTC 开赛时间
  ybty_start_time_beijing?: string;           // 北京时间字串 (YYYY-MM-DD HH:mm)
  is_prematch: boolean;                       // 是否为赛前赛事
  status: 'PREMATCH' | 'IN_PLAY' | 'HALF_TIME' | 'FINISHED' | 'POSTPONED' | string;

  // 3. 比分与双源交叉核验
  score: {
    home: number;
    away: number;
  };
  score_verified: boolean;                    // 是否通过 YBTY 与 雷速 双源强校验
  score_source: 'ybty+leisu_api' | 'ybty_only' | 'leisu_only' | 'unverified';

  // 4. 统一技术统计 (Unified Physical Stats)
  unified_stats: {
    possession: { home: number; away: number };
    shots: { home: number; away: number };
    shots_on_target: { home: number; away: number };
    shots_off_target: { home: number; away: number };
    dangerous_attacks: { home: number; away: number };
    attacks: { home: number; away: number };
    corners: { home: number; away: number };
    yellow_cards: { home: number; away: number };
    red_cards: { home: number; away: number };
    shot_accuracy_home: number;              // 主队射正率 (0-100%)
    shot_accuracy_away: number;              // 客队射正率 (0-100%)
    danger_rate_home: number;                // 主队危险进攻转化率 (0-100%)
    danger_rate_away: number;                // 客队危险进攻转化率 (0-100%)
  };

  // 5. 攻势动能时序 (Attack Momentum Timeline)
  attack_momentum_timeline?: {
    available: boolean;
    data: number[][];                        // 归一化二维数组: [ [上半场差值], [下半场差值] ]
    nominal_segment_minutes?: number;        // 每段标称时长 (默认 45)
    segment_count?: number;                  // 分段数 (默认 2)
  } | null;

  // 6. 真实盘口快照 (YBTY 权威盘口白名单)
  market_snapshots: {
    full_total?: { over: number; under: number; line: string | number };
    half_total?: { over: number; under: number; line: string | number };
    full_spread?: { home: number; away: number; line: string | number };
    half_spread?: { home: number; away: number; line: string | number };
    full_h2h?: { home: number; draw: number; away: number };
    both_teams_to_score?: { yes: number; no: number };
    raw_markets: YbtyRawMarket[];            // 完整 YBTY 原始盘口列表，严禁裁剪
  };

  // 7. 事件流与文字直播
  timeline_events: Array<{
    minute: number;
    type: 'goal' | 'red_card' | 'yellow_card' | 'corner' | 'substitution' | 'penalty' | string;
    team: 'home' | 'away' | 'neutral';
    player_name?: string;
    description: string;
  }>;

  // 8. 战术背景与情报 (Tactical Context)
  tactical_context: {
    lineup_status: 'CONFIRMED' | 'PROJECTED' | 'UNAVAILABLE';
    home_formation?: string;
    away_formation?: string;
    home_starters?: string[];
    away_starters?: string[];
    home_substitutes?: string[];
    away_substitutes?: string[];
    home_form?: string;                      // 近期战绩走势 (如 "WWDLW")
    away_form?: string;
    head_to_head?: any[];                    // 历史交手记录
    environment?: {
      weather?: string;
      temperature?: string;
    };
  };

  // 9. 参考指数 (仅供机构意图研究，严禁作为下注项)
  reference_odds?: {
    asian_handicap?: { initial: any; current: any };
    euro_odds?: { initial: any; current: any };
    over_under?: { initial: any; current: any };
  };

  // 10. 初筛状态与 AI 深度建议
  grade?: 'A' | 'B' | 'C' | 'WATCH' | 'RESEARCH' | 'REJECT';
  recommendation?: {
    market: string;
    line: string | number;
    odds: string | number;
    side: string;
    reason?: string;
  } | null;
  evidence?: string[];
  risks?: string[];
}
```

---

### 3.2 每个字段的语义、类型定义与业务边界详解

| 字段名 | 类型 | 详细业务语义与边界约束 |
|---|---|---|
| `ybty_home` / `ybty_away` | `string` | **权威法定队名**。所有下注推荐、串关票据、AI 输出必须完全以此字段为准，禁止任何形式的翻译修改或雷速队名覆盖。 |
| `match` | `string` | 格式固定为 `${ybty_home} vs ${ybty_away}`，作为跨组件检索的主对阵键。 |
| `leisu_home` / `leisu_away` | `string?` | 雷速对照队名，仅用于模糊匹配和前端界面辅助副标题对照。 |
| `minute` | `number` | 滚球当前进行分钟（`0-120`）。赛前模式必须严格赋值为 `0`。 |
| `score` | `{ home: number, away: number }` | 当前双方实时比分。必须为有效非负整数。 |
| `score_verified` | `boolean` | **比分安全防线**。滚球必须 YBTY 与雷速接口比分完全吻合方为 `true`。若为 `false`，全系统严禁生成 A 级正式推荐。 |
| `score_source` | `enum` | `'ybty+leisu_api'`（双源已验）、`'ybty_only'`（单源）、`'unverified'`。写入台账以备回溯。 |
| `unified_stats` | `object` | 包含控球、射门、射正、危险进攻、角球、红黄牌等标准统计。缺失字段必须安全回退至 `0`（控球各回退 `50`）。 |
| `attack_momentum_timeline` | `object?` | 分钟级攻势波形，内部 `data` 统一规整为 `number[][]`（半场分段数组）。正值代表主队占优，负值代表客队占优。 |
| `market_snapshots.raw_markets` | `YbtyRawMarket[]`| **下注白名单绝对源**。AI 推荐提取的盘口、赔率必须来自于此数组，严禁引用雷速参考指数。 |
| `tactical_context.lineup_status` | `enum` | `'CONFIRMED'`（首发已官宣）、`'PROJECTED'`（预测阵容）、`'UNAVAILABLE'`。杯赛未确认首发前最高定级 C 级。 |

---

### 3.3 服务端派生量化模型 (CanonicalMatchData) 的明确定位

服务端 `server/services/canonicalMatchModel.ts` 中的 `CanonicalMatchData` **不是与 StandardMatchData 平行的竞争模型**，而是其在服务端执行复杂量化特征计算、攻势转化率分析时的 **内部派生展开态 (Derived Quant Feature State)**。

- **转换关系**: `StandardMatchData` → `canonicalizeRawMatchData()` → `CanonicalMatchData`
- **使用约束**: 仅在 server 内部 Prompt slim 构建与高级量化引擎中使用，对外 API 响应与前端消费统一收敛回 `StandardMatchData`。

## 4. YBTY 与 雷速 到 StandardMatchData 的严格赋值映射链路

### 4.1 多源对齐与赛事匹配机制 (Match Key Alignment)
在将 YBTY 和雷速合并前，系统通过以下 3 层管道进行赛事对齐：
1. **别名库与归一化名称精确比对**: 经过球队别名库映射后比对 `normalized_ybty_name === normalized_leisu_name`。
2. **时间窗口与联赛联合校验**: 开赛时间差异在 $\pm 2$ 小时内且联赛级别高度匹配。
3. **模糊相似度打分 (Levenshtein + Token Overlap)**: 综合相似度 $\ge 0.75$ 方可确认为同一场比赛。

---

### 4.2 字段级赋值与回退逻辑全矩阵

```text
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ StandardMatchData 目标字段     │ 主赋值源 (Primary Source)      │ 回退/安全保护策略 (Fallback)   │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ id                            │ YBTY.source_match_id          │ 拼接 `${ybty_home}_${ybty_away}`│
│ match_id                      │ Leisu.match_id                │ 回退为 String(id)             │
│ ybty_home                     │ YBTY.home                     │ 绝对优先，严禁被覆盖           │
│ ybty_away                     │ YBTY.away                     │ 绝对优先，严禁被覆盖           │
│ match                         │ `${ybty_home} vs ${ybty_away}`│ 统一标准格式                   │
│ leisu_home / leisu_away       │ Leisu.static_match.homeTeam   │ 留空或辅助显示                │
│ league                        │ YBTY.league                   │ 经 normalizeLeagueName 归一化 │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ minute                        │ 滚球解析 YBTY.clock (如 "68")  │ 若缺失取 Leisu.text_live 最大值│
│ is_prematch                   │ YBTY.export_mode === 'prematch│ minute === 0 或状态包含 PRE   │
│ score.home / score.away       │ YBTY.home_score / away_score  │ 转为 Number，缺失置 0         │
│ score_verified                │ YBTY.score === Leisu.score    │ 赛前置 true，滚球双源不符置 fals│
│ score_source                  │ 双源一致 -> 'ybty+leisu_api'  │ 单源则标记 'ybty_only'等      │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ unified_stats.possession      │ Leisu.confirmed_statistics    │ 缺失时主客各置 50             │
│ unified_stats.shots           │ Leisu.confirmed_statistics    │ 若无 shots 则取 on+offTarget  │
│ unified_stats.dangerous_att.  │ Leisu.confirmed_statistics    │ 缺失时置 0                    │
│ unified_stats.corners         │ Leisu.confirmed_statistics    │ 缺失时置 0                    │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ attack_momentum_timeline      │ Leisu.trend.data              │ 归一化为 number[][] 二维数组  │
│ timeline_events               │ Leisu.text_live + incidents   │ 解析进球/红黄牌生成事件流     │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ market_snapshots.raw_markets  │ YBTY.markets                  │ 完整深拷贝，注入 option_id    │
│ tactical_context.lineup_status│ Leisu.lineup.confirmed        │ true -> CONFIRMED, 否则PROJ.  │
│ tactical_context.starters     │ Leisu.lineup.home/away        │ 提取球员姓名列表              │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

---

### 4.3 标准转换函数实现标准 (Canonical Converter Implementation)

全系统统一标准转换入口位于 `src/types.ts` 中的 `toStandardMatchData(raw)`。任何模块接收到异构数据必须第一时间经过此函数归一化，严禁在业务组件中直接手写 ad-hoc 解析。

---

## 5. 数据取值与消费五大防破坏法则 (Anti-Violation Rules)

1. **队名权威律 (Team Name Authority)**:
   - 界面上所有关于**推荐、投注、串关、台账导出**的队名，**必须一律显示 `ybty_home` 与 `ybty_away`**。
   - `leisu_home` 仅作为辅助副标题或交叉验证显示，绝不允许在投注选项中显示雷速名称。

2. **盘口来源唯一律 (Exclusive Market Source)**:
   - AI 推荐与前端下注选项的玩法、盘口（`line`）与赔率（`odds`），**必须且只能提取自 `market_snapshots.raw_markets`**。
   - 严禁提取 `reference_odds`（雷速参考指数）作为投注推荐赔率。

3. **比分安全防线律 (Score Verification Gate)**:
   - 若 `score_verified === false`（比分未通过校验），系统**严禁发放 A 级正式推荐**，且必须在前端显著展示 `[比分待核验]` 警告。
   - 赛后结算滚球剩余进球时，未经校验的比分记录必须标记为 `invalid_data`，不得计入正式命中率。

4. **攻势时序多源容错律 (Momentum Waveform Robustness)**:
   - 读取攻势曲线时，必须优先经由 `extractAttackMomentumTimeline()` 解析，严禁假定 `attack_momentum_timeline` 为简单的一维数组；必须兼容二维数组 `[[], []]`、`trend.data`、`periods`、`segments` 及单场无数据时的技术统计推算态。

5. **串关风控与去重律 (Parlay Leg Association & Risk Control)**:
   - 串关腿必须通过 `match_id` 或 `ybty_home + ybty_away` 精确对齐到 `StandardMatchData`，禁止跨场次伪造关联。
   - 每一腿必须独立达到 B 级以上；同一投注方向最多进入一组普通串关（A 级例外最多两组），杜绝同向多次暴露击穿。

---

*本文件为 CODEX 系统的唯一核心数据契约，全系统所有功能开发、数据导入导出、AI 提示词构建与代码修改均以此为绝对基准。*


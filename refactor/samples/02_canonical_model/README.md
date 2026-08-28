# Layer 02: CanonicalMatch 标准赛事合并实体 (纯净未计算) - 字段规范与业务手册

本文档为 `refactor/samples/02_canonical_model/canonical_match_sample.json` 的**全量中文备注、字段规范与实体装配契约手册**。

该样例文件由 `refactor/02_canonical_model/canonicalMatchAssembler.ts` 通过双源实体装配器将 Layer 01 清洗后的 YBTY 盘口数据与雷速基本面/时序数据进行融合生成，严格服从 `refactor/02_canonical_model/types.ts` 与 `refactor/02_canonical_model/enums.ts` 契约定义。

---

## 📑 核心架构定位与数据模块全景目录 (Architecture & Datasets Catalog)

`CanonicalMatch` 是全量化评估系统全生命周期流转的**唯一标准赛事实体 (Single Source of Truth, SSOT)**。它在 6 层流水线中处于第二层 (Layer 02)，承上启下：

```
[01_data_ingestion] ──> [02_canonical_model (CanonicalMatch 纯净未计算)] ──> [03_quant_engine (确定性量化推演)]
```

### 💡 核心设计与权责边界铁律

1. **对齐下沉，标准纯净**：
   队名清洗、别名学习、文本相似度比对与颠倒排查已**全部在 Layer 01/02 智能导入向导阶段一次性完成**。进入 `CanonicalMatch` 标准实体后，仅保留最简对齐结论与溯源元数据 (`alignment`)，主系统**严禁在后续量化与分析层暴露或依赖底层相似度算分过程**。
2. **唯一业务键标准化 (`canonical_id`)**：
   全局唯一标识由标准格式化规则生成，作为全系统跨模块流转、UI 状态缓存与台账索引的确定性主键。
3. **11 维真实特征全量归集**：
   涵盖 YBTY 6 大盘口玩法全集、雷速 8 大攻防技术统计、分钟级动量波形、时序事件、首发名单、往绩交锋、联赛积分榜与时段进球分布。

系统将 `CanonicalMatch` 划分为 **8 大核心数据板块与 1 项极简 AI 提炼包**：

| 板块编号 | 模块名称 (Module Name) | 核心包含内容与业务指标 | 对应文档章节 | 典型应用层级 (Layer) |
| :--- | :--- | :--- | :--- | :--- |
| **CM-01** | **实体全局主键与完整度分级**<br>`(Canonical Identity & Quality Tier)` | 全局唯一业务主键 (`canonical_id`)、装配时间戳、数据完整度等级 (`completeness_tier`)、显式数据缺口枚举清单 (`missing_reasons`) | [第 1 节](#1-顶层元数据与完整度分级-root-identity--tier) | Layer 02~06 唯一索引与风控推荐准入 |
| **CM-02** | **数据源关联溯源与对齐元数据**<br>`(Ingestion Alignment Traceability)` | 来源对齐状态 (`MatchAlignmentStatus`)、对齐置信分、关联雷速队伍/联赛 ID、决策文字说明（供数据排错与审计追溯） | [第 2 节](#2-数据源关联溯源与对齐元数据-alignment) | Layer 02 数据排错与底层审计溯源 |
| **CM-03** | **法定基准队名与联赛**<br>`(Legal Execution Teams & League)` | YBTY 原始法定联赛名 (`league_name`)、原始法定主队名 (`home_team_name`)、原始法定客队名 (`away_team_name`) | [第 3 节](#3-法定基准队名与联赛-legal-names) | Layer 04/05/06 推荐出票、台账核销基准 |
| **CM-04** | **标准时点与生命周期状态**<br>`(Canonical Timing & Status)` | 统一标准北京时间 (`YYYY-MM-DD HH:mm:ss`)、时间来源 (`YBTY_EXACT`/`LEISU_SUPPLEMENTED`)、滚球进行分钟、半场/加时/点球标识 | [第 4 节](#4-标准时点与生命周期状态-timing) | Layer 03 泊松时间衰减推演、各阶段划分 |
| **CM-05** | **双源校验比分与冲突熔断**<br>`(Verified Score & Safety Fuse)` | 即时主客比分、半场比分、比分校验标记 (`score_verified`)、校验源、双源比分冲突严重警告 (`is_mismatch_detected`) | [第 5 节](#5-双源校验比分状态与冲突熔断-score) | Layer 03/05/06 净胜结算与一票熔断安全阀 |
| **CM-06** | **法定交易盘口组 (无篡改)**<br>`(Clean Markets Execution Group)` | 全场/半场让球主副盘 (`Spread`)、全场/半场大小球主副盘 (`Total`)、全场/半场独赢 (`1X2`)、双方进球 (`BTTS`)、角球大小盘 | [第 6 节](#6-法定交易盘口组-markets) | Layer 03 去抽水公允概率、EV 计算与出票 |
| **CM-07** | **雷速基本面与时序增强包**<br>`(Leisu Reference Context Package)` | 8 大核心攻防统计、分钟级压迫动量波形、正向时序事件、首发阵型名单、历史交锋战绩、初即滚赔率矩阵、积分榜与进球分布 | [第 7 节](#7-雷速全量基本面增强包-reference) | Layer 03/04 战术对抗、攻防斜率与基本面 |
| **CM-08** | **完整度分级与风控准入依据**<br>`(Access Control Matrix)` | `TIER_1_FULL`、`TIER_2_BASIC`、`TIER_3_SPARSE`、`TIER_INVALID` 四大等级判定与权限矩阵 | [第 8 节](#8-数据完整度分级与风控准入对照表) | Layer 05 推荐生成与串关风控硬性门槛 |
| **CM-09** | **极简 AI 提炼包规范**<br>`(AiEvaluationBrief Specification)` | 每场仅消耗 200~400 Tokens 的高信息密度结构，提纯核心盘口、攻防统计、动量、阵型对位与缺口标记 | [第 9 节](#9-极简-ai-提炼包规范-aievaluationbrief) | Layer 04 大模型高效无噪音评估载体 |

---

## 1. 顶层元数据与完整度分级 (Root Identity & Tier)

```json
{
  "canonical_id": "英甲_谢周三_vs_布拉德福德",
  "created_at": "2026-08-28T02:22:54.233Z",
  "completeness_tier": "TIER_1_FULL",
  "missing_reasons": [],
  "league_name": "英甲",
  "home_team_name": "谢周三",
  "away_team_name": "布拉德福德"
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `canonical_id` | `string` | `"英甲_谢周三_vs_布拉德福德"` | **赛事全局唯一业务主键**。规则：`${league_name}_${home_team_name}_vs_${away_team_name}`，由 YBTY 法定原名规范清洗生成，作为全系统跨模块通信与推荐台账唯一索引。 |
| `created_at` | `string` | `"2026-08-28T02:22:54.233Z"` | **实体装配 UTC ISO 8601 时间戳**。记录装配流水线执行的具体时点。 |
| `completeness_tier` | `DataCompletenessTier` | `"TIER_1_FULL"` | **数据完整度等级**。枚举取值：`TIER_1_FULL` (全量具备)、`TIER_2_BASIC` (基础具备)、`TIER_3_SPARSE` (稀疏监控)、`TIER_INVALID` (无效熔断)。 |
| `missing_reasons` | `MissingDataReason[]` | `[]` | **显式数据缺口枚举清单**。记录当前赛事缺失维度的机器可读代码（如 `NO_LEISU_MATCH`、`MISSING_LINEUP`、`SCORE_UNVERIFIED`、`SCORE_MISMATCH_CONFLICT` 等）。 |
| `league_name` | `string` | `"英甲"` | **YBTY 原始法定联赛名**。系统法定基准。 |
| `home_team_name` | `string` | `"谢周三"` | **YBTY 原始法定主队名**。系统法定基准，推荐、出票与回测台账一律以此为准。 |
| `away_team_name` | `string` | `"布拉德福德"` | **YBTY 原始法定客队名**。系统法定基准，推荐、出票与回测台账一律以此为准。 |

---

## 2. 数据源关联溯源与对齐元数据 (`alignment`)

> ⚠️ **架构权责边界说明**：  
> 该对象仅作为数据采集与对齐层的**入库审计凭证与排错追溯元数据**。主系统量化引擎与战术分析面板直接消费清洗后的法定属性与雷速增强特征，无需关心底层文本模糊匹配细节。

```json
{
  "alignment": {
    "status": "MATCHED_BY_ALIAS",
    "confidence_score": 100,
    "home_team_match": {
      "ybty_name": "谢周三",
      "leisu_name": "谢周三",
      "is_alias_exact_hit": true,
      "raw_text_similarity": 1.0
    },
    "away_team_match": {
      "ybty_name": "布拉德福德",
      "leisu_name": "布拉德福德",
      "is_alias_exact_hit": true,
      "raw_text_similarity": 1.0
    },
    "league_match": {
      "ybty_league": "英甲",
      "leisu_league": "英甲",
      "status": "MATCHED_BY_ALIAS",
      "similarity": 1.0,
      "is_alias_exact_hit": true
    },
    "league_match_score": 1.0,
    "is_swapped_suspected": false,
    "alignment_reason": "主客两队均命中静态别名库 (100% 精确匹配)"
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与业务说明 |
| :--- | :--- | :--- | :--- |
| `status` | `MatchAlignmentStatus` | `"MATCHED_BY_ALIAS"` | **数据源对齐状态**：`MATCHED_BY_ALIAS` (别名库命中), `MATCHED_AUTO` (自动对齐), `NEEDS_MANUAL_SELECTION` (导入待选), `SWAPPED_HOME_AWAY` (颠倒拦截), `UNMATCHED` (未关联)。 |
| `confidence_score` | `number` | `100` | **对齐置信度得分**（0 ~ 100）。导入向导根据此分值决定自动入库或提示人工裁决。 |
| `home_team_match` | `TeamNameMatchResult` | `{...}` | **主队来源映射明细**（包含雷速对应队名及别名命中标记）。 |
| `away_team_match` | `TeamNameMatchResult` | `{...}` | **客队来源映射明细**。 |
| `league_match` | `LeagueMatchResult` | `{...}` | **联赛来源映射明细**。 |
| `league_match_score` | `number` | `1.0` | **联赛对齐评分**。 |
| `is_swapped_suspected`| `boolean` | `false` | **主客场颠倒警报标记**（导入层检测到倒挂时触发，严防错误关联）。 |
| `alignment_reason` | `string` | `"主客两队均命中静态别名库..."` | **对齐溯源文字记录**。 |

---

## 3. 法定基准队名与联赛 (Legal Names)

### 核心权责边界：纯出票映射与预测计算物理隔离

1. **YBTY 原始队名与联赛名（纯出票展示与投注映射）**：
   - 所有的 AI 正式推荐输出、串关每一腿、出票确认与回测台账写入，**必须 100% 采用 YBTY 原始名称**；
   - 让你在面板和出票时直接对应 YBTY 投注页面，一眼识别，零认知转换出票；
   - **❌ 绝对不参与任何量化预测与算法计算**。
2. **YBTY 盘口数据（深度参与计算）**：
   - 让球/大小球/独赢/主副盘精确盘口线与赔率，用于 Layer 03 剥水公允概率、+EV 计算与盘口深度比对。
3. **雷速全量基本面数据（深度参与计算）**：
   - 攻防统计、动量波形、阵型名单、交锋战绩、积分榜与进球分布，为 Layer 03 确定性量化推演与 Layer 04 AI 战术研判的核心数据输入源。

---

## 4. 标准时点与生命周期状态 (`timing`)

```json
{
  "timing": {
    "stage": "LIVE",
    "beijing_start_time": "2026-08-21 03:00:00",
    "start_time_source": "LEISU_SUPPLEMENTED",
    "minute": 63,
    "ybty_clock": "63:00",
    "ybty_status_text": "63:00",
    "leisu_status_text": "下半场",
    "is_half_time": false,
    "is_extra_time": false,
    "is_overtime_or_penalty": false
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `stage` | `MatchStage` | `"LIVE"` | **比赛生命周期阶段**：`PREMATCH` (赛前) / `LIVE` (滚球进行中) / `FINISHED` (已完场)。 |
| `beijing_start_time` | `string` | `"2026-08-21 03:00:00"`| **标准北京开赛时间 (UTC+8)**。格式为 `YYYY-MM-DD HH:mm:ss`，全系统统一时间基准，杜绝未转换的 UTC 'T'/'Z'。 |
| `start_time_source` | `string` | `"LEISU_SUPPLEMENTED"` | **开赛时间来源标识**：<br>• `YBTY_EXACT`: YBTY 原始完整时间戳<br>• `YBTY_ESTIMATED`: 依据“X分钟后开赛”按抓取时间推算<br>• `LEISU_SUPPLEMENTED`: 雷速匹配数据补充提供（需在推荐中清晰标注） |
| `minute` | `number \| null` | `63` | **比赛进行分钟数**（纯数字，赛前赛事为 `null`）。取自雷速校验时钟，为 Layer 03 泊松时间衰减推演核心参数。 |
| `ybty_clock` | `string \| null` | `"63:00"` | **YBTY 即时时钟文本**（如 `"23:23"`, `"45'"`, `"HT"`）。 |
| `ybty_status_text` | `string \| null` | `"63:00"` | **YBTY 原始状态描述**（如 `"即将开赛"`, `"中场休息"`, `"已结束"`）。 |
| `leisu_status_text` | `string \| null` | `"下半场"` | **雷速生命周期文本**（如 `"上半场"`, `"中场"`, `"下半场"`, `"完场"`）。 |
| `is_half_time` | `boolean` | `false` | **是否正处于中场休息**（便于半场即时重估与盘口休整策略执行）。 |
| `is_extra_time` | `boolean` | `false` | **是否处于加时赛**。 |
| `is_overtime_or_penalty`| `boolean` | `false` | **是否处于加时赛或点球大战**。 |

---

## 5. 双源校验比分状态与冲突熔断 (`score`)

```json
{
  "score": {
    "home_score": 0,
    "away_score": 1,
    "home_half_score": 0,
    "away_half_score": 0,
    "score_verified": true,
    "score_source": "LEISU_INTERFACE",
    "is_mismatch_detected": false,
    "mismatch_details": null
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `home_score` | `number` | `0` | **当前主队总进球数**。 |
| `away_score` | `number` | `1` | **当前客队总进球数**。 |
| `home_half_score` | `number \| null` | `0` | **半场主队进球数**（未达半场时为 `null`）。 |
| `away_half_score` | `number \| null` | `0` | **半场客队进球数**（未达半场时为 `null`）。 |
| `score_verified` | `boolean` | `true` | **比分是否经高可靠校验**。必须通过雷速比分画布或可靠接口验证，且与 YBTY 无冲突。未校验比分严禁给出 A 级推荐。 |
| `score_source` | `string` | `"LEISU_INTERFACE"` | **比分提取来源**：`LEISU_CANVAS` (雷速画布), `LEISU_INTERFACE` (雷速接口), `YBTY_DIRECT` (YBTY直采), `UNVERIFIED` (未校验)。 |
| `is_mismatch_detected` | `boolean` | `false` | **⚠️ 双源比分冲突严重警告**（当 YBTY 与雷速即时比分不一致时置为 `true`）。 |
| `mismatch_details` | `string \| null` | `null` | **冲突明细文字说明**（如 `"比分冲突: YBTY(0-0) vs 雷速(0-1)"`），触发一票熔断降级为 `TIER_INVALID`。 |

---

## 6. 法定交易盘口组 (`markets`)

```json
{
  "markets": {
    "full_spread_main": {
      "line_index": 0,
      "handicap": "+0.5",
      "home_odds": 1.81,
      "away_odds": 2.09
    },
    "full_spread_subs": [
      { "line_index": 1, "handicap": "+0/0.5", "home_odds": 2.13, "away_odds": 1.78 },
      { "line_index": 2, "handicap": "+0.5/1", "home_odds": 1.56, "away_odds": 2.51 }
    ],
    "full_total_main": {
      "line_index": 0,
      "handicap": "1.5/2",
      "over_odds": 1.82,
      "under_odds": 2.06
    },
    "full_total_subs": [
      { "line_index": 1, "handicap": "2", "over_odds": 2.2, "under_odds": 1.71 },
      { "line_index": 2, "handicap": "1.5", "over_odds": 1.62, "under_odds": 2.35 }
    ],
    "full_h2h": {
      "home_win": 3.9,
      "draw": 2.99,
      "away_win": 2.16
    },
    "half_spread_main": {
      "line_index": 0,
      "handicap": "+0/0.5",
      "home_odds": 1.57,
      "away_odds": 2.49
    },
    "half_total_main": {
      "line_index": 0,
      "handicap": "0.5",
      "over_odds": 2.14,
      "under_odds": 1.75
    },
    "half_h2h": null,
    "both_teams_to_score": null,
    "corners_over_under": null
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- |
| `full_spread_main` | `CleanSpreadLine \| null` | `{"handicap": "+0.5", "home_odds": 1.81, "away_odds": 2.09}` | **全场让球主盘 (Spread Line Index 0)**。机构核心基准让球盘口线与主客赔率。 |
| `full_spread_subs` | `CleanSpreadLine[]` | `[...]` | **全场让球副盘列表 (Spread Line Index $\ge 1$)**。包含深盘、浅盘等附加让球线。 |
| `full_total_main` | `CleanTotalLine \| null` | `{"handicap": "1.5/2", "over_odds": 1.82, "under_odds": 2.06}` | **全场大小球主盘 (Total Line Index 0)**。基准总进球盘口线与大/小球赔率。 |
| `full_total_subs` | `CleanTotalLine[]` | `[...]` | **全场大小球副盘列表 (Total Line Index $\ge 1$)**。附加大小球盘口线。 |
| `full_h2h` | `CleanH2HLine \| null` | `{"home_win": 3.9, "draw": 2.99, "away_win": 2.16}` | **全场欧洲独赢 (1X2)**。主胜、平局、客胜标准赔率。 |
| `half_spread_main` | `CleanSpreadLine \| null` | `{...}` | **半场让球主盘**。上半场或半场阶段让球盘口与赔率。 |
| `half_total_main` | `CleanTotalLine \| null` | `{...}` | **半场大小球主盘**。上半场或半场阶段大小球盘口与赔率。 |
| `half_h2h` | `CleanH2HLine \| null` | `null` | **半场独赢 (Half 1X2)**。 |
| `both_teams_to_score`| `object \| null` | `null` | **双方进球盘口 (BTTS)**（包含 `yes` 与 `no` 赔率）。 |
| `corners_over_under` | `object \| null` | `null` | **角球大小盘口**。 |

---

## 7. 雷速全量基本面增强包 (`reference`)

当赛事成功与雷速数据对齐时，`reference` 包含以下 **10 维深度参考增强数据**（未匹配时显式为 `null`）：

```json
{
  "reference": {
    "leisu_match_id": "4562395",
    "leisu_home_name": "谢周三",
    "leisu_away_name": "布拉德福德",
    "leisu_league_name": "英甲",
    "stats": { ... },
    "attack_momentum": { ... },
    "timeline_events": [ ... ],
    "lineups": { ... },
    "tactical_context": { ... },
    "odds_matrix": { ... },
    "league_standings": { ... },
    "goal_distribution": { ... }
  }
}
```

| 子字段名称 (`Key`) | 对应数据类型 | 包含核心内容 |
| :--- | :--- | :--- |
| `leisu_match_id` | `string` | 雷速比赛唯一全局 ID |
| `leisu_home_name` | `string` | 雷速标准主队名（用于交叉核对） |
| `leisu_away_name` | `string` | 雷速标准客队名 |
| `leisu_league_name` | `string` | 雷速标准联赛名 |
| `stats` | `ParsedLeisuStats \| null` | **8 大核心攻防技术统计**：射门、射正、射偏、点球、角球、危险进攻、控球率、红黄牌 |
| `attack_momentum` | `ParsedLeisuMomentum \| null` | **分钟级压迫动量波形**：全场 1~90 分钟主客双方压迫指数时序数组，近 5/15 分钟攻势斜率 |
| `timeline_events` | `ParsedLeisuTimelineEvent[]` | **正向时序事件流**：逐分钟进球、红黄牌、换人、射正、角球事件与描述 |
| `lineups` | `ParsedLeisuLineup \| null` | **首发阵容与战术阵型**：阵型体系 (`4-3-3` 等)、首发/替补名单、球员身价与评分 |
| `tactical_context` | `ParsedLeisuTacticalContext \| null` | **战术背景与交锋战绩**：近 10 场直接交锋 (`h2h_raw`)、主客双方近 20 场近期战绩 (`recent_matches`) |
| `odds_matrix` | `ParsedLeisuOddsMatrix \| null` | **三合一赔率矩阵**：欧洲独赢、亚洲让球、大小球的初盘与即时盘参考 |
| `league_standings` | `ParsedLeagueStandings \| null` | **联赛积分与主客场排名**：主客队赛季总/主/客场排名、胜平负、进失球与积分 |
| `goal_distribution` | `ParsedGoalDistribution \| null` | **时段进球偏好分布**：六大 15 分钟时段进球比例与首开纪录时段偏好 |

---

## 8. 数据完整度分级与风控准入对照表

| 完整度等级 (`DataCompletenessTier`) | 核心判定标准 | 推荐准入权限与风控动作 |
| :--- | :--- | :--- |
| **`TIER_1_FULL`**<br>(全量具备) | 阵型首发、攻防统计、动量波形、积分榜与进球分布全维度具备，且比分经画布核验无冲突 | **全量准入**：<br>• 允许生成 A / B / C 级正式单场推荐；<br>• 符合 A 级标准且评分 $\ge 85$ 时，同一方向最多可进入 2 组正式串关。 |
| **`TIER_2_BASIC`**<br>(基础具备) | 具备 8 大攻防统计与基础盘口比分，但阵型未公布或缺少部分动量时序 | **受限准入**：<br>• 降级处理，最高仅允许评定为 B 级推荐；<br>• 同一方向最多仅允许进入 1 组正式串关。 |
| **`TIER_3_SPARSE`**<br>(稀疏监控) | 未能成功匹配雷速增强数据，或仅有基础比分与盘口，缺失攻防统计 | **严禁推荐**：<br>• 仅作为盘口行情监控与列表展示；<br>• 严禁进入正式 AI 评估、单场推荐与串关推荐。 |
| **`TIER_INVALID`**<br>(无效熔断) | 检测到双源比分冲突、主客颠倒疑似预警或源头数据严重损坏 | **一票熔断**：<br>• 标记为脏数据，立即停止一切量化运算与推荐；<br>• 赛后核销标记为 `invalid_data`，不计入命中率。 |

---

## 9. 极简 AI 提炼包规范 (`AiEvaluationBrief`)

为了避免将数千行原始 DOM、嵌套时序和冗余统计直接输入大模型导致 Token 暴涨和注意力分散，装配器内置 `extractAiEvaluationBrief(canonicalMatch)` 纯函数，将其提炼为每场仅消耗 **200~400 Tokens** 的高信息密度提纯载体：

### JSON 提炼包样例

```json
{
  "match_id": "英甲_谢周三_vs_布拉德福德",
  "league": "英甲",
  "kickoff_time": "2026-08-21 03:00:00",
  "status_summary": "LIVE 63' (0-1)",
  "teams": {
    "home": "谢周三",
    "away": "布拉德福德"
  },
  "score_verification": {
    "is_verified": true,
    "current_score": "0 - 1"
  },
  "core_markets": {
    "ah_main": { "handicap": "+0.5", "home_odds": 1.81, "away_odds": 2.09 },
    "ou_main": { "handicap": "1.5/2", "over_odds": 1.82, "under_odds": 2.06 },
    "euro_1x2": { "home_win": 3.9, "draw": 2.99, "away_win": 2.16 },
    "ah_half": { "handicap": "+0/0.5", "home_odds": 1.57, "away_odds": 2.49 },
    "ou_half": { "handicap": "0.5", "over_odds": 2.14, "under_odds": 1.75 }
  },
  "condensed_features": {
    "possession": { "home": 62, "away": 38 },
    "shots_on_target": { "home": 5, "away": 3 },
    "dangerous_attacks": { "home": 58, "away": 29 },
    "corners": { "home": 7, "away": 2 },
    "recent_momentum_5min": { "home": 68, "away": 12 },
    "recent_momentum_15min": { "home": 55, "away": 30 },
    "formations": { "home": "4-4-2", "away": "3-5-2" },
    "h2h_summary": "近10场 4胜3平3负 (主场3胜1平1负)",
    "league_rank": { "home": 6, "away": 3 }
  },
  "data_deficits": []
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 中文含义与 AI 评估指引 |
| :--- | :--- | :--- | :--- |
| `match_id` | `string` | `"英甲_谢周三_vs_布拉德福德"` | **全局唯一业务标识**。 |
| `league` | `string` | `"英甲"` | **法定联赛名称**。 |
| `kickoff_time` | `string` | `"2026-08-21 03:00:00"` | **标准北京开赛时间**。 |
| `status_summary` | `string` | `"LIVE 63' (0-1)"` | **比赛即时概况摘要**（包含阶段、分钟、比分与红牌数）。 |
| `teams` | `object` | `{"home": "谢周三", "away": "布拉德福德"}` | **YBTY 法定执行队名**。 |
| `score_verification` | `object` | `{"is_verified": true, "current_score": "0 - 1"}` | **比分校验标记与比分串**（未核验时严禁下发 A 级推荐）。 |
| `core_markets` | `object` | `{...}` | **核心精简交易盘口**（全场让球主盘、大小球主盘、独赢与半场主盘）。 |
| `condensed_features` | `object` | `{...}` | **高价值精炼特征集**：控球率、射正、危攻、角球、近 5/15 分钟动量斜率、阵型对位、往绩交锋与联赛排名。 |
| `data_deficits` | `string[]` | `[]` | **明确数据缺口清单**。当存在严重缺口时，AI 须主动执行不稳定性降级或熔断。 |

---

## 10. 真实装配样例与断言测试验证

通过运行以下测试套件，可直接复现并检验 `CanonicalMatch` 装配全流程：

```bash
# 运行 Layer 02 标准赛事装配器单元测试
npx tsx refactor/tests/verify_canonical_match_assembler.ts

# 运行全链路 Layer 00 ~ Layer 02 整体回归测试
npx tsx refactor/tests/verify_common_infrastructure.ts && \
npx tsx refactor/tests/verify_ybty_live_extractor.ts && \
npx tsx refactor/tests/verify_ybty_prematch_extractor.ts && \
npx tsx refactor/tests/verify_leisu_interface_extractor.ts && \
npx tsx refactor/tests/verify_canonical_match_assembler.ts
```

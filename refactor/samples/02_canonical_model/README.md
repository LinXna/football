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

---

### 🚦 全局数据用途与消费流向分类体系 (Data Usage Classification)

为了实现严密的工程隔离，防止将展示字段带入数学计算，或将几千行原始数据直接丢给大模型，系统将所有字段划分为 **5 大消费流向分类**：

| 流向标识 (Tag) | 分类名称 | 典型字段示例 | 核心职责与消费层级 | 严禁滥用红线 |
| :--- | :--- | :--- | :--- | :--- |
| **`[UI展示/出票]`** | **面板展示与出票映射** | YBTY原始队名/联赛名、雷速队名、时钟文本、环境描述、对齐溯源文字 | 前端页面渲染、人工核对、出票确认单打印、YBTY界面一键对齐 | **❌ 严禁参与任何赔率预测或量化数学计算** |
| **`[量化计算]`** | **物理量化与博弈计算** | 8大攻防统计、动量波形数组、滚球分钟、盘口线与水位、半场统计 | Layer 03 攻防压迫指数、剥水公允概率、泊松时间衰减、滚球 0:0 重置净胜计算 | **❌ 严禁在计算层使用未经清洗的原始字符串** |
| **`[AI提炼]`** | **大模型提示词消费** | `AiEvaluationBrief` 精炼盘口、核心统计均值、近期动量斜率、阵型对位、往绩战意 | Layer 04 大模型评估，以每场 200~400 Tokens 的极高信息密度输入 AI | **❌ 严禁将数千行未加工的原始时序/DOM丢给 AI** |
| **`[风控门禁]`** | **准入权限与安全熔断** | 比分校验标记 (`score_verified`)、比分冲突警告 (`is_mismatch_detected`)、完整度分级 (`completeness_tier`) | Layer 05 推荐准入拦截、降级、一票熔断（未校验比分严禁 A 级，冲突则判定 INVALID） | **❌ 严禁在风控熔断后继续生成正式推荐** |
| **`[全局主键]`** | **系统索引与台账主键** | `canonical_id` (雷速赛事 ID)、`match_slug` (自然语言对阵标识) | 全系统跨模块流转、前端组件 Key、推荐台账与回测核销唯一物理索引 | **❌ 严禁跨批次随意篡改主键格式** |

---

系统将 `CanonicalMatch` 划分为 **8 大核心数据板块与 1 项极简 AI 提炼包**：

| 板块编号 | 模块名称 (Module Name) | 核心包含内容与业务指标 | 数据主要用途 (Usage) | 对应文档章节 |
| :--- | :--- | :--- | :--- | :--- |
| **CM-01** | **实体全局主键与完整度分级** | 全局唯一物理主键 (`canonical_id`)、完整度等级 (`completeness_tier`)、缺口枚举 (`missing_reasons`) | `[全局主键]` `[风控门禁]` | [第 1 节](#1-顶层元数据与完整度分级-root-identity--tier) |
| **CM-02** | **数据源关联溯源与对齐元数据** | 对齐状态 (`status`)、置信分 (`confidence_score`)、关联队伍/联赛 ID、对齐排错说明 | `[UI展示/出票]` (仅导入排错与审计) | [第 2 节](#2-数据源关联溯源与对齐元数据-alignment) |
| **CM-03** | **法定基准队名与联赛** | YBTY 原始法定联赛名 (`league_name`)、原始法定主队名 (`home_team_name`)、原始法定客队名 (`away_team_name`) | `[UI展示/出票]` `[推荐台账]` | [第 3 节](#3-法定基准队名与联赛-legal-names) |
| **CM-04** | **标准时点与生命周期状态** | 标准北京时间、开赛时间来源、滚球进行分钟数 (`minute`)、半场/加时标识 | `[量化计算]` `[UI展示/出票]` | [第 4 节](#4-标准时点与生命周期状态-timing) |
| **CM-05** | **双源校验比分与冲突熔断** | 即时比分、半场比分、比分校验标记 (`score_verified`)、双源比分冲突警告 (`is_mismatch_detected`) | `[风控门禁]` `[量化计算]` | [第 5 节](#5-双源校验比分状态与冲突熔断-score) |
| **CM-06** | **法定交易盘口组 (无篡改)** | 全场/半场让球主副盘、大小球主副盘、独赢 (1X2)、双方进球 (BTTS)、角球盘 | `[量化计算]` `[UI展示/出票]` | [第 6 节](#6-法定交易盘口组-markets) |
| **CM-07** | **雷速基本面与时序增强包** | 8大攻防统计、分钟级动量波形、时序事件、首发阵型、往绩交锋、积分榜、进球分布 | `[量化计算]` `[AI提炼]` | [第 7 节](#7-雷速全量基本面增强包-reference) |
| **CM-08** | **完整度分级与风控准入依据** | `TIER_1_FULL` ~ `TIER_INVALID` 四大等级判定与准入权限规则对照 | `[风控门禁]` | [第 8 节](#8-数据完整度分级与风控准入对照表) |
| **CM-09** | **极简 AI 提炼包规范** | 每场仅消耗 200~400 Tokens 的高密度提纯结构 (精炼盘口、核心均值、动量、缺口) | `[AI提炼]` (仅供大模型提示词消费) | [第 9 节](#9-极简-ai-提炼包规范-aievaluationbrief) |

---

## 1. 顶层元数据与完整度分级 (Root Identity & Tier)

```json
{
  "canonical_id": "4562395",
  "match_slug": "英格兰甲级联赛_谢周三_vs_布拉德福德城",
  "created_at": "2026-08-29T23:32:53.000Z",
  "completeness_tier": "TIER_1_FULL",
  "missing_reasons": [],
  "league_name": "英格兰甲级联赛",
  "home_team_name": "谢周三",
  "away_team_name": "布拉德福德城"
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 数据源头 (`Data Source`) | 数据用途与流向 (`Usage`) | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `canonical_id` | `string` | `"4562395"` | **雷速 (Leisu)** | `[全局主键]` `[推荐台账]` | **赛事全局唯一物理主键**。严格确立为雷速赛事 ID (`leisu_match_id`)，物理世界唯一且不可重复，作为全系统跨模块流转与推荐台账唯一主键。 |
| `match_slug` | `string` | `"英格兰甲级联赛_谢周三_vs_布拉德福德城"` | **双源合成** | `[UI展示/出票]` | **业务对阵自然语言标识**。格式：`${league_name}_${home_team_name}_vs_${away_team_name}`，作为辅助人类可读检索。 |
| `created_at` | `string` | `"2026-08-29T23:32:53.000Z"` | **系统流水线** | `[系统审计]` | **实体装配 UTC ISO 8601 时间戳**。记录装配流水线执行的具体时点。 |
| `completeness_tier` | `DataCompletenessTier` | `"TIER_1_FULL"` | **系统判定** | `[风控门禁]` | **数据完整度等级**。枚举取值：`TIER_1_FULL` (全量具备)、`TIER_2_BASIC` (基础具备)、`TIER_3_SPARSE` (稀疏监控)、`TIER_INVALID` (无效熔断)。 |
| `missing_reasons` | `MissingDataReason[]` | `[]` | **系统判定** | `[风控门禁]` `[AI提炼]` | **显式数据缺口枚举清单**。记录当前赛事缺失维度的机器可读代码（如 `NO_LEISU_MATCH`、`MISSING_LINEUP`、`SCORE_UNVERIFIED`、`MISSING_LIVE_MINUTE` 等）。 |
| `league_name` | `string` | `"英格兰甲级联赛"` | **YBTY (法定)** | `[UI展示/出票]` `[推荐台账]` | **YBTY 原始法定联赛名**。系统法定基准，推荐出票与回测台账严格以此为准（**❌不参与预测计算**）。 |
| `home_team_name` | `string` | `"谢周三"` | **YBTY (法定)** | `[UI展示/出票]` `[推荐台账]` | **YBTY 原始法定主队名**。系统法定基准，推荐出票与回测台账严格以此为准（**❌不参与预测计算**）。 |
| `away_team_name` | `string` | `"布拉德福德城"` | **YBTY (法定)** | `[UI展示/出票]` `[推荐台账]` | **YBTY 原始法定客队名**。系统法定基准，推荐出票与回测台账严格以此为准（**❌不参与预测计算**）。 |

---

## 2. 数据源关联溯源与对齐元数据 (`alignment`)

> ⚠️ **架构权责边界与数据用途说明**：  
> 该对象为 **`[UI展示/出票]` (仅导入排错与审计)**。仅作为数据采集与对齐层的**入库审计凭证与排错追溯元数据**。主系统量化引擎与战术分析面板直接消费清洗后的法定属性与雷速增强特征，**❌严禁量化推演与战术分析层依赖底层文本相似度匹配细节**。

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
      "ybty_name": "布拉德福德城",
      "leisu_name": "布拉德福德",
      "is_alias_exact_hit": true,
      "raw_text_similarity": 0.8
    },
    "league_match": {
      "ybty_league": "英格兰甲级联赛",
      "leisu_league": "英甲",
      "status": "MATCHED_BY_ALIAS",
      "similarity": 0.9,
      "is_alias_exact_hit": true
    },
    "league_match_score": 0.9,
    "is_swapped_suspected": false,
    "alignment_reason": "别名库精准命中匹配"
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 数据源头 (`Data Source`) | 数据用途与流向 (`Usage`) | 中文含义与业务说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `status` | `MatchAlignmentStatus` | `"MATCHED_BY_ALIAS"` | **系统对齐引擎** | `[UI展示/出票]` (排错审计) | **数据源对齐状态**：`MATCHED_BY_ALIAS` (别名库命中), `MATCHED_AUTO` (自动对齐), `NEEDS_MANUAL_SELECTION` (导入待选), `SWAPPED_HOME_AWAY` (颠倒拦截), `UNMATCHED` (未关联)。 |
| `confidence_score` | `number` | `100` | **系统对齐引擎** | `[UI展示/出票]` (导入门槛) | **对齐置信度得分**（0 ~ 100）。导入向导根据此分值决定自动入库或提示人工裁决。 |
| `home_team_match` | `TeamNameMatchResult` | `{...}` | **YBTY & 雷速比对** | `[UI展示/出票]` (排错审计) | **主队来源映射明细**（包含雷速对应队名及别名命中标记）。 |
| `away_team_match` | `TeamNameMatchResult` | `{...}` | **YBTY & 雷速比对** | `[UI展示/出票]` (排错审计) | **客队来源映射明细**。 |
| `league_match` | `LeagueMatchResult` | `{...}` | **YBTY & 雷速比对** | `[UI展示/出票]` (排错审计) | **联赛来源映射明细**。 |
| `league_match_score` | `number` | `1.0` | **系统对齐引擎** | `[UI展示/出票]` (排错审计) | **联赛对齐评分**。 |
| `is_swapped_suspected`| `boolean` | `false` | **系统对齐引擎** | `[风控门禁]` | **主客场颠倒警报标记**（导入层检测到倒挂时触发，严防错误关联）。 |
| `alignment_reason` | `string` | `"主客两队名称完全一致..."` | **系统对齐引擎** | `[UI展示/出票]` (排错审计) | **对齐溯源文字记录**。 |

---

## 3. 法定基准队名与联赛 (Legal Names)

### 核心权责边界：纯出票映射与预测计算物理隔离

1. **YBTY 原始队名与联赛名 `[UI展示/出票]` `[推荐台账]`**：
   - 所有的 AI 正式推荐输出、串关每一腿、出票确认与回测台账写入，**必须 100% 采用 YBTY 原始名称**；
   - 让你在面板和出票时直接对应 YBTY 投注页面，一眼识别，零认知转换出票；
   - **❌ 绝对不参与任何量化预测与算法计算**。
2. **YBTY 盘口数据 `[量化计算]` `[UI展示/出票]`**：
   - 让球/大小球/独赢/主副盘精确盘口线与赔率，用于 Layer 03 剥水公允概率、+EV 计算与盘口深度比对。
3. **雷速全量基本面数据 `[量化计算]` `[AI提炼]`**：
   - 攻防统计、动量波形、阵型名单、交锋战绩、积分榜与进球分布，为 Layer 03 确定性量化推演与 Layer 04 AI 战术研判的核心数据输入源。

---

## 4. 标准时点与生命周期状态 (`timing`)

```json
{
  "timing": {
    "stage": "LIVE",
    "beijing_start_time": "2026-08-21 03:00:00",
    "start_time_source": "LEISU_SUPPLEMENTED",
    "minute": 62,
    "is_half_time": false,
    "is_extra_time": false,
    "is_overtime_or_penalty": false,
    "ybty_display_clock": "62:25"
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 数据源头 (`Data Source`) | 数据用途与流向 (`Usage`) | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `stage` | `MatchStage` | `"LIVE"` | **双源综合判定** | `[风控门禁]` `[量化计算]` | **比赛生命周期阶段**：`PREMATCH` (赛前) / `LIVE` (滚球进行中) / `FINISHED` (已完场)，决定量化拓扑分支。 |
| `beijing_start_time` | `string` | `"2026-08-21 03:00:00"`| **YBTY为主 / 雷速补充** | `[UI展示/出票]` `[推荐台账]` | **标准北京开赛时间 (UTC+8)**。格式为 `YYYY-MM-DD HH:mm:ss`，全系统统一时间基准。 |
| `start_time_source` | `string` | `"LEISU_SUPPLEMENTED"` | **系统判定** | `[UI展示/出票]` `[推荐台账]` | **开赛时间来源标识**：`YBTY_EXACT` / `YBTY_ESTIMATED` / `LEISU_SUPPLEMENTED`（需在出票中明确标注）。 |
| `minute` | `number \| null` | `62` | **YBTY 即时时钟解析** | `[量化计算]` `[AI提炼]` | **比赛进行分钟数**（纯数字）。<br>【**数据权威来源与物理铁律**】：**严禁将雷速 `text_live` 文字直播时间当做比赛当前进行的时间标签**（文字直播仅为离散事件发生时刻，无事件时停滞）；雷速端时间轴印证只能使用动量走势点阵长度 (`attack_momentum` 点阵长度)。滚球进行中 `minute` 严格由交易盘口发生地 YBTY 的即时时钟 `ybty_display_clock` 解析得到（如 `"62:25"` $\rightarrow$ `62`）；中场休息锁定为 `45`；赛前固定为 `null`。若 YBTY 滚球时钟缺失则置为 `null` 并触发 `MISSING_LIVE_MINUTE` 缺口，一票否决滚球推荐！ |
| `is_half_time` | `boolean` | `false` | **YBTY / 雷速状态** | `[量化计算]` `[风控门禁]` | **是否正处于中场休息**（触发半场即时重估与盘口休整策略）。 |
| `is_extra_time` | `boolean` | `false` | **YBTY / 雷速状态** | `[量化计算]` `[风控门禁]` | **是否处于加时赛**（触发加时赛独立盘口计算分流）。 |
| `is_overtime_or_penalty`| `boolean` | `false` | **YBTY / 雷速状态** | `[量化计算]` `[风控门禁]` | **是否处于加时赛或点球大战**。 |
| `ybty_display_clock` | `string \| null` | `"62:25"` | **YBTY (原生抓取)** | `[UI展示/出票]` | **YBTY 原生即时时钟显示**（如 `"62:25"`, `"45'"`, `"HT"`, `"即将开赛"`），用于前端界面直观出票核对，单一字段彻底杜绝冗余。 |

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

| 字段名称 (`Key`) | 类型 | 示例值 | 数据源头 (`Data Source`) | 数据用途与流向 (`Usage`) | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `home_score` | `number` | `0` | **雷速核验 / YBTY比对** | `[量化计算]` `[推荐台账]` | **当前主队总进球数**。滚球 0:0 重置净胜结算基准。 |
| `away_score` | `number` | `1` | **雷速核验 / YBTY比对** | `[量化计算]` `[推荐台账]` | **当前客队总进球数**。滚球 0:0 重置净胜结算基准。 |
| `home_half_score` | `number \| null` | `0` | **雷速核验 / YBTY比对** | `[量化计算]` | **半场主队进球数**（未达半场时为 `null`）。半场盘口核销基准。 |
| `away_half_score` | `number \| null` | `0` | **雷速核验 / YBTY比对** | `[量化计算]` | **半场客队进球数**（未达半场时为 `null`）。半场盘口核销基准。 |
| `score_verified` | `boolean` | `true` | **系统交叉比对** | `[风控门禁]` | **比分是否经高可靠校验**。必须通过雷速画布/可靠接口验证且无冲突。**未校验比分严禁给出 A 级推荐**。 |
| `score_source` | `string` | `"LEISU_INTERFACE"` | **系统判定** | `[UI展示/出票]` `[推荐台账]` | **比分提取来源**：`LEISU_CANVAS` / `LEISU_INTERFACE` / `YBTY_DIRECT` / `UNVERIFIED`。 |
| `is_mismatch_detected` | `boolean` | `false` | **系统双源检测** | `[风控门禁]` | **⚠️ 双源比分冲突严重警告**（当 YBTY 与雷速即时比分不一致时置为 `true`）。 |
| `mismatch_details` | `string \| null` | `null` | **系统双源检测** | `[风控门禁]` `[系统审计]` | **冲突明细文字说明**，**一票触发熔断降级为 `TIER_INVALID`**。 |

---

## 6. 法定交易盘口组 (`markets`) - 100% 取自 YBTY 原始盘口

> ⚠️ **交易与盘口权威源绝对定义**：  
> `markets` 下所有的全场让球、全场大小球、欧赔独赢、半场让球、半场大小球以及副盘等，**100% 全部取自 YBTY 原始盘口数据**，绝无任何假借或伪造！  
> 雷速仅作为基本面数据和参考赔率 (`reference.odds_matrix`)，**绝不能作为正式推荐出票的交易盘口**！
>
> ⚠️ **盘口结构与 YBTY 真实字段对应**：
> - **让球盘口 (`CleanSpreadMarket`)**：保留 `line_index`（0为主盘，1/2为副盘）、`home_selection`（如 `"-0/0.5"`）、`home_odds`（如 `2.20`）、`away_selection`（如 `"+0/0.5"`）、`away_odds`（如 `1.71`）；
> - **大小球盘口 (`CleanTotalMarket`)**：保留 `line_index`、`line`（如 `"2"`）、`over_odds`（如 `1.91`）、`under_odds`（如 `1.95`）；
> - **独赢盘口 (`CleanH2HMarket`)**：保留 `home_odds`、`draw_odds`、`away_odds`。

```json
{
  "markets": {
    "full_h2h": {
      "home_odds": 8.7,
      "draw_odds": 3.75,
      "away_odds": 1.43
    },
    "full_spread_main": {
      "line_index": 0,
      "home_selection": "-0/0.5",
      "home_odds": 2.2,
      "away_selection": "+0/0.5",
      "away_odds": 1.71
    },
    "full_spread_subs": [
      {
        "line_index": 1,
        "home_selection": "0",
        "home_odds": 1.6,
        "away_selection": "0",
        "away_odds": 2.38
      },
      {
        "line_index": 2,
        "home_selection": "-0.5",
        "home_odds": 2.69,
        "away_selection": "+0.5",
        "away_odds": 1.47
      }
    ],
    "full_total_main": {
      "line_index": 0,
      "line": "2",
      "over_odds": 1.91,
      "under_odds": 1.95
    },
    "full_total_subs": [
      {
        "line_index": 1,
        "line": "2/2.5",
        "over_odds": 2.4,
        "under_odds": 1.57
      },
      {
        "line_index": 2,
        "line": "1.5/2",
        "over_odds": 1.56,
        "under_odds": 2.42
      }
    ],
    "half_spread_main": null,
    "half_total_main": null,
    "half_h2h": null
  }
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 数据源头 (`Data Source`) | 数据用途与流向 (`Usage`) | 中文含义与权威业务说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `full_spread_main` | `CleanSpreadMarket \| null` | `{"line_index": 0, "home_selection": "-0/0.5", "home_odds": 2.2, "away_selection": "+0/0.5", "away_odds": 1.71}` | **YBTY (唯一交易源)** | `[量化计算]` `[UI展示/出票]` | **全场让球主盘**。用于 Layer 03 去抽水公允概率、+EV 与出票。 |
| `full_spread_subs` | `CleanSpreadMarket[]` | `[...]` | **YBTY (唯一交易源)** | `[量化计算]` `[UI展示/出票]` | **全场让球副盘列表**。包含深盘、浅盘等附加线，用于盘口深度与溢价推演。 |
| `full_total_main` | `CleanTotalMarket \| null` | `{"line_index": 0, "line": "2", "over_odds": 1.91, "under_odds": 1.95}` | **YBTY (唯一交易源)** | `[量化计算]` `[UI展示/出票]` | **全场大小球主盘**。用于泊松总进球公允期望计算、+EV 与出票。 |
| `full_total_subs` | `CleanTotalMarket[]` | `[...]` | **YBTY (唯一交易源)** | `[量化计算]` `[UI展示/出票]` | **全场大小球副盘列表**。附加大小球盘口线与流动性深度。 |
| `full_h2h` | `CleanH2HMarket \| null` | `{"home_odds": 8.70, "draw_odds": 3.75, "away_odds": 1.43}` | **YBTY (唯一交易源)** | `[量化计算]` `[UI展示/出票]` | **全场欧洲独赢 (1X2)**。主胜、平局、客胜返还率与无抽水胜率基准。 |
| `half_spread_main` | `CleanSpreadMarket \| null` | `null` | **YBTY (唯一交易源)** | `[量化计算]` `[UI展示/出票]` | **半场让球主盘**。上半场或半场阶段让球盘口与赔率。 |
| `half_total_main` | `CleanTotalMarket \| null` | `null` | **YBTY (唯一交易源)** | `[量化计算]` `[UI展示/出票]` | **半场大小球主盘**。上半场或半场阶段大小球盘口与赔率。 |
| `half_h2h` | `CleanH2HMarket \| null` | `null` | **YBTY (唯一交易源)** | `[量化计算]` `[UI展示/出票]` | **半场独赢 (Half 1X2)**。 |

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

| 子字段名称 (`Key`) | 对应数据类型 | 数据源头 (`Data Source`) | 数据用途与流向 (`Usage`) | 包含核心内容与业务职责 |
| :--- | :--- | :--- | :--- | :--- |
| `leisu_match_id` | `string` | **雷速 (Leisu)** | `[全局主键]` | 雷速比赛唯一全局物理 ID (`canonical_id` 根基)。 |
| `leisu_home_name` | `string` | **雷速 (Leisu)** | `[UI展示/出票]` (对照) | 雷速标准主队名（用于交叉核对与雷速页面对照，**❌不作为出票名称**）。 |
| `leisu_away_name` | `string` | **雷速 (Leisu)** | `[UI展示/出票]` (对照) | 雷速标准客队名（用于交叉核对与雷速页面对照，**❌不作为出票名称**）。 |
| `leisu_league_name` | `string` | **雷速 (Leisu)** | `[UI展示/出票]` (对照) | 雷速标准联赛名（用于交叉核对与雷速页面对照）。 |
| `stats` | `ParsedLeisuStats \| null` | **雷速 (Leisu)** | `[量化计算]` `[AI提炼]` | **8 大核心攻防技术统计**：射门、射正、危险进攻、控球率等，用于 Layer 03 压迫指数推导与 Layer 04 战术评估。 |
| `attack_momentum` | `ParsedLeisuMomentum \| null` | **雷速 (Leisu)** | `[量化计算]` `[AI提炼]` | **分钟级压迫动量波形**：1~90 分钟主客压迫时序数组，推演近 5/15 分钟攻势斜率。 |
| `timeline_events` | `ParsedLeisuTimelineEvent[]` | **雷速 (Leisu)** | `[量化计算]` `[UI展示/出票]` | **正向时序事件流**：红黄牌、换人、射正事件，驱动红牌减员衰减模型。 |
| `lineups` | `ParsedLeisuLineup \| null` | **雷速 (Leisu)** | `[量化计算]` `[AI提炼]` | **首发阵容与战术阵型**：阵型体系 (`4-3-3` 等)、首发/替补名单、球员身价与阵容完整度。 |
| `tactical_context` | `ParsedLeisuTacticalContext \| null` | **雷速 (Leisu)** | `[AI提炼]` `[UI展示/出票]` | **战术背景与交锋战绩**：近 10 场交锋 (`h2h_raw`)、主客近 20 场战绩，供 AI 评估心理克制与战意。 |
| `odds_matrix` | `ParsedLeisuOddsMatrix \| null` | **雷速 (Leisu)** | `[量化计算]` `[UI展示/出票]` | **三合一赔率矩阵**：欧独赢、亚让球、大小球初盘与即时盘走势参考。 |
| `league_standings` | `ParsedLeagueStandings \| null` | **雷速 (Leisu)** | `[AI提炼]` `[UI展示/出票]` | **联赛积分与主客场排名**：主客队赛季排名、主客场战绩与积分，供 AI 评估保级/争冠战意。 |
| `goal_distribution` | `ParsedGoalDistribution \| null` | **雷速 (Leisu)** | `[量化计算]` `[AI提炼]` | **时段进球偏好分布**：六大 15 分钟时段进球偏好，用于泊松时段进球权重校准。 |

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
  "match_id": "4562395",
  "match_slug": "英格兰甲级联赛_谢周三_vs_布拉德福德城",
  "league": "英格兰甲级联赛",
  "kickoff_time": "2026-08-21 03:00:00",
  "status_summary": "LIVE 62' (0-1)",
  "teams": {
    "home": "谢周三",
    "away": "布拉德福德城"
  },
  "score_verification": {
    "is_verified": true,
    "current_score": "0 - 1"
  },
  "core_markets": {
    "ah_main": { "handicap": "-0/0.5", "home_odds": 2.2, "away_odds": 1.71 },
    "ou_main": { "handicap": "2", "over_odds": 1.91, "under_odds": 1.95 },
    "euro_1x2": { "home_win": 8.7, "draw": 3.75, "away_win": 1.43 },
    "ah_half": null,
    "ou_half": null
  },
  "condensed_features": {
    "possession": { "home": 60, "away": 40 },
    "shots_on_target": { "home": 3, "away": 3 },
    "dangerous_attacks": { "home": 38, "away": 30 },
    "corners": { "home": 6, "away": 7 },
    "recent_momentum_5min": { "home": 32, "away": 20 },
    "recent_momentum_15min": { "home": 24, "away": 25 },
    "formations": { "home": "4-2-3-1", "away": "3-4-2-1" },
    "h2h_summary": "共6场历史交锋记录",
    "league_rank": { "home": 6, "away": 3 }
  },
  "data_deficits": []
}
```

| 字段名称 (`Key`) | 类型 | 示例值 | 数据用途与流向 (`Usage`) | 中文含义与 AI 评估指引 |
| :--- | :--- | :--- | :--- | :--- |
| `match_id` | `string` | `"4562395"` | `[全局主键]` `[AI提炼]` | **全局唯一物理标识 (雷速赛事 ID)**。供 AI 生成推荐时绑定唯一比赛主键。 |
| `match_slug` | `string` | `"英格兰甲级联赛_谢周三_vs_布拉德福德城"` | `[UI展示/出票]` `[AI提炼]` | **业务对阵标识**。供 AI 输出报告标题。 |
| `league` | `string` | `"英格兰甲级联赛"` | `[UI展示/出票]` `[AI提炼]` | **法定联赛名称**。供 AI 研判联赛风格与性质（杯赛/联赛）。 |
| `kickoff_time` | `string` | `"2026-08-21 03:00:00"` | `[UI展示/出票]` `[AI提炼]` | **标准北京开赛时间**。供 AI 判定距离开赛时间。 |
| `status_summary` | `string` | `"LIVE 62' (0-1)"` | `[UI展示/出票]` `[AI提炼]` | **比赛即时概况摘要**（包含阶段、分钟、比分与红牌数）。 |
| `teams` | `object` | `{"home": "谢周三", "away": "布拉德福德城"}` | `[UI展示/出票]` `[AI提炼]` | **YBTY 法定执行队名**。AI 正式推荐文案**必须 100% 使用此名称**。 |
| `score_verification` | `object` | `{"is_verified": true, "current_score": "0 - 1"}` | `[风控门禁]` `[AI提炼]` | **比分校验标记与比分串**（未核验时严禁下发 A 级推荐）。 |
| `core_markets` | `object` | `{...}` | `[AI提炼]` `[量化计算]` | **核心精简交易盘口**（全场让球主盘、大小球主盘、独赢与半场主盘）。 |
| `condensed_features` | `object` | `{...}` | `[AI提炼]` `[量化计算]` | **高价值精炼特征集**：控球率、射正、危攻、角球、近 5/15 分钟动量斜率、阵型对位、往绩交锋与联赛排名。 |
| `data_deficits` | `string[]` | `[]` | `[风控门禁]` `[AI提炼]` | **明确数据缺口清单**。当存在严重缺口时，AI 须主动执行不稳定性降级或熔断。 |

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

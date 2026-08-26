# Layer 02: 标准赛事模型与双源实体对齐说明文档

> **模块路径**：`refactor/02_canonical_model/`  
> **数据契约等级**：系统单一事实来源 (Single Source of Truth, SSOT)  
> **生成样本文件**：`refactor/samples/02_canonical_model/canonical_match_sample.json`

---

## 1. 核心架构红线与设计思想

1. **执行源与参考源严格隔离**：
   - **YBTY（法定执行源）**：提供推荐与投注的唯一法定队名、联赛名与真实交易盘口（CleanMarketsGroup）。任何雷速赔率严禁覆盖或篡改 YBTY 盘口。
   - **雷速（基本面与时序增强源）**：提供 `commence_time` 换算开赛时间、`minute` 实时进行时间、比分画布校验状态（`score_verified`）、攻防技术统计、动量时序、首发阵型、联赛积分与时段进球分布。
2. **纯原文字符顺序匹配（零杂质剔除）**：
   - 保留全部 `U19`、`U21`、`B队`、`青年队`、`女足` 等后缀，使用最长公共子序列 (LCS) 严格按原文字符顺序比对相似度，严防一队与梯队错配。
   - 优先命中单队原子别名库 `team_aliases.json`。
3. **显式数据缺口与不造假默认值**：
   - 缺失阵型或时序时显式赋为 `null`，并在 `missing_reasons` 中记录枚举原因，绝不填塞虚假默认值。
4. **极简 AI 提炼包 (`AiEvaluationBrief`)**：
   - 提纯为低 Token 占用（约 200~400 tokens/场）、高信息密度的专用结构，消除爬虫与 DOM 噪音。

---

## 2. 字段契约全景速查

### 2.1 `CanonicalMatch` 统一标准实体

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `canonical_id` | `string` | 唯一业务主键，格式为 `联赛_主队_vs_客队` |
| `completeness_tier` | `DataCompletenessTier` | 完整度等级：`TIER_1_FULL` / `TIER_2_BASIC` / `TIER_3_SPARSE` / `TIER_INVALID` |
| `missing_reasons` | `MissingDataReason[]` | 明确的数据缺口枚举清单（如缺少阵型、时序或比分冲突） |
| `alignment` | `MatchAlignmentDecision` | 双源对齐决策：状态（别名精准/自动高置信/人工待选/未匹配）、综合置信分与理由 |
| `league_name` | `string` | **YBTY 原始法定联赛名** |
| `home_team_name` | `string` | **YBTY 原始法定主队名** |
| `away_team_name` | `string` | **YBTY 原始法定客队名** |
| `timing` | `CanonicalTimingState` | 标准时点：北京开赛时间、时间来源、滚球进行分钟 `minute`、中场状态 |
| `score` | `CanonicalScoreState` | 实时比分：主客得分、半场得分、比分校验状态 `score_verified`、冲突标记 |
| `markets` | `CleanMarketsGroup` | **YBTY 真实盘口组**（全场让球、全场大小球、独赢、半场盘口等） |
| `reference` | `CanonicalLeisuReference \| null` | 雷速增强包：统计、动量、事件、阵容、积分榜、进球分布（无则 null） |

---

### 2.2 `AiEvaluationBrief` 极简提炼包

| 字段 | 说明 |
| :--- | :--- |
| `match_id` | 唯一赛事标识 |
| `status_summary` | 如 `"LIVE 68' (1-0)"` 或 `"PREMATCH"` |
| `score_verification` | 包含 `is_verified: boolean` 与比分文本 |
| `core_markets` | 仅保留主盘让球、大小球和独赢三项核心赔率 |
| `condensed_features` | 控球率、射正、危攻、角球、阵型对位、积分排名与交锋简述 |
| `data_deficits` | 明确标注当前赛事缺失的核心字段，供 AI 评估时作不稳定性熔断 |

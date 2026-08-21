# 02. 执行排查与缺陷深度审计报告 (Data Usage Anomalies & Legacy Audit)

## 一、 审计背景与核心问题综述

系统在经历历史版本迭代后，底层数据源已经从旧版的“DOM 页面抓取 / SofaScore 外部抓取”全面升级为：
1. **YBTY 体育平台**：以 DOM 结构规范导出滚球 (`live`) 与赛前 (`prematch`) 盘口及赛事快照；
2. **雷速体育平台**：统一通过 **“滚球接口获取导出”** 流程，直接解码 Protobuf (`/api/v3/f/d`, `/f/vd`, `/f/s`)、解密 `match_analysis` 与 `match_lineup`，并解密 `#weatherArea[src]` 内嵌业务载荷，输出完整的 `results[].formal` 标准化结构。

然而，中间层 Python 脚本与前端 TypeScript 组件中，仍遗留了大量旧数据结构的硬编码键名、多余的数据转换桥接层、字段名冲突以及未读取新数据结构的断层问题。

本文档对全系统中所有“数据使用错误、使用旧字段未成功迭代、新数据未正常读取数值”的缺陷进行逐文件、逐代码块的深度排查与定性归因。

---

## 二、 核心缺陷分类与排查清单

### 缺陷分类汇总表

| 缺陷编号 | 影响模块 | 缺陷类型 | 严重等级 | 核心现象与影响 |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | `scripts/python/football_live.py` | 遗留旧协议与字段名断层 | **Critical** | 使用了旧 SofaScore 键名 (`homeScore.current`, `_statistics`)，导致雷速新接口比分与统计读取回退或失败 |
| **DEF-02** | `scripts/python/football_live.py` | 接口数据归一化加载缺陷 | **High** | `load_leisu_file` 对新版 `results[].formal` 结构的解包不彻底，未提取完整 `head_to_head` 与 `standings` |
| **DEF-03** | `scripts/python/interface_features.py` | 嵌套层级假设不一致 | **Medium** | 特征计算假设数据在 `recent_trends.historical_analysis`，而实际路径可能在 `candidate.historical_analysis` |
| **DEF-04** | `scripts/python/recommend_live.py` | 盘口与比分验证逻辑断裂 | **High** | 依赖未校验的 `market_source.home_score`，导致滚球剩余进球结算时未能准确锚定推荐时基准比分 |
| **DEF-05** | `src/types.ts` | 接口类型定义冗余与歧义 | **High** | 存在多个互斥且重叠的赛事类型 (`LiveMatch`, `MatchCandidate`, `StandardMatchData`)，字段命名混乱 |
| **DEF-06** | `src/components/LiveMatchesView.tsx` | 前端渲染字段回退错误 | **Medium** | 组件在读取 `score`, `statistics`, `markets` 时存在多处属性未定义 (`undefined`) 或 `NaN` 风险 |
| **DEF-07** | `src/components/AttackMomentumTimelineWidget.tsx` | 动量波形数据结构适配断层 | **Medium** | 波形图组件对 `attack_momentum_timeline.data` 的二维数组缺少分段长度校验与平滑处理 |
| **DEF-08** | `src/components/FormationClashModal.tsx` | 阵容对象结构不一致 | **Medium** | 组件期望 `lineup.home.starters` 为字符串数组，而新接口为结构化球员对象数组 (`Player[]`) |
| **DEF-09** | `src/lib/extendedRecommendation.ts` & UI | 盘口类型语义与嵌套赔率数组断层 | **Critical** | `verifiedMarket` 硬编码 `market_type === 'total'`，无法识别 `full_total`/`全场大小球`，且仅读取平铺属性未读取 `options` 数组，导致全场大小球/让球/独赢全部显示“暂无真实盘口/无真实赔率” |
| **DEF-10** | `snapshotDeltaEngine.ts` (前端与服务端) | 即盘（Live Market）穿透提取链路缺失 | **High** | 即盘提取过度依赖 YBTY 实时导出的单腿盘口，在 YBTY 临时封盘/下架时直接返回 `null`，导致“赛前初盘 vs 滚球即盘对照”无故渲染为 `现: -` 破折号空值，未穿透使用雷速即盘参考 |

---

## 三、 逐模块深度排查与代码级根因分析

### 1. Python 管道层：`scripts/python/football_live.py`

#### 缺陷 1.1：比分提取仍然依赖旧键名 `homeScore.current`
* **问题位置**：`football_live.py` 第 415-418 行、第 486-487 行、第 1054-1055 行。
* **错误代码表现**：
  ```python
  provider_score = {
      "home": score_value(event.get("homeScore", {}).get("current")),
      "away": score_value(event.get("awayScore", {}).get("current")),
  }
  ```
* **根因分析**：
  - 雷速新接口导出格式为 `results[].formal.live_match.home_scores`，其内部字段为 `{ "score": 0, "halfScore": 0, "redCard": 0, ... }`。
  - 旧代码尝试从 `event.get("homeScore", {}).get("current")` 取值，导致取到的永远是 `None`，迫使比分回退或者丢失。
* **修复与迭代方案**：
  - 统一重构 `normalize_leisu_event()` 函数，直接将 `formal.live_match.home_scores.score` 提取并标准化为 `event["score"] = { "home": int, "away": int }`。

#### 缺陷 1.2：技术统计读取未对齐 8 大标准字段
* **问题位置**：`football_live.py` 第 731-750 行、第 1057 行。
* **错误代码表现**：
  - 存在大量为 SofaScore 设计的 `flatten_statistics()` 代码（如寻找 `Total shots`, `Ball possession`）。
  - 对雷速新接口 `formal.live_match.confirmed_statistics`（已包含 `corners`, `yellow_cards`, `red_cards`, `attacks`, `dangerous_attacks`, `possession`, `shots_on_target`, `shots_off_target`）未做直接承接，而是试图从 `_statistics` 间接查找。
* **修复与迭代方案**：
  - 废弃针对 SofaScore 的解析胶水代码，直接将雷速 `confirmed_statistics` 无损映射为 `live_statistics`，确保数据纯净且无类型转换损失。

#### 缺陷 1.3：赛事匹配开赛时间未优先使用 Unix 时间戳
* **问题位置**：`football_live.py` 第 511-521 行、第 1076-1079 行。
* **错误代码表现**：
  - 代码在比对开赛时间时，尝试通过正则从字符串中解析 `time_of_day`，易受时区（UTC vs 北京时间 UTC+8）与日期跨日影响。
* **根因分析**：
  - 雷速新接口已提供绝对精确的 Unix 秒级时间戳 `formal.static_match.matchTime`。
* **修复与迭代方案**：
  - 统一转换 `formal.static_match.matchTime` 为标准 ISO 8601 UTC 字符串及北京时间显示字符串，时间差比对直接基于秒级数字差值计算。

---

### 2. 特征工程层：`scripts/python/interface_features.py`

#### 缺陷 2.1：历史交锋与近期战绩字段路径层级深浅不一
* **问题位置**：`interface_features.py` 第 63-72 行。
* **错误代码表现**：
  ```python
  trends = _dict(candidate.get("recent_trends"))
  history = _dict(trends.get("historical_analysis"))
  recent = _dict(history.get("recent_matches"))
  ```
* **根因分析**：
  - 在 `football_live.py` 构建 candidate 时，历史分析数据可能直接挂在 `candidate["recent_trends"]`，也可能由 `recommend_live.py` 补充到根节点。
  - 由于层级嵌套假设不稳定，导致 `extract_interface_features` 读取到的 `recent` 或 `h2h` 为空字典，进而使“历史大球率”、“交锋平均进球”等特征退化为 None。
* **修复与迭代方案**：
  - 统一规范标准 Candidate 的 JSON 拓扑，固定将历史分析数据置于 `candidate["historical_analysis"]` 或在 `interface_features.py` 中增加双路径防御性回退。

#### 缺陷 2.2：射门总数计算未与 `shots_off_target` 协同
* **问题位置**：`interface_features.py` 第 23-33 行。
* **根因分析**：
  - 雷速接口的 `confirmed_statistics` 提供的是 `shots_on_target`（射正）与 `shots_off_target`（射偏）。
  - 部分逻辑仍尝试获取 `shots`（总射门），若 `shots` 缺失则计算为 0，导致射正率计算异常。
* **修复与迭代方案**：
  - 标准化公式：`shots = shots_on_target + shots_off_target`，当 `shots` 字段不存在时自动求和派生，保证统计的一致性。

---

### 3. 推荐与决策层：`scripts/python/recommend_live.py` & `recommend_prematch.py`

#### 缺陷 3.1：比分未经校验时未能实施严格降级
* **问题位置**：`recommend_live.py` 评级计算分支。
* **根因分析**：
  - 按照系统风控硬性要求：比分未经可靠验证（`score_verified == False`）时，**严禁给出 A 级推荐**，且不得结算“剩余进球”盘口。
  - 当前部分分支仅在原因列表中添加了警告文字，但在分数打满时仍可能输出 A 级评级。
* **修复与迭代方案**：
  - 增加硬性拦截前置门禁：若 `score_verified is not True`，评级最高强制封顶为 `B-` 或 `RESEARCH`，并标记 `risk_tags = ["UNVERIFIED_SCORE_RISK"]`。

#### 缺陷 3.2：四分之一盘口（0.25 / 0.75 盘）赢半输半结算未在决策中体现
* **问题位置**：`recommend_live.py` 及台账核销模块。
* **根因分析**：
  - 盘口解析若直接使用浮点数，在处理 `2/2.5`、`2.5/3`、`-0.5/-1` 时，若未标注拆分盘口特征，前端展示易显示为单盘。
* **修复与迭代方案**：
  - 在决策输出中同时提供 `display_line`（如 `"2/2.5"`）、`numeric_line`（如 `2.25`）以及明确的拆分判定规则说明。

---

### 4. 前端类型与组件层：`src/types.ts` & `src/components/`

#### 缺陷 4.1：`src/types.ts` 中存在类型定义碎片化与重复
* **问题位置**：`src/types.ts` 全文。
* **根因分析**：
  - 同时存在 `LiveMatch`（旧版）、`MatchCandidate`（中间版）、`StandardMatchData`（新版规范）。
  - 部分组件引用 `LiveMatch`，部分组件引用 `MatchCandidate`，导致字段重命名时出现多处编译类型不兼容或必须使用 `any` 绕过类型检查。
* **修复与迭代方案**：
  - 在文档 03 中确立唯一的 `StandardMatchData` 权威类型契约，全面废弃旧的不兼容接口定义。

#### 缺陷 4.2：动量图表组件（`AttackMomentumTimelineWidget.tsx`）数据解析容错不足
* **问题位置**：`src/components/AttackMomentumTimelineWidget.tsx`。
* **根因分析**：
  - 雷速新接口返回的动量数据 `data` 为二维数组（如 `[[-12, 32, ...], [-18, 72, ...]]`，分别对应上半场与下半场）。
  - 若比赛仅进行到上半场，`data[1]` 为空或未初始化；若组件直接通过索引访问 `data[1][minute]` 会抛出空指针异常，导致整个看板崩溃。
* **修复与迭代方案**：
  - 增加对分段数量、数组长度以及空数组的严格保护，并支持无数据时的骨架屏/占位提示。

#### 缺陷 4.3：首发阵容组件（`FormationClashModal.tsx`）对球员对象属性访问错误
* **问题位置**：`src/components/FormationClashModal.tsx`。
* **根因分析**：
  - 新版雷速接口中，首发球员 `home.starters` 已经结构化为包含 `{ player_id, name, shirt_number, position_name, rating, best_player, market_value }` 的对象列表。
  - 旧组件代码中存在直接把元素当作字符串渲染（如 `player` 而非 `player.name`）的情况，导致界面显示 `[object Object]`。
* **修复与迭代方案**：
  - 严格按照规范化 `Player` 接口渲染球衣号码、球员姓名、场上位置与评分徽章。

#### 缺陷 4.4：盘口解析与真实赔率提取断层 (DEF-09)
* **问题位置**：`src/lib/extendedRecommendation.ts` (verifiedMarket / realMarketRecommendation)、`src/components/BettingRecommendationsView.tsx`、`src/lib/snapshotDeltaEngine.ts`。
* **现象描述**：
  - 界面显示错误：`⚽ 全场大小球无真实赔率全场暂无真实盘口--YBTY本次导入没有可用且已核验的该市场盘口，不生成默认盘口或赔率。市场隐含概率: 0%`。
* **根因深度分析**：
  1. **市场类型键名不匹配**：`verifiedMarket` 中原先写死 `m.market_type === 'total'`，而系统导出的决策数据及标准快照中可能为 `full_total`、`total`、`全场大小球`、`over_under`、`OU` 等多种命名规范。
  2. **赔率结构未适配 `options` 数组**：YBTY 最新标准数据结构将盘口选项收敛在 `options: [{ side, line, odds, suspended }]` 数组中。`verifiedMarket` 原代码仅检测平铺属性 `home_or_over_odds` / `away_or_under_odds`，未遍历 `options` 提取对应方向（over/under/home/away/draw）的实际赔率。
  3. **数据源回退链路缺失**：当 `market_snapshots` 处于浅拷贝或待展开状态时，未按优先级连锁回退至 `verified_ybty_markets`、`ybty_raw_markets`、`raw.markets` 以及 `item.recommendation`。
* **修复与彻底根治方案**：
  - 在 `src/lib/extendedRecommendation.ts` 中实现语义化分类匹配器 `matchesMarketCategory(targetType, rawKey)` 与结构提取器 `extractOptionsFromMarket(m, targetType)`，全面支持 6 大标准盘口（`full_total`, `half_total`, `full_spread`, `half_spread`, `full_h2h`, `half_h2h`）。
  - 在 `types.ts` `toStandardMatchData` 层面做双向对齐：自动将 `options` 数组计算补充至 `home_or_over_odds` / `away_or_under_odds` / `draw_odds`，并将平铺赔率反向填充至 `options`，实现盘口数据的百分之百兼容与零漏失。
  - 在 `BettingRecommendationsView.tsx` 与 `snapshotDeltaEngine.ts` 中统一接入 `verifiedMarket` 作为权威盘口解析基准。

#### 缺陷 4.5：赛前初盘 vs 滚球即盘对照“现: -”破折号空值缺陷 (DEF-10)
* **问题位置**：`src/lib/snapshotDeltaEngine.ts`、`server/services/snapshotDeltaEngine.ts`。
* **现象描述**：
  - 在比赛分析视图的“赛前初盘 vs 滚球即盘对照”中，出现 `让球 [初: +0.25 ➔ 现: -]` 或 `大小 [初: 2.5 ➔ 现: -]`，即盘位置无故呈现破折号破损显示。
* **根因深度分析**：
  1. **双轨盘口职责认识脱节**：系统原本将即盘完全绑定在 YBTY 单一数据流上。由于 YBTY 导出的滚球盘口在进球、红牌、VAR 或半场时段经常处于封盘状态（Suspended）或短暂下架，导致提取到的即盘值为 `null`。
  2. **未明确雷速盘口辅助预测定位**：雷速的即时盘口（`instant_handicap` / `instant_total`、`current_line`、`markets.*.live`）本质上是全网机构的基准风向标，专用于提供走势预期与衰减对照；旧解析器未将雷速即盘作为即盘提取的二级穿透兜底源。
* **修复与彻底根治方案**：
  - 确立双轨原则：YBTY 盘口作为唯一真实投注盘口，雷速初盘/即盘作为辅助预测与价值锚点。
  - 在前端与服务端 `snapshotDeltaEngine.ts` 中建立多层穿透回退机制：优先 YBTY 实时让球/大小球盘口；若为空或封盘，自动向下穿透读取雷速即盘 `reference_market.instant_handicap/instant_total`、`current_line` 及 `markets.*.live`，保障对照连续且完整。

---

## 四、 历史废弃字段清理清单 (Deprecation Matrix)

为确保系统彻底迭代、不再复发老数据问题，必须在后续改造中彻底封杀以下废弃字段：

| 废弃的旧字段/旧模式 | 曾用位置 | 废弃原因 | 替代的标准新字段 |
| :--- | :--- | :--- | :--- |
| `event.homeScore.current` | `football_live.py` | SofaScore 旧格式 | `formal.live_match.home_scores.score` -> `match.score.home` |
| `event._statistics.shots` | `football_live.py` | SofaScore 旧格式 | `formal.live_match.confirmed_statistics` -> `live_statistics` |
| `sofascore_event_id` | `candidates.json` | 平台混淆 | `provider_match_id` 或 `match_id` |
| `_live_text.entries` (仅纯字符串数组) | `football_live.py` | 丢失类型与时间戳 | `formal.live_match.text_live` -> 结构化 `StandardTimelineEvent[]` |
| `match.home_score` (字符串类型) | 前端 `types.ts` | 易导致 `+` 拼接错误 | `match.score.home` (统一保证为 `number` 类型) |
| `lineup.home.starters` (纯字符串数组) | 前端 `types.ts` | 丢失号码位置评分 | `LineupData.home.starters` -> `Player[]` 结构化对象数组 |
| `reference_odds.current_line` (未结构化字符串) | 前端 `types.ts` | 无法进行水位数学计算 | `formal.odds` -> 结构化 `{ home, line, away }` 数值对象 |

---

## 五、 排查结论与迭代要求

1. **统一数据源入口**：明确雷速数据（无论滚球还是赛前）一律通过“滚球接口获取导出”生成的 `leisu_interface_data`（含 `results[].formal`）作为唯一真理源。
2. **彻底切除胶水层**：中间层 Python 脚本不得再保留 SofaScore 或旧版 DOM 文本解析逻辑，全面切换至新标准协议字段提取。
3. **前端单一契约**：前端组件全部依托 `StandardMatchData` 进行类型推导与界面渲染，消灭所有 `any` 断言与废弃属性访问。

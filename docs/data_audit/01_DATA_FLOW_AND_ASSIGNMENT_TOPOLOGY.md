# 01. 数据流与赋值拓扑全景审计规范 (Data Flow & Assignment Topology)

## 一、 系统全链路架构与数据流向总览

本项目是一个高精度、严风控的足球赛事数据分析与实时推荐系统。整个系统由三层核心架构组成：
1. **第一层：数据采集与导出层（Chrome 浏览器扩展 `ybty_export_extension`）**
2. **第二层：数据匹配、特征计算与推荐决策层（Python 核心算法与管道）**
3. **第三层：用户交互、数据看板与复盘台账层（React 18 + TypeScript + Vite 前端）**

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              第一层：数据采集与导出层 (Extension)                          │
├────────────────────────────────────────┬───────────────────────────────────────────────┤
│        YBTY 体育平台 (DOM 解析导出)     │            雷速体育平台 (接口+内嵌载荷导出)      │
│  - 模式一：导出滚球分析数据 (Live)      │  - 统一入口：“滚球接口获取导出”                 │
│  - 模式二：导出赛前分析数据 (Prematch)  │  - 包含比赛：列表页可见的滚球与赛前所有比赛       │
│                                        │  - 抓取链路：                                  │
│  输出：                                │    1. Protobuf: /api/v3/f/d, /f/vd, /f/s      │
│  - ybty_latest.json / ybty_v2.8.0_*.json│    2. 解密接口: match_analysis, match_lineup  │
│                                        │    3. 内嵌载荷: #weatherArea[src] (赔率+文字直播)│
│                                        │  输出：                                        │
│                                        │  - leisu_latest.json / leisu_v2.8.0_*.json    │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                             第二层：Python 匹配与推荐决策层 (Pipeline)                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  1. 赛事匹配与初筛 (football_live.py)                                                  │
│     - 输入：YBTY 导出数据 + 雷速导出数据 + 别名库 (team_aliases.json)                   │
│     - 核心算法：队名相似度 + 开赛时间差 + 比分校验 + 动态学习别名                        │
│     - 输出：ybty_leisu_candidates.json / ybty_leisu_prematch_candidates.json           │
│                                                                                        │
│  2. 特征工程与技术统计 (interface_features.py)                                          │
│     - 射门转化率、门将扑救率、历史交锋得失球、大球率、时段进球分布提取                   │
│                                                                                        │
│  3. 推荐与风控决策引擎 (recommend_live.py / recommend_prematch.py)                      │
│     - 评估维度：战意、攻防效率、动量趋势、深浅盘价值、伤停阵容                           │
│     - 输出：ybty_leisu_decisions.json (WATCH / PASS / RESEARCH)                        │
│                                                                                        │
│  4. 台账与复盘记录 (record_formal_recommendation.py / review_formal_recommendations.py)│
│     - 记录写入 recommendation_ledger.json 并进行赛后结算核销                            │
│                                                                                        │
│  5. 综合快照导出 (export_combined_data.py)                                             │
│     - 聚合当批次 YBTY、雷速原始数据及决策结果                                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                            第三层：前端看板与决策展示层 (React + TS)                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  - 统一类型定义：src/types.ts (StandardMatchData, UnifiedMatchStats, LineupData 等)     │
│  - 状态管理与数据加载：src/App.tsx                                                      │
│  - 视图模块：                                                                           │
│    * 滚球分析看板 (LiveMatchesView.tsx)                                                 │
│    * 赛前分析看板 (PrematchMatchesView.tsx)                                             │
│    * 推荐决策看板 (BettingRecommendationsView.tsx)                                      │
│    * 推荐台账与复盘 (LedgerView.tsx)                                                    │
│    * 别名管理视图 (TeamAliasesView.tsx)                                                 │
│    * 综合数据导出视图 (ExportDataView.tsx)                                               │
│    * 动量波形组件 (AttackMomentumTimelineWidget.tsx, MiniMomentumSparkline.tsx)        │
│    * 阵型克制与战术弹窗 (FormationClashModal.tsx, RecentFormModal.tsx)                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、 详细拓扑追踪：数据产生、赋值与流转全链路

### 1. 第一层：数据采集与导出层（`ybty_export_extension`）

#### 1.1 YBTY 导出拓扑（`content.js`）
* **采集机制**：DOM 树滚动扫描与解析（支持滚球 `live` 与赛前 `prematch` 两种模式）。
* **触发入口**：
  - 按钮 `#codex-ybty-live-export-button` -> 调用 `scanAll("live")`
  - 按钮 `#codex-ybty-prematch-export-button` -> 调用 `scanAll("prematch")`
* **字段赋值与拓扑关系**：

| 原始 DOM / 计算来源 | 导出的 JSON 字段路径 | 数据类型 | 字段含义与业务约束 |
| :--- | :--- | :--- | :--- |
| `document.title`, `.page-title` | `page_context.page_title` | `string` | 页面标题，用于校验导出模式 |
| `pageContext()` 判定 | `page_context.requested_mode` | `string` | 请求导出的模式 (`live`/`prematch`) |
| `pageContext()` 判定 | `page_context.detected_mode` | `string` | 页面实际检测出的模式 |
| `new Date().toISOString()` | `captured_at` | `string(ISO)` | 导出快照时间戳 |
| `.c-match-item` 遍历计数 | `count`, `summary.exported_count` | `number` | 导出的比赛总场数 |
| 属性/序号 | `matches[].source_match_id` | `string\|null` | YBTY 原始赛事 ID |
| `.play-match-league` | `matches[].league` | `string` | 联赛中文名称（如“英格兰甲级联赛”） |
| 队伍文本选择器 | `matches[].home` | `string` | YBTY 主队原始名称（**全系统基准队名**） |
| 队伍文本选择器 | `matches[].away` | `string` | YBTY 客队原始名称（**全系统基准队名**） |
| 比分文本选择器 | `matches[].home_score` | `string\|null` | 主队当前比分（滚球有效，赛前为 null） |
| 比分文本选择器 | `matches[].away_score` | `string\|null` | 客队当前比分（滚球有效，赛前为 null） |
| 时钟/倒计时文本 | `matches[].clock` | `string` | 比赛进行时间（如 `62:25`）或开赛提示（如 `10分钟后开赛`） |
| 开赛时间解析 | `matches[].commence_time` | `string\|null` | 绝对开赛时间（若有） |
| `.handicap-col` 遍历 | `matches[].markets[]` | `Array<Market>`| 盘口列表（独赢、让球、大小球、角球等） |
| 盘口标题与行解析 | `markets[].market` | `string` | 盘口标识 (`full_h2h`, `full_spread`, `full_total` 等) |
| 盘口标题文本 | `markets[].market_title` | `string` | 盘口中文标题（如“全场独赢”、“全场让球”） |
| 赔率选项 `.c-bet-item` | `markets[].options[]` | `Array<Option>`| 投注选项列表 |
| 选项文本与赔率 | `options[].selection`, `options[].odds` | `string` | 选项名称（如“主”, `1.75`）与十进制欧赔 |
| 盘口方向与基准线 | `options[].side`, `options[].line` | `string\|null` | 方向 (`home`/`away`/`over`/`under`) 与盘口盘位 |

---

#### 1.2 雷速导出拓扑（`leisu_content.js` + `background.js`）
* **采集机制**：**统一通过“滚球接口获取导出”入口**，批量获取列表页所有可见比赛（包括滚球和赛前比赛）。
* **触发入口**：
  - 按钮 `#codex-leisu-script-export-button` -> 调用 `exportInterfaceData(false)`
  - 诊断按钮 `#codex-leisu-interface-diagnostic-button` -> 调用 `exportInterfaceData(true)`
* **底层数据源与解码拓扑**：
  1. **`/api/v3/f/d` (Protobuf)**: 解码为 `Detail` 结构 -> `formal.static_match`
  2. **`/api/v3/f/vd` (Protobuf)**: 解码为 `LiveData` 结构 -> `formal.live_match`
  3. **`/api/v3/f/s` (Protobuf)**: 解码为 `InGameStats` 结构
  4. **`match_analysis` (凯撒移位 + GZIP 解压缩)**: 解码为分析大对象 -> `formal.head_to_head`, `formal.recent_matches`, `formal.league_standings`, `formal.goal_distribution`, `formal.trend_summary`
  5. **`match_lineup` (JSON 解密)**: 解密为阵容大对象 -> `formal.lineup`
  6. **`#weatherArea[src]` (HTML 内嵌载荷)**: 解密提取 -> `formal.odds` (赔率矩阵) 与 `formal.live_match.text_live` (文字直播)
* **导出的 JSON 字段路径与拓扑映射**：

| 来源层级 | 导出的 JSON 字段路径 (`results[].formal`) | 数据类型 | 核心内容与字段说明 |
| :--- | :--- | :--- | :--- |
| 外层索引 | `match_id` | `string` | 雷速赛事全局唯一 ID（如 `"4562395"`） |
| 完整性检查 | `available`, `complete`, `completeness` | `boolean\|object` | 各模块数据是否完整解密导出的状态标志 |
| `/api/v3/f/d` | `formal.static_match.id` | `number` | 赛事 ID 数值 |
| `/api/v3/f/d` | `formal.static_match.matchTime` | `number` | 比赛开赛 Unix 时间戳（秒级） |
| `/api/v3/f/d` | `formal.static_match.homeTeam` | `object` | 主队信息 `{ id, name, shortName, rank }` |
| `/api/v3/f/d` | `formal.static_match.awayTeam` | `object` | 客队信息 `{ id, name, shortName, rank }` |
| `/api/v3/f/d` | `formal.static_match.competition` | `object` | 联赛信息 `{ id, name, shortName, type }` |
| `/api/v3/f/d` | `formal.static_match.environment` | `object` | 天气环境 `{ weather, temperature, humidity, wind, pressure }` |
| `/api/v3/f/vd` | `formal.live_match.status_id` | `number` | 比赛状态码（1未开赛, 2上半场, 3中场, 4下半场, 8完场） |
| `/api/v3/f/vd` | `formal.live_match.home_scores` | `object` | 主队比分与牌数 `{ score, halfScore, redCard, yellowCard, corner }` |
| `/api/v3/f/vd` | `formal.live_match.away_scores` | `object` | 客队比分与牌数 `{ score, halfScore, redCard, yellowCard, corner }` |
| `/api/v3/f/vd` | `formal.live_match.confirmed_statistics` | `object` | 8大技术统计 `{ corners, yellow_cards, red_cards, attacks, dangerous_attacks, possession, shots_on_target, shots_off_target }` |
| `#weatherArea` / Vue | `formal.live_match.attack_momentum_timeline` | `object` | 动量波形 `{ available, segment_count, nominal_segment_minutes, data: number[][] }` |
| `#weatherArea` | `formal.live_match.text_live` | `Array<object>` | 文字直播流水 `{ main, type, position, time, data }` |
| `#weatherArea` | `formal.opening_odds` | `object` | 初始初盘赔率 `{ asian_handicap, match_winner, total_goals, corners }` |
| `#weatherArea` | `formal.odds` | `object` | 完整即时与初盘赔率矩阵（包含 initial, pregame, live 三阶段） |
| `match_analysis` | `formal.head_to_head` | `Array<object>` | 历史交锋比赛记录列表 |
| `match_analysis` | `formal.recent_matches` | `object` | 近期战绩 `{ home: MatchRecord[], away: MatchRecord[] }` |
| `match_analysis` | `formal.league_standings` | `object` | 联赛积分榜 `{ home_team: { total, home, away }, away_team: ... }` |
| `match_analysis` | `formal.goal_distribution` | `object` | 进球时段分布 `{ home: { all: { scored, conceded } }, away: ... }` |
| `match_analysis` | `formal.trend_summary` | `object` | 盘路大小走势统计汇总 `{ home: { table }, away: { table } }` |
| `match_lineup` | `formal.lineup` | `object` | 阵容 `{ confirmed, venue, referee, home_formation, away_formation, home_manager, away_manager, home: Player[], away: Player[], home_injuries, away_injuries, home_market_value, away_market_value }` |

---

### 2. 第二层：Python 数据处理与推荐层（`scripts/python/`）

#### 2.1 赛事匹配拓扑（`football_live.py`）
1. **输入文件读取**：
   - YBTY 数据：通过 `extract_markets(path)` 读取 `output/ybty_latest.json` 或 `output/ybty_prematch_latest.json`。
   - 雷速数据：通过 `load_leisu_file(path)` 读取 `output/leisu_latest.json` 或 `output/leisu_prematch_latest.json`。
   - 别名数据：通过 `merge_alias_files()` 读取 `team_aliases.json` 和 `team_aliases_auto.json`。
2. **匹配打分与过滤算法**：
   - **名称匹配 (`team_score`)**：结合别名库对主客队名进行模糊匹配，计算置信度。
   - **上下文加权 (`contextual_match_score`)**：比分一致加 `+0.22`，时间一致（<10分钟）加 `+0.20`，分钟一致加 `+0.10`；冲突则大幅扣分。
   - **门槛判定**：综合匹配分 `>= threshold`（默认 0.72）判定为成功匹配。
3. **输出候选赋值 (`match_events`)**：
   - 生成 `output/ybty_leisu_candidates.json` 或 `output/ybty_leisu_prematch_candidates.json`。
   - 输出结构中每个 candidate 包含：
     - `match`: 统一赛事基本信息（队名、联赛、比分、分钟、开赛时间）。
     - `market_source`: YBTY 原始盘口完整对象。
     - `match_confidence`: 匹配置信度。
     - `live_statistics`: 8大技术统计。
     - `reference_odds`: 雷速参考赔率。
     - `recent_trends`: 5/15分钟技术统计增量与历史趋势。
     - `lineups`: 阵容数据。
     - `weather`: 比赛天气与环境。
     - `candidate`: 初筛评分与等级。

#### 2.2 特征工程拓扑（`interface_features.py`）
1. **进攻效率与门将表现计算 (`calculate_live_efficiency`)**：
   - `recorded_shots` = 射正 + 射偏。
   - `shot_accuracy` = 射正 / 可记录射门。
   - `goal_conversion_per_shot_on_target` = 进球数 / 射正数。
   - `save_rate` = (面对射正 - 失球) / 面对射正。
2. **历史与基本面特征提取 (`extract_interface_features`)**：
   - 近期总进球均值 `recent_goal_average`。
   - 历史交锋得失球均值 `head_to_head_goal_average`。
   - 历史大球率 `historical_big_ratio`。
   - 61分钟后进球数 `late_goal_count`。
   - 阵容伤停人数 `injuries` 与未来密集赛程 `future_schedule_count`。

#### 2.3 决策与推荐引擎拓扑（`recommend_live.py` / `recommend_prematch.py`）
1. **硬性规则校验与拦截**：
   - 数据时效性检查（`market_age_seconds <= 300`）。
   - 电竞/模拟赛过滤（`SIMULATION_MARKERS` 拦截）。
   - 比分未验证拦截（`score_verified` 必须为 True 才能评 A 级）。
   - 极端赔率与封盘拦截（`suspended == True` 或 赔率不在有效区间）。
2. **打分与推荐等级生成**：
   - 滚球核心模型：动量优势 + 射门射正优势 + 盘口即时让球/大小球水位价值。
   - 输出决策：`output/ybty_leisu_decisions.json` / `output/ybty_leisu_prematch_decisions.json`。
   - 推荐方向评级：
     - `A` 级：评分 `>= 85`，数据源与首发完整，具备高投资价值。
     - `B` 级：评分 `>= 72`，进入正选观察。
     - `C` / `RESEARCH`：缺乏完整数据或处于低置信区间，不入正式推荐。
     - `PASS`：无投注价值或触发硬性风控拦截。

---

### 3. 第三层：前端状态与展示层（`src/`）

#### 3.1 前端数据消费路径表

| 前端组件 / 模块 | 读取的文件/接口 | 读取的核心字段 | 渲染或计算的 UI 功能 |
| :--- | :--- | :--- | :--- |
| `App.tsx` | Pipeline API / 本地 JSON | `pipeline_status`, `candidates`, `decisions` | 全局数据加载、轮询、标签页切换与错误边界 |
| `LiveMatchesView.tsx` | `output/ybty_leisu_candidates.json` | `match`, `live_statistics`, `market_source`, `recent_trends` | 滚球赛事列表、即时比分、盘口对比、时钟与技术统计对比卡片 |
| `PrematchMatchesView.tsx` | `output/ybty_leisu_prematch_candidates.json` | `match`, `reference_odds`, `lineups`, `weather` | 赛前赛事列表、初盘/即时盘、首发阵型、伤停与交锋历史 |
| `BettingRecommendationsView.tsx` | `output/ybty_leisu_decisions.json` | `recommendations`, `grade`, `reasoning`, `kelly_stake` | 正式推荐决策卡片、置信度分值、凯利仓位指引、风控警示 |
| `LedgerView.tsx` | `output/recommendation_ledger.json` | `ledger_entries`, `result_status`, `pnl`, `roi` | 推荐历史台账、赛后核销盈亏统计、命中率与错误归因看板 |
| `AttackMomentumTimelineWidget.tsx` | `candidate.recent_trends.attack_momentum_timeline` | `data: number[][]` | 90分钟双半场全场攻守动量走势波形图 (Canvas/SVG) |
| `MiniMomentumSparkline.tsx` | `candidate.recent_trends.attack_momentum_timeline` | `data[current_half]` (最近片段) | 列表卡片内嵌微缩动量走势火花线 |
| `FormationClashModal.tsx` | `candidate.lineups` | `home_formation`, `away_formation`, `home.starters` | 双方首发阵型战术克制评估、中场争夺分析、边路压制弹窗 |
| `RecentFormModal.tsx` | `candidate.recent_trends.historical_analysis` | `recent_matches`, `head_to_head`, `league_standings` | 双方近10场战绩走势、胜负走势、进球时段热力图弹窗 |
| `TeamAliasesView.tsx` | `team_aliases.json`, `team_aliases_auto.json` | `key -> variants[]` | 队名别名对照表管理、新增与自动学习别名审核 |

---

## 三、 全系统核心字段映射与赋值拓扑全景矩阵

```
[原始来源: YBTY 扩展 DOM]  ────────┐
                                  ├──► [Python 匹配层: football_live.py] ──► [candidates.json] ──┐
[原始来源: 雷速接口 Protobuf+JSON] ──┘                                                               ├──► [前端 types.ts StandardMatchData]
                                                                                                    │
[Python 特征工程: interface_features.py] ──► [recommend_live.py] ──► [decisions.json] ─────────────┘
```

下表列出全系统每一个核心指标的源头、中间处理点与最终消费点：

| 规范标准字段名 | 采集层原始路径 (`Extension`) | 管道层字段路径 (`Python`) | 前端规范接口字段 (`TypeScript`) | 数据类型 | 校验与回退规则 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **赛事唯一标识** | `matches[].source_match_id` & `results[].match_id` | `match.source_match_id` / `match.sofascore_event_id` | `StandardMatchData.id` | `string` | 优先 YBTY ID，若无则使用雷速 ID |
| **联赛名称** | YBTY `matches[].league` | `match.league` | `StandardMatchData.league` | `string` | 优先 YBTY 原始联赛名，雷速用于补全 |
| **主队标准名称** | YBTY `matches[].home` | `match.home` | `StandardMatchData.home_team` | `string` | **绝对以 YBTY 原始队名为基准** |
| **客队标准名称** | YBTY `matches[].away` | `match.away` | `StandardMatchData.away_team` | `string` | **绝对以 YBTY 原始队名为基准** |
| **雷速主客队名** | 雷速 `formal.static_match.homeTeam.name` | `provider_state.home` | `StandardMatchData.provider_home_team` | `string` | 仅用于交叉验证与别名映射 |
| **比赛开赛时间** | 雷速 `formal.static_match.matchTime` | `match.start_time` | `StandardMatchData.start_time` | `string(ISO)` | 秒级时间戳转 ISO，YBTY 相对时间推算补全 |
| **比赛即时时钟** | YBTY `matches[].clock` | `match.minute` | `StandardMatchData.minute` | `number\|null`| 从时钟文本解析整数分钟 (0-120) |
| **比赛即时比分** | YBTY `home_score`/`away_score` & 雷速 `live_match.home_scores.score` | `match.score` `{home, away}` | `StandardMatchData.score` | `Score` | 优先 YBTY 盘口比分，雷速比分交叉核验 |
| **半场即时比分** | 雷速 `live_match.home_scores.halfScore` | `match.half_score` | `StandardMatchData.half_score` | `Score\|null` | 仅雷速接口提供 |
| **角球技术统计** | 雷速 `confirmed_statistics.corners` | `live_statistics.corners` | `UnifiedMatchStats.corners` | `{home, away}` | 必须为非负整数 |
| **黄牌技术统计** | 雷速 `confirmed_statistics.yellow_cards` | `live_statistics.yellow_cards` | `UnifiedMatchStats.yellow_cards`| `{home, away}` | 必须为非负整数 |
| **红牌技术统计** | 雷速 `confirmed_statistics.red_cards` | `live_statistics.red_cards` | `UnifiedMatchStats.red_cards` | `{home, away}` | 必须为非负整数，触发红牌重估 |
| **射正技术统计** | 雷速 `confirmed_statistics.shots_on_target` | `live_statistics.shots_on_target`| `UnifiedMatchStats.shots_on_target`| `{home, away}` | 必须为非负整数 |
| **射偏技术统计** | 雷速 `confirmed_statistics.shots_off_target`| `live_statistics.shots_off_target`| `UnifiedMatchStats.shots` | `{home, away}` | 射门总数 = 射正 + 射偏 |
| **危险进攻统计** | 雷速 `confirmed_statistics.dangerous_attacks`| `live_statistics.dangerous_attacks`| `UnifiedMatchStats.dangerous_attacks`| `{home, away}` | 必须为非负整数 |
| **控球率统计** | 雷速 `confirmed_statistics.possession` | `live_statistics.possession` | `UnifiedMatchStats.possession` | `{home, away}` | 0-100 整数，双方之和应为 100 |
| **动量时序波形** | 雷速 `live_match.attack_momentum_timeline` | `recent_trends.attack_momentum_timeline`| `StandardMatchData.momentum_timeline` | `object` | 包含双半场各分钟攻守压制数值数组 |
| **文字直播事件** | 雷速 `live_match.text_live` | `live_text.entries` | `StandardTimelineEvent[]` | `Array<object>`| 结构化清洗，提取进球、红黄牌、角球事件 |
| **初盘赔率矩阵** | 雷速 `formal.opening_odds` | `reference_odds.opening` | `ReferenceMarket.opening_line` | `object` | 让球、独赢、大小球初始基准 |
| **即时参考赔率** | 雷速 `formal.odds` | `reference_odds.current` | `ReferenceMarket.current_line` | `object` | 雷速多阶段即时赔率 |
| **YBTY 实时让球** | YBTY `markets[full_spread]` | `market_source.markets[full_spread]`| `StandardMatchData.markets.spread` | `object` | 主盘 line, home_odds, away_odds |
| **YBTY 实时大小** | YBTY `markets[full_total]` | `market_source.markets[full_total]` | `StandardMatchData.markets.total` | `object` | 主盘 line, over_odds, under_odds |
| **YBTY 实时独赢** | YBTY `markets[full_h2h]` | `market_source.markets[full_h2h]` | `StandardMatchData.markets.h2h` | `object` | 主客平三项即时欧赔 |
| **首发与替补阵容**| 雷速 `formal.lineup` | `lineups` | `LineupData` | `object` | 包含首发11人、阵型、教练及伤停 |
| **历史交锋与战绩**| 雷速 `formal.recent_matches` / `head_to_head` | `recent_trends.historical_analysis` | `HistoricalAnalysisData` | `object` | 近10场交锋、近期战绩走势及积分 |
| **进球时段分布** | 雷速 `formal.goal_distribution` | `recent_trends.goal_distribution` | `GoalDistributionData` | `object` | 15分钟各区间进球分布 |
| **推荐评级与方向**| Python 计算生成 | `candidate.grade` / `decision.recommendations` | `BettingRecommendationItem` | `object` | A/B/C 评级，玩法、盘口、水位、凯利仓位 |

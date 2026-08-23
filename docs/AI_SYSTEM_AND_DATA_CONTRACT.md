# CODEX 足球系统：AI 必读运行与数据契约

> 状态：当前有效（2026-08-20 最新同步）  
> 适用对象：首次接手本仓库的 AI、开发者、自动化审查工具  
> 规范来源：当前 TypeScript、Python、React 和浏览器扩展实现  
> 目标：读完本文件即可理解系统用途、运行链路、数据来源、导入导出格式、动能与时序引擎和风控边界。

## 0. AI 接手本项目时的固定读取顺序

1. 完整读取本文件。
2. 完整读取根目录 `CUSTOM_INSTRUCTIONS_COMPLETE.md`，了解足球研究、推荐、结算和复盘协议。
3. 按任务模式读取当前运行文件：
   - 滚球：`output/pipeline_status.json`、`output/ybty_latest.json`、`output/leisu_latest.json`、`output/ybty_leisu_candidates.json`、`output/ybty_leisu_decisions.json`、`output/match_snapshot_history.json`。
   - 赛前：`output/prematch_pipeline_status.json`、`output/ybty_prematch_latest.json`、`output/leisu_prematch_latest.json`、`output/ybty_leisu_prematch_candidates.json`、`output/ybty_leisu_prematch_decisions.json`、`output/prematch_ai_brief.json`。
   - Gemini 评估：再读取 `output/ai_evaluation_history.json`。
   - 正式推荐/串关/复盘：再读取 `output/recommendation_ledger.json` 和归档文件。
4. `sources/` 是只读同步资料，禁止修改。`output/` 是可重建运行状态，不得把旧文件当成当前批次。

如果本文与代码冲突，以以下实现为最终依据，并同步修正文档：

- 文件路径：`server/dataFiles.ts`
- 标准数据契约与清洗转换：`src/types.ts` (`StandardMatchData`)、`src/utils/dataAdapter.ts`、`server/services/canonicalMatchModel.ts`
- 数据导入：`src/components/ExportDataView.tsx`、`src/lib/leisuInterfaceImport.ts`、`server/routes/batchSupplementRoutes.ts`
- Python 数据采集与规范化管道：`scripts/python/football_live.py` (`load_leisu_interface_file`)
- Prompt 构造与分片：`server/services/promptInterfaceFeatures.ts`、`server/services/promptChunking.ts`、`server/services/promptSlimPayload.ts`
- Gemini 评估与导入：`server/services/geminiEvaluationService.ts`、`server/routes/geminiEvaluationRoutes.ts`、`server/routes/aiReadRoutes.ts`
- 市场校验与白名单对齐：`server/services/verifiedMarketAssessment.ts`、`server/services/marketAssessmentsNormalizer.ts`
- 比分校验与安全熔断：`server/services/scoreValidation.ts`
- 动能与时序增量引擎：`src/lib/snapshotDeltaEngine.ts`、`server/services/snapshotDeltaEngine.ts`
- 高阶战术量化与泊松先验：`server/services/advancedTacticalQuantitativeEngines.ts`、`server/services/formationTacticalEngine.ts`、`server/services/formAndH2HDeepMining.ts`、`src/lib/machineQuantPrediction.ts`
- 双重共识与四分之一盘口仲裁：`src/lib/consensusArbitration.ts`、`src/lib/quarterSettlement.ts`
- 实施完成报告与审计详述：`docs/data_audit/06_IMPLEMENTATION_COMPLETION_REPORT.md`

## 1. 系统是什么、做什么、不做什么

本项目是 Windows 本地足球研究与风控系统，由四部分组成：

```text
YBTY浏览器扩展 ──┐
                  ├─> 导入/匹配/标准化 ─> 候选与决策 ─> AI评估 ─> 人工确认 ─> 正式台账/复盘
雷速浏览器扩展 ──┘
```

系统负责：

- 导入 YBTY 滚球/赛前真实盘口；
- 导入雷速滚球/赛前比分、事件、技术统计、阵容、历史与参考赔率；
- 对齐主客队、赛事、时间和比分；
- 生成机器候选和研究队列；
- 导出滚球、赛前和串关 Prompt；
- 调用 Gemini API，或导入 Gemini 网页返回的 JSON；
- 校验 AI 是否引用真实 YBTY 盘口；
- 保存 AI 评估快照、正式推荐台账并进行赛后结算与校准。

系统不负责：

- 自动下注；
- 把机器候选自动视为正式推荐；
- 用雷速赔率替代 YBTY 投注赔率；
- 在比分、比赛对象或盘口未核验时强行推荐；
- 承诺必胜。

## 2. 最高优先级数据规则

### 2.1 来源职责与双轨盘口边界（权威铁律）

系统实行绝对明确的**双轨边界**，严禁混淆：

1. **YBTY 盘口：唯一真实的【投注与结算执行盘口】**
   - 所有正式推荐（单场及串关每一腿）的玩法、盘口线、赔率、队名和滚球时点，必须严格以 **YBTY 原始导出的真实可投盘口** 为准；
   - 赛后复盘、命中率统计、盈亏计算以及滚球后续时段/剩余进球结算，一律以 YBTY 真实盘口与赔率作为唯一合法依据。

2. **雷速盘口（初盘 / 赛前即盘 / 滚球即盘参考）：核心【参考、验证与辅助预测基准】**
   - 雷速的**初盘**（`opening` / `initial`）与**即时参考盘**（`instant` / `live`）用于衡量主流机构对比赛的先验定价；
   - 用于与现场攻势数据（危攻、射正、控球）交叉比对，评估战术成色、监测盘口衰减（Decay）与异动、识别强队破门迟滞的折价黄金期（Value Dilution）或攻势疲软的诱深防爆冷预警；
   - **绝对红线**：雷速赔率与盘口仅作为辅助预测和研判参考，**严禁写成或替代 YBTY 投注赔率与结算盘口**。

| 数据类型 | 权威来源 | 角色属性与系统用途 | 边界约束 |
|---|---|---|---|
| 可投注市场、方向、盘口、赔率 | YBTY `markets/options` | **唯一执行源**：正式推荐、串关、投注下单与结算 | 严禁被任何第三方赔率覆盖 |
| 滚球当前比分 | YBTY + 雷速可靠接口交叉验证 | **风控熔断基准**：决定是否允许正式滚球建议 | 无法交叉验证时禁止推荐 |
| 技术统计、事件、阵容、天气 | 雷速 | **基本面量化源**：概率研究、动能计算与风险判断 | 辅助 AI 深度逻辑与先验评估 |
| 初盘 / 赛前盘 / 滚球即盘参考 | 雷速 `reference_market` / `opening` / `instant` | **预测辅助与价值锚点**：初盘 vs 即盘预期对照、衰减度量 | 严禁用作投注赔率与盈亏结算 |
| 正式推荐身份 | AI评估 + 人工确认 + 台账 | **正式台账**：命中率统计与回测追溯 | 未入台账的机器初筛不算正式命中率 |

### 2.2 赛前初盘 vs 滚球即盘对照机制与首批次/跨批次动能合流体系

系统内置**赛前初盘 vs 滚球即盘对照引擎 (Initial vs Live Expectation Engine)** 与 **动能时序波形合流机制**，彻底解决“必须等待二次导入才能计算动能”的局限：

#### 1. 动能引擎双模架构（首批即激活 vs 跨批次差分）
- **单批次/首批次导入 (First Import / Single Batch)**：
  - 无需等待二次导入！系统自动抽取雷速连续逐分钟动量波形（`attack_momentum_timeline`），直接计算近15分钟攻势斜率（`slope`）、均分（`homeAvg/awayAvg`）、形态（`SINGLE_SIDE_CHOKE` 单边窒息压制 / `MIDFIELD_MUD` 中场泥潭缠斗 / 起势）与转化率评级；
  - 自动将雷速赛前初盘（`initial_handicap/total`）与当前 YBTY 滚球盘口（或雷速即盘）实时比对，立刻产出完整的初即偏离度与战术成色研判。
- **跨批次多次导入 (Cross-Batch Multi-Snapshot)**：
  - 系统持久化历史采样快照（`match_snapshot_history.json`），计算离散时间窗口内的指标加速度（`dangerous_attacks_delta`、`shots_on_target_delta`）与盘口水位漂移（`ou_line_drop`、`odds_drift`）；
  - 将离散差分与雷速连续波形深度融合，触发黄金切入点信号（`GOLDEN_ENTRY_LINE_DROP`）。

#### 2. 先验基准与即盘多层级深度提取链路
- **初盘先验基准提取**：
  - 提取雷速初盘让球（`initial_handicap`）与大小球（`initial_total`）作为机构赛前预期基准线。
- **即盘（Live Market）多层级穿透提取**：
  - **优先度 1**：提取当前 YBTY 实时导出的让球/大小球滚球盘口；
  - **优先度 2（穿透兜底）**：若 YBTY 滚球盘口因进球、红牌或临时调整处于封盘/暂缺状态，系统自动穿透提取雷速即盘数据（`reference_market.instant_handicap/instant_total`、`current_line`、`markets.*.live`），确保即时对照不中断，彻底杜绝无故显示破折号（`现: -`）；
  - **优先度 3**：回退提取初筛推荐项 `item.recommendation.line`。

#### 3. 预期偏离度量与四大战术成色模式 (Expectation & Tactics)
- **让球衰减量**: `handicap_decay = current_handicap - initial_handicap`
- **大小球衰减量**: `total_decay = current_total - initial_total`
- **模式 1：🔥 强队破门迟滞·初盘折价黄金期 (`VALUE_DILUTION_OPPORTUNITY`)**
  - *量化标准*：初盘深让（如 `-0.75` 或更深），随着比赛进行即时让步折价至浅盘（如 `-0.25` 或平半），但场面危攻比、射正数与近15分钟动量显示强队持续维持压迫攻势；
  - *战术价值*：机构因时间衰减释放出更低的门槛与更具防守边际的盘口空间，构成极佳的战术成色博弈机会。
- **模式 2：⚠️ 强队攻势疲软·谨防初盘诱深 (`PERFORMANCE_BELOW_INITIAL`)**
  - *量化标准*：初盘深让，但场面进攻极其乏力、射正过少甚至被对手频频反击，实际表现严重落后于初盘设定；
  - *战术价值*：提示初盘名气诱盘或强队轮换战意不足，坚决避免盲目按“强队名气”追单，触发防爆冷预警。
- **模式 3：🚀 战局反客为主 / 超出初盘预期 (`PERFORMANCE_BEATS_INITIAL`)**
  - *量化标准*：初盘平手或浅盘拉锯，场面实际呈现出单边攻势压制。
- **模式 4：⚖️ 契合初盘预期 (`PERFORMANCE_MATCHES_INITIAL`)**
  - *量化标准*：攻势走势与初盘预期及时间衰减完全匹配。

### 2.3 三个名称空间不得混淆

- `market`：标准市场键，例如 `full_total`。
- `category`：12类中文分类，例如 `全场大小球`。
- `direction`：纯方向，例如 `大球`；不能包含 `2.5`。
- `line`：纯盘口，例如 `2.5`、`1.5/2`、`-0.5/-1`；独赢必须为 `null`。

### 2.3 概率单位

AI评估中的 `probability`、`implied_probability`、`value_edge` 均使用百分数制 `0..100`，不是 `0..1`：

```text
implied_probability = 100 / odds
value_edge = probability - implied_probability
```

例如 `odds=2.00`、`probability=56`，则隐含概率为 `50`，价值差为 `6`。

### 2.4 单向正向量化推演与防倒推审计铁律 (Forward-Only DAG & Anti-Reverse-Inference)

系统严密执行从底层客观数据到期望值 (+EV) 的单向推导，彻底斩断大模型“拍脑袋猜比分再倒推盘口”的因果倒置行为：

1. **单向计算有向无环图 (Computation DAG)**：
   $$\text{雷速攻防数据 (}\lambda\text{期望进球、压迫倾角与射正转化)} \longrightarrow \text{各盘口独立公允胜率 } P_{\text{model}} \longrightarrow \text{比对 YBTY 赔率审计 +EV 边际} \longrightarrow \text{泊松矩阵最高频比分离散展示}$$
2. **严禁以比分作为推导论据**：
   - 预测比分仅是泊松联合概率矩阵的离散统计最高频切片（单点发生率通常仅 10%~15%），绝非推导大小球、让球或独赢的因果前提。
   - 所有盘口玩法的 `reason` 必须基于进球期望率 $\lambda$、三区压迫转化率与价值边际陈述，严禁出现“*因为预测比分为X-X*”、“*看好X-X所以推荐*”等倒推表述。
3. **系统非破坏性量化审计标记**：
   - 后端及前端审计引擎对所有评估理由执行特征扫描；若捕获到倒推模式，**完整保留原始理由文本**，并在数据中标记 `reverse_reasoning_detected: true`、附带 `audit_warnings` 并在 UI 渲染 `⚠️ 倒推标记` 徽章，供复盘与风控核验。

### 2.5 比分核验

滚球：

- 原记录 `score_verified=true` 时保持已核验；
- 或 YBTY `score` 与雷速接口 `detail_context.formal.live_match.home_scores.score/away_scores.score` 完全一致时，系统生成 `score_verified=true`、`score_source="ybty+leisu_api"`；
- 缺失、不一致或对象不可靠时为 `false`；五个真实市场禁止 `recommend/watch`，比赛级 `recommendation=null`。

赛前：比分规则不适用，系统使用：

```json
{"score_verified":true,"score_source":"prematch_not_applicable"}
```

这里的 `true` 只表示“不需要滚球比分核验”，不表示已有比赛比分。

## 3. 运行方式与文件流

### 3.1 启动

```powershell
pnpm install
pnpm dev
```

生产构建：

```powershell
pnpm build
pnpm start
```

### 3.2 Python 流水线入口

```powershell
.\run_latest_ybty.ps1  # 最新滚球YBTY流程
.\run_prematch.ps1     # 赛前流程
.\run_both.ps1         # 两种模式
.\run_monitor.ps1      # 滚球轮询
```

根目录脚本是兼容入口，实际实现主要位于 `scripts/python/` 和 `scripts/powershell/`。

### 3.3 运行文件

| 模式 | YBTY快照 | 雷速快照 | 匹配候选 | 决策 | 状态 |
|---|---|---|---|---|---|
| 滚球 | `output/ybty_latest.json` | `output/leisu_latest.json` | `output/ybty_leisu_candidates.json` | `output/ybty_leisu_decisions.json` | `output/pipeline_status.json` |
| 赛前 | `output/ybty_prematch_latest.json` | `output/leisu_prematch_latest.json` | `output/ybty_leisu_prematch_candidates.json` | `output/ybty_leisu_prematch_decisions.json` | `output/prematch_pipeline_status.json` |

AI快照：`output/ai_evaluation_history.json`。  
正式台账：`output/recommendation_ledger.json`。

## 4. 原始数据导入总览

Web导入页面接受：

- 单个 JSON；
- JSON 数组；
- 多文件文本，以 `/* --- FILE SPLIT --- */` 分隔；
- CSV；
- 整合包 `data.ybty.matches + data.leisu.events`；
- YBTY根对象 `matches[]`；
- 雷速根对象 `events[]`；
- 雷速接口根对象 `export_type=leisu_interface_* + results[]`；
- 已组合对象 `decisions[]` 或 `items[]`。

来源判定顺序：

- 包含 `combined/decision` 或 `decisions`：组合数据；
- `source_type/provider/score_source` 包含 `leisu`，或存在 `homeTeam/events/detail_context`：雷速；
- 其他默认按 YBTY。

提交到后端的标准入口：

```http
POST /api/batch-supplement
Content-Type: application/json
```

```json
{"mode":"overwrite","items":[]}
```

`mode` 为 `overwrite` 或 `merge`。单次最多5000项；缺少主队或客队应拒绝。

`items` 中每一项是页面标准化后的比赛对象；空数组仅用于展示外层结构，实际提交必须至少包含一场。

## 5. YBTY 导入格式

### 5.1 YBTY滚球根格式

```json
{
  "schema_version": 2,
  "export_version": "2.8.0",
  "source": "ybty",
  "export_mode": "live",
  "captured_at": "2026-08-16T09:00:00.000Z",
  "matches": [
    {
      "source_match_id": null,
      "league": "联赛名",
      "home": "YBTY主队原名",
      "away": "YBTY客队原名",
      "home_score": "0",
      "away_score": "1",
      "clock": "65:20",
      "clock_status": "65:20",
      "captured_at": "2026-08-16T09:00:00.000Z",
      "markets": [
        {
          "line_index": 0,
          "market": "full_total",
          "market_type_verified": true,
          "options": [
            {"side":"over","line":"1.5/2","selection":"1.5/2","odds":"2.02","suspended":false,"side_verified":true},
            {"side":"under","line":"1.5/2","selection":"1.5/2","odds":"1.78","suspended":false,"side_verified":true}
          ]
        }
      ]
    }
  ]
}
```

滚球关键字段：

- `export_mode="live"`；
- `home/away` 必须保留 YBTY 原名；
- 比分来自 `home_score/away_score`；
- 分钟优先读取 `clock/clock_status`；
- `markets[]` 是可投注白名单原料。

### 5.2 YBTY赛前根格式

与滚球使用相同 `matches[]/markets[]` 结构，但：

```json
{
  "source":"ybty",
  "export_mode":"prematch",
  "captured_at":"2026-08-16T01:00:00.000Z",
  "matches":[{
    "league":"联赛名",
    "home":"YBTY主队原名",
    "away":"YBTY客队原名",
    "commence_time":"2026-08-16T12:00:00.000Z",
    "home_score":null,
    "away_score":null,
    "markets":[]
  }]
}
```

赛前不得根据 `0-0` 推断已开赛；优先使用 `export_mode=prematch`、`status=notstarted` 或文件名中的 `prematch`。

### 5.3 YBTY市场键

当前AI真实市场白名单：

| 键 | 中文 |
|---|---|
| `full_total` | 全场大小球 |
| `half_total` | 半场大小球 |
| `full_spread` | 全场让球 |
| `half_spread` | 半场让球 |
| `full_h2h` | 全场独赢1X2 |

扩展可能导出多档相同市场。Prompt阶段会生成唯一 `option_id`：

- 单档：`full_h2h__1`；
- 多档：`full_total__m2__o1`，其中 `m2` 是同类第2档，`o1` 是该档第1个option。

AI必须原样复制 `option_id` 到 `market_option_id`。后端按ID重新锁定 `direction/line/odds`，不信任AI手抄值。

## 6. 雷速导入格式

### 6.1 雷速标准快照

滚球与赛前都可使用：

```json
{
  "source":"leisu",
  "export_mode":"live",
  "captured_at":"2026-08-16T09:00:00.000Z",
  "events":[{
    "id":"4613939",
    "homeTeam":{"name":"雷速主队名"},
    "awayTeam":{"name":"雷速客队名"},
    "homeScore":{"current":0},
    "awayScore":{"current":1},
    "minute":65,
    "_score_source":"score_canvas",
    "_statistics":{},
    "_incidents":[],
    "_weather":{},
    "_lineups":{},
    "_live_text":{},
    "_detail_context":{}
  }]
}
```

赛前使用 `export_mode="prematch"`，状态为 `notstarted`，比分不作为滚球比分使用。

### 6.2 雷速接口导出

扩展接口格式：

```json
{
  "export_version":"2.8.0",
  "export_type":"leisu_interface_data",
  "captured_at":"2026-08-16T09:00:00.000Z",
  "results":[{
    "match_id":"4613939",
    "available":true,
    "complete":true,
    "completeness":{},
    "formal":{
      "static_match":{
        "matchTime":1786860000,
        "homeTeam":{"name":"雷速主队名"},
        "awayTeam":{"name":"雷速客队名"},
        "competition":{"name":"联赛名"},
        "environment":{}
      },
      "live_match":{
        "match_id":4613939,
        "status_id":4,
        "source":"/api/v3/f/vd",
        "home_scores":{"score":0,"halfScore":0},
        "away_scores":{"score":1,"halfScore":0},
        "confirmed_statistics":{},
        "text_live":[]
      },
      "odds":{},
      "trend_summary":null,
      "lineup":null
    }
  }]
}
```

`src/lib/leisuInterfaceImport.ts` 将它规范化成雷速标准事件，派生：

- `score/home_score/away_score`；
- `status/is_live/export_mode`；
- `live_statistics`；
- `reference_odds`；
- `recent_trends`；
- `incidents/live_text`；
- `weather/lineups/player_candidates`；
- `detail_context.formal`。

`leisu_interface_diagnostic` 也可识别，但其中 `evidence` 只作诊断，正式字段仍以 `formal` 为准。

## 7. 标准决策对象

YBTY与雷速匹配后，AI主要读取以下对象：

```json
{
  "match":"YBTY主队 vs YBTY客队",
  "ybty_home":"YBTY主队",
  "ybty_away":"YBTY客队",
  "leisu_home":"雷速主队",
  "leisu_away":"雷速客队",
  "status":"RESEARCH",
  "grade":"C",
  "minute":65,
  "score":{"home":0,"away":1},
  "score_verified":true,
  "score_source":"ybty+leisu_api",
  "ybty_start_time_beijing":"2026-08-16 14:00 (明确时间)",
  "ybty_raw_markets":[],
  "live_statistics":{},
  "reference_odds":null,
  "recent_trends":null,
  "incidents":[],
  "lineups":null,
  "live_text":null,
  "detail_context":null,
  "recommendation":null,
  "evidence":[],
  "risks":[]
}
```

`WATCH/RESEARCH` 和机器 `grade/model_score` 只是筛选结果，不是正式投注建议。

## 8. Prompt 导出 API 与三种模式

统一接口：

```http
POST /api/ai/export-prompt
```

响应：

```json
{
  "success":true,
  "mode":"live_eval",
  "match_count":1,
  "prompt_count":1,
  "prompts":["当前选择风格对应的可发送prompt"],
  "standard_prompts":["标准操盘手模式Prompt"],
  "objective_prompts":["客观纯量化模式Prompt"],
  "gem_prompts":["专属Gemini Gem极简量化Prompt"],
  "prompt_style":"gem",
  "match_manifest":["主队 vs 客队"],
  "combined_prompt":"可一次发送的合并prompt",
  "instructions":"发送说明"
}
```

数据过大时会分段。`prompts[]` 用于同一Gemini会话顺序发送；`combined_prompt` 用于能够容纳全文的模型。最后一段必须合并全部比赛结果。
系统提供三类导出风格：
- **`gem` (💎 专属 Gemini Gem 极简量化模式，默认推荐)**：规则与数学模型已完全内化至定制 Gem 的 System Instructions 中，Prompt 仅包含 100% 纯净高密度的结构化物理数据 Payload，无多余冗余，执行速度最快，杜绝截断。
- **`standard` (🎯 标准操盘手模式)**：包含完整的六大引擎、风控铁律与业务推演协议，适用于未配置 Gem 的通用原生对话环境。
- **`objective` (⚡ 客观纯量化模式)**：去除主观战术叙事，锁定 5 大硬性盘口量化定价。

直接调用Gemini使用同一请求体发送至 `POST /api/ai/evaluate`；响应是经过后端白名单、比分和价值差复核后的评估对象。导出Prompt与直接调用共享 `buildPromptData`，不得维护两套字段协议。

### 8.0.1 导出与输出端排版格式与压缩规范 (Format & Compactness Engineering)
1. **输入端 Prompt（给 AI 读）**：
   - 必须保持**标准换行与 2 空格层级缩进**（Pretty-print）；
   - 绝对禁止将输入数据压缩为单行无空格字符串，以保护大模型分词器（Tokenizer）对浮点数（赔率、概率、$\lambda$）的识别精度并保留自注意力（Self-Attention）结构性先验。
2. **输出端 JSON（让 AI 生成）**：
   - 采用**紧凑行结构 (Compact Line-based JSON)**，每个字段独立换行，但严禁多层空行与深层空格缩进；
   - `reason` 严格约束在 1~2 句高密度量化陈述（物理事实 + 战术推演 + 真实胜率对比机构隐含概率）；
   - 此规范大幅减少 Token 消耗（提速 30%~50%），彻底杜绝批量评估时的输出截断（Max Tokens Truncation）。

### 8.0.2 专属 Gemini Gem 系统设定 (System Instructions) 规范
定制专属 Gem 时，需在其 Instructions 中固化：
- **拓扑单向因果链**：严格遵循 `物理事实/λ期望 -> 5大独立盘口胜率/EV -> 最佳推荐 -> 离散比分单点展示`；
- **仲裁与 Grounding 权责**：以现场物理攻防数据为基准底座，赋予 Google Search 实时检索首发与伤停权限，查实核心缺阵允许在 $\lambda$ 上动态浮动 $\pm 10\%\sim 20\%$ 并记录于证据链；
- **滚球让球结算口径**：滚球让球盘口必须以【当前比分 (0:0) 重新起算，计算剩余时段净增进球】。

### 8.1 滚球Prompt

请求：

```json
{
  "mode":"live_eval",
  "batch_match_refs":[{"match":"主队 vs 客队","ybty_home":"主队","ybty_away":"客队"}]
}
```

服务端从滚球决策、候选、YBTY快照和雷速快照补齐数据，再压缩为：

```json
{
  "match_info":{
    "match":"主队 vs 客队",
    "league":"联赛",
    "ybty_home":"主队",
    "ybty_away":"客队",
    "start_time_beijing":"时间",
    "minute":65,
    "score":{"home":0,"away":1},
    "score_verified":true,
    "score_source":"ybty+leisu_api"
  },
  "live_statistics":{},
  "key_incidents":[],
  "reference_odds":null,
  "trend_summary":null,
  "snapshot_delta":{
    "has_history":true,
    "elapsed_minutes":5,
    "is_golden_entry_point":true,
    "stat_acceleration":{
      "dangerous_attacks_rate_per_min":1.4,
      "dangerous_attacks_delta":{"home":5,"away":2,"total":7},
      "shots_on_target_delta":{"home":1,"away":0,"total":1}
    },
    "line_movement":{"ou_line_drop":-0.25,"hdp_line_change":0,"odds_drift_home":-0.08},
    "momentum_signal":"GOLDEN_ENTRY_LINE_DROP",
    "momentum_assessment":"近15分主队持续起势，大小球掉落0.25形成黄金切入契机"
  },
  "verified_ybty_markets":[]
}
```

### 8.2 赛前Prompt

请求：

```json
{
  "mode":"prematch_eval",
  "batch_match_refs":[{"match":"主队 vs 客队","ybty_home":"主队","ybty_away":"客队"}]
}
```

数据来自赛前决策、研究队列、赛前候选和两份赛前快照。`match_info.score_verified=true`、`score_source=prematch_not_applicable` 只是模式占位。赛前仍必须核对比赛对象、时间、阵容、盘口和数据完整性。

### 8.3 串关Prompt

请求：

```json
{
  "mode":"parlay_check",
  "selected_match_refs":[
    {"match":"比赛A","ybty_home":"A主","ybty_away":"A客"},
    {"match":"比赛B","ybty_home":"B主","ybty_away":"B客"}
  ],
  "parlay_requests":[{"size":2,"count":1}]
}
```

要求：至少2场；`size>=2`、`count>=1`，且 `size` 不得超过已选比赛数。候选可混合滚球和赛前；每场携带自己的 `evaluation_mode`、系统推荐、最新AI评估和YBTY白名单。

## 9. Gemini单场/批量评估输出契约与硬性拓扑计算链 (Forward-Only DAG)

滚球和赛前均使用 `football_market_audit_v2`，并强制执行**严格拓扑顺序自回归生成 (Strict Autoregressive Topological Schema)** 与 **硬性数学计算链 (Chain of Computation, CoC)**：

### 9.0 拓扑单向因果链 (Forward-Only DAG) 铁律
大模型自回归输出必须严格按照物理与逻辑时间线推进，从根本上杜绝“先猜比分再倒推盘口”的伪量化行为：
$$\text{Step 1: 物理攻防动量与 }\lambda\text{ 参数} \longrightarrow \text{Step 2: 5大核心盘口胜率与 EV 判定} \longrightarrow \text{Step 3: 最佳正向推荐} \longrightarrow \text{Step 4: 离散比分统计展示}$$

- **实时网络情报主动补全 (Active Web Grounding)**：全面激活联网检索能力，针对首发伤停（Confirmed XI）、天气突变、杯赛战意进行外部补全，事实无缝融入 Step 1 与 Step 2。
- **反倒推硬性红线**：严禁在 `reason` 中出现“预测比分为X-X所以看好大球/让球”等倒推语句。大小球必须由攻防进球期望 $\lambda$ 积分得出，让球必须由攻防净胜期望 $\Delta\text{xG}$ 导出。系统后台部署有 `detectReverseReasoning` 毫秒级审计哨兵与 `⚠️ 倒推标记`。

```json
{
  "schema_version":"football_market_audit_v2",
  "summary":"比赛:1|推荐:1|观察:0|熔断:0",
  "matches":[{
    "match":"原比赛名",
    "match_id":"原始match_id",
    "leisu_match_id":"原始leisu_match_id",
    "ybty_home":"YBTY主队",
    "ybty_away":"YBTY客队",
    "summary":"65'|0-1|score_verified=true|推荐",
    "score_verified":true,
    "score_source":"ybty+leisu_api",
    "verification_passed":true,
    "step1_physical_lambdas":{
      "lambda_home_rest":1.15,
      "lambda_away_rest":0.65,
      "lambda_total_rest":1.80,
      "dominant_siege":"主队高压围攻且三区压迫倾角占优",
      "key_physical_evidence":"射正4:1，三区压迫倾角68%，结合联网确认客队主力中卫伤退"
    },
    "market_assessments":[],
    "step3_best_recommendation":{
      "category":"全场大小球",
      "market":"full_total",
      "market_option_id":"full_total__m2__o1",
      "direction":"大球",
      "line":"1.5",
      "odds":1.68,
      "probability":65,
      "value_edge":5.48,
      "grade":"B"
    },
    "recommendation":{
      "category":"全场大小球",
      "market":"full_total",
      "market_option_id":"full_total__m2__o1",
      "direction":"大球",
      "line":"1.5",
      "odds":1.68,
      "probability":65,
      "value_edge":5.48,
      "grade":"B"
    },
    "step4_discrete_score_projection":{
      "most_likely_score":"2-1",
      "poisson_joint_prob_pct":12.8,
      "note":"仅作为泊松矩阵单点离散最高频展示，禁止作为大小球/让球推导论据"
    }
  }]
}
```

每场 `market_assessments` 必须恰好12项且顺序固定：

1. 全场大小球
2. 半场大小球
3. 全场让球
4. 半场让球
5. 全场独赢1X2
6. 波胆
7. 双方是否进球
8. 总进球单双
9. 主队进球数
10. 客队进球数
11. 总进球数
12. 进球时间段

单项完整结构：

```json
{
  "category":"全场大小球",
  "market":"full_total",
  "market_option_id":"full_total__m2__o1",
  "direction":"大球",
  "line":"1.5",
  "odds":1.68,
  "odds_source":"ybty_verified",
  "probability":65,
  "probability_scope":"总进球>1.5",
  "implied_probability":59.52,
  "value_edge":5.48,
  "grade":"B",
  "status":"recommend",
  "reason":"射正:2-5|危攻:35-53|比分已核验",
  "evidence_refs":["live_statistics.shots_on_target","live_statistics.dangerous_attacks"],
  "risk":"尾声变数"
}
```

### 9.1 状态语义

| status | grade | 含义 |
|---|---|---|
| `recommend` | `A/B` | 真实YBTY市场，可形成正式推荐候选 |
| `watch` | `C` | 真实YBTY市场，仅观察 |
| `avoid` | `NO_BET` | 有真实市场但不应下注 |
| `unavailable` | `NO_BET` | YBTY没有该市场/有效option |
| `prediction` | `NO_BET` | 结果预测，不是可投注市场评级 |

预测类允许 `direction/probability/probability_scope`，但 `market_option_id/line/odds/odds_source/implied_probability/value_edge` 必须为 `null`。

### 9.2 后端强制校验

- 缺少12类时，直接Gemini路径会补成 `unavailable`；手工批量导入会拒绝不完整结果。
- 真实市场按 `market_option_id` 对照当前比赛YBTY白名单；ID不存在或盘口不一致时拒绝或降为 `unavailable`。
- 后端重新计算隐含概率和价值差。
- 滚球比分未核验时强制真实市场 `avoid/NO_BET`，并清空比赛级推荐。
- 独赢 `line` 强制为 `null`。
- 最终只有 `status=recommend` 且 `grade=A/B` 的真实市场能支持 `verification_passed=true`。

## 10. Gemini串关输出契约

```json
{
  "summary":"串关总结",
  "grade":"B",
  "recommendation":{"market":"串关组合核对结论","line":"N/A","odds":3.2,"best_timing_tip":"价格条件"},
  "score_verified":true,
  "score_source":"mixed_verified",
  "verification_passed":true,
  "evidence":["每腿均来自YBTY白名单"],
  "risks":["相关性风险"],
  "timing_strategy":"资金与停止条件",
  "parlay_safety_check":{"is_valid_parlay":true,"allow_max_parlay_tickets":1,"reasons":["理由"]},
  "parlay_recommendations":[{
    "size":2,
    "ticket_index":1,
    "grade":"B",
    "estimated_total_odds":3.2,
    "reason":"组合理由",
    "legs":[{
      "match":"比赛A",
      "ybty_home":"A主",
      "ybty_away":"A客",
      "market":"全场大小球",
      "line":"大 2.5",
      "odds":1.8,
      "odds_source":"ybty_verified",
      "probability":61,
      "grade":"B",
      "reference_odds_usage":"雷速只作轨迹参考"
    }]
  }]
}
```

串关腿的 `market` 使用中文标准玩法，`line` 必须同时包含方向与盘口；独赢写主胜/客胜/平局。后端会把它拆回 `category/direction/line`，再与该比赛YBTY白名单核验。任一腿不通过时整张票 `verification_passed=false`、等级降为C。

## 11. Gemini结果导入

统一接口：

```http
POST /api/ai/import-evaluation
```

### 11.1 导入滚球评估

```json
{
  "raw_text":"{...football_market_audit_v2 JSON字符串...}",
  "mode":"live_eval",
  "expected_match_count":1
}
```

### 11.2 导入赛前评估

```json
{
  "raw_text":"{...football_market_audit_v2 JSON字符串...}",
  "mode":"prematch_eval",
  "expected_match_count":1
}
```

### 11.3 导入串关评估

```json
{
  "raw_text":"{...串关JSON字符串...}",
  "mode":"parlay_check"
}
```

解析器允许最外层Markdown JSON围栏和尾逗号，但规范输出仍应是单个纯JSON对象。

导入流程：

1. 解析JSON；
2. 检查预期比赛数；
3. 滚球/赛前检查每场12类完整性；
4. 按比赛名或YBTY主客队定位当前决策；
5. 重新取得当前YBTY盘口；
6. 重新核验比分；
7. 重锁真实市场字段并执行滚球熔断；
8. 串关逐腿核验；
9. 写入 `output/ai_evaluation_history.json`，标记 `ai_provider=gemini_manual_web_import`。

AI评估历史是诊断快照，不自动计入正式推荐命中率。正式推荐必须另行写入台账。

## 12. 匹配、别名与比赛身份

YBTY原名始终用于投注显示和台账；雷速名只用于交叉验证。匹配综合使用：

- 主客方向；
- 人工别名 `team_aliases.json`；
- 自动别名 `team_aliases_auto.json`；
- 联赛；
- 开赛时间；
- 滚球比分；
- 必要时的文字搜索。

不得因为一支队名相似就覆盖另一场。男足/女足、U19/U20、B队/预备队、主客对调、赛事和时间冲突必须保持未匹配。

## 13. 常见错误与正确处理

| 错误 | 后果 | 正确处理 |
|---|---|---|
| 用雷速赔率写入 `odds` | 虚构可投注价格 | 只用YBTY option |
| 多档市场重复option ID | 锁错盘口 | 使用 `__mN__oN` 唯一ID |
| 独赢 `line="客"` | 字段污染 | `direction="客胜"`、`line=null` |
| 概率写0.62 | 被当0.62% | 写62 |
| 单次累计统计推断“放缓” | 无趋势证据 | 只有多快照才写趋势 |
| 无赔率轨迹声称“倒挂/升盘” | 无证据 | `reference_odds`缺失时禁止 |
| 滚球比分未核验仍推荐 | 违反熔断 | `avoid/NO_BET` |
| 把prediction当投注建议 | 风险误导 | 只显示模型预测，不进正式台账 |
| 赛前0-0当作滚球 | 模式错误 | 以`export_mode/status`为准 |
| 只输出部分比赛或少于12项 | 导入失败 | 保持manifest顺序和完整12项 |

## 14. 修改数据契约时必须同步的位置

任何字段或模式变更必须同步检查：

1. 浏览器扩展导出；
2. `src/components/ExportDataView.tsx`；
3. `src/lib/leisuInterfaceImport.ts`；
4. Python匹配/推荐脚本；
5. `server/dataFiles.ts`；
6. `server.ts` Prompt；
7. `server/routes/aiReadRoutes.ts`；
8. `server/services/verifiedMarketAssessment.ts`；
9. `src/types.ts`；
10. React展示与台账；
11. `tests-ts/` 和 `tests/`；
12. 本文件。

## 15. 2026-08 全链路物理量化与联合演算重构规范

为根除传统统计中“控球率虚高误导”、“静态阵型刻板印象绑架预测”、“忽视角球与定位球防线承压”以及“漏判超巨星/反击脉冲式致命威胁”等深层缺陷，系统已升级全指标联合物理演算体系：

### 15.1 三层递进渗透漏斗 (Penetration Funnel) & UPTS 内核
1. **空间与领地压制**：$\text{EffectiveTerritory} = \sqrt{\text{Possession} \times \frac{\text{DangerousAttacks}}{\max(1, \text{Minutes}) \times 0.5}}$；
2. **防守破坏增益**：$\text{DisruptionBonus} = 1.0 + (\text{Corners} \times 0.15) + (\text{OpponentYellowCards} \times 0.3) + (\text{OpponentRedCards} \times 0.8)$；
3. **门前终结穿透率**：$\text{LethalityRate} = \frac{\text{ShotsTarget} \times 2.0 + \text{OffTarget} \times 0.8 + \text{Goals} \times 4.0 + 0.05}{\max(1, \text{DangerousAttacks})}$；
4. **联合物理威胁分 (UPTS)**：$\text{UPTS} = \text{EffectiveTerritory} \times \text{LethalityRate} \times \text{DisruptionBonus}$。
   - **核心物理规则**：无有效终结（0 射门 0 射正 0 破防）的高控球（如 77%），其终结穿透率接近于 0，UPTS 自动归零，彻底消灭“无效控球即优势”的假象。

### 15.2 脉冲式攻势致命密度 (Attack Lethality Density - ALD)
$$\text{ALD} = \frac{\text{Goals} \times 4.0 + \text{ShotsTarget} \times 2.0 + \text{Corners} \times 1.0 + \text{ForcedYellowCards} \times 1.5}{\max(1, \text{DangerousAttacks})}$$
- **脉冲突发检测 (`pulse_burst_detected`)**：当弱势/低控球方在短时间内以极低危攻产生高 ALD（$\ge 0.4$）并换取射正、进球或迫使对手吃牌时，系统自动标记为“脉冲突发高效反击”，绝不因常态控球低而盲目唱衰。

### 15.3 阵型先验的通用贝叶斯时间衰减 (Bayesian Prior Decay)
$$W_{prior}(t) = \frac{1}{1 + e^{0.12 \times (t - 22)}}$$
- 静态几何克制仅作为赛前/开场初期的风格标签；
- $t \ge 20 \sim 25$ 分钟时先验权重跌破 50%，$t \ge 30$ 分钟后完全由现场实战 UPTS 物理表现主导。

### 15.4 五大通用实战格局自适应判定 (Universal Match Patterns)
- **`TRUE_SIEGE` (真实高位围攻)**：高领地 + 高角球/射门 + 门前实质破防；
- **`STERILE_POSSESSION` (无效传控)**：高控球 + 0 射正 + 低角球，强制大幅削减赢盘与大球期望；
- **`LETHAL_COUNTER` (高效穿透反击)**：低控球 + 高 ALD + 伴随射门与造牌，激活下盘与反击得分保护；
- **`SET_PIECE_DOMINANCE` (定位球与高空轰炸)**：阵地受阻但角球密度高（90' 预期 $\ge 7$）持续制造禁区混乱；
- **`ATTRITIONAL_DEADLOCK` (中场胶着互不着力)**：双方渗透产出皆低，优势归于均势（0）。

### 15.5 亚洲让球盘连续泊松积分与角球攻防倾角融合 (Continuous Asian Handicap & Field Tilt Fusion)
1. **亚洲让球盘连续积分 (`computeAsianHandicapProb`)**：
   - 彻底废除离散阶梯估值，引入全场及半场 $7 \times 7$ 独立泊松矩阵双重循环积分；
   - 自动解析半球、平半、一球等盘口线，精确计算赢半（+0.25 盘口权益 50% 转化）、输半（-0.25 盘口权益 25% 留存）与平手走盘（0 盘口 50% 权益计入），生成高精度的物理胜率曲线。
2. **半场时间衰减平滑化 (Half-time Smooth Decay)**：
   - 半场进球期望采用平滑时变折算 $\max(0.05, \text{Goal} + \lambda_{\text{rest}} \times \frac{\max(0, 45 - t)}{\max(1, 90 - t)})$，根除 44~45 分钟时段产生的期望断崖突变。
3. **角球让球盘攻防倾角融合 (Corner Spread Blended Projection)**：
   - 角球让球盘预测将当前累积角球比例（60% 权重）与前场危险进攻压迫倾角 Field Tilt（40% 权重）进行深度加权（`blendedHomeShare = cornerShare * 0.6 + dangTilt * 0.4`），解决单边围攻但角球暂时落后的预测滞后问题。
4. **进球时段分布末段动能补偿 (Goal Distribution Late-Game Surge)**：
   - 在 $t \ge 60$ 分钟推演中，深度引入雷速 15 分钟进球时段分布数据；当球队在 76-90+ 分钟具有历史高进球偏好（$\ge 3$ 球）时，自动赋予破门动能 $1.10\times$ 爆发加权。
5. **标准模型数据闭环 (Canonical Match Context Normalization)**：
   - 彻底打通交锋历史 (`head_to_head`)、近期战绩 (`recent_matches`)、联赛积分榜 (`league_standings`)、进球时段分布 (`goal_distribution`) 与盘路走势 (`trend_summary`) 五大维度的清洗与推演流转。

### 15.6 专属 Gemini Gem 极简量化生态与 Web UI 适配规范 (2026-08 最新同步)

为实现本地量化系统与 Google Gemini Web / Gem 的零损耗闭环交互，系统制定了统一的 Gem 协议与交互规范：

1. **赛前默认占位符零偏置隔离 (Zero Prior Bias via Weight Neutralization)**：
   - 赛前状态下（`minute: 0`），技术统计默认占位符（如控球率 `50%-50%`、射门 `0-0`）的**实时物理动量权重严格置为 0.0**；
   - 赛前期望 $\lambda$ 100% 由历史攻防得失球、主客场特异性加权、交锋深挖与做市商无偏概率驱动，对赛前默认占位符具备完全数学免疫。
2. **专属 Gem 状态机通用架构 (Single Gem for Both Prematch & In-Play)**：
   - 同一个专属 Gem 无缝兼容**赛前深度预估**与**滚球即时闪击**；
   - 状态机自动根据 Payload 中的 `minute` 与 `score` 切换：
     - `minute: 0`：启动赛前全局基本面定价与做市商深度折价挖掘；
     - `minute > 0`：自动切换为滚球剩余时段进球期望积分与让球盘口归零重新起算。
3. **Token 容量与扩展思考实战准则 (Token Budget & Extended Thinking Guidelines)**：
   - **输入容量安全裕度**：9 场赛前极简高密度 Payload（约 27.6 万字符 / 7 万 Token）仅占用 Gemini 100 万上下文窗口的 **7.5%**，可一次性安全整段输入；
   - **扩展思考 (Extended Thinking)**：强烈建议开启，促使模型执行隐式思维链（Chain-of-Thought），严密计算多盘口独立胜率与 EV，规避极端深盘（如 -4 盘、5.5 大球）的模型基准剪刀差幻觉；
   - **输出防截断**：若接近单次 8,192 Token 输出上限而停顿，直接回复“继续”即可无缝补全闭合 JSON。
4. **Google Gemini Gem 最新配置说明 (Native Grounding & Search Trigger)**：
   - 最新版 Google Gemini Gem 创建页中，`Google Search` 联网能力已内化为原生默认能力（无需寻找独立复选框）；
   - 在 Gem 的 `Instructions` 中明确声明网络检索规则即可自动触发谷歌实时搜索核实青年联赛、杯赛首发与突发情报。

### 15.7 机器量化预测引擎 v2.5 运行规范 (Machine Quant Engine v2.5 & Advanced Econometric Models)

系统全面部署双轨机器量化推演架构（`src/lib/machineQuantPrediction.ts`）：

1. **主盘口智能甄选引擎 (`selectMainMarketLine`)**：
   - 彻底废除数组自然排序第一档作为主盘口的缺陷；
   - 自动遍历全部挂盘档位，综合双边贴水离散度 $|Odds_1 - Odds_2|$、主流主力水位区间 $[1.80, 2.15]$ 贴近度以及抽水率（Overround）加权打分，锁定流动性最充裕、最具代表性的基准主力盘口，并返回所有副盘。
2. **赛前专属 Dixon-Coles 泊松精算推演引擎 (`calculatePrematchQuantAnalysis` v2.5)**：
   - **做市商共识去水先验反解**：以 1X2 独赢及大小球主力盘去水概率反解全球期望进球 $\lambda_{total}$ 与胜平负无偏先验；
   - **Dixon-Coles 低比分二元相关性修正**：通过参数 $\rho = -0.07$ 与修正函数 $\tau(x, y)$ 修正 0-0、1-0、0-1、1-1 比分分布，构建 $8 \times 8$ 归一化联合概率矩阵，彻底解决独立泊松低估平局概率的结构性偏差；
   - **历史交锋时效衰减与主客同态加权**：1.2 年（438天）指数半衰期 + 3 年硬截断 + 同主客场 $1.25\times$ 加权 + 贝叶斯样本量收缩（$<4$ 场向基准 2.65 球平滑收缩）；
   - **双层近期战绩走势分解**：65% 纯净主客场（主在主/客在客）+ 35% 交叉态（主在客/客在主）+ 近 6 场时间递减衰减向量 $[0.28, 0.23, 0.18, 0.14, 0.10, 0.07]$；
   - **联赛积分榜 6 大战意陷阱硬性排查**：中游无欲无求散步陷阱（穿盘折价 25%）、保级生死线保平默契陷阱（平局因子 $\tau_{\text{draw}} +0.12$）、悬崖保级死磕陷阱；
   - **动态半场进球动力学模型**：基于双方历史真实 $0\sim 45$ 分钟进球占比分布，在 $[0.35, 0.52]$ 动态测算半场大小与让球；
   - **数据完备度分级与 EV 削顶风控**：A 级（上限 35% EV）、B 级（削顶 22% EV）、C 级（限幅 8% EV，置信度降为 LOW）。
3. **缺失情报零假象偏差防御机制 (`Zero-Bias Fallback`)**：
   - 任何基本面情报维度缺失时，该维度修正权重严格归零，绝不伪造攻防数据；
   - 基本面全量缺失时平滑退化为 **纯市场共识精算 (`PURE_MARKET_CONSENSUS`)**，EV 保持中性，并在 UI 明确展示数据质量徽章。
4. **智能路由机制 (`calculateMachineQuantAnalysis`)**：
   - 赛前未开赛（`minute: 0` / `status === 'RESEARCH'`）自动进入赛前专属 Dixon-Coles 泊松引擎；
   - 滚球进行中（`minute > 0` / `status === 'WATCH'`) 自动进入 UPTS 物理危攻转化率与时间衰减引擎。

## 16. 验证命令

```powershell
npm run lint
npm run test:ts
npm run build
python -m unittest discover -s tests -p "test_*.py"
```

文档或契约修改完成后，至少确认：

- 示例JSON可解析；
- 12类顺序与代码一致；
- YBTY option ID唯一；
- 滚球与赛前比分语义没有混用；
- 串关腿可以重新映射回YBTY真实option；
- 导入历史不被误算为正式台账。

# CODEX 足球预测计算完整数据链路全景说明书

> **文档性质**：系统核心架构全链路解析规范  
> **适用范围**：从数据采集、导入解析、清洗标准化、量化精算、AI 评估到 Prompt 导出与正式推荐回流的全链路（前端 + 后端）  
> **生效时间**：2026-08-23

---

## 1. 整体架构与数据流总览

整个系统贯穿「前端 UI 交互 ↔ 后端 Node/Express 核心服务 ↔ 本地持久化存储 ↔ Python 分析管道 ↔ 外部 LLM / Gemini 接口」六大物理边界。其完整数据流动生命周期如下图所示：

```text
┌──────────────────────────────┐          ┌──────────────────────────────┐
│       YBTY 浏览器扩展        │          │       雷速 浏览器扩展        │
│   (真实可投注盘口/赔率/选项) │          │  (技术统计/事件/情报/参考盘) │
└──────────────┬───────────────┘          └──────────────┬───────────────┘
               │                                         │
               ▼                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        前端数据导入与预解析层                          │
│  src/components/ExportDataView.tsx / src/lib/leisuInterfaceImport.ts   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (POST /api/supplement/batch)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    后端清洗、标准化与赛事对齐管道                      │
│     server/routes/batchSupplementRoutes.ts (数据落地与管道串联)        │
│     server/services/canonicalMatchModel.ts (五维情报标准化)            │
│     server/services/scoreValidation.ts (双源比分交叉校验与风控熔断)    │
│     Python: scripts/python/football_live.py / football_prematch.py    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼ (持久化至 output/ 目录)
┌────────────────────────────────────────────────────────────────────────┐
│                  多轨量化推演与做市商去水精算中枢                      │
│  1. 赛前专属泊松推演 (calculatePrematchQuantAnalysis)                   │
│  2. 滚球动量物理推演 (calculateLiveQuantAnalysis - UPTS 转化)          │
│  3. 主盘口智能甄选 (selectMainMarketLine - 流动性与贴水打分)          │
│  4. 缺失数据零假象偏差熔断 (Zero-Bias Fallback -> PURE_MARKET_CONSENSUS)│
│  5. 亚洲盘四分之一盘口精确权益拆分 (quarterSettlement.ts)              │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
┌──────────────────────────────┐   ┌─────────────────────────────────────┐
│    Prompt 构造与极简分片导出 │   │          前端实时推演呈现           │
│ server/services/             │   │ src/components/                     │
│  promptSlimPayload.ts        │   │  BettingRecommendationsView.tsx     │
│  promptChunking.ts           │   │  (5大核心盘口胜率/EV/战术标签展示)  │
│ (POST /api/ai/export-prompt) │   └─────────────────────────────────────┘
└──────────────┬───────────────┘
               │ (发送至 Gemini API 或 复制至 Gemini Web UI)
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      AI 评估结果回流与双重核验                         │
│   server/services/geminiEvaluationService.ts                           │
│   server/services/verifiedMarketAssessment.ts                          │
│   (强制白名单对照: market_option_id / 盘口线 / 赔率合法性仲裁)         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      正式推荐台账与赛后自动复盘                        │
│   output/recommendation_ledger.json (推荐台账)                         │
│   record_formal_recommendation.py / review_formal_recommendations.py   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 阶段一：数据导入与前端解析层

### 2.1 原始数据抓取源
1. **YBTY 浏览器扩展（执行源）**：
   - 抓取当前正在进行的滚球比赛或赛前比赛；
   - 提取主客队名、赛事名、开赛时间/当前分钟、即时比分，以及**全部可投注挂盘市场（`markets`）**与选项详情（`market_type`、`line`、`odds`、`side`、`selection`）；
   - **赋予唯一全局标识**：系统为每个可投注选项构建唯一 `market_option_id`。
2. **雷速数据扩展（情报源）**：
   - 抓取雷速比分看板、接口数据（如 `/api/v3/f/vd`）；
   - 包含多维资产：技术统计（控球率、射正/射偏、危险进攻、角球、黄红牌）、比赛大事件（`incidents` / `live_text`）、首发阵型（`lineups`）、历史交锋（`head_to_head`）、近期战绩（`recent_matches`）、联赛积分榜（`league_standings`）及机构参考赔率。

### 2.2 前端规范化处理 (`src/lib/leisuInterfaceImport.ts`)
- 前端接收到剪贴板或文件导入时，`leisuInterfaceImport.ts` 会将雷速原始接口层层提取，规范化为 `LeisuInterfaceStandardEvent`；
- 提炼核心字段：`score`、`live_statistics`、`reference_odds`、`recent_trends`、`detail_context.formal`。

---

## 3. 阶段二：后端清洗、标准化与赛事对齐管道

### 3.1 批量补充与对齐调度 (`server/routes/batchSupplementRoutes.ts`)
- 客户端发起 `POST /api/supplement/batch`，将 YBTY 与雷速数据提交至后端；
- 后端将数据写入 `output/ybty_latest.json` 和 `output/leisu_latest.json`（赛前写入 `output/ybty_prematch_latest.json` 等）；
- 触发对齐脚本（Python `football_live.py` 或 `football_prematch.py`），利用球队别名库（`team_aliases.json`）进行主客队双向模糊与精确匹配，生成候选集 `ybty_leisu_candidates.json`。

### 3.2 比分真实性交叉校验 (`server/services/scoreValidation.ts`)
- **双源比分强制比对**：比对 YBTY 记录比分与雷速 API 解析比分；
- **风控熔断**：若比分存在冲突、缺失或为非法值，标记 `score_verified = false`；
- 此时系统强行**锁定正式推荐权限**，仅允许只读量化推演，严禁输出正式 A 级投注建议。

### 3.3 五维标准数据上下文构建 (`server/services/canonicalMatchModel.ts`)
后端对每场匹配成功的比赛构建标准数据模型 `StandardMatchData`，涵盖：
1. `head_to_head`（历史交锋）
2. `recent_matches`（主客双方近期战绩）
3. `league_standings`（联赛梯队与排名）
4. `lineups`（首发阵容与身价）
5. `verified_ybty_markets`（已核验的 YBTY 投注市场列表）

---

## 4. 阶段三：多轨机器量化推演引擎 (Machine Quant Engine v2.5)

所有数据汇聚后，系统通过 `src/lib/machineQuantPrediction.ts`（及服务端对应的量化引擎）启动高精度数学推演。

### 4.1 核心主盘口智能甄选 (`selectMainMarketLine`)
系统彻底摒弃了传统取挂盘数组第一项的缺陷，对全量盘口执行打分甄选：
1. **分类归集**：将市场分为 `full_total`（全场大小）、`half_total`（半场大小）、`full_spread`（全场让球）、`half_spread`（半场让球）、`full_h2h`（独赢 1X2）；
2. **三维加权平衡打分**：
   $$\text{Score} = |Odds_1 - Odds_2| + \text{Penalty}_{\text{MainBand}} \times 1.5 + \text{Overround} \times 5.0$$
   - 优先选择贴水离散度最小、水位落在主流主力区间 $[1.80, 2.15]$ 且庄家抽水率最低的盘口线作为**基准主盘口**；
3. **副盘保留**：主盘用于基准概率与 EV 测算，同时保留全部副盘列表供深度决策。

### 4.2 赛前专属泊松推演链路 (`calculatePrematchQuantAnalysis` v2.5)
针对赛前（`minute === 0` 或 `engineMode === 'PREMATCH_QUANT'`）比赛，系统实施了专业足球分析师级别的深度量化建模：

1. **做市商共识先验反解 (Market Prior Un-Vigging)**：
   - 从独赢 1X2 主盘去水反解无偏胜、平、负先验基准概率；
   - 从全场大小球主盘（如 3/3.5 @ 1.88 / 2.00）结合贴水反解全球做市商公认总期望进球 $\lambda_{total}$；

2. **Dixon-Coles 改进型二元相关性泊松联合概率矩阵**：
   - 传统独立泊松模型严重低估足球比赛中 `0-0`、`1-1` 等平局比分概率，高估 `1-0`、`0-1`。系统引入 Dixon-Coles 低比分修正因子 $\tau(x, y, \lambda_H, \lambda_A, \rho)$：
     $$\tau(0,0) = 1 - \lambda_H \lambda_A \rho$$
     $$\tau(1,0) = 1 + \lambda_A \rho$$
     $$\tau(0,1) = 1 + \lambda_H \rho$$
     $$\tau(1,1) = 1 - \rho$$
     $$\tau(x,y) = 1.0 \quad (\text{当 } x \ge 2 \text{ 或 } y \ge 2)$$
   - 构建 $8 \times 8$（0~7 球）修正后并重新归一化的联合概率矩阵：
     $$P(H=x, A=y) = \frac{\tau(x, y) \cdot P_{\text{Poisson}}(x; \lambda_H) \cdot P_{\text{Poisson}}(y; \lambda_A)}{\sum_{i,j} \tau(i, j) \cdot P_{\text{Poisson}}(i; \lambda_H) \cdot P_{\text{Poisson}}(j; \lambda_A)}$$

3. **历史交锋时效衰减与主客同态加权 (`calculateWeightedH2HAlpha`)**：
   - **时间指数衰减**：引入 $1.2$ 年（$438$ 天）半衰期 $w = e^{-\Delta t / 438}$；
   - **3 年硬性截断**：$\Delta t > 1095$ 天的历史交锋彻底剔除（因球员阵容、战术体系已发生代际更迭）；
   - **主客场同态加权**：当前主客场对阵与历史相同的场次赋予 $1.25\times$ 权重，颠倒主客场场次降权至 $0.80\times$；
   - **贝叶斯样本收缩**：有效场次 $< 4$ 场时，向基准 $2.65$ 球以 $\frac{N}{4.0}$ 因子收缩，杜绝小样本方差冲击。

4. **双层近期战绩走势引擎 (`calculateTwoTierRecentFormAlpha`)**：
   - **Layer 1（65% 纯净主客场）**：主队在主场战绩 + 客队在客场战绩；
   - **Layer 2（35% 交叉态）**：主队在客场战绩 + 客队在主场战绩；
   - **时间衰减向量**：近 6 场按 $[0.28, 0.23, 0.18, 0.14, 0.10, 0.07]$ 递减加权。

5. **积分榜 6 大战意陷阱硬性规则引擎 (`evaluateStandingsTraps`)**：
   - **中游散步陷阱 (`MID_TABLE_COMPLACENCY`)**：双方位居中游无争冠保级紧迫性时，主让深盘穿盘信心下调（25% 惩罚折价）；
   - **保级保平默契陷阱 (`MUTUAL_DRAW_SURVIVAL`)**：保级生死线附近积分相差 $\le 1$ 时，$\tau_{\text{draw}}$ 平局加成 $+0.12$，触发小球与防平保护；
   - **降级悬崖死磕 (`RELEGATION_DESPERATION`)**：客队深陷降级区死磕防守时，深盘穿盘阻力增加。

6. **动态半场进球动力学比例 (`getDynamicHalfRatio`)**：
   - 废除固定 $0.44$ 常数，解析双方历史真实的 $0\sim 45$ 分钟进球占比分布，在 $[0.35, 0.52]$ 区间动态测算半场大小球与半场让球。

7. **数据资产完备度分级与 EV 削顶风控 (`evaluateDataCompleteness`)**：
   - `FULL_A`（首发+足量交锋+近期战绩+积分榜）：允许 `HIGH` 置信度，EV 上限 $35.0\%$；
   - `STANDARD_B`（基础战绩）：限制 `MEDIUM` 置信度，EV 削顶上限 $22.0\%$；
   - `DEGRADED_C`（严重缺失）：降级为 `LOW` 置信度，EV 强制限幅 $\le 8.0\%$，防范虚假暴击推荐。

### 4.3 滚球动量物理推演链路 (`calculateLiveQuantAnalysis`)
针对滚球进行中（`minute > 0`）比赛：
1. **物理威胁指数 (UPTS) 计算**：
   $$\text{Threat} = \text{ShotsOnTarget} \times 3.5 + (\text{Shots} - \text{ShotsOnTarget}) \times 1.0 + \text{DangerousAttacks} \times 0.4 + \text{Corners} \times 0.8$$
2. **实战格局定性**：
   - 识别 `STERILE_POSSESSION`（控球率 $\ge 65\%$ 但 0 射正，定性为无效传控，强制削减破门与穿盘期望）；
   - 识别 `HOME_DOMINANT` / `AWAY_DOMINANT`（压制）与 `ATTRITION_BATTLE`（中场泥潭）；
3. **剩余时间期望进球积分与盘口穿透推演**：
   - 结合剩余时间与转化速率，实时计算剩余期望进球及即时让球盘覆盖概率。

---

## 5. 阶段四：Prompt 构造、极简分片与导出层

当需要进行 AI 深度综合研判时，系统通过后端路由将量化数据与基本面数据打包导出为标准化 Prompt。

### 5.1 导出接口与模式 (`POST /api/ai/export-prompt`)
支持三种导出模式：
1. `prematch`：赛前比赛深度研判 Prompt；
2. `live`：滚球闪击决策 Prompt；
3. `mixed_parlay`：赛前/滚球跨模式高质量串关 Prompt。

### 5.2 极简高密度 Payload 构造 (`server/services/promptSlimPayload.ts`)
- **剔除冗余字段**：剔除调试镜像、环境审计、非关键气象描述；
- **保留关键要素**：
  - 比赛基础信息（北京时间、YBTY 原始队名、比分、校验状态）；
  - 精炼技术统计与聚焦事件（黄红牌、点球、进球、近期进攻压迫总结）；
  - 核心盘口与挂盘选项（带唯一 `option_id`、盘口线、赔率）；
  - 机器量化先验建议（主盘口、泊松期望进球、去水概率与 EV）。

### 5.3 智能分片与 Token 预算控制 (`server/services/promptChunking.ts`)
- 系统按序列化后的字节大小而非单纯场次进行动态分片；
- 确保单个 Prompt 分片适配大语言模型最佳推理上下文，避免触发输出截断。

### 5.4 双向双边择优与显式 +EV 注入规范 (v3.3.0)
- **消除单边主队死板锚定**：在 Payload 中注入双边独立定价评估指令（Dual-side Evaluation），强制 AI 对 Option 1（上盘/大球）与 Option 2（下盘/小球）进行独立 EV 测算，并在 `market_assessments` 中输出最高正向投资价值方。
- **显式 +EV 与机构隐含率**：必须在 AI 输出结构中严格回传 `implied_probability` 与 `value_edge`。
- **四分之一盘微积分折算与联赛 DNA 贝叶斯平滑**：严格依照微积分期望公式计算半赢/半亏期望，并对南美慢节奏赛事进行基准回拉平滑。

---

## 6. 阶段五：AI 评估结果回流与双重仲裁

AI（Gemini API 或 Gemini 网页端 Gem）针对 Prompt 输出符合 `football_market_audit_v2` 规范的结构化 JSON。

### 6.1 结果导入与解析 (`POST /api/ai/import-evaluation`)
- 客户端将 JSON 粘贴或由 API 自动提交至 `geminiEvaluationService.ts`；
- 执行 JSON 语法自愈修复（容忍缺少逗号、尾部多余逗号等）。

### 6.2 市场白名单严格核验 (`server/services/verifiedMarketAssessment.ts`)
为杜绝大模型的“幻觉盘口”或改写赔率，后端执行强制校验：
1. **Option ID 绝对核对**：AI 输出的每一项建议，其 `market_option_id` 必须存在于该比赛的 YBTY 白名单中；
2. **盘口与赔率一致性验证**：AI 建议的盘口线与赔率必须与 YBTY 原始挂盘完全一致；
3. **比分安全门禁**：若比分未核验通过，系统强制将推荐状态降为 `avoid / NO_BET`；
4. **评级门禁**：只有真实市场且评级达到 A/B 级、且通过全部核验的推荐，方可标记 `verification_passed = true`。

---

## 7. 阶段六：正式推荐台账与赛后复盘

1. **写入推荐台账**：通过核验的正式建议被记录至 `output/recommendation_ledger.json`；
2. **串关去重与风控**：严格执行风控协议（B 级同一方向最多进 1 组串关，A 级最多进 2 组）；
3. **赛后自动结算与复盘**：
   - 滚球大小球按推荐后**剩余进球**结算；
   - 滚球让球盘按推荐后**双方新增进球**结算；
   - 严格处理四分之一盘口（赢半、输半、走盘）；
   - 输出复盘报告（如 `reports/` 目录），计算正式命中率与盈亏曲线，驱动模型持续校准。

---

## 8. 核心代码与文件速查表

| 功能模块 | 前端核心文件 | 后端核心服务 / 脚本 |
|---|---|---|
| 数据导入与预解析 | `src/components/ExportDataView.tsx`<br>`src/lib/leisuInterfaceImport.ts` | `server/routes/batchSupplementRoutes.ts` |
| 赛事对齐与标准化 | `src/utils/dataAdapter.ts` | `server/services/canonicalMatchModel.ts`<br>`scripts/python/football_live.py` |
| 比分交叉校验 | `src/lib/scoreValidation.ts` | `server/services/scoreValidation.ts` |
| 机器量化预测引擎 v2.0 | `src/lib/machineQuantPrediction.ts`<br>`src/lib/quarterSettlement.ts` | `server/services/advancedTacticalQuantitativeEngines.ts` |
| 前端推演看板呈现 | `src/components/BettingRecommendationsView.tsx` | `server/routes/aiReadRoutes.ts` |
| Prompt 构造与导出 | `src/components/ExportDataView.tsx` | `server/services/promptSlimPayload.ts`<br>`server/services/promptChunking.ts` |
| AI 回流与白名单核验 | `src/components/AiImportModal.tsx` | `server/services/geminiEvaluationService.ts`<br>`server/services/verifiedMarketAssessment.ts` |
| 台账记录与赛后复盘 | `src/components/LedgerView.tsx` | `record_formal_recommendation.py`<br>`review_formal_recommendations.py` |

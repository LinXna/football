# 足球量化评估系统：全新重构技术架构与全链路运行规范

> **版本**：v2.0.0 (Layer 00 ~ Layer 03 双路全链路端到端定稿版)  
> **更新时间**：2026-08-30  
> **定位**：重构系统的唯一事实来源（Single Source of Truth），定义全链路单向数据流、6大模块职责边界、标准数据契约、37 项博弈量化算法标准与端到端初筛流水线。

---

## 一、系统全生命周期单向数据流拓扑 (Unidirectional Pipeline)

系统数据严格按照单向依赖流转，禁止任何反向数据污染：

```
[Layer 00: 00_common]              ── 全局基础设施（高精度链路跟踪 Tracer、数据缺陷收集器 DeficitCollector、全局枚举与异常）
               │
               ▼
[Layer 01: 01_data_ingestion]      ── 原始数据采集、字段清洗与比分真实性校验 (YBTY 滚球/早盘 + 雷速全维度接口)
               │
               ▼
[Layer 02: 02_canonical_model]     ── 标准赛事契约建立、球队/联赛别名解析与双轨数据对齐 (CanonicalMatch / AiBrief)
               │
               ▼
[Layer 03: 03_quant_engine]        ── 37 项确定性物理攻防量化、Shin 知情交易者去抽水、Forward 泊松时间衰减与 EV 仲裁 (Pure Math)
               │
               ▼
[Layer 04: 04_ai_evaluator]        ── 精简高密度 Prompt 构造 (AiBrief+Quant)、Gemini 博弈评估与严格盘口校验
               │
               ▼
[Layer 05: 05_portfolio_risk]      ── +EV 准入过滤、串关相关性风控与正式台账原子持久化 (recommendation_ledger.json)
               │
               ▼
[Layer 06: 06_settlement_audit]    ── 四分之一盘口/滚球 0:0 净胜精确核销、无偏回测报表与硬拦截规则沉淀
```

---

## 二、六大模块职责边界与物理目录规范

每个模块作为一个完全独立的工程子目录，对外仅暴露清晰的入参和出参函数，严禁跨模块私自访问内部实现细节。

| 模块目录 | 核心职责 | 准入要求 (Input) | 交付产物 (Output) | 严禁行为 (Forbidden) |
| :--- | :--- | :--- | :--- | :--- |
| `00_common/` | 全局基础设施、链路跟踪与全生命周期数据缺陷收集 | 跨层级事件与上下文 | `Tracer`, `DeficitCollector`, `enums.ts`, `errors.ts` | 严禁引入业务层向下依赖 |
| `01_data_ingestion/` | 负责 YBTY 原始盘口数据与雷速攻防数据的解析、去重与比分可信度校验 | 原始 JSON / 扩展抓取快照 | 干净的 Ingress Snapshot 及比分污点标记 | 严禁在此层做主观赔率转换或赔率替代 |
| `02_canonical_model/` | 实体对齐与唯一标准数据转换（`CanonicalMatch`）及极简 AI 提炼包 (`AiEvaluationBrief`) | 清洗后的 Ingress 数据 | 统一的 `CanonicalMatch` 与 `AiEvaluationBrief` | 严禁用雷速盘口覆盖 YBTY 法定盘口 |
| `03_quant_engine/` | 37 项确定性量化特征提取、Shin 去抽水公允概率、滚球 0:0 泊松推演与 +EV 评估 | `CanonicalMatch` 标准数据 | 结构化特征集 `QuantitativeFeatures` | 严禁包含副作用，严禁篡改入参 |
| `04_ai_evaluator/` | 大模型高密度 Prompt 组装、安全调用与评估结果严格校验 | 精简特征 Payload (`AiBrief` + `Quant`) | 结构化评估结果（公允概率/EV/置信度） | 严禁输出与 YBTY 盘口未对齐的幻觉盘口 |
| `05_portfolio_risk/` | 投资组合准入（+EV）、串关风控及台账原子文件锁写入 | 评估结果与风险规则 | 正式推荐记录 `formal_ai_recommendation` | 严禁未通过风控的推荐直接入账 |
| `06_settlement_audit/` | 赛后精准核销（四分之一盘/滚球净胜）、历史回测与规则沉淀 | 完赛比分与正式台账 | 回测报表与硬拦截规则补丁 | 严禁将未验证比分的比赛计入正式胜率 |

---

## 三、标准数据契约权威定义 (Canonical Data Contracts & SSOT)

全系统核心强类型契约集中维护，完整字段与业务语义详见 [`refactor/DATA_SPECIFICATION.md`](./DATA_SPECIFICATION.md)：

1. **YBTY 盘口契约 (`refactor/01_data_ingestion/ybty/types.ts`)**：
   - 滚球盘口 (`ParsedYbtyLiveMatch`) 与赛前盘口 (`ParsedYbtyPrematchMatch`)；
   - 包含主盘、副盘让球 (`full_spread_main` / `full_spread_subs`)、大小球 (`full_total_main` / `full_total_subs`) 与独赢 (`full_h2h`)。
2. **雷速基本面与时序契约 (`refactor/01_data_ingestion/leisu/types.ts`)**：
   - 包含 8 大攻防技术统计 (`ParsedLeisuStats`)、分钟级压迫动量波形 (`ParsedLeisuMomentum`)、正向时序事件 (`ParsedLeisuTimelineEvent`)、阵容阵型 (`ParsedLeisuLineup`)、联赛积分榜 (`ParsedLeagueStandings`) 与进球时段分布 (`ParsedGoalDistribution`)。
3. **统一标准赛事契约 (`refactor/02_canonical_model/types.ts`)**：
   - 全系统核心实体模型 **`CanonicalMatch`**：以 YBTY 原始数据为第一法定执行源，融合雷速增强包与比分校验状态，纯净未计算；
   - 极简 AI 提炼包 **`AiEvaluationBrief`**：面向大模型的高密度提纯载体 (200~400 tokens/场)。
4. **确定性量化特征契约 (`refactor/03_quant_engine/types.ts`)**：
   - 全系统 37 项不可变量化要素模型 **`QuantitativeFeatures`**：纯数学求解，涵盖 BDI 战场统治权指数、5m/10m/15m 动量斜率与 AUC 梯形积分、xT 真实威胁代理、Forward 泊松 0:0 剩余推演、Shin 知情交易者去抽水与全盘口复合 EV。

---

## 四、核心博弈量化算法与让球符号规范 (Mathematical & Domain Laws)

### 1. 亚洲让球盘 (Asian Handicap) 符号与数值权威定义 (SSOT)
- **雷速浮点数值 `line` 规范**：
  - `line > 0`（如 `+0.25`, `+0.5`, `+1.0`）：**主让**（主队让球方，对应 YBTY `"-0/0.5"`, `"-0.5"`, `"-1.0"`）；
  - `line < 0`（如 `-0.25`, `-0.5`, `-1.0`）：**主受让**（客队让球方，对应 YBTY `"+0/0.5"`, `"+0.5"`, `"+1.0"`）；
  - `line = 0`：**平手盘**（互不让球，对应 YBTY `"0"` / `"0.0"`）。

### 2. 滚球即时时钟权威来源与雷速时间轴准则 (Live Clock SSOT & Timeline Integrity)
- **YBTY 是滚球即时时钟的唯一法定事实来源 (SSOT)**：
  - 交易盘口产生在 YBTY 端，计算剩余比赛时间、衰减率（Decay Rate）和泊松期望（Forward Poisson）的即时分钟 `live_minute` **必须严格且唯一从 `ybty.clock` 解析**（如 `"62:25"` $\rightarrow$ `62`）；中歇期锁定为 `45`；赛前固定为 `null`。
- **严禁将雷速 `text_live` 文字直播时间当成比赛当前进行的时间标签**：
  - 雷速的 `text_live`（文字直播）中的时间标签（如 `time: "63'"`）是**离散历史事件发生时刻 (Event Incident Timestamp)**，绝对不是连续滚动的当前比赛时钟！若比赛过去 10 分钟无重大事件，最新文字直播时间将严重滞后；
  - **严禁任何模块、任何算法、任何解释使用 `text_live` 倒推或代表比赛即时进行分钟**。
- **雷速端时间轴交叉印证的唯一合法途径**：
  - 如需在雷速端交叉校验比赛进行时间轴，**只能且必须使用动量走势点阵长度 (`attack_momentum_timeline.data`)**（上半场点数 + 下半场点数 = 雷速采集的进行分钟数）。

### 3. 滚球让球盘 0:0 实时重置模型 (Live 0:0 Reset Rule)
- 滚球让球盘必须基于“推荐时刻双方比分重置为 0:0”计算后续时段净胜期望 $\Delta G = (\text{Final}_{\text{home}} - \text{LiveRec}_{\text{home}}) - (\text{Final}_{\text{away}} - \text{LiveRec}_{\text{away}})$。
- 严禁使用全场已发生比分或完场比分直接减让球线！

### 4. 纯 Forward 泊松推演与绝境搏命非线性时间衰减模型 (Poisson Time-Decay)
- **剩余时间比例**：$\tau = \max\left(0, \frac{90 - t}{90}\right)$
- **绝境搏命非线性修正因子 (含先验实力不对称性 `priorStrengthRatio`)**：
  - 临近终场（$t \ge 75$）且比分仅落后 1 球（如 $0-1$ 或 $1-2$）时，落后方将采取全员压上进攻战术。强队落后获得最高 2.0 倍搏命乘子，弱队落后被压缩至 0.5，符合真实物理不对称性：
  $$\kappa_{\text{behind}} = 1.0 + 0.35 \times \left(\frac{t - 75}{15}\right) \times \text{MUI}_{\text{behind}} \times \text{StrengthRatio}$$
  $$\lambda_{\text{behind\_rest}} = \lambda_{\text{base}} \times \tau \times \kappa_{\text{behind}}$$
- **Dixon-Coles 修正二维网格联合分布 ($\rho = 0.05$)**：
  - 独立泊松会导致极低比分平局概率被严重低估，系统引入 Dixon-Coles $\rho$ 修正：
  $$P(X = x, Y = y) = \tau(x, y, \rho) \times \frac{\lambda_H^x e^{-\lambda_H}}{x!} \times \frac{\lambda_A^y e^{-\lambda_A}}{y!}, \quad (x, y \in [0, 8])$$
- **剩余胜平负概率**：
  $$P(\text{HomeWin}_{\text{rest}}) = \sum_{x > y} P(x, y), \quad P(\text{Draw}_{\text{rest}}) = \sum_{x = y} P(x, y), \quad P(\text{AwayWin}_{\text{rest}}) = \sum_{x < y} P(x, y)$$

### 5. Shin 知情交易者去抽水模型与联合盘口数值反演 (Shin De-Vig & Joint Market Inversion)
- **Shin 去抽水**：考虑市场存在内幕交易者占比 $z \in [0, 0.4]$，通过牛顿迭代法精确解耦 1X2 欧赔真实概率。
- **联合反演与混合贝叶斯收缩**：
  - 不再将四分之一盘伪装为二元赔率，而是以统一泊松盘口概率作为唯一目标函数，联合拟合 1X2、亚洲让球与大小球，提取市场隐含进球期望 $\lambda_{\text{mkt}}$。
  - **贝叶斯先验融合**：删除了盲从的 `CONSENSUS_ALIGNED` 规则，采用 85% 盘口反演 $\lambda_{\text{mkt}}$ 与 15% 理论先验 $\lambda_{\text{theory}}$ 的混合贝叶斯收缩，得出基准进球期望。

### 6. 亚洲四分之一盘复合期望与半赢半输精确结算
- 对于四分之一盘（如 `-0/0.5` 即 $-0.25$ 盘），其期望价值与胜率由相邻两个半整数盘等权复合：
  $$\text{EV}_{-0.25} = 0.5 \times \text{EV}_{0.0} + 0.5 \times \text{EV}_{-0.5}$$
  - 当发生净胜差值 $D = 0$ 时（0:0 走水）：平手半注退还本金（$\text{Profit} = 0$），半球半注输半（$\text{Profit} = -0.5$），整体净盈亏为 $-0.5$。
  - 当发生净胜差值 $D = +0.5$ 时：全赢（$\text{Profit} = \text{Odds} - 1$）。

### 7. 战局势能与关键事件因果共生分析模型 (Event-Momentum Co-Evolution Model)
- **攻防势能转化指数 (EPI)**：
  - 将 15 分钟危攻积分能量 $\text{AUC}_{15m}$ 与实质性进攻威胁事件（射门/射正/角球/红黄牌）加权求和，计算转化效率比率 $\text{EPI} = \frac{\text{EventThreatWeight}}{\text{MomentumAUC}_{15m}}$；
  - 自动解耦并识别出【真实致命围攻 `LETHAL_SIEGE`】、【无效控球虚火 `BARREN_DOMINANCE`】与【刺客高效反击 `CLINICAL_COUNTER`】；
- **战术相变因果评估 (Tactical Regime Shift)**：
  - 捕捉红牌动态半衰期（受罚初期防守韧性 `RED_CARD_RESILIENCE` vs 15 分钟后阵型崩盘 `RED_CARD_COLLAPSE`）、连续失球引发的恐慌性溃散 (`COLLAPSING_PANIC`)、领先后稳健收缩 (`LEADING_CONSOLIDATION`) 与盲目压上防反破绽 (`VULNERABLE_OVEREXTENSION`)；
  - 实时输出动态进球期望乘子 $\text{regime\_multiplier}_{\text{home/away}}$，注入并修正 Forward 泊松剩余进球期望 $\lambda_{\text{rest}}$；
- **破门临界态探测 (Goal Climax Tipping Point)**：
  - 结合二阶动量加速度 $\frac{d^2M}{dt^2} = (\text{slope}_{5m} - \text{slope}_{15m})$ 与尾端事件密集度，计算 0~100 破门临界得分；临界触发时自动联动 `IMMINENT_GOAL` 相变警报与风控拦截。

---

## 五、Layer 00 ~ Layer 03 双路运行流水线全貌 (Dual-Track Architecture)

```
[原始抓取文件 / Ingress Snapshots]
  │
  ├──► 【滚球通路 Live Track】
  │      1. ybtyLiveExtractor -> 解析 YBTY 滚球盘口与即时 clock
  │      2. leisuInterfaceExtractor -> 解析雷速即时 stats、attack_momentum 波形、文字直播
  │      3. matchAligner -> 实体对齐 (支持拼音别名与主客颠倒反装拦截)
  │      4. canonicalMatchAssembler -> 组装 CanonicalMatch (LIVE 阶段、比分画布校验)
  │      5. calculateQuantitativeFeatures (Layer 03) ->
  │           - M1: L0 致命比分冲突/缺失时钟熔断
  │           - M2: 实时上下文清洗与战力折损
  │           - M3: 5m/10m/15m OLS 斜率 + AUC 梯形积分 + xT 压迫指数
  │           - M3.5: 战局势能与关键事件因果共生分析 (EPI 转化 + 战术相变乘子 + 破门临界探测)
  │           - M4: 滚球 0:0 重置 Forward 泊松网格推演 + 战术相变与绝境搏命修正
  │           - M5: Shin 去抽水 + 闭式双变量泊松网格让球/大小球 +EV 评估与 Kelly 仓位
  │           - M6: 统帅部生成 BDI (-100~+100)、GoalPhaseAlert 与 98/100 综合置信度
  │      6. 输出机器初筛结果：WATCH (置信度>=80 & +EV) / RESEARCH (置信度>=60) / REJECTED
  │
  └──► 【早盘通路 Prematch Track】
         1. ybtyPrematchExtractor -> 解析 YBTY 赛前盘口与北京时间开赛时间
         2. leisuInterfaceExtractor -> 解析雷速赛前历史交锋、积分榜、进球时段、伤停名单
         3. matchAligner -> 赛前赛事匹配与对齐
         4. canonicalMatchAssembler -> 组装 CanonicalMatch (PREMATCH 阶段、minute=null)
         5. calculateQuantitativeFeatures (Layer 03) ->
              - M1: 赛前基础数据完整度校验
              - M2: H2H 时间半衰期指数衰减 ($\lambda = \frac{\ln 2}{730}$) + LIS 伤停战力折损 + MUI 战意周期
              - M3: 物理基线均值化 (赛前阶段动量豁免解耦)
              - M3.5: 赛前默认均衡战术态势
              - M4: 赛前 90 分钟泊松全量攻守推演
              - M5: 赛前欧指/让球/大小球 Shin 去抽水与 +EV 挖掘
              - M6: 统帅部生成综合赛前量化特征与初筛等级
         6. 输出机器初筛结果：WATCH / RESEARCH / REJECTED
```

---

## 六、系统测试与全链路回归规范 (Testing & Verification)

全系统必须由严格的自动化测试套件提供 100% 质量屏障：
1. **基础组件测试**：`verify_common_infrastructure.ts` (Layer 00)
2. **数据接入测试**：`verify_ybty_live_extractor.ts`, `verify_ybty_prematch_extractor.ts`, `verify_leisu_interface_extractor.ts` (Layer 01)
3. **标准模型测试**：`verify_canonical_match_assembler.ts` (Layer 02)
4. **量化引擎全覆盖测试**：`verify_quant_engine.ts` (Layer 03 - 7 大核心模块 M1~M6 及 M3.5 共生引擎)
5. **双路全链路端到端集成测试**：`verify_full_pipeline_00_03.ts` (Layer 00 ~ 03 贯通测试)

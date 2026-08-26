# 足球量化评估系统：全新重构技术架构与全链路运行规范
> **版本**：v1.0.0 (初始草案 - 随各模块设计与讨论持续同步演进)  
> **更新时间**：2026-08-23  
> **定位**：重构系统的唯一事实来源（Single Source of Truth），定义全链路单向数据流、6大模块职责边界、标准数据契约与博弈量化算法标准。

---

## 一、系统全生命周期单向数据流拓扑 (Unidirectional Pipeline)

系统数据严格按照单向依赖流转，禁止任何反向数据污染：

```
[Layer 1: 01_data_ingestion]      ── 原始数据采集、字段清洗与比分真实性校验 (YBTY / 雷速)
              │
              ▼
[Layer 2: 02_canonical_model]     ── 标准赛事契约建立、球队别名解析与双轨数据对齐 (CanonicalMatch)
              │
              ▼
[Layer 3: 03_quant_engine]        ── 确定性物理攻防量化、去抽水公允赔率、泊松时间衰减推演 (Pure Math)
              │
              ▼
[Layer 4: 04_ai_evaluator]        ── 精简高密度 Prompt 构造、Gemini 博弈评估与严格盘口校验
              │
              ▼
[Layer 5: 05_portfolio_risk]      ── +EV 准入过滤、串关相关性风控与正式台账原子持久化
              │
              ▼
[Layer 6: 06_settlement_audit]    ── 四分之一盘口/滚球让球精确核销、无偏回测与硬拦截规则沉淀
```

---

## 二、六大模块职责边界与物理目录规范

每个模块作为一个完全独立的工程子目录，对外仅暴露清晰的入参和出参函数，严禁跨模块私自访问内部实现细节。

| 模块目录 | 核心职责 | 准入要求 (Input) | 交付产物 (Output) | 严禁行为 (Forbidden) |
| :--- | :--- | :--- | :--- | :--- |
| `01_data_ingestion/` | 负责 YBTY 原始盘口数据与雷速攻防数据的解析、去重与比分可信度校验 | 原始 JSON / 扩展抓取快照 | 干净的 Ingress Snapshot 及比分污点标记 | 严禁在此层做主观赔率转换或赔率替代 |
| `02_canonical_model/` | 实体对齐与唯一标准数据转换（`StandardMatchData`） | 清洗后的 Ingress 数据 | 统一的 `CanonicalMatch` 实体模型 | 严禁用雷速盘口覆盖 YBTY 法定盘口 |
| `03_quant_engine/` | 确定性量化特征提取、剥水公允概率、剩余进球期望泊松推演 | `CanonicalMatch` 标准数据 | 结构化特征集 `QuantitativeFeatures` | 严禁包含副作用，严禁篡改入参 |
| `04_ai_evaluator/` | 大模型高密度 Prompt 组装、安全调用与评估结果严格校验 | 精简特征 Payload | 结构化评估结果（公允概率/EV/置信度） | 严禁输出与 YBTY 盘口未对齐的幻觉盘口 |
| `05_portfolio_risk/` | 投资组合准入（+EV）、串关风控及台账原子文件锁写入 | 评估结果与风险规则 | 正式推荐记录 `formal_ai_recommendation` | 严禁未通过风控的推荐直接入账 |
| `06_settlement_audit/` | 赛后精准核销（四分之一盘/滚球净胜）、历史回测与规则沉淀 | 完赛比分与正式台账 | 回测报表与硬拦截规则补丁 | 严禁将未验证比分的比赛计入正式胜率 |

---

## 三、标准数据契约草案（待确认与讨论）

*(本节将在接下来的“数据确认讨论”中逐步填入定稿的 TypeScript 强类型定义)*

- **YBTY 盘口契约**：定义滚球/赛前独赢、让球、大小球的原始字段与赔率格式。
- **雷速攻防与基本面契约**：定义危攻时序、射正、控球、红黄牌、首发阵型、伤停状态的标准格式。
- **统一赛事契约 (`CanonicalMatch`)**：系统全链路流转的唯一核心数据接口。

---

## 四、核心博弈量化算法与让球符号规范 (Mathematical & Domain Laws)

### 1. 亚洲让球盘 (Asian Handicap) 符号与数值权威定义 (SSOT)
- **雷速浮点数值 `line` 规范**：
  - `line > 0`（如 `+0.25`, `+0.5`, `+1.0`）：**主让**（主队让球方，对应 YBTY `"-0/0.5"`, `"-0.5"`, `"-1.0"`）；
  - `line < 0`（如 `-0.25`, `-0.5`, `-1.0`）：**主受让**（客队让球方，对应 YBTY `"+0/0.5"`, `"+0.5"`, `"+1.0"`）；
  - `line = 0`：**平手盘**（互不让球，对应 YBTY `"0"` / `"0.0"`）。

### 2. 滚球让球盘 0:0 实时重置模型 (Live 0:0 Reset Rule)
- 滚球让球盘必须基于“推荐时刻双方比分重置为 0:0”计算后续时段净胜期望 $\Delta G = (\text{Final}_{\text{home}} - \text{LiveRec}_{\text{home}}) - (\text{Final}_{\text{away}} - \text{LiveRec}_{\text{away}})$。
- 严禁使用全场已发生比分或完场比分直接减让球线！

### 3. 纯 Forward 泊松推演与时间衰减模型 (Poisson Time-Decay)
- 基于比赛剩余时间 $90 - t$、现场危攻斜率与攻守强度动态推导剩余进球期望 $\lambda_{\text{home\_rest}}, \lambda_{\text{away\_rest}}$，杜绝由比分预测倒推大小球。

### 4. 公允赔率与 +EV 价值计算 (Shin / Proportional De-Vig)
- 采用标准剥水算法剥除庄家 Overround，计算无偏公允概率 $P_{\text{fair}}$ 与真实期望价值 $\text{EV} = P_{\text{fair}} \times \text{Odds} - 1$。

### 5. 精确核销判定公式 (Exact Settlement Formula)
- 设净胜差值 $D = \Delta G - \text{line}$（以投注主队为例）：
  - $D \ge +0.5 \implies$ `WIN` (全赢)
  - $D = +0.25 \implies$ `HALF_WIN` (赢半)
  - $D = 0 \implies$ `PUSH` (走水)
  - $D = -0.25 \implies$ `HALF_LOSS` (输半)
  - $D \le -0.5 \implies$ `LOSS` (全输)


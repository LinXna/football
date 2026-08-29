# AI 编码行为准则与反技术债务法典 (AI Coding Standards & Anti-Tech-Debt Rules)

> **版本**：v1.0.0  
> **更新时间**：2026-08-23  
> **作用域**：全系统重构体系 (`/refactor/`) 及后续所有 AI/工程师开发行为  
> **最高原则**：本法典是系统开发的“最高宪法”。任何 AI 在进行任何修改、编写代码或执行重构前，必须无条件严格遵守本法典的全部条款。

---

## 第一章：会话生命周期与主动截断控制 (Session Lifecycle & Truncation)

### 1.1 任务单点聚焦原则 (Single-Task Focus)
- **硬性约束**：单次会话只聚焦并解决 1 个明确的原子任务（如“定义标准赛事契约”或“实现泊松进球期望计算”）。
- **禁止行为**：严禁在单次回话中跨模块发散、同时展开多个未决事项，或未经确认一次性重写多个不相关模块。

### 1.2 主动截断机制 (Proactive Session Truncation)
- **触发条件**：当一个原子步骤完成、代码通过自测并已落盘更新进度看板后，当前会话的上下文使命即告完成。
- **强制操作**：AI 必须主动提示用户：“*本原子任务已完成并归档，建议开启新会话以节省 Token 并重置上下文注意力，新会话将通过冷启动协议无缝接续。*”

### 1.3 零提示冷启动恢复协议 (Zero-Prompt Cold-Start Recovery)
- **机制**：新会话开启时，AI 无需依赖冗长的历史聊天记录，必须在执行任何行动前自动调用工具完整读取以下三份文档：
  1. `refactor/AI_CODING_STANDARDS_AND_RULES.md`（行为准则）
  2. `refactor/HANDOVER_AND_PROGRESS.md`（实时快照与进度）
  3. `refactor/SYSTEM_ARCHITECTURE_AND_PIPELINE.md`（架构与数据契约）
- **恢复耗时与成本**：在 <5k Tokens 消耗内实现 100% 系统上下文还原。

---

## 第二章：工作快照与断点续传工作流 (Snapshot-First & Atomic Workflow)

任何对代码库的改动必须严格遵循 **“四步闭环工作流”**：

```
[步骤 1: 登记快照 (IN_PROGRESS)] ──> [步骤 2: 影响面核查] ──> [步骤 3: 原子编码与自测] ──> [步骤 4: 闭环归档 (DONE)]
```

### 2.1 动代码前：登记活动快照 (Pre-Execution Snapshot)
- 在编辑任何代码文件前，必须先在 `refactor/HANDOVER_AND_PROGRESS.md` 的 `【当前活动工作快照 (Active Snapshot)】` 区域登记：
  - **任务目标 (Goal)**：本次要解决的明确问题；
  - **改动文件清单 (Target Files)**：精确到具体文件路径；
  - **执行步骤 (Action Plan)**：明确的 1、2、3 步骤；
  - **状态标记 (Status)**：设为 `IN_PROGRESS`。

### 2.2 严格按步骤执行 (In-Execution Compliance)
- 严格对照快照中的清单修改，严禁超出快照范围随意修改其他无关文件。

### 2.3 完成后：闭环验证与状态归档 (Post-Execution Checkpoint)
- 编写代码并完成本地单测/语法类型检查后，必须立即更新 `HANDOVER_AND_PROGRESS.md`：
  - 将状态标记为 `DONE`；
  - 记录交付产出物及验证结果；
  - 将“下一步待办”清晰列出。

### 2.4 异常中断恢复机制 (Crash/Interruption Recovery)
- 若会话因 Token 耗尽、网络超时或异常报错中断，下一任接管的 AI 必须先读取 `HANDOVER_AND_PROGRESS.md` 中处于 `IN_PROGRESS` 的快照，判断当前进度并进行断点续传或干净回滚，杜绝系统留下半成品脏状态。

---

## 第三章：代码质量与反技术债务法则 (Anti-Tech-Debt Core Laws)

### 3.1 探究根因法则，严禁表面补丁 (Root Cause First, No Surface Patches)
- **禁止行为**：禁止在数据消费端（如 UI 组件、API 路由外层）直接通过 `try-catch { fallback }`、`data || {}`、`as any` 等手段掩盖上游数据异常。
- **强制要求**：发现数据缺失或类型报错，必须逆向追溯到数据流入的最早源头（Ingestion / Parser 层）进行根治，确保进入系统的数据流绝对纯净。

### 3.2 单一事实来源与零重复 (Single Source of Truth / DRY)
- **禁止行为**：
  - 严禁在多个文件中定义结构相似的 `interface Match` 或 `interface Odds`；
  - 严禁为了“做个新版”而新建 `xxx_v2.ts`、`xxx_new.ts` 或临时过渡文件；
  - 严禁把通用计算逻辑在前端和后端各写一份。
- **强制要求**：全系统同类业务实体、接口契约与核心计算函数只能存在唯一权威定义，其他地方一律通过模块引用。

### 3.3 先删后写与零废弃代码 (Boy Scout Rule & Dead Code Elimination)
- **禁止行为**：严禁在代码库中保留 `// legacy`、`// deprecated`、`// old logic for backup` 等废弃代码。
- **强制要求**：引入新方案或重构现有函数时，必须同步物理删除被替代的旧代码及其全部无用引用，代码库中不允许存在任何死代码。

### 3.4 纯函数与无副作用原则 (Pure Functions & No In-Place Mutation)
- **禁止行为**：严禁在量化分析、特征提取或赔率计算函数内部直接修改传入的入参对象（In-Place Mutation）。
- **强制要求**：所有核心算法函数必须为纯函数（Pure Functions），输入不可变对象，返回新的计算结果，确保逻辑具备 100% 的可测试性与可复现性。

---

## 第四章：爆炸半径控制与最小修改原则 (Blast Radius & Minimal Diff)

### 4.1 依赖影响面预查 (Pre-Change Dependency Audit)
- 在修改任何公共类型（Type/Interface）或共享工具函数前，必须全量检索工程中所有引用该定义的位置，确保修改后下游所有调用方均能无缝适配。

### 4.2 最小差异修改 (Minimal Diff Rule)
- 严禁在修改核心业务逻辑时进行无关的“全文件代码重格式化”、“随意调整函数排列顺序”或“批量重命名无关变量”。
- 每次 Git 变更必须极其纯粹，仅包含与当前任务严格相关的代码改动。

---

## 第五章：强类型防御与结构化可观测性 (Strict Typing & Observability)

### 5.1 零 `any` 与强类型守卫 (Zero-`any` & Strict Type Guards)
- **全工程禁止使用 `any`、`unknown`（未收敛时）以及 `// @ts-ignore`**。
- 严禁使用不安全的强制类型断言（如 `const match = data as CanonicalMatch`）。
- 外部输入的不确定数据必须通过运行时类型守卫（Type Guard Functions 或 Schema 校验器）验证通过后，方可赋予强类型并在系统内流转。

### 5.2 统一结构化日志与快速失败 (Structured Logging & Fail-Fast)
- 严禁使用随意的原生 `console.log("here")` 刷屏。
- 必须使用统一的结构化日志记录器，记录格式必须包含：`{ timestamp, module, action, level, payload }`。
- 底层遇到致命数据损坏或严重违反契约时，必须立即抛出明确的领域异常（Domain Error），禁止静默吞没错误。

---

## 第六章：自检验证与领域契约红线 (Self-Verification & Domain Integrity)

### 6.1 自检闭环要求 (Mandatory Self-Verification)
- AI 在声称任何任务完成并更新快照为 `DONE` 之前，必须执行并通过以下两道关卡：
  1. **静态检查**：代码无语法错误、无类型报错；
  2. **逻辑测试**：涉及核心量化算法与数据转换的代码，必须编写并运行单元测试，覆盖正常数据与边界异常用例。

### 6.2 领域契约绝对服从原则 (Domain Integrity Law)
- **严禁 AI 凭常识、通用大模型直觉或非标经验擅自发明或修改业务规则**。
- 所有关于盘口结算机制、滚球 0:0 重置净胜、泊松时间衰减推演、+EV 剥水计算等业务与数学标准，必须 100% 严格以 `refactor/SYSTEM_ARCHITECTURE_AND_PIPELINE.md` 中定义的规则为唯一准绳。

### 6.3 滚球即时时钟与雷速数据源物理边界硬性禁令 (Live Clock & Leisu Physical Boundary)
- **雷速 `text_live` 严禁充当时钟禁令**：
  - **严禁**将雷速 `text_live` 文字直播中的时间标签（如 `"63'"`）作为比赛正在进行的即时时间标签！文字直播时间仅代表离散历史事件发生时刻（Event Incident Time），存在天然无事件停滞与延迟；
  - 滚球即时比赛分钟数（`live_minute`）**唯一法定事实来源 (SSOT) 必须严格由 YBTY 盘口时钟 (`ybty.clock`) 解析**；
  - 雷速端若需印证比赛进行时间轴，**只能且必须使用动量走势点阵长度 (`attack_momentum_timeline.data`)**。任何违反此物理边界的代码与推论一律视为严重违规。

---

## 第七章：模块化枚举分类管理与公共基础设施抽离法典 (Modular Enums & Common Infrastructure)

> **最高约束**：后续所有参与本系统开发的 AI 与工程师必须严格遵守本章规定，严禁在业务子模块中写散乱、私有的特定异常或弹窗代码！

### 7.1 统一 `enums.ts` 命名与模块化分类维护规范 (Modular Categorized Enums)
- **子模块独立维护**：各业务子模块（如 `01_data_ingestion/leisu/`、`01_data_ingestion/ybty/`、`02_entity_matching/` 等）必须拥有专属的 `enums.ts` 文件，对其私有/特定领域枚举进行分类定义与集中维护。
- **全局跨模块枚举**：全链路通用的全局枚举（如推荐评级 `RecommendationGrade`、结算结果 `SettlementOutcome`）统一在 `00_common/enums.ts` 中维护。
- **全量受控管控**：所有涉及状态码、类型码、玩法类型的字段必须 100% 映射到对应的 `enums.ts` 中，严禁使用散落的魔术数字或魔法字符串。

### 7.2 异常捕获、弹窗告警与基础设施绝对抽离原则 (Common Error & Alert Bus)
- **严禁散乱私有异常代码**：严禁在各个业务子模块中散落私有的 `alert()`、私有弹窗状态机或私有未知类型收集 Map。
- **统一公共总线**：
  1. 所有未知枚举代码的捕获、记录与上报，必须统一调用 `refactor/00_common/errors.ts` 的 `commonEnumRegistry.recordUnknownEnum(...)`；
  2. 所有系统异常、业务校验失败与需要前端 UI 弹窗通知的事件，必须通过 `systemAlertBus.publish(...)` 广播给全局通知总线；
  3. UI 前端组件只需订阅 `systemAlertBus.subscribe(...)`，即可自动接收弹窗提示与日志流，实现业务逻辑与展示层彻底解耦。
- **违规判定**：任何 AI 若在重构代码中新增私有异常上报机制或绕过公共总线，直接判定为违反核心法典并视为重构失败。


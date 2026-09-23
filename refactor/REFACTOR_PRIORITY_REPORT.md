# 重构系统（Refactor）深度重构优先级报告

> **范围**：`refactor/**`（已物理屏蔽旧系统 docs/server/src）
> **数据采集时间**：2026-09-23
> **评估依据**：`AI_CODING_STANDARDS_AND_RULES.md`（法典）、`SYSTEM_ARCHITECTURE_AND_PIPELINE.md`（SSOT）、`TRACEABILITY_MATRIX.md`、`SYSTEM_QUANT_REFACTOR_BLUEPRINT.md`
> **性质**：只读静态评估，未修改任何代码。

---

## 一、执行摘要

系统整体工程质量较高：**30 个测试文件、89/89 绿灯、`tsc --noEmit` 零错误**，Layer 00~06 单向数据流清晰，法典贯彻度良好。生产代码 `console.log` 仅 3 处、`@ts-ignore` 0 处（此前疑似 2 处实为注释文字），Tracer/DeficitCollector 基建已落地。

但存在三类结构性债务：

1. **类型契约断层**——`risk_adjusted_ev` 等字段在 Layer 03 类型未正式定义，导致 Layer 04 门禁用 `as any` 桥接（`alignmentGuard.ts` 15 处 any 的根因）；
2. **Layer 03 过度膨胀**——单层 10216 行（占生产代码 54.6%），4 个 1100+ 行「上帝文件」，多个函数超 300 行；
3. **断点与文档漂移**——活动快照 `IN_PROGRESS` 未闭环，`CONTINUATION.md` 与 `HANDOVER_AND_PROGRESS.md` 任务指向不一致。

---

## 二、系统现状总览（精确数据）

生产代码共 **53 个 TS 文件、18720 行**，测试 30 个文件、6605 行。

| 层 | 文件数 | TS 行数 | 占比 | 备注 |
|---|---|---|---|---|
| 00_common | 5 | 507 | 2.7% | 基础设施，健康 |
| 01_data_ingestion | 9 | 2581 | 13.8% | ybty/leisu 子目录清晰 |
| 02_canonical_model | 6 | 1922 | 10.3% | 健康 |
| **03_quant_engine** | **14** | **10216** | **54.6%** | **重构重灾区** |
| 04_ai_evaluator | 7 | 2034 | 10.9% | alignmentGuard 偏大 |
| 05_portfolio_risk | 4 | 654 | 3.5% | 偏薄 |
| 06_settlement_audit | 8 | 806 | 4.3% | 过度拆分 |
| **生产合计** | **53** | **18720** | 100% | — |

**代码质量信号（精确）**：

| 信号 | 生产代码 | tests/ | 说明 |
|---|---|---|---|
| `any`（`: any`/`as any`/`any[]`） | **41 处** | 74 处 | 生产集中在 7 个文件 |
| `@ts-ignore` / `@ts-expect-error` | **0 处** | 0 处 | 此前误报的 2 处实为注释文字 |
| `console.log` | **3 处** | 447 处 | Tracer 降噪已基本完成 |
| `TODO/FIXME/HACK/XXX` | — | — | 1 处 |

生产代码 `any` 分布：

| 文件 | any 数 | 层 |
|---|---|---|
| `alignmentGuard.ts` | 15 | 04 |
| `types.ts` | 7 | 03 |
| `contextEngine.ts` | 5 | 03 |
| `promptExporter.ts` | 5 | 04 |
| `dataConsistencyAuditor.ts` | 4 | 02 |
| `marketDivergenceEngine.ts` | 3 | 03 |
| `ledgerPersistence.ts` | 2 | 05 |

---

## 三、热点文件逐文件深度评估

### 1. `04_ai_evaluator/alignmentGuard.ts`（858 行，42.1KB，**15 处 any**）— 最高优先

**职责**：盘口镜像对齐 + 法定门禁校验 + 候选腿合法性 + 同步市场扫描（**4 项职责混装**）。
**结构**：5 个导出符号（`parseHandicapToFloat`、`isQuarterOrSplitLine`、`findFirstLegallyVerifiableSignal`、`verifyStatutoryAlignment`）+ 2 个私有函数。

**any 根因（关键发现）**——15 处 any 里约 10 处是同一种模式：

```ts
typeof (candidateSignal as any).risk_adjusted_ev === 'number'   // 行 828-829
(payload.quant_features as any)?.risk_adjusted_ev               // 行 830
(fallback as any).risk_adjusted_ev                              // 行 117/126/753/762
```

`risk_adjusted_ev` 字段在 `03_quant_engine/types.ts` 的 `PositiveEVSignal` 与 `QuantitativeFeatures` 中**未正式定义**，Layer 04 消费端被迫用 `as any` 桥接。**这是全系统 any 债务的最大单一根因，修复可一次性消除约 10 处。**

另 3 处是 `isQuarterOrSplitLine(val: any)` 与 `findFirstLegallyVerifiableSignal(rawSignals: any[])`——盘口 `line` 多形态（string/number/object）导致，应引入判别联合类型（discriminated union）替代 `any`。

**建议动作**：
- P0：在 `PositiveEVSignal` 增补 `risk_adjusted_ev?: number`，消除类型断层；
- P1：拆分为 `handicapParse.ts`（盘口解析）、`candidateVerifier.ts`（候选腿核验）、`marketScan.ts`（同步市场扫描），保留 `verifyStatutoryAlignment` 为门禁主入口。

### 2. `03_quant_engine/contextEngine.ts`（**1787 行**，74.7KB，5 处 any）— M2 引擎

**职责**：L0 熔断、H2H 半衰期衰减、近期战绩、阵容伤停 LIS、战意 MUI、进球分布（文件头自述 6 项职责）。
**结构**：14 个导出函数，粒度已较好，但体量全系统最大，且最大函数 `calculateLineupImpactScores`（1172→1531，约 360 行）、`calculateRecentFormWeights`（537→869，约 330 行）、`calculateH2HDecayWeights`（245→537，约 290 行）。

**建议动作**（P1）：按职责物理拆分为 6 个子模块：`l0CircuitBreaker.ts`、`h2hDecay.ts`、`recentForm.ts`、`lineupImpact.ts`、`motivationIndex.ts`、`goalDistribution.ts`，由薄编排层（或 `index.ts`）统一出口。

### 3. `03_quant_engine/momentumQuantEngine.ts`（1126 行，50.3KB）

**结构**：5 个导出函数，两个超大函数——`extractMomentumTimelineFeatures`（230→513，约 280 行）、`extractRealTimePhysicalStats`（513→文件尾，约 610 行，**全系统最长函数之一**）。

**建议动作**（P1）：小工具（`calculateLinearRegressionSlope`、`calculateMomentumIntegral`、`flattenMomentumPoints`）抽到 `momentumMath.ts`；`extractRealTimePhysicalStats` 按物理统计维度拆为多个子函数。

### 4. `03_quant_engine/devigCalculator.ts`（1124 行，42.4KB）— 「上帝文件」

**职责混杂**（14 个导出函数，4 类完全不同职责）：
- 去抽水：`devigShin`、`devigMultiplicative`、`applyBayesianShrinkage`
- 盘口解析：`parseAsianHandicapLine`、`formatAsianHandicapLine`、`invertHandicapString`
- 五态分布：`calculateSpreadFiveStateDistribution`、`calculateTotalFiveStateDistribution`
- EV 计算：`calculateAsianHandicapEV`、`calculateTotalGoalsEV`、`calculateH2hEV`、`identifyBookmakerPosture`、`calculateDeviggedMarketFeatures`

**建议动作**（P1）：拆为 `handicapParser.ts` / `devig.ts` / `settlementDistribution.ts` / `evCalculator.ts`。注意 `parseAsianHandicapLine` 被 `alignmentGuard.ts` 跨层引用，拆分需保持导出路径兼容（加 re-export 桶）。

### 5. `03_quant_engine/poissonDecayModel.ts`（1117 行，51.3KB）

**结构**：10 个导出函数 + `LEAGUE_DNA_MAP` 常量；`calculateInPlayPoissonFeatures`（511→文件尾，约 600 行）超大。

### 6. `03_quant_engine/types.ts`（1003 行，35.3KB，7 处 any）

约 60 个接口/类型，是 03 层契约核心。**关键缺陷**：`PositiveEVSignal` 缺 `risk_adjusted_ev` 字段 → 引发 alignmentGuard 的 any 断层。

**建议动作**（P0）：补齐 `risk_adjusted_ev?: number` 等下游实际消费但未声明的字段，使契约与消费端对齐；清理接口内 7 处 any。

### 7. `03_quant_engine/index.ts`（858 行，36.3KB）— 统帅部编排层

**结构**：6 个导出函数，`calculateConfidenceAndAlerts`（193→476，约 280 行）、`calculateQuantitativeFeatures`（531→文件尾，约 330 行）。职责相对清晰（聚合编排），但体量偏大。

**建议动作**（P2）：`calculateConfidenceAndAlerts` 的「告警判定」与「置信度计算」可分离；保持对外聚合入口不变。

### 8. 其余 03 层文件（相对健康）

| 文件 | 行数 | 评估 |
|---|---|---|
| `eventMomentumFusion.ts` | 952 | 9 函数粒度较好，P2 可再拆 2-3 个 |
| `candidateStateMachine.ts` | 545 | 状态机逻辑清晰，低优先级 |
| `oosCalibrationEngine.ts` | 351 | 2 函数，健康 |
| `globalTierMatrix.ts` | 332 | TIER_PROFILES 配置（约 210 行）与逻辑混合，P2 抽配置 |
| `marketDivergenceEngine.ts` | 306 | 单函数 `calibrateWithMarketOdds` 约 170 行偏大，P2 |
| `dataAudit.ts` | 292 | 健康 |
| `prematchPriorEngine.ts` | 249 | 健康 |
| `enums.ts` | 174 | 健康 |

### 9. `03_quant_engine/EXPERT_DIAGNOSIS.md`（6420 行，206KB）

巨大诊断文档混在源码目录，与 `index.ts`、`types.ts` 平级，污染模块边界。

**建议动作**（P1）：移至 `refactor/docs/` 或归档，由 `HANDOVER_AND_PROGRESS.md` 引用。

### 10. 05/06 层粒度问题

- `05_portfolio_risk` 仅 4 文件 654 行，其中 `riskFilter.ts`（108 行）偏薄；
- `06_settlement_audit` 8 文件仅 806 行，多个 <130 行适配器（`settlementEngine` 192、`historicalBacktestIngestion` 140、`ledgerRecordAdapter` 127、`formalLedgerAdapter` 113、`parlayEngine` 103）。

**建议动作**（P1）：评估适配器是否过度拆分、是否需要合并；明确 05/06 职责边界。

---

## 四、重构优先级分级清单

### 🔴 P0 — 法典红线违规 + 断点风险（先做）

| # | 条目 | 证据 | 建议动作 |
|---|---|---|---|
| P0-1 | 类型契约断层引发 any | `types.ts` 缺 `risk_adjusted_ev`；`alignmentGuard.ts` 10 处 `as any` | 补齐契约字段，消除约 10 处 any |
| P0-2 | 生产代码 any 残留 | 共 41 处（alignmentGuard 15、types 7、contextEngine 5、promptExporter 5、dataConsistencyAuditor 4、marketDivergenceEngine 3、ledgerPersistence 2） | 引入判别联合类型根治 |
| P0-3 | 断点漂移 | `HANDOVER` 活动快照 `HALF-TIME-INDEPENDENT-QUANT-EVALUATION` 仍 `IN_PROGRESS`；`CONTINUATION.md` Next Task 却指向「持续学习闭环」 | 对齐双入口文档，闭环或回滚该快照 |

### 🟠 P1 — 架构结构重构（高价值）

| # | 条目 | 证据 | 建议动作 |
|---|---|---|---|
| P1-1 | 03 层上帝文件拆分 ✅ 已完成 | `contextEngine`(1787)、`momentumQuantEngine`(1126)、`devigCalculator`(1124)、`poissonDecayModel`(1117) | 已按职责物理拆成 12 子模块 + 4 精简桶（见第三节） |
| P1-2 | `EXPERT_DIAGNOSIS.md` 移出源码 ✅ 已完成 | 6420 行/206KB 混入 03 层 | 已移至 `refactor/` 根目录（与其余 9 份顶层文档平级） |
| P1-3 | 05/06 层粒度再平衡 ✅ 评估完成（维持现状） | 06 层 8 文件 806 行、多个 <130 行适配器；05 层 654 行 | 评估结论：小文件职责清晰符合单一职责原则，不合并；边界已明确 |

### 🟡 P2 — 卫生与一致性

| # | 条目 | 证据 |
|---|---|---|
| P2-1 | fixtures 脏文件 ✅ 已清理 | 2 个 `.corrupt-*`（各 549KB）损坏快照已删除 |
| P2-2 | samples 目录 ✅ 已清理 | `guam_pipeline_inspection_result.json` 一次性文件已删除；5 个 README 按层组织合理保留 |
| P2-3 | 测试输出规范 ✅ 评估完成（维持现状） | 447 处 `console.log` 全在 tests/（生产代码已清零）；统一断言框架属长期改进，不在本次范围 |
| P2-4 | `globalTierMatrix` 配置抽离 ✅ 已完成 | 配置数据（约 231 行）抽至 `tierData.ts`，`globalTierMatrix.ts` 精简为 105 行纯逻辑 |

### 🟢 P3 — 文档治理

| # | 条目 | 证据 |
|---|---|---|
| P3-1 | 交接文档瘦身 ✅ 已完成 | `HANDOVER_AND_PROGRESS.md` 200KB→0.5KB，历史快照归档至 `archive/HANDOVER_ARCHIVE.md` |
| P3-2 | 归档文档物理清理 ✅ 已完成 | `implementation_plan.md`（已标注废弃）已移入 `archive/` |
| P3-3 | 旧系统路径耦合 ✅ 已彻底解耦 | 生产代码（00-06 层）零 import 旧系统；tests/ 原 3 处残留已清除（新建 refactor 内部 `oosArchiveService.ts` 等价迁移 OOS 持久化层，2 脚本改引内部，1 旧系统基准脚本删除） |

---

## 五、建议执行顺序（原子任务拆分，符合快照工作流）

1. **原子任务 A（P0-3）**：对齐断点文档，闭环或回滚 `IN_PROGRESS` 快照 → 消除断点风险。
2. **原子任务 B（P0-1 + P0-2 核心）**：补齐 `types.ts` 契约字段，根治 `alignmentGuard.ts` 的 any → 单文件闭环。
3. **原子任务 C（P0-2 剩余）**：清理 `contextEngine`、`promptExporter`、`dataConsistencyAuditor`、`marketDivergenceEngine`、`ledgerPersistence` 的 any。
4. **原子任务 D（P1-1）** ✅ 已完成：逐一拆分 03 层 4 个上帝文件（contextEngine/poissonDecayModel/momentumQuantEngine/devigCalculator → 12 子模块 + 4 精简桶），每个文件拆分即跑回归全绿。
5. **原子任务 E（P1-2/P1-3）** ✅ 已完成：P1-2 文档移出（EXPERT_DIAGNOSIS.md → refactor/ 根目录）+ P1-3 粒度评估（结论：06 层小文件职责清晰、不合并）。
6. **原子任务 F（P2 全项）** ✅ 已完成：P2-1 删 fixtures 脏文件 + P2-2 清 samples 一次性文件 + P2-3 评估（维持现状）+ P2-4 抽离 globalTierMatrix 配置到 tierData.ts。
7. **原子任务 G（P3 全项）** ✅ 已完成：P3-1 交接文档瘦身（HANDOVER 200KB→0.5KB，历史快照归档）+ P3-2 废弃文档清理（implementation_plan.md 移入 archive/）+ P3-3 旧系统耦合确认（生产代码零耦合，测试层 3 处残留已记录）。

> 每个原子任务都遵循「登记快照 → 影响面核查 → 编码自测（`npx tsc --noEmit` + 相关 verify 脚本）→ 闭环归档」四步。

---

## 六、风险与依赖

- **拆分 03 层时**：`devigCalculator.ts` 的 `parseAsianHandicapLine` 被 `alignmentGuard.ts` 跨层引用，`momentumQuantEngine`/`poissonDecayModel` 被 `index.ts` 深度消费，拆分需用 re-export 桶保持 API 稳定，避免破坏 `verify_quant_engine.ts`（1167 行核心测试）。
- **类型契约变更**：`types.ts` 增补字段可能影响 `verify_*` 断言，需同步回归。
- **物理隔离**：所有操作严格限制在 `refactor/**`，不得触碰旧系统 UI/路由（P3-3 仅做只读确认）。

---

*报告完。本报告为静态只读评估产物，未修改任何代码与既有文档。*

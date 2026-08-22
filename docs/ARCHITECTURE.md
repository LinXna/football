# 项目架构与目录职责

## 当前运行边界

```text
浏览器扩展 / 外部数据
        │
        ▼
sources/ 或 Downloads 导出文件
        │
        ▼
Python 采集与匹配层
        │
        ▼
output/ 中的候选、决策、状态和台账
        │
        ▼
server.ts ── API ── src/ React 前端
```

## Backend route ownership & Services

- `server.ts` is the composition root: configuration, middleware, route registration, and the unified Vite SPA server integration live there.
- `server/routes/ledgerMutationRoutes.ts` owns ledger creation, candidate creation, AI candidate batches, review updates, score supplements, archival, and deletion. Cross-file writes use `requireJsonWrites` so ledger and decision updates commit together.
- `server/routes/ledgerReadRoutes.ts` owns ledger reads, single-item lookups, and archive inspection.
- `server/routes/aliasReadRoutes.ts` owns alias reads and mutations. Mutations refresh live and prematch decision aliases only after alias persistence succeeds via `aliasDecisionSynchronizer.ts`.
- `server/routes/aiReadRoutes.ts` owns AI evaluation history reads and writes; this history is diagnostic and does not affect formal ledger statistics.
- `server/routes/geminiEvaluationRoutes.ts` owns single-match and chunked batch Gemini evaluations, direct prompt extraction, and clipboard import/export parsing.
- `server/routes/batchSupplementRoutes.ts` owns bulk fixture supplement ingestion, match key normalization, and Beijing time resolution.
- `server/routes/pipelineRoutes.ts` and `server/routes/reportReadRoutes.ts` own pipeline reads and markdown/json backtest report retrieval.
- `server/routes/runtimeMaintenanceRoutes.ts` owns clean/reset APIs for ephemeral `output/` files while strictly guarding aliases, formal ledger, and sources.
- `server/services/` houses the domain engines:
  - `advancedTacticalQuantitativeEngines.ts`: 8 advanced quantitative engines (absence impact, corner squeeze, red card dynamics, Euro-Asian spread parity, table stake incentive, goal time distribution, and fair value edge).
  - `formationTacticalEngine.ts`: Tactical clash matrix across 12 formations and flank/midfield space analysis.
  - `formAndH2HDeepMining.ts`: Historical head-to-head (H2H) and recent form deep extraction.
  - `leagueRegionalDNAEngine.ts`: League regional style and tactical tempo DNA calibrations.
  - `geminiEvaluationService.ts`, `geminiKeyCooldown.ts`, `geminiRateGate.ts`, `geminiWindowsFallback.ts`: Robust LLM execution, multi-key rotation, 429 backoff, and platform fallback.
  - `scoreValidation.ts`: Hard score validation and data security gates.
  - `canonicalMatchModel.ts`: Canonical `StandardMatchData` ingestion, cleansing, and normalization.
  - `snapshotDeltaEngine.ts`: Real-time cross-snapshot and single-batch timeline delta engine.

The runtime-maintenance API deliberately operates only on re-generable `output/` analysis files. It must not mutate `team_aliases*.json`, the formal ledger, ledger archives, or source inputs.

## 前端视图规范与高清呈现机制

- **全局标准响应式容器**：主页面布局采用标准的 `max-w-7xl` 响应式容器，保持视觉比例紧凑协调，避免页面因过度拉伸或字号膨胀造成臃肿（非大号字体设计）。
- **排版与抗锯齿渲染**：在 `src/index.css` 与全组件中全局开启 `-webkit-font-smoothing: antialiased`、`-moz-osx-font-smoothing: grayscale` 与 `text-rendering: optimizeLegibility`，结合 `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei"` 高清系统字体栈，通过提升对比度（纯色高对比度深色底、明亮文本色彩、`font-mono` 数字等宽）保证微小字号（10px/11px/12px）与盘口数字清晰锐利。
- **全维度三重视角看板**：`src/components/BettingRecommendationsView.tsx` 针对“① 真实盘口 ② 机器量化推演 ③ AI 深度研判”采用高密度、高对比度紧凑卡片（`bg-slate-950`、`border-slate-800`），优化间距与结构层次，杜绝视觉发虚与排版臃肿。

## 目录规则

- `src/` 只放前端代码、类型和前端组件。
- `src/lib/apiClient.ts` 是前端访问本地 API 的统一入口；提供类型化响应与一致的异常捕获。
- 非首屏的分析、台账、别名、导出和数据补充弹窗通过 `React.lazy` 按需加载。
- `server.ts` 作为后端集成入口，所有相对路径以项目根目录为基准。
- `server/routes/` 存放领域隔离的 API 路由。
- `server/services/` 集中承载算法精算模型、AI 调度与数据规范化逻辑。
- `server/dataFiles.ts` 集中维护运行期 JSON 文件契约与物理映射。
- `server/jsonStore.ts` 是唯一的跨进程排他锁 JSON 读写与事务写入实现。
- `server/services/aliasDecisionSynchronizer.ts` 负责别名变更后的实时/赛前决策文件同步。
- Python 入口负责离线采集、推荐和人工复核，不应直接依赖 React 源码。
- `sources/` 是外部同步的只读输入。
- `output/` 是可重建的运行时输出，不属于源码层。
- `ybty_export_extension/` 是独立可加载的浏览器扩展，不与 Web 构建产物混用。
- `tests/` 只放自动化测试和测试夹具；缓存目录不得提交。

## 已识别的结构风险与处置状态

1. **后端架构模块化**：已将数据文件路径集中于 `server/dataFiles.ts`，数据路由拆分至 `server/routes/`，并引入 `server/jsonStore.ts` 跨进程文件锁与原子写入事务；`server.ts` 集中负责 Vite 整合、AI Prompt 构造与核心端点挂载。
2. **算法与数学引擎全面对齐**：Node.js 端与 Python 算法已完成高阶战术量化、泊松分布先验、非线性时段加权、红牌乘数与 +EV 期望值门禁的逻辑同步，详见 `docs/SYSTEM_DIAGNOSIS_AND_OPTIMIZATION_REPORT.md`。
3. **动能与跨批次时序引擎**：前端与服务端统一使用 `src/lib/snapshotDeltaEngine.ts`，消除单批次导入盲区，实现分钟级连续攻势波形与盘口异动（如大小球掉盘）的融合共振。
4. **串关风控重构**：实现了组合签名去重（Signature Deduplication）与重叠率熔断（Overlap Gate），杜绝多串关重复包含相同核心腿的问题。
5. **包管理器统一**：移除了冗余的 `bun.lock` 干扰，全系统统一基于 `npm` 进行构建与依赖管理。
6. **目录与产物分层**：运行时动态产物严格限定在 `output/`，长期报告保存于 `reports/`，只读测试夹具保存于 `sources/`。
7. **数据契约与管道全面对齐 (v3.0.0)**：完成全系统 `StandardMatchData` 统一契约迁移与 `src/utils/dataAdapter.ts` 清洗防护层；Python 管道原生适配雷速 `leisu_interface_data` (`results[].formal`) 结构化数据，详见 `docs/data_audit/06_IMPLEMENTATION_COMPLETION_REPORT.md`。



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

## Backend route ownership

- `server.ts` is the composition root: configuration, middleware, route registration, and the remaining AI/import orchestration live there.
- `server/routes/ledgerMutationRoutes.ts` owns ledger creation, candidate creation, AI candidate batches, review updates, score supplements, archival, and deletion. Cross-file writes use `requireJsonWrites` so ledger and decision updates commit together.
- `server/routes/aliasReadRoutes.ts` owns alias reads and mutations. Mutations refresh live and prematch decision aliases only after alias persistence succeeds.
- `server/routes/aiReadRoutes.ts` owns AI evaluation history reads and writes; this history is diagnostic and does not affect formal ledger statistics.
- `server/routes/pipelineRoutes.ts`, `ledgerReadRoutes.ts`, and `reportReadRoutes.ts` own their respective read APIs.
- `server/services/geminiEvaluationTypes.ts` defines the dependency boundary for the Gemini evaluation orchestrator: prompt construction, model execution, model JSON parsing, market normalization, and parlay-leg normalization are injected rather than coupled to HTTP routing.
- `server/services/batchSupplementTypes.ts` defines the transaction dependencies for batch supplement imports: team normalization, Beijing-time calculation, and market normalization.

The runtime-maintenance API deliberately operates only on re-generable `output/` analysis files. It must not mutate `team_aliases*.json`, the formal ledger, ledger archives, or source inputs.

## 目录规则

- `src/` 只放前端代码、类型和前端工具。
- `src/lib/apiClient.ts` 是前端访问本地 API 的统一入口；新增请求应复用它以获得一致的错误处理。
- 非首屏的分析、台账、别名和导出页面通过 `React.lazy` 按需加载，避免在首页下载全部页面代码。
- `server.ts` 目前是后端单体入口，所有相对路径都以项目根目录为基准。
- `server/routes/` 存放已按领域拆出的 API 路由；`pipelineRoutes.ts` 负责实时和赛前流水线读取接口。
- `ledgerReadRoutes.ts`、`aliasReadRoutes.ts`、`aiReadRoutes.ts` 与 `reportReadRoutes.ts` 负责各领域的只读 API；写入端点会在事务规则隔离后迁移。
- `ledgerMutationRoutes.ts` 当前承载单文件台账删除/清空操作，并拒绝没有 ID 且未明确 `clearAll` 的空请求。
- `server/dataFiles.ts` 集中维护运行期 JSON 文件契约，新增路由不得复制 `output/*.json` 路径字面量。

路由拆分采用“小步迁移”原则：先迁移只读端点并验证实际 HTTP 响应，再迁移涉及多文件事务的写入端点；避免复制或同时维护两套业务规则。
- `server/jsonStore.ts` 是唯一的 JSON 文件读写与事务写入实现。
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


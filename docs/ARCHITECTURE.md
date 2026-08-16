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

## 已识别的结构风险

1. 后端入口过大，API、业务规则、AI 调用和 JSON 持久化集中在 `server.ts`。
2. Python 脚本、PowerShell 启动器和业务数据全部位于根目录，职责不易区分。
3. `output/` 曾提交大量历史运行结果，容易把临时状态误认为正式数据。
4. 项目同时存在 `bun.lock` 与 `pnpm-lock.yaml`；当前 `package.json` 的脚本和 CI 应统一使用 pnpm。
5. README 曾出现编码损坏并引用不存在的 `sample_live.json`，已在本次审查中修复。

## 后续重构顺序

1. 先将 `server.ts` 拆为 `apps/api` 的路由、服务和存储模块，并保留兼容入口。
2. 再将 Python 入口归入 `scripts/`，统一通过项目根目录解析输入输出路径。
3. 将可复现样例与历史报告从运行时 `output/` 分离到 `fixtures/` 与 `reports/`。
4. 最后清理旧入口和重复锁文件，并在 Windows 启动脚本、测试和构建全部通过后删除兼容层。

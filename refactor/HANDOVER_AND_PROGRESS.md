## 一、当前活动工作快照 (Active Snapshot)

- **任务编号 (Task)**: UNIFIED-SETTLEMENT-HUB-01（收敛冗余档案与构建全生命周期统一结算复盘中枢）
- **当前状态 (Status)**: `IN_PROGRESS`
- **任务目标 (Goal)**: 
  1. 数据模型收敛（SSOT）：将原 `MatchArchiveStore` (`data/match_archive.json`) 的预测比分分布快照与赛后比分命中反思，完整吸收合并进 `UniverseAuditRecord`，彻底淘汰冗余的 `data/match_archive.json` 物理存储；
  2. 核心服务收敛：在 `UniverseLedgerPersistence` 中原生支持赛后比分反思指标计算（Top3 比分命中、净胜球/总进球偏差、诊断备忘），废弃 `matchArchiveStore.ts` 内部冗余逻辑，收敛为唯一的统一结算中枢；
  3. 路由与核销入口收敛：在 `refactorLedgerRoutes.ts` 提供全生命周期唯一的单场与雷速批量结算端点，并在 `canonicalRoutes.ts` 中移除双重建档调用；
  4. 视图界面统一：将散落的三个看板在 `CanonicalMatchCenter.tsx` 中整合为统一的【全生命周期赛后复盘与结算归因中心】，包含三大联动视图：① 实盘盈亏与 OOS 持续学习、② 全量门禁避坑与误杀归因、③ 比分推演与赛后反思，并统一核销弹窗。
- **改动文件清单 (Target Files)**:
  1. `refactor/05_portfolio_risk/types.ts`（扩展 `UniverseAuditRecord` 吸收 `reflection` 与 `top_scores`）
  2. `refactor/05_portfolio_risk/universeLedgerPersistence.ts`（核销时同步生成比分反思诊断，统一核销与归因流水线）
  3. `server/routes/canonicalRoutes.ts`（移除对 MatchArchiveStore 的重复调用）
  4. `server/routes/matchArchiveRoutes.ts`（底层重定向至 UniverseLedgerPersistence，淘汰 match_archive.json）
  5. `server/routes/refactorLedgerRoutes.ts`（强化统一结算端点）
  6. `server/services/matchArchiveStore.ts`（瘦身退役，作为兼容门面委托给 UniverseLedgerPersistence）
  7. `src/components/CanonicalMatchCenter.tsx`（深度整合三大看板与统一核销复盘体验）
  8. `refactor/HANDOVER_AND_PROGRESS.md` & `refactor/CONTINUATION.md`
- **阶段进度 (Phase)**: `06 结算审计：统一复盘与全生命周期结算中枢落地`
- **交付产物与验证 (Delivered & Verified)**: 待编码自测
- **下一步待办 (Next)**: 运行断言测试与 `compile_applet` 校验全链路统一性。

---

## 历史活动快照 (Historical Active Snapshots)

> 全部历史快照（2026-09-07 ~ 2026-09-24）已归档至 `refactor/archive/HANDOVER_ARCHIVE.md`。
> 冷启动恢复入口见 `refactor/CONTINUATION.md`。

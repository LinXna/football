## 一、当前活动工作快照 (Active Snapshot)

- **任务编号 (Task)**: SETTLEMENT-RESET-AND-RE-EDIT-UX-01（双轨台账与核销中心支持单场重新核销/修改比分与一键重置恢复待核销状态）
- **当前状态 (Status)**: `IN_PROGRESS`
- **任务目标 (Goal)**: 
  1. 响应用户误点击一键核销的紧急回滚需求，提供两层完备的重置与修改能力：
     - 单场维度：已核销卡片支持【✏️ 修改比分 / 重新核销】与【↺ 重置为待核销】；
     - 全局维度：工具栏提供【↺ 一键重置全部核销状态】撤销误操作；
  2. 后端数据持久化支持：
     - 在 `UniverseLedgerPersistence` 与 `LedgerPersistence` 增加 `resetSettlement` 方法；
     - 在 `refactorLedgerRoutes.ts` 提供 `POST /api/refactor/settlement/reset` 接口；
     - 联动清理误沉淀的 OOS 样本并同步重新编译或清空 OOS 档案；
  3. 前端 UI 交互增强：已核销卡片提供就地修改比分输入与一键重置，工具栏增加撤销按钮。
- **改动文件清单 (Target Files)**:
  1. `refactor/05_portfolio_risk/universeLedgerPersistence.ts`
  2. `refactor/06_settlement_audit/oosArchiveService.ts`
  3. `server/routes/refactorLedgerRoutes.ts`
  4. `src/components/CanonicalMatchCenter.tsx`
  5. `refactor/HANDOVER_AND_PROGRESS.md`
- **阶段进度 (Phase)**: `06 结算审计：误操作核销撤销与比分二次修改`
- **交付产物与验证 (Delivered & Verified)**: 待执行
- **下一步待办 (Next)**: 实现接口与前端交互，验证重置与二次核销，解答用户。

---

## 历史活动快照 (Historical Active Snapshots)

- **[DONE] DUAL-LEDGER-BATCH-SETTLE-AND-LEISU-TEAMS-01**: 双轨台账一键批量核销与雷速双源队名对照显示（新增 `POST /api/refactor/settlement/execute-batch` 批量核销接口、`renderDualTeamNames` 队名对照）。


- **[DONE] DUAL-LEDGER-SETTLE-SCORE-DEFAULTS-01**: 双轨台账与核销结算中心完场比分默认值与下限防负值约束（滚球取当时推演/推荐时现场实时比分，赛前 0-0，min=0 防负值过滤）。


- **[DONE] DUAL-LEDGER-KICKOFF-DATE-UI-01**: 重构双轨台账与核销结算中心开赛日期与时间完整展示优化（格式化统一为 `YYYY-MM-DD HH:mm`）。


- **[DONE] UNIFIED-SETTLEMENT-HUB-01**: 收敛冗余档案与构建全生命周期统一结算复盘中枢（淘汰 `data/match_archive.json`、物理删除 `MatchArchiveStore.ts` 与 `MatchArchiveCenter.tsx`、统一双轨核销端点与视图中枢，115/115 测试通过）。


> 全部历史快照（2026-09-07 ~ 2026-09-24）已归档至 `refactor/archive/HANDOVER_ARCHIVE.md`。
> 冷启动恢复入口见 `refactor/CONTINUATION.md`。

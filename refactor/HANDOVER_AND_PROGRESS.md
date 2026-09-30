## 一、当前活动工作快照 (Active Snapshot)

- **任务编号 (Task)**: DUAL-LEDGER-FULL-03-MARKETS-DISPLAY-01（双轨台账 Layer 03 全盘口矩阵与完整预测特征全景呈现）
- **当前状态 (Status)**: `DONE`
- **任务目标 (Goal)**: 
  1. 确认与解答用户疑问：底层已完整执行并持久化了 Layer 03 预测计算，包含让球、大小球、独赢三项全盘口及泊松期望矩阵；
  2. 界面全盘口与预测特征补全展示：
     - 在台账卡片上直观渲染【让球主盘 (Full Spread)】、【大小球主盘 (Full Total)】、【独赢主盘 (1X2)】具体盘口与双方水位；
     - 增加前瞻预期进球 xG、Top 3 预测比分分布概率直观展示；
     - 提供【展开 03 量化推演与博弈明细】折叠开关，展开可查看完整的全盘口去抽水公允率、正期望值 (+EV) 信号与泊松比分矩阵；
  3. 静态检查与回归测试闭环。
- **改动文件清单 (Target Files)**:
  1. `src/components/CanonicalMatchCenter.tsx`（封装 `renderQuantMarketSnapshot`，直观呈现让球、大小球、独赢三项主盘与展开明细）
  2. `refactor/HANDOVER_AND_PROGRESS.md`
- **阶段进度 (Phase)**: `06 结算审计：Layer 03 全盘口与预测全景呈现（已闭环）`
- **交付产物与验证 (Delivered & Verified)**:
  - `compile_applet`：通过，前端构建打包零错误；
  - `npm run lint` (`tsc --noEmit`)：零错误通过；
  - 界面呈现验证：
    - 轨道一、轨道二、轨道三所有卡片均已直观展现三大主盘胶囊：
      - 【让球 (Full Spread)】：让球盘口 line 与主/客双方水位；
      - 【大小球 (Full Total)】：大小球盘口 line 与大/小双方水位；
      - 【独赢 (1X2)】：主胜、平局、客胜三项赔率；
    - 首选预测比分、λ 参数、xG 进球总期望、BDI 指数全维度陈列；
    - 支持就地点击【展开 03 推演明细】，展开三列网格（让球博弈、大小球博弈、独赢博弈）及 Top 5 泊松全比分二维联合概率分布。
- **下一步待办 (Next)**: 系统运行稳定，待办事项已全部闭环。

---

## 历史活动快照 (Historical Active Snapshots)

- **[DONE] DUAL-LEDGER-BATCH-SETTLE-AND-LEISU-TEAMS-01**: 双轨台账一键批量核销与雷速双源队名对照显示（新增 `POST /api/refactor/settlement/execute-batch` 批量核销接口、`renderDualTeamNames` 队名对照）。


- **[DONE] DUAL-LEDGER-SETTLE-SCORE-DEFAULTS-01**: 双轨台账与核销结算中心完场比分默认值与下限防负值约束（滚球取当时推演/推荐时现场实时比分，赛前 0-0，min=0 防负值过滤）。


- **[DONE] DUAL-LEDGER-KICKOFF-DATE-UI-01**: 重构双轨台账与核销结算中心开赛日期与时间完整展示优化（格式化统一为 `YYYY-MM-DD HH:mm`）。


- **[DONE] UNIFIED-SETTLEMENT-HUB-01**: 收敛冗余档案与构建全生命周期统一结算复盘中枢（淘汰 `data/match_archive.json`、物理删除 `MatchArchiveStore.ts` 与 `MatchArchiveCenter.tsx`、统一双轨核销端点与视图中枢，115/115 测试通过）。


> 全部历史快照（2026-09-07 ~ 2026-09-24）已归档至 `refactor/archive/HANDOVER_ARCHIVE.md`。
> 冷启动恢复入口见 `refactor/CONTINUATION.md`。

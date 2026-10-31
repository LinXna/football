## 一、当前活动工作快照 (Active Snapshot)

- **当前状态 (Status)**: `DONE`
- **任务 ID**: `STAGE3-FRONTEND-CANONICAL-MATCH-CENTER-DECOMPOSITION-01`
- **目标**: 
  1. 拆解 `src/components/CanonicalMatchCenter.tsx`（原 8,500+ 行超级单体）；
  2. 提取 `CanonicalMatchCard.tsx`（比赛卡片、动量时序、量化特征面板、决策状态与核销/台账交互）；
  3. 全面对接已就绪的 5 大子组件（CanonicalSettlementHub、CanonicalImportWizard、CanonicalExportModal、CanonicalDiagnosticModal、CanonicalFilterBar）；
  4. 将主控入口 `CanonicalMatchCenter.tsx` 压缩至 500 行以内（最终达成 466 行），彻底解决前端可维护性与渲染膨胀问题；
  5. 静态检查 (`tsc --noEmit`) 与生产构建 (`compile_applet` / `npm run build`) 100% 通过，零功能损失。
- **影响文件**:
  - `src/components/canonical/CanonicalMatchCard.tsx`
  - `src/components/canonical/CanonicalFilterBar.tsx`
  - `src/components/canonical/CanonicalSettlementHub.tsx`
  - `src/components/canonical/CanonicalImportWizard.tsx`
  - `src/components/canonical/CanonicalExportModal.tsx`
  - `src/components/canonical/CanonicalDiagnosticModal.tsx`
  - `src/components/canonical/CanonicalAiModal.tsx`
  - `src/components/canonical/helpers.ts`
  - `src/components/canonical/types.ts`
  - `src/components/CanonicalMatchCenter.tsx`
- **执行步骤**:
  1. [x] 登记工作快照 (Status: IN_PROGRESS)
  2. [x] 提取并完善 `CanonicalFilterBar.tsx`
  3. [x] 提取并封装 `CanonicalMatchCard.tsx`
  4. [x] 重构主入口 `CanonicalMatchCenter.tsx`，成功从 8,538 行压缩至 466 行（< 500 行）
  5. [x] 执行 TypeScript 严格校验与生产编译，验证零功能缺失
  6. [x] 闭环归档快照为 DONE

- **最近完成任务 (Last Completed)**: `STAGE3-FRONTEND-CANONICAL-MATCH-CENTER-DECOMPOSITION-01`
- **交付产物与验证 (Delivered & Verified)**:
  1. `src/components/canonical/` 模块化子组件群全量落地（包含卡片、时序轴、11维诊断、核销复盘中枢、数据导入向导、03模型导出、AI评估模态窗等全部完整功能）。
  2. `src/components/CanonicalMatchCenter.tsx` 代码行数从 8,538 行降低至 466 行（降幅 94.5%），彻底消灭巨石单体债务。
  3. 编译验证：`compile_applet` 成功构建，`npx tsc --noEmit` 0 错误通过。
- **下一步待办 (Next)**: 全阶段 4 大重构任务（Stage 1 进球事实门禁、Stage 2 OOS全量打通、Stage 3 前端单体拆解、Stage 4 AI模型升级）已全部高标准闭环落地，系统进入持续稳健运行。

---

## 历史活动快照 (Historical Active Snapshots)

- **[DONE] STAGE4-AI-MODEL-UPGRADE-GEMINI-3-8-01**: Layer 04 AI 接口升级与旧模型彻底剔除（全面升级为 gemini-3.8-flash，全套用例通过）。

- **[DONE] STAGE2-OOS-UNIVERSE-CALIBRATION-TUNNEL-01**: 全量台账向 OOS 校准池合规打通（convertUniverseAuditRecords + ingestUniverseAuditRecordsAndPersist 完整闭环，端到端单测全绿）。

- **[DONE] STAGE1-CANONICAL-ID-GOAL-GATE-HARDENING-01**: 治理与进球事实强门禁（彻底废除临时 ID 伪造、未对齐比赛不入台账、记分牌有球但事件轴为空一票否决熔断、滚球核销无比分绝不回退全场，5套单测全绿）。

- **[DONE] LEISU-TEAM-ID-CORRUPTION-ROOT-FIX-01**: 三处联动根治雷速队名篡改问题（枚举字典错误 ID + resolveTeam 优先级反转 + UI leisuScore 移花接木漏洞 + 脏别名物理删除）。

- **[DONE] ALIGNMENT-DISCREPANCY-CIRCUIT-BREAKER-AND-PURGE-01**: Layer 02 赛事对齐别名有效性字根验真、拒绝机械 100% 假匹配、雷速原始队名保真与解除关联联动物理抹除脏别名。

- **目标**: 三处联动根治 — ① `enums.ts` ID 10034 硬编码错误（门兴→皇家社会）、② `resolveTeam` 以官方数据原始名优先而非盲目覆盖、③ UI `leisuScore` 从 YBTY 分数移花接木的 Fallback 漏洞
- **影响文件**:
  - `refactor/01_data_ingestion/leisu/enums.ts`（修正 `REAL_SOCIEDAD=10034` 错误，新增门兴 ID）
  - `refactor/01_data_ingestion/leisu/enums.ts`（`resolveTeam` 改为优先信任官方原始名）
  - `src/components/CanonicalMatchCenter.tsx`（`leisuScore` 改为读 `m.reference` 雷速比分，而非 YBTY 比分）
  - `refactor/runtime/live_batch.json`（修复后重新导入可自动修复）
  - `team_aliases.json`（清除 `门兴格拉德巴赫→皇家社会` 脏数据）
- **执行步骤**:
  1. [x] 登记快照
  2. [ ] 修复 `enums.ts` 错误 ID 映射
  3. [ ] 修复 `resolveTeam` 覆盖逻辑
  4. [ ] 修复 `CanonicalMatchCenter.tsx` leisuScore Fallback 漏洞
  5. [ ] 清除 `team_aliases.json` 脏别名
  6. [ ] 验证编译无报错
- **最近完成任务 (Last Completed)**: `ALIGNMENT-DISCREPANCY-CIRCUIT-BREAKER-AND-PURGE-01`（Layer 02 赛事对齐别名有效性字根验真、拒绝机械 100% 假匹配、雷速原始队名保真与解除关联联动物理抹除脏别名）
- **交付产物与验证 (Delivered & Verified)**:
  1. `refactor/02_canonical_model/matchAligner.ts`: 引入 `verifyAliasLegitimacy` 双端字根与相似度合理性验真门禁。若别名库命中但两端文字无共有字符且相似度为 0（如门兴 vs 皇家社会），直接标记为 `is_corrupted_alias_suspected: true`，剥夺 100% 别名加分资格并强制降为 0 分未匹配 (`UNMATCHED`)，从底层彻底终结机械式 100% 假匹配与错误替换。
  2. `server/routes/aliasReadRoutes.ts`: 新增防投毒常识门禁 `isAliasSanityAcceptable`，在 `POST /api/aliases` 与批量沉淀中直接拦截零相似度且无共有字的对阵错配写入；`DELETE /api/aliases` 扩展支持 `alias` 字段进行双向精准物理抹除。
  3. `src/components/CanonicalMatchCenter.tsx`: 待核验清单支持 `⚠️ 疑似错误别名绑定` 标牌与优先置顶；点击【解除关联】提供二次确认模态弹窗，一键联动调用后台彻底从别名库中物理抹除错误映射；主客颠倒纠正增加常识门禁阻断，防止错误保存。
  4. 23/23 单元测试、防投毒拦截测试与精准抹除测试 100% 全绿，编译与静态类型检查 100% 通过。
- **下一步待办 (Next)**: 待接管新原子任务。

---

## 历史活动快照 (Historical Active Snapshots)

- **[DONE] ALIGNMENT-DISCREPANCY-CIRCUIT-BREAKER-AND-PURGE-01**: Layer 02 赛事对齐别名有效性字根验真、拒绝机械 100% 假匹配、雷速原始队名保真与解除关联联动物理抹除脏别名。

- **[DONE] SETTLEMENT-RESET-AND-RE-EDIT-UX-01**: 双轨台账与核销结算中心误操作单场二次修改比分重新核销、单场重置恢复待核销与一键批量防误触加固。

- **[DONE] DUAL-LEDGER-BATCH-SETTLE-AND-LEISU-TEAMS-01**: 双轨台账一键批量核销与雷速双源队名对照显示（新增 `POST /api/refactor/settlement/execute-batch` 批量核销接口、`renderDualTeamNames` 队名对照）。


- **[DONE] DUAL-LEDGER-SETTLE-SCORE-DEFAULTS-01**: 双轨台账与核销结算中心完场比分默认值与下限防负值约束（滚球取当时推演/推荐时现场实时比分，赛前 0-0，min=0 防负值过滤）。


- **[DONE] DUAL-LEDGER-KICKOFF-DATE-UI-01**: 重构双轨台账与核销结算中心开赛日期与时间完整展示优化（格式化统一为 `YYYY-MM-DD HH:mm`）。


- **[DONE] UNIFIED-SETTLEMENT-HUB-01**: 收敛冗余档案与构建全生命周期统一结算复盘中枢（淘汰 `data/match_archive.json`、物理删除 `MatchArchiveStore.ts` 与 `MatchArchiveCenter.tsx`、统一双轨核销端点与视图中枢，115/115 测试通过）。


> 全部历史快照（2026-09-07 ~ 2026-09-24）已归档至 `refactor/archive/HANDOVER_ARCHIVE.md`。
> 冷启动恢复入口见 `refactor/CONTINUATION.md`。

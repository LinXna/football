## 一、当前活动工作快照 (Active Snapshot)

- **当前状态 (Status)**: `IDLE`
- **任务 ID**: `DUAL-LEDGER-OOS-SYNC-FIX-01`
- **目标**: 彻底打通双轨台账与 OOS 样本校准档案的原子联动核销闭环，将结算展示词全面改用旧系统风格（全赢、赢半、走盘、输半、全输），根治全量台账核销后正式台账未联动核销导致 OOS 看板为 0 场的问题。
- **影响文件**:
  - `refactor/06_settlement_audit/formalLedgerAdapter.ts`（修复滚球 minute 为 null 时回退安全解析，杜绝 LIVE_MINUTE_INVALID 误拦截）
  - `refactor/06_settlement_audit/settlementEngine.ts`（增加 `formatSettlementOutcomeCn`，将四分之一盘拆分等解释字符串从英文转为旧系统风格结算词）
  - `refactor/05_portfolio_risk/universeLedgerPersistence.ts`（全面采用旧系统风格结算词，杜绝“未打出 (LOSE)”等繁琐描述）
  - `server/routes/refactorLedgerRoutes.ts`（加固双轨单场核销与一键批量核销的双向查找、比分核销、OOS 沉淀与持久化，以及新增双轨台账一键对齐同步核销接口 `POST /api/refactor/settlement/sync-universe-to-formal`）
  - `src/components/CanonicalMatchCenter.tsx`（新增【⚡ 双轨对齐同步核销】按钮，统一展示旧系统风格结算词）
- **执行步骤**:
  1. [x] 登记工作快照
  2. [x] 加固 `refactor/06_settlement_audit/formalLedgerAdapter.ts` 分钟解析逻辑，根治 OOS 样本准入被误拦
  3. [x] 结算术语全面改用旧系统风格（全赢、赢半、走盘、输半、全输），统一结算解释和归因展示
  4. [x] 加固 `server/routes/refactorLedgerRoutes.ts` 中的 `executeUnifiedSettlement` 匹配与核销逻辑（支持 string 兼容、队名兜底、双向严格保存并触发 OOS 沉淀）
  5. [x] 补全对齐已核销的全量台账记录到对应正式台账记录的同步核销逻辑，新增路由与前端触发按钮
  6. [x] 验证 TypeScript 静态类型检查 `tsc --noEmit` 100% 零错误
  7. [x] 验证全工程单元测试 71/71 全绿通过
  8. [x] 闭环归档快照为 DONE

- **最近完成任务 (Last Completed)**: `DUAL-LEDGER-OOS-SYNC-FIX-01`
- **交付产物与验证 (Delivered & Verified)**:
  1. `refactor/06_settlement_audit/formalLedgerAdapter.ts`：修复 `record.prediction_snapshot.minute` 为 null 时的回退解析，支持从 `match_minute` 中提取分钟或安全兜底 45'，彻底根除滚球记录被 `LIVE_MINUTE_INVALID` 错杀排斥在 OOS 之外的根本问题。
  2. `refactor/06_settlement_audit/settlementEngine.ts` & `universeLedgerPersistence.ts`：新增 `formatSettlementOutcomeCn`，全面改用旧系统风格结算词（全赢、赢半、走盘、输半、全输），彻底替代繁琐的 `未打出 (LOSE)` / `LOSE_HALF`，底层数据契约与数学计算逻辑零改动，零副作用。
  3. `server/routes/refactorLedgerRoutes.ts`：加固 `executeUnifiedSettlement` 的 `formalTarget` 查找逻辑（支持 String 转换兼容 + 队名双向兜底匹配）；新增 `POST /api/refactor/settlement/sync-universe-to-formal` 接口，一键从全量归因台账同步比分至实盘台账并合规增量沉淀 OOS 校准样本。
  4. `src/components/CanonicalMatchCenter.tsx`：结算中枢操作栏新增【⚡ 双轨对齐同步核销】按钮，点击后一键双轨对齐联动核销并自动拉取最新 OOS 状态指标。
  5. 实机验证：OOS 校准档案成功增量更新，`sample_count` 从 0 增至 3（纽卡斯尔联、门兴格拉德巴赫、云达不莱梅通过 Layer 06 严格核销入库），`tsc --noEmit` 零报错，`npm run test:ts` 71/71 100% 全绿。
- **下一步待办 (Next)**: 待接管新原子任务。

---

## 历史活动快照 (Historical Active Snapshots)

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

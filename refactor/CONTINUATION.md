# Refactor Continuation Checkpoint

> This is the short cold-start entry for any AI or account taking over this repository.
> The full historical record remains in `archive/HANDOVER_ARCHIVE.md` (active snapshot in `HANDOVER_AND_PROGRESS.md`).
>
> ⚠️ **CRITICAL BOUNDARY ENFORCEMENT**:
> - **重构系统 (Football Match Analysis System / CODEX / Refactor 体系)**: 物理作用域仅限 `/refactor/**`。
> - **旧系统 (Legacy)**: 作用域为 `/docs/**`, `/server/**`, `/src/**` 及根目录脚本。
> - 在执行任何重构系统操作前，禁止引用或混入旧系统的任何文档和代码。

## Current State

- Layer 00-02 normal-path verification: passed.
- Layer 02 alignment gate: fixed; only `MATCHED_BY_ALIAS` and `MATCHED_AUTO` may enter Layer 03.
- Layer 03 integrity sweep completed through dynamic Poisson support bounds.
- Latest verified commands:
  - `npx tsx refactor/tests/verify_quant_engine.ts`
  - `npx tsx refactor/tests/verify_full_pipeline_00_03.ts`
  - `npm run test:ts` (89/89 passed)
  - `npx tsc --noEmit`
  - `git diff --check`

## Completed Fixes

- [2026-09-29 grade 第二处门禁补修]: GRADE-FMT-FIX-01 遗漏——`refactor/05_portfolio_risk/ledgerPersistence.ts:217` 的 `appendApprovedLegs` 内部还有第二处 `evaluation.grade === 'B_GRADE'` 精确匹配门禁（与 `refactorLedgerRoutes.ts` 的 append 门禁同逻辑），手动导入评估（import-evaluation 归一化为 "B"）在台账写入内部被 throw "Only A_GRADE or B_GRADE can be persisted"，导致台账空、样本 0，且前端 `handleImportAiEvaluation` 还静默吞掉 append 失败、用户毫无提示。修复：append 端点把 grade 统一规范化为 `RecommendationGrade.A_GRADE/B_GRADE`（"B"→"B_GRADE"，一处修复，下游 `ledgerPersistence`/`ledgerRecordAdapter` 全通过）；前端收集 append 失败原因并可见报错。验证 `npx tsc --noEmit` 零错误 + `npm run test:ts` 115/115。

- [2026-09-29 grade 格式不一致修复]: 排查发现「推荐→台账」断链——`server/routes/refactorAiRoutes.ts`（import-evaluation）把 grade 从 `B_GRADE` 归一化为 `B`（该行为被 `tests-ts/aiRoutesSeparation.test.ts:131` 断言锁定，不可改），而 `server/routes/refactorLedgerRoutes.ts`（append）评级门禁要求 `=== "B_GRADE"`（带后缀精确匹配），两处格式不一致导致 A/B 级推荐永远无法写入台账（返回 400），进而「写比分核销」入口不出现、OOS 样本无法沉淀。修复 append 门禁为归一化判断（`String(grade).toUpperCase().replace(/_GRADE$/, '')` 后判断 A/B），兼容两种格式，且不触碰 import-evaluation 与前端（两者本就兼容）。验证：`npx tsc --noEmit` 零错误 + `npm run test:ts` 115/115。恢复「导入评估→台账→写比分核销→OOS 样本沉淀」完整闭环。

- [2026-09-29 OOS 样本入口旁路堵死]: 排查「样本入口」发现 `server/routes/refactorLedgerRoutes.ts` 的 `/api/refactor/oos-sample/manual-entry` 端点绕过 OP-06-02 完整校验（用 `appendSampleAndRebuildArchive` 直写 `OosCalibrationSample`），且带 `|| 0.55`/`|| 2.5` 硬编码兜底（违反「严禁硬编码伪造样本」铁律）；前端 `ManualLedgerModal.tsx` 发送字段（`market_category`/`raw_model_prob`/`is_win`/`match_minute`）与后端读取字段（`league_key`/`home_team_key`/`away_team_key`/`model_probability`/`outcome`）完全不匹配，该直录链路从未真正工作。修复：① 删除 `/api/refactor/oos-sample/manual-entry` 端点及前端 OOS 直录表单/tab/state/handler；② 清理 `refactorLedgerRoutes.ts` 不再使用的 `appendSampleAndRebuildArchive`/`OosCalibrationSample` import；③ `appendSampleAndRebuildArchive` 加 `@deprecated`（仅测试用）；④ 修复方向 B 链路描述（与 09-28 最新状态对齐）。生产 OOS 写入入口现唯一化为 `ingestSettledRecordsAndPersist`。验证：`npx tsc --noEmit` 零错误 + `npm run test:ts` 115/115。剩余：数据工程缺口 A 的批量历史回填入口（`ingestHistoricalBacktestRecords` 独立生产落地）待真实数据到位后补。

- [2026-09-28 OOS 入口完整校验闭环]: 修复生产核销路径绕过 OP-06-02 完整校验的问题。旧实现 `refactorLedgerRoutes.ts` `/settle` 与 `matchArchiveStore.ts` 用「convertFormalLedgerRecords → toOosSample → appendSampleAndRebuildArchive」，跳过了 `ingestHistoricalBacktestRecords` 的 model_probability/lambda 合法性、滚球比分倒退、预测时间戳倒置、语义去重、时间窗口等硬拦截。新增 `oosArchiveService.ingestSettledRecordsAndPersist`（走 OP-06-02 完整校验 + 语义去重 + 时间窗口 + 原子写入），两处生产核销路径改接该函数。验证：`tsc --noEmit` 零错误 + `npm run test:ts` 115/115 + `verify_p3_ledger_snowball`/`verify_historical_backtest_ingestion` 全绿。剩余：批量历史回填入口（`ingestHistoricalBacktestRecords` 的独立生产落地，如批量导入端点/脚本）待真实数据到位后补，见数据工程缺口 A。

- [2026-09-28 阶段1 物理隔离闭环]: 删除旧系统薄壳 `server/services/oosArchiveService.ts`（寄生在 refactor 上的 `fs.writeFileSync` 非原子写薄壳）；`server/routes/refactorLedgerRoutes.ts`、`server/routes/canonicalRoutes.ts`、`server/services/matchArchiveStore.ts` 三处 OOS 依赖全部切换到重构版 `refactor/06_settlement_audit/oosArchiveService.js`（原子写）；`refactor/runtime/oos_calibration_samples.json` 22 条测试造假样本已清空为 `[]`。验证：`npx tsc --noEmit -p tsconfig.json` 零错误，全工程无残留旧薄壳引用。
- [2026-09-28 P1-19 MUI 赛制元数据化]: `motivationUrgency.ts` 将写死队数表 `LEAGUE_TOTAL_TEAMS_MAP` 与固定百分位（争冠 <=0.20 / 降级 >=0.80）重构为「当季赛制元数据 + 名额制」。新增 `CompetitionFormatMeta` / `PrematchIntel` / `CompetitionFormatType` 类型、内置专家 fallback 表 `BUILTIN_LEAGUE_FORMAT`（队数 + 降级名额 + 洲际资格名额 + split 赛制识别）、`resolveCompetitionFormat(leagueName, intel?)`（intel 优先 → 内置 fallback → 通用默认）。`calculateMotivationAndUrgencyIndex(match, intel?)` 改名额制：争冠区 = rank <= continental_slots，降级区 = rank > total_teams - relegation_slots，中游逻辑不变。为阶段 4 情报预取（prematch_intel.json）预留只读接口，03 永不联网、无 intel 时降级内置 fallback。验证：新增 `verify_p1_19_format_meta.ts` 全绿 + `verify_quant_engine.ts` 11/11 + `tsc --noEmit` 零错误。
- [2026-09-28 阶段4 情报预取层（Layer 04）]: 新建 `refactor/04_ai_evaluator/intelPrefetchService.ts`，联网（Gemini Grounding with Google Search，`tools: [{ googleSearchRetrieval: {} }]`，2.5-flash；升 3.x 改 `googleSearch`）获取当季赛制元数据，写入 `refactor/runtime/prematch_intel.json` 缓存。三条防线：24h 缓存 TTL + 30s 硬超时 + 失败降级返回 null（上层走 BUILTIN_FALLBACK），确保 03 永不阻塞。核心函数：`groundedSearchFormat`（超时+重试）、`parseCompetitionFormatFromText`（强校验，非法返回 null 不编造）、`prefetchCompetitionFormat` / `prefetchCompetitionFormats`（原子合并写缓存）、`getCompetitionFormatIntel` / `buildPrematchIntel`（从缓存组装 03 只读 intel）。03 层接线：`extractCleanedContextFeatures` / `calculateQuantitativeFeatures` 新增可选 `intel?: PrematchIntel | null` 参数（向后兼容，缺省降级内置 fallback）。缓存路径支持 `PREMATCH_INTEL_PATH` env 覆盖（测试隔离）。验证：新增 `verify_intel_prefetch.ts`（mock client 不真联网）全绿 + `verify_quant_engine.ts` 11/11 + `tsc --noEmit` 零错误。伤停原因（问题三）仍待移动端雷速数据（`reason` 字段），暂缓。
- [2026-09-28 Gemini 模型升级 2.5→3.8 + Interactions API]: 真实联网诊断确认 `gemini-2.5-flash` 已对新用户下线（404），必须用 `gemini-3.8-flash` + Interactions API（`client.interactions.create({ model, input, tools: [{ type: 'google_search' }] })`，返回 `output_text`）。已升级：① `intelPrefetchService.ts` 的 `groundedSearchFormat` 从 `models.generateContent` + `googleSearchRetrieval` 改为 `interactions.create` + `google_search`（移除 responseSchema，改用 prompt 要求 JSON）；② `config/appConfig.ts` 默认模型 `gemini-2.5-flash` → `gemini-3.8-flash`；③ 诊断脚本 `verify_gemini_grounding_live.ts` 改为 3.8-flash + Interactions API + grounding 引用遍历；④ 测试 `verify_intel_prefetch.ts` mock client 适配 `interactions.create`。**网络注意**：Node fetch 不走 Windows 系统代理，需设 `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1`。**待办**：`refactor/04_ai_evaluator/aiCaller.ts`（硬编码 `gemini-2.5-pro` + generateContent + responseSchema）与旧系统 `server/services/geminiEvaluationService.ts` 同样需升级到 3.x + Interactions API（含 responseSchema→response_format 迁移），是更大的独立改动。验证：`tsc --noEmit` 零错误 + `verify_intel_prefetch.ts` 全绿。
- [2026-09-28 韩K联 relegation_slots 修复]: 名额制改动引发回归（`tests-ts/quantHardeningAntiFakeData.test.ts` 断言韩K联 12 队 rank11 为降级区）。修正：韩K联 `relegation_slots` 1→2，并明确 `relegation_slots` 语义为「降级危险区名额（含直接降级 + 升降级附加赛）」。验证：`npm run test:ts` 115/115 + `verify_quant_engine` 11/11 + `tsc` 零错误。注：test:ts 曾因 `NODE_USE_ENV_PROXY` 残留导致 UNDICI-EHPA 警告污染 stderr 误报失败，清除变量后恢复。

## 情报预取（Grounding）定位：可选增强（OPTIONAL），绝不影响正常预测

- **定位**：联网获取当季赛制元数据是【可选增强功能】，非预测前置依赖。
- **降级保证（硬性约束）**：
  1. 预取是独立批处理步，默认不运行，绝不进 Layer 03 计算路径；
  2. 预取失败（配额/网络/超时/解析失败）→ 返回 null，绝不抛异常；
  3. Layer 03 `calculateMotivationAndUrgencyIndex(match, intel?)` 的 `intel` 为可选参数，无 intel 时用内置专家 fallback 表，预测照常进行；
  4. Layer 03 永不联网、永不阻塞，预测结果不依赖 grounding 是否成功。
- **配额问题**：由用户在 Google AI Studio 处理计费/配额；调用方式已验证正确（`gemini-3.8-flash` + `interactions.create` + `tools: [{ type: 'google_search' }]`），配额恢复后复测 `verify_gemini_grounding_live.ts`（需设 `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1`）。
- Unconfirmed, unmatched, or swapped matches are blocked before Layer 03.
- Asian-handicap EV traverses the generated Poisson grid instead of a fixed 0-7 range.
- Main forward Poisson projections now use a lambda-based dynamic support bound for the matrix and Top score enumeration.
- H2H records without complete final scores are excluded from valid samples instead of becoming fake 0-0 records.
- Recent-form samples now require verified team identity, competition name, time window, and valid final/half-time scores.
- Incomplete goal-distribution intervals are rejected rather than silently becoming a usable uniform prior; inconsistent standings and one-sided lineups are also rejected.
- Live momentum windows now use minute coordinates from the Leisu segment metadata and are truncated at the captured YBTY minute; missing interval metadata is research-only and audit weight 0.
- Verified red-card multipliers now flow from M3 physical stats through UnifiedMatchState into M4 residual lambda; missing red-card stats remain neutral.
- Historical OOS ingestion rejects the current research-only snapshots: 4 matches/20 snapshots/4 decisions yielded 0 accepted OOS samples and no calibration archive.
- Layer 03 event and momentum engines consume the canonical event path and no longer use production `any` or `@ts-ignore` compatibility escapes.
- Untimed Leisu preparation/system events (`minute=null`) are excluded from M3.5 decay, 5/15-minute event windows, goal/red-card timing, and event-density scoring; the audit counts only timed events as usable.
- Live market calibration now uses Leisu `odds_matrix.live` before `pregame`/`initial`; Leisu Hong Kong handicap/total odds are normalized only inside calibration, while YBTY execution markets remain unchanged.
- M4 now returns a serializable `lambda_decomposition` and the refactor page displays market base, M2-adjusted base, time/DNA factor, urgency, threat tensor, red-card multipliers, and final H/A λ.
- Refactor Layer 05 ledger persistence writes only to `refactor/runtime/formal_ledger_live.json` or `formal_ledger_prematch.json`; legacy `output/recommendation_ledger*.json` remains owned by legacy routes.
- Layer 05 risk regression now uses the refactor `RecommendedLeg` field names and fails the process on a broken assertion; B-grade duplicate exposure and deep handicap blocking are verified.
- The exact changes and validations are recorded in the active snapshot at the top of `HANDOVER_AND_PROGRESS.md`.
- Refactor and legacy runtime paths are now separated: the refactor page reads only `refactor/runtime/<mode>_batch.json`; legacy `output/*.json` remains owned by legacy pipeline routes.
- A refactor import creates a unique `batch_id`; without a current refactor batch the refactor page returns zero matches instead of loading fixture or legacy cache data.
- Formal Layer 05 records now freeze structured model probability, prediction timestamp, market/line/odds, residual lambdas, score verification, live minute, and red-card state; records without this snapshot are rejected.
- Layer 06 now has an explicit adapter that keeps pending, unverified, non-binary, or incomplete ledger records out of OOS ingestion.
- Layer 03 threat calibration no longer treats feed disagreement as a deterministic 0.45 low-goal multiplier; missing key events are weak evidence rather than zero threat, while conflicts remain confidence/candidate gates.
- The regression suite now asserts that conflicted evidence cannot reproduce the former 0.45 low-goal multiplier; the current five-match audit is approximately 1.195, 0.708, 1.026, 0.985, and 0.486 total residual λ.
- M4 no longer reapplies MUI×LIS when market calibration already contains the M2 theory prior; this removes double-counting of lineup/motivation penalties. The five-match audit now reads approximately 1.169, 0.695, 1.026, 1.050, and 0.863 total residual λ.
- Layer 03 regression now asserts that market-calibrated M4 outputs keep M2 context multipliers at 1.0, preventing future double-counting regressions.
- Layer 03 M5 defaults YBTY `full_total` lines to full-match settlement semantics in both LIVE and PREMATCH; it subtracts the verified current score once, while an explicitly marked `REMAINING_GOALS` line uses no score subtraction. The YBTY raw/clean market contracts now carry this explicit basis.
- Layer 03 M4 now marks whether market calibration used an in-play reference; in-play λ is already residual and no longer receives a second time-fraction decay. Theory-prior blending is scaled to the remaining match fraction before fusion.
- Layer 03/OOS acceptance rejects duplicate semantic snapshots (same stage, teams, minute, recommendation score, market, line and odds) even when record IDs differ; the current runtime still has 0 accepted OOS samples.
- Settlement/parlay acceptance fixed an obsolete `current_odds` field reference; parlay settlement now uses `ParlayLegResult.odds` and passes all 18 assertions.
- Layer 03 now emits an explicit `production_gate` separating calculation readiness from formal candidate readiness. Calculation can be `PRODUCTION_READY`, `RESEARCH_ONLY`, or `BLOCKED`; formal candidates remain `OOS_LOCKED` until a matching VALIDATED profile exists.
- The refactor system exposes isolated `GET /api/refactor/formal-ledger`; the obsolete manual `/api/refactor/formal-ledger/verified-score` endpoint was removed. LIVE score verification now passes when imported YBTY and Leisu scores agree, and each page match shows its Layer 03 production gate.
- [2026-09-08 Batch 1 Complete]: 
  - Q2: 盘口择优竞价池全面纳入大小球与让球的全部合法主副盘（`ASIAN_HANDICAP_MAIN/SECONDARY`, `TOTAL_GOALS_MAIN/SECONDARY`），副盘优于主盘时自动高亮为“最优副盘推荐”；前端界面支持切线切换与对比。
  - Q3: 独赢三向（主胜/平局/客胜）独立呈现对应赔率、概率与单向 EV，正期望方向高亮展示。
  - Q4: 玩法底栏由纯数值“期望值: EV”升级为具备明确主语指向的“最佳推荐选项 + 对应赔率 + EV”。
- [2026-09-14 Systemic Overhaul Phase 0 & Phase 1 Complete]:
  - P0 致命级任务（0.1 Parser 闭包、0.2 五态分布真实归一化、0.3 1X2 欧赔 Shin+泊松双轨去抽水）完成并经 `verify_p0_math_closure.ts` 100% 验证；
  - P1 核心阻塞级（1.1 OOS 门禁与实盘准入解耦、1.2 生产门禁与推荐台账贯通）完成：
    - 在冷启动期放行 `COLD_START_PERMISSIVE`，生成带 `OOS_COLD_START_EXEMPT` 标记的研究候选；
    - Layer 04 `alignmentGuard.ts` 解锁冷启动推荐，强制 A 级降 B 级、置信度 79 封顶，保留正式推荐腿；
    - Layer 06 台账适配器 `formalLedgerAdapter.ts` 与样本录入器 `historicalBacktestIngestion.ts` 支持冷启动豁免记录入账并沉淀真实样本；
    - 边界与台账集成测试 `verify_layer04_05_candidate_boundary.ts` 及全套回归测试通过。
- [2026-09-14 Systemic Overhaul Phase 2 Complete]:
  - 任务 2.1：现场 9 项物理统计全面激活，构建并输出 TTI (Threat Transformation Index) 威胁转化指数，实现与 EPI/战术分类的深度联动；
  - 任务 2.2：构建多尺度动量金字塔模型（5m 40%、10m 35%、15m 25%），支持 `ALIGNED` (共振)、`TURNING` (转折背离)、`COUNTER_SPIKE` (突刺) 状态机，并在破门临界态与泊松威胁推力张量中生效；
  - 任务 2.3：实现滚球红牌场景三态分流（领先 `LEADING_PARK_BUS`、平局 `DRAW_BALANCED_ATTRITION`、落后 `TRAILING_COLLAPSE_RISK`），建立非对称攻防动态惩罚；
  - 任务 2.4：落地豪门红牌防御策略覆盖模式 (Strategy Override Pattern)，引入 0.75 缓冲因子避免误杀强队；
  - 任务 2.5：高赔冷门与极深盘经验贝叶斯收缩机制落地，修正极端方差，补全审计字段；
  - 专属测试套件 `verify_p2_tactical_momentum.ts` 及全量测试验证 100% 通过。
- [2026-09-15 ~ 2026-09-22 Phases 3~5 & Stability Hardening Complete]:
  - Phase 3 & 4：台账持久化原子事务锁落地，75+ 终盘物理时间衰减与伤停补时模型生效；
  - Phase 5：四大支柱全面重构，落实市场分歧引擎、信息不对称避险、0:0让球与大小球重置；
  - 稳定性加固：底层 JSON 存储加固为临时文件原子替换，对齐算法与导入性能大幅提升；
  - 规划文档审计：排查消除历史遗留计划与现行实施的博弈矛盾，明确以 `/refactor/` 目录为全工程唯一事实来源 (SSOT)。

## Next Atomic Task

> ~~遗留半成品待办 (Stalled): `上下半场独立定价信号（半场 EV）贯通`~~ **已完成 (2026-09-24)**：底层 `devigCalculator.ts` 的 `half_spread_main_ev`/`half_total_main_ev` 与上层三件事全部闭环——`index.ts` 信号接入（`ASIAN_HANDICAP_HALF`/`TOTAL_GOALS_HALF`）、`promptExporter.ts` 导出 `ah_half`/`ou_half`、`verify_half_time_quant_engine.ts` 测试全绿。

✅ **持续学习闭环（Continuous Learning Loop）部署验证 —— 已完成（2026-09-28）**：
- 核心链路「实盘推荐 → 完赛核销 → 适配器转换 → OOS 样本沉淀 → Brier 校准 → 经验贝叶斯收缩 → 原子归档」代码完整，端到端检验 `verify_p3_ledger_snowball.ts` 全绿（Task 3.1 双轨台账 + 3.2 幂等/删除 + 3.3 核销→OOS 增量自增）。
- 修复测试隔离缺陷：`oosArchiveService.ts` 路径支持 env 覆盖（`OOS_ARCHIVE_PATH`/`OOS_SAMPLES_PATH`/`REFACTOR_RUNTIME_DIR`），`verify_p3_ledger_snowball.ts` 改用隔离路径，杜绝合成样本污染真实 `refactor/runtime` 校准库；并清理残留旧档案（`oos_calibration_archive.json` 22 条测试造假样本）。
- 验证：`tsc --noEmit` 零错误 + `npm run test:ts` 115/115 全绿。

⏸️ **剩余（非代码阻塞）**：
1. OOS 真实样本 = 0，需实际比赛完赛核销后逐步积累（数据工程缺口 A 项，非代码可解）。
2. Gemini 相关模块（`aiCaller.ts`/`geminiEvaluationService.ts` 3.x 升级、SPEC Phase 3 `independentTacticalSupervisor`）→ 交给 Google AI Studio，详见下方「交给 Google AI Studio 的任务清单」。
3. SPEC Phase 1-4 其余模块（FrozenPredictionSnapshot 15 项乘子固化、microAttributionAuditor、tacticalDynamicsExtractor、timeWindowEvaluator、shadowRacingManager 等）仍为设计，待排期实现。

After that, audit live-minute window semantics, red-card multipliers into M4, market timeline separation, and OOS backtesting one atomic issue at a time.
### 代码逻辑审查（2026-09-24，全部完成）

已修复 6 项：
1. settlement_basis 枚举断裂（`resolveSettlementBasis` helper + 类型扩展）；
2. 盘口 NaN 污染（`devigCalculator` EV 函数加 `Number.isFinite` 防护）；
3. parlayEngine LOSE_HALF 语义（按有效赔率决定 finalOutcome，而非「是否存在输半腿」）；
4. 五态分布 ΣP（`roundFiveStateToUnit` 最大余数法，ΣP 精确 = 1.0）；
5. getLeagueBaseGoals 别名（`LEAGUE_ALIAS_MAP` 全称→简称归一化）；
6. 三套盘口解析器 SSOT 统一（删除死代码 `parseHandicapOrTotalLine`，`parseAsianLine` 委托 `parseAsianHandicapLine`）。

无遗留待办。

### 03 计算模块预测功能专业审查（2026-09-24，完成）

已修复 6 项核心缺陷：
1. P1（实质缺陷）：`calculateTimeDecayAndUrgencyMultiplier` 由 |ΔS| 绝对值对称改为按带符号分差方向非对称——搏命势能仅作用于落后方、控场降速仅作用于领先方，新增 `urgency_multiplier_home/away` 输出，修复「落后 2 球被错误降速」的反直觉 bug；
2. P2（一致性）：大小球 EV 由单变量泊松改为双变量网格（含 Dixon-Coles τ 修正），与让球 EV 共享同一概率模型（新增 `calculateTotalFiveStateDistributionFromGrid`）；
3. P3（精度）：`devigShin` 由固定步长梯度下降改为二分法单调收敛；
4. P4（语义）：让球/大小球 EV 的贝叶斯收缩改用「等效全赢概率 = P(全赢) + 0.5*P(赢半)」作为模型胜率，与 `1/odds` 内隐全赢概率同量纲，修复「全赢+赢半」简单概率和量纲不一致导致的冷门过度收缩；
5. P5（可校准）：`calculateBivariatePoissonGrid` 新增 `rhoOverride?` 可选参数，接入 OOS 历史样本 MLE 拟合后可传入校准值，`rho_source` 自动标记 `CALIBRATED_ESTIMATE`。
6. P6（实质缺陷）：`parseMarketValueToNumber`（lineupImpact.ts）与 `parseMarketValue`（prematchPriorEngine.ts）身价单位换算错误——`B`（billion=10⁹）被误等同于 `亿`（10⁸，差 10 倍）、`M`（million=10⁶）被误等同于 `万`（10⁴，差 100 倍）；修正为「亿×10000 / B×100000 / 万×1 / M×100」统一到万欧量纲，修复 `€15.5M` 被低估 100 倍污染 λ 先验身价比例的问题。

验证：`verify_quant_engine` 11/11、`verify_p0_math_closure`、`verify_half_time_quant_engine`、`verify_full_pipeline_00_03`、`verify_prematch_prior_and_market_divergence` 全部通过；身价解析 6 用例内联验证全 PASS（`1.2亿`→12000、`850万`→850、`€15.5M`→1550、`€120M`→12000、`1.5B`→150000、无单位`1234`→1234）；`npx tsc --noEmit` 无错误；`git diff --check` 无空白错误（仅 Windows LF→CRLF 环境警告）。
已知无关失败：`npm run test:ts` 中 `tests-ts/api.integration.test.ts`（旧系统 `server.ts` 健康检查超时）为环境问题，与本次改动无关。
### 03 计算模块全局审查 · 续（2026-09-24）

1. 【权重平滑】`liveStatsWeight` 消除 30'' 断点跳跃：由「0-30'' 为 0.20→0.25，30'' 瞬间跳 0.60」改为连续分段线性「0.20→0.40(30'')→0.55(45'')→0.78(70'')→0.85(90'')」，四段衔接点值相等，全程无跳跃。验证：`verify_quant_engine` 11/11、`npx tsc --noEmit` 通过。
2. 【进球分布审查】`goalDistribution` 狄利克雷-多项式平滑 + all/venue 分层融合已核实：影响时间分布而非进球总量，样本收缩保守（ALPHA=1.0），结论记录于台账。
3. 【审查台账】新建 `refactor/03_quant_engine/LAYER03_AUDIT_LEDGER.md`，记录 A1/A2（建模错误）、B1-B4（参数零拟合）、C1-C5（信号重复/失真）及合并关系，供后续全局审查持续维护。
4. 【A1 主场优势双重编码修复】`prematchPriorEngine.ts`：`baseGoalsH/A` 由 0.56/0.44 改中性 0.50/0.50，`gammaHome/Away` 由 1.18/0.85 改 1.16/0.86，主客比由 1.767 降到 1.349（现实 1.25~1.40）。同步更新 `verify_quant_engine` Test10 断言（divergence_delta 阈值 0.45→0.25，因修复后理论先验更接近市场）。验证：`verify_quant_engine` 11/11、`verify_prematch_prior_and_market_divergence`、`npx tsc --noEmit` 全绿。

### 外部审计 P0 修复（2026-09-25，完成）

基于外部 AI 深度审计报告逐条验证后，修复第一阶段 P0/P1 共 9 项：

1. 【P0-04 生产门禁 fail-close】`permissive_oos_mode` 默认值 `true`→`false`（index.ts + candidateStateMachine.ts），生产入口不再 fail-open；研究模式需显式传 true。同步更新 verify_candidate_state_machine / verify_quant_engine 测试显式传参。
2. 【P0-03 快照时间口径】`source_snapshot_at` 不再用开赛时间 `beijing_start_time`，改用 `created_at`，与 dataAudit.ts 口径统一。
3. 【P0-05 盘口解析阻断】`calculateAsianHandicapEV`/`calculateTotalGoalsEV` 解析失败返回 `preferred_side:'none'` 无信号，不再降级为平手盘/0球盘产生伪 EV。
4. 【P0-06 B级试水语义】新增 `TRIAL_UNLOCKED` 状态，B级(30≤ESS<200)不再标 `productionEligible=true`，区分"试水"与"生产"。
5. 【P1-13 future-dated】recentForm/h2hDecay 的未来日期历史样本不再被 `Math.max(0,..)` 吸收为 0 天前。
6. 【P1-14 H2H 成对匹配】H2H identity 改为双方成对匹配（主客可互换），任一球队单独命中不算 H2H。
7. 【遗留测试同步】verify_regression_fixes 的 live_stats_weight 期望值同步 A2 新分段（45'=0.55、75'=0.797），并修正 45' 测试漏传 timing.minute 的 mock 缺陷。
8. 【P1-01 OOS 盘口分桶】`OosCalibrationSample`/`QuantCalibrationProfile` 加 `line`/`side` 可选字段，createProfile/分桶/selectOosCalibrationProfile 按盘口+方向分桶，`resolveOosProfile` 接口扩展为 `(market, line?, side?)`。
9. 【P0-02 双时间戳语义标记】selectOosCalibrationProfile 处标注 created_at 为"组装时点"语义模糊，跨层待办（需 02 层新增 prediction_at/source_captured_at 字段）。

验证：`npx tsc --noEmit` 零 03 错误；`verify_quant_engine` 11/11、`verify_candidate_state_machine`、`verify_p0_math_closure`、`verify_regression_fixes`、`verify_full_pipeline_00_03` 全部通过。

### 第二阶段：数学闭合修复（2026-09-25，完成）

基于报告第 11 节"第二阶段：修正数学闭合"6 项全部落地：

1. 【P1-05 λ 反演概率拟合】`marketDivergenceEngine.jointMarketLambdaEstimate` 目标函数由 EV²（价格函数）改为模型等效全赢概率 vs 市场公允概率的平方差（proper scoring）。
2. 【P1-07 grid 边际 λ】`calculateBivariatePoissonGrid` 新增输出 `grid_marginal_lambda_home/away`（归一化后的 E[H]/E[A]），暴露 Dixon-Coles τ 与场面耦合修正对边际均值的偏移。
3. 【P1-08 动态支持上界】`marketDivergenceEngine` 滚球 1X2 反演由固定 `maxGoals=6` 改为 `poissonSupportUpperBound` 动态上界，消除高 λ 截断偏差。
4. 【P1-34 收缩锚点去 vig】`applyBayesianShrinkage` 调用处传入比例剥水后的公允概率（`1/odds/overround`），不再用含 vig 的 `1/odds` 作锚点。
5. 【P1-35 五态收缩】EV 收缩改为只缩放「赢的贡献」（全赢+赢半），保持「输的贡献」（输半+全输）不变，不再整体 `EV×ratio` 错误缩放输的部分。
6. 【P1-37 conflict resolver 五态】`index.ts` 冲突消解由二值 win/loss 改为五态精确结算（全赢=1/赢半=0.5/走盘=0/输半=-0.5/全输=-1），赢半不再当全赢计入 joint 概率。
7. 【P1-36 quarter Kelly 已满足】当前 Kelly 为 `EV/(4×(odds-1))` + 5% 上限，即报告建议的"固定保守比例"，无需改动。

验证：`npx tsc --noEmit` 零 03 错误；`verify_quant_engine` 11/11、`verify_p0_math_closure`、`verify_prematch_prior_and_market_divergence`、`verify_full_pipeline_00_03` 全部通过。

### 第二阶段补充：数学闭合剩余项（2026-09-25，完成）

1. 【A3/P1-09 无市场 λ 退化】`poissonDecayModel` 的 if 条件由 `market_stance !== MARKET_DATA_MISSING` 放宽为 `lambda_base_home/away > 0`，无市场数据时改用 `calibration.lambda_base`（=theoryPrior，保留主客强弱），不再走 `getLeagueBaseGoals` 等分主客丢弃身价/近期/H2H/阵型四大维度差异。
2. 【P1-10 netDelta 二维】`marketDivergenceEngine` 新增 `divergence_total_delta`（Δtotal = deltaH + deltaA），与 `divergence_delta`（Δdiff）构成二维偏差描述。
3. 【P1-06 去抽水混杂】已落地（2026-09-25）：三项市场统一 Shin 去抽水，见下方「方向 3」记录。此前评估「Shin 需 3+ 项才有意义」不准确，已修正。
4. 【P1-11 live market weight 拟合】需 OOS 数据按市场类型/阶段拟合，当前样本为空，标记待办。

验证：`npx tsc --noEmit` 零 03 错误；`verify_quant_engine` 11/11、`verify_prematch_prior_and_market_divergence` 全部通过。

### 第三阶段：实时特征重复计权（2026-09-25，部分完成）

1. 【P1-28 earlyPhaseBaseline 冒充 observed support】`eventMomentumFusion` 移除 `Math.max(earlyPhaseBaseline, ...)` 对 statsSupport 的正值注入，statsSupport 只反映真实 observed support；前 35 分钟样本未满问题改由 conflict 判定的 `currentMinute >= 35` 门禁处理（原 `>= 30`）。
2. 【P1-22 积分单位统一】新增 `calculateTimedMomentumIntegral`（梯形 dt 加权，与 waveform AUC 同口径），`momentumTimeline` 的 integral_5m/15m/full 由「按采样点累加」统一为「按分钟 dt 加权」，`selectTimedWindow` 改返回 `TimedMomentumPoint[]` 保留时间戳；配套将归一化分母由「样本数」改为「有效分钟数」，消除采样率变化对能量尺度的失真。

3. 【C2 momentum/stats 重复计权】`eventMomentumFusion` 三源融合引入相关性折损：momentumSupport 与 statsSupport 高度相关（危攻多→射门必多）时，对二者的贡献做折损（系数 0.15 为保守启发式，精确值待 OOS 拟合），避免同一信息双重计入 threat。

剩余（需更大重构，标记待办）：P1-23（z-score 标准化需历史分布）、P1-24（5/10/15m 嵌套窗口 orthogonal 化）、P1-25/26/27（指标复用需 primitive features 重做）、P1-32（live market 只做 residual correction，需 OOS 拟合相关性系数）。

验证：`npx tsc --noEmit` 零 03 错误；`verify_quant_engine` 11/11、`verify_full_pipeline_00_03` 全部通过。

### P0-02 跨层时间戳字段落地（2026-09-25，完成）

落地报告 P0-02 的跨层时间戳口径（此前仅标记为跨层待办）：

1. 【02 层类型】`CanonicalMatch` 新增 `source_captured_at: string | null`（数据源盘口快照时点）。
2. 【02 层组装】`canonicalMatchAssembler` 填充 `source_captured_at = ybtyMatch.captured_at ?? null`（GenericYbtyMatch 本就带 captured_at，此前组装时丢弃、误用 `new Date()` 作 created_at）。
3. 【03 层 OOS】`selectOosCalibrationProfile` 时间口径由 `match.created_at`（组装时点）改为 `match.source_captured_at ?? match.created_at`（盘口快照时点优先）。
4. 【05 层类型修复】补上第一阶段 P0-06 的遗漏：`05_portfolio_risk/types.ts` 的 `candidate_pipeline_state` 类型加 `TRIAL_UNLOCKED`（此前仅修了 03 层类型，导致 05 层 tsc 报错）。

说明：YBTY 的 captured_at 是「盘口快照采集时间」，是 OOS「预测时点」最关键的代理（盘口是预测依据）；雷速顶层 captured_at 的透传（统计/时序快照时点）留作后续补充。

验证：`npx tsc --noEmit` 全工程零错误；`verify_canonical_match_assembler`、`verify_full_pipeline_00_03`、`verify_quant_engine` 11/11 全部通过。

### 方向 B：OOS 沉淀链路核查（2026-09-25，结论：链路已端到端打通）

核查 Layer 06 结算 → OOS 样本沉淀链路，结论为**链路已完整打通**，当前 0 条 accepted 是冷启动期数据积累的自然过程，非代码断点：

- 链路完整：`05_portfolio_risk/ledgerPersistence`（正式台账）→ `06_settlement_audit/formalLedgerAdapter.convertFormalLedgerRecords` → `oosArchiveService.ingestSettledRecordsAndPersist` → `historicalBacktestIngestion.ingestHistoricalBacktestRecords`（OP-06-02 完整校验 + 语义去重 + 时间窗口）→ `buildOosCalibrationArchive`（持久化）。
- 运行时入口已连接：`server/routes/refactorLedgerRoutes.ts`（`/settle`）与 `server/services/matchArchiveStore.ts` 的结算核销流程统一调用 `convertFormalLedgerRecords → ingestSettledRecordsAndPersist`。
- ⚠️ 旁路已堵死（2026-09-29）：`/api/refactor/oos-sample/manual-entry` 端点（旧实现用 `appendSampleAndRebuildArchive` 绕过 OP-06-02 完整校验 + `|| 0.55`/`|| 2.5` 硬编码兜底，且前端字段与后端从不匹配）已删除，前端 OOS 直录表单同步移除。生产侧 OOS 写入入口现唯一化为 `ingestSettledRecordsAndPersist`。
- 测试覆盖：`verify_p3_ledger_snowball.ts`（雪球闭环）+ `verify_historical_backtest_ingestion.ts` 均验证通过。
- 准入条件：PRODUCTION_UNLOCKED 或 COLD_START_PERMISSIVE+OOS_COLD_START_EXEMPT 的正式推荐，赛后录入真实比分结算（WIN/LOSE 二元）后自动沉淀。

【P1-02 ESS 聚类 待办】尝试修复 effectiveSampleSize 的 cluster ESS（唯一比赛数而非样本数），发现 `OosCalibrationSample` 缺 `match_id` 字段无法精确聚类，且与现有测试「240 独立样本」假设冲突；已回退并标记：正确实现需先给 OosCalibrationSample 增加 match_id 字段（从 FormalRecommendation.match_id 跨层透传）。

### 方向 1：match_id 跨层透传（2026-09-25，完成）

为 P1-02 ESS 聚类打地基，打通 match_id 从 05 → 06 → 03 的完整透传链（此前中间层断裂）：

- **现状**：`FormalRecommendation.match_id`（05 层）与 `OosCalibrationSample.match_id?`（03 层）均已存在，唯独中间层 `HistoricalBacktestRecord`（06 层）缺 match_id，导致透传中断。
- **改动**：
  1. `06_settlement_audit/types.ts`：`HistoricalBacktestRecord` 新增 `match_id: string`（必填）；
  2. `formalLedgerAdapter.convertFormalLedgerRecords`：`match_id: record.match_id` 透传；
  3. `ledgerRecordAdapter.adaptSettledFormalLedgerRecord`：`match_id: record.match_id` 透传（第二条转换路径）；
  4. `historicalBacktestIngestion.toOosSample`：`match_id: record.match_id` 透传进 OosCalibrationSample。
- **测试**：`verify_p3_ledger_snowball` 新增 match_id 端到端透传断言（convert→toOosSample）；`verify_historical_backtest_ingestion` baseRecord 补 match_id。
- **顺带发现并修复的测试数据 bug**：`appendApprovedLegs` 的 sameMatch 判断用 OR 逻辑（match_id 相同即视为同场，match_id 是更权威标识），而 `secondLiveApproved` 之前通过 `{...mockLiveApproved}` 继承了相同 match_id 却改了 teams（Liverpool vs Man City），导致被幂等覆盖；已补 `match_id: match_live_test_${runId}_2`。
- **下一步 P1-02**：可基于 `OosCalibrationSample.match_id` 实现 cluster ESS（唯一比赛数），但需同步调整 `verify_quant_engine` 的「240 独立样本」测试构造（让 240 样本对应 240 个 match_id）。

### 方向 1.5：P1-02 cluster ESS（2026-09-25，完成）

基于 match_id 跨层透传落地，实现 `effectiveSampleSize` 的 cluster ESS 校正（此前等于 `samples.length` 简单累加）：

- **修复**：`oosCalibrationEngine.createProfile` 的 `effective_sample_size` 从「原始样本数累加」改为「唯一 match_id 聚类」——同一场比赛的多个盘口/方向高度相关，不得冒充独立样本；缺 match_id 的历史存量样本（跨层透传前）退化为各自独立计数。
- **语义分离**：`sample_size` 仍保留原始样本数（可审计），`effective_sample_size` 承载聚类后的独立比赛数。
- **测试**：
  1. `verify_quant_engine` 的 240 样本补唯一 match_id（每样本一场独立比赛），断言仍 `VALIDATED`；
  2. 新增 cluster ESS 专项断言：240 样本共享 60 场比赛（每 4 样本同 match_id）→ `effective_sample_size === 60` 且 `status === INSUFFICIENT_EVIDENCE`，并断言 `sample_size === 240` 保留原始计数。
- **下游自动获益**：`isValidatedOosProfile`（index.ts）与 `candidateStateMachine` 读取 `effective_sample_size`，自动获得 cluster ESS 校正，无需改动。
- **验证**：tsc 零错误；verify_quant_engine 11/11、verify_regression_fixes、verify_candidate_state_machine、verify_full_pipeline_00_03、verify_prematch_prior_and_market_divergence、verify_p3_ledger_snowball、verify_historical_backtest_ingestion 全部通过。
### 方向 2：P1-03 Brier 基线 → Brier Skill Score（2026-09-25，完成）

审计报告 P1-03（🔴）：Brier 基线固定 0.25/熔断 0.28，不同市场/基准率不可比。改用 climatology / market baseline + BSS。

- **修复**：`oosCalibrationEngine.createProfile` 的熔断判定从「绝对 Brier > 0.28」改为以基线为基准的 Brier Skill Score：
  1. **climatology 基线**：base_rate = mean(outcome)，baseline = base_rate × (1 - base_rate)；
  2. **market 基线**：有 `market_probability` 时用 mean((market_prob - outcome)²)，优先采用；
  3. **BSS** = 1 - Brier_model / Brier_baseline；baseline≈0 时 BSS 置 null（交由绝对兜底）。
- **熔断规则**：
  - 主熔断：BSS < 0（模型劣于基线，无技能）——跨市场/基准率可比，罕见事件（base rate=0.1）盲猜 0.5 会因 BSS=-1.78 熔断，而旧绝对阈值 0.28 会漏放；
  - 兜底熔断：绝对 Brier > 0.28（baseline 退化或极端失准时仍拦截，保持向后兼容）。
- **类型**：`OosCalibrationSample` 加可选 `market_probability`；`QuantCalibrationProfile` 加 `brier_baseline`、`baseline_type`、`brier_skill_score` 三字段。
- **market_probability 透传边界**：`HistoricalBacktestRecord` 仅有 `odds`（含 vig 单边赔率），非 devigged fair probability，故 `toOosSample` 暂不透传 `market_probability`（避免 vig 抬高基线使 BSS 偏乐观）；待上游产出 devigged fair probability 后再透传（与 P1-34 去 vig 契约一致）。
- **测试**（verify_quant_engine 新增 3 组）：
  1. 罕见事件 base rate=0.1 + 盲猜 0.5 → climatology baseline=0.09、BSS<0、REJECTED（绝对 0.25<0.28 本不会熔断）；
  2. 有 market_probability → baseline_type=MARKET_IMPLIED、baseline=0.25；
  3. 模型有区分度（0.7/0.3）→ BSS>0、VALIDATED。
  - 另修正原 240 样本与 cluster ESS 样本的 model_probability（恒 0.6 对 base rate 0.5 无技能，BSS 为负会误熔断）。
- **验证**：verify_quant_engine 11/11、verify_candidate_state_machine、verify_regression_fixes、verify_p3_ledger_snowball、verify_historical_backtest_ingestion、verify_full_pipeline_00_03、verify_p0_math_closure、verify_prematch_prior_and_market_divergence 全部通过。
### 方向 3：P1-06 去抽水方法混杂 → 统一 Shin 去抽水（2026-09-25，完成）

审计报告 P1-06（🟠）：Winner 用 Shin，总分/让球用比例剥水，去抽水方法混杂。统一为经验证的 market probability reconstruction。

- **问题**：1X2 独赢用 `devigShin`（Shin 知情交易者模型，校正 favorite-longshot bias），但 AH 让球 / OU 大小球用比例剥水（Multiplicative），三种市场去水方法不一致，深盘冷门锚点产生系统性偏差。
- **修正此前评估**：此前（方向 3 评估阶段）判断「Shin 需 3+ 项才有意义，2 项市场用比例剥水是合理近似」。该判断不准确——Shin 原始模型即针对 2 项赛马市场，对 2 项 AH/OU 同样有效且 z 估计有实际意义（实测 [1.60,2.30] 得 z=0.0599，favorite 概率 0.5951 > 比例剥水 0.5897）。
- **修复（3 处比例剥水 → Shin）**：
  1. `devigCalculator.calculateAsianHandicapEV`：`spreadOverround` 内联比例剥水 → `devigShin([homeOdds, awayOdds])`；
  2. `devigCalculator.calculateTotalGoalsEV`：`totalOverround` 内联比例剥水 → `devigShin([overOdds, underOdds])`；
  3. `marketDivergenceEngine.proportionalFairOdds` → 重命名 `shinFairOdds`（内部 `devigShin`），用于 λ 反演的 AH/OU 公允赔率。
- **测试**（verify_p0_math_closure 新增 2 组）：
  1. 深盘 [1.60,2.30]：Shin fair_probs 归一化、favorite 概率 > 比例剥水、longshot < 比例剥水、z>0；
  2. 对称 [1.90,1.90]：Shin 退化为 0.5/0.5。
- **验证**：verify_p0_math_closure、verify_quant_engine、verify_prematch_prior_and_market_divergence、verify_full_pipeline_00_03、verify_regression_fixes、verify_candidate_state_machine、verify_p3_ledger_snowball、verify_historical_backtest_ingestion、verify_end_to_end_scheme7 全部通过。







### 方向 4：P1-27/23/24/26 结构去重（无需样本的纯结构问题，2026-09-25，完成）

审计报告 P1 清单中四个"不需要 OOS 样本、纯结构错误"的问题（此前被过度保守地归入"需样本"类，经复核纠正）：

**P1-27 burst 双重计数（eventMomentumFusion.evaluateGoalClimax）**
- 原 `rawClimax = 15 + phiSlope + phiAcceleration + phiDensity + phiCluster + phiEpi`，其中 phiDensity（近5分钟事件密度）与 phiCluster（连续角球/密集射门）反映同一 burst，被并列相加放大两次。
- 修复：合并为单一 `phiBurst`，复用 `calculate10mBurstCluster.burst_multiplier`（SSOT）作为"事件密度形态"的乘法增强因子，而非独立加分项。

**P1-23 + P1-24 能量部分（momentumTimeline.momentum_pyramid.composite_energy）**
- 原 `composite_energy = 0.40*currentInstantMomentum + 0.35*energy5 + 0.25*energy15`，存在两处错误：
  - P1-23：瞬时动量（瞬时值）与窗口平均能量（积分/分钟）时间尺度不同，直接加权无物理意义；
  - P1-24：energy5 ⊂ energy15 嵌套，同一事件被双重计数。
- 修复：合成正交时段能量 `composite_energy = 0.60*energy5 + 0.40*energy15_5`（energy15_5 = 5~15分钟前的正交时段平均能量），瞬时动量不再混入复合能量（已由 `current_instant_momentum` 独立字段承载）。

**P1-26 单层建模（eventMomentumFusion.calculateLiveThreatTrinity.rawStatsValue）**
- 原 `rawStatsValue = xt*0.25 + penetration*1.0 + accuracy*1.2 + corners*0.20 + tti*0.20 + pe*0.20 + bigChanceThreat*0.35`，7 个指标共用同一批原始统计（DA/射门/射正/角球/控球），高度共线，平铺加权=同一证据重复计权。
- 修复：单层建模——xt（已聚合 DA/角球/射偏/射正/门柱）作为单一主项，仅补充 xt 未覆盖的独立维度（tti 转化效率、pe 控球效率、bigChanceThreat 绝佳机会），移除与已有聚合完全共线的 penetration(=DA/attacks⊂tti)、accuracy(=on/shots⊂tti)、corners(已含于xt)。

**验证**：verify_quant_engine、verify_p2_tactical_momentum、verify_regression_fixes、verify_full_pipeline_00_03、verify_philippines_vietnam_simulation、verify_end_to_end_scheme7、verify_candidate_state_machine、verify_p3_ledger_snowball、verify_historical_backtest_ingestion、verify_prematch_prior_and_market_divergence、verify_p0_math_closure 全部通过。

**已知遗留（已修复，2026-09-25，均属旧系统/根目录边界，用户放行后处理）**：
1. `tests-ts/quantHardeningAntiFakeData.test.ts` 第 2064 行断言 `integral_15m.net >= 175`（简单求和）是 P1-22 把积分改为梯形 dt 加权前的旧值，实际梯形积分为 150 → 已更新为 `>= 150`（该文件 32/32 通过）。
2. `npm run test:ts` 的 HTTP API 集成测试（`tests-ts/api.integration.test.ts`）「test server did not become healthy」失败 → 根因是旧系统 `config/appConfig.ts` 把 `port` 硬编码 3000（历史「端口加固」遗留，`host` 读环境变量而 `port` 不读，行为不一致），集成测试通过 `PORT` 环境变量指定随机端口失效 → 已修复为 `port: Number(process.env.PORT) || 3000`（生产默认仍 3000）。修复后 `npm run test:ts` 115/115 全绿。


### 方向 5：P1-29 + P1-30 半场时钟连续性与上半场 hazard 尺度（无需样本的纯结构问题，2026-09-25，完成）

审计报告 P1 清单中两个 M4（泊松推演）纯结构错误，均无需 OOS 样本：

**P1-29 remaining minutes 半场边界离散下降（poissonDecayModel.calculateExpectedRemainingMinutesIncludingStoppage）**
- 原上半场分支（minute<45）把「上半场补时 1.5 分钟」计入 remaining（44' → 51.5），而下半场分支（minute>=45）直接当「下半场开始」（45' → 49），把补时一次性吞掉 → 44'→45' remaining 从 51.5 突变到 49（-2.5 分钟），导致 uniformTimeFraction 与价格在半场边界跳变。
- 修复：显式 half-time state——minute===45 单独分支，remaining = 上半场补时 + 下半场常规 45 + 下半场补时（=50.5），使 44'→45' 仅降 1 分钟；补时正确在 45'→46' 消耗（-2.5）。
- 数值：44'=51.5 / 45'=50.5 / 46'=48。

**P1-30 上半场 λ 尺度错误（poissonDecayModel.calculateInPlayPoissonFeatures.first_half_poisson）**
- 原 `uniformFirstHalfFraction = remainingFirstHalfMinutes / 45.0` 用分母 45（「占上半场」0~1），而 baseHomeLambda 是全场 90 分钟 λ，且 DNA 分支 calculateFirstHalfPhasedDNATimeFraction 返回「占全场」0~0.5 → 无 DNA 权重回退时上半场 λ 被高估约 2 倍，直接污染 devigCalculator 的半场让球/大小球 EV。
- 修复：分母改为 90（uniformFirstHalfFraction = remainingFirstHalfMinutes / 90.0），与 DNA 版本「占全场」尺度一致。
- 数值：@0' uniform(45/90)=0.5 与 DNA=0.5 一致；legacy(45/45)=1.0 为修复前错误值。

**验证**：新增 `verify_p1_29_30_half_time.ts`（专项断言）；verify_quant_engine 11/11、verify_full_pipeline_00_03、verify_regression_fixes、verify_end_to_end_scheme7 全部通过；`npx tsc --noEmit` 零错误；`npm run test:ts` 115/115 全绿。


### 方向 6：P1-41 同场多 market 组合相关性控制（无需样本的纯结构问题，2026-09-25，完成）

审计报告 P1-41（🔴 Pipeline）：同一比赛多 market / secondary lines 无 portfolio correlation control，实际暴露被严重重复（同一底层投注事件被多个盘口市场重复计入）。

**根因**：`applyPortfolioRiskFilters`（05 层 riskFilter.ts）的暴露控制只按 `match_id + market + direction` 精确计数，同一场比赛的不同 market（如 AH_MAIN HOME 与 EURO_1X2 HOME，或 AH 主/副盘同向）被当作完全独立腿，组合相关性被完全忽略。

**修复（riskFilter.ts）**：引入「底层投注族聚类」+「单场暴露上限」两道机制：
- `marketCluster()`：把盘口归并为底层投注族——`OUTRIGHT`（EURO_1X2 / ASIAN_HANDICAP 主/副盘，赌胜负）、`TOTALS`（TOTAL_GOALS 主/副盘，赌进球）、`OTHER`（保底）。
- **market cluster dedup**：同一场比赛内，同一底层投注族 + 同一方向（directionKey 统一大写）只保留一条，跨 market 同向重复（AH_MAIN HOME + EURO_1X2 HOME / AH 主副盘同向）去重，含历史台账 existing_ledger 跨批次去重。
- **per-match exposure cap**：同一场比赛所有 leg（含历史台账）总量上限 `MAX_LEGS_PER_MATCH = 2`，避免跨族（胜负 + 进球）叠加导致组合暴露被低估。

**验证**：新增 `verify_p1_41_market_correlation.ts` 7/7 断言（同族同向去重、主副盘去重、跨族共存、per-match cap、跨台账去重、异场不误伤、同族异向 cap 约束）；verify_portfolio_risk、verify_layer04_05_candidate_boundary、verify_end_to_end_scheme7 全部通过；`npx tsc --noEmit` 零错误；`node --import tsx --test tests-ts/*.test.ts` 115/115 全绿。


### 方向 7：P1-17 + P1-31 样本量口径与 observed pace 收缩（无需样本的纯结构问题，2026-09-26，完成）

**P1-17（🔴 Context）：Goal DNA 以「进球数」充当样本量**
- 根因：`goalDistribution.ts` 的 `extractWeightsForSide` 用 `nAll = allParsed.totalGoals`（进球数）作为样本量/置信度/收缩的 n，5 场打进 15 球会被误判为 15 个高证据样本（confidence=HIGH），狄利克雷平滑 pseudo-count 也误用进球数。
- 修复：`nAll = allScope?.matches_count`、`nVenue = venueScope?.matches_count`（比赛数）；狄利克雷平滑仍用进球频数 `allParsed.totalGoals`（保持共轭更新数学正确）。阈值同步改为比赛数口径（与 `evaluateGoalTimingValidity` 的 8 场对齐）：INSUFFICIENT < 3 场、HIGH >= 8 场、MEDIUM 收缩 `shrinkage=(nAll-3)/5`、venue 70/30 融合 >= 5 场、venue 50/50 融合 >= 3 场。

**P1-31（🟠 M4）：observed goals pace = goals/elapsed×90 朴素外推**
- 根因：`poissonDecayModel.ts` 的 `observedFullMatchRate = Math.min(5.5, (currentTotalGoals / elapsedMinute) * 90)`，早期偶然进球被线性外推到极端全场速率（16' 进 1 球 → 5.6），过度影响 λ。
- 修复：改为 Gamma-Poisson 贝叶斯收缩——`shrinkage = K_PRIOR/(K_PRIOR+elapsed)`（K_PRIOR=45 伪暴露分钟数），`observedFullMatchRate = prior*shrinkage + naive*(1-shrinkage)`，早期收缩强、随观察时间增加逐渐放开。

**验证**：新增 `verify_p1_17_31_sample_size.ts`（5 场 15 球 → sample_size=5/MEDIUM；20' 进 1 球 → observed rate 3.288 < 朴素 4.5）；同步更新 `verify_regression_fixes.ts` Goal DNA 测试与 `tests-ts/quantHardeningAntiFakeData.test.ts` Scheme 5/Scheme 23（加 matches_count、口径改为比赛数）；verify_quant_engine 11/11、verify_regression_fixes、verify_end_to_end_scheme7 全部通过；tests-ts 115/115 全绿。

### 方向 8：P1-18 终盘 late-game information 去耦（无需样本的纯结构问题，2026-09-26，完成）

**P1-18（🔴 Context）：Goal DNA + urgency 均在 late phase 放大，同一 late-game information 重复计权**
- 根因：`late_game_dna`（76-90' 进球占比）在 `poissonDecayModel.ts` 被两处重复计权——① `time_fraction` 已通过 `calculatePhasedDNATimeFraction`（DNA 时间积分）编码 late_dna；② 独立 `resonanceMultiplier = 1.0 + (late_dna - 0.25) * 1.5 * C_i` 在 70' 后额外放大 λ 15%~22.5%。
- 修复：移除独立 `resonanceMultiplier` 乘子（变量声明、共振/退火分支、remainingFactor 乘法链），保留「相干/退相干」作为 `time_fraction` 的条件门控——现场物理不支撑（coherentState < 1.0）时 `effectiveTimeFraction` 向均匀中性时间平滑收敛并记录 `decoherence_applied`；现场物理支撑时直接沿用 DNA 时间积分，不再额外放大 λ。

**验证**：新增 `verify_p1_18_late_phase_dedup.ts`（去耦断言：resonance 字段移除、coherent_state/decoherence 保留、time_fraction 编码 late_dna、退相干 λ 严格压制）；tests-ts 115/115（Scheme 24 相干/退相干仍通过）、verify_quant_engine 11/11、verify_regression_fixes、verify_end_to_end_scheme7 全部通过。台账 E2 标记 [x]，E0 的 resonance 部分标注已修复。

### 方向 9：P1-20 / P1-21 / P1-39 / P1-40 / P1-42 五连修（无需样本的纯结构问题，2026-09-26，完成）

**P1-20（🟠 Context）：injury impact 使用 squad market value，而 squad value 又进入 prior（价值信号重复使用）**
- 修复（`lineupImpact.ts`）：`evaluateAbsences` 移除 `teamSquadMvTenK`（外部球队总身价）参数，`teamSquadMvEur`/`effectiveSquadMvEur` 改为只基于首发球员个体身价 `startersTotalMvEur * 1.35`，injury impact 独立建模，与 prior 的球队身价信号解耦。

**P1-21（🟠 Context）：avg age schema / calculation 类型不一致（字符串兜底从未生效）**
- 修复（`lineupImpact.ts`）：新增 `parseAvgAgeFallback`，解析雷速 `home_average_age` 字符串（如 "27.5岁"）为 number 兜底；调用处传入 `lineup?.home_average_age`，starters 有效年龄 < 5 时兜底真正生效。

**P1-39（🟠 M6）：market_confidence = model_stability_score（字段命名误导）**
- 修复（`index.ts`）：`market_confidence` 改为 `Math.max(0, 100 - marketCalibration.market_confidence_penalty)`，反映真实市场校准信心，与 `model_stability_score` 分开。

**P1-40（🟠 OOS）：edge_confidence 使用 Math.max 跨 profile（单强 profile 支配全局）**
- 修复（`candidateStateMachine.ts`）：`Math.max(...oosHistoryScores)` 改为按有效样本量 (ESS) 加权的候选聚合均值，弱 profile 如实拉低整体 edge 信心。

**P1-42（🟠 Pipeline）：isColdStartUnlocked 初始 false 但状态可为 COLD_START_PERMISSIVE（输出语义矛盾）**
- 修复（`candidateStateMachine.ts` + `types.ts`）：删除死字段 `is_cold_start_unlocked`（从未被设为 true），`state` 作为单一状态源（COLD_START_PERMISSIVE 即表示冷启动已放行）。

**验证**：新增 `verify_p1_20_21_39_40_42.ts`（P1-20 伤员折损不被巨大 squad value 稀释、P1-21 字符串年龄兜底生效、P1-40 ESS 加权均值 64 而非 max 74、P1-42 死字段已删）；`verify_quant_engine.ts` 新增 P1-39 断言（market_confidence = 100 - penalty）；tsc 零错误、verify_quant_engine 11/11、verify_candidate_state_machine、verify_regression_fixes、verify_end_to_end_scheme7、tests-ts 115/115 全部通过。台账 D3 注明 injury impact 已与 squad_market_value 解耦。


### 方向 10：P1-15 + P1-33 修复（纯结构）；P1-12 / P1-16 / P1-38 需数据工程（阻塞，2026-09-26）

**P1-15（🟠 Context）：H2H 时间 anchor 可 fallback 到 Date.now（样本时间不确定）**
- 修复（`h2hDecay.ts` + `recentForm.ts`）：`resolveMatchAnchorTimestamp` 无可靠时间（无 created_at / beijing_start_time）时返回 `null` 而非 `Date.now()`；`calculateH2HDecayWeights` / `calculateRecentFormWeights` 的 `currentTimestamp` 改为 `number | null`，无锚点时样本 `isValidTimeWindow`/`isValidTime` 强制 false（时间不确定 → invalid）。
- 同步更新 tests-ts Scheme 1 / 365-Day Cutoff 两个测试（补 `created_at` 锚点，保留其「时间截止 / venue inversion」验证意图）。

**P1-33（🟠 M4）：deprivation/cascade 与 siege factor 可能重复编码（同一状态重复影响 grid）**
- 修复（`poissonDecayModel.ts` + `types.ts`）：在 `lambda_decomposition` 明确暴露 `deprivation_damp_home/away` 与 `siege_breakthrough_boost_home/away` 四字段，明确 feature lineage——deprivation 是单向（被压制方进攻塌缩，基于 zero_shot_deprivation + field_tilt <= 0.30），siege 是对偶（压迫方红利，基于对方 deprivationDamp < 0.60 + 本方 field_tilt >= 0.65），两者作用方向相反、不构成同向重复计权。

**验证**：新增 `verify_p1_15_33.ts`（无锚点 → H2H/recent 样本全部 invalid）；`verify_quant_engine.ts` 新增 P1-33 四字段暴露断言；tsc 零错误、verify_regression_fixes、verify_quant_engine 11/11、verify_end_to_end_scheme7、tests-ts 115/115 全部通过。

**🔴 阻塞（需数据工程，非纯结构，不强行实现伪修复）**：
- **P1-12**：T1-T5 tier 静态未版本化 → 需「season/date versioned strength」历史 tier 数据源（每赛季每队 tier + 生效日期），当前 `tierData.ts` 为单一静态字典，无历史版本，回测会引入未来污染。
- **P1-16**：opponent normalization 用静态 tier 且又进 prior → 需「fitted opponent strength」（基于对手实际战绩的独立拟合强度），当前无拟合数据源。
- **P1-38**：confidence score 为 hand-coded deduction（20/25/8/6 魔法扣分）→ 需「calibration / reliability score」（基于 OOS 校准的历史预测 vs 实际可靠性），当前仅部分市场有 OOS brier，全面校准需完整回测样本积累。
- 上述三项涉及数据采集/模型拟合，强行实现会引入伪数据，违反「不编造数据」红线，故标注阻塞、留待数据工程阶段。


### 方向 11：14 项"未完成"清单核对（P1-01/05/07/08/09/10/22/25/28/32/34/35/36/37，2026-09-26）

上一轮误判这 14 项"全部未做"，实际核对代码与交接记录后确认：**12 项早已在前几批（方向 3 等）修复**，仅 2 项真正未完成。

**已修复（12 项，代码均已存在并验证）**：
- P1-01：`buildOosProfileKey(market, line, side, settlementType)`，key 已含 line+side（`candidateStateMachine.ts`）。
- P1-05：`marketDivergenceEngine.jointMarketLambdaEstimate` 目标函数 EV² → proper scoring。
- P1-07：`calculateBivariatePoissonGrid` 输出 `grid_marginal_lambda_home/away`。
- P1-08：固定 maxGoals=6 → `poissonSupportUpperBound` 动态上界。
- P1-09：无市场时改用 theoryPrior（保留主客强弱），不再等分 league base goals。
- P1-10：`divergence_total_delta`（Δtotal = deltaH+deltaA）二维偏差。
- P1-22：`calculateTimedMomentumIntegral` 梯形 dt 加权，统一积分口径（与 waveform AUC 同口径）。
- P1-28：`eventMomentumFusion` statsSupport 移除 earlyPhaseBaseline 冒充 observed support。
- P1-34：`applyBayesianShrinkage` 锚点改为剥水后公允概率（`1/odds/overround`）。
- P1-35：五态 EV 只缩放「赢的贡献」，不再整体 EV×ratio 缩放输的部分。
- P1-36：Kelly = `EV/(4×(odds-1))`+5% 上限，即报告建议的「固定保守比例」，已满足、无需改动。
- P1-37：conflict resolver 由二值 win/loss 改五态精确结算（全赢=1/赢半=0.5/走盘=0/输半=-0.5/全输=-1）。

**待 OOS 数据（2 项，用户决策保持现状、不强行做结构层，2026-09-26）**：
- P1-25：DA/SOT/Shots/Possession 衍生比率高度代数相关 → 需 primitive event features + regularization 整体重构。
- P1-32：market + live physical 都直接进入 λ → 需 live feature 只做 residual correction，且需 OOS 拟合 live 与 market 相关性系数。

**下一步：转向「补数据工程」，缺口见 Resume Protocol 下方「数据工程缺口」清单。**


## 交给 Google AI Studio 的任务清单（2026-09-28）

> 以下 Gemini/LLM 相关任务已明确隔离，交由 Google AI Studio 处理。核心代码（03 量化引擎、OOS 校准、情报预取降级路径）均已验证可独立于这些任务正常运行。

### 1. `refactor/04_ai_evaluator/aiCaller.ts` 升级（重构系统）
- 现状：硬编码 `gemini-2.5-pro` + `models.generateContent` + `responseSchema`。
- 目标：升级到 `gemini-3.8-flash`（或 3.x）+ Interactions API（`client.interactions.create({ model, input, tools })`，返回 `output_text`）；移除 `responseSchema`（Interactions API 不支持，改用 prompt 要求结构化 JSON 输出）。
- 参考实现：`refactor/04_ai_evaluator/intelPrefetchService.ts` 的 `groundedSearchFormat`（已升级为 interactions.create + google_search）。

### 2. `server/services/geminiEvaluationService.ts` 升级（旧系统）
- 现状：同样硬编码旧模型 + generateContent + responseSchema。
- 目标：升级到 3.x + Interactions API，含 `responseSchema` → `response_format` 迁移。

### 3. SPEC Phase 3 `independentTacticalSupervisor.ts`（方案 B 云端 AI 认知督导法庭）
- 依据：`refactor/06_settlement_audit/PREDICTION_VS_ACTUAL_CONTINUOUS_LEARNING_SPEC.md` 第十章。
- 目标：第三方独立 AI（Gemini/DeepSeek）单场 ~10KB 卷宗打包 + 自动化微观质询取证（有效时间假设矛盾、虚假动量与禁区穿透矛盾、战术体制突变识别），输出结构化病理对象 + 跨场次《结构性缺陷诊断工单》。

### 网络与复测注意
- Node fetch 不走 Windows 系统代理，需设 `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1`。
- 配额恢复后复测：`npx tsx refactor/tests/verify_gemini_grounding_live.ts`。

---

## 数据工程缺口（补数据路线图，2026-09-26）

待 OOS 数据项汇总：P1-04（AH/1X2 OOS 校准）、P1-11（live market weight 拟合）、P1-12（历史 tier 版本）、P1-16（fitted opponent strength）、P1-19（MUI 阈值拟合）、P1-25（primitive features regularization 系数）、P1-32（live 与 market 相关性系数）、P1-38（calibration/reliability score）。

### A. OOS 校准样本积累（支撑 P1-04/11/19/25/32/38，最高优先级）
- 需要：预测-结算配对样本，字段见 `OosCalibrationSample`（prediction_at、model_probability、outcome、observed_goals、market+line+side、minute_band、score_state、red_card_state）。
- 已有：`output/refactor_ai_evaluations.json`（258KB，含大量历史评估 + quarter_line_settlement_distribution）；`output/recommendation_ledger.json`（正式推荐台账）；`refactor/06_settlement_audit/oosArchiveService.ts`（OOS 归档服务）。
- 缺口：① 大量评估仍为冷启动期（OOS_COLD_START_EXEMPT），无真实结算；② 推荐台账多数 pending，未回填 outcome/observed_goals。
- 补法：赛后回填已结算推荐（outcome + observed_goals + score），按 market+line+side+minute_band+score_state 分桶，达到 ESS 阈值后解锁 VALIDATED。

### B. 历史 tier 版本数据（支撑 P1-12，中优先级）
- 需要：每赛季每队 T1-T5 等级 + 生效日期（season/date versioned strength）。
- 已有：`tierData.ts` 单一静态字典（CLUB_TIERS / NATIONAL_TEAM_TIERS / LEAGUE_TIERS）。
- 缺口：历史赛季版本。补法：为 tier 数据加 `effective_from` / `season` 版本字段，回测按比赛日期选择对应版本。

### C. fitted opponent strength（支撑 P1-16，中优先级）
- 需要：基于对手实际战绩（进球/失球/净胜）拟合的对手强度，替代静态 tier 归一化。
- 已有：`recentForm.ts` 用 `getTeamStrengthProfile` 静态 tier 近似对手强度。
- 缺口：对手战绩聚合 + 独立拟合。补法：用 `home_recent_matches` / `away_recent_matches` 的实际进球/失球拟合对手攻防强度。

### D. calibration 数据（支撑 P1-38，中优先级，可与 A 合并）
- 需要：confidence_score vs 实际命中率的校准曲线。
- 已有：`output/refactor_ai_evaluations.json` 含 confidence_score + grade。
- 缺口：confidence 分桶 × 实际结果配对。补法：赛后按 confidence 分桶统计命中率，反推 calibration curve。

### 建议优先级
1. 先做 A（OOS 样本结算回填），它是 P1-04/11/19/25/32/38 的共同前置。
2. B / C / D 可并行；B（tier 版本）需历史数据源，C / D 可从现有 output 数据 + 赛后回填逐步积累。


## Resume Protocol

1. Read `AGENTS.md`, this file, `refactor/AI_CODING_STANDARDS_AND_RULES.md`, `refactor/HANDOVER_AND_PROGRESS.md`, and `refactor/SYSTEM_ARCHITECTURE_AND_PIPELINE.md`.
2. Check `git status --short`; preserve unrelated user changes and never edit `sources/`.
3. Read the active snapshot, not the chat history, to determine whether the previous task is `IN_PROGRESS` or `DONE`.
4. If `IN_PROGRESS`, continue only the listed target files and rerun the listed validation. If `DONE`, start the next atomic task and register a new `IN_PROGRESS` snapshot before editing.
5. Keep each checkpoint durable: update the active snapshot after a meaningful step, record the exact command and result, and mark `DONE` only after executable validation passes.
6. If the session is interrupted, leave the active snapshot truthful. Never mark work complete merely because a tool call or partial edit succeeded.

## Do Not Infer From Chat

- `WATCH`, `RESEARCH`, raw +EV, and Layer 03 output are not formal recommendations.
- YBTY remains the execution source for markets, odds, raw team names, and live clock.
- Leisu text-live timestamps are event times, never the live clock.
- Missing or unverified facts remain defects; do not invent scores, times, odds, lineups, or historical samples.

# Refactor Continuation Checkpoint

> This is the short cold-start entry for any AI or account taking over this repository.
> The full historical record remains in `HANDOVER_AND_PROGRESS.md`.
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

执行【计划与文档一致性落地与持续学习系统部署】：
1. 校验全链路计划书、规范与运行时文档的一致性，封存历史废弃文档；
2. 推进 `/refactor/06_settlement_audit/PREDICTION_VS_ACTUAL_CONTINUOUS_LEARNING_SPEC.md` 中定义的预测快照与完赛事实深层次对账及自适应学习系统；
3. 严格遵循 `HANDOVER_AND_PROGRESS.md` 活动快照推进，并保证全量自动化测试持续 100% 绿灯。

After that, audit live-minute window semantics, red-card multipliers into M4, market timeline separation, and OOS backtesting one atomic issue at a time.

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

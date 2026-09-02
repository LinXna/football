# 重构工作进度与任务交接看板 (Handover & Progress Board)

> **最后更新时间**：2026-09-02
> **当前阶段**：【Layer 03 OOS 校准管线 (DONE)】
> **当前状态**：机器 +EV 候选现已由可复现的历史 OOS 档案门禁；仅已验证分桶或同市场全局档案可提供边际置信度。

---

## 一、当前活动工作快照 (Active Snapshot)

- **任务编号 (Task)**: `SNAPSHOT-20260902-LAYER03-ROLLING-OOS-AND-CONTEXT-TYPE-REMEDIATION`
- **任务目标 (Goal)**: 将 OOS 档案升级为具备模型版本、训练窗口和预测窗口隔离的可审计滚动档案，并根治 `contextEngine.ts` 缺失权威数据类型导致的 Layer 03 类型检查失败。
- **改动文件 (Target Files)**:
  - `/refactor/03_quant_engine/types.ts`
  - `/refactor/03_quant_engine/oosCalibrationEngine.ts`
  - `/refactor/03_quant_engine/contextEngine.ts`
  - `/refactor/06_settlement_audit/types.ts`
  - `/refactor/06_settlement_audit/historicalBacktestIngestion.ts`
  - `/refactor/tests/verify_quant_engine.ts`
  - `/refactor/tests/verify_historical_backtest_ingestion.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **执行步骤 (Action Plan)**:
  1. 定义模型版本、训练窗口和预测时间窗的强类型 OOS 契约；
  2. 在建档和加载时强制时间窗口隔离、版本一致性与不重叠校验；
  3. 从 Layer 01 权威类型源修复 `contextEngine` 导入，运行完整验证。
- **状态 (Status)**: `IN_PROGRESS`

- **任务编号 (Task)**: `SNAPSHOT-20260902-LAYER03-MARKET-SPECIFIC-CALIBRATION-AND-ASIAN-INVERSION`
- **任务目标 (Goal)**: 根治跨市场 OOS 放行、亚洲盘错误二元去水反演及滚球关键事实缺失时伪造 0 值定价；每一机器候选必须由自身市场的已验证档案独立准入。
- **改动文件 (Target Files)**:
  - `/refactor/03_quant_engine/devigCalculator.ts`
  - `/refactor/03_quant_engine/marketDivergenceEngine.ts`
  - `/refactor/03_quant_engine/poissonDecayModel.ts`
  - `/refactor/03_quant_engine/index.ts`
  - `/refactor/tests/verify_quant_engine.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **执行步骤 (Action Plan)**:
  1. 让让球反演直接比较精确结算收益的隐含公平 EV，不将四分之一盘伪装为二元赔率；
  2. 按候选市场分别选择、验证档案并独立筛除未校准信号；
  3. 对 LIVE 缺失分钟或未核验比分实施显式不可定价边界，并补回归测试。
- **状态 (Status)**: `DONE`
- **交付物与验证 (Deliverables & Verification)**:
  1. 联合反演的亚洲让球与大小球不再把四分之一盘去水概率倒数伪装为二元公平赔率；现使用两边实际报价按比例去水后的公平报价，并交由精确赢半/输半/走盘 EV 结算函数比较。
  2. OOS 档案按 `ASIAN_HANDICAP_MAIN`、`TOTAL_GOALS_MAIN` 分别解析；只有信号自身市场存在已验证档案时才能进入机器候选，大小球 λ 调整不会替让球信号背书。
  3. LIVE 缺失 YBTY 法定分钟，或 LIVE/FINISHED 比分未核验/缺失时，泊松定价直接失败，不能再构造 0 分钟或 0:0 的伪概率输出。
  4. 已通过 `node --import tsx refactor/tests/verify_quant_engine.ts`（8/8）和 `node --import tsx refactor/tests/verify_historical_backtest_ingestion.ts`（9/9）；定向类型检查无本次新增错误，`git diff --check` 通过。
- **下一步待办**: 建立带模型版本、训练窗口和赛事时间滚动切分的 OOS 档案契约；随后根治 `contextEngine.ts` 缺失类型导入及 Layer 03 遗留 `any` 的上游数据守卫。

- **任务编号 (Task)**: `SNAPSHOT-20260902-LAYER03-MODEL-INTEGRITY-REMEDIATION`
- **任务目标 (Goal)**: 根治联合盘口反演字段失配、经验式 λ 融合、伪造 λ/截尾 EV，以及 OOS 标签与时序准入缺陷；保证未验证模型不能产生机器候选。
- **改动文件 (Target Files)**:
  - `/refactor/03_quant_engine/marketDivergenceEngine.ts`
  - `/refactor/03_quant_engine/devigCalculator.ts`
  - `/refactor/03_quant_engine/oosCalibrationEngine.ts`
  - `/refactor/03_quant_engine/types.ts`
  - `/refactor/03_quant_engine/index.ts`
  - `/refactor/06_settlement_audit/types.ts`
  - `/refactor/06_settlement_audit/historicalBacktestIngestion.ts`
  - `/refactor/tests/verify_quant_engine.ts`
  - `/refactor/tests/verify_historical_backtest_ingestion.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **执行步骤 (Action Plan)**:
  1. 修正联合反演概率字段并以市场反演 λ 作为唯一盘口基线；
  2. 将 EV 改为概率质量守恒的自适应尾部展开，缺失或非法 λ 直接拒绝定价；
  3. 将 OOS 改为二元市场事件标签、加入严格预测时间截止校验，并补齐针对上述缺陷的回归测试。
- **状态 (Status)**: `DONE`
- **交付物与验证 (Deliverables & Verification)**:
  1. 联合盘口反演改用 `home_win / draw / away_win` 法定概率字段，不能产生有限解即显式失败；盘口反演 λ 成为唯一基线，已物理删除 50/50、30/70、70/30 的经验融合和伪造诱盘惩罚。
  2. 让球与大小球 EV 改用随 λ 扩展的概率支持集；缺失、NaN 或负 λ 直接抛出领域错误，不再伪造默认 λ。
  3. OOS 样本现要求唯一 ID、二元事件标签、合法预测概率/目标与严格早于训练截止的 `prediction_at`；球队收缩不再把先验样本虚增为有效样本量，亚洲让球档案不会错误缩放总进球 λ。
  4. Layer 06 仅将 `WIN / LOSE` 的正式、比分核验记录纳入 Brier 校准；四分之一盘结算保留审计但被明确拒绝作为二元概率标签。
  5. 已通过 `node --import tsx refactor/tests/verify_quant_engine.ts`、`node --import tsx refactor/tests/verify_historical_backtest_ingestion.ts`；全量类型检查确认本次涉及文件的反演类型错误已清除，遗留 `contextEngine.ts` 缺失类型导入需另行原子修复。

- **任务编号 (Task)**: `SNAPSHOT-20260902-LAYER03-JOINT-MARKET-INVERSION-AND-QUARTER-OOS`
- **任务目标 (Goal)**: 将 1X2、亚洲让球与大小球赔率联合数值反演为市场 λ，并将四分之一盘赢半/输半/走盘映射为连续 OOS 结算目标，消除经验系数和选择性样本偏差。
- **改动文件 (Target Files)**:
  - `/refactor/03_quant_engine/marketDivergenceEngine.ts`
  - `/refactor/03_quant_engine/oosCalibrationEngine.ts`
  - `/refactor/03_quant_engine/types.ts`
  - `/refactor/06_settlement_audit/types.ts`
  - `/refactor/06_settlement_audit/historicalBacktestIngestion.ts`
  - `/refactor/tests/verify_quant_engine.ts`
  - `/refactor/tests/verify_historical_backtest_ingestion.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **执行步骤 (Action Plan)**:
  1. 审计现有盘口契约中可用于联合反演的法定字段与赔率方向；
  2. 以统一泊松盘口概率作为唯一目标函数，替换经验 λ 映射；
  3. 扩展 OOS 结算目标与回归测试，验证四分之一盘不再被丢弃。
- **状态 (Status)**: `DONE`
- **交付物与验证 (Deliverables & Verification)**:
  1. `marketDivergenceEngine.ts` 已删除胜率差经验系数与虚构平局赔率；在可用时以同一泊松结算函数联合拟合 1X2、亚洲让球和大小球，缺少任一附属盘口时仅降为 1X2 约束而不伪造输入。
  2. Layer 06 现在接纳已结算的 `WIN / WIN_HALF / PUSH / LOSE_HALF / LOSE` 正式推荐，按 `1 / .75 / .5 / .25 / 0` 形成连续 OOS 标签；`PENDING` 与 `INVALID` 仍被明确拒绝。
  3. OOS Brier 评分已直接消费连续标签，并在建档前校验标签必须位于 `[0,1]`。
  4. 已通过 `npx tsx refactor/tests/verify_quant_engine.ts`（8/8）、`npx tsx refactor/tests/verify_historical_backtest_ingestion.ts`（9/9）和 `git diff --check`。
- **下一步待办**: 为旧台账建立源头规范化导出与运行时类型守卫，待其具备模型概率、预测 λ 和可验证结算后再批量接入本入口。

- **任务编号 (Task)**: `SNAPSHOT-20260902-LAYER03-MODEL-INTEGRITY-HARDENING`
- **任务目标 (Goal)**:
  1. 修复 Layer 03 审查确认的 OOS 校准未实际消费、盘口惩罚未反映至展示置信度及滚球数据缺失仍可能准入的问题；
  2. 明确 90 分钟后仍处于 LIVE 状态的不可定价边界，禁止将其伪装成已完赛或生成机器候选；
  3. 增加回归覆盖上述硬门禁与 OOS λ 调整的实际生效。
- **改动文件 (Target Files)**:
  - `/refactor/03_quant_engine/types.ts`
  - `/refactor/03_quant_engine/poissonDecayModel.ts`
  - `/refactor/03_quant_engine/index.ts`
  - `/refactor/tests/verify_quant_engine.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **执行步骤 (Action Plan)**:
  1. 增加可审计的 OOS λ 调整算子，并在候选市场档案命中后重新计算盘口 EV；
  2. 将未完成的 90+ 比赛和关键实时统计缺失改为硬性禁止机器候选；
  3. 统一输出置信度的盘口惩罚口径，补充回归并验证。
- **状态 (Status)**: `DONE`
- **交付物与验证 (Deliverables & Verification)**:
  1. OOS 档案的 `lambda_log_adjustment` 已接入泊松基准 λ：先以原始模型确定候选市场与匹配档案，再以已验证档案重算 λ 和市场 EV，杜绝“只记录、不校准”；
  2. LIVE 90+ 且尚未标记 `FINISHED` 的比赛显式标记为 `is_stoppage_time_unpriceable`，不再被等同完赛，也被硬性排除出机器候选；
  3. 滚球关键技术统计不可用时，保留缺陷可观测性但硬性禁止机器候选；输出置信度统一受盘口惩罚约束；
  4. `npx tsx refactor/tests/verify_quant_engine.ts` 8/8 通过（新增 OOS λ 生效与 90+ 边界断言），`npx tsx refactor/tests/verify_historical_backtest_ingestion.ts` 9/9 通过，`git diff --check` 通过。
- **下一步待办**: 原子修复市场隐含 λ 的联合盘口数值反演、四分之一盘 OOS 连续结算目标，以及 Layer 03 遗留 `any` 的源头类型收敛；旧台账仍需先规范化后方可产生真实 OOS 档案。

- **任务编号 (Task)**: `SNAPSHOT-20260902-LAYER06-HISTORICAL-OOS-SAMPLE-INGESTION`
- **任务目标 (Goal)**:
  1. 为 Layer 06 建立已结算历史回测记录的强类型准入契约，仅允许正式 AI 推荐、已验证完赛比分及完整量化预测字段进入 OOS 校准样本；
  2. 将合格记录转换为 Layer 03 唯一的 `OosCalibrationSample`，并输出包含接受数、拒绝数及逐条拒绝原因的可审计回测产物；
  3. 增加回归测试，覆盖正式样本接入、机器候选拦截、未核验比分拦截及 OOS 档案构建。
- **改动文件 (Target Files)**:
  - `/refactor/06_settlement_audit/enums.ts`
  - `/refactor/06_settlement_audit/types.ts`
  - `/refactor/06_settlement_audit/historicalBacktestIngestion.ts`
  - `/refactor/06_settlement_audit/index.ts`
  - `/refactor/tests/verify_historical_backtest_ingestion.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **执行步骤 (Action Plan)**:
  1. 定义历史已结算记录与拒绝原因契约，并实现无副作用的准入/转换；
  2. 复用 Layer 03 的 OOS 档案构建器生成审计产物，禁止重定义校准算法；
  3. 编写并运行 Layer 06 回归测试，再归档快照。
- **状态 (Status)**: `DONE`
- **交付物与验证 (Deliverables & Verification)**:
  1. 新增 `06_settlement_audit` 的强类型历史回测契约、拒绝原因枚举和纯函数接入器；仅 `formal_ai_recommendation`、已验证比分、二元 `WIN/LOSE` 结算与完整量化字段可转换为 Layer 03 的 `OosCalibrationSample`；
  2. 滚球样本的 `observed_goals` 严格按推荐后新增进球计算；赛前样本按完场总进球计算。机器候选、未验证比分、非二元四分之一盘结果和非法分钟/预测参数均输出显式拒绝原因，不会伪造校准档案；
  3. 接入器只复用 `buildOosCalibrationArchive`，不复制或改写 Layer 03 校准算法；没有合格样本时不生成档案；
  4. `npx tsx refactor/tests/verify_historical_backtest_ingestion.ts` 9/9 通过，`npx tsx refactor/tests/verify_quant_engine.ts` 8/8 通过，`git diff --check` 通过。
- **下一步待办**: 为旧版 `output/recommendation_ledger*.json` 建立独立的源头规范化导出与运行时类型守卫，修复其损坏 JSON/缺失预测字段后再批量喂入本 Layer 06 接口；随后将档案版本、VAR/封盘与盘口时差写入 Layer 04/05 正式推荐准入审计。

- **任务编号 (Task)**: `SNAPSHOT-20260902-LAYER03-OOS-CALIBRATION-PROFILE-PIPELINE`
- **任务目标 (Goal)**:
  1. 建立历史 OOS 校准样本契约，按赛事阶段、分钟、比分、红牌与市场进行可复现分桶；
  2. 对球队样本采用全局先验收缩，生成并校验只读校准档案；
  3. 在 Layer 03 根据当前赛事上下文加载最细的已验证档案，未命中时回退到已验证全局档案；
  4. 增加生成、加载、收缩与交易准入的回归测试。
- **改动文件 (Target Files)**:
  - `/refactor/03_quant_engine/types.ts`
  - `/refactor/03_quant_engine/oosCalibrationEngine.ts`
  - `/refactor/03_quant_engine/index.ts`
  - `/refactor/tests/verify_quant_engine.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **执行步骤 (Action Plan)**:
  1. 定义样本与档案契约，并实现分桶、Brier 评分、贝叶斯式球队收缩和档案构建；
  2. 将档案选择接入主编排，保留无有效档案即零边际置信度的硬门禁；
  3. 增加回归并运行 Layer 03 测试与受影响类型检查。
- **状态 (Status)**: `DONE`
- **交付物与验证 (Deliverables & Verification)**:
  1. 新增 `oosCalibrationEngine.ts` 与强类型 OOS 样本/档案契约：按联赛、赛前/分钟段、比分、红牌和市场建立 Brier 评分校准档案；
  2. 团队档案使用 100 个全局先验等效样本收缩，并显式区分原始 `sample_size` 与 `effective_sample_size`；只有有效样本不少于 200 的档案可标记 `VALIDATED`；
  3. 主编排对原始正 EV 信号按市场加载最细已验证球队/分桶档案，未命中时仅回退至同市场已验证全局档案；未校准时仍严格输出零边际置信度和零机器候选；
  4. `npx tsx refactor/tests/verify_quant_engine.ts` 已 8/8 通过（含 OOS 分桶、收缩、精确选择及全局回退）。受影响 TypeScript 静态检查仅被既有 `contextEngine.ts` 的缺失类型 `H2HDetailedAnalytics`、`RecentFormDetailedAnalytics` 阻塞，新增 OOS 模块无类型报错。
- **下一步待办**: 将 OOS 已结算样本接入 Layer 06 回测产物，并把档案版本、VAR/封盘与盘口时差一并写入 Layer 04/05 的正式推荐准入审计。

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260902-LAYER03-LIVE-THREAT-TRINITY-FUSION`
- **任务目标 (Goal)**：
  1. 新建强类型三源实时威胁完整性特征：动量、事件、统计的方向一致度、样本可信度、冲突原因与校准后的威胁强度；
  2. 将该特征接入 EPI、破门临界态和滚球泊松 λ，移除三者之间仅两两耦合的缺口；
  3. 将累计技术统计与近窗事件严格分层：仅把事件轴或快照增量确认的近期事实作为近窗佐证；
  4. 修正 Type 22 射偏被错误计为门柱险情的问题；
  5. 增加三源同向、动量虚火、事件/统计反证和数据冲突的自动化测试，并执行 Layer 03 与双轨端到端回归。
- **改动文件清单 (Target Files)**：
  - `/refactor/03_quant_engine/types.ts`
  - `/refactor/03_quant_engine/eventMomentumFusion.ts`
  - `/refactor/03_quant_engine/momentumQuantEngine.ts`
  - `/refactor/03_quant_engine/poissonDecayModel.ts`
  - `/refactor/03_quant_engine/index.ts`
  - `/refactor/tests/verify_quant_engine.ts`
  - `/refactor/tests/verify_full_pipeline_00_03.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **执行步骤 (Action Plan)**：
  1. 扩展 Layer 03 契约，构建仅依赖真实输入、无隐式默认值的三源完整性特征；
  2. 在 M3.5 与 M4 中消费同一特征，令 EPI、临界态和 λ 使用同一证据链；
  3. 编写正反例与冲突例回归测试，运行完整验证后归档。
- **状态标记 (Status)**: `DONE`
- **交付物与结果 (Deliverables & Results)**:
  - 新增 `live_threat_trinity`：实时危攻动量、近窗关键事件与按比赛时间归一化的 9 项技术统计质量基线统一计算方向一致度、威胁强度和冲突标记；
  - EPI、破门临界态与滚球泊松威胁张量均消费同一三源证据链，高动量但缺乏事件或统计佐证时会折损威胁并判为冲突；
  - 修正 Type 22 射偏被误当作门柱险情的问题，并补充三源正证/反证自动化断言；
  - `verify_quant_engine.ts` 与 `verify_full_pipeline_00_03.ts` 均 100% 通过。

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260901-FIX-FIXTURE-DATA-CORRUPTION-AND-CANONICAL-PIPELINE`
- **任务目标 (Goal)**：
  1. 根治 `refactor/fixtures/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json` 固件数据损坏，从权威数据源 `docs/` 恢复并清理 `.corrupt-*.json` 垃圾文件；
  2. 运行并通过全量自动化测试（`verify_traceability_matrix.ts`、`verify_canonical_match_assembler.ts`、`verify_full_pipeline_00_03.ts`、`verify_quant_engine.ts` 等）；
  3. 验证 `/api/refactor/canonical-matches` API 与前端页面正常恢复。
- **改动文件清单 (Target Files)**：
  - `/refactor/fixtures/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **状态标记 (Status)**: `DONE`
- **交付物与结果 (Deliverables & Results)**:
  - 成功从 `docs/` 恢复无损权威雷速接口数据固件，并生成对应 `.bak` 备份文件；
  - 重新同步生成了 `refactor/samples/` 下的标准样例数据；
  - 全量 9 项测试套件全部 100% 绿色通过；
  - `/api/refactor/canonical-matches` 滚球与赛前模式均返回 200 OK 并成功组装标准赛事与量化特征。

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260901-LAYER03-CONTINUOUS-UNIFIED-THREAT-INTEGRATION`
- **任务目标 (Goal)**：
  1. **排查并物理移除所有离散阶跃与打补丁式 if-else 规则**：
     - `poissonDecayModel.ts`: 重构 `calculateTimeDecayAndUrgencyMultiplier`，以连续紧迫度势场 $U(t, \Delta S)$ 替代阶跃分支；
     - `eventMomentumFusion.ts`: 重构 `evaluateTacticalRegime`、`evaluateGoalClimax` 与 `calculateEventPressureConversion`，以连续势能场与非线性平滑激活函数替代阶梯 if-else；
     - `momentumQuantEngine.ts`: 重构红牌衰减与态势特征为连续平滑映射；
  2. **确保数学连续性、单调性与物理可解释性**；
  3. **通过全量 7 项 Layer 03 测试及双轨 00~03 端到端流水线测试**。
- **改动文件清单 (Target Files)**：
  - `/refactor/03_quant_engine/poissonDecayModel.ts`
  - `/refactor/03_quant_engine/eventMomentumFusion.ts`
  - `/refactor/03_quant_engine/momentumQuantEngine.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **状态标记 (Status)**: `DONE`
- **交付物与结果 (Deliverables & Results)**:
  - 成功建立了连续平滑的多维时空威胁积分、紧迫度势场与破门临界态方程体系；
  - 彻底物理拔除了所有离散人工打补丁硬编码规则；
  - 全部 7 项 Layer 03 核心测试及双轨 00~03 端到端流水线测试 100% 绿色通过。

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260831-LAYER03-REAL-DATA-VERIFICATION-AND-LIVE-CLOCK-FIX`
- **任务目标 (Goal)**：
  1. 根治数据摄取层 `ParsedYbtyLiveMatch` 缺失 `is_live: true` 导致时钟被置为赛前 90 分钟的物理时间失效缺陷；
  2. 对博卡青年后备队等 6 场真实比赛在 00~03 四级递进因果流下的全量大小球推荐项、盘口、赔率及 EV 计算进行全流程严格复测与输出；
- **改动文件清单 (Target Files)**：
  - `/refactor/01_data_ingestion/ybty/types.ts`
  - `/refactor/01_data_ingestion/ybty/ybtyLiveExtractor.ts`
  - `/refactor/01_data_ingestion/ybty/ybtyPrematchExtractor.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **状态标记 (Status)**: `DONE`
- **交付物与结果 (Deliverables & Results)**:
  - 成功修复 `is_live` 数据契约传递，滚球分钟解析准确恢复（如谢周三 62'、本菲卡 58'、博卡青年后备队 20' 等）；
  - 6 场赛事全量大小球盘口、EV 及正期望推荐项经物理时间衰减与四级因果流校准后 100% 严谨自洽；
  - 全部单元测试与端到端测试 100% 绿色通过。


---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260831-LAYER03-EVENT-MOMENTUM-CO-EVOLUTION`
- **任务目标 (Goal)**：
  1. **构建“战局势能（危攻时序）与关键事件因果共生”量化模型**，彻底打破孤立统计；
  2. **类型系统升级 (`types.ts`)**：定义攻防势能转化指数 (`EPI: EventPressureConversion`)、动态战术态势 (`TacticalRegimeFeatures`)、破门临界相变 (`GoalClimaxFeatures`) 与时空融合综合特征 (`SpatioTemporalEventFeatures`)；
  3. **实现核心融合引擎 (`eventMomentumFusion.ts`)**：
     - 计算实质威胁事件加权总分与攻防势能转化率 EPI，精准识别【真实致命压迫】、【无效围攻虚火】与【刺客高效反击】；
     - 基于事件锚点切分 Post-Incident 窗口，识别进球后态势（碾压追击/弹性防反/恐慌崩盘）与红牌后抗压半衰期；
     - 计算二阶动量加速度与尾端事件密集度，输出破门临界击穿指数 GCS；
     - 终盘 75'+ 结合分差、搏命态与 EPI 闭式微调泊松 $\lambda_{rest}$；
  4. **统帅部编排与全量测试**：在 `index.ts` 接入共生引擎并编写高覆盖度战术场景单测与全链路回归。
- **改动文件清单 (Target Files)**：
  - `/refactor/03_quant_engine/types.ts`
  - `/refactor/03_quant_engine/enums.ts`
  - `/refactor/03_quant_engine/eventMomentumFusion.ts`
  - `/refactor/03_quant_engine/poissonDecayModel.ts`
  - `/refactor/03_quant_engine/index.ts`
  - `/refactor/tests/verify_quant_engine.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **状态标记 (Status)**：`DONE`
- **交付物与结果 (Deliverables & Results)**：
  - `eventMomentumFusion.ts`: 实现了完整的攻防势能转化率 (EPI)、战术相变评估 (Tactical Regime) 与破门临界击穿探测器 (Goal Climax)；
  - `poissonDecayModel.ts`: 注入了战术相变乘子 `regime_multiplier`，实现了势能-事件-泊松联动；
  - `index.ts`: 统帅部编排器完成了 M3.5 的完整接入与风险警报联动；
  - `verify_quant_engine.ts`: 补充并全部通过了 M3.5 攻防势能转化、红牌崩盘/韧性、破门临界探测及全量端到端推演自动化测试（全部 7 项测试 100% PASS）。

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260831-LAYER03-MATH-PRECISION-AND-PREMATCH-GOVERNANCE`
- **任务目标 (Goal)**：
  1. **亚洲让球盘 (AH) 深度盘口升级**：由粗糙 0.7 经验系数升级为**全量双变量泊松网格闭式展开求解**（支持任意整球、半球、正负四分之一盘的精确赢半输半复合期望）；
  2. **大小球盘口 (O/U) 通用闭式求解**：支持任意浮动盘口线（如 0.75, 1.25, 1.75, 2.25, 2.75, 3.25 等）基于泊松 PMF 的闭式复合期望；
  3. **亚洲盘口中文与异构文本鲁棒解析**：扩展支持常用中文盘口别名（平手、平/半、半球、半/一、一球、球半、受让等）；
  4. **赛前 (Prematch) 状态解耦治理**：对赛前未开赛比赛豁免点阵缺失扣分，避免置信度误扣 20 分；
  5. **回归与全链路测试验证**：运行全部 8 组自动化测试，保证 100% 验收通过。
- **改动文件清单 (Target Files)**：
  - `/refactor/03_quant_engine/devigCalculator.ts`
  - `/refactor/03_quant_engine/index.ts`
  - `/refactor/tests/verify_quant_engine.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **状态标记 (Status)**：`DONE`

---

- **任务编号 (Task)**: `SNAPSHOT-20260831-LAYER02-KEY-EVENTS-AND-TYPE22-DOCS`
- **任务目标 (Goal)**：
  1. **SHOT_OFF_TARGET (Type 22) 文档与算法校验**：
     - 在 `DATA_SPECIFICATION.md`、`AI_SYSTEM_AND_DATA_CONTRACT.md` 与 `SYSTEM_ARCHITECTURE_AND_PIPELINE.md` 中补充 Type 22 统计不可区分中柱的边界说明；
     - 校验并注释 Layer 03 `momentumQuantEngine.ts` 的权重赋值 (保守权重 0.040)；
  2. **Layer 02 数据契约与装配器增强 (CanonicalTimelineEvent & Precision)**：
     - 在 `02_canonical_model/types.ts` 中新增 `CanonicalTimelineEvent` 接口（支持 `is_penalty`, `is_own_goal`, `is_cancelled`, `is_var_overturned`, `is_on_pitch`, `base_minute`, `added_minute`, `display_time`）；
     - 在 `canonicalMatchAssembler.ts` 中实现高精度事件解析提取，并在 `CanonicalScoreState` 中记录 VAR 进球回滚数 `var_overturned_goals_count`；
     - 在 `02_canonical_model/enums.ts` 补充完备关键事件枚举支持 (`CanonicalIncidentCategory`, `CanonicalEventType`)；
  3. **自测与全链路测试回归**：
     - 运行全量 8 组自动化测试，100% 验收通过。
- **改动文件清单 (Target Files)**：
  - `/refactor/DATA_SPECIFICATION.md`
  - `/docs/AI_SYSTEM_AND_DATA_CONTRACT.md`
  - `/refactor/SYSTEM_ARCHITECTURE_AND_PIPELINE.md`
  - `/refactor/03_quant_engine/momentumQuantEngine.ts`
  - `/refactor/02_canonical_model/types.ts`
  - `/refactor/02_canonical_model/enums.ts`
  - `/refactor/02_canonical_model/canonicalMatchAssembler.ts`
  - `/refactor/tests/verify_canonical_match_assembler.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **状态标记 (Status)**：`DONE`

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260831-MARKET-IMPLIED-LAMBDA-AND-FULL-PIPELINE-VERIFIED`
- **任务目标 (Goal)**：
  1. 市场盘口期望反推与动态泊松阵列（0~7球 Top 3~5 比分概率输出）；
  2. 决策矩阵 UI 联动呈现最可能比分与概率微胶囊；
  3. 全量 8 组自动化测试 100% 验收跑通。
- **状态标记 (Status)**：`DONE`

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260830-MOMENTUM-TIMELINE-ICONS-VECTOR-AND-ANTI-COLLISION`
- **任务目标 (Goal)**：
  1. 统一矢量事件徽章（进球、黄红牌、角球、VAR）及防横向重叠遮挡机制；
  2. 移除走势图下方远端重复长条，保留近端悬停交互卡片并集成主客即时危攻加分。
- **状态标记 (Status)**：`DONE`

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260830-PROMOTED-QUANT-BETTING-MATRIX-TO-CARD`
- **任务目标 (Goal)**：
  1. **移除冗余原始盘口栏**：从 `CanonicalMatchCenter.tsx` 中彻底移除 `让球:-0/0.5 (2.2 / 1.71)`、`大小:2 (大1.91 / 小1.95)`、`独赢:8.7 | 3.75 | 1.43` 这种未经量化修饰的原始信息行；
  2. **提取全场量化投注决策矩阵至卡片常驻面板**：
     - 在比赛卡片正文直接常驻展示全场三项核心量化投注栏目（全场独赢 1X2、全场大小球 O/U、全场让球 AH），展示去水公允胜率、赔率、+EV 正期望、最佳推荐高亮及精确盘口；
     - 让用户不用点击即可直接在卡片面板上查看完整的机器量化评估决策与各方向期望值；
     - 保留下方“03 机器量化”等明细展开入口供查阅更深层的泊松推演、相变预警与四维诊断。
- **改动文件清单 (Target Files)**：
  - `/src/components/QuantBettingDecisionMatrix.tsx` (新建复用组件，封装全场/半场 6 栏下注决策网格)
  - `/src/components/CanonicalMatchCenter.tsx` (移除原无用盘口行，常驻嵌入量化决策矩阵)
  - `/src/components/MachineQuantEvaluationPanel.tsx` (复用共享决策矩阵组件，保持单一事实来源)
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **状态标记 (Status)**：`DONE`

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260830-QUANT-PANEL-BETTING-RECOMMENDATION-OPTIMIZATION`
- **任务目标 (Goal)**：
  1. **投注建议布局置顶**：将“机器量化核心主选建议”与“各玩法最优投注与 +EV 决策矩阵”移动到 `MachineQuantEvaluationPanel` 的最顶部；
  2. **投注建议内容展示优化**：
     - 规范让球盘口、大小球界线、1X2 独赢 Shin 去抽水公允概率与四分之一盘结算规则；
  3. 保持数据来源 100% 权威性（以 YBTY 真实盘口与 Layer 03 量化特征为准）。
- **状态标记 (Status)**：`DONE`

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260830-LAYER03-QUANT-EVALUATION-PANEL-INTEGRATION`
- **任务目标 (Goal)**：
  1. 将 Layer 03 量化引擎接入 `CanonicalMatchCenter`，在比赛卡片与明细展开中呈现机器量化评估；
  2. 呈现 37 项物理攻防、纯 Forward 泊松推演、Shin 去抽水公允胜率与 +EV 初筛。
- **改动与交付物清单 (Deliverables)**：
  - `/src/components/MachineQuantEvaluationPanel.tsx`
  - `/src/components/CanonicalMatchCenter.tsx`
- **状态标记 (Status)**：`DONE`

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260830-CANONICAL-STATS-AND-LEGEND-COMPLETE`
- **任务目标 (Goal)**：
  1. 补充完整的比赛事件图例项，覆盖点球射失、乌龙、两黄变红、射正、射偏、越位、VAR、扑救等全部时序事件；
  2. 优化底部 6 维实时攻防技术统计样式为独立微胶囊卡片组，保证 `控球率: 60%:40%` `危攻: 38:30` `射门（射正）: 8(3):6(3)` `角球: 6:7` `黄牌: 1:0` `红牌: 0:0` 格式清晰、对比鲜明。
- **改动与交付物清单 (Deliverables)**：
  - `/src/components/CanonicalMatchCenter.tsx` (已升级并通过 TypeScript/Lint/Build 编译)
  - `/refactor/HANDOVER_AND_PROGRESS.md` (已归档)
- **状态标记 (Status)**：`DONE`

---

## 二、历史已完成活动工作快照 (Closed Snapshots Archive)

- **任务编号 (Task)**: `SNAPSHOT-20260830-CANONICAL-CENTER-UI-POLISH`
- **任务目标 (Goal)**：
  1. 移除“标准赛事对齐中心”标题旁的 `Layer 02 SSOT` 标签与顶部的 `导出全部合并数据` 按钮；
  2. 将原 `| 原始: YBTY(6场) · 雷速(6场)` 统计改为直接显示合并后的比赛场次（如 `| 合并后: 6场比赛`）；
  3. 重构比赛实时面板卡片布局为规范的双源横向比对看板。
- **状态标记 (Status)**：`DONE`

---

- **任务编号 (Task)**: `SNAPSHOT-20260830-L00-L03-FULL-PIPELINE-INTEGRATION`
- **任务目标 (Goal)**：
  1. 构建 Layer 00~03 全链路双路（滚球 + 赛前早盘）自动化贯通与集成测试套件；
  2. 验证【滚球通路 (Live Track)】：真实 YBTY 滚球 + 雷速实时攻防/动量/时钟 -> 解析 -> 别名对齐 -> CanonicalMatch -> 37项量化计算与 0:0 泊松推演；
  3. 验证【早盘通路 (Prematch Track)】：真实 YBTY 早盘 + 雷速赛前历史/积分榜/伤停 -> 解析 -> 别名对齐 -> CanonicalMatch -> 赛前量化与战意折损推演；
  4. 审计全链路 L0 熔断、L1/L2 降级、+EV 信号初筛、BDI 战场统治权指数分布与置信度评分；
  5. 沉淀双路全量推演流水线样本快照，为 Layer 04 (AI 博弈评估) 提供纯净权威的数据源。
- **改动与交付物清单 (Deliverables)**：
  - `/refactor/tests/verify_full_pipeline_00_03.ts` (100% 通过)
  - `/refactor/samples/pipeline_dual_track_summary.json` (双路机器初筛与量化汇总战报)
  - `/refactor/HANDOVER_AND_PROGRESS.md` (已归档)
- **状态标记 (Status)**：`DONE`
- **测试通过详情**：
  - 滚球通路 (Live Track)：6/6 成功对齐与 37 项要素求解，平均耗时 ~28ms，+EV 机会挖掘率 100%；
  - 赛前早盘通路 (Prematch Track)：2/2 成功对齐与赛前战意/伤停折损求解，平均耗时 ~2.2ms；
  - 极端防御测试：主客颠倒反装拦截 (SWAPPED_HOME_AWAY) 100% 触发、比分冲突 L0 致命熔断 100% 拦截、四分之一让球盘 EV 复合概率守恒 100% 通过。

---

## 二、重构全生命周期推进状态机

- [x] **第 0 步：重构基石与元规范建立**
- [x] **第 1 步：数据确认与契约定义（Data & Canonical Model）**
- [x] **第 2 步：实现【01 数据采集与解析】与【02 实体对齐】**
- [x] **第 3 步：实现【03 确定性量化与博弈引擎】(M1 ~ M6 100% DONE)**
- [x] **【强化阶段】：Layer 00~03 双路全链路端到端贯通与机器初筛集成测试 (100% DONE)**
- [ ] **第 4 步：实现【04 AI 博弈评估】与【05 投资风控台账】(NEXT)**
- [ ] **第 5 步：实现【06 结算核销与回测引擎】**
- [ ] **第 6 步：全链路端到端集成、历史回测验证与全量替换**

---

## 三、下一步工作规划 (Next Step Blueprint)

- **目标模块**：`Layer 04: AI 博弈评估与投资风控台账 (AI Betting Assessment & Risk Control)`
- **核心职责**：
  1. 接收 Layer 02 `extractAiEvaluationBrief` (极简低 Token 提炼包) 与 Layer 03 `QuantitativeFeatures` (37 项不可变量化要素)；
  2. 实施严格的 AI 提示词工程 (System Prompt & User Prompt) 注入战意、基本面、伤停、阵型与盘口博弈审查；
  3. 执行正式推荐分级机制 (A级/B级/C级/WATCH/RESEARCH/REJECTED)；
  4. 实施硬性风控守则（B级同方向最多 1 组串关、A级符合例外最多 2 组、杯赛轮换降级拦截、深盘严防）；
  5. 产出结构化推荐台账 (`recommendation_ledger.json`)。

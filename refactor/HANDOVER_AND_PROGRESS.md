# 重构工作进度与任务交接看板 (Handover & Progress Board)

> **最后更新时间**：2026-08-31 22:15:00  
> **当前阶段**：【Layer 03 确定性量化与博弈引擎：危攻时序与关键事件因果共生分析闭环 (DONE)】  
> **当前状态**：  
> 1. **战局势能与关键事件因果共生模型 (Event-Momentum Co-Evolution Engine) 落地 (DONE)**：
>    - 攻防势能转化指数 (EPI)：将危攻积分能量与射门/射正/角球/红黄牌等实质威胁事件动态关联，量化分类为致命围攻 (`LETHAL_SIEGE`)、无效空转 (`BARREN_DOMINANCE`)、高效反击 (`CLINICAL_COUNTER`) 等；
>    - 战术相变因果评估 (Tactical Regime Shift)：捕捉红牌半衰期（抗压弹性 vs 结构崩盘）、短时间内连续失球的恐慌溃散 (`COLLAPSING_PANIC`)、领先后稳健收缩 (`LEADING_CONSOLIDATION`) 与盲目压上暴露防反破绽 (`VULNERABLE_OVEREXTENSION`)，输出动态进球期望乘子 (`regime_multiplier`)；
>    - 破门临界击穿探测 (Goal Climax Tipping Point)：结合二阶动量加速度与近期密集事件，输出 0~100 破门临界指数及 `IMMINENT_GOAL` 相变警报；
> 2. **全量泊松推演与统帅部编排联动 (DONE)**：
>    - 在 `poissonDecayModel.ts` 中无缝注入战术相变因果乘子，动态调整滚球 0:0 剩余进球期望；
>    - 在 `index.ts` 中全链路接入 M3.5 共生分析，与 M2、M3、M4、M5 形成协同增强；
> 3. **全链路自动化测试与编译验收 (DONE)**：
>    - 7 组端到端自动化测试 100% 验收通过，Vite 编译无任何报错。

---

## 一、当前活动工作快照 (Active Snapshot)

- **任务编号 (Task)**: `SNAPSHOT-20260831-LAYER03-HIERARCHICAL-CAUSAL-UPGRADE-STEP1`
- **任务目标 (Goal)**：
  1. **构建 Stage 1 赛前多维关联理论先验合成器 (`prematchPriorEngine.ts`)**：
     - 战力层：深度关联首发名单、身价占比、核心伤停折损 (LIS)；
     - 状态战意层：结合主客同构近态、730天指数衰减交锋、联赛积分榜争冠/保级紧迫度 (MUI) 与联赛场均基线；
     - 输出统一的赛前理论进球期望基准 ($\lambda_H^0, \lambda_A^0$) 与理论公允概率分布；
  2. **构建 Stage 1.1 机构盘口博弈验证器 (`marketDivergenceEngine.ts`)**：
     - 接入雷速主流机构赔率矩阵，运用 Shin 去水算法反推机构隐含进球期望 ($\lambda_H^{\text{mkt}}, \lambda_A^{\text{mkt}}$)；
     - 计算理论 vs 机构偏差量 $\Delta = \text{TheoryPrior} - \text{MarketPrior}$；
     - 识别机构姿态 (`CONSENSUS_ALIGNED` 完美吻合 / `INSTITUTIONAL_DEFENSE` 机构防范 / `TRAP_INDUCEMENT` 虚火诱盘)；
     - 输出博弈校准后的基准进球期望 ($\lambda_{\text{base\_H}}, \lambda_{\text{base\_A}}$) 与离散度扣分；
  3. **扩展类型定义与枚举 (`types.ts`, `enums.ts`)**：增加赛前理论先验模型、机构博弈姿态与校准结果接口；
  4. **编写专用单元测试并验证**：编写 `verify_prematch_prior_and_market_divergence.ts` 验证先验合成与机构博弈校验 100% 正确。
- **改动文件清单 (Target Files)**：
  - `/refactor/03_quant_engine/types.ts`
  - `/refactor/03_quant_engine/enums.ts`
  - `/refactor/03_quant_engine/prematchPriorEngine.ts`
  - `/refactor/03_quant_engine/marketDivergenceEngine.ts`
  - `/refactor/03_quant_engine/poissonDecayModel.ts`
  - `/refactor/03_quant_engine/index.ts`
  - `/refactor/tests/verify_prematch_prior_and_market_divergence.ts`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **状态标记 (Status)**: `DONE`
- **交付物与结果 (Deliverables & Results)**:
  - 完整实现 Stage 1 多维关联先验合成（身价+阵容LIS+近态同构+MUI+交锋衰减+联赛DNA推导 $\lambda_H^0, \lambda_A^0$ 与泊松 1X2 理论概率）；
  - 完整实现 Stage 1.1 机构盘口博弈偏差检验与校准（Shin 去水 + 机构姿态识别 + $\Delta$ 偏差量 + 诱盘置信度惩罚）；
  - 统一重构 Layer 03 统帅部 `index.ts` 与 `poissonDecayModel.ts`，将博弈校准基准接入 Forward 泊松推演；
  - `verify_prematch_prior_and_market_divergence.ts`、`verify_quant_engine.ts` 及 `verify_full_pipeline_00_03.ts` 全部 100% 绿色通过。


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

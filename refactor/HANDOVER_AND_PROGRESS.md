# 重构工作进度与任务交接看板 (Handover & Progress Board)

> **最后更新时间**：2026-08-30 17:45:00  
> **当前阶段**：【移除冗余原始盘口行 & 提取机器量化核心矩阵至卡片常驻面板 (IN_PROGRESS)】  
> **当前状态**：响应用户指令：  
> 1. 彻底移除卡片下方冗余的“让球/大小/独赢”原始纯文本栏目；  
> 2. 将机器量化评估与下注决策矩阵中的全场核心玩法（全场让球、全场大小球、全场独赢）直接常驻提取到比赛卡片面板上直接展示，无需点击展开即可一目了然。

---

## 一、当前活动工作快照 (Active Snapshot)

- **任务编号 (Task)**: `SNAPSHOT-20260830-PROMOTED-QUANT-BETTING-MATRIX-TO-CARD`
- **任务目标 (Goal)**：
  1. **移除冗余原始盘口栏**：从 `CanonicalMatchCenter.tsx` 中彻底移除 `让球:-0/0.5 (2.2 / 1.71)`、`大小:2 (大1.91 / 小1.95)`、`独赢:8.7 | 3.75 | 1.43` 这种未经量化修饰的原始信息行；
  2. **提取全场量化投注决策矩阵至卡片常驻面板**：
     - 在比赛卡片正文直接常驻展示全场三项核心量化投注栏目（全场独赢 1X2、全场大小球 O/U、全场让球 AH），展示去水公允胜率、赔率、+EV 正期望、最佳推荐高亮及精确盘口；
     - 让用户不用点击即可直接在卡片面板上查看完整的机器量化评估决策与各方向期望值；
     - 保留下方“03 机器量化”等明细展开入口供查阅更深层的泊松推演、相变预警与四维诊断。
- **改动文件清单 (Target Files)**：
  - `/src/components/CanonicalMatchCenter.tsx`
  - `/src/components/MachineQuantEvaluationPanel.tsx`
  - `/refactor/HANDOVER_AND_PROGRESS.md`
- **执行步骤 (Action Plan)**：
  1. 在 `MachineQuantEvaluationPanel.tsx` 或可复用的导出模块中提供纯净的量化卡片组件/辅助函数；
  2. 在 `CanonicalMatchCenter.tsx` 中替换掉原先静态的原始盘口行，嵌入结构精美、信息密度高且具备高亮推荐的全场量化投注决策矩阵（3 栏全场核心玩法）；
  3. 自测与编译校验，确保无语法与类型问题；
  4. 更新工作看板状态为 DONE。
- **状态标记 (Status)**：`IN_PROGRESS`

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

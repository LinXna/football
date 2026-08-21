# 04. 系统重构与数据迁移分步实施计划 (Step-by-Step Implementation Plan)

## 一、 实施计划概述与执行铁律

本计划是系统全面迁移至 `StandardMatchData` 统一数据契约的执行指南。

### 执行铁律
1. **严格顺序执行**：按照“类型规范 -> Python管道归一化 -> 推荐决策引擎 -> 前端组件改造 -> 全链路联调测试”五大阶段严格依序推进，前置步骤未完成不得进入后续步骤。
2. **严禁虚假标记**：本清单中每一个检查点 `[ ]` 必须在**实际代码修改并通过对应单元/格式验证后**方可勾选标记为 `[x]`。未执行的步骤严禁虚假勾选。
3. **保护只读数据**：`sources/` 目录下的所有文件保持绝对只读，禁止编辑或删除。

---

## 二、 阶段任务分解与实施清单

### 阶段一：前端核心类型系统全面重构与契约对齐 (Phase 1: TypeScript Contract Migration)

- [x] **1.1 重构 `src/types.ts`**
  - **目标**：彻底废弃旧的 `LiveMatch` 与碎片化类型，实现 `StandardMatchData`、`UnifiedMatchStats`、`LineupData`、`HistoricalAnalysisData` 等完整类型定义。
  - **要点**：
    - 确保 `score: { home: number; away: number }`，`minute: number | null` 等数值类型安全。
    - 补充 `AttackMomentumTimeline`、`StandardTimelineEvent` 与 `LineupData` 完整字段。
  - **验收条件**：`src/types.ts` 无语法错误，类型契约与 `03_STANDARD_MATCH_DATA_CANONICAL_CONTRACT.md` 完全一致。

- [x] **1.2 编写前端数据适配与清洗工具库 `src/utils/dataAdapter.ts`**
  - **目标**：创建统一的数据适配器，负责将 Python 管道输出的 JSON 安全映射为 `StandardMatchData`。
  - **要点**：
    - 提供数值安全转换 (`safeNumber`)、数组防空回退、比分默认结构防御。
    - 兼容现有 `candidates.json` 与新版标准化数据结构的平滑读取。
  - **验收条件**：适配器能稳定处理不完整或空缺字段，杜绝 `Cannot read properties of undefined` 运行时异常。

---

### 阶段二：Python 管道层数据加载与匹配逻辑归一化 (Phase 2: Python Normalization & Matching)

- [x] **2.1 重构 `scripts/python/football_live.py` 中的雷速数据加载器**
  - **目标**：全面适配“滚球接口获取导出”输出的 `leisu_interface_data` (`results[].formal`)。
  - **要点**：
    - 移除对旧版 DOM 和 SofaScore 格式的依赖。
    - 直接从 `formal.static_match` 提取 `id`、`matchTime`（转 ISO UTC 与北京时间）、`homeTeam.name`、`awayTeam.name`、`environment`。
    - 直接从 `formal.live_match` 提取 `status_id`、`home_scores.score`、`away_scores.score`、`confirmed_statistics`、`attack_momentum_timeline`、`text_live`。
    - 直接从 `formal.lineup` 提取首发、阵型、伤停、教练信息。
    - 直接从 `formal.recent_matches` / `head_to_head` 提取历史分析大对象。
  - **验收条件**：加载雷速新版 JSON 文件后，输出的内部对象字段饱满完整，不再丢失历史数据和技术统计。

- [x] **2.2 优化 `football_live.py` 赛事匹配与候选输出结构**
  - **目标**：对齐 `StandardMatchData` 输出格式，生成规范的 `candidates.json`。
  - **要点**：
    - 统一使用秒级开赛时间差进行过滤。
    - 修复比分校验状态 `score_verified` 与比分来源 `score_source` 标记。
    - 确保 `candidate` 字典的结构与前端完全对齐。
  - **验收条件**：运行 `football_live.py` 成功生成 `output/ybty_leisu_candidates.json` 与 `output/ybty_leisu_prematch_candidates.json`。

- [x] **2.3 修正 `scripts/python/interface_features.py` 特征计算逻辑**
  - **目标**：统一从新版标准化 Candidate 结构中提取衍生特征。
  - **要点**：
    - 规范 `shots = shots_on_target + shots_off_target`。
    - 统一从 `historical_analysis` 提取近期交锋均值、大球率与进球时段分布。
    - 强化射门转化率与门将扑救率的样本量置信度校验（`sample_reliable` 阈值检查）。
  - **验收条件**：在特征计算中无 `KeyError`，生成的 `live_efficiency` 包含完整的定义与警告提示。

---

### 阶段三：推荐引擎与风控门禁升级 (Phase 3: Recommendation & Decision Engine)

- [x] **3.1 改造 `scripts/python/recommend_live.py`**
  - **目标**：实现严风控、高精度滚球推荐决策。
  - **要点**：
    - 硬性门禁：未通过比分校验（`score_verified == False`）绝不推荐 A 级，严格限制剩余进球/后续让球玩法。
    - 盘口解析：精确解析四分之一盘（0.25 / 0.75 盘）并标明赢半输半判定规则。
    - 战意与动量：结合 `attack_momentum_timeline` 最近 5/15 分钟趋势与红黄牌状态综合打分。
    - 输出 `output/ybty_leisu_decisions.json`。
  - **验收条件**：推荐输出包含清晰的理由 `reasoning`、风险标签 `risk_tags` 以及凯利仓位 `kelly_guidance`。

- [x] **3.2 改造 `scripts/python/recommend_prematch.py`**
  - **目标**：实现赛前深度基本面与初即盘异动推荐。
  - **要点**：
    - 整合阵容确认状态（`confirmed`）、主力伤停数、未来密集赛程风险。
    - 综合初盘与即时盘的水位变化进行价值判定。
    - 输出 `output/ybty_leisu_prematch_decisions.json` 与 `output/prematch_ai_brief.json`。
  - **验收条件**：赛前推荐逻辑严密，无未经阵容审核的盲目深盘推荐。

- [x] **3.3 校验与完善 `scripts/python/export_combined_data.py`**
  - **目标**：确保整合导出文件涵盖最新批次的完整数据。
  - **要点**：
    - 完整保留 YBTY、雷速原始数据、成功匹配及未匹配明细、决策状态。
  - **验收条件**：导出的整合 JSON 文件完整无损，无截断或关键字段缺失。

---

### 阶段四：前端各功能视图组件全面对齐与视觉增强 (Phase 4: Frontend UI Alignment)

- [x] **4.1 改造 `src/components/LiveMatchesView.tsx`（滚球分析看板）**
  - **目标**：使用 `StandardMatchData` 渲染滚球赛事卡片与指标。
  - **要点**：
    - 正确显示 YBTY 原始队名、即时比分与时钟。
    - 渲染 8 大技术统计条形对比（控球、射正、射门、角球、危攻等）。
    - 嵌入迷你动量火花线 (`MiniMomentumSparkline`)。
  - **验收条件**：列表流畅渲染，各盘口（让球/大小/独赢）赔率变动清晰可见，无 `NaN` 或空白。

- [x] **4.2 改造 `src/components/PrematchMatchesView.tsx`（赛前分析看板）**
  - **目标**：呈现赛前赛事深度基本面。
  - **要点**：
    - 展示开赛北京时间、初盘与即时盘对比。
    - 展示双方阵型（如 4-3-3 vs 4-2-3-1）、伤停人数与交锋战绩统计。
  - **验收条件**：卡片布局紧凑清晰，点击可展开阵型与交锋详情弹窗。

- [x] **4.3 改造 `src/components/BettingRecommendationsView.tsx`（推荐决策看板）**
  - **目标**：展示 A/B 级推荐决策、风控提示与仓位建议。
  - **要点**：
    - 突出显示推荐方向、推荐时比分与分钟、盘口与水位。
    - 渲染推荐理由列表与风险警示标签。
  - **验收条件**：推荐方案层次分明，风控拦截标记显著。

- [x] **4.4 改造 `src/components/AttackMomentumTimelineWidget.tsx`（攻守动量时序波形组件）**
  - **目标**：高质量渲染 90 分钟双半场攻守压制波形图。
  - **要点**：
    - 增加对二维数组 `data[0]` (上半场) 与 `data[1]` (下半场) 的长度安全保护。
    - 绘制以 0 为中轴的主客攻守动量面积图，支持 Hover 查看具体分钟的动量值。
  - **验收条件**：在不同比赛状态（未开赛、上半场、完场）下均能安全稳定渲染。

- [x] **4.5 改造 `src/components/FormationClashModal.tsx` & `RecentFormModal.tsx`（战术弹窗）**
  - **目标**：对齐结构化球员对象与历史交锋数据。
  - **要点**：
    - 阵型图按照 `home.starters` 球员的球衣号码与姓名进行战术站位展示。
    - 历史弹窗展示近 10 场胜负走势与进球时段分布。
  - **验收条件**：弹窗打开迅速，球员数据与战绩列表完整无错位。

- [x] **4.6 改造 `src/components/LedgerView.tsx` & `ExportDataView.tsx`**
  - **目标**：完善台账复盘与整合数据导出交互。
  - **验收条件**：盈亏核销统计精准，导出文件下载稳定。

---

### 阶段五：系统构建、端到端集成验证与排查封板 (Phase 5: Verification & Sign-off)

- [x] **5.1 运行 TypeScript 语法与 Lint 检查 (`npm run lint` / `lint_applet`)**
  - **验收条件**：零语法错误，零缺失导入，零未定义属性访问。

- [x] **5.2 运行应用编译构建 (`compile_applet`)**
  - **验收条件**：Vite 构建完全成功 (`dist/` 输出正常)。

- [x] **5.3 端到端测试与样本数据回放验证**
  - **验收条件**：按照 `05_VERIFICATION_AND_TESTING_GUIDE.md` 逐项验证通过。

---

### 阶段六：数据导入与 AI 评估链路修复与加固 (Phase 6: Data Import & Evaluation Pipeline v3.0.1)

- [x] **6.1 修复数据导出与补全持久化中的攻势动能与盘口快照传递**
  - **目标**：解决导出与批量添加比赛时 `attack_momentum_timeline` 与 `market_snapshots` / `verified_ybty_markets` 字段丢失问题。
  - **涉及文件**：`src/components/ExportDataView.tsx`、`server/services/batchSupplementService.ts`
  - **验收条件**：导出的 JSON 与存储的决策数据中完整包含攻势动能时序波形与完整盘口快照。

- [x] **6.2 强化技术统计提取与多格式攻势动能适配**
  - **目标**：解决技术统计指标在非标或缺失嵌套时回退导致的面板数值不显示问题。
  - **涉及文件**：`src/lib/matchStats.ts`、`src/types.ts`
  - **验收条件**：现场技术统计面板（控球、危攻、射门、角球、红黄牌）稳定正确解析。

- [x] **6.3 修复服务端 Prompt 注入层盘口读取与市场类型归一化**
  - **目标**：从 `market_snapshots`、`verified_ybty_markets`、`ybty_raw_markets` 等多源完整聚合盘口，并进行标准市场类型映射。
  - **涉及文件**：`server/services/promptSlimPayload.ts`、`server/services/marketTypeNormalizer.ts`、`server/services/canonicalMatchModel.ts`
  - **验收条件**：发送给 AI 的 prompt 中盘口列表饱满，市场类型规范对齐。

- [x] **6.4 对齐 AI 评估服务真实盘口核验与状态派发**
  - **目标**：使用聚合规整后的盘口进行全场/半场五大玩法核验，杜绝硬拦截造成的“数据不足 / NO_BET”与“无真实赔率”。
  - **涉及文件**：`server/services/geminiEvaluationService.ts`
  - **验收条件**：AI 评估卡片与五大盘口正确展示真实赔率、隐含概率、价值边际与研判建议。

# 重构工作进度与任务交接看板 (Handover & Progress Board)

> **最后更新时间**：2026-08-29 16:48:00  
> **当前阶段**：【Layer 01 数据接入与 Layer 02 实体对齐标准模型已 100% 定稿通过 ➔ 准备启动 Layer 03 量化引擎】  
> **当前状态**：固件样本、测试套件、Web 运行态数据源与全量文档规范已 100% 对齐同步，测试与编译全绿

---

## 一、当前活动工作快照 (Active Snapshot)

- **当前任务编号 (Active Task)**: `ACTIVE_SNAPSHOT: FULL_DOCS_AND_DATA_ALIGNMENT_AUDIT`
- **当前任务目标 (Goal)**：
  1. 【全文档逐行数据溯源排查】：从数据源头（YBTY 滚球固件、雷速接口固件、标准规范样本）开始，彻底排查 `DATA_SPECIFICATION.md` 及各层 sample `README.md` 中的残留旧样例与不一致字段；
  2. 【彻底消除旧对阵残留】：清理 `DATA_SPECIFICATION.md` 及 `samples/02_canonical_model/README.md` 中残留的澳达超（海伦斯 vs 加鲁达FC）及历史旧数值，全面对齐基准固件“英格兰甲级联赛 谢周三 vs 布拉德福德城”（ID: 4562395）；
  3. 【精准核对全生命周期数据契约】：核对所有分钟数 (62')、时钟 ("62:25")、比分 (0-1)、盘口赔率与 AI 提炼包字段，确保文档 100% 具备单一事实来源 (SSOT) 权威性；
  4. 【验证测试与系统构建】：运行全部测试套件与 TypeScript 校验，确保所有文档与底层实现 100% 严丝合缝。
- **改动文件清单 (Target Files)**：
  - `/refactor/HANDOVER_AND_PROGRESS.md`
  - `/refactor/DATA_SPECIFICATION.md`
  - `/refactor/samples/02_canonical_model/README.md`
- **状态标记 (Status)**：`IN_PROGRESS`
- **执行步骤 (Action Plan)**：
  1. 登记快照至 `HANDOVER_AND_PROGRESS.md` (Status: IN_PROGRESS)；
  2. 修正 `DATA_SPECIFICATION.md` 第六节 `CanonicalMatch` 样例及说明表格中的旧数据；
  3. 修正 `refactor/samples/02_canonical_model/README.md` 各子模块（时点、比分、盘口、雷速参考包、AI提炼包）的数值及字段；
  4. 执行全量测试套件验证与代码编译；
  5. 更新快照状态为 `DONE`。
- **交付物与下一步 (Deliverables & Next Step)**：
  - **待交付物**：100% 零误差、完全对齐真实测试固件的重构规范文档集与测试验证通过报告。
  - **下一步工作**：启动 Layer 03 量化引擎。

---

## 二、重构全生命周期推进状态机

- [x] **第 0 步：重构基石与元规范建立**
  - [x] 创建 `refactor/AI_CODING_STANDARDS_AND_RULES.md`（AI 编码准则与工作流法典）
  - [x] 创建 `refactor/SYSTEM_ARCHITECTURE_AND_PIPELINE.md`（系统全链路架构与契约白皮书）
  - [x] 创建 `refactor/HANDOVER_AND_PROGRESS.md`（任务交接与实时进度看板）
- [x] **第 1 步：数据确认与契约定义（Data & Canonical Model）** 👈 *【已全量定稿】*
  - [x] 确认 YBTY 原始盘口数据格式（滚球、让球/大小球/四分之一盘、主副盘），实现并验证 `ybtyLiveExtractor.ts`
  - [x] 确认 YBTY 赛前盘口数据格式（赛前、倒计时开赛推算、主副盘），实现并验证 `ybtyPrematchExtractor.ts`
  - [x] 确认雷速攻防统计、时序、比分验证机制与战术数据，实现并验证 `leisuInterfaceExtractor.ts`
  - [x] 扩展并落地雷速**联赛积分榜与排名 (`league_standings`)** 及 **进球时间分布 (`goal_distribution`)**
  - [x] 编写并定稿 `CanonicalMatch` 统一类型定义、实体匹配标准与极简 AI 提炼包 (`AiEvaluationBrief`)
- [x] **第 2 步：实现【01 数据采集与解析】与【02 实体对齐】** 👈 *【已 100% 落地并通过实测】*
  - [x] 编写 `01_data_ingestion/` 统一调度整合（YBTY 解析器、雷速解析器、比分校验器）
  - [x] 编写 `02_canonical_model/`（别名匹配器、统一赛事装配器）
  - [x] 编写解析与对齐的单元测试，用真实样本验证通过
- [ ] **第 3 步：实现【03 确定性量化与博弈引擎】** 👈 *【下一步待办】*
  - [ ] 编写物理攻防量化与危攻斜率提取
  - [ ] 编写剥水公允概率与 +EV 计算器
  - [ ] 编写纯 Forward 泊松时间衰减推演与滚球 0:0 重置让球模型
  - [ ] 编写量化算法单元测试
- [ ] **第 4 步：实现【04 AI 博弈评估】与【05 投资风控台账】**
  - [ ] 编写精简 Payload Prompt 生成器与结构化校验器
  - [ ] 编写正 EV 准入过滤与串关相关性风控
  - [ ] 编写带文件原子锁的正式推荐台账管理器
- [ ] **第 5 步：实现【06 结算核销与回测引擎】**
  - [ ] 编写四分之一盘与滚球让球精确结算逻辑
  - [ ] 编写回测分析器与硬拦截沉淀机制
- [ ] **第 6 步：全链路端到端集成、历史回测验证与全量替换**
  - [ ] 用多批真实数据跑通全流程
  - [ ] 确认新系统 100% 稳定运行后，清理旧代码，将 `refactor/` 晋升为根目录。

---

## 三、下一步待办事项 (Next Immediate Tasks)

1. 设计并实现 `03_quant_engine/`：包含攻防压迫量化特征提取、Shin/比例剥水公允概率与 +EV 计算器。
2. 实现纯 Forward 泊松时间衰减推演模型与滚球 0:0 重置让球模型。
3. 编写 `03_quant_engine` 单元测试。

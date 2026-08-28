# 重构工作进度与任务交接看板 (Handover & Progress Board)

> **最后更新时间**：2026-08-27  
> **当前阶段**：【第一阶段：数据确认与标准数据契约梳理 -> 第二阶段准备】  
> **当前状态**：进行中 (IN_PROGRESS)

---

## 一、当前活动工作快照 (Active Snapshot)

- **当前任务目标 (Goal)**：
  1. 【建立工业级自检审查铁律与防回退协议】：确立执行前的反思审查标准，彻底杜绝粗糙拼接与形式主义应付；
  2. 【彻底重构 Layer 02 核心数据契约与样本手册 (`refactor/samples/02_canonical_model/README.md`)】：
     - 规范 `canonical_id` 业务唯一键规则（防特殊字符冲突，标准格式化规则）；
     - 彻底厘清架构边界：将 `alignment` 降级为导入溯源元数据（Source Ingestion Traceability），阐明匹配计算与置信度是在 Layer 01/02 导入向导阶段完成，标准赛事实体仅保留纯净事实；
     - 重点详述 11 维核心战术、盘口深度、伤停首发与时序特征。
  3. 【保证代码、类型与测试 100% 严丝合缝】：同步更新 `canonical_match_sample.json`，确保全套单元测试通过。
- **改动文件清单 (Target Files)**：
  - `refactor/samples/02_canonical_model/README.md` (全量重构规范手册)
  - `refactor/samples/02_canonical_model/canonical_match_sample.json` (更新标准样例 JSON)
  - `refactor/HANDOVER_AND_PROGRESS.md` (记录工作快照)
- **状态标记 (Status)**：`DONE`
- **执行步骤 (Action Plan)**：
  1. 更新 `refactor/HANDOVER_AND_PROGRESS.md` 活动快照为 `IN_PROGRESS`；
  2. 详尽重写 `refactor/samples/02_canonical_model/README.md`，彻底纠正 `canonical_id` 说明与 `alignment` 架构边界；
  3. 审查并更新 `refactor/samples/02_canonical_model/canonical_match_sample.json`；
  4. 运行全套单元测试与 linter 验证通过；
  5. 更新快照状态为 `DONE`，并向用户交付自检方法与成果。
- **交付物与下一步 (Deliverables & Next Step)**：
  - 交付物：
    1. 经过深度审视、逻辑严密、架构权责分明的 `02_canonical_model` 手册与样例；
    2. 落地“AI 工业级彻底自检协议”；
    3. 完整的 Layer 00 ~ Layer 02 单元测试套件全部绿灯。
  - 下一步：全面启动 Layer 03 确定性量化特征提取与博弈推演算法开发。

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
- [ ] **第 2 步：实现【01 数据采集与解析】与【02 实体对齐】**
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

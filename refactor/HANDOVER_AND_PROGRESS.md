# 重构工作进度与任务交接看板 (Handover & Progress Board)

> **最后更新时间**：2026-08-25  
> **当前阶段**：【第一阶段：数据确认与标准数据契约梳理】  
> **当前状态**：进行中 (IN_PROGRESS)

---

## 一、当前活动工作快照 (Active Snapshot)

- **当前任务目标 (Goal)**：
  1. 【向导主客队两列样式换回】：将向导赛事卡片内的对阵区域换回上一版经典的左右两列卡片分栏样式（`grid grid-cols-1 md:grid-cols-2 gap-3`），YBTY (法定对阵) 与 雷速 (关联比对) 各自独立卡片封装，内容保持当前完整字段；
  2. 【联赛顺序字符与简称模糊匹配】：重构 `matchAligner.ts`，对联赛及队名全面支持【按字符顺序子序列/简称/缩写匹配】（如“俄罗斯甲级联赛”按文字顺序精准匹配雷速名“俄甲”）；
  3. 【根治时间与状态字段提取】：彻底消除代码中硬编码的“滚球进行中/进行中”占位，完整提取并透传 YBTY 原始数据中的 `clock`、`clock_status`（如“中场休息”）、`commence_time`，以及雷速的 `minute`、`status_text`（如“中场”）、`commence_time`。
- **改动文件清单 (Target Files)**：
  - `refactor/01_data_ingestion/ybty/types.ts` & `ybtyLiveExtractor.ts` & `ybtyPrematchExtractor.ts` (透传 clock_status, commence_time, countdown, captured_at)
  - `refactor/02_canonical_model/types.ts` & `canonicalMatchAssembler.ts` (时间状态与时钟完整透传)
  - `refactor/02_canonical_model/matchAligner.ts` (实现顺序字符与联赛简称匹配算法及内置权威联赛字典)
  - `server/routes/canonicalRoutes.ts` (全量透传原始时间字段)
  - `src/components/CanonicalMatchCenter.tsx` (两列分栏样式复原、真实时间/时钟/状态呈现)
- **状态标记 (Status)**：`DONE`
- **交付物与下一步 (Deliverables & Next Step)**：
  - 交付物：
    1. Step 2 对齐向导两列分栏卡片样式（保留 YBTY 与雷速完整对阵、时间、比分）；
    2. 联赛顺序子序列（`isSequentialSubsequence`）与等级规范化（如“俄罗斯甲级联赛” $\leftrightarrow$ “俄甲”）模糊匹配机制；
    3. 溯源根治 YBTY 与雷速真实时间、时钟状态（如“中场休息”、“20:06”）与比分全链路透传，彻底消除虚构占位符。
  - 下一步：推进确定性量化特征提取与纯 Forward 泊松时间衰减推演模型。

---

## 二、重构全生命周期推进状态机

- [x] **第 0 步：重构基石与元规范建立**
  - [x] 创建 `refactor/AI_CODING_STANDARDS_AND_RULES.md`（AI 编码准则与工作流法典）
  - [x] 创建 `refactor/SYSTEM_ARCHITECTURE_AND_PIPELINE.md`（系统全链路架构与契约白皮书）
  - [x] 创建 `refactor/HANDOVER_AND_PROGRESS.md`（任务交接与实时进度看板）
- [ ] **第 1 步：数据确认与契约定义（Data & Canonical Model）** 👈 *【当前进行中】*
  - [x] 确认 YBTY 原始盘口数据格式（滚球、让球/大小球/四分之一盘、主副盘），实现并验证 `ybtyLiveExtractor.ts`
  - [x] 确认 YBTY 赛前盘口数据格式（赛前、倒计时开赛推算、主副盘），实现并验证 `ybtyPrematchExtractor.ts`
  - [x] 确认雷速攻防统计、时序、比分验证机制与战术数据，实现并验证 `leisuInterfaceExtractor.ts`
  - [x] 扩展并落地雷速**联赛积分榜与排名 (`league_standings`)** 及 **进球时间分布 (`goal_distribution`)**
  - [ ] 编写并定稿 `CanonicalMatch` 统一类型定义与实体匹配标准
- [ ] **第 2 步：实现【01 数据采集与解析】与【02 实体对齐】**
  - [ ] 编写 `01_data_ingestion/` 统一调度整合（YBTY 解析器、雷速解析器、比分校验器）
  - [ ] 编写 `02_canonical_model/`（别名匹配器、统一赛事装配器）
  - [ ] 编写解析与对齐的单元测试，用真实样本验证通过
- [ ] **第 3 步：实现【03 确定性量化与博弈引擎】**
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

1. 设计并实现 `02_canonical_model/`：包含 `CanonicalMatch` 统一标准实体契约定义、球队别名模糊/精确对齐引擎与 YBTY + 雷速统一赛事装配器。
2. 编写 `CanonicalMatch` 真实样本生成器与端到端装配对齐单元测试。

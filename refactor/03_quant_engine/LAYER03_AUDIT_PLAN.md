# Layer 03 量化计算层 · 全局审查计划书

> 最近更新：2026-09-24
> 审查范围：仅限 Layer 03（04/05/06 待 03 修复后再审查）
> 协作模式：只做检查 + 分析 + 方案，落地改代码前必须先经用户确认

## 一、审查目标

以专业足球分析师视角（而非普通系统视角），对 Layer 03 的 27 个文件做全量审查，回答三个核心问题：
1. 数学对不对：泊松 / Dixon-Coles / Shin / 五态结算 / 贝叶斯 的数学实现是否正确；
2. 足球合不合理：主场优势、进球时间分布、动量预测力、比分依赖、红黄牌 这些参数是否符合足球领域真实规律；
3. 参数有没有依据：哪些是该拟合却写死的，哪些是合理先验。

输出：问题台账 + 每项修复方案（先给方案，用户确认后再改）。

## 二、审查范围（27 文件，按数据流拓扑分 7 阶段）

| 阶段 | 模块 | 文件 | 审查重点 |
|---|---|---|---|
| 0 熔断 | M1/L0 | l0CircuitBreaker.ts / dataAudit.ts / candidateStateMachine.ts | 数据缺失熔断、候选状态机 |
| 1 情境清洗 | M2 | contextEngine.ts / goalDistribution.ts / lineupImpact.ts / recentForm.ts / h2hDecay.ts / motivationUrgency.ts / globalTierMatrix.ts / tierData.ts / enums.ts / types.ts | 进球DNA、身价、近态、交锋、战意、静态分档 |
| 2 赛前先验 | Stage1 | prematchPriorEngine.ts | A1 主场优势双重编码所在 |
| 3 市场校准 | Stage1.1 | marketDivergenceEngine.ts / devigCalculator.ts / devigMath.ts / asianHandicap.ts | Shin 去水、市场/理论融合、让球 EV |
| 4 实时动量 | M3/M3.5 | momentumQuantEngine.ts / momentumTimeline.ts / momentumMath.ts / eventMomentumFusion.ts | C1/C2 危攻重复计权所在 |
| 5 泊松推演 | M4 | poissonDecayModel.ts / poissonDecay.ts / poissonCore.ts | λ 合成链、时间衰减、urgency |
| 6 OOS+输出 | OOS | oosCalibrationEngine.ts / index.ts | B1/B2 校准覆盖面所在 |

## 三、审查方法论（5 步 × 3 维度）

每个文件按 5 步走：数据溯源 → 字段映射 → 单位换算 → 使用追踪 → 合理性裁决。

每处计算按 3 个专业维度裁决：
- 数学正确性：公式是否与文献一致（Dixon-Coles τ/ρ、Shin z、五态结算）；
- 足球合理性：参数是否落在现实区间（主场优势 1.25~1.40、进球时段分布、动量预测力）；
- 量纲/方向：攻防乘子方向、单位换算、概率归一化。

## 四、已发现问题 + 修复状态（台账快照）

| 编号 | 问题 | 严重度 | 状态 |
|---|---|---|---|
| A1 | 主场优势双重编码（主客比 1.767） | P0 | 待修 |
| A2 | liveStatsWeight 30 分断点跳跃 | P0 | 已修 |
| B1/B2 | ρ 未接入 OOS + OOS 只校准总进球 | P1 | 待修（合并） |
| B3/B4 | 魔法数字零拟合 + 静态分档无 MLE | P2 | 待修 |
| C1/C2/C4 | 危攻 3 路径放大 + 动量统计重复计权 | P1 | 待修（合并） |
| C3/C5 | 市场衰减偏慢 / 死字段清理 | P3 | 暂缓 |

## 五、待查清单

1. trend_summary（盘路走势）已确认存在但未建模，需裁决是否建模；
2. goalDistribution 遗留：进球 DNA 未条件化在比分上、与 urgency 末段放大重叠；
3. 市场权重衰减 C3 的具体衰减率是否需调整。

## 六、修复排期建议

1. A1 主场优势双重编码（影响所有主队盘口 EV 方向，最先修）；
2. C1/C2/C4 危攻去重（影响滚球置信度）；
3. B1/B2 OOS 校准闭环（ρ 接入 + 让球/独赢校准）；
4. B3/B4 参数拟合（历史赛果 MLE 拟合球队攻防）。

## 七、交付物

1. 问题台账：LAYER03_AUDIT_LEDGER.md（持续维护）；
2. 每项修复方案：定位 + 影响评估 + 精确代码 diff（先给用户确认）；
3. 验证报告：npx tsc --noEmit + verify_quant_engine 等测试全绿。

## 八、协作模式

- 只做检查 + 分析 + 方案，不落地改代码；
- 每个问题先给方案，用户确认后再动手；
- 新发现的问题实时归并入台账，标注合并关系。
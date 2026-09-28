# Layer 03 全局审查问题台账 (Audit Ledger)

> 用途：完整记录 Layer 03 量化计算层审查发现的所有问题、状态与合并关系。
> 工作方式：先完整记录问题，再统一讨论修复方案（不边查边改）。
> 最近更新：2026-09-24

## 状态图例
- [x] 已修复并验证
- [ ] 待修复（方案明确）
- [~] 待修复（方案待设计）
- [.] 低危/记录在案，暂缓

## 一、已修复（历史 P1-P6 详见 CONTINUATION.md；本次 A1/A2）

| 编号 | 问题 | 修复内容 |
|---|---|---|
| A1 | 主场优势双重编码（主客比 1.767） | baseGoals 0.56/0.44→0.50/0.50，gamma 1.18/0.85→1.16/0.86，主客比降到 1.349 |
| A2 | liveStatsWeight 30 分断点跳跃（0.25→0.60） | 改连续分段线性 0.20→0.40→0.55→0.78→0.85 |

## 二、建模错误（影响 EV 方向，最高优先级）

| 编号 | 严重度 | 问题 | 状态 | 修复方向 |
|---|---|---|---|---|
| A3 | P1 | 无市场数据（MARKET_DATA_MISSING）时 λ 退化：marketDivergenceEngine 已正确返回 lambda_base=theoryPrior，但 poissonDecayModel 的 if 条件排除了 MARKET_DATA_MISSING，走 else 分支用 getLeagueBaseGoals（baseGoalDiff=0，主客 λ 相等），丢弃身价/近期/H2H/阵型四大维度主客强弱差异 | [ ] | else 分支改用 calibration.lambda_base（或 if 条件放宽为 calibration.lambda_base_home>0） |

## 三、参数零拟合（影响精度）

| 编号 | 严重度 | 问题 | 状态 | 合并关系 |
|---|---|---|---|---|
| B1 | P1 | Dixon-Coles ρ=0.05 固定，rhoOverride 接口已留但未接入 OOS MLE | [~] | 与 B2 合并（同属 OOS 校准闭环） |
| B2 | P1 | OOS 校准覆盖面极窄：lambda_log_adjustment 只对 TOTAL_GOALS 计算，让球/独赢返回 0 | [~] | 与 B1 合并 |
| B3 | P2 | 40+ 魔法数字无拟合依据（主场优势、三源权重 45/30/25、urgency 幅度 0.38/0.22、威胁系数、Kelly 上限等） | [~] | 与 B4 关联 |
| B4 | P2 | 全局实力估计器缺失：球队实力靠静态 T1-T5 分档，无联赛级 α/β 联合 MLE 拟合，不随赛果进化 | [~] | 与 B3 关联 |

## 四、信号重复/失真（影响置信度）

| 编号 | 严重度 | 问题 | 状态 | 合并关系 |
|---|---|---|---|---|
| C1 | P1 | 危攻时序被 3 条路径放大进 λ（threat thrust + trinity momentumSupport + regime） | [~] | 与 C2/C3 合并（同源信号） |
| C2 | P2 | 动量与统计重复计权：momentum 与 stats 相关系数高，仍按 0.45+0.25 独立加权 | [~] | 与 C1/C3 合并 |
| C3 | P2 | 三维度融合是线性加权硬套（momentumSupport/eventSupport/statsSupport 独立算分再 0.45/0.30/0.25 加权），非整体联合建模 | [~] | 与 C1/C2 合并 |
| C4 | P3 | 市场权重衰减偏慢：0.003/分钟，90 分仍剩 46% | [.] | 独立 |

## 五、清理/数据完整性（低危）

| 编号 | 严重度 | 问题 | 状态 |
|---|---|---|---|
| D1 | P3 | 同源折扣矛盾：index.ts 注释 source_lineage_discount=1.0（同源不加成），但 calculateLiveThreatTrinity 仍三源独立加权 | [.] |
| D2 | P4 | parseMarketValue 重复实现：lineupImpact.parseMarketValueToNumber 与 prematchPriorEngine.parseMarketValue 逻辑重复（P6 已修单位换算，但重复代码未合并） | [.] |
| D3 | P4 | squad_market_value 兜底字段：lineupImpact.ts 曾用作 injury impact 身价兜底回退（P1-20 已让 injury impact 不再依赖 squad_market_value，改为基于首发球员个体身价；squad_market_value 兜底仅剩 home/away_market_value_num 导出用途，仍需确认数据摄入层是否实际填充） | [.] |
| D4 | P4 | trend_summary（盘路走势）数据存在但 03 层未建模（设计取舍，需裁决是否建模） | [.] |

## 六、goalDistribution 进球分布（数据可用性缺陷，高优先级）

| 编号 | 严重度 | 问题 | 状态 |
|---|---|---|---|
| E0 | P1 | 进球分布数据可用性极差：无对手维度（不知进球打谁）；matches_count 仅 2~4 场；【样本收缩用进球数而非场次 → 已由 P1-17 修复】；【resonanceMultiplier 70 分后放大 λ 15%~22.5% → 已由 P1-18 修复】；evaluateGoalTimingValidity 场次门控(>=8场)仅展示未拦截 | [~] |
| E1 | P3 | 进球 DNA 是边际分布，未条件化在比分上：76-90 分进球多可能是垃圾时间刷球，非真绝杀能力 | [.] |
| E2 | P1 | 进球 DNA（76-90 放大）与 urgency 末段放大重叠：late_dna 曾通过 resonanceMultiplier 额外放大 λ 15%~22.5%，与 time_fraction 的 DNA 时间积分重复计权 | [x] P1-18 已移除 resonanceMultiplier，改为相干/退相干条件门控 time_fraction |

## 七、待修复问题汇总（按优先级排序）

1. A3 无市场数据 λ 退化（P1，方案明确）
2. E0 进球分布数据可用性（P1，方案明确：样本收缩改用 matches_count 场次口径 + 提高阈值）
3. C1/C2/C3 危攻去重（P1-P2，合并处理）
4. B1/B2 OOS 校准闭环（P1，合并处理）
5. B3/B4 参数拟合（P2，合并处理）
6. C4 市场衰减（P3）、D1-D4 清理（P3-P4）、E1/E2 goalDistribution（P3）
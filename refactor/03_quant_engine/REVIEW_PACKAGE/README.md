# Layer 03 量化计算层 · 代码审查包

> 用途：供无法直接读代码的外部 AI 做【彻底】深度审查。
> 原则：逐行转录全部 27 个文件的真实源码，附数据流上下文 + 术语解读 + 魔法数字标注 + 已知疑点。
> 状态图例：[x]已修 [ ]待修 [~]待设计 [.]低危

## 一、系统目标

足球滚球/赛前量化预测系统。核心任务链：
1. 用双方赛前信息（身价/档次/伤停/近期/交锋/战意/阵型）+ 市场赔率 → 合成理论进球期望 λ_theory；
2. 用机构盘口 Shin 去水反演 λ_mkt，与 λ_theory 贝叶斯收缩融合 → λ_base；
3. 滚球时融入实时动量/事件/统计 → 前向推演剩余进球 λ_rest；
4. 用泊松/Dixon-Coles 网格把 λ 转成胜平负概率；
5. 对让球/大小球/独赢盘口计算五态 EV，挖掘正 EV。

## 二、数据流拓扑（M1 → M6）

CanonicalMatch(标准赛事) →
  M1 数据完整度熔断(l0CircuitBreaker/dataAudit) →
  M2 情境清洗(contextEngine 调度：进球DNA/身价伤停/近期/交锋/战意/静态档次) →
  Stage1 赛前先验(prematchPriorEngine → λ_theory) →
  Stage1.1 市场校准(marketDivergenceEngine → λ_base) →
  M3 实时动量(momentumQuantEngine：危攻时序OLS/AUC + 9项技术统计) →
  M3.5 事件融合(eventMomentumFusion：三源威胁 + EPI + 战术相变 + 破门临界) →
  M4 泊松推演(poissonDecayModel → λ_rest 乘法合成 → 胜平负概率) →
  M5 去水EV(devigCalculator → 五态结算 EV) →
  OOS校准(oosCalibrationEngine) + 候选状态机(candidateStateMachine) →
  QuantitativeFeatures(index.ts 统帅部输出)

## 三、函数调用关系（关键链路）

index.ts calculateQuantitativeFeatures（主入口）依次调用：
- extractCleanedContextFeatures(contextEngine) ← M2
  ├ checkL0CircuitBreaker(l0CircuitBreaker)
  ├ calculateH2HDecayWeights(h2hDecay)
  ├ calculateRecentFormWeights(recentForm)
  ├ extractIsoVenueStandings / extractTacticalFormationFeatures / calculateLineupImpactScores(lineupImpact)
  ├ extractGoalDistributionDNA / evaluateGoalTimingValidity(goalDistribution)
  └ calculateMotivationAndUrgencyIndex(motivationUrgency)
- synthesizePrematchPrior(prematchPriorEngine) ← Stage1
  ├ getTeamStrengthProfile(globalTierMatrix → tierData)
  ├ getLeagueBaseGoals(poissonCore)
  └ computePoisson1X2 → calculateBivariatePoissonGrid(poissonDecay)
- calibrateWithMarketOdds(marketDivergenceEngine) ← Stage1.1
  ├ devigShin(devigMath)
  ├ computePoisson1X2(prematchPriorEngine)
  └ jointMarketLambdaEstimate(内部网格搜索)
- extractMomentumTimelineFeatures(momentumTimeline) + extractRealTimePhysicalStats(momentumQuantEngine) ← M3
  └ calculateLinearRegressionSlope / calculateMomentumIntegral(momentumMath)
- extractSpatioTemporalEventFeatures(eventMomentumFusion) ← M3.5
  ├ calculateDecayedEventScore
  ├ calculateLiveThreatTrinity（三源融合核心）
  ├ calculateEventPressureConversion
  ├ evaluateTacticalRegime
  └ evaluateGoalClimax
- buildUnifiedMatchState(index 内部) ← 凝结统一状态
- calculateInPlayPoissonFeatures(poissonDecayModel) ← M4
  ├ calculateExpectedRemainingMinutesIncludingStoppage(自身)
  ├ calculateTimeDecayAndUrgencyMultiplier(poissonDecay)
  ├ calculateContinuousThreatTensor(poissonDecay)
  └ calculateBivariatePoissonGrid(poissonDecay)
- calculateDeviggedMarketFeatures(devigCalculator) ← M5
  ├ devigShin / devigMultiplicative / applyBayesianShrinkage(devigMath)
  ├ parseAsianHandicapLine / 五态分布(asianHandicap)
  └ calculateBivariatePoissonGrid(poissonDecay)
- selectOosCalibrationProfile(oosCalibrationEngine) + evaluateCandidatePipeline(candidateStateMachine)
- buildLayer03DataAudit / buildLayer03ProductionGate(dataAudit)

## 四、已知问题台账（交叉验证点）

- A1 主场优势双重编码（主客比 1.767）[x] 已修为 1.349
- A2 liveStatsWeight 30分断点跳跃 [x] 已修为连续分段线性
- A3 无市场数据 λ 退化 [ ] P1：poissonDecayModel 的 MARKET_DATA_MISSING else 分支用 getLeagueBaseGoals(主客λ相等)，丢弃 theoryPrior 主客强弱
- B1 Dixon-Coles ρ=0.05 未接入 OOS MLE [~] P1
- B2 OOS 校准只覆盖总进球 λ，让球/独赢返回 0 [~] P1
- B3 40+ 魔法数字无拟合依据 [~] P2
- B4 全局实力估计器缺失（静态 T1-T5 分档，无联赛级 α/β MLE）[~] P2
- C1 危攻时序被 3 条路径放大进 λ [~] P1
- C2 动量与统计重复计权（0.45+0.25 相关信号）[~] P2
- C3 三维度融合线性加权硬套，非整体联合建模 [~] P2
- C4 市场权重衰减偏慢（0.003/分钟，90分仍剩46%）[.] P3
- D1 同源折扣矛盾（source_lineage_discount=1.0 注释 vs 三源独立加权实现）[.] P3
- D2 parseMarketValue 重复实现 [.] P4
- D3 squad_market_value 兜底字段需确认数据摄入是否填充 [.] P4
- D4 trend_summary 未建模（设计取舍）[.] P4
- E0 进球分布数据可用性极差：无对手维度、matches_count 仅2~4场、样本收缩用进球数而非场次、resonanceMultiplier 70分后放大λ 15%~22.5% [ ] P1
- E1 进球DNA未条件化在比分（垃圾时间刷球误判绝杀）[.] P3
- E2 进球DNA 与 urgency 末段放大重叠 [.] P3

## 五、审查方法建议（给外部 AI）

对每个模块，请重点审查：
1. 数学正确性：公式是否与文献一致（Dixon-Coles τ/ρ、Shin z、五态结算）；
2. 足球合理性：参数是否落在现实区间（主场优势 1.25~1.40、进球时段分布、动量预测力）；
3. 数据可用性：输入数据是否可靠（样本量口径、对手维度、单位换算）；
4. 信号重复：同一数据是否被多条路径放大进 λ；
5. 魔法数字：哪些系数写死、哪些该数据拟合。

## 六、审查包文件索引

| 文件 | 覆盖源码 | 行数 |
|---|---|---|
| 00_types.md | types.ts | 1007 |
| 00_enums.md | enums.ts | 174 |
| 01_tier_data.md | tierData.ts + globalTierMatrix.ts | 231+105 |
| 02_m2_context.md | contextEngine+goalDistribution+lineupImpact+recentForm+h2hDecay+motivationUrgency | 153+238+487+349+325+148 |
| 03_stage1_prior.md | prematchPriorEngine.ts | 251 |
| 04_stage1_market.md | marketDivergenceEngine.ts | 306 |
| 05_m3_momentum.md | momentumMath+momentumTimeline+momentumQuantEngine | 96+384+672 |
| 06_m3_5_event.md | eventMomentumFusion.ts | 952 |
| 07_m4_poisson.md | poissonCore+poissonDecay+poissonDecayModel | 95+390+704 |
| 08_m5_devig.md | devigMath+devigCalculator+asianHandicap | 157+793+337 |
| 09_oos_candidate.md | oosCalibrationEngine+candidateStateMachine | 351+561 |
| 10_index.md | index.ts | 899 |
| 11_data_contract.md | 01/02层数据契约 + 真实数据样例 | — |
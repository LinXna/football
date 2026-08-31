# 足球量化系统：全链路数据血统、算子与风控规则追溯矩阵 (Traceability Matrix)

> **版本**：v2.0.0 (Layer 00 ~ 03 黄金基准对齐版)  
> **更新时间**：2026-08-30  
> **黄金基准对齐赛事 (SSOT Golden Fixture)**：**【英甲：谢周三 vs 布拉德福德城 (MatchID: 4562395)】**  
> **核心使命**：实现系统全链路 100% 透明化，让每一个数据字段从输入源头、到清洗算子、到标准模型、再到下游量化博弈、风控拦截与台账核销都有据可查，杜绝任何隐式兜底与幽灵死代码。

---

## 一、全局编号体系命名与分类规范

全系统由三大唯一编号体系进行穿透式关联：
1. **数据字段编号 (Field ID: `F-[层级]-[标识]`)**：标识系统流转中的核心数据属性；
2. **计算算子编号 (Operator ID: `OP-[层级]-[序号]`)**：标识执行提取、组装、量化推演与提炼的纯函数/方法；
3. **风控规则编号 (Rule ID: `RC-[序号]`)**：标识 2026-07-29 回测铁律及系统级硬性拦截门禁。

---

## 二、全链路数据血统与算子矩阵总表 (Data Lineage & Operator Matrix)

| 数据编号 (Field ID) | 字段全路径 (Field Type/Path) | 来源定义 (Source) | 生产算子 (Producer) | 消费下游 (Consumers / Where Used) | 关联风控/断言 (Rule/Assertion) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`F-01-Y01`** | `ParsedYbtyLiveMatch.time_str` | `01_data_ingestion/ybty/types.ts` | **`OP-01-01`** (`parseYbtyLiveRoot`) | 1. **`OP-02-01`** (`parseTimingState`) -> 提取时钟<br>2. **`OP-02-05`** (`assembleCanonicalMatch`) | **`RC-001`** (非法时钟拦截) |
| **`F-01-Y02`** | `ParsedYbtyLiveMatch.home_score / away_score` | `01_data_ingestion/ybty/types.ts` | **`OP-01-01`** (`parseYbtyLiveRoot`) | 1. **`OP-02-03`** (`verifyScoreConsistency`)<br>2. **`OP-02-05`** (`assembleCanonicalMatch`) | **`RC-001`** (比分一致性核验) |
| **`F-01-Y03`** | `ParsedYbtyLiveMatch.markets` | `01_data_ingestion/ybty/types.ts` | **`OP-01-01`** (`parseYbtyLiveRoot`) | 1. **`OP-02-02`** (`resolveMainMarkets`)<br>2. **`OP-03-05`** (Shin 去抽水与 EV 计算) | **`RC-008`** (深盘价值支持) |
| **`F-01-L01`** | `ParsedLeisuMatch.match_id` | `01_data_ingestion/leisu/types.ts` | **`OP-01-03`** (`parseLeisuInterfaceExport`) | 1. **`OP-02-05`** (全局唯一主键装配)<br>2. 全链路日志与台账追踪 | **`RC-SYS`** (全局主键唯一性) |
| **`F-01-L08`** | `ParsedLeisuMatch.attack_momentum` | `01_data_ingestion/leisu/types.ts` | **`OP-01-03`** (`parseLeisuInterfaceExport`) | 1. **`OP-02-04`** (`evaluateCompletenessTier`)<br>2. **`OP-03-02`** (动量斜率与 AUC 梯形积分) | **`RC-002`** (缺失动量降级) |
| **`F-02-C01`** | `CanonicalMatch.timing.minute` | `02_canonical_model/types.ts` | **`OP-02-01`** (`parseTimingState`) | 1. **`OP-03-03`** (泊松剩余时间衰减 $\tau = \frac{90-t}{90}$)<br>2. **`OP-04-03`** (75' 后深盘衰减拦截)<br>3. **`OP-02-06`** (AI Brief 时序提炼) | **`RC-001`** (若 $t < 0$ 或 $> 130$ 熔断) |
| **`F-02-C10`** | `CanonicalMatch.score.home_score / away_score` | `02_canonical_model/types.ts` | **`OP-02-03`** (`verifyScoreConsistency`) | 1. **`OP-03-03`** (滚球 0:0 盘口重置基准)<br>2. **`OP-06-01`** (赛后四分之一盘精确核销) | **`RC-001`** (比分不一致打上 `invalid_data`) |
| **`F-02-C20`** | `CanonicalMatch.markets.full_spread_main` | `02_canonical_model/types.ts` | **`OP-02-02`** (`resolveMainMarkets`) | 1. **`OP-03-05`** (让球公允胜率与盘口价值推导)<br>2. **`OP-04-02`** (安全边际与深盘核验) | **`RC-008`** (深盘必须具备净胜幅度) |
| **`F-02-C30`** | `CanonicalMatch.reference.stats` | `02_canonical_model/types.ts` | **`OP-02-05`** (`assembleCanonicalMatch`) | 1. **`OP-03-02`** (xT 威胁与压迫指数计算)<br>2. **`OP-02-06`** (AI Brief 核心攻防摘要) | **`RC-002`** (缺少核心攻防数据降级) |
| **`F-02-C50`** | `CanonicalMatch.completeness_tier` | `02_canonical_model/types.ts` | **`OP-02-04`** (`evaluateCompletenessTier`) | 1. **`OP-04-01`** (风控准入门禁)<br>2. **`OP-05-01`** (AI 决策权限分配) | **`RC-001`** / **`RC-002`** / **`RC-003`** |
| **`F-03-Q01`** | `QuantitativeFeatures.battlefield_dominance_index` | `03_quant_engine/types.ts` | **`OP-03-06`** (`calculateQuantitativeFeatures`) | 1. **`OP-04-01`** (AI 提示词关键特征)<br>2. 推荐等级划分 | **`RC-008`** (BDI 支撑) |
| **`F-03-Q02`** | `QuantitativeFeatures.confidence_score` | `03_quant_engine/types.ts` | **`OP-03-06`** (`calculateQuantitativeFeatures`) | 1. 机器初筛分级 (WATCH/RESEARCH/REJECT)<br>2. AI 评估置信度校准 | **`RC-002`** (置信度门禁) |
| **`F-03-Q03`** | `QuantitativeFeatures.goal_phase_alert` | `03_quant_engine/types.ts` | **`OP-03-06`** (`calculateQuantitativeFeatures`) | 1. 进球临界预警<br>2. 滚球大小球即时 EV 权衡 | **`RC-MOM-ALERT`** |
| **`F-03-Q28`** | `QuantitativeFeatures.poisson.lambda_home_rest` | `03_quant_engine/types.ts` | **`OP-03-03`** (`solveInPlayPoissonModel`) | 1. 0:0 让球/大小球泊松概率网格求解<br>2. 期望进球期望对比 | **`RC-POISSON-CONSERVED`** |
| **`F-03-Q34`** | `QuantitativeFeatures.devig.h2h_devig` | `03_quant_engine/types.ts` | **`OP-03-05`** (`devigShin`) | 1. 无偏公允概率<br>2. +EV 信号挖掘 | **`RC-DEVIG-SUM-1`** |
| **`F-03-Q35`** | `QuantitativeFeatures.devig.spread_main_ev` | `03_quant_engine/types.ts` | **`OP-03-05`** (`calculateAsianHandicapEV`) | 1. 让球主盘 EV 优选方向与 Kelly 仓位 | **`RC-QUARTER-CONSERVED`** |
| **`F-04-R01`** | `RecommendationCandidate.tier` | `04_ai_reasoning/types.ts` | **`OP-04-01`** (`evaluateRecommendation`) | 1. 推荐等级划分 (A/B/C/WATCH/RESEARCH/REJECT) | **`RC-002`** (B级限制) |
| **`F-04-R03`** | `RecommendationCandidate.risk_controls` | `04_ai_reasoning/types.ts` | **`OP-04-01`** (`evaluateRecommendation`) | 1. 2026-07-29 回测铁律逐项核验清单 | **`RC-003`** / **`RC-008`** |

---

## 三、系统算子清册 (Operator Registry)

### Layer 01: 数据接入层算子
- **`OP-01-01`**：`parseYbtyLiveRoot(raw)` - 提取 YBTY 滚球原始数据载荷，输出强类型 `ParsedYbtyLiveResult`；
- **`OP-01-02`**：`parseYbtyPrematchRoot(raw)` - 提取 YBTY 赛前早盘原始数据载荷，输出强类型 `ParsedYbtyPrematchResult`；
- **`OP-01-03`**：`parseLeisuInterfaceExport(raw)` - 提取雷速接口全维度增强数据，输出强类型 `ParsedLeisuExportResult`。

### Layer 02: 标准模型与对齐算子
- **`OP-02-01`**：`parseTimingState(ybty, leisu)` - 统一解析进行中分钟数、比赛阶段与时钟文本；
- **`OP-02-02`**：`resolveMainMarkets(markets)` - 提取主盘口、次盘口与 1X2 赔率结构；
- **`OP-02-03`**：`verifyScoreConsistency(ybty, leisu)` - 执行滚球双源比分交叉校验，比分冲突立即抛出熔断；
- **`OP-02-04`**：`evaluateCompletenessTier(scoreCheck, leisu, markets)` - 判定数据完整度分级并收集缺陷；
- **`OP-02-05`**：`assembleCanonicalMatch(ybty, leisu)` - 装配统一标准赛事实体 `CanonicalMatch`；
- **`OP-02-06`**：`extractAiEvaluationBrief(canonical)` - 提炼极简轻量级 `AiEvaluationBrief`（低 Token、高语义密度）；
- **`OP-02-07`**：`findBestLeisuMatch(ybty, candidates)` - 双轨赛事别名对齐与主客颠倒反装拦截。

### Layer 03: 确定性量化与博弈引擎算子
- **`OP-03-01`**：`extractCleanContext(canonical, options)` - 基本面时间半衰期衰减 (H2H $T_{1/2}=730$d)、LIS 阵容战力折损、MUI 战意指数与 L0 熔断核验；
- **`OP-03-02`**：`extractMomentumAndPhysicalFeatures(canonical, context)` - 5m/10m/15m 最小二乘斜率、梯形 AUC 能量积分、xT 真实威胁代理与压迫指数；
- **`OP-03-03`**：`solveInPlayPoissonModel(canonical, context, physical)` - 滚球 0:0 重置、非线性时间衰减、临终绝境搏命修正与二维泊松联合网格推演；
- **`OP-03-04`**：`devigShin(odds)` / `devigMultiplicative(odds)` - Shin 知情交易者去抽水与乘法去抽水算法；
- **`OP-03-05`**：`calculateAsianHandicapEV(line, hOdds, aOdds, poisson)` / `calculateTotalEV` - 四分之一盘口复合期望、半赢半输概率与 Kelly 最优仓位；
- **`OP-03-06`**：`calculateQuantitativeFeatures(canonical, options)` - 统帅部最高聚合算子，生成 BDI 战场统治权指数、综合置信度、破门相变预警与风控标记。

---

## 四、核心风控规则编号清单 (Risk Control Rules)

- **`RC-001` (滚球比分冲突硬熔断 / L0 Fatal Kill)**：
  - 若 YBTY 实时比分与雷速官方比分不一致，实体打上 `TIER_INVALID`，触发 L0 熔断，置信度直接清零降级，严禁产生任何正式推荐，赛后结算标记为 `invalid_data`。
- **`RC-002` (B 级推荐单串关限制)**：
  - 评级为 B 级或数据降级为 `TIER_2_BASIC` 的方向，最多只允许进入 1 组正式串关，严禁跨串复用。
- **`RC-003` (首发未确认降级与风控门禁)**：
  - 杯赛、友谊赛及强弱悬殊赛事在正式首发大名单确认前，最高只能评为 C 级，禁止进入正式串关。
- **`RC-008` (深盘净胜幅度支持)**：
  - 强队推荐深盘必须具备同级别历史净胜球能力与完整阵容支持，严禁仅凭名气或低赔率盲目推深盘。
- **`RC-L0-FUSE` (时钟缺失或盘口缺失硬熔断)**：
  - 滚球进行中比赛若无法解析有效进行分钟或缺失目标盘口，直接终止计算并打上熔断标记。
- **`RC-SWAP-DEFENSE` (主客颠倒反装拦截)**：
  - 双源匹配中检测到主客场完全颠倒时，标记为 `SWAPPED_HOME_AWAY` 并锁定对齐，防止反向投注。

---

## 五、黄金基准赛事【英甲：谢周三 vs 布拉德福德城 (ID: 4562395)】全链路数据透视

- **赛事基本信息**：英格兰甲级联赛 | 谢周三 (Home, ID: 10101) vs 布拉德福德城 (Away, ID: 10102)
- **`[OP-02-01][F-02-C01]` 统一时钟**：`62'` (下半场, `stage: LIVE`, `is_running: true`, 剩余 `28'`)
- **`[OP-02-03][F-02-C10]` 实时比分**：`0 - 1` (`score_verified: true`, `score_source: LEISU_INTERFACE`)
- **`[OP-02-02][F-02-C20]` 核心让球主盘**：`-0/0.5` @ 主 2.20 / 客 1.71
- **`[OP-02-02][F-02-C20]` 核心大小球主盘**：`2` @ 大 1.91 / 小 1.95
- **`[OP-02-02][F-02-C20]` 核心欧指独赢盘**：主胜 8.70 / 平局 3.75 / 客胜 1.43
- **`[OP-02-05][F-02-C30]` 核心攻防统计**：控球率 60% vs 40% | 射正 3 vs 3 | 危险进攻 38 vs 30 | 角球 6 vs 7
- **`[OP-02-04][F-02-C50]` 数据完整度分级**：`TIER_1_FULL`（所有攻防、动量、阵容、交锋数据 100% 齐全，缺陷列表为空 `[]`）
- **`[OP-02-06]` AI Brief 提炼包字符长度**：834 字符（超轻量，压缩率达 99.8%）
- **`[OP-03-06]` 37 项量化推演输出战报**：
  - **战场统治权指数 (BDI)**：`-19.33` (客队布拉德福德城在客场具备微弱防守反击统治权)
  - **综合量化置信度**：`98/100`
  - **破门相变预警**：`DEADLOCK_STALEMATE` (僵局缠斗)
  - **滚球 0:0 剩余预期进球**：主 `0.254` vs 客 `0.553` (剩余预期总进球 `0.807`)
  - **投影全场最可能比分**：`0 - 1`
  - **5m 爆发斜率**：`-28.6` | **15m 净动量积分**：`-16`
  - **xT 真实威胁**：主 `1.82` vs 客 `1.655` | **即时压迫指数**：`+0.118`
  - **让球主盘 (-0/0.5) 评估**：优选客队 `away`，客胜公允概率 `67.54%`，客胜 EV `+15.49%` (发现 +EV 投资机会)

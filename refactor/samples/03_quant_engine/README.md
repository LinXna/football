# Layer 03 确定性量化与博弈引擎样例说明 (Quant Engine Samples)

> **版本**：v1.0.0  
> **更新时间**：2026-08-30  
> **数据文件**：[`quant_features_sample.json`](./quant_features_sample.json)  
> **基准赛事**：【英格兰甲级联赛：谢周三 (0) vs 布拉德福德城 (1) - 62分钟 (ID: 4562395)】

---

## 一、样例文件概述

`quant_features_sample.json` 是由 Layer 03 统帅部最高聚合算子 `calculateQuantitativeFeatures` 针对黄金基准赛事（MatchID: 4562395）执行全量纯数学推演后生成的不可变特征集快照。

该文件完整包含了全系统规范定义的 **37 项量化特征**，严格满足纯函数无副作用、无 NaN/Infinity、概率守恒（Sum(P)=1.0）与四分之一盘口精确复合。

---

## 二、六大领域子系统字段透视

### 1. 基本面清洗与环境修正 (`context`)
- **`circuit_breaker`**：L0 熔断判定为 `is_triggered: false`，比分与时钟 100% 可信；
- **`h2h_weights`**：6 场历史交锋根据 730 天半衰期分别计算出 `[0.98, 0.95, 0.82, ...]` 指数衰减权重；
- **`lineup_impact`**：主队 LIS 0.40 vs 客队 LIS 0.80（客队阵容极完整，主力在场率高）；
- **`motivation_urgency`**：主队 MUI 1.00 vs 客队 MUI 1.03（联赛中期争分阶段）。

### 2. 动量时序与动态压迫特征 (`momentum`)
- **`slope_5m`**：`-28.60` (客队在过去 5 分钟发动强劲反扑)；
- **`slope_15m`**：`-1.07`；
- **`integral_5m`**：主 31.0 vs 客 59.0 (净值 `-28.0`)；
- **`integral_15m`**：主 146.0 vs 客 162.0 (净值 `-16.0`)；
- **`dominance_side`**：`neutral` (双方处于僵持缠斗状态)。

### 3. 现场物理攻防与威胁转化 (`physical_stats`)
- **`xt_proxy`**：主队 xT 1.82 vs 客队 xT 1.655 (xT 比率 1.10)；
- **`conversion_efficiency`**：主队转化率 0.00 vs 客队转化率 0.17；
- **`pressure_index`**：`+0.118` (主队在进攻三区具备微弱压迫净优势)；
- **`tactical_anomaly`**：未触发无效控球 (`barren_dominance: false`)。

### 4. 滚球 0:0 重置 Forward 泊松网格推演 (`poisson`)
- **`elapsed_minute` / `remaining_minutes`**：62' 已过，剩余 28 分钟；
- **`lambda_home_rest` / `lambda_away_rest`**：主队剩余进球期望 0.254，客队剩余进球期望 0.553；
- **`expected_goals_rest`**：剩余总进球期望 0.807；
- **`rest_score_matrix`**：
  - 后续时段主队净胜概率：`13.79%`
  - 后续时段打平概率：`55.45%`
  - 后续时段客队净胜概率：`30.76%`
- **`projected_final_score`**：投影全场比分 0.25 - 1.55，最可能完场比分 `"0-1"`。

### 5. 市场去抽水与全盘口 EV 评估 (`devig`)
- **`h2h_devig`**：Shin 去抽水后公允赔率：主胜 9.87 (10.13%) / 平局 3.98 (25.13%) / 客胜 1.55 (64.74%)；
- **`spread_main_ev`**：针对 YBTY 让球主盘 `-0/0.5` @ 主 2.20 / 客 1.71：
  - 优选方向：`away` (客队受让方)；
  - 客队期望收益率 (EV)：`+15.49%` (触发 +EV 投资信号)；
- **`total_main_ev`**：针对 YBTY 大小球主盘 `2` @ 大 1.91 / 小 1.95：
  - 优选方向：`under` (小球)；
- **`bookmaker_posture`**：识别为 `TRAP_HIGH_ODDS` (庄家高赔诱主)。

### 6. 统帅部综合指标 (`Executive Summary`)
- **`battlefield_dominance_index`**：`-19.33`；
- **`confidence_score`**：`98/100`；
- **`goal_phase_alert`**：`DEADLOCK_STALEMATE`；
- **`positive_ev_signals`**：成功识别出让球客队盘口具备真实数学正期望收益。

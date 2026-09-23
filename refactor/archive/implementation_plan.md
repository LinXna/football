# [已归档/阶段性方案备忘] 修复 EV 计算：市场与物理先验权重校准计划

> [!WARNING]
> **方案状态与风险纠偏声明 (2026-09-22 归档)**：
> 1. 本文档为 2026 年 9 月初推演“物理先验优先权重动态调节”的阶段性实施草案。
> 2. **博弈风险重大纠偏**：草案中提及的“偏差越大，越不信任市场盘口而反向加码理论先验权重”在后续实盘风控审计（见 `SNAPSHOT-20260922-CORE-QUANT-ATOMIC-STORAGE-HARDENING`）中被**硬性否定与重构**。当机构真实盘口与理论先验发生超大分歧时（例如突发场外退赛、更衣室内讧或资金剧烈防御），盲目逆向加大理论权重会导致反向被机构绞杀。系统已正式演进为**“信息不对称避险（`informationAsymmetryRisk`）机制”**：对过大分歧降低置信度并提示弃防（`pass_recommendation_advised`），严禁无节制放大理论权重逆向硬刚。
> 3. 本文件的现行落地与权威架构请统一参见：
>    - `/refactor/SYSTEM_QUANT_REFACTOR_BLUEPRINT.md`
>    - `/refactor/03_quant_engine/marketDivergenceEngine.ts`

## 问题背景

当前 `marketDivergenceEngine.ts` 的 `calibrateWithMarketOdds()` 使用 **85% 市场反推 λ + 15% 理论先验 λ** 的贝叶斯收缩公式。这意味着系统以市场赔率为"地面真值"，而独立的物理/基本面先验只起到微弱的修正作用。

在极端滚球场景下（如谢周三 0-1 落后@62'），市场为了定价让球盘 `-0/0.5`，反推出主队 λ_H = 0.93——这远远偏离了主队实际的物理表现（被围攻、射门效率低）。结果系统输出误导性的 `EV: +45.1%`。

**根本原因**：市场赔率在滚球阶段包含了大量的"投注流量噪声"与机构操控因素，不应被当作预测的"锚"。系统应该**先以独立物理/基本面证据推导基准期望，再用市场赔率作为偏差检测与信号层**。

## 修改方案

### 架构反转：物理先验优先 (Physics-First Calibration)

将当前的 `85% market + 15% theory` 反转为 **动态权重**：

**核心逻辑**：
- **赛前阶段**：市场信息相对可靠，使用 `60% market + 40% theory`（相比原来 85/15 已大幅提升理论权重）
- **滚球阶段**：随比赛推进，市场噪声增大、物理证据增多，动态调整权重：
  - 早期滚球（0-30分钟）：`55% market + 45% theory`
  - 中期滚球（30-60分钟）：`45% market + 55% theory`  
  - 晚期滚球（60-90分钟）：`35% market + 65% theory`
- 偏差调制：在轻中度分歧范围内，允许小幅下调市场权重（上限 0.15），但不可无限制放大理论权重；超大分歧时触发信息不对称熔断防守。

**公式**：

```
baseMarketWeight = isInPlay 
  ? max(0.30, 0.55 - minute * 0.003)  // 滚球：0.55 → 0.28
  : 0.60                               // 赛前

// 偏差调制：小幅偏差平滑调节，严重不对称则由外层降置信度防守
divergencePenalty = min(0.15, |netDelta| * 0.20)
finalMarketWeight = max(0.25, baseMarketWeight - divergencePenalty)
finalTheoryWeight = 1.0 - finalMarketWeight
```

> [!IMPORTANT]
> 这是一个**架构级修改**。修改后所有使用 `calibrateWithMarketOdds()` 输出的下游模块（M4 Poisson、M5 Devig）的数值都会发生变化。必须确保现有回归测试全部通过。

## Proposed Changes

### Layer 03 量化引擎

#### [MODIFY] [marketDivergenceEngine.ts](refactor/03_quant_engine/marketDivergenceEngine.ts)

修改 `calibrateWithMarketOdds()` 中第 238-245 行的权重逻辑：

1. 将固定的 `marketWeight = 0.85` / `theoryWeight = 0.15` 改为**动态计算**
2. 赛前使用 `0.60 / 0.40`，滚球随分钟数递减市场权重
3. 当理论与市场偏差极大时，额外惩罚市场权重（`divergencePenalty`）
4. 添加 `lambda_decomposition` 中权重的可审计输出

#### [MODIFY] [types.ts](refactor/03_quant_engine/types.ts)

在 `MarketCalibrationResult` 中增加两个可审计字段：
- `market_weight_applied: number` — 实际使用的市场权重
- `theory_weight_applied: number` — 实际使用的理论权重

---

### 回归测试

#### [MODIFY] [verify_quant_engine.ts](refactor/tests/verify_quant_engine.ts)

1. 添加 Test 10：**物理先验优先权重回归测试**
   - 验证赛前阶段市场权重 = 0.60
   - 验证滚球 62 分钟市场权重 < 0.45
   - 验证极端偏差场景下市场权重被进一步压低
2. 更新 Test 9 的阈值（深盘大热门反演测试），确认主队 λ 仍然显著高于客队

## Verification Plan

### Automated Tests
```bash
npx tsx refactor/tests/verify_quant_engine.ts
npx tsc --noEmit
```

### Manual Verification
- 使用谢周三 0-1 @62' 场景验证 EV 不再出现 +45.1%
- 确认深盘大热门（布尔萨体育）场景仍然正常

## Open Questions

1. 赛前阶段的 `0.60/0.40` 权重分配是否需要用户确认？当前选择是基于"赛前基本面（阵容/伤停/积分榜/近态）信息已经相当丰富，但市场仍有独立信息价值"的判断。
2. 滚球阶段权重递减公式 `0.55 - minute * 0.003` 的斜率是否合理？当前设计在 90 分钟时市场权重降至 ~0.28。


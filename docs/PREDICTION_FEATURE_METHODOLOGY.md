# 比赛分析与预测量化方法学契约 (Prediction & Quantitative Methodology Contract)

## 1. 核心量化原则

所有输入字段先完成数据口径与双源一致性校验，再进入量化特征提取。系统坚决摒弃“只看低赔”与“经验文字描述不计分”的脱节做法，通过数学概率模型（泊松分布、非线性时段衰减、角球压制力、红牌物理失衡与 +EV 价值门禁）构建完整的量化闭环。

---

## 2. 滚球与赛前核心量化方程

### 2.1 泊松分布与非线性时间衰减函数
足球进球在比赛时间上的分布呈现明显的非均匀性与战术阶段性。系统采用分段加权时间积分 $W(t)$ 替换原先粗糙的线性均摊：

$$W(t) = \int_t^{90} w(\tau) d\tau$$

各时段权重系数 $w(\tau)$ 定义如下：
- **0' ~ 15' (战术试探期)**：$w = 0.85$（节奏较慢，试探为主）
- **16' ~ 45' (常规阵地推进期)**：$w = 1.00$（标准基准）
- **46' ~ 55' (半场重整期)**：$w = 0.92$（易受中场战术部署收缩影响）
- **56' ~ 75' (换人提速与核心攻坚期)**：$w = \mathbf{1.22}$（替补奇兵上场、体能分水岭、攻防转换加快）
- **76' ~ 90'+ (体能断崖与搏命攻防期)**：$w = \mathbf{1.28}$（防守阵型散乱、补时绝杀高发）

结合实时技术统计与角球贡献计算剩余期望进球：
$$\lambda_{rest} = \left( \frac{xG_{shots} + xG_{corners}}{t} \times (90 - t) \times \frac{W(t)}{\frac{90-t}{90}} + P_{trend} \right) \times M_{red}$$

### 2.2 角球压制力与进攻优势指数 (Dominance Index)
角球不仅是死球战术，更是边路撕裂与禁区围攻程度的直接体现：
- **实时角球净差**：$\Delta Corners = Corners_{home} - Corners_{away}$
- **每 10 分钟角球爆发速率**：$Velocity_{10min} = \frac{Corners_{total}}{\max(minute, 1)} \times 10$
- **实时综合优势指数 (Dominance Index)**：
  $$Dominance = 1.8 \Delta S_{target} + 0.35 \Delta S_{total} + \mathbf{0.40 \Delta Corners} + 0.04 \Delta Danger + 0.015 \Delta Attack + \mathbf{6.5 \Delta Red}$$

### 2.3 纪律失衡与红牌物理乘数 (Red Card Multipliers)
当某队领到红牌（少打一人）时，系统对其防守失球期望施加物理放大乘数：
- 1 张红牌：受罚方失球率放大 **$1.75 \times \sim 2.10 \times$**，进攻期望削减至 **$0.55 \times \sim 0.65 \times$**；
- 2 张红牌：受罚方失球率放大 **$2.30 \times \sim 2.80 \times$**。

### 2.4 历史交锋 (H2H) 与主客场特异性泊松先验
在 `interface_features.py` 中通过双方主客场场均得分（PPG）、场均进球/失球比及 H2H 历史场均进球，预先推导主客队理论进球期望 $\lambda_{home\_prior}$ 与 $\lambda_{away\_prior}$，作为滚球与赛前判定的基准针（Prior Anchor）。

### 2.5 真实盘口抽水剥离与 +EV 价值门禁 (Fair Probability & Positive EV Gate)
为避免踩入庄家高抽水的“低赔负期望”陷阱，系统在评估任何盘口时强制执行：
1. **公允概率 (Fair Probability)**：
   $$Fair\ Prob = \frac{1 / Odds}{\sum (1 / Odds_i)}$$
2. **期望收益率 (Expected Value)**：
   $$EV = (P_{model} \times Odds) - 1.0$$
3. **价值边际 (Value Edge)**：
   $$Value\ Edge = (P_{model} - Fair\ Prob) \times 100\%$$

**硬性门禁**：仅当 $EV > 0$ 且 $Value\ Edge \ge +2.5\%$ 时，方向才允许被推荐。

---

## 3. 串关去重与反脆弱独立性契约 (Parlay Integrity & Deduplication)

1. **组合签名唯一性 (Ticket Signature Deduplication)**：
   - 每张串关票按照其包含的 `[比赛ID + 玩法 + 盘口选项]` 生成唯一排序签名；
   - 严禁输出两张包含完全相同比赛组合的 2 串 1 票。
2. **核心腿重叠率熔断 (Max Overlap Gate)**：
   - 同为 2 串 1 票：允许重叠场次 = **0 场**（完全独立对冲）；
   - 2 串 1 与 3 串 1 之间：允许重叠核心腿 $\le \mathbf{1}$ 场，严禁两张票共用完全相同的 2 场核心骨架。
3. **专项票严格排他选取 (Exclusive Selection)**：
   - 前端专项推荐（如大小球专项票）强制排除已被综合价值票选用的比赛。


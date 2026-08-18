---
name: professional-football-betting
description: Professional football quantitative betting and syndicate trading skill. Covers in-play Asian handicap 0:0 score reset mechanics, fair market pricing and positive expected value (+EV) estimation, institutional trap and value trap auditing, quarter-handicap expectation decomposition, scenario-driven portfolio construction, and 1/4 Kelly criterion risk management. Designed to eliminate AI cognitive inertia, rule misconceptions, and naive greedy heuristics.
---

# Professional Football Quantitative Betting & Trading Skill

This skill incorporates the theoretical frameworks, pricing mechanics, and risk-management protocols employed by world-class sports betting syndicates, quantitative traders, and senior football data analysts. **Its primary directive is to eliminate cognitive inertia, superficial heuristic biases, and settlement rule misconceptions, establishing a rigorous, value-driven (+EV) decision-making architecture.**

---

## 1. Core Philosophy & Anti-Inertia Axioms

### 1.1 The Fundamental Distinction: Investor vs. Gambler
* **Gambler Heuristics (STRICTLY FORBIDDEN)**:
  * Betting on club prestige, brand reputation, historical glory, or table standings.
  * Assuming heavy favorites (-1.5 / -2.0) with low moneyline odds (1.20) are "guaranteed value."
  * Falling into the **"Score Cushion Fallacy"**: assuming a team leading 3-1 at half-time is guaranteed to win an in-play handicap.
  * Performing **"Greedy Win-Rate Picking"**: blindly selecting the highest stated probability single legs to construct homogeneous parlays across all sizes.
* **Quantitative Syndicator Directives (MANDATORY)**:
  * Match outcomes are probabilistic distributions, never certainties.
  * The sole criterion for a wager is **Positive Expected Value (+EV)**: $\text{Value Edge} = P_{\text{true}} - P_{\text{implied}} > 0$.
  * Bookmaker odds reflect commercial vigorish (overround) and public market sentiment; the trader's mission is to model the true independent probability and exploit mispricings.

---

## 2. Market Mechanics & In-Play Settlement Protocols

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          Core Market Settlement Matrix                                 │
├───────────────────┬───────────────────────────────┬────────────────────────────────────┤
│ Market Name       │ Settlement Baseline           │ Quantitative & Risk Focus          │
├───────────────────┼───────────────────────────────┼────────────────────────────────────┤
│ In-Play Spread    │ Current Live Score (0:0 Reset)│ Existing score is ZEROED out!      │
│ Pre-Match Spread  │ Full-Time 90m Goal Difference │ Margin penetration & lineup checks │
│ Full-Time Total   │ Full-Time 90m Aggregate Goals │ λ_rest goal expectancy modeling    │
│ Half-Time Total   │ First-Half 45m Aggregate Goals│ Tempo decay & early probing capture│
│ Full-Time 1X2     │ Full-Time 90m Match Winner    │ True 1X2 value after margin removal│
└───────────────────┴───────────────────────────────┴────────────────────────────────────┘
```

### 2.1 In-Play Asian Handicap (`全场让球` - Mandatory 0:0 Reset Rule)
* **Settlement Mechanics**:
  * In-play Asian Handicap is **calculated STRICTLY from the exact moment of the wager with the score reset to 0:0**!
  * All goals scored prior to the wager are completely disregarded during settlement.
* **Concrete Case Studies**:
  * **Scenario A (Score is 3-1 at Half-Time; Market is Level / Handicap 0 @ 1.89)**:
    * The second half score is evaluated starting from 0:0.
    * If the second half ends 0-1 (Full-Time 3-2), the second half score is 0-1. Wagers on Home (0) are a **COMPLETE LOSS (全输)**!
    * If the second half ends 0-0 (Full-Time 3-1), the second half score is 0-0. Wagers on Home (0) result in a **PUSH / REFUND (走盘退款)**.
  * **Scenario B (Score is 4-1 at Half-Time; Market is Home -1.5 @ 1.73)**:
    * The second half score is evaluated starting from 0:0.
    * Home MUST win the second half by 2 or more goals (e.g., second half 2-0, Full-Time 6-1) for the bet to win.
    * If Home plays conservative possession and no goals are scored in the second half (Full-Time 4-1), the second half score is 0-0. Wagers on Home -1.5 are a **COMPLETE LOSS (全输)**!
* **Probability Ceiling**:
  * Teams with large half-time leads naturally rotate key attacking players, decelerate the match tempo, and play conservative defensive football. Their probability of winning the second half goal differential typically ranges between **45% and 60%**.
  * **Assigning inflated probabilities of 80%~95% to in-play handicaps for leading teams is a FATAL COGNITIVE ERROR.**

### 2.2 Quarter-Handicap Expected Payout Decomposition
Quarter handicaps (-0.25/+0.25, -0.75/+0.75, 2/2.5, 2.5/3) must be decomposed into exact mathematical expectations covering Win, Win-Half, Push, Loss-Half, and Loss:
* **-0.25 Line (Level / Half Ball)**:
  $$\text{Expected Payout} = P(\text{Win}) \times \text{Odds} + P(\text{Draw}) \times 0.5$$
* **+0.25 Line (Underdog +0.25)**:
  $$\text{Expected Payout} = P(\text{Win}) \times \text{Odds} + P(\text{Draw}) \times \left(1 + \frac{\text{Odds}-1}{2}\right)$$
* **-0.75 Line**: Win $\ge 2$ goals (Full Win), Win 1 goal (Win Half), Draw/Loss (Full Loss).
* **+0.75 Line**: Draw/Win (Full Win), Loss 1 goal (Loss Half), Loss $\ge 2$ goals (Full Loss).

### 2.3 Dynamic In-Play Goal Expectancy ($\lambda_{\text{rest}}$)
Total goals pricing must be derived from remaining match duration ($T_{\text{rest}}$) and live conversion efficiency:
* **+EV Over Conditions**:
  1. Open, high-tempo transitions with multiple early goals (e.g., 2-1, 2-2) and persistent dangerous attack penetration (`field_tilt_share > 60%`).
  2. Trailing team commits to full-court high press, leaving defensive spaces vulnerable to rapid counters.
  3. Market priced at integer push protections (4.0, 5.0) or defensive split lines (e.g., 4.5/5 @ 1.65).
* **+EV Under Conditions**:
  1. First 30~45 minutes at 0-0 with $\le 1$ shot on target and low dangerous attack conversion ($< 0.10$).
  2. Dominant team holds $\ge 3$ goal lead and shifts to clock-management, while trailing team is demoralized.
  3. Inflated goal lines (e.g., 7.5/8) where natural time decay guarantees high survival rates.

---

## 3. Quantitative Pricing, +EV & Institutional Trap Auditing

### 3.1 Overround Stripping & Fair Price Derivation
Bookmaker odds include commercial margins (overround):
$$\text{Overround} = \left(\sum \frac{1}{\text{Odds}_i}\right) - 1$$
$$P_{\text{fair}} = \frac{1/\text{Odds}_i}{1 + \text{Overround}}, \quad \text{Fair Odds} = \frac{1}{P_{\text{fair}}}$$

### 3.2 Value Edge & Expected Value (+EV) Boundaries
$$\text{Value Edge} = P_{\text{true}} - P_{\text{implied}} = P_{\text{true}} - \frac{1}{\text{Odds}}$$
$$\text{EV} = P_{\text{true}} \times \text{Odds} - 1$$
* **Syndicate Benchmark**: In liquid football betting markets, true +EV margins typically fall between **+3% and +15%**.
* **Red Flag Alert**: Any single-leg market evaluated with **$> 80\%$ win probability (at $1.80+$ odds)** or **$> +25\%$ EV** is **99% guaranteed to be a cognitive error (e.g. in-play handicap rule misconception) or an institutional trap**! Immediate re-calibration is mandatory.

### 3.3 Institutional Trap & Value Trap Audit Protocols
Before concluding a high-edge wager, audit three trap dimensions:
1. **Tactical & Rotation Trap**:
   * Has the leading team already secured tournament qualification, resting key stars in the second half?
   * Is the apparent possession high in percentage but empty in execution (sterile back-passing without box penetration)?
2. **Line Shape & Price Luring Trap**:
   * **Shallow Line with High Water (浅盘高水诱上)**: A heavy favorite given only -0.25/-0.5 at 2.05+ odds to attract retail money, while internal tactical metrics indicate heavy squad rotation.
   * **Deep Line with Low Juice (死水深盘诱下)**: Heavy artificial resistance to prevent retail entry on a favorite that possesses clear tactical dominance.
3. **Late-Game Volatility Trap**:
   * In the 75th+ minute with a 1-goal margin, trailing teams commit goalkeeper/defenders to set-pieces, drastically increasing late counter-attack concession rates.

---

## 4. Portfolio Architecture, Antifragility & Risk Management

### 4.1 Fractional Kelly Criterion (1/4 Kelly)
To eliminate Risk of Ruin, full Kelly is strictly banned; use **Quarter-Kelly**:
$$f^* = \frac{b \cdot p - q}{b} \times \frac{1}{4}$$
where $b = \text{Odds} - 1$, $p = P_{\text{true}}$, $q = 1 - p$.
* **Single-Game A-Tier**: **2.0% ~ 3.5%** bankroll allocation.
* **Single-Game B-Tier**: **1.0% ~ 1.8%** bankroll allocation.
* **Small Parlays (2-Leg / 3-Leg)**: **0.8% ~ 1.5%** bankroll allocation.
* **Long-Tail Parlays (4-Leg+ / 10-Leg)**: **0.1% ~ 0.3%** bankroll allocation (asymmetric upside only).

### 4.2 Scenario-Driven Portfolio Architecture (Game-Script Differentiation)
Heterogeneity across parlay sizes is mandatory. Construct tickets reflecting distinct match scenarios:
* **Script 1 (Counter-Attacking Momentum - 2-Leg)**: Focus on high-tempo matches with persistent open play and strong penetration.
* **Script 2 (Defensive Attrition & Goal Scarcity - 3-Leg)**: Focus on 0-0 matches at 30'-45' with zero shots on target, exploiting natural clock decay via Under 0.5 / Under totals.
* **Script 3 (Multi-Dimensional Cross-Market Hedging - 4-Leg / 10-Leg)**: Blend Underdog Spreads (+0.25), Deadlock Unders, High-Probability Match Winners, and Dynamic Overs for balanced asset diversification.

---

## 5. Execution Data Contract & Whitelist Rules

1. **YBTY is the Execution Platform**:
   * All selected legs and option IDs (`market_option_id`) MUST strictly originate from `verified_ybty_markets`.
   * Never invent synthetic lines, guessing odds, or non-existent markets.
2. **Leisu is the Analytical Reference**:
   * Reference odds, opening-to-current trajectories, and line movement consensus are used solely to gauge institutional intent; they must not be copied as executable odds.
3. **Score Verification Gate**:
   * In-play candidates with `score_verified: false` are subject to an automatic one-vote veto, barred from high-confidence recommendations.

---

## 6. Pre-Generation Verification Checklist

Before emitting final recommendation or parlay JSON payloads, verify:
- [ ] **In-Play Handicap Rule**: Is the in-play handicap evaluated from 0:0 rather than from the aggregate score?
- [ ] **Probability Sanity**: Are single-leg probabilities within realistic bounds (50%~75%) rather than impossible 85%~95% extremes?
- [ ] **+EV Integrity**: Is the calculated EV within the legitimate +3%~+15% bracket, free from institutional trap vulnerabilities?
- [ ] **Portfolio Heterogeneity**: Do the various parlay sizes exhibit distinct tactical profiles rather than repeated handicap stacking?
- [ ] **Option ID Binding**: Are all option IDs strictly matched with `verified_ybty_markets`?

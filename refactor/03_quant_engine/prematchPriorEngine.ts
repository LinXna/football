/**
 * @file prematchPriorEngine.ts
 * @description Layer 03 Stage 1: 赛前多维关联理论先验合成器
 * 
 * 核心逻辑：
 * 1. 战力关联层：首发名单 + 身价占比 + 关键位置伤停 (Lineup Impact Score, LIS)；
 * 2. 状态与战意关联层：主客同构近态 (Iso-Venue Form) + 730天指数衰减交锋 (H2H Decay) + 积分榜保级/争冠紧迫度 (MUI)；
 * 3. 大盘基线合成：联赛场均攻防基准与主场优势，闭式推导理论进球期望 (λ_H^0, λ_A^0) 与胜平负理论概率。
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import {
  PrematchTheoryPrior,
  CleanedContextFeatures,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';
import { calculateBivariatePoissonGrid, LEAGUE_DNA_MAP } from './poissonDecayModel.js';

/**
 * 解析身价占比与阵容成色
 */
function parseMarketValue(mvText: string | null | undefined): number {
  if (!mvText) return 0;
  const cleaned = mvText.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  if (isNaN(val)) return 0;
  if (mvText.includes('亿') || mvText.toUpperCase().includes('B')) return val * 10000;
  if (mvText.includes('万') || mvText.toUpperCase().includes('M')) return val;
  return val;
}

/**
 * 基于泊松分布计算理论胜平负公允概率 (已引入 Dixon-Coles 修正)
 */
export function computePoisson1X2(
  lambdaH: number,
  lambdaA: number,
  maxGoals: number = 8
): { home_win: number; draw: number; away_win: number } {
  const result = calculateBivariatePoissonGrid(lambdaH, lambdaA, maxGoals);
  return {
    home_win: Number(result.prob_home_win_rest.toFixed(4)),
    draw: Number(result.prob_draw_rest.toFixed(4)),
    away_win: Number(result.prob_away_win_rest.toFixed(4))
  };
}

/**
 * Stage 1: 合成赛前多维关联理论先验
 */
export function synthesizePrematchPrior(
  match: CanonicalMatch,
  context: CleanedContextFeatures,
  collector?: DeficitCollector,
  tracer?: Tracer
): PrematchTheoryPrior {
  tracer?.info(
    Layer03OpId.PREMATCH_PRIOR_SYNTHESIS,
    'SYNTHESIZE_PRIOR',
    'Synthesizing Stage 1 multi-dimensional prematch prior',
    undefined,
    match.canonical_id
  );

  // 1. 战力层关联：身价对比 + LIS 分位置伤停折损 (区分 ST 终结 vs CB/GK 漏球)
  const homeMv = context.lineup_impact.home_market_value_num;
  const awayMv = context.lineup_impact.away_market_value_num;

  let squadRatioH = 1.0;
  let squadRatioA = 1.0;
  if (homeMv > 0 && awayMv > 0) {
    const totalMv = homeMv + awayMv;
    squadRatioH = Math.max(0.6, Math.min(1.4, 1.0 + (homeMv / totalMv - 0.5) * 0.8));
    squadRatioA = Math.max(0.6, Math.min(1.4, 1.0 + (awayMv / totalMv - 0.5) * 0.8));
  }

  const lisH = context.lineup_impact.home_lis; // [0.75 ~ 1.0]
  const lisA = context.lineup_impact.away_lis;

  // 主客攻防战力乘子
  const strikerPenH = context.lineup_impact.home_striker_missing ? 0.88 : 1.0;
  const strikerPenA = context.lineup_impact.away_striker_missing ? 0.88 : 1.0;
  const defenderLeakH = context.lineup_impact.home_defender_missing ? 1.15 : 1.0;
  const defenderLeakA = context.lineup_impact.away_defender_missing ? 1.15 : 1.0;

  // 2. 状态与战意层关联：结合攻防得失球期望、半场突破韧性、赢盘能力与 MUI
  const muiH = context.motivation_urgency.home_mui; // [0.8 ~ 1.35]
  const muiA = context.motivation_urgency.away_mui;

  const homeFormAnalytics = context.recent_form_analytics.home;
  const awayFormAnalytics = context.recent_form_analytics.away;

  // 近期攻防效率加成 (基准均值 1.30 球)
  // 方案 3：零样本/弱样本统计平滑 (以通过时效与赛事过滤的 valid_count 为准，若无有效样本严禁触发 0.70 恶意扣分，返回中性 1.0)
  const homeAttackForm = homeFormAnalytics.valid_count >= 1 ? Math.max(0.70, Math.min(1.35, homeFormAnalytics.weighted_scored_per_game / 1.30)) : 1.0;
  const homeDefenseForm = homeFormAnalytics.valid_count >= 1 ? Math.max(0.70, Math.min(1.35, 1.30 / Math.max(0.40, homeFormAnalytics.weighted_conceded_per_game))) : 1.0;

  const awayAttackForm = awayFormAnalytics.valid_count >= 1 ? Math.max(0.70, Math.min(1.35, awayFormAnalytics.weighted_scored_per_game / 1.30)) : 1.0;
  const awayDefenseForm = awayFormAnalytics.valid_count >= 1 ? Math.max(0.70, Math.min(1.35, 1.30 / Math.max(0.40, awayFormAnalytics.weighted_conceded_per_game))) : 1.0;

  // 3. Dixon-Coles 经典攻防解耦因果模型 (彻底根治主弱客强倒挂)
  // (A) 纯进攻战力 Alpha: 由阵容身价、首发主力完整度 LIS、锋线终结者惩罚与近期攻击态势乘积决定
  const alphaH = squadRatioH * lisH * strikerPenH * homeAttackForm;
  const alphaA = squadRatioA * lisA * strikerPenA * awayAttackForm;

  // (B) 纯防守抗击打战力 D: 强队防守体系严密身价高、LIS 完整、后防无漏洞、近期丢球极少
  const defStrengthH = squadRatioH * lisH * (1.0 / defenderLeakH) * homeDefenseForm;
  const defStrengthA = squadRatioA * lisA * (1.0 / defenderLeakA) * awayDefenseForm;

  // (C) 失球脆弱度 / 漏球倾向 Beta: 依照指数连续函数平滑映射，对立面防守越强，己方面对的 Beta 越小
  // Beta = exp(-0.60 * (DefStrength - 1.0))，严格收敛于 [0.55, 1.65]
  const betaA = Math.max(0.55, Math.min(1.65, Math.exp(-0.60 * (defStrengthA - 1.0)))); // 客队防线漏洞 (对主队进攻有提振)
  const betaH = Math.max(0.55, Math.min(1.65, Math.exp(-0.60 * (defStrengthH - 1.0)))); // 主队防线漏洞 (对客队进攻有提振)

  // 4. 历史交锋深度加权与球风相克 (仅当战术攻防统计客观有效且具备真实样本时才允许球风相克生效)
  const h2hAnalytics = context.h2h_analytics;
  const h2hAdvantage = h2hAnalytics.historical_h2h_advantage_home; // [-0.20, +0.20]
  const stylisticClash = (h2hAnalytics.tactical_metrics_available && h2hAnalytics.tactical_valid_count >= 1)
    ? h2hAnalytics.tactical_stylistic_clash_index // [-1.0, 1.0]
    : 0.0;

  // 5. 阵型空间张力克制与中场绞杀
  const formation = context.tactical_formation;
  const formationFactorH = 1.0 + (formation.wing_space_vulnerability_away - 0.30) * 0.20 - (formation.midfield_congestion_index - 0.50) * 0.10;
  const formationFactorA = 1.0 + (formation.wing_space_vulnerability_home - 0.30) * 0.20 - (formation.midfield_congestion_index - 0.50) * 0.10;

  // 6. 主客场异构基线 (Iso-Venue Discrepancy)
  const homeStandings = context.iso_venue_standings?.home_at_home;
  const awayStandings = context.iso_venue_standings?.away_at_away;

  // 使用动态联赛 DNA 替代硬编码基准
  const leagueName = match.match_slug ? match.match_slug.split('_')[0] : '';
  const dnaTotal = LEAGUE_DNA_MAP[leagueName] || 2.75; // 默认中性 2.75
  let baseGoalsH = dnaTotal * 0.55;
  let baseGoalsA = dnaTotal * 0.45;

  if (homeStandings && awayStandings && homeStandings.matches_played >= 3 && awayStandings.matches_played >= 3) {
    const scoredH = homeStandings.goals_per_game_scored;
    const concededA = awayStandings.goals_per_game_conceded;
    const scoredA = awayStandings.goals_per_game_scored;
    const concededH = homeStandings.goals_per_game_conceded;

    baseGoalsH = Math.max(0.60, Math.min(3.0, Math.sqrt(scoredH * concededA)));
    baseGoalsA = Math.max(0.40, Math.min(2.5, Math.sqrt(scoredA * concededH)));
  } else if (homeFormAnalytics.valid_count >= 2 && awayFormAnalytics.valid_count >= 2) {
    baseGoalsH = Math.max(0.20, Math.min(3.5, Math.sqrt(homeFormAnalytics.weighted_scored_per_game * awayFormAnalytics.weighted_conceded_per_game)));
    baseGoalsA = Math.max(0.10, Math.min(3.0, Math.sqrt(awayFormAnalytics.weighted_scored_per_game * homeFormAnalytics.weighted_conceded_per_game)));
  } else if (homeFormAnalytics.sample_count >= 2 && awayFormAnalytics.sample_count >= 2) {
    baseGoalsH = Math.max(0.20, Math.min(4.0, Math.sqrt(homeFormAnalytics.weighted_scored_per_game * awayFormAnalytics.weighted_conceded_per_game)));
    baseGoalsA = Math.max(0.05, Math.min(4.0, Math.sqrt(awayFormAnalytics.weighted_scored_per_game * homeFormAnalytics.weighted_conceded_per_game)));
  }

  // 综合近态系数 (供特征层输出)
  const formFactorH = (homeAttackForm * 0.6 + homeDefenseForm * 0.4);
  const formFactorA = (awayAttackForm * 0.6 + awayDefenseForm * 0.4);

  // 7. 主客场绿茵权威优势乘子 (Home Advantage Gamma)
  const gammaHome = 1.20;
  const gammaAway = 0.83;

  // 综合进球期望 lambda 合成
  const tacticalFactorH = muiH * (1.0 + h2hAdvantage + stylisticClash * 0.05) * formationFactorH;
  const tacticalFactorA = muiA * (1.0 - h2hAdvantage * 0.5 - stylisticClash * 0.05) * formationFactorA;

  let lambdaH = baseGoalsH * alphaH * betaA * gammaHome * tacticalFactorH;
  let lambdaA = baseGoalsA * alphaA * betaH * gammaAway * tacticalFactorA;

  // 边界约束 [0.20, 5.0]
  lambdaH = Math.max(0.20, Math.min(5.0, Number(lambdaH.toFixed(3))));
  lambdaA = Math.max(0.20, Math.min(5.0, Number(lambdaA.toFixed(3))));

  // 6. 泊松 1X2 联合公允胜平负概率
  const p1x2 = computePoisson1X2(lambdaH, lambdaA);

  const prior: PrematchTheoryPrior = {
    lambda_home_theory: lambdaH,
    lambda_away_theory: lambdaA,
    squad_strength_differential: Number((alphaH - alphaA).toFixed(3)),
    form_momentum_differential: Number((formFactorH * muiH - formFactorA * muiA).toFixed(3)),
    prior_fair_home_win_prob: p1x2.home_win,
    prior_fair_draw_prob: p1x2.draw,
    prior_fair_away_win_prob: p1x2.away_win,
    theory_total_goals_expected: Number((lambdaH + lambdaA).toFixed(3))
  };

  tracer?.info(
    Layer03OpId.PREMATCH_PRIOR_SYNTHESIS,
    'PRIOR_SYNTHESIZED',
    `Synthesized prior: λ_H=${prior.lambda_home_theory}, λ_A=${prior.lambda_away_theory}, HomeWinProb=${prior.prior_fair_home_win_prob}`,
    undefined,
    match.canonical_id
  );

  return Object.freeze(prior);
}

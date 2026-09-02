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
    squadRatioH = 0.5 + (homeMv / totalMv - 0.5) * 0.8; // 平滑映射至 [0.6, 1.4]
    squadRatioA = 0.5 + (awayMv / totalMv - 0.5) * 0.8;
  }

  const lisH = context.lineup_impact.home_lis; // [0.4 ~ 1.0]
  const lisA = context.lineup_impact.away_lis;

  // 主客攻防战力乘子
  const strikerPenH = context.lineup_impact.home_striker_missing ? 0.88 : 1.0;
  const strikerPenA = context.lineup_impact.away_striker_missing ? 0.88 : 1.0;
  const defenderLeakH = context.lineup_impact.home_defender_missing ? 1.15 : 1.0;
  const defenderLeakA = context.lineup_impact.away_defender_missing ? 1.15 : 1.0;

  const squadAttH = squadRatioH * lisH * strikerPenH;
  const squadDefA = (1.0 / (lisA * 0.9 + 0.1)) * defenderLeakA;
  const squadAttA = squadRatioA * lisA * strikerPenA;
  const squadDefH = (1.0 / (lisH * 0.9 + 0.1)) * defenderLeakH;

  // 2. 状态与战意层关联：结合攻防得失球期望、半场突破韧性、赢盘能力与 MUI
  const muiH = context.motivation_urgency.home_mui; // [0.8 ~ 1.35]
  const muiA = context.motivation_urgency.away_mui;

  const homeFormAnalytics = context.recent_form_analytics.home;
  const awayFormAnalytics = context.recent_form_analytics.away;

  // 近期攻防效率加成 (基准均值 1.30 球)
  const homeAttackForm = Math.max(0.70, Math.min(1.35, homeFormAnalytics.weighted_scored_per_game / 1.30));
  const homeDefenseForm = Math.max(0.70, Math.min(1.35, 1.30 / Math.max(0.40, homeFormAnalytics.weighted_conceded_per_game)));

  const awayAttackForm = Math.max(0.70, Math.min(1.35, awayFormAnalytics.weighted_scored_per_game / 1.30));
  const awayDefenseForm = Math.max(0.70, Math.min(1.35, 1.30 / Math.max(0.40, awayFormAnalytics.weighted_conceded_per_game)));

  // 综合近态修正
  const formFactorH = (homeAttackForm * 0.6 + homeDefenseForm * 0.4);
  const formFactorA = (awayAttackForm * 0.6 + awayDefenseForm * 0.4);

  // 3. 历史交锋深度加权与球风相克
  const h2hAnalytics = context.h2h_analytics;
  const h2hAdvantage = h2hAnalytics.historical_h2h_advantage_home; // [-0.20, +0.20]
  const stylisticClash = h2hAnalytics.tactical_stylistic_clash_index; // [-1.0, 1.0]

  // 4. 阵型空间张力克制与中场绞杀
  const formation = context.tactical_formation;
  const formationFactorH = 1.0 + (formation.wing_space_vulnerability_away - 0.30) * 0.20 - (formation.midfield_congestion_index - 0.50) * 0.10;
  const formationFactorA = 1.0 + (formation.wing_space_vulnerability_home - 0.30) * 0.20 - (formation.midfield_congestion_index - 0.50) * 0.10;

  // 5. 主客场异构基线 (Iso-Venue Discrepancy)
  const homeStandings = context.iso_venue_standings?.home_at_home;
  const awayStandings = context.iso_venue_standings?.away_at_away;

  // 使用动态联赛 DNA 替代硬编码基准
  const leagueName = match.match_slug ? match.match_slug.split('_')[0] : '';
  const dnaTotal = LEAGUE_DNA_MAP[leagueName] || 2.75; // 默认中性 2.75
  // 主场通常占据 55% 的进球比例
  let baseGoalsH = dnaTotal * 0.55;
  let baseGoalsA = dnaTotal * 0.45;

  if (homeStandings && awayStandings && homeStandings.matches_played >= 3 && awayStandings.matches_played >= 3) {
    // 基于主队主场场均进球与客队客场场均失球的几何均值
    const scoredH = homeStandings.goals_per_game_scored;
    const concededA = awayStandings.goals_per_game_conceded;
    const scoredA = awayStandings.goals_per_game_scored;
    const concededH = homeStandings.goals_per_game_conceded;

    baseGoalsH = Math.max(0.60, Math.min(3.0, Math.sqrt(scoredH * concededA)));
    baseGoalsA = Math.max(0.40, Math.min(2.5, Math.sqrt(scoredA * concededH)));
  } else if (homeFormAnalytics.valid_count >= 2 && awayFormAnalytics.valid_count >= 2) {
    // 降级使用近期战绩同构攻防几何均值
    baseGoalsH = Math.max(0.60, Math.min(3.0, Math.sqrt(homeFormAnalytics.weighted_scored_per_game * awayFormAnalytics.weighted_conceded_per_game)));
    baseGoalsA = Math.max(0.40, Math.min(2.5, Math.sqrt(awayFormAnalytics.weighted_scored_per_game * homeFormAnalytics.weighted_conceded_per_game)));
  }

  let lambdaH = baseGoalsH * squadAttH * squadDefA * formFactorH * muiH * (1.0 + h2hAdvantage + stylisticClash * 0.05) * formationFactorH;
  let lambdaA = baseGoalsA * squadAttA * squadDefH * formFactorA * muiA * (1.0 - h2hAdvantage * 0.5 - stylisticClash * 0.05) * formationFactorA;

  // 边界约束 [0.20, 5.0]
  lambdaH = Math.max(0.20, Math.min(5.0, Number(lambdaH.toFixed(3))));
  lambdaA = Math.max(0.20, Math.min(5.0, Number(lambdaA.toFixed(3))));

  // 6. 泊松 1X2 联合公允胜平负概率
  const p1x2 = computePoisson1X2(lambdaH, lambdaA);

  const prior: PrematchTheoryPrior = {
    lambda_home_theory: lambdaH,
    lambda_away_theory: lambdaA,
    squad_strength_differential: Number((squadAttH - squadAttA).toFixed(3)),
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

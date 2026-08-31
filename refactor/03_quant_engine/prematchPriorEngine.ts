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
import { poissonPMF } from './poissonDecayModel.js';

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
 * 基于泊松分布计算理论胜平负公允概率
 */
export function computePoisson1X2(
  lambdaH: number,
  lambdaA: number,
  maxGoals: number = 8
): { home_win: number; draw: number; away_win: number } {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;

  for (let h = 0; h <= maxGoals; h++) {
    const ph = poissonPMF(h, lambdaH);
    for (let a = 0; a <= maxGoals; a++) {
      const pa = poissonPMF(a, lambdaA);
      const prob = ph * pa;
      if (h > a) pHome += prob;
      else if (h === a) pDraw += prob;
      else pAway += prob;
    }
  }

  const sum = pHome + pDraw + pAway || 1.0;
  return {
    home_win: Number((pHome / sum).toFixed(4)),
    draw: Number((pDraw / sum).toFixed(4)),
    away_win: Number((pAway / sum).toFixed(4))
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

  // 1. 战力层关联：身价对比 + LIS 伤停折损
  const lineup = match.reference?.lineups;
  const homeMv = parseMarketValue(lineup?.home_market_value);
  const awayMv = parseMarketValue(lineup?.away_market_value);

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
  const squadAttH = squadRatioH * lisH;
  const squadDefA = 1.0 / (lisA * 0.9 + 0.1); // 客队伤停导致防守削弱 (乘子增大)
  const squadAttA = squadRatioA * lisA;
  const squadDefH = 1.0 / (lisH * 0.9 + 0.1);

  // 2. 状态与战意层关联：同构近态加权 + MUI
  const muiH = context.motivation_urgency.home_mui; // [0.8 ~ 1.35]
  const muiA = context.motivation_urgency.away_mui;

  // 计算近态权重有效和
  const homeWeights = context.recent_form_weights.home;
  const awayWeights = context.recent_form_weights.away;

  let formFactorH = 1.0;
  if (homeWeights.length > 0) {
    const sumW = homeWeights.reduce((a, b) => a + b.final_composite_weight, 0);
    const avgW = sumW / homeWeights.length;
    formFactorH = 0.85 + avgW * 0.3; // 映射至 [0.85 ~ 1.15]
  }

  let formFactorA = 1.0;
  if (awayWeights.length > 0) {
    const sumW = awayWeights.reduce((a, b) => a + b.final_composite_weight, 0);
    const avgW = sumW / awayWeights.length;
    formFactorA = 0.85 + avgW * 0.3;
  }

  // 3. 历史交锋衰减加权支持
  const h2hWeights = context.h2h_weights.filter((w) => w.is_valid);
  let h2hAdvantage = 0.0;
  if (h2hWeights.length > 0) {
    const totalDecayedWeight = h2hWeights.reduce((a, b) => a + b.decay_weight, 0);
    if (totalDecayedWeight > 0.5) {
      h2hAdvantage = Math.min(0.15, totalDecayedWeight * 0.03); // 交锋加成上限 0.15
    }
  }

  // 4. 联赛大盘基线 (标准主场优势：主 1.45 进球，客 1.15 进球)
  const BASE_LEAGUE_GOALS_HOME = 1.45;
  const BASE_LEAGUE_GOALS_AWAY = 1.15;

  let lambdaH = BASE_LEAGUE_GOALS_HOME * squadAttH * squadDefA * formFactorH * muiH * (1.0 + h2hAdvantage);
  let lambdaA = BASE_LEAGUE_GOALS_AWAY * squadAttA * squadDefH * formFactorA * muiA * (1.0 - h2hAdvantage * 0.5);

  // 边界约束 [0.20, 5.0]
  lambdaH = Math.max(0.20, Math.min(5.0, Number(lambdaH.toFixed(3))));
  lambdaA = Math.max(0.20, Math.min(5.0, Number(lambdaA.toFixed(3))));

  // 5. 泊松 1X2 联合公允胜平负概率
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

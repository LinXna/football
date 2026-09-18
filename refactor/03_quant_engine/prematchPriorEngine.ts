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
import { calculateBivariatePoissonGrid, LEAGUE_DNA_MAP, getLeagueBaseGoals } from './poissonDecayModel.js';
import { getTeamStrengthProfile } from './globalTierMatrix.js';

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

  // 1. 战力层关联：队伍静态档次矩阵 + 身价倍数非线性映射 + 战术中轴骨干加权 + SSOT 解耦伤停折损
  const currentLeague = match.league_name || match.reference?.leisu_league_name || '';
  const homeProfile = getTeamStrengthProfile(match.home_team_name, currentLeague);
  const awayProfile = getTeamStrengthProfile(match.away_team_name, currentLeague);

  const homeMv = context.lineup_impact.home_market_value_num;
  const awayMv = context.lineup_impact.away_market_value_num;
  const homeSpine = context.lineup_impact.home_spine_market_value || 0;
  const awaySpine = context.lineup_impact.away_spine_market_value || 0;

  // 基础球队档次攻防乘子 (基线先验，解决小联赛/青年队无身价时被机械拉平为 1:1 的系统缺陷)
  const tierAttackH = homeProfile.attack_strength_multiplier;
  const tierAttackA = awayProfile.attack_strength_multiplier;
  const tierDefenseH = homeProfile.defense_toughness_multiplier;
  const tierDefenseA = awayProfile.defense_toughness_multiplier;

  // 有效综合身价 (常规总身价 70% + 战术中轴骨干身价 30%)
  const effectiveMvH = homeMv > 0 ? (homeMv * 0.7 + homeSpine * 0.3) : 0;
  const effectiveMvA = awayMv > 0 ? (awayMv * 0.7 + awaySpine * 0.3) : 0;

  let squadRatioH = tierAttackH;
  let squadRatioA = tierAttackA;
  let defSquadRatioH = tierDefenseH;
  let defSquadRatioA = tierDefenseA;

  if (effectiveMvH > 0 && effectiveMvA > 0) {
    const ratio = effectiveMvH / effectiveMvA;
    // 使用双曲正切非线性连续映射：对数倍数差连续平滑，杜绝小幅差距被机械放大或巨幅差距被截断
    const mvFactor = Math.tanh(0.45 * Math.log(ratio));
    squadRatioH = Math.max(0.40, Math.min(2.50, tierAttackH * (1.0 + mvFactor * 0.65)));
    squadRatioA = Math.max(0.40, Math.min(2.50, tierAttackA * (1.0 - mvFactor * 0.65)));
    defSquadRatioH = Math.max(0.40, Math.min(2.50, tierDefenseH * (1.0 + mvFactor * 0.50)));
    defSquadRatioA = Math.max(0.40, Math.min(2.50, tierDefenseA * (1.0 - mvFactor * 0.50)));
  } else if (effectiveMvH > 0 && effectiveMvA <= 0) {
    // 主队录入显著身价而客队缺失（多为小联赛/保级队未收录）：给予保守估算基准与档次校正
    const imputedAway = Math.min(effectiveMvH * 0.3, 200);
    const ratio = effectiveMvH / imputedAway;
    const mvFactor = Math.tanh(0.40 * Math.log(ratio));
    squadRatioH = Math.max(0.50, Math.min(2.20, tierAttackH * (1.0 + mvFactor * 0.50)));
    squadRatioA = Math.max(0.50, Math.min(2.20, tierAttackA * (1.0 - mvFactor * 0.50)));
    defSquadRatioH = Math.max(0.50, Math.min(2.20, tierDefenseH * (1.0 + mvFactor * 0.40)));
    defSquadRatioA = Math.max(0.50, Math.min(2.20, tierDefenseA * (1.0 - mvFactor * 0.40)));
  } else if (effectiveMvA > 0 && effectiveMvH <= 0) {
    // 客队录入显著身价而主队缺失
    const imputedHome = Math.min(effectiveMvA * 0.3, 200);
    const ratio = imputedHome / effectiveMvA;
    const mvFactor = Math.tanh(0.40 * Math.log(ratio));
    squadRatioH = Math.max(0.50, Math.min(2.20, tierAttackH * (1.0 + mvFactor * 0.50)));
    squadRatioA = Math.max(0.50, Math.min(2.20, tierAttackA * (1.0 - mvFactor * 0.50)));
    defSquadRatioH = Math.max(0.50, Math.min(2.20, tierDefenseH * (1.0 + mvFactor * 0.40)));
    defSquadRatioA = Math.max(0.50, Math.min(2.20, tierDefenseA * (1.0 - mvFactor * 0.40)));
  }

  // 纯进攻战力保持率与防守漏洞恶化乘子 (单一事实来源，杜绝二次重复惩罚)
  const attackFactorH = context.lineup_impact.home_attack_injury_factor ?? 1.0;
  const attackFactorA = context.lineup_impact.away_attack_injury_factor ?? 1.0;
  const defenseLeakH = context.lineup_impact.home_defense_leak_factor ?? 1.0;
  const defenseLeakA = context.lineup_impact.away_defense_leak_factor ?? 1.0;

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

  // 3. Dixon-Coles 经典攻防解耦因果模型 (物理级解耦：进攻归进攻，防守归防守)
  // (A) 纯进攻战力 Alpha: 由阵容身价/静态档次、进攻端实质保持率与近期攻击态势决定 (彻底消除重复扣分)
  const alphaH = squadRatioH * attackFactorH * homeAttackForm;
  const alphaA = squadRatioA * attackFactorA * awayAttackForm;

  // (B) 纯防守抗击打战力 D: 强队防守体系与静态档次韧性、防守端漏洞恶化乘子 (1.0 / defenseLeak)、近期丢球极少
  const defStrengthH = defSquadRatioH * (1.0 / defenseLeakH) * homeDefenseForm;
  const defStrengthA = defSquadRatioA * (1.0 / defenseLeakA) * awayDefenseForm;

  // (C) 失球脆弱度 / 漏球倾向 Beta: 依照指数连续函数平滑映射，对立面防守越强，己方面对的 Beta 越小
  // 客队防线漏洞收敛于 [0.50, 1.65]；主队防线漏洞封顶 1.25，杜绝主队防守漏洞无底线放大
  const betaA = Math.max(0.50, Math.min(1.65, Math.exp(-0.60 * (defStrengthA - 1.0)))); // 客队防线漏洞 (对主队进攻有提振)
  const betaH = Math.max(0.45, Math.min(1.25, Math.exp(-0.60 * (defStrengthH - 1.0)))); // 主队防线漏洞 (对客队进攻有提振)

  // 综合近态系数 (供特征层输出)
  const formFactorH = (homeAttackForm * 0.6 + homeDefenseForm * 0.4);
  const formFactorA = (awayAttackForm * 0.6 + awayDefenseForm * 0.4);

  // 4. 历史交锋深度加权与球风相克 (仅当战术攻防统计客观有效且具备真实样本时才允许球风相克生效)
  const h2hAnalytics = context.h2h_analytics;
  const h2hAdvantage = h2hAnalytics?.historical_h2h_advantage_home ?? 0.0; // [-0.20, +0.20]
  const stylisticClash = (h2hAnalytics.tactical_metrics_available && h2hAnalytics.tactical_valid_count >= 1)
    ? h2hAnalytics.tactical_stylistic_clash_index // [-1.0, 1.0]
    : 0.0;

  // 5. 阵型空间张力克制回归 Dixon-Coles 攻防解耦模型 (Scheme 1 方案 1 根治)
  // (A) 边肋部空档暴露 (Wing Space Vulnerability):
  // 客队边肋空档暴露 (>0.30): 提振主队针对性突击穿透 (提升主队进攻 Alpha)，同时放大客队防线漏球倾向 (提升客队防守 Beta)
  // 主队边肋空档暴露 (>0.30): 提振客队反击穿透 (提升客队进攻 Alpha)，同时放大主队防守漏洞 (提升主队防守 Beta)
  const formation = context.tactical_formation;
  const wingExposureAway = Math.max(0, formation.wing_space_vulnerability_away - 0.30);
  const wingExposureHome = Math.max(0, formation.wing_space_vulnerability_home - 0.30);

  // 边路穿透与防守撕裂乘子
  const wingAlphaBonusH = 1.0 + wingExposureAway * 0.15; // 主队进攻增益
  const wingBetaLeakA = 1.0 + wingExposureAway * 0.12;   // 客队漏球放大
  const wingAlphaBonusA = 1.0 + wingExposureHome * 0.15; // 客队进攻增益
  const wingBetaLeakH = 1.0 + wingExposureHome * 0.12;   // 主队漏球放大

  // (B) 中场绞杀密集度 (Midfield Congestion Index):
  // 物理意义：双后腰或密集绞杀阵型全局压低比赛流动速率与有效射门转化，平滑约束双方整体产出，杜绝简单加减法机械对冲
  const congestionExcess = Math.max(0, formation.midfield_congestion_index - 0.50);
  const tempoSuppressionFactor = 1.0 / (1.0 + congestionExcess * 0.35);

  // 6. 主客场异构基线 (Iso-Venue Discrepancy & League DNA)
  // 使用动态联赛 DNA 作为总进球基准锚点，主客场基准遵循现代足球场均分布 (主场 56%，客场 44%)，并注入中场绞杀流速抑制
  const leagueQuery = match.league_name || (match.match_slug ? match.match_slug.split('_')[0] : '');
  const dnaTotal = getLeagueBaseGoals(leagueQuery, 2.75);
  const baseGoalsH = dnaTotal * 0.56 * tempoSuppressionFactor;
  const baseGoalsA = dnaTotal * 0.44 * tempoSuppressionFactor;

  // 7. 主客场绿茵权威优势乘子 (Home Advantage Gamma)
  const gammaHome = 1.18;
  const gammaAway = 0.85;

  // 8. 战术意图乘子 (MUI + 历史交锋深度与球风克制)
  const tacticalFactorH = muiH * (1.0 + h2hAdvantage + stylisticClash * 0.05);
  const tacticalFactorA = muiA * (1.0 - h2hAdvantage * 0.5 - stylisticClash * 0.05);

  // 9. 现代足球空间场域压制物理定律 (Territorial Authority & Field Tilt Suppression)
  // 物理原理：当主队处于压倒性实力优势 (alphaH > alphaA) 时，高位压迫与半场围攻将客队有效推进空间极度压缩；
  // 客队的进攻产出期望遵循连续平滑的场域压制衰减函数，杜绝使用生硬表面 if-clamp 补丁：
  const effectiveAlphaH = alphaH * wingAlphaBonusH;
  const effectiveAlphaA = alphaA * wingAlphaBonusA;
  const homeAdvantageDifferential = Math.max(0, effectiveAlphaH - effectiveAlphaA);
  const awaySuppressionFactor = 1.0 / (1.0 + homeAdvantageDifferential * 0.55);

  // 客强主弱时，主队凭借主场草皮与球迷声浪具备天然韧性，受压制斜率较为平缓 (0.25)
  const awayAdvantageDifferential = Math.max(0, effectiveAlphaA - effectiveAlphaH);
  const homeSuppressionFactor = 1.0 / (1.0 + awayAdvantageDifferential * 0.25);

  // 10. Dixon-Coles 乘法攻防实力模型进球期望综合求解
  // 主队期望 λ_H = 基准进球(含流速抑制) * (主队纯进攻 Alpha * 边路穿透) * (客队防线漏洞 Beta * 边路被突撕裂) * 主场优势 Gamma * 战意交锋 * 主场场域系数
  // 客队期望 λ_A = 基准进球(含流速抑制) * (客队纯进攻 Alpha * 边路穿透) * (主队防线漏洞 Beta * 边路被突撕裂) * 客场折损 Gamma * 战意交锋 * 客队场域压制系数
  let lambdaH = baseGoalsH * effectiveAlphaH * (betaA * wingBetaLeakA) * gammaHome * tacticalFactorH * homeSuppressionFactor;
  let lambdaA = baseGoalsA * effectiveAlphaA * (betaH * wingBetaLeakH) * gammaAway * tacticalFactorA * awaySuppressionFactor;

  // 绿茵物理边界自然收敛约束 [0.20, 5.0]
  lambdaH = Math.max(0.20, Math.min(5.0, Number(lambdaH.toFixed(3))));
  lambdaA = Math.max(0.20, Math.min(5.0, Number(lambdaA.toFixed(3))));

  // 11. 泊松 1X2 联合公允胜平负概率
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

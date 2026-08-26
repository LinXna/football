import type { UnifiedMatchStats } from '../../src/types';
import { parseQuarterLine } from '../../src/lib/quarterSettlement';

type JsonRecord = Record<string, any>;

const object = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;

/**
 * 提取统一数据契约中的单侧数值 (严格遵循 UnifiedMatchStats: { field: { home, away } })
 */
function getStatValue(stats: any, field: keyof UnifiedMatchStats, side: 'home' | 'away'): number {
  if (!stats) return 0;
  const statObj = stats[field];
  if (statObj && typeof statObj === 'object') {
    return number(statObj[side]);
  }
  return 0;
}

/**
 * 1. Attack Efficiency & Dangerous Attack Conversion Matrix
 */
export function calculateAttackConversion(statistics: unknown, score?: unknown): JsonRecord | null {
  const stats = object(statistics);
  if (Object.keys(stats).length === 0) return null;

  const currentScore = object(score);
  const dangerH = getStatValue(stats, 'dangerous_attacks', 'home');
  const dangerA = getStatValue(stats, 'dangerous_attacks', 'away');

  const onTargetH = getStatValue(stats, 'shots_on_target', 'home');
  const onTargetA = getStatValue(stats, 'shots_on_target', 'away');

  const shotsH = getStatValue(stats, 'shots', 'home');
  const shotsA = getStatValue(stats, 'shots', 'away');

  const goalH = number(currentScore.home);
  const goalA = number(currentScore.away);

  const totalDanger = dangerH + dangerA;
  const fieldTiltH = rate(dangerH, totalDanger);
  const fieldTiltA = rate(dangerA, totalDanger);

  const dangerToShotH = rate(shotsH, dangerH);
  const dangerToShotA = rate(shotsA, dangerA);

  const shotAccuracyH = rate(onTargetH, shotsH);
  const shotAccuracyA = rate(onTargetA, shotsA);

  const finishingH = onTargetH > 0 ? rate(goalH, onTargetH) : null;
  const finishingA = onTargetA > 0 ? rate(goalA, onTargetA) : null;

  if (shotsH === 0 && shotsA === 0 && dangerH === 0 && dangerA === 0) return null;

  return {
    field_tilt_share: { home: fieldTiltH, away: fieldTiltA },
    dangerous_attack_to_shot_ratio: { home: dangerToShotH, away: dangerToShotA },
    shot_on_target_accuracy: { home: shotAccuracyH, away: shotAccuracyA },
    finishing_conversion: { home: finishingH, away: finishingA },
    summary_note: 'Dangerous attack to shot ratio measures penetrative threat vs empty possession. Field tilt measures territorial pressure in attacking third.',
  };
}

export interface IndependentPoissonDistribution {
  lambdas: { home: number; away: number; total: number };
  margin_distribution_pct: {
    home_win_by_1: number;
    home_win_by_2: number;
    home_win_by_3_plus: number;
    draw_exact: number;
    away_win_exact: number;
  };
  total_goals_distribution_pct: {
    under_1_5: number;
    under_2_5: number;
    under_3_5: number;
    over_2_5: number;
    over_3_5: number;
  };
  top_scorelines: Array<{ score: string; prob_pct: number }>;
}

/**
 * 2. Asian Handicap Net Goal Differential & Spread De-Biasing Metrics
 * Prevents over-estimating handicap cover probabilities by modeling in-play net goal expectancies.
 */
export function calculateHandicapExpectancyMetrics(
  statistics: unknown,
  score: unknown,
  minute: number,
  handicapOptions?: Array<{ side?: string | null; line?: any; odds?: number }>
): {
  projected_net_goal_margin: { home_minus_away: number; favored_side: 'home' | 'away' | 'even' };
  independent_poisson_distribution?: IndependentPoissonDistribution;
  attack_dominance_ratio: { home: number; away: number };
  game_state_tempo_drag?: string;
  handicap_sanity_notes: string[];
} | null {
  const stats = object(statistics);
  const currentScore = object(score);
  const currentMin = Math.max(0, Math.min(90, number(minute)));
  const remainingMins = Math.max(5, 90 - currentMin);

  const onTargetH = getStatValue(stats, 'shots_on_target', 'home');
  const onTargetA = getStatValue(stats, 'shots_on_target', 'away');
  const dangerH = getStatValue(stats, 'dangerous_attacks', 'home');
  const dangerA = getStatValue(stats, 'dangerous_attacks', 'away');
  const goalH = number(currentScore.home);
  const goalA = number(currentScore.away);
  const scoreDiff = goalH - goalA; // Home lead > 0, Away lead < 0

  if (onTargetH === 0 && onTargetA === 0 && dangerH === 0 && dangerA === 0) return null;

  // Expected rest-of-match goal creation rate per minute based on shots on target and dangerous attacks
  const rawRateH = (onTargetH * 0.28 + dangerH * 0.035) / Math.max(15, currentMin);
  const rawRateA = (onTargetA * 0.28 + dangerA * 0.035) / Math.max(15, currentMin);

  // Game state adjustment: If leading by >= 2 goals, leading team reduces attacking tempo (drag factor)
  let tempoDragH = 1.0;
  let tempoDragA = 1.0;
  let tempoNote: string | undefined;

  if (scoreDiff >= 2) {
    tempoDragH = 0.65; // Home leads by 2+: slows down, protects lead
    tempoDragA = 1.20; // Away trails by 2+: takes risks
    tempoNote = `主队当前净领先 ${scoreDiff} 球，战术转向控节奏与轮换防守，下半场让球必须从0:0重新起算，深让深让极易爆冷输盘`;
  } else if (scoreDiff <= -2) {
    tempoDragA = 0.65; // Away leads by 2+
    tempoDragH = 1.20;
    tempoNote = `客队当前净领先 ${Math.abs(scoreDiff)} 球，客队进攻强度收缩，下半场从0:0起算让球切忌盲目追客队深盘`;
  } else if (scoreDiff === 1 && currentMin <= 60) {
    tempoNote = `【早早领先控场识别】主队当前1球领先，主动降速控球引诱对手压出，此时段射门偏少属于战术控盘，绝不等于下半场缺乏进球能力，严禁误判全场小球`;
  } else if (scoreDiff === -1 && currentMin <= 60) {
    tempoNote = `【早早领先控场识别】客队当前1球领先，客队战术收缩控场引诱主队压出，此时段双方射门偏少属于战术控盘，绝不等于下半场缺乏进球能力，严禁误判全场小球`;
  }

  // Dominance Siege Factor: One-sided high-pressure siege adjustment
  const totalDanger = dangerH + dangerA;
  const fieldTiltH = totalDanger > 0 ? (dangerH / totalDanger) : 0.5;
  const fieldTiltA = totalDanger > 0 ? (dangerA / totalDanger) : 0.5;
  const shotsH = getStatValue(stats, 'shots', 'home') || onTargetH;
  const shotsA = getStatValue(stats, 'shots', 'away') || onTargetA;

  let siegeMultH = 1.0;
  let siegeMultA = 1.0;
  let siegeNote: string | undefined;

  if (fieldTiltH >= 0.65 && shotsH >= Math.max(4, shotsA * 2)) {
    siegeMultH = 1.0 + (fieldTiltH - 0.60) * 1.5;
    siegeMultA = Math.max(0.40, 1.0 - (fieldTiltH - 0.50) * 1.2);
    siegeNote = `【单边高压围攻特征 (Dominance Siege)】主队前场压迫倾角达 ${(fieldTiltH * 100).toFixed(1)}% 且射门 ${shotsH}-${shotsA} 绝对压制，下半场破门动能强化 ${siegeMultH.toFixed(2)}x`;
  } else if (fieldTiltA >= 0.65 && shotsA >= Math.max(4, shotsH * 2)) {
    siegeMultA = 1.0 + (fieldTiltA - 0.60) * 1.5;
    siegeMultH = Math.max(0.40, 1.0 - (fieldTiltA - 0.50) * 1.2);
    siegeNote = `【单边高压围攻特征 (Dominance Siege)】客队前场压迫倾角达 ${(fieldTiltA * 100).toFixed(1)}% 且射门 ${shotsA}-${shotsH} 绝对压制，下半场破门动能强化 ${siegeMultA.toFixed(2)}x`;
  }

  const projectedRestGoalsH = Number((rawRateH * tempoDragH * siegeMultH * remainingMins).toFixed(2));
  const projectedRestGoalsA = Number((rawRateA * tempoDragA * siegeMultA * remainingMins).toFixed(2));
  const netMargin = Number((projectedRestGoalsH - projectedRestGoalsA).toFixed(2));

  const domH = totalDanger > 0 ? Number(((dangerH / totalDanger) * 100).toFixed(1)) : 50;
  const domA = totalDanger > 0 ? Number(((dangerA / totalDanger) * 100).toFixed(1)) : 50;

  const notes: string[] = [];
  if (Math.abs(netMargin) < 0.45) {
    notes.push('剩余时段双方预期净胜球差接近平衡 (ΔxG < 0.45)，让半球以上 (-0.5/-1.0) 真实覆盖概率通常 ≤ 45%，强让深盘具备高虚高风险，优先考虑平手盘 (0) 或受让防冷。');
  } else if (netMargin > 0.8) {
    notes.push(`主队进攻压迫与转化显著占优 (剩余预期净胜 +${netMargin}球)，支撑 -0.5 让步，但让 -1.0 以上深盘仍需考虑终局控盘风险。`);
  } else if (netMargin < -0.8) {
    notes.push(`客队进攻压迫与转化显著占优 (剩余预期净胜 +${Math.abs(netMargin)}球)，客让具备数据支持。`);
  }

  const poissonSim = computeIndependentPoissonDistribution(projectedRestGoalsH, projectedRestGoalsA);

  return {
    projected_net_goal_margin: {
      home_minus_away: netMargin,
      favored_side: netMargin > 0.3 ? 'home' : netMargin < -0.3 ? 'away' : 'even',
    },
    independent_poisson_distribution: poissonSim,
    attack_dominance_ratio: { home: domH, away: domA },
    game_state_tempo_drag: tempoNote,
    handicap_sanity_notes: notes,
  };
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function poissonProb(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

export interface PurePhysicalOptionEdge {
  market: string;
  option_id?: string;
  direction?: string;
  line?: any;
  odds: number;
  bookmaker_implied_prob_pct: number;
  physical_model_prob_pct: number;
  physical_value_edge: number;
  discrepancy_verdict: 'STRONG_VALUE_MISPRICING' | 'BOOKMAKER_BAIT_TRAP' | 'FAIR_PRICING';
  physical_evidence_zh: string;
}

export interface PurePhysicalMatchModel {
  physical_lambdas: {
    rest_home: number;
    rest_away: number;
    rest_total: number;
    projected_full_home: number;
    projected_full_away: number;
    projected_full_total: number;
  };
  dominant_siege_factor?: {
    side: 'home' | 'away' | 'none';
    field_tilt_pct: number;
    shot_ratio: string;
    impact_note_zh: string;
  };
  pure_physical_distribution: {
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    over_2_5_pct: number;
    under_2_5_pct: number;
    over_3_5_pct: number;
    under_3_5_pct: number;
    top_scorelines: Array<{ score: string; prob_pct: number }>;
  };
  market_physical_edge_audit: PurePhysicalOptionEdge[];
  executive_physical_summary_zh: string;
}

export function calculatePurePhysicalMatchModel(
  statistics: unknown,
  score: unknown,
  minute: number,
  verifiedMarkets: any[] = [],
  formPrior?: { lambda_home_prior: number; lambda_away_prior: number },
  tacticalContext?: { goal_distribution?: any; trend_summary?: any; league_standings?: any; formation_clash?: any }
): PurePhysicalMatchModel | null {
  const stats = object(statistics);
  const currentScore = object(score);
  const currentMin = Math.max(0, Math.min(90, number(minute)));
  const remainingMins = Math.max(5, 90 - currentMin);

  const onTargetH = getStatValue(stats, 'shots_on_target', 'home');
  const onTargetA = getStatValue(stats, 'shots_on_target', 'away');
  const dangerH = getStatValue(stats, 'dangerous_attacks', 'home');
  const dangerA = getStatValue(stats, 'dangerous_attacks', 'away');
  const shotsH = getStatValue(stats, 'shots', 'home');
  const shotsA = getStatValue(stats, 'shots', 'away');
  const cornersH = getStatValue(stats, 'corners', 'home');
  const cornersA = getStatValue(stats, 'corners', 'away');
  const yellowH = getStatValue(stats, 'yellow_cards', 'home');
  const yellowA = getStatValue(stats, 'yellow_cards', 'away');

  const goalH = number(currentScore.home);
  const goalA = number(currentScore.away);
  const scoreDiff = goalH - goalA;

  let restLH = 0;
  let restLA = 0;

  if (currentMin === 0 || (onTargetH === 0 && onTargetA === 0 && dangerH === 0 && dangerA === 0)) {
    // 滚球开场前或尚未产生滚球统计时：由历史战绩/交锋加权先验期望按剩余时间比例折算
    const priorH = formPrior?.lambda_home_prior || 1.35;
    const priorA = formPrior?.lambda_away_prior || 1.15;
    const remainingRatio = currentMin === 0 ? 1.0 : Math.max(0.05, (90 - currentMin) / 90);
    restLH = Number((priorH * remainingRatio).toFixed(2));
    restLA = Number((priorA * remainingRatio).toFixed(2));
  } else {
    // In-play: Pure physical data-first match physics
    // Realistic conversion rates: on-target shot conversion ~12-15%, dangerous attack conversion ~1.5-2%, corner conversion ~2.5%
    const rawRateH = (onTargetH * 0.15 + (shotsH - onTargetH) * 0.03 + dangerH * 0.015 + cornersH * 0.025) / Math.max(15, currentMin);
    const rawRateA = (onTargetA * 0.15 + (shotsA - onTargetA) * 0.03 + dangerA * 0.015 + cornersA * 0.025) / Math.max(15, currentMin);

    let tempoH = 1.0;
    let tempoA = 1.0;
    if (scoreDiff >= 2) {
      tempoH = 0.65;
      tempoA = 1.25;
    } else if (scoreDiff <= -2) {
      tempoA = 0.65;
      tempoH = 1.25;
    }

    // Dominance Siege Multiplier
    const totalDanger = dangerH + dangerA;
    const tiltH = totalDanger > 0 ? (dangerH / totalDanger) : 0.5;
    const tiltA = totalDanger > 0 ? (dangerA / totalDanger) : 0.5;

    let siegeH = 1.0;
    let siegeA = 1.0;
    if (tiltH >= 0.65 && shotsH >= Math.max(4, shotsA * 2)) {
      siegeH = 1.0 + (tiltH - 0.60) * 1.5;
      siegeA = Math.max(0.40, 1.0 - (tiltH - 0.50) * 1.2);
    } else if (tiltA >= 0.65 && shotsA >= Math.max(4, shotsH * 2)) {
      siegeA = 1.0 + (tiltA - 0.60) * 1.5;
      siegeH = Math.max(0.40, 1.0 - (tiltA - 0.50) * 1.2);
    }

    // Yellow cards fatigue/defensive breakdown factor
    if (yellowA >= 2) siegeH *= 1.15;
    if (yellowH >= 2) siegeA *= 1.15;

    // 进球时段分布 (Goal Distribution): 若当前在 60 分钟以后且球队历史擅长后程发力(76-90+占比高)，给予末段动量补偿
    if (currentMin >= 60 && tacticalContext?.goal_distribution) {
      const gDist = tacticalContext.goal_distribution;
      const lateHome = Number(gDist?.home?.['76-90+'] ?? gDist?.['76-90+']?.home ?? 0);
      const lateAway = Number(gDist?.away?.['76-90+'] ?? gDist?.['76-90+']?.away ?? 0);
      if (lateHome >= 3) siegeH *= 1.10;
      if (lateAway >= 3) siegeA *= 1.10;
    }

    restLH = Number((rawRateH * tempoH * siegeH * remainingMins).toFixed(2));
    restLA = Number((rawRateA * tempoA * siegeA * remainingMins).toFixed(2));
  }

  const fullLH = Number((goalH + restLH).toFixed(2));
  const fullLA = Number((goalA + restLA).toFixed(2));
  const fullLTotal = Number((fullLH + fullLA).toFixed(2));

  // Compute Poisson for full match physical expectations
  const fullSim = computeIndependentPoissonDistribution(fullLH, fullLA);

  const totalDanger = dangerH + dangerA;
  const tiltH = totalDanger > 0 ? Number(((dangerH / totalDanger) * 100).toFixed(1)) : 50;
  const tiltA = totalDanger > 0 ? Number(((dangerA / totalDanger) * 100).toFixed(1)) : 50;

  let siegeInfo: PurePhysicalMatchModel['dominant_siege_factor'];
  if (tiltH >= 65 && shotsH >= Math.max(4, shotsA * 2)) {
    siegeInfo = {
      side: 'home',
      field_tilt_pct: tiltH,
      shot_ratio: `${shotsH}-${shotsA}`,
      impact_note_zh: `主队前场压迫倾角 ${tiltH}% 且射门 ${shotsH}-${shotsA}，形成单边围攻，下半场具备高破门预期。`,
    };
  } else if (tiltA >= 65 && shotsA >= Math.max(4, shotsH * 2)) {
    siegeInfo = {
      side: 'away',
      field_tilt_pct: tiltA,
      shot_ratio: `${shotsA}-${shotsH}`,
      impact_note_zh: `客队前场压迫倾角 ${tiltA}% 且射门 ${shotsA}-${shotsH}，形成单边围攻，下半场具备高破门预期。`,
    };
  }

  // Helper for computing continuous Asian Handicap probability from Poisson matrix
  const computeAsianHandicapProb = (
    sim: IndependentPoissonDistribution,
    lineStr: string,
    isHome: boolean
  ): number => {
    let lineVal = 0;
    const clean = String(lineStr || '').trim();
    const numMatch = clean.match(/[-+]?\d+(\.\d+)?(\/[-+]?\d+(\.\d+)?)?/);
    if (numMatch) {
      const valStr = numMatch[0];
      if (valStr.includes('/')) {
        const parts = valStr.split('/').map(Number);
        lineVal = (parts[0] + parts[1]) / 2;
      } else {
        lineVal = Number(valStr);
      }
    }
    // If text starts with 受让 or +
    if (/受让|\+/i.test(clean) && lineVal < 0) {
      lineVal = Math.abs(lineVal);
    } else if (/让|-/i.test(clean) && lineVal > 0) {
      lineVal = -lineVal;
    }

    let winProb = 0;
    let halfWinProb = 0;
    for (const sc of sim.top_scorelines) {
      const parts = sc.score.split('-').map(Number);
      const hScore = parts[0];
      const aScore = parts[1];
      const p = sc.prob_pct;
      const margin = isHome ? (hScore - aScore) : (aScore - hScore);
      const effMargin = margin + (isHome ? lineVal : -lineVal);

      if (effMargin >= 0.5) {
        winProb += p;
      } else if (effMargin === 0.25) {
        // Half win (e.g. +0.25 on 0 margin)
        winProb += p * 0.5;
        halfWinProb += p * 0.5;
      } else if (effMargin === 0) {
        // Push: counts as 50% equivalent equity
        winProb += p * 0.5;
      } else if (effMargin === -0.25) {
        // Half lose
        halfWinProb += p * 0.25;
      }
    }
    return Math.max(5.0, Math.min(95.0, winProb + halfWinProb * 0.5));
  };

  // Cross-evaluate verified options
  const edgeAudit: PurePhysicalOptionEdge[] = [];
  for (const m of verifiedMarkets) {
    for (const opt of asArray(m.options)) {
      const odds = Number(opt.odds);
      if (odds <= 1.05) continue;
      const implied = Number(((1 / odds) * 100).toFixed(2));
      let physicalProb = 50.0;

      if (m.market === 'full_h2h') {
        const cleanSide = String(opt.side || '').toLowerCase().trim();
        if (cleanSide === 'home' || cleanSide === '1' || cleanSide === 'h') {
          physicalProb = fullSim.margin_distribution_pct.home_win_by_1 + fullSim.margin_distribution_pct.home_win_by_2 + fullSim.margin_distribution_pct.home_win_by_3_plus;
        } else if (cleanSide === 'draw' || cleanSide === 'x' || cleanSide === 'd') {
          physicalProb = fullSim.margin_distribution_pct.draw_exact;
        } else if (cleanSide === 'away' || cleanSide === '2' || cleanSide === 'a') {
          physicalProb = fullSim.margin_distribution_pct.away_win_exact;
        } else if (String(opt.direction || '').includes('主胜') || String(opt.line || '').includes('主胜')) {
          physicalProb = fullSim.margin_distribution_pct.home_win_by_1 + fullSim.margin_distribution_pct.home_win_by_2 + fullSim.margin_distribution_pct.home_win_by_3_plus;
        } else if (String(opt.direction || '').includes('平局') || String(opt.line || '').includes('平局') || String(opt.line || '') === '平' || String(opt.line || '') === '和') {
          physicalProb = fullSim.margin_distribution_pct.draw_exact;
        } else {
          physicalProb = fullSim.margin_distribution_pct.away_win_exact;
        }
      } else if (m.market === 'full_total') {
        const lineNum = parseQuarterLine(opt.line ?? opt.direction ?? 2.5);
        const isOver = opt.side === 'over' || /大/i.test(String(opt.line || '')) || /大/i.test(String(opt.direction || ''));
        if (lineNum <= 2.25) {
          physicalProb = isOver ? fullSim.total_goals_distribution_pct.over_2_5 : fullSim.total_goals_distribution_pct.under_2_5;
        } else if (lineNum <= 2.75) {
          const pOver = (fullSim.total_goals_distribution_pct.over_2_5 * 0.8 + (100 - fullSim.total_goals_distribution_pct.under_2_5) * 0.2);
          physicalProb = isOver ? fullSim.total_goals_distribution_pct.over_2_5 : fullSim.total_goals_distribution_pct.under_2_5;
        } else if (lineNum <= 3.25) {
          const pOver = (fullSim.total_goals_distribution_pct.over_2_5 + fullSim.total_goals_distribution_pct.over_3_5) / 2;
          physicalProb = isOver ? pOver : (100 - pOver);
        } else {
          physicalProb = isOver ? fullSim.total_goals_distribution_pct.over_3_5 : (100 - fullSim.total_goals_distribution_pct.over_3_5);
        }
      } else if (m.market === 'full_spread') {
        const cleanSide = String(opt.side || '').toLowerCase();
        const isHome = cleanSide === 'home' || cleanSide === '1' || cleanSide === 'h' || String(opt.line || '').startsWith('主');
        physicalProb = computeAsianHandicapProb(fullSim, String(opt.line || ''), isHome);
      } else if (m.market === 'half_h2h') {
        // Half-time 1X2 simulation with smooth decay (avoid sudden zero-denominator jumps)
        const halfLH = currentMin >= 45 ? number(currentScore.home) : (currentMin === 0 ? restLH * 0.45 : Math.max(0.05, goalH + (restLH * Math.max(0, 45 - currentMin) / Math.max(1, 90 - currentMin))));
        const halfLA = currentMin >= 45 ? number(currentScore.away) : (currentMin === 0 ? restLA * 0.45 : Math.max(0.05, goalA + (restLA * Math.max(0, 45 - currentMin) / Math.max(1, 90 - currentMin))));
        const halfSim = computeIndependentPoissonDistribution(halfLH, halfLA);
        const cleanSide = String(opt.side || '').toLowerCase().trim();
        if (cleanSide === 'home' || cleanSide === '1' || cleanSide === 'h') {
          physicalProb = halfSim.margin_distribution_pct.home_win_by_1 + halfSim.margin_distribution_pct.home_win_by_2 + halfSim.margin_distribution_pct.home_win_by_3_plus;
        } else if (cleanSide === 'draw' || cleanSide === 'x' || cleanSide === 'd') {
          physicalProb = halfSim.margin_distribution_pct.draw_exact;
        } else if (cleanSide === 'away' || cleanSide === '2' || cleanSide === 'a') {
          physicalProb = halfSim.margin_distribution_pct.away_win_exact;
        } else if (String(opt.direction || '').includes('主胜') || String(opt.line || '').includes('主胜')) {
          physicalProb = halfSim.margin_distribution_pct.home_win_by_1 + halfSim.margin_distribution_pct.home_win_by_2 + halfSim.margin_distribution_pct.home_win_by_3_plus;
        } else if (String(opt.direction || '').includes('平局') || String(opt.line || '').includes('平局') || String(opt.line || '') === '平' || String(opt.line || '') === '和') {
          physicalProb = halfSim.margin_distribution_pct.draw_exact;
        } else {
          physicalProb = halfSim.margin_distribution_pct.away_win_exact;
        }
      } else if (m.market === 'half_total') {
        const halfLH = currentMin >= 45 ? number(currentScore.home) : (currentMin === 0 ? restLH * 0.45 : Math.max(0.05, goalH + (restLH * Math.max(0, 45 - currentMin) / Math.max(1, 90 - currentMin))));
        const halfLA = currentMin >= 45 ? number(currentScore.away) : (currentMin === 0 ? restLA * 0.45 : Math.max(0.05, goalA + (restLA * Math.max(0, 45 - currentMin) / Math.max(1, 90 - currentMin))));
        const halfSim = computeIndependentPoissonDistribution(halfLH, halfLA);
        const isOver = opt.side === 'over' || /大/i.test(String(opt.line || '')) || /大/i.test(String(opt.direction || ''));
        const lineNum = parseQuarterLine(opt.line ?? opt.direction ?? 1.0);
        
        // Exact Poisson probability calculation for half time goals
        const pZero = halfSim.top_scorelines.find(s => s.score === '0-0')?.prob_pct || (poissonProb(0, halfLH) * poissonProb(0, halfLA) * 100);
        const pUnder2 = halfSim.top_scorelines.filter(s => {
          const parts = s.score.split('-').map(Number);
          return (parts[0] + parts[1]) <= 1;
        }).reduce((sum, s) => sum + s.prob_pct, 0) || ((poissonProb(0, halfLH)*poissonProb(0, halfLA) + poissonProb(1, halfLH)*poissonProb(0, halfLA) + poissonProb(0, halfLH)*poissonProb(1, halfLA)) * 100);
        const pUnder3 = halfSim.top_scorelines.filter(s => {
          const parts = s.score.split('-').map(Number);
          return (parts[0] + parts[1]) <= 2;
        }).reduce((sum, s) => sum + s.prob_pct, 0);

        if (lineNum <= 0.75) {
          // Line 0.5 or 0.5/1: Under means 0 goals (or half win on 1 goal)
          physicalProb = isOver ? (100 - pZero) : pZero;
        } else if (lineNum <= 1.25) {
          // Line 1.0 or 1/1.5: Under means <= 1 goal
          physicalProb = isOver ? (100 - pUnder2) : pUnder2;
        } else if (lineNum <= 1.75) {
          // Line 1.5 or 1.5/2: Under means <= 2 goals
          physicalProb = isOver ? (100 - pUnder3) : pUnder3;
        } else {
          physicalProb = isOver ? (100 - pUnder3) : pUnder3;
        }
      } else if (m.market === 'half_spread') {
        const halfLH = currentMin >= 45 ? number(currentScore.home) : (currentMin === 0 ? restLH * 0.45 : Math.max(0.05, goalH + (restLH * Math.max(0, 45 - currentMin) / Math.max(1, 90 - currentMin))));
        const halfLA = currentMin >= 45 ? number(currentScore.away) : (currentMin === 0 ? restLA * 0.45 : Math.max(0.05, goalA + (restLA * Math.max(0, 45 - currentMin) / Math.max(1, 90 - currentMin))));
        const halfSim = computeIndependentPoissonDistribution(halfLH, halfLA);
        const cleanSide = String(opt.side || '').toLowerCase();
        const isHome = cleanSide === 'home' || cleanSide === '1' || cleanSide === 'h' || String(opt.line || '').startsWith('主');
        physicalProb = computeAsianHandicapProb(halfSim, String(opt.line || ''), isHome);
      }

      physicalProb = Number(Math.max(0.1, Math.min(99.9, physicalProb)).toFixed(1));
      const edge = Number((physicalProb - implied).toFixed(2));
      let verdict: PurePhysicalOptionEdge['discrepancy_verdict'] = 'FAIR_PRICING';
      if (edge >= 6.0) verdict = 'STRONG_VALUE_MISPRICING';
      else if (edge <= -6.0) verdict = 'BOOKMAKER_BAIT_TRAP';

      edgeAudit.push({
        market: m.market,
        option_id: opt.option_id,
        direction: `${opt.side || ''} ${opt.line || ''}`.trim(),
        line: opt.line,
        odds,
        bookmaker_implied_prob_pct: implied,
        physical_model_prob_pct: physicalProb,
        physical_value_edge: edge,
        discrepancy_verdict: verdict,
        physical_evidence_zh: `现场射门 ${shotsH}-${shotsA}(射正 ${onTargetH}-${onTargetA})，三区压迫 ${tiltH}%-${tiltA}%，物理推演胜率 ${physicalProb}% vs 机构隐含 ${implied}% (Edge: ${edge > 0 ? '+' : ''}${edge}%)`,
      });
    }
  }

  const homeWinPct = Number((fullSim.margin_distribution_pct.home_win_by_1 + fullSim.margin_distribution_pct.home_win_by_2 + fullSim.margin_distribution_pct.home_win_by_3_plus).toFixed(1));

  return {
    physical_lambdas: {
      rest_home: restLH,
      rest_away: restLA,
      rest_total: Number((restLH + restLA).toFixed(2)),
      projected_full_home: fullLH,
      projected_full_away: fullLA,
      projected_full_total: fullLTotal,
    },
    dominant_siege_factor: siegeInfo,
    pure_physical_distribution: {
      home_win_pct: homeWinPct,
      draw_pct: fullSim.margin_distribution_pct.draw_exact,
      away_win_pct: fullSim.margin_distribution_pct.away_win_exact,
      over_2_5_pct: fullSim.total_goals_distribution_pct.over_2_5,
      under_2_5_pct: fullSim.total_goals_distribution_pct.under_2_5,
      over_3_5_pct: fullSim.total_goals_distribution_pct.over_3_5,
      under_3_5_pct: fullSim.total_goals_distribution_pct.under_3_5,
      top_scorelines: fullSim.top_scorelines,
    },
    market_physical_edge_audit: edgeAudit,
    executive_physical_summary_zh: `【纯物理攻防推演】下半场剩余进球期望: 主λ=${restLH}, 客λ=${restLA}(总λ=${(restLH + restLA).toFixed(2)})；全场完赛期望比分: ${fullLH.toFixed(1)} - ${fullLA.toFixed(1)}。`,
  };
}

function asArray(val: unknown): any[] {
  return Array.isArray(val) ? val : [];
}

export function computeIndependentPoissonDistribution(
  lambdaH: number,
  lambdaA: number
): IndependentPoissonDistribution {
  const lH = Math.max(0.05, lambdaH);
  const lA = Math.max(0.05, lambdaA);

  let win1 = 0;
  let win2 = 0;
  let win3Plus = 0;
  let draw = 0;
  let awayWin = 0;

  let under15 = 0;
  let under25 = 0;
  let under35 = 0;
  let over25 = 0;
  let over35 = 0;

  const scoreMatrix: Array<{ score: string; prob_pct: number }> = [];

  for (let h = 0; h <= 6; h++) {
    const pH = poissonProb(h, lH);
    for (let a = 0; a <= 6; a++) {
      const pA = poissonProb(a, lA);
      const p = pH * pA;
      const pPct = Number((p * 100).toFixed(1));

      scoreMatrix.push({ score: `${h}-${a}`, prob_pct: pPct });

      const diff = h - a;
      if (diff === 1) win1 += p;
      else if (diff === 2) win2 += p;
      else if (diff >= 3) win3Plus += p;
      else if (diff === 0) draw += p;
      else awayWin += p;

      const total = h + a;
      if (total <= 1) under15 += p;
      if (total <= 2) under25 += p;
      if (total <= 3) under35 += p;
      if (total >= 3) over25 += p;
      if (total >= 4) over35 += p;
    }
  }

  scoreMatrix.sort((a, b) => b.prob_pct - a.prob_pct);

  return {
    lambdas: {
      home: Number(lH.toFixed(2)),
      away: Number(lA.toFixed(2)),
      total: Number((lH + lA).toFixed(2)),
    },
    margin_distribution_pct: {
      home_win_by_1: Number((win1 * 100).toFixed(1)),
      home_win_by_2: Number((win2 * 100).toFixed(1)),
      home_win_by_3_plus: Number((win3Plus * 100).toFixed(1)),
      draw_exact: Number((draw * 100).toFixed(1)),
      away_win_exact: Number((awayWin * 100).toFixed(1)),
    },
    total_goals_distribution_pct: {
      under_1_5: Number((under15 * 100).toFixed(1)),
      under_2_5: Number((under25 * 100).toFixed(1)),
      under_3_5: Number((under35 * 100).toFixed(1)),
      over_2_5: Number((over25 * 100).toFixed(1)),
      over_3_5: Number((over35 * 100).toFixed(1)),
    },
    top_scorelines: scoreMatrix.slice(0, 4),
  };
}

/**
 * 2b. Deep Spread vs Total Goals Coupling & 5-Market Sanity Auditor
 * Audits mathematical consistency between Asian Handicap (e.g. -2.0) and Total Goals (e.g. 3.0),
 * and prevents the "Bookmaker Anchor Fallacy" where AI mistakes deep lines for guaranteed blowouts.
 */
export function evaluateFiveMarketsSanityAndCoupling(
  verifiedMarkets: any[],
  stats?: unknown,
  score?: unknown
): {
  deep_spread_trap_detected: boolean;
  spread_total_ratio?: number;
  primary_spread_line?: number;
  primary_total_line?: number;
  mathematical_conflict_verdict?: string;
  market_specific_guidance: {
    total_goals_assessment: string;
    favorite_spread_assessment: string;
    underdog_spread_assessment: string;
    level_ball_protection_assessment: string;
    match_1x2_assessment: string;
  };
} | null {
  if (!Array.isArray(verifiedMarkets) || verifiedMarkets.length === 0) return null;

  const spreadMarket = verifiedMarkets.find((m) => m.market === 'full_spread');
  const totalMarket = verifiedMarkets.find((m) => m.market === 'full_total');

  let primarySpreadLine: number | null = null;
  let primaryTotalLine: number | null = null;

  if (spreadMarket && Array.isArray(spreadMarket.options)) {
    for (const opt of spreadMarket.options) {
      const lineNum = parseFloat(String(opt.line || '').replace(/[^\d.-]/g, ''));
      if (!isNaN(lineNum) && lineNum !== 0) {
        if (primarySpreadLine === null || Math.abs(lineNum) > Math.abs(primarySpreadLine)) {
          primarySpreadLine = lineNum;
        }
      }
    }
  }

  if (totalMarket && Array.isArray(totalMarket.options)) {
    for (const opt of totalMarket.options) {
      const lineNum = parseFloat(String(opt.line || '').replace(/[^\d.-]/g, ''));
      if (!isNaN(lineNum) && lineNum > 0) {
        if (primaryTotalLine === null || Math.abs(lineNum - 2.5) < Math.abs(primaryTotalLine - 2.5)) {
          primaryTotalLine = lineNum;
        }
      }
    }
  }

  const absSpread = primarySpreadLine !== null ? Math.abs(primarySpreadLine) : 0;
  const isDeepSpread = absSpread >= 1.5;
  const ratio = (primaryTotalLine && primaryTotalLine > 0) ? Number((absSpread / primaryTotalLine).toFixed(2)) : 0;

  let isTrap = false;
  let conflictVerdict: string | undefined;

  if (isDeepSpread && primaryTotalLine && primaryTotalLine <= absSpread + 1.25) {
    isTrap = true;
    conflictVerdict = `⚠️【深盘与大小球容量冲突预警 (Deep Spread Conflict)】: 机构让球盘深达 ${primarySpreadLine! > 0 ? '+' : ''}${primarySpreadLine}，但全场总进球盘仅为 ${primaryTotalLine} 球 (深度占比 ${Math.round(ratio * 100)}%)。在总进球预期受限时，常见比分 1-0(负)、2-0(走)、2-1(负) 均无法穿盘；让深盘真实赢盘概率通常低于 35%，绝非优势项！统计学上受让方 (+${absSpread}) 或大小球具备更强期望值。`;
  }

  return {
    deep_spread_trap_detected: isTrap,
    spread_total_ratio: ratio > 0 ? ratio : undefined,
    primary_spread_line: primarySpreadLine ?? undefined,
    primary_total_line: primaryTotalLine ?? undefined,
    mathematical_conflict_verdict: conflictVerdict,
    market_specific_guidance: {
      total_goals_assessment: '大小球定价依据：全场总期望进球 λ_total、禁区真实射正转化与防守低位硬度。不因让球深而盲目追大，容量受限时倾向小球或保护副盘。',
      favorite_spread_assessment: isTrap
        ? `优势让深盘 (${primarySpreadLine}) 处于高风险价值陷阱区间，必须具备压倒性破大巴与净胜3球以上的实质数据才可考虑，默认判定为 avoid / NO_BET。`
        : '优势让球定价依据：剩余预期净胜球差 ΔxG 与同级穿盘历史胜率。让步 -0.5/-1.0 需 ΔxG > 0.45 支撑。',
      underdog_spread_assessment: isTrap
        ? `弱势受让盘 (+${absSpread}) 涵盖 1-0、2-1 等全部小胜比分与平局爆冷，在大小球低容量下赢盘+走盘期望高达 65%+，具有极强防守反击价值。`
        : '弱势受让定价依据：弱队低位防守韧性、受让安全垫（赢半/走盘保护）与冷门对冲。',
      level_ball_protection_assessment: '平手盘 (0) / 平半 (+0.25) 定价依据：针对 1X2 独赢赔率过低（1.10~1.25）或强弱难分时的保本退款策略。',
      match_1x2_assessment: '全场独赢定价依据：纯粹胜平负公允概率，彻底与让球盘深度脱钩，严禁将 1X2 胜率误等同于让球赢盘胜率。',
    },
  };
}

/**
 * 3. Bookmaker Overround & Fair Odds (Margined vs Margin-Stripped Fair Probabilities)
 */
export interface FairOptionResult {
  side?: string | null;
  line?: any;
  odds: number;
  implied_prob_pct: number;
  fair_prob_pct: number;
  fair_odds: number;
  option_id?: string;
}

export function calculateMarketOverroundAndFairOdds(options: Array<{ side?: string | null; line?: any; odds?: number; option_id?: string }>): {
  overround_pct: number;
  fair_options: FairOptionResult[];
} | null {
  const valid = (options || []).filter((opt) => Number(opt?.odds) > 1);
  if (valid.length < 2) return null;

  const totalImplied = valid.reduce((sum, opt) => sum + (1 / Number(opt.odds)), 0);
  const overround = totalImplied - 1;

  const fairOptions: FairOptionResult[] = valid.map((opt) => {
    const rawOdds = Number(opt.odds);
    const impliedProb = 1 / rawOdds;
    const fairProb = impliedProb / totalImplied;
    const fairOdds = Number((1 / fairProb).toFixed(3));
    return {
      side: opt.side || null,
      line: opt.line ?? null,
      odds: rawOdds,
      implied_prob_pct: Number((impliedProb * 100).toFixed(2)),
      fair_prob_pct: Number((fairProb * 100).toFixed(2)),
      fair_odds: fairOdds,
      option_id: opt.option_id,
    };
  });

  return {
    overround_pct: Number((overround * 100).toFixed(2)),
    fair_options: fairOptions,
  };
}

/**
 * 3. Lineup & Squad Quality Transparency Indicator
 */
export function classifyLineupTransparency(lineupInput: unknown): {
  tier: 'confirmed_official_lineup' | 'squad_list_only' | 'unknown_or_unannounced';
  home_starters_count: number;
  away_starters_count: number;
  label: string;
} {
  const lineup = object(lineupInput);
  const getStarters = (val: unknown): string[] => {
    if (Array.isArray(val)) return val.map((p) => p?.name || p).filter(Boolean);
    return [];
  };

  const homeStarters = getStarters(lineup.home_starters || lineup.home?.starters || lineup.home_starter_details);
  const awayStarters = getStarters(lineup.away_starters || lineup.away?.starters || lineup.away_starter_details);

  const isConfirmed = lineup.confirmed === true || lineup.status === 'confirmed' || (homeStarters.length >= 11 && awayStarters.length >= 11);
  const isSquadOnly = lineup.status === 'squad_only_no_confirmed_match_lineup' || (homeStarters.length === 0 && awayStarters.length === 0 && (Array.isArray(lineup.home) || Array.isArray(lineup.players)));

  if (isConfirmed || (homeStarters.length >= 10 && awayStarters.length >= 10)) {
    return {
      tier: 'confirmed_official_lineup',
      home_starters_count: homeStarters.length,
      away_starters_count: awayStarters.length,
      label: '官方正式首发已确认',
    };
  }

  if (isSquadOnly || homeStarters.length > 0 || awayStarters.length > 0) {
    return {
      tier: 'squad_list_only',
      home_starters_count: homeStarters.length,
      away_starters_count: awayStarters.length,
      label: '仅大名单/未确认最终11人首发',
    };
  }

  return {
    tier: 'unknown_or_unannounced',
    home_starters_count: 0,
    away_starters_count: 0,
    label: '阵容信息暂未公布',
  };
}

/**
 * 4. Professional Tournament Tier & Strategy Profile Classifier
 */
export type CompetitionCategory =
  | 'TIER_1_ELITE_LEAGUE'      // 五大联赛 / 欧冠欧联正赛 / 顶级国家队正赛
  | 'TIER_2_MID_LEAGUE'        // 瑞典超、荷甲、葡超、英冠、美职联、日职联、巴甲等主流一级联赛
  | 'TIER_3_LOWER_LEAGUE'      // 各国次级/低级别联赛、地区联赛
  | 'CUP_KNOCKOUT'             // 各国国内杯赛、洲际资格赛、淘汰赛
  | 'YOUTH_RESERVES_FRIENDLY'  // 青年队、预备队、球会友谊赛
  | 'WOMEN_FOOTBALL';          // 女足各级别联赛与杯赛

export interface TournamentProfile {
  tier_category: CompetitionCategory;
  tier_name_zh: string;
  market_liquidity: 'ULTRA_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
  expected_overround_range: string;
  variance_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  max_recommended_stake_pct: number;
  rotation_risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  strategic_directives: string[];
}

export function classifyTournamentTier(leagueName: string, homeTeam = '', awayTeam = ''): TournamentProfile {
  const text = `${leagueName} ${homeTeam} ${awayTeam}`.toLowerCase();

  // 1. Women's Football (女足)
  if (/女|women|wom|femini|dam|wsl|nwsl|frauen/i.test(text)) {
    return {
      tier_category: 'WOMEN_FOOTBALL',
      tier_name_zh: '女足赛事 (Women\'s Football)',
      market_liquidity: 'LOW',
      expected_overround_range: '6.5% - 10.0%',
      variance_level: 'HIGH',
      max_recommended_stake_pct: 1.5,
      rotation_risk_level: 'MEDIUM',
      strategic_directives: [
        '女足赛事门将扑救覆盖与球门比例使远射、高空定位球转化率高于男足。',
        '国内女足联赛上下游阶梯差距通常极悬殊，重点核验真实攻防效率与阵容梯队。',
        '防守失误率与角球/定位球产生率较高，单场仓位上限严格限制在 1.5% 以内。',
      ],
    };
  }

  // 2. Youth, Reserves & Friendlies (梯队、预备队、热身友谊赛)
  if (/u\d+|u-\d+|青年|预备|reserve|youth|友谊|friendl|club\s*fr|热身/i.test(text)) {
    return {
      tier_category: 'YOUTH_RESERVES_FRIENDLY',
      tier_name_zh: '青年队/预备队/球会友谊赛 (Youth/Reserves/Friendlies)',
      market_liquidity: 'LOW',
      expected_overround_range: '7.0% - 12.0%',
      variance_level: 'VERY_HIGH',
      max_recommended_stake_pct: 1.0,
      rotation_risk_level: 'HIGH',
      strategic_directives: [
        '战术纪律性与防守稳定性低，友谊赛换人名额多(5~11人)，易导致防线后半程崩塌。',
        '极高比分方差与进球波动，禁止重仓，单场最高下注上限 1.0%，严禁 A 级正式推荐。',
        '深盘让球需极其谨慎，禁止跨串关重复使用同一比赛。',
      ],
    };
  }

  // 3. Domestic & Continental Knockout Cups (杯赛/淘汰制)
  if (/杯|cup|copa|trophy|pokal|coupe|taça|coppa|efl|fa\s*cup|资格赛|qualif|play-off|附加赛|淘汰赛/i.test(text)) {
    return {
      tier_category: 'CUP_KNOCKOUT',
      tier_name_zh: '国内/洲际杯赛淘汰赛 (Cup & Knockout)',
      market_liquidity: 'MEDIUM',
      expected_overround_range: '5.0% - 8.5%',
      variance_level: 'HIGH',
      max_recommended_stake_pct: 2.0,
      rotation_risk_level: 'HIGH',
      strategic_directives: [
        '强队轮换风险极高，豪门往往派出替补/轮换阵容。',
        '【深盘陷阱防范】低独赢赔率绝不等于能打穿 -1.5 / -2.0 深盘，禁止仅凭名气推深盘。',
        '【单场淘汰制下半场搏命反扑与小球硬性拦截】单场淘汰制下若存在1球落后，落后方在下半场(尤其60分后)必然全员压上搏命，后防门户大开极易引发反击进球潮。硬性规则：杯赛落后1球局严禁推全场小球，无明确EV时输出NO_BET。',
        '两回合赛制需关注首回合比分(次回合保平即出线)；单回合淘汰需防范常规时间保平拖入点球大战。',
        '首发阵容未公布时最高评级限制为 C 级，严禁给出 A 级正式推荐。',
      ],
    };
  }

  // 4. Tier 1 Elite Leagues (五大联赛 / 欧冠正赛 / 顶级国家队正赛)
  const isTier1 = /英超|西甲|意甲|德甲|法甲|premier\s*league|la\s*liga|serie\s*a|bundesliga|ligue\s*1|欧冠|champions\s*league|世界杯|world\s*cup|欧洲杯|euros/i.test(text);
  if (isTier1) {
    return {
      tier_category: 'TIER_1_ELITE_LEAGUE',
      tier_name_zh: '顶级精英联赛 (Tier 1 Elite)',
      market_liquidity: 'ULTRA_HIGH',
      expected_overround_range: '2.0% - 3.5%',
      variance_level: 'LOW',
      max_recommended_stake_pct: 5.0,
      rotation_risk_level: 'LOW',
      strategic_directives: [
        '市场效率极高，机构抽水仅 2~3.5%，基本面信息高度透明，无简单信息差。',
        '必须基于精细攻防指标 (xG差值、真实射正转化、场面倾角) 与战术对位寻找微弱价格偏差 (+EV)。',
        '滚球分析重点关注 60 分钟后主帅战术换人与体能临界点。',
        '符合 A 级标准且首发明确时，可配置 3.0%~5.0% 主力仓位。',
      ],
    };
  }

  // 5. Tier 2 Mid Leagues (主流竞技一级联赛)
  const isTier2 = /瑞典超|挪超|芬超|丹超|荷甲|葡超|比甲|苏超|英冠|美职联|mls|日职|j1|韩k|k-league|澳超|巴甲|阿甲|墨超|沙特|中超|瑞士超|奥甲|土超|allsvenskan|eliteserien|eredivisie|primeira|championship/i.test(text);
  if (isTier2) {
    return {
      tier_category: 'TIER_2_MID_LEAGUE',
      tier_name_zh: '主流一级联赛 (Tier 2 Mid League)',
      market_liquidity: 'HIGH',
      expected_overround_range: '4.0% - 6.0%',
      variance_level: 'MEDIUM',
      max_recommended_stake_pct: 3.0,
      rotation_risk_level: 'LOW',
      strategic_directives: [
        '主客场环境差异显著 (如北欧人工草皮、南美高原与长途飞行客场)，主场优势加权明显。',
        '需重点排查周中欧战或杯赛造成的一周双赛体能消耗与局部轮换。',
        '积分榜保级与欧战抢分战意分化明显，重点结合真实攻防效率与即时首发评估。',
      ],
    };
  }

  // 6. Tier 3 Lower / Regional Leagues (次级/低级别/地区联赛)
  return {
    tier_category: 'TIER_3_LOWER_LEAGUE',
    tier_name_zh: '次级与低级别联赛 (Tier 3 Lower/Regional)',
    market_liquidity: 'LOW',
    expected_overround_range: '6.0% - 9.5%',
    variance_level: 'HIGH',
    max_recommended_stake_pct: 1.5,
    rotation_risk_level: 'MEDIUM',
    strategic_directives: [
      '机构抽水偏高 (6~9.5%)，数据透明度相对有限，防守失误率与体能断崖显著 (65-90分失球高发)。',
      '避免对低级别联赛做深盘激进追捧，单场仓位硬性上限限制在 1.5% 以内。',
      '重点关注近 6 场联赛主客场即时表现，降低陈旧历史交锋权重。',
    ],
  };
}

/**
 * 4. Cup & Tournament Risk Detector (Enriched with Tier Profile)
 */
export function detectTournamentRisk(
  leagueName: string,
  lineupTransparency: ReturnType<typeof classifyLineupTransparency>,
  homeTeam = '',
  awayTeam = ''
): {
  is_cup_or_friendly: boolean;
  tier_category: CompetitionCategory;
  tier_name_zh: string;
  rotation_risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  tournament_profile: TournamentProfile;
  warning_note?: string;
} {
  const profile = classifyTournamentTier(leagueName, homeTeam, awayTeam);
  const isHighRiskCompetition = profile.tier_category === 'CUP_KNOCKOUT' ||
    profile.tier_category === 'YOUTH_RESERVES_FRIENDLY' ||
    profile.tier_category === 'WOMEN_FOOTBALL';

  if (!isHighRiskCompetition) {
    return {
      is_cup_or_friendly: false,
      tier_category: profile.tier_category,
      tier_name_zh: profile.tier_name_zh,
      rotation_risk_level: 'LOW',
      tournament_profile: profile,
    };
  }

  if (profile.tier_category === 'YOUTH_RESERVES_FRIENDLY') {
    return {
      is_cup_or_friendly: true,
      tier_category: profile.tier_category,
      tier_name_zh: profile.tier_name_zh,
      rotation_risk_level: 'HIGH',
      tournament_profile: profile,
      warning_note: '梯队/友谊赛防守阵型松散且换人随意，比分方差极高，严禁A级正式推荐，仓位上限 1.0%。',
    };
  }

  if (profile.tier_category === 'CUP_KNOCKOUT' && lineupTransparency.tier !== 'confirmed_official_lineup') {
    return {
      is_cup_or_friendly: true,
      tier_category: profile.tier_category,
      tier_name_zh: profile.tier_name_zh,
      rotation_risk_level: 'HIGH',
      tournament_profile: profile,
      warning_note: '杯赛淘汰赛且首发阵容未确认，轮换风险极高，严禁A级正式推荐，最高限制C级观察。',
    };
  }

  return {
    is_cup_or_friendly: true,
    tier_category: profile.tier_category,
    tier_name_zh: profile.tier_name_zh,
    rotation_risk_level: profile.rotation_risk_level,
    tournament_profile: profile,
    warning_note: profile.strategic_directives[0],
  };
}

/**
 * 5. Bankroll Sizing & Kelly Position Guidance
 */
export function calculateBankrollGuidance(params: {
  grade: string;
  isParlay?: boolean;
  legCount?: number;
  valueEdge?: number | null;
}): {
  recommended_stake_pct: string;
  max_stake_pct: number;
  stake_sizing_tier: 'CORE_FOCUS' | 'STANDARD_PLAY' | 'LIGHT_PARLAY' | 'NO_STAKE';
  guidance_text: string;
  fractional_kelly_pct?: number;
} {
  const { grade, isParlay = false, legCount = 1, valueEdge = null } = params;

  if (grade === 'NO_BET' || grade === 'C' || (valueEdge !== null && valueEdge <= 0)) {
    return {
      recommended_stake_pct: '0%',
      max_stake_pct: 0,
      stake_sizing_tier: 'NO_STAKE',
      guidance_text: '无安全边际或数据不足，建议观望，不予下注。',
    };
  }

  if (isParlay) {
    if (legCount === 2) {
      return {
        recommended_stake_pct: '0.8% - 1.0%',
        max_stake_pct: 1.0,
        stake_sizing_tier: 'LIGHT_PARLAY',
        guidance_text: '2串1黄金组合：复合抽水可控，执行机构级微仓 0.8% - 1.0%。',
      };
    }
    if (legCount === 3) {
      return {
        recommended_stake_pct: '0.4% - 0.6%',
        max_stake_pct: 0.6,
        stake_sizing_tier: 'LIGHT_PARLAY',
        guidance_text: '3串1组合：受复合抽水与方差累积影响，严格执行微仓 0.4% - 0.6%。',
      };
    }
    return {
      recommended_stake_pct: '0.2% - 0.3%',
      max_stake_pct: 0.3,
      stake_sizing_tier: 'LIGHT_PARLAY',
      guidance_text: '4腿以上多串关：抽水偏高且方差极大，仅作娱乐彩票超微仓 (0.2% - 0.3%)。',
    };
  }

  // Single Match
  if (grade === 'A') {
    return {
      recommended_stake_pct: '3.0% - 5.0%',
      max_stake_pct: 5.0,
      stake_sizing_tier: 'CORE_FOCUS',
      guidance_text: 'A级核心推荐：数据完备、阵容明确且具备正期望边际 (+EV)，建议主力仓位 3% - 5%。',
    };
  }

  return {
    recommended_stake_pct: '1.0% - 2.0%',
    max_stake_pct: 2.0,
    stake_sizing_tier: 'STANDARD_PLAY',
    guidance_text: 'B级标准推荐：数据达标但存在局部不确定性，建议标准防守仓位 1% - 2%。',
  };
}

/**
 * 5.1 Calibrated Institutional Parlay & True +EV Engine
 * Solves the critical exponential distortion of raw probability compounding in sports betting.
 * Applies Bayesian shrinkage (haircut) to damp model calibration variance,
 * factors in quarter-line split cushions, and enforces institutional Kelly caps.
 */
export interface CalibratedParlayLegInput {
  odds: number;
  probability?: number | null;
  market?: string | null;
  line?: string | null;
  grade?: string | null;
}

export interface CalibratedParlayMetrics {
  totalOdds: number;
  rawJointProbPct: number;
  calibratedJointProbPct: number;
  rawEvPct: number;
  calibratedEvPct: number;
  quarterKellyPct: number;
  recommendedStakePct: string;
  sharpeAssessment: 'HIGH_EDGE_CORE' | 'BALANCED_GROWTH' | 'SPECULATIVE_VALUE' | 'FRAGILE_LOTTERY';
  haircutFactor: number;
  isHighQualityAnchorCombo: boolean;
  warnings: string[];
}

export function calculateCalibratedParlayMetrics(
  legs: CalibratedParlayLegInput[],
  modelProvidedJointProb?: number | null,
  modelProvidedEv?: number | null
): CalibratedParlayMetrics {
  const validLegs = (legs || []).filter((l) => Number(l.odds) > 1);
  const legCount = validLegs.length;

  if (legCount === 0) {
    return {
      totalOdds: 1.0,
      rawJointProbPct: 0,
      calibratedJointProbPct: 0,
      rawEvPct: 0,
      calibratedEvPct: 0,
      quarterKellyPct: 0,
      recommendedStakePct: '0%',
      sharpeAssessment: 'FRAGILE_LOTTERY',
      haircutFactor: 1.0,
      isHighQualityAnchorCombo: false,
      warnings: ['无有效串关腿数据'],
    };
  }

  // 1. Calculate Total Compound Odds
  const calculatedTotalOdds = Number(validLegs.reduce((acc, l) => acc * Number(l.odds), 1).toFixed(2));
  const totalOdds = calculatedTotalOdds;

  // 2. Multi-leg Shrinkage Factor (Bayesian Haircut against model estimation error)
  // 2-leg: 0.85, 3-leg: 0.72, 4-leg: 0.60, 5-leg+: 0.50
  const haircutFactor = legCount === 2 ? 0.85 : legCount === 3 ? 0.72 : legCount === 4 ? 0.60 : 0.50;

  // 3. Evaluate each leg's implied prob, raw model prob, and calibrated prob
  let rawJointMult = 1.0;
  let calibratedJointMult = 1.0;
  let highProbLegs = 0;
  let lowProbLegs = 0;
  let cushionedLegs = 0;
  const warnings: string[] = [];

  for (const leg of validLegs) {
    const odds = Number(leg.odds);
    const impliedProb = 100 / odds; // in 0..100%
    let rawProb = typeof leg.probability === 'number' && leg.probability > 0
      ? leg.probability
      : (impliedProb + 3.5); // Fallback: small default edge

    // Clamp raw probability to realistic bounds (10% ~ 90%)
    rawProb = Math.max(10, Math.min(90, rawProb));
    const rawEdge = rawProb - impliedProb;

    // Check if this leg has quarter-line split protection (e.g. 0/0.5, 2/2.5, 0.25, 0.75, 平半)
    const lineText = String(leg.line || '');
    const isQuarterLine = /[0-9]\/[0-9]|\.25|\.75|平半|半一/i.test(lineText);
    if (isQuarterLine) cushionedLegs++;

    if (rawProb >= 56) highProbLegs++;
    if (rawProb < 48) {
      lowProbLegs++;
      warnings.push(`腿 [${leg.market || ''} ${leg.line || ''} @${leg.odds}] 预估胜率 (${rawProb}%) 偏低，降低整单成活率`);
    }

    // Shrink the edge towards fair market probability
    const calibratedEdge = rawEdge * haircutFactor;
    const calibratedProb = Math.max(5, Math.min(95, impliedProb + calibratedEdge));

    rawJointMult *= (rawProb / 100);
    calibratedJointMult *= (calibratedProb / 100);
  }

  const rawJointProbPct = Number((rawJointMult * 100).toFixed(1));
  let calibratedJointProbPct = Number((calibratedJointMult * 100).toFixed(1));

  // If AI model provided a joint probability that is reasonable and lower/calibrated, take the conservative minimum
  if (typeof modelProvidedJointProb === 'number' && modelProvidedJointProb > 0 && modelProvidedJointProb <= 100) {
    calibratedJointProbPct = Math.min(calibratedJointProbPct, Number(modelProvidedJointProb.toFixed(1)));
  }

  // 4. Calculate Net Calibrated EV % = (Calibrated Joint Prob / 100 * Total Odds - 1) * 100
  const rawEvPct = Number(((rawJointProbPct / 100 * totalOdds - 1) * 100).toFixed(1));
  let calculatedCalibratedEv = Number(((calibratedJointProbPct / 100 * totalOdds - 1) * 100).toFixed(1));

  // Damp extreme EV numbers (over +25% in parlays is almost always overfit variance)
  if (calculatedCalibratedEv > 25) {
    calculatedCalibratedEv = Number((25 + (calculatedCalibratedEv - 25) * 0.25).toFixed(1));
  }
  const calibratedEvPct = calculatedCalibratedEv;

  // 5. Institutional Fractional Kelly with strict variance damping
  // f* = max(0, (b*p - q)/b)
  const b = Math.max(0.01, totalOdds - 1);
  const p = calibratedJointProbPct / 100;
  const q = Math.max(0, 1 - p);
  const rawKelly = Math.max(0, (b * p - q) / b);
  
  // Institutional Parlay Stake Cap
  const maxStakeCap = legCount === 2 ? 1.0 : legCount === 3 ? 0.6 : 0.3;
  const quarterKellyCalculated = Number((rawKelly * 0.25 * 100).toFixed(2));
  const finalQuarterKelly = Math.min(maxStakeCap, Math.max(0, quarterKellyCalculated));

  const recommendedStakePct = finalQuarterKelly > 0 ? `${finalQuarterKelly}%` : '0%';

  // 6. Sharpe & Portfolio Resilience Assessment
  const isHighQualityAnchorCombo = highProbLegs >= legCount && lowProbLegs === 0 && calibratedEvPct >= 4;
  let sharpeAssessment: 'HIGH_EDGE_CORE' | 'BALANCED_GROWTH' | 'SPECULATIVE_VALUE' | 'FRAGILE_LOTTERY' = 'SPECULATIVE_VALUE';

  if (calibratedEvPct >= 8 && calibratedJointProbPct >= (legCount === 2 ? 32 : 18) && isHighQualityAnchorCombo) {
    sharpeAssessment = 'HIGH_EDGE_CORE';
  } else if (calibratedEvPct >= 3 && calibratedJointProbPct >= (legCount === 2 ? 24 : 12)) {
    sharpeAssessment = 'BALANCED_GROWTH';
  } else if (calibratedEvPct <= -5 || calibratedJointProbPct < (legCount === 2 ? 15 : 6) || lowProbLegs >= 2) {
    sharpeAssessment = 'FRAGILE_LOTTERY';
    warnings.push('整单理论成活率过低或期望值为负，属于高风险易损彩票组合');
  }

  return {
    totalOdds,
    rawJointProbPct,
    calibratedJointProbPct,
    rawEvPct,
    calibratedEvPct,
    quarterKellyPct: finalQuarterKelly,
    recommendedStakePct,
    sharpeAssessment,
    haircutFactor,
    isHighQualityAnchorCombo,
    warnings,
  };
}

/**
 * 6. Historical H2H & Recent Form Time-Decay Evaluator (Dixon-Coles & Half-Life Principles)
 */
export function analyzeH2HRecency(h2hList: unknown[]): {
  total_encounters: number;
  recent_1year_count: number;
  recent_2years_count: number;
  stale_over_2years_count: number;
  recency_verdict: 'HIGH_VALIDITY' | 'MODERATE_DECAY' | 'STALE_ZERO_WEIGHT' | 'NO_H2H_DATA';
  guidance_note: string;
} {
  const list = Array.isArray(h2hList) ? h2hList : [];
  if (list.length === 0) {
    return {
      total_encounters: 0,
      recent_1year_count: 0,
      recent_2years_count: 0,
      stale_over_2years_count: 0,
      recency_verdict: 'NO_H2H_DATA',
      guidance_note: '暂无历史交锋数据，需完全依赖近期基本面、阵容与盘口价值。',
    };
  }

  const currentYear = new Date().getFullYear();
  let recent1 = 0;
  let recent2 = 0;
  let stale = 0;

  for (const item of list) {
    let year = 0;
    if (typeof item === 'object' && item !== null) {
      const d = (item as any).match_date || (item as any).date || (item as any).match_time || (item as any).time;
      if (typeof d === 'string') {
        const m = d.match(/(\d{4})/);
        if (m) year = parseInt(m[1], 10);
      } else if (typeof d === 'number') {
        const ts = d > 1e11 ? d : d * 1000;
        year = new Date(ts).getFullYear();
      }
    }
    if (year > 0) {
      const diff = currentYear - year;
      if (diff <= 1) recent1++;
      else if (diff === 2) recent2++;
      else stale++;
    } else {
      // Default assume medium if unstated
      recent2++;
    }
  }

  let verdict: 'HIGH_VALIDITY' | 'MODERATE_DECAY' | 'STALE_ZERO_WEIGHT' | 'NO_H2H_DATA' = 'MODERATE_DECAY';
  let note = '';

  if (stale > 0 && recent1 === 0 && recent2 === 0) {
    verdict = 'STALE_ZERO_WEIGHT';
    note = `历史交锋共${list.length}场，全部发生于2年前。因主帅、球员阵容已彻底更迭，交锋数据已失去统计预测意义，严禁作为让球/大小球核心依据。`;
  } else if (recent1 >= 2) {
    verdict = 'HIGH_VALIDITY';
    note = `近1年内有${recent1}次直接交锋，战术克制与阵容对位延续性高，可作为有效佐证指标。`;
  } else {
    verdict = 'MODERATE_DECAY';
    note = `历史交锋中近1年样本较少(${recent1}场)，历史数据存在时间衰减，必须以近期联赛状态与即时阵容为主。`;
  }

  return {
    total_encounters: list.length,
    recent_1year_count: recent1,
    recent_2years_count: recent2,
    stale_over_2years_count: stale,
    recency_verdict: verdict,
    guidance_note: note,
  };
}

/**
 * 7. Attack Momentum Timeline Analyzer (整场分段攻势评分曲线分析)
 * Respects 2D segment boundary (data[0] for 1st half, data[1] for 2nd half).
 * Extracts continuous dominant pressure windows and strictly aligns them with match incidents & text_live events.
 * Computes near-term 5min/15min momentum shifts and tactical conversion for in-play AI evaluation.
 */
export function analyzeAttackMomentumTimeline(
  timelineInput: any,
  currentMinute: number = 0,
  incidentsInput?: any[],
  homeTeamName: string = '',
  awayTeamName: string = ''
): {
  recent_5min_momentum: { home: number; away: number; dominant_side: 'home' | 'away' | 'balanced' };
  recent_15min_pressure_share: { home: number; away: number };
  continuous_dominance_windows: Array<{
    segment_name: string;
    start_min: number;
    end_min: number;
    duration_mins: number;
    dominant_side: 'home' | 'away';
    summary_zh: string;
    correlated_incidents: string[];
    conversion_type: 'GOAL_CONVERTED' | 'DANGER_CONVERTED' | 'CARD_FORCED' | 'STERILE_PRESSURE';
  }>;
  momentum_trend: 'HOME_HEAVY_PRESSURE' | 'AWAY_HEAVY_PRESSURE' | 'BALANCED_CONTEST';
  tactical_conversion_verdict: string;
  momentum_verdict_zh: string;
} | null {
  if (!timelineInput) return null;

  let timeline = timelineInput;
  if (typeof timeline === 'string') {
    try {
      timeline = JSON.parse(timeline);
    } catch {
      return null;
    }
  }
  if (!timeline || typeof timeline !== 'object') return null;

  const nominalMinutes = Number(timeline.nominal_segment_minutes) || 45;
  const rawData =
    timeline.data !== undefined
      ? timeline.data
      : timeline.trend?.data !== undefined
      ? timeline.trend.data
      : timeline.trend;

  // Normalize into 2D segments: Array<Array<number>>
  let segments: number[][] = [];

  if (Array.isArray(timeline) && timeline.length > 0) {
    if (Array.isArray(timeline[0])) {
      segments = timeline.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
    } else if (typeof timeline[0] === 'number') {
      segments = [timeline.map(Number)];
    }
  } else if (Array.isArray(rawData) && rawData.length > 0) {
    if (Array.isArray(rawData[0])) {
      // 2D Array [ [..], [..] ]
      segments = rawData.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
    } else if (typeof rawData[0] === 'number') {
      // Flat 1D Array fallback
      segments = [rawData.map(Number)];
    }
  } else if (Array.isArray(timeline.periods) && timeline.periods.length > 0) {
    segments = timeline.periods.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
  } else if (Array.isArray(timeline.segments) && timeline.segments.length > 0) {
    segments = timeline.segments.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
  } else if (Array.isArray(timeline.raw?.data) && timeline.raw.data.length > 0) {
    segments = timeline.raw.data.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
  } else if (Array.isArray(timeline.home) && Array.isArray(timeline.away)) {
    const len = Math.max(timeline.home.length, timeline.away.length);
    const diffs: number[] = [];
    for (let i = 0; i < len; i++) {
      diffs.push((Number(timeline.home[i]) || 0) - (Number(timeline.away[i]) || 0));
    }
    segments = [diffs];
  }

  // Filter out empty segments
  segments = segments.filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  // Normalize incident list for timeline matching
  const parsedIncidents: Array<{ min: number; text: string; type: string; team: 'home' | 'away' | 'unknown' }> = [];
  if (Array.isArray(incidentsInput)) {
    for (const rawInc of incidentsInput) {
      if (typeof rawInc === 'string') {
        const minMatch = rawInc.match(/^(\d{1,3})/);
        const min = minMatch ? parseInt(minMatch[1], 10) : -1;
        if (min >= 0) {
          let team: 'home' | 'away' | 'unknown' = 'unknown';
          if (homeTeamName && rawInc.includes(homeTeamName)) team = 'home';
          else if (awayTeamName && rawInc.includes(awayTeamName)) team = 'away';
          parsedIncidents.push({ min, text: rawInc, type: rawInc, team });
        }
      } else if (rawInc && typeof rawInc === 'object') {
        const min = Number(rawInc.time ?? rawInc.minute ?? rawInc.min ?? -1);
        const desc = String(rawInc.text ?? rawInc.content ?? rawInc.type_name ?? rawInc.type ?? '');
        const target = Number(rawInc.position ?? rawInc.team ?? 0);
        const team = target === 1 ? 'home' : target === 2 ? 'away' : 'unknown';
        if (min >= 0) {
          parsedIncidents.push({ min, text: desc || `${min}' 比赛事件`, type: desc, team });
        }
      }
    }
  }

  interface DominanceWindowItem {
    segment_name: string;
    start_min: number;
    end_min: number;
    duration_mins: number;
    dominant_side: 'home' | 'away';
    summary_zh: string;
    correlated_incidents: string[];
    conversion_type: 'GOAL_CONVERTED' | 'DANGER_CONVERTED' | 'CARD_FORCED' | 'STERILE_PRESSURE';
  }

  const dominanceWindows: DominanceWindowItem[] = [];
  const allFlattenedPoints: Array<{ min: number; h: number; a: number; score: number }> = [];

  // Analyze each segment independently respecting period boundaries
  segments.forEach((segScores, segIdx) => {
    const segName = segIdx === 0 ? '上半场' : segIdx === 1 ? '下半场' : segIdx === 2 ? '加时上半场' : segIdx === 3 ? '加时下半场' : `第${segIdx + 1}阶段`;
    const baseOffset = segIdx === 0 ? 0 : segIdx * nominalMinutes + 1;

    let currentSide: 'home' | 'away' | null = null;
    let windowStartIdx = 0;
    let streak = 0;

    const commitWindow = (side: 'home' | 'away', startIdx: number, endIdx: number, streakCount: number) => {
      if (streakCount < 4) return;
      const startMin = segIdx === 0 ? startIdx : nominalMinutes + 1 + startIdx;
      const endMin = segIdx === 0 ? endIdx : nominalMinutes + 1 + endIdx;
      const sideName = side === 'home' ? (homeTeamName || '主队') : (awayTeamName || '客队');

      // Correlate with incidents occurring in [startMin - 1, endMin + 1]
      const correlated = parsedIncidents
        .filter((inc) => inc.min >= Math.max(0, startMin - 1) && inc.min <= endMin + 1)
        .map((inc) => inc.text);

      let convType: DominanceWindowItem['conversion_type'] = 'STERILE_PRESSURE';
      const corrStr = correlated.join(' ');
      if (/进球|破门|点球进|得分/i.test(corrStr)) {
        convType = 'GOAL_CONVERTED';
      } else if (/角球|射正|中框|扑救|险情/i.test(corrStr)) {
        convType = 'DANGER_CONVERTED';
      } else if (/红牌|黄牌|造牌/i.test(corrStr)) {
        convType = 'CARD_FORCED';
      }

      const convNote =
        convType === 'GOAL_CONVERTED' ? '【转化破门】' :
        convType === 'DANGER_CONVERTED' ? '【造角球/险情】' :
        convType === 'CARD_FORCED' ? '【造牌/加剧犯规】' : '【持续压迫/雷声大雨点小】';

      const windowDesc = `[${segName}] ${startMin}'-${endMin}' ${side === 'home' ? '主队' : '客队'}(${sideName})持续压制高潮(连续${streakCount}分钟攻势占优) ${convNote}`;

      dominanceWindows.push({
        segment_name: segName,
        start_min: startMin,
        end_min: endMin,
        duration_mins: streakCount,
        dominant_side: side,
        summary_zh: windowDesc,
        correlated_incidents: correlated,
        conversion_type: convType,
      });
    };

    segScores.forEach((score, idx) => {
      const h = score > 0 ? score : 0;
      const a = score < 0 ? Math.abs(score) : 0;
      const approxMin = baseOffset + idx;
      allFlattenedPoints.push({ min: approxMin, h, a, score });

      const side = h >= 30 && h > a ? 'home' : a >= 30 && a > h ? 'away' : null;
      if (side && side === currentSide) {
        streak++;
      } else {
        if (currentSide && streak >= 4) {
          commitWindow(currentSide, windowStartIdx, idx - 1, streak);
        }
        currentSide = side;
        windowStartIdx = idx;
        streak = side ? 1 : 0;
      }
    });

    if (currentSide && streak >= 4) {
      commitWindow(currentSide, windowStartIdx, segScores.length - 1, streak);
    }
  });

  // Calculate recent 15 minutes pressure share from the latest segment points
  const activeSegment = segments[segments.length - 1] || [];
  let recent15Slice: number[] = [];

  if (activeSegment.length >= 15) {
    recent15Slice = activeSegment.slice(-15);
  } else {
    const prevSegment = segments.length > 1 ? segments[segments.length - 2] : [];
    const needed = 15 - activeSegment.length;
    recent15Slice = [...prevSegment.slice(-needed), ...activeSegment];
  }

  let recentHSum = 0;
  let recentASum = 0;
  for (const score of recent15Slice) {
    if (score > 0) recentHSum += score;
    else if (score < 0) recentASum += Math.abs(score);
  }

  const totalRecent = recentHSum + recentASum;
  const homeShare = totalRecent > 0 ? Number(((recentHSum / totalRecent) * 100).toFixed(1)) : 50;
  const awayShare = totalRecent > 0 ? Number(((recentASum / totalRecent) * 100).toFixed(1)) : 50;

  // Calculate immediate 5-minute momentum (近5分钟超近端攻势势头)
  const recent5Slice = activeSegment.length >= 5 ? activeSegment.slice(-5) : recent15Slice.slice(-5);
  let imm5H = 0;
  let imm5A = 0;
  for (const score of recent5Slice) {
    if (score > 0) imm5H += score;
    else if (score < 0) imm5A += Math.abs(score);
  }
  const total5 = imm5H + imm5A;
  const imm5HShare = total5 > 0 ? Number(((imm5H / total5) * 100).toFixed(1)) : 50;
  const imm5AShare = total5 > 0 ? Number(((imm5A / total5) * 100).toFixed(1)) : 50;
  const dominantSide5: 'home' | 'away' | 'balanced' =
    imm5HShare >= 65 ? 'home' : imm5AShare >= 65 ? 'away' : 'balanced';

  let trend: 'HOME_HEAVY_PRESSURE' | 'AWAY_HEAVY_PRESSURE' | 'BALANCED_CONTEST' = 'BALANCED_CONTEST';
  let verdictZh = `攻势曲线相对胶着，近15分钟攻势占比 ${homeShare}% vs ${awayShare}%，近5分钟处于${dominantSide5 === 'home' ? '主队提速' : dominantSide5 === 'away' ? '客队提速' : '均势对抗'}。`;

  if (homeShare >= 65) {
    trend = 'HOME_HEAVY_PRESSURE';
    verdictZh = `主队近15分钟攻势评分持续压制(${homeShare}% vs ${awayShare}%)，近5分钟保持强力压迫(${imm5HShare}%)，围攻态势明显。`;
  } else if (awayShare >= 65) {
    trend = 'AWAY_HEAVY_PRESSURE';
    verdictZh = `客队近15分钟攻势评分持续压制(${awayShare}% vs ${homeShare}%)，近5分钟反客为主高压推进(${imm5AShare}%)。`;
  }

  // Tactical conversion synthesis
  const goalConvertedWins = dominanceWindows.filter((w) => w.conversion_type === 'GOAL_CONVERTED');
  const sterileWins = dominanceWindows.filter((w) => w.conversion_type === 'STERILE_PRESSURE');
  let tacticalConversion = '攻守对抗推进中';
  if (goalConvertedWins.length > 0) {
    tacticalConversion = `攻势高潮具备极高杀伤力，已成功在强势窗口期实现破门(${goalConvertedWins.map(w => w.summary_zh).join('; ')})`;
  } else if (sterileWins.length >= 2) {
    tacticalConversion = '攻势波次虽多但雷声大雨点小，转化为绝对破门机会偏少，需警惕虚火与后防反击。';
  } else if (dominanceWindows.length > 0) {
    tacticalConversion = '攻势窗口期伴随角球与持续定位球威胁，不断向对方禁区施压。';
  }

  return {
    recent_5min_momentum: {
      home: imm5HShare,
      away: imm5AShare,
      dominant_side: dominantSide5,
    },
    recent_15min_pressure_share: { home: homeShare, away: awayShare },
    continuous_dominance_windows: dominanceWindows.slice(-5),
    momentum_trend: trend,
    tactical_conversion_verdict: tacticalConversion,
    momentum_verdict_zh: verdictZh,
  };
}

/**
 * 8. Goal Distribution Analyzer (进球时间分布分析)
 * Extracts 15-minute goal timing propensities and late-game goal spike rates.
 */
export function analyzeGoalDistribution(
  goalDistributionInput: any
): {
  first_half_goals_pct: number;
  second_half_goals_pct: number;
  late_game_75_plus_pct: number;
  top_scoring_window_zh: string;
  summary_zh: string;
} | null {
  if (!goalDistributionInput || typeof goalDistributionInput !== 'object') return null;

  const home = goalDistributionInput.home || goalDistributionInput.home_team || {};
  const away = goalDistributionInput.away || goalDistributionInput.away_team || {};

  const getBucket = (data: any, key: string): number => {
    if (!data || typeof data !== 'object') return 0;
    return Number(data[key] ?? data[key.replace('-', '_')] ?? 0);
  };

  const buckets = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'];
  const totals: Record<string, number> = {};
  let totalGoals = 0;

  for (const b of buckets) {
    const count = getBucket(home, b) + getBucket(away, b);
    totals[b] = count;
    totalGoals += count;
  }

  if (totalGoals === 0) return null;

  const firstHalfGoals = totals['0-15'] + totals['16-30'] + totals['31-45'];
  const secondHalfGoals = totals['46-60'] + totals['61-75'] + totals['76-90'];
  const lateGoals = totals['76-90'];

  const firstHalfPct = Number(((firstHalfGoals / totalGoals) * 100).toFixed(1));
  const secondHalfPct = Number(((secondHalfGoals / totalGoals) * 100).toFixed(1));
  const latePct = Number(((lateGoals / totalGoals) * 100).toFixed(1));

  let maxBucket = '76-90';
  let maxCount = 0;
  for (const b of buckets) {
    if (totals[b] > maxCount) {
      maxCount = totals[b];
      maxBucket = b;
    }
  }

  const maxPct = Number(((maxCount / totalGoals) * 100).toFixed(1));
  const topWindowZh = `高频进球窗口: ${maxBucket}分钟 (占历史总进球 ${maxPct}%)`;
  const summaryZh = `进球时段特征: 上半场 ${firstHalfPct}% vs 下半场 ${secondHalfPct}%，终局76-90+分钟进球占比 ${latePct}%。`;

  return {
    first_half_goals_pct: firstHalfPct,
    second_half_goals_pct: secondHalfPct,
    late_game_75_plus_pct: latePct,
    top_scoring_window_zh: topWindowZh,
    summary_zh: summaryZh,
  };
}

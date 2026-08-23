import { DecisionItem, StandardMatchData, toStandardMatchData } from '../types';
import { formatAsianLine, parseQuarterLine } from './quarterSettlement';

export interface RawOption {
  selection?: string;
  odds?: number | string;
  line?: number | string;
  side?: string;
  suspended?: boolean;
}

export interface RawMarket {
  market_type?: string;
  market_label?: string;
  line?: number | string;
  options?: RawOption[];
  is_verified?: boolean;
}

export interface SelectedMainMarket {
  mainMarket: RawMarket | null;
  line: number | null;
  options: Array<RawOption & { numOdds: number }>;
  alternativeMarkets: RawMarket[];
  balanceScore: number;
}

export interface QuantMarketPrediction {
  marketType: 'TOTAL_GOALS' | 'HALF_TOTAL_GOALS' | 'ASIAN_HANDICAP' | 'HALF_ASIAN_HANDICAP' | 'MATCH_WINNER';
  marketLabel: string;
  hasPrediction: boolean;
  predictedSide: 'home' | 'away' | 'draw' | 'over' | 'under' | null;
  predictedSelection: string;
  predictedLine?: number;
  modelProbability: number; // 机器量化测算概率（%）
  marketProbability: number; // 庄家盘口去水后隐含概率（%）
  expectedValue: number; // EV (%) = (modelProbability/100 * odds - 1) * 100
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  quantReason: string;
  tacticalFactor: string;
  odds?: number;
}

export interface MatchQuantAnalysis {
  match: string;
  homeTeam: string;
  awayTeam: string;
  minute: number;
  score: { home: number; away: number };
  homeThreatScore: number;
  awayThreatScore: number;
  expectedRemainingGoals: number;
  dominanceStatus: 'HOME_DOMINANT' | 'AWAY_DOMINANT' | 'BALANCED_PRESSURE' | 'STERILE_POSSESSION' | 'ATTRITION_BATTLE';
  engineMode: 'PREMATCH_QUANT' | 'LIVE_IN_PLAY_MOMENTUM';
  dataQualityLevel: 'FULL_FUNDAMENTALS_AND_MARKET' | 'PARTIAL_FUNDAMENTALS_AND_MARKET' | 'PURE_MARKET_CONSENSUS';
  dataQualityBadge: string;
  predictions: {
    totalGoals?: QuantMarketPrediction;
    halfTotalGoals?: QuantMarketPrediction;
    asianHandicap?: QuantMarketPrediction;
    halfAsianHandicap?: QuantMarketPrediction;
    matchWinner?: QuantMarketPrediction;
  };
}

export function parseOdds(val: any): number | null {
  const n = Number(val);
  return Number.isFinite(n) && n > 1 ? n : null;
}

export function parseLine(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = parseQuarterLine(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * 泊松概率密度函数 P(X = k; lambda)
 */
export function poissonProb(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

/**
 * 模块 1：通用主盘口智能甄选引擎 (selectMainMarketLine)
 * 遍历该玩法的所有挂盘档位，结合双边贴水离散度、抽水率与主力投注水位区间 [1.80, 2.15]，
 * 锁定最具流动性与代表性的基准主盘口，并返回所有副盘。
 */
export function selectMainMarketLine(
  markets: RawMarket[],
  targetCategory: 'full_total' | 'half_total' | 'full_spread' | 'half_spread' | 'full_h2h' | 'half_h2h'
): SelectedMainMarket {
  const matchingMarkets: RawMarket[] = [];

  for (const m of markets) {
    const rawType = String(m.market_type || '').toLowerCase();
    const rawLabel = String(m.market_label || '').toLowerCase();
    const isHalf = rawType.includes('half') || rawLabel.includes('半场') || rawLabel.includes('上半场');

    let isMatch = false;
    if (targetCategory === 'full_total') {
      isMatch = !isHalf && (rawType.includes('total') || rawLabel.includes('大小球') || rawLabel.includes('大小'));
    } else if (targetCategory === 'half_total') {
      isMatch = isHalf && (rawType.includes('total') || rawLabel.includes('大小球') || rawLabel.includes('大小'));
    } else if (targetCategory === 'full_spread') {
      isMatch = !isHalf && (rawType.includes('spread') || rawType.includes('handicap') || rawLabel.includes('让球')) && !rawLabel.includes('角球');
    } else if (targetCategory === 'half_spread') {
      isMatch = isHalf && (rawType.includes('spread') || rawType.includes('handicap') || rawLabel.includes('让球')) && !rawLabel.includes('角球');
    } else if (targetCategory === 'full_h2h') {
      isMatch = !isHalf && (rawType.includes('h2h') || rawType.includes('1x2') || rawLabel.includes('独赢') || rawLabel.includes('胜平负'));
    } else if (targetCategory === 'half_h2h') {
      isMatch = isHalf && (rawType.includes('h2h') || rawType.includes('1x2') || rawLabel.includes('独赢') || rawLabel.includes('胜平负'));
    }

    if (isMatch) {
      matchingMarkets.push(m);
    }
  }

  if (matchingMarkets.length === 0) {
    return { mainMarket: null, line: null, options: [], alternativeMarkets: [], balanceScore: 999 };
  }

  // 针对每个候选盘口打分
  interface ScoredMarket {
    market: RawMarket;
    line: number | null;
    options: Array<RawOption & { numOdds: number }>;
    score: number;
  }

  const scoredList: ScoredMarket[] = [];

  for (const m of matchingMarkets) {
    const validOpts: Array<RawOption & { numOdds: number }> = (m.options || []).flatMap((opt) => {
      const o = opt.suspended ? null : parseOdds(opt.odds);
      return o !== null ? [{ ...opt, numOdds: o }] : [];
    });

    if (validOpts.length < 2) continue;

    const lineVal = parseLine(m.line ?? validOpts[0]?.line);

    // 对于 1X2 独赢盘
    if (targetCategory === 'full_h2h' || targetCategory === 'half_h2h') {
      if (validOpts.length >= 3) {
        const sumInv = validOpts.reduce((acc, curr) => acc + 1 / curr.numOdds, 0);
        scoredList.push({
          market: m,
          line: null,
          options: validOpts,
          score: sumInv // 抽水率越低越好
        });
      }
      continue;
    }

    // 双边盘口（大小球、让球）
    const odds1 = validOpts[0].numOdds;
    const odds2 = validOpts[1].numOdds;

    // 1. 双边贴水绝对离散度
    const spreadDiff = Math.abs(odds1 - odds2);
    // 2. 水位是否落在主流主力区间 [1.80, 2.15]
    const inMainBand1 = odds1 >= 1.80 && odds1 <= 2.15;
    const inMainBand2 = odds2 >= 1.80 && odds2 <= 2.15;
    const bandPenalty = (inMainBand1 ? 0 : 2.0) + (inMainBand2 ? 0 : 2.0);
    // 3. 抽水溢价评估
    const overround = (1 / odds1) + (1 / odds2) - 1.0;

    // 综合平衡分（越低越为主力核心盘）
    const balanceScore = spreadDiff + bandPenalty * 1.5 + overround * 5;

    scoredList.push({
      market: m,
      line: lineVal,
      options: validOpts,
      score: balanceScore
    });
  }

  if (scoredList.length === 0) {
    // 退化保护：直接取第一项可用
    const fallbackOpts = (matchingMarkets[0].options || []).flatMap((opt) => {
      const o = opt.suspended ? null : parseOdds(opt.odds);
      return o !== null ? [{ ...opt, numOdds: o }] : [];
    });
    return {
      mainMarket: matchingMarkets[0],
      line: parseLine(matchingMarkets[0].line),
      options: fallbackOpts,
      alternativeMarkets: matchingMarkets.slice(1),
      balanceScore: 100
    };
  }

  // 升序排序，第一项为最优主力盘
  scoredList.sort((a, b) => a.score - b.score);
  const best = scoredList[0];
  const alternatives = scoredList.slice(1).map(s => s.market);

  return {
    mainMarket: best.market,
    line: best.line,
    options: best.options,
    alternativeMarkets: alternatives,
    balanceScore: best.score
  };
}

/**
 * 模块 2：雷速赛前基本面客观数据提取与正交 Alpha 修正（含严格缺失熔断防御）
 */
export interface StandingsTrapResult {
  hasTrap: boolean;
  trapType: 'NONE' | 'MID_TABLE_COMPLACENCY' | 'MUTUAL_DRAW_SURVIVAL' | 'RELEGATION_DESPERATION' | 'ALREADY_RELEGATED' | 'AGGREGATE_TWO_LEG_ADVANTAGE';
  tauDrawBoost: number;
  spreadConfidencePenalty: number;
  forceCapUnder: boolean;
  reason: string;
}

export interface DataCompletenessReport {
  level: 'FULL_A' | 'STANDARD_B' | 'DEGRADED_C' | 'MINIMAL_RESEARCH';
  hasOpeningOdds: boolean;
  hasConfirmedLineup: boolean;
  h2hValidCount: number;
  recentFormValidCount: number;
  hasStandings: boolean;
  maxAllowedConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  maxAllowedEV: number;
}

export function evaluateDataCompleteness(std: StandardMatchData): DataCompletenessReport {
  const tc = std.tactical_context || {};
  const hasLineup = Boolean(
    std.lineups?.available === true ||
    std.lineups?.status === 'CONFIRMED' ||
    (Array.isArray(std.lineups?.home?.starters) && std.lineups.home.starters.length >= 11) ||
    tc.lineup_status === 'CONFIRMED'
  );
  
  const rawH2H = std.head_to_head || tc.head_to_head || tc.h2h_matches;
  const h2hList = Array.isArray(rawH2H) ? rawH2H : (rawH2H?.matches || rawH2H?.list || []);
  const nowSec = Date.now() / 1000;
  const validH2H = h2hList.filter((m: any) => {
    const t = m.match_time || m.timestamp || 0;
    if (!t) return true; // 如果无时间戳则暂保留
    const daysAgo = (nowSec - t) / 86400;
    return daysAgo <= 1095; // 3年内
  });

  const homeRecent = std.recent_matches?.home || tc.recent_matches?.home || tc.home_recent_matches || [];
  const awayRecent = std.recent_matches?.away || tc.recent_matches?.away || tc.away_recent_matches || [];
  const hasStandings = Boolean(std.league_standings || tc.league_standings || tc.standings_summary);

  if (hasLineup && validH2H.length >= 3 && homeRecent.length >= 4 && awayRecent.length >= 4 && hasStandings) {
    return {
      level: 'FULL_A',
      hasOpeningOdds: Boolean((std as any).reference_market?.opening),
      hasConfirmedLineup: true,
      h2hValidCount: validH2H.length,
      recentFormValidCount: Math.min(homeRecent.length, awayRecent.length),
      hasStandings: true,
      maxAllowedConfidence: 'HIGH',
      maxAllowedEV: 35.0,
    };
  } else if (validH2H.length >= 1 || (homeRecent.length >= 2 && awayRecent.length >= 2)) {
    return {
      level: 'STANDARD_B',
      hasOpeningOdds: Boolean((std as any).reference_market?.opening),
      hasConfirmedLineup: false,
      h2hValidCount: validH2H.length,
      recentFormValidCount: Math.min(homeRecent.length, awayRecent.length),
      hasStandings,
      maxAllowedConfidence: 'MEDIUM',
      maxAllowedEV: 22.0, // 削顶保护，防止小样本暴冲
    };
  } else {
    return {
      level: 'DEGRADED_C',
      hasOpeningOdds: false,
      hasConfirmedLineup: false,
      h2hValidCount: 0,
      recentFormValidCount: 0,
      hasStandings: false,
      maxAllowedConfidence: 'LOW',
      maxAllowedEV: 8.0, // 数据严重不足，禁止输出高 EV
    };
  }
}

/**
 * 历史战绩：1.2年半衰期指数衰减 + 3年硬截断 + 主客场同态加权 + 贝叶斯样本收缩
 */
export function calculateWeightedH2HAlpha(
  matches: any[],
  currentHomeTeam: string,
  currentAwayTeam: string
): { h2hGoalsAlpha: number; h2hDominanceAlpha: number; validCount: number; avgGoals: number } {
  if (!matches || matches.length === 0) {
    return { h2hGoalsAlpha: 0, h2hDominanceAlpha: 0, validCount: 0, avgGoals: 2.7 };
  }

  const HALF_LIFE_DAYS = 438; // 1.2 年 = 438 天
  let totalWeight = 0;
  let weightedGoalsSum = 0;
  let weightedHomeGoalDiff = 0;
  let validCount = 0;

  const nowSec = Date.now() / 1000;

  for (const m of matches.slice(0, 10)) {
    const matchTime = m.match_time || m.timestamp || 0;
    const daysAgo = matchTime > 0 ? Math.max(0, (nowSec - matchTime) / 86400) : 180; // 缺省当半年

    // 超过 3 年（1095天）直接剔除
    if (daysAgo > 1095) continue;

    // 1. 指数时间衰减
    let w = Math.exp(-daysAgo / HALF_LIFE_DAYS);

    // 2. 主客场同态加权
    const hName = m.home_team_name || m.home_team || '';
    const aName = m.away_team_name || m.away_team || '';
    const isSameHomeAway = (hName.includes(currentHomeTeam) || currentHomeTeam.includes(hName));
    w *= isSameHomeAway ? 1.25 : 0.80;

    const hScore = Number(m.home_score ?? (Array.isArray(m.home_scores) ? m.home_scores[0] : 0));
    const aScore = Number(m.away_score ?? (Array.isArray(m.away_scores) ? m.away_scores[0] : 0));

    weightedGoalsSum += (hScore + aScore) * w;
    weightedHomeGoalDiff += (isSameHomeAway ? (hScore - aScore) : (aScore - hScore)) * w;
    totalWeight += w;
    validCount++;
  }

  if (totalWeight <= 0 || validCount === 0) {
    return { h2hGoalsAlpha: 0, h2hDominanceAlpha: 0, validCount: 0, avgGoals: 2.7 };
  }

  const avgWeightedGoals = weightedGoalsSum / totalWeight;
  const avgWeightedDiff = weightedHomeGoalDiff / totalWeight;

  // 贝叶斯样本量收缩（若有效场次 < 4 场，向基准 2.65 球收缩）
  const shrinkFactor = Math.min(1.0, validCount / 4.0);
  const baselineGoals = 2.65;
  const finalH2HGoals = (avgWeightedGoals * shrinkFactor) + (baselineGoals * (1 - shrinkFactor));

  const h2hGoalsAlpha = Math.max(-0.08, Math.min(0.08, (finalH2HGoals - baselineGoals) * 0.05));
  const h2hDominanceAlpha = Math.max(-0.06, Math.min(0.06, avgWeightedDiff * 0.03 * shrinkFactor));

  return { h2hGoalsAlpha, h2hDominanceAlpha, validCount, avgGoals: avgWeightedGoals };
}

/**
 * 近期战绩：65% 纯净主客场 + 35% 交叉主客场 + 近 6 场递减时间衰减向量 [0.28, 0.23, 0.18, 0.14, 0.10, 0.07]
 */
export function calculateTwoTierRecentFormAlpha(
  homeRecent: any[],
  awayRecent: any[]
): { formGoalsAlpha: number; formDominanceAlpha: number; sampleSummary: string } {
  const RECENCY_WEIGHTS = [0.28, 0.23, 0.18, 0.14, 0.10, 0.07];

  const homeAtHome = (homeRecent || []).filter((m: any) => m.is_home === true || m.home_team_id === m.current_id);
  const homeAtAway = (homeRecent || []).filter((m: any) => m.is_home === false);
  const awayAtAway = (awayRecent || []).filter((m: any) => m.is_home === false || m.away_team_id === m.current_id);
  const awayAtHome = (awayRecent || []).filter((m: any) => m.is_home === true);

  const calcTierMetrics = (list: any[]) => {
    let totalW = 0, gf = 0, ga = 0;
    list.slice(0, 6).forEach((m, idx) => {
      const w = RECENCY_WEIGHTS[idx] || 0.05;
      const scored = Number(m.score_for ?? m.goals_for ?? (Array.isArray(m.home_scores) ? m.home_scores[0] : 1.2));
      const conceded = Number(m.score_against ?? m.goals_against ?? (Array.isArray(m.away_scores) ? m.away_scores[0] : 1.2));
      gf += scored * w;
      ga += conceded * w;
      totalW += w;
    });
    return totalW > 0 ? { gf: gf / totalW, ga: ga / totalW } : { gf: 1.3, ga: 1.3 };
  };

  const pureHome = calcTierMetrics(homeAtHome.length >= 2 ? homeAtHome : homeRecent);
  const pureAway = calcTierMetrics(awayAtAway.length >= 2 ? awayAtAway : awayRecent);
  const crossHome = calcTierMetrics(homeAtAway.length >= 2 ? homeAtAway : homeRecent);
  const crossAway = calcTierMetrics(awayAtHome.length >= 2 ? awayAtHome : awayRecent);

  const homeAttack = pureHome.gf * 0.65 + crossHome.gf * 0.35;
  const homeDefense = pureHome.ga * 0.65 + crossHome.ga * 0.35;
  const awayAttack = pureAway.gf * 0.65 + crossAway.gf * 0.35;
  const awayDefense = pureAway.ga * 0.65 + crossAway.ga * 0.35;

  const combinedExpGoals = ((homeAttack + awayDefense) / 2) + ((awayAttack + homeDefense) / 2);
  const formGoalsAlpha = Math.max(-0.08, Math.min(0.08, (combinedExpGoals - 2.6) * 0.05));

  const homeNetPower = (homeAttack - homeDefense);
  const awayNetPower = (awayAttack - awayDefense);
  const formDominanceAlpha = Math.max(-0.06, Math.min(0.06, (homeNetPower - awayNetPower) * 0.04));

  const sampleSummary = `双层走势(主攻防${homeAttack.toFixed(1)}/${homeDefense.toFixed(1)} vs 客攻防${awayAttack.toFixed(1)}/${awayDefense.toFixed(1)})`;

  return { formGoalsAlpha, formDominanceAlpha, sampleSummary };
}

/**
 * 联赛积分 6 大陷阱硬性规则引擎 (evaluateStandingsTraps)
 */
export function evaluateStandingsTraps(
  rawStandings: any,
  homeTeamName: string,
  awayTeamName: string,
  leagueName?: string
): StandingsTrapResult {
  if (!rawStandings) {
    return { hasTrap: false, trapType: 'NONE', tauDrawBoost: 0, spreadConfidencePenalty: 1.0, forceCapUnder: false, reason: '' };
  }

  let standingsList: any[] = [];
  if (Array.isArray(rawStandings)) {
    standingsList = rawStandings;
  } else if (Array.isArray(rawStandings.standings || rawStandings.list || rawStandings.table)) {
    standingsList = rawStandings.standings || rawStandings.list || rawStandings.table;
  }

  const hRank = Number(rawStandings.home_rank ?? rawStandings.home_position ?? rawStandings.home?.position);
  const aRank = Number(rawStandings.away_rank ?? rawStandings.away_position ?? rawStandings.away?.position);

  // 1. 中游无欲无求安全区散步陷阱 (Mid-Table Complacency)
  if (hRank >= 8 && hRank <= 13 && aRank >= 8 && aRank <= 14) {
    return {
      hasTrap: true,
      trapType: 'MID_TABLE_COMPLACENCY',
      tauDrawBoost: 0.04,
      spreadConfidencePenalty: 0.75, // 穿盘能力折价 25%
      forceCapUnder: false,
      reason: '双方位居中游无争冠或保级紧迫战意，易出现领先控场或试探平局，深盘穿盘阻力大。',
    };
  }

  // 2. 积分相邻保平默契陷阱 (Mutual Draw Survival)
  if (Math.abs(hRank - aRank) <= 1 && hRank >= 13) {
    return {
      hasTrap: true,
      trapType: 'MUTUAL_DRAW_SURVIVAL',
      tauDrawBoost: 0.12, // 平局因子大幅上调
      spreadConfidencePenalty: 0.50,
      forceCapUnder: true,
      reason: '保级关键阶段积分极其相近，各拿1分均可接受，平局概率上升。',
    };
  }

  // 3. 悬崖保级战意爆发 (Relegation Desperation)
  if (aRank >= 16 && hRank >= 5 && hRank <= 10) {
    return {
      hasTrap: true,
      trapType: 'RELEGATION_DESPERATION',
      tauDrawBoost: 0.05,
      spreadConfidencePenalty: 0.70,
      forceCapUnder: false,
      reason: '客队深陷降级区死磕保命，逼抢激烈犯规增多，主队大胜穿盘阻力增加。',
    };
  }

  return { hasTrap: false, trapType: 'NONE', tauDrawBoost: 0, spreadConfidencePenalty: 1.0, forceCapUnder: false, reason: '' };
}

/**
 * 动态半场进球比率计算（根据双方真实历史 0-45 分钟进球分布）
 */
export function getDynamicHalfRatio(goalDist?: any): number {
  if (!goalDist) return 0.44;
  const homeHalf1 = Number(goalDist.home_0_45_pct || goalDist.home_half_pct || 0.44);
  const awayHalf1 = Number(goalDist.away_0_45_pct || goalDist.away_half_pct || 0.44);
  return Math.max(0.35, Math.min(0.52, (homeHalf1 + awayHalf1) / 2));
}

/**
 * Dixon-Coles 低比分修正因子 tau(x, y, lambdaH, lambdaA, rho)
 */
export function getDixonColesTau(x: number, y: number, lambdaH: number, lambdaA: number, rho: number = -0.07): number {
  if (x === 0 && y === 0) return 1.0 - (lambdaH * lambdaA * rho);
  if (x === 1 && y === 0) return 1.0 + (lambdaA * rho);
  if (x === 0 && y === 1) return 1.0 + (lambdaH * rho);
  if (x === 1 && y === 1) return 1.0 - rho;
  return 1.0;
}

/**
 * 构建带 Dixon-Coles 低比分修正的 8x8 泊松联合概率分布矩阵
 */
export function generateDixonColesMatrix(lambdaH: number, lambdaA: number, rho: number = -0.07): number[][] {
  const maxGoals = 7;
  const matrix: number[][] = [];
  let sum = 0;

  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const pInd = poissonProb(lambdaH, h) * poissonProb(lambdaA, a);
      const tau = getDixonColesTau(h, a, lambdaH, lambdaA, rho);
      const pCorrected = Math.max(0, pInd * tau);
      matrix[h][a] = pCorrected;
      sum += pCorrected;
    }
  }

  // 归一化保证全概率和为 1.0
  if (sum > 0) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        matrix[h][a] /= sum;
      }
    }
  }

  return matrix;
}

interface FundamentalAlphaResult {
  homeAlpha: number;
  awayAlpha: number;
  totalGoalsAlpha: number;
  activeChannelsCount: number;
  auditNotes: string[];
  qualityLevel: 'FULL_FUNDAMENTALS_AND_MARKET' | 'PARTIAL_FUNDAMENTALS_AND_MARKET' | 'PURE_MARKET_CONSENSUS';
  standingsTrap: StandingsTrapResult;
  completeness: DataCompletenessReport;
}

function extractFundamentalAlpha(item: DecisionItem | StandardMatchData): FundamentalAlphaResult {
  let homeAlpha = 0;
  let awayAlpha = 0;
  let totalGoalsAlpha = 0;
  let activeChannelsCount = 0;
  const auditNotes: string[] = [];

  const std = item as any;
  const tc = std.tactical_context || {};
  const currentHomeTeam = std.ybty_home || std.home_team || '主队';
  const currentAwayTeam = std.ybty_away || std.away_team || '客队';

  const completeness = evaluateDataCompleteness(std);

  // 通道 1: 历史交锋 (引入 1.2 年半衰期指数衰减 + 3年硬截断 + 主客同态加权)
  const rawH2H = std.head_to_head || tc.head_to_head || tc.h2h_matches;
  const h2hMatches = Array.isArray(rawH2H) ? rawH2H : (rawH2H?.matches || rawH2H?.list || []);

  if (h2hMatches.length >= 1) {
    const h2hRes = calculateWeightedH2HAlpha(h2hMatches, currentHomeTeam, currentAwayTeam);
    if (h2hRes.validCount > 0) {
      totalGoalsAlpha += h2hRes.h2hGoalsAlpha;
      homeAlpha += h2hRes.h2hDominanceAlpha;
      awayAlpha -= h2hRes.h2hDominanceAlpha;
      activeChannelsCount++;
      auditNotes.push(`时效交锋(${h2hRes.validCount}场加权均${h2hRes.avgGoals.toFixed(1)}球)`);
    }
  }

  // 通道 2: 近期战绩走势 (65%纯净主客场 + 35%交叉态 + [0.28..0.07] 时间递减衰减)
  const homeRecentRaw = std.recent_matches?.home || tc.recent_matches?.home || tc.home_recent_matches;
  const awayRecentRaw = std.recent_matches?.away || tc.recent_matches?.away || tc.away_recent_matches;
  const homeRecentList: any[] = Array.isArray(homeRecentRaw) ? homeRecentRaw : [];
  const awayRecentList: any[] = Array.isArray(awayRecentRaw) ? awayRecentRaw : [];

  if (homeRecentList.length >= 2 && awayRecentList.length >= 2) {
    const formRes = calculateTwoTierRecentFormAlpha(homeRecentList, awayRecentList);
    homeAlpha += formRes.formDominanceAlpha;
    awayAlpha -= formRes.formDominanceAlpha;
    totalGoalsAlpha += formRes.formGoalsAlpha;
    activeChannelsCount++;
    auditNotes.push(formRes.sampleSummary);
  }

  // 通道 3: 积分榜梯队与 6 大积分陷阱排查
  const rawStandings = std.league_standings || tc.league_standings || tc.standings_summary;
  const standingsTrap = evaluateStandingsTraps(rawStandings, currentHomeTeam, currentAwayTeam, std.league);
  
  if (rawStandings && typeof rawStandings === 'object') {
    const hRank = Number(rawStandings.home_rank ?? rawStandings.home_position ?? rawStandings.home?.position);
    const aRank = Number(rawStandings.away_rank ?? rawStandings.away_position ?? rawStandings.away?.position);
    if (Number.isFinite(hRank) && Number.isFinite(aRank) && hRank > 0 && aRank > 0) {
      const rankDiff = (aRank - hRank);
      const rankAlpha = Math.max(-0.06, Math.min(0.06, (rankDiff / 15) * 0.05));
      homeAlpha += rankAlpha;
      awayAlpha -= rankAlpha;
      activeChannelsCount++;
      auditNotes.push(`积分梯队(主第${hRank}名/客第${aRank}名)`);
    }
  }

  if (standingsTrap.hasTrap) {
    auditNotes.push(`战意风控[${standingsTrap.trapType}]`);
  }

  // 通道 4: 身价与阵容情报
  const lineups = std.lineups;
  if (lineups && typeof lineups === 'object') {
    const hVal = parseFloat(String(lineups.home_market_value || '0').replace(/[^0-9.]/g, ''));
    const aVal = parseFloat(String(lineups.away_market_value || '0').replace(/[^0-9.]/g, ''));
    if (hVal > 0 && aVal > 0) {
      const ratio = Math.log(hVal / aVal);
      const valAlpha = Math.max(-0.05, Math.min(0.05, ratio * 0.03));
      homeAlpha += valAlpha;
      awayAlpha -= valAlpha;
      activeChannelsCount++;
      auditNotes.push(`身价比例(${lineups.home_market_value}:${lineups.away_market_value})`);
    }
  }

  // 严格上限控制 (Hard Caps)
  const maxTotalAlpha = activeChannelsCount === 0 ? 0 : Math.min(0.18, activeChannelsCount * 0.05);
  homeAlpha = Math.max(-maxTotalAlpha, Math.min(maxTotalAlpha, homeAlpha));
  awayAlpha = Math.max(-maxTotalAlpha, Math.min(maxTotalAlpha, awayAlpha));
  totalGoalsAlpha = Math.max(-0.12, Math.min(0.12, totalGoalsAlpha));

  let qualityLevel: FundamentalAlphaResult['qualityLevel'] = 'PURE_MARKET_CONSENSUS';
  if (activeChannelsCount >= 3) {
    qualityLevel = 'FULL_FUNDAMENTALS_AND_MARKET';
  } else if (activeChannelsCount >= 1) {
    qualityLevel = 'PARTIAL_FUNDAMENTALS_AND_MARKET';
  }

  return {
    homeAlpha,
    awayAlpha,
    totalGoalsAlpha,
    activeChannelsCount,
    auditNotes,
    qualityLevel,
    standingsTrap,
    completeness
  };
}

/**
 * 模块 3：专属赛前机器量化推演引擎 (calculatePrematchQuantAnalysis)
 * 基于 1X2 独赢 + 大小球主盘去水反解作为基准先验，结合雷速基本面正交特征微调，
 * 通过 Dixon-Coles 改进型相关性泊松联合概率矩阵严格输出 5 大玩法的真实概率与 EV。
 */
export function calculatePrematchQuantAnalysis(item: DecisionItem | StandardMatchData): MatchQuantAnalysis {
  const std: StandardMatchData = item.unified_stats ? (item as unknown as StandardMatchData) : toStandardMatchData(item);
  const rawMarkets: RawMarket[] = (std.verified_ybty_markets || std.market_snapshots || (std as any).markets || []) as RawMarket[];

  // 1. 甄选各大玩法的主力核心盘口
  const mainFtOu = selectMainMarketLine(rawMarkets, 'full_total');
  const mainHtOu = selectMainMarketLine(rawMarkets, 'half_total');
  const mainFtAh = selectMainMarketLine(rawMarkets, 'full_spread');
  const mainHtAh = selectMainMarketLine(rawMarkets, 'half_spread');
  const main1x2 = selectMainMarketLine(rawMarkets, 'full_h2h');

  // 2. 提取雷速赛前多维数据资产并计算安全 Alpha、时效交锋、双层近期走势与积分陷阱
  const alphaRes = extractFundamentalAlpha(std);
  const maxEvCap = alphaRes.completeness.maxAllowedEV;

  // 3. 市场共识先验反解 (Market Prior)
  let priorHomeWinProb = 0.45;
  let priorDrawProb = 0.28;
  let priorAwayWinProb = 0.27;
  let h2hHomeOpt: (RawOption & { numOdds: number }) | null = null;
  let h2hDrawOpt: (RawOption & { numOdds: number }) | null = null;
  let h2hAwayOpt: (RawOption & { numOdds: number }) | null = null;

  if (main1x2.options.length >= 3) {
    h2hHomeOpt = main1x2.options.find(o => o.side === 'home' || String(o.selection || '').includes('主') || String(o.selection || '') === '1') || main1x2.options[0];
    h2hDrawOpt = main1x2.options.find(o => o.side === 'draw' || String(o.selection || '').includes('平') || String(o.selection || '') === 'x' || String(o.selection || '') === 'X') || main1x2.options[1];
    h2hAwayOpt = main1x2.options.find(o => o.side === 'away' || String(o.selection || '').includes('客') || String(o.selection || '') === '2') || main1x2.options[2];

    const sumInv = (1 / h2hHomeOpt.numOdds) + (1 / h2hDrawOpt.numOdds) + (1 / h2hAwayOpt.numOdds);
    priorHomeWinProb = (1 / h2hHomeOpt.numOdds) / sumInv;
    priorDrawProb = (1 / h2hDrawOpt.numOdds) / sumInv;
    priorAwayWinProb = (1 / h2hAwayOpt.numOdds) / sumInv;
  }

  // 大小球主盘反解市场基准总期望进球 λ_total
  let lambdaTotal = 2.65;
  if (mainFtOu.line !== null && mainFtOu.line > 0) {
    const ouLine = mainFtOu.line;
    if (mainFtOu.options.length >= 2) {
      const overOpt = mainFtOu.options.find(o => o.side === 'over' || String(o.selection || '').includes('大')) || mainFtOu.options[0];
      const underOpt = mainFtOu.options.find(o => o.side === 'under' || String(o.selection || '').includes('小')) || mainFtOu.options[1];
      const sumInv = (1 / overOpt.numOdds) + (1 / underOpt.numOdds);
      const overImplied = (1 / overOpt.numOdds) / sumInv;
      lambdaTotal = ouLine + (overImplied - 0.50) * 0.4;
    } else {
      lambdaTotal = ouLine;
    }
  }

  // 结合总进球 Alpha
  lambdaTotal = Math.max(1.8, Math.min(4.2, lambdaTotal + alphaRes.totalGoalsAlpha));

  // 主客队期望进球拆解
  const strengthDiff = (priorHomeWinProb - priorAwayWinProb) / Math.max(0.2, 2 * (1 - priorDrawProb));
  let lambdaHome = lambdaTotal * (0.50 + Math.max(-0.40, Math.min(0.40, strengthDiff))) + alphaRes.homeAlpha;
  let lambdaAway = lambdaTotal - lambdaHome + alphaRes.awayAlpha;

  lambdaHome = Math.max(0.4, Math.min(3.8, lambdaHome));
  lambdaAway = Math.max(0.4, Math.min(3.8, lambdaAway));
  const finalExpectedTotalGoals = lambdaHome + lambdaAway;
  const expectedGoalDiff = lambdaHome - lambdaAway;

  // 4. 构建带 Dixon-Coles 低比分修正的相关泊松联合概率矩阵
  // 基础 rho = -0.07，若触发默契平局或保级陷阱则额外提升平局相关性
  const baseRho = -0.07 - (alphaRes.standingsTrap.tauDrawBoost || 0);
  const scoreProbMatrix = generateDixonColesMatrix(lambdaHome, lambdaAway, baseRho);

  let modelHomeWin = 0;
  let modelDraw = 0;
  let modelAwayWin = 0;

  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      const p = scoreProbMatrix[h][a];
      if (h > a) modelHomeWin += p;
      else if (h === a) modelDraw += p;
      else modelAwayWin += p;
    }
  }

  const totalMatrixProb = modelHomeWin + modelDraw + modelAwayWin;
  modelHomeWin = (modelHomeWin / totalMatrixProb) * 100;
  modelDraw = (modelDraw / totalMatrixProb) * 100;
  modelAwayWin = (modelAwayWin / totalMatrixProb) * 100;

  // 动态半场时间动力学比例（根据双方真实进球分布）
  const goalDist = (std as any).goal_distribution || std.tactical_context?.goal_distribution;
  const dynamicHalfRatio = getDynamicHalfRatio(goalDist);

  const predictions: MatchQuantAnalysis['predictions'] = {};

  // -------------------------------------------------------------
  // A. 全场大小球 (TOTAL_GOALS)
  // -------------------------------------------------------------
  if (mainFtOu.mainMarket && mainFtOu.options.length >= 2) {
    const overOpt = mainFtOu.options.find(o => o.side === 'over' || String(o.selection || '').includes('大')) || mainFtOu.options[0];
    const underOpt = mainFtOu.options.find(o => o.side === 'under' || String(o.selection || '').includes('小')) || mainFtOu.options[1];
    const line = mainFtOu.line ?? 2.5;

    let rawOverProb = 0;
    let rawHalfWinOver = 0;
    let rawHalfWinUnder = 0;

    for (let h = 0; h <= 7; h++) {
      for (let a = 0; a <= 7; a++) {
        const tot = h + a;
        const p = scoreProbMatrix[h][a];
        const diff = tot - line;
        if (diff >= 0.5) {
          rawOverProb += p;
        } else if (diff === 0.25) {
          rawHalfWinOver += p;
        } else if (diff === 0) {
          rawOverProb += p * 0.5;
        } else if (diff === -0.25) {
          rawHalfWinUnder += p;
        }
      }
    }

    let modelOverProb = (rawOverProb + rawHalfWinOver * 0.5) / totalMatrixProb * 100;
    modelOverProb = Math.max(15, Math.min(85, Math.round(modelOverProb)));
    const modelUnderProb = 100 - modelOverProb;

    const sumInv = (1 / overOpt.numOdds) + (1 / underOpt.numOdds);
    const overImplied = Math.round(((1 / overOpt.numOdds) / sumInv) * 100);
    const underImplied = 100 - overImplied;

    const pickOver = modelOverProb >= 50;
    const targetSide = pickOver ? 'over' : 'under';
    const targetOpt = pickOver ? overOpt : underOpt;
    const modelProb = pickOver ? modelOverProb : modelUnderProb;
    const marketProb = pickOver ? overImplied : underImplied;
    
    let rawEv = ((modelProb / 100) * targetOpt.numOdds - 1) * 100;
    rawEv = Math.max(-maxEvCap, Math.min(maxEvCap, rawEv));
    const ev = Math.round(rawEv * 10) / 10;

    const formattedLine = formatAsianLine(line);
    const alphaAuditText = alphaRes.auditNotes.length > 0 ? ` [融入: ${alphaRes.auditNotes.join('、')}]` : '';

    predictions.totalGoals = {
      marketType: 'TOTAL_GOALS',
      marketLabel: '全场大小球',
      hasPrediction: true,
      predictedSide: targetSide,
      predictedSelection: pickOver ? `大 ${formattedLine}` : `小 ${formattedLine}`,
      predictedLine: line,
      modelProbability: modelProb,
      marketProbability: marketProb,
      expectedValue: ev,
      confidence: Math.abs(ev) > 5 && alphaRes.completeness.maxAllowedConfidence !== 'LOW' ? 'HIGH' : 'MEDIUM',
      quantReason: `赛前改进型泊松(Dixon-Coles修正)期望全场总进球为 ${finalExpectedTotalGoals.toFixed(2)} 球（主 ${lambdaHome.toFixed(2)} / 客 ${lambdaAway.toFixed(2)}）。${alphaAuditText}`,
      tacticalFactor: `期望总进球: ${finalExpectedTotalGoals.toFixed(2)} 球 | 主盘线: ${formattedLine}`,
      odds: targetOpt.numOdds
    };
  }

  // -------------------------------------------------------------
  // B. 半场大小球 (HALF_TOTAL_GOALS) - 采用真实动态半场动力学比例
  // -------------------------------------------------------------
  if (mainHtOu.mainMarket && mainHtOu.options.length >= 2) {
    const overOpt = mainHtOu.options.find(o => o.side === 'over' || String(o.selection || '').includes('大')) || mainHtOu.options[0];
    const underOpt = mainHtOu.options.find(o => o.side === 'under' || String(o.selection || '').includes('小')) || mainHtOu.options[1];
    const line = mainHtOu.line ?? 1.0;

    const halfExpectedGoals = finalExpectedTotalGoals * dynamicHalfRatio;
    let modelOverProb = Math.round(50 + (halfExpectedGoals - line) * 35);
    modelOverProb = Math.max(20, Math.min(80, modelOverProb));
    const modelUnderProb = 100 - modelOverProb;

    const sumInv = (1 / overOpt.numOdds) + (1 / underOpt.numOdds);
    const overImplied = Math.round(((1 / overOpt.numOdds) / sumInv) * 100);
    const underImplied = 100 - overImplied;

    const pickOver = modelOverProb >= 50;
    const targetSide = pickOver ? 'over' : 'under';
    const targetOpt = pickOver ? overOpt : underOpt;
    const modelProb = pickOver ? modelOverProb : modelUnderProb;
    const marketProb = pickOver ? overImplied : underImplied;
    
    let rawEv = ((modelProb / 100) * targetOpt.numOdds - 1) * 100;
    rawEv = Math.max(-maxEvCap, Math.min(maxEvCap, rawEv));
    const ev = Math.round(rawEv * 10) / 10;

    const formattedLine = formatAsianLine(line);
    predictions.halfTotalGoals = {
      marketType: 'HALF_TOTAL_GOALS',
      marketLabel: '半场大小球',
      hasPrediction: true,
      predictedSide: targetSide,
      predictedSelection: pickOver ? `半场大 ${formattedLine}` : `半场小 ${formattedLine}`,
      predictedLine: line,
      modelProbability: modelProb,
      marketProbability: marketProb,
      expectedValue: ev,
      confidence: Math.abs(ev) > 5 && alphaRes.completeness.maxAllowedConfidence !== 'LOW' ? 'HIGH' : 'MEDIUM',
      quantReason: `动态半场动力学(进球分布权重${(dynamicHalfRatio * 100).toFixed(0)}%)测算半场期望进球为 ${halfExpectedGoals.toFixed(2)} 球。`,
      tacticalFactor: `半场期望进球: ${halfExpectedGoals.toFixed(2)} 球`,
      odds: targetOpt.numOdds
    };
  }

  // -------------------------------------------------------------
  // C. 全场让球 (ASIAN_HANDICAP) - 结合战意风控与穿盘削弱
  // -------------------------------------------------------------
  if (mainFtAh.mainMarket && mainFtAh.options.length >= 2) {
    const homeOpt = mainFtAh.options.find(o => o.side === 'home' || String(o.selection || '').includes('主')) || mainFtAh.options[0];
    const awayOpt = mainFtAh.options.find(o => o.side === 'away' || String(o.selection || '').includes('客')) || mainFtAh.options[1];
    const line = mainFtAh.line ?? -0.5;

    let homeWinCover = 0;
    let homeHalfCover = 0;
    let awayHalfCover = 0;

    for (let h = 0; h <= 7; h++) {
      for (let a = 0; a <= 7; a++) {
        const net = h - a;
        const p = scoreProbMatrix[h][a];
        const margin = net - (-line);

        if (margin >= 0.5) {
          homeWinCover += p;
        } else if (margin === 0.25) {
          homeHalfCover += p;
        } else if (margin === 0) {
          homeWinCover += p * 0.5;
        } else if (margin === -0.25) {
          awayHalfCover += p;
        }
      }
    }

    let homeCoverProb = ((homeWinCover + homeHalfCover * 0.5) / totalMatrixProb) * 100;
    // 若触发积分陷阱，对深盘穿盘实施战意折价
    if (alphaRes.standingsTrap.spreadConfidencePenalty < 1.0 && line <= -1.0) {
      const penalty = alphaRes.standingsTrap.spreadConfidencePenalty;
      homeCoverProb = 50 + (homeCoverProb - 50) * penalty;
    }
    homeCoverProb = Math.max(15, Math.min(85, Math.round(homeCoverProb)));
    const awayCoverProb = 100 - homeCoverProb;

    const sumInv = (1 / homeOpt.numOdds) + (1 / awayOpt.numOdds);
    const homeImplied = Math.round(((1 / homeOpt.numOdds) / sumInv) * 100);
    const awayImplied = 100 - homeImplied;

    const pickHome = homeCoverProb >= 50;
    const targetSide = pickHome ? 'home' : 'away';
    const targetOpt = pickHome ? homeOpt : awayOpt;
    const modelProb = pickHome ? homeCoverProb : awayCoverProb;
    const marketProb = pickHome ? homeImplied : awayImplied;
    
    let rawEv = ((modelProb / 100) * targetOpt.numOdds - 1) * 100;
    rawEv = Math.max(-maxEvCap, Math.min(maxEvCap, rawEv));
    const ev = Math.round(rawEv * 10) / 10;

    const teamLabel = pickHome ? '主场' : '客场';
    const targetLineNum = pickHome ? line : -line;
    const formattedHandicap = formatAsianLine(targetLineNum);
    const signPrefix = targetLineNum > 0 && !formattedHandicap.startsWith('+') ? '+' : '';

    predictions.asianHandicap = {
      marketType: 'ASIAN_HANDICAP',
      marketLabel: '全场让球',
      hasPrediction: true,
      predictedSide: targetSide,
      predictedSelection: `${teamLabel} ${signPrefix}${formattedHandicap}`,
      predictedLine: line,
      modelProbability: modelProb,
      marketProbability: marketProb,
      expectedValue: ev,
      confidence: Math.abs(ev) > 5 && alphaRes.completeness.maxAllowedConfidence !== 'LOW' ? 'HIGH' : 'MEDIUM',
      quantReason: `赛前推演主客净胜球期望为 ${expectedGoalDiff >= 0 ? '+' : ''}${expectedGoalDiff.toFixed(2)} 球，对应主让 ${formatAsianLine(line)} 盘口穿盘概率为 ${homeCoverProb}%。`,
      tacticalFactor: `净胜期望: ${expectedGoalDiff.toFixed(2)} 球 | 主盘线: ${formatAsianLine(line)}`,
      odds: targetOpt.numOdds
    };
  }

  // -------------------------------------------------------------
  // D. 半场让球 (HALF_ASIAN_HANDICAP)
  // -------------------------------------------------------------
  if (mainHtAh.mainMarket && mainHtAh.options.length >= 2) {
    const homeOpt = mainHtAh.options.find(o => o.side === 'home' || String(o.selection || '').includes('主')) || mainHtAh.options[0];
    const awayOpt = mainHtAh.options.find(o => o.side === 'away' || String(o.selection || '').includes('客')) || mainHtAh.options[1];
    const line = mainHtAh.line ?? -0.25;

    const halfNetDiff = expectedGoalDiff * dynamicHalfRatio;
    let homeCoverProb = Math.round(50 + (halfNetDiff - (-line)) * 36);
    homeCoverProb = Math.max(20, Math.min(80, homeCoverProb));
    const awayCoverProb = 100 - homeCoverProb;

    const sumInv = (1 / homeOpt.numOdds) + (1 / awayOpt.numOdds);
    const homeImplied = Math.round(((1 / homeOpt.numOdds) / sumInv) * 100);
    const awayImplied = 100 - homeImplied;

    const pickHome = homeCoverProb >= 50;
    const targetSide = pickHome ? 'home' : 'away';
    const targetOpt = pickHome ? homeOpt : awayOpt;
    const modelProb = pickHome ? homeCoverProb : awayCoverProb;
    const marketProb = pickHome ? homeImplied : awayImplied;
    
    let rawEv = ((modelProb / 100) * targetOpt.numOdds - 1) * 100;
    rawEv = Math.max(-maxEvCap, Math.min(maxEvCap, rawEv));
    const ev = Math.round(rawEv * 10) / 10;

    const teamLabel = pickHome ? '主场' : '客场';
    const targetHtLineNum = pickHome ? line : -line;
    const formattedHtHandicap = formatAsianLine(targetHtLineNum);
    const signPrefix = targetHtLineNum > 0 && !formattedHtHandicap.startsWith('+') ? '+' : '';

    predictions.halfAsianHandicap = {
      marketType: 'HALF_ASIAN_HANDICAP',
      marketLabel: '半场让球',
      hasPrediction: true,
      predictedSide: targetSide,
      predictedSelection: `半场 ${teamLabel} ${signPrefix}${formattedHtHandicap}`,
      predictedLine: line,
      modelProbability: modelProb,
      marketProbability: marketProb,
      expectedValue: ev,
      confidence: Math.abs(ev) > 5 && alphaRes.completeness.maxAllowedConfidence !== 'LOW' ? 'HIGH' : 'MEDIUM',
      quantReason: `赛前推演半场主客净胜期望为 ${halfNetDiff >= 0 ? '+' : ''}${halfNetDiff.toFixed(2)} 球。`,
      tacticalFactor: `半场净胜期望: ${halfNetDiff.toFixed(2)} 球`,
      odds: targetOpt.numOdds
    };
  }

  // -------------------------------------------------------------
  // E. 全场独赢 1X2 (MATCH_WINNER)
  // -------------------------------------------------------------
  if (main1x2.mainMarket && main1x2.options.length >= 3 && h2hHomeOpt && h2hDrawOpt && h2hAwayOpt) {
    const sumInv = (1 / h2hHomeOpt.numOdds) + (1 / h2hDrawOpt.numOdds) + (1 / h2hAwayOpt.numOdds);
    const homeImplied = Math.round(((1 / h2hHomeOpt.numOdds) / sumInv) * 100);
    const drawImplied = Math.round(((1 / h2hDrawOpt.numOdds) / sumInv) * 100);
    const awayImplied = 100 - homeImplied - drawImplied;

    const mHomeProb = Math.round(modelHomeWin);
    const mDrawProb = Math.round(modelDraw);
    const mAwayProb = 100 - mHomeProb - mDrawProb;

    const evHome = ((mHomeProb / 100) * h2hHomeOpt.numOdds - 1) * 100;
    const evDraw = ((mDrawProb / 100) * h2hDrawOpt.numOdds - 1) * 100;
    const evAway = ((mAwayProb / 100) * h2hAwayOpt.numOdds - 1) * 100;

    let bestSide: 'home' | 'draw' | 'away' = 'home';
    let bestModelProb = mHomeProb;
    let bestMarketProb = homeImplied;
    let bestOpt = h2hHomeOpt;
    let bestEv = evHome;

    if (mDrawProb > bestModelProb) {
      bestSide = 'draw';
      bestModelProb = mDrawProb;
      bestMarketProb = drawImplied;
      bestOpt = h2hDrawOpt;
      bestEv = evDraw;
    }
    if (mAwayProb > bestModelProb) {
      bestSide = 'away';
      bestModelProb = mAwayProb;
      bestMarketProb = awayImplied;
      bestOpt = h2hAwayOpt;
      bestEv = evAway;
    }

    const sideLabel = bestSide === 'home' ? '主胜' : bestSide === 'draw' ? '平局' : '客胜';
    const cappedEv = Math.max(-maxEvCap, Math.min(maxEvCap, bestEv));

    predictions.matchWinner = {
      marketType: 'MATCH_WINNER',
      marketLabel: '全场独赢 (1X2)',
      hasPrediction: true,
      predictedSide: bestSide,
      predictedSelection: sideLabel,
      modelProbability: bestModelProb,
      marketProbability: bestMarketProb,
      expectedValue: Math.round(cappedEv * 10) / 10,
      confidence: Math.abs(cappedEv) > 5 && alphaRes.completeness.maxAllowedConfidence !== 'LOW' ? 'HIGH' : 'MEDIUM',
      quantReason: `赛前泊松精算(Dixon-Coles) 1X2 真实概率分布：主胜 ${mHomeProb}% | 平局 ${mDrawProb}% | 客胜 ${mAwayProb}%。`,
      tacticalFactor: `胜平负泊松分布: 主 ${mHomeProb}% / 平 ${mDrawProb}% / 客 ${mAwayProb}%`,
      odds: bestOpt.numOdds
    };
  }

  let dataQualityBadge = '🟢 完整基本面+市场共识精算';
  if (alphaRes.qualityLevel === 'PARTIAL_FUNDAMENTALS_AND_MARKET') {
    dataQualityBadge = '🟡 部分历史样本+市场共识精算';
  } else if (alphaRes.qualityLevel === 'PURE_MARKET_CONSENSUS') {
    dataQualityBadge = '⚪ 纯市场共识精算(无历史战绩)';
  }

  let dominanceStatus: MatchQuantAnalysis['dominanceStatus'] = 'BALANCED_PRESSURE';
  if (expectedGoalDiff >= 0.8) dominanceStatus = 'HOME_DOMINANT';
  else if (expectedGoalDiff <= -0.8) dominanceStatus = 'AWAY_DOMINANT';

  return {
    match: std.match,
    homeTeam: std.ybty_home || '主队',
    awayTeam: std.ybty_away || '客队',
    minute: 0,
    score: { home: 0, away: 0 },
    homeThreatScore: 0,
    awayThreatScore: 0,
    expectedRemainingGoals: Math.round(finalExpectedTotalGoals * 100) / 100,
    dominanceStatus,
    engineMode: 'PREMATCH_QUANT',
    dataQualityLevel: alphaRes.qualityLevel,
    dataQualityBadge,
    predictions
  };
}

/**
 * 模块 4：滚球动量物理量化推演引擎 (calculateLiveQuantAnalysis)
 * 专为滚球实时比赛打造：接入 UPTS 物理危攻转化率、时间衰减与即时盘口跳档追踪。
 */
export function calculateLiveQuantAnalysis(item: DecisionItem | StandardMatchData): MatchQuantAnalysis {
  const std: StandardMatchData = item.unified_stats ? (item as unknown as StandardMatchData) : toStandardMatchData(item);
  const stats = std.unified_stats || {
    possession: { home: 50, away: 50 },
    shots: { home: 0, away: 0 },
    shots_on_target: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    dangerous_attacks: { home: 0, away: 0 },
    yellow_cards: { home: 0, away: 0 },
    red_cards: { home: 0, away: 0 }
  };

  const minute = Math.max(1, Number(std.minute || 1));
  const score = { home: Number(std.score?.home ?? 0), away: Number(std.score?.away ?? 0) };
  const currentTotalGoals = score.home + score.away;

  // 1. 物理威胁指数 (UPTS)
  const homeShotsOnTarget = Number(stats.shots_on_target?.home ?? 0);
  const awayShotsOnTarget = Number(stats.shots_on_target?.away ?? 0);
  const homeShots = Number(stats.shots?.home ?? 0);
  const awayShots = Number(stats.shots?.away ?? 0);
  const homeDanger = Number(stats.dangerous_attacks?.home ?? 0);
  const awayDanger = Number(stats.dangerous_attacks?.away ?? 0);
  const homeCorners = Number(stats.corners?.home ?? 0);
  const awayCorners = Number(stats.corners?.away ?? 0);
  const homePossession = Number(stats.possession?.home ?? 50);

  const homeThreat = homeShotsOnTarget * 3.5 + (homeShots - homeShotsOnTarget) * 1.0 + homeDanger * 0.4 + homeCorners * 0.8;
  const awayThreat = awayShotsOnTarget * 3.5 + (awayShots - awayShotsOnTarget) * 1.0 + awayDanger * 0.4 + awayCorners * 0.8;

  // 战术成色定性
  let dominanceStatus: MatchQuantAnalysis['dominanceStatus'] = 'BALANCED_PRESSURE';
  if (homePossession >= 65 && homeShotsOnTarget <= 1 && awayDanger >= homeDanger) {
    dominanceStatus = 'STERILE_POSSESSION';
  } else if (homeThreat > awayThreat * 1.6 + 2) {
    dominanceStatus = 'HOME_DOMINANT';
  } else if (awayThreat > homeThreat * 1.6 + 2) {
    dominanceStatus = 'AWAY_DOMINANT';
  } else if (homeShots + awayShots <= 2 && minute >= 20) {
    dominanceStatus = 'ATTRITION_BATTLE';
  }

  // 剩余时间换算
  const remainingFullTime = Math.max(5, 90 - minute);
  const remainingHalfTime = minute < 45 ? Math.max(2, 45 - minute) : 0;

  // 期望进球率
  const totalThreatRate = (homeThreat + awayThreat) / Math.max(15, minute);
  let expectedMatchGoalRate = 2.2;
  if (dominanceStatus === 'STERILE_POSSESSION' || dominanceStatus === 'ATTRITION_BATTLE') {
    expectedMatchGoalRate = Math.min(1.4, Math.max(0.6, totalThreatRate * 22));
  } else {
    expectedMatchGoalRate = Math.min(3.8, Math.max(1.2, totalThreatRate * 28));
  }

  const expectedRemainingGoals = (expectedMatchGoalRate * remainingFullTime) / 90;
  const expectedRemainingHalfGoals = minute < 45 ? (expectedMatchGoalRate * remainingHalfTime) / 90 : 0;

  const rawMarkets: RawMarket[] = (std.verified_ybty_markets || std.market_snapshots || (std as any).markets || []) as RawMarket[];

  const mainFtOu = selectMainMarketLine(rawMarkets, 'full_total');
  const mainHtOu = selectMainMarketLine(rawMarkets, 'half_total');
  const mainFtAh = selectMainMarketLine(rawMarkets, 'full_spread');
  const mainHtAh = selectMainMarketLine(rawMarkets, 'half_spread');
  const main1x2 = selectMainMarketLine(rawMarkets, 'full_h2h');

  const predictions: MatchQuantAnalysis['predictions'] = {};

  // A. 全场大小球
  if (mainFtOu.mainMarket && mainFtOu.options.length >= 2) {
    const overOpt = mainFtOu.options.find(o => o.side === 'over' || String(o.selection || '').includes('大')) || mainFtOu.options[0];
    const underOpt = mainFtOu.options.find(o => o.side === 'under' || String(o.selection || '').includes('小')) || mainFtOu.options[1];
    const line = mainFtOu.line ?? 2.0;
    const neededRemainingGoals = line - currentTotalGoals;

    let modelOverProb = 50;
    if (expectedRemainingGoals > neededRemainingGoals + 0.35) {
      modelOverProb = Math.min(78, 50 + (expectedRemainingGoals - neededRemainingGoals) * 35);
    } else if (expectedRemainingGoals < neededRemainingGoals - 0.25) {
      modelOverProb = Math.max(22, 50 - (neededRemainingGoals - expectedRemainingGoals) * 38);
    } else {
      modelOverProb = 50 + (expectedRemainingGoals - neededRemainingGoals) * 20;
    }
    modelOverProb = Math.round(Math.max(15, Math.min(85, modelOverProb)));
    const modelUnderProb = 100 - modelOverProb;

    const sumInv = (1 / overOpt.numOdds) + (1 / underOpt.numOdds);
    const overImplied = Math.round(((1 / overOpt.numOdds) / sumInv) * 100);
    const underImplied = 100 - overImplied;

    const pickOver = modelOverProb >= 50;
    const targetSide = pickOver ? 'over' : 'under';
    const targetOpt = pickOver ? overOpt : underOpt;
    const modelProb = pickOver ? modelOverProb : modelUnderProb;
    const marketProb = pickOver ? overImplied : underImplied;
    const ev = Math.round(((modelProb / 100) * targetOpt.numOdds - 1) * 1000) / 10;

    let quantReason = '';
    if (dominanceStatus === 'STERILE_POSSESSION') {
      quantReason = `主队${homePossession}%控球但0射正，攻势穿透力严重匮乏，模型预期全场进球节奏放缓（偏向小球）。`;
    } else if (expectedRemainingGoals > neededRemainingGoals) {
      quantReason = `当前双端威胁转化率较高，模型测算剩余进球期望值约为 ${expectedRemainingGoals.toFixed(2)} 球，高于盘口需求。`;
    } else {
      quantReason = `当前进攻转化偏低，模型测算剩余期望约 ${expectedRemainingGoals.toFixed(2)} 球。`;
    }

    const formattedLine = formatAsianLine(line);
    predictions.totalGoals = {
      marketType: 'TOTAL_GOALS',
      marketLabel: '全场大小球',
      hasPrediction: true,
      predictedSide: targetSide,
      predictedSelection: pickOver ? `大 ${formattedLine}` : `小 ${formattedLine}`,
      predictedLine: line,
      modelProbability: modelProb,
      marketProbability: marketProb,
      expectedValue: ev,
      confidence: Math.abs(ev) > 5 ? 'HIGH' : 'MEDIUM',
      quantReason,
      tacticalFactor: `剩余期望进球: ${expectedRemainingGoals.toFixed(2)} 球 | 门前射正: ${homeShotsOnTarget + awayShotsOnTarget} 次`,
      odds: targetOpt.numOdds
    };
  }

  // B. 半场大小球
  if (mainHtOu.mainMarket && minute < 45 && mainHtOu.options.length >= 2) {
    const overOpt = mainHtOu.options.find(o => o.side === 'over' || String(o.selection || '').includes('大')) || mainHtOu.options[0];
    const underOpt = mainHtOu.options.find(o => o.side === 'under' || String(o.selection || '').includes('小')) || mainHtOu.options[1];
    const line = mainHtOu.line ?? 0.5;
    const neededHtGoals = line - currentTotalGoals;

    let modelOverProb = 50;
    if (expectedRemainingHalfGoals > neededHtGoals + 0.15) {
      modelOverProb = Math.min(75, 50 + (expectedRemainingHalfGoals - neededHtGoals) * 45);
    } else {
      modelOverProb = Math.max(25, 50 - (neededHtGoals - expectedRemainingHalfGoals) * 50);
    }
    modelOverProb = Math.round(Math.max(15, Math.min(85, modelOverProb)));
    const modelUnderProb = 100 - modelOverProb;

    const sumInv = (1 / overOpt.numOdds) + (1 / underOpt.numOdds);
    const overImplied = Math.round(((1 / overOpt.numOdds) / sumInv) * 100);
    const underImplied = 100 - overImplied;

    const pickOver = modelOverProb >= 50;
    const targetSide = pickOver ? 'over' : 'under';
    const targetOpt = pickOver ? overOpt : underOpt;
    const modelProb = pickOver ? modelOverProb : modelUnderProb;
    const marketProb = pickOver ? overImplied : underImplied;
    const ev = Math.round(((modelProb / 100) * targetOpt.numOdds - 1) * 1000) / 10;

    const formattedHalfLine = formatAsianLine(line);
    predictions.halfTotalGoals = {
      marketType: 'HALF_TOTAL_GOALS',
      marketLabel: '半场大小球',
      hasPrediction: true,
      predictedSide: targetSide,
      predictedSelection: pickOver ? `半场大 ${formattedHalfLine}` : `半场小 ${formattedHalfLine}`,
      predictedLine: line,
      modelProbability: modelProb,
      marketProbability: marketProb,
      expectedValue: ev,
      confidence: Math.abs(ev) > 5 ? 'HIGH' : 'MEDIUM',
      quantReason: `上半场剩余 ${remainingHalfTime} 分钟，半场期望进球为 ${expectedRemainingHalfGoals.toFixed(2)} 球。`,
      tacticalFactor: `半场破门概率: ${modelOverProb}% | 剩余时间: ${remainingHalfTime}分钟`,
      odds: targetOpt.numOdds
    };
  }

  // C. 全场让球
  if (mainFtAh.mainMarket && mainFtAh.options.length >= 2) {
    const homeOpt = mainFtAh.options.find(o => o.side === 'home' || String(o.selection || '').includes('主')) || mainFtAh.options[0];
    const awayOpt = mainFtAh.options.find(o => o.side === 'away' || String(o.selection || '').includes('客')) || mainFtAh.options[1];
    const line = mainFtAh.line ?? -0.5;

    const threatDiff = (homeThreat - awayThreat) / Math.max(10, minute);
    let expectedGoalDiff = (threatDiff * remainingFullTime) / 90 + (score.home - score.away);
    if (dominanceStatus === 'STERILE_POSSESSION') expectedGoalDiff *= 0.45;

    let homeCoverProb = 50;
    if (expectedGoalDiff > -line + 0.3) {
      homeCoverProb = Math.min(78, 50 + (expectedGoalDiff - (-line)) * 32);
    } else if (expectedGoalDiff < -line - 0.3) {
      homeCoverProb = Math.max(22, 50 - (-line - expectedGoalDiff) * 32);
    } else {
      homeCoverProb = 50 + (expectedGoalDiff - (-line)) * 20;
    }
    homeCoverProb = Math.round(Math.max(15, Math.min(85, homeCoverProb)));
    const awayCoverProb = 100 - homeCoverProb;

    const sumInv = (1 / homeOpt.numOdds) + (1 / awayOpt.numOdds);
    const homeImplied = Math.round(((1 / homeOpt.numOdds) / sumInv) * 100);
    const awayImplied = 100 - homeImplied;

    const pickHome = homeCoverProb >= 50;
    const targetSide = pickHome ? 'home' : 'away';
    const targetOpt = pickHome ? homeOpt : awayOpt;
    const modelProb = pickHome ? homeCoverProb : awayCoverProb;
    const marketProb = pickHome ? homeImplied : awayImplied;
    const ev = Math.round(((modelProb / 100) * targetOpt.numOdds - 1) * 1000) / 10;

    let quantReason = '';
    if (dominanceStatus === 'STERILE_POSSESSION' && line < 0) {
      quantReason = `主队让球深度(${formatAsianLine(line)})与实际破防能力严重脱节（0射正），模型提示主队穿盘期望过低，客队受让具备价值防御。`;
    } else if (pickHome) {
      quantReason = `主队联合物理威胁占优，模型推算全场净胜期望可覆盖 ${formatAsianLine(line)} 盘口。`;
    } else {
      quantReason = `客队在防守与反击危攻上韧性充足，模型测算客队赢盘/受让概率达到 ${awayCoverProb}%。`;
    }

    const teamLabel = pickHome ? '主场' : '客场';
    const targetLineNum = pickHome ? line : -line;
    const formattedHandicap = formatAsianLine(targetLineNum);
    const signPrefix = targetLineNum > 0 && !formattedHandicap.startsWith('+') ? '+' : '';

    predictions.asianHandicap = {
      marketType: 'ASIAN_HANDICAP',
      marketLabel: '全场让球',
      hasPrediction: true,
      predictedSide: targetSide,
      predictedSelection: `${teamLabel} ${signPrefix}${formattedHandicap}`,
      predictedLine: line,
      modelProbability: modelProb,
      marketProbability: marketProb,
      expectedValue: ev,
      confidence: Math.abs(ev) > 5 ? 'HIGH' : 'MEDIUM',
      quantReason,
      tacticalFactor: `即时攻防净胜期望: ${(expectedGoalDiff - (score.home - score.away)).toFixed(2)} 球 | 危攻比: ${homeDanger}:${awayDanger}`,
      odds: targetOpt.numOdds
    };
  }

  // D. 半场让球
  if (mainHtAh.mainMarket && minute < 45 && mainHtAh.options.length >= 2) {
    const homeOpt = mainHtAh.options.find(o => o.side === 'home' || String(o.selection || '').includes('主')) || mainHtAh.options[0];
    const awayOpt = mainHtAh.options.find(o => o.side === 'away' || String(o.selection || '').includes('客')) || mainHtAh.options[1];
    const line = mainHtAh.line ?? -0.25;

    const threatDiff = (homeThreat - awayThreat) / Math.max(10, minute);
    let expectedHtGoalDiff = (threatDiff * remainingHalfTime) / 90;
    if (dominanceStatus === 'STERILE_POSSESSION') expectedHtGoalDiff *= 0.35;

    let homeCoverProb = Math.round(50 + (expectedHtGoalDiff - (-line)) * 38);
    homeCoverProb = Math.max(18, Math.min(82, homeCoverProb));
    const awayCoverProb = 100 - homeCoverProb;

    const sumInv = (1 / homeOpt.numOdds) + (1 / awayOpt.numOdds);
    const homeImplied = Math.round(((1 / homeOpt.numOdds) / sumInv) * 100);
    const awayImplied = 100 - homeImplied;

    const pickHome = homeCoverProb >= 50;
    const targetSide = pickHome ? 'home' : 'away';
    const targetOpt = pickHome ? homeOpt : awayOpt;
    const modelProb = pickHome ? homeCoverProb : awayCoverProb;
    const marketProb = pickHome ? homeImplied : awayImplied;
    const ev = Math.round(((modelProb / 100) * targetOpt.numOdds - 1) * 1000) / 10;

    const teamLabel = pickHome ? '主场' : '客场';
    const targetHtLineNum = pickHome ? line : -line;
    const formattedHtHandicap = formatAsianLine(targetHtLineNum);
    const signPrefix = targetHtLineNum > 0 && !formattedHtHandicap.startsWith('+') ? '+' : '';

    predictions.halfAsianHandicap = {
      marketType: 'HALF_ASIAN_HANDICAP',
      marketLabel: '半场让球',
      hasPrediction: true,
      predictedSide: targetSide,
      predictedSelection: `半场 ${teamLabel} ${signPrefix}${formattedHtHandicap}`,
      predictedLine: line,
      modelProbability: modelProb,
      marketProbability: marketProb,
      expectedValue: ev,
      confidence: Math.abs(ev) > 5 ? 'HIGH' : 'MEDIUM',
      quantReason: `上半场剩余 ${remainingHalfTime} 分钟，半场攻守对抗均衡度测算主队净胜概率为 ${homeCoverProb}%。`,
      tacticalFactor: `半场净胜期望: ${expectedHtGoalDiff.toFixed(2)} 球`,
      odds: targetOpt.numOdds
    };
  }

  // E. 全场独赢
  if (main1x2.mainMarket && main1x2.options.length >= 3) {
    const homeOpt = main1x2.options.find(o => o.side === 'home' || String(o.selection || '').includes('主') || String(o.selection || '') === '1') || main1x2.options[0];
    const drawOpt = main1x2.options.find(o => o.side === 'draw' || String(o.selection || '').includes('平') || String(o.selection || '') === 'x' || String(o.selection || '') === 'X') || main1x2.options[1];
    const awayOpt = main1x2.options.find(o => o.side === 'away' || String(o.selection || '').includes('客') || String(o.selection || '') === '2') || main1x2.options[2];

    const sumInv = (1 / homeOpt.numOdds) + (1 / drawOpt.numOdds) + (1 / awayOpt.numOdds);
    const homeImplied = Math.round(((1 / homeOpt.numOdds) / sumInv) * 100);
    const drawImplied = Math.round(((1 / drawOpt.numOdds) / sumInv) * 100);
    const awayImplied = 100 - homeImplied - drawImplied;

    let modelHomeProb = homeImplied;
    let modelDrawProb = drawImplied;
    let modelAwayProb = awayImplied;

    if (dominanceStatus === 'STERILE_POSSESSION') {
      const shift = Math.min(18, homeImplied * 0.32);
      modelHomeProb = Math.round(homeImplied - shift);
      modelDrawProb = Math.round(drawImplied + shift * 0.65);
      modelAwayProb = 100 - modelHomeProb - modelDrawProb;
    } else if (dominanceStatus === 'HOME_DOMINANT') {
      const boost = Math.min(15, (100 - homeImplied) * 0.25);
      modelHomeProb = Math.round(homeImplied + boost);
      modelDrawProb = Math.round(drawImplied - boost * 0.6);
      modelAwayProb = 100 - modelHomeProb - modelDrawProb;
    } else if (dominanceStatus === 'AWAY_DOMINANT') {
      const boost = Math.min(15, (100 - awayImplied) * 0.3);
      modelAwayProb = Math.round(awayImplied + boost);
      modelHomeProb = Math.round(homeImplied - boost * 0.7);
      modelDrawProb = 100 - modelHomeProb - modelAwayProb;
    }

    const evHome = ((modelHomeProb / 100) * homeOpt.numOdds - 1) * 100;
    const evDraw = ((modelDrawProb / 100) * drawOpt.numOdds - 1) * 100;
    const evAway = ((modelAwayProb / 100) * awayOpt.numOdds - 1) * 100;

    let bestSide: 'home' | 'draw' | 'away' = 'home';
    let bestModelProb = modelHomeProb;
    let bestMarketProb = homeImplied;
    let bestOpt = homeOpt;
    let bestEv = evHome;

    if (modelDrawProb > bestModelProb) {
      bestSide = 'draw';
      bestModelProb = modelDrawProb;
      bestMarketProb = drawImplied;
      bestOpt = drawOpt;
      bestEv = evDraw;
    }
    if (modelAwayProb > bestModelProb) {
      bestSide = 'away';
      bestModelProb = modelAwayProb;
      bestMarketProb = awayImplied;
      bestOpt = awayOpt;
      bestEv = evAway;
    }

    const sideLabel = bestSide === 'home' ? '主胜' : bestSide === 'draw' ? '平局' : '客胜';

    predictions.matchWinner = {
      marketType: 'MATCH_WINNER',
      marketLabel: '全场独赢 (1X2)',
      hasPrediction: true,
      predictedSide: bestSide,
      predictedSelection: sideLabel,
      modelProbability: bestModelProb,
      marketProbability: bestMarketProb,
      expectedValue: Math.round(bestEv * 10) / 10,
      confidence: Math.abs(bestEv) > 5 ? 'HIGH' : 'MEDIUM',
      quantReason: `滚球即时 1X2 概率推演：主胜 ${modelHomeProb}% | 平局 ${modelDrawProb}% | 客胜 ${modelAwayProb}%。`,
      tacticalFactor: `胜平负模型分布: 主 ${modelHomeProb}% / 平 ${modelDrawProb}% / 客 ${modelAwayProb}%`,
      odds: bestOpt.numOdds
    };
  }

  return {
    match: std.match,
    homeTeam: std.ybty_home || '主队',
    awayTeam: std.ybty_away || '客队',
    minute,
    score,
    homeThreatScore: Math.round(homeThreat * 10) / 10,
    awayThreatScore: Math.round(awayThreat * 10) / 10,
    expectedRemainingGoals: Math.round(expectedRemainingGoals * 100) / 100,
    dominanceStatus,
    engineMode: 'LIVE_IN_PLAY_MOMENTUM',
    dataQualityLevel: 'FULL_FUNDAMENTALS_AND_MARKET',
    dataQualityBadge: '⚡ 滚球即时物理动量推演',
    predictions
  };
}

/**
 * 主入口：智能分流（根据比赛状态分流至赛前专属引擎或滚球物理动量引擎）
 */
export function calculateMachineQuantAnalysis(item: DecisionItem | StandardMatchData): MatchQuantAnalysis {
  const std = item as any;
  const minute = Number(std.minute ?? 0);
  const isLive = std.is_live === true || std.status === 'LIVE' || std.match_status === 'IN_PLAY' || (minute > 0 && minute < 120);

  if (isLive) {
    return calculateLiveQuantAnalysis(item);
  } else {
    return calculatePrematchQuantAnalysis(item);
  }
}

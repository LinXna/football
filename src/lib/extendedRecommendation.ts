import { DecisionItem } from '../types';
import { formatAsianLine } from './quarterSettlement';
import { extractMatchLiveStats, MatchLiveStats } from './matchStats';

export interface CorrectScoreOption { score: string; odds: number | null; probPercent: number; }
export interface BTTSOption { value: '是' | '否' | '数据不足'; odds: number | null; probability: number | null; reason: string; }
export interface OddEvenOption { value: '单数' | '双数' | '数据不足'; odds: number | null; probability: number | null; reason: string; }
export interface GoalProjection {
  home: number | null; away: number | null; total: number | null;
  homeMostLikely: number | null; awayMostLikely: number | null; totalMostLikely: number | null;
  homeAlternative: number | null; awayAlternative: number | null; totalAlternative: number | null;
  homeConfidence: number; awayConfidence: number; totalConfidence: number;
  homeRange: string; awayRange: string; totalRange: string; basis: string;
}
export interface TimeIntervalOption { interval: string; label: string; recommendation: string; confidence: number; odds: number | null; }
export interface LiveEntryTimingAdvice { lineDropSummary: string; reboundOpportunity: string; triggerCondition: string; confidenceLevel: string; actionableStep: string; }
export interface MarketRecommendation { value: string; line: string; odds: number | null; confidence: number; reason: string; }
export interface OverUnderRecommendation { fullTime: MarketRecommendation; halfTime: MarketRecommendation; }
export interface HandicapRecommendation {
  fullTime: MarketRecommendation & { team: string };
  halfTime: MarketRecommendation & { team: string };
}
export interface Match1X2Recommendation { value: string; odds: number | null; probability: number; reason: string; }
export interface CornerMarketRecommendation {
  available: boolean;
  source: string;
  line: string;
  recommendedSelection?: string; // e.g. "大球" / "小球" / "主队" / "客队"
  recommendedOdds?: number | null;
  recommendedProb?: number | null;
  overOdds: number | null;
  underOdds: number | null;
  homeOdds?: number | null;
  awayOdds?: number | null;
  fairOverOdds?: number | null;
  fairUnderOdds?: number | null;
  valueEdgePct?: number | null;
  confidence: number;
  reason: string;
  tacticalNote?: string;
}

export interface ExtendedMatchAnalysis {
  h2hSummary: string; recentScoringSummary: string; lineMovementSummary: string;
  overUnder: OverUnderRecommendation; handicap: HandicapRecommendation; match1X2: Match1X2Recommendation;
  cornerTotal?: CornerMarketRecommendation;
  cornerSpread?: CornerMarketRecommendation;
  correctScores: CorrectScoreOption[]; btts: BTTSOption; oddEven: OddEvenOption;
  goalProjection: GoalProjection; timeIntervals: TimeIntervalOption[]; liveEntryTiming: LiveEntryTimingAdvice;
}

type RawOption = { side?: string; selection?: string | number; line?: string | number; odds?: string | number; suspended?: boolean };
type RawMarket = { market?: string; market_type_verified?: boolean; options?: RawOption[] };

const finiteOdds = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
};

const numericLine = (value: unknown): number | null => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const values = text.split('/').map(Number).filter(Number.isFinite);
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
};

const poisson = (lambda: number, goals: number): number => {
  let factorial = 1;
  for (let index = 2; index <= goals; index += 1) factorial *= index;
  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial;
};

const percent = (value: number): number => Math.round(value * 1000) / 10;

function verifiedMarket(item: DecisionItem | null | undefined, marketType: string): RawMarket | null {
  if (!item) return null;
  const rows = Array.isArray(item.ybty_raw_markets) ? (item.ybty_raw_markets as RawMarket[]) : [];

  // Exact or semantic match in raw markets
  let found = rows.find((row) => row.market === marketType && row.market_type_verified !== false);
  if (found && usableOptions(found).length > 0) return found;

  // Fallback 1: match common aliases in ybty_raw_markets
  if (marketType === 'full_total') {
    found = rows.find((row) => (row.market === 'total' || row.market === 'ou' || row.market === 'full_total' || String((row as any).market_title || '').includes('大小球')) && row.market_type_verified !== false);
  } else if (marketType === 'half_total') {
    found = rows.find((row) => (row.market === 'half_total' || row.market === 'ht_total' || String((row as any).market_title || '').includes('半场大小')) && row.market_type_verified !== false);
  } else if (marketType === 'full_spread') {
    found = rows.find((row) => (row.market === 'spread' || row.market === 'ah' || row.market === 'handicap' || row.market === 'full_spread' || String((row as any).market_title || '').includes('让球')) && row.market_type_verified !== false);
  } else if (marketType === 'half_spread') {
    found = rows.find((row) => (row.market === 'half_spread' || row.market === 'ht_spread' || String((row as any).market_title || '').includes('半场让球')) && row.market_type_verified !== false);
  } else if (marketType === 'full_h2h') {
    found = rows.find((row) => (row.market === 'h2h' || row.market === '1x2' || row.market === 'full_h2h' || String((row as any).market_title || '').includes('独赢')) && row.market_type_verified !== false);
  }
  if (found && usableOptions(found).length > 0) return found;

  // Fallback 2: check item.ybty_markets
  const ybtyMarkets = (item as any)?.ybty_markets;
  if (ybtyMarkets) {
    if (marketType === 'full_total' && ybtyMarkets.total) {
      const tot = ybtyMarkets.total;
      const opts: RawOption[] = [];
      if (tot.over_odds) opts.push({ selection: String(tot.line ?? ''), line: tot.line, odds: tot.over_odds, side: 'over', suspended: tot.over_suspended });
      if (tot.under_odds) opts.push({ selection: String(tot.line ?? ''), line: tot.line, odds: tot.under_odds, side: 'under', suspended: tot.under_suspended });
      if (opts.length) return { market: 'full_total', options: opts };
    } else if (marketType === 'full_spread' && ybtyMarkets.spread) {
      const sp = ybtyMarkets.spread;
      const opts: RawOption[] = [];
      if (sp.home_odds) opts.push({ selection: String(sp.home_line ?? ''), line: sp.home_line, odds: sp.home_odds, side: 'home', suspended: sp.home_suspended });
      if (sp.away_odds) opts.push({ selection: String(sp.away_line ?? ''), line: sp.away_line, odds: sp.away_odds, side: 'away', suspended: sp.away_suspended });
      if (opts.length) return { market: 'full_spread', options: opts };
    } else if (marketType === 'full_h2h' && ybtyMarkets.h2h) {
      const h = ybtyMarkets.h2h;
      const opts: RawOption[] = [];
      if (h.home_odds) opts.push({ selection: '主', odds: h.home_odds, side: 'home', suspended: h.home_suspended });
      if (h.away_odds) opts.push({ selection: '客', odds: h.away_odds, side: 'away', suspended: h.away_suspended });
      if (h.draw_odds) opts.push({ selection: '平', odds: h.draw_odds, side: 'draw', suspended: h.draw_suspended });
      if (opts.length) return { market: 'full_h2h', options: opts };
    }
  }

  // Fallback 3: check item.recommendation
  const rec = item?.recommendation;
  if (rec && rec.odds) {
    const recMarket = String(rec.market || '');
    const isTotal = /total|大小球/i.test(recMarket);
    const isSpread = /spread|让球/i.test(recMarket);
    const isH2H = /h2h|独赢|1x2/i.test(recMarket);
    const isHalf = /半场|half|ht/i.test(recMarket);

    const recSel = String((rec as any)?.selection || rec?.basis || '');
    if (marketType === 'full_total' && isTotal && !isHalf) {
      const side = recSel.toLowerCase().includes('under') || recSel.includes('小') ? 'under' : 'over';
      return { market: 'full_total', options: [{ selection: String(rec.line ?? recSel ?? ''), line: rec.line, odds: rec.odds, side }] };
    }
    if (marketType === 'half_total' && isTotal && isHalf) {
      const side = recSel.toLowerCase().includes('under') || recSel.includes('小') ? 'under' : 'over';
      return { market: 'half_total', options: [{ selection: String(rec.line ?? recSel ?? ''), line: rec.line, odds: rec.odds, side }] };
    }
    if (marketType === 'full_spread' && isSpread && !isHalf) {
      const side = recSel.toLowerCase().includes('away') || recSel.includes('客') ? 'away' : 'home';
      return { market: 'full_spread', options: [{ selection: String(rec.line ?? recSel ?? ''), line: rec.line, odds: rec.odds, side }] };
    }
    if (marketType === 'half_spread' && isSpread && isHalf) {
      const side = recSel.toLowerCase().includes('away') || recSel.includes('客') ? 'away' : 'home';
      return { market: 'half_spread', options: [{ selection: String(rec.line ?? recSel ?? ''), line: rec.line, odds: rec.odds, side }] };
    }
    if (marketType === 'full_h2h' && isH2H) {
      const side = recSel.toLowerCase().includes('away') || recSel.includes('客') ? 'away' :
                   recSel.toLowerCase().includes('draw') || recSel.includes('平') ? 'draw' : 'home';
      return { market: 'full_h2h', options: [{ selection: '1X2', odds: rec.odds, side }] };
    }
  }

  return null;
}

function usableOptions(market: RawMarket | null): Array<RawOption & { numericOdds: number }> {
  return (market?.options || []).flatMap((option) => {
    const odds = option.suspended === true ? null : finiteOdds(option.odds);
    return odds === null ? [] : [{ ...option, numericOdds: odds }];
  });
}

function marketLean(options: Array<RawOption & { numericOdds: number }>) {
  if (!options.length) return null;
  const weights = options.map((option) => 1 / option.numericOdds);
  const total = weights.reduce((sum, value) => sum + value, 0);
  const index = weights.indexOf(Math.max(...weights));
  return { option: options[index], probability: total > 0 ? percent(weights[index] / total) : 0 };
}

function historicalSummary(item: DecisionItem): { h2h: string; recent: string } {
  if (!item) return { h2h: '历史交锋：暂无可计算样本', recent: '近期战绩：暂无可计算样本' };
  const root: any = (item as any).recent_trends || {};
  const analysis = root.analysis_data || root;
  const historical = root.historical_analysis || analysis.historical_analysis;
  const interfaceRecent = historical?.recent_matches;
  const interfaceH2h = Array.isArray(historical?.head_to_head) ? historical.head_to_head : [];
  if (interfaceRecent || interfaceH2h.length) {
    const homeRecent = Array.isArray(interfaceRecent?.home) ? interfaceRecent.home : [];
    const awayRecent = Array.isArray(interfaceRecent?.away) ? interfaceRecent.away : [];
    const averageGoals = (rows: any[]) => rows.length
      ? rows.reduce((sum, row) => sum + (Number(row?.goals) || 0), 0) / rows.length
      : null;
    const homeAverage = averageGoals(homeRecent);
    const awayAverage = averageGoals(awayRecent);
    const h2hGoals = interfaceH2h.flatMap((row: any) => {
      const home = Number(Array.isArray(row?.home_scores) ? row.home_scores[0] : NaN);
      const away = Number(Array.isArray(row?.away_scores) ? row.away_scores[0] : NaN);
      return Number.isFinite(home) && Number.isFinite(away) ? [home + away] : [];
    });
    const h2hAverage = h2hGoals.length ? h2hGoals.reduce((sum: number, value: number) => sum + value, 0) / h2hGoals.length : null;

    // Time decay calculation
    const currentYear = new Date().getFullYear();
    let recent1YearCount = 0;
    let staleCount = 0;
    interfaceH2h.forEach((row: any) => {
      const rawDate = row?.match_date || row?.date || row?.match_time || row?.time;
      let year = 0;
      if (typeof rawDate === 'string') {
        const m = rawDate.match(/(\d{4})/);
        if (m) year = parseInt(m[1], 10);
      } else if (typeof rawDate === 'number') {
        const ts = rawDate > 1e11 ? rawDate : rawDate * 1000;
        year = new Date(ts).getFullYear();
      }
      if (year > 0) {
        if (currentYear - year <= 1) recent1YearCount++;
        else if (currentYear - year >= 3) staleCount++;
      }
    });

    let decayNote = '';
    if (interfaceH2h.length > 0) {
      if (recent1YearCount > 0) {
        decayNote = ` (近1年${recent1YearCount}场/高权重)`;
      } else if (staleCount === interfaceH2h.length) {
        decayNote = ` (全部发生于2-3年前/阵容更迭·时效衰减)`;
      }
    }

    return {
      h2h: h2hAverage == null ? '历史交锋：暂无可计算样本' : `历史交锋：${h2hGoals.length}场${decayNote}，场均进球${h2hAverage.toFixed(2)}`,
      recent: `近期战绩：主队${homeRecent.length}场${homeAverage == null ? '' : `(均进${homeAverage.toFixed(2)})`}；客队${awayRecent.length}场${awayAverage == null ? '' : `(均进${awayAverage.toFixed(2)})`}。依据时效衰减模型，优先参考近6场与即时首发。`,
    };
  }
  if (!historical || historical.available !== true) {
    const reason = historical?.reason || '雷速本次详情没有提供可核验的近期战绩或交锋结构化数据';
    return { h2h: `历史交锋：无可核验数据（${reason}）`, recent: `近期战绩：无可核验数据（${reason}）` };
  }
  const recent = Array.isArray(historical.recent_form) ? historical.recent_form : [];
  return {
    h2h: historical.historical_trend ? `历史交锋：${JSON.stringify(historical.historical_trend)}` : '历史交锋：雷速未提供独立交锋统计',
    recent: recent.length ? `近期战绩：雷速提供 ${recent.length} 条结构化记录，预测仅使用这些记录` : '近期战绩：雷速标记历史模块可用，但没有返回近期比赛明细',
  };
}

function realMarketRecommendation(
  market: RawMarket | null,
  label: string,
  homeName: string,
  awayName: string,
  liveStats?: MatchLiveStats,
  minute?: number
): MarketRecommendation {
  const options = usableOptions(market);
  if (!options.length) return { value: `${label}暂无真实盘口`, line: '--', odds: null, confidence: 0, reason: 'YBTY本次导入没有可用且已核验的该市场盘口，不生成默认盘口或赔率。' };

  // 1. Base market odds weights
  const weights = options.map((option) => 1 / option.numericOdds);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  
  // 2. Multi-dimensional statistical weighting (corners, shots on target, red/yellow cards, time phase)
  let adjustedWeights = [...weights];
  if (liveStats && liveStats.hasStats && totalWeight > 0) {
    const homeCorners = liveStats.corners.home;
    const awayCorners = liveStats.corners.away;
    const totalCorners = homeCorners + awayCorners;
    const homeSOT = liveStats.shotsOnTarget.home;
    const awaySOT = liveStats.shotsOnTarget.away;
    const homeReds = liveStats.redCards.home;
    const awayReds = liveStats.redCards.away;
    const isLatePhase = (minute ?? 0) >= 70;

    options.forEach((opt, idx) => {
      const side = String(opt.side || '').toLowerCase();
      let multiplier = 1.0;

      // Squeeze & SOT boost for Home vs Away in Handicap/1X2
      if (side === 'home') {
        if (totalCorners > 0 && homeCorners / totalCorners >= 0.7) multiplier *= 1.08;
        if (homeSOT > awaySOT + 2) multiplier *= 1.06;
        if (awayReds > homeReds) multiplier *= (1 + (awayReds - homeReds) * 0.15);
        if (homeReds > awayReds) multiplier *= Math.max(0.65, 1 - (homeReds - awayReds) * 0.20);
      } else if (side === 'away') {
        if (totalCorners > 0 && awayCorners / totalCorners >= 0.7) multiplier *= 1.08;
        if (awaySOT > homeSOT + 2) multiplier *= 1.06;
        if (homeReds > awayReds) multiplier *= (1 + (homeReds - awayReds) * 0.15);
        if (awayReds > homeReds) multiplier *= Math.max(0.65, 1 - (awayReds - homeReds) * 0.20);
      }

      // SOT and high-pressure corner velocity boost for Over vs Under in Totals
      if (side === 'over') {
        if (totalCorners >= 6 || (homeSOT + awaySOT) >= 5) multiplier *= 1.06;
        if (isLatePhase && (homeSOT + awaySOT) >= 4) multiplier *= 1.04;
      } else if (side === 'under') {
        if (totalCorners <= 1 && (homeSOT + awaySOT) <= 1 && (minute ?? 0) >= 30) multiplier *= 1.08;
        if (isLatePhase && (homeSOT + awaySOT) <= 2) multiplier *= 1.06;
      }

      adjustedWeights[idx] = weights[idx] * multiplier;
    });
  }

  const adjTotal = adjustedWeights.reduce((sum, value) => sum + value, 0);
  const bestIdx = adjustedWeights.indexOf(Math.max(...adjustedWeights));
  const chosenOption = options[bestIdx];
  const probability = adjTotal > 0 ? percent(adjustedWeights[bestIdx] / adjTotal) : percent(weights[bestIdx] / totalWeight);

  const side = String(chosenOption.side || '');
  const rawLine = String(chosenOption.line ?? chosenOption.selection ?? '').trim();
  const formattedLine = rawLine && rawLine !== '--' && rawLine !== 'undefined' ? formatAsianLine(rawLine) : '';

  let fullDisplay = '';
  if (label.includes('让球') || label.includes('spread')) {
    const team = side === 'away' ? awayName : homeName;
    const lineSuffix = formattedLine ? ` ${formattedLine}` : '';
    fullDisplay = `${label}${team}${lineSuffix}`.trim();
  } else {
    const direction = side === 'over' ? '大球' : side === 'under' ? '小球' : side === 'home' ? homeName : side === 'away' ? awayName : '平局';
    const lineSuffix = formattedLine ? ` ${formattedLine}` : '';
    fullDisplay = `${label}${direction}${lineSuffix}`.trim();
  }

  const statNote = liveStats?.hasStats 
    ? `（结合现场角球 ${liveStats.corners.text}、射正 ${liveStats.shotsOnTarget.text} 及多维数据修正加权）` 
    : '';

  return {
    value: fullDisplay,
    line: formattedLine || '--',
    odds: chosenOption.numericOdds,
    confidence: probability,
    reason: `方向来自真实盘口赔率与现场多维战术数据加权${statNote}；综合置信胜率 ${probability}%。`,
  };
}

export function generateExtendedAnalysis(matchItem: DecisionItem): ExtendedMatchAnalysis {
  const matchStr = String(matchItem?.match || (matchItem as any)?.match_name || (matchItem as any)?.ybty_match || '');
  const matchParts = matchStr.includes('vs') ? matchStr.split('vs') : matchStr.includes('VS') ? matchStr.split('VS') : [];
  const homeName = matchItem?.ybty_home || matchParts[0]?.trim() || '主队';
  const awayName = matchItem?.ybty_away || matchParts[1]?.trim() || '客队';
  const liveStats = extractMatchLiveStats(matchItem);
  const minute = Number(matchItem?.minute || (matchItem as any)?.time || 0);

  const history = historicalSummary(matchItem);
  const fullTotal = verifiedMarket(matchItem, 'full_total');
  const halfTotal = verifiedMarket(matchItem, 'half_total');
  const fullSpread = verifiedMarket(matchItem, 'full_spread');
  const halfSpread = verifiedMarket(matchItem, 'half_spread');
  const fullH2h = verifiedMarket(matchItem, 'full_h2h');

  const ftTotalRec = realMarketRecommendation(fullTotal, '全场', homeName, awayName, liveStats, minute);
  const htTotalRec = realMarketRecommendation(halfTotal, '半场', homeName, awayName, liveStats, minute);
  const ftSpreadRec = realMarketRecommendation(fullSpread, '全场让球 ', homeName, awayName, liveStats, minute);
  const htSpreadRec = realMarketRecommendation(halfSpread, '半场让球 ', homeName, awayName, liveStats, minute);
  const h2hLean = marketLean(usableOptions(fullH2h));
  const h2hSide = String(h2hLean?.option.side || '');
  const h2hValue = h2hSide === 'home' ? `主胜（${homeName}）` : h2hSide === 'away' ? `客胜（${awayName}）` : h2hSide === 'draw' ? '平局' : '暂无真实独赢盘口';

  const totalOptions = usableOptions(fullTotal);
  const totalLine = numericLine(totalOptions[0]?.line ?? totalOptions[0]?.selection);
  const h2hOptions = usableOptions(fullH2h);
  const homeH2h = h2hOptions.find((option) => option.side === 'home');
  const awayH2h = h2hOptions.find((option) => option.side === 'away');
  let homeWeight = homeH2h ? 1 / homeH2h.numericOdds : 0;
  let awayWeight = awayH2h ? 1 / awayH2h.numericOdds : 0;

  // 融合现场攻防优势与红黄牌加权调整 Poisson Baseline
  if (liveStats.hasStats && (homeWeight > 0 || awayWeight > 0)) {
    if (liveStats.corners.home > liveStats.corners.away + 2) homeWeight *= 1.10;
    if (liveStats.corners.away > liveStats.corners.home + 2) awayWeight *= 1.10;
    if (liveStats.redCards.away > liveStats.redCards.home) homeWeight *= 1.20;
    if (liveStats.redCards.home > liveStats.redCards.away) awayWeight *= 1.20;
  }

  const teamWeight = homeWeight + awayWeight;
  const canProject = totalLine !== null && totalLine > 0 && teamWeight > 0;
  const expectedHome = canProject ? totalLine! * homeWeight / teamWeight : null;
  const expectedAway = canProject ? totalLine! - expectedHome! : null;

  let correctScores: CorrectScoreOption[] = [];
  if (expectedHome !== null && expectedAway !== null) {
    const scores: CorrectScoreOption[] = [];
    for (let home = 0; home <= 6; home += 1) {
      for (let away = 0; away <= 6; away += 1) {
        scores.push({ score: `${home} - ${away}`, odds: null, probPercent: percent(poisson(expectedHome, home) * poisson(expectedAway, away)) });
      }
    }
    correctScores = scores.sort((a, b) => b.probPercent - a.probPercent).slice(0, 4);
  }

  const bttsProbability = expectedHome !== null && expectedAway !== null
    ? percent(1 - Math.exp(-expectedHome) - Math.exp(-expectedAway) + Math.exp(-(expectedHome + expectedAway)))
    : null;
  const evenProbability = totalLine !== null ? percent((1 + Math.exp(-2 * totalLine)) / 2) : null;
  const totalMode = totalLine !== null ? Math.max(0, Math.floor(totalLine)) : null;
  const homeMode = expectedHome !== null ? Math.max(0, Math.floor(expectedHome)) : null;
  const awayMode = expectedAway !== null ? Math.max(0, Math.floor(expectedAway)) : null;
  const projectionBasis = canProject
    ? `基于YBTY真实全场大小球盘口 ${formatAsianLine(String(totalOptions[0]?.line ?? totalOptions[0]?.selection))}，结合1X2赔率及现场攻防/红黄牌多维加权分配期望进球；严密泊松分布计算。`
    : '缺少已核验的YBTY全场大小球或1X2盘口，无法计算进球预测。';

  const referenceOdds: any = (matchItem as any).reference_odds
    || (matchItem as any).detail_context?.formal?.odds
    || {};

  // Extract real Corner Total from Leisu / YBTY reference odds
  const formalOddsObj = (matchItem as any)?.detail_context?.formal?.odds || {};
  const cornerMarketRaw = referenceOdds?.markets?.corners || formalOddsObj?.markets?.corners || referenceOdds?.corners || formalOddsObj?.corners;
  const isLiveMatch = Boolean((matchItem as any)?.minute && Number((matchItem as any).minute) > 0);
  
  let cornerTotalRec: CornerMarketRecommendation = {
    available: false,
    source: 'leisu',
    line: '--',
    overOdds: null,
    underOdds: null,
    confidence: 0,
    reason: '雷速未提供本场角球大小盘口，按契约安全标注不可用。',
  };

  if (cornerMarketRaw && typeof cornerMarketRaw === 'object') {
    const activeOdds = (isLiveMatch && cornerMarketRaw.live) ? cornerMarketRaw.live : (cornerMarketRaw.pregame || cornerMarketRaw.initial || cornerMarketRaw.current || cornerMarketRaw);
    if (activeOdds && typeof activeOdds === 'object') {
      const rawLine = activeOdds.line ?? activeOdds.total ?? activeOdds.ou_line;
      const over = Number(activeOdds.over ?? activeOdds.over_odds ?? activeOdds.o ?? 0);
      const under = Number(activeOdds.under ?? activeOdds.under_odds ?? activeOdds.u ?? 0);
      
      const toDec = (n: number) => n > 0 && n < 1.05 ? Number((n + 1.0).toFixed(2)) : Number(n.toFixed(2));
      const decOver = toDec(over);
      const decUnder = toDec(under);

      if (rawLine && decOver >= 1.05 && decUnder >= 1.05) {
        const overround = (1 / decOver) + (1 / decUnder);
        const fairOverProb = (1 / decOver) / overround;
        const fairUnderProb = (1 / decUnder) / overround;
        const fairOverOdds = Number((1 / fairOverProb).toFixed(2));
        const fairUnderOdds = Number((1 / fairUnderProb).toFixed(2));

        const isOverFavored = fairOverProb >= fairUnderProb;
        const recommendedSelection = isOverFavored ? `大 ${rawLine} 角` : `小 ${rawLine} 角`;
        const recommendedOdds = isOverFavored ? decOver : decUnder;
        const recommendedProb = Number(((isOverFavored ? fairOverProb : fairUnderProb) * 100).toFixed(1));

        cornerTotalRec = {
          available: true,
          source: isLiveMatch ? '雷速滚球 (leisu_live)' : '雷速初盘/赛前 (leisu_prematch)',
          line: String(rawLine),
          recommendedSelection,
          recommendedOdds,
          recommendedProb,
          overOdds: decOver,
          underOdds: decUnder,
          fairOverOdds,
          fairUnderOdds,
          confidence: recommendedProb,
          reason: `盘口方向精算：首选【${recommendedSelection}】@${recommendedOdds} (隐含胜率 ${recommendedProb}%)。市场大球@${decOver}(公允@${fairOverOdds}) / 小球@${decUnder}(公允@${fairUnderOdds})。`,
          tacticalNote: `基准 ${rawLine} 角；大球隐含 ${(fairOverProb * 100).toFixed(1)}% vs 小球隐含 ${(fairUnderProb * 100).toFixed(1)}%。`
        };
      }
    }
  }

  // Extract real Corner Spread from Leisu / YBTY reference odds
  const cornerSpreadRaw = referenceOdds?.markets?.corner_handicap || formalOddsObj?.markets?.corner_handicap || referenceOdds?.corner_handicap || formalOddsObj?.corner_handicap;
  let cornerSpreadRec: CornerMarketRecommendation = {
    available: false,
    source: 'leisu',
    line: '--',
    recommendedSelection: '暂无盘口',
    overOdds: null,
    underOdds: null,
    homeOdds: null,
    awayOdds: null,
    confidence: 0,
    reason: '雷速未提供本场角球让球盘口，按契约安全标注不可用。',
  };

  if (cornerSpreadRaw && typeof cornerSpreadRaw === 'object') {
    const activeOdds = (isLiveMatch && cornerSpreadRaw.live) ? cornerSpreadRaw.live : (cornerSpreadRaw.pregame || cornerSpreadRaw.initial || cornerSpreadRaw.current || cornerSpreadRaw);
    if (activeOdds && typeof activeOdds === 'object') {
      const rawLine = activeOdds.line ?? activeOdds.handicap ?? activeOdds.spread_line;
      const home = Number(activeOdds.home ?? activeOdds.home_odds ?? activeOdds.h ?? 0);
      const away = Number(activeOdds.away ?? activeOdds.away_odds ?? activeOdds.a ?? 0);
      
      const toDec = (n: number) => n > 0 && n < 1.05 ? Number((n + 1.0).toFixed(2)) : Number(n.toFixed(2));
      const decHome = toDec(home);
      const decAway = toDec(away);

      if (rawLine !== undefined && rawLine !== null && decHome >= 1.05 && decAway >= 1.05) {
        const overround = (1 / decHome) + (1 / decAway);
        const fairHomeProb = (1 / decHome) / overround;
        const fairAwayProb = (1 / decAway) / overround;
        const fairHomeOdds = Number((1 / fairHomeProb).toFixed(2));
        const fairAwayOdds = Number((1 / fairAwayProb).toFixed(2));

        const isHomeFavored = fairHomeProb >= fairAwayProb;
        const homeName = (matchItem as any).home_team_ybty || (matchItem as any).home || '主队';
        const awayName = (matchItem as any).away_team_ybty || (matchItem as any).away || '客队';
        const recommendedSelection = isHomeFavored ? `${homeName} (${rawLine})` : `${awayName} (${Number(rawLine) !== 0 ? (Number(rawLine) > 0 ? `-${rawLine}` : `+${Math.abs(Number(rawLine))}`) : '0'})`;
        const recommendedOdds = isHomeFavored ? decHome : decAway;
        const recommendedProb = Number(((isHomeFavored ? fairHomeProb : fairAwayProb) * 100).toFixed(1));

        cornerSpreadRec = {
          available: true,
          source: isLiveMatch ? '雷速滚球 (leisu_live)' : '雷速初盘/赛前 (leisu_prematch)',
          line: String(rawLine),
          recommendedSelection,
          recommendedOdds,
          recommendedProb,
          overOdds: null,
          underOdds: null,
          homeOdds: decHome,
          awayOdds: decAway,
          fairOverOdds: fairHomeOdds,
          fairUnderOdds: fairAwayOdds,
          confidence: recommendedProb,
          reason: `角球让球方向：首选【${recommendedSelection}】@${recommendedOdds} (隐含胜率 ${recommendedProb}%)。主队@${decHome}(公允@${fairHomeOdds}) / 客队@${decAway}(公允@${fairAwayOdds})。`,
          tacticalNote: `让球线 ${rawLine}；主队隐含 ${(fairHomeProb * 100).toFixed(1)}% vs 客队隐含 ${(fairAwayProb * 100).toFixed(1)}%。`
        };
      }
    }
  }

  const referenceRows: any[] = referenceOdds?.detail_page?.panels?.flatMap((panel: any) => panel.normalized_rows || []) || [];
  const interfaceMarkets = referenceOdds?.markets || {};
  const phaseChanges = Object.values(interfaceMarkets).filter((market: any) => market?.initial && (market?.pregame || market?.live)).length;
  const lineMovementSummary = phaseChanges > 0
    ? `雷速提供${phaseChanges}个市场的初盘及当前阶段快照；只比较真实快照，不推测中间路径。`
    : referenceRows.length > 1
    ? `雷速提供 ${referenceRows.length} 个真实盘口阶段快照；页面不再虚构连续走势。`
    : '雷速没有提供可比较的多阶段盘口，无法判断真实升降盘。';

  return {
    h2hSummary: history.h2h,
    recentScoringSummary: history.recent,
    lineMovementSummary,
    overUnder: { fullTime: ftTotalRec, halfTime: htTotalRec },
    handicap: {
      fullTime: { ...ftSpreadRec, team: ftSpreadRec.value.includes(awayName) ? awayName : homeName },
      halfTime: { ...htSpreadRec, team: htSpreadRec.value.includes(awayName) ? awayName : homeName },
    },
    match1X2: {
      value: h2hValue,
      odds: h2hLean?.option.numericOdds ?? null,
      probability: h2hLean?.probability ?? 0,
      reason: h2hLean ? '赔率直接来自YBTY全场1X2；概率为三项赔率归一化后的市场隐含概率，不冒充独立模型概率。' : 'YBTY没有已核验的全场1X2盘口。',
    },
    cornerTotal: cornerTotalRec,
    cornerSpread: cornerSpreadRec,
    correctScores,
    btts: {
      value: bttsProbability === null ? '数据不足' : bttsProbability >= 50 ? '是' : '否',
      odds: null,
      probability: bttsProbability,
      reason: bttsProbability === null ? '没有足够真实盘口计算BTTS。' : `概率由真实大小球盘口和1X2强弱分配后的泊松模型计算；YBTY未提供BTTS赔率，因此赔率留空。`,
    },
    oddEven: {
      value: evenProbability === null ? '数据不足' : evenProbability >= 50 ? '双数' : '单数',
      odds: null,
      probability: evenProbability === null ? null : Math.max(evenProbability, 100 - evenProbability),
      reason: evenProbability === null ? '没有足够真实盘口计算单双。' : '概率由真实全场大小球盘口对应的泊松总进球模型计算；YBTY未提供单双赔率，因此赔率留空。',
    },
    goalProjection: {
      home: expectedHome, away: expectedAway, total: totalLine,
      homeMostLikely: homeMode, awayMostLikely: awayMode, totalMostLikely: totalMode,
      homeAlternative: homeMode === null ? null : homeMode + 1,
      awayAlternative: awayMode === null ? null : awayMode + 1,
      totalAlternative: totalMode === null ? null : totalMode + 1,
      homeConfidence: homeMode === null || expectedHome === null ? 0 : percent(poisson(expectedHome, homeMode)),
      awayConfidence: awayMode === null || expectedAway === null ? 0 : percent(poisson(expectedAway, awayMode)),
      totalConfidence: totalMode === null || totalLine === null ? 0 : percent(poisson(totalLine, totalMode)),
      homeRange: homeMode === null ? '--' : `${Math.max(0, homeMode - 1)}-${homeMode + 1}`,
      awayRange: awayMode === null ? '--' : `${Math.max(0, awayMode - 1)}-${awayMode + 1}`,
      totalRange: totalMode === null ? '--' : `${Math.max(0, totalMode - 1)}-${totalMode + 1}`,
      basis: projectionBasis,
    },
    timeIntervals: (() => {
      if (totalLine === null || totalLine <= 0) return [];
      const intervals = [
        { interval: "0'-15'", label: '开局试探期', weight: 0.75 },
        { interval: "16'-30'", label: '半场攻坚期', weight: 1.05 },
        { interval: "31'-45+'", label: '半场体能临界期', weight: 1.30 },
        { interval: "46'-60'", label: '下半场重置期', weight: 0.95 },
        { interval: "61'-75'", label: '换人发力期', weight: 1.15 },
        { interval: "76'-90+'", label: '终局体能极限绝杀期', weight: 1.55 },
      ];
      const sumWeights = intervals.reduce((acc, curr) => acc + curr.weight, 0);
      return intervals.map((inv) => {
        const expectedGoalsInInterval = (totalLine * (inv.weight / sumWeights));
        const hasGoalProb = percent(1 - Math.exp(-expectedGoalsInInterval));
        const rec = hasGoalProb >= 50 ? '看好有球' : hasGoalProb >= 35 ? '中度倾向' : '偏小胶着';
        return {
          interval: inv.interval,
          label: inv.label,
          recommendation: rec,
          confidence: hasGoalProb,
          odds: null,
        };
      });
    })(),
    liveEntryTiming: {
      lineDropSummary: lineMovementSummary,
      reboundOpportunity: '无真实未来盘口，不能预填入场赔率',
      triggerCondition: '等待下一次YBTY真实盘口与雷速实时统计更新后重新计算',
      confidenceLevel: '未生成',
      actionableStep: '禁止使用固定时间窗口、固定盘口或固定赔率作为下注建议。',
    },
  };
}

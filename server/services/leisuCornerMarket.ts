/**
 * Leisu Corner Market Extraction & Quantitative Pricing Engine
 * 
 * Supports:
 * 1. Full-Time Corner Over/Under (全场角球大小)
 * 2. Full-Time Corner Handicap / Spread (全场角球让球)
 * 
 * Extracts live & pre-match corner odds from Leisu reference odds,
 * strips bookmaker margin, and calculates Poisson probabilities and +EV value edges.
 */

export interface LeisuCornerOption {
  option_id: string; // e.g. 'leisu_corner_total__over_9.5'
  side: 'over' | 'under' | 'home' | 'away';
  line: number;
  odds: number;
  fair_odds?: number;
  fair_prob_pct?: number;
  model_prob_pct?: number;
  value_edge?: number;
}

export interface LeisuCornerMarket {
  market: 'full_corner_total' | 'full_corner_spread';
  category: '全场角球大小' | '全场角球让球';
  available: boolean;
  source: 'leisu_live' | 'leisu_prematch' | 'none';
  line: number | null;
  overround_pct?: number;
  options: LeisuCornerOption[];
  unavailable_reason?: string;
}

export interface CornerQuantitativePricing {
  has_corner_markets: boolean;
  expected_total_corners: number;
  expected_corner_margin_home_minus_away: number;
  corner_velocity_per_10min: number;
  current_corners: { home: number; away: number; total: number };
  markets: LeisuCornerMarket[];
  tactical_summary_zh: string;
}

/**
 * Poisson cumulative probability: P(X >= k)
 */
function poissonAtLeast(lambda: number, k: number): number {
  if (lambda <= 0 || k <= 0) return 1.0;
  let sum = 0;
  let term = Math.exp(-lambda); // for i = 0
  sum += term;
  for (let i = 1; i < k; i++) {
    term = (term * lambda) / i;
    sum += term;
  }
  return Math.max(0.01, Math.min(0.99, 1.0 - sum));
}

/**
 * Extract corner markets from Leisu data payload (pre-match and live)
 */
export function extractLeisuCornerMarkets(item: any): LeisuCornerMarket[] {
  const cornerTotals: LeisuCornerMarket = {
    market: 'full_corner_total',
    category: '全场角球大小',
    available: false,
    source: 'none',
    line: null,
    options: [],
    unavailable_reason: '雷速未提供本场全场角球大小盘口',
  };

  const cornerSpread: LeisuCornerMarket = {
    market: 'full_corner_spread',
    category: '全场角球让球',
    available: false,
    source: 'none',
    line: null,
    options: [],
    unavailable_reason: '雷速未提供本场全场角球让球盘口',
  };

  if (!item || typeof item !== 'object') {
    return [cornerTotals, cornerSpread];
  }

  // Helper to convert HK odds (e.g. 0.85 -> 1.85) to standard decimal odds
  const toDecimalOdds = (val: any): number => {
    let num = typeof val === 'number' ? val : parseFloat(String(val || '').replace(/[^\d.-]/g, ''));
    if (isNaN(num) || num <= 0) return 0;
    if (num < 1.05) {
      num = Number((num + 1.0).toFixed(3));
    }
    return Number(num.toFixed(2));
  };

  // Helper to pick active phase object (live -> pregame -> initial -> direct)
  const pickActiveOddsObj = (container: any, isLiveMatch: boolean) => {
    if (!container || typeof container !== 'object') return null;
    if (isLiveMatch && container.live && typeof container.live === 'object') return container.live;
    if (container.pregame && typeof container.pregame === 'object') return container.pregame;
    if (container.initial && typeof container.initial === 'object') return container.initial;
    if (container.current && typeof container.current === 'object') return container.current;
    if (container.opening && typeof container.opening === 'object') return container.opening;
    return container;
  };

  // 1. Try to locate corner odds across various Leisu payload positions
  const formalOdds = item?.detail_context?.formal?.odds || item?.detail_context?.formal?.static_match?.odds || {};
  const refOdds = item?.reference_odds || {};
  const rows = Array.isArray(refOdds?.normalized_rows) ? refOdds.normalized_rows : [];

  const isLive = Boolean(item?.minute && Number(item.minute) > 0);
  const source = isLive ? 'leisu_live' : 'leisu_prematch';

  // Corner Total Candidates (check nested markets.corners, direct corners, etc.)
  const cornerTotalContainer = formalOdds?.markets?.corners || refOdds?.markets?.corners || formalOdds?.corners || formalOdds?.corner_total || formalOdds?.corner_ou || refOdds?.corners || refOdds?.corner_total || refOdds?.corner_ou;
  const cornerTotalRaw = pickActiveOddsObj(cornerTotalContainer, isLive);

  // Corner Handicap Candidates
  const cornerSpreadContainer = formalOdds?.markets?.corner_handicap || formalOdds?.markets?.corner_spread || refOdds?.markets?.corner_handicap || refOdds?.markets?.corner_spread || formalOdds?.corner_handicap || formalOdds?.corner_spread || refOdds?.corner_handicap || refOdds?.corner_spread;
  const cornerSpreadRaw = pickActiveOddsObj(cornerSpreadContainer, isLive);

  // Parse Corner Totals
  if (cornerTotalRaw && typeof cornerTotalRaw === 'object') {
    const rawLine = cornerTotalRaw.line ?? cornerTotalRaw.total ?? cornerTotalRaw.ou_line;
    const overOdds = toDecimalOdds(cornerTotalRaw.over ?? cornerTotalRaw.over_odds ?? cornerTotalRaw.o);
    const underOdds = toDecimalOdds(cornerTotalRaw.under ?? cornerTotalRaw.under_odds ?? cornerTotalRaw.u);
    const lineNum = typeof rawLine === 'number' ? rawLine : parseFloat(String(rawLine || '').replace(/[^\d.-]/g, ''));

    if (!isNaN(lineNum) && lineNum > 0 && overOdds >= 1.05 && underOdds >= 1.05) {
      cornerTotals.available = true;
      cornerTotals.source = source;
      cornerTotals.line = lineNum;
      cornerTotals.unavailable_reason = undefined;

      const overround = ((1 / overOdds) + (1 / underOdds) - 1) * 100;
      cornerTotals.overround_pct = Number(overround.toFixed(2));

      const fairOverProb = (1 / overOdds) / ((1 / overOdds) + (1 / underOdds));
      const fairUnderProb = (1 / underOdds) / ((1 / overOdds) + (1 / underOdds));

      cornerTotals.options = [
        {
          option_id: `leisu_corner_total__over_${lineNum}`,
          side: 'over',
          line: lineNum,
          odds: overOdds,
          fair_odds: Number((1 / fairOverProb).toFixed(2)),
          fair_prob_pct: Number((fairOverProb * 100).toFixed(1)),
        },
        {
          option_id: `leisu_corner_total__under_${lineNum}`,
          side: 'under',
          line: lineNum,
          odds: underOdds,
          fair_odds: Number((1 / fairUnderProb).toFixed(2)),
          fair_prob_pct: Number((fairUnderProb * 100).toFixed(1)),
        },
      ];
    }
  }

  // Parse Corner Spread / Handicap
  if (cornerSpreadRaw && typeof cornerSpreadRaw === 'object') {
    const rawLine = cornerSpreadRaw.line ?? cornerSpreadRaw.handicap ?? cornerSpreadRaw.spread_line;
    const homeOdds = toDecimalOdds(cornerSpreadRaw.home ?? cornerSpreadRaw.home_odds ?? cornerSpreadRaw.h);
    const awayOdds = toDecimalOdds(cornerSpreadRaw.away ?? cornerSpreadRaw.away_odds ?? cornerSpreadRaw.a);
    const lineNum = typeof rawLine === 'number' ? rawLine : parseFloat(String(rawLine || '').replace(/[^\d.-]/g, ''));

    if (!isNaN(lineNum) && homeOdds >= 1.05 && awayOdds >= 1.05) {
      cornerSpread.available = true;
      cornerSpread.source = source;
      cornerSpread.line = lineNum;
      cornerSpread.unavailable_reason = undefined;

      const overround = ((1 / homeOdds) + (1 / awayOdds) - 1) * 100;
      cornerSpread.overround_pct = Number(overround.toFixed(2));

      const fairHomeProb = (1 / homeOdds) / ((1 / homeOdds) + (1 / awayOdds));
      const fairAwayProb = (1 / awayOdds) / ((1 / homeOdds) + (1 / awayOdds));

      cornerSpread.options = [
        {
          option_id: `leisu_corner_spread__home_${lineNum >= 0 ? `+${lineNum}` : lineNum}`,
          side: 'home',
          line: lineNum,
          odds: homeOdds,
          fair_odds: Number((1 / fairHomeProb).toFixed(2)),
          fair_prob_pct: Number((fairHomeProb * 100).toFixed(1)),
        },
        {
          option_id: `leisu_corner_spread__away_${-lineNum >= 0 ? `+${-lineNum}` : -lineNum}`,
          side: 'away',
          line: -lineNum,
          odds: awayOdds,
          fair_odds: Number((1 / fairAwayProb).toFixed(2)),
          fair_prob_pct: Number((fairAwayProb * 100).toFixed(1)),
        },
      ];
    }
  }

  // Also check rows if available
  if (!cornerTotals.available && rows.length > 0) {
    for (const r of rows) {
      const type = String(r.market_type || r.type || r.name || '').toLowerCase();
      if ((type.includes('corner') || type.includes('角球')) && (type.includes('ou') || type.includes('大小') || type.includes('total'))) {
        const line = Number(r.line ?? r.handicap ?? r.total ?? 0);
        const over = Number(r.over_odds ?? r.over ?? r.h ?? 0);
        const under = Number(r.under_odds ?? r.under ?? r.a ?? 0);
        if (line > 0 && over > 1.05 && under > 1.05) {
          cornerTotals.available = true;
          cornerTotals.source = source;
          cornerTotals.line = line;
          cornerTotals.unavailable_reason = undefined;
          cornerTotals.options = [
            { option_id: `leisu_corner_total__over_${line}`, side: 'over', line, odds: over },
            { option_id: `leisu_corner_total__under_${line}`, side: 'under', line, odds: under },
          ];
          break;
        }
      }
    }
  }

  return [cornerTotals, cornerSpread];
}

/**
 * Full quantitative evaluation for Corner Over/Under and Corner Handicap
 */
export function evaluateLeisuCornerQuantitativePricing(
  item: any,
  minute: number = 0
): CornerQuantitativePricing {
  const stats = item?.live_statistics || item?.detail_context?.formal?.live_match?.confirmed_statistics || {};
  const homeCorners = Number(stats?.home?.corner_kicks ?? stats?.home?.corners ?? 0);
  const awayCorners = Number(stats?.away?.corner_kicks ?? stats?.away?.corners ?? 0);
  const currentTotal = homeCorners + awayCorners;

  const markets = extractLeisuCornerMarkets(item);
  const totalMarket = markets.find((m) => m.market === 'full_corner_total');
  const spreadMarket = markets.find((m) => m.market === 'full_corner_spread');

  // Baseline full time corner lambda
  const elapsed = Math.max(0, Math.min(90, minute));
  const remainingMins = Math.max(0, 90 - elapsed);
  const velocityPer10 = elapsed >= 5 ? Number(((currentTotal / elapsed) * 10).toFixed(2)) : 1.05;

  let expectedTotal = 9.5;
  let expectedMargin = 0.0;

  if (elapsed >= 5) {
    // In-play non-linear projection
    const phaseWeight = elapsed >= 75 ? 1.25 : elapsed >= 45 ? 1.05 : 0.95;
    const remainingLambda = (velocityPer10 / 10) * remainingMins * phaseWeight;
    expectedTotal = Number((currentTotal + remainingLambda).toFixed(1));
    
    // Spread projection
    const homeShare = currentTotal > 0 ? homeCorners / currentTotal : 0.5;
    const expHomeCorners = homeCorners + remainingLambda * homeShare;
    const expAwayCorners = awayCorners + remainingLambda * (1 - homeShare);
    expectedMargin = Number((expHomeCorners - expAwayCorners).toFixed(1));
  } else {
    // Pre-match projection
    expectedTotal = 9.8;
    expectedMargin = 0.5; // Slight home advantage baseline
  }

  let tacticalNote = '';

  // 1. Evaluate Corner Total Over/Under Options
  if (totalMarket && totalMarket.available && totalMarket.line !== null) {
    const line = totalMarket.line;
    // Calculate probability of total >= line + 0.5 (for integer/half lines)
    const needed = Math.max(1, Math.ceil(line + 0.01) - currentTotal);
    const remainingLambda = Math.max(0.1, expectedTotal - currentTotal);
    const probOver = poissonAtLeast(remainingLambda, needed);
    const probUnder = 1.0 - probOver;

    for (const opt of totalMarket.options) {
      const modelProb = opt.side === 'over' ? probOver : probUnder;
      opt.model_prob_pct = Number((modelProb * 100).toFixed(1));
      if (opt.fair_prob_pct) {
        opt.value_edge = Number((opt.model_prob_pct - opt.fair_prob_pct).toFixed(1));
      }
    }
  }

  // 2. Evaluate Corner Spread Options
  if (spreadMarket && spreadMarket.available && spreadMarket.line !== null) {
    const spreadLine = spreadMarket.line; // e.g. -1.5 (Home needs to win by >= 2 corners)
    // Estimate prob that expectedMargin > -spreadLine
    const diff = expectedMargin + spreadLine;
    // Sigmoid mapping for margin spread probability
    const homeSpreadProb = Math.max(0.05, Math.min(0.95, 1 / (1 + Math.exp(-diff * 0.7))));
    const awaySpreadProb = 1 - homeSpreadProb;

    for (const opt of spreadMarket.options) {
      const modelProb = opt.side === 'home' ? homeSpreadProb : awaySpreadProb;
      opt.model_prob_pct = Number((modelProb * 100).toFixed(1));
      if (opt.fair_prob_pct) {
        opt.value_edge = Number((opt.model_prob_pct - opt.fair_prob_pct).toFixed(1));
      }
    }
  }

  const hasAnyMarket = markets.some((m) => m.available);
  if (hasAnyMarket) {
    tacticalNote = `【角球精算与雷速盘口联动】当前累计${currentTotal}角(主${homeCorners}:客${awayCorners}), 每10分钟${velocityPer10}角, 全场预期${expectedTotal}角(净胜角球期望${expectedMargin > 0 ? '+' : ''}${expectedMargin})。`;
  } else {
    tacticalNote = '雷速未开售本场角球大小或让球盘口，系统已按契约安全标注 unavailable，不予推荐。';
  }

  return {
    has_corner_markets: hasAnyMarket,
    expected_total_corners: expectedTotal,
    expected_corner_margin_home_minus_away: expectedMargin,
    corner_velocity_per_10min: velocityPer10,
    current_corners: { home: homeCorners, away: awayCorners, total: currentTotal },
    markets,
    tactical_summary_zh: tacticalNote,
  };
}

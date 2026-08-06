export interface SettlementParams {
  market: string; // e.g. "全场大球", "全场小球", "大球", "小球", "主队让球", "客队让球", "让球", "full_total", "full_spread", "full_h2h"
  line: string | number; // e.g. 2.25, 2.75, "2/2.5", "2.5/3", -0.25, "-0.5/-1"
  odds?: number; // e.g. 1.92
  scoreAtRec?: { home: number; away: number } | null;
  finalScore?: { home: number; away: number } | null;
  scoreVerified?: boolean; // Rule #4 constraint
  isLive?: boolean;
}

export interface SplitOutcome {
  line: number;
  outcome: 'win' | 'loss' | 'push';
  label: string;
}

export interface SettlementDetail {
  outcome: 'win' | 'half_win' | 'push' | 'half_loss' | 'loss' | 'invalid_data' | 'pending';
  outcomeLabel: string;
  badgeColor: string; // Tailwind color classes
  badgeBg: string;
  badgeText: string;
  numericLine: number;
  isQuarterLine: boolean;
  quarterSplitText: string;
  
  // Explanation & Math
  isLive: boolean;
  scoreAtRecStr: string;
  finalScoreStr: string;
  effectiveValue: number; // Effective goals or goal diff
  calculationExplanation: string;
  
  // Financial Returns
  odds: number;
  netProfitUnit: number; // Net profit per 1 unit stake
  netProfitText: string; // e.g. "+0.45u", "-0.50u"
  payoutReturnText: string; // e.g. "返还 1.45u"
  
  // Half-bet details
  splitA?: SplitOutcome;
  splitB?: SplitOutcome;
}

/**
 * Parse any line representation into a normalized floating point number.
 * Supports "2.25", "2/2.5", "2.5/3", "-0/0.5", "-0.5/-1", "+0.5/+1", "大 2.25", etc.
 */
export function parseQuarterLine(lineInput: string | number): number {
  if (typeof lineInput === 'number') return lineInput;
  if (!lineInput) return 0;

  const str = String(lineInput).trim().replace(/\s+/g, '');

  // Handle fractional split notation like "2/2.5", "2.5/3", "-0/0.5", "-0.5/-1", "+0.5/+1"
  const splitMatch = str.match(/^([+-]?\d*(?:\.\d+)?)\/([+-]?\d*(?:\.\d+)?)$/);
  if (splitMatch) {
    const v1 = parseFloat(splitMatch[1]);
    const v2 = parseFloat(splitMatch[2]);
    if (!isNaN(v1) && !isNaN(v2)) {
      return (v1 + v2) / 2;
    }
  }

  // Extract signed numeric value
  const numMatch = str.match(/([+-]?\d+(?:\.\d+)?)/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    if (!isNaN(val)) return val;
  }
  return 0;
}

/**
 * Format numeric lines into Asian quarter line notation:
 * 0.25 -> "0/0.5"
 * 0.75 -> "0.5/1"
 * 1.25 -> "1/1.5"
 * 1.75 -> "1.5/2"
 * 2.25 -> "2/2.5"
 * 2.75 -> "2.5/3"
 * -0.75 -> "-0.5/1"
 * -0.25 -> "-0/0.5"
 */
export function formatAsianLine(rawLine: string | number): string {
  if (rawLine === undefined || rawLine === null || rawLine === '') return '0';
  const str = String(rawLine).trim();
  
  if (str.includes('/') || isNaN(Number(str))) return str;
  
  const num = parseFloat(str);
  if (isNaN(num)) return str;

  const isNegative = num < 0;
  const abs = Math.abs(num);
  const frac = Math.round((abs - Math.floor(abs)) * 100);

  const sign = isNegative ? '-' : (num > 0 && str.startsWith('+') ? '+' : '');

  if (frac === 25) {
    const low = Math.floor(abs);
    const high = low + 0.5;
    return `${sign}${low}/${high}`;
  } else if (frac === 75) {
    const low = Math.floor(abs) + 0.5;
    const high = Math.floor(abs) + 1;
    return `${sign}${low}/${high}`;
  }

  return str;
}

/**
 * Check whether a line is a quarter line (.25 or .75)
 */
export function isQuarterLine(line: number): boolean {
  const abs = Math.abs(line);
  const frac = Math.round((abs - Math.floor(abs)) * 100);
  return frac === 25 || frac === 75;
}

/**
 * Split a quarter line into two half-bets
 */
export function getQuarterSplits(line: number): { lineA: number; lineB: number } {
  return {
    lineA: Math.round((line - 0.25) * 100) / 100,
    lineB: Math.round((line + 0.25) * 100) / 100,
  };
}

/**
 * Determine market direction and category
 */
export function classifyMarket(marketStr: string): {
  type: 'total_over' | 'total_under' | 'spread_home' | 'spread_away' | 'h2h_home' | 'h2h_away' | 'h2h_draw';
  displayName: string;
} {
  const m = (marketStr || '').toLowerCase();

  if (m.includes('小') || m.includes('under')) {
    return { type: 'total_under', displayName: '全场小球' };
  }
  if (m.includes('大') || m.includes('over') || m.includes('total')) {
    return { type: 'total_over', displayName: '全场大球' };
  }
  if (m.includes('客') || m.includes('away')) {
    return { type: 'spread_away', displayName: '客队让球' };
  }
  if (m.includes('主') || m.includes('home') || m.includes('spread') || m.includes('让球')) {
    return { type: 'spread_home', displayName: '主队让球' };
  }
  if (m.includes('平') || m.includes('draw')) {
    return { type: 'h2h_draw', displayName: '平局' };
  }

  return { type: 'total_over', displayName: '全场大球' };
}

/**
 * Core Settlement Engine
 */
export function evaluateQuarterSettlement(params: SettlementParams): SettlementDetail {
  const {
    market,
    line: rawLine,
    odds: rawOdds = 1.90,
    scoreAtRec = { home: 0, away: 0 },
    finalScore,
    scoreVerified = true,
    isLive = false,
  } = params;

  const odds = Number(rawOdds) > 1 ? Number(rawOdds) : 1.90;
  const line = parseQuarterLine(rawLine);
  const quarter = isQuarterLine(line);
  const marketCategory = classifyMarket(market);

  // If final score is missing or review is pending
  if (!finalScore || finalScore.home === undefined || finalScore.away === undefined) {
    return {
      outcome: 'pending',
      outcomeLabel: '待核实 (Pending)',
      badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
      badgeBg: 'bg-slate-800',
      badgeText: 'text-slate-400',
      numericLine: line,
      isQuarterLine: quarter,
      quarterSplitText: quarter ? `拆分盘口 (${line - 0.25} / ${line + 0.25})` : `单线盘口 (${line})`,
      isLive,
      scoreAtRecStr: `${scoreAtRec?.home ?? 0}-${scoreAtRec?.away ?? 0}`,
      finalScoreStr: '未完场',
      effectiveValue: 0,
      calculationExplanation: '等待赛后完场比分核实',
      odds,
      netProfitUnit: 0,
      netProfitText: '0.00u',
      payoutReturnText: '待结算',
    };
  }

  // Rule #4: Unverified score -> invalid_data
  if (scoreVerified === false) {
    return {
      outcome: 'invalid_data',
      outcomeLabel: '无效数据 (Invalid Data)',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      badgeBg: 'bg-amber-500/20',
      badgeText: 'text-amber-300',
      numericLine: line,
      isQuarterLine: quarter,
      quarterSplitText: quarter ? `拆分盘口 (${line - 0.25} / ${line + 0.25})` : `单线盘口 (${line})`,
      isLive,
      scoreAtRecStr: `${scoreAtRec?.home ?? 0}-${scoreAtRec?.away ?? 0}`,
      finalScoreStr: `${finalScore.home}-${finalScore.away}`,
      effectiveValue: 0,
      calculationExplanation: '比分未经双源校验，标记为无效数据，不计盈亏',
      odds,
      netProfitUnit: 0,
      netProfitText: '0.00u',
      payoutReturnText: '不计盈亏',
    };
  }

  // Calculate effective value based on market type & Rule #5 / Rule #6
  let effectiveValue = 0;
  let calculationExplanation = '';

  const recH = scoreAtRec?.home ?? 0;
  const recA = scoreAtRec?.away ?? 0;
  const finH = finalScore.home;
  const finA = finalScore.away;

  if (marketCategory.type === 'total_over' || marketCategory.type === 'total_under') {
    if (isLive) {
      // Rule #5: In-play total goals = Final Total Goals - Rec Total Goals
      const totalFin = finH + finA;
      const totalRec = recH + recA;
      effectiveValue = totalFin - totalRec;
      calculationExplanation = `滚球剩余进球: 完场总进球 (${totalFin}) - 推荐时已有 (${totalRec}) = ${effectiveValue} 进球`;
    } else {
      effectiveValue = finH + finA;
      calculationExplanation = `全场总进球: 主 (${finH}) + 客 (${finA}) = ${effectiveValue} 进球`;
    }
  } else if (marketCategory.type.startsWith('spread')) {
    if (isLive) {
      // Rule #6: In-play spread = Net goal diff in remaining time
      const diffH = finH - recH;
      const diffA = finA - recA;
      if (marketCategory.type === 'spread_home') {
        effectiveValue = diffH - diffA;
        calculationExplanation = `滚球剩余让球 (主): 推荐后主队加球 (${diffH}) - 客队加球 (${diffA}) = 净胜 ${effectiveValue} 球`;
      } else {
        effectiveValue = diffA - diffH;
        calculationExplanation = `滚球剩余让球 (客): 推荐后客队加球 (${diffA}) - 主队加球 (${diffH}) = 净胜 ${effectiveValue} 球`;
      }
    } else {
      if (marketCategory.type === 'spread_home') {
        effectiveValue = finH - finA;
        calculationExplanation = `全场让球 (主): 主队 (${finH}) - 客队 (${finA}) = 净胜 ${effectiveValue} 球`;
      } else {
        effectiveValue = finA - finH;
        calculationExplanation = `全场让球 (客): 客队 (${finA}) - 主队 (${finH}) = 净胜 ${effectiveValue} 球`;
      }
    }
  } else {
    // H2H / 独赢
    effectiveValue = finH - finA;
    calculationExplanation = `全场比分: 主 (${finH}) - 客 (${finA})`;
  }

  // Single line evaluator helper
  const evalSingleLine = (singleLine: number): 'win' | 'loss' | 'push' => {
    if (marketCategory.type === 'total_over') {
      if (effectiveValue > singleLine) return 'win';
      if (effectiveValue === singleLine) return 'push';
      return 'loss';
    }
    if (marketCategory.type === 'total_under') {
      if (effectiveValue < singleLine) return 'win';
      if (effectiveValue === singleLine) return 'push';
      return 'loss';
    }
    if (marketCategory.type.startsWith('spread')) {
      const adjusted = effectiveValue + singleLine;
      if (adjusted > 0) return 'win';
      if (adjusted === 0) return 'push';
      return 'loss';
    }
    if (marketCategory.type === 'h2h_home') {
      return finH > finA ? 'win' : 'loss';
    }
    if (marketCategory.type === 'h2h_away') {
      return finA > finH ? 'win' : 'loss';
    }
    if (marketCategory.type === 'h2h_draw') {
      return finH === finA ? 'win' : 'loss';
    }
    return 'loss';
  };

  let outcome: 'win' | 'half_win' | 'push' | 'half_loss' | 'loss' = 'loss';
  let splitA: SplitOutcome | undefined;
  let splitB: SplitOutcome | undefined;
  let quarterSplitText = '';

  if (quarter) {
    const { lineA, lineB } = getQuarterSplits(line);
    const resA = evalSingleLine(lineA);
    const resB = evalSingleLine(lineB);

    const getResLabel = (r: 'win' | 'loss' | 'push') => (r === 'win' ? '全赢' : r === 'push' ? '走盘' : '全输');

    splitA = { line: lineA, outcome: resA, label: `${lineA > 0 ? '+' : ''}${lineA} (${getResLabel(resA)})` };
    splitB = { line: lineB, outcome: resB, label: `${lineB > 0 ? '+' : ''}${lineB} (${getResLabel(resB)})` };

    quarterSplitText = `四分之一拆分: [ ${splitA.label} ] + [ ${splitB.label} ]`;

    if (resA === 'win' && resB === 'win') {
      outcome = 'win';
    } else if ((resA === 'win' && resB === 'push') || (resA === 'push' && resB === 'win')) {
      outcome = 'half_win';
    } else if (resA === 'push' && resB === 'push') {
      outcome = 'push';
    } else if ((resA === 'loss' && resB === 'push') || (resA === 'push' && resB === 'loss')) {
      outcome = 'half_loss';
    } else {
      outcome = 'loss';
    }
  } else {
    const singleRes = evalSingleLine(line);
    outcome = singleRes;
    quarterSplitText = `单盘口 (${line > 0 ? '+' : ''}${line})`;
  }

  // Calculate Net Profit
  let netProfitUnit = 0;
  if (outcome === 'win') {
    netProfitUnit = Math.round((odds - 1) * 100) / 100;
  } else if (outcome === 'half_win') {
    netProfitUnit = Math.round(((odds - 1) / 2) * 100) / 100;
  } else if (outcome === 'push') {
    netProfitUnit = 0;
  } else if (outcome === 'half_loss') {
    netProfitUnit = -0.5;
  } else if (outcome === 'loss') {
    netProfitUnit = -1.0;
  }

  const netProfitText = netProfitUnit >= 0 ? `+${netProfitUnit.toFixed(2)}u` : `${netProfitUnit.toFixed(2)}u`;
  const payoutReturnText =
    netProfitUnit > 0
      ? `返还 ${(1 + netProfitUnit).toFixed(2)}u`
      : outcome === 'push'
      ? '返还 1.00u (走盘)'
      : outcome === 'half_loss'
      ? '返还 0.50u (亏损0.5u)'
      : '无返还 (0.00u)';

  // Label and Styling
  let outcomeLabel = '全胜';
  let badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  let badgeBg = 'bg-emerald-500/20';
  let badgeText = 'text-emerald-300';

  switch (outcome) {
    case 'win':
      outcomeLabel = '全赢 (Win)';
      badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      badgeBg = 'bg-emerald-500/20';
      badgeText = 'text-emerald-300';
      break;
    case 'half_win':
      outcomeLabel = '赢半 (Half Win)';
      badgeColor = 'bg-teal-500/20 text-teal-300 border-teal-500/40';
      badgeBg = 'bg-teal-500/20';
      badgeText = 'text-teal-300';
      break;
    case 'push':
      outcomeLabel = '走盘 (Push)';
      badgeColor = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      badgeBg = 'bg-sky-500/20';
      badgeText = 'text-sky-300';
      break;
    case 'half_loss':
      outcomeLabel = '输半 (Half Loss)';
      badgeColor = 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      badgeBg = 'bg-orange-500/20';
      badgeText = 'text-orange-300';
      break;
    case 'loss':
      outcomeLabel = '全输 (Loss)';
      badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      badgeBg = 'bg-rose-500/20';
      badgeText = 'text-rose-300';
      break;
  }

  return {
    outcome,
    outcomeLabel,
    badgeColor,
    badgeBg,
    badgeText,
    numericLine: line,
    isQuarterLine: quarter,
    quarterSplitText,
    isLive,
    scoreAtRecStr: `${recH}-${recA}`,
    finalScoreStr: `${finH}-${finA}`,
    effectiveValue,
    calculationExplanation,
    odds,
    netProfitUnit,
    netProfitText,
    payoutReturnText,
    splitA,
    splitB,
  };
}

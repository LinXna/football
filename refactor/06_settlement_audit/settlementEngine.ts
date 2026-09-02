import { SettlementOutcome, VerifiedScore } from './types.js';

export type QuarterMarketCategory = 
  | 'SPREAD_HOME' 
  | 'SPREAD_AWAY' 
  | 'TOTAL_OVER' 
  | 'TOTAL_UNDER' 
  | 'H2H_HOME'
  | 'H2H_AWAY'
  | 'H2H_DRAW'
  | 'UNKNOWN_DIRECTION';

export interface QuarterSettlementParams {
  market_category: QuarterMarketCategory;
  line: number;
  odds: number;
  is_live: boolean;
  basis?: 'FULL_MATCH' | 'REMAINING_GOALS' | 'REMAINING_PERIOD_DOMINANCE';
  score_at_rec: VerifiedScore;
  final_score: VerifiedScore | null;
  score_verified: boolean;
}

export interface QuarterSettlementResult {
  outcome: SettlementOutcome;
  net_profit_unit: number;
  payout_multiplier: number;
  explanation: string;
}

export function parseAsianLine(rawLine: string | number): number {
  if (typeof rawLine === 'number') return rawLine;
  if (!rawLine) return 0;
  const str = String(rawLine).trim().replace(/\s+/g, '');
  const splitMatch = str.match(/^([+-]?\d*(?:\.\d+)?)\/([+-]?\d*(?:\.\d+)?)$/);
  if (splitMatch) {
    const isNegative = splitMatch[1].startsWith('-') || splitMatch[2].startsWith('-');
    const v1Abs = Math.abs(parseFloat(splitMatch[1]) || 0);
    const v2Abs = Math.abs(parseFloat(splitMatch[2]) || 0);
    const v1 = isNegative ? -v1Abs : v1Abs;
    const v2 = isNegative ? -v2Abs : v2Abs;
    if (!isNaN(v1) && !isNaN(v2)) {
      return (v1 + v2) / 2;
    }
  }
  const numMatch = str.match(/([+-]?\d+(?:\.\d+)?)/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    if (!isNaN(val)) return val;
  }
  return 0;
}

export function isQuarterLine(line: number): boolean {
  const abs = Math.abs(line);
  const frac = Math.round((abs - Math.floor(abs)) * 100);
  return frac === 25 || frac === 75;
}

export function getQuarterSplits(line: number): { lineA: number; lineB: number } {
  return {
    lineA: Math.round((line - 0.25) * 100) / 100,
    lineB: Math.round((line + 0.25) * 100) / 100,
  };
}

export function evaluateQuarterSettlement(params: QuarterSettlementParams): QuarterSettlementResult {
  const {
    market_category,
    line,
    odds,
    score_at_rec,
    final_score,
    score_verified,
    is_live,
    basis
  } = params;

  if (market_category === 'UNKNOWN_DIRECTION') {
    return { outcome: 'INVALID', net_profit_unit: 0, payout_multiplier: 0, explanation: 'Direction unknown.' };
  }
  
  if (!score_verified) {
    return { outcome: 'INVALID', net_profit_unit: 0, payout_multiplier: 0, explanation: 'Score not verified.' };
  }

  if (final_score === null) {
    return { outcome: 'PENDING', net_profit_unit: 0, payout_multiplier: 0, explanation: 'Match not finished.' };
  }

  let effectiveValue = 0;
  let explanation = '';
  
  const finH = final_score.home;
  const finA = final_score.away;
  const recH = score_at_rec.home;
  const recA = score_at_rec.away;

  if (market_category === 'TOTAL_OVER' || market_category === 'TOTAL_UNDER') {
    if (is_live && basis === 'REMAINING_GOALS') {
      const totalFin = finH + finA;
      const totalRec = recH + recA;
      effectiveValue = totalFin - totalRec;
      explanation = `Remaining Total Goals: Final (${totalFin}) - Rec (${totalRec}) = ${effectiveValue}`;
    } else {
      effectiveValue = finH + finA;
      explanation = `Total Goals: ${finH} + ${finA} = ${effectiveValue}`;
    }
  } else if (market_category === 'SPREAD_HOME' || market_category === 'SPREAD_AWAY') {
    if (is_live && basis === 'REMAINING_PERIOD_DOMINANCE') {
      const diffH = finH - recH;
      const diffA = finA - recA;
      if (market_category === 'SPREAD_HOME') {
        effectiveValue = diffH - diffA;
        explanation = `Remaining Spread (Home): Added Home (${diffH}) - Added Away (${diffA}) = ${effectiveValue}`;
      } else {
        effectiveValue = diffA - diffH;
        explanation = `Remaining Spread (Away): Added Away (${diffA}) - Added Home (${diffH}) = ${effectiveValue}`;
      }
    } else {
      if (market_category === 'SPREAD_HOME') {
        effectiveValue = finH - finA;
        explanation = `Spread (Home): Home (${finH}) - Away (${finA}) = ${effectiveValue}`;
      } else {
        effectiveValue = finA - finH;
        explanation = `Spread (Away): Away (${finA}) - Home (${finH}) = ${effectiveValue}`;
      }
    }
  } else {
    // H2H
    effectiveValue = finH - finA;
    explanation = `H2H: Home (${finH}) - Away (${finA})`;
  }

  const evalSingleLine = (singleLine: number): 'WIN' | 'LOSE' | 'PUSH' => {
    if (market_category === 'H2H_HOME') return effectiveValue > 0 ? 'WIN' : 'LOSE';
    if (market_category === 'H2H_AWAY') return effectiveValue < 0 ? 'WIN' : 'LOSE';
    if (market_category === 'H2H_DRAW') return effectiveValue === 0 ? 'WIN' : 'LOSE';

    if (market_category === 'TOTAL_OVER') {
      return effectiveValue > singleLine ? 'WIN' : effectiveValue < singleLine ? 'LOSE' : 'PUSH';
    } else if (market_category === 'TOTAL_UNDER') {
      return effectiveValue < singleLine ? 'WIN' : effectiveValue > singleLine ? 'LOSE' : 'PUSH';
    } else {
      // SPREAD
      return (effectiveValue + singleLine) > 0 ? 'WIN' : (effectiveValue + singleLine) < 0 ? 'LOSE' : 'PUSH';
    }
  };

  if (market_category.startsWith('H2H')) {
    const out = evalSingleLine(0);
    return {
      outcome: out,
      net_profit_unit: out === 'WIN' ? odds - 1 : out === 'PUSH' ? 0 : -1,
      payout_multiplier: out === 'WIN' ? odds : out === 'PUSH' ? 1 : 0,
      explanation
    };
  }

  if (!isQuarterLine(line)) {
    const out = evalSingleLine(line);
    return {
      outcome: out,
      net_profit_unit: out === 'WIN' ? odds - 1 : out === 'PUSH' ? 0 : -1,
      payout_multiplier: out === 'WIN' ? odds : out === 'PUSH' ? 1 : 0,
      explanation
    };
  } else {
    const splits = getQuarterSplits(line);
    const outA = evalSingleLine(splits.lineA);
    const outB = evalSingleLine(splits.lineB);

    let finalOutcome: SettlementOutcome;
    let netProfitUnit = 0;
    let payout = 0;

    if (outA === 'WIN' && outB === 'WIN') {
      finalOutcome = 'WIN';
      netProfitUnit = odds - 1;
      payout = odds;
    } else if (outA === 'LOSE' && outB === 'LOSE') {
      finalOutcome = 'LOSE';
      netProfitUnit = -1;
      payout = 0;
    } else if (outA === 'PUSH' && outB === 'PUSH') {
      finalOutcome = 'PUSH';
      netProfitUnit = 0;
      payout = 1;
    } else if ((outA === 'WIN' && outB === 'PUSH') || (outA === 'PUSH' && outB === 'WIN')) {
      finalOutcome = 'WIN_HALF';
      netProfitUnit = (odds - 1) / 2;
      payout = 1 + (odds - 1) / 2;
    } else if ((outA === 'LOSE' && outB === 'PUSH') || (outA === 'PUSH' && outB === 'LOSE')) {
      finalOutcome = 'LOSE_HALF';
      netProfitUnit = -0.5;
      payout = 0.5;
    } else {
      finalOutcome = 'INVALID';
      netProfitUnit = 0;
      payout = 0;
    }

    return {
      outcome: finalOutcome,
      net_profit_unit: netProfitUnit,
      payout_multiplier: payout,
      explanation: `${explanation}. Split: ${splits.lineA} -> ${outA}, ${splits.lineB} -> ${outB}`
    };
  }
}

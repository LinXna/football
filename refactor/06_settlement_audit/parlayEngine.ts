import { SettlementOutcome } from './types.js';
import { QuarterSettlementResult } from './settlementEngine.js';

export interface ParlayLegResult {
  leg_index: number;
  odds: number;
  settlement: QuarterSettlementResult;
}

export interface ParlaySettlementResult {
  outcome: SettlementOutcome;
  net_profit_unit: number;
  payout_multiplier: number;
  explanation: string;
}

export function evaluateParlaySettlement(legs: ParlayLegResult[]): ParlaySettlementResult {
  if (!legs || legs.length === 0) {
    return {
      outcome: 'INVALID',
      net_profit_unit: 0,
      payout_multiplier: 0,
      explanation: 'No legs provided.',
    };
  }

  let hasFailedLeg = false;
  let pendingCount = 0;
  let invalidCount = 0;
  let completedCount = 0;
  
  let effectiveMultiplier = 1.0;

  for (const leg of legs) {
    const o = leg.settlement.outcome;
    if (o === 'LOSE') {
      hasFailedLeg = true;
      effectiveMultiplier = 0;
    } else if (o === 'PENDING') {
      pendingCount++;
    } else if (o === 'INVALID') {
      invalidCount++;
      effectiveMultiplier = 0;
    } else if (o === 'WIN') {
      completedCount++;
      effectiveMultiplier *= leg.current_odds;
    } else if (o === 'WIN_HALF') {
      completedCount++;
      const halfWinOdds = 1 + (leg.current_odds - 1) / 2;
      effectiveMultiplier *= halfWinOdds;
    } else if (o === 'PUSH') {
      completedCount++;
      effectiveMultiplier *= 1.0;
    } else if (o === 'LOSE_HALF') {
      completedCount++;
      effectiveMultiplier *= 0.5;
    }
  }

  let finalOutcome: SettlementOutcome = 'PENDING';
  let explanation = '';

  if (hasFailedLeg) {
    finalOutcome = 'LOSE';
    effectiveMultiplier = 0;
    explanation = 'Parlay failed due to one or more lost legs.';
  } else if (invalidCount > 0) {
    finalOutcome = 'INVALID';
    effectiveMultiplier = 0;
    explanation = `Parlay contains ${invalidCount} invalid leg(s).`;
  } else if (pendingCount > 0) {
    finalOutcome = 'PENDING';
    explanation = `Parlay has ${pendingCount} pending leg(s).`;
  } else {
    const hasHalfLoss = legs.some(l => l.settlement.outcome === 'LOSE_HALF');
    if (hasHalfLoss) {
      finalOutcome = 'LOSE_HALF';
    } else if (effectiveMultiplier > 1.0) {
      const hasHalfWin = legs.some(l => l.settlement.outcome === 'WIN_HALF');
      finalOutcome = hasHalfWin ? 'WIN_HALF' : 'WIN';
    } else if (effectiveMultiplier === 1.0) {
      finalOutcome = 'PUSH';
    } else {
      finalOutcome = 'LOSE'; // should be unreachable because effectiveMultiplier > 0 if no full LOSE
    }
    explanation = `Parlay resolved with effective multiplier: ${effectiveMultiplier.toFixed(3)}`;
  }

  let netProfitUnit = 0;
  if (finalOutcome === 'LOSE') {
    netProfitUnit = -1.0;
  } else if (finalOutcome === 'PENDING' || finalOutcome === 'INVALID') {
    netProfitUnit = 0;
  } else {
    netProfitUnit = effectiveMultiplier - 1.0;
  }

  return {
    outcome: finalOutcome,
    net_profit_unit: netProfitUnit,
    payout_multiplier: effectiveMultiplier,
    explanation,
  };
}

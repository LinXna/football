import { AiEvaluationResult, EvaluatorPayload } from './types.js';
import { RecommendationGrade } from './enums.js';

/**
 * Parses Asian handicap lines into a unified float.
 * Matches: "-0.25", "-0/0.5", "2/2.5", "+0.5/1", etc.
 */
export function parseHandicapToFloat(line: string | number): number | null {
  let cleanLine = String(line).replace(/\s/g, '');
  if (!cleanLine) return null;

  // Simple float match without '/'
  if (!cleanLine.includes('/')) {
    const floatVal = parseFloat(cleanLine);
    return isNaN(floatVal) ? null : floatVal;
  }

  const isNegative = cleanLine.startsWith('-');
  const normalized = cleanLine.replace(/[-+]/g, '');
  const parts = normalized.split('/');
  
  if (parts.length === 2) {
    const p1 = parseFloat(parts[0]);
    const p2 = parseFloat(parts[1]);
    if (!isNaN(p1) && !isNaN(p2)) {
      const avg = (p1 + p2) / 2;
      return isNegative ? -avg : avg;
    }
  }

  return null;
}

/**
 * Alignment Guard: Prevents AI hallucination of betting markets and odds.
 * Uses robust float parsing to avoid false positives (e.g. -0.25 vs -0/0.5).
 */
export function verifyStatutoryAlignment(result: AiEvaluationResult, payload: EvaluatorPayload): AiEvaluationResult {
  if (result.grade === RecommendationGrade.REJECTED || result.recommended_legs.length === 0) {
    return result; 
  }

  const statutoryMarkets = payload.ai_brief.core_markets || {};
  let hasHallucination = false;
  let hallucinationReason = '';

  for (const leg of result.recommended_legs) {
    let isValid = false;
    const aiLine = parseHandicapToFloat(leg.line);

    if (aiLine === null) {
      hasHallucination = true;
      hallucinationReason = `AI generated unparseable line: ${leg.line}`;
      break;
    }

    if (leg.market === 'ASIAN_HANDICAP_MAIN' && statutoryMarkets.ah_main) {
      const sm = statutoryMarkets.ah_main;
      const statLine = parseHandicapToFloat(sm.handicap);
      
      if (statLine !== null && Math.abs(aiLine - statLine) < 0.001) {
        if (
          (leg.direction === 'HOME' && Math.abs(leg.odds - sm.home_odds) < 0.02) ||
          (leg.direction === 'AWAY' && Math.abs(leg.odds - sm.away_odds) < 0.02)
        ) {
          isValid = true;
        }
      }
    } else if (leg.market === 'TOTAL_GOALS_MAIN' && statutoryMarkets.ou_main) {
      const sm = statutoryMarkets.ou_main;
      const statLine = parseHandicapToFloat(sm.handicap);
      
      if (statLine !== null && Math.abs(aiLine - statLine) < 0.001) {
        if (
          (leg.direction === 'OVER' && Math.abs(leg.odds - sm.over_odds) < 0.02) ||
          (leg.direction === 'UNDER' && Math.abs(leg.odds - sm.under_odds) < 0.02)
        ) {
          isValid = true;
        }
      }
    }

    if (!isValid) {
      hasHallucination = true;
      hallucinationReason = `AI Hallucinated Leg: Market=${leg.market}, Dir=${leg.direction}, Line=${leg.line}, Odds=${leg.odds}. Not found in statutory payload or odds mismatched.`;
      break;
    }
  }

  if (hasHallucination) {
    return {
      ...result,
      grade: RecommendationGrade.REJECTED,
      confidence_score: 0,
      risk_warnings: [
        ...result.risk_warnings,
        `SYSTEM OVERRIDE: ${hallucinationReason} -> Auto-downgraded to REJECTED to protect portfolio.`
      ],
      recommended_legs: [] 
    };
  }

  return result;
}

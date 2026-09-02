import { RecommendationGrade } from '../04_ai_evaluator/enums.js';
import { RiskFilterContext, RiskFilterResult } from './types.js';

export function applyPortfolioRiskFilters(context: RiskFilterContext): RiskFilterResult {
  const { existing_ledger, incoming_evaluation } = context;
  
  if (incoming_evaluation.grade === RecommendationGrade.REJECTED || 
      incoming_evaluation.grade === RecommendationGrade.WATCH || 
      incoming_evaluation.grade === RecommendationGrade.RESEARCH) {
    return {
      is_approved: false,
      rejection_reason: `Grade is ${incoming_evaluation.grade}`,
      approved_legs: []
    };
  }

  if (incoming_evaluation.recommended_legs.length === 0) {
    return {
      is_approved: false,
      rejection_reason: `No legs recommended by AI Evaluator.`,
      approved_legs: []
    };
  }

  const approvedLegs = [];
  
  for (const leg of incoming_evaluation.recommended_legs) {
    // Determine exposure for THIS exact match & direction in the existing ledger
    const existingExposureCount = existing_ledger.filter(
      r => r.match_id === incoming_evaluation.match_id && 
           r.leg.market === leg.market && 
           r.leg.direction === leg.direction
    ).length;

    // Rule 1: B_GRADE max exposure = 1
    if (incoming_evaluation.grade === RecommendationGrade.B_GRADE && existingExposureCount >= 1) {
      console.warn(`[RiskFilter] Rejecting leg. Match ${incoming_evaluation.match_id}, Dir ${leg.direction}. B_GRADE max exposure (1) reached.`);
      continue;
    }

    // Rule 1b: C_GRADE max exposure = 1 (Never enters parlays, single bet only)
    if (incoming_evaluation.grade === RecommendationGrade.C_GRADE && existingExposureCount >= 1) {
      console.warn(`[RiskFilter] Rejecting leg. Match ${incoming_evaluation.match_id}, Dir ${leg.direction}. C_GRADE max exposure (1) reached.`);
      continue;
    }

    // Rule 2: A_GRADE max exposure = 2
    if (incoming_evaluation.grade === RecommendationGrade.A_GRADE && existingExposureCount >= 2) {
      console.warn(`[RiskFilter] Rejecting leg. Match ${incoming_evaluation.match_id}, Dir ${leg.direction}. A_GRADE max exposure (2) reached.`);
      continue;
    }
    
    // Rule 3: Deep spread strict rejection (e.g. -2.5 requires A_GRADE, else block)
    // ONLY applies to ASIAN_HANDICAP markets, NOT TOTAL_GOALS!
    if (leg.market.includes('ASIAN_HANDICAP')) {
      const lineFloat = parseFloat(String(leg.line).replace(/[-+\s]/g, '').split('/')[0] || '0');
      if (lineFloat >= 2.0 && incoming_evaluation.grade !== RecommendationGrade.A_GRADE) {
        console.warn(`[RiskFilter] Rejecting leg. Match ${incoming_evaluation.match_id}. Deep spread (${leg.line}) requires A_GRADE.`);
        continue;
      }
    }

    approvedLegs.push(leg);
  }

  if (approvedLegs.length === 0) {
    return {
      is_approved: false,
      rejection_reason: `All legs rejected by Portfolio Risk (Exposure limits or deep spread constraints).`,
      approved_legs: []
    };
  }

  return {
    is_approved: true,
    approved_legs: approvedLegs
  };
}

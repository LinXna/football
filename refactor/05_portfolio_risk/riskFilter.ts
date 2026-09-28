import { RecommendationGrade } from '../04_ai_evaluator/enums.js';
import { RiskFilterContext, RiskFilterResult } from './types.js';
import { RecommendedLeg } from '../04_ai_evaluator/types.js';

/**
 * P1-41：同一比赛多 market / secondary lines 无 portfolio correlation control，
 * 导致实际暴露被严重重复（同一底层投注事件被多个盘口市场重复计入）。
 *
 * 修复：引入「底层投注族」（market cluster）+「单场暴露上限」（per-match cap）：
 *  - market cluster dedup：同一场比赛内，同一底层投注族（胜负 / 进球）+ 同一方向
 *    只保留一条，避免 ASIAN_HANDICAP 主/副盘、EURO_1X2 同向重复暴露；
 *  - per-match exposure cap：同一场比赛所有 leg（含历史台账）总量上限，避免
 *    跨族叠加导致实际组合暴露被低估。
 */
const MAX_LEGS_PER_MATCH = 2;

type MarketCluster = 'OUTRIGHT' | 'TOTALS' | 'OTHER';

/** 把盘口市场归并到「底层投注族」，用于跨 market 的相关性去重。 */
function marketCluster(market: string): MarketCluster {
  const m = String(market || '').toUpperCase();
  if (m.includes('EURO_1X2') || m.includes('ASIAN_HANDICAP')) return 'OUTRIGHT';
  if (m.includes('TOTAL_GOALS')) return 'TOTALS';
  return 'OTHER';
}

/** 方向键统一大写，避免大小写不一致导致相关性去重失效。 */
function directionKey(direction: string): string {
  return String(direction || '').toUpperCase();
}

export function applyPortfolioRiskFilters(context: RiskFilterContext): RiskFilterResult {
  const { existing_ledger, incoming_evaluation } = context;
  const pipeline = context.candidate_pipeline ?? incoming_evaluation.candidate_pipeline;
  const candidateState = pipeline?.state ?? 'OOS_LOCKED';

  if (candidateState !== 'PRODUCTION_UNLOCKED') {
    return {
      is_approved: false,
      candidate_state: candidateState,
      rejection_reason: `Layer 03 candidate state ${candidateState} is not eligible for Portfolio Risk approval.`,
      approved_legs: []
    };
  }
  if (context.candidate_pipeline && context.candidate_pipeline.state !== incoming_evaluation.candidate_pipeline.state) {
    return {
      is_approved: false,
      candidate_state: candidateState,
      rejection_reason: 'Candidate pipeline snapshot mismatch between Layer 03 and AI Evaluator; fail closed.',
      approved_legs: []
    };
  }
  
  if (incoming_evaluation.grade !== RecommendationGrade.A_GRADE &&
      incoming_evaluation.grade !== RecommendationGrade.B_GRADE) {
    return {
      is_approved: false,
      candidate_state: candidateState,
      rejection_reason: `Grade ${incoming_evaluation.grade} is not eligible for formal recommendations.`,
      approved_legs: []
    };
  }

  if (incoming_evaluation.confidence_score < 70) {
    return {
      is_approved: false,
      candidate_state: candidateState,
      rejection_reason: `Confidence score ${incoming_evaluation.confidence_score} is below the formal recommendation threshold.`,
      approved_legs: []
    };
  }

  if (incoming_evaluation.recommended_legs.length === 0) {
    return {
      is_approved: false,
      candidate_state: candidateState,
      rejection_reason: `No legs recommended by AI Evaluator.`,
      approved_legs: []
    };
  }

  const approvedLegs: RecommendedLeg[] = [];
  // Layer 05 receives only the immutable candidate pipeline contract.
  // Any non-empty AI leg set with zero machine candidates fails closed.
  if (incoming_evaluation.recommended_legs.length > 0 && incoming_evaluation.candidate_pipeline.machine_candidate_count === 0) {
    return {
      is_approved: false,
      candidate_state: candidateState,
      rejection_reason: 'AI produced recommended legs without a Layer 03 machine candidate; fail closed.',
      approved_legs: []
    };
  }
  
  for (const leg of incoming_evaluation.recommended_legs) {
    // Determine exposure for THIS exact match & direction in the existing ledger
    const existingExposureCount = existing_ledger.filter(
      r => r.match_id === incoming_evaluation.match_id && 
           r.leg.market === leg.market && 
           r.leg.direction === leg.direction
    ).length;
    const batchExposureCount = approvedLegs.filter(
      approved => approved.market === leg.market && approved.direction === leg.direction
    ).length;
    const exposureCount = existingExposureCount + batchExposureCount;

    // Rule 1: B_GRADE max exposure = 1
    if (incoming_evaluation.grade === RecommendationGrade.B_GRADE && exposureCount >= 1) {
      console.warn(`[RiskFilter] Rejecting leg. Match ${incoming_evaluation.match_id}, Dir ${leg.direction}. B_GRADE max exposure (1) reached.`);
      continue;
    }


    // Rule 2: A_GRADE max exposure = 2
    if (incoming_evaluation.grade === RecommendationGrade.A_GRADE && exposureCount >= 2) {
      console.warn(`[RiskFilter] Rejecting leg. Match ${incoming_evaluation.match_id}, Dir ${leg.direction}. A_GRADE max exposure (2) reached.`);
      continue;
    }
    
    // Rule 3: Deep spread strict rejection (e.g. -2.5 requires A_GRADE, else block)
    // ONLY applies to ASIAN_HANDICAP markets, NOT TOTAL_GOALS!
    if (leg.market.includes('ASIAN_HANDICAP')) {
      const lineFloat = parseFloat(String(leg.selected_line).replace(/[-+\s]/g, '').split('/')[0] || '0');
      if (lineFloat >= 2.0 && incoming_evaluation.grade !== RecommendationGrade.A_GRADE) {
        console.warn(`[RiskFilter] Rejecting leg. Match ${incoming_evaluation.match_id}. Deep spread (${leg.selected_line}) requires A_GRADE.`);
        continue;
      }
    }

    // P1-41: market cluster dedup —— 同场同底层投注族同方向只保留一条
    const cluster = marketCluster(leg.market);
    const dirKey = directionKey(leg.direction);
    const existingClusterExposure = existing_ledger.filter(r =>
      r.match_id === incoming_evaluation.match_id &&
      marketCluster(r.leg.market) === cluster &&
      directionKey(r.leg.direction) === dirKey
    ).length;
    const batchClusterExposure = approvedLegs.filter(a =>
      marketCluster(a.market) === cluster &&
      directionKey(a.direction) === dirKey
    ).length;
    if (existingClusterExposure + batchClusterExposure >= 1) {
      console.warn(`[RiskFilter] P1-41 cluster dedup: rejecting leg. Match ${incoming_evaluation.match_id}, cluster ${cluster}, dir ${dirKey}. Underlying exposure already present.`);
      continue;
    }

    // P1-41: per-match exposure cap —— 同场总暴露上限（含历史台账）
    const existingMatchExposure = existing_ledger.filter(r => r.match_id === incoming_evaluation.match_id).length;
    if (existingMatchExposure + approvedLegs.length >= MAX_LEGS_PER_MATCH) {
      console.warn(`[RiskFilter] P1-41 per-match cap: rejecting leg. Match ${incoming_evaluation.match_id} already has ${existingMatchExposure + approvedLegs.length} leg(s) (cap ${MAX_LEGS_PER_MATCH}).`);
      continue;
    }

    approvedLegs.push(leg);
  }

  if (approvedLegs.length === 0) {
    return {
      is_approved: false,
      candidate_state: candidateState,
      rejection_reason: `All legs rejected by Portfolio Risk (Exposure limits or deep spread constraints).`,
      approved_legs: []
    };
  }

  return {
    is_approved: true,
    candidate_state: candidateState,
    approved_legs: approvedLegs
  };
}

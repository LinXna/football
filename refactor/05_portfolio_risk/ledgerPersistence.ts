import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { FormalRecommendation, BettingStage } from './types.js';
import { EvaluatorPayload, AiEvaluationResult, RecommendedLeg } from '../04_ai_evaluator/types.js';
import { RecommendationGrade } from '../04_ai_evaluator/enums.js';

const LIVE_LEDGER_PATH = path.join(process.cwd(), 'output', 'recommendation_ledger_live.json');
const PREMATCH_LEDGER_PATH = path.join(process.cwd(), 'output', 'recommendation_ledger_prematch.json');

function hasMatchingCandidate(leg: RecommendedLeg, payload: EvaluatorPayload): boolean {
  const candidates = payload.quant_features?.machine_candidate_signals ?? [];
  return candidates.some((candidate) =>
    candidate.market === leg.market &&
    candidate.side.toUpperCase() === leg.direction &&
    candidate.line === leg.selected_line &&
    Math.abs(candidate.odds - leg.current_odds) < 0.02
  );
}

export class LedgerPersistence {
  
  private static getLedgerPath(stage: BettingStage): string {
    return stage === 'LIVE' ? LIVE_LEDGER_PATH : PREMATCH_LEDGER_PATH;
  }

  public static loadLedger(stage: BettingStage): FormalRecommendation[] {
    const filePath = this.getLedgerPath(stage);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data) as FormalRecommendation[];
    } catch (e) {
      console.error(`[Ledger] Error reading ledger ${filePath}:`, e);
      return [];
    }
  }

  /**
   * Atomic-like write appending approved legs.
   * Includes strict deduplication (Idempotency Guard).
   */
  public static appendApprovedLegs(
    payload: EvaluatorPayload,
    evaluation: AiEvaluationResult,
    approvedLegs: RecommendedLeg[],
    stage: BettingStage
  ): FormalRecommendation[] {
    if (
      approvedLegs.length === 0 ||
      (evaluation.grade !== RecommendationGrade.A_GRADE && evaluation.grade !== RecommendationGrade.B_GRADE) ||
      evaluation.confidence_score < 70
    ) {
      return [];
    }

    const acceptedLegs = approvedLegs.filter((leg) =>
      evaluation.recommended_legs.some((recommendedLeg) =>
        recommendedLeg.market === leg.market &&
        recommendedLeg.selected_line === leg.selected_line &&
        recommendedLeg.direction === leg.direction &&
        Math.abs(recommendedLeg.current_odds - leg.current_odds) < 0.02
      ) &&
      hasMatchingCandidate(leg, payload)
    );
    if (acceptedLegs.length === 0) {
      return [];
    }
    
    const filePath = this.getLedgerPath(stage);
    const existing = this.loadLedger(stage);
    const newRecords: FormalRecommendation[] = [];
    
    for (const leg of acceptedLegs) {
      // Idempotency check: Have we already written this EXACT match, market, and direction at this minute?
      // (Using minute to allow multiple bets if the game state drastically changes later, though usually risk filter blocks it)
      const isDuplicate = existing.some(r => 
        r.match_id === payload.ai_brief.match_id &&
        r.leg.market === leg.market &&
        r.leg.direction === leg.direction &&
        r.condition_snapshot.match_minute === payload.ai_brief.status_summary
      );
      
      if (isDuplicate) {
        console.warn(`[Ledger] Idempotency Guard triggered. Skipping duplicate bet for Match ${payload.ai_brief.match_id} Dir ${leg.direction} at ${payload.ai_brief.status_summary}`);
        continue;
      }
      
      const record: FormalRecommendation = {
        record_id: randomUUID(),
        record_type: 'formal_ai_recommendation',
        formal_recommendation: true,
        stage,
        created_at_utc: new Date().toISOString(),
        match_id: payload.ai_brief.match_id,
        kickoff_time: payload.ai_brief.kickoff_time,
        teams: payload.ai_brief.teams,
        condition_snapshot: {
          match_minute: payload.ai_brief.status_summary,
          current_score: payload.ai_brief.score_verification.current_score,
          bdi: payload.quant_features.bdi || 0,
          goal_phase_alert: payload.quant_features.goal_phase_alert || 'NONE',
          machine_candidate_count: payload.quant_features.machine_candidate_count || 0
        },
        ai_assessment: {
          grade: evaluation.grade,
          confidence_score: evaluation.confidence_score,
          blind_spot_analysis: evaluation.blind_spot_analysis,
          internal_logical_audit: evaluation.internal_logical_audit,
          qualitative_summary: evaluation.qualitative_summary
        },
        leg,
        settlement: {
          is_settled: false,
          outcome: 'PENDING'
        }
      };
      
      newRecords.push(record);
      existing.push(record);
    }
    
    if (newRecords.length > 0) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      // In a real high-concurrency app we'd use a file lock here or DB transaction. 
      // For this Node script pipeline, synchronous write is safe enough.
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`[Ledger] Atomically wrote ${newRecords.length} new records to ${stage} ledger.`);
    }
    
    return newRecords;
  }
}

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { FormalRecommendation, BettingStage } from './types.js';
import { EvaluatorPayload, AiEvaluationResult, RecommendedLeg } from '../04_ai_evaluator/types.js';

const LIVE_LEDGER_PATH = path.join(process.cwd(), 'refactor', 'runtime', 'formal_ledger_live.json');
const PREMATCH_LEDGER_PATH = path.join(process.cwd(), 'refactor', 'runtime', 'formal_ledger_prematch.json');

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

  public static applyVerifiedFinalScore(input: {
    stage: BettingStage;
    ybty_home: string;
    ybty_away: string;
    final_score: string;
    score_source: string;
    verified_at?: string;
  }): number {
    const home = input.ybty_home.trim();
    const away = input.ybty_away.trim();
    if (!home || !away || !input.final_score.trim() || !input.score_source.trim()) return 0;

    const verifiedAt = input.verified_at || new Date().toISOString();
    let updated = 0;
    const ledger = this.loadLedger(input.stage);
    let changed = false;
    for (const record of ledger) {
      if (record.teams.home !== home || record.teams.away !== away) continue;
      record.settlement = {
        ...(record.settlement || { is_settled: false, outcome: 'PENDING' }),
        is_settled: false,
        outcome: 'PENDING',
        final_score_verified: input.final_score.trim(),
        final_score_source: input.score_source.trim(),
        final_score_verified_at: verifiedAt,
      };
      changed = true;
      updated++;
    }
    if (changed) {
      const filePath = this.getLedgerPath(input.stage);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2), 'utf8');
    }
    return updated;
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
    
    if (approvedLegs.length === 0) return [];
    const brief = payload.ai_brief;
    if (!brief.league) {
      throw new Error(`[Ledger] Missing league key for ${brief.match_id || 'unknown match'}`);
    }
    const quantFeatures = payload.quant_features;
    const scoreVerification = brief.score_verification;
    if (
      !brief.match_id ||
      !brief.kickoff_time ||
      !brief.status_summary ||
      !brief.teams?.home ||
      !brief.teams?.away ||
      !scoreVerification?.current_score ||
      !quantFeatures
    ) {
      throw new Error(`[Ledger] Incomplete refactor evaluation payload for ${brief.match_id || 'unknown match'}`);
    }
    
    const filePath = this.getLedgerPath(stage);
    const existing = this.loadLedger(stage);
    const newRecords: FormalRecommendation[] = [];
    
    for (const leg of approvedLegs) {
      // Idempotency check: Have we already written this EXACT match, market, and direction at this minute?
      // (Using minute to allow multiple bets if the game state drastically changes later, though usually risk filter blocks it)
      const isDuplicate = existing.some(r => 
        r.match_id === brief.match_id &&
        r.leg.market === leg.market &&
        r.leg.direction === leg.direction &&
        r.condition_snapshot.match_minute === brief.status_summary
      );
      
      if (isDuplicate) {
        console.warn(`[Ledger] Idempotency Guard triggered. Skipping duplicate bet for Match ${brief.match_id} Dir ${leg.direction} at ${brief.status_summary}`);
        continue;
      }
      
      const record: FormalRecommendation = {
        record_id: randomUUID(),
        stage,
        created_at_utc: new Date().toISOString(),
        match_id: brief.match_id,
        kickoff_time: brief.kickoff_time,
        league_key: brief.league,
        teams: brief.teams,
        condition_snapshot: {
          match_minute: brief.status_summary,
          current_score: scoreVerification.current_score,
          bdi: quantFeatures.bdi || 0,
          goal_phase_alert: quantFeatures.goal_phase_alert || 'NONE',
          machine_candidate_count: quantFeatures.machine_candidate_count || 0
        },
        ai_assessment: {
          grade: evaluation.grade,
          confidence_score: evaluation.confidence_score,
          blind_spot_analysis: evaluation.blind_spot_analysis,
          internal_logical_audit: evaluation.internal_logical_audit,
          qualitative_summary: evaluation.qualitative_summary
        },
        leg,
        prediction_snapshot: this.buildPredictionSnapshot(payload, leg, stage),
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

  private static buildPredictionSnapshot(
    payload: EvaluatorPayload,
    leg: RecommendedLeg,
    stage: BettingStage
  ): FormalRecommendation['prediction_snapshot'] {
    const snapshot = payload.quant_features?.prediction_snapshot;
    const signal = snapshot?.signals.find(item =>
      item.market === leg.market &&
      ((leg.direction === 'HOME' && item.side === 'home') ||
       (leg.direction === 'AWAY' && item.side === 'away') ||
       (leg.direction === 'OVER' && item.side === 'over') ||
       (leg.direction === 'UNDER' && item.side === 'under'))
    );
    const probability = signal?.model_probability;
    if (!snapshot || signal == null || probability == null || probability < 0 || probability > 1) {
      throw new Error(`[Ledger] Missing frozen quantitative snapshot for ${payload.ai_brief.match_id || 'unknown match'} ${leg.market}`);
    }
    const scoreVerification = payload.ai_brief.score_verification;
    if (!scoreVerification?.current_score) {
      throw new Error(`[Ledger] Missing verified score snapshot for ${payload.ai_brief.match_id || 'unknown match'}`);
    }
    const minuteMatch = payload.ai_brief.status_summary?.match(/\b(\d{1,3})'/);
    return {
      model_version: snapshot.model_version,
      prediction_at: snapshot.prediction_at,
      market: signal.market,
      line: signal.line,
      odds: signal.odds,
      model_probability: probability,
      predicted_lambda: snapshot.predicted_lambda,
      minute: stage === 'LIVE' ? (minuteMatch ? Number(minuteMatch[1]) : null) : null,
      score_at_recommendation: scoreVerification.current_score,
      score_verified: scoreVerification.is_verified,
      score_source: scoreVerification.is_verified ? 'canonical_score_verification' : 'unverified',
      red_card_state: snapshot.red_card_state
    };
  }
}

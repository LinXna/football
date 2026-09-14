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
    const candidatePipeline = quantFeatures?.candidate_pipeline;
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

    const evaluationGradeEligible = evaluation.grade === 'A_GRADE' || evaluation.grade === 'B_GRADE';
    if (!evaluationGradeEligible) {
      throw new Error(`[Ledger] Only A_GRADE or B_GRADE can be persisted.`);
    }
    if (evaluation.confidence_score < 70) {
      throw new Error(`[Ledger] Confidence below 70 cannot be persisted.`);
    }

    const isColdStartPermissive = candidatePipeline?.state === 'COLD_START_PERMISSIVE' && evaluation.candidate_pipeline?.state === 'COLD_START_PERMISSIVE';
    const isProductionUnlocked = candidatePipeline?.state === 'PRODUCTION_UNLOCKED' && evaluation.candidate_pipeline?.state === 'PRODUCTION_UNLOCKED';

    if (!isProductionUnlocked && !isColdStartPermissive) {
      throw new Error(`[Ledger] Candidate pipeline is neither PRODUCTION_UNLOCKED nor COLD_START_PERMISSIVE; formal persistence denied.`);
    }

    const candidateCount = isColdStartPermissive
      ? (candidatePipeline.research_candidate_count || candidatePipeline.machine_candidate_count || 0)
      : candidatePipeline.machine_candidate_count;
    const evalCandidateCount = isColdStartPermissive
      ? (evaluation.candidate_pipeline.research_candidate_count || evaluation.candidate_pipeline.machine_candidate_count || 0)
      : evaluation.candidate_pipeline.machine_candidate_count;

    if (candidateCount <= 0 || evalCandidateCount <= 0) {
      throw new Error(`[Ledger] No Layer 03 machine/research candidate exists; formal persistence denied.`);
    }
    if (candidatePipeline.state !== evaluation.candidate_pipeline.state) {
      throw new Error(`[Ledger] Candidate pipeline snapshot mismatch; fail closed.`);
    }
    
    const filePath = this.getLedgerPath(stage);
    const existing = this.loadLedger(stage);
    const persistedRecords: FormalRecommendation[] = [];
    
    for (const leg of approvedLegs) {
      // 检查单场同分钟幂等性
      const existingIndex = existing.findIndex(r => 
        r.match_id === brief.match_id &&
        r.leg.market === leg.market &&
        r.leg.direction === leg.direction &&
        r.condition_snapshot.match_minute === brief.status_summary
      );

      const predictionSnapshot = this.buildPredictionSnapshot(payload, leg, stage);
      const oosStatusVal = isColdStartPermissive ? 'OOS_COLD_START_EXEMPT' : (existingIndex >= 0 ? existing[existingIndex].oos_status : undefined);
      
      if (existingIndex >= 0) {
        // 单场同分钟幂等覆盖（更新旧记录，避免简单丢弃或重复堆叠）
        const oldRec = existing[existingIndex];
        const updatedRecord: FormalRecommendation = {
          ...oldRec,
          created_at_utc: new Date().toISOString(),
          candidate_pipeline_state: evaluation.candidate_pipeline.state,
          oos_status: oosStatusVal,
          condition_snapshot: {
            match_minute: brief.status_summary,
            current_score: scoreVerification.current_score,
            bdi: quantFeatures.bdi || 0,
            goal_phase_alert: quantFeatures.goal_phase_alert || 'NONE',
            machine_candidate_count: quantFeatures.machine_candidate_count || candidatePipeline.machine_candidate_count,
            candidate_pipeline_state: candidatePipeline.state,
            oos_status: isColdStartPermissive ? 'OOS_COLD_START_EXEMPT' : undefined,
            score_verified: Boolean(scoreVerification.is_verified),
            source: 'YBTY',
          },
          ai_assessment: {
            grade: evaluation.grade,
            confidence_score: evaluation.confidence_score,
            blind_spot_analysis: evaluation.blind_spot_analysis,
            internal_logical_audit: evaluation.internal_logical_audit,
            qualitative_summary: evaluation.qualitative_summary
          },
          leg,
          prediction_snapshot: predictionSnapshot,
          settlement: oldRec.settlement || {
            is_settled: false,
            outcome: 'PENDING'
          }
        };
        existing[existingIndex] = updatedRecord;
        persistedRecords.push(updatedRecord);
        console.log(`[Ledger] Idempotent overwrite applied for Match ${brief.match_id} Dir ${leg.direction} at ${brief.status_summary}`);
        continue;
      }
      
      const record: FormalRecommendation = {
        record_type: 'formal_ai_recommendation',
        formal_recommendation: true,
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
          machine_candidate_count: quantFeatures.machine_candidate_count || candidatePipeline.machine_candidate_count,
          candidate_pipeline_state: candidatePipeline.state,
          oos_status: isColdStartPermissive ? 'OOS_COLD_START_EXEMPT' : undefined,
          score_verified: Boolean(scoreVerification.is_verified),
          source: 'YBTY',
        },
        candidate_pipeline_state: evaluation.candidate_pipeline.state,
        oos_status: oosStatusVal,
        ai_assessment: {
          grade: evaluation.grade,
          confidence_score: evaluation.confidence_score,
          blind_spot_analysis: evaluation.blind_spot_analysis,
          internal_logical_audit: evaluation.internal_logical_audit,
          qualitative_summary: evaluation.qualitative_summary
        },
        leg,
        prediction_snapshot: predictionSnapshot,
        settlement: {
          is_settled: false,
          outcome: 'PENDING'
        }
      };
      
      persistedRecords.push(record);
      existing.push(record);
    }
    
    if (persistedRecords.length > 0) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`[Ledger] Atomically saved ${persistedRecords.length} records to ${stage} ledger.`);
    }
    
    return persistedRecords;
  }

  /**
   * 按 ID 集合从指定台账中删除单条或多条记录
   */
  public static deleteRecords(
    stage: BettingStage | 'ALL',
    recordIds: string[]
  ): { liveRemoved: number; prematchRemoved: number } {
    const idSet = new Set(recordIds.map(id => String(id).trim()).filter(Boolean));
    if (idSet.size === 0) return { liveRemoved: 0, prematchRemoved: 0 };

    let liveRemoved = 0;
    let prematchRemoved = 0;

    if (stage === 'LIVE' || stage === 'ALL') {
      const liveLedger = this.loadLedger('LIVE');
      const nextLive = liveLedger.filter(r => !idSet.has(r.record_id));
      liveRemoved = liveLedger.length - nextLive.length;
      if (liveRemoved > 0) {
        const filePath = this.getLedgerPath('LIVE');
        fs.writeFileSync(filePath, JSON.stringify(nextLive, null, 2), 'utf8');
      }
    }

    if (stage === 'PREMATCH' || stage === 'ALL') {
      const prematchLedger = this.loadLedger('PREMATCH');
      const nextPrematch = prematchLedger.filter(r => !idSet.has(r.record_id));
      prematchRemoved = prematchLedger.length - nextPrematch.length;
      if (prematchRemoved > 0) {
        const filePath = this.getLedgerPath('PREMATCH');
        fs.writeFileSync(filePath, JSON.stringify(nextPrematch, null, 2), 'utf8');
      }
    }

    return { liveRemoved, prematchRemoved };
  }

  /**
   * 一键清空指定阶段或全部正式台账测试数据
   */
  public static clearLedger(
    stage: BettingStage | 'ALL'
  ): { liveCleared: number; prematchCleared: number } {
    let liveCleared = 0;
    let prematchCleared = 0;

    if (stage === 'LIVE' || stage === 'ALL') {
      const liveLedger = this.loadLedger('LIVE');
      liveCleared = liveLedger.length;
      const filePath = this.getLedgerPath('LIVE');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
    }

    if (stage === 'PREMATCH' || stage === 'ALL') {
      const prematchLedger = this.loadLedger('PREMATCH');
      prematchCleared = prematchLedger.length;
      const filePath = this.getLedgerPath('PREMATCH');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
    }

    return { liveCleared, prematchCleared };
  }

  private static buildPredictionSnapshot(
    payload: EvaluatorPayload,
    leg: RecommendedLeg,
    stage: BettingStage
  ): FormalRecommendation['prediction_snapshot'] {
    const snapshot = payload.quant_features?.prediction_snapshot;
    const legDirUpper = String(leg.direction || '').toUpperCase();
    const signal = snapshot?.signals.find(item => {
      const sideUpper = String(item.side || '').toUpperCase();
      return item.market === leg.market && (
        (legDirUpper === 'HOME' && sideUpper === 'HOME') ||
        (legDirUpper === 'AWAY' && sideUpper === 'AWAY') ||
        (legDirUpper === 'DRAW' && sideUpper === 'DRAW') ||
        (legDirUpper === 'OVER' && sideUpper === 'OVER') ||
        (legDirUpper === 'UNDER' && sideUpper === 'UNDER') ||
        sideUpper === legDirUpper
      );
    });

    const probability = signal?.model_probability ?? (leg as any).model_probability ?? (leg as any).probability ?? 0.5;
    const scoreVerification = payload.ai_brief.score_verification;
    const minuteMatch = payload.ai_brief.status_summary?.match(/\b(\d{1,3})'/);

    return {
      model_version: snapshot?.model_version || 'refactor-layer03-v1',
      prediction_at: snapshot?.prediction_at || new Date().toISOString(),
      market: signal?.market || leg.market,
      line: signal?.line != null ? String(signal.line) : String(leg.selected_line),
      odds: signal?.odds || leg.current_odds,
      model_probability: probability,
      predicted_lambda: snapshot?.predicted_lambda || { home: 1.2, away: 1.0 },
      minute: stage === 'LIVE' ? (minuteMatch ? Number(minuteMatch[1]) : (typeof (leg as any).minute === 'number' ? (leg as any).minute : null)) : null,
      score_at_recommendation: scoreVerification?.current_score || '0 - 0',
      score_verified: Boolean(scoreVerification?.is_verified),
      score_source: scoreVerification?.is_verified ? 'canonical_score_verification' : 'unverified',
      red_card_state: snapshot?.red_card_state || '0-0'
    };
  }
}

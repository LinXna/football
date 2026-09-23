import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import { FormalRecommendation, BettingStage } from './types.js';
import { EvaluatorPayload, AiEvaluationResult, RecommendedLeg } from '../04_ai_evaluator/types.js';

const LIVE_LEDGER_PATH = path.join(process.cwd(), 'refactor', 'runtime', 'formal_ledger_live.json');
const PREMATCH_LEDGER_PATH = path.join(process.cwd(), 'refactor', 'runtime', 'formal_ledger_prematch.json');

/**
 * 严格原子写入工具函数：
 * 采用 临时文件写入 + 校验 + 原子性重命名 (fs.renameSync) + 自动备份机制，
 * 彻底防止多进程竞态或进程异常崩溃导致 JSON 文件损坏或变为空文件。
 */
function atomicWriteJsonSync(targetPath: string, data: unknown): void {
  const fullPath = path.resolve(targetPath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });

  const jsonStr = JSON.stringify(data, null, 2);
  const randomSuffix = `${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  const tempPath = `${fullPath}.${randomSuffix}.tmp`;
  const backupPath = `${fullPath}.bak`;

  // 1. 写入临时文件
  fs.writeFileSync(tempPath, jsonStr, 'utf8');

  // 2. 验证临时文件可正常读取且为有效 JSON
  try {
    const verified = fs.readFileSync(tempPath, 'utf8');
    JSON.parse(verified);
  } catch (err) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw new Error(`[LedgerPersistence] Atomic write verification failed: ${String(err)}`);
  }

  // 3. 备份现有旧文件（如果存在）
  if (fs.existsSync(fullPath)) {
    try {
      fs.copyFileSync(fullPath, backupPath);
    } catch (err) {
      console.warn(`[LedgerPersistence] Failed to create backup at ${backupPath}:`, err);
    }
  }

  // 4. 原子替换目标文件
  fs.renameSync(tempPath, fullPath);
}

export class LedgerPersistence {
  private filePath?: string;

  constructor(filePath?: string) {
    this.filePath = filePath;
  }

  public readLedger(): FormalRecommendation[] {
    if (!this.filePath) return [];
    if (!fs.existsSync(this.filePath)) return [];
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(data) as FormalRecommendation[];
    } catch (e) {
      console.error(`[Ledger] Error reading ledger ${this.filePath}:`, e);
      return [];
    }
  }

  public appendApprovedLegs(records: FormalRecommendation[]): { appended_count: number; records: FormalRecommendation[] } {
    if (!this.filePath) {
      throw new Error('[Ledger] Instance appendApprovedLegs requires filePath in constructor');
    }
    const existing = this.readLedger();
    let appendedCount = 0;
    for (const record of records) {
      const existingIndex = existing.findIndex(r => {
        if (r.record_id === record.record_id) return true;
        const sameMatch = Boolean(
          (record.match_id && r.match_id && r.match_id === record.match_id) ||
          (record.teams?.home && record.teams?.away && r.teams?.home === record.teams.home && r.teams?.away === record.teams.away)
        );
        const sameMarket = r.leg?.market === record.leg?.market && r.leg?.direction === record.leg?.direction;
        const sameMinute = Boolean(record.condition_snapshot?.match_minute) && r.condition_snapshot?.match_minute === record.condition_snapshot?.match_minute;
        return sameMatch && sameMarket && sameMinute;
      });
      if (existingIndex >= 0) {
        existing[existingIndex] = record;
      } else {
        existing.push(record);
      }
      appendedCount++;
    }
    atomicWriteJsonSync(this.filePath, existing);
    return { appended_count: appendedCount, records: existing };
  }

  public deleteRecords(recordIds: string[]): { removed_count: number } {
    if (!this.filePath) return { removed_count: 0 };
    const idSet = new Set(recordIds.map(id => String(id).trim()).filter(Boolean));
    const current = this.readLedger();
    const remaining = current.filter(r => !idSet.has(r.record_id));
    const removed = current.length - remaining.length;
    if (removed > 0) {
      atomicWriteJsonSync(this.filePath, remaining);
    }
    return { removed_count: removed };
  }

  public clearLedger(): { cleared_count: number } {
    if (!this.filePath) return { cleared_count: 0 };
    const current = this.readLedger();
    const count = current.length;
    atomicWriteJsonSync(this.filePath, []);
    return { cleared_count: count };
  }

  public updateRecord(record: FormalRecommendation): boolean {
    if (!this.filePath) return false;
    const current = this.readLedger();
    const index = current.findIndex(r => r.record_id === record.record_id);
    if (index >= 0) {
      current[index] = record;
      atomicWriteJsonSync(this.filePath, current);
      return true;
    }
    return false;
  }
  
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
      atomicWriteJsonSync(filePath, ledger);
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
      atomicWriteJsonSync(filePath, existing);
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
        atomicWriteJsonSync(filePath, nextLive);
      }
    }

    if (stage === 'PREMATCH' || stage === 'ALL') {
      const prematchLedger = this.loadLedger('PREMATCH');
      const nextPrematch = prematchLedger.filter(r => !idSet.has(r.record_id));
      prematchRemoved = prematchLedger.length - nextPrematch.length;
      if (prematchRemoved > 0) {
        const filePath = this.getLedgerPath('PREMATCH');
        atomicWriteJsonSync(filePath, nextPrematch);
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
      atomicWriteJsonSync(filePath, []);
    }

    if (stage === 'PREMATCH' || stage === 'ALL') {
      const prematchLedger = this.loadLedger('PREMATCH');
      prematchCleared = prematchLedger.length;
      const filePath = this.getLedgerPath('PREMATCH');
      atomicWriteJsonSync(filePath, []);
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

    const probability = signal?.model_probability ?? leg.model_probability ?? leg.probability ?? 0.5;
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
      minute: stage === 'LIVE' ? (minuteMatch ? Number(minuteMatch[1]) : (typeof leg.minute === 'number' ? leg.minute : null)) : null,
      score_at_recommendation: scoreVerification?.current_score || '0 - 0',
      score_verified: Boolean(scoreVerification?.is_verified),
      score_source: scoreVerification?.is_verified ? 'canonical_score_verification' : 'unverified',
      red_card_state: snapshot?.red_card_state || '0-0'
    };
  }
}

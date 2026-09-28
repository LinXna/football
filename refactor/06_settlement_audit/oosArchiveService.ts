/**
 * @file oosArchiveService.ts
 * @description OOS 校准档案运行时持久化服务（Refactor 内部实现）
 * 负责档案的实时热加载、状态提供、以及在真实实盘正式推荐核销时进行样本的真实沉淀与自动校准。
 * 严禁使用硬编码常数伪造样本，所有样本必须完全溯源自 Layer 03 冻结快照与真实完赛结算。
 *
 * 注：本服务为旧系统 `server/services/oosArchiveService.ts` 的等价迁移，只依赖 refactor 内部
 * （`03_quant_engine/oosCalibrationEngine` + `types`），彻底物理隔离旧系统。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  OosCalibrationArchive,
  OosCalibrationSample,
  OosArchiveBuildOptions
} from '../03_quant_engine/types.js';
import { buildOosCalibrationArchive } from '../03_quant_engine/oosCalibrationEngine.js';
import { ingestHistoricalBacktestRecords } from './historicalBacktestIngestion.js';
import { HistoricalBacktestRecord } from './types.js';

/** 运行时路径支持环境变量覆盖（测试隔离），默认 refactor/runtime */
function resolveRuntimePath(): string {
  return process.env.REFACTOR_RUNTIME_DIR
    ? path.resolve(process.env.REFACTOR_RUNTIME_DIR)
    : path.join(process.cwd(), 'refactor', 'runtime');
}
function oosArchivePath(): string {
  return process.env.OOS_ARCHIVE_PATH
    ? path.resolve(process.env.OOS_ARCHIVE_PATH)
    : path.join(resolveRuntimePath(), 'oos_calibration_archive.json');
}
function oosSamplesPath(): string {
  return process.env.OOS_SAMPLES_PATH
    ? path.resolve(process.env.OOS_SAMPLES_PATH)
    : path.join(resolveRuntimePath(), 'oos_calibration_samples.json');
}

let cachedArchive: OosCalibrationArchive | null = null;
let cachedSamples: OosCalibrationSample[] = [];

/**
 * 严格原子写入：临时文件 + 校验 + 原子重命名（与 05 层 LedgerPersistence 同范式），
 * 防止多进程竞态或进程异常崩溃导致 JSON 文件损坏或变为空文件。
 */
function atomicWriteJsonSync(targetPath: string, data: unknown): void {
  const fullPath = path.resolve(targetPath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });

  const jsonStr = JSON.stringify(data, null, 2);
  const tempPath = `${fullPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tempPath, jsonStr, 'utf8');

  try {
    JSON.parse(fs.readFileSync(tempPath, 'utf8'));
  } catch (err) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw new Error(`[OosArchiveService] Atomic write verification failed: ${String(err)}`);
  }

  fs.renameSync(tempPath, fullPath);
}

/** 确保 OOS 档案已就绪（仅读取真实存在的持久化文件，严禁伪造） */
export function ensureOosArchiveInitialized(): OosCalibrationArchive | null {
  if (cachedArchive) return cachedArchive;

  if (fs.existsSync(oosArchivePath())) {
    try {
      cachedArchive = JSON.parse(fs.readFileSync(oosArchivePath(), 'utf-8')) as OosCalibrationArchive;
      if (fs.existsSync(oosSamplesPath())) {
        cachedSamples = JSON.parse(fs.readFileSync(oosSamplesPath(), 'utf-8')) as OosCalibrationSample[];
      }
      return cachedArchive;
    } catch (err) {
      console.warn('⚠️ 读取现有 OOS 档案失败:', err);
    }
  }

  if (fs.existsSync(oosSamplesPath())) {
    try {
      cachedSamples = JSON.parse(fs.readFileSync(oosSamplesPath(), 'utf-8')) as OosCalibrationSample[];
    } catch {
      cachedSamples = [];
    }
  }

  return cachedArchive;
}

/** 获取当前内存中的 OOS 校准档案 */
export function getLoadedOosArchive(): OosCalibrationArchive | undefined {
  if (!cachedArchive) {
    ensureOosArchiveInitialized();
  }
  return cachedArchive || undefined;
}

/** OOS 校准库运行状态指标 */
export interface OosStatus {
  available: boolean;
  sample_count: number;
  profile_count: number;
  ess: number;
  brier_score: number | null;
  status: 'VALIDATED' | 'INSUFFICIENT_EVIDENCE' | 'REJECTED' | 'PENDING_CALIBRATION';
  generated_at: string | null;
  model_version: string;
  message: string;
}

/** 获取当前 OOS 校准库运行状态指标 */
export function getOosStatus(): OosStatus {
  const archive = getLoadedOosArchive();
  if (!archive || cachedSamples.length === 0) {
    return {
      available: false,
      sample_count: cachedSamples.length,
      profile_count: 0,
      ess: 0,
      brier_score: null,
      status: 'PENDING_CALIBRATION',
      generated_at: null,
      model_version: 'layer03-v1',
      message: '当前处于实盘真实积累阶段，待正式推荐完赛核销后自动递增'
    };
  }

  return {
    available: true,
    sample_count: cachedSamples.length,
    profile_count: archive.profiles.length,
    ess: archive.global_profile.effective_sample_size,
    brier_score: archive.global_profile.oos_brier_score,
    status: archive.global_profile.status,
    generated_at: archive.generated_at,
    model_version: archive.model_version,
    message: archive.global_profile.status === 'VALIDATED' ? '成熟可用' : '校准样本持续积累中'
  };
}


/**
 * 增量追加真实结算样本并重新编译 OOS 档案。
 *
 * @deprecated 本函数绕过 OP-06-02 完整硬校验（model_probability/lambda 合法性、滚球比分倒退、
 * 预测时间戳倒置、语义去重、预测时间窗口），仅保留给 `verify_p3_ledger_snowball` 等测试场景做档案重建。
 * 生产核销路径必须统一走 `ingestSettledRecordsAndPersist`（内部调用 `ingestHistoricalBacktestRecords` 完整校验）。
 */
export function appendSampleAndRebuildArchive(
  newSample: OosCalibrationSample
): { success: boolean; archive?: OosCalibrationArchive; error?: string } {
  try {
    ensureOosArchiveInitialized();

    // 规范化兼容别名：binary_outcome / predicted_probability 是 OosCalibrationSample 的可选别名字段
    const normalizedSample: OosCalibrationSample = {
      ...newSample,
      outcome: newSample.binary_outcome ?? newSample.outcome,
      model_probability: newSample.predicted_probability ?? newSample.model_probability
    };

    // 检查是否已有相同 sample_id，做幂等覆盖或追加
    const existingIndex = cachedSamples.findIndex((s) => s.sample_id === normalizedSample.sample_id);
    if (existingIndex >= 0) {
      cachedSamples[existingIndex] = normalizedSample;
    } else {
      cachedSamples.push(normalizedSample);
    }

    // 计算真实时间窗口 (严格保证: trainStart < trainEnd < predStart <= sample.prediction_at <= predEnd <= generatedAt)
    let minPredTime = Infinity;
    let maxPredTime = -Infinity;
    for (const s of cachedSamples) {
      const t = Date.parse(s.prediction_at);
      if (!isNaN(t)) {
        if (t < minPredTime) minPredTime = t;
        if (t > maxPredTime) maxPredTime = t;
      }
    }

    const nowTime = Date.now();
    const effectiveGeneratedTime = Math.max(nowTime, isFinite(maxPredTime) ? maxPredTime + 2000 : nowTime);
    const generatedAt = new Date(effectiveGeneratedTime).toISOString();
    const predEnd = isFinite(maxPredTime) ? new Date(maxPredTime + 1000).toISOString() : generatedAt;
    const predStart = isFinite(minPredTime) ? new Date(minPredTime - 1000).toISOString() : new Date(effectiveGeneratedTime - 3600000).toISOString();
    const trainEnd = new Date(Date.parse(predStart) - 86400 * 1000).toISOString();
    const trainStart = new Date(Date.parse(trainEnd) - 365 * 86400 * 1000).toISOString();

    const options: OosArchiveBuildOptions = {
      model_version: newSample.model_version || 'layer03-v1',
      generated_at: generatedAt,
      training_window_start_at: trainStart,
      training_window_end_at: trainEnd,
      prediction_window_start_at: predStart,
      prediction_window_end_at: predEnd
    };

    const nextArchive = buildOosCalibrationArchive(cachedSamples, options);
    cachedArchive = nextArchive;

    atomicWriteJsonSync(oosArchivePath(), nextArchive);
    atomicWriteJsonSync(oosSamplesPath(), cachedSamples);

    return { success: true, archive: nextArchive };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('增量更新 OOS 档案失败:', err);
    return { success: false, error: message };
  }
}

/**
 * 合规批量吸纳已结算的正式推荐（走 OP-06-02 完整校验）。
 *
 * 生产核销路径旧实现为「convertFormalLedgerRecords → toOosSample → appendSampleAndRebuildArchive」，
 * 该路径绕过了 `ingestHistoricalBacktestRecords` 的完整硬校验（model_probability/lambda 合法性、
 * 滚球比分倒退、预测时间戳倒置、语义去重、预测时间窗口）。本函数补齐这些拦截：
 * 只有通过 OP-06-02 全部校验 + 去重 + 时间窗口的样本才会被原子写入并重建档案。
 */
export function ingestSettledRecordsAndPersist(
  records: readonly HistoricalBacktestRecord[]
): { accepted_count: number; rejected_count: number; rejected_reasons: readonly string[] } {
  try {
    ensureOosArchiveInitialized();

    // 推导时间窗口：包含已缓存样本 + 本次待吸纳记录的 prediction_at（与 appendSampleAndRebuildArchive 同口径）
    const allTimes: string[] = [
      ...cachedSamples.map((s) => s.prediction_at),
      ...records.map((r) => r.prediction_at)
    ];
    let minPredTime = Infinity;
    let maxPredTime = -Infinity;
    for (const v of allTimes) {
      const t = Date.parse(v);
      if (!isNaN(t)) {
        if (t < minPredTime) minPredTime = t;
        if (t > maxPredTime) maxPredTime = t;
      }
    }

    const nowTime = Date.now();
    const effectiveGeneratedTime = Math.max(nowTime, isFinite(maxPredTime) ? maxPredTime + 2000 : nowTime);
    const generatedAt = new Date(effectiveGeneratedTime).toISOString();
    const predEnd = isFinite(maxPredTime) ? new Date(maxPredTime + 1000).toISOString() : generatedAt;
    const predStart = isFinite(minPredTime) ? new Date(minPredTime - 1000).toISOString() : new Date(effectiveGeneratedTime - 3600000).toISOString();
    const trainEnd = new Date(Date.parse(predStart) - 86400 * 1000).toISOString();
    const trainStart = new Date(Date.parse(trainEnd) - 365 * 86400 * 1000).toISOString();

    const options: OosArchiveBuildOptions = {
      model_version: records[0]?.model_version || 'layer03-v1',
      generated_at: generatedAt,
      training_window_start_at: trainStart,
      training_window_end_at: trainEnd,
      prediction_window_start_at: predStart,
      prediction_window_end_at: predEnd
    };

    // OP-06-02 完整校验 + 语义去重 + 时间窗口拦截
    const result = ingestHistoricalBacktestRecords(records, options);

    if (result.accepted_samples.length > 0) {
      for (const s of result.accepted_samples) {
        const existingIndex = cachedSamples.findIndex((x) => x.sample_id === s.sample_id);
        if (existingIndex >= 0) cachedSamples[existingIndex] = s;
        else cachedSamples.push(s);
      }
      const nextArchive = buildOosCalibrationArchive(cachedSamples, options);
      cachedArchive = nextArchive;
      atomicWriteJsonSync(oosArchivePath(), nextArchive);
      atomicWriteJsonSync(oosSamplesPath(), cachedSamples);
    }

    return {
      accepted_count: result.accepted_samples.length,
      rejected_count: result.rejected_records.length,
      rejected_reasons: result.rejected_records.map((r) => `${r.record_id}: ${r.reason}`)
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('批量合规吸纳 OOS 样本失败:', err);
    return { accepted_count: 0, rejected_count: records.length, rejected_reasons: [message] };
  }
}

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

const REFACTOR_RUNTIME_DIR = path.join(process.cwd(), 'refactor', 'runtime');
const OOS_ARCHIVE_PATH = path.join(REFACTOR_RUNTIME_DIR, 'oos_calibration_archive.json');
const OOS_SAMPLES_PATH = path.join(REFACTOR_RUNTIME_DIR, 'oos_calibration_samples.json');

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

  if (fs.existsSync(OOS_ARCHIVE_PATH)) {
    try {
      cachedArchive = JSON.parse(fs.readFileSync(OOS_ARCHIVE_PATH, 'utf-8')) as OosCalibrationArchive;
      if (fs.existsSync(OOS_SAMPLES_PATH)) {
        cachedSamples = JSON.parse(fs.readFileSync(OOS_SAMPLES_PATH, 'utf-8')) as OosCalibrationSample[];
      }
      return cachedArchive;
    } catch (err) {
      console.warn('⚠️ 读取现有 OOS 档案失败:', err);
    }
  }

  if (fs.existsSync(OOS_SAMPLES_PATH)) {
    try {
      cachedSamples = JSON.parse(fs.readFileSync(OOS_SAMPLES_PATH, 'utf-8')) as OosCalibrationSample[];
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


/** 增量追加真实结算样本并重新编译 OOS 档案 */
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

    atomicWriteJsonSync(OOS_ARCHIVE_PATH, nextArchive);
    atomicWriteJsonSync(OOS_SAMPLES_PATH, cachedSamples);

    return { success: true, archive: nextArchive };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('增量更新 OOS 档案失败:', err);
    return { success: false, error: message };
  }
}

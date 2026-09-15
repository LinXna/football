/**
 * @file oosArchiveService.ts
 * @description OOS 校准档案运行时管理服务
 * 负责档案的实时热加载、状态提供、以及在真实实盘正式推荐核销时进行样本的真实沉淀与自动校准。
 * 严禁使用硬编码常数（如 0.505 / 2.50）伪造样本，所有样本必须完全溯源自 Layer 03 冻结快照与真实完赛结算。
 */

import fs from 'fs';
import path from 'path';
import {
  OosCalibrationArchive,
  OosCalibrationSample,
  OosArchiveBuildOptions
} from '../../refactor/03_quant_engine/types.js';
import { buildOosCalibrationArchive } from '../../refactor/03_quant_engine/oosCalibrationEngine.js';

const REFACTOR_RUNTIME_DIR = path.join(process.cwd(), 'refactor', 'runtime');
const OOS_ARCHIVE_PATH = path.join(REFACTOR_RUNTIME_DIR, 'oos_calibration_archive.json');
const OOS_SAMPLES_PATH = path.join(REFACTOR_RUNTIME_DIR, 'oos_calibration_samples.json');

let cachedArchive: OosCalibrationArchive | null = null;
let cachedSamples: OosCalibrationSample[] = [];

/**
 * 确保 OOS 档案已就绪（仅读取真实存在的持久化文件，严禁伪造）
 */
export function ensureOosArchiveInitialized(): OosCalibrationArchive | null {
  if (cachedArchive) return cachedArchive;

  if (fs.existsSync(OOS_ARCHIVE_PATH)) {
    try {
      cachedArchive = JSON.parse(fs.readFileSync(OOS_ARCHIVE_PATH, 'utf-8'));
      if (fs.existsSync(OOS_SAMPLES_PATH)) {
        cachedSamples = JSON.parse(fs.readFileSync(OOS_SAMPLES_PATH, 'utf-8'));
      }
      return cachedArchive;
    } catch (err) {
      console.warn('⚠️ 读取现有 OOS 档案失败:', err);
    }
  }

  if (fs.existsSync(OOS_SAMPLES_PATH)) {
    try {
      cachedSamples = JSON.parse(fs.readFileSync(OOS_SAMPLES_PATH, 'utf-8'));
    } catch {
      cachedSamples = [];
    }
  }

  return cachedArchive;
}

/**
 * 获取当前内存中的 OOS 校准档案
 */
export function getLoadedOosArchive(): OosCalibrationArchive | undefined {
  if (!cachedArchive) {
    ensureOosArchiveInitialized();
  }
  return cachedArchive || undefined;
}

/**
 * 获取当前 OOS 校准库运行状态指标
 */
export function getOosStatus() {
  const archive = getLoadedOosArchive();
  if (!archive || cachedSamples.length === 0) {
    return {
      available: false,
      sample_count: cachedSamples.length,
      profile_count: 0,
      ess: 0,
      brier_score: null,
      status: 'PENDING_CALIBRATION' as const,
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
 * 增量追加真实结算样本并重新编译 OOS 档案
 */
export function appendSampleAndRebuildArchive(
  newSample: OosCalibrationSample
): { success: boolean; archive?: OosCalibrationArchive; error?: string } {
  try {
    ensureOosArchiveInitialized();

    const normalizedSample: OosCalibrationSample = {
      ...newSample,
      outcome: typeof (newSample as any).binary_outcome === 'number' ? (newSample as any).binary_outcome : newSample.outcome,
      model_probability: typeof (newSample as any).predicted_probability === 'number' ? (newSample as any).predicted_probability : newSample.model_probability,
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

    if (!fs.existsSync(REFACTOR_RUNTIME_DIR)) {
      fs.mkdirSync(REFACTOR_RUNTIME_DIR, { recursive: true });
    }
    fs.writeFileSync(OOS_ARCHIVE_PATH, JSON.stringify(nextArchive, null, 2), 'utf-8');
    fs.writeFileSync(OOS_SAMPLES_PATH, JSON.stringify(cachedSamples, null, 2), 'utf-8');

    console.log(`✅ 成功沉淀真实 OOS 样本 [${newSample.sample_id}] 至 refactor/runtime，样本总量: ${cachedSamples.length}`);
    return { success: true, archive: nextArchive };
  } catch (err: any) {
    console.error('增量更新 OOS 档案失败:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * @file oosArchiveService.ts
 * @description OOS 校准档案运行时管理服务
 * 负责档案的实时热加载、状态提供、以及在赛后结算录入时进行样本的增量沉淀与自动重校准。
 */

import fs from 'fs';
import path from 'path';
import {
  OosCalibrationArchive,
  OosCalibrationSample,
  OosArchiveBuildOptions
} from '../../refactor/03_quant_engine/types.js';
import { buildOosCalibrationArchive } from '../../refactor/03_quant_engine/oosCalibrationEngine.js';
import { buildOosArchiveFromLeisu } from '../../refactor/06_settlement_audit/leisuHistoricalSeeder.js';

const REFACTOR_RUNTIME_DIR = path.join(process.cwd(), 'refactor', 'runtime');
const OOS_ARCHIVE_PATH = path.join(REFACTOR_RUNTIME_DIR, 'oos_calibration_archive.json');
const OOS_SAMPLES_PATH = path.join(REFACTOR_RUNTIME_DIR, 'oos_calibration_samples.json');

let cachedArchive: OosCalibrationArchive | null = null;
let cachedSamples: OosCalibrationSample[] = [];

/**
 * 确保 OOS 档案已就绪，若不存在则使用历史 fixture 自动执行冷启动编译
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
      console.warn('⚠️ 读取现有 OOS 档案失败，将尝试重新冷启动:', err);
    }
  }

  // 若无本地重构运行时档案，尝试从 refactor/fixtures 自动冷启动构建
  const fixtureDirs = [
    path.resolve('refactor/fixtures')
  ];

  const payloads: any[] = [];
  for (const dir of fixtureDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('leisu') && f.endsWith('.json')) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          payloads.push(content);
        } catch {
          // ignore
        }
      }
    }
  }

  if (payloads.length > 0) {
    try {
      const { archive, samples } = buildOosArchiveFromLeisu(payloads, {
        model_version: 'layer03-v1',
        generated_at: new Date().toISOString()
      });
      cachedArchive = archive;
      cachedSamples = samples;

      if (!fs.existsSync(REFACTOR_RUNTIME_DIR)) {
        fs.mkdirSync(REFACTOR_RUNTIME_DIR, { recursive: true });
      }
      fs.writeFileSync(OOS_ARCHIVE_PATH, JSON.stringify(archive, null, 2), 'utf-8');
      fs.writeFileSync(OOS_SAMPLES_PATH, JSON.stringify(samples, null, 2), 'utf-8');
      console.log(`✅ OOS 档案服务冷启动成功，自动沉淀 ${samples.length} 条样本至 refactor/runtime`);
      return cachedArchive;
    } catch (err) {
      console.error('❌ OOS 档案自动冷启动编译失败:', err);
    }
  }

  return null;
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
  if (!archive) {
    return {
      available: false,
      sample_count: 0,
      profile_count: 0,
      ess: 0,
      brier_score: null,
      status: 'NOT_INITIALIZED',
      generated_at: null,
      model_version: 'layer03-v1'
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
    model_version: archive.model_version
  };
}

/**
 * 增量追加新结算样本并重新编译 OOS 档案
 */
export function appendSampleAndRebuildArchive(
  newSample: OosCalibrationSample
): { success: boolean; archive?: OosCalibrationArchive; error?: string } {
  try {
    ensureOosArchiveInitialized();

    // 检查是否已有相同 sample_id
    const existingIndex = cachedSamples.findIndex((s) => s.sample_id === newSample.sample_id);
    if (existingIndex >= 0) {
      cachedSamples[existingIndex] = newSample;
    } else {
      cachedSamples.push(newSample);
    }

    // 计算时间窗口
    let minPredTime = Infinity;
    let maxPredTime = -Infinity;
    for (const s of cachedSamples) {
      const t = Date.parse(s.prediction_at);
      if (t < minPredTime) minPredTime = t;
      if (t > maxPredTime) maxPredTime = t;
    }

    const generatedAt = new Date().toISOString();
    const generatedTime = Date.parse(generatedAt);
    const predEnd = maxPredTime < generatedTime ? new Date(maxPredTime + 1000).toISOString() : generatedAt;
    const predStart = new Date(minPredTime - 1000).toISOString();
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

    console.log(`✅ 成功沉淀新 OOS 样本 [${newSample.sample_id}] 至 refactor/runtime，样本总量: ${cachedSamples.length}`);
    return { success: true, archive: nextArchive };
  } catch (err: any) {
    console.error('增量更新 OOS 档案失败:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * 强制重新扫描雷速历史并重新编译 OOS 档案
 */
export function reseedOosArchiveFromLeisu(): { archive: OosCalibrationArchive; samples: OosCalibrationSample[] } {
  cachedArchive = null;
  cachedSamples = [];

  const fixtureDirs = [
    path.resolve('refactor/fixtures')
  ];

  const payloads: any[] = [];
  for (const dir of fixtureDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('leisu') && f.endsWith('.json')) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          payloads.push(content);
        } catch {
          // ignore
        }
      }
    }
  }

  const { archive, samples } = buildOosArchiveFromLeisu(payloads, {
    model_version: 'layer03-v1',
    generated_at: new Date().toISOString()
  });
  cachedArchive = archive;
  cachedSamples = samples;

  if (!fs.existsSync(REFACTOR_RUNTIME_DIR)) {
    fs.mkdirSync(REFACTOR_RUNTIME_DIR, { recursive: true });
  }
  fs.writeFileSync(OOS_ARCHIVE_PATH, JSON.stringify(archive, null, 2), 'utf-8');
  fs.writeFileSync(OOS_SAMPLES_PATH, JSON.stringify(samples, null, 2), 'utf-8');

  return { archive, samples };
}

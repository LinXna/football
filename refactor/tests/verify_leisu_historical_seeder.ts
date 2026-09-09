/**
 * @file verify_leisu_historical_seeder.ts
 * @description 单元测试：验证雷速历史完赛数据提取与 OOS 校准档案编译
 */

import fs from 'fs';
import path from 'path';
import {
  extractUniqueRecentMatchesFromLeisuPayload,
  convertLeisuMatchesToOosSamples,
  buildOosArchiveFromLeisu
} from '../06_settlement_audit/leisuHistoricalSeeder.js';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log('--- 开始测试雷速历史 OOS 数据提取与档案编译 ---');

// 1. 读取真实雷速 fixture
const fixturePath = path.resolve('refactor/fixtures/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json');
assert(fs.existsSync(fixturePath), `Fixture 文件不存在: ${fixturePath}`);

const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

// 2. 提取唯一完赛历史对阵
const matches = extractUniqueRecentMatchesFromLeisuPayload(payload);
console.log(`成功提取雷速历史对阵数量: ${matches.length}`);
assert(matches.length > 200, `历史对阵数量应大于 200 场以满足大数定理，实际: ${matches.length}`);

const sampleMatch = matches[0];
assert(sampleMatch.match_id !== undefined, '对阵必须具备合法 match_id');
assert(sampleMatch.fulltime_score !== undefined, '对阵必须具备完场比分');
assert(typeof sampleMatch.fulltime_score.home === 'number', '主队得分必须为数字');
assert(typeof sampleMatch.fulltime_score.away === 'number', '客队得分必须为数字');

// 3. 转化为 OosCalibrationSample
const samples = convertLeisuMatchesToOosSamples(matches, 'layer03-v1');
console.log(`成功生成 OOS 校准二元胜负样本数量: ${samples.length}`);
assert(samples.length >= 200, `有效二元样本数必须 >= 200 场，实际: ${samples.length}`);

// 校验样本二元性与合法性
for (const s of samples) {
  assert(s.outcome === 0 || s.outcome === 1, `样本结果必须为二元 0 或 1: ${s.outcome}`);
  assert(s.model_probability >= 0 && s.model_probability <= 1, '胜率必须在 [0, 1]');
  assert(s.observed_goals >= 0, '观察进球数必须 >= 0');
  assert(s.market === 'TOTAL_GOALS_MAIN' || s.market === 'ASIAN_HANDICAP_MAIN', '盘口类型必须合法');
}

// 4. 端到端编译生成 OosCalibrationArchive
const { archive } = buildOosArchiveFromLeisu([payload], {
  model_version: 'layer03-v1',
  generated_at: new Date().toISOString()
});

assert(archive.schema_version === 1, '档案 schema_version 必须为 1');
assert(archive.profiles.length > 0, '档案必须包含校准分桶 profiles');
assert(archive.global_profile !== undefined, '必须存在全局校准 profile');
console.log(`编译生成的校准分桶数量: ${archive.profiles.length}`);
console.log(`全局 Brier Score: ${archive.global_profile.oos_brier_score}`);
console.log(`全局有效样本量 (ESS): ${archive.global_profile.effective_sample_size}`);
assert(archive.global_profile.effective_sample_size >= 200, '全局样本量必须 >= 200');

console.log('✅ verify_leisu_historical_seeder: 全部断言通过！');

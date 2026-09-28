/**
 * @file verify_intel_prefetch.ts
 * @description Layer 04 情报预取服务验证（不真联网，用 mock client）
 *
 * 覆盖：
 * 1. parseCompetitionFormatFromText：合法 JSON / 非法 JSON / 缺字段 / 非法枚举
 * 2. 缓存读写：save/load 往返 + TTL 过期降级
 * 3. getCompetitionFormatIntel / buildPrematchIntel：命中 / 未命中
 * 4. groundedSearchFormat：mock 成功 / mock 失败降级（返回 null 不抛异常）
 * 5. prefetchCompetitionFormat：mock 成功写缓存并返回 meta
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseCompetitionFormatFromText,
  savePrematchIntelCache,
  loadPrematchIntelCache,
  getCompetitionFormatIntel,
  buildPrematchIntel,
  groundedSearchFormat,
  prefetchCompetitionFormat
} from '../04_ai_evaluator/intelPrefetchService.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

// 隔离缓存文件到临时路径，避免污染真实 prematch_intel.json
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intel_test_'));
const tmpCache = path.join(tmpDir, 'prematch_intel.json');
process.env.PREMATCH_INTEL_PATH = tmpCache;

// mock Gemini client：interactions.create 返回固定 output_text
function makeMockClient(text: string | null, throwError = false) {
  return {
    interactions: {
      create: async () => {
        if (throwError) throw new Error('mock api failure');
        return { output_text: text };
      }
    }
  } as any;
}

async function run() {
  console.log('=== [Layer 04] 情报预取服务验证 ===\n');

  // --- 1. parseCompetitionFormatFromText ---
  const ok = parseCompetitionFormatFromText(
    '{"total_teams":18,"relegation_slots":2,"continental_slots":4,"format_type":"single","season":"2026-27"}',
    '法甲'
  );
  assert(ok !== null, '合法 JSON 应解析成功');
  assert(ok!.total_teams === 18, `total_teams 应为 18，实为 ${ok!.total_teams}`);
  assert(ok!.source === 'INTEL', '解析结果的 source 应为 INTEL');
  assert(ok!.season === '2026-27', '应保留 season 字段');

  const badJson = parseCompetitionFormatFromText('not json', '法甲');
  assert(badJson === null, '非法 JSON 应返回 null');

  const missing = parseCompetitionFormatFromText('{"total_teams":18}', '法甲');
  assert(missing === null, '缺字段应返回 null');

  const badEnum = parseCompetitionFormatFromText('{"total_teams":18,"relegation_slots":2,"continental_slots":4,"format_type":"weird"}', '法甲');
  assert(badEnum === null, '非法 format_type 应返回 null');

  // --- 2. 缓存读写 + TTL ---
  const cache = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    competition_format: {
      '法甲': { total_teams: 18, relegation_slots: 2, continental_slots: 4, format_type: 'single' as const, source: 'INTEL' as const, season: '2026-27' }
    }
  };
  savePrematchIntelCache(cache);
  const loaded = loadPrematchIntelCache();
  assert(loaded !== null, '刚写入的缓存应能加载');
  assert(loaded!.competition_format['法甲'].total_teams === 18, '缓存内容应一致');

  // 过期缓存：generated_at 为 25h 前
  const expired = { ...cache, generated_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() };
  fs.writeFileSync(tmpCache, JSON.stringify(expired, null, 2), 'utf8');
  assert(loadPrematchIntelCache() === null, '过期缓存应返回 null（TTL 生效）');

  // --- 3. getCompetitionFormatIntel / buildPrematchIntel ---
  savePrematchIntelCache(cache);
  assert(getCompetitionFormatIntel('法甲')?.total_teams === 18, '应命中法甲缓存');
  assert(getCompetitionFormatIntel('英超') === null, '未缓存联赛应返回 null');
  assert(buildPrematchIntel('法甲')?.competition_format?.total_teams === 18, 'buildPrematchIntel 应组装成功');
  assert(buildPrematchIntel('英超') === null, '未缓存联赛 buildPrematchIntel 应为 null');

  // --- 4. groundedSearchFormat：mock 成功 / 失败降级 ---
  const goodText = await groundedSearchFormat('query', makeMockClient('{"total_teams":20,"relegation_slots":3,"continental_slots":6,"format_type":"single"}'));
  assert(goodText !== null, 'mock 成功应返回文本');

  const failText = await groundedSearchFormat('query', makeMockClient(null, true));
  assert(failText === null, 'mock 失败应降级返回 null，不抛异常');

  const emptyText = await groundedSearchFormat('query', makeMockClient(null));
  assert(emptyText === null, '空响应应降级返回 null');

  // --- 5. prefetchCompetitionFormat：mock 成功写缓存 ---
  const meta = await prefetchCompetitionFormat('英超', '2026-27', makeMockClient('{"total_teams":20,"relegation_slots":3,"continental_slots":6,"format_type":"single"}'));
  assert(meta !== null && meta.total_teams === 20, '预取应返回 meta');
  assert(getCompetitionFormatIntel('英超')?.total_teams === 20, '预取结果应写入缓存');
  assert(getCompetitionFormatIntel('法甲')?.total_teams === 18, '预取英超不应覆盖法甲缓存');

  // 清理临时目录
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✅ [Layer 04] 情报预取服务全部断言通过');
}

run().catch((e) => {
  console.error(e);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
});

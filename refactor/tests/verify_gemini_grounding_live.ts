/**
 * @file verify_gemini_grounding_live.ts
 * @description 【真实联网诊断脚本】验证 Gemini Grounding with Google Search 在当前 GEMINI_API_KEY 上能否跑通。
 *
 * ⚠️ 此脚本会真实联网并消耗 API 额度，请手动运行，不要加入自动回归测试：
 *   npx tsx refactor/tests/verify_gemini_grounding_live.ts
 *
 * 诊断目标（已适配 2026-09 最新模型）：
 * 1. gemini-2.5-flash 已对新用户下线（404），改用 gemini-3.8-flash + Interactions API；
 * 2. 3.x 用 google_search tool（`tools: [{ type: 'google_search' }]`），验证能否联网搜索；
 * 3. 输出 grounding 引用来源（证明真的联网搜了）+ 返回 JSON 能否被解析。
 *
 * 需要代理时（Windows 系统代理 Node 不自动走），运行前设置：
 *   $env:HTTPS_PROXY='http://127.0.0.1:7078'; $env:NODE_USE_ENV_PROXY='1'
 */

import { GoogleGenAI } from '@google/genai';
import { parseCompetitionFormatFromText } from '../04_ai_evaluator/intelPrefetchService.js';

const MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
const API_KEY = process.env.GEMINI_API_KEY;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/** 递归提取 grounding 引用 URL（Interactions 返回结构待探索，做宽松遍历） */
function findUris(node: unknown, out: string[], depth = 0): void {
  if (node == null || depth > 6 || out.length >= 20) return;
  if (Array.isArray(node)) {
    for (const item of node) findUris(item, out, depth + 1);
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'uri' && typeof v === 'string' && v.startsWith('http')) out.push(v);
      else findUris(v, out, depth + 1);
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('  Gemini Grounding (Interactions API) 真实联网诊断');
  console.log('================================================================\n');

  if (!API_KEY) {
    console.error('❌ 未检测到环境变量 GEMINI_API_KEY。');
    process.exit(1);
  }
  console.log(`🔑 API Key: ${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)}`);
  console.log(`🤖 模型: ${MODEL}\n`);

  const client = new GoogleGenAI({ apiKey: API_KEY });
  const query = '请检索英超（英格兰足球超级联赛）2026-27 赛季的赛制信息，并用 JSON 返回：total_teams（参赛队总数）、relegation_slots（直接降级名额）、continental_slots（获得欧战资格名额）、format_type（single/split/swiss）。只输出 JSON。';

  try {
    const interaction = await withTimeout(
      client.interactions.create({
        model: MODEL as any,
        input: query,
        tools: [{ type: 'google_search' }] as any,
        generation_config: { temperature: 0.1 } as any
      }),
      60_000
    ) as any;

    console.log('✅ interactions.create 调用成功\n');

    const outputText = interaction?.output_text ?? interaction?.text ?? '';
    console.log(`📝 返回文本:\n${outputText}\n`);

    const uris: string[] = [];
    findUris(interaction, uris);
    console.log(`🔗 grounding 引用 URL (${uris.length} 条):`);
    if (uris.length === 0) {
      console.log('   ⚠️ 未找到 uri 字段（模型可能未触发搜索，或返回结构不同）');
      console.log('\n🧪 完整返回结构（前 2000 字符，用于定位 grounding 字段）:');
      console.log(JSON.stringify(interaction).slice(0, 2000));
    } else {
      for (const u of uris) console.log(`   - ${u}`);
    }

    const meta = parseCompetitionFormatFromText(outputText, '英超', '2026-27');
    console.log(`\n🧩 parseCompetitionFormatFromText 解析: ${meta ? JSON.stringify(meta) : '❌ 解析失败（返回非预期 JSON）'}`);

    console.log('\n================================================================');
    console.log(meta ? '  ✅ 诊断通过：3.8-flash + google_search 联网 + 解析正常' : '  ⚠️ 联网成功但 JSON 解析失败，请检查返回文本');
    console.log('================================================================');
    process.exit(meta ? 0 : 1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ interactions.create 失败: ${msg}`);
    console.error('   可能原因：key 无效 / 无代理连不上 Google / 模型名不支持。');
    process.exit(1);
  }
}

main();


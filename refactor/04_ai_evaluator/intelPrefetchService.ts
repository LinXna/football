/**
 * @file intelPrefetchService.ts
 * @description Layer 04 情报预取服务：联网（Gemini Grounding with Google Search）获取当季赛制元数据，
 *  写入 prematch_intel.json 缓存，供 Layer 03 只读（无缓存时降级内置 fallback）。
 *
 * 三条防线，确保 Layer 03 永不阻塞、永不联网：
 *  1. 缓存 TTL：同联赛同赛季 24h 内不重复联网；
 *  2. 硬超时：单次搜索 30s 封顶，超时立即失败；
 *  3. 失败降级：任何异常返回 null，由上层走 BUILTIN_FALLBACK。
 *
 * 物理隔离：本服务仅依赖 @google/genai + refactor 内部类型，绝不 import 旧系统 server/**。
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CompetitionFormatMeta, PrematchIntel } from '../03_quant_engine/motivationUrgency.js';

/** 缓存路径（延迟求值，支持 PREMATCH_INTEL_PATH 覆盖，便于测试隔离） */
function getIntelCachePath(): string {
  return process.env.PREMATCH_INTEL_PATH || path.join(process.cwd(), 'refactor', 'runtime', 'prematch_intel.json');
}
const INTEL_TTL_MS = 24 * 3600 * 1000; // 24h（赛制元数据赛季级，实际可更长，此处保守）
const SEARCH_TIMEOUT_MS = 30_000;      // 30s 硬超时
const MAX_RETRIES = 2;                  // 最多重试 2 次

/**
 * prematch_intel.json 缓存结构
 */
export interface PrematchIntelCache {
  version: string;
  generated_at: string;
  competition_format: Record<string, CompetitionFormatMeta>;
}

/** 严格原子写入：临时文件 + 校验 + 原子重命名（与 06 层 OOS 服务同范式） */
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
    try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    throw new Error(`[intelPrefetchService] atomic write verification failed: ${String(err)}`);
  }
  fs.renameSync(tempPath, fullPath);
}

/** 硬超时包装：无论 SDK 是否支持 signal，都能强制在 ms 内失败 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('INTEL_SEARCH_TIMEOUT')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/** 加载缓存（含 TTL 检查），无缓存或过期返回 null */
export function loadPrematchIntelCache(): PrematchIntelCache | null {
  try {
    const cachePath = getIntelCachePath();
    if (!fs.existsSync(cachePath)) return null;
    const raw = fs.readFileSync(cachePath, 'utf8');
    const cache = JSON.parse(raw) as PrematchIntelCache;
    if (!cache || typeof cache !== 'object' || !cache.competition_format) return null;
    const generatedAt = Date.parse(cache.generated_at || '');
    if (!isNaN(generatedAt) && Date.now() - generatedAt > INTEL_TTL_MS) return null;
    return cache;
  } catch {
    return null;
  }
}

/** 原子保存缓存 */
export function savePrematchIntelCache(cache: PrematchIntelCache): void {
  atomicWriteJsonSync(getIntelCachePath(), cache);
}

/** 从缓存读取某联赛的当季赛制元数据（无则返回 null，交由上层降级内置 fallback） */
export function getCompetitionFormatIntel(leagueName: string): CompetitionFormatMeta | null {
  const cache = loadPrematchIntelCache();
  if (!cache) return null;
  const clean = (leagueName || '').trim().toLowerCase();
  // 先精确 key 匹配，再宽松子串匹配
  if (cache.competition_format[clean]) return cache.competition_format[clean];
  for (const [key, meta] of Object.entries(cache.competition_format)) {
    if (clean.includes(key) || key.includes(clean)) return meta;
  }
  return null;
}

/** 构造供 Layer 03 只读的 PrematchIntel（从缓存组装，含赛制元数据） */
export function buildPrematchIntel(leagueName: string): PrematchIntel | null {
  const format = getCompetitionFormatIntel(leagueName);
  if (!format) return null;
  return { competition_format: format };
}

/**
 * 联网搜索当季赛制元数据（Grounding with Google Search）
 * @param query 搜索 query
 * @param client 可注入的 GoogleGenAI 实例（测试时传 mock，生产缺省则新建）
 * @returns Gemini 返回的 JSON 文本；超时/失败返回 null
 */
export async function groundedSearchFormat(query: string, client?: GoogleGenAI): Promise<string | null> {
  const ai = client ?? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const interaction = await withTimeout(
        ai.interactions.create({
          model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
          input: query,
          generation_config: { temperature: 0.1 },
          // Grounding with Google Search：3.x 用 google_search tool（Interactions API 写法）
          tools: [{ type: 'google_search' }]
        } as any),
        SEARCH_TIMEOUT_MS
      );

      const text = (interaction as any)?.output_text ?? '';
      if (!text) {
        lastErr = new Error('Empty grounded search response');
        continue;
      }
      return text;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[intelPrefetchService] grounded search attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  console.warn(`[intelPrefetchService] grounded search exhausted, degrading to fallback: ${String(lastErr)}`);
  return null;
}

/**
 * 解析 Gemini 返回的 JSON 文本为 CompetitionFormatMeta（source='INTEL'）
 * 任何字段缺失/非法都返回 null（绝不编造），交由上层降级内置 fallback
 */
export function parseCompetitionFormatFromText(
  text: string,
  leagueName: string,
  fallbackSeason: string | null = null
): CompetitionFormatMeta | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const totalTeams = Number(raw.total_teams);
    const relegationSlots = Number(raw.relegation_slots);
    const continentalSlots = Number(raw.continental_slots);
    const formatType = raw.format_type;

    if (!Number.isInteger(totalTeams) || totalTeams <= 0) return null;
    if (!Number.isInteger(relegationSlots) || relegationSlots < 0) return null;
    if (!Number.isInteger(continentalSlots) || continentalSlots < 0) return null;
    if (formatType !== 'single' && formatType !== 'split' && formatType !== 'swiss') return null;

    return {
      total_teams: totalTeams,
      relegation_slots: relegationSlots,
      continental_slots: continentalSlots,
      format_type: formatType,
      source: 'INTEL',
      season: typeof raw.season === 'string' && raw.season ? raw.season : fallbackSeason
    };
  } catch {
    return null;
  }
}

/**
 * 预取单个联赛的当季赛制元数据并写入缓存（原子更新，不覆盖其他联赛条目）
 * @returns 成功返回 CompetitionFormatMeta，失败返回 null
 */
export async function prefetchCompetitionFormat(
  leagueName: string,
  season: string | null = null,
  client?: GoogleGenAI
): Promise<CompetitionFormatMeta | null> {
  const clean = (leagueName || '').trim();
  if (!clean) return null;

  const query = `请检索 ${clean} 当前赛季（${season || '最新赛季'}）的联赛赛制信息，并返回 JSON 对象（只输出 JSON，不要额外文字）：total_teams（参赛队总数）、relegation_slots（直接降级名额）、continental_slots（获得洲际/欧战资格的名额，即前多少名有争冠动力）、format_type（single/split/swiss）。`;

  const text = await groundedSearchFormat(query, client);
  if (!text) return null;

  const meta = parseCompetitionFormatFromText(text, clean, season);
  if (!meta) return null;

  // 原子合并写缓存（保留其他联赛条目）
  const existing = loadPrematchIntelCache();
  const next: PrematchIntelCache = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    competition_format: {
      ...(existing?.competition_format ?? {}),
      [clean.toLowerCase()]: meta
    }
  };
  savePrematchIntelCache(next);
  return meta;
}

/**
 * 批量预取多个联赛的赛制元数据（顺序执行，单联赛失败不中断其他联赛）
 */
export async function prefetchCompetitionFormats(leagues: string[]): Promise<{
  fetched: string[];
  failed: string[];
}> {
  const fetched: string[] = [];
  const failed: string[] = [];
  for (const league of leagues) {
    const meta = await prefetchCompetitionFormat(league);
    if (meta) fetched.push(league);
    else failed.push(league);
  }
  return { fetched, failed };
}


import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const GEMINI_MODEL = 'gemini-3.6-flash';
const PRIMARY_MARKET_SEQUENCE = ['full_h2h', 'full_spread', 'full_total', 'half_h2h', 'half_spread', 'half_total'];

function normalizeYbtyMarketTypes(rawMarkets: any): any[] {
  const markets = Array.isArray(rawMarkets) ? rawMarkets.map((market: any) => ({ ...market })) : [];
  if (markets.length < PRIMARY_MARKET_SEQUENCE.length) return markets;
  const primary = markets.slice(0, PRIMARY_MARKET_SEQUENCE.length);
  const semanticTypes = primary.map((market: any) => String(market.market || '').replace(/^unclassified_/, ''));
  const hasPrimaryLayout = primary.every((market: any) => String(market.market_title_raw || '').includes('handicap-col-3'));
  const hasExpectedSemantics = semanticTypes.join('|') === 'h2h|spread|total|h2h|spread|total';
  const hasExpectedIndexes = primary.map((market: any) => Number(market.line_index)).join('|') === '0|0|0|1|1|1';
  if (!hasPrimaryLayout || !hasExpectedSemantics || !hasExpectedIndexes) return markets;
  for (let index = 0; index < PRIMARY_MARKET_SEQUENCE.length; index += 1) {
    markets[index] = {
      ...markets[index],
      market: PRIMARY_MARKET_SEQUENCE[index],
      market_type_verified: true,
      market_type_source: 'verified_dom_primary_six_column_layout',
      market_type_confidence: 1,
    };
  }
  return markets;
}

function isGeminiNetworkFailure(error: any): boolean {
  const code = error?.cause?.code || error?.code;
  return error?.message === 'fetch failed' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ECONNRESET';
}

function geminiHttpStatus(error: any): number | null {
  const direct = Number(error?.status || error?.statusCode || error?.response?.status);
  if (Number.isFinite(direct) && direct >= 100) return direct;
  const match = String(error?.message || error || '').match(/(?:\(|\b)(429|500|502|503|504)(?:\)|\b)/);
  return match ? Number(match[1]) : null;
}

function isRetryableGeminiFailure(error: any): boolean {
  const status = geminiHttpStatus(error);
  return isGeminiNetworkFailure(error) || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

// Per-key rate gates: each Gemini key gets its own queue and last-request timestamp
// so different keys can fire concurrently without blocking each other.
const geminiKeyRateGates = new Map<string, Promise<void>>();
const geminiKeyLastRequestAt = new Map<string, number>();
let geminiKeyCursor = 0;
const geminiKeyCooldowns = new Map<string, number>();

function parseGeminiRetryDelay(error: any): number {
  const msg = String(error?.message || error?.details || error || '');
  const match = msg.match(/retry in ([\d\.]+)s/i) || msg.match(/retryDelay[:=]\s*["']?([\d\.]+)s?["']?/i);
  if (match) {
    const sec = parseFloat(match[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000) + 1000;
  }
  return 15000;
}

// Per-key rate gate: guarantees minimumGapMs between consecutive calls to the SAME key.
// Different keys proceed in parallel independently.
async function waitForGeminiRateSlot(apiKey: string, minimumGapMs = 3500): Promise<void> {
  const previous = geminiKeyRateGates.get(apiKey) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  geminiKeyRateGates.set(apiKey, next);
  await previous;
  const lastAt = geminiKeyLastRequestAt.get(apiKey) || 0;
  const remaining = minimumGapMs - (Date.now() - lastAt);
  if (remaining > 0) await waitForRetry(remaining);
  geminiKeyLastRequestAt.set(apiKey, Date.now());
  release();
}

function parseModelJson(text: string): any {
  const cleaned = String(text || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/^\uFEFF/, '')
    .trim();
  const attempts = [cleaned];
  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) attempts.push(cleaned.slice(objectStart, objectEnd + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      // Try the next normalized representation.
    }
  }
  throw new Error('invalid_model_json');
}

async function generateGeminiViaWindowsNetwork(apiKey: string, prompt: string): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('Gemini SDK network request failed. Check the server network connection.');
  }

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)",
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [Console]::OutputEncoding",
    "$body = [Console]::In.ReadToEnd()",
    "$headers = @{ 'x-goog-api-key' = $env:GEMINI_API_KEY }",
    `$uri = 'https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent'`,
    "$response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 120",
    "$response | ConvertTo-Json -Depth 100 -Compress",
  ].join('; ');

  return await new Promise<string>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, GEMINI_API_KEY: apiKey },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`Gemini Windows network fallback failed: ${stderr.trim() || `exit code ${code}`}`));
        return;
      }
      try {
        const response = JSON.parse(stdout);
        const text = response?.candidates?.[0]?.content?.parts
          ?.map((part: any) => part?.text || '')
          .join('')
          .trim();
        if (!text) throw new Error('Gemini returned no text content.');
        resolve(text);
      } catch (error: any) {
        reject(new Error(`Invalid Gemini fallback response: ${error.message}`));
      }
    });
    child.stdin.end(requestBody, 'utf8');
  });
}

app.use(express.json({ limit: '25mb' }));

// Helper to safely read JSON files
function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      const rawContent = fs.readFileSync(fullPath, 'utf-8');
      const content = rawContent.replace(/^\uFEFF/, '').trim();
      if (!content) return fallback;
      return JSON.parse(content) as T;
    }
  } catch (err) {
    console.warn(`[Server] Error reading ${filePath}:`, err);
  }
  return fallback;
}

// Helper to safely write JSON files
function writeJsonFile(filePath: string, data: any): boolean {
  let tempPath = '';
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    tempPath = `${fullPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, fullPath);
    return true;
  } catch (err) {
    console.error(`[Server] Error writing ${filePath}:`, err);
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch { /* best-effort cleanup */ }
    }
    return false;
  }
}

function requireJsonWrites(entries: Array<[string, any]>): void {
  const transactionId = `${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  const staged = entries.map(([filePath, data]) => {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    return {
      filePath,
      fullPath,
      tempPath: `${fullPath}.${transactionId}.tmp`,
      backupPath: `${fullPath}.${transactionId}.bak`,
      existed: fs.existsSync(fullPath),
      content: JSON.stringify(data, null, 2),
    };
  });
  try {
    for (const item of staged) {
      fs.mkdirSync(path.dirname(item.fullPath), { recursive: true });
      fs.writeFileSync(item.tempPath, item.content, 'utf-8');
      if (item.existed) fs.copyFileSync(item.fullPath, item.backupPath);
    }
    for (const item of staged) fs.renameSync(item.tempPath, item.fullPath);
  } catch (error) {
    for (const item of staged) {
      try {
        if (fs.existsSync(item.backupPath)) fs.copyFileSync(item.backupPath, item.fullPath);
        else if (!item.existed && fs.existsSync(item.fullPath)) fs.unlinkSync(item.fullPath);
      } catch { /* best-effort rollback */ }
    }
    throw new Error(`JSON transaction failed for ${entries.map(([filePath]) => filePath).join(', ')}: ${String(error)}`);
  } finally {
    for (const item of staged) {
      for (const cleanupPath of [item.tempPath, item.backupPath]) {
        try { if (fs.existsSync(cleanupPath)) fs.unlinkSync(cleanupPath); } catch { /* best-effort cleanup */ }
      }
    }
  }
}

function recommendationKey(item: any): string {
  const recommendation = item?.recommendation || {};
  const score = item?.score_at_recommendation || item?.score || {};
  return [
    cleanTeamName(item?.ybty_home || item?.match?.split(' vs ')[0] || ''),
    cleanTeamName(item?.ybty_away || item?.match?.split(' vs ')[1] || ''),
    Number(item?.minute ?? 0),
    Number(score.home ?? 0),
    Number(score.away ?? 0),
    String(recommendation.market || '').trim().toLowerCase(),
    String(recommendation.line ?? '').trim().toLowerCase(),
    String(recommendation.odds ?? '').trim().toLowerCase(),
  ].join('|');
}

function matchIdentity(item: any): string {
  return [
    cleanTeamName(item?.ybty_home || item?.match?.split(' vs ')[0] || ''),
    cleanTeamName(item?.ybty_away || item?.match?.split(' vs ')[1] || ''),
  ].join('|');
}

function directionIdentity(item: any): string {
  const recommendation = item?.recommendation || item || {};
  return [
    matchIdentity(item),
    String(recommendation.market || '').trim().toLowerCase(),
    String(recommendation.line ?? '').trim().toLowerCase(),
  ].join('|');
}

function hasUsableRecommendation(recommendation: any): boolean {
  if (!recommendation || typeof recommendation !== 'object') return false;
  const market = String(recommendation.market ?? '').trim();
  const line = String(recommendation.line ?? '').trim();
  const odds = Number(recommendation.odds);
  return market.length > 0 && line.length > 0 && Number.isFinite(odds) && odds > 1;
}

function hasExplicitBetDirection(item: any): boolean {
  const recommendation = item?.recommendation || item || {};
  const market = String(recommendation.market || '').trim();
  const line = String(recommendation.line ?? '').trim();
  const combined = `${market} ${line}`.toLowerCase();
  if (/大小球|total/i.test(market)) {
    const directionText = `${market.replace(/大小球|total goals?/gi, ' ')} ${line}`;
    return /大|小|over|under/i.test(directionText);
  }
  if (/让球|spread|handicap/i.test(market)) {
    const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[\s\-_·\.（）()]/g, '');
    const normalizedCombined = normalize(combined);
    return /主|客|home|away/i.test(combined)
      || Boolean(normalize(item?.ybty_home) && normalizedCombined.includes(normalize(item.ybty_home)))
      || Boolean(normalize(item?.ybty_away) && normalizedCombined.includes(normalize(item.ybty_away)));
  }
  return true;
}

function sanitizeParlayLeg(leg: any, candidateMatches: any[] = []): any {
  if (!leg || typeof leg !== 'object') return leg;
  let market = String(leg.market || '').trim();
  let line = leg.line != null && leg.line !== '' && leg.line !== 'null' ? String(leg.line).trim() : '';
  const home = String(leg.ybty_home || leg.match?.split(' vs ')[0] || '').trim();
  const away = String(leg.ybty_away || leg.match?.split(' vs ')[1] || '').trim();

  // 1. Translate raw English market keys
  if (/^full_total$/i.test(market)) market = '全场大小球';
  else if (/^half_total$/i.test(market)) market = '半场大小球';
  else if (/^full_spread$/i.test(market)) market = '全场让球';
  else if (/^half_spread$/i.test(market)) market = '半场让球';
  else if (/^full_h2h$/i.test(market)) market = '全场独赢1X2';
  else if (/^half_h2h$/i.test(market)) market = '半场独赢1X2';
  else if (/^total$/i.test(market)) market = '全场大小球';
  else if (/^spread$/i.test(market)) market = '全场让球';
  else if (/^h2h$/i.test(market)) market = '全场独赢1X2';

  // 2. Try to match from candidateMatches if direction is vague
  let matchedAssessment: any = null;
  if (Array.isArray(candidateMatches) && candidateMatches.length > 0) {
    const candidateMatch = candidateMatches.find((m: any) => 
      m.match === leg.match || 
      (cleanTeamName(m.ybty_home) === cleanTeamName(home) && cleanTeamName(m.ybty_away) === cleanTeamName(away))
    );
    if (candidateMatch) {
      const assessments = Array.isArray(candidateMatch.ai_evaluation?.market_assessments)
        ? candidateMatch.ai_evaluation.market_assessments
        : Array.isArray(candidateMatch.ai_market_assessments)
        ? candidateMatch.ai_market_assessments
        : [];
      matchedAssessment = assessments.find((a: any) => 
        (a.category && a.category.includes(market)) || 
        (a.odds && Number(a.odds) === Number(leg.odds))
      ) || candidateMatch.recommendation;
    }
  }

  const combined = `${market} ${line}`.toLowerCase();

  // 3. Fix Over/Under direction
  if (/大小球|total/i.test(market)) {
    if (!/大|小|over|under/i.test(combined)) {
      const dirText = String(matchedAssessment?.direction || matchedAssessment?.category || matchedAssessment?.recommendation?.market || matchedAssessment?.recommendation?.line || '').toLowerCase();
      if (/小|under/i.test(dirText)) {
        line = `小 ${line}`.trim();
      } else {
        line = `大 ${line}`.trim();
      }
    } else if (/^over\s*/i.test(line)) {
      line = line.replace(/^over\s*/i, '大 ').trim();
    } else if (/^under\s*/i.test(line)) {
      line = line.replace(/^under\s*/i, '小 ').trim();
    }
  }

  // 4. Fix Handicap direction
  if (/让球|spread|handicap/i.test(market)) {
    const normalize = (v: any) => String(v || '').toLowerCase().replace(/[\s\-_·\.（）()]/g, '');
    const normHome = normalize(home);
    const normAway = normalize(away);
    const normLine = normalize(line);
    const hasHomeOrAway = /主|客|home|away/i.test(combined) ||
      (normHome && normLine.includes(normHome)) ||
      (normAway && normLine.includes(normAway));

    if (!hasHomeOrAway) {
      const dirText = String(matchedAssessment?.direction || matchedAssessment?.category || matchedAssessment?.recommendation?.market || matchedAssessment?.recommendation?.line || '').toLowerCase();
      const normDir = normalize(dirText);
      if (normAway && normDir.includes(normAway)) {
        line = `${away || '客队'} ${line}`.trim();
      } else if (normHome && normDir.includes(normHome)) {
        line = `${home || '主队'} ${line}`.trim();
      } else if (/客|away/i.test(dirText)) {
        line = `${away || '客队'} ${line}`.trim();
      } else {
        line = `${home || '主队'} ${line}`.trim();
      }
    }
  }

  // 5. Fix H2H direction
  if (/独赢|h2h|1x2/i.test(market)) {
    if (!/胜|平|draw|home|away|主|客/i.test(combined)) {
      if (line === '1' || /home/i.test(line)) line = `${home || '主队'}胜`;
      else if (line === '2' || /away/i.test(line)) line = `${away || '客队'}胜`;
      else if (line === 'x' || /draw/i.test(line)) line = '平局';
      else if (home) line = `${home}胜`;
    }
  }

  return {
    ...leg,
    market,
    line,
  };
}

function hideInvalidRecommendation(item: any): any {
  if (hasUsableRecommendation(item?.recommendation)) return item;
  return {
    ...item,
    recommendation: null,
    recommendation_validation: {
      valid: false,
      reason: 'missing_market_line_or_real_odds',
    },
  };
}

// ---------------- API ROUTES ----------------

// Live Pipeline Status & Decisions
app.get('/api/pipeline/live', (req, res) => {
  const status = readJsonFile('output/pipeline_status.json', {});
  const decisions = readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [], summary: {} });
  const candidates = readJsonFile<any>('output/ybty_leisu_candidates.json', { candidates: [] });
  const ybtyLatest = readJsonFile<any>('output/ybty_latest.json', { matches: [] });
  const rawMarketByMatch = new Map<string, any[]>();
  for (const match of Array.isArray(ybtyLatest.matches) ? ybtyLatest.matches : []) {
    rawMarketByMatch.set(`${cleanTeamName(match.home)}|${cleanTeamName(match.away)}`, normalizeYbtyMarketTypes(match.markets));
  }
  const visibleDecisions = (Array.isArray(decisions.decisions) ? decisions.decisions : []).map((item: any) => hideInvalidRecommendation({
      ...item,
      ybty_raw_markets: rawMarketByMatch.get(matchIdentity(item)) || normalizeYbtyMarketTypes(item.ybty_raw_markets),
    }));

  res.json({
    status,
    decisions: visibleDecisions,
    summary: decisions.summary || {},
    single_best: decisions.single_best || null,
    parlay_5x: decisions.parlay_5x || null,
    candidates: candidates.candidates || [],
  });
});

// Prematch Pipeline Status & Decisions
app.get('/api/pipeline/prematch', (req, res) => {
  const status = readJsonFile('output/prematch_pipeline_status.json', {});
  const decisions = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });
  const candidates = readJsonFile<any>('output/ybty_leisu_prematch_candidates.json', { candidates: [] });
  const brief = readJsonFile('output/prematch_ai_brief.json', {});

  const formalDecisions = Array.isArray(decisions.decisions) ? decisions.decisions : [];
  const researchQueue = Array.isArray(decisions.research_queue) ? decisions.research_queue : [];
  const formalMatches = new Set(formalDecisions.map((item: any) => String(item?.match || '')));
  // B/C research items must remain visible to the UI. A formal decision for the
  // same match takes precedence so the match is not rendered twice.
  const visibleDecisions = [
    ...formalDecisions,
    ...researchQueue.filter((item: any) => !formalMatches.has(String(item?.match || ''))),
  ].map((item: any) => hideInvalidRecommendation({ ...item, ybty_raw_markets: normalizeYbtyMarketTypes(item.ybty_raw_markets) }));

  res.json({
    status,
    decisions: visibleDecisions,
    formal_decisions: formalDecisions,
    research_queue: researchQueue,
    summary: decisions.summary || {},
    candidates: candidates.candidates || [],
    brief,
  });
});

// Recommendation Ledger
app.get('/api/ledger', (req, res) => {
  const ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);
  res.json(ledger);
});

app.post('/api/ledger/add', (req, res) => {
  try {
    const newItem = req.body;
    if (!newItem || !newItem.match || !newItem.recommendation) {
      return res.status(400).json({ error: 'Invalid recommendation data' });
    }
    const recommendation = newItem.recommendation;
    if (!hasUsableRecommendation(recommendation)) {
      return res.status(400).json({ error: 'A formal recommendation requires market, line, and numeric odds' });
    }
    if (!['A', 'B'].includes(String(newItem.grade || ''))) {
      return res.status(400).json({ error: 'A formal recommendation must be B grade or above' });
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(newItem.start_time_beijing || ''))) {
      return res.status(400).json({ error: 'A formal recommendation requires a concrete Beijing start time' });
    }
    const isLiveRecommendation = Number(newItem.minute || 0) > 0;
    if (isLiveRecommendation) {
      const score = newItem.score_at_recommendation;
      const validScore = score && Number.isFinite(Number(score.home)) && Number.isFinite(Number(score.away));
      if (!validScore || newItem.score_verified !== true || !newItem.score_source || newItem.score_source === 'unverified') {
        return res.status(400).json({ error: 'A live formal recommendation requires a verified score and score source' });
      }
    }

    const ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);

    const duplicate = ledger.find((item: any) =>
      (item.formal_recommendation === true || item.record_type === 'formal_ai_recommendation') &&
      recommendationKey(item) === recommendationKey(newItem)
    );
    if (duplicate) {
      return res.status(409).json({ error: 'Duplicate formal recommendation', duplicate_id: duplicate.id });
    }
    if (Array.isArray(newItem.parlay_legs)) {
      newItem.parlay_legs = newItem.parlay_legs.map((leg: any) => sanitizeParlayLeg(leg));
    }
    const incomingLegs = Array.isArray(newItem.parlay_legs) ? newItem.parlay_legs : [];
    const parlayRequested = newItem.is_parlay === true || incomingLegs.length > 0 || /串\s*1|精选彩票/.test(String(newItem.recommendation?.market || ''));
    if (parlayRequested && incomingLegs.length < 2) {
      return res.status(400).json({ error: 'A formal parlay must include at least two structured legs' });
    }
    if (incomingLegs.length > 0) {
      const invalidLeg = incomingLegs.find((leg: any) =>
        !leg?.match || !leg?.ybty_home || !leg?.ybty_away ||
        !hasUsableRecommendation(leg) ||
        !hasExplicitBetDirection(leg) ||
        !['A', 'B'].includes(String(leg?.grade || '')) ||
        !/^\d{4}-\d{2}-\d{2}/.test(String(leg?.start_time_beijing || '')) ||
        (Number(leg?.minute || 0) > 0 && leg?.score_verified !== true)
      );
      if (invalidLeg) {
        return res.status(400).json({ error: 'Every formal parlay leg must include an explicit betting side/direction, B+ grade, teams, market, time, odds, and verified live score', leg: invalidLeg.match });
      }
      const matchKeys = incomingLegs.map(matchIdentity);
      if (new Set(matchKeys).size !== matchKeys.length) {
        return res.status(409).json({ error: 'A parlay cannot contain multiple markets from the same match' });
      }
      const directionUsage = new Map<string, number>();
      for (const item of ledger) {
        for (const leg of Array.isArray(item.parlay_legs) ? item.parlay_legs : []) {
          const key = directionIdentity(leg);
          directionUsage.set(key, (directionUsage.get(key) || 0) + 1);
        }
      }
      const overusedCore = incomingLegs.find((leg: any) => {
        return (directionUsage.get(directionIdentity(leg)) || 0) >= 1;
      });
      if (overusedCore) {
        return res.status(409).json({
          error: 'This direction has reached its parlay exposure limit (one formal ticket per researched direction)',
          leg: overusedCore.match,
        });
      }
    }
    
    // Ensure required protocol fields
    const formalItem = {
      id: newItem.id || Math.random().toString(16).substring(2, 10),
      created_at: new Date().toISOString(),
      match: newItem.match,
      ybty_home: newItem.ybty_home || newItem.match.split(' vs ')[0] || '',
      ybty_away: newItem.ybty_away || newItem.match.split(' vs ')[1] || '',
      minute: newItem.minute ?? 0,
      score_at_recommendation: newItem.score_at_recommendation || null,
      score_source: newItem.score_source || 'unverified',
      score_verified: newItem.score_verified === true,
      grade: newItem.grade || 'B',
      model_score: newItem.model_score || 75.0,
      recommendation: newItem.recommendation, // { market, line, odds }
      evidence: newItem.evidence || [],
      risks: newItem.risks || [],
      review: {
        status: 'pending',
        final_score: null,
        outcome: 'pending'
      },
      record_type: 'formal_ai_recommendation',
      formal_recommendation: true,
      start_time_beijing: newItem.start_time_beijing || '推算时间',
      is_parlay: Boolean(newItem.is_parlay || (newItem.parlay_legs && newItem.parlay_legs.length > 0)),
      parlay_legs: newItem.parlay_legs || [],
    };

    ledger.unshift(formalItem);
    const success = writeJsonFile('output/recommendation_ledger.json', ledger);

    if (success) {
      res.json({ success: true, item: formalItem });
    } else {
      res.status(500).json({ error: 'Failed to write ledger file' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Store research/backtest candidates separately from formal recommendations.
// These records are reviewable after full time but never count toward formal ROI/hit rate.
app.post('/api/ledger/add-candidate', (req, res) => {
  try {
    const newItem = req.body;
    if (newItem?.is_parlay === true && Array.isArray(newItem.parlay_legs)) {
      newItem.parlay_legs = newItem.parlay_legs.map((leg: any) => sanitizeParlayLeg(leg));
    }
    const recommendation = newItem?.recommendation;
    const predictionOnly = newItem?.prediction_only === true;
    if (!newItem?.match || !recommendation?.market || recommendation.line === undefined || (!predictionOnly && !Number.isFinite(Number(recommendation.odds)))) {
      return res.status(400).json({ error: 'A backtest record requires match, market, line, and real odds unless it is a prediction-only record' });
    }
    if (!predictionOnly && !hasExplicitBetDirection(newItem)) {
      return res.status(400).json({ error: '投注方向不明确：大小球必须写明大/小，让球必须写明主队、客队或具体球队。' });
    }
    if (newItem?.is_parlay === true && Array.isArray(newItem.parlay_legs) && newItem.parlay_legs.some((leg: any) => !hasExplicitBetDirection(leg))) {
      return res.status(400).json({ error: '串关腿投注方向不明确，禁止保存未注明投注球队的让球或未注明大/小的大小球。' });
    }
    const ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);
    const candidateKey = recommendationKey(newItem);
    const duplicate = ledger.find((item: any) => item.record_type === 'machine_candidate' && recommendationKey(item) === candidateKey);
    if (duplicate) return res.status(409).json({ error: 'Duplicate backtest candidate', duplicate_id: duplicate.id });

    const candidateItem = {
      id: `candidate_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      created_at: new Date().toISOString(),
      match: newItem.match,
      ybty_home: newItem.ybty_home || newItem.match.split(' vs ')[0] || '',
      ybty_away: newItem.ybty_away || newItem.match.split(' vs ')[1] || '',
      minute: Number(newItem.minute || 0),
      score_at_recommendation: newItem.score_at_recommendation || null,
      score_source: newItem.score_source || 'unverified',
      score_verified: newItem.score_verified === true,
      grade: newItem.grade || 'C',
      model_score: Number(newItem.model_score || 0),
      recommendation: {
        market: recommendation.market,
        line: recommendation.line,
        odds: predictionOnly ? 1 : Number(recommendation.odds),
      },
      candidate_source: newItem.candidate_source || 'ybty_market_snapshot',
      implied_probability: Number(newItem.implied_probability || 0),
      prediction_probability: Number(newItem.prediction_probability || 0),
      prediction_only: predictionOnly,
      prediction_type: newItem.prediction_type || null,
      model_version: newItem.model_version || null,
      selection_method: newItem.selection_method || 'lowest_market_odds',
      evidence: newItem.evidence || [],
      risks: newItem.risks || [],
      review: { status: 'pending', final_score: null, outcome: 'pending' },
      record_type: 'machine_candidate',
      formal_recommendation: false,
      start_time_beijing: newItem.start_time_beijing || null,
      is_parlay: newItem.is_parlay === true && Array.isArray(newItem.parlay_legs) && newItem.parlay_legs.length >= 2,
      parlay_legs: Array.isArray(newItem.parlay_legs) ? newItem.parlay_legs : [],
    };
    ledger.unshift(candidateItem);
    if (!writeJsonFile('output/recommendation_ledger.json', ledger)) {
      return res.status(500).json({ error: 'Failed to write ledger file' });
    }
    res.json({ success: true, item: candidateItem });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ledger/add-ai-assessments', (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (entries.length === 0) return res.status(400).json({ error: '没有可保存的AI投注建议。' });
    const ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);
    let saved = 0;
    let duplicates = 0;
    const rejected: string[] = [];
    for (const entry of entries) {
      const recommendation = entry?.recommendation;
      if (!entry?.match || !recommendation?.market || recommendation.line === undefined || !Number.isFinite(Number(recommendation.odds)) || Number(recommendation.odds) <= 1) {
        rejected.push(entry?.match || '未知比赛');
        continue;
      }
      if (!hasExplicitBetDirection(entry)) {
        rejected.push(`${entry.match}（方向不明确）`);
        continue;
      }
      if (ledger.some((item: any) => recommendationKey(item) === recommendationKey(entry))) {
        duplicates++;
        continue;
      }
      ledger.unshift({
        id: `ai_candidate_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        created_at: new Date().toISOString(),
        match: entry.match,
        ybty_home: entry.ybty_home || '',
        ybty_away: entry.ybty_away || '',
        minute: Number(entry.minute || 0),
        score_at_recommendation: entry.score_at_recommendation || null,
        score_source: entry.score_source || 'unverified',
        score_verified: entry.score_verified === true,
        grade: entry.grade || 'C',
        model_score: Number(entry.model_score || 0),
        recommendation: { market: recommendation.market, line: recommendation.line, odds: Number(recommendation.odds) },
        candidate_source: 'ai_market_assessment',
        prediction_probability: Number(entry.prediction_probability || entry.model_score || 0),
        selection_method: 'ai_full_market_assessment',
        evidence: entry.evidence || [],
        risks: entry.risks || [],
        review: { status: 'pending', final_score: null, outcome: 'pending' },
        record_type: 'machine_candidate',
        formal_recommendation: false,
        start_time_beijing: entry.start_time_beijing || null,
        is_parlay: false,
        parlay_legs: [],
      });
      saved++;
    }
    requireJsonWrites([['output/recommendation_ledger.json', ledger]]);
    res.json({ success: true, saved, duplicates, rejected, ledger });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI建议批量写入台账失败' });
  }
});

app.get('/api/ledger/archives', (req, res) => {
  res.json({ archives: readJsonFile<any[]>('output/recommendation_ledger_archives.json', []) });
});

app.post('/api/ledger/archive', (req, res) => {
  try {
    const ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);
    if (ledger.length === 0) return res.status(400).json({ error: '当前台账为空，无法归档。' });
    const archives = readJsonFile<any[]>('output/recommendation_ledger_archives.json', []);
    const snapshot = {
      id: `ledger_batch_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      name: String(req.body?.name || '').trim() || `台账批次 ${new Date().toLocaleString('zh-CN')}`,
      archived_at: new Date().toISOString(),
      item_count: ledger.length,
      items: ledger,
    };
    archives.unshift(snapshot);
    const clearCurrent = req.body?.clear_current === true;
    const writes: Array<[string, any]> = [['output/recommendation_ledger_archives.json', archives]];
    if (clearCurrent) writes.push(['output/recommendation_ledger.json', []]);
    requireJsonWrites(writes);
    res.json({ success: true, archive: snapshot, cleared_current: clearCurrent, ledger: clearCurrent ? [] : ledger });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '台账批次归档失败' });
  }
});

// Preserve the complete AI research output independently from the formal ledger.
// A snapshot may contain NO_BET/C-grade assessments and therefore must not affect ROI statistics.
app.get('/api/ai/evaluations', (req, res) => {
  const history = readJsonFile<any[]>('output/ai_evaluation_history.json', []);
  res.json({ evaluations: history });
});

const handleClearEvaluations = (req: express.Request, res: express.Response) => {
  try {
    writeJsonFile('output/ai_evaluation_history.json', []);
    res.json({ success: true, message: '已成功清空 AI 评估历史' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

app.post('/api/ai/evaluations/clear', handleClearEvaluations);
app.delete('/api/ai/evaluations/clear', handleClearEvaluations);
app.delete('/api/ai/evaluations', handleClearEvaluations);

app.post('/api/ai/evaluations/save', (req, res) => {
  try {
    const { mode, scope, result, evaluated_matches } = req.body || {};
    const hasBatchResult = Array.isArray(result?.matches) && result.matches.length > 0;
    const hasSingleResult = result && typeof result === 'object' && (result.summary || result.recommendation || result.market_assessments);
    if (!hasBatchResult && !hasSingleResult) {
      return res.status(400).json({ error: '没有可保存的 AI 评估内容' });
    }
    const historyPath = 'output/ai_evaluation_history.json';
    const history = readJsonFile<any[]>(historyPath, []);
    const snapshot = {
      id: `ai_eval_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      saved_at: new Date().toISOString(),
      mode: mode || 'unknown',
      scope: scope || (hasBatchResult ? 'batch' : 'single'),
      evaluated_matches: Array.isArray(evaluated_matches) ? evaluated_matches : [],
      result,
      record_type: 'ai_evaluation_snapshot',
      affects_formal_statistics: false,
    };
    history.unshift(snapshot);
    if (!writeJsonFile(historyPath, history)) {
      return res.status(500).json({ error: 'AI 评估快照文件写入失败' });
    }
    res.json({ success: true, snapshot_id: snapshot.id, saved_at: snapshot.saved_at });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI 评估快照保存失败' });
  }
});

// Helper to normalize team names for cross-provider and alias matching
function getTeamQualifiers(str: string) {
  const s = (str || '').toLowerCase();
  return {
    u20: s.includes('u20'),
    u21: s.includes('u21'),
    u23: s.includes('u23'),
    u19: s.includes('u19'),
    u17: s.includes('u17'),
    reserve: s.includes('后备') || s.includes('预备') || s.includes('reserve'),
    women: s.includes('女') || s.includes('women'),
    allStar: s.includes('明星') || s.includes('全明星') || s.includes('allstar') || s.includes('all-star'),
  };
}

function areQualifiersCompatible(a: string, b: string): boolean {
  const qa = getTeamQualifiers(a);
  const qb = getTeamQualifiers(b);
  if (qa.u20 !== qb.u20) return false;
  if (qa.u21 !== qb.u21) return false;
  if (qa.u23 !== qb.u23) return false;
  if (qa.u19 !== qb.u19) return false;
  if (qa.u17 !== qb.u17) return false;
  if (qa.reserve !== qb.reserve) return false;
  if (qa.women !== qb.women) return false;
  if (qa.allStar !== qb.allStar) return false;
  return true;
}

function cleanTeamName(str: any): string {
  if (typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/-(ybty|leisu|雷速|YBTY|LEISU)$/gi, '')
    .replace(/football club|fc|俱乐部|体育/gi, '')
    .replace(/[\s\(\)\（\）\【\】\[\]]/g, '')
    .trim();
}

function getSingleMatchTeams(item: any) {
  let homeRaw = item.ybty_home || '';
  let awayRaw = item.ybty_away || '';

  if ((!homeRaw || !awayRaw) && item.match && typeof item.match === 'string' && !item.match.startsWith('【AI')) {
    const parts = item.match.split(/\s+vs\s+/i);
    if (parts.length === 2) {
      if (!homeRaw) homeRaw = parts[0];
      if (!awayRaw) awayRaw = parts[1];
    }
  }
  return {
    homeRaw,
    awayRaw,
    home: cleanTeamName(homeRaw),
    away: cleanTeamName(awayRaw),
  };
}

function isTeamMatch(rawA: string, rawB: string): boolean {
  if (!rawA || !rawB) return false;
  if (!areQualifiersCompatible(rawA, rawB)) return false;

  const aClean = cleanTeamName(rawA);
  const bClean = cleanTeamName(rawB);

  if (aClean === bClean) return true;

  const genericList = ['墨西哥', '西班牙', '英格兰', '日本', '中国', '巴西', '阿根廷', '德国', '意大利', '法国', '巴拿马', '美国', '加拿大', '墨西'];
  if (
    aClean.length >= 4 &&
    bClean.length >= 4 &&
    !genericList.includes(aClean) &&
    !genericList.includes(bClean) &&
    (aClean.includes(bClean) || bClean.includes(aClean))
  ) {
    return true;
  }

  return false;
}

function areSameMatch(itemA: any, itemB: any): boolean {
  if (itemA.id && itemB.id && itemA.id === itemB.id) return true;

  const teamsA = getSingleMatchTeams(itemA);
  const teamsB = getSingleMatchTeams(itemB);

  if (teamsA.homeRaw && teamsA.awayRaw && teamsB.homeRaw && teamsB.awayRaw) {
    const homeMatches = isTeamMatch(teamsA.homeRaw, teamsB.homeRaw);
    const awayMatches = isTeamMatch(teamsA.awayRaw, teamsB.awayRaw);

    if (homeMatches && awayMatches) {
      return true;
    }
  }

  if (itemA.match && itemB.match && !itemA.match.startsWith('【AI') && !itemB.match.startsWith('【AI')) {
    if (itemA.match === itemB.match) return true;
  }

  return false;
}

// Update ledger item review (supports auto-syncing same match records & parlay legs)
app.post('/api/ledger/update-review', (req, res) => {
  try {
    const { id, match, ybty_home, ybty_away, leg_index, final_score, ht_score, score_verified, outcome, parlay_legs, syncSameMatch = true } = req.body;
    if (!id && !match && !ybty_home && (!parlay_legs || !Array.isArray(parlay_legs))) {
      return res.status(400).json({ error: 'ID, match, or parlay_legs identifier is required' });
    }

    let ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);
    const liveFile = readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [], summary: {} });
    const prematchFile = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });

    let updatedCount = 0;

    // Direct Parlay Legs Array Update for a specific Parlay Item
    if (id && Array.isArray(parlay_legs) && parlay_legs.length > 0) {
      ledger = ledger.map((item: any) => {
        if (item.id === id) {
          updatedCount++;
          item.is_parlay = true;
          item.parlay_legs = parlay_legs;
          item.review = item.review || {};
          item.review.status = 'reviewed';
          item.score_verified = parlay_legs.every((l: any) => l.score_verified);
        }
        return item;
      });

      // Auto-sync each leg in parlay_legs to other ledger items and decision files
      if (syncSameMatch) {
        for (const leg of parlay_legs) {
          if (!leg.final_score && !leg.ht_score) continue;
          const h = leg.ybty_home || (leg.match ? leg.match.split(' vs ')[0] : '');
          const a = leg.ybty_away || (leg.match ? leg.match.split(' vs ')[1] : '');
          const legRef = { match: leg.match || `${h} vs ${a}`, ybty_home: h, ybty_away: a };

          // Sync other ledger items
          ledger = ledger.map((item: any) => {
            if (item.id !== id && areSameMatch(legRef, item)) {
              item.review = item.review || {};
              if (leg.final_score) item.review.final_score = leg.final_score;
              if (leg.ht_score) item.review.ht_score = leg.ht_score;
              item.review.status = 'reviewed';
              item.score_verified = leg.score_verified === true;
            }
            if (item.id !== id && item.parlay_legs && Array.isArray(item.parlay_legs)) {
              item.parlay_legs = item.parlay_legs.map((otherLeg: any) => {
                if (areSameMatch(legRef, { match: otherLeg.match, ybty_home: otherLeg.ybty_home, ybty_away: otherLeg.ybty_away })) {
                  return {
                    ...otherLeg,
                    final_score: leg.final_score || otherLeg.final_score,
                    ht_score: leg.ht_score || otherLeg.ht_score,
                    score_verified: leg.score_verified === true,
                  };
                }
                return otherLeg;
              });
            }
            return item;
          });

          // Sync decisions files
          const scoreObj = leg.final_score;
          const htScoreObj = leg.ht_score;
          if (liveFile.decisions && Array.isArray(liveFile.decisions)) {
            liveFile.decisions = liveFile.decisions.map((d: any) => {
              if (areSameMatch(legRef, d)) {
                return {
                  ...d,
                  score: scoreObj || d.score,
                  ht_score: htScoreObj || d.ht_score,
                  score_verified: leg.score_verified === true,
                  score_source: 'parlay_leg_user_verification',
                  risks: leg.score_verified === true ? (d.risks || []).filter((r: string) => !r.includes('比分未经校验')) : (d.risks || []),
                };
              }
              return d;
            });
          }
          if (prematchFile.decisions && Array.isArray(prematchFile.decisions)) {
            prematchFile.decisions = prematchFile.decisions.map((d: any) => {
              if (areSameMatch(legRef, d)) {
                return {
                  ...d,
                  score: scoreObj || d.score,
                  ht_score: htScoreObj || d.ht_score,
                  score_verified: leg.score_verified === true,
                  score_source: 'parlay_leg_user_verification',
                  risks: leg.score_verified === true ? (d.risks || []).filter((r: string) => !r.includes('比分未经校验')) : (d.risks || []),
                };
              }
              return d;
            });
          }
        }
      }
    } else {
      // Find target item for single match / single leg update
      const targetItem = ledger.find((i: any) => i.id === id || (match && i.match === match));
      const refHome = ybty_home || (targetItem ? targetItem.ybty_home : '') || (match ? match.split(' vs ')[0] : '');
      const refAway = ybty_away || (targetItem ? targetItem.ybty_away : '') || (match ? match.split(' vs ')[1] : '');
      const dummyRef = { match: match || targetItem?.match || `${refHome} vs ${refAway}`, ybty_home: refHome, ybty_away: refAway };

      ledger = ledger.map((item: any) => {
        // 1. Single match item update
        if (syncSameMatch ? areSameMatch(dummyRef, item) : item.id === id) {
          updatedCount++;
          item.review = item.review || {};
          if (final_score) {
            item.review.final_score = final_score;
            item.review.status = 'reviewed';
          }
          if (ht_score) {
            item.review.ht_score = ht_score;
            item.review.status = 'reviewed';
          }
          if (outcome && item.id === id) {
            item.review.outcome = outcome;
          }
          if (score_verified !== undefined) {
            item.score_verified = score_verified;
          }
        }

        // 2. Parlay legs update inside parlay items
        if (item.parlay_legs && Array.isArray(item.parlay_legs) && item.parlay_legs.length > 0) {
          let parlayLegUpdated = false;
          item.parlay_legs = item.parlay_legs.map((leg: any) => {
            const legMatches = areSameMatch(dummyRef, {
              match: leg.match,
              ybty_home: leg.ybty_home,
              ybty_away: leg.ybty_away,
            });

            if (legMatches || (leg_index !== undefined && leg.leg_index === leg_index && item.id === id)) {
              parlayLegUpdated = true;
              return {
                ...leg,
                final_score: final_score || leg.final_score,
                ht_score: ht_score || leg.ht_score,
                score_verified: score_verified === undefined ? leg.score_verified === true : score_verified === true,
              };
            }
            return leg;
          });

          if (parlayLegUpdated) {
            updatedCount++;
          }
        }

        return item;
      });
    }

    requireJsonWrites([
      ['output/recommendation_ledger.json', ledger],
      ['output/ybty_leisu_decisions.json', liveFile],
      ['output/ybty_leisu_prematch_decisions.json', prematchFile],
    ]);

    res.json({ success: true, updatedCount, ledger });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated Batch Score Supplement & Verification Endpoint
app.post('/api/batch-supplement-scores', (req, res) => {
  try {
    const { items } = req.body; // Array of { match, ybty_home, ybty_away, final_score: {home, away}, score_verified: boolean }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for score supplement' });
    }

    let ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);
    const liveFile = readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [], summary: {} });
    const prematchFile = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });

    let updatedLedgerCount = 0;
    let updatedDecisionsCount = 0;

    for (const sup of items) {
      const hTeam = sup.ybty_home || (sup.match ? sup.match.split(' vs ')[0] : '');
      const aTeam = sup.ybty_away || (sup.match ? sup.match.split(' vs ')[1] : '');
      const dummyMatch = { match: sup.match || `${hTeam} vs ${aTeam}`, ybty_home: hTeam, ybty_away: aTeam };
      const scoreObj = sup.final_score || sup.score || { home: Number(sup.home_score || 0), away: Number(sup.away_score || 0) };
      const htScoreObj = sup.ht_score && Number.isFinite(Number(sup.ht_score.home)) && Number.isFinite(Number(sup.ht_score.away))
        ? { home: Number(sup.ht_score.home), away: Number(sup.ht_score.away) }
        : null;

      // Update Ledger items & Parlay legs
      ledger = ledger.map((item: any) => {
        if (areSameMatch(dummyMatch, item)) {
          updatedLedgerCount++;
          item.review = item.review || {};
          item.review.final_score = scoreObj;
          if (htScoreObj) item.review.ht_score = htScoreObj;
          item.review.status = 'reviewed';
          item.score_verified = sup.score_verified === true;
          item.score_source = sup.score_source || 'user_batch_verification';
        }

        if (item.parlay_legs && Array.isArray(item.parlay_legs)) {
          let legHit = false;
          item.parlay_legs = item.parlay_legs.map((leg: any) => {
            if (areSameMatch(dummyMatch, { match: leg.match, ybty_home: leg.ybty_home, ybty_away: leg.ybty_away })) {
              legHit = true;
              return {
                ...leg,
                final_score: scoreObj,
                ht_score: htScoreObj || leg.ht_score,
                score_verified: sup.score_verified === true,
              };
            }
            return leg;
          });
          if (legHit) updatedLedgerCount++;
        }

        return item;
      });

      // Update Live Decisions
      if (liveFile.decisions && Array.isArray(liveFile.decisions)) {
        liveFile.decisions = liveFile.decisions.map((d: any) => {
          if (areSameMatch(dummyMatch, d)) {
            updatedDecisionsCount++;
            return {
              ...d,
              score: scoreObj,
              ht_score: htScoreObj || d.ht_score,
              score_verified: sup.score_verified === true,
              score_source: sup.score_source || 'user_batch_verification',
              risks: sup.score_verified === true ? (d.risks || []).filter((r: string) => !r.includes('比分未经校验')) : (d.risks || []),
            };
          }
          return d;
        });
      }

      // Update Prematch Decisions
      if (prematchFile.decisions && Array.isArray(prematchFile.decisions)) {
        prematchFile.decisions = prematchFile.decisions.map((d: any) => {
          if (areSameMatch(dummyMatch, d)) {
            updatedDecisionsCount++;
            return {
              ...d,
              score: scoreObj,
              ht_score: htScoreObj || d.ht_score,
              score_verified: sup.score_verified === true,
              score_source: sup.score_source || 'user_batch_verification',
              risks: sup.score_verified === true ? (d.risks || []).filter((r: string) => !r.includes('比分未经校验')) : (d.risks || []),
            };
          }
          return d;
        });
      }
    }

    requireJsonWrites([
      ['output/recommendation_ledger.json', ledger],
      ['output/ybty_leisu_decisions.json', liveFile],
      ['output/ybty_leisu_prematch_decisions.json', prematchFile],
    ]);

    res.json({
      success: true,
      updatedLedgerCount,
      updatedDecisionsCount,
      ledger,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete selected items or clear all ledger items
app.post('/api/ledger/delete', (req, res) => {
  try {
    const { ids, clearAll } = req.body;
    let ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);

    if (clearAll) {
      ledger = [];
    } else if (Array.isArray(ids) && ids.length > 0) {
      const idSet = new Set(ids);
      ledger = ledger.filter((i: any) => !idSet.has(i.id));
    }

    requireJsonWrites([['output/recommendation_ledger.json', ledger]]);
    res.json({ success: true, ledger });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Backtest Report & Formal Results
app.get('/api/backtest', (req, res) => {
  let reportText = '';
  try {
    const reportPath = path.join(process.cwd(), 'output/BACKTEST_REPORT_2026-07-29.md');
    if (fs.existsSync(reportPath)) {
      reportText = fs.readFileSync(reportPath, 'utf-8');
    }
  } catch (err) {
    console.warn('Could not read backtest report file', err);
  }

  const formalResults = readJsonFile('output/formal_results_2026-07-29.json', {});

  res.json({
    report: reportText,
    formal_results: formalResults,
  });
});

// Team Aliases Synchronizer: Refresh decisions JSON files whenever aliases change
function syncDecisionsWithAliases() {
  try {
    const manual = readJsonFile<Record<string, string[]>>('team_aliases.json', {});
    const auto = readJsonFile<Record<string, string[]>>('team_aliases_auto.json', {});

    const lookupMap = new Map<string, string>();
    const processDict = (dict: Record<string, string[]>) => {
      for (const [canonical, list] of Object.entries(dict)) {
        const normCanonical = normalizeTeamName(canonical);
        if (normCanonical) lookupMap.set(normCanonical, canonical);
        if (Array.isArray(list)) {
          for (const alias of list) {
            const normAlias = normalizeTeamName(alias);
            if (normAlias) {
              lookupMap.set(normAlias, canonical);
            }
          }
        }
      }
    };

    processDict(manual);
    processDict(auto);

    const resolveLeisuName = (ybtyName: string, existingLeisuName?: string) => {
      if (existingLeisuName && existingLeisuName !== '未匹配' && existingLeisuName !== ybtyName && existingLeisuName !== '未匹配雷速') {
        return existingLeisuName;
      }
      if (!ybtyName) return existingLeisuName || '';
      const norm = normalizeTeamName(ybtyName);
      if (lookupMap.has(norm)) {
        return lookupMap.get(norm)!;
      }
      return existingLeisuName || ybtyName;
    };

    // 1. Live decisions
    const liveFile = readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [], summary: {} });
    let liveChanged = false;
    if (Array.isArray(liveFile.decisions)) {
      liveFile.decisions.forEach((d: any) => {
        const home = d.ybty_home || (d.match ? d.match.split(' vs ')[0] : '');
        const away = d.ybty_away || (d.match ? d.match.split(' vs ')[1] : '');
        const newLeisuHome = resolveLeisuName(home, d.leisu_home);
        const newLeisuAway = resolveLeisuName(away, d.leisu_away);
        if (newLeisuHome !== d.leisu_home || newLeisuAway !== d.leisu_away) {
          d.leisu_home = newLeisuHome;
          d.leisu_away = newLeisuAway;
          liveChanged = true;
        }
      });
      if (liveChanged) {
        requireJsonWrites([['output/ybty_leisu_decisions.json', liveFile]]);
      }
    }

    // 2. Prematch decisions
    const prematchFile = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });
    let prematchChanged = false;
    const prematchCollections = [prematchFile.decisions, prematchFile.research_queue].filter(Array.isArray);
    if (prematchCollections.length > 0) {
      prematchCollections.flat().forEach((d: any) => {
        const home = d.ybty_home || (d.match ? d.match.split(' vs ')[0] : '');
        const away = d.ybty_away || (d.match ? d.match.split(' vs ')[1] : '');
        const newLeisuHome = resolveLeisuName(home, d.leisu_home);
        const newLeisuAway = resolveLeisuName(away, d.leisu_away);
        if (newLeisuHome !== d.leisu_home || newLeisuAway !== d.leisu_away) {
          d.leisu_home = newLeisuHome;
          d.leisu_away = newLeisuAway;
          prematchChanged = true;
        }
      });
      if (prematchChanged) {
        requireJsonWrites([['output/ybty_leisu_prematch_decisions.json', prematchFile]]);
      }
    }
  } catch (e) {
    console.error('Error in syncDecisionsWithAliases:', e);
  }
}

// Perform immediate initial sync on boot
syncDecisionsWithAliases();

// Team Aliases
app.get('/api/aliases', (req, res) => {
  const manual = readJsonFile('team_aliases.json', {});
  const auto = readJsonFile('team_aliases_auto.json', {});
  res.json({ manual, auto });
});

app.post('/api/aliases', (req, res) => {
  const { canonical_name, alias } = req.body;
  if (!canonical_name || !alias) {
    return res.status(400).json({ error: 'canonical_name and alias are required' });
  }

  const manual = readJsonFile<Record<string, string[]>>('team_aliases.json', {});
  
  // Persist only canonical -> aliases. Reverse lookup is built in memory.
  // A provider alias may belong to only one canonical team.
  const removed_from: string[] = [];
  for (const [existingCanonical, aliases] of Object.entries(manual)) {
    if (existingCanonical === canonical_name || !Array.isArray(aliases)) continue;
    const filtered = aliases.filter((value) => value !== alias);
    if (filtered.length !== aliases.length) {
      manual[existingCanonical] = filtered;
      removed_from.push(existingCanonical);
    }
  }
  // Remove symmetric records created by older versions of this endpoint.
  if (alias !== canonical_name && Array.isArray(manual[alias])) {
    manual[alias] = manual[alias].filter((value) => value !== canonical_name);
    if (manual[alias].length === 0) delete manual[alias];
  }

  if (!manual[canonical_name]) manual[canonical_name] = [];
  if (!manual[canonical_name].includes(alias)) {
    manual[canonical_name].push(alias);
  }

  requireJsonWrites([['team_aliases.json', manual]]);
  const suppressed = readJsonFile<string[]>('team_aliases_suppressed.json', []);
  const canonicalNorm = normalizeTeamName(canonical_name);
  const nextSuppressed = suppressed.filter((value) => normalizeTeamName(value) !== canonicalNorm);
  if (nextSuppressed.length !== suppressed.length) requireJsonWrites([['team_aliases_suppressed.json', nextSuppressed]]);

  // 立即驱动全局决策重发刷盘
  syncDecisionsWithAliases();

  res.json({ success: true, aliases: manual, removed_from });
});

app.put('/api/aliases', (req, res) => {
  try {
    const oldCanonical = String(req.body?.old_canonical_name || '').trim();
    const newCanonical = String(req.body?.canonical_name || '').trim();
    const aliases: string[] = Array.from(new Set<string>((Array.isArray(req.body?.aliases) ? req.body.aliases : [])
      .map((value: unknown) => String(value || '').trim())
      .filter((value: string) => value && value !== newCanonical)));
    if (!oldCanonical || !newCanonical) return res.status(400).json({ error: '原标准队名和新标准队名不能为空。' });

    const manual = readJsonFile<Record<string, string[]>>('team_aliases.json', {});
    const auto = readJsonFile<Record<string, string[]>>('team_aliases_auto.json', {});
    if (!(oldCanonical in manual) && !(oldCanonical in auto)) return res.status(404).json({ error: '要修改的球队映射不存在。' });
    const occupiedCanonical = Array.from(new Set([...Object.keys(manual), ...Object.keys(auto)]))
      .find((canonical) => canonical !== oldCanonical && normalizeTeamName(canonical) === normalizeTeamName(newCanonical));
    if (occupiedCanonical) return res.status(409).json({ error: `标准队名“${newCanonical}”与已有“${occupiedCanonical}”重复，请先处理已有映射。` });

    const conflicts: string[] = [];
    for (const alias of aliases) {
      const aliasNorm = normalizeTeamName(alias);
      const canonicalConflict = Array.from(new Set([...Object.keys(manual), ...Object.keys(auto)]))
        .find((canonical) => canonical !== oldCanonical && canonical !== newCanonical && normalizeTeamName(canonical) === aliasNorm);
      if (canonicalConflict) conflicts.push(`${alias} → 标准名 ${canonicalConflict}`);
      for (const [canonical, values] of [...Object.entries(manual), ...Object.entries(auto)]) {
        if (canonical !== oldCanonical && canonical !== newCanonical && Array.isArray(values) && values.some((value) => normalizeTeamName(value) === aliasNorm)) conflicts.push(`${alias} → ${canonical}`);
      }
    }
    if (conflicts.length > 0) return res.status(409).json({ error: '以下别名已被其他球队占用，未保存。', conflicts: Array.from(new Set(conflicts)) });

    const existingAuto = Array.isArray(auto[oldCanonical]) ? auto[oldCanonical] : [];
    if (newCanonical !== oldCanonical) {
      delete manual[oldCanonical];
      delete auto[oldCanonical];
    }
    manual[newCanonical] = aliases;
    if (existingAuto.length > 0) auto[newCanonical] = existingAuto;

    requireJsonWrites([
      ['team_aliases.json', manual],
      ['team_aliases_auto.json', auto],
    ]);
    const suppressed = readJsonFile<string[]>('team_aliases_suppressed.json', []);
    const newCanonicalNorm = normalizeTeamName(newCanonical);
    const nextSuppressed = suppressed.filter((value) => normalizeTeamName(value) !== newCanonicalNorm);
    if (nextSuppressed.length !== suppressed.length) requireJsonWrites([['team_aliases_suppressed.json', nextSuppressed]]);

    if (newCanonical !== oldCanonical) {
      const renameInFile = (filePath: string) => {
        const file = readJsonFile<any>(filePath, { decisions: [], research_queue: [] });
        let changed = false;
        for (const collection of [file.decisions, file.research_queue].filter(Array.isArray)) {
          for (const item of collection) {
            if (item.leisu_home === oldCanonical) { item.leisu_home = newCanonical; changed = true; }
            if (item.leisu_away === oldCanonical) { item.leisu_away = newCanonical; changed = true; }
          }
        }
        if (changed) requireJsonWrites([[filePath, file]]);
      };
      renameInFile('output/ybty_leisu_decisions.json');
      renameInFile('output/ybty_leisu_prematch_decisions.json');
    }
    syncDecisionsWithAliases();
    res.json({ success: true, canonical_name: newCanonical, aliases, automatic_aliases: existingAuto });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '球队名称修改失败' });
  }
});

app.delete('/api/aliases', (req, res) => {
  try {
    const canonical = String(req.body?.canonical_name || '').trim();
    if (!canonical) return res.status(400).json({ error: 'canonical_name 不能为空。' });
    const manual = readJsonFile<Record<string, string[]>>('team_aliases.json', {});
    const auto = readJsonFile<Record<string, string[]>>('team_aliases_auto.json', {});
    if (!(canonical in manual) && !(canonical in auto)) return res.status(404).json({ error: '球队映射不存在或已被删除。' });
    const removedManual = manual[canonical] || [];
    const removedAuto = auto[canonical] || [];
    delete manual[canonical];
    delete auto[canonical];
    const suppressed = readJsonFile<string[]>('team_aliases_suppressed.json', []);
    if (!suppressed.some((value) => normalizeTeamName(value) === normalizeTeamName(canonical))) suppressed.push(canonical);
    requireJsonWrites([
      ['team_aliases.json', manual],
      ['team_aliases_auto.json', auto],
      ['team_aliases_suppressed.json', suppressed],
    ]);
    syncDecisionsWithAliases();
    res.json({ success: true, canonical_name: canonical, removed_aliases: [...removedManual, ...removedAuto] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '删除球队映射失败' });
  }
});

function exportFileInfo(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);
  return {
    file_name: path.basename(filePath),
    original_path: filePath,
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function resolveSnapshotPath(status: any, field: string, fallback: string, warnings: string[]): string {
  const recorded = status?.[field];
  if (recorded && fs.existsSync(recorded)) return recorded;
  if (recorded) warnings.push(`状态文件记录的 ${field} 不存在，已使用 latest 回退文件`);
  const fallbackPath = path.join(process.cwd(), fallback);
  if (!fs.existsSync(fallbackPath)) throw new Error(`Missing export source: ${fallback}`);
  return fallbackPath;
}

function auditExportCount(name: string, data: any, arrayField: string) {
  const rows = data?.[arrayField];
  const actual = Array.isArray(rows) ? rows.length : null;
  const declared = data?.count;
  return {
    name,
    declared_count: declared ?? null,
    actual_count: actual,
    valid: actual !== null && (declared === undefined || declared === actual),
  };
}

// Export the exact snapshots recorded by the pipeline, with provenance and completeness audits.
app.get('/api/export-combined', (req, res) => {
  try {
    const mode = req.query.type === 'prematch' ? 'prematch' : 'live';
    const isPrematch = mode === 'prematch';
    const warnings: string[] = [];
    const statusFile = isPrematch ? 'output/prematch_pipeline_status.json' : 'output/pipeline_status.json';
    const candidatesFile = isPrematch ? 'output/ybty_leisu_prematch_candidates.json' : 'output/ybty_leisu_candidates.json';
    const decisionsFile = isPrematch ? 'output/ybty_leisu_prematch_decisions.json' : 'output/ybty_leisu_decisions.json';
    const statusPath = path.join(process.cwd(), statusFile);
    if (!fs.existsSync(statusPath)) throw new Error(`Missing export source: ${statusFile}`);
    const status = readJsonFile<any>(statusFile, {});
    const ybtyPath = resolveSnapshotPath(status, 'ybty_file', isPrematch ? 'output/ybty_prematch_latest.json' : 'output/ybty_latest.json', warnings);
    const leisuPath = resolveSnapshotPath(status, 'leisu_file', isPrematch ? 'output/leisu_prematch_latest.json' : 'output/leisu_latest.json', warnings);
    const paths: Record<string, string> = {
      ybty: ybtyPath,
      leisu: leisuPath,
      candidates: path.join(process.cwd(), candidatesFile),
      decisions: path.join(process.cwd(), decisionsFile),
      pipeline_status: statusPath,
    };
    if (isPrematch) paths.ai_brief = path.join(process.cwd(), 'output/prematch_ai_brief.json');
    for (const [name, filePath] of Object.entries(paths)) {
      if (!fs.existsSync(filePath)) throw new Error(`Missing export source ${name}: ${filePath}`);
    }

    const data: Record<string, any> = {};
    for (const [name, filePath] of Object.entries(paths)) data[name] = readJsonFile(filePath, null);
    const audits = [
      auditExportCount('YBTY赛事', data.ybty, 'matches'),
      auditExportCount('雷速赛事', data.leisu, 'events'),
    ];
    if (!audits.every((audit) => audit.valid)) warnings.push('原始文件声明数量与实际数组数量不一致');
    const unmatched = Array.isArray(data.candidates?.unmatched_markets) ? data.candidates.unmatched_markets : [];
    const summary = data.candidates?.summary || {};
    if ((summary.unmatched ?? unmatched.length) !== unmatched.length) warnings.push('未匹配数量与未匹配明细不一致');
    if (status.candidate_file && path.basename(status.candidate_file) !== path.basename(paths.candidates)) warnings.push('状态文件记录的候选文件名与当前候选文件不同');
    if (status.decision_file && path.basename(status.decision_file) !== path.basename(paths.decisions)) warnings.push('状态文件记录的决策文件名与当前决策文件不同');

    const bundle = {
      schema_version: '1.0',
      bundle_type: mode,
      export_profile: 'complete_analysis',
      generated_at: new Date().toISOString(),
      complete: warnings.length === 0,
      completeness: {
        raw_ybty_included: true,
        raw_leisu_included: true,
        matched_candidates_included: true,
        unmatched_markets_included: true,
        decisions_included: true,
        pipeline_status_included: true,
        ai_brief_included: isPrematch,
        audits,
        warnings,
      },
      source_files: Object.fromEntries(Object.entries(paths).map(([name, filePath]) => [name, exportFileInfo(filePath)])),
      summary: {
        ...summary,
        ybty_raw_count: audits[0].actual_count,
        leisu_raw_count: audits[1].actual_count,
        unmatched_detail_count: unmatched.length,
      },
      data,
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=ybty_leisu_${mode}_combined.json`);
    return res.send(JSON.stringify(bundle, null, 2));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Combined export failed' });
  }
});

// Helper function to format any Date to Beijing Standard Time (UTC+8)
function formatToBeijingTimeStr(dateObj: Date): string {
  // Force UTC+8 Beijing Time conversion
  const bjMs = dateObj.getTime() + 8 * 60 * 60 * 1000;
  const bjDate = new Date(bjMs);
  const y = bjDate.getUTCFullYear();
  const m = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(bjDate.getUTCDate()).padStart(2, '0');
  const hh = String(bjDate.getUTCHours()).padStart(2, '0');
  const mm = String(bjDate.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

// Helper function to calculate exact Beijing time from YBTY countdown (e.g. "25分钟后开赛") and captured_at timestamp
function calculateExactBeijingTime(item: any): string {
  if (item.start_time_beijing) return item.start_time_beijing;
  if (item.ybty_start_time_beijing) return item.ybty_start_time_beijing;
  if (item.beijing_time) return item.beijing_time;

  // Extract base captured_at / export_time timestamp
  const rawBaseTime = item.captured_at || item.export_time || item.capturedAt;
  const exportTime = rawBaseTime ? new Date(rawBaseTime) : new Date();
  const validBase = isNaN(exportTime.getTime()) ? new Date() : exportTime;

  let mins: number | null = null;

  if (item.mins_until_start !== undefined && !isNaN(Number(item.mins_until_start))) {
    mins = Number(item.mins_until_start);
  } else {
    // Check YBTY specific countdown ("25分钟后开赛"), commence_time, start_time, etc.
    const rawTimeStr = String(
      item.countdown ||
      item.commence_time ||
      item.start_time ||
      item.ybty_start_time ||
      item.time_str ||
      item.relative_time ||
      item.time ||
      item.开赛时间 ||
      ''
    ).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(rawTimeStr)) {
      return rawTimeStr;
    }

    const matchMins = rawTimeStr.match(/(\d+)\s*(?:分钟|min|mins|分)/i);
    const matchHours = rawTimeStr.match(/(\d+(?:\.\d+)?)\s*(?:小时|h|hr|hrs)/i);

    if (matchMins) {
      mins = parseFloat(matchMins[1]);
    } else if (matchHours) {
      mins = parseFloat(matchHours[1]) * 60;
    } else {
      const parsedNum = parseFloat(rawTimeStr);
      if (!isNaN(parsedNum)) {
        mins = parsedNum;
      }
    }
  }

  if (mins !== null) {
    const targetDate = new Date(validBase.getTime() + mins * 60 * 1000);
    const bjFormatted = formatToBeijingTimeStr(targetDate);
    return `${bjFormatted} (推算时间)`;
  }

  return '推算时间';
}

function normalizeTeamName(name: string): string {
  if (!name) return '';
  let str = String(name).trim();
  if (str === '[object Object]') return '';
  str = str.replace(/\(女\)|女足|（女）|Women/gi, '女足');
  str = str.replace(/\(中\)|（中）|\[中\]/g, '');
  str = str.replace(/\(主\)|（主）|\[主\]/g, '');
  str = str.replace(/U20/gi, 'u20').replace(/U21/gi, 'u21').replace(/U23/gi, 'u23').replace(/U19/gi, 'u19');
  str = str.replace(/[·\.\-\_\s\(\)（）]/g, '');
  return str.toLowerCase();
}

// Batch CSV/JSON Data Supplement & Match Update Endpoint
app.post('/api/batch-supplement', (req, res) => {
  try {
    const { items, mode: importMode = 'overwrite' } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for batch update' });
    }

    const manualAliases = readJsonFile<Record<string, string[]>>('team_aliases.json', {});
    const autoAliases = readJsonFile<Record<string, string[]>>('team_aliases_auto.json', {});

    const aliasesMap = new Map<string, string>();
    const registerDict = (dict: Record<string, string[]>) => {
      for (const [canon, list] of Object.entries(dict)) {
        const normCanon = normalizeTeamName(canon);
        if (normCanon) aliasesMap.set(normCanon, canon);
        if (Array.isArray(list)) {
          for (const a of list) {
            const normA = normalizeTeamName(a);
            if (normA) aliasesMap.set(normA, canon);
          }
        }
      }
    };
    registerDict(manualAliases);
    registerDict(autoAliases);

    let aliasUpdated = false;

    const matchTeamNames = (teamA: string, teamB: string): boolean => {
      if (!teamA || !teamB) return false;
      const normA = normalizeTeamName(teamA);
      const normB = normalizeTeamName(teamB);
      if (!normA || !normB) return false;
      if (normA === normB) return true;
      const canonA = aliasesMap.get(normA) || normA;
      const canonB = aliasesMap.get(normB) || normB;
      if (canonA === canonB) return true;
      if (normA.length >= 3 && normB.length >= 3 && (normA.includes(normB) || normB.includes(normA))) {
        return true;
      }
      return false;
    };

    const liveFile = readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [], summary: {} });
    const prematchFile = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });

    let liveUpdatedCount = 0;
    let prematchUpdatedCount = 0;

    let liveDecisions = importMode === 'overwrite' ? [] : (liveFile.decisions || []);
    let prematchDecisions = importMode === 'overwrite' ? [] : (prematchFile.decisions || []);

    for (const item of items) {
      const homeTeam = item.ybty_home || item.home || item.homeTeam?.name || item.home_team || item.host || '';
      const awayTeam = item.ybty_away || item.away || item.awayTeam?.name || item.away_team || item.guest || '';
      
      let leisuHome = item.leisu_home || item.leisu_home_team || item.matched_leisu_home || item.matched_leisu?.leisu_home || item.candidate?.match?.home || item.match_info?.leisu_home || item.leisu_raw?.home || '';
      let leisuAway = item.leisu_away || item.leisu_away_team || item.matched_leisu_away || item.matched_leisu?.leisu_away || item.candidate?.match?.away || item.match_info?.leisu_away || item.leisu_raw?.away || '';
      
      const rawMatch = item.match || `${homeTeam} vs ${awayTeam}`.trim();
      const matchName = rawMatch === 'vs' || !rawMatch ? '未知赛事' : rawMatch;

      if ((!leisuHome || !leisuAway) && item.leisu_match && typeof item.leisu_match === 'string') {
        const lParts = item.leisu_match.split(/\s+vs\s+/i);
        if (lParts.length >= 2) {
          if (!leisuHome) leisuHome = lParts[0].replace(/^\[.*?\]\s*/, '').trim();
          if (!leisuAway) leisuAway = lParts[1].trim();
        }
      }

      // Alias dictionaries are canonical -> aliases. Leisu is the canonical
      // display name for cross-provider matching; writing the reverse direction
      // creates cycles and lets YBTY names overwrite Leisu raw names.
      if (homeTeam && leisuHome && homeTeam !== leisuHome) {
        if (!manualAliases[leisuHome]) manualAliases[leisuHome] = [];
        if (!manualAliases[leisuHome].includes(homeTeam)) {
          manualAliases[leisuHome].push(homeTeam);
          aliasUpdated = true;
        }
      }
      if (awayTeam && leisuAway && awayTeam !== leisuAway) {
        if (!manualAliases[leisuAway]) manualAliases[leisuAway] = [];
        if (!manualAliases[leisuAway].includes(awayTeam)) {
          manualAliases[leisuAway].push(awayTeam);
          aliasUpdated = true;
        }
      }

      const calculatedBeijingTime = calculateExactBeijingTime({
        ...item,
        start_time: item.countdown || item.commence_time || item.start_time || item.ybty_start_time || item.clock_status,
      });

      // The parser's explicit mode decision is authoritative. Prematch records
      // can carry provider minute/score fields from a contaminated reference
      // export; those fields must not silently turn the imported match live.
      const hasExplicitLiveFlag = typeof item.is_live === 'boolean';
      const declaredImportMode = String(item.export_mode || '').toLowerCase();
      const isLive = declaredImportMode === 'prematch'
        ? false
        : declaredImportMode === 'live'
          ? true
          : hasExplicitLiveFlag
            ? item.is_live === true
            : item.source_type === 'live' || Boolean(item.minute && item.minute > 0);

      let matchedInLive = false;
      let matchedInPrematch = false;

      if (importMode !== 'overwrite') {
        // Check in existing live decisions
        liveDecisions.forEach((d: any, idx: number) => {
          const homeMatches = matchTeamNames(d.ybty_home || d.match?.split(' vs ')[0] || '', homeTeam);
          const awayMatches = matchTeamNames(d.ybty_away || d.match?.split(' vs ')[1] || '', awayTeam);
          const nameMatches = d.match && matchName && d.match === matchName;

          if (nameMatches || (homeMatches && awayMatches) || (homeMatches && !awayTeam) || (awayMatches && !homeTeam)) {
            matchedInLive = true;
            let hScore = d.score?.home ?? 0;
            let aScore = d.score?.away ?? 0;

            if (item.home_score !== undefined && item.away_score !== undefined) {
              hScore = Number(item.home_score) || 0;
              aScore = Number(item.away_score) || 0;
            } else if (item.homeScore?.current !== undefined && item.awayScore?.current !== undefined) {
              hScore = Number(item.homeScore.current) || 0;
              aScore = Number(item.awayScore.current) || 0;
            } else if (item.score) {
              if (typeof item.score === 'object') {
                hScore = item.score.home ?? hScore;
                aScore = item.score.away ?? aScore;
              } else if (typeof item.score === 'string' && item.score.includes('-')) {
                const parts = item.score.split('-').map(Number);
                if (!isNaN(parts[0])) hScore = parts[0];
                if (!isNaN(parts[1])) aScore = parts[1];
              }
            }

            liveDecisions[idx] = {
              ...d,
              ybty_raw_markets: normalizeYbtyMarketTypes(item.ybty_raw_markets || item.markets || d.ybty_raw_markets),
              live_statistics: item.live_statistics || d.live_statistics || null,
              reference_odds: item.reference_odds || d.reference_odds || null,
              recent_trends: item.recent_trends || d.recent_trends || null,
              incidents: item.incidents || d.incidents || [],
              weather: item.weather || d.weather || null,
              lineups: item.lineups || d.lineups || null,
              player_candidates: item.player_candidates || d.player_candidates || [],
              live_text: item.live_text || d.live_text || null,
              detail_context: item.detail_context || d.detail_context || null,
              leisu_home: leisuHome || d.leisu_home || '',
              leisu_away: leisuAway || d.leisu_away || '',
              score: { home: hScore, away: aScore },
              score_verified: item.score_verified === true,
              score_source: item.score_source || 'batch_file_supplement',
              commence_time: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.commence_time || d.ybty_start_time_beijing || calculatedBeijingTime),
              ybty_start_time_beijing: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.ybty_start_time_beijing || calculatedBeijingTime),
              provider_start_time: item.provider_start_time || d.provider_start_time || null,
              status: d.status === 'PASS' ? 'WATCH' : d.status,
              grade: d.grade === 'C' || !d.grade ? 'B' : d.grade,
              recommendation: (() => {
                const market = item.market || item.recommendation?.market;
                const line = item.line ?? item.recommendation?.line;
                const odds = Number(item.odds ?? item.recommendation?.odds);
                return market && line !== undefined && line !== '' && Number.isFinite(odds) && odds > 1
                  ? { market, line, odds }
                  : d.recommendation || null;
              })(),
              risks: (d.risks || []).filter((r: string) => !r.includes('盘口水位缺失') && (item.score_verified !== true || !r.includes('比分未经校验')) && !r.includes('开赛时间缺失')),
              evidence: Array.from(new Set([...(d.evidence || []), `[数据补充/刷盘] 水位盘口与时间已补全 (${calculatedBeijingTime})`])),
            };
            liveUpdatedCount++;
          }
        });

        // Check in existing prematch decisions
        prematchDecisions.forEach((d: any, idx: number) => {
          const homeMatches = matchTeamNames(d.ybty_home || d.match?.split(' vs ')[0] || '', homeTeam);
          const awayMatches = matchTeamNames(d.ybty_away || d.match?.split(' vs ')[1] || '', awayTeam);
          const nameMatches = d.match && matchName && d.match === matchName;

          if (nameMatches || (homeMatches && awayMatches) || (homeMatches && !awayTeam) || (awayMatches && !homeTeam)) {
            matchedInPrematch = true;
            let hScore = d.score?.home ?? 0;
            let aScore = d.score?.away ?? 0;

            if (item.score) {
              if (typeof item.score === 'object') {
                hScore = item.score.home ?? 0;
                aScore = item.score.away ?? 0;
              } else if (typeof item.score === 'string' && item.score.includes('-')) {
                const parts = item.score.split('-').map(Number);
                if (!isNaN(parts[0])) hScore = parts[0];
                if (!isNaN(parts[1])) aScore = parts[1];
              }
            }

            prematchDecisions[idx] = {
              ...d,
              ybty_raw_markets: normalizeYbtyMarketTypes(item.ybty_raw_markets || item.markets || d.ybty_raw_markets),
              live_statistics: item.live_statistics || d.live_statistics || null,
              reference_odds: item.reference_odds || d.reference_odds || null,
              recent_trends: item.recent_trends || d.recent_trends || null,
              incidents: item.incidents || d.incidents || [],
              weather: item.weather || d.weather || null,
              lineups: item.lineups || d.lineups || null,
              player_candidates: item.player_candidates || d.player_candidates || [],
              live_text: item.live_text || d.live_text || null,
              detail_context: item.detail_context || d.detail_context || null,
              leisu_home: leisuHome || d.leisu_home || '',
              leisu_away: leisuAway || d.leisu_away || '',
              score: { home: hScore, away: aScore },
              score_verified: item.score_verified === true,
              score_source: item.score_source || 'batch_file_supplement',
              commence_time: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.commence_time || d.ybty_start_time_beijing || calculatedBeijingTime),
              ybty_start_time_beijing: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.ybty_start_time_beijing || calculatedBeijingTime),
              provider_start_time: item.provider_start_time || d.provider_start_time || null,
              status: d.status === 'PASS' ? 'WATCH' : d.status,
              grade: d.grade === 'C' || !d.grade ? 'B' : d.grade,
              recommendation: (() => {
                const market = item.market || item.recommendation?.market;
                const line = item.line ?? item.recommendation?.line;
                const odds = Number(item.odds ?? item.recommendation?.odds);
                return market && line !== undefined && line !== '' && Number.isFinite(odds) && odds > 1
                  ? { market, line, odds }
                  : d.recommendation || null;
              })(),
              risks: (d.risks || []).filter((r: string) => !r.includes('盘口水位缺失') && (item.score_verified !== true || !r.includes('比分未经校验')) && !r.includes('开赛时间缺失')),
              evidence: Array.from(new Set([...(d.evidence || []), `[数据补充/刷盘] 水位盘口与时间已补全 (${calculatedBeijingTime})`])),
            };
            prematchUpdatedCount++;
          }
        });
      }

      // If item was not matched or in overwrite mode, append new Decision record
      if (!matchedInLive && !matchedInPrematch) {
        let hScore = 0;
        let aScore = 0;
        if (item.score) {
          if (typeof item.score === 'object') {
            hScore = item.score.home ?? 0;
            aScore = item.score.away ?? 0;
          } else if (typeof item.score === 'string' && item.score.includes('-')) {
            const parts = item.score.split('-').map(Number);
            if (!isNaN(parts[0])) hScore = parts[0];
            if (!isNaN(parts[1])) aScore = parts[1];
          }
        }

        const newRecord = {
          match: matchName,
          ybty_home: homeTeam || (matchName.includes(' vs ') ? matchName.split(' vs ')[0] : matchName),
          ybty_away: awayTeam || (matchName.includes(' vs ') ? matchName.split(' vs ')[1] : ''),
          leisu_home: leisuHome || '',
          leisu_away: leisuAway || '',
          status: 'WATCH',
          grade: 'B',
          minute: item.minute || 0,
          score: { home: hScore, away: aScore },
          score_verified: item.score_verified === true,
          score_source: item.score_source || 'import_file',
          commence_time: calculatedBeijingTime,
          ybty_start_time_beijing: calculatedBeijingTime,
          provider_start_time: item.provider_start_time || null,
          recommendation: (() => {
            const market = item.market || item.recommendation?.market;
            const line = item.line ?? item.recommendation?.line;
            const odds = Number(item.odds ?? item.recommendation?.odds);
            return market && line !== undefined && line !== '' && Number.isFinite(odds) && odds > 1
              ? { market, line, odds }
              : null;
          })(),
          evidence: [`[最新导入] 数据来源: ${item.source_type || '整合导入'}，已计算准确开赛与已进行时间`],
          risks: [],
          ybty_raw_markets: normalizeYbtyMarketTypes(item.ybty_raw_markets || item.markets),
          live_statistics: item.live_statistics || null,
          reference_odds: item.reference_odds || null,
          recent_trends: item.recent_trends || null,
          incidents: item.incidents || [],
          weather: item.weather || null,
          lineups: item.lineups || null,
          player_candidates: item.player_candidates || [],
          live_text: item.live_text || null,
          detail_context: item.detail_context || null,
        };

        if (isLive) {
          liveDecisions.push(newRecord);
          liveUpdatedCount++;
        } else {
          prematchDecisions.push(newRecord);
          prematchUpdatedCount++;
        }
      }
    }

    // Save live decisions
    liveFile.decisions = liveDecisions;
    liveFile.summary = {
      total: liveDecisions.length,
      a_grade: liveDecisions.filter((d: any) => d.grade === 'A').length,
      b_grade: liveDecisions.filter((d: any) => d.grade === 'B').length,
      watch: liveDecisions.filter((d: any) => d.status === 'WATCH').length,
      updated_at: new Date().toISOString(),
    };
    // Save prematch decisions
    prematchFile.decisions = prematchDecisions;
    prematchFile.summary = {
      total: prematchDecisions.length,
      a_grade: prematchDecisions.filter((d: any) => d.grade === 'A').length,
      b_grade: prematchDecisions.filter((d: any) => d.grade === 'B').length,
      watch: prematchDecisions.filter((d: any) => d.status === 'WATCH').length,
      updated_at: new Date().toISOString(),
    };
    // Also update pipeline status files
    const liveStatus = readJsonFile<any>('output/pipeline_status.json', {});
    liveStatus.last_updated = new Date().toISOString();
    liveStatus.total_matches = liveDecisions.length;
    const prematchStatus = readJsonFile<any>('output/prematch_pipeline_status.json', {});
    prematchStatus.last_updated = new Date().toISOString();
    prematchStatus.total_matches = prematchDecisions.length;
    // Persist the whole import in one transaction. Previously each file was
    // serialized/copied/renamed separately and the alias synchronizer then read
    // and sometimes rewrote the same large decision files a second time.
    const writes: Array<[string, any]> = [
      ['output/ybty_leisu_decisions.json', liveFile],
      ['output/ybty_leisu_prematch_decisions.json', prematchFile],
      ['output/pipeline_status.json', liveStatus],
      ['output/prematch_pipeline_status.json', prematchStatus],
    ];
    if (aliasUpdated) writes.push(['team_aliases.json', manualAliases]);
    requireJsonWrites(writes);

    res.json({
      success: true,
      import_mode: importMode,
      live_count: liveDecisions.length,
      prematch_count: prematchDecisions.length,
      total_updated: liveDecisions.length + prematchDecisions.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear Analysis Library Matches Endpoint (Resets live & prematch analysis databases without affecting recommendation ledger)
app.post('/api/clear-outdated-matches', (req, res) => {
  try {
    const { target, clear_mode, match_names } = req.body || {}; // target: live|prematch|all; clear_mode: selected|all
    if (!['live', 'prematch', 'all'].includes(String(target))) {
      return res.status(400).json({ error: '必须明确指定清空目标：live、prematch 或 all。' });
    }
    if (!['selected', 'all'].includes(String(clear_mode))) {
      return res.status(400).json({ error: '必须明确指定 clear_mode：selected 或 all；系统禁止根据空名单自动执行全量清空。' });
    }
    const selective = clear_mode === 'selected';
    const selectedNames = new Set((Array.isArray(match_names) ? match_names : []).map((name: unknown) => String(name || '').trim()).filter(Boolean));
    if (selective && selectedNames.size === 0) {
      return res.status(400).json({ error: '清空所选被拒绝：没有收到任何有效比赛名称，不会执行全量清空。' });
    }

    let clearedLiveCount = 0;
    let clearedPrematchCount = 0;

    if (target === 'live' || target === 'all') {
      const liveFile = readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [], summary: {} });
      const liveDecisions = Array.isArray(liveFile.decisions) ? liveFile.decisions : [];
      clearedLiveCount = selective ? liveDecisions.filter((item: any) => selectedNames.has(String(item?.match || '').trim())).length : liveDecisions.length;
      liveFile.decisions = selective ? liveDecisions.filter((item: any) => !selectedNames.has(String(item?.match || '').trim())) : [];
      liveFile.single_best = null;
      liveFile.parlay_5x = null;
      liveFile.summary = {
        total: liveFile.decisions.length,
        a_grade: liveFile.decisions.filter((item: any) => item.grade === 'A').length,
        b_grade: liveFile.decisions.filter((item: any) => item.grade === 'B').length,
        watch: liveFile.decisions.filter((item: any) => item.status === 'WATCH').length,
        updated_at: new Date().toISOString(),
      };

      const liveCandidates = readJsonFile<any>('output/ybty_leisu_candidates.json', { candidates: [] });
      const liveCandidatesList = Array.isArray(liveCandidates.candidates) ? liveCandidates.candidates : [];
      liveCandidates.candidates = selective ? liveCandidatesList.filter((item: any) => !selectedNames.has(String(item?.match || '').trim())) : [];
      liveCandidates.summary = { total: liveCandidates.candidates.length, updated_at: new Date().toISOString() };

      const writes: [string, any][] = [
        ['output/ybty_leisu_decisions.json', liveFile],
        ['output/ybty_leisu_candidates.json', liveCandidates],
      ];

      if (!selective) {
        const ybtyLatest = readJsonFile<any>('output/ybty_latest.json', { matches: [] });
        ybtyLatest.matches = [];
        const leisuLatest = readJsonFile<any>('output/leisu_latest.json', { matches: [] });
        leisuLatest.matches = [];
        writes.push(['output/ybty_latest.json', ybtyLatest], ['output/leisu_latest.json', leisuLatest]);
      }

      const liveStatus = readJsonFile<any>('output/pipeline_status.json', {});
      liveStatus.last_updated = new Date().toISOString();
      liveStatus.total_matches = liveFile.decisions.length;
      writes.push(['output/pipeline_status.json', liveStatus]);

      requireJsonWrites(writes);
    }

    if (target === 'prematch' || target === 'all') {
      const prematchFile = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });
      const prematchDecisionsCount = Array.isArray(prematchFile.decisions) ? prematchFile.decisions.length : 0;
      const prematchResearchCount = Array.isArray(prematchFile.research_queue) ? prematchFile.research_queue.length : 0;
      const prematchDecisions = Array.isArray(prematchFile.decisions) ? prematchFile.decisions : [];
      const prematchResearch = Array.isArray(prematchFile.research_queue) ? prematchFile.research_queue : [];
      clearedPrematchCount = selective
        ? prematchDecisions.filter((item: any) => selectedNames.has(String(item?.match || '').trim())).length + prematchResearch.filter((item: any) => selectedNames.has(String(item?.match || '').trim())).length
        : prematchDecisionsCount + prematchResearchCount;
      prematchFile.decisions = selective ? prematchDecisions.filter((item: any) => !selectedNames.has(String(item?.match || '').trim())) : [];
      prematchFile.research_queue = selective ? prematchResearch.filter((item: any) => !selectedNames.has(String(item?.match || '').trim())) : [];
      prematchFile.single_best = null;
      prematchFile.parlay_5x = null;
      const remainingPrematch = [...prematchFile.decisions, ...prematchFile.research_queue];
      prematchFile.summary = {
        total: remainingPrematch.length,
        assessed: remainingPrematch.length,
        a_grade: remainingPrematch.filter((item: any) => item.grade === 'A').length,
        b_grade: remainingPrematch.filter((item: any) => item.grade === 'B').length,
        c_grade: remainingPrematch.filter((item: any) => item.grade === 'C').length,
        watch: remainingPrematch.filter((item: any) => item.status === 'WATCH').length,
        research: prematchFile.research_queue.length,
        pass: remainingPrematch.filter((item: any) => item.status === 'PASS').length,
        updated_at: new Date().toISOString(),
      };

      const prematchCandidates = readJsonFile<any>('output/ybty_leisu_prematch_candidates.json', {});
      prematchCandidates.candidates = selective ? (prematchCandidates.candidates || []).filter((item: any) => !selectedNames.has(String(item?.match || '').trim())) : [];
      prematchCandidates.live_events = selective ? (prematchCandidates.live_events || []).filter((item: any) => !selectedNames.has(String(item?.match || '').trim())) : [];
      if (!selective) prematchCandidates.unmatched_markets = [];
      prematchCandidates.summary = { ...(prematchCandidates.summary || {}), total: prematchCandidates.candidates.length };

      const prematchBrief = readJsonFile<any>('output/prematch_ai_brief.json', {});
      prematchBrief.candidates = selective ? (prematchBrief.candidates || []).filter((item: any) => !selectedNames.has(String(item?.match || '').trim())) : [];
      prematchBrief.highlights = selective ? (prematchBrief.highlights || []).filter((item: any) => !selectedNames.has(String(item?.match || '').trim())) : [];
      prematchBrief.summary = selective ? `已从非滚球分析库移除 ${clearedPrematchCount} 场所选比赛。` : '非滚球分析库已清空，等待下一次分析。';

      const prematchStatus = readJsonFile<any>('output/prematch_pipeline_status.json', {});
      prematchStatus.last_updated = new Date().toISOString();
      prematchStatus.total_matches = remainingPrematch.length;
      if (!selective) {
        prematchStatus.market_events = 0;
        prematchStatus.prematch_events = 0;
        prematchStatus.matched = 0;
        prematchStatus.unmatched = 0;
      }
      prematchStatus.research = prematchFile.research_queue.length;
      prematchStatus.pass = remainingPrematch.filter((item: any) => item.status === 'PASS').length;

      const prematchWrites: [string, any][] = [
        ['output/ybty_leisu_prematch_decisions.json', prematchFile],
        ['output/ybty_leisu_prematch_candidates.json', prematchCandidates],
        ['output/prematch_ai_brief.json', prematchBrief],
        ['output/prematch_pipeline_status.json', prematchStatus],
      ];

      if (!selective) {
        const ybtyPrematchLatest = readJsonFile<any>('output/ybty_prematch_latest.json', { matches: [] });
        ybtyPrematchLatest.matches = [];
        const leisuPrematchLatest = readJsonFile<any>('output/leisu_prematch_latest.json', { matches: [] });
        leisuPrematchLatest.matches = [];
        prematchWrites.push(['output/ybty_prematch_latest.json', ybtyPrematchLatest], ['output/leisu_prematch_latest.json', leisuPrematchLatest]);
      }

      requireJsonWrites(prematchWrites);
    }

    res.json({
      success: true,
      cleared_live: clearedLiveCount,
      cleared_prematch: clearedPrematchCount,
      total_cleared: clearedLiveCount + clearedPrematchCount,
      selective,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to compress and clean match evaluation data for Prompt generation
function compressMatchDataForPrompt(item: any, mode: string) {
  const normalizedRaw = normalizeYbtyMarketTypes(item.ybty_raw_markets || []);

  // 1. 精简已核验的 YBTY 盘口：去除 suspended, side_verified, line_index 等冗余位，只保留可投注的有效赔率
  const verifiedMarkets = normalizedRaw
    .filter((market: any) => /^(full|half)_(h2h|spread|total)$/.test(String(market?.market || '')) && market?.market_type_verified !== false)
    .map((market: any) => ({
      market: market.market,
      options: (Array.isArray(market.options) ? market.options : [])
        .filter((opt: any) => opt?.suspended !== true && Number.isFinite(Number(opt?.odds)) && Number(opt.odds) > 1)
        .map((opt: any) => ({
          side: opt.side || null,
          line: opt.line ?? opt.selection ?? null,
          odds: Number(opt.odds),
        })),
    }))
    .filter((m: any) => m.options.length > 0);

  // 2. 战绩近况 (recent_trends) 深度去噪：彻底剔除爬虫残余 canvas_values 和 DOM raw text
  let cleanedRecentTrends: any = null;
  if (item.recent_trends?.historical_analysis?.recent_form) {
    cleanedRecentTrends = {
      recent_form: item.recent_trends.historical_analysis.recent_form.map((form: any) => ({
        team: form.team || form.label,
        scope: form.scope,
        tables: (Array.isArray(form.tables) ? form.tables : []).map((t: any) => ({
          rows: (Array.isArray(t.rows) ? t.rows : []).slice(0, 11).map((r: any) => r.cells || r),
        })),
      })),
      standings: item.recent_trends.historical_analysis.league_standings?.tables || null,
    };
  } else if (item.recent_trends) {
    const { canvas_values, text, ...rest } = item.recent_trends;
    cleanedRecentTrends = rest;
  }

  // 3. 阵容 (lineups) 深度精简：提取为极简的名字字符串数组，剔除坐标和三合一重复嵌套
  let cleanedLineups: any = null;
  if (item.lineups) {
    const extractNames = (arr: any[]) => Array.isArray(arr) ? arr.map((p: any) => p?.name || p).filter(Boolean) : [];
    const homeStarters = extractNames(item.lineups.home_starters || item.lineups.home?.starters || item.lineups.home_starter_details);
    const awayStarters = extractNames(item.lineups.away_starters || item.lineups.away?.starters || item.lineups.away_starter_details);
    const homeSubs = extractNames(item.lineups.home_substitutes || item.lineups.home?.substitutes);
    const awaySubs = extractNames(item.lineups.away_substitutes || item.lineups.away?.substitutes);

    if (homeStarters.length > 0 || awayStarters.length > 0) {
      cleanedLineups = {
        home_starters: homeStarters,
        away_starters: awayStarters,
        home_substitutes: homeSubs,
        away_substitutes: awaySubs,
      };
    } else {
      cleanedLineups = { status: item.lineups.status || 'squad_only_no_confirmed_match_lineup' };
    }
  }

  // 4. 参考赔率 (reference_odds) 提炼
  let cleanedRefOdds: any = null;
  if (item.reference_odds) {
    const rows = item.reference_odds.normalized_rows
      || item.reference_odds.detail_page?.panels?.flatMap((p: any) => p?.normalized_rows || [])
      || [];
    if (rows.length > 0) {
      cleanedRefOdds = {
        source: item.reference_odds.source || 'leisu_odd_panel',
        rows: rows.slice(0, 6),
      };
    }
  }

  // 5. 天气与事件提炼
  const weatherText = Array.isArray(item.weather?.text) ? item.weather.text : item.weather;

  return {
    match: item.match || `${item.ybty_home || ''} vs ${item.ybty_away || ''}`,
    league: item.league || item.ybty_league || item.leisu_league || '',
    ybty_home: item.ybty_home || '',
    ybty_away: item.ybty_away || '',
    start_time_beijing: item.ybty_start_time_beijing || item.provider_start_time || '',
    minute: Number(item.minute || 0),
    score: item.score || null,
    score_verified: mode === 'prematch_eval' ? true : item.score_verified === true,
    score_source: mode === 'prematch_eval' ? 'prematch_not_applicable' : item.score_source || 'unverified',
    current_recommendation: item.recommendation || null,
    verified_ybty_markets: verifiedMarkets,
    unverified_market_count: Math.max(0, normalizedRaw.length - verifiedMarkets.length),
    reference_odds: cleanedRefOdds,
    live_statistics: item.live_statistics && Object.keys(item.live_statistics).length > 0 ? item.live_statistics : null,
    recent_trends: cleanedRecentTrends,
    incidents: Array.isArray(item.incidents) && item.incidents.length > 0 ? item.incidents.slice(0, 10) : [],
    weather: weatherText,
    lineups: cleanedLineups,
    live_text: Array.isArray(item.live_text?.entries) ? item.live_text.entries.slice(0, 10) : (Array.isArray(item.live_text) ? item.live_text.slice(0, 10) : null),
    data_availability: {
      realtime_score: Boolean(item.score),
      score_verified: mode === 'prematch_eval' ? true : item.score_verified === true,
      statistics: Boolean(item.live_statistics && Object.keys(item.live_statistics).length > 0),
      lineups: Boolean(cleanedLineups && cleanedLineups.home_starters?.length > 0),
      recent_records: Boolean(cleanedRecentTrends),
    },
  };
}

// Helper to sanitize market assessment fields (direction, line, options formatting)
function sanitizeMarketAssessment(item: any) {
  if (!item) return item;
  let category = String(item.category || '').trim();
  let direction = String(item.direction || '').trim();
  let line = item.line != null && item.line !== '' && item.line !== 'null' ? String(item.line).trim() : null;

  // 1. Remove deduplicated words e.g. "2.5/3 2.5/3" or "Home -0/0.5 -0/0.5"
  direction = direction.replace(/(\S+)\s+\1/g, '$1');

  // 2. Normalize english words to standard Chinese
  if (/^(home|home\s*主|home\s*胜)$/i.test(direction) || (direction.toLowerCase().startsWith('home') && !direction.includes('主'))) {
    direction = category.includes('让球') ? '主队' : '主胜';
  } else if (/^(away|away\s*客|away\s*胜)$/i.test(direction) || (direction.toLowerCase().startsWith('away') && !direction.includes('客'))) {
    direction = category.includes('让球') ? '客队' : '客胜';
  } else if (/^(draw|draw\s*平)$/i.test(direction)) {
    direction = '平局';
  } else if (/^over\b/i.test(direction)) {
    direction = direction.replace(/^over\s*/i, '大球 ').trim();
  } else if (/^under\b/i.test(direction)) {
    direction = direction.replace(/^under\s*/i, '小球 ').trim();
  }

  // 3. Remove line duplication in direction if line exists
  if (line) {
    if (direction.includes(line)) {
      direction = direction.replace(line, '').trim();
      if (!direction) {
        if (category.includes('大小球')) direction = '大球';
        else if (category.includes('让球')) direction = '主队';
        else direction = category;
      }
    }
  }

  direction = direction.replace(/\s+/g, ' ').trim();

  return {
    ...item,
    direction: direction || '暂无方向',
    line,
  };
}

// Helper function to assemble evaluation prompts for API or Manual Export
function buildPromptData(body: any, isExportPrompt: boolean = false) {
  const { match_name, ybty_home, ybty_away, minute, score, odds_info, mode, selected_match_refs, parlay_requests, batch_matches, batch_match_refs } = body || {};

  let rulesContent = '';
  try {
    const instructionsPath = path.join(process.cwd(), 'CUSTOM_INSTRUCTIONS_COMPLETE.md');
    if (fs.existsSync(instructionsPath)) {
      rulesContent = fs.readFileSync(instructionsPath, 'utf-8');
    }
  } catch (e) {
    console.warn('Rules file missing or unreadable', e);
  }

  const currentLedgerFeedback = readJsonFile<any[]>('output/recommendation_ledger.json', []);
  const archivedLedgerFeedback = readJsonFile<any[]>('output/recommendation_ledger_archives.json', []);
  const feedbackById = new Map<string, any>();
  [...currentLedgerFeedback, ...archivedLedgerFeedback.flatMap((archive: any) => Array.isArray(archive?.items) ? archive.items : [])]
    .forEach((item: any) => feedbackById.set(String(item?.id || `${item?.match}|${item?.created_at}`), item));
  const historicalFeedback = Array.from(feedbackById.values())
    .filter((item: any) => item?.review?.final_score || (Array.isArray(item?.parlay_legs) && item.parlay_legs.some((leg: any) => leg?.final_score)))
    .sort((a: any, b: any) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))
    .slice(0, 20)
    .map((item: any) => ({
      match: item.match,
      grade: item.grade,
      recommendation: item.recommendation,
      final_score: item.review?.final_score || null,
      ht_score: item.review?.ht_score || null,
      is_parlay: item.is_parlay === true,
      parlay_legs: Array.isArray(item.parlay_legs) ? item.parlay_legs.map((leg: any) => ({ match: leg.match, market: leg.market, line: leg.line, odds: leg.odds, final_score: leg.final_score || null })) : [],
      record_type: item.record_type,
    }));

  const rulesSummary = `【核心硬性规则摘要】
1. 只有 verified_ybty_markets 中的盘口才能 recommend/watch 并引用赔率；不得猜测未核验盘口。
2. 有赔率时必须计算隐含概率(100/odds)；模型概率≤隐含概率时 status=avoid, grade=NO_BET。
3. 赛前无 score_verified 限制；赛前 score_verified=true 仅表示规则不适用，不得因此降级。
4. 每个玩法独立研究；必须覆盖全12类玩法，每类各返回一项。
5. 波胆/双方进球/单双/进球数/进球时间段使用 status=prediction, odds=null，给出方向概率。
6. grade A/B/C 全部展示；没有合格正式主选时 recommendation=null。
7. 必须引用本场实际数据（statistics/incidents/lineups/recent_trends/reference_odds）说明理由，不得只凭赔率判断。
8. 串关：同一方向 B 级最多进一组串关；A 级≥85分且阵容明确时最多两组。
9. 杯赛/友谊赛/强弱悬殊在阵容未确认前最高 C 级，不进正式串关。`;

  if (mode === 'parlay_check') {
    const refs = Array.isArray(selected_match_refs) ? selected_match_refs : [];
    const requests = Array.isArray(parlay_requests)
      ? parlay_requests.filter((item: any) => Number(item?.size) >= 2 && Number(item?.count) >= 1)
      : [];
    if (refs.length < 2 || requests.length === 0 || requests.some((item: any) => Number(item.size) > refs.length)) {
      throw new Error('串关生成参数无效：至少选择两场比赛，且串关长度不能超过已选比赛数。');
    }

    const live = readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [] });
    const prematch = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], research_queue: [] });
    const storedMatches = [
      ...(Array.isArray(live.decisions) ? live.decisions : []),
      ...(Array.isArray(prematch.decisions) ? prematch.decisions : []),
      ...(Array.isArray(prematch.research_queue) ? prematch.research_queue : []),
    ];
    const history = readJsonFile<any[]>('output/ai_evaluation_history.json', []);
    const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[\s_-]/g, '');
    const findLatestAssessment = (ref: any) => {
      for (const snapshot of history) {
        const results = Array.isArray(snapshot?.result?.matches) ? snapshot.result.matches : [snapshot?.result];
        const found = results.find((item: any) => item && (
          normalize(item.match) === normalize(ref.match)
          || (normalize(item.ybty_home) === normalize(ref.ybty_home) && normalize(item.ybty_away) === normalize(ref.ybty_away))
        ));
        if (found) return found;
      }
      return null;
    };
    const parlayCandidates = refs.map((ref: any) => {
      const stored = storedMatches.find((item: any) => normalize(item.match) === normalize(ref.match))
        || storedMatches.find((item: any) => normalize(item.ybty_home) === normalize(ref.ybty_home) && normalize(item.ybty_away) === normalize(ref.ybty_away));
      return stored ? { ...stored, ai_evaluation: findLatestAssessment(ref) } : null;
    }).filter(Boolean);

    if (parlayCandidates.length !== refs.length) {
      throw new Error('部分所选比赛已不在当前系统比赛池中，请刷新后重新选择。');
    }

    const candidatesInfoText = parlayCandidates.map((c: any, idx: number) => {
      const home = c.ybty_home || (c.match ? c.match.split('vs')[0]?.trim() : '主队');
      const away = c.ybty_away || (c.match ? c.match.split('vs')[1]?.trim() : '客队');
      const scHome = c.score?.home ?? 0;
      const scAway = c.score?.away ?? 0;
      const minStr = c.minute ? `${c.minute}'` : '赛前';
      const grade = c.grade || 'B';
      const marketPool = Array.isArray(c.ai_evaluation?.market_assessments)
        ? c.ai_evaluation.market_assessments.filter((item: any) => Number(item?.odds) > 1 && item?.line !== null && item?.line !== '' && ['recommend', 'watch'].includes(String(item?.status)))
        : [];
      return `比赛 #${idx + 1}: ${JSON.stringify({ match: c.match || (home + ' vs ' + away), ybty_home: home, ybty_away: away, score: `${scHome}-${scAway}`, minute: minStr, grade, system_recommendation: c.recommendation, ybty_markets: c.ybty_markets, ybty_raw_markets: c.ybty_raw_markets, ai_market_assessments: marketPool })}`;
    }).join('\n');

    const prompt = `你是顶尖、严肃且专业的足球投注评估与精选推荐 AI，严格遵循项目的足球分析与硬性风控协议：

---【核心结算与盘口规则】---
1. 全场大小球 (Full Time Over/Under)：只看完场终场时的双方总进球数 vs 盘口！
2. 滚球让球盘 (Live Asian Handicap / 后续时段让球)：结算基准从下注瞬间归零 (0:0) 重新计算！
3. 四分之一盘口：拆分为赢半、输半、走盘，禁止粗暴判全赢或全输。

---【串关风控规则】---
1. 同一比赛可以在不同串关中采用不同玩法，但每个玩法必须分别达到B级以上。
2. 普通B级同一方向最多进入1组正式串关；A级且模型评分≥85的同一方向最多2组。

请求模式: parlay_check
---【用户选择的比赛池（${parlayCandidates.length} 场）】---
${candidatesInfoText || '无比赛数据'}
---【用户要求生成的串关规格】---
${JSON.stringify(parlay_requests || [])}
---【历史台账反馈】---
${JSON.stringify(historicalFeedback)}

---【串关 Legs 字段命名规范（极其重要）】---
1. market 必须填写中文标准玩法名称，例如 "全场大小球", "全场让球", "全场独赢1X2", "半场大小球", "半场让球"。严禁输出 full_total, full_spread, full_h2h 等英文键名！
2. line 必须明确注明的投注方向与盘口值：
   - 大小球：必须包含“大”或“小”，例如 "大 3.5"、"小 2.5"；
   - 让球盘：必须写明主队或客队名称及盘口，例如 "维京 -0.5"、"邓迪FC 0"、"霍布罗 +0/0.5"；
   - 独赢盘：必须写明 "主胜"、"客胜" 或 "平局"（如 "维京胜"）。

请从每场的 system_recommendation、ai_market_assessments 与 YBTY 真实盘口中选择胜率较高且赔率合理的方向，按要求生成串关。输出严格的 JSON 结构：
{
  "summary": "本次多规格串关生成总结",
  "grade": "A | B | C",
  "recommendation": {
    "market": "串关组合核对结论",
    "line": "N/A",
    "odds": 1.85,
    "best_timing_tip": "串关下注建议"
  },
  "score_verified": false,
  "score_source": "ybty_market",
  "verification_passed": true,
  "evidence": ["串关安全点1"],
  "risks": ["串关风险拦截项1"],
  "timing_strategy": "串关资金策略",
  "parlay_safety_check": {
    "is_valid_parlay": true,
    "allow_max_parlay_tickets": 1,
    "reasons": ["分析说明"]
  },
  "parlay_recommendations": [{"size": 3, "ticket_index": 1, "grade": "A|B|C", "estimated_total_odds": 5.67, "reason": "选单理由", "legs": [{"match":"比赛名","ybty_home":"主队","ybty_away":"客队","market":"真实玩法","line":"真实盘口","odds":1.88,"probability":65,"grade":"A|B|C"}]}]
}`;

    return {
      mode: 'parlay_check',
      prompts: [prompt],
      match_count: parlayCandidates.length,
      evaluationData: [],
      parlayCandidates,
    };
  }

  // Non-parlay mode
  let requestedMatches: any[];
  if (Array.isArray(batch_match_refs) && batch_match_refs.length > 0) {
    const decisionFile = mode === 'prematch_eval'
      ? readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], research_queue: [] })
      : readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [] });
    const storedMatches = [
      ...(Array.isArray(decisionFile.decisions) ? decisionFile.decisions : []),
      ...(Array.isArray(decisionFile.research_queue) ? decisionFile.research_queue : []),
    ];
    const candidateFile = mode === 'prematch_eval'
      ? readJsonFile<any>('output/ybty_leisu_prematch_candidates.json', { candidates: [] })
      : readJsonFile<any>('output/ybty_leisu_candidates.json', { candidates: [] });
    const ybtySnapshot = mode === 'prematch_eval'
      ? readJsonFile<any>('output/ybty_prematch_latest.json', { matches: [] })
      : readJsonFile<any>('output/ybty_latest.json', { matches: [] });
    const leisuSnapshot = mode === 'prematch_eval'
      ? readJsonFile<any>('output/leisu_prematch_latest.json', { events: [] })
      : readJsonFile<any>('output/leisu_latest.json', { events: [] });
    const sameTeams = (homeA: unknown, awayA: unknown, homeB: unknown, awayB: unknown) =>
      cleanTeamName(homeA) === cleanTeamName(homeB) && cleanTeamName(awayA) === cleanTeamName(awayB);
    const hydrateStoredMatch = (found: any) => {
      const candidateWrapper = (Array.isArray(candidateFile.candidates) ? candidateFile.candidates : []).find((entry: any) =>
        entry?.match === found.match
        || sameTeams(entry?.candidate?.home, entry?.candidate?.away, found.ybty_home, found.ybty_away)
        || sameTeams(entry?.ybty_home, entry?.ybty_away, found.ybty_home, found.ybty_away));
      const candidateDetails = candidateWrapper ? {
        live_statistics: candidateWrapper.live_statistics,
        reference_odds: candidateWrapper.reference_odds,
        recent_trends: candidateWrapper.recent_trends,
        incidents: candidateWrapper.incidents,
        weather: candidateWrapper.weather,
        lineups: candidateWrapper.lineups,
        player_candidates: candidateWrapper.player_candidates,
        live_text: candidateWrapper.live_text,
        detail_context: candidateWrapper.detail_context,
      } : {};
      const rawYbty = (Array.isArray(ybtySnapshot.matches) ? ybtySnapshot.matches : []).find((entry: any) =>
        sameTeams(entry.home, entry.away, found.ybty_home, found.ybty_away));
      const rawLeisu = (Array.isArray(leisuSnapshot.events) ? leisuSnapshot.events : []).find((entry: any) =>
        sameTeams(entry?.homeTeam?.name || entry?.home, entry?.awayTeam?.name || entry?.away, found.leisu_home, found.leisu_away));
      const rawDetails = rawLeisu ? {
        live_statistics: rawLeisu._statistics || rawLeisu.live_statistics,
        incidents: rawLeisu._incidents || rawLeisu.incidents,
        weather: rawLeisu._weather || rawLeisu.weather,
        live_text: rawLeisu._live_text || rawLeisu.live_text,
        detail_context: rawLeisu._detail_context || rawLeisu.detail_context,
      } : {};
      const mergeMissing = (base: any, supplement: any) => {
        const merged = { ...base };
        for (const [key, value] of Object.entries(supplement || {})) {
          const current = merged[key];
          const currentEmpty = current == null
            || (Array.isArray(current) && current.length === 0)
            || (typeof current === 'object' && !Array.isArray(current) && Object.keys(current).length === 0);
          if (currentEmpty && value != null) merged[key] = value;
        }
        return merged;
      };
      let hydrated = mergeMissing(found, candidateDetails);
      hydrated = mergeMissing(hydrated, rawDetails);
      if ((!Array.isArray(hydrated.ybty_raw_markets) || hydrated.ybty_raw_markets.length === 0) && Array.isArray(rawYbty?.markets)) {
        hydrated.ybty_raw_markets = rawYbty.markets;
      }
      return hydrated;
    };
    const unresolved: string[] = [];
    requestedMatches = batch_match_refs.map((ref: any) => {
      const exact = storedMatches.find((item: any) => item.match === ref.match);
      const byTeams = storedMatches.find((item: any) =>
        cleanTeamName(item.ybty_home) === cleanTeamName(ref.ybty_home) &&
        cleanTeamName(item.ybty_away) === cleanTeamName(ref.ybty_away)
      );
      const found = exact || byTeams;
      if (!found) unresolved.push(ref.match || `${ref.ybty_home} vs ${ref.ybty_away}`);
      return found ? hydrateStoredMatch(found) : found;
    }).filter(Boolean);
    if (unresolved.length > 0) {
      throw new Error(`部分比赛已不在当前分析批次中，请刷新页面后重新选择：${unresolved.join('、')}`);
    }
  } else {
    requestedMatches = Array.isArray(batch_matches) && batch_matches.length > 0
      ? batch_matches
      : [{ match: match_name, ybty_home, ybty_away, minute, score, odds_info }];
  }

  const evaluationData = requestedMatches.map((item: any) => compressMatchDataForPrompt(item, mode));

  const CHUNK_SIZE = isExportPrompt ? 15 : (mode === 'prematch_eval' ? 3 : 4);
  const chunks: any[][] = [];
  for (let i = 0; i < evaluationData.length; i += CHUNK_SIZE) {
    chunks.push(evaluationData.slice(i, i + CHUNK_SIZE));
  }

  const prompts = chunks.map((chunkData, index) => {
    return `你是足球投注研究审核员。请按照项目协议，对以下 ${chunkData.length} 场比赛（第 ${index + 1}/${chunks.length} 批，共 ${evaluationData.length} 场）逐场进行全玩法评估。
评估模式：${mode === 'prematch_eval' ? '赛前评估。赛前没有滚球比分核验要求，不得因为 score_verified 字段降级；score_verified=true 在此仅表示该规则不适用。' : '滚球评估。只有滚球才执行 score_verified 核验和未核验缺省限制。'}

【必须覆盖且各返回一项的12类玩法】
全场大小球、半场大小球、全场让球、半场让球、全场独赢1X2、波胆、双方是否进球、总进球单双、主队进球数、客队进球数、总进球数、进球时间段。

【 direction (方向) 与 line (盘口) 填写硬性规定】：
- direction: 必须使用规范直观的中文描述，禁止在 direction 里重复出现盘口数字或 "home 主" 等格式！
  • 让球: 只能填 "主队" 或 "客队" (盘口数字写入 line，如 "-0.5/1")；
  • 大小球: 只能填 "大球" 或 "小球" (盘口数字写入 line，如 "2.5/3")；
  • 独赢1X2: 只能填 "主胜"、"平局" 或 "客胜" (line 填 null)；
  • 双方进球: 只能填 "是" 或 "否" (line 填 null)；
  • 单双: 只能填 "单" 或 "双" (line 填 null)；
  • 其它预测类: 用直观中文表示方向，如 "3球及以上"、"16-30分钟"、"2-1"。
- line: 仅填纯盘口数值 (如 "-0.5/1", "2.5/3")，无盘口数值则填 null。严禁在 direction 字段里包含盘口数值！

${rulesSummary}

严格返回 JSON：
{"summary":"批量总览","matches":[{"match":"原比赛名","ybty_home":"YBTY主队","ybty_away":"YBTY客队","summary":"本场结论","grade":"A|B|C","score_verified":false,"score_source":"来源","verification_passed":false,"recommendation":null,"market_assessments":[{"category":"上述12类之一","market":"真实市场名或模型预测","direction":"规范中文方向","line":null,"odds":null,"probability":65,"probability_scope":"该概率对应的明确方向","alternatives":[{"direction":"次选","probability":20}],"grade":"A|B|C|NO_BET","status":"recommend|watch|prediction|avoid|unavailable","reason":"必须引用本场实际数据说明"}],"evidence":["依据"],"risks":["风险"]}]}

比赛数据 (${chunkData.length} 场)：
${JSON.stringify(chunkData)}`;
  });

  return {
    mode,
    prompts,
    match_count: evaluationData.length,
    evaluationData,
  };
}

// Export Prompt Endpoint for Manual Feeding to Web Gemini
app.post('/api/ai/export-prompt', (req, res) => {
  try {
    const promptData = buildPromptData(req.body, true);
    const combinedPrompt = promptData.prompts.join('\n\n==================== [ 如果分批，下一批 Prompt 见下方 ] ====================\n\n');
    res.json({
      success: true,
      mode: promptData.mode,
      match_count: promptData.match_count,
      prompt_count: promptData.prompts.length,
      prompts: promptData.prompts,
      combined_prompt: combinedPrompt,
      instructions: '请复制上方 Prompt 文本，直接发送给网页版 Google Gemini (gemini.google.com)。Gemini 输出回答后，将其生成的 JSON 内容复制，点击系统中的“导入 Gemini 评估结果”进行解析与保存。',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '导出 Prompt 失败' });
  }
});

// Import Manual Web Gemini Output Endpoint
app.post('/api/ai/import-evaluation', (req, res) => {
  try {
    const { raw_text, mode = 'live_eval' } = req.body || {};
    if (!raw_text || typeof raw_text !== 'string' || !raw_text.trim()) {
      return res.status(400).json({ error: '请粘贴网页版 Gemini 输出的文本/JSON 结果。' });
    }

    let parsed = parseModelJson(raw_text);
    parsed.ai_provider = 'gemini_manual_web_import';

    // Post-process matches if present
    if (Array.isArray(parsed.matches) && parsed.matches.length > 0) {
      const requiredCategoriesV2 = ['全场大小球', '半场大小球', '全场让球', '半场让球', '全场独赢1X2', '波胆', '双方是否进球', '总进球单双', '主队进球数', '客队进球数', '总进球数', '进球时间段'];
      parsed.matches = parsed.matches.map((matchResult: any) => {
        const assessments = Array.isArray(matchResult.market_assessments) ? matchResult.market_assessments : [];
        const byCategory = new Map(assessments.map((item: any) => [String(item.category || ''), item]));
        return {
          ...matchResult,
          score_verified: mode === 'prematch_eval' ? true : matchResult.score_verified === true,
          score_source: mode === 'prematch_eval' ? 'prematch_not_applicable' : (matchResult.score_source || 'unverified'),
          market_assessments: requiredCategoriesV2.map((category) => {
            const rawAssessment = byCategory.get(category) || {
              category,
              market: category,
              direction: '暂无可靠方向',
              line: null,
              odds: null,
              probability: null,
              grade: 'NO_BET',
              status: 'unavailable',
              reason: 'AI未返回该玩法的可靠评估，已由系统按数据不足处理。',
            };
            return sanitizeMarketAssessment(rawAssessment);
          }),
        };
      });
    }

    if (Array.isArray(parsed.parlay_recommendations)) {
      parsed.parlay_recommendations = parsed.parlay_recommendations.map((ticket: any) => ({
        ...ticket,
        legs: Array.isArray(ticket.legs) ? ticket.legs.map((leg: any) => sanitizeParlayLeg(leg)) : [],
      }));
    }

    // Auto-save snapshot into ai_evaluation_history.json
    const history = readJsonFile<any[]>('output/ai_evaluation_history.json', []);
    const snapshotId = `web_gemini_${Date.now()}`;
    const snapshot = {
      id: snapshotId,
      mode,
      scope: Array.isArray(parsed.matches) ? 'batch' : 'single',
      evaluated_matches: Array.isArray(parsed.matches)
        ? parsed.matches.map((item: any) => item.match || `${item.ybty_home || ''} vs ${item.ybty_away || ''}`)
        : [parsed.match || '网页版导入评估'],
      saved_at: new Date().toISOString(),
      result: parsed,
    };
    history.unshift(snapshot);
    requireJsonWrites([['output/ai_evaluation_history.json', history]]);

    res.json({
      success: true,
      snapshot_id: snapshotId,
      result: parsed,
      message: '网页版 Gemini 评估结果解析并导入成功！已自动保存至评估历史中。',
    });
  } catch (err: any) {
    res.status(400).json({ error: `无法解析导入文本为有效的 JSON 格式：${err.message || '结构不符合标准'}` });
  }
});

// Server-side AI Evaluation using Google Gemini API
app.post('/api/ai/evaluate', async (req, res) => {
  try {
    const geminiApiKeys = Array.from(new Set([
      ...(process.env.GEMINI_API_KEYS || '').split(/[;,\r\n]+/),
      process.env.GEMINI_API_KEY || '',
    ].map((key) => key.trim()).filter(Boolean)));

    if (geminiApiKeys.length === 0) {
      return res.status(400).json({
        error: '未配置 Google Gemini API Key。',
        instructions: '请在 .env 文件中配置 GEMINI_API_KEY，或直接使用【导出 Prompt 发送给网页版 Gemini】功能自由分析！',
      });
    }

    const promptData = buildPromptData(req.body);
    const { mode, parlayCandidates, evaluationData } = promptData;

    const runGemini = async (contents: string): Promise<string> => {
      if (geminiApiKeys.length === 0) throw Object.assign(new Error('未配置 Gemini API Key。'), { provider: 'gemini', status: 400 });
      const maxCycles = 5;
      let lastError: any;
      for (let cycle = 0; cycle < maxCycles; cycle += 1) {
        const now = Date.now();
        const availableIndexes = geminiApiKeys
          .map((_, idx) => (geminiKeyCursor + idx) % geminiApiKeys.length)
          .filter((idx) => (geminiKeyCooldowns.get(geminiApiKeys[idx]) || 0) <= now);

        if (availableIndexes.length === 0) {
          const earliestExpiry = Math.min(...geminiApiKeys.map((k) => geminiKeyCooldowns.get(k) || 0));
          const waitMs = Math.max(1000, earliestExpiry - now);
          console.warn(`[AI Evaluation] 所有 Gemini Key 均处于 429 冷却中，自动等待 ${Math.round(waitMs / 1000)}s (轮次 ${cycle + 1}/${maxCycles})...`);
          await waitForRetry(waitMs);
          continue;
        }

        for (const keyIndex of availableIndexes) {
          const activeKey = geminiApiKeys[keyIndex];
          const ai = new GoogleGenAI({ apiKey: activeKey });
          await waitForGeminiRateSlot(activeKey, 3500);
          try {
            const response = await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents,
              config: { responseMimeType: 'application/json' },
            });
            geminiKeyCursor = (keyIndex + 1) % geminiApiKeys.length;
            return response.text || '{}';
          } catch (sdkError: any) {
            lastError = sdkError;
            if (isGeminiNetworkFailure(sdkError)) {
              try {
                console.warn(`[AI Evaluation] Key #${keyIndex + 1}: SDK 网络异常，尝试 Windows 网络后备方案。`);
                await waitForGeminiRateSlot(activeKey, 3500);
                const text = await generateGeminiViaWindowsNetwork(activeKey, contents);
                geminiKeyCursor = (keyIndex + 1) % geminiApiKeys.length;
                return text;
              } catch (fallbackError: any) {
                lastError = fallbackError;
              }
            }
            const status = geminiHttpStatus(lastError);
            const isQuotaError = status === 429 || String(lastError?.message || '').includes('RESOURCE_EXHAUSTED');
            if (isQuotaError) {
              const cooldownMs = parseGeminiRetryDelay(lastError);
              geminiKeyCooldowns.set(activeKey, Date.now() + cooldownMs);
              console.warn(`[AI Evaluation] Gemini Key #${keyIndex + 1}/${geminiApiKeys.length} 触发 429 限额，进入 ${Math.round(cooldownMs / 1000)}s 冷却，自动切换 Key...`);
              continue;
            }
            if (!isRetryableGeminiFailure(lastError)) throw lastError;
            break;
          }
        }
        await waitForRetry(3000);
      }
      throw lastError;
    };

    const runAI = async (contents: string): Promise<string> => {
      return await runGemini(contents);
    };

    if (mode !== 'parlay_check') {
      const maxConcurrency = Math.max(1, geminiApiKeys.length);
      console.log(`[AI Evaluation] 批量评估共有 ${promptData.match_count} 场比赛，切分为 ${promptData.prompts.length} 组 Prompt...`);

      const chunkResults = new Array<{ summary?: string; matches?: any[]; error?: string }>(promptData.prompts.length);
      let nextChunkIdx = 0;
      const workers = Array.from({ length: Math.min(maxConcurrency, promptData.prompts.length) }, async () => {
        while (nextChunkIdx < promptData.prompts.length) {
          const chunkIdx = nextChunkIdx++;
          const batchPromptV2 = promptData.prompts[chunkIdx];

          try {
            const batchText = await runAI(batchPromptV2);
            const parsed = parseModelJson(batchText);
            chunkResults[chunkIdx] = {
              summary: parsed.summary,
              matches: Array.isArray(parsed.matches) ? parsed.matches : [],
            };
          } catch (chunkErr: any) {
            chunkResults[chunkIdx] = { error: `第 ${chunkIdx + 1} 组评估失败：${chunkErr.message || chunkErr}` };
          }
        }
      });
      await Promise.all(workers);

      const failedChunk = chunkResults.find((res) => res.error);
      if (failedChunk) {
        return res.status(502).json({ error: failedChunk.error });
      }

      let allMatchesResults: any[] = [];
      let overallSummary = '';
      for (const result of chunkResults) {
        if (result.summary && !overallSummary) overallSummary = result.summary;
        if (result.matches) allMatchesResults.push(...result.matches);
      }

      const requiredCategoriesV2 = ['全场大小球', '半场大小球', '全场让球', '半场让球', '全场独赢1X2', '波胆', '双方是否进球', '总进球单双', '主队进球数', '客队进球数', '总进球数', '进球时间段'];
      const processedMatches = allMatchesResults.map((matchResult: any, idx: number) => {
        const assessments = Array.isArray(matchResult.market_assessments) ? matchResult.market_assessments : [];
        const byCategory = new Map(assessments.map((item: any) => [String(item.category || ''), item]));
        const inputMatch = evaluationData[idx] || {};
        const verifiedMarketTypes = new Set((inputMatch?.verified_ybty_markets || []).map((market: any) => market.market));
        const requiredMarketByCategory: Record<string, string> = {
          '全场大小球': 'full_total',
          '半场大小球': 'half_total',
          '全场让球': 'full_spread',
          '半场让球': 'half_spread',
          '全场独赢1X2': 'full_h2h',
        };
        return {
          ...matchResult,
          score_verified: mode === 'prematch_eval' ? true : matchResult.score_verified === true,
          score_source: mode === 'prematch_eval' ? 'prematch_not_applicable' : matchResult.score_source,
          market_assessments: requiredCategoriesV2.map((category) => {
            const assessment: any = byCategory.get(category) || {
              category,
              market: category,
              direction: '暂无可靠方向',
              line: null,
              odds: null,
              probability: null,
              grade: 'NO_BET',
              status: 'unavailable',
              reason: 'AI未返回该玩法的可靠评估，已由系统按数据不足处理。',
            };
            const requiredMarket = requiredMarketByCategory[category];
            if (requiredMarket && !verifiedMarketTypes.has(requiredMarket)) {
              return {
                ...assessment,
                direction: '盘口阶段未核验',
                line: null,
                odds: null,
                grade: 'NO_BET',
                status: 'unavailable',
                value_edge: null,
                reason: '输入盘口未确认属于该全场/半场市场，系统已禁止按索引猜测盘口阶段。',
              };
            }
            const odds = Number(assessment.odds);
            const probability = Number(assessment.probability);
            if (!requiredMarket && !(odds > 1) && Number.isFinite(probability)) {
              return {
                ...assessment,
                grade: assessment.grade === 'NO_BET' ? 'C' : assessment.grade,
                status: 'prediction',
                value_edge: null,
              };
            }
            if (odds > 1 && Number.isFinite(probability)) {
              const impliedProbability = 100 / odds;
              const valueEdge = Math.round((probability - impliedProbability) * 100) / 100;
              if (valueEdge <= 0) {
                return {
                  ...assessment,
                  grade: 'NO_BET',
                  status: 'avoid',
                  value_edge: valueEdge,
                  reason: `${assessment.reason || ''} 模型概率${probability}%不高于赔率隐含概率${impliedProbability.toFixed(1)}%，属于非正期望值。`.trim(),
                };
              }
              return { ...assessment, value_edge: valueEdge };
            }
            return { ...assessment, value_edge: null };
          }),
        };
      }).map((matchResult: any) => {
        const sanitizedAssessments = (matchResult.market_assessments || []).map((item: any) => sanitizeMarketAssessment(item));
        const formalMarkets = sanitizedAssessments.filter((assessment: any) =>
          assessment.status === 'recommend' && ['A', 'B'].includes(String(assessment.grade || ''))
        );
        return {
          ...matchResult,
          market_assessments: sanitizedAssessments,
          recommendation: formalMarkets.length === 0 ? null : matchResult.recommendation,
          verification_passed: formalMarkets.length > 0,
        };
      });

      return res.json({
        summary: overallSummary || `已完成 ${processedMatches.length} 场比赛的批量深挖评估。`,
        matches: processedMatches,
        ai_provider: 'gemini',
      });
    }

    const resultText = await runAI(promptData.prompts[0]);
    let parsedJson = {};
    try {
      parsedJson = parseModelJson(resultText);
      (parsedJson as any).ai_provider = 'gemini';
      if (Array.isArray((parsedJson as any).parlay_recommendations)) {
        (parsedJson as any).parlay_recommendations = (parsedJson as any).parlay_recommendations.map((ticket: any) => ({
          ...ticket,
          legs: Array.isArray(ticket.legs) ? ticket.legs.map((leg: any) => sanitizeParlayLeg(leg, promptData.parlayCandidates)) : [],
        }));
      }
    } catch {
      parsedJson = { summary: resultText, grade: 'C', verification_passed: false, ai_provider: 'gemini' };
    }

    res.json(parsedJson);
  } catch (err: any) {
    console.error('[AI Evaluation Error]', err);
    const serviceStatus = geminiHttpStatus(err);
    const serviceUnavailable = serviceStatus === 429 || serviceStatus === 500 || serviceStatus === 502 || serviceStatus === 503 || serviceStatus === 504;
    const networkFailure = isGeminiNetworkFailure(err) || (!serviceUnavailable && /network fallback failed/i.test(err?.message || ''));
    res.status(serviceUnavailable ? 503 : networkFailure ? 502 : 500).json({
      error: err.message || 'AI Evaluation Failed',
      ...(serviceUnavailable ? {
        instructions: 'Google Gemini API 触发配额上限或额度限制。建议点击“导出 Prompt”按钮，复制数据直接在网页版 Gemini (gemini.google.com) 中免费快速分析，随后粘贴结果导入系统！',
        retryable: true,
        upstream_status: serviceStatus,
      } : {}),
      ...(networkFailure ? {
        instructions: 'Gemini 网络连接失败。建议直接使用【导出 Prompt】功能发送给网页版 Gemini。',
      } : {}),
    });
  }
});

// ---------------- VITE & SERVER SETUP ----------------

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LX Football System] Express Server running on http://0.0.0.0:${PORT}`);
  });
}

start();

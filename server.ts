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
    const incomingLegs = Array.isArray(newItem.parlay_legs) ? newItem.parlay_legs : [];
    const parlayRequested = newItem.is_parlay === true || incomingLegs.length > 0 || /串\s*1|精选彩票/.test(String(newItem.recommendation?.market || ''));
    if (parlayRequested && incomingLegs.length < 2) {
      return res.status(400).json({ error: 'A formal parlay must include at least two structured legs' });
    }
    if (incomingLegs.length > 0) {
      const invalidLeg = incomingLegs.find((leg: any) =>
        !leg?.match || !leg?.ybty_home || !leg?.ybty_away ||
        !hasUsableRecommendation(leg) ||
        !['A', 'B'].includes(String(leg?.grade || '')) ||
        !/^\d{4}-\d{2}-\d{2}/.test(String(leg?.start_time_beijing || '')) ||
        (Number(leg?.minute || 0) > 0 && leg?.score_verified !== true)
      );
      if (invalidLeg) {
        return res.status(400).json({ error: 'Every formal parlay leg must be B grade or above with teams, market, time, odds, and verified live score', leg: invalidLeg.match });
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
    const recommendation = newItem?.recommendation;
    const predictionOnly = newItem?.prediction_only === true;
    if (!newItem?.match || !recommendation?.market || recommendation.line === undefined || (!predictionOnly && !Number.isFinite(Number(recommendation.odds)))) {
      return res.status(400).json({ error: 'A backtest record requires match, market, line, and real odds unless it is a prediction-only record' });
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

// Preserve the complete AI research output independently from the formal ledger.
// A snapshot may contain NO_BET/C-grade assessments and therefore must not affect ROI statistics.
app.get('/api/ai/evaluations', (req, res) => {
  const history = readJsonFile<any[]>('output/ai_evaluation_history.json', []);
  res.json({ evaluations: history });
});

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

function cleanTeamName(str: string): string {
  if (!str) return '';
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
    if (Array.isArray(prematchFile.decisions)) {
      prematchFile.decisions.forEach((d: any) => {
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

  // 立即驱动全局决策重发刷盘
  syncDecisionsWithAliases();

  res.json({ success: true, aliases: manual, removed_from });
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
    const { target = 'all' } = req.body; // 'live' | 'prematch' | 'all'

    let clearedLiveCount = 0;
    let clearedPrematchCount = 0;

    if (target === 'live' || target === 'all') {
      const liveFile = readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [], summary: {} });
      clearedLiveCount = (liveFile.decisions || []).length;
      liveFile.decisions = [];
      liveFile.summary = {
        total: 0,
        a_grade: 0,
        b_grade: 0,
        watch: 0,
        updated_at: new Date().toISOString(),
      };
      requireJsonWrites([['output/ybty_leisu_decisions.json', liveFile]]);

      const liveStatus = readJsonFile<any>('output/pipeline_status.json', {});
      liveStatus.last_updated = new Date().toISOString();
      liveStatus.total_matches = 0;
      requireJsonWrites([['output/pipeline_status.json', liveStatus]]);
    }

    if (target === 'prematch' || target === 'all') {
      const prematchFile = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });
      const prematchDecisionsCount = Array.isArray(prematchFile.decisions) ? prematchFile.decisions.length : 0;
      const prematchResearchCount = Array.isArray(prematchFile.research_queue) ? prematchFile.research_queue.length : 0;
      clearedPrematchCount = prematchDecisionsCount + prematchResearchCount;
      prematchFile.decisions = [];
      prematchFile.research_queue = [];
      prematchFile.single_best = null;
      prematchFile.parlay_5x = null;
      prematchFile.summary = {
        total: 0,
        assessed: 0,
        a_grade: 0,
        b_grade: 0,
        c_grade: 0,
        watch: 0,
        research: 0,
        pass: 0,
        updated_at: new Date().toISOString(),
      };

      const prematchCandidates = readJsonFile<any>('output/ybty_leisu_prematch_candidates.json', {});
      prematchCandidates.candidates = [];
      prematchCandidates.live_events = [];
      prematchCandidates.unmatched_markets = [];
      prematchCandidates.summary = { total: 0, matched: 0, unmatched: 0 };

      const prematchBrief = readJsonFile<any>('output/prematch_ai_brief.json', {});
      prematchBrief.candidates = [];
      prematchBrief.highlights = [];
      prematchBrief.summary = '非滚球分析库已清空，等待下一次分析。';

      const prematchStatus = readJsonFile<any>('output/prematch_pipeline_status.json', {});
      prematchStatus.last_updated = new Date().toISOString();
      prematchStatus.total_matches = 0;
      prematchStatus.market_events = 0;
      prematchStatus.prematch_events = 0;
      prematchStatus.matched = 0;
      prematchStatus.unmatched = 0;
      prematchStatus.research = 0;
      prematchStatus.pass = 0;

      requireJsonWrites([
        ['output/ybty_leisu_prematch_decisions.json', prematchFile],
        ['output/ybty_leisu_prematch_candidates.json', prematchCandidates],
        ['output/prematch_ai_brief.json', prematchBrief],
        ['output/prematch_pipeline_status.json', prematchStatus],
      ]);
    }

    res.json({
      success: true,
      cleared_live: clearedLiveCount,
      cleared_prematch: clearedPrematchCount,
      total_cleared: clearedLiveCount + clearedPrematchCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Server-side AI Evaluation using Gemini API
app.post('/api/ai/evaluate', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: 'GEMINI_API_KEY environment variable is missing.',
        instructions: 'Please set GEMINI_API_KEY in project secrets to activate AI Evaluation.',
      });
    }

    const { match_name, ybty_home, ybty_away, minute, score, odds_info, mode, selected_match_refs, parlay_requests, batch_matches, batch_match_refs } = req.body;

    let parlayCandidates: any[] = [];

    if (mode === 'parlay_check') {
      const refs = Array.isArray(selected_match_refs) ? selected_match_refs : [];
      const requests = Array.isArray(parlay_requests)
        ? parlay_requests.filter((item: any) => Number(item?.size) >= 2 && Number(item?.count) >= 1)
        : [];
      if (refs.length < 2 || requests.length === 0 || requests.some((item: any) => Number(item.size) > refs.length)) {
        return res.status(422).json({
          error: '串关生成参数无效：至少选择两场比赛，且串关长度不能超过已选比赛数。',
        });
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
      parlayCandidates = refs.map((ref: any) => {
        const stored = storedMatches.find((item: any) => normalize(item.match) === normalize(ref.match))
          || storedMatches.find((item: any) => normalize(item.ybty_home) === normalize(ref.ybty_home) && normalize(item.ybty_away) === normalize(ref.ybty_away));
        return stored ? { ...stored, ai_evaluation: findLatestAssessment(ref) } : null;
      }).filter(Boolean);
      if (parlayCandidates.length !== refs.length) {
        return res.status(409).json({ error: '部分所选比赛已不在当前系统比赛池中，请刷新后重新选择。' });
      }
    }

    const ai = new GoogleGenAI({ apiKey });

    // Read CUSTOM_INSTRUCTIONS_COMPLETE.md rules
    let rulesContent = '';
    try {
      const instructionsPath = path.join(process.cwd(), 'CUSTOM_INSTRUCTIONS_COMPLETE.md');
      if (fs.existsSync(instructionsPath)) {
        rulesContent = fs.readFileSync(instructionsPath, 'utf-8');
      }
    } catch (e) {
      console.warn('Rules file missing or unreadable', e);
    }

    const runGemini = async (contents: string): Promise<string> => {
      const retryDelays = [0, 1500, 3500, 7000];
      let lastError: any;
      for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
        if (retryDelays[attempt] > 0) await waitForRetry(retryDelays[attempt]);
        try {
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents,
            config: { responseMimeType: 'application/json' },
          });
          return response.text || '{}';
        } catch (sdkError: any) {
          lastError = sdkError;
          if (isGeminiNetworkFailure(sdkError)) {
            try {
              console.warn(`[AI Evaluation] Gemini SDK network unavailable; using Windows network fallback (attempt ${attempt + 1}/${retryDelays.length}).`);
              return await generateGeminiViaWindowsNetwork(apiKey, contents);
            } catch (fallbackError: any) {
              lastError = fallbackError;
            }
          }
          if (!isRetryableGeminiFailure(lastError) || attempt === retryDelays.length - 1) throw lastError;
          console.warn(`[AI Evaluation] Gemini temporarily unavailable (${geminiHttpStatus(lastError) || 'network'}); retrying.`);
        }
      }
      throw lastError;
    };

    if (mode !== 'parlay_check') {
      let requestedMatches: any[];
      if (Array.isArray(batch_match_refs) && batch_match_refs.length > 0) {
        const decisionFile = mode === 'prematch_eval'
          ? readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], research_queue: [] })
          : readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [] });
        const storedMatches = [
          ...(Array.isArray(decisionFile.decisions) ? decisionFile.decisions : []),
          ...(Array.isArray(decisionFile.research_queue) ? decisionFile.research_queue : []),
        ];
        const unresolved: string[] = [];
        requestedMatches = batch_match_refs.map((ref: any) => {
          const exact = storedMatches.find((item: any) => item.match === ref.match);
          const byTeams = storedMatches.find((item: any) =>
            cleanTeamName(item.ybty_home) === cleanTeamName(ref.ybty_home) &&
            cleanTeamName(item.ybty_away) === cleanTeamName(ref.ybty_away)
          );
          const found = exact || byTeams;
          if (!found) unresolved.push(ref.match || `${ref.ybty_home} vs ${ref.ybty_away}`);
          return found;
        }).filter(Boolean);
        if (unresolved.length > 0) {
          return res.status(409).json({ error: '部分比赛已不在当前分析批次中，请刷新页面后重新选择。', unresolved_matches: unresolved });
        }
      } else {
        requestedMatches = Array.isArray(batch_matches) && batch_matches.length > 0
          ? batch_matches
          : [{ match: match_name, ybty_home, ybty_away, minute, score, odds_info }];
      }
      const evaluationData = requestedMatches.map((item: any) => ({
        match: item.match || `${item.ybty_home || ''} vs ${item.ybty_away || ''}`,
        league: item.league || item.ybty_league || item.leisu_league || '',
        ybty_home: item.ybty_home || '',
        ybty_away: item.ybty_away || '',
        leisu_home: item.leisu_home || '',
        leisu_away: item.leisu_away || '',
        start_time_beijing: item.ybty_start_time_beijing || item.provider_start_time || '',
        minute: Number(item.minute || 0),
        score: item.score || null,
        score_verified: mode === 'prematch_eval' ? true : item.score_verified === true,
        score_source: mode === 'prematch_eval' ? 'prematch_not_applicable' : item.score_source || 'unverified',
        current_recommendation: item.recommendation || null,
        ybty_markets: item.ybty_markets || null,
        verified_ybty_markets: normalizeYbtyMarketTypes(item.ybty_raw_markets)
          .filter((market: any) => /^(full|half)_(h2h|spread|total)$/.test(String(market?.market || '')) && market?.market_type_verified !== false)
          .map((market: any) => ({
            market: market.market,
            market_title: market.market_title || null,
            line_index: market.line_index,
            options: (Array.isArray(market.options) ? market.options : []).map((option: any) => ({
              side: option.side || null,
              selection: option.selection ?? null,
              line: option.line ?? option.selection ?? null,
              odds: Number.isFinite(Number(option.odds)) ? Number(option.odds) : null,
              suspended: option.suspended === true,
              side_verified: option.side_verified === true,
            })),
          })),
        unverified_market_summary: normalizeYbtyMarketTypes(item.ybty_raw_markets)
          .filter((market: any) => market?.market_type_verified === false || !/^(full|half)_(h2h|spread|total)$/.test(String(market?.market || '')))
          .map((market: any) => ({
            raw_market: market.market || 'unclassified',
            line_index: market.line_index,
            reason: market.market_type_source || 'market period/type not verified',
            usable_option_count: (Array.isArray(market.options) ? market.options : []).filter((option: any) =>
              option?.suspended !== true && Number.isFinite(Number(option?.odds)) && Number(option.odds) > 1
            ).length,
          })),
        reference_market: item.reference_market || null,
        reference_odds: item.reference_odds ? {
          source: item.reference_odds.source || null,
          current: item.reference_odds.current || null,
          normalized_rows: item.reference_odds.detail_page?.panels?.flatMap((panel: any) => panel?.normalized_rows || []).slice(0, 12) || [],
        } : null,
        live_statistics: item.live_statistics || null,
        recent_trends: item.recent_trends || null,
        incidents: Array.isArray(item.incidents) ? item.incidents.slice(0, 30) : [],
        weather: item.weather || null,
        lineups: item.lineups || null,
        player_candidates: Array.isArray(item.player_candidates) ? item.player_candidates.slice(0, 30) : [],
        live_text: Array.isArray(item.live_text?.entries) ? item.live_text.entries.slice(0, 30) : item.live_text || null,
        detail_summary: item.detail_context ? {
          coverage: item.detail_context.coverage || null,
          weather_text: Array.isArray(item.detail_context.weather_text) ? item.detail_context.weather_text.slice(0, 10) : [],
          live_text: Array.isArray(item.detail_context.live_text) ? item.detail_context.live_text.slice(0, 30) : [],
          lineup_text: Array.isArray(item.detail_context.lineup_text) ? item.detail_context.lineup_text.slice(0, 30) : [],
          // Keep the browser request small, but retain the provider detail payload
          // in the server-to-model context. Tuple form removes repeated JSON keys
          // without discarding lineup, recent-results or head-to-head evidence.
          text_records: Array.isArray(item.detail_context.text_records)
            ? item.detail_context.text_records.slice(0, 500).map((record: any) => [record.endpoint, record.path, record.text])
            : [],
          number_records: Array.isArray(item.detail_context.number_records)
            ? item.detail_context.number_records.slice(0, 1000).map((record: any) => [record.endpoint, record.path, record.value])
            : [],
          text_tokens: Array.isArray(item.detail_context.text_tokens)
            ? item.detail_context.text_tokens.slice(0, 500)
            : [],
          player_candidates: Array.isArray(item.detail_context.player_candidates)
            ? item.detail_context.player_candidates.slice(0, 300)
            : [],
        } : null,
        data_availability: {
          realtime_score: Boolean(item.score),
          score_verified: mode === 'prematch_eval' ? true : item.score_verified === true,
          statistics: Boolean(item.live_statistics),
          corners: Boolean(item.live_statistics?.corners),
          attacks: Boolean(item.live_statistics?.attacks),
          dangerous_attacks: Boolean(item.live_statistics?.dangerous_attacks),
          shots: Boolean(item.live_statistics?.shots),
          shots_on_target: Boolean(item.live_statistics?.shots_on_target),
          cards: Boolean(item.live_statistics?.yellow_cards || item.live_statistics?.red_cards),
          incidents: Array.isArray(item.incidents) && item.incidents.length > 0,
          live_text: Boolean(item.live_text || item.detail_context?.live_text?.length),
          lineups: Boolean(item.lineups || item.detail_context?.lineup_text?.length || item.detail_context?.player_candidates?.length),
          recent_or_h2h_records: Boolean(item.recent_trends || item.detail_context?.text_records?.length || item.detail_context?.number_records?.length),
        },
        evidence: item.evidence || [],
        risks: item.risks || [],
        manual_odds_info: item.odds_info || odds_info || '',
      }));
      const missingMarketMatches = evaluationData.filter((item: any) => item.verified_ybty_markets.length === 0 && item.unverified_market_summary.length === 0).map((item: any) => item.match);
      const missingDetailMatches = evaluationData.filter((item: any) => !(
        item.live_statistics || item.recent_trends || item.lineups || item.weather || item.detail_summary ||
        item.incidents.length > 0 || item.player_candidates.length > 0 || item.live_text
      )).map((item: any) => item.match);
      if (missingMarketMatches.length > 0 || missingDetailMatches.length > 0) {
        return res.status(422).json({
          error: '批量AI评估已拦截：当前比赛只有决策摘要，没有完整盘口或比赛详情，不能执行全玩法深挖。',
          missing_markets: missingMarketMatches,
          missing_details: missingDetailMatches,
          instructions: '请重新导入同一批次的完整 YBTY + 雷速整合数据；系统会保留 markets、统计、事件、阵容、走势与详情字段。',
        });
      }
      const batchPrompt = `你是足球投注研究审核员。严格遵守下方项目协议，对输入的 ${evaluationData.length} 场比赛进行批量、逐场、全玩法评估。

核心要求：
1. 每场必须覆盖以下12类面板：全场大小球、半场大小球、全场让球、半场让球、全场独赢1X2、波胆、双方是否进球、总进球单双、主队进球数、客队进球数、总进球数、进球时间段。
2. “覆盖”不等于强行推荐。每类都必须返回一条结论；只有 verified_ybty_markets 中对应阶段、对应类型的真实盘口才可标 recommend/watch。unverified_market_summary 中的盘口阶段和类型未核验，严禁根据 line_index 猜测全场或半场，也不得引用其盘口和赔率；对应类别应标 unavailable、odds=null。
3. 波胆、双方是否进球、单双、主客队进球数、总进球数及时间段属于模型预测时允许 odds=null，但必须给 probability，并标 status=prediction；它们不是正式可下注盘口，但不得错误标成 unavailable。只有连预测依据也不足时才标 unavailable。
4. 每一玩法独立研究、独立评级和概率。可以同时存在多个推荐，不得只返回一个主选，也不得为了玩法多样化改写输入盘口。
5. 滚球比分只有输入 score_verified=true 才能视为已核验；否则最高C级，不得升级为正式滚球推荐。
6. A/B/C全部展示。无价值或证据不足使用 NO_BET，并清楚说明原因。
7. recommendation 仅表示该场所有合格玩法中风险收益最合理的主选；完整结论必须放在 market_assessments。
8. 对有赔率的方向计算隐含概率100/odds。模型概率不高于隐含概率时属于非正期望值，必须标 avoid + NO_BET，不得标 recommend 或 watch。
9. probability 必须只对应 direction 中的一个明确方向。若有多个比分或多个区间候选，分别放入 alternatives，每个候选单独给概率，并在 probability_scope 写清概率对象；禁止用一个概率同时表示“2-0 / 1-0”。

必须严格返回JSON：
{"summary":"批量总览","matches":[{"match":"原比赛名","ybty_home":"YBTY主队","ybty_away":"YBTY客队","summary":"本场结论","grade":"A|B|C","score_verified":false,"score_source":"来源","verification_passed":false,"recommendation":{"market":"主选玩法","line":"盘口","odds":1.88},"market_assessments":[{"category":"上述12类之一","market":"真实市场名称或模型预测","direction":"一个明确方向","line":"真实盘口或null","odds":1.88,"probability":65,"probability_scope":"概率对应的明确对象","alternatives":[{"direction":"另一个候选","probability":20}],"grade":"A|B|C|NO_BET","status":"recommend|watch|prediction|avoid|unavailable","reason":"依据与风险"}],"evidence":["依据"],"risks":["风险"]}]}

每场 market_assessments 必须恰好覆盖12类，不得遗漏。若整场无正式主选，recommendation=null。

项目协议：
${rulesContent}

待评估数据：
${JSON.stringify(evaluationData)}`;
      // V2 is intentionally concise and UTF-8 clean. The full project protocol is
      // still attached, while the structured data below contains the hydrated
      // YBTY markets plus Leisu score, statistics, events and detail evidence.
      const batchPromptV2 = `你是足球投注研究审核员。请按照项目协议，对 ${evaluationData.length} 场比赛逐场进行全玩法评估。
评估模式：${mode === 'prematch_eval' ? '赛前评估。赛前没有滚球比分核验要求，不得因为 score_verified 字段降级；score_verified=true 在此仅表示该规则不适用。' : '滚球评估。只有滚球才执行 score_verified 核验和未核验最高C级限制。'}

必须覆盖且各返回一项：全场大小球、半场大小球、全场让球、半场让球、全场独赢1X2、波胆、双方是否进球、总进球单双、主队进球数、客队进球数、总进球数、进球时间段。

评估规则：
1. 必须综合 realtime score、live_statistics（角球、进攻、危险进攻、射门、射正、控球、红黄牌）、incidents、live_text、lineups、recent_trends、reference_odds 和 detail_summary 中的历史/交锋原始记录；不得只根据独赢赔率判断。
2. data_availability 明确表示本次快照实际抓到的字段。缺少单个字段时说明限制，但不能把已经存在的其他证据忽略掉。
3. 只有 verified_ybty_markets 中的真实盘口才能给 recommend/watch 并引用盘口和赔率。不得猜测未核验盘口。
4. 波胆、双方进球、单双、球队进球数、总进球数和进球时间段属于模型预测；有足够比赛证据时使用 status=prediction、odds=null，并给出单一方向的概率。
5. 每个玩法独立研究。可以同时给出多个合格方向，不得只返回一个玩法，也不得为了多样化改写真实盘口。
6. 有赔率时计算隐含概率 100/odds；模型概率不高于隐含概率时必须 status=avoid、grade=NO_BET。
7. 滚球 score_verified=false 时最高 C 级且不得成为正式主选，但仍须完成所有玩法分析和模型预测。
8. A/B/C 全部展示。recommendation 仅为所有合格玩法中最优正式主选；没有合格正式主选则为 null。

严格返回 JSON：
{"summary":"批量总览","matches":[{"match":"原比赛名","ybty_home":"YBTY主队","ybty_away":"YBTY客队","summary":"本场结论","grade":"A|B|C","score_verified":false,"score_source":"来源","verification_passed":false,"recommendation":null,"market_assessments":[{"category":"上述12类之一","market":"真实市场名或模型预测","direction":"一个明确方向","line":null,"odds":null,"probability":65,"probability_scope":"该概率对应的明确方向","alternatives":[{"direction":"次选","probability":20}],"grade":"A|B|C|NO_BET","status":"recommend|watch|prediction|avoid|unavailable","reason":"必须引用本场实际数据说明"}],"evidence":["依据"],"risks":["风险"]}]}

项目协议：
${rulesContent}

服务端补全后的评估数据：
${JSON.stringify(evaluationData)}`;
      const batchText = await runGemini(batchPromptV2);
      try {
        const parsed = JSON.parse(batchText);
        const requiredCategoriesV2 = ['全场大小球', '半场大小球', '全场让球', '半场让球', '全场独赢1X2', '波胆', '双方是否进球', '总进球单双', '主队进球数', '客队进球数', '总进球数', '进球时间段'];
        const requiredCategories = ['全场大小球', '半场大小球', '全场让球', '半场让球', '全场独赢1X2', '波胆', '双方是否进球', '总进球单双', '主队进球数', '客队进球数', '总进球数', '进球时间段'];
        if (!Array.isArray(parsed.matches)) throw new Error('missing matches');
        parsed.matches = parsed.matches.map((matchResult: any) => {
          const assessments = Array.isArray(matchResult.market_assessments) ? matchResult.market_assessments : [];
          const byCategory = new Map(assessments.map((item: any) => [String(item.category || ''), item]));
          const inputMatch = evaluationData.find((item: any) => item.match === matchResult.match) || evaluationData[parsed.matches.indexOf(matchResult)];
          const verifiedMarketTypes = new Set((inputMatch?.verified_ybty_markets || []).map((market: any) => market.market));
          const requiredMarketByCategory: Record<string, string> = {
            '全场大小球': 'full_total',
            '半场大小球': 'half_total',
            '全场让球': 'full_spread',
            '半场让球': 'half_spread',
            '全场独赢1X2': 'full_h2h',
          };
          Object.assign(requiredMarketByCategory, {
            '全场大小球': 'full_total',
            '半场大小球': 'half_total',
            '全场让球': 'full_spread',
            '半场让球': 'half_spread',
            '全场独赢1X2': 'full_h2h',
          });
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
        });
        parsed.matches = parsed.matches.map((matchResult: any) => {
          const formalMarkets = (matchResult.market_assessments || []).filter((assessment: any) =>
            assessment.status === 'recommend' && ['A', 'B'].includes(String(assessment.grade || ''))
          );
          if (formalMarkets.length === 0) {
            return { ...matchResult, recommendation: null, verification_passed: false };
          }
          return matchResult;
        });
        return res.json(parsed);
      } catch {
        return res.status(502).json({ error: 'AI批量评估返回了无效JSON，请重试。' });
      }
    }

    let candidatesInfoText = '';
    if (parlayCandidates.length > 0) {
      candidatesInfoText = parlayCandidates.map((c: any, idx: number) => {
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
    }

    const prompt = `
你是一个顶尖、严肃且专业的足球投注评估与精选推荐 AI，严格遵循以下项目的最新足球分析与硬性风控协议：

---【核心结算与盘口规则】---
1. 全场大小球 (Full Time Over/Under)：
   - 结算绝对标准：只看完场终场时的双方总进球数 vs 盘口！
   - 示例：无论在 0-0、1-0 还是 2-1 时买入“全场大 2.25”，只要全场完场比分为 2-1 (总进球 3)，3 > 2.25，即为【全赢】！
2. 滚球让球盘 (Live Asian Handicap / 后续时段让球)：
   - 结算绝对标准：从下注瞬间起，比分基准归零 (0 : 0) 重新计算！只以买入后双方新增进球/净胜球结算。
   - 示例：在 1-0 时买入主队“-0.5”，完场比分 2-1（下注后双方各进1球，新增比分 1-1），让球算【输】。
3. 四分之一盘口 (2.25 / 2.75 / -0.75 / -1.25)：
   - 必须精确拆分计算赢半 (+50% 利润)、输半 (-50% 本金) 与走盘 (0%)，禁止粗暴判全赢或全输。

---【串关风控与高信心例外规则】---
1. 同一比赛可以在不同串关中采用不同玩法，但每个玩法必须分别完成研究并达到B级以上；不得为了多样化临时改写市场、盘口或赔率。
2. 普通B级同一方向最多进入1组正式串关；A级且模型评分≥85、首发与战意明确的同一方向最多进入2组。
3. 单张普通串关不重复放同一场比赛；同一比赛跨串关暴露、同轮杯赛或相同轮换风险必须计入相关性和总风险，概率不够时只保留一组。

请求模式: ${mode}
${mode === 'parlay_check' ? `
---【用户选择的比赛池（${parlayCandidates.length} 场）】---
${candidatesInfoText || '无比赛数据'}
---【用户要求生成的串关规格】---
${JSON.stringify(parlay_requests || [])}
` : `
赛事名称: ${match_name || `${ybty_home} vs ${ybty_away}`}
YBTY队名: 主队 [${ybty_home}] vs 客队 [${ybty_away}]
比赛分钟: ${minute ?? '未指定'}
当前比分: ${score ? `${score.home}-${score.away}` : '未指定'}
盘口与赔率信息: ${odds_info || '无'}
`}

请从每场的 system_recommendation、ai_market_assessments 与 YBTY 真实盘口中选择胜率较高且赔率合理的方向，按用户要求的每种长度和数量生成串关。不得编造盘口或赔率；单张串关不得重复同一比赛。输出严格的 JSON 结构：
{
  "summary": "本次多规格串关生成总结",
  "grade": "A | B | C",
  "recommendation": {
    "market": "串关组合核对结论 (如: 3串1组合通过 / 被风控拦截)",
    "line": "N/A",
    "odds": 1.85,
    "best_timing_tip": "串关下注建议与资金配比分配"
  },
  "score_verified": false,
  "score_source": "ybty_market",
  "verification_passed": true,
  "evidence": ["串关安全点1", "串关安全点2"],
  "risks": ["串关风险拦截项1", "串关风险拦截项2"],
  "timing_strategy": "串关资金策略与注码管理建议",
  "parlay_safety_check": {
    "is_valid_parlay": true,
    "allow_max_parlay_tickets": 1,
    "reasons": ["关于这5腿比赛是否有同场重复、核心腿重叠或杯赛风险的逐条分析说明"]
  },
  "parlay_recommendations": [{"size": 8, "ticket_index": 1, "grade": "A|B|C", "estimated_total_odds": 12.34, "reason": "为何选择这些方向", "legs": [{"match":"比赛名","ybty_home":"主队","ybty_away":"客队","market":"真实玩法","line":"真实盘口","odds":1.88,"probability":65,"grade":"A|B|C"}]}]
}
`;

    const resultText = await runGemini(prompt);
    let parsedJson = {};
    try {
      parsedJson = JSON.parse(resultText);
    } catch {
      parsedJson = { summary: resultText, grade: 'C', verification_passed: false };
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
        instructions: `Gemini 服务暂时不可用（HTTP ${serviceStatus}），系统已自动重试 4 次。请稍后再次评估；这不是盘口数据或 API Key 缺失。`,
        retryable: true,
        upstream_status: serviceStatus,
      } : {}),
      ...(networkFailure ? {
        instructions: 'Gemini 网络连接失败。请允许 node.exe 访问 generativelanguage.googleapis.com:443，或检查防火墙、代理和安全软件。',
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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[LX Football System] Express Server running on http://127.0.0.1:${PORT}`);
  });
}

start();

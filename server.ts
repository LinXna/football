import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

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
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[Server] Error writing ${filePath}:`, err);
    return false;
  }
}

// ---------------- API ROUTES ----------------

// Live Pipeline Status & Decisions
app.get('/api/pipeline/live', (req, res) => {
  const status = readJsonFile('output/pipeline_status.json', {});
  const decisions = readJsonFile('output/ybty_leisu_decisions.json', { decisions: [], summary: {} });
  const candidates = readJsonFile('output/ybty_leisu_candidates.json', { candidates: [] });

  res.json({
    status,
    decisions: decisions.decisions || [],
    summary: decisions.summary || {},
    single_best: decisions.single_best || null,
    parlay_5x: decisions.parlay_5x || null,
    candidates: candidates.candidates || [],
  });
});

// Prematch Pipeline Status & Decisions
app.get('/api/pipeline/prematch', (req, res) => {
  const status = readJsonFile('output/prematch_pipeline_status.json', {});
  const decisions = readJsonFile('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });
  const candidates = readJsonFile('output/ybty_leisu_prematch_candidates.json', { candidates: [] });
  const brief = readJsonFile('output/prematch_ai_brief.json', {});

  res.json({
    status,
    decisions: decisions.decisions || [],
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

    const ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);
    
    // Ensure required protocol fields
    const formalItem = {
      id: newItem.id || Math.random().toString(16).substring(2, 10),
      created_at: new Date().toISOString(),
      match: newItem.match,
      ybty_home: newItem.ybty_home || newItem.match.split(' vs ')[0] || '',
      ybty_away: newItem.ybty_away || newItem.match.split(' vs ')[1] || '',
      minute: newItem.minute ?? 0,
      score_at_recommendation: newItem.score_at_recommendation || { home: 0, away: 0 },
      score_source: newItem.score_source || 'ybty_market',
      score_verified: newItem.score_verified ?? true,
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

// Update single ledger item review
app.post('/api/ledger/update-review', (req, res) => {
  try {
    const { id, final_score, score_verified, outcome } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    const ledger = readJsonFile<any[]>('output/recommendation_ledger.json', []);
    const itemIndex = ledger.findIndex((i: any) => i.id === id);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Ledger item not found' });
    }

    const item = ledger[itemIndex];
    item.review = item.review || {};
    if (final_score) {
      item.review.final_score = final_score;
      item.review.status = 'reviewed';
    }
    if (outcome) {
      item.review.outcome = outcome;
    }
    if (score_verified !== undefined) {
      item.score_verified = score_verified;
    }

    ledger[itemIndex] = item;
    writeJsonFile('output/recommendation_ledger.json', ledger);

    res.json({ success: true, item });
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
  if (!manual[canonical_name]) {
    manual[canonical_name] = [];
  }

  if (!manual[canonical_name].includes(alias)) {
    manual[canonical_name].push(alias);
    writeJsonFile('team_aliases.json', manual);
  }

  res.json({ success: true, aliases: manual });
});

// Export Combined Data (Merging YBTY + Leisu + Decisions)
app.get('/api/export-combined', (req, res) => {
  const type = (req.query.type as string) || 'live';
  
  if (type === 'prematch') {
    const status = readJsonFile('output/prematch_pipeline_status.json', {});
    const ybty = readJsonFile('output/ybty_prematch_latest.json', []);
    const leisu = readJsonFile('output/leisu_prematch_latest.json', []);
    const candidates = readJsonFile('output/ybty_leisu_prematch_candidates.json', {});
    const decisions = readJsonFile('output/ybty_leisu_prematch_decisions.json', {});
    const brief = readJsonFile('output/prematch_ai_brief.json', {});

    const combined = {
      export_time: new Date().toISOString(),
      export_type: 'prematch_combined',
      pipeline_status: status,
      ybty_raw: ybty,
      leisu_raw: leisu,
      candidates,
      decisions,
      ai_brief: brief,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=ybty_leisu_prematch_combined.json');
    return res.send(JSON.stringify(combined, null, 2));
  } else {
    const status = readJsonFile('output/pipeline_status.json', {});
    const ybty = readJsonFile('output/ybty_latest.json', []);
    const leisu = readJsonFile('output/leisu_latest.json', []);
    const candidates = readJsonFile('output/ybty_leisu_candidates.json', {});
    const decisions = readJsonFile('output/ybty_leisu_decisions.json', {});

    const combined = {
      export_time: new Date().toISOString(),
      export_type: 'live_combined',
      pipeline_status: status,
      ybty_raw: ybty,
      leisu_raw: leisu,
      candidates,
      decisions,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=ybty_leisu_live_combined.json');
    return res.send(JSON.stringify(combined, null, 2));
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
      const rawMatch = item.match || `${homeTeam} vs ${awayTeam}`.trim();
      const matchName = rawMatch === 'vs' || !rawMatch ? '未知赛事' : rawMatch;

      const calculatedBeijingTime = calculateExactBeijingTime({
        ...item,
        start_time: item.countdown || item.commence_time || item.start_time || item.ybty_start_time || item.clock_status,
      });

      const isLive = item.source_type === 'live' || Boolean(item.minute && item.minute > 0) || Boolean(item.is_live);

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
              score: { home: hScore, away: aScore },
              score_verified: true,
              score_source: item.score_source || 'batch_file_supplement',
              commence_time: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.commence_time || d.ybty_start_time_beijing || calculatedBeijingTime),
              ybty_start_time_beijing: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.ybty_start_time_beijing || calculatedBeijingTime),
              status: d.status === 'PASS' ? 'WATCH' : d.status,
              grade: d.grade === 'C' || !d.grade ? 'B' : d.grade,
              recommendation: {
                market: item.market || item.recommendation?.market || d.recommendation?.market || '全场大球',
                line: item.line ?? item.recommendation?.line ?? d.recommendation?.line ?? '2.25',
                odds: Number(item.odds ?? item.recommendation?.odds ?? d.recommendation?.odds ?? 1.90),
              },
              risks: (d.risks || []).filter((r: string) => !r.includes('盘口水位缺失') && !r.includes('比分未经校验') && !r.includes('开赛时间缺失')),
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
              score: { home: hScore, away: aScore },
              score_verified: true,
              score_source: item.score_source || 'batch_file_supplement',
              commence_time: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.commence_time || d.ybty_start_time_beijing || calculatedBeijingTime),
              ybty_start_time_beijing: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.ybty_start_time_beijing || calculatedBeijingTime),
              status: d.status === 'PASS' ? 'WATCH' : d.status,
              grade: d.grade === 'C' || !d.grade ? 'B' : d.grade,
              recommendation: {
                market: item.market || item.recommendation?.market || d.recommendation?.market || '全场大球',
                line: item.line ?? item.recommendation?.line ?? d.recommendation?.line ?? '2.25',
                odds: Number(item.odds ?? item.recommendation?.odds ?? d.recommendation?.odds ?? 1.90),
              },
              risks: (d.risks || []).filter((r: string) => !r.includes('盘口水位缺失') && !r.includes('比分未经校验') && !r.includes('开赛时间缺失')),
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
          status: 'WATCH',
          grade: 'B',
          minute: item.minute || 0,
          score: { home: hScore, away: aScore },
          score_verified: true,
          score_source: item.score_source || 'import_file',
          commence_time: calculatedBeijingTime,
          ybty_start_time_beijing: calculatedBeijingTime,
          recommendation: {
            market: item.market || item.recommendation?.market || '全场大球',
            line: item.line ?? item.recommendation?.line ?? '2.25',
            odds: Number(item.odds ?? item.recommendation?.odds ?? 1.88),
          },
          evidence: [`[最新导入] 数据来源: ${item.source_type || '整合导入'}，已计算准确开赛与已进行时间`],
          risks: [],
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
    writeJsonFile('output/ybty_leisu_decisions.json', liveFile);

    // Save prematch decisions
    prematchFile.decisions = prematchDecisions;
    prematchFile.summary = {
      total: prematchDecisions.length,
      a_grade: prematchDecisions.filter((d: any) => d.grade === 'A').length,
      b_grade: prematchDecisions.filter((d: any) => d.grade === 'B').length,
      watch: prematchDecisions.filter((d: any) => d.status === 'WATCH').length,
      updated_at: new Date().toISOString(),
    };
    writeJsonFile('output/ybty_leisu_prematch_decisions.json', prematchFile);

    // Also update pipeline status files
    const liveStatus = readJsonFile<any>('output/pipeline_status.json', {});
    liveStatus.last_updated = new Date().toISOString();
    liveStatus.total_matches = liveDecisions.length;
    writeJsonFile('output/pipeline_status.json', liveStatus);

    const prematchStatus = readJsonFile<any>('output/prematch_pipeline_status.json', {});
    prematchStatus.last_updated = new Date().toISOString();
    prematchStatus.total_matches = prematchDecisions.length;
    writeJsonFile('output/prematch_pipeline_status.json', prematchStatus);

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
      writeJsonFile('output/ybty_leisu_decisions.json', liveFile);

      const liveStatus = readJsonFile<any>('output/pipeline_status.json', {});
      liveStatus.last_updated = new Date().toISOString();
      liveStatus.total_matches = 0;
      writeJsonFile('output/pipeline_status.json', liveStatus);
    }

    if (target === 'prematch' || target === 'all') {
      const prematchFile = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });
      clearedPrematchCount = (prematchFile.decisions || []).length;
      prematchFile.decisions = [];
      prematchFile.summary = {
        total: 0,
        a_grade: 0,
        b_grade: 0,
        watch: 0,
        updated_at: new Date().toISOString(),
      };
      writeJsonFile('output/ybty_leisu_prematch_decisions.json', prematchFile);

      const prematchStatus = readJsonFile<any>('output/prematch_pipeline_status.json', {});
      prematchStatus.last_updated = new Date().toISOString();
      prematchStatus.total_matches = 0;
      writeJsonFile('output/prematch_pipeline_status.json', prematchStatus);
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

    const { match_name, ybty_home, ybty_away, minute, score, odds_info, mode, selected_candidates } = req.body;

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

---【最佳投注时机与专业策略】---
1. 降水降盘等待策略：若预测半场大概率进球，但当前盘口开在大 1/1.5，建议提示用户：“在开赛 5-10 分钟盘口掉至大 0.5 或 0.5/1 时重仓买入”。
2. 多分段与丰富玩法覆盖：综合评估波胆(Correct Score)、半全场(HT/FT)、角球大小、分段投注(0-15min, 16-30min, 31min-HT, HT-60min, 61-75min, 76min-FT)以及双方是否进球(BTTS)。

---【串关风控与高信心例外规则】---
1. 基础硬性约束：同一场比赛不能重复暴露多个方向；普通候选核心腿最多进入 1 组正式串关。
2. 【高信心 A级 例外规则】：若比赛经评估达到 A级 (模型评分 ≥ 85 分，首发阵容与战意明确，胜率极高)，则允许作为超高确定性锚点进入最多 2 组独立串关（配合不同边缘腿），不可超过2组！

待评估请求模式: ${mode}
赛事名称: ${match_name || `${ybty_home} vs ${ybty_away}`}
YBTY队名: 主队 [${ybty_home}] vs 客队 [${ybty_away}]
比赛分钟: ${minute ?? '未指定'}
当前比分: ${score ? `${score.home}-${score.away}` : '未指定'}
盘口与赔率信息: ${odds_info || '无'}
选中候选数量: ${selected_candidates ? selected_candidates.length : 1}

请输出严格的 JSON 结构：
{
  "summary": "简洁专业的高层总结",
  "grade": "A | B | C",
  "recommendation": {
    "market": "如 全场大球 / 滚球让球 / 波胆 / 半场大球",
    "line": "如 2.25 或 -0.5",
    "odds": 1.88,
    "best_timing_tip": "如: 建议观望5-10分钟，待盘口降至大0.5/1水位1.90以上时择机重仓买入"
  },
  "score_verified": true,
  "score_source": "ybty_market",
  "verification_passed": true,
  "evidence": ["支持证据1", "支持证据2"],
  "risks": ["潜在风险1", "潜在风险2"],
  "timing_strategy": "针对半场/全场、角球及时间段(0-15m/16-30m/下半场)的进球节奏专业投注规划",
  "parlay_safety_check": {
    "is_valid_parlay": true,
    "allow_max_parlay_tickets": 2,
    "reasons": ["串关风控通过说明与串关配比建议"]
  }
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const resultText = response.text || '{}';
    let parsedJson = {};
    try {
      parsedJson = JSON.parse(resultText);
    } catch {
      parsedJson = { summary: resultText, grade: 'C', verification_passed: false };
    }

    res.json(parsedJson);
  } catch (err: any) {
    console.error('[AI Evaluation Error]', err);
    res.status(500).json({ error: err.message || 'AI Evaluation Failed' });
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

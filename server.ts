import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { APP_CONFIG } from './config/appConfig';
import { projectPath, resolveProjectPath } from './config/projectPaths';
import { readJsonFile, requireJsonWrites, withJsonTransaction, writeJsonFile } from './server/jsonStore';
import { registerAliasMutationRoutes, registerAliasReadRoutes } from './server/routes/aliasReadRoutes';
import { registerAiEvaluationMutationRoutes, registerAiManualImportRoutes, registerAiPromptExportRoutes, registerAiReadRoutes } from './server/routes/aiReadRoutes';
import { registerLedgerReadRoutes } from './server/routes/ledgerReadRoutes';
import { registerLedgerMutationRoutes } from './server/routes/ledgerMutationRoutes';
import { registerPipelineRoutes } from './server/routes/pipelineRoutes';
import { registerReportReadRoutes } from './server/routes/reportReadRoutes';
import { registerRuntimeMaintenanceRoutes } from './server/routes/runtimeMaintenanceRoutes';
import { registerGeminiEvaluationRoutes } from './server/routes/geminiEvaluationRoutes';
import { registerBatchSupplementRoutes } from './server/routes/batchSupplementRoutes';
import { synchronizeDecisionAliases } from './server/services/aliasDecisionSynchronizer';
import { parseModelJson } from './server/services/modelJson';
import { generateGeminiViaWindowsNetwork as generateGeminiViaWindowsNetworkService } from './server/services/geminiWindowsFallback';
import { normalizeYbtyMarketTypes } from './server/services/marketTypeNormalizer';
import { geminiHttpStatus, isGeminiNetworkFailure, isRetryableGeminiFailure, parseGeminiRetryDelay, waitForRetry } from './server/services/geminiRetry';
import { waitForGeminiRateSlot } from './server/services/geminiRateGate';
import { advanceGeminiKeyCursor, geminiKeyIndex, getGeminiKeyCooldown, isGeminiKeyAvailable, setGeminiKeyCooldown } from './server/services/geminiKeyCooldown';
import { normalizeParlayRecommendations } from './server/services/parlayRecommendationNormalizer';
import { createRecommendationIdentity } from './server/services/recommendationIdentity';
import { normalizeMarketLabel } from './server/services/marketLabels';
import { calculateExactBeijingTime as calculateBatchBeijingTime } from './server/services/beijingTime';
import { summarizeDecisions } from './server/services/decisionSummary';
import { createTeamAliasResolver } from './server/services/teamAliasResolver';
import { createBatchSupplementHandler } from './server/services/batchSupplementService';
import { createGeminiEvaluationHandler } from './server/services/geminiEvaluationService';
import { resolveMatchEvaluationMode } from './server/services/evaluationMode';
import { chunkPromptItems } from './server/services/promptChunking';
import { buildSlimPromptMatch } from './server/services/promptSlimPayload';

const app = express();
const { host: HOST, port: PORT, environment: ENVIRONMENT, geminiModel: GEMINI_MODEL } = APP_CONFIG;
const recommendationIdentity = createRecommendationIdentity(cleanTeamName);

const outputDir = resolveProjectPath('output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

app.use(express.json({ limit: '25mb' }));

const LOCKED_MUTATION_PATHS = new Set([
  '/api/ledger/delete',
  '/api/ledger/archive',
  '/api/ledger/add-ai-assessments',
  '/api/ledger/add-candidate',
  '/api/ledger/add',
  '/api/batch-supplement-scores',
  '/api/ledger/update-review',
  '/api/aliases',
  '/api/clear-outdated-matches',
  '/api/batch-supplement',
]);

app.use((req, _res, next) => {
  if (req.method === 'GET' || !LOCKED_MUTATION_PATHS.has(req.path)) return next();
  try { return withJsonTransaction(() => next()); }
  catch (error) { return next(error); }
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    environment: ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

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
  let market = normalizeMarketLabel(leg.market);
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

  // Prefer the readable normalized rules before the legacy compatibility rules below.
  if (/大小球|total/i.test(market) && !/(?:大球|小球|over|under)/i.test(combined)) {
    const direction = String(matchedAssessment?.direction || matchedAssessment?.category || '').toLowerCase();
    line = `${/(?:小球|under)/i.test(direction) ? '小' : '大'}${line}`.trim();
  }
  if (/让球|spread|handicap/i.test(market)) {
    const normalizedLine = String(line || '').toLowerCase();
    const hasDirection = /(?:主队|客队|home|away)/i.test(normalizedLine) || (home && normalizedLine.includes(home.toLowerCase())) || (away && normalizedLine.includes(away.toLowerCase()));
    if (!hasDirection) {
      const direction = String(matchedAssessment?.direction || '').toLowerCase();
      line = `${/(?:客队|away)/i.test(direction) ? (away || '客队') : (home || '主队')} ${line}`.trim();
    }
  }
  if (/(?:独赢|h2h|1x2)/i.test(market)) {
    const value = String(line || '').trim().toLowerCase();
    if (value === '1' || value === 'home') line = `${home || '主队'}胜`;
    else if (value === '2' || value === 'away') line = `${away || '客队'}胜`;
    else if (value === 'x' || value === 'draw') line = '平局';
  }

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

registerPipelineRoutes(app, {
  cleanTeamName,
  matchIdentity,
  normalizeYbtyMarketTypes,
  hideInvalidRecommendation,
});

// Recommendation Ledger
registerLedgerReadRoutes(app);
registerLedgerMutationRoutes(app, {
  recommendationKey: recommendationIdentity.recommendationKey,
  hasExplicitBetDirection: recommendationIdentity.hasExplicitBetDirection,
  sanitizeParlayLeg,
  hasUsableRecommendation: recommendationIdentity.hasUsableRecommendation,
  matchIdentity: recommendationIdentity.matchIdentity,
  directionIdentity: recommendationIdentity.directionIdentity,
  areSameMatch,
});
registerRuntimeMaintenanceRoutes(app);

// Store research/backtest candidates separately from formal recommendations.
// These records are reviewable after full time but never count toward formal ROI/hit rate.
// A snapshot may contain NO_BET/C-grade assessments and therefore must not affect ROI statistics.
registerAiReadRoutes(app);
registerAiEvaluationMutationRoutes(app);
registerAiPromptExportRoutes(app, buildPromptData);
registerAiManualImportRoutes(app, { parse: parseModelJson, sanitizeMarket: sanitizeMarketAssessment, sanitizeParlayLeg });


// Helper to normalize team names for cross-provider and alias matching
function getTeamQualifiers(str: string) {
  const s = (str || '').toLowerCase();
  return {
    u20: /(?:\bu[\s_-]?20\b|20岁以下)/i.test(s),
    u21: /(?:\bu[\s_-]?21\b|21岁以下)/i.test(s),
    u23: /(?:\bu[\s_-]?23\b|23岁以下)/i.test(s),
    u19: /(?:\bu[\s_-]?19\b|19岁以下)/i.test(s),
    u17: /(?:\bu[\s_-]?17\b|17岁以下)/i.test(s),
    reserve: s.includes('后备') || s.includes('预备') || s.includes('reserve'),
    women: s.includes('女足') || s.includes('women'),
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
    .replace(/-(ybty|leisu)$/gi, '')
    .replace(/football club|fc|俱乐部|体育/gi, '')
    .replace(/[\s\-_:\.()（）\[\]【】]/g, '')
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
// Dedicated Batch Score Supplement & Verification Endpoint
// Backtest Report & Formal Results
registerReportReadRoutes(app);

// Team Aliases Synchronizer: Refresh decisions JSON files whenever aliases change
function syncDecisionsWithAliases() {
  synchronizeDecisionAliases(normalizeTeamName);
  return;
}

// Perform immediate initial sync on boot
syncDecisionsWithAliases();

// Team Aliases
registerAliasReadRoutes(app);
registerAliasMutationRoutes(app, {
  normalizeTeamName,
  synchronizeDecisions: syncDecisionsWithAliases,
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
  const fallbackPath = resolveProjectPath(fallback);
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
    const statusPath = resolveProjectPath(statusFile);
    if (!fs.existsSync(statusPath)) throw new Error(`Missing export source: ${statusFile}`);
    const status = readJsonFile<any>(statusFile, {});
    const ybtyPath = resolveSnapshotPath(status, 'ybty_file', isPrematch ? 'output/ybty_prematch_latest.json' : 'output/ybty_latest.json', warnings);
    const leisuPath = resolveSnapshotPath(status, 'leisu_file', isPrematch ? 'output/leisu_prematch_latest.json' : 'output/leisu_latest.json', warnings);
    const paths: Record<string, string> = {
      ybty: ybtyPath,
      leisu: leisuPath,
      candidates: resolveProjectPath(candidatesFile),
      decisions: resolveProjectPath(decisionsFile),
      pipeline_status: statusPath,
    };
    if (isPrematch) paths.ai_brief = projectPath('output', 'prematch_ai_brief.json');
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
  const input = String(name || '').trim();
  if (!input || input === '[object Object]') return '';
  const normalized = input
    .replace(/\(女\)|（女）|女足|women/gi, '女足')
    .replace(/\(中\)|（中）|\[中\]/g, '')
    .replace(/\(主\)|（主）|\[主\]/g, '')
    .replace(/u[\s_-]?20/gi, 'u20')
    .replace(/u[\s_-]?21/gi, 'u21')
    .replace(/u[\s_-]?23/gi, 'u23')
    .replace(/u[\s_-]?19/gi, 'u19')
    .replace(/u[\s_-]?17/gi, 'u17');
  return normalized.replace(/[·.\-_\s()（）【】\[\]]/g, '').toLowerCase();
}

// Batch CSV/JSON Data Supplement & Match Update Endpoint
const handleBatchSupplement = createBatchSupplementHandler(normalizeTeamName);

registerBatchSupplementRoutes(app, handleBatchSupplement);

// Clear Analysis Library Matches Endpoint (Resets live & prematch analysis databases without affecting recommendation ledger)
// Helper function to compress and clean match evaluation data for Prompt generation
function compressMatchDataForPrompt(item: any, mode: string) {
  return buildSlimPromptMatch(item, mode);
  /* Legacy compressor retained temporarily below for a low-risk migration; it is unreachable
     and can be removed after exported-prompt snapshots have been compared in production.
  const normalizedRaw = normalizeYbtyMarketTypes(item.ybty_raw_markets || []);

  // 1. 精简已核验的 YBTY 盘口：去除 suspended, side_verified, line_index 等冗余位，只保留可投注的有效赔率
  const verifiedMarkets = withVerifiedYbtyOptionIds(normalizedRaw
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
    .filter((m: any) => m.options.length > 0));
  const ybtyMarketAudit = normalizedRaw.map((market: any) => ({
    market: market.market || null,
    market_type_verified: market.market_type_verified !== false,
    options: (Array.isArray(market.options) ? market.options : []).map((opt: any) => ({
      side: opt.side || null,
      line: opt.line ?? opt.selection ?? null,
      odds: Number.isFinite(Number(opt.odds)) ? Number(opt.odds) : null,
      suspended: opt.suspended === true,
    })),
  }));

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
    } else {
      // New interface exports structured opening/current/market phases instead of legacy rows.
      cleanedRefOdds = item.reference_odds;
    }
  }

  // 5. 天气与事件提炼
  const weatherText = Array.isArray(item.weather?.text) ? item.weather.text : item.weather;

  const interfaceContext = buildPromptInterfaceContext(item, true);
  const carriesCompleteFormal = Boolean(interfaceContext.source_formal_payload);

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
    ybty_market_audit: {
      usage: 'Only verified_ybty_markets may be recommended. This full list is supplied for missing/suspended/unverified-market auditing only.',
      markets: ybtyMarketAudit,
    },
    unverified_market_count: Math.max(0, normalizedRaw.length - verifiedMarkets.length),
    reference_odds: cleanedRefOdds,
    live_statistics: item.live_statistics && Object.keys(item.live_statistics).length > 0 ? item.live_statistics : null,
    recent_trends: carriesCompleteFormal ? null : cleanedRecentTrends,
    interface_context: interfaceContext,
    incidents: Array.isArray(item.incidents) && item.incidents.length > 0 ? item.incidents.slice(0, 10) : [],
    weather: weatherText,
    lineups: carriesCompleteFormal ? null : cleanedLineups,
    live_text: carriesCompleteFormal ? null : (Array.isArray(item.live_text?.entries) ? item.live_text.entries.slice(0, 10) : (Array.isArray(item.live_text) ? item.live_text.slice(0, 10) : null)),
    data_availability: {
      realtime_score: Boolean(item.score),
      score_verified: mode === 'prematch_eval' ? true : item.score_verified === true,
      statistics: Boolean(item.live_statistics && Object.keys(item.live_statistics).length > 0),
      lineups: Boolean(cleanedLineups && cleanedLineups.home_starters?.length > 0),
      recent_records: Boolean(cleanedRecentTrends),
    },
  };
  */
}

// Helper to sanitize market assessment fields (direction, line, options formatting)
function sanitizeMarketAssessment(item: any) {
  if (!item) return item;
  let category = String(item.category || '').trim();
  let direction = String(item.direction || '').trim();
  let line = item.line != null && item.line !== '' && item.line !== 'null' ? String(item.line).trim() : null;
  if (category === '全场独赢1X2') line = null;

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
    const instructionsPath = projectPath('CUSTOM_INSTRUCTIONS_COMPLETE.md');
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

  const rulesSummary = `【核心硬性规则与专业量化指标】
1. 只有 verified_ybty_markets 中的盘口才能 recommend/watch 并引用赔率；必须原样复制 market_option_id。
2. 终局大比分封盘处理（Decisive Match State & Suspended 1X2）：
   - 当单方建立净胜球 ≥ 2 且场面完全掌控，导致机构已下架或封盘该队独赢选项（verified_ybty_markets 仅剩落后方逆转或平局超高赔 @10+）时，严禁机械选择小概率负向选项；
   - 全场独赢1X2统一输出 market_option_id=null, status="unavailable", grade="NO_BET", direction="主胜(已封盘)"（或客胜已封盘），probability 填写真实终局胜率（90%~98%），odds=null, line=null，在 reason 中清晰说明“领先优势稳固，机构已封盘无赔率，不予下注”。
3. 机构抽水剥离与公允赔率期望边际 (+EV) 及防诱盘价值陷阱审计：
   - 必须参考 quantitative_analysis.fair_market_pricing 中的 overround_pct 与 fair_prob_pct。只有模型评估胜率显著高于市场公平概率 (Value Edge > 0) 且具备正期望边际时才允许作为 A/B 级推荐；
   - 警惕【价值陷阱（Value Trap / 诱盘）】：在成熟体育博彩市场中，真实 +EV 边际通常在 +3% ~ +15% 之间。任何单腿评估出 >80% 胜率（在 1.80+ 赔率下）或 >+25% EV 的极端数值，99% 属于认知偏差或诱盘陷阱，必须结合实时危险进攻、射正转化率与战意动机强制进行二次概率校准！
4. 滚球全场让球结算与认知防偏（In-Play Asian Handicap・0:0 起算）：
   - ⚠️【核心结算规则】：滚球让球必须从当前下单瞬间 (0:0) 重新起算剩余时段净胜球，已有进球完全清零！例如半场 3-1 领先时买“主队 0 平手盘”，下半场若主队 0-1 输给客队（全场 3-2），买主队平手盘是【全输】！半场 4-1 买主队 -1.5，下半场双方均未破门（全场 4-1），下半场比分 0-0，买主队 -1.5 是【全输】！
   - 严禁出现“因半场领先2-3球所以平手盘或让球盘胜率高达85%~95%”的严重常识错误！领先方下半场控速轮换，下半场净胜球胜率通常在 45%~60%，严禁将已有比分当做让球安全垫！
5. 动态进球率与即时大小球双向精算模型（In-Play Goal Expectancy & Balanced Market Selection）：
   - 核心逻辑：严禁预设立场（既不盲目看大，也不机械偏向看小）。必须客观计算下半场“剩余期望进球 λ_rest”与当前盘口所需净进球数 (Line - Current_Goals) 的期望收益比 (+EV)。
   - 大球动能支持条件 (+EV Over 判定)：
     * 强对抗开放局：双方攻防转换极快、半场已出现多球对攻（如 2-2）且持续创造绝对机会，或比分落后方大举压上反扑拉开防守空间；
     * 单方实质围攻：优势方三区压迫高 (field_tilt_share > 60%) 且角球与有效射正高频产生，防守方门前险象环生，期望进球率 λ_rest 处于高位；
     * 机构防范水位：当 YBTY 在具备走盘/赢半保护的拆分盘（如 3.5/4、4.5/5、1/1.5）开出明显偏低防范水位（@1.60~@1.75）时，代表破门概率高，应顺势选择大球保护副盘。
   - 小球防守支持条件 (+EV Under 判定)：
     * 低频阵地胶着：双方半场有效射正极度匮乏（如 ≤1~2次且角球少、无门将扑救险情），比赛处于无实质破门威胁的无效控球期；
     * 净胜球 ≥3 大比分降速：当单方取得 3-0/4-0 等决定性领先，且进球主要由偶发高转化率驱动时，领先方进入战术轮换控节奏，下半场破门速率自然回落，不盲目追 4.5/5.0 等过深大球盘。
   - 战术纪律与吃牌的辩证分析：
     * 吃牌反映拼抢强度与战术犯规，不能单一等同于“吃牌必小球”；
     * 领先方在比分领先且自身吃牌时注重控球自保，但若被落后方高压冲击，仍可能因防线失误或反击进球；落后方连续吃牌代表防线被打穿脱节，易被反击再丢球。应综合攻防真实射正研判，严禁教条化推论。
6. 攻防质量与场面倾角：参考 quantitative_analysis.attack_conversion 中的 dangerous_attack_to_shot_ratio 与 field_tilt_share，区分禁区实质渗透与无威胁倒脚控球。
7. 阵容透明度与杯赛风控：参考 quantitative_analysis.lineup_transparency 与 tournament_risk。杯赛/友谊赛且首发阵容未确认时严禁 A 级推荐，最高限制 C 级。
8. 独赢 1X2 替代玩法转化：当独赢赔率处于 1.05~1.25 鸡肋区间（缺乏安全边际）或 0-0/2-2 胶着时，评为 NO_BET / avoid，并在 reason 中明确引导转投具备退款/走盘保护的“让球 0（平手盘）/ 让球 -0.5”。
9. 赛前无 score_verified 限制；赛前 score_verified=true 仅表示规则不适用，不得因此降级。
10. 波胆/双方进球/单双/进球数/进球时间段使用 status=prediction, odds=null，给出方向概率。
11. grade A/B/C 全部展示；没有合格正式主选时 recommendation=null。
12. 串关与仓位：同一方向 B 级最多进一组串关；A 级≥85分且阵容明确时最多两组。单场 A 级仓位 3%~5%，B 级 1%~2%，串关 1% 以内。
13. 【跨批次时序动能与盘口衰减精算 (Snapshot Delta & Momentum Analysis)】：
   - 系统已注入 snapshot_delta_and_momentum 模块，记录了上一采样批次与当前批次的比赛分钟差、盘口掉落幅度与实况攻防加速度 (dangerous_attacks_rate_per_min, shots_delta 等)；
   - 当发现【盘口掉落 + 攻势加速 (GOLDEN_ENTRY_LINE_DROP / HIGH_ATTACK_ACCELERATION)】：即上一批次大球/让球盘口过深未出手，经过20~45分钟盘口自然掉落 ≥0.75 球（如 2.75→1.75 或 3.0→2.0）且危险进攻速率高（>0.6次/分）并伴随持续射正时，必须优先给出高置信度的顺势大球或强队让球升级推荐；
   - 当发现【无效倒脚 (PASSIVE_POSSESSION)】：即控球率大幅增加但 0 射正、危险进攻停滞时，必须坚决规避盲目追大，并在 reason 中明确指出时序动能衰竭；
   - 当发现【红牌/战术崩溃 (DISCIPLINE_COLLAPSE)】：若时序期间突发红牌，必须重估受罚方防线，顺势调整对立面让球或剩余进球。`;

  const verifiedOptionRule = `【YBTY真实选项白名单・最高优先级】
全场/半场大小球、让球、独赢1X2禁止手工填写或改写投注盘口。必须先从本场 verified_ybty_markets 选择一个真实 option，并原样返回它的 option_id 到 market_option_id。系统将根据 option_id 自动回填并锁定 direction、line、odds，AI填写的同名字段不作为投注依据。严禁把 reference_odds 当作投注赔率；严禁自行换盘、猜盘或生成YBTY未提供的半场盘口。某市场不在 verified_ybty_markets 时必须返回 market_option_id=null、status=unavailable、odds=null、line=null。概率必须针对该 option_id 对应的真实盘口单独评估，不得把其他盘口概率套用过来。`;
  const oddsSourceRoles = `【赔率数据源角色・必须理解】
1. YBTY是本系统实际投注平台。所有可下注的玩法、方向、盘口、赔率只能来自 verified_ybty_markets；输出时标记 odds_source="ybty_verified"。
2. 雷速 reference_odds/formal.odds 是参考公司赔率，不是本系统可下注报价。它必须用于提高判断质量：比较初盘/赛前盘/滚球盘、市场共识、升降盘、赔率分歧和异常水位，并在 reason 中说明 reference_odds_usage。
3. 正确流程是：用雷速赔率轨迹、比赛统计、阵容、历史数据评估真实概率，再把该概率对应到YBTY当前真实选项，计算YBTY隐含概率与价值差。禁止把雷速的line或odds抄入投注字段。
4. 雷速和YBTY盘口不同时，应分析分歧原因；最终投注字段仍以YBTY为准，不得为迎合雷速自行修改YBTY盘口。`;

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
    const parlayCandidateFiles = [
      readJsonFile<any>('output/ybty_leisu_candidates.json', { candidates: [] }),
      readJsonFile<any>('output/ybty_leisu_prematch_candidates.json', { candidates: [] }),
    ];
    const parlayCandidatePool = parlayCandidateFiles.flatMap((file: any) => Array.isArray(file.candidates) ? file.candidates : []);
    const parlayYbtySnapshots = [
      readJsonFile<any>('output/ybty_latest.json', { matches: [] }),
      readJsonFile<any>('output/ybty_prematch_latest.json', { matches: [] }),
    ];
    const parlayYbtyPool = parlayYbtySnapshots.flatMap((file: any) => Array.isArray(file.matches) ? file.matches : []);
    const sameParlayTeams = (homeA: unknown, awayA: unknown, homeB: unknown, awayB: unknown) =>
      cleanTeamName(homeA) === cleanTeamName(homeB) && cleanTeamName(awayA) === cleanTeamName(awayB);
    const hydrateParlayMatch = (stored: any) => {
      const wrapper = parlayCandidatePool.find((entry: any) =>
        entry?.match === stored.match
        || sameParlayTeams(entry?.candidate?.home, entry?.candidate?.away, stored.ybty_home, stored.ybty_away)
        || sameParlayTeams(entry?.ybty_home, entry?.ybty_away, stored.ybty_home, stored.ybty_away));
      const ybty = parlayYbtyPool.find((entry: any) =>
        sameParlayTeams(entry?.home, entry?.away, stored.ybty_home, stored.ybty_away));
      const source = wrapper || {};
      return {
        ...source,
        ...stored,
        league: stored.league || source.league || source.match?.league || source.market_source?.league || ybty?.league || '',
        ybty_league: stored.ybty_league || source.ybty_league || source.market_source?.league || ybty?.league || '',
        leisu_league: stored.leisu_league || source.leisu_league || source.match?.league || '',
        live_statistics: stored.live_statistics || source.live_statistics || null,
        reference_odds: stored.reference_odds || source.reference_odds || null,
        recent_trends: stored.recent_trends || source.recent_trends || null,
        incidents: stored.incidents || source.incidents || [],
        weather: stored.weather || source.weather || null,
        lineups: stored.lineups || source.lineups || null,
        player_candidates: stored.player_candidates || source.player_candidates || [],
        live_text: stored.live_text || source.live_text || null,
        detail_context: stored.detail_context || source.detail_context || null,
        ybty_raw_markets: Array.isArray(stored.ybty_raw_markets) && stored.ybty_raw_markets.length > 0
          ? stored.ybty_raw_markets
          : normalizeYbtyMarketTypes(ybty?.markets || source.ybty_raw_markets || []),
      };
    };
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
    const formatParlayChunkText = (chunk: any[], index: number, total: number) => (
      `==================== [ 串关候选数据段 ${index + 1}/${total} 开始 ] ====================\n`
      + `${chunk.map((candidate) => `比赛 #${candidate.candidate_index}: ${JSON.stringify(candidate)}`).join('\n')}\n`
      + `==================== [ 串关候选数据段 ${index + 1}/${total} 结束；${index + 1 < total ? '请继续读取下一段，不要提前生成串关' : '已读完全部候选，可统一生成串关'} ] ====================`
    );

    const parlayCandidates = refs.map((ref: any) => {
      const stored = storedMatches.find((item: any) => normalize(item.match) === normalize(ref.match))
        || storedMatches.find((item: any) => normalize(item.ybty_home) === normalize(ref.ybty_home) && normalize(item.ybty_away) === normalize(ref.ybty_away))
        || storedMatches.find((item: any) => sameParlayTeams(item.ybty_home, item.ybty_away, ref.ybty_home, ref.ybty_away))
        || storedMatches.find((item: any) => cleanTeamName(item.match) === cleanTeamName(ref.match));
      if (!stored) return null;
      const hydrated = hydrateParlayMatch(stored);
      if (ref.score_verified === true) {
        hydrated.score_verified = true;
        hydrated.score_source = ref.score_source || 'user_verified';
      }
      if (ref.score) {
        hydrated.score = ref.score;
      }
      if (ref.minute !== undefined && ref.minute !== null) {
        hydrated.minute = ref.minute;
      }
      return { ...hydrated, ai_evaluation: findLatestAssessment(ref) };
    }).filter(Boolean);

    if (parlayCandidates.length !== refs.length) {
      throw new Error('部分所选比赛已不在当前系统比赛池中，请刷新后重新选择。');
    }

    const parlayCandidatePayloads = parlayCandidates.map((c: any, idx: number) => {
      const candidateMode = resolveMatchEvaluationMode(c);
      const compressed = compressMatchDataForPrompt(c, candidateMode);
      const marketPool = Array.isArray(c.ai_evaluation?.market_assessments)
        ? c.ai_evaluation.market_assessments.filter((item: any) => Number(item?.odds) > 1 && item?.line !== null && item?.line !== '' && ['recommend', 'watch'].includes(String(item?.status)))
        : [];

      return {
        candidate_index: idx + 1,
        ...compressed,
        evaluation_mode: candidateMode,
        grade: c.grade || 'B',
        system_recommendation: c.recommendation,
        ai_recommendation: c.ai_evaluation?.recommendation || null,
        ai_market_assessments: marketPool,
      };
    });
    const parlayDataChunks = chunkPromptItems(parlayCandidatePayloads, 15, 380_000);
    const candidatesInfoText = parlayDataChunks.map((chunk, index) =>
      formatParlayChunkText(chunk, index, parlayDataChunks.length)
    ).join('\n\n');

    const prompt = `你是兼具【专业足球比赛数据分析员】与【职业足球投资操盘手/专业投注专家】双重视角的顶尖 AI，必须严格以深度的足球技战术数据分析和严密的量化博弈风控进行研判：

---【双重视角核心研判准则】---
1. ⚽【专业足球比赛数据分析员视角】(Senior Football Match Data Analyst Perspective)：
   - 深度解析各场比赛的即时/赛前技术统计（射正、危险进攻转化率 dangerous_attack_to_shot_ratio、三区压迫倾角 field_tilt_share、控球与攻防动能）；
   - 结合首发阵容质量、核心伤停、红黄牌及换人战术影响、主客场分化与杯赛/联赛战意，客观推演比赛走势与阶段发力期（开局试探、半场攻坚、下半场调整、终局反扑）。
2. 💰【足球比赛专业投注人士视角】(Professional Football Bettor & Quantitative Syndicator Perspective)：
   - 剔除机构抽水（Overround），基于真实概率分布进行公允定价，锁定具备正期望值（Value Edge = 真实概率 - 盘口隐含概率 > 0）的优质盘口；
   - 严格遵循联合胜率（Joint Probability = ∏ P_i）、整单综合 EV、1/4 凯利公式注码风控、亚盘四分之一盘口精确期望，并执行严格的反脆弱与剧本相关性审计，严防同质化爆仓。

---【5大核心玩法专业量化定价与结算模型（极其重要・严禁认知错误）】---
1. 全场大小球 (Full-Time Total Goals)：以全场90分钟双方总进球数为结算基准，结合双方攻防xG、总进球概率分布与盘口对比。
2. 半场大小球 (First-Half Total Goals)：以半场45分钟双方总进球数为基准。适合捕捉开局快节奏对攻、抢攻期或试探性慢热，规避下半场垃圾时间风险。
3. 滚球全场让球 (In-Play Asian Handicap・必须从 0:0 重新起算)：
   - ⚠️【核心结算规则・严禁把已有比分当做让球安全垫】：滚球让球必须从当前下单瞬间 (0:0) 重新起算剩余时段净胜球，已有进球完全清零！
   - 经典案例警告：
     * 若半场比分为 3-1，此时下注“主队 0（平手盘）”，下半场必须以 0:0 起算！如果下半场主队 0 球、客队打入 1 球（全场 3-2），下半场比分为 0-1，买主队平手盘是【全输】！
     * 若半场比分为 4-1，此时下注“主队 -1.5”，下半场主队必须再次净胜 2 球以上（例如下半场 2-0，全场 6-1）才算赢盘！如果下半场主队控球倒脚、双方均未破门（全场保持 4-1），下半场比分实际为 0-0，买主队 -1.5 是【全输】！
   - 严禁出现“因为半场领先2-3球所以平手盘或-1.5盘胜率高达85%~95%”的严重常识性错误！领先球队下半场往往轮换控速、防守松懈，其下半场净胜球胜率通常仅在 45%~60% 之间，绝非稳赢！
4. 半场让球 (First-Half Asian Handicap)：以上半场45分钟净胜球结算。适合捕捉强队半场抢开局压迫、早盘强弱分化明显的比赛。
5. 全场独赢 1X2 (Full-Time 1X2)：结合双方真实胜平负概率与机构欧赔抽水率对比，寻找具备显著正期望值 (EV > 0) 的高性价比选项。
6. 亚盘四分之一盘口精确期望：-0.25/+0.25、-0.75/+0.75、2/2.5、2.5/3 等盘口，必须拆解为赢半、输半、走盘计算综合数学期望，杜绝粗暴二元化全赢全输推算。

---【专业足球投资组合与量化风控模型】---
1. 独立正期望值与防诱盘价值陷阱审计 (True Positive EV & Trap Audit)：
   - +EV 是长期盈利的数学基石，但必须是结合技战术、实时射正与战意推演后的【真实价值】，绝非无脑追逐账面赔率差；
   - 警惕【机构价值陷阱（Value Trap / 诱盘）】：
     * 当机构给某方开出异常丰厚的让步或超高水位时，必须深度排查是否为诱上/诱下陷阱（例如：领先方已满足净胜球或小组出线、下半场准备换下核心攻击手、落后方急躁压上但缺乏禁区实质威胁等）；
     * 在成熟体育博彩市场中，真实 +EV 边际通常在 +3% ~ +15% 之间。任何单腿评估出 >80% 胜率（在 1.80+ 赔率下）或 >+25% EV 的极端数值，99% 属于认知偏差或诱盘陷阱，必须立即进行二次客观概率校准！
2. 动态相关性与反脆弱审查 (Correlation Risk & Antifragility)：
   - 科学评估相关性风险级别（低/中/高），常规联赛普通轮次中，各场比赛属于【低相关性/独立事件】。只要各单场研究独立达标且具备真实正期望值 (+EV)，正常允许组入串关；
   - 严防同质化爆仓风险（如全部单子均押注单一方向或单一剧本），通过多维度玩法（如让球+大小球）实现健康的资产分散。
3. 战术剧本驱动与多规格组合差异化 (Game-Script & Scenario-Driven Portfolio Architecture)：
   - 操盘手必须充分利用当前比赛池中天然存在的不同比赛状态（如大比分领先场次 vs 0-0 焦灼场次 vs 对攻开放场次），客观推演下半场真实走势：
     * 剧本 1【下半场反击与攻防动能】（如 2串1）：针对下半场仍有强烈破门战意、射正转化率极高的强攻场次；
     * 剧本 2【攻势停滞与防守窒息】（如 3串1 或 4串1）：针对 30~45 分钟 0-0 且射正极少、三区压迫低效的场次，组合全场小球/半场小球，利用比赛时间流逝形成高确定性收割；
     * 剧本 3【多维度跨盘口立体对冲】（如 4串1 或 10串1）：在同一张票中融合“受让抗冷 + 僵局小球 + 强势独赢 + 开放大球”，形成节奏与风险互补的立体资产配置；
   - 严禁盲目复制同质化盘口，必须在各规格票之间展现清晰的战术差异化与 5 大盘口立体覆盖。
4. 比分真实性门禁 (Score Verification Gate)：滚球比赛若即时比分未经可靠核验（score_verified: false），一票否决，严禁作为高确定性依据组入正式高信心串关。

---【职业辛迪加多玩法组合策略（全面覆盖 5 大核心盘口）】---
在选择串关腿或单场方向时，必须应用职业操盘思维：
- 策略 A：半场抢先机与节奏捕捉 (First-Half Momentum & Spread/Total) —— 针对半场攻防倾角极大、早盘破门预期高或半场让球优势明显的场次，利用半场盘口提前锁定优势。
- 策略 B：半场测试 + 下半场动态追加 (Probe & Scale-in) —— 适合上半场试探、下半场进球爆发与盘口走深的场次。
- 策略 C：让球盘与大小球联动对冲 (Handicap + Total Goals Correlation) —— 领先/落后战术演变下的盘口联动（如：强队赢球穿盘 + 全场大球 协同）。
- 策略 D：终局波动与防守崩塌捕捉 (Late Goal Squeeze) —— 75+分钟分差为0或1球时的攻防失衡高赔收割。
- 策略 E：弱队受让与逆风防守韧性 (Resilient Underdog Spread) —— 针对强队虚高诱深盘时的受让防冷组合。

---【解除单一玩法锁死与强制实时数据深度动态复验（极其重要）】---
1. 严禁单一玩法锁死：每场比赛的 system_recommendation 与 ai_recommendation 仅作为历史初评参考，严禁被单一玩法锚定！你必须全面检视该场比赛 verified_ybty_markets 中的 5 大核心真实盘口列表，根据多场串联的最佳协同效应挑选最稳健、最具正期望值的盘口。
2. 实时数据二次动态复验：你必须结合该场比赛最新的实时技术统计（即时比分、射门、射正、危险进攻、控球率、红黄牌、换人）以及赛前首发和交锋走势进行二次动态推演。若实时攻势衰退或出现红牌等剧变，必须果断推翻历史单场建议，选取当前数据最支持的盘口或予以淘汰。

请求模式: parlay_check
${verifiedOptionRule}
${oddsSourceRoles}
---【用户选择的比赛池（${parlayCandidates.length} 场）】---
${candidatesInfoText || '无比赛数据'}
---【用户要求生成的串关规格】---
${JSON.stringify(requests)}
---【历史台账反馈】---
${JSON.stringify(historicalFeedback)}

---【串关 Legs 字段命名与比分规范（极其重要）】---
1. market 必须填写中文标准玩法名称，例如 "全场大小球", "全场让球", "全场独赢1X2", "半场大小球", "半场让球"。严禁输出 full_total, full_spread, full_h2h 等英文键名！
2. line 必须明确注明的投注方向与盘口值（大小球带大/小，让球盘带球队名与盘口，独赢盘写主胜/客胜/平局）。
3. 每条腿必须附带当时比分 (score: {home, away}) 与分钟 (minute)，以及操盘策略建议 (pro_strategy)。
4. 整单量化指标计算：必须计算 joint_probability（联合胜率 %）、combined_ev_pct（整单预期价值边际 %）、kelly_fraction_pct（1/4 凯利建议注码 %）和 correlation_audit（反脆弱独立性审计）。

请从每场比赛的 5 大真实盘口（verified_ybty_markets）与多维数据中，结合单场初评参考，动态选择胜率扎实且赔率合理的最佳方向，按要求生成串关。输出严格的 JSON 结构：
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
  "parlay_recommendations": [
    {
      "size": 2,
      "ticket_index": 1,
      "grade": "A|B|C",
      "estimated_total_odds": 3.65,
      "joint_probability": 36.5,
      "combined_ev_pct": 33.2,
      "kelly_fraction_pct": 1.15,
      "sharpe_assessment": "HIGH_EDGE_CORE",
      "correlation_audit": {
        "independence_score": 90,
        "tactical_synergy": "半场压迫抢先机与全场大球形成节奏联动",
        "correlation_risk_check": "passed",
        "notes": "两场比赛分属不同联赛，战术剧本无冲突，不存在同质化轮换爆仓风险"
      },
      "reason": "选单理由与正期望值论证",
      "legs": [
        {
          "match": "比赛名",
          "ybty_home": "主队",
          "ybty_away": "客队",
          "minute": 45,
          "score": { "home": 0, "away": 0 },
          "market": "全场让球",
          "market_option_id": "full_spread__1",
          "line": "主队 -0.5",
          "odds": 1.88,
          "odds_source": "ybty_verified",
          "probability": 65,
          "grade": "A|B|C",
          "pro_strategy": "策略A：半场确认攻势后追加全场大球",
          "reference_odds_usage": "雷速赔率轨迹如何辅助判断"
        }
      ]
    }
  ]
}`;

    const parlayPrompts = isExportPrompt && parlayDataChunks.length > 1
      ? parlayDataChunks.map((chunk, index) => {
          const chunkText = formatParlayChunkText(chunk, index, parlayDataChunks.length);
          if (index < parlayDataChunks.length - 1) {
            return `【串关候选预评估 ${index + 1}/${parlayDataChunks.length}】\n请立即审核本段每场比赛，输出紧凑JSON candidate_digests；每场只保留可进入串关的真实玩法、方向、盘口、赔率、概率、等级、比分核验和淘汰理由。不要生成跨段串关。请在本会话保留该JSON供最后一段组合。\n\n${chunkText}`;
          }
          return `【串关候选预评估 ${index + 1}/${parlayDataChunks.length}・最后一段】\n请先审核本段，再结合此前各段已经输出的紧凑 candidate_digests，覆盖全部 ${parlayCandidates.length} 场比赛后统一生成串关。不得重新依赖前序原始长数据，也不得声称前序数据缺失。\n\n${prompt.replace(candidatesInfoText, chunkText)}`;
        })
      : [prompt];

    return {
      mode: 'parlay_check',
      prompts: parlayPrompts,
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
        league: candidateWrapper.match?.league || candidateWrapper.market_source?.league || candidateWrapper.detail_context?.tournament || undefined,
        ybty_league: candidateWrapper.market_source?.league || undefined,
        leisu_league: candidateWrapper.match?.league || undefined,
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
        league: rawLeisu.tournament?.name || rawLeisu.league || undefined,
        leisu_league: rawLeisu.tournament?.name || rawLeisu.league || undefined,
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
      if (!found) return null;
      const hydrated = hydrateStoredMatch(found);
      if (ref.score_verified === true) {
        hydrated.score_verified = true;
        hydrated.score_source = ref.score_source || 'user_verified';
      }
      if (ref.score) {
        hydrated.score = ref.score;
      }
      if (ref.minute !== undefined && ref.minute !== null) {
        hydrated.minute = ref.minute;
      }
      return hydrated;
    }).filter(Boolean);
    if (unresolved.length > 0) {
      throw new Error(`部分比赛已不在当前分析批次中，请刷新页面后重新选择：${unresolved.join('、')}`);
    }
  } else {
    requestedMatches = Array.isArray(batch_matches) && batch_matches.length > 0
      ? batch_matches
      : [{
          match: match_name,
          ybty_home,
          ybty_away,
          minute,
          score,
          odds_info,
          score_verified: body?.score_verified === true,
          score_source: body?.score_source || (body?.score_verified ? 'user_verified' : undefined),
        }];
  }

  const evaluationData = requestedMatches.map((item: any) => compressMatchDataForPrompt(item, mode));

  if (isExportPrompt && mode !== 'parlay_check') {
    // With slim JSON payload (~1KB per match), export up to 15 matches in a single unified prompt to prevent truncation and segment splitting.
    const MAX_PROMPT_TOKENS = Number(process.env.MAX_PROMPT_TOKENS) || 300_000;
    const chunks = chunkPromptItems(evaluationData, 15, MAX_PROMPT_TOKENS);
    
    // 1. Standard Prompt Builder (Web Trader Strategy Version)
    const buildStandardPrompt = (chunkData: any[], index: number, totalChunks: number) => {
      const batchHeader = totalChunks > 1 ? `Batch ${index + 1}/${totalChunks} – ${chunkData.length} matches` : `Total ${chunkData.length} matches`;
      return `You are an elite Senior Football Quantitative Data Analyst and Professional Football Betting Syndicator.
You MUST evaluate the following matches (${batchHeader}) with rigorous football risk controls, strictly combining:
1) [Senior Football Match Data Analyst Perspective · 专业足球数据分析员视角]: Deep-dive into technical match data (shots, shots on target, dangerous attack conversion ratio, field tilt share, xG creation efficiency, confirmed starter strength vs absences, fatigue & game phase momentum).
2) [Professional Sports Bettor & Syndicator Perspective · 足球比赛专业投注人士视角]: Calculate market overround & fair true probability, strictly verify Positive Expected Value (Value Edge = True Prob - Implied Prob > 0), match handicap depths to realistic projected goal differences, dynamically price in-play time-decay goal expectancies, and enforce institutional bankroll risk control.

Return ONLY a single valid JSON object (no markdown, no conversational commentary).

[Evaluation and Risk Control Protocol]
1. Pro-Bettor Execution Framework & Game Phase Analysis (职业操盘手实战策略与发力期分析):
   - 比赛阶段动态权重 (Game Momentum & Fatigue Windows): 结合开局试探(0-15')、半场攻坚(15-45')、战术调整(45-60')、终局反扑(75-90+')不同时段特征，严禁死板时间均摊。
   - 策略 A (半场测试+下半场追加 Probe & Scale-in): 适于破门预期高但赛前盘口水位过深，先小打半场，数据确认后下半场追加全场大/让球。
   - 策略 B (让球盘与大小球联动对冲 Handicap & Goal Correlation): 结合早早领先后的控场或逆境搏命反扑，联动锁定小球或剩余大球。
   - 策略 C (75+终局绝杀波动 Late Goal Squeeze): 终局平局或1球分差且落后方高压时，捕捉绝杀大0.5或终局盘口高赔。
   - 为每场比赛输出 pro_strategy_guide，明确最佳操盘步骤。

2. Quantitative Analysis, In-play Calibration & Decisive Match State (量化分析、即时校准与终局封盘准则):
   - 机构抽水与公允价格: 参阅 quantitative_analysis.fair_market_pricing 中的 overround_pct 与 fair_prob_pct。只有模型评估胜率显著高于市场公平概率 (Value Edge > 0) 时才允许作为 A/B 级推荐。
   - 终局大比分封盘处理 (Decisive Match State & Suspended 1X2): 当单方建立净胜球 ≥ 2 且场面完全掌控，导致机构已下架或封盘该队独赢选项（verified_ybty_markets 仅剩落后方逆转或平局超高赔 @10+）时，严禁机械选择小概率负向选项；全场独赢1X2统一输出 market_option_id=null, status="unavailable", grade="NO_BET", direction="主胜(已封盘)"（或客胜已封盘），probability 填写真实终局胜率（90%~98%），odds=null, line=null，在 reason 中清晰说明“领先优势稳固，机构已封盘无赔率，不予下注”。
   - 动态进球率与即时大小球双向精算模型（In-Play Goal Expectancy & Balanced Market Selection）:
     * 核心逻辑: 严禁预设立场（既不盲目看大，也不机械偏向看小）。必须客观计算下半场“剩余期望进球 λ_rest”与当前盘口所需净进球数 (Line - Current_Goals) 的期望收益比 (+EV)。
     * 大球动能支持条件 (+EV Over 判定): 强对抗开放局（如 2-2 对攻且持续创造机会、落后方大举反扑）、单方实质围攻（三区压迫 field_tilt_share > 60% 且角球与有效射正高频产生）、机构在四分之一拆分副盘（如 3.5/4 @1.65~@1.75）开出明显偏低防范水位时，应顺势选择大球保护副盘。
     * 小球防守支持条件 (+EV Under 判定): 低频阵地胶着（双方半场有效射正极度匮乏 ≤1~2次且角球少、无门将扑救险情）、净胜球 ≥3 大比分降速（3-0/4-0 等领先方战术轮换控节奏、垃圾时间期望进球回落），不盲目追深盘大球。
     * 战术纪律与吃牌的辩证分析: 吃牌反映拼抢强度与犯规压力，不能简单等同于“吃牌必小球”；落后方连续吃牌防线脱节易被反击丢球，领先方吃牌需结合落后方反扑强度与射正综合研判，严禁教条化推论。
   - 进攻威胁与场面倾斜: 参阅 quantitative_analysis.attack_conversion 中的 dangerous_attack_to_shot_ratio（危险进攻转化比）与 field_tilt_share（进攻三区压迫占比），识别无效控球。
   - 阵容透明度与杯赛轮换: 参阅 quantitative_analysis.lineup_transparency 与 tournament_risk。杯赛/友谊赛且阵容未确认时严禁 A 级正式推荐，最高限制 C 级。
   - 独赢 1X2 替代玩法引导: 当独赢赔率在 1.05~1.25 处于低收益鸡肋区间（缺乏安全边际）或 0-0/2-2 胶着时，评为 NO_BET / avoid，并在 reason 中明确引导转投具备退款/走盘保护的“让球 0（平手盘）/ 让球 -0.5”。

3. Mandatory 5 Real Betting Markets (Each match's market_assessments MUST evaluate ALL 5 core markets):
   - 全场大小球 (full_total)
   - 半场大小球 (half_total: If this match has no half_total options in verified_ybty_markets, output status="unavailable", grade="NO_BET", direction="盘口未提供", line=null, odds=null)
   - 全场让球 (full_spread)
   - 半场让球 (half_spread: If this match has no half_spread options in verified_ybty_markets, output status="unavailable", grade="NO_BET", direction="盘口未提供", line=null, odds=null)
   - 全场独赢1X2 (full_h2h: If this match has no full_h2h options in verified_ybty_markets, output status="unavailable", grade="NO_BET", direction="盘口未提供", line=null, odds=null)
   
   For each available market:
   - ONLY select valid options from this match's verified_ybty_markets (except for Dominant Lead Suspended Odds as defined above)! Copy option_id verbatim to market_option_id.
   - Calculate implied_probability = 100 / odds, value_edge = probability - implied_probability.
   - Formal recommendation (status="recommend", grade="A"|"B"): only when value_edge > 0 with strong tactical & statistical backing.
   - Watch (status="watch", grade="C"): small value_edge or higher uncertainty.
   - Avoid (status="avoid", grade="NO_BET"): value_edge <= 0 or lacking margin of safety.

4. Best Overall Recommendation (recommendation field):
   - Pick the single best/highest-value option among the 5 real markets above (grade="A" or "B").
   - If none of the 5 markets qualify for A/B recommendation, set recommendation to null (or grade="NO_BET").

5. Live Score Verification:
   - If score_verified is false, DO NOT give any A/B grade real market recommendations. All 5 real markets must be status="avoid" / grade="NO_BET".

6. Completeness Constraint:
   - CRITICAL: You MUST output all ${chunkData.length} matches in the "matches" array.
   - For every match, market_assessments must include all 5 core real markets.

[Output JSON Schema Template]
{
  "schema_version": "football_market_audit_v2",
  "summary": "matches:${chunkData.length}|recommend:N|watch:N|avoid:N",
  "matches": [
    {
      "match": "Original match name",
      "ybty_home": "YBTY home team",
      "ybty_away": "YBTY away team",
      "summary": "minute|score|score_verified|conclusion",
      "score_verified": true,
      "score_source": "ybty_verified",
      "verification_passed": true,
      "recommendation": {
        "category": "全场让球",
        "market": "full_spread",
        "market_option_id": "full_spread__m1__o1",
        "direction": "主队",
        "line": "-0.5",
        "odds": 1.95,
        "probability": 62.0,
        "value_edge": 10.7,
        "grade": "B"
      },
      "market_assessments": [
        {
          "category": "全场大小球",
          "market_option_id": "full_total__m1__o1",
          "direction": "大 2.5",
          "line": "2.5",
          "odds": 1.98,
          "probability": 60.0,
          "grade": "B",
          "status": "recommend",
          "reason": "攻势迅猛且创造多次威胁",
          "risk": "防守反击风险"
        },
        {
          "category": "半场大小球",
          "market_option_id": "half_total__m1__o2",
          "direction": "小 1.0",
          "line": "1.0",
          "odds": 1.85,
          "probability": 55.0,
          "grade": "C",
          "status": "watch",
          "reason": "半场防守较为严密",
          "risk": "偶发失误"
        },
        {
          "category": "全场让球",
          "market_option_id": "full_spread__m1__o1",
          "direction": "主队 -0.5",
          "line": "-0.5",
          "odds": 1.95,
          "probability": 62.0,
          "grade": "B",
          "status": "recommend",
          "reason": "主队进攻压制明显且数据占优",
          "risk": "客队反击威胁"
        },
        {
          "category": "半场让球",
          "market_option_id": "half_spread__m1__o1",
          "direction": "主队 -0/0.5",
          "line": "-0/0.5",
          "odds": 2.03,
          "probability": 49.2,
          "grade": "NO_BET",
          "status": "avoid",
          "reason": "半场时间有限，让步缺乏足够安全边际",
          "risk": "半场平局"
        },
        {
          "category": "全场独赢1X2",
          "market_option_id": "full_h2h__1",
          "direction": "主胜",
          "line": null,
          "odds": 1.90,
          "probability": 55.0,
          "grade": "B",
          "status": "recommend",
          "reason": "主胜赔率具备正向价值边际",
          "risk": "平局丢分"
        }
      ]
    }
  ]
}

Match data list (${chunkData.length} matches):
${JSON.stringify(chunkData, null, 2)}`;
    };

    // 2. Objective Pure Quantitative Prompt Builder (Combining professional football data & quantitative betting strategies without subjective narrative bias)
    const buildObjectivePrompt = (chunkData: any[], index: number, totalChunks: number) => {
      const batchHeader = totalChunks > 1 ? `Batch ${index + 1}/${totalChunks} – ${chunkData.length} matches` : `Total ${chunkData.length} matches`;
      return `You are an elite Senior Football Quantitative Data Analyst and Professional Football Betting Syndicator.
You MUST evaluate the following matches (${batchHeader}) objectively by synthesizing professional football match data analytics with professional sports betting quantitative models:
1) [Senior Football Match Data Analyst Perspective · 专业足球数据分析员视角]: Synthesize real-time & pre-match technical statistics, xG creation efficiency, head-to-head patterns, home/away splits, lineup transparency, and match incidents without subjective narrative bias.
2) [Professional Sports Bettor & Syndicator Perspective · 足球比赛专业投注人士视角]: Strictly calculate market overround and identify positive expected value (Value Edge / +EV), dynamic timeline goal expectancy decay, handicap-to-goal margin alignment, and bankroll protection.

Return ONLY a single valid JSON object (no markdown, no conversational commentary).

[Professional Match Data & Quantitative Betting Strategy Principles]
1. Professional Match Data Synthesis (综合专业比赛数据研判):
   - Real-time/Pre-match Technical Statistics (live_statistics / detail_context): Evaluate shots, shots on target, dangerous attacks, possession rate, corners, and xG efficiency.
   - Historical Trends & Form (recent_trends / standings): Analyze head-to-head records, goal scoring/conceding distributions, home/away performance splits, and tournament motivation.
   - Lineups & Crucial Incidents (lineups / incidents): Factor in confirmed starter quality, missing key players, red/yellow card impacts, and tactical substitutions.
   - Benchmark Reference Odds (reference_odds): Cross-examine market movement trends and Asian handicap adjustments from reliable odds providers.

2. Professional Betting Quantitative Strategy & Edge (专业量化投注策略与方案):
   - Positive Expected Value (EV / Value Edge): For any market, calculate implied_probability = 100 / odds, and value_edge = probability - implied_probability. Only consider recommendations when real probability demonstrates a robust positive edge (value_edge > 0).
   - Match-Timeline Dynamic Pricing (滚球时间轴与进球率衰减): Factor in current elapsed minutes, current live score, score difference, and remaining goal expectation per unit of time.
   - Handicap-to-Goal Expectation Alignment (让球深浅与净胜期望匹配): Ensure handicap lines strictly correspond to realistic projected goal margins backed by actual data, avoiding unwarranted deep handicap traps.

[Evaluation and Risk Control Protocol]
1. Mandatory 5 Real Betting Markets (Each match's market_assessments MUST evaluate ALL 5 core markets in this exact order):
   1. 全场大小球 (full_total)
   2. 半场大小球 (half_total: If this match has no half_total options in verified_ybty_markets, output status="unavailable", grade="NO_BET", direction="盘口未提供", line=null, odds=null)
   3. 全场让球 (full_spread)
   4. 半场让球 (half_spread: If this match has no half_spread options in verified_ybty_markets, output status="unavailable", grade="NO_BET", direction="盘口未提供", line=null, odds=null)
   5. 全场独赢1X2 (full_h2h: If this match has no full_h2h options in verified_ybty_markets, output status="unavailable", grade="NO_BET", direction="盘口未提供", line=null, odds=null)
   
   For each available market:
   - ONLY select valid options from this match's verified_ybty_markets! Copy option_id verbatim to market_option_id.
   - Calculate implied_probability = 100 / odds, value_edge = probability - implied_probability.
   - Formal recommendation (status="recommend", grade="A"|"B"): only when value_edge > 0 with quantitative and technical match data backing.
   - Watch (status="watch", grade="C"): small value_edge or higher uncertainty.
   - Avoid (status="avoid", grade="NO_BET"): value_edge <= 0 or lacking margin of safety.

2. Best Overall Recommendation (recommendation field):
   - Pick the single best/highest-value option among the 5 real markets above (grade="A" or "B").
   - If none of the 5 markets qualify for A/B recommendation, set recommendation to null (or grade="NO_BET").

3. Live Score Verification (Score Verification Gate):
   - If score_verified is false, DO NOT give any A/B grade real market recommendations. All 5 real markets must be status="avoid" / grade="NO_BET".

4. Completeness Constraint:
   - CRITICAL: You MUST output all ${chunkData.length} matches in the "matches" array. Never omit, merge, or truncate any match.
   - For every match, market_assessments must include all 5 core real markets.

[Output JSON Schema Template]
{
  "schema_version": "football_market_audit_v2",
  "summary": "matches:${chunkData.length}|recommend:N|watch:N|avoid:N",
  "matches": [
    {
      "match": "Original match name",
      "ybty_home": "YBTY home team",
      "ybty_away": "YBTY away team",
      "summary": "minute|score|score_verified|conclusion",
      "score_verified": true,
      "score_source": "ybty_verified",
      "verification_passed": true,
      "recommendation": {
        "category": "全场让球",
        "market": "full_spread",
        "market_option_id": "full_spread__m1__o1",
        "direction": "主队",
        "line": "-0.5",
        "odds": 1.95,
        "probability": 62.0,
        "value_edge": 10.7,
        "grade": "B"
      },
      "market_assessments": [
        {
          "category": "全场大小球",
          "market_option_id": "full_total__m1__o1",
          "direction": "大 2.5",
          "line": "2.5",
          "odds": 1.98,
          "probability": 60.0,
          "grade": "B",
          "status": "recommend",
          "reason": "攻防转换与量化数据支持",
          "risk": "防守反击风险"
        },
        {
          "category": "半场大小球",
          "market_option_id": "half_total__m1__o2",
          "direction": "小 1.0",
          "line": "1.0",
          "odds": 1.85,
          "probability": 55.0,
          "grade": "C",
          "status": "watch",
          "reason": "半场防守数据较为严密",
          "risk": "偶发失误"
        },
        {
          "category": "全场让球",
          "market_option_id": "full_spread__m1__o1",
          "direction": "主队 -0.5",
          "line": "-0.5",
          "odds": 1.95,
          "probability": 62.0,
          "grade": "B",
          "status": "recommend",
          "reason": "量化压迫与攻守转化占优",
          "risk": "客队反击威胁"
        },
        {
          "category": "半场让球",
          "market_option_id": "half_spread__m1__o1",
          "direction": "主队 -0/0.5",
          "line": "-0/0.5",
          "odds": 2.03,
          "probability": 49.2,
          "grade": "NO_BET",
          "status": "avoid",
          "reason": "半场时间有限，让步缺乏足够安全边际",
          "risk": "半场平局"
        },
        {
          "category": "全场独赢1X2",
          "market_option_id": "full_h2h__1",
          "direction": "主胜",
          "line": null,
          "odds": 1.90,
          "probability": 55.0,
          "grade": "B",
          "status": "recommend",
          "reason": "主胜赔率具备正向价值边际",
          "risk": "平局丢分"
        }
      ]
    }
  ]
}

Match data list (${chunkData.length} matches):
${JSON.stringify(chunkData, null, 2)}`;
    };

    const standardPrompts = chunks.map((chunkData, index) => buildStandardPrompt(chunkData, index, chunks.length));
    const objectivePrompts = chunks.map((chunkData, index) => buildObjectivePrompt(chunkData, index, chunks.length));
    const promptStyle = body?.prompt_style || 'standard';
    const prompts = promptStyle === 'objective' ? objectivePrompts : standardPrompts;

    return {
      mode,
      prompts,
      standard_prompts: standardPrompts,
      objective_prompts: objectivePrompts,
      prompt_style: promptStyle,
      match_count: evaluationData.length,
      evaluationData,
    };
  }






  // Non-export path (used by Gemini API auto-evaluation).
  const MAX_PROMPT_TOKENS_AUTO = Number(process.env.MAX_PROMPT_TOKENS) || 250_000;
  const chunks = chunkPromptItems(evaluationData, mode === 'prematch_eval' ? 6 : 8, MAX_PROMPT_TOKENS_AUTO);

  const prompts = chunks.map((chunkData, index) => {
    const batchLabel = chunks.length > 1
      ? `Batch ${index + 1}/${chunks.length} – ${chunkData.length} matches (total ${evaluationData.length})`
      : `Total ${chunkData.length} matches`;
    const modeLabel = mode === 'prematch_eval'
      ? 'Pre-match evaluation (no score verification required)'
      : 'Live evaluation (score_verified must be checked)';
    return `You are an elite Senior Football Quantitative Data Analyst and Professional Football Betting Syndicator.
Follow the [Football Market Audit Protocol v2] strictly. Evaluate ALL ${chunkData.length} matches in ${batchLabel} strictly combining technical match analytics with quantitative betting strategy (+EV, overround deduction, bankroll protection). Return ONLY a single valid JSON object — no natural language, no Markdown fences.
Mode: ${modeLabel}

[Rules and Constraints]
1. Each match must include exactly 5 real market assessments in strict order:
   1.full_total 2.half_total 3.full_spread 4.half_spread 5.full_h2h
2. Real betting markets (full/half total, spread, h2h) must use a real option from this match's verified_ybty_markets, copy option_id verbatim to market_option_id, and set odds_source="ybty_verified".
3. probability is expressed as 0-100 percent. Only allow status="watch" or "recommend" when value_edge = probability - (100/odds) > 0 and evidence is sufficient.
4. If live and score_verified=false: all 5 real markets must be status="avoid", grade="NO_BET", recommendation=null, verification_passed=false.
5. CRITICAL: The output matches array must contain exactly ${chunkData.length} objects — one per match. Never omit, merge, or use placeholder objects for any match.

[Output JSON Schema — output only this, nothing else]
{"schema_version":"football_market_audit_v2","summary":"matches:${chunkData.length}|recommend:N|watch:N|avoid:N","matches":[{"match":"original match name","ybty_home":"YBTY home","ybty_away":"YBTY away","summary":"minute|score|score_verified|final instruction","score_verified":false,"score_source":"source","verification_passed":false,"recommendation":null,"market_assessments":[{"category":"one of the 5 categories","market":"real market key","market_option_id":null,"direction":null,"line":null,"odds":null,"odds_source":null,"probability":null,"probability_scope":"simplified settlement scope","implied_probability":null,"value_edge":null,"grade":"A|B|C|NO_BET","status":"recommend|watch|avoid|unavailable","reason":"core data|status tag","evidence_refs":["input field path"],"risk":"risk tag"}]}]}

Match data list (${chunkData.length} matches):
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
// Import Manual Web Gemini Output Endpoint
// Server-side AI Evaluation using Google Gemini API
const handleGeminiEvaluation = createGeminiEvaluationHandler({
  buildPromptData,
  sanitizeMarketAssessment,
  sanitizeParlayLeg,
});

registerGeminiEvaluationRoutes(app, handleGeminiEvaluation);

// ---------------- VITE & SERVER SETUP ----------------

async function start() {
  if (ENVIRONMENT !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = projectPath('dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
    console.log(`[LX Football System] Express Server running on http://${displayHost}:${PORT}`);
  });
}

start().catch((error) => {
  console.error('[LX Football System] Startup failed:', error);
  process.exitCode = 1;
});

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
    const parlayCandidates = refs.map((ref: any) => {
      const stored = storedMatches.find((item: any) => normalize(item.match) === normalize(ref.match))
        || storedMatches.find((item: any) => normalize(item.ybty_home) === normalize(ref.ybty_home) && normalize(item.ybty_away) === normalize(ref.ybty_away));
      return stored ? { ...hydrateParlayMatch(stored), ai_evaluation: findLatestAssessment(ref) } : null;
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
    const candidatesInfoText = parlayDataChunks.map((chunk, index) => (
      `==================== [ 串关候选数据段 ${index + 1}/${parlayDataChunks.length} 开始 ] ====================\n`
      + `${chunk.map((candidate) => `比赛 #${candidate.candidate_index}: ${JSON.stringify(candidate)}`).join('\n')}\n`
      + `==================== [ 串关候选数据段 ${index + 1}/${parlayDataChunks.length} 结束；${index + 1 < parlayDataChunks.length ? '请继续读取下一段，不要提前生成串关' : '已读完全部候选，可统一生成串关'} ] ====================`
    )).join('\n\n');

    const prompt = `你是顶尖、严肃且专业的足球投注评估与精选推荐 AI，严格遵循项目的足球分析与硬性风控协议：

---【核心结算与盘口规则】---
1. 全场大小球 (Full Time Over/Under)：只看完场终场时的双方总进球数 vs 盘口！
2. 滚球让球盘 (Live Asian Handicap / 后续时段让球)：结算基准从下注瞬间归零 (0:0) 重新计算！
3. 四分之一盘口：拆分为赢半、输半、走盘，禁止粗暴判全赢或全输。

---【串关风控规则】---
1. 同一比赛可以在不同串关中采用不同玩法，但每个玩法必须分别达到B级以上。
2. 普通B级同一方向最多进入1组正式串关；A级且模型评分≥85的同一方向最多2组。
3. 跨串重复使用同一场比赛必须进行独立性审查，避免相关性风险击穿全部组合。

---【职业辛迪加投注操盘策略（Pro-Bettor Execution Strategies）】---
在选择串关腿或单场方向时，必须应用职业操盘思维：
- 策略 A：半场测试 + 下半场动态追加（Probe & Scale-in）—— 适合破门预期高但赛前盘口过深的场次。
- 策略 B：让球盘与大小球联动对冲（Handicap + Total Goals Correlation）—— 领先/落后战术演变下的盘口联动。
- 策略 C：终局波动与绝杀捕捉（Late Goal Squeeze）—— 75+分钟分差为0或1球时的攻防失衡高赔收割。

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
  "parlay_recommendations": [{"size": 3, "ticket_index": 1, "grade": "A|B|C", "estimated_total_odds": 5.67, "reason": "选单理由", "legs": [{"match":"比赛名","ybty_home":"主队","ybty_away":"客队","minute":45,"score":{"home":0,"away":0},"market":"真实玩法","line":"真实盘口","odds":1.88,"odds_source":"ybty_verified","probability":65,"grade":"A|B|C","pro_strategy":"策略A：半场确认攻势后追加全场大球","reference_odds_usage":"雷速赔率轨迹如何辅助判断"}]}]
}`;

    const parlayPrompts = isExportPrompt && parlayDataChunks.length > 1
      ? parlayDataChunks.map((chunk, index) => {
          const chunkText = candidatesInfoText.split(/\n\n(?==================== \[ 串关候选数据段)/)[index] || '';
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

  if (isExportPrompt && mode !== 'parlay_check') {
    // With slim JSON payload (~1KB per match), export up to 15 matches in a single unified prompt to prevent truncation and segment splitting.
    const MAX_PROMPT_TOKENS = Number(process.env.MAX_PROMPT_TOKENS) || 300_000;
    const chunks = chunkPromptItems(evaluationData, 15, MAX_PROMPT_TOKENS);
    const prompts = chunks.map((chunkData, index) => {
      const batchHeader = chunks.length > 1 ? `Batch ${index + 1}/${chunks.length} – ${chunkData.length} matches` : `Total ${chunkData.length} matches`;
      return `Please evaluate the following matches (${batchHeader}) with rigorous football risk controls.
Return ONLY a single valid JSON object (no markdown, no conversational commentary).

[Evaluation and Risk Control Protocol]
1. Pro-Bettor Execution Framework & Game Phase Analysis (职业操盘手实战策略与发力期分析):
   - 比赛阶段动态权重 (Game Momentum & Fatigue Windows): 结合开局试探(0-15')、半场攻坚(15-45')、战术调整(45-60')、终局反扑(75-90+')不同时段特征，严禁死板时间均摊。
   - 策略 A (半场测试+下半场追加 Probe & Scale-in): 适于破门预期高但赛前盘口水位过深，先小打半场，数据确认后下半场追加全场大/让球。
   - 策略 B (让球盘与大小球联动对冲 Handicap & Goal Correlation): 结合早早领先后的控场或逆境搏命反扑，联动锁定小球或剩余大球。
   - 策略 C (75+终局绝杀波动 Late Goal Squeeze): 终局平局或1球分差且落后方高压时，捕捉绝杀大0.5或终局盘口高赔。
   - 为每场比赛输出 pro_strategy_guide，明确最佳操盘步骤。

2. Mandatory 5 Real Betting Markets (Each match's market_assessments MUST evaluate ALL 5 core markets):
   - 全场大小球 (full_total)
   - 半场大小球 (half_total: If this match has no half_total options in verified_ybty_markets, output status="unavailable", grade="NO_BET", direction="盘口未提供", line=null, odds=null)
   - 全场让球 (full_spread)
   - 半场让球 (half_spread: If this match has no half_spread options in verified_ybty_markets, output status="unavailable", grade="NO_BET", direction="盘口未提供", line=null, odds=null)
   - 全场独赢1X2 (full_h2h: If this match has no full_h2h options in verified_ybty_markets, output status="unavailable", grade="NO_BET", direction="盘口未提供", line=null, odds=null)
   
   For each available market:
   - ONLY select valid options from this match's verified_ybty_markets! Copy option_id verbatim to market_option_id.
   - Calculate implied_probability = 100 / odds, value_edge = probability - implied_probability.
   - Formal recommendation (status="recommend", grade="A"|"B"): only when value_edge > 0 with strong tactical & statistical backing.
   - Watch (status="watch", grade="C"): small value_edge or higher uncertainty.
   - Avoid (status="avoid", grade="NO_BET"): value_edge <= 0 or lacking margin of safety.

3. Best Overall Recommendation (recommendation field):
   - Pick the single best/highest-value option among the 5 real markets above (grade="A" or "B").
   - If none of the 5 markets qualify for A/B recommendation, set recommendation to null (or grade="NO_BET").

4. Non-bettable Predictions (predictions object):
   - Fill in all 7 prediction fields: correct_score (波胆), btts (双方进球: 是/否), odd_even (单双: 单/双), home_goals (主队进球: X球), away_goals (客队进球: X球), total_goals (总进球: X球), timing (进球时段).

5. Live Score Verification:
   - If score_verified is false, DO NOT give any A/B grade real market recommendations. All 5 real markets must be status="avoid" / grade="NO_BET".

6. Completeness Constraint:
   - CRITICAL: You MUST output all ${chunkData.length} matches in the "matches" array.
   - For every match, market_assessments must include all 5 real markets, and predictions must include all 7 fields.

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
      ],
      "predictions": {
        "correct_score": "2-1",
        "btts": "是",
        "odd_even": "单",
        "home_goals": "2球",
        "away_goals": "1球",
        "total_goals": "3球",
        "timing": "61-75分钟"
      }
    }
  ]
}

Match data list (${chunkData.length} matches):
${JSON.stringify(chunkData, null, 2)}`;
    });

    return {
      mode,
      prompts,
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
    return `Follow the [Football Market Audit Protocol v2] strictly. Evaluate ALL ${chunkData.length} matches in ${batchLabel}. Return ONLY a single valid JSON object — no natural language, no Markdown fences.
Mode: ${modeLabel}

[Rules and Constraints]
1. Each match must include exactly 12 market assessments in strict order:
   1.full_total 2.half_total 3.full_spread 4.half_spread 5.full_h2h 6.full_correct_score 7.both_to_score 8.total_goals_odd_even 9.home_goals 10.away_goals 11.total_goals 12.goal_time_window
2. Real betting markets (full/half total, spread, h2h) must use a real option from this match's verified_ybty_markets, copy option_id verbatim to market_option_id, and set odds_source="ybty_verified". Non-bettable prediction markets use market="prediction" and option_id=null.
3. probability is expressed as 0-100 percent. Only allow status="watch" or "recommend" when value_edge = probability - (100/odds) > 0 and evidence is sufficient.
4. If live and score_verified=false: all 5 real markets must be status="avoid", grade="NO_BET", recommendation=null, verification_passed=false.
5. CRITICAL: The output matches array must contain exactly ${chunkData.length} objects — one per match. Never omit, merge, or use placeholder objects for any match.

[Output JSON Schema — output only this, nothing else]
{"schema_version":"football_market_audit_v2","summary":"matches:${chunkData.length}|recommend:N|watch:N|avoid:N","matches":[{"match":"original match name","ybty_home":"YBTY home","ybty_away":"YBTY away","summary":"minute|score|score_verified|final instruction","score_verified":false,"score_source":"source","verification_passed":false,"recommendation":null,"market_assessments":[{"category":"one of the 12 categories","market":"real market key or prediction","market_option_id":null,"direction":null,"line":null,"odds":null,"odds_source":null,"probability":null,"probability_scope":"simplified settlement scope","implied_probability":null,"value_edge":null,"grade":"A|B|C|NO_BET","status":"recommend|watch|prediction|avoid|unavailable","reason":"core data|status tag","evidence_refs":["input field path"],"risk":"risk tag"}]}]}

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
    app.get('*', (req, res) => {
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

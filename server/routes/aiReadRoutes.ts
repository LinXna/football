import type express from 'express';
import crypto from 'crypto';
import { DATA_FILES } from '../dataFiles';
import { readJsonFile, writeJsonFile } from '../jsonStore';
import { normalizeParlayRecommendations } from '../services/parlayRecommendationNormalizer';
import { normalizeYbtyMarketTypes } from '../services/marketTypeNormalizer';
import { enforceLiveScoreVerification, validateAssessmentAgainstVerifiedMarkets } from '../services/verifiedMarketAssessment';
import { resolveScoreVerification } from '../services/scoreValidation';
import { normalizeMatchPredictionsAndAssessments } from '../services/marketAssessmentsNormalizer';

/** Read-only access to retained AI evaluation snapshots. */
export function registerAiReadRoutes(app: express.Express): void {
  app.get('/api/ai/evaluations', (_req, res) => {
    res.json({ evaluations: readJsonFile<any[]>(DATA_FILES.ai.evaluations, []) });
  });
}

/** AI evaluation history is diagnostic data only and never changes ledger statistics. */
export function registerAiEvaluationMutationRoutes(app: express.Express): void {
  const clear = (_req: express.Request, res: express.Response) => {
    try {
      if (!writeJsonFile(DATA_FILES.ai.evaluations, [])) {
        return res.status(500).json({ error: 'Failed to clear AI evaluation history' });
      }
      res.json({ success: true, message: 'AI evaluation history cleared' });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to clear AI evaluation history' });
    }
  };

  app.post('/api/ai/evaluations/clear', clear);
  app.delete('/api/ai/evaluations/clear', clear);
  app.delete('/api/ai/evaluations', clear);

  app.post('/api/ai/evaluations/save', (req, res) => {
    try {
      const { mode, scope, result, evaluated_matches } = req.body || {};
      const hasBatchResult = Array.isArray(result?.matches) && result.matches.length > 0;
      const hasSingleResult = result && typeof result === 'object' && (result.summary || result.recommendation || result.market_assessments);
      if (!hasBatchResult && !hasSingleResult) {
        return res.status(400).json({ error: 'No AI evaluation content to save' });
      }
      const history = readJsonFile<any[]>(DATA_FILES.ai.evaluations, []);
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
      if (!writeJsonFile(DATA_FILES.ai.evaluations, history)) {
        return res.status(500).json({ error: 'Failed to save AI evaluation history' });
      }
      res.json({ success: true, snapshot_id: snapshot.id, saved_at: snapshot.saved_at });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to save AI evaluation history' });
    }
  });
}

export function registerAiPromptExportRoutes(app: express.Express, buildPromptData: (body: any, isExportPrompt?: boolean) => any): void {
  app.post('/api/ai/export-prompt', (req, res) => {
    try {
      const promptData = buildPromptData(req.body, true);
      const rawPrompts = promptData.prompts;
      const segmentCount = rawPrompts.length;
      const matchManifest = Array.isArray(promptData.evaluationData)
        ? promptData.evaluationData.map((item: any) => item.match_info?.match || item.match || `${item.match_info?.ybty_home || item.ybty_home || ''} vs ${item.match_info?.ybty_away || item.ybty_away || ''}`)
        : [];
      const deliveryPrompts = promptData.mode === 'parlay_check' || segmentCount <= 1
        ? rawPrompts
        : rawPrompts.map((prompt: string, index: number) => index < segmentCount - 1
          ? `[Segment Evaluation ${index + 1}/${segmentCount}]\nPlease evaluate this segment fully and output the complete JSON for this segment. Do not respond with "Received". After output, retain this structured result in the conversation for the next segment; the final merge should use these smaller JSON results without re-reading the original long data.\n\n${prompt}\n\n[End of Segment Control · Highest Priority] Now output the full JSON for all matches in this segment, each must include the 12 market assessments. Verify markets against the YBTY whitelist provided above; do not output any line or odds outside the whitelist.`
          : `[Segment Evaluation ${index + 1}/${segmentCount} · Final Segment]\nFirst fully evaluate this segment; then merge the previously output JSON results from segments 1 to ${index} with the current segment results directly.\n\n${prompt}\n\n[Final Merge Control · Highest Priority]\nDo not re-summarize or use placeholder objects for prior results; retain the exact 12 market assessments for each prior match, then add the current segment results. The final output must contain exactly ${promptData.match_count} matches objects, covering: ${JSON.stringify(matchManifest)}. Any match with fewer than 12 market assessments is considered incomplete. Output a single valid merged JSON.`);
      const combinedPrompt = segmentCount > 1
        ? `[Segment Reading Instruction]\nThe following ${segmentCount} data segments belong to the same evaluation task. Please read them in order from segment 1 to ${segmentCount}; do not answer prematurely when you see "Next data segment". After reading everything, return only one merged final JSON. Matches must cover all matches from all segments; do not return separate JSONs for each segment.\n\n${promptData.prompts.map((prompt: string, index: number) => `==================== [ Data Segment ${index + 1}/${segmentCount} Start ] ====================\n${prompt}\n==================== [ Data Segment ${index + 1}/${segmentCount} End ] ====================`).join('\n\n==================== [ Next data segment, please continue reading, do not answer ] ====================\n\n')}\n\n[All Data Segments End] Now perform a unified analysis and output only one merged JSON.`
        : promptData.prompts[0] || '';
      res.json({
        success: true,
        mode: promptData.mode,
        prompt_style: promptData.prompt_style || 'standard',
        standard_prompts: promptData.standard_prompts || [],
        objective_prompts: promptData.objective_prompts || [],
        match_count: promptData.match_count,
        prompt_count: promptData.prompts.length,
        prompts: deliveryPrompts,
        match_manifest: matchManifest,
        combined_prompt: combinedPrompt,
        instructions: segmentCount > 1
          ? `Please send each of the ${segmentCount} segments sequentially in the same conversation; each segment will first generate its complete result, and the final segment will merge all results. Do not send a combined result all at once.`
          : `Copy this Prompt to Gemini, complete it, and then import the returned JSON into the system.`
      });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to export prompt' });
    }
  });
}

export function registerAiManualImportRoutes(app: express.Express, deps: { parse(text: string): any; sanitizeMarket(item: any): any; sanitizeParlayLeg(item: any): any }): void {
  const categories = ['全场大小球', '半场大小球', '全场让球', '半场让球', '全场独赢1X2'];
  app.post('/api/ai/import-evaluation', (req, res) => {
    try {
      // `expected_match_count` is optional – supplied by the front-end when it has the count from the export step.
      // When absent (e.g. user pastes directly without having exported), we skip the count check gracefully.
      const { raw_text, mode = 'live_eval', expected_match_count } = req.body || {};
      if (typeof raw_text !== 'string' || !raw_text.trim()) return res.status(400).json({ error: 'Paste a JSON result from Gemini Web' });
      const parsed = deps.parse(raw_text);
      if (Array.isArray(parsed.matches)) {
        parsed.matches = parsed.matches.map((m: any) => normalizeMatchPredictionsAndAssessments(m));
      } else if (parsed && typeof parsed === 'object') {
        Object.assign(parsed, normalizeMatchPredictionsAndAssessments(parsed));
      }
      const isParlayMode = mode === 'parlay_check' || Array.isArray(parsed?.parlay_recommendations) || Boolean(parsed?.parlay_safety_check);
      const expectedCount = Number(expected_match_count);
      if (!isParlayMode && Number.isInteger(expectedCount) && expectedCount > 1 && (!Array.isArray(parsed.matches) || parsed.matches.length !== expectedCount)) {
        throw new Error(`AI返回不完整：应包含 ${expectedCount} 场比赛，实际只有 ${Array.isArray(parsed.matches) ? parsed.matches.length : 0} 场。请不要导入，回到同一AI会话要求其补全全部比赛。`);
      }
      if (!isParlayMode && Number.isInteger(expectedCount) && expectedCount > 1 && Array.isArray(parsed.matches)) {
        const incomplete = parsed.matches.filter((match: any) => !Array.isArray(match.market_assessments) || match.market_assessments.length < categories.length);
        if (incomplete.length > 0) {
          throw new Error(`AI返回存在占位比赛：${incomplete.length} 场未包含完整5类核心玩法（${incomplete.slice(0, 3).map((item: any) => item.match).join('、')}${incomplete.length > 3 ? '等' : ''}）。请在同一AI会话要求补全后再导入。`);
        }
      }
      parsed.ai_provider = 'gemini_manual_web_import';
      const decisionFiles = isParlayMode
        ? [readJsonFile<any>(DATA_FILES.live.decisions, { decisions: [] }), readJsonFile<any>(DATA_FILES.prematch.decisions, { decisions: [], research_queue: [] })]
        : mode === 'prematch_eval'
          ? [readJsonFile<any>(DATA_FILES.prematch.decisions, { decisions: [], research_queue: [] })]
          : [readJsonFile<any>(DATA_FILES.live.decisions, { decisions: [] })];
      const candidateFiles = [
        readJsonFile<any>(DATA_FILES.live.candidates, { candidates: [] }),
        readJsonFile<any>(DATA_FILES.prematch.candidates, { candidates: [] }),
      ];
      const ybtyFiles = [
        readJsonFile<any>(DATA_FILES.live.ybtySnapshot, { matches: [] }),
        readJsonFile<any>(DATA_FILES.prematch.ybtySnapshot, { matches: [] }),
      ];
      const parlayCandidatePool = candidateFiles.flatMap((file: any) => Array.isArray(file.candidates) ? file.candidates : []);
      const parlayYbtyPool = ybtyFiles.flatMap((file: any) => Array.isArray(file.matches) ? file.matches : []);
      const storedMatches = decisionFiles.flatMap((file: any) => [...(file.decisions || []), ...(file.research_queue || [])]);

      const cleanTeam = (str: any): string => {
        if (typeof str !== 'string') return '';
        return str.toLowerCase().replace(/-(ybty|leisu)$/gi, '').replace(/football club|fc|俱乐部|体育/gi, '').replace(/[\s\-_:\.()（）\[\]【】]/g, '').trim();
      };
      const sameTeams = (homeA: unknown, awayA: unknown, homeB: unknown, awayB: unknown) =>
        cleanTeam(homeA) === cleanTeam(homeB) && cleanTeam(awayA) === cleanTeam(awayB);

      const sourceMatches = storedMatches.map((stored: any) => {
        const wrapper = parlayCandidatePool.find((entry: any) =>
          entry?.match === stored.match
          || sameTeams(entry?.candidate?.home, entry?.candidate?.away, stored.ybty_home, stored.ybty_away)
          || sameTeams(entry?.ybty_home, entry?.ybty_away, stored.ybty_home, stored.ybty_away));
        const ybty = parlayYbtyPool.find((entry: any) =>
          sameTeams(entry?.home, entry?.away, stored.ybty_home, stored.ybty_away));
        const source = wrapper || {};
        return {
          ...source,
          ...stored,
          ybty_raw_markets: Array.isArray(stored.ybty_raw_markets) && stored.ybty_raw_markets.length > 0
            ? stored.ybty_raw_markets
            : normalizeYbtyMarketTypes(ybty?.markets || source.ybty_raw_markets || []),
        };
      });

      const normalizeName = (value: unknown) => String(value || '').toLowerCase().replace(/[\s._\-()（）]/g, '');
      if (Array.isArray(parsed.matches)) parsed.matches = parsed.matches.map((match: any) => {
        const assessments = Array.isArray(match.market_assessments) ? match.market_assessments : [];
        const existing = new Map(assessments.map((item: any) => [String(item.category || ''), item]));
        const source = sourceMatches.find((item: any) => normalizeName(item.match) === normalizeName(match.match))
          || sourceMatches.find((item: any) => normalizeName(item.ybty_home) === normalizeName(match.ybty_home) && normalizeName(item.ybty_away) === normalizeName(match.ybty_away));
        const verifiedMarkets = normalizeYbtyMarketTypes(source?.ybty_raw_markets || []);
        const scoreVerification = resolveScoreVerification(source, mode === 'prematch_eval');
        const scoreVerified = scoreVerification.verified || match.score_verified === true || /\|true\|/i.test(match.summary || '');
        const scoreSource = match.score_verified === true ? (match.score_source || 'verified') : scoreVerification.source;
        const validatedAssessments = categories.map((category) => {
          const sanitized = deps.sanitizeMarket(existing.get(category) || { category, market: category, direction: '暂无可靠方向', line: null, odds: null, probability: null, grade: 'NO_BET', status: 'unavailable', reason: 'AI did not return a reliable assessment for this market.' });
          return enforceLiveScoreVerification(validateAssessmentAgainstVerifiedMarkets(sanitized, verifiedMarkets), scoreVerified);
        });
        const invented = validatedAssessments.filter((item: any) => ['ai_option_not_in_ybty_whitelist', 'invalid_ybty_option_id'].includes(item.verification_error));
        if (invented.length > 0) {
          throw new Error(`${match.match || `${match.ybty_home} vs ${match.ybty_away}`} 的AI盘口与YBTY不一致：${invented.map((item: any) => {
            const original: any = existing.get(item.category) || {};
            return `${item.category} ${original.direction || ''} ${original.line || ''} @${original.odds || ''}`;
          }).join('；')}。请让AI严格按Prompt中的 verified_ybty_markets 真实选项重新评估，不能直接导入。`);
        }
        return {
          ...match,
          score_verified: scoreVerified,
          score_source: scoreSource,
          recommendation: scoreVerified ? match.recommendation : null,
          verification_passed: scoreVerified && match.verification_passed !== false,
          market_assessments: validatedAssessments
        };
      });
      Object.assign(parsed, normalizeParlayRecommendations(parsed, deps.sanitizeParlayLeg, sourceMatches));
      const history = readJsonFile<any[]>(DATA_FILES.ai.evaluations, []);
      const snapshotId = `web_gemini_${Date.now()}`;
      const evaluatedMatches = Array.isArray(parsed.matches)
        ? parsed.matches.map((item: any) => item.match || `${item.ybty_home || ''} vs ${item.ybty_away || ''}`)
        : Array.isArray(parsed.parlay_recommendations)
          ? Array.from(new Set(parsed.parlay_recommendations.flatMap((ticket: any) => Array.isArray(ticket?.legs) ? ticket.legs.map((leg: any) => leg?.match || `${leg?.ybty_home || ''} vs ${leg?.ybty_away || ''}`).filter(Boolean) : [])))
          : [parsed.match || 'manual web import'];
      history.unshift({
        id: snapshotId,
        mode,
        scope: Array.isArray(parsed.matches) ? 'batch' : isParlayMode ? 'parlay' : 'single',
        evaluated_matches: evaluatedMatches,
        saved_at: new Date().toISOString(),
        result: parsed,
      });
      if (!writeJsonFile(DATA_FILES.ai.evaluations, history)) return res.status(500).json({ error: 'Failed to save imported evaluation' });
      res.json({ success: true, snapshot_id: snapshotId, result: parsed, message: 'Evaluation imported and saved.' });
    } catch (error: any) { res.status(400).json({ error: `Invalid imported JSON: ${error?.message || 'unknown error'}` }); }
  });
}

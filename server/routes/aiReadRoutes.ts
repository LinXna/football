import type express from 'express';
import crypto from 'crypto';
import { DATA_FILES } from '../dataFiles';
import { readJsonFile, writeJsonFile } from '../jsonStore';
import { normalizeParlayRecommendations } from '../services/parlayRecommendationNormalizer';
import { normalizeYbtyMarketTypes } from '../services/marketTypeNormalizer';
import { enforceLiveScoreVerification, validateAssessmentAgainstVerifiedMarkets } from '../services/verifiedMarketAssessment';
import { resolveScoreVerification } from '../services/scoreValidation';

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
          ? `【分段评估 ${index + 1}/${segmentCount}】\n请立即完整评估本段比赛，并严格输出本段JSON。不要只回复“已接收”。输出后请在本会话中保留这份结构化结果，等待下一段；后续最终合并应使用这份较小的JSON结果，不要依赖重新回忆本段原始长数据。\n\n${prompt}\n\n【本段结束控制・最高优先级】现在只输出本段全部比赛的完整JSON，每场必须包含12类market_assessments。真实市场必须再次对照紧邻上方的YBTY投注白名单；禁止输出白名单外的line或odds。`
          : `【分段评估 ${index + 1}/${segmentCount}・最后一段】\n先完整评估本段比赛；然后把本会话此前第1至第${index}段已经输出的结构化JSON结果与本段结果直接合并。\n\n${prompt}\n\n【最终合并控制指令・优先级最高】\n不要重新概括或用占位对象替代前序结果，必须原样保留前序每场的12类market_assessments，再加入本段结果。最终返回恰好 ${promptData.match_count} 个 matches 对象，逐一覆盖：${JSON.stringify(matchManifest)}。任何比赛的market_assessments少于12项都视为未完成。只输出一个合法合并JSON。`);
      const combinedPrompt = segmentCount > 1
        ? `【分段读取总指令】\n以下 ${segmentCount} 个数据段属于同一次评估任务。请从第1段顺序读取到第${segmentCount}段；看到中间的“下一数据段”时不要提前回答。全部读取完成后，只返回一个合并后的最终 JSON，matches 必须覆盖所有分段中的比赛，不要为每段分别返回 JSON。\n\n${promptData.prompts.map((prompt: string, index: number) => `==================== [ 数据段 ${index + 1}/${segmentCount} 开始 ] ====================\n${prompt}\n==================== [ 数据段 ${index + 1}/${segmentCount} 结束 ] ====================`).join('\n\n==================== [ 下一数据段，请继续读取，不要回答 ] ====================\n\n')}\n\n【全部数据段结束】现在统一分析并只输出一个合并 JSON。`
        : promptData.prompts[0] || '';
      res.json({
        success: true,
        mode: promptData.mode,
        match_count: promptData.match_count,
        prompt_count: promptData.prompts.length,
        prompts: deliveryPrompts,
        match_manifest: matchManifest,
        combined_prompt: combinedPrompt,
        instructions: segmentCount > 1
          ? `请按顺序分别发送 ${segmentCount} 段到同一会话；每段都会先生成本段完整结果，最后一段再合并全部结果。不要一次性合并发送。`
          : '复制此 Prompt 到 Gemini，完成后将返回的 JSON 导入系统。',
      });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to export prompt' });
    }
  });
}

export function registerAiManualImportRoutes(app: express.Express, deps: { parse(text: string): any; sanitizeMarket(item: any): any; sanitizeParlayLeg(item: any): any }): void {
  const categories = ['全场大小球', '半场大小球', '全场让球', '半场让球', '全场独赢1X2', '波胆', '双方是否进球', '总进球单双', '主队进球数', '客队进球数', '总进球数', '进球时间段'];
  app.post('/api/ai/import-evaluation', (req, res) => {
    try {
      const { raw_text, mode = 'live_eval', expected_match_count } = req.body || {};
      if (typeof raw_text !== 'string' || !raw_text.trim()) return res.status(400).json({ error: 'Paste a JSON result from Gemini Web' });
      const parsed = deps.parse(raw_text);
      const expectedCount = Number(expected_match_count);
      if (Number.isInteger(expectedCount) && expectedCount > 1 && (!Array.isArray(parsed.matches) || parsed.matches.length !== expectedCount)) {
        throw new Error(`AI返回不完整：应包含 ${expectedCount} 场比赛，实际只有 ${Array.isArray(parsed.matches) ? parsed.matches.length : 0} 场。请不要导入，回到同一AI会话要求其补全全部比赛。`);
      }
      if (Number.isInteger(expectedCount) && expectedCount > 1 && Array.isArray(parsed.matches)) {
        const incomplete = parsed.matches.filter((match: any) => !Array.isArray(match.market_assessments) || match.market_assessments.length < categories.length);
        if (incomplete.length > 0) {
          throw new Error(`AI返回存在占位比赛：${incomplete.length} 场未包含完整12类玩法（${incomplete.slice(0, 3).map((item: any) => item.match).join('、')}${incomplete.length > 3 ? '等' : ''}）。请在同一AI会话要求补全后再导入。`);
        }
      }
      parsed.ai_provider = 'gemini_manual_web_import';
      const decisionFiles = mode === 'parlay_check'
        ? [readJsonFile<any>(DATA_FILES.live.decisions, { decisions: [] }), readJsonFile<any>(DATA_FILES.prematch.decisions, { decisions: [], research_queue: [] })]
        : mode === 'prematch_eval'
          ? [readJsonFile<any>(DATA_FILES.prematch.decisions, { decisions: [], research_queue: [] })]
          : [readJsonFile<any>(DATA_FILES.live.decisions, { decisions: [] })];
      const sourceMatches = decisionFiles.flatMap((file: any) => [...(file.decisions || []), ...(file.research_queue || [])]);
      const normalizeName = (value: unknown) => String(value || '').toLowerCase().replace(/[\s._\-()（）]/g, '');
      if (Array.isArray(parsed.matches)) parsed.matches = parsed.matches.map((match: any) => {
        const assessments = Array.isArray(match.market_assessments) ? match.market_assessments : [];
        const existing = new Map(assessments.map((item: any) => [String(item.category || ''), item]));
        const source = sourceMatches.find((item: any) => normalizeName(item.match) === normalizeName(match.match))
          || sourceMatches.find((item: any) => normalizeName(item.ybty_home) === normalizeName(match.ybty_home) && normalizeName(item.ybty_away) === normalizeName(match.ybty_away));
        const verifiedMarkets = normalizeYbtyMarketTypes(source?.ybty_raw_markets || []);
        const scoreVerification = resolveScoreVerification(source, mode === 'prematch_eval');
        const scoreVerified = scoreVerification.verified;
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
        return { ...match, score_verified: scoreVerified, score_source: scoreVerification.source, recommendation: scoreVerified ? match.recommendation : null, verification_passed: scoreVerified && match.verification_passed === true, market_assessments: validatedAssessments };
      });
      Object.assign(parsed, normalizeParlayRecommendations(parsed, deps.sanitizeParlayLeg, sourceMatches));
      const history = readJsonFile<any[]>(DATA_FILES.ai.evaluations, []);
      const snapshotId = `web_gemini_${Date.now()}`;
      history.unshift({ id: snapshotId, mode, scope: Array.isArray(parsed.matches) ? 'batch' : 'single', evaluated_matches: Array.isArray(parsed.matches) ? parsed.matches.map((item: any) => item.match || `${item.ybty_home || ''} vs ${item.ybty_away || ''}`) : [parsed.match || 'manual web import'], saved_at: new Date().toISOString(), result: parsed });
      if (!writeJsonFile(DATA_FILES.ai.evaluations, history)) return res.status(500).json({ error: 'Failed to save imported evaluation' });
      res.json({ success: true, snapshot_id: snapshotId, result: parsed, message: 'Evaluation imported and saved.' });
    } catch (error: any) { res.status(400).json({ error: `Invalid imported JSON: ${error?.message || 'unknown error'}` }); }
  });
}

import type express from 'express';
import { GoogleGenAI } from '@google/genai';
import { APP_CONFIG } from '../../config/appConfig';
import { generateGeminiViaWindowsNetwork as windowsFallback } from './geminiWindowsFallback';
import { geminiHttpStatus, isGeminiNetworkFailure, isRetryableGeminiFailure, parseGeminiRetryDelay, waitForRetry } from './geminiRetry';
import { waitForGeminiRateSlot } from './geminiRateGate';
import { advanceGeminiKeyCursor, geminiKeyIndex, getGeminiKeyCooldown, isGeminiKeyAvailable, setGeminiKeyCooldown } from './geminiKeyCooldown';
import { parseModelJson } from './modelJson';
import { normalizeParlayRecommendations } from './parlayRecommendationNormalizer';
import { enforceLiveScoreVerification, validateAssessmentAgainstVerifiedMarkets } from './verifiedMarketAssessment';

export function createGeminiEvaluationHandler(deps: {
  buildPromptData(body: any): any;
  sanitizeMarketAssessment(item: any): any;
  sanitizeParlayLeg(item: any, candidates?: any[]): any;
}): express.RequestHandler {
  const { buildPromptData, sanitizeMarketAssessment, sanitizeParlayLeg } = deps;
  const GEMINI_MODEL = APP_CONFIG.geminiModel;
  const generateGeminiViaWindowsNetwork = (apiKey: string, prompt: string) => windowsFallback(apiKey, prompt, GEMINI_MODEL);
  return async (req, res) => {
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
          .map((_, idx) => geminiKeyIndex(idx, geminiApiKeys.length))
          .filter((idx) => isGeminiKeyAvailable(geminiApiKeys[idx], now));

        if (availableIndexes.length === 0) {
          const earliestExpiry = Math.min(...geminiApiKeys.map(getGeminiKeyCooldown));
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
            advanceGeminiKeyCursor(keyIndex, geminiApiKeys.length);
            return response.text || '{}';
          } catch (sdkError: any) {
            lastError = sdkError;
            if (isGeminiNetworkFailure(sdkError)) {
              try {
                console.warn(`[AI Evaluation] Key #${keyIndex + 1}: SDK 网络异常，尝试 Windows 网络后备方案。`);
                await waitForGeminiRateSlot(activeKey, 3500);
                const text = await generateGeminiViaWindowsNetwork(activeKey, contents);
                advanceGeminiKeyCursor(keyIndex, geminiApiKeys.length);
                return text;
              } catch (fallbackError: any) {
                lastError = fallbackError;
              }
            }
            const status = geminiHttpStatus(lastError);
            const isQuotaError = status === 429 || String(lastError?.message || '').includes('RESOURCE_EXHAUSTED');
            if (isQuotaError) {
              const cooldownMs = parseGeminiRetryDelay(lastError);
              setGeminiKeyCooldown(activeKey, Date.now() + cooldownMs);
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
          score_verified: mode === 'prematch_eval' ? true : inputMatch?.match_info?.score_verified === true,
          score_source: mode === 'prematch_eval' ? 'prematch_not_applicable' : (inputMatch?.match_info?.score_source || 'unverified'),
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
            if (requiredMarket) {
              const verified = validateAssessmentAgainstVerifiedMarkets(assessment, inputMatch?.verified_ybty_markets || []);
              if (verified.ybty_market_verified !== true) return verified;
              Object.assign(assessment, verified);
            }
            const odds = Number(assessment.odds);
            const hasProbability = assessment.probability !== null && assessment.probability !== undefined && assessment.probability !== '';
            const probability = hasProbability ? Number(assessment.probability) : Number.NaN;
            if (!requiredMarket && !(odds > 1) && Number.isFinite(probability)) {
              return {
                ...assessment,
                grade: 'NO_BET',
                status: 'prediction',
                implied_probability: null,
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
                  implied_probability: Math.round(impliedProbability * 100) / 100,
                  value_edge: valueEdge,
                  reason: `${assessment.reason || ''} 模型概率${probability}%不高于赔率隐含概率${impliedProbability.toFixed(1)}%，属于非正期望值。`.trim(),
                };
              }
              return { ...assessment, implied_probability: Math.round(impliedProbability * 100) / 100, value_edge: valueEdge };
            }
            return { ...assessment, implied_probability: null, value_edge: null };
          }),
        };
      }).map((matchResult: any) => {
        const sanitizedAssessments = (matchResult.market_assessments || []).map((item: any) =>
          enforceLiveScoreVerification(sanitizeMarketAssessment(item), mode === 'prematch_eval' || matchResult.score_verified === true));
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

      const mismatchedOptions = processedMatches.flatMap((matchResult: any) =>
        (matchResult.market_assessments || [])
          .filter((assessment: any) => assessment.verification_error === 'ai_option_not_in_ybty_whitelist')
          .map((assessment: any) => `${matchResult.match || `${matchResult.ybty_home} vs ${matchResult.ybty_away}`}：${assessment.category}`));
      if (mismatchedOptions.length > 0) {
        return res.status(422).json({
          error: `AI返回了不属于YBTY真实选项的盘口，已拒绝整次评估，请重试：${mismatchedOptions.slice(0, 5).join('；')}`,
          retryable: true,
        });
      }

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
      parsedJson = normalizeParlayRecommendations(parsedJson, sanitizeParlayLeg, promptData.parlayCandidates);
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
  };
}

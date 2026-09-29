import express from 'express';
import fs from 'fs';
import path from 'path';
import { generateRefactoredPrompt } from '../../refactor/04_ai_evaluator/promptExporter.js';
import { projectPath } from '../../config/projectPaths.js';
import { UniverseLedgerPersistence } from '../../refactor/05_portfolio_risk/universeLedgerPersistence.js';
import { LedgerPersistence } from '../../refactor/05_portfolio_risk/ledgerPersistence.js';
import { extractAiEvaluationBrief } from '../../refactor/02_canonical_model/canonicalMatchAssembler.js';
import { CanonicalMatch } from '../../refactor/02_canonical_model/types.js';

interface RefactorAiImportPayload {
  raw_text?: string;
  expected_match_count?: number;
  selected_match_ids?: string[];
  mode?: 'live_eval' | 'prematch_eval' | 'parlay_check';
}

function parseJsonSafely(rawText: string): any {
  let cleaned = rawText.trim();
  // 剥离可能存在的 markdown 块包裹
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  // 提取首个有效 json 块 [ ... ] 或 { ... }
  const firstBracket = cleaned.indexOf('[');
  const firstBrace = cleaned.indexOf('{');
  
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    const lastBracket = cleaned.lastIndexOf(']');
    if (lastBracket > firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    }
  } else if (firstBrace !== -1) {
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }
  
  return JSON.parse(cleaned);
}

export function registerRefactorAiRoutes(app: express.Express): void {
  /**
   * POST /api/refactor/ai/export-prompt
   * 重构版专用的 Prompt 导出接口
   * 接收标准 CanonicalMatch 列表，生成 Layer 04 确定性量化审计 Prompt
   */
  app.post('/api/refactor/ai/export-prompt', async (req, res) => {
    try {
      const { canonical_matches, mode = 'live_eval' } = req.body || {};

      if (!Array.isArray(canonical_matches) || canonical_matches.length === 0) {
        return res.status(400).json({ error: '重构版导出失败: 未提供任何 canonical_matches 比赛数据' });
      }

      const { finalPrompt, matchCount } = generateRefactoredPrompt(canonical_matches, mode);

      if (matchCount === 0) {
        return res.status(400).json({ 
          error: '所选比赛未通过量化准入门禁（可能尚未确认对齐或缺少有效时钟/比分），无法生成有效 Prompt' 
        });
      }

      res.json({
        success: true,
        mode: mode,
        prompt_style: 'refactor_layer04',
        match_count: matchCount,
        prompt_count: 1,
        prompts: [finalPrompt],
        combined_prompt: finalPrompt,
        instructions: `（重构版 Layer 04 量化审计专属 Prompt）成功覆盖 ${matchCount} 场比赛。请一键复制并在网页版大模型中执行。`
      });
    } catch (error: any) {
      console.error('[RefactorAiRoutes] Failed to export prompt:', error);
      res.status(400).json({ error: error?.message || '导出 Prompt 失败' });
    }
  });

  /**
   * POST /api/refactor/ai/import-evaluation
   * 重构版专用的 AI 评估结果手动导入接口
   * 解析大模型按照 Layer 04 OUTPUT JSON SCHEMA 返回的审计与扫描结果
   */
  app.post('/api/refactor/ai/import-evaluation', (req, res) => {
    try {
      const { raw_text, expected_match_count, selected_match_ids, mode = 'live_eval' }: RefactorAiImportPayload = req.body || {};

      if (!raw_text || typeof raw_text !== 'string' || !raw_text.trim()) {
        return res.status(400).json({ error: '请粘贴大模型返回的 JSON 评估内容' });
      }

      let parsed: any;
      try {
        parsed = parseJsonSafely(raw_text);
      } catch (parseErr: any) {
        return res.status(400).json({ 
          error: `JSON 解析失败，请确认复制的是合法 JSON 结构：${parseErr?.message || parseErr}` 
        });
      }

      let matches: any[] = [];
      if (Array.isArray(parsed)) {
        matches = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.matches)) {
          matches = parsed.matches;
        } else if (parsed.blind_spot_analysis || parsed.internal_logical_audit || parsed.market_scan || parsed.grade) {
          matches = [parsed];
        }
      }

      if (matches.length === 0) {
        return res.status(400).json({ error: '未能从返回内容中解析出有效的比赛评估数据' });
      }

      const selectedIdList = Array.isArray(selected_match_ids)
        ? selected_match_ids.map(id => String(id).trim()).filter(Boolean)
        : [];

      // 归一化与补充重构特征
      const normalizedMatches = matches.map((m: any, idx: number) => {
        if (!m || typeof m !== 'object') return m;

        // 若大模型没有返回 match_id，则按位置自动绑定选中的 canonical_id
        if (!m.match_id && selectedIdList.length > 0 && selectedIdList[idx]) {
          m.match_id = selectedIdList[idx];
          m.canonical_id = selectedIdList[idx];
        } else if (m.match_id) {
          m.canonical_id = String(m.match_id).trim();
        }

        if (typeof m.grade === 'string') {
          m.grade_raw = m.grade;
          m.grade = m.grade.replace(/_GRADE$/i, '').trim();
        }

        // 规范化 recommendation
        if (Array.isArray(m.recommended_legs) && m.recommended_legs.length > 0 && !m.recommendation) {
          const firstLeg = m.recommended_legs[0];
          m.recommendation = {
            market: firstLeg.market,
            line: firstLeg.selected_line,
            odds: firstLeg.current_odds,
            direction: firstLeg.direction,
            reason: firstLeg.basis,
            grade: m.grade || 'B'
          };
        }

        return m;
      });

      // 保存到本地评估快照，方便前端展示
      const historyFile = projectPath('output', 'refactor_ai_evaluations.json');
      let historyList: any[] = [];
      try {
        if (fs.existsSync(historyFile)) {
          const content = fs.readFileSync(historyFile, 'utf8');
          const parsedHistory = JSON.parse(content);
          if (Array.isArray(parsedHistory)) historyList = parsedHistory;
        }
      } catch {
        historyList = [];
      }

      const timestamp = new Date().toISOString();
      for (const item of normalizedMatches) {
        const canonicalId = item.canonical_id || item.match_id;
        const entry = {
          ...item,
          mode,
          evaluated_at: timestamp,
        };
        const existIdx = historyList.findIndex(h => (h.canonical_id || h.match_id) === canonicalId);
        if (existIdx >= 0) {
          historyList[existIdx] = { ...historyList[existIdx], ...entry };
        } else {
          historyList.unshift(entry);
        }
      }

      // 保留最近 100 场评估
      if (historyList.length > 100) historyList = historyList.slice(0, 100);

      try {
        const outputDir = projectPath('output');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(historyFile, JSON.stringify(historyList, null, 2), 'utf8');
      } catch (saveErr) {
        console.warn('[RefactorAiRoutes] Failed to persist refactor_ai_evaluations.json:', saveErr);
      }

      // 1. 同步全量归因台账 (Universe Audit Ledger) 中的 AI 门禁与定性评级
      let autoFormalAppended = 0;
      try {
        for (const stg of ['LIVE', 'PREMATCH'] as const) {
          const batchFile = path.resolve(process.cwd(), 'refactor', 'runtime', stg === 'LIVE' ? 'live_batch.json' : 'prematch_batch.json');
          if (fs.existsSync(batchFile)) {
            const batch = JSON.parse(fs.readFileSync(batchFile, 'utf-8'));
            const batchMatches: CanonicalMatch[] = Array.isArray(batch?.matches)
              ? batch.matches
              : (Array.isArray(batch?.canonicalMatches) ? batch.canonicalMatches : []);
            const batchQuant = batch?.quantitative_features || batch?.quantitativeFeatures || {};

            if (batchMatches.length > 0) {
              UniverseLedgerPersistence.autoIngestFromCanonicalBatch(
                stg,
                batchMatches,
                batchQuant,
                historyList
              );

              // 2. 自动化入账：对新导入评估中符合 A/B 级的推荐，自动尝试写入实盘正式台账
              for (const mItem of normalizedMatches) {
                const gradeStr = String(mItem.grade || mItem.grade_raw || '').toUpperCase();
                if (gradeStr.startsWith('A') || gradeStr.startsWith('B')) {
                  const targetMatch = batchMatches.find(bm =>
                    bm.canonical_id === mItem.canonical_id ||
                    bm.canonical_id === mItem.match_id ||
                    (mItem.ybty_home && bm.home_team_name.includes(mItem.ybty_home))
                  );
                  if (targetMatch) {
                    const qf = batchQuant[targetMatch.canonical_id];
                    const legs = Array.isArray(mItem.recommended_legs) && mItem.recommended_legs.length > 0
                      ? mItem.recommended_legs
                      : (mItem.recommendation ? [mItem.recommendation] : []);
                    if (legs.length > 0) {
                      try {
                        const brief = extractAiEvaluationBrief(targetMatch);
                        const written = LedgerPersistence.appendApprovedLegs(
                          { ai_brief: brief, quant_features: qf },
                          mItem,
                          legs.map((l: any) => ({
                            ...l,
                            basis: l.basis || (stg === 'LIVE' ? 'REMAINING_GOALS' : 'FULL_MATCH')
                          })),
                          stg
                        );
                        autoFormalAppended += written.length;
                      } catch (appendErr) {
                        console.warn('[RefactorAiRoutes] Auto-append formal ledger failed for match:', targetMatch.canonical_id, appendErr);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (uniErr) {
        console.warn('[RefactorAiRoutes] Failed to sync universe ledger or auto-append formal ledger:', uniErr);
      }

      res.json({
        success: true,
        mode,
        match_count: normalizedMatches.length,
        auto_formal_appended: autoFormalAppended,
        result: {
          matches: normalizedMatches,
          summary: `成功导入 ${normalizedMatches.length} 场重构版 AI 风险评估${autoFormalAppended > 0 ? ` (已自动落盘 ${autoFormalAppended} 条合格推荐至实盘正式台账)` : ''}`
        }
      });
    } catch (error: any) {
      console.error('[RefactorAiRoutes] Import failed:', error);
      res.status(400).json({ error: error?.message || '导入评估结果失败' });
    }
  });

  /**
   * GET /api/refactor/ai/evaluations
   * 获取重构版 AI 历史评估记录
   */
  app.get('/api/refactor/ai/evaluations', (_req, res) => {
    try {
      const historyFile = projectPath('output', 'refactor_ai_evaluations.json');
      if (fs.existsSync(historyFile)) {
        const content = fs.readFileSync(historyFile, 'utf8');
        const list = JSON.parse(content);
        return res.json({ success: true, evaluations: Array.isArray(list) ? list : [] });
      }
      res.json({ success: true, evaluations: [] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '读取评估历史失败' });
    }
  });
}

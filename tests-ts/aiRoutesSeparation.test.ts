import { test, describe } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { registerRefactorAiRoutes } from '../server/routes/refactorAiRoutes.js';
import { registerAiPromptExportRoutes } from '../server/routes/aiReadRoutes.js';
import { MatchStage } from '../refactor/02_canonical_model/enums.js';
import { AlignmentStatus } from '../refactor/01_raw_types/enums.js';

describe('AI Routes Separation Verification (Legacy vs Refactor)', () => {
  const app = express();
  app.use(express.json());

  // 模拟旧版 buildPromptData
  const mockLegacyBuildPromptData = (body: any, isExport?: boolean) => {
    return {
      mode: body?.mode || 'live_eval',
      prompt_style: body?.prompt_style || 'standard',
      prompts: ['[LEGACY MOCK PROMPT 1]', '[LEGACY MOCK PROMPT 2]'],
      standard_prompts: ['[LEGACY MOCK PROMPT 1]'],
      objective_prompts: ['[LEGACY OBJECTIVE PROMPT]'],
      gem_prompts: ['[LEGACY GEM PROMPT]'],
      match_count: 2,
    };
  };

  registerAiPromptExportRoutes(app, mockLegacyBuildPromptData);
  registerRefactorAiRoutes(app);

  let server: any;
  let baseUrl: string;

  test('Setup test server', async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  test('1. Legacy POST /api/ai/export-prompt accepts legacy body without canonical_matches', async () => {
    const legacyPayload = {
      match_name: 'Test Home vs Test Away',
      ybty_home: 'Test Home',
      ybty_away: 'Test Away',
      minute: 35,
      score: { home: 1, away: 0 },
      mode: 'live_eval',
      prompt_style: 'standard',
      batch_match_refs: [
        { match: 'Test Home vs Test Away', ybty_home: 'Test Home', ybty_away: 'Test Away' }
      ]
    };

    const resp = await fetch(`${baseUrl}/api/ai/export-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyPayload),
    });

    assert.strictEqual(resp.status, 200, 'Legacy export must return 200');
    const data = await resp.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.match_count, 2);
    assert.ok(Array.isArray(data.prompts) && data.prompts.length > 0);
    assert.ok(data.combined_prompt.includes('[LEGACY MOCK PROMPT 1]'));
  });

  test('2. Refactored POST /api/refactor/ai/export-prompt requires canonical_matches and returns 400 if empty', async () => {
    const resp = await fetch(`${baseUrl}/api/refactor/ai/export-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonical_matches: [] }),
    });

    assert.strictEqual(resp.status, 400);
    const data = await resp.json();
    assert.ok(data.error.includes('未提供任何 canonical_matches'));
  });

  test('3. Refactored POST /api/refactor/ai/import-evaluation parses refactored schema without requiring 5 legacy markets', async () => {
    const refactorAiOutput = JSON.stringify([
      {
        match_id: 'test_canonical_001',
        match: 'Team A vs Team B',
        grade: 'A_GRADE',
        confidence_score: 85,
        blind_spot_analysis: {
          motivation_asymmetry: 'Title contender vs midtable',
          spread_substance: 'Genuine siege',
          total_substance: 'High xG conversion',
          tactical_regime_evaluation: 'ATTACKING_MOMENTUM',
          trap_detection_result: 'NO_TRAP_DETECTED'
        },
        market_scan: {
          selected_line: '-0.5',
          market: 'FULL_SPREAD',
          market_status: 'ACTIONABLE',
          direction: 'HOME',
          current_odds: 1.95,
          raw_ev: 0.12,
          risk_adjusted_ev: 0.10,
          actionable: true
        },
        recommended_legs: [
          {
            market: 'FULL_SPREAD',
            selected_line: '-0.5',
            current_odds: 1.95,
            direction: '主队 -0.5',
            basis: 'Field tilt 68% and positive EV'
          }
        ]
      }
    ]);

    const resp = await fetch(`${baseUrl}/api/refactor/ai/import-evaluation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_text: refactorAiOutput,
        mode: 'live_eval'
      }),
    });

    assert.strictEqual(resp.status, 200, 'Refactor import must succeed without 5 legacy markets');
    const data = await resp.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.match_count, 1);
    assert.strictEqual(data.result.matches[0].grade, 'A');
    assert.strictEqual(data.result.matches[0].recommendation.direction, '主队 -0.5');
  });

  test('Teardown test server', async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(resolve));
    }
  });
});

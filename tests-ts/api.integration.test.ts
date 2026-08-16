import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';

const writeJson = (root: string, relative: string, value: unknown) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value), 'utf-8');
};

const waitForHealth = async (baseUrl: string, child: ChildProcess): Promise<void> => {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error(`test server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('test server did not become healthy');
};

test('HTTP API validates, deduplicates, synchronizes, and preserves protected data', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-api-'));
  const port = 42000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  for (const [file, value] of Object.entries({
    'team_aliases.json': {}, 'team_aliases_auto.json': {}, 'team_aliases_suppressed.json': [],
    'output/recommendation_ledger.json': [], 'output/recommendation_ledger_archives.json': [],
    'output/ybty_leisu_decisions.json': { decisions: [], summary: {} },
    'output/ybty_leisu_prematch_decisions.json': { decisions: [], research_queue: [], summary: {} },
    'output/ybty_leisu_candidates.json': { candidates: [] },
    'output/ybty_leisu_prematch_candidates.json': { candidates: [] },
    'output/prematch_ai_brief.json': { candidates: [] },
    'output/pipeline_status.json': {}, 'output/prematch_pipeline_status.json': {},
    'output/ybty_latest.json': { matches: [{ id: 1 }] }, 'output/leisu_latest.json': { events: [{ id: 2 }] },
    'output/ybty_prematch_latest.json': { matches: [{ id: 3 }] }, 'output/leisu_prematch_latest.json': { events: [{ id: 4 }] },
    'output/ai_evaluation_history.json': [],
  })) writeJson(root, file, value);

  let stderr = '';
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PROJECT_ROOT: root },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });

  const post = async (endpoint: string, body: unknown) => fetch(`${baseUrl}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  try {
    await waitForHealth(baseUrl, child);
    const baseRecommendation = {
      match: 'Alpha vs Beta', ybty_home: 'Alpha', ybty_away: 'Beta', grade: 'B',
      prediction_probability: 70,
      start_time_beijing: '2026-08-16 20:00', recommendation: { market: '全场大球', line: '大 2.5', odds: 1.9, basis: 'full_match_total' },
    };
    assert.equal((await post('/api/ledger/add', { ...baseRecommendation, minute: 20, score_verified: false })).status, 400);
    assert.equal((await post('/api/ledger/add', baseRecommendation)).status, 200);
    assert.equal((await post('/api/ledger/add', baseRecommendation)).status, 409);
    assert.equal((await post('/api/batch-supplement-scores', { items: [{ match: 'Alpha vs Beta' }] })).status, 400);
    const validScore = await post('/api/batch-supplement-scores', { items: [{ match: 'Alpha vs Beta', final_score: { home: 3, away: 1 }, ht_score: { home: 1, away: 0 }, score_verified: true }] });
    assert.equal(validScore.status, 200);
    const scoredPayload = await validScore.json() as any;
    const formalId = scoredPayload.ledger[0].id;
    const manualOutcome = await post('/api/ledger/update-review', { id: formalId, outcome: 'win', syncSameMatch: false });
    assert.equal(manualOutcome.status, 200);
    const reviewed = await manualOutcome.json() as any;
    assert.equal(reviewed.ledger[0].review.outcome_source, 'manual_user_confirmed');
    assert.match(reviewed.ledger[0].review.outcome_recorded_at, /^\d{4}-\d{2}-\d{2}T/);
    const calibration = await fetch(`${baseUrl}/api/calibration`);
    assert.equal(calibration.status, 200);
    assert.equal(((await calibration.json()) as any).overall.sample_size, 1);

    const clear = await post('/api/clear-outdated-matches', { target: 'all', clear_mode: 'all' });
    assert.equal(clear.status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'output/leisu_latest.json'), 'utf-8')).events.length, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'output/recommendation_ledger.json'), 'utf-8')).length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'team_aliases.json'), 'utf-8')), {});
  } finally {
    child.kill();
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(stderr, '');
});

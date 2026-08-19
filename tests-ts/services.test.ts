import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { calculateExactBeijingTime } from '../server/services/beijingTime';
import { normalizeMarketLabel } from '../server/services/marketLabels';
import { createRecommendationIdentity } from '../server/services/recommendationIdentity';
import { classifyMarket, evaluateQuarterSettlement } from '../src/lib/quarterSettlement';
import { isPlausibleHalfTimeScore, isPrematchScorePlaceholder, parseScoreFields, parseValidScore, resolveScoreVerification } from '../server/services/scoreValidation';
import { createTeamAliasResolver } from '../server/services/teamAliasResolver';
import { buildCalibrationReport, calibrationSamplesFromLedger } from '../server/services/predictionCalibration';
import { buildInterfaceFeatureCalibration, extractCalibrationRows, predictCalibratedFutureGoals } from '../server/services/interfaceFeatureCalibration';
import { JsonDataCorruptionError, readJsonFile, updateJsonFile } from '../server/jsonStore';
import { buildPromptInterfaceContext, buildPromptLiveEfficiency } from '../server/services/promptInterfaceFeatures';
import { resolveMatchEvaluationMode } from '../server/services/evaluationMode';
import { chunkPromptItems } from '../server/services/promptChunking';
import { enforceLiveScoreVerification, validateAssessmentAgainstVerifiedMarkets, validateParlayLegAgainstCandidate, withVerifiedYbtyOptionIds } from '../server/services/verifiedMarketAssessment';
import { buildSlimPromptMatch, filterPromptKeyIncidents, extractFocusedIncidents, buildAttackPressureSummary } from '../server/services/promptSlimPayload';
import { normalizeMatchPredictionsAndAssessments } from '../server/services/marketAssessmentsNormalizer';
import { normalizeParlayRecommendations } from '../server/services/parlayRecommendationNormalizer';
import { scoreDisplay } from '../src/lib/scoreDisplay';
import { displayText, playerNames } from '../src/lib/displayValue';
import { getLeagueName } from '../src/types';
import { parseModelJson } from '../server/services/modelJson';

test('import preview renders normalized Leisu score objects as text', () => {
  assert.equal(scoreDisplay({ home: 2, away: 1 }), '2-1');
  assert.equal(scoreDisplay({ home_score: 0, away_score: 0 }), '0-0');
  assert.equal(scoreDisplay([3, 2]), '3-2');
  assert.equal(scoreDisplay('1:1'), '1:1');
});

test('provider objects are rendered safely in timelines, evidence, and lineups', () => {
  assert.equal(displayText({ time: "18'", data: 'Goal' }), 'Goal');
  assert.equal(displayText({ reason: 'Small sample' }), 'Small sample');
  assert.deepEqual(playerNames([{ name: 'Player A' }, 'Player B']), ['Player A', 'Player B']);
  assert.equal(getLeagueName({ league: { name: 'Premier League' } }), 'Premier League');
});

test('mixed parlay candidates retain live versus prematch scoring rules', () => {
  assert.equal(resolveMatchEvaluationMode({ minute: 37 }), 'live_eval');
  assert.equal(resolveMatchEvaluationMode({ is_live: true }), 'live_eval');
  assert.equal(resolveMatchEvaluationMode({ status: 'inprogress' }), 'live_eval');
  assert.equal(resolveMatchEvaluationMode({ minute: 0, status: 'notstarted' }), 'prematch_eval');
});

test('prompt export chunks by serialized data size instead of match count alone', () => {
  const chunks = chunkPromptItems([
    { match: 'A', payload: 'x'.repeat(60) },
    { match: 'B', payload: 'y'.repeat(30) },
    { match: 'C', payload: 'z'.repeat(10) },
  ], 5, 100);
  assert.deepEqual(chunks.map((chunk) => chunk.map((item) => item.match)), [['A'], ['B', 'C']]);
});

test('slim prompt payload removes mirrors, audits, weather, and non-key commentary', () => {
  const slim = buildSlimPromptMatch({
    match: 'Home vs Away', ybty_home: 'Home', ybty_away: 'Away', minute: 65,
    score: { home: 0, away: 1 }, score_verified: false, score_source: 'ybty_export',
    interface_context: { source_formal_payload: { huge: true } },
    ybty_market_audit: { markets: ['duplicate'] }, weather: 'rain',
    incidents: ['1\' - 比赛开始', "45' - 半场结束，比分0-0", "62' - 进球！0-1"],
    live_text: { entries: ["63' - 普通进攻", "64' - VAR取消进球"] },
    ybty_raw_markets: [{ market: 'full_h2h', market_type_verified: true, options: [
      { side: 'away', line: '客', odds: 1.16, side_verified: true },
      { side: 'home', line: '主', odds: 19, suspended: true },
    ] }],
  }, 'live_eval');
  assert.equal(slim.match_info.match, 'Home vs Away');
  assert.equal(slim.match_info.score_verified, false);
  assert.deepEqual(slim.focused_incidents.match_events, ["45' - 半场结束", "62' - 进球 - 0-1", "64' - VAR - 取消进球"]);
  assert.equal(slim.verified_ybty_markets[0].options.length, 1);
  assert.equal(slim.verified_ybty_markets[0].options[0].option_id, 'full_h2h__1');
  assert.equal('interface_context' in slim, false);
  assert.equal('ybty_market_audit' in slim, false);
  assert.equal('weather' in slim, false);
  assert.equal('key_incidents' in slim, false);
  assert.equal('live_statistics' in slim, false);
});

test('key incident filter keeps betting-relevant events and drops greetings', () => {
  assert.deepEqual(filterPromptKeyIncidents({ incidents: ['欢迎观看', "20' - 点球！罚失", "55' - 主队换人", '天气晴朗'] }), ["20' - 点球 - 罚失", "55' - 换人 - 主队换人"]);
});

test('key incident filter removes duplicated minute prefixes and semantic duplicates', () => {
  assert.deepEqual(filterPromptKeyIncidents({
    incidents: [
      "45' - 45' - 随着裁判一声哨响，上半场结束，目前比分0-0",
      "45' - 随着裁判一声哨响，上半场结束，目前比分0-0",
      "62' - 62' - 第1个进球！客队取得领先！",
      "62' - 第1个进球！客队取得领先！",
    ],
  }), [
    "45' - 半场结束",
    "62' - 进球 - 客队取得领先",
  ]);
});

test('unverified live score blocks real recommendations but not predictions', () => {
  const real = enforceLiveScoreVerification({ category: '全场大小球', status: 'recommend', grade: 'A', value_edge: 8, reason: '统计支持。' }, false);
  assert.equal(real.status, 'avoid');
  assert.equal(real.grade, 'NO_BET');
  assert.equal(real.value_edge, null);
  assert.match(real.reason, /比分未经核验/);
  const prediction = enforceLiveScoreVerification({ category: '波胆', status: 'prediction', grade: 'C' }, false);
  assert.equal(prediction.status, 'prediction');
});

test('prompt export includes new interface fields and honest live efficiency', () => {
  const stats = {
    shots_on_target: { home: 2, away: 3 },
    shots_off_target: { home: 3, away: 1 },
  };
  const efficiency = buildPromptLiveEfficiency(stats, { home: 0, away: 1 });
  assert.equal(efficiency?.by_attacking_side.home.attack.shot_accuracy, 0.4);
  assert.equal(efficiency?.by_attacking_side.away.attack.goal_conversion_per_recorded_shot, 0.25);
  assert.equal(efficiency?.by_attacking_side.home.opposing_goalkeeper.save_rate, 1);
  assert.equal(efficiency?.by_attacking_side.away.opposing_goalkeeper.save_rate, 0.6667);
  assert.equal(efficiency?.by_attacking_side.home.attack.sample_reliable, false);

  const context = buildPromptInterfaceContext({
    live_statistics: stats,
    score: { home: 0, away: 1 },
    reference_odds: { source: 'bet365', current: { total_goals: { line: 2.5 } } },
    player_candidates: [{ name: 'Player A', market_value: 5000000 }],
    recent_trends: { historical_analysis: {
      head_to_head: [{ score: '1-1' }],
      recent_matches: { home: [{ score: '2-0' }], away: [] },
      league_standings: { home_rank: 2 },
      goal_distribution: { home: [1, 2] },
      trend_summary: { home: 'W' },
      future_schedule: { home: [] },
    } },
    detail_context: {
      export_version: '2.0',
      completeness: { statistics: true, text_live: true },
      formal: { static_match: { venue: 'Test Stadium', referee: 'Referee A' }, lineup: { confirmed: true, home_market_value: 50000000, home: [{ name: 'Player A', market_value: 5000000 }] }, live_match: { text_live: [
        { time: "12'", type: 3, position: 1, main: 1, data: 'Home shot saved' },
        { time: "18'", type: 1, position: 2, main: 1, data: 'Away goal' },
      ] } },
    },
  });
  assert.equal(context.schema_version, '2.0');
  assert.equal(context.head_to_head.length, 1);
  assert.equal(context.recent_matches.home.length, 1);
  assert.equal(context.live_commentary.event_count, 2);
  assert.deepEqual(context.live_commentary.events[1], {
    time: "18'", type: 1, position: 2, main: 1, text: 'Away goal',
  });
  assert.equal(context.live_commentary.captured_snapshot_only, true);
  assert.deepEqual(context.match_statistics.shots_on_target, { home: 2, away: 3 });
  assert.equal(context.squad_and_lineup.home_market_value, 50000000);
  assert.equal(context.player_candidates[0].market_value, 5000000);
  assert.equal(context.reference_company_odds.source, 'bet365');
  assert.deepEqual(context.source_formal_field_manifest.sort(), ['lineup', 'live_match', 'static_match']);
  assert.equal(context.source_formal_payload.static_match.venue, 'Test Stadium');
  assert.match(context.calibration_policy, /Do not invent field weights/);
});

test('compact prompt keeps the complete formal payload once and replaces duplicate modules with paths', () => {
  const formal = {
    recent_matches: { home: Array.from({ length: 20 }, (_, index) => ({ index, goals: index % 3 })) },
    head_to_head: [{ home_scores: [1], away_scores: [0] }],
    lineup: { home: [{ name: 'Player A' }], away: [{ name: 'Player B' }] },
    live_match: { confirmed_statistics: { corners: { home: 1, away: 2 } }, text_live: [{ data: 'event' }] },
  };
  const context = buildPromptInterfaceContext({ detail_context: { formal } }, true);
  assert.equal(context.source_formal_payload, formal);
  assert.equal(context.recent_matches, undefined);
  assert.equal(context.squad_and_lineup, undefined);
  assert.equal(context.live_commentary, undefined);
  assert.equal(context.source_field_paths.recent_matches, 'source_formal_payload.recent_matches');
});

const normalize = (value: string) => String(value || '').toLowerCase().replace(/[\s._-]/g, '');

test('market labels normalize provider keys', () => {
  assert.equal(normalizeMarketLabel('full_total'), '全场大小球');
  assert.equal(normalizeMarketLabel('half_spread'), '半场让球');
});

test('Beijing time derives countdown from captured UTC time', () => {
  assert.equal(calculateExactBeijingTime({ captured_at: '2026-01-01T00:00:00Z', mins_until_start: 30 }), '2026-01-01 08:30 (推算时间)');
});

test('Beijing time converts zoned ISO values and combines hour-minute countdowns', () => {
  assert.equal(calculateExactBeijingTime({ commence_time: '2026-08-16T12:30:00Z' }), '2026-08-16 20:30');
  assert.equal(calculateExactBeijingTime({ commence_time: '2026-08-16 20:30' }), '2026-08-16 20:30');
  assert.equal(calculateExactBeijingTime({ countdown: '1小时26分钟后开赛', captured_at: '2026-08-16T12:00:00Z' }), '2026-08-16 21:26 (推算时间)');
  assert.equal(calculateExactBeijingTime({ countdown: '20分钟后开赛' }), '推算时间');
});

test('alias resolver matches canonical, alias, and rejects unrelated teams', () => {
  const matches = createTeamAliasResolver({ 上海海港: ['Shanghai Port'] }, {}, normalize);
  assert.equal(matches('上海海港', 'Shanghai Port'), true);
  assert.equal(matches('上海海港', '北京国安'), false);
});

test('recommendation direction guard covers totals and handicaps', () => {
  const identity = createRecommendationIdentity(normalize);
  assert.equal(identity.hasExplicitBetDirection({ recommendation: { market: '全场大小球', line: '大 2.5' } }), true);
  assert.equal(identity.hasExplicitBetDirection({ recommendation: { market: '全场大小球', line: '2.5' } }), false);
  assert.equal(identity.hasExplicitBetDirection({ ybty_home: '主队A', recommendation: { market: '全场让球', line: '主队A -0.5' } }), true);
});

test('live total settlement respects the explicit provider basis', () => {
  const common = {
    market: '全场大球',
    line: 2.5,
    odds: 1.9,
    scoreAtRec: { home: 1, away: 0 },
    finalScore: { home: 2, away: 1 },
    scoreVerified: true,
    isLive: true,
  };
  assert.equal(evaluateQuarterSettlement({ ...common, basis: 'full_match_total' }).outcome, 'win');
  assert.equal(evaluateQuarterSettlement({ ...common, basis: 'remaining_goals' }).outcome, 'loss');
  assert.equal(evaluateQuarterSettlement(common).outcome, 'win');
});

test('handicap direction is recognized when the team name is stored in line', () => {
  assert.equal(
    classifyMarket('全场让球', '古拉瑞奇 0', '古拉瑞奇', 'OFK贝尔格莱德').type,
    'spread_home',
  );
  const settlement = evaluateQuarterSettlement({
    market: '全场让球', line: '古拉瑞奇 0', odds: 1.87,
    scoreAtRec: { home: 0, away: 0 }, finalScore: { home: 2, away: 0 },
    homeTeam: '古拉瑞奇', awayTeam: 'OFK贝尔格莱德',
  });
  assert.equal(settlement.outcome, 'win');
});

test('AI market line and odds must exactly match a verified YBTY option', () => {
  const markets = [{ market: 'full_total', market_type_verified: true, options: [
    { side: 'under', line: '1.5/2', odds: 1.78 }, { side: 'over', line: '1.5/2', odds: 2.02 },
  ] }];
  const real = validateAssessmentAgainstVerifiedMarkets({ category: '全场大小球', direction: '小球', line: '1.5/2', odds: 1.78, status: 'watch' }, markets);
  assert.equal(real.ybty_market_verified, true);
  const invented = validateAssessmentAgainstVerifiedMarkets({ category: '全场大小球', direction: '小球', line: '3.5', odds: 1.76, status: 'watch', grade: 'C' }, markets);
  assert.equal(invented.status, 'unavailable');
  assert.equal(invented.grade, 'NO_BET');
  assert.equal(invented.odds, null);
  const missingHalf = validateAssessmentAgainstVerifiedMarkets({ category: '半场大小球', direction: '小球', line: '1/1.5', odds: 1.85 }, markets);
  assert.equal(missingHalf.status, 'unavailable');
  const explicitUnavailable = validateAssessmentAgainstVerifiedMarkets({ category: '半场大小球', status: 'unavailable', direction: null, line: null, odds: null, grade: 'NO_BET' }, markets);
  assert.equal(explicitUnavailable.status, 'unavailable');
  assert.equal(explicitUnavailable.verification_error, 'market_unavailable_or_no_bet');
});

test('YBTY option id locks direction, line and odds instead of trusting AI copies', () => {
  const markets = withVerifiedYbtyOptionIds([{ market: 'full_total', market_type_verified: true, options: [
    { side: 'under', line: '1.5/2', odds: 1.78 }, { side: 'over', line: '1.5/2', odds: 2.02 },
  ] }]);
  const locked = validateAssessmentAgainstVerifiedMarkets({
    category: '全场大小球', market_option_id: 'full_total__1',
    direction: '大球', line: '3.5', odds: 9.99, probability: 55,
  }, markets);
  assert.equal(locked.ybty_market_verified, true);
  assert.equal(locked.direction, '小球');
  assert.equal(locked.line, '1.5/2');
  assert.equal(locked.odds, 1.78);
  const fakeId = validateAssessmentAgainstVerifiedMarkets({ category: '全场大小球', market_option_id: 'full_total__99' }, markets);
  assert.equal(fakeId.verification_error, 'invalid_ybty_option_id');
});

test('repeated YBTY market lines receive unique option ids and lock the intended line', () => {
  const markets = withVerifiedYbtyOptionIds([
    { market: 'full_total', options: [
      { side: 'over', line: '1.5/2', odds: 2.02, option_id: 'full_total__1' },
      { side: 'under', line: '1.5/2', odds: 1.78, option_id: 'full_total__2' },
    ] },
    { market: 'full_total', options: [
      { side: 'over', line: '1.5', odds: 1.68, option_id: 'full_total__1' },
      { side: 'under', line: '1.5', odds: 2.13, option_id: 'full_total__2' },
    ] },
  ]);
  const optionIds = markets.flatMap((market) => market.options?.map((option) => option.option_id) || []);
  assert.equal(new Set(optionIds).size, 4);
  assert.deepEqual(optionIds, [
    'full_total__m1__o1', 'full_total__m1__o2',
    'full_total__m2__o1', 'full_total__m2__o2',
  ]);
  const locked = validateAssessmentAgainstVerifiedMarkets({
    category: '全场大小球', market_option_id: 'full_total__m2__o1',
    direction: '小球', line: '9.5', odds: 9.99,
  }, markets);
  assert.equal(locked.ybty_market_verified, true);
  assert.equal(locked.direction, '大球');
  assert.equal(locked.line, '1.5');
  assert.equal(locked.odds, 1.68);
});

test('parlay legs can only use odds from the candidate YBTY whitelist', () => {
  const candidate = { ybty_home: '主队A', ybty_away: '客队B', ybty_raw_markets: [{ market: 'full_total', market_type_verified: true, options: [
    { side: 'under', line: '1.5/2', odds: 1.78 },
  ] }] };
  const valid = validateParlayLegAgainstCandidate({ market: '全场大小球', line: '小球 1.5/2', odds: 1.78 }, candidate);
  assert.equal(valid.odds_source, 'ybty_verified');
  const leisuLike = validateParlayLegAgainstCandidate({ market: '全场大小球', line: '小球 3.5', odds: 1.76 }, candidate);
  assert.equal(leisuLike.ybty_market_verified, false);
});

test('score validation rejects missing, negative, fractional, and impossible scores', () => {
  assert.deepEqual(parseValidScore({ home: '2', away: 1 }), { home: 2, away: 1 });
  assert.deepEqual(parseScoreFields(0, '0'), { home: 0, away: 0 });
  assert.equal(parseScoreFields(undefined, undefined), null);
  assert.equal(parseValidScore({ home: -1, away: 0 }), null);
  assert.equal(parseValidScore({ home: 1.5, away: 0 }), null);
  assert.equal(parseValidScore({ home: null, away: null }), null);
  assert.equal(parseScoreFields(null, null), null);
  assert.equal(isPrematchScorePlaceholder('未开始'), true);
  assert.equal(isPrematchScorePlaceholder('0-0 (未开赛)'), true);
  assert.equal(isPrematchScorePlaceholder('1-0'), false);
  assert.equal(isPlausibleHalfTimeScore({ home: 2, away: 0 }, { home: 1, away: 0 }), false);
});

test('matching YBTY and Leisu API scores upgrade live score verification', () => {
  const item = {
    score: { home: 0, away: 1 }, score_verified: false, score_source: 'ybty_export',
    detail_context: { formal: { live_match: {
      home_scores: { score: 0 }, away_scores: { score: 1 },
    } } },
  };
  assert.deepEqual(resolveScoreVerification(item), { verified: true, source: 'ybty+leisu_api' });
  assert.deepEqual(resolveScoreVerification({ ...item, score: { home: 1, away: 1 } }), { verified: false, source: 'ybty_export' });
  const slim = buildSlimPromptMatch(item, 'live_eval');
  assert.equal(slim.match_info.score_verified, true);
  assert.equal(slim.match_info.score_source, 'ybty+leisu_api');
});

test('JSON store serializes concurrent cross-process increments without lost updates', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-json-lock-'));
  const target = path.join(directory, 'counter.json');
  fs.writeFileSync(target, '{"count":0}', 'utf-8');
  const worker = path.resolve('tests-ts/json_store_worker.ts');
  const runWorker = () => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', worker, target, '20'], { cwd: process.cwd(), stdio: 'pipe' });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`worker exited ${code}: ${stderr}`)));
  });
  const pythonCmd = (() => {
    try {
      const { execSync } = require('node:child_process');
      execSync('python3 --version', { stdio: 'ignore' });
      return 'python3';
    } catch {
      try {
        const { execSync } = require('node:child_process');
        execSync('python --version', { stdio: 'ignore' });
        return 'python';
      } catch {
        return null;
      }
    }
  })();
  const runPythonWorker = () => new Promise<void>((resolve, reject) => {
    if (!pythonCmd) {
      // Fallback to another TS worker if Python binary is not installed in the container
      return runWorker().then(resolve, reject);
    }
    const child = spawn(pythonCmd, ['tests/json_lock_worker.py', target, '20'], { cwd: process.cwd(), stdio: 'pipe' });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', () => runWorker().then(resolve, reject));
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`python worker exited ${code}: ${stderr}`)));
  });
  try {
    await Promise.all([runWorker(), runWorker(), runWorker(), runWorker(), runPythonWorker()]);
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf-8')), { count: 100 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('prediction calibration uses only settled formal records with explicit probabilities', () => {
  const ledger = [
    { record_type: 'formal_ai_recommendation', prediction_probability: 80, recommendation: { odds: 2, market: '全场大球' }, review: { outcome: 'win' }, created_at: '2026-01-01' },
    { formal_recommendation: true, prediction_probability: 60, recommendation: { odds: 2, market: '全场小球' }, review: { outcome: 'loss' }, created_at: '2026-01-02' },
    { record_type: 'machine_candidate', prediction_probability: 99, recommendation: { odds: 2 }, review: { outcome: 'win' } },
    { record_type: 'formal_ai_recommendation', model_score: 90, recommendation: { odds: 2 }, review: { outcome: 'win' } },
  ];
  assert.equal(calibrationSamplesFromLedger(ledger).length, 2);
  const report = buildCalibrationReport(ledger, 3);
  assert.equal(report.overall.sample_size, 2);
  assert.equal(report.overall.brier_score, 0.2);
  assert.equal(report.overall.net_profit_units, 0);
  assert.equal(report.overall.sufficient_sample, false);
  assert.match(String(report.warning), /样本不足/);
  assert.equal(report.segments.by_mode[0].label, '赛前');
  assert.equal(report.segments.by_market.length, 2);
  assert.equal(report.outcome_sources.legacy, 2);
});

test('interface feature calibration is chronological, leakage-safe, and disabled with insufficient samples', () => {
  const small = buildInterfaceFeatureCalibration([], 200);
  assert.equal(small.active, false);
  assert.equal(small.status, 'insufficient_samples');

  const ledger = Array.from({ length: 250 }, (_, index) => {
    const shotsOnTarget = index % 10;
    const currentGoals = index % 2;
    const futureGoals = Math.round(shotsOnTarget * 0.4);
    return {
      id: `feature-${index}`,
      created_at: new Date(Date.UTC(2025, 0, 1 + index)).toISOString(),
      minute: 50,
      score_at_recommendation: { home: currentGoals, away: 0 },
      prediction_features: {
        schema_version: 'leisu_prediction_features_v1',
        captured_at: new Date(Date.UTC(2025, 0, 1 + index)).toISOString(),
        mode: 'live', minute: 50, score: { home: currentGoals, away: 0 },
        live_statistics: {
          shots_on_target: { home: shotsOnTarget, away: 0 },
          dangerous_attacks: { home: shotsOnTarget * 3, away: 2 },
          possession: { home: 55, away: 45 },
          efficiency: { by_attacking_side: {
            home: { attack: { shot_accuracy: 0.5, goal_conversion_per_recorded_shot: 0.1 }, opposing_goalkeeper: { save_rate: 0.8 } },
            away: { attack: { shot_accuracy: 0.2, goal_conversion_per_recorded_shot: 0 }, opposing_goalkeeper: { save_rate: 0.6 } },
          } },
        },
        lineups: { raw: { home_injuries: [], away_injuries: [] } },
      },
      review: { final_score: { home: currentGoals + futureGoals, away: 0 }, outcome: 'win' },
    };
  });
  const rows = extractCalibrationRows(ledger);
  assert.equal(rows.length, 250);
  assert.ok(rows[0].createdAt < rows[249].createdAt);
  const report: any = buildInterfaceFeatureCalibration(ledger, 200);
  assert.equal(report.split, 'chronological_80_20');
  assert.equal(report.train_size, 200);
  assert.equal(report.test_size, 50);
  assert.equal(report.active, true);
  assert.ok(report.validation.model_rmse < report.validation.baseline_rmse);
  assert.equal(predictCalibratedFutureGoals(small, rows[0].features), null);
  assert.ok(Number.isFinite(predictCalibratedFutureGoals(report, rows[249].features)));
});

test('corrupted JSON is quarantined and recovered from backup or fails closed', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-json-recovery-'));
  const recoverable = path.join(directory, 'recoverable.json');
  const unrecoverable = path.join(directory, 'unrecoverable.json');
  try {
    fs.writeFileSync(recoverable, '{"count":1}', 'utf-8');
    updateJsonFile(recoverable, { count: 0 }, () => ({ count: 2 }));
    fs.writeFileSync(recoverable, '{broken', 'utf-8');
    assert.deepEqual(readJsonFile(recoverable, { count: 0 }), { count: 1 });
    assert.ok(fs.readdirSync(directory).some((name) => name.startsWith('recoverable.json.corrupt-')));

    fs.writeFileSync(unrecoverable, '{broken', 'utf-8');
    assert.throws(() => readJsonFile(unrecoverable, { count: 0 }), JsonDataCorruptionError);
    assert.equal(fs.readFileSync(unrecoverable, 'utf-8'), '{broken');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('extractFocusedIncidents extracts red cards, card/corner tallies, and match events', () => {
  const item = {
    minute: 75,
    leisu_home: '主队',
    leisu_away: '客队',
    incidents: [
      "12' - 黄牌！主队4号",
      "35' - 进球！主队1-0领先",
      "40' - 红牌！客队后卫被罚下",
      "55' - 角球！主队开出角球",
      "68' - 换人！主队换上中场",
      "72' - 黄牌！主队6号犯规",
    ],
    live_statistics: {
      yellow_cards: { home: 2, away: 1 },
      corners: { home: 6, away: 2 },
      red_cards: { home: 0, away: 1 },
    },
  };
  const focused = extractFocusedIncidents(item);
  assert.ok(focused.red_cards?.some((r) => r.includes('红牌')));
  assert.equal(focused.cards_and_corners?.yellow_cards?.home, 2);
  assert.equal(focused.cards_and_corners?.corners?.home, 6);
  assert.equal(focused.cards_and_corners?.red_cards?.away, 1);
  assert.equal(focused.match_events?.length, 6);
  assert.ok(focused.match_events?.some((i) => i.includes("72' - 黄牌 - 主队")));
  assert.ok(focused.match_events?.some((i) => i.includes("35' - 进球 - 主队")));
  assert.ok(focused.match_events?.some((i) => i.includes("40' - 红牌 - 客队")));
});

test('buildAttackPressureSummary combines possession, shots, danger attacks, corners, yellows', () => {
  const stats = {
    possession: { home: 60, away: 40 },
    shots: { home: 8, away: 2 },
    shots_on_target: { home: 4, away: 1 },
    dangerous_attacks: { home: 35, away: 12 },
    corners: { home: 5, away: 1 },
    yellow_cards: { home: 1, away: 2 },
  };
  const summary = buildAttackPressureSummary(stats);
  assert.equal(summary, '控球: 60% vs 40%, 射门: 8-2, 射正: 4-1, 危险进攻: 35-12, 角球: 5-1, 黄牌: 1-2');
});

test('normalizeMatchPredictionsAndAssessments keeps only 5 core real betting markets and filters predictions', () => {
  const compactMatch = {
    match: 'Team A vs Team B',
    ybty_home: 'Team A',
    ybty_away: 'Team B',
    market_assessments: [
      {
        category: '全场大小球',
        market_option_id: 'full_total__1',
        direction: '大 2.5',
        line: '2.5',
        odds: 1.95,
        probability: 60,
        grade: 'B',
        status: 'recommend',
      },
      {
        category: '波胆',
        direction: '2-1',
        status: 'prediction',
      },
    ],
    predictions: {
      correct_score: '2-1',
      btts: '是',
      odd_even: '单',
      home_goals: '2球',
      away_goals: '1球',
      total_goals: '3球',
      timing: '61-75分钟',
    },
  };
  const normalized = normalizeMatchPredictionsAndAssessments(compactMatch);
  assert.equal(normalized.market_assessments.length, 5); // 5 core bettable real markets only
  const scorePred = normalized.market_assessments.find((a: any) => a.category === '波胆');
  assert.equal(scorePred, undefined); // Prediction filtered out
  const bttsPred = normalized.market_assessments.find((a: any) => a.category === '双方是否进球');
  assert.equal(bttsPred, undefined);

  // Verify that unavailable bettable markets pass validation without invented errors
  const verifiedMarkets = [
    {
      market: 'full_total',
      options: [{ option_id: 'full_total__m1__o1', line: '2.5', side: 'over', odds: 1.98 }],
    },
  ];
  for (const assessment of normalized.market_assessments) {
    const validated = validateAssessmentAgainstVerifiedMarkets(assessment, verifiedMarkets);
    assert.notEqual(validated.verification_error, 'ai_option_not_in_ybty_whitelist');
    assert.notEqual(validated.verification_error, 'invalid_ybty_option_id');
  }
});

test('parseModelJson repairs JSON with missing commas and trailing commas from LLMs', () => {
  const brokenJson = `
  \`\`\`json
  {
    "summary": "ok",
    "ticket": {
      "size": 8,
      "reason": "8串1大满贯极限组合，覆盖8场精选场次，适合小资金博取巨额赔付。"
      "legs": [
        { "name": "match1", "odds": 1.78 },
        { "name": "match2", "odds": 1.69 },
      ]
    }
  }
  \`\`\`
  `;
  const parsed = parseModelJson(brokenJson);
  assert.equal(parsed.summary, 'ok');
  assert.equal(parsed.ticket.size, 8);
  assert.equal(parsed.ticket.legs.length, 2);
});

test('advanced quantitative engines properly evaluate referee, fatigue, weather, steam, game-state, and bench', async () => {
  const {
    evaluateRefereeDisciplineAndPenalty,
    evaluateScheduleCongestionAndRest,
    evaluateWeatherAndPitchPhysics,
    evaluateOddsSteamMovementAndDiscrepancy,
    evaluateGameStateLeadPreservation,
    evaluateSubBenchImpact,
    buildMasterTacticalSynthesis,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  // 1. Referee test
  const harshRef = evaluateRefereeDisciplineAndPenalty({ referee: '安东尼奥·马特乌·拉奥斯' });
  assert.equal(harshRef.referee_profile, 'HARSH_CARD_PENALTY_ELEVATED');
  assert.ok(harshRef.referee_severity_index >= 1.25);
  assert.ok(harshRef.penalty_expectancy_lambda >= 0.3);

  // 2. Schedule congestion test
  const now = new Date('2026-08-20T12:00:00Z').getTime();
  const congested = evaluateScheduleCongestionAndRest({
    recent_trends: {
      home_recent: [{ match_date: new Date(now - 7 * 24 * 3600 * 1000).toISOString() }],
      away_recent: [{ match_date: new Date(now - 2 * 24 * 3600 * 1000).toISOString() }],
    },
  }, '2026-08-20T12:00:00Z');
  assert.equal(congested.is_away_congested_double_week, true);
  assert.equal(congested.late_fatigue_breakdown_risk, true);
  assert.ok(congested.rest_advantage_delta >= 3);

  // 3. Weather & pitch physics test
  const rainWeather = evaluateWeatherAndPitchPhysics({ weather: '中雨 18°C 湿度90%' });
  assert.ok(rainWeather.pitch_skid_friction_index < 0.9);
  assert.ok(rainWeather.goal_damping_delta_lambda < 0);
  assert.ok(rainWeather.corner_inflation_multiplier > 1.1);

  // 4. Odds steam movement test
  const steamOdds = evaluateOddsSteamMovementAndDiscrepancy({
    reference_odds: {
      europe: { open_home: 2.10, current_home: 1.85 },
    },
  }, { europe: { open_home: 2.10, current_home: 1.85 } });
  assert.equal(steamOdds.is_sharp_steam_action, true);
  assert.equal(steamOdds.steam_direction, 'SHARP_HOME_STEAM');

  // 5. Game state & golden entry test
  const gameState = evaluateGameStateLeadPreservation(
    {},
    { home: { dangerous_attacks: 25, shots: 5 }, away: { dangerous_attacks: 20, shots: 4 } },
    { home: 0, away: 0 },
    52
  );
  assert.equal(gameState.current_game_state, 'STALEMATE_0_0');
  assert.equal(gameState.golden_entry_point_unlocked, true);

  // 6. Sub bench impact test
  const bench = evaluateSubBenchImpact(
    {
      home_substitutes: [{ name: '前锋A', position: '前锋' }, { name: '边锋B', position: 'FW' }],
      away_substitutes: [{ name: '后卫C', position: '后卫' }],
    },
    {}
  );
  assert.equal(bench.second_half_sub_surge_potential, 'HIGH_SURGE_HOME');
  assert.ok(bench.home_bench_attack_score > bench.away_bench_attack_score);

  // 7. Goal Time-Bucket & Half-Time Asymmetry test
  const {
    evaluateGoalTimeBucketAndHalfAsymmetry,
    evaluateMultiBookmakerOddsDispersion,
    evaluateMarginDistributionAndDeepCover,
    evaluateBookedDefenderAndSecondYellowRisk,
    evaluateCornerToGoalConversionThreat,
    evaluateKnockoutAggregateAndExtraTimeDynamics,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const slowStarter = evaluateGoalTimeBucketAndHalfAsymmetry({
    goal_distribution: {
      home: { all: { scored: [[1, 0, 45], [4, 60, 90]] } },
      away: { all: { scored: [[1, 15, 30], [5, 75, 90]] } },
    },
  });
  assert.equal(slowStarter.half_time_tempo_profile, 'SLOW_STARTER_SECOND_HALF_BURST');
  assert.ok(slowStarter.combined_first_half_goal_share_pct <= 35.0);

  // 8. Multi-Bookmaker Odds Dispersion test
  const dispersion = evaluateMultiBookmakerOddsDispersion({
    bookmakers: [
      { key: 'pinnacle', markets: { h2h: [{ name: 'Home', price: 1.85 }, { name: 'Draw', price: 3.5 }, { name: 'Away', price: 4.2 }] } },
      { key: 'marathon', markets: { h2h: [{ name: 'Home', price: 1.84 }, { name: 'Draw', price: 3.52 }, { name: 'Away', price: 4.25 }] } },
      { key: 'unibet', markets: { h2h: [{ name: 'Home', price: 1.86 }, { name: 'Draw', price: 3.48 }, { name: 'Away', price: 4.15 }] } },
    ],
  });
  assert.equal(dispersion.market_consensus_level, 'STRONG_CONSENSUS_SHARP_DEFENSE');
  assert.ok(dispersion.home_odds_std_dev < 0.03);

  // 9. Margin distribution & DCE test
  const dceTrap = evaluateMarginDistributionAndDeepCover({
    recent_trends: {
      historical_analysis: {
        recent_matches: {
          home: [
            { score: '1-0' }, { score: '2-1' }, { score: '1-0' }, { score: '3-2' }, { score: '2-0' },
          ],
        },
      },
    },
  });
  assert.equal(dceTrap.deep_spread_risk_warning, true);
  assert.ok(dceTrap.win_by_1_goal_pct >= 60);
  assert.ok(dceTrap.deep_cover_efficiency_dce <= 0.35);

  // 10. Booked defender constraint test
  const bookedDef = evaluateBookedDefenderAndSecondYellowRisk({
    ybty_home: '主队',
    ybty_away: '客队',
    incidents: [
      "22' 黄牌 客队 4号中卫",
      "31' 黄牌 客队 6号后腰",
    ],
  }, 40, 1.25);
  assert.equal(bookedDef.away_booked_defenders, 2);
  assert.ok(bookedDef.defensive_constraint_drag_away < 0.85);

  // 11. Corner threat conversion test
  const emptyCorner = evaluateCornerToGoalConversionThreat(
    {},
    { home: { corners: 8, shots: 3 }, away: { corners: 2, shots: 1 } },
    65
  );
  assert.equal(emptyCorner.aerial_threat_profile, 'EMPTY_CORNER_DEFLECTION_INFLATION');

  // 12. Knockout aggregate & extra-time stall test
  const cupStall = evaluateKnockoutAggregateAndExtraTimeDynamics(
    {},
    '英格兰足总杯',
    { home: 1, away: 1 },
    83
  );
  assert.equal(cupStall.is_knockout_match, true);
  assert.equal(cupStall.extra_time_stall_risk_80plus, true);

  // 13. Possession efficiency & counter directness test
  const {
    evaluatePossessionEfficiencyAndCounterDirectness,
    evaluateTacticalFoulAndSetPieceVulnerability,
    evaluateOffsideLinePhysicsAndTrapBreakthrough,
    evaluateStreakMomentumAndMeanRegression,
    evaluateHalfVsFullSpreadHarmonicConsistency,
    evaluateLeagueTierDisparityAndTablePressure,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const possTest = evaluatePossessionEfficiencyAndCounterDirectness({
    possession: { home: 68, away: 32 },
    dangerous_attacks: { home: 18, away: 22 },
    shots_on_target: { home: 1, away: 8 },
  }, 50);
  assert.equal(possTest.possession_tactical_profile, 'STERILE_INEFFECTIVE_POSSESSION_TRAP');
  assert.ok(possTest.away_counter_directness_index >= 0.35);

  // 14. Tactical foul & fragmentation test
  const foulTest = evaluateTacticalFoulAndSetPieceVulnerability({
    fouls: { home: 9, away: 8 },
  }, 45);
  assert.equal(foulTest.game_rhythm_fragmentation_level, 'HIGH_FRAGMENTATION_STALL');
  assert.equal(foulTest.danger_zone_free_kick_threat, true);

  // 15. Offside line physics test
  const offsideTest = evaluateOffsideLinePhysicsAndTrapBreakthrough({
    offsides: { home: 3, away: 2 },
  }, 55);
  assert.equal(offsideTest.high_defensive_line_trap_active, true);
  assert.equal(offsideTest.broken_trap_breakthrough_hazard, true);

  // 16. Streak momentum & mean regression test
  const streakTest = evaluateStreakMomentumAndMeanRegression({
    trend_summary: {
      home: { table: [{ continuous_win: 6, continuous_lose: 0 }] },
    },
  });
  assert.equal(streakTest.streak_profile, 'EXTREME_WIN_STREAK_OVERHEAT_TRAP');
  assert.ok(streakTest.market_overheat_penalty_delta <= -0.4);

  // 17. Half vs Full spread harmonic test
  const harmonicTest = evaluateHalfVsFullSpreadHarmonicConsistency([
    { market: 'full_spread', options: [{ line: '-1.5', odds: 1.95 }] },
    { market: 'half_spread', options: [{ line: '0.0', odds: 2.1 }] },
  ]);
  assert.equal(harmonicTest.harmonic_profile, 'SOFT_FIRST_HALF_SECOND_HALF_BURST');

  // 18. League tier & table pressure test
  const tierTest = evaluateLeagueTierDisparityAndTablePressure(
    {
      home_team: { rank: 19 },
      away_team: { rank: 3 },
    },
    '英格兰超级联赛'
  );
  assert.equal(tierTest.relegation_desperation_defense_boost, true);
  assert.equal(tierTest.home_points_urgency_multiplier, 1.35);

  // 19. First-goal resilience test
  const {
    evaluateFirstGoalAndComebackResilience,
    evaluateBothTeamsToScoreJointProbability,
    evaluatePassAccuracyAndMidfieldProgression,
    evaluateStartingLineupAgeAndLateFatigue,
    evaluateGoalkeeperSaveQualityAndRegression,
    evaluateExtremeDrawCompressionAndCollusion,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const resilienceTest = evaluateFirstGoalAndComebackResilience({
    trend_summary: {
      home: { table: [{ score_first_win: 9, score_first_total: 10, concede_first_points: 1, concede_first_total: 5 }] },
    },
  }, { home: 1, away: 0 });
  assert.equal(resilienceTest.resilience_profile, 'IRON_LEAD_PROTECTOR');
  assert.equal(resilienceTest.home_first_goal_win_rate_pct, 90.0);

  // 20. BTTS Joint Probability test
  const bttsTest = evaluateBothTeamsToScoreJointProbability({}, 1.8, 1.5);
  assert.equal(bttsTest.btts_profile, 'HIGH_DUAL_NET_FIREPOWER');
  assert.ok(bttsTest.theoretical_joint_btts_prob_pct >= 60.0);

  // 21. Pass accuracy & MPE test
  const passProgTest = evaluatePassAccuracyAndMidfieldProgression({
    home: { pass_accuracy: 88, dangerous_attacks: 40, attacks: 60 },
    away: { pass_accuracy: 65, dangerous_attacks: 10, attacks: 30 },
  }, 60);
  assert.equal(passProgTest.forced_turnover_hazard_away, true);
  assert.equal(passProgTest.progression_profile, 'FORCED_TURNOVER_COLLAPSE_RISK');

  // 22. Lineup age & late fatigue test
  const ageTest = evaluateStartingLineupAgeAndLateFatigue({
    home_starters: [{ age: 22 }, { age: 23 }, { age: 24 }],
    away_starters: [{ age: 31 }, { age: 32 }, { age: 33 }],
  }, 75);
  assert.equal(ageTest.veteran_late_fatigue_risk_70plus, true);
  assert.ok(ageTest.away_avg_age >= 31.0);

  // 23. Goalkeeper save quality test
  const gkTest = evaluateGoalkeeperSaveQualityAndRegression({
    away: { saves: 6 },
    home: { shots_on_target: 7 },
  }, 70);
  assert.equal(gkTest.goalkeeper_god_mode_active, true);
  assert.equal(gkTest.late_regression_leak_risk, false);

  // 24. Extreme draw compression test
  const drawCompTest = evaluateExtremeDrawCompressionAndCollusion([
    {
      market: 'full_1x2',
      options: [
        { side: 'home', odds: 2.70 },
        { side: 'draw', odds: 2.50 },
        { side: 'away', odds: 3.10 },
      ],
    },
  ], 2.5);
  assert.equal(drawCompTest.is_extreme_draw_compression, true);
  assert.equal(drawCompTest.market_draw_odds, 2.50);

  // 25. Box shot penetration test
  const {
    evaluateBoxShotPenetrationAndDesperation,
    evaluateYellowCardAccelerationAndBoilingPoint,
    evaluateHomeAwayPolarizationDisparity,
    evaluateHeadToHeadTacticalNemesis,
    evaluateOverUnderStreakBiasAndReversion,
    evaluateQuarterLineAsymmetricCushion,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const boxTest = evaluateBoxShotPenetrationAndDesperation({
    home: { shots: 10, shots_inside_box: 1, shots_on_target: 1 },
    away: { shots: 4, shots_inside_box: 3, shots_on_target: 3 },
  }, 50);
  assert.equal(boxTest.home_desperation_long_shot_trap, true);
  assert.equal(boxTest.box_penetration_profile, 'STERILE_OUTSIDE_BOX_DESPERATION');

  // 26. Yellow card acceleration test
  const cardAccelTest = evaluateYellowCardAccelerationAndBoilingPoint({
    incidents: [
      { minute: 58, type: 'yellow_card' },
      { minute: 62, type: 'yellow_card' },
      { minute: 67, type: 'yellow_card' },
    ],
  }, 70);
  assert.equal(cardAccelTest.boiling_point_red_card_imminent, true);
  assert.equal(cardAccelTest.card_acceleration_profile, 'BOILING_POINT_ESCALATION');

  // 27. Home away polarization test
  const polarTest = evaluateHomeAwayPolarizationDisparity({
    home_team: { home_wins: 8, home_played: 10 },
    away_team: { away_losses: 7, away_played: 10 },
  }, '主队', '客队');
  assert.equal(polarTest.is_fortress_vs_frailty_resonance, true);
  assert.equal(polarTest.home_team_home_win_rate_pct, 80.0);

  // 28. H2H nemesis test
  const h2hTest = evaluateHeadToHeadTacticalNemesis({
    trend_summary: {
      history: [
        { result: 'home_win' },
        { result: 'home_win' },
        { result: 'home_win' },
        { result: 'home_win' },
        { result: 'draw' },
      ],
    },
  });
  assert.equal(h2hTest.nemesis_profile, 'HOME_NEMESIS_DOMINANCE');
  assert.equal(h2hTest.home_h2h_spread_win_rate_pct, 80.0);

  // 29. OU streak bias test
  const ouStreakTest = evaluateOverUnderStreakBiasAndReversion({
    trend_summary: {
      over_under: { continuous_over: 6 },
    },
  }, [{ market: 'full_total', options: [{ line: '3.25', odds: 1.95 }] }]);
  assert.equal(ouStreakTest.over_total_market_overheat_trap, true);
  assert.equal(ouStreakTest.ou_streak_profile, 'OVERHEAT_OVER_TRAP');

  // 30. Quarter line cushion test
  const quarterTest = evaluateQuarterLineAsymmetricCushion([
    {
      market: 'full_spread',
      options: [
        { side: 'home', line: '-0.75', odds: 1.90 },
        { side: 'away', line: '+0.75', odds: 1.98 },
      ],
    },
  ]);
  assert.equal(quarterTest.is_quarter_line_market, true);
  assert.equal(quarterTest.half_loss_cushion_advantage, true);

  // 31. VAR trauma test
  const {
    evaluateVarInterventionAndMoraleTrauma,
    evaluateClinicalFinishingPurity,
    evaluateHalfTimeFullTimeTransitionMatrix,
    evaluateLateOddsJuiceDropAndTrapValve,
    evaluateCornerVelocityAndFalsePressureSkew,
    evaluateInPlaySubstitutionFreshLegsImpact,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const varTest = evaluateVarInterventionAndMoraleTrauma({
    incidents: [
      { minute: 60, text: 'VAR取消进球 (越位在先)' },
    ],
  }, 68);
  assert.equal(varTest.var_goal_cancelled, true);
  assert.equal(varTest.var_recent_shock_active_15min, true);
  assert.equal(varTest.var_trauma_profile, 'RECENT_VAR_GOAL_DISALLOWED_SLUMP');

  // 32. Clinical finishing test
  const finishingTest = evaluateClinicalFinishingPurity({
    home: { shots_on_target: 8 },
    away: { shots_on_target: 2 },
  }, { home: 0, away: 2 });
  assert.equal(finishingTest.home_sterile_shots_trap, true);
  assert.equal(finishingTest.away_clinical_killer_advantage, true);
  assert.equal(finishingTest.finishing_profile, 'HOME_STERILE_TARGET_TRAP');

  // 33. HT/FT transition matrix test
  const htFtTest = evaluateHalfTimeFullTimeTransitionMatrix({
    trend_summary: {
      half_full: { win_win: 2, win_draw: 3, win_loss: 1 },
    },
  }, { home: 1, away: 0 }, 50);
  assert.equal(htFtTest.ht_lead_collapse_hazard, true);
  assert.equal(htFtTest.ht_ft_transition_profile, 'FREQUENT_HT_LEAD_COLLAPSE');

  // 34. Late odds juice drop test
  const juiceTest = evaluateLateOddsJuiceDropAndTrapValve([
    {
      market: 'full_spread',
      options: [
        { side: 'home', odds: 1.72 },
        { side: 'away', odds: 2.15 },
      ],
    },
  ]);
  assert.equal(juiceTest.is_ultra_low_juice_trap, true);
  assert.equal(juiceTest.favorite_juice_level, 1.72);
  assert.equal(juiceTest.juice_drop_profile, 'LOW_JUICE_TRAP_VALVE');

  // 35. Corner velocity test
  const cornerVelTest = evaluateCornerVelocityAndFalsePressureSkew({
    home: { corners: 6, shots_on_target: 1 },
    away: { corners: 3, shots_on_target: 0 },
  }, 40);
  assert.equal(cornerVelTest.is_sterile_corner_inflation, true);
  assert.equal(cornerVelTest.corner_velocity_profile, 'STERILE_CORNER_DEFLECTION_INFLATION');

  // 36. In-play substitution test
  const inPlaySubTest = evaluateInPlaySubstitutionFreshLegsImpact({
    incidents: [
      { minute: 61, text: '主队换人: 换上中锋 前锋' },
      { minute: 66, text: '主队换人: 换上边锋' },
    ],
  }, 70);
  assert.equal(inPlaySubTest.fresh_legs_tempo_acceleration_window, true);
  assert.equal(inPlaySubTest.sub_impact_profile, 'ATTACKING_FRESH_LEGS_TEMPO_BURST');

  // 37. Stoppage time drama test
  const {
    evaluateStoppageTimeExpansionAndLateDrama,
    evaluateDerbyMatchTacticalDeformation,
    evaluatePenaltyConversionAndVulnerability,
    evaluateHalfTimeTacticalReadjustmentSurge,
    evaluatePostRedCardDeepBlockResistance,
    evaluateMultiAwayRoadFatigueAndTravelDrag,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const stoppageTest = evaluateStoppageTimeExpansionAndLateDrama({
    incidents: [
      { minute: 50, text: 'VAR介入检视' },
      { minute: 65, text: 'VAR确认点球' },
      { minute: 70, text: '换人' },
      { minute: 75, text: '担架入场 伤退' },
    ],
  }, 88);
  assert.equal(stoppageTest.is_extended_stoppage_time_drama, true);
  assert.ok(stoppageTest.estimated_stoppage_minutes >= 6);

  // 38. Derby match deformation test
  const derbyTest = evaluateDerbyMatchTacticalDeformation('英超', '阿森纳', '热刺');
  assert.equal(derbyTest.is_derby_fixture, true);
  assert.equal(derbyTest.derby_name, '北伦敦德比');
  assert.equal(derbyTest.spread_compression_damping_factor, 0.70);

  // 39. Penalty vulnerability test
  const penaltyTest = evaluatePenaltyConversionAndVulnerability({
    trend_summary: { penalties_scored: 1, penalties_total: 3 },
  }, {
    home: { fouls: 16, shots_inside_box: 6 },
    away: { fouls: 15, shots_inside_box: 5 },
  });
  assert.equal(penaltyTest.box_foul_vulnerability_hazard, true);
  assert.equal(penaltyTest.penalty_profile, 'HIGH_PENALTY_VULNERABILITY');

  // 40. Half-time readjustment test
  const htSurgeTest = evaluateHalfTimeTacticalReadjustmentSurge({
    home: { dangerous_attacks: 25 },
    away: { dangerous_attacks: 20 },
  }, 50);
  assert.equal(htSurgeTest.is_locker_room_tactical_surge, true);
  assert.equal(htSurgeTest.readjustment_profile, 'ELITE_LOCKER_ROOM_SURGE');

  // 41. Bus parking test
  const busParkingTest = evaluatePostRedCardDeepBlockResistance({
    incidents: [{ minute: 40, text: '客队后卫 红牌罚下' }],
  }, {
    home: { shots_on_target: 3 },
    away: { shots_on_target: 1 },
  }, 70);
  assert.equal(busParkingTest.has_red_card, true);
  assert.equal(busParkingTest.is_fortress_10_man_low_block, true);
  assert.equal(busParkingTest.bus_parking_profile, 'FORTRESS_10_MAN_BUS_PARK');

  // 42. Road fatigue test
  const roadFatigueTest = evaluateMultiAwayRoadFatigueAndTravelDrag({
    trend_summary: {
      history: [
        { venue: 'away' },
        { venue: 'away' },
        { venue: 'away' },
      ],
    },
  }, '切尔西');
  assert.equal(roadFatigueTest.is_road_weariness_exhaustion, true);
  assert.equal(roadFatigueTest.consecutive_away_games_count, 3);
  assert.equal(roadFatigueTest.road_fatigue_profile, 'CONSECUTIVE_AWAY_ROAD_EXHAUSTION');

  // 43. Big chance backlash test
  const {
    evaluateBigChanceMissedAndBacklashVulnerability,
    evaluateDeadRubberAggregateBlowoutStall,
    evaluateTwoLegAggregateTiedExtraTimeAversion,
    evaluateMassivePreEuropeSquadRotationHazard,
    evaluateStalemateBreakthroughFloodgateEffect,
    evaluateSetPieceDefensiveMarkingLeak,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const bigChanceTest = evaluateBigChanceMissedAndBacklashVulnerability({
    incidents: [
      { minute: 30, text: '主队前锋 击中门柱' },
      { minute: 42, text: '主队前锋 单刀被扑' },
    ],
  }, {}, 45);
  assert.equal(bigChanceTest.is_counter_backlash_vulnerability, true);
  assert.equal(bigChanceTest.big_chances_missed_count, 2);
  assert.equal(bigChanceTest.backlash_profile, 'SEVERE_BIG_CHANCE_MISS_BACKLASH');

  // 44. Dead rubber blowout test
  const deadRubberTest = evaluateDeadRubberAggregateBlowoutStall({
    trend_summary: { first_leg_score: { home: 4, away: 0 } },
  }, '欧冠淘汰赛');
  assert.equal(deadRubberTest.is_aggregate_blowout_dead_rubber, true);
  assert.equal(deadRubberTest.first_leg_lead_margin, 4);
  assert.equal(deadRubberTest.blowout_profile, 'AGGREGATE_BLOWOUT_STALL');

  // 45. Two-leg extra-time aversion test
  const extraTimeTest = evaluateTwoLegAggregateTiedExtraTimeAversion({
    trend_summary: { first_leg_score: { home: 1, away: 0 } },
  }, '欧洲冠军联赛', { home: 1, away: 0 }, 80);
  assert.equal(extraTimeTest.is_extra_time_stall_inertia, true);
  assert.equal(extraTimeTest.extra_time_profile, 'EXTRA_TIME_STALL_INERTIA');

  // 46. Massive squad rotation test
  const rotationTest = evaluateMassivePreEuropeSquadRotationHazard({
    home_starters: ['主力1', '主力2', '替补A(替)', '替补B(替)', '替补C(替)', '替补D(替)', '替补E(替)', '主力8', '主力9', '主力10', '主力11'],
  }, {});
  assert.equal(rotationTest.is_massive_squad_rotation_hazard, true);
  assert.ok(rotationTest.estimated_rotation_ratio >= 0.40);
  assert.equal(rotationTest.rotation_profile, 'MASSIVE_SQUAD_ROTATION_HAZARD');

  // 47. Stalemate floodgate test
  const stalemateTest = evaluateStalemateBreakthroughFloodgateEffect({ home: 1, away: 0 }, 65, {
    incidents: [{ minute: 60, text: '主队进球' }],
  });
  assert.equal(stalemateTest.is_stalemate_floodgate_active, true);
  assert.equal(stalemateTest.stalemate_profile, 'STALEMATE_BREAKTHROUGH_FLOODGATE');

  // 48. Set piece marking leak test
  const setPieceTest = evaluateSetPieceDefensiveMarkingLeak({
    home: { corners: 6, fouls: 15, header_shots: 4 },
    away: { corners: 5, fouls: 14, header_shots: 1 },
  }, {});
  assert.equal(setPieceTest.is_set_piece_aerial_marking_leak, true);
  assert.equal(setPieceTest.aerial_leak_profile, 'SET_PIECE_AERIAL_MARKING_LEAK');

  // 49. Engines 55-60 tests
  const {
    evaluateExhaustedSubstitutionsAndInjuredStraggler,
    evaluateBackupGoalkeeperSubstitutionCollapse,
    evaluateMultiRedCardChaosAndSpaceExplosion,
    evaluateZeroShotOnTargetSurgeAndMeanReversion,
    evaluateTwoGoalDeficitCapitulationAndCollapse,
    evaluateHighFrequencyOffsideTrapBreakdown,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  // 55. Exhausted substitutions test
  const exhaustedSubTest = evaluateExhaustedSubstitutionsAndInjuredStraggler({
    incidents: [
      { minute: 60, text: '主队换人' },
      { minute: 65, text: '主队换人' },
      { minute: 70, text: '主队换人' },
      { minute: 72, text: '主队换人' },
      { minute: 74, text: '主队换人' },
      { minute: 78, text: '主队后卫 抽筋接受医疗' },
    ],
  }, 80);
  assert.equal(exhaustedSubTest.is_exhausted_substitutions_straggler, true);
  assert.equal(exhaustedSubTest.straggler_profile, 'EXHAUSTED_SUB_INJURY_HAZARD');

  // 56. Backup GK test
  const backupGkTest = evaluateBackupGoalkeeperSubstitutionCollapse({
    incidents: [{ minute: 25, text: '主队主力门将 伤退换下，替补门将上场' }],
  });
  assert.equal(backupGkTest.is_backup_gk_in_play, true);
  assert.equal(backupGkTest.gk_collapse_profile, 'BACKUP_GK_CONFIDENCE_COLLAPSE');

  // 57. Multi-red card test
  const multiRedTest = evaluateMultiRedCardChaosAndSpaceExplosion({
    incidents: [
      { minute: 35, text: '主队后卫 红牌罚下' },
      { minute: 70, text: '客队中场 红牌罚下' },
    ],
  });
  assert.equal(multiRedTest.is_multi_red_card_chaos, true);
  assert.equal(multiRedTest.total_red_cards_count, 2);
  assert.equal(multiRedTest.space_explosion_profile, 'MULTI_RED_CARD_SPACE_EXPLOSION');

  // 58. Zero SOT mean reversion test
  const zeroSotTest = evaluateZeroShotOnTargetSurgeAndMeanReversion({
    home: { shots: 11, shots_on_target: 1 },
    away: { shots: 4, shots_on_target: 2 },
  }, 45);
  assert.equal(zeroSotTest.is_zero_sot_mean_reversion_due, true);
  assert.equal(zeroSotTest.reversion_profile, 'EXTREME_ZERO_SOT_MEAN_REVERSION');

  // 59. Two-goal deficit capitulation test
  const deficitTest = evaluateTwoGoalDeficitCapitulationAndCollapse({ home: 2, away: 0 }, 75, {
    away: { possession: 32 },
  });
  assert.equal(deficitTest.is_two_goal_deficit_capitulation, true);
  assert.equal(deficitTest.deficit_profile, 'TWO_GOAL_DEFICIT_CAPITULATION');

  // 60. High-frequency offside trap breakdown test
  const offsideTrapTest = evaluateHighFrequencyOffsideTrapBreakdown({
    home: { offsides: 4 },
    away: { offsides: 2 },
  }, 60);
  assert.equal(offsideTrapTest.is_offside_trap_collapse_imminent, true);
  assert.equal(offsideTrapTest.total_offsides_count, 6);
  assert.equal(offsideTrapTest.trap_breakdown_profile, 'HIGH_FREQUENCY_OFFSIDE_BREAKDOWN');

  // 50. Engines 61-66 tests
  const {
    evaluatePlayoffExtraTimeDrawInertiaAndPenaltyHorizon,
    evaluateFavoriteHalfTimeDeficitRageSurge,
    evaluateTrailingGoalkeeperPushUpAndEmptyNetCounter,
    evaluateUltraLongStoppageTimeDragAndBuzzerBeater,
    evaluateComfortableLeadComplacencyAndConsolationGoal,
    evaluateHomeWinlessDesperationAndFanPressure,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  // 61. Playoff extra time inertia test
  const playoffTest = evaluatePlayoffExtraTimeDrawInertiaAndPenaltyHorizon('德甲升级附加赛', { home: 1, away: 1 }, 80);
  assert.equal(playoffTest.is_playoff_draw_penalty_inertia, true);
  assert.equal(playoffTest.playoff_profile, 'PLAYOFF_EXTRA_TIME_PENALTY_INERTIA');

  // 62. Favorite HT rage surge test
  const favRageTest = evaluateFavoriteHalfTimeDeficitRageSurge({ home: 0, away: 1 }, 50, { home: 1.35 });
  assert.equal(favRageTest.is_favorite_ht_rage_surge, true);
  assert.equal(favRageTest.surge_profile, 'FAVORITE_HT_RAGE_COMEBACK_SURGE');

  // 63. Trailing GK push-up test
  const gkPushTest = evaluateTrailingGoalkeeperPushUpAndEmptyNetCounter({
    incidents: [{ minute: 92, text: '落后方角球，门将压上禁区' }],
  }, { home: 1, away: 2 }, 94, '英格兰足总杯');
  assert.equal(gkPushTest.is_gk_push_up_empty_net_risk, true);
  assert.equal(gkPushTest.empty_net_profile, 'TRAILING_GK_PUSH_UP_EMPTY_NET');

  // 64. Ultra-long stoppage beater test
  const ultraStoppageTest = evaluateUltraLongStoppageTimeDragAndBuzzerBeater({
    incidents: [
      { minute: 75, text: 'VAR介入进球取消' },
      { minute: 88, text: 'VAR介入点球判罚' },
    ],
  }, 95);
  assert.equal(ultraStoppageTest.is_ultra_long_stoppage_beater, true);
  assert.equal(ultraStoppageTest.stoppage_beater_profile, 'ULTRA_LONG_STOPPAGE_BUZZER_BEATER');

  // 65. Comfortable lead consolation test
  const consolationTest = evaluateComfortableLeadComplacencyAndConsolationGoal({ home: 4, away: 0 }, 78, {
    incidents: [
      { minute: 60, text: '主队换人' },
      { minute: 65, text: '主队换人' },
      { minute: 70, text: '主队换人' },
      { minute: 75, text: '主队换人' },
    ],
  });
  assert.equal(consolationTest.is_comfortable_lead_consolation_risk, true);
  assert.equal(consolationTest.consolation_profile, 'COMFORTABLE_LEAD_CONSOLATION_BTTS');

  // 66. Home winless desperation push test
  const winlessTest = evaluateHomeWinlessDesperationAndFanPressure({}, {
    home_form: 'LLDDL',
  }, '埃弗顿');
  assert.equal(winlessTest.is_home_winless_desperation_push, true);
  assert.equal(winlessTest.fan_pressure_profile, 'HOME_WINLESS_DESPERATION_PUSH');

  // 67. Newly promoted late deflation test
  const {
    evaluateNewlyPromotedEuphoriaAndLateDeflation,
    evaluateTopGoalscorerEarlyInjuryAndFinishingVacuum,
    evaluateSlipperyWetPitchAndGoalkeeperFumble,
    evaluateSequentialRedCardTemporalAsymmetry,
    evaluateSuperSubInstantImpactAndColdTouchPenaltyHazard,
    evaluateCleanFirstHalfDisciplineAndSecondHalfBoiling,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const promotedTest = evaluateNewlyPromotedEuphoriaAndLateDeflation('英超', '伊普斯维奇', '曼城', 75, { home: 1, away: 2 });
  assert.equal(promotedTest.is_promoted_late_deflation_risk, true);
  assert.equal(promotedTest.promoted_profile, 'PROMOTED_LATE_DEFLATION_COLLAPSE');

  // 68. Top scorer early injury test
  const scorerInjTest = evaluateTopGoalscorerEarlyInjuryAndFinishingVacuum({
    incidents: [
      { minute: 30, text: '主队主力前锋伤退' },
    ],
  }, 45);
  assert.equal(scorerInjTest.is_top_scorer_injured_early, true);
  assert.equal(scorerInjTest.finishing_vacuum_profile, 'TOP_SCORER_INJURY_FINISHING_VACUUM');

  // 69. Slippery pitch fumble test
  const fumbleTest = evaluateSlipperyWetPitchAndGoalkeeperFumble('暴雨 8°C', {
    shots: { home: 8, away: 6 },
  });
  assert.equal(fumbleTest.is_slippery_pitch_fumble_risk, true);
  assert.equal(fumbleTest.fumble_profile, 'SLIPPERY_PITCH_GK_FUMBLE_HAZARD');

  // 70. Sequential red card temporal asymmetry test
  const seqRedTest = evaluateSequentialRedCardTemporalAsymmetry({
    incidents: [
      { minute: 25, text: '主队红牌' },
      { minute: 60, text: '客队红牌' },
    ],
  });
  assert.equal(seqRedTest.is_sequential_red_card_asymmetry, true);
  assert.equal(seqRedTest.temporal_gap_minutes, 35);
  assert.equal(seqRedTest.asymmetry_profile, 'SEQUENTIAL_RED_CARD_FATIGUE_GAP');

  // 71. Super-sub impact window test
  const subImpactTest = evaluateSuperSubInstantImpactAndColdTouchPenaltyHazard({
    incidents: [
      { minute: 70, text: '主队换人' },
    ],
  }, 73);
  assert.equal(subImpactTest.is_super_sub_impact_window, true);
  assert.equal(subImpactTest.sub_impact_profile, 'SUPER_SUB_INSTANT_IMPACT_HAZARD');

  // 72. Clean first half discipline second half boiling test
  const cardBoilTest = evaluateCleanFirstHalfDisciplineAndSecondHalfBoiling({
    yellow_cards: { home: 1, away: 0 },
  }, 70, 1.25);
  assert.equal(cardBoilTest.is_second_half_card_boiling, true);
  assert.equal(cardBoilTest.escalation_profile, 'SECOND_HALF_CARD_ESCALATION_BOILING');

  // 73. Interim manager bounce test
  const {
    evaluateInterimManagerDebutBounceAndTacticalUncertainty,
    evaluateGoalkeeperAerialClaimVsFlappingDanger,
    evaluateEarlyMissedPenaltyPsychologicalReversal,
    evaluateHighTurnoverRecoveryAndTransitionLethality,
    evaluateCentralCongestionAndFlankIsolationSkew,
    evaluatePostTournamentNationalTeamFatigueAndLetdown,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const interimTest = evaluateInterimManagerDebutBounceAndTacticalUncertainty({
    commentary: '球队本场迎来新帅首秀',
  }, '切尔西');
  assert.equal(interimTest.is_interim_manager_bounce, true);
  assert.equal(interimTest.manager_profile, 'INTERIM_MANAGER_DEBUT_BOUNCE');

  // 74. Goalkeeper aerial flapping test
  const gkAerialTest = evaluateGoalkeeperAerialClaimVsFlappingDanger({
    corners: { home: 5, away: 4 },
    crosses: { home: 12, away: 10 },
  }, 65);
  assert.equal(gkAerialTest.is_gk_aerial_vulnerability, true);
  assert.equal(gkAerialTest.aerial_profile, 'GOALKEEPER_AERIAL_FLAPPING_HAZARD');

  // 75. Early missed penalty reversal test
  const missedPenTest = evaluateEarlyMissedPenaltyPsychologicalReversal({
    incidents: [
      { minute: 12, text: '主队点球被门将神勇扑出' },
    ],
  }, 25);
  assert.equal(missedPenTest.is_early_missed_penalty_reversal, true);
  assert.equal(missedPenTest.reversal_profile, 'EARLY_MISSED_PENALTY_MORALE_COLLAPSE');

  // 76. High turnover transition test
  const turnoverTest = evaluateHighTurnoverRecoveryAndTransitionLethality({
    dangerous_attacks: { home: 35, away: 25 },
  }, 60);
  assert.equal(turnoverTest.is_high_turnover_lethal, true);
  assert.equal(turnoverTest.transition_profile, 'HIGH_TURNOVER_TRANSITION_LETHAL');

  // 77. Central congestion flank vacuum test
  const congestionTest = evaluateCentralCongestionAndFlankIsolationSkew({
    blocked_shots: { home: 4, away: 3 },
  }, { home: 0, away: 1 }, 75);
  assert.equal(congestionTest.is_central_congestion_flank_vacuum, true);
  assert.equal(congestionTest.congestion_profile, 'CENTRAL_CONGESTION_FLANK_VACUUM');

  // 78. National team fatigue letdown test
  const natFatigueTest = evaluatePostTournamentNationalTeamFatigueAndLetdown({
    news: '多名国脚经历国家队比赛日归队',
  }, '英超', 70);
  assert.equal(natFatigueTest.is_national_team_fatigue_letdown, true);
  assert.equal(natFatigueTest.fatigue_profile, 'NATIONAL_TEAM_FATIGUE_LETDOWN');

  // 79. Sweeper keeper hazard test
  const {
    evaluateSweeperKeeperHighLineClearanceHazard,
    evaluateEarlyRedCardUnderdogCounterEfficiency,
    evaluateConsecutiveCornerWaveFatigueAndSecondBallThreat,
    evaluateLongThrowInCatapultHazard,
    evaluateLateGameTimeWastingAndFrustrationEscalation,
    evaluatePostEuropeanMidweekAwayFixtureEnergyDip,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  const sweeperTest = evaluateSweeperKeeperHighLineClearanceHazard({
    offsides: { home: 3, away: 3 },
  }, 60);
  assert.equal(sweeperTest.is_sweeper_keeper_hazard, true);
  assert.equal(sweeperTest.sweeper_profile, 'SWEEPER_KEEPER_HIGH_LINE_RISK');

  // 80. Early red counter skew test
  const earlyRedTest = evaluateEarlyRedCardUnderdogCounterEfficiency({
    red_cards: { home: 1, away: 0 },
  }, 30, { home_win: 1.45 });
  assert.equal(earlyRedTest.is_early_red_counter_skew, true);
  assert.equal(earlyRedTest.skew_profile, 'FAVORITE_TEN_MAN_OPEN_BACKLINE');

  // 81. Consecutive corner wave test
  const cornerWaveTest = evaluateConsecutiveCornerWaveFatigueAndSecondBallThreat({
    corners: { home: 6, away: 3 },
  }, 65);
  assert.equal(cornerWaveTest.is_consecutive_corner_wave, true);
  assert.equal(cornerWaveTest.corner_wave_profile, 'CONSECUTIVE_CORNER_WAVE_SECOND_BALL_THREAT');

  // 82. Long throw catapult threat test
  const longThrowTest = evaluateLongThrowInCatapultHazard({
    commentary: '客队大力手抛球掷入禁区制造混乱',
  }, '英甲');
  assert.equal(longThrowTest.is_long_throw_catapult_threat, true);
  assert.equal(longThrowTest.throw_profile, 'LONG_THROW_TACTICAL_CATAPULT');

  // 83. Late time wasting escalation test
  const lateWastingTest = evaluateLateGameTimeWastingAndFrustrationEscalation({
    fouls: { home: 12, away: 10 },
  }, { home: 1, away: 0 }, 82);
  assert.equal(lateWastingTest.is_late_time_wasting_card_boiling, true);
  assert.equal(lateWastingTest.wasting_profile, 'LATE_TIME_WASTING_FRUSTRATION_CARDS');

  // 84. Post Europe away dip test
  const europeDipTest = evaluatePostEuropeanMidweekAwayFixtureEnergyDip({
    news: '周四欧联杯客场苦战后周末联赛客战',
  }, '西甲', 65);
  assert.equal(europeDipTest.is_post_europe_away_energy_dip, true);
  assert.equal(europeDipTest.energy_profile, 'POST_EUROPE_AWAY_ENERGY_DIP');

  // 85-90 Tests
  const {
    evaluateFirstHalfEarlyConcedingComebackSurge,
    evaluateLateDefensiveSubFiveAtTheBackFortress,
    evaluateArtificialTurfPitchDisparity,
    evaluateGoalkeeperDirectLaunchAndAerialDuelChannel,
    evaluateCornerPhysicalAltercationAndSetPieceScuffleHazard,
    evaluateInvertedFullbackTransitionSpaceExposure,
  } = await import('../server/services/advancedTacticalQuantitativeEngines');

  // 85. Early conceding comeback surge test
  const earlyConcedeTest = evaluateFirstHalfEarlyConcedingComebackSurge(
    { home: 0, away: 1 },
    20,
    { home_win: 1.40 },
    { home: { shots: 5 }, away: { shots: 1 } }
  );
  assert.equal(earlyConcedeTest.is_early_conceding_comeback_surge, true);
  assert.equal(earlyConcedeTest.surge_profile, 'FAVORITE_EARLY_CONCEDE_PRESSURE_SURGE');

  // 86. Late defensive 5-back fortress test
  const lateFiveBackTest = evaluateLateDefensiveSubFiveAtTheBackFortress(
    { substitutions: '换上后卫变阵五后卫' },
    { home: 1, away: 0 },
    80
  );
  assert.equal(lateFiveBackTest.is_late_five_back_fortress, true);
  assert.equal(lateFiveBackTest.fortress_profile, 'LATE_FIVE_AT_THE_BACK_FORTRESS');

  // 87. Artificial turf disparity test
  const artificialTurfTest = evaluateArtificialTurfPitchDisparity(
    { venue: '人工草皮球场' },
    '瑞典超'
  );
  assert.equal(artificialTurfTest.is_artificial_turf_disparity, true);
  assert.equal(artificialTurfTest.turf_profile, 'ARTIFICIAL_TURF_PITCH_DISPARITY');

  // 88. GK direct launch test
  const gkLaunchTest = evaluateGoalkeeperDirectLaunchAndAerialDuelChannel(
    {
      passes: { home: 120, away: 110 },
      fouls: { home: 10, away: 9 },
    },
    60
  );
  assert.equal(gkLaunchTest.is_direct_launch_aerial_duel, true);
  assert.equal(gkLaunchTest.launch_profile, 'DIRECT_LONG_LAUNCH_TARGET_MAN');

  // 89. Set piece scuffle cards test
  const setPieceScuffleTest = evaluateCornerPhysicalAltercationAndSetPieceScuffleHazard(
    {
      corners: { home: 5, away: 4 },
      fouls: { home: 11, away: 10 },
    },
    60
  );
  assert.equal(setPieceScuffleTest.is_set_piece_scuffle_card_hazard, true);
  assert.equal(setPieceScuffleTest.scuffle_profile, 'SET_PIECE_PHYSICAL_ALTERCATION_HAZARD');

  // 90. Inverted fullback flank space exposure test
  const invertedFullbackTest = evaluateInvertedFullbackTransitionSpaceExposure(
    { tactics: '采用内收边后卫体系' },
    50
  );
  assert.equal(invertedFullbackTest.is_inverted_fullback_space_exposed, true);
  assert.equal(invertedFullbackTest.flank_profile, 'INVERTED_FULLBACK_FLANK_VACUUM_EXPOSED');

  // Master synthesis test
  const master = buildMasterTacticalSynthesis(
    {
      ybty_home: '阿森纳',
      ybty_away: '切尔西',
      league: '英超',
      weather: '中雨 15°C',
      referee: '吉尔·曼萨诺',
      lineups: {
        home_starters: ['门将1', '后卫2', '后卫3', '后卫4', '后卫5', '中场6', '中场7', '中场8', '前锋9', '前锋10', '前锋11'],
        away_starters: ['门将1', '后卫2', '后卫3', '后卫4', '后卫5', '中场6', '中场7', '中场8', '前锋9', '前锋10', '前锋11'],
      },
      live_statistics: {
        home: { dangerous_attacks: 30, shots: 6, corners: 4 },
        away: { dangerous_attacks: 20, shots: 3, corners: 2 },
      },
      score: { home: 0, away: 0 },
    },
    55,
    []
  );
  assert.ok(master.master_tactical_summary_zh.length > 20);
  assert.ok(master.weather_pitch_physics);
  assert.ok(master.referee_discipline);
  assert.ok(master.game_state_lead_preservation);
  assert.ok(master.goal_time_bucket_asymmetry);
  assert.ok(master.multi_bookmaker_dispersion);
  assert.ok(master.margin_distribution_dce);
  assert.ok(master.knockout_aggregate_dynamics);
  assert.ok(master.possession_efficiency);
  assert.ok(master.box_shot_penetration);
  assert.ok(master.clinical_finishing);
  assert.ok(master.tactical_foul_drag);
  assert.ok(master.card_acceleration);
  assert.ok(master.offside_line_physics);
  assert.ok(master.league_tier_pressure);
  assert.ok(master.home_away_polarization);
  assert.ok(master.head_to_head_nemesis);
  assert.ok(master.streak_momentum);
  assert.ok(master.ou_streak_bias);
  assert.ok(master.half_full_harmonic_spread);
  assert.ok(master.quarter_line_cushion);
  assert.ok(master.late_juice_trap);
  assert.ok(master.var_trauma);
  assert.ok(master.ht_ft_transition_matrix);
  assert.ok(master.corner_velocity);
  assert.ok(master.in_play_sub_impact);
  assert.ok(master.first_goal_resilience);
  assert.ok(master.btts_joint_probability);
  assert.ok(master.pass_accuracy_progression);
  assert.ok(master.lineup_age_fatigue);
  assert.ok(master.goalkeeper_save_quality);
  assert.ok(master.extreme_draw_compression);
  assert.ok(master.bus_parking_resistance);
  assert.ok(master.stoppage_time_drama);
  assert.ok(master.derby_match_deformation);
  assert.ok(master.penalty_vulnerability);
  assert.ok(master.ht_tactical_readjustment);
  assert.ok(master.road_fatigue_drag);
  assert.ok(master.big_chance_backlash);
  assert.ok(master.dead_rubber_blowout_stall);
  assert.ok(master.extra_time_stall_aversion);
  assert.ok(master.squad_rotation_hazard);
  assert.ok(master.stalemate_floodgate);
  assert.ok(master.set_piece_marking_leak);
  assert.ok(master.exhausted_sub_straggler);
  assert.ok(master.backup_gk_collapse);
  assert.ok(master.multi_red_card_chaos);
  assert.ok(master.zero_sot_reversion);
  assert.ok(master.two_goal_deficit_collapse);
  assert.ok(master.offside_trap_breakdown);
  assert.ok(master.playoff_draw_penalty_inertia);
  assert.ok(master.favorite_ht_rage_surge);
  assert.ok(master.trailing_gk_push_up);
  assert.ok(master.ultra_long_stoppage_beater);
  assert.ok(master.comfortable_lead_consolation);
  assert.ok(master.home_winless_desperation);
  assert.ok(master.promoted_deflation);
  assert.ok(master.top_scorer_injury);
  assert.ok(master.slippery_pitch_fumble);
  assert.ok(master.sequential_red_card_asymmetry);
  assert.ok(master.super_sub_impact);
  assert.ok(master.card_escalation_boiling);
  assert.ok(master.interim_manager_bounce);
  assert.ok(master.goalkeeper_aerial_flapping);
  assert.ok(master.early_missed_penalty);
  assert.ok(master.high_turnover_transition);
  assert.ok(master.central_congestion_flank);
  assert.ok(master.national_team_fatigue);
  assert.ok(master.sweeper_keeper_hazard);
  assert.ok(master.early_red_counter_skew);
  assert.ok(master.consecutive_corner_wave);
  assert.ok(master.long_throw_catapult);
  assert.ok(master.late_time_wasting_cards);
  assert.ok(master.post_europe_away_dip);
  assert.ok(master.late_five_back_fortress);
  assert.ok(master.early_conceding_comeback_surge);
  assert.ok(master.artificial_turf_disparity);
  assert.ok(master.goalkeeper_direct_launch);
  assert.ok(master.set_piece_scuffle_cards);
  assert.ok(master.inverted_fullback_flank_vacuum);
});




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
  const runPythonWorker = () => new Promise<void>((resolve, reject) => {
    const child = spawn('python', ['tests/json_lock_worker.py', target, '20'], { cwd: process.cwd(), stdio: 'pipe' });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
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

test('normalizeMatchPredictionsAndAssessments expands compact predictions into 12 categories', () => {
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
  assert.equal(normalized.market_assessments.length, 12); // 5 bettable real markets + 7 expanded predictions
  const scorePred = normalized.market_assessments.find((a: any) => a.category === '波胆');
  assert.equal(scorePred?.direction, '2-1');
  assert.equal(scorePred?.status, 'prediction');
  const bttsPred = normalized.market_assessments.find((a: any) => a.category === '双方是否进球');
  assert.equal(bttsPred?.direction, '是');
  const timingPred = normalized.market_assessments.find((a: any) => a.category === '进球时间段');
  assert.equal(timingPred?.direction, '61-75分钟');

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



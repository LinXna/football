import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLeisuInterfaceExport } from '../src/lib/leisuInterfaceImport';
import { buildPromptInterfaceContext } from '../server/services/promptInterfaceFeatures';

test('normalizes extension interface fields into the CODEX Leisu import contract', () => {
  const items = normalizeLeisuInterfaceExport({
    export_version: '2.8.0-interface',
    export_type: 'leisu_interface_data',
    captured_at: '2026-08-16T00:00:00.000Z',
    results: [{
      match_id: '123', available: true, complete: true, completeness: { odds: true },
      formal: {
        static_match: {
          id: 123, matchTime: 1786838400,
          homeTeam: { name: '主队' }, awayTeam: { name: '客队' },
          competition: { name: '测试联赛' }, environment: { weather: '晴' },
        },
        live_match: {
          source: '/api/v3/f/vd', match_id: 123, status_id: 2,
          home_scores: { score: 1 }, away_scores: { score: 0 },
          confirmed_statistics: {
            corners: { home: 2, away: 1 },
            shots_on_target: { home: 5, away: 4 },
            shots_off_target: { home: 5, away: 4 },
          },
          text_live: [{ time: "17'", data: '事件' }],
        },
        odds: { markets: { total_goals: { live: { line: '2.5' } } } },
        head_to_head: [{ match_id: 1 }], recent_matches: { home: [], away: [] },
        league_standings: { home_team: {} }, goal_distribution: { home: {} },
        trend_summary: { home: {} }, lineup: { home: [{ name: '球员甲' }], away: [] },
      },
    }],
  });

  assert.ok(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].source_type, 'leisu');
  assert.equal(items[0].home, '主队');
  assert.equal(items[0].away, '客队');
  assert.equal(items[0].league, '测试联赛');
  assert.deepEqual(items[0].score, { home: 1, away: 0 });
  assert.equal(items[0].minute, 17);
  assert.equal(items[0].export_mode, 'live');
  assert.equal(items[0].score_verified, true);
  assert.deepEqual(items[0].live_statistics.corners, { home: 2, away: 1 });
  assert.equal(items[0].live_statistics.shots.home, 10);
  assert.equal(items[0].live_statistics.shot_total_complete, false);
  assert.equal(items[0].live_statistics.efficiency.by_attacking_side.home.attack.goal_conversion_per_recorded_shot, 0.1);
  assert.equal(items[0].live_statistics.efficiency.by_attacking_side.home.opposing_goalkeeper.save_rate, 0.8);
  assert.equal(items[0].recent_trends.historical_analysis.head_to_head.length, 1);
  assert.equal(items[0].player_candidates[0].name, '球员甲');
  assert.equal(items[0].detail_context.formal.odds.markets.total_goals.live.line, '2.5');
});

test('returns null for unrelated JSON and maps status 1 as prematch', () => {
  assert.equal(normalizeLeisuInterfaceExport({ matches: [] }), null);
  const items = normalizeLeisuInterfaceExport({
    export_type: 'leisu_interface_data', results: [{ match_id: '9', formal: {
      static_match: { matchTime: 1786838400, homeTeam: { name: 'A' }, awayTeam: { name: 'B' } },
      live_match: { match_id: 9, status_id: 1, home_scores: { score: 0 }, away_scores: { score: 0 } },
    } }],
  });
  assert.equal(items?.[0].export_mode, 'prematch');
  assert.equal(items?.[0].is_live, false);
});

test('all exported formal modules survive import and are referenced by prediction prompts', () => {
  const formal = {
    static_match: { homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' }, environment: { weather: 'clear' } },
    live_match: {
      match_id: 88, status_id: 2, home_scores: { score: 1 }, away_scores: { score: 0 },
      confirmed_statistics: { corners: { home: 3, away: 2 }, shots_on_target: { home: 4, away: 2 }, shots_off_target: { home: 3, away: 4 } },
      text_live: [{ time: "20'", data: 'shot saved' }],
    },
    opening_odds: { source: 'opening' },
    odds: { company_name: '3*', markets: { total_goals: { initial: { line: '2.0' }, live: { line: '2.5' } } } },
    analysis_match_context: { record: { status_id: 2 } },
    head_to_head: [{ home_scores: [1], away_scores: [0] }],
    future_schedule: { home: [{ match_id: 99 }] },
    recent_matches: { home: [{ goals: 2 }], away: [{ goals: 1 }] },
    league_standings: { home_team: { total: { points: 10 } } },
    goal_distribution: { home: { first_half: 2 } },
    trend_summary: { home: 'W' },
    lineup: { confirmed: true, home: [{ name: 'Home Player' }], away: [{ name: 'Away Player' }] },
  };
  const [item] = normalizeLeisuInterfaceExport({
    export_type: 'leisu_interface_data', export_version: '2.8.0', results: [{ match_id: 88, formal }],
  })!;
  const context = buildPromptInterfaceContext(item);

  assert.deepEqual(new Set(context.source_formal_field_manifest), new Set(Object.keys(formal)));
  assert.equal(context.source_formal_payload, formal);
  assert.equal(context.reference_company_odds.markets.total_goals.live.line, '2.5');
  assert.equal(context.opening_odds.source, 'opening');
  assert.deepEqual(context.match_statistics.corners, { home: 3, away: 2 });
  assert.equal(context.live_commentary.events[0].text, 'shot saved');
  assert.equal(context.squad_and_lineup.confirmed, true);
  assert.equal(context.player_candidates.length, 2);
  assert.equal(context.head_to_head.length, 1);
  assert.equal(context.recent_matches.home[0].goals, 2);
  assert.equal(context.future_schedule.home[0].match_id, 99);
  assert.equal(context.league_standings.home_team.total.points, 10);
  assert.equal(context.goal_distribution.home.first_half, 2);
  assert.equal(context.trend_summary.home, 'W');
  assert.equal(context.match_environment.weather, 'clear');
  assert.ok(context.live_efficiency.by_attacking_side.home.attack.goal_conversion_per_recorded_shot > 0);
});

/**
 * P1-15 专项回归验证：H2H / recent-form 时间锚点不得 fallback 到 Date.now()
 *
 * 根因：resolveMatchAnchorTimestamp 在无 created_at / beijing_start_time 时 return Date.now()，
 * 离线/次日回放会得到错误的"现在"时间，污染 H2H 与 recent-form 的时间衰减（样本时间不确定）。
 * 修复：无可靠时间锚点时返回 null，下游样本统一标记 invalid。
 */
import assert from 'node:assert';
import type { CanonicalMatch } from '../02_canonical_model/types.js';
import { resolveMatchAnchorTimestamp, calculateH2HDecayWeights } from '../03_quant_engine/h2hDecay.js';
import { calculateRecentFormWeights } from '../03_quant_engine/recentForm.js';

const matchNoTime = {
  canonical_id: 'p1_15_no_time',
  home_team_name: 'Alpha', away_team_name: 'Beta',
  // 无 created_at、无 timing.beijing_start_time
  reference: {
    home_team_id: 1001, away_team_id: 1002,
    tactical_context: {
      h2h_raw: [
        { match_id: 'h1', match_time: 1700000000000, home_team_id: 1001, away_team_id: 1002, home_team_name: 'Alpha', away_team_name: 'Beta', home_scores: [1], away_scores: [0] }
      ],
      home_recent_matches: [
        { match_id: 'r1', match_time: 1700000000000, home_team_name: 'Alpha', away_team_name: 'Gamma', fulltime_score: { home: 1, away: 0 }, halftime_score: { home: 0, away: 0 } }
      ],
      away_recent_matches: []
    }
  }
} as unknown as CanonicalMatch;

// 1. 无可靠时间锚点 → 必须返回 null，而非 Date.now()
const anchor = resolveMatchAnchorTimestamp(matchNoTime);
assert.equal(anchor, null, `P1-15: 无可靠时间锚点必须返回 null，实际 ${anchor}`);

// 2. H2H 样本在无锚点时全部 invalid
const h2h = calculateH2HDecayWeights(matchNoTime, 365, null);
assert.ok(h2h.weights.length > 0, '测试样本应存在');
assert.ok(h2h.weights.every((w) => !w.is_valid), 'P1-15: 无锚点时 H2H 样本必须全部 invalid');
assert.equal(h2h.analytics.valid_count, 0, `P1-15: 无锚点时 H2H valid_count 必须为 0，实际 ${h2h.analytics.valid_count}`);

// 3. recent-form 样本在无锚点时全部 invalid（时间窗口失效）
const recent = calculateRecentFormWeights(matchNoTime, null);
assert.ok(recent.home.length > 0, '测试样本应存在');
assert.ok(recent.home.every((w) => !w.is_valid_time_window), 'P1-15: 无锚点时 recent-form 样本时间窗口必须全部失效');
assert.equal(recent.home_analytics.valid_count, 0, `P1-15: 无锚点时 recent valid_count 必须为 0，实际 ${recent.home_analytics.valid_count}`);

console.log('✅ P1-15 time anchor no-Date.now fallback verified');

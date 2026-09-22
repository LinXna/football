/**
 * Verification Suite: Physical Fact & Timeline Staleness Data Consistency Circuit Breaker
 * 验证数据断流与物理事实分裂硬熔断机制：
 * 1. 时序断流比对 (当前比赛分钟数与危攻时序点阵长度脱节 > 3 分钟)
 * 2. 事实比对：记分牌进球 vs 事件轴进球事件 (主客独立对账，杜绝总和掩盖)
 * 3. 事实比对：技术统计角球 vs 事件轴角球事件 (主客独立对账)
 * 4. 事实比对：技术统计红牌 vs 事件轴红牌事件 (主客独立对账)
 * 5. 准入硬熔断：isMatchQuantEligible 强制返回 eligible: false，禁止任何量化定价与推荐生成
 * 6. 用户真实场景复现：七月二十二队 (当前 65 分钟仅 15 分钟时序，且 5 球仅记录 1 球) 严密拦截
 */

import assert from 'node:assert/strict';
import { auditDataConsistency } from '../02_canonical_model/dataConsistencyAuditor.js';
import { isMatchQuantEligible, calculateQuantitativeFeatures } from '../03_quant_engine/index.js';
import { assembleCanonicalMatch, extractAiEvaluationBrief } from '../02_canonical_model/canonicalMatchAssembler.js';
import { 
  MatchStage, 
  DataCompletenessTier, 
  MissingDataReason, 
  MatchAlignmentStatus, 
  LeagueMatchStatus 
} from '../02_canonical_model/enums.js';
import type { 
  CanonicalMatch, 
  TimingInfo, 
  ScoreInfo, 
  ReferenceData, 
  AlignmentDecision 
} from '../02_canonical_model/types.js';

console.log('================================================================');
console.log('Running Data Consistency Circuit Breaker Verification Suite');
console.log('================================================================');

// --------------------------------------------------------------------------
// 1. 时序断流独立测试 (Timeline Staleness Test)
// --------------------------------------------------------------------------
console.log('\n[TEST 1] Testing Timeline Staleness Audit...');

// 场景 1.1: 正常比赛 45 分钟，时序点阵 43 点 (滞后 2 分钟 <= 3 分钟容差，通过)
const auditNormal = auditDataConsistency({
  timing: { stage: MatchStage.LIVE, minute: 45 },
  score: { current: { home: 1, away: 0 } },
  reference: {
    attack_momentum_timeline: Array(43).fill({ minute: 1, home: 20, away: 10 }),
    timeline_events: [
      { minute: 23, canonical_type: 'GOAL', team_side: 'home', raw_text: '进球' },
      { minute: 10, canonical_type: 'CORNER', team_side: 'home', raw_text: '角球' },
      { minute: 15, canonical_type: 'CORNER', team_side: 'home', raw_text: '角球' },
      { minute: 30, canonical_type: 'CORNER', team_side: 'home', raw_text: '角球' },
      { minute: 12, canonical_type: 'CORNER', team_side: 'away', raw_text: '角球' },
      { minute: 35, canonical_type: 'CORNER', team_side: 'away', raw_text: '角球' }
    ],
    stats: { corners: { home: 3, away: 2 }, red_cards: { home: 0, away: 0 } }
  }
});
assert.equal(auditNormal.is_timeline_stale, false, '滞后2分钟不应被判定为断流');
assert.equal(auditNormal.has_critical_inconsistency, false, '正常赛事不应触发熔断');
console.log('  ✓ 场景 1.1 通过: 正常推进赛事未误触熔断');

// 场景 1.2: 七月二十二队真实异常 - 当前第 65 分钟，时序仅 15 点 (滞后 50 分钟 > 3 分钟)
const auditStale = auditDataConsistency({
  timing: { stage: MatchStage.LIVE, minute: 65 },
  score: { current: { home: 2, away: 3 } },
  reference: {
    attack_momentum_timeline: Array(15).fill({ minute: 1, home: 20, away: 10 }),
    timeline_events: [
      { minute: 12, canonical_type: 'GOAL', team_side: 'home', raw_text: '进球' }
    ],
    stats: { corners: { home: 5, away: 4 }, red_cards: { home: 0, away: 0 } }
  }
});
assert.equal(auditStale.is_timeline_stale, true, '滞后50分钟必须触发断流告警');
assert.equal(auditStale.timeline_stale_lag, 50);
assert.equal(auditStale.has_critical_inconsistency, true, '断流必须触发严重不自洽');
assert.ok(auditStale.block_reasons.some(r => r.includes('时序严重断流')), '必须包含时序断流说明');
console.log('  ✓ 场景 1.2 通过: 七月二十二队 15 分钟时序断流被准确识别并拦截');


// --------------------------------------------------------------------------
// 2. 主客分开对账测试 (Side-by-Side Separation & Anti-Summation-Masking)
// --------------------------------------------------------------------------
console.log('\n[TEST 2] Testing Side-by-Side Audit (Prevent Summation Masking)...');

// 场景 2.1: 总和相等，但主客错位！
// 记分牌：主 2 - 客 1 (总和 3)
// 事件轴：主 1 - 客 2 (总和 3) -> 若只比较总和则会漏报！必须双方独立对账
const auditSumMask = auditDataConsistency({
  timing: { stage: MatchStage.LIVE, minute: 30 },
  score: { current: { home: 2, away: 1 } },
  reference: {
    attack_momentum_timeline: Array(29).fill({ minute: 1, home: 10, away: 10 }),
    timeline_events: [
      { minute: 10, canonical_type: 'GOAL', team_side: 'home', raw_text: '主进球' },
      { minute: 15, canonical_type: 'GOAL', team_side: 'away', raw_text: '客进球1' },
      { minute: 25, canonical_type: 'GOAL', team_side: 'away', raw_text: '客进球2' }
    ]
  }
});
assert.equal(auditSumMask.is_home_goal_mismatch, true, '主队进球不符必须被检出');
assert.equal(auditSumMask.is_away_goal_mismatch, true, '客队进球不符必须被检出');
assert.equal(auditSumMask.has_critical_inconsistency, true, '主客错位必须触发熔断');
console.log('  ✓ 场景 2.1 通过: 成功杜绝主客错位总和掩盖漏洞');

// 场景 2.2: 角球与红牌独立对账
// 技术统计：主角球 4 / 客角球 2，主红牌 1 / 客红牌 0
// 事件轴：只有 1 个客角球，无主角球事件；红牌事件缺失
const auditCornersAndCards = auditDataConsistency({
  timing: { stage: MatchStage.LIVE, minute: 40 },
  score: { current: { home: 0, away: 0 } },
  reference: {
    attack_momentum_timeline: Array(39).fill({ minute: 1, home: 10, away: 10 }),
    timeline_events: [
      { minute: 18, canonical_type: 'CORNER', team_side: 'away', raw_text: '角球' }
    ],
    stats: {
      corners: { home: 4, away: 2 },
      red_cards: { home: 1, away: 0 }
    }
  }
});
assert.equal(auditCornersAndCards.is_home_corner_mismatch, true, '主队角球对账不符');
assert.equal(auditCornersAndCards.is_away_corner_mismatch, true, '客队角球对账不符');
assert.equal(auditCornersAndCards.is_home_red_card_mismatch, true, '主队红牌对账不符');
assert.equal(auditCornersAndCards.is_away_red_card_mismatch, false, '客队红牌一致');
assert.equal(auditCornersAndCards.has_critical_inconsistency, true);
console.log('  ✓ 场景 2.2 通过: 角球与红牌主客独立对账完全精准');


// --------------------------------------------------------------------------
// 3. 准入硬门禁与量化引擎熔断测试 (Quant Engine Gatekeeper Verification)
// --------------------------------------------------------------------------
console.log('\n[TEST 3] Testing Quant Engine Hard Circuit Breaker...');

const mockInconsistentMatch: CanonicalMatch = {
  canonical_id: 'TEST_INCONSISTENT_MATCH',
  league: { id: 'L1', name_canonical: 'Test League', country: 'Test' },
  home_team: { id: 'H1', name_canonical: '七月二十二队' },
  away_team: { id: 'A1', name_canonical: '昆巴亚' },
  timing: { stage: MatchStage.LIVE, minute: 65, period: '2H', is_running: true },
  score: {
    home_score: 2,
    away_score: 3,
    home_half_score: 1,
    away_half_score: 1,
    score_verified: true,
    score_source: 'LEISU_INTERFACE',
    is_mismatch_detected: false,
    var_overturned_goals_count: 0
  },
  alignment: {
    status: MatchAlignmentStatus.MATCHED_AUTO,
    confidence: 90,
    source: 'AUTO_HIGH_CONFIDENCE',
    ybty_match_id: 'yb1',
    leisu_match_id: 'ls1',
    aligned_at: '2026-09-18'
  },
  markets: [],
  reference: {
    source: 'LEISU',
    last_synced_at: '2026-09-18',
    attack_momentum_timeline: Array(15).fill({ minute: 1, home: 30, away: 10 }),
    timeline_events: [
      { minute: 10, canonical_type: 'GOAL', team_side: 'home', raw_text: '主进球1' }
    ],
    stats: { corners: { home: 6, away: 5 }, red_cards: { home: 0, away: 0 } }
  },
  completeness_tier: DataCompletenessTier.TIER_INVALID,
  missing_reasons: [MissingDataReason.TIMELINE_STALE, MissingDataReason.EVENT_FACTS_MISMATCH],
  data_consistency_audit: {
    has_critical_inconsistency: true,
    is_timeline_stale: true,
    stale_lag_minutes: 50,
    is_home_goal_mismatch: true,
    is_away_goal_mismatch: true,
    is_home_corner_mismatch: true,
    is_away_corner_mismatch: true,
    is_home_red_card_mismatch: false,
    is_away_red_card_mismatch: false,
    block_reasons: [
      '时序严重断流：当前比赛第 65 分钟，但危攻时序点阵仅提供 15 分钟数据（滞后 50 分钟）',
      '主队进球事实不自洽：记分牌显示 2 球，但事件轴仅记录 1 个进球事件',
      '客队进球事实不自洽：记分牌显示 3 球，但事件轴仅记录 0 个进球事件',
      '主队角球事实不自洽：技术统计显示 6 个，但事件轴仅记录 0 个角球事件',
      '客队角球事实不自洽：技术统计显示 5 个，但事件轴仅记录 0 个角球事件'
    ],
    summary_reason: '底层数据物理断流/事实分裂（已硬性熔断禁止推荐）：时序严重断流；主客进球分裂；主客角球分裂'
  }
};

// 3.1 准入函数拦截
const eligibility = isMatchQuantEligible(mockInconsistentMatch);
assert.equal(eligibility.eligible, false, '数据不一致的赛事必须返回 eligible: false');
assert.ok(eligibility.reason?.includes('底层数据物理断流/事实分裂'), '必须返回清晰的熔断原因说明');
console.log('  ✓ 场景 3.1 通过: isMatchQuantEligible 成功剥夺准入资格');

// 3.2 强行调用量化引擎必须抛出阻断异常
let didThrow = false;
try {
  calculateQuantitativeFeatures(mockInconsistentMatch);
} catch (err: any) {
  didThrow = true;
  assert.ok(err.message.includes('数据物理断流/事实分裂'), '异常消息必须准确反映熔断事实');
}
assert.equal(didThrow, true, '调用 calculateQuantitativeFeatures 必须硬性抛错拒绝计算');
console.log('  ✓ 场景 3.2 通过: calculateQuantitativeFeatures 成功熔断并阻断下游推荐产生');


// --------------------------------------------------------------------------
// 4. 端到端组装器与 AI 简报测试 (Canonical Match Assembler & AI Brief)
// --------------------------------------------------------------------------
console.log('\n[TEST 4] Testing Canonical Match Assembler Integration...');

const mockYbty = {
  league: '厄瓜甲',
  home: '七月二十二队',
  away: '昆巴亚',
  home_score: 2,
  away_score: 3,
  clock: '65:00',
  clock_status: '2H 20:00',
  is_live: true,
  markets: []
};

const mockLeisu = {
  match_id: 'LS_9999',
  competition: '厄瓜甲',
  home_team: '七月二十二队',
  away_team: '昆巴亚',
  commence_time: '2026-09-18 10:00:00',
  status_text: '下半场',
  is_live: true,
  score: { home: 2, away: 3 },
  stats: {
    corners: { home: 6, away: 5 },
    red_cards: { home: 0, away: 0 }
  },
  timeline_events: [
    { type: 1, text: '进球', minute: 10, team: 'home' }
  ],
  attack_momentum: {
    available: true,
    data: [
      [10, 20, -10, 0, 15, -25, 30, 10, -5, 0, 10, 20, -15, 0, 10] // 仅 15 分钟
    ]
  }
};

const mockDecision: AlignmentDecision = {
  decision: MatchAlignmentStatus.MATCHED_AUTO,
  confidence: 95,
  source: 'AUTO_HIGH_CONFIDENCE',
  ybty_match: mockYbty,
  leisu_match: {
    match_id: mockLeisu.match_id,
    competition: mockLeisu.competition,
    home_team: mockLeisu.home_team,
    away_team: mockLeisu.away_team,
    commence_time: mockLeisu.commence_time,
    status_text: mockLeisu.status_text,
    is_live: true
  },
  team_names: {
    ybty_home: mockYbty.home,
    ybty_away: mockYbty.away,
    leisu_home: mockLeisu.home_team,
    leisu_away: mockLeisu.away_team,
    home_similarity: 1,
    away_similarity: 1,
    home_alias_exact_hit: true,
    away_alias_exact_hit: true
  },
  league_match: {
    ybty_league: mockYbty.league,
    leisu_league: mockLeisu.competition,
    status: LeagueMatchStatus.MATCHED,
    similarity: 1,
    is_alias_exact_hit: true
  },
  league_match_score: 1,
  is_swapped_suspected: false,
  alignment_reason: '测试对齐'
};

const assembled = assembleCanonicalMatch(mockYbty, mockLeisu, mockDecision);
assert.equal(assembled.completeness_tier, DataCompletenessTier.TIER_INVALID, '异常比赛层级必须为 TIER_INVALID');
assert.ok(assembled.missing_reasons.includes(MissingDataReason.TIMELINE_STALE), '必须标记 TIMELINE_STALE');
assert.ok(assembled.missing_reasons.includes(MissingDataReason.EVENT_FACTS_MISMATCH), '必须标记 EVENT_FACTS_MISMATCH');
assert.equal(assembled.data_consistency_audit?.has_critical_inconsistency, true, '数据一致性审计必须标记严重异常');

const brief = extractAiEvaluationBrief(assembled);
assert.ok(brief.data_deficits.some(r => r.includes('TIMELINE_STALE')), 'AI简报中必须显式暴露 TIMELINE_STALE 阻断原因');

console.log('  ✓ 场景 4 通过: 组装器全自动审计、评级降至 TIER_INVALID 并注销推荐资格');

console.log('\n================================================================');
console.log('ALL VERIFICATION CHECKS PASSED: DATA CONSISTENCY CIRCUIT BREAKER IS ARMORED!');
console.log('================================================================\n');

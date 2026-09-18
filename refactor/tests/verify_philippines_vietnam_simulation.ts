import assert from 'node:assert/strict';
import { calculateQuantitativeFeatures } from '../03_quant_engine/index.js';
import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage, MatchAlignmentStatus } from '../02_canonical_model/enums.js';

console.log('================================================================');
console.log('🔍 [Simulation Test] 菲律宾U23 vs 越南U23 (半场 0-0) 修复前后量化特征核查');
console.log('================================================================\n');

const match: CanonicalMatch = {
  canonical_id: 'philippines_u23_vs_vietnam_u23_ht00',
  home_team_name: '菲律宾U23',
  away_team_name: '越南U23',
  league_name: '东南亚U23锦标赛',
  alignment: {
    status: MatchAlignmentStatus.MATCHED_AUTO,
    confidence: 100,
    method: 'AUTOMATIC_EXACT'
  },
  timing: {
    stage: MatchStage.LIVE,
    minute: 45,
    is_half_time: true,
    is_extra_time: false,
    is_overtime_or_penalty: false,
    status_text: '中场',
    ybty_display_clock: '45'
  },
  score: {
    home_score: 0,
    away_score: 0,
    home_half_score: 0,
    away_half_score: 0,
    score_verified: true,
    score_source: 'CANVAS_OCR',
    is_mismatch_detected: false
  },
  markets: {
    full_h2h: { home_odds: 7.50, draw_odds: 4.20, away_odds: 1.38 },
    full_spread_main: {
      line_index: 0,
      home_selection: '+1',
      home_odds: 1.83,
      away_selection: '-1',
      away_odds: 1.99,
      settlement_basis: 'FULL_MATCH' as any
    },
    full_spread_subs: [],
    full_total_main: {
      line_index: 0,
      line: '1.5/2',
      over_odds: 1.88,
      under_odds: 1.92,
      settlement_basis: 'FULL_MATCH' as any
    },
    full_total_subs: [],
    half_h2h: null,
    half_spread_main: null,
    half_total_main: null
  },
  reference: {
    company_name: '3*',
    initial: null,
    pregame: null,
    live: {
      match_winner: { home_odds: 7.50, draw_odds: 4.20, away_odds: 1.38 },
      asian_handicap: { home_odds: 0.83, line: -1.0, away_odds: 0.99 }, // 客让1球
      total_goals: { over_odds: 0.88, line: 1.75, under_odds: 0.92 },
      corners: null
    },
    stats: {
      possession: { home: 26, away: 74 },
      shots: { home: 0, away: 11 },
      shots_on_target: { home: 0, away: 4 },
      shots_off_target: { home: 0, away: 7 },
      attacks: { home: 35, away: 95 },
      dangerous_attacks: { home: 11, away: 68 },
      corners: { home: 1, away: 5 },
      yellow_cards: { home: 2, away: 0 },
      red_cards: { home: 0, away: 0 }
    } as any,
    timeline_events: [], // 事件流为空 (导致问题1的根源)
    historical_dna: null,
    prematch_context: null
  }
};

const qf = calculateQuantitativeFeatures(match);

console.log('📊 1. 动量与三源融合特征 (Momentum & Threat Trinity):');
console.log('   - 优势进攻方:', qf.spatio_temporal_events.goal_climax.attacking_side);
console.log('   - 战术相变态 (Regime):', qf.spatio_temporal_events.regime.current_regime);
console.log('   - 主队 (菲律宾U23) 转化定级:', qf.spatio_temporal_events.epi.home.classification);
console.log('   - 客队 (越南U23) 转化定级:', qf.spatio_temporal_events.epi.away.classification);
console.log('   - 三源冲突标识 (Trinity Conflict):', qf.spatio_temporal_events.live_threat_trinity.has_material_conflict);

console.log('\n⚽ 2. 滚球泊松衰减与破防模型 (Poisson Decay & Breakthrough):');
console.log('   - 菲律宾U23 下半场剩余进球期望 (λ_home):', qf.poisson.lambda_home_rest);
console.log('   - 越南U23 下半场剩余进球期望 (λ_away):', qf.poisson.lambda_away_rest);
console.log('   - 全场下半场预期总进球 (Expected Goals Rest):', qf.poisson.expected_goals_rest);
console.log('   - Top 比分分布:', qf.poisson.top_final_scores.map(s => `${s.home}-${s.away}(${s.percentage_str})`));
console.log('   - 下半场客胜(越南进球多于菲律宾)概率:', (qf.poisson.full_time_probabilities!.prob_away_win * 100).toFixed(1) + '%');

console.log('\n💰 3. 盘口赔率去抽水与期望值 (Devig & EV):');
if (qf.devig.spread_main_ev) {
  console.log('   - 让球盘口:', qf.devig.spread_main_ev.home_line, 'vs', qf.devig.spread_main_ev.away_line);
  console.log('   - 菲律宾U23 (+1) EV:', (qf.devig.spread_main_ev.home_ev * 100).toFixed(2) + '%');
  console.log('   - 越南U23 (-1) EV:', (qf.devig.spread_main_ev.away_ev * 100).toFixed(2) + '%');
  console.log('   - 让球模型偏好侧 (Preferred Side):', qf.devig.spread_main_ev.preferred_side);
  console.log('   - 菲律宾U23 (+1) 胜平负结算分布:', qf.devig.spread_main_ev.home_settlement_distribution);
}

if (qf.devig.total_main_ev) {
  console.log('   - 大小球盘口:', qf.devig.total_main_ev.line);
  console.log('   - 大球 EV:', (qf.devig.total_main_ev.over_ev * 100).toFixed(2) + '%');
  console.log('   - 小球 EV:', (qf.devig.total_main_ev.under_ev * 100).toFixed(2) + '%');
  console.log('   - 大小球偏好侧 (Preferred Side):', qf.devig.total_main_ev.preferred_side);
}

console.log('\n================================================================');
console.log('🎯 核心指标断言核验:');
console.log('================================================================');

// 断言 1: 优势进攻方必须判定为客队 (越南U23)，战术相变态必须判定为单边高压围攻 (CRUSHING_EXPANSION)
assert.equal(qf.spatio_temporal_events.goal_climax.attacking_side, 'away', 'Attacking side must be away (Vietnam)');
assert.equal(qf.spatio_temporal_events.regime.current_regime, 'CRUSHING_EXPANSION', 'Regime must be CRUSHING_EXPANSION, not NEUTRAL_EQUILIBRIUM');
console.log('✅ 断言 1 通过: 成功识别单边高压围攻态 (CRUSHING_EXPANSION)，未陷入均势误区！');

// 断言 2: 客队进球期望必须大幅碾压主队 (λ_away 至少是 λ_home 的 4 倍以上)
assert.ok(
  qf.poisson.lambda_away_rest >= qf.poisson.lambda_home_rest * 4.0,
  `λ_away (${qf.poisson.lambda_away_rest}) 必须至少为 λ_home (${qf.poisson.lambda_home_rest}) 的 4 倍`
);
console.log('✅ 断言 2 通过: 攻守对偶破防机制生效，越南U23 λ_away (' + qf.poisson.lambda_away_rest + ') 绝对碾压菲律宾U23 (' + qf.poisson.lambda_home_rest + ')！');

// 断言 3: 下半场总进球期望不得人为塌缩至 0.8 以下 (消除小球虚假超高 EV)
assert.ok(
  qf.poisson.expected_goals_rest >= 1.05,
  `下半场总进球期望 (${qf.poisson.expected_goals_rest}) 必须 >= 1.05，杜绝小球虚高`
);
console.log('✅ 断言 3 通过: 破防疲劳渗漏保障了真实总进球期望 (' + qf.poisson.expected_goals_rest + ')，杜绝虚假小球 EV！');

// 断言 4: 菲律宾U23 (+1) 的 EV 绝不能出现 +20% 以上的虚假暴利推荐
if (qf.devig.spread_main_ev) {
  assert.ok(
    qf.devig.spread_main_ev.home_ev < 0.20,
    `菲律宾+1 的 EV 必须降至安全阈值以下 (< 20%)，实际为: ${(qf.devig.spread_main_ev.home_ev * 100).toFixed(2)}%`
  );
  console.log('✅ 断言 4 通过: 防线崩溃与连环失球修正生效，菲律宾+1 虚假高 EV 已被压制！实际 EV: ' + (qf.devig.spread_main_ev.home_ev * 100).toFixed(2) + '%');
}

console.log('\n🎉 所有针对 菲律宾U23 vs 越南U23 的关键指标断言 100% 验证通过！\n');

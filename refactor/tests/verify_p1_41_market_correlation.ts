import assert from 'assert';
import { applyPortfolioRiskFilters } from '../05_portfolio_risk/riskFilter.js';
import { RecommendationGrade } from '../04_ai_evaluator/enums.js';
import { AiEvaluationResult, RecommendedLeg } from '../04_ai_evaluator/types.js';
import { Layer03CandidatePipeline } from '../03_quant_engine/types.js';
import { FormalRecommendation } from '../05_portfolio_risk/types.js';

/**
 * P1-41 专项回归测试：
 * 同一比赛多 market / secondary lines 的组合相关性控制。
 *  - market cluster dedup：同场同底层投注族（胜负/进球）同方向只保留一条；
 *  - per-match exposure cap：同场所有 leg 总量上限（含历史台账）。
 */

const unlockedPipeline: Layer03CandidatePipeline = {
  state: 'PRODUCTION_UNLOCKED',
  raw_signal_count: 1,
  oos_validated_count: 1,
  machine_candidate_count: 1,
  validations: [],
  blockers: [],
  transitions: []
};

function makeLeg(market: string, direction: RecommendedLeg['direction'], line = '-0.5'): RecommendedLeg {
  return { market, selected_line: line, current_odds: 1.9, minimum_acceptable_odds: 1.8, direction, basis: 'test' };
}

function makeEval(matchId: string, legs: RecommendedLeg[]): AiEvaluationResult {
  return {
    candidate_pipeline: unlockedPipeline,
    match_id: matchId,
    match: 'A vs B',
    evaluation_time: '',
    grade: RecommendationGrade.A_GRADE,
    confidence_score: 90,
    blind_spot_analysis: {} as any,
    internal_logical_audit: '',
    qualitative_summary: '',
    risk_warnings: [],
    recommended_legs: legs
  };
}

function makeExisting(matchId: string, market: string, direction: RecommendedLeg['direction']): FormalRecommendation {
  return {
    record_id: `existing-${market}-${direction}`,
    record_type: 'formal_ai_recommendation',
    formal_recommendation: true,
    stage: 'LIVE',
    created_at_utc: '',
    match_id: matchId,
    kickoff_time: '',
    teams: { home: 'A', away: 'B' },
    league_key: 'TEST',
    candidate_pipeline_state: 'PRODUCTION_UNLOCKED',
    condition_snapshot: { match_minute: "LIVE 10'", current_score: '0-0', score_verified: true, source: 'YBTY' },
    ai_assessment: { grade: RecommendationGrade.A_GRADE, confidence_score: 90, blind_spot_analysis: {} as any, internal_logical_audit: '', qualitative_summary: '' },
    leg: makeLeg(market, direction),
    prediction_snapshot: { model_version: 'test', prediction_at: '', market, line: '-0.5', odds: 1.9, model_probability: 0.55, predicted_lambda: { home: 1, away: 1 }, minute: 10, score_at_recommendation: '0-0', score_verified: true, score_source: 'YBTY', red_card_state: 'NONE' }
  };
}

let passed = 0;
function check(name: string, cond: boolean): void {
  assert(cond, `[FAIL] ${name}`);
  passed++;
  console.log(`[OK] ${name}`);
}

// Test 1: 同场同 cluster（OUTRIGHT）同方向去重 —— AH_MAIN HOME + EURO_1X2 HOME 只保留一条
{
  const r = applyPortfolioRiskFilters({
    existing_ledger: [],
    incoming_evaluation: makeEval('m1', [
      makeLeg('ASIAN_HANDICAP_MAIN', 'HOME'),
      makeLeg('EURO_1X2', 'HOME')
    ])
  });
  check('P1-41 #1: 同 OUTRIGHT 族同方向去重（AH_MAIN HOME + 1X2 HOME → 1 leg）', r.approved_legs.length === 1 && r.approved_legs[0].market === 'ASIAN_HANDICAP_MAIN');
}

// Test 2: 同场同 cluster 主/副盘同向去重 —— AH_MAIN HOME + AH_SECONDARY HOME 只保留一条
{
  const r = applyPortfolioRiskFilters({
    existing_ledger: [],
    incoming_evaluation: makeEval('m2', [
      makeLeg('ASIAN_HANDICAP_MAIN', 'HOME'),
      makeLeg('ASIAN_HANDICAP_SECONDARY', 'HOME')
    ])
  });
  check('P1-41 #2: AH 主/副盘同向去重（→ 1 leg）', r.approved_legs.length === 1 && r.approved_legs[0].market === 'ASIAN_HANDICAP_MAIN');
}

// Test 3: 同场不同 cluster 共存 —— AH_MAIN HOME + TOTAL_GOALS OVER 保留两条
{
  const r = applyPortfolioRiskFilters({
    existing_ledger: [],
    incoming_evaluation: makeEval('m3', [
      makeLeg('ASIAN_HANDICAP_MAIN', 'HOME'),
      makeLeg('TOTAL_GOALS_MAIN', 'OVER', '2')
    ])
  });
  check('P1-41 #3: 不同族（胜负 + 进球）共存（→ 2 legs）', r.approved_legs.length === 2 && r.is_approved === true);
}

// Test 4: per-match cap —— 3 条跨族推荐只保留 2 条（第 3 条被 cap 拦截）
{
  const r = applyPortfolioRiskFilters({
    existing_ledger: [],
    incoming_evaluation: makeEval('m4', [
      makeLeg('ASIAN_HANDICAP_MAIN', 'HOME'),
      makeLeg('TOTAL_GOALS_MAIN', 'OVER', '2'),
      makeLeg('EURO_1X2', 'AWAY')
    ])
  });
  check('P1-41 #4: per-match cap（3 → 2 legs）', r.approved_legs.length === 2);
}

// Test 5: 跨历史台账去重 —— existing 已有 AH_MAIN HOME，新推荐 EURO_1X2 HOME 被 cluster dedup 拦截
{
  const r = applyPortfolioRiskFilters({
    existing_ledger: [makeExisting('m5', 'ASIAN_HANDICAP_MAIN', 'HOME')],
    incoming_evaluation: makeEval('m5', [makeLeg('EURO_1X2', 'HOME')])
  });
  check('P1-41 #5: 跨台账同族同向去重（→ 0 leg，被拦）', r.approved_legs.length === 0 && r.is_approved === false);
}

// Test 6: 不同比赛互不影响 —— m6 与 m7 各自批准
{
  const r = applyPortfolioRiskFilters({
    existing_ledger: [makeExisting('m6', 'ASIAN_HANDICAP_MAIN', 'HOME')],
    incoming_evaluation: makeEval('m7', [makeLeg('ASIAN_HANDICAP_MAIN', 'HOME')])
  });
  check('P1-41 #6: 不同比赛不受同场去重影响（→ 1 leg）', r.approved_legs.length === 1 && r.is_approved === true);
}

// Test 7: 同族不同方向不去重（主 + 客），但受 per-match cap 约束（最多 2 条）
{
  const r = applyPortfolioRiskFilters({
    existing_ledger: [],
    incoming_evaluation: makeEval('m8', [
      makeLeg('ASIAN_HANDICAP_MAIN', 'HOME'),
      makeLeg('EURO_1X2', 'AWAY'),
      makeLeg('EURO_1X2', 'DRAW')
    ])
  });
  check('P1-41 #7: 同族不同方向不去重但受 cap 约束（3 → 2 legs）', r.approved_legs.length === 2);
}

console.log(`\n[OK] P1-41 market correlation control: ${passed}/7 assertions passed.`);

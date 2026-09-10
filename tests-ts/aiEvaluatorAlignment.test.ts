import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHandicapToFloat, verifyStatutoryAlignment, isQuarterOrSplitLine } from '../refactor/04_ai_evaluator/alignmentGuard.js';
import { RecommendationGrade, TacticalRegimeEvaluation, TrapDetectionResult } from '../refactor/04_ai_evaluator/enums.js';
import { EvaluatorPayload, AiEvaluationResult } from '../refactor/04_ai_evaluator/types.js';

test('parseHandicapToFloat correctly parses various handicap formats without sign inversion', () => {
  // 单值盘口
  assert.equal(parseHandicapToFloat('0.5'), 0.5);
  assert.equal(parseHandicapToFloat('-0.5'), -0.5);
  assert.equal(parseHandicapToFloat('0'), 0);
  assert.equal(parseHandicapToFloat('+0.75'), 0.75);

  // 关键四分之一盘口：防符号反转
  assert.equal(parseHandicapToFloat('-0/0.5'), -0.25);
  assert.equal(parseHandicapToFloat('0/-0.5'), -0.25);
  assert.equal(parseHandicapToFloat('0/0.5'), 0.25);
  assert.equal(parseHandicapToFloat('-0.5/-1'), -0.75);
  assert.equal(parseHandicapToFloat('2/2.5'), 2.25);
  assert.equal(parseHandicapToFloat('+0.5/1'), 0.75);
  assert.equal(parseHandicapToFloat('invalid_line'), null);
});

function createBasePayload(): EvaluatorPayload {
  return {
    ai_brief: {
      match_id: 'test_m1',
      league: '英格兰超级联赛',
      kickoff_time: '2026-09-03 20:00',
      status_summary: 'PREMATCH',
      teams: { home: '阿森纳', away: '切尔西' },
      score_verification: { is_verified: true, current_score: '0 - 0' },
      core_markets: {
        ah_main: { handicap: '-0.5', home_odds: 1.95, away_odds: 1.90 },
        ou_main: { handicap: '2.5/3', over_odds: 1.88, under_odds: 1.98 },
        euro_1x2: { home_win: 1.95, draw: 3.50, away_win: 3.80 }
      }
    },
    time_context: { statutory_minute: '0', expected_remaining_minutes_including_stoppage: 90 },
    tactical_phase_transitions: [],
    lineup_value_matrix: {
      lineup_status: 'CONFIRMED',
      is_lineup_confirmed: true,
      home: { total_value_eur: '65000万欧', lis_score: 0.95, status: '官方首发已确认' },
      away: { total_value_eur: '55000万欧', lis_score: 0.90, status: '官方首发已确认' }
    },
    team_profiling: {
      h2h_tactical_integrity: '交锋样本 5 场',
      home: { recent_timeline: '有效样本数: 5场', tactical_playstyle: '危攻: 55', market_performance: '赢盘率: 60%' },
      away: { recent_timeline: '有效样本数: 5场', tactical_playstyle: '危攻: 48', market_performance: '赢盘率: 50%' }
    },
    quant_features: {
      candidate_pipeline: { state: 'PRODUCTION_UNLOCKED' },
      devig: {},
      bdi: 1.2,
      ev_signals: [],
      risk_flags: [],
      goal_alert: 'NONE',
      confidence: 88,
      oos_semantic_status: {
        profile_status: 'VALIDATED',
        is_oos_validated: true,
        effective_sample_size: 45,
        audit_rule: 'Validated profile present'
      },
      stability_and_blockers: {
        model_stability_score: 85,
        has_major_live_conflict: false,
        blocker_count: 0,
        blockers: [],
        hard_gate_ceiling: 'A_GRADE'
      },
      machine_candidate_signals: [
        {
          market: 'ASIAN_HANDICAP_MAIN',
          line: '-0.5',
          side: 'home',
          odds: 1.95,
          ev: 0.05,
          confidence: 88,
          kelly_fraction: 0.02
        },
        {
          market: 'TOTAL_GOALS_MAIN',
          line: '2.5/3',
          side: 'over',
          odds: 1.88,
          ev: 0.05,
          confidence: 88,
          kelly_fraction: 0.02
        },
        {
          market: 'EURO_1X2',
          line: '0',
          side: 'home',
          odds: 1.95,
          ev: 0.05,
          confidence: 88,
          kelly_fraction: 0.02
        }
      ]
    }
  };
}

function createBaseResult(grade = RecommendationGrade.A_GRADE, confidence = 90): AiEvaluationResult {
  return {
    match_id: 'test_m1',
    evaluation_time: new Date().toISOString(),
    blind_spot_analysis: {
      "1_global_motivation": 'High',
      "2_asian_handicap_reality": 'Valid',
      "3_total_goals_reality": 'Valid',
      tactical_regime_evaluation: TacticalRegimeEvaluation.GENUINE_DOMINANCE,
      trap_detection_result: TrapDetectionResult.SAFE_VALUE
    },
    internal_logical_audit: 'Audit passed.',
    grade,
    confidence_score: confidence,
    qualitative_summary: 'Solid pick.',
    risk_warnings: [],
    recommended_legs: [
      {
        market: 'ASIAN_HANDICAP_MAIN',
        selected_line: '-0.5',
        current_odds: 1.95,
        minimum_acceptable_odds: 1.90,
        direction: 'HOME',
        basis: 'Model EV > 5%'
      }
    ]
  };
}

test('verifyStatutoryAlignment passes valid AH and Over/Under legs', () => {
  const payload = createBasePayload();
  const result = createBaseResult();
  
  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.grade, RecommendationGrade.A_GRADE);
  assert.equal(verified.recommended_legs.length, 1);
});

test('verifyStatutoryAlignment supports EURO_1X2 without false hallucination rejection', () => {
  const payload = createBasePayload();
  const result: AiEvaluationResult = {
    ...createBaseResult(),
    recommended_legs: [
      {
        market: 'EURO_1X2',
        selected_line: '0',
        current_odds: 1.95,
        minimum_acceptable_odds: 1.88,
        direction: 'HOME',
        basis: 'Clear home dominance'
      }
    ]
  };
  
  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.grade, RecommendationGrade.A_GRADE);
  assert.equal(verified.recommended_legs.length, 1);
  assert.equal(verified.recommended_legs[0].market, 'EURO_1X2');
});

test('verifyStatutoryAlignment rejects and overrides hallucinated odds or markets', () => {
  const payload = createBasePayload();
  const result: AiEvaluationResult = {
    ...createBaseResult(),
    recommended_legs: [
      {
        market: 'ASIAN_HANDICAP_MAIN',
        selected_line: '-0.5',
        current_odds: 2.45, // 偏离实际 1.95 极大
        minimum_acceptable_odds: 2.30,
        direction: 'HOME',
        basis: 'Hallucinated odds'
      }
    ]
  };
  
  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.grade, RecommendationGrade.REJECTED);
  assert.equal(verified.confidence_score, 0);
  assert.equal(verified.recommended_legs.length, 0);
  assert.ok(verified.risk_warnings.some(w => w.includes('AI Hallucinated Leg')));
});

test('verifyStatutoryAlignment enforces data blind-spot hard gate', () => {
  const payload = createBasePayload();
  payload.data_blind_spot_warning = '【系统最高级别警告】本场比赛存在严重的客观数据盲区: [首发阵容未公布]';
  
  // AI 给出了违规的 A 级和 95 置信度
  const result = createBaseResult(RecommendationGrade.A_GRADE, 95);
  
  const verified = verifyStatutoryAlignment(result, payload);
  // 硬性降级为 B_GRADE，置信度截断至 85
  assert.equal(verified.grade, RecommendationGrade.B_GRADE);
  assert.equal(verified.confidence_score, 85);
  assert.ok(verified.risk_warnings.some(w => w.includes('SYSTEM HARD GATE: 命中严重数据盲区铁律')));
});

test('verifyStatutoryAlignment enforces unverified score hard gate', () => {
  const payload = createBasePayload();
  payload.ai_brief.score_verification = { is_verified: false, current_score: '1 - 0' };
  
  const result = createBaseResult(RecommendationGrade.A_GRADE, 89);
  
  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.grade, RecommendationGrade.B_GRADE);
  assert.ok(verified.risk_warnings.some(w => w.includes('比分未经交叉校验')));
});

test('verifyStatutoryAlignment enforces Cup match unconfirmed lineup hard gate', () => {
  const payload = createBasePayload();
  payload.ai_brief.league = '英格兰足总杯 (FA Cup)';
  payload.lineup_value_matrix.is_lineup_confirmed = false;
  payload.lineup_value_matrix.lineup_status = 'NOT_ANNOUNCED';
  
  const result = createBaseResult(RecommendationGrade.B_GRADE, 80);
  
  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.grade, RecommendationGrade.C_GRADE);
  assert.ok(verified.risk_warnings.some(w => w.includes('杯赛/友谊赛官方首发未确认，最高维持 C 级观察')));
});

test('verifyStatutoryAlignment enforces P0-01 OOS NO_PROFILE hard gate (blocks A_GRADE)', () => {
  const payload = createBasePayload();
  payload.quant_features.oos_semantic_status = {
    profile_status: 'NO_PROFILE',
    is_oos_validated: false,
    effective_sample_size: 0,
    audit_rule: 'NO_PROFILE forbids A_GRADE'
  };

  const result = createBaseResult(RecommendationGrade.A_GRADE, 90);
  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.grade, RecommendationGrade.B_GRADE);
  assert.ok(verified.confidence_score <= 80);
  assert.ok(verified.risk_warnings.some(w => w.includes('P0-01')));
});

test('verifyStatutoryAlignment enforces P1-03 CONFIRMED_TRAP hard gate (forces REJECTED)', () => {
  const payload = createBasePayload();
  const result = createBaseResult(RecommendationGrade.B_GRADE, 80);
  result.blind_spot_analysis.trap_detection_result = TrapDetectionResult.CONFIRMED_TRAP;

  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.grade, RecommendationGrade.REJECTED);
  assert.equal(verified.confidence_score, 0);
  assert.equal(verified.recommended_legs.length, 0);
  assert.ok(verified.risk_warnings.some(w => w.includes('CONFIRMED_TRAP')));
});

test('verifyStatutoryAlignment enforces P1-04 live mathematically closed total line gate', () => {
  const payload = createBasePayload();
  payload.ai_brief.status_summary = 'LIVE 70 (2-0)';
  payload.ai_brief.score_verification = { is_verified: true, current_score: '2 - 0' };
  payload.ai_brief.core_markets.ou_main = {
    line: '1.5',
    under_odds: 1.95,
    over_odds: 1.85
  };
  payload.quant_features.machine_candidate_signals = [
    {
      market: 'TOTAL_GOALS_MAIN',
      line: '1.5',
      side: 'under',
      odds: 1.95,
      ev: 0.05,
      confidence: 80,
      kelly_fraction: 0.02
    }
  ];

  // AI 试图推荐已结清的 Under 1.5 盘口
  const result = createBaseResult(RecommendationGrade.B_GRADE, 75);
  result.recommended_legs = [
    {
      market: 'TOTAL_GOALS_MAIN',
      selected_line: '1.5',
      current_odds: 1.95,
      minimum_acceptable_odds: 1.85,
      direction: 'UNDER',
      basis: 'Erroneous evaluation of past goals'
    }
  ];

  const verified = verifyStatutoryAlignment(result, payload);
  // 已结清盘口必须被剔除，空推荐腿导致最终非 A/B 级或推荐腿为空
  assert.equal(verified.recommended_legs.length, 0);
  assert.ok(verified.risk_warnings.some(w => w.includes('P1-04')));
});

test('verifyStatutoryAlignment enforces P0-02 quarter line settlement verification gate', () => {
  const payload = createBasePayload();
  payload.ai_brief.core_markets.ah_main = {
    handicap: '-0/0.5',
    home_odds: 1.95,
    away_odds: 1.90
  };
  payload.quant_features.machine_candidate_signals = [
    {
      market: 'ASIAN_HANDICAP_MAIN',
      line: '-0/0.5',
      side: 'home',
      odds: 1.95,
      ev: 0.05,
      confidence: 80,
      kelly_fraction: 0.02
    }
  ];

  const result = createBaseResult(RecommendationGrade.B_GRADE, 75);
  result.recommended_legs = [
    {
      market: 'ASIAN_HANDICAP_MAIN',
      selected_line: '-0/0.5',
      current_odds: 1.95,
      minimum_acceptable_odds: 1.85,
      direction: 'HOME',
      basis: 'Quarter line pick'
    }
  ];
  result.market_scan = {
    selected_line: '-0/0.5',
    market: 'ASIAN_HANDICAP_MAIN',
    direction: 'HOME',
    current_odds: 1.95,
    minimum_acceptable_odds: 1.85,
    raw_ev: 0.08,
    risk_adjusted_ev: 0.05,
    is_quarter_line: true,
    quarter_line_settlement_distribution: {
      p_full_win: 0.4,
      p_half_win: 0.2,
      p_push: 0.0,
      p_half_loss: 0.2,
      p_full_loss: 0.2,
      settlement_status: 'SETTLEMENT_UNVERIFIABLE'
    },
    actionable: true,
    rejection_reason: 'N/A'
  };

  const verified = verifyStatutoryAlignment(result, payload);
  // 缺乏五态真实分布时，四分之一盘不得入选正式推荐腿
  assert.equal(verified.recommended_legs.length, 0);
  assert.ok(verified.risk_warnings.some(w => w.includes('P0-04')));
  assert.equal(verified.market_scan?.actionable, false);
  assert.equal(verified.market_scan?.rejection_reason, 'UNVERIFIABLE QUARTER LINE: INVALID FOR VALUE RANKING');
});

test('verifyStatutoryAlignment enforces P0-01 ESS < 30 gate (blocks A_GRADE even if PROFILE_AVAILABLE)', () => {
  const payload = createBasePayload();
  // Validated profile exists, but ESS is 25 (< 30)
  payload.quant_features.oos_semantic_status = {
    profile_status: 'VALIDATED',
    is_oos_validated: true,
    effective_sample_size: 25,
    audit_rule: 'ESS < 30 forbids A_GRADE'
  };

  const result = createBaseResult(RecommendationGrade.A_GRADE, 90);
  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.grade, RecommendationGrade.B_GRADE);
  assert.ok(verified.confidence_score <= 80);
  assert.ok(verified.risk_warnings.some(w => w.includes('P0-01')));
  assert.ok(verified.risk_warnings.some(w => w.includes('<30')));
});

test('verifyStatutoryAlignment enforces P0-03 MAO gate (rejects leg if current_odds < minimum_acceptable_odds)', () => {
  const payload = createBasePayload();
  const result = createBaseResult(RecommendationGrade.A_GRADE, 85);
  // Current odds 1.95, but MAO is 2.05 (negative value after hurdle)
  result.recommended_legs[0].minimum_acceptable_odds = 2.05;

  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.recommended_legs.length, 0);
  assert.ok(verified.risk_warnings.some(w => w.includes('P0-03')));
});

test('isQuarterOrSplitLine and P0-01 line detection override erroneous metadata', () => {
  // 基础字符串与分盘/双值盘口识别
  assert.equal(isQuarterOrSplitLine('+0/0.5'), true);
  assert.equal(isQuarterOrSplitLine('-0/0.5'), true);
  assert.equal(isQuarterOrSplitLine('0/0.5'), true);
  assert.equal(isQuarterOrSplitLine('0.5/1'), true);
  assert.equal(isQuarterOrSplitLine('2/2.5'), true);
  assert.equal(isQuarterOrSplitLine('+0.25'), true);
  assert.equal(isQuarterOrSplitLine('-0.75'), true);
  assert.equal(isQuarterOrSplitLine('-0.5'), false);
  assert.equal(isQuarterOrSplitLine('2.5'), false);

  // 测试在 verifyStatutoryAlignment 中覆盖 is_quarter_line: false 元数据
  const payload = createBasePayload();
  payload.ai_brief.core_markets.ah_main = {
    handicap: '+0/0.5',
    home_odds: 1.95,
    away_odds: 1.90
  };
  payload.quant_features.machine_candidate_signals = [
    {
      market: 'ASIAN_HANDICAP_MAIN',
      line: '+0/0.5',
      side: 'home',
      odds: 1.95,
      ev: 0.05,
      confidence: 80,
      kelly_fraction: 0.02
    }
  ];

  const result = createBaseResult(RecommendationGrade.B_GRADE, 75);
  result.recommended_legs = [
    {
      market: 'ASIAN_HANDICAP_MAIN',
      selected_line: '+0/0.5',
      current_odds: 1.95,
      minimum_acceptable_odds: 1.85,
      direction: 'HOME',
      basis: 'Quarter line pick with wrong metadata'
    }
  ];
  result.market_scan = {
    selected_line: '+0/0.5',
    market: 'ASIAN_HANDICAP_MAIN',
    direction: 'HOME',
    current_odds: 1.95,
    minimum_acceptable_odds: 1.85,
    raw_ev: 0.08,
    risk_adjusted_ev: 0.05,
    is_quarter_line: false, // 错误的元数据
    quarter_line_settlement_distribution: {
      p_full_win: 0.4,
      p_half_win: 0.2,
      p_push: 0.0,
      p_half_loss: 0.2,
      p_full_loss: 0.2,
      settlement_status: 'SETTLEMENT_UNVERIFIABLE'
    },
    actionable: true,
    rejection_reason: 'N/A'
  };

  const verified = verifyStatutoryAlignment(result, payload);
  // 必须强制修正 is_quarter_line 为 true
  assert.equal(verified.market_scan?.is_quarter_line, true);
  // 且因为 settlement_status 为 SETTLEMENT_UNVERIFIABLE，禁止推荐
  assert.equal(verified.recommended_legs.length, 0);
  assert.equal(verified.market_scan?.actionable, false);
});

test('verifyStatutoryAlignment supports P1-01 NONE market state when no valid markets exist', () => {
  const payload = createBasePayload();
  const result = createBaseResult(RecommendationGrade.WATCH, 50);
  result.market_scan = {
    selected_line: 'NONE',
    market: 'NONE',
    direction: 'NONE',
    current_odds: 0,
    minimum_acceptable_odds: 0,
    raw_ev: 0,
    risk_adjusted_ev: 0,
    risk_adjustment_status: 'UNAVAILABLE',
    is_quarter_line: false,
    actionable: false,
    rejection_reason: 'NO_EDGE_FOUND'
  };
  result.recommended_legs = [];

  const verified = verifyStatutoryAlignment(result, payload);
  assert.equal(verified.market_scan?.market, 'NONE');
  assert.equal(verified.market_scan?.selected_line, 'NONE');
  assert.equal(verified.market_scan?.direction, 'NONE');
  assert.equal(verified.market_scan?.actionable, false);
  assert.equal(verified.market_scan?.raw_ev, 0);
  assert.equal(verified.market_scan?.risk_adjusted_ev, 0);
  assert.equal(verified.recommended_legs.length, 0);
});

test('verifyStatutoryAlignment enforces P1-02 QUALITATIVE_ONLY risk_adjusted_ev = 0', () => {
  const payload = createBasePayload();
  const result = createBaseResult(RecommendationGrade.B_GRADE, 75);
  result.market_scan = {
    selected_line: 'Under 2.5',
    market: 'TOTAL_GOALS_MAIN',
    direction: 'UNDER',
    current_odds: 1.95,
    minimum_acceptable_odds: 1.88,
    raw_ev: 0.05,
    risk_adjusted_ev: 0.035, // 违规伪造精确调整后 EV
    risk_adjustment_status: 'QUALITATIVE_ONLY',
    is_quarter_line: false,
    actionable: true,
    rejection_reason: 'N/A'
  };

  const verified = verifyStatutoryAlignment(result, payload);
  // QUALITATIVE_ONLY 时必须被强制归零
  assert.equal(verified.market_scan?.risk_adjusted_ev, 0);
  assert.ok(verified.risk_warnings.some(w => w.includes('P1-02')));
});

test('verifyStatutoryAlignment does NOT falsely reject live match or alter tactical regime due to kickoff_time vs prediction_at string differences', () => {
  const payload = createBasePayload();
  payload.ai_brief.status_summary = 'LIVE 65\'';
  payload.ai_brief.kickoff_time = '20:00'; // 典型雷速/YBTY 仅有时分格式
  (payload.quant_features as any).prediction_snapshot = {
    prediction_at: '2026-09-10T14:30:00Z' // UTC ISO
  };

  const result = createBaseResult(RecommendationGrade.B_GRADE, 78);
  result.blind_spot_analysis = {
    "1_global_motivation": "High",
    "2_asian_handicap_reality": "Valid",
    "3_total_goals_reality": "Valid",
    tactical_regime_evaluation: TacticalRegimeEvaluation.GENUINE_DOMINANCE
  };
  result.internal_logical_audit = "Tactical assessment confirms genuine live dominance.";

  const verified = verifyStatutoryAlignment(result, payload);
  // 不应因字符串格式或时区差异被误判降级，保留战术态势
  assert.equal(verified.blind_spot_analysis?.tactical_regime_evaluation, TacticalRegimeEvaluation.GENUINE_DOMINANCE);
  assert.equal(verified.grade, RecommendationGrade.B_GRADE);
  assert.equal(verified.confidence_score, 78);
  assert.ok(!verified.risk_warnings.some(w => w.includes('TEMPORAL_INTEGRITY_CHECK')));
});

test('verifyStatutoryAlignment enforces P1-04: engine-provided risk_adjusted_ev has absolute priority', () => {
  const payload = createBasePayload();
  (payload.quant_features as any).risk_adjusted_ev = 0.042;

  const result = createBaseResult(RecommendationGrade.B_GRADE, 78);
  result.market_scan = {
    selected_line: '-0.5',
    market: 'ASIAN_HANDICAP_MAIN',
    direction: 'HOME',
    current_odds: 1.95,
    minimum_acceptable_odds: 1.88,
    raw_ev: 0.06,
    risk_adjusted_ev: 0.015, // AI 尝试自行给出的数值
    risk_adjustment_status: 'QUALITATIVE_ONLY',
    is_quarter_line: false,
    actionable: true,
    rejection_reason: 'N/A'
  };

  const verified = verifyStatutoryAlignment(result, payload);
  // 必须以 Engine 提供的 0.042 为准，状态对齐为 ENGINE_PROVIDED
  assert.equal(verified.market_scan?.risk_adjusted_ev, 0.042);
  assert.equal(verified.market_scan?.risk_adjustment_status, 'ENGINE_PROVIDED');
});

test('verifyStatutoryAlignment enforces P1-07: selected_line fallback never selects mathematically closed lines', () => {
  const payload = createBasePayload();
  payload.ai_brief.status_summary = 'LIVE 70\'';
  payload.ai_brief.score_verification = {
    current_score: '2 - 0',
    is_verified: true,
    score_source: 'CANONICAL_AUDITED'
  };
  // 提供包含已闭盘的盘口 (Under 1.5 在 2-0 时已进2球，必闭盘) 以及合法未闭盘盘口 (Under 2.5)
  (payload.quant_features as any).raw_mathematical_ev_signals = [
    { market: 'TOTAL_GOALS_MAIN', line: '1.5', side: 'under', odds: 1.90, ev: 0.08 }, // 闭盘！
    { market: 'TOTAL_GOALS_MAIN', line: '2.5', side: 'under', odds: 2.10, ev: 0.05 }  // 合法未闭盘
  ];

  const result = createBaseResult(RecommendationGrade.WATCH, 50);
  result.market_scan = {
    market: 'NONE',
    selected_line: 'NONE',
    direction: 'NONE',
    current_odds: 0,
    minimum_acceptable_odds: 0,
    raw_ev: 0,
    risk_adjusted_ev: 0,
    is_quarter_line: false,
    actionable: false,
    market_status: 'NO_VALID_MARKET'
  };

  const verified = verifyStatutoryAlignment(result, payload);
  // 回退逻辑必须跳过 1.5 闭盘线，准确回退为 2.5 线，并标记为 VALID_BUT_BLOCKED (P1-06)
  assert.equal(verified.market_scan?.selected_line, '2.5');
  assert.equal(verified.market_scan?.market_status, 'VALID_BUT_BLOCKED');
  assert.equal(verified.market_scan?.actionable, false);
});



import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAsianHandicapLine } from '../refactor/03_quant_engine/devigCalculator.js';
import { generateRefactoredPrompt } from '../refactor/04_ai_evaluator/promptExporter.js';
import { verifyStatutoryAlignment } from '../refactor/04_ai_evaluator/alignmentGuard.js';
import { RecommendationGrade } from '../refactor/04_ai_evaluator/enums.js';
import { QuantAlert } from '../refactor/03_quant_engine/enums.js';
import { CanonicalMatch, CanonicalTimelineEvent } from '../refactor/02_canonical_model/types.js';
import { MatchStage, CanonicalEventType, CanonicalIncidentCategory } from '../refactor/02_canonical_model/enums.js';
import { AiEvaluationResult, EvaluatorPayload } from '../refactor/04_ai_evaluator/types.js';
import {
  calculateEventPressureConversion,
  calculateLiveThreatTrinity
} from '../refactor/03_quant_engine/eventMomentumFusion.js';
import {
  EventPressureConversionType,
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures
} from '../refactor/03_quant_engine/types.js';

describe('Joint Layer 03 and Layer 04 Integration & Hardening Tests', () => {
  describe('1. Quarter Handicap SSOT Parsing & Sign Inversion Prevention', () => {
    it('should correctly parse all variations of quarter handicap without sign flip', () => {
      // 复合负盘 -0.75 各种写法
      assert(Math.abs(parseAsianHandicapLine('-0.5/-1') - (-0.75)) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('-0.5/1') - (-0.75)) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('-0.75') - (-0.75)) < 0.001);

      // 复合平半负盘 -0.25 各种写法
      assert(Math.abs(parseAsianHandicapLine('-0/0.5') - (-0.25)) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('0/-0.5') - (-0.25)) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('-0.25') - (-0.25)) < 0.001);

      // 复合正盘
      assert(Math.abs(parseAsianHandicapLine('0/0.5') - 0.25) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('+0/0.5') - 0.25) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('2/2.5') - 2.25) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('+0.5/+1') - 0.75) < 0.001);

      // 汉字盘口
      assert(Math.abs(parseAsianHandicapLine('平手') - 0.0) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('半球') - (-0.5)) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('受让半球') - 0.5) < 0.001);
      assert(Math.abs(parseAsianHandicapLine('平手/半球') - (-0.25)) < 0.001);
    });
  });

  describe('2. Layer 03 to Layer 04 Data Pipeline & Exporter Synergy', () => {
    function createMockMatch(): CanonicalMatch {
      return {
        canonical_id: 'test_joint_001',
        missing_reasons: [],
        source_lineage: { ybty_id: 'y1', leisu_id: 'l1', match_time: '2026-09-03 20:00:00' },
        alignment: {
          status: 'EXACT_MATCH' as any,
          confidence_score: 100,
          home_team_match: { ybty_name: 'Bayern Munich', leisu_name: 'Bayern Munich', is_alias_exact_hit: true, raw_text_similarity: 1.0 },
          away_team_match: { ybty_name: 'Dortmund', leisu_name: 'Dortmund', is_alias_exact_hit: true, raw_text_similarity: 1.0 },
          league_match: { ybty_league: 'Bundesliga', leisu_league: 'Bundesliga', status: 'MATCHED' as any, similarity: 1.0, is_alias_exact_hit: true },
          league_match_score: 1.0,
          is_swapped_suspected: false,
          alignment_reason: 'Match exact'
        },
        league_name: 'Bundesliga',
        home_team_name: 'Bayern Munich',
        away_team_name: 'Dortmund',
        timing: { stage: MatchStage.LIVE, minute: 65, injury_time: 0, beijing_start_time: '2026-09-03 20:00:00', start_time_source: 'YBTY_RAW' },
        score: { home_score: 1, away_score: 0, score_verified: true },
        markets: {
          full_h2h: { home_odds: 1.85, draw_odds: 3.60, away_odds: 4.20 },
          full_spread_main: { home_selection: '-0.5', home_odds: 1.95, away_selection: '+0.5', away_odds: 1.90 },
          full_total_main: { line: '2.5', over_odds: 1.92, under_odds: 1.92 }
        },
        reference: {
          stats: {
            dangerous_attacks: { home: 45, away: 20 },
            shots_on_target: { home: 6, away: 2 },
            corners: { home: 5, away: 2 }
          },
          lineups: {
            confirmed: true,
            home_starters: [{ player_id: 'p1', name: 'Kane', market_value: '9000万欧' }],
            away_starters: [{ player_id: 'p2', name: 'Brandt', market_value: '4000万欧' }]
          }
        } as any
      };
    }

    it('should generate prompt with resilient ev_signals extracted from devig when machine candidates are empty', () => {
      const match = createMockMatch();
      const { finalPrompt, matchCount } = generateRefactoredPrompt([match], 'live_eval');
      
      assert.strictEqual(matchCount, 1);
      assert(finalPrompt.includes('========== SYSTEM INSTRUCTION =========='));
      assert(finalPrompt.includes('Bayern Munich'));

      const payloadStart = finalPrompt.indexOf('========== USER PAYLOAD (BATCH OF 1 MATCHES) ==========\n');
      const payloadJson = finalPrompt.substring(payloadStart + '========== USER PAYLOAD (BATCH OF 1 MATCHES) ==========\n'.length);
      const parsed = JSON.parse(payloadJson);
      assert(Array.isArray(parsed));
      assert.strictEqual(parsed.length, 1);

      const matchPayload = parsed[0];
      assert(matchPayload.quant_features.devig !== undefined);
      assert(matchPayload.quant_features.bdi !== undefined);
      assert(matchPayload.quant_features.poisson !== undefined, 'quant_features.poisson must be forwarded to Layer 04 prompt');
      assert(matchPayload.quant_features.spatio_temporal_events !== undefined, 'quant_features.spatio_temporal_events must be forwarded to Layer 04 prompt');
      assert(matchPayload.time_context.expected_remaining_minutes_including_stoppage > 0);
    });

    it('should inject narrative timeline events (goals, cards, substitutions) into tactical_phase_transitions', () => {
      const match = createMockMatch();
      match.reference.timeline_events = [
        {
          minute: 12,
          base_minute: 12,
          added_minute: null,
          display_time: "12'",
          type: 1,
          type_name: '进球',
          canonical_type: 'GOAL_REGULAR' as any,
          category: 'SCORE' as any,
          side: 'home',
          text: 'Kane 禁区抽射破门',
          is_penalty: false,
          is_own_goal: false,
          is_cancelled: false,
          is_var_overturned: false,
          is_on_pitch: true,
          player_name: 'Kane'
        },
        {
          minute: 35,
          base_minute: 35,
          added_minute: null,
          display_time: "35'",
          type: 3,
          type_name: '黄牌',
          canonical_type: 'YELLOW_CARD' as any,
          category: 'DISCIPLINE' as any,
          side: 'away',
          text: 'Brandt 战术犯规',
          is_penalty: false,
          is_own_goal: false,
          is_cancelled: false,
          is_var_overturned: false,
          is_on_pitch: true,
          player_name: 'Brandt'
        }
      ];

      const { finalPrompt } = generateRefactoredPrompt([match], 'live_eval');
      const payloadStart = finalPrompt.indexOf('========== USER PAYLOAD (BATCH OF 1 MATCHES) ==========\n');
      const payloadJson = finalPrompt.substring(payloadStart + '========== USER PAYLOAD (BATCH OF 1 MATCHES) ==========\n'.length);
      const parsed = JSON.parse(payloadJson);
      const matchPayload = parsed[0];

      assert(matchPayload.tactical_phase_transitions.some((t: string) => t.includes("12'") && t.includes('进球') && t.includes('Kane')));
      assert(matchPayload.tactical_phase_transitions.some((t: string) => t.includes("35'") && t.includes('黄牌') && t.includes('Brandt')));
    });
  });

  describe('3. Layer 04 Alignment Guard with Layer 03 Quant Alerts', () => {
    function createBasePayload(quantRiskFlags: QuantAlert[] = []): EvaluatorPayload {
      return {
        ai_brief: {
          canonical_id: 'm1',
          league: 'Premier League',
          home_team: 'Arsenal',
          away_team: 'Chelsea',
          score_verification: { is_verified: true },
          core_markets: {
            ah_main: { handicap: '-0.5', home_odds: 1.95, away_odds: 1.90 }
          }
        },
        time_context: { statutory_minute: "60'", expected_remaining_minutes_including_stoppage: 30 },
        tactical_phase_transitions: [],
        lineup_value_matrix: {
          lineup_status: 'CONFIRMED',
          is_lineup_confirmed: true,
          home: { total_value_eur: '60000万欧', lis_score: 1.0, status: '主力齐整' },
          away: { total_value_eur: '55000万欧', lis_score: 1.0, status: '主力齐整' }
        },
        team_profiling: {
          h2h_tactical_integrity: '正常',
          home: { recent_timeline: '样本充足', tactical_playstyle: '强攻', market_performance: '赢盘' },
          away: { recent_timeline: '样本充足', tactical_playstyle: '反击', market_performance: '赢盘' }
        },
        quant_features: {
          devig: {},
          bdi: 25.5,
          ev_signals: [],
          risk_flags: quantRiskFlags,
          goal_alert: 'NONE',
          confidence: 88
        }
      };
    }

    it('should downgrade A_GRADE to B_GRADE when TRAP_HIGH_ODDS_WARNING is present in quant_features', () => {
      const payload = createBasePayload([QuantAlert.TRAP_HIGH_ODDS_WARNING]);
      const mockResult: AiEvaluationResult = {
        blind_spot_analysis: {
          "1_global_motivation": "Strong",
          "2_asian_handicap_reality": "Valid",
          "3_total_goals_reality": "Valid",
          tactical_regime_evaluation: 'GENUINE_DOMINANCE',
          trap_detection_result: 'SAFE_VALUE'
        },
        internal_logical_audit: "AI thinks it is great value",
        grade: RecommendationGrade.A_GRADE,
        confidence_score: 92,
        qualitative_summary: "High value detected",
        risk_warnings: [],
        recommended_legs: [
          {
            market: 'ASIAN_HANDICAP_MAIN',
            selected_line: '-0.5',
            current_odds: 1.95,
            minimum_acceptable_odds: 1.90,
            direction: 'HOME',
            basis: 'Strong dominance'
          }
        ]
      };

      const enforced = verifyStatutoryAlignment(mockResult, payload);
      assert.strictEqual(enforced.grade, RecommendationGrade.B_GRADE);
      assert(enforced.confidence_score <= 80);
      assert(enforced.risk_warnings.some(w => w.includes('TRAP_HIGH_ODDS')));
    });

    it('should correct tactical regime and downgrade A_GRADE when BARREN_DOMINANCE_WARNING is present', () => {
      const payload = createBasePayload([QuantAlert.BARREN_DOMINANCE_WARNING]);
      const mockResult: AiEvaluationResult = {
        blind_spot_analysis: {
          "1_global_motivation": "Strong",
          "2_asian_handicap_reality": "Valid",
          "3_total_goals_reality": "Valid",
          tactical_regime_evaluation: 'GENUINE_DOMINANCE',
          trap_detection_result: 'SAFE_VALUE'
        },
        internal_logical_audit: "AI misidentifies barren possession as real dominance",
        grade: RecommendationGrade.A_GRADE,
        confidence_score: 90,
        qualitative_summary: "Great possession",
        risk_warnings: [],
        recommended_legs: [
          {
            market: 'ASIAN_HANDICAP_MAIN',
            selected_line: '-0.5',
            current_odds: 1.95,
            minimum_acceptable_odds: 1.90,
            direction: 'HOME',
            basis: 'High possession'
          }
        ]
      };

      const enforced = verifyStatutoryAlignment(mockResult, payload);
      assert.strictEqual(enforced.grade, RecommendationGrade.B_GRADE);
      assert.strictEqual(enforced.blind_spot_analysis.tactical_regime_evaluation, 'BARREN_DOMINANCE');
      assert(enforced.risk_warnings.some(w => w.includes('BARREN_DOMINANCE')));
    });

    it('should cap grade at B_GRADE when RED_CARD_TACTICAL_COLLAPSE is triggered', () => {
      const payload = createBasePayload([QuantAlert.RED_CARD_TACTICAL_COLLAPSE]);
      const mockResult: AiEvaluationResult = {
        blind_spot_analysis: {
          "1_global_motivation": "Strong",
          "2_asian_handicap_reality": "Valid",
          "3_total_goals_reality": "Valid",
          tactical_regime_evaluation: 'RECIPROCAL_CHAOS',
          trap_detection_result: 'SAFE_VALUE'
        },
        internal_logical_audit: "Red card event happened",
        grade: RecommendationGrade.A_GRADE,
        confidence_score: 90,
        qualitative_summary: "Red card game",
        risk_warnings: [],
        recommended_legs: [
          {
            market: 'ASIAN_HANDICAP_MAIN',
            selected_line: '-0.5',
            current_odds: 1.95,
            minimum_acceptable_odds: 1.90,
            direction: 'HOME',
            basis: 'Tactical change'
          }
        ]
      };

      const enforced = verifyStatutoryAlignment(mockResult, payload);
      assert.strictEqual(enforced.grade, RecommendationGrade.B_GRADE);
      assert(enforced.risk_warnings.some(w => w.includes('RED_CARD_TACTICAL_COLLAPSE')));
    });
  });

  describe('5. Layer 03 EPI Multi-Scale Momentum Window Truncation Hardening', () => {
    const mockTimeline: MomentumTimelineFeatures = {
      window_size: 15,
      current_minute: 45,
      integral_15m: { home: 300, away: 40 },
      integral_full_match: { home: 1050, away: 200 },
      acceleration_5m: { home: 1.2, away: -0.5 },
      series: []
    };

    const mockPhysical: RealTimePhysicalStatsFeatures = {
      stats_available: false
    };

    it('should NOT falsely classify as BARREN_DOMINANCE at 45m when a 27m goal occurred', () => {
      // 27 分钟进球在 45 分钟时位于 15m 窗口之外 (45 - 27 = 18 > 15)
      const eventsWith27mGoal: CanonicalTimelineEvent[] = [
        {
          minute: 27,
          category: CanonicalIncidentCategory.SCORE,
          canonical_type: CanonicalEventType.GOAL_REGULAR,
          side: 'home',
          is_cancelled: false,
          type_name: '进球'
        }
      ];

      const trinity = calculateLiveThreatTrinity(mockTimeline, eventsWith27mGoal, mockPhysical, 45);
      const epi = calculateEventPressureConversion(mockTimeline, eventsWith27mGoal, trinity, 45);

      // 主队近 15m 事件分虽然为 0 (被 15m 切片切除)，但在全场时序事件走势平滑支持下，绝不能误判为 BARREN_DOMINANCE (虚假繁荣)
      assert.notStrictEqual(
        epi.home.classification,
        EventPressureConversionType.BARREN_DOMINANCE,
        '27m goal should shield team from false BARREN_DOMINANCE at 45m'
      );
      assert.strictEqual(
        epi.home.classification,
        EventPressureConversionType.BALANCED_CONTEST,
        'Should fall back to balanced contest prior given historical conversion'
      );
    });

    it('should correctly classify genuine BARREN_DOMINANCE when high energy has ZERO event conversion across full match', () => {
      // 全场没有任何实质事件，纯粹“空有危攻/干打雷不下雨”
      const eventsEmpty: CanonicalTimelineEvent[] = [];

      const trinity = calculateLiveThreatTrinity(mockTimeline, eventsEmpty, mockPhysical, 45);
      const epi = calculateEventPressureConversion(mockTimeline, eventsEmpty, trinity, 45);

      // 在没有任何全场事件转化的前提下，高危攻应精准识别为虚假繁荣
      assert.strictEqual(
        epi.home.classification,
        EventPressureConversionType.BARREN_DOMINANCE,
        'Genuine zero-event dominance with high energy must trigger BARREN_DOMINANCE'
      );
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAsianHandicapLine } from '../refactor/03_quant_engine/devigCalculator.js';
import { generateRefactoredPrompt } from '../refactor/04_ai_evaluator/promptExporter.js';
import { verifyStatutoryAlignment } from '../refactor/04_ai_evaluator/alignmentGuard.js';
import { RecommendationGrade } from '../refactor/04_ai_evaluator/enums.js';
import { QuantAlert } from '../refactor/03_quant_engine/enums.js';
import { CanonicalMatch } from '../refactor/02_canonical_model/types.js';
import { MatchStage } from '../refactor/02_canonical_model/enums.js';
import { AiEvaluationResult, EvaluatorPayload } from '../refactor/04_ai_evaluator/types.js';

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
      assert(matchPayload.time_context.expected_remaining_minutes_including_stoppage > 0);
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
});

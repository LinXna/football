/**
 * P1-20 / P1-21 / P1-40 / P1-42 专项回归验证
 *
 * - P1-20: injury impact 独立建模，不再复用外部 squad market value（与 prior 解耦）
 * - P1-21: avg age schema 统一 number/string，字符串兜底真正生效
 * - P1-40: edge_confidence 由 Math.max 跨 profile 改为 ESS 加权均值，消除单强 profile 支配全局
 * - P1-42: 删除死字段 is_cold_start_unlocked（state 为单一状态源）
 */
import assert from 'node:assert';
import { MatchStage } from '../02_canonical_model/enums.js';
import type { CanonicalMatch } from '../02_canonical_model/types.js';
import { calculateLineupImpactScores } from '../03_quant_engine/lineupImpact.js';
import { evaluateCandidatePipeline } from '../03_quant_engine/candidateStateMachine.js';

// ===================== P1-21: avg age schema 统一 =====================
{
  const matchAge = {
    canonical_id: 'p1_21_age',
    home_team_name: 'A', away_team_name: 'B',
    reference: {
      lineups: {
        confirmed: true,
        home_average_age: '27.5岁',
        away_average_age: '28.9岁',
        // starters 无 age 数据（有效年龄 < 5），必须回退到雷速提供的 average_age 字符串
        home_starters: [{ name: 'P1', position: 'FW' }, { name: 'P2', position: 'DF' }],
        away_starters: [{ name: 'A1', position: 'FW' }, { name: 'A2', position: 'DF' }]
      }
    }
  } as unknown as CanonicalMatch;

  const lisAge = calculateLineupImpactScores(matchAge);
  assert.equal(lisAge.home_average_age, 27.5, `P1-21: home_average_age 字符串兜底必须生效，实际 ${lisAge.home_average_age}`);
  assert.equal(lisAge.away_average_age, 28.9, `P1-21: away_average_age 字符串兜底必须生效，实际 ${lisAge.away_average_age}`);
}

// ===================== P1-20: injury impact 独立建模 =====================
{
  const matchP120 = {
    canonical_id: 'p1_20_injury_independent',
    home_team_name: 'Rich Squad', away_team_name: 'Poor Squad',
    reference: {
      lineups: {
        confirmed: true,
        // 巨大 squad market value（10亿欧），修复前会稀释伤员占全队身价比
        home_market_value: '100000万欧',
        home_starters: [
          { name: 'S1', position: 'FW', market_value: 1000000 },
          { name: 'S2', position: 'FW', market_value: 1000000 },
          { name: 'S3', position: 'DF', market_value: 1000000 },
          { name: 'S4', position: 'DF', market_value: 1000000 },
          { name: 'S5', position: 'GK', market_value: 1000000 },
          { name: 'S6', position: 'MF', market_value: 1000000 },
          { name: 'S7', position: 'MF', market_value: 1000000 },
          { name: 'S8', position: 'MF', market_value: 1000000 },
          { name: 'S9', position: 'DF', market_value: 1000000 },
          { name: 'S10', position: 'DF', market_value: 1000000 },
          { name: 'S11', position: 'MF', market_value: 1000000 }
        ],
        away_starters: [{ name: 'A1', position: 'FW', market_value: 1000000 }],
        home_injuries: [
          // 首发前锋身价 500万欧，占首发身价（1100万欧）约 34%，折损必须明显
          { name: 'Star FW', position: 'FW', market_value: 5000000, starter: true }
        ],
        away_injuries: []
      }
    }
  } as unknown as CanonicalMatch;

  const lisP120 = calculateLineupImpactScores(matchP120);
  assert.equal(lisP120.home_striker_missing, true, 'P1-20: FW 伤员必须被识别');
  assert.ok(
    lisP120.home_attack_injury_factor < 0.80,
    `P1-20: injury impact 必须基于首发身价（伤员占 34%）而非巨大 squad value 稀释，实际 ${lisP120.home_attack_injury_factor}`
  );
}

// ===================== P1-40: edge_confidence ESS 加权均值 =====================
{
  const baseProfile = {
    status: 'VALIDATED' as const, league_key: 'L', minute_band: 'LIVE_30_45', score_state: '0-0',
    market: 'ASIAN_HANDICAP_MAIN' as const, sample_size: 1000, effective_sample_size: 1000,
    brier_baseline: 0.25, baseline_type: 'CLIMATOLOGY' as const, brier_skill_score: 0.6,
    lambda_log_adjustment: 0
  };
  const profileA = { ...baseProfile, oos_brier_score: 0.06 }; // score = (80-6)*1.0 = 74
  const profileB = { ...baseProfile, oos_brier_score: 0.26 }; // score = (80-26)*1.0 = 54
  const signalA = { market: 'ASIAN_HANDICAP_MAIN', line: '0', side: 'home', odds: 2.0, ev: 0.08, confidence: 70, kelly_fraction: 0.02 };
  const signalB = { market: 'ASIAN_HANDICAP_MAIN', line: '0.5', side: 'home', odds: 2.0, ev: 0.08, confidence: 70, kelly_fraction: 0.02 };

  const result = evaluateCandidatePipeline({
    resolveOosMarket: () => 'ASIAN_HANDICAP_MAIN' as const,
    resolveOosProfile: (_m, line) => (line === '0' ? profileA : profileB),
    adjustedConfidence: 80, dataQualityScore: 90, modelStabilityScore: 85,
    canPriceMarket: true, liveStatsAvailable: true, stage: MatchStage.LIVE,
    hasEvidenceConflict: false, postGoalCooldownActive: false,
    rawSignals: [signalA, signalB], permissiveOosMode: false
  });

  // ESS 加权均值 = (74*1000 + 54*1000) / 2000 = 64；旧 Math.max 会得 74
  assert.equal(result.edge_confidence_score, 64, `P1-40: edge_confidence 必须为 ESS 加权均值 64（而非 max 74），实际 ${result.edge_confidence_score}`);
}

// ===================== P1-42: 删除死字段 is_cold_start_unlocked =====================
{
  const signal = { market: 'ASIAN_HANDICAP_MAIN', line: '0', side: 'home', odds: 2.0, ev: 0.08, confidence: 70, kelly_fraction: 0.02 };
  const resultCold = evaluateCandidatePipeline({
    resolveOosMarket: () => 'ASIAN_HANDICAP_MAIN' as const,
    resolveOosProfile: () => undefined,
    adjustedConfidence: 80, dataQualityScore: 90, modelStabilityScore: 85,
    canPriceMarket: true, liveStatsAvailable: true, stage: MatchStage.LIVE,
    hasEvidenceConflict: false, postGoalCooldownActive: false,
    rawSignals: [signal], permissiveOosMode: true
  });

  assert.equal(resultCold.state, 'COLD_START_PERMISSIVE', '冷启动宽容模式必须进入 COLD_START_PERMISSIVE');
  assert.ok(!('is_cold_start_unlocked' in resultCold), 'P1-42: is_cold_start_unlocked 死字段必须已删除（state 是单一状态源）');
}

console.log('✅ P1-20 / P1-21 / P1-40 / P1-42 verified');

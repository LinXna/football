/**
 * P1-17 + P1-31 专项回归验证
 *
 * P1-17：Goal DNA 样本量口径由「进球数」改为「比赛数」（matches_count）。
 *        5 场打进 15 球不再被误判为 15 个高证据样本，而是按 5 场比赛计算置信度。
 * P1-31：observed goals pace 由朴素 goals/elapsed×90 外推改为 Gamma-Poisson 贝叶斯收缩。
 *        早期偶然进球不再被线性外推到极端全场速率。
 */
import assert from 'node:assert';
import { MatchStage } from '../02_canonical_model/enums.js';
import type { CanonicalMatch } from '../02_canonical_model/types.js';
import { extractGoalDistributionDNA } from '../03_quant_engine/contextEngine.js';
import { calculateInPlayPoissonFeatures } from '../03_quant_engine/poissonDecayModel.js';

const mockMatch: CanonicalMatch = {
  canonical_id: 'p1_17_31',
  league_id: 'L1',
  league_name: 'Test League',
  match_time: Date.now(),
  home_team_id: 'H1',
  home_team_name: 'Home FC',
  away_team_id: 'A1',
  away_team_name: 'Away FC',
  timing: { stage: MatchStage.LIVE, minute: 20, regular_time: 90, injury_time: 0 },
  score: { home_score: 0, away_score: 0, score_verified: true },
  markets: {},
  reference: {}
};

// ---- P1-17: 5 场 15 球 = 5 场比赛（非 15 球高证据） ----
const fiveMatch15Goals: CanonicalMatch = {
  ...mockMatch,
  reference: {
    goal_distribution: {
      has_data: true,
      home_team: {
        all: { matches_count: 5, scored_intervals: [{ goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 3 }, { goals: 3 }, { goals: 3 }] },
        home: { matches_count: 2, scored_intervals: [{ goals: 1 }, { goals: 1 }, { goals: 1 }, { goals: 1 }, { goals: 1 }, { goals: 1 }] }
      },
      away_team: {
        all: { matches_count: 5, scored_intervals: [{ goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 3 }, { goals: 3 }, { goals: 3 }] },
        away: { matches_count: 2, scored_intervals: [{ goals: 1 }, { goals: 1 }, { goals: 1 }, { goals: 1 }, { goals: 1 }, { goals: 1 }] }
      }
    }
  }
} as any;

const dna5 = extractGoalDistributionDNA(fiveMatch15Goals);
console.log(`P1-17: 5 场 15 球 -> home_sample_size=${dna5.home_sample_size}, home_confidence=${dna5.home_confidence}`);
assert.equal(dna5.home_sample_size, 5, `5 场 15 球样本量应为 5 场（比赛数 matches_count），而非 15 球；实际 ${dna5.home_sample_size}`);
assert.equal(dna5.home_confidence, 'MEDIUM', `5 场（< 8 场）置信度应为 MEDIUM，而非 HIGH；实际 ${dna5.home_confidence}`);
assert.equal(dna5.is_home_specific, false, '主场 2 场（< 3 场）应回退 100% 采用总体切片');

// 对照：8 场（>= 8）应 HIGH
const eightMatch: CanonicalMatch = {
  ...mockMatch,
  reference: {
    goal_distribution: {
      has_data: true,
      home_team: {
        all: { matches_count: 8, scored_intervals: [{ goals: 3 }, { goals: 3 }, { goals: 3 }, { goals: 3 }, { goals: 3 }, { goals: 3 }] },
        home: { matches_count: 4, scored_intervals: [{ goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }] }
      },
      away_team: {
        all: { matches_count: 8, scored_intervals: [{ goals: 3 }, { goals: 3 }, { goals: 3 }, { goals: 3 }, { goals: 3 }, { goals: 3 }] },
        away: { matches_count: 4, scored_intervals: [{ goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }, { goals: 2 }] }
      }
    }
  }
} as any;

const dna8 = extractGoalDistributionDNA(eightMatch);
console.log(`P1-17 对照: 8 场 -> home_confidence=${dna8.home_confidence}, is_home_specific=${dna8.is_home_specific}`);
assert.equal(dna8.home_confidence, 'HIGH', '8 场（>= 8）置信度应为 HIGH');
assert.equal(dna8.is_home_specific, true, '主场 4 场（3 <= nVenue < 5）应激活 50/50 专属融合');

// ---- P1-31: 20' 进 1 球的 observed pace 收缩 ----
const earlyGoalMatch: CanonicalMatch = {
  ...mockMatch,
  timing: { ...mockMatch.timing, minute: 20 },
  score: { home_score: 1, away_score: 0, score_verified: true }
};

const p131 = calculateInPlayPoissonFeatures(
  earlyGoalMatch,
  {} as any,
  { match_id: 'p1_31', elapsed_minute: 20, score_diff: 1 } as any,
  null,
  null,
  null
);

const observedRate = p131.lambda_decomposition.observed_pace_full_match_rate;
// 朴素外推 = (1/20)*90 = 4.5；贝叶斯收缩后应 < 4.5（收缩向先验 ~2.7）
const naiveRate = (1 / 20) * 90;
console.log(`P1-31: 20' 进 1 球 -> observed_pace_full_match_rate=${observedRate}, 朴素外推=${naiveRate}`);
assert(observedRate > 0, `observed pace 应 > 0（已进球），实际 ${observedRate}`);
assert(observedRate < naiveRate, `贝叶斯收缩后 observed rate 应 < 朴素外推 ${naiveRate}，实际 ${observedRate}`);

console.log('✅ P1-17 + P1-31 sample size & observed pace verified');

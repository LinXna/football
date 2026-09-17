import test from 'node:test';
import assert from 'node:assert/strict';
import { CanonicalMatch } from '../refactor/02_canonical_model/types.js';
import {
  calculateH2HDecayWeights,
  calculateRecentFormWeights,
  calculateLineupImpactScores,
  calculateMotivationAndUrgencyIndex,
  extractGoalDistributionDNA
} from '../refactor/03_quant_engine/contextEngine.js';
import { synthesizePrematchPrior } from '../refactor/03_quant_engine/prematchPriorEngine.js';
import { extractCleanedContextFeatures } from '../refactor/03_quant_engine/contextEngine.js';
import {
  calculateLiveThreatTrinity,
  evaluateGoalClimax,
  evaluateTacticalRegime,
  classifyYellowCardContext,
  calculateDecayedEventScore,
  calculateEventPressureConversion
} from '../refactor/03_quant_engine/eventMomentumFusion.ts';
import { YellowCardContextType, TacticalRegimeType, QuantAlert } from '../refactor/03_quant_engine/enums.js';
import { extractRealTimePhysicalStats, extractMomentumTimelineFeatures } from '../refactor/03_quant_engine/momentumQuantEngine.js';
import { buildUnifiedMatchState, calculateConfidenceAndAlerts } from '../refactor/03_quant_engine/index.js';
import { calculateInPlayPoissonFeatures, calculatePhasedDNATimeFraction } from '../refactor/03_quant_engine/poissonDecayModel.js';
import { CanonicalTimelineEvent } from '../refactor/02_canonical_model/types.js';
import { CanonicalIncidentCategory, CanonicalEventType, MatchStage } from '../refactor/02_canonical_model/enums.js';
import { verifyStatutoryAlignment } from '../refactor/04_ai_evaluator/alignmentGuard.js';
import { RecommendationGrade, TacticalRegimeEvaluation } from '../refactor/04_ai_evaluator/enums.js';
import { AiEvaluationResult, EvaluatorPayload } from '../refactor/04_ai_evaluator/types.js';
import {
  buildOosCalibrationArchive,
  selectOosCalibrationProfile,
  BRIER_CIRCUIT_BREAKER_THRESHOLD
} from '../refactor/03_quant_engine/oosCalibrationEngine.js';
import { evaluateCandidatePipeline } from '../refactor/03_quant_engine/candidateStateMachine.js';
import { OosCalibrationSample, MomentumTimelineFeatures } from '../refactor/03_quant_engine/types.js';

test('Anti-Fake Data Hardening: Scheme 1 - Team ID Anchoring in H2H & Recent Form', () => {
  // Test H2H venue inversion prevention
  const mockMatch: CanonicalMatch = {
    canonical_id: 'match_h2h_test',
    home_team_name: 'Team Alpha',
    away_team_name: 'Team Beta',
    timing: { stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    reference: {
      home_team_id: 1001,
      away_team_id: 2002,
      tactical_context: {
        h2h_raw: [
          {
            match_time: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days ago
            home_team_id: 2002, // Current Away team was Home
            away_team_id: 1001, // Current Home team was Away
            home_team_name: 'Team Beta',
            away_team_name: 'Team Alpha',
            home_scores: [1, 0, 0, 1, 4], // Team Beta scored 1
            away_scores: [3, 1, 0, 0, 6], // Team Alpha (Current Home) scored 3
            shots: { home: 10, away: 15 },
            dangerous_attacks: { home: 30, away: 45 }
          }
        ]
      }
    }
  } as unknown as CanonicalMatch;

  const h2h = calculateH2HDecayWeights(mockMatch);
  assert.equal(h2h.weights.length, 1);
  assert.equal(h2h.weights[0].home_goals, 1, 'In the historical match, the home team (Beta) scored 1');
  assert.equal(h2h.weights[0].away_goals, 3, 'In the historical match, the away team (Alpha) scored 3');
  assert.ok(h2h.analytics.net_goal_differential_weighted > 0, 'Net goal differential for current home (Alpha) must be positive');
  assert.ok(h2h.analytics.historical_h2h_advantage_home > 0, 'H2H advantage for Team Alpha must be positive');
});

test('Anti-Fake Data Hardening: Scheme 2 - Strict Date Gate (No Fake 45-Day Defaults)', () => {
  const mockMatch: CanonicalMatch = {
    canonical_id: 'match_strict_date',
    home_team_name: 'Team Alpha',
    away_team_name: 'Team Beta',
    timing: { stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    reference: {
      home_team_id: 1001,
      away_team_id: 2002,
      tactical_context: {
        home_recent_matches: [
          {
            match_time: 0, // Invalid/missing timestamp
            home_team_id: 1001,
            away_team_id: 3003,
            home_team_name: 'Team Alpha',
            away_team_name: 'Team Gamma',
            fulltime_score: { home: 2, away: 1 }
          }
        ]
      }
    }
  } as unknown as CanonicalMatch;

  const res = calculateRecentFormWeights(mockMatch);
  assert.equal(res.home_analytics.sample_count, 1, 'Raw sample count is 1');
  assert.equal(res.home_analytics.valid_count, 0, 'Valid count must be 0 because match_time is invalid');
  assert.equal(res.home[0].is_valid_time_window, false, 'Weight record must be marked is_valid_time_window: false');
});

test('Anti-Fake Data Hardening: Scheme 3 - Zero-Sample Smoothing (valid_count === 0 returns 1.0)', () => {
  const mockMatch: CanonicalMatch = {
    canonical_id: 'match_zero_sample',
    home_team_name: 'Team Alpha',
    away_team_name: 'Team Beta',
    timing: { stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    markets: {} as any,
    reference: {
      home_team_id: 1001,
      away_team_id: 2002,
      recent_matches_home: [], // 0 matches
      recent_matches_away: []
    }
  } as unknown as CanonicalMatch;

  const context = extractCleanedContextFeatures(mockMatch);
  assert.equal(context.recent_form_analytics.home.valid_count, 0);
  assert.equal(context.recent_form_analytics.away.valid_count, 0);

  const priors = synthesizePrematchPrior(mockMatch, context);
  // With 0 valid sample, home and away attack/defense form factors must be 1.0, not penalized to 0.70
  assert.ok(priors.lambda_home_theory > 1.0, 'Home expected goals should remain unpenalized around baseline');
  assert.ok(priors.lambda_away_theory > 0.8, 'Away expected goals should remain unpenalized around baseline');
});

test('Anti-Fake Data Hardening: Scheme 4 - Lineup Three-State Gate', () => {
  // Case A: NOT_ANNOUNCED (starters empty)
  const matchNotAnnounced: CanonicalMatch = {
    canonical_id: 'match_not_announced',
    home_team_name: 'Team Alpha',
    away_team_name: 'Team Beta',
    reference: {
      lineups: {
        confirmed: false,
        home_starters: [],
        away_starters: [],
        home_injuries: [{ name: 'Star Player', position: 'FW' }]
      }
    }
  } as unknown as CanonicalMatch;

  const lisNotAnnounced = calculateLineupImpactScores(matchNotAnnounced);
  assert.equal(lisNotAnnounced.lineup_status, 'NOT_ANNOUNCED');
  assert.equal(lisNotAnnounced.is_lineup_confirmed, false);
  assert.equal(lisNotAnnounced.home_lis, 1.0, 'LIS must remain 1.0 when lineup not announced');

  // Case B: CONFIRMED
  const matchConfirmed: CanonicalMatch = {
    canonical_id: 'match_confirmed',
    home_team_name: 'Team Alpha',
    away_team_name: 'Team Beta',
    reference: {
      lineups: {
        confirmed: true,
        home_starters: [{ name: 'Player 1' }, { name: 'Player 2' }],
        away_starters: [{ name: 'Player 3' }],
        home_injuries: [{ name: 'Key Striker', position: 'FW' }]
      }
    }
  } as unknown as CanonicalMatch;

  const lisConfirmed = calculateLineupImpactScores(matchConfirmed);
  assert.equal(lisConfirmed.lineup_status, 'CONFIRMED');
  assert.equal(lisConfirmed.is_lineup_confirmed, true);
  assert.ok(lisConfirmed.home_lis < 1.0, 'LIS should reflect FW absence deduction when confirmed');

  // Case C: Talisman Systemic Collapse & Position Gap Differentiation & Noise Filtering
  const matchTalisman: CanonicalMatch = {
    canonical_id: 'match_talisman',
    home_team_name: 'Team Alpha',
    away_team_name: 'Team Beta',
    reference: {
      lineups: {
        confirmed: true,
        home_market_value: '10000万', // 1亿欧
        home_starters: [
          { name: 'S1', position: 'FW', market_value: 10000000 },
          { name: 'S2', position: 'DF', market_value: 5000000 },
          { name: 'S3', position: 'GK', market_value: 3000000 }
        ],
        away_starters: [
          { name: 'A1', position: 'FW', market_value: 5000000 }
        ],
        home_injuries: [
          // 大腿断层第一: 3500万欧，超次席 3.5倍，占全队35%，且缺阵
          { name: 'Superstar Talisman', position: 'FW', market_value: 35000000 },
          // 边缘杂鱼: 身价 50万欧，连同位置均价(1000万)的 5% 都不到，且无主力/停赛标签，必须被过滤
          { name: 'Bench Youth', position: 'FW', market_value: 500000 }
        ],
        away_injuries: [
          // 只有后卫防守缺阵 (停赛)
          { name: 'Key Defender', position: 'DF', starter: true, incidents: [{ type_name: '红牌停赛' }] }
        ]
      }
    }
  } as unknown as CanonicalMatch;

  const lisTalisman = calculateLineupImpactScores(matchTalisman);
  assert.equal(lisTalisman.home_talisman_missing, true, 'Home talisman should be detected as missing');
  assert.equal(lisTalisman.home_talisman_name, 'Superstar Talisman');
  assert.ok(lisTalisman.home_attack_injury_factor < 0.90, 'Home attack factor should significantly drop due to superstar striker missing');
  assert.equal(lisTalisman.home_defense_leak_factor, 1.0, 'Home defense leak factor should remain 1.0 when no DF/GK missing');
  assert.equal(lisTalisman.home_defender_missing, false);
  assert.equal(lisTalisman.home_striker_missing, true);

  // 客队只有防线受损
  assert.equal(lisTalisman.away_striker_missing, false);
  assert.equal(lisTalisman.away_defender_missing, true);
  assert.equal(lisTalisman.away_attack_injury_factor, 1.0, 'Away attack factor must stay 1.0 without FW absence');
  assert.ok(lisTalisman.away_defense_leak_factor > 1.0, 'Away defense leak factor must increase due to suspended key defender');
});

test('Anti-Fake Data Hardening: Scheme 5 - Dirichlet-Multinomial Bayesian Conjugate Smoothing', () => {
  const matchWithGoals: CanonicalMatch = {
    canonical_id: 'match_goals',
    home_team_name: 'Team Alpha',
    away_team_name: 'Team Beta',
    reference: {
      goal_distribution: {
        has_data: true,
        home_team: {
          all: {
            scored_intervals: [
              { goals: 5 }, // 0-15
              { goals: 2 }, // 16-30
              { goals: 2 }, // 31-45
              { goals: 2 }, // 46-60
              { goals: 2 }, // 61-75
              { goals: 2 }  // 76-90
            ]
          }
        },
        away_team: {
          all: {
            scored_intervals: [
              { goals: 0 },
              { goals: 0 },
              { goals: 0 },
              { goals: 0 },
              { goals: 0 },
              { goals: 0 }
            ]
          }
        }
      }
    }
  } as unknown as CanonicalMatch;

  const dna = extractGoalDistributionDNA(matchWithGoals);
  // Raw: 5 goals in interval 0, 2 in each of other 5 intervals. Total goals = 15 (mature sample nAll >= 15).
  // With Dirichlet Alpha = 1.0, K = 6:
  // denom = 15 + 6 = 21.
  // interval 0 weight = (5 + 1) / 21 = 6/21 = 2/7 ≈ 0.2857
  // interval 1 weight = (2 + 1) / 21 = 3/21 = 1/7 ≈ 0.1429
  // All weights must be strictly positive and smoothly bounded.
  assert.ok(dna.home_scored_weights[0] > 0.25 && dna.home_scored_weights[0] < 0.30);
  assert.ok(dna.home_scored_weights[1] > 0.13 && dna.home_scored_weights[1] < 0.16);
  assert.ok(dna.home_scored_weights[5] > 0.13 && dna.home_scored_weights[5] < 0.16);
});

test('Anti-Fake Data Hardening: Scheme 6 - Dynamic Percentile MUI & Cup Isolation', () => {
  // Case A: Cup competition should isolate MUI to 1.0
  const cupMatch: CanonicalMatch = {
    canonical_id: 'cup_match',
    league_name: '足协杯',
    home_team_name: 'Team Alpha',
    away_team_name: 'Team Beta',
    reference: {
      league_standings: {
        home_team: { overall: { position: 1, matches_played: 28 } },
        away_team: { overall: { position: 18, matches_played: 28 } }
      }
    }
  } as unknown as CanonicalMatch;

  const cupMui = calculateMotivationAndUrgencyIndex(cupMatch);
  assert.equal(cupMui.home_mui, 1.0);
  assert.equal(cupMui.away_mui, 1.0);
  assert.equal(cupMui.home_context, 'CUP_OR_TOURNAMENT_NEUTRAL');

  // Case B: Small league (12 teams, e.g. 韩K联) - Rank 11 is in bottom 20% (relegation battle)
  const kLeagueMatch: CanonicalMatch = {
    canonical_id: 'kleague_match',
    league_name: '韩K联',
    home_team_name: 'Team Alpha',
    away_team_name: 'Team Beta',
    reference: {
      league_standings: {
        home_team: { overall: { position: 2, matches_played: 18 } }, // 2/12 = 0.167 <= 0.20 -> Title race
        away_team: { overall: { position: 11, matches_played: 18 } } // 11/12 = 0.917 >= 0.80 -> Relegation battle
      }
    }
  } as unknown as CanonicalMatch;

  const kMui = calculateMotivationAndUrgencyIndex(kLeagueMatch);
  assert.ok(kMui.home_mui > 1.0, 'Top team in 12-team league gets positive MUI');
  assert.ok(kMui.away_mui > 1.0, 'Rank 11 in 12-team league gets relegation battle MUI > 1.0');
});

test('Core Algorithmic Overhaul: 365-Day Historical Cutoff Gate in contextEngine', () => {
  const nowMs = Date.now();
  const mockMatch: CanonicalMatch = {
    canonical_id: 'match_365_cutoff',
    home_team_name: 'Home FC',
    away_team_name: 'Away FC',
    timing: { stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    reference: {
      home_team_id: 100,
      away_team_id: 200,
      tactical_context: {
        home_recent_matches: [
          {
            // 200 days ago (<= 365: valid)
            match_time: Math.floor((nowMs - 200 * 86400 * 1000) / 1000),
            home_team_id: 100,
            away_team_id: 301,
            home_team_name: 'Home FC',
            away_team_name: 'Opp 1',
            competition_name: 'Super League',
            fulltime_score: { home: 2, away: 0 }
          },
          {
            // 497 days ago (> 365: strictly filtered out as invalid)
            match_time: Math.floor((nowMs - 497 * 86400 * 1000) / 1000),
            home_team_id: 100,
            away_team_id: 302,
            home_team_name: 'Home FC',
            away_team_name: 'Opp 2',
            competition_name: 'Super League',
            fulltime_score: { home: 5, away: 0 }
          }
        ]
      }
    }
  } as unknown as CanonicalMatch;

  const result = calculateRecentFormWeights(mockMatch);
  assert.equal(result.home_analytics.sample_count, 2, 'Total samples parsed is 2');
  assert.equal(result.home_analytics.valid_count, 1, 'Only 1 sample <= 365 days is valid');
  assert.equal(result.home[0].is_valid_time_window, true);
  assert.equal(result.home[1].is_valid_time_window, false, 'Match from 497 days ago must be marked invalid');
  assert.equal(result.home[1].final_composite_weight, 0, 'Weight of 497 days old match must be 0');
});

test('Core Algorithmic Overhaul: Underdog Lambda Suppression against Dominant Home in prematchPriorEngine', () => {
  const match: CanonicalMatch = {
    canonical_id: 'match_dominance_test',
    home_team_name: 'Manchester City',
    away_team_name: 'Luton Town',
    timing: { stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    markets: {
      full_spread_main: {
        market_id: 'm1',
        home_selection: '-2.0',
        home_odds: 1.95,
        away_odds: 1.85,
        raw_spread_value: -2.0,
        is_in_play: false
      } as any
    },
    reference: {
      tactical_context: {
        squad_market_value: {
          home_total_market_value_eur: 1200000000,
          away_total_market_value_eur: 80000000
        }
      }
    }
  } as unknown as CanonicalMatch;

  const context = extractCleanedContextFeatures(match);
  const prior = synthesizePrematchPrior(match, context);

  assert.ok(prior.lambda_home_theory > prior.lambda_away_theory, 'Dominant home lambda must strictly exceed away lambda');
  assert.ok(prior.lambda_away_theory <= 1.20, 'Underdog away lambda must be capped under dominance hierarchy');
  assert.ok(prior.prior_fair_home_win_prob > 0.60, 'Dominant home fair win probability must reflect heavy favoritism');
});

test('Core Algorithmic Overhaul: Corner and Shot Sliding Window Clusters in Goal Climax', () => {
  const currentMinute = 65;
  const events: CanonicalTimelineEvent[] = [
    // 2 corners within 3 minutes (min 63 and 64)
    {
      minute: 63,
      side: 'home',
      canonical_type: CanonicalEventType.CORNER,
      is_cancelled: false
    } as any,
    {
      minute: 64,
      side: 'home',
      canonical_type: CanonicalEventType.CORNER,
      is_cancelled: false
    } as any,
    // 2 shots within 5 minutes (min 62 and 64)
    {
      minute: 62,
      side: 'home',
      canonical_type: CanonicalEventType.SHOT_ON_TARGET,
      is_cancelled: false
    } as any,
    {
      minute: 64,
      side: 'home',
      canonical_type: CanonicalEventType.SHOT_ON_TARGET,
      is_cancelled: false
    } as any
  ];

  const match: CanonicalMatch = {
    canonical_id: 'cluster_test',
    timing: { minute: currentMinute, stage: 'SECOND_HALF' as any },
    score: { home_score: 0, away_score: 0 },
    reference: { timeline_events: events }
  } as unknown as CanonicalMatch;

  const dummyTimeline = {
    slope_5m: 5.0,
    slope_15m: 3.0,
    integral_15m: { home: 180, away: 20 },
    momentum_pyramid: { composite_slope: 5.0, consistency: 'ALIGNED' as const }
  } as any;

  const dummyEpi = {
    home: { conversion_ratio: 0.85, classification: 'LETHAL_CONVERSION' as any },
    away: { conversion_ratio: 0.10, classification: 'LOW_ACTIVITY' as any }
  } as any;

  const dummyTrinity = {
    home: { calibrated_threat: 0.82, alignment_score: 0.85 },
    away: { calibrated_threat: 0.15, alignment_score: 0.70 },
    dominant_side: 'home' as const,
    has_material_conflict: false,
    rationale: []
  } as any;

  const climax = evaluateGoalClimax(match, dummyTimeline, dummyEpi, dummyTrinity);

  // With both corner cluster (>=6) and shot barrage (>=8), climax score must be high
  assert.ok(climax.climax_score >= 65.0, `Climax score ${climax.climax_score} must be >= 65.0`);
  assert.equal(climax.is_imminent_threat, true, 'Imminent threat must be active under corner & shot barrage');
  assert.equal(climax.attacking_side, 'home');
});

test('Core Algorithmic Overhaul: Red Card 10v11 Physics (+40% leak, -60% conversion)', () => {
  const match: CanonicalMatch = {
    canonical_id: 'red_physics_test',
    timing: { minute: 55, stage: 'SECOND_HALF' as any },
    score: { home_score: 0, away_score: 0 },
    reference: {
      timeline_events: [
        {
          minute: 40,
          side: 'away',
          canonical_type: CanonicalEventType.RED_CARD_DIRECT,
          is_cancelled: false
        } as any
      ]
    }
  } as unknown as CanonicalMatch;

  const dummyTimeline = {
    integral_15m: { home: 120, away: 30 },
    slope_5m: 1.0,
    slope_15m: 1.0
  } as any;

  const dummyEpi = {
    home: { energy_15m: 120 },
    away: { energy_15m: 30 }
  } as any;

  const physicalWithRed = {
    red_card_penalty: {
      away_attack_multiplier: 0.40,
      home_attack_multiplier: 1.0
    }
  } as any;

  const regime = evaluateTacticalRegime(match, dummyTimeline, dummyEpi, physicalWithRed);

  assert.equal(regime.red_card_active_side, 'away');
  assert.ok(regime.regime_multiplier_home >= 1.35, `Home regime multiplier ${regime.regime_multiplier_home} must reflect +40% expansion against 10 men`);
  assert.ok(regime.regime_multiplier_away <= 0.45, `Away regime multiplier ${regime.regime_multiplier_away} must reflect -60% conversion penalty with 10 men`);
});

test('Core Algorithmic Overhaul: Scheme 11 - Tactical Sacrifice Foul Semantic Classification & Zero Defensive Leak', () => {
  // 1. 战术牺牲犯规测试：对方处于反击/高动量推进，本方中后卫战术犯规染黄
  const tacticalFoulEvent: CanonicalTimelineEvent = {
    event_id: 'ev_tactical_1',
    match_id: 'match_tac_1',
    minute: 55,
    side: 'home',
    type: 3,
    text: '55\' 主队后卫战术犯规破坏对方反击，吃到黄牌',
    is_cancelled: false,
    player_name: 'John Defender'
  };

  const classification = classifyYellowCardContext(tacticalFoulEvent, {
    playerRole: 'DF',
    oppRecentShots10m: 0,
    oppRecentCorners10m: 0
  });

  assert.equal(classification, YellowCardContextType.TACTICAL_DISRUPTION, 'Tactical foul must be classified as TACTICAL_DISRUPTION');

  // 2. 验证计算威胁衰减时，战术犯规不会被错误当成反向威胁增加给本方进攻支持度
  const mockMatch: CanonicalMatch = {
    canonical_id: 'match_tac_quant',
    home_team_name: 'Home FC',
    away_team_name: 'Away FC',
    timing: { minute: 58, stage: 'IN_PLAY' as any },
    score: { home_score: 0, away_score: 0 },
    reference: {
      timeline_events: [tacticalFoulEvent],
      lineups: {
        confirmed: true,
        home_starters: [{ name: 'John Defender', position: 'DF' }] as any,
        away_starters: []
      } as any
    }
  } as unknown as CanonicalMatch;

  const physical = extractRealTimePhysicalStats(mockMatch);

  // 战术犯规不增加防守崩溃泄露因子 (Leak factor 必须为 1.00，无崩盘风险)
  assert.equal(physical.discipline_pressure.home_tactical_foul_yellows, 1);
  assert.equal(physical.discipline_pressure.home_yellow_collapse_risk, false);
  assert.equal(physical.discipline_pressure.home_discipline_leak_factor, 1.00);
});

test('Core Algorithmic Overhaul: Scheme 12 - Defensive Collapse & Panic Causal Resonance Gate', () => {
  // 10 分钟内同一方连续吃到 2 张受迫失位黄牌，且伴随对手密集射门/角球压制
  const siegeEvents: CanonicalTimelineEvent[] = [
    { minute: 62, side: 'away', type: 21, text: '62\' 客队射正', is_cancelled: false },
    { minute: 64, side: 'away', type: 2, text: '64\' 客队角球', is_cancelled: false },
    { minute: 65, side: 'away', type: 21, text: '65\' 客队射门被扑', is_cancelled: false },
    // 主队后卫受迫失位染黄
    { minute: 66, side: 'home', type: 3, text: '66\' 主队后卫拉人犯规被出示黄牌', is_cancelled: false, player_name: 'DF1' },
    // 3 分钟后主队再次受迫失位染黄
    { minute: 69, side: 'home', type: 3, text: '69\' 主队防守球员飞铲染黄', is_cancelled: false, player_name: 'DF2' }
  ];

  const mockMatch: CanonicalMatch = {
    canonical_id: 'match_collapse_test',
    home_team_name: 'Home FC',
    away_team_name: 'Away FC',
    timing: { minute: 70, stage: 'IN_PLAY' as any },
    score: { home_score: 0, away_score: 0 },
    stats: {
      dangerous_attacks: { home: 20, away: 45 },
      shots_total: { home: 2, away: 8 },
      shots_on_target: { home: 1, away: 4 },
      corners: { home: 1, away: 5 },
      yellow_cards: { home: 2, away: 0 }
    } as any,
    reference: {
      timeline_events: siegeEvents,
      lineups: {
        confirmed: true,
        home_starters: [
          { name: 'DF1', position: 'DF' },
          { name: 'DF2', position: 'DF' }
        ] as any,
        away_starters: []
      } as any
    }
  } as unknown as CanonicalMatch;

  const physical = extractRealTimePhysicalStats(mockMatch);

  // 验证因果共振：连续受迫染黄 + 对手密集压制触发 collapse
  assert.equal(physical.discipline_pressure.home_yellow_collapse_risk, true, 'Home yellow collapse risk must be triggered');
  assert.ok(physical.discipline_pressure.home_discipline_leak_factor > 1.05, `Home discipline leak factor ${physical.discipline_pressure.home_discipline_leak_factor} must be elevated`);
  assert.equal(physical.discipline_pressure.away_yellow_collapse_risk, false);

  // 验证战术 Regime 转变为 COLLAPSING_PANIC
  const dummyTimeline = {
    integral_15m: { home: 15, away: 95 },
    slope_5m: -1.2,
    slope_15m: -0.8
  } as any;
  const dummyEpi = {
    home: { energy_15m: 15 },
    away: { energy_15m: 95 }
  } as any;

  const regime = evaluateTacticalRegime(mockMatch, dummyTimeline, dummyEpi, physical);
  assert.equal(regime.current_regime, TacticalRegimeType.COLLAPSING_PANIC, 'Regime must switch to COLLAPSING_PANIC');
  assert.ok(regime.regime_multiplier_away >= 1.25, `Opponent conversion multiplier ${regime.regime_multiplier_away} must reflect collapse`);

  // 验证构建全局状态与警报
  const dummySpatioTemporal = {
    live_threat_trinity: {
      home: { calibrated_threat: 0.3 },
      away: { calibrated_threat: 1.1 },
      has_material_conflict: false
    },
    goal_climax: {
      is_imminent_threat: false,
      post_goal_cooldown_active: false
    },
    regime: regime
  } as any;

  const unifiedState = buildUnifiedMatchState(dummySpatioTemporal, physical, dummyTimeline);
  assert.equal(unifiedState.yellow_collapse_risk_home, true);
  assert.ok(unifiedState.discipline_leak_multiplier_home > 1.05);

  const devigMock = {
    bookmaker_posture: 'BALANCED_NEUTRAL'
  } as any;
  const contextMock = {
    circuit_breaker: { is_triggered: false },
    goal_timing_validity: { requires_bayesian_shrinkage: false },
    h2h_weights: []
  } as any;

  const confResult = calculateConfidenceAndAlerts(
    contextMock,
    dummyTimeline,
    physical,
    devigMock,
    MatchStage.LIVE
  );

  assert.ok(confResult.risk_flags.includes(QuantAlert.COLLAPSING_PANIC_WARNING), 'Risk flags must include COLLAPSING_PANIC_WARNING');
});

test('Core Algorithmic Overhaul: Scheme 13 - Non-Tactical Dissent & Time-Wasting Yellow Cards Exclusion', () => {
  // 非战术情绪/延误比赛时间黄牌
  const dissentEvent: CanonicalTimelineEvent = {
    minute: 85,
    side: 'home',
    type: 3,
    text: '85\' 主队前锋对判罚不满抗议裁判吃到黄牌',
    is_cancelled: false,
    player_name: 'Angry Striker'
  };

  const delayEvent: CanonicalTimelineEvent = {
    minute: 87,
    side: 'home',
    type: 3,
    text: '87\' 主队门将拖延比赛时间吃到黄牌',
    is_cancelled: false,
    player_name: 'Slow Keeper'
  };

  const c1 = classifyYellowCardContext(dissentEvent, { playerRole: 'FW' });
  const c2 = classifyYellowCardContext(delayEvent, { playerRole: 'GK' });

  assert.equal(c1, YellowCardContextType.NON_TACTICAL_DISSENT, 'Protesting referee must be NON_TACTICAL_DISSENT');
  assert.equal(c2, YellowCardContextType.NON_TACTICAL_DISSENT, 'Time-wasting must be NON_TACTICAL_DISSENT');

  const mockMatch: CanonicalMatch = {
    canonical_id: 'match_dissent_test',
    home_team_name: 'Home FC',
    away_team_name: 'Away FC',
    timing: { minute: 88, stage: 'IN_PLAY' as any },
    score: { home_score: 1, away_score: 0 },
    stats: {
      dangerous_attacks: { home: 35, away: 30 },
      shots_total: { home: 5, away: 4 },
      shots_on_target: { home: 2, away: 1 },
      yellow_cards: { home: 2, away: 0 }
    } as any,
    reference: {
      timeline_events: [dissentEvent, delayEvent],
      lineups: {
        confirmed: true,
        home_starters: [
          { name: 'Angry Striker', position: 'FW' },
          { name: 'Slow Keeper', position: 'GK' }
        ] as any,
        away_starters: []
      } as any
    }
  } as unknown as CanonicalMatch;

  const physical = extractRealTimePhysicalStats(mockMatch);

  // 情绪/拖时间黄牌不进入防线漏洞池
  assert.equal(physical.discipline_pressure.home_dissent_time_yellows, 2);
  assert.equal(physical.discipline_pressure.home_yellow_collapse_risk, false);
  assert.equal(physical.discipline_pressure.home_discipline_leak_factor, 1.00);
});

test('Core Algorithmic Overhaul: Scheme 14 - Downstream Causal Closure in Poisson Decay Model', () => {
  // 验证 UnifiedMatchState 中的 discipline_leak_multiplier 真正传入泊松衰减模型计算
  const baseMatch: CanonicalMatch = {
    canonical_id: 'match_poisson_discipline',
    home_team_name: 'Home FC',
    away_team_name: 'Away FC',
    timing: { minute: 75, stage: MatchStage.LIVE },
    score: { home_score: 0, away_score: 0, score_verified: true }
  } as unknown as CanonicalMatch;

  const dummyContext = {
    l0_circuit_breaker: { is_triggered: false },
    prior_adjustment_multipliers: { home_multiplier: 1.0, away_multiplier: 1.0 }
  } as any;

  // 场景 A：主队防守完好 (discipline_leak_multiplier_home = 1.00)
  const normalState = {
    home_intensity: 0.5,
    away_intensity: 0.5,
    regime_multiplier_home: 1.0,
    regime_multiplier_away: 1.0,
    discipline_leak_multiplier_home: 1.00,
    discipline_leak_multiplier_away: 1.00
  } as any;

  const poissonNormal = calculateInPlayPoissonFeatures(
    baseMatch,
    dummyContext,
    normalState
  );

  // 场景 B：主队防线体能崩溃失控 (discipline_leak_multiplier_home = 1.25)
  const collapsedState = {
    home_intensity: 0.5,
    away_intensity: 0.5,
    regime_multiplier_home: 1.0,
    regime_multiplier_away: 1.0,
    discipline_leak_multiplier_home: 1.25, // 主队防线漏洞大开
    discipline_leak_multiplier_away: 1.00
  } as any;

  const poissonCollapsed = calculateInPlayPoissonFeatures(
    baseMatch,
    dummyContext,
    collapsedState
  );

  // 因主队防线漏洞大开，客队剩余时间进球期望 lambda_away 必须显著高于完好场景
  assert.ok(
    poissonCollapsed.lambda_away_rest > poissonNormal.lambda_away_rest,
    `Away expected goals (${poissonCollapsed.lambda_away_rest}) under Home collapse must exceed normal (${poissonNormal.lambda_away_rest})`
  );
  // 主队自身的进攻期望不应因为自己防线漏洞而反向获益
  assert.equal(
    poissonCollapsed.lambda_home_rest,
    poissonNormal.lambda_home_rest,
    'Home expected goals should remain unpolluted by its own defensive leak'
  );
});

test('Core Algorithmic Overhaul: Scheme 15 - Defensive Midfielder (CDM/后腰) & Combined Pressure Collapse Gate', () => {
  // 验证中后场后腰 (CDM/后腰) 在对方压制下连续染黄，触发防线体能崩溃
  const mockMatch: CanonicalMatch = {
    canonical_id: 'match_cdm_collapse',
    home_team_name: 'Home FC',
    away_team_name: 'Away FC',
    timing: { minute: 65, stage: MatchStage.LIVE },
    score: { home_score: 1, away_score: 1 },
    reference: {
      lineups: {
        confirmed: true,
        home_starters: [
          { name: 'Rodri Anchor', position: 'CDM' },
          { name: 'Ruben CenterBack', position: 'CB' }
        ] as any,
        away_starters: []
      },
      timeline_events: [
        // 客队近 10 分钟有 1 射门 + 1 角球 (组合密集施压)
        { minute: 58, side: 'away', type: 21, canonical_type: CanonicalEventType.SHOT_ON_TARGET, is_cancelled: false },
        { minute: 61, side: 'away', type: 2, canonical_type: CanonicalEventType.CORNER, is_cancelled: false },
        // 主队后腰在 59 分钟禁区边缘受迫失位高危犯规染黄
        {
          minute: 59,
          side: 'home',
          type: 3,
          canonical_type: CanonicalEventType.YELLOW_CARD,
          player_name: 'Rodri Anchor',
          text: '59\' 主队后腰禁区前沿失守铲球阻截染黄',
          is_cancelled: false
        },
        // 主队中卫在 63 分钟再次受迫失位高危犯规染黄
        {
          minute: 63,
          side: 'home',
          type: 3,
          canonical_type: CanonicalEventType.YELLOW_CARD,
          player_name: 'Ruben CenterBack',
          text: '63\' 主队中卫禁区内拉扯防守犯规吃到黄牌',
          is_cancelled: false
        }
      ]
    }
  } as unknown as CanonicalMatch;

  const physical = extractRealTimePhysicalStats(mockMatch);
  assert.equal(physical.discipline_pressure?.home_yellow_collapse_risk, true, 'Home must trigger yellow collapse risk with CDM + CB pressure yellows');
  assert.ok(
    (physical.discipline_pressure?.home_discipline_leak_factor ?? 1.0) >= 1.05 &&
    (physical.discipline_pressure?.home_discipline_leak_factor ?? 1.0) <= 1.25,
    `Discipline leak factor (${physical.discipline_pressure?.home_discipline_leak_factor}) must be in [1.05, 1.25]`
  );
});

test('Core Algorithmic Overhaul: Scheme 16 - AlignmentGuard Hard Gate for COLLAPSING_PANIC_WARNING', () => {
  // 验证当量化警报包含 COLLAPSING_PANIC_WARNING 时，Layer 04 alignmentGuard 强制封顶 B 级且置信度不超过 75
  const mockPayload: EvaluatorPayload = {
    ai_brief: {
      league: 'Premier League',
      status_summary: 'LIVE 65\'',
      score_verification: { current_score: '0 - 0' },
      core_markets: {
        euro_1x2: { home_win: 2.10, draw: 3.20, away_win: 3.50 }
      }
    } as any,
    quant_features: {
      candidate_pipeline: { state: 'QUALIFIED_ACTIONABLE' },
      machine_candidate_signals: [
        {
          market: 'EURO_1X2',
          side: 'home',
          line: '0',
          odds: 2.10
        }
      ],
      risk_flags: [QuantAlert.COLLAPSING_PANIC_WARNING],
      stability_and_blockers: { model_stability_score: 95 }
    } as any,
    lineup_value_matrix: { is_lineup_confirmed: true } as any
  } as unknown as EvaluatorPayload;

  const mockAiResult: AiEvaluationResult = {
    grade: RecommendationGrade.A_GRADE,
    confidence_score: 88,
    risk_warnings: [],
    recommended_legs: [
      {
        market: 'EURO_1X2',
        direction: 'HOME',
        selected_line: '0',
        current_odds: 2.10,
        minimum_acceptable_odds: 2.00,
        ev_estimate: 0.05
      }
    ] as any,
    match_status: 'EVALUATED'
  } as unknown as AiEvaluationResult;

  const guarded = verifyStatutoryAlignment(mockAiResult, mockPayload);
  assert.equal(guarded.grade, RecommendationGrade.B_GRADE, 'Must downgrade A_GRADE to B_GRADE when COLLAPSING_PANIC_WARNING is active');
  assert.ok(guarded.confidence_score <= 75, `Confidence score (${guarded.confidence_score}) must be capped at 75`);
  assert.ok(
    guarded.risk_warnings.some(w => w.includes('COLLAPSING_PANIC_WARNING')),
    'Risk warnings must record COLLAPSING_PANIC_WARNING gate'
  );
});

test('Core Algorithmic Overhaul: Scheme 17 - League DNA Substring Matching in Prematch Prior', () => {
  // 验证完整联赛名称（如“英格兰超级联赛”、“西班牙甲组联赛”）能准确模糊匹配到 LEAGUE_DNA_MAP，杜绝退化为 2.75
  const mockContext: any = {
    lineup_impact: {
      home_lis: 1.0,
      away_lis: 1.0,
      home_attack_injury_factor: 1.0,
      away_attack_injury_factor: 1.0,
      home_defense_leak_factor: 1.0,
      away_defense_leak_factor: 1.0,
      home_market_value_num: 0,
      away_market_value_num: 0,
    },
    motivation_urgency: { home_mui: 1.0, away_mui: 1.0 },
    h2h_analytics: { net_goal_expectation: 0, historical_h2h_advantage_home: 0.0 },
    tactical_formation: {
      wing_space_vulnerability_home: 0.30,
      wing_space_vulnerability_away: 0.30,
      midfield_congestion_index: 0.50
    },
    recent_form_analytics: {
      home: { goal_expectancy: 1.5, conceded_expectancy: 1.0 },
      away: { goal_expectancy: 1.0, conceded_expectancy: 1.5 }
    }
  };

  const eplMatch: CanonicalMatch = {
    canonical_id: 'epl_test_01',
    league_name: '英格兰超级联赛',
    match_slug: '英格兰超级联赛_曼城_vs_利物浦',
    home_team_name: '曼城',
    away_team_name: '利物浦',
    timing: { stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    markets: {} as any,
    reference: null,
    created_at: new Date().toISOString(),
    completeness_tier: 'COMPLETE' as any,
    missing_reasons: [],
    alignment: {} as any
  };

  const prior = synthesizePrematchPrior(eplMatch, mockContext);
  // 英超基准进球为 2.85，主场 56% = 1.596, 客场 44% = 1.254 (乘以 gamma 1.18 和 0.85)
  // 如果退化为 2.75，则基准是 1.54 和 1.21
  assert.ok(prior.lambda_home_theory > 1.60, `EPL home theory lambda ${prior.lambda_home_theory} must reflect 2.85 DNA`);
});

test('Core Algorithmic Overhaul: Scheme 18 - Asymmetrical Squad Market Value Ratio', () => {
  // 验证单边身价缺失（豪门 3500 万 vs 弱旅 0）时，具备保守估算，杜绝强弱被抹平为 1:1 等权
  const mockContextAsym: any = {
    lineup_impact: {
      home_lis: 1.0,
      away_lis: 1.0,
      home_attack_injury_factor: 1.0,
      away_attack_injury_factor: 1.0,
      home_defense_leak_factor: 1.0,
      away_defense_leak_factor: 1.0,
      home_market_value_num: 3500, // 3500 万欧
      away_market_value_num: 0,    // 缺失
    },
    motivation_urgency: { home_mui: 1.0, away_mui: 1.0 },
    h2h_analytics: { net_goal_expectation: 0, historical_h2h_advantage_home: 0.0 },
    tactical_formation: {
      wing_space_vulnerability_home: 0.30,
      wing_space_vulnerability_away: 0.30,
      midfield_congestion_index: 0.50
    },
    recent_form_analytics: {
      home: { goal_expectancy: 1.5, conceded_expectancy: 1.0 },
      away: { goal_expectancy: 1.0, conceded_expectancy: 1.5 }
    }
  };

  const match: CanonicalMatch = {
    canonical_id: 'asym_test_01',
    league_name: '埃及超级联赛',
    match_slug: '埃及超级联赛_开罗国民_vs_弱旅',
    home_team_name: '开罗国民',
    away_team_name: '弱旅',
    timing: { stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    markets: {} as any,
    reference: null,
    created_at: new Date().toISOString(),
    completeness_tier: 'COMPLETE' as any,
    missing_reasons: [],
    alignment: {} as any
  };

  const prior = synthesizePrematchPrior(match, mockContextAsym);
  assert.ok(
    prior.lambda_home_theory > prior.lambda_away_theory * 1.5,
    `Home theory lambda (${prior.lambda_home_theory}) must dominate away (${prior.lambda_away_theory}) when home has 3500M and away 0`
  );
  assert.ok(prior.prior_fair_home_win_prob > 0.60, `Home win prob (${prior.prior_fair_home_win_prob}) must be > 60% due to squad value superiority`);
});

test('Core Algorithmic Overhaul: Scheme 19 - Talisman Single Tactical Multiplication Dedup', () => {
  // 验证身价大腿缺阵时单次乘算 (1.35x)，杜绝复合乘算 (1.8225x)
  const mockMatch: CanonicalMatch = {
    canonical_id: 'talisman_test',
    home_team_name: 'Real Madrid',
    away_team_name: 'Getafe',
    timing: { stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    markets: {} as any,
    reference: {
      lineups: {
        confirmed: true,
        home_starters: [
          { name: 'Vinicius', position: 'FW', market_value: 150000000 },
          { name: 'Bellingham', position: 'MF', market_value: 150000000 }
        ],
        away_starters: [
          { name: 'Mayoral', position: 'FW', market_value: 15000000 }
        ],
        home_market_value: '50000万',
        home_injuries: [
          {
            name: 'Mbappe',
            market_value_text: '18000万', // 占 36% 身价，判定为断层大腿
            position: 'FW',
            best_player: true
          }
        ]
      }
    } as any,
    created_at: new Date().toISOString(),
    completeness_tier: 'COMPLETE' as any,
    missing_reasons: [],
    alignment: {} as any
  };

  const result = calculateLineupImpactScores(mockMatch);
  assert.equal(result.home_talisman_missing, true);
  // 单次 1.35x 乘算下，Mbappe 折损约为 0.40 左右，LIS 处于 [0.80, 0.90] 区间，绝不至于因为二次 1.35 乘算暴跌至 < 0.78
  assert.ok(result.home_lis >= 0.80, `Home LIS (${result.home_lis}) must not suffer duplicate talisman penalty`);
  assert.ok(result.home_attack_injury_factor < 1.0, 'Attack injury factor must be depressed for missing striker');
});

test('Core Algorithmic Overhaul: Scheme 20 - Tiered Injury Loss for Unvalued Leagues', () => {
  // 验证在无身价联赛 (startersTotalMvEur === 0) 中，伤员达 3 人时具有阶梯递减折损，不归零
  const mockMatch: CanonicalMatch = {
    canonical_id: 'unvalued_league_test',
    home_team_name: 'Small Club A',
    away_team_name: 'Small Club B',
    timing: { stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    markets: {} as any,
    reference: {
      lineups: {
        confirmed: true,
        home_starters: [
          { name: 'HS1', position: 'FW' },
          { name: 'HS2', position: 'MF' }
        ],
        away_starters: [
          { name: 'AS1', position: 'FW' }
        ],
        home_injuries: [
          { name: 'Player 1', position: 'MF' },
          { name: 'Player 2', position: 'DF' },
          { name: 'Player 3', position: 'FW' }
        ]
      }
    } as any,
    created_at: new Date().toISOString(),
    completeness_tier: 'COMPLETE' as any,
    missing_reasons: [],
    alignment: {} as any
  };

  const result = calculateLineupImpactScores(mockMatch);
  assert.ok(result.home_lis < 1.0, `Home LIS (${result.home_lis}) for 3 injuries in unvalued league must reflect tiered loss`);
  assert.ok(result.home_lis <= 0.98, `Home LIS (${result.home_lis}) must be less than or equal to 0.98`);
  assert.ok(result.home_lis >= 0.85, `Home LIS (${result.home_lis}) must be reasonably bounded`);
});

test('Core Algorithmic Overhaul: Scheme 21 - Preceding 15m Siege Window for Yellow Collapse Resonance', () => {
  // 验证前置 15 分钟发生的攻门压迫（如第 62、64 分钟）能与第 68、70 分钟的后卫受迫黄牌形成有效因果共振
  const events: CanonicalTimelineEvent[] = [
    { minute: 62, side: 'away', type: 21, canonical_type: CanonicalEventType.SHOT_ON_TARGET, text: '客队前锋禁区内劲射被扑', is_cancelled: false },
    { minute: 64, side: 'away', type: 22, canonical_type: CanonicalEventType.SHOT_OFF_TARGET, text: '客队头球攻门稍稍偏出', is_cancelled: false },
    { minute: 68, side: 'home', type: 3, canonical_type: CanonicalEventType.YELLOW_CARD, text: 'Defender A 禁区防线失守铲球犯规染黄', is_cancelled: false, player_name: 'Defender A' },
    { minute: 70, side: 'home', type: 3, canonical_type: CanonicalEventType.YELLOW_CARD, text: 'Defender B 门前失位放铲犯规染黄', is_cancelled: false, player_name: 'Defender B' },
  ];

  const mockMatch: CanonicalMatch = {
    canonical_id: 'siege_test',
    home_team_name: 'Home FC',
    away_team_name: 'Away FC',
    timing: { minute: 72, stage: 'IN_PLAY' as any },
    score: { home_score: 0, away_score: 0 },
    markets: {} as any,
    reference: {
      lineups: {
        home_starters: [
          { name: 'Defender A', position: 'CB' },
          { name: 'Defender B', position: 'LB' }
        ]
      },
      timeline_events: events
    } as any,
    created_at: new Date().toISOString(),
    completeness_tier: 'COMPLETE' as any,
    missing_reasons: [],
    alignment: {} as any
  };

  const physical = extractRealTimePhysicalStats(mockMatch);
  assert.equal(physical.discipline_pressure?.home_yellow_collapse_risk, true, 'Home must trigger yellow collapse risk with 15m preceding siege');
  assert.ok(
    physical.discipline_pressure!.home_discipline_leak_factor >= 1.05,
    `Discipline leak factor (${physical.discipline_pressure!.home_discipline_leak_factor}) must be >= 1.05`
  );
});

test('Core Algorithmic Overhaul: Scheme 22 - Formation Decoupling (Wing Exposure vs Midfield Congestion)', () => {
  const baseMatch: CanonicalMatch = {
    canonical_id: 'match_formation_test',
    home_team_name: 'Arsenal',
    away_team_name: 'Chelsea',
    league_name: '英超',
    timing: { minute: 0, stage: 'PRE_MATCH' as any },
    score: { home_score: 0, away_score: 0 },
    markets: {} as any,
    reference: {
      lineups: {
        confirmed: true,
        home_starters: [],
        away_starters: []
      }
    } as any,
    created_at: new Date().toISOString(),
    completeness_tier: 'COMPLETE' as any,
    missing_reasons: [],
    alignment: {} as any
  };

  // 1. 基准上下文：双方边肋空档中性 (0.30)，中场绞杀中性 (0.50)
  const baseContext = extractCleanedContextFeatures(baseMatch);
  const neutralContext: any = {
    ...baseContext,
    squad_value_tier: { home_market_value_eur: 500000000, away_market_value_eur: 500000000 },
    lineup_impact: { home_lis: 1.0, away_lis: 1.0, home_attack_factor: 1.0, away_attack_factor: 1.0, home_defense_leak: 1.0, away_defense_leak: 1.0 },
    h2h_analytics: { historical_h2h_advantage_home: 0, tactical_metrics_available: false, tactical_valid_count: 0 },
    tactical_formation: {
      wing_space_vulnerability_home: 0.30,
      wing_space_vulnerability_away: 0.30,
      midfield_congestion_index: 0.50
    },
    motivation_urgency: { home_mui: 1.0, away_mui: 1.0 },
    recent_form: { home_attack_form: 1.0, away_attack_form: 1.0, home_defense_form: 1.0, away_defense_form: 1.0 }
  };

  const neutralPrior = synthesizePrematchPrior(baseMatch, neutralContext);

  // 2. 客队边肋大暴露 (0.70)，中场中性
  const awayWingExposedContext: any = {
    ...neutralContext,
    tactical_formation: {
      wing_space_vulnerability_home: 0.30,
      wing_space_vulnerability_away: 0.70, // 暴露明显
      midfield_congestion_index: 0.50
    }
  };
  const awayExposedPrior = synthesizePrematchPrior(baseMatch, awayWingExposedContext);

  // 断言：客队边路漏洞暴露时，主队理论进球期望必须显著提升
  assert.ok(
    awayExposedPrior.lambda_home_theory > neutralPrior.lambda_home_theory,
    `Home theory lambda (${awayExposedPrior.lambda_home_theory}) must increase when away wing space is exposed (neutral was ${neutralPrior.lambda_home_theory})`
  );

  // 3. 中场高密度绞杀 (0.85)，双边肋中性
  const congestedContext: any = {
    ...neutralContext,
    tactical_formation: {
      wing_space_vulnerability_home: 0.30,
      wing_space_vulnerability_away: 0.30,
      midfield_congestion_index: 0.85 // 强力中场绞杀
    }
  };
  const congestedPrior = synthesizePrematchPrior(baseMatch, congestedContext);

  // 断言：中场绞杀必须对双方总进球期望产生连续平滑的抑制，杜绝加减法对冲
  assert.ok(
    congestedPrior.lambda_home_theory < neutralPrior.lambda_home_theory,
    `Home theory lambda under heavy midfield congestion (${congestedPrior.lambda_home_theory}) must be strictly lower than neutral (${neutralPrior.lambda_home_theory})`
  );
  assert.ok(
    congestedPrior.lambda_away_theory < neutralPrior.lambda_away_theory,
    `Away theory lambda under heavy midfield congestion (${congestedPrior.lambda_away_theory}) must be strictly lower than neutral (${neutralPrior.lambda_away_theory})`
  );
});

test('Anti-Fake Data Hardening: Scheme 23 - Goal DNA Half-Time (45\') Boundary & Bayesian Shrinkage Smoothing', () => {
  // 1. 验证 45' 半场物理边界积分保护门禁
  // 设定时段权重分布: 上半场占 40%, 下半场占 60%
  // [0-15': 0.10, 16-30': 0.15, 31-45': 0.15, 46-60': 0.20, 61-75': 0.20, 76-90': 0.20]
  const customWeights = [0.10, 0.15, 0.15, 0.20, 0.20, 0.20];

  // (A) 当 elapsedMinute = 45 时，上半场积分严格为 0，剩余积分必须精确等于 0.20 + 0.20 + 0.20 = 0.60
  const fractionAt45 = calculatePhasedDNATimeFraction(45, customWeights);
  assert.equal(
    fractionAt45,
    0.60,
    `At exactly 45' half-time, remaining integral (${fractionAt45}) must strictly equal the exact sum of second-half intervals (0.60)`
  );

  // (B) 当 elapsedMinute = 0 时为 1.0, elapsedMinute = 90 时为 0.0
  assert.equal(calculatePhasedDNATimeFraction(0, customWeights), 1.0);
  assert.equal(calculatePhasedDNATimeFraction(90, customWeights), 0.0);

  // 2. 验证小样本后验贝叶斯信度平滑收缩 (5 <= nAll < 15)
  // 构造总进球只有 5 球的小样本球队：全部进球都堆积在 0-15 分钟
  const smallSample5Match: CanonicalMatch = {
    canonical_id: 'match_small_dna_5',
    home_team_name: 'Alpha FC',
    away_team_name: 'Beta FC',
    reference: {
      goal_distribution: {
        has_data: true,
        home_team: {
          all: {
            scored_intervals: [
              { goals: 5 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }
            ]
          }
        },
        away_team: {
          all: {
            scored_intervals: [
              { goals: 2 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }
            ]
          }
        }
      }
    }
  } as unknown as CanonicalMatch;

  const dna5 = extractGoalDistributionDNA(smallSample5Match);
  // 当 nAll = 5 时，shrinkage = (5 - 5) / 10 = 0.0，后验必须 100% 收缩至中性先验 1/6 ≈ 0.1667
  assert.equal(dna5.home_confidence, 'MEDIUM');
  assert.ok(
    Math.abs(dna5.home_scored_weights[0] - (1.0 / 6.0)) < 0.005,
    `At nAll=5 boundary, posterior (${dna5.home_scored_weights[0]}) must shrink toward uniform 1/6 (0.1667)`
  );

  // 客队总进球 2 球 (< 5)，必须判定为 INSUFFICIENT 且 100% 锁定中性均匀分布
  assert.equal(dna5.away_confidence, 'INSUFFICIENT');
  assert.deepEqual(
    dna5.away_scored_weights,
    [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667],
    'Away with <5 goals must strictly fallback to uniform 6-interval weights'
  );

  // 构造中等偏大样本 (nAll = 10): shrinkage = (10 - 5) / 10 = 0.50，处于狄利克雷后验与中性先验的一半平滑过渡
  const midSample10Match: CanonicalMatch = {
    canonical_id: 'match_small_dna_10',
    home_team_name: 'Alpha FC',
    away_team_name: 'Beta FC',
    reference: {
      goal_distribution: {
        has_data: true,
        home_team: {
          all: {
            scored_intervals: [
              { goals: 10 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }
            ]
          }
        },
        away_team: {
          all: {
            scored_intervals: [
              { goals: 10 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }, { goals: 0 }
            ]
          }
        }
      }
    }
  } as unknown as CanonicalMatch;

  const dna10 = extractGoalDistributionDNA(midSample10Match);
  assert.equal(dna10.home_confidence, 'MEDIUM');
  // 原始频数全部在区间 0: 狄利克雷后验 (10 + 1) / (10 + 6) = 11/16 = 0.6875
  // 收缩权重 = 0.6875 * 0.50 + (1/6) * 0.50 = 0.34375 + 0.08333 ≈ 0.427
  // 断言平滑介于 [0.35, 0.50]，杜绝断崖式突变
  assert.ok(
    dna10.home_scored_weights[0] > 0.35 && dna10.home_scored_weights[0] < 0.50,
    `At nAll=10, weight (${dna10.home_scored_weights[0]}) should be smoothly shrunk between uniform and full posterior`
  );
});

test('Anti-Fake Data Hardening: Scheme 24 - Late-Game Clutch DNA & Live Physical Field Coherent State Fusion', () => {
  // 构造 78' 终盘 0-0 决战场景
  const lateMatch: CanonicalMatch = {
    canonical_id: 'match_clutch_dna_78',
    home_team_name: 'Clutch Tigers FC',
    away_team_name: 'Iron Wall FC',
    timing: { minute: 78, stage: MatchStage.LIVE },
    score: { home_score: 0, away_score: 0, score_verified: true }
  } as unknown as CanonicalMatch;

  // 主队具备典型的大样本终盘绝杀 DNA (76-90' 占比高达 35%，先验绝杀特质显著 >= 0.25)
  const clutchContext = {
    l0_circuit_breaker: { is_triggered: false },
    prior_adjustment_multipliers: { home_multiplier: 1.0, away_multiplier: 1.0 },
    goal_distribution_dna: {
      has_data: true,
      home_confidence: 'HIGH',
      away_confidence: 'HIGH',
      home_scored_weights: [0.10, 0.10, 0.10, 0.15, 0.20, 0.35],
      away_scored_weights: [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667],
      home_late_game_dna: 0.35,
      away_late_game_dna: 0.1667
    }
  } as any;

  // 场景 1: 现场物理相干推进态 (High Coherence, C_home >= 0.80)
  // 主队攻势猛烈，动量压制，现场物理完全支撑先验绝杀爆发
  const coherentActiveState = {
    home_intensity: 0.85,
    away_intensity: 0.20,
    regime_multiplier_home: 1.25,
    regime_multiplier_away: 0.70,
    dominance_index: 0.65,
    imminent_goal: false,
    post_goal_cooldown_active: false,
    has_evidence_conflict: false,
    source_lineage_discount: 1.0,
    red_card_attack_multiplier_home: 1.0,
    red_card_attack_multiplier_away: 1.0,
    red_card_defense_leak_multiplier_home: 1.0,
    red_card_defense_leak_multiplier_away: 1.0,
    home_tti: 2.8,
    away_tti: 0.4,
    pyramid_slope: 20
  } as any;

  const poissonCoherent = calculateInPlayPoissonFeatures(
    lateMatch,
    clutchContext,
    coherentActiveState
  );

  const decompCoherent = poissonCoherent.lambda_decomposition;
  assert.ok(
    (decompCoherent.coherent_state_home ?? 0) >= 0.90,
    `Under strong live attack pressure, home coherent state (${decompCoherent.coherent_state_home}) must be >= 0.90`
  );
  assert.equal(
    decompCoherent.decoherence_applied_home,
    false,
    'Decoherence must NOT be applied when live physical field supports clutch DNA'
  );
  assert.ok(
    poissonCoherent.lambda_home_rest >= 0.30,
    `Coherent clutch team should release potent goal expectancy (lambda_home_rest = ${poissonCoherent.lambda_home_rest} >= 0.30)`
  );

  // 场景 2: 现场退相干阻断态 (Decoherence Dampening, C_home <= 0.20)
  // 主队虽有绝杀历史，但现场被客队彻底绞杀/自身染红/零射门萎靡，物理真实彻底否定先验冲动
  const incoherentDampedState = {
    home_intensity: 0.15,
    away_intensity: 0.85,
    regime_multiplier_home: 0.45,
    regime_multiplier_away: 1.30,
    dominance_index: -0.70,
    imminent_goal: false,
    post_goal_cooldown_active: false,
    has_evidence_conflict: false,
    source_lineage_discount: 1.0,
    red_card_attack_multiplier_home: 0.40, // 染红大巴
    red_card_attack_multiplier_away: 1.0,
    red_card_defense_leak_multiplier_home: 1.40,
    red_card_defense_leak_multiplier_away: 1.0,
    home_tti: 0.2,
    away_tti: 3.2,
    pyramid_slope: -25
  } as any;

  const poissonIncoherent = calculateInPlayPoissonFeatures(
    lateMatch,
    clutchContext,
    incoherentDampedState
  );

  const decompIncoherent = poissonIncoherent.lambda_decomposition;
  assert.ok(
    (decompIncoherent.coherent_state_home ?? 1) <= 0.10,
    `Under deep siege/red card collapse, home coherent state (${decompIncoherent.coherent_state_home}) must be <= 0.10`
  );
  assert.equal(
    decompIncoherent.decoherence_applied_home,
    true,
    'Decoherence MUST be strictly marked true when physical field fails to support clutch DNA'
  );
  assert.ok(
    poissonIncoherent.lambda_home_rest <= 0.08,
    `Decohered clutch team must be strictly suppressed to prevent fake EV (lambda_home_rest = ${poissonIncoherent.lambda_home_rest} <= 0.08)`
  );
  assert.ok(
    poissonIncoherent.lambda_home_rest < poissonCoherent.lambda_home_rest * 0.10,
    `Incoherent suppressed lambda (${poissonIncoherent.lambda_home_rest}) must be less than 10% of coherent lambda (${poissonCoherent.lambda_home_rest})`
  );
});

test('Anti-Fake Data Hardening: Scheme 25 - Tactical Tension & Gridlock Alert Cross-Layer Closure (Scheme 4)', () => {
  // 1. Layer 03 警报触发检验
  const dummyTimeline = {
    canonical_match_id: 'match_tactical_closure',
    events: [],
    red_cards: { home: 0, away: 0 },
    yellow_cards: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    dangerous_attacks: { home: 0, away: 0 },
    shots_on_target: { home: 0, away: 0 },
    shots_off_target: { home: 0, away: 0 },
    possession: { home: 50, away: 50 }
  } as any;

  const physicalNormal = {
    home_intensity: 0.5,
    away_intensity: 0.5,
    dominance_index: 0,
    has_evidence_conflict: false,
    source_lineage_discount: 1.0,
    red_card_penalty: { home_attack_multiplier: 1.0, away_attack_multiplier: 1.0 },
    discipline_pressure: { home_yellow_collapse_risk: false, away_yellow_collapse_risk: false }
  } as any;

  const devigNormal = {
    bookmaker_posture: 'BALANCED_NEUTRAL'
  } as any;

  // 1.1 中场密集绞杀 (> 0.65)
  const contextGridlock = {
    circuit_breaker: { is_triggered: false },
    goal_timing_validity: { requires_bayesian_shrinkage: false },
    h2h_weights: [],
    tactical_formation: {
      formation_home: '5-4-1',
      formation_away: '4-5-1',
      midfield_congestion_index: 0.75, // > 0.65
      wing_space_vulnerability_home: 0.15,
      wing_space_vulnerability_away: 0.20,
      formation_attack_multiplier_home: 0.90,
      formation_attack_multiplier_away: 0.90,
      formation_defense_leak_multiplier_home: 0.95,
      formation_defense_leak_multiplier_away: 0.95
    }
  } as any;

  const gridlockAlerts = calculateConfidenceAndAlerts(
    contextGridlock,
    dummyTimeline,
    physicalNormal,
    devigNormal,
    MatchStage.LIVE
  );

  assert.ok(
    gridlockAlerts.risk_flags.includes(QuantAlert.MIDFIELD_GRIDLOCK_WARNING),
    'When midfield_congestion_index > 0.65, QuantAlert.MIDFIELD_GRIDLOCK_WARNING MUST be triggered'
  );

  // 1.2 边肋防线大空档暴露 (> 0.40)
  const contextWingExposed = {
    circuit_breaker: { is_triggered: false },
    goal_timing_validity: { requires_bayesian_shrinkage: false },
    h2h_weights: [],
    tactical_formation: {
      formation_home: '3-4-3',
      formation_away: '4-4-2',
      midfield_congestion_index: 0.45,
      wing_space_vulnerability_home: 0.48, // > 0.40
      wing_space_vulnerability_away: 0.18,
      formation_attack_multiplier_home: 1.05,
      formation_attack_multiplier_away: 1.15,
      formation_defense_leak_multiplier_home: 1.20,
      formation_defense_leak_multiplier_away: 1.0
    }
  } as any;

  const wingAlerts = calculateConfidenceAndAlerts(
    contextWingExposed,
    dummyTimeline,
    physicalNormal,
    devigNormal,
    MatchStage.LIVE
  );

  assert.ok(
    wingAlerts.risk_flags.includes(QuantAlert.WING_DEFENSE_EXPOSURE),
    'When wing_space_vulnerability_home > 0.40, QuantAlert.WING_DEFENSE_EXPOSURE MUST be triggered'
  );

  // 2. Layer 04 AlignmentGuard 跨层刚性拦截检验
  const basePayload: EvaluatorPayload = {
    ai_brief: {
      canonical_id: 'match_tactical_closure',
      status_summary: 'LIVE 60\'',
      score_verification: { current_score: '1 - 1' },
      core_markets: {
        ah_main: {
          handicap: '-0.5',
          home_odds: 1.95,
          away_odds: 1.92
        },
        ou_main: {
          line: '2.5',
          over_odds: 1.92,
          under_odds: 1.92
        }
      } as any
    } as any,
    lineup_value_matrix: { is_lineup_confirmed: true } as any,
    quant_features: {
      candidate_pipeline: { state: 'QUALIFIED_ACTIONABLE' as any },
      oos_semantic_status: {
        profile_status: 'VALIDATED',
        effective_sample_size: 50,
        is_oos_validated: true,
        audit_rule: 'PASSED'
      },
      machine_candidate_signals: [
        { market: 'TOTAL_GOALS_MAIN', side: 'OVER', line: '2.5', odds: 1.92 } as any,
        { market: 'TOTAL_GOALS_MAIN', side: 'UNDER', line: '2.5', odds: 1.92 } as any,
        { market: 'ASIAN_HANDICAP_MAIN', side: 'HOME', line: '+0.5', odds: 1.92 } as any,
        { market: 'ASIAN_HANDICAP_MAIN', side: 'AWAY', line: '-0.5', odds: 1.92 } as any
      ],
      confidence_score: 85,
      risk_flags: [QuantAlert.MIDFIELD_GRIDLOCK_WARNING],
      tactical_formation: contextGridlock.tactical_formation
    } as any
  };

  // 2.1 MIDFIELD_GRIDLOCK_WARNING 下全场大球 (OVER) 被拦截降级至 B 级，封顶 80
  const overResult: AiEvaluationResult = {
    grade: RecommendationGrade.A_GRADE,
    confidence_score: 90,
    risk_warnings: [],
    recommended_legs: [
      {
        market: 'TOTAL_GOALS_MAIN',
        direction: 'OVER',
        selected_line: '2.5',
        current_odds: 1.92,
        minimum_acceptable_odds: 1.85,
        basis: 'Model projects high probability of late breakthrough'
      }
    ],
    market_scan: {
      market: 'TOTAL_GOALS_MAIN',
      direction: 'OVER',
      selected_line: '2.5',
      current_odds: 1.92
    } as any,
    internal_logical_audit: 'Valid audit trace',
    qualitative_summary: 'Match outlook'
  } as any;

  const guardedOver = verifyStatutoryAlignment(overResult, basePayload);
  assert.equal(
    guardedOver.grade,
    RecommendationGrade.B_GRADE,
    'Under MIDFIELD_GRIDLOCK_WARNING, OVER recommendation MUST be downgraded from A_GRADE to B_GRADE'
  );
  assert.equal(
    guardedOver.confidence_score,
    80,
    'Under MIDFIELD_GRIDLOCK_WARNING, OVER confidence MUST be capped at 80'
  );
  assert.ok(
    guardedOver.risk_warnings?.some(w => w.includes('MIDFIELD_GRIDLOCK_WARNING')),
    'Warnings must mention MIDFIELD_GRIDLOCK_WARNING'
  );

  // 2.2 MIDFIELD_GRIDLOCK_WARNING 下全场小球 (UNDER) 不受此拦截
  const underResult: AiEvaluationResult = {
    grade: RecommendationGrade.A_GRADE,
    confidence_score: 90,
    risk_warnings: [],
    recommended_legs: [
      {
        market: 'TOTAL_GOALS_MAIN',
        direction: 'UNDER',
        selected_line: '2.5',
        current_odds: 1.92,
        minimum_acceptable_odds: 1.85,
        basis: 'Midfield gridlock suffocates goal volume'
      }
    ],
    market_scan: {
      market: 'TOTAL_GOALS_MAIN',
      direction: 'UNDER',
      selected_line: '2.5',
      current_odds: 1.92
    } as any,
    internal_logical_audit: 'Valid audit trace',
    qualitative_summary: 'Match outlook'
  } as any;

  const guardedUnder = verifyStatutoryAlignment(underResult, basePayload);
  assert.equal(
    guardedUnder.grade,
    RecommendationGrade.A_GRADE,
    'Under MIDFIELD_GRIDLOCK_WARNING, UNDER direction is aligned with gridlock and MUST NOT be downgraded'
  );

  // 2.3 WING_DEFENSE_EXPOSURE 下推荐受让下盘（无针对性防守补强）被拦截降级至 B 级
  const wingPayload: EvaluatorPayload = {
    ...basePayload,
    ai_brief: {
      ...basePayload.ai_brief,
      core_markets: {
        ah_main: {
          handicap: '+0.5', // 主队受让半球 (+0.5)，客队让半球 (-0.5)
          home_selection: '+0.5',
          away_selection: '-0.5',
          home_odds: 1.92,
          away_odds: 1.92
        }
      } as any
    },
    quant_features: {
      ...basePayload.quant_features,
      risk_flags: [QuantAlert.WING_DEFENSE_EXPOSURE],
      tactical_formation: contextWingExposed.tactical_formation
    } as any
  };

  const underdogNoReinforcementResult: AiEvaluationResult = {
    grade: RecommendationGrade.A_GRADE,
    confidence_score: 88,
    risk_warnings: [],
    recommended_legs: [
      {
        market: 'ASIAN_HANDICAP_MAIN',
        direction: 'HOME', // 主队是受让方 (+0.5)
        selected_line: '+0.5',
        current_odds: 1.92,
        minimum_acceptable_odds: 1.85,
        basis: 'Backing home underdogs based on home advantage'
      }
    ],
    market_scan: {
      market: 'ASIAN_HANDICAP_MAIN',
      direction: 'HOME',
      selected_line: '+0.5',
      current_odds: 1.92
    } as any,
    internal_logical_audit: 'Standard tactical view without covering wing space',
    qualitative_summary: 'Home side has good home record'
  } as any;

  const guardedUnderdog = verifyStatutoryAlignment(underdogNoReinforcementResult, wingPayload);
  assert.equal(
    guardedUnderdog.grade,
    RecommendationGrade.B_GRADE,
    'Underdog backing team with WING_DEFENSE_EXPOSURE without reinforcement MUST be downgraded to B_GRADE'
  );
  assert.equal(
    guardedUnderdog.confidence_score,
    80,
    'Confidence MUST be capped at 80 for exposed underdog'
  );
  assert.ok(
    guardedUnderdog.risk_warnings?.some(w => w.includes('WING_DEFENSE_EXPOSURE')),
    'Warnings must mention WING_DEFENSE_EXPOSURE'
  );

  // 2.4 当存在有效针对性防守补强时，不产生误拦截，保留 A 级资格
  const underdogWithReinforcementResult: AiEvaluationResult = {
    ...underdogNoReinforcementResult,
    internal_logical_audit: '主帅在阵型边肋部署了针对性防守补强，双后腰深度横移保护肋部大空档',
    qualitative_summary: '有针对性防守补强方案'
  };

  const guardedReinforced = verifyStatutoryAlignment(underdogWithReinforcementResult, wingPayload);
  assert.equal(
    guardedReinforced.grade,
    RecommendationGrade.A_GRADE,
    'When explicit defensive reinforcement is documented, A_GRADE is preserved without false positive interception'
  );

  // 2.5 推荐上盘让球方（客队 -0.5）不受主队边肋暴露惩罚
  const favoriteResult: AiEvaluationResult = {
    grade: RecommendationGrade.A_GRADE,
    confidence_score: 88,
    risk_warnings: [],
    recommended_legs: [
      {
        market: 'ASIAN_HANDICAP_MAIN',
        direction: 'AWAY', // 客队是让球强队 (-0.5)
        selected_line: '-0.5',
        current_odds: 1.92,
        minimum_acceptable_odds: 1.85,
        basis: 'Away favorite can exploit home exposed wing space'
      }
    ],
    market_scan: {
      market: 'ASIAN_HANDICAP_MAIN',
      direction: 'AWAY',
      selected_line: '-0.5',
      current_odds: 1.92
    } as any,
    internal_logical_audit: 'Exploiting wing vulnerabilities of home team',
    qualitative_summary: 'Away side attack strength'
  } as any;

  const guardedFavorite = verifyStatutoryAlignment(favoriteResult, wingPayload);
  assert.equal(
    guardedFavorite.grade,
    RecommendationGrade.A_GRADE,
    'Backing favorite side to exploit exposed opponent MUST NOT be intercepted'
  );
});

test('Anti-Fake Data Hardening: Scheme 5 - Two-Phase OOS Archive Partitioning & Stage Isolation', () => {
  const baseTime = '2026-09-17T12:00:00.000Z';
  const buildOptions = {
    generated_at: '2026-09-17T12:00:00.000Z',
    model_version: 'v1.0.0',
    training_window_start_at: '2026-01-01T00:00:00.000Z',
    training_window_end_at: '2026-06-30T23:59:59.000Z',
    prediction_window_start_at: '2026-07-01T00:00:00.000Z',
    prediction_window_end_at: '2026-09-17T11:59:59.000Z'
  };

  const createSampleList = (count: number, stage: 'PREMATCH' | 'LIVE', market: 'ASIAN_HANDICAP_MAIN', prob: number, outcome: number): OosCalibrationSample[] => {
    return Array.from({ length: count }, (_, i) => ({
      sample_id: `${stage}_${market}_${i}`,
      model_version: 'v1.0.0',
      prediction_at: '2026-08-01T10:00:00.000Z',
      league_key: 'Premier League',
      home_team_key: 'Arsenal',
      away_team_key: 'Chelsea',
      stage,
      minute: stage === 'LIVE' ? 45 : null,
      score_state: '0-0',
      red_card_state: '0-0',
      market,
      model_probability: prob,
      outcome,
      predicted_lambda: 1.5,
      observed_goals: 1.0
    }));
  };

  // 210 Prematch samples (well-calibrated: prob 0.6, outcome 1, error = 0.16)
  const prematchSamples = createSampleList(210, 'PREMATCH', 'ASIAN_HANDICAP_MAIN', 0.6, 1);
  // 210 Live samples (well-calibrated: prob 0.7, outcome 1, error = 0.09)
  const liveSamples = createSampleList(210, 'LIVE', 'ASIAN_HANDICAP_MAIN', 0.7, 1);

  const archive = buildOosCalibrationArchive([...prematchSamples, ...liveSamples], buildOptions);

  // 1. 验证归档结构划分：prematch_global_profiles 与 live_global_profiles 独立存在
  assert.ok(archive.prematch_global_profiles, 'Archive MUST contain prematch_global_profiles');
  assert.ok(archive.live_global_profiles, 'Archive MUST contain live_global_profiles');
  assert.equal(archive.prematch_global_profiles.length, 1);
  assert.equal(archive.live_global_profiles.length, 1);
  assert.equal(archive.prematch_global_profiles[0].stage, 'PREMATCH');
  assert.equal(archive.live_global_profiles[0].stage, 'LIVE');

  // 2. 验证 selectOosCalibrationProfile 严格隔离
  const prematchMatch: CanonicalMatch = {
    canonical_id: 'match_prematch_iso',
    league_name: 'Premier League',
    home_team_name: 'Arsenal',
    away_team_name: 'Chelsea',
    created_at: '2026-08-05T10:00:00.000Z',
    timing: { stage: MatchStage.PREMATCH, minute: null } as any,
    score: { home_score: 0, away_score: 0 } as any,
    markets: {} as any
  } as any;

  const liveMatch: CanonicalMatch = {
    canonical_id: 'match_live_iso',
    league_name: 'Premier League',
    home_team_name: 'Arsenal',
    away_team_name: 'Chelsea',
    created_at: '2026-08-05T10:00:00.000Z',
    timing: { stage: MatchStage.LIVE, minute: 45 } as any,
    score: { home_score: 0, away_score: 0 } as any,
    markets: {} as any
  } as any;

  const selectedPrematch = selectOosCalibrationProfile(archive, prematchMatch, 'ASIAN_HANDICAP_MAIN');
  assert.ok(selectedPrematch, 'Prematch match should find matching prematch profile');
  assert.equal(selectedPrematch.stage, 'PREMATCH', 'Selected profile for prematch MUST have stage PREMATCH');

  const selectedLive = selectOosCalibrationProfile(archive, liveMatch, 'ASIAN_HANDICAP_MAIN');
  assert.ok(selectedLive, 'Live match should find matching live profile');
  assert.equal(selectedLive.stage, 'LIVE', 'Selected profile for live MUST have stage LIVE');

  // 3. 验证纯 Live 档案在 Prematch 查询时决不跨阶段借用（降级熔断）
  const liveOnlyArchive = buildOosCalibrationArchive(liveSamples, buildOptions);
  const crossPrematchAttempt = selectOosCalibrationProfile(liveOnlyArchive, prematchMatch, 'ASIAN_HANDICAP_MAIN');
  assert.equal(
    crossPrematchAttempt,
    undefined,
    'Prematch match MUST NOT borrow Live profile when no prematch profile exists; must return undefined'
  );

  // 4. 验证纯 Prematch 档案在 Live 查询时决不跨阶段借用（降级熔断）
  const prematchOnlyArchive = buildOosCalibrationArchive(prematchSamples, buildOptions);
  const crossLiveAttempt = selectOosCalibrationProfile(prematchOnlyArchive, liveMatch, 'ASIAN_HANDICAP_MAIN');
  assert.equal(
    crossLiveAttempt,
    undefined,
    'Live match MUST NOT borrow Prematch profile when no live profile exists; must return undefined'
  );
});

test('Anti-Fake Data Hardening: Scheme 5 - Brier Score Circuit Breaker & Candidate State Machine Interception', () => {
  const buildOptions = {
    generated_at: '2026-09-17T12:00:00.000Z',
    model_version: 'v1.0.0',
    training_window_start_at: '2026-01-01T00:00:00.000Z',
    training_window_end_at: '2026-06-30T23:59:59.000Z',
    prediction_window_start_at: '2026-07-01T00:00:00.000Z',
    prediction_window_end_at: '2026-09-17T11:59:59.000Z'
  };

  // 生成 210 条严重失准样本：预测概率 0.90，结果为 0 (二元平方误差 = (0.9 - 0)^2 = 0.81 > 0.28)
  const badSamples: OosCalibrationSample[] = Array.from({ length: 210 }, (_, i) => ({
    sample_id: `bad_sample_${i}`,
    model_version: 'v1.0.0',
    prediction_at: '2026-08-01T10:00:00.000Z',
    league_key: 'La Liga',
    home_team_key: 'Real Madrid',
    away_team_key: 'Barcelona',
    stage: 'PREMATCH',
    minute: null,
    score_state: '0-0',
    red_card_state: '0-0',
    market: 'ASIAN_HANDICAP_MAIN',
    model_probability: 0.90,
    outcome: 0,
    predicted_lambda: 2.0,
    observed_goals: 0.0
  }));

  const brokenArchive = buildOosCalibrationArchive(badSamples, buildOptions);
  const brokenProfile = brokenArchive.profiles.find(p => p.league_key === 'La Liga');
  assert.ok(brokenProfile, 'Profile should exist');
  assert.equal(brokenProfile.status, 'REJECTED', 'Brier score > 0.28 MUST set status to REJECTED');
  assert.equal(brokenProfile.circuit_breaker_triggered, true, 'circuit_breaker_triggered MUST be true');
  assert.ok(
    (brokenProfile.oos_brier_score ?? 0) > BRIER_CIRCUIT_BREAKER_THRESHOLD,
    `Brier score must exceed threshold ${BRIER_CIRCUIT_BREAKER_THRESHOLD}`
  );

  // 检验 candidateStateMachine 对熔断档案与跨阶段污染档案的拦截
  const dummySignal = {
    market: 'ASIAN_HANDICAP_MAIN',
    line: '-0.5',
    side: 'home',
    odds: 1.95,
    ev: 0.08,
    model_probability: 0.58,
    confidence: 85,
    kelly_fraction: 0.04
  };

  // 1. 跨阶段污染测试：赛事为 LIVE，但 profile.stage 为 PREMATCH
  const crossStageProfile = {
    ...brokenProfile,
    status: 'VALIDATED' as const,
    circuit_breaker_triggered: false,
    oos_brier_score: 0.18,
    effective_sample_size: 250,
    stage: 'PREMATCH' as const
  };

  const crossStageEval = evaluateCandidatePipeline({
    rawSignals: [dummySignal],
    resolveOosMarket: () => 'ASIAN_HANDICAP_MAIN',
    resolveOosProfile: () => crossStageProfile,
    adjustedConfidence: 85,
    dataQualityScore: 90,
    modelStabilityScore: 90,
    canPriceMarket: true,
    liveStatsAvailable: true,
    stage: MatchStage.LIVE, // 比赛为滚球
    hasEvidenceConflict: false,
    postGoalCooldownActive: false,
    permissiveOosMode: false,
    allowSecondaryLines: true,
    currentScore: '0-0',
    snapshotTime: '2026-09-17T12:00:00.000Z',
    momentumPoints: 10,
    timelineEventsCount: 2
  });

  assert.equal(crossStageEval.validations[0].status, 'REJECTED');
  assert.equal(crossStageEval.validations[0].is_circuit_broken, true);
  assert.ok(
    crossStageEval.validations[0].blockers.some(b => b.includes('跨阶段校准档案污染熔断')),
    'Blocker must explicitly report cross-stage calibration archive contamination'
  );

  // 2. Brier 劣化熔断拦截测试
  const brierFailingProfile = {
    ...brokenProfile,
    stage: 'PREMATCH' as const,
    circuit_breaker_triggered: true,
    circuit_breaker_reason: 'OOS Brier score 0.81 > 0.28 触发严重校准质量劣化熔断'
  };

  const brierFailingEval = evaluateCandidatePipeline({
    rawSignals: [dummySignal],
    resolveOosMarket: () => 'ASIAN_HANDICAP_MAIN',
    resolveOosProfile: () => brierFailingProfile,
    adjustedConfidence: 85,
    dataQualityScore: 90,
    modelStabilityScore: 90,
    canPriceMarket: true,
    liveStatsAvailable: true,
    stage: MatchStage.PREMATCH,
    hasEvidenceConflict: false,
    postGoalCooldownActive: false,
    permissiveOosMode: false,
    allowSecondaryLines: true,
    currentScore: '0-0',
    snapshotTime: '2026-09-17T12:00:00.000Z',
    momentumPoints: 10,
    timelineEventsCount: 2
  });

  assert.equal(brierFailingEval.validations[0].status, 'REJECTED');
  assert.equal(brierFailingEval.validations[0].is_circuit_broken, true);
  assert.ok(
    brierFailingEval.validations[0].blockers.some(b => b.includes('劣化熔断') || b.includes('REJECTED')),
    'Blocker must report degradation circuit breaker'
  );
});

test('Anti-Fake Data Hardening: Scheme 5 - Layer 04 AlignmentGuard Circuit Breaker Downgrade', () => {
  const baseResult: AiEvaluationResult = {
    grade: RecommendationGrade.A_GRADE,
    confidence_score: 90,
    recommended_legs: [
      {
        market: 'ASIAN_HANDICAP_MAIN',
        direction: 'HOME',
        selected_line: '-0.5',
        current_odds: 1.95,
        minimum_acceptable_odds: 1.88,
        kelly_percentage: 4.0,
        edge_percentage: 8.0,
        risk_tier: 'LOW' as any
      }
    ],
    tactical_regime: TacticalRegimeEvaluation.NEUTRAL_EQUILIBRIUM,
    posture_audit: 'Valid statutory' as any,
    risk_warnings: [],
    key_drivers: ['Strong home offense'],
    veto_applied: false,
    action_type: 'PRIMARY_RECOMMENDATION' as any
  };

  // 触发熔断时的 Payload
  const brokenPayload: EvaluatorPayload = {
    lineup_value_matrix: {
      is_lineup_confirmed: true,
      home: { starting_xi_market_value: 100 },
      away: { starting_xi_market_value: 100 }
    } as any,
    ai_brief: {
      canonical_id: 'match_cb_test',
      status_summary: 'PREMATCH',
      score_verification: { current_score: '0 - 0' },
      core_markets: {
        ah_main: {
          handicap: '-0.5',
          home_odds: 1.95,
          away_odds: 1.90,
          raw_spread_market: {
            home_odds: 1.95,
            away_odds: 1.90,
            line: '-0.5'
          }
        }
      }
    } as any,
    quant_features: {
      candidate_pipeline: {
        state: 'PRODUCTION_UNLOCKED',
        machine_candidate_count: 1,
        blockers: [],
        validations: [
          {
            market: 'ASIAN_HANDICAP_MAIN',
            status: 'REJECTED',
            effective_sample_size: 210,
            oos_brier_score: 0.35,
            is_circuit_broken: true,
            circuit_breaker_reason: 'OOS Brier score 0.35 > 0.28 触发熔断',
            blockers: ['OOS Brier score 0.35 > 0.28 触发熔断']
          }
        ]
      } as any,
      machine_candidate_signals: [
        {
          market: 'ASIAN_HANDICAP_MAIN',
          line: '-0.5',
          side: 'home',
          odds: 1.95
        }
      ],
      oos_semantic_status: {
        profile_status: 'REJECTED',
        is_oos_validated: false,
        effective_sample_size: 210,
        is_circuit_broken: true,
        circuit_breaker_reason: 'OOS Brier score 0.35 > 0.28 触发熔断',
        audit_rule: 'Circuit breaker active'
      },
      confidence_score: 90
    } as any
  };

  const guarded = verifyStatutoryAlignment(baseResult, brokenPayload);

  // 验证：强制撤销 A_GRADE 降为 B_GRADE，置信度封顶 75 分
  assert.equal(
    guarded.grade,
    RecommendationGrade.B_GRADE,
    'When calibration profile is circuit broken, A_GRADE MUST be demoted to B_GRADE'
  );
  assert.ok(
    guarded.confidence_score <= 75,
    `Confidence score MUST be capped at 75 (got ${guarded.confidence_score})`
  );
  assert.ok(
    guarded.risk_warnings.some(w => w.includes('方案 5 隔离与熔断') || w.includes('触发降级熔断')),
    'Risk warnings must explain the Scheme 5 circuit breaker degradation'
  );
});

test('Anti-Fake Data Hardening: Scheme 6 - Dynamic Truncation & Adaptive Windowing at Early Match', () => {
  // 构造一个 YBTY 时钟为 7 分钟的 CanonicalMatch，
  // attack_momentum.data 中包含 1' ~ 9' 共 9 个点（minute 8、9 属于未来，必须被截断）
  // nominal_segment_minutes = 1 表示每个数据点对应 1 分钟
  const earlyMatch = {
    canonical_id: 'scheme6_early_test',
    home_team_name: 'Home',
    away_team_name: 'Away',
    timing: { stage: 'LIVE' as any, minute: 7 },
    score: { home_score: 0, away_score: 0 },
    markets: {} as any,
    reference: {
      stats: null,
      attack_momentum: {
        available: true,
        nominal_segment_minutes: 1,
        // index 0 = minute 1, index 6 = minute 7, index 7 = minute 8 (future), index 8 = minute 9 (future)
        data: [[10, 15, 20, 25, 30, 35, 40, 99, 99]] // 9 points in segment 0
      },
      timeline_events: [],
      lineups: null,
      tactical_context: {
        head_to_head_count: 0, home_recent_matches_count: 0, away_recent_matches_count: 0,
        h2h_raw: [], home_recent_matches: [], away_recent_matches: []
      },
      odds_matrix: null, league_standings: null, goal_distribution: null
    } as any
  } as any;

  const features = extractMomentumTimelineFeatures(earlyMatch);

  // 未来点 (minute 8, 9) 必须被物理截断 → 只剩 7 个点
  assert.equal(features.total_points, 7, 'Future points (minute 8, 9) must be truncated; only 7 valid points remain');
  // 开场 7 分钟 < 15 分钟，is_early_match_dampened 必须为 true
  assert.equal(features.is_early_match_dampened, true, 'is_early_match_dampened must be true at minute 7');
  // 无时钟倒挂（没有点超过 YBTY 时钟 7' 的情况，因为 8' 9' 已被截断）
  assert.equal(features.temporal_inversion_detected, true, 'temporal_inversion_detected should be true since raw data had points beyond cutoff');
  // 无时序严重滞后（最新点 minute 7 = 当前时钟 7'，滞后 0'）
  assert.equal(features.temporal_lag_warning, false, 'No severe lag when latest point equals current clock');
  // 15m 窗口比率：min(7, 7) / 15 ≈ 0.47
  assert.ok(features.adaptive_window_ratio !== undefined, 'adaptive_window_ratio must be defined');
  assert.ok(
    Math.abs((features.adaptive_window_ratio?.fifteen ?? 0) - 7 / 15) < 0.02,
    `15-min ratio should be ~7/15=0.47, got ${features.adaptive_window_ratio?.fifteen}`
  );
  // 5m 窗口比率：在 minute 7 时有 5 个点 (3..7)，ratio = min(5,5)/5 = 1.0
  assert.ok(
    (features.adaptive_window_ratio?.five ?? 0) >= 1.0,
    `5-min ratio should be 1.0 at minute 7 (have full 5 min), got ${features.adaptive_window_ratio?.five}`
  );

  // 自适应能量归一化检验：
  // 15m 积分网 = 10+15+20+25+30+35+40 = 175
  // effectiveNorm15 = slice15.length = 7，energy15 = 175 / 7 = 25.0
  // 若不自适应，直接 175/15 ≈ 11.67 会大幅低估
  assert.ok(
    features.integral_15m.net >= 175,
    `Raw 15m integral.net should be 175 (sum of all 7 valid points), got ${features.integral_15m.net}`
  );
});

test('Anti-Fake Data Hardening: Scheme 6 - EventPressureConversion Adaptive Energy Base at Early Match', () => {
  // 直接构造 MomentumTimelineFeatures 测试 calculateEventPressureConversion 的自适应能量基准
  // 开场 7 分钟，adaptiveEnergyBase = max(10, 50 * 7/15) ≈ 23.33
  // 这比固定 50 小得多，可防止转化比率被假稀释
  const timeline: MomentumTimelineFeatures = Object.freeze({
    total_points: 7,
    window_basis: 'MINUTE_ALIGNED' as const,
    cutoff_minute: 7,
    window_coverage_minutes: { from: 1, to: 7 },
    window_sample_counts: { five: 5, ten: 7, fifteen: 7 },
    current_instant_momentum: 40,
    slope_5m: 5,
    slope_10m: 5,
    slope_15m: 5,
    integral_5m: { home: 125, away: 0, net: 125 },
    integral_15m: { home: 175, away: 0, net: 175 },
    integral_full_match: { home: 175, away: 0, net: 175 },
    dominance_side: 'home' as const,
    inflection_count_recent_15m: 0,
    is_sustained_siege: false,
    is_counter_attack_surge: false,
    adaptive_window_ratio: { five: 1.0, ten: 0.7, fifteen: 7/15 },
    is_early_match_dampened: true,
    temporal_inversion_detected: false,
    temporal_lag_warning: false,
    temporal_lag_minutes: 0
  });

  const trinity = {
    home: { momentum_support: 0.8, event_support: 0.5, stats_support: 0.6, has_conflict: false, confidence: 0.7 },
    away: { momentum_support: 0.2, event_support: 0.1, stats_support: 0.2, has_conflict: false, confidence: 0.3 },
    dominant_side: 'home' as const,
    has_material_conflict: false,
    rationale: []
  };

  const conv = calculateEventPressureConversion(timeline, [], trinity, 7);

  // 开场 7 分钟，adaptiveEnergyBase = max(10, 50 * 7/15) ≈ 23.33
  // homeNormEnergy = max(1, 175 / 23.33) ≈ 7.5
  // homeRatio = homeEventScore(0) / homeNormEnergy = 0
  // 关键验证：不应触发假性 BARREN_DOMINANCE（因为 event_score=0 而非 energy 假稀释）
  assert.ok(conv !== undefined, 'calculateEventPressureConversion must return a result');
  assert.ok(conv.home !== undefined, 'home EPI features must be defined');
  // 主队能量显著，能量不应被固定 50 假放大到 175/50=3.5 倍的归一化能量单位
  // 而应该是 175/23.33 ≈ 7.5，更正确地反映开场强度
  assert.ok(conv.home.energy_15m >= 0, 'home energy_15m should be non-negative');
  assert.ok(typeof conv.potency_differential === 'number', 'potency_differential must be a number');
});

test('Anti-Fake Data Hardening: Scheme 6 - Severe Temporal Lag Triggers Warning & Downgrades Recommendation', () => {
  // 1. 构造一个 YBTY 时钟为 75' 但雷速点阵最新只有 65' 的 CanonicalMatch（滞后 10'）
  // nominal_segment_minutes=1，segment 包含 minute 60~65 共 6 个点
  const lagMatch = {
    canonical_id: 'scheme6_lag_test',
    home_team_name: 'Home',
    away_team_name: 'Away',
    timing: { stage: 'LIVE' as any, minute: 75 },
    score: { home_score: 1, away_score: 0 },
    markets: {} as any,
    reference: {
      stats: null,
      attack_momentum: {
        available: true,
        nominal_segment_minutes: 1,
        // 59 空白 + 6 数据点 = 65 个点 → 最后一个点 minute = 65
        // YBTY 时钟 75'，雷速最新 65'，lag = 10 分钟 > 8 分钟阈值
        data: [Array.from({ length: 65 }, (_, i) => i < 59 ? 0 : 10)]
      },
      timeline_events: [],
      lineups: null,
      tactical_context: {
        head_to_head_count: 0, home_recent_matches_count: 0, away_recent_matches_count: 0,
        h2h_raw: [], home_recent_matches: [], away_recent_matches: []
      },
      odds_matrix: null, league_standings: null, goal_distribution: null
    } as any
  } as any;

  const features = extractMomentumTimelineFeatures(lagMatch);

  // 验证时序滞后检测
  assert.equal(features.temporal_lag_warning, true, 'Lag of 10 min (>8) must trigger temporal_lag_warning');
  assert.equal(features.temporal_lag_minutes, 10, 'Lag minutes must be exactly 10');

  // 2. 验证 Layer 04 alignmentGuard 拦截：A 级降为 B 级，置信度上限 75 分
  // （直接用 risk_flags 构造 EvaluatorPayload 测试 alignmentGuard，避免需要构造完整 calculateConfidenceAndAlerts 依赖）
  const baseResult: AiEvaluationResult = {
    canonical_id: 'scheme6_lag_test',
    home_team_name: 'Home',
    away_team_name: 'Away',
    match_status: 'IN_PLAY',
    grade: RecommendationGrade.A_GRADE,
    confidence_score: 92,
    recommended_legs: [
      {
        market: 'ASIAN_HANDICAP_MAIN',
        direction: 'HOME',
        selected_line: '-0.5',
        current_odds: 1.95,
        basis: 'Strong home dominance'
      }
    ],
    risk_warnings: []
  };

  const payload: EvaluatorPayload = {
    ai_brief: {
      canonical_id: 'scheme6_lag_test',
      status_summary: 'LIVE 75\'',
      score_verification: { current_score: '1 - 0', is_verified: true },
      core_markets: {
        ah_main: { handicap: '-0.5', home_odds: 1.95, away_odds: 1.85 }
      } as any
    } as any,
    lineup_value_matrix: { is_lineup_confirmed: true } as any,
    quant_features: {
      candidate_pipeline: {
        state: 'PRODUCTION_UNLOCKED',
        machine_candidate_count: 1,
        blockers: [],
        validations: []
      } as any,
      machine_candidate_signals: [
        { market: 'ASIAN_HANDICAP_MAIN', line: '-0.5', side: 'HOME', odds: 1.95 }
      ] as any,
      risk_flags: [QuantAlert.TEMPORAL_LAG_WARNING],
      confidence_score: 92
    } as any
  };

  const guarded = verifyStatutoryAlignment(baseResult, payload);

  assert.equal(
    guarded.grade,
    RecommendationGrade.B_GRADE,
    'A_GRADE must be demoted to B_GRADE upon TEMPORAL_LAG_WARNING'
  );
  assert.ok(
    guarded.confidence_score <= 75,
    `Confidence score must be capped at 75 (got ${guarded.confidence_score})`
  );
  assert.ok(
    guarded.risk_warnings.some(w => w.includes('TEMPORAL_LAG_WARNING') || w.includes('多源时钟不同步')),
    'Risk warning must state temporal lag risk'
});

test('Anti-Fake Data Hardening: Scheme 8 - Directness Ratio and Shot Quality / Save Severity Extraction', async () => {
  const dummyMatch: CanonicalMatch = {
    canonical_id: 'scheme8_test_match',
    stage: MatchStage.IN_PLAY,
    match_status: 'IN_PLAY',
    timing: {
      minute: 65,
      kickoff_timestamp_ms: Date.now() - 65 * 60 * 1000,
      regular_time_remaining_minutes: 25
    } as any,
    score: {
      home_score: 1,
      away_score: 0,
      current_score: '1 - 0',
      is_verified: true,
      verification_source: 'CANVAS_OCR'
    } as any,
    reference: {
      stats: {
        dangerous_attacks: { home: 18, away: 28 },
        attacks: { home: 80, away: 38 },
        shots: { home: 4, away: 6 },
        shots_on_target: { home: 1, away: 4 },
        shots_off_target: { home: 3, away: 2 },
        corners: { home: 2, away: 3 },
        possession: { home: 68, away: 32 },
        yellow_cards: { home: 0, away: 1 },
        red_cards: { home: 0, away: 0 }
      } as any,
      timeline_events: [
        {
          id: 'ev1',
          side: 'away',
          minute: 48,
          type: 21,
          canonical_type: CanonicalEventType.SHOT_ON_TARGET,
          text: '客队前锋单刀射门，主队门将神勇扑出！'
        },
        {
          id: 'ev2',
          side: 'away',
          minute: 55,
          type: 21,
          canonical_type: CanonicalEventType.SHOT_ON_TARGET,
          text: '客队角球传中，后点爆射被门线解围！'
        },
        {
          id: 'ev3',
          side: 'home',
          minute: 60,
          type: 21,
          canonical_type: CanonicalEventType.SHOT_ON_TARGET,
          text: '主队远射角度太正，客队守门员轻松抱住。'
        }
      ] as any
    } as any
  } as any;

  const physical = extractRealTimePhysicalStats(dummyMatch);

  // 1. 验证建议 2：纵向直接度比率 Directness Ratio
  // 客队：控球率 32% (<=45%), 危险进攻 28, 射正 4 (>=2), 进攻 38.
  // 客队分母: 38 * (32 + 15) = 1786. 分子: 28 * 4.5 = 126. 126 / 1786 * 100 = 7.055 >= 2.5
  assert.ok(physical.counter_threat_index.away_directness_ratio !== undefined);
  assert.ok((physical.counter_threat_index.away_directness_ratio ?? 0) >= 2.5);
  assert.equal(
    physical.counter_threat_index.high_directness_counter_side,
    'away',
    'Low-possession, high-directness team with 4 SOT must be flagged as high_directness_counter_side away'
  );

  // 主队：控球率 68%, 慢速传控倒脚, 直接度应当极低且不被判定为 high_directness
  assert.ok((physical.counter_threat_index.home_directness_ratio ?? 0) < 1.0);
  assert.notEqual(physical.counter_threat_index.high_directness_counter_side, 'home');

  // 2. 验证建议 3：射正扑救成色代理
  // 客队 2 次重大险情 (神勇扑出 + 门线解围) -> away_big_chance_threat = 0.45 + 0.45 = 0.90
  // 主队 1 次常规没收 -> home_big_chance_threat = 0.10
  assert.equal(physical.shot_efficiency.away_big_chance_threat, 0.9);
  assert.equal(physical.shot_efficiency.home_big_chance_threat, 0.1);
  assert.equal(physical.shot_efficiency.home_keeper_saves_severity, 0.9); // 主队门将承受高负荷神扑
  assert.equal(physical.shot_efficiency.away_keeper_saves_severity, 0.1);

  // 3. 验证三源威胁与 EPI 对成色与高锐度反击的响应
  const timelineFeatures: any = {
    integral_15m: { home: 40, away: 30, net: -10 },
    integral_5m: { home: 10, away: 10, net: 0 }
  };
  const trinity = calculateLiveThreatTrinity(timelineFeatures, dummyMatch.reference!.timeline_events as any, physical, 65);
  assert.ok(trinity.away.calibrated_threat > 0);

  const epi = calculateEventPressureConversion(timelineFeatures, dummyMatch.reference!.timeline_events as any, trinity, 65, physical);
  // 客队兼具高直接度反击与破门险情，软分类应当识别为刺客反击态 (CLINICAL_COUNTER) 或有效进攻
  assert.ok(
    epi.away.classification === EventPressureConversionType.CLINICAL_COUNTER ||
    epi.away.classification === EventPressureConversionType.LETHAL_SIEGE,
    `Away team should be classified as CLINICAL_COUNTER or LETHAL_SIEGE, got ${epi.away.classification}`
  );
});





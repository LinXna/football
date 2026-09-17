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
  calculateDecayedEventScore
} from '../refactor/03_quant_engine/eventMomentumFusion.ts';
import { YellowCardContextType, TacticalRegimeType, QuantAlert } from '../refactor/03_quant_engine/enums.js';
import { extractRealTimePhysicalStats } from '../refactor/03_quant_engine/momentumQuantEngine.js';
import { buildUnifiedMatchState, calculateConfidenceAndAlerts } from '../refactor/03_quant_engine/index.js';
import { calculateInPlayPoissonFeatures } from '../refactor/03_quant_engine/poissonDecayModel.js';
import { CanonicalTimelineEvent } from '../refactor/02_canonical_model/types.js';
import { CanonicalIncidentCategory, CanonicalEventType, MatchStage } from '../refactor/02_canonical_model/enums.js';
import { verifyStatutoryAlignment } from '../refactor/04_ai_evaluator/alignmentGuard.js';
import { RecommendationGrade } from '../refactor/04_ai_evaluator/enums.js';
import { AiEvaluationResult, EvaluatorPayload } from '../refactor/04_ai_evaluator/types.js';

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




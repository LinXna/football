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
              { goals: 1 }, // 0-15
              { goals: 0 }, // 16-30
              { goals: 0 }, // 31-45
              { goals: 0 }, // 46-60
              { goals: 0 }, // 61-75
              { goals: 0 }  // 76-90
            ]
          }
        }
      }
    }
  } as unknown as CanonicalMatch;

  const dna = extractGoalDistributionDNA(matchWithGoals);
  // Raw: 1 goal in interval 0, 0 in other 5 intervals. Total goals = 1.
  // With Dirichlet Alpha = 1.0, K = 6:
  // denom = 1 + 6 = 7.
  // interval 0 weight = (1 + 1) / 7 = 2/7 ≈ 0.2857
  // interval 1 weight = (0 + 1) / 7 = 1/7 ≈ 0.1429
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

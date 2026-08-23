import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  selectMainMarketLine, 
  calculatePrematchQuantAnalysis, 
  calculateLiveQuantAnalysis, 
  calculateMachineQuantAnalysis,
  poissonProb,
  getDixonColesTau,
  generateDixonColesMatrix,
  calculateWeightedH2HAlpha,
  calculateTwoTierRecentFormAlpha,
  evaluateStandingsTraps,
  evaluateDataCompleteness,
  getDynamicHalfRatio
} from '../src/lib/machineQuantPrediction';
import { DecisionItem } from '../src/types';

test('Machine Quant Prediction Engine v2.0 - Poisson Math Base', () => {
  const p0 = poissonProb(2.0, 0);
  assert.ok(Math.abs(p0 - 0.1353) < 0.005);

  const p2 = poissonProb(2.0, 2);
  assert.ok(Math.abs(p2 - 0.2707) < 0.005);
});

test('Machine Quant Prediction Engine v2.5 - Dixon-Coles Tau & Matrix Correction', () => {
  // Test tau values with negative rho = -0.07
  const tau00 = getDixonColesTau(0, 0, 1.4, 1.1, -0.07);
  // 1.0 - (1.4 * 1.1 * -0.07) = 1.0 + 0.1078 = 1.1078 (boost 0-0 probability)
  assert.ok(tau00 > 1.0);

  const tau10 = getDixonColesTau(1, 0, 1.4, 1.1, -0.07);
  // 1.0 + (1.1 * -0.07) = 1.0 - 0.077 = 0.923 (deflate 1-0)
  assert.ok(tau10 < 1.0);

  const tau11 = getDixonColesTau(1, 1, 1.4, 1.1, -0.07);
  // 1.0 - (-0.07) = 1.07 (boost 1-1 draw)
  assert.ok(tau11 > 1.0);

  const tau21 = getDixonColesTau(2, 1, 1.4, 1.1, -0.07);
  assert.equal(tau21, 1.0);

  const matrix = generateDixonColesMatrix(1.5, 1.2, -0.07);
  assert.equal(matrix.length, 8);
  assert.equal(matrix[0].length, 8);
  
  let sum = 0;
  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      sum += matrix[h][a];
    }
  }
  assert.ok(Math.abs(sum - 1.0) < 0.0001);
});

test('Machine Quant Prediction Engine v2.5 - Weighted H2H with Exponential Decay & Same-Venue Weight', () => {
  const nowSec = Date.now() / 1000;
  const matches = [
    {
      match_time: nowSec - 30 * 86400, // 30 days ago
      home_team: '温哥华白帽',
      away_team: '达拉斯FC',
      home_score: 3,
      away_score: 1
    },
    {
      match_time: nowSec - 200 * 86400, // 200 days ago
      home_team: '达拉斯FC',
      away_team: '温哥华白帽',
      home_score: 1,
      away_score: 1
    },
    {
      match_time: nowSec - 1200 * 86400, // > 3 years ago (should be excluded)
      home_team: '温哥华白帽',
      away_team: '达拉斯FC',
      home_score: 5,
      away_score: 0
    }
  ];

  const h2hRes = calculateWeightedH2HAlpha(matches, '温哥华白帽', '达拉斯FC');
  assert.equal(h2hRes.validCount, 2); // Excluded the 3+ year old match
  assert.ok(h2hRes.h2hDominanceAlpha > 0); // Vancouver has positive dominance
});

test('Machine Quant Prediction Engine v2.5 - Two-Tier Recent Form Alpha with Home/Away Split', () => {
  const homeRecent = [
    { is_home: true, home_team_id: 1, current_id: 1, score_for: 2, score_against: 0 },
    { is_home: true, home_team_id: 1, current_id: 1, score_for: 3, score_against: 1 },
    { is_home: false, home_team_id: 2, current_id: 1, score_for: 1, score_against: 1 },
    { is_home: false, home_team_id: 3, current_id: 1, score_for: 0, score_against: 2 }
  ];
  const awayRecent = [
    { is_home: false, away_team_id: 4, current_id: 4, score_for: 0, score_against: 2 },
    { is_home: false, away_team_id: 4, current_id: 4, score_for: 1, score_against: 3 },
    { is_home: true, away_team_id: 4, current_id: 4, score_for: 2, score_against: 1 }
  ];

  const formRes = calculateTwoTierRecentFormAlpha(homeRecent, awayRecent);
  assert.ok(formRes.formDominanceAlpha > 0); // Strong home form vs weak away form
  assert.ok(formRes.sampleSummary.includes('双层走势'));
});

test('Machine Quant Prediction Engine v2.5 - Standings Traps Engine', () => {
  // 1. Mid-Table Complacency Trap
  const midTableStandings = { home_rank: 9, away_rank: 10 };
  const trap1 = evaluateStandingsTraps(midTableStandings, '主队', '客队');
  assert.equal(trap1.hasTrap, true);
  assert.equal(trap1.trapType, 'MID_TABLE_COMPLACENCY');
  assert.equal(trap1.spreadConfidencePenalty, 0.75);

  // 2. Mutual Survival Draw Trap
  const relegationStandings = { home_rank: 15, away_rank: 16 };
  const trap2 = evaluateStandingsTraps(relegationStandings, '主队', '客队');
  assert.equal(trap2.hasTrap, true);
  assert.equal(trap2.trapType, 'MUTUAL_DRAW_SURVIVAL');
  assert.equal(trap2.tauDrawBoost, 0.12);
});

test('Machine Quant Prediction Engine v2.5 - Data Completeness Tiering & EV Capping', () => {
  const degradedMatch: any = {
    match: 'C队 vs D队',
    ybty_home: 'C队',
    ybty_away: 'D队',
    tactical_context: {}
  };
  const report = evaluateDataCompleteness(degradedMatch);
  assert.equal(report.level, 'DEGRADED_C');
  assert.equal(report.maxAllowedConfidence, 'LOW');
  assert.equal(report.maxAllowedEV, 8.0);
});

test('Machine Quant Prediction Engine v2.5 - Dynamic Half Ratio from Goal Distribution', () => {
  const goalDist = {
    home_0_45_pct: 0.48,
    away_0_45_pct: 0.46
  };
  const ratio = getDynamicHalfRatio(goalDist);
  assert.equal(ratio, 0.47);

  const defaultRatio = getDynamicHalfRatio(undefined);
  assert.equal(defaultRatio, 0.44);
});

test('Machine Quant Prediction Engine v2.0 - selectMainMarketLine (Main Line Selector)', () => {
  const rawMarkets = [
    // Alternative line: -1.5 @ 2.06 / +1.5 @ 1.84 (spread diff = 0.22)
    {
      market_type: 'full_spread',
      market_label: '全场让球',
      line: '-1.5',
      options: [
        { side: 'home', line: '-1.5', odds: 2.06 },
        { side: 'away', line: '-1.5', odds: 1.84 }
      ]
    },
    // Main balanced line: -1/1.5 @ 1.85 / +1/1.5 @ 2.05 (spread diff = 0.20)
    {
      market_type: 'full_spread',
      market_label: '全场让球',
      line: '-1/1.5',
      options: [
        { side: 'home', line: '-1/1.5', odds: 1.85 },
        { side: 'away', line: '-1/1.5', odds: 2.05 }
      ]
    },
    // Secondary deep line: -1 @ 1.63 / +1 @ 2.36 (spread diff = 0.73, out of band)
    {
      market_type: 'full_spread',
      market_label: '全场让球',
      line: '-1',
      options: [
        { side: 'home', line: '-1', odds: 1.63 },
        { side: 'away', line: '-1', odds: 2.36 }
      ]
    }
  ];

  const selected = selectMainMarketLine(rawMarkets, 'full_spread');
  assert.ok(selected.mainMarket !== null);
  assert.equal(selected.line, -1.25); // -1/1.5
  assert.equal(selected.options[0].numOdds, 1.85);
  assert.equal(selected.alternativeMarkets.length, 2);
});

test('Machine Quant Prediction Engine v2.0 - selectMainMarketLine Total Goals', () => {
  const rawMarkets = [
    {
      market_type: 'full_total',
      market_label: '全场大小球',
      line: '3.5',
      options: [
        { side: 'over', line: '3.5', odds: 2.11 },
        { side: 'under', line: '3.5', odds: 1.78 }
      ]
    },
    {
      market_type: 'full_total',
      market_label: '全场大小球',
      line: '3/3.5',
      options: [
        { side: 'over', line: '3/3.5', odds: 1.88 },
        { side: 'under', line: '3/3.5', odds: 2.00 }
      ]
    }
  ];

  const selected = selectMainMarketLine(rawMarkets, 'full_total');
  assert.equal(selected.line, 3.25); // 3/3.5
});

test('Machine Quant Prediction Engine v2.0 - Prematch Quant Engine (Vancouver vs Dallas)', () => {
  const vancouverMatch: DecisionItem = {
    id: 'test_van_dal',
    match: '温哥华白帽 vs 达拉斯FC',
    ybty_home: '温哥华白帽',
    ybty_away: '达拉斯FC',
    home_team: '温哥华白帽',
    away_team: '达拉斯FC',
    league: '美国职业大联盟',
    minute: 0,
    score: { home: 0, away: 0 },
    status: 'RESEARCH',
    unified_stats: {
      possession: { home: 50, away: 50 },
      shots: { home: 0, away: 0 },
      shots_on_target: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      dangerous_attacks: { home: 0, away: 0 },
      yellow_cards: { home: 0, away: 0 },
      red_cards: { home: 0, away: 0 }
    },
    tactical_context: {
      formation: { home: '4-2-3-1', away: '3-4-1-2' },
      lineup_status: 'CONFIRMED',
      key_absences_count: { home: 0, away: 0 }
    },
    market_snapshots: [
      {
        market_type: 'full_h2h',
        market_label: '全场独赢',
        is_verified: true,
        options: [
          { side: 'home', line: '主', odds: 1.42 },
          { side: 'away', line: '客', odds: 6.30 },
          { side: 'draw', line: '平', odds: 5.20 }
        ]
      },
      {
        market_type: 'full_spread',
        market_label: '全场让球',
        line: '-1/1.5',
        is_verified: true,
        options: [
          { side: 'home', line: '-1/1.5', odds: 1.85 },
          { side: 'away', line: '-1/1.5', odds: 2.05 }
        ]
      },
      {
        market_type: 'full_total',
        market_label: '全场大小球',
        line: '3/3.5',
        is_verified: true,
        options: [
          { side: 'over', line: '3/3.5', odds: 1.88 },
          { side: 'under', line: '3/3.5', odds: 2.00 }
        ]
      }
    ]
  };

  const quant = calculateMachineQuantAnalysis(vancouverMatch);
  assert.equal(quant.engineMode, 'PREMATCH_QUANT');

  // Expected goals MUST be around 3.0 ~ 3.4 for MLS 3/3.5 market, NOT hardcoded 1.20!
  assert.ok(quant.expectedRemainingGoals >= 2.9 && quant.expectedRemainingGoals <= 3.5);

  // Over/Under prediction should NOT be an absurd 78% Under (should be around 50% ~ 65%)
  const totalPred = quant.predictions.totalGoals;
  assert.ok(totalPred !== undefined);
  assert.ok(totalPred!.modelProbability >= 50 && totalPred!.modelProbability <= 65);

  // Asian handicap prediction: Vancouver -1.25 should be in reasonable range 45%~60%, NOT crushed to 22%
  const ahPred = quant.predictions.asianHandicap;
  assert.ok(ahPred !== undefined);
  assert.ok(ahPred!.modelProbability >= 45 && ahPred!.modelProbability <= 60);
});

test('Machine Quant Prediction Engine v2.0 - Zero-Bias Fallback on Missing Data', () => {
  const emptyFundamentalMatch: DecisionItem = {
    id: 'empty_fund',
    match: 'A队 vs B队',
    ybty_home: 'A队',
    ybty_away: 'B队',
    home_team: 'A队',
    away_team: 'B队',
    minute: 0,
    score: { home: 0, away: 0 },
    status: 'RESEARCH',
    unified_stats: {
      possession: { home: 50, away: 50 },
      shots: { home: 0, away: 0 },
      shots_on_target: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      dangerous_attacks: { home: 0, away: 0 },
      yellow_cards: { home: 0, away: 0 },
      red_cards: { home: 0, away: 0 }
    },
    tactical_context: {
      formation: { home: 'UNKNOWN', away: 'UNKNOWN' },
      lineup_status: 'UNKNOWN',
      key_absences_count: { home: 0, away: 0 }
    },
    market_snapshots: [
      {
        market_type: 'full_h2h',
        market_label: '全场独赢',
        is_verified: true,
        options: [
          { side: 'home', line: '主', odds: 2.10 },
          { side: 'draw', line: '平', odds: 3.30 },
          { side: 'away', line: '客', odds: 3.40 }
        ]
      },
      {
        market_type: 'full_total',
        market_label: '全场大小球',
        line: '2.5',
        is_verified: true,
        options: [
          { side: 'over', line: '2.5', odds: 1.95 },
          { side: 'under', line: '2.5', odds: 1.95 }
        ]
      }
    ]
  };

  const quant = calculateMachineQuantAnalysis(emptyFundamentalMatch);
  assert.equal(quant.dataQualityLevel, 'PURE_MARKET_CONSENSUS');
  assert.ok(quant.dataQualityBadge.includes('纯市场共识精算'));

  // Total goals should be ~2.50
  assert.ok(Math.abs(quant.expectedRemainingGoals - 2.50) < 0.2);

  // Model probability should be close to 50% for 1.95 / 1.95 line
  assert.ok(Math.abs(quant.predictions.totalGoals!.modelProbability - 50) <= 5);
  // EV should be near neutral / negative reflecting bookmaker margin (e.g. 50% * 1.95 - 1 = -2.5%)
  assert.ok(Math.abs(quant.predictions.totalGoals!.expectedValue) <= 8); // No artificial high EV
});

test('Machine Quant Prediction Engine v2.0 - Live In-Play Mode Routing', () => {
  const liveMatch: DecisionItem = {
    id: 'live_match_1',
    match: '主队 vs 客队',
    ybty_home: '主队',
    ybty_away: '客队',
    home_team: '主队',
    away_team: '客队',
    minute: 65,
    score: { home: 1, away: 0 },
    status: 'WATCH',
    is_live: true,
    unified_stats: {
      possession: { home: 60, away: 40 },
      shots: { home: 8, away: 2 },
      shots_on_target: { home: 4, away: 1 },
      corners: { home: 5, away: 1 },
      dangerous_attacks: { home: 45, away: 20 },
      yellow_cards: { home: 1, away: 2 },
      red_cards: { home: 0, away: 0 }
    },
    tactical_context: {
      formation: { home: '4-3-3', away: '4-4-2' },
      lineup_status: 'CONFIRMED',
      key_absences_count: { home: 0, away: 0 }
    },
    market_snapshots: [
      {
        market_type: 'full_spread',
        market_label: '全场让球',
        line: '-0.5',
        is_verified: true,
        options: [
          { side: 'home', line: '-0.5', odds: 1.90 },
          { side: 'away', line: '-0.5', odds: 1.95 }
        ]
      },
      {
        market_type: 'full_total',
        market_label: '全场大小球',
        line: '1.5/2',
        is_verified: true,
        options: [
          { side: 'over', line: '1.5/2', odds: 1.85 },
          { side: 'under', line: '1.5/2', odds: 2.05 }
        ]
      }
    ]
  };

  const quant = calculateMachineQuantAnalysis(liveMatch);
  assert.equal(quant.engineMode, 'LIVE_IN_PLAY_MOMENTUM');
  assert.ok(quant.homeThreatScore > 15);
  assert.equal(quant.dominanceStatus, 'HOME_DOMINANT');
});

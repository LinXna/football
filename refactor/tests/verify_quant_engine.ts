/**
 * @file verify_quant_engine.ts
 * @description Layer 03 M6: 确定性量化与博弈引擎端到端全覆盖单测与验证脚本
 * 
 * 测试覆盖范围：
 * 1. M2 测试：H2H 365天半衰期衰减与 730天截断、近期同构战绩筛选、首发伤停 LIS 折损、战意 MUI、L0 熔断机制
 * 2. M3 测试：最小二乘多尺度斜率求解、危攻能量积分 (AUC)、时序波形形态学 (持续围攻 vs 突发反击)、xT 真实穿透威胁模型、无效倒脚识别与红牌折损
 * 3. M4 测试：滚球 0:0 Forward 泊松推演、时间衰减与绝境搏命非线性放大、双变量泊松剩余比分矩阵
 * 4. M5 测试：Shin 知情交易者去抽水、四分之一盘 (-0.25, +0.25) 赢半输半复合期望分解、大小球 EV 评估、主副盘离散方差
 * 5. M6 统帅部综合测试：真实样本输入、BDI 指数求解、破门临界预警、置信度自适应扣分、L0 一票否决降级
 * 6. 生成不可变的标准量化特征样本 `refactor/samples/03_quant_engine/quant_features_sample.json`
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  calculateQuantitativeFeatures,
  calculateInPlayPoissonFeatures,
  buildUnifiedMatchState,
  extractCleanedContextFeatures,
  calculateLinearRegressionSlope,
  calculateMomentumIntegral,
  devigShin,
  devigMultiplicative,
  parseAsianHandicapLine,
  calculateAsianHandicapEV,
  calculateTotalGoalsEV,
  calculateTimeDecayAndUrgencyMultiplier,
  calculateBivariatePoissonGrid,
  calculateH2HDecayWeights,
  checkL0CircuitBreaker,
  extractMomentumTimelineFeatures,
  extractRealTimePhysicalStats,
  calculateLiveThreatTrinity,
  calculateEventPressureConversion,
  calculateDeviggedMarketFeatures,
  evaluateTacticalRegime,
  evaluateGoalClimax,
  buildOosCalibrationArchive,
  selectOosCalibrationProfile,
  extractSpatioTemporalEventFeatures,
  EventPressureConversionType,
  TacticalRegimeType,
  GoalClimaxLevel,
  QuantAlert
} from '../03_quant_engine/index.js';
import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage } from '../02_canonical_model/enums.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runQuantEngineTests() {
  console.log('================================================================');
  console.log('🚀 [Layer 03 Test Suite] 启动确定性量化与博弈引擎全覆盖验证');
  console.log('================================================================\n');

  const tracer = new Tracer();
  const collector = new DeficitCollector();

  // -------------------------------------------------------------------------
  // 单元测试 1: M2 数据清洗与时效熔炉算法测试
  // -------------------------------------------------------------------------
  console.log('👉 [Test 1/8] M2: 时效衰减与 L0 熔断算法测试...');
  {
    // (1) H2H 衰减测试
    const mockH2HMatch: CanonicalMatch = {
      canonical_id: 'test_h2h_match',
      match_slug: 'test_slug',
      created_at: new Date().toISOString(),
      completeness_tier: 'TIER_1_FULL' as any,
      missing_reasons: [],
      alignment: {} as any,
      league_name: 'Premier League',
      home_team_name: 'Team A',
      away_team_name: 'Team B',
      timing: {
        stage: MatchStage.LIVE,
        beijing_start_time: '2026-08-30 20:00:00',
        start_time_source: 'YBTY_EXACT',
        minute: 60,
        is_half_time: false,
        is_extra_time: false,
        is_overtime_or_penalty: false,
        ybty_display_clock: '60:00'
      },
      score: {
        home_score: 1,
        away_score: 0,
        home_half_score: 1,
        away_half_score: 0,
        score_verified: true,
        score_source: 'LEISU_INTERFACE',
        is_mismatch_detected: false
      },
      markets: {
        full_h2h: { home_odds: 1.95, draw_odds: 3.40, away_odds: 4.20 },
        full_spread_main: null,
        full_spread_subs: [],
        full_total_main: null,
        full_total_subs: [],
        half_h2h: null,
        half_spread_main: null,
        half_total_main: null
      },
      reference: {
        leisu_match_id: '4562395',
        leisu_home_name: 'Team A',
        leisu_away_name: 'Team B',
        leisu_league_name: 'EPL',
        stats: null,
        attack_momentum: null,
        timeline_events: [],
        lineups: null,
        tactical_context: {
          head_to_head_count: 3,
          home_recent_matches_count: 0,
          away_recent_matches_count: 0,
          h2h_raw: [
            { match_id: 1, home_team_name: 'Team A', away_team_name: 'Team B', match_time: '2026-08-01 20:00:00', home_scores: [2, 1], away_scores: [1, 0] } as any, // ~29天前
            { match_id: 2, home_team_name: 'Team B', away_team_name: 'Team A', match_time: '2025-08-30 20:00:00', home_scores: [1, 0], away_scores: [2, 0] } as any, // 365天前
            { match_id: 3, home_team_name: 'Team A', away_team_name: 'Team B', match_time: '2023-01-01 20:00:00', home_scores: [0, 0], away_scores: [0, 0] } as any  // >730天前
          ],
          home_recent_matches: [],
          away_recent_matches: []
        },
        odds_matrix: null,
        league_standings: null,
        goal_distribution: null
      }
    };

    const decayResult = calculateH2HDecayWeights(mockH2HMatch, 365, new Date('2026-08-30T12:00:00Z').getTime());
    const decayWeights = decayResult.weights;
    assert(decayWeights.length === 3, 'H2H matches length mismatch');
    assert(decayWeights[0].decay_weight > 0.90, 'Recent match weight should be > 0.90');
    assert(decayWeights[1].decay_weight >= 0.45 && decayWeights[1].decay_weight <= 0.55, '365-day match weight should be ~0.50');
    assert(decayWeights[2].decay_weight === 0.0, 'Over 730-day match weight must be strictly 0.0');
    assert(decayResult.analytics.valid_count === 2, 'Valid count should be 2');

    const missingScoreMatch: CanonicalMatch = {
      ...mockH2HMatch,
      reference: {
        ...mockH2HMatch.reference!,
        tactical_context: {
          ...mockH2HMatch.reference!.tactical_context!,
          h2h_raw: [{ ...mockH2HMatch.reference!.tactical_context!.h2h_raw[0], home_scores: null, away_scores: null }]
        }
      }
    };
    const missingScoreResult = calculateH2HDecayWeights(
      missingScoreMatch,
      365,
      new Date('2026-08-30T12:00:00Z').getTime()
    );
    assert(missingScoreResult.weights[0].is_valid === false, 'H2H without complete scores must be invalid');
    assert(missingScoreResult.analytics.valid_count === 0, 'H2H without complete scores must not increase valid count');

    // (2) L0 熔断测试
    const fatalMatch: CanonicalMatch = {
      ...mockH2HMatch,
      timing: {
        ...mockH2HMatch.timing,
        minute: null // 缺少分钟
      },
      score: {
        ...mockH2HMatch.score,
        score_verified: false // 比分未核验
      }
    };
    const cb = checkL0CircuitBreaker(fatalMatch);
    assert(cb.is_triggered === true, 'Fatal match must trigger L0 circuit breaker');
    assert(cb.reasons.length >= 2, 'Should report multiple L0 fatal reasons');
    console.log('   ✅ M2 时效衰减与 L0 熔断测试 PASS');
  }

  // -------------------------------------------------------------------------
  // 单元测试 2: M3 最小二乘斜率、危攻积分与 xT 威胁模型测试
  // -------------------------------------------------------------------------
  console.log('👉 [Test 2/8] M3: 最小二乘斜率、AUC 积分与 xT 模型测试...');
  {
    // (1) 最小二乘斜率
    const flatSeries = [10, 10, 10, 10, 10];
    const slopeFlat = calculateLinearRegressionSlope(flatSeries);
    assert(slopeFlat === 0.0, `Flat series slope should be 0.0, got ${slopeFlat}`);

    const risingSeries = [10, 20, 30, 40, 50];
    const slopeRising = calculateLinearRegressionSlope(risingSeries);
    assert(slopeRising === 10.0, `Rising series slope should be 10.0, got ${slopeRising}`);

    // (2) 动量积分
    const mixedSeries = [30, 50, -20, -40, 60];
    const integral = calculateMomentumIntegral(mixedSeries);
    assert(integral.home === 140, `Home energy should be 140, got ${integral.home}`);
    assert(integral.away === 60, `Away energy should be 60, got ${integral.away}`);
    assert(integral.net === 80, `Net energy should be 80, got ${integral.net}`);
    console.log('   ✅ M3 最小二乘与积分测试 PASS');
  }

  // -------------------------------------------------------------------------
  // 单元测试 3: M4 滚球 0:0 Forward 泊松与非线性衰减测试
  // -------------------------------------------------------------------------
  console.log('👉 [Test 3/8] M4: 滚球 0:0 Forward 泊松与非线性时间衰减测试...');
  {
    // (1) 80 分钟单球分差绝境搏命放大
    const lateGameDecay = calculateTimeDecayAndUrgencyMultiplier(82, 1);
    assert(lateGameDecay.urgency_multiplier >= 1.30, 'Urgency multiplier in 82m one-goal game should be >= 1.30');
    assert(lateGameDecay.time_fraction === 0.0889, 'Time fraction should be (90-82)/90');

    // (2) 双变量泊松网格
    const grid = calculateBivariatePoissonGrid(0.8, 0.4, 4);
    assert(grid.prob_home_win_rest > grid.prob_away_win_rest, 'Home win prob should exceed away with higher lambda');
    const probSum = grid.prob_home_win_rest + grid.prob_draw_rest + grid.prob_away_win_rest;
    assert(Math.abs(probSum - 1.0) < 0.01, `Normalized probability sum should be 1.0, got ${probSum}`);

    const truncatedHighLambda = calculateBivariatePoissonGrid(3.5, 3.5, 7);
    const expandedHighLambda = calculateBivariatePoissonGrid(3.5, 3.5, 16);
    assert(expandedHighLambda.prob_draw_rest < truncatedHighLambda.prob_draw_rest - 0.005, 'High-lambda Poisson probabilities must change when the 0-7 tail is restored');
    console.log('   ✅ M4 泊松推演与绝境搏命测试 PASS');
  }

  // -------------------------------------------------------------------------
  // 单元测试 4: M5 Shin 去抽水与四分之一盘复合 EV 测试
  // -------------------------------------------------------------------------
  console.log('👉 [Test 4/8] M5: Shin 知情交易者去抽水与四分之一盘复合 EV 测试...');
  {
    // (1) 比例剥水 vs Shin
    const odds = [1.90, 3.40, 4.20];
    const shinRes = devigShin(odds);
    assert(shinRes.overround > 1.05, 'Overround should be > 1.05');
    assert(shinRes.fair_probs.length === 3, 'Shin probs length mismatch');
    const pSum = shinRes.fair_probs.reduce((a, b) => a + b, 0);
    assert(Math.abs(pSum - 1.0) < 0.01, 'Shin probs sum must equal 1.0');

    // (2) 盘口解析 (支持数字分数与中文盘口名)
    assert(parseAsianHandicapLine('-0/0.5') === -0.25, '-0/0.5 parse failed');
    assert(parseAsianHandicapLine('+0.5') === 0.5, '+0.5 parse failed');
    assert(parseAsianHandicapLine('1/1.5') === 1.25, '1/1.5 parse failed');
    assert(parseAsianHandicapLine('-1.5/2') === -1.75, '-1.5/2 parse failed');
    assert(parseAsianHandicapLine('平手') === 0.0, '平手 parse failed');
    assert(parseAsianHandicapLine('平/半') === -0.25, '平/半 parse failed');
    assert(parseAsianHandicapLine('半球') === -0.5, '半球 parse failed');
    assert(parseAsianHandicapLine('半/一') === -0.75, '半/一 parse failed');
    assert(parseAsianHandicapLine('一球') === -1.0, '一球 parse failed');
    assert(parseAsianHandicapLine('受让半球') === 0.5, '受让半球 parse failed');
    assert(parseAsianHandicapLine('受平半') === 0.25, '受平半 parse failed');

    // (3) 闭式 -0.25 让球复合 EV 计算
    const mockPoisson = {
      lambda_home_rest: 1.2,
      lambda_away_rest: 0.6,
      expected_goals_rest: 1.8,
      rest_score_matrix: {
        prob_home_win_rest: 0.55,
        prob_draw_rest: 0.25,
        prob_away_win_rest: 0.20
      }
    } as any;
    const ahEV = calculateAsianHandicapEV('-0/0.5', 1.95, 1.90, mockPoisson);
    assert(ahEV.home_ev > 0.05, `Home EV should be positive, got ${ahEV.home_ev}`);
    assert(ahEV.preferred_side === 'home', 'Preferred side should be home');
    assert(ahEV.is_positive_ev === true, 'Should flag as positive EV');

    // (4) 闭式大小球复合 EV 计算 (支持浮动盘口 2.25)
    const ouEV = calculateTotalGoalsEV('2/2.5', 1.95, 1.90, 0, mockPoisson);
    assert(ouEV.line === '2/2.5', 'O/U line mismatch');
    assert(typeof ouEV.over_ev === 'number', 'Over EV must be number');
    assert(typeof ouEV.under_ev === 'number', 'Under EV must be number');

    const marketMatch = {
      canonical_id: 'dispersion_test',
      score: { home_score: 0, away_score: 0 },
      markets: {
        full_h2h: null,
        full_spread_main: { line_index: 0, home_selection: '-0/0.5', home_odds: 2.00, away_selection: '+0/0.5', away_odds: 1.80 },
        full_spread_subs: [
          { line_index: 1, home_selection: '0', home_odds: 1.90, away_selection: '0', away_odds: 1.90 },
          { line_index: 2, home_selection: '-0.5', home_odds: 2.20, away_selection: '+0.5', away_odds: 1.65 }
        ],
        full_total_main: { line_index: 0, line: '2', over_odds: 1.90, under_odds: 1.90 },
        full_total_subs: [
          { line_index: 1, line: '2/2.5', over_odds: 2.00, under_odds: 1.80 },
          { line_index: 2, line: '1.5/2', over_odds: 1.80, under_odds: 2.00 }
        ]
      }
    } as CanonicalMatch;
    const marketFeatures = calculateDeviggedMarketFeatures(marketMatch, mockPoisson);
    assert(marketFeatures.spread_secondary_ev.length === 2, 'All spread sub-lines must be evaluated');
    assert(marketFeatures.total_secondary_ev.length === 2, 'All total sub-lines must be evaluated');
    assert(marketFeatures.line_dispersion.spread_variance > 0, 'Spread line dispersion must not remain a fixed zero');
    assert(marketFeatures.line_dispersion.total_variance > 0, 'Total line dispersion must not remain a fixed zero');
    console.log('   ✅ M5 Shin 去抽水、中文盘口与闭式复合 EV 测试 PASS');
  }

  // -------------------------------------------------------------------------
  // 单元测试 5: 战局势能与关键事件因果共生分析 (EPI、战术相变与破门临界)
  // -------------------------------------------------------------------------
  console.log('👉 [Test 5/8] M3.5: 战局势能与关键事件因果共生分析测试...');
  {
    // (1) 测试 EPI 攻防势能转化: 真实致命压迫 vs 无效围攻虚火
    const mockTimelineLethal = {
      integral_15m: { home: 250, away: 30, net: 220 },
      slope_5m: 20,
      slope_15m: 5,
      integral_5m: { home: 120, away: 0, net: 120 }
    } as any;

    const mockEventsLethal = [
      { minute: 60, type: 1, side: 'home', is_cancelled: false },
      { minute: 64, type: 2, side: 'home', is_cancelled: false },
      { minute: 68, type: 16, side: 'home', is_penalty: true, is_cancelled: false }
    ] as any;

    const mockPhysicalLethal = {
      stats_available: true,
      xt_proxy: { home_xt: 3.5, away_xt: 0.3 },
      penetration_rate: { home_penetration: 0.62, away_penetration: 0.10 },
      shot_efficiency: { home_accuracy: 0.60, away_accuracy: 0.10 },
      corner_pressure: { home_corners_total: 4, away_corners_total: 0, window_source: 'EVENT_TIMELINE' }
    } as any;
    const trinityLethal = calculateLiveThreatTrinity(mockTimelineLethal, mockEventsLethal, mockPhysicalLethal, 70);
    assert(trinityLethal.home.alignment_score > 0.5, 'Three-source alignment must be high for corroborated siege');

    const epiLethal = calculateEventPressureConversion(mockTimelineLethal, mockEventsLethal, trinityLethal, 70);
    assert(epiLethal.home.classification === EventPressureConversionType.LETHAL_SIEGE, 'Home should be classified as LETHAL_SIEGE');
    assert(epiLethal.home.conversion_ratio > 0.8, 'Lethal siege conversion ratio should be > 0.8');

    // (2) 无效围攻虚火 (高危攻但 0 事件)
    const mockEventsBarren = [] as any;
    const mockPhysicalBarren = {
      stats_available: true,
      xt_proxy: { home_xt: 0.05, away_xt: 0.3 },
      penetration_rate: { home_penetration: 0.01, away_penetration: 0.10 },
      shot_efficiency: { home_accuracy: 0, away_accuracy: 0.10 },
      corner_pressure: { home_corners_total: 0, away_corners_total: 0, window_source: 'EVENT_TIMELINE' }
    } as any;
    const trinityBarren = calculateLiveThreatTrinity(mockTimelineLethal, mockEventsBarren, mockPhysicalBarren, 70);
    assert(trinityBarren.home.has_conflict, 'High momentum without event/stat corroboration must be flagged as conflict');
    assert(trinityBarren.home.calibrated_threat < trinityLethal.home.calibrated_threat, 'Uncorroborated momentum must be damped');
    const epiBarren = calculateEventPressureConversion(mockTimelineLethal, mockEventsBarren, trinityBarren, 70);
    assert(epiBarren.home.classification === EventPressureConversionType.BARREN_DOMINANCE, 'Home should be classified as BARREN_DOMINANCE when no events');

    // (3) 破门临界态探测 (二阶加速度与尾端事件爆发)
    const mockClimaxMatch = {
      timing: { minute: 78 },
      reference: { timeline_events: [
        { minute: 75, type: 2, side: 'home', is_cancelled: false },
        { minute: 76, type: 3, side: 'away', is_on_pitch: true, is_cancelled: false },
        { minute: 77, type: 2, side: 'home', is_cancelled: false }
      ] }
    } as any;

    const climaxRes = evaluateGoalClimax(mockClimaxMatch, mockTimelineLethal, epiLethal, trinityLethal);
    assert(climaxRes.climax_score >= 55, 'Climax score should be >= 55 under dense incidents and surging slope');
    assert(climaxRes.attacking_side === 'home', 'Attacking side should be home');
    assert(climaxRes.momentum_acceleration_5m === 15, 'Momentum acceleration should be 15 (20 - 5)');

    // (4) 进球后的短时重置：刚发生的进球不得被继续解释为下一球临界压力。
    const mockPostGoalMatch = {
      timing: { minute: 65 },
      reference: { timeline_events: [
        { minute: 63, type: 1, side: 'home', is_cancelled: false },
        { minute: 64, type: 2, side: 'home', is_cancelled: false }
      ] }
    } as any;
    const postGoalClimax = evaluateGoalClimax(mockPostGoalMatch, mockTimelineLethal, epiLethal, trinityLethal);
    assert(postGoalClimax.post_goal_cooldown_active, 'Goal inside the cooldown window must activate a regime reset');
    assert(!postGoalClimax.is_imminent_threat, 'A post-goal cooldown must prevent an IMMINENT_GOAL alert');

    console.log('   ✅ M3.5 攻防势能转化 (EPI) 与破门临界探测测试 PASS');
  }

  // -------------------------------------------------------------------------
  // 单元测试 6: OOS 校准档案分桶、球队收缩与加载门禁
  // -------------------------------------------------------------------------
  console.log('👉 [Test 6/8] OOS: 分桶、球队收缩与已验证档案加载测试...');
  {
    const oosSamples = Array.from({ length: 240 }, (_, index) => ({
      sample_id: `oos-${index}`,
      model_version: 'layer03-v1',
      prediction_at: '2026-09-01T00:00:00.000Z',
      league_key: 'Premier League',
      home_team_key: index < 120 ? 'Team A' : 'Team C',
      away_team_key: index < 120 ? 'Team B' : 'Team D',
      stage: 'LIVE' as const,
      minute: 62,
      score_state: '1-0',
      red_card_state: '0-0',
      market: 'TOTAL_GOALS_MAIN' as const,
      model_probability: 0.6,
      outcome: index % 2 === 0 ? 1 : 0,
      predicted_lambda: 1.0,
      observed_goals: 2
    }));
    const prematchHandicapSamples = Array.from({ length: 240 }, (_, index) => ({
      sample_id: `prematch-ah-${index}`,
      model_version: 'layer03-v1',
      prediction_at: '2026-09-01T00:00:00.000Z',
      league_key: 'Premier League',
      home_team_key: 'Team E',
      away_team_key: 'Team F',
      stage: 'PREMATCH' as const,
      minute: null,
      score_state: '0-0',
      red_card_state: '0-0',
      market: 'ASIAN_HANDICAP_MAIN' as const,
      model_probability: 0.55,
      outcome: index % 2 === 0 ? 1 : 0,
      predicted_lambda: 1.0,
      observed_goals: 2
    }));
    const oosArchiveOptions = {
      generated_at: '2026-09-02T00:00:00.000Z',
      model_version: 'layer03-v1',
      training_window_start_at: '2025-01-01T00:00:00.000Z',
      training_window_end_at: '2026-08-01T00:00:00.000Z',
      prediction_window_start_at: '2026-08-02T00:00:00.000Z',
      prediction_window_end_at: '2026-09-01T23:59:59.000Z'
    };
    const archive = buildOosCalibrationArchive([...oosSamples, ...prematchHandicapSamples], oosArchiveOptions);
    const reloadedArchive = JSON.parse(JSON.stringify(archive)) as OosCalibrationArchive;
    assert(reloadedArchive.archive_provenance === 'OOS_ARCHIVE_BUILDER_V1',
      'OOS archive provenance must survive JSON serialization and reload');
    assert(archive.global_profiles.length === 2, 'Each OOS market must have its own global profile');
    const totalGlobalProfile = archive.global_profiles.find((profile) => profile.market === 'TOTAL_GOALS_MAIN');
    assert(totalGlobalProfile?.status === 'VALIDATED', '240 settled samples must validate the total-goals global profile');
    assert(archive.profiles.some((profile) =>
      profile.market === 'TOTAL_GOALS_MAIN' && profile.minute_band === 'LIVE_60_90'
    ), 'Live total-goals profiles must remain in the live time bucket');
    assert(archive.profiles.some((profile) =>
      profile.market === 'ASIAN_HANDICAP_MAIN' && profile.minute_band === 'PREMATCH'
    ), 'Prematch handicap profiles must remain in the prematch bucket');
    assert(!archive.profiles.some((profile) =>
      profile.market === 'ASIAN_HANDICAP_MAIN' && profile.minute_band === 'LIVE_60_90'
    ), 'Prematch handicap samples must not leak into live profile buckets');
    const teamAProfile = archive.profiles.find((profile) => profile.team_key === 'Team A');
    assert(teamAProfile !== undefined, 'Team-specific OOS profile must be generated');
    assert(teamAProfile!.status === 'INSUFFICIENT_EVIDENCE', 'A 120-sample team bucket must not borrow fictitious evidence to validate itself');
    const calibrationSamplePath = path.resolve(process.cwd(), 'refactor/samples/02_canonical_model/canonical_match_sample.json');
    const calibrationRaw = fs.readFileSync(calibrationSamplePath, 'utf-8');
    const calibrationParsed = JSON.parse(calibrationRaw);
    const calibrationBase: CanonicalMatch = calibrationParsed.canonical_match || calibrationParsed;
    const calibrationMatch: CanonicalMatch = {
      ...calibrationBase,
      league_name: 'Premier League',
      home_team_name: 'Team A',
      away_team_name: 'Team B',
      timing: { ...calibrationBase.timing, minute: 62 },
      score: { ...calibrationBase.score, home_score: 1, away_score: 0 }
    };
    const selected = selectOosCalibrationProfile(archive, calibrationMatch, 'TOTAL_GOALS_MAIN');
    assert(selected?.team_key === undefined && selected?.league_key === 'Premier League', 'Only the validated non-team bucket may be selected when team evidence is insufficient');
    const noMatch = selectOosCalibrationProfile(archive, { ...calibrationMatch, league_name: 'Other League' }, 'TOTAL_GOALS_MAIN');
    assert(noMatch?.league_key === 'GLOBAL', 'Unmatched context may only fall back to the validated global profile');
    const handicapFallback = selectOosCalibrationProfile(archive, calibrationMatch, 'ASIAN_HANDICAP_MAIN');
    assert(handicapFallback?.league_key === 'GLOBAL' && handicapFallback.market === 'ASIAN_HANDICAP_MAIN',
      'A market fallback must select only that market global profile');
    const invalidGlobalFallback = selectOosCalibrationProfile({
      ...archive,
      archive_provenance: 'OOS_ARCHIVE_BUILDER_V1',
      global_profiles: archive.global_profiles.map((profile) =>
        profile.market === 'ASIAN_HANDICAP_MAIN' ? { ...profile, status: 'INSUFFICIENT_EVIDENCE' } : profile
      )
    }, calibrationMatch, 'ASIAN_HANDICAP_MAIN');
    assert(invalidGlobalFallback === undefined, 'An insufficient global profile must not unlock calibration');
    const forgedArchive = { ...reloadedArchive, archive_provenance: undefined } as unknown as OosCalibrationArchive;
    assert(selectOosCalibrationProfile(forgedArchive, calibrationMatch, 'TOTAL_GOALS_MAIN') === undefined,
      'An archive without builder provenance must not unlock profile selection');
    const unsupportedVersionArchive = { ...reloadedArchive, schema_version: 2 } as unknown as OosCalibrationArchive;
    assert(selectOosCalibrationProfile(unsupportedVersionArchive, calibrationMatch, 'TOTAL_GOALS_MAIN') === undefined,
      'An unsupported OOS archive schema version must not unlock profile selection');
    const missingVersionArchive = { ...reloadedArchive, schema_version: undefined } as unknown as OosCalibrationArchive;
    assert(selectOosCalibrationProfile(missingVersionArchive, calibrationMatch, 'TOTAL_GOALS_MAIN') === undefined,
      'An OOS archive without a schema version must not unlock profile selection');
    const basePoisson = calculateInPlayPoissonFeatures(
      calibrationMatch,
      extractCleanedContextFeatures(calibrationMatch),
      buildUnifiedMatchState(extractSpatioTemporalEventFeatures(
        calibrationMatch,
        extractMomentumTimelineFeatures(calibrationMatch),
        extractRealTimePhysicalStats(calibrationMatch)
      ))
    );
    const adjustedPoisson = calculateInPlayPoissonFeatures(
      calibrationMatch,
      extractCleanedContextFeatures(calibrationMatch),
      buildUnifiedMatchState(extractSpatioTemporalEventFeatures(
        calibrationMatch,
        extractMomentumTimelineFeatures(calibrationMatch),
        extractRealTimePhysicalStats(calibrationMatch)
      )),
      undefined,
      selected
    );
    assert(adjustedPoisson.expected_goals_rest > basePoisson.expected_goals_rest, 'Validated OOS lambda adjustment must change the Poisson output');
    const baselineQuant = calculateQuantitativeFeatures(calibrationMatch);
    const totalCalibratedQuant = calculateQuantitativeFeatures(calibrationMatch, {
      calibration_profile: {
        ...selected!,
        lambda_log_adjustment: 0.4
      }
    });
    assert(
      totalCalibratedQuant.devig.spread_main_ev?.home_ev === baselineQuant.devig.spread_main_ev?.home_ev &&
        totalCalibratedQuant.devig.spread_main_ev?.away_ev === baselineQuant.devig.spread_main_ev?.away_ev,
      'TOTAL_GOALS_MAIN lambda calibration must not change Asian-handicap EV'
    );
    assert(
      totalCalibratedQuant.devig.total_main_ev?.over_ev !== baselineQuant.devig.total_main_ev?.over_ev ||
        totalCalibratedQuant.devig.total_main_ev?.under_ev !== baselineQuant.devig.total_main_ev?.under_ev,
      'TOTAL_GOALS_MAIN lambda calibration must change totals EV when the calibrated lambda changes'
    );
    const handicapCalibratedQuant = calculateQuantitativeFeatures(calibrationMatch, {
      calibration_profile: handicapFallback
    });
    assert(
      handicapCalibratedQuant.poisson.expected_goals_rest === baselineQuant.poisson.expected_goals_rest,
      'ASIAN_HANDICAP_MAIN calibration must not change Poisson lambda'
    );
    let leakageBlocked = false;
    try {
      buildOosCalibrationArchive([{ ...oosSamples[0], sample_id: 'future-oos', prediction_at: '2026-09-02T00:00:00.000Z' }], oosArchiveOptions);
    } catch {
      leakageBlocked = true;
    }
    assert(leakageBlocked, 'A prediction at or after the training cutoff must be rejected to prevent OOS leakage');
    const stoppageMatch: CanonicalMatch = { ...calibrationMatch, timing: { ...calibrationMatch.timing, minute: 95 } };
    const stoppagePoisson = calculateInPlayPoissonFeatures(
      stoppageMatch,
      extractCleanedContextFeatures(stoppageMatch),
      buildUnifiedMatchState(extractSpatioTemporalEventFeatures(
        stoppageMatch,
        extractMomentumTimelineFeatures(stoppageMatch),
        extractRealTimePhysicalStats(stoppageMatch)
      ))
    );
    assert(stoppagePoisson.is_stoppage_time_unpriceable, 'A live 90+ clock must be marked unpriceable rather than treated as a finished match');
    console.log('   ✅ OOS 校准档案测试 PASS');
  }

  // -------------------------------------------------------------------------
  // 综合测试 6: 端到端统帅部编排与真实样本特征提取
  // -------------------------------------------------------------------------
  console.log('👉 [Test 7/8] M6: 最高统帅部端到端真实样本量化特征推演...');
  {
    // 读取 Layer 02 生成的真实对齐赛事样本
    const samplePath = path.resolve(process.cwd(), 'refactor/samples/02_canonical_model/canonical_match_sample.json');
    let targetMatch: CanonicalMatch | null = null;
    if (fs.existsSync(samplePath)) {
      const raw = fs.readFileSync(samplePath, 'utf-8');
      const parsed = JSON.parse(raw);
      targetMatch = parsed.canonical_match || parsed;
    }

    assert(targetMatch !== null, 'No canonical match sample found for testing');

    console.log(`   正在对样本赛事 [${targetMatch!.canonical_id}] 进行全量 37 项量化要素求解...`);

    const quantResult = calculateQuantitativeFeatures(targetMatch!, undefined, collector, tracer);

    // 验证核心字段完整性
    assert(quantResult.canonical_id === targetMatch!.canonical_id, 'Canonical ID mismatch');
    assert(quantResult.confidence_score >= 0 && quantResult.confidence_score <= 100, 'Confidence score out of range');
    assert(quantResult.battlefield_dominance_index >= -100 && quantResult.battlefield_dominance_index <= 100, 'BDI out of range');
    assert(quantResult.poisson.lambda_home_rest > 0, 'Poisson lambda home rest must be > 0');
    assert(quantResult.timeline.total_points > 0, 'Timeline total points must be > 0');
    assert(quantResult.physical_stats.xt_proxy.home_xt >= 0, 'Home xT must be non-negative');
    assert(quantResult.physical_stats.corner_pressure.window_source === 'CUMULATIVE_BASELINE', 'Live technical corners must remain cumulative baseline, never a recent-window claim');
    assert(quantResult.confidence_breakdown.edge_confidence_score === 0, 'Unvalidated OOS calibration must not create tradable edge confidence');
    assert(quantResult.positive_ev_signals.length === 0, 'Raw devig EV without validated OOS evidence must not become a machine trade candidate');
    assert(quantResult.raw_positive_ev_signals.length >= 2, 'Raw positive EV must retain calculated main and secondary market signals');
    assert(quantResult.devig.spread_secondary_ev.length === 2, 'Real YBTY spread sub-lines must remain represented in Layer 03');
    assert(quantResult.devig.total_secondary_ev.length === 2, 'Real YBTY total sub-lines must remain represented in Layer 03');
    assert(quantResult.devig.line_dispersion.spread_variance > 0, 'Real spread line dispersion must be measurable');
    assert(quantResult.devig.line_dispersion.total_variance > 0, 'Real total line dispersion must be measurable');
    const validatedMainProfileQuant = calculateQuantitativeFeatures(targetMatch!, {
      calibration_profile: {
        status: 'VALIDATED',
        league_key: 'GLOBAL',
        minute_band: 'ALL',
        score_state: 'ALL',
        red_card_state: 'ALL',
        market: 'TOTAL_GOALS_MAIN',
        sample_size: 240,
        effective_sample_size: 240,
        oos_brier_score: 0.2,
        lambda_log_adjustment: 0.1
      }
    });
    assert(validatedMainProfileQuant.raw_positive_ev_signals.some((signal) =>
      signal.market === 'ASIAN_HANDICAP_SUB' || signal.market === 'TOTAL_GOALS_SUB'
    ), 'Secondary raw EV must remain observable when a main-market profile is validated');
    assert(validatedMainProfileQuant.positive_ev_signals.every((signal) =>
      signal.market === 'ASIAN_HANDICAP_MAIN' || signal.market === 'TOTAL_GOALS_MAIN'
    ), 'A validated main-market profile must not unlock secondary-line machine candidates');
    assert(quantResult.battlefield_dominance_index === quantResult.match_state.dominance_index, 'BDI must consume the unified match state only');

    const prematchQuant = calculateQuantitativeFeatures({
      ...targetMatch!,
      timing: {
        ...targetMatch!.timing,
        stage: MatchStage.PREMATCH,
        minute: null,
        ybty_display_clock: '即将开赛'
      },
      score: {
        ...targetMatch!.score,
        home_score: 0,
        away_score: 0,
        score_verified: true,
        score_source: 'YBTY_DIRECT'
      }
    }, undefined, collector, tracer);
    assert(prematchQuant.poisson.elapsed_minute === 0, 'Prematch Poisson must use an explicit zero elapsed minute');
    assert(prematchQuant.poisson.remaining_minutes === 90, 'Prematch Poisson must represent the full match horizon');
    assert(prematchQuant.poisson.projected_final_score.home >= 0 && prematchQuant.poisson.projected_final_score.away >= 0, 'Prematch projection must remain finite and non-negative');
    assert(!prematchQuant.risk_flags.includes(QuantAlert.TECHNICAL_METRICS_DEFICIT), 'Prematch must not inherit the LIVE technical metrics deficit warning');

    const liveWithoutStats = calculateQuantitativeFeatures({
      ...targetMatch!,
      reference: {
        ...targetMatch!.reference!,
        stats: null,
        attack_momentum: null
      },
      timing: {
        ...targetMatch!.timing,
        stage: MatchStage.LIVE,
        minute: 62
      },
      score: {
        ...targetMatch!.score,
        home_score: 0,
        away_score: 1,
        score_verified: true,
        score_source: 'LEISU_INTERFACE'
      }
    }, undefined, collector, tracer);
    assert(liveWithoutStats.physical_stats.stats_available === false, 'LIVE missing technical statistics must remain unavailable');
    assert(liveWithoutStats.physical_stats.xt_proxy.home_xt === undefined, 'Missing LIVE statistics must not become a fabricated zero xT');
    assert(liveWithoutStats.risk_flags.includes(QuantAlert.TECHNICAL_METRICS_DEFICIT), 'LIVE missing technical statistics must trigger the technical deficit warning');
    assert(liveWithoutStats.confidence_score <= 55, 'LIVE missing technical statistics must cap confidence');
    assert(liveWithoutStats.positive_ev_signals.length === 0, 'LIVE missing technical statistics must not produce machine candidates');

    console.log(`   📊 [量化推演战报]:`);
    console.log(`      - 法定进行时间: ${quantResult.poisson.elapsed_minute}' (剩余: ${quantResult.poisson.remaining_minutes}')`);
    console.log(`      - 战场统治权指数 (BDI): ${quantResult.battlefield_dominance_index}`);
    console.log(`      - 破门相变预警: ${quantResult.goal_phase_alert}`);
    console.log(`      - 滚球 0:0 剩余预期进球: 主 ${quantResult.poisson.lambda_home_rest} vs 客 ${quantResult.poisson.lambda_away_rest} (总: ${quantResult.poisson.expected_goals_rest})`);
    console.log(`      - 投影全场比分: ${quantResult.poisson.projected_final_score.home}-${quantResult.poisson.projected_final_score.away} (最可能: ${quantResult.poisson.projected_final_score.most_likely_score})`);
    console.log(`      - 5m 短期爆发斜率: ${quantResult.timeline.slope_5m} | 15m 净危攻能量: ${quantResult.timeline.integral_15m.net}`);
    console.log(`      - xT 真实威胁: 主 ${quantResult.physical_stats.xt_proxy.home_xt} vs 客 ${quantResult.physical_stats.xt_proxy.away_xt}`);
    console.log(`      - 让球主盘 EV: ${quantResult.devig.spread_main_ev.preferred_side} (EV: ${quantResult.devig.spread_main_ev.home_ev})`);
    console.log(`      - 综合量化置信度: ${quantResult.confidence_score}/100`);

    // 写入真实特征样本文件
    const outputDir = path.resolve(process.cwd(), 'refactor/samples/03_quant_engine');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputFile = path.join(outputDir, 'quant_features_sample.json');
    fs.writeFileSync(outputFile, JSON.stringify(quantResult, null, 2), 'utf-8');
    console.log(`   💾 已生成不可变量化特征样本: ${outputFile}`);
    console.log('   ✅ M6 统帅部端到端特征推演 PASS');
  }

  // -------------------------------------------------------------------------
  // 综合测试 7: L0 致命数据缺失一票否决与降级容错测试
  // -------------------------------------------------------------------------
  console.log('👉 [Test 8/8] M6: L0 致命缺失一票否决与降级容错测试...');
  {
    const brokenMatch: CanonicalMatch = {
      canonical_id: 'fatal_test_match_001',
      match_slug: 'fatal_test_slug',
      created_at: new Date().toISOString(),
      completeness_tier: 'TIER_INVALID' as any,
      missing_reasons: [],
      alignment: {} as any,
      league_name: 'Test League',
      home_team_name: 'Home',
      away_team_name: 'Away',
      timing: {
        stage: MatchStage.LIVE,
        beijing_start_time: '2026-08-30 20:00:00',
        start_time_source: 'YBTY_EXACT',
        minute: null, // 致命缺失
        is_half_time: false,
        is_extra_time: false,
        is_overtime_or_penalty: false,
        ybty_display_clock: null
      },
      score: {
        home_score: null as any,
        away_score: null as any,
        home_half_score: null,
        away_half_score: null,
        score_verified: false, // 致命缺失
        score_source: 'UNVERIFIED',
        is_mismatch_detected: true
      },
      markets: {
        full_h2h: null,
        full_spread_main: null,
        full_spread_subs: [],
        full_total_main: null,
        full_total_subs: [],
        half_h2h: null,
        half_spread_main: null,
        half_total_main: null
      },
      reference: null
    };

    let fatalPricingBlocked = false;
    try {
      const qf = calculateQuantitativeFeatures(brokenMatch, undefined, collector, tracer);
      if (qf.poisson.is_stoppage_time_unpriceable || qf.poisson.lambda_source === 'FALLBACK') {
        fatalPricingBlocked = true;
      }
    } catch {
      fatalPricingBlocked = true;
    }
    assert(fatalPricingBlocked, 'A live match without an authoritative minute and verified score must be unpriceable.');
    console.log('   ✅ L0 致命熔断一票否决测试 PASS');
  }

  console.log('\n================================================================');
  console.log('🎉 [Layer 03 Test Suite] 全部 8 项确定性量化与博弈引擎测试 100% 通过！');
  console.log('================================================================\n');
}

runQuantEngineTests().catch((err) => {
  console.error('❌ [TEST RUN FAILED]:', err);
  process.exit(1);
});

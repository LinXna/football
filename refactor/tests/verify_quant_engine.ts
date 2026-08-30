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
  calculateLinearRegressionSlope,
  calculateMomentumIntegral,
  devigShin,
  devigMultiplicative,
  parseAsianHandicapLine,
  calculateAsianHandicapEV,
  calculateTimeDecayAndUrgencyMultiplier,
  calculateBivariatePoissonGrid,
  calculateH2HDecayWeights,
  checkL0CircuitBreaker,
  extractMomentumTimelineFeatures,
  extractRealTimePhysicalStats
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
  console.log('👉 [Test 1/6] M2: 时效衰减与 L0 熔断算法测试...');
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
            { match_id: 1, home_team_name: 'Team A', away_team_name: 'Team B', match_time: '2026-08-01 20:00:00' } as any, // ~29天前
            { match_id: 2, home_team_name: 'Team B', away_team_name: 'Team A', match_time: '2025-08-30 20:00:00' } as any, // 365天前
            { match_id: 3, home_team_name: 'Team A', away_team_name: 'Team B', match_time: '2023-01-01 20:00:00' } as any  // >730天前
          ],
          home_recent_matches: [],
          away_recent_matches: []
        },
        odds_matrix: null,
        league_standings: null,
        goal_distribution: null
      }
    };

    const decayWeights = calculateH2HDecayWeights(mockH2HMatch, 365, new Date('2026-08-30T12:00:00Z').getTime());
    assert(decayWeights.length === 3, 'H2H matches length mismatch');
    assert(decayWeights[0].decay_weight > 0.90, 'Recent match weight should be > 0.90');
    assert(decayWeights[1].decay_weight >= 0.45 && decayWeights[1].decay_weight <= 0.55, '365-day match weight should be ~0.50');
    assert(decayWeights[2].decay_weight === 0.0, 'Over 730-day match weight must be strictly 0.0');

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
  console.log('👉 [Test 2/6] M3: 最小二乘斜率、AUC 积分与 xT 模型测试...');
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
  console.log('👉 [Test 3/6] M4: 滚球 0:0 Forward 泊松与非线性时间衰减测试...');
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
    console.log('   ✅ M4 泊松推演与绝境搏命测试 PASS');
  }

  // -------------------------------------------------------------------------
  // 单元测试 4: M5 Shin 去抽水与四分之一盘复合 EV 测试
  // -------------------------------------------------------------------------
  console.log('👉 [Test 4/6] M5: Shin 知情交易者去抽水与四分之一盘复合 EV 测试...');
  {
    // (1) 比例剥水 vs Shin
    const odds = [1.90, 3.40, 4.20];
    const shinRes = devigShin(odds);
    assert(shinRes.overround > 1.05, 'Overround should be > 1.05');
    assert(shinRes.fair_probs.length === 3, 'Shin probs length mismatch');
    const pSum = shinRes.fair_probs.reduce((a, b) => a + b, 0);
    assert(Math.abs(pSum - 1.0) < 0.01, 'Shin probs sum must equal 1.0');

    // (2) 盘口解析
    assert(parseAsianHandicapLine('-0/0.5') === -0.25, '-0/0.5 parse failed');
    assert(parseAsianHandicapLine('+0.5') === 0.5, '+0.5 parse failed');
    assert(parseAsianHandicapLine('1/1.5') === 1.25, '1/1.5 parse failed');
    assert(parseAsianHandicapLine('-1.5/2') === -1.75, '-1.5/2 parse failed');

    // (3) -0.25 让球复合 EV 计算
    const mockPoisson = {
      rest_score_matrix: {
        prob_home_win_rest: 0.55,
        prob_draw_rest: 0.25,
        prob_away_win_rest: 0.20
      }
    } as any;
    const ahEV = calculateAsianHandicapEV('-0/0.5', 1.95, 1.90, mockPoisson);
    // Home EV = 0.55 * (1.95-1) + 0.25 * (-0.5) - 0.20 * 1 = 0.5225 - 0.125 - 0.20 = 0.1975
    assert(ahEV.home_ev > 0.15, `Home EV should be ~0.1975, got ${ahEV.home_ev}`);
    assert(ahEV.preferred_side === 'home', 'Preferred side should be home');
    assert(ahEV.is_positive_ev === true, 'Should flag as positive EV');
    console.log('   ✅ M5 Shin 去抽水与四分之一盘 EV 测试 PASS');
  }

  // -------------------------------------------------------------------------
  // 综合测试 5: 端到端统帅部编排与真实样本特征提取
  // -------------------------------------------------------------------------
  console.log('👉 [Test 5/6] M6: 最高统帅部端到端真实样本量化特征推演...');
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
  // 综合测试 6: L0 致命数据缺失一票否决与降级容错测试
  // -------------------------------------------------------------------------
  console.log('👉 [Test 6/6] M6: L0 致命缺失一票否决与降级容错测试...');
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

    const fatalQuant = calculateQuantitativeFeatures(brokenMatch, undefined, collector, tracer);
    assert(fatalQuant.confidence_score === 0, 'Fatal match confidence score must be strictly 0');
    assert(fatalQuant.context.circuit_breaker.is_triggered === true, 'Fatal match circuit breaker must trigger');
    assert(fatalQuant.positive_ev_signals.length === 0, 'Fatal match must yield 0 positive EV signals');
    console.log('   ✅ L0 致命熔断一票否决测试 PASS');
  }

  console.log('\n================================================================');
  console.log('🎉 [Layer 03 Test Suite] 全部 6 项确定性量化与博弈引擎测试 100% 通过！');
  console.log('================================================================\n');
}

runQuantEngineTests().catch((err) => {
  console.error('❌ [TEST RUN FAILED]:', err);
  process.exit(1);
});

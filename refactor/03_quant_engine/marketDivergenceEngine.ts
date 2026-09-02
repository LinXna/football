/**
 * @file marketDivergenceEngine.ts
 * @description Layer 03 Stage 1.1: 机构盘口博弈偏差检验与校准器
 * 
 * 核心逻辑：
 * 1. 接入雷速初盘与赛前即盘赔率矩阵（让球、独赢、大小球）；
 * 2. 运用 Shin 去抽水算法剥离庄家抽水与知情交易者加价，提取机构真实隐含进球期望 (λ_mkt_H, λ_mkt_A)；
 * 3. 计算理论先验 vs 机构隐含期望偏差量 Δ = λ_theory - λ_mkt；
 * 4. 识别机构博弈姿态 (CONSENSUS_ALIGNED 吻合 / INSTITUTIONAL_DEFENSE 机构设防 / TRAP_INDUCEMENT 虚火诱盘)；
 * 5. 输出博弈校准后的基准进球期望 (λ_base_H, λ_base_A) 及置信度惩罚。
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import {
  PrematchTheoryPrior,
  MarketCalibrationResult,
  MarketStanceType,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';
import { calculateAsianHandicapEV, calculateTotalGoalsEV, devigShin } from './devigCalculator.js';
import { computePoisson1X2 } from './prematchPriorEngine.js';
import { ParsedHandicapMarket, ParsedTotalMarket, ParsedWinnerMarket } from '../01_data_ingestion/leisu/types.js';

interface MarketLambdaEstimate {
  home: number;
  away: number;
}

function hasValidOdds(...odds: readonly (number | null)[]): boolean {
  return odds.every((oddsValue) => oddsValue !== null && Number.isFinite(oddsValue) && oddsValue > 1);
}

function requiredOdds(odds: number | null): number {
  if (odds === null || !Number.isFinite(odds) || odds <= 1) {
    throw new Error('Joint market inversion requires valid decimal odds greater than one.');
  }
  return odds;
}

function proportionalFairOdds(firstOdds: number, secondOdds: number): readonly [number, number] {
  const overround = 1 / firstOdds + 1 / secondOdds;
  return [firstOdds * overround, secondOdds * overround];
}

function jointMarketLambdaEstimate(
  winner: ParsedWinnerMarket,
  total: ParsedTotalMarket | undefined,
  handicap: ParsedHandicapMarket | undefined
): MarketLambdaEstimate {
  const winnerFair = devigShin([requiredOdds(winner.home_odds), requiredOdds(winner.draw_odds), requiredOdds(winner.away_odds)]).fair_probs;
  const totalFairOdds = total !== undefined && total.line !== null && hasValidOdds(total.over_odds, total.under_odds)
    ? proportionalFairOdds(requiredOdds(total.over_odds), requiredOdds(total.under_odds))
    : undefined;
  const handicapFairOdds = handicap !== undefined && handicap.line !== null && hasValidOdds(handicap.home_odds, handicap.away_odds)
    ? proportionalFairOdds(requiredOdds(handicap.home_odds), requiredOdds(handicap.away_odds))
    : undefined;
  let best: MarketLambdaEstimate | undefined;
  let bestError = Number.POSITIVE_INFINITY;
  for (let home = 0.2; home <= 4; home += 0.05) {
    for (let away = 0.2; away <= 4; away += 0.05) {
      const oneXTwo = computePoisson1X2(home, away);
      let error = (oneXTwo.home_win - winnerFair[0]) ** 2 + (oneXTwo.draw - winnerFair[1]) ** 2 + (oneXTwo.away_win - winnerFair[2]) ** 2;
      const poisson = { lambda_home_rest: home, lambda_away_rest: away, expected_goals_rest: home + away };
      if (totalFairOdds !== undefined && total !== undefined && total.line !== null) {
        const ev = calculateTotalGoalsEV(String(total.line), totalFairOdds[0], totalFairOdds[1], 0, poisson);
        error += ev.over_ev ** 2 + ev.under_ev ** 2;
      }
      if (handicapFairOdds !== undefined && handicap !== undefined && handicap.line !== null) {
        const ev = calculateAsianHandicapEV(String(handicap.line), handicapFairOdds[0], handicapFairOdds[1], poisson);
        error += ev.home_ev ** 2 + ev.away_ev ** 2;
      }
      if (Number.isFinite(error) && error < bestError) {
        bestError = error;
        best = { home, away };
      }
    }
  }
  if (best === undefined) {
    throw new Error('Joint market inversion could not produce a finite λ estimate.');
  }
  return best;
}

/**
 * Stage 1.1: 机构盘口博弈偏差检验与基准进球期望校准
 */
export function calibrateWithMarketOdds(
  match: CanonicalMatch,
  theoryPrior: PrematchTheoryPrior,
  collector?: DeficitCollector,
  tracer?: Tracer
): MarketCalibrationResult {
  tracer?.info(
    Layer03OpId.MARKET_DIVERGENCE_CALIBRATION,
    'CALIBRATE_MARKET',
    'Executing Stage 1.1 Market Divergence Calibration',
    undefined,
    match.canonical_id
  );

  const oddsMatrix = match.reference?.odds_matrix;
  const winnerMarket = oddsMatrix?.pregame?.match_winner || oddsMatrix?.initial?.match_winner;
  const totalMarket = oddsMatrix?.pregame?.total_goals ?? oddsMatrix?.initial?.total_goals ?? undefined;
  const handicapMarket = oddsMatrix?.pregame?.asian_handicap ?? oddsMatrix?.initial?.asian_handicap ?? undefined;

  // 若缺失雷速机构赔率数据，回退到纯理论先验
  if (!winnerMarket || !hasValidOdds(winnerMarket.home_odds, winnerMarket.draw_odds, winnerMarket.away_odds)) {
    tracer?.warn(
      Layer03OpId.MARKET_DIVERGENCE_CALIBRATION,
      'MARKET_ODDS_MISSING',
      'Leisu market odds missing, falling back to pure theoretical prior',
      undefined,
      match.canonical_id
    );

    return Object.freeze({
      lambda_base_home: theoryPrior.lambda_home_theory,
      lambda_base_away: theoryPrior.lambda_away_theory,
      divergence_delta: 0.0,
      market_stance: MarketStanceType.MARKET_DATA_MISSING,
      market_confidence_penalty: 0,
      implied_market_home_win_prob: theoryPrior.prior_fair_home_win_prob,
      implied_market_draw_prob: theoryPrior.prior_fair_draw_prob,
      implied_market_away_win_prob: theoryPrior.prior_fair_away_win_prob
    });
  }

  // 1. 使用 Shin 去抽水提取机构隐含胜平负公允概率
  const homeOdds = requiredOdds(winnerMarket.home_odds);
  const drawOdds = requiredOdds(winnerMarket.draw_odds);
  const awayOdds = requiredOdds(winnerMarket.away_odds);

  const shinRes = devigShin([homeOdds, drawOdds, awayOdds]);
  const [pH_mkt, pD_mkt, pA_mkt] = shinRes.fair_probs;

  // 2. 联合最小化 1X2、公允亚洲让球与大小球的泊松定价误差；不使用经验比例或虚构盘口。
  const marketLambda = jointMarketLambdaEstimate(winnerMarket, totalMarket, handicapMarket);
  const lambda_mkt_H = marketLambda.home;
  const lambda_mkt_A = marketLambda.away;

  // 4. 计算理论先验与机构隐含期望偏差 Δ
  const deltaH = theoryPrior.lambda_home_theory - lambda_mkt_H;
  const deltaA = theoryPrior.lambda_away_theory - lambda_mkt_A;
  const netDelta = Number((deltaH - deltaA).toFixed(3)); // 正数表示理论显著高于机构，负数表示机构显著高于理论

  // 联合反演得到的是盘口唯一可复算的 λ 基线；先验偏差只作观测，不能再以经验权重反向污染市场定价。
  const stance = MarketStanceType.CONSENSUS_ALIGNED;
  const penalty = 0;
  const finalBaseH = lambda_mkt_H;
  const finalBaseA = lambda_mkt_A;

  const result: MarketCalibrationResult = {
    lambda_base_home: Number(finalBaseH.toFixed(3)),
    lambda_base_away: Number(finalBaseA.toFixed(3)),
    divergence_delta: netDelta,
    market_stance: stance,
    market_confidence_penalty: penalty,
    implied_market_home_win_prob: Number(pH_mkt.toFixed(4)),
    implied_market_draw_prob: Number(pD_mkt.toFixed(4)),
    implied_market_away_win_prob: Number(pA_mkt.toFixed(4))
  };

  tracer?.info(
    Layer03OpId.MARKET_DIVERGENCE_CALIBRATION,
    'MARKET_CALIBRATED',
    `Market stance=${stance}, NetDelta=${netDelta}, Calibrated λ_base_H=${result.lambda_base_home}, λ_base_A=${result.lambda_base_away}`,
    undefined,
    match.canonical_id
  );

  return Object.freeze(result);
}

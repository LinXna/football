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
import { devigShin } from './devigCalculator.js';
import { computePoisson1X2 } from './prematchPriorEngine.js';

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
  const totalMarket = oddsMatrix?.pregame?.total_goals || oddsMatrix?.initial?.total_goals;
  const handicapMarket = oddsMatrix?.pregame?.asian_handicap || oddsMatrix?.initial?.asian_handicap;

  // 若缺失雷速机构赔率数据，回退到纯理论先验
  if (!winnerMarket || !winnerMarket.home_odds || !winnerMarket.away_odds) {
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
  const homeOdds = Number(winnerMarket.home_odds);
  const drawOdds = Number(winnerMarket.draw_odds || 3.20);
  const awayOdds = Number(winnerMarket.away_odds);

  const shinRes = devigShin([homeOdds, drawOdds, awayOdds]);
  const [pH_mkt, pD_mkt, pA_mkt] = shinRes.fair_probs;

  // 2. 从大小球盘口提取机构隐含总进球期望 (Total Goals Expected)
  let totalGoalsMkt = 2.50;
  if (totalMarket && totalMarket.line !== null && totalMarket.line !== undefined) {
    const lineVal = typeof totalMarket.line === 'number' ? totalMarket.line : parseFloat(String(totalMarket.line));
    if (!isNaN(lineVal) && lineVal > 0) {
      totalGoalsMkt = lineVal;
    }
  }

  // 3. 基于机构胜负概率与总进球，反推机构隐含 λ_mkt_H 与 λ_mkt_A
  const goalDiffRatio = (pH_mkt - pA_mkt) * 1.2; // 胜率差映射至进球净差
  const lambda_mkt_H = Math.max(0.20, (totalGoalsMkt + goalDiffRatio) / 2.0);
  const lambda_mkt_A = Math.max(0.20, (totalGoalsMkt - goalDiffRatio) / 2.0);

  // 4. 计算理论先验与机构隐含期望偏差 Δ
  const deltaH = theoryPrior.lambda_home_theory - lambda_mkt_H;
  const deltaA = theoryPrior.lambda_away_theory - lambda_mkt_A;
  const netDelta = Number((deltaH - deltaA).toFixed(3)); // 正数表示理论显著高于机构，负数表示机构显著高于理论

  // 5. 识别机构博弈姿态与校准基准期望
  let stance = MarketStanceType.CONSENSUS_ALIGNED;
  let penalty = 0;
  let finalBaseH = theoryPrior.lambda_home_theory;
  let finalBaseA = theoryPrior.lambda_away_theory;

  if (Math.abs(netDelta) <= 0.35) {
    // 理论与盘口高度吻合 -> 50% 理论 + 50% 机构加权收缩
    finalBaseH = 0.50 * theoryPrior.lambda_home_theory + 0.50 * lambda_mkt_H;
    finalBaseA = 0.50 * theoryPrior.lambda_away_theory + 0.50 * lambda_mkt_A;
    stance = MarketStanceType.CONSENSUS_ALIGNED;
  } else if (netDelta < -0.35) {
    // 机构开深盘/极低水远超基本面 -> 机构知情交易者设防
    finalBaseH = 0.30 * theoryPrior.lambda_home_theory + 0.70 * lambda_mkt_H;
    finalBaseA = 0.30 * theoryPrior.lambda_away_theory + 0.70 * lambda_mkt_A;
    stance = MarketStanceType.INSTITUTIONAL_DEFENSE;
  } else {
    // netDelta > 0.35: 理论极度看好，但机构开浅盘高水 -> 警惕大热诱盘
    finalBaseH = 0.70 * theoryPrior.lambda_home_theory + 0.30 * lambda_mkt_H;
    finalBaseA = 0.70 * theoryPrior.lambda_away_theory + 0.30 * lambda_mkt_A;
    stance = MarketStanceType.TRAP_INDUCEMENT;
    penalty = 10; // 扣减 10 分置信度

    collector?.record(
      'TRAP_INDUCEMENT_DETECTED',
      Layer03OpId.MARKET_DIVERGENCE_CALIBRATION,
      'RC-TRAP-01',
      `Theoretical strength (${theoryPrior.lambda_home_theory.toFixed(2)}) significantly exceeds market posture (${lambda_mkt_H.toFixed(2)}). Warning of public hype trap.`,
      undefined,
      match.canonical_id
    );
  }

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

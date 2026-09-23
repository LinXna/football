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
import { MatchStage } from '../02_canonical_model/enums.js';
import {
  PrematchTheoryPrior,
  MarketCalibrationResult,
  MarketStanceType,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';
import { calculateAsianHandicapEV, calculateTotalGoalsEV, devigShin, formatAsianHandicapLine } from './devigCalculator.js';
import { computePoisson1X2 } from './prematchPriorEngine.js';
import { calculateBivariatePoissonGrid } from './poissonDecayModel.js';
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
  handicap: ParsedHandicapMarket | undefined,
  currentHomeScore: number,
  currentAwayScore: number,
  isInPlayMarket: boolean
): MarketLambdaEstimate {
  const winnerFair = devigShin([requiredOdds(winner.home_odds), requiredOdds(winner.draw_odds), requiredOdds(winner.away_odds)]).fair_probs;
  const totalFairOdds = total !== undefined && total.line !== null && hasValidOdds(total.over_odds, total.under_odds)
    ? proportionalFairOdds(requiredOdds(total.over_odds), requiredOdds(total.under_odds))
    : undefined;
  const handicapFairOdds = handicap !== undefined && handicap.line !== null && hasValidOdds(handicap.home_odds, handicap.away_odds)
    ? proportionalFairOdds(requiredOdds(handicap.home_odds), requiredOdds(handicap.away_odds))
    : undefined;
  const currentTotalGoals = isInPlayMarket ? currentHomeScore + currentAwayScore : 0;
  let best: MarketLambdaEstimate | undefined;
  let bestError = Number.POSITIVE_INFINITY;
  for (let home = 0.2; home <= 4; home += 0.05) {
    for (let away = 0.2; away <= 4; away += 0.05) {
      let pH = 0;
      let pD = 0;
      let pA = 0;

      if (!isInPlayMarket || (currentHomeScore === 0 && currentAwayScore === 0)) {
        const oneXTwo = computePoisson1X2(home, away);
        pH = oneXTwo.home_win;
        pD = oneXTwo.draw;
        pA = oneXTwo.away_win;
      } else {
        // 滚球 1X2 机构赔率代表的是全场终态结果 (Full-Time Final Score)！
        // 必须结合已有比分 [currentHomeScore, currentAwayScore] 与剩余进球网格求解全场终态胜平负概率
        const bivariate = calculateBivariatePoissonGrid(home, away, 6);
        const grid = bivariate.grid;
        for (let h = 0; h < grid.length; h++) {
          for (let a = 0; a < grid[h].length; a++) {
            const prob = grid[h][a];
            const finalH = currentHomeScore + h;
            const finalA = currentAwayScore + a;
            if (finalH > finalA) pH += prob;
            else if (finalH === finalA) pD += prob;
            else pA += prob;
          }
        }
        const pSum = pH + pD + pA;
        if (pSum > 0) {
          pH /= pSum;
          pD /= pSum;
          pA /= pSum;
        }
      }

      let error = (pH - winnerFair[0]) ** 2 + (pD - winnerFair[1]) ** 2 + (pA - winnerFair[2]) ** 2;
      const poisson = { lambda_home_rest: home, lambda_away_rest: away, expected_goals_rest: home + away };
      if (totalFairOdds !== undefined && total !== undefined && total.line !== null) {
        const ev = calculateTotalGoalsEV(String(total.line), totalFairOdds[0], totalFairOdds[1], currentTotalGoals, poisson);
        error += ev.over_ev ** 2 + ev.under_ev ** 2;
      }
      if (handicapFairOdds !== undefined && handicap !== undefined && handicap.line !== null) {
        // 雷速亚盘已在 Layer 01 数据摄入层彻底归一化为 Master Home Line 物理基准 (负数表示主让, 正数表示主受让)
        // 与 calculateAsianHandicapEV 及 YBTY 选项规范完全一致，直接通过 formatAsianHandicapLine 格式化
        const handicapLineStr = formatAsianHandicapLine(handicap.line);
        const ev = calculateAsianHandicapEV(handicapLineStr, handicapFairOdds[0], handicapFairOdds[1], poisson);
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
  const liveMarket = match.timing.stage === MatchStage.LIVE
    ? oddsMatrix?.live
    : undefined;
  const fallbackMarket = oddsMatrix?.pregame ?? oddsMatrix?.initial;
  const selectedMarket = liveMarket ?? fallbackMarket;
  const isInPlayMarket = liveMarket !== undefined && selectedMarket === liveMarket;
  let winnerMarket = selectedMarket?.match_winner;
  let totalMarket = selectedMarket?.total_goals ?? undefined;
  let handicapMarket = selectedMarket?.asian_handicap ?? undefined;

  // 若 reference 缺少赔率，回退至 match.markets 权威盘口
  if ((!winnerMarket || !hasValidOdds(winnerMarket.home_odds, winnerMarket.draw_odds, winnerMarket.away_odds)) && match.markets?.full_h2h) {
    winnerMarket = {
      home_odds: match.markets.full_h2h.home_odds,
      draw_odds: match.markets.full_h2h.draw_odds,
      away_odds: match.markets.full_h2h.away_odds
    };
    if (match.markets.full_total_main) {
      const lineNum = parseFloat(String(match.markets.full_total_main.line));
      totalMarket = {
        line: Number.isFinite(lineNum) ? lineNum : null,
        over_odds: match.markets.full_total_main.over_odds,
        under_odds: match.markets.full_total_main.under_odds
      };
    }
    if (match.markets.full_spread_main) {
      const rawLine = match.markets.full_spread_main.home_selection;
      const parsedLine = typeof rawLine === 'number' ? rawLine : parseFloat(String(rawLine || '0'));
      handicapMarket = {
        line: Number.isFinite(parsedLine) ? parsedLine : null,
        home_odds: match.markets.full_spread_main.home_odds,
        away_odds: match.markets.full_spread_main.away_odds
      };
    }
  }

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
      is_in_play_market: false,
      divergence_delta: 0.0,
      market_stance: MarketStanceType.MARKET_DATA_MISSING,
      market_confidence_penalty: 0,
      implied_market_home_win_prob: theoryPrior.prior_fair_home_win_prob,
      implied_market_draw_prob: theoryPrior.prior_fair_draw_prob,
      implied_market_away_win_prob: theoryPrior.prior_fair_away_win_prob,
      market_weight_applied: 0.0,
      theory_weight_applied: 1.0
    });
  }

  // 1. 使用 Shin 去抽水提取机构隐含胜平负公允概率
  const homeOdds = requiredOdds(winnerMarket.home_odds);
  const drawOdds = requiredOdds(winnerMarket.draw_odds);
  const awayOdds = requiredOdds(winnerMarket.away_odds);

  const shinRes = devigShin([homeOdds, drawOdds, awayOdds]);
  const [pH_mkt, pD_mkt, pA_mkt] = shinRes.fair_probs;

  // 2. 联合最小化 1X2、公允亚洲让球与大小球的泊松定价误差；不使用经验比例或虚构盘口。
  const currentHomeScore = isInPlayMarket ? (match.score.home_score ?? 0) : 0;
  const currentAwayScore = isInPlayMarket ? (match.score.away_score ?? 0) : 0;
  const marketLambda = jointMarketLambdaEstimate(
    winnerMarket,
    totalMarket,
    handicapMarket,
    currentHomeScore,
    currentAwayScore,
    isInPlayMarket
  );
  const lambda_mkt_H = marketLambda.home;
  const lambda_mkt_A = marketLambda.away;

  // 4. 计算理论先验与机构隐含期望偏差 Δ
  const deltaH = theoryPrior.lambda_home_theory - lambda_mkt_H;
  const deltaA = theoryPrior.lambda_away_theory - lambda_mkt_A;
  const netDelta = Number((deltaH - deltaA).toFixed(3)); // 正数表示理论显著高于机构，负数表示机构显著高于理论

  // 5. 贝叶斯收缩融合 (Bayesian Shrinkage Fusion): 理论先验 vs 机构隐含
  const absNetDelta = Math.abs(netDelta);
  let stance = MarketStanceType.CONSENSUS_ALIGNED;
  let penalty = 0;
  let isInformationAsymmetry = false;
  let passAdvised = false;

  // 严禁将巨幅偏差单方面判定为庄家诱盘从而反向加重仓！
  // 在职业博彩中，当机构盘口与理论模型发生极端脱节 (|Δ| > 0.65) 时，
  // 极大概率是知情交易者 (Smart Money) 或机构掌握了重大的场外非公开信息（突发轮换、伤病隐瞒、更衣室内讧等）。
  // 此时系统必须判定为 INFORMATION_ASYMMETRY_RISK，扣除高额置信度惩罚并建议避险观望 (Fail-Closed Pass)。
  if (absNetDelta > 0.65) {
    stance = MarketStanceType.INFORMATION_ASYMMETRY_RISK;
    penalty = 25; // 严重信息不对称，直接重罚置信度
    isInformationAsymmetry = true;
    passAdvised = true;
  } else if (absNetDelta > 0.45) {
    stance = MarketStanceType.INSTITUTIONAL_DEFENSE;
    penalty = 15;
    isInformationAsymmetry = true;
  } else if (absNetDelta > 0.25) {
    stance = MarketStanceType.TRAP_INDUCEMENT;
    penalty = 5;
  }

  // 融合权重：物理先验优先 (Physics-First Calibration)
  // 赛前市场信息相对有效(60%机构/40%理论)；滚球阶段随时间推进，物理与场面证据增多，市场噪音与流量诱盘增加，
  // 市场权重随比赛分钟单调衰减 (0.55 -> ~0.28)。
  const minute = match.timing.minute ?? 0;
  const baseMarketWeight = isInPlayMarket
    ? Math.max(0.30, 0.55 - minute * 0.003)
    : 0.60;

  // 偏差调制：当存在轻中度分歧时，允许小幅下调市场权重（最多 0.15）；
  // 但严禁无限制放大理论权重去盲目硬刚市场真实赔率，下调上限严格钳制在 0.15 以内。
  const divergencePenalty = Math.min(0.15, absNetDelta * 0.20);
  const finalMarketWeight = Number(Math.max(0.25, baseMarketWeight - divergencePenalty).toFixed(3));
  const finalTheoryWeight = Number((1.0 - finalMarketWeight).toFixed(3));

  const theoryRemainingFactor = isInPlayMarket
    ? Math.max(0, 1 - Math.min(90, Math.max(0, minute)) / 90)
    : 1;
  const finalBaseH = (lambda_mkt_H * finalMarketWeight) + (theoryPrior.lambda_home_theory * theoryRemainingFactor * finalTheoryWeight);
  const finalBaseA = (lambda_mkt_A * finalMarketWeight) + (theoryPrior.lambda_away_theory * theoryRemainingFactor * finalTheoryWeight);

  const result: MarketCalibrationResult = {
    lambda_base_home: Number(finalBaseH.toFixed(3)),
    lambda_base_away: Number(finalBaseA.toFixed(3)),
    is_in_play_market: isInPlayMarket,
    divergence_delta: netDelta,
    market_stance: stance,
    market_confidence_penalty: penalty,
    implied_market_home_win_prob: Number(pH_mkt.toFixed(4)),
    implied_market_draw_prob: Number(pD_mkt.toFixed(4)),
    implied_market_away_win_prob: Number(pA_mkt.toFixed(4)),
    market_weight_applied: finalMarketWeight,
    theory_weight_applied: finalTheoryWeight,
    theory_prior: theoryPrior,
    information_asymmetry_detected: isInformationAsymmetry,
    pass_recommendation_advised: passAdvised
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

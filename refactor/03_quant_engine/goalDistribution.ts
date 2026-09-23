/**
 * @file goalDistribution.ts
 * @description Layer 03 M2 子模块：进球时段分布 DNA（狄利克雷-多项式共轭贝叶斯平滑）与进球时序样本有效性检验
 *
 * 从 contextEngine.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { ParsedTeamGoalDistribution, ParsedGoalInterval } from '../01_data_ingestion/leisu/types.js';
import { GoalDistributionDNAFeatures } from './types.js';

/**
 * 提取进球时段分布 DNA (Goal Distribution DNA)
 * 6 个 15 分钟区间占比: [0-15', 16-30', 31-45', 46-60', 61-75', 76-90']
 */
export function extractGoalDistributionDNA(
  match: CanonicalMatch
): GoalDistributionDNAFeatures {
  const goalDist = match.reference?.goal_distribution;
  const hasCompleteIntervals = (teamDist: ParsedTeamGoalDistribution | undefined): boolean => {
    const intervals = teamDist?.home?.scored_intervals || teamDist?.away?.scored_intervals || teamDist?.all?.scored_intervals || [];
    return intervals.length >= 6 &&
      intervals.slice(0, 6).every((interval) =>
        typeof interval.goals === 'number' && Number.isFinite(interval.goals) && interval.goals >= 0
      );
  };
  const UNIFORM_6 = [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667];
  if (!goalDist || !goalDist.has_data || !hasCompleteIntervals(goalDist.home_team) || !hasCompleteIntervals(goalDist.away_team)) {
    // 返回中性展示值，但 has_data=false，调用方不得把它作为先验使用。
    return Object.freeze({
      has_data: false,
      home_scored_weights: UNIFORM_6,
      away_scored_weights: UNIFORM_6,
      home_late_game_dna: 0.1667,
      away_late_game_dna: 0.1667,
      home_early_game_dna: 0.3333,
      away_early_game_dna: 0.3333,
      home_sample_size: 0,
      away_sample_size: 0,
      home_confidence: 'INSUFFICIENT',
      away_confidence: 'INSUFFICIENT',
      is_home_specific: false,
      is_away_specific: false
    });
  }

  const extractWeightsForSide = (
    teamDist: ParsedTeamGoalDistribution | undefined,
    preferVenue: 'home' | 'away'
  ): {
    weights: number[];
    late: number;
    early: number;
    sampleSize: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
    isSpecific: boolean;
  } => {
    // 辅助函数：解析指定切片的 6 区间进球原始频数与总进球数
    const parseIntervalGoals = (ivs: ParsedGoalInterval[] | undefined): { rawGoals: number[]; totalGoals: number; isValid: boolean } => {
      const rawGoals = new Array(6).fill(0);
      let totalGoals = 0;
      if (!Array.isArray(ivs) || ivs.length < 6) {
        return { rawGoals, totalGoals: 0, isValid: false };
      }
      ivs.forEach((iv: ParsedGoalInterval, idx: number) => {
        if (idx < 6 && typeof iv.goals === 'number' && Number.isFinite(iv.goals) && iv.goals >= 0) {
          rawGoals[idx] = iv.goals;
          totalGoals += iv.goals;
        }
      });
      return { rawGoals, totalGoals, isValid: totalGoals > 0 };
    };

    // 辅助函数：对原始频数进行狄利克雷-多项式共轭贝叶斯平滑
    const smoothIntervals = (rawGoals: number[], totalGoals: number): number[] => {
      const ALPHA = 1.0;
      const K = 6;
      const denom = totalGoals + K * ALPHA;
      const posterior = new Array(6);
      for (let i = 0; i < 6; i++) {
        posterior[i] = (rawGoals[i] + ALPHA) / denom;
      }
      return posterior;
    };

    // 1. 分别提取：总体切片 (All) 与 专属主客场切片 (Venue: Home / Away)
    const allScope = teamDist?.all;
    const venueScope = preferVenue === 'home' ? teamDist?.home : teamDist?.away;

    const allParsed = parseIntervalGoals(allScope?.scored_intervals);
    const venueParsed = parseIntervalGoals(venueScope?.scored_intervals);

    const nAll = allParsed.totalGoals;
    const nVenue = venueParsed.totalGoals;

    // 2. 样本量底线安全阀 (Sample Size Floor)：
    // 若全赛季总进球 N_all < 5，整支球队样本极小/假规律，100% 回退至中性均匀分布
    if (nAll < 5) {
      return {
        weights: UNIFORM_6,
        late: 0.1667,
        early: 0.3333,
        sampleSize: Math.max(nAll, nVenue),
        confidence: 'INSUFFICIENT',
        isSpecific: false
      };
    }

    // 总体后验分布
    const posteriorAll = smoothIntervals(allParsed.rawGoals, nAll);

    // 3. "总 + 专属"自适应分层加权融合：
    // 根据专属主/客场样本量 nVenue 动态分配专属切片与总体切片的融合比例
    let finalFusedProbs: number[];
    let isSpecific = false;
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

    if (venueParsed.isValid && nVenue >= 12) {
      // 规则 1：专属切片样本充足 (nVenue >= 12) -> 70% 专属切片 + 30% 总体切片
      const posteriorVenue = smoothIntervals(venueParsed.rawGoals, nVenue);
      finalFusedProbs = new Array(6);
      for (let i = 0; i < 6; i++) {
        finalFusedProbs[i] = posteriorVenue[i] * 0.70 + posteriorAll[i] * 0.30;
      }
      isSpecific = true;
      confidence = 'HIGH';
    } else if (venueParsed.isValid && nVenue >= 5) {
      // 规则 2：专属切片样本中等 (5 <= nVenue < 12) -> 50% 专属切片 + 50% 总体切片
      const posteriorVenue = smoothIntervals(venueParsed.rawGoals, nVenue);
      finalFusedProbs = new Array(6);
      for (let i = 0; i < 6; i++) {
        finalFusedProbs[i] = posteriorVenue[i] * 0.50 + posteriorAll[i] * 0.50;
      }
      isSpecific = true;
      confidence = nAll >= 15 ? 'HIGH' : 'MEDIUM';
    } else {
      // 规则 3：专属切片样本过小或缺失 (nVenue < 5) -> 100% 采用总体切片 (All)
      // 若总体切片样本在 5 ~ 15 之间，采用样本成熟度信度因子平滑向中性均匀先验收缩
      if (nAll >= 15) {
        finalFusedProbs = posteriorAll;
        confidence = 'HIGH';
      } else {
        // 当 5 <= nAll < 15 时，信度因子 lambda = (nAll - 5) / 10.0 ∈ [0.0, 1.0)
        // 确保当 nAll=5 时平滑收敛到中性先验 1/6，当 nAll 逼近 15 时平滑过渡到全狄利克雷后验，消除跳跃阶跃
        const shrinkage = Math.max(0.0, Math.min(1.0, (nAll - 5.0) / 10.0));
        finalFusedProbs = new Array(6);
        for (let i = 0; i < 6; i++) {
          finalFusedProbs[i] = posteriorAll[i] * shrinkage + (1.0 / 6.0) * (1.0 - shrinkage);
        }
        confidence = 'MEDIUM';
      }
      isSpecific = false;
    }

    // 4. 归一化与特征派生
    const finalWeights = new Array(6);
    let sumProbs = 0;
    for (let i = 0; i < 6; i++) {
      sumProbs += finalFusedProbs[i];
    }
    const normFactor = sumProbs > 0 ? 1.0 / sumProbs : 1.0;
    for (let i = 0; i < 6; i++) {
      finalWeights[i] = Number((finalFusedProbs[i] * normFactor).toFixed(4));
    }

    // 精度微调保和为 1.0
    const sumAfter = finalWeights.reduce((a, b) => a + b, 0);
    if (Math.abs(sumAfter - 1.0) > 0.0001) {
      const diff = 1.0 - sumAfter;
      finalWeights[5] = Number((finalWeights[5] + diff).toFixed(4));
    }

    const late = finalWeights[5] ?? 0.1667;
    const early = Number(((finalWeights[0] ?? 0.1667) + (finalWeights[1] ?? 0.1667)).toFixed(4));

    return {
      weights: finalWeights,
      late,
      early,
      sampleSize: Math.max(nAll, nVenue),
      confidence,
      isSpecific
    };
  };

  const homeDna = extractWeightsForSide(goalDist.home_team, 'home');
  const awayDna = extractWeightsForSide(goalDist.away_team, 'away');

  return Object.freeze({
    has_data: true,
    home_scored_weights: homeDna.weights,
    away_scored_weights: awayDna.weights,
    home_late_game_dna: homeDna.late,
    away_late_game_dna: awayDna.late,
    home_early_game_dna: homeDna.early,
    away_early_game_dna: awayDna.early,
    home_sample_size: homeDna.sampleSize,
    away_sample_size: awayDna.sampleSize,
    home_confidence: homeDna.confidence,
    away_confidence: awayDna.confidence,
    is_home_specific: homeDna.isSpecific,
    is_away_specific: awayDna.isSpecific
  });
}

/**
 * 检验进球时间段分布样本有效性 (N < 8 场自动标记贝叶斯收缩)
 */
export function evaluateGoalTimingValidity(
  match: CanonicalMatch
): { sample_count: number; is_valid: boolean; requires_shrinkage: boolean } {
  const goalDist = match.reference?.goal_distribution;
  if (!goalDist || !goalDist.has_data) {
    return { sample_count: 0, is_valid: false, requires_shrinkage: true };
  }

  const hasCompleteIntervals = (teamDist: ParsedTeamGoalDistribution | undefined): boolean => {
    const intervals = teamDist?.all?.scored_intervals || teamDist?.home?.scored_intervals || [];
    return intervals.length >= 6 &&
      intervals.slice(0, 6).every((interval) =>
        typeof interval.goals === 'number' && Number.isFinite(interval.goals) && interval.goals >= 0
      );
  };
  if (!hasCompleteIntervals(goalDist.home_team) || !hasCompleteIntervals(goalDist.away_team)) {
    return { sample_count: 0, is_valid: false, requires_shrinkage: true };
  }
  const homeMatches = goalDist.home_team?.all?.matches_count ?? 0;
  const awayMatches = goalDist.away_team?.all?.matches_count ?? 0;
  const minSample = Math.min(homeMatches, awayMatches);
  const isValid = minSample >= 8;

  return {
    sample_count: minSample,
    is_valid: isValid,
    requires_shrinkage: !isValid
  };
}

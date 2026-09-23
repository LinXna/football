/**
 * @file recentForm.ts
 * @description Layer 03 M2 子模块：近期战绩时间连续衰减、赛事层级过滤与半场/下半场攻防解耦
 *
 * 从 contextEngine.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { resolveMatchAnchorTimestamp } from './h2hDecay.js';
import { getAdaptiveLookbackWindow, getTeamStrengthProfile } from './globalTierMatrix.js';
import { LeisuRawRecentMatch } from '../01_data_ingestion/leisu/types.js';
import {
  RecentFormContextWeight,
  RecentFormDetailedAnalytics
} from './types.js';

/**
 * 计算近期战绩时间连续衰减、赛事层级过滤与半场/下半场攻防解耦
 */
export function calculateRecentFormWeights(
  match: CanonicalMatch,
  currentTimestamp: number = resolveMatchAnchorTimestamp(match)
): {
  home: RecentFormContextWeight[];
  away: RecentFormContextWeight[];
  home_analytics: RecentFormDetailedAnalytics;
  away_analytics: RecentFormDetailedAnalytics;
} {
  const homeRecent = match.reference?.tactical_context?.home_recent_matches || [];
  const awayRecent = match.reference?.tactical_context?.away_recent_matches || [];

  const evaluateRecentMatches = (
    matches: LeisuRawRecentMatch[],
    targetTeamName: string,
    targetLeisuName: string | undefined,
    targetTeamId: number | null,
    isTargetHome: boolean
  ): { weights: RecentFormContextWeight[]; analytics: RecentFormDetailedAnalytics } => {
    if (matches.length === 0) {
      return {
        weights: [],
        analytics: {
          sample_count: 0,
          valid_count: 0,
          weighted_scored_per_game: 0,
          weighted_conceded_per_game: 0,
          first_half_scored_avg: 0,
          first_half_conceded_avg: 0,
          second_half_scored_avg: 0,
          second_half_conceded_avg: 0,
          slow_starter_index: 0,
          second_half_surge_rate: 0,
          clean_sheet_rate: 0,
          failed_to_score_rate: 0,
          handicap_win_rate: 0,
          over_goals_rate: 0
        }
      };
    }

    const currentLeagueName = match.league_name || match.reference?.leisu_league_name || '';
    const isCurrentMatchFriendly = /友谊|Friendly|球会友谊/i.test(currentLeagueName);
    const adaptiveWindow = getAdaptiveLookbackWindow(currentLeagueName, targetTeamName);
    const isTournamentOrYouth = /U23|U21|U20|U19|杯|Cup|锦标|亚运|奥运|Asian Games|Tournament|国奥|青年|World Cup|Asian Cup|Euro|洲际/i.test(currentLeagueName);
    const maxLookbackDays = isTournamentOrYouth ? adaptiveWindow.maxDays : 365;
    const halfLifeDays = isTournamentOrYouth ? adaptiveWindow.halfLifeDays : 120;

    // 预判近 365 天内有效样本数，若近 1 年正赛极其稀缺 (<= 2 场)，启动赛会/大赛周期历史样本稀缺度补偿
    const recent365Count = matches.filter((item) => {
      let matchTime = 0;
      if (typeof item.match_time === 'number' && item.match_time > 0) {
        matchTime = item.match_time > 1e11 ? item.match_time : item.match_time * 1000;
      } else if (item.match_date) {
        const parsed = new Date(String(item.match_date)).getTime();
        if (!isNaN(parsed)) matchTime = parsed;
      }
      const days = matchTime > 0 ? Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24))) : 9999;
      return days <= 365;
    }).length;
    const isSampleScarcity = recent365Count <= 2;

    let totalEffectiveWeight = 0;
    let sumScored = 0;
    let sumConceded = 0;
    let sumHalfScored = 0;
    let sumHalfConceded = 0;
    let sumSecondHalfScored = 0;
    let sumSecondHalfConceded = 0;
    let cleanSheetCount = 0;
    let failedToScoreCount = 0;
    let handicapWinCount = 0;
    let overGoalsCount = 0;
    let validCount = 0;

    const weights: RecentFormContextWeight[] = matches.map((item) => {
      // 1. 时间过滤与指数衰减 (自适应半衰期, 青年队/杯赛/大赛自适应扩展至 1460 天)
      let matchTime = 0;
      let dateStr = '';
      if (typeof item.match_time === 'number' && item.match_time > 0) {
        matchTime = item.match_time > 1e11 ? item.match_time : item.match_time * 1000;
        dateStr = new Date(matchTime).toISOString().slice(0, 10);
      } else if (item.match_date) {
        const parsed = new Date(String(item.match_date)).getTime();
        if (!isNaN(parsed) && parsed > 0) {
          matchTime = parsed;
          dateStr = String(item.match_date).slice(0, 10);
        }
      }

      const hasValidTime = matchTime > 0;
      const daysAgo = Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24)));
      const isValidTime = hasValidTime && daysAgo >= 0 && daysAgo <= maxLookbackDays;
      let timeDecay = 0.0;
      if (isValidTime) {
        if (daysAgo <= 30) {
          timeDecay = 1.0;
        } else {
          timeDecay = Math.exp(- (Math.LN2 / halfLifeDays) * (daysAgo - 30));
          // 稀缺度加权补偿：当近 1 年正赛少于 3 场时，前置 1~4 年比赛保留有效基线权重
          if (isSampleScarcity && daysAgo <= maxLookbackDays) {
            timeDecay = Math.max(timeDecay, 0.25 * Math.exp(- (daysAgo / maxLookbackDays)));
          }
        }
      }

      // 2. 赛事层级与同赛事优先过滤
      let compWeight = 0.8;
      const compName = String(item.league_name || item.competition_name || item.competition || '');
      const isItemFriendly = /友谊|Friendly|球会友谊/i.test(compName);

      if (isItemFriendly) {
        if (!isCurrentMatchFriendly) {
          // 规则 A：若当前分析比赛为正规联赛/正规杯赛，历史样本中的球会友谊赛严格隔离归 0.0，杜绝商业热身假象污染
          compWeight = 0.0;
        } else {
          // 规则 B：若当前分析比赛本身就是球会友谊赛，历史友谊赛样本正常赋予 1.0 权重并参与时间衰减
          compWeight = 1.0;
        }
      } else if (currentLeagueName && (compName.includes(currentLeagueName) || currentLeagueName.includes(compName))) {
        compWeight = 1.0; // 同名同级别联赛最高准度
      } else if (compName.includes('杯') || compName.includes('Cup') || compName.includes('Trophy')) {
        compWeight = 0.60; // 杯赛权重
      }

      // 3. 近期战绩必须先确认样本确实属于目标球队；无法确认时不得猜测主客方向。
      let itemIsHome = false;
      let teamIdentityMatched = false;
      if (targetTeamId != null && item.home_team_id != null && item.home_team_id === targetTeamId) {
        itemIsHome = true;
        teamIdentityMatched = true;
      } else if (targetTeamId != null && item.away_team_id != null && item.away_team_id === targetTeamId) {
        itemIsHome = false;
        teamIdentityMatched = true;
      } else {
        const isHomeName = item.home_team_name === targetTeamName || (Boolean(targetLeisuName) && item.home_team_name === targetLeisuName);
        const isAwayName = item.away_team_name === targetTeamName || (Boolean(targetLeisuName) && item.away_team_name === targetLeisuName);
        if (isHomeName && !isAwayName) {
          itemIsHome = true;
          teamIdentityMatched = true;
        } else if (!isHomeName && isAwayName) {
          itemIsHome = false;
          teamIdentityMatched = true;
        }
      }

      const isVenueMatched = isTargetHome ? itemIsHome : !itemIsHome;
      const venueWeight = isVenueMatched ? 1.0 : 0.65;

      const finalWeight = Number((timeDecay * compWeight * venueWeight).toFixed(4));

      // 对手层级与战力归一化 (Opponent Tier / Strength Normalization)
      const opponentName = (itemIsHome ? item.away_team_name : item.home_team_name) || undefined;
      const oppProfile = getTeamStrengthProfile(opponentName || '', compName);
      const oppTier = oppProfile.tier;
      const oppStrengthFactor = oppProfile.defense_toughness_multiplier;
      const oppAttackFactor = oppProfile.attack_strength_multiplier;

      // 4. 解析进球明细 (全场、半场、下半场)
      const ftHome = item.fulltime_score?.home;
      const ftAway = item.fulltime_score?.away;
      const htHome = item.halftime_score?.home;
      const htAway = item.halftime_score?.away;
      const hasValidFinalScore =
        typeof ftHome === 'number' && Number.isFinite(ftHome) && ftHome >= 0 &&
        typeof ftAway === 'number' && Number.isFinite(ftAway) && ftAway >= 0;
      const hasValidHalfScore =
        (htHome === null || htHome === undefined || (typeof htHome === 'number' && Number.isFinite(htHome) && htHome >= 0)) &&
        (htAway === null || htAway === undefined || (typeof htAway === 'number' && Number.isFinite(htAway) && htAway >= 0)) &&
        (htHome === null || htHome === undefined || (ftHome !== undefined && ftHome !== null && htHome <= ftHome)) &&
        (htAway === null || htAway === undefined || (ftAway !== undefined && ftAway !== null && htAway <= ftAway));
      const hasValidScore = hasValidFinalScore && hasValidHalfScore;

      if (!teamIdentityMatched || !hasValidScore || !isValidTime || !compName.trim()) {
        return Object.freeze({
          match_id: String(item.match_id || ''),
          match_date: dateStr,
          days_ago: daysAgo,
          time_decay_weight: 0,
          venue_homomorphism_weight: 0,
          competition_importance_weight: 0,
          final_composite_weight: 0,
          is_valid_time_window: false,
          scored_full: 0,
          conceded_full: 0,
          scored_half: 0,
          conceded_half: 0,
          scored_second_half: 0,
          conceded_second_half: 0,
          is_clean_sheet: false,
          is_failed_to_score: false,
          handicap_result: 'UNKNOWN' as const,
          goals_trend_result: 'UNKNOWN' as const,
          opponent_name: opponentName,
          opponent_tier: oppTier,
          opponent_strength_factor: oppStrengthFactor
        });
      }
      const scoredFull = itemIsHome ? ftHome : ftAway;
      const concededFull = itemIsHome ? ftAway : ftHome;
      const scoredHalf = (itemIsHome ? htHome : htAway) ?? 0;
      const concededHalf = (itemIsHome ? htAway : htHome) ?? 0;

      const scoredSecondHalf = Math.max(0, scoredFull - scoredHalf);
      const concededSecondHalf = Math.max(0, concededFull - concededHalf);

      const isCleanSheet = concededFull === 0;
      const isFailedToScore = scoredFull === 0;

      // 盘路结果
      let handicapRes: 'WIN' | 'LOSS' | 'DRAW' | 'UNKNOWN' = 'UNKNOWN';
      if (item.handicap_trend?.result === '赢') handicapRes = 'WIN';
      else if (item.handicap_trend?.result === '输') handicapRes = 'LOSS';
      else if (item.handicap_trend?.result === '走' || item.handicap_trend?.result === '和') handicapRes = 'DRAW';

      let goalsTrendRes: 'BIG' | 'SMALL' | 'UNKNOWN' = 'UNKNOWN';
      if (item.goals_trend?.result === '大') goalsTrendRes = 'BIG';
      else if (item.goals_trend?.result === '小') goalsTrendRes = 'SMALL';

      if (teamIdentityMatched && hasValidScore && isValidTime && finalWeight > 0) {
        // 对手防守坚韧度归一化进球，对手进攻强度归一化失球
        const normalizedScored = scoredFull * oppStrengthFactor;
        const normalizedConceded = concededFull / Math.max(0.40, oppAttackFactor);

        totalEffectiveWeight += finalWeight;
        sumScored += normalizedScored * finalWeight;
        sumConceded += normalizedConceded * finalWeight;
        sumHalfScored += (scoredHalf * oppStrengthFactor) * finalWeight;
        sumHalfConceded += (concededHalf / Math.max(0.40, oppAttackFactor)) * finalWeight;
        sumSecondHalfScored += (scoredSecondHalf * oppStrengthFactor) * finalWeight;
        sumSecondHalfConceded += (concededSecondHalf / Math.max(0.40, oppAttackFactor)) * finalWeight;

        if (isCleanSheet) cleanSheetCount += finalWeight;
        if (isFailedToScore) failedToScoreCount += finalWeight;
        if (handicapRes === 'WIN') handicapWinCount += finalWeight;
        if (goalsTrendRes === 'BIG') overGoalsCount += finalWeight;
        validCount++;
      }

      return Object.freeze({
        match_id: String(item.match_id || ''),
        match_date: dateStr,
        days_ago: daysAgo,
        time_decay_weight: Number(timeDecay.toFixed(4)),
        venue_homomorphism_weight: venueWeight,
        competition_importance_weight: compWeight,
        final_composite_weight: finalWeight,
        is_valid_time_window: isValidTime,
        scored_full: scoredFull,
        conceded_full: concededFull,
        scored_half: scoredHalf,
        conceded_half: concededHalf,
        scored_second_half: scoredSecondHalf,
        conceded_second_half: concededSecondHalf,
        is_clean_sheet: isCleanSheet,
        is_failed_to_score: isFailedToScore,
        handicap_result: handicapRes,
        goals_trend_result: goalsTrendRes,
        opponent_name: opponentName,
        opponent_tier: oppTier,
        opponent_strength_factor: oppStrengthFactor
      });
    });

    const denom = totalEffectiveWeight > 0 ? totalEffectiveWeight : 1.0;
    let avgScored = totalEffectiveWeight > 0 ? Number((sumScored / denom).toFixed(2)) : 0;
    let avgConceded = totalEffectiveWeight > 0 ? Number((sumConceded / denom).toFixed(2)) : 0;

    // 弱样本/小样本经验贝叶斯平滑收缩 (Empirical Bayes Shrinkage toward 1.30 baseline)
    if (validCount > 0 && validCount < 4) {
      const shrinkWeight = validCount / (validCount + 2.0);
      avgScored = Number((shrinkWeight * avgScored + (1.0 - shrinkWeight) * 1.30).toFixed(2));
      avgConceded = Number((shrinkWeight * avgConceded + (1.0 - shrinkWeight) * 1.30).toFixed(2));
    }
    const avgHalfScored = totalEffectiveWeight > 0 ? Number((sumHalfScored / denom).toFixed(2)) : 0;
    const avgHalfConceded = totalEffectiveWeight > 0 ? Number((sumHalfConceded / denom).toFixed(2)) : 0;
    const avgSecondScored = totalEffectiveWeight > 0 ? Number((sumSecondHalfScored / denom).toFixed(2)) : 0;
    const avgSecondConceded = totalEffectiveWeight > 0 ? Number((sumSecondHalfConceded / denom).toFixed(2)) : 0;

    const totalScoredSum = sumHalfScored + sumSecondHalfScored;
    const slowStarter = totalScoredSum > 0 ? Number((sumSecondHalfScored / totalScoredSum).toFixed(3)) : 0;

    return {
      weights,
      analytics: {
        sample_count: matches.length,
        valid_count: validCount,
        weighted_scored_per_game: avgScored,
        weighted_conceded_per_game: avgConceded,
        first_half_scored_avg: avgHalfScored,
        first_half_conceded_avg: avgHalfConceded,
        second_half_scored_avg: avgSecondScored,
        second_half_conceded_avg: avgSecondConceded,
        slow_starter_index: slowStarter,
        second_half_surge_rate: slowStarter > 0.60 ? 1.0 : (slowStarter < 0.40 ? 0.0 : 0.5),
        clean_sheet_rate: Number((cleanSheetCount / denom).toFixed(3)),
        failed_to_score_rate: Number((failedToScoreCount / denom).toFixed(3)),
        handicap_win_rate: Number((handicapWinCount / denom).toFixed(3)),
        over_goals_rate: Number((overGoalsCount / denom).toFixed(3))
      }
    };
  };

  const homeTargetId = match.reference?.home_team_id ?? match.reference?.league_standings?.home_team?.team_id ?? null;
  const awayTargetId = match.reference?.away_team_id ?? match.reference?.league_standings?.away_team?.team_id ?? null;

  const homeResult = evaluateRecentMatches(
    homeRecent,
    match.home_team_name,
    match.reference?.leisu_home_name,
    homeTargetId,
    true
  );
  const awayResult = evaluateRecentMatches(
    awayRecent,
    match.away_team_name,
    match.reference?.leisu_away_name,
    awayTargetId,
    false
  );

  return {
    home: homeResult.weights,
    away: awayResult.weights,
    home_analytics: homeResult.analytics,
    away_analytics: awayResult.analytics
  };
}


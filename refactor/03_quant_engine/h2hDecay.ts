/**
 * @file h2hDecay.ts
 * @description Layer 03 M2 子模块：历史交锋（H2H）时间指数半衰期衰减、赛事级别加权与球风克制指数
 *
 * 从 contextEngine.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { checkH2HTacticalIntegrity } from './l0CircuitBreaker.js';
import { getAdaptiveLookbackWindow } from './globalTierMatrix.js';
import {
  HistoricalMatchWeight,
  H2HDetailedAnalytics
} from './types.js';

/**
 * 获取确定性基准时间戳（优先使用快照创建时间或开赛时间，消除 Date.now() 对离线/次日回放的影响）
 */
export function resolveMatchAnchorTimestamp(match: CanonicalMatch): number {
  if (match.created_at) {
    const t = Date.parse(match.created_at);
    if (!isNaN(t) && t > 0) return t;
  }
  if (match.timing?.beijing_start_time) {
    const raw = match.timing.beijing_start_time.trim();
    const formatted = raw.includes('T') ? raw : raw.replace(' ', 'T') + '+08:00';
    const t = Date.parse(formatted);
    if (!isNaN(t) && t > 0) return t;
  }
  return Date.now();
}

/**
 * 计算交锋历史时间连续指数衰减权重、赛事级别加权与球风克制指数
 */
export function calculateH2HDecayWeights(
  match: CanonicalMatch,
  halfLifeDays: number = 365,
  currentTimestamp: number = resolveMatchAnchorTimestamp(match)
): { weights: HistoricalMatchWeight[]; analytics: H2HDetailedAnalytics } {
  const h2hList = match.reference?.tactical_context?.h2h_raw || [];
  if (h2hList.length === 0) {
    return {
      weights: [],
      analytics: {
        sample_count: 0,
        valid_count: 0,
        tactical_valid_count: 0,
        tactical_metrics_available: false,
        total_decayed_weight: 0,
        tactical_decayed_weight: 0,
        net_goal_differential_weighted: 0,
        historical_h2h_advantage_home: 0,
        historical_under_rate: null,
        historical_avg_corners: null,
        historical_avg_red_cards: null,
        tactical_stylistic_clash_index: 0
      }
    };
  }

  const adaptiveWindow = getAdaptiveLookbackWindow(
    match.league_name || match.reference?.leisu_league_name,
    match.home_team_name,
    match.away_team_name
  );
  const maxValidDays = adaptiveWindow.maxDays;
  const effectiveHalfLife = typeof halfLifeDays === 'number' ? halfLifeDays : adaptiveWindow.halfLifeDays;
  const decayConstant = Math.LN2 / effectiveHalfLife;

  const currentHomeId = match.reference?.home_team_id ?? match.reference?.league_standings?.home_team?.team_id ?? null;
  const currentAwayId = match.reference?.away_team_id ?? match.reference?.league_standings?.away_team?.team_id ?? null;
  const currentLeague = match.league_name || match.reference?.leisu_league_name || '';
  const isCurrentMatchFriendly = /友谊|Friendly|球会友谊/i.test(currentLeague);

  let totalDecayedWeight = 0;
  let weightedNetGoals = 0;
  let validUnderCount = 0;
  let totalRedCards = 0;
  let validCount = 0;

  // 深度战术攻防样本聚合器 (仅限通过全指标双向真实门禁的样本)
  let tacticalDecayedWeight = 0;
  let tacticalValidCount = 0;
  let totalTacticalCorners = 0;
  let totalClashScore = 0;

  // 预判近 365 天内有效样本数，若近 1 年内对战极其稀缺 (<= 1 场)，启动赛会/大赛周期历史样本稀缺度补偿
  const recentH2HCount = h2hList.filter((item) => {
    let matchTime = 0;
    if (typeof item.match_time === 'number' && item.match_time > 0) {
      matchTime = item.match_time > 1e11 ? item.match_time : item.match_time * 1000;
    } else if (item.match_time) {
      const parsed = new Date(String(item.match_time)).getTime();
      if (!isNaN(parsed)) matchTime = parsed;
    }
    const days = matchTime > 0 ? Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24))) : 9999;
    return days <= 365;
  }).length;
  const isH2HScarcity = recentH2HCount <= 1;

  // 自适应多级历史交锋时间窗 (青年队/杯赛/大赛 1460 天，俱乐部常规联赛 730 天)
  const weights: HistoricalMatchWeight[] = h2hList.map((h2h) => {
    let matchTime = 0;
    let dateStr = '';
    if (typeof h2h.match_time === 'number' && h2h.match_time > 0) {
      matchTime = h2h.match_time > 1e11 ? h2h.match_time : h2h.match_time * 1000;
      dateStr = new Date(matchTime).toISOString().slice(0, 10);
    } else if (h2h.match_time) {
      const parsed = new Date(String(h2h.match_time)).getTime();
      if (!isNaN(parsed) && parsed > 0) {
        matchTime = parsed;
        dateStr = String(h2h.match_time).slice(0, 10);
      }
    }

    const hasValidTime = matchTime > 0;
    const daysAgo = hasValidTime ? Math.max(0, Math.floor((currentTimestamp - matchTime) / (1000 * 60 * 60 * 24))) : 9999;
    const isValidTimeWindow = hasValidTime && daysAgo >= 0 && daysAgo <= maxValidDays;

    const homeScores = h2h.home_scores || [];
    const awayScores = h2h.away_scores || [];
    const hasValidScore =
      Number.isInteger(homeScores[0]) && homeScores[0] >= 0 &&
      Number.isInteger(awayScores[0]) && awayScores[0] >= 0;

    const currentHomeName = match.home_team_name;
    const currentAwayName = match.away_team_name;
    const h2hWithNames = h2h as typeof h2h & { home_team_name?: string; away_team_name?: string };
    const h2hHomeName = h2hWithNames.home_team_name;
    const h2hAwayName = h2hWithNames.away_team_name;
    const identityMatched =
      (currentHomeId != null && (h2h.home_team_id === currentHomeId || h2h.away_team_id === currentHomeId)) ||
      (currentAwayId != null && (h2h.home_team_id === currentAwayId || h2h.away_team_id === currentAwayId)) ||
      (Boolean(currentHomeName) && (h2hHomeName === currentHomeName || h2hAwayName === currentHomeName)) ||
      (Boolean(currentAwayName) && (h2hHomeName === currentAwayName || h2hAwayName === currentAwayName));

    let decayWeight = 0.0;
    // 只有在通过自适应前置物理时间隔离门禁、身份匹配、比分有效时才赋予非零指数衰减权重
    const isValid = identityMatched && isValidTimeWindow && hasValidScore;
    if (isValid) {
      decayWeight = Math.exp(-decayConstant * daysAgo);
      // 稀缺度加权补偿：当近 365 天内对战记录极少/为零时，两年或四年周期大赛历史交锋赋予有效保底权重 (>= 0.20)
      if (isH2HScarcity && daysAgo <= maxValidDays) {
        decayWeight = Math.max(decayWeight, 0.20 * Math.exp(- (daysAgo / maxValidDays)));
      }
    }

    const h2hCompName = String(h2h.league_name || h2h.competition_name || h2h.competition || '');
    const isH2HFriendly = /友谊|Friendly|球会友谊/i.test(h2hCompName);

    let compImp = 1.0;
    if (isH2HFriendly) {
      if (!isCurrentMatchFriendly) {
        // 规则 A：若当前分析比赛为正规联赛/正规杯赛，历史样本中的球会友谊赛严格隔离归零
        compImp = 0.0;
      } else {
        // 规则 B：若当前分析比赛本身即球会友谊赛，历史友谊赛样本正常保留 1.0 权重并参与时间衰减
        compImp = 1.0;
      }
    }

    // 方案 1 历史对赛改造：双重锚定校验当前主队在该历史对决中是主场出战还是客场出战
    let isCurrentHomePlayingHome = true;
    if (currentHomeId != null && h2h.home_team_id != null && h2h.home_team_id === currentHomeId) {
      isCurrentHomePlayingHome = true;
    } else if (currentHomeId != null && h2h.away_team_id != null && h2h.away_team_id === currentHomeId) {
      isCurrentHomePlayingHome = false;
    } else if (currentAwayId != null && h2h.away_team_id != null && h2h.away_team_id === currentAwayId) {
      isCurrentHomePlayingHome = true;
    } else if (currentAwayId != null && h2h.home_team_id != null && h2h.home_team_id === currentAwayId) {
      isCurrentHomePlayingHome = false;
    } else if (currentHomeName && h2hHomeName === currentHomeName) {
      isCurrentHomePlayingHome = true;
    } else if (currentHomeName && h2hAwayName === currentHomeName) {
      isCurrentHomePlayingHome = false;
    } else if (currentAwayName && h2hAwayName === currentAwayName) {
      isCurrentHomePlayingHome = true;
    } else if (currentAwayName && h2hHomeName === currentAwayName) {
      isCurrentHomePlayingHome = false;
    }

    const homeGoals = typeof homeScores[0] === 'number' ? homeScores[0] : 0;
    const awayGoals = typeof awayScores[0] === 'number' ? awayScores[0] : 0;
    const halfHomeGoals = typeof homeScores[1] === 'number' ? homeScores[1] : 0;
    const halfAwayGoals = typeof awayScores[1] === 'number' ? awayScores[1] : 0;
    const redHome = typeof homeScores[2] === 'number' ? homeScores[2] : 0;
    const redAway = typeof awayScores[2] === 'number' ? awayScores[2] : 0;
    const cornerHome = typeof homeScores[4] === 'number' ? homeScores[4] : -1;
    const cornerAway = typeof awayScores[4] === 'number' ? awayScores[4] : -1;

    // 当前主队视角的历史净胜球：若是当前主队主场为 (homeGoals - awayGoals)；若是客场为 (awayGoals - homeGoals)
    const netGoalsForCurrentHome = isCurrentHomePlayingHome
      ? (homeGoals - awayGoals)
      : (awayGoals - homeGoals);

    // 解析让球初盘与即时盘
    let ahOpenLine: number | null = null;
    let ahCurrLine: number | null = null;
    if (h2h.opening_odds && h2h.opening_odds[0]) {
      const parts = h2h.opening_odds[0].split(',');
      if (parts.length >= 2) {
        const parsed = parseFloat(parts[1]);
        if (!isNaN(parsed)) ahOpenLine = parsed;
      }
    }
    if (h2h.current_odds && h2h.current_odds[0]) {
      const parts = h2h.current_odds[0].split(',');
      if (parts.length >= 2) {
        const parsed = parseFloat(parts[1]);
        if (!isNaN(parsed)) ahCurrLine = parsed;
      }
    }

    // 执行深层战术全指标双向真实门禁检验
    const invalidReason = !hasValidTime
      ? 'MISSING_MATCH_TIME'
      : daysAgo > maxValidDays
        ? (maxValidDays === 365 ? 'EXCEEDS_MAX_VALID_DAYS_365' : `EXCEEDS_MAX_VALID_DAYS_${maxValidDays}`)
        : !hasValidScore
          ? 'MISSING_MATCH_SCORE'
          : 'INVALID_H2H_SAMPLE';
    const tacticalCheck = isValid
      ? checkH2HTacticalIntegrity(h2h.home_stats, h2h.away_stats, cornerHome, cornerAway, daysAgo)
      : { isValid: false, reason: invalidReason };

    const isTacticalValid = tacticalCheck.isValid;
    let daRatio: number | null = null;
    let shotsRatio: number | null = null;

    if (isValid) {
      const effWeight = decayWeight * compImp;
      totalDecayedWeight += effWeight;
      weightedNetGoals += netGoalsForCurrentHome * effWeight;
      validCount++;

      if (homeGoals + awayGoals <= 2) {
        validUnderCount += effWeight;
      }
      if (redHome >= 0 && redAway >= 0) {
        totalRedCards += (redHome + redAway);
      }

      // 仅当通过全套客观真实攻防门禁时，才计入角球与球风克制
      if (isTacticalValid) {
        tacticalValidCount++;
        tacticalDecayedWeight += effWeight;
        totalTacticalCorners += (cornerHome + cornerAway);

        const homeStats = h2h.home_stats!;
        const awayStats = h2h.away_stats!;
        const daH = homeStats.dangerous_attack as number;
        const daA = awayStats.dangerous_attack as number;
        const shotsH = homeStats.shots as number;
        const shotsA = awayStats.shots as number;

        // 对齐当前主队统治视角：主场出战取 daH/daTot，客场出战取 daA/daTot
        daRatio = isCurrentHomePlayingHome
          ? Number((daH / (daH + daA)).toFixed(3))
          : Number((daA / (daH + daA)).toFixed(3));
        shotsRatio = isCurrentHomePlayingHome
          ? Number((shotsH / (shotsH + shotsA)).toFixed(3))
          : Number((shotsA / (shotsH + shotsA)).toFixed(3));

        // 当前主队球风压制得分: (危攻比 - 0.5) * 1.2 + (射门比 - 0.5) * 0.8
        totalClashScore += ((daRatio - 0.5) * 1.2 + (shotsRatio - 0.5) * 0.8) * effWeight;
      }
    }

    return Object.freeze({
      match_id: String(h2h.match_id || ''),
      date: dateStr,
      days_ago: daysAgo,
      decay_weight: Number(decayWeight.toFixed(4)),
      is_valid: isValid,
      competition_importance: compImp,
      home_goals: homeGoals,
      away_goals: awayGoals,
      half_home_goals: halfHomeGoals,
      half_away_goals: halfAwayGoals,
      red_cards_home: redHome,
      red_cards_away: redAway,
      corners_home: cornerHome,
      corners_away: cornerAway,
      handicap_opening_line: ahOpenLine,
      handicap_current_line: ahCurrLine,
      dangerous_attack_ratio: daRatio,
      shots_ratio: shotsRatio,
      is_tactical_valid: isTacticalValid,
      tactical_invalidation_reason: tacticalCheck.reason
    });
  });

  const netDiffWeighted = totalDecayedWeight > 0 ? Number((weightedNetGoals / totalDecayedWeight).toFixed(3)) : 0;
  const h2hAdvantage = Math.max(-0.20, Math.min(0.20, netDiffWeighted * 0.08));
  const underRate = totalDecayedWeight > 0 ? Number((validUnderCount / totalDecayedWeight).toFixed(3)) : null;
  const avgReds = validCount > 0 ? Number((totalRedCards / validCount).toFixed(2)) : null;

  // 严禁假 0 或假 9.0，仅当具备真实有效战术攻防样本时计算
  const tacticalAvailable = tacticalValidCount >= 1;
  const avgCorners = tacticalAvailable ? Number((totalTacticalCorners / tacticalValidCount).toFixed(1)) : null;
  const clashIndex = (tacticalAvailable && tacticalDecayedWeight > 0)
    ? Math.max(-1.0, Math.min(1.0, Number((totalClashScore / tacticalDecayedWeight).toFixed(3))))
    : 0.0;

  return {
    weights,
    analytics: {
      sample_count: h2hList.length,
      valid_count: validCount,
      tactical_valid_count: tacticalValidCount,
      tactical_metrics_available: tacticalAvailable,
      total_decayed_weight: Number(totalDecayedWeight.toFixed(3)),
      tactical_decayed_weight: Number(tacticalDecayedWeight.toFixed(3)),
      net_goal_differential_weighted: netDiffWeighted,
      historical_h2h_advantage_home: h2hAdvantage,
      historical_under_rate: underRate,
      historical_avg_corners: avgCorners,
      historical_avg_red_cards: avgReds,
      tactical_stylistic_clash_index: clashIndex
    }
  };
}


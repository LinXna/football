/**
 * @file dataConsistencyAuditor.ts
 * @description Layer 02: 物理事实与时序流严格对账审计器 (Data Consistency & Physical Fact Auditor)
 * 
 * 核心对账法则（纯客观物理事实比对，严禁主观门槛，严禁主客合并混淆）：
 * 1. 时钟硬对账：
 *    - 滚球当前时钟减去动量时序点阵数量，滞后超过 3 分钟直接判定断流 (currentMinute - momentumPointsCount > 3)
 * 2. 进球事实对账：
 *    - 主客双方严格独立比对 (homeScore === eventHomeGoals && awayScore === eventAwayGoals)
 *    - 乌龙球严格按足球规则反向归属对手得分，VAR判定取消进球严格剔除
 * 3. 角球事实对账：
 *    - 主客双方严格独立比对 (statsHomeCorners === eventHomeCorners && statsAwayCorners === eventAwayCorners)
 * 4. 红牌事实对账：
 *    - 主客双方严格独立比对 (statsHomeRedCards === eventHomeRedCards && statsAwayRedCards === eventAwayRedCards)
 * 
 * 熔断契约：
 * 任何一边、任何一项出现不自洽，立即触发一票否决：
 * - 标记 has_critical_inconsistency = true
 * - 强制剥夺量化准入 (isMatchQuantEligible => eligible: false)
 * - 强制阻断下注推荐 (grade: 'NO_BET', recommendation: null)
 * - 前端显式高亮红底警报，彻底消除用户误解
 */

import { CanonicalMatch, CanonicalTimelineEvent } from './types.js';
import { CanonicalEventType, MatchStage } from './enums.js';

export interface DataConsistencyAuditResult {
  // 1. 时钟硬对账
  current_minute: number | null;
  momentum_points_count: number;
  timeline_stale_lag: number;
  is_timeline_stale: boolean;

  // 2. 进球事实对账 (主客独立)
  scoreboard_home_goals: number | null;
  scoreboard_away_goals: number | null;
  event_home_goals: number;
  event_away_goals: number;
  is_home_goal_mismatch: boolean;
  is_away_goal_mismatch: boolean;

  // 3. 角球事实对账 (主客独立)
  stats_home_corners: number | null;
  stats_away_corners: number | null;
  event_home_corners: number;
  event_away_corners: number;
  is_home_corner_mismatch: boolean;
  is_away_corner_mismatch: boolean;

  // 4. 红牌事实对账 (主客独立)
  stats_home_red_cards: number | null;
  stats_away_red_cards: number | null;
  event_home_red_cards: number;
  event_away_red_cards: number;
  is_home_red_card_mismatch: boolean;
  is_away_red_card_mismatch: boolean;

  // 5. 总体裁决与熔断详情
  has_critical_inconsistency: boolean;
  block_reasons: string[];
  summary_reason: string;
}

/**
 * 统计时序动量点阵的物理点数
 */
export function countMomentumPoints(match: CanonicalMatch | any): number {
  const momentum = match.reference?.attack_momentum;
  let count = 0;
  if (momentum && momentum.data && Array.isArray(momentum.data)) {
    for (const seg of momentum.data) {
      if (Array.isArray(seg)) {
        for (const val of seg) {
          if (typeof val === 'number' && !isNaN(val)) {
            count++;
          }
        }
      }
    }
  }
  if (count === 0 && Array.isArray(match.reference?.attack_momentum_timeline)) {
    count = match.reference.attack_momentum_timeline.length;
  }
  return count;
}

/**
 * 纯函数：执行全维度物理事实与时序对账审计
 */
export function auditDataConsistency(match: CanonicalMatch): DataConsistencyAuditResult {
  const isLive = match.timing?.stage === MatchStage.LIVE;
  const currentMinute = match.timing?.minute ?? null;
  const momentumPoints = countMomentumPoints(match);

  // 1. 时钟对账：滚球状态下，当前分钟数减去时序点数，相差大于 3 分钟即断流
  const timelineStaleLag = (currentMinute !== null) ? Math.max(0, currentMinute - momentumPoints) : 0;
  const isTimelineStale = isLive && (currentMinute !== null) && (currentMinute - momentumPoints > 3);

  // 2. 提取事件轴统计
  const timelineEvents: CanonicalTimelineEvent[] = match.reference?.timeline_events || [];

  let eventHomeGoals = 0;
  let eventAwayGoals = 0;
  let eventHomeCorners = 0;
  let eventAwayCorners = 0;
  let eventHomeRedCards = 0;
  let eventAwayRedCards = 0;

  for (const ev of timelineEvents) {
    if (ev.is_cancelled || ev.canonical_type === CanonicalEventType.GOAL_DISALLOWED) {
      continue;
    }

    const typeStr = String(ev.canonical_type || '');
    const isGoal = ev.type === 1 || typeStr.includes('GOAL');
    const isCorner = ev.type === 2 || typeStr.includes('CORNER');
    const isRedCard = (
      ev.type === 4 ||
      ev.type === 23 ||
      typeStr.includes('RED_CARD') ||
      typeStr.includes('TWO_YELLOW_TO_RED')
    );

    const side = ev.side || (ev as any).team_side;

    // 进球事实统计 (乌龙球反向归属判定)
    if (isGoal) {
      const isOwn = ev.is_own_goal || typeStr === CanonicalEventType.GOAL_OWN;
      if (isOwn) {
        // 主队球员打进乌龙球，记入客队进球
        if (side === 'home') {
          eventAwayGoals++;
        } else if (side === 'away') {
          eventHomeGoals++;
        }
      } else {
        if (side === 'home') {
          eventHomeGoals++;
        } else if (side === 'away') {
          eventAwayGoals++;
        }
      }
    }

    // 角球事实统计
    if (isCorner) {
      if (side === 'home') {
        eventHomeCorners++;
      } else if (side === 'away') {
        eventAwayCorners++;
      }
    }

    // 红牌事实统计 (场上比赛球员红牌)
    if (isRedCard) {
      if (ev.is_on_pitch !== false) {
        if (side === 'home') {
          eventHomeRedCards++;
        } else if (side === 'away') {
          eventAwayRedCards++;
        }
      }
    }
  }

  // 进球事实比对 (主客独立)
  const homeScore = match.score?.home_score ?? (match.score as any)?.current?.home ?? null;
  const awayScore = match.score?.away_score ?? (match.score as any)?.current?.away ?? null;
  const isHomeGoalMismatch = (homeScore !== null) && (homeScore !== eventHomeGoals);
  const isAwayGoalMismatch = (awayScore !== null) && (awayScore !== eventAwayGoals);

  // 角球事实比对 (主客独立)
  const statsCorners = match.reference?.stats?.corners;
  const statsHomeCorners = statsCorners?.home ?? null;
  const statsAwayCorners = statsCorners?.away ?? null;
  const isHomeCornerMismatch = (statsHomeCorners !== null && statsHomeCorners !== undefined) && (statsHomeCorners !== eventHomeCorners);
  const isAwayCornerMismatch = (statsAwayCorners !== null && statsAwayCorners !== undefined) && (statsAwayCorners !== eventAwayCorners);

  // 红牌事实比对 (主客独立)
  const statsRedCards = match.reference?.stats?.red_cards;
  const statsHomeRedCards = statsRedCards?.home ?? null;
  const statsAwayRedCards = statsRedCards?.away ?? null;
  const isHomeRedCardMismatch = (statsHomeRedCards !== null && statsHomeRedCards !== undefined) && (statsHomeRedCards !== eventHomeRedCards);
  const isAwayRedCardMismatch = (statsAwayRedCards !== null && statsAwayRedCards !== undefined) && (statsAwayRedCards !== eventAwayRedCards);

  // 一票否决判定
  const blockReasons: string[] = [];
  if (isTimelineStale) {
    blockReasons.push(`时序严重断流：当前比赛时钟 ${currentMinute}' 但危攻时序仅提供 ${momentumPoints}' 数据（滞后 ${timelineStaleLag} 分钟）`);
  }
  if (isHomeGoalMismatch) {
    blockReasons.push(`主队进球不自洽：记分牌显示 ${homeScore} 球，但事件轴仅记录 ${eventHomeGoals} 球`);
  }
  if (isAwayGoalMismatch) {
    blockReasons.push(`客队进球不自洽：记分牌显示 ${awayScore} 球，但事件轴仅记录 ${eventAwayGoals} 球`);
  }
  if (isHomeCornerMismatch) {
    blockReasons.push(`主队角球不自洽：技术统计显示 ${statsHomeCorners} 个，但事件轴记录 ${eventHomeCorners} 个`);
  }
  if (isAwayCornerMismatch) {
    blockReasons.push(`客队角球不自洽：技术统计显示 ${statsAwayCorners} 个，但事件轴记录 ${eventAwayCorners} 个`);
  }
  if (isHomeRedCardMismatch) {
    blockReasons.push(`主队红牌不自洽：技术统计显示 ${statsHomeRedCards} 张，但事件轴记录 ${eventHomeRedCards} 张`);
  }
  if (isAwayRedCardMismatch) {
    blockReasons.push(`客队红牌不自洽：技术统计显示 ${statsAwayRedCards} 张，但事件轴记录 ${eventAwayRedCards} 张`);
  }

  const hasCriticalInconsistency = blockReasons.length > 0;
  const summaryReason = hasCriticalInconsistency
    ? `底层数据物理事实分裂已硬性熔断（禁止推荐）：${blockReasons.join('；')}`
    : '物理事实与时序流一致校验通过';

  return {
    current_minute: currentMinute,
    momentum_points_count: momentumPoints,
    timeline_stale_lag: timelineStaleLag,
    is_timeline_stale: isTimelineStale,

    scoreboard_home_goals: homeScore,
    scoreboard_away_goals: awayScore,
    event_home_goals: eventHomeGoals,
    event_away_goals: eventAwayGoals,
    is_home_goal_mismatch: isHomeGoalMismatch,
    is_away_goal_mismatch: isAwayGoalMismatch,

    stats_home_corners: statsHomeCorners,
    stats_away_corners: statsAwayCorners,
    event_home_corners: eventHomeCorners,
    event_away_corners: eventAwayCorners,
    is_home_corner_mismatch: isHomeCornerMismatch,
    is_away_corner_mismatch: isAwayCornerMismatch,

    stats_home_red_cards: statsHomeRedCards,
    stats_away_red_cards: statsAwayRedCards,
    event_home_red_cards: eventHomeRedCards,
    event_away_red_cards: eventAwayRedCards,
    is_home_red_card_mismatch: isHomeRedCardMismatch,
    is_away_red_card_mismatch: isAwayRedCardMismatch,

    has_critical_inconsistency: hasCriticalInconsistency,
    block_reasons: blockReasons,
    summary_reason: summaryReason,
  };
}

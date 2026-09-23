/**
 * @file l0CircuitBreaker.ts
 * @description Layer 03 M2 子模块：L0 级绝对红线数据完整性校验（一票否决熔断）与 H2H 战术完整性双向客观门禁
 *
 * 从 contextEngine.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage } from '../02_canonical_model/enums.js';
import { LeisuRawH2HStats } from '../01_data_ingestion/leisu/types.js';
import {
  L0CircuitBreakerResult,
  L0MissingReason,
  Layer03OpId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

/**
 * 校验 L0 级不可缺失要素 (一票否决熔断器)
 * @param match CanonicalMatch 标准赛事
 * @param collector 缺陷收集器
 * @param tracer 链路追踪器
 */
export function checkL0CircuitBreaker(
  match: CanonicalMatch,
  collector?: DeficitCollector,
  tracer?: Tracer
): L0CircuitBreakerResult {
  tracer?.info(
    Layer03OpId.CLEAN_CONTEXT,
    'L0_CHECK',
    'Executing L0 Circuit Breaker validation',
    undefined,
    match.canonical_id
  );

  const reasons: L0MissingReason[] = [];
  const details: string[] = [];

  const isPrematch = match.timing.stage === MatchStage.PREMATCH;

  // 1. 检查比赛进行分钟数 (滚球必须有有效非负分钟)
  if (!isPrematch) {
    if (match.timing.minute === null || match.timing.minute === undefined || match.timing.minute < 0) {
      reasons.push(L0MissingReason.MINUTE_UNDEFINED);
      details.push('Live match missing valid elapsed minute in timing state');
    }
  }

  // 2. 检查客观比分及其校验状态
  if (!isPrematch) {
    if (
      match.score.home_score === null ||
      match.score.home_score === undefined ||
      match.score.away_score === null ||
      match.score.away_score === undefined
    ) {
      reasons.push(L0MissingReason.UNVERIFIED_SCORE);
      details.push('Live match score numbers are null or missing');
    } else if (!match.score.score_verified) {
      reasons.push(L0MissingReason.UNVERIFIED_SCORE);
      details.push('Live match score is not verified via canvas or reliable source');
    }
  }

  // 3. 检查 YBTY 标的盘口与赔率 (至少需要全场让球、全场大小球或全场独赢中的一个完整有效盘口)
  const hasSpread = !!(
    match.markets.full_spread_main &&
    match.markets.full_spread_main.home_odds > 1.0 &&
    match.markets.full_spread_main.away_odds > 1.0
  );
  const hasTotal = !!(
    match.markets.full_total_main &&
    match.markets.full_total_main.over_odds > 1.0 &&
    match.markets.full_total_main.under_odds > 1.0
  );
  const hasH2H = !!(
    match.markets.full_h2h &&
    match.markets.full_h2h.home_odds > 1.0 &&
    match.markets.full_h2h.away_odds > 1.0
  );

  if (!hasSpread && !hasTotal && !hasH2H) {
    reasons.push(L0MissingReason.TARGET_MARKET_MISSING);
    details.push('No valid full_spread_main, full_total_main, or full_h2h markets found in YBTY markets');
  }

  const isTriggered = reasons.length > 0;

  if (isTriggered && collector) {
    collector.record(
      'L0_CIRCUIT_BREAKER_TRIGGERED',
      Layer03OpId.CLEAN_CONTEXT,
      'RC-L0-FUSE',
      `Match ${match.canonical_id} triggered L0 Circuit Breaker: ${reasons.join(', ')}`,
      undefined,
      match.canonical_id
    );
  }

  return Object.freeze({
    is_triggered: isTriggered,
    reasons: reasons,
    details: details
  });
}

/**
 * 历史交锋全指标双向客观真实校验门禁 (Full-Metric Two-Way Tactical Integrity Gate)
 * 必须主客双方均有客观真实的攻防记录，均有角球数据，才能判定为有效深层战术对抗样本
 */
export function checkH2HTacticalIntegrity(
  homeStats: LeisuRawH2HStats | null | undefined,
  awayStats: LeisuRawH2HStats | null | undefined,
  cornerHome: number | undefined | null,
  cornerAway: number | undefined | null,
  daysAgo: number
): { isValid: boolean; reason?: string } {
  // 1. 战术时效性门禁：超过 730 天 (2年) 的深层攻防战术失去了人员教练连续性
  if (daysAgo > 730) {
    return { isValid: false, reason: 'EXCEEDS_MAX_TACTICAL_DAYS_730' };
  }
  // 2. 双向 stats 对象必须均存在且非空字典
  if (!homeStats || !awayStats || typeof homeStats !== 'object' || typeof awayStats !== 'object') {
    return { isValid: false, reason: 'MISSING_STATS_OBJECT' };
  }
  if (Object.keys(homeStats).length === 0 || Object.keys(awayStats).length === 0) {
    return { isValid: false, reason: 'EMPTY_STATS_OBJECT' };
  }

  // 3. 双向角球必须客观有效（非-1，且两队之和必须 >= 1）
  if (cornerHome == null || cornerAway == null || cornerHome < 0 || cornerAway < 0) {
    return { isValid: false, reason: 'INVALID_OR_MISSING_CORNERS' };
  }
  if (cornerHome + cornerAway === 0) {
    return { isValid: false, reason: 'ZERO_TOTAL_CORNERS_UNVERIFIED' };
  }

  // 4. 双向危险进攻必须真实客观存在且大于 0
  const daH = homeStats.dangerous_attack;
  const daA = awayStats.dangerous_attack;
  if (daH == null || daA == null || typeof daH !== 'number' || typeof daA !== 'number') {
    return { isValid: false, reason: 'MISSING_DANGEROUS_ATTACK' };
  }
  if (daH <= 0 || daA <= 0) {
    return { isValid: false, reason: 'NON_POSITIVE_DANGEROUS_ATTACK' };
  }

  // 5. 双向常规进攻必须真实客观存在且不低于危险进攻
  const attH = homeStats.attack;
  const attA = awayStats.attack;
  if (attH != null && attA != null) {
    if (attH <= 0 || attA <= 0 || attH < daH || attA < daA) {
      return { isValid: false, reason: 'ILLOGICAL_ATTACK_STATS' };
    }
  }

  // 6. 双向总射门必须客观真实且大于 0，且双方总射门 >= 3
  const shotsH = homeStats.shots;
  const shotsA = awayStats.shots;
  if (shotsH == null || shotsA == null || typeof shotsH !== 'number' || typeof shotsA !== 'number') {
    return { isValid: false, reason: 'MISSING_SHOTS' };
  }
  if (shotsH <= 0 || shotsA <= 0) {
    return { isValid: false, reason: 'NON_POSITIVE_SHOTS' };
  }
  if (shotsH + shotsA < 3) {
    return { isValid: false, reason: 'TOTAL_SHOTS_LESS_THAN_3' };
  }

  // 7. 双向控球率必须客观真实存在且符合守恒定律 (95% ~ 105%)
  const possH = homeStats.ball_possession;
  const possA = awayStats.ball_possession;
  if (possH == null || possA == null || typeof possH !== 'number' || typeof possA !== 'number') {
    return { isValid: false, reason: 'MISSING_BALL_POSSESSION' };
  }
  if (possH <= 0 || possA <= 0 || possH + possA < 95 || possH + possA > 105) {
    return { isValid: false, reason: 'INVALID_POSSESSION_CONSERVATION' };
  }

  return { isValid: true };
}


import { CanonicalMatch } from '../02_canonical_model/types.js';
import {
  CleanedContextFeatures,
  Layer03AuditCategory,
  Layer03AuditItem,
  Layer03DataAudit,
  Layer03ProductionGate,
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures
} from './types.js';

function item(
  category: Layer03AuditCategory,
  source: Layer03AuditItem['source'],
  status: Layer03AuditItem['status'],
  qualityScore: number,
  usedBy: string[],
  evidence: string[],
  defects: string[],
  details: Partial<Layer03AuditItem> = {}
): Layer03AuditItem {
  return Object.freeze({
    category,
    source,
    status,
    quality_score: Math.max(0, Math.min(100, qualityScore)),
    used_by: Object.freeze(usedBy),
    evidence: Object.freeze(evidence),
    defects: Object.freeze(defects),
    ...details
  });
}

function buildMomentumAudit(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures
): Layer03AuditItem {
  const raw = match.reference?.attack_momentum;
  const available = Boolean(raw?.available && raw.data && raw.data.length > 0);
  const defects: string[] = [];
  if (!available) defects.push('雷速没有可用的攻势动量点阵');
  if (available && (raw?.nominal_segment_minutes ?? null) === null) {
    defects.push('缺少点阵名义分钟间隔，5/10/15分钟窗口只能保留研究用途');
  }
  if (available && timeline.window_basis !== 'MINUTE_ALIGNED') {
    defects.push('当前窗口不是按真实分钟坐标计算');
  }
  const status = !available ? 'REJECTED' : defects.length > 0 ? 'DEGRADED' : 'USED';
  return item(
    'ATTACK_MOMENTUM',
    'LEISU',
    status,
    available ? (defects.length > 0 ? 60 : 90) : 0,
    ['M3 slope_5m/slope_10m/slope_15m', 'M3 momentum integrals', 'M3.5 threat trinity'],
    [
      `有效动量点数: ${timeline.total_points}`,
      `最近动量值: ${timeline.current_instant_momentum}`,
      `全场净积分: ${timeline.integral_full_match.net}`,
      `窗口样本数: 5m=${timeline.window_sample_counts?.five ?? 0}, 10m=${timeline.window_sample_counts?.ten ?? 0}, 15m=${timeline.window_sample_counts?.fifteen ?? 0}`
    ],
    defects,
    {
      sample_size: timeline.total_points,
      covered_minute_from: timeline.window_coverage_minutes?.from ?? null,
      covered_minute_to: timeline.window_coverage_minutes?.to ?? match.timing.minute,
      weight: timeline.total_points > 0 && timeline.window_basis === 'MINUTE_ALIGNED' ? 1 : 0
    }
  );
}

function buildStatsAudit(
  physical: RealTimePhysicalStatsFeatures
): Layer03AuditItem {
  const available = Object.values(physical.available_metrics).filter(Boolean).length;
  const total = Object.keys(physical.available_metrics).length;
  const defects = Object.entries(physical.available_metrics)
    .filter(([, isAvailable]) => !isAvailable)
    .map(([metric]) => `缺少实时统计: ${metric}`);
  const status = available === 0 ? 'REJECTED' : defects.length > 0 ? 'DEGRADED' : 'USED';
  return item(
    'LIVE_STATS',
    'LEISU',
    status,
    Math.round((available / Math.max(1, total)) * 100),
    ['M3 physical stats', 'M3.5 stats_support', 'data quality score'],
    [`${available}/${total} 项统计可用`, `统计基线: ${physical.stats_basis}`],
    defects,
    { weight: available / Math.max(1, total) }
  );
}

export function buildLayer03DataAudit(
  match: CanonicalMatch,
  context: CleanedContextFeatures,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures
): Layer03DataAudit {
  const reference = match.reference;
  const events = reference?.timeline_events ?? [];
  const timedEvents = events.filter((event) => Number.isFinite(event.minute));
  const h2h = context.h2h_analytics;
  const recentHome = context.recent_form_analytics.home;
  const recentAway = context.recent_form_analytics.away;
  const hasLineups = Boolean(reference?.lineups);
  const hasStandings = Boolean(reference?.league_standings?.has_data);
  const hasGoalDistribution = context.goal_distribution_dna.has_data;
  const hasOdds = Boolean(reference?.odds_matrix);
  const hasEnvironment = Boolean(reference?.environment);

  const items: Layer03AuditItem[] = [
    buildMomentumAudit(match, timeline),
    buildStatsAudit(physical),
    item(
      'TIMELINE_EVENTS',
      'LEISU',
      timedEvents.length > 0 ? 'USED' : 'DEGRADED',
      timedEvents.length > 0 ? 85 : 35,
      ['M3.5 event decay', 'tactical regime', 'goal climax'],
      [`原始事件数: ${events.length}`, `有明确分钟的事件数: ${timedEvents.length}`],
      timedEvents.length > 0 ? [] : ['没有带明确分钟的事件可用于时间衰减'],
      { sample_size: timedEvents.length, covered_minute_to: match.timing.minute, weight: timedEvents.length > 0 ? 1 : 0.35 }
    ),
    item(
      'LINEUPS',
      'LEISU',
      !hasLineups ? 'DEGRADED' : context.lineup_impact.is_lineup_confirmed ? 'USED' : 'DEGRADED',
      context.lineup_impact.is_lineup_confirmed ? 90 : 45,
      ['M2 lineup impact', 'prematch prior'],
      [`阵容状态: ${context.lineup_impact.lineup_status}`],
      !hasLineups ? ['缺少阵容对象'] : context.lineup_impact.is_lineup_confirmed ? [] : ['首发未确认，不能视为确定性阵容'],
      { weight: context.lineup_impact.is_lineup_confirmed ? 1 : 0.35 }
    ),
    item(
      'H2H',
      'LEISU',
      h2h.tactical_valid_count > 0 ? 'USED' : h2h.valid_count > 0 ? 'DEGRADED' : 'REJECTED',
      h2h.tactical_valid_count > 0 ? 80 : h2h.valid_count > 0 ? 45 : 0,
      ['M2 H2H decay', 'prematch prior'],
      [`原始样本: ${h2h.sample_count}`, `有效比分样本: ${h2h.valid_count}`, `有效战术样本: ${h2h.tactical_valid_count}`],
      h2h.valid_count > 0 ? [] : ['没有通过时间和比分门禁的交锋样本'],
      { sample_size: h2h.valid_count, weight: h2h.valid_count > 0 ? 0.15 : 0 }
    ),
    item(
      'RECENT_FORM',
      'LEISU',
      recentHome.valid_count > 0 && recentAway.valid_count > 0 ? 'USED' : 'DEGRADED',
      recentHome.valid_count > 0 && recentAway.valid_count > 0 ? 75 : 30,
      ['M2 recent form', 'prematch prior'],
      [`主队有效样本: ${recentHome.valid_count}/${recentHome.sample_count}`, `客队有效样本: ${recentAway.valid_count}/${recentAway.sample_count}`],
      recentHome.valid_count > 0 && recentAway.valid_count > 0 ? [] : ['至少一队没有通过时间和比分门禁的近期样本'],
      { sample_size: Math.min(recentHome.valid_count, recentAway.valid_count), weight: recentHome.valid_count > 0 && recentAway.valid_count > 0 ? 1 : 0.25 }
    ),
    item(
      'STANDINGS',
      'LEISU',
      hasStandings ? 'USED' : 'DEGRADED',
      hasStandings ? 70 : 20,
      ['M2 iso-venue standings', 'M2 motivation urgency'],
      [hasStandings ? '积分榜标记为可用' : '没有有效积分榜数据'],
      hasStandings ? [] : ['缺少积分榜，战意仅能保持中性或降级'],
      { weight: hasStandings ? 0.1 : 0 }
    ),
    item(
      'GOAL_DISTRIBUTION',
      'LEISU',
      !hasGoalDistribution ? 'REJECTED' : context.goal_timing_validity.is_valid_sample ? 'USED' : 'DEGRADED',
      !hasGoalDistribution ? 0 : context.goal_timing_validity.is_valid_sample ? 75 : 35,
      ['M2 goal timing DNA', 'M4 phased decay'],
      [`有效样本数: ${context.goal_timing_validity.sample_count}`],
      !hasGoalDistribution
        ? ['没有进球分布数据']
        : context.goal_timing_validity.requires_bayesian_shrinkage
          ? ['样本不足8场，已要求贝叶斯收缩；来源未提供异常比赛明细']
          : [],
      { sample_size: context.goal_timing_validity.sample_count, weight: context.goal_timing_validity.is_valid_sample ? 1 : 0 }
    ),
    item(
      'ODDS_MATRIX',
      'LEISU',
      hasOdds ? 'DEGRADED' : 'REJECTED',
      hasOdds ? 55 : 0,
      ['market calibration prior only'],
      [hasOdds ? '雷速赔率矩阵存在' : '没有雷速赔率矩阵'],
      hasOdds ? ['当前实现尚未证明 initial/pregame/live 的时间点完整一致'] : ['缺少雷速参考赔率'],
      { weight: hasOdds ? 0.15 : 0 }
    ),
    item(
      'ENVIRONMENT',
      'LEISU',
      hasEnvironment ? 'DEGRADED' : 'NOT_APPLICABLE',
      hasEnvironment ? 40 : 0,
      [],
      [hasEnvironment ? '环境对象已保存' : '没有环境数据'],
      ['当前版本尚未将天气/场地接入 λ 计算'],
      { weight: 0 }
    )
  ];

  const blocked = items.some((auditItem) => auditItem.status === 'REJECTED' && auditItem.category === 'LIVE_STATS');
  const degraded = items.some((auditItem) => auditItem.status === 'DEGRADED');
  return Object.freeze({
    generated_at: new Date().toISOString(),
    canonical_id: match.canonical_id,
    match_stage: match.timing.stage,
    source_snapshot_at: match.created_at || null,
    overall_status: blocked ? 'BLOCKED' : degraded ? 'DEGRADED' : 'PASS',
    items: Object.freeze(items)
  });
}

export function buildLayer03ProductionGate(
  match: CanonicalMatch,
  audit: Layer03DataAudit,
  hasValidatedOosCandidate: boolean
): Layer03ProductionGate {
  const blockers: string[] = [];
  const alignment = match.alignment?.status;
  if (alignment !== 'MATCHED_BY_ALIAS' && alignment !== 'MATCHED_AUTO') {
    blockers.push('赛事对齐未达到 MATCHED_BY_ALIAS/MATCHED_AUTO');
  }
  if (match.timing.stage === 'LIVE') {
    if (match.timing.minute === null || !Number.isInteger(match.timing.minute)) {
      blockers.push('滚球缺少 YBTY 权威分钟');
    }
    if (!match.score.score_verified) {
      blockers.push('滚球比分未通过可靠来源核验');
    }
  }
  const hasExecutionMarket = Boolean(
    match.markets.full_h2h ||
    match.markets.full_spread_main ||
    match.markets.full_total_main
  );
  if (!hasExecutionMarket) blockers.push('缺少 YBTY 可执行主盘口');
  if (audit.overall_status === 'BLOCKED') blockers.push('Layer 03 数据审计已阻断');

  const calculationStatus = blockers.length > 0
    ? 'BLOCKED'
    : audit.overall_status === 'PASS'
      ? 'PRODUCTION_READY'
      : 'RESEARCH_ONLY';
  const candidateStatus = calculationStatus === 'BLOCKED'
    ? 'DATA_LOCKED'
    : hasValidatedOosCandidate
      ? 'UNLOCKED'
      : 'OOS_LOCKED';

  if (!hasValidatedOosCandidate) {
    blockers.push('没有满足门槛的 VALIDATED OOS 校准档案；只能输出研究结果');
  }
  return Object.freeze({
    calculation_status: calculationStatus,
    candidate_status: candidateStatus,
    blockers: Object.freeze(blockers),
    oos_requirement: '正式 machine candidate 需要对应盘口 VALIDATED 且有效样本数 >= 200'
  });
}

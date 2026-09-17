/**
 * @file eventMomentumFusion.ts
 * @description Layer 03 M3.5: 时空事件共生与攻防转换动态建模引擎 (Spatio-Temporal Event Co-Evolution)
 * 
 * 核心职责：
 * 1. 攻防势能转化指数 (Event Pressure Conversion Index, EPI):
 *    - 严格杜绝“无效控球/干打雷不下雨”的伪优势；
 *    - 评估时序危攻动量积分与实质事件 (角球、射门、射正、绝佳机会、进球) 的转化比率；
 *    - 划分 LETHAL_SIEGE (致命压迫), BARREN_DOMINANCE (虚火无效控球), CLINICAL_COUNTER (高效反击), LOW_ENGAGEMENT (消极胶着)。
 * 2. 战术相变与事件后态势 (Tactical Regime Shift):
 *    - 追踪进球/红牌后 15 分钟内的战术响应；
 *    - 识别领先后收缩防反 (PARK_THE_BUS)、落后绝境反扑 (DESPERATE_CHASE)、少打一人收缩、以及两球领先后节奏放缓。
 * 3. 破门临界态探测 (Goal Climax Tipping Point):
 *    - 融合近 5 分钟动量二阶加速度 (d²M/dt²)、高密度事件触发与防线崩溃征兆，输出 [0, 100] 的破门势能分值。
 * 
 * 遵循红线：纯函数无副作用 (No In-Place Mutation)、强类型零 any、完全可测试。
 */

import { CanonicalMatch, CanonicalTimelineEvent } from '../02_canonical_model/types.js';
import {
  MatchStage,
  CanonicalEventType,
  CanonicalIncidentCategory
} from '../02_canonical_model/enums.js';
import {
  MomentumTimelineFeatures,
  RealTimePhysicalStatsFeatures,
  EventPressureConversionFeatures,
  TeamEPIFeatures,
  LiveThreatTrinityFeatures,
  EventPressureConversionType,
  TacticalRegimeFeatures,
  TacticalRegimeType,
  YellowCardContextType,
  GoalClimaxFeatures,
  GoalClimaxLevel,
  SpatioTemporalEventFeatures,
  Layer03OpId,
  Layer03FeatureId
} from './types.js';
import { DeficitCollector } from '../00_common/DeficitCollector.js';
import { Tracer } from '../00_common/Tracer.js';

/**
 * 辅助函数：安全提取事件归属方
 */
function getEventSide(event: CanonicalTimelineEvent): 'home' | 'away' | 'neutral' {
  return event.side;
}

/**
 * 辅助函数：安全提取事件分钟数
 */
function getEventMinute(event: CanonicalTimelineEvent): number | null {
  return Number.isFinite(event.minute) ? event.minute! : null;
}

/**
 * 黄牌语义与战术情境分类器 (SSOT)
 * 严格区分：
 * 1. TACTICAL_DISRUPTION: 战术牺牲犯规（阻断快攻/合理延缓，不判定为防守能力下降，漏洞乘子严格为 1.00）
 * 2. DEFENSIVE_COLLAPSE_BREACH: 受迫失位高危犯规（后防被动挨打/禁区边缘犯规，计入 10m 崩盘池）
 * 3. NON_TACTICAL_DISSENT: 非战术情绪/违纪（拖延时间/抗议裁判/脱衣庆祝，零防守漏洞）
 * 4. ROUTINE_TECHNICAL_FOUL: 常规拼抢争顶犯规
 */
export function classifyYellowCardContext(
  event: CanonicalTimelineEvent,
  options?: {
    playerRole?: 'DF' | 'GK' | 'MF' | 'FW' | null;
    oppMomentumLead?: number;
    oppRecentShots10m?: number;
    oppRecentCorners10m?: number;
  }
): YellowCardContextType {
  const isYellow = event.canonical_type === CanonicalEventType.YELLOW_CARD || event.type === 3;
  const reason = String(event.text || '').toLowerCase();
  if (!isYellow && !reason.includes('黄牌') && !reason.includes('yellow')) {
    return YellowCardContextType.ROUTINE_TECHNICAL_FOUL;
  }

  // 1. 替补席/教练席或离场人员吃牌，直接归为非战术违纪
  if (event.is_on_pitch === false) {
    return YellowCardContextType.NON_TACTICAL_DISSENT;
  }

  // 2. 非战术情绪性 / 拖延时间黄牌 (Non-tactical Dissent / Time Waste)
  const isEmotionalOrDissent = /dissent|argument|delay|time\s*waste|time\s*wasting|shirt|celebrat|争吵|抗议|抱怨|拖延|时间|延误|脱衣|庆祝/i.test(reason);
  if (isEmotionalOrDissent) {
    return YellowCardContextType.NON_TACTICAL_DISSENT;
  }

  // 3. 战术牺牲犯规判定 (Tactical Disruption Foul)
  // 3.1 明确文本标识（战术犯规、拉拽战术球衣、破坏反击等）
  const isExplicitTactical = /tactical|pull|holding|breakaway|counter|trip|cynical|战术|反击|拉拽|阻断|故意拉扯|破坏快攻/i.test(reason);
  if (isExplicitTactical) {
    return YellowCardContextType.TACTICAL_DISRUPTION;
  }

  // 4. 防线受迫失位高危犯规判定 (Defensive Collapse Under Siege)
  // 当处于对方高强度围攻压制下，后防核心 (DF/GK) 染黄，或发生禁区边缘高危失守犯规
  const isDangerousAreaFoul = /dangerous|box|penalty area|last man|sliding|reckless|铲球|禁区|防线失守|单刀阻截|禁区前|禁区内|绊倒/i.test(reason);
  const isDefender = options?.playerRole === 'DF' || options?.playerRole === 'GK';
  const oppUnderSiege = (options?.oppRecentShots10m ?? 0) >= 2 ||
                        (options?.oppRecentCorners10m ?? 0) >= 2 ||
                        (options?.oppMomentumLead ?? 0) >= 30;

  if ((isDefender && oppUnderSiege) || isDangerousAreaFoul) {
    return YellowCardContextType.DEFENSIVE_COLLAPSE_BREACH;
  }

  // 3.2 如果在中前场且对方处于反击推进中（对手有净动量正值），判定为合理战术延缓
  const isMidOrForward = options?.playerRole === 'MF' || options?.playerRole === 'FW';
  if (isMidOrForward && (options?.oppMomentumLead ?? 0) > 0) {
    return YellowCardContextType.TACTICAL_DISRUPTION;
  }

  // 5. 常规争抢犯规
  return YellowCardContextType.ROUTINE_TECHNICAL_FOUL;
}

/**
 * 计算单个进攻相关事件的物理威胁基准度 (非进攻性质的纪律牌归零，杜绝威胁方向反向误增)
 */
function getEventThreatWeight(event: CanonicalTimelineEvent): number {
  if (event.is_cancelled || event.is_var_overturned) return 0.0;

  // 1. 进球类
  if (
    event.category === CanonicalIncidentCategory.SCORE ||
    event.canonical_type === CanonicalEventType.GOAL_REGULAR ||
    event.canonical_type === CanonicalEventType.GOAL_PENALTY ||
    event.type === 1
  ) {
    return 3.0;
  }

  // 2. 点球类
  if (
    event.canonical_type === CanonicalEventType.PENALTY_MISSED ||
    event.is_penalty
  ) {
    return 2.5;
  }

  // 3. 纪律事件：吃牌方绝不增加自身进攻威胁（由 calculateDecayedEventScore 专门处理攻守流向）
  if (
    event.canonical_type === CanonicalEventType.RED_CARD_DIRECT ||
    event.canonical_type === CanonicalEventType.RED_CARD_SECOND_YELLOW ||
    event.canonical_type === CanonicalEventType.YELLOW_CARD ||
    event.type === 4 ||
    event.type === 3
  ) {
    return 0.0;
  }

  // 4. 战术角球与射正
  if (
    event.canonical_type === CanonicalEventType.CORNER ||
    event.type === 2
  ) {
    return 0.70;
  }

  if (
    event.canonical_type === CanonicalEventType.SHOT_ON_TARGET ||
    event.type === 21
  ) {
    return 1.5;
  }

  if (
    event.canonical_type === CanonicalEventType.SUBSTITUTION ||
    event.canonical_type === CanonicalEventType.INJURY_SUB ||
    event.type === 9
  ) {
    return 0.3;
  }

  return 0.2;
}

/**
 * 计算带时间半衰期指数衰减的事件威胁积分
 * 严格修正事件因果流向：吃牌方绝不增加自身进攻积分；受迫失位高危犯规计入攻方突破造险
 * @param events 事件数组
 * @param currentMinute 当前比赛进行分钟
 * @param halfLife 半衰期（分钟，默认 15 分钟）
 */
export function calculateDecayedEventScore(
  events: CanonicalTimelineEvent[],
  currentMinute: number,
  halfLife: number = 15
): { home: number; away: number } {
  let homeScore = 0.0;
  let awayScore = 0.0;

  for (const ev of events) {
    if (ev.is_cancelled || ev.is_var_overturned) continue;
    const m = getEventMinute(ev);
    if (m === null || m > currentMinute) continue;

    const deltaT = Math.max(0, currentMinute - m);
    // 指数时间衰减权重 e^(-deltaT / halfLife)
    const decayWeight = Math.exp(-deltaT / halfLife);
    const side = getEventSide(ev);

    // 1. 红牌事件：少打一人，其对手获得前场压迫推进优势（而非吃红牌方增加进攻威胁）
    const isRed = ev.canonical_type === CanonicalEventType.RED_CARD_DIRECT ||
                  ev.canonical_type === CanonicalEventType.RED_CARD_SECOND_YELLOW ||
                  ev.type === 4;
    if (isRed) {
      const oppSide = side === 'home' ? 'away' : (side === 'away' ? 'home' : 'neutral');
      if (oppSide === 'home') homeScore += 1.50 * decayWeight;
      else if (oppSide === 'away') awayScore += 1.50 * decayWeight;
      continue;
    }

    // 2. 黄牌事件：区分战术犯规、非战术情绪与受迫失位
    const isYellow = ev.canonical_type === CanonicalEventType.YELLOW_CARD || ev.type === 3;
    if (isYellow) {
      const yellowCtx = classifyYellowCardContext(ev);
      if (yellowCtx === YellowCardContextType.DEFENSIVE_COLLAPSE_BREACH) {
        // 受迫失位高危犯规：对手在进攻压迫中制造危险定位球/前场突破，计入对手的前场造险积分
        const oppSide = side === 'home' ? 'away' : (side === 'away' ? 'home' : 'neutral');
        if (oppSide === 'home') homeScore += 0.40 * decayWeight;
        else if (oppSide === 'away') awayScore += 0.40 * decayWeight;
      }
      // 战术犯规 (TACTICAL_DISRUPTION)、非战术情绪黄牌 (NON_TACTICAL_DISSENT) 与常规争抢均不计入前场进攻威胁
      continue;
    }

    // 3. 常规进攻与技术事件
    const baseWeight = getEventThreatWeight(ev);
    const effectiveWeight = baseWeight * decayWeight;

    if (side === 'home') {
      homeScore += effectiveWeight;
    } else if (side === 'away') {
      awayScore += effectiveWeight;
    }
  }

  return {
    home: Number(homeScore.toFixed(3)),
    away: Number(awayScore.toFixed(3))
  };
}

function isGoalEvent(event: CanonicalTimelineEvent): boolean {
  return event.category === CanonicalIncidentCategory.SCORE ||
    event.canonical_type === CanonicalEventType.GOAL_REGULAR ||
    event.canonical_type === CanonicalEventType.GOAL_PENALTY ||
    (event as { type?: string | number }).type === 'GOAL' ||
    (event as { type?: string | number }).type === 1;
}

/** 三源一致性求解：不把累计统计伪装成近窗增量，只作为按时间归一化的质量基线。 */
export function calculateLiveThreatTrinity(
  timeline: MomentumTimelineFeatures,
  events: CanonicalTimelineEvent[],
  physical: RealTimePhysicalStatsFeatures,
  currentMinute: number
): LiveThreatTrinityFeatures {
  const eventScores = calculateDecayedEventScore(events, currentMinute, 15);
  const bounded = (value: number) => Math.max(0, Math.min(1, value));
  const solveTeam = (side: 'home' | 'away') => {
    const energy = (timeline.integral_15m?.[side] ?? timeline.integral_5m?.[side] ?? 0) as number;
    const eventScore = eventScores[side];
    const xt = (side === 'home' ? physical.xt_proxy?.home_xt : physical.xt_proxy?.away_xt) ?? 0;
    const penetration = (side === 'home' ? physical.penetration_rate?.home_penetration : physical.penetration_rate?.away_penetration) ?? 0;
    const accuracy = (side === 'home' ? physical.shot_efficiency?.home_accuracy : physical.shot_efficiency?.away_accuracy) ?? 0;
    const corners = (physical.corner_pressure?.window_source === 'SNAPSHOT_DELTA' || physical.corner_pressure?.window_source === 'EVENT_TIMELINE')
      ? ((side === 'home' ? physical.corner_pressure.home_corners_total : physical.corner_pressure.away_corners_total) ?? 0) : 0;
    const momentumSupport = bounded(1 - Math.exp(-Math.max(0, energy) / 150));
    // An empty key-event window is not proof of zero attacking threat: feeds
    // commonly omit non-scoring attacks. Keep silence as weak evidence.
    const eventSupport = eventScore > 0
      ? bounded(1 - Math.exp(-eventScore / 2.2))
      : 0.35;
    const pe = (side === 'home' ? physical.possession_effectiveness?.home_pe : physical.possession_effectiveness?.away_pe) ?? 0;
    const tti = (side === 'home' ? physical.threat_transformation_index?.home_tti : physical.threat_transformation_index?.away_tti) ?? 0;
    // 提升角球权重至 0.20 (现代 xG 理论标准)，并与渗透率及转化指数结合
    const rawStatsValue = xt * 0.25 + penetration * 1.0 + accuracy * 1.2 + corners * 0.20 + tti * 0.20 + pe * 0.20;
    // 比赛前35分钟射门与角球基数处于自然累积期，引入平滑基准，避免因样本未满而将正常控球推进误判为重大冲突
    const earlyPhaseBaseline = (currentMinute > 0 && currentMinute < 35) ? Math.max(0, 0.25 * (1 - currentMinute / 35.0)) : 0;
    const statsSupport = physical.stats_available
      ? bounded(Math.max(earlyPhaseBaseline, 1 - Math.exp(-Math.max(0, rawStatsValue)))) : 0;
    const activeSupports = physical.stats_available
      ? [momentumSupport, eventSupport, statsSupport]
      : [momentumSupport, eventSupport];
    const minSupport = Math.min(...activeSupports);
    const maxSupport = Math.max(...activeSupports);
    const alignmentScore = bounded(1 - (maxSupport - minSupport));
    // 仅在比赛进入中后段(>=30分钟)且极端高动量长期得不到任何事件与数据支持时，方判定为实质性冲突
    const conflict = momentumSupport >= 0.70 && currentMinute >= 30 && (eventSupport < 0.15 || (physical.stats_available && statsSupport < 0.15));
    const baseThreat = physical.stats_available
      ? (0.45 * momentumSupport + 0.30 * eventSupport + 0.25 * statsSupport)
      : (0.60 * momentumSupport + 0.40 * eventSupport);
    // Conflicting feeds increase uncertainty without turning every mismatch
    // into a deterministic low-scoring signal.
    const alignmentFactor = conflict ? 1.0 : (0.55 + 0.45 * alignmentScore);
    const conflictDamping = conflict ? 0.95 : 1.0;
    const calibratedThreat = bounded(baseThreat * alignmentFactor * conflictDamping);
    return {
      momentum_support: Number(momentumSupport.toFixed(3)),
      event_support: Number(eventSupport.toFixed(3)),
      stats_support: Number(statsSupport.toFixed(3)),
      alignment_score: Number(alignmentScore.toFixed(3)),
      calibrated_threat: Number(calibratedThreat.toFixed(3)),
      has_conflict: conflict
    };
  };
  const home = solveTeam('home');
  const away = solveTeam('away');
  const dominant_side = home.calibrated_threat > away.calibrated_threat + 0.08 ? 'home' : away.calibrated_threat > home.calibrated_threat + 0.08 ? 'away' : 'none';
  const hasMaterialConflict = home.has_conflict || away.has_conflict;
  return {
    home,
    away,
    dominant_side,
    has_material_conflict: hasMaterialConflict,
    rationale: hasMaterialConflict ? ['高危攻动量未获近窗事件或统计质量基线共同确认，已执行威胁折损。'] : ['动量、事件与技术统计质量基线已进入同一威胁校准链。']
  };
}

/**
 * 维度一：计算攻防势能转化指数 (EPI)
 * 采用近 15 分钟时间窗口与全时序多尺度衰减走势联合评估，防止中场或比赛间隙时将全场时序事件截断导致假性虚假繁荣 (BARREN_DOMINANCE)
 */
export function calculateEventPressureConversion(
  timeline: MomentumTimelineFeatures,
  events: CanonicalTimelineEvent[],
  trinity: LiveThreatTrinityFeatures,
  currentMinute: number,
  physical?: RealTimePhysicalStatsFeatures
): EventPressureConversionFeatures {
  // 方案 6：多源截断与自适应时间窗口调和
  // 当开场时间较短 (如 currentMinute = 7' < 15') 时，有效窗口长度收缩为 [0, currentMinute]
  const effectiveWindowDuration = Math.min(15, Math.max(1, currentMinute));
  const windowStart = Math.max(0, currentMinute - effectiveWindowDuration);

  // 严格物理截断：任何超出当前权威时钟的未来事件一律剔除
  const recentEvents = events.filter(e => {
    const m = getEventMinute(e);
    return m !== null && m >= windowStart && m <= currentMinute && !e.is_cancelled && !e.is_var_overturned;
  });

  // 1. 统计近 15 分钟双方事件加权总分 (带时效半衰期) 与全时序连续衰减事件总分 (严格 <= currentMinute)
  const decayedScores15m = calculateDecayedEventScore(recentEvents, currentMinute, 15);
  const fullDecayedScores = calculateDecayedEventScore(
    events.filter(e => {
      const m = getEventMinute(e);
      return m !== null && m <= currentMinute && !e.is_cancelled && !e.is_var_overturned;
    }),
    currentMinute,
    15
  );
  const homeEventScore = decayedScores15m.home;
  const awayEventScore = decayedScores15m.away;
  const homeFullEventScore = fullDecayedScores.home;
  const awayFullEventScore = fullDecayedScores.away;

  // 2. 获取近 15 分钟危攻能量
  const homeEnergy = timeline.integral_15m ? timeline.integral_15m.home : 0;
  const awayEnergy = timeline.integral_15m ? timeline.integral_15m.away : 0;

  // 3. 计算转化比率: 自适应能量基准调整
  // 标准 15m 窗口下，平均 50 点危攻能量为 1 个基准单位；
  // 开场早期样本不足时，自适应调整能量基准为 50.0 * (effectiveWindowDuration / 15.0)，杜绝分母假放大
  const windowScale = effectiveWindowDuration / 15.0;
  const adaptiveEnergyBase = Math.max(10.0, 50.0 * windowScale);

  const homeNormEnergy = Math.max(1.0, homeEnergy / adaptiveEnergyBase);
  const awayNormEnergy = Math.max(1.0, awayEnergy / adaptiveEnergyBase);

  const homeRatio = Number((homeEventScore / homeNormEnergy).toFixed(3));
  const awayRatio = Number((awayEventScore / awayNormEnergy).toFixed(3));

  const homeTTI = physical?.threat_transformation_index?.home_tti;
  const awayTTI = physical?.threat_transformation_index?.away_tti;
  const homeTTIClass = physical?.threat_transformation_index?.classification?.home;
  const awayTTIClass = physical?.threat_transformation_index?.classification?.away;

  // 4. 连续隶属度战术类型软分类 (Continuous Membership Soft Classification)
  // 结合全场时序事件走势 (fullDecayedScore) 与 TTI 真实穿透转化指数
  const classify = (
    energy: number,
    score: number,
    ratio: number,
    integrity: number,
    conflict: boolean,
    fullDecayedScore: number,
    sideTTI?: number,
    sideTTIClass?: 'LETHAL_PENETRATION' | 'EFFECTIVE_ATTACK' | 'STERILE_POSSESSION' | 'LOW_ACTIVITY'
  ): EventPressureConversionType => {
    // 连续 Sigmoid 激活函数 S(x, x0, k)
    const sig = (x: number, x0: number, k: number) => 1.0 / (1.0 + Math.exp(-(x - x0) / k));

    // 结合全场时序事件支撑（如 27 分钟进球）：提供平滑的时序事件转化补偿与得分支撑
    const effectiveRatio = Math.max(ratio, Math.min(1.0, fullDecayedScore / 1.5));
    const effectiveScore = Math.max(score, fullDecayedScore * 0.8);

    // TTI 物理特征加成
    let ttiLethalBonus = 1.0;
    let ttiBarrenMultiplier = 1.0;
    if (sideTTIClass === 'LETHAL_PENETRATION' || (typeof sideTTI === 'number' && sideTTI >= 2.0)) {
      ttiLethalBonus = 1.0 + Math.min(0.40, ((sideTTI ?? 2.0) - 1.0) * 0.15);
      ttiBarrenMultiplier = 0.60;
    } else if (sideTTIClass === 'STERILE_POSSESSION' || (energy >= 100 && typeof sideTTI === 'number' && sideTTI < 0.8)) {
      ttiBarrenMultiplier = 1.35;
      ttiLethalBonus = 0.70;
    }

    const pLethal = sig(energy, 150, 25) * sig(effectiveRatio, 0.70, 0.12) * sig(integrity, 0.55, 0.12) * ttiLethalBonus;

    // 虚假繁荣 (BARREN_DOMINANCE) 核心特征是“空有危攻/控球，但全场时序缺乏转化”
    // 若全场时序已有实质事件且尚未完全湮灭（fullDecayedScore > 0），则按其显著度指数压制虚假繁荣的误判
    const barrenSuppression = Math.exp(-fullDecayedScore / 0.45);
    const pBarren = sig(energy, 150, 25) * (1.0 - sig(effectiveRatio, 0.40, 0.12)) * (conflict ? 1.35 : 1.0) * barrenSuppression * ttiBarrenMultiplier;

    const pCounter = (1.0 - sig(energy, 130, 25)) * sig(effectiveScore, 1.20, 0.35);
    const pLow = (1.0 - sig(energy, 60, 18)) * (1.0 - sig(effectiveScore, 0.60, 0.20));
    const pBalanced = 0.20; // 基础均衡先验

    const scores = [
      { type: EventPressureConversionType.LETHAL_SIEGE, val: pLethal },
      { type: EventPressureConversionType.BARREN_DOMINANCE, val: pBarren },
      { type: EventPressureConversionType.CLINICAL_COUNTER, val: pCounter },
      { type: EventPressureConversionType.LOW_ENGAGEMENT, val: pLow },
      { type: EventPressureConversionType.BALANCED_CONTEST, val: pBalanced }
    ];

    scores.sort((a, b) => b.val - a.val);
    return scores[0].type;
  };

  const homeTeam: TeamEPIFeatures = {
    conversion_ratio: homeRatio,
    event_score_15m: Number(homeEventScore.toFixed(2)),
    energy_15m: homeEnergy,
    classification: classify(homeEnergy, homeEventScore, homeRatio, trinity.home.calibrated_threat, trinity.home.has_conflict, homeFullEventScore, homeTTI, homeTTIClass)
  };

  const awayTeam: TeamEPIFeatures = {
    conversion_ratio: awayRatio,
    event_score_15m: Number(awayEventScore.toFixed(2)),
    energy_15m: awayEnergy,
    classification: classify(awayEnergy, awayEventScore, awayRatio, trinity.away.calibrated_threat, trinity.away.has_conflict, awayFullEventScore, awayTTI, awayTTIClass)
  };

  return {
    home: homeTeam,
    away: awayTeam,
    potency_differential: Number((homeRatio - awayRatio).toFixed(3))
  };
}

// ============================================================================
// 10 分钟滑动窗口角球与射门聚类爆发计算引擎 (Sliding Window High-Threat Cluster)
// ============================================================================
export interface BurstClusterResult {
  home: {
    corners_3m: number;
    corners_7m: number;
    corners_10m: number;
    shots_5m: number;
    shots_10m: number;
    has_corner_barrage: boolean;
    has_shot_salvo: boolean;
    burst_multiplier: number;
  };
  away: {
    corners_3m: number;
    corners_7m: number;
    corners_10m: number;
    shots_5m: number;
    shots_10m: number;
    has_corner_barrage: boolean;
    has_shot_salvo: boolean;
    burst_multiplier: number;
  };
}

/**
 * 计算 10 分钟滑动窗口角球与密集射门聚类爆发因子
 * 现代 xG 理论与防线窒息动力学：
 * 1. 连续角球簇 (Corner Barrage): ≤3m内累计 2 个角球 (+30% 瞬时进球危险度), 或 ≤7m内累计 3 个角球 (+35% 危险度)
 * 2. 密集射门浪潮 (Shot Salvo): ≤5m内累计 2 次射正/射门 (+25% 瞬时进球危险度)
 * 3. 10m 复合聚类爆发乘子: 动态提振即时进球期望
 */
export function calculate10mBurstCluster(
  events: CanonicalTimelineEvent[],
  currentMinute: number
): BurstClusterResult {
  const isCornerEvent = (e: CanonicalTimelineEvent) =>
    e.canonical_type === CanonicalEventType.CORNER || e.type === 2;
  const isShotEvent = (e: CanonicalTimelineEvent) =>
    e.canonical_type === CanonicalEventType.SHOT_ON_TARGET || e.type === 21 || e.canonical_type === CanonicalEventType.SHOT_OFF_TARGET;

  const validEvents = events.filter((e: CanonicalTimelineEvent) => {
    const m = getEventMinute(e);
    return m !== null && m <= currentMinute && !e.is_cancelled && !e.is_var_overturned;
  });

  const analyzeSide = (side: 'home' | 'away') => {
    const sideEvents = validEvents.filter(e => getEventSide(e) === side);

    const corners = sideEvents.filter(isCornerEvent);
    const corners3m = corners.filter(e => currentMinute - (getEventMinute(e) ?? 0) <= 3).length;
    const corners7m = corners.filter(e => currentMinute - (getEventMinute(e) ?? 0) <= 7).length;
    const corners10m = corners.filter(e => currentMinute - (getEventMinute(e) ?? 0) <= 10).length;

    const shots = sideEvents.filter(isShotEvent);
    const shots5m = shots.filter(e => currentMinute - (getEventMinute(e) ?? 0) <= 5).length;
    const shots10m = shots.filter(e => currentMinute - (getEventMinute(e) ?? 0) <= 10).length;

    const hasCornerBarrage = corners3m >= 2 || corners7m >= 3;
    const hasShotSalvo = shots5m >= 2;

    let burstMult = 1.0;
    if (hasCornerBarrage) burstMult += 0.30;
    if (hasShotSalvo) burstMult += 0.25;
    // 累加 10m 密度轻微自然提振 (最高 0.20)
    burstMult += Math.min(0.20, corners10m * 0.04 + shots10m * 0.05);

    return {
      corners_3m: corners3m,
      corners_7m: corners7m,
      corners_10m: corners10m,
      shots_5m: shots5m,
      shots_10m: shots10m,
      has_corner_barrage: hasCornerBarrage,
      has_shot_salvo: hasShotSalvo,
      burst_multiplier: Number(Math.min(1.65, burstMult).toFixed(3))
    };
  };

  return {
    home: analyzeSide('home'),
    away: analyzeSide('away')
  };
}

/**
 * 维度二：计算战术相变与事件后态势 (Tactical Regime)
 * 物理原理：
 * 构建连续平滑的战术相变张量场 (Continuous Tactical Regime Field)，
 * 消除离散分差与分钟数的硬编码阶跃。
 */
export function evaluateTacticalRegime(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures,
  epi: EventPressureConversionFeatures,
  physical: RealTimePhysicalStatsFeatures
): TacticalRegimeFeatures {
  const currentMinute = Math.max(0, (match.timing.minute ?? 0));
  const rawEvents = match.reference?.timeline_events ?? [];
  // 严格过滤未来事件与无效事件
  const events = rawEvents.filter(e => {
    const m = getEventMinute(e);
    return m !== null && m <= currentMinute && !e.is_cancelled && !e.is_var_overturned;
  });
  const homeScore = match.score.home_score ?? 0;
  const awayScore = match.score.away_score ?? 0;
  const scoreDiff = homeScore - awayScore;

  // 1. 查找最近进球事件
  const goalEvents = events.filter((e: CanonicalTimelineEvent) => {
    const isGoal = e.category === CanonicalIncidentCategory.SCORE || 
                   e.canonical_type === CanonicalEventType.GOAL_REGULAR ||
             e.canonical_type === CanonicalEventType.GOAL_PENALTY ||
             e.type === 1;
    return isGoal;
  });
  let lastGoalMinute: number | undefined = undefined;
  let lastGoalScorer: 'home' | 'away' | undefined = undefined;

  if (goalEvents.length > 0) {
    const lastGoal = goalEvents[goalEvents.length - 1];
    const minute = getEventMinute(lastGoal);
    if (minute !== null) lastGoalMinute = minute;
    const side = getEventSide(lastGoal);
    if (side === 'home' || side === 'away') {
      lastGoalScorer = side;
    }
  }

  // 2. 查找红牌情况与时间半衰期
  const redCardHome = (physical.red_card_penalty?.home_attack_multiplier ?? 1.0) < 0.9;
  const redCardAway = (physical.red_card_penalty?.away_attack_multiplier ?? 1.0) < 0.9;
  let redSide: 'home' | 'away' | 'both' | 'none' = 'none';
  if (redCardHome && redCardAway) redSide = 'both';
  else if (redCardHome) redSide = 'home';
  else if (redCardAway) redSide = 'away';

  const redEvents = events.filter((e: CanonicalTimelineEvent) => {
    const isRed = e.canonical_type === CanonicalEventType.RED_CARD_DIRECT ||
                  e.canonical_type === CanonicalEventType.RED_CARD_SECOND_YELLOW ||
                  e.type === 4;
    return isRed && !e.is_cancelled;
  });
  let redMinute: number | undefined = undefined;
  if (redEvents.length > 0) {
    const minute = getEventMinute(redEvents[redEvents.length - 1]);
    if (minute !== null) redMinute = minute;
  }

  const redElapsed = redMinute !== undefined ? Math.max(0, currentMinute - redMinute) : 0;

  // 3. 计算 10 分钟滑动窗口角球与射门聚类爆发
  const burstCluster = calculate10mBurstCluster(events, currentMinute);

  // 4. 连续战术相变激活势能求解 (Continuous Activation Field)
  const sig = (x: number, x0: number, k: number) => 1.0 / (1.0 + Math.exp(-(x - x0) / k));

  // (A) 红牌三态动力学激活度与时间韧性函数 (Time Resilience Curve)
  // 刚染红 0~12 分钟初段保持防守韧性 (resilience 趋近 1.0)，随时间推移体能透支脱节 (exhaustion 增加)
  const redResilience = Math.exp(-redElapsed / 22.0); // 初段韧性 [0.55 ~ 1.0]
  const redExhaustion = 1.0 - redResilience; // 后段透支 [0.0 ~ 0.45]

  // (B) 领先收缩防反 (弹性防守) 连续激活度
  const aCounterHome = sig(scoreDiff, 0.5, 0.45) * sig(epi.away.energy_15m, 140, 30) * (1.0 - sig(epi.home.energy_15m, 100, 25));
  const aCounterAway = sig(-scoreDiff, 0.5, 0.45) * sig(epi.home.energy_15m, 140, 30) * (1.0 - sig(epi.away.energy_15m, 100, 25));

  // (C) 绝境反扑态连续激活度 (终盘 68'+，一球落后高斯核)
  const timeLateSig = sig(currentMinute, 68, 4.5);
  const oneGoalDiffGaussian = Math.exp(-Math.pow(Math.abs(scoreDiff) - 1.0, 2) / 0.5);
  const aDesperation = timeLateSig * oneGoalDiffGaussian;

  // (D) 进球后领先控制 / 节奏放缓连续激活度 (60'+，两球以上优势)
  const controlTimeSig = sig(currentMinute, 58, 5.0);
  const controlDiffSig = sig(Math.abs(scoreDiff), 1.6, 0.45);
  const aControl = controlTimeSig * controlDiffSig;

  // 5. 连续动态期望乘子物理仿真合成
  let regimeMultiplierHome = 1.0;
  let regimeMultiplierAway = 1.0;

  // 叠加 10v11 绿茵物理真实三态因果流：
  if (redSide === 'home') {
    // 主队染红少打一人
    if (scoreDiff > 0) {
      // 态 1：领先方染红 (收缩大巴，初段韧性极强，反击削减)
      const homeLeak = 0.15 * redResilience + 0.38 * redExhaustion;
      regimeMultiplierHome -= 0.50; // 主队进攻削弱
      regimeMultiplierAway += (0.20 + homeLeak); // 客队围攻获得空间
    } else if (scoreDiff === 0) {
      // 态 2：平局方染红 (中场失控，深度被动消耗)
      const homeLeak = 0.30 * redResilience + 0.45 * redExhaustion;
      regimeMultiplierHome -= 0.60;
      regimeMultiplierAway += homeLeak;
    } else {
      // 态 3：落后方染红 (心理与战术双重崩溃，防线全线洞开)
      regimeMultiplierHome -= 0.70;
      regimeMultiplierAway += 0.55;
    }
  } else if (redSide === 'away') {
    // 客队染红少打一人
    if (scoreDiff < 0) {
      // 态 1：客队领先染红 (客队收缩大巴，主队围攻空间扩大)
      const awayLeak = 0.15 * redResilience + 0.38 * redExhaustion;
      regimeMultiplierAway -= 0.50;
      regimeMultiplierHome += (0.20 + awayLeak);
    } else if (scoreDiff === 0) {
      // 态 2：平局客队染红 (客队中场失控，主队围攻提振)
      const awayLeak = 0.30 * redResilience + 0.45 * redExhaustion;
      regimeMultiplierAway -= 0.60;
      regimeMultiplierHome += awayLeak;
    } else {
      // 态 3：落后客队染红 (客队彻底崩盘)
      regimeMultiplierAway -= 0.70;
      regimeMultiplierHome += 0.55;
    }
  } else if (redSide === 'both') {
    // 双方各染红一人 (10v10)，攻防转换空间开阔，双方进攻期望均小幅提振
    regimeMultiplierHome += 0.12;
    regimeMultiplierAway += 0.12;
  }

  // 叠加防反效应
  regimeMultiplierHome += (-0.15 * aCounterHome + 0.15 * aCounterAway);
  regimeMultiplierAway += (0.15 * aCounterHome - 0.15 * aCounterAway);

  // 叠加绝境反扑效应 (落后方全线压上，领先方反击空间扩大)
  if (scoreDiff < 0) {
    regimeMultiplierHome += 0.25 * aDesperation;
    regimeMultiplierAway += 0.10 * aDesperation;
  } else if (scoreDiff > 0) {
    regimeMultiplierHome += 0.10 * aDesperation;
    regimeMultiplierAway += 0.25 * aDesperation;
  }

  // 叠加控场放缓效应
  regimeMultiplierHome -= 0.10 * aControl;
  regimeMultiplierAway -= 0.10 * aControl;

  // 叠加 10 分钟滑动窗口角球与密集射门聚类爆发因子
  regimeMultiplierHome *= burstCluster.home.burst_multiplier;
  regimeMultiplierAway *= burstCluster.away.burst_multiplier;

  // 6. 战术相变类型软投影 (选取最高激活能量状态)
  const aRed = redSide !== 'none' ? 1.0 : 0.0;
  const yellowCollapseHome = physical.discipline_pressure?.home_yellow_collapse_risk ?? false;
  const yellowCollapseAway = physical.discipline_pressure?.away_yellow_collapse_risk ?? false;
  const aPanic = (yellowCollapseHome || yellowCollapseAway) ? 0.90 : 0.0;

  if (yellowCollapseHome) {
    regimeMultiplierHome -= 0.20;
    regimeMultiplierAway += 0.25;
  }
  if (yellowCollapseAway) {
    regimeMultiplierAway -= 0.20;
    regimeMultiplierHome += 0.25;
  }

  const stateCandidates = [
    { regime: TacticalRegimeType.RED_CARD_COLLAPSE, energy: aRed, desc: redSide === 'home' ? '主队染红少打一人，防线深度承压' : (redSide === 'away' ? '客队染红少打一人，主队围攻压制' : (redSide === 'both' ? '双方各罚下一人 (10v10)' : '')) },
    { regime: TacticalRegimeType.COLLAPSING_PANIC, energy: aPanic, desc: (yellowCollapseHome && yellowCollapseAway) ? '双方防线体能崩溃失控，连环受迫染黄互有漏洞' : (yellowCollapseHome ? '主队防线体能崩溃失控，连环受迫染黄防线洞开' : (yellowCollapseAway ? '客队防线体能崩溃失控，连环受迫染黄防线洞开' : '')) },
    { regime: TacticalRegimeType.ELASTIC_COUNTER, energy: Math.max(aCounterHome, aCounterAway), desc: aCounterHome > aCounterAway ? '主队比分领先转入深度防守，客队大举围攻' : '客队比分领先转入深度防守，主队大举围攻' },
    { regime: TacticalRegimeType.DESPERATION_ASSAULT, energy: aDesperation, desc: scoreDiff < 0 ? '主队一球落后进入终盘绝境搏命，前场全线压上' : '客队一球落后进入终盘绝境搏命，节奏急剧加速' },
    { regime: TacticalRegimeType.GAME_CONTROL_DECELERATION, energy: aControl, desc: '领先优势确立，控场节奏放缓' },
    { regime: TacticalRegimeType.NEUTRAL_EQUILIBRIUM, energy: 0.30, desc: '双方势均力敌，处于常规攻防转换期' }
  ];

  stateCandidates.sort((a, b) => b.energy - a.energy);
  const bestState = stateCandidates[0];

  return {
    current_regime: bestState.regime,
    last_goal_elapsed_minutes: lastGoalMinute !== undefined ? Math.max(0, currentMinute - lastGoalMinute) : undefined,
    last_goal_scorer: lastGoalScorer,
    red_card_active_side: redSide,
    red_card_elapsed_minutes: redMinute !== undefined ? Math.max(0, currentMinute - redMinute) : undefined,
    tactical_description: bestState.desc,
    regime_multiplier_home: Number(Math.max(0.35, Math.min(2.0, regimeMultiplierHome)).toFixed(3)),
    regime_multiplier_away: Number(Math.max(0.35, Math.min(2.0, regimeMultiplierAway)).toFixed(3))
  };
}

/**
 * 维度三：破门势能临界态探测 (Goal Climax Tipping Point)
 * 物理原理：
 * 建立基于双曲正切 (tanh) 与指数饱和的统一连续多维破门临界积分方程：
 * Climax(t) = 15.0 + Φ_slope + Φ_acc + Φ_density + Φ_epi ∈ [0, 100]
 */
export function evaluateGoalClimax(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures,
  epi: EventPressureConversionFeatures,
  trinity: LiveThreatTrinityFeatures
): GoalClimaxFeatures {
  const currentMinute = Math.max(0, (match.timing.minute ?? 0));
  const events = match.reference?.timeline_events ?? [];

  // 1. 统计近 5 分钟极近事件密度
  const window5m = Math.max(0, currentMinute - 5);
  const events5m = events.filter((e: CanonicalTimelineEvent) => {
    const m = getEventMinute(e);
    return m !== null && m >= window5m && m <= currentMinute && !e.is_cancelled && !e.is_var_overturned;
  });

  const recentIncidentDensity = events5m.length;

  // 2. 动量二阶变化 / 斜率强度 (融入多尺度动量金字塔)
  const compositeSlope = timeline.momentum_pyramid?.composite_slope ?? timeline.slope_5m;
  const slope5m = timeline.slope_5m as number;
  const slope15m = timeline.slope_15m as number;
  const momentumAcceleration = Number((slope5m - slope15m).toFixed(2));

  // 3. 连续多维势能积分求解
  // (A) 斜率平滑势能 (优先采用金字塔复合斜率，并在 ALIGNED 共振时获得 1.12 增益，TURNING 时平滑阻尼)
  const pyramidBonus = timeline.momentum_pyramid?.consistency === 'ALIGNED' ? 1.12 : (timeline.momentum_pyramid?.consistency === 'TURNING' ? 0.90 : 1.0);
  const phiSlope = 25.0 * Math.tanh(Math.abs(compositeSlope) / 12.0) * pyramidBonus;

  // (B) 二阶加速度平滑势能 (最高 10 分)
  const phiAcceleration = 10.0 * Math.tanh(Math.abs(momentumAcceleration) / 8.0);

  // (C) 近 5 分钟高密度事件指数饱和势能 (最高 30 分)
  const phiDensity = 30.0 * (1.0 - Math.exp(-recentIncidentDensity / 2.2));

  // (C.1) 连续角球与密集射门高危滑动窗口物理加成 (统一对接 calculate10mBurstCluster 保持 SSOT)
  const burstCluster = calculate10mBurstCluster(events, currentMinute);
  let cornerClusterBonus = 0.0;
  let shotBarrageBonus = 0.0;
  if (burstCluster.home.has_corner_barrage || burstCluster.away.has_corner_barrage) {
    cornerClusterBonus = 10.0;
  }
  if (burstCluster.home.has_shot_salvo || burstCluster.away.has_shot_salvo) {
    shotBarrageBonus = 8.0;
  }
  const phiCluster = Math.min(18.0, cornerClusterBonus + shotBarrageBonus);

  // (D) EPI 转化势能平滑加权 (最高 20 分)
  const maxRatio = Math.max(epi.home.conversion_ratio, epi.away.conversion_ratio);
  const integrity = Math.max(trinity.home.calibrated_threat, trinity.away.calibrated_threat);
  const phiEpi = 20.0 * Math.tanh(maxRatio / 0.75) * (0.35 + 0.65 * integrity);

  // 综合平滑连续破门临界分值
  let lastGoalMinute: number | undefined;
  for (const event of events) {
    if (!event.is_cancelled && isGoalEvent(event)) {
      const eventMinute = getEventMinute(event);
      if (eventMinute !== null && (lastGoalMinute === undefined || eventMinute > lastGoalMinute)) {
        lastGoalMinute = eventMinute;
      }
    }
  }
  const postGoalCooldownActive = lastGoalMinute !== undefined && currentMinute >= lastGoalMinute && currentMinute - lastGoalMinute < 4;
  const rawClimax = (15.0 + phiSlope + phiAcceleration + phiDensity + phiCluster + phiEpi) * (postGoalCooldownActive ? 0.55 : 1.0);
  const climaxScore = Number(Math.min(100.0, Math.max(0.0, rawClimax)).toFixed(1));

  // (E) 判定主要进攻方 (基于连续动量与能量比率，金字塔复合斜率提供稳健方向)
  let attackingSide: 'home' | 'away' | 'none' = 'none';
  if (trinity.dominant_side === 'home' || (compositeSlope > 4.5 && trinity.home.alignment_score >= 0.45)) {
    attackingSide = 'home';
  } else if (trinity.dominant_side === 'away' || (compositeSlope < -4.5 && trinity.away.alignment_score >= 0.45)) {
    attackingSide = 'away';
  }

  // 4. 等级连续划分
  let climaxLevel = GoalClimaxLevel.DORMANT;
  if (climaxScore >= 78.0) {
    climaxLevel = GoalClimaxLevel.EXTREME_IMMINENT;
  } else if (climaxScore >= 52.0) {
    climaxLevel = GoalClimaxLevel.HIGH_PRESSURE;
  } else if (climaxScore >= 32.0) {
    climaxLevel = GoalClimaxLevel.MODERATE_BUILDUP;
  }

  return {
    climax_score: climaxScore,
    climax_level: climaxLevel,
    attacking_side: attackingSide,
    momentum_acceleration_5m: momentumAcceleration,
    recent_incident_density_5m: recentIncidentDensity,
    post_goal_cooldown_active: postGoalCooldownActive,
    is_imminent_threat: !postGoalCooldownActive && climaxScore >= 65.0,
    pressure_signal_nature: 'RULE_BASED_PRESSURE_SIGNAL'
  };
}

/**
 * Layer 03 M3.5 统帅部入口函数：计算时空事件共生综合特征
 */
export function calculateSpatioTemporalFeatures(
  match: CanonicalMatch,
  timeline: MomentumTimelineFeatures,
  physical: RealTimePhysicalStatsFeatures,
  collector?: DeficitCollector,
  tracer?: Tracer
): SpatioTemporalEventFeatures {
  const currentMinute = Math.max(0, (match.timing.minute ?? 0));
  const events = match.reference?.timeline_events ?? [];

  // 1. 三位一体实时威胁校准，再由同一证据链生成 EPI。
  const liveThreatTrinity = calculateLiveThreatTrinity(timeline, events, physical, currentMinute);
  const epi = calculateEventPressureConversion(timeline, events, liveThreatTrinity, currentMinute, physical);

  // 2. 战术相变
  const regime = evaluateTacticalRegime(match, timeline, epi, physical);

  // 3. 破门临界态
  const goalClimax = evaluateGoalClimax(match, timeline, epi, liveThreatTrinity);

  const activeTracer = tracer ?? Tracer.getInstance();
  activeTracer.log(
    'INFO',
    'QUANT_03_SPATIO_TEMPORAL',
    'SOLVED_SUCCESS',
    `Spatio-Temporal Event Co-Evolution Solved. Minute: ${currentMinute}', Regime: ${regime.current_regime}, Climax: ${goalClimax.climax_score} (${goalClimax.climax_level})`,
    {
      minute: currentMinute,
      epi_home: epi.home.classification,
      epi_away: epi.away.classification,
      trinity_conflict: liveThreatTrinity.has_material_conflict,
      regime: regime.current_regime,
      climax_score: goalClimax.climax_score,
      attacking_side: goalClimax.attacking_side
    },
    match.canonical_id
  );

  return {
    live_threat_trinity: liveThreatTrinity,
    epi,
    regime,
    goal_climax: goalClimax
  };
}

/**
 * 兼容别名导出
 */
export const extractSpatioTemporalEventFeatures = calculateSpatioTemporalFeatures;

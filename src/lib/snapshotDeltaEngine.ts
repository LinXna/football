import { DecisionItem, toStandardMatchData } from '../types';
import { extractAttackMomentumTimeline } from '../components/AttackMomentumTimelineWidget';
import { analyzeAttackMomentum, ComprehensiveMomentumReport } from '../utils/momentumAnalytics';
import { verifiedMarket } from './extendedRecommendation';

export interface MatchSnapshotPoint {
  captured_at: string;
  minute: number;
  score: { home: number; away: number; text: string };
  ou_market?: { line: number | string | null; odds: number | string | null; direction?: string };
  handicap_market?: { line: number | string | null; odds: number | string | null; direction?: string };
  moneyline_market?: { home_odds?: number; draw_odds?: number; away_odds?: number };
  unified_stats?: {
    possession?: { home: number; away: number };
    dangerous_attacks?: { home: number; away: number; total: number };
    attacks?: { home: number; away: number; total: number };
    shots?: { home: number; away: number; total: number };
    shots_on_target?: { home: number; away: number; total: number };
    corners?: { home: number; away: number; total: number };
    yellow_cards?: { home: number; away: number; total: number };
    red_cards?: { home: number; away: number; total: number };
  };
}

export interface InitialVsLiveAnalysis {
  has_initial_data: boolean;
  initial_handicap: number | null;
  current_handicap: number | null;
  handicap_decay: number | null;
  initial_total: number | null;
  current_total: number | null;
  total_decay: number | null;
  expectation_status: 'PERFORMANCE_BEATS_INITIAL' | 'PERFORMANCE_MATCHES_INITIAL' | 'PERFORMANCE_BELOW_INITIAL' | 'VALUE_DILUTION_OPPORTUNITY' | 'NEUTRAL';
  expectation_tag: string;
  expectation_verdict: string;
}

export interface MatchSnapshotDelta {
  has_history: boolean;
  is_first_import: boolean;
  sample_count: number;
  elapsed_minutes: number;
  previous_sample: MatchSnapshotPoint | null;
  current_sample: MatchSnapshotPoint;
  
  // 1. Line & Odds Movement
  line_movement: {
    ou_line_drop: number | null;
    ou_odds_drift: number | null;
    handicap_line_drift: number | null;
    status: 'LINE_DROP_DECAY' | 'ODDS_DRIFT_RISE' | 'LINE_STABLE' | 'NO_COMPARISON';
    summary: string;
  };

  // 2. Initial Pre-match vs Live Market Expectation Analysis (初盘 vs 滚球即盘 预期偏离与战术成色)
  initial_vs_live: InitialVsLiveAnalysis;

  // 3. Stat Accelerations & Velocities (Synthesized from discrete diff + continuous timeline)
  stat_acceleration: {
    dangerous_attacks_delta: { home: number; away: number; total: number };
    dangerous_attacks_rate_per_min: number;
    shots_delta: { home: number; away: number; total: number };
    shots_on_target_delta: { home: number; away: number; total: number };
    corners_delta: { home: number; away: number; total: number };
    possession_shift: { home_change: number; away_change: number; text: string };
    cards_delta: { yellow: number; red: number };
  };

  // 4. Derived Quantitative Momentum Signals
  momentum_signal: 'HIGH_ATTACK_ACCELERATION' | 'GOLDEN_ENTRY_LINE_DROP' | 'PASSIVE_POSSESSION' | 'DISCIPLINE_COLLAPSE' | 'BALANCED_STALEMATE' | 'INSUFFICIENT_DELTA';
  momentum_assessment: string;
  is_golden_entry_point: boolean;
  siege_team: 'HOME' | 'AWAY' | 'NONE';
  ai_prompt_summary: string;
  momentum_report?: ComprehensiveMomentumReport;
}

function cleanName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/-(ybty|leisu)$/gi, '')
    .replace(/football club|fc|俱乐部|体育/gi, '')
    .replace(/[\s\-_:·\.()（）\[\]【】]/g, '')
    .trim();
}

export function getMatchKey(item: any): string {
  let homeRaw = item?.ybty_home || item?.home || '';
  let awayRaw = item?.ybty_away || item?.away || '';
  if ((!homeRaw || !awayRaw) && item?.match && typeof item.match === 'string' && !item.match.startsWith('【AI')) {
    const parts = item.match.split(/\s+vs\s+/i);
    if (parts.length === 2) {
      if (!homeRaw) homeRaw = parts[0];
      if (!awayRaw) awayRaw = parts[1];
    }
  }
  const home = cleanName(homeRaw);
  const away = cleanName(awayRaw);
  return `${home}|${away}`;
}

const clientHistoryCache: Record<string, MatchSnapshotPoint[]> = {};

export function createClientSnapshotPoint(item: any): MatchSnapshotPoint {
  const s = item.score || item.score_at_recommendation || {};
  const h = Number(s.home ?? item.home_score ?? 0);
  const a = Number(s.away ?? item.away_score ?? 0);

  const parsePair = (val: any) => {
    if (!val) return { home: 0, away: 0, total: 0 };
    let homeVal = 0, awayVal = 0;
    if (typeof val === 'object') {
      homeVal = Number(val.home ?? val.h ?? 0);
      awayVal = Number(val.away ?? val.a ?? 0);
    } else if (typeof val === 'string' && val.includes('-')) {
      const parts = val.split('-');
      homeVal = Number(parts[0]) || 0;
      awayVal = Number(parts[1]) || 0;
    }
    return { home: homeVal, away: awayVal, total: homeVal + awayVal };
  };

  // 1. Prioritize StandardMatchData / verified market extraction
  let ouLine: number | string | null = null;
  let ouOdds: number | string | null = null;
  let ahLine: number | string | null = null;
  let ahOdds: number | string | null = null;

  const totalMkt = verifiedMarket(item, 'full_total');
  if (totalMkt && totalMkt.options && totalMkt.options.length > 0) {
    ouLine = totalMkt.options[0]?.line ?? null;
    ouOdds = totalMkt.options[0]?.odds ?? null;
  }

  const spreadMkt = verifiedMarket(item, 'full_spread');
  if (spreadMkt && spreadMkt.options && spreadMkt.options.length > 0) {
    ahLine = spreadMkt.options[0]?.line ?? null;
    ahOdds = spreadMkt.options[0]?.odds ?? null;
  }

  // 1.1 Fallback / Augment with Leisu Reference Market (初盘与即盘参考)
  const ref = item.reference_market || item.leisu_reference_market || item.detail_context?.formal?.odds;
  const instantHandicap = ref?.instant_handicap ?? ref?.current_line?.handicap ?? ref?.current?.asian_handicap?.line ?? ref?.current?.asian_handicap?.handicap ?? ref?.markets?.asian_handicap?.live?.line ?? null;
  const instantTotal = ref?.instant_total ?? ref?.instant_over_under ?? ref?.current_line?.total ?? ref?.current?.total_goals?.line ?? ref?.markets?.total_goals?.live?.line ?? null;

  if (ahLine === null && instantHandicap !== null && instantHandicap !== undefined) {
    ahLine = instantHandicap;
  }

  if (ouLine === null && instantTotal !== null && instantTotal !== undefined) {
    ouLine = instantTotal;
  }

  // 1.2 Fallback to raw recommendation line if available
  if (ouLine === null && item.recommendation && /大小|total/i.test(String(item.recommendation.market || ''))) {
    ouLine = item.recommendation.line ?? null;
    ouOdds = item.recommendation.odds ?? null;
  }
  if (ahLine === null && item.recommendation && /让球|spread|handicap/i.test(String(item.recommendation.market || ''))) {
    ahLine = item.recommendation.line ?? null;
    ahOdds = item.recommendation.odds ?? null;
  }

  // 2. Prioritize StandardMatchData unified_stats
  const std = item.unified_stats ? item : toStandardMatchData(item);
  const u = std.unified_stats;

  const statsObj = {
    possession: parsePair(u?.possession),
    dangerous_attacks: parsePair(u?.dangerous_attacks),
    attacks: parsePair(u?.dangerous_attacks),
    shots: parsePair(u?.shots),
    shots_on_target: parsePair(u?.shots_on_target),
    corners: parsePair(u?.corners),
    yellow_cards: parsePair(u?.yellow_cards),
    red_cards: parsePair(u?.red_cards),
  };

  return {
    captured_at: new Date().toISOString(),
    minute: Number(item.minute || item.live_minute || 0),
    score: { home: h, away: a, text: `${h}-${a}` },
    ou_market: { line: ouLine, odds: ouOdds },
    handicap_market: { line: ahLine, odds: ahOdds },
    unified_stats: statsObj,
  };
}

export function computeInitialVsLiveAnalysis(
  item: any,
  currentPoint: MatchSnapshotPoint,
  momentumReport?: ComprehensiveMomentumReport
): InitialVsLiveAnalysis {
  const ref = item.reference_market || item.leisu_reference_market || item.detail_context?.formal?.odds;
  const initialHandicapRaw = ref?.initial_handicap ?? ref?.opening_line?.handicap ?? ref?.opening?.asian_handicap?.handicap ?? ref?.opening?.asian_handicap?.line ?? null;
  const initialTotalRaw = ref?.initial_total ?? ref?.initial_over_under ?? ref?.opening_line?.total ?? ref?.opening?.total_goals?.line ?? null;

  const initialHandicap = initialHandicapRaw !== null && !isNaN(Number(initialHandicapRaw)) ? Number(initialHandicapRaw) : null;
  const initialTotal = initialTotalRaw !== null && !isNaN(Number(initialTotalRaw)) ? Number(initialTotalRaw) : null;

  const currHandicap = currentPoint.handicap_market?.line !== null && currentPoint.handicap_market?.line !== undefined && !isNaN(Number(currentPoint.handicap_market?.line))
    ? Number(currentPoint.handicap_market?.line)
    : null;
  const currTotal = currentPoint.ou_market?.line !== null && currentPoint.ou_market?.line !== undefined && !isNaN(Number(currentPoint.ou_market?.line))
    ? Number(currentPoint.ou_market?.line)
    : null;

  let handicapDecay: number | null = null;
  if (initialHandicap !== null && currHandicap !== null) {
    handicapDecay = Number((currHandicap - initialHandicap).toFixed(2));
  }

  let totalDecay: number | null = null;
  if (initialTotal !== null && currTotal !== null) {
    totalDecay = Number((currTotal - initialTotal).toFixed(2));
  }

  const hasInitialData = initialHandicap !== null || initialTotal !== null;
  if (!hasInitialData) {
    return {
      has_initial_data: false,
      initial_handicap: null,
      current_handicap: currHandicap,
      handicap_decay: null,
      initial_total: null,
      current_total: currTotal,
      total_decay: null,
      expectation_status: 'NEUTRAL',
      expectation_tag: '初盘待查',
      expectation_verdict: '暂无雷速参考初盘数据',
    };
  }

  // Analyze team live performance vs initial handicap expectation
  const stats = currentPoint.unified_stats || {};
  const homeShots = stats.shots?.home || 0;
  const awayShots = stats.shots?.away || 0;
  const homeSot = stats.shots_on_target?.home || 0;
  const awaySot = stats.shots_on_target?.away || 0;
  const homeDanger = stats.dangerous_attacks?.home || 0;
  const awayDanger = stats.dangerous_attacks?.away || 0;
  const minute = currentPoint.minute || 0;

  let expectationStatus: InitialVsLiveAnalysis['expectation_status'] = 'NEUTRAL';
  let expectationTag = '契合初盘预期';
  let expectationVerdict = '';

  const isHomeInitialFavorite = initialHandicap !== null && initialHandicap <= -0.5;
  const isAwayInitialFavorite = initialHandicap !== null && initialHandicap >= 0.5;

  if (isHomeInitialFavorite) {
    const homeAttackDominant = homeDanger >= awayDanger * 1.3 && (homeShots >= 5 || homeSot >= 2 || (momentumReport?.recent15m && momentumReport.recent15m.direction.includes('HOME')));
    const homeAttackWeak = homeDanger < 25 && homeShots <= 3 && minute >= 35;

    if (homeAttackDominant) {
      if (handicapDecay !== null && handicapDecay > 0) {
        expectationStatus = 'VALUE_DILUTION_OPPORTUNITY';
        expectationTag = '🔥 强队破门迟滞·初盘折价黄金期';
        expectationVerdict = `初盘深开[${initialHandicap}]➔滚球[${currHandicap}] (缩水${Math.abs(handicapDecay)}球)；主队场面高压狂轰契合初盘实力，破门迟滞释放极佳博弈价值。`;
      } else {
        expectationStatus = 'PERFORMANCE_MATCHES_INITIAL';
        expectationTag = '⚡ 场面契合强队初盘预期';
        expectationVerdict = `主队危攻${homeDanger}/射正${homeSot}掌控局面，完全契合初盘[${initialHandicap}]让步预期。`;
      }
    } else if (homeAttackWeak) {
      expectationStatus = 'PERFORMANCE_BELOW_INITIAL';
      expectationTag = '⚠️ 强队攻势疲软·谨防初盘诱深';
      expectationVerdict = `初盘给予深让[${initialHandicap}]，但${minute}'射门仅${homeShots}次/危攻${homeDanger}，场面严重低于预期，警惕冷门。`;
    } else {
      expectationStatus = 'PERFORMANCE_MATCHES_INITIAL';
      expectationTag = '⚖️ 初盘动态消化中';
      expectationVerdict = `初盘[${initialHandicap}]，当前比分${currentPoint.score.text}，场面维持常态推进。`;
    }
  } else if (isAwayInitialFavorite) {
    const awayAttackDominant = awayDanger >= homeDanger * 1.3 && (awayShots >= 5 || awaySot >= 2 || (momentumReport?.recent15m && momentumReport.recent15m.direction.includes('AWAY')));
    const awayAttackWeak = awayDanger < 25 && awayShots <= 3 && minute >= 35;

    if (awayAttackDominant) {
      if (handicapDecay !== null && handicapDecay < 0) {
        expectationStatus = 'VALUE_DILUTION_OPPORTUNITY';
        expectationTag = '🔥 客让破门迟滞·初盘折价黄金期';
        expectationVerdict = `客队初盘客让[${initialHandicap}]➔滚球[${currHandicap}]；客队场面优势契合初盘实力，破门迟滞释放极佳折价价值。`;
      } else {
        expectationStatus = 'PERFORMANCE_MATCHES_INITIAL';
        expectationTag = '⚡ 场面契合客让初盘预期';
        expectationVerdict = `客队危攻${awayDanger}/射正${awaySot}攻势占优，完全契合客让[${initialHandicap}]预期。`;
      }
    } else if (awayAttackWeak) {
      expectationStatus = 'PERFORMANCE_BELOW_INITIAL';
      expectationTag = '⚠️ 客让攻势受阻·谨防初盘虚高';
      expectationVerdict = `初盘客让[${initialHandicap}]，但${minute}'射门仅${awayShots}次/危攻${awayDanger}，场面疲软低于预期。`;
    } else {
      expectationStatus = 'PERFORMANCE_MATCHES_INITIAL';
      expectationTag = '⚖️ 初盘动态消化中';
      expectationVerdict = `初盘客让[${initialHandicap}]，当前比分${currentPoint.score.text}。`;
    }
  } else {
    if (homeDanger >= awayDanger * 1.8 && homeShots >= 6) {
      expectationStatus = 'PERFORMANCE_BEATS_INITIAL';
      expectationTag = '🚀 主队打破均势·超常发挥';
      expectationVerdict = `初盘平手/浅让[${initialHandicap ?? '平手'}]，但主队危攻${homeDanger}碾压客队${awayDanger}，表现远超赛前预期。`;
    } else if (awayDanger >= homeDanger * 1.8 && awayShots >= 6) {
      expectationStatus = 'PERFORMANCE_BEATS_INITIAL';
      expectationTag = '🚀 客队打破均势·反客为主';
      expectationVerdict = `初盘浅让[${initialHandicap ?? '平手'}]，客队反客为主危攻${awayDanger}碾压主队${homeDanger}，表现远超预期。`;
    } else {
      expectationStatus = 'PERFORMANCE_MATCHES_INITIAL';
      expectationTag = '⚖️ 契合均势初盘·焦灼缠斗';
      expectationVerdict = `初盘[${initialHandicap ?? '平手'}]，双方攻守均势，符合赛前焦灼预期。`;
    }
  }

  return {
    has_initial_data: true,
    initial_handicap: initialHandicap,
    current_handicap: currHandicap,
    handicap_decay: handicapDecay,
    initial_total: initialTotal,
    current_total: currTotal,
    total_decay: totalDecay,
    expectation_status: expectationStatus,
    expectation_tag: expectationTag,
    expectation_verdict: expectationVerdict,
  };
}

export function recordClientSnapshots(items: any[]): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const key = getMatchKey(item);
    if (!key || key === '|') continue;
    const point = createClientSnapshotPoint(item);
    const list = clientHistoryCache[key] || [];
    const last = list[list.length - 1];
    if (last && last.minute === point.minute) continue;
    list.push(point);
    if (list.length > 10) list.splice(0, list.length - 10);
    clientHistoryCache[key] = list;
  }
}

/**
 * Enhanced Unified Snapshot Delta & Momentum Engine
 * Synthesizes discrete snapshot polling with continuous Leisu minute-by-minute attack momentum
 */
export function computeClientSnapshotDelta(item: any): MatchSnapshotDelta {
  const key = getMatchKey(item);
  const list = clientHistoryCache[key] || [];
  const current = createClientSnapshotPoint(item);

  // 1. Always extract continuous Attack Momentum Timeline & Analytics
  const timeline = extractAttackMomentumTimeline(item);
  const momentumReport = analyzeAttackMomentum(timeline, item);
  const initialVsLive = computeInitialVsLiveAnalysis(item, current, momentumReport);

  const currStats = current.unified_stats || {};
  const currentMinute = Math.max(1, current.minute || 1);

  // Case A: First Import (Single sample / No prior snapshot history)
  if (list.length <= 1) {
    const hasTimeline = momentumReport.hasData && momentumReport.totalPoints > 0;
    const recent15 = momentumReport.recent15m;
    
    // Baseline danger rate calculated from cumulative stats or recent 15m
    const totalDanger = currStats.dangerous_attacks?.total || 0;
    const cumulativeDangerRate = Number((totalDanger / currentMinute).toFixed(2));
    
    // If timeline exists, derive active momentum direction & signal immediately!
    let signal: MatchSnapshotDelta['momentum_signal'] = 'BALANCED_STALEMATE';
    let isGolden = false;
    let siegeTeam: MatchSnapshotDelta['siege_team'] = 'NONE';
    let assessment = '';

    if (currStats.red_cards && currStats.red_cards.total > 0) {
      signal = 'DISCIPLINE_COLLAPSE';
      assessment = `⚠️ 场上存在红牌（累计${currStats.red_cards.total}张），攻守架构受损。`;
    } else if (hasTimeline) {
      if (recent15.direction === 'HOME_SURGING' || recent15.direction === 'HOME_DOMINATING') {
        siegeTeam = 'HOME';
        signal = 'HIGH_ATTACK_ACCELERATION';
        isGolden = momentumReport.homeConversion.efficiencyRating === 'HIGHLY_EFFICIENT' || recent15.slope >= 1.2;
        assessment = `⚡ 时序已激活: 近15分【主队持续起势(均分${recent15.homeAvg})】· 形态【${momentumReport.patternZh}】· 转化【${momentumReport.homeConversion.efficiencyZh}】`;
      } else if (recent15.direction === 'AWAY_SURGING' || recent15.direction === 'AWAY_DOMINATING') {
        siegeTeam = 'AWAY';
        signal = 'HIGH_ATTACK_ACCELERATION';
        isGolden = momentumReport.awayConversion.efficiencyRating === 'HIGHLY_EFFICIENT' || recent15.slope <= -1.2;
        assessment = `⚡ 时序已激活: 近15分【客队持续起势(均分${recent15.awayAvg})】· 形态【${momentumReport.patternZh}】· 转化【${momentumReport.awayConversion.efficiencyZh}】`;
      } else if (momentumReport.patternType === 'SINGLE_SIDE_CHOKE') {
        signal = 'HIGH_ATTACK_ACCELERATION';
        assessment = `🥊 单边窒息压制: 全场形成单向压迫 · 形态【${momentumReport.patternZh}】`;
      } else if (momentumReport.patternType === 'MIDFIELD_MUD') {
        signal = 'PASSIVE_POSSESSION';
        assessment = `🪵 中场泥潭缠斗: 双方在低威胁区激烈拼抢，有效射门转化偏低。`;
      } else {
        signal = 'BALANCED_STALEMATE';
        assessment = `⏱️ 攻守均势拉锯: 近15分主${recent15.homeAvg}% vs 客${recent15.awayAvg}% · 均势过渡。`;
      }
    } else {
      assessment = `📊 首批基准数据已锁定 (危攻${totalDanger}，场均${cumulativeDangerRate}/分)，待二次导入更新盘口差值。`;
    }

    return {
      has_history: hasTimeline || list.length > 0,
      is_first_import: true,
      sample_count: 1,
      elapsed_minutes: 0,
      previous_sample: null,
      current_sample: current,
      line_movement: {
        ou_line_drop: null,
        ou_odds_drift: null,
        handicap_line_drift: null,
        status: 'NO_COMPARISON',
        summary: '首批基准盘口已锁定',
      },
      initial_vs_live: initialVsLive,
      stat_acceleration: {
        dangerous_attacks_delta: currStats.dangerous_attacks || { home: 0, away: 0, total: 0 },
        dangerous_attacks_rate_per_min: cumulativeDangerRate,
        shots_delta: currStats.shots || { home: 0, away: 0, total: 0 },
        shots_on_target_delta: currStats.shots_on_target || { home: 0, away: 0, total: 0 },
        corners_delta: currStats.corners || { home: 0, away: 0, total: 0 },
        possession_shift: { home_change: 0, away_change: 0, text: '首批基准' },
        cards_delta: { 
          yellow: currStats.yellow_cards?.total || 0, 
          red: currStats.red_cards?.total || 0 
        },
      },
      momentum_signal: signal,
      momentum_assessment: assessment,
      is_golden_entry_point: isGolden,
      siege_team: siegeTeam,
      ai_prompt_summary: hasTimeline ? momentumReport.aiPromptSnippet : assessment,
      momentum_report: momentumReport,
    };
  }

  // Case B: Multi-Snapshot Cross-Batch Delta
  const previous = list[0];
  const elapsed = Math.max(1, current.minute - previous.minute);
  const prevStats = previous.unified_stats || {};

  const dDangerHome = Math.max(0, (currStats.dangerous_attacks?.home || 0) - (prevStats.dangerous_attacks?.home || 0));
  const dDangerAway = Math.max(0, (currStats.dangerous_attacks?.away || 0) - (prevStats.dangerous_attacks?.away || 0));
  const dDangerTotal = dDangerHome + dDangerAway;
  const dangerRate = Number((dDangerTotal / elapsed).toFixed(2));

  const dShotsHome = Math.max(0, (currStats.shots?.home || 0) - (prevStats.shots?.home || 0));
  const dShotsAway = Math.max(0, (currStats.shots?.away || 0) - (prevStats.shots?.away || 0));
  const dShotsTotal = dShotsHome + dShotsAway;

  const dSotHome = Math.max(0, (currStats.shots_on_target?.home || 0) - (prevStats.shots_on_target?.home || 0));
  const dSotAway = Math.max(0, (currStats.shots_on_target?.away || 0) - (prevStats.shots_on_target?.away || 0));
  const dSotTotal = dSotHome + dSotAway;

  const dCornersTotal = Math.max(0, (currStats.corners?.total || 0) - (prevStats.corners?.total || 0));
  const dRed = Math.max(0, (currStats.red_cards?.total || 0) - (prevStats.red_cards?.total || 0));
  const dYellow = Math.max(0, (currStats.yellow_cards?.total || 0) - (prevStats.yellow_cards?.total || 0));

  // Compute Line movements if OU/AH market was tracked
  let ouLineDrop: number | null = null;
  let ouOddsDrift: number | null = null;
  let handicapDrift: number | null = null;
  let lineStatus: MatchSnapshotDelta['line_movement']['status'] = 'LINE_STABLE';
  let lineSummary = '盘口平稳';

  if (current.ou_market?.line !== null && previous.ou_market?.line !== null) {
    const currLineNum = Number(current.ou_market?.line);
    const prevLineNum = Number(previous.ou_market?.line);
    if (!isNaN(currLineNum) && !isNaN(prevLineNum)) {
      ouLineDrop = Number((currLineNum - prevLineNum).toFixed(2));
      if (ouLineDrop < 0) {
        lineStatus = 'LINE_DROP_DECAY';
        lineSummary = `📉 大小球盘口掉落 ${Math.abs(ouLineDrop)} 球`;
      }
    }
  }

  if (current.handicap_market?.line !== null && previous.handicap_market?.line !== null) {
    const currAhNum = Number(current.handicap_market?.line);
    const prevAhNum = Number(previous.handicap_market?.line);
    if (!isNaN(currAhNum) && !isNaN(prevAhNum)) {
      handicapDrift = Number((currAhNum - prevAhNum).toFixed(2));
    }
  }

  // Synthesize Momentum Signal with Timeline Intelligence
  const recent15 = momentumReport.recent15m;
  const isHighDeltaAttack = dangerRate >= 0.55 || dSotTotal >= 2;
  const isHighTimelineAttack = recent15.direction === 'HOME_SURGING' || recent15.direction === 'AWAY_SURGING' || recent15.direction.includes('DOMINATING');

  let momentumSignal: MatchSnapshotDelta['momentum_signal'] = 'BALANCED_STALEMATE';
  let isGoldenEntry = false;
  let siegeTeam: MatchSnapshotDelta['siege_team'] = 'NONE';
  let momentumText = '';

  if (dRed > 0 || (currStats.red_cards && currStats.red_cards.total > 0)) {
    momentumSignal = 'DISCIPLINE_COLLAPSE';
    momentumText = `⚠️ 跨时段突发红牌（红牌+${dRed || currStats.red_cards?.total}），防线失衡。`;
  } else if (ouLineDrop !== null && ouLineDrop < 0 && (isHighDeltaAttack || isHighTimelineAttack)) {
    momentumSignal = 'GOLDEN_ENTRY_LINE_DROP';
    isGoldenEntry = true;
    momentumText = `🔥 黄金切入契机：盘口已降 ${Math.abs(ouLineDrop)} 球，攻势维持高压（近段危攻 ${dangerRate}/分，${recent15.directionZh}）。`;
    siegeTeam = recent15.direction.includes('HOME') ? 'HOME' : recent15.direction.includes('AWAY') ? 'AWAY' : 'NONE';
  } else if (isHighDeltaAttack || isHighTimelineAttack) {
    momentumSignal = 'HIGH_ATTACK_ACCELERATION';
    isGoldenEntry = recent15.slope >= 1.5 || recent15.slope <= -1.5 || dSotTotal >= 2;
    siegeTeam = (dDangerHome > dDangerAway || recent15.direction.includes('HOME')) ? 'HOME' : 'AWAY';
    
    if (dDangerTotal > 0 || dSotTotal > 0) {
      momentumText = `⚡ 攻势急剧加速：过去 ${elapsed} 分钟危攻 +${dDangerTotal}（速率 ${dangerRate}/分），射正 +${dSotTotal} · ${recent15.directionZh}。`;
    } else {
      // Avoid isolated misleading "+0 (0/分)" when short-duration slice meets active 15m siege
      momentumText = `⚡ 攻势持续高压：过去 ${elapsed} 分钟盘口稳定，近15分钟攻势维持【${recent15.directionZh}】（均分${Math.max(recent15.homeAvg, recent15.awayAvg)}）。`;
    }
  } else if (momentumReport.patternType === 'MIDFIELD_MUD') {
    momentumSignal = 'PASSIVE_POSSESSION';
    momentumText = `🪵 中场泥潭缠斗：过去 ${elapsed} 分钟双方攻防平稳过渡，有效威胁极低。`;
  } else {
    momentumSignal = 'BALANCED_STALEMATE';
    momentumText = `⏱️ 跨时段均势拉锯：过去 ${elapsed} 分钟攻防平稳过渡（${recent15.directionZh}）。`;
  }

  return {
    has_history: true,
    is_first_import: false,
    sample_count: list.length,
    elapsed_minutes: elapsed,
    previous_sample: previous,
    current_sample: current,
    line_movement: {
      ou_line_drop: ouLineDrop,
      ou_odds_drift: ouOddsDrift,
      handicap_line_drift: handicapDrift,
      status: lineStatus,
      summary: lineSummary,
    },
    initial_vs_live: initialVsLive,
    stat_acceleration: {
      dangerous_attacks_delta: { home: dDangerHome, away: dDangerAway, total: dDangerTotal },
      dangerous_attacks_rate_per_min: dangerRate,
      shots_delta: { home: dShotsHome, away: dShotsAway, total: dShotsTotal },
      shots_on_target_delta: { home: dSotHome, away: dSotAway, total: dSotTotal },
      corners_delta: { home: 0, away: 0, total: dCornersTotal },
      possession_shift: { home_change: 0, away_change: 0, text: '无大幅偏移' },
      cards_delta: { yellow: dYellow, red: dRed },
    },
    momentum_signal: momentumSignal,
    momentum_assessment: momentumText,
    is_golden_entry_point: isGoldenEntry,
    siege_team: siegeTeam,
    ai_prompt_summary: momentumReport.hasData ? `${momentumText}\n${momentumReport.aiPromptSnippet}` : momentumText,
    momentum_report: momentumReport,
  };
}


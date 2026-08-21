import { DecisionItem, toStandardMatchData } from '../types';
import { extractAttackMomentumTimeline } from '../components/AttackMomentumTimelineWidget';
import { analyzeAttackMomentum, ComprehensiveMomentumReport } from '../utils/momentumAnalytics';

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

  // 2. Stat Accelerations & Velocities (Synthesized from discrete diff + continuous timeline)
  stat_acceleration: {
    dangerous_attacks_delta: { home: number; away: number; total: number };
    dangerous_attacks_rate_per_min: number;
    shots_delta: { home: number; away: number; total: number };
    shots_on_target_delta: { home: number; away: number; total: number };
    corners_delta: { home: number; away: number; total: number };
    possession_shift: { home_change: number; away_change: number; text: string };
    cards_delta: { yellow: number; red: number };
  };

  // 3. Derived Quantitative Momentum Signals
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

  // 1. Prioritize StandardMatchData market_snapshots
  let ouLine: number | string | null = null;
  let ouOdds: number | string | null = null;
  let ahLine: number | string | null = null;
  let ahOdds: number | string | null = null;

  if (Array.isArray(item.market_snapshots)) {
    const totalM = item.market_snapshots.find((m: any) => m.market_type === 'total');
    if (totalM) {
      ouLine = totalM.line ?? null;
      ouOdds = totalM.home_or_over_odds ?? null;
    }
    const spreadM = item.market_snapshots.find((m: any) => m.market_type === 'spread');
    if (spreadM) {
      ahLine = spreadM.line ?? null;
      ahOdds = spreadM.home_or_over_odds ?? null;
    }
  } else {
    const markets = item.markets || item.all_markets || item.handicap_items || [];
    if (Array.isArray(markets)) {
      const ou = markets.find((m: any) => m.market === 'OU' || m.market_type === 'OU' || m.market_name?.includes('大小'));
      if (ou) {
        ouLine = ou.line ?? ou.handicap ?? null;
        ouOdds = ou.odds ?? ou.over_odds ?? null;
      }
      const ah = markets.find((m: any) => m.market === 'AH' || m.market_type === 'AH' || m.market_name?.includes('让球'));
      if (ah) {
        ahLine = ah.line ?? ah.handicap ?? null;
        ahOdds = ah.odds ?? ah.home_odds ?? null;
      }
    }
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

  // Compute Line movements if OU market was tracked
  let ouLineDrop: number | null = null;
  let ouOddsDrift: number | null = null;
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
      handicap_line_drift: null,
      status: lineStatus,
      summary: lineSummary,
    },
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


import { readJsonFile, writeJsonFile } from '../jsonStore';
import { DATA_FILES } from '../dataFiles';

export interface MatchSnapshotPoint {
  captured_at: string;
  minute: number;
  score: { home: number; away: number; text: string };
  ou_market?: { line: number | string | null; odds: number | string | null; direction?: string };
  handicap_market?: { line: number | string | null; odds: number | string | null; direction?: string };
  moneyline_market?: { home_odds?: number; draw_odds?: number; away_odds?: number };
  live_statistics?: {
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
  sample_count: number;
  elapsed_minutes: number;
  previous_sample: MatchSnapshotPoint | null;
  current_sample: MatchSnapshotPoint;
  
  // 1. Line & Odds Movement
  line_movement: {
    ou_line_drop: number | null; // e.g. -1.0 (from 2.75 down to 1.75)
    ou_odds_drift: number | null; // e.g. +0.13
    handicap_line_drift: number | null;
    status: 'LINE_DROP_DECAY' | 'ODDS_DRIFT_RISE' | 'LINE_STABLE' | 'NO_COMPARISON';
    summary: string;
  };

  // 2. Initial Pre-match vs Live Market Expectation Analysis
  initial_vs_live: InitialVsLiveAnalysis;

  // 3. Stat Accelerations & Velocities
  stat_acceleration: {
    dangerous_attacks_delta: { home: number; away: number; total: number };
    dangerous_attacks_rate_per_min: number; // e.g. 0.88 / min
    shots_delta: { home: number; away: number; total: number };
    shots_on_target_delta: { home: number; away: number; total: number };
    corners_delta: { home: number; away: number; total: number };
    possession_shift: { home_change: number; away_change: number; text: string };
    cards_delta: { yellow: number; red: number };
  };

  // 4. Derived Quantitative Momentum Signals
  momentum_signal: 'HIGH_ATTACK_ACCELERATION' | 'GOLDEN_ENTRY_LINE_DROP' | 'PASSIVE_POSSESSION' | 'DISCIPLINE_COLLAPSE' | 'BALANCED_STALEMATE' | 'INSUFFICIENT_DELTA';
  momentum_assessment: string;
  is_golden_entry_point: boolean; // True if line dropped significantly while attack intensity sustained
  siege_team: 'HOME' | 'AWAY' | 'NONE'; // Identifies which team is fiercely attacking
  ai_prompt_summary: string; // Ready for AI prompt injection
}

const SNAPSHOT_HISTORY_FILE = 'output/match_snapshot_history.json';

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

function parseScore(item: any): { home: number; away: number; text: string } {
  const s = item.score || item.score_at_recommendation || {};
  let h = Number(s.home ?? item.home_score ?? 0);
  let a = Number(s.away ?? item.away_score ?? 0);
  if (!Number.isFinite(h)) h = 0;
  if (!Number.isFinite(a)) a = 0;
  return { home: h, away: a, text: `${h}-${a}` };
}

function parseLiveStats(item: any): any {
  const parsePair = (val: any) => {
    if (!val) return { home: 0, away: 0, total: 0 };
    let h = 0, a = 0;
    if (typeof val === 'object') {
      h = Number(val.home ?? val.h ?? 0);
      a = Number(val.away ?? val.a ?? 0);
    } else if (typeof val === 'string' && val.includes('-')) {
      const parts = val.split('-');
      h = Number(parts[0]) || 0;
      a = Number(parts[1]) || 0;
    }
    return { home: h, away: a, total: h + a };
  };

  const u = item.unified_stats;
  if (u) {
    return {
      possession: parsePair(u.possession),
      dangerous_attacks: parsePair(u.dangerous_attacks),
      attacks: parsePair(u.dangerous_attacks),
      shots: parsePair(u.shots),
      shots_on_target: parsePair(u.shots_on_target),
      corners: parsePair(u.corners),
      yellow_cards: parsePair(u.yellow_cards),
      red_cards: parsePair(u.red_cards),
    };
  }

  const raw = item.unified_stats || item.live_facts?.stats || item.liveStats || {};

  return {
    possession: parsePair(raw.possession || item.possession),
    dangerous_attacks: parsePair(raw.dangerous_attacks || item.dangerous_attacks),
    attacks: parsePair(raw.attacks || item.attacks),
    shots: parsePair(raw.shots || raw.shots_total || item.shots),
    shots_on_target: parsePair(raw.shots_on_target || item.shots_on_target),
    corners: parsePair(raw.corners || item.corners),
    yellow_cards: parsePair(raw.yellow_cards || item.yellow_cards),
    red_cards: parsePair(raw.red_cards || item.red_cards),
  };
}

function extractPrimaryOUMarket(item: any): { line: number | string | null; odds: number | string | null; direction?: string } | undefined {
  const markets = Array.isArray(item.ybty_raw_markets) ? item.ybty_raw_markets :
    Array.isArray(item.verified_ybty_markets) ? item.verified_ybty_markets : [];
  
  for (const m of markets) {
    const type = String(m.market_type || m.category || m.market || '').toLowerCase();
    if (type.includes('total') || type.includes('大小球')) {
      const options = Array.isArray(m.options) ? m.options : [];
      const overOpt = options.find((o: any) => /大|over/i.test(o.direction || o.name || ''));
      if (overOpt) {
        return {
          line: overOpt.line || m.line,
          odds: overOpt.odds || overOpt.price,
          direction: 'OVER',
        };
      }
    }
  }

  // Fallback to Leisu Reference Market
  const ref = item.reference_market || item.leisu_reference_market || item.detail_context?.formal?.odds;
  const instantTotal = ref?.instant_total ?? ref?.instant_over_under ?? ref?.current_line?.total ?? ref?.current?.total_goals?.line ?? ref?.markets?.total_goals?.live?.line ?? null;
  if (instantTotal !== null && instantTotal !== undefined) {
    return {
      line: instantTotal,
      odds: null,
      direction: 'OVER',
    };
  }

  if (item.recommendation && /大小球|total/i.test(item.recommendation.market || '')) {
    return {
      line: item.recommendation.line,
      odds: item.recommendation.odds,
      direction: item.recommendation.direction || 'OVER',
    };
  }
  return undefined;
}

function extractPrimaryHandicapMarket(item: any): { line: number | string | null; odds: number | string | null; direction?: string } | undefined {
  const markets = Array.isArray(item.ybty_raw_markets) ? item.ybty_raw_markets :
    Array.isArray(item.verified_ybty_markets) ? item.verified_ybty_markets : [];
  
  for (const m of markets) {
    const type = String(m.market_type || m.category || m.market || '').toLowerCase();
    if (type.includes('spread') || type.includes('handicap') || type.includes('让球')) {
      const options = Array.isArray(m.options) ? m.options : [];
      const homeOpt = options.find((o: any) => /主|home/i.test(o.direction || o.name || ''));
      if (homeOpt) {
        return {
          line: homeOpt.line || m.line,
          odds: homeOpt.odds || homeOpt.price,
          direction: 'HOME',
        };
      }
    }
  }

  // Fallback to Leisu Reference Market
  const ref = item.reference_market || item.leisu_reference_market || item.detail_context?.formal?.odds;
  const instantHandicap = ref?.instant_handicap ?? ref?.current_line?.handicap ?? ref?.current?.asian_handicap?.line ?? ref?.current?.asian_handicap?.handicap ?? ref?.markets?.asian_handicap?.live?.line ?? null;
  if (instantHandicap !== null && instantHandicap !== undefined) {
    return {
      line: instantHandicap,
      odds: null,
      direction: 'HOME',
    };
  }

  if (item.recommendation && /让球|spread|handicap/i.test(item.recommendation.market || '')) {
    return {
      line: item.recommendation.line,
      odds: item.recommendation.odds,
      direction: item.recommendation.direction || 'HOME',
    };
  }

  return undefined;
}

export function computeInitialVsLiveAnalysis(
  item: any,
  currentPoint: MatchSnapshotPoint
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

  const stats = currentPoint.live_statistics || {};
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
    const homeAttackDominant = homeDanger >= awayDanger * 1.3 && (homeShots >= 5 || homeSot >= 2);
    const homeAttackWeak = homeDanger < 25 && homeShots <= 3 && minute >= 35;

    if (homeAttackDominant) {
      if (handicapDecay !== null && handicapDecay > 0) {
        expectationStatus = 'VALUE_DILUTION_OPPORTUNITY';
        expectationTag = '🔥 强队破门迟滞·初盘折价黄金期';
        expectationVerdict = `初盘深开[${initialHandicap}]➔滚球[${currHandicap}] (缩水${Math.abs(handicapDecay)}球)；主队场面狂轰契合初盘实力，破门迟滞释放极佳博弈价值。`;
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
    const awayAttackDominant = awayDanger >= homeDanger * 1.3 && (awayShots >= 5 || awaySot >= 2);
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

export function createSnapshotPoint(item: any): MatchSnapshotPoint {
  return {
    captured_at: new Date().toISOString(),
    minute: Number(item.minute || item.live_minute || 0),
    score: parseScore(item),
    ou_market: extractPrimaryOUMarket(item),
    handicap_market: extractPrimaryHandicapMarket(item),
    live_statistics: parseLiveStats(item),
  };
}

/**
 * Persists match snapshots across import batches.
 */
export function recordMatchSnapshots(items: any[]): void {
  if (!Array.isArray(items) || items.length === 0) return;
  const history = readJsonFile<Record<string, MatchSnapshotPoint[]>>(SNAPSHOT_HISTORY_FILE, {});
  let modified = false;

  for (const item of items) {
    const key = getMatchKey(item);
    if (!key || key === '|') continue;

    const point = createSnapshotPoint(item);
    const existingList = history[key] || [];

    // Avoid duplicate insertions within 60s if minute has not changed
    const last = existingList[existingList.length - 1];
    if (last) {
      if (last.minute === point.minute && Math.abs(new Date(point.captured_at).getTime() - new Date(last.captured_at).getTime()) < 60000) {
        continue;
      }
    }

    existingList.push(point);
    // Keep up to 10 latest snapshots per match
    if (existingList.length > 10) {
      existingList.splice(0, existingList.length - 10);
    }
    history[key] = existingList;
    modified = true;
  }

  if (modified) {
    writeJsonFile(SNAPSHOT_HISTORY_FILE, history);
  }
}

/**
 * Calculates quantitative delta and momentum between previous and current snapshots.
 */
export function computeMatchSnapshotDelta(item: any): MatchSnapshotDelta {
  const key = getMatchKey(item);
  const history = readJsonFile<Record<string, MatchSnapshotPoint[]>>(SNAPSHOT_HISTORY_FILE, {});
  const list = history[key] || [];
  const current = createSnapshotPoint(item);
  const initialVsLive = computeInitialVsLiveAnalysis(item, current);

  if (list.length === 0) {
    return {
      has_history: false,
      sample_count: 1,
      elapsed_minutes: 0,
      previous_sample: null,
      current_sample: current,
      line_movement: {
        ou_line_drop: null,
        ou_odds_drift: null,
        handicap_line_drift: null,
        status: 'NO_COMPARISON',
        summary: '首批基准采样点，尚未积累跨时段对比数据。',
      },
      initial_vs_live: initialVsLive,
      stat_acceleration: {
        dangerous_attacks_delta: { home: 0, away: 0, total: 0 },
        dangerous_attacks_rate_per_min: 0,
        shots_delta: { home: 0, away: 0, total: 0 },
        shots_on_target_delta: { home: 0, away: 0, total: 0 },
        corners_delta: { home: 0, away: 0, total: 0 },
        possession_shift: { home_change: 0, away_change: 0, text: '无时序变化' },
        cards_delta: { yellow: 0, red: 0 },
      },
      momentum_signal: 'INSUFFICIENT_DELTA',
      momentum_assessment: '首批基准数据已锁定，等待后续时段二次导入生成增量研判。',
      is_golden_entry_point: false,
      siege_team: 'NONE',
      ai_prompt_summary: '【首批采样】当前为比赛首次采集快照，已记录开场/即时基准数据。',
    };
  }

  // Use the earliest relevant previous snapshot (at least 2 minutes prior if available)
  let previous = list[0];
  for (let i = list.length - 1; i >= 0; i--) {
    if (current.minute - list[i].minute >= 3) {
      previous = list[i];
      break;
    }
  }

  const elapsed = Math.max(1, current.minute - previous.minute);
  
  // 1. Line movements
  let ouLineDrop: number | null = null;
  let ouOddsDrift: number | null = null;
  let handicapDrift: number | null = null;
  if (previous.ou_market?.line != null && current.ou_market?.line != null) {
    const prevLine = Number(previous.ou_market.line);
    const currLine = Number(current.ou_market.line);
    if (Number.isFinite(prevLine) && Number.isFinite(currLine)) {
      ouLineDrop = Number((currLine - prevLine).toFixed(2));
    }
  }
  if (previous.ou_market?.odds != null && current.ou_market?.odds != null) {
    const prevOdds = Number(previous.ou_market.odds);
    const currOdds = Number(current.ou_market.odds);
    if (Number.isFinite(prevOdds) && Number.isFinite(currOdds)) {
      ouOddsDrift = Number((currOdds - prevOdds).toFixed(3));
    }
  }
  if (previous.handicap_market?.line != null && current.handicap_market?.line != null) {
    const prevAh = Number(previous.handicap_market.line);
    const currAh = Number(current.handicap_market.line);
    if (Number.isFinite(prevAh) && Number.isFinite(currAh)) {
      handicapDrift = Number((currAh - prevAh).toFixed(2));
    }
  }

  // 2. Stat Deltas
  const prevStats = previous.live_statistics || {};
  const currStats = current.live_statistics || {};

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

  const dCornersHome = Math.max(0, (currStats.corners?.home || 0) - (prevStats.corners?.home || 0));
  const dCornersAway = Math.max(0, (currStats.corners?.away || 0) - (prevStats.corners?.away || 0));
  const dCornersTotal = dCornersHome + dCornersAway;

  const prevPossHome = prevStats.possession?.home || 50;
  const currPossHome = currStats.possession?.home || 50;
  const possShiftHome = currPossHome - prevPossHome;

  const dRed = Math.max(0, (currStats.red_cards?.total || 0) - (prevStats.red_cards?.total || 0));
  const dYellow = Math.max(0, (currStats.yellow_cards?.total || 0) - (prevStats.yellow_cards?.total || 0));

  // Determine siege team
  let siegeTeam: 'HOME' | 'AWAY' | 'NONE' = 'NONE';
  if (dDangerHome >= dDangerAway * 2 && dDangerHome >= 8) siegeTeam = 'HOME';
  else if (dDangerAway >= dDangerHome * 2 && dDangerAway >= 8) siegeTeam = 'AWAY';

  // 3. Quantitative Momentum & Golden Entry Determination
  let momentumSignal: MatchSnapshotDelta['momentum_signal'] = 'BALANCED_STALEMATE';
  let isGoldenEntry = false;
  let momentumText = '';

  const isLineDropped = ouLineDrop !== null && ouLineDrop <= -0.5;
  const isHighAttack = dangerRate >= 0.55 || dSotTotal >= 2;

  if (dRed > 0) {
    momentumSignal = 'DISCIPLINE_COLLAPSE';
    momentumText = `⚠️ 跨时段突发红牌减员（红牌+${dRed}），攻防结构受外力严重冲击，须顺势重估对立面。`;
  } else if (isLineDropped && isHighAttack && (current.score.home === previous.score.home && current.score.away === previous.score.away)) {
    momentumSignal = 'GOLDEN_ENTRY_LINE_DROP';
    isGoldenEntry = true;
    momentumText = `🔥 黄金入场契机：过去 ${elapsed} 分钟比分保持 ${current.score.text}，大小球盘口自然掉落 ${Math.abs(ouLineDrop!)} 球，且危险进攻爆发（速率 ${dangerRate}/分，射正+${dSotTotal}），具备极高正期望值(+EV)！`;
  } else if (isHighAttack) {
    momentumSignal = 'HIGH_ATTACK_ACCELERATION';
    momentumText = `⚡ 攻势急剧加速：过去 ${elapsed} 分钟两队危险进攻激增 +${dDangerTotal}（${dangerRate}次/分），射门+${dShotsTotal}（射正+${dSotTotal}），破门预期(xG)急剧攀升。`;
  } else if (Math.abs(possShiftHome) >= 12 && dSotTotal === 0 && dShotsTotal <= 1) {
    momentumSignal = 'PASSIVE_POSSESSION';
    momentumText = `✋ 无效倒脚防范：${possShiftHome > 0 ? '主队' : '客队'}控球率飙升但过去 ${elapsed} 分钟 0 次射正，场面节奏拖沓，严禁盲目追大。`;
  } else {
    momentumSignal = 'BALANCED_STALEMATE';
    momentumText = `⏱️ 跨时段均势拉锯：过去 ${elapsed} 分钟双方攻防平稳过渡，各项指标处于正常衰减通道。`;
  }

  const promptSummary = `【跨批次时序动能与盘口走势（Snapshot Delta & Momentum Analysis）】:
- 时序采样跨度: 上次采样 第 ${previous.minute} 分钟 (比分 ${previous.score.text}) → 当前采样 第 ${current.minute} 分钟 (比分 ${current.score.text})，历时 ${elapsed} 分钟
- 盘口衰减/变动: 大小球盘口变动 ${ouLineDrop !== null ? (ouLineDrop <= 0 ? `掉落 ${Math.abs(ouLineDrop)} 球` : `升盘 +${ouLineDrop} 球`) : '平稳'} (水位变动 ${ouOddsDrift !== null ? (ouOddsDrift >= 0 ? `+${ouOddsDrift}` : `${ouOddsDrift}`) : '0'})
- 攻防统计增量 (过去 ${elapsed} 分钟):
  * 危险进攻净增: +${dDangerTotal} (主+${dDangerHome} / 客+${dDangerAway})，爆发速率: ${dangerRate} 次/分钟 ${dangerRate >= 0.6 ? '【极高强度围攻】' : ''}
  * 射门/射正净增: 射门 +${dShotsTotal}，射正 +${dSotTotal} (主+${dSotHome} / 客+${dSotAway})
  * 角球净增: +${dCornersTotal}
  * 控球率走势: 主队变动 ${possShiftHome >= 0 ? `+${possShiftHome}%` : `${possShiftHome}%`}
  * 红黄牌净增: 黄牌 +${dYellow}，红牌 +${dRed}
- 动能研判结论: [${momentumSignal}] ${momentumText}`;

  return {
    has_history: true,
    sample_count: list.length,
    elapsed_minutes: elapsed,
    previous_sample: previous,
    current_sample: current,
    line_movement: {
      ou_line_drop: ouLineDrop,
      ou_odds_drift: ouOddsDrift,
      handicap_line_drift: handicapDrift,
      status: isLineDropped ? 'LINE_DROP_DECAY' : ouOddsDrift && ouOddsDrift > 0.05 ? 'ODDS_DRIFT_RISE' : 'LINE_STABLE',
      summary: `盘口 ${ouLineDrop !== null ? (ouLineDrop <= 0 ? `衰减 ${Math.abs(ouLineDrop)}球` : `升盘 +${ouLineDrop}球`) : '保持稳定'}`,
    },
    initial_vs_live: initialVsLive,
    stat_acceleration: {
      dangerous_attacks_delta: { home: dDangerHome, away: dDangerAway, total: dDangerTotal },
      dangerous_attacks_rate_per_min: dangerRate,
      shots_delta: { home: dShotsHome, away: dShotsAway, total: dShotsTotal },
      shots_on_target_delta: { home: dSotHome, away: dSotAway, total: dSotTotal },
      corners_delta: { home: dCornersHome, away: dCornersAway, total: dCornersTotal },
      possession_shift: { home_change: possShiftHome, away_change: -possShiftHome, text: `主队 ${possShiftHome >= 0 ? `+${possShiftHome}%` : `${possShiftHome}%`}` },
      cards_delta: { yellow: dYellow, red: dRed },
    },
    momentum_signal: momentumSignal,
    momentum_assessment: momentumText,
    is_golden_entry_point: isGoldenEntry,
    siege_team: siegeTeam,
    ai_prompt_summary: promptSummary,
  };
}

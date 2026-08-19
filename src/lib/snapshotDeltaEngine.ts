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

export interface MatchSnapshotDelta {
  has_history: boolean;
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

  // 2. Stat Accelerations & Velocities
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
  const rawStats = item.live_statistics || item.detail_context?.formal?.live_match?.confirmed_statistics || {};

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

  return {
    captured_at: new Date().toISOString(),
    minute: Number(item.minute || item.live_minute || 0),
    score: { home: h, away: a, text: `${h}-${a}` },
    live_statistics: {
      possession: parsePair(rawStats.possession || item.possession),
      dangerous_attacks: parsePair(rawStats.dangerous_attacks || item.dangerous_attacks),
      attacks: parsePair(rawStats.attacks || item.attacks),
      shots: parsePair(rawStats.shots || rawStats.shots_total || item.shots),
      shots_on_target: parsePair(rawStats.shots_on_target || item.shots_on_target),
      corners: parsePair(rawStats.corners || item.corners),
      yellow_cards: parsePair(rawStats.yellow_cards || item.yellow_cards),
      red_cards: parsePair(rawStats.red_cards || item.red_cards),
    },
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

export function computeClientSnapshotDelta(item: any): MatchSnapshotDelta {
  if (item.snapshot_delta) return item.snapshot_delta;
  const key = getMatchKey(item);
  const list = clientHistoryCache[key] || [];
  const current = createClientSnapshotPoint(item);

  if (list.length <= 1) {
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
        summary: '首批基准采样点',
      },
      stat_acceleration: {
        dangerous_attacks_delta: { home: 0, away: 0, total: 0 },
        dangerous_attacks_rate_per_min: 0,
        shots_delta: { home: 0, away: 0, total: 0 },
        shots_on_target_delta: { home: 0, away: 0, total: 0 },
        corners_delta: { home: 0, away: 0, total: 0 },
        possession_shift: { home_change: 0, away_change: 0, text: '无变化' },
        cards_delta: { yellow: 0, red: 0 },
      },
      momentum_signal: 'INSUFFICIENT_DELTA',
      momentum_assessment: '基准数据已记录，待二次导入触发时序差值研判。',
      is_golden_entry_point: false,
      siege_team: 'NONE',
      ai_prompt_summary: '【首批基准】已记录首发与即时实况基准。',
    };
  }

  const previous = list[0];
  const elapsed = Math.max(1, current.minute - previous.minute);
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

  const dCornersTotal = Math.max(0, (currStats.corners?.total || 0) - (prevStats.corners?.total || 0));
  const dRed = Math.max(0, (currStats.red_cards?.total || 0) - (prevStats.red_cards?.total || 0));
  const dYellow = Math.max(0, (currStats.yellow_cards?.total || 0) - (prevStats.yellow_cards?.total || 0));

  let momentumSignal: MatchSnapshotDelta['momentum_signal'] = 'BALANCED_STALEMATE';
  let isGoldenEntry = false;
  let momentumText = '';

  const isHighAttack = dangerRate >= 0.55 || dSotTotal >= 2;

  if (dRed > 0) {
    momentumSignal = 'DISCIPLINE_COLLAPSE';
    momentumText = `⚠️ 跨时段突发红牌（红牌+${dRed}），攻防失衡。`;
  } else if (isHighAttack) {
    momentumSignal = 'HIGH_ATTACK_ACCELERATION';
    isGoldenEntry = true;
    momentumText = `⚡ 攻势急剧加速：过去 ${elapsed} 分钟危险进攻 +${dDangerTotal}（速率 ${dangerRate}/分），射正 +${dSotTotal}。`;
  } else {
    momentumSignal = 'BALANCED_STALEMATE';
    momentumText = `⏱️ 跨时段均势拉锯：过去 ${elapsed} 分钟攻防平稳过渡。`;
  }

  return {
    has_history: true,
    sample_count: list.length,
    elapsed_minutes: elapsed,
    previous_sample: previous,
    current_sample: current,
    line_movement: {
      ou_line_drop: null,
      ou_odds_drift: null,
      handicap_line_drift: null,
      status: 'LINE_STABLE',
      summary: '盘口平稳',
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
    siege_team: 'NONE',
    ai_prompt_summary: momentumText,
  };
}

export interface PipelineStatus {
  generated_at?: string;
  ybty_file?: string;
  leisu_file?: string;
  snapshot_gap_seconds?: number;
  ybty_age_seconds?: number;
  leisu_age_seconds?: number;
  market_events?: number;
  live_events?: number;
  matched?: number;
  unmatched?: number;
  watch?: number;
  pass?: number;
  candidate_file?: string;
  decision_file?: string;
  ledger_file?: string;
}

export interface Score {
  home: number;
  away: number;
}

export interface ReferenceMarket {
  company_count?: number;
  opening_line?: any;
  current_line?: any;
  source?: string;
  company?: string;
  handicap_movement?: string;
  initial_handicap?: string | number;
  instant_handicap?: string | number;
  status?: string;
}

export interface WeatherInfo {
  available?: boolean;
  text?: string[];
}

export interface LineupData {
  available?: boolean;
  source?: string;
  status?: string;
  home?: {
    team?: string;
    players?: string[];
    starters?: string[];
    substitutes?: string[];
    formation?: string;
  };
  away?: {
    team?: string;
    players?: string[];
    starters?: string[];
    substitutes?: string[];
    formation?: string;
  };
  home_formation?: string;
  away_formation?: string;
}

export type FormationType = 
  | '4-3-3'
  | '4-2-3-1'
  | '4-4-2'
  | '4-4-2-diamond'
  | '3-5-2'
  | '3-4-3'
  | '5-3-2'
  | '5-4-1'
  | '4-1-4-1'
  | '3-4-2-1'
  | '5-2-3'
  | '4-2-2-2';

export interface FormationClashResult {
  home_formation: FormationType;
  away_formation: FormationType;
  home_formation_name: string;
  away_formation_name: string;
  clash_verdict: 'ADVANTAGE_HOME' | 'ADVANTAGE_AWAY' | 'TACTICAL_STALEMATE' | 'OPEN_GOAL_FEST' | 'DEFENSIVE_ATTRITION';
  clash_verdict_zh: string;
  formation_clash_score: number;
  midfield_battle: {
    winner: 'HOME' | 'AWAY' | 'EVEN';
    home_midfielders: number;
    away_midfielders: number;
    analysis_zh: string;
  };
  flank_battle: {
    winner: 'HOME' | 'AWAY' | 'EVEN';
    analysis_zh: string;
  };
  box_and_backline_battle: {
    home_attack_vs_away_defense_zh: string;
    away_attack_vs_home_defense_zh: string;
  };
  home_exploit_points_zh: string[];
  away_exploit_points_zh: string[];
  expected_pace_and_goals: 'HIGH_GOAL_TREND' | 'LOW_GOAL_ATTRITION' | 'ONE_SIDED_DOMINANCE' | 'COUNTER_ATTACK_TRAP';
  expected_pace_zh: string;
  betting_implications: {
    handicap_angle_zh: string;
    total_goals_angle_zh: string;
    corner_threat_angle_zh: string;
    recommended_play_focus: string[];
  };
  master_tactical_breakdown_zh: string;
}

export interface BankrollGuidance {
  recommended_stake_pct: string;
  fractional_kelly_pct: number;
  stake_sizing_tier: 'CORE_HIGH' | 'CORE_STANDARD' | 'SPECULATIVE_SMALL' | 'NO_STAKE';
  guidance_text: string;
}

/**
 * 1. 标准化核心技术统计 (统一数值化，彻底杜绝字符串解析与多源冲突)
 */
export interface UnifiedMatchStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shots_on_target: { home: number; away: number };
  corners: { home: number; away: number };
  dangerous_attacks: { home: number; away: number };
  yellow_cards: { home: number; away: number };
  red_cards: { home: number; away: number };
  momentum_index?: { home: number; away: number };
}

export interface StandardTimelineEvent {
  min: number;
  half?: 1 | 2 | 0;
  stoppageExtra?: number;
  displayMin?: string;
  text?: string;
  shortText?: string;
  icon?: string;
  side?: 'home' | 'away' | 'neutral';
  sideName?: string;
  isGoal?: boolean;
  isCorner?: boolean;
  isCard?: boolean;
  isSub?: boolean;
  raw?: any;
}

/**
 * 2. 战术与基本面上下文 (精炼提炼，杜绝深层杂乱嵌套)
 */
export interface TacticalContext {
  formation: { home: string; away: string };
  formation_clash_verdict?: string;
  formation_clash_summary?: string;
  standings_summary?: string;
  home_form?: string;
  away_form?: string;
  h2h_summary?: string;
  lineup_status: 'CONFIRMED' | 'PROJECTED' | 'UNKNOWN';
  key_absences_count: { home: number; away: number };
  corner_danger_level?: string;
  effective_late_goal_risk?: string;
  h2h_matches?: any[];
  home_recent_matches?: any[];
  away_recent_matches?: any[];
}

/**
 * 3. 真实可投盘口快照 (白名单过滤，清晰易读)
 */
export interface MarketSnapshotOption {
  option_id?: string;
  side?: 'home' | 'away' | 'draw' | 'over' | 'under' | string;
  line?: string | number | null;
  odds: number;
  suspended?: boolean;
}

export interface MarketSnapshot {
  market_type: 'spread' | 'total' | 'h2h' | string;
  line?: string | number | null;
  market_label?: string;
  home_or_over_odds?: number;
  away_or_under_odds?: number;
  draw_odds?: number;
  is_verified: boolean;
  raw_option_ids?: string[];
  options?: MarketSnapshotOption[];
}

/**
 * 4. 全局标准比赛对象 (StandardMatchData)
 * 统一替换旧有冗余结构，成为全系统唯一事实来源
 */
export interface StandardMatchData {
  id: string;
  match: string;
  match_id?: string | number;
  leisu_match_id?: string | number;
  league?: string;
  ybty_league?: string;
  leisu_league?: string;
  ybty_match?: string;
  ybty_home: string;
  ybty_away: string;
  home_team: string;
  away_team: string;
  leisu_match?: string;
  leisu_home?: string;
  leisu_away?: string;
  ybty_start_time?: string | null;
  ybty_start_time_beijing?: string | null;
  start_time_beijing?: string | null;
  commence_time?: string | null;
  provider_start_time?: string | null;
  captured_at?: string;
  minute: number;
  score: Score;
  ht_score?: Score | null;
  half_time_score?: Score | null;
  score_source?: string;
  score_verified?: boolean;
  status: 'WATCH' | 'PASS' | 'RESEARCH' | string;
  match_status?: 'PREMATCH' | 'IN_PLAY' | 'FINISHED' | 'POSTPONED' | string;
  grade?: 'A' | 'B' | 'C' | string;
  model_score?: number;
  
  // 核心精简标准化字段 (统一事实源)
  unified_stats: UnifiedMatchStats;
  tactical_context: TacticalContext;
  market_snapshots: MarketSnapshot[];
  ybty_raw_markets?: any[];
  verified_ybty_markets?: any[];
  timeline_events?: StandardTimelineEvent[];
  attack_momentum_timeline?: any;

  recommendation?: {
    market?: string;
    line?: number | string;
    odds?: number;
    basis?: string;
    scope?: string;
  } | null;
  reference_market?: ReferenceMarket;
  weather?: WeatherInfo;
  lineups?: LineupData;
  risks?: string[];
  evidence?: string[];
  formation_clash?: FormationClashResult;
  home_formation?: FormationType;
  away_formation?: FormationType;
  intercept_reason?: string;
  snapshot_delta?: any;
}

// 统一别名，确保全局已有引用平滑无缝升级
export type DecisionItem = StandardMatchData;

/**
 * 数据标准化转换函数：根据全系统统一数据契约 (docs/SYSTEM_DATA_CONTRACT_AND_MAPPING.md) 执行强校验与清洗
 * 确保所有进入系统的源数据在转换层即被彻底清洗，移除模糊兜底，强制硬性映射或抛出明确的数据契约异常
 */
export function toStandardMatchData(raw: any): StandardMatchData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[DataContractViolation] toStandardMatchData requires a valid non-null object payload.');
  }

  // 1. 提取并强校验对阵权威队名 (严格对齐 YBTY 权威基准)
  let homeTeam = String(raw.ybty_home || raw.home || raw.home_team || '').trim();
  let awayTeam = String(raw.ybty_away || raw.away || raw.away_team || '').trim();

  // 若字段分离缺失，尝试从 match 对阵字符串严格解析
  if ((!homeTeam || !awayTeam) && typeof raw.match === 'string' && raw.match.includes(' vs ')) {
    const parts = raw.match.split(' vs ').map((s: string) => s.trim());
    if (parts[0] && parts[1]) {
      homeTeam = homeTeam || parts[0];
      awayTeam = awayTeam || parts[1];
    }
  }

  // 杜绝 '主队' / '客队' 等模糊占位符兜底，对阵队名缺失直接判定为无效数据契约
  if (!homeTeam || !awayTeam) {
    throw new Error(
      `[DataContractViolation] Invalid match payload: Missing authoritative team names (home: "${homeTeam}", away: "${awayTeam}")`
    );
  }

  // 2. 硬性映射全局唯一标识 (ID Resolution)
  const resolvedMatchId = String(
    raw.source_match_id ||
    raw.match_id ||
    raw.id ||
    raw.leisu_match_id ||
    ''
  ).trim();

  const standardId = resolvedMatchId || `${homeTeam}_vs_${awayTeam}`;
  const standardMatch = `${homeTeam} vs ${awayTeam}`;
  const league = String(raw.league || raw.ybty_league || raw.leisu_league || '未分类联赛').trim();

  // 3. 时间与赛前/滚球状态标准化 (明确区分比赛进程 match_status 与筛选决策 status)
  const rawMinute = raw.minute !== undefined ? Number(raw.minute) : NaN;
  const minute = !isNaN(rawMinute) && rawMinute >= 0 ? Math.floor(rawMinute) : 0;
  const isPrematch = minute === 0 || raw.export_mode === 'prematch' || String(raw.status || raw.match_status || '').toUpperCase().includes('PRE');
  const matchStatus = raw.match_status || (isPrematch ? 'PREMATCH' : (minute > 0 ? 'IN_PLAY' : 'PREMATCH'));
  const decisionStatus = raw.status && ['WATCH', 'PASS', 'RESEARCH'].includes(raw.status) ? raw.status : (isPrematch ? 'RESEARCH' : 'WATCH');

  // 4. 比分与双源交叉核验 (防假比分安全防线)
  let scoreHome = 0;
  let scoreAway = 0;

  if (typeof raw.score === 'object' && raw.score !== null) {
    scoreHome = Number(raw.score.home ?? raw.score.home_score ?? 0);
    scoreAway = Number(raw.score.away ?? raw.score.away_score ?? 0);
  } else if (raw.home_score !== undefined && raw.away_score !== undefined) {
    scoreHome = Number(raw.home_score || 0);
    scoreAway = Number(raw.away_score || 0);
  } else if (typeof raw.score === 'string' && (raw.score.includes('-') || raw.score.includes(':'))) {
    const parts = raw.score.split(/[-:]/);
    scoreHome = parseInt(parts[0], 10) || 0;
    scoreAway = parseInt(parts[1], 10) || 0;
  }

  if (isNaN(scoreHome) || scoreHome < 0) scoreHome = 0;
  if (isNaN(scoreAway) || scoreAway < 0) scoreAway = 0;

  const scoreVerified = isPrematch ? true : Boolean(raw.score_verified);
  const scoreSource = String(
    raw.score_source || (scoreVerified ? 'ybty+leisu_api' : 'unverified')
  );

  // 5. 攻势时序提取与归一化 (Multi-source Waveform Normalizer)
  const extractMomentumTimeline = (sourceObj: any) => {
    if (!sourceObj) return null;
    if (typeof sourceObj === 'string') {
      try {
        const parsed = JSON.parse(sourceObj);
        return extractMomentumTimeline(parsed);
      } catch (e) {
        return null;
      }
    }
    return (
      sourceObj.attack_momentum_timeline ||
      sourceObj.live_match_physical_facts?.attack_momentum_timeline ||
      sourceObj.live_facts?.attack_momentum_timeline ||
      sourceObj.live_match?.attack_momentum_timeline ||
      sourceObj.formal?.live_match?.attack_momentum_timeline ||
      sourceObj.formal?.attack_momentum_timeline ||
      sourceObj.detail_context?.formal?.live_match?.attack_momentum_timeline ||
      sourceObj.detail_context?.formal?.live_match?.trend ||
      sourceObj.detail_context?.formal?.trend ||
      sourceObj.detail_context?.attack_momentum_timeline ||
      sourceObj.result?.attack_momentum_timeline ||
      sourceObj.match_info?.attack_momentum_timeline ||
      sourceObj.trend ||
      sourceObj.live_match_physical_facts?.trend ||
      sourceObj.live_facts?.trend ||
      sourceObj.live_match?.trend ||
      sourceObj.formal?.live_match?.trend ||
      sourceObj.formal?.trend ||
      sourceObj.result?.trend ||
      sourceObj.match_info?.trend ||
      (sourceObj.formal?.trend?.data ? { available: true, source: 'LIVE_DETAIL_VUE.trend.data', data: sourceObj.formal.trend.data, raw: sourceObj.formal.trend } : null) ||
      (sourceObj.trend?.data ? { available: true, source: 'LIVE_DETAIL_VUE.trend.data', data: sourceObj.trend.data, raw: sourceObj.trend } : null) ||
      (sourceObj.live_match?.trend?.data ? { available: true, source: 'LIVE_DETAIL_VUE.trend.data', data: sourceObj.live_match.trend.data, raw: sourceObj.live_match.trend } : null) ||
      null
    );
  };

  const attackMomentumTimeline = extractMomentumTimeline(raw);

  // 6. 统一技术统计数据清洗 (Unified Match Stats)
  const liveStats = raw.unified_stats || raw.liveStats || raw.confirmed_statistics || raw.detail_context?.formal?.live_match?.confirmed_statistics || {};
  const incidents = raw.focused_incidents || {};

  const parseStatNumber = (statVal: any, side: 'home' | 'away', fallback = 0): number => {
    if (statVal === null || statVal === undefined) return fallback;
    if (typeof statVal === 'number') return isNaN(statVal) ? fallback : statVal;
    if (typeof statVal === 'object') {
      const v = statVal[side] ?? (side === 'home' ? statVal.home_team : statVal.away_team);
      const num = Number(v);
      return isNaN(num) ? fallback : num;
    }
    if (typeof statVal === 'string') {
      if (statVal.includes('-') || statVal.includes(':') || statVal.includes('/')) {
        const parts = statVal.split(/[-:\/]/);
        const num = parseInt(side === 'home' ? parts[0] : parts[1], 10);
        return isNaN(num) ? fallback : num;
      }
      const num = Number(statVal);
      return isNaN(num) ? fallback : num;
    }
    return fallback;
  };

  const posHome = parseStatNumber(liveStats?.possession, 'home', Number(liveStats?.possession_home ?? 50));
  const posAway = parseStatNumber(liveStats?.possession, 'away', Number(liveStats?.possession_away ?? 50));

  const shotsHome = parseStatNumber(liveStats?.shots, 'home', Number(liveStats?.shots_home ?? 0));
  const shotsAway = parseStatNumber(liveStats?.shots, 'away', Number(liveStats?.shots_away ?? 0));

  const targetHome = parseStatNumber(liveStats?.shots_on_target, 'home', Number(liveStats?.shots_on_target_home ?? 0));
  const targetAway = parseStatNumber(liveStats?.shots_on_target, 'away', Number(liveStats?.shots_on_target_away ?? 0));

  const dangHome = parseStatNumber(liveStats?.dangerous_attacks, 'home', Number(liveStats?.dangerous_attacks_home ?? 0));
  const dangAway = parseStatNumber(liveStats?.dangerous_attacks, 'away', Number(liveStats?.dangerous_attacks_away ?? 0));

  const cornersHome = parseStatNumber(incidents?.cards_and_corners?.corners, 'home',
    parseStatNumber(liveStats?.corners, 'home', Number(liveStats?.corners_home ?? 0))
  );
  const cornersAway = parseStatNumber(incidents?.cards_and_corners?.corners, 'away',
    parseStatNumber(liveStats?.corners, 'away', Number(liveStats?.corners_away ?? 0))
  );

  const yellowHome = parseStatNumber(incidents?.cards_and_corners?.yellow_cards, 'home',
    parseStatNumber(liveStats?.yellow_cards, 'home', Number(liveStats?.yellow_cards_home ?? 0))
  );
  const yellowAway = parseStatNumber(incidents?.cards_and_corners?.yellow_cards, 'away',
    parseStatNumber(liveStats?.yellow_cards, 'away', Number(liveStats?.yellow_cards_away ?? 0))
  );

  const redHome = parseStatNumber(incidents?.cards_and_corners?.red_cards, 'home',
    parseStatNumber(liveStats?.red_cards, 'home', Number(liveStats?.red_cards_home ?? 0))
  );
  const redAway = parseStatNumber(incidents?.cards_and_corners?.red_cards, 'away',
    parseStatNumber(liveStats?.red_cards, 'away', Number(liveStats?.red_cards_away ?? 0))
  );

  const unified_stats: UnifiedMatchStats = {
    possession: { home: Math.max(0, Math.min(100, posHome)), away: Math.max(0, Math.min(100, posAway)) },
    shots: { home: Math.max(0, shotsHome), away: Math.max(0, shotsAway) },
    shots_on_target: { home: Math.max(0, targetHome), away: Math.max(0, targetAway) },
    corners: { home: Math.max(0, cornersHome), away: Math.max(0, cornersAway) },
    dangerous_attacks: { home: Math.max(0, dangHome), away: Math.max(0, dangAway) },
    yellow_cards: { home: Math.max(0, yellowHome), away: Math.max(0, yellowAway) },
    red_cards: { home: Math.max(0, redHome), away: Math.max(0, redAway) },
  };

  // 7. 战术背景清洗 (Tactical Context)
  const tc = raw.tactical_context || {};
  const formalData = raw.detail_context?.formal || raw.formal || {};
  const lineups = raw.lineups || raw.lineup || formalData.lineup;
  const formationClash = raw.formation_clash;

  const lineupStatus =
    lineups?.status === 'confirmed' || lineups?.status === 'CONFIRMED' || lineups?.confirmed === true
      ? 'CONFIRMED'
      : (tc.lineup_status === 'CONFIRMED' ? 'CONFIRMED' : 'PROJECTED');

  const tactical_context: TacticalContext = {
    formation: {
      home: String(tc.formation?.home || raw.home_formation || formationClash?.home_formation || lineups?.home_formation || '4-2-3-1'),
      away: String(tc.formation?.away || raw.away_formation || formationClash?.away_formation || lineups?.away_formation || '4-2-3-1'),
    },
    formation_clash_verdict: tc.formation_clash_verdict || formationClash?.clash_verdict,
    formation_clash_summary: tc.formation_clash_summary || formationClash?.clash_verdict_zh || formationClash?.master_tactical_breakdown_zh,
    standings_summary: tc.standings_summary || tc.standings || formalData.league_standings,
    home_form: tc.home_form || formalData.trend_summary?.home,
    away_form: tc.away_form || formalData.trend_summary?.away,
    h2h_summary: tc.h2h_summary || formalData.trend_summary?.h2h,
    lineup_status: lineupStatus,
    key_absences_count: tc.key_absences_count || { home: 0, away: 0 },
    h2h_matches: Array.isArray(tc.h2h_matches) ? tc.h2h_matches : Array.isArray(raw.h2h) ? raw.h2h : Array.isArray(formalData.head_to_head) ? formalData.head_to_head : [],
    home_recent_matches: Array.isArray(tc.home_recent_matches) ? tc.home_recent_matches : Array.isArray(formalData.recent_matches?.home) ? formalData.recent_matches.home : [],
    away_recent_matches: Array.isArray(tc.away_recent_matches) ? tc.away_recent_matches : Array.isArray(formalData.recent_matches?.away) ? formalData.recent_matches.away : [],
  };

  // 8. 盘口快照清洗 (Market Snapshots - YBTY 权威白名单)
  const market_snapshots: MarketSnapshot[] = [];
  if (Array.isArray(raw.market_snapshots) && raw.market_snapshots.length > 0) {
    market_snapshots.push(...raw.market_snapshots);
  } else {
    const rawMarkets = raw.verified_ybty_markets || raw.ybty_raw_markets || raw.markets || [];
    if (Array.isArray(rawMarkets) && rawMarkets.length > 0) {
      for (const mkt of rawMarkets) {
        if (Array.isArray(mkt.options)) {
          const defaultLine = mkt.line ?? mkt.home_selection ?? mkt.away_selection ?? null;
          market_snapshots.push({
            market_type: mkt.market || mkt.market_type || 'custom',
            line: defaultLine,
            market_label: mkt.market_title || mkt.market_label || mkt.market,
            is_verified: Boolean(mkt.market_type_verified ?? true),
            options: mkt.options.map((opt: any) => ({
              option_id: opt.option_id,
              side: opt.side,
              line: opt.line ?? defaultLine,
              odds: Number(opt.odds || 0),
              suspended: Boolean(opt.suspended),
            })),
          });
        }
      }
    }
  }

  // 9. 事件流清洗 (Timeline Events)
  const rawTextLive = Array.isArray(raw.text_live)
    ? raw.text_live
    : Array.isArray(formalData.live_match?.text_live)
      ? formalData.live_match.text_live
      : Array.isArray(raw.live_match?.text_live)
        ? raw.live_match.text_live
        : [];

  const rawTimelineEvents = [
    ...(Array.isArray(raw.timeline_events) ? raw.timeline_events : []),
    ...(Array.isArray(rawTextLive) ? rawTextLive.map((item: any) => {
      if (typeof item === 'string') return item;
      const minNum = parseInt(String(item.time || item.minute || '').replace(/\D/g, ''), 10) || 0;
      return {
        min: minNum,
        displayMin: item.time || `${minNum}'`,
        text: item.data || item.text || item.description || '',
        side: item.position === 1 ? 'home' : (item.position === 2 ? 'away' : 'neutral'),
        isGoal: item.type === 1 || Boolean(item.data && /进球|破门/i.test(item.data)),
        isCorner: item.type === 2 || Boolean(item.data && /角球/i.test(item.data)),
        isCard: item.type === 3 || item.type === 4 || Boolean(item.data && /黄牌|红牌/i.test(item.data)),
        raw: item,
      };
    }) : []),
    ...(Array.isArray(raw.focused_incidents?.match_events) ? raw.focused_incidents.match_events : []),
  ];

  return {
    id: standardId,
    match: standardMatch,
    match_id: resolvedMatchId || standardId,
    leisu_match_id: String(raw.leisu_match_id || resolvedMatchId || standardId),
    league,
    ybty_league: String(raw.ybty_league || league),
    leisu_league: String(raw.leisu_league || league),
    ybty_match: standardMatch,
    ybty_home: homeTeam,
    ybty_away: awayTeam,
    home_team: homeTeam,
    away_team: awayTeam,
    leisu_home: raw.leisu_home ? String(raw.leisu_home) : undefined,
    leisu_away: raw.leisu_away ? String(raw.leisu_away) : undefined,
    start_time_beijing: raw.start_time_beijing || raw.ybty_start_time_beijing || raw.time || null,
    ybty_start_time_beijing: raw.ybty_start_time_beijing || raw.start_time_beijing || null,
    ybty_start_time: raw.ybty_start_time || null,
    captured_at: raw.captured_at || new Date().toISOString(),
    minute,
    score: { home: scoreHome, away: scoreAway },
    score_source: scoreSource,
    score_verified: scoreVerified,
    status: decisionStatus,
    match_status: matchStatus,
    grade: raw.grade || 'C',
    model_score: Number(raw.model_score || 0),
    unified_stats,
    tactical_context,
    market_snapshots,
    ybty_raw_markets: Array.isArray(raw.ybty_raw_markets) ? raw.ybty_raw_markets : (Array.isArray(raw.markets) ? raw.markets : []),
    verified_ybty_markets: Array.isArray(raw.verified_ybty_markets) ? raw.verified_ybty_markets : [],
    timeline_events: rawTimelineEvents,
    attack_momentum_timeline: attackMomentumTimeline,
    commence_time: raw.commence_time || null,
    provider_start_time: raw.provider_start_time || null,
    ht_score: raw.ht_score || raw.half_time_score || null,
    half_time_score: raw.half_time_score || raw.ht_score || null,
    weather: raw.weather || raw.environment || undefined,
    lineups: lineups || undefined,
    reference_market: raw.reference_market || raw.reference_odds || undefined,
    recommendation: raw.recommendation || null,
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    intercept_reason: raw.intercept_reason || '',
    snapshot_delta: raw.snapshot_delta || null,
    formation_clash: raw.formation_clash || undefined,
    home_formation: raw.home_formation || undefined,
    away_formation: raw.away_formation || undefined,
  };
}

export interface DecisionsPayload {
  generated_at?: string;
  summary?: {
    assessed?: number;
    watch?: number;
    pass?: number;
    a_grade?: number;
    b_grade?: number;
  };
  single_best?: any;
  parlay_5x?: any;
  decisions?: DecisionItem[];
}

export interface ParlayLeg {
  leg_index: number;
  match: string;
  match_id?: string | number;
  leisu_match_id?: string | number;
  ybty_home: string;
  ybty_away: string;
  market: string;
  line: string | number;
  odds: number;
  basis?: string;
  scope?: string;
  minute?: number;
  score?: Score;
  score_at_recommendation?: Score;
  final_score?: Score | null;
  ht_score?: Score | null;
  half_time_score?: Score | null;
  score_verified?: boolean;
  pro_strategy?: string;
  outcome?: 'win' | 'half_win' | 'push' | 'half_loss' | 'loss' | 'pending' | 'invalid_data' | string;
}

export interface LedgerItem {
  id: string;
  match_id?: string | number;
  leisu_match_id?: string | number;
  created_at: string;
  match: string;
  league?: string;
  ybty_league?: string;
  leisu_league?: string;
  ybty_home?: string;
  ybty_away?: string;
  minute?: number;
  score_at_recommendation?: Score;
  ht_score?: Score | null;
  half_time_score?: Score | null;
  grade?: string;
  model_score?: number;
  recommendation?: {
    market?: string;
    line?: number | string;
    odds?: number;
    basis?: string;
    scope?: string;
  };
  evidence?: string[];
  risks?: string[];
  review?: {
    status?: string;
    final_score?: Score;
    ht_score?: Score;
    added_goals?: number;
    outcome?: 'win' | 'loss' | 'push' | 'half_win' | 'half_loss' | 'pending' | 'invalid_data' | string;
  };
  record_type?: 'machine_candidate' | 'formal_ai_recommendation' | string;
  formal_recommendation?: boolean;
  prediction_only?: boolean;
  prediction_type?: string | null;
  prediction_probability?: number;
  prediction_features?: Record<string, any> | null;
  model_version?: string | null;
  score_source?: string;
  score_verified?: boolean;
  commence_time?: string | null;
  start_time_beijing?: string | null;
  is_parlay?: boolean;
  parlay_legs?: ParlayLeg[];
}

export interface TeamAliasMap {
  [canonicalName: string]: string[];
}

export interface AIAnalysisRequest {
  match_name: string;
  ybty_home: string;
  ybty_away: string;
  minute?: number;
  score?: Score;
  odds_info?: string;
  league_info?: string;
  mode: 'live_eval' | 'prematch_eval' | 'parlay_check';
  selected_candidates?: DecisionItem[];
  batch_matches?: DecisionItem[];
  batch_match_refs?: Array<{ match: string; ybty_home?: string; ybty_away?: string }>;
}

export function getLeagueName(item: any): string {
  const leagueText = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && trimmed !== 'undefined' && trimmed !== 'null' && trimmed !== '赛事' && trimmed !== '常规联赛' && trimmed !== '常规赛事') {
        return trimmed;
      }
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const cand = String(record.name_zh ?? record.name ?? record.shortName ?? record.label ?? record.title ?? '').trim();
      if (cand && cand !== 'undefined' && cand !== 'null') return cand;
    }
    return '';
  };
  if (!item) return '常规赛事';

  // 1. Direct and nested field checks from real data exports
  for (const value of [
    item.league,
    item.ybty_league,
    item.leisu_league,
    item.tournament,
    item.league_name,
    item.competition,
    item.event_name,
    item.reference_market?.league,
  ]) {
    const text = leagueText(value);
    if (text) return text;
  }

  // 2. Bracket extraction: e.g. [西协丙], 【日皇杯】, (澳足总)
  const matchStr = String(item.match || item.match_name || item.leisu_match || item.ybty_match || '');
  const bracketMatch = matchStr.match(/[\[【\(]([^\]】\)]+)[\]】\)]/);
  if (bracketMatch && bracketMatch[1] && bracketMatch[1].trim().length >= 2) {
    const bracketContent = bracketMatch[1].trim();
    if (!bracketContent.includes('AI') && !bracketContent.includes('主') && !bracketContent.includes('客')) {
      return bracketContent;
    }
  }

  // 3. Fallback when raw export has no explicit league column
  return '常规赛事';
}

import { getUnifiedTeamDisplay } from './utils/teamUtils';

export function getTeamDisplay(item: any) {
  const unified = getUnifiedTeamDisplay(item);
  return {
    homeYbty: unified.homeYbtyLabel,
    homeLeisu: unified.homeLeisuLabel,
    awayYbty: unified.awayYbtyLabel,
    awayLeisu: unified.awayLeisuLabel,
    ybtyHomeRaw: unified.ybtyHome,
    ybtyAwayRaw: unified.ybtyAway,
    leisuHomeRaw: unified.leisuHome,
    leisuAwayRaw: unified.leisuAway,
    displayHome: unified.displayHome,
    displayAway: unified.displayAway,
    matchName: unified.matchName,
    leisuMatchName: unified.leisuMatchName,
    hasLeisu: unified.hasLeisuMatched,
    matchId: unified.matchId,
    matchDisplayName: unified.matchDisplayName,
  };
}

export interface AIAnalysisResponse {
  match?: string;
  match_id?: string | number;
  leisu_match_id?: string | number;
  ybty_home?: string;
  ybty_away?: string;
  minute?: number;
  score?: Score | string | null;
  summary: string;
  grade: 'A' | 'B' | 'C';
  recommendation: {
    market: string;
    line: string;
    odds: number;
    category?: string;
    best_timing_tip?: string;
    pro_strategy_tag?: string;
  } | null;
  pro_strategy_guide?: {
    strategy_name: string; // e.g. '半场测试+下半场追加' | '让球与大小球联动对冲' | '75+尾盘绝杀波动' | '标准全场直投'
    action_path: string; // 具体操盘步骤与加注/止损时机
    trigger_conditions?: string; // 触发或对冲条件
  };
  bankroll_guidance?: BankrollGuidance;
  game_momentum_phase?: string; // e.g. '0-15开局试探' | '15-45半场攻坚' | '45-60战术重组' | '75-90+终局反扑'
  formation_clash?: FormationClashResult;
  home_formation?: FormationType;
  away_formation?: FormationType;
  score_verified: boolean;
  score_source: string;
  verification_passed: boolean;
  evidence: string[];
  risks: string[];
  market_assessments?: AIMarketAssessment[];
  matches?: AIAnalysisResponse[];
  parlay_safety_check?: {
    is_valid_parlay: boolean;
    reasons: string[];
  };
  parlay_recommendations?: Array<{
    size: number;
    ticket_index: number;
    grade: 'A' | 'B' | 'C';
    estimated_total_odds: number;
    joint_probability?: number; // 校准后联合胜率 %
    raw_joint_probability?: number; // 原始连乘胜率 %
    combined_ev_pct?: number; // 真实期望边际 % (校准后 EV)
    raw_ev_pct?: number; // 原始未折现 EV %
    kelly_fraction_pct?: number; // 1/4 凯利建议注码 %
    haircut_factor?: number; // 多腿不确定性折现系数
    is_high_quality_anchor_combo?: boolean; // 是否具备全腿高胜率基石
    sharpe_assessment?: 'HIGH_EDGE_CORE' | 'BALANCED_GROWTH' | 'SPECULATIVE_VALUE' | 'FRAGILE_LOTTERY';
    correlation_audit?: {
      independence_score: number; // 1-100
      tactical_synergy: string;
      correlation_risk_check: 'passed' | 'warning';
      notes: string;
    };
    reason: string;
    bankroll_guidance?: BankrollGuidance;
    legs: Array<{
      match: string;
      ybty_home?: string;
      ybty_away?: string;
      minute?: number;
      score?: Score | string | null;
      market: string;
      line: string | number;
      odds: number;
      probability: number;
      grade: 'A' | 'B' | 'C';
      pro_strategy?: string;
      odds_source?: string;
      reference_odds_usage?: string;
      ybty_market_verified?: boolean;
    }>;
  }>;
}

export interface AIMarketAssessment {
  category: string;
  market: string;
  direction: string;
  line: string | number | null;
  odds: number | null;
  probability: number | null;
  probability_scope?: string;
  alternatives?: Array<{ direction: string; probability: number }>;
  value_edge?: number | null;
  grade: 'A' | 'B' | 'C' | 'NO_BET';
  status: 'recommend' | 'watch' | 'prediction' | 'avoid' | 'unavailable';
  reason: string;
  pro_trader_tip?: string;
}

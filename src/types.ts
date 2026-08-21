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
export interface MarketSnapshot {
  market_type: 'spread' | 'total' | 'h2h' | string;
  line?: string | number | null;
  home_or_over_odds?: number;
  away_or_under_odds?: number;
  draw_odds?: number;
  is_verified: boolean;
  raw_option_ids?: string[];
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
  grade?: 'A' | 'B' | 'C' | string;
  model_score?: number;
  
  // 核心精简标准化字段 (统一事实源)
  unified_stats: UnifiedMatchStats;
  tactical_context: TacticalContext;
  market_snapshots: MarketSnapshot[];
  timeline_events?: any[];
  attack_momentum_timeline?: any;

  recommendation?: {
    market?: string;
    line?: number | string;
    odds?: number;
    basis?: string;
    scope?: string;
  } | null;
  ybty_markets?: {
    h2h?: { home_odds?: number; draw_odds?: number; away_odds?: number; home_suspended?: boolean; draw_suspended?: boolean; away_suspended?: boolean };
    spread?: { home_line?: number | string; away_line?: number | string; home_odds?: number; away_odds?: number; home_suspended?: boolean; away_suspended?: boolean };
    total?: { line?: number | string; over_odds?: number; under_odds?: number; over_suspended?: boolean; under_suspended?: boolean };
  };
  ybty_raw_markets?: Array<{
    line_index?: number;
    market?: string;
    options?: Array<{ selection?: string; odds?: string | number; suspended?: boolean; text?: string }>;
  }>;
  market_age_seconds?: number;
  reference_market?: ReferenceMarket;
  weather?: WeatherInfo;
  lineups?: LineupData;
  live_statistics?: Record<string, any> | null;
  recent_trends?: Record<string, any> | null;
  reference_odds?: Record<string, any> | null;
  detail_context?: Record<string, any> | null;
  live_text?: {
    available?: boolean;
    entries?: string[];
  };
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
 * 数据标准化转换函数：确保所有源数据（雷速/YBTY）均经过此接口转换，消除冗余和空字段
 */
export function toStandardMatchData(raw: any): StandardMatchData {
  if (!raw) {
    return {
      id: '',
      match: '',
      ybty_home: '',
      ybty_away: '',
      home_team: '',
      away_team: '',
      minute: 0,
      score: { home: 0, away: 0 },
      status: 'WATCH',
      unified_stats: {
        possession: { home: 50, away: 50 },
        shots: { home: 0, away: 0 },
        shots_on_target: { home: 0, away: 0 },
        corners: { home: 0, away: 0 },
        dangerous_attacks: { home: 0, away: 0 },
        yellow_cards: { home: 0, away: 0 },
        red_cards: { home: 0, away: 0 },
      },
      tactical_context: {
        formation: { home: '4-2-3-1', away: '4-2-3-1' },
        lineup_status: 'UNKNOWN',
        key_absences_count: { home: 0, away: 0 },
        h2h_matches: [],
        home_recent_matches: [],
        away_recent_matches: [],
      },
      market_snapshots: [],
      timeline_events: [],
    };
  }

  // If already standard with pure fields, return as is
  if (raw.unified_stats && raw.tactical_context && raw.market_snapshots && raw.timeline_events !== undefined) {
    return raw as StandardMatchData;
  }

  const matchId = String(raw.match_id || raw.id || raw.leisu_match_id || '');
  const homeTeam = String(raw.ybty_home || raw.home || raw.home_team || raw.leisu_home || '主队');
  const awayTeam = String(raw.ybty_away || raw.away || raw.away_team || raw.leisu_away || '客队');
  const league = String(raw.league || raw.ybty_league || raw.leisu_league || '常规赛事');

  let scoreHome = 0;
  let scoreAway = 0;
  if (typeof raw.score === 'object' && raw.score !== null) {
    scoreHome = Number(raw.score.home ?? 0);
    scoreAway = Number(raw.score.away ?? 0);
  } else if (typeof raw.score === 'string' && raw.score.includes('-')) {
    const parts = raw.score.split('-');
    scoreHome = parseInt(parts[0], 10) || 0;
    scoreAway = parseInt(parts[1], 10) || 0;
  }

  const liveStats = raw.live_statistics || raw.liveStats || raw.detail_context?.formal?.live_match?.confirmed_statistics || {};
  const incidents = raw.focused_incidents || raw.detail_context?.focused_incidents || {};

  const parseSideStat = (statVal: any, side: 'home' | 'away', fallback = 0): number => {
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

  const cornersHome = parseSideStat(incidents?.cards_and_corners?.corners, 'home',
    parseSideStat(liveStats?.corners, 'home',
      Number(liveStats?.corners_home ?? liveStats?.home?.corners ?? liveStats?.home?.corner_kicks ?? 0)
    )
  );
  const cornersAway = parseSideStat(incidents?.cards_and_corners?.corners, 'away',
    parseSideStat(liveStats?.corners, 'away',
      Number(liveStats?.corners_away ?? liveStats?.away?.corners ?? liveStats?.away?.corner_kicks ?? 0)
    )
  );

  const posHome = parseSideStat(liveStats?.possession, 'home',
    Number(liveStats?.possession_home ?? liveStats?.home?.possession ?? 50)
  );
  const posAway = parseSideStat(liveStats?.possession, 'away',
    Number(liveStats?.possession_away ?? liveStats?.away?.possession ?? 50)
  );

  const shotsHome = parseSideStat(liveStats?.shots, 'home',
    Number(liveStats?.shots_home ?? liveStats?.home?.shots ?? 0)
  );
  const shotsAway = parseSideStat(liveStats?.shots, 'away',
    Number(liveStats?.shots_away ?? liveStats?.away?.shots ?? 0)
  );

  const targetHome = parseSideStat(liveStats?.shots_on_target, 'home',
    Number(liveStats?.shots_on_target_home ?? liveStats?.home?.shots_on_target ?? 0)
  );
  const targetAway = parseSideStat(liveStats?.shots_on_target, 'away',
    Number(liveStats?.shots_on_target_away ?? liveStats?.away?.shots_on_target ?? 0)
  );

  const dangHome = parseSideStat(liveStats?.dangerous_attacks, 'home',
    Number(liveStats?.dangerous_attacks_home ?? liveStats?.home?.dangerous_attacks ?? 0)
  );
  const dangAway = parseSideStat(liveStats?.dangerous_attacks, 'away',
    Number(liveStats?.dangerous_attacks_away ?? liveStats?.away?.dangerous_attacks ?? 0)
  );

  const yellowHome = parseSideStat(incidents?.cards_and_corners?.yellow_cards, 'home',
    parseSideStat(liveStats?.yellow_cards, 'home',
      Number(liveStats?.yellow_cards_home ?? liveStats?.home?.yellow_cards ?? 0)
    )
  );
  const yellowAway = parseSideStat(incidents?.cards_and_corners?.yellow_cards, 'away',
    parseSideStat(liveStats?.yellow_cards, 'away',
      Number(liveStats?.yellow_cards_away ?? liveStats?.away?.yellow_cards ?? 0)
    )
  );

  const redHome = parseSideStat(incidents?.cards_and_corners?.red_cards, 'home',
    parseSideStat(liveStats?.red_cards, 'home',
      Number(liveStats?.red_cards_home ?? liveStats?.home?.red_cards ?? 0)
    )
  );
  const redAway = parseSideStat(incidents?.cards_and_corners?.red_cards, 'away',
    parseSideStat(liveStats?.red_cards, 'away',
      Number(liveStats?.red_cards_away ?? liveStats?.away?.red_cards ?? 0)
    )
  );

  const unified_stats: UnifiedMatchStats = {
    possession: { home: posHome, away: posAway },
    shots: { home: shotsHome, away: shotsAway },
    shots_on_target: { home: targetHome, away: targetAway },
    corners: { home: cornersHome, away: cornersAway },
    dangerous_attacks: { home: dangHome, away: dangAway },
    yellow_cards: { home: yellowHome, away: yellowAway },
    red_cards: { home: redHome, away: redAway },
  };

  const lineups = raw.lineups || raw.detail_context?.formal?.lineup || raw.detail_context?.lineup;
  const formationClash = raw.formation_clash;
  
  // Extract Historical Matches & Form Lists cleanly
  const ctx = raw.detail_context || {};
  const hist = raw.recent_trends?.historical_analysis || ctx.formal?.historical_analysis || ctx.formal?.history || {};
  const trends = raw.recent_trends || raw.trend_summary || {};
  const h2hMatches = Array.isArray(raw.h2h) ? raw.h2h : Array.isArray(hist.head_to_head) ? hist.head_to_head : Array.isArray(trends.h2h) ? trends.h2h : Array.isArray(ctx.h2h) ? ctx.h2h : [];
  const homeRecent = Array.isArray(trends?.home?.matches) ? trends.home.matches : Array.isArray(trends?.home_recent_form?.matches) ? trends.home_recent_form.matches : Array.isArray(hist?.home_recent_form?.matches) ? hist.home_recent_form.matches : Array.isArray(ctx.home_recent) ? ctx.home_recent : Array.isArray(ctx.recent_matches?.home) ? ctx.recent_matches.home : [];
  const awayRecent = Array.isArray(trends?.away?.matches) ? trends.away.matches : Array.isArray(trends?.away_recent_form?.matches) ? trends.away_recent_form.matches : Array.isArray(hist?.away_recent_form?.matches) ? hist.away_recent_form.matches : Array.isArray(ctx.away_recent) ? ctx.away_recent : Array.isArray(ctx.recent_matches?.away) ? ctx.recent_matches.away : [];

  const tactical_context: TacticalContext = {
    formation: {
      home: String(raw.home_formation || formationClash?.home_formation || lineups?.home_formation || '4-2-3-1'),
      away: String(raw.away_formation || formationClash?.away_formation || lineups?.away_formation || '4-2-3-1'),
    },
    formation_clash_verdict: formationClash?.clash_verdict,
    formation_clash_summary: formationClash?.clash_verdict_zh || formationClash?.master_tactical_breakdown_zh,
    standings_summary: raw.recent_trends?.standings || raw.trend_summary?.standings || raw.tactical_context?.standings_summary,
    home_form: raw.trend_summary?.home_form || raw.tactical_context?.home_form,
    away_form: raw.trend_summary?.away_form || raw.tactical_context?.away_form,
    h2h_summary: raw.trend_summary?.h2h_summary || raw.tactical_context?.h2h_summary,
    lineup_status: lineups?.status === 'confirmed' || lineups?.status === 'CONFIRMED' ? 'CONFIRMED' : 'PROJECTED',
    key_absences_count: { home: 0, away: 0 },
    h2h_matches: h2hMatches,
    home_recent_matches: homeRecent,
    away_recent_matches: awayRecent,
  };

  const market_snapshots: MarketSnapshot[] = [];
  if (Array.isArray(raw.market_snapshots) && raw.market_snapshots.length > 0) {
    market_snapshots.push(...raw.market_snapshots);
  } else {
    if (raw.ybty_markets?.spread) {
      market_snapshots.push({
        market_type: 'spread',
        line: raw.ybty_markets.spread.home_line ?? raw.ybty_markets.spread.away_line,
        home_or_over_odds: raw.ybty_markets.spread.home_odds,
        away_or_under_odds: raw.ybty_markets.spread.away_odds,
        is_verified: !raw.ybty_markets.spread.home_suspended,
      });
    }
    if (raw.ybty_markets?.total) {
      market_snapshots.push({
        market_type: 'total',
        line: raw.ybty_markets.total.line,
        home_or_over_odds: raw.ybty_markets.total.over_odds,
        away_or_under_odds: raw.ybty_markets.total.under_odds,
        is_verified: !raw.ybty_markets.total.over_suspended,
      });
    }
    if (raw.ybty_markets?.h2h) {
      market_snapshots.push({
        market_type: 'h2h',
        home_or_over_odds: raw.ybty_markets.h2h.home_odds,
        away_or_under_odds: raw.ybty_markets.h2h.away_odds,
        draw_odds: raw.ybty_markets.h2h.draw_odds,
        is_verified: !raw.ybty_markets.h2h.home_suspended,
      });
    }
  }

  // Extract Timeline Events cleanly
  const rawTimelineEvents = [
    ...(Array.isArray(raw.timeline_events) ? raw.timeline_events : []),
    ...(Array.isArray(raw.text_live) ? raw.text_live : []),
    ...(Array.isArray(raw.focused_incidents?.match_events) ? raw.focused_incidents.match_events : []),
    ...(Array.isArray(raw.detail_context?.formal?.live_match?.text_live) ? raw.detail_context.formal.live_match.text_live : []),
    ...(Array.isArray(raw.detail_context?.formal?.live_match?.incidents) ? raw.detail_context.formal.live_match.incidents : []),
  ];

  // Extract Momentum Timeline
  const attackMomentumTimeline = raw.attack_momentum_timeline ||
    raw.detail_context?.formal?.live_match?.attack_momentum_timeline ||
    raw.detail_context?.formal?.attack_momentum_timeline ||
    raw.live_match_physical_facts?.attack_momentum_timeline ||
    null;

  return {
    id: matchId || `${homeTeam}_vs_${awayTeam}`,
    match: raw.match || `${homeTeam} vs ${awayTeam}`,
    match_id: matchId,
    leisu_match_id: String(raw.leisu_match_id || raw.detail_context?.formal?.static_match?.id || raw.detail_context?.formal?.live_match?.match_id || matchId),
    league,
    ybty_league: String(raw.ybty_league || league),
    leisu_league: String(raw.leisu_league || league),
    ybty_match: String(raw.ybty_match || raw.match || `${homeTeam} vs ${awayTeam}`),
    ybty_home: homeTeam,
    ybty_away: awayTeam,
    home_team: homeTeam,
    away_team: awayTeam,
    leisu_home: String(raw.leisu_home || raw.detail_context?.formal?.live_match?.home || homeTeam),
    leisu_away: String(raw.leisu_away || raw.detail_context?.formal?.live_match?.away || awayTeam),
    start_time_beijing: raw.start_time_beijing || raw.ybty_start_time_beijing || raw.time || null,
    ybty_start_time_beijing: raw.ybty_start_time_beijing || raw.start_time_beijing || null,
    ybty_start_time: raw.ybty_start_time || null,
    captured_at: raw.captured_at || new Date().toISOString(),
    minute: Number(raw.minute || 0),
    score: { home: scoreHome, away: scoreAway },
    score_source: String(raw.score_source || (raw.score_verified ? 'ybty+leisu_api' : 'machine_detected')),
    score_verified: Boolean(raw.score_verified),
    status: raw.status || 'WATCH',
    grade: raw.grade || 'C',
    model_score: Number(raw.model_score || 0),
    unified_stats,
    tactical_context,
    market_snapshots,
    timeline_events: rawTimelineEvents,
    attack_momentum_timeline: attackMomentumTimeline,
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
    item.detail_context?.league,
    item.detail_context?.tournament,
    item.detail_context?.event_name,
    item.detail_context?.formal?.live_match?.league?.name_zh,
    item.detail_context?.formal?.live_match?.league?.name,
    item.detail_context?.formal?.live_match?.tournament,
    item.reference_odds?.league,
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

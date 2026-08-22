import { StandardMatchData, Score, UnifiedMatchStats, TacticalContext, MarketSnapshot } from '../types';

/**
 * 安全解析数值，防止 NaN 或 undefined
 */
export function safeNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

/**
 * 将任意候选数据或比赛对象安全归一化为 StandardMatchData 契约对象
 */
export function adaptToStandardMatch(raw: any): StandardMatchData {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'unknown_match',
      match: '未命名对阵',
      home_team: '未知主队',
      away_team: '未知客队',
      ybty_home: '未知主队',
      ybty_away: '未知客队',
      minute: 0,
      score: { home: 0, away: 0 },
      status: 'RESEARCH',
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
        formation: { home: 'UNKNOWN', away: 'UNKNOWN' },
        lineup_status: 'PROJECTED',
        key_absences_count: { home: 0, away: 0 },
        h2h_matches: [],
        home_recent_matches: [],
        away_recent_matches: [],
      },
      market_snapshots: [],
    };
  }

  // 1. 队名提取（严格以 YBTY 原始队名为基准）
  const homeTeam = String(raw.ybty_home || raw.home || raw.home_team || raw.match?.split(' vs ')?.[0] || '待定主队').trim();
  const awayTeam = String(raw.ybty_away || raw.away || raw.away_team || raw.match?.split(' vs ')?.[1] || '待定客队').trim();
  const matchId = String(raw.id || raw.match_id || raw.source_match_id || raw.leisu_match_id || `${homeTeam}_vs_${awayTeam}`);
  const matchName = String(raw.match || raw.ybty_match || `${homeTeam} vs ${awayTeam}`);
  const league = String(raw.league || raw.ybty_league || raw.leisu_league || '常规赛事');

  // 2. 比分提取
  let score: Score = { home: 0, away: 0 };
  if (raw.score && typeof raw.score === 'object') {
    score = {
      home: safeNumber(raw.score.home ?? raw.score.home_score),
      away: safeNumber(raw.score.away ?? raw.score.away_score),
    };
  } else if (raw.home_score !== undefined && raw.away_score !== undefined) {
    score = {
      home: safeNumber(raw.home_score),
      away: safeNumber(raw.away_score),
    };
  }

  // 3. 技术统计归一化
  const statsRaw = raw.unified_stats || raw.live_statistics || raw.live_facts?.stats || raw.liveStats || raw.confirmed_statistics || raw.detail_context?.formal?.live_match?.confirmed_statistics || raw.formal?.live_match?.confirmed_statistics || {};
  const unified_stats: UnifiedMatchStats = {
    possession: {
      home: safeNumber(statsRaw.possession?.home ?? statsRaw.possession_home, 50),
      away: safeNumber(statsRaw.possession?.away ?? statsRaw.possession_away, 50),
    },
    shots: {
      home: safeNumber(statsRaw.shots?.home ?? (safeNumber(statsRaw.shots_on_target?.home) + safeNumber(statsRaw.shots_off_target?.home))),
      away: safeNumber(statsRaw.shots?.away ?? (safeNumber(statsRaw.shots_on_target?.away) + safeNumber(statsRaw.shots_off_target?.away))),
    },
    shots_on_target: {
      home: safeNumber(statsRaw.shots_on_target?.home ?? statsRaw.shots_on_target_home),
      away: safeNumber(statsRaw.shots_on_target?.away ?? statsRaw.shots_on_target_away),
    },
    corners: {
      home: safeNumber(statsRaw.corners?.home ?? statsRaw.corners_home),
      away: safeNumber(statsRaw.corners?.away ?? statsRaw.corners_away),
    },
    dangerous_attacks: {
      home: safeNumber(statsRaw.dangerous_attacks?.home ?? statsRaw.dangerous_attacks_home),
      away: safeNumber(statsRaw.dangerous_attacks?.away ?? statsRaw.dangerous_attacks_away),
    },
    yellow_cards: {
      home: safeNumber(statsRaw.yellow_cards?.home ?? statsRaw.yellow_cards_home),
      away: safeNumber(statsRaw.yellow_cards?.away ?? statsRaw.yellow_cards_away),
    },
    red_cards: {
      home: safeNumber(statsRaw.red_cards?.home ?? statsRaw.red_cards_home),
      away: safeNumber(statsRaw.red_cards?.away ?? statsRaw.red_cards_away),
    },
  };

  // 4. 战术与基本面上下文
  const tcRaw = raw.tactical_context || {};
  const formalData = raw.detail_context?.formal || raw.formal || {};
  const lineups = raw.lineups || raw.lineup || formalData.lineup;

  const homeFormationVal = tcRaw.formation?.home || raw.home_formation || lineups?.home_formation;
  const awayFormationVal = tcRaw.formation?.away || raw.away_formation || lineups?.away_formation;

  const tactical_context: TacticalContext = {
    formation: {
      home: homeFormationVal ? String(homeFormationVal) : 'UNKNOWN',
      away: awayFormationVal ? String(awayFormationVal) : 'UNKNOWN',
    },
    formation_clash_verdict: tcRaw.formation_clash_verdict || raw.formation_clash?.clash_verdict,
    formation_clash_summary: tcRaw.formation_clash_summary || raw.formation_clash?.clash_verdict_zh,
    standings_summary: tcRaw.standings_summary || formalData.league_standings,
    home_form: tcRaw.home_form || formalData.trend_summary?.home,
    away_form: tcRaw.away_form || formalData.trend_summary?.away,
    h2h_summary: tcRaw.h2h_summary || formalData.trend_summary?.h2h,
    lineup_status: (lineups?.confirmed || lineups?.status === 'confirmed' || tcRaw.lineup_status === 'CONFIRMED') ? 'CONFIRMED' : 'PROJECTED',
    key_absences_count: tcRaw.key_absences_count || { home: 0, away: 0 },
    h2h_matches: Array.isArray(tcRaw.h2h_matches) ? tcRaw.h2h_matches : (Array.isArray(formalData.head_to_head) ? formalData.head_to_head : []),
    home_recent_matches: Array.isArray(tcRaw.home_recent_matches) ? tcRaw.home_recent_matches : (Array.isArray(formalData.recent_matches?.home) ? formalData.recent_matches.home : []),
    away_recent_matches: Array.isArray(tcRaw.away_recent_matches) ? tcRaw.away_recent_matches : (Array.isArray(formalData.recent_matches?.away) ? formalData.recent_matches.away : []),
    // 雷速 5 大维度
    head_to_head: raw.head_to_head || tcRaw.head_to_head || formalData.head_to_head || undefined,
    recent_matches: raw.recent_matches || tcRaw.recent_matches || formalData.recent_matches || undefined,
    league_standings: raw.league_standings || tcRaw.league_standings || tcRaw.standings_summary || formalData.league_standings || undefined,
    goal_distribution: raw.goal_distribution || tcRaw.goal_distribution || formalData.goal_distribution || undefined,
    trend_summary: raw.trend_summary || tcRaw.trend_summary || formalData.trend_summary || undefined,
  };

  // 5. 盘口快照
  const market_snapshots: MarketSnapshot[] = Array.isArray(raw.market_snapshots) ? raw.market_snapshots : [];

  return {
    id: matchId,
    match: matchName,
    match_id: matchId,
    leisu_match_id: raw.leisu_match_id || raw.provider_event_id,
    league,
    ybty_league: raw.ybty_league || league,
    leisu_league: raw.leisu_league || league,
    ybty_match: matchName,
    ybty_home: homeTeam,
    ybty_away: awayTeam,
    home_team: homeTeam,
    away_team: awayTeam,
    leisu_home: raw.leisu_home,
    leisu_away: raw.leisu_away,
    start_time_beijing: raw.start_time_beijing || raw.ybty_start_time_beijing || raw.time || null,
    ybty_start_time_beijing: raw.ybty_start_time_beijing || raw.start_time_beijing || null,
    ybty_start_time: raw.ybty_start_time || null,
    captured_at: raw.captured_at || new Date().toISOString(),
    minute: safeNumber(raw.minute),
    score,
    score_source: raw.score_source || (raw.score_verified ? 'verified_api' : 'unverified'),
    score_verified: Boolean(raw.score_verified),
    status: raw.status || 'WATCH',
    match_status: raw.match_status || (safeNumber(raw.minute) > 0 ? 'IN_PLAY' : 'PREMATCH'),
    grade: raw.grade || 'C',
    model_score: safeNumber(raw.model_score),
    unified_stats,
    tactical_context,
    market_snapshots,
    ybty_raw_markets: raw.ybty_raw_markets || raw.markets || [],
    verified_ybty_markets: raw.verified_ybty_markets || [],
    timeline_events: raw.timeline_events || [],
    attack_momentum_timeline: raw.attack_momentum_timeline || raw.recent_trends?.attack_momentum_timeline || null,
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
    formation_clash: raw.formation_clash || undefined,
    home_formation: raw.home_formation || undefined,
    away_formation: raw.away_formation || undefined,
    intercept_reason: raw.intercept_reason || '',

    // 雷速 5 大维度顶层挂载
    head_to_head: tactical_context.head_to_head,
    recent_matches: tactical_context.recent_matches,
    league_standings: tactical_context.league_standings,
    goal_distribution: tactical_context.goal_distribution,
    trend_summary: tactical_context.trend_summary,
  };
}

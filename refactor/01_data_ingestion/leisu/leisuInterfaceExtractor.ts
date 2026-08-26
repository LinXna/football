/**
 * 01 数据摄取层 - 雷速 (Leisu) 接口数据纯净提取器
 * 
 * 核心设计准则：
 * 1. 强类型零 any，运行时守卫与防御性类型校验
 * 2. 纯函数无副作用，严禁 In-Place Mutation
 * 3. 彻底剔除冗余字段 (score_source, source, is_goal 等布尔标志)
 * 4. 8大攻防统计纯数值化转换 (shots = on_target + off_target)
 * 5. 使用集中枚举管理器进行文字直播事件与球员事件解析，新类型自动收集告警
 * 6. 准确提取球队 ID (home_team_id, away_team_id) 与球场 Venue 信息
 */

import {
  LeisuRawRoot,
  LeisuRawResult,
  LeisuRawFormal,
  LeisuRawLiveMatch,
  LeisuRawConfirmedStatistics,
  LeisuRawMetricPair,
  LeisuRawPlayer,
  LeisuRawPlayerIncident,
  LeisuRawVenue,
  LeisuRawOddsPhase,
  LeisuRawOddsHandicap,
  LeisuRawOddsWinner,
  LeisuRawOddsTotal,
  LeisuRawOddsCorners,
  LeisuRawStandingRecord,
  LeisuRawTeamStanding,
  LeisuRawLeagueStandings,
  LeisuRawGoalDistributionScope,
  LeisuRawTeamGoalDistribution,
  LeisuRawGoalDistribution,
  LeisuRawRecentMatch,
  LeisuRawH2HMatch,
  ParsedLeisuRoot,
  ParsedLeisuMatch,
  ParsedLeisuStats,
  ParsedLeisuEnvironment,
  ParsedLeisuVenue,
  ParsedLeisuMomentum,
  ParsedLeisuTimelineEvent,
  ParsedPlayerIncident,
  ParsedLeisuLineup,
  ParsedPlayer,
  ParsedLeisuOddsMatrix,
  ParsedOddsPhaseGroup,
  ParsedHandicapMarket,
  ParsedWinnerMarket,
  ParsedTotalMarket,
  ParsedCornerMarket,
  ParsedLeisuTacticalContext,
  ParsedStandingRecord,
  ParsedTeamStanding,
  ParsedLeagueStandings,
  ParsedGoalInterval,
  ParsedGoalDistributionScope,
  ParsedTeamGoalDistribution,
  ParsedGoalDistribution,
  ScorePair,
  MetricPair,
} from "./types";

import {
  leisuEnumManager,
  LeisuMatchStatus,
  LeisuMatchSide,
  LeisuPlayerStatus,
  LEISU_MATCH_STATUS_NAMES,
  LEISU_PLAYER_STATUS_NAMES,
} from "./enums";

// ==========================================
// 辅助纯函数与数值安全转换器
// ==========================================

export function safeNumber(val: unknown, fallback: number = 0): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const parsed = parseFloat(val.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function safeNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const parsed = parseFloat(val.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseStatusIdToText(statusId: number): string {
  return LEISU_MATCH_STATUS_NAMES[statusId] || (statusId > 1 && statusId < 8 ? "进行中" : "未知");
}

export function isLiveStatus(statusId: number): boolean {
  return statusId >= LeisuMatchStatus.FIRST_HALF && statusId <= LeisuMatchStatus.PENALTY_SHOOTOUT;
}

export function extractLatestMinute(liveMatch?: LeisuRawLiveMatch | null): number | null {
  if (!liveMatch || !Array.isArray(liveMatch.text_live)) return null;
  let maxMin = 0;
  for (const entry of liveMatch.text_live) {
    const timeStr = String(entry.time || "");
    const match = timeStr.match(/(\d{1,3})/);
    if (match) {
      const min = parseInt(match[1], 10);
      if (min > maxMin) maxMin = min;
    }
  }
  return maxMin > 0 ? maxMin : null;
}

export function parseMetricPair(pair?: LeisuRawMetricPair | null): MetricPair {
  return {
    home: safeNumber(pair?.home, 0),
    away: safeNumber(pair?.away, 0),
  };
}

export function parseConfirmedStats(rawStats?: LeisuRawConfirmedStatistics | null): ParsedLeisuStats {
  const corners = parseMetricPair(rawStats?.corners);
  const yellow_cards = parseMetricPair(rawStats?.yellow_cards);
  const red_cards = parseMetricPair(rawStats?.red_cards);
  const attacks = parseMetricPair(rawStats?.attacks);
  const dangerous_attacks = parseMetricPair(rawStats?.dangerous_attacks);
  const possession = parseMetricPair(rawStats?.possession);
  const shots_on_target = parseMetricPair(rawStats?.shots_on_target);
  const shots_off_target = parseMetricPair(rawStats?.shots_off_target);

  const shots: MetricPair = {
    home: shots_on_target.home + shots_off_target.home,
    away: shots_on_target.away + shots_off_target.away,
  };

  return {
    corners,
    yellow_cards,
    red_cards,
    attacks,
    dangerous_attacks,
    possession,
    shots_on_target,
    shots_off_target,
    shots,
  };
}

export function parseMomentumTimeline(raw?: LeisuRawLiveMatch["attack_momentum_timeline"] | null): ParsedLeisuMomentum {
  if (!raw || !raw.available || !Array.isArray(raw.data) || raw.data.length === 0) {
    return {
      available: false,
      segment_count: 0,
      nominal_segment_minutes: null,
      data: [],
    };
  }

  const cleanData: number[][] = raw.data.map((segment) =>
    Array.isArray(segment) ? segment.map((num) => safeNumber(num, 0)) : []
  );

  return {
    available: true,
    segment_count: safeNumber(raw.segment_count, cleanData.length),
    nominal_segment_minutes: safeNullableNumber(raw.nominal_segment_minutes),
    data: cleanData,
  };
}

export function parseTimelineEvents(rawEvents?: LeisuRawLiveMatch["text_live"] | null): ParsedLeisuTimelineEvent[] {
  if (!rawEvents || !Array.isArray(rawEvents)) return [];

  return rawEvents.map((e) => {
    const rawTime = String(e.time || "").trim();
    const timeMatch = rawTime.match(/(\d{1,3})/);
    const minute = timeMatch ? parseInt(timeMatch[1], 10) : null;
    const rawType = safeNumber(e.type, 0);
    const rawPos = safeNumber(e.position, 0);
    const side = rawPos === 1 ? LeisuMatchSide.HOME : rawPos === 2 ? LeisuMatchSide.AWAY : LeisuMatchSide.NEUTRAL;
    const text = String(e.data || "").trim();

    const typeInfo = leisuEnumManager.resolveTimelineEventType(rawType, text);

    return {
      minute,
      type: typeInfo.code,
      type_name: typeInfo.name,
      side,
      text,
    };
  });
}

export function parsePlayerIncident(rawInc: LeisuRawPlayerIncident): ParsedPlayerIncident {
  const rawType = safeNumber(rawInc.type, 0);
  const reasonDesc = rawInc.reason_desc ? String(rawInc.reason_desc).trim() : null;
  const reasonType = rawInc.reason_type ? String(rawInc.reason_type).trim() : null;
  const time = safeNullableNumber(rawInc.time);

  const typeInfo = leisuEnumManager.resolvePlayerIncidentType(rawType, reasonDesc || reasonType || undefined);

  return {
    type: typeInfo.code,
    type_name: typeInfo.name,
    time,
    reason_type: reasonType,
    reason_desc: reasonDesc,
  };
}

export function parsePlayer(raw: LeisuRawPlayer, options?: { isInjury?: boolean; defaultStarter?: boolean }): ParsedPlayer {
  const isInjury = options?.isInjury === true;
  const isStarter = options?.defaultStarter !== undefined ? options.defaultStarter : (raw.starter === true || safeNumber(raw.status) === 1);
  const statusInfo = leisuEnumManager.resolvePlayerStatus(raw.status, {
    isStarter,
    isInjury,
    playerName: raw.name || undefined,
  });

  const incidents: ParsedPlayerIncident[] = Array.isArray(raw.incidents)
    ? raw.incidents.map(parsePlayerIncident)
    : [];

  return {
    player_id: safeNullableNumber(raw.player_id),
    team_id: safeNullableNumber(raw.team_id),
    name: String(raw.name || "").trim(),
    shirt_number: safeNullableNumber(raw.shirt_number),
    status: statusInfo.code,
    status_name: statusInfo.name,
    starter: isStarter,
    captain: safeNumber(raw.captain, 0) === 1,
    best_player: Boolean(raw.best_player),
    rating: safeNullableNumber(raw.rating),
    age: safeNullableNumber(raw.age),
    height: safeNullableNumber(raw.height),
    market_value: safeNullableNumber(raw.market_value),
    market_value_text: raw.market_value_text ? String(raw.market_value_text).trim() : null,
    position: raw.position ? String(raw.position).trim() : null,
    position_name: raw.position_name ? String(raw.position_name).trim() : null,
    position_code: raw.position_code ? String(raw.position_code).trim() : null,
    incidents,
  };
}

export function parseVenue(rawVenue?: LeisuRawVenue | null): ParsedLeisuVenue | null {
  if (!rawVenue || (!rawVenue.name && !rawVenue.city && !rawVenue.country)) {
    return null;
  }
  return {
    name: rawVenue.name ? String(rawVenue.name).trim() : null,
    city: rawVenue.city ? String(rawVenue.city).trim() : null,
    country: rawVenue.country ? String(rawVenue.country).trim() : null,
    capacity: safeNullableNumber(rawVenue.capacity),
  };
}

export function parseLineups(rawLineup?: LeisuRawFormal["lineup"] | null): ParsedLeisuLineup {
  const confirmed = Boolean(rawLineup?.confirmed);
  const venue = parseVenue(rawLineup?.venue);
  const homeRaw = Array.isArray(rawLineup?.home) ? rawLineup.home : [];
  const awayRaw = Array.isArray(rawLineup?.away) ? rawLineup.away : [];
  const homeInjuriesRaw = Array.isArray(rawLineup?.home_injuries) ? rawLineup.home_injuries : [];
  const awayInjuriesRaw = Array.isArray(rawLineup?.away_injuries) ? rawLineup.away_injuries : [];

  const homeParsed = homeRaw.map((p) => parsePlayer(p));
  const awayParsed = awayRaw.map((p) => parsePlayer(p));

  return {
    confirmed,
    venue,
    home_formation: rawLineup?.home_formation ? String(rawLineup.home_formation).trim() : null,
    away_formation: rawLineup?.away_formation ? String(rawLineup.away_formation).trim() : null,
    home_manager: rawLineup?.home_manager?.name ? String(rawLineup.home_manager.name).trim() : null,
    away_manager: rawLineup?.away_manager?.name ? String(rawLineup.away_manager.name).trim() : null,
    home_starters: homeParsed.filter((p) => p.starter),
    away_starters: awayParsed.filter((p) => p.starter),
    home_substitutes: homeParsed.filter((p) => !p.starter),
    away_substitutes: awayParsed.filter((p) => !p.starter),
    home_injuries: homeInjuriesRaw.map((p) => parsePlayer(p, { isInjury: true, defaultStarter: false })),
    away_injuries: awayInjuriesRaw.map((p) => parsePlayer(p, { isInjury: true, defaultStarter: false })),
    home_market_value: rawLineup?.home_market_value ? String(rawLineup.home_market_value).trim() : null,
    away_market_value: rawLineup?.away_market_value ? String(rawLineup.away_market_value).trim() : null,
    home_average_age: rawLineup?.home_average_age ? String(rawLineup.home_average_age).trim() : null,
    away_average_age: rawLineup?.away_average_age ? String(rawLineup.away_average_age).trim() : null,
  };
}

export function parseHandicap(raw?: LeisuRawOddsHandicap | null): ParsedHandicapMarket | null {
  if (!raw) return null;
  const home_odds = safeNullableNumber(raw.home);
  const line = safeNullableNumber(raw.line);
  const away_odds = safeNullableNumber(raw.away);
  if (home_odds === null && line === null && away_odds === null) return null;
  return { home_odds, line, away_odds };
}

export function parseWinner(raw?: LeisuRawOddsWinner | null): ParsedWinnerMarket | null {
  if (!raw) return null;
  const home_odds = safeNullableNumber(raw.home);
  const draw_odds = safeNullableNumber(raw.draw);
  const away_odds = safeNullableNumber(raw.away);
  if (home_odds === null && draw_odds === null && away_odds === null) return null;
  return { home_odds, draw_odds, away_odds };
}

export function parseTotal(raw?: LeisuRawOddsTotal | null): ParsedTotalMarket | null {
  if (!raw) return null;
  const over_odds = safeNullableNumber(raw.over);
  const line = safeNullableNumber(raw.line);
  const under_odds = safeNullableNumber(raw.under);
  if (over_odds === null && line === null && under_odds === null) return null;
  return { over_odds, line, under_odds };
}

export function parseCorners(raw?: LeisuRawOddsCorners | null): ParsedCornerMarket | null {
  if (!raw) return null;
  const over_odds = safeNullableNumber(raw.over);
  const line = safeNullableNumber(raw.line);
  const under_odds = safeNullableNumber(raw.under);
  if (over_odds === null && line === null && under_odds === null) return null;
  return { over_odds, line, under_odds };
}

export function parseOddsPhaseGroup(
  markets: LeisuRawFormal["odds"] extends { markets?: infer M } ? M : unknown,
  phase: "initial" | "pregame" | "live"
): ParsedOddsPhaseGroup {
  const m = markets as {
    asian_handicap?: LeisuRawOddsPhase<LeisuRawOddsHandicap>;
    match_winner?: LeisuRawOddsPhase<LeisuRawOddsWinner>;
    total_goals?: LeisuRawOddsPhase<LeisuRawOddsTotal>;
    corners?: LeisuRawOddsPhase<LeisuRawOddsCorners>;
  } | null | undefined;

  return {
    asian_handicap: parseHandicap(m?.asian_handicap?.[phase]),
    match_winner: parseWinner(m?.match_winner?.[phase]),
    total_goals: parseTotal(m?.total_goals?.[phase]),
    corners: parseCorners(m?.corners?.[phase]),
  };
}

export function parseOddsMatrix(rawOdds?: LeisuRawFormal["odds"] | null): ParsedLeisuOddsMatrix {
  const company_name = rawOdds?.company_name ? String(rawOdds.company_name).trim() : null;
  const markets = rawOdds?.markets;

  return {
    company_name,
    initial: parseOddsPhaseGroup(markets, "initial"),
    pregame: parseOddsPhaseGroup(markets, "pregame"),
    live: parseOddsPhaseGroup(markets, "live"),
  };
}

export function parseTacticalContext(formal?: LeisuRawFormal | null): ParsedLeisuTacticalContext {
  const h2h = Array.isArray(formal?.head_to_head) ? formal.head_to_head : [];
  const rawHomeRecent = Array.isArray(formal?.recent_matches?.home) ? formal.recent_matches.home : [];
  const rawAwayRecent = Array.isArray(formal?.recent_matches?.away) ? formal.recent_matches.away : [];

  // 对近期战绩中的 league_id, league_name, 球队 ID 与名称进行智能对齐与缺省回退处理
  const homeRecent: LeisuRawRecentMatch[] = rawHomeRecent.map((m) => {
    const compInfo = leisuEnumManager.resolveCompetition(m.league_id, m.league_name);
    const homeTeamInfo = leisuEnumManager.resolveTeam(m.home_team_id, m.home_team_name);
    const awayTeamInfo = leisuEnumManager.resolveTeam(m.away_team_id, m.away_team_name);
    return {
      ...m,
      league_id: compInfo.id,
      league_name: compInfo.name,
      home_team_id: homeTeamInfo.id,
      home_team_name: homeTeamInfo.name,
      away_team_id: awayTeamInfo.id,
      away_team_name: awayTeamInfo.name,
    };
  });

  const awayRecent: LeisuRawRecentMatch[] = rawAwayRecent.map((m) => {
    const compInfo = leisuEnumManager.resolveCompetition(m.league_id, m.league_name);
    const homeTeamInfo = leisuEnumManager.resolveTeam(m.home_team_id, m.home_team_name);
    const awayTeamInfo = leisuEnumManager.resolveTeam(m.away_team_id, m.away_team_name);
    return {
      ...m,
      league_id: compInfo.id,
      league_name: compInfo.name,
      home_team_id: homeTeamInfo.id,
      home_team_name: homeTeamInfo.name,
      away_team_id: awayTeamInfo.id,
      away_team_name: awayTeamInfo.name,
    };
  });

  // 对交锋历史中的 competition_id 与 队伍 ID 进行一致性校验解析
  const h2h_raw: LeisuRawH2HMatch[] = h2h.map((m) => {
    const compInfo = leisuEnumManager.resolveCompetition(m.competition_id);
    const homeTeamInfo = leisuEnumManager.resolveTeam(m.home_team_id);
    const awayTeamInfo = leisuEnumManager.resolveTeam(m.away_team_id);
    return {
      ...m,
      competition_id: compInfo.id,
      home_team_id: homeTeamInfo.id,
      away_team_id: awayTeamInfo.id,
    };
  });

  return {
    head_to_head_count: h2h.length,
    home_recent_matches_count: homeRecent.length,
    away_recent_matches_count: awayRecent.length,
    h2h_raw,
    home_recent_matches: homeRecent,
    away_recent_matches: awayRecent,
  };
}

// ==========================================
// 联赛积分榜与排名解析
// ==========================================

function parseStandingRecord(raw?: LeisuRawStandingRecord | null): ParsedStandingRecord | null {
  if (!raw) return null;
  return {
    title: String(raw.title || "").trim() || "总",
    position: safeNullableNumber(raw.position),
    matches_played: safeNumber(raw.total, 0),
    won: safeNumber(raw.won, 0),
    draw: safeNumber(raw.draw, 0),
    loss: safeNumber(raw.loss, 0),
    goals_scored: safeNumber(raw.goals, 0),
    goals_conceded: safeNumber(raw.goals_against, 0),
    goal_difference: safeNumber(raw.net_goals, 0),
    points: safeNumber(raw.points, 0),
    win_rate: raw.win_ratio ? String(raw.win_ratio).trim() : null,
  };
}

function parseTeamStanding(raw?: LeisuRawTeamStanding | null): ParsedTeamStanding | null {
  if (!raw) return null;
  const teamInfo = leisuEnumManager.resolveTeam(raw.team_id, raw.team_name);
  const compInfo = leisuEnumManager.resolveCompetition(raw.competition_id, raw.competition_name);
  return {
    team_id: teamInfo.id,
    team_name: teamInfo.name,
    competition_id: compInfo.id,
    competition_name: compInfo.name,
    season: raw.season ? String(raw.season).trim() : null,
    overall: parseStandingRecord(raw.total),
    home: parseStandingRecord(raw.home),
    away: parseStandingRecord(raw.away),
  };
}

export function parseLeagueStandings(raw?: LeisuRawLeagueStandings | null): ParsedLeagueStandings {
  if (!raw || (!raw.home_team && !raw.away_team)) {
    return {
      has_data: false,
      home_team: null,
      away_team: null,
    };
  }

  const homeTeam = parseTeamStanding(raw.home_team);
  const awayTeam = parseTeamStanding(raw.away_team);

  return {
    has_data: Boolean(homeTeam || awayTeam),
    home_team: homeTeam,
    away_team: awayTeam,
  };
}

// ==========================================
// 进球时间分布解析 (15分钟时段划分与首球)
// ==========================================

function parseGoalIntervals(raw?: number[][] | null): ParsedGoalInterval[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    // 原始格式: [进球数, 百分比%, 起始分钟, 结束分钟]
    const goals = safeNumber(item[0], 0);
    const percentage = safeNumber(item[1], 0);
    const startMinute = safeNumber(item[2], 0);
    const endMinute = safeNumber(item[3], 0);
    return {
      start_minute: startMinute,
      end_minute: endMinute,
      goals,
      percentage,
    };
  });
}

function parseGoalDistributionScope(raw?: LeisuRawGoalDistributionScope | null): ParsedGoalDistributionScope {
  if (!raw) {
    return {
      matches_count: 0,
      scored_intervals: [],
      first_scored_intervals: [],
    };
  }
  return {
    matches_count: safeNumber(raw.matches, 0),
    scored_intervals: parseGoalIntervals(raw.scored),
    first_scored_intervals: parseGoalIntervals(raw.first_scored),
  };
}

function parseTeamGoalDistribution(raw?: LeisuRawTeamGoalDistribution | null): ParsedTeamGoalDistribution {
  return {
    all: parseGoalDistributionScope(raw?.all),
    home: parseGoalDistributionScope(raw?.home),
    away: parseGoalDistributionScope(raw?.away),
  };
}

export function parseGoalDistribution(raw?: LeisuRawGoalDistribution | null): ParsedGoalDistribution {
  const emptyScope: ParsedGoalDistributionScope = {
    matches_count: 0,
    scored_intervals: [],
    first_scored_intervals: [],
  };
  const emptyTeamDist: ParsedTeamGoalDistribution = {
    all: emptyScope,
    home: emptyScope,
    away: emptyScope,
  };

  if (!raw || (!raw.home && !raw.away)) {
    return {
      has_data: false,
      home_team: emptyTeamDist,
      away_team: emptyTeamDist,
    };
  }

  const homeDist = parseTeamGoalDistribution(raw.home);
  const awayDist = parseTeamGoalDistribution(raw.away);
  const hasData = (homeDist.all.matches_count > 0 || homeDist.all.scored_intervals.length > 0) ||
                  (awayDist.all.matches_count > 0 || awayDist.all.scored_intervals.length > 0);

  return {
    has_data: hasData,
    home_team: homeDist,
    away_team: awayDist,
  };
}

// ==========================================
// 单场赛事核心解析纯函数
// ==========================================

export function parseLeisuResult(rawResult: LeisuRawResult): ParsedLeisuMatch | null {
  const formal = rawResult.formal;
  if (!formal) return null;

  const staticMatch = formal.static_match;
  const liveMatch = formal.live_match;

  const matchId = String(rawResult.match_id || staticMatch?.id || "").trim();
  if (!matchId) return null;

  // 主客队 ID 与名称通过枚举管理器智能解析与缺省回退
  const rawHomeTeamId = safeNullableNumber(staticMatch?.homeTeam?.id);
  const rawHomeTeamName = String(staticMatch?.homeTeam?.name || staticMatch?.homeTeam?.shortName || "").trim();
  const homeTeamInfo = leisuEnumManager.resolveTeam(rawHomeTeamId, rawHomeTeamName);
  const homeTeamId = homeTeamInfo.id;
  const homeTeam = homeTeamInfo.name;

  const rawAwayTeamId = safeNullableNumber(staticMatch?.awayTeam?.id);
  const rawAwayTeamName = String(staticMatch?.awayTeam?.name || staticMatch?.awayTeam?.shortName || "").trim();
  const awayTeamInfo = leisuEnumManager.resolveTeam(rawAwayTeamId, rawAwayTeamName);
  const awayTeamId = awayTeamInfo.id;
  const awayTeam = awayTeamInfo.name;
  
  // 赛事 ID 与名称通过枚举管理器智能解析与缺省回退
  const rawCompetitionId = safeNullableNumber(staticMatch?.competition?.id);
  const rawCompetitionName = String(staticMatch?.competition?.name || staticMatch?.competition?.shortName || "").trim();
  const compInfo = leisuEnumManager.resolveCompetition(rawCompetitionId, rawCompetitionName);
  const competitionId = compInfo.id;
  const competition = compInfo.name;

  // 开赛时间转换：Unix timestamp (秒) -> ISO 8601 UTC
  const matchTimeSec = safeNullableNumber(staticMatch?.matchTime);
  const commenceTime = matchTimeSec !== null && matchTimeSec > 0
    ? new Date(matchTimeSec * 1000).toISOString()
    : null;

  const statusId = safeNumber(liveMatch?.status_id, LeisuMatchStatus.NOT_STARTED);
  const statusText = parseStatusIdToText(statusId);
  const isLive = isLiveStatus(statusId);
  const minute = extractLatestMinute(liveMatch);

  // 比分提取与核验
  let score: ScorePair | null = null;
  let halfScore: ScorePair | null = null;
  let scoreVerified = false;

  if (liveMatch?.home_scores && liveMatch?.away_scores) {
    const rawHomeScore = safeNullableNumber(liveMatch.home_scores.score);
    const rawAwayScore = safeNullableNumber(liveMatch.away_scores.score);

    if (rawHomeScore !== null && rawAwayScore !== null) {
      score = { home: rawHomeScore, away: rawAwayScore };
      scoreVerified = Boolean(liveMatch.match_id);
    }

    const rawHalfHome = safeNullableNumber(liveMatch.home_scores.halfScore);
    const rawHalfAway = safeNullableNumber(liveMatch.away_scores.halfScore);
    if (rawHalfHome !== null && rawHalfAway !== null) {
      halfScore = { home: rawHalfHome, away: rawHalfAway };
    }
  }

  // 比赛环境
  const envRaw = staticMatch?.environment;
  const environment: ParsedLeisuEnvironment = {
    weather: envRaw?.weather ? String(envRaw.weather).trim() : null,
    temperature: envRaw?.temperature ? String(envRaw.temperature).trim() : null,
    humidity: envRaw?.humidity ? String(envRaw.humidity).trim() : null,
    wind: envRaw?.wind ? String(envRaw.wind).trim() : null,
    pressure: envRaw?.pressure ? String(envRaw.pressure).trim() : null,
  };

  // 8大技术统计
  const stats = parseConfirmedStats(liveMatch?.confirmed_statistics);

  // 攻防动量时序
  const attackMomentum = parseMomentumTimeline(liveMatch?.attack_momentum_timeline);

  // 文字直播时序事件
  const timelineEvents = parseTimelineEvents(liveMatch?.text_live);

  // 阵容与球场
  const lineups = parseLineups(formal.lineup);
  const venue = lineups.venue;

  // 赔率矩阵
  const oddsMatrix = parseOddsMatrix(formal.odds);

  // 基本面深度上下文
  const tacticalContext = parseTacticalContext(formal);

  // 联赛积分与排名
  const leagueStandings = parseLeagueStandings(formal.league_standings);

  // 进球时间分布 (15分钟时段划分)
  const goalDistribution = parseGoalDistribution(formal.goal_distribution);

  return {
    match_id: matchId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_team: homeTeam,
    away_team: awayTeam,
    competition_id: competitionId,
    competition,
    commence_time: commenceTime,
    status_id: statusId,
    status_text: statusText,
    is_live: isLive,
    minute,
    score,
    half_score: halfScore,
    score_verified: scoreVerified,
    environment,
    venue,
    stats,
    attack_momentum: attackMomentum,
    timeline_events: timelineEvents,
    lineups,
    odds_matrix: oddsMatrix,
    tactical_context: tacticalContext,
    league_standings: leagueStandings,
    goal_distribution: goalDistribution,
  };
}

// ==========================================
// 顶层导出全量解析函数
// ==========================================

export function parseLeisuInterfaceExport(payload: unknown): ParsedLeisuRoot {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Leisu export payload: payload must be a non-null object.");
  }

  const root = payload as Partial<LeisuRawRoot>;
  if (!String(root.export_type || "").startsWith("leisu_interface")) {
    throw new Error(`Invalid export_type: expected leisu_interface_data, got "${root.export_type}"`);
  }

  if (!Array.isArray(root.results)) {
    throw new Error("Invalid Leisu export payload: missing or invalid results array.");
  }

  const parsedMatches: ParsedLeisuMatch[] = [];
  for (const res of root.results) {
    const parsed = parseLeisuResult(res);
    if (parsed) {
      parsedMatches.push(parsed);
    }
  }

  return {
    export_version: root.export_version || "2.8.0",
    export_type: root.export_type || "leisu_interface_data",
    captured_at: root.captured_at || new Date().toISOString(),
    matches: parsedMatches,
  };
}

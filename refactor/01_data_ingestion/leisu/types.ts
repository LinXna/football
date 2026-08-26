/**
 * 01 数据摄取层 - 雷速 (Leisu) 接口数据强类型定义
 * 
 * 遵循原则：
 * 1. 强类型零 any，杜绝 @ts-ignore
 * 2. 严格区分 Raw (抓取原始结构) 与 Parsed (清洗后的纯净业务实体)
 * 3. 字段可空性明确，确定性数值 (严格 number，绝非 string 混用)
 * 4. 彻底剔除冗余字段，统一枚举管理
 */

import {
  LeisuMatchStatus,
  LeisuMatchSide,
  LeisuTimelineEventType,
  LeisuPlayerIncidentType,
  LeisuPlayerStatus,
} from "./enums";

// ==========================================
// 1. 雷速原始接口数据类型 (Raw Extraction Types)
// ==========================================

export interface LeisuRawEnvironment {
  weather?: string | null;
  pressure?: string | null;
  temperature?: string | null;
  wind?: string | null;
  humidity?: string | null;
  weatherId?: number | null;
}

export interface LeisuRawTeam {
  id?: number | null;
  name?: string | null;
  shortName?: string | null;
  rank?: string | null;
}

export interface LeisuRawCompetition {
  id?: number | null;
  name?: string | null;
  shortName?: string | null;
  type?: number | null;
}

export interface LeisuRawStaticMatch {
  id?: number | null;
  matchTime?: number | null; // Unix timestamp in seconds
  homeTeam?: LeisuRawTeam | null;
  awayTeam?: LeisuRawTeam | null;
  competition?: LeisuRawCompetition | null;
  environment?: LeisuRawEnvironment | null;
}

export interface LeisuRawSideScores {
  score?: number | null;
  halfScore?: number | null;
  corner?: number | null;
  yellowCard?: number | null;
  redCard?: number | null;
  overTime?: number | null;
  penalty?: number | null;
}

export interface LeisuRawMetricPair {
  home?: number | null;
  away?: number | null;
}

export interface LeisuRawConfirmedStatistics {
  corners?: LeisuRawMetricPair | null;
  yellow_cards?: LeisuRawMetricPair | null;
  red_cards?: LeisuRawMetricPair | null;
  attacks?: LeisuRawMetricPair | null;
  dangerous_attacks?: LeisuRawMetricPair | null;
  possession?: LeisuRawMetricPair | null;
  shots_on_target?: LeisuRawMetricPair | null;
  shots_off_target?: LeisuRawMetricPair | null;
}

export interface LeisuRawAttackMomentum {
  available?: boolean | null;
  source?: string | null;
  segment_count?: number | null;
  nominal_segment_minutes?: number | null;
  data?: number[][] | null;
}

export interface LeisuRawTextLiveItem {
  main?: number | null;
  type?: number | null;
  position?: number | null; // 0中立, 1主队, 2客队
  time?: string | null;
  data?: string | null;
}

export interface LeisuRawLiveMatch {
  source?: string | null;
  statistics_source?: string | null;
  match_id?: number | null;
  status_id?: number | null;
  home_scores?: LeisuRawSideScores | null;
  away_scores?: LeisuRawSideScores | null;
  confirmed_statistics?: LeisuRawConfirmedStatistics | null;
  attack_momentum_timeline?: LeisuRawAttackMomentum | null;
  text_live?: LeisuRawTextLiveItem[] | null;
}

export interface LeisuRawOddsHandicap {
  home?: string | number | null;
  line?: string | number | null;
  away?: string | number | null;
}

export interface LeisuRawOddsWinner {
  home?: string | number | null;
  draw?: string | number | null;
  away?: string | number | null;
}

export interface LeisuRawOddsTotal {
  over?: string | number | null;
  line?: string | number | null;
  under?: string | number | null;
}

export interface LeisuRawOddsCorners {
  over?: string | number | null;
  line?: string | number | null;
  under?: string | number | null;
}

export interface LeisuRawOddsPhase<T> {
  initial?: T | null;
  pregame?: T | null;
  live?: T | null;
}

export interface LeisuRawOddsMarkets {
  asian_handicap?: LeisuRawOddsPhase<LeisuRawOddsHandicap> | null;
  match_winner?: LeisuRawOddsPhase<LeisuRawOddsWinner> | null;
  total_goals?: LeisuRawOddsPhase<LeisuRawOddsTotal> | null;
  corners?: LeisuRawOddsPhase<LeisuRawOddsCorners> | null;
}

export interface LeisuRawOdds {
  source?: string | null;
  company_id?: number | null;
  company_name?: string | null;
  markets?: LeisuRawOddsMarkets | null;
}

export interface LeisuRawOpeningOdds {
  source?: string | null;
  asian_handicap?: LeisuRawOddsHandicap | null;
  match_winner?: LeisuRawOddsWinner | null;
  total_goals?: LeisuRawOddsTotal | null;
  corners?: LeisuRawOddsCorners | null;
}

export interface LeisuRawPlayerIncident {
  type?: number | null;
  reason_type?: string | null;
  reason_desc?: string | null;
  time?: number | null;
  player_id?: number | null;
  player_name?: string | null;
}

export interface LeisuRawPlayer {
  player_id?: number | null;
  team_id?: number | null;
  name?: string | null;
  status?: number | null; // 1首发, 0替补
  starter?: boolean | null;
  captain?: number | null;
  shirt_number?: number | null;
  position?: string | null;
  position_name?: string | null;
  position_code?: string | null;
  position_number?: number | null;
  x?: number | null;
  y?: number | null;
  rating?: string | number | null;
  best_player?: boolean | null;
  age?: number | null;
  height?: number | null;
  market_value?: number | null;
  market_value_text?: string | null;
  incidents?: LeisuRawPlayerIncident[] | null;
}

export interface LeisuRawManager {
  id?: number | null;
  team_id?: number | null;
  name?: string | null;
  role?: string | null;
}

export interface LeisuRawVenue {
  id?: number | null;
  name?: string | null;
  city?: string | null;
  country?: string | null;
  capacity?: number | null;
}

export interface LeisuRawLineup {
  confirmed?: boolean | number | null;
  venue?: LeisuRawVenue | null;
  home_formation?: string | null;
  away_formation?: string | null;
  home_manager?: LeisuRawManager | null;
  away_manager?: LeisuRawManager | null;
  home?: LeisuRawPlayer[] | null;
  away?: LeisuRawPlayer[] | null;
  home_injuries?: LeisuRawPlayer[] | null;
  away_injuries?: LeisuRawPlayer[] | null;
  home_market_value?: string | null;
  away_market_value?: string | null;
  home_average_age?: string | null;
  away_average_age?: string | null;
}

export interface LeisuRawH2HStats {
  attack?: number | null;
  dangerous_attack?: number | null;
  ball_possession?: number | null;
  shots?: number | null; // 本队总射门次数
  was_shots?: number | null; // 本队被射门次数 (即对方的总射门次数)
  corner_kicks?: number | null;
  fouls?: number | null;
  yellow_cards?: number | null;
  red_cards?: number | null;
  free_kicks?: number | null;
}

export interface LeisuRawH2HMatch {
  match_id?: number | null;
  season_id?: number | null;
  competition_id?: number | null;
  status_id?: number | null;
  match_time?: number | null;
  neutral?: number | null;
  home_team_id?: number | null;
  away_team_id?: number | null;
  home_scores?: number[] | null; // 依次为: [全场比分, 半场比分, 红牌, 黄牌, 角球, 扩展1, 扩展2]
  away_scores?: number[] | null;
  opening_odds?: string[] | null; // [亚盘初盘, 欧赔初盘, 大小球初盘, 角球初盘]
  current_odds?: string[] | null; // [亚盘终盘, 欧赔终盘, 大小球终盘, 角球终盘]
  home_stats?: LeisuRawH2HStats | null;
  away_stats?: LeisuRawH2HStats | null;
}

export interface LeisuRawRecentMatch {
  match_id?: number | null;
  league_id?: number | null;
  league_name?: string | null;
  match_time?: number | null;
  match_date?: string | null;
  home_team_id?: number | null;
  home_team_name?: string | null;
  away_team_id?: number | null;
  away_team_name?: string | null;
  halftime_score?: { home?: number | null; away?: number | null } | null;
  fulltime_score?: { home?: number | null; away?: number | null } | null;
  result?: string | null;
  goals?: number | null;
}

export interface LeisuRawRecentMatches {
  home?: LeisuRawRecentMatch[] | null;
  away?: LeisuRawRecentMatch[] | null;
}

export interface LeisuRawStandingRecord {
  title?: string | null;
  position?: number | null;
  total?: number | null;
  won?: number | null;
  draw?: number | null;
  loss?: number | null;
  goals?: number | null;
  goals_against?: number | null;
  net_goals?: number | null;
  points?: number | null;
  win_ratio?: string | null;
}

export interface LeisuRawTeamStanding {
  team_id?: number | null;
  team_name?: string | null;
  competition_id?: number | null;
  competition_name?: string | null;
  season?: string | null;
  total?: LeisuRawStandingRecord | null;
  home?: LeisuRawStandingRecord | null;
  away?: LeisuRawStandingRecord | null;
}

export interface LeisuRawLeagueStandings {
  home_team?: LeisuRawTeamStanding | null;
  away_team?: LeisuRawTeamStanding | null;
}

export interface LeisuRawGoalDistributionScope {
  matches?: number | null;
  scored?: number[][] | null;
  first_scored?: number[][] | null;
}

export interface LeisuRawTeamGoalDistribution {
  all?: LeisuRawGoalDistributionScope | null;
  home?: LeisuRawGoalDistributionScope | null;
  away?: LeisuRawGoalDistributionScope | null;
}

export interface LeisuRawGoalDistribution {
  home?: LeisuRawTeamGoalDistribution | null;
  away?: LeisuRawTeamGoalDistribution | null;
}

export interface LeisuRawFormal {
  static_match?: LeisuRawStaticMatch | null;
  live_match?: LeisuRawLiveMatch | null;
  opening_odds?: LeisuRawOpeningOdds | null;
  odds?: LeisuRawOdds | null;
  lineup?: LeisuRawLineup | null;
  head_to_head?: LeisuRawH2HMatch[] | null;
  recent_matches?: LeisuRawRecentMatches | null;
  league_standings?: LeisuRawLeagueStandings | null;
  goal_distribution?: LeisuRawGoalDistribution | null;
  trend_summary?: unknown;
}

export interface LeisuRawResult {
  match_id?: string | null;
  available?: boolean | null;
  complete?: boolean | null;
  formal?: LeisuRawFormal | null;
}

export interface LeisuRawRoot {
  export_version: string;
  export_type: string;
  captured_at: string;
  results: LeisuRawResult[];
}

// ==========================================
// 2. 清洗后的纯净业务数据契约 (Parsed Clean Types)
// ==========================================

export interface MetricPair {
  home: number;
  away: number;
}

export interface ScorePair {
  home: number;
  away: number;
}

export interface ParsedLeisuEnvironment {
  weather: string | null;
  temperature: string | null;
  humidity: string | null;
  wind: string | null;
  pressure: string | null;
}

export interface ParsedLeisuVenue {
  name: string | null;
  city: string | null;
  country: string | null;
  capacity: number | null;
}

export interface ParsedLeisuStats {
  corners: MetricPair;
  yellow_cards: MetricPair;
  red_cards: MetricPair;
  attacks: MetricPair;
  dangerous_attacks: MetricPair;
  possession: MetricPair;
  shots_on_target: MetricPair;
  shots_off_target: MetricPair;
  shots: MetricPair; // shots = shots_on_target + shots_off_target
}

export interface ParsedLeisuMomentum {
  available: boolean;
  segment_count: number;
  nominal_segment_minutes: number | null;
  data: number[][];
}

export interface ParsedLeisuTimelineEvent {
  minute: number | null;
  type: LeisuTimelineEventType | number;
  type_name: string;
  side: LeisuMatchSide;
  text: string;
}

export interface ParsedPlayerIncident {
  type: LeisuPlayerIncidentType | number;
  type_name: string;
  time: number | null;
  reason_type: string | null;
  reason_desc: string | null;
}

export interface ParsedPlayer {
  player_id: number | null;
  team_id: number | null;
  name: string;
  shirt_number: number | null;
  status: LeisuPlayerStatus;
  status_name: string;
  starter: boolean;
  captain: boolean;
  best_player: boolean;
  rating: number | null;
  age: number | null;
  height: number | null;
  market_value: number | null;
  market_value_text: string | null;
  position: string | null;
  position_name: string | null;
  position_code: string | null;
  incidents: ParsedPlayerIncident[];
}

export interface ParsedLeisuLineup {
  confirmed: boolean;
  venue: ParsedLeisuVenue | null;
  home_formation: string | null;
  away_formation: string | null;
  home_manager: string | null;
  away_manager: string | null;
  home_starters: ParsedPlayer[];
  away_starters: ParsedPlayer[];
  home_substitutes: ParsedPlayer[];
  away_substitutes: ParsedPlayer[];
  home_injuries: ParsedPlayer[];
  away_injuries: ParsedPlayer[];
  home_market_value: string | null;
  away_market_value: string | null;
  home_average_age: string | null;
  away_average_age: string | null;
}

export interface ParsedHandicapMarket {
  home_odds: number | null;
  line: number | null;
  away_odds: number | null;
}

export interface ParsedWinnerMarket {
  home_odds: number | null;
  draw_odds: number | null;
  away_odds: number | null;
}

export interface ParsedTotalMarket {
  over_odds: number | null;
  line: number | null;
  under_odds: number | null;
}

export interface ParsedCornerMarket {
  over_odds: number | null;
  line: number | null;
  under_odds: number | null;
}

export interface ParsedOddsPhaseGroup {
  asian_handicap: ParsedHandicapMarket | null;
  match_winner: ParsedWinnerMarket | null;
  total_goals: ParsedTotalMarket | null;
  corners: ParsedCornerMarket | null;
}

export interface ParsedLeisuOddsMatrix {
  company_name: string | null;
  initial: ParsedOddsPhaseGroup;
  pregame: ParsedOddsPhaseGroup;
  live: ParsedOddsPhaseGroup;
}

export interface ParsedLeisuTacticalContext {
  head_to_head_count: number;
  home_recent_matches_count: number;
  away_recent_matches_count: number;
  h2h_raw: LeisuRawH2HMatch[];
  home_recent_matches: LeisuRawRecentMatch[];
  away_recent_matches: LeisuRawRecentMatch[];
}

export interface ParsedStandingRecord {
  title: string;
  position: number | null;
  matches_played: number;
  won: number;
  draw: number;
  loss: number;
  goals_scored: number;
  goals_conceded: number;
  goal_difference: number;
  points: number;
  win_rate: string | null;
}

export interface ParsedTeamStanding {
  team_id: number | null;
  team_name: string;
  competition_id: number | null;
  competition_name: string;
  season: string | null;
  overall: ParsedStandingRecord | null;
  home: ParsedStandingRecord | null;
  away: ParsedStandingRecord | null;
}

export interface ParsedLeagueStandings {
  has_data: boolean;
  home_team: ParsedTeamStanding | null;
  away_team: ParsedTeamStanding | null;
}

export interface ParsedGoalInterval {
  start_minute: number;
  end_minute: number;
  goals: number;
  percentage: number;
}

export interface ParsedGoalDistributionScope {
  matches_count: number;
  scored_intervals: ParsedGoalInterval[];
  first_scored_intervals: ParsedGoalInterval[];
}

export interface ParsedTeamGoalDistribution {
  all: ParsedGoalDistributionScope;
  home: ParsedGoalDistributionScope;
  away: ParsedGoalDistributionScope;
}

export interface ParsedGoalDistribution {
  has_data: boolean;
  home_team: ParsedTeamGoalDistribution;
  away_team: ParsedTeamGoalDistribution;
}

export interface ParsedLeisuMatch {
  match_id: string;
  competition_id: number | null; // 所属赛事/联赛 ID (results.formal.static_match.competition.id，用于同赛事比赛关联与杯赛/联赛特征归类)
  home_team_id: number | null; // 主队唯一 ID (用于实体对齐首选匹配)
  away_team_id: number | null; // 客队唯一 ID (用于实体对齐首选匹配)
  home_team: string;
  away_team: string;
  competition: string;
  commence_time: string | null; // ISO 8601 UTC
  status_id: LeisuMatchStatus | number;
  status_text: string;
  is_live: boolean;
  minute: number | null;
  score: ScorePair | null;
  half_score: ScorePair | null;
  score_verified: boolean;
  environment: ParsedLeisuEnvironment;
  venue: ParsedLeisuVenue | null;
  stats: ParsedLeisuStats;
  attack_momentum: ParsedLeisuMomentum;
  timeline_events: ParsedLeisuTimelineEvent[];
  lineups: ParsedLeisuLineup;
  odds_matrix: ParsedLeisuOddsMatrix;
  tactical_context: ParsedLeisuTacticalContext;
  league_standings: ParsedLeagueStandings;
  goal_distribution: ParsedGoalDistribution;
}

export interface ParsedLeisuRoot {
  export_version: string;
  export_type: string;
  captured_at: string;
  matches: ParsedLeisuMatch[];
}

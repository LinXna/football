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
  };
  away?: {
    team?: string;
    players?: string[];
    starters?: string[];
    substitutes?: string[];
  };
}

export interface DecisionItem {
  match: string;
  league?: string;
  ybty_league?: string;
  leisu_league?: string;
  ybty_match?: string;
  ybty_home?: string;
  ybty_away?: string;
  leisu_match?: string;
  leisu_home?: string;
  leisu_away?: string;
  ybty_start_time?: string | null;
  ybty_start_time_beijing?: string | null;
  commence_time?: string | null;
  provider_start_time?: string | null;
  captured_at?: string;
  minute?: number;
  score?: Score;
  ht_score?: Score | null;
  score_source?: string;
  score_verified?: boolean;
  status: 'WATCH' | 'PASS' | 'RESEARCH' | string;
  grade?: 'A' | 'B' | 'C' | string;
  model_score?: number;
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
  intercept_reason?: string;
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
  ybty_home: string;
  ybty_away: string;
  market: string;
  line: string | number;
  odds: number;
  basis?: string;
  scope?: string;
  score_at_recommendation?: Score;
  final_score?: Score | null;
  ht_score?: Score | null;
  half_time_score?: Score | null;
  score_verified?: boolean;
  outcome?: 'win' | 'half_win' | 'push' | 'half_loss' | 'loss' | 'pending' | 'invalid_data' | string;
}

export interface LedgerItem {
  id: string;
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
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return String(record.name ?? record.name_zh ?? record.shortName ?? record.label ?? '');
    }
    return '';
  };
  if (!item) return '常规联赛';
  for (const value of [item.league, item.ybty_league, item.leisu_league, item.tournament, item.league_name]) {
    const text = leagueText(value);
    if (text) return text;
  }

  const matchStr = item.match || item.match_name || '';
  if (matchStr.startsWith('[')) {
    const endBracket = matchStr.indexOf(']');
    if (endBracket > 1) {
      return matchStr.substring(1, endBracket);
    }
  }

  const home = item.ybty_home || (matchStr ? matchStr.split(' vs ')[0] : '') || '';
  const away = item.ybty_away || (matchStr ? matchStr.split(' vs ')[1] : '') || '';

  if (home.includes('萨普里萨') || away.includes('萨普里萨') || home.includes('埃雷迪亚诺') || away.includes('埃雷迪亚诺') || home.includes('阿利安萨') || away.includes('阿利安萨')) {
    return '中美洲杯';
  }
  if (home.includes('托卢卡') || away.includes('托卢卡') || home.includes('墨西哥') || away.includes('墨西哥')) {
    return '中北美杯 / 墨U20';
  }
  if (home.includes('丹佛') || away.includes('丹佛') || home.includes('女足') || away.includes('女足')) {
    return '美女子联';
  }
  if (home.includes('联盟FC') || away.includes('联盟FC')) {
    return '中美洲杯';
  }
  if (home.includes('蔚山') || away.includes('蔚山') || home.includes('全北') || away.includes('全北')) {
    return '韩K联';
  }
  if (home.includes('阿森纳') || away.includes('阿森纳') || home.includes('切尔西') || away.includes('曼城')) {
    return '英超联赛';
  }

  return '国际赛事';
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
  };
}

export interface AIAnalysisResponse {
  match?: string;
  ybty_home?: string;
  ybty_away?: string;
  summary: string;
  grade: 'A' | 'B' | 'C';
  recommendation: {
    market: string;
    line: string;
    odds: number;
  } | null;
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
    reason: string;
    legs: Array<{
      match: string;
      ybty_home?: string;
      ybty_away?: string;
      market: string;
      line: string | number;
      odds: number;
      probability: number;
      grade: 'A' | 'B' | 'C';
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
}

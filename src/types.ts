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
  ybty_start_time?: string | null;
  ybty_start_time_beijing?: string | null;
  commence_time?: string | null;
  provider_start_time?: string | null;
  minute?: number;
  score?: Score;
  score_source?: string;
  score_verified?: boolean;
  status: 'WATCH' | 'PASS' | 'RESEARCH' | string;
  grade?: 'A' | 'B' | 'C' | string;
  model_score?: number;
  recommendation?: {
    market?: string;
    line?: number | string;
    odds?: number;
  } | null;
  market_age_seconds?: number;
  reference_market?: ReferenceMarket;
  weather?: WeatherInfo;
  lineups?: LineupData;
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
  grade?: string;
  model_score?: number;
  recommendation?: {
    market?: string;
    line?: number | string;
    odds?: number;
  };
  evidence?: string[];
  risks?: string[];
  review?: {
    status?: string;
    final_score?: Score;
    added_goals?: number;
    outcome?: 'win' | 'loss' | 'push' | 'half_win' | 'half_loss' | 'pending' | 'invalid_data' | string;
  };
  record_type?: 'machine_candidate' | 'formal_ai_recommendation' | string;
  formal_recommendation?: boolean;
  score_source?: string;
  score_verified?: boolean;
  commence_time?: string | null;
  start_time_beijing?: string | null;
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
}

export function getLeagueName(item: any): string {
  if (!item) return '常规联赛';
  if (item.league) return item.league;
  if (item.ybty_league) return item.ybty_league;
  if (item.leisu_league) return item.leisu_league;
  if (item.tournament) return item.tournament;
  if (item.league_name) return item.league_name;

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

import manualAliases from '../team_aliases.json';
import autoAliases from '../team_aliases_auto.json';
import { buildAliasLookup, getCanonicalName } from './lib/teamAliasMatcher';

const globalAliasLookupMap = buildAliasLookup(
  (manualAliases as Record<string, string[]>) || {},
  (autoAliases as Record<string, string[]>) || {}
);

export function getTeamDisplay(item: any) {
  if (!item) {
    return {
      homeYbty: '主队-YBTY',
      homeLeisu: '主队-雷速',
      awayYbty: '客队-YBTY',
      awayLeisu: '客队-雷速',
      ybtyHomeRaw: '主队',
      ybtyAwayRaw: '客队',
      leisuHomeRaw: '主队',
      leisuAwayRaw: '客队',
    };
  }

  let ybtyHome = item.ybty_home || item.home || '';
  let ybtyAway = item.ybty_away || item.away || '';

  const matchStr = item.match || item.match_name || item.ybty_match || '';
  if (!ybtyHome && matchStr) {
    const parts = matchStr.split(/\s+vs\s+/i);
    if (parts.length >= 2) {
      ybtyHome = parts[0].replace(/^\[.*?\]\s*/, '').trim();
      ybtyAway = parts[1].trim();
    }
  }

  ybtyHome = ybtyHome || '主队';
  ybtyAway = ybtyAway || '客队';

  let leisuHome = item.leisu_home || item.leisu_home_team || item.matched_leisu_home || item.candidate?.match?.home || item.match_info?.leisu_home || item.leisu_raw?.home;
  let leisuAway = item.leisu_away || item.leisu_away_team || item.matched_leisu_away || item.candidate?.match?.away || item.match_info?.leisu_away || item.leisu_raw?.away;

  if (!leisuHome && item.leisu_match) {
    const lParts = item.leisu_match.split(/\s+vs\s+/i);
    if (lParts.length >= 2) {
      leisuHome = lParts[0].replace(/^\[.*?\]\s*/, '').trim();
      leisuAway = lParts[1].trim();
    }
  }

  if (!leisuHome || leisuHome === ybtyHome) {
    const canonicalHome = getCanonicalName(ybtyHome, globalAliasLookupMap);
    if (canonicalHome) {
      leisuHome = canonicalHome;
    }
  }

  if (!leisuAway || leisuAway === ybtyAway) {
    const canonicalAway = getCanonicalName(ybtyAway, globalAliasLookupMap);
    if (canonicalAway) {
      leisuAway = canonicalAway;
    }
  }

  leisuHome = leisuHome || ybtyHome;
  leisuAway = leisuAway || ybtyAway;

  return {
    homeYbty: `${ybtyHome}-YBTY`,
    homeLeisu: `${leisuHome}-雷速`,
    awayYbty: `${ybtyAway}-YBTY`,
    awayLeisu: `${leisuAway}-雷速`,
    ybtyHomeRaw: ybtyHome,
    ybtyAwayRaw: ybtyAway,
    leisuHomeRaw: leisuHome,
    leisuAwayRaw: leisuAway,
  };
}

export interface AIAnalysisResponse {
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
  parlay_safety_check?: {
    is_valid_parlay: boolean;
    reasons: string[];
  };
}

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

export interface BankrollGuidance {
  recommended_stake_pct: string;
  fractional_kelly_pct: number;
  stake_sizing_tier: 'CORE_HIGH' | 'CORE_STANDARD' | 'SPECULATIVE_SMALL' | 'NO_STAKE';
  guidance_text: string;
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
  snapshot_delta?: any;
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
  };
}

export interface AIAnalysisResponse {
  match?: string;
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
    joint_probability?: number; // 联合胜率 % (P1 * P2 * ...)
    combined_ev_pct?: number; // 整单预期价值边际 % (EV > 0)
    kelly_fraction_pct?: number; // 1/4 凯利建议注码 %
    sharpe_assessment?: 'HIGH_EDGE_CORE' | 'BALANCED_GROWTH' | 'SPECULATIVE_VALUE';
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

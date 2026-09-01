/**
 * YBTY 滚球与赛前数据强类型契约定义
 * 遵循 Anti-Tech-Debt Core Laws:
 * 1. 强类型零 any，零 @ts-ignore
 * 2. 字段命名与业务语义完全对应，去除冗余派生字段
 */

// -------------------------------------------------------------
// 1. YBTY 滚球原始抓取数据类型 (Raw Schema)
// -------------------------------------------------------------

export interface YbtyRawOption {
  selection: string;
  line: string | null;
  odds: string;
  side: "home" | "away" | "draw" | "over" | "under";
  side_verified: boolean;
  side_source: string;
  suspended: boolean;
  market_data_available: boolean;
  odds_temporarily_unavailable: boolean;
  text: string;
}

export type YbtyMarketType =
  | "full_h2h"
  | "full_spread"
  | "full_total"
  | "half_h2h"
  | "half_spread"
  | "half_total"
  | string;

export interface YbtyRawMarket {
  line_index: number;
  market: YbtyMarketType;
  market_title: string;
  market_title_raw: string | null;
  market_type_source: string;
  market_type_verified: boolean;
  market_type_conflict: boolean;
  home_selection: string | null;
  home_odds: string | null;
  away_selection: string | null;
  away_odds: string | null;
  draw_odds: string | null;
  direction_verified: boolean;
  options: YbtyRawOption[];
}

export interface YbtyRawLiveMatch {
  source_match_id: null;
  league: string;
  home: string;
  away: string;
  home_score: string | null;
  away_score: string | null;
  clock: string | null;
  clock_status: string;
  added_time: string | null;
  countdown: string | null;
  play_count: string | null;
  commence_time: string | null;
  _pre_start_text: string | null;
  captured_at: string;
  markets: YbtyRawMarket[];
}

export interface YbtyRawLiveRoot {
  schema_version: number;
  export_version: string;
  source: string;
  source_url: string;
  page_title: string;
  export_mode: "live";
  captured_at: string;
  count: number;
  matches: YbtyRawLiveMatch[];
}

export interface YbtyRawPrematchMatch {
  source_match_id: string | null;
  league: string;
  home: string;
  away: string;
  home_score: string | null;
  away_score: string | null;
  clock: string | null;
  clock_status: string;
  added_time: string | null;
  countdown: string | null;
  play_count: string | null;
  commence_time: string | null;
  _pre_start_text: string | null;
  captured_at: string;
  markets: YbtyRawMarket[];
}

export interface YbtyRawPrematchRoot {
  schema_version: number;
  export_version: string;
  source: string;
  source_url: string;
  page_title: string;
  export_mode: "prematch";
  captured_at: string;
  count: number;
  matches: YbtyRawPrematchMatch[];
}

// -------------------------------------------------------------
// 2. YBTY 清洗后标准结构化模型 (Parsed Clean Schema - 极简纯净版)
// -------------------------------------------------------------

export interface CleanH2HMarket {
  home_odds: number;
  draw_odds: number;
  away_odds: number;
}

export interface CleanSpreadMarket {
  line_index: number;
  home_selection: string;
  home_odds: number;
  away_selection: string;
  away_odds: number;
}

export interface CleanTotalMarket {
  line_index: number;
  line: string;
  over_odds: number;
  under_odds: number;
}

export interface CleanMarketsGroup {
  full_h2h: CleanH2HMarket | null;
  full_spread_main: CleanSpreadMarket | null;
  full_spread_subs: CleanSpreadMarket[];
  full_total_main: CleanTotalMarket | null;
  full_total_subs: CleanTotalMarket[];
  half_h2h: CleanH2HMarket | null;
  half_spread_main: CleanSpreadMarket | null;
  half_total_main: CleanTotalMarket | null;
}

export interface ParsedYbtyLiveMatch {
  is_live: true;
  league: string;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
  clock: string | null;
  clock_status: string;
  added_time?: string | null;
  countdown?: string | null;
  commence_time?: string | null;
  _pre_start_text?: string | null;
  captured_at?: string;
  markets: CleanMarketsGroup;
}

export interface ParsedYbtyLiveResult {
  schema_version: number;
  export_version: string;
  captured_at: string;
  matches: ParsedYbtyLiveMatch[];
}

export interface ParsedYbtyPrematchMatch {
  is_live: false;
  league: string;
  home: string;
  away: string;
  clock_status: string;
  countdown?: string | null;
  commence_time?: string | null;
  _pre_start_text?: string | null;
  captured_at?: string;
  markets: CleanMarketsGroup;
}

export interface ParsedYbtyPrematchResult {
  schema_version: number;
  export_version: string;
  captured_at: string;
  matches: ParsedYbtyPrematchMatch[];
}

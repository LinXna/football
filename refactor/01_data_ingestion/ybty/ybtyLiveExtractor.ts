/**
 * YBTY 滚球原始数据提取器实现
 * 遵循 Anti-Tech-Debt Core Laws:
 * 1. 强类型零 any，运行时守卫 (Type Guards)
 * 2. 纯函数无副作用，No In-Place Mutation
 * 3. 严格服从 DATA_SPECIFICATION.md 标准数据结构，去除派生冗余字段
 */

import {
  YbtyRawMarket,
  YbtyRawLiveMatch,
  YbtyRawLiveRoot,
  CleanH2HMarket,
  CleanSpreadMarket,
  CleanTotalMarket,
  CleanMarketsGroup,
  ParsedYbtyLiveMatch,
  ParsedYbtyLiveResult,
} from "./types";

function parseNumber(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const num = typeof val === "number" ? val : parseFloat(String(val).trim());
  return isNaN(num) ? null : num;
}

export function parseH2HMarket(rawMarket: YbtyRawMarket): CleanH2HMarket | null {
  const homeOdds = parseNumber(rawMarket.home_odds);
  const drawOdds = parseNumber(rawMarket.draw_odds);
  const awayOdds = parseNumber(rawMarket.away_odds);

  if (homeOdds === null || drawOdds === null || awayOdds === null) {
    return null;
  }

  return {
    home_odds: homeOdds,
    draw_odds: drawOdds,
    away_odds: awayOdds,
  };
}

export function parseSpreadMarket(rawMarket: YbtyRawMarket): CleanSpreadMarket | null {
  const homeOdds = parseNumber(rawMarket.home_odds);
  const awayOdds = parseNumber(rawMarket.away_odds);
  const homeSelection = rawMarket.home_selection;
  const awaySelection = rawMarket.away_selection;

  if (homeOdds === null || awayOdds === null || !homeSelection || !awaySelection) {
    return null;
  }

  return {
    line_index: rawMarket.line_index,
    home_selection: homeSelection,
    home_odds: homeOdds,
    away_selection: awaySelection,
    away_odds: awayOdds,
  };
}

export function parseTotalMarket(rawMarket: YbtyRawMarket): CleanTotalMarket | null {
  const overOpt = rawMarket.options.find((opt) => opt.side === "over");
  const underOpt = rawMarket.options.find((opt) => opt.side === "under");

  if (!overOpt || !underOpt) return null;

  const overOdds = parseNumber(overOpt.odds);
  const underOdds = parseNumber(underOpt.odds);
  const line = overOpt.line || underOpt.line || overOpt.selection;

  if (overOdds === null || underOdds === null || !line) return null;

  return {
    line_index: rawMarket.line_index,
    line: line,
    over_odds: overOdds,
    under_odds: underOdds,
  };
}

export function parseYbtyLiveMatch(rawMatch: YbtyRawLiveMatch): ParsedYbtyLiveMatch {
  const homeScore = parseNumber(rawMatch.home_score);
  const awayScore = parseNumber(rawMatch.away_score);
  const clock = rawMatch.clock && rawMatch.clock.trim() ? rawMatch.clock.trim() : null;
  const clockStatus = rawMatch.clock_status ? rawMatch.clock_status.trim() : "";

  const marketsGroup: CleanMarketsGroup = {
    full_h2h: null,
    full_spread_main: null,
    full_spread_subs: [],
    full_total_main: null,
    full_total_subs: [],
    half_h2h: null,
    half_spread_main: null,
    half_total_main: null,
  };

  for (const m of rawMatch.markets) {
    if (!m.market_type_verified || m.market_type_conflict) continue;

    if (m.market === "full_h2h" && !marketsGroup.full_h2h) {
      marketsGroup.full_h2h = parseH2HMarket(m);
    } else if (m.market === "full_spread") {
      const parsed = parseSpreadMarket(m);
      if (parsed) {
        if (m.line_index === 0 && !marketsGroup.full_spread_main) {
          marketsGroup.full_spread_main = parsed;
        } else {
          marketsGroup.full_spread_subs.push(parsed);
        }
      }
    } else if (m.market === "full_total") {
      const parsed = parseTotalMarket(m);
      if (parsed) {
        if (m.line_index === 0 && !marketsGroup.full_total_main) {
          marketsGroup.full_total_main = parsed;
        } else {
          marketsGroup.full_total_subs.push(parsed);
        }
      }
    } else if (m.market === "half_h2h" && !marketsGroup.half_h2h) {
      marketsGroup.half_h2h = parseH2HMarket(m);
    } else if (m.market === "half_spread" && m.line_index === 0 && !marketsGroup.half_spread_main) {
      marketsGroup.half_spread_main = parseSpreadMarket(m);
    } else if (m.market === "half_total" && m.line_index === 0 && !marketsGroup.half_total_main) {
      marketsGroup.half_total_main = parseTotalMarket(m);
    }
  }

  return {
    is_live: true,
    league: rawMatch.league,
    home: rawMatch.home,
    away: rawMatch.away,
    home_score: homeScore,
    away_score: awayScore,
    clock: clock,
    clock_status: clockStatus,
    added_time: rawMatch.added_time || null,
    countdown: rawMatch.countdown || null,
    commence_time: rawMatch.commence_time || null,
    _pre_start_text: rawMatch._pre_start_text || null,
    captured_at: rawMatch.captured_at,
    markets: marketsGroup,
  };
}

export function parseYbtyLiveRoot(raw: unknown): ParsedYbtyLiveResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid YBTY Live Payload: not an object");
  }

  const root = raw as Partial<YbtyRawLiveRoot>;
  if (root.schema_version !== 2) {
    throw new Error(`Unsupported schema_version: ${root.schema_version}. Expected 2.`);
  }
  if (root.export_mode !== "live") {
    throw new Error(`Export mode mismatch: got "${root.export_mode}", expected "live".`);
  }
  if (!Array.isArray(root.matches)) {
    throw new Error("Invalid YBTY Live Payload: matches must be an array");
  }

  const parsedMatches = root.matches.map((m) => parseYbtyLiveMatch(m));

  return {
    schema_version: root.schema_version,
    export_version: root.export_version || "unknown",
    captured_at: root.captured_at || new Date().toISOString(),
    matches: parsedMatches,
  };
}

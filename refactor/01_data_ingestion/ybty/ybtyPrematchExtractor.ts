/**
 * YBTY 赛前 (Prematch) 原始数据提取器实现
 * 遵循 Anti-Tech-Debt Core Laws:
 * 1. 强类型零 any，运行时守卫 (Type Guards)
 * 2. 纯函数无副作用，No In-Place Mutation
 * 3. 严格服从 DATA_SPECIFICATION.md 标准数据结构，去除派生冗余字段
 * 4. 零死代码：开赛时间统一由权威数据源提供，不从 YBTY 推算
 */

import {
  YbtyRawPrematchMatch,
  YbtyRawPrematchRoot,
  CleanMarketsGroup,
  ParsedYbtyPrematchMatch,
  ParsedYbtyPrematchResult,
} from "./types";
import {
  parseH2HMarket,
  parseSpreadMarket,
  parseTotalMarket,
} from "./ybtyLiveExtractor";

export function parseYbtyPrematchMatch(
  rawMatch: YbtyRawPrematchMatch
): ParsedYbtyPrematchMatch {
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
    league: rawMatch.league,
    home: rawMatch.home,
    away: rawMatch.away,
    clock_status: clockStatus,
    markets: marketsGroup,
  };
}

export function parseYbtyPrematchRoot(raw: unknown): ParsedYbtyPrematchResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid YBTY Prematch Payload: not an object");
  }

  const root = raw as Partial<YbtyRawPrematchRoot>;
  if (root.schema_version !== 2) {
    throw new Error(`Unsupported schema_version: ${root.schema_version}. Expected 2.`);
  }
  if (root.export_mode !== "prematch") {
    throw new Error(`Export mode mismatch: got "${root.export_mode}", expected "prematch".`);
  }
  if (!Array.isArray(root.matches)) {
    throw new Error("Invalid YBTY Prematch Payload: matches must be an array");
  }

  const capturedAt = root.captured_at || new Date().toISOString();
  const parsedMatches = root.matches.map((m) => parseYbtyPrematchMatch(m));

  return {
    schema_version: root.schema_version,
    export_version: root.export_version || "unknown",
    captured_at: capturedAt,
    matches: parsedMatches,
  };
}

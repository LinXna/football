/**
 * Team Alias Matching and Normalization Utility
 */

export interface TeamAliasMap {
  manual: Record<string, string[]>;
  auto: Record<string, string[]>;
}

/**
 * Normalizes team name by removing common suffixes, punctuation, and extra spaces.
 * e.g., "丹佛峰会(女)" -> "丹佛峰会女足", "托卢卡体育" -> "托卢卡"
 */
export function normalizeTeamName(name: string): string {
  if (!name) return '';
  let str = String(name).trim();

  // Handle object or json
  if (str === '[object Object]') return '';

  // Standardize common female / youth / venue suffixes
  str = str.replace(/\(女\)|女足|（女）|Women/gi, '女足');
  str = str.replace(/\(中\)|（中）|\[中\]/g, '');
  str = str.replace(/\(主\)|（主）|\[主\]/g, '');
  str = str.replace(/20岁以下|u-20|u_20|u 20|\(u20\)|u20岁以下|u20/gi, 'u20');
  str = str.replace(/21岁以下|u-21|u_21|u 21|\(u21\)|u21岁以下|u21/gi, 'u21');
  str = str.replace(/23岁以下|u-23|u_23|u 23|\(u23\)|u23岁以下|u23/gi, 'u23');
  str = str.replace(/19岁以下|u-19|u_19|u 19|\(u19\)|u19岁以下|u19/gi, 'u19');
  str = str.replace(/17岁以下|u-17|u_17|u 17|\(u17\)|u17岁以下|u17/gi, 'u17');
  str = str.replace(/football club|fc|俱乐部|体育|竞技/gi, '');

  // Remove special symbols and extra spaces
  str = str.replace(/[·\.\-\_\s\(\)（）]/g, '');

  return str.toLowerCase();
}

/**
 * Build a flat lookup map from alias variant (normalized) -> canonical team name
 */
export function buildAliasLookup(manual: Record<string, string[]> = {}, auto: Record<string, string[]> = {}): Map<string, string> {
  const map = new Map<string, string>();

  const dictionaries = [manual, auto];
  // Register every canonical name before aliases. An ambiguous alias must never
  // overwrite an earlier explicit mapping merely because its JSON entry appears
  // later (the cause of 阿利亚 being displayed as 联盟FC).
  for (const dict of dictionaries) {
    for (const canonical of Object.keys(dict)) {
      const normCanonical = normalizeTeamName(canonical);
      if (normCanonical && !map.has(normCanonical)) {
        map.set(normCanonical, canonical);
      }
    }
  }
  for (const dict of dictionaries) {
    for (const [canonical, aliases] of Object.entries(dict)) {
      if (Array.isArray(aliases)) {
        for (const alias of aliases) {
          const normAlias = normalizeTeamName(alias);
          if (normAlias && !map.has(normAlias)) {
            map.set(normAlias, canonical);
          }
        }
      }
    }
  }

  return map;
}

/**
 * Get the canonical name for a team name using the alias lookup
 */
export function getCanonicalName(teamName: string, lookupMap: Map<string, string>): string {
  if (!teamName) return '';
  const norm = normalizeTeamName(teamName);
  if (lookupMap.has(norm)) {
    return lookupMap.get(norm)!;
  }
  return teamName.trim();
}

/**
 * Check if two team names refer to the same team
 */
export function isSameTeam(teamA: string, teamB: string, lookupMap: Map<string, string>): boolean {
  if (!teamA || !teamB) return false;
  const canonicalA = getCanonicalName(teamA, lookupMap);
  const canonicalB = getCanonicalName(teamB, lookupMap);

  if (canonicalA === canonicalB) return true;

  const normA = normalizeTeamName(teamA);
  const normB = normalizeTeamName(teamB);

  if (normA === normB) return true;
  if (normA.length >= 2 && normB.length >= 2 && (normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

  return false;
}

/**
 * Check if two match fixtures represent the same game (Home vs Away)
 */
export function isSameMatch(
  matchA: { home: string; away: string },
  matchB: { home: string; away: string },
  lookupMap: Map<string, string>
): boolean {
  if (!matchA.home || !matchA.away || !matchB.home || !matchB.away) return false;

  const homeMatch = isSameTeam(matchA.home, matchB.home, lookupMap);
  const awayMatch = isSameTeam(matchA.away, matchB.away, lookupMap);

  if (homeMatch && awayMatch) return true;

  // Swap check (in case home/away reversed in some providers)
  const homeSwap = isSameTeam(matchA.home, matchB.away, lookupMap);
  const awaySwap = isSameTeam(matchA.away, matchB.home, lookupMap);

  return homeSwap && awaySwap;
}

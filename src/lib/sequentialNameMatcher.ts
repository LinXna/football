/**
 * Helper functions for sequential character matching and suffix extraction
 */

export interface SuffixInfo {
  gender: 'female' | 'regular';
  ageCategory: string | null; // e.g. 'u19', 'u20', 'u21', 'u23', 'u17'
  cleanName: string;
}

/**
 * Extract gender and youth team suffixes (e.g. 女 / 女足 / U19 / U20 / U21)
 * and return the cleaned base name.
 */
export function extractTeamSuffixes(name: string): SuffixInfo {
  if (!name) return { gender: 'regular', ageCategory: null, cleanName: '' };
  let str = String(name).trim();

  let gender: 'female' | 'regular' = 'regular';
  if (/\(女\)|（女）|\[女\]|女足|Women|women|\bW\b/i.test(str)) {
    gender = 'female';
  }

  let ageCategory: string | null = null;
  const ageMatch = str.match(/(?:23岁以下|u-?23|\(u23\)|（u23）|u23岁以下)/i) ? 'u23'
    : str.match(/(?:21岁以下|u-?21|\(u21\)|（u21）|u21岁以下)/i) ? 'u21'
    : str.match(/(?:20岁以下|u-?20|\(u20\)|（u20）|u20岁以下)/i) ? 'u20'
    : str.match(/(?:19岁以下|u-?19|\(u19\)|（u19）|u19岁以下)/i) ? 'u19'
    : str.match(/(?:17岁以下|u-?17|\(u17\)|（u17）|u17岁以下)/i) ? 'u17'
    : null;
  if (ageMatch) {
    ageCategory = ageMatch;
  }

  // Remove the suffixes and noisy prefixes/suffixes from the cleanName for core text comparison
  let clean = str
    .replace(/\(女\)|（女）|\[女\]|女足|Women|women|\bW\b/gi, '')
    .replace(/(?:23岁以下|u-?23|\(u23\)|（u23）|u23岁以下)/gi, '')
    .replace(/(?:21岁以下|u-?21|\(u21\)|（u21）|u21岁以下)/gi, '')
    .replace(/(?:20岁以下|u-?20|\(u20\)|（u20）|u20岁以下)/gi, '')
    .replace(/(?:19岁以下|u-?19|\(u19\)|（u19）|u19岁以下)/gi, '')
    .replace(/(?:17岁以下|u-?17|\(u17\)|（u17）|u17岁以下)/gi, '')
    .replace(/\(中\)|（中）|\[中\]|\(主\)|（主）|\[主\]/g, '')
    .replace(/football club|fc|俱乐部|体育|竞技/gi, '')
    .replace(/[·\.\-\_\s\(\)（）\[\]]/g, '')
    .toLowerCase();

  return { gender, ageCategory, cleanName: clean };
}

/**
 * Check if pattern is an in-order subsequence of text.
 * e.g. pattern "135" in text "1234567" -> true (1, 3, 5 appear in sequential order).
 */
export function isSequentialSubsequence(pattern: string, text: string): boolean {
  if (!pattern || !text) return false;
  let pIdx = 0;
  for (let tIdx = 0; tIdx < text.length && pIdx < pattern.length; tIdx++) {
    if (pattern[pIdx] === text[tIdx]) {
      pIdx++;
    }
  }
  return pIdx === pattern.length;
}

/**
 * Computes longest common subsequence length to measure match depth.
 */
export function longestCommonSubsequenceLength(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Check if two team or league names match based on:
 * 1. Gender suffix alignment (e.g. 女 vs 女足)
 * 2. Age tier suffix alignment (e.g. U19 vs U19)
 * 3. Sequential character matching (in-order subsequence) or high LCS ratio
 */
export function matchSequentialName(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;

  const infoA = extractTeamSuffixes(nameA);
  const infoB = extractTeamSuffixes(nameB);

  // If one is female and the other is regular, they MUST NOT match
  if (infoA.gender !== infoB.gender) {
    return false;
  }

  // If one has an explicit youth age bracket (e.g. U19) and the other has a DIFFERENT youth age bracket (e.g. U21), they MUST NOT match
  if (infoA.ageCategory && infoB.ageCategory && infoA.ageCategory !== infoB.ageCategory) {
    return false;
  }

  const cleanA = infoA.cleanName;
  const cleanB = infoB.cleanName;

  if (!cleanA || !cleanB) {
    // If names only consisted of suffixes and they matched
    return infoA.gender === infoB.gender && infoA.ageCategory === infoB.ageCategory;
  }

  // Exact match on cleaned names
  if (cleanA === cleanB) return true;

  // Sequential subsequence check: either cleanA is in cleanB in-order, or cleanB is in cleanA in-order
  const minLen = Math.min(cleanA.length, cleanB.length);
  const maxLen = Math.max(cleanA.length, cleanB.length);

  // If the shorter name is at least 2 characters and is a strict in-order subsequence of the longer name
  if (minLen >= 2) {
    if (cleanA.length <= cleanB.length && isSequentialSubsequence(cleanA, cleanB)) {
      return true;
    }
    if (cleanB.length <= cleanA.length && isSequentialSubsequence(cleanB, cleanA)) {
      return true;
    }
  }

  // For longer names (>= 4 chars), if LCS covers >= 75% of the shorter name and order is preserved
  if (minLen >= 4) {
    const lcs = longestCommonSubsequenceLength(cleanA, cleanB);
    if (lcs >= minLen * 0.75 && lcs >= 3) {
      return true;
    }
  }

  return false;
}

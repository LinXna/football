/**
 * 02_canonical_model: matchAligner
 * 实体对齐与相似度仲裁器
 * 
 * 核心原则：
 * 1. 优先查验 team_aliases.json 静态单队别名库 与 league_aliases.json 联赛别名库；
 * 2. 未命中时，采用【保留全部字面（U19/U20/B队/青年队/女足等）的原文字符顺序相似度与公共子序列算法】；
 * 3. 严格检测【主客队颠倒 (Swapped Home/Away)】风险：若检测到 YBTY 与雷速主客相反，绝不当作正常对齐，标为 SWAPPED_HOME_AWAY 警报并降权拦截；
 * 4. 综合联赛名与主客队双向相似度，严谨输出决策与置信分。
 */

import { MatchAlignmentStatus, LeagueMatchStatus } from "./enums";
import {
  TeamNameMatchResult,
  LeagueMatchResult,
  MatchAlignmentDecision,
  GenericYbtyMatch,
} from "./types";
import { ParsedLeisuMatch } from "../01_data_ingestion/leisu/types";

export interface TeamAliasDictionary {
  [ybtyTeamName: string]: string | string[]; // 映射至雷速标准队名
}

export interface LeagueAliasDictionary {
  [canonicalLeague: string]: string | string[]; // 映射至雷速/YBTY联赛别名
}

/**
 * 内置权威足球联赛别名与简称对照表 (单一事实枚举与跨源基准)
 */
export const DEFAULT_LEAGUE_ALIASES: LeagueAliasDictionary = {
  "俄罗斯甲级联赛": ["俄甲", "俄罗斯甲", "俄甲联赛", "Russian First League", "俄FNL"],
  "俄罗斯超级联赛": ["俄超", "俄罗斯超", "俄超联赛", "Russian Premier League"],
  "英格兰超级联赛": ["英超", "英格兰超", "英超联赛", "Premier League", "EPL"],
  "英格兰冠军联赛": ["英冠", "英格兰冠", "英冠联赛", "Championship"],
  "英格兰甲级联赛": ["英甲", "英格兰甲", "英甲联赛", "League One"],
  "英格兰乙级联赛": ["英乙", "英格兰乙", "英乙联赛", "League Two"],
  "西班牙甲级联赛": ["西甲", "西班牙甲", "西甲联赛", "La Liga"],
  "西班牙乙级联赛": ["西乙", "西班牙乙", "西乙联赛", "La Liga 2", "西乙A"],
  "德国甲级联赛": ["德甲", "德国甲", "德甲联赛", "Bundesliga"],
  "德国乙级联赛": ["德乙", "德国乙", "德乙联赛", "2. Bundesliga"],
  "意大利甲级联赛": ["意甲", "意大利甲", "意甲联赛", "Serie A"],
  "意大利乙级联赛": ["意乙", "意大利乙", "意乙联赛", "Serie B"],
  "法国甲级联赛": ["法甲", "法国甲", "法甲联赛", "Ligue 1"],
  "法国乙级联赛": ["法乙", "法国乙", "法乙联赛", "Ligue 2"],
  "巴西甲级联赛": ["巴甲", "巴西甲", "巴甲联赛", "Brasileirao", "巴西甲组联赛"],
  "巴西乙级联赛": ["巴乙", "巴西乙", "巴乙联赛"],
  "阿根廷甲级联赛": ["阿甲", "阿根廷甲", "阿甲联赛"],
  "阿根廷乙级联赛": ["阿乙", "阿根廷乙", "阿乙联赛"],
  "阿根廷乙级曼特波里顿联赛后备队": ["阿乙曼特后备", "阿后备", "阿根廷后备", "阿曼特后备", "阿曼特波里顿后备队"],
  "哥伦比亚甲级联赛": ["哥伦甲", "哥伦比亚甲", "哥伦甲联赛"],
  "荷兰甲级联赛": ["荷甲", "荷兰甲", "荷甲联赛", "Eredivisie"],
  "荷兰乙级联赛": ["荷乙", "荷兰乙", "荷乙联赛", "Eerste Divisie"],
  "葡萄牙超级联赛": ["葡超", "葡萄牙超", "葡超联赛", "Primeira Liga"],
  "日本职业联赛J1": ["日职联", "日职", "日职1", "J1联赛", "J1"],
  "日本职业联赛J2": ["日职乙", "日乙", "J2联赛", "J2"],
  "韩国职业联赛K1": ["韩K联", "韩K1", "韩职", "K联赛", "韩K联赛"],
  "韩国职业联赛K2": ["韩K2", "韩K2联", "韩K乙"],
  "澳大利亚超级联赛": ["澳超", "澳洲甲", "澳大利亚甲", "A-League"],
  "沙特职业联赛": ["沙特联", "沙特超", "Saudi Pro League"],
  "美国职业大联盟": ["美职联", "美职", "MLS"],
  "中国超级联赛": ["中超", "中超联赛"],
  "中国甲级联赛": ["中甲", "中甲联赛"],
  "欧洲冠军联赛": ["欧冠", "欧洲冠军杯", "UEFA Champions League"],
  "欧洲联赛": ["欧联", "欧罗巴", "欧联杯", "UEFA Europa League"],
  "欧洲协会联赛": ["欧协联", "欧协杯", "UEFA Europa Conference League"],
};

/**
 * 联赛标准化规范化函数 (消除冗余缀词，映射等级简写)
 */
export function normalizeLeagueName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/足球俱乐部|足球联赛|超级联赛|甲级联赛|乙级联赛|丙级联赛|丁级联赛|预备队联赛|后备队联赛|职业联赛|青年联赛|公开杯|锦标赛|联赛|杯赛|杯/g, (match) => {
      if (match === '超级联赛') return '超';
      if (match === '甲级联赛') return '甲';
      if (match === '乙级联赛') return '乙';
      if (match === '丙级联赛') return '丙';
      if (match === '丁级联赛') return '丁';
      if (match === '预备队联赛' || match === '后备队联赛') return '后备';
      if (match === '青年联赛') return '青年';
      return '';
    })
    .replace(/超级/g, '超')
    .replace(/甲级/g, '甲')
    .replace(/乙级/g, '乙')
    .replace(/丙级/g, '丙')
    .replace(/预备队/g, '后备')
    .replace(/后备队/g, '后备');
}

/**
 * 严格判断短字符串是否为长字符串的【按字符顺序子序列】 (Sequential Subsequence)
 * 例如："俄甲" 在 "俄罗斯甲级联赛" 中，"俄"位于索引0，"甲"位于索引3，严格顺序包含 -> true
 */
export function isSequentialSubsequence(shortStr: string, longStr: string): boolean {
  const s = String(shortStr || '').trim().toLowerCase();
  const t = String(longStr || '').trim().toLowerCase();
  if (s.length === 0) return true;
  if (s.length > t.length) return false;
  let i = 0;
  let j = 0;
  while (i < s.length && j < t.length) {
    if (s[i] === t[j]) {
      i++;
    }
    j++;
  }
  return i === s.length;
}

/**
 * 计算两个字符串的最长公共子序列 (LCS) 长度
 * 严格保留字符顺序
 */
export function calculateLcsLength(str1: string, str2: string): number {
  const s1 = String(str1 || '').trim().toLowerCase();
  const s2 = String(str2 || '').trim().toLowerCase();
  const m = s1.length;
  const n = s2.length;
  if (m === 0 || n === 0) return 0;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * 基于原文字符顺序的综合文本相似度计算 (0.0 ~ 1.0)
 * 不剔除 U19, U21, B队, 青年队, 女足 等字面后缀
 * 增强：支持按文字顺序匹配 (Sequential Acronym Subsequence)
 */
export function calculateStrictRawTextSimilarity(str1: string, str2: string): number {
  const s1 = String(str1 || '').trim().toLowerCase();
  const s2 = String(str2 || '').trim().toLowerCase();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // 1. 完全包含关系检查 (如 "狼队" 与 "狼队U21" / "阿森纳" 与 "阿森纳足球俱乐部")
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    // 包含但长度有差异时，按比例折算，但有包含底分
    return Number(Math.max(0.75, minLen / maxLen).toFixed(4));
  }

  // 2. 按顺序文字匹配 / 缩写子序列匹配 (如 "俄罗斯甲级联赛" 与 "俄甲", "曼彻斯特联" 与 "曼联")
  const shortStr = s1.length <= s2.length ? s1 : s2;
  const longStr = s1.length <= s2.length ? s2 : s1;

  if (shortStr.length >= 2 && isSequentialSubsequence(shortStr, longStr)) {
    // 短文本严格按顺序出现在长文本中
    if (shortStr[0] === longStr[0]) {
      // 首字完全相同 (如 俄...甲 vs 俄...罗斯甲级联赛)
      const ratio = shortStr.length / longStr.length;
      const seqScore = Math.min(0.92, 0.75 + ratio * 0.25);
      return Number(seqScore.toFixed(4));
    }
  }

  // 3. 最长公共子序列 (LCS) 与最大长度比值
  const lcs = calculateLcsLength(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  const lcsRatio = lcs / maxLen;

  // 4. 前缀一致性微加权 (如果开头几个字完全一致，增加 0.05 权重)
  let prefixBonus = 0;
  if (s1[0] === s2[0] && s1.length > 1 && s2.length > 1 && s1[1] === s2[1]) {
    prefixBonus = 0.05;
  }

  const finalScore = Math.min(1.0, lcsRatio + prefixBonus);
  return Number(finalScore.toFixed(4));
}

/**
 * 联赛比对与枚举/别名库匹配 (含按顺序文字匹配机制)
 */
export function matchLeague(
  ybtyLeague: string,
  leisuLeague: string,
  leagueAliases: LeagueAliasDictionary = {}
): LeagueMatchResult {
  const yTrim = String(ybtyLeague || '').trim();
  const lTrim = String(leisuLeague || '').trim();

  if (!yTrim || !lTrim) {
    return {
      ybty_league: yTrim,
      leisu_league: lTrim,
      status: LeagueMatchStatus.UNMATCHED,
      similarity: 0,
      is_alias_exact_hit: false,
    };
  }

  // 1. 完全一致
  if (yTrim.toLowerCase() === lTrim.toLowerCase()) {
    return {
      ybty_league: yTrim,
      leisu_league: lTrim,
      status: LeagueMatchStatus.MATCHED_BY_ALIAS,
      similarity: 1.0,
      is_alias_exact_hit: true,
    };
  }

  // 2. 合并传入别名库与系统内置权威联赛库
  const mergedAliases: LeagueAliasDictionary = {
    ...DEFAULT_LEAGUE_ALIASES,
    ...leagueAliases,
  };

  // 查验联赛别名/枚举库 (双向查验)
  for (const [canonicalKey, aliases] of Object.entries(mergedAliases)) {
    const aliasList = Array.isArray(aliases) ? aliases : [aliases];
    const allAliases = [canonicalKey, ...aliasList].map((a) => String(a || '').trim().toLowerCase());

    const hasY = allAliases.includes(yTrim.toLowerCase());
    const hasL = allAliases.includes(lTrim.toLowerCase());

    if (hasY && hasL) {
      return {
        ybty_league: yTrim,
        leisu_league: lTrim,
        status: LeagueMatchStatus.MATCHED_BY_ALIAS,
        similarity: 1.0,
        is_alias_exact_hit: true,
      };
    }
  }

  // 3. 规范化后比对 (例如 "俄罗斯甲级联赛" -> "俄罗斯甲" vs "俄甲")
  const normY = normalizeLeagueName(yTrim);
  const normL = normalizeLeagueName(lTrim);

  if (normY === normL && normY.length > 0) {
    return {
      ybty_league: yTrim,
      leisu_league: lTrim,
      status: LeagueMatchStatus.MATCHED_BY_ALIAS,
      similarity: 0.98,
      is_alias_exact_hit: true,
    };
  }

  // 4. 按顺序文字匹配检测 (例如: 俄罗斯甲级联赛 vs 俄甲)
  const isSeq =
    (yTrim.length <= lTrim.length && isSequentialSubsequence(yTrim, lTrim)) ||
    (lTrim.length <= yTrim.length && isSequentialSubsequence(lTrim, yTrim)) ||
    (normY.length <= normL.length && isSequentialSubsequence(normY, normL)) ||
    (normL.length <= normY.length && isSequentialSubsequence(normL, normY));

  // 5. 计算原文字符相似度
  let similarity = calculateStrictRawTextSimilarity(yTrim, lTrim);

  if (isSeq) {
    // 顺序子序列提升至高置信度模糊匹配
    similarity = Math.max(similarity, 0.85);
  }

  if (similarity >= 0.6) {
    return {
      ybty_league: yTrim,
      leisu_league: lTrim,
      status: LeagueMatchStatus.MATCHED_FUZZY,
      similarity,
      is_alias_exact_hit: false,
    };
  }

  return {
    ybty_league: yTrim,
    leisu_league: lTrim,
    status: LeagueMatchStatus.UNMATCHED,
    similarity,
    is_alias_exact_hit: false,
  };
}

/**
 * 单支球队比对匹配
 */
export function matchSingleTeam(
  ybtyName: string,
  leisuName: string,
  aliases: TeamAliasDictionary = {}
): TeamNameMatchResult {
  const yTrim = String(ybtyName || '').trim();
  const lTrim = String(leisuName || '').trim();

  if (!yTrim || !lTrim) {
    return {
      ybty_name: yTrim,
      leisu_name: lTrim,
      is_alias_exact_hit: false,
      raw_text_similarity: 0,
    };
  }

  // 1. 优先查验静态别名库
  const rawAliasVal = aliases[yTrim];
  if (rawAliasVal) {
    const aliasArray = Array.isArray(rawAliasVal) ? rawAliasVal : [rawAliasVal];
    const isHit = aliasArray.some((al) => String(al).trim().toLowerCase() === lTrim.toLowerCase());
    if (isHit) {
      return {
        ybty_name: yTrim,
        leisu_name: lTrim,
        is_alias_exact_hit: true,
        raw_text_similarity: 1.0,
      };
    }
  }

  // 查验反向 key (以防别名库以雷速名为 key)
  const rawReverseVal = aliases[lTrim];
  if (rawReverseVal) {
    const aliasArray = Array.isArray(rawReverseVal) ? rawReverseVal : [rawReverseVal];
    const isHit = aliasArray.some((al) => String(al).trim().toLowerCase() === yTrim.toLowerCase());
    if (isHit) {
      return {
        ybty_name: yTrim,
        leisu_name: lTrim,
        is_alias_exact_hit: true,
        raw_text_similarity: 1.0,
      };
    }
  }

  // 2. 未命中别名库时，执行纯原文字符顺序相似度计算
  const similarity = calculateStrictRawTextSimilarity(yTrim, lTrim);

  return {
    ybty_name: yTrim,
    leisu_name: lTrim,
    is_alias_exact_hit: false,
    raw_text_similarity: similarity,
  };
}

/**
 * 整场比赛双源对齐仲裁
 */
export function alignMatches(
  ybtyMatch: GenericYbtyMatch,
  leisuMatch: ParsedLeisuMatch,
  aliases: TeamAliasDictionary = {},
  leagueAliases: LeagueAliasDictionary = {}
): MatchAlignmentDecision {
  const yHome = ybtyMatch.home || '';
  const yAway = ybtyMatch.away || '';
  const yLeague = ybtyMatch.league || '';

  // 1. 正向比对 (Home vs Home, Away vs Away)
  const homeResult = matchSingleTeam(yHome, leisuMatch.home_team, aliases);
  const awayResult = matchSingleTeam(yAway, leisuMatch.away_team, aliases);
  const leagueResult = matchLeague(yLeague, leisuMatch.competition, leagueAliases);
  const leagueScore = leagueResult.similarity;

  // 2. 反向比对（检测主客颠倒反装风险：YBTY主 vs 雷速客, YBTY客 vs 雷速主）
  const reverseHomeResult = matchSingleTeam(yHome, leisuMatch.away_team, aliases);
  const reverseAwayResult = matchSingleTeam(yAway, leisuMatch.home_team, aliases);

  const forwardTeamAvg = (homeResult.raw_text_similarity + awayResult.raw_text_similarity) / 2;
  const reverseTeamAvg = (reverseHomeResult.raw_text_similarity + reverseAwayResult.raw_text_similarity) / 2;

  // 判断是否严重疑似主客场颠倒
  const isSwappedSuspected =
    (reverseHomeResult.is_alias_exact_hit || reverseHomeResult.raw_text_similarity >= 0.65) &&
    (reverseAwayResult.is_alias_exact_hit || reverseAwayResult.raw_text_similarity >= 0.65) &&
    reverseTeamAvg > forwardTeamAvg + 0.25;

  // 若检测到主客场颠倒：严禁作为正常对齐匹配！强制输出 SWAPPED_HOME_AWAY 警报并限制置信度
  if (isSwappedSuspected) {
    const penaltyConfidence = Math.min(45, Math.round(reverseTeamAvg * 50));
    return {
      status: MatchAlignmentStatus.SWAPPED_HOME_AWAY,
      confidence_score: penaltyConfidence,
      home_team_match: homeResult,
      away_team_match: awayResult,
      league_match: leagueResult,
      league_match_score: leagueScore,
      is_swapped_suspected: true,
      alignment_reason: `⚠️ 严重警报：检测到主客场颠倒（YBTY主队与雷速客队相似度 ${(reverseHomeResult.raw_text_similarity * 100).toFixed(0)}%，YBTY客队与雷速主队相似度 ${(reverseAwayResult.raw_text_similarity * 100).toFixed(0)}%）！严禁自动误推，需人工确认反转或拦截`,
    };
  }

  // 3. 别名双命中直接 100 分
  if (homeResult.is_alias_exact_hit && awayResult.is_alias_exact_hit) {
    return {
      status: MatchAlignmentStatus.MATCHED_BY_ALIAS,
      confidence_score: 100,
      home_team_match: homeResult,
      away_team_match: awayResult,
      league_match: leagueResult,
      league_match_score: leagueScore,
      is_swapped_suspected: false,
      alignment_reason: "主客两队均命中静态别名库 (100% 精确匹配)",
    };
  }

  // 4. 权重分配：主队 40% + 客队 40% + 联赛 20%
  const weightedScore = (homeResult.raw_text_similarity * 40) +
                        (awayResult.raw_text_similarity * 40) +
                        (leagueScore * 20);

  const confidence = Math.round(weightedScore);

  let status: MatchAlignmentStatus;
  let reason: string;

  if (confidence >= 85) {
    status = MatchAlignmentStatus.MATCHED_AUTO;
    reason = `自动高置信度匹配成功 (综合置信分: ${confidence})`;
  } else if (confidence >= 50) {
    status = MatchAlignmentStatus.NEEDS_MANUAL_SELECTION;
    reason = `低置信度候选 (综合置信分: ${confidence})，建议人工核验`;
  } else {
    status = MatchAlignmentStatus.UNMATCHED;
    reason = `相似度过低 (综合置信分: ${confidence})，判定为未匹配`;
  }

  return {
    status,
    confidence_score: confidence,
    home_team_match: homeResult,
    away_team_match: awayResult,
    league_match: leagueResult,
    league_match_score: leagueScore,
    is_swapped_suspected: false,
    alignment_reason: reason,
  };
}

/**
 * 在雷速候选列表中寻找最佳匹配的雷速赛事
 */
export function findBestLeisuMatch(
  ybtyMatch: GenericYbtyMatch,
  leisuCandidates: ParsedLeisuMatch[],
  aliases: TeamAliasDictionary = {},
  leagueAliases: LeagueAliasDictionary = {}
): { best_match: ParsedLeisuMatch | null; decision: MatchAlignmentDecision | null } {
  if (!leisuCandidates || leisuCandidates.length === 0) {
    return { best_match: null, decision: null };
  }

  let highestDecision: MatchAlignmentDecision | null = null;
  let bestCandidate: ParsedLeisuMatch | null = null;

  for (const candidate of leisuCandidates) {
    const decision = alignMatches(ybtyMatch, candidate, aliases, leagueAliases);
    if (!highestDecision || decision.confidence_score > highestDecision.confidence_score) {
      highestDecision = decision;
      bestCandidate = candidate;
    }
  }

  // 若最佳候选未达 50 分阈值且未检测到颠倒警报，视为未匹配
  if (highestDecision && highestDecision.confidence_score < 50 && !highestDecision.is_swapped_suspected) {
    return { best_match: null, decision: highestDecision };
  }

  return {
    best_match: bestCandidate,
    decision: highestDecision,
  };
}


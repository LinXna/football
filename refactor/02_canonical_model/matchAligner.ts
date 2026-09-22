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
 * 提取队伍所属类别/梯队/性别标签 (如 U19, U21, 女足, 青年队, 预备队, B队)
 */
export function extractTeamCategory(name: string): string | null {
  const s = String(name || '').toLowerCase();
  if (/(?:u-?17|17岁以下)/.test(s)) return 'U17';
  if (/(?:u-?18|18岁以下)/.test(s)) return 'U18';
  if (/(?:u-?19|19岁以下)/.test(s)) return 'U19';
  if (/(?:u-?20|20岁以下)/.test(s)) return 'U20';
  if (/(?:u-?21|21岁以下)/.test(s)) return 'U21';
  if (/(?:u-?22|22岁以下)/.test(s)) return 'U22';
  if (/(?:u-?23|23岁以下)/.test(s)) return 'U23';
  if (/(?:女足|女子|女队|women|ladies|fem(?:in(?:as?|ine?))?)/.test(s)) return 'WOMEN';
  if (/(?:预备队|后备队|预备|后备|reserve|reserves)/.test(s)) return 'RESERVE';
  if (/(?:青年队|青年|少年|youth|juniors?)/.test(s)) return 'YOUTH';
  if (/(?:b队|二队|team\s*b|\bb\b)/.test(s)) return 'B_TEAM';
  if (/(?:c队|三队|team\s*c|\bc\b)/.test(s)) return 'C_TEAM';
  return null;
}

// 常见通用/无区分度词汇集合（长度短或为纯缀词，不能单凭包含判定为0.75高相似度）
const GENERIC_FOOTBALL_TOKENS = new Set([
  'fc', 'sc', 'cf', 'ac', 'cd', 'as', '联', '队', '竞技', '体育', '城', '俱乐部', '联合', '联队', '足球', '足球队', '足球俱乐部', '运动'
]);

/**
 * 计算两个字符串的最长公共子序列 (LCS) 长度
 * 采用滚动单维 Int32Array 缓冲区，彻底杜绝高频 GC 与 2D 矩阵创建开销
 */
export function calculateLcsLength(str1: string, str2: string): number {
  const s1 = String(str1 || '').trim().toLowerCase();
  const s2 = String(str2 || '').trim().toLowerCase();
  const m = s1.length;
  const n = s2.length;
  if (m === 0 || n === 0) return 0;
  if (s1 === s2) return m;

  let prev = new Int32Array(n + 1);
  let curr = new Int32Array(n + 1);

  for (let i = 1; i <= m; i++) {
    const charCode1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      if (charCode1 === s2.charCodeAt(j - 1)) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = prev[j] > curr[j - 1] ? prev[j] : curr[j - 1];
      }
    }
    const temp = prev;
    prev = curr;
    curr = temp;
    curr.fill(0);
  }

  return prev[n];
}

/**
 * 基于原文字符顺序的综合文本相似度计算 (0.0 ~ 1.0)
 * 严格防范不同赛事/梯队错配：
 * 1. 梯队/性别标签硬隔离 (U19/U21/青年/后备/女足 vs 一线队)
 * 2. 消除短通用词 (如“联”、“城”、“FC”) 的 0.75 虚假底分
 * 3. 极速滚动 LCS 算法与前缀一致性加权
 */
export function calculateStrictRawTextSimilarity(str1: string, str2: string): number {
  const s1 = String(str1 || '').trim().toLowerCase();
  const s2 = String(str2 || '').trim().toLowerCase();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // 1. 梯队与性别硬隔离检测：若一方有青年/后备/女足等标签而另一方没有或不同，严禁高相似度
  const cat1 = extractTeamCategory(s1);
  const cat2 = extractTeamCategory(s2);
  const isCategoryMismatch = (cat1 !== null || cat2 !== null) && cat1 !== cat2;
  if (isCategoryMismatch) {
    // 梯队或性别冲突（如 巴塞罗那 vs 巴塞罗那女足，阿森纳 vs 阿森纳U21），物理降权阻断
    return 0.15;
  }

  // 2. 包含关系检查 (如 "狼队" 与 "狼队fc" / "阿森纳" 与 "阿森纳足球俱乐部")
  const shortStr = s1.length <= s2.length ? s1 : s2;
  const longStr = s1.length <= s2.length ? s2 : s1;

  if (longStr.includes(shortStr)) {
    // 若较短字符串属于纯通用无区分度词汇 (如 "联", "队", "fc", "竞技")，不可赋予 0.75 底分
    if (GENERIC_FOOTBALL_TOKENS.has(shortStr) || shortStr.length <= 1) {
      return 0.10;
    }
    const ratio = shortStr.length / longStr.length;
    // 只有当短字串长度达到 3 或占长字串比重较高时，才享受包含底分
    if (shortStr.length >= 3 || ratio >= 0.5) {
      return Number(Math.max(0.75, ratio).toFixed(4));
    }
    return Number(Math.max(0.40, ratio * 1.2).toFixed(4));
  }

  // 3. 按顺序文字匹配 / 缩写子序列匹配 (如 "俄罗斯甲级联赛" 与 "俄甲", "曼彻斯特联" 与 "曼联")
  if (shortStr.length >= 2 && !GENERIC_FOOTBALL_TOKENS.has(shortStr) && isSequentialSubsequence(shortStr, longStr)) {
    if (shortStr[0] === longStr[0]) {
      const ratio = shortStr.length / longStr.length;
      const seqScore = Math.min(0.92, 0.70 + ratio * 0.25);
      return Number(seqScore.toFixed(4));
    }
  }

  // 4. 最长公共子序列 (LCS) 与最大长度比值
  const lcs = calculateLcsLength(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  const lcsRatio = lcs / maxLen;

  // 5. 前缀一致性加权
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

  // 4. 权重分配与门禁核验：主队 40% + 客队 40% + 联赛 20%
  const minTeamSimilarity = Math.min(homeResult.raw_text_similarity, awayResult.raw_text_similarity);
  const hasSevereTeamAsymmetry = minTeamSimilarity < 0.38 && !homeResult.is_alias_exact_hit && !awayResult.is_alias_exact_hit;
  const hasSevereLeagueMismatch = leagueScore < 0.25 && !homeResult.is_alias_exact_hit && !awayResult.is_alias_exact_hit;

  // 严格拦截：如果其中一支球队完全不匹配，或者跨联赛毫不相关，严禁误判为同场比赛！
  if (hasSevereTeamAsymmetry || hasSevereLeagueMismatch) {
    const cappedScore = Math.min(35, Math.round(minTeamSimilarity * 50));
    return {
      status: MatchAlignmentStatus.UNMATCHED,
      confidence_score: cappedScore,
      home_team_match: homeResult,
      away_team_match: awayResult,
      league_match: leagueResult,
      league_match_score: leagueScore,
      is_swapped_suspected: false,
      alignment_reason: hasSevereTeamAsymmetry
        ? `单侧球队名称严重不匹配 (最低球队相似度: ${(minTeamSimilarity * 100).toFixed(0)}%)，判定为未匹配`
        : `赛事所属联赛不匹配 (联赛相似度: ${(leagueScore * 100).toFixed(0)}%)，判定为未匹配`,
    };
  }

  const weightedScore = (homeResult.raw_text_similarity * 40) +
                        (awayResult.raw_text_similarity * 40) +
                        (leagueScore * 20);

  const confidence = Math.round(weightedScore);

  let status: MatchAlignmentStatus;
  let reason: string;

  // 只有两队均具备良好相似度 (>= 0.65 或命中别名) 且联赛匹配良好 (>= 0.35) 才能自动放行
  const isEligibleForAutoMatch = confidence >= 85 && (minTeamSimilarity >= 0.65 || homeResult.is_alias_exact_hit || awayResult.is_alias_exact_hit) && (leagueScore >= 0.35 || leagueResult.is_alias_exact_hit);

  if (isEligibleForAutoMatch) {
    status = MatchAlignmentStatus.MATCHED_AUTO;
    reason = `自动高置信度匹配成功 (综合置信分: ${confidence})`;
  } else if (confidence >= 50 && minTeamSimilarity >= 0.40) {
    status = MatchAlignmentStatus.NEEDS_MANUAL_SELECTION;
    reason = `低置信度候选 (综合置信分: ${confidence})，需人工在向导中确认`;
  } else {
    status = MatchAlignmentStatus.UNMATCHED;
    reason = `相似度过低或对称度不足 (综合置信分: ${confidence})，判定为未匹配`;
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
): {
  best_match: ParsedLeisuMatch | null;
  decision: MatchAlignmentDecision | null;
  manual_candidate?: ParsedLeisuMatch | null;
} {
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

  // 最佳决策低于 50 分或出现主客颠倒，判定未匹配
  if (!highestDecision || highestDecision.confidence_score < 50 || highestDecision.is_swapped_suspected) {
    return { best_match: null, decision: highestDecision };
  }

  // 关键防错逻辑：只有达成正式自动匹配 (别名命中或高置信自动) 才返回 best_match (自动装配)
  // 如果是 50-84 分的低置信度候选，只作为 manual_candidate 返回供向导人工确认，不自动装配！
  const isAuto = highestDecision.status === MatchAlignmentStatus.MATCHED_BY_ALIAS ||
                 highestDecision.status === MatchAlignmentStatus.MATCHED_AUTO;

  if (isAuto) {
    return {
      best_match: bestCandidate,
      decision: highestDecision,
    };
  }

  return {
    best_match: null,
    decision: highestDecision,
    manual_candidate: bestCandidate,
  };
}


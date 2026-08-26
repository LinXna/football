/**
 * 02_canonical_model: matchAligner
 * 实体对齐与相似度仲裁器
 * 
 * 核心原则：
 * 1. 优先查验 team_aliases.json 静态单队别名库；
 * 2. 未命中时，采用【保留全部字面（U19/U20/B队/青年队/女足等）的原文字符顺序相似度与公共子序列算法】；
 * 3. 综合联赛名与主客队双向相似度，严谨输出决策与置信分。
 */

import { MatchAlignmentStatus } from "./enums";
import { TeamNameMatchResult, MatchAlignmentDecision, GenericYbtyMatch } from "./types";
import { ParsedLeisuMatch } from "../01_data_ingestion/leisu/types";

export interface TeamAliasDictionary {
  [ybtyTeamName: string]: string; // 映射至雷速标准队名
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
    // 包含但长度有差异时，按比例折算
    return Number((minLen / maxLen).toFixed(4));
  }

  // 2. 最长公共子序列 (LCS) 与最大长度比值
  const lcs = calculateLcsLength(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  const lcsRatio = lcs / maxLen;

  // 3. 前缀一致性微加权 (如果开头几个字完全一致，增加 0.05 权重)
  let prefixBonus = 0;
  if (s1[0] === s2[0] && s1.length > 1 && s2.length > 1 && s1[1] === s2[1]) {
    prefixBonus = 0.05;
  }

  const finalScore = Math.min(1.0, lcsRatio + prefixBonus);
  return Number(finalScore.toFixed(4));
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

  // 1. 优先查验静态别名库
  const aliasedName = aliases[yTrim];
  if (aliasedName && aliasedName.toLowerCase() === lTrim.toLowerCase()) {
    return {
      ybty_name: yTrim,
      leisu_name: lTrim,
      is_alias_exact_hit: true,
      raw_text_similarity: 1.0,
    };
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
  aliases: TeamAliasDictionary = {}
): MatchAlignmentDecision {
  const yHome = ybtyMatch.home || '';
  const yAway = ybtyMatch.away || '';
  const yLeague = ybtyMatch.league || '';

  const homeResult = matchSingleTeam(yHome, leisuMatch.home_team, aliases);
  const awayResult = matchSingleTeam(yAway, leisuMatch.away_team, aliases);

  // 联赛相似度 (雷速字段为 competition)
  const leagueScore = calculateStrictRawTextSimilarity(yLeague, leisuMatch.competition);

  // 综合置信分计算 (满分 100)
  // 别名双命中直接 100 分
  if (homeResult.is_alias_exact_hit && awayResult.is_alias_exact_hit) {
    return {
      status: MatchAlignmentStatus.MATCHED_BY_ALIAS,
      confidence_score: 100,
      home_team_match: homeResult,
      away_team_match: awayResult,
      league_match_score: leagueScore,
      alignment_reason: "主客两队均命中静态别名库 (100% 精确匹配)",
    };
  }

  // 权重分配：主队 40% + 客队 40% + 联赛 20%
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
    league_match_score: leagueScore,
    alignment_reason: reason,
  };
}

/**
 * 在雷速候选列表中寻找最佳匹配的雷速赛事
 */
export function findBestLeisuMatch(
  ybtyMatch: GenericYbtyMatch,
  leisuCandidates: ParsedLeisuMatch[],
  aliases: TeamAliasDictionary = {}
): { best_match: ParsedLeisuMatch | null; decision: MatchAlignmentDecision | null } {
  if (!leisuCandidates || leisuCandidates.length === 0) {
    return { best_match: null, decision: null };
  }

  let highestDecision: MatchAlignmentDecision | null = null;
  let bestCandidate: ParsedLeisuMatch | null = null;

  for (const candidate of leisuCandidates) {
    const decision = alignMatches(ybtyMatch, candidate, aliases);
    if (!highestDecision || decision.confidence_score > highestDecision.confidence_score) {
      highestDecision = decision;
      bestCandidate = candidate;
    }
  }

  // 若最佳候选未达 50 分阈值，视为未匹配
  if (highestDecision && highestDecision.confidence_score < 50) {
    return { best_match: null, decision: highestDecision };
  }

  return {
    best_match: bestCandidate,
    decision: highestDecision,
  };
}

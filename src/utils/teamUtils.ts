// 统一队名解析与匹配公共工具库 (Team Utils)
import manualAliases from '../../team_aliases.json';
import autoAliases from '../../team_aliases_auto.json';
import { buildAliasLookup, getCanonicalName } from '../lib/teamAliasMatcher';

export interface TeamQualifiers {
  u20: boolean;
  u21: boolean;
  u23: boolean;
  u19: boolean;
  u17: boolean;
  reserve: boolean; // 后备 / 预备
  women: boolean;   // 女足
  allStar: boolean; // 明星队 / 全明星
}

/**
 * 提取队名中的强分类限定词
 */
export function getTeamQualifiers(str: string): TeamQualifiers {
  const s = (str || '').toLowerCase();
  return {
    u20: s.includes('u20'),
    u21: s.includes('u21'),
    u23: s.includes('u23'),
    u19: s.includes('u19'),
    u17: s.includes('u17'),
    reserve: s.includes('后备') || s.includes('预备') || s.includes('reserve'),
    women: s.includes('女') || s.includes('women'),
    allStar: s.includes('明星') || s.includes('全明星') || s.includes('allstar') || s.includes('all-star'),
  };
}

/**
 * 校验两个队名的分类限定词是否相互兼容（如 U20 不能匹配 明星队 或 国家队主队）
 */
export function areQualifiersCompatible(a: string, b: string): boolean {
  const qa = getTeamQualifiers(a);
  const qb = getTeamQualifiers(b);
  if (qa.u20 !== qb.u20) return false;
  if (qa.u21 !== qb.u21) return false;
  if (qa.u23 !== qb.u23) return false;
  if (qa.u19 !== qb.u19) return false;
  if (qa.u17 !== qb.u17) return false;
  if (qa.reserve !== qb.reserve) return false;
  if (qa.women !== qb.women) return false;
  if (qa.allStar !== qb.allStar) return false;
  return true;
}

/**
 * 标准化队名（清洗无关助词，保留核心限定词）
 */
export function normalizeTeamName(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/-(ybty|leisu|雷速|YBTY|LEISU)$/gi, '')
    .replace(/20岁以下|u-20|u_20|u 20|\(u20\)|u20岁以下/gi, 'u20')
    .replace(/21岁以下|u-21|u_21|u 21|\(u21\)|u21岁以下/gi, 'u21')
    .replace(/23岁以下|u-23|u_23|u 23|\(u23\)|u23岁以下/gi, 'u23')
    .replace(/19岁以下|u-19|u_19|u 19|\(u19\)|u19岁以下/gi, 'u19')
    .replace(/17岁以下|u-17|u_17|u 17|\(u17\)|u17岁以下/gi, 'u17')
    .replace(/football club|fc|俱乐部|体育|竞技/gi, '')
    .replace(/[\s\-_:\.\(\)\（\）\【\】\[\]]/g, '')
    .trim();
}

// 构建全局别名 Lookup Map
export const globalAliasLookupMap = buildAliasLookup(
  (manualAliases as Record<string, string[]>) || {},
  (autoAliases as Record<string, string[]>) || {}
);

export function parseMatchTeams(matchStr: string): { home: string; away: string } {
  if (!matchStr) return { home: '', away: '' };
  const parts = matchStr.split(/\s+vs\s+/i);
  if (parts.length >= 2) {
    return {
      home: parts[0].replace(/^\[.*?\]\s*/, '').trim(),
      away: parts[1].trim(),
    };
  }
  return { home: matchStr.trim(), away: '' };
}

/**
 * 核心：全局统一判断两队名是否为同一支球队
 */
export function isSameTeamName(
  teamA: string,
  teamB: string,
  aliasMap: Record<string, string[]> = {}
): boolean {
  if (!teamA || !teamB) return false;
  if (!areQualifiersCompatible(teamA, teamB)) return false;

  const aLower = teamA.trim().toLowerCase();
  const bLower = teamB.trim().toLowerCase();
  if (aLower === bLower) return true;

  const na = normalizeTeamName(teamA);
  const nb = normalizeTeamName(teamB);
  if (na && nb && na === nb) return true;

  // 检查别名词典
  const aliasA = aliasMap[aLower] || [];
  if (aliasA.some((v) => v.toLowerCase() === bLower || normalizeTeamName(v) === nb)) return true;

  const aliasB = aliasMap[bLower] || [];
  if (aliasB.some((v) => v.toLowerCase() === aLower || normalizeTeamName(v) === na)) return true;

  // 严格子串判定（只有长度>=4且避开通用国家/地区短名）
  const genericList = ['墨西哥', '西班牙', '英格兰', '日本', '中国', '巴西', '阿根廷', '德国', '意大利', '法国', '巴拿马', '美国', '加拿大', '墨西'];
  if (
    na.length >= 4 &&
    nb.length >= 4 &&
    !genericList.includes(na) &&
    !genericList.includes(nb) &&
    (na.includes(nb) || nb.includes(na))
  ) {
    return true;
  }

  return false;
}

/**
 * 全局统一解析并格式化比赛条目的主客队与对阵信息（全平台单点统一）
 */
export interface UnifiedTeamDisplay {
  ybtyHome: string;
  ybtyAway: string;
  leisuHome: string;
  leisuAway: string;
  homeYbtyLabel: string;
  homeLeisuLabel: string;
  awayYbtyLabel: string;
  awayLeisuLabel: string;
  displayHome: string;
  displayAway: string;
  matchName: string;
  leisuMatchName: string;
  hasLeisuMatched: boolean;
}

export function getUnifiedTeamDisplay(item: any): UnifiedTeamDisplay {
  if (!item) {
    return {
      ybtyHome: '主队',
      ybtyAway: '客队',
      leisuHome: '主队',
      leisuAway: '客队',
      homeYbtyLabel: '主队',
      homeLeisuLabel: '主队',
      awayYbtyLabel: '客队',
      awayLeisuLabel: '客队',
      displayHome: '主队',
      displayAway: '客队',
      matchName: '主队 vs 客队',
      leisuMatchName: '主队 vs 客队',
      hasLeisuMatched: false,
    };
  }

  // 1. 提取 YBTY 队名
  let ybtyHome = item.ybty_home || item.home || '';
  let ybtyAway = item.ybty_away || item.away || '';

  const matchStr = item.match || item.match_name || item.ybty_match || '';
  if ((!ybtyHome || !ybtyAway) && matchStr && typeof matchStr === 'string' && !matchStr.startsWith('【AI')) {
    const parts = matchStr.split(/\s+vs\s+/i);
    if (parts.length >= 2) {
      if (!ybtyHome) ybtyHome = parts[0].replace(/^\[.*?\]\s*/, '').trim();
      if (!ybtyAway) ybtyAway = parts[1].trim();
    }
  }

  ybtyHome = ybtyHome || '主队';
  ybtyAway = ybtyAway || '客队';

  // 2. 提取 雷速 队名（多字段全方位检测）
  let explicitLeisuHome =
    item.leisu_home ||
    item.leisu_home_team ||
    item.matched_leisu_home ||
    item.details?.leisu_home ||
    item.candidate?.match?.home ||
    item.candidate?.leisu_home ||
    item.match_info?.leisu_home ||
    item.leisu_raw?.home ||
    '';
  let explicitLeisuAway =
    item.leisu_away ||
    item.leisu_away_team ||
    item.matched_leisu_away ||
    item.details?.leisu_away ||
    item.candidate?.match?.away ||
    item.candidate?.leisu_away ||
    item.match_info?.leisu_away ||
    item.leisu_raw?.away ||
    '';

  const leisuMatchStr = item.leisu_match || item.details?.leisu_match || '';
  if ((!explicitLeisuHome || !explicitLeisuAway) && leisuMatchStr && typeof leisuMatchStr === 'string') {
    const lParts = leisuMatchStr.split(/\s+vs\s+/i);
    if (lParts.length >= 2) {
      if (!explicitLeisuHome) explicitLeisuHome = lParts[0].replace(/^\[.*?\]\s*/, '').trim();
      if (!explicitLeisuAway) explicitLeisuAway = lParts[1].trim();
    }
  }

  // 3. 通过别名词典查找对齐别名
  let aliasLeisuHome = '';
  let aliasLeisuAway = '';
  const canonicalHome = getCanonicalName(ybtyHome, globalAliasLookupMap);
  if (canonicalHome && areQualifiersCompatible(ybtyHome, canonicalHome)) {
    aliasLeisuHome = canonicalHome;
  }
  const canonicalAway = getCanonicalName(ybtyAway, globalAliasLookupMap);
  if (canonicalAway && areQualifiersCompatible(ybtyAway, canonicalAway)) {
    aliasLeisuAway = canonicalAway;
  }

  const finalLeisuHome = explicitLeisuHome && explicitLeisuHome !== ybtyHome
    ? explicitLeisuHome
    : aliasLeisuHome || explicitLeisuHome || ybtyHome;
  const finalLeisuAway = explicitLeisuAway && explicitLeisuAway !== ybtyAway
    ? explicitLeisuAway
    : aliasLeisuAway || explicitLeisuAway || ybtyAway;

  const hasLeisuMatched = true; // 默认全面对齐，展示完整两端标识

  return {
    ybtyHome,
    ybtyAway,
    leisuHome: finalLeisuHome,
    leisuAway: finalLeisuAway,
    // Keep provider names outside the selectable team-name text. Components
    // already render YBTY and Leisu on separate rows/colors, so suffixes only
    // make copied names incorrect (for example "墨西哥U20-YBTY").
    homeYbtyLabel: ybtyHome,
    homeLeisuLabel: finalLeisuHome,
    awayYbtyLabel: ybtyAway,
    awayLeisuLabel: finalLeisuAway,
    displayHome: ybtyHome,
    displayAway: ybtyAway,
    matchName: `${ybtyHome} vs ${ybtyAway}`,
    leisuMatchName: `${finalLeisuHome} vs ${finalLeisuAway}`,
    hasLeisuMatched: true,
  };
}

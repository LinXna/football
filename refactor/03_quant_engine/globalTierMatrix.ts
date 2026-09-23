import { FootballTier, TierProfile, TIER_PROFILES, NATIONAL_TEAM_TIERS, CLUB_TIERS, LEAGUE_TIERS } from './tierData.js';

export { FootballTier, TIER_PROFILES };
export type { TierProfile };

/**
 * 启发式推断引擎：当名称不在显式字典时，根据多维特征 100% 兜底推断层级
 */
export function resolveTeamTier(teamName: string, leagueName?: string): FootballTier {
  if (!teamName) return FootballTier.TIER_4;
  const cleanTeam = teamName.trim();

  // 1. 显式全字匹配 (俱乐部与国家队)
  if (CLUB_TIERS[cleanTeam]) {
    return CLUB_TIERS[cleanTeam];
  }
  if (NATIONAL_TEAM_TIERS[cleanTeam]) {
    return NATIONAL_TEAM_TIERS[cleanTeam];
  }

  // 2. 青年国字号提取核心国名 (如 "菲律宾U23" -> "菲律宾")
  const youthMatch = cleanTeam.match(/^(.+?)(U\d+|国奥|青年队|二队|预备队)$/i);
  if (youthMatch && youthMatch[1]) {
    const baseCountry = youthMatch[1].trim();
    if (NATIONAL_TEAM_TIERS[baseCountry]) {
      const parentTier = NATIONAL_TEAM_TIERS[baseCountry];
      // 青年队在父级国家队基础上视洲际格局做微调
      if (/乌兹别克/i.test(baseCountry)) return FootballTier.TIER_1; // 乌兹别克 U23 为亚洲霸主
      if (/越南|泰国/i.test(baseCountry)) return FootballTier.TIER_2;   // 越南 U23 东南亚王者
      if (/菲律宾|印尼|马来/i.test(baseCountry)) return FootballTier.TIER_4; // 菲律宾青年队基础弱
      return parentTier;
    }
  }

  // 3. 部分包含匹配 (如 "皇家马德里 [客]" -> "皇家马德里", "西班牙 [中]" -> "西班牙")
  for (const [key, tier] of Object.entries(CLUB_TIERS)) {
    if (cleanTeam.includes(key)) {
      return tier;
    }
  }
  for (const [key, tier] of Object.entries(NATIONAL_TEAM_TIERS)) {
    if (cleanTeam.includes(key)) {
      return tier;
    }
  }

  // 4. 根据所在赛事级别进行回退推断
  if (leagueName) {
    const leagueTier = resolveLeagueTier(leagueName);
    return Math.min(FootballTier.TIER_5, leagueTier + 1) as FootballTier;
  }

  // 5. 绝对保底：中游 TIER_3
  return FootballTier.TIER_3;
}

/**
 * 启发式推断引擎：解析赛事/联赛层级
 */
export function resolveLeagueTier(leagueName: string): FootballTier {
  if (!leagueName) return FootballTier.TIER_4;
  const clean = leagueName.trim();

  // 1. 显式匹配
  if (LEAGUE_TIERS[clean]) {
    return LEAGUE_TIERS[clean];
  }

  // 2. 词缀启发式规则
  for (const [key, tier] of Object.entries(LEAGUE_TIERS)) {
    if (clean.includes(key)) {
      return tier;
    }
  }

  // 3. 关键词模式匹配
  if (/欧冠|Champions League|世界杯|World Cup/i.test(clean)) return FootballTier.TIER_1;
  if (/欧联|Europa|解放者杯|亚冠|AFC Champions|英超|西甲|德甲|意甲|法甲/i.test(clean)) return FootballTier.TIER_2;
  if (/超级|Super|甲级|Primera|Serie A|Championship|英冠|德乙|意乙|西乙/i.test(clean)) return FootballTier.TIER_3;
  if (/乙级|联赛杯|League 1|锦标赛|Tournament|亚运|U23/i.test(clean)) return FootballTier.TIER_4;
  if (/友谊|Friendly|青年|Youth|U19|U21|预备|Reserve|丙级|业余/i.test(clean)) return FootballTier.TIER_5;

  return FootballTier.TIER_3;
}

/**
 * 获取队伍攻防基准配置
 */
export function getTeamStrengthProfile(teamName: string, leagueName?: string): TierProfile {
  const tier = resolveTeamTier(teamName, leagueName);
  return TIER_PROFILES[tier];
}

/**
 * 赛会制/青年队/杯赛 vs 常规联赛自适应时间回溯窗口与半衰期
 * 彻底解决青年队大赛两年一届导致 365 天一刀切物理抹杀历史样本的系统缺陷
 */
export function getAdaptiveLookbackWindow(leagueName?: string, homeName?: string, awayName?: string): { maxDays: number; halfLifeDays: number } {
  const combined = `${leagueName || ''} ${homeName || ''} ${awayName || ''}`;
  if (/U23|U21|U20|U19|杯|Cup|锦标|亚运|奥运|Asian Games|Tournament|国奥|青年|World Cup|Asian Cup|Euro|洲际/i.test(combined)) {
    return { maxDays: 1460, halfLifeDays: 365 };
  }
  return { maxDays: 730, halfLifeDays: 365 };
}


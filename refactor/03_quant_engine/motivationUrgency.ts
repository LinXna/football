/**
 * @file motivationUrgency.ts
 * @description Layer 03 M2 子模块：联赛积分榜战意生命周期因子（Motivation & Urgency Index, MUI）
 *
 * 从 contextEngine.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { ParsedTeamStanding } from '../01_data_ingestion/leisu/types.js';

/**
 * 联赛赛制类型
 * - single: 单循环/双循环积分赛
 * - split:  分阶段赛制（常规赛 + 争冠组/降级组附加赛，如瑞士超、奥甲、苏超、比甲、韩K）
 * - swiss:  瑞士轮（杯赛小组赛等，MUI 不适用，仅作类型占位）
 */
export type CompetitionFormatType = 'single' | 'split' | 'swiss';

/**
 * 当季赛制元数据（用于 MUI 战意判定，替代写死队数表 + 固定百分位）
 * 来源：优先联网预取（intel），降级内置专家 fallback
 */
export interface CompetitionFormatMeta {
  total_teams: number;        // 总参赛队数
  relegation_slots: number;   // 降级危险区名额（含直接降级 + 升降级附加赛；0 = 无降级）
  continental_slots: number;  // 洲际/欧战资格名额（争冠动力区，前 N 名）
  format_type: CompetitionFormatType;
  source: 'BUILTIN_FALLBACK' | 'INTEL';
  season: string | null;
}

/**
 * 情报预取产物（阶段 4 联网预取写入 prematch_intel.json，03 只读）
 * 当前仅含赛制元数据，后续扩展伤停原因、杯赛轮换意图等
 */
export interface PrematchIntel {
  competition_format?: CompetitionFormatMeta | null;
}

/**
 * 内置专家 fallback 赛制元数据表（当季队数 + 降级名额 + 洲际资格名额）
 * 关键：这些是「当季」配置，赛制规则会随赛季变动；优先用 intel 覆盖，此表仅作降级兜底。
 */
const BUILTIN_LEAGUE_FORMAT: Array<{ keys: string[]; meta: Omit<CompetitionFormatMeta, 'source' | 'season'> }> = [
  { keys: ['英超', 'premier league'], meta: { total_teams: 20, relegation_slots: 3, continental_slots: 6, format_type: 'single' } },
  { keys: ['西甲', 'la liga'], meta: { total_teams: 20, relegation_slots: 3, continental_slots: 6, format_type: 'single' } },
  { keys: ['意甲', 'serie a'], meta: { total_teams: 20, relegation_slots: 3, continental_slots: 6, format_type: 'single' } },
  { keys: ['法甲', 'ligue 1'], meta: { total_teams: 18, relegation_slots: 2, continental_slots: 5, format_type: 'single' } },
  { keys: ['德甲', 'bundesliga'], meta: { total_teams: 18, relegation_slots: 2, continental_slots: 6, format_type: 'single' } },
  { keys: ['荷甲', 'eredivisie'], meta: { total_teams: 18, relegation_slots: 1, continental_slots: 4, format_type: 'single' } },
  { keys: ['葡超', 'primeira liga'], meta: { total_teams: 18, relegation_slots: 2, continental_slots: 4, format_type: 'single' } },
  { keys: ['日职', '日职联', 'j1 league'], meta: { total_teams: 20, relegation_slots: 2, continental_slots: 3, format_type: 'single' } },
  { keys: ['日职乙', 'j2 league'], meta: { total_teams: 20, relegation_slots: 2, continental_slots: 2, format_type: 'single' } },
  { keys: ['韩k联', '韩k1', 'k联赛', 'k league 1'], meta: { total_teams: 12, relegation_slots: 2, continental_slots: 3, format_type: 'split' } },
  { keys: ['中超', 'csl'], meta: { total_teams: 16, relegation_slots: 2, continental_slots: 3, format_type: 'single' } },
  { keys: ['瑞士超'], meta: { total_teams: 12, relegation_slots: 1, continental_slots: 3, format_type: 'split' } },
  { keys: ['奥甲', 'austrian bundesliga'], meta: { total_teams: 12, relegation_slots: 1, continental_slots: 3, format_type: 'split' } },
  { keys: ['苏超', 'scottish premiership'], meta: { total_teams: 12, relegation_slots: 1, continental_slots: 3, format_type: 'split' } },
  { keys: ['比甲', 'belgian pro league'], meta: { total_teams: 16, relegation_slots: 2, continental_slots: 4, format_type: 'split' } },
  { keys: ['俄超'], meta: { total_teams: 16, relegation_slots: 2, continental_slots: 3, format_type: 'single' } },
  { keys: ['土超'], meta: { total_teams: 19, relegation_slots: 3, continental_slots: 5, format_type: 'single' } },
  { keys: ['美职联', '美国职业大联盟', '美国职业足球大联盟', 'mls'], meta: { total_teams: 29, relegation_slots: 0, continental_slots: 4, format_type: 'single' } },
  { keys: ['巴甲', 'brasileiro'], meta: { total_teams: 20, relegation_slots: 4, continental_slots: 4, format_type: 'single' } },
  { keys: ['澳超', 'a-league'], meta: { total_teams: 12, relegation_slots: 0, continental_slots: 2, format_type: 'single' } }
];

/**
 * 解析当季赛制元数据：intel 优先，内置专家 fallback 兜底，最后通用默认
 */
export function resolveCompetitionFormat(leagueName: string, intel?: PrematchIntel | null): CompetitionFormatMeta {
  const clean = (leagueName || '').trim().toLowerCase();

  if (intel?.competition_format && intel.competition_format.total_teams > 0) {
    return { ...intel.competition_format, source: 'INTEL' };
  }

  for (const entry of BUILTIN_LEAGUE_FORMAT) {
    if (entry.keys.some((k) => clean.includes(k))) {
      return { ...entry.meta, source: 'BUILTIN_FALLBACK', season: null };
    }
  }

  return { total_teams: 20, relegation_slots: 3, continental_slots: 6, format_type: 'single', source: 'BUILTIN_FALLBACK', season: null };
}

/**
 * 计算联赛积分榜战意生命周期因子 (Motivation & Urgency Index, MUI)
 * 方案 6：中小联赛与杯赛动态战意百分位 (Dynamic Percentile MUI)
 * 名额制升级：争冠/洲际区与降级区改用当季赛制名额（continental_slots / relegation_slots），替代固定 0.20/0.80 百分位
 */
export function calculateMotivationAndUrgencyIndex(
  match: CanonicalMatch,
  intel?: PrematchIntel | null
): { home_mui: number; away_mui: number; home_context: string; away_context: string } {
  // 杯赛、友谊赛、欧冠淘汰赛场景下，强制关闭联赛积分榜战意映射，避免跨赛事战意误植
  const leagueName = String(match.league_name || match.reference?.leisu_league_name || '').toLowerCase();
  const isCupOrTournament =
    leagueName.includes('杯') ||
    leagueName.includes('cup') ||
    leagueName.includes('trophy') ||
    leagueName.includes('fa ') ||
    leagueName.includes('copa') ||
    leagueName.includes('coppa') ||
    leagueName.includes('coupe') ||
    leagueName.includes('pokal') ||
    leagueName.includes('友谊') ||
    leagueName.includes('friendly') ||
    leagueName.includes('锦标赛') ||
    leagueName.includes('淘汰赛') ||
    leagueName.includes('资格赛') ||
    leagueName.includes('附加赛') ||
    leagueName.includes('playoff') ||
    leagueName.includes('play-off');

  if (isCupOrTournament) {
    return {
      home_mui: 1.0,
      away_mui: 1.0,
      home_context: 'CUP_OR_TOURNAMENT_NEUTRAL',
      away_context: 'CUP_OR_TOURNAMENT_NEUTRAL'
    };
  }

  const standings = match.reference?.league_standings;
  if (!standings || !standings.home_team || !standings.away_team) {
    return {
      home_mui: 1.0,
      away_mui: 1.0,
      home_context: 'NO_STANDINGS_DATA',
      away_context: 'NO_STANDINGS_DATA'
    };
  }

  // 解析当季赛制元数据（优先联网预取的 intel，降级内置专家 fallback），替代写死队数表 + 固定百分位
  const formatMeta = resolveCompetitionFormat(leagueName, intel);

  const homeRank = standings.home_team.overall?.position;
  const awayRank = standings.away_team.overall?.position;
  const maxObservedRank = Math.max(homeRank || 0, awayRank || 0);

  // 观察到的最大排名作为队数下限（防止元数据队数低于实际排名导致负名额）
  const totalTeams = Math.max(formatMeta.total_teams, maxObservedRank > 0 ? maxObservedRank : 20);
  const totalRounds = Math.max(10, (totalTeams - 1) * 2);

  const evaluateTeam = (teamStanding: ParsedTeamStanding): { mui: number; context: string } => {
    const overall = teamStanding.overall;
    if (!overall) {
      return { mui: 1.0, context: 'OVERALL_MISSING' };
    }

    const rank = overall.position;
    const played = overall.matches_played;

    // 严禁假数据：若积分榜未提供具体名次或场次，绝不脑补假排名，忠实返回中性 1.0
    if (rank === null || rank === undefined || played === null || played === undefined) {
      return { mui: 1.0, context: 'METRICS_INCOMPLETE' };
    }

    // 名额制战意判定（替代固定百分位）：争冠/洲际区 = 前 continental_slots 名；降级区 = 后 relegation_slots 名
    const seasonProgress = played / totalRounds;

    const isLateSeason = seasonProgress >= 0.75;
    const isEarlySeason = seasonProgress <= 0.20 || played <= 5;

    const isTitleRace = rank <= formatMeta.continental_slots;
    const isRelegation = rank > (totalTeams - formatMeta.relegation_slots);

    let baseMui = 1.0;
    let context = 'MID_TABLE_NORMAL';

    if (isTitleRace) {
      baseMui = isLateSeason ? 1.25 : 1.10;
      context = isLateSeason ? 'TITLE_OR_UCL_RACE_LATE_SEASON' : 'TITLE_OR_UCL_RACE';
    } else if (isRelegation) {
      baseMui = isLateSeason ? 1.35 : 1.15;
      context = isLateSeason ? 'RELEGATION_BATTLE_LATE_SEASON' : 'RELEGATION_BATTLE';
    } else if (rank / totalTeams > 0.35 && rank / totalTeams < 0.70) {
      baseMui = isLateSeason ? 0.75 : 0.95;
      context = isLateSeason ? 'MID_TABLE_SECURE_LATE_SEASON' : 'MID_TABLE_SECURE';
    }

    if (isEarlySeason) {
      baseMui = 1.0 + (baseMui - 1.0) * 0.3;
      context += '_EARLY_SEASON_DAMPENED';
    }

    return { mui: Number(baseMui.toFixed(3)), context };
  };

  const homeEval = evaluateTeam(standings.home_team);
  const awayEval = evaluateTeam(standings.away_team);

  return {
    home_mui: homeEval.mui,
    away_mui: awayEval.mui,
    home_context: homeEval.context,
    away_context: awayEval.context
  };
}

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
 * 计算联赛积分榜战意生命周期因子 (Motivation & Urgency Index, MUI)
 * 方案 6：中小联赛与杯赛动态战意百分位 (Dynamic Percentile MUI)
 */
export function calculateMotivationAndUrgencyIndex(
  match: CanonicalMatch
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

  // 估算或提取联赛总参赛队伍数与总轮次，支持中小联赛 (如10队/12队/16队/20队)
  const homeRank = standings.home_team.overall?.position;
  const awayRank = standings.away_team.overall?.position;
  const maxObservedRank = Math.max(homeRank || 0, awayRank || 0);

  const LEAGUE_TOTAL_TEAMS_MAP: Record<string, number> = {
    '英超': 20, 'premier league': 20,
    '西甲': 20, 'la liga': 20,
    '意甲': 20, 'serie a': 20,
    '法甲': 18, 'ligue 1': 18,
    '德甲': 18, 'bundesliga': 18,
    '荷甲': 18, 'eredivisie': 18,
    '葡超': 18, 'primeira liga': 18,
    '日职': 20, 'j1 league': 20, '日职联': 20,
    '日职乙': 20, 'j2 league': 20,
    '韩k联': 12, 'k league 1': 12, '韩k1': 12,
    '中超': 16, 'csl': 16,
    '瑞士超': 12,
    '奥甲': 12, 'austrian bundesliga': 12,
    '苏超': 12, 'scottish premiership': 12,
    '比甲': 16, 'belgian pro league': 16,
    '俄超': 16,
    '土超': 19,
    '美职联': 29, 'mls': 29,
    '巴甲': 20, 'brasileiro': 20,
    '澳超': 12, 'a-league': 12
  };

  let totalTeams = 20;
  for (const [key, cnt] of Object.entries(LEAGUE_TOTAL_TEAMS_MAP)) {
    if (leagueName.includes(key)) {
      totalTeams = cnt;
      break;
    }
  }
  totalTeams = Math.max(totalTeams, maxObservedRank > 0 ? maxObservedRank : 20);
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

    // 方案 6：动态百分位计算 (争冠/欧战区 <= 0.20, 降级危险区 >= 0.80, 赛季末收官 >= 0.75)
    const rankPercentile = rank / totalTeams;
    const seasonProgress = played / totalRounds;

    const isLateSeason = seasonProgress >= 0.75;
    const isEarlySeason = seasonProgress <= 0.20 || played <= 5;

    let baseMui = 1.0;
    let context = 'MID_TABLE_NORMAL';

    if (rankPercentile <= 0.20) {
      baseMui = isLateSeason ? 1.25 : 1.10;
      context = isLateSeason ? 'TITLE_OR_UCL_RACE_LATE_SEASON' : 'TITLE_OR_UCL_RACE';
    } else if (rankPercentile >= 0.80) {
      baseMui = isLateSeason ? 1.35 : 1.15;
      context = isLateSeason ? 'RELEGATION_BATTLE_LATE_SEASON' : 'RELEGATION_BATTLE';
    } else if (rankPercentile > 0.35 && rankPercentile < 0.70) {
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

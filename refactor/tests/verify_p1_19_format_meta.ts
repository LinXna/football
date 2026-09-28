/**
 * @file verify_p1_19_format_meta.ts
 * @description P1-19 验证：MUI 战意判定从「写死队数表 + 固定百分位」升级为「当季赛制元数据 + 名额制」
 *
 * 覆盖：
 * 1. resolveCompetitionFormat：内置专家 fallback / intel 覆盖 / 未知联赛通用默认 / split 赛制识别
 * 2. calculateMotivationAndUrgencyIndex：争冠/洲际区（前 continental_slots 名）、降级区（后 relegation_slots 名）、
 *    中游区、intel 覆盖后名额变化对 MUI 分区的影响
 */

import { resolveCompetitionFormat, calculateMotivationAndUrgencyIndex, PrematchIntel } from '../03_quant_engine/motivationUrgency.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

function makeStanding(teamId: number, position: number | null, played: number) {
  return {
    team_id: teamId,
    team_name: `Team${teamId}`,
    competition_id: null,
    competition_name: '',
    season: '2026-27',
    overall: {
      title: '',
      position,
      matches_played: played,
      won: 0, draw: 0, loss: 0,
      goals_scored: 0, goals_conceded: 0, goal_difference: 0, points: 0, win_rate: null
    },
    home: null,
    away: null
  };
}

function makeMatch(leagueName: string, homeRank: number | null, awayRank: number | null, played = 20) {
  return {
    league_name: leagueName,
    home_team_name: 'Home',
    away_team_name: 'Away',
    reference: {
      leisu_league_name: leagueName,
      league_standings: {
        has_data: true,
        home_team: makeStanding(1, homeRank, played),
        away_team: makeStanding(2, awayRank, played)
      }
    }
  } as any;
}

async function run() {
  console.log('=== [P1-19] 赛制元数据化 + MUI 名额制验证 ===\n');

  // --- 1. resolveCompetitionFormat：内置专家 fallback ---
  const epl = resolveCompetitionFormat('英超');
  assert(epl.total_teams === 20, `英超 total_teams 应为 20，实为 ${epl.total_teams}`);
  assert(epl.relegation_slots === 3, `英超 relegation_slots 应为 3，实为 ${epl.relegation_slots}`);
  assert(epl.continental_slots === 6, `英超 continental_slots 应为 6，实为 ${epl.continental_slots}`);
  assert(epl.source === 'BUILTIN_FALLBACK', '英超应命中内置 fallback');

  const swiss = resolveCompetitionFormat('瑞士超级联赛');
  assert(swiss.total_teams === 12 && swiss.format_type === 'split', `瑞士超应识别为 12 队 split 赛制，实为 ${swiss.total_teams}/${swiss.format_type}`);

  const kLeague = resolveCompetitionFormat('K联赛');
  assert(kLeague.total_teams === 12 && kLeague.format_type === 'split', '韩K联应识别为 split 赛制');

  const mls = resolveCompetitionFormat('美国职业大联盟');
  assert(mls.total_teams === 29 && mls.relegation_slots === 0, '美职联应无降级（relegation_slots=0）');

  const unknown = resolveCompetitionFormat('火星超级联赛');
  assert(unknown.total_teams === 20 && unknown.source === 'BUILTIN_FALLBACK', '未知联赛应命中通用默认 20 队');

  // --- 2. resolveCompetitionFormat：intel 覆盖 ---
  const intel: PrematchIntel = {
    competition_format: { total_teams: 18, relegation_slots: 2, continental_slots: 4, format_type: 'single', season: '2026-27' }
  };
  const withIntel = resolveCompetitionFormat('英超', intel);
  assert(withIntel.total_teams === 18, `intel 应覆盖 total_teams 为 18，实为 ${withIntel.total_teams}`);
  assert(withIntel.relegation_slots === 2, 'intel 应覆盖 relegation_slots 为 2');
  assert(withIntel.continental_slots === 4, 'intel 应覆盖 continental_slots 为 4');
  assert(withIntel.source === 'INTEL', 'intel 覆盖后 source 应为 INTEL');

  // --- 3. MUI 名额制（无 intel，用内置 fallback）---
  // 英超 fallback：total_teams=20, relegation_slots=3, continental_slots=6
  // 争冠/洲际区 = rank <= 6；降级区 = rank > 17
  const titleRace = calculateMotivationAndUrgencyIndex(makeMatch('英超', 1, 10));
  assert(titleRace.home_context === 'TITLE_OR_UCL_RACE', `rank1 应为争冠区，实为 ${titleRace.home_context}`);
  assert(titleRace.home_mui === 1.10, `rank1 非赛季末 MUI 应为 1.10，实为 ${titleRace.home_mui}`);

  const continentalEdge = calculateMotivationAndUrgencyIndex(makeMatch('英超', 6, 10));
  assert(continentalEdge.home_context === 'TITLE_OR_UCL_RACE', `rank6（=continental_slots）应为争冠区边界，实为 ${continentalEdge.home_context}`);

  const justOutsideTitle = calculateMotivationAndUrgencyIndex(makeMatch('英超', 7, 10));
  assert(justOutsideTitle.home_context !== 'TITLE_OR_UCL_RACE', `rank7（>continental_slots）不应再是争冠区，实为 ${justOutsideTitle.home_context}`);

  const relegation = calculateMotivationAndUrgencyIndex(makeMatch('英超', 18, 10));
  assert(relegation.home_context === 'RELEGATION_BATTLE', `rank18 应为降级区，实为 ${relegation.home_context}`);
  assert(relegation.home_mui === 1.15, `rank18 非赛季末 MUI 应为 1.15，实为 ${relegation.home_mui}`);

  const relegationEdge = calculateMotivationAndUrgencyIndex(makeMatch('英超', 17, 10));
  assert(relegationEdge.home_context !== 'RELEGATION_BATTLE', `rank17（=total-relegation_slots）不应是降级区，实为 ${relegationEdge.home_context}`);

  const midTable = calculateMotivationAndUrgencyIndex(makeMatch('英超', 10, 11));
  assert(midTable.home_context === 'MID_TABLE_SECURE', `rank10 应为中游，实为 ${midTable.home_context}`);
  assert(midTable.away_context === 'MID_TABLE_SECURE', 'rank11 也应为中游');

  // --- 4. intel 覆盖后名额变化影响 MUI 分区 ---
  // intel：total_teams=18, relegation_slots=2, continental_slots=4
  // 争冠区 = rank<=4；降级区 = rank>16
  const intelTitleEdge = calculateMotivationAndUrgencyIndex(makeMatch('英超', 5, 10), intel);
  assert(intelTitleEdge.home_context !== 'TITLE_OR_UCL_RACE',
    `intel(continental_slots=4) 下 rank5 不应是争冠区，实为 ${intelTitleEdge.home_context}`);

  const intelRelegation = calculateMotivationAndUrgencyIndex(makeMatch('英超', 17, 10), intel);
  assert(intelRelegation.home_context === 'RELEGATION_BATTLE',
    `intel(relegation_slots=2, total=18) 下 rank17 应为降级区，实为 ${intelRelegation.home_context}`);

  // --- 5. 数据缺失降级不崩溃 ---
  const noStandings = calculateMotivationAndUrgencyIndex({ league_name: '英超', reference: { league_standings: null } } as any);
  assert(noStandings.home_context === 'NO_STANDINGS_DATA' && noStandings.home_mui === 1.0, '无积分榜应中性降级');

  const cupMatch = calculateMotivationAndUrgencyIndex(makeMatch('英格兰足总杯', 1, 2));
  assert(cupMatch.home_context === 'CUP_OR_TOURNAMENT_NEUTRAL' && cupMatch.home_mui === 1.0, '杯赛应中性');

  console.log('✅ [P1-19] 赛制元数据化 + MUI 名额制全部断言通过');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

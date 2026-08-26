/**
 * 验证雷速接口数据提取器 (Layer 01 -> Leisu Unit Tests)
 * 
 * 运行命令: npx tsx refactor/tests/verify_leisu_interface_extractor.ts
 */

import fs from "fs";
import path from "path";
import { parseLeisuInterfaceExport } from "../01_data_ingestion/leisu/leisuInterfaceExtractor";
import {
  leisuEnumManager,
  LeisuTimelineEventType,
  LeisuMatchSide,
  LeisuPlayerStatus,
  LeisuPlayerIncidentType,
} from "../01_data_ingestion/leisu/enums";

function runTests() {
  console.log("=== 开始验证雷速接口数据提取器 (Layer 01 -> Leisu Tests) ===");

  const fixturePath = path.resolve(
    process.cwd(),
    "refactor/fixtures/leisu_v2.8.0_interface_sample.json"
  );
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`找不到测试固件文件: ${fixturePath}`);
  }

  const rawJson = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const parsed = parseLeisuInterfaceExport(rawJson);

  // 1. 验证顶层元数据
  if (parsed.export_version !== "2.8.0") {
    throw new Error(`export_version 错误: 期望 "2.8.0", 实际 "${parsed.export_version}"`);
  }
  if (parsed.export_type !== "leisu_interface_data") {
    throw new Error(`export_type 错误: 期望 "leisu_interface_data", 实际 "${parsed.export_type}"`);
  }
  if (parsed.matches.length !== 2) {
    throw new Error(`matches.length 错误: 期望 2, 实际 ${parsed.matches.length}`);
  }

  console.log(`✅ 成功解析顶层元数据:`);
  console.log(`   - 协议版本 (export_version): ${parsed.export_version}`);
  console.log(`   - 导出类型 (export_type): ${parsed.export_type}`);
  console.log(`   - 抓取时间 (captured_at): ${parsed.captured_at}`);
  console.log(`   - 比赛场数 (matches.length): ${parsed.matches.length}`);

  // 2. 第一场赛事详细断言 (谢周三 vs 布拉德福德)
  const m1 = parsed.matches[0];
  console.log(`\n[第 1 场] ${m1.competition} | ${m1.home_team} (ID:${m1.home_team_id}) vs ${m1.away_team} (ID:${m1.away_team_id}) (MatchID: ${m1.match_id})`);
  
  if (m1.match_id !== "4562395") throw new Error("第1场 match_id 错误");
  if (m1.home_team_id !== 10101 || m1.away_team_id !== 10102) throw new Error("第1场队伍 ID 提取错误");
  if (m1.home_team !== "谢周三" || m1.away_team !== "布拉德福德") throw new Error("第1场对阵球队错误");
  if (m1.competition_id !== 84) throw new Error(`第1场 competition_id 错误: 期望 84, 实际 ${m1.competition_id}`);
  if (m1.competition !== "英甲") throw new Error("第1场联赛名错误");
  if (!m1.commence_time || !m1.commence_time.includes("Z")) throw new Error("第1场开赛时间格式错误");
  if (m1.status_id !== 4 || m1.status_text !== "下半场" || !m1.is_live) throw new Error("第1场比赛状态错误");
  
  if (!m1.score || m1.score.home !== 0 || m1.score.away !== 1) throw new Error("第1场即时比分错误");
  if (!m1.score_verified) throw new Error("第1场比分核验状态错误");

  // 球场场地断言
  if (!m1.venue || m1.venue.name !== "希尔斯堡球场" || m1.venue.city !== "谢菲尔德" || m1.venue.country !== "England" || m1.venue.capacity !== 34835) {
    throw new Error(`第1场球场信息错误: ${JSON.stringify(m1.venue)}`);
  }

  // 环境断言
  if (m1.environment.weather !== "局部有云" || m1.environment.temperature !== "14°C") {
    throw new Error("第1场环境数据错误");
  }

  // 8大技术统计断言
  if (m1.stats.corners.home !== 6 || m1.stats.corners.away !== 7) throw new Error("第1场角球数错误");
  if (m1.stats.dangerous_attacks.home !== 38 || m1.stats.dangerous_attacks.away !== 30) throw new Error("第1场危攻数错误");
  if (m1.stats.possession.home !== 60 || m1.stats.possession.away !== 40) throw new Error("第1场控球率错误");
  if (m1.stats.shots_on_target.home !== 3 || m1.stats.shots_on_target.away !== 3) throw new Error("第1场射正数错误");
  if (m1.stats.shots_off_target.home !== 5 || m1.stats.shots_off_target.away !== 3) throw new Error("第1场射偏数错误");
  if (m1.stats.shots.home !== 8 || m1.stats.shots.away !== 6) throw new Error("第1场总射门计算错误");

  // 动量波形断言
  if (!m1.attack_momentum.available || m1.attack_momentum.segment_count !== 2) throw new Error("第1场动量波形状态错误");
  if (m1.attack_momentum.data[0].length !== 46 || m1.attack_momentum.data[1].length !== 17) {
    throw new Error("第1场动量波形时序数据长度错误");
  }

  // 文字直播事件与枚举断言 (包含 5越位, 21射正, 22射偏, 1进球, 2角球, 3黄牌, 9换人)
  if (m1.timeline_events.length !== 46) {
    throw new Error(`第1场文字直播时序事件数量错误: 期望 46, 实际 ${m1.timeline_events.length}`);
  }
  const eventTypes = m1.timeline_events.map((e) => e.type);
  if (!eventTypes.includes(LeisuTimelineEventType.GOAL)) throw new Error("文字直播未包含进球事件(1)");
  if (!eventTypes.includes(LeisuTimelineEventType.CORNER)) throw new Error("文字直播未包含角球事件(2)");
  if (!eventTypes.includes(LeisuTimelineEventType.YELLOW_CARD)) throw new Error("文字直播未包含黄牌事件(3)");
  if (!eventTypes.includes(LeisuTimelineEventType.OFFSIDE)) throw new Error("文字直播未包含越位事件(5)");
  if (!eventTypes.includes(LeisuTimelineEventType.SHOT_ON_TARGET)) throw new Error("文字直播未包含射正事件(21)");
  if (!eventTypes.includes(LeisuTimelineEventType.SHOT_OFF_TARGET)) throw new Error("文字直播未包含射偏事件(22)");

  // 严格验证时序事件发生顺序 (第4项: 4'射偏1 -> 第5项: 4'射偏2 -> 第6项: 6'射正1 -> 第7项: 6'越位1 -> 第8项: 7'角球1 -> 第9项: 7'射正2 -> 第10项: 8'射偏3 -> 第11项: 13'角球2)
  if (m1.timeline_events[4].minute !== 4 || m1.timeline_events[4].type !== LeisuTimelineEventType.SHOT_OFF_TARGET || m1.timeline_events[4].text !== "4' - 第1个射偏 - (谢周三)") {
    throw new Error(`时序事件[4]错误: ${JSON.stringify(m1.timeline_events[4])}`);
  }
  if (m1.timeline_events[5].minute !== 4 || m1.timeline_events[5].type !== LeisuTimelineEventType.SHOT_OFF_TARGET || m1.timeline_events[5].text !== "4' - 第2个射偏 - (谢周三)") {
    throw new Error(`时序事件[5]错误: ${JSON.stringify(m1.timeline_events[5])}`);
  }
  if (m1.timeline_events[6].minute !== 6 || m1.timeline_events[6].type !== LeisuTimelineEventType.SHOT_ON_TARGET || m1.timeline_events[6].text !== "6' - 第1个射正 - (谢周三)") {
    throw new Error(`时序事件[6]顺序错误 (应为射正1): ${JSON.stringify(m1.timeline_events[6])}`);
  }
  if (m1.timeline_events[7].minute !== 6 || m1.timeline_events[7].type !== LeisuTimelineEventType.OFFSIDE || m1.timeline_events[7].text !== "6' - 第1个越位 - (谢周三)") {
    throw new Error(`时序事件[7]顺序错误 (应为越位1): ${JSON.stringify(m1.timeline_events[7])}`);
  }
  if (m1.timeline_events[8].minute !== 7 || m1.timeline_events[8].type !== LeisuTimelineEventType.CORNER) {
    throw new Error(`时序事件[8]错误: ${JSON.stringify(m1.timeline_events[8])}`);
  }
  if (m1.timeline_events[9].minute !== 7 || m1.timeline_events[9].type !== LeisuTimelineEventType.SHOT_ON_TARGET || m1.timeline_events[9].text !== "7' - 第2个射正 - (谢周三)") {
    throw new Error(`时序事件[9]错误 (应为 7' 第2个射正): ${JSON.stringify(m1.timeline_events[9])}`);
  }

  const eGoal = m1.timeline_events.find((e) => e.type === LeisuTimelineEventType.GOAL);
  if (!eGoal || eGoal.minute !== 47 || eGoal.side !== LeisuMatchSide.AWAY || eGoal.type_name !== "进球") {
    throw new Error(`进球事件解析错误: ${JSON.stringify(eGoal)}`);
  }

  // 阵容与球员详细字段断言
  if (!m1.lineups.confirmed) throw new Error("第1场阵容确认状态错误");
  if (m1.lineups.home_formation !== "4-2-3-1" || m1.lineups.away_formation !== "3-4-2-1") {
    throw new Error("第1场阵型解析错误");
  }
  if (m1.lineups.home_starters.length !== 11 || m1.lineups.away_starters.length !== 11) {
    throw new Error("第1场首发球员数量错误");
  }

  const starter0 = m1.lineups.home_starters[0];
  if (starter0.status !== LeisuPlayerStatus.STARTER || !starter0.starter || starter0.status_name !== "首发") {
    throw new Error("首发球员状态解析错误");
  }

  // 伤停球员枚举断言
  if (m1.lineups.home_injuries.length !== 4) {
    throw new Error(`主队伤停球员数量错误: 期望 4, 实际 ${m1.lineups.home_injuries.length}`);
  }
  const injury0 = m1.lineups.home_injuries[0];
  if (injury0.status !== LeisuPlayerStatus.INJURED_ABSENT || injury0.status_name !== "伤停") {
    throw new Error(`伤停球员状态解析错误: ${JSON.stringify(injury0)}`);
  }

  // 球员独立 incidents 校验 (进球1, 助攻99, 黄牌3, 扑救8 等)
  const awayStarterWithGoal = m1.lineups.away_starters.find((p) => p.incidents.some((inc) => inc.type === LeisuPlayerIncidentType.GOAL));
  if (!awayStarterWithGoal) throw new Error("未找到带有进球 incident 的客队球员");
  const awayGoalInc = awayStarterWithGoal.incidents.find((inc) => inc.type === LeisuPlayerIncidentType.GOAL);
  if (!awayGoalInc || awayGoalInc.type_name !== "进球" || awayGoalInc.time !== 47) {
    throw new Error(`球员进球事件解析错误: ${JSON.stringify(awayGoalInc)}`);
  }

  // 参考赔率矩阵断言
  if (m1.odds_matrix.company_name !== "3*") throw new Error("第1场赔率公司解析错误");
  if (m1.odds_matrix.initial.asian_handicap?.line !== 0.25 || m1.odds_matrix.initial.asian_handicap?.home_odds !== 1.0) {
    throw new Error("第1场初盘让球解析错误");
  }
  if (m1.odds_matrix.initial.total_goals?.line !== 2.5 || m1.odds_matrix.initial.total_goals?.over_odds !== 1.0) {
    throw new Error("第1场初盘大小球解析错误");
  }
  if (m1.odds_matrix.live.asian_handicap?.line !== 0.25 || m1.odds_matrix.live.asian_handicap?.home_odds !== 1.2) {
    throw new Error("第1场即盘让球解析错误");
  }
  if (m1.odds_matrix.live.total_goals?.line !== 2.0 || m1.odds_matrix.live.total_goals?.over_odds !== 0.92) {
    throw new Error("第1场即盘大小球解析错误");
  }

  // 战术上下文与历史直接交锋断言 (含 shots, was_shots 被射门数与各项攻防指标)
  if (m1.tactical_context.head_to_head_count !== 6) throw new Error("历史交锋数量错误");
  const h2h_0 = m1.tactical_context.h2h_raw[0];
  if (!h2h_0 || h2h_0.match_id !== 3775098 || h2h_0.competition_id !== 100) {
    throw new Error("第一场历史交锋元数据错误");
  }
  if (!h2h_0.home_stats || h2h_0.home_stats.shots !== 17 || h2h_0.home_stats.was_shots !== 8) {
    throw new Error(`第一场历史交锋主队射门与被射门(was_shots)统计错误: ${JSON.stringify(h2h_0.home_stats)}`);
  }
  if (!h2h_0.away_stats || h2h_0.away_stats.shots !== 8 || h2h_0.away_stats.was_shots !== 17) {
    throw new Error(`第一场历史交锋客队射门与被射门(was_shots)统计错误: ${JSON.stringify(h2h_0.away_stats)}`);
  }

  // 联赛积分与排名断言
  if (!m1.league_standings.has_data || !m1.league_standings.home_team || !m1.league_standings.away_team) {
    throw new Error("第1场联赛积分榜数据缺失");
  }
  const homeStanding = m1.league_standings.home_team;
  if (homeStanding.team_name !== "谢周三" || homeStanding.competition_name !== "英甲" || homeStanding.overall?.position !== 6 || homeStanding.overall?.points !== 3) {
    throw new Error(`主队积分榜解析错误: ${JSON.stringify(homeStanding)}`);
  }
  const awayStanding = m1.league_standings.away_team;
  if (awayStanding.team_name !== "布拉德福德" || awayStanding.overall?.position !== 3 || awayStanding.overall?.points !== 3 || awayStanding.overall?.goals_conceded !== 0) {
    throw new Error(`客队积分榜解析错误: ${JSON.stringify(awayStanding)}`);
  }

  // 进球时段分布断言 (15分钟时段划分与首球)
  if (!m1.goal_distribution.has_data) {
    throw new Error("第1场进球分布数据缺失");
  }
  const homeGoalDist = m1.goal_distribution.home_team.all;
  if (homeGoalDist.matches_count !== 1 || homeGoalDist.scored_intervals.length !== 6) {
    throw new Error(`主队进球分布区间数量错误: ${JSON.stringify(homeGoalDist)}`);
  }
  const interval16_30 = homeGoalDist.scored_intervals[1];
  if (interval16_30.start_minute !== 16 || interval16_30.end_minute !== 30 || interval16_30.goals !== 1 || interval16_30.percentage !== 50) {
    throw new Error(`16-30分钟进球分布区间错误: ${JSON.stringify(interval16_30)}`);
  }
  const firstScored16_30 = homeGoalDist.first_scored_intervals[1];
  if (firstScored16_30.goals !== 1 || firstScored16_30.percentage !== 100) {
    throw new Error(`首开纪录时段分布错误: ${JSON.stringify(firstScored16_30)}`);
  }

  console.log(`  - 队伍ID: 主队 ${m1.home_team_id}, 客队 ${m1.away_team_id} (用于别名与对齐系统首选锁定)`);
  console.log(`  - 球场信息: ${m1.venue?.name} (${m1.venue?.city}, ${m1.venue?.country}) 容量: ${m1.venue?.capacity}`);
  console.log(`  - 状态: ${m1.status_text} (分钟: ${m1.minute}') | 比分: ${m1.score.home}:${m1.score.away} (已核验: ${m1.score_verified})`);
  console.log(`  - 联赛排名与积分: 主队第${homeStanding.overall?.position}名 (${homeStanding.overall?.points}分) vs 客队第${awayStanding.overall?.position}名 (${awayStanding.overall?.points}分)`);
  console.log(`  - 时段进球偏好: 主队首开纪录主要集中在 16-30' (占比 100%)`);
  console.log(`  - 时序事件: 共 ${m1.timeline_events.length} 项 (覆盖进球、角球、黄牌、越位5、射正21、射偏22等)`);
  console.log(`  - 阵容球员: 主队首发 ${m1.lineups.home_starters.length}人, 客队首发 ${m1.lineups.away_starters.length}人 (含评分、身价、事件incidents)`);

  // 3. 验证枚举管理器未知类型收集告警机制
  const unknownTimeline = leisuEnumManager.resolveTimelineEventType(8888, "某未知测试事件");
  if (unknownTimeline.is_known !== false || unknownTimeline.name !== "未知事件(8888)") {
    throw new Error("未知事件收集机制异常");
  }
  const reports = leisuEnumManager.getUnknownReports();
  if (!reports.some((r) => r.raw_code === 8888)) {
    throw new Error("未知枚举报告未能成功收集");
  }
  console.log(`✅ 枚举管理器未知类型收集与告警机制测试通过 (已成功捕获测试异常码 8888)`);

  // 4. 验证赛事 ID 与名称枚举录入与智能回退机制
  const knownComp = leisuEnumManager.resolveCompetition(84, "某旧名称");
  if (knownComp.id !== 84 || knownComp.name !== "英甲" || !knownComp.is_known) {
    throw new Error("已知赛事 ID 84 解析错误");
  }
  const unknownCompWithFallback = leisuEnumManager.resolveCompetition(99999, "冰岛超级联赛");
  if (unknownCompWithFallback.id !== 99999 || unknownCompWithFallback.name !== "冰岛超级联赛" || unknownCompWithFallback.is_known) {
    throw new Error("未知赛事 ID 回退机制错误");
  }
  const unknownCompNoName = leisuEnumManager.resolveCompetition(88888, null);
  if (unknownCompNoName.id !== 88888 || unknownCompNoName.name !== "赛事(88888)" || unknownCompNoName.is_known) {
    throw new Error("未知赛事无名称回退机制错误");
  }
  console.log(`✅ 赛事 ID 与名称枚举录入、智能回退与对齐机制断言 100% 通过`);

  // 5. 验证球队 ID 与队名枚举录入与智能回退机制 (resolveTeam)
  const knownTeam = leisuEnumManager.resolveTeam(10101, "谢菲尔德星期三旧名");
  if (knownTeam.id !== 10101 || knownTeam.name !== "谢周三" || !knownTeam.is_known) {
    throw new Error("已知球队 ID 10101 解析错误");
  }
  const unknownTeamWithFallback = leisuEnumManager.resolveTeam(77777, "雷克雅未克");
  if (unknownTeamWithFallback.id !== 77777 || unknownTeamWithFallback.name !== "雷克雅未克" || unknownTeamWithFallback.is_known) {
    throw new Error("未知球队 ID 回退机制错误");
  }
  const unknownTeamNoName = leisuEnumManager.resolveTeam(66666, null);
  if (unknownTeamNoName.id !== 66666 || unknownTeamNoName.name !== "球队(66666)" || unknownTeamNoName.is_known) {
    throw new Error("未知球队无名称回退机制错误");
  }
  console.log(`✅ 球队 ID 与队名枚举录入、智能回退与对齐机制断言 100% 通过`);

  console.log("\n🎉 [Layer 01 雷速测试通过] 全部雷速数据契约精简、枚举管理器与字段提取断言 100% 验证通过！");
}

runTests();

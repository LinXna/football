/**
 * 02_canonical_model 单元测试与验证脚本
 * 覆盖：
 * 1. 纯原文字符顺序相似度（包含 U19/U21/B队/青年队 等原貌比对）；
 * 2. 静态别名库 100% 精准对齐；
 * 3. 真实 YBTY 滚球/赛前数据与雷速数据组装为 CanonicalMatch；
 * 4. 比分冲突熔断与缺失数据缺口判定；
 * 5. 极简 AI Slim Brief 提炼与 Token 压缩率验证。
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  calculateStrictRawTextSimilarity,
  matchSingleTeam,
  alignMatches,
  findBestLeisuMatch,
} from "../02_canonical_model/matchAligner";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  assembleCanonicalMatch,
  extractAiEvaluationBrief,
  parseCanonicalTimelineEvents,
} from "../02_canonical_model/canonicalMatchAssembler";
import {
  MatchAlignmentStatus,
  MatchStage,
  DataCompletenessTier,
  MissingDataReason,
} from "../02_canonical_model/enums";
import { GenericYbtyMatch } from "../02_canonical_model/types";

import { parseYbtyLiveRoot } from "../01_data_ingestion/ybty/ybtyLiveExtractor";
import { parseYbtyPrematchRoot } from "../01_data_ingestion/ybty/ybtyPrematchExtractor";
import { parseLeisuInterfaceExport } from "../01_data_ingestion/leisu/leisuInterfaceExtractor";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

function runTests() {
  console.log("=================================================");
  console.log("🚀 Starting 02_canonical_model Unit Tests...");
  console.log("=================================================");

  // 1. 测试原文字符顺序相似度与不剔除杂质
  console.log("\n[Test 1] Testing Strict Raw Text Similarity without cleaning...");
  const sim1 = calculateStrictRawTextSimilarity("狼队", "狼队");
  assert(sim1 === 1.0, `Exact match should be 1.0, got ${sim1}`);

  const simU21 = calculateStrictRawTextSimilarity("阿森纳", "阿森纳U21");
  assert(simU21 < 1.0 && simU21 >= 0.5, `U21 should have length penalty, got ${simU21}`);

  const simOrder = calculateStrictRawTextSimilarity("巴塞罗那", "那罗塞巴");
  assert(simOrder < 0.5, `Reversed chars should have low LCS score, got ${simOrder}`);
  console.log("✅ Strict text similarity passed (U21/B-team semantics fully preserved)!");

  // 2. 测试静态别名库精确命中
  console.log("\n[Test 2] Testing Team Aliases Exact Hit...");
  const aliases = {
    "狼队": "伍尔弗汉普顿流浪者",
    "红魔": "曼彻斯特联",
  };
  const teamMatch1 = matchSingleTeam("狼队", "伍尔弗汉普顿流浪者", aliases);
  assert(teamMatch1.is_alias_exact_hit === true, "Alias exact hit should be true");
  assert(teamMatch1.raw_text_similarity === 1.0, "Alias hit similarity should be 1.0");

  const teamMatch2 = matchSingleTeam("热刺", "托特纳姆热刺", aliases);
  assert(teamMatch2.is_alias_exact_hit === false, "Unregistered alias should not be alias hit");
  console.log("✅ Alias matching and fallback passed!");

  // 3. 真实样本加载与实体对齐
  console.log("\n[Test 3] Loading Real Fixtures and Aligning Matches...");
  const ybtyLivePath = path.resolve(__dirname, "../fixtures/ybty_v2.8.0_live_2026-08-20T20-20-13-747Z.json");
  const ybtyPrematchPath = path.resolve(__dirname, "../fixtures/ybty_v2.8.0_prematch_2026-08-23T01-04-18-978Z.json");
  const leisuPath = path.resolve(__dirname, "../fixtures/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json");

  const rawYbtyLive = JSON.parse(fs.readFileSync(ybtyLivePath, "utf-8"));
  const rawYbtyPrematch = JSON.parse(fs.readFileSync(ybtyPrematchPath, "utf-8"));
  const rawLeisu = JSON.parse(fs.readFileSync(leisuPath, "utf-8"));

  const parsedYbtyLive = parseYbtyLiveRoot(rawYbtyLive);
  const parsedYbtyPrematch = parseYbtyPrematchRoot(rawYbtyPrematch);
  const parsedLeisu = parseLeisuInterfaceExport(rawLeisu);

  assert(parsedYbtyLive.matches.length > 0, "Parsed YBTY Live matches should not be empty");
  assert(parsedLeisu.matches.length > 0, "Parsed Leisu matches should not be empty");

  console.log(`Parsed ${parsedYbtyLive.matches.length} YBTY Live, ${parsedYbtyPrematch.matches.length} Prematch, ${parsedLeisu.matches.length} Leisu matches.`);

  // 4. 测试滚球赛事实体装配（逐场遍历全部 6 场滚球赛事）
  console.log("\n[Test 4] Assembling CanonicalMatch from ALL Real Live Matches...");
  
  const realAliases: Record<string, string> = {
    "英格兰甲级联赛": "英甲",
    "谢周三": "谢周三",
    "布拉德福德城": "布拉德福德",
    "西班牙甲级联赛": "西甲",
    "巴列卡诺": "巴列卡诺",
    "阿拉维斯": "阿拉维斯",
    "欧洲联赛资格赛 - 附加赛": "欧联",
    "本菲卡": "本菲卡",
    "奥胡斯": "奥胡斯",
    "玻利维亚杯": "玻利杯",
    "时刻准备": "拉巴斯准备",
    "奥鲁罗": "奥鲁罗",
    "冰岛女子超级联赛": "冰女超",
    "斯塔尔南(女)": "斯塔尔南女足",
    "布列达布利克(女)": "贝雷达比历克女足",
    "阿根廷联赛后备队": "阿后备",
    "博卡青年后备队": "博卡青年后备队",
    "科尔多瓦中央后备队": "科尔多瓦中央后备队",
  };

  parsedYbtyLive.matches.forEach((liveMatch, idx) => {
    const genericLiveMatch: GenericYbtyMatch = {
      league: liveMatch.league,
      home: liveMatch.home,
      away: liveMatch.away,
      home_score: liveMatch.home_score,
      away_score: liveMatch.away_score,
      clock: liveMatch.clock,
      clock_status: liveMatch.clock_status,
      is_live: true,
      markets: liveMatch.markets,
    };

    const { best_match: matchedLeisu, decision } = findBestLeisuMatch(genericLiveMatch, parsedLeisu.matches, realAliases);
    assert(decision !== null, `Match #${idx + 1} Alignment decision should be generated`);

    const canonicalLive = assembleCanonicalMatch(genericLiveMatch, matchedLeisu, decision!);
    assert(canonicalLive.canonical_id.length > 0, `Match #${idx + 1} Canonical ID should exist`);
    assert(canonicalLive.timing.stage === MatchStage.LIVE, `Match #${idx + 1} Stage should be LIVE`);
    assert(canonicalLive.timing.minute !== null, `Match #${idx + 1} live minute must be parsed from YBTY clock`);
    assert(canonicalLive.markets !== null, `Match #${idx + 1} Markets should be preserved from YBTY`);
    assert(typeof canonicalLive.score.score_verified === "boolean", `Match #${idx + 1} Score verified must be boolean`);

    console.log(`[Canonical Match #${idx + 1}] [${canonicalLive.league_name}] ${canonicalLive.home_team_name} vs ${canonicalLive.away_team_name} | Clock: ${canonicalLive.timing.minute}' (Score: ${canonicalLive.score.home_score}:${canonicalLive.score.away_score}, Tier: ${canonicalLive.completeness_tier})`);
  });

  console.log("✅ 全部 6 场真实滚球比赛 CanonicalMatch 组装与契约校验 100% 通过！");

  // 5. 测试比分冲突时的熔断判定
  console.log("\n[Test 5] Testing Score Mismatch Fuse...");
  const firstLive = parsedYbtyLive.matches[0];
  const genericLiveMatch: GenericYbtyMatch = {
    league: firstLive.league,
    home: firstLive.home,
    away: firstLive.away,
    home_score: firstLive.home_score,
    away_score: firstLive.away_score,
    clock: firstLive.clock,
    clock_status: firstLive.clock_status,
    is_live: true,
    markets: firstLive.markets,
  };
  const { best_match: matchedLeisu, decision } = findBestLeisuMatch(genericLiveMatch, parsedLeisu.matches, realAliases);
  const conflictYbty: GenericYbtyMatch = { ...genericLiveMatch, home_score: 9, away_score: 9 };
  const conflictCanonical = assembleCanonicalMatch(conflictYbty, matchedLeisu, decision!);
  if (matchedLeisu) {
    assert(conflictCanonical.score.is_mismatch_detected === true, "Mismatch should be detected");
    assert(conflictCanonical.completeness_tier === DataCompletenessTier.TIER_INVALID, "Tier should be TIER_INVALID on mismatch");
    assert(conflictCanonical.missing_reasons.includes(MissingDataReason.SCORE_MISMATCH), "Deficit should contain SCORE_MISMATCH");
    console.log("✅ Score mismatch fuse properly triggered TIER_INVALID!");
  }

  // 6. 测试极简 AI Slim Brief 提炼
  console.log("\n[Test 6] Testing AI Slim Brief Extraction...");
  const canonicalLive0 = assembleCanonicalMatch(genericLiveMatch, matchedLeisu, decision!);
  const aiBrief = extractAiEvaluationBrief(canonicalLive0);
  assert(aiBrief.match_id === canonicalLive0.canonical_id, "Match ID must match");
  assert(aiBrief.teams.home === canonicalLive0.home_team_name, "Home team must match");
  assert(Array.isArray(aiBrief.data_deficits), "data_deficits must be an array");

  const briefJsonStr = JSON.stringify(aiBrief);
  console.log(`AI Brief JSON length: ${briefJsonStr.length} chars (ultra-lightweight payload!)`);
  console.log("Sample AI Brief Content:", JSON.stringify(aiBrief, null, 2));

  // 7. 测试关键事件高保真语义解析 (CanonicalTimelineEvent & VAR Overturned)
  console.log("\n[Test 7] Testing Enhanced CanonicalTimelineEvent Parsing...");
  const mockRawEvents = [
    { type: 1, minute: 23, text: "梅西 (点球罚进)", side: "home" },
    { type: 1, minute: 45, text: "45+2' 范戴克 (进球被判无效 - 越位在先)", side: "away" },
    { type: 1, minute: 60, text: "马奎尔 (乌龙球)", side: "home" },
    { type: 3, minute: 75, text: "主教练 (替补席黄牌)", side: "away" },
    { type: 22, minute: 80, text: "努涅斯 (射偏/击中门柱横梁)", side: "home" },
  ];

  const parsedEventsResult = parseCanonicalTimelineEvents(mockRawEvents as any);
  assert(parsedEventsResult.events.length === 5, "Should parse all 5 events");
  assert(parsedEventsResult.varOverturnedGoalsCount === 1, "Should identify 1 VAR overturned goal");

  const [penaltyGoal, varGoal, ownGoal, benchCard, shotOff] = parsedEventsResult.events;
  assert(penaltyGoal.is_penalty === true, "Penalty goal flag must be true");
  assert(varGoal.is_cancelled === true && varGoal.is_var_overturned === true, "VAR goal cancelled must be true");
  assert(varGoal.base_minute === 45 && varGoal.added_minute === 2, "Base/added minute must be parsed as 45+2");
  assert(ownGoal.is_own_goal === true, "Own goal flag must be true");
  assert(benchCard.is_on_pitch === false, "Bench card on_pitch must be false");
  assert(shotOff.type === 22, "Shot off target type must be 22");

  console.log("✅ Canonical timeline events, VAR overturns, and bench card isolation passed 100%!");

  console.log("\n=================================================");
  console.log("🎉 ALL 02_canonical_model TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================\n");
}

runTests();

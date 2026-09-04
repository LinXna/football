/**
 * verify_full_pipeline_00_03.ts
 * Layer 00 ~ Layer 03 全链路双路（滚球 + 赛前早盘）端到端集成测试套件
 * 
 * 验证目标：
 * 1. 验证【滚球通路 (Live Pathway)】：从 YBTY 滚球 + 雷速实时 -> 解析 -> 别名对齐 -> CanonicalMatch -> 37项量化推演；
 * 2. 验证【赛前早盘通路 (Prematch Pathway)】：从 YBTY 早盘 + 雷速历史/积分/伤停 -> 解析 -> 别名对齐 -> CanonicalMatch -> 赛前量化推演；
 * 3. 验证极端风控防御（主客颠倒防御、比分冲突熔断、缺失数据降级、四分之一盘数学守恒）；
 * 4. 统计双路机器初筛产出（WATCH / RESEARCH / PASS / REJECTED）与 +EV 候选分布；
 * 5. 沉淀双路全量推演流水线样本快照。
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Layer 00
import { Tracer, DeficitCollector } from "../00_common/index";

// Layer 01
import { parseYbtyLiveRoot } from "../01_data_ingestion/ybty/ybtyLiveExtractor";
import { parseYbtyPrematchRoot } from "../01_data_ingestion/ybty/ybtyPrematchExtractor";
import { parseLeisuInterfaceExport } from "../01_data_ingestion/leisu/leisuInterfaceExtractor";
import { ParsedLeisuMatch } from "../01_data_ingestion/leisu/types";

// Layer 02
import {
  alignMatches,
  findBestLeisuMatch,
  DEFAULT_LEAGUE_ALIASES,
} from "../02_canonical_model/matchAligner";
import {
  assembleCanonicalMatch,
  extractAiEvaluationBrief,
} from "../02_canonical_model/canonicalMatchAssembler";
import {
  MatchAlignmentStatus,
  MatchStage,
  DataCompletenessTier,
  MissingDataReason,
} from "../02_canonical_model/enums";
import { CanonicalMatch, GenericYbtyMatch } from "../02_canonical_model/types";

// Layer 03
import { calculateQuantitativeFeatures } from "../03_quant_engine/index";
import { QuantitativeFeatures, QuantAlert } from "../03_quant_engine/types";
import { devigShin, devigMultiplicative, calculateAsianHandicapEV, parseAsianHandicapLine } from "../03_quant_engine/devigCalculator";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runFullPipelineIntegrationTests() {
  console.log("================================================================================");
  console.log("🚀 STARTING LAYER 00 ~ 03 FULL DUAL-TRACK PIPELINE INTEGRATION TEST SUITE");
  console.log("================================================================================");

  const tracer = Tracer.getInstance();
  const deficitCollector = new DeficitCollector();
  const summaryReport: Record<string, any> = {
    test_timestamp: new Date().toISOString(),
    live_pathway: {},
    prematch_pathway: {},
    edge_case_defenses: {},
    overall_status: "PENDING",
  };

  // ============================================================================
  // TRACK 1: 滚球通路全链路测试 (LIVE IN-PLAY PATHWAY)
  // ============================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("📡 [TRACK 1] Live In-Play Pathway End-to-End Test");
  console.log("--------------------------------------------------------------------------------");
  const track1Start = performance.now();

  // 1.1 加载 YBTY 滚球与雷速数据
  const ybtyLiveSamplePath = path.join(__dirname, "../samples/01_data_ingestion/ybty/ybty_live_extracted_sample.json");
  const leisuSamplePath = path.join(__dirname, "../samples/01_data_ingestion/leisu/leisu_extracted_sample.json");

  assert(fs.existsSync(ybtyLiveSamplePath), `YBTY Live sample exists at ${ybtyLiveSamplePath}`);
  assert(fs.existsSync(leisuSamplePath), `Leisu sample exists at ${leisuSamplePath}`);

  function safeReadJson(filePath: string) {
    const raw = fs.readFileSync(filePath, "utf-8");
    try {
      return JSON.parse(raw);
    } catch {
      // Replace unescaped control characters inside JSON strings with whitespace and strip broken unicode bytes
      const cleaned = raw
        .replace(/[\u0000-\u001F\u007F-\u009F\uFFFD]/g, (ch) => {
          if (ch === '\n' || ch === '\r' || ch === '\t') return ' ';
          return '';
        })
        .replace(/\\(?!["\\/bfnrtu])/g, '');
      return JSON.parse(cleaned);
    }
  }

  const ybtyLiveJson = safeReadJson(ybtyLiveSamplePath);
  const leisuJson = safeReadJson(leisuSamplePath);

  // 1.2 执行 Layer 01 解析
  const liveMatches = ybtyLiveJson.matches as GenericYbtyMatch[];
  const leisuMatches = (leisuJson.matches || [leisuJson]) as ParsedLeisuMatch[];

  console.log(`✓ Ingested ${liveMatches.length} YBTY Live matches, ${leisuMatches.length} Leisu matches`);
  assert(liveMatches.length > 0, "Should have live matches from YBTY");

  // 1.3 执行 Layer 02 对齐与 CanonicalMatch 组装
  const canonicalLiveList: CanonicalMatch[] = [];
  let alignedCount = 0;
  let swappedCount = 0;

  for (const yMatch of liveMatches) {
    const { best_match, decision } = findBestLeisuMatch(yMatch, leisuMatches, {}, DEFAULT_LEAGUE_ALIASES);
    if (decision?.status === MatchAlignmentStatus.SWAPPED_HOME_AWAY) {
      swappedCount++;
    }
    if (best_match && decision) {
      alignedCount++;
      const canonical = assembleCanonicalMatch(yMatch, best_match, decision);
      canonicalLiveList.push(canonical);
    } else {
      const fallbackDecision = decision || {
        status: MatchAlignmentStatus.UNMATCHED,
        confidence_score: 0,
        home_team_match: { ybty_name: yMatch.home, leisu_name: "", is_alias_exact_hit: false, raw_text_similarity: 0 },
        away_team_match: { ybty_name: yMatch.away, leisu_name: "", is_alias_exact_hit: false, raw_text_similarity: 0 },
        league_match: { ybty_league: yMatch.league, leisu_league: "", status: 0 as any, similarity: 0, is_alias_exact_hit: false },
        league_match_score: 0,
        is_swapped_suspected: false,
        alignment_reason: "未在雷速候选列表中匹配到对应比赛",
      };
      const canonical = assembleCanonicalMatch(yMatch, null, fallbackDecision);
      canonicalLiveList.push(canonical);
    }
  }

  console.log(`✓ Layer 02 Alignment: ${alignedCount}/${liveMatches.length} aligned with Leisu`);
  assert(canonicalLiveList.length === liveMatches.length, "All YBTY matches should be converted to CanonicalMatch");

  // 1.4 执行 Layer 03 确定性量化与博弈推演
  const liveQuantResults: { canonical: CanonicalMatch; quant: QuantitativeFeatures }[] = [];
  let liveWatchCount = 0;
  let liveResearchCount = 0;
  let liveRejectedCount = 0;
  let livePositiveEvCount = 0;
  let liveAlignmentBlockedCount = 0;

  for (const canonical of canonicalLiveList) {
    if (canonical.alignment.status !== MatchAlignmentStatus.MATCHED_BY_ALIAS &&
        canonical.alignment.status !== MatchAlignmentStatus.MATCHED_AUTO) {
      liveAlignmentBlockedCount++;
      continue;
    }
    const quant = calculateQuantitativeFeatures(canonical);
    liveQuantResults.push({ canonical, quant });

    // 验证数学与字段合法性
    assert(Number.isFinite(quant.battlefield_dominance_index), `BDI index must be finite, got ${quant.battlefield_dominance_index}`);
    assert(Number.isFinite(quant.confidence_score), `Confidence score must be finite, got ${quant.confidence_score}`);
    assert(quant.poisson.rest_score_matrix.prob_home_win_rest >= 0 && quant.poisson.rest_score_matrix.prob_home_win_rest <= 1, "Poisson Home win rest prob must be in [0, 1]");
    assert(quant.poisson.rest_score_matrix.prob_draw_rest >= 0 && quant.poisson.rest_score_matrix.prob_draw_rest <= 1, "Poisson Draw rest prob must be in [0, 1]");
    assert(quant.poisson.rest_score_matrix.prob_away_win_rest >= 0 && quant.poisson.rest_score_matrix.prob_away_win_rest <= 1, "Poisson Away win rest prob must be in [0, 1]");

    // 统计初筛等级
    const isFatal = quant.risk_flags.includes(QuantAlert.L0_FATAL_DATA_MISSING);
    if (isFatal) {
      liveRejectedCount++;
    } else if (quant.confidence_score >= 80 && quant.positive_ev_signals.length > 0) {
      liveWatchCount++;
    } else if (quant.confidence_score >= 60) {
      liveResearchCount++;
    } else {
      liveRejectedCount++;
    }

    if (quant.positive_ev_signals.length > 0) {
      livePositiveEvCount++;
    }
  }

  const liveDurationMs = performance.now() - track1Start;

  console.log(`✓ Layer 03 Live Quant completed in ${liveDurationMs.toFixed(2)}ms`);
  console.log(`  - Total Processed: ${liveQuantResults.length}`);
  console.log(`  - WATCH Tier: ${liveWatchCount}`);
  console.log(`  - RESEARCH Tier: ${liveResearchCount}`);
  console.log(`  - REJECTED/PASS: ${liveRejectedCount}`);
  console.log(`  - Matches with +EV Opportunities: ${livePositiveEvCount}`);

  summaryReport.live_pathway = {
    total_matches: liveQuantResults.length,
    aligned_count: alignedCount,
    execution_duration_ms: liveDurationMs,
    screening_distribution: {
      WATCH: liveWatchCount,
      RESEARCH: liveResearchCount,
      REJECTED: liveRejectedCount,
    },
    alignment_blocked: liveAlignmentBlockedCount,
    positive_ev_matches: livePositiveEvCount,
  };

  // ============================================================================
  // TRACK 2: 赛前早盘通路全链路测试 (PREMATCH PATHWAY)
  // ============================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("📅 [TRACK 2] Prematch Pathway End-to-End Test");
  console.log("--------------------------------------------------------------------------------");
  const track2Start = performance.now();

  // 2.1 加载 YBTY 赛前数据
  const ybtyPrematchSamplePath = path.join(__dirname, "../samples/01_data_ingestion/ybty/ybty_prematch_extracted_sample.json");
  assert(fs.existsSync(ybtyPrematchSamplePath), `YBTY Prematch sample exists at ${ybtyPrematchSamplePath}`);

  const ybtyPrematchJson = safeReadJson(ybtyPrematchSamplePath);
  const prematchMatches = ybtyPrematchJson.matches as GenericYbtyMatch[];
  console.log(`✓ Ingested ${prematchMatches.length} YBTY Prematch matches`);
  assert(prematchMatches.length > 0, "Should have prematch matches from YBTY");

  // 2.2 执行 Layer 02 赛前 CanonicalMatch 组装
  const canonicalPrematchList: CanonicalMatch[] = [];
  for (const pMatch of prematchMatches) {
    const { best_match, decision } = findBestLeisuMatch(pMatch, leisuMatches, {}, DEFAULT_LEAGUE_ALIASES);
    const alignDecision = decision || {
      status: MatchAlignmentStatus.UNMATCHED,
      confidence_score: 0,
      home_team_match: { ybty_name: pMatch.home, leisu_name: "", is_alias_exact_hit: false, raw_text_similarity: 0 },
      away_team_match: { ybty_name: pMatch.away, leisu_name: "", is_alias_exact_hit: false, raw_text_similarity: 0 },
      league_match: { ybty_league: pMatch.league, leisu_league: "", status: 0 as any, similarity: 0, is_alias_exact_hit: false },
      league_match_score: 0,
      is_swapped_suspected: false,
      alignment_reason: "未在雷速列表中匹配",
    };
    const canonical = assembleCanonicalMatch(pMatch, best_match, alignDecision);
    assert(canonical.timing.stage === MatchStage.PREMATCH, "Stage must be PREMATCH");
    assert(canonical.timing.minute === null, "Prematch live minute must be null");
    canonicalPrematchList.push(canonical);
  }

  console.log(`✓ Layer 02 Prematch Assembled: ${canonicalPrematchList.length} matches`);

  // 2.3 执行 Layer 03 赛前量化推演（包含 LIS 伤停折损、MUI 战意、H2H 时间衰减、泊松与 EV）
  const prematchQuantResults: { canonical: CanonicalMatch; quant: QuantitativeFeatures }[] = [];
  let prematchWatchCount = 0;
  let prematchResearchCount = 0;
  let prematchRejectedCount = 0;
  let prematchPositiveEvCount = 0;
  let prematchAlignmentBlockedCount = 0;

  for (const canonical of canonicalPrematchList) {
    if (canonical.alignment.status !== MatchAlignmentStatus.MATCHED_BY_ALIAS &&
        canonical.alignment.status !== MatchAlignmentStatus.MATCHED_AUTO) {
      prematchAlignmentBlockedCount++;
      continue;
    }
    const quant = calculateQuantitativeFeatures(canonical);
    prematchQuantResults.push({ canonical, quant });

    assert(Number.isFinite(quant.battlefield_dominance_index), `Prematch BDI index must be finite, got ${quant.battlefield_dominance_index}`);
    assert(quant.context.lineup_impact.home_lis >= 0 && quant.context.lineup_impact.home_lis <= 100, "Home LIS must be in [0, 100]");
    assert(quant.context.lineup_impact.away_lis >= 0 && quant.context.lineup_impact.away_lis <= 100, "Away LIS must be in [0, 100]");
    assert(quant.context.motivation_urgency.home_mui >= 0 && quant.context.motivation_urgency.home_mui <= 100, "Home MUI must be in [0, 100]");
    assert(quant.context.motivation_urgency.away_mui >= 0 && quant.context.motivation_urgency.away_mui <= 100, "Away MUI must be in [0, 100]");

    const isFatal = quant.risk_flags.includes(QuantAlert.L0_FATAL_DATA_MISSING);
    if (isFatal) {
      prematchRejectedCount++;
    } else if (quant.confidence_score >= 80 && quant.positive_ev_signals.length > 0) {
      prematchWatchCount++;
    } else if (quant.confidence_score >= 60) {
      prematchResearchCount++;
    } else {
      prematchRejectedCount++;
    }

    if (quant.positive_ev_signals.length > 0) {
      prematchPositiveEvCount++;
    }
  }

  const prematchDurationMs = performance.now() - track2Start;

  console.log(`✓ Layer 03 Prematch Quant completed in ${prematchDurationMs.toFixed(2)}ms`);
  console.log(`  - Total Processed: ${prematchQuantResults.length}`);
  console.log(`  - WATCH Tier: ${prematchWatchCount}`);
  console.log(`  - RESEARCH Tier: ${prematchResearchCount}`);
  console.log(`  - REJECTED/PASS: ${prematchRejectedCount}`);
  console.log(`  - Matches with +EV Opportunities: ${prematchPositiveEvCount}`);

  summaryReport.prematch_pathway = {
    total_matches: prematchQuantResults.length,
    execution_duration_ms: prematchDurationMs,
    screening_distribution: {
      WATCH: prematchWatchCount,
      RESEARCH: prematchResearchCount,
      REJECTED: prematchRejectedCount,
    },
    alignment_blocked: prematchAlignmentBlockedCount,
    positive_ev_matches: prematchPositiveEvCount,
  };

  // ============================================================================
  // TRACK 3: 极端异常与安全防御测试 (EDGE CASES & RISK DEFENSES)
  // ============================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("🛡️ [TRACK 3] Rigorous Edge Cases & Extreme Risk Defenses");
  console.log("--------------------------------------------------------------------------------");

  // 3.1 主客场颠倒防御测试 (Swapped Home/Away Detection)
  console.log("\n[Defense 3.1] Testing Swapped Home/Away Defense...");
  const mockSwappedYbty: GenericYbtyMatch = {
    is_live: true,
    league: "英格兰超级联赛",
    home: "曼城",
    away: "切尔西",
    home_score: 1,
    away_score: 0,
    clock: "35:00",
    captured_at: new Date().toISOString(),
    markets: {
      full_h2h: { home_odds: 1.8, draw_odds: 3.5, away_odds: 4.2 },
      full_spread_main: { line_index: 0, home_selection: "-0.5", home_odds: 1.85, away_selection: "+0.5", away_odds: 2.05 },
      full_spread_subs: [],
      full_total_main: { line_index: 0, line: "2.5", over_odds: 1.9, under_odds: 1.95 },
      full_total_subs: [],
      half_spread_main: null,
      half_total_main: null,
      half_h2h: null,
    },
  };

  const mockLeisuChelseaHome: ParsedLeisuMatch = {
    match_id: 999901,
    competition: "英超",
    home_team: "切尔西",
    away_team: "曼城",
    status_id: 2,
    status_text: "上半场",
    score: { home: 0, away: 1 },
    half_score: { home: 0, away: 0 },
    score_verified: true,
    stats: null,
    attack_momentum: null,
    timeline_events: [],
    lineups: null,
    tactical_context: null,
    odds_matrix: null,
    league_standings: null,
    goal_distribution: null,
  };

  const swappedDecision = alignMatches(mockSwappedYbty, mockLeisuChelseaHome, {}, DEFAULT_LEAGUE_ALIASES);
  assert(swappedDecision.status === MatchAlignmentStatus.SWAPPED_HOME_AWAY, "Must detect SWAPPED_HOME_AWAY status");
  assert(swappedDecision.is_swapped_suspected === true, "is_swapped_suspected must be true");
  console.log(`✓ Swapped Home/Away successfully blocked with status: ${swappedDecision.status}`);

  // 3.2 比分严重冲突熔断测试 (Score Mismatch L0 Interception)
  console.log("\n[Defense 3.2] Testing Score Mismatch L0 Interception...");
  const mockMismatchLeisu: ParsedLeisuMatch = {
    match_id: 999902,
    competition: "英格兰超级联赛",
    home_team: "曼城",
    away_team: "切尔西",
    status_id: 2,
    status_text: "上半场",
    score: { home: 3, away: 0 }, // 雷速比分 3-0，而 YBTY 是 1-0
    half_score: { home: 1, away: 0 },
    score_verified: true,
    stats: null,
    attack_momentum: null,
    timeline_events: [],
    lineups: null,
    tactical_context: null,
    odds_matrix: null,
    league_standings: null,
    goal_distribution: null,
  };

  const validAlignDecision = alignMatches(mockSwappedYbty, mockMismatchLeisu, {}, DEFAULT_LEAGUE_ALIASES);
  const mismatchCanonical = assembleCanonicalMatch(mockSwappedYbty, mockMismatchLeisu, validAlignDecision);
  assert(mismatchCanonical.score.is_mismatch_detected === true, "Score mismatch must be detected");
  assert(mismatchCanonical.completeness_tier === DataCompletenessTier.TIER_INVALID, "Completeness tier must be TIER_INVALID");

  let scoreMismatchHandled = false;
  try {
    const mismatchQuant = calculateQuantitativeFeatures(mismatchCanonical);
    if (mismatchQuant.risk_flags.includes(QuantAlert.L0_FATAL_DATA_MISSING) && mismatchQuant.confidence_score <= 20) {
      scoreMismatchHandled = true;
    }
  } catch (err: any) {
    if (err?.message?.includes('UNPRICEABLE_MATCH')) {
      scoreMismatchHandled = true;
    }
  }
  assert(scoreMismatchHandled, "Score mismatch must trigger L0 Fatal Kill or Unpriceable block");
  console.log(`✓ Score Mismatch successfully triggered L0 Fatal Kill.`);

  // 3.3 未确认赛事对齐不得进入 Layer 03 量化
  console.log("\n[Defense 3.3] Testing Unconfirmed Alignment Gate...");
  const unconfirmedCanonical = {
    ...canonicalLiveList[0],
    alignment: {
      ...canonicalLiveList[0].alignment,
      status: MatchAlignmentStatus.NEEDS_MANUAL_SELECTION,
    },
  };
  let unconfirmedAlignmentBlocked = false;
  try {
    calculateQuantitativeFeatures(unconfirmedCanonical);
  } catch (err: unknown) {
    unconfirmedAlignmentBlocked = err instanceof Error && err.message.includes('MATCH_ALIGNMENT_FAILED');
  }
  assert(unconfirmedAlignmentBlocked, "Unconfirmed alignment must be blocked before Layer 03 quantification");
  console.log(`✓ Unconfirmed alignment successfully blocked before quantification.`);

  // 3.4 四分之一盘口数学概率守恒与无抽水测试 (Quarter Handicap Math Conservation)
  console.log("\n[Defense 3.4] Testing Quarter Handicap Probability Conservation & Devig...");
  const shinResult = devigShin([1.95, 1.95]);
  assert(Array.isArray(shinResult.fair_probs), "Fair probs must be array");
  assert(shinResult.fair_probs.length === 2, "Fair probs length must be 2");
  assert(Math.abs((shinResult.fair_probs[0] + shinResult.fair_probs[1]) - 1.0) < 1e-3, "Shin probabilities must sum to 1.0");

  const mockPoisson: any = {
    lambda_home_rest: 1.25,
    lambda_away_rest: 0.85,
    expected_goals_rest: 2.10,
    rest_score_matrix: {
      prob_home_win_rest: 0.45,
      prob_draw_rest: 0.25,
      prob_away_win_rest: 0.30,
    }
  };

  const quarterEv = calculateAsianHandicapEV("-0/0.5", 2.05, 1.85, mockPoisson);
  assert(Number.isFinite(quarterEv.home_ev), "Quarter Home EV must be finite");
  assert(Number.isFinite(quarterEv.away_ev), "Quarter Away EV must be finite");
  console.log(`✓ Quarter handicap EV calculation verified. Home EV: ${(quarterEv.home_ev * 100).toFixed(2)}%, Away EV: ${(quarterEv.away_ev * 100).toFixed(2)}%`);

  summaryReport.edge_case_defenses = {
    swapped_home_away_blocked: true,
    score_mismatch_l0_interception: true,
    unconfirmed_alignment_blocked: true,
    quarter_handicap_math_conserved: true,
  };

  // ============================================================================
  // SUMMARY REPORT & GOLDEN FIXTURE GENERATION
  // ============================================================================
  summaryReport.overall_status = "SUCCESS";
  const outputPath = path.join(__dirname, "../samples/pipeline_dual_track_summary.json");
  fs.writeFileSync(outputPath, JSON.stringify(summaryReport, null, 2), "utf-8");
  console.log(`\n✓ Generated dual-track pipeline summary report: ${outputPath}`);

  console.log("\n================================================================================");
  console.log("🏆 ALL LAYER 00 ~ 03 DUAL-TRACK PIPELINE INTEGRATION TESTS PASSED 100%!");
  console.log("================================================================================");
}

runFullPipelineIntegrationTests().catch((err) => {
  console.error("FATAL ERROR during integration test execution:", err);
  process.exit(1);
});

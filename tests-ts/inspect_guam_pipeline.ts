import * as fs from "fs";
import * as path from "path";

// Layer 00
import { Tracer, DeficitCollector } from "../refactor/00_common/index";

// Layer 01
import { parseYbtyLiveRoot } from "../refactor/01_data_ingestion/ybty/ybtyLiveExtractor";
import { parseLeisuInterfaceExport } from "../refactor/01_data_ingestion/leisu/leisuInterfaceExtractor";

// Layer 02
import { alignMatches, findBestLeisuMatch } from "../refactor/02_canonical_model/matchAligner";
import { assembleCanonicalMatch, extractAiEvaluationBrief } from "../refactor/02_canonical_model/canonicalMatchAssembler";
import { MatchStage, DataCompletenessTier } from "../refactor/02_canonical_model/enums";

// Layer 03
import { calculateQuantitativeFeatures } from "../refactor/03_quant_engine/index";

// Layer 04
import { generateRefactoredPrompt } from "../refactor/04_ai_evaluator/promptExporter";
import { verifyStatutoryAlignment } from "../refactor/04_ai_evaluator/alignmentGuard";
import { AiEvaluationResult, RecommendationGrade } from "../refactor/04_ai_evaluator/types";

export async function runGuamPipelineInspection() {
  console.log("================================================================================");
  console.log("🔍 INSPECTING GUAM U20 VS NORTHERN MARIANA ISLANDS U20 PIPELINE (00 -> 04)");
  console.log("================================================================================");

  const tracer = Tracer.getInstance();
  const deficitCollector = new DeficitCollector();

  // 1. LAYER 01: RAW DATA INGESTION
  console.log("\n--- [STEP 1: LAYER 01 INGESTION] ---");
  const ybtyRaw = JSON.parse(fs.readFileSync(path.resolve("refactor/fixtures/active_live_ybty.json"), "utf8"));
  const leisuRaw = JSON.parse(fs.readFileSync(path.resolve("refactor/fixtures/active_live_leisu.json"), "utf8"));

  const parsedYbty = parseYbtyLiveRoot(ybtyRaw);
  const parsedLeisu = parseLeisuInterfaceExport(leisuRaw);

  console.log("YBTY Match Count:", parsedYbty.matches.length);
  const ybtyMatch = parsedYbty.matches[0];
  console.log("YBTY Match Info:", {
    league: ybtyMatch.league,
    home: ybtyMatch.home,
    away: ybtyMatch.away,
    home_score: ybtyMatch.home_score,
    away_score: ybtyMatch.away_score,
    clock: ybtyMatch.clock,
    clock_status: ybtyMatch.clock_status,
  });
  console.log("YBTY Main Markets:", {
    spread_main: ybtyMatch.markets.full_spread_main,
    total_main: ybtyMatch.markets.full_total_main,
    h2h: ybtyMatch.markets.full_h2h,
  });

  console.log("Leisu Match Count:", parsedLeisu.matches.length);
  const leisuMatch = parsedLeisu.matches[0];
  console.log("Leisu Match Info:", {
    match_id: leisuMatch.match_id,
    league: leisuMatch.competition,
    home: leisuMatch.home_team,
    away: leisuMatch.away_team,
    score: leisuMatch.score,
    status_id: leisuMatch.status_id,
    has_stats: !!leisuMatch.stats,
    has_timeline: !!leisuMatch.timeline_events,
    has_momentum: !!leisuMatch.attack_momentum,
    has_lineup: !!leisuMatch.lineups,
  });

  // 2. LAYER 02: CANONICAL ALIGNMENT & BRIEF
  console.log("\n--- [STEP 2: LAYER 02 CANONICAL MODEL] ---");
  const { best_match, decision } = findBestLeisuMatch(ybtyMatch, parsedLeisu.matches);
  if (!decision) {
    throw new Error("No decision returned from findBestLeisuMatch");
  }
  console.log("Decision Alignment Status:", decision.status);
  console.log("Decision Match Details:", {
    ybty_home: ybtyMatch.home,
    ybty_away: ybtyMatch.away,
    leisu_home: best_match?.home_team,
    leisu_away: best_match?.away_team,
    confidence_score: decision.confidence_score,
    alignment_reason: decision.alignment_reason,
  });

  const canonical = assembleCanonicalMatch(ybtyMatch, best_match, decision);
  console.log("Canonical Match Info:", {
    canonical_id: canonical.canonical_id,
    match_slug: canonical.match_slug,
    stage: canonical.timing.stage,
    completeness: canonical.completeness_tier,
    is_live: ybtyMatch.is_live,
    live_minute: canonical.timing.minute,
    clock_status: canonical.timing.ybty_display_clock,
    is_half_time: canonical.timing.is_half_time,
    score: `${canonical.score.home_score}-${canonical.score.away_score}`,
    score_verified: canonical.score.score_verified,
    score_source: canonical.score.score_source,
    is_mismatch_detected: canonical.score.is_mismatch_detected,
    missing_reasons: canonical.missing_reasons,
  });

  const brief = extractAiEvaluationBrief(canonical);
  console.log("Brief Summary:", {
    match_id: brief.match_id,
    league: brief.league,
    kickoff_time: brief.kickoff_time,
    status_summary: brief.status_summary,
    score_verification: brief.score_verification,
    core_markets: brief.core_markets,
    condensed_features: brief.condensed_features,
    data_deficits: brief.data_deficits,
  });

  // 3. LAYER 03: QUANT ENGINE
  console.log("\n--- [STEP 3: LAYER 03 QUANT ENGINE] ---");
  const quant = calculateQuantitativeFeatures(canonical);
  console.log("Quant Summary:", {
    bdi: quant.bdi,
    momentum_summary: quant.momentum_summary,
    poisson: {
      remaining_minutes: quant.poisson.remaining_minutes,
      decay_factor: quant.poisson.decay_factor,
      expected_remaining_home_goals: quant.poisson.expected_remaining_home_goals,
      expected_remaining_away_goals: quant.poisson.expected_remaining_away_goals,
      remaining_home_win_prob: quant.poisson.remaining_home_win_prob,
      remaining_draw_prob: quant.poisson.remaining_draw_prob,
      remaining_away_win_prob: quant.poisson.remaining_away_win_prob,
    },
    alerts: quant.alerts,
    positive_ev_count: quant.positive_ev_signals?.length || 0,
    machine_candidates: quant.machineCandidateSignals?.length || 0,
  });

  if (quant.devig.spread_main) {
    console.log("Spread Main Devig:", quant.devig.spread_main);
  }
  if (quant.devig.total_main) {
    console.log("Total Main Devig:", quant.devig.total_main);
  }

  // 4. LAYER 04: AI EVALUATOR & PROMPT EXPORT
  console.log("\n--- [STEP 4: LAYER 04 PROMPT EXPORT] ---");

  const promptResult = generateRefactoredPrompt([canonical], 'live_eval');
  console.log("Prompt Match Count:", promptResult.matchCount);
  console.log("Prompt Length:", promptResult.finalPrompt.length);

  console.log("\n--- [PROMPT TEXT SAMPLE (FIRST 2000 CHARS)] ---");
  console.log(promptResult.finalPrompt.slice(0, 2000));
  console.log("...\n--- [PROMPT TEXT SAMPLE (LAST 1000 CHARS)] ---");
  console.log(promptResult.finalPrompt.slice(-1000));

  fs.writeFileSync(
    path.resolve("refactor/samples/guam_pipeline_inspection_result.json"),
    JSON.stringify(
      {
        canonical,
        brief,
        quant,
        promptResult,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("\n✅ Full inspection results saved to refactor/samples/guam_pipeline_inspection_result.json");

  return {
    parsedYbty,
    parsedLeisu,
    canonical,
    brief,
    quant,
    promptResult,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGuamPipelineInspection().catch((err) => {
    console.error("Inspection error:", err);
    process.exit(1);
  });
}

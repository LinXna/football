/**
 * 生成 02_canonical_model 标准样本文件
 * 输出至 refactor/samples/02_canonical_model/canonical_match_sample.json
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { findBestLeisuMatch } from "../02_canonical_model/matchAligner";
import { assembleCanonicalMatch, extractAiEvaluationBrief } from "../02_canonical_model/canonicalMatchAssembler";
import { GenericYbtyMatch } from "../02_canonical_model/types";
import { parseYbtyLiveRoot } from "../01_data_ingestion/ybty/ybtyLiveExtractor";
import { parseLeisuInterfaceExport } from "../01_data_ingestion/leisu/leisuInterfaceExtractor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateSample() {
  const ybtyLivePath = path.resolve(__dirname, "../fixtures/ybty_v2.8.0_live_2026-08-23T21-55-11-819Z.json");
  const leisuPath = path.resolve(__dirname, "../fixtures/leisu_v2.8.0_interface_sample.json");

  const rawYbtyLive = JSON.parse(fs.readFileSync(ybtyLivePath, "utf-8"));
  const rawLeisu = JSON.parse(fs.readFileSync(leisuPath, "utf-8"));

  const parsedYbtyLive = parseYbtyLiveRoot(rawYbtyLive);
  const parsedLeisu = parseLeisuInterfaceExport(rawLeisu);

  const aliases: Record<string, string> = {
    "沙佩科人SC": "沙佩科恩斯",
    "圣保罗SP": "圣保罗",
  };

  const sampleMatch = parsedYbtyLive.matches[0];
  const genericMatch: GenericYbtyMatch = {
    league: sampleMatch.league,
    home: sampleMatch.home,
    away: sampleMatch.away,
    home_score: sampleMatch.home_score,
    away_score: sampleMatch.away_score,
    clock: sampleMatch.clock,
    clock_status: sampleMatch.clock_status,
    is_live: true,
    markets: sampleMatch.markets,
  };

  const matchedLeisu = parsedLeisu.matches[0]; // 关联雷速全特征样本
  const { decision } = findBestLeisuMatch(genericMatch, [matchedLeisu], aliases);

  const canonical = assembleCanonicalMatch(genericMatch, matchedLeisu, decision!);
  const aiBrief = extractAiEvaluationBrief(canonical);

  const sampleOutput = {
    sample_version: "1.0.0",
    generated_at: new Date().toISOString(),
    description: "Layer 02 标准赛事对象 (CanonicalMatch) 与 AI Slim Brief 提炼样本",
    canonical_match: canonical,
    ai_evaluation_brief: aiBrief,
  };

  const targetDir = path.resolve(__dirname, "../samples/02_canonical_model");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const outputPath = path.join(targetDir, "canonical_match_sample.json");
  fs.writeFileSync(outputPath, JSON.stringify(sampleOutput, null, 2), "utf-8");
  console.log(`✅ Sample written to ${outputPath}`);
}

generateSample();

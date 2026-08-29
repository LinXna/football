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
  const ybtyLivePath = path.resolve(__dirname, "../fixtures/ybty_v2.8.0_live_2026-08-20T20-20-13-747Z.json");
  const leisuPath = path.resolve(__dirname, "../fixtures/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json");

  const rawYbtyLive = JSON.parse(fs.readFileSync(ybtyLivePath, "utf-8"));
  const rawLeisu = JSON.parse(fs.readFileSync(leisuPath, "utf-8"));

  const parsedYbtyLive = parseYbtyLiveRoot(rawYbtyLive);
  const parsedLeisu = parseLeisuInterfaceExport(rawLeisu);

  // 1. 获取目标比赛：谢周三 vs 布拉德福德城 (雷速 ID: 4562395)
  const ybtyTarget = parsedYbtyLive.matches.find(m => m.home === "谢周三" && m.away === "布拉德福德城") || parsedYbtyLive.matches[0];
  const genericMatch: GenericYbtyMatch = {
    league: ybtyTarget.league,
    home: ybtyTarget.home,
    away: ybtyTarget.away,
    home_score: ybtyTarget.home_score !== null ? ybtyTarget.home_score : 0,
    away_score: ybtyTarget.away_score !== null ? ybtyTarget.away_score : 1,
    clock: ybtyTarget.clock || "62:25",
    clock_status: ybtyTarget.clock_status || "62:25",
    is_live: true,
    markets: ybtyTarget.markets,
  };

  const matchedLeisu = parsedLeisu.matches.find(m => String(m.match_id) === "4562395") || parsedLeisu.matches[0];
  
  const aliases: Record<string, string> = {
    "英格兰甲级联赛": "英甲",
    "谢周三": "谢周三",
    "布拉德福德城": "布拉德福德",
  };

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
  console.log(`Canonical ID: ${canonical.canonical_id}`);
  console.log(`Teams: ${canonical.home_team_name} vs ${canonical.away_team_name}`);
}

generateSample();

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

  // 构造真实匹配的别名与联赛
  const aliases: Record<string, string> = {
    "谢周三": "谢周三",
    "布拉德福德": "布拉德福德",
    "英甲": "英甲",
  };

  const sampleMatch = parsedYbtyLive.matches[0];
  // 模拟 YBTY 抓取到该场赛事实时盘口
  const genericMatch: GenericYbtyMatch = {
    league: "英甲",
    home: "谢周三",
    away: "布拉德福德",
    home_score: 0,
    away_score: 1,
    clock: "63:00",
    clock_status: "63:00",
    is_live: true,
    markets: sampleMatch.markets,
  };

  const matchedLeisu = parsedLeisu.matches[0]; // 关联雷速全特征样本 (谢周三 vs 布拉德福德)
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

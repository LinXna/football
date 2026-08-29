/**
 * 运行 YBTY 滚球数据提取器，并将提取后的清洗结果导出为 JSON 样例
 * 导出路径：/refactor/samples/01_data_ingestion/ybty/ybty_live_extracted_sample.json
 */
import fs from "fs";
import path from "path";
import { parseYbtyLiveRoot } from "../01_data_ingestion/ybty/ybtyLiveExtractor";

function generateSample() {
  const fixturePath = path.join(
    process.cwd(),
    "refactor",
    "fixtures",
    "ybty_v2.8.0_live_2026-08-20T20-20-13-747Z.json"
  );
  if (!fs.existsSync(fixturePath)) {
    console.error("❌ 样本原始文件不存在:", fixturePath);
    process.exit(1);
  }

  const rawJson = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const parsed = parseYbtyLiveRoot(rawJson);

  const outputDir = path.join(process.cwd(), "refactor", "samples", "01_data_ingestion", "ybty");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const sampleOutputPath = path.join(outputDir, "ybty_live_extracted_sample.json");
  fs.writeFileSync(sampleOutputPath, JSON.stringify(parsed, null, 2), "utf-8");

  console.log("✅ 成功生成清洗提取后的样例文件:");
  console.log("   -> " + sampleOutputPath);
}

generateSample();

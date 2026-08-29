/**
 * 生成雷速接口提取后的标准样例数据
 */

import fs from "fs";
import path from "path";
import { parseLeisuInterfaceExport } from "../01_data_ingestion/leisu/leisuInterfaceExtractor";

function generateLeisuSample() {
  const fixturePath = path.resolve(
    process.cwd(),
    "refactor/fixtures/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json"
  );
  const outputPath = path.resolve(
    process.cwd(),
    "refactor/samples/01_data_ingestion/leisu/leisu_extracted_sample.json"
  );

  const rawJson = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const parsed = parseLeisuInterfaceExport(rawJson);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2), "utf-8");
  console.log(`✅ 成功生成雷速清洗提取后的样例文件:\n  -> ${outputPath}`);
}

generateLeisuSample();

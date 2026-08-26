/**
 * YBTY 滚球提取器单元验证脚本
 * 路径：/refactor/tests/verify_ybty_live_extractor.ts
 * 测试样本：/refactor/fixtures/ybty_v2.8.0_live_2026-08-23T21-55-11-819Z.json
 */
import fs from "fs";
import path from "path";
import { parseYbtyLiveRoot } from "../01_data_ingestion/ybty/ybtyLiveExtractor";

function runTest() {
  console.log("=== 开始验证 YBTY 滚球数据提取器 (Layer 01 -> Tests) ===");

  const samplePath = path.join(
    process.cwd(),
    "refactor",
    "fixtures",
    "ybty_v2.8.0_live_2026-08-23T21-55-11-819Z.json"
  );
  if (!fs.existsSync(samplePath)) {
    console.error("❌ 样本文件不存在:", samplePath);
    process.exit(1);
  }

  const rawJson = JSON.parse(fs.readFileSync(samplePath, "utf-8"));
  const parsed = parseYbtyLiveRoot(rawJson);

  console.log(`✅ 成功解析顶层元数据:`);
  console.log(`   - 协议版本 (schema_version): ${parsed.schema_version}`);
  console.log(`   - 插件版本 (export_version): ${parsed.export_version}`);
  console.log(`   - 抓取时间 (captured_at): ${parsed.captured_at}`);
  console.log(`   - 比赛场数 (matches.length): ${parsed.matches.length}`);

  console.log("\n=== 赛事明细逐场校验 ===");
  parsed.matches.forEach((m, idx) => {
    console.log(`\n[第 ${idx + 1} 场] ${m.league} | ${m.home} vs ${m.away}`);
    console.log(`  - 比分: ${m.home_score} : ${m.away_score}`);
    console.log(`  - 踢球进行中时钟 (clock): "${m.clock}"`);
    console.log(`  - 全周期状态 (clock_status): "${m.clock_status}"`);

    console.log(`  - 盘口解析结果:`);
    if (m.markets.full_h2h) {
      console.log(
        `    * 全场独赢 (1X2): 主胜=${m.markets.full_h2h.home_odds}, 平局=${m.markets.full_h2h.draw_odds}, 客胜=${m.markets.full_h2h.away_odds}`
      );
    } else {
      console.log(`    * 全场独赢 (1X2): 无`);
    }

    if (m.markets.full_spread_main) {
      console.log(
        `    * 全场主盘让球 (Spread line_index 0): 主队 ${m.markets.full_spread_main.home_selection} @ ${m.markets.full_spread_main.home_odds} | 客队 ${m.markets.full_spread_main.away_selection} @ ${m.markets.full_spread_main.away_odds}`
      );
    }
    if (m.markets.full_spread_subs.length > 0) {
      m.markets.full_spread_subs.forEach((sub, subIdx) => {
        console.log(
          `      └ 副盘让球 #${subIdx + 1} (line_index ${sub.line_index}): 主 ${sub.home_selection} @ ${sub.home_odds} | 客 ${sub.away_selection} @ ${sub.away_odds}`
        );
      });
    }

    if (m.markets.full_total_main) {
      console.log(
        `    * 全场主盘大小球 (Total line_index 0): 盘口线=${m.markets.full_total_main.line}, 大球=${m.markets.full_total_main.over_odds}, 小球=${m.markets.full_total_main.under_odds}`
      );
    }
    if (m.markets.full_total_subs.length > 0) {
      m.markets.full_total_subs.forEach((sub, subIdx) => {
        console.log(
          `      └ 副盘大小球 #${subIdx + 1} (line_index ${sub.line_index}): 盘口线=${sub.line}, 大=${sub.over_odds}, 小=${sub.under_odds}`
        );
      });
    }

    if (m.markets.half_spread_main) {
      console.log(
        `    * 半场主盘让球: 主 ${m.markets.half_spread_main.home_selection} @ ${m.markets.half_spread_main.home_odds} | 客 ${m.markets.half_spread_main.away_selection} @ ${m.markets.half_spread_main.away_odds}`
      );
    }
    if (m.markets.half_total_main) {
      console.log(
        `    * 半场主盘大小球: 盘口线=${m.markets.half_total_main.line}, 大=${m.markets.half_total_main.over_odds}, 小=${m.markets.half_total_main.under_odds}`
      );
    }
  });

  // 严格断言
  if (parsed.matches.length !== 2) throw new Error("总场数不符");
  const m1 = parsed.matches[0];
  if (m1.home !== "沙佩科人SC" || m1.away !== "圣保罗SP") throw new Error("比赛对阵解析错误");
  if (m1.markets.full_h2h?.home_odds !== 3.9) throw new Error("独赢主胜赔率解析错误");
  if (m1.markets.full_spread_main?.home_selection !== "+0.5") throw new Error("让球主盘线解析错误");
  if (m1.markets.full_total_main?.line !== "1.5/2") throw new Error("大小球主盘线解析错误");
  if (m1.markets.full_total_main?.over_odds !== 1.82) throw new Error("大球赔率解析错误");

  console.log("\n🎉 [Layer 01 测试通过] 全部断言与真实数据字段 100% 验证通过！");
}

runTest();

/**
 * YBTY 赛前提取器单元验证脚本
 * 路径：/refactor/tests/verify_ybty_prematch_extractor.ts
 * 测试样本：/refactor/fixtures/ybty_v2.8.0_prematch_2026-08-23T01-04-18-978Z.json
 */
import fs from "fs";
import path from "path";
import { parseYbtyPrematchRoot } from "../01_data_ingestion/ybty/ybtyPrematchExtractor";

function runTest() {
  console.log("=== 开始验证 YBTY 赛前数据提取器 (Layer 01 -> Prematch Tests) ===");

  const samplePath = path.join(
    process.cwd(),
    "refactor",
    "fixtures",
    "ybty_v2.8.0_prematch_2026-08-23T01-04-18-978Z.json"
  );
  if (!fs.existsSync(samplePath)) {
    console.error("❌ 样本文件不存在:", samplePath);
    process.exit(1);
  }

  const rawJson = JSON.parse(fs.readFileSync(samplePath, "utf-8"));
  const parsed = parseYbtyPrematchRoot(rawJson);

  console.log(`✅ 成功解析顶层元数据:`);
  console.log(`   - 协议版本 (schema_version): ${parsed.schema_version}`);
  console.log(`   - 插件版本 (export_version): ${parsed.export_version}`);
  console.log(`   - 抓取时间 (captured_at): ${parsed.captured_at}`);
  console.log(`   - 比赛场数 (matches.length): ${parsed.matches.length}`);

  console.log("\n=== 赛事明细逐场校验 ===");
  parsed.matches.forEach((m, idx) => {
    console.log(`\n[第 ${idx + 1} 场] ${m.league} | ${m.home} vs ${m.away}`);
    console.log(`  - 状态: "${m.clock_status}"`);

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

    if (m.markets.half_h2h) {
      console.log(
        `    * 半场独赢: 主 ${m.markets.half_h2h.home_odds}, 平 ${m.markets.half_h2h.draw_odds}, 客 ${m.markets.half_h2h.away_odds}`
      );
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
  
  // 第一场
  const m1 = parsed.matches[0];
  if (m1.home !== "麦德林独立" || m1.away !== "库库塔") throw new Error("第1场比赛对阵解析错误");
  if (m1.markets.full_h2h?.home_odds !== 1.18) throw new Error("第1场独赢主胜赔率错误");
  if (m1.markets.full_spread_main?.home_selection !== "-1.5/2") throw new Error("第1场让球主盘线错误");
  if (m1.markets.full_spread_main?.home_odds !== 1.76) throw new Error("第1场让球主盘赔率错误");
  if (m1.markets.full_spread_subs.length !== 2) throw new Error("第1场让球副盘数量错误");
  if (m1.markets.full_total_main?.line !== "3") throw new Error("第1场大小球主盘线错误");
  if (m1.markets.full_total_subs.length !== 2) throw new Error("第1场大小球副盘数量错误");
  if (m1.markets.half_h2h?.home_odds !== 1.61) throw new Error("第1场半场独赢主胜赔率错误");
  if (m1.markets.half_spread_main?.home_selection !== "-0.5/1") throw new Error("第1场半场让球主盘线错误");
  if (m1.markets.half_total_main?.line !== "1/1.5") throw new Error("第1场半场大小球主盘线错误");

  // 第二场
  const m2 = parsed.matches[1];
  if (m2.home !== "温哥华白帽" || m2.away !== "达拉斯FC") throw new Error("第2场比赛对阵解析错误");
  if (m2.clock_status !== "25分钟后开赛") throw new Error("第2场开赛状态错误");
  if (m2.markets.full_h2h?.home_odds !== 1.42) throw new Error("第2场独赢主胜赔率错误");
  if (m2.markets.full_spread_main?.home_selection !== "-1/1.5") throw new Error("第2场让球主盘线错误");
  if (m2.markets.full_total_main?.line !== "3/3.5") throw new Error("第2场大小球主盘线错误");
  if (m2.markets.full_total_main?.over_odds !== 1.88) throw new Error("第2场大球赔率错误");

  console.log("\n🎉 [Layer 01 赛前测试通过] 全部赛前断言与真实数据字段 100% 验证通过！");
}

runTest();

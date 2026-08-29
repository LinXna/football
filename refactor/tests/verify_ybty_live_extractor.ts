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
    "ybty_v2.8.0_live_2026-08-20T20-20-13-747Z.json"
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

  // 严格逐场断言全部 6 场比赛
  if (parsed.matches.length !== 6) throw new Error(`总场数不符: 期望 6, 实际 ${parsed.matches.length}`);
  
  // 第1场: 谢周三 vs 布拉德福德城
  const m1 = parsed.matches[0];
  if (m1.home !== "谢周三" || m1.away !== "布拉德福德城") throw new Error("第1场比赛对阵解析错误");
  if (m1.home_score !== 0 || m1.away_score !== 1) throw new Error("第1场比分错误");
  if (m1.clock !== "62:25") throw new Error("第1场时钟解析错误");
  if (m1.markets.full_h2h?.home_odds !== 8.7 || m1.markets.full_h2h?.away_odds !== 1.43) throw new Error("第1场独赢赔率错误");
  if (m1.markets.full_spread_main?.home_selection !== "-0/0.5" || m1.markets.full_spread_main?.home_odds !== 2.2) throw new Error("第1场让球主盘线错误");
  if (m1.markets.full_total_main?.line !== "2" || m1.markets.full_total_main?.over_odds !== 1.91) throw new Error("第1场大小球主盘线错误");
  if (m1.markets.full_spread_subs.length !== 2 || m1.markets.full_total_subs.length !== 2) throw new Error("第1场副盘数量错误");

  // 第2场: 时刻准备 vs 奥鲁罗
  const m2 = parsed.matches[1];
  if (m2.home !== "时刻准备" || m2.away !== "奥鲁罗") throw new Error("第2场对阵错误");
  if (m2.home_score !== 2 || m2.away_score !== 1) throw new Error("第2场比分错误");
  if (m2.clock !== "58:16") throw new Error("第2场时钟错误");
  if (m2.markets.full_h2h?.home_odds !== 1.1) throw new Error("第2场独赢赔率错误");
  if (m2.markets.full_spread_main?.home_selection !== "-0.5" || m2.markets.full_spread_main?.home_odds !== 1.78) throw new Error("第2场让球主盘错误");
  if (m2.markets.full_total_main?.line !== "4.5" || m2.markets.full_total_main?.over_odds !== 1.96) throw new Error("第2场大小球主盘错误");

  // 第3场: 本菲卡 vs 奥胡斯
  const m3 = parsed.matches[2];
  if (m3.home !== "本菲卡" || m3.away !== "奥胡斯") throw new Error("第3场对阵错误");
  if (m3.home_score !== 3 || m3.away_score !== 1) throw new Error("第3场比分错误");
  if (m3.clock !== "58:11") throw new Error("第3场时钟错误");
  if (m3.markets.full_spread_main?.home_selection !== "-1" || m3.markets.full_spread_main?.home_odds !== 1.83) throw new Error("第3场让球主盘错误");
  if (m3.markets.full_total_main?.line !== "5.5" || m3.markets.full_total_main?.over_odds !== 1.84) throw new Error("第3场大小球主盘错误");

  // 第4场: 巴列卡诺 vs 阿拉维斯
  const m4 = parsed.matches[3];
  if (m4.home !== "巴列卡诺" || m4.away !== "阿拉维斯") throw new Error("第4场对阵错误");
  if (m4.home_score !== 1 || m4.away_score !== 0) throw new Error("第4场比分错误");
  if (m4.clock !== "58:06") throw new Error("第4场时钟错误");
  if (m4.markets.full_h2h?.home_odds !== 1.41) throw new Error("第4场独赢赔率错误");
  if (m4.markets.full_spread_main?.home_selection !== "+0/0.5" || m4.markets.full_spread_main?.home_odds !== 1.75) throw new Error("第4场让球主盘错误");
  if (m4.markets.full_total_main?.line !== "2" || m4.markets.full_total_main?.over_odds !== 2.04) throw new Error("第4场大小球主盘错误");

  // 第5场: 斯塔尔南(女) vs 布列达布利克(女)
  const m5 = parsed.matches[4];
  if (m5.home !== "斯塔尔南(女)" || m5.away !== "布列达布利克(女)") throw new Error("第5场对阵错误");
  if (m5.home_score !== 0 || m5.away_score !== 0) throw new Error("第5场比分错误");
  if (m5.clock !== "47:34") throw new Error("第5场时钟错误");
  if (m5.markets.full_h2h?.home_odds !== 5.2) throw new Error("第5场独赢赔率错误");
  if (m5.markets.full_spread_main?.home_selection !== "+0.5/1" || m5.markets.full_spread_main?.home_odds !== 1.98) throw new Error("第5场让球主盘错误");
  if (m5.markets.full_total_main?.line !== "2" || m5.markets.full_total_main?.over_odds !== 1.79) throw new Error("第5场大小球主盘错误");

  // 第6场: 博卡青年后备队 vs 科尔多瓦中央后备队
  const m6 = parsed.matches[5];
  if (m6.home !== "博卡青年后备队" || m6.away !== "科尔多瓦中央后备队") throw new Error("第6场对阵错误");
  if (m6.home_score !== 0 || m6.away_score !== 0) throw new Error("第6场比分错误");
  if (m6.clock !== "20:32") throw new Error("第6场时钟错误");
  if (m6.markets.full_h2h?.home_odds !== 1.43) throw new Error("第6场独赢赔率错误");
  if (m6.markets.full_spread_main?.home_selection !== "-1" || m6.markets.full_spread_main?.home_odds !== 1.8) throw new Error("第6场让球主盘错误");
  if (m6.markets.full_total_main?.line !== "2" || m6.markets.full_total_main?.over_odds !== 1.83) throw new Error("第6场大小球主盘错误");
  if (!m6.markets.half_spread_main || m6.markets.half_spread_main.home_selection !== "-0/0.5") throw new Error("第6场半场让球错误");
  if (!m6.markets.half_total_main || m6.markets.half_total_main.line !== "0.5") throw new Error("第6场半场大小球错误");

  console.log("\n🎉 [Layer 01 测试通过] 全部6场比赛遍历断言与真实数据字段 100% 验证通过！");
}

runTest();

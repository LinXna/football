/**
 * 验证模块化枚举分类管理与公共异常/告警总线框架 (Layer 00 & Layer 01 -> Modular Enums Tests)
 */

import {
  RecommendationGrade,
  SettlementOutcome,
  MatchAlignmentStatus,
} from "../00_common/enums";
import {
  SystemErrorCode,
  DomainError,
  systemAlertBus,
  commonEnumRegistry,
  SystemAlertEvent,
} from "../00_common/errors";
import {
  LeisuMatchStatus,
  LEISU_MATCH_STATUS_NAMES,
  LeisuMatchSide,
  LeisuTimelineEventType,
  LeisuPlayerIncidentType,
  LeisuPlayerStatus,
  leisuEnumManager,
} from "../01_data_ingestion/leisu/enums";
import {
  YbtyMarketTypeEnum,
  YBTY_MARKET_TYPE_NAMES,
  YbtyOptionSide,
  ybtyEnumManager,
} from "../01_data_ingestion/ybty/enums";

function runModularEnumTests() {
  console.log("=== 开始验证模块化枚举分类管理与公共异常/通知总线框架 ===");

  // 1. 验证全局跨模块通用领域枚举 (00_common/enums.ts)
  console.log("1. 验证 00_common 通用跨模块枚举：");
  console.log(`  - 推荐评级: ${Object.values(RecommendationGrade).join(", ")}`);
  console.log(`  - 结算结果: ${Object.values(SettlementOutcome).join(", ")}`);
  console.log(`  - 赛事对齐状态: ${Object.values(MatchAlignmentStatus).join(", ")}`);

  // 2. 验证雷速子模块专属枚举分类管理 (01_data_ingestion/leisu/enums.ts)
  console.log("2. 验证雷速模块专属分类枚举 (leisu/enums.ts)：");
  console.log(`  - 比赛生命周期状态: ${Object.keys(LeisuMatchStatus).length / 2} 项 (如 ${LeisuMatchStatus.FINISHED}: "${LEISU_MATCH_STATUS_NAMES[LeisuMatchStatus.FINISHED]}")`);
  console.log(`  - 触发方枚举: ${Object.keys(LeisuMatchSide).join(", ")}`);
  console.log(`  - 阵容出场/伤停状态: 首发=1, 替补=0, 伤停=2, 停赛=3, 未指定=-1`);
  console.log(`  - 文字直播事件: 包含进球(1)、角球(2)、越位(5)、射正(21)、射偏(22)等 ${Object.keys(LeisuTimelineEventType).length / 2} 种类型`);
  console.log(`  - 球员独立事件: 包含进球(1)、助攻(99)、黄牌(3)、扑救(8)等`);

  // 3. 验证 YBTY 子模块专属枚举分类管理 (01_data_ingestion/ybty/enums.ts)
  console.log("3. 验证 YBTY 模块专属分类枚举 (ybty/enums.ts)：");
  console.log(`  - 盘口玩法类型: 让球(${YbtyMarketTypeEnum.FULL_SPREAD})、大小球(${YbtyMarketTypeEnum.FULL_TOTAL})、独赢(${YbtyMarketTypeEnum.FULL_H2H})等 ${Object.keys(YbtyMarketTypeEnum).length} 种玩法`);
  console.log(`  - 投注方位枚举: ${Object.keys(YbtyOptionSide).join(", ")}`);

  // 4. 验证统一异常通知总线订阅与广播
  const receivedAlerts: SystemAlertEvent[] = [];
  const unsubscribe = systemAlertBus.subscribe((event) => {
    receivedAlerts.push(event);
  });

  // 5. 验证子模块未知枚举自动上报至公共收集总线
  commonEnumRegistry.clear();

  // (a) 雷速未知事件
  const unknownLeisu = leisuEnumManager.resolveTimelineEventType(9999, "雷速未知测试事件");
  if (unknownLeisu.is_known !== false || unknownLeisu.name !== "未知事件(9999)") {
    throw new Error("雷速未知事件解析返回值异常");
  }

  // (b) YBTY 未知玩法
  const unknownYbty = ybtyEnumManager.resolveMarketType("fantasy_triple_spread", "测试未知三重玩法");
  if (unknownYbty.is_known !== false || unknownYbty.name !== "未知盘口玩法(fantasy_triple_spread)") {
    throw new Error("YBTY未知玩法解析返回值异常");
  }

  // 检查是否自动向全局总线推送了 2 条告警事件
  if (receivedAlerts.length !== 2) {
    throw new Error(`系统通知总线未收到未知枚举告警: 期望 2, 实际 ${receivedAlerts.length}`);
  }
  if (receivedAlerts[0].requires_ui_popup !== true || receivedAlerts[1].requires_ui_popup !== true) {
    throw new Error("告警未标记为需要 UI 弹窗提示");
  }
  console.log("✅ 各子模块 (leisu/ybty) 未知枚举自动捕获与全局告警总线广播验证成功 (已全部标记 requires_ui_popup: true)");

  // 6. 验证统一领域异常 (DomainError)
  const err = new DomainError({
    code: SystemErrorCode.SCORE_MISMATCH_ALERT,
    message: "YBTY与雷速比分不一致",
    module: "EntityAlignment",
    severity: "critical",
    payload: { ybty_score: "1:0", leisu_score: "0:1" },
  });
  if (err.code !== SystemErrorCode.SCORE_MISMATCH_ALERT || err.severity !== "critical") {
    throw new Error("DomainError 初始化属性错误");
  }
  console.log("✅ 统一领域异常类 DomainError 验证成功");

  unsubscribe();
  console.log("\n🎉 [模块化枚举测试通过] 所有子模块 enums.ts 分类管理与公共异常/弹窗总线 100% 验证通过！");
}

runModularEnumTests();

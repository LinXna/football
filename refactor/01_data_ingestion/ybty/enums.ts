/**
 * 01 数据接入层 - YBTY 盘口与市场枚举分类管理 (enums.ts)
 * 
 * 核心架构准则：
 * 1. 模块化枚举管理：本子模块的所有枚举必须统一在专属 enums.ts 中独立管理维护
 * 2. 异常自动捕获：通过公共 commonEnumRegistry 统一代理，发现未登记代码自动上报告警总线与弹窗中心
 */

import { commonEnumRegistry } from "../../00_common/errors";

// ==========================================
// 1. YBTY 盘口市场类型枚举 (Ybty Market Types)
// ==========================================

export enum YbtyMarketTypeEnum {
  FULL_H2H = "full_h2h",         // 全场独赢 (1X2)
  FULL_SPREAD = "full_spread",   // 全场让球 (Asian Handicap)
  FULL_TOTAL = "full_total",     // 全场大小球 (Over / Under)
  HALF_H2H = "half_h2h",         // 半场独赢 (1X2)
  HALF_SPREAD = "half_spread",   // 半场让球 (Half Spread)
  HALF_TOTAL = "half_total",     // 半场大小球 (Half Total)
  CORNER_H2H = "corner_h2h",     // 角球独赢
  CORNER_SPREAD = "corner_spread", // 角球让球
  CORNER_TOTAL = "corner_total", // 角球大小球
}

export const YBTY_MARKET_TYPE_NAMES: Record<string, string> = {
  [YbtyMarketTypeEnum.FULL_H2H]: "全场独赢",
  [YbtyMarketTypeEnum.FULL_SPREAD]: "全场让球",
  [YbtyMarketTypeEnum.FULL_TOTAL]: "全场大小球",
  [YbtyMarketTypeEnum.HALF_H2H]: "半场独赢",
  [YbtyMarketTypeEnum.HALF_SPREAD]: "半场让球",
  [YbtyMarketTypeEnum.HALF_TOTAL]: "半场大小球",
  [YbtyMarketTypeEnum.CORNER_H2H]: "角球独赢",
  [YbtyMarketTypeEnum.CORNER_SPREAD]: "角球让球",
  [YbtyMarketTypeEnum.CORNER_TOTAL]: "角球大小球",
};

// ==========================================
// 2. YBTY 盘口投注方向枚举 (Ybty Bet Option Sides)
// ==========================================

export enum YbtyOptionSide {
  HOME = "home",   // 主队 / 胜
  AWAY = "away",   // 客队 / 负
  DRAW = "draw",   // 和局 / 平
  OVER = "over",   // 大球
  UNDER = "under", // 小球
}

export const YBTY_OPTION_SIDE_NAMES: Record<YbtyOptionSide, string> = {
  [YbtyOptionSide.HOME]: "主队/主胜",
  [YbtyOptionSide.AWAY]: "客队/客胜",
  [YbtyOptionSide.DRAW]: "和局/平局",
  [YbtyOptionSide.OVER]: "大球",
  [YbtyOptionSide.UNDER]: "小球",
};

// ==========================================
// 3. YBTY 专属枚举管理器 (Ybty Enum Manager)
// ==========================================

export class YbtyEnumManager {
  private static instance: YbtyEnumManager;

  private constructor() {}

  public static getInstance(): YbtyEnumManager {
    if (!YbtyEnumManager.instance) {
      YbtyEnumManager.instance = new YbtyEnumManager();
    }
    return YbtyEnumManager.instance;
  }

  /**
   * 解析并校验 YBTY 市场玩法类型，未知代码自动进入公共收集总线
   */
  public resolveMarketType(marketCode: string, sampleTitle?: string): { code: string; name: string; is_known: boolean } {
    if (YBTY_MARKET_TYPE_NAMES[marketCode]) {
      return { code: marketCode, name: YBTY_MARKET_TYPE_NAMES[marketCode], is_known: true };
    }

    // 自动上报公共异常收集与弹窗总线
    commonEnumRegistry.recordUnknownEnum({
      category: "ybty_market_type",
      raw_code: marketCode,
      sample_context: sampleTitle,
      module: "YbtyEnumManager",
      trigger_popup: true,
    });

    return { code: marketCode, name: `未知盘口玩法(${marketCode})`, is_known: false };
  }

  /**
   * 解析投注方位 side
   */
  public resolveOptionSide(sideCode: string, sampleSelection?: string): { code: YbtyOptionSide; name: string; is_known: boolean } {
    if (YBTY_OPTION_SIDE_NAMES[sideCode as YbtyOptionSide]) {
      return {
        code: sideCode as YbtyOptionSide,
        name: YBTY_OPTION_SIDE_NAMES[sideCode as YbtyOptionSide],
        is_known: true,
      };
    }

    commonEnumRegistry.recordUnknownEnum({
      category: "ybty_option_side",
      raw_code: sideCode,
      sample_context: sampleSelection,
      module: "YbtyEnumManager",
      trigger_popup: true,
    });

    return {
      code: sideCode as YbtyOptionSide,
      name: `未知方位(${sideCode})`,
      is_known: false,
    };
  }
}

export const ybtyEnumManager = YbtyEnumManager.getInstance();

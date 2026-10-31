import {
  MatchAlignmentStatus,
  LeagueMatchStatus,
  DataCompletenessTier,
  MatchStage,
  MissingDataReason,
} from "../../refactor/02_canonical_model/enums";
import { CleanMarketsGroup } from "../../refactor/01_data_ingestion/ybty/types";

// 导入对齐向导待审项模型
export interface ImportPendingMatch {
  canonical_id: string;
  league_name: string;
  match_time: string;
  confidence_score: number;
  status: MatchAlignmentStatus;
  alignment_reason: string;

  // YBTY 法定信息
  ybty_league: string;
  ybty_home: string;
  ybty_away: string;
  ybty_time: string;
  ybty_score: string;
  is_live: boolean;

  // 雷速 关联信息
  leisu_match_id: string | null;
  leisu_league: string | null;
  leisu_home: string | null;
  leisu_away: string | null;
  leisu_time: string | null;
  leisu_score: string | null;

  // 联赛匹配状态
  league_status: LeagueMatchStatus;
  league_similarity: number;
  league_alias_hit: boolean;

  // 主客场颠倒预警
  is_swapped_suspected: boolean;

  // 疑似错误绑定预警
  is_corrupted_alias_suspected?: boolean;
  corrupted_alias_reason?: string;

  // 主客队匹配状态
  home_similarity: number;
  home_alias_hit: boolean;
  away_similarity: number;
  away_alias_hit: boolean;
  has_unconfirmed_aliases: boolean;
}

// 可选雷速候选池条目
export interface LeisuCandidateItem {
  match_id: string;
  competition: string;
  home_team: string;
  away_team: string;
  minute: number | null;
  score: { home: number; away: number } | null;
  commence_time: string | null;
  status_text: string;
  is_live: boolean;
}

/**
 * 格式化比赛开赛日期与时间 (保留 YYYY-MM-DD HH:mm，杜绝截断仅留时间)
 */
export function formatKickoffDateTime(rawTime?: string | null, fallback?: string): string {
  if (!rawTime) return fallback || "未标时间";
  const str = String(rawTime).trim();
  if (!str) return fallback || "未标时间";
  if (str.includes("T") || str.includes("-") || str.includes("/")) {
    const normalized = str.replace("T", " ");
    if (normalized.length >= 16) {
      return normalized.slice(0, 16);
    }
    return normalized;
  }
  return str || fallback || "未标时间";
}

/**
 * 解析并获取单场比赛的默认完场比分
 */
export function getDefaultScoreForRecord(record: any): { home: string; away: string } {
  if (!record) return { home: "0", away: "0" };

  const isLive = record.stage === "LIVE" || 
                 record.mode === "live" || 
                 (record.condition_snapshot?.match_minute != null && record.condition_snapshot.match_minute !== "PREMATCH") ||
                 (record.timing?.stage === "LIVE");

  if (!isLive) {
    return { home: "0", away: "0" };
  }

  if (record.score_at_prediction && typeof record.score_at_prediction.home === "number") {
    return {
      home: String(Math.max(0, record.score_at_prediction.home)),
      away: String(Math.max(0, record.score_at_prediction.away)),
    };
  }

  if (record.prediction_snapshot?.score_at_recommendation) {
    const parts = String(record.prediction_snapshot.score_at_recommendation).split(/[-:]/);
    if (parts.length >= 2) {
      const h = parseInt(parts[0].trim(), 10);
      const a = parseInt(parts[1].trim(), 10);
      return {
        home: String(isNaN(h) ? 0 : Math.max(0, h)),
        away: String(isNaN(a) ? 0 : Math.max(0, a)),
      };
    }
  }

  if (record.condition_snapshot?.current_score) {
    const parts = String(record.condition_snapshot.current_score).split(/[-:]/);
    if (parts.length >= 2) {
      const h = parseInt(parts[0].trim(), 10);
      const a = parseInt(parts[1].trim(), 10);
      return {
        home: String(isNaN(h) ? 0 : Math.max(0, h)),
        away: String(isNaN(a) ? 0 : Math.max(0, a)),
      };
    }
  }

  if (record.score) {
    const h = record.score.home_score ?? record.score.home ?? 0;
    const a = record.score.away_score ?? record.score.away ?? 0;
    return {
      home: String(Math.max(0, Number(h) || 0)),
      away: String(Math.max(0, Number(a) || 0)),
    };
  }

  return { home: "0", away: "0" };
}

/**
 * 统一提取并格式化【推荐/推演时的现场实时比分】(如 "0 - 1", "0 - 0")
 */
export const getScoreAtPredictionString = (record: any): string => {
  if (!record) return "0 - 0";
  if (record.score_at_prediction && typeof record.score_at_prediction.home === "number") {
    return `${record.score_at_prediction.home} - ${record.score_at_prediction.away}`;
  }
  if (record.prediction_snapshot?.score_at_recommendation) {
    return String(record.prediction_snapshot.score_at_recommendation).replace(/[-:]/, " - ");
  }
  if (record.condition_snapshot?.score_at_recommendation) {
    const s = record.condition_snapshot.score_at_recommendation;
    return typeof s === "object" ? `${s.home} - ${s.away}` : String(s).replace(/[-:]/, " - ");
  }
  if (record.condition_snapshot?.current_score) {
    return String(record.condition_snapshot.current_score).replace(/[-:]/, " - ");
  }
  if (record.score) {
    const h = record.score.home_score ?? record.score.home ?? 0;
    const a = record.score.away_score ?? record.score.away ?? 0;
    return `${h} - ${a}`;
  }
  return "0 - 0";
};

/**
 * 严格清理并约束比分输入为非负整数 (>= 0)
 */
export function sanitizeScoreInput(val: string): string {
  if (val === "") return "";
  const clean = val.replace(/[^0-9]/g, "");
  if (!clean) return "";
  const num = parseInt(clean, 10);
  return isNaN(num) ? "0" : String(Math.max(0, num));
}

/**
 * 获取盘口玩法总览
 */
export function getMarketsSummary(mkts?: CleanMarketsGroup | null): { count: number; text: string } {
  if (!mkts) return { count: 0, text: "0个玩法" };
  let count = 0;
  let items: string[] = [];
  if (mkts.full_h2h) {
    count++;
    items.push("全场独赢");
  }
  if (mkts.full_spread_main) {
    count += 1 + (mkts.full_spread_subs?.length || 0);
    items.push(`全场让球(${1 + (mkts.full_spread_subs?.length || 0)}盘)`);
  }
  if (mkts.full_total_main) {
    count += 1 + (mkts.full_total_subs?.length || 0);
    items.push(`全场大小(${1 + (mkts.full_total_subs?.length || 0)}盘)`);
  }
  if (mkts.half_h2h) {
    count++;
    items.push("半场独赢");
  }
  if (mkts.half_spread_main) {
    count++;
    items.push("半场让球");
  }
  if (mkts.half_total_main) {
    count++;
    items.push("半场大小");
  }
  return { count, text: items.join(" / ") || "暂无盘口" };
}

/**
 * 时间轴事件图标与文字映射
 */
export function getTimelineIncidentBadge(type: number | string, typeName?: string, text?: string): { icon: string; label: string } {
  const tStr = String(type);
  const name = typeName || "";
  const txt = text || "";

  if (name.includes("乌龙") || txt.includes("乌龙")) {
    return { icon: "🥅", label: "乌龙" };
  }
  if (tStr === "16" || (name.includes("点球") && (name.includes("失") || txt.includes("失")))) {
    return { icon: "🎯❌", label: "点球射失" };
  }
  if (name.includes("点球") || txt.includes("点球")) {
    return { icon: "🎯", label: "点球" };
  }
  if (tStr === "1" || name.includes("进球") || txt.includes("进球")) {
    return { icon: "⚽", label: "进球" };
  }
  if (tStr === "23" || name.includes("两黄变红") || txt.includes("两黄变红")) {
    return { icon: "🟨🟥", label: "两黄变红" };
  }
  if (tStr === "4" || name.includes("红牌") || txt.includes("红牌")) {
    return { icon: "🟥", label: "红牌" };
  }
  if (tStr === "3" || name.includes("黄牌") || txt.includes("黄牌")) {
    return { icon: "🟨", label: "黄牌" };
  }
  if (tStr === "6" || tStr === "9" || name.includes("换人") || txt.includes("换人")) {
    return { icon: "🔄", label: "换人" };
  }
  if (tStr === "2" || name.includes("角球") || txt.includes("角球")) {
    return { icon: "🚩", label: "角球" };
  }
  if (tStr === "5" || name.includes("越位") || txt.includes("越位")) {
    return { icon: "🚫", label: "越位" };
  }
  if (tStr === "28" || name.includes("VAR") || txt.includes("VAR")) {
    return { icon: "📺", label: "VAR" };
  }
  if (tStr === "21" || name.includes("射正") || txt.includes("射正")) {
    return { icon: "🎯", label: "射正" };
  }
  if (tStr === "22" || name.includes("射偏") || txt.includes("射偏")) {
    return { icon: "🏹", label: "射偏" };
  }
  if (tStr === "8" || name.includes("扑救") || txt.includes("扑救")) {
    return { icon: "🧤", label: "扑救" };
  }
  return { icon: "⚡", label: name || "事件" };
}

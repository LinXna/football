import { CanonicalMatch } from "../../../refactor/02_canonical_model/types";
import { QuantitativeFeatures } from "../../../refactor/03_quant_engine/types";
import { MatchDecisionStatusResult } from "./CanonicalMatchCard";

/**
 * 匹配 AI 评估
 */
export function findAiEvaluationForMatch(m: CanonicalMatch, aiEvaluations: any[]): any {
  if (!aiEvaluations || aiEvaluations.length === 0) return null;
  const cleanStr = (s: string) => (s || "").replace(/[\s\-_·]/g, "").toLowerCase();
  const homeClean = cleanStr(m.home_team_name);
  const awayClean = cleanStr(m.away_team_name);

  for (const evalObj of aiEvaluations) {
    const candidates: any[] = [];
    if (evalObj.result && Array.isArray(evalObj.result.matches)) {
      candidates.push(...evalObj.result.matches);
    } else if (evalObj.result && typeof evalObj.result === "object") {
      candidates.push(evalObj.result);
    } else if (evalObj.match_id || evalObj.canonical_id || evalObj.match) {
      candidates.push(evalObj);
    }

    for (const item of candidates) {
      if (!item || typeof item !== "object") continue;
      if (item.canonical_id && item.canonical_id === m.canonical_id) return item;
      if (item.match_id && (item.match_id === m.canonical_id || item.match_id === m.reference?.leisu_match_id)) return item;
      if (item.leisu_match_id && item.leisu_match_id === m.reference?.leisu_match_id) return item;
      if (item.ybty_home && item.ybty_away) {
        if (cleanStr(item.ybty_home) === homeClean && cleanStr(item.ybty_away) === awayClean) return item;
      }
      if (item.match && typeof item.match === "string") {
        const mStr = item.match.toLowerCase();
        if (homeClean && awayClean && mStr.includes(homeClean) && mStr.includes(awayClean)) return item;
      }
      const fullContent = JSON.stringify(item);
      if (homeClean && awayClean && fullContent.includes(homeClean) && fullContent.includes(awayClean)) return item;
    }
  }
  return null;
}

/**
 * 核心风控与决策状态判别
 */
export function getMatchDecisionStatus(
  m: CanonicalMatch,
  ai: any,
  quant: QuantitativeFeatures | null
): MatchDecisionStatusResult {
  if (ai) {
    const grade = String(ai.grade || ai.grade_raw || "").toUpperCase();
    const isQual = grade.startsWith("A") || grade.startsWith("B");
    const isTrap =
      ai.blind_spot_analysis?.trap_detection_result === "CONFIRMED_TRAP" ||
      ai.trap_detection_result === "CONFIRMED_TRAP" ||
      String(ai.market_scan?.rejection_reason || "").includes("CONFIRMED_TRAP") ||
      String(ai.rejection_reason || "").includes("CONFIRMED_TRAP");

    const legs = Array.isArray(ai.recommended_legs) ? ai.recommended_legs : [];
    const isActionable = ai.is_actionable === true || legs.length > 0;

    if (isQual && !isTrap && isActionable) {
      return {
        status: "BETTABLE",
        hasAi: true,
        label: "可投注(AI终审)",
        badgeClass: "bg-emerald-950/70 text-emerald-300 border-emerald-500/80 ring-1 ring-emerald-500/20",
        reason: `${grade}级实战推荐 (${legs.length}项推荐腿)`,
      };
    }

    if (isTrap) {
      return {
        status: "BLOCKED",
        hasAi: true,
        label: "已阻断(排雷)",
        badgeClass: "bg-rose-950/70 text-rose-300 border-rose-600/80 ring-1 ring-rose-500/20",
        reason: ai.rejection_reason || "机构高水诱盘陷阱/致命风控排雷",
      };
    }

    return {
      status: "WAITING",
      hasAi: true,
      label: "观望待定",
      badgeClass: "bg-slate-800 text-slate-300 border-slate-700",
      reason: ai.rejection_reason || "AI评估未达实战门禁",
    };
  }

  if (quant) {
    if (quant.context?.circuit_breaker?.is_triggered || quant.production_gate?.calculation_status === "BLOCKED") {
      return {
        status: "BLOCKED",
        hasAi: false,
        label: "机器熔断阻断",
        badgeClass: "bg-rose-950/70 text-rose-300 border-rose-600/80 ring-1 ring-rose-500/20",
        reason: quant.production_gate?.blockers?.join("; ") || "触发数据或风控熔断阻断",
      };
    }

    const validEvSignals = Array.isArray(quant.positive_ev_signals) ? quant.positive_ev_signals : [];
    const researchSignals = Array.isArray(quant.research_candidate_signals) ? quant.research_candidate_signals : [];
    if (validEvSignals.length > 0) {
      const maxEv = Math.max(...validEvSignals.map((s) => s.ev));
      return {
        status: "BETTABLE",
        hasAi: false,
        label: "生产级(+EV)",
        badgeClass: "bg-emerald-950/60 text-emerald-300 border-emerald-500/60",
        reason: `机器初筛 ${validEvSignals.length}项生产+EV (最高 +${(maxEv * 100).toFixed(1)}%)`,
      };
    }
    if (researchSignals.length > 0) {
      const maxEv = Math.max(...researchSignals.map((s) => s.ev));
      return {
        status: "BETTABLE",
        hasAi: false,
        label: "冷启动研究(+EV)",
        badgeClass: "bg-sky-950/60 text-sky-300 border-sky-500/60",
        reason: `冷启动初筛 ${researchSignals.length}项研究+EV (最高 +${(maxEv * 100).toFixed(1)}%)`,
      };
    }
    return {
      status: "WAITING",
      hasAi: false,
      label: "观望待定",
      badgeClass: "bg-slate-800 text-slate-400 border-slate-700",
      reason: "全盘无正期望项",
    };
  }

  return {
    status: "WAITING",
    hasAi: false,
    label: "待评估",
    badgeClass: "bg-slate-800 text-slate-500 border-slate-700",
    reason: "数据缺失",
  };
}

/**
 * 校验比赛是否具备串关资格
 */
export function isMatchQualifiedForParlay(
  matchId: string,
  matches: CanonicalMatch[],
  aiEvaluations: any[]
): boolean {
  const matchObj = matches.find((m) => m.canonical_id === matchId);
  if (matchObj) {
    const foundEval = findAiEvaluationForMatch(matchObj, aiEvaluations);
    if (foundEval) {
      const grade = String(foundEval.grade || foundEval.grade_raw || "").toUpperCase();
      return grade === "A" || grade === "B" || grade === "A_GRADE" || grade === "B_GRADE";
    }
  }
  return false;
}

import React, { useState } from "react";
import {
  Clock,
  Activity,
  CheckCircle,
  AlertTriangle,
  Zap,
  ShieldCheck,
  Shield,
  XCircle,
  TrendingUp,
  Sparkles,
  PlusCircle,
  CheckCircle2,
  Target,
  ChevronUp,
  ChevronDown,
  FileCode,
  BarChart2,
  Users,
  Code,
  Trophy,
  Info,
  FileJson,
  CheckCheck,
  Copy,
  Download,
  ShieldAlert,
} from "lucide-react";
import {
  CanonicalMatch,
  AiEvaluationBrief,
} from "../../../refactor/02_canonical_model/types";
import {
  DataCompletenessTier,
  MatchStage,
  MatchAlignmentStatus,
} from "../../../refactor/02_canonical_model/enums";
import { QuantitativeFeatures } from "../../../refactor/03_quant_engine/types";
import { flattenMomentumPoints } from "../../../refactor/03_quant_engine/momentumQuantEngine";
import {
  MachineQuantEvaluationPanel,
  getQuantScreeningDecision,
} from "../MachineQuantEvaluationPanel";
import { QuantBettingDecisionMatrix } from "../QuantBettingDecisionMatrix";
import { TimelineIncidentLegend } from "../TimelineIncidentBadge";
import { GenericTimelineEventPin } from "../IncidentIconsHelper";
import { RecentFormComparator } from "../RecentFormComparator";
import { getMarketsSummary } from "./types";

export interface MatchDecisionStatusResult {
  status: "BETTABLE" | "BLOCKED" | "WAITING";
  hasAi: boolean;
  label: string;
  badgeClass: string;
  reason: string;
}

export interface CanonicalMatchCardProps {
  match: CanonicalMatch;
  idx: number;
  quant: QuantitativeFeatures | null;
  aiEval: any;
  brief: AiEvaluationBrief | null;
  formalLedger: any[];
  expandedMatchId: string | null;
  setExpandedMatchId: (id: string | null) => void;
  activeTabByMatch: Record<string, string>;
  setActiveTabByMatch: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  cardJsonSubTab: Record<string, "input" | "output">;
  setCardJsonSubTab: React.Dispatch<React.SetStateAction<Record<string, "input" | "output">>>;
  copiedKey: string | null;
  appendingLedgerIds: Record<string, boolean>;
  onAppendToLedger: (match: CanonicalMatch, aiEval: any) => void;
  onOpenAiModal: (matchId: string) => void;
  onSelectBrief: (match: CanonicalMatch, brief: AiEvaluationBrief | null) => void;
  onOpenDiagnosticModal: (match: CanonicalMatch) => void;
  onCopyMatchInput: (match: CanonicalMatch) => void;
  onDownloadMatchInput: (match: CanonicalMatch) => void;
  onCopyMatchOutput: (match: CanonicalMatch) => void;
  onDownloadMatchOutput: (match: CanonicalMatch) => void;
  getMatchDecisionStatus: (m: CanonicalMatch) => MatchDecisionStatusResult;
}

export function getTierBadge(tier: DataCompletenessTier) {
  switch (tier) {
    case DataCompletenessTier.TIER_1_FULL:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/50">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          TIER 1 (全维度)
        </span>
      );
    case DataCompletenessTier.TIER_2_BASIC:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/50">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          TIER 2 (基础)
        </span>
      );
    case DataCompletenessTier.TIER_3_SPARSE:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-950/60 text-orange-300 border border-orange-500/50">
          <Clock className="w-3.5 h-3.5 text-orange-400" />
          TIER 3 (稀疏)
        </span>
      );
    case DataCompletenessTier.TIER_INVALID:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-500/50">
          <XCircle className="w-3.5 h-3.5 text-rose-400" />
          TIER INVALID (冲突熔断)
        </span>
      );
    default:
      return null;
  }
}

export function resolveH2HTeamName(
  teamId: number | string | null | undefined,
  match: CanonicalMatch
): { name: string; isCurrent: "home" | "away" | "other" } {
  if (teamId === null || teamId === undefined) {
    return { name: "未知队伍", isCurrent: "other" };
  }
  const homeStandingsId = match.reference?.league_standings?.home_team?.team_id;
  if (homeStandingsId && Number(homeStandingsId) === Number(teamId)) {
    return { name: match.reference?.leisu_home_name || match.home_team_name, isCurrent: "home" };
  }

  const awayStandingsId = match.reference?.league_standings?.away_team?.team_id;
  if (awayStandingsId && Number(awayStandingsId) === Number(teamId)) {
    return { name: match.reference?.leisu_away_name || match.away_team_name, isCurrent: "away" };
  }

  const homeStarterTeamId = match.reference?.lineups?.home_starters?.[0]?.team_id;
  if (homeStarterTeamId && Number(homeStarterTeamId) === Number(teamId)) {
    return { name: match.reference?.leisu_home_name || match.home_team_name, isCurrent: "home" };
  }

  const awayStarterTeamId = match.reference?.lineups?.away_starters?.[0]?.team_id;
  if (awayStarterTeamId && Number(awayStarterTeamId) === Number(teamId)) {
    return { name: match.reference?.leisu_away_name || match.away_team_name, isCurrent: "away" };
  }

  const recentHome = match.reference?.tactical_context?.home_recent_matches || [];
  const recentAway = match.reference?.tactical_context?.away_recent_matches || [];
  for (const r of [...recentHome, ...recentAway]) {
    if (r.home_team_id === teamId && r.home_team_name) {
      const isH = r.home_team_name === match.reference?.leisu_home_name;
      const isA = r.home_team_name === match.reference?.leisu_away_name;
      return { name: r.home_team_name, isCurrent: isH ? "home" : isA ? "away" : "other" };
    }
    if (r.away_team_id === teamId && r.away_team_name) {
      const isH = r.away_team_name === match.reference?.leisu_home_name;
      const isA = r.away_team_name === match.reference?.leisu_away_name;
      return { name: r.away_team_name, isCurrent: isH ? "home" : isA ? "away" : "other" };
    }
  }

  return { name: `队伍(ID:${teamId})`, isCurrent: "other" };
}

export const CanonicalMatchCard: React.FC<CanonicalMatchCardProps> = ({
  match: m,
  idx,
  quant,
  aiEval,
  brief,
  formalLedger,
  expandedMatchId,
  setExpandedMatchId,
  activeTabByMatch,
  setActiveTabByMatch,
  cardJsonSubTab,
  setCardJsonSubTab,
  copiedKey,
  appendingLedgerIds,
  onAppendToLedger,
  onOpenAiModal,
  onSelectBrief,
  onOpenDiagnosticModal,
  onCopyMatchInput,
  onDownloadMatchInput,
  onCopyMatchOutput,
  onDownloadMatchOutput,
  getMatchDecisionStatus,
}) => {
  const [hoveredTimelineMinute, setHoveredTimelineMinute] = useState<number | null>(null);

  // 计算量化筛查决策
  let quantDecision: any = null;
  let quantError: string | null = null;
  let isAlignmentPending = false;

  if (quant) {
    try {
      quantDecision = getQuantScreeningDecision(quant);
    } catch (err: any) {
      quantError = err.message || String(err);
    }
  } else {
    const alignStatus = m.alignment?.status;
    if (alignStatus === MatchAlignmentStatus.NEEDS_MANUAL_SELECTION) {
      isAlignmentPending = true;
      quantError =
        "赛事处于待人工确认对齐状态 (NEEDS_MANUAL_SELECTION)。请在上方“待核验对齐”面板确认匹配或在别名管理建立映射，确认后系统将激活 Layer 03 确定性量化特征计算。";
    } else if (alignStatus === MatchAlignmentStatus.SWAPPED_HOME_AWAY || m.alignment?.is_swapped_suspected) {
      quantError = "⚠️ 严重警报：检测到主客场颠倒！已触发物理安全熔断，强制阻断量化与推荐。";
    } else if (alignStatus === MatchAlignmentStatus.UNMATCHED) {
      quantError = "赛事未匹配到雷速数据源，缺少必要攻防数据与物理统计支撑，量化定价已安全阻断。";
    } else if (m.timing?.stage === MatchStage.LIVE && (m.timing.minute === null || m.timing.minute === undefined)) {
      quantError = "滚球赛事缺少有效进行分钟数，阻断时间衰减泊松定价。";
    } else if ((m.timing?.stage === MatchStage.LIVE || m.timing?.stage === MatchStage.FINISHED) && !m.score?.score_verified) {
      quantError = "滚球比分未通过一致性核验，阻断量化定价。";
    } else {
      quantError = "量化特征未就绪";
    }
  }

  // 预先提取 6 维技术统计特征
  const homePoss =
    m.reference?.stats?.possession?.home !== null && m.reference?.stats?.possession?.home !== undefined
      ? `${m.reference.stats.possession.home}%`
      : "-";
  const awayPoss =
    m.reference?.stats?.possession?.away !== null && m.reference?.stats?.possession?.away !== undefined
      ? `${m.reference.stats.possession.away}%`
      : "-";
  const homeDa = m.reference?.stats?.dangerous_attacks?.home ?? "-";
  const awayDa = m.reference?.stats?.dangerous_attacks?.away ?? "-";
  const homeShots = m.reference?.stats?.shots?.home ?? "-";
  const homeSoT =
    m.reference?.stats?.shots_on_target?.home !== undefined && m.reference?.stats?.shots_on_target?.home !== null
      ? `(${m.reference.stats.shots_on_target.home})`
      : "";
  const awayShots = m.reference?.stats?.shots?.away ?? "-";
  const awaySoT =
    m.reference?.stats?.shots_on_target?.away !== undefined && m.reference?.stats?.shots_on_target?.away !== null
      ? `(${m.reference.stats.shots_on_target.away})`
      : "";
  const homeCorners = m.reference?.stats?.corners?.home ?? "-";
  const awayCorners = m.reference?.stats?.corners?.away ?? "-";
  const homeYc = m.reference?.stats?.yellow_cards?.home ?? (m.reference?.stats ? 0 : "-");
  const awayYc = m.reference?.stats?.yellow_cards?.away ?? (m.reference?.stats ? 0 : "-");
  const homeRc = m.reference?.stats?.red_cards?.home ?? (m.reference?.stats ? 0 : "-");
  const awayRc = m.reference?.stats?.red_cards?.away ?? (m.reference?.stats ? 0 : "-");

  // 收集并按分钟聚合关键事件
  const eventsByMinute = new Map<number, { home: any[]; away: any[]; neutral: any[] }>();
  if (m.reference?.timeline_events && Array.isArray(m.reference.timeline_events)) {
    for (const ev of m.reference.timeline_events) {
      if (ev.minute !== null && ev.minute !== undefined && ev.minute > 0) {
        const min = Math.min(120, Math.max(1, ev.minute));
        const entry = eventsByMinute.get(min) || { home: [], away: [], neutral: [] };
        const isHome =
          ev.side === "home" ||
          ev.text?.includes("主队") ||
          (Boolean(m.reference?.leisu_home_name) && Boolean(ev.text?.includes(m.reference.leisu_home_name)));
        const isAway =
          ev.side === "away" ||
          ev.text?.includes("客队") ||
          (Boolean(m.reference?.leisu_away_name) && Boolean(ev.text?.includes(m.reference.leisu_away_name)));
        if (isHome) {
          entry.home.push(ev);
        } else if (isAway) {
          entry.away.push(ev);
        } else {
          entry.neutral.push(ev);
        }
        eventsByMinute.set(min, entry);
      }
    }
  }

  const points = flattenMomentumPoints(m);
  const hasPoints = points.length > 0;

  // 统计主客攻势强度
  let homeIntensity = 0;
  let awayIntensity = 0;
  points.forEach((val) => {
    if (val > 0) homeIntensity += val;
    else if (val < 0) awayIntensity += Math.abs(val);
  });
  const totalIntensity = homeIntensity + awayIntensity;
  const homeShare = totalIntensity > 0 ? Math.round((homeIntensity / totalIntensity) * 100) : 50;
  const awayShare = totalIntensity > 0 ? 100 - homeShare : 50;

  // 近15分钟动量态势
  const recentPoints = points.slice(-15);
  let recentHome = 0;
  let recentAway = 0;
  recentPoints.forEach((val) => {
    if (val > 0) recentHome += val;
    else if (val < 0) recentAway += Math.abs(val);
  });
  const surgeType =
    recentHome > recentAway * 1.5 && recentHome > 100
      ? "home"
      : recentAway > recentHome * 1.5 && recentAway > 100
      ? "away"
      : "neutral";
  const surgeLabel =
    surgeType === "home" ? "主队近15m猛攻" : surgeType === "away" ? "客队近15m猛攻" : "双方近15m均势";

  const maxTimelineMinute = Math.max(
    90,
    points.length,
    ...(eventsByMinute.size > 0 ? Array.from(eventsByMinute.keys()) : [0])
  );

  const dec = getMatchDecisionStatus(m);

  return (
    <div
      id={`match-card-${idx}`}
      className="bg-slate-900 rounded-xl p-5 border border-slate-800 hover:border-blue-500/50 shadow-sm transition-all space-y-4"
    >
      {/* 卡片头部：联赛（别名简称） 开赛时间（来源） 比赛时间（来源） */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5 flex-wrap text-xs">
          {/* 联赛名（雷速别名简称） */}
          <span className="font-semibold px-2 py-0.5 bg-slate-800 text-slate-200 rounded border border-slate-700">
            {m.league_name}
            {m.reference?.leisu_league_name && m.reference.leisu_league_name !== m.league_name
              ? `（${m.reference.leisu_league_name}）`
              : ""}
          </span>

          {/* 开赛时间（来源） */}
          <span className="text-slate-400 flex items-center gap-1 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-bold">开赛 {m.timing.beijing_start_time || "-"}</span>
            <span className="text-slate-500 text-[11px]">
              （{m.timing.start_time_source === "LEISU_SUPPLEMENTED" ? "雷速" : m.timing.start_time_source === "YBTY_ESTIMATED" ? "YBTY推算" : "YBTY"}）
            </span>
          </span>

          {/* 比赛时间（来源） */}
          <span className="text-slate-400 flex items-center gap-1 font-mono">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            {m.timing.stage === MatchStage.LIVE ? (
              <span className="text-rose-400 font-bold">
                比赛时间 {m.timing.ybty_display_clock || (m.timing.minute !== null && m.timing.minute !== undefined ? `${m.timing.minute}'` : "滚球中")}
              </span>
            ) : (
              <span className="text-slate-400">比赛时间 未开赛</span>
            )}
            <span className="text-slate-500 text-[11px]">
              （{m.timing.stage === MatchStage.LIVE ? "YBTY" : "赛前"}）
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 核心风控与决策状态胶囊 */}
          <button
            id={`btn-match-decision-badge-${idx}`}
            onClick={() => {
              setExpandedMatchId(expandedMatchId === m.canonical_id ? null : m.canonical_id);
              setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: aiEval ? "ai" : "quant" }));
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all shadow-xs ${dec.badgeClass} hover:opacity-90`}
            title={`风控与开仓状态: ${dec.label} (${dec.reason}) - 点击展开详情`}
          >
            {dec.status === "BETTABLE" ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
            ) : dec.status === "BLOCKED" ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{dec.label}</span>
          </button>

          {/* 03 机器量化初筛定级徽章入口 */}
          <button
            id={`btn-open-quant-header-${idx}`}
            onClick={() => {
              const isCurrentlyQuant =
                expandedMatchId === m.canonical_id && (activeTabByMatch[m.canonical_id] || "quant") === "quant";
              if (isCurrentlyQuant) {
                setExpandedMatchId(null);
              } else {
                setExpandedMatchId(m.canonical_id);
                setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: "quant" }));
                setTimeout(() => {
                  const el = document.getElementById(`match-card-${idx}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 60);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all shadow-2xs ${
              quantDecision?.bgClass || "bg-slate-800"
            } ${quantDecision?.colorClass || "text-slate-400"} ${quantDecision?.borderClass || "border-slate-700"} hover:opacity-90`}
            title="点击展开查看 Layer 03 机器量化评估与最优投注"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{quantDecision ? quantDecision.badge : "无法评估"}</span>
            <span className="font-mono text-[11px] opacity-80">
              (BDI: {quant ? (quant.battlefield_dominance_index > 0 ? `+${quant.battlefield_dominance_index.toFixed(0)}` : quant.battlefield_dominance_index.toFixed(0)) : "N/A"})
            </span>
          </button>

          {quant?.production_gate && (
            <button
              onClick={() => {
                setExpandedMatchId(m.canonical_id);
                setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: "diagnostics" }));
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                quant.production_gate.calculation_status === "PRODUCTION_READY"
                  ? "bg-emerald-950/60 text-emerald-300 border-emerald-700"
                  : quant.production_gate.calculation_status === "RESEARCH_ONLY"
                  ? "bg-amber-950/60 text-amber-300 border-amber-700"
                  : "bg-rose-950/60 text-rose-300 border-rose-700"
              }`}
              title="点击查看本场 Layer 03 生产准入明细"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {quant.production_gate.calculation_status === "PRODUCTION_READY"
                  ? "生产准入"
                  : quant.production_gate.calculation_status === "RESEARCH_ONLY"
                  ? "研究模式"
                  : "生产阻断"}
              </span>
              <span className="font-mono text-[10px] opacity-80">
                · {quant.production_gate.candidate_status === "UNLOCKED" ? "候选解锁" : "候选锁定"}
              </span>
            </button>
          )}

          {/* 数据完整度定级 */}
          {getTierBadge(m.completeness_tier)}

          {/* 缺口全维体检入口按钮 */}
          <button
            id={`btn-open-diagnostic-${idx}`}
            onClick={() => {
              if (expandedMatchId === m.canonical_id && (activeTabByMatch[m.canonical_id] || "quant") === "diagnostics") {
                setExpandedMatchId(null);
              } else {
                setExpandedMatchId(m.canonical_id);
                setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: "diagnostics" }));
                setTimeout(() => {
                  const el = document.getElementById(`match-card-${idx}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 60);
              }
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
              m.missing_reasons.length > 0
                ? "bg-amber-950/60 text-amber-300 border-amber-700 hover:bg-amber-900/60"
                : "bg-emerald-950/60 text-emerald-300 border-emerald-700 hover:bg-emerald-900/60"
            }`}
            title="点击就地展开 11 维核心数据特征就绪体检清单"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>
              {m.missing_reasons.length > 0 ? `缺口体检 (${m.missing_reasons.length}项)` : "11维体检全齐"}
            </span>
          </button>

          {/* AI 终审动作按钮 */}
          {aiEval ? (
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  String(aiEval.grade || aiEval.grade_raw || "").toUpperCase().startsWith("A")
                    ? "bg-emerald-950 text-emerald-300 border-emerald-500/80"
                    : String(aiEval.grade || aiEval.grade_raw || "").toUpperCase().startsWith("B")
                    ? "bg-blue-950 text-blue-300 border-blue-500/80"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>AI: {aiEval.grade || aiEval.grade_raw || "B"}级</span>
              </span>

              {formalLedger.some(
                (r) =>
                  r.canonical_match_id === m.canonical_id ||
                  r.record_id?.includes(m.canonical_id) ||
                  (r.teams?.home === m.home_team_name && r.teams?.away === m.away_team_name)
              ) ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>已入台账</span>
                </span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAppendToLedger(m, aiEval);
                  }}
                  disabled={appendingLedgerIds[m.canonical_id]}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white transition-all shadow-xs"
                  title="点击将本场合格推荐写入重构正式台账"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{appendingLedgerIds[m.canonical_id] ? "正在入账..." : "写入正式台账"}</span>
                </button>
              )}
            </div>
          ) : (
            <button
              id={`btn-eval-ai-${idx}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenAiModal(m.canonical_id);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800 transition-colors"
              title="提取本场比赛生成 AI 评估 Prompt"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>AI评估</span>
            </button>
          )}
        </div>
      </div>

      {/* 核心看板区：比分队名与实时危攻时序走势 */}
      <div className="bg-slate-950/80 p-3.5 sm:p-4 rounded-xl border border-slate-800 flex flex-col space-y-3 shadow-sm">
        {/* 1. 顶部：双源队名、实时比分与即时攻防胶囊 */}
        <div className="grid grid-cols-12 items-center gap-2 sm:gap-3 pb-3 border-b border-slate-800/80">
          {/* 左侧：主队信息与即时攻防指标 */}
          <div className="col-span-5 flex items-center justify-between gap-2 overflow-hidden">
            <div className="flex flex-col justify-center min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-blue-950 text-blue-300 border border-blue-800/80 shrink-0">
                  YBTY
                </span>
                <span className="font-bold text-slate-100 text-sm sm:text-base truncate" title={m.home_team_name}>
                  {m.home_team_name}
                </span>
                {homeRc !== "-" && Number(homeRc) > 0 && (
                  <span className="px-1 py-0.2 text-[10px] font-bold rounded bg-rose-950 text-rose-300 border border-rose-800 shrink-0" title={`主队红牌 ${homeRc} 张`}>
                    🟥 {homeRc}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pl-0.5 overflow-hidden">
                <span className="px-1.5 py-0.2 text-[10px] font-medium rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 shrink-0">
                  雷速
                </span>
                <span className="truncate text-slate-300 text-[11.5px]" title={m.reference?.leisu_home_name || "未关联"}>
                  {m.reference?.leisu_home_name || <span className="text-slate-500 italic">未关联</span>}
                </span>
                <span className="text-[10px] text-slate-500 font-mono px-1 rounded bg-slate-900 border border-slate-800/80 shrink-0">
                  主场
                </span>
              </div>
            </div>

            {m.timing.stage === MatchStage.LIVE && m.reference?.stats && (
              <div className="hidden sm:flex flex-col items-end gap-0.5 text-[10.5px] font-mono shrink-0 pl-1 border-r border-slate-800/60 pr-2">
                <span className="text-amber-400 font-semibold">危攻 {homeDa}</span>
                <span className="text-slate-400 text-[10px]">控球 {homePoss}</span>
              </div>
            )}
          </div>

          {/* 中间：比赛时间、实时比分、对齐状态图标 */}
          <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
            <div className="mb-1 flex items-center justify-center">
              {m.timing.stage === MatchStage.LIVE ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {m.timing.minute !== null && m.timing.minute !== undefined ? `${m.timing.minute}'` : "进行中"}
                </span>
              ) : (
                <span className="text-[10.5px] text-slate-400 font-mono">
                  {m.timing.beijing_start_time ? m.timing.beijing_start_time.split(" ")[1] || m.timing.beijing_start_time : m.timing.ybty_display_clock || "未开赛"}
                </span>
              )}
            </div>

            <div className="px-3 py-1 bg-slate-900 rounded-lg border border-slate-700 shadow-inner flex items-center justify-center gap-1.5 sm:gap-2">
              <span className="text-lg sm:text-xl font-mono font-black tracking-wider text-slate-100 whitespace-nowrap">
                {m.score.home_score !== null ? m.score.home_score : 0} : {m.score.away_score !== null ? m.score.away_score : 0}
              </span>
              
              {m.reference ? (
                <span
                  title={m.score.score_verified ? "已对齐雷速赛事 · 比分画布已校验" : "已对齐雷速赛事"}
                  className="inline-flex items-center"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </span>
              ) : (
                <span title="未对齐雷速赛事数据" className="inline-flex items-center">
                  <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                </span>
              )}
            </div>
          </div>

          {/* 右侧：客队信息与即时攻防指标 */}
          <div className="col-span-5 flex items-center justify-between gap-2 overflow-hidden text-right">
            {m.timing.stage === MatchStage.LIVE && m.reference?.stats && (
              <div className="hidden sm:flex flex-col items-start gap-0.5 text-[10.5px] font-mono shrink-0 pr-1 border-l border-slate-800/60 pl-2">
                <span className="text-purple-400 font-semibold">危攻 {awayDa}</span>
                <span className="text-slate-400 text-[10px]">控球 {awayPoss}</span>
              </div>
            )}

            <div className="flex flex-col justify-center items-end min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-end gap-1.5 overflow-hidden w-full">
                {awayRc !== "-" && Number(awayRc) > 0 && (
                  <span className="px-1 py-0.2 text-[10px] font-bold rounded bg-rose-950 text-rose-300 border border-rose-800 shrink-0" title={`客队红牌 ${awayRc} 张`}>
                    🟥 {awayRc}
                  </span>
                )}
                <span className="font-bold text-slate-100 text-sm sm:text-base truncate" title={m.away_team_name}>
                  {m.away_team_name}
                </span>
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-blue-950 text-blue-300 border border-blue-800/80 shrink-0">
                  YBTY
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5 text-xs text-slate-400 pr-0.5 overflow-hidden w-full">
                <span className="text-[10px] text-slate-500 font-mono px-1 rounded bg-slate-900 border border-slate-800/80 shrink-0">
                  客场
                </span>
                <span className="truncate text-right text-slate-300 text-[11.5px]" title={m.reference?.leisu_away_name || "未关联"}>
                  {m.reference?.leisu_away_name || <span className="text-slate-500 italic">未关联</span>}
                </span>
                <span className="px-1.5 py-0.2 text-[10px] font-medium rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 shrink-0">
                  雷速
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. 中部标题栏与攻势占比 */}
        <div className="flex items-center justify-between text-xs pt-0.5">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>实时危攻时序走势</span>
            {m.reference?.attack_momentum?.segment_count ? (
              <span className="text-[10px] text-slate-500 font-mono">
                ({m.reference.attack_momentum.segment_count}段波形)
              </span>
            ) : null}
          </div>

          {hasPoints ? (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-amber-400 font-bold">主 {homeShare}%</span>
              <span className="text-slate-600">:</span>
              <span className="text-purple-400 font-bold">客 {awayShare}%</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  surgeType === "home"
                    ? "bg-amber-950 text-amber-300 border border-amber-800"
                    : surgeType === "away"
                    ? "bg-purple-950 text-purple-300 border border-purple-800"
                    : "bg-slate-800 text-slate-300 border border-slate-700"
                }`}
              >
                {surgeLabel}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-slate-500">
              {m.timing.stage === MatchStage.LIVE
                ? m.reference?.stats
                  ? "技术统计已对齐"
                  : "雷速监听中"
                : "赛前待开赛"}
            </span>
          )}
        </div>

        {/* 3. 事件图标说明栏 */}
        <TimelineIncidentLegend homeName={m.home_team_name} awayName={m.away_team_name} />

        {/* 4. 专业时序走势图 */}
        {hasPoints || eventsByMinute.size > 0 ? (
          <div
            className="relative w-full bg-slate-950/95 rounded-xl p-2.5 border border-slate-800/80 select-none shadow-inner flex flex-col gap-1.5"
            onMouseLeave={() => setHoveredTimelineMinute(null)}
          >
            {/* Top Lane: 主队事件行 */}
            <div className="relative w-full h-6 bg-slate-900/50 rounded border border-slate-800/60 flex items-center px-1.5">
              <span className="text-[9px] font-bold text-emerald-400 shrink-0 select-none pr-1.5 border-r border-slate-800">
                主队
              </span>
              <div className="relative flex-1 h-full">
                {Array.from(eventsByMinute.entries()).map(([min, entry]) => {
                  if (entry.home.length === 0) return null;
                  return (
                    <GenericTimelineEventPin
                      key={`home-${min}`}
                      minute={min}
                      maxMinute={maxTimelineMinute}
                      events={entry.home}
                      teamName={m.home_team_name}
                      side="home"
                      momentumVal={points[min - 1] || 0}
                    />
                  );
                })}
              </div>
            </div>

            {/* Center Lane: 纯净波形轨道 */}
            <div className="relative w-full h-22 bg-slate-950 rounded-lg border border-slate-800/80 overflow-hidden">
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-700/60 z-0"></div>

              {[15, 30, 45, 60, 75, 90].map((tMin) => {
                if (tMin > maxTimelineMinute) return null;
                const leftPct = (tMin / maxTimelineMinute) * 100;
                const isHT = tMin === 45;
                return (
                  <div key={tMin} className="absolute top-0 bottom-0 pointer-events-none z-0" style={{ left: `${leftPct}%` }}>
                    <div
                      className={`h-full w-[1px] ${
                        isHT ? "border-r border-indigo-500/50" : "border-r border-dashed border-slate-800/80"
                      }`}
                    ></div>
                    <span
                      className={`absolute top-1 -translate-x-1/2 text-[9px] font-mono px-0.5 rounded select-none ${
                        isHT ? "text-indigo-300 font-bold bg-indigo-950/80" : "text-slate-500 bg-slate-950/60"
                      }`}
                    >
                      {isHT ? "HT" : `${tMin}'`}
                    </span>
                  </div>
                );
              })}

              {hasPoints && (
                <svg
                  className="w-full h-full overflow-visible"
                  viewBox={`0 0 ${maxTimelineMinute} 100`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id={`grad-home-${m.canonical_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.1" />
                    </linearGradient>
                    <linearGradient id={`grad-away-${m.canonical_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.1" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.8" />
                    </linearGradient>
                  </defs>

                  {points.map((val, idxPt) => {
                    const min = idxPt + 1;
                    const clamped = Math.max(-100, Math.min(100, val));
                    const isPositive = clamped >= 0;
                    const height = (Math.abs(clamped) / 100) * 48;
                    const y = isPositive ? 50 - height : 50;

                    return (
                      <rect
                        key={min}
                        x={min - 0.7}
                        y={y}
                        width="0.8"
                        height={Math.max(1, height)}
                        fill={isPositive ? `url(#grad-home-${m.canonical_id})` : `url(#grad-away-${m.canonical_id})`}
                        className="transition-all hover:opacity-80"
                      />
                    );
                  })}
                </svg>
              )}
            </div>

            {/* Bottom Lane: 客队事件行 */}
            <div className="relative w-full h-6 bg-slate-900/50 rounded border border-slate-800/60 flex items-center px-1.5">
              <span className="text-[9px] font-bold text-amber-400 shrink-0 select-none pr-1.5 border-r border-slate-800">
                客队
              </span>
              <div className="relative flex-1 h-full">
                {Array.from(eventsByMinute.entries()).map(([min, entry]) => {
                  if (entry.away.length === 0) return null;
                  return (
                    <GenericTimelineEventPin
                      key={`away-${min}`}
                      minute={min}
                      maxMinute={maxTimelineMinute}
                      events={entry.away}
                      teamName={m.away_team_name}
                      side="away"
                      momentumVal={points[min - 1] || 0}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-center text-xs text-slate-500">
            {m.timing.stage === MatchStage.LIVE ? "暂无时序波形 · 正在监听雷速端..." : "赛前待开赛 · 开赛后自动捕获逐分钟危攻波形"}
          </div>
        )}

        {/* 5. 底部：完整六维实时攻防技术统计 */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono pt-2 border-t border-slate-800/60">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 text-slate-300 shadow-2xs hover:border-slate-700 transition-colors">
              <span className="text-slate-400 font-sans text-[11px]">控球率:</span>
              <span className="font-bold text-slate-100">{homePoss}:{awayPoss}</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 shadow-2xs hover:border-slate-700 transition-colors">
              <span className="text-slate-400 font-sans text-[11px]">危攻:</span>
              <span className="font-bold">
                <span className="text-amber-400">{homeDa}</span>
                <span className="text-slate-500 mx-0.5">:</span>
                <span className="text-purple-400">{awayDa}</span>
              </span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 text-slate-300 shadow-2xs hover:border-slate-700 transition-colors">
              <span className="text-slate-400 font-sans text-[11px]">射门（射正）:</span>
              <span className="font-bold text-slate-100">{homeShots}{homeSoT}:{awayShots}{awaySoT}</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 text-slate-300 shadow-2xs hover:border-slate-700 transition-colors">
              <span className="text-slate-400 font-sans text-[11px]">角球:</span>
              <span className="font-bold text-slate-100">{homeCorners}:{awayCorners}</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 shadow-2xs hover:border-slate-700 transition-colors">
              <span className="text-slate-400 font-sans text-[11px]">黄牌:</span>
              <span className="font-bold text-amber-300">{homeYc}:{awayYc}</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 shadow-2xs hover:border-slate-700 transition-colors">
              <span className="text-slate-400 font-sans text-[11px]">红牌:</span>
              <span className="font-bold text-rose-400">{homeRc}:{awayRc}</span>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 shrink-0 self-center">
            {points.length > 0 ? `已采集 ${points.length} 分钟波形` : m.reference?.stats ? "技术统计已对齐" : "待同步"}
          </div>
        </div>
      </div>

      {/* 机器量化评估与下注决策矩阵 */}
      <div className="pt-2">
        {!quantError && quant && (
          <QuantBettingDecisionMatrix
            match={m}
            quant={quant}
            aiEval={aiEval}
            showHeader={false}
          />
        )}
      </div>

      {/* 操作栏与明细展开入口 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            模型置信度: <strong className="text-emerald-400">{quant ? quant.confidence_score : "N/A"}分</strong>
            {quant && quant.positive_ev_signals && quant.positive_ev_signals.length > 0 ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {quant.positive_ev_signals.length}项生产+EV
              </span>
            ) : quant && quant.research_candidate_signals && quant.research_candidate_signals.length > 0 ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                {quant.research_candidate_signals.length}项研究+EV
              </span>
            ) : (
              <span className="text-slate-500 text-[10px]">{quant ? "无+EV" : isAlignmentPending ? "待核验对齐" : "门禁拦截"}</span>
            )}
          </span>

          {aiEval && (() => {
            const grade = String(aiEval.grade || aiEval.grade_raw || "").toUpperCase();
            const isQual = grade.startsWith("A") || grade.startsWith("B");
            const isTrap =
              aiEval.blind_spot_analysis?.trap_detection_result === "CONFIRMED_TRAP" ||
              aiEval.trap_detection_result === "CONFIRMED_TRAP" ||
              aiEval.market_scan?.rejection_reason?.includes("TRAP");
            return (
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 border shadow-xs ${
                  isTrap
                    ? "bg-rose-950/70 text-rose-300 border-rose-600/80 ring-1 ring-rose-500/20"
                    : isQual
                    ? "bg-emerald-950/70 text-emerald-300 border-emerald-500/80 ring-1 ring-emerald-500/20"
                    : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                AI终审: {grade}级 ({aiEval.confidence_score ?? aiEval.conf ?? "-"}分)
                {isTrap ? " · 🚫排雷阻断(严禁开仓)" : isQual ? " · 🎯实战准入" : " · ⚠️仅供参考"}
              </span>
            );
          })()}
        </div>

        {/* 右侧查看与展开操作按钮 */}
        <div className="flex items-center gap-2 flex-wrap">
          {aiEval && (() => {
            const isCurrentlyAiTab =
              expandedMatchId === m.canonical_id && activeTabByMatch[m.canonical_id] === "ai";
            return (
              <button
                id={`btn-view-ai-eval-${idx}`}
                onClick={() => {
                  const isExpanding = !isCurrentlyAiTab;
                  setExpandedMatchId(isExpanding ? m.canonical_id : null);
                  setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: "ai" }));
                  if (isExpanding) {
                    setTimeout(() => {
                      const el = document.getElementById(`match-card-${idx}`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 60);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all border shadow-sm ${
                  isCurrentlyAiTab
                    ? "bg-indigo-600 text-white border-indigo-400 shadow-inner ring-1 ring-indigo-300"
                    : "bg-indigo-950/70 hover:bg-indigo-900 text-indigo-200 border-indigo-600/80"
                }`}
                title="一键直达本场 AI 终审报告与推荐台账"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>AI 终审报告</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500 text-white font-extrabold">
                  {aiEval.grade || aiEval.grade_raw || "B"}级
                </span>
              </button>
            );
          })()}

          {/* 快捷查看 03 机器量化 */}
          <button
            id={`btn-view-quant-${idx}`}
            onClick={() => {
              const isExpanding =
                expandedMatchId !== m.canonical_id || (activeTabByMatch[m.canonical_id] || "quant") !== "quant";
              setExpandedMatchId(isExpanding ? m.canonical_id : null);
              setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: "quant" }));
              if (isExpanding) {
                setTimeout(() => {
                  const el = document.getElementById(`match-card-${idx}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 60);
              }
            }}
            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-all border ${
              expandedMatchId === m.canonical_id && (activeTabByMatch[m.canonical_id] || "quant") === "quant"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-inner"
                : "bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-700/60"
            }`}
            title="展开查看 Layer 03 确定性量化评估与各玩法最优正期望投注"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>03 机器量化</span>
            {quant && (quant.positive_ev_signals.length > 0 || (quant.research_candidate_signals?.length ?? 0) > 0) && (
              <span
                className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  quant.positive_ev_signals.length > 0 ? "bg-emerald-500 text-slate-950" : "bg-sky-500 text-slate-950"
                }`}
              >
                {quant.positive_ev_signals.length > 0
                  ? quant.positive_ev_signals.length
                  : quant.research_candidate_signals?.length}
              </span>
            )}
          </button>

          {/* 折叠/展开就地多维面板 */}
          <button
            id={`btn-toggle-expand-${idx}`}
            onClick={() => {
              const isExpanding = expandedMatchId !== m.canonical_id;
              setExpandedMatchId(isExpanding ? m.canonical_id : null);
              if (isExpanding && !activeTabByMatch[m.canonical_id]) {
                setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: aiEval ? "ai" : "quant" }));
              }
              if (isExpanding) {
                setTimeout(() => {
                  const el = document.getElementById(`match-card-${idx}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 60);
              }
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-all border ${
              expandedMatchId === m.canonical_id
                ? "bg-slate-800 text-blue-400 border-blue-500/50 shadow-inner"
                : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700"
            }`}
            title="就地展开查看合并后的多维完整数据"
          >
            <span>{expandedMatchId === m.canonical_id ? "收起明细" : "展开明细"}</span>
            {expandedMatchId === m.canonical_id ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {/* 快捷查看 AI 提炼包 */}
          <button
            id={`btn-view-brief-${idx}`}
            onClick={() => onSelectBrief(m, brief)}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            AI 简报
          </button>

          {/* 快捷查看与复制 03 模型数据 */}
          <button
            id={`btn-open-card-03-data-${idx}`}
            onClick={() => {
              setExpandedMatchId(m.canonical_id);
              setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: "json" }));
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors"
            title="展开并查看本场比赛 03 模型接收输入与计算输出 JSON"
          >
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            <span>03数据</span>
          </button>
        </div>
      </div>

      {/* 就地展开的多维数据查看器 */}
      {expandedMatchId === m.canonical_id && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4 animate-in fade-in duration-200">
          {/* 标签栏导航 */}
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/80 flex-wrap">
              {[
                {
                  id: "quant",
                  label: `⚡ 03 机器量化评估与最优投注 (${
                    quant
                      ? quant.positive_ev_signals.length > 0
                        ? `${quant.positive_ev_signals.length}项+EV`
                        : "已评估"
                      : "评估阻断"
                  })`,
                  icon: Zap,
                },
                {
                  id: "ai",
                  label: `🤖 AI 评估与台账${aiEval ? ` (${aiEval.grade}级)` : ""}`,
                  icon: Sparkles,
                },
                {
                  id: "diagnostics",
                  label: `🛡️ 11维体检 (${m.missing_reasons.length > 0 ? `${m.missing_reasons.length}项缺口` : "全齐备"})`,
                  icon: Shield,
                },
                { id: "markets", label: "🎯 YBTY 盘口全集", icon: Target },
                { id: "stats", label: "📊 雷速统计增强", icon: BarChart2 },
                { id: "h2h", label: "⚔️ 近期战绩/交锋/阵容", icon: Users },
                { id: "json", label: "{} 03模型数据 (输入/输出)", icon: Code },
              ].map((tab) => {
                const currentTab = activeTabByMatch[m.canonical_id] || "quant";
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${m.canonical_id}-${tab.id}`}
                    onClick={() =>
                      setActiveTabByMatch((prev) => ({
                        ...prev,
                        [m.canonical_id]: tab.id,
                      }))
                    }
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all ${
                      isActive
                        ? "bg-blue-600 text-white font-semibold shadow-xs"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                    }`}
                  >
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              唯一主键: {m.canonical_id.slice(0, 16)}...
            </div>
          </div>

          {/* TAB 0: ⚡ 03 机器量化评估与最优投注 */}
          {(activeTabByMatch[m.canonical_id] || "quant") === "quant" &&
            (quantError || !quant ? (
              <div
                className={`p-6 rounded-xl border ${
                  isAlignmentPending
                    ? "bg-amber-950/20 border-amber-500/30 text-amber-200"
                    : "bg-red-900/20 border-red-500/30 text-red-200"
                }`}
              >
                <h4 className={`font-semibold mb-2 ${isAlignmentPending ? "text-amber-400" : "text-red-400"}`}>
                  {isAlignmentPending ? "⏳ 赛事待核验对齐" : "模型计算被前置门禁拦截"}
                </h4>
                <p className="text-sm font-mono opacity-80">{quantError}</p>
                <p className="text-xs opacity-60 mt-4">
                  {isAlignmentPending
                    ? "根据系统安全契约，低置信度匹配候选必须先由分析师核验确认，避免错误实体关联导致量化定价与战术推演失真。"
                    : "核心定价要素缺失或触发风控熔断，强行估算会引发严重偏差，故停止对该场比赛进行博弈分析。"}
                </p>
              </div>
            ) : (
              <MachineQuantEvaluationPanel match={m} quant={quant} aiEval={aiEval} />
            ))}

          {/* TAB 1: 🤖 AI 综合评估与台账沉淀 */}
          {activeTabByMatch[m.canonical_id] === "ai" &&
            (() => {
              const inLedger = formalLedger.some(
                (r) =>
                  r.canonical_match_id === m.canonical_id ||
                  r.record_id?.includes(m.canonical_id) ||
                  (r.teams?.home === m.home_team_name && r.teams?.away === m.away_team_name)
              );
              const grade = String(aiEval?.grade || aiEval?.grade_raw || "").toUpperCase();
              const isQual = grade.startsWith("A") || grade.startsWith("B");

              if (!aiEval) {
                return (
                  <div className="p-6 bg-slate-950/70 border border-slate-800 rounded-xl text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-slate-200">本场比赛尚未导入 AI 评估报告</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        您可一键提取本场比赛的标准 Prompt，交由外部专业大模型完成基本面与价值核验，然后将评估结果粘贴导入。
                      </p>
                    </div>
                    <button
                      onClick={() => onOpenAiModal(m.canonical_id)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>一键生成本场 AI 评估 Prompt</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-4 animate-in fade-in duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-3">
                      <div
                        className={`px-3 py-1.5 rounded-lg border text-center ${
                          grade.startsWith("A")
                            ? "bg-emerald-950/80 text-emerald-300 border-emerald-600"
                            : grade.startsWith("B")
                            ? "bg-blue-950/80 text-blue-300 border-blue-600"
                            : "bg-slate-900 text-slate-400 border-slate-700"
                        }`}
                      >
                        <div className="text-[10px] uppercase font-bold text-slate-400">AI 综合定级</div>
                        <div className="text-lg font-black">{aiEval.grade || "N/A"}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-100">
                            置信度分值: {aiEval.confidence_score ?? "未定"}/100
                          </span>
                          {isQual ? (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                              达到正式推荐门槛
                            </span>
                          ) : (
                            <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
                              低于正式推荐门槛 (仅供参考)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 max-w-xl">
                          {aiEval.qualitative_summary || aiEval.analysis || "暂无定性摘要"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {inLedger ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700">
                          <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                          <span>已记录入重构正式台账</span>
                        </span>
                      ) : isQual ? (
                        <button
                          onClick={() => onAppendToLedger(m, aiEval)}
                          disabled={appendingLedgerIds[m.canonical_id]}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white transition-all shadow-xs"
                        >
                          <PlusCircle className="w-4 h-4" />
                          <span>{appendingLedgerIds[m.canonical_id] ? "正在入账..." : "一键写入正式台账"}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                          未达 A/B 级门槛不可入正式台账
                        </span>
                      )}
                    </div>
                  </div>

                  {aiEval.recommended_legs && aiEval.recommended_legs.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-blue-400" />
                        <span>AI 推荐投注腿 (Recommended Legs)</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {aiEval.recommended_legs.map((leg: any, lIdx: number) => (
                          <div
                            key={lIdx}
                            className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-bold text-amber-300 mr-2">
                                {leg.market} {leg.line || leg.selected_line}
                              </span>
                              <span className="text-indigo-300 font-medium mr-2">{leg.direction}</span>
                              <span className="text-slate-400 font-mono">@ {leg.odds || leg.current_odds}</span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {leg.reason ? leg.reason.slice(0, 30) : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-900/50 rounded-lg border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold flex items-center gap-2">
                          <span>AI 审核结论：无合法推荐投注腿 (No Recommended Legs)</span>
                          {aiEval.blind_spot_analysis?.trap_detection_result === "CONFIRMED_TRAP" && (
                            <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded">
                              陷阱诱盘已阻断 (CONFIRMED_TRAP)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {aiEval.grade === "WATCH" || aiEval.grade === "RESEARCH"
                            ? "本场比赛经 AI 盲区审计与赔率价值校验，未达 A/B 级正式出击门槛，本场仅列入观望，不发起任何真实投注。"
                            : "经 AI 实战风控模型核验，本场全部备选盘口均被熔断或排除，严禁下注。"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {aiEval.blind_spot_analysis && (
                      <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 space-y-1">
                        <div className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>盲区与重大风险排查 (Blind Spot Analysis)</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {typeof aiEval.blind_spot_analysis === "string"
                            ? aiEval.blind_spot_analysis
                            : JSON.stringify(aiEval.blind_spot_analysis, null, 2)}
                        </p>
                      </div>
                    )}

                    {aiEval.internal_logical_audit && (
                      <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 space-y-1">
                        <div className="text-xs font-semibold text-blue-300 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>逻辑自洽与赔率价值核验 (Logical Audit)</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {typeof aiEval.internal_logical_audit === "string"
                            ? aiEval.internal_logical_audit
                            : JSON.stringify(aiEval.internal_logical_audit, null, 2)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* TAB 2: 🛡️ 11 维全景体检报告 */}
          {activeTabByMatch[m.canonical_id] === "diagnostics" && (
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-500 font-medium">数据完整度定级 (Tier)</div>
                  <div className="mt-1 flex items-center gap-2">
                    {getTierBadge(m.completeness_tier)}
                    <span className="text-[11px] text-slate-400 font-mono">
                      {m.completeness_tier === DataCompletenessTier.TIER_1_FULL
                        ? "全部特征就绪"
                        : m.completeness_tier === DataCompletenessTier.TIER_2_BASIC
                        ? "基础攻防完备"
                        : "稀疏降级运行"}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-500 font-medium">盘口覆盖与深度</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-400 font-mono">
                      {getMarketsSummary(m.markets).count} 个玩法
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]" title={getMarketsSummary(m.markets).text}>
                      ({getMarketsSummary(m.markets).text})
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-500 font-medium">比分校验真实度</div>
                  <div className="mt-1 text-sm font-bold font-mono">
                    {m.score.score_verified ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4" /> 画布/接口已校验
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center gap-1">
                        <ShieldAlert className="w-4 h-4" /> 未经画布校验
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {quant?.data_audit && (
                <div className="bg-slate-900/80 rounded-lg border border-cyan-900/60 overflow-hidden">
                  <div className="p-3 bg-cyan-950/30 border-b border-cyan-900/60 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm text-cyan-200">03 数据使用审计</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        逐项显示来源、质量、实际使用模块和缺陷；低置信度数据不会自动升级为正式推荐。
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-[11px] font-semibold ${
                        quant.data_audit.overall_status === "PASS"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : quant.data_audit.overall_status === "DEGRADED"
                          ? "bg-amber-950 text-amber-300 border border-amber-800"
                          : "bg-rose-950 text-rose-300 border border-rose-800"
                      }`}
                    >
                      {quant.data_audit.overall_status === "PASS"
                        ? "可用"
                        : quant.data_audit.overall_status === "DEGRADED"
                        ? "降级/有缺陷"
                        : "阻断"}
                    </span>
                  </div>
                  {quant.production_gate && (
                    <div
                      className={`mx-3 mt-3 mb-1 rounded-lg border p-3 ${
                        quant.production_gate.calculation_status === "PRODUCTION_READY"
                          ? "border-emerald-800 bg-emerald-950/30"
                          : quant.production_gate.calculation_status === "RESEARCH_ONLY"
                          ? "border-amber-800 bg-amber-950/30"
                          : "border-rose-800 bg-rose-950/30"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                        <span>Layer 03 生产准入</span>
                        <span className="font-mono">
                          {quant.production_gate.calculation_status === "PRODUCTION_READY"
                            ? "计算链路已具备生产准入"
                            : quant.production_gate.calculation_status === "RESEARCH_ONLY"
                            ? "仅研究模式"
                            : "数据阻断"}
                          {" · "}
                          {quant.production_gate.candidate_status === "UNLOCKED" ? "候选已解锁" : "正式候选锁定"}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {quant.production_gate.blockers.join("；")}
                      </div>
                    </div>
                  )}
                  <div className="divide-y divide-slate-800/80">
                    {quant.data_audit.items.map((auditItem: any) => (
                      <div key={auditItem.category} className="p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200">{auditItem.category}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{auditItem.source}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono">
                            <span className="text-slate-400">质量 {auditItem.quality_score}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                auditItem.status === "USED"
                                  ? "text-emerald-300 bg-emerald-950/70"
                                  : auditItem.status === "DEGRADED"
                                  ? "text-amber-300 bg-amber-950/70"
                                  : auditItem.status === "REJECTED"
                                  ? "text-rose-300 bg-rose-950/70"
                                  : "text-slate-400 bg-slate-800"
                              }`}
                            >
                              {auditItem.status}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-[11px]">
                          <div className="text-slate-400">
                            <span className="text-slate-500">证据：</span>
                            {auditItem.evidence.join("；") || "无"}
                          </div>
                          <div className="text-slate-400">
                            <span className="text-slate-500">实际使用：</span>
                            {auditItem.used_by.join("；") || "未进入计算"}
                          </div>
                        </div>
                        {auditItem.defects.length > 0 && (
                          <div className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded px-2 py-1.5">
                            <span className="font-semibold">缺陷：</span>
                            {auditItem.defects.join("；")}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-500 font-mono">
                          {auditItem.sample_size !== undefined ? `样本 ${auditItem.sample_size} · ` : ""}
                          {auditItem.covered_minute_to !== undefined && auditItem.covered_minute_to !== null
                            ? `覆盖至 ${auditItem.covered_minute_to}' · `
                            : ""}
                          {auditItem.weight !== undefined && auditItem.weight !== null ? `权重 ${auditItem.weight}` : "未参与权重"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {quant?.poisson?.lambda_decomposition && (
                <div className="bg-slate-900/80 rounded-lg border border-violet-900/60 overflow-hidden">
                  <div className="p-3 bg-violet-950/30 border-b border-violet-900/60">
                    <div className="font-semibold text-sm text-violet-200">03 M4 剩余 λ 分解</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      显示市场基准、M2 乘子、时间因子、威胁张量和红牌乘数，避免只看最终总数。
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3 text-[11px] font-mono">
                    {([
                      ["市场基准 H/A", `${quant.poisson.lambda_decomposition.market_base_home} / ${quant.poisson.lambda_decomposition.market_base_away}`],
                      ["M2后基准 H/A", `${quant.poisson.lambda_decomposition.base_after_context_home} / ${quant.poisson.lambda_decomposition.base_after_context_away}`],
                      ["时间因子 H/A", `${quant.poisson.lambda_decomposition.time_fraction_home} / ${quant.poisson.lambda_decomposition.time_fraction_away}`],
                      ["紧迫度", quant.poisson.lambda_decomposition.urgency_multiplier],
                      ["威胁张量 H/A", `${quant.poisson.lambda_decomposition.threat_home} / ${quant.poisson.lambda_decomposition.threat_away}`],
                      ["红牌进攻 H/A", `${quant.poisson.lambda_decomposition.red_attack_home} / ${quant.poisson.lambda_decomposition.red_attack_away}`],
                      ["红牌漏洞 H/A", `${quant.poisson.lambda_decomposition.red_leak_home} / ${quant.poisson.lambda_decomposition.red_leak_away}`],
                      ["最终 λ H/A", `${quant.poisson.lambda_home_rest} / ${quant.poisson.lambda_away_rest}`],
                    ] as const).map(([label, value]) => (
                      <div key={label} className="bg-slate-950/70 rounded px-2 py-1.5">
                        <div className="text-slate-500">{label}</div>
                        <div className="text-violet-200 mt-0.5">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 11 维度全面清单 */}
              <div className="bg-slate-900/80 rounded-lg border border-slate-800 overflow-hidden">
                <div className="p-2.5 bg-slate-900 border-b border-slate-800 font-semibold text-xs text-slate-200 flex items-center justify-between">
                  <span>11 维核心量化数据特征就绪体检清单</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {m.missing_reasons.length === 0 ? "11/11 项特征全齐备" : `存在 ${m.missing_reasons.length} 项数据缺口`}
                  </span>
                </div>

                <div className="divide-y divide-slate-800/80 text-xs">
                  {/* 1. 实时危攻时序走势 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        <span>1. 实时危攻时序走势 (Attack Momentum Timeline)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        提供逐分钟攻防差值走势、危攻积分与动量斜率
                      </div>
                    </div>
                    <div>
                      {m.reference?.attack_momentum?.available ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 完整具备 ({m.reference.attack_momentum.segment_count}段)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_ATTACK_MOMENTUM)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 2. 实时攻防技术统计 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <BarChart2 className="w-4 h-4 text-blue-400" />
                        <span>2. 实时攻防技术统计 (Live Technical Stats)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        涵盖射门、射正、危攻、总攻、控球率、角球、红黄牌等 9 项指标
                      </div>
                    </div>
                    <div>
                      {(() => {
                        const stats = m.reference?.stats;
                        if (!stats) {
                          return (
                            <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                              ❌ 缺失 (NO_STATS)
                            </span>
                          );
                        }
                        const validMetrics = [
                          stats.corners,
                          stats.yellow_cards,
                          stats.red_cards,
                          stats.attacks,
                          stats.dangerous_attacks,
                          stats.possession,
                          stats.shots_on_target,
                          stats.shots_off_target,
                          stats.shots,
                        ].filter(Boolean).length;
                        return validMetrics > 0 ? (
                          <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                            ✅ 具备 ({validMetrics}/9项真实指标)
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                            ❌ 缺失 (全部指标无事实)
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 3. 比赛关键事件与时间轴 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-purple-400" />
                        <span>3. 比赛关键事件与时间轴 (Timeline Key Events)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        进球、红黄牌、点球、换人等时序关键事件
                      </div>
                    </div>
                    <div>
                      {(m.reference?.timeline_events?.length || 0) > 0 ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备 ({m.reference?.timeline_events?.length}个事件)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                          ⏳ 暂无事件/未发生
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 4. 阵容首发与伤停名单 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-400" />
                        <span>4. 阵容首发与伤停名单 (Lineups & Formations)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        首发阵容名单、阵型架构与伤停减员状态
                      </div>
                    </div>
                    <div>
                      {m.reference?.lineups?.confirmed ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 正式首发已确认
                        </span>
                      ) : (m.reference?.lineups?.home_starters?.length || 0) > 0 ? (
                        <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-medium">
                          ⏳ 预测首发/未确认
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_LINEUP_DATA)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 5. 历史交锋往绩 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-blue-400" />
                        <span>5. 历史交锋记录 (Head to Head)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        主客两队过往历史交战对赛记录、比分与让球赢盘走势
                      </div>
                    </div>
                    <div>
                      {(m.reference?.tactical_context?.head_to_head_count || 0) > 0 ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备 ({m.reference?.tactical_context?.head_to_head_count}场往绩)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                          ⏳ 暂无过往交锋对赛
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 6. 近期战绩与走势 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-amber-400" />
                        <span>6. 近期战绩与走势 (Recent Form)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        主队与客队近期各项赛事近5~10场胜平负胜率与得失球
                      </div>
                    </div>
                    <div>
                      {(m.reference?.tactical_context?.home_recent_matches_count || 0) > 0 ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备 (主{m.reference?.tactical_context?.home_recent_matches_count}场/客{m.reference?.tactical_context?.away_recent_matches_count || 0}场)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_RECENT_FORM_DATA)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 7. 联赛积分榜与排名 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span>7. 联赛积分榜与排名 (League Standings)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        主客队联赛常规胜平负、净胜球与排名积分 (杯赛种子位提示)
                      </div>
                    </div>
                    <div>
                      {m.reference?.league_standings?.has_data ? (
                        m.reference.league_standings.home_team?.overall?.matches_played === 0 ? (
                          <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-medium">
                            ⚠️ 杯赛/未开赛种子位
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                            ✅ 完整具备 (主#{m.reference.league_standings.home_team?.overall?.position ?? "-"} vs 客#{m.reference.league_standings.away_team?.overall?.position ?? "-"})
                          </span>
                        )
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_LEAGUE_STANDINGS)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 8. 进球时间段分布 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span>8. 进球时间段分布 (Goal Distribution)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        比赛 6 大时段进失球特征
                      </div>
                    </div>
                    <div>
                      {m.reference?.goal_distribution?.has_data ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备 (6大时段)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 缺失 (NO_GOAL_DISTRIBUTION)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 9. 雷速主流机构赔率矩阵 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-purple-400" />
                        <span>9. 雷速主流机构赔率矩阵 (Odds Matrix)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        主流机构欧赔初盘与即时盘、亚盘让球与大小球变盘走势
                      </div>
                    </div>
                    <div>
                      {m.reference?.odds_matrix?.initial?.asian_handicap ||
                      m.reference?.odds_matrix?.pregame?.asian_handicap ||
                      m.reference?.odds_matrix?.live?.asian_handicap ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 具备主流机构初变盘
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                          ⚠️ 暂无雷速机构矩阵
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 10. 比赛环境与场地信息 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-emerald-400" />
                        <span>10. 比赛环境与场地信息 (Environment & Venue)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        比赛球场名称、天气状况、气温与草皮条件
                      </div>
                    </div>
                    <div>
                      {m.reference?.lineups?.venue?.name ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium truncate max-w-xs block text-right">
                          ✅ 具备 ({m.reference.lineups.venue.name})
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700 font-medium">
                          ⚠️ 暂无场地天气数据
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 11. 双源比分与状态画布校验 */}
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>11. 双源比分与状态画布校验 (Canvas Score Verification)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        雷速画布/接口双重校验，杜绝文本行识别失真与比分冲突
                      </div>
                    </div>
                    <div>
                      {m.score.score_verified ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          ✅ 画布/接口已核验
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                          ❌ 未经画布校验 (SCORE_UNVERIFIED)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {m.missing_reasons.length > 0 && (
                <div className="p-3.5 bg-amber-950/40 border border-amber-900/60 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    当前赛事识别出的具体缺口清单 ({m.missing_reasons.length}项)
                  </h4>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {m.missing_reasons.map((r, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-0.5 bg-amber-900/50 border border-amber-700/60 text-amber-200 rounded font-mono text-[11px]"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 🎯 YBTY 盘口全集 */}
          {activeTabByMatch[m.canonical_id] === "markets" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">
                  YBTY 原始盘口体系 (法定交易源 · 纯净客观无损)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  主队: {m.home_team_name} | 客队: {m.away_team_name}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 全场让球 */}
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-blue-400 flex items-center justify-between">
                    <span>全场让球 (Full Spread)</span>
                    <span className="text-[10px] text-slate-500">
                      {m.markets.full_spread_subs.length > 0
                        ? `含 ${m.markets.full_spread_subs.length} 个副盘`
                        : "仅主盘"}
                    </span>
                  </div>
                  {m.markets.full_spread_main ? (
                    <div className="bg-slate-900/90 p-2 rounded border border-blue-900/30 text-xs font-mono">
                      <div className="text-[11px] text-slate-400 mb-1">🔥 主盘 (Main Line)</div>
                      <div className="flex justify-between items-center text-slate-200">
                        <span className="text-blue-400 font-semibold">
                          {m.markets.full_spread_main.home_selection}
                        </span>
                        <span>主水: {m.markets.full_spread_main.home_odds}</span>
                        <span>客水: {m.markets.full_spread_main.away_odds}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic py-2">暂无全场让球主盘</div>
                  )}

                  {m.markets.full_spread_subs.map((sub, sIdx) => (
                    <div
                      key={sIdx}
                      className="bg-slate-900/50 p-1.5 rounded text-[11px] font-mono flex justify-between items-center text-slate-300 border border-slate-800/60"
                    >
                      <span className="text-slate-400">
                        副盘 {sub.line_index + 1}: {sub.home_selection}
                      </span>
                      <span>主 {sub.home_odds}</span>
                      <span>客 {sub.away_odds}</span>
                    </div>
                  ))}
                </div>

                {/* 全场大小 */}
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                    <span>全场大小 (Full Total)</span>
                    <span className="text-[10px] text-slate-500">
                      {m.markets.full_total_subs.length > 0
                        ? `含 ${m.markets.full_total_subs.length} 个副盘`
                        : "仅主盘"}
                    </span>
                  </div>
                  {m.markets.full_total_main ? (
                    <div className="bg-slate-900/90 p-2 rounded border border-emerald-900/30 text-xs font-mono">
                      <div className="text-[11px] text-slate-400 mb-1">🔥 主盘 (Main Line)</div>
                      <div className="flex justify-between items-center text-slate-200">
                        <span className="text-emerald-400 font-semibold">
                          {m.markets.full_total_main.line} 球
                        </span>
                        <span>大球: {m.markets.full_total_main.over_odds}</span>
                        <span>小球: {m.markets.full_total_main.under_odds}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic py-2">暂无全场大小主盘</div>
                  )}

                  {m.markets.full_total_subs.map((sub, sIdx) => (
                    <div
                      key={sIdx}
                      className="bg-slate-900/50 p-1.5 rounded text-[11px] font-mono flex justify-between items-center text-slate-300 border border-slate-800/60"
                    >
                      <span className="text-slate-400">
                        副盘 {sub.line_index + 1}: {sub.line}
                      </span>
                      <span>大 {sub.over_odds}</span>
                      <span>小 {sub.under_odds}</span>
                    </div>
                  ))}
                </div>

                {/* 独赢与半场盘口 */}
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-amber-400">1X2 独赢 & 半场盘口</div>

                  {m.markets.full_h2h ? (
                    <div className="bg-slate-900/90 p-2 rounded border border-amber-900/30 text-xs font-mono space-y-1">
                      <div className="text-[11px] text-slate-400">全场独赢 (1X2)</div>
                      <div className="flex justify-between text-slate-200">
                        <span>
                          主胜: <strong className="text-amber-400">{m.markets.full_h2h.home_odds}</strong>
                        </span>
                        <span>
                          平局: <strong className="text-amber-400">{m.markets.full_h2h.draw_odds}</strong>
                        </span>
                        <span>
                          客胜: <strong className="text-amber-400">{m.markets.full_h2h.away_odds}</strong>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic">暂无全场独赢</div>
                  )}

                  <div className="bg-slate-900/60 p-2 rounded border border-slate-800 space-y-1 text-xs font-mono">
                    <div className="text-[11px] text-slate-400">半场盘口 (Half Time)</div>
                    <div className="space-y-0.5 text-[11px] text-slate-300">
                      {m.markets.half_spread_main && (
                        <div>
                          半场让球: {m.markets.half_spread_main.home_selection} (主
                          {m.markets.half_spread_main.home_odds} / 客
                          {m.markets.half_spread_main.away_odds})
                        </div>
                      )}
                      {m.markets.half_total_main && (
                        <div>
                          半场大小: {m.markets.half_total_main.line} (大
                          {m.markets.half_total_main.over_odds} / 小
                          {m.markets.half_total_main.under_odds})
                        </div>
                      )}
                      {m.markets.half_h2h && (
                        <div>
                          半场独赢: 主{m.markets.half_h2h.home_odds} | 平
                          {m.markets.half_h2h.draw_odds} | 客
                          {m.markets.half_h2h.away_odds}
                        </div>
                      )}
                      {!m.markets.half_spread_main &&
                        !m.markets.half_total_main &&
                        !m.markets.half_h2h && (
                          <div className="text-slate-500 italic">暂无半场盘口</div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 📊 雷速统计增强 */}
          {activeTabByMatch[m.canonical_id] === "stats" && (
            <div className="space-y-4">
              {m.reference ? (
                <>
                  {m.reference.stats ? (
                    <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                      <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                        <span>实时攻防与技术统计 (Live Technical Stats)</span>
                        <span className="text-[11px] text-blue-400">
                          主: {m.reference.leisu_home_name} vs 客: {m.reference.leisu_away_name}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-1.5 text-center text-xs font-mono">
                        {[
                          { label: "射门", pair: m.reference.stats.shots },
                          { label: "射正", pair: m.reference.stats.shots_on_target },
                          { label: "射偏", pair: m.reference.stats.shots_off_target },
                          { label: "危攻", pair: m.reference.stats.dangerous_attacks },
                          { label: "总攻", pair: m.reference.stats.attacks },
                          { label: "控球", pair: m.reference.stats.possession, isPercent: true },
                          { label: "角球", pair: m.reference.stats.corners },
                          { label: "黄牌", pair: m.reference.stats.yellow_cards },
                          { label: "红牌", pair: m.reference.stats.red_cards },
                        ].map((st, sIdx) => {
                          const hasData = Boolean(st.pair);
                          const hVal = hasData ? (st.isPercent ? `${st.pair!.home}%` : st.pair!.home) : "-";
                          const aVal = hasData ? (st.isPercent ? `${st.pair!.away}%` : st.pair!.away) : "-";
                          return (
                            <div
                              key={sIdx}
                              className="bg-slate-900/90 p-1.5 rounded-lg border border-slate-800 flex flex-col justify-between"
                            >
                              <div className="text-[10px] text-slate-400 font-sans truncate">{st.label}</div>
                              <div className="flex justify-center items-center gap-1 font-bold mt-1 text-xs">
                                <span className={hasData ? "text-blue-400" : "text-slate-600"}>{hVal}</span>
                                <span className="text-slate-600 font-normal text-[10px]">:</span>
                                <span className={hasData ? "text-amber-400" : "text-slate-600"}>{aVal}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>未提供实时攻防统计事实 (赛前阶段或源头未采集统计)</span>
                      </span>
                      <span className="text-[11px] text-slate-500">零假数据保护已生效</span>
                    </div>
                  )}

                  {m.reference.league_standings && m.reference.league_standings.has_data && (
                    <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                      <div className="text-xs font-bold text-slate-300">
                        🏆 联赛积分榜与排名 (League Standings)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {m.reference.league_standings.home_team && (() => {
                          const overall = m.reference.league_standings.home_team.overall;
                          const isCupOrUnstarted =
                            overall &&
                            overall.matches_played === 0 &&
                            overall.points === 0 &&
                            overall.goals_scored === 0;

                          return (
                            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                              <div className="font-semibold text-blue-400 flex items-center justify-between">
                                <span>主队: {m.reference.league_standings.home_team.team_name}</span>
                                <span>排名: 第 {overall?.position || "-"} 名</span>
                              </div>
                              {isCupOrUnstarted ? (
                                <div className="text-[11px] text-slate-400 font-mono">
                                  杯赛/淘汰赛或新赛季暂未开打，暂无常规循环积分统计 (初始种子位: 第 {overall?.position || 1} 名)
                                </div>
                              ) : overall ? (
                                <div className="text-[11px] text-slate-300 font-mono">
                                  赛:<strong>{overall.matches_played}</strong> | 胜:<strong>{overall.won}</strong> | 平:<strong>{overall.draw}</strong> | 负:<strong>{overall.loss}</strong> | 进/失:<strong>{overall.goals_scored}/{overall.goals_conceded}</strong> | 积分: <strong className="text-emerald-400 text-xs">{overall.points}</strong>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}

                        {m.reference.league_standings.away_team && (() => {
                          const overall = m.reference.league_standings.away_team.overall;
                          const isCupOrUnstarted =
                            overall &&
                            overall.matches_played === 0 &&
                            overall.points === 0 &&
                            overall.goals_scored === 0;

                          return (
                            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                              <div className="font-semibold text-amber-400 flex items-center justify-between">
                                <span>客队: {m.reference.league_standings.away_team.team_name}</span>
                                <span>排名: 第 {overall?.position || "-"} 名</span>
                              </div>
                              {isCupOrUnstarted ? (
                                <div className="text-[11px] text-slate-400 font-mono">
                                  杯赛/淘汰赛或新赛季暂未开打，暂无常规循环积分统计 (初始种子位: 第 {overall?.position || 1} 名)
                                </div>
                              ) : overall ? (
                                <div className="text-[11px] text-slate-300 font-mono">
                                  赛:<strong>{overall.matches_played}</strong> | 胜:<strong>{overall.won}</strong> | 平:<strong>{overall.draw}</strong> | 负:<strong>{overall.loss}</strong> | 进/失:<strong>{overall.goals_scored}/{overall.goals_conceded}</strong> | 积分: <strong className="text-emerald-400 text-xs">{overall.points}</strong>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {m.reference.goal_distribution && m.reference.goal_distribution.has_data && (
                    <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                      <div className="text-xs font-bold text-slate-300">
                        ⏱️ 进球时间分布 (Goal Distribution by Minutes)
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs font-mono">
                        {(m.reference.goal_distribution.home_team.all.scored_intervals || []).map((interval, iIdx) => {
                          const awayInterval = m.reference?.goal_distribution?.away_team.all.scored_intervals[iIdx];
                          return (
                            <div key={iIdx} className="bg-slate-900/80 p-2 rounded border border-slate-800">
                              <div className="text-[10px] text-slate-500">{interval.start_minute}-{interval.end_minute}'</div>
                              <div className="text-[11px] text-blue-400 font-semibold mt-0.5">
                                主: {interval.goals}球 ({interval.percentage}%)
                              </div>
                              <div className="text-[11px] text-amber-400 font-semibold">
                                客: {awayInterval ? `${awayInterval.goals}球 (${awayInterval.percentage}%)` : "-"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-lg border border-slate-800">
                  未关联到雷速增强数据包 (当前比赛仅有 YBTY 盘口数据)
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ⚔️ 历史交锋与阵容战意 */}
          {(activeTabByMatch[m.canonical_id] || "quant") === "h2h" && (
            <div className="space-y-4">
              {m.reference ? (
                <>
                  <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2.5">
                    <div className="text-xs font-bold text-slate-300 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span>历史对赛交锋记录 (Head to Head)</span>
                        {quant?.context?.h2h_analytics && quant.context.h2h_analytics.sample_count > 0 && (
                          quant.context.h2h_analytics.tactical_metrics_available ? (
                            <span className="bg-emerald-950/70 border border-emerald-700/50 text-emerald-400 text-[10px] px-2 py-0.5 rounded font-mono flex items-center gap-1">
                              <span>✅ 战术攻防真实样本: {quant.context.h2h_analytics.tactical_valid_count}/{quant.context.h2h_analytics.valid_count}场</span>
                              <span>(均角: {quant.context.h2h_analytics.historical_avg_corners ?? "-"})</span>
                            </span>
                          ) : (
                            <span className="bg-amber-950/70 border border-amber-700/50 text-amber-400 text-[10px] px-2 py-0.5 rounded font-mono" title="历史交锋缺少双方客观攻防/角球记录，模型已自动拦截假0数据，仅采信宏观胜负比分">
                              ⚠️ 深层攻防数据缺失 (已过滤伪角球/伪相克，仅采信基础比分)
                            </span>
                          )
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        共收录 {m.reference.tactical_context?.head_to_head_count || 0} 场历史交锋
                      </span>
                    </div>

                    {(m.reference.tactical_context?.h2h_raw || []).length > 0 ? (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {m.reference.tactical_context?.h2h_raw.slice(0, 8).map((h, hIdx) => {
                          const homeResolved = resolveH2HTeamName(h.home_team_id, m);
                          const awayResolved = resolveH2HTeamName(h.away_team_id, m);
                          const hScore = h.home_scores && h.home_scores.length > 0 ? h.home_scores[0] : "-";
                          const aScore = h.away_scores && h.away_scores.length > 0 ? h.away_scores[0] : "-";
                          const hHalf = h.home_scores && h.home_scores.length > 1 ? h.home_scores[1] : "-";
                          const aHalf = h.away_scores && h.away_scores.length > 1 ? h.away_scores[1] : "-";
                          const matchDate = h.match_time ? new Date(Number(h.match_time) * 1000).toISOString().slice(0, 10) : "-";
                          const hw = quant?.context?.h2h_weights?.[hIdx];

                          return (
                            <div
                              key={hIdx}
                              className="bg-slate-900/90 p-2 rounded-lg text-xs grid grid-cols-12 items-center font-mono border border-slate-800/80 hover:border-slate-700 transition-colors"
                            >
                              <div className="col-span-2 text-slate-400 truncate text-[11px] flex flex-col">
                                <span>{matchDate}</span>
                                {hw && (
                                  hw.is_tactical_valid ? (
                                    <span className="text-[9px] text-emerald-400 font-sans" title="角球、危攻、射门、控球率双向客观完整">
                                      [攻防完整]
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-slate-500 font-sans truncate" title={hw.tactical_invalidation_reason || "深层攻防缺失"}>
                                      [仅比分]
                                    </span>
                                  )
                                )}
                              </div>

                              <div className="col-span-4 text-right pr-2 truncate">
                                <span
                                  className={`font-medium ${
                                    homeResolved.isCurrent === "home"
                                      ? "text-blue-400 font-bold"
                                      : homeResolved.isCurrent === "away"
                                      ? "text-amber-400 font-bold"
                                      : "text-slate-300"
                                  }`}
                                >
                                  {homeResolved.name}
                                </span>
                              </div>

                              <div className="col-span-2 flex justify-center items-center">
                                <div className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-center whitespace-nowrap shadow-xs">
                                  <span className="text-slate-100 font-bold text-xs">
                                    全场 {hScore} : {aScore}
                                  </span>
                                  <span className="text-slate-500 text-[10px] ml-1">
                                    ({hHalf}:{aHalf})
                                  </span>
                                </div>
                              </div>

                              <div className="col-span-4 text-left pl-2 truncate">
                                <span
                                  className={`font-medium ${
                                    awayResolved.isCurrent === "home"
                                      ? "text-blue-400 font-bold"
                                      : awayResolved.isCurrent === "away"
                                      ? "text-amber-400 font-bold"
                                      : "text-slate-300"
                                  }`}
                                >
                                  {awayResolved.name}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic py-2">暂无历史交战明细</div>
                    )}
                  </div>

                  <RecentFormComparator
                    homeTeamName={m.reference.leisu_home_name || m.home_team_name}
                    awayTeamName={m.reference.leisu_away_name || m.away_team_name}
                    homeRecentMatches={m.reference.tactical_context?.home_recent_matches || []}
                    awayRecentMatches={m.reference.tactical_context?.away_recent_matches || []}
                  />

                  {m.reference.lineups && (() => {
                    const hasStarters =
                      (m.reference.lineups.home_starters && m.reference.lineups.home_starters.length > 0) ||
                      (m.reference.lineups.away_starters && m.reference.lineups.away_starters.length > 0);
                    const hasFormations =
                      (m.reference.lineups.home_formation && m.reference.lineups.home_formation !== "未指定") ||
                      (m.reference.lineups.away_formation && m.reference.lineups.away_formation !== "未指定");

                    if (!hasStarters && !hasFormations) {
                      return (
                        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 text-center py-4 space-y-1.5">
                          <div className="text-xs text-amber-400 font-medium flex items-center justify-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>⏳ 暂无首发与阵型数据 (赛前未公布或数据源未收录)</span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            根据风控规范，缺乏正式首发与战意情报时，该场赛事最高定级为 B-/C 级，不可直接进入正式高置信串关。
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                        <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>阵容与战术情报 (Lineups & Formations)</span>
                          <span
                            className={`text-[11px] ${
                              m.reference.lineups.confirmed ? "text-emerald-400" : "text-amber-400"
                            }`}
                          >
                            {m.reference.lineups.confirmed ? "✅ 正式首发已确认" : "⏳ 预测首发/未确认"}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                            <div className="font-semibold text-blue-400">主队: {m.reference.leisu_home_name}</div>
                            <div className="text-slate-400 font-mono text-[11px]">
                              阵型: <strong>{m.reference.lineups.home_formation || "未指定"}</strong> | 主帅: {m.reference.lineups.home_manager || "未指定"} | 首发: {m.reference.lineups.home_starters?.length || 0}人
                            </div>
                          </div>
                          <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                            <div className="font-semibold text-amber-400">客队: {m.reference.leisu_away_name}</div>
                            <div className="text-slate-400 font-mono text-[11px]">
                              阵型: <strong>{m.reference.lineups.away_formation || "未指定"}</strong> | 主帅: {m.reference.lineups.away_manager || "未指定"} | 首发: {m.reference.lineups.away_starters?.length || 0}人
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-lg border border-slate-800">
                  未关联到雷速交锋与阵容数据
                </div>
              )}
            </div>
          )}

          {/* TAB 6: {} 03 模型数据 (输入/输出) */}
          {(activeTabByMatch[m.canonical_id] || "quant") === "json" &&
            (() => {
              const currentSubTab = cardJsonSubTab[m.canonical_id] || "input";
              const singleOutputData = {
                canonical_id: m.canonical_id,
                match_name: `${m.home_team_name} vs ${m.away_team_name}`,
                league_name: m.league_name,
                stage: m.timing?.stage,
                score: m.score,
                exported_at: new Date().toISOString(),
                quant_features: quant || null,
              };

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-t-lg border border-slate-800 text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                        <button
                          id={`btn-card-json-tab-input-${idx}`}
                          onClick={() => setCardJsonSubTab((prev) => ({ ...prev, [m.canonical_id]: "input" }))}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                            currentSubTab === "input"
                              ? "bg-emerald-600 text-white font-semibold shadow-xs"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <FileJson className="w-3.5 h-3.5" />
                          <span>1. 03 接收输入 (CanonicalMatch)</span>
                        </button>
                        <button
                          id={`btn-card-json-tab-output-${idx}`}
                          onClick={() => setCardJsonSubTab((prev) => ({ ...prev, [m.canonical_id]: "output" }))}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                            currentSubTab === "output"
                              ? "bg-blue-600 text-white font-semibold shadow-xs"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>2. 03 计算输出 (QuantitativeFeatures)</span>
                          {quant ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-700/60 font-mono">
                              已计算
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-700/60 font-mono">
                              未就绪
                            </span>
                          )}
                        </button>
                      </div>

                      <span className="text-[11px] text-slate-500 font-mono">
                        {currentSubTab === "input" ? "纯净标准赛事输入实体" : "37项量化推演输出特征"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {currentSubTab === "input" ? (
                        <>
                          <button
                            id={`btn-copy-json-input-${idx}`}
                            onClick={() => onCopyMatchInput(m)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors border border-slate-700"
                          >
                            {copiedKey === `${m.canonical_id}_input` ? (
                              <>
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400 font-semibold">已复制输入</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                                <span>复制 03 接收输入</span>
                              </>
                            )}
                          </button>
                          <button
                            id={`btn-download-json-input-${idx}`}
                            onClick={() => onDownloadMatchInput(m)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>下载输入 JSON</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            id={`btn-copy-json-output-${idx}`}
                            onClick={() => onCopyMatchOutput(m)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors border border-slate-700"
                          >
                            {copiedKey === `${m.canonical_id}_output` ? (
                              <>
                                <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-blue-400 font-semibold">已复制输出</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-blue-400" />
                                <span>复制 03 计算输出</span>
                              </>
                            )}
                          </button>
                          <button
                            id={`btn-download-json-output-${idx}`}
                            onClick={() => onDownloadMatchOutput(m)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>下载输出 JSON</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <pre className="text-[11px] font-mono bg-slate-950 p-4 rounded-b-lg overflow-x-auto text-slate-200 max-h-96 border border-t-0 border-slate-800 select-all">
                    {JSON.stringify(currentSubTab === "input" ? m : singleOutputData, null, 2)}
                  </pre>
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
};

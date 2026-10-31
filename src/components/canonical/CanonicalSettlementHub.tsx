import React, { useState } from "react";
import {
  Layers,
  Activity,
  RefreshCw,
  Eye,
  ShieldCheck,
  Target,
  HelpCircle,
  PlusCircle,
  Zap,
  CheckCheck,
  RotateCcw,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { CanonicalMatch } from "../../../refactor/02_canonical_model/types";
import {
  formatKickoffDateTime,
  getDefaultScoreForRecord,
  getScoreAtPredictionString,
  sanitizeScoreInput,
} from "./types";

interface CanonicalSettlementHubProps {
  mode: "live" | "prematch";
  matches: CanonicalMatch[];
  universeLedger: any[];
  formalLedger: any[];
  universeSummary: any;
  oosStatus: any;
  feedback: string | null;
  setFeedback: (msg: string | null) => void;
  onRefreshAll: () => Promise<void>;
  onBackToMatches: () => void;
  onOpenManualLedger: (defaultMatch?: CanonicalMatch) => void;
}

export const CanonicalSettlementHub: React.FC<CanonicalSettlementHubProps> = ({
  mode,
  matches,
  universeLedger,
  formalLedger,
  universeSummary,
  oosStatus,
  feedback,
  setFeedback,
  onRefreshAll,
  onBackToMatches,
  onOpenManualLedger,
}) => {
  const [ledgerTrack, setLedgerTrack] = useState<"UNIVERSE" | "FORMAL" | "REFLECTION">("UNIVERSE");
  const [universeFilter, setUniverseFilter] = useState<"ALL" | "UNSETTLED" | "SETTLED" | "AVOIDANCE" | "FALSE_NEGATIVE">("ALL");
  const [ledgerFilter, setLedgerFilter] = useState<"ALL" | "UNSETTLED" | "SETTLED">("ALL");
  const [reflectionFilter, setReflectionFilter] = useState<"ALL" | "UNSETTLED" | "SETTLED" | "HIT" | "EXACT" | "MISS">("ALL");
  const [hubSearchKeyword, setHubSearchKeyword] = useState<string>("");

  const [settleInputs, setSettleInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [settleSources, setSettleSources] = useState<Record<string, string>>({});
  const [settlingIds, setSettlingIds] = useState<Record<string, boolean>>({});
  const [editingSettleIds, setEditingSettleIds] = useState<Record<string, boolean>>({});
  const [expandedLedgerRecordIds, setExpandedLedgerRecordIds] = useState<Record<string, boolean>>({});

  const [isBatchSettling, setIsBatchSettling] = useState<boolean>(false);
  const [isResettingSettlement, setIsResettingSettlement] = useState<boolean>(false);
  const [isSyncingLedger, setIsSyncingLedger] = useState<boolean>(false);
  const [autoSettlingLeisu, setAutoSettlingLeisu] = useState<boolean>(false);
  const [showStandardsGuideModal, setShowStandardsGuideModal] = useState<boolean>(false);

  // 格式化数值分段盘口
  const formatFractionNotation = (val: number): string => {
    const abs = Math.abs(val);
    if (Math.abs(abs - 0.25) < 1e-4) return "0/0.5";
    if (Math.abs(abs - 0.75) < 1e-4) return "0.5/1";
    if (Math.abs(abs - 1.25) < 1e-4) return "1/1.5";
    if (Math.abs(abs - 1.75) < 1e-4) return "1.5/2";
    if (Math.abs(abs - 2.25) < 1e-4) return "2/2.5";
    if (Math.abs(abs - 2.75) < 1e-4) return "2.5/3";
    if (Math.abs(abs - 3.25) < 1e-4) return "3/3.5";
    if (Math.abs(abs - 3.75) < 1e-4) return "3.5/4";
    return `${abs}`;
  };

  const formatLineWithSign = (num: number): string => {
    if (isNaN(num)) return "-";
    if (num === 0 || Object.is(num, -0)) return "0";
    const notation = formatFractionNotation(num);
    return num > 0 ? `+${notation}` : `-${notation}`;
  };

  const formatOuDisplay = (rawLine: any): string => {
    if (rawLine === undefined || rawLine === null || rawLine === "") return "-";
    const str = String(rawLine).trim();
    if (str.includes("/")) return str.endsWith("球") ? str : `${str}球`;
    const num = parseFloat(str);
    if (isNaN(num)) return str;
    const notation = formatFractionNotation(num);
    return `${notation}球`;
  };

  const renderDualTeamNames = (record: any) => {
    const linkedMatch = matches.find(
      (m: any) => m.canonical_id === record.match_id || m.canonical_id === record.canonical_match_id
    );
    const ybtyHome = record.teams?.home || linkedMatch?.home_team_name || "主队";
    const ybtyAway = record.teams?.away || linkedMatch?.away_team_name || "客队";
    const leisuHome = record.reference_teams?.leisu_home || linkedMatch?.reference?.leisu_home_name;
    const leisuAway = record.reference_teams?.leisu_away || linkedMatch?.reference?.leisu_away_name;
    const leisuLeague = record.reference_teams?.leisu_league || linkedMatch?.reference?.leisu_league_name;
    const hasLeisu = !!(leisuHome || leisuAway);

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-bold text-slate-100 flex items-center gap-1">
          <span className="text-[9px] text-amber-400 font-mono bg-amber-950/80 px-1 py-0.2 rounded border border-amber-800" title="YBTY 原始盘口出票队名 (SSOT)">
            YBTY
          </span>
          <span>{ybtyHome} vs {ybtyAway}</span>
        </span>
        {hasLeisu && (
          <span
            className="text-[10px] text-teal-300 bg-teal-950/70 px-1.5 py-0.5 rounded border border-teal-800 flex items-center gap-1"
            title="雷速官方匹配队名（交叉校验源）"
          >
            <span className="text-[9px] text-teal-400 font-bold">雷速:</span>
            <span>{leisuHome || ybtyHome} vs {leisuAway || ybtyAway}</span>
            {leisuLeague && leisuLeague !== record.league_key && (
              <span className="text-teal-400/80">({leisuLeague})</span>
            )}
          </span>
        )}
      </div>
    );
  };

  const renderQuantMarketSnapshot = (record: any) => {
    const linkedMatch = matches.find(
      (m: any) => m.canonical_id === record.match_id || m.canonical_id === record.canonical_match_id
    );
    const quant = record.quant_snapshot || {};
    const mkts = quant.markets || {};

    const rawAh = quant.ah_line ?? (linkedMatch?.markets?.full_spread_main as any)?.line ?? linkedMatch?.markets?.full_spread_main?.home_selection;
    let homeAhNum = 0;
    if (typeof rawAh === "number") {
      homeAhNum = rawAh;
    } else if (rawAh) {
      const cleanAh = String(rawAh).trim();
      if (cleanAh.includes("/")) {
        const pts = cleanAh.split("/");
        const p1 = parseFloat(pts[0]);
        const p2 = parseFloat(pts[1]);
        if (!isNaN(p1) && !isNaN(p2)) {
          homeAhNum = (Math.abs(p1) + Math.abs(p2)) / 2;
          if (cleanAh.includes("-")) homeAhNum = -homeAhNum;
        }
      } else {
        homeAhNum = parseFloat(cleanAh) || 0;
      }
    }
    const homeAhDisplay = formatLineWithSign(homeAhNum);
    const awayAhDisplay = formatLineWithSign(-homeAhNum);
    const ahHomeOdds = mkts.ah_home_odds ?? linkedMatch?.markets?.full_spread_main?.home_odds;
    const ahAwayOdds = mkts.ah_away_odds ?? linkedMatch?.markets?.full_spread_main?.away_odds;

    const rawOu = quant.ou_line ?? linkedMatch?.markets?.full_total_main?.line;
    let ouNum = 2.5;
    if (typeof rawOu === "number") {
      ouNum = rawOu;
    } else if (rawOu) {
      const cleanOu = String(rawOu).trim();
      if (cleanOu.includes("/")) {
        const pts = cleanOu.split("/");
        const p1 = parseFloat(pts[0]);
        const p2 = parseFloat(pts[1]);
        if (!isNaN(p1) && !isNaN(p2)) ouNum = (p1 + p2) / 2;
      } else {
        ouNum = parseFloat(cleanOu) || 2.5;
      }
    }
    const ouDisplay = formatFractionNotation(ouNum);
    const ouOverOdds = mkts.ou_over_odds ?? linkedMatch?.markets?.full_total_main?.over_odds;
    const ouUnderOdds = mkts.ou_under_odds ?? linkedMatch?.markets?.full_total_main?.under_odds;

    const h2hHome = mkts.h2h_home ?? linkedMatch?.markets?.full_h2h?.home_odds;
    const h2hDraw = mkts.h2h_draw ?? linkedMatch?.markets?.full_h2h?.draw_odds;
    const h2hAway = mkts.h2h_away ?? linkedMatch?.markets?.full_h2h?.away_odds;

    const predDirection = record.predicted_direction;
    const predSel = (predDirection?.selection || record.leg?.direction || "").toUpperCase();
    const predMkt = (predDirection?.market || record.leg?.market || "").toUpperCase();

    const topScores = quant.top_scores || [];
    const xG = quant.forward_goals_expected != null 
      ? quant.forward_goals_expected 
      : ((quant.lambda_home || 0) + (quant.lambda_away || 0));

    const isExpanded = !!expandedLedgerRecordIds[record.record_id];

    return (
      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          {predDirection ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-700">
              <span>🎯 预测方向: {predDirection.market} [{predDirection.selection}] @ {predDirection.odds}</span>
              <span className="text-slate-400 font-normal">({((predDirection.model_probability || 0) * 100).toFixed(1)}%)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900 text-slate-400 border border-slate-800">
              <span>⚪ 未达开仓门禁</span>
            </span>
          )}

          <span className="text-[10px] text-slate-400 font-mono bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800">
            Forward λ: {quant.lambda_home ?? "-"} : {quant.lambda_away ?? "-"} (xG: {Number(xG || 0).toFixed(2)})
          </span>

          <span className="text-[10px] text-amber-300 font-mono bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-900">
            首选预测比分: {quant.projected_final_score || "-"}
          </span>

          <button
            onClick={() =>
              setExpandedLedgerRecordIds((prev) => ({
                ...prev,
                [record.record_id]: !isExpanded,
              }))
            }
            className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-0.5 underline ml-1"
          >
            {isExpanded ? (
              <>
                <span>收起全盘博弈</span>
                <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                <span>展开三项全盘博弈</span>
                <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        </div>

        {isExpanded && (
          <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2 mt-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800 space-y-1">
                <div className="text-[11px] font-bold text-blue-400 flex items-center justify-between">
                  <span>全场让球盘 (Asian Handicap)</span>
                  <span className="text-[10px] text-slate-400 font-mono">{homeAhDisplay}</span>
                </div>
                <div className="text-[10px] text-slate-300 flex justify-between font-mono">
                  <span>主队水位: {ahHomeOdds ?? "-"}</span>
                  <span>客队水位: {ahAwayOdds ?? "-"}</span>
                </div>
              </div>

              <div className="bg-slate-900/80 p-2 rounded border border-slate-800 space-y-1">
                <div className="text-[11px] font-bold text-emerald-400 flex items-center justify-between">
                  <span>全场大小球盘 (Over / Under)</span>
                  <span className="text-[10px] text-slate-400 font-mono">{ouDisplay}球</span>
                </div>
                <div className="text-[10px] text-slate-300 flex justify-between font-mono">
                  <span>大球水位: {ouOverOdds ?? "-"}</span>
                  <span>小球水位: {ouUnderOdds ?? "-"}</span>
                </div>
              </div>

              <div className="bg-slate-900/80 p-2 rounded border border-slate-800 space-y-1">
                <div className="text-[11px] font-bold text-purple-400 flex items-center justify-between">
                  <span>全场独赢 (1X2 European)</span>
                  <span className="text-[10px] text-slate-400 font-mono">三项盘</span>
                </div>
                <div className="text-[10px] text-slate-300 flex justify-between font-mono">
                  <span>主: {h2hHome ?? "-"}</span>
                  <span>平: {h2hDraw ?? "-"}</span>
                  <span>客: {h2hAway ?? "-"}</span>
                </div>
              </div>
            </div>

            {topScores.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-slate-800/80">
                <div className="text-[10px] text-slate-400 flex items-center justify-between">
                  <span>🎲 泊松推演 Top 完场比分概率分布:</span>
                  <span className="text-[9px] text-slate-500">联合概率降序排列</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {topScores.slice(0, 5).map((ts: any, sIdx: number) => (
                    <span
                      key={sIdx}
                      className="text-[10px] font-mono px-2 py-0.8 rounded border bg-slate-900 border-slate-800 text-slate-300 flex items-center gap-1"
                    >
                      <span className="text-amber-300 font-bold">{ts.score}</span>
                      <span className="text-slate-400">({((ts.probability || 0) * 100).toFixed(1)}%)</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // 单场核销执行
  const handleSettleRecord = async (recordId: string) => {
    const defaultScore = getDefaultScoreForRecord(
      universeLedger.find((r) => r.record_id === recordId) || formalLedger.find((r) => r.record_id === recordId)
    );
    const rawInput = settleInputs[recordId];
    const homeStr = rawInput?.home !== undefined && rawInput.home !== "" ? rawInput.home : defaultScore.home;
    const awayStr = rawInput?.away !== undefined && rawInput.away !== "" ? rawInput.away : defaultScore.away;
    const finalScore = {
      home: Math.max(0, parseInt(homeStr, 10) || 0),
      away: Math.max(0, parseInt(awayStr, 10) || 0),
    };
    const source = settleSources[recordId] || "雷速比分画布/接口校验";

    setSettlingIds((prev) => ({ ...prev, [recordId]: true }));
    setFeedback("正在执行核销并评估门禁归因与 OOS 样本...");
    try {
      const res = await fetch("/api/refactor/universe-ledger/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: recordId,
          stage: mode === "live" ? "LIVE" : "PREMATCH",
          final_score: finalScore,
          score_source: source,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const uni = data.universe_record;
        const verdict = uni?.settlement?.attribution?.notes || `结果: [${uni?.settlement?.outcome}]`;
        const oosMsg = data.oos_sample_ingested
          ? "✅ 已合规沉淀 1 条真实 OOS 校准样本"
          : "";
        setFeedback(`✅ 核销成功！${verdict} ${oosMsg}`);
        await onRefreshAll();
      } else {
        setFeedback(`❌ 核销结算失败: ${data.error || "未知错误"}`);
      }
    } catch (e: any) {
      setFeedback(`❌ 结算网络异常: ${e?.message}`);
    } finally {
      setSettlingIds((prev) => ({ ...prev, [recordId]: false }));
    }
  };

  // 一键雷速完场核销
  const handleAutoSettleLeisu = async () => {
    setAutoSettlingLeisu(true);
    try {
      const res = await fetch("/api/refactor/settlement/execute-leisu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(data.message || `雷速核销完成：已核销 ${data.settled_count} 场比赛！`);
        await onRefreshAll();
      } else {
        setFeedback(`雷速核销提示：${data.error || "未发现可核销的完场数据"}`);
      }
    } catch (e: any) {
      setFeedback(`核销失败：${e?.message}`);
    } finally {
      setAutoSettlingLeisu(false);
    }
  };

  // 一键双轨对齐同步核销
  const handleSyncUniverseToFormal = async () => {
    setIsSyncingLedger(true);
    setFeedback("正在对齐双轨台账并同步核销正式推荐与沉淀 OOS 样本...");
    try {
      const res = await fetch("/api/refactor/settlement/sync-universe-to-formal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: mode === "live" ? "LIVE" : "PREMATCH" }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`✅ ${data.message}`);
        await onRefreshAll();
      } else {
        setFeedback(`❌ 对齐同步失败: ${data.error || "未知错误"}`);
      }
    } catch (e: any) {
      setFeedback(`❌ 对齐同步网络异常: ${e?.message}`);
    } finally {
      setIsSyncingLedger(false);
    }
  };

  // 一键批量核销
  const handleBatchSettleAll = async () => {
    const targetList =
      ledgerTrack === "UNIVERSE" || ledgerTrack === "REFLECTION"
        ? universeLedger.filter((r) => !r.settlement?.is_settled)
        : formalLedger.filter((r) => !r.settlement?.is_settled);

    if (targetList.length === 0) {
      setFeedback("ℹ️ 当前台账中没有待核销的比赛记录。");
      return;
    }

    setIsBatchSettling(true);
    setFeedback(`正在一键批量核销当前 ${targetList.length} 场待核销比赛...`);

    const items = targetList.map((record) => {
      const defaultScore = getDefaultScoreForRecord(record);
      const rawInput = settleInputs[record.record_id];
      const homeStr = rawInput?.home !== undefined && rawInput.home !== "" ? rawInput.home : defaultScore.home;
      const awayStr = rawInput?.away !== undefined && rawInput.away !== "" ? rawInput.away : defaultScore.away;
      const finalScore = {
        home: Math.max(0, parseInt(homeStr, 10) || 0),
        away: Math.max(0, parseInt(awayStr, 10) || 0),
      };
      const source = settleSources[record.record_id] || "批量一键核销";
      return {
        record_id: record.record_id,
        stage: mode === "live" ? "LIVE" : "PREMATCH",
        final_score: finalScore,
        score_source: source,
      };
    });

    try {
      const res = await fetch("/api/refactor/settlement/execute-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: mode === "live" ? "LIVE" : "PREMATCH",
          items,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`✅ 一键批量核销成功！已批量结算 ${data.settled_count || items.length} 场比赛并同步沉淀 OOS 样本！`);
        await onRefreshAll();
      } else {
        setFeedback(`❌ 批量核销失败: ${data.error || "未知错误"}`);
      }
    } catch (e: any) {
      setFeedback(`❌ 批量核销网络异常: ${e?.message}`);
    } finally {
      setIsBatchSettling(false);
    }
  };

  // 重置全部核销
  const handleResetAllSettlements = async () => {
    setIsResettingSettlement(true);
    setFeedback("正在重置当前阶段全部核销状态...");
    try {
      const res = await fetch("/api/refactor/settlement/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: mode === "live" ? "LIVE" : "PREMATCH" }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`✅ ${data.message}`);
        setEditingSettleIds({});
        await onRefreshAll();
      } else {
        setFeedback(`❌ 重置核销失败: ${data.error || "未知错误"}`);
      }
    } catch (err: any) {
      setFeedback(`❌ 重置网络异常: ${err?.message || err}`);
    } finally {
      setIsResettingSettlement(false);
    }
  };

  // 清空测试数据
  const handleClearLedger = async () => {
    if (!confirm(`确定清空当前 ${mode === "live" ? "滚球" : "赛前"} 阶段全部台账测试数据吗？`)) return;
    try {
      const res = await fetch("/api/refactor/formal-ledger/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: mode === "live" ? "LIVE" : "PREMATCH" }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`✅ 已清空当前阶段台账数据 (${data.cleared_count} 条)`);
        await onRefreshAll();
      }
    } catch (e: any) {
      setFeedback(`❌ 清空异常: ${e?.message}`);
    }
  };

  return (
    <div className="space-y-3.5 animate-in fade-in">
      {/* 统一中枢头部导航 */}
      <div className="flex items-center justify-between bg-slate-900/90 p-3 rounded-xl border border-indigo-900/60 shadow-sm flex-wrap gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>全生命周期赛后复盘与核销结算中枢 (SSOT)</span>
              <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800 font-mono">
                三轨合一事实来源
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              统一管辖：① 实盘真金盈亏核销与 OOS 样本沉淀、② 全量门禁避坑与误杀归因、③ 泊松分布推演与赛后反思梳理。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onBackToMatches}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 font-medium shadow-xs"
          >
            <span>← 返回比赛实时推演工作台</span>
          </button>
        </div>
      </div>

      {/* OOS 监控看板 */}
      <div className="bg-slate-900/80 rounded-xl border border-blue-950/80 p-3.5 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100">
                  OOS 样本校准档案与实盘自增监控看板
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    oosStatus?.status === "VALIDATED"
                      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                  }`}
                >
                  {oosStatus?.status === "VALIDATED" ? "✅ VALIDATED (成熟可用)" : "⚠️ PENDING_CALIBRATION (实盘样本累积中)"}
                </span>
                <span className="text-[10px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
                  Layer 06 实盘闭环契约
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                严格遵循重构技术架构契约：仅当正式 A/B 级推荐完成赛后比分核销后，自动提取真实公允概率增量沉淀至 OOS 档案，零伪造数据。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefreshAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>刷新校准指标</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">真实核销沉淀样本</div>
            <div className="text-base font-bold font-mono text-blue-300 mt-0.5">
              {oosStatus?.sample_count ?? 0} <span className="text-[10px] font-normal text-slate-500">条</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">来源：Layer 06 实盘真实核销</div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">有效样本量 (ESS)</div>
            <div className="text-base font-bold font-mono text-emerald-300 mt-0.5">
              {oosStatus?.ess != null ? Number(oosStatus.ess).toFixed(2) : "0.00"}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">聚类退火相关性折算</div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">分桶校准剖面数</div>
            <div className="text-base font-bold font-mono text-purple-300 mt-0.5">
              {oosStatus?.profile_count ?? 0} <span className="text-[10px] font-normal text-slate-500">个区间</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">自适应等频五分位分桶</div>
          </div>

          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">Brier 预测误差分值</div>
            <div className="text-base font-bold font-mono text-amber-300 mt-0.5">
              {oosStatus?.brier_score != null ? oosStatus.brier_score.toFixed(4) : "暂无 (实盘样本累积中)"}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">随机无信息基线为 0.2500</div>
          </div>
        </div>
      </div>

      {/* 重构双轨台账与核销中心主体 */}
      <div className="bg-slate-900/70 rounded-xl border border-indigo-900/60 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>重构双轨台账与核销结算中心</span>
                <span className="text-xs text-slate-400 font-normal">({mode === "live" ? "滚球" : "赛前"})</span>
              </span>

              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setLedgerTrack("UNIVERSE")}
                  className={`px-3 py-1 rounded-md transition-all font-semibold flex items-center gap-1.5 ${
                    ledgerTrack === "UNIVERSE" ? "bg-purple-600 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>全量门禁避坑归因</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-200 border border-purple-800 font-mono">
                    {universeLedger.length} 场
                  </span>
                </button>
                <button
                  onClick={() => setLedgerTrack("FORMAL")}
                  className={`px-3 py-1 rounded-md transition-all font-semibold flex items-center gap-1.5 ${
                    ledgerTrack === "FORMAL" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>实盘推荐盈亏核销</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-200 border border-indigo-800 font-mono">
                    {formalLedger.length} 场
                  </span>
                </button>
                <button
                  onClick={() => setLedgerTrack("REFLECTION")}
                  className={`px-3 py-1 rounded-md transition-all font-semibold flex items-center gap-1.5 ${
                    ledgerTrack === "REFLECTION" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>比分推演与赛后反思</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-200 border border-emerald-800 font-mono">
                    {universeLedger.filter((r) => r.settlement?.is_settled).length} 已核销
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 过滤器 */}
            {ledgerTrack === "UNIVERSE" ? (
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setUniverseFilter("ALL")}
                  className={`px-2 py-1 rounded transition-colors ${universeFilter === "ALL" ? "bg-purple-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
                >
                  全部 ({universeLedger.length})
                </button>
                <button
                  onClick={() => setUniverseFilter("UNSETTLED")}
                  className={`px-2 py-1 rounded transition-colors ${universeFilter === "UNSETTLED" ? "bg-purple-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
                >
                  待核销 ({universeLedger.filter((r) => !r.settlement?.is_settled).length})
                </button>
                <button
                  onClick={() => setUniverseFilter("SETTLED")}
                  className={`px-2 py-1 rounded transition-colors ${universeFilter === "SETTLED" ? "bg-purple-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
                >
                  已结算 ({universeLedger.filter((r) => r.settlement?.is_settled).length})
                </button>
                <button
                  onClick={() => setUniverseFilter("AVOIDANCE")}
                  className={`px-2 py-1 rounded transition-colors ${universeFilter === "AVOIDANCE" ? "bg-emerald-600 text-white font-medium" : "text-emerald-400 hover:text-emerald-200"}`}
                >
                  🛡️ 避坑 ({universeLedger.filter((r) => r.settlement?.attribution?.verdict_label === "SUCCESSFUL_AVOIDANCE").length})
                </button>
                <button
                  onClick={() => setUniverseFilter("FALSE_NEGATIVE")}
                  className={`px-2 py-1 rounded transition-colors ${universeFilter === "FALSE_NEGATIVE" ? "bg-amber-600 text-white font-medium" : "text-amber-400 hover:text-amber-200"}`}
                >
                  ⚠️ 误杀 ({universeLedger.filter((r) => r.settlement?.attribution?.verdict_label === "MODEL_FALSE_NEGATIVE").length})
                </button>
              </div>
            ) : ledgerTrack === "FORMAL" ? (
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setLedgerFilter("ALL")}
                  className={`px-2 py-1 rounded transition-colors ${ledgerFilter === "ALL" ? "bg-indigo-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
                >
                  全部 ({formalLedger.length})
                </button>
                <button
                  onClick={() => setLedgerFilter("UNSETTLED")}
                  className={`px-2 py-1 rounded transition-colors ${ledgerFilter === "UNSETTLED" ? "bg-indigo-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
                >
                  待核销 ({formalLedger.filter((r) => !r.settlement?.is_settled).length})
                </button>
                <button
                  onClick={() => setLedgerFilter("SETTLED")}
                  className={`px-2 py-1 rounded transition-colors ${ledgerFilter === "SETTLED" ? "bg-indigo-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
                >
                  已结算 ({formalLedger.filter((r) => r.settlement?.is_settled).length})
                </button>
              </div>
            ) : (
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setReflectionFilter("ALL")}
                  className={`px-2 py-1 rounded transition-colors ${reflectionFilter === "ALL" ? "bg-emerald-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
                >
                  全部 ({universeLedger.length})
                </button>
                <button
                  onClick={() => setReflectionFilter("UNSETTLED")}
                  className={`px-2 py-1 rounded transition-colors ${reflectionFilter === "UNSETTLED" ? "bg-emerald-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
                >
                  待完场 ({universeLedger.filter((r) => !r.settlement?.is_settled).length})
                </button>
                <button
                  onClick={() => setReflectionFilter("HIT")}
                  className={`px-2 py-1 rounded transition-colors ${reflectionFilter === "HIT" ? "bg-emerald-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"}`}
                >
                  ✅ 命中Top3 ({universeLedger.filter((r) => r.settlement?.reflection?.score_hit).length})
                </button>
              </div>
            )}

            <button
              onClick={() => onOpenManualLedger()}
              className="px-2.5 py-1 text-xs rounded border border-indigo-600 bg-indigo-900/60 text-indigo-200 hover:bg-indigo-800 transition-colors flex items-center gap-1 font-semibold shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5 text-indigo-300" />
              <span>手动推荐入账</span>
            </button>

            <button
              onClick={handleAutoSettleLeisu}
              disabled={autoSettlingLeisu}
              className="px-2.5 py-1 text-xs rounded border border-emerald-600 bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900/80 transition-colors flex items-center gap-1 font-semibold shadow-xs"
            >
              <Zap className={`w-3.5 h-3.5 ${autoSettlingLeisu ? "animate-spin" : "text-amber-300"}`} />
              <span>{autoSettlingLeisu ? "核销中..." : "雷速完场自动核销"}</span>
            </button>

            <button
              onClick={handleSyncUniverseToFormal}
              disabled={isSyncingLedger}
              className="px-2.5 py-1 text-xs rounded border border-purple-600 bg-purple-950/80 text-purple-200 hover:bg-purple-900/80 disabled:opacity-40 transition-colors flex items-center gap-1 font-semibold shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLedger ? "animate-spin text-purple-200" : "text-purple-300"}`} />
              <span>{isSyncingLedger ? "同步核销中..." : "⚡ 双轨对齐同步核销"}</span>
            </button>

            <button
              onClick={handleBatchSettleAll}
              disabled={isBatchSettling}
              className="px-2.5 py-1 text-xs rounded border border-blue-600 bg-blue-950/80 text-blue-200 hover:bg-blue-900/80 disabled:opacity-40 transition-colors flex items-center gap-1 font-semibold shadow-xs"
            >
              <CheckCheck className={`w-3.5 h-3.5 ${isBatchSettling ? "animate-spin" : "text-cyan-300"}`} />
              <span>{isBatchSettling ? "批量核销中..." : "一键批量核销"}</span>
            </button>

            <button
              onClick={handleResetAllSettlements}
              disabled={isResettingSettlement}
              className="px-2.5 py-1 text-xs rounded border border-amber-800/80 bg-amber-950/60 text-amber-200 hover:bg-amber-900/80 disabled:opacity-40 transition-colors flex items-center gap-1 font-medium shadow-xs"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResettingSettlement ? "animate-spin" : "text-amber-300"}`} />
              <span>{isResettingSettlement ? "重置中..." : "↺ 重置全部"}</span>
            </button>

            <button
              onClick={handleClearLedger}
              className="px-2.5 py-1 text-xs rounded border border-rose-800/80 text-rose-300 hover:bg-rose-950/60 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>清空测试数据</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="text-xs p-2 rounded bg-indigo-950/50 border border-indigo-800/60 text-indigo-200 animate-in fade-in">
            {feedback}
          </div>
        )}

        {/* 轨道二全量归因记录列表 */}
        {ledgerTrack === "UNIVERSE" ? (
          universeLedger.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center bg-slate-950/40 rounded-lg border border-slate-800/60 space-y-1">
              <div>当前模式（{mode === "live" ? "滚球" : "赛前"}）暂无全量预测归因记录。</div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {universeLedger
                .filter((record) => {
                  if (universeFilter === "UNSETTLED") return !record.settlement?.is_settled;
                  if (universeFilter === "SETTLED") return record.settlement?.is_settled;
                  if (universeFilter === "AVOIDANCE") return record.settlement?.attribution?.verdict_label === "SUCCESSFUL_AVOIDANCE";
                  if (universeFilter === "FALSE_NEGATIVE") return record.settlement?.attribution?.verdict_label === "MODEL_FALSE_NEGATIVE";
                  return true;
                })
                .map((record) => {
                  const isSettled = record.settlement?.is_settled;
                  const outcome = record.settlement?.outcome;
                  const attribution = record.settlement?.attribution;
                  const defaultScore = getDefaultScoreForRecord(record);
                  const rawInput = settleInputs[record.record_id];
                  const curInput = {
                    home: rawInput?.home !== undefined ? rawInput.home : defaultScore.home,
                    away: rawInput?.away !== undefined ? rawInput.away : defaultScore.away,
                  };
                  const curSource = settleSources[record.record_id] || "雷速比分画布/接口校验";
                  const isSettling = settlingIds[record.record_id];

                  const gateBadgeClass =
                    record.gate_category === "QUALIFIED_FORMAL"
                      ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                      : record.gate_category === "BLOCKED_BY_AI_C_GRADE"
                      ? "bg-rose-950 text-rose-300 border-rose-700"
                      : "bg-amber-950 text-amber-300 border-amber-700";

                  return (
                    <div
                      key={record.record_id}
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/80 rounded-lg p-3 border border-slate-800 hover:border-slate-700 transition-all"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {renderDualTeamNames(record)}
                          <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                            {record.league_key}
                          </span>
                          <span className="text-[10px] text-slate-300 font-mono bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700/80 flex items-center gap-1 shadow-xs">
                            <span className="text-slate-400">📅</span>
                            <span>{formatKickoffDateTime(record.kickoff_time, record.minute_or_status || "赛前")}</span>
                          </span>
                          <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/80 flex items-center gap-1 shadow-xs">
                            <span>⏱️ 推荐时:</span>
                            <span className="font-semibold text-cyan-200">{record.minute_or_status || "赛前"}</span>
                            <span className="text-slate-500">|</span>
                            <span className="font-bold text-amber-300">比分: {getScoreAtPredictionString(record)}</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${gateBadgeClass}`}>
                            {record.gate_category === "QUALIFIED_FORMAL" ? "✅ A/B可实盘" : record.gate_category}
                          </span>
                        </div>

                        <div className="text-xs text-slate-300 space-y-1">
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-300">门禁判定:</span>
                            <span className={record.gate_category === "QUALIFIED_FORMAL" ? "text-emerald-400 font-medium" : "text-amber-300 font-medium"}>
                              {record.gate_reason_description}
                            </span>
                          </div>
                          {renderQuantMarketSnapshot(record)}
                        </div>

                        {attribution && (
                          <div className="pt-1">
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-semibold border bg-slate-900 text-slate-300 border-slate-700">
                              {attribution.notes}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!isSettled ? (
                          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
                            <input
                              type="number"
                              min="0"
                              placeholder={defaultScore.home}
                              value={curInput.home}
                              onChange={(e) =>
                                setSettleInputs((prev) => ({
                                  ...prev,
                                  [record.record_id]: { ...curInput, home: sanitizeScoreInput(e.target.value) },
                                }))
                              }
                              className="w-10 px-1.5 py-0.5 bg-slate-950 text-slate-200 border border-slate-700 rounded text-center text-xs focus:outline-none focus:border-emerald-500 font-mono"
                            />
                            <span className="text-slate-500 text-xs">:</span>
                            <input
                              type="number"
                              min="0"
                              placeholder={defaultScore.away}
                              value={curInput.away}
                              onChange={(e) =>
                                setSettleInputs((prev) => ({
                                  ...prev,
                                  [record.record_id]: { ...curInput, away: sanitizeScoreInput(e.target.value) },
                                }))
                              }
                              className="w-10 px-1.5 py-0.5 bg-slate-950 text-slate-200 border border-slate-700 rounded text-center text-xs focus:outline-none focus:border-emerald-500 font-mono"
                            />
                            <select
                              value={curSource}
                              onChange={(e) =>
                                setSettleSources((prev) => ({
                                  ...prev,
                                  [record.record_id]: e.target.value,
                                }))
                              }
                              className="bg-slate-950 text-[10px] text-slate-300 border border-slate-700 rounded px-1.5 py-0.5 focus:outline-none"
                            >
                              <option value="雷速比分画布/接口校验">雷速比分画布/接口</option>
                              <option value="官方完场赛果核验">官方完场核验</option>
                              <option value="人工/现场核对">人工核对</option>
                            </select>
                            <button
                              onClick={() => handleSettleRecord(record.record_id)}
                              disabled={isSettling}
                              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors shadow-xs"
                            >
                              {isSettling ? "核销中..." : "核销"}
                            </button>
                          </div>
                        ) : (
                          <div className="text-right">
                            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-900 font-semibold">
                              已结算 [{outcome}]
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )
        ) : ledgerTrack === "FORMAL" ? (
          formalLedger.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center bg-slate-950/40 rounded-lg border border-slate-800/60 space-y-1">
              <div>当前模式（{mode === "live" ? "滚球" : "赛前"}）正式推荐台账暂无记录。</div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {formalLedger
                .filter((record) => {
                  if (ledgerFilter === "UNSETTLED") return !record.settlement?.is_settled;
                  if (ledgerFilter === "SETTLED") return record.settlement?.is_settled;
                  return true;
                })
                .map((record) => {
                  const isSettled = record.settlement?.is_settled;
                  const outcome = record.settlement?.outcome;
                  const defaultScore = getDefaultScoreForRecord(record);
                  const rawInput = settleInputs[record.record_id];
                  const curInput = {
                    home: rawInput?.home !== undefined ? rawInput.home : defaultScore.home,
                    away: rawInput?.away !== undefined ? rawInput.away : defaultScore.away,
                  };
                  const isSettling = settlingIds[record.record_id];

                  return (
                    <div
                      key={record.record_id}
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/80 rounded-lg p-3 border border-slate-800 hover:border-slate-700 transition-all"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {renderDualTeamNames(record)}
                          <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                            {record.league_key}
                          </span>
                          <span className="text-[10px] text-indigo-300 font-mono bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800">
                            实盘推荐: {record.leg?.market} [{record.leg?.selected_line}] @ {record.leg?.current_odds}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isSettled ? (
                          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
                            <input
                              type="number"
                              min="0"
                              placeholder={defaultScore.home}
                              value={curInput.home}
                              onChange={(e) =>
                                setSettleInputs((prev) => ({
                                  ...prev,
                                  [record.record_id]: { ...curInput, home: sanitizeScoreInput(e.target.value) },
                                }))
                              }
                              className="w-10 px-1.5 py-0.5 bg-slate-950 text-slate-200 border border-slate-700 rounded text-center text-xs focus:outline-none focus:border-emerald-500 font-mono"
                            />
                            <span className="text-slate-500 text-xs">:</span>
                            <input
                              type="number"
                              min="0"
                              placeholder={defaultScore.away}
                              value={curInput.away}
                              onChange={(e) =>
                                setSettleInputs((prev) => ({
                                  ...prev,
                                  [record.record_id]: { ...curInput, away: sanitizeScoreInput(e.target.value) },
                                }))
                              }
                              className="w-10 px-1.5 py-0.5 bg-slate-950 text-slate-200 border border-slate-700 rounded text-center text-xs focus:outline-none focus:border-emerald-500 font-mono"
                            />
                            <button
                              onClick={() => handleSettleRecord(record.record_id)}
                              disabled={isSettling}
                              className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors shadow-xs"
                            >
                              {isSettling ? "核销中..." : "核销"}
                            </button>
                          </div>
                        ) : (
                          <div className="text-right">
                            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-900 font-semibold">
                              已结算 [{outcome}]
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )
        ) : (
          <div className="space-y-2.5">
            {universeLedger
              .filter((r) => r.settlement?.is_settled)
              .map((record) => {
                const refl = record.settlement?.reflection;
                return (
                  <div
                    key={record.record_id}
                    className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      {renderDualTeamNames(record)}
                      <span className="text-xs font-mono text-emerald-300 font-bold">
                        实际比分: {record.settlement?.final_score?.home} - {record.settlement?.final_score?.away}
                      </span>
                    </div>
                    {refl && (
                      <div className="text-xs text-slate-300">
                        {refl.diagnostic_notes}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};

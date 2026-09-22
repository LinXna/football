import React, { useState, useEffect, useCallback } from "react";
import {
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Target,
  Sparkles,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  HelpCircle,
  Clock,
  ShieldCheck,
  Check,
  X,
  FileCheck2,
  Calendar,
  Zap,
} from "lucide-react";

interface CalculationSnapshot {
  minute_or_status: string;
  score_at_calculation: { home: number; away: number } | null;
  score_verified: boolean;
  markets: {
    ah_line: number | null;
    ah_home_odds: number | null;
    ah_away_odds: number | null;
    ou_line: number | null;
    ou_over_odds: number | null;
    ou_under_odds: number | null;
    h2h_home: number | null;
    h2h_draw: number | null;
    h2h_away: number | null;
  };
  quant: {
    lambda_home: number;
    lambda_away: number;
    forward_goals_expected: number;
    projected_final_score: string;
    top_scores: Array<{ score: string; probability: number }>;
    bdi: number;
    candidate_pipeline_state: string;
  };
}

interface ArchivedMatch {
  archive_id: string;
  canonical_id: string;
  match_slug: string;
  mode: "live" | "prematch";
  stage: "LIVE" | "PREMATCH";
  created_at: string;
  updated_at: string;
  league_name: string;
  home_team_name: string;
  away_team_name: string;
  commence_time: string | null;
  calculation_snapshot: CalculationSnapshot;
  settlement_status: "PENDING" | "SETTLED" | "VOID";
  finished_score: { home: number; away: number } | null;
  finished_score_source: string | null;
  settled_at: string | null;
  reflection: {
    actual_total_goals: number;
    goal_diff_actual: number;
    score_hit: boolean;
    exact_score_hit: boolean;
    ah_outcome: "WIN" | "LOSE" | "PUSH" | "HALF_WIN" | "HALF_LOSE" | null;
    ou_outcome: "WIN" | "LOSE" | "PUSH" | "HALF_WIN" | "HALF_LOSE" | null;
    diagnostic_notes: string;
  } | null;
}

interface ArchiveSummary {
  total_archived: number;
  settled_count: number;
  pending_count: number;
  score_hits: number;
  exact_score_hits: number;
  score_hit_rate: number;
  exact_hit_rate: number;
}

export const MatchArchiveCenter: React.FC<{
  currentMode: "live" | "prematch";
  onRefreshParent?: () => void;
}> = ({ currentMode, onRefreshParent }) => {
  const [records, setRecords] = useState<ArchivedMatch[]>([]);
  const [summary, setSummary] = useState<ArchiveSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [settlingBatch, setSettlingBatch] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 过滤状态
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "SETTLED">("ALL");
  const [modeFilter, setModeFilter] = useState<"ALL" | "live" | "prematch">("ALL");
  const [searchKeyword, setSearchKeyword] = useState("");

  // 单场手动录入比分状态
  const [manualInputs, setManualInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // 规范说明弹窗
  const [showGuideModal, setShowGuideModal] = useState(false);

  const fetchArchive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/refactor/match-archive");
      const data = await res.json();
      if (data.success) {
        setRecords(data.records || []);
        setSummary(data.summary || null);
      }
    } catch (e: any) {
      console.error("Fetch archive error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchive();
  }, [fetchArchive]);

  // 雷速完场自动核销与反思梳理
  const handleAutoSettleWithLeisu = async () => {
    setSettlingBatch(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/refactor/match-archive/settle-leisu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: "success",
          message: data.message || `成功核销 ${data.settled_count} 场完场赛事并生成赛后反思！`,
        });
        await fetchArchive();
        if (onRefreshParent) onRefreshParent();
      } else {
        setFeedback({ type: "error", message: data.error || "雷速核销反思执行异常" });
      }
    } catch (e: any) {
      setFeedback({ type: "error", message: e?.message || "网络请求异常" });
    } finally {
      setSettlingBatch(false);
    }
  };

  // 单场手动录入核销
  const handleSettleSingle = async (archiveId: string) => {
    const input = manualInputs[archiveId];
    if (!input || input.home === "" || input.away === "") {
      alert("请输入主客队完场比分");
      return;
    }
    const finHome = parseInt(input.home, 10);
    const finAway = parseInt(input.away, 10);
    if (isNaN(finHome) || isNaN(finAway)) {
      alert("比分格式不正确，必须为数字");
      return;
    }

    setSubmittingId(archiveId);
    try {
      const res = await fetch("/api/refactor/match-archive/settle-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archive_id: archiveId,
          final_score: { home: finHome, away: finAway },
          source: "人工核实录入",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: "success", message: data.message });
        await fetchArchive();
        if (onRefreshParent) onRefreshParent();
      } else {
        setFeedback({ type: "error", message: data.error || "录入失败" });
      }
    } catch (e: any) {
      setFeedback({ type: "error", message: e?.message || "网络异常" });
    } finally {
      setSubmittingId(null);
    }
  };

  // 过滤后的赛事
  const filteredRecords = records.filter((r) => {
    if (statusFilter !== "ALL" && r.settlement_status !== statusFilter) return false;
    if (modeFilter !== "ALL" && r.mode !== modeFilter) return false;
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      const matchText = `${r.league_name} ${r.home_team_name} ${r.away_team_name}`.toLowerCase();
      if (!matchText.includes(kw)) return false;
    }
    return true;
  });

  return (
    <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 space-y-4 shadow-xl">
      {/* 头部控制区 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-slate-100">
              赛事档案库与赛后反思梳理中心
            </h2>
            <span className="text-[10px] bg-indigo-950/80 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800 font-mono">
              Layer 02/03 全量建档
            </span>
          </div>
          <p className="text-xs text-slate-400">
            每一场导入量化计算的比赛均在此自动建档封存初始预测快照。通过雷速完场数据或人工比分交叉核销，自动输出赛后反思、胜率校准与误差复盘！
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowGuideModal(true)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
            title="查看推荐台账与 OOS 准入规范"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>台账与OOS准入规范</span>
          </button>

          <button
            onClick={fetchArchive}
            disabled={loading}
            className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>刷新档案</span>
          </button>

          <button
            onClick={handleAutoSettleWithLeisu}
            disabled={settlingBatch}
            className="px-3 py-1.5 text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            title="利用雷速接口完场数据全自动核销并生成赛后反思"
          >
            <Zap className={`w-3.5 h-3.5 ${settlingBatch ? "animate-spin" : "text-amber-300"}`} />
            <span>{settlingBatch ? "雷速核销梳理中..." : "雷速完场一键反思核销"}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs border flex items-center justify-between gap-2 animate-in fade-in ${
            feedback.type === "success"
              ? "bg-emerald-950/60 border-emerald-800 text-emerald-200"
              : "bg-rose-950/60 border-rose-800 text-rose-200"
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 核心反思梳理统计看板 */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">总建档赛事</div>
            <div className="text-lg font-bold font-mono text-slate-100 mt-0.5">
              {summary.total_archived} <span className="text-xs font-normal text-slate-500">场</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              待完场: {summary.pending_count} 场 / 已核销: {summary.settled_count} 场
            </div>
          </div>

          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">Top 3 比分命中数</div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {summary.score_hits} <span className="text-xs font-normal text-slate-500">/ {summary.settled_count}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              落入模型前三预测分布
            </div>
          </div>

          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">比分分布覆盖率</div>
            <div className="text-lg font-bold font-mono text-blue-400 mt-0.5">
              {summary.score_hit_rate}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              模型前瞻概率质量良好
            </div>
          </div>

          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 font-medium">精确首选比分命中</div>
            <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">
              {summary.exact_score_hits} <span className="text-xs font-normal text-slate-500">场 ({summary.exact_hit_rate}%)</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              100% 击中最高概率首选比分
            </div>
          </div>

          <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-4 lg:col-span-1">
            <div className="text-[10px] text-slate-400 font-medium">反思与自优化状态</div>
            <div className="text-xs font-semibold text-teal-300 mt-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{summary.settled_count > 0 ? "闭环持续演进" : "等待完场赛果"}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              核销赛果自动注入 OOS 校准库
            </div>
          </div>
        </div>
      )}

      {/* 搜索与过滤工具栏 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            状态筛选:
          </span>
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-2.5 py-1 text-xs rounded-md transition-all ${
              statusFilter === "ALL" ? "bg-blue-600 text-white font-semibold" : "text-slate-400 hover:text-white"
            }`}
          >
            全部 ({records.length})
          </button>
          <button
            onClick={() => setStatusFilter("PENDING")}
            className={`px-2.5 py-1 text-xs rounded-md transition-all ${
              statusFilter === "PENDING" ? "bg-amber-600 text-white font-semibold" : "text-slate-400 hover:text-white"
            }`}
          >
            待完场 ({records.filter((r) => r.settlement_status === "PENDING").length})
          </button>
          <button
            onClick={() => setStatusFilter("SETTLED")}
            className={`px-2.5 py-1 text-xs rounded-md transition-all ${
              statusFilter === "SETTLED" ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 hover:text-white"
            }`}
          >
            已核销反思 ({records.filter((r) => r.settlement_status === "SETTLED").length})
          </button>

          <span className="text-slate-700">|</span>

          <button
            onClick={() => setModeFilter("ALL")}
            className={`px-2 py-1 text-xs rounded-md transition-all ${
              modeFilter === "ALL" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            全部阶段
          </button>
          <button
            onClick={() => setModeFilter("live")}
            className={`px-2 py-1 text-xs rounded-md transition-all ${
              modeFilter === "live" ? "bg-rose-950 text-rose-300 border border-rose-800" : "text-slate-400 hover:text-white"
            }`}
          >
            滚球
          </button>
          <button
            onClick={() => setModeFilter("prematch")}
            className={`px-2 py-1 text-xs rounded-md transition-all ${
              modeFilter === "prematch" ? "bg-indigo-950 text-indigo-300 border border-indigo-800" : "text-slate-400 hover:text-white"
            }`}
          >
            赛前
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索队名、联赛..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 档案列表卡片 */}
      {filteredRecords.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800 space-y-2">
          <Database className="w-8 h-8 mx-auto text-slate-600 opacity-40" />
          <p className="text-sm text-slate-300">档案库中暂无匹配的比赛记录</p>
          <p className="text-xs text-slate-500">
            当您导入 YBTY / 雷速数据并计算量化特征后，系统会自动在此为每场比赛建立完整档案。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((match) => {
            const isSettled = match.settlement_status === "SETTLED";
            const q = match.calculation_snapshot?.quant;
            const mk = match.calculation_snapshot?.markets;
            const scoreAtRec = match.calculation_snapshot?.score_at_calculation;
            const curInput = manualInputs[match.archive_id] || { home: "", away: "" };
            const isSubmitting = submittingId === match.archive_id;

            return (
              <div
                key={match.archive_id}
                className={`rounded-xl border p-3.5 transition-all ${
                  isSettled
                    ? "bg-slate-950/90 border-slate-800 hover:border-slate-700"
                    : "bg-slate-950/60 border-indigo-900/40 hover:border-indigo-800"
                }`}
              >
                {/* 赛事信息条 */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">
                        {match.home_team_name} vs {match.away_team_name}
                      </span>
                      <span className="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">
                        {match.league_name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                          match.mode === "live"
                            ? "bg-rose-950/80 text-rose-300 border border-rose-800"
                            : "bg-indigo-950/80 text-indigo-300 border border-indigo-800"
                        }`}
                      >
                        {match.mode === "live" ? "滚球" : "赛前"}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        开赛: {match.commence_time?.slice(5, 16) || "未标时间"}
                      </span>
                      <span className="text-[10px] text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-900 font-mono">
                        建档节点: {match.calculation_snapshot?.minute_or_status} (比分: {scoreAtRec ? `${scoreAtRec.home}-${scoreAtRec.away}` : "0-0"})
                      </span>
                    </div>

                    {/* 预测快照指标 */}
                    <div className="flex items-center gap-3 text-xs text-slate-300 flex-wrap pt-0.5">
                      <span className="text-amber-300 font-medium">
                        λ期望: 主 {q?.lambda_home?.toFixed(2)} / 客 {q?.lambda_away?.toFixed(2)} (前瞻期望: {q?.forward_goals_expected?.toFixed(2)})
                      </span>
                      <span className="text-purple-300 font-medium">
                        模型首选比分: <span className="font-bold">{q?.projected_final_score}</span>
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        Top 3 预测: {(q?.top_scores || []).map((s) => `${s.score} (${(s.probability * 100).toFixed(0)}%)`).join(", ")}
                      </span>
                      {mk?.ah_line != null && (
                        <span className="text-indigo-300 text-[11px]">
                          亚盘: {mk.ah_line > 0 ? `+${mk.ah_line}` : mk.ah_line}
                        </span>
                      )}
                      {mk?.ou_line != null && (
                        <span className="text-emerald-300 text-[11px]">
                          大小盘: {mk.ou_line}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 状态徽章与核销操作区 */}
                  <div className="shrink-0 flex items-center gap-2">
                    {isSettled ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-emerald-950 text-emerald-300 px-2.5 py-1 rounded border border-emerald-800 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          已完场反思
                        </span>
                        <span className="text-xs font-mono font-bold text-white bg-slate-900 px-2 py-1 rounded border border-slate-700">
                          完场: {match.finished_score?.home} - {match.finished_score?.away}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-[11px] text-slate-400">完场录入:</span>
                        <input
                          type="number"
                          placeholder="主"
                          value={curInput.home}
                          onChange={(e) =>
                            setManualInputs((prev) => ({
                              ...prev,
                              [match.archive_id]: { ...curInput, home: e.target.value },
                            }))
                          }
                          className="w-10 px-1 py-0.5 bg-slate-950 text-white text-center text-xs font-mono rounded border border-slate-700 focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-slate-500 text-xs">-</span>
                        <input
                          type="number"
                          placeholder="客"
                          value={curInput.away}
                          onChange={(e) =>
                            setManualInputs((prev) => ({
                              ...prev,
                              [match.archive_id]: { ...curInput, away: e.target.value },
                            }))
                          }
                          className="w-10 px-1 py-0.5 bg-slate-950 text-white text-center text-xs font-mono rounded border border-slate-700 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => handleSettleSingle(match.archive_id)}
                          disabled={isSubmitting}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors"
                        >
                          {isSubmitting ? "..." : "核销反思"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 赛后反思梳理深度展示区 */}
                {isSettled && match.reflection && (
                  <div className="mt-2.5 pt-2 border-t border-slate-900 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {match.reflection.exact_score_hit ? (
                        <span className="px-2 py-0.5 bg-purple-950/80 text-purple-300 border border-purple-700 rounded font-bold flex items-center gap-1">
                          🎯 极高精度完全命中
                        </span>
                      ) : match.reflection.score_hit ? (
                        <span className="px-2 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-700 rounded font-bold flex items-center gap-1">
                          ✅ 命中 Top 3 预测区间
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-amber-950/80 text-amber-300 border border-amber-700 rounded font-bold flex items-center gap-1">
                          ⚠️ 偏离前三预测分布
                        </span>
                      )}

                      <span className="text-slate-400 font-mono text-[11px]">
                        实际总进球: {match.reflection.actual_total_goals} 个 (净胜球 {match.reflection.goal_diff_actual > 0 ? `+${match.reflection.goal_diff_actual}` : match.reflection.goal_diff_actual})
                      </span>

                      {match.reflection.ah_outcome && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                            match.reflection.ah_outcome.includes("WIN")
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : match.reflection.ah_outcome === "PUSH"
                              ? "bg-slate-900 text-slate-300 border-slate-700"
                              : "bg-rose-950 text-rose-300 border-rose-800"
                          }`}
                        >
                          主让球盘: {match.reflection.ah_outcome}
                        </span>
                      )}

                      {match.reflection.ou_outcome && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                            match.reflection.ou_outcome.includes("WIN")
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : match.reflection.ou_outcome === "PUSH"
                              ? "bg-slate-900 text-slate-300 border-slate-700"
                              : "bg-rose-950 text-rose-300 border-rose-800"
                          }`}
                        >
                          大小球盘: {match.reflection.ou_outcome}
                        </span>
                      )}

                      <span className="text-[10px] text-slate-500 font-mono ml-auto">
                        核销源: {match.finished_score_source} ({match.settled_at?.slice(11, 19)})
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800/80 leading-relaxed">
                      {match.reflection.diagnostic_notes}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 准入规范说明模态弹窗 */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">推荐台账与 OOS 样本写入准入规范</h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  一、正式推荐台账入账硬性门禁 (Layer 05 契约)
                </div>
                <p>
                  为防止垃圾预测与未经核验的噪音数据污染实盘战绩，正式台账执行严格“Fail-Closed”阻断保护：
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pl-2">
                  <li><strong className="text-slate-200">双源比分核验:</strong> 比赛必须对齐且比分核验通过（滚球两端比分一致，赛前具备有效市场盘口）；</li>
                  <li><strong className="text-slate-200">量化正期望信号:</strong> Layer 03 必须检出数学正期望 (Positive EV)，且状态达到 <code className="text-emerald-400">PRODUCTION_UNLOCKED</code> 或 <code className="text-blue-400">COLD_START_PERMISSIVE</code>；</li>
                  <li><strong className="text-slate-200">综合定级门槛:</strong> 必须评为 <code className="text-emerald-400">A_GRADE</code> 或 <code className="text-blue-400">B_GRADE</code>，且综合置信度 ≥ 70 分；</li>
                  <li><strong className="text-slate-200">专家手动录入特权:</strong> 专家分析师可使用【专家手动推荐入账】为核准赛事授予冷启动豁免 (<code className="text-purple-400">OOS_COLD_START_EXEMPT</code>) 并正式入账。</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-400" />
                  二、OOS 校准样本沉淀机制 (Layer 06 闭环)
                </div>
                <p>
                  Out-of-Sample (OOS) 校准库是系统自适应进化与概率去偏差的核心资产：
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pl-2">
                  <li><strong className="text-slate-200">来源闭环:</strong> 仅收录正式入账推荐在赛后核销的真实二元胜负结果 (<code className="text-emerald-400">WIN</code> 或 <code className="text-rose-400">LOSE</code>)；</li>
                  <li><strong className="text-slate-200">四分之一盘契约:</strong> 走盘 (<code className="text-slate-400">PUSH</code>) 或半赢半输为保本/部分结算，不计入离散概率校准，以保护 Brier 分数的严谨性；</li>
                  <li><strong className="text-slate-200">全自动增量编译:</strong> 每次录入完场比分或雷速核销，系统自动重新编译 OOS 档案并更新 ESS (有效样本数)。</li>
                </ul>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="font-bold text-teal-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  三、完场复盘与赛后反思梳理
                </div>
                <p>
                  点击顶部的【雷速完场一键反思核销】，系统会自动比对雷速接口中已完场的比赛（status_id = 8），交叉核对最终全场比分，自动计算泊松进球期望偏差、Top 3 预测命中度，并直接同步核销待结算推荐！
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                我已了解
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

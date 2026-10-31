import React, { useState, useEffect, useMemo, useCallback } from "react";
import { RefreshCw, Database, RotateCcw, Upload, FileCode, FileText, Layers } from "lucide-react";
import { CanonicalMatch, AiEvaluationBrief } from "../../refactor/02_canonical_model/types";
import { QuantitativeFeatures } from "../../refactor/03_quant_engine/types";
import { LeisuCandidateItem } from "./canonical/types";
import { CanonicalFilterBar } from "./canonical/CanonicalFilterBar";
import { CanonicalMatchCard } from "./canonical/CanonicalMatchCard";
import { CanonicalSettlementHub } from "./canonical/CanonicalSettlementHub";
import { CanonicalDiagnosticModal } from "./canonical/CanonicalDiagnosticModal";
import { CanonicalImportWizard } from "./canonical/CanonicalImportWizard";
import { CanonicalExportModal } from "./canonical/CanonicalExportModal";
import { CanonicalAiModal } from "./canonical/CanonicalAiModal";
import { findAiEvaluationForMatch, getMatchDecisionStatus, isMatchQualifiedForParlay } from "./canonical/helpers";

export const CanonicalMatchCenter: React.FC = () => {
  const [mode, setMode] = useState<"live" | "prematch">("live");
  const [mainViewTab, setMainViewTab] = useState<"matches" | "hub">("matches");
  const [matches, setMatches] = useState<CanonicalMatch[]>([]);
  const [serverQuantFeatures, setServerQuantFeatures] = useState<Record<string, QuantitativeFeatures>>({});
  const [aiBriefs, setAiBriefs] = useState<AiEvaluationBrief[]>([]);
  const [leisuPool, setLeisuPool] = useState<LeisuCandidateItem[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [refactorBatchId, setRefactorBatchId] = useState<string | null>(null);
  const [refactorImportedAt, setRefactorImportedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 台账、核销与弹窗状态
  const [formalLedger, setFormalLedger] = useState<any[]>([]);
  const [universeLedger, setUniverseLedger] = useState<any[]>([]);
  const [universeSummary, setUniverseSummary] = useState<any>(null);
  const [oosStatus, setOosStatus] = useState<any>(null);
  const [ledgerFeedback, setLedgerFeedback] = useState<string | null>(null);
  const [selectedDiagnosticMatch, setSelectedDiagnosticMatch] = useState<CanonicalMatch | null>(null);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showDataExportModal, setShowDataExportModal] = useState<boolean>(false);

  // AI 评估与筛选操作状态
  const [aiEvaluations, setAiEvaluations] = useState<any[]>([]);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiSelectedMatchIds, setAiSelectedMatchIds] = useState<Set<string>>(new Set());
  const [aiEvalMode, setAiEvalMode] = useState<"live_eval" | "prematch_eval" | "parlay_check">("live_eval");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiGeneratedPrompt, setAiGeneratedPrompt] = useState("");
  const [aiImportJson, setAiImportJson] = useState("");
  const [aiFeedback, setAiFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<string>("ALL");
  const [decisionFilter, setDecisionFilter] = useState<"ALL" | "BETTABLE" | "BLOCKED" | "WAITING" | "AI_EVALUATED">("ALL");
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [activeTabByMatch, setActiveTabByMatch] = useState<Record<string, string>>({});
  const [cardJsonSubTab, setCardJsonSubTab] = useState<Record<string, "input" | "output">>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [appendingLedgerIds, setAppendingLedgerIds] = useState<Record<string, boolean>>({});

  const quantFeaturesMap = useMemo(() => serverQuantFeatures || {}, [serverQuantFeatures]);

  const fetchCanonicalData = async (forceRecalculate: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/refactor/canonical-matches?mode=${mode}${forceRecalculate ? "&recalculate=true" : ""}`);
      const data = await res.json();
      if (data.success) {
        setMatches(data.matches || []);
        setAiBriefs(data.ai_briefs || []);
        setServerQuantFeatures(data.quantitative_features || {});
        setMetadata(data.metadata || null);
        setRefactorBatchId(data.batch_id || null);
        setRefactorImportedAt(data.imported_at || null);
        setLeisuPool(data.leisu_candidates || []);
      } else {
        setError(data.message || "获取标准赛事数据失败");
      }
    } catch (err: any) {
      setError(err.message || "网络请求异常");
    } finally {
      setLoading(false);
    }
  };

  const fetchRefactorLedger = useCallback(async () => {
    try {
      const res = await fetch("/api/refactor/formal-ledger");
      const data = await res.json();
      if (res.ok && data.success === true) {
        setFormalLedger(mode === "live" ? data.live || [] : data.prematch || []);
        if (data.oos_status) setOosStatus(data.oos_status);
      }
    } catch {}
  }, [mode]);

  const fetchOosStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/refactor/oos-status");
      const data = await res.json();
      if (data.ok && data.status) setOosStatus(data.status);
    } catch {}
  }, []);

  const fetchUniverseLedger = useCallback(async () => {
    try {
      const stage = mode === "live" ? "LIVE" : "PREMATCH";
      const res = await fetch(`/api/refactor/universe-ledger?stage=${stage}`);
      const data = await res.json();
      if (data.success) {
        setUniverseLedger(data.records || []);
        setUniverseSummary(data.summary || null);
      }
    } catch {}
  }, [mode]);

  const loadAiEvaluations = useCallback(async () => {
    try {
      const res = await fetch("/api/refactor/ai-evaluations");
      const data = await res.json();
      if (data.success) setAiEvaluations(data.evaluations || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchCanonicalData();
    fetchRefactorLedger();
    fetchUniverseLedger();
    fetchOosStatus();
    loadAiEvaluations();
  }, [mode]);

  const matchDecisionGetter = useCallback(
    (m: CanonicalMatch) => {
      const ai = findAiEvaluationForMatch(m, aiEvaluations);
      const quant = quantFeaturesMap[m.canonical_id] || null;
      return getMatchDecisionStatus(m, ai, quant);
    },
    [aiEvaluations, quantFeaturesMap]
  );

  // 统计各风控分类比赛数量
  const countsByDecision = useMemo(() => {
    let bettable = 0;
    let blocked = 0;
    let waiting = 0;
    let aiEvaluated = 0;

    matches.forEach((m) => {
      const dec = matchDecisionGetter(m);
      if (dec.status === "BETTABLE") bettable++;
      if (dec.status === "BLOCKED") blocked++;
      if (dec.status === "WAITING") waiting++;
      if (dec.hasAi) aiEvaluated++;
    });

    return { all: matches.length, bettable, blocked, waiting, aiEvaluated };
  }, [matches, matchDecisionGetter]);

  // 过滤比赛列表
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      const matchesSearch =
        m.league_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        m.home_team_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        m.away_team_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        (m.reference?.leisu_home_name || "").toLowerCase().includes(searchKeyword.toLowerCase()) ||
        (m.reference?.leisu_away_name || "").toLowerCase().includes(searchKeyword.toLowerCase());

      const matchesTier = tierFilter === "ALL" || m.completeness_tier === tierFilter;
      const dec = matchDecisionGetter(m);
      let matchesDecision = true;
      if (decisionFilter === "BETTABLE") matchesDecision = dec.status === "BETTABLE";
      else if (decisionFilter === "BLOCKED") matchesDecision = dec.status === "BLOCKED";
      else if (decisionFilter === "WAITING") matchesDecision = dec.status === "WAITING";
      else if (decisionFilter === "AI_EVALUATED") matchesDecision = dec.hasAi;

      return matchesSearch && matchesTier && matchesDecision;
    });
  }, [matches, searchKeyword, tierFilter, decisionFilter, matchDecisionGetter]);

  // 写入正式台账
  const handleAppendToLedger = async (match: CanonicalMatch, aiEval: any) => {
    setAppendingLedgerIds((prev) => ({ ...prev, [match.canonical_id]: true }));
    try {
      const res = await fetch("/api/refactor/formal-ledger/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match, ai_evaluation: aiEval, mode }),
      });
      const data = await res.json();
      if (data.success) await fetchRefactorLedger();
    } catch {
      // ignore
    } finally {
      setAppendingLedgerIds((prev) => ({ ...prev, [match.canonical_id]: false }));
    }
  };

  const safeCopyToClipboard = async (text: string, keyOrDesc: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(keyOrDesc);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore
    }
  };

  const downloadJSON = (filename: string, data: any) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyMatchJson = (m: CanonicalMatch, isOut: boolean) =>
    safeCopyToClipboard(
      JSON.stringify(isOut ? { canonical_id: m.canonical_id, match_name: `${m.home_team_name} vs ${m.away_team_name}`, quant_features: quantFeaturesMap[m.canonical_id] || null } : m, null, 2),
      `${m.canonical_id}_${isOut ? "output" : "input"}`
    );
  const downloadMatchJson = (m: CanonicalMatch, isOut: boolean) =>
    downloadJSON(`03_${isOut ? "output" : "input"}_${m.canonical_id}.json`, isOut ? { canonical_id: m.canonical_id, match_name: `${m.home_team_name} vs ${m.away_team_name}`, quant_features: quantFeaturesMap[m.canonical_id] || null } : m);

  const handleGeneratePrompt = async () => {
    setIsAiLoading(true);
    setAiFeedback(null);
    try {
      const selected = matches.filter((m) => aiSelectedMatchIds.has(m.canonical_id));
      const res = await fetch("/api/refactor/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches: selected, mode: aiEvalMode }),
      });
      const data = await res.json();
      if (data.success) {
        setAiGeneratedPrompt(data.prompt);
        setAiFeedback({ type: "success", message: `成功生成 ${selected.length} 场赛事的 AI 提示词！` });
      } else {
        setAiFeedback({ type: "error", message: data.message || "生成提示词失败" });
      }
    } catch (err: any) {
      setAiFeedback({ type: "error", message: err.message || "网络请求异常" });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleImportAiEvaluation = async () => {
    if (!aiImportJson.trim()) return;
    setIsAiLoading(true);
    setAiFeedback(null);
    try {
      const parsed = JSON.parse(aiImportJson);
      const res = await fetch("/api/refactor/save-ai-evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsed }),
      });
      const data = await res.json();
      if (data.success) {
        setAiFeedback({ type: "success", message: "✅ AI 终审报告解析并入库成功！" });
        setAiImportJson("");
        await loadAiEvaluations();
        await fetchRefactorLedger();
      } else {
        setAiFeedback({ type: "error", message: data.message || "入库失败" });
      }
    } catch (err: any) {
      setAiFeedback({ type: "error", message: `解析错误: ${err.message}` });
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 顶部全局控制中枢 */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-900/90 p-3 sm:p-4 rounded-xl border border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>标准化赛事推演与决策中枢</span>
              <span className="text-[10px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800 font-mono">CODEX Refactor</span>
            </h1>
            <p className="text-xs text-slate-400">三轨合一架构：Layer 02 标准对齐 ➔ Layer 03 确定性量化 ➔ Layer 04/05 风控开仓 ➔ Layer 06 核销归因</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button id="tab-mode-live" onClick={() => { setMode("live"); setMainViewTab("matches"); }} className={`px-3 py-1.5 rounded-md transition-all ${mode === "live" && mainViewTab === "matches" ? "bg-blue-600 text-white font-semibold shadow-xs" : "text-slate-400 hover:text-slate-200"}`}>
              ⚽ 滚球赛事 ({mode === "live" ? matches.length : "-"})
            </button>
            <button id="tab-mode-prematch" onClick={() => { setMode("prematch"); setMainViewTab("matches"); }} className={`px-3 py-1.5 rounded-md transition-all ${mode === "prematch" && mainViewTab === "matches" ? "bg-blue-600 text-white font-semibold shadow-xs" : "text-slate-400 hover:text-slate-200"}`}>
              📅 赛前赛事 ({mode === "prematch" ? matches.length : "-"})
            </button>
            <button id="tab-mode-hub" onClick={() => setMainViewTab("hub")} className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${mainViewTab === "hub" ? "bg-indigo-600 text-white font-semibold shadow-xs" : "text-slate-400 hover:text-slate-200"}`}>
              <Layers className="w-3.5 h-3.5 text-indigo-300" />
              <span>🎯 统一赛后复盘与核销中枢</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-200 border border-indigo-800 font-mono">{universeLedger.length} 场</span>
            </button>
          </div>

          <button id="btn-open-import-modal" onClick={() => setShowImportModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs font-medium text-white transition-colors border border-emerald-600/60 shadow-xs">
            <Upload className="w-3.5 h-3.5" />
            <span>智能导入数据</span>
          </button>
          <button id="btn-open-03-export-modal" onClick={() => setShowDataExportModal(true)} disabled={matches.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-xs font-semibold text-white transition-colors border border-blue-500/60 shadow-xs disabled:opacity-50">
            <FileCode className="w-3.5 h-3.5 text-blue-200" />
            <span>03模型数据导出 / 复制</span>
          </button>
          <button id="btn-export-prompt" onClick={() => setIsAiModalOpen(true)} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-xs font-medium text-white transition-colors border border-indigo-600/60 shadow-xs disabled:opacity-50">
            <FileText className="w-3.5 h-3.5" />
            <span>导出 AI Prompt</span>
          </button>
          <button id="btn-refresh-canonical" onClick={() => fetchCanonicalData(true)} disabled={loading} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors border border-slate-700">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {mainViewTab === "hub" ? (
        <CanonicalSettlementHub
          mode={mode}
          matches={matches}
          universeLedger={universeLedger}
          formalLedger={formalLedger}
          universeSummary={universeSummary}
          oosStatus={oosStatus}
          feedback={ledgerFeedback}
          setFeedback={setLedgerFeedback}
          onRefreshAll={async () => {
            await Promise.all([fetchRefactorLedger(), fetchUniverseLedger(), fetchOosStatus()]);
          }}
          onBackToMatches={() => setMainViewTab("matches")}
          onOpenManualLedger={() => {}}
        />
      ) : (
        <>
          <CanonicalFilterBar
            decisionFilter={decisionFilter}
            setDecisionFilter={setDecisionFilter}
            countsByDecision={countsByDecision}
            searchKeyword={searchKeyword}
            setSearchKeyword={setSearchKeyword}
            tierFilter={tierFilter}
            setTierFilter={setTierFilter}
          />

          {loading ? (
            <div className="p-12 text-center bg-slate-900 rounded-xl border border-slate-800">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">正在执行 Layer 01 解析与 Layer 02 标准赛事装配...</p>
            </div>
          ) : error ? (
            <div className="p-8 bg-rose-950/40 border border-rose-900 rounded-xl text-rose-300 text-sm">{error}</div>
          ) : filteredMatches.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 rounded-xl border border-slate-800 space-y-4">
              <Database className="w-8 h-8 text-slate-600 mx-auto opacity-50" />
              <p className="text-sm font-semibold text-slate-300">未找到符合当前筛选条件的赛事</p>
              <button
                onClick={() => { setDecisionFilter("ALL"); setTierFilter("ALL"); setSearchKeyword(""); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重置筛选
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMatches.map((m, idx) => (
                <CanonicalMatchCard
                  key={m.canonical_id || idx}
                  match={m}
                  idx={idx}
                  quant={quantFeaturesMap[m.canonical_id] || null}
                  aiEval={findAiEvaluationForMatch(m, aiEvaluations)}
                  brief={aiBriefs.find((b) => b.match_id === m.canonical_id) || null}
                  formalLedger={formalLedger}
                  expandedMatchId={expandedMatchId}
                  setExpandedMatchId={setExpandedMatchId}
                  activeTabByMatch={activeTabByMatch}
                  setActiveTabByMatch={setActiveTabByMatch}
                  cardJsonSubTab={cardJsonSubTab}
                  setCardJsonSubTab={setCardJsonSubTab}
                  copiedKey={copiedKey}
                  appendingLedgerIds={appendingLedgerIds}
                  onAppendToLedger={handleAppendToLedger}
                  onOpenAiModal={(id) => { setAiSelectedMatchIds(new Set([id])); setIsAiModalOpen(true); }}
                  onSelectBrief={() => setIsAiModalOpen(true)}
                  onOpenDiagnosticModal={setSelectedDiagnosticMatch}
                  onCopyMatchInput={(match) => copyMatchJson(match, false)}
                  onDownloadMatchInput={(match) => downloadMatchJson(match, false)}
                  onCopyMatchOutput={(match) => copyMatchJson(match, true)}
                  onDownloadMatchOutput={(match) => downloadMatchJson(match, true)}
                  getMatchDecisionStatus={matchDecisionGetter}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 弹窗组件群 */}
      {selectedDiagnosticMatch && (
        <CanonicalDiagnosticModal
          match={selectedDiagnosticMatch}
          onClose={() => setSelectedDiagnosticMatch(null)}
        />
      )}
      {showImportModal && (
        <CanonicalImportWizard
          isOpen={showImportModal}
          mode={mode}
          leisuPool={leisuPool}
          onClose={() => setShowImportModal(false)}
          onImportSuccess={(data) => {
            if (data.mode) setMode(data.mode);
            if (data.matches) setMatches(data.matches);
            if (data.aiBriefs) setAiBriefs(data.aiBriefs);
            if (data.quantitativeFeatures) setServerQuantFeatures(data.quantitativeFeatures);
            if (data.batchId) setRefactorBatchId(data.batchId);
            if (data.importedAt) setRefactorImportedAt(data.importedAt);
            if (data.leisuCandidates) setLeisuPool(data.leisuCandidates);
            fetchCanonicalData(true);
            fetchRefactorLedger();
            fetchUniverseLedger();
          }}
        />
      )}
      {showDataExportModal && (
        <CanonicalExportModal
          isOpen={showDataExportModal}
          matches={matches}
          quantFeaturesMap={quantFeaturesMap}
          mode={mode}
          refactorBatchId={refactorBatchId || "batch_current"}
          onClose={() => setShowDataExportModal(false)}
        />
      )}
      <CanonicalAiModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        matches={matches}
        aiSelectedMatchIds={aiSelectedMatchIds}
        setAiSelectedMatchIds={setAiSelectedMatchIds}
        aiEvalMode={aiEvalMode}
        setAiEvalMode={setAiEvalMode}
        handleGeneratePrompt={handleGeneratePrompt}
        handleImportAiEvaluation={handleImportAiEvaluation}
        isAiLoading={isAiLoading}
        aiFeedback={aiFeedback}
        setAiFeedback={setAiFeedback}
        aiGeneratedPrompt={aiGeneratedPrompt}
        aiImportJson={aiImportJson}
        setAiImportJson={setAiImportJson}
        isMatchQualifiedForParlay={(id) => isMatchQualifiedForParlay(id, matches, aiEvaluations)}
      />
    </div>
  );
};

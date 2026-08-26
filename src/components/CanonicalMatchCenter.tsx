import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Search,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Database,
  X,
  Upload,
  FileJson,
  RotateCcw,
  Check,
  FileSpreadsheet,
  Trash2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  Code,
  TrendingUp,
  BarChart2,
  Target,
  Trophy,
  Activity,
  Users,
  CheckCheck,
} from "lucide-react";
import {
  CanonicalMatch,
  AiEvaluationBrief,
} from "../../refactor/02_canonical_model/types";
import {
  MatchAlignmentStatus,
  DataCompletenessTier,
  MatchStage,
} from "../../refactor/02_canonical_model/enums";
import {
  sniffIngressPayload,
  SniffedFileInfo,
} from "../../refactor/01_data_ingestion/ingressSniffer";

export const CanonicalMatchCenter: React.FC = () => {
  const [mode, setMode] = useState<"live" | "prematch">("live");
  const [matches, setMatches] = useState<CanonicalMatch[]>([]);
  const [aiBriefs, setAiBriefs] = useState<AiEvaluationBrief[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<string>("ALL");

  // 卡片折叠/展开与多维查看器状态
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [activeTabByMatch, setActiveTabByMatch] = useState<
    Record<string, "markets" | "stats" | "h2h" | "alignment" | "json">
  >({});
  const [copiedMatchId, setCopiedMatchId] = useState<string | null>(null);

  // 弹窗状态：选中的 AI Brief 查看
  const [selectedBrief, setSelectedBrief] = useState<AiEvaluationBrief | null>(null);
  const [selectedCanonical, setSelectedCanonical] = useState<CanonicalMatch | null>(null);

  // 弹窗状态：统一智能多文件数据导入模态框
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [sniffedFiles, setSniffedFiles] = useState<SniffedFileInfo[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [rawPastedText, setRawPastedText] = useState<string>("");
  const [importing, setImporting] = useState<boolean>(false);
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // 导出全部 Canonical JSON
  const handleExportAllCanonicalJSON = () => {
    if (!matches || matches.length === 0) return;
    const payload = {
      export_version: "2.0.0",
      export_source: "CanonicalMatchCenter",
      exported_at: new Date().toISOString(),
      mode,
      total_count: matches.length,
      canonical_matches: matches,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canonical_merged_${mode}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 复制单场 Canonical JSON
  const handleCopySingleMatchJSON = async (match: CanonicalMatch) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(match, null, 2));
      setCopiedMatchId(match.canonical_id);
      setTimeout(() => setCopiedMatchId(null), 2000);
    } catch {
      // fallback
    }
  };

  // 下载单场 Canonical JSON
  const handleDownloadSingleMatchJSON = (match: CanonicalMatch) => {
    const blob = new Blob([JSON.stringify(match, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canonical_${match.league_name}_${match.home_team_name}_vs_${match.away_team_name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchCanonicalData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/refactor/canonical-matches?mode=${mode}`);
      const data = await res.json();
      if (data.success) {
        setMatches(data.matches || []);
        setAiBriefs(data.ai_briefs || []);
        setMetadata(data.metadata || null);
      } else {
        setError(data.message || "获取标准赛事数据失败");
      }
    } catch (err: any) {
      setError(err.message || "网络请求异常");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCanonicalData();
  }, [mode]);

  const processRawJsonFile = (file: File) => {
    return new Promise<SniffedFileInfo>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          const sniffed = sniffIngressPayload(file.name, file.size, parsed);
          resolve(sniffed);
        } catch (e: any) {
          reject(new Error(`文件 ${file.name} 不是合法的 JSON 格式: ${e.message}`));
        }
      };
      reader.onerror = () => reject(new Error(`读取文件 ${file.name} 失败`));
      reader.readAsText(file);
    });
  };

  const handleMultipleFilesSelected = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setImportFeedback(null);

    const newSniffed: SniffedFileInfo[] = [];
    const errorMessages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const sniffed = await processRawJsonFile(file);
        newSniffed.push(sniffed);
      } catch (err: any) {
        errorMessages.push(err.message || `解析 ${file.name} 失败`);
      }
    }

    if (newSniffed.length > 0) {
      setSniffedFiles((prev) => {
        // 按照 fileName 去重
        const existingNames = new Set(prev.map((f) => f.fileName));
        const filteredNew = newSniffed.filter((f) => !existingNames.has(f.fileName));
        return [...prev, ...filteredNew];
      });
    }

    if (errorMessages.length > 0) {
      setImportFeedback({
        success: false,
        message: errorMessages.join("; "),
      });
    }
  };

  const handleAddPastedText = () => {
    if (!rawPastedText.trim()) return;
    try {
      const parsed = JSON.parse(rawPastedText.trim());
      const sniffed = sniffIngressPayload(`pasted_snippet_${Date.now()}.json`, rawPastedText.length, parsed);
      setSniffedFiles((prev) => [...prev, sniffed]);
      setRawPastedText("");
      setImportFeedback(null);
    } catch (e: any) {
      setImportFeedback({
        success: false,
        message: `粘贴的 JSON 格式错误: ${e.message}`,
      });
    }
  };

  const handleRemoveSniffedFile = (index: number) => {
    setSniffedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleExecuteImport = async () => {
    if (sniffedFiles.length === 0) {
      setImportFeedback({
        success: false,
        message: "请先添加至少 1 个 YBTY 或雷速 JSON 数据文件",
      });
      return;
    }

    setImporting(true);
    setImportFeedback(null);

    try {
      const payloadFiles = sniffedFiles.map((sf) => ({
        fileName: sf.fileName,
        rawJson: sf.rawJson,
      }));

      const res = await fetch("/api/refactor/import-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          files_payload: payloadFiles,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setImportFeedback({
          success: true,
          message: data.message || "数据智能识别并对齐装配成功！",
        });
        if (data.mode) {
          setMode(data.mode);
        }
        setMatches(data.matches || []);
        setAiBriefs(data.ai_briefs || []);
        setMetadata(data.metadata || null);

        setTimeout(() => {
          setShowImportModal(false);
          setSniffedFiles([]);
          setImportFeedback(null);
        }, 1200);
      } else {
        setImportFeedback({
          success: false,
          message: data.error || "导入失败，请检查数据格式",
        });
      }
    } catch (err: any) {
      setImportFeedback({
        success: false,
        message: err.message || "请求发生异常",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleResetToSample = async () => {
    if (!confirm(`确定要将当前 ${mode === "live" ? "滚球" : "赛前"} 数据重置为内置标准测试样本吗？`)) {
      return;
    }

    setImporting(true);
    setImportFeedback(null);
    try {
      const res = await fetch("/api/refactor/import-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          reset_to_sample: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSniffedFiles([]);
        setImportFeedback({
          success: true,
          message: data.message || "已成功重置为标准测试样本",
        });
        setMatches(data.matches || []);
        setAiBriefs(data.ai_briefs || []);
        setMetadata(data.metadata || null);

        setTimeout(() => {
          setShowImportModal(false);
          setImportFeedback(null);
        }, 1000);
      }
    } catch (err: any) {
      setImportFeedback({
        success: false,
        message: err.message || "重置失败",
      });
    } finally {
      setImporting(false);
    }
  };

  const filteredMatches = matches.filter((m) => {
    const matchesSearch =
      m.league_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      m.home_team_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      m.away_team_name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (m.reference?.leisu_home_name || "").toLowerCase().includes(searchKeyword.toLowerCase());

    const matchesTier =
      tierFilter === "ALL" || m.completeness_tier === tierFilter;

    return matchesSearch && matchesTier;
  });

  const getTierBadge = (tier: DataCompletenessTier) => {
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
  };

  const getAlignmentBadge = (status: MatchAlignmentStatus, confidence: number) => {
    switch (status) {
      case MatchAlignmentStatus.MATCHED_BY_ALIAS:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-950/60 text-purple-300 border border-purple-600/40">
            别名命中 100%
          </span>
        );
      case MatchAlignmentStatus.MATCHED_AUTO:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-950/60 text-blue-300 border border-blue-600/40">
            自动匹配 {confidence}%
          </span>
        );
      case MatchAlignmentStatus.NEEDS_MANUAL_SELECTION:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-600/40">
            低置信待确认 {confidence}%
          </span>
        );
      case MatchAlignmentStatus.UNMATCHED:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            未匹配
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div id="canonical-match-center" className="w-full max-w-7xl mx-auto space-y-6 pb-16">
      {/* 顶部标题与控制栏 */}
      <div className="bg-slate-900/90 rounded-xl p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-950/80 rounded-lg text-blue-400 border border-blue-800/50">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                标准赛事对齐中心
                <span className="text-xs px-2 py-0.5 bg-blue-900/60 text-blue-300 rounded font-mono font-normal border border-blue-700/50">
                  Layer 02 SSOT
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>YBTY 法定执行源 ↔ 雷速增强源精准对齐与极简 AI Brief 提炼</span>
                {metadata && (
                  <span className="text-[11px] text-slate-500 font-mono">
                    | 原始: YBTY({metadata.ybtyMatchCount}场) · 雷速({metadata.leisuMatchCount}场)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 模式切换、导入与刷新 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="bg-slate-950 p-1 rounded-lg flex items-center text-xs font-medium border border-slate-800">
            <button
              id="tab-mode-live"
              onClick={() => setMode("live")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                mode === "live"
                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🔴 滚球实时对齐 ({mode === "live" ? matches.length : "-"})
            </button>
            <button
              id="tab-mode-prematch"
              onClick={() => setMode("prematch")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                mode === "prematch"
                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📅 赛前赛事对齐 ({mode === "prematch" ? matches.length : "-"})
            </button>
          </div>

          {/* 全量合并 JSON 导出按钮 */}
          <button
            id="btn-export-all-canonical"
            onClick={handleExportAllCanonicalJSON}
            disabled={matches.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors border border-blue-600/60 shadow-xs"
            title="下载当前所有合并对齐后的 CanonicalMatch JSON 数据"
          >
            <Download className="w-3.5 h-3.5" />
            <span>📥 导出全部合并数据 (.json)</span>
          </button>

          {/* 原生数据导入按钮 */}
          <button
            id="btn-open-import-modal"
            onClick={() => {
              setShowImportModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs font-medium text-white transition-colors border border-emerald-600/60 shadow-xs"
            title="导入新抓取的数据"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>智能导入数据</span>
          </button>

          <button
            id="btn-refresh-canonical"
            onClick={fetchCanonicalData}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors border border-slate-700"
            title="刷新数据"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 搜索与过滤 */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-match"
            type="text"
            placeholder="搜索联赛名、YBTY队名、雷速队名..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-200"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
          <span className="text-xs text-slate-400 whitespace-nowrap">完整度过滤:</span>
          {["ALL", DataCompletenessTier.TIER_1_FULL, DataCompletenessTier.TIER_2_BASIC, DataCompletenessTier.TIER_3_SPARSE, DataCompletenessTier.TIER_INVALID].map((tier) => (
            <button
              key={tier}
              id={`filter-${tier}`}
              onClick={() => setTierFilter(tier)}
              className={`text-xs px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                tierFilter === tier
                  ? "bg-blue-600 text-white font-medium shadow-xs"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700/50"
              }`}
            >
              {tier === "ALL" ? "全部" : tier.replace("TIER_", "")}
            </button>
          ))}
        </div>
      </div>

      {/* 主列表 */}
      {loading ? (
        <div className="p-12 text-center bg-slate-900 rounded-xl border border-slate-800">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">正在执行 Layer 01 解析与 Layer 02 标准赛事装配...</p>
        </div>
      ) : error ? (
        <div className="p-8 bg-rose-950/40 border border-rose-900 rounded-xl text-rose-300 text-sm">
          {error}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 rounded-xl border border-slate-800 space-y-3">
          <Database className="w-8 h-8 text-slate-600 mx-auto opacity-50" />
          <p className="text-sm text-slate-400">未找到匹配的标准赛事数据</p>
          <button
            onClick={() => {
              setShowImportModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            立即导入数据文件
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map((m, idx) => {
            const brief = aiBriefs.find((b) => b.match_id === m.canonical_id);
            return (
              <div
                key={m.canonical_id || idx}
                id={`match-card-${idx}`}
                className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-sm hover:border-blue-500/50 transition-all space-y-4"
              >
                {/* 卡片头部：联赛、时间、完整度与状态 */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 bg-slate-800 text-slate-200 rounded border border-slate-700">
                      {m.league_name}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {m.timing.beijing_start_time}
                      {m.timing.start_time_source === "LEISU_SUPPLEMENTED" && (
                        <span className="text-[10px] text-blue-400 font-mono">(雷速补充)</span>
                      )}
                    </span>
                    {m.timing.stage === MatchStage.LIVE && (
                      <span className="text-xs font-bold text-rose-400 animate-pulse">
                        {m.timing.minute ? `${m.timing.minute}'` : "滚球中"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {getAlignmentBadge(m.alignment.status, m.alignment.confidence_score)}
                    {getTierBadge(m.completeness_tier)}
                  </div>
                </div>

                {/* 对齐主体：双源队名比对 */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  {/* 左侧：YBTY 法定执行队名与比分 */}
                  <div className="lg:col-span-5 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-1.5">
                      <span>YBTY 法定执行队名 (第一主键)</span>
                      <span className="flex items-center gap-1">
                        {m.score.score_verified ? (
                          <span className="text-emerald-400 flex items-center gap-0.5 text-[10px]">
                            <ShieldCheck className="w-3.5 h-3.5" /> 比分已校验
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-0.5 text-[10px]">
                            <ShieldAlert className="w-3.5 h-3.5" /> 未经画布校验
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                          {m.home_team_name}
                        </div>
                        <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                          {m.away_team_name}
                        </div>
                      </div>
                      <div className="text-xl font-mono font-bold text-slate-100 bg-slate-900 px-3 py-1.5 rounded-md border border-slate-700 shadow-inner">
                        {m.score.home_score !== null ? m.score.home_score : "-"} : {m.score.away_score !== null ? m.score.away_score : "-"}
                      </div>
                    </div>
                  </div>

                  {/* 中间：对齐箭头与相似度 */}
                  <div className="lg:col-span-2 text-center flex flex-col items-center justify-center text-slate-400">
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                    <span className="text-[10px] mt-0.5 font-mono text-slate-500">
                      主:{m.alignment.home_team_match.raw_text_similarity} / 客:{m.alignment.away_team_match.raw_text_similarity}
                    </span>
                  </div>

                  {/* 右侧：雷速对齐参考队名与特征摘要 */}
                  <div className="lg:col-span-5 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-1.5">
                      <span>雷速参考与增强源</span>
                      <span className="text-[10px] text-slate-500">{m.reference ? m.reference.leisu_league_name : "未关联"}</span>
                    </div>
                    {m.reference ? (
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-slate-300">
                          {m.reference.leisu_home_name}
                        </div>
                        <div className="text-sm font-medium text-slate-300">
                          {m.reference.leisu_away_name}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic py-2">
                        未匹配到雷速数据
                      </div>
                    )}
                  </div>
                </div>

                {/* 盘口行情与缺口预警 */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 全场让球主盘 */}
                    {m.markets.full_spread_main && (
                      <div className="text-xs bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                        <span className="text-slate-500 mr-1">让球:</span>
                        <span className="font-semibold text-blue-400">
                          {m.markets.full_spread_main.home_selection}
                        </span>{" "}
                        ({m.markets.full_spread_main.home_odds} / {m.markets.full_spread_main.away_odds})
                      </div>
                    )}

                    {/* 全场大小主盘 */}
                    {m.markets.full_total_main && (
                      <div className="text-xs bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                        <span className="text-slate-500 mr-1">大小:</span>
                        <span className="font-semibold text-emerald-400">
                          {m.markets.full_total_main.line}
                        </span>{" "}
                        (大{m.markets.full_total_main.over_odds} / 小{m.markets.full_total_main.under_odds})
                      </div>
                    )}

                    {/* 独赢 */}
                    {m.markets.full_h2h && (
                      <div className="text-xs bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                        <span className="text-slate-500 mr-1">独赢:</span>
                        {m.markets.full_h2h.home_odds} | {m.markets.full_h2h.draw_odds} | {m.markets.full_h2h.away_odds}
                      </div>
                    )}
                  </div>

                  {/* 右侧查看与展开操作按钮 */}
                  <div className="flex items-center gap-2">
                    {m.missing_reasons.length > 0 && (
                      <span className="text-[11px] text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/50">
                        缺口: {m.missing_reasons.length} 项
                      </span>
                    )}

                    {/* 折叠/展开就地多维面板 */}
                    <button
                      id={`btn-toggle-expand-${idx}`}
                      onClick={() => {
                        setExpandedMatchId(expandedMatchId === m.canonical_id ? null : m.canonical_id);
                        if (!activeTabByMatch[m.canonical_id]) {
                          setActiveTabByMatch((prev) => ({ ...prev, [m.canonical_id]: "markets" }));
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
                      onClick={() => {
                        setSelectedCanonical(m);
                        setSelectedBrief(brief || null);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      AI 简报
                    </button>
                  </div>
                </div>

                {/* 就地展开的多维数据查看器 (Canonical Match Multi-Dimensional Inspector) */}
                {expandedMatchId === m.canonical_id && (
                  <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4 animate-in fade-in duration-200">
                    {/* 标签栏导航 */}
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/80">
                        {[
                          { id: "markets", label: "🎯 YBTY 盘口全集", icon: Target },
                          { id: "stats", label: "📊 雷速统计增强", icon: BarChart2 },
                          { id: "h2h", label: "⚔️ 历史交锋与阵容", icon: Users },
                          { id: "alignment", label: "🔗 两端对齐诊断", icon: CheckCircle },
                          { id: "json", label: "{} 完整合并 JSON", icon: Code },
                        ].map((tab) => {
                          const currentTab = activeTabByMatch[m.canonical_id] || "markets";
                          const isActive = currentTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              id={`tab-${m.canonical_id}-${tab.id}`}
                              onClick={() =>
                                setActiveTabByMatch((prev) => ({
                                  ...prev,
                                  [m.canonical_id]: tab.id as any,
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

                    {/* TAB 1: 🎯 YBTY 盘口全集 (全场主/副盘、半场盘口、独赢) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "markets" && (
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
                                {m.markets.full_spread_subs.length > 0 ? `含 ${m.markets.full_spread_subs.length} 个副盘` : "仅主盘"}
                              </span>
                            </div>
                            {m.markets.full_spread_main ? (
                              <div className="bg-slate-900/90 p-2 rounded border border-blue-900/30 text-xs font-mono">
                                <div className="text-[11px] text-slate-400 mb-1">🔥 主盘 (Main Line)</div>
                                <div className="flex justify-between items-center text-slate-200">
                                  <span className="text-blue-400 font-semibold">{m.markets.full_spread_main.home_selection}</span>
                                  <span>主水: {m.markets.full_spread_main.home_odds}</span>
                                  <span>客水: {m.markets.full_spread_main.away_odds}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 italic py-2">暂无全场让球主盘</div>
                            )}

                            {/* 副盘列表 */}
                            {m.markets.full_spread_subs.map((sub, sIdx) => (
                              <div key={sIdx} className="bg-slate-900/50 p-1.5 rounded text-[11px] font-mono flex justify-between items-center text-slate-300 border border-slate-800/60">
                                <span className="text-slate-400">副盘 {sub.line_index + 1}: {sub.home_selection}</span>
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
                                {m.markets.full_total_subs.length > 0 ? `含 ${m.markets.full_total_subs.length} 个副盘` : "仅主盘"}
                              </span>
                            </div>
                            {m.markets.full_total_main ? (
                              <div className="bg-slate-900/90 p-2 rounded border border-emerald-900/30 text-xs font-mono">
                                <div className="text-[11px] text-slate-400 mb-1">🔥 主盘 (Main Line)</div>
                                <div className="flex justify-between items-center text-slate-200">
                                  <span className="text-emerald-400 font-semibold">{m.markets.full_total_main.line} 球</span>
                                  <span>大球: {m.markets.full_total_main.over_odds}</span>
                                  <span>小球: {m.markets.full_total_main.under_odds}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 italic py-2">暂无全场大小主盘</div>
                            )}

                            {/* 副盘列表 */}
                            {m.markets.full_total_subs.map((sub, sIdx) => (
                              <div key={sIdx} className="bg-slate-900/50 p-1.5 rounded text-[11px] font-mono flex justify-between items-center text-slate-300 border border-slate-800/60">
                                <span className="text-slate-400">副盘 {sub.line_index + 1}: {sub.line}</span>
                                <span>大 {sub.over_odds}</span>
                                <span>小 {sub.under_odds}</span>
                              </div>
                            ))}
                          </div>

                          {/* 独赢与半场盘口 */}
                          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-2">
                            <div className="text-xs font-bold text-amber-400">1X2 独赢 & 半场盘口</div>
                            
                            {/* 1X2 独赢 */}
                            {m.markets.full_h2h ? (
                              <div className="bg-slate-900/90 p-2 rounded border border-amber-900/30 text-xs font-mono space-y-1">
                                <div className="text-[11px] text-slate-400">全场独赢 (1X2)</div>
                                <div className="flex justify-between text-slate-200">
                                  <span>主胜: <strong className="text-amber-400">{m.markets.full_h2h.home_odds}</strong></span>
                                  <span>平局: <strong className="text-amber-400">{m.markets.full_h2h.draw_odds}</strong></span>
                                  <span>客胜: <strong className="text-amber-400">{m.markets.full_h2h.away_odds}</strong></span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 italic">暂无全场独赢</div>
                            )}

                            {/* 半场盘口 */}
                            <div className="bg-slate-900/60 p-2 rounded border border-slate-800 space-y-1 text-xs font-mono">
                              <div className="text-[11px] text-slate-400">半场盘口 (Half Time)</div>
                              <div className="space-y-0.5 text-[11px] text-slate-300">
                                {m.markets.half_spread_main && (
                                  <div>半场让球: {m.markets.half_spread_main.home_selection} (主{m.markets.half_spread_main.home_odds} / 客{m.markets.half_spread_main.away_odds})</div>
                                )}
                                {m.markets.half_total_main && (
                                  <div>半场大小: {m.markets.half_total_main.line} (大{m.markets.half_total_main.over_odds} / 小{m.markets.half_total_main.under_odds})</div>
                                )}
                                {m.markets.half_h2h && (
                                  <div>半场独赢: 主{m.markets.half_h2h.home_odds} | 平{m.markets.half_h2h.draw_odds} | 客{m.markets.half_h2h.away_odds}</div>
                                )}
                                {!m.markets.half_spread_main && !m.markets.half_total_main && !m.markets.half_h2h && (
                                  <div className="text-slate-500 italic">暂无半场盘口</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: 📊 雷速统计增强 (实时技术统计、积分榜、进球时间分布) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "stats" && (
                      <div className="space-y-4">
                        {m.reference ? (
                          <>
                            {/* 1. 核心攻防技术统计 9 宫格 */}
                            {m.reference.stats && (
                              <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                                <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                                  <span>实时攻防与技术统计 (Live Technical Stats)</span>
                                  <span className="text-[11px] text-blue-400">
                                    主: {m.reference.leisu_home_name} vs 客: {m.reference.leisu_away_name}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center text-xs font-mono">
                                  {[
                                    { label: "射门总数", h: m.reference.stats.shots.home, a: m.reference.stats.shots.away },
                                    { label: "射正次数", h: m.reference.stats.shots_on_target.home, a: m.reference.stats.shots_on_target.away },
                                    { label: "射偏次数", h: m.reference.stats.shots_off_target.home, a: m.reference.stats.shots_off_target.away },
                                    { label: "危险进攻", h: m.reference.stats.dangerous_attacks.home, a: m.reference.stats.dangerous_attacks.away },
                                    { label: "总进攻", h: m.reference.stats.attacks.home, a: m.reference.stats.attacks.away },
                                    { label: "控球率%", h: `${m.reference.stats.possession.home}%`, a: `${m.reference.stats.possession.away}%` },
                                    { label: "角球数", h: m.reference.stats.corners.home, a: m.reference.stats.corners.away },
                                    { label: "黄牌", h: m.reference.stats.yellow_cards.home, a: m.reference.stats.yellow_cards.away },
                                    { label: "红牌", h: m.reference.stats.red_cards.home, a: m.reference.stats.red_cards.away },
                                  ].map((st, sIdx) => (
                                    <div key={sIdx} className="bg-slate-900/80 p-2 rounded border border-slate-800">
                                      <div className="text-[10px] text-slate-500 mb-1">{st.label}</div>
                                      <div className="flex justify-around items-center font-bold">
                                        <span className="text-blue-400">{st.h}</span>
                                        <span className="text-slate-600 font-normal">:</span>
                                        <span className="text-amber-400">{st.a}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 2. 联赛积分榜与排名 */}
                            {m.reference.league_standings && m.reference.league_standings.has_data && (
                              <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                                <div className="text-xs font-bold text-slate-300">
                                  🏆 联赛积分榜与排名 (League Standings)
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  {/* 主队排名 */}
                                  {m.reference.league_standings.home_team && (
                                    <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                                      <div className="font-semibold text-blue-400 flex items-center justify-between">
                                        <span>主队: {m.reference.league_standings.home_team.team_name}</span>
                                        <span>
                                          排名: 第 {m.reference.league_standings.home_team.overall?.position || "-"} 名
                                        </span>
                                      </div>
                                      {m.reference.league_standings.home_team.overall && (
                                        <div className="text-[11px] text-slate-400 font-mono">
                                          赛:{m.reference.league_standings.home_team.overall.matches_played} | 
                                          胜:{m.reference.league_standings.home_team.overall.won} | 
                                          平:{m.reference.league_standings.home_team.overall.draw} | 
                                          负:{m.reference.league_standings.home_team.overall.loss} | 
                                          进/失:{m.reference.league_standings.home_team.overall.goals_scored}/{m.reference.league_standings.home_team.overall.goals_conceded} | 
                                          积分: <strong className="text-slate-200">{m.reference.league_standings.home_team.overall.points}</strong>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* 客队排名 */}
                                  {m.reference.league_standings.away_team && (
                                    <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                                      <div className="font-semibold text-amber-400 flex items-center justify-between">
                                        <span>客队: {m.reference.league_standings.away_team.team_name}</span>
                                        <span>
                                          排名: 第 {m.reference.league_standings.away_team.overall?.position || "-"} 名
                                        </span>
                                      </div>
                                      {m.reference.league_standings.away_team.overall && (
                                        <div className="text-[11px] text-slate-400 font-mono">
                                          赛:{m.reference.league_standings.away_team.overall.matches_played} | 
                                          胜:{m.reference.league_standings.away_team.overall.won} | 
                                          平:{m.reference.league_standings.away_team.overall.draw} | 
                                          负:{m.reference.league_standings.away_team.overall.loss} | 
                                          进/失:{m.reference.league_standings.away_team.overall.goals_scored}/{m.reference.league_standings.away_team.overall.goals_conceded} | 
                                          积分: <strong className="text-slate-200">{m.reference.league_standings.away_team.overall.points}</strong>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 3. 进球时间分布 */}
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

                    {/* TAB 3: ⚔️ 历史交锋与阵容战意 (H2H, Recent Form & Lineups) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "h2h" && (
                      <div className="space-y-4">
                        {m.reference ? (
                          <>
                            {/* 1. 历史交锋记录与近期战绩 */}
                            <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                                <span>历史对赛交锋记录 (Head to Head)</span>
                                <span className="text-[11px] text-slate-500">
                                  共收录 {m.reference.tactical_context?.head_to_head_count || 0} 场历史交锋
                                </span>
                              </div>
                              {(m.reference.tactical_context?.h2h_raw || []).length > 0 ? (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {m.reference.tactical_context?.h2h_raw.slice(0, 6).map((h, hIdx) => {
                                    const hScore = h.home_scores && h.home_scores.length > 0 ? h.home_scores[0] : "-";
                                    const aScore = h.away_scores && h.away_scores.length > 0 ? h.away_scores[0] : "-";
                                    const hHalf = h.home_scores && h.home_scores.length > 1 ? h.home_scores[1] : "-";
                                    const aHalf = h.away_scores && h.away_scores.length > 1 ? h.away_scores[1] : "-";
                                    return (
                                      <div key={hIdx} className="bg-slate-900/80 p-2 rounded text-xs flex justify-between items-center font-mono border border-slate-800">
                                        <span className="text-slate-500">{h.match_time ? new Date(Number(h.match_time) * 1000).toISOString().slice(0, 10) : "-"}</span>
                                        <span className="text-slate-400">赛事ID: {h.competition_id || "-"}</span>
                                        <span className="font-semibold text-slate-200">
                                          主队ID:{h.home_team_id} <strong className="text-blue-400">{hScore} : {aScore}</strong> 客队ID:{h.away_team_id}
                                        </span>
                                        <span className="text-slate-500 text-[11px]">
                                          半场: {hHalf}:{aHalf}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (m.reference.tactical_context?.home_recent_matches || []).length > 0 ? (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {m.reference.tactical_context?.home_recent_matches?.slice(0, 5).map((rec, rIdx) => (
                                    <div key={rIdx} className="bg-slate-900/80 p-2 rounded text-xs flex justify-between items-center font-mono border border-slate-800">
                                      <span className="text-slate-500">{rec.match_date || "-"}</span>
                                      <span className="text-slate-400">{rec.league_name || "-"}</span>
                                      <span className="font-semibold text-slate-200">
                                        {rec.home_team_name} <strong className="text-blue-400">{rec.fulltime_score?.home ?? "-"} : {rec.fulltime_score?.away ?? "-"}</strong> {rec.away_team_name}
                                      </span>
                                      <span className="text-slate-500 text-[11px]">
                                        半: {rec.halftime_score?.home ?? "-"}:{rec.halftime_score?.away ?? "-"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-500 italic py-2">暂无历史交战明细</div>
                              )}
                            </div>

                            {/* 2. 阵容与战意分析 */}
                            {m.reference.lineups && (
                              <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                                <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                                  <span>阵容与战术情报 (Lineups & Formations)</span>
                                  <span className={`text-[11px] ${m.reference.lineups.confirmed ? "text-emerald-400" : "text-amber-400"}`}>
                                    {m.reference.lineups.confirmed ? "✅ 正式首发已确认" : "⏳ 预测首发/未确认"}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                                    <div className="font-semibold text-blue-400">主队: {m.reference.leisu_home_name}</div>
                                    <div className="text-slate-400 font-mono text-[11px]">
                                      阵型: <strong>{m.reference.lineups.home_formation || "未指定"}</strong> | 
                                      主帅: {m.reference.lineups.home_manager || "未指定"} | 
                                      首发: {m.reference.lineups.home_starters?.length || 0}人
                                    </div>
                                  </div>
                                  <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1">
                                    <div className="font-semibold text-amber-400">客队: {m.reference.leisu_away_name}</div>
                                    <div className="text-slate-400 font-mono text-[11px]">
                                      阵型: <strong>{m.reference.lineups.away_formation || "未指定"}</strong> | 
                                      主帅: {m.reference.lineups.away_manager || "未指定"} | 
                                      首发: {m.reference.lineups.away_starters?.length || 0}人
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-lg border border-slate-800">
                            未关联到雷速交锋与阵容数据
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 4: 🔗 两端对齐诊断 (Alignment Diagnostics) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "alignment" && (
                      <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-3">
                        <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>实体对齐仲裁诊断报告 (Entity Alignment Audit)</span>
                          <span className="font-mono text-emerald-400 font-bold">
                            置信度总分: {m.alignment.confidence_score}%
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1 font-mono">
                            <div className="text-slate-400">主队映射比对:</div>
                            <div className="text-slate-200">YBTY: <strong className="text-blue-400">{m.alignment.home_team_match.ybty_name}</strong></div>
                            <div className="text-slate-200">雷速: <strong className="text-blue-300">{m.alignment.home_team_match.leisu_name}</strong></div>
                            <div className="text-[11px] text-slate-400">
                              原文字符相似度: {m.alignment.home_team_match.raw_text_similarity} | 
                              别名词典精准命中: {m.alignment.home_team_match.is_alias_exact_hit ? "是" : "否"}
                            </div>
                          </div>

                          <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 space-y-1 font-mono">
                            <div className="text-slate-400">客队映射比对:</div>
                            <div className="text-slate-200">YBTY: <strong className="text-amber-400">{m.alignment.away_team_match.ybty_name}</strong></div>
                            <div className="text-slate-200">雷速: <strong className="text-amber-300">{m.alignment.away_team_match.leisu_name}</strong></div>
                            <div className="text-[11px] text-slate-400">
                              原文字符相似度: {m.alignment.away_team_match.raw_text_similarity} | 
                              别名词典精准命中: {m.alignment.away_team_match.is_alias_exact_hit ? "是" : "否"}
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-900/60 p-2.5 rounded text-xs border border-slate-800 space-y-1">
                          <div className="text-slate-400">对齐仲裁依据说明:</div>
                          <div className="text-slate-200 font-mono text-[11px]">{m.alignment.alignment_reason}</div>
                        </div>
                      </div>
                    )}

                    {/* TAB 5: {} 完整合并 JSON (Raw Canonical JSON) */}
                    {(activeTabByMatch[m.canonical_id] || "markets") === "json" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-t-lg border border-slate-800 text-xs">
                          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                            <FileJson className="w-4 h-4 text-emerald-400" />
                            CanonicalMatch 标准合并数据实体 (纯净未计算)
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              id={`btn-copy-json-${idx}`}
                              onClick={() => handleCopySingleMatchJSON(m)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors border border-slate-700"
                            >
                              {copiedMatchId === m.canonical_id ? (
                                <>
                                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400">已复制</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>复制 JSON</span>
                                </>
                              )}
                            </button>
                            <button
                              id={`btn-download-json-${idx}`}
                              onClick={() => handleDownloadSingleMatchJSON(m)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>下载文件</span>
                            </button>
                          </div>
                        </div>
                        <pre className="text-[11px] font-mono bg-slate-950 p-4 rounded-b-lg overflow-x-auto text-emerald-300 max-h-96 border border-t-0 border-slate-800 select-all">
                          {JSON.stringify(m, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 统一智能数据导入模态框 (Native Smart Ingress Importer) */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 rounded-2xl w-full max-w-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  统一智能数据导入 (Smart Ingress Importer)
                </h3>
                <span className="text-[11px] px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded font-mono border border-emerald-800/50">
                  自动嗅探 · 滚球/赛前/雷速智能识别
                </span>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFeedback(null);
                }}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* 智能多文件拖拽与复选上传区域 */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleMultipleFilesSelected(e.dataTransfer.files);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                  isDragging
                    ? "border-emerald-400 bg-emerald-950/20"
                    : "border-slate-700 hover:border-slate-500 bg-slate-950/60"
                }`}
                onClick={() => {
                  const input = document.getElementById("native-multi-file-input");
                  if (input) input.click();
                }}
              >
                <input
                  id="native-multi-file-input"
                  type="file"
                  accept=".json"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleMultipleFilesSelected(e.target.files);
                    }
                  }}
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="p-3 bg-slate-800/80 rounded-full text-emerald-400 border border-slate-700">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">
                      拖拽或点击选择 1 个或多个 JSON 文件导入
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      系统将依据特征字段自动嗅探：<span className="text-blue-400 font-medium">YBTY滚球</span> / <span className="text-purple-400 font-medium">YBTY赛前</span> / <span className="text-emerald-400 font-medium">雷速接口数据</span>
                    </p>
                  </div>
                  <span className="text-[11px] px-3 py-1 bg-slate-800 text-slate-300 rounded-full border border-slate-700">
                    支持按住 Ctrl/Cmd 多选或同时拖入多个 .json 文件
                  </span>
                </div>
              </div>

              {/* 已嗅探文件清单列表 */}
              {sniffedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                    <span>已识别待导入文件 ({sniffedFiles.length})</span>
                    <button
                      onClick={() => setSniffedFiles([])}
                      className="text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      清空列表
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {sniffedFiles.map((f, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {f.fileType === "ybty_live" && (
                            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono text-[11px] shrink-0">
                              🔴 YBTY滚球
                            </span>
                          )}
                          {f.fileType === "ybty_prematch" && (
                            <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono text-[11px] shrink-0">
                              📅 YBTY赛前
                            </span>
                          )}
                          {f.fileType === "leisu_interface" && (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-[11px] shrink-0">
                              ⚡ 雷速接口
                            </span>
                          )}
                          {f.fileType === "unknown" && (
                            <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono text-[11px] shrink-0">
                              ⚠️ 未知结构
                            </span>
                          )}
                          <span className="font-mono text-slate-200 truncate" title={f.fileName}>
                            {f.fileName}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 text-slate-400">
                          <span className="text-[11px]">
                            {f.matchCount ? `${f.matchCount} 场赛事` : `${(f.fileSize / 1024).toFixed(1)} KB`}
                          </span>
                          <span className="text-[11px] text-slate-500 hidden sm:inline">
                            {f.confidenceDesc}
                          </span>
                          <button
                            onClick={() => handleRemoveSniffedFile(idx)}
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition-colors"
                            title="移除此文件"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 纯文本/JSON 片段粘贴快捷补充 */}
              <div className="pt-2 border-t border-slate-800/80">
                <details className="text-xs group">
                  <summary className="cursor-pointer text-slate-400 hover:text-slate-300 font-medium flex items-center justify-between list-none py-1">
                    <span>或直接粘贴 JSON 文本片段 (可选)</span>
                    <span className="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={rawPastedText}
                      onChange={(e) => setRawPastedText(e.target.value)}
                      placeholder="在此直接粘贴 JSON 文本，系统将同样对其进行特征嗅探..."
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
                    />
                    <button
                      type="button"
                      onClick={handleAddPastedText}
                      disabled={!rawPastedText.trim()}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium transition-colors"
                    >
                      识别并加入列表
                    </button>
                  </div>
                </details>
              </div>

              {/* 状态与反馈信息 */}
              {importFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    importFeedback.success
                      ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                      : "bg-rose-950/60 border border-rose-800 text-rose-300"
                  }`}
                >
                  {importFeedback.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{importFeedback.message}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={handleResetToSample}
                disabled={importing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                title="重置为内置真实测试样本"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                重置为内置标准样本
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFeedback(null);
                  }}
                  disabled={importing}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  取消
                </button>
                <button
                  onClick={handleExecuteImport}
                  disabled={importing || sniffedFiles.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  {importing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{importing ? "正在解析并对齐..." : `🚀 导入已识别数据 (${sniffedFiles.length})`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Slim Brief 弹窗 */}
      {selectedBrief && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  极简 AI 提炼包预览 (AiEvaluationBrief)
                </h3>
                <span className="text-xs px-2 py-0.5 bg-emerald-900/60 text-emerald-300 rounded font-mono font-medium border border-emerald-700/50">
                  ~250 Tokens
                </span>
              </div>
              <button
                onClick={() => setSelectedBrief(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
                <pre>{JSON.stringify(selectedBrief, null, 2)}</pre>
              </div>

              {selectedCanonical && selectedCanonical.missing_reasons.length > 0 && (
                <div className="p-3.5 bg-amber-950/40 border border-amber-900/60 rounded-xl">
                  <h4 className="text-xs font-bold text-amber-300 mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    数据缺口分析与不稳定性预警
                  </h4>
                  <ul className="text-xs text-amber-300/80 list-disc list-inside space-y-0.5">
                    {selectedCanonical.missing_reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setSelectedBrief(null)}
                className="px-4 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition-colors border border-slate-700"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

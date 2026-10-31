import React, { useState, useMemo } from "react";
import {
  FileCode,
  X,
  FileJson,
  Zap,
  Copy,
  CheckCheck,
  Download,
  Filter,
  Check,
  Search,
} from "lucide-react";
import { CanonicalMatch } from "../../../refactor/02_canonical_model/types";
import { QuantitativeFeatures } from "../../../refactor/03_quant_engine/types";

interface CanonicalExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: CanonicalMatch[];
  quantFeaturesMap: Record<string, QuantitativeFeatures>;
  mode: "live" | "prematch";
  refactorBatchId?: string | null;
}

export const CanonicalExportModal: React.FC<CanonicalExportModalProps> = ({
  isOpen,
  onClose,
  matches,
  quantFeaturesMap,
  mode,
  refactorBatchId,
}) => {
  const [exportModalTab, setExportModalTab] = useState<"input" | "output">("input");
  const [exportModalFormat, setExportModalFormat] = useState<"pure" | "enveloped">("enveloped");
  const [exportCopyFeedback, setExportCopyFeedback] = useState<string | null>(null);
  const [exportSelectedMatchIds, setExportSelectedMatchIds] = useState<Set<string>>(
    () => new Set(matches.map((m) => m.canonical_id).filter(Boolean))
  );
  const [exportMatchSearchTerm, setExportMatchSearchTerm] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filteredExportMatches = useMemo(() => {
    if (!exportMatchSearchTerm.trim()) return matches;
    const term = exportMatchSearchTerm.toLowerCase();
    return matches.filter(
      (m) =>
        m.league_name?.toLowerCase().includes(term) ||
        m.home_team_name?.toLowerCase().includes(term) ||
        m.away_team_name?.toLowerCase().includes(term) ||
        m.canonical_id?.toLowerCase().includes(term)
    );
  }, [matches, exportMatchSearchTerm]);

  const selectedExportMatches = useMemo(() => {
    return matches.filter((m) => exportSelectedMatchIds.has(m.canonical_id));
  }, [matches, exportSelectedMatchIds]);

  const selectedExportQuantFeaturesMap = useMemo(() => {
    const map: Record<string, QuantitativeFeatures> = {};
    for (const m of selectedExportMatches) {
      if (quantFeaturesMap[m.canonical_id]) {
        map[m.canonical_id] = quantFeaturesMap[m.canonical_id];
      }
    }
    return map;
  }, [selectedExportMatches, quantFeaturesMap]);

  if (!isOpen) return null;

  const safeCopyToClipboard = async (text: string, keyOrDesc: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedKey(keyOrDesc);
      setExportCopyFeedback(`✅ 复制成功 (共 ${(text.length / 1024).toFixed(1)} KB)`);
      setTimeout(() => {
        setCopiedKey(null);
        setExportCopyFeedback(null);
      }, 2200);
    } catch (err) {
      console.error("复制到剪贴板失败:", err);
      setExportCopyFeedback("❌ 复制失败，请点击文本框全选手动复制");
      setTimeout(() => setExportCopyFeedback(null), 3000);
    }
  };

  const downloadJSONFile = (filename: string, data: any) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const get03ModelInputData = (targetMatches: CanonicalMatch[] = selectedExportMatches) => {
    return {
      dataset_name: "Layer 03 Quant Engine Input Dataset",
      schema_version: "2.0.0",
      contract_layer: "Layer 02 Canonical Match Assemble -> Layer 03 Quant Engine Ingestion",
      exported_at: new Date().toISOString(),
      mode,
      batch_id: refactorBatchId || "batch_current",
      selected_matches_count: targetMatches.length,
      total_matches_in_pool: matches.length,
      canonical_matches: targetMatches,
    };
  };

  const get03ModelOutputData = (targetMatches: CanonicalMatch[] = selectedExportMatches) => {
    const calculatedMatches = targetMatches.map((m) => {
      const q = quantFeaturesMap[m.canonical_id];
      return {
        canonical_id: m.canonical_id,
        league_name: m.league_name,
        home_team_name: m.home_team_name,
        away_team_name: m.away_team_name,
        stage: m.timing?.stage,
        score: m.score,
        quant_features: q || null,
      };
    });

    const calculatedCount = targetMatches.filter((m) => !!quantFeaturesMap[m.canonical_id]).length;

    return {
      dataset_name: "Layer 03 Quant Engine Output Features Dataset",
      schema_version: "2.0.0",
      contract_layer: "Layer 03 Deterministic & Game Theory Quant Engine Execution",
      contract_spec: "37 Quantitative & Game Features SSOT",
      exported_at: new Date().toISOString(),
      mode,
      batch_id: refactorBatchId || "batch_current",
      selected_matches_count: targetMatches.length,
      total_matches_in_pool: matches.length,
      calculated_matches_count: calculatedCount,
      features_by_match: calculatedMatches,
    };
  };

  const toggleMatchSelection = (canonicalId: string) => {
    setExportSelectedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(canonicalId)) next.delete(canonicalId);
      else next.add(canonicalId);
      return next;
    });
  };

  const selectAll = () => {
    setExportSelectedMatchIds(new Set(matches.map((m) => m.canonical_id)));
  };

  const deselectAll = () => {
    setExportSelectedMatchIds(new Set());
  };

  const invertSelection = () => {
    setExportSelectedMatchIds((prev) => {
      const next = new Set<string>();
      for (const m of matches) {
        if (!prev.has(m.canonical_id)) next.add(m.canonical_id);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-slate-900 rounded-2xl w-full max-w-6xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        {/* 模态框头部 */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-950/80 border border-blue-700/60 flex items-center justify-center text-blue-400 shadow-inner">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-100 text-sm">
                  03 模型数据导出与复制中心
                </h3>
                <span className="text-[11px] px-2 py-0.5 bg-blue-950 text-blue-300 rounded font-mono border border-blue-800/50">
                  Layer 03 Model Data Hub
                </span>
                <span className="text-[11px] px-2 py-0.5 bg-slate-800 text-slate-300 rounded font-mono">
                  {mode === "live" ? "🔴 滚球" : "📅 赛前"} · 共 {matches.length} 场
                </span>
                <span className="text-[11px] px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded font-mono border border-emerald-800/50">
                  已选 {selectedExportMatches.length} 场
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                支持前置勾选目标赛事：所选比赛将实时生成 03 模型接收数据结构 (Input) 与计算后 37 项量化特征结构 (Output)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 顶部控制栏与 Tab 切换 */}
        <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setExportModalTab("input")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                exportModalTab === "input"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>1. 03模型接收的数据结构 (Input)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-black/30 font-mono">
                已选 {selectedExportMatches.length} 场
              </span>
            </button>

            <button
              onClick={() => setExportModalTab("output")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                exportModalTab === "output"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>2. 经过03模型计算后的数据结构 (Output)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-black/30 font-mono">
                已算 {selectedExportMatches.filter((m) => !!quantFeaturesMap[m.canonical_id]).length} 场
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-900 rounded-lg border border-slate-800 p-0.5 text-xs">
              <button
                onClick={() => setExportModalFormat("pure")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  exportModalFormat === "pure"
                    ? "bg-slate-800 text-slate-100 font-medium"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                纯净数据结构
              </button>
              <button
                onClick={() => setExportModalFormat("enveloped")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  exportModalFormat === "enveloped"
                    ? "bg-slate-800 text-slate-100 font-medium"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                包含元数据信封
              </button>
            </div>

            <button
              disabled={selectedExportMatches.length === 0}
              onClick={() => {
                if (selectedExportMatches.length === 0) return;
                const dataToCopy =
                  exportModalTab === "input"
                    ? exportModalFormat === "pure"
                      ? selectedExportMatches
                      : get03ModelInputData(selectedExportMatches)
                    : exportModalFormat === "pure"
                    ? selectedExportQuantFeaturesMap
                    : get03ModelOutputData(selectedExportMatches);
                safeCopyToClipboard(
                  JSON.stringify(dataToCopy, null, 2),
                  `modal_${exportModalTab}_${exportModalFormat}`
                );
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-xs font-medium transition-colors border border-slate-700 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copiedKey === `modal_${exportModalTab}_${exportModalFormat}` ? (
                <>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">已复制 {selectedExportMatches.length} 场</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-blue-400" />
                  <span>一键复制 JSON ({selectedExportMatches.length}场)</span>
                </>
              )}
            </button>

            <button
              disabled={selectedExportMatches.length === 0}
              onClick={() => {
                if (selectedExportMatches.length === 0) return;
                const dateStr = new Date().toISOString().slice(0, 10);
                if (exportModalTab === "input") {
                  const data =
                    exportModalFormat === "pure"
                      ? selectedExportMatches
                      : get03ModelInputData(selectedExportMatches);
                  downloadJSONFile(
                    `03_model_input_${exportModalFormat}_${mode}_${selectedExportMatches.length}matches_${dateStr}.json`,
                    data
                  );
                } else {
                  const data =
                    exportModalFormat === "pure"
                      ? selectedExportQuantFeaturesMap
                      : get03ModelOutputData(selectedExportMatches);
                  downloadJSONFile(
                    `03_model_output_quant_${exportModalFormat}_${mode}_${selectedExportMatches.length}matches_${dateStr}.json`,
                    data
                  );
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出文件 ({selectedExportMatches.length}场)</span>
            </button>
          </div>
        </div>

        {/* 状态横幅 */}
        <div className="px-5 py-2 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {exportModalTab === "input" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-emerald-300 font-medium">03 模型接收数据契约:</span>
                <span>Layer 02 标准化合并实体 (包含盘口宇宙、8维攻防、时序危攻动量、阵容往绩等)</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-blue-300 font-medium">03 模型计算后数据契约:</span>
                <span>37 项纯确定性博弈量化特征 (包含 BDI、动量斜率、泊松时间衰减 λ、公允概率、EV、凯利等)</span>
              </>
            )}
          </div>

          {exportCopyFeedback && (
            <div className="text-xs px-2.5 py-0.5 bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 rounded font-medium animate-in fade-in">
              {exportCopyFeedback}
            </div>
          )}
        </div>

        {/* 核心工作区 */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0 bg-slate-950">
          <div className="w-full md:w-88 lg:w-96 flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/80">
            <div className="p-3 border-b border-slate-800/80 space-y-2.5 bg-slate-950">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Filter className="w-3.5 h-3.5 text-blue-400" />
                  <span>前置赛事勾选</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800/60 font-mono">
                    {selectedExportMatches.length} / {matches.length}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-xs">
                  <button
                    onClick={selectAll}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px]"
                  >
                    全选
                  </button>
                  <button
                    onClick={invertSelection}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px]"
                  >
                    反选
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px]"
                  >
                    清空
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="搜索联赛 / 主客队名..."
                  value={exportMatchSearchTerm}
                  onChange={(e) => setExportMatchSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/40">
              {filteredExportMatches.map((m) => {
                const isChecked = exportSelectedMatchIds.has(m.canonical_id);
                const isCalculated = !!quantFeaturesMap[m.canonical_id];
                return (
                  <label
                    key={m.canonical_id}
                    className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-all ${
                      isChecked
                        ? "bg-slate-900/90 border border-blue-900/40 shadow-xs"
                        : "hover:bg-slate-900/40 border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleMatchSelection(m.canonical_id)}
                      className="mt-1 rounded border-slate-700 text-blue-600 focus:ring-0 focus:outline-hidden"
                    />
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-slate-200 truncate">
                          {m.league_name}
                        </span>
                        {isCalculated ? (
                          <span className="text-[10px] px-1 rounded bg-blue-950 text-blue-300 border border-blue-800/40 font-mono shrink-0">
                            已算
                          </span>
                        ) : (
                          <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400 shrink-0">
                            未算
                          </span>
                        )}
                      </div>
                      <div className="text-slate-300 font-medium truncate mt-0.5">
                        {m.home_team_name} vs {m.away_team_name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center justify-between">
                        <span>{m.timing?.beijing_start_time || m.timing?.stage}</span>
                        {m.score?.score_verified && (
                          <span className="text-emerald-400">
                            {m.score.home_score}:{m.score.away_score}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-4 flex flex-col min-h-0 bg-slate-950">
            {selectedExportMatches.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
                <Filter className="w-10 h-10 text-slate-600 mb-3" />
                <h4 className="text-sm font-semibold text-slate-300">尚未勾选任何比赛</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  请在左侧列表中勾选目标比赛，右侧将实时渲染对应的标准数据结构预览与代码块。
                </p>
                <button
                  onClick={selectAll}
                  className="mt-4 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                >
                  一键全选所有比赛 ({matches.length} 场)
                </button>
              </div>
            ) : (
              <pre className="flex-1 overflow-auto p-4 rounded-xl border border-slate-800 bg-slate-950 text-xs font-mono text-slate-200 select-all leading-relaxed">
                {JSON.stringify(
                  exportModalTab === "input"
                    ? exportModalFormat === "pure"
                      ? selectedExportMatches
                      : get03ModelInputData(selectedExportMatches)
                    : exportModalFormat === "pure"
                    ? selectedExportQuantFeaturesMap
                    : get03ModelOutputData(selectedExportMatches),
                  null,
                  2
                )}
              </pre>
            )}
          </div>
        </div>

        {/* 底部信息栏 */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-3 font-mono">
            <span>
              当前已勾选: <strong className="text-emerald-400">{selectedExportMatches.length}</strong> / {matches.length} 场
            </span>
            <span>•</span>
            <span>
              03 已计算: <strong className="text-blue-400">{selectedExportMatches.filter((m) => !!quantFeaturesMap[m.canonical_id]).length}</strong> 场
            </span>
            <span>•</span>
            <span>
              03 未就绪: <strong className="text-amber-400">{selectedExportMatches.filter((m) => !quantFeaturesMap[m.canonical_id]).length}</strong> 场
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition-colors border border-slate-700"
          >
            关闭面板
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from "react";
import {
  Upload,
  UserCheck,
  X,
  FileJson,
  Trash2,
  CheckCircle,
  AlertTriangle,
  ArrowUpDown,
  RefreshCw,
  ArrowRightLeft,
  Shield,
  Layers,
} from "lucide-react";
import {
  sniffIngressPayload,
  SniffedFileInfo,
} from "../../../refactor/01_data_ingestion/ingressSniffer";
import {
  MatchAlignmentStatus,
  LeagueMatchStatus,
} from "../../../refactor/02_canonical_model/enums";
import { CanonicalMatch, AiEvaluationBrief } from "../../../refactor/02_canonical_model/types";
import { QuantitativeFeatures } from "../../../refactor/03_quant_engine/types";
import { ImportPendingMatch, LeisuCandidateItem } from "./types";

interface CanonicalImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "live" | "prematch";
  leisuPool: LeisuCandidateItem[];
  onImportSuccess: (data: {
    mode?: "live" | "prematch";
    matches: CanonicalMatch[];
    aiBriefs: AiEvaluationBrief[];
    quantitativeFeatures?: Record<string, QuantitativeFeatures>;
    metadata?: any;
    batchId?: string;
    importedAt?: string;
    leisuCandidates?: LeisuCandidateItem[];
  }) => void;
}

export const CanonicalImportWizard: React.FC<CanonicalImportWizardProps> = ({
  isOpen,
  onClose,
  mode,
  leisuPool,
  onImportSuccess,
}) => {
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [sniffedFiles, setSniffedFiles] = useState<SniffedFileInfo[]>([]);
  const [rawPastedText, setRawPastedText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const [importPendingMatches, setImportPendingMatches] = useState<ImportPendingMatch[]>([]);
  const [selectedImportMatchIds, setSelectedImportMatchIds] = useState<string[]>([]);
  const [isSavingPending, setIsSavingPending] = useState(false);

  if (!isOpen) return null;

  const processRawJsonFile = (file: File): Promise<SniffedFileInfo> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          const sniffed = sniffIngressPayload(file.name, file.size, parsed);
          resolve(sniffed);
        } catch (err: any) {
          reject(new Error(`解析 JSON 失败: ${err.message}`));
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
        onImportSuccess({
          mode: data.mode,
          matches: data.matches || [],
          aiBriefs: data.ai_briefs || [],
          quantitativeFeatures: data.quantitative_features,
          metadata: data.metadata,
          batchId: data.batch_id,
          importedAt: data.imported_at,
          leisuCandidates: data.leisu_candidates,
        });

        onClose();
      } else {
        setImportFeedback({
          success: false,
          message: data.error || "导入处理失败",
        });
      }
    } catch (err: any) {
      setImportFeedback({
        success: false,
        message: `网络或服务端异常: ${err.message}`,
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-slate-900 rounded-2xl w-full max-w-4xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <span>智能数据导入 (Smart Ingress Importer)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                支持同时拖入或粘贴多个 JSON（自动嗅探 YBTY 滚球/赛前、雷速接口数据）
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
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
                  自动嗅探：<span className="text-blue-400 font-medium">YBTY滚球</span> / <span className="text-purple-400 font-medium">YBTY赛前</span> / <span className="text-emerald-400 font-medium">雷速接口数据</span>
                </p>
              </div>
              <span className="text-[11px] px-3 py-1 bg-slate-800 text-slate-300 rounded-full border border-slate-700">
                支持按住 Ctrl/Cmd 多选或同时拖入多个 .json 文件
              </span>
            </div>
          </div>

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
                      <button
                        onClick={() => setSniffedFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>或直接粘贴 JSON 文本片段</span>
              {rawPastedText && (
                <button
                  onClick={handleAddPastedText}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold"
                >
                  解析并加入待导清单
                </button>
              )}
            </div>
            <textarea
              rows={3}
              placeholder="在此粘贴 YBTY 或雷速 JSON 内容..."
              value={rawPastedText}
              onChange={(e) => setRawPastedText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {importFeedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                importFeedback.success
                  ? "bg-emerald-950/80 border border-emerald-700/80 text-emerald-200"
                  : "bg-rose-950/80 border border-rose-700/80 text-rose-200"
              }`}
            >
              {importFeedback.success ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{importFeedback.message}</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            已选择 <strong className="text-emerald-400 font-mono">{sniffedFiles.length}</strong> 个文件
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={importing || sniffedFiles.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${importing ? "animate-spin" : ""}`} />
              <span>{importing ? "正在解析并执行标准组装..." : "开始导入并组装"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

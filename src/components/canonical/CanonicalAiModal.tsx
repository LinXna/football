import React from "react";
import { Sparkles, X, RefreshCw, FileText, Copy, Database } from "lucide-react";
import { CanonicalMatch } from "../../../refactor/02_canonical_model/types";

export interface CanonicalAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: CanonicalMatch[];
  aiSelectedMatchIds: Set<string>;
  setAiSelectedMatchIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  aiEvalMode: "live_eval" | "prematch_eval" | "parlay_check";
  setAiEvalMode: (mode: "live_eval" | "prematch_eval" | "parlay_check") => void;
  handleGeneratePrompt: () => void;
  handleImportAiEvaluation: () => void;
  isAiLoading: boolean;
  aiFeedback: { type: "success" | "error"; message: string } | null;
  setAiFeedback: React.Dispatch<React.SetStateAction<{ type: "success" | "error"; message: string } | null>>;
  aiGeneratedPrompt: string;
  aiImportJson: string;
  setAiImportJson: (val: string) => void;
  isMatchQualifiedForParlay: (matchId: string) => boolean;
}

export const CanonicalAiModal: React.FC<CanonicalAiModalProps> = ({
  isOpen,
  onClose,
  matches,
  aiSelectedMatchIds,
  setAiSelectedMatchIds,
  aiEvalMode,
  setAiEvalMode,
  handleGeneratePrompt,
  handleImportAiEvaluation,
  isAiLoading,
  aiFeedback,
  setAiFeedback,
  aiGeneratedPrompt,
  aiImportJson,
  setAiImportJson,
  isMatchQualifiedForParlay,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/50 p-4">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            AI 批量生成与导入中心
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {aiFeedback && (
            <div
              className={`p-3 rounded-lg text-sm ${
                aiFeedback.type === "success"
                  ? "bg-emerald-950/30 text-emerald-400 border border-emerald-800/50"
                  : "bg-rose-950/30 text-rose-400 border border-rose-800/50"
              }`}
            >
              {aiFeedback.message}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：选择赛事 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-2 p-1 bg-slate-950 rounded-lg border border-slate-800">
                  <label
                    className={`flex-1 text-center py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                      aiEvalMode === "live_eval" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      className="hidden"
                      checked={aiEvalMode === "live_eval"}
                      onChange={() => setAiEvalMode("live_eval")}
                    />
                    滚球评估
                  </label>
                  <label
                    className={`flex-1 text-center py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                      aiEvalMode === "prematch_eval"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      className="hidden"
                      checked={aiEvalMode === "prematch_eval"}
                      onChange={() => setAiEvalMode("prematch_eval")}
                    />
                    赛前评估
                  </label>
                  <label
                    className={`flex-1 text-center py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                      aiEvalMode === "parlay_check"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      className="hidden"
                      checked={aiEvalMode === "parlay_check"}
                      onChange={() => setAiEvalMode("parlay_check")}
                    />
                    串关评估
                  </label>
                </div>

                <h3 className="font-semibold text-slate-200 text-sm mt-3">1. 勾选待评估赛事</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const filtered = matches.filter((m) => {
                        if (aiEvalMode === "live_eval") return m.timing?.stage === "LIVE";
                        if (aiEvalMode === "prematch_eval") return m.timing?.stage !== "LIVE";
                        if (aiEvalMode === "parlay_check") return isMatchQualifiedForParlay(m.canonical_id);
                        return true;
                      });
                      setAiSelectedMatchIds(new Set(filtered.map((m) => m.canonical_id)));
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    全选
                  </button>
                  <button
                    onClick={() => setAiSelectedMatchIds(new Set())}
                    className="text-xs text-slate-400 hover:text-slate-300"
                  >
                    清空
                  </button>
                </div>
              </div>

              {aiEvalMode === "parlay_check" && (
                <div className="p-2 mb-2 rounded border border-amber-800/50 bg-amber-950/30 text-xs text-amber-400">
                  提示：已开启极高风险隔离。此处仅显示近期已通过 AI 单场评估且获得 A 级或 B 级的“熟肉”赛事，未评估的“生肉”赛事已被强制隐藏并禁止勾选。
                </div>
              )}

              <div className="bg-slate-950 rounded-lg border border-slate-800 h-[380px] overflow-y-auto p-2 space-y-1">
                {(() => {
                  const displayMatches = matches.filter((m) => {
                    if (aiEvalMode === "live_eval") return m.timing?.stage === "LIVE";
                    if (aiEvalMode === "prematch_eval") return m.timing?.stage !== "LIVE";
                    if (aiEvalMode === "parlay_check") return isMatchQualifiedForParlay(m.canonical_id);
                    return true;
                  });
                  if (displayMatches.length === 0) {
                    return <div className="text-center text-slate-500 py-10 text-sm">此维度下无可用赛事</div>;
                  }
                  return displayMatches.map((m) => {
                    const checked = aiSelectedMatchIds.has(m.canonical_id);
                    return (
                      <label
                        key={m.canonical_id}
                        className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? "bg-indigo-950/30 border-indigo-700/50"
                            : "bg-slate-900 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const newSet = new Set(aiSelectedMatchIds);
                            if (checked) newSet.delete(m.canonical_id);
                            else newSet.add(m.canonical_id);
                            setAiSelectedMatchIds(newSet);
                          }}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 checked:bg-indigo-600 focus:ring-0 focus:ring-offset-0 text-indigo-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-200 truncate">
                            {m.home_team_name} vs {m.away_team_name}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {m.league_name} · {m.timing?.stage === "LIVE" ? "滚球" : "赛前"}
                          </div>
                        </div>
                      </label>
                    );
                  });
                })()}
              </div>

              <button
                onClick={handleGeneratePrompt}
                disabled={isAiLoading || aiSelectedMatchIds.size === 0}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                生成 Prompt ({aiSelectedMatchIds.size} 场)
              </button>
            </div>

            {/* 右侧：生成与导入区 */}
            <div className="space-y-6 flex flex-col">
              <div className="space-y-2 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-200 text-sm">2. 复制生成的 Prompt</h3>
                  {aiGeneratedPrompt && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(aiGeneratedPrompt);
                        setAiFeedback({ type: "success", message: "已复制到剪贴板！" });
                      }}
                      className="text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300 bg-emerald-950/50 px-2 py-1 rounded"
                    >
                      <Copy className="w-3 h-3" /> 一键复制
                    </button>
                  )}
                </div>
                <textarea
                  readOnly
                  value={aiGeneratedPrompt}
                  placeholder="生成的 Prompt 将显示在这里..."
                  className="w-full h-[180px] bg-slate-950 text-slate-300 text-xs p-3 rounded-lg border border-slate-800 focus:outline-none resize-none font-mono"
                />
              </div>

              <div className="space-y-2 flex-1 flex flex-col">
                <h3 className="font-semibold text-slate-200 text-sm">3. 粘贴 AI 返回结果并入库</h3>
                <textarea
                  value={aiImportJson}
                  onChange={(e) => setAiImportJson(e.target.value)}
                  placeholder="在此处粘贴从网页版大模型获得的 JSON 结果..."
                  className="w-full h-[140px] bg-slate-950 text-slate-300 text-xs p-3 rounded-lg border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none font-mono"
                />
                <button
                  onClick={handleImportAiEvaluation}
                  disabled={isAiLoading || !aiImportJson.trim()}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  解析结果并保存至风控台账
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

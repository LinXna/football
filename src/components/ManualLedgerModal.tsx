import React, { useState } from "react";
import {
  X,
  ShieldCheck,
  PlusCircle,
  AlertCircle,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: "live" | "prematch";
  defaultMatch?: {
    league_name?: string;
    home_team_name?: string;
    away_team_name?: string;
    minute_or_stage?: string;
    current_score?: string;
    ah_line?: number;
    ou_line?: number;
  };
}

export const ManualLedgerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  mode,
  defaultMatch,
}) => {
  // 推荐台账表单
  const [homeTeam, setHomeTeam] = useState(defaultMatch?.home_team_name || "");
  const [awayTeam, setAwayTeam] = useState(defaultMatch?.away_team_name || "");
  const [league, setLeague] = useState(defaultMatch?.league_name || "");
  const [market, setMarket] = useState("全场让球");
  const [direction, setDirection] = useState("HOME");
  const [line, setLine] = useState(defaultMatch?.ah_line != null ? String(defaultMatch.ah_line) : "0");
  const [odds, setOdds] = useState("1.95");
  const [scoreAtRec, setScoreAtRec] = useState(defaultMatch?.current_score || "0-0");
  const [minuteAtRec, setMinuteAtRec] = useState(defaultMatch?.minute_or_stage || (mode === "live" ? "45" : "赛前"));
  const [grade, setGrade] = useState("A_GRADE");
  const [confidenceScore, setConfidenceScore] = useState("85");
  const [analystNotes, setAnalystNotes] = useState("专家基本面核验与盘口价值核准");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmitRecommendation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeTeam.trim() || !awayTeam.trim()) {
      setErrorMsg("主队与客队名称为必填项");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/refactor/formal-ledger/manual-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          home_team: homeTeam.trim(),
          away_team: awayTeam.trim(),
          league: league.trim() || "常规赛事",
          market,
          direction,
          line: parseFloat(line) || 0,
          odds: parseFloat(odds) || 1.95,
          score_at_recommendation: scoreAtRec.trim(),
          match_minute: mode === "live" ? (parseInt(minuteAtRec, 10) || 45) : null,
          grade,
          confidence_score: parseInt(confidenceScore, 10) || 85,
          analyst_notes: analystNotes.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg(data.error || "写入台账失败");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "网络请求失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">专家合规手动录入中心</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-rose-950/80 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 推荐入账表单 */}
        <form onSubmit={handleSubmitRecommendation} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-400 mb-1">主队名称 (YBTY原始名)</label>
                <input
                  type="text"
                  required
                  value={homeTeam}
                  onChange={(e) => setHomeTeam(e.target.value)}
                  placeholder="例如: 皇家马德里"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">客队名称 (YBTY原始名)</label>
                <input
                  type="text"
                  required
                  value={awayTeam}
                  onChange={(e) => setAwayTeam(e.target.value)}
                  placeholder="例如: 巴塞罗那"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">联赛名称</label>
                <input
                  type="text"
                  value={league}
                  onChange={(e) => setLeague(e.target.value)}
                  placeholder="例如: 西甲"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">推荐玩法</label>
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none"
                >
                  <option value="全场让球">全场让球</option>
                  <option value="全场大小">全场大小</option>
                  <option value="全场独赢">全场独赢</option>
                  <option value="半场让球">半场让球</option>
                  <option value="半场大小">半场大小</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">投注方向</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none font-bold"
                >
                  <option value="HOME">主胜 / 主让</option>
                  <option value="AWAY">客胜 / 客让</option>
                  <option value="OVER">大球 (OVER)</option>
                  <option value="UNDER">小球 (UNDER)</option>
                  <option value="DRAW">平局 (DRAW)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">盘口数值 (Line)</label>
                <input
                  type="text"
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                  placeholder="0, -0.5, 2.5"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">赔率 (Odds)</label>
                <input
                  type="number"
                  step="0.01"
                  value={odds}
                  onChange={(e) => setOdds(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">推荐时比分</label>
                <input
                  type="text"
                  value={scoreAtRec}
                  onChange={(e) => setScoreAtRec(e.target.value)}
                  placeholder="0-0"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">综合评级与置信度</label>
                <div className="flex gap-1.5">
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none font-bold text-emerald-400"
                  >
                    <option value="A_GRADE">A_GRADE</option>
                    <option value="B_GRADE">B_GRADE</option>
                  </select>
                  <input
                    type="number"
                    value={confidenceScore}
                    onChange={(e) => setConfidenceScore(e.target.value)}
                    placeholder="置信分 (≥70)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">分析师核准评语</label>
                <input
                  type="text"
                  value={analystNotes}
                  onChange={(e) => setAnalystNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-slate-400 hover:text-white rounded border border-slate-800"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded transition-colors flex items-center gap-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{isSubmitting ? "写入中..." : "正式批准写入台账"}</span>
              </button>
            </div>
          </form>
      </div>
    </div>
  );
};

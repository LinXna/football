import React from "react";
import { Filter, Search, Sparkles } from "lucide-react";
import { DataCompletenessTier } from "../../../refactor/02_canonical_model/enums";

export interface DecisionCounts {
  all: number;
  bettable: number;
  blocked: number;
  waiting: number;
  aiEvaluated: number;
}

export interface CanonicalFilterBarProps {
  decisionFilter: "ALL" | "BETTABLE" | "BLOCKED" | "WAITING" | "AI_EVALUATED";
  setDecisionFilter: (filter: "ALL" | "BETTABLE" | "BLOCKED" | "WAITING" | "AI_EVALUATED") => void;
  countsByDecision: DecisionCounts;
  searchKeyword: string;
  setSearchKeyword: (val: string) => void;
  tierFilter: string;
  setTierFilter: (tier: string) => void;
}

export const CanonicalFilterBar: React.FC<CanonicalFilterBarProps> = ({
  decisionFilter,
  setDecisionFilter,
  countsByDecision,
  searchKeyword,
  setSearchKeyword,
  tierFilter,
  setTierFilter,
}) => {
  return (
    <div className="flex flex-col gap-3 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 shadow-md">
      {/* 第一行：决策状态与开仓风控核心筛选 (用户高频核心操作区) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto flex-wrap">
          <span className="text-xs text-slate-400 font-semibold whitespace-nowrap flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            开仓风控筛选:
          </span>

          {/* 全部 */}
          <button
            id="filter-decision-all"
            onClick={() => setDecisionFilter("ALL")}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all font-semibold flex items-center gap-1.5 whitespace-nowrap ${
              decisionFilter === "ALL"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-950 text-slate-400 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <span>全部赛事</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                decisionFilter === "ALL" ? "bg-blue-800 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              {countsByDecision.all}
            </span>
          </button>

          {/* 🎯 可投注 */}
          <button
            id="filter-decision-bettable"
            onClick={() => setDecisionFilter("BETTABLE")}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all font-bold flex items-center gap-1.5 whitespace-nowrap border ${
              decisionFilter === "BETTABLE"
                ? "bg-emerald-600 text-white border-emerald-400 shadow-sm ring-1 ring-emerald-400"
                : "bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/70 border-emerald-700/60"
            }`}
            title="仅筛选 AI 终审推荐开仓或具备高正期望的可投注比赛"
          >
            <span>🎯 可投注</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                decisionFilter === "BETTABLE"
                  ? "bg-emerald-800 text-white"
                  : "bg-emerald-900/80 text-emerald-200"
              }`}
            >
              {countsByDecision.bettable}
            </span>
          </button>

          {/* 🚫 已阻断 */}
          <button
            id="filter-decision-blocked"
            onClick={() => setDecisionFilter("BLOCKED")}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all font-bold flex items-center gap-1.5 whitespace-nowrap border ${
              decisionFilter === "BLOCKED"
                ? "bg-rose-600 text-white border-rose-400 shadow-sm ring-1 ring-rose-400"
                : "bg-rose-950/40 text-rose-300 hover:bg-rose-950/70 border-rose-700/60"
            }`}
            title="仅筛选被 AI 排雷阻断、机构高水诱盘陷阱或风控拦截的比赛"
          >
            <span>🚫 已阻断 (排雷/诱盘)</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                decisionFilter === "BLOCKED"
                  ? "bg-rose-800 text-white"
                  : "bg-rose-900/80 text-rose-200"
              }`}
            >
              {countsByDecision.blocked}
            </span>
          </button>

          {/* ⚠️ 观望待定 */}
          <button
            id="filter-decision-waiting"
            onClick={() => setDecisionFilter("WAITING")}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all font-medium flex items-center gap-1.5 whitespace-nowrap ${
              decisionFilter === "WAITING"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-slate-950 text-slate-400 hover:bg-slate-800 border border-slate-800"
            }`}
            title="全盘无正期望项或未达实战开仓门禁"
          >
            <span>⚠️ 观望待定</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                decisionFilter === "WAITING"
                  ? "bg-amber-800 text-white"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {countsByDecision.waiting}
            </span>
          </button>

          {/* 🤖 已AI终审 */}
          <button
            id="filter-decision-ai-evaluated"
            onClick={() => setDecisionFilter("AI_EVALUATED")}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all font-medium flex items-center gap-1.5 whitespace-nowrap border ${
              decisionFilter === "AI_EVALUATED"
                ? "bg-indigo-600 text-white border-indigo-400 shadow-xs"
                : "bg-indigo-950/30 text-indigo-300 hover:bg-indigo-950/60 border-indigo-800/60"
            }`}
            title="仅筛选已完成并导入 AI 终审报告的比赛"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>已AI终审</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                decisionFilter === "AI_EVALUATED"
                  ? "bg-indigo-800 text-white"
                  : "bg-indigo-900/60 text-indigo-300"
              }`}
            >
              {countsByDecision.aiEvaluated}
            </span>
          </button>
        </div>

        {/* 活跃过滤指示与清除按钮 */}
        {decisionFilter !== "ALL" && (
          <button
            onClick={() => setDecisionFilter("ALL")}
            className="text-xs text-slate-400 hover:text-blue-400 underline whitespace-nowrap"
          >
            清除风控筛选
          </button>
        )}
      </div>

      {/* 第二行：关键字搜索与数据完整度辅助过滤 */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-match"
            type="text"
            placeholder="搜索联赛名、YBTY队名、雷速队名..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-200"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto flex-wrap">
          <span className="text-xs text-slate-400 whitespace-nowrap">完整度:</span>
          {[
            "ALL",
            DataCompletenessTier.TIER_1_FULL,
            DataCompletenessTier.TIER_2_BASIC,
            DataCompletenessTier.TIER_3_SPARSE,
            DataCompletenessTier.TIER_INVALID,
          ].map((tier) => (
            <button
              key={tier}
              id={`filter-${tier}`}
              onClick={() => setTierFilter(tier)}
              className={`text-xs px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                tierFilter === tier
                  ? "bg-blue-600 text-white font-medium shadow-xs"
                  : "bg-slate-950 text-slate-400 hover:bg-slate-800 border border-slate-800"
              }`}
            >
              {tier === "ALL" ? "全部" : tier.replace("TIER_", "")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

import React from "react";
import {
  Zap,
  Flame,
  Scale,
  Target,
  Clock,
  BarChart2,
  Shield,
} from "lucide-react";
import { CanonicalMatch, MatchStage } from "../../refactor/02_canonical_model";
import {
  QuantitativeFeatures,
  GoalPhaseAlert,
  BookmakerPosture,
} from "../../refactor/03_quant_engine/types";
import {
  QuantBettingDecisionMatrix,
  getQuantScreeningDecision,
} from "./QuantBettingDecisionMatrix";

export { getQuantScreeningDecision };

interface MachineQuantEvaluationPanelProps {
  match: CanonicalMatch;
  quant: QuantitativeFeatures;
}

export const MachineQuantEvaluationPanel: React.FC<MachineQuantEvaluationPanelProps> = ({
  match,
  quant,
}) => {
  const decision = getQuantScreeningDecision(quant);

  // 格式化 BDI 显示
  const bdi = quant.battlefield_dominance_index;
  const bdiText = bdi > 0 ? `+${bdi.toFixed(1)} (主优)` : bdi < 0 ? `${bdi.toFixed(1)} (客优)` : `0.0 (均衡)`;
  const bdiColor = bdi > 10 ? "text-blue-400" : bdi < -10 ? "text-purple-400" : "text-slate-300";

  // 格式化破门相变
  const getGoalPhaseBadge = (phase: GoalPhaseAlert) => {
    switch (phase) {
      case GoalPhaseAlert.IMMINENT_GOAL:
        return {
          label: "🚨 破门临界相变 (即刻进球预警)",
          color: "text-rose-300 bg-rose-950/80 border-rose-700",
          desc: "连续高压围攻/绝境搏命，破门相变临界触发",
        };
      case GoalPhaseAlert.DEADLOCK_STALEMATE:
        return {
          label: "⚖️ 攻防僵局 (中场绞杀)",
          color: "text-amber-300 bg-amber-950/80 border-amber-700",
          desc: "双方中场密集对抗，威胁转化率极低",
        };
      case GoalPhaseAlert.LOW_INTENSITY_GARBAGE_TIME:
        return {
          label: "⏳ 垃圾时间 (控场降速)",
          color: "text-slate-400 bg-slate-900 border-slate-700",
          desc: "领先方收缩控节奏，落后方战意衰退",
        };
      default:
        return {
          label: "🌊 常规比赛节奏",
          color: "text-emerald-300 bg-emerald-950/80 border-emerald-700",
          desc: "攻防动量平稳演进",
        };
    }
  };
  const goalPhase = getGoalPhaseBadge(quant.goal_phase_alert);

  // 格式化庄家姿态
  const getPostureBadge = (posture: BookmakerPosture) => {
    switch (posture) {
      case BookmakerPosture.TRAP_HIGH_ODDS:
        return {
          label: "⚠️ 诱高赔陷阱 (偏向低赔防御)",
          color: "text-rose-400 bg-rose-950/60 border-rose-800",
        };
      case BookmakerPosture.DISPERSED_UNCERTAIN:
        return {
          label: "⚠️ 盘口离散分歧 (不确定性高)",
          color: "text-amber-400 bg-amber-950/60 border-amber-800",
        };
      case BookmakerPosture.NEUTRAL_BALANCED:
      default:
        return {
          label: "⚖️ 均衡控盘 (公允水位平衡)",
          color: "text-blue-400 bg-blue-950/60 border-blue-800",
        };
    }
  };
  const posture = getPostureBadge(quant.devig.bookmaker_posture);

  const isLiveMatch = match.timing.stage === MatchStage.LIVE;

  return (
    <div className="bg-slate-950/90 p-3.5 rounded-xl border border-blue-950/80 space-y-3.5 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. 2行 x 3项 核心盘口与下注决策网格 (包含全场 3 栏 + 半场 3 栏)             */}
      {/* ========================================================================= */}
      <QuantBettingDecisionMatrix match={match} quant={quant} showHeader={true} />

      {/* ========================================================================= */}
      {/* 2. 总体量化评估四联指标看板 (Summary 4-Card Diagnostics Grid)              */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 看板 1: 机器初筛决策定级 */}
        <div className={`p-3 rounded-lg border ${decision.borderClass} ${decision.bgClass} flex flex-col justify-between`}>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              03 机器初筛定级
            </span>
            <span className="font-mono text-slate-400">置信度 {quant.confidence_score}分</span>
          </div>
          <div className="my-1.5">
            <div className={`text-xs font-bold ${decision.colorClass} flex items-center gap-1.5`}>
              <span>{decision.badge}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{decision.description}</p>
          </div>
          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                quant.confidence_score >= 80 ? "bg-emerald-500" : quant.confidence_score >= 60 ? "bg-amber-500" : "bg-rose-500"
              }`}
              style={{ width: `${Math.max(5, quant.confidence_score)}%` }}
            />
          </div>
        </div>

        {/* 看板 2: BDI 战场统治权指数 */}
        <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/90 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-blue-400" />
              BDI 战场统治权
            </span>
            <span className="font-mono text-slate-500">[-100, +100]</span>
          </div>
          <div className="my-1.5">
            <div className={`text-sm font-bold font-mono ${bdiColor}`}>{bdiText}</div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate" title={bdi > 15 ? `主队 ${match.home_team_name} 占据压迫权` : bdi < -15 ? `客队 ${match.away_team_name} 占据压迫权` : "双方场面拉锯，互有攻守"}>
              {bdi > 15
                ? `主队 ${match.home_team_name} 占据压迫权`
                : bdi < -15
                ? `客队 ${match.away_team_name} 占据压迫权`
                : "双方场面拉锯，互有攻守"}
            </div>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 justify-between">
            <span className="text-blue-400">主: {quant.timeline.integral_15m.home.toFixed(0)}</span>
            <span className="text-slate-600">vs</span>
            <span className="text-purple-400">客: {quant.timeline.integral_15m.away.toFixed(0)}</span>
            <span className="text-slate-500">净积分: {quant.timeline.integral_15m.net.toFixed(0)}</span>
          </div>
        </div>

        {/* 看板 3: 破门相变临界预警 */}
        <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/90 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              破门相变预警
            </span>
            <span className="font-mono text-slate-500">{match.timing.minute ?? "-"} 分钟</span>
          </div>
          <div className="my-1.5">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold border ${goalPhase.color}`}>
              {goalPhase.label}
            </span>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight truncate">{goalPhase.desc}</p>
          </div>
          <div className="text-[10px] text-slate-500 flex justify-between font-mono">
            <span>5m斜率: {quant.timeline.slope_5m.toFixed(2)}</span>
            <span>15m斜率: {quant.timeline.slope_15m.toFixed(2)}</span>
          </div>
        </div>

        {/* 看板 4: 庄家博弈姿态与抽水 */}
        <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/90 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-purple-400" />
              庄家博弈姿态
            </span>
            <span className="font-mono text-slate-500">
              {quant.devig.h2h_devig
                ? `抽水 ${((quant.devig.h2h_devig.raw_overround - 1) * 100).toFixed(1)}%`
                : "独赢缺口"}
            </span>
          </div>
          <div className="my-1.5">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold border ${posture.color}`}>
              {posture.label}
            </span>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              让球方差: {quant.devig.line_dispersion.spread_variance.toFixed(3)}
            </p>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            去抽水: {quant.devig.h2h_devig?.devig_method ?? "Shin / Mult"}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. 🔮 纯 Forward 泊松赛果推演与 0:0 完场预测                               */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="font-bold text-xs text-slate-100">
              纯 Forward 泊松期望推演 (0:0 实时让球重置与时间衰减)
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            已进行: {quant.poisson.elapsed_minute}&apos; | 剩余时段: {quant.poisson.remaining_minutes}&apos;
          </div>
        </div>

        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 3.1 剩余时段进球期望 λ */}
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>剩余进球期望 (λ_rest)</span>
              <span className="text-[10px] text-slate-500 font-mono">Poisson</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-0.5 font-mono">
              <div className="bg-slate-900 p-1.5 rounded border border-blue-900/40">
                <div className="text-[10px] text-slate-400 truncate">主队 λ</div>
                <div className="text-sm font-bold text-blue-400">
                  {quant.poisson.lambda_home_rest.toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-900 p-1.5 rounded border border-purple-900/40">
                <div className="text-[10px] text-slate-400 truncate">客队 λ</div>
                <div className="text-sm font-bold text-purple-400">
                  {quant.poisson.lambda_away_rest.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex justify-between pt-0.5 border-t border-slate-800/80">
              <span>剩余总期望:</span>
              <strong className="text-emerald-400 font-mono">
                {quant.poisson.expected_goals_rest.toFixed(2)} 球
              </strong>
            </div>
          </div>

          {/* 3.2 最可能完场比分预测 */}
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>最可能完场比分预测</span>
              <span className="text-[10px] text-slate-500 font-mono">Score</span>
            </div>

            <div className="space-y-1.5 font-mono text-xs pt-0.5">
              <div className="p-1.5 rounded bg-slate-900/90 border border-purple-900/50 flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">最高频完场比分:</span>
                <strong className="text-sm text-purple-300 font-bold">
                  {quant.poisson.projected_final_score.most_likely_score}
                </strong>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 px-0.5">
                <span>预期主球: {quant.poisson.projected_final_score.home.toFixed(2)}</span>
                <span>预期客球: {quant.poisson.projected_final_score.away.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* 3.3 剩余时段胜平负概率分布 */}
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>剩余时段胜负分布 (0:0重置)</span>
              <span className="text-[10px] text-slate-500 font-mono">Rest</span>
            </div>

            <div className="space-y-1 pt-0.5 text-xs font-mono">
              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-blue-400">主胜</span>
                  <span className="text-slate-300 font-bold">
                    {(quant.poisson.rest_score_matrix.prob_home_win_rest * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full"
                    style={{
                      width: `${quant.poisson.rest_score_matrix.prob_home_win_rest * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-amber-400">平局</span>
                  <span className="text-slate-300 font-bold">
                    {(quant.poisson.rest_score_matrix.prob_draw_rest * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full"
                    style={{
                      width: `${quant.poisson.rest_score_matrix.prob_draw_rest * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-purple-400">客胜</span>
                  <span className="text-slate-300 font-bold">
                    {(quant.poisson.rest_score_matrix.prob_away_win_rest * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-500 h-full"
                    style={{
                      width: `${quant.poisson.rest_score_matrix.prob_away_win_rest * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. ⚡ 战场物理攻防与战术异动体检                                            */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-xs text-slate-100">
              战场物理攻防与战术异动体检 (37+ 项量化特征监控)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            攻防威胁比: {quant.physical_stats.xt_proxy.xt_ratio.toFixed(2)}
          </span>
        </div>

        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs font-mono">
          <div className="bg-slate-950/70 p-2 rounded border border-slate-800 space-y-0.5">
            <div className="text-slate-400 text-[10px]">危攻转化效率 (DAR)</div>
            <div className="text-xs font-bold text-slate-200">
              主: {quant.physical_stats.conversion_efficiency.home_conversion.toFixed(2)} / 客: {quant.physical_stats.conversion_efficiency.away_conversion.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500">每次危攻转化为射门的比例</div>
          </div>

          <div className="bg-slate-950/70 p-2 rounded border border-slate-800 space-y-0.5">
            <div className="text-slate-400 text-[10px]">射门精准度 (SOT%)</div>
            <div className="text-xs font-bold text-slate-200">
              主: {(quant.physical_stats.conversion_efficiency.home_accuracy * 100).toFixed(0)}% / 客: {(quant.physical_stats.conversion_efficiency.away_accuracy * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-slate-500">射正占总射门的比例</div>
          </div>

          <div className="bg-slate-950/70 p-2 rounded border border-slate-800 space-y-0.5">
            <div className="text-slate-400 text-[10px]">战术异动监控</div>
            <div className="text-xs font-bold text-slate-200">
              {quant.physical_stats.tactical_anomaly.home_barren_dominance
                ? "⚠️ 主队浪射无实质威胁"
                : quant.physical_stats.tactical_anomaly.away_barren_dominance
                ? "⚠️ 客队浪射无实质威胁"
                : "✓ 攻防传导结构正常"}
            </div>
            <div className="text-[10px] text-slate-500">异常浪射或致命反击</div>
          </div>

          <div className="bg-slate-950/70 p-2 rounded border border-slate-800 space-y-0.5">
            <div className="text-slate-400 text-[10px]">数据完备性与层级</div>
            <div className="text-xs font-bold text-slate-200">
              {match.completeness_tier}
            </div>
            <div className="text-[10px] text-slate-500">
              缺失: {match.missing_reasons.length > 0 ? match.missing_reasons.join(", ") : "无缺失"}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. 🛡️ L0 熔断与风险审计报告                                                */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/40 px-3 py-2 rounded-lg border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            系统风控说明：机器初筛评分与 +EV 信号为纯确定性量化推演，正式投注请严格结合 AI 基本面核验。
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span>比分核验: {match.score.score_verified ? "✓ 已验证" : "⚠️ 待核验"}</span>
          <span>•</span>
          <span>四分之一盘严格结算: 已开启</span>
        </div>
      </div>
    </div>
  );
};

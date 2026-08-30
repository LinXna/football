import React from "react";
import {
  Zap,
  Shield,
  TrendingUp,
  BarChart2,
  Target,
  Clock,
  Flame,
  Scale,
  Sparkles,
  Activity,
  Percent,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { CanonicalMatch, MatchStage } from "../../refactor/02_canonical_model";
import {
  QuantitativeFeatures,
  GoalPhaseAlert,
  BookmakerPosture,
} from "../../refactor/03_quant_engine/types";
import { formatAsianLine } from "../lib/quarterSettlement";

interface MachineQuantEvaluationPanelProps {
  match: CanonicalMatch;
  quant: QuantitativeFeatures;
}

export function getQuantScreeningDecision(quant: QuantitativeFeatures): {
  badge: string;
  level: "WATCH" | "RESEARCH" | "REJECTED";
  colorClass: string;
  borderClass: string;
  bgClass: string;
  description: string;
} {
  if (quant.context.circuit_breaker.is_triggered || quant.confidence_score === 0) {
    return {
      badge: "REJECTED (熔断拦截)",
      level: "REJECTED",
      colorClass: "text-rose-400",
      borderClass: "border-rose-700/60",
      bgClass: "bg-rose-950/60",
      description: "触发 L0 级数据缺陷熔断，直接一票否决拒绝推荐",
    };
  }

  if (quant.confidence_score >= 80 && quant.positive_ev_signals.length > 0) {
    return {
      badge: `WATCH (重点监控 · ${quant.positive_ev_signals.length}项+EV)`,
      level: "WATCH",
      colorClass: "text-emerald-300",
      borderClass: "border-emerald-600/70",
      bgClass: "bg-emerald-950/70",
      description: "高置信度且发现统计正期望 (+EV) 投注窗口，符合初筛标准",
    };
  }

  if (quant.confidence_score >= 60) {
    return {
      badge: "RESEARCH (待深度调研)",
      level: "RESEARCH",
      colorClass: "text-amber-300",
      borderClass: "border-amber-600/70",
      bgClass: "bg-amber-950/70",
      description: "数据基础具备但需结合 AI 基本面、伤停与战意进一步校验",
    };
  }

  return {
    badge: "REJECTED (低期望过滤)",
    level: "REJECTED",
    colorClass: "text-slate-400",
    borderClass: "border-slate-700",
    bgClass: "bg-slate-900/80",
    description: "量化置信度不足或未检出正期望价值，机器初筛予以过滤",
  };
}

/** 格式化让球盘口中文名称及拆分规则 */
function formatSpreadSideInfo(
  lineStr: string,
  side: "home" | "away" | "none",
  homeTeam: string,
  awayTeam: string
): {
  sideTeamName: string;
  lineNotation: string;
  handicapDesc: string;
  splitText: string;
  riskSettlementRule: string;
} {
  const isHome = side !== "away";
  const teamName = isHome ? homeTeam : awayTeam;
  const numLine = Number(lineStr) || 0;
  const effectiveLine = isHome ? numLine : -numLine;

  const absLine = Math.abs(effectiveLine);
  const sign = effectiveLine > 0 ? "+" : effectiveLine < 0 ? "-" : "";

  let lineNotation = "";
  let handicapDesc = "";
  let splitText = "";
  let riskSettlementRule = "";

  if (absLine === 0) {
    lineNotation = "0 (平手)";
    handicapDesc = "平手盘";
    splitText = "平手 [0]";
    riskSettlementRule = "打平全额退本金(走盘)，获胜全赢，失利全输";
  } else if (absLine === 0.25) {
    lineNotation = `${sign}0/0.5 (${effectiveLine > 0 ? "受让平半" : "让平半"})`;
    handicapDesc = effectiveLine > 0 ? "受让平半 (+0.25)" : "让平半 (-0.25)";
    splitText = effectiveLine > 0 ? "[0平手] + [+0.5受让半球]" : "[0平手] + [-0.5让半球]";
    riskSettlementRule =
      effectiveLine > 0
        ? "打平赢一半(赢半)，获胜全赢，净负全输"
        : "打平输一半(输半)，获胜全赢，失利全输";
  } else if (absLine === 0.5) {
    lineNotation = `${sign}0.5 (${effectiveLine > 0 ? "受让半球" : "让半球"})`;
    handicapDesc = effectiveLine > 0 ? "受让半球 (+0.5)" : "让半球 (-0.5)";
    splitText = effectiveLine > 0 ? "[+0.5受让半球]" : "[-0.5让半球]";
    riskSettlementRule =
      effectiveLine > 0 ? "打平或获胜即全赢，净负1球及以上全输" : "净胜1球及以上全赢，打平或失利全输";
  } else if (absLine === 0.75) {
    lineNotation = `${sign}0.5/1 (${effectiveLine > 0 ? "受让半一" : "让半一"})`;
    handicapDesc = effectiveLine > 0 ? "受让半一 (+0.75)" : "让半一 (-0.75)";
    splitText = effectiveLine > 0 ? "[+0.5受让半球] + [+1受让一球]" : "[-0.5让半球] + [-1让一球]";
    riskSettlementRule =
      effectiveLine > 0
        ? "打平全赢，净负1球输一半(输半)，净负2球全输"
        : "净胜1球赢一半(赢半)，净胜2球全赢，打平或失利全输";
  } else if (absLine === 1.0) {
    lineNotation = `${sign}1.0 (${effectiveLine > 0 ? "受让一球" : "让一球"})`;
    handicapDesc = effectiveLine > 0 ? "受让一球 (+1.0)" : "让一球 (-1.0)";
    splitText = effectiveLine > 0 ? "[+1.0受让一球]" : "[-1.0让一球]";
    riskSettlementRule =
      effectiveLine > 0 ? "打平全赢，净负1球走盘退款，净负2球全输" : "净胜2球全赢，净胜1球走盘退款，打平全输";
  } else {
    const formatted = formatAsianLine(effectiveLine);
    lineNotation = `${sign}${formatted}`;
    handicapDesc = `${sign}${formatted} 盘`;
    splitText = `[${sign}${formatted}]`;
    riskSettlementRule = "按照标准亚洲盘四分之一/半球走盘规则结算";
  }

  return {
    sideTeamName: teamName,
    lineNotation,
    handicapDesc,
    splitText,
    riskSettlementRule,
  };
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

  // 核心盘口与量化特征
  const spreadMain = quant.devig.spread_main_ev;
  const totalMain = quant.devig.total_main_ev;
  const h2hMain = quant.devig.h2h_devig;
  const fullH2hMarket = match.markets.full_h2h;

  // 1. 全场独赢 EV 计算
  const fullH2hEval = (() => {
    if (!fullH2hMarket || !h2hMain) return null;
    const homeEv = fullH2hMarket.home_odds * h2hMain.fair_probabilities[0] - 1;
    const drawEv = fullH2hMarket.draw_odds * h2hMain.fair_probabilities[1] - 1;
    const awayEv = fullH2hMarket.away_odds * h2hMain.fair_probabilities[2] - 1;

    let bestSide: "home" | "draw" | "away" = "home";
    let maxEv = homeEv;
    if (drawEv > maxEv) {
      maxEv = drawEv;
      bestSide = "draw";
    }
    if (awayEv > maxEv) {
      maxEv = awayEv;
      bestSide = "away";
    }

    const sideName =
      bestSide === "home"
        ? `主胜 (${match.home_team_name})`
        : bestSide === "away"
        ? `客胜 (${match.away_team_name})`
        : "平局 (Draw)";
    const bestOdds =
      bestSide === "home"
        ? fullH2hMarket.home_odds
        : bestSide === "away"
        ? fullH2hMarket.away_odds
        : fullH2hMarket.draw_odds;
    const bestProb =
      bestSide === "home"
        ? h2hMain.fair_probabilities[0]
        : bestSide === "away"
        ? h2hMain.fair_probabilities[2]
        : h2hMain.fair_probabilities[1];

    return {
      homeEv,
      drawEv,
      awayEv,
      bestSide,
      sideName,
      bestOdds,
      bestProb,
      maxEv,
      isPositiveEv: maxEv > 0,
    };
  })();

  // 2. 全场大小球 EV 计算
  const fullTotalEval = (() => {
    if (!totalMain) return null;
    const isOver = totalMain.preferred_side === "over";
    const odds = isOver ? totalMain.over_odds : totalMain.under_odds;
    const ev = isOver ? totalMain.over_ev : totalMain.under_ev;
    const estimatedProb = odds > 0 ? (1 + ev) / odds : 0.5;
    return {
      line: totalMain.line,
      isOver,
      sideName: isOver ? `大球 (> ${totalMain.line})` : `小球 (< ${totalMain.line})`,
      odds,
      ev,
      prob: estimatedProb,
      isPositiveEv: totalMain.is_positive_ev,
      overOdds: totalMain.over_odds,
      underOdds: totalMain.under_odds,
      overEv: totalMain.over_ev,
      underEv: totalMain.under_ev,
      overProb: totalMain.over_odds > 0 ? (1 + totalMain.over_ev) / totalMain.over_odds : 0.5,
      underProb: totalMain.under_odds > 0 ? (1 + totalMain.under_ev) / totalMain.under_odds : 0.5,
    };
  })();

  // 3. 全场让球 EV 计算
  const fullSpreadEval = (() => {
    if (!spreadMain) return null;
    const isHome = spreadMain.preferred_side === "home";
    const odds = isHome ? spreadMain.home_odds : spreadMain.away_odds;
    const ev = isHome ? spreadMain.home_ev : spreadMain.away_ev;
    const estimatedProb = odds > 0 ? (1 + ev) / odds : 0.5;
    const spreadInfo = formatSpreadSideInfo(
      spreadMain.line,
      spreadMain.preferred_side,
      match.home_team_name,
      match.away_team_name
    );

    return {
      line: spreadMain.line,
      isHome,
      sideTeamName: spreadInfo.sideTeamName,
      lineNotation: spreadInfo.lineNotation,
      handicapDesc: spreadInfo.handicapDesc,
      splitText: spreadInfo.splitText,
      riskRule: spreadInfo.riskSettlementRule,
      odds,
      ev,
      prob: estimatedProb,
      isPositiveEv: spreadMain.is_positive_ev,
      homeOdds: spreadMain.home_odds,
      awayOdds: spreadMain.away_odds,
      homeEv: spreadMain.home_ev,
      awayEv: spreadMain.away_ev,
      homeProb: spreadMain.home_odds > 0 ? (1 + spreadMain.home_ev) / spreadMain.home_odds : 0.5,
      awayProb: spreadMain.away_odds > 0 ? (1 + spreadMain.away_ev) / spreadMain.away_odds : 0.5,
    };
  })();

  // 4. 半场盘口数据是否存在 (若没有任何半场盘口数据则不渲染第二行)
  const hasHalfMarkets = Boolean(
    match.markets.half_h2h || match.markets.half_total_main || match.markets.half_spread_main
  );

  // 5. 测算全局最佳推荐下注选项 (Primary Best Bet)
  // 在 6 种玩法中寻找最高 EV 且通过初筛的选项
  const bestBetMarket = (() => {
    if (quant.context.circuit_breaker.is_triggered || quant.confidence_score === 0) {
      return null;
    }

    type Candidate = {
      key: "FULL_SPREAD" | "FULL_TOTAL" | "FULL_H2H" | "HALF_SPREAD" | "HALF_TOTAL" | "HALF_H2H";
      ev: number;
      isPositive: boolean;
      scoreWeight: number;
    };

    const candidates: Candidate[] = [];

    if (fullSpreadEval) {
      candidates.push({
        key: "FULL_SPREAD",
        ev: fullSpreadEval.ev,
        isPositive: fullSpreadEval.isPositiveEv,
        scoreWeight: fullSpreadEval.ev + (fullSpreadEval.isPositiveEv ? 0.05 : 0),
      });
    }

    if (fullTotalEval) {
      candidates.push({
        key: "FULL_TOTAL",
        ev: fullTotalEval.ev,
        isPositive: fullTotalEval.isPositiveEv,
        scoreWeight: fullTotalEval.ev + (fullTotalEval.isPositiveEv ? 0.05 : 0),
      });
    }

    if (fullH2hEval) {
      candidates.push({
        key: "FULL_H2H",
        ev: fullH2hEval.maxEv,
        isPositive: fullH2hEval.isPositiveEv,
        scoreWeight: fullH2hEval.maxEv + (fullH2hEval.isPositiveEv ? 0.03 : 0),
      });
    }

    if (candidates.length === 0) return null;

    // 按得分排序选出最佳
    candidates.sort((a, b) => b.scoreWeight - a.scoreWeight);
    return candidates[0].key;
  })();

  const isLiveMatch = match.timing.stage === MatchStage.LIVE;

  return (
    <div className="bg-slate-950/90 p-3.5 rounded-xl border border-blue-950/80 space-y-3.5 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 顶部紧凑状态栏 (Compact Header Bar)                                        */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 px-3.5 py-2.5 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-xs text-slate-100">
            机器量化评估与下注决策矩阵
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
              decision.level === "WATCH"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                : decision.level === "RESEARCH"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                : "bg-rose-500/20 text-rose-300 border-rose-500/50"
            }`}
          >
            {decision.badge}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px]">
            模型置信度: <strong className="text-emerald-400">{quant.confidence_score}分</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px]">
            阶段: <strong className="text-purple-300">{isLiveMatch ? `${match.timing.minute ?? 0}' 滚球` : "赛前早盘"}</strong>
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2行 x 3项 核心盘口与下注决策网格 (2 Rows x 3 Items Matrix)                  */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        {/* ----------------------------------------------------------------------- */}
        {/* 第一行 (全场 3 项): 全场独赢 | 全场大小球 | 全场让球                        */}
        {/* ----------------------------------------------------------------------- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 1.1 全场独赢 (Full-Time 1X2) */}
          <div
            className={`rounded-xl p-3 flex flex-col justify-between transition-all duration-200 ${
              bestBetMarket === "FULL_H2H"
                ? "bg-gradient-to-b from-emerald-950/70 via-slate-900 to-slate-950 border-2 border-emerald-400/90 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/30"
                : "bg-slate-900/90 border border-slate-800"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5" />
                  全场独赢 (1X2)
                </span>
                {bestBetMarket === "FULL_H2H" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    ⭐ 最佳推荐
                  </span>
                ) : fullH2hEval?.isPositiveEv ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                    +EV 价值
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono">Shin去水</span>
                )}
              </div>

              {fullH2hMarket && h2hMain ? (
                <div className="space-y-2 font-mono text-xs">
                  {/* 3 栏赔率与公允概率 */}
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div
                      className={`p-1.5 rounded border relative flex flex-col justify-between ${
                        fullH2hEval?.bestSide === "home" && fullH2hEval?.isPositiveEv
                          ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                          : "bg-slate-950/80 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div>
                        <div className="text-[10px] text-slate-400 truncate">主胜</div>
                        <div className="text-xs font-bold text-slate-200">@{fullH2hMarket.home_odds}</div>
                        <div className="text-[10px] text-blue-400">
                          {(h2hMain.fair_probabilities[0] * 100).toFixed(1)}%
                        </div>
                      </div>
                      {fullH2hEval?.bestSide === "home" && (
                        <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                          <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                            推荐
                          </span>
                        </div>
                      )}
                    </div>

                    <div
                      className={`p-1.5 rounded border relative flex flex-col justify-between ${
                        fullH2hEval?.bestSide === "draw" && fullH2hEval?.isPositiveEv
                          ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                          : "bg-slate-950/80 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div>
                        <div className="text-[10px] text-slate-400 truncate">平局</div>
                        <div className="text-xs font-bold text-slate-200">@{fullH2hMarket.draw_odds}</div>
                        <div className="text-[10px] text-amber-400">
                          {(h2hMain.fair_probabilities[1] * 100).toFixed(1)}%
                        </div>
                      </div>
                      {fullH2hEval?.bestSide === "draw" && (
                        <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                          <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                            推荐
                          </span>
                        </div>
                      )}
                    </div>

                    <div
                      className={`p-1.5 rounded border relative flex flex-col justify-between ${
                        fullH2hEval?.bestSide === "away" && fullH2hEval?.isPositiveEv
                          ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                          : "bg-slate-950/80 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div>
                        <div className="text-[10px] text-slate-400 truncate">客胜</div>
                        <div className="text-xs font-bold text-slate-200">@{fullH2hMarket.away_odds}</div>
                        <div className="text-[10px] text-purple-400">
                          {(h2hMain.fair_probabilities[2] * 100).toFixed(1)}%
                        </div>
                      </div>
                      {fullH2hEval?.bestSide === "away" && (
                        <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                          <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                            推荐
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-500 font-mono">
                  暂无全场独赢盘口
                </div>
              )}
            </div>

            {/* 底部量化指标 */}
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px]">
              {fullH2hEval ? (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    期望值:
                  </span>
                  <span className="font-mono text-slate-300">
                    EV:{" "}
                    <strong
                      className={
                        fullH2hEval.maxEv > 0 ? "text-emerald-400 font-bold" : "text-slate-400"
                      }
                    >
                      {fullH2hEval.maxEv > 0
                        ? `+${(fullH2hEval.maxEv * 100).toFixed(1)}%`
                        : `${(fullH2hEval.maxEv * 100).toFixed(1)}%`}
                    </strong>
                  </span>
                </div>
              ) : (
                <span className="text-slate-500 text-[10px]">缺省无独赢推荐</span>
              )}
            </div>
          </div>

          {/* 1.2 全场大小球 (Full-Time Over/Under) */}
          <div
            className={`rounded-xl p-3 flex flex-col justify-between transition-all duration-200 ${
              bestBetMarket === "FULL_TOTAL"
                ? "bg-gradient-to-b from-emerald-950/70 via-slate-900 to-slate-950 border-2 border-emerald-400/90 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/30"
                : "bg-slate-900/90 border border-slate-800"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  全场大小球 (O/U)
                </span>
                {bestBetMarket === "FULL_TOTAL" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    ⭐ 最佳推荐
                  </span>
                ) : fullTotalEval?.isPositiveEv ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                    +EV 价值
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {totalMain ? `${totalMain.line}球` : "界线"}
                  </span>
                )}
              </div>

              {fullTotalEval ? (
                <div className="space-y-2 font-mono text-xs">
                  {/* 大球 vs 小球对比 */}
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div
                      className={`p-1.5 rounded border relative flex flex-col justify-between ${
                        fullTotalEval.isOver && fullTotalEval.isPositiveEv
                          ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                          : "bg-slate-950/80 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div>
                        <div className="text-[10px] text-slate-400">大球 ({`>${fullTotalEval.line}`})</div>
                        <div className="text-xs font-bold text-slate-200">@{fullTotalEval.overOdds}</div>
                        <div className="text-[10px] text-slate-400">
                          胜率 {(fullTotalEval.overProb * 100).toFixed(1)}% |{" "}
                          <span className={fullTotalEval.overEv > 0 ? "text-emerald-400 font-bold" : "text-slate-500"}>
                            EV {(fullTotalEval.overEv * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      {fullTotalEval.isOver && (
                        <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                          <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                            推荐
                          </span>
                        </div>
                      )}
                    </div>

                    <div
                      className={`p-1.5 rounded border relative flex flex-col justify-between ${
                        !fullTotalEval.isOver && fullTotalEval.isPositiveEv
                          ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                          : "bg-slate-950/80 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div>
                        <div className="text-[10px] text-slate-400">小球 ({`<${fullTotalEval.line}`})</div>
                        <div className="text-xs font-bold text-slate-200">@{fullTotalEval.underOdds}</div>
                        <div className="text-[10px] text-slate-400">
                          胜率 {(fullTotalEval.underProb * 100).toFixed(1)}% |{" "}
                          <span className={fullTotalEval.underEv > 0 ? "text-emerald-400 font-bold" : "text-slate-500"}>
                            EV {(fullTotalEval.underEv * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      {!fullTotalEval.isOver && (
                        <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                          <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                            推荐
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 flex justify-between px-0.5">
                    <span>剩余期望 λ={quant.poisson.expected_goals_rest.toFixed(2)}球</span>
                    <span>完场推演: {quant.poisson.projected_final_score.most_likely_score}</span>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-500 font-mono">
                  暂无全场大小球盘口
                </div>
              )}
            </div>

            {/* 底部量化指标 */}
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px]">
              {fullTotalEval ? (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    期望值:
                  </span>
                  <span className="font-mono text-slate-300">
                    EV:{" "}
                    <strong
                      className={
                        fullTotalEval.ev > 0 ? "text-emerald-400 font-bold" : "text-slate-400"
                      }
                    >
                      {fullTotalEval.ev > 0
                        ? `+${(fullTotalEval.ev * 100).toFixed(1)}%`
                        : `${(fullTotalEval.ev * 100).toFixed(1)}%`}
                    </strong>
                  </span>
                </div>
              ) : (
                <span className="text-slate-500 text-[10px]">缺省无大小球推荐</span>
              )}
            </div>
          </div>

          {/* 1.3 全场让球 (Full-Time Asian Handicap) */}
          <div
            className={`rounded-xl p-3 flex flex-col justify-between transition-all duration-200 ${
              bestBetMarket === "FULL_SPREAD"
                ? "bg-gradient-to-b from-emerald-950/70 via-slate-900 to-slate-950 border-2 border-emerald-400/90 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/30"
                : "bg-slate-900/90 border border-slate-800"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  全场让球 (Asian Handicap)
                </span>
                {bestBetMarket === "FULL_SPREAD" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    ⭐ 最佳推荐
                  </span>
                ) : fullSpreadEval?.isPositiveEv ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                    +EV 价值
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {spreadMain ? formatAsianLine(Number(spreadMain.line) || 0) : "让球"}
                  </span>
                )}
              </div>

              {fullSpreadEval ? (
                <div className="space-y-2 font-mono text-xs">
                  {/* 主队让球 vs 客队让球对比 (纯净盘口展示，不展示冗余队名) */}
                  {(() => {
                    const spreadNum = Number(spreadMain?.line) || 0;
                    const homeLineLabel =
                      spreadNum > 0
                        ? `主 +${formatAsianLine(spreadNum)}`
                        : spreadNum < 0
                        ? `主 -${formatAsianLine(Math.abs(spreadNum))}`
                        : "主 0";
                    const awayLineLabel =
                      spreadNum > 0
                        ? `客 -${formatAsianLine(spreadNum)}`
                        : spreadNum < 0
                        ? `客 +${formatAsianLine(Math.abs(spreadNum))}`
                        : "客 0";

                    return (
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div
                          className={`p-1.5 rounded border relative flex flex-col justify-between ${
                            fullSpreadEval.isHome && fullSpreadEval.isPositiveEv
                              ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                              : "bg-slate-950/80 border-slate-800 text-slate-300"
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-200">
                              {homeLineLabel}
                            </div>
                            <div className="text-xs font-bold text-slate-200">@{fullSpreadEval.homeOdds}</div>
                            <div className="text-[10px] text-slate-400">
                              胜率 {(fullSpreadEval.homeProb * 100).toFixed(1)}% |{" "}
                              <span className={fullSpreadEval.homeEv > 0 ? "text-emerald-400 font-bold" : "text-slate-500"}>
                                EV {(fullSpreadEval.homeEv * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          {fullSpreadEval.isHome && (
                            <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                                推荐
                              </span>
                            </div>
                          )}
                        </div>

                        <div
                          className={`p-1.5 rounded border relative flex flex-col justify-between ${
                            !fullSpreadEval.isHome && fullSpreadEval.isPositiveEv
                              ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                              : "bg-slate-950/80 border-slate-800 text-slate-300"
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-200">
                              {awayLineLabel}
                            </div>
                            <div className="text-xs font-bold text-slate-200">@{fullSpreadEval.awayOdds}</div>
                            <div className="text-[10px] text-slate-400">
                              胜率 {(fullSpreadEval.awayProb * 100).toFixed(1)}% |{" "}
                              <span className={fullSpreadEval.awayEv > 0 ? "text-emerald-400 font-bold" : "text-slate-500"}>
                                EV {(fullSpreadEval.awayEv * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          {!fullSpreadEval.isHome && (
                            <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                                推荐
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="text-[10px] text-slate-400 flex justify-between px-0.5 truncate" title={fullSpreadEval.riskRule}>
                    <span>盘口: {fullSpreadEval.lineNotation}</span>
                    <span className="truncate max-w-[120px]">{fullSpreadEval.splitText}</span>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-500 font-mono">
                  暂无全场让球盘口
                </div>
              )}
            </div>

            {/* 底部量化指标 */}
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px]">
              {fullSpreadEval ? (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    期望值:
                  </span>
                  <span className="font-mono text-slate-300">
                    EV:{" "}
                    <strong
                      className={
                        fullSpreadEval.ev > 0 ? "text-emerald-400 font-bold" : "text-slate-400"
                      }
                    >
                      {fullSpreadEval.ev > 0
                        ? `+${(fullSpreadEval.ev * 100).toFixed(1)}%`
                        : `${(fullSpreadEval.ev * 100).toFixed(1)}%`}
                    </strong>
                  </span>
                </div>
              ) : (
                <span className="text-slate-500 text-[10px]">缺省无让球推荐</span>
              )}
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* 第二行 (半场 3 项): 半场独赢 | 半场大小球 | 半场让球 (仅在存在半场数据时展示) */}
        {/* ----------------------------------------------------------------------- */}
        {hasHalfMarkets && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-in fade-in duration-200">
            {/* 2.1 半场独赢 (Half-Time 1X2) */}
            <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    半场独赢 (1X2)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">半场挂盘</span>
                </div>

                {match.markets.half_h2h ? (
                  <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-xs">
                    <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">半主胜</div>
                      <div className="text-xs font-bold text-slate-200">
                        @{match.markets.half_h2h.home_odds}
                      </div>
                    </div>
                    <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">半平局</div>
                      <div className="text-xs font-bold text-slate-200">
                        @{match.markets.half_h2h.draw_odds}
                      </div>
                    </div>
                    <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">半客胜</div>
                      <div className="text-xs font-bold text-slate-200">
                        @{match.markets.half_h2h.away_odds}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-500 font-mono">
                    暂无半场独赢盘口
                  </div>
                )}
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
                <span>半场压迫倾向:</span>
                <strong className="text-slate-300">
                  {bdi > 5 ? `${match.home_team_name} 占优` : bdi < -5 ? `${match.away_team_name} 占优` : "半场均势"}
                </strong>
              </div>
            </div>

            {/* 2.2 半场大小球 (Half-Time Over/Under) */}
            <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    半场大小球 (O/U)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {match.markets.half_total_main ? `${match.markets.half_total_main.line}球` : "半场界线"}
                  </span>
                </div>

                {match.markets.half_total_main ? (
                  <div className="space-y-2 font-mono text-xs">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                        <div className="text-[10px] text-slate-400">
                          半场大球 ({`>${match.markets.half_total_main.line}`})
                        </div>
                        <div className="text-xs font-bold text-emerald-300">
                          @{match.markets.half_total_main.over_odds}
                        </div>
                      </div>
                      <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                        <div className="text-[10px] text-slate-400">
                          半场小球 ({`<${match.markets.half_total_main.line}`})
                        </div>
                        <div className="text-xs font-bold text-slate-300">
                          @{match.markets.half_total_main.under_odds}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-500 font-mono">
                    暂无半场大小球盘口
                  </div>
                )}
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
                <span>半场破门概率:</span>
                <strong className="text-emerald-400">
                  {quant.poisson.expected_goals_rest > 1.0 ? "偏高" : "胶着"}
                </strong>
              </div>
            </div>

            {/* 2.3 半场让球 (Half-Time Asian Handicap) */}
            <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    半场让球 (Asian Handicap)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {match.markets.half_spread_main ? match.markets.half_spread_main.home_selection : "半场让球"}
                  </span>
                </div>

                {match.markets.half_spread_main ? (
                  <div className="space-y-2 font-mono text-xs">
                    {(() => {
                      const rawHome = match.markets.half_spread_main.home_selection || "半主 0";
                      const rawAway = match.markets.half_spread_main.away_selection || "半客 0";
                      const halfHomeLineLabel = rawHome.startsWith("半") ? rawHome : `半${rawHome}`;
                      const halfAwayLineLabel = rawAway.startsWith("半") ? rawAway : `半${rawAway}`;

                      return (
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                            <div className="text-xs font-bold text-indigo-300">
                              {halfHomeLineLabel}
                            </div>
                            <div className="text-xs font-bold text-indigo-300">
                              @{match.markets.half_spread_main.home_odds}
                            </div>
                          </div>
                          <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
                            <div className="text-xs font-bold text-slate-300">
                              {halfAwayLineLabel}
                            </div>
                            <div className="text-xs font-bold text-slate-300">
                              @{match.markets.half_spread_main.away_odds}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-500 font-mono">
                    暂无半场让球盘口
                  </div>
                )}
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
                <span>半场挂盘选择:</span>
                <strong className="text-indigo-300">
                  {match.markets.half_spread_main?.home_selection ?? "-"}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>

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

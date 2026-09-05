import React from "react";
import {
  Target,
  Percent,
  TrendingUp,
  Activity,
  Clock,
  Sparkles,
} from "lucide-react";
import { CanonicalMatch, MatchStage } from "../../refactor/02_canonical_model";
import {
  QuantitativeFeatures,
} from "../../refactor/03_quant_engine/types";
import { formatAsianLine } from "../lib/quarterSettlement";

export interface QuantBettingDecisionMatrixProps {
  match: CanonicalMatch;
  quant: QuantitativeFeatures;
  showHeader?: boolean;
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
export function formatSpreadSideInfo(
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

export const QuantBettingDecisionMatrix: React.FC<QuantBettingDecisionMatrixProps> = ({
  match,
  quant,
  showHeader = true,
}) => {
  const decision = getQuantScreeningDecision(quant);

  // 格式化 BDI 显示
  const bdi = quant.battlefield_dominance_index;

  // 核心盘口与量化特征
  const spreadMain = quant.devig.spread_main_ev;
  const totalMain = quant.devig.total_main_ev;
  const h2hMain = quant.devig.h2h_devig;
  const fullH2hMarket = match.markets.full_h2h;

  // 1. 全场独赢 EV 计算 (直接消费 Layer 03 底层纯数学结算结果)
  const fullH2hEval = (() => {
    if (!fullH2hMarket || !h2hMain) return null;
    const modelProbs = h2hMain.model_probabilities ?? h2hMain.fair_probabilities;
    const homeEv = h2hMain.home_ev ?? (fullH2hMarket.home_odds * modelProbs[0] - 1);
    const drawEv = h2hMain.draw_ev ?? (fullH2hMarket.draw_odds * modelProbs[1] - 1);
    const awayEv = h2hMain.away_ev ?? (fullH2hMarket.away_odds * modelProbs[2] - 1);

    const bestSide: "home" | "draw" | "away" = (h2hMain.preferred_side && h2hMain.preferred_side !== "none")
      ? h2hMain.preferred_side
      : (homeEv >= drawEv && homeEv >= awayEv ? "home" : drawEv >= awayEv ? "draw" : "away");

    const maxEv = bestSide === "home" ? homeEv : bestSide === "draw" ? drawEv : awayEv;

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
        ? modelProbs[0]
        : bestSide === "away"
        ? modelProbs[2]
        : modelProbs[1];

    return {
      homeEv,
      drawEv,
      awayEv,
      bestSide,
      sideName,
      bestOdds,
      bestProb,
      maxEv,
      isPositiveEv: h2hMain.is_positive_ev ?? (maxEv >= 0.035),
      modelProbs,
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
    const candidateMarkets = new Set(
      quant.positive_ev_signals.map((signal) => signal.market),
    );

    if (fullSpreadEval && candidateMarkets.has("ASIAN_HANDICAP_MAIN")) {
      candidates.push({
        key: "FULL_SPREAD",
        ev: fullSpreadEval.ev,
        isPositive: fullSpreadEval.isPositiveEv,
        scoreWeight: fullSpreadEval.ev + (fullSpreadEval.isPositiveEv ? 0.05 : 0),
      });
    }

    if (fullTotalEval && candidateMarkets.has("TOTAL_GOALS_MAIN")) {
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

    const positiveCandidates = candidates.filter((c) => c.isPositive && c.ev > 0);
    if (positiveCandidates.length === 0) return null;

    positiveCandidates.sort((a, b) => b.scoreWeight - a.scoreWeight);
    return positiveCandidates[0].key;
  })();

  const isLiveMatch = match.timing.stage === MatchStage.LIVE;

  return (
    <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800/80 space-y-3">
      {/* ========================================================================= */}
      {/* 顶部紧凑状态栏 (Compact Header Bar)                                        */}
      {/* ========================================================================= */}
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800">
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
              置信度: <strong className="text-emerald-400">{quant.confidence_score}分</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px]">
              阶段: <strong className="text-purple-300">{isLiveMatch ? `${match.timing.minute ?? 0}' 滚球` : "赛前早盘"}</strong>
            </span>
          </div>
        </div>
      )}

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
                          {((fullH2hEval?.modelProbs?.[0] ?? h2hMain.fair_probabilities[0]) * 100).toFixed(1)}%
                        </div>
                      </div>
                      {fullH2hEval?.bestSide === "home" && fullH2hEval?.isPositiveEv && (
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
                          {((fullH2hEval?.modelProbs?.[1] ?? h2hMain.fair_probabilities[1]) * 100).toFixed(1)}%
                        </div>
                      </div>
                      {fullH2hEval?.bestSide === "draw" && fullH2hEval?.isPositiveEv && (
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
                          {((fullH2hEval?.modelProbs?.[2] ?? h2hMain.fair_probabilities[2]) * 100).toFixed(1)}%
                        </div>
                      </div>
                      {fullH2hEval?.bestSide === "away" && fullH2hEval?.isPositiveEv && (
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
                  <span className="text-slate-400">期望值:</span>
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
                      {fullTotalEval.isOver && fullTotalEval.isPositiveEv && (
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
                      {!fullTotalEval.isOver && fullTotalEval.isPositiveEv && (
                        <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                          <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                            推荐
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 space-y-1 px-0.5">
                    <div className="flex justify-between">
                      <span>剩余期望 λ={quant.poisson?.expected_goals_rest != null ? quant.poisson.expected_goals_rest.toFixed(2) : "0.00"}球</span>
                      <span>最可能: <strong className="text-purple-300 font-mono">{quant.poisson?.projected_final_score?.most_likely_score ?? "-"}</strong></span>
                    </div>
                    {quant.poisson.top_final_scores && quant.poisson.top_final_scores.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap text-[9.5px] text-slate-400">
                        <span className="text-slate-500">概率分布:</span>
                        {quant.poisson.top_final_scores.slice(0, 3).map((item, idx) => (
                          <span key={idx} className="px-1 py-0.2 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono">
                            {item.home}-{item.away} <span className="text-emerald-400 font-bold">{item.percentage_str}</span>
                          </span>
                        ))}
                      </div>
                    )}
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
                  <span className="text-slate-400">期望值:</span>
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
                          {fullSpreadEval.isHome && fullSpreadEval.isPositiveEv && (
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
                          {!fullSpreadEval.isHome && fullSpreadEval.isPositiveEv && (
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
                  <span className="text-slate-400">期望值:</span>
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
    </div>
  );
};

import React, { useState, useMemo, useEffect } from "react";
import {
  Target,
  Percent,
  TrendingUp,
  Activity,
  Clock,
  Sparkles,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { CanonicalMatch, MatchStage } from "../../refactor/02_canonical_model";
import {
  QuantitativeFeatures,
  TotalEVAssessment,
  SpreadEVAssessment,
} from "../../refactor/03_quant_engine/types";
import {
  parseAsianHandicapLine,
  formatAsianHandicapLine,
} from "../../refactor/03_quant_engine/devigCalculator";
import { formatAsianLine } from "../lib/quarterSettlement";

export interface QuantBettingDecisionMatrixProps {
  match: CanonicalMatch;
  quant: QuantitativeFeatures;
  aiEval?: any;
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
  const numLine = parseAsianHandicapLine(lineStr);
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
  aiEval,
  showHeader = true,
}) => {
  const decision = getQuantScreeningDecision(quant);

  // -------------------------------------------------------------------------
  // Layer 04: AI 裁决与终审信号穿透解析 (AI Direct Market Overlay)
  // -------------------------------------------------------------------------
  const aiInsight = useMemo(() => {
    if (!aiEval) return null;
    const grade = String(aiEval.grade || aiEval.grade_raw || '').toUpperCase();
    const isQual = (grade.startsWith('A') || grade.startsWith('B')) && !grade.startsWith('WATCH');
    const isWatch = grade.startsWith('WATCH') || grade.includes('WATCH');
    const conf = aiEval.confidence_score ?? null;
    const trap = aiEval.blind_spot_analysis?.trap_detection_result || aiEval.trap_detection_result;
    const regime = aiEval.blind_spot_analysis?.tactical_regime_evaluation || aiEval.tactical_regime_evaluation;

    // 提取推荐腿
    const legs: any[] = Array.isArray(aiEval.recommended_legs) ? aiEval.recommended_legs : [];

    // 提取盘口扫描与排除清单
    const scan = aiEval.market_scan || null;
    const rawExclusions: string[] = Array.isArray(scan?.exclusion_reasons)
      ? scan.exclusion_reasons
      : Array.isArray(aiEval.exclusion_reasons)
      ? aiEval.exclusion_reasons
      : [];

    const isGlobalTrapOrGated = Boolean(
      trap === 'CONFIRMED_TRAP' ||
      String(aiEval.blind_spot_analysis?.actionable_gate || '').includes('GATED') ||
      String(aiEval.actionable_gate || '').includes('GATED')
    );

    // 1. 让球盘 (Full Spread)
    const spreadLeg = legs.find((l) => {
      const mStr = String(l.market || '').toUpperCase();
      return (mStr.includes('SPREAD') || mStr.includes('HANDICAP') || mStr.includes('让球') || mStr.includes('AH')) && !mStr.includes('HALF') && !mStr.includes('半场');
    });

    const spreadExclusion = rawExclusions.find(r => r.includes('让球') || r.includes('盘口') || r.includes('AH') || r.includes('让') || r.includes('-') || r.includes('+'));
    const isSpreadBlocked = Boolean(
      !spreadLeg && (
        scan?.ah_actionable === false ||
        spreadExclusion ||
        isGlobalTrapOrGated ||
        isWatch ||
        (scan && (scan.actionable === false || scan.market_status === 'VALID_BUT_BLOCKED' || scan.market_status === 'INVALID_STRUCTURE'))
      )
    );

    let spreadInsight: {
      status: 'RECOMMENDED' | 'BLOCKED' | 'NONE';
      direction?: 'home' | 'away';
      line?: string;
      odds?: number;
      label?: string;
      reason?: string;
    } = { status: 'NONE' };

    if (spreadLeg) {
      const dirStr = String(spreadLeg.direction || '').toUpperCase();
      const isHome = dirStr.includes('HOME') || dirStr.includes('主') || (match.home_team_name && dirStr.includes(match.home_team_name));
      spreadInsight = {
        status: 'RECOMMENDED',
        direction: isHome ? 'home' : 'away',
        line: spreadLeg.line || spreadLeg.selected_line,
        odds: spreadLeg.odds || spreadLeg.current_odds,
        label: spreadLeg.direction || (isHome ? '主队' : '客队'),
        reason: spreadLeg.reason || 'AI 终审推荐投注',
      };
    } else if (isSpreadBlocked) {
      spreadInsight = {
        status: 'BLOCKED',
        label: match.home_team_name ? '主/客盘口' : '让球盘',
        reason: spreadExclusion || (trap === 'CONFIRMED_TRAP' ? '机构高水诱盘陷阱阻断' : 'AI风控门禁未达开仓标准'),
      };
    }

    // 2. 大小球盘 (Full Total)
    const totalLeg = legs.find((l) => {
      const mStr = String(l.market || '').toUpperCase();
      return (mStr.includes('TOTAL') || mStr.includes('OVER_UNDER') || mStr.includes('大小') || mStr.includes('OU')) && !mStr.includes('HALF') && !mStr.includes('半场');
    });

    const totalExclusion = rawExclusions.find(r => r.includes('大小') || r.includes('进球') || r.includes('OU') || r.includes('大球') || r.includes('小球'));
    const isTotalBlocked = Boolean(
      !totalLeg && (
        scan?.ou_actionable === false ||
        totalExclusion ||
        isGlobalTrapOrGated ||
        isWatch ||
        (scan && (scan.actionable === false || scan.market_status === 'VALID_BUT_BLOCKED' || scan.market_status === 'INVALID_STRUCTURE'))
      )
    );

    let totalInsight: {
      status: 'RECOMMENDED' | 'BLOCKED' | 'NONE';
      direction?: 'over' | 'under';
      line?: string;
      odds?: number;
      label?: string;
      reason?: string;
    } = { status: 'NONE' };

    if (totalLeg) {
      const dirStr = String(totalLeg.direction || '').toUpperCase();
      const isOver = dirStr.includes('OVER') || dirStr.includes('大');
      totalInsight = {
        status: 'RECOMMENDED',
        direction: isOver ? 'over' : 'under',
        line: totalLeg.line || totalLeg.selected_line,
        odds: totalLeg.odds || totalLeg.current_odds,
        label: isOver ? '大球' : '小球',
        reason: totalLeg.reason || 'AI 终审推荐投注',
      };
    } else if (isTotalBlocked) {
      totalInsight = {
        status: 'BLOCKED',
        label: '大小球盘',
        reason: totalExclusion || (trap === 'CONFIRMED_TRAP' ? '机构诱盘阻断/防守反击锁死' : '进球期望未达安全边际'),
      };
    }

    // 3. 独赢盘 (1X2 / H2H)
    const h2hLeg = legs.find((l) => {
      const mStr = String(l.market || '').toUpperCase();
      return (mStr.includes('1X2') || mStr.includes('H2H') || mStr.includes('MONEYLINE') || mStr.includes('独赢') || mStr.includes('胜平负')) && !mStr.includes('HALF') && !mStr.includes('半场');
    });

    const h2hExclusion = rawExclusions.find(r => r.includes('独赢') || r.includes('1X2') || r.includes('主胜') || r.includes('客胜') || r.includes('平局') || r.includes('缓冲'));
    const isH2hBlocked = Boolean(
      !h2hLeg && (
        scan?.h2h_actionable === false ||
        h2hExclusion ||
        isGlobalTrapOrGated ||
        isWatch ||
        (scan && (scan.actionable === false || scan.market_status === 'VALID_BUT_BLOCKED' || scan.market_status === 'INVALID_STRUCTURE'))
      )
    );

    let h2hInsight: {
      status: 'RECOMMENDED' | 'BLOCKED' | 'NONE';
      direction?: 'home' | 'draw' | 'away';
      odds?: number;
      label?: string;
      reason?: string;
    } = { status: 'NONE' };

    if (h2hLeg) {
      const dirStr = String(h2hLeg.direction || '').toUpperCase();
      const isHome = dirStr.includes('HOME') || dirStr.includes('主');
      const isDraw = dirStr.includes('DRAW') || dirStr.includes('平');
      h2hInsight = {
        status: 'RECOMMENDED',
        direction: isHome ? 'home' : isDraw ? 'draw' : 'away',
        odds: h2hLeg.odds || h2hLeg.current_odds,
        label: isHome ? '主胜' : isDraw ? '平局' : '客胜',
        reason: h2hLeg.reason || 'AI 终审推荐投注',
      };
    } else if (isH2hBlocked) {
      h2hInsight = {
        status: 'BLOCKED',
        label: '独赢盘 (1X2)',
        reason: h2hExclusion || '缺乏穿盘防守缓冲，价值不足',
      };
    }

    return {
      grade,
      conf,
      isQual,
      isWatch,
      trap,
      regime,
      hasActionableLegs: legs.length > 0,
      legsCount: legs.length,
      spreadInsight,
      totalInsight,
      h2hInsight,
      scan,
      qualitativeSummary: aiEval.qualitative_summary || aiEval.analysis,
    };
  }, [aiEval, match.home_team_name, match.away_team_name]);

  // 格式化 BDI 显示
  const bdi = quant.battlefield_dominance_index;

  // 核心盘口与量化特征
  const spreadMain = quant.devig.spread_main_ev;
  const totalMain = quant.devig.total_main_ev;
  const h2hMain = quant.devig.h2h_devig;
  const fullH2hMarket = match.markets.full_h2h;

  // 100% SSOT 信号门禁：严格消费 Layer 03 经由 OOS 校验与置信度门禁下发的 positive_ev_signals
  // 彻底废除前端基于 ev >= 0.035 或 is_positive_ev 的局部双轨制自决
  const h2hSignal = useMemo(() => {
    return quant.positive_ev_signals.find((s) => s.market === "MONEYLINE_1X2") ?? null;
  }, [quant.positive_ev_signals]);

  const totalSignals = useMemo(() => {
    return quant.positive_ev_signals.filter(
      (s) => s.market === "TOTAL_GOALS_MAIN" || s.market === "TOTAL_GOALS_SECONDARY"
    );
  }, [quant.positive_ev_signals]);

  const bestTotalSignal = useMemo(() => {
    if (totalSignals.length === 0) return null;
    return totalSignals.reduce((best, s) => (s.ev > best.ev ? s : best), totalSignals[0]);
  }, [totalSignals]);

  const spreadSignals = useMemo(() => {
    return quant.positive_ev_signals.filter(
      (s) => s.market === "ASIAN_HANDICAP_MAIN" || s.market === "ASIAN_HANDICAP_SECONDARY"
    );
  }, [quant.positive_ev_signals]);

  const bestSpreadSignal = useMemo(() => {
    if (spreadSignals.length === 0) return null;
    return spreadSignals.reduce((best, s) => (s.ev > best.ev ? s : best), spreadSignals[0]);
  }, [spreadSignals]);

  // 1. 全场独赢 EV 计算 (直接消费 Layer 03 底层纯数学结算结果)
  const fullH2hEval = (() => {
    if (!fullH2hMarket || !h2hMain) return null;
    const modelProbs = h2hMain.model_probabilities ?? h2hMain.fair_probabilities;
    const homeEv = h2hMain.home_ev ?? (fullH2hMarket.home_odds * modelProbs[0] - 1);
    const drawEv = h2hMain.draw_ev ?? (fullH2hMarket.draw_odds * modelProbs[1] - 1);
    const awayEv = h2hMain.away_ev ?? (fullH2hMarket.away_odds * modelProbs[2] - 1);

    // 推荐方向优先匹配 h2hSignal；若无推荐信号，则按数学最大 EV 显示对比项
    const bestSide: "home" | "draw" | "away" = h2hSignal
      ? (h2hSignal.side as "home" | "draw" | "away")
      : (h2hMain.preferred_side && h2hMain.preferred_side !== "none")
      ? h2hMain.preferred_side
      : (homeEv >= drawEv && homeEv >= awayEv ? "home" : drawEv >= awayEv ? "draw" : "away");

    const maxEv = bestSide === "home" ? homeEv : bestSide === "draw" ? drawEv : awayEv;

    // 严禁双轨制：只有在 h2hSignal 真实存在时，才认定为具有推荐资格的 +EV 候选
    const isMachineCandidate = Boolean(h2hSignal);
    const isPositiveEv = isMachineCandidate;

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
      isPositiveEv,
      isMachineCandidate,
      modelProbs,
      isHomeRecommended: Boolean(h2hSignal && h2hSignal.side === "home"),
      isDrawRecommended: Boolean(h2hSignal && h2hSignal.side === "draw"),
      isAwayRecommended: Boolean(h2hSignal && h2hSignal.side === "away"),
    };
  })();

  // 汇总所有大小球盘口 (主盘 + 全部副盘)
  const allTotalOptions = useMemo(() => {
    const list: { assessment: TotalEVAssessment; isMain: boolean }[] = [];
    if (quant.devig.total_main_ev) {
      list.push({ assessment: quant.devig.total_main_ev, isMain: true });
    }
    if (quant.devig.total_secondary_ev && Array.isArray(quant.devig.total_secondary_ev)) {
      for (const sub of quant.devig.total_secondary_ev) {
        if (sub && !list.some((x) => x.assessment.line === sub.line)) {
          list.push({ assessment: sub, isMain: false });
        }
      }
    }
    return list;
  }, [quant.devig.total_main_ev, quant.devig.total_secondary_ev]);

  // 计算大小球全局综合最优选项 (跨主盘 + 全部副盘综合推演，不受切线切换影响)
  const globalBestTotal = useMemo(() => {
    if (allTotalOptions.length === 0) return null;

    // 若存在官方推荐信号，以最高 EV 的官方推荐信号为基准呈现
    if (bestTotalSignal) {
      const isMain = bestTotalSignal.market === "TOTAL_GOALS_MAIN";
      const isOver = bestTotalSignal.side === "over";
      return {
        line: bestTotalSignal.line,
        isMain,
        side: bestTotalSignal.side as "over" | "under",
        label: isOver ? `大球 (>${bestTotalSignal.line})` : `小球 (<${bestTotalSignal.line})`,
        odds: bestTotalSignal.odds,
        ev: bestTotalSignal.ev,
        prob: bestTotalSignal.model_probability ?? 0.5,
        isMachineCandidate: true,
      };
    }

    // 若无官方推荐信号，寻找数学最高 EV 项供客观分析
    let bestOpt = allTotalOptions[0];
    let bestSide: "over" | "under" = bestOpt.assessment.over_ev >= bestOpt.assessment.under_ev ? "over" : "under";
    let maxEv = bestSide === "over" ? bestOpt.assessment.over_ev : bestOpt.assessment.under_ev;

    for (const opt of allTotalOptions) {
      if (opt.assessment.over_ev > maxEv) {
        maxEv = opt.assessment.over_ev;
        bestOpt = opt;
        bestSide = "over";
      }
      if (opt.assessment.under_ev > maxEv) {
        maxEv = opt.assessment.under_ev;
        bestOpt = opt;
        bestSide = "under";
      }
    }

    const isOver = bestSide === "over";
    const odds = isOver ? bestOpt.assessment.over_odds : bestOpt.assessment.under_odds;
    const prob = isOver
      ? (bestOpt.assessment.over_model_probability ?? 0.5)
      : (bestOpt.assessment.under_model_probability ?? 0.5);

    return {
      line: bestOpt.assessment.line,
      isMain: bestOpt.isMain,
      side: bestSide,
      label: isOver ? `大球 (>${bestOpt.assessment.line})` : `小球 (<${bestOpt.assessment.line})`,
      odds,
      ev: maxEv,
      prob,
      isMachineCandidate: false,
    };
  }, [allTotalOptions, bestTotalSignal]);

  // 计算大小球最优盘口项 (用于盘口切线高亮与择优)
  const bestTotalOption = useMemo(() => {
    if (!globalBestTotal) return null;
    return allTotalOptions.find((o) => o.assessment.line === globalBestTotal.line) ?? null;
  }, [allTotalOptions, globalBestTotal]);

  // 全盘口平等竞优：优先选择官方门禁推荐信号 (bestTotalSignal) 所在切线；
  // 若无门禁信号，则默认直接聚焦于全盘数学 EV 最高的切线 (bestTotalOption)；最后保底为主盘
  const defaultOptimalTotalOption = useMemo(() => {
    if (bestTotalSignal) {
      const sigMatched = allTotalOptions.find((o) => o.assessment.line === bestTotalSignal.line);
      if (sigMatched) return sigMatched;
    }
    return bestTotalOption ?? (allTotalOptions.find((o) => o.isMain) ?? allTotalOptions[0] ?? null);
  }, [bestTotalSignal, allTotalOptions, bestTotalOption]);

  const [selectedTotalLine, setSelectedTotalLine] = useState<string | null>(null);
  const activeTotalOption =
    (selectedTotalLine ? allTotalOptions.find((o) => o.assessment.line === selectedTotalLine) : null) ??
    defaultOptimalTotalOption;

  // 2. 全场大小球 EV 计算 (消费当前选中的盘口)
  const fullTotalEval = useMemo(() => {
    if (!activeTotalOption) return null;
    const totalItem = activeTotalOption.assessment;
    const isOver = totalItem.preferred_side === "over";
    const odds = isOver ? totalItem.over_odds : totalItem.under_odds;
    const ev = isOver ? totalItem.over_ev : totalItem.under_ev;
    // 严格遵从 SSOT：胜率 100% 消费 Layer 03 泊松大小球模型概率，彻底杜绝前端私自倒算
    const overProb = totalItem.over_model_probability ?? 0.5;
    const underProb = totalItem.under_model_probability ?? 0.5;
    const prob = isOver ? overProb : underProb;

    // 匹配当前正在查看盘口行上是否存在官方推荐信号
    const isOverRecommended = totalSignals.some(
      (s) => s.line === totalItem.line && s.side === "over"
    );
    const isUnderRecommended = totalSignals.some(
      (s) => s.line === totalItem.line && s.side === "under"
    );

    return {
      line: totalItem.line,
      isMain: activeTotalOption.isMain,
      isBest: bestTotalOption?.assessment.line === totalItem.line,
      isOver,
      sideName: isOver ? `大球 (> ${totalItem.line})` : `小球 (< ${totalItem.line})`,
      odds,
      ev,
      prob,
      isPositiveEv: isOverRecommended || isUnderRecommended,
      isOverRecommended,
      isUnderRecommended,
      overOdds: totalItem.over_odds,
      underOdds: totalItem.under_odds,
      overEv: totalItem.over_ev,
      underEv: totalItem.under_ev,
      overProb,
      underProb,
    };
  }, [activeTotalOption, bestTotalOption, totalSignals]);

  // 汇总所有让球盘口 (主盘 + 全部副盘)
  const allSpreadOptions = useMemo(() => {
    const list: { assessment: SpreadEVAssessment; isMain: boolean }[] = [];
    if (quant.devig.spread_main_ev) {
      list.push({ assessment: quant.devig.spread_main_ev, isMain: true });
    }
    if (quant.devig.spread_secondary_ev && Array.isArray(quant.devig.spread_secondary_ev)) {
      for (const sub of quant.devig.spread_secondary_ev) {
        if (sub && !list.some((x) => x.assessment.line === sub.line)) {
          list.push({ assessment: sub, isMain: false });
        }
      }
    }
    return list;
  }, [quant.devig.spread_main_ev, quant.devig.spread_secondary_ev]);

  // 计算让球全局综合最优选项 (跨主盘 + 全部副盘综合推演，不受切线切换影响)
  const globalBestSpread = useMemo(() => {
    if (allSpreadOptions.length === 0) return null;

    // 若存在官方让球推荐信号，以最高 EV 的官方推荐信号为基准呈现
    if (bestSpreadSignal) {
      const isMain = bestSpreadSignal.market === "ASIAN_HANDICAP_MAIN";
      const isHome = bestSpreadSignal.side === "home";
      const signalLineNum = parseAsianHandicapLine(bestSpreadSignal.line);
      const lineNotation = formatAsianHandicapLine(signalLineNum);
      return {
        line: bestSpreadSignal.line,
        isMain,
        side: bestSpreadSignal.side as "home" | "away",
        isHome,
        sideTeamName: isHome ? match.home_team_name : match.away_team_name,
        lineNotation,
        odds: bestSpreadSignal.odds,
        ev: bestSpreadSignal.ev,
        prob: bestSpreadSignal.model_probability ?? 0.5,
        isMachineCandidate: true,
      };
    }

    // 若无官方推荐信号，寻找数学最高 EV 项供客观分析
    let bestOpt = allSpreadOptions[0];
    let bestSide: "home" | "away" = bestOpt.assessment.home_ev >= bestOpt.assessment.away_ev ? "home" : "away";
    let maxEv = bestSide === "home" ? bestOpt.assessment.home_ev : bestOpt.assessment.away_ev;

    for (const opt of allSpreadOptions) {
      if (opt.assessment.home_ev > maxEv) {
        maxEv = opt.assessment.home_ev;
        bestOpt = opt;
        bestSide = "home";
      }
      if (opt.assessment.away_ev > maxEv) {
        maxEv = opt.assessment.away_ev;
        bestOpt = opt;
        bestSide = "away";
      }
    }

    const isHome = bestSide === "home";
    const odds = isHome ? bestOpt.assessment.home_odds : bestOpt.assessment.away_odds;
    const prob = isHome
      ? (bestOpt.assessment.home_model_probability ?? 0.5)
      : (bestOpt.assessment.away_model_probability ?? 0.5);

    const spreadInfo = formatSpreadSideInfo(
      bestOpt.assessment.line,
      bestSide,
      match.home_team_name,
      match.away_team_name
    );

    return {
      line: bestOpt.assessment.line,
      isMain: bestOpt.isMain,
      side: bestSide,
      isHome,
      sideTeamName: spreadInfo.sideTeamName,
      lineNotation: spreadInfo.lineNotation,
      odds,
      ev: maxEv,
      prob,
      isMachineCandidate: false,
    };
  }, [allSpreadOptions, bestSpreadSignal, match.home_team_name, match.away_team_name]);

  // 计算让球最优盘口项 (用于盘口切线高亮与择优)
  const bestSpreadOption = useMemo(() => {
    if (!globalBestSpread) return null;
    const targetLine = parseAsianHandicapLine(globalBestSpread.line);
    return (
      allSpreadOptions.find((o) => {
        const oLine = parseAsianHandicapLine(o.assessment.line);
        return (
          o.assessment.line === globalBestSpread.line ||
          Math.abs(oLine - targetLine) < 0.001 ||
          Math.abs(oLine - (-targetLine)) < 0.001
        );
      }) ?? null
    );
  }, [allSpreadOptions, globalBestSpread]);

  // 全盘口平等竞优：优先选择官方门禁推荐信号 (bestSpreadSignal) 所在切线；
  // 若无门禁信号，则默认直接聚焦于全盘数学 EV 最高的切线 (bestSpreadOption)；最后保底为主盘
  const defaultOptimalSpreadOption = useMemo(() => {
    if (bestSpreadSignal) {
      const targetLine = parseAsianHandicapLine(bestSpreadSignal.line);
      const sigMatched = allSpreadOptions.find((o) => {
        const oLine = parseAsianHandicapLine(o.assessment.line);
        return (
          o.assessment.line === bestSpreadSignal.line ||
          Math.abs(oLine - targetLine) < 0.001 ||
          Math.abs(oLine - (-targetLine)) < 0.001
        );
      });
      if (sigMatched) return sigMatched;
    }
    return bestSpreadOption ?? (allSpreadOptions.find((o) => o.isMain) ?? allSpreadOptions[0] ?? null);
  }, [bestSpreadSignal, allSpreadOptions, bestSpreadOption]);

  const [selectedSpreadLine, setSelectedSpreadLine] = useState<string | null>(null);
  const activeSpreadOption =
    (selectedSpreadLine ? allSpreadOptions.find((o) => o.assessment.line === selectedSpreadLine) : null) ??
    defaultOptimalSpreadOption;

  // 当比赛变更时，重置用户手动切线状态，自动聚焦于当前比赛的最优出票切线
  useEffect(() => {
    setSelectedTotalLine(null);
    setSelectedSpreadLine(null);
  }, [match.canonical_id]);

  // 3. 全场让球 EV 计算 (消费当前选中的盘口)
  const fullSpreadEval = useMemo(() => {
    if (!activeSpreadOption) return null;
    const spreadItem = activeSpreadOption.assessment;
    const isHome = spreadItem.preferred_side === "home";
    const odds = isHome ? spreadItem.home_odds : spreadItem.away_odds;
    const ev = isHome ? spreadItem.home_ev : spreadItem.away_ev;
    // 严格遵从 SSOT：胜率 100% 消费 Layer 03 泊松四分之一盘模型概率，彻底杜绝前端私自倒算
    const homeProb = spreadItem.home_model_probability ?? 0.5;
    const awayProb = spreadItem.away_model_probability ?? 0.5;
    const prob = isHome ? homeProb : awayProb;

    const spreadInfo = formatSpreadSideInfo(
      spreadItem.line,
      spreadItem.preferred_side,
      match.home_team_name,
      match.away_team_name
    );

    const optLineNum = parseAsianHandicapLine(spreadItem.line);
    const isHomeRecommended = spreadSignals.some((s) => {
      if (s.side !== "home") return false;
      const sLineNum = parseAsianHandicapLine(s.line);
      return s.line === spreadItem.line || Math.abs(sLineNum - optLineNum) < 0.001;
    });

    const isAwayRecommended = spreadSignals.some((s) => {
      if (s.side !== "away") return false;
      const sLineNum = parseAsianHandicapLine(s.line);
      return (
        s.line === spreadItem.line ||
        Math.abs(sLineNum - (-optLineNum)) < 0.001 ||
        Math.abs(sLineNum - optLineNum) < 0.001
      );
    });

    return {
      line: spreadItem.line,
      isMain: activeSpreadOption.isMain,
      isBest: bestSpreadOption?.assessment.line === spreadItem.line,
      isHome,
      sideTeamName: spreadInfo.sideTeamName,
      lineNotation: spreadInfo.lineNotation,
      handicapDesc: spreadInfo.handicapDesc,
      splitText: spreadInfo.splitText,
      riskRule: spreadInfo.riskSettlementRule,
      odds,
      ev,
      prob,
      isPositiveEv: isHomeRecommended || isAwayRecommended,
      isHomeRecommended,
      isAwayRecommended,
      homeOdds: spreadItem.home_odds,
      awayOdds: spreadItem.away_odds,
      homeEv: spreadItem.home_ev,
      awayEv: spreadItem.away_ev,
      homeProb,
      awayProb,
    };
  }, [activeSpreadOption, bestSpreadOption, spreadSignals, match.home_team_name, match.away_team_name]);

  // 4. 半场盘口数据是否存在 (若没有任何半场盘口数据则不渲染第二行)
  const hasHalfMarkets = Boolean(
    match.markets.half_h2h || match.markets.half_total_main || match.markets.half_spread_main
  );

  // 5. 测算全局最佳推荐下注选项 (Primary Best Bet)
  const bestBetMarket = useMemo(() => {
    if (quant.context.circuit_breaker.is_triggered || quant.confidence_score === 0) {
      return null;
    }

    // 严禁双轨制与两张皮：当存在 AI 终审时，AI 具有最高裁决权！
    if (aiInsight) {
      // 若 AI 终审判定为诱盘 (CONFIRMED_TRAP)、门禁阻断、或未批准任何推荐腿，则全局严禁产生任何“最佳推荐”！
      if (!aiInsight.hasActionableLegs || aiInsight.trap === "CONFIRMED_TRAP" || !aiInsight.isQual) {
        return null;
      }
      // AI 终审明确推荐了对应盘口，则优先高亮 AI 推荐项
      if (aiInsight.spreadInsight.status === "RECOMMENDED") return "FULL_SPREAD";
      if (aiInsight.totalInsight.status === "RECOMMENDED") return "FULL_TOTAL";
      if (aiInsight.h2hInsight.status === "RECOMMENDED") return "FULL_H2H";
      return null;
    }

    type Candidate = {
      key: "FULL_SPREAD" | "FULL_TOTAL" | "FULL_H2H";
      ev: number;
      scoreWeight: number;
    };

    const candidates: Candidate[] = [];

    // 严禁双轨制：只有在 quant.positive_ev_signals 中真实存在合法推荐信号时，才允许进入候选池
    if (bestSpreadSignal) {
      candidates.push({
        key: "FULL_SPREAD",
        ev: bestSpreadSignal.ev,
        scoreWeight: bestSpreadSignal.ev + 0.05,
      });
    }

    if (bestTotalSignal) {
      candidates.push({
        key: "FULL_TOTAL",
        ev: bestTotalSignal.ev,
        scoreWeight: bestTotalSignal.ev + 0.05,
      });
    }

    if (h2hSignal) {
      candidates.push({
        key: "FULL_H2H",
        ev: h2hSignal.ev,
        scoreWeight: h2hSignal.ev + 0.03,
      });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.scoreWeight - a.scoreWeight);
    return candidates[0].key;
  }, [quant, aiInsight, bestSpreadSignal, bestTotalSignal, h2hSignal]);

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
      {/* 核心透传：AI 终审实战总指挥看板 (Layer 04 AI Market Direct Overlay)         */}
      {/* ========================================================================= */}
      {aiInsight && (
        <div
          className={`p-3 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
            aiInsight.isQual && aiInsight.hasActionableLegs
              ? "bg-emerald-950/40 border-emerald-500/80 text-emerald-200 shadow-md shadow-emerald-950/30 ring-1 ring-emerald-500/30"
              : "bg-amber-950/30 border-amber-500/60 text-amber-200 shadow-md shadow-amber-950/20"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {aiInsight.isQual && aiInsight.hasActionableLegs ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider ${
                    aiInsight.isQual
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                  }`}
                >
                  AI 终审: {aiInsight.grade} ({aiInsight.conf ?? "-"}分)
                </span>
                <span className="text-xs font-bold text-slate-100">
                  {aiInsight.isQual && aiInsight.hasActionableLegs
                    ? `【实战推荐开仓】已检出 ${aiInsight.legsCount} 项终审推荐投注，见下方盘口高亮`
                    : `【实战门禁排雷阻断】本场触发风控门禁，全盘禁止下注开仓 (坚决观望)`}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {aiInsight.isQual && aiInsight.hasActionableLegs
                  ? `AI 研判模型已完成基本面、动机与时序交叉审计，下方盘口已直接高亮标出推荐下注项与对应赔率。`
                  : `排雷阻断明细: ${
                      aiInsight.trap === "CONFIRMED_TRAP"
                        ? "庄家诱盘陷阱 (CONFIRMED_TRAP) · "
                        : ""
                    }${
                      aiInsight.regime === "BARREN_DOMINANCE"
                        ? "客队虚假繁荣/无效压迫 (BARREN_DOMINANCE) · "
                        : ""
                    }${
                      aiInsight.spreadInsight.status === "BLOCKED"
                        ? `全场让球 ${aiInsight.spreadInsight.label} ${aiInsight.spreadInsight.line || ""} 已被 AI 强行阻断 (${aiInsight.spreadInsight.reason}) · `
                        : ""
                    }即便机器层存在正期望计算，实盘亦严禁盲目开仓！`}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2 text-[11px] font-mono">
            {aiInsight.isQual && aiInsight.hasActionableLegs ? (
              <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 推荐就绪
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold flex items-center gap-1">
                <Ban className="w-3.5 h-3.5" /> 观望省本金
              </span>
            )}
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
              aiInsight?.h2hInsight.status === "RECOMMENDED"
                ? "bg-gradient-to-b from-emerald-950/70 via-slate-900 to-slate-950 border-2 border-emerald-400/90 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/30"
                : bestBetMarket === "FULL_H2H"
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
                {aiInsight?.h2hInsight.status === "RECOMMENDED" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500 text-slate-950 flex items-center gap-1 shadow-xs">
                    <Sparkles className="w-3 h-3 text-slate-950" />
                    🎯 AI终审推荐: {aiInsight.h2hInsight.label}
                  </span>
                ) : aiInsight?.h2hInsight.status === "BLOCKED" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/50 flex items-center gap-1 shadow-xs" title={aiInsight.h2hInsight.reason}>
                    <Ban className="w-3 h-3 text-rose-400" />
                    🚫 AI排除
                  </span>
                ) : aiInsight ? (
                  <span className="text-[10px] text-slate-500 font-mono">AI观望</span>
                ) : bestBetMarket === "FULL_H2H" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    ⚡ 机器最高EV
                  </span>
                ) : fullH2hEval?.isPositiveEv ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/60 flex items-center gap-1">
                    ⚡ 机器初筛(+EV)
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono">Shin去水</span>
                )}
              </div>

              {fullH2hMarket && h2hMain ? (
                <div className="space-y-2 font-mono text-xs">
                  {/* 3 栏赔率与公允概率及三向独立 EV */}
                  {(() => {
                    const isAiHomeRec = aiInsight?.h2hInsight.status === "RECOMMENDED" && aiInsight.h2hInsight.direction === "home";
                    const isAiDrawRec = aiInsight?.h2hInsight.status === "RECOMMENDED" && aiInsight.h2hInsight.direction === "draw";
                    const isAiAwayRec = aiInsight?.h2hInsight.status === "RECOMMENDED" && aiInsight.h2hInsight.direction === "away";

                    return (
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div
                          className={`p-1.5 rounded border relative flex flex-col justify-between ${
                            isAiHomeRec
                              ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 font-bold shadow-sm ring-2 ring-emerald-500/50"
                              : fullH2hEval?.isHomeRecommended
                              ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                              : "bg-slate-950/80 border-slate-800 text-slate-300"
                          }`}
                        >
                          <div>
                            <div className="text-[10px] text-slate-400 truncate">主胜</div>
                            <div className="text-xs font-bold text-slate-200">@{fullH2hMarket.home_odds}</div>
                            <div className="text-[10px] text-blue-400">
                              胜率 {((fullH2hEval?.modelProbs?.[0] ?? h2hMain.fair_probabilities[0]) * 100).toFixed(1)}%
                            </div>
                            <div
                              className={`text-[10px] font-mono ${
                                fullH2hEval && fullH2hEval.homeEv > 0
                                  ? "text-emerald-400 font-bold"
                                  : "text-slate-500"
                              }`}
                            >
                              EV{" "}
                              {fullH2hEval && fullH2hEval.homeEv > 0
                                ? `+${(fullH2hEval.homeEv * 100).toFixed(1)}%`
                                : `${((fullH2hEval?.homeEv ?? 0) * 100).toFixed(1)}%`}
                            </div>
                          </div>
                          {isAiHomeRec ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-500">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-black bg-emerald-500 text-slate-950">
                                🎯 AI推荐
                              </span>
                            </div>
                          ) : fullH2hEval?.isHomeRecommended ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                                推荐
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={`p-1.5 rounded border relative flex flex-col justify-between ${
                            isAiDrawRec
                              ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 font-bold shadow-sm ring-2 ring-emerald-500/50"
                              : fullH2hEval?.isDrawRecommended
                              ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                              : "bg-slate-950/80 border-slate-800 text-slate-300"
                          }`}
                        >
                          <div>
                            <div className="text-[10px] text-slate-400 truncate">平局</div>
                            <div className="text-xs font-bold text-slate-200">@{fullH2hMarket.draw_odds}</div>
                            <div className="text-[10px] text-amber-400">
                              胜率 {((fullH2hEval?.modelProbs?.[1] ?? h2hMain.fair_probabilities[1]) * 100).toFixed(1)}%
                            </div>
                            <div
                              className={`text-[10px] font-mono ${
                                fullH2hEval && fullH2hEval.drawEv > 0
                                  ? "text-emerald-400 font-bold"
                                  : "text-slate-500"
                              }`}
                            >
                              EV{" "}
                              {fullH2hEval && fullH2hEval.drawEv > 0
                                ? `+${(fullH2hEval.drawEv * 100).toFixed(1)}%`
                                : `${((fullH2hEval?.drawEv ?? 0) * 100).toFixed(1)}%`}
                            </div>
                          </div>
                          {isAiDrawRec ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-500">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-black bg-emerald-500 text-slate-950">
                                🎯 AI推荐
                              </span>
                            </div>
                          ) : fullH2hEval?.isDrawRecommended ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                                推荐
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={`p-1.5 rounded border relative flex flex-col justify-between ${
                            isAiAwayRec
                              ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 font-bold shadow-sm ring-2 ring-emerald-500/50"
                              : fullH2hEval?.isAwayRecommended
                              ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold shadow-xs ring-1 ring-emerald-500/40"
                              : "bg-slate-950/80 border-slate-800 text-slate-300"
                          }`}
                        >
                          <div>
                            <div className="text-[10px] text-slate-400 truncate">客胜</div>
                            <div className="text-xs font-bold text-slate-200">@{fullH2hMarket.away_odds}</div>
                            <div className="text-[10px] text-purple-400">
                              胜率 {((fullH2hEval?.modelProbs?.[2] ?? h2hMain.fair_probabilities[2]) * 100).toFixed(1)}%
                            </div>
                            <div
                              className={`text-[10px] font-mono ${
                                fullH2hEval && fullH2hEval.awayEv > 0
                                  ? "text-emerald-400 font-bold"
                                  : "text-slate-500"
                              }`}
                            >
                              EV{" "}
                              {fullH2hEval && fullH2hEval.awayEv > 0
                                ? `+${(fullH2hEval.awayEv * 100).toFixed(1)}%`
                                : `${((fullH2hEval?.awayEv ?? 0) * 100).toFixed(1)}%`}
                            </div>
                          </div>
                          {isAiAwayRec ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-500">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-black bg-emerald-500 text-slate-950">
                                🎯 AI推荐
                              </span>
                            </div>
                          ) : fullH2hEval?.isAwayRecommended ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                                推荐
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-500 font-mono">
                  暂无全场独赢盘口
                </div>
              )}
            </div>

            {/* 底部量化与 AI 终审结论 */}
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px]">
              {aiInsight ? (
                <div className="flex items-center min-h-[2.25rem]">
                  <span className="font-mono line-clamp-2 leading-snug w-full break-words">
                    {aiInsight.h2hInsight.status === "RECOMMENDED" ? (
                      <span className="text-emerald-400 font-bold">
                        🎯 AI终审推荐: {aiInsight.h2hInsight.label} @{aiInsight.h2hInsight.odds} ({aiInsight.h2hInsight.reason})
                      </span>
                    ) : aiInsight.h2hInsight.status === "BLOCKED" ? (
                      <span className="text-rose-400/90 font-medium">
                        🚫 AI终审排除: {aiInsight.h2hInsight.reason || "缺乏穿盘防守缓冲，价值不足"}
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        ⚠️ AI终审裁决: 本盘口未达实战开仓门禁 (坚决观望)
                      </span>
                    )}
                  </span>
                </div>
              ) : fullH2hEval ? (
                <div className="flex items-center min-h-[2.25rem]">
                  <span
                    className="font-mono text-slate-300 line-clamp-2 leading-snug w-full break-words"
                    title={
                      fullH2hEval.isMachineCandidate
                        ? `⚡ 机器初筛候选: ${fullH2hEval.bestSide === "home" ? "主胜" : fullH2hEval.bestSide === "draw" ? "平局" : "客胜"} @${fullH2hEval.bestOdds} (胜率 ${(fullH2hEval.bestProb * 100).toFixed(1)}% | EV: +${(fullH2hEval.maxEv * 100).toFixed(1)}%) · 待AI终审`
                        : fullH2hEval.maxEv > 0
                        ? `⚠️ 机器评估: 正期望但未达推荐门禁 (最高: ${fullH2hEval.bestSide === "home" ? "主胜" : fullH2hEval.bestSide === "draw" ? "平局" : "客胜"} EV +${(fullH2hEval.maxEv * 100).toFixed(1)}%)`
                        : `⚠️ 机器评估: 全盘无正期望项 (最高: ${fullH2hEval.bestSide === "home" ? "主胜" : fullH2hEval.bestSide === "draw" ? "平局" : "客胜"} EV ${(fullH2hEval.maxEv * 100).toFixed(1)}%)`
                    }
                  >
                    {fullH2hEval.isMachineCandidate ? (
                      <span className="text-blue-400 font-medium">
                        ⚡ 机器初筛候选: {fullH2hEval.bestSide === "home" ? "主胜" : fullH2hEval.bestSide === "draw" ? "平局" : "客胜"} @${fullH2hEval.bestOdds} (EV: +{(fullH2hEval.maxEv * 100).toFixed(1)}%) · 待AI终审
                      </span>
                    ) : fullH2hEval.maxEv > 0 ? (
                      <span className="text-amber-400/90">
                        ⚠️ 机器初筛: 正期望但未达门禁 (EV +{(fullH2hEval.maxEv * 100).toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        ⚠️ 机器初筛: 全盘无正期望项
                      </span>
                    )}
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
              aiInsight?.totalInsight.status === "RECOMMENDED"
                ? "bg-gradient-to-b from-emerald-950/70 via-slate-900 to-slate-950 border-2 border-emerald-400/90 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/30"
                : bestBetMarket === "FULL_TOTAL"
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
                {aiInsight?.totalInsight.status === "RECOMMENDED" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500 text-slate-950 flex items-center gap-1 shadow-xs">
                    <Sparkles className="w-3 h-3 text-slate-950" />
                    🎯 AI终审推荐: {aiInsight.totalInsight.label} {aiInsight.totalInsight.line}
                  </span>
                ) : aiInsight?.totalInsight.status === "BLOCKED" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/50 flex items-center gap-1 shadow-xs" title={aiInsight.totalInsight.reason}>
                    <Ban className="w-3 h-3 text-rose-400" />
                    🚫 AI排除: {aiInsight.totalInsight.label}
                  </span>
                ) : aiInsight ? (
                  <span className="text-[10px] text-slate-500 font-mono">AI观望</span>
                ) : bestBetMarket === "FULL_TOTAL" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    ⚡ 机器最高EV {!activeTotalOption?.isMain ? "(副盘)" : "(主盘)"}
                  </span>
                ) : fullTotalEval?.isPositiveEv ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/60 flex items-center gap-1">
                    ⚡ 机器初筛(+EV) {!activeTotalOption?.isMain ? "(副盘)" : "(主盘)"}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {fullTotalEval ? `${fullTotalEval.isMain ? "主盘" : "副盘"} ${fullTotalEval.line}球` : "界线"}
                  </span>
                )}
              </div>

              {/* 多盘口切线选择池 (全盘口平等竞优：主盘 + 全部副盘) */}
              {allTotalOptions.length > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-0.5">
                  <span className="text-[10px] text-slate-500 shrink-0">盘口切线:</span>
                  {allTotalOptions.map((opt) => {
                    const isSelected = activeTotalOption?.assessment.line === opt.assessment.line;
                    const isRecommended = totalSignals.some((s) => s.line === opt.assessment.line);
                    const isTopMathEv = bestTotalOption?.assessment.line === opt.assessment.line;
                    return (
                      <button
                        key={opt.assessment.line}
                        type="button"
                        onClick={() => setSelectedTotalLine(opt.assessment.line)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors flex items-center gap-0.5 cursor-pointer ${
                          isSelected
                            ? "bg-emerald-500 text-slate-950 font-bold shadow-xs ring-1 ring-emerald-300/50"
                            : isRecommended
                            ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 hover:bg-emerald-900/80"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                        }`}
                      >
                        <span>{opt.assessment.line}</span>
                        <span className="text-[9px] opacity-75">{opt.isMain ? "(主)" : "(副)"}</span>
                        {isRecommended ? (
                          <span className={`text-[9px] font-bold ${isSelected ? "text-slate-950" : "text-emerald-300"}`}>★推荐</span>
                        ) : isTopMathEv ? (
                          <span className={`text-[9px] font-bold ${isSelected ? "text-slate-950" : "text-amber-300"}`}>★高EV</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}

              {fullTotalEval ? (
                <div className="space-y-2 font-mono text-xs">
                  {/* 大球 vs 小球对比 */}
                  {(() => {
                    const isAiOverRec = aiInsight?.totalInsight.status === "RECOMMENDED" && aiInsight.totalInsight.direction === "over";
                    const isAiUnderRec = aiInsight?.totalInsight.status === "RECOMMENDED" && aiInsight.totalInsight.direction === "under";
                    const isAiOverBlocked = aiInsight?.totalInsight.status === "BLOCKED" && aiInsight.totalInsight.direction === "over";
                    const isAiUnderBlocked = aiInsight?.totalInsight.status === "BLOCKED" && aiInsight.totalInsight.direction === "under";

                    return (
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div
                          className={`p-1.5 rounded border relative flex flex-col justify-between ${
                            isAiOverRec
                              ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 font-bold shadow-sm ring-2 ring-emerald-500/50"
                              : isAiOverBlocked
                              ? "bg-rose-950/40 border-rose-600/80 text-rose-200 ring-1 ring-rose-500/30"
                              : fullTotalEval.isOverRecommended
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
                          {isAiOverRec ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-500">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-black bg-emerald-500 text-slate-950">
                                🎯 AI推荐
                              </span>
                            </div>
                          ) : isAiOverBlocked ? (
                            <div className="mt-1 pt-0.5 border-t border-rose-800/60">
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9.5px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/60">
                                <Ban className="w-2.5 h-2.5" /> AI阻断
                              </span>
                            </div>
                          ) : fullTotalEval.isOverRecommended ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                                推荐
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={`p-1.5 rounded border relative flex flex-col justify-between ${
                            isAiUnderRec
                              ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 font-bold shadow-sm ring-2 ring-emerald-500/50"
                              : isAiUnderBlocked
                              ? "bg-rose-950/40 border-rose-600/80 text-rose-200 ring-1 ring-rose-500/30"
                              : fullTotalEval.isUnderRecommended
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
                          {isAiUnderRec ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-500">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-black bg-emerald-500 text-slate-950">
                                🎯 AI推荐
                              </span>
                            </div>
                          ) : isAiUnderBlocked ? (
                            <div className="mt-1 pt-0.5 border-t border-rose-800/60">
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9.5px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/60">
                                <Ban className="w-2.5 h-2.5" /> AI阻断
                              </span>
                            </div>
                          ) : fullTotalEval.isUnderRecommended ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-700/60">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/60">
                                推荐
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="text-[10px] text-slate-400 space-y-1 px-0.5">
                    <div className="flex justify-between flex-wrap gap-1">
                      <span>完场界线: <strong className="text-emerald-300 font-mono">{fullTotalEval.line}球</strong> (剩余期望 λ={quant.poisson?.expected_goals_rest != null ? quant.poisson.expected_goals_rest.toFixed(2) : "0.00"}球)</span>
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

            {/* 底部量化与 AI 终审结论 */}
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px]">
              {aiInsight ? (
                <div className="flex items-center min-h-[2.25rem]">
                  <span className="font-mono line-clamp-2 leading-snug w-full break-words">
                    {aiInsight.totalInsight.status === "RECOMMENDED" ? (
                      <span className="text-emerald-400 font-bold">
                        🎯 AI终审推荐: {aiInsight.totalInsight.label} {aiInsight.totalInsight.line} @{aiInsight.totalInsight.odds} ({aiInsight.totalInsight.reason})
                      </span>
                    ) : aiInsight.totalInsight.status === "BLOCKED" ? (
                      <span className="text-rose-400/90 font-medium">
                        🚫 AI终审排除: {aiInsight.totalInsight.reason || "进球期望不足/已被风控阻断"}
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        ⚠️ AI终审裁决: 本盘口未达实战开仓门禁 (坚决观望)
                      </span>
                    )}
                  </span>
                </div>
              ) : globalBestTotal ? (
                <div className="flex items-center min-h-[2.25rem]">
                  <span
                    className="font-mono text-slate-300 line-clamp-2 leading-snug w-full break-words"
                    title={
                      bestTotalSignal
                        ? `⚡ 机器初筛候选: ${bestTotalSignal.market === "TOTAL_GOALS_MAIN" ? "主盘" : "副盘"} ${bestTotalSignal.side === "over" ? `大球 (>${bestTotalSignal.line})` : `小球 (<${bestTotalSignal.line})`} @${bestTotalSignal.odds} (胜率 ${((bestTotalSignal.model_probability ?? 0.5) * 100).toFixed(1)}% | EV: +${(bestTotalSignal.ev * 100).toFixed(1)}%) · 待AI终审`
                        : globalBestTotal.ev > 0
                        ? `⚠️ 机器评估: 正期望但未达推荐门禁 (最高: ${globalBestTotal.isMain ? "主盘" : "副盘"} ${globalBestTotal.label} EV +${(globalBestTotal.ev * 100).toFixed(1)}%)`
                        : `⚠️ 机器评估: 全盘无正期望项 (最高: ${globalBestTotal.isMain ? "主盘" : "副盘"} ${globalBestTotal.label} EV ${(globalBestTotal.ev * 100).toFixed(1)}%)`
                    }
                  >
                    {bestTotalSignal ? (
                      <span className="text-blue-400 font-medium">
                        ⚡ 机器初筛候选: {bestTotalSignal.market === "TOTAL_GOALS_MAIN" ? "主盘" : "副盘"} {bestTotalSignal.side === "over" ? `大球 (>${bestTotalSignal.line})` : `小球 (<${bestTotalSignal.line})`} @${bestTotalSignal.odds} (EV: +{(bestTotalSignal.ev * 100).toFixed(1)}%) · 待AI终审
                      </span>
                    ) : globalBestTotal.ev > 0 ? (
                      <span className="text-amber-400/90">
                        ⚠️ 机器初筛: 正期望但未达推荐门禁 (EV +{(globalBestTotal.ev * 100).toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        ⚠️ 机器初筛: 全盘无正期望项
                      </span>
                    )}
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
              aiInsight?.spreadInsight.status === "RECOMMENDED"
                ? "bg-gradient-to-b from-emerald-950/70 via-slate-900 to-slate-950 border-2 border-emerald-400/90 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/30"
                : aiInsight?.spreadInsight.status === "BLOCKED"
                ? "bg-slate-900/90 border border-rose-800/60 ring-1 ring-rose-500/20"
                : bestBetMarket === "FULL_SPREAD"
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
                {aiInsight?.spreadInsight.status === "RECOMMENDED" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500 text-slate-950 flex items-center gap-1 shadow-xs">
                    <Sparkles className="w-3 h-3 text-slate-950" />
                    🎯 AI终审推荐: {aiInsight.spreadInsight.label} {aiInsight.spreadInsight.line}
                  </span>
                ) : aiInsight?.spreadInsight.status === "BLOCKED" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/50 flex items-center gap-1 shadow-xs" title={aiInsight.spreadInsight.reason}>
                    <Ban className="w-3 h-3 text-rose-400" />
                    🚫 AI排除: {aiInsight.spreadInsight.label}
                  </span>
                ) : aiInsight ? (
                  <span className="text-[10px] text-slate-500 font-mono">AI观望</span>
                ) : bestBetMarket === "FULL_SPREAD" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    ⚡ 机器最高EV {!activeSpreadOption?.isMain ? "(副盘)" : "(主盘)"}
                  </span>
                ) : fullSpreadEval?.isPositiveEv ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/60 flex items-center gap-1">
                    ⚡ 机器初筛(+EV) {!activeSpreadOption?.isMain ? "(副盘)" : "(主盘)"}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {fullSpreadEval ? `${fullSpreadEval.isMain ? "主盘" : "副盘"} ${fullSpreadEval.line}` : "让球"}
                  </span>
                )}
              </div>

              {/* 多盘口切线选择池 (全盘口平等竞优：主盘 + 全部副盘) */}
              {allSpreadOptions.length > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-0.5">
                  <span className="text-[10px] text-slate-500 shrink-0">盘口切线:</span>
                  {allSpreadOptions.map((opt) => {
                    const isSelected = activeSpreadOption?.assessment.line === opt.assessment.line;
                    const lineVal = parseAsianHandicapLine(opt.assessment.line);
                    const displayLine = formatAsianHandicapLine(lineVal);
                    const isRecommended = spreadSignals.some((s) => {
                      const sNum = parseAsianHandicapLine(s.line);
                      return (
                        s.line === opt.assessment.line ||
                        Math.abs(sNum - lineVal) < 0.001 ||
                        Math.abs(sNum - (-lineVal)) < 0.001
                      );
                    });
                    const isTopMathEv = bestSpreadOption?.assessment.line === opt.assessment.line;
                    return (
                      <button
                        key={opt.assessment.line}
                        type="button"
                        onClick={() => setSelectedSpreadLine(opt.assessment.line)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors flex items-center gap-0.5 cursor-pointer ${
                          isSelected
                            ? "bg-blue-500 text-white font-bold shadow-xs ring-1 ring-blue-300/50"
                            : isRecommended
                            ? "bg-blue-950/80 text-blue-300 border border-blue-500/60 hover:bg-blue-900/80"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                        }`}
                      >
                        <span>{displayLine}</span>
                        <span className="text-[9px] opacity-75">{opt.isMain ? "(主)" : "(副)"}</span>
                        {isRecommended ? (
                          <span className={`text-[9px] font-bold ${isSelected ? "text-white" : "text-emerald-300"}`}>★推荐</span>
                        ) : isTopMathEv ? (
                          <span className={`text-[9px] font-bold ${isSelected ? "text-white" : "text-amber-300"}`}>★高EV</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}

              {fullSpreadEval ? (
                <div className="space-y-2 font-mono text-xs">
                  {/* 主队让球 vs 客队让球对比 (纯净盘口展示，优先消费 YBTY 官方下发合法选项名称) */}
                  {(() => {
                    const spreadNum = parseAsianHandicapLine(fullSpreadEval.line);
                    const matchingSpreadMarket = fullSpreadEval.isMain
                      ? match.markets.full_spread_main
                      : match.markets.full_spread_subs?.find((s) => {
                          const sHomeNum = parseAsianHandicapLine(s.home_selection);
                          return (
                            s.home_selection === fullSpreadEval.line ||
                            Math.abs(sHomeNum - spreadNum) < 0.001 ||
                            Math.abs(sHomeNum - (-spreadNum)) < 0.001 ||
                            String(s.line_index) === fullSpreadEval.line
                          );
                        }) ?? null;

                    const homeLineLabel = matchingSpreadMarket?.home_selection
                      ? (matchingSpreadMarket.home_selection.startsWith("主")
                          ? matchingSpreadMarket.home_selection
                          : `主 ${matchingSpreadMarket.home_selection}`)
                      : spreadNum === 0
                      ? "主 0 (平手)"
                      : `主 ${formatAsianHandicapLine(spreadNum)}`;

                    const awayLineLabel = matchingSpreadMarket?.away_selection
                      ? (matchingSpreadMarket.away_selection.startsWith("客")
                          ? matchingSpreadMarket.away_selection
                          : `客 ${matchingSpreadMarket.away_selection}`)
                      : spreadNum === 0
                      ? "客 0 (平手)"
                      : `客 ${formatAsianHandicapLine(-spreadNum)}`;

                    const isAiHomeRec = aiInsight?.spreadInsight.status === "RECOMMENDED" && aiInsight.spreadInsight.direction === "home";
                    const isAiAwayRec = aiInsight?.spreadInsight.status === "RECOMMENDED" && aiInsight.spreadInsight.direction === "away";
                    const isAiHomeBlocked = aiInsight?.spreadInsight.status === "BLOCKED" && aiInsight.spreadInsight.direction === "home";
                    const isAiAwayBlocked = aiInsight?.spreadInsight.status === "BLOCKED" && aiInsight.spreadInsight.direction === "away";

                    return (
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div
                          className={`p-1.5 rounded border relative flex flex-col justify-between ${
                            isAiHomeRec
                              ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 font-bold shadow-sm ring-2 ring-emerald-500/50"
                              : isAiHomeBlocked
                              ? "bg-rose-950/40 border-rose-600/80 text-rose-200 ring-1 ring-rose-500/30"
                              : fullSpreadEval.isHomeRecommended
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
                          {isAiHomeRec ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-500">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-black bg-emerald-500 text-slate-950">
                                🎯 AI推荐
                              </span>
                            </div>
                          ) : isAiHomeBlocked ? (
                            <div className="mt-1 pt-0.5 border-t border-rose-800/60">
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9.5px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/60" title={aiInsight?.spreadInsight.reason}>
                                <Ban className="w-2.5 h-2.5" /> AI阻断 (诱盘)
                              </span>
                            </div>
                          ) : fullSpreadEval.isHomeRecommended && !aiInsight ? (
                            <div className="mt-1 pt-0.5 border-t border-blue-700/60">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/60">
                                机器初筛
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={`p-1.5 rounded border relative flex flex-col justify-between ${
                            isAiAwayRec
                              ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 font-bold shadow-sm ring-2 ring-emerald-500/50"
                              : isAiAwayBlocked
                              ? "bg-rose-950/40 border-rose-600/80 text-rose-200 ring-1 ring-rose-500/30"
                              : fullSpreadEval.isAwayRecommended && !aiInsight
                              ? "bg-blue-950/60 border-blue-500 text-blue-300 font-bold shadow-xs ring-1 ring-blue-500/40"
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
                          {isAiAwayRec ? (
                            <div className="mt-1 pt-0.5 border-t border-emerald-500">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-black bg-emerald-500 text-slate-950">
                                🎯 AI推荐
                              </span>
                            </div>
                          ) : isAiAwayBlocked ? (
                            <div className="mt-1 pt-0.5 border-t border-rose-800/60">
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9.5px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/60" title={aiInsight?.spreadInsight.reason}>
                                <Ban className="w-2.5 h-2.5" /> AI阻断 (诱盘)
                              </span>
                            </div>
                          ) : fullSpreadEval.isAwayRecommended && !aiInsight ? (
                            <div className="mt-1 pt-0.5 border-t border-blue-700/60">
                              <span className="inline-block px-1 py-0.2 rounded text-[9.5px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/60">
                                机器初筛
                              </span>
                            </div>
                          ) : null}
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

            {/* 底部量化与 AI 终审结论 */}
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] space-y-1">
              {aiInsight ? (
                <div className="flex items-center min-h-[2.25rem]">
                  <span className="font-mono line-clamp-2 leading-snug w-full break-words">
                    {aiInsight.spreadInsight.status === "RECOMMENDED" ? (
                      <span className="text-emerald-400 font-bold">
                        🎯 AI终审推荐: {aiInsight.spreadInsight.label} {aiInsight.spreadInsight.line} @{aiInsight.spreadInsight.odds} ({aiInsight.spreadInsight.reason})
                      </span>
                    ) : aiInsight.spreadInsight.status === "BLOCKED" ? (
                      <span className="text-rose-400/90 font-medium">
                        🚫 AI排雷阻断: {aiInsight.spreadInsight.label} {aiInsight.spreadInsight.line} 诱盘风险阻断，严禁开仓！({aiInsight.spreadInsight.reason || "机构深诱"})
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        ⚠️ AI终审裁决: 本盘口未达实战开仓门禁 (坚决观望)
                      </span>
                    )}
                  </span>
                </div>
              ) : globalBestSpread ? (
                <div className="flex items-center min-h-[1.75rem]">
                  <span
                    className="font-mono text-slate-300 line-clamp-2 leading-snug w-full break-words"
                    title={
                      bestSpreadSignal
                        ? `⚡ 机器初筛候选: ${bestSpreadSignal.market === "ASIAN_HANDICAP_MAIN" ? "主盘" : "副盘"} ${bestSpreadSignal.side === "home" ? match.home_team_name : match.away_team_name} ${bestSpreadSignal.line} @${bestSpreadSignal.odds} (胜率 ${((bestSpreadSignal.model_probability ?? 0.5) * 100).toFixed(1)}% | EV: +${(bestSpreadSignal.ev * 100).toFixed(1)}%) · 待AI终审`
                        : globalBestSpread.ev > 0
                        ? `⚠️ 机器评估: 正期望但未达推荐门禁 (最高: ${globalBestSpread.isMain ? "主盘" : "副盘"} ${globalBestSpread.isHome ? "主队" : "客队"} ${globalBestSpread.lineNotation} EV +${(globalBestSpread.ev * 100).toFixed(1)}%)`
                        : `⚠️ 机器评估: 全盘无正期望项 (最高: ${globalBestSpread.isMain ? "主盘" : "副盘"} ${globalBestSpread.isHome ? "主队" : "客队"} ${globalBestSpread.lineNotation} EV ${(globalBestSpread.ev * 100).toFixed(1)}%)`
                    }
                  >
                    {bestSpreadSignal ? (
                      <span className="text-blue-400 font-medium">
                        ⚡ 机器初筛候选: {bestSpreadSignal.market === "ASIAN_HANDICAP_MAIN" ? "主盘" : "副盘"} ${bestSpreadSignal.side === "home" ? match.home_team_name : match.away_team_name} ${bestSpreadSignal.line} @${bestSpreadSignal.odds} (EV: +{(bestSpreadSignal.ev * 100).toFixed(1)}%) · 待AI终审
                      </span>
                    ) : globalBestSpread.ev > 0 ? (
                      <span className="text-amber-400/90">
                        ⚠️ 机器初筛: 正期望但未达推荐门禁 (EV +{(globalBestSpread.ev * 100).toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        ⚠️ 机器初筛: 全盘无正期望项
                      </span>
                    )}
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
                      const rawHome = match.markets.half_spread_main.home_selection
                        ? (match.markets.half_spread_main.home_selection.startsWith("半")
                            ? match.markets.half_spread_main.home_selection
                            : `半主 ${match.markets.half_spread_main.home_selection}`)
                        : "半主 -";
                      const rawAway = match.markets.half_spread_main.away_selection
                        ? (match.markets.half_spread_main.away_selection.startsWith("半")
                            ? match.markets.half_spread_main.away_selection
                            : `半客 ${match.markets.half_spread_main.away_selection}`)
                        : "半客 -";
                      const halfHomeLineLabel = rawHome;
                      const halfAwayLineLabel = rawAway;

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

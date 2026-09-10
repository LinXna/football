import { AiEvaluationResult, EvaluatorPayload } from './types.js';
import { RecommendationGrade, TacticalRegimeEvaluation } from './enums.js';
import { QuantAlert } from '../03_quant_engine/enums.js';

/**
 * Parses Asian handicap lines into a unified float.
 * Matches: "-0.25", "-0/0.5", "0/-0.5", "2/2.5", "+0.5/1", "-0.5/-1", etc.
 * Preserves correct sign without inversion.
 */
export function parseHandicapToFloat(line: string | number): number | null {
  const cleanLine = String(line).trim().replace(/\s/g, '');
  if (!cleanLine) return null;

  // 1. 无斜杠的直接浮点数
  if (!cleanLine.includes('/')) {
    const floatVal = parseFloat(cleanLine);
    return isNaN(floatVal) ? null : floatVal;
  }

  // 2. 双值四分之一盘口（如 "-0/0.5", "0/-0.5", "2/2.5", "-0.5/-1"）
  const parts = cleanLine.split('/');
  if (parts.length === 2) {
    const hasNegativePrefix = cleanLine.startsWith('-');
    const p1 = parseFloat(parts[0]);
    const p2 = parseFloat(parts[1]);
    if (!isNaN(p1) && !isNaN(p2)) {
      const isNegative = hasNegativePrefix || p1 < 0 || p2 < 0 || Object.is(p1, -0) || Object.is(p2, -0);
      const abs1 = Math.abs(p1);
      const abs2 = Math.abs(p2);
      const avg = (abs1 + abs2) / 2;
      return isNegative ? -avg : avg;
    }
  }

  return null;
}

/**
 * P0-01: Identifies quarter/split lines from the actual line value itself.
 * Examples: '0/0.5', '-0/0.5', '+0/0.5', '0.5/1', '1/1.5', '1.5/2', '2/2.5', '+0.25', '-0.25', '+0.75', '-0.75'.
 * Actual line structure MUST strictly override the 'is_quarter_line' metadata!
 */
export function isQuarterOrSplitLine(val: any): boolean {
  if (!val) return false;
  if (typeof val === 'object') {
    return isQuarterOrSplitLine(val.selected_line) ||
           isQuarterOrSplitLine(val.line) ||
           isQuarterOrSplitLine(val.handicap) ||
           isQuarterOrSplitLine(val.total_line) ||
           isQuarterOrSplitLine(val.home_selection) ||
           isQuarterOrSplitLine(val.away_selection);
  }
  const s = String(val).trim();
  if (s.includes('/')) return true;
  if (s.includes('.25') || s.includes('.75')) return true;
  return false;
}

function hasMachineCandidate(leg: AiEvaluationResult['recommended_legs'][number], payload: EvaluatorPayload): boolean {
  const candidates = payload.quant_features?.machine_candidate_signals ?? [];
  const candidateSide = leg.direction.toLowerCase();
  return candidates.some((candidate) => {
    const candidateLine = parseHandicapToFloat(candidate.line);
    const legLine = parseHandicapToFloat(leg.selected_line);
    return candidate.market === leg.market &&
      candidate.side.toLowerCase() === candidateSide &&
      ((candidateLine === null && legLine === null) ||
        (candidateLine !== null && legLine !== null && Math.abs(candidateLine - legLine) < 0.001)) &&
      Math.abs(candidate.odds - leg.current_odds) < 0.02;
  });
}

/**
 * P1-07: Finds the first legally valid, open, and verifiable signal from raw mathematical signals.
 * Excludes mathematically closed lines (e.g. Over/Under 1.5 at 2-0), unverifiable quarter lines,
 * and signals with missing baseline data (market, line, odds <= 1.0).
 */
export function findFirstLegallyVerifiableSignal(
  rawSignals: any[],
  currentTotalGoals: number,
  isLiveMatch: boolean
): any | null {
  if (!Array.isArray(rawSignals) || rawSignals.length === 0) return null;

  for (const sig of rawSignals) {
    if (!sig || !sig.market || sig.line == null || !sig.odds || sig.odds <= 1.0) {
      continue;
    }
    // Check line-specific mathematical closure for total goals
    if (isLiveMatch && (sig.market === 'TOTAL_GOALS_MAIN' || sig.market === 'TOTAL_GOALS_SECONDARY')) {
      const lineStr = String(sig.line).split('/')[0];
      const lineNum = parseFloat(lineStr);
      if (!isNaN(lineNum) && lineNum <= currentTotalGoals) {
        // Mathematically closed line, cannot be selected
        continue;
      }
    }
    // Baseline data check passed
    return sig;
  }
  return null;
}

/**
 * Alignment Guard: Prevents AI hallucination of betting markets and odds.
 * Also enforces strict system-level risk overrides (Data Blind-Spot, Unverified Score).
 */
export function verifyStatutoryAlignment(result: AiEvaluationResult, payload: EvaluatorPayload): AiEvaluationResult {
  const scoreParts = (payload.ai_brief.score_verification?.current_score ?? '0 - 0').split('-').map(s => parseInt(s.trim(), 10));
  const currentTotalGoals = (isNaN(scoreParts[0]) ? 0 : scoreParts[0]) + (isNaN(scoreParts[1]) ? 0 : scoreParts[1]);
  const isLiveMatch = (payload.ai_brief.status_summary ?? '').includes('LIVE');

  const candidatePipeline = payload.quant_features?.candidate_pipeline;
  const candidateState = candidatePipeline?.state ?? 'OOS_LOCKED';
  const statutoryMarkets = payload.ai_brief.core_markets || {};

  // Hard Layer 03 authorization boundary: locked states may be evaluated for research,
  // but can never carry actionable AI legs or an A/B recommendation grade downstream.
  if (candidateState !== 'PRODUCTION_UNLOCKED') {
    let lockedMarketScan = result.market_scan;
    if (lockedMarketScan) {
      if (lockedMarketScan.market === 'NONE' || lockedMarketScan.selected_line === 'NONE' || lockedMarketScan.selected_line === '') {
        const fallback = findFirstLegallyVerifiableSignal(
          payload.quant_features?.raw_mathematical_ev_signals ?? [],
          currentTotalGoals,
          isLiveMatch
        );
        if (fallback) {
          const hasEngineEv = typeof (fallback as any).risk_adjusted_ev === 'number';
          lockedMarketScan = {
            ...lockedMarketScan,
            market: fallback.market,
            selected_line: String(fallback.line),
            direction: (fallback.side ?? 'HOME').toUpperCase() as any,
            current_odds: fallback.odds ?? 0,
            minimum_acceptable_odds: 0,
            raw_ev: fallback.ev ?? 0,
            risk_adjusted_ev: hasEngineEv ? (fallback as any).risk_adjusted_ev : 0,
            risk_adjustment_status: hasEngineEv ? 'ENGINE_PROVIDED' : 'QUALITATIVE_ONLY',
            actionable: false,
            market_status: 'VALID_BUT_BLOCKED',
            rejection_reason: `EXECUTION_LOCKED: candidate_pipeline.state=${candidateState}`
          };
        } else {
          lockedMarketScan = {
            ...lockedMarketScan,
            market: 'NONE',
            selected_line: 'NONE',
            direction: 'NONE',
            market_status: 'NO_VALID_MARKET',
            current_odds: 0,
            minimum_acceptable_odds: 0,
            raw_ev: 0,
            risk_adjusted_ev: 0,
            risk_adjustment_status: 'QUALITATIVE_ONLY',
            actionable: false,
            rejection_reason: lockedMarketScan.rejection_reason || `NO VALID MARKET: No legally verifiable open line found (candidate_pipeline.state=${candidateState})`
          };
        }
      } else {
        lockedMarketScan = {
          ...lockedMarketScan,
          market_status: 'VALID_BUT_BLOCKED',
          actionable: false,
          rejection_reason: lockedMarketScan.rejection_reason || `EXECUTION_LOCKED: candidate_pipeline.state=${candidateState}`
        };
      }
    }

    return {
      ...result,
      grade: RecommendationGrade.RESEARCH,
      confidence_score: 0,
      risk_warnings: [
        ...result.risk_warnings,
        `SYSTEM HARD GATE (P1-02): EXECUTION_LOCKED - Layer 03 candidate_pipeline.state=${candidateState}; AI actionable recommendation is forbidden.`
      ],
      recommended_legs: [],
      market_scan: lockedMarketScan
    };
  }
  let hasHallucination = false;
  let hallucinationReason = '';

  for (const leg of result.recommended_legs) {
    let isValid = false;
    const aiLine = parseHandicapToFloat(leg.selected_line);

    if (!hasMachineCandidate(leg, payload)) {
      hasHallucination = true;
      hallucinationReason = `AI Hallucinated Leg: AI leg lacks a matching Layer 03 machine candidate: Market=${leg.market}, Dir=${leg.direction}, Line=${leg.selected_line}, Odds=${leg.current_odds}.`;
      break;
    }

    if (aiLine === null && leg.market !== 'EURO_1X2') {
      hasHallucination = true;
      hallucinationReason = `AI generated unparseable line: ${leg.selected_line}`;
      break;
    }

    if (leg.market === 'ASIAN_HANDICAP_MAIN' && statutoryMarkets.ah_main) {
      const sm = statutoryMarkets.ah_main;
      const statLine = parseHandicapToFloat(sm.handicap ?? sm.home_selection ?? '');
      
      if (statLine !== null && aiLine !== null && Math.abs(aiLine - statLine) < 0.001) {
        if (
          (leg.direction === 'HOME' && Math.abs(leg.current_odds - sm.home_odds) < 0.02) ||
          (leg.direction === 'AWAY' && Math.abs(leg.current_odds - sm.away_odds) < 0.02)
        ) {
          isValid = true;
        }
      }
    } else if (leg.market === 'TOTAL_GOALS_MAIN' && statutoryMarkets.ou_main) {
      const sm = statutoryMarkets.ou_main;
      const statLine = parseHandicapToFloat(sm.handicap ?? sm.line ?? '');
      
      if (statLine !== null && aiLine !== null && Math.abs(aiLine - statLine) < 0.001) {
        if (
          (leg.direction === 'OVER' && Math.abs(leg.current_odds - sm.over_odds) < 0.02) ||
          (leg.direction === 'UNDER' && Math.abs(leg.current_odds - sm.under_odds) < 0.02)
        ) {
          isValid = true;
        }
      }
    } else if (leg.market === 'EURO_1X2' && statutoryMarkets.euro_1x2) {
      const sm = statutoryMarkets.euro_1x2;
      if (
        (leg.direction === 'HOME' && Math.abs(leg.current_odds - (sm.home_win ?? sm.home_odds ?? Number.NaN)) < 0.02) ||
        (leg.direction === 'DRAW' && Math.abs(leg.current_odds - (sm.draw ?? sm.draw_odds ?? Number.NaN)) < 0.02) ||
        (leg.direction === 'AWAY' && Math.abs(leg.current_odds - (sm.away_win ?? sm.away_odds ?? Number.NaN)) < 0.02)
      ) {
        isValid = true;
      }
    } else if (leg.market === 'ASIAN_HANDICAP_HALF' && statutoryMarkets.ah_half) {
      const sm = statutoryMarkets.ah_half;
      const statLine = parseHandicapToFloat(sm.handicap ?? sm.home_selection ?? '');
      
      if (statLine !== null && aiLine !== null && Math.abs(aiLine - statLine) < 0.001) {
        if (
          (leg.direction === 'HOME' && Math.abs(leg.current_odds - sm.home_odds) < 0.02) ||
          (leg.direction === 'AWAY' && Math.abs(leg.current_odds - sm.away_odds) < 0.02)
        ) {
          isValid = true;
        }
      }
    } else if (leg.market === 'TOTAL_GOALS_HALF' && statutoryMarkets.ou_half) {
      const sm = statutoryMarkets.ou_half;
      const statLine = parseHandicapToFloat(sm.handicap ?? sm.line ?? '');
      
      if (statLine !== null && aiLine !== null && Math.abs(aiLine - statLine) < 0.001) {
        if (
          (leg.direction === 'OVER' && Math.abs(leg.current_odds - sm.over_odds) < 0.02) ||
          (leg.direction === 'UNDER' && Math.abs(leg.current_odds - sm.under_odds) < 0.02)
        ) {
          isValid = true;
        }
      }
    }

    if (!isValid) {
      hasHallucination = true;
      hallucinationReason = `AI Hallucinated Leg: Market=${leg.market}, Dir=${leg.direction}, Line=${leg.selected_line}, Odds=${leg.current_odds}, MAO=${leg.minimum_acceptable_odds}. Not found in statutory payload or odds mismatched.`;
      break;
    }
  }

  if (hasHallucination) {
    return {
      ...result,
      grade: RecommendationGrade.REJECTED,
      confidence_score: 0,
      risk_warnings: [
        ...result.risk_warnings,
        `SYSTEM OVERRIDE: ${hallucinationReason} -> Auto-downgraded to REJECTED to protect portfolio.`
      ],
      recommended_legs: [] 
    };
  }

  // --- HARD RISK OVERRIDES (系统硬性风控后置门禁) ---
  let enforcedGrade = result.grade;
  let enforcedConfidence = Math.max(0, Math.min(100, result.confidence_score));
  const additionalWarnings: string[] = [];

  // P1-10: Actionable recommendation grade (A/B) must not have empty recommended legs
  if (result.recommended_legs.length === 0 && (enforcedGrade === RecommendationGrade.A_GRADE || enforcedGrade === RecommendationGrade.B_GRADE)) {
    enforcedGrade = RecommendationGrade.REJECTED;
    enforcedConfidence = 0;
    additionalWarnings.push("SYSTEM HARD GATE (P1-10): Actionable recommendation grade (A/B) must not have empty recommended legs.");
  }

  // Step 2: 比分未经校验时：绝对不得给 A 级推荐
  const isScoreVerified = payload.ai_brief.score_verification?.is_verified ?? true;
  if (!isScoreVerified && enforcedGrade === RecommendationGrade.A_GRADE) {
    enforcedGrade = RecommendationGrade.B_GRADE;
    enforcedConfidence = Math.min(enforcedConfidence, 85);
    additionalWarnings.push("SYSTEM HARD GATE: 比分未经交叉校验，强制撤销 A 级资格降为 B 级");
  }

  // Step 3: 数据盲盒铁律：存在客观盲区时，禁止给出 A 级，置信度上限强制锁定在 85 以下 (P0-04, P2-03)
  const hasBlindSpot = !!payload.data_blind_spot_warning;
  if (hasBlindSpot) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
      additionalWarnings.push("SYSTEM HARD GATE: 命中严重数据盲区铁律，强制将 A 级降级为 B 级");
    }
    if (enforcedConfidence > 85) {
      enforcedConfidence = 85;
      additionalWarnings.push("SYSTEM HARD GATE: 命中数据盲区，置信度强制封顶 85 分");
    }
  }

  // Step 4: OOS 语义与样本量硬门禁 (P0-01)
  const oosStatus = payload.quant_features?.oos_semantic_status;
  const oosProfileStatus = oosStatus?.profile_status ?? 'NO_PROFILE';
  const oosEss = oosStatus?.effective_sample_size ?? 0;
  // P0-01 统一标准定义: OOS_VALIDATED = (profile_status == "VALIDATED") AND (effective_sample_size >= 30)
  const isOosValidated = (oosProfileStatus === 'VALIDATED') && (oosEss >= 30);
  if (!isOosValidated && enforcedGrade === RecommendationGrade.A_GRADE) {
    enforcedGrade = RecommendationGrade.B_GRADE;
    enforcedConfidence = Math.min(enforcedConfidence, 80);
    additionalWarnings.push(`SYSTEM HARD GATE (P0-01): OOS处于 ${oosProfileStatus} 且有效样本量为 ${oosEss} (<30)，OOS_VALIDATED=false，禁止 A_GRADE，强制降为 B_GRADE 试探评级`);
  }

  // Step 6: 模型稳定性与重大冲突硬门禁 (P0-04, P2-03)
  const stabilityInfo = payload.quant_features?.stability_and_blockers;
  const stabilityScore = stabilityInfo?.model_stability_score ?? 100;
  const hasMajorConflict = stabilityInfo?.has_major_live_conflict ?? false;
  const candidateCount = payload.quant_features?.machine_candidate_count ?? 0;

  if (stabilityScore < 70) {
    if (hasMajorConflict || candidateCount === 0) {
      if (enforcedGrade === RecommendationGrade.A_GRADE || enforcedGrade === RecommendationGrade.B_GRADE) {
        enforcedGrade = RecommendationGrade.WATCH;
        enforcedConfidence = Math.min(enforcedConfidence, 50);
        additionalWarnings.push("SYSTEM HARD GATE (P0-04): 模型稳定性低于70且存在重大数据冲突或零机器候选，强制降为 WATCH");
      }
    } else if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
      enforcedConfidence = Math.min(enforcedConfidence, 75);
      additionalWarnings.push("SYSTEM HARD GATE (P0-04): 模型稳定性低于70，禁止 A_GRADE，强制封顶 B_GRADE");
    }
  }

  // Step 7: 杯赛/友谊赛首发未确认时：最高 C 级，不进正式串关
  const league = payload.ai_brief.league ?? '';
  const isCupOrFriendly = /杯|Cup|copa|pokal|coupe|友谊|friendly/i.test(league);
  const lineupNotConfirmed = typeof payload.lineup_value_matrix === 'string'
    ? true
    : !payload.lineup_value_matrix?.is_lineup_confirmed;
  if (isCupOrFriendly && lineupNotConfirmed) {
    if (enforcedGrade === RecommendationGrade.A_GRADE || enforcedGrade === RecommendationGrade.B_GRADE) {
      enforcedGrade = RecommendationGrade.C_GRADE;
      additionalWarnings.push("SYSTEM HARD GATE: 杯赛/友谊赛官方首发未确认，最高维持 C 级观察");
    }
  }

  // Step 8 & 9: Layer 03 量化警报后置协同门禁与确诊诱盘 (P1-03)
  const quantRiskFlags = payload.quant_features?.risk_flags ?? [];

  if (result.blind_spot_analysis?.trap_detection_result === 'CONFIRMED_TRAP') {
    enforcedGrade = RecommendationGrade.REJECTED;
    enforcedConfidence = 0;
    additionalWarnings.push("SYSTEM HARD GATE (P1-03): 触发确诊诱盘陷阱 (CONFIRMED_TRAP)，强制驳回至 REJECTED 并归零置信度");
  }

  // 6.1 庄家高赔诱盘警报 (TRAP_HIGH_ODDS_WARNING): 绝对禁止 A 级，置信度上限 80
  if (quantRiskFlags.includes(QuantAlert.TRAP_HIGH_ODDS_WARNING)) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
    }
    additionalWarnings.push("SYSTEM HARD GATE: 触发 Layer 03 庄家高赔诱盘警报 (TRAP_HIGH_ODDS)，强制降为 B 级防守");
    if (enforcedConfidence > 80) {
      enforcedConfidence = 80;
      additionalWarnings.push("SYSTEM HARD GATE: 存在诱盘风险，置信度强制封顶 80 分");
    }
  }

  // 6.2 虚假繁荣假控球警报 (BARREN_DOMINANCE_WARNING): 剥夺 A 级，且纠正战术态势判定 (P1-05)
  if (quantRiskFlags.includes(QuantAlert.BARREN_DOMINANCE_WARNING)) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
    }
    additionalWarnings.push("SYSTEM HARD GATE: 触发 Layer 03 假控球警报 (BARREN_DOMINANCE)，剥夺 A 级资格降为 B 级");
    if (result.blind_spot_analysis && result.blind_spot_analysis.tactical_regime_evaluation === 'GENUINE_DOMINANCE') {
      result.blind_spot_analysis.tactical_regime_evaluation = TacticalRegimeEvaluation.BARREN_DOMINANCE;
      additionalWarnings.push("SYSTEM HARD GATE: 修正战术态势为 BARREN_DOMINANCE (无实质威胁虚假控球)");
    }
  }

  // 6.3 红牌战术失衡警报 (RED_CARD_TACTICAL_COLLAPSE): 存在红牌少打多时，最高封顶 B 级
  if (quantRiskFlags.includes(QuantAlert.RED_CARD_TACTICAL_COLLAPSE)) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
    }
    additionalWarnings.push("SYSTEM HARD GATE: 红牌受损场景战术失衡，强制封顶 B 级");
    additionalWarnings.push("SYSTEM QUANT WARNING: 存在红牌战术失衡 (RED_CARD_TACTICAL_COLLAPSE)，严防防线崩溃风险");
  }

  // Step 5, 10, 11: 四分之一盘五态真实结算及滚球已结算盘口审查 (P0-01, P0-02, P0-03, P0-04, P1-04, P1-12)
  const auditedRecommendedLegs: typeof result.recommended_legs = [];

  // P0-01: 实际盘口结构强制优先于 metadata is_quarter_line
  const rawIsQuarter = result.market_scan?.is_quarter_line ?? false;
  const isScanQuarter = isQuarterOrSplitLine(result.market_scan?.selected_line) || rawIsQuarter;

  let quarterLineUnverifiable = false;
  if (isScanQuarter) {
    const qDist = result.market_scan?.quarter_line_settlement_distribution;
    const all5Present = qDist &&
      typeof qDist.p_full_win === 'number' && !isNaN(qDist.p_full_win) &&
      typeof qDist.p_half_win === 'number' && !isNaN(qDist.p_half_win) &&
      typeof qDist.p_push === 'number' && !isNaN(qDist.p_push) &&
      typeof qDist.p_half_loss === 'number' && !isNaN(qDist.p_half_loss) &&
      typeof qDist.p_full_loss === 'number' && !isNaN(qDist.p_full_loss);
    
    const sumProb = all5Present ? (qDist.p_full_win + qDist.p_half_win + qDist.p_push + qDist.p_half_loss + qDist.p_full_loss) : 0;
    const sumValid = all5Present && Math.abs(sumProb - 1.0) <= 0.005;

    if (!all5Present || !sumValid || qDist?.settlement_status === 'SETTLEMENT_UNVERIFIABLE') {
      quarterLineUnverifiable = true;
      additionalWarnings.push(`SYSTEM HARD GATE (P0-03 / P0-04): 四分之一盘 ${result.market_scan?.selected_line} 缺乏完整五态真实结算分布(∑P=1.0)或标记为 SETTLEMENT_UNVERIFIABLE，禁止参与排序与推荐 (INVALID FOR VALUE RANKING)`);
    }
  }

  for (const leg of result.recommended_legs) {
    let legDisallowed = false;

    // 滚球大小球已结清审查 (P1-04, P1-12)
    if (isLiveMatch && (leg.market === 'TOTAL_GOALS_MAIN' || leg.market === 'TOTAL_GOALS_SECONDARY')) {
      const lineNum = parseFloat(String(leg.selected_line).split('/')[0]);
      if (!isNaN(lineNum) && lineNum <= currentTotalGoals) {
        legDisallowed = true;
        additionalWarnings.push(`SYSTEM HARD GATE (P1-04 / P1-12): 盘口 ${leg.selected_line} 进球数已达到或超过盘口线 (已进${currentTotalGoals}球)，已产生数学事实结算 (mathematically_closed)，禁止作为未来概率预测推荐`);
      }
    }

    // 四分之一盘识别与五态分布 MAO 审查 (P0-01, P0-02, P0-03, P0-04)
    const legIsQuarter = isQuarterOrSplitLine(leg.selected_line);
    if (legIsQuarter) {
      if (quarterLineUnverifiable || (result.market_scan?.selected_line === leg.selected_line && quarterLineUnverifiable)) {
        legDisallowed = true;
        additionalWarnings.push(`SYSTEM HARD GATE (P0-03 / P0-04): 四分之一盘 ${leg.selected_line} 缺乏完整五态真实结算分布支撑，禁止推荐`);
      } else if (result.market_scan) {
        const qDist = result.market_scan?.quarter_line_settlement_distribution;
        if (!qDist || qDist.settlement_status === 'SETTLEMENT_UNVERIFIABLE' || qDist.p_full_win === undefined) {
          legDisallowed = true;
          additionalWarnings.push(`SYSTEM HARD GATE (P0-02 / P0-04): 四分之一盘 ${leg.selected_line} 的 MAO 必须基于五态真实结算分布计算期望收益，缺乏五态分布禁止推荐`);
        }
      }
    }

    // MAO 科学来源审查 (P0-02, P0-03)
    if (!leg.minimum_acceptable_odds || leg.minimum_acceptable_odds <= 1 || isNaN(leg.minimum_acceptable_odds) || leg.current_odds < leg.minimum_acceptable_odds) {
      legDisallowed = true;
      additionalWarnings.push(`SYSTEM HARD GATE (P0-02 / P0-03): 推荐项 ${leg.selected_line} 赔率(${leg.current_odds})低于最低可接受赔率(MAO=${leg.minimum_acceptable_odds})或缺乏有效MAO，禁止推荐`);
    }

    if (!legDisallowed) {
      auditedRecommendedLegs.push(leg);
    }
  }

  const actionableGrade = enforcedGrade === RecommendationGrade.A_GRADE ||
    enforcedGrade === RecommendationGrade.B_GRADE;
  const finalRecommendedLegs = actionableGrade && enforcedConfidence >= 70
    ? auditedRecommendedLegs
    : [];

  // Step 14: 规范化 market_scan 结构同步与三态解耦 (P0-04, P1-12)
  let synchronizedMarketScan = result.market_scan;
  if (synchronizedMarketScan) {
    const isQuarter = isQuarterOrSplitLine(synchronizedMarketScan.selected_line) || synchronizedMarketScan.is_quarter_line;
    synchronizedMarketScan.is_quarter_line = isQuarter;

    let scanMathematicallyClosed = false;
    if (isLiveMatch && (synchronizedMarketScan.market === 'TOTAL_GOALS_MAIN' || synchronizedMarketScan.market === 'TOTAL_GOALS_SECONDARY')) {
      const lineNum = parseFloat(String(synchronizedMarketScan.selected_line).split('/')[0]);
      if (!isNaN(lineNum) && lineNum <= currentTotalGoals) {
        scanMathematicallyClosed = true;
        synchronizedMarketScan.mathematically_closed = true;
      }
    }

    // P1-01 / P0-04: 无有效市场时的合法 NONE 状态
    const isNoValidMarket = synchronizedMarketScan.market === 'NONE' || synchronizedMarketScan.selected_line === 'NONE' || synchronizedMarketScan.selected_line === '';
    const fallbackSignal = findFirstLegallyVerifiableSignal(
      payload.quant_features?.raw_mathematical_ev_signals ?? [],
      currentTotalGoals,
      isLiveMatch
    );

    if (isNoValidMarket && fallbackSignal) {
      // 规则 2 纠正：有效盘口被执行门禁阻止时，不得写成 market = NONE，必须保留最佳扫描盘口并标记 VALID_BUT_BLOCKED
      const hasEngineEv = typeof (fallbackSignal as any).risk_adjusted_ev === 'number';
      synchronizedMarketScan = {
        ...synchronizedMarketScan,
        market: fallbackSignal.market,
        selected_line: String(fallbackSignal.line),
        direction: (fallbackSignal.side ?? 'HOME').toUpperCase() as any,
        current_odds: fallbackSignal.odds ?? 0,
        minimum_acceptable_odds: 0,
        raw_ev: fallbackSignal.ev ?? 0,
        risk_adjusted_ev: hasEngineEv ? (fallbackSignal as any).risk_adjusted_ev : 0,
        risk_adjustment_status: hasEngineEv ? 'ENGINE_PROVIDED' : 'QUALITATIVE_ONLY',
        actionable: false,
        market_status: 'VALID_BUT_BLOCKED',
        rejection_reason: synchronizedMarketScan.rejection_reason && synchronizedMarketScan.rejection_reason !== 'NO VALID MARKET'
          ? synchronizedMarketScan.rejection_reason
          : `VALID_BUT_BLOCKED: Valid scanned line exists but blocked by execution gates (Grade=${enforcedGrade}, Conf=${enforcedConfidence})`
      };
    } else if (isNoValidMarket) {
      synchronizedMarketScan = {
        ...synchronizedMarketScan,
        market: 'NONE',
        selected_line: 'NONE',
        direction: 'NONE',
        market_status: 'NO_VALID_MARKET',
        current_odds: 0,
        minimum_acceptable_odds: 0,
        raw_ev: 0,
        risk_adjusted_ev: 0,
        risk_adjustment_status: 'QUALITATIVE_ONLY',
        actionable: false,
        rejection_reason: synchronizedMarketScan.rejection_reason || 'NO VALID MARKET: No legally verifiable open lines pass baseline gates'
      };
    } else if (isQuarter && quarterLineUnverifiable) {
      synchronizedMarketScan = {
        ...synchronizedMarketScan,
        market_status: 'VALID_BUT_BLOCKED',
        actionable: false,
        rejection_reason: "UNVERIFIABLE QUARTER LINE: INVALID FOR VALUE RANKING",
        quarter_line_settlement_distribution: {
          ...synchronizedMarketScan.quarter_line_settlement_distribution,
          settlement_status: 'SETTLEMENT_UNVERIFIABLE'
        }
      };
    } else if (scanMathematicallyClosed) {
      synchronizedMarketScan = {
        ...synchronizedMarketScan,
        market_status: 'VALID_BUT_BLOCKED',
        actionable: false,
        mathematically_closed: true,
        rejection_reason: `MATHEMATICALLY_CLOSED: Match total (${currentTotalGoals}) already reached or exceeded line (${synchronizedMarketScan.selected_line})`
      };
    } else {
      const isActuallyActionable = finalRecommendedLegs.length > 0 &&
        (enforcedGrade === RecommendationGrade.A_GRADE || enforcedGrade === RecommendationGrade.B_GRADE) &&
        enforcedConfidence >= 70 &&
        candidateState === 'PRODUCTION_UNLOCKED';

      const blockerReason = !isActuallyActionable
        ? (synchronizedMarketScan.rejection_reason && synchronizedMarketScan.rejection_reason !== 'N/A'
            ? synchronizedMarketScan.rejection_reason
            : `GATED_BY_EXECUTION: Grade=${enforcedGrade}, Conf=${enforcedConfidence}, CandidateState=${candidateState}`)
        : 'N/A';

      synchronizedMarketScan = {
        ...synchronizedMarketScan,
        actionable: isActuallyActionable,
        market_status: isActuallyActionable ? 'ACTIONABLE' : 'VALID_BUT_BLOCKED',
        rejection_reason: blockerReason
      };
    }

    // P1-04: Engine-Provided risk_adjusted_ev 必须拥有绝对优先级
    const candidateSignal = (payload.quant_features?.machine_candidate_signals ?? []).find(
      c => String(c.line) === String(synchronizedMarketScan?.selected_line) && c.market === synchronizedMarketScan?.market
    );
    const engineEvVal = (candidateSignal && typeof (candidateSignal as any).risk_adjusted_ev === 'number')
      ? (candidateSignal as any).risk_adjusted_ev
      : (typeof (payload.quant_features as any)?.risk_adjusted_ev === 'number' ? (payload.quant_features as any).risk_adjusted_ev : null);

    if (engineEvVal !== null) {
      synchronizedMarketScan.risk_adjustment_status = 'ENGINE_PROVIDED';
      synchronizedMarketScan.risk_adjusted_ev = engineEvVal;
    } else {
      synchronizedMarketScan.risk_adjustment_status = 'QUALITATIVE_ONLY';
      if (synchronizedMarketScan.risk_adjusted_ev !== 0) {
        synchronizedMarketScan.risk_adjusted_ev = 0;
        additionalWarnings.push("SYSTEM QUANT WARNING (P1-02 / P1-04): QUALITATIVE_ONLY 状态下禁止伪造精确 risk_adjusted_ev，数值已强制重置为 0");
      }
    }
  }

  return {
    ...result,
    grade: enforcedGrade,
    confidence_score: enforcedConfidence,
    market_scan: synchronizedMarketScan,
    risk_warnings: [
      ...result.risk_warnings,
      ...additionalWarnings,
      ...(!actionableGrade || enforcedConfidence < 70
        ? ['SYSTEM HARD GATE: 非 A/B 级或置信度低于 70，正式推荐腿已清空']
        : [])
    ],
    recommended_legs: finalRecommendedLegs
  };
}

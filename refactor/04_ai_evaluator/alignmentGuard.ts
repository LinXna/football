import { AiEvaluationResult, EvaluatorPayload } from './types.js';
import { RecommendationGrade, TacticalRegimeEvaluation } from './enums.js';
import { QuantAlert } from '../03_quant_engine/enums.js';
import { parseAsianHandicapLine } from '../03_quant_engine/devigCalculator.js';

/**
 * Parses Asian handicap lines into a unified float using the SSOT parseAsianHandicapLine.
 * Matches: "-0.25", "-0/0.5", "0/-0.5", "2/2.5", "+0.5/1", "-0.5/-1", etc.
 * Preserves correct sign without inversion.
 */
export function parseHandicapToFloat(line: string | number): number | null {
  if (line === null || line === undefined) return null;
  const s = String(line).trim();
  if (!s) return null;
  const val = parseAsianHandicapLine(s);
  return isNaN(val) ? null : val;
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
  const isColdStart = payload.quant_features?.candidate_pipeline?.state === 'COLD_START_PERMISSIVE';
  const candidates = isColdStart
    ? [
        ...(payload.quant_features?.machine_candidate_signals ?? []),
        ...(payload.quant_features?.research_candidate_signals ?? [])
      ]
    : (payload.quant_features?.machine_candidate_signals ?? []);
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

  // Hard Layer 03 authorization boundary: locked states (OOS_LOCKED, DATA_LOCKED, NO_POSITIVE_EV)
  // may be evaluated for research, but can never carry actionable AI legs or an A/B recommendation grade downstream.
  // Note: COLD_START_PERMISSIVE is a managed sample-accumulation track that unlocks B-grade small-stake bets under OOS_COLD_START_EXEMPT.
  if (candidateState === 'OOS_LOCKED' || candidateState === 'DATA_LOCKED' || candidateState === 'NO_POSITIVE_EV') {
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

    const checkAhMatch = (sm: any): boolean => {
      if (!sm) return false;
      const homeLine = parseHandicapToFloat(sm.handicap ?? sm.home_selection ?? '');
      const awayLine = sm.away_selection
        ? parseHandicapToFloat(sm.away_selection)
        : (homeLine !== null ? -homeLine : null);

      if (leg.direction === 'HOME' && homeLine !== null && aiLine !== null && Math.abs(aiLine - homeLine) < 0.001) {
        if (Math.abs(leg.current_odds - sm.home_odds) < 0.02) return true;
      }
      if (leg.direction === 'AWAY') {
        // 允许真实客队盘口 (负于主盘) 或兼容模式校验，且校验客队赔率
        if (awayLine !== null && aiLine !== null && Math.abs(aiLine - awayLine) < 0.001) {
          if (Math.abs(leg.current_odds - sm.away_odds) < 0.02) return true;
        }
        if (homeLine !== null && aiLine !== null && Math.abs(aiLine - homeLine) < 0.001) {
          if (Math.abs(leg.current_odds - sm.away_odds) < 0.02) return true;
        }
      }
      return false;
    };

    const checkOuMatch = (sm: any): boolean => {
      if (!sm) return false;
      const statLine = parseHandicapToFloat(sm.handicap ?? sm.line ?? '');
      if (statLine !== null && aiLine !== null && Math.abs(aiLine - statLine) < 0.001) {
        if (
          (leg.direction === 'OVER' && Math.abs(leg.current_odds - sm.over_odds) < 0.02) ||
          (leg.direction === 'UNDER' && Math.abs(leg.current_odds - sm.under_odds) < 0.02)
        ) {
          return true;
        }
      }
      return false;
    };

    if (leg.market === 'ASIAN_HANDICAP_MAIN' && statutoryMarkets.ah_main) {
      isValid = checkAhMatch(statutoryMarkets.ah_main);
    } else if (leg.market === 'ASIAN_HANDICAP_SECONDARY' && statutoryMarkets.ah_secondary) {
      const subs = Array.isArray(statutoryMarkets.ah_secondary) ? statutoryMarkets.ah_secondary : [statutoryMarkets.ah_secondary];
      isValid = subs.some(checkAhMatch);
    } else if (leg.market === 'TOTAL_GOALS_MAIN' && statutoryMarkets.ou_main) {
      isValid = checkOuMatch(statutoryMarkets.ou_main);
    } else if (leg.market === 'TOTAL_GOALS_SECONDARY' && statutoryMarkets.ou_secondary) {
      const subs = Array.isArray(statutoryMarkets.ou_secondary) ? statutoryMarkets.ou_secondary : [statutoryMarkets.ou_secondary];
      isValid = subs.some(checkOuMatch);
    } else if (leg.market === 'EURO_1X2' && statutoryMarkets.euro_1x2) {
      const sm = statutoryMarkets.euro_1x2 as any;
      const homeVal = sm.home_win ?? sm.home_odds ?? sm.home_win_odds ?? sm.home;
      const drawVal = sm.draw ?? sm.draw_odds ?? sm.draw_win_odds;
      const awayVal = sm.away_win ?? sm.away_odds ?? sm.away_win_odds ?? sm.away;
      if (
        (leg.direction === 'HOME' && typeof homeVal === 'number' && Math.abs(leg.current_odds - homeVal) < 0.02) ||
        (leg.direction === 'DRAW' && typeof drawVal === 'number' && Math.abs(leg.current_odds - drawVal) < 0.02) ||
        (leg.direction === 'AWAY' && typeof awayVal === 'number' && Math.abs(leg.current_odds - awayVal) < 0.02)
      ) {
        isValid = true;
      }
    } else if (leg.market === 'ASIAN_HANDICAP_HALF' && statutoryMarkets.ah_half) {
      isValid = checkAhMatch(statutoryMarkets.ah_half);
    } else if (leg.market === 'TOTAL_GOALS_HALF' && statutoryMarkets.ou_half) {
      isValid = checkOuMatch(statutoryMarkets.ou_half);
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

  // Step 4: OOS 语义与样本量硬门禁 (P0-01) 及两阶段隔离熔断 (方案 5)
  const oosStatus = payload.quant_features?.oos_semantic_status;
  const oosProfileStatus = oosStatus?.profile_status ?? 'NO_PROFILE';
  const oosEss = oosStatus?.effective_sample_size ?? 0;
  const isCircuitBroken = Boolean(oosStatus?.is_circuit_broken) || oosProfileStatus === 'REJECTED';

  if (isCircuitBroken) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
    }
    if (enforcedConfidence > 75) {
      enforcedConfidence = 75;
    }
    additionalWarnings.push(
      `SYSTEM HARD GATE (方案 5 隔离与熔断): OOS 校准档案触发降级熔断 (${oosStatus?.circuit_breaker_reason ?? 'Brier 得分劣化或跨阶段污染'})，严禁 A 级推荐，置信度封顶 75 分。`
    );
  }

  // P0-01 统一标准定义: OOS_VALIDATED = (profile_status == "VALIDATED") AND (effective_sample_size >= 30) AND (!isCircuitBroken)
  const isOosValidated = (oosProfileStatus === 'VALIDATED') && (oosEss >= 30) && !isCircuitBroken;
  if (!isOosValidated && enforcedGrade === RecommendationGrade.A_GRADE) {
    enforcedGrade = RecommendationGrade.B_GRADE;
    enforcedConfidence = Math.min(enforcedConfidence, 80);
    additionalWarnings.push(`SYSTEM HARD GATE (P0-01): OOS处于 ${oosProfileStatus} 且有效样本量为 ${oosEss} (<30)，OOS_VALIDATED=false，禁止 A_GRADE，强制降为 B_GRADE 试探评级`);
  }

  // P1 解耦核心门禁 (Task 1.1): COLD_START_PERMISSIVE 冷启动样本积累期风控约束
  const isColdStartPermissive = candidateState === 'COLD_START_PERMISSIVE';
  if (isColdStartPermissive) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
      additionalWarnings.push(
        "SYSTEM COLD-START GATE (Task 1.1): 盘口处于冷启动样本积累期 (OOS_COLD_START_EXEMPT)，严禁 A 级重仓，强制降级为 B 级试探评级。"
      );
    }
    if (enforcedConfidence > 79) {
      enforcedConfidence = 79;
      additionalWarnings.push(
        "SYSTEM COLD-START GATE (Task 1.1): 冷启动样本积累期置信度强制封顶 79 分 (B 级试水上限)。"
      );
    }
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

  // Step 7: 全赛事首发硬门禁与友谊赛特殊风控门禁
  const league = payload.ai_brief.league ?? '';
  const isFriendly = /友谊|friendly|球会友谊/i.test(league);
  const isCup = /杯|Cup|copa|pokal|coupe/i.test(league);
  const isCupOrFriendly = isCup || isFriendly;
  const lineupNotConfirmed = !payload.lineup_value_matrix ||
    typeof payload.lineup_value_matrix === 'string' ||
    !payload.lineup_value_matrix.is_lineup_confirmed;

  if (lineupNotConfirmed) {
    if (enforcedGrade === RecommendationGrade.A_GRADE || enforcedGrade === RecommendationGrade.B_GRADE) {
      enforcedGrade = RecommendationGrade.C_GRADE;
      if (isCupOrFriendly) {
        additionalWarnings.push("SYSTEM HARD GATE: 杯赛/友谊赛官方首发未确认，最高维持 C 级观察");
      }
      additionalWarnings.push("SYSTEM HARD GATE: 官方首发名单未确认(NOT_ANNOUNCED)，全赛事统一强制封顶 C_GRADE 观察，禁止进入正式推荐与串关");
    }
    if (enforcedConfidence > 70) {
      enforcedConfidence = 70;
      additionalWarnings.push("SYSTEM HARD GATE: 官方首发名单未确认，置信度强制封顶 70 分");
    }
  } else if (isFriendly) {
    // 首发官宣确认、主力出战明确的优质友谊赛：最高放行至稳健 B_GRADE，坚决不给 A_GRADE 重仓，强制打上 FRIENDLY_HIGH_ROTATION_RISK
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
      additionalWarnings.push("SYSTEM HARD GATE: 友谊赛性质特殊存在换人轮换风险，严禁 A_GRADE 重仓，强制封顶 B_GRADE");
    }
    if (enforcedConfidence > 80) {
      enforcedConfidence = 80;
      additionalWarnings.push("SYSTEM HARD GATE: 友谊赛置信度强制封顶 80 分");
    }
    if (!additionalWarnings.includes(QuantAlert.FRIENDLY_HIGH_ROTATION_RISK)) {
      additionalWarnings.push(QuantAlert.FRIENDLY_HIGH_ROTATION_RISK);
    }
    additionalWarnings.push("RISK_ALERT: [FRIENDLY_HIGH_ROTATION_RISK] 友谊赛换人名额宽泛且战意波动大，谨防下半场大面积轮换风险");
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

  // 6.4 连续受迫失位防线失控崩盘警报 (COLLAPSING_PANIC_WARNING): 防线体能/心态崩溃，禁止 A_GRADE，置信度上限 75
  if (quantRiskFlags.includes(QuantAlert.COLLAPSING_PANIC_WARNING)) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
    }
    additionalWarnings.push("SYSTEM HARD GATE: 触发 Layer 03 连续受迫失位防线失控崩盘警报 (COLLAPSING_PANIC_WARNING)，剥夺 A 级重仓资格降为 B 级试探");
    if (enforcedConfidence > 75) {
      enforcedConfidence = 75;
      additionalWarnings.push("SYSTEM HARD GATE: 防线存在崩盘风险，置信度强制封顶 75 分");
    }
  }

  // 6.5 中场绞杀密集阻断警报 (MIDFIELD_GRIDLOCK_WARNING): 空间受压，全场大球禁止出 A 级，置信度上限 80
  if (quantRiskFlags.includes(QuantAlert.MIDFIELD_GRIDLOCK_WARNING)) {
    const isRecommendedOver = result.recommended_legs.some(
      leg => (leg.market.includes('TOTAL') || leg.market.includes('OU') || leg.direction === 'OVER') && leg.direction === 'OVER'
    );
    const isScanOver = (result.market_scan?.market?.includes('TOTAL') || result.market_scan?.market?.includes('OU') || result.market_scan?.direction === 'OVER') &&
      result.market_scan?.direction === 'OVER';

    if (isRecommendedOver || isScanOver) {
      if (enforcedGrade === RecommendationGrade.A_GRADE) {
        enforcedGrade = RecommendationGrade.B_GRADE;
      }
      additionalWarnings.push("SYSTEM HARD GATE: 触发 Layer 03 中场绞杀密集警报 (MIDFIELD_GRIDLOCK_WARNING)，全场大球 (OVER) 缺乏穿透空间，最高评级限缩在 B 级以下，禁止 A 级重仓");
      if (enforcedConfidence > 80) {
        enforcedConfidence = 80;
        additionalWarnings.push("SYSTEM HARD GATE: 中场空间受阻，大球方向置信度强制封顶 80 分");
      }
    }
  }

  // 6.6 边肋防线大空档暴露警报 (WING_DEFENSE_EXPOSURE): 推荐受让下盘且暴露空档、未见防守补强时，禁止出 A 级
  const formation = payload.quant_features?.tactical_formation;
  const homeWingExposed = (formation?.wing_space_vulnerability_home ?? 0) > 0.40;
  const awayWingExposed = (formation?.wing_space_vulnerability_away ?? 0) > 0.40;
  const anyWingExposed = quantRiskFlags.includes(QuantAlert.WING_DEFENSE_EXPOSURE) || homeWingExposed || awayWingExposed;

  if (anyWingExposed) {
    const checkUnderdogExposure = (
      market: string | undefined,
      direction: string | undefined,
      selectedLine: string | undefined
    ): { isUnderdogExposed: boolean; exposedTeam: 'HOME' | 'AWAY' | null } => {
      if (!market || !direction) return { isUnderdogExposed: false, exposedTeam: null };
      const isSpread = market.includes('HANDICAP') || market.includes('SPREAD') || market.includes('AH');
      if (!isSpread) return { isUnderdogExposed: false, exposedTeam: null };

      const lineVal = parseHandicapToFloat(selectedLine ?? '');
      const statAh = statutoryMarkets?.ah_main;
      const statHomeLine = statAh ? parseHandicapToFloat(statAh.handicap ?? statAh.home_selection ?? '') : null;

      if (direction === 'HOME') {
        const isHomeUnderdog = (lineVal !== null && lineVal > 0) || (statHomeLine !== null && statHomeLine > 0);
        if (isHomeUnderdog) {
          const isExposed = homeWingExposed || (anyWingExposed && !awayWingExposed);
          if (isExposed) return { isUnderdogExposed: true, exposedTeam: 'HOME' };
        }
      } else if (direction === 'AWAY') {
        const statAwayLine = statAh?.away_selection ? parseHandicapToFloat(statAh.away_selection) : null;
        const isAwayUnderdog = (statAwayLine !== null && statAwayLine > 0) ||
                               (statHomeLine !== null && statHomeLine < 0) ||
                               (lineVal !== null && lineVal > 0);
        if (isAwayUnderdog) {
          const isExposed = awayWingExposed || (anyWingExposed && !homeWingExposed);
          if (isExposed) return { isUnderdogExposed: true, exposedTeam: 'AWAY' };
        }
      }
      return { isUnderdogExposed: false, exposedTeam: null };
    };

    let underdogExposedMatch = false;
    let underdogExposedTeam: 'HOME' | 'AWAY' | null = null;

    for (const leg of result.recommended_legs) {
      const check = checkUnderdogExposure(leg.market, leg.direction, leg.selected_line);
      if (check.isUnderdogExposed) {
        underdogExposedMatch = true;
        underdogExposedTeam = check.exposedTeam;
        break;
      }
    }

    if (!underdogExposedMatch && result.market_scan) {
      const check = checkUnderdogExposure(
        result.market_scan.market,
        result.market_scan.direction,
        result.market_scan.selected_line
      );
      if (check.isUnderdogExposed) {
        underdogExposedMatch = true;
        underdogExposedTeam = check.exposedTeam;
      }
    }

    if (underdogExposedMatch) {
      const textCorpus = [
        result.internal_logical_audit,
        result.qualitative_summary,
        result.blind_spot_analysis?.['2_asian_handicap_reality'],
        ...(result.recommended_legs?.map(l => l.basis) ?? [])
      ].filter(Boolean).join(' ').toLowerCase();

      const hasDefensiveReinforcement =
        textCorpus.includes('防守补强') ||
        textCorpus.includes('针对性防守') ||
        textCorpus.includes('defensive reinforcement') ||
        textCorpus.includes('tactical defensive cover') ||
        textCorpus.includes('五后卫补强');

      if (!hasDefensiveReinforcement) {
        if (enforcedGrade === RecommendationGrade.A_GRADE) {
          enforcedGrade = RecommendationGrade.B_GRADE;
        }
        additionalWarnings.push(
          `SYSTEM HARD GATE: 推荐方向为受让下盘 (${underdogExposedTeam ?? '受让方'}) 且该队触发边肋防线大空档暴露警报 (WING_DEFENSE_EXPOSURE)，在未见针对性防守补强场景下，最高评级限缩在 B 级以下，禁止 A 级重仓`
        );
        if (enforcedConfidence > 80) {
          enforcedConfidence = 80;
          additionalWarnings.push("SYSTEM HARD GATE: 受让方边肋防守高危，置信度强制封顶 80 分");
        }
      }
    }
  }

  // Step 5, 10, 11: 四分之一盘五态真实结算及滚球已结算盘口审查 (P0-01, P0-02, P0-03, P0-04, P1-04, P1-12)
  const auditedRecommendedLegs: typeof result.recommended_legs = [];

  // P0-01: 实际盘口结构强制优先于 metadata is_quarter_line
  const rawIsQuarter = result.market_scan?.is_quarter_line ?? false;
  const isScanQuarter = isQuarterOrSplitLine(result.market_scan?.selected_line) || rawIsQuarter;

  // 辅助函数：根据盘口线和方向，从量化引擎全量主副盘评估中检索五态结算分布
  const resolveQuarterDistFromDevig = (selectedLineStr: string, directionStr?: string) => {
    if (!payload.quant_features?.devig || !selectedLineStr) return undefined;
    const targetLineNum = parseAsianHandicapLine(selectedLineStr);
    const isTotalMarket = result.market_scan?.market?.includes('TOTAL') || directionStr === 'OVER' || directionStr === 'UNDER';

    if (isTotalMarket) {
      const allTotals = [
        payload.quant_features.devig.total_main_ev,
        ...(payload.quant_features.devig.total_secondary_ev ?? [])
      ].filter(Boolean);
      for (const t of allTotals) {
        if (t && Math.abs(parseAsianHandicapLine(t.line) - targetLineNum) < 1e-4) {
          const sideDist = directionStr === 'UNDER' ? t.under_settlement_distribution : t.over_settlement_distribution;
          if (sideDist) {
            return {
              p_full_win: sideDist.p_full_win,
              p_half_win: sideDist.p_half_win,
              p_push: sideDist.p_push,
              p_half_loss: sideDist.p_half_loss,
              p_full_loss: sideDist.p_full_loss,
              settlement_status: 'VERIFIED' as const
            };
          }
        }
      }
    } else {
      const allSpreads = [
        payload.quant_features.devig.spread_main_ev,
        ...(payload.quant_features.devig.spread_secondary_ev ?? [])
      ].filter(Boolean);
      for (const s of allSpreads) {
        if (s && Math.abs(parseAsianHandicapLine(s.line) - targetLineNum) < 1e-4) {
          const sideDist = directionStr === 'AWAY' ? s.away_settlement_distribution : s.home_settlement_distribution;
          if (sideDist) {
            return {
              p_full_win: sideDist.p_full_win,
              p_half_win: sideDist.p_half_win,
              p_push: sideDist.p_push,
              p_half_loss: sideDist.p_half_loss,
              p_full_loss: sideDist.p_full_loss,
              settlement_status: 'VERIFIED' as const
            };
          }
        }
      }
    }
    return undefined;
  };

  let quarterLineUnverifiable = false;
  if (isScanQuarter) {
    let qDist = result.market_scan?.quarter_line_settlement_distribution;
    if (!qDist || typeof qDist.p_full_win !== 'number') {
      const recovered = resolveQuarterDistFromDevig(result.market_scan?.selected_line ?? '', result.market_scan?.direction);
      if (recovered) {
        qDist = recovered;
        if (result.market_scan) {
          result.market_scan.quarter_line_settlement_distribution = recovered;
        }
      }
    }

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
      const lineNum = parseAsianHandicapLine(leg.selected_line);
      if (!isNaN(lineNum) && lineNum <= currentTotalGoals) {
        legDisallowed = true;
        additionalWarnings.push(`SYSTEM HARD GATE (P1-04 / P1-12): 盘口 ${leg.selected_line} 进球数已达到或超过盘口线 (已进${currentTotalGoals}球)，已产生数学事实结算 (mathematically_closed)，禁止作为未来概率预测推荐`);
      }
    }

    // 四分之一盘识别与五态分布 MAO 审查 (P0-01, P0-02, P0-03, P0-04)
    const legIsQuarter = isQuarterOrSplitLine(leg.selected_line);
    if (legIsQuarter) {
      // 尝试自愈该腿对应的五态分布
      let legQDist = result.market_scan?.quarter_line_settlement_distribution;
      if (!legQDist || legQDist.settlement_status === 'SETTLEMENT_UNVERIFIABLE' || legQDist.p_full_win === undefined) {
        legQDist = resolveQuarterDistFromDevig(leg.selected_line, leg.selection);
        if (legQDist && result.market_scan && result.market_scan.selected_line === leg.selected_line) {
          result.market_scan.quarter_line_settlement_distribution = legQDist;
        }
      }

      if (quarterLineUnverifiable && (!legQDist || legQDist.settlement_status === 'SETTLEMENT_UNVERIFIABLE')) {
        legDisallowed = true;
        additionalWarnings.push(`SYSTEM HARD GATE (P0-03 / P0-04): 四分之一盘 ${leg.selected_line} 缺乏完整五态真实结算分布支撑，禁止推荐`);
      } else if (!legQDist || legQDist.settlement_status === 'SETTLEMENT_UNVERIFIABLE' || legQDist.p_full_win === undefined) {
        legDisallowed = true;
        additionalWarnings.push(`SYSTEM HARD GATE (P0-02 / P0-04): 四分之一盘 ${leg.selected_line} 的 MAO 必须基于五态真实结算分布计算期望收益，缺乏五态分布禁止推荐`);
      }
    }

    // MAO 科学来源审查 (P0-02, P0-03)
    if (!leg.minimum_acceptable_odds || leg.minimum_acceptable_odds <= 1 || isNaN(leg.minimum_acceptable_odds) || leg.current_odds < leg.minimum_acceptable_odds) {
      legDisallowed = true;
      additionalWarnings.push(`SYSTEM HARD GATE (P0-02 / P0-03): 推荐项 ${leg.selected_line} 赔率(${leg.current_odds})低于最低可接受赔率(MAO=${leg.minimum_acceptable_odds})或缺乏有效MAO，禁止推荐`);
    }

    if (!legDisallowed) {
      const legOosStatus = isColdStartPermissive
        ? ('OOS_COLD_START_EXEMPT' as const)
        : (leg.oos_status ?? ('PRODUCTION_MATURE' as const));
      auditedRecommendedLegs.push({
        ...leg,
        oos_status: legOosStatus
      });
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
        (candidateState === 'PRODUCTION_UNLOCKED' || (isColdStartPermissive && enforcedGrade === RecommendationGrade.B_GRADE));

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

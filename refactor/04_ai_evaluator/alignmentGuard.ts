import { AiEvaluationResult, EvaluatorPayload } from './types.js';
import { RecommendationGrade } from './enums.js';
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
 * Alignment Guard: Prevents AI hallucination of betting markets and odds.
 * Also enforces strict system-level risk overrides (Data Blind-Spot, Unverified Score).
 */
export function verifyStatutoryAlignment(result: AiEvaluationResult, payload: EvaluatorPayload): AiEvaluationResult {
  if (result.grade === RecommendationGrade.REJECTED || result.recommended_legs.length === 0) {
    return result; 
  }

  const statutoryMarkets = payload.ai_brief.core_markets || {};
  let hasHallucination = false;
  let hallucinationReason = '';

  for (const leg of result.recommended_legs) {
    let isValid = false;
    const aiLine = parseHandicapToFloat(leg.selected_line);

    if (aiLine === null && leg.market !== 'EURO_1X2') {
      hasHallucination = true;
      hallucinationReason = `AI generated unparseable line: ${leg.selected_line}`;
      break;
    }

    if (leg.market === 'ASIAN_HANDICAP_MAIN' && statutoryMarkets.ah_main) {
      const sm = statutoryMarkets.ah_main;
      const statLine = parseHandicapToFloat(sm.handicap);
      
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
      const statLine = parseHandicapToFloat(sm.handicap);
      
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
        (leg.direction === 'HOME' && Math.abs(leg.current_odds - sm.home_win) < 0.02) ||
        (leg.direction === 'DRAW' && Math.abs(leg.current_odds - sm.draw) < 0.02) ||
        (leg.direction === 'AWAY' && Math.abs(leg.current_odds - sm.away_win) < 0.02)
      ) {
        isValid = true;
      }
    } else if (leg.market === 'ASIAN_HANDICAP_HALF' && statutoryMarkets.ah_half) {
      const sm = statutoryMarkets.ah_half;
      const statLine = parseHandicapToFloat(sm.handicap);
      
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
      const statLine = parseHandicapToFloat(sm.handicap);
      
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
  let enforcedConfidence = result.confidence_score;
  const additionalWarnings: string[] = [];

  // 1. 比分未经校验时：绝对不得给 A 级推荐
  const isScoreVerified = payload.ai_brief.score_verification?.is_verified ?? true;
  if (!isScoreVerified && enforcedGrade === RecommendationGrade.A_GRADE) {
    enforcedGrade = RecommendationGrade.B_GRADE;
    enforcedConfidence = Math.min(enforcedConfidence, 85);
    additionalWarnings.push("SYSTEM HARD GATE: 比分未经交叉校验，强制撤销 A 级资格降为 B 级");
  }

  // 2. 数据盲盒铁律：存在客观盲区时，禁止给出 A 级，置信度上限强制锁定在 85 以下
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

  // 3. 杯赛/友谊赛首发未确认时：最高 C 级，不进正式串关
  const league = payload.ai_brief.league ?? '';
  const isCupOrFriendly = /杯|Cup|copa|pokal|coupe|友谊|friendly/i.test(league);
  const lineupNotConfirmed = !payload.lineup_value_matrix?.is_lineup_confirmed;
  if (isCupOrFriendly && lineupNotConfirmed) {
    if (enforcedGrade === RecommendationGrade.A_GRADE || enforcedGrade === RecommendationGrade.B_GRADE) {
      enforcedGrade = RecommendationGrade.C_GRADE;
      additionalWarnings.push("SYSTEM HARD GATE: 杯赛/友谊赛官方首发未确认，最高维持 C 级观察");
    }
  }

  // 4. Layer 03 量化警报后置协同门禁
  const quantRiskFlags = payload.quant_features?.risk_flags ?? [];

  // 4.1 庄家高赔诱盘警报 (TRAP_HIGH_ODDS_WARNING): 绝对禁止 A 级，置信度上限 80
  if (quantRiskFlags.includes(QuantAlert.TRAP_HIGH_ODDS_WARNING)) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
      additionalWarnings.push("SYSTEM HARD GATE: 触发 Layer 03 庄家高赔诱盘警报 (TRAP_HIGH_ODDS)，强制降为 B 级防守");
    }
    if (enforcedConfidence > 80) {
      enforcedConfidence = 80;
      additionalWarnings.push("SYSTEM HARD GATE: 存在诱盘风险，置信度强制封顶 80 分");
    }
  }

  // 4.2 虚假繁荣假控球警报 (BARREN_DOMINANCE_WARNING): 剥夺 A 级，且纠正战术态势判定
  if (quantRiskFlags.includes(QuantAlert.BARREN_DOMINANCE_WARNING)) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
      additionalWarnings.push("SYSTEM HARD GATE: 触发 Layer 03 假控球警报 (BARREN_DOMINANCE)，剥夺 A 级资格降为 B 级");
    }
    if (result.blind_spot_analysis && result.blind_spot_analysis.tactical_regime_evaluation === 'GENUINE_DOMINANCE') {
      result.blind_spot_analysis.tactical_regime_evaluation = 'BARREN_DOMINANCE';
      additionalWarnings.push("SYSTEM HARD GATE: 修正战术态势为 BARREN_DOMINANCE (无实质威胁虚假控球)");
    }
  }

  // 4.3 红牌战术失衡警报 (RED_CARD_TACTICAL_COLLAPSE): 存在红牌少打多时，最高封顶 B 级
  if (quantRiskFlags.includes(QuantAlert.RED_CARD_TACTICAL_COLLAPSE)) {
    if (enforcedGrade === RecommendationGrade.A_GRADE) {
      enforcedGrade = RecommendationGrade.B_GRADE;
      additionalWarnings.push("SYSTEM HARD GATE: 红牌受损场景战术失衡，强制封顶 B 级");
    }
    additionalWarnings.push("SYSTEM QUANT WARNING: 存在红牌战术失衡 (RED_CARD_TACTICAL_COLLAPSE)，严防防线崩溃风险");
  }

  return {
    ...result,
    grade: enforcedGrade,
    confidence_score: enforcedConfidence,
    risk_warnings: [
      ...result.risk_warnings,
      ...additionalWarnings
    ]
  };
}


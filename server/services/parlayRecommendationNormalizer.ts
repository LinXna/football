import { validateParlayLegAgainstCandidate } from './verifiedMarketAssessment';
import { calculateBankrollGuidance } from './quantitativeFeatures';

const cleanTeam = (str: any): string => {
  if (typeof str !== 'string') return '';
  return str.toLowerCase().replace(/-(ybty|leisu)$/gi, '').replace(/football club|fc|俱乐部|体育/gi, '').replace(/[\s\-_:\.()（）\[\]【】]/g, '').trim();
};

export function normalizeParlayRecommendations(result: any, sanitizeLeg: (leg: any, candidates?: any[]) => any, candidates: any[] = []): any {
  if (!Array.isArray(result?.parlay_recommendations)) return result;
  return {
    ...result,
    parlay_recommendations: result.parlay_recommendations.map((ticket: any) => {
      const legs = Array.isArray(ticket?.legs) ? ticket.legs.map((leg: any) => {
        const sanitized = sanitizeLeg(leg, candidates);
        const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[\s._\-()（）]/g, '');
        const candidate = candidates.find((item: any) => normalize(item.match) === normalize(sanitized.match))
          || candidates.find((item: any) => normalize(item.ybty_home) === normalize(sanitized.ybty_home) && normalize(item.ybty_away) === normalize(sanitized.ybty_away))
          || candidates.find((item: any) => cleanTeam(item.match) === cleanTeam(sanitized.match))
          || candidates.find((item: any) => cleanTeam(item.ybty_home) === cleanTeam(sanitized.ybty_home) && cleanTeam(item.ybty_away) === cleanTeam(sanitized.ybty_away));
        
        const candidateScore = candidate?.score || candidate?.match_info?.score || null;
        const candidateMinute = candidate?.minute ?? candidate?.match_info?.minute ?? undefined;
        const scoreVerified = candidate?.score_verified ?? candidate?.match_info?.score_verified ?? false;

        const baseValidated = candidate 
          ? validateParlayLegAgainstCandidate(sanitized, candidate) 
          : { ...sanitized, ybty_market_verified: false, verification_error: 'candidate_not_found' };

        return {
          ...baseValidated,
          score: candidateScore || baseValidated.score || null,
          minute: candidateMinute !== undefined ? candidateMinute : baseValidated.minute,
          score_verified: scoreVerified,
        };
      }) : [];
      const invalid = legs.filter((leg: any) => leg.ybty_market_verified !== true);
      const ticketGrade = invalid.length ? 'C' : (ticket.grade || 'B');
      
      // Calculate joint probability and total combined odds
      const calculatedTotalOdds = Number((legs.reduce((acc: number, l: any) => acc * (Number(l.odds) || 1), 1)).toFixed(2));
      const totalOdds = Number(ticket?.estimated_total_odds) > 1 ? Number(ticket.estimated_total_odds) : calculatedTotalOdds;
      
      // Joint probability % = P1 * P2 * ...
      const rawJointProb = legs.length > 0
        ? legs.reduce((acc: number, l: any) => acc * ((Number(l.probability) || 55) / 100), 1) * 100
        : 0;
      const jointProbability = Number((typeof ticket?.joint_probability === 'number' && ticket.joint_probability > 0 ? ticket.joint_probability : rawJointProb).toFixed(1));

      // Combined EV % = (Joint Prob / 100 * Total Odds - 1) * 100
      const calculatedEv = Number(((jointProbability / 100 * totalOdds - 1) * 100).toFixed(1));
      const combinedEvPct = typeof ticket?.combined_ev_pct === 'number' ? ticket.combined_ev_pct : calculatedEv;

      // 1/4 Kelly Fraction %
      // f* = max(0, (b*p - q)/b) * 0.25
      const b = Math.max(0.01, totalOdds - 1);
      const p = jointProbability / 100;
      const q = 1 - p;
      const fullKelly = Math.max(0, (b * p - q) / b);
      const quarterKellyPct = Number((fullKelly * 0.25 * 100).toFixed(2));
      const kellyFractionPct = typeof ticket?.kelly_fraction_pct === 'number' ? ticket.kelly_fraction_pct : quarterKellyPct;

      // Sharpe Assessment
      let sharpeAssessment: 'HIGH_EDGE_CORE' | 'BALANCED_GROWTH' | 'SPECULATIVE_VALUE' = 'SPECULATIVE_VALUE';
      if (combinedEvPct >= 12 && jointProbability >= 25) {
        sharpeAssessment = 'HIGH_EDGE_CORE';
      } else if (combinedEvPct >= 4 && jointProbability >= 15) {
        sharpeAssessment = 'BALANCED_GROWTH';
      }

      // Correlation & Antifragility Audit
      const leagueSet = new Set(legs.map((l: any) => l.league || l.ybty_league || '').filter(Boolean));
      const matchSet = new Set(legs.map((l: any) => l.match || '').filter(Boolean));
      let independenceScore = 92;
      if (legs.length > matchSet.size) {
        independenceScore -= 30; // 同场多腿
      }
      if (legs.length > 1 && leagueSet.size === 1 && leagueSet.size < legs.length) {
        independenceScore -= 12; // 同联赛
      }
      const correlationRiskCheck = independenceScore >= 70 ? 'passed' : 'warning';
      const correlationAudit = ticket?.correlation_audit || {
        independence_score: independenceScore,
        tactical_synergy: ticket?.correlation_audit?.tactical_synergy || '各腿赛事独立性良好，具备跨盘口节奏互补性',
        correlation_risk_check: correlationRiskCheck,
        notes: ticket?.correlation_audit?.notes || (correlationRiskCheck === 'passed' ? '通过独立性与反脆弱审查，无同质化爆仓风险' : '存在同联赛/同赛程相关性风险，建议微调注码'),
      };

      const bankroll = calculateBankrollGuidance({
        grade: ticketGrade,
        isParlay: true,
        legCount: legs.length,
      });

      if (kellyFractionPct > 0) {
        bankroll.recommended_stake_pct = `${kellyFractionPct}%`;
        bankroll.fractional_kelly_pct = kellyFractionPct;
        bankroll.guidance_text = `1/4 凯利测算建议仓位 ${kellyFractionPct}% (整单EV +${combinedEvPct}%)，兼顾几何增值与回撤控制`;
      }

      return {
        ...ticket,
        legs,
        estimated_total_odds: totalOdds,
        joint_probability: jointProbability,
        combined_ev_pct: combinedEvPct,
        kelly_fraction_pct: kellyFractionPct,
        sharpe_assessment: ticket?.sharpe_assessment || sharpeAssessment,
        correlation_audit: correlationAudit,
        verification_passed: invalid.length === 0,
        grade: ticketGrade,
        bankroll_guidance: bankroll,
        validation_errors: invalid.map((leg: any) => `${leg.match}: ${leg.validation_reason || leg.verification_error}`),
      };
    }),
  };
}


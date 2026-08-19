import { validateParlayLegAgainstCandidate } from './verifiedMarketAssessment';
import { calculateBankrollGuidance, calculateCalibratedParlayMetrics } from './quantitativeFeatures';

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
      
      // Calculate Calibrated Multi-Leg EV & Bayesian Shrinkage Metrics
      const calibratedMetrics = calculateCalibratedParlayMetrics(
        legs.map((l: any) => ({
          odds: Number(l.odds) || 1,
          probability: typeof l.probability === 'number' ? l.probability : null,
          market: l.market,
          line: l.line,
          grade: l.grade,
        })),
        typeof ticket?.joint_probability === 'number' ? ticket.joint_probability : null,
        typeof ticket?.combined_ev_pct === 'number' ? ticket.combined_ev_pct : null
      );

      const totalOdds = calibratedMetrics.totalOdds;
      const jointProbability = calibratedMetrics.calibratedJointProbPct;
      const combinedEvPct = calibratedMetrics.calibratedEvPct;
      const kellyFractionPct = calibratedMetrics.quarterKellyPct;
      const sharpeAssessment = calibratedMetrics.sharpeAssessment;

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
      if (calibratedMetrics.warnings.length > 0) {
        independenceScore -= (calibratedMetrics.warnings.length * 8);
      }
      independenceScore = Math.max(20, Math.min(100, independenceScore));

      const correlationRiskCheck = independenceScore >= 70 ? 'passed' : 'warning';
      const correlationAudit = ticket?.correlation_audit || {
        independence_score: independenceScore,
        tactical_synergy: ticket?.correlation_audit?.tactical_synergy || '各腿赛事独立性良好，具备跨盘口节奏互补性',
        correlation_risk_check: correlationRiskCheck,
        notes: ticket?.correlation_audit?.notes || (correlationRiskCheck === 'passed' ? '通过独立性与反脆弱审查，无同质化爆仓风险' : '存在同联赛或高方差腿相关性风险，建议微调注码'),
      };

      if (calibratedMetrics.warnings.length > 0 && !correlationAudit.notes.includes(calibratedMetrics.warnings[0])) {
        correlationAudit.notes += ` | 风控提示: ${calibratedMetrics.warnings.join('; ')}`;
      }

      const bankroll = calculateBankrollGuidance({
        grade: ticketGrade,
        isParlay: true,
        legCount: legs.length,
      });

      if (kellyFractionPct > 0) {
        bankroll.recommended_stake_pct = calibratedMetrics.recommendedStakePct;
        bankroll.fractional_kelly_pct = kellyFractionPct;
        bankroll.guidance_text = `1/4 凯利测算建议微仓 ${calibratedMetrics.recommendedStakePct} (校准后整单EV +${combinedEvPct}%)，严格遵循机构风控上限`;
      }

      return {
        ...ticket,
        legs,
        estimated_total_odds: totalOdds,
        joint_probability: jointProbability,
        raw_joint_probability: calibratedMetrics.rawJointProbPct,
        combined_ev_pct: combinedEvPct,
        raw_ev_pct: calibratedMetrics.rawEvPct,
        kelly_fraction_pct: kellyFractionPct,
        sharpe_assessment: ticket?.sharpe_assessment || sharpeAssessment,
        haircut_factor: calibratedMetrics.haircutFactor,
        is_high_quality_anchor_combo: calibratedMetrics.isHighQualityAnchorCombo,
        correlation_audit: correlationAudit,
        verification_passed: invalid.length === 0,
        grade: ticketGrade,
        bankroll_guidance: bankroll,
        validation_errors: invalid.map((leg: any) => `${leg.match}: ${leg.validation_reason || leg.verification_error}`),
      };
    }),
  };
}



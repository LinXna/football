import { validateParlayLegAgainstCandidate } from './verifiedMarketAssessment';

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
        return candidate ? validateParlayLegAgainstCandidate(sanitized, candidate) : { ...sanitized, ybty_market_verified: false, verification_error: 'candidate_not_found' };
      }) : [];
      const invalid = legs.filter((leg: any) => leg.ybty_market_verified !== true);
      return { ...ticket, legs, verification_passed: invalid.length === 0, grade: invalid.length ? 'C' : ticket.grade, validation_errors: invalid.map((leg: any) => `${leg.match}: ${leg.validation_reason || leg.verification_error}`) };
    }),
  };
}

export interface ValidScore {
  home: number;
  away: number;
}

export function parseValidScore(value: unknown): ValidScore | null {
  if (!value || typeof value !== 'object') return null;
  const score = value as Record<string, unknown>;
  if (score.home === null || score.home === undefined || score.home === ''
    || score.away === null || score.away === undefined || score.away === '') return null;
  const home = Number(score.home);
  const away = Number(score.away);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) return null;
  return { home, away };
}

export function parseScoreFields(homeValue: unknown, awayValue: unknown): ValidScore | null {
  if (homeValue === undefined || homeValue === null || awayValue === undefined || awayValue === null
    || homeValue === '' || awayValue === '') return null;
  return parseValidScore({ home: homeValue, away: awayValue });
}

export function isPrematchScorePlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^(?:未开始|未开赛|not\s*started|prematch|0\s*[-:]\s*0\s*[（(]未开赛[）)])$/i.test(value.trim());
}

export function isPlausibleHalfTimeScore(halfTime: ValidScore, finalScore?: ValidScore | null): boolean {
  return !finalScore || (halfTime.home <= finalScore.home && halfTime.away <= finalScore.away);
}

export function resolveScoreVerification(item: any, prematch = false): { verified: boolean; source: string } {
  if (prematch) return { verified: true, source: 'prematch_not_applicable' };
  if (item?.score_verified === true) return { verified: true, source: String(item?.score_source || 'verified') };
  const ybtyScore = parseValidScore(item?.score);
  
  let leisuScore = parseValidScore(item?.leisu_score || item?.live_facts?.score);
  if (!leisuScore && item?.detail_context?.formal?.live_match) {
    const lm = item.detail_context.formal.live_match;
    if (lm.home_scores && lm.away_scores) {
      leisuScore = parseValidScore({ home: lm.home_scores.score, away: lm.away_scores.score });
    }
  }

  if (ybtyScore && leisuScore && ybtyScore.home === leisuScore.home && ybtyScore.away === leisuScore.away) {
    return { verified: true, source: 'ybty+leisu_api' };
  }
  return { verified: false, source: String(item?.score_source || 'unverified') };
}

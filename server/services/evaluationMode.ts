export type MatchEvaluationMode = 'live_eval' | 'prematch_eval';

export function resolveMatchEvaluationMode(match: any): MatchEvaluationMode {
  return Number(match?.minute || 0) > 0 || match?.is_live === true || match?.status === 'inprogress'
    ? 'live_eval'
    : 'prematch_eval';
}

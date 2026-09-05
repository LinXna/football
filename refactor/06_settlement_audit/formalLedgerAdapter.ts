import { FormalRecommendation } from '../05_portfolio_risk/types.js';
import { HistoricalBacktestRecord } from './types.js';

export interface FormalLedgerConversionResult {
  records: readonly HistoricalBacktestRecord[];
  skipped: readonly { record_id: string; reason: string }[];
}

function parseScore(value: string): { home: number; away: number } | undefined {
  const match = value.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
  if (!match) return undefined;
  return { home: Number(match[1]), away: Number(match[2]) };
}

/**
 * Converts only settled formal records. Pending records remain outside OOS until
 * a verified final score and a binary settlement outcome are available.
 */
export function convertFormalLedgerRecords(
  records: readonly FormalRecommendation[]
): FormalLedgerConversionResult {
  const converted: HistoricalBacktestRecord[] = [];
  const skipped: { record_id: string; reason: string }[] = [];

  for (const record of records) {
    const settlement = record.settlement;
    const recommendationScore = parseScore(record.prediction_snapshot.score_at_recommendation);
    const finalScore = settlement?.final_score_verified
      ? parseScore(settlement.final_score_verified)
      : undefined;
    if (!settlement?.is_settled || settlement.outcome === 'PENDING' || !settlement.settled_at) {
      skipped.push({ record_id: record.record_id, reason: 'SETTLEMENT_PENDING' });
      continue;
    }
    if (!record.prediction_snapshot.score_verified || !recommendationScore || !finalScore) {
      skipped.push({ record_id: record.record_id, reason: 'VERIFIED_SCORES_REQUIRED' });
      continue;
    }
    if (settlement.outcome !== 'WIN' && settlement.outcome !== 'LOSE') {
      skipped.push({ record_id: record.record_id, reason: 'BINARY_SETTLEMENT_REQUIRED' });
      continue;
    }

    converted.push({
      record_id: record.record_id,
      record_type: 'formal_ai_recommendation',
      formal_recommendation: true,
      model_version: record.prediction_snapshot.model_version,
      prediction_at: record.prediction_snapshot.prediction_at,
      settled_at: settlement.settled_at,
      league_key: record.league_key,
      home_team_key: record.teams.home,
      away_team_key: record.teams.away,
      stage: record.stage,
      minute: record.prediction_snapshot.minute,
      score_at_recommendation: recommendationScore,
      final_score: finalScore,
      score_verified: record.prediction_snapshot.score_verified,
      red_card_state: record.prediction_snapshot.red_card_state,
      market: record.prediction_snapshot.market as HistoricalBacktestRecord['market'],
      line: record.prediction_snapshot.line,
      odds: record.prediction_snapshot.odds,
      model_probability: record.prediction_snapshot.model_probability,
      predicted_lambda: record.prediction_snapshot.predicted_lambda.home + record.prediction_snapshot.predicted_lambda.away,
      settlement_outcome: settlement.outcome
    });
  }

  return { records: converted, skipped };
}

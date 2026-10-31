import { FormalRecommendation, UniverseAuditRecord } from '../05_portfolio_risk/types.js';
import { HistoricalBacktestRecord } from './types.js';

export interface FormalLedgerConversionResult {
  records: readonly HistoricalBacktestRecord[];
  skipped: readonly { record_id: string; reason: string }[];
}

const isOosMarket = (value: unknown): value is HistoricalBacktestRecord['market'] =>
  value === 'ASIAN_HANDICAP_MAIN' || value === 'TOTAL_GOALS_MAIN' || value === 'MONEYLINE_1X2' || value === 'EURO_1X2' || value === 'ASIAN_HANDICAP' || value === 'ASIAN_HANDICAP_SECONDARY' || value === 'TOTAL_GOALS' || value === 'TOTAL_GOALS_SECONDARY';

const isSettlementBasis = (value: unknown): value is NonNullable<HistoricalBacktestRecord['settlement_basis']> =>
  value === 'FULL_MATCH' || value === 'REMAINING_GOALS' || value === 'REMAINING_PERIOD_DOMINANCE' || value === 'FULL_MATCH_NORMAL' || value === 'REST_OF_MATCH';

const normalizeOosMarket = (value: unknown): HistoricalBacktestRecord['market'] => {
  if (value === 'ASIAN_HANDICAP' || value === 'ASIAN_HANDICAP_SECONDARY') return 'ASIAN_HANDICAP_MAIN';
  if (value === 'TOTAL_GOALS' || value === 'TOTAL_GOALS_SECONDARY') return 'TOTAL_GOALS_MAIN';
  return value as HistoricalBacktestRecord['market'];
};

const normalizeSettlementBasis = (value: unknown): NonNullable<HistoricalBacktestRecord['settlement_basis']> => {
  if (value === 'REST_OF_MATCH') return 'REMAINING_GOALS';
  return value as NonNullable<HistoricalBacktestRecord['settlement_basis']>;
};

function parseScore(value: unknown): { home: number; away: number } | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && value !== null && 'home' in value && 'away' in value) {
    const obj = value as { home: unknown; away: unknown };
    if (typeof obj.home === 'number' && typeof obj.away === 'number' && !isNaN(obj.home) && !isNaN(obj.away)) {
      return { home: obj.home, away: obj.away };
    }
  }
  if (typeof value === 'string') {
    const match = value.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
    if (!match) return undefined;
    return { home: Number(match[1]), away: Number(match[2]) };
  }
  return undefined;
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
    const isProductionUnlocked = record.candidate_pipeline_state === 'PRODUCTION_UNLOCKED' &&
      record.condition_snapshot?.candidate_pipeline_state === 'PRODUCTION_UNLOCKED';
    const isColdStartExempt = (record.oos_status === 'OOS_COLD_START_EXEMPT' ||
      record.condition_snapshot?.oos_status === 'OOS_COLD_START_EXEMPT' ||
      record.leg?.oos_status === 'OOS_COLD_START_EXEMPT') &&
      (record.candidate_pipeline_state === 'COLD_START_PERMISSIVE' || record.candidate_pipeline_state === 'PRODUCTION_UNLOCKED');

    if (record.record_type !== 'formal_ai_recommendation' ||
        record.formal_recommendation !== true ||
        (!isProductionUnlocked && !isColdStartExempt)) {
      skipped.push({ record_id: record.record_id, reason: 'CANDIDATE_NOT_PRODUCTION_UNLOCKED' });
      continue;
    }
    const recommendationScore = parseScore(record.prediction_snapshot.score_at_recommendation);
    if (!isOosMarket(record.prediction_snapshot?.market)) {
      skipped.push({ record_id: record.record_id, reason: 'UNSUPPORTED_OOS_MARKET' });
      continue;
    }
    let settlementBasis = record.leg?.basis;
    if (!isSettlementBasis(settlementBasis)) {
      settlementBasis = record.stage === 'LIVE' ? 'REMAINING_GOALS' : 'FULL_MATCH';
    }
    if (!isSettlementBasis(settlementBasis)) {
      skipped.push({ record_id: record.record_id, reason: 'INVALID_SETTLEMENT_BASIS' });
      continue;
    }
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

    const resolvedState = isProductionUnlocked ? ('PRODUCTION_UNLOCKED' as const) : ('COLD_START_PERMISSIVE' as const);
    const resolvedOosStatus = isColdStartExempt ? ('OOS_COLD_START_EXEMPT' as const) : ('PRODUCTION_MATURE' as const);

    converted.push({
      record_id: record.record_id,
      match_id: record.match_id,
      record_type: 'formal_ai_recommendation',
      formal_recommendation: true,
      candidate_pipeline_state: resolvedState,
      oos_status: resolvedOosStatus,
      settled_record_provenance: 'SETTLED_LEDGER_ADAPTER_V1',
      model_version: (record.prediction_snapshot.model_version === 'layer03-v1' ? 'refactor-layer03-v1' : record.prediction_snapshot.model_version) || 'refactor-layer03-v1',
      prediction_at: record.prediction_snapshot.prediction_at,
      settled_at: settlement.settled_at,
      league_key: record.league_key,
      home_team_key: record.teams.home,
      away_team_key: record.teams.away,
      stage: record.stage,
      minute: record.stage === 'PREMATCH' 
        ? null 
        : (record.prediction_snapshot.minute ?? 
           (record.condition_snapshot?.match_minute 
             ? (parseInt(record.condition_snapshot.match_minute.replace(/\D/g, ''), 10) || 45) 
             : 45)),
      score_at_recommendation: recommendationScore,
      final_score: finalScore,
      score_verified: record.prediction_snapshot.score_verified,
      red_card_state: record.prediction_snapshot.red_card_state,
      market: normalizeOosMarket(record.prediction_snapshot.market),
      line: record.prediction_snapshot.line,
      odds: record.prediction_snapshot.odds,
      model_probability: record.prediction_snapshot.model_probability,
      predicted_lambda: record.prediction_snapshot.predicted_lambda.home + record.prediction_snapshot.predicted_lambda.away,
      settlement_market: normalizeOosMarket(record.prediction_snapshot.market),
      settlement_basis: normalizeSettlementBasis(settlementBasis),
      settlement_outcome: settlement.outcome
    });
  }

  return { records: converted, skipped };
}

/**
 * 将轨道二全量归因台账中具备不可逆时间戳、完备量化快照与二元真实核销结果的赛事，
 * 合规转化为 Layer 06 统一的 HistoricalBacktestRecord，直接沉淀进 OOS 样本库。
 */
export function convertUniverseAuditRecords(
  records: readonly UniverseAuditRecord[]
): FormalLedgerConversionResult {
  const converted: HistoricalBacktestRecord[] = [];
  const skipped: { record_id: string; reason: string }[] = [];

  for (const record of records) {
    const settlement = record.settlement;
    if (!settlement?.is_settled || settlement.outcome === 'PENDING' || !settlement.settled_at) {
      skipped.push({ record_id: record.record_id, reason: 'SETTLEMENT_PENDING' });
      continue;
    }

    if (settlement.outcome !== 'WIN' && settlement.outcome !== 'LOSE') {
      skipped.push({ record_id: record.record_id, reason: 'BINARY_SETTLEMENT_REQUIRED' });
      continue;
    }

    if (!record.score_verified || !record.score_at_prediction || !settlement.final_score) {
      skipped.push({ record_id: record.record_id, reason: 'VERIFIED_SCORES_REQUIRED' });
      continue;
    }

    const recScore = parseScore(record.score_at_prediction);
    const finalScore = parseScore(settlement.final_score);
    if (!recScore || !finalScore) {
      skipped.push({ record_id: record.record_id, reason: 'SCORE_PARSE_FAILED' });
      continue;
    }

    const direction = record.predicted_direction;
    if (!direction || !direction.market) {
      skipped.push({ record_id: record.record_id, reason: 'PREDICTED_DIRECTION_MISSING' });
      continue;
    }

    const isAh = direction.market.includes('让球') || direction.market.includes('AH') || direction.market.includes('SPREAD') || direction.market.includes('ASIAN');
    const rawMarket = isAh ? 'ASIAN_HANDICAP_MAIN' : 'TOTAL_GOALS_MAIN';

    if (!isOosMarket(rawMarket)) {
      skipped.push({ record_id: record.record_id, reason: 'UNSUPPORTED_OOS_MARKET' });
      continue;
    }

    const isLive = record.stage === 'LIVE';
    const settlementBasis = isLive
      ? (isAh ? 'REMAINING_PERIOD_DOMINANCE' : 'REMAINING_GOALS')
      : 'FULL_MATCH';

    const lambdaHome = record.quant_snapshot?.lambda_home;
    const lambdaAway = record.quant_snapshot?.lambda_away;
    if (typeof lambdaHome !== 'number' || typeof lambdaAway !== 'number' || isNaN(lambdaHome) || isNaN(lambdaAway)) {
      skipped.push({ record_id: record.record_id, reason: 'PREDICTED_LAMBDA_INVALID' });
      continue;
    }

    const prob = direction.model_probability;
    if (typeof prob !== 'number' || isNaN(prob) || prob < 0 || prob > 1) {
      skipped.push({ record_id: record.record_id, reason: 'MODEL_PROBABILITY_INVALID' });
      continue;
    }

    const minuteVal = isLive
      ? (parseInt(String(record.minute_or_status || '45').replace(/\D/g, ''), 10) || 45)
      : null;

    converted.push({
      record_id: record.record_id,
      match_id: record.match_id,
      record_type: 'formal_ai_recommendation',
      formal_recommendation: true,
      candidate_pipeline_state: 'COLD_START_PERMISSIVE',
      oos_status: 'OOS_COLD_START_EXEMPT',
      settled_record_provenance: 'SETTLED_LEDGER_ADAPTER_V1',
      model_version: 'refactor-layer03-v1',
      prediction_at: record.created_at_utc,
      settled_at: settlement.settled_at,
      league_key: record.league_key,
      home_team_key: record.teams.home,
      away_team_key: record.teams.away,
      stage: record.stage,
      minute: minuteVal,
      score_at_recommendation: recScore,
      final_score: finalScore,
      score_verified: record.score_verified,
      red_card_state: '0 - 0',
      market: normalizeOosMarket(rawMarket),
      line: String(direction.line),
      odds: direction.odds,
      model_probability: prob,
      predicted_lambda: lambdaHome + lambdaAway,
      settlement_market: normalizeOosMarket(rawMarket),
      settlement_basis: normalizeSettlementBasis(settlementBasis),
      settlement_outcome: settlement.outcome
    });
  }

  return { records: converted, skipped };
}

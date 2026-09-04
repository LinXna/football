import { FormalRecommendation } from '../05_portfolio_risk/types.js';
import { HistoricalSampleRejectionReason } from './enums.js';
import { HistoricalBacktestRecord, SettlementBasis, SettlementOutcome, VerifiedScore } from './types.js';
import { OosMarket } from '../03_quant_engine/types.js';

/** Fields added after the Layer 05 recommendation was written. */
export interface SettledLedgerEnvelope {
  model_version: string;
  prediction_at: string;
  settled_at: string;
  league_key: string;
  score_at_recommendation: VerifiedScore;
  final_score: VerifiedScore;
  score_verified: boolean;
  red_card_state: string;
  market: OosMarket;
  settlement_market: OosMarket;
  settlement_basis: SettlementBasis;
  model_probability: number;
  predicted_lambda: number;
  settlement_outcome: SettlementOutcome;
}

export type SettledFormalLedgerRecord = FormalRecommendation & SettledLedgerEnvelope;

export type LedgerRecordAdapterResult =
  | { accepted: true; record: HistoricalBacktestRecord }
  | { accepted: false; record_id: string; reason: HistoricalSampleRejectionReason };

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isScore = (value: unknown): value is VerifiedScore => {
  if (!isObject(value)) return false;
  return Number.isInteger(value.home) && Number(value.home) >= 0 &&
    Number.isInteger(value.away) && Number(value.away) >= 0;
};
const isOosMarket = (value: unknown): value is OosMarket =>
  value === 'ASIAN_HANDICAP_MAIN' || value === 'TOTAL_GOALS_MAIN';
const isSettlementOutcome = (value: unknown): value is SettlementOutcome =>
  value === 'WIN' || value === 'LOSE' || value === 'WIN_HALF' ||
  value === 'LOSE_HALF' || value === 'PUSH' || value === 'PENDING' || value === 'INVALID';
const isSettlementBasis = (value: unknown): value is SettlementBasis =>
  value === 'FULL_MATCH' || value === 'REMAINING_GOALS' || value === 'REMAINING_PERIOD_DOMINANCE';
const minuteFromSnapshot = (record: SettledFormalLedgerRecord): number | null => {
  const snapshot = record?.condition_snapshot;
  if (!snapshot || typeof snapshot.match_minute !== 'string') return null;
  if (record.stage === 'PREMATCH') return null;
  const match = /^LIVE (\d+)'$/.exec(snapshot.match_minute);
  return match ? Number(match[1]) : null;
};

export function adaptSettledFormalLedgerRecord(record: SettledFormalLedgerRecord): LedgerRecordAdapterResult {
  const recordId = String(record?.record_id || '');
  const minute = minuteFromSnapshot(record);
  const teamsAreValid = isObject(record?.teams) &&
    hasText(record.teams.home) && hasText(record.teams.away);
  const snapshotIsValid = isObject(record?.condition_snapshot) &&
    hasText(record.condition_snapshot.match_minute);
  const legIsValid = isObject(record?.leg) && hasText(record.leg.market);
  const assessmentIsValid = isObject(record?.ai_assessment) &&
    (record.ai_assessment.grade === 'A_GRADE' || record.ai_assessment.grade === 'B_GRADE') &&
    Number.isFinite(record.ai_assessment.confidence_score) &&
    record.ai_assessment.confidence_score >= 70;
  if (
    record?.record_type !== 'formal_ai_recommendation' ||
    record?.formal_recommendation !== true ||
    (record.stage !== 'LIVE' && record.stage !== 'PREMATCH') ||
    !teamsAreValid ||
    !snapshotIsValid ||
    !legIsValid ||
    !assessmentIsValid ||
    !hasText(record.model_version) ||
    !hasText(record.prediction_at) ||
    !hasText(record.settled_at) ||
    !hasText(record.league_key) ||
    !hasText(record.red_card_state) ||
    !isScore(record.score_at_recommendation) ||
    !isScore(record.final_score) ||
    record.score_verified !== true ||
    !Number.isFinite(record.model_probability) ||
    !Number.isFinite(record.predicted_lambda) ||
    !isOosMarket(record.market) ||
    !isOosMarket(record.settlement_market) ||
    !isSettlementBasis(record.settlement_basis) ||
    !isSettlementOutcome(record.settlement_outcome) ||
    (record.stage === 'LIVE' && minute === null) ||
    (record.stage === 'PREMATCH' && record.condition_snapshot?.match_minute !== 'PREMATCH')
  ) {
    return { accepted: false, record_id: recordId, reason: HistoricalSampleRejectionReason.ADAPTER_INPUT_INCOMPLETE };
  }
  if (record.settlement_market !== record.market || record.settlement_market !== record.leg.market) {
    return { accepted: false, record_id: recordId, reason: HistoricalSampleRejectionReason.SETTLEMENT_MARKET_MISMATCH };
  }
  if (record.settlement_basis !== record.leg.basis ||
      (record.stage === 'PREMATCH' && record.settlement_basis !== 'FULL_MATCH')) {
    return { accepted: false, record_id: recordId, reason: HistoricalSampleRejectionReason.SETTLEMENT_BASIS_MISMATCH };
  }

  return {
    accepted: true,
    record: Object.freeze({
      settled_record_provenance: 'SETTLED_LEDGER_ADAPTER_V1',
      record_id: record.record_id,
      record_type: record.record_type,
      formal_recommendation: record.formal_recommendation,
      model_version: record.model_version,
      prediction_at: record.prediction_at,
      settled_at: record.settled_at,
      league_key: record.league_key,
      home_team_key: record.teams.home,
      away_team_key: record.teams.away,
      stage: record.stage,
      minute,
      score_at_recommendation: record.score_at_recommendation,
      final_score: record.final_score,
      score_verified: record.score_verified,
      red_card_state: record.red_card_state,
      market: record.market,
      settlement_market: record.settlement_market,
      settlement_basis: record.settlement_basis,
      model_probability: record.model_probability,
      predicted_lambda: record.predicted_lambda,
      settlement_outcome: record.settlement_outcome,
    }),
  };
}

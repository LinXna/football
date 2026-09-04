import { HistoricalSampleRejectionReason } from '../06_settlement_audit/enums.js';
import { ingestHistoricalBacktestRecords } from '../06_settlement_audit/historicalBacktestIngestion.js';
import { HistoricalBacktestRecord } from '../06_settlement_audit/types.js';
import { adaptSettledFormalLedgerRecord, SettledFormalLedgerRecord } from '../06_settlement_audit/ledgerRecordAdapter.js';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const baseRecord: HistoricalBacktestRecord = Object.freeze({
  settled_record_provenance: 'SETTLED_LEDGER_ADAPTER_V1',
  record_id: 'formal-settled-001',
  record_type: 'formal_ai_recommendation',
  formal_recommendation: true,
  model_version: 'layer03-v1',
  prediction_at: '2026-09-01T00:00:00.000Z',
  settled_at: '2026-09-02T00:00:00.000Z',
  league_key: 'Golden League',
  home_team_key: 'Home FC',
  away_team_key: 'Away FC',
  stage: 'LIVE',
  minute: 62,
  score_at_recommendation: { home: 1, away: 0 },
  final_score: { home: 2, away: 1 },
  score_verified: true,
  red_card_state: '0-0',
  market: 'TOTAL_GOALS_MAIN',
  settlement_market: 'TOTAL_GOALS_MAIN',
  settlement_basis: 'REMAINING_GOALS',
  model_probability: 0.61,
  predicted_lambda: 1.2,
  settlement_outcome: 'WIN'
});

const rejectedMachine: HistoricalBacktestRecord = { ...baseRecord, record_id: 'machine-001', record_type: 'machine_candidate', formal_recommendation: false };
const rejectedScore: HistoricalBacktestRecord = { ...baseRecord, record_id: 'score-001', score_verified: false };
const rejectedQuarter: HistoricalBacktestRecord = { ...baseRecord, record_id: 'quarter-001', settlement_outcome: 'WIN_HALF' };

const result = ingestHistoricalBacktestRecords(
  [baseRecord, rejectedMachine, rejectedScore, rejectedQuarter],
  {
    generated_at: '2026-09-03T00:00:00.000Z',
    model_version: 'layer03-v1',
    training_window_start_at: '2025-01-01T00:00:00.000Z',
    training_window_end_at: '2026-08-01T00:00:00.000Z',
    prediction_window_start_at: '2026-08-02T00:00:00.000Z',
    prediction_window_end_at: '2026-09-02T23:59:59.000Z'
  }
);

assert(result.accepted_samples.length === 1, 'Only formal, score-verified binary market outcomes may enter OOS.');
assert(result.accepted_samples[0].observed_goals === 2, 'Live OOS observed goals must use post-recommendation goals.');
assert(result.accepted_samples[0].outcome === 1, 'WIN must map to the full-win calibration target.');
assert(result.calibration_archive !== undefined, 'Accepted records must produce a calibration archive artifact.');
assert(result.rejected_records.length === 3, 'Invalid records must remain explicitly auditable.');
assert(result.rejected_records.some((record) => record.reason === HistoricalSampleRejectionReason.NOT_FORMAL_RECOMMENDATION), 'Machine candidates must be rejected.');
assert(result.rejected_records.some((record) => record.reason === HistoricalSampleRejectionReason.SCORE_NOT_VERIFIED), 'Unverified scores must be rejected.');
assert(result.rejected_records.some((record) => record.reason === HistoricalSampleRejectionReason.SETTLEMENT_NOT_BINARY), 'Quarter outcomes must not be misused as Brier labels.');

const empty = ingestHistoricalBacktestRecords([rejectedMachine], {
  generated_at: '2026-09-03T00:00:00.000Z',
  model_version: 'layer03-v1',
  training_window_start_at: '2025-01-01T00:00:00.000Z',
  training_window_end_at: '2026-08-01T00:00:00.000Z',
  prediction_window_start_at: '2026-08-02T00:00:00.000Z',
  prediction_window_end_at: '2026-09-02T23:59:59.000Z'
});
assert(empty.calibration_archive === undefined, 'No accepted sample means no calibration archive may be fabricated.');

const settledLedgerRecord = {
  record_id: 'ledger-formal-001',
  record_type: 'formal_ai_recommendation',
  formal_recommendation: true,
  stage: 'LIVE',
  created_at_utc: '2026-09-01T00:00:00.000Z',
  match_id: 'match-001',
  kickoff_time: '2026-09-01T20:00:00+08:00',
  teams: { home: 'Home FC', away: 'Away FC' },
  condition_snapshot: { match_minute: "LIVE 62'", current_score: '1 - 0', bdi: 0, goal_phase_alert: 'NONE', machine_candidate_count: 1 },
  ai_assessment: { grade: 'B_GRADE' as any, confidence_score: 80, blind_spot_analysis: {} as any, internal_logical_audit: '', qualitative_summary: '' },
  leg: { market: 'TOTAL_GOALS_MAIN', selected_line: '2.5', current_odds: 1.9, minimum_acceptable_odds: 1.8, direction: 'OVER', basis: 'FULL_MATCH' },
  model_version: 'layer03-v1',
  prediction_at: '2026-09-01T12:00:00.000Z',
  settled_at: '2026-09-02T12:00:00.000Z',
  league_key: 'Golden League',
  score_at_recommendation: { home: 1, away: 0 },
  final_score: { home: 2, away: 1 },
  score_verified: true,
  red_card_state: '0-0',
  market: 'TOTAL_GOALS_MAIN',
  settlement_market: 'TOTAL_GOALS_MAIN',
  settlement_basis: 'FULL_MATCH',
  model_probability: 0.61,
  predicted_lambda: 1.2,
  settlement_outcome: 'WIN',
} as SettledFormalLedgerRecord;
const adapted = adaptSettledFormalLedgerRecord(settledLedgerRecord);
assert(adapted.accepted && adapted.record.minute === 62, 'Complete settled Layer 05 record must map to Layer 06 with LIVE minute.');
const directRecord = { ...baseRecord, settled_record_provenance: undefined } as unknown as HistoricalBacktestRecord;
const directIngestion = ingestHistoricalBacktestRecords([directRecord], {
  generated_at: '2026-09-03T00:00:00.000Z',
  model_version: 'layer03-v1',
  training_window_start_at: '2025-01-01T00:00:00.000Z',
  training_window_end_at: '2026-08-01T00:00:00.000Z',
  prediction_window_start_at: '2026-08-02T00:00:00.000Z',
  prediction_window_end_at: '2026-09-02T23:59:59.000Z'
});
assert(directIngestion.accepted_samples.length === 0 &&
  directIngestion.rejected_records[0]?.reason === HistoricalSampleRejectionReason.ADAPTER_INPUT_INCOMPLETE,
  'Direct normalized records without adapter provenance must not create OOS samples.');
const incomplete = adaptSettledFormalLedgerRecord({ ...({} as SettledFormalLedgerRecord), record_id: 'incomplete' });
assert(!incomplete.accepted && incomplete.reason === HistoricalSampleRejectionReason.ADAPTER_INPUT_INCOMPLETE, 'Incomplete settled records must be rejected without defaults.');
const malformedLedger = adaptSettledFormalLedgerRecord({
  ...settledLedgerRecord,
  record_id: 'malformed-ledger',
  teams: undefined
} as unknown as SettledFormalLedgerRecord);
assert(!malformedLedger.accepted && malformedLedger.reason === HistoricalSampleRejectionReason.ADAPTER_INPUT_INCOMPLETE, 'Malformed Layer 05 ledger structure must be rejected without throwing.');
const rejectedGradeLedger = adaptSettledFormalLedgerRecord({
  ...settledLedgerRecord,
  record_id: 'rejected-grade-ledger',
  ai_assessment: { ...settledLedgerRecord.ai_assessment, grade: 'C_GRADE' }
} as SettledFormalLedgerRecord);
assert(!rejectedGradeLedger.accepted && rejectedGradeLedger.reason === HistoricalSampleRejectionReason.ADAPTER_INPUT_INCOMPLETE, 'C-grade ledger records must not enter settled OOS ingestion.');
const lowConfidenceLedger = adaptSettledFormalLedgerRecord({
  ...settledLedgerRecord,
  record_id: 'low-confidence-ledger',
  ai_assessment: { ...settledLedgerRecord.ai_assessment, confidence_score: 69 }
} as SettledFormalLedgerRecord);
assert(!lowConfidenceLedger.accepted && lowConfidenceLedger.reason === HistoricalSampleRejectionReason.ADAPTER_INPUT_INCOMPLETE, 'Low-confidence ledger records must not enter settled OOS ingestion.');
const nestedSettlementIgnored = adaptSettledFormalLedgerRecord({
  ...settledLedgerRecord,
  record_id: 'nested-settlement-ignored',
  settlement: { is_settled: true, outcome: 'LOSE', final_score_verified: '9 - 9', profit_loss: -999 }
} as SettledFormalLedgerRecord);
assert(nestedSettlementIgnored.accepted && nestedSettlementIgnored.record.settlement_outcome === 'WIN' &&
  nestedSettlementIgnored.record.final_score.home === 2, 'Layer 05 nested settlement fields must not override the settled envelope.');
const mismatchedSettlement = adaptSettledFormalLedgerRecord({
  ...settledLedgerRecord,
  record_id: 'mismatched-settlement',
  settlement_market: 'ASIAN_HANDICAP_MAIN'
} as SettledFormalLedgerRecord);
assert(!mismatchedSettlement.accepted && mismatchedSettlement.reason === HistoricalSampleRejectionReason.SETTLEMENT_MARKET_MISMATCH, 'Settlement market mismatch must not produce a binary OOS label.');
const mismatchedBasis = adaptSettledFormalLedgerRecord({
  ...settledLedgerRecord,
  record_id: 'mismatched-basis',
  settlement_basis: 'REMAINING_GOALS'
} as SettledFormalLedgerRecord);
assert(!mismatchedBasis.accepted && mismatchedBasis.reason === HistoricalSampleRejectionReason.SETTLEMENT_BASIS_MISMATCH, 'Settlement basis mismatch must not alter the OOS observation window.');
const prematchRecord: HistoricalBacktestRecord = {
  ...baseRecord,
  record_id: 'prematch-full-match',
  stage: 'PREMATCH',
  minute: null,
  score_at_recommendation: { home: 0, away: 0 },
  settlement_basis: 'FULL_MATCH'
};
const prematchResult = ingestHistoricalBacktestRecords([prematchRecord], {
  generated_at: '2026-09-03T00:00:00.000Z',
  model_version: 'layer03-v1',
  training_window_start_at: '2025-01-01T00:00:00.000Z',
  training_window_end_at: '2026-08-01T00:00:00.000Z',
  prediction_window_start_at: '2026-08-02T00:00:00.000Z',
  prediction_window_end_at: '2026-09-02T23:59:59.000Z'
});
assert(prematchResult.accepted_samples[0]?.observed_goals === 3, 'Prematch FULL_MATCH OOS must observe all final goals.');
const duplicateResult = ingestHistoricalBacktestRecords([baseRecord, { ...baseRecord }], {
  generated_at: '2026-09-03T00:00:00.000Z',
  model_version: 'layer03-v1',
  training_window_start_at: '2025-01-01T00:00:00.000Z',
  training_window_end_at: '2026-08-01T00:00:00.000Z',
  prediction_window_start_at: '2026-08-02T00:00:00.000Z',
  prediction_window_end_at: '2026-09-02T23:59:59.000Z'
});
assert(duplicateResult.accepted_samples.length === 1, 'Duplicate sample IDs must not inflate OOS archives.');
assert(duplicateResult.rejected_records.some((record) => record.reason === HistoricalSampleRejectionReason.DUPLICATE_SAMPLE_ID), 'Duplicate sample IDs must remain auditable.');
const outsideWindow = ingestHistoricalBacktestRecords([{
  ...baseRecord,
  record_id: 'outside-window',
  prediction_at: '2026-09-03T00:00:00.000Z',
  settled_at: '2026-09-04T00:00:00.000Z'
}], {
  generated_at: '2026-09-05T00:00:00.000Z',
  model_version: 'layer03-v1',
  training_window_start_at: '2025-01-01T00:00:00.000Z',
  training_window_end_at: '2026-08-01T00:00:00.000Z',
  prediction_window_start_at: '2026-08-02T00:00:00.000Z',
  prediction_window_end_at: '2026-09-02T23:59:59.000Z'
} as HistoricalBacktestRecord);
assert(outsideWindow.rejected_records[0]?.reason === HistoricalSampleRejectionReason.PREDICTION_OUTSIDE_WINDOW, 'Predictions outside the archive window must be rejected.');
const settlementAfterGeneration = ingestHistoricalBacktestRecords([{
  ...baseRecord,
  record_id: 'settlement-after-generation',
  settled_at: '2026-09-04T00:00:00.000Z'
}], {
  generated_at: '2026-09-03T00:00:00.000Z',
  model_version: 'layer03-v1',
  training_window_start_at: '2025-01-01T00:00:00.000Z',
  training_window_end_at: '2026-08-01T00:00:00.000Z',
  prediction_window_start_at: '2026-08-02T00:00:00.000Z',
  prediction_window_end_at: '2026-09-02T23:59:59.000Z'
});
assert(settlementAfterGeneration.rejected_records[0]?.reason === HistoricalSampleRejectionReason.SETTLEMENT_AFTER_GENERATION, 'Settlement after archive generation must be rejected.');

console.log('Layer 06 historical backtest ingestion: adapter and ingestion assertions passed.');

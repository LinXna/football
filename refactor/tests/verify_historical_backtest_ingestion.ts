import { HistoricalSampleRejectionReason } from '../06_settlement_audit/enums.js';
import { ingestHistoricalBacktestRecords } from '../06_settlement_audit/historicalBacktestIngestion.js';
import { HistoricalBacktestRecord } from '../06_settlement_audit/types.js';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const baseRecord: HistoricalBacktestRecord = Object.freeze({
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

console.log('Layer 06 historical backtest ingestion: 9/9 assertions passed.');

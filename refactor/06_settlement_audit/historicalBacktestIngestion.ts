import { buildOosCalibrationArchive } from '../03_quant_engine/oosCalibrationEngine.js';
import { OosArchiveBuildOptions, OosCalibrationSample } from '../03_quant_engine/types.js';
import { HistoricalSampleRejectionReason } from './enums.js';
import {
  HistoricalBacktestRecord,
  HistoricalOosIngestionResult,
  HistoricalSampleRejection
} from './types.js';

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function rejectionFor(record: HistoricalBacktestRecord): HistoricalSampleRejection | undefined {
  if (record.record_type !== 'formal_ai_recommendation' || !record.formal_recommendation) {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.NOT_FORMAL_RECOMMENDATION };
  }
  if (!record.score_verified) {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.SCORE_NOT_VERIFIED };
  }
  if (!isNonNegativeInteger(record.score_at_recommendation.home) ||
      !isNonNegativeInteger(record.score_at_recommendation.away) ||
      !isNonNegativeInteger(record.final_score.home) ||
      !isNonNegativeInteger(record.final_score.away) ||
      record.final_score.home < record.score_at_recommendation.home ||
      record.final_score.away < record.score_at_recommendation.away) {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.SCORE_INVALID };
  }
  if (record.settlement_outcome === 'PENDING' || record.settlement_outcome === 'INVALID') {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.SETTLEMENT_NOT_RESOLVED };
  }
  if (record.settlement_outcome !== 'WIN' && record.settlement_outcome !== 'LOSE') {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.SETTLEMENT_NOT_BINARY };
  }
  const predictionTimestamp = Date.parse(record.prediction_at);
  const settlementTimestamp = Date.parse(record.settled_at);
  if (!Number.isFinite(predictionTimestamp) || !Number.isFinite(settlementTimestamp) || predictionTimestamp >= settlementTimestamp) {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.PREDICTION_TIMESTAMP_INVALID };
  }
  if (record.stage === 'LIVE' && (record.minute === null || !Number.isInteger(record.minute) || record.minute < 0 || record.minute > 130)) {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.LIVE_MINUTE_INVALID };
  }
  if (record.stage === 'PREMATCH' && record.minute !== null) {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.LIVE_MINUTE_INVALID };
  }
  if (!Number.isFinite(record.model_probability) || record.model_probability < 0 || record.model_probability > 1) {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.MODEL_PROBABILITY_INVALID };
  }
  if (!Number.isFinite(record.predicted_lambda) || record.predicted_lambda < 0) {
    return { record_id: record.record_id, reason: HistoricalSampleRejectionReason.PREDICTED_LAMBDA_INVALID };
  }
  return undefined;
}

function toOosSample(record: HistoricalBacktestRecord): OosCalibrationSample {
  const observedGoals = record.stage === 'LIVE'
    ? record.final_score.home + record.final_score.away - record.score_at_recommendation.home - record.score_at_recommendation.away
    : record.final_score.home + record.final_score.away;
  return Object.freeze({
    sample_id: record.record_id,
    model_version: record.model_version,
    prediction_at: record.prediction_at,
    league_key: record.league_key,
    home_team_key: record.home_team_key,
    away_team_key: record.away_team_key,
    stage: record.stage,
    minute: record.minute,
    score_state: `${record.score_at_recommendation.home}-${record.score_at_recommendation.away}`,
    red_card_state: record.red_card_state,
    market: record.market,
    model_probability: record.model_probability,
    outcome: record.settlement_outcome === 'WIN' ? 1 : 0,
    predicted_lambda: record.predicted_lambda,
    observed_goals: observedGoals
  });
}

/** Converts only auditable, settled formal recommendations into Layer 03 OOS samples. */
export function ingestHistoricalBacktestRecords(
  records: readonly HistoricalBacktestRecord[],
  archiveOptions: OosArchiveBuildOptions
): HistoricalOosIngestionResult {
  const acceptedSamples: OosCalibrationSample[] = [];
  const rejectedRecords: HistoricalSampleRejection[] = [];
  for (const record of records) {
    const rejection = rejectionFor(record);
    if (rejection !== undefined) {
      rejectedRecords.push(Object.freeze(rejection));
    } else {
      acceptedSamples.push(toOosSample(record));
    }
  }
  const calibrationArchive = acceptedSamples.length === 0
    ? undefined
    : buildOosCalibrationArchive(acceptedSamples, archiveOptions);
  return Object.freeze({
    accepted_samples: Object.freeze(acceptedSamples),
    rejected_records: Object.freeze(rejectedRecords),
    calibration_archive: calibrationArchive
  });
}

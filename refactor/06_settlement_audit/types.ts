import { OosCalibrationArchive, OosCalibrationSample, OosMarket } from '../03_quant_engine/types.js';
import { HistoricalSampleRejectionReason } from './enums.js';

export type HistoricalRecordType = 'formal_ai_recommendation' | 'machine_candidate';
export type SettlementOutcome = 'WIN' | 'LOSE' | 'WIN_HALF' | 'LOSE_HALF' | 'PUSH' | 'PENDING' | 'INVALID';
export type SettlementBasis = 'FULL_MATCH' | 'REMAINING_GOALS' | 'REMAINING_PERIOD_DOMINANCE' | 'FULL_MATCH_NORMAL';

export interface VerifiedScore {
  home: number;
  away: number;
}

/** Layer 06 only accepts a resolved recommendation record, never a raw ledger object. */
export interface HistoricalBacktestRecord {
  record_id: string;
  record_type: HistoricalRecordType;
  /** Layer 06 OOS provenance gate: production-unlocked or cold-start exempt records are eligible. */
  candidate_pipeline_state: 'NO_POSITIVE_EV' | 'OOS_LOCKED' | 'DATA_LOCKED' | 'PRODUCTION_UNLOCKED' | 'COLD_START_PERMISSIVE';
  oos_status?: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'OOS_COLD_START_EXEMPT' | 'OOS_REJECTED';
  settled_record_provenance: 'SETTLED_LEDGER_ADAPTER_V1';
  formal_recommendation: boolean;
  model_version: string;
  prediction_at: string;
  settled_at: string;
  league_key: string;
  home_team_key: string;
  away_team_key: string;
  stage: 'PREMATCH' | 'LIVE';
  minute: number | null;
  score_at_recommendation: VerifiedScore;
  final_score: VerifiedScore;
  score_verified: boolean;
  red_card_state: string;
  market: OosMarket;
  settlement_market?: OosMarket;
  settlement_basis?: SettlementBasis;
  line?: string;
  odds?: number;
  model_probability: number;
  predicted_lambda: number;
  settlement_outcome: SettlementOutcome;
}

export interface HistoricalSampleRejection {
  record_id: string;
  reason: HistoricalSampleRejectionReason;
}

export interface HistoricalOosIngestionResult {
  accepted_samples: readonly OosCalibrationSample[];
  rejected_records: readonly HistoricalSampleRejection[];
  calibration_archive?: OosCalibrationArchive;
}

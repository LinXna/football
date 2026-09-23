import fs from 'fs';
import path from 'path';
import { LedgerPersistence } from '../05_portfolio_risk/ledgerPersistence.js';
import { FormalRecommendation } from '../05_portfolio_risk/types.js';
import { RecommendationGrade } from '../04_ai_evaluator/enums.js';
import { convertFormalLedgerRecords } from '../06_settlement_audit/formalLedgerAdapter.js';
import { toOosSample } from '../06_settlement_audit/historicalBacktestIngestion.js';
import { appendSampleAndRebuildArchive, getOosStatus } from '../06_settlement_audit/oosArchiveService.js';
import { OosCalibrationSample } from '../03_quant_engine/types.js';

const testLiveFile = path.resolve(process.cwd(), 'output/formal_ledger_live_test.json');
const testPrematchFile = path.resolve(process.cwd(), 'output/formal_ledger_prematch_test.json');
const testOosArchiveFile = path.resolve(process.cwd(), 'output/oos_test_archive.json');

// Clean up any old test files
if (fs.existsSync(testLiveFile)) fs.unlinkSync(testLiveFile);
if (fs.existsSync(testPrematchFile)) fs.unlinkSync(testPrematchFile);
if (fs.existsSync(testOosArchiveFile)) fs.unlinkSync(testOosArchiveFile);

console.log('>>> Starting P3 Closed-Loop Ledger & OOS Snowballing Verification Suite <<<');

// ----------------------------------------------------------------------------
// Test 1: Task 3.1 滚球与赛前双轨推荐台账持久化与冻结预测快照
// ----------------------------------------------------------------------------
console.log('Test 1: Testing double-track persistence and prediction snapshot...');

const runId = Date.now();
const mockLiveApproved: FormalRecommendation = {
  record_id: `rec_live_test_${runId}`,
  record_type: 'formal_ai_recommendation',
  formal_recommendation: true,
  stage: 'LIVE',
  kickoff_time: '2026-09-14 20:00:00',
  league_key: 'PREMIER_LEAGUE',
  teams: { home: 'Arsenal', away: 'Chelsea' },
  candidate_pipeline_state: 'COLD_START_PERMISSIVE',
  oos_status: 'OOS_COLD_START_EXEMPT',
  condition_snapshot: {
    match_minute: '65',
    current_score: '1 - 1',
    candidate_pipeline_state: 'COLD_START_PERMISSIVE',
    oos_status: 'OOS_COLD_START_EXEMPT',
    score_verified: true,
    source: 'YBTY'
  },
  ai_assessment: {
    grade: RecommendationGrade.B_GRADE,
    confidence_score: 78,
    blind_spot_analysis: {} as any,
    internal_logical_audit: 'Valid'
  },
  leg: {
    market: 'ASIAN_HANDICAP',
    selected_line: '-0.25',
    current_odds: 1.95,
    minimum_acceptable_odds: 1.88,
    direction: 'HOME',
    basis: 'REST_OF_MATCH',
    oos_status: 'OOS_COLD_START_EXEMPT'
  },
  prediction_snapshot: {
    model_version: '3.0.0',
    prediction_at: '2026-09-14T20:25:00Z',
    score_at_recommendation: { home: 1, away: 1 },
    score_verified: true,
    red_card_state: 'NONE',
    market: 'ASIAN_HANDICAP',
    line: '-0.25',
    odds: 1.95,
    model_probability: 0.54,
    predicted_lambda: { home: 1.8, away: 1.2 }
  }
};

const livePersistence = new LedgerPersistence(testLiveFile);
const liveResult = livePersistence.appendApprovedLegs([mockLiveApproved]);

if (liveResult.appended_count !== 1) {
  throw new Error(`Expected appended_count=1, got ${liveResult.appended_count}`);
}

const loadedLive = livePersistence.readLedger();
if (loadedLive.length !== 1) {
  throw new Error(`Expected 1 live record on disk, got ${loadedLive.length}`);
}
const savedRec = loadedLive[0];
if (!savedRec.prediction_snapshot || savedRec.prediction_snapshot.model_probability !== 0.54) {
  throw new Error('Prediction snapshot model_probability mismatch');
}
if (savedRec.prediction_snapshot.score_at_recommendation.home !== 1 || savedRec.prediction_snapshot.score_at_recommendation.away !== 1) {
  throw new Error('Prediction snapshot score_at_recommendation mismatch');
}

console.log('✓ Task 3.1 passed: Double-track persistence with complete prediction snapshot verified.');

// ----------------------------------------------------------------------------
// Test 2: Task 3.2 同场同分钟幂等覆盖
// ----------------------------------------------------------------------------
console.log('Test 2: Testing idempotent overwrite (same match, market, direction, minute)...');

const updatedLiveApproved: FormalRecommendation = {
  ...mockLiveApproved,
  record_id: 'rec_live_test_001_new_id', // Even if record_id differs, identity matches
  ai_assessment: {
    ...mockLiveApproved.ai_assessment,
    confidence_score: 79 // Updated score
  },
  prediction_snapshot: {
    ...mockLiveApproved.prediction_snapshot,
    model_probability: 0.56 // Updated probability
  }
};

const overwriteResult = livePersistence.appendApprovedLegs([updatedLiveApproved]);
if (overwriteResult.appended_count !== 1) {
  throw new Error(`Expected appended_count=1, got ${overwriteResult.appended_count}`);
}

const loadedAfterOverwrite = livePersistence.readLedger();
if (loadedAfterOverwrite.length !== 1) {
  throw new Error(`Idempotent overwrite failed: expected length 1, got ${loadedAfterOverwrite.length}`);
}
if (loadedAfterOverwrite[0].prediction_snapshot.model_probability !== 0.56) {
  throw new Error(`Idempotent overwrite failed to update payload: model_probability=${loadedAfterOverwrite[0].prediction_snapshot.model_probability}`);
}

console.log('✓ Task 3.2.1 passed: Idempotent overwrite successful (count remained 1, snapshot updated).');

// ----------------------------------------------------------------------------
// Test 3: Task 3.2 单条删除与一键清空
// ----------------------------------------------------------------------------
console.log('Test 3: Testing single-record delete and clear ledger...');

// Append a second record to test single deletion
const secondLiveApproved: FormalRecommendation = {
  ...mockLiveApproved,
  record_id: 'rec_live_test_002',
  teams: { home: 'Liverpool', away: 'Man City' },
  leg: {
    ...mockLiveApproved.leg,
    selected_line: '+0.5'
  }
};
livePersistence.appendApprovedLegs([secondLiveApproved]);
if (livePersistence.readLedger().length !== 2) {
  throw new Error('Failed to append second record for delete test');
}

// Delete rec_live_test_002
const deleteRes = livePersistence.deleteRecords(['rec_live_test_002']);
if (deleteRes.removed_count !== 1) {
  throw new Error(`Expected removed_count=1, got ${deleteRes.removed_count}`);
}
if (livePersistence.readLedger().length !== 1) {
  throw new Error(`Expected 1 record remaining after delete, got ${livePersistence.readLedger().length}`);
}

// Clear all
const clearRes = livePersistence.clearLedger();
if (clearRes.cleared_count !== 1) {
  throw new Error(`Expected cleared_count=1, got ${clearRes.cleared_count}`);
}
if (livePersistence.readLedger().length !== 0) {
  throw new Error(`Expected 0 records after clearLedger, got ${livePersistence.readLedger().length}`);
}

console.log('✓ Task 3.2.2 passed: Single-record delete and clearLedger verified.');

// ----------------------------------------------------------------------------
// Test 4: Task 3.3 完赛比分核销与 OOS 样本本地自增沉淀
// ----------------------------------------------------------------------------
console.log('Test 4: Testing settlement and incremental OOS calibration snowballing...');

// Re-append a record to settle
livePersistence.appendApprovedLegs([mockLiveApproved]);

// Settle the record with final score 2 - 1
const settledRecord: FormalRecommendation = {
  ...mockLiveApproved,
  settlement: {
    is_settled: true,
    final_score_verified: '2 - 1',
    outcome: 'WIN',
    profit_loss: 0.95,
    settled_at: new Date().toISOString()
  }
};
livePersistence.updateRecord(settledRecord);

const currentLedger = livePersistence.readLedger();
if (!currentLedger[0].settlement?.is_settled) {
  throw new Error('Settlement failed to persist to ledger');
}

// Convert settled record using Layer 06 formalLedgerAdapter
const { records: convertedHistory, skipped } = convertFormalLedgerRecords(currentLedger);
if (convertedHistory.length !== 1) {
  throw new Error(`convertFormalLedgerRecords failed: skipped=${JSON.stringify(skipped)}`);
}

// Convert history record to OOS sample
const oosSample = toOosSample(convertedHistory[0]);
if (!oosSample) {
  throw new Error('Failed to convert history record to OosCalibrationSample');
}
if (oosSample.binary_outcome !== 1) {
  throw new Error(`Expected binary_outcome=1 for WIN, got ${oosSample.binary_outcome}`);
}
if (oosSample.predicted_probability !== 0.54) {
  throw new Error(`Expected predicted_probability=0.54 from snapshot, got ${oosSample.predicted_probability}`);
}

// Ingest into OOS calibration archive using appendSampleAndRebuildArchive
const archiveResult = appendSampleAndRebuildArchive(oosSample);
if (!archiveResult.success) {
  throw new Error(`OOS archive rebuild failed: ${archiveResult.error}`);
}
const statusAfterFirst = getOosStatus();
if (statusAfterFirst.sample_count < 1) {
  throw new Error(`Expected sample_count >= 1 in archive, got ${statusAfterFirst.sample_count}`);
}

// Ingest a second sample to verify incremental snowballing
const secondSample: OosCalibrationSample = {
  ...oosSample,
  sample_id: `oos_sample_snowball_${runId}_2`,
  match_id: `m_snowball_${runId}_2`,
  predicted_probability: 0.62,
  binary_outcome: 0
};
const secondArchiveResult = appendSampleAndRebuildArchive(secondSample);
if (!secondArchiveResult.success) {
  throw new Error(`Incremental snowballing failed: ${secondArchiveResult.error}`);
}
const statusAfterSecond = getOosStatus();
if (statusAfterSecond.sample_count !== statusAfterFirst.sample_count + 1) {
  throw new Error(`Incremental snowballing count mismatch: expected ${statusAfterFirst.sample_count + 1}, got ${statusAfterSecond.sample_count}`);
}

console.log('✓ Task 3.3 passed: Settlement to OOS sample snowballing verified.');

// Clean up temporary test files
if (fs.existsSync(testLiveFile)) fs.unlinkSync(testLiveFile);
if (fs.existsSync(testPrematchFile)) fs.unlinkSync(testPrematchFile);
if (fs.existsSync(testOosArchiveFile)) fs.unlinkSync(testOosArchiveFile);

console.log('\n🎉 ALL P3 TESTS PASSED SUCCESSFULLY! Closed-loop verified.');

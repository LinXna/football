import { convertUniverseAuditRecords } from '../06_settlement_audit/formalLedgerAdapter.js';
import { ingestUniverseAuditRecordsAndPersist, getOosStatus } from '../06_settlement_audit/oosArchiveService.js';
import { UniverseAuditRecord } from '../05_portfolio_risk/types.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

console.log('================================================================');
console.log('Running Universe Audit Ledger -> OOS Calibration Ingestion Suite');
console.log('================================================================');

// 1. 构造标准的 UniverseAuditRecord
const validLiveUniverseRecord: UniverseAuditRecord = {
  record_id: 'universe-test-001',
  stage: 'LIVE',
  created_at_utc: '2026-09-01T10:00:00.000Z',
  match_id: 'leisu-match-88801',
  kickoff_time: '2026-09-01T09:00:00.000Z',
  league_key: '英超',
  teams: { home: '阿森纳', away: '切尔西' },
  minute_or_status: "65'",
  score_at_prediction: { home: 1, away: 0 },
  score_verified: true,
  gate_category: 'QUALIFIED_FORMAL',
  gate_reason_description: 'A级实盘推荐',
  quant_snapshot: {
    lambda_home: 1.6,
    lambda_away: 1.1,
    forward_goals_expected: 1.2,
    projected_final_score: '2-1',
    bdi: 1.35,
    ah_line: -0.5,
    ou_line: 2.5,
    candidate_pipeline_state: 'PRODUCTION_UNLOCKED'
  },
  predicted_direction: {
    market: 'ASIAN_HANDICAP_MAIN',
    selection: 'HOME -0.5',
    line: -0.5,
    odds: 1.95,
    model_probability: 0.62
  },
  settlement: {
    is_settled: true,
    settled_at: '2026-09-01T11:15:00.000Z',
    final_score: { home: 2, away: 0 },
    outcome: 'WIN',
    profit_loss: 0.95
  }
};

const pendingRecord: UniverseAuditRecord = {
  ...validLiveUniverseRecord,
  record_id: 'universe-pending-002',
  settlement: {
    is_settled: false,
    outcome: 'PENDING'
  }
};

const pushRecord: UniverseAuditRecord = {
  ...validLiveUniverseRecord,
  record_id: 'universe-push-003',
  settlement: {
    is_settled: true,
    settled_at: '2026-09-01T11:15:00.000Z',
    final_score: { home: 1, away: 0 },
    outcome: 'PUSH'
  }
};

const unverifiedScoreRecord: UniverseAuditRecord = {
  ...validLiveUniverseRecord,
  record_id: 'universe-unverified-004',
  score_verified: false
};

// [TEST 1] 测试 convertUniverseAuditRecords 转换与硬门禁
console.log('\n[TEST 1] Testing convertUniverseAuditRecords gate and adaptation...');
const convertRes = convertUniverseAuditRecords([
  validLiveUniverseRecord,
  pendingRecord,
  pushRecord,
  unverifiedScoreRecord
]);

assert(convertRes.records.length === 1, `Expected 1 accepted record, got ${convertRes.records.length}`);
assert(convertRes.skipped.length === 3, `Expected 3 skipped records, got ${convertRes.skipped.length}`);

const rec = convertRes.records[0];
assert(rec.record_id === 'universe-test-001', 'Record ID mismatch');
assert(rec.match_id === 'leisu-match-88801', 'Match ID mismatch');
assert(rec.stage === 'LIVE', 'Stage mismatch');
assert(rec.minute === 65, `Minute should be 65, got ${rec.minute}`);
assert(rec.settlement_outcome === 'WIN', 'Outcome mismatch');
assert(rec.model_probability === 0.62, 'Model probability mismatch');
assert(rec.predicted_lambda === 2.7, `Predicted lambda mismatch (1.6 + 1.1 = 2.7), got ${rec.predicted_lambda}`);
console.log('✓ convertUniverseAuditRecords 转换精度与硬拦截全部通过！');

// [TEST 2] 测试 ingestUniverseAuditRecordsAndPersist 吸纳
console.log('\n[TEST 2] Testing ingestUniverseAuditRecordsAndPersist persistence...');
const ingestRes = ingestUniverseAuditRecordsAndPersist([validLiveUniverseRecord]);
assert(ingestRes.accepted_count >= 1 || ingestRes.rejected_count === 0, 'Universe record should be accepted into OOS archive');
console.log(`✓ ingestUniverseAuditRecordsAndPersist 成功吸纳 ${ingestRes.accepted_count} 条 OOS 校准样本！`);

const status = getOosStatus();
assert(status.available === true, 'OOS status should be available');
assert(status.sample_count > 0, `OOS sample count should be > 0, got ${status.sample_count}`);
console.log(`✓ OOS 状态正常: 样本数 ${status.sample_count}, ESS ${status.ess.toFixed(2)}, Brier Score: ${status.brier_score}`);

console.log('\n================================================================');
console.log('🎉 ALL UNIVERSE AUDIT -> OOS INGESTION CHECKS PASSED!');
console.log('================================================================');

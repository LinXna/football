import { evaluateCandidatePipeline } from '../03_quant_engine/candidateStateMachine.js';
import { MatchStage } from '../02_canonical_model/enums.js';

const signal = { market: 'ASIAN_HANDICAP_MAIN', line: '0', side: 'home', odds: 2.0, ev: 0.08, confidence: 70, kelly_fraction: 0.02 };
const profile = {
  status: 'VALIDATED' as const, league_key: 'L', minute_band: 'LIVE_30_45', score_state: '0-0',
  market: 'ASIAN_HANDICAP_MAIN' as const, sample_size: 300, effective_sample_size: 300,
  oos_brier_score: 0.18, lambda_log_adjustment: 0
};
const common = {
  resolveOosMarket: () => 'ASIAN_HANDICAP_MAIN' as const,
  resolveOosProfile: () => profile, adjustedConfidence: 80, dataQualityScore: 90,
  modelStabilityScore: 85, canPriceMarket: true, liveStatsAvailable: true, stage: MatchStage.LIVE,
  hasEvidenceConflict: false, postGoalCooldownActive: false
};

// 1. 严格硬门禁模式校验 (permissiveOosMode: false)
const strictCases = [
  ['STRICT_NO_POSITIVE_EV', evaluateCandidatePipeline({ ...common, rawSignals: [], permissiveOosMode: false })],
  ['STRICT_OOS_LOCKED_NO_PROFILE', evaluateCandidatePipeline({ ...common, rawSignals: [signal], resolveOosProfile: () => undefined, permissiveOosMode: false })],
  ['STRICT_OOS_LOCKED_THIN', evaluateCandidatePipeline({ ...common, rawSignals: [signal], resolveOosProfile: () => ({ ...profile, effective_sample_size: 20 }), permissiveOosMode: false })],
  ['STRICT_DATA_LOCKED', evaluateCandidatePipeline({ ...common, rawSignals: [signal], dataQualityScore: 70, permissiveOosMode: false })],
  ['STRICT_PRODUCTION_UNLOCKED', evaluateCandidatePipeline({ ...common, rawSignals: [signal], permissiveOosMode: false })]
] as const;

const strictExpected = ['NO_POSITIVE_EV', 'OOS_LOCKED', 'OOS_LOCKED', 'DATA_LOCKED', 'PRODUCTION_UNLOCKED'];
for (let i = 0; i < strictCases.length; i += 1) {
  const [name, result] = strictCases[i];
  if (result.state !== strictExpected[i]) throw new Error(`${name}: unexpected state ${result.state}`);
}
if (strictCases[1][1].machine_candidate_signals.length !== 0) throw new Error('Strict: No-profile signal escaped OOS lock');
if (strictCases[2][1].machine_candidate_signals.length !== 0) throw new Error('Strict: Thin OOS signal escaped OOS lock');
if (strictCases[3][1].machine_candidate_signals.length !== 0) throw new Error('Strict: Data-locked signal escaped data gate');
if (strictCases[4][1].machine_candidate_signals.length !== 1) throw new Error('Strict: Validated signal failed to become machine candidate');
if (strictCases[0][1].edge_confidence_score !== 0 || strictCases[1][1].edge_confidence_score !== 0) throw new Error('Strict: Unvalidated OOS received non-zero edge confidence');

// 2. 样本累积期宽容软门禁模式校验 (permissiveOosMode: true / 默认行为)
const permissiveCases = [
  ['PERMISSIVE_NO_POSITIVE_EV', evaluateCandidatePipeline({ ...common, rawSignals: [] })],
  ['PERMISSIVE_COLD_START_NO_PROFILE', evaluateCandidatePipeline({ ...common, rawSignals: [signal], resolveOosProfile: () => undefined })],
  ['PERMISSIVE_COLD_START_THIN', evaluateCandidatePipeline({ ...common, rawSignals: [signal], resolveOosProfile: () => ({ ...profile, effective_sample_size: 20 }) })],
  ['PERMISSIVE_DATA_LOCKED', evaluateCandidatePipeline({ ...common, rawSignals: [signal], dataQualityScore: 70 })],
  ['PERMISSIVE_PRODUCTION_UNLOCKED', evaluateCandidatePipeline({ ...common, rawSignals: [signal] })],
  ['PERMISSIVE_UNSUPPORTED_MARKET_LOCKED', evaluateCandidatePipeline({ ...common, rawSignals: [signal], resolveOosMarket: () => undefined })]
] as const;

const permissiveExpected = ['NO_POSITIVE_EV', 'COLD_START_PERMISSIVE', 'COLD_START_PERMISSIVE', 'DATA_LOCKED', 'PRODUCTION_UNLOCKED', 'OOS_LOCKED'];
for (let i = 0; i < permissiveCases.length; i += 1) {
  const [name, result] = permissiveCases[i];
  if (result.state !== permissiveExpected[i]) throw new Error(`${name}: unexpected state ${result.state}`);
}
// P0-1 & P0-2 Invariants:
// In cold start permissive mode: machine_candidate_signals must be 0, research_candidate_signals must be 1, production_eligible must be false!
if (permissiveCases[1][1].machine_candidate_signals.length !== 0) throw new Error('Permissive: No-profile signal illegally promoted to machine candidate');
if (permissiveCases[1][1].research_candidate_signals.length !== 1) throw new Error('Permissive: No-profile signal failed to be captured as research candidate');
if (permissiveCases[1][1].production_eligible !== false) throw new Error('Permissive: No-profile signal illegally marked production_eligible');

if (permissiveCases[2][1].machine_candidate_signals.length !== 0) throw new Error('Permissive: Thin OOS signal illegally promoted to machine candidate');
if (permissiveCases[2][1].research_candidate_signals.length !== 1) throw new Error('Permissive: Thin OOS signal failed to be captured as research candidate');
if (permissiveCases[2][1].production_eligible !== false) throw new Error('Permissive: Thin OOS signal illegally marked production_eligible');

if (permissiveCases[3][1].machine_candidate_signals.length !== 0) throw new Error('Permissive: Data-locked signal escaped data quality gate');
if (permissiveCases[3][1].research_candidate_signals.length !== 1) throw new Error('Permissive: Data-locked signal failed to retain research candidates');
if (permissiveCases[3][1].production_eligible !== false) throw new Error('Permissive: Data-locked signal illegally marked production_eligible');
if (permissiveCases[4][1].machine_candidate_signals.length !== 1) throw new Error('Permissive: Validated mature signal failed to become machine candidate');
if (permissiveCases[4][1].production_eligible !== true) throw new Error('Permissive: Validated mature signal failed production_eligible');
if (permissiveCases[5][1].machine_candidate_signals.length !== 0) throw new Error('Permissive: Unsupported market escaped lock');

// 3. 滚球攻防三大约束致命硬门禁校验 (In-Play Trinity Hard Gate)
console.log('Testing In-Play Trinity Hard Gate...');
const trinityStatsMissing = evaluateCandidatePipeline({
  ...common,
  rawSignals: [signal],
  liveStatsAvailable: false,
  momentumPoints: 10,
  timelineEventsCount: 5
});
if (trinityStatsMissing.state !== 'DATA_LOCKED') throw new Error(`Trinity: Missing stats must trigger DATA_LOCKED, got ${trinityStatsMissing.state}`);
if (trinityStatsMissing.machine_candidate_signals.length !== 0) throw new Error('Trinity: Machine signals must be cleared');
if (trinityStatsMissing.research_candidate_signals.length !== 0) throw new Error('Trinity: Research signals must be cleared under fatal deficit');
if (!trinityStatsMissing.blockers.some((b) => b.includes('INPLAY_TRINITY_DATA_DEFICIT'))) {
  throw new Error('Trinity: Blocker must contain INPLAY_TRINITY_DATA_DEFICIT');
}

const trinityMomentumMissing = evaluateCandidatePipeline({
  ...common,
  rawSignals: [signal],
  liveStatsAvailable: true,
  momentumPoints: 0,
  timelineEventsCount: 5
});
if (trinityMomentumMissing.state !== 'DATA_LOCKED') throw new Error(`Trinity: Missing momentum must trigger DATA_LOCKED, got ${trinityMomentumMissing.state}`);
if (trinityMomentumMissing.machine_candidate_signals.length !== 0) throw new Error('Trinity: Momentum deficit machine signals must be cleared');
if (trinityMomentumMissing.research_candidate_signals.length !== 0) throw new Error('Trinity: Momentum deficit research signals must be cleared');
if (!trinityMomentumMissing.blockers.some((b) => b.includes('缺少危攻时序走势'))) {
  throw new Error('Trinity: Blocker must identify momentum deficit');
}

const trinityTimelineMissing = evaluateCandidatePipeline({
  ...common,
  rawSignals: [signal],
  liveStatsAvailable: true,
  momentumPoints: 10,
  timelineEventsCount: 0
});
if (trinityTimelineMissing.state !== 'DATA_LOCKED') throw new Error(`Trinity: Missing timeline must trigger DATA_LOCKED, got ${trinityTimelineMissing.state}`);
if (trinityTimelineMissing.machine_candidate_signals.length !== 0) throw new Error('Trinity: Timeline deficit machine signals must be cleared');
if (trinityTimelineMissing.research_candidate_signals.length !== 0) throw new Error('Trinity: Timeline deficit research signals must be cleared');
if (!trinityTimelineMissing.blockers.some((b) => b.includes('缺少比赛关键事件时间轴'))) {
  throw new Error('Trinity: Blocker must identify timeline events deficit');
}
console.log('In-Play Trinity Hard Gate: PASS');

console.log('verify_candidate_state_machine: PASS (both strict and permissive modes verified)');

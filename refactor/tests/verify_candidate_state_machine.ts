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

const cases = [
  ['NO_POSITIVE_EV', evaluateCandidatePipeline({ ...common, rawSignals: [] })],
  ['OOS_LOCKED_NO_PROFILE', evaluateCandidatePipeline({ ...common, rawSignals: [signal], resolveOosProfile: () => undefined })],
  ['OOS_LOCKED_THIN', evaluateCandidatePipeline({ ...common, rawSignals: [signal], resolveOosProfile: () => ({ ...profile, effective_sample_size: 120 }) })],
  ['DATA_LOCKED', evaluateCandidatePipeline({ ...common, rawSignals: [signal], dataQualityScore: 70 })],
  ['PRODUCTION_UNLOCKED', evaluateCandidatePipeline({ ...common, rawSignals: [signal] })]
] as const;

const expected = ['NO_POSITIVE_EV', 'OOS_LOCKED', 'OOS_LOCKED', 'DATA_LOCKED', 'PRODUCTION_UNLOCKED'];
for (let i = 0; i < cases.length; i += 1) {
  const [name, result] = cases[i];
  if (result.state !== expected[i]) throw new Error(`${name}: unexpected state ${result.state}`);
}
if (cases[1][1].machine_candidate_signals.length !== 0) throw new Error('No-profile signal escaped OOS lock');
if (cases[2][1].machine_candidate_signals.length !== 0) throw new Error('Thin OOS signal escaped OOS lock');
if (cases[3][1].machine_candidate_signals.length !== 0) throw new Error('Data-locked signal escaped data gate');
if (cases[4][1].machine_candidate_signals.length !== 1) throw new Error('Validated signal failed to become machine candidate');
if (cases[0][1].edge_confidence_score !== 0 || cases[1][1].edge_confidence_score !== 0) throw new Error('Unvalidated OOS received non-zero edge confidence');
console.log('verify_candidate_state_machine: PASS');

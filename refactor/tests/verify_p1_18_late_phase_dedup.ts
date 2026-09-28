/**
 * P1-18 专项回归验证：终盘 late-game information 去耦
 *
 * 根因：late_game_dna（76-90' 进球占比）曾在两处被重复计权——
 *   1) time_fraction（DNA 时间积分）已编码 late_dna；
 *   2) resonanceMultiplier = 1.0 + (late_dna - 0.25) * 1.5 * C 额外放大 λ 15%~22.5%。
 * 修复：移除独立 resonanceMultiplier 乘子，保留「相干/退相干」作为 time_fraction 的条件门控。
 */
import assert from 'node:assert';
import { MatchStage } from '../02_canonical_model/enums.js';
import type { CanonicalMatch } from '../02_canonical_model/types.js';
import { calculateInPlayPoissonFeatures } from '../03_quant_engine/poissonDecayModel.js';

const lateMatch = {
  canonical_id: 'p1_18_late',
  home_team_name: 'Clutch Tigers FC',
  away_team_name: 'Iron Wall FC',
  timing: { minute: 78, stage: MatchStage.LIVE },
  score: { home_score: 0, away_score: 0, score_verified: true }
} as unknown as CanonicalMatch;

// 主队具备大样本终盘绝杀 DNA (76-90' 占比 35%)
const clutchContext = {
  goal_distribution_dna: {
    has_data: true,
    home_confidence: 'HIGH',
    away_confidence: 'HIGH',
    home_scored_weights: [0.10, 0.10, 0.10, 0.15, 0.20, 0.35],
    away_scored_weights: [0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1667],
    home_late_game_dna: 0.35,
    away_late_game_dna: 0.1667
  }
} as any;

const coherentState = {
  home_intensity: 0.85,
  away_intensity: 0.20,
  regime_multiplier_home: 1.25,
  regime_multiplier_away: 0.70,
  red_card_attack_multiplier_home: 1.0,
  red_card_attack_multiplier_away: 1.0,
  red_card_defense_leak_multiplier_home: 1.0,
  red_card_defense_leak_multiplier_away: 1.0,
  home_tti: 2.8,
  away_tti: 0.4,
  pyramid_slope: 20
} as any;

const incoherentState = {
  home_intensity: 0.15,
  away_intensity: 0.85,
  regime_multiplier_home: 0.45,
  regime_multiplier_away: 1.30,
  red_card_attack_multiplier_home: 0.40,
  red_card_attack_multiplier_away: 1.0,
  red_card_defense_leak_multiplier_home: 1.40,
  red_card_defense_leak_multiplier_away: 1.0,
  home_tti: 0.2,
  away_tti: 3.2,
  pyramid_slope: -25
} as any;

const poissonCoherent = calculateInPlayPoissonFeatures(lateMatch, clutchContext, coherentState);
const decompCoherent = poissonCoherent.lambda_decomposition;

// 1. 去耦：resonance_multiplier 字段必须已移除（late_dna 不再通过独立共振乘子额外放大 λ）
assert.ok(!('resonance_multiplier' in decompCoherent), 'P1-18: resonance_multiplier 字段必须已移除');
assert.ok(!('resonance_multiplier_home' in decompCoherent), 'P1-18: resonance_multiplier_home 字段必须已移除');

// 2. 条件门控保留：coherent_state / decoherence_applied 仍存在（现场物理仍门控 DNA 时间积分）
assert.equal(typeof decompCoherent.coherent_state_home, 'number', 'coherent_state_home 必须保留（条件门控）');
assert.equal(typeof decompCoherent.decoherence_applied_home, 'boolean', 'decoherence_applied_home 必须保留');

// 3. 现场相干时：late_dna 通过 time_fraction 编码终盘威胁（time_fraction > uniform），且不额外叠加共振放大
assert.ok(decompCoherent.coherent_state_home >= 0.90, `相干态应 >= 0.90，实际 ${decompCoherent.coherent_state_home}`);
assert.equal(decompCoherent.decoherence_applied_home, false, '现场相干时不得退相干');
// uniform 78' 剩余时间比例 = (90-78)/90 = 0.1333；DNA 编码后应显著更高（late_dna=0.35）
assert.ok(
  decompCoherent.time_fraction_home > 0.25,
  `late_dna 应通过 time_fraction 编码终盘威胁（> 0.25），实际 ${decompCoherent.time_fraction_home}`
);

// 4. 现场退相干时：time_fraction 收敛到均匀中性，且记录 decoherence
const poissonIncoherent = calculateInPlayPoissonFeatures(lateMatch, clutchContext, incoherentState);
const decompIncoherent = poissonIncoherent.lambda_decomposition;
assert.ok(decompIncoherent.coherent_state_home <= 0.10, `退相干态应 <= 0.10，实际 ${decompIncoherent.coherent_state_home}`);
assert.equal(decompIncoherent.decoherence_applied_home, true, '现场退相干必须记录 decoherence_applied');
assert.ok(
  decompIncoherent.time_fraction_home < 0.16,
  `退相干时 time_fraction 应收敛到均匀中性（< 0.16），实际 ${decompIncoherent.time_fraction_home}`
);

// 5. 去耦后，退相干场景的 lambda 仍被严格压制（条件门控生效，杜绝虚假 EV）
assert.ok(
  poissonIncoherent.lambda_home_rest < poissonCoherent.lambda_home_rest * 0.10,
  '退相干 lambda 必须 < 相干 lambda 的 10%'
);

console.log('✅ P1-18 late-phase information dedup verified');

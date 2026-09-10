import { MatchStage } from '../02_canonical_model/enums.js';
import {
  PositiveEVSignal,
  QuantCalibrationProfile,
  OosMarket,
  OOS_VALIDATION_MIN_ESS,
  PRODUCTION_MATURE_ESS
} from './types.js';

export { OOS_VALIDATION_MIN_ESS, PRODUCTION_MATURE_ESS };
export const OOS_MATURE_THRESHOLD = PRODUCTION_MATURE_ESS;

export type CandidatePipelineState =
  | 'NO_POSITIVE_EV'
  | 'OOS_LOCKED'
  | 'DATA_LOCKED'
  | 'PRODUCTION_UNLOCKED';

export interface CandidateOosValidation {
  market: OosMarket | null;
  status: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'INSUFFICIENT_EVIDENCE' | 'NO_PROFILE' | 'REJECTED' | 'UNSUPPORTED_MARKET' | 'VALIDATED';
  effective_sample_size: number;
  oos_brier_score: number | null;
  profile?: QuantCalibrationProfile;
  blockers: readonly string[];
}

export interface CandidatePipelineEvaluation {
  state: CandidatePipelineState;
  raw_signals: readonly PositiveEVSignal[];
  oos_validated_signals: readonly PositiveEVSignal[];
  permissive_unlocked_signals: readonly PositiveEVSignal[];
  machine_candidate_signals: readonly PositiveEVSignal[];
  validations: readonly CandidateOosValidation[];
  blockers: readonly string[];
  transitions: readonly { from: CandidatePipelineState | 'START'; to: CandidatePipelineState; reason: string }[];
  edge_confidence_score: number;
}

export interface CandidatePipelineEvaluationInput {
  readonly rawSignals: readonly PositiveEVSignal[];
  readonly resolveOosMarket: (signal: PositiveEVSignal) => OosMarket | undefined;
  readonly resolveOosProfile: (market: OosMarket) => QuantCalibrationProfile | undefined;
  readonly adjustedConfidence: number;
  readonly dataQualityScore: number;
  readonly modelStabilityScore: number;
  readonly canPriceMarket: boolean;
  readonly liveStatsAvailable: boolean;
  readonly stage: MatchStage;
  readonly hasEvidenceConflict: boolean;
  readonly postGoalCooldownActive: boolean;
  readonly permissiveOosMode?: boolean;
  readonly allowSecondaryLines?: boolean;
}

export function evaluateCandidatePipeline(input: CandidatePipelineEvaluationInput): CandidatePipelineEvaluation {
  const rawSignals = [...input.rawSignals];
  const permissive = input.permissiveOosMode ?? true;
  const allowSecondary = input.allowSecondaryLines ?? true;

  if (rawSignals.length === 0) {
    return Object.freeze({
      state: 'NO_POSITIVE_EV',
      raw_signals: Object.freeze([]),
      oos_validated_signals: Object.freeze([]),
      permissive_unlocked_signals: Object.freeze([]),
      machine_candidate_signals: Object.freeze([]),
      validations: Object.freeze([]),
      blockers: Object.freeze([]),
      transitions: Object.freeze([{ from: 'START' as const, to: 'NO_POSITIVE_EV' as const, reason: '没有数学上通过 EV 筛选的原始信号。' }]),
      edge_confidence_score: 0
    });
  }

  const validations: CandidateOosValidation[] = rawSignals.map((signal) => {
    // P1-01: 若系统策略明确关闭副盘，显式以 SECONDARY_LINE_POLICY_BLOCKED 阻断，不无声丢弃
    const isSecondary = signal.market === 'ASIAN_HANDICAP_SECONDARY' || signal.market === 'TOTAL_GOALS_SECONDARY';
    if (isSecondary && !allowSecondary) {
      return {
        market: null,
        status: 'UNSUPPORTED_MARKET',
        effective_sample_size: 0,
        oos_brier_score: null,
        blockers: Object.freeze(['SECONDARY_LINE_POLICY_BLOCKED: 系统策略当前未开放副盘推荐。'])
      };
    }

    const market = input.resolveOosMarket(signal);
    if (market === undefined) {
      return {
        market: null,
        status: 'UNSUPPORTED_MARKET',
        effective_sample_size: 0,
        oos_brier_score: null,
        blockers: Object.freeze(['该盘口没有对应的 OOS 校准市场定义；禁止生产解锁。'])
      };
    }

    const profile = input.resolveOosProfile(market);
    if (profile === undefined || profile.effective_sample_size === 0) {
      return {
        market,
        status: 'NO_PROFILE',
        effective_sample_size: profile?.effective_sample_size ?? 0,
        oos_brier_score: null,
        profile,
        blockers: Object.freeze([
          permissive
            ? '未匹配到有效 OOS calibration profile (处于样本累积期软门禁，允许降级打标放行)。'
            : '没有匹配到有效 OOS calibration profile。'
        ])
      };
    }

    if (profile.status === 'REJECTED') {
      return {
        market,
        status: 'REJECTED',
        effective_sample_size: profile.effective_sample_size,
        oos_brier_score: profile.oos_brier_score,
        profile,
        blockers: Object.freeze([`OOS profile 状态为 REJECTED。`])
      };
    }

    // P1-05: 区分 OOS_VALIDATION_MIN_ESS (30) 与 PRODUCTION_MATURE_ESS (200)
    if (profile.effective_sample_size < OOS_VALIDATION_MIN_ESS) {
      return {
        market,
        status: 'INSUFFICIENT_EVIDENCE',
        effective_sample_size: profile.effective_sample_size,
        oos_brier_score: profile.oos_brier_score,
        profile,
        blockers: Object.freeze([
          permissive
            ? `OOS 样本量 ${profile.effective_sample_size} < ${OOS_VALIDATION_MIN_ESS} (处于样本累积期软门禁，允许降级打标放行)。`
            : `OOS effective sample size ${profile.effective_sample_size} < ${OOS_VALIDATION_MIN_ESS}。`
        ])
      };
    }

    if (profile.oos_brier_score === null || !Number.isFinite(profile.oos_brier_score)) {
      return {
        market,
        status: 'REJECTED',
        effective_sample_size: profile.effective_sample_size,
        oos_brier_score: null,
        profile,
        blockers: Object.freeze(['OOS profile 缺少有效 brier score。'])
      };
    }

    const tieredStatus = profile.effective_sample_size >= PRODUCTION_MATURE_ESS
      ? 'PRODUCTION_MATURE'
      : 'OOS_VALIDATED';

    return {
      market,
      status: tieredStatus,
      effective_sample_size: profile.effective_sample_size,
      oos_brier_score: profile.oos_brier_score,
      profile,
      blockers: Object.freeze([])
    };
  });

  // 严格成熟验证信号（ESS >= 30 且通过 VALIDATED 门槛）
  const strictlyValidatedSignals = rawSignals.filter((_, index) => {
    const s = validations[index]?.status;
    return s === 'PRODUCTION_MATURE' || s === 'OOS_VALIDATED' || s === 'VALIDATED';
  });

  // 在宽容软门禁模式下放行的未达标信号 (NO_PROFILE 或 INSUFFICIENT_EVIDENCE)
  const permissiveUnlockedSignals = permissive
    ? rawSignals.filter((_, index) => {
        const v = validations[index];
        return v && (v.status === 'NO_PROFILE' || v.status === 'INSUFFICIENT_EVIDENCE');
      })
    : [];

  // 通过 OOS 阶段的所有有效信号索引
  const oosPassIndices = permissive
    ? rawSignals.map((_, i) => i).filter((i) => {
        const v = validations[i];
        return v && v.market !== null && v.status !== 'REJECTED' && v.status !== 'UNSUPPORTED_MARKET';
      })
    : rawSignals.map((_, i) => i).filter((i) => {
        const s = validations[i]?.status;
        return s === 'PRODUCTION_MATURE' || s === 'OOS_VALIDATED' || s === 'VALIDATED';
      });

  const oosPassSignals = oosPassIndices.map(i => rawSignals[i]);

  // 严格硬阻断列表（在严格模式下包含所有未 VALIDATED 的，宽容模式下只包含不可恢复的硬阻断如 UNSUPPORTED_MARKET / REJECTED）
  const oosHardBlockers = validations
    .filter((item) => permissive ? (item.status === 'REJECTED' || item.status === 'UNSUPPORTED_MARKET') : (item.status !== 'PRODUCTION_MATURE' && item.status !== 'OOS_VALIDATED' && item.status !== 'VALIDATED'))
    .flatMap((item) => item.blockers);
  const allOosBlockers = validations.filter((item) => item.status !== 'PRODUCTION_MATURE' && item.status !== 'OOS_VALIDATED' && item.status !== 'VALIDATED').flatMap((item) => item.blockers);

  const dataBlockers: string[] = [];
  if (!input.canPriceMarket) dataBlockers.push('当前比赛处于不可执行的停补时/暂停定价状态。');
  if (input.stage === MatchStage.LIVE && !input.liveStatsAvailable) dataBlockers.push('滚球缺少可用实时技术统计。');
  if (input.dataQualityScore < 80) dataBlockers.push(`数据质量 ${input.dataQualityScore} < 80。`);
  if (input.modelStabilityScore < 70) dataBlockers.push(`模型稳定性 ${input.modelStabilityScore} < 70。`);
  if (input.hasEvidenceConflict) dataBlockers.push('实时三源证据存在重大冲突。');
  if (input.postGoalCooldownActive) dataBlockers.push('进球后冷却窗口仍处于锁定期。');

  const oosHistoryScores = validations
    .filter((item): item is CandidateOosValidation & { profile: QuantCalibrationProfile; oos_brier_score: number } =>
      (item.status === 'PRODUCTION_MATURE' || item.status === 'OOS_VALIDATED' || item.status === 'VALIDATED') &&
      item.profile !== undefined && item.oos_brier_score !== null)
    .map((item) => Math.max(0, Math.min(100,
      (input.adjustedConfidence - (item.oos_brier_score * 100)) * Math.min(1, item.effective_sample_size / 1000)
    )));
  const edgeConfidenceScore = oosHistoryScores.length > 0
    ? Math.round(Math.max(0, Math.min(100, Math.max(...oosHistoryScores))))
    : 0;

  let state: CandidatePipelineState;
  const transitions: { from: CandidatePipelineState | 'START'; to: CandidatePipelineState; reason: string }[] = [
    { from: 'START', to: 'OOS_LOCKED', reason: '原始 +EV 已产生，进入逐条 OOS 校验。' }
  ];
  let machineCandidateSignals: readonly PositiveEVSignal[] = Object.freeze([]);
  const blockers = permissive
    ? [...oosHardBlockers, ...dataBlockers]
    : [...allOosBlockers, ...dataBlockers];

  if (oosPassSignals.length === 0) {
    state = 'OOS_LOCKED';
    transitions.push({
      from: 'OOS_LOCKED',
      to: 'OOS_LOCKED',
      reason: permissive
        ? '没有信号通过支持市场校验或所有信号被硬拦截拒绝。'
        : `没有任何原始 +EV 信号通过 VALIDATED OOS + ESS >= ${OOS_VALIDATION_MIN_ESS}。`
    });
  } else if (dataBlockers.length > 0) {
    transitions.push({
      from: 'OOS_LOCKED',
      to: 'DATA_LOCKED',
      reason: permissive
        ? '信号已通过软门禁放行，但执行数据/比赛状态门未通过。'
        : '至少一个信号已通过 OOS，但执行数据/比赛状态门未通过。'
    });
    state = 'DATA_LOCKED';
  } else {
    transitions.push({
      from: 'OOS_LOCKED',
      to: 'PRODUCTION_UNLOCKED',
      reason: permissive
        ? '信号通过软门禁放行与全部执行门禁，晋升进入生产推荐候选池。'
        : '至少一个信号通过 OOS 和全部执行门禁。'
    });
    state = 'PRODUCTION_UNLOCKED';

    // P1-09: 明确打标 oos_status，软门禁放行打标 PERMISSIVE_PASSED，不伪装成 VALIDATED
    machineCandidateSignals = Object.freeze(
      oosPassIndices.map((i) => {
        const raw = rawSignals[i];
        const valStatus = validations[i]?.status;
        let oosStatus: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'PERMISSIVE_PASSED' = 'PERMISSIVE_PASSED';
        if (valStatus === 'PRODUCTION_MATURE') {
          oosStatus = 'PRODUCTION_MATURE';
        } else if (valStatus === 'OOS_VALIDATED' || valStatus === 'VALIDATED') {
          oosStatus = 'OOS_VALIDATED';
        } else {
          oosStatus = 'PERMISSIVE_PASSED';
        }

        return Object.freeze({
          ...raw,
          oos_status: oosStatus
        });
      })
    );
  }

  return Object.freeze({
    state,
    raw_signals: Object.freeze(rawSignals),
    oos_validated_signals: Object.freeze(strictlyValidatedSignals),
    permissive_unlocked_signals: Object.freeze(permissiveUnlockedSignals),
    machine_candidate_signals: machineCandidateSignals,
    validations: Object.freeze(validations.map((item) => Object.freeze({ ...item }))),
    blockers: Object.freeze(blockers),
    transitions: Object.freeze(transitions),
    edge_confidence_score: edgeConfidenceScore
  });
}

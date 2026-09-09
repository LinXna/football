import { MatchStage } from '../02_canonical_model/enums.js';
import { PositiveEVSignal, QuantCalibrationProfile, OosMarket } from './types.js';

export const OOS_MATURE_THRESHOLD = 200;

export type CandidatePipelineState =
  | 'NO_POSITIVE_EV'
  | 'OOS_LOCKED'
  | 'DATA_LOCKED'
  | 'PRODUCTION_UNLOCKED';

export interface CandidateOosValidation {
  market: OosMarket | null;
  status: 'VALIDATED' | 'INSUFFICIENT_EVIDENCE' | 'REJECTED' | 'NO_PROFILE' | 'UNSUPPORTED_MARKET';
  effective_sample_size: number;
  oos_brier_score: number | null;
  profile?: QuantCalibrationProfile;
  blockers: readonly string[];
}

export interface CandidatePipelineEvaluation {
  state: CandidatePipelineState;
  raw_signals: readonly PositiveEVSignal[];
  oos_validated_signals: readonly PositiveEVSignal[];
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
}

export function evaluateCandidatePipeline(input: CandidatePipelineEvaluationInput): CandidatePipelineEvaluation {
  const rawSignals = [...input.rawSignals];
  const permissive = input.permissiveOosMode ?? true;

  if (rawSignals.length === 0) {
    return Object.freeze({
      state: 'NO_POSITIVE_EV',
      raw_signals: Object.freeze([]),
      oos_validated_signals: Object.freeze([]),
      machine_candidate_signals: Object.freeze([]),
      validations: Object.freeze([]),
      blockers: Object.freeze([]),
      transitions: Object.freeze([{ from: 'START' as const, to: 'NO_POSITIVE_EV' as const, reason: '没有数学上通过 EV 筛选的原始信号。' }]),
      edge_confidence_score: 0
    });
  }

  const validations: CandidateOosValidation[] = rawSignals.map((signal) => {
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
    if (profile === undefined) {
      return {
        market,
        status: 'NO_PROFILE',
        effective_sample_size: 0,
        oos_brier_score: null,
        blockers: Object.freeze([
          permissive
            ? '未匹配到 OOS calibration profile (处于样本累积期软门禁，允许降级打标放行)。'
            : '没有匹配到 OOS calibration profile。'
        ])
      };
    }
    if (profile.status !== 'VALIDATED') {
      return {
        market,
        status: profile.status,
        effective_sample_size: profile.effective_sample_size,
        oos_brier_score: profile.oos_brier_score,
        profile,
        blockers: Object.freeze([`OOS profile 状态为 ${profile.status}，不是 VALIDATED。`])
      };
    }
    if (profile.effective_sample_size < OOS_MATURE_THRESHOLD) {
      return {
        market,
        status: 'INSUFFICIENT_EVIDENCE',
        effective_sample_size: profile.effective_sample_size,
        oos_brier_score: profile.oos_brier_score,
        profile,
        blockers: Object.freeze([
          permissive
            ? `OOS 样本量 ${profile.effective_sample_size} < ${OOS_MATURE_THRESHOLD} (处于样本累积期软门禁，允许降级打标放行)。`
            : `OOS effective sample size ${profile.effective_sample_size} < ${OOS_MATURE_THRESHOLD}。`
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
    return {
      market,
      status: 'VALIDATED',
      effective_sample_size: profile.effective_sample_size,
      oos_brier_score: profile.oos_brier_score,
      profile,
      blockers: Object.freeze([])
    };
  });

  // 严格成熟验证信号（ESS >= 200 且 VALIDATED）
  const strictlyValidatedSignals = rawSignals.filter((_, index) => validations[index]?.status === 'VALIDATED');

  // 在宽容软门禁模式下：只要支持该盘口且未被明确 REJECTED，均允许通过 OOS 阶段放行进入数据门禁
  const oosPassSignals = permissive
    ? rawSignals.filter((_, index) => {
        const v = validations[index];
        return v && v.market !== null && v.status !== 'REJECTED' && v.status !== 'UNSUPPORTED_MARKET';
      })
    : strictlyValidatedSignals;

  // 严格硬阻断列表（在严格模式下包含所有未 VALIDATED 的，宽容模式下只包含不可恢复的硬阻断如 UNSUPPORTED_MARKET / REJECTED）
  const oosHardBlockers = validations
    .filter((item) => permissive ? (item.status === 'REJECTED' || item.status === 'UNSUPPORTED_MARKET') : item.status !== 'VALIDATED')
    .flatMap((item) => item.blockers);
  const allOosBlockers = validations.filter((item) => item.status !== 'VALIDATED').flatMap((item) => item.blockers);

  const dataBlockers: string[] = [];
  if (!input.canPriceMarket) dataBlockers.push('当前比赛处于不可执行的停补时/暂停定价状态。');
  if (input.stage === MatchStage.LIVE && !input.liveStatsAvailable) dataBlockers.push('滚球缺少可用实时技术统计。');
  if (input.dataQualityScore < 80) dataBlockers.push(`数据质量 ${input.dataQualityScore} < 80。`);
  if (input.modelStabilityScore < 70) dataBlockers.push(`模型稳定性 ${input.modelStabilityScore} < 70。`);
  if (input.hasEvidenceConflict) dataBlockers.push('实时三源证据存在重大冲突。');
  if (input.postGoalCooldownActive) dataBlockers.push('进球后冷却窗口仍处于锁定期。');

  const oosHistoryScores = validations
    .filter((item): item is CandidateOosValidation & { status: 'VALIDATED'; profile: QuantCalibrationProfile; oos_brier_score: number } =>
      item.status === 'VALIDATED' && item.profile !== undefined && item.oos_brier_score !== null)
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
        : '没有任何原始 +EV 信号通过 VALIDATED OOS + ESS >= 200。'
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
    machineCandidateSignals = Object.freeze([...oosPassSignals]);
  }

  return Object.freeze({
    state,
    raw_signals: Object.freeze(rawSignals),
    oos_validated_signals: Object.freeze(oosPassSignals),
    machine_candidate_signals: machineCandidateSignals,
    validations: Object.freeze(validations.map((item) => Object.freeze({ ...item }))),
    blockers: Object.freeze(blockers),
    transitions: Object.freeze(transitions),
    edge_confidence_score: edgeConfidenceScore
  });
}

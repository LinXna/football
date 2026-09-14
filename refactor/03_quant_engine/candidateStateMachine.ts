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
  | 'COLD_START_PERMISSIVE'
  | 'PRODUCTION_UNLOCKED';

export interface CandidateOosValidation {
  market: OosMarket | null;
  market_type?: string;
  normalized_line?: string;
  side?: string;
  settlement_type?: string;
  oos_profile_key?: string;
  status: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'INSUFFICIENT_EVIDENCE' | 'NO_PROFILE' | 'REJECTED' | 'UNSUPPORTED_MARKET' | 'VALIDATED' | 'OOS_COLD_START_EXEMPT';
  effective_sample_size: number;
  oos_brier_score: number | null;
  profile?: QuantCalibrationProfile;
  blockers: readonly string[];
}

export interface CandidatePipelineEvaluation {
  state: CandidatePipelineState;
  raw_signals: readonly PositiveEVSignal[];
  research_candidate_signals: readonly PositiveEVSignal[];
  oos_validated_signals: readonly PositiveEVSignal[];
  permissive_unlocked_signals: readonly PositiveEVSignal[];
  cold_start_exempt_signals?: readonly PositiveEVSignal[];
  machine_candidate_signals: readonly PositiveEVSignal[];
  production_eligible: boolean;
  is_cold_start_unlocked?: boolean;
  validations: readonly CandidateOosValidation[];
  blockers: readonly string[];
  transitions: readonly { from: CandidatePipelineState | 'START'; to: CandidatePipelineState; reason: string }[];
  edge_confidence_score: number;
}

export function buildOosProfileKey(
  market: string,
  line: string,
  side: string,
  settlementType: string
): string {
  const normMarket = market.toUpperCase().replace('_MAIN', '').replace('_SECONDARY', '');
  const normLine = (line || '0').trim();
  const normSide = (side || '').toUpperCase().trim();
  const normSettlement = (settlementType || 'STANDARD').toUpperCase().trim();
  return `${normMarket}|${normLine}|${normSide}|${normSettlement}`;
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
  readonly isProductionReady?: boolean;
  readonly currentScore?: string;
  readonly snapshotTime?: string;
  readonly momentumPoints?: number;
  readonly timelineEventsCount?: number;
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
      research_candidate_signals: Object.freeze([]),
      production_eligible: false,
      validations: Object.freeze([]),
      blockers: Object.freeze([]),
      transitions: Object.freeze([{ from: 'START' as const, to: 'NO_POSITIVE_EV' as const, reason: '没有数学上通过 EV 筛选的原始信号。' }]),
      edge_confidence_score: 0
    });
  }

  const validations: CandidateOosValidation[] = rawSignals.map((signal) => {
    const isAh = signal.market.includes('ASIAN_HANDICAP');
    const isTotal = signal.market.includes('TOTAL_GOALS');
    const settlementType = isAh ? 'AH' : isTotal ? 'TOTAL' : '1X2';
    const oosProfileKey = buildOosProfileKey(signal.market, signal.line, signal.side, settlementType);

    // P1-01: 若系统策略明确关闭副盘，显式以 SECONDARY_LINE_POLICY_BLOCKED 阻断，不无声丢弃
    const isSecondary = signal.market === 'ASIAN_HANDICAP_SECONDARY' || signal.market === 'TOTAL_GOALS_SECONDARY';
    if (isSecondary && !allowSecondary) {
      return {
        market: null,
        market_type: signal.market,
        normalized_line: signal.line,
        side: signal.side,
        settlement_type: settlementType,
        oos_profile_key: oosProfileKey,
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
        market_type: signal.market,
        normalized_line: signal.line,
        side: signal.side,
        settlement_type: settlementType,
        oos_profile_key: oosProfileKey,
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
        market_type: signal.market,
        normalized_line: signal.line,
        side: signal.side,
        settlement_type: settlementType,
        oos_profile_key: oosProfileKey,
        status: permissive ? 'OOS_COLD_START_EXEMPT' : 'NO_PROFILE',
        effective_sample_size: profile?.effective_sample_size ?? 0,
        oos_brier_score: null,
        profile,
        blockers: Object.freeze([
          permissive
            ? '未匹配到历史 OOS 校准档案，处于样本累积期已启用 OOS_COLD_START_EXEMPT 豁免准入 (仅限 B 级试水)。'
            : '没有匹配到有效 OOS calibration profile。'
        ])
      };
    }

    if (profile.status === 'REJECTED') {
      return {
        market,
        market_type: signal.market,
        normalized_line: signal.line,
        side: signal.side,
        settlement_type: settlementType,
        oos_profile_key: oosProfileKey,
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
        market_type: signal.market,
        normalized_line: signal.line,
        side: signal.side,
        settlement_type: settlementType,
        oos_profile_key: oosProfileKey,
        status: permissive ? 'OOS_COLD_START_EXEMPT' : 'INSUFFICIENT_EVIDENCE',
        effective_sample_size: profile.effective_sample_size,
        oos_brier_score: profile.oos_brier_score,
        profile,
        blockers: Object.freeze([
          permissive
            ? `OOS 样本量 ${profile.effective_sample_size} < ${OOS_VALIDATION_MIN_ESS}，处于样本累积期已启用 OOS_COLD_START_EXEMPT 豁免准入 (仅限 B 级试水)。`
            : `OOS effective sample size ${profile.effective_sample_size} < ${OOS_VALIDATION_MIN_ESS}。`
        ])
      };
    }

    if (profile.oos_brier_score === null || !Number.isFinite(profile.oos_brier_score)) {
      return {
        market,
        market_type: signal.market,
        normalized_line: signal.line,
        side: signal.side,
        settlement_type: settlementType,
        oos_profile_key: oosProfileKey,
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
      market_type: signal.market,
      normalized_line: signal.line,
      side: signal.side,
      settlement_type: settlementType,
      oos_profile_key: oosProfileKey,
      status: tieredStatus,
      effective_sample_size: profile.effective_sample_size,
      oos_brier_score: profile.oos_brier_score,
      profile,
      blockers: Object.freeze([])
    };
  });

  // 严格成熟验证信号（ESS >= 200 且通过 PRODUCTION_MATURE 门槛，具备 A 级资质）
  const strictlyMatureSignals = rawSignals.filter((_, index) => {
    const s = validations[index]?.status;
    return s === 'PRODUCTION_MATURE';
  });

  // 严格有效验证信号（ESS >= 30 且通过 VALIDATED 门槛，具备 B 级资质）
  const strictlyValidatedSignals = rawSignals.filter((_, index) => {
    const s = validations[index]?.status;
    return s === 'PRODUCTION_MATURE' || s === 'OOS_VALIDATED' || s === 'VALIDATED';
  });

  // 冷启动豁免信号（在宽容软门禁模式下放行的未达标信号，具备 B 级试水资质）
  const coldStartExemptSignals = rawSignals.filter((_, index) => {
    const s = validations[index]?.status;
    return s === 'OOS_COLD_START_EXEMPT';
  });

  // 在宽容软门禁模式下放行的未达标信号 (NO_PROFILE, INSUFFICIENT_EVIDENCE 或 OOS_COLD_START_EXEMPT)
  const permissiveUnlockedSignals = permissive
    ? rawSignals.filter((_, index) => {
        const v = validations[index];
        return v && (v.status === 'NO_PROFILE' || v.status === 'INSUFFICIENT_EVIDENCE' || v.status === 'OOS_COLD_START_EXEMPT');
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
  if (input.stage === MatchStage.LIVE) {
    if (!input.liveStatsAvailable) {
      dataBlockers.push('INPLAY_TRINITY_DATA_DEFICIT: 滚球缺少可用实时攻防技术统计。');
    }
    if (input.momentumPoints !== undefined && input.momentumPoints <= 0) {
      dataBlockers.push('INPLAY_TRINITY_DATA_DEFICIT: 缺少危攻时序走势，滚球无法建立动量积分模型。');
    }
    if (input.timelineEventsCount !== undefined && input.timelineEventsCount <= 0) {
      dataBlockers.push('INPLAY_TRINITY_DATA_DEFICIT: 缺少比赛关键事件时间轴，滚球无法建立事件因果模型。');
    }
  }
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
  let researchCandidateSignals: readonly PositiveEVSignal[] = Object.freeze([]);
  let productionEligible = false;
  let isColdStartUnlocked = false;
  const blockers = permissive
    ? [...oosHardBlockers, ...dataBlockers]
    : [...allOosBlockers, ...dataBlockers];

  const scoreSnapshot = input.currentScore ?? '0-0';
  const snapshotTime = input.snapshotTime ?? new Date().toISOString();

  const buildResearchCandidateSignals = (): readonly PositiveEVSignal[] => {
    return Object.freeze(
      oosPassIndices.map((i) => {
        const raw = rawSignals[i];
        const valStatus = validations[i]?.status;
        let oosStatus: 'PRODUCTION_MATURE' | 'OOS_VALIDATED' | 'PERMISSIVE_PASSED' | 'OOS_COLD_START_EXEMPT' = 'PERMISSIVE_PASSED';
        if (valStatus === 'PRODUCTION_MATURE') {
          oosStatus = 'PRODUCTION_MATURE';
        } else if (valStatus === 'OOS_VALIDATED' || valStatus === 'VALIDATED') {
          oosStatus = 'OOS_VALIDATED';
        } else if (valStatus === 'OOS_COLD_START_EXEMPT') {
          oosStatus = 'OOS_COLD_START_EXEMPT';
        } else {
          oosStatus = 'PERMISSIVE_PASSED';
        }

        const isAh = raw.market.includes('ASIAN_HANDICAP');
        const settlementBasis = isAh ? ('REST_OF_MATCH' as const) : ('FULL_MATCH' as const);

        return Object.freeze({
          ...raw,
          oos_status: oosStatus,
          oos_profile_key: validations[i]?.oos_profile_key,
          line_at_signal: raw.line,
          side_at_signal: raw.side,
          odds_at_signal: raw.odds,
          score_at_signal: scoreSnapshot,
          score_at_bet: scoreSnapshot,
          line_at_bet: raw.line,
          odds_at_bet: raw.odds,
          settlement_basis: settlementBasis,
          snapshot_time: snapshotTime
        });
      })
    );
  };

  if (oosPassSignals.length === 0) {
    state = 'OOS_LOCKED';
    transitions.push({
      from: 'OOS_LOCKED',
      to: 'OOS_LOCKED',
      reason: permissive
        ? '没有信号通过支持市场校验或所有信号被硬拦截拒绝。'
        : `没有任何原始 +EV 信号通过 VALIDATED OOS + ESS >= ${OOS_VALIDATION_MIN_ESS}。`
    });
    productionEligible = false;
    machineCandidateSignals = Object.freeze([]);
    researchCandidateSignals = Object.freeze([]);
  } else if (dataBlockers.length > 0) {
    const hasTrinityDeficit = dataBlockers.some((b) => b.includes('INPLAY_TRINITY_DATA_DEFICIT'));
    transitions.push({
      from: 'OOS_LOCKED',
      to: 'DATA_LOCKED',
      reason: hasTrinityDeficit
        ? '滚球攻防三大约束(实时技术统计、危攻时序点阵、关键事件时间轴)存在缺失，触发致命数据锁。'
        : permissive
          ? '信号已通过软门禁放行，但执行数据/比赛状态门未通过。'
          : '至少一个信号已通过 OOS，但执行数据/比赛状态门未通过。'
    });
    state = 'DATA_LOCKED';
    productionEligible = false;
    machineCandidateSignals = Object.freeze([]);
    // 若触发滚球三大约束致命缺失，数据已损坏失真，连研究信号都清空，绝不使用伪中性数据脑补推演；其他常规数据/稳定性打折在冷启动宽容模式下保留研究候选
    researchCandidateSignals = (permissive && !hasTrinityDeficit) ? buildResearchCandidateSignals() : Object.freeze([]);
  } else {
    // 数据门禁已通过，严格按 OOS 成熟度区分 A 级生产与 B 级冷启动豁免放行
    const isProductionReady = input.isProductionReady !== false;
    if (strictlyMatureSignals.length > 0 && isProductionReady) {
      // 具备 A 级成熟资质的信号 (ESS >= 200)
      transitions.push({
        from: 'OOS_LOCKED',
        to: 'PRODUCTION_UNLOCKED',
        reason: '信号通过严格成熟 OOS 档案校验 (ESS >= 200) 与全部执行门禁，晋升进入生产推荐候选池 (A/B 级均可)。'
      });
      state = 'PRODUCTION_UNLOCKED';
      productionEligible = true;

      machineCandidateSignals = Object.freeze(
        strictlyMatureSignals.map((raw) => {
          const isAh = raw.market.includes('ASIAN_HANDICAP');
          const settlementBasis = isAh ? ('REST_OF_MATCH' as const) : ('FULL_MATCH' as const);
          return Object.freeze({
            ...raw,
            oos_status: 'PRODUCTION_MATURE' as const,
            line_at_signal: raw.line,
            side_at_signal: raw.side,
            odds_at_signal: raw.odds,
            score_at_signal: scoreSnapshot,
            score_at_bet: scoreSnapshot,
            line_at_bet: raw.line,
            odds_at_bet: raw.odds,
            settlement_basis: settlementBasis,
            snapshot_time: snapshotTime
          });
        })
      );
      researchCandidateSignals = buildResearchCandidateSignals();
    } else if (strictlyMatureSignals.length > 0 && !isProductionReady) {
      transitions.push({
        from: 'OOS_LOCKED',
        to: 'DATA_LOCKED',
        reason: '信号通过成熟 OOS 档案校验，但全局生产就绪门禁未通过 (isProductionReady=false)。'
      });
      state = 'DATA_LOCKED';
      productionEligible = false;
      machineCandidateSignals = Object.freeze([]);
      researchCandidateSignals = buildResearchCandidateSignals();
    } else if (strictlyValidatedSignals.length > 0 && isProductionReady) {
      // 具备 B 级初步验证资质的信号 (30 <= ESS < 200)
      transitions.push({
        from: 'OOS_LOCKED',
        to: 'PRODUCTION_UNLOCKED',
        reason: '信号通过初步 OOS 档案校验 (30 <= ESS < 200)，晋升进入生产推荐候选池 (封顶 B 级试水)。'
      });
      state = 'PRODUCTION_UNLOCKED';
      productionEligible = true;

      machineCandidateSignals = Object.freeze(
        strictlyValidatedSignals.map((raw) => {
          const isAh = raw.market.includes('ASIAN_HANDICAP');
          const settlementBasis = isAh ? ('REST_OF_MATCH' as const) : ('FULL_MATCH' as const);
          return Object.freeze({
            ...raw,
            oos_status: 'OOS_VALIDATED' as const,
            line_at_signal: raw.line,
            side_at_signal: raw.side,
            odds_at_signal: raw.odds,
            score_at_signal: scoreSnapshot,
            score_at_bet: scoreSnapshot,
            line_at_bet: raw.line,
            odds_at_bet: raw.odds,
            settlement_basis: settlementBasis,
            snapshot_time: snapshotTime
          });
        })
      );
      researchCandidateSignals = buildResearchCandidateSignals();
    } else if (permissive) {
      // P0-1 & P0-2 & P1: 冷启动软门禁状态，保留带有 OOS_COLD_START_EXEMPT 标签的研究候选
      transitions.push({
        from: 'OOS_LOCKED',
        to: 'COLD_START_PERMISSIVE',
        reason: '处于冷启动样本积累期，信号以研究级候选 (RESEARCH_CANDIDATE) 放行并授予 OOS_COLD_START_EXEMPT 豁免标签供下游 B 级试水准入。'
      });
      state = 'COLD_START_PERMISSIVE';
      productionEligible = false;
      machineCandidateSignals = Object.freeze([]);
      researchCandidateSignals = buildResearchCandidateSignals();
    } else {
      transitions.push({
        from: 'OOS_LOCKED',
        to: 'OOS_LOCKED',
        reason: '在严格模式下未达到生产成熟 OOS 验证标准。'
      });
      state = 'OOS_LOCKED';
      productionEligible = false;
      machineCandidateSignals = Object.freeze([]);
      researchCandidateSignals = Object.freeze([]);
    }
  }

  return Object.freeze({
    state,
    raw_signals: Object.freeze(rawSignals),
    research_candidate_signals: researchCandidateSignals,
    oos_validated_signals: Object.freeze(strictlyValidatedSignals),
    permissive_unlocked_signals: Object.freeze(permissiveUnlockedSignals),
    cold_start_exempt_signals: Object.freeze(coldStartExemptSignals),
    machine_candidate_signals: machineCandidateSignals,
    production_eligible: productionEligible,
    is_cold_start_unlocked: isColdStartUnlocked,
    validations: Object.freeze(validations.map((item) => Object.freeze({ ...item }))),
    blockers: Object.freeze(blockers),
    transitions: Object.freeze(transitions),
    edge_confidence_score: edgeConfidenceScore
  });
}

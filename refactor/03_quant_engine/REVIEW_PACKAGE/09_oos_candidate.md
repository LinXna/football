# 09 · OOS 校准 + 候选状态机 oosCalibrationEngine + candidateStateMachine

## 模块职责
持续学习闭环的校准层。oosCalibrationEngine=用历史结算样本算 Brier score + λ 对数校准，建立校准档案；candidateStateMachine=候选信号的双轨授权门禁(成熟轨 vs 冷启动轨)。

## 数据流位置
历史结算样本 → buildOosCalibrationArchive → QuantCalibrationProfile → selectOosCalibrationProfile → poissonDecayModel(oosMultiplier) + candidateStateMachine(门禁)。

## 核心逻辑
- Brier score：mean((model_prob - outcome)^2)，二元盲猜基准 0.25，>0.28 熔断。
- λ 对数校准：lambda_log_adjustment = log((observed+0.05)/(predicted+0.05))，仅对 TOTAL_GOALS 计算(让球/独赢返回 0)。
- 双轨授权：成熟轨(PRODUCTION_UNLOCKED, ESS>=200) vs 冷启动轨(COLD_START_PERMISSIVE, B级封顶+置信度79封顶)。
- 阶段隔离：赛前/滚球档案严格隔离，严禁跨阶段借用。

## 完整源码 · oosCalibrationEngine.ts（351 行）

`	ypescript
import { CanonicalMatch } from '../02_canonical_model/types.js';
import { CanonicalEventType, MatchStage } from '../02_canonical_model/enums.js';
import {
  OosCalibrationArchive,
  OosCalibrationSample,
  OosMarket,
  OosArchiveBuildOptions,
  QuantCalibrationProfile
} from './types.js';

const MIN_VALIDATED_SAMPLE_SIZE = 200;
const TEAM_SHRINKAGE_PRIOR_SIZE = 100;

/** 二元市场理论盲猜 Brier 得分为 0.25；超过 0.28 说明模型校准严重失效或发生分布漂移，强制触发熔断 */
export const BRIER_CIRCUIT_BREAKER_THRESHOLD = 0.28;

function minuteBand(stage: MatchStage, minute: number | null): string {
  if (stage === MatchStage.PREMATCH) return 'PREMATCH';
  if (minute === null) return 'LIVE_UNKNOWN';
  if (minute < 30) return 'LIVE_00_29';
  if (minute < 60) return 'LIVE_30_59';
  return 'LIVE_60_90';
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createProfile(
  samples: readonly OosCalibrationSample[],
  leagueKey: string,
  minuteBandKey: string,
  scoreState: string,
  redCardState: string,
  market: OosMarket,
  teamKey?: string,
  stage?: 'PREMATCH' | 'LIVE' | 'ALL'
): QuantCalibrationProfile {
  const probabilityErrors = samples.map((sample) => {
    return (sample.model_probability - sample.outcome) ** 2;
  });
  const predictedGoals = average(samples.map((sample) => sample.predicted_lambda));
  const observedGoals = average(samples.map((sample) => sample.observed_goals));
  const rawLogAdjustment = market === 'TOTAL_GOALS_MAIN'
    ? Math.log((observedGoals + 0.05) / (predictedGoals + 0.05))
    : 0;
  const shrinkageWeight = teamKey === undefined
    ? 1
    : samples.length / (samples.length + TEAM_SHRINKAGE_PRIOR_SIZE);
  const sampleSize = samples.length;
  const effectiveSampleSize = sampleSize;
  const oosBrierScore = Number(average(probabilityErrors).toFixed(6));

  const inferredStage: 'PREMATCH' | 'LIVE' | 'ALL' = stage ?? (
    minuteBandKey === 'PREMATCH' ? 'PREMATCH' : minuteBandKey.startsWith('LIVE_') ? 'LIVE' : 'ALL'
  );

  // 熔断判定：Brier 得分劣化熔断 (二元市场盲猜基准为 0.25，超过 0.28 说明校准严重劣化)
  const isBrierCircuitBroken = Number.isFinite(oosBrierScore) && oosBrierScore > BRIER_CIRCUIT_BREAKER_THRESHOLD;

  let status: 'VALIDATED' | 'INSUFFICIENT_EVIDENCE' | 'REJECTED';
  let circuitBreakerTriggered = false;
  let circuitBreakerReason: string | undefined = undefined;

  if (isBrierCircuitBroken) {
    status = 'REJECTED';
    circuitBreakerTriggered = true;
    circuitBreakerReason = `OOS Brier score ${oosBrierScore} > ${BRIER_CIRCUIT_BREAKER_THRESHOLD} 触发严重校准质量劣化熔断，强制阻断。`;
  } else if (effectiveSampleSize >= MIN_VALIDATED_SAMPLE_SIZE) {
    status = 'VALIDATED';
  } else {
    status = 'INSUFFICIENT_EVIDENCE';
  }

  return Object.freeze({
    status,
    stage: inferredStage,
    league_key: leagueKey,
    team_key: teamKey,
    minute_band: minuteBandKey,
    score_state: scoreState,
    red_card_state: redCardState,
    market,
    sample_size: sampleSize,
    effective_sample_size: effectiveSampleSize,
    oos_brier_score: oosBrierScore,
    lambda_log_adjustment: Number((rawLogAdjustment * shrinkageWeight).toFixed(6)),
    circuit_breaker_triggered: circuitBreakerTriggered,
    circuit_breaker_reason: circuitBreakerReason
  });
}

/** 基于已结算的 OOS 观测建立档案；不会修改传入样本。 */
export function buildOosCalibrationArchive(samples: readonly OosCalibrationSample[], options: OosArchiveBuildOptions): OosCalibrationArchive {
  const generatedTimestamp = Date.parse(options.generated_at);
  const trainingStartTimestamp = Date.parse(options.training_window_start_at);
  const trainingEndTimestamp = Date.parse(options.training_window_end_at);
  const predictionStartTimestamp = Date.parse(options.prediction_window_start_at);
  const predictionEndTimestamp = Date.parse(options.prediction_window_end_at);
  if (samples.length === 0) {
    throw new Error('OOS calibration requires at least one settled sample.');
  }
  if (!options.model_version.trim() || !Number.isFinite(generatedTimestamp) || !Number.isFinite(trainingStartTimestamp) ||
    !Number.isFinite(trainingEndTimestamp) || !Number.isFinite(predictionStartTimestamp) || !Number.isFinite(predictionEndTimestamp) ||
    trainingStartTimestamp > trainingEndTimestamp || trainingEndTimestamp >= predictionStartTimestamp ||
    predictionStartTimestamp > predictionEndTimestamp || predictionEndTimestamp > generatedTimestamp) {
    throw new Error('OOS calibration requires an ordered, non-overlapping training and prediction window plus a model version.');
  }
  if (samples.some((sample) => sample.outcome !== 0 && sample.outcome !== 1)) {
    throw new Error('OOS calibration outcomes must be binary market-event results.');
  }
  if (samples.some((sample) => !Number.isFinite(sample.model_probability) || sample.model_probability < 0 || sample.model_probability > 1)) {
    throw new Error('OOS calibration probabilities must be finite values in [0, 1].');
  }
  if (samples.some((sample) => !Number.isFinite(sample.predicted_lambda) || sample.predicted_lambda < 0 || !Number.isFinite(sample.observed_goals) || sample.observed_goals < 0)) {
    throw new Error('OOS calibration goal observations must be finite non-negative values.');
  }
  if (new Set(samples.map((sample) => sample.sample_id)).size !== samples.length) {
    throw new Error('OOS calibration sample IDs must be unique.');
  }
  if (samples.some((sample) => {
    const predictionTimestamp = Date.parse(sample.prediction_at);
    return !Number.isFinite(predictionTimestamp) || predictionTimestamp < predictionStartTimestamp || predictionTimestamp > predictionEndTimestamp;
  })) {
    throw new Error('OOS calibration samples must fall inside the declared prediction window.');
  }
  if (samples.some((sample) => sample.model_version !== options.model_version)) {
    throw new Error('OOS calibration samples must share the archive model version.');
  }

  // 【方案 5】统一两阶段校准档案隔离：严格隔离赛前 Prematch 样本与滚球 Live 样本
  const prematchSamples = samples.filter((s) => s.stage === 'PREMATCH');
  const liveSamples = samples.filter((s) => s.stage === 'LIVE');

  const prematchGlobalProfiles = new Map<OosMarket, QuantCalibrationProfile>();
  const liveGlobalProfiles = new Map<OosMarket, QuantCalibrationProfile>();
  const globalProfiles = new Map<OosMarket, QuantCalibrationProfile>();

  const allMarkets = Array.from(new Set(samples.map((sample) => sample.market)));

  for (const market of allMarkets) {
    const marketPrematch = prematchSamples.filter((sample) => sample.market === market);
    if (marketPrematch.length > 0) {
      prematchGlobalProfiles.set(
        market,
        createProfile(marketPrematch, 'GLOBAL', 'PREMATCH', 'ALL', 'ALL', market, undefined, 'PREMATCH')
      );
    }
    const marketLive = liveSamples.filter((sample) => sample.market === market);
    if (marketLive.length > 0) {
      liveGlobalProfiles.set(
        market,
        createProfile(marketLive, 'GLOBAL', 'LIVE_ALL', 'ALL', 'ALL', market, undefined, 'LIVE')
      );
    }

    const marketSamples = samples.filter((sample) => sample.market === market);
    const hasPrematch = marketPrematch.length > 0;
    const hasLive = marketLive.length > 0;
    const marketStage: 'PREMATCH' | 'LIVE' | 'ALL' = (hasPrematch && !hasLive) ? 'PREMATCH' : (!hasPrematch && hasLive) ? 'LIVE' : 'ALL';
    globalProfiles.set(
      market,
      createProfile(
        marketSamples,
        'GLOBAL',
        marketStage === 'PREMATCH' ? 'PREMATCH' : marketStage === 'LIVE' ? 'LIVE_ALL' : 'ALL',
        'ALL',
        'ALL',
        market,
        undefined,
        marketStage
      )
    );
  }

  // 默认全局 Profile 选定：兼容历史单一 global_profile 字段
  const firstSampleMarket = samples[0].market;
  const globalProfile = globalProfiles.get(firstSampleMarket) ?? (
    samples[0].stage === 'PREMATCH'
      ? prematchGlobalProfiles.get(firstSampleMarket)
      : liveGlobalProfiles.get(firstSampleMarket)
  );
  if (globalProfile === undefined) {
    throw new Error('Unable to create a global OOS calibration profile.');
  }

  // 分桶 Profile 构建：在 key 中显式隔离 stage，杜绝赛前/滚球分桶混淆
  const buckets = new Map<string, OosCalibrationSample[]>();
  for (const sample of samples) {
    const band = minuteBand(sample.stage === 'LIVE' ? MatchStage.LIVE : MatchStage.PREMATCH, sample.minute);
    const key = [sample.stage, sample.league_key, band, sample.score_state, sample.red_card_state, sample.market].join('|');
    const existing = buckets.get(key) ?? [];
    buckets.set(key, [...existing, sample]);
  }

  const profiles: QuantCalibrationProfile[] = [
    ...globalProfiles.values(),
    ...prematchGlobalProfiles.values(),
    ...liveGlobalProfiles.values()
  ];
  for (const [key, bucketSamples] of buckets) {
    const [sampleStage, leagueKey, band, scoreState, redCardState, market] = key.split('|');
    const stage = sampleStage as 'PREMATCH' | 'LIVE';
    profiles.push(createProfile(bucketSamples, leagueKey, band, scoreState, redCardState, market as OosMarket, undefined, stage));
    for (const teamKey of new Set(bucketSamples.flatMap((sample) => [sample.home_team_key, sample.away_team_key]))) {
      const teamSamples = bucketSamples.filter((sample) => sample.home_team_key === teamKey || sample.away_team_key === teamKey);
      profiles.push(createProfile(teamSamples, leagueKey, band, scoreState, redCardState, market as OosMarket, teamKey, stage));
    }
  }

  return Object.freeze({
    schema_version: 1,
    archive_provenance: 'OOS_ARCHIVE_BUILDER_V1',
    generated_at: options.generated_at,
    model_version: options.model_version,
    training_window_start_at: options.training_window_start_at,
    training_window_end_at: options.training_window_end_at,
    prediction_window_start_at: options.prediction_window_start_at,
    prediction_window_end_at: options.prediction_window_end_at,
    training_cutoff_at: options.training_window_end_at,
    global_profile: globalProfile,
    global_profiles: Object.freeze([...globalProfiles.values()]),
    prematch_global_profiles: Object.freeze([...prematchGlobalProfiles.values()]),
    live_global_profiles: Object.freeze([...liveGlobalProfiles.values()]),
    profiles: Object.freeze(profiles)
  });
}

function redCardState(match: CanonicalMatch): string {
  const events = match.reference?.timeline_events ?? [];
  const isRedCard = (event: typeof events[number]): boolean =>
    event.canonical_type === CanonicalEventType.RED_CARD ||
    event.canonical_type === CanonicalEventType.RED_CARD_DIRECT ||
    event.canonical_type === CanonicalEventType.TWO_YELLOW_TO_RED ||
    event.canonical_type === CanonicalEventType.RED_CARD_SECOND_YELLOW;
  const home = events.filter((event) => event.side === 'home' && isRedCard(event)).length;
  const away = events.filter((event) => event.side === 'away' && isRedCard(event)).length;
  return `${home}-${away}`;
}

/** 精确分桶优先；主队/客队档案按收缩后的样本量择优；不匹配时仅可回退同阶段已验证全局档案。 */
export function selectOosCalibrationProfile(
  archive: OosCalibrationArchive | undefined,
  match: CanonicalMatch,
  market: OosMarket
): QuantCalibrationProfile | undefined {
  if (archive === undefined || archive.schema_version !== 1 ||
      archive.archive_provenance !== 'OOS_ARCHIVE_BUILDER_V1') return undefined;

  // 严格在准入时强制校验赛事时间戳是否落入 OOS 档案的预测窗口内
  const matchTimestamp = Date.parse(match.created_at);
  const predictionStart = Date.parse(archive.prediction_window_start_at);
  const predictionEnd = Date.parse(archive.prediction_window_end_at);
  if (
    !Number.isFinite(matchTimestamp) ||
    !Number.isFinite(predictionStart) ||
    !Number.isFinite(predictionEnd) ||
    matchTimestamp < predictionStart ||
    matchTimestamp > predictionEnd
  ) {
    return undefined; // 拒绝放行预测窗口之外的数据
  }

  // 【方案 5】统一两阶段严格分流目标
  const targetStage: 'PREMATCH' | 'LIVE' = match.timing.stage === MatchStage.PREMATCH ? 'PREMATCH' : 'LIVE';
  const band = minuteBand(match.timing.stage, match.timing.minute);
  const score = `${match.score.home_score}-${match.score.away_score}`;

  // 1. 优先在 profiles 中寻找精确/分桶候选（排除触发熔断的 profile，且严格杜绝跨阶段污染）
  const candidates = archive.profiles.filter((profile) => {
    if (profile.status !== 'VALIDATED' || profile.circuit_breaker_triggered) return false;
    // 跨阶段隔离防御：若 profile 有显式 stage 且不是 ALL，必须与 targetStage 完全一致
    if (profile.stage !== undefined && profile.stage !== 'ALL' && profile.stage !== targetStage) return false;
    // minute_band 阶段一致性防御：PREMATCH 的 band 必须为 PREMATCH；LIVE 的 band 不能为 PREMATCH
    if (targetStage === 'PREMATCH' && profile.minute_band !== 'PREMATCH' && profile.minute_band !== 'ALL') return false;
    if (targetStage === 'LIVE' && profile.minute_band === 'PREMATCH') return false;

    return (
      profile.league_key === match.league_name &&
      profile.minute_band === band &&
      profile.score_state === score &&
      profile.red_card_state === redCardState(match) &&
      profile.market === market &&
      (profile.team_key === undefined || profile.team_key === match.home_team_name || profile.team_key === match.away_team_name)
    );
  });

  const teamCandidate = candidates.filter((profile) => profile.team_key !== undefined)
    .sort((left, right) => right.sample_size - left.sample_size)[0];
  const bucketCandidate = candidates.find((profile) => profile.team_key === undefined);
  if (teamCandidate !== undefined) return teamCandidate;
  if (bucketCandidate !== undefined) return bucketCandidate;

  // 2. 降级回退到阶段隔离的全局档案 (Stage-Isolated Global Fallback)
  if (targetStage === 'PREMATCH') {
    // A. 专属 Prematch 全局档案
    const prematchGlobal = archive.prematch_global_profiles?.find((p) =>
      p.status === 'VALIDATED' && !p.circuit_breaker_triggered && p.market === market
    );
    if (prematchGlobal) return prematchGlobal;

    // B. 若无显式 prematch_global_profiles，检查 global_profiles 中 stage === 'PREMATCH' 的档案
    const candidateGlobal = archive.global_profiles?.find((p) =>
      p.status === 'VALIDATED' && !p.circuit_breaker_triggered && p.market === market &&
      (p.stage === 'PREMATCH' || (p.stage === 'ALL' && p.minute_band === 'PREMATCH'))
    );
    if (candidateGlobal) return candidateGlobal;

    // C. 兼容只有单一 global_profile 的历史档案，但必须验证其属于 PREMATCH 且未熔断
    if (
      archive.global_profile.status === 'VALIDATED' &&
      !archive.global_profile.circuit_breaker_triggered &&
      archive.global_profile.market === market &&
      (archive.global_profile.stage === 'PREMATCH' || archive.global_profile.minute_band === 'PREMATCH' ||
       (archive.global_profile.stage === 'ALL' && !archive.profiles.some(p => p.stage === 'LIVE')))
    ) {
      return archive.global_profile;
    }

    // 严禁借用 LIVE 全局档案！触发降级熔断返回 undefined
    return undefined;
  }

  // targetStage === 'LIVE'
  // A. 专属 Live 全局档案
  const liveGlobal = archive.live_global_profiles?.find((p) =>
    p.status === 'VALIDATED' && !p.circuit_breaker_triggered && p.market === market
  );
  if (liveGlobal) return liveGlobal;

  // B. 检查 global_profiles 中 stage === 'LIVE' 的档案
  const candidateGlobal = archive.global_profiles?.find((p) =>
    p.status === 'VALIDATED' && !p.circuit_breaker_triggered && p.market === market &&
    (p.stage === 'LIVE' || p.stage === 'ALL' || p.minute_band.startsWith('LIVE_'))
  );
  if (candidateGlobal) return candidateGlobal;

  // C. 兼容历史档案
  if (
    archive.global_profile.status === 'VALIDATED' &&
    !archive.global_profile.circuit_breaker_triggered &&
    archive.global_profile.market === market &&
    archive.global_profile.stage !== 'PREMATCH' &&
    archive.global_profile.minute_band !== 'PREMATCH'
  ) {
    return archive.global_profile;
  }

  // 严禁借用 PREMATCH 全局档案！触发降级熔断返回 undefined
  return undefined;
}

``r

## 完整源码 · candidateStateMachine.ts（561 行）

`	ypescript
import { MatchStage } from '../02_canonical_model/enums.js';
import {
  PositiveEVSignal,
  QuantCalibrationProfile,
  OosMarket,
  OOS_VALIDATION_MIN_ESS,
  PRODUCTION_MATURE_ESS
} from './types.js';
import { BRIER_CIRCUIT_BREAKER_THRESHOLD } from './oosCalibrationEngine.js';

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
  stage?: 'PREMATCH' | 'LIVE' | 'ALL';
  is_circuit_broken?: boolean;
  circuit_breaker_reason?: string;
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
/**
 * 解析信号的结算基准 (Settlement Basis)，与 06 层 SettlementBasis 语义严格对齐：
 * - 赛前 (PREMATCH) 任何市场 → FULL_MATCH (全场结算)
 * - 滚球 (LIVE) 让球 → REMAINING_PERIOD_DOMINANCE (后续时段让球，推荐后新增净胜结算)
 * - 滚球 (LIVE) 大小球 → REMAINING_GOALS (推荐后剩余进球结算)
 * - 其他 (独赢等) → FULL_MATCH
 * 遵循 AGENTS.md 规则 5/6：滚球大小球与后续时段让球不得按全场最终结果结算。
 */
export function resolveSettlementBasis(
  market: string,
  stage: MatchStage
): 'FULL_MATCH' | 'REMAINING_GOALS' | 'REMAINING_PERIOD_DOMINANCE' {
  if (stage === MatchStage.PREMATCH) return 'FULL_MATCH';
  if (market.includes('ASIAN_HANDICAP')) return 'REMAINING_PERIOD_DOMINANCE';
  if (market.includes('TOTAL_GOALS')) return 'REMAINING_GOALS';
  return 'FULL_MATCH';
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

    // 【方案 5】统一两阶段隔离：严格校验 stage 阶段一致性，杜绝跨阶段污染
    const expectedStage: 'PREMATCH' | 'LIVE' = input.stage === MatchStage.PREMATCH ? 'PREMATCH' : 'LIVE';
    if (profile.stage !== undefined && profile.stage !== 'ALL' && profile.stage !== expectedStage) {
      const reason = `跨阶段校准档案污染熔断：赛事处于 ${expectedStage} 但校准档案属于 ${profile.stage}。`;
      return {
        market,
        market_type: signal.market,
        normalized_line: signal.line,
        side: signal.side,
        settlement_type: settlementType,
        oos_profile_key: oosProfileKey,
        status: 'REJECTED',
        stage: profile.stage,
        is_circuit_broken: true,
        circuit_breaker_reason: reason,
        effective_sample_size: profile.effective_sample_size,
        oos_brier_score: profile.oos_brier_score,
        profile,
        blockers: Object.freeze([reason])
      };
    }

    // 【方案 5】校准质量劣化熔断硬门禁 (Brier > 0.28 或显式 circuit_breaker_triggered)
    if (
      profile.status === 'REJECTED' ||
      profile.circuit_breaker_triggered ||
      (profile.oos_brier_score !== null && profile.oos_brier_score > BRIER_CIRCUIT_BREAKER_THRESHOLD)
    ) {
      const reason = profile.circuit_breaker_reason || (
        profile.oos_brier_score !== null && profile.oos_brier_score > BRIER_CIRCUIT_BREAKER_THRESHOLD
          ? `OOS profile Brier 评分劣化熔断 (score ${profile.oos_brier_score} > ${BRIER_CIRCUIT_BREAKER_THRESHOLD})。`
          : `OOS profile 状态为 REJECTED。`
      );
      return {
        market,
        market_type: signal.market,
        normalized_line: signal.line,
        side: signal.side,
        settlement_type: settlementType,
        oos_profile_key: oosProfileKey,
        status: 'REJECTED',
        stage: profile.stage,
        is_circuit_broken: true,
        circuit_breaker_reason: reason,
        effective_sample_size: profile.effective_sample_size,
        oos_brier_score: profile.oos_brier_score,
        profile,
        blockers: Object.freeze([reason])
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
        stage: profile.stage,
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
        stage: profile.stage,
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
      stage: profile.stage,
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

        const settlementBasis = resolveSettlementBasis(raw.market, input.stage);

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
          const settlementBasis = resolveSettlementBasis(raw.market, input.stage);
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
          const settlementBasis = resolveSettlementBasis(raw.market, input.stage);
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

``r

## 魔法数字标注
- MIN_VALIDATED_SAMPLE_SIZE=200、TEAM_SHRINKAGE_PRIOR_SIZE=100、BRIER 熔断 0.28 —— 写死
- λ 校准的 +0.05 平滑 —— 写死
- 冷启动 B 级封顶、置信度 79 封顶 —— 写死

## 已知疑点
- 【B1】ρ 未接入 OOS MLE：rhoOverride 接口已留(见 poissonDecay.ts)，但这里没产出 ρ 的校准值。
- 【B2】λ 对数校准只对 TOTAL_GOALS 计算，让球(ASIAN_HANDICAP)/独赢(MONEYLINE)返回 0，校准覆盖面极窄。
- 当前样本库几乎为空(0 条 accepted OOS 样本)，所以整套校准实际未启用，走冷启动轨。
- 请重点审查：Brier 熔断 0.28 阈值、λ 校准只覆盖总进球是否合理、双轨授权的授权不变式。

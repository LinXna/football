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

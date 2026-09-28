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

/** P1-03：绝对 Brier 兜底熔断阈值。仅作为退化场景（baseline≈0，如 base rate 极端）与极端失准的兜底；
 *  正常判定以 Brier Skill Score 为主（跨市场/基准率可比）。 */
export const BRIER_CIRCUIT_BREAKER_THRESHOLD = 0.28;

/** P1-03：Brier Skill Score 熔断阈值。BSS = 1 - Brier_model / Brier_baseline；
 *  BSS < 0 表示模型预测劣于 climatology/market 基线（无技能），强制熔断。 */
export const BRIER_SKILL_CIRCUIT_BREAKER_THRESHOLD = 0;

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
  stage?: 'PREMATCH' | 'LIVE' | 'ALL',
  line?: string,
  side?: string
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
  // P1-02 修复：effectiveSampleSize 按「唯一比赛数」聚类（cluster ESS），
  // 同一场比赛的多个盘口/方向/时段高度相关，不能简单累加为独立样本。
  // 有 match_id 的样本按唯一 match_id 聚类；缺 match_id 的历史样本（跨层透传前的存量）退化为各自独立计数。
  const uniqueMatchIds = new Set<string>();
  let unclusteredCount = 0;
  for (const sample of samples) {
    const id = typeof sample.match_id === 'string' ? sample.match_id.trim() : '';
    if (id.length > 0) {
      uniqueMatchIds.add(id);
    } else {
      unclusteredCount += 1;
    }
  }
  const effectiveSampleSize = uniqueMatchIds.size + unclusteredCount;
  const oosBrierScore = Number(average(probabilityErrors).toFixed(6));

  const inferredStage: 'PREMATCH' | 'LIVE' | 'ALL' = stage ?? (
    minuteBandKey === 'PREMATCH' ? 'PREMATCH' : minuteBandKey.startsWith('LIVE_') ? 'LIVE' : 'ALL'
  );

  // P1-03 修复：Brier 熔断改用以基线为基准的 Brier Skill Score，而非固定 0.25 盲猜基准。
  // 不同市场/基准率不可比：固定 0.28 对罕见事件太宽松、对常见事件太严格。
  // 1) climatology 基线：base_rate = mean(outcome)，baseline = base_rate × (1 - base_rate)；
  // 2) market 基线：有 market_probability 时用 mean((market_prob - outcome)^2)，优先采用（更贴近真实可比基准）。
  const observedBaseRate = average(samples.map((sample) => sample.outcome));
  const climatologyBaseline = observedBaseRate * (1 - observedBaseRate);
  const marketBaselineSamples = samples.filter((sample) =>
    typeof sample.market_probability === 'number' &&
    Number.isFinite(sample.market_probability) &&
    sample.market_probability >= 0 && sample.market_probability <= 1
  );
  const hasMarketBaseline = marketBaselineSamples.length > 0;
  const marketBaseline = hasMarketBaseline
    ? Number(average(marketBaselineSamples.map((sample) => (sample.market_probability! - sample.outcome) ** 2)).toFixed(6))
    : NaN;
  const brierBaseline = hasMarketBaseline ? marketBaseline : Number(climatologyBaseline.toFixed(6));
  const baselineType: 'CLIMATOLOGY' | 'MARKET_IMPLIED' = hasMarketBaseline ? 'MARKET_IMPLIED' : 'CLIMATOLOGY';
  // BSS = 1 - Brier_model / Brier_baseline；baseline≈0 时 BSS 无定义，置 null（交由绝对 Brier 兜底）。
  const brierSkillScore = brierBaseline > 1e-9
    ? Number((1 - oosBrierScore / brierBaseline).toFixed(6))
    : null;

  // 主熔断：BSS 显著为负（模型劣于 climatology/market 基线，无技能）
  const isBrierSkillBroken = brierSkillScore !== null && brierSkillScore < BRIER_SKILL_CIRCUIT_BREAKER_THRESHOLD;
  // 兜底熔断：绝对 Brier 超过阈值（baseline 退化或极端失准时仍拦截）
  const isAbsoluteBrierBroken = Number.isFinite(oosBrierScore) && oosBrierScore > BRIER_CIRCUIT_BREAKER_THRESHOLD;
  const isBrierCircuitBroken = isBrierSkillBroken || isAbsoluteBrierBroken;

  let status: 'VALIDATED' | 'INSUFFICIENT_EVIDENCE' | 'REJECTED';
  let circuitBreakerTriggered = false;
  let circuitBreakerReason: string | undefined = undefined;

  if (isBrierCircuitBroken) {
    status = 'REJECTED';
    circuitBreakerTriggered = true;
    circuitBreakerReason = isBrierSkillBroken
      ? `OOS Brier Skill Score ${brierSkillScore} < ${BRIER_SKILL_CIRCUIT_BREAKER_THRESHOLD}（模型劣于 ${baselineType} 基线 ${brierBaseline}），触发严重校准质量劣化熔断，强制阻断。`
      : `OOS Brier score ${oosBrierScore} > ${BRIER_CIRCUIT_BREAKER_THRESHOLD} 触发严重校准质量劣化熔断（绝对兜底），强制阻断。`;
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
    brier_baseline: Number.isFinite(brierBaseline) ? brierBaseline : null,
    baseline_type: baselineType,
    brier_skill_score: brierSkillScore,
    lambda_log_adjustment: Number((rawLogAdjustment * shrinkageWeight).toFixed(6)),
    circuit_breaker_triggered: circuitBreakerTriggered,
    circuit_breaker_reason: circuitBreakerReason,
    line,
    side
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
    // P1-01 修复：分桶 key 纳入归一化盘口与方向，避免不同盘共用同一校准档案。
    const lineKey = sample.line ?? 'ALL';
    const sideKey = sample.side ?? 'ALL';
    const key = [sample.stage, sample.league_key, band, sample.score_state, sample.red_card_state, sample.market, lineKey, sideKey].join('|');
    const existing = buckets.get(key) ?? [];
    buckets.set(key, [...existing, sample]);
  }

  const profiles: QuantCalibrationProfile[] = [
    ...globalProfiles.values(),
    ...prematchGlobalProfiles.values(),
    ...liveGlobalProfiles.values()
  ];
  for (const [key, bucketSamples] of buckets) {
    const [sampleStage, leagueKey, band, scoreState, redCardState, market, lineKey, sideKey] = key.split('|');
    const stage = sampleStage as 'PREMATCH' | 'LIVE';
    const line = lineKey === 'ALL' ? undefined : lineKey;
    const side = sideKey === 'ALL' ? undefined : sideKey;
    profiles.push(createProfile(bucketSamples, leagueKey, band, scoreState, redCardState, market as OosMarket, undefined, stage, line, side));
    for (const teamKey of new Set(bucketSamples.flatMap((sample) => [sample.home_team_key, sample.away_team_key]))) {
      const teamSamples = bucketSamples.filter((sample) => sample.home_team_key === teamKey || sample.away_team_key === teamKey);
      profiles.push(createProfile(teamSamples, leagueKey, band, scoreState, redCardState, market as OosMarket, teamKey, stage, line, side));
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
  market: OosMarket,
  line?: string,
  side?: string
): QuantCalibrationProfile | undefined {
  if (archive === undefined || archive.schema_version !== 1 ||
      archive.archive_provenance !== 'OOS_ARCHIVE_BUILDER_V1') return undefined;

  // 严格在准入时强制校验赛事时间戳是否落入 OOS 档案的预测窗口内
  // P0-02 落地：优先使用 source_captured_at（数据源盘口快照时点，最接近「模型看到盘口/数据的预测时点」），
  // 缺失时回退 created_at（组装时点，语义较模糊）。建档案侧(buildOosCalibrationArchive)已用 sample.prediction_at 严格校验未来样本。
  const matchTimestamp = Date.parse(match.source_captured_at ?? match.created_at);
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
      (profile.team_key === undefined || profile.team_key === match.home_team_name || profile.team_key === match.away_team_name) &&
      // P1-01 修复：分桶档案（有 line/side）只匹配相同盘口/方向；全局聚合档案（无 line/side）匹配任何盘。
      (profile.line === undefined || profile.line === line) &&
      (profile.side === undefined || profile.side === side)
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

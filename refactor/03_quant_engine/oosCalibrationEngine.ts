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
  teamKey?: string
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
  return Object.freeze({
    status: effectiveSampleSize >= MIN_VALIDATED_SAMPLE_SIZE ? 'VALIDATED' : 'INSUFFICIENT_EVIDENCE',
    league_key: leagueKey,
    team_key: teamKey,
    minute_band: minuteBandKey,
    score_state: scoreState,
    red_card_state: redCardState,
    market,
    sample_size: sampleSize,
    effective_sample_size: effectiveSampleSize,
    oos_brier_score: Number(average(probabilityErrors).toFixed(6)),
    lambda_log_adjustment: Number((rawLogAdjustment * shrinkageWeight).toFixed(6))
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
  const globalProfiles = new Map<OosMarket, QuantCalibrationProfile>();
  for (const market of new Set(samples.map((sample) => sample.market))) {
    const marketSamples = samples.filter((sample) => sample.market === market);
    globalProfiles.set(market, createProfile(marketSamples, 'GLOBAL', 'ALL', 'ALL', 'ALL', market));
  }
  const globalProfile = globalProfiles.get(samples[0].market);
  if (globalProfile === undefined) {
    throw new Error('Unable to create a global OOS calibration profile.');
  }
  const buckets = new Map<string, OosCalibrationSample[]>();
  for (const sample of samples) {
    const band = minuteBand(sample.stage === 'LIVE' ? MatchStage.LIVE : MatchStage.PREMATCH, sample.minute);
    const key = [sample.league_key, band, sample.score_state, sample.red_card_state, sample.market].join('|');
    const existing = buckets.get(key) ?? [];
    buckets.set(key, [...existing, sample]);
  }
  const profiles: QuantCalibrationProfile[] = [...globalProfiles.values()];
  for (const [key, bucketSamples] of buckets) {
    const [leagueKey, band, scoreState, redCardState, market] = key.split('|');
    profiles.push(createProfile(bucketSamples, leagueKey, band, scoreState, redCardState, market as OosMarket));
    for (const teamKey of new Set(bucketSamples.flatMap((sample) => [sample.home_team_key, sample.away_team_key]))) {
      const teamSamples = bucketSamples.filter((sample) => sample.home_team_key === teamKey || sample.away_team_key === teamKey);
      profiles.push(createProfile(teamSamples, leagueKey, band, scoreState, redCardState, market as OosMarket, teamKey));
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

/** 精确分桶优先；主队/客队档案按收缩后的样本量择优；不匹配时仅可回退已验证全局档案。 */
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

  const band = minuteBand(match.timing.stage, match.timing.minute);
  const score = `${match.score.home_score}-${match.score.away_score}`;
  const candidates = archive.profiles.filter((profile) =>
    profile.status === 'VALIDATED' &&
    profile.league_key === match.league_name &&
    profile.minute_band === band &&
    profile.score_state === score &&
    profile.red_card_state === redCardState(match) &&
    profile.market === market &&
    (profile.team_key === undefined || profile.team_key === match.home_team_name || profile.team_key === match.away_team_name)
  );
  const teamCandidate = candidates.filter((profile) => profile.team_key !== undefined)
    .sort((left, right) => right.sample_size - left.sample_size)[0];
  const bucketCandidate = candidates.find((profile) => profile.team_key === undefined);
  if (teamCandidate !== undefined) return teamCandidate;
  if (bucketCandidate !== undefined) return bucketCandidate;
  const globalList = archive.global_profiles ?? [archive.global_profile];
  const globalCandidate = globalList.find((profile: QuantCalibrationProfile) =>
    profile.status === 'VALIDATED' && profile.market === market
  );
  return globalCandidate;
}

type Row = { createdAt: string; features: Record<string, number | null>; target: number };

const numeric = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function recentGoalAverage(snapshot: any): number | null {
  const recent = object(object(snapshot?.recent_trends).historical_analysis).recent_matches;
  const rows = [...(Array.isArray(recent?.home) ? recent.home : []), ...(Array.isArray(recent?.away) ? recent.away : [])].slice(0, 20);
  const values = rows.map((row: any) => numeric(row?.goals)).filter((value: number | null): value is number => value !== null);
  return values.length ? average(values) : null;
}

function h2hGoalAverage(snapshot: any): number | null {
  const rows = object(object(snapshot?.recent_trends).historical_analysis).head_to_head;
  if (!Array.isArray(rows)) return null;
  const values = rows.slice(0, 10).flatMap((row: any) => {
    const home = numeric(Array.isArray(row?.home_scores) ? row.home_scores[0] : null);
    const away = numeric(Array.isArray(row?.away_scores) ? row.away_scores[0] : null);
    return home === null || away === null ? [] : [home + away];
  });
  return values.length ? average(values) : null;
}

function standingPpgDifference(snapshot: any): number | null {
  const standings = object(object(object(snapshot?.recent_trends).historical_analysis).league_standings);
  const ppg = (team: any) => {
    const total = object(object(team).total);
    const games = numeric(total.total), points = numeric(total.points);
    return games && points !== null ? points / games : null;
  };
  const home = ppg(standings.home_team), away = ppg(standings.away_team);
  return home === null || away === null ? null : home - away;
}

export const INTERFACE_FEATURE_NAMES = [
  'minute', 'score_total', 'shots_on_target_total', 'shot_accuracy_home', 'shot_accuracy_away',
  'conversion_home', 'conversion_away', 'keeper_save_home', 'keeper_save_away',
  'dangerous_attack_total', 'dangerous_attack_difference', 'possession_difference',
  'recent_goal_average', 'h2h_goal_average', 'standing_ppg_difference', 'injury_count',
] as const;

export function extractCalibrationRows(ledger: any[]): Row[] {
  const seen = new Set<string>();
  return (Array.isArray(ledger) ? ledger : []).flatMap((item: any) => {
    const snapshot = object(item?.prediction_features);
    const finalScore = object(item?.review?.final_score);
    const currentScore = object(snapshot.score || item?.score_at_recommendation);
    const finalHome = numeric(finalScore.home), finalAway = numeric(finalScore.away);
    const currentHome = numeric(currentScore.home) ?? 0, currentAway = numeric(currentScore.away) ?? 0;
    const identity = String(item?.id || `${item?.created_at}|${item?.match}|${item?.minute}`);
    if (!snapshot.schema_version || finalHome === null || finalAway === null || seen.has(identity)) return [];
    seen.add(identity);
    const isLive = snapshot.mode === 'live' || Number(snapshot.minute || item?.minute || 0) > 0;
    const target = finalHome + finalAway - (isLive ? currentHome + currentAway : 0);
    if (target < 0) return [];
    const stats = object(snapshot.live_statistics);
    const efficiency = object(object(stats.efficiency).by_attacking_side);
    const homeAttack = object(object(efficiency.home).attack), awayAttack = object(object(efficiency.away).attack);
    const homeKeeper = object(object(efficiency.away).opposing_goalkeeper);
    const awayKeeper = object(object(efficiency.home).opposing_goalkeeper);
    const danger = object(stats.dangerous_attacks), possession = object(stats.possession), onTarget = object(stats.shots_on_target);
    const lineup = object(snapshot.lineups?.raw || snapshot.lineups);
    return [{
      createdAt: String(snapshot.captured_at || item?.created_at || ''), target,
      features: {
        minute: numeric(snapshot.minute || item?.minute), score_total: currentHome + currentAway,
        shots_on_target_total: (numeric(onTarget.home) ?? 0) + (numeric(onTarget.away) ?? 0),
        shot_accuracy_home: numeric(homeAttack.shot_accuracy), shot_accuracy_away: numeric(awayAttack.shot_accuracy),
        conversion_home: numeric(homeAttack.goal_conversion_per_recorded_shot), conversion_away: numeric(awayAttack.goal_conversion_per_recorded_shot),
        keeper_save_home: numeric(homeKeeper.save_rate), keeper_save_away: numeric(awayKeeper.save_rate),
        dangerous_attack_total: (numeric(danger.home) ?? 0) + (numeric(danger.away) ?? 0),
        dangerous_attack_difference: (numeric(danger.home) ?? 0) - (numeric(danger.away) ?? 0),
        possession_difference: (numeric(possession.home) ?? 50) - (numeric(possession.away) ?? 50),
        recent_goal_average: recentGoalAverage(snapshot), h2h_goal_average: h2hGoalAverage(snapshot),
        standing_ppg_difference: standingPpgDifference(snapshot),
        injury_count: (Array.isArray(lineup.home_injuries) ? lineup.home_injuries.length : 0) + (Array.isArray(lineup.away_injuries) ? lineup.away_injuries.length : 0),
      },
    }];
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function solve(matrix: number[][], vector: number[]): number[] | null {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < matrix.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < matrix.length; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    if (Math.abs(augmented[column][column]) < 1e-10) return null;
    const divisor = augmented[column][column];
    for (let index = column; index <= matrix.length; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < matrix.length; row += 1) if (row !== column) {
      const factor = augmented[row][column];
      for (let index = column; index <= matrix.length; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[matrix.length]);
}

export function buildInterfaceFeatureCalibration(ledger: any[], minimumSamples = 200) {
  const rows = extractCalibrationRows(ledger);
  const splitIndex = Math.floor(rows.length * 0.8);
  const train = rows.slice(0, splitIndex), test = rows.slice(splitIndex);
  const names = [...INTERFACE_FEATURE_NAMES];
  const coverage = Object.fromEntries(names.map((name) => [name, rows.length ? rows.filter((row) => row.features[name] !== null).length / rows.length : 0]));
  const usable = names.filter((name) => coverage[name] >= 0.8);
  const insufficient = rows.length < minimumSamples || test.length < 40 || usable.length < 2;
  if (insufficient) return {
    generated_at: new Date().toISOString(), status: 'insufficient_samples', active: false,
    sample_size: rows.length, train_size: train.length, test_size: test.length,
    minimum_samples: minimumSamples, feature_coverage: coverage, usable_features: usable,
    warning: '样本或字段覆盖不足；不生成系数，不改变预测。',
  };
  const means = Object.fromEntries(usable.map((name) => [name, average(train.map((row) => row.features[name]).filter((value): value is number => value !== null))]));
  const deviations = Object.fromEntries(usable.map((name) => {
    const values = train.map((row) => row.features[name] ?? means[name]);
    const variance = average(values.map((value) => (value - means[name]) ** 2));
    return [name, Math.sqrt(variance) || 1];
  }));
  const design = (row: Row) => [1, ...usable.map((name) => ((row.features[name] ?? means[name]) - means[name]) / deviations[name])];
  const x = train.map(design), y = train.map((row) => row.target), dimension = usable.length + 1;
  const xtx = Array.from({ length: dimension }, (_, i) => Array.from({ length: dimension }, (_, j) => x.reduce((sum, row) => sum + row[i] * row[j], 0)));
  for (let index = 1; index < dimension; index += 1) xtx[index][index] += 1;
  const xty = Array.from({ length: dimension }, (_, i) => x.reduce((sum, row, index) => sum + row[i] * y[index], 0));
  const beta = solve(xtx, xty);
  if (!beta) return { status: 'fit_failed', active: false, sample_size: rows.length, warning: '矩阵不可解；不改变预测。' };
  const baseline = average(y);
  const predict = (row: Row) => Math.max(0, design(row).reduce((sum, value, index) => sum + value * beta[index], 0));
  const rmse = (actual: number[], predicted: number[]) => Math.sqrt(average(actual.map((value, index) => (value - predicted[index]) ** 2)));
  const actual = test.map((row) => row.target), predictions = test.map(predict), baselinePredictions = test.map(() => baseline);
  const modelRmse = rmse(actual, predictions), baselineRmse = rmse(actual, baselinePredictions);
  const improvement = baselineRmse > 0 ? (baselineRmse - modelRmse) / baselineRmse : 0;
  const active = improvement >= 0.02;
  return {
    generated_at: new Date().toISOString(), status: active ? 'validated' : 'validation_failed', active,
    sample_size: rows.length, train_size: train.length, test_size: test.length,
    split: 'chronological_80_20', target: 'goals_after_snapshot', ridge_lambda: 1,
    feature_coverage: coverage, usable_features: usable, means, deviations,
    intercept: beta[0], coefficients: Object.fromEntries(usable.map((name, index) => [name, beta[index + 1]])),
    validation: { baseline_rmse: baselineRmse, model_rmse: modelRmse, relative_improvement: improvement },
    warning: active ? null : '留出集未比训练集均值基线改善至少2%；系数不启用。',
  };
}

export function predictCalibratedFutureGoals(report: any, features: Record<string, number | null>): number | null {
  if (report?.active !== true || report?.status !== 'validated' || !Array.isArray(report?.usable_features)) return null;
  const prediction = report.usable_features.reduce((sum: number, name: string) => {
    const mean = numeric(report?.means?.[name]);
    const deviation = numeric(report?.deviations?.[name]);
    const coefficient = numeric(report?.coefficients?.[name]);
    if (mean === null || deviation === null || deviation <= 0 || coefficient === null) return sum;
    const value = numeric(features[name]) ?? mean;
    return sum + ((value - mean) / deviation) * coefficient;
  }, numeric(report?.intercept) ?? 0);
  return Number.isFinite(prediction) ? Math.max(0, prediction) : null;
}

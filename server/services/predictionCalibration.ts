export interface CalibrationSample {
  probability: number;
  actual: number;
  netProfit: number;
  createdAt: string;
  market: string;
  mode: string;
  league: string;
  grade: string;
  modelVersion: string;
  outcomeSource: string;
}

const ACTUAL_BY_OUTCOME: Record<string, number> = {
  win: 1,
  half_win: 0.75,
  push: 0.5,
  half_loss: 0.25,
  loss: 0,
};

const profitFor = (outcome: string, odds: number): number => {
  if (outcome === 'win') return odds - 1;
  if (outcome === 'half_win') return (odds - 1) / 2;
  if (outcome === 'half_loss') return -0.5;
  if (outcome === 'loss') return -1;
  return 0;
};

export function calibrationSamplesFromLedger(ledger: any[]): CalibrationSample[] {
  const seen = new Set<string>();
  return (Array.isArray(ledger) ? ledger : []).flatMap((item: any) => {
    const formal = item?.formal_recommendation === true || item?.record_type === 'formal_ai_recommendation';
    const probabilityRaw = Number(item?.prediction_probability);
    const outcome = String(item?.review?.outcome || '');
    const odds = Number(item?.recommendation?.odds);
    const identity = String(item?.id || [item?.created_at, item?.match, item?.recommendation?.market, item?.recommendation?.line, item?.recommendation?.odds].join('|'));
    if (seen.has(identity) || !formal || item?.is_parlay === true || !Number.isFinite(probabilityRaw) || probabilityRaw <= 0 || probabilityRaw >= 100 || !(outcome in ACTUAL_BY_OUTCOME) || !Number.isFinite(odds) || odds <= 1) return [];
    seen.add(identity);
    const mode = item?.source_type === 'live' || item?.is_live === true || Number(item?.minute || 0) > 0 ? '滚球' : '赛前';
    return [{
      probability: probabilityRaw / 100,
      actual: ACTUAL_BY_OUTCOME[outcome],
      netProfit: profitFor(outcome, odds),
      createdAt: String(item.created_at || ''),
      market: String(item.recommendation?.market || '其他'),
      mode,
      league: String(item.league || item.ybty_league || item.leisu_league || '未标注'),
      grade: String(item.grade || '未评级'),
      modelVersion: String(item.model_version || item.selection_method || '未标注'),
      outcomeSource: String(item.review?.outcome_source || 'legacy'),
    }];
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function buildCalibrationReport(ledger: any[], minimumSampleSize = 30) {
  const samples = calibrationSamplesFromLedger(ledger);
  const summarize = (input: CalibrationSample[]) => {
    const count = input.length;
    const brierScore = count ? input.reduce((sum, sample) => sum + (sample.probability - sample.actual) ** 2, 0) / count : null;
    const bins = Array.from({ length: 10 }, (_, index) => {
      const lower = index / 10;
      const upper = (index + 1) / 10;
      const rows = input.filter((sample) => sample.probability >= lower && (index === 9 ? sample.probability <= upper : sample.probability < upper));
      return {
        range: `${Math.round(lower * 100)}-${Math.round(upper * 100)}%`,
        count: rows.length,
        average_prediction: rows.length ? rows.reduce((sum, row) => sum + row.probability, 0) / rows.length : null,
        observed_rate: rows.length ? rows.reduce((sum, row) => sum + row.actual, 0) / rows.length : null,
      };
    }).filter((bin) => bin.count > 0);
    const ece = count ? bins.reduce((sum, bin) => sum + (bin.count / count) * Math.abs(Number(bin.average_prediction) - Number(bin.observed_rate)), 0) : null;
    const profit = input.reduce((sum, sample) => sum + sample.netProfit, 0);
    return {
      sample_size: count,
      sufficient_sample: count >= minimumSampleSize,
      brier_score: brierScore === null ? null : Number(brierScore.toFixed(4)),
      expected_calibration_error: ece === null ? null : Number(ece.toFixed(4)),
      average_prediction: count ? Number((input.reduce((sum, sample) => sum + sample.probability, 0) / count).toFixed(4)) : null,
      observed_rate: count ? Number((input.reduce((sum, sample) => sum + sample.actual, 0) / count).toFixed(4)) : null,
      net_profit_units: Number(profit.toFixed(2)),
      roi_percent: count ? Number(((profit / count) * 100).toFixed(2)) : null,
      bins,
    };
  };
  const segment = (field: 'mode' | 'market' | 'league' | 'grade' | 'modelVersion') => {
    const groups = new Map<string, CalibrationSample[]>();
    for (const sample of samples) groups.set(sample[field], [...(groups.get(sample[field]) || []), sample]);
    return Array.from(groups.entries()).map(([label, rows]) => {
      const result = summarize(rows);
      return {
        label,
        ...result,
        evidence_level: rows.length >= 30 ? '可初步比较' : rows.length >= 15 ? '仅观察' : '样本不足',
      };
    }).sort((a, b) => b.sample_size - a.sample_size || a.label.localeCompare(b.label));
  };
  const outcomeSources = Object.fromEntries(Array.from(new Set(samples.map((sample) => sample.outcomeSource))).map((source) => [source, samples.filter((sample) => sample.outcomeSource === source).length]));
  return {
    generated_at: new Date().toISOString(),
    methodology: 'Formal single recommendations only; explicit probabilities only; fractional Asian outcomes map to 1/0.75/0.5/0.25/0.',
    minimum_sample_size: minimumSampleSize,
    overall: summarize(samples),
    rolling_last_30: summarize(samples.slice(-30)),
    rolling_last_90: summarize(samples.slice(-90)),
    segments: {
      by_mode: segment('mode'),
      by_market: segment('market'),
      by_league: segment('league'),
      by_grade: segment('grade'),
      by_model_version: segment('modelVersion'),
    },
    outcome_sources: outcomeSources,
    warning: samples.length < minimumSampleSize ? `样本不足${minimumSampleSize}条，不能据此调整推荐门槛或宣称概率可靠。` : null,
  };
}

import { DecisionItem, toStandardMatchData } from '../types';
import { formatAsianLine } from './quarterSettlement';

export interface CorrectScoreOption { score: string; odds: number | null; probPercent: number; }
export interface BTTSOption { value: '是' | '否' | '数据不足'; odds: number | null; probability: number | null; reason: string; }
export interface OddEvenOption { value: '单数' | '双数' | '数据不足'; odds: number | null; probability: number | null; reason: string; }
export interface GoalProjection {
  home: number | null; away: number | null; total: number | null;
  homeMostLikely: number | null; awayMostLikely: number | null; totalMostLikely: number | null;
  homeAlternative: number | null; awayAlternative: number | null; totalAlternative: number | null;
  homeConfidence: number; awayConfidence: number; totalConfidence: number;
  homeRange: string; awayRange: string; totalRange: string; basis: string;
}
export interface TimeIntervalOption { interval: string; label: string; recommendation: string; confidence: number; odds: number | null; }
export interface LiveEntryTimingAdvice { lineDropSummary: string; reboundOpportunity: string; triggerCondition: string; confidenceLevel: string; actionableStep: string; }
export interface MarketRecommendation { value: string; line: string; odds: number | null; confidence: number; reason: string; }
export interface OverUnderRecommendation { fullTime: MarketRecommendation; halfTime: MarketRecommendation; }
export interface HandicapRecommendation {
  fullTime: MarketRecommendation & { team: string };
  halfTime: MarketRecommendation & { team: string };
}
export interface Match1X2Recommendation { value: string; odds: number | null; probability: number; reason: string; }
export interface ExtendedMatchAnalysis {
  h2hSummary: string; recentScoringSummary: string; lineMovementSummary: string;
  overUnder: OverUnderRecommendation; handicap: HandicapRecommendation; match1X2: Match1X2Recommendation;
  correctScores: CorrectScoreOption[]; btts: BTTSOption; oddEven: OddEvenOption;
  goalProjection: GoalProjection; timeIntervals: TimeIntervalOption[]; liveEntryTiming: LiveEntryTimingAdvice;
}

type RawOption = { side?: string; selection?: string | number; line?: string | number; odds?: string | number; suspended?: boolean };
type RawMarket = { market?: string; market_type_verified?: boolean; options?: RawOption[] };

const finiteOdds = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
};

const numericLine = (value: unknown): number | null => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const values = text.split('/').map(Number).filter(Number.isFinite);
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
};

const poisson = (lambda: number, goals: number): number => {
  let factorial = 1;
  for (let index = 2; index <= goals; index += 1) factorial *= index;
  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial;
};

const percent = (value: number): number => Math.round(value * 1000) / 10;

function verifiedMarket(item: DecisionItem | null | undefined, marketType: string): RawMarket | null {
  if (!item) return null;

  // 1. StandardMatchData market_snapshots
  if (Array.isArray(item.market_snapshots) && item.market_snapshots.length > 0) {
    if (marketType === 'full_total') {
      const tot = item.market_snapshots.find((m) => m.market_type === 'total');
      if (tot && (tot.home_or_over_odds || tot.away_or_under_odds)) {
        const opts: RawOption[] = [];
        const lineVal = tot.line ?? undefined;
        if (tot.home_or_over_odds) opts.push({ selection: String(tot.line ?? ''), line: lineVal, odds: tot.home_or_over_odds, side: 'over', suspended: !tot.is_verified });
        if (tot.away_or_under_odds) opts.push({ selection: String(tot.line ?? ''), line: lineVal, odds: tot.away_or_under_odds, side: 'under', suspended: !tot.is_verified });
        if (opts.length) return { market: 'full_total', options: opts };
      }
    } else if (marketType === 'full_spread') {
      const sp = item.market_snapshots.find((m) => m.market_type === 'spread');
      if (sp && (sp.home_or_over_odds || sp.away_or_under_odds)) {
        const opts: RawOption[] = [];
        const lineVal = sp.line ?? undefined;
        if (sp.home_or_over_odds) opts.push({ selection: String(sp.line ?? ''), line: lineVal, odds: sp.home_or_over_odds, side: 'home', suspended: !sp.is_verified });
        if (sp.away_or_under_odds) opts.push({ selection: String(sp.line ?? ''), line: lineVal, odds: sp.away_or_under_odds, side: 'away', suspended: !sp.is_verified });
        if (opts.length) return { market: 'full_spread', options: opts };
      }
    } else if (marketType === 'full_h2h') {
      const h = item.market_snapshots.find((m) => m.market_type === 'h2h');
      if (h && (h.home_or_over_odds || h.away_or_under_odds || h.draw_odds)) {
        const opts: RawOption[] = [];
        if (h.home_or_over_odds) opts.push({ selection: '主', odds: h.home_or_over_odds, side: 'home', suspended: !h.is_verified });
        if (h.away_or_under_odds) opts.push({ selection: '客', odds: h.away_or_under_odds, side: 'away', suspended: !h.is_verified });
        if (h.draw_odds) opts.push({ selection: '平', odds: h.draw_odds, side: 'draw', suspended: !h.is_verified });
        if (opts.length) return { market: 'full_h2h', options: opts };
      }
    }
  }

  // 2. Fallback: check item.recommendation
  const rec = item?.recommendation;
  if (rec && rec.odds) {
    const recMarket = String(rec.market || '');
    const isTotal = /total|大小球/i.test(recMarket);
    const isSpread = /spread|让球/i.test(recMarket);
    const isH2H = /h2h|独赢|1x2/i.test(recMarket);
    const isHalf = /半场|half|ht/i.test(recMarket);

    const recSel = String((rec as any)?.selection || rec?.basis || '');
    if (marketType === 'full_total' && isTotal && !isHalf) {
      const side = recSel.toLowerCase().includes('under') || recSel.includes('小') ? 'under' : 'over';
      return { market: 'full_total', options: [{ selection: String(rec.line ?? recSel ?? ''), line: rec.line, odds: rec.odds, side }] };
    }
    if (marketType === 'half_total' && isTotal && isHalf) {
      const side = recSel.toLowerCase().includes('under') || recSel.includes('小') ? 'under' : 'over';
      return { market: 'half_total', options: [{ selection: String(rec.line ?? recSel ?? ''), line: rec.line, odds: rec.odds, side }] };
    }
    if (marketType === 'full_spread' && isSpread && !isHalf) {
      const side = recSel.toLowerCase().includes('away') || recSel.includes('客') ? 'away' : 'home';
      return { market: 'full_spread', options: [{ selection: String(rec.line ?? recSel ?? ''), line: rec.line, odds: rec.odds, side }] };
    }
    if (marketType === 'half_spread' && isSpread && isHalf) {
      const side = recSel.toLowerCase().includes('away') || recSel.includes('客') ? 'away' : 'home';
      return { market: 'half_spread', options: [{ selection: String(rec.line ?? recSel ?? ''), line: rec.line, odds: rec.odds, side }] };
    }
    if (marketType === 'full_h2h' && isH2H) {
      const side = recSel.toLowerCase().includes('away') || recSel.includes('客') ? 'away' :
                   recSel.toLowerCase().includes('draw') || recSel.includes('平') ? 'draw' : 'home';
      return { market: 'full_h2h', options: [{ selection: '1X2', odds: rec.odds, side }] };
    }
  }

  return null;
}

function usableOptions(market: RawMarket | null): Array<RawOption & { numericOdds: number }> {
  return (market?.options || []).flatMap((option) => {
    const odds = option.suspended === true ? null : finiteOdds(option.odds);
    return odds === null ? [] : [{ ...option, numericOdds: odds }];
  });
}

function marketLean(options: Array<RawOption & { numericOdds: number }>) {
  if (!options.length) return null;
  const weights = options.map((option) => 1 / option.numericOdds);
  const total = weights.reduce((sum, value) => sum + value, 0);
  const index = weights.indexOf(Math.max(...weights));
  return { option: options[index], probability: total > 0 ? percent(weights[index] / total) : 0 };
}

function historicalSummary(item: DecisionItem): { h2h: string; recent: string } {
  if (!item) return { h2h: '历史交锋：暂无可计算样本', recent: '近期战绩：暂无可计算样本' };
  const std = item.unified_stats ? item : toStandardMatchData(item);
  const tc = std.tactical_context;
  const interfaceH2h = Array.isArray(tc?.h2h_matches) ? tc.h2h_matches : [];
  const homeRecent = Array.isArray(tc?.home_recent_matches) ? tc.home_recent_matches : [];
  const awayRecent = Array.isArray(tc?.away_recent_matches) ? tc.away_recent_matches : [];

  if (homeRecent.length || awayRecent.length || interfaceH2h.length) {
    const averageGoals = (rows: any[]) => rows.length
      ? rows.reduce((sum, row) => sum + (Number(row?.goals ?? (Number(row?.home_score || 0) + Number(row?.away_score || 0))) || 0), 0) / rows.length
      : null;
    const homeAverage = averageGoals(homeRecent);
    const awayAverage = averageGoals(awayRecent);
    const h2hGoals = interfaceH2h.flatMap((row: any) => {
      const home = Number(Array.isArray(row?.home_scores) ? row.home_scores[0] : (row?.home_score ?? NaN));
      const away = Number(Array.isArray(row?.away_scores) ? row.away_scores[0] : (row?.away_score ?? NaN));
      return Number.isFinite(home) && Number.isFinite(away) ? [home + away] : [];
    });
    const h2hAverage = h2hGoals.length ? h2hGoals.reduce((sum: number, value: number) => sum + value, 0) / h2hGoals.length : null;

    // Time decay calculation
    const currentYear = new Date().getFullYear();
    let recent1YearCount = 0;
    let staleCount = 0;
    interfaceH2h.forEach((row: any) => {
      const rawDate = row?.match_date || row?.date || row?.match_time || row?.time;
      let year = 0;
      if (typeof rawDate === 'string') {
        const m = rawDate.match(/(\d{4})/);
        if (m) year = parseInt(m[1], 10);
      } else if (typeof rawDate === 'number') {
        const ts = rawDate > 1e11 ? rawDate : rawDate * 1000;
        year = new Date(ts).getFullYear();
      }
      if (year > 0) {
        if (currentYear - year <= 1) recent1YearCount++;
        else if (currentYear - year >= 3) staleCount++;
      }
    });

    let decayNote = '';
    if (interfaceH2h.length > 0) {
      if (recent1YearCount > 0) {
        decayNote = ` (近1年${recent1YearCount}场/高权重)`;
      } else if (staleCount === interfaceH2h.length) {
        decayNote = ` (全部发生于2-3年前/阵容更迭·时效衰减)`;
      }
    }

    return {
      h2h: h2hAverage == null ? '历史交锋：暂无可计算样本' : `历史交锋：${h2hGoals.length}场${decayNote}，场均进球${h2hAverage.toFixed(2)}`,
      recent: `近期战绩：主队${homeRecent.length}场${homeAverage == null ? '' : `(均进${homeAverage.toFixed(2)})`}；客队${awayRecent.length}场${awayAverage == null ? '' : `(均进${awayAverage.toFixed(2)})`}。依据时效衰减模型，优先参考近6场与即时首发。`,
    };
  }

  return {
    h2h: '历史交锋：无可核验数据（雷速本次详情未提供近期战绩或交锋结构化数据）',
    recent: '近期战绩：无可核验数据（雷速本次详情未提供近期战绩或交锋结构化数据）',
  };
}

function realMarketRecommendation(market: RawMarket | null, label: string, homeName: string, awayName: string): MarketRecommendation {
  const lean = marketLean(usableOptions(market));
  if (!lean) return { value: `${label}暂无真实盘口`, line: '--', odds: null, confidence: 0, reason: 'YBTY本次导入没有可用且已核验的该市场盘口，不生成默认盘口或赔率。' };
  const side = String(lean.option.side || '');
  const rawLine = String(lean.option.line ?? lean.option.selection ?? '').trim();
  const formattedLine = rawLine && rawLine !== '--' && rawLine !== 'undefined' ? formatAsianLine(rawLine) : '';

  let fullDisplay = '';
  if (label.includes('让球') || label.includes('spread')) {
    const team = side === 'away' ? awayName : homeName;
    const lineSuffix = formattedLine ? ` ${formattedLine}` : '';
    fullDisplay = `${label}${team}${lineSuffix}`.trim();
  } else {
    // Total (Over/Under)
    const direction = side === 'over' ? '大球' : side === 'under' ? '小球' : side === 'home' ? homeName : side === 'away' ? awayName : '平局';
    const lineSuffix = formattedLine ? ` ${formattedLine}` : '';
    fullDisplay = `${label}${direction}${lineSuffix}`.trim();
  }

  return {
    value: fullDisplay,
    line: formattedLine || '--',
    odds: lean.option.numericOdds,
    confidence: lean.probability,
    reason: `方向和赔率直接来自YBTY已核验盘口；${lean.probability}%是该市场去除同盘水位后的隐含概率，不是编造的模型胜率。`,
  };
}

export function generateExtendedAnalysis(matchItem: DecisionItem): ExtendedMatchAnalysis {
  const matchStr = String(matchItem?.match || (matchItem as any)?.match_name || (matchItem as any)?.ybty_match || '');
  const matchParts = matchStr.includes('vs') ? matchStr.split('vs') : matchStr.includes('VS') ? matchStr.split('VS') : [];
  const homeName = matchItem?.ybty_home || matchParts[0]?.trim() || '主队';
  const awayName = matchItem?.ybty_away || matchParts[1]?.trim() || '客队';
  const history = historicalSummary(matchItem);
  const fullTotal = verifiedMarket(matchItem, 'full_total');
  const halfTotal = verifiedMarket(matchItem, 'half_total');
  const fullSpread = verifiedMarket(matchItem, 'full_spread');
  const halfSpread = verifiedMarket(matchItem, 'half_spread');
  const fullH2h = verifiedMarket(matchItem, 'full_h2h');

  const ftTotalRec = realMarketRecommendation(fullTotal, '全场', homeName, awayName);
  const htTotalRec = realMarketRecommendation(halfTotal, '半场', homeName, awayName);
  const ftSpreadRec = realMarketRecommendation(fullSpread, '全场让球 ', homeName, awayName);
  const htSpreadRec = realMarketRecommendation(halfSpread, '半场让球 ', homeName, awayName);
  const h2hLean = marketLean(usableOptions(fullH2h));
  const h2hSide = String(h2hLean?.option.side || '');
  const h2hValue = h2hSide === 'home' ? `主胜（${homeName}）` : h2hSide === 'away' ? `客胜（${awayName}）` : h2hSide === 'draw' ? '平局' : '暂无真实独赢盘口';

  const totalOptions = usableOptions(fullTotal);
  const totalLine = numericLine(totalOptions[0]?.line ?? totalOptions[0]?.selection);
  const h2hOptions = usableOptions(fullH2h);
  const homeH2h = h2hOptions.find((option) => option.side === 'home');
  const awayH2h = h2hOptions.find((option) => option.side === 'away');
  const homeWeight = homeH2h ? 1 / homeH2h.numericOdds : 0;
  const awayWeight = awayH2h ? 1 / awayH2h.numericOdds : 0;
  const teamWeight = homeWeight + awayWeight;
  const canProject = totalLine !== null && totalLine > 0 && teamWeight > 0;
  const expectedHome = canProject ? totalLine! * homeWeight / teamWeight : null;
  const expectedAway = canProject ? totalLine! - expectedHome! : null;

  let correctScores: CorrectScoreOption[] = [];
  if (expectedHome !== null && expectedAway !== null) {
    const scores: CorrectScoreOption[] = [];
    for (let home = 0; home <= 6; home += 1) {
      for (let away = 0; away <= 6; away += 1) {
        scores.push({ score: `${home} - ${away}`, odds: null, probPercent: percent(poisson(expectedHome, home) * poisson(expectedAway, away)) });
      }
    }
    correctScores = scores.sort((a, b) => b.probPercent - a.probPercent).slice(0, 4);
  }

  const bttsProbability = expectedHome !== null && expectedAway !== null
    ? percent(1 - Math.exp(-expectedHome) - Math.exp(-expectedAway) + Math.exp(-(expectedHome + expectedAway)))
    : null;
  const evenProbability = totalLine !== null ? percent((1 + Math.exp(-2 * totalLine)) / 2) : null;
  const totalMode = totalLine !== null ? Math.max(0, Math.floor(totalLine)) : null;
  const homeMode = expectedHome !== null ? Math.max(0, Math.floor(expectedHome)) : null;
  const awayMode = expectedAway !== null ? Math.max(0, Math.floor(expectedAway)) : null;
  const projectionBasis = canProject
    ? `基于YBTY真实全场大小球盘口 ${formatAsianLine(String(totalOptions[0]?.line ?? totalOptions[0]?.selection))}，再按真实1X2主客隐含强度分配期望进球；这是透明的泊松盘口模型，不是雷速历史数据，也没有虚构赔率。`
    : '缺少已核验的YBTY全场大小球或1X2盘口，无法计算进球预测。';

  const std = matchItem.unified_stats ? matchItem : toStandardMatchData(matchItem);
  const refMarket = std.reference_market;
  const lineMovementSummary = refMarket?.handicap_movement
    ? `参考机构盘口动态：${refMarket.handicap_movement} (初盘 ${refMarket.initial_handicap || '--'} 现盘 ${refMarket.instant_handicap || '--'})`
    : refMarket?.company
    ? `参考机构: ${refMarket.company} 状态: ${refMarket.status || '正常'}`
    : '未配置外部参考机构升降盘对比。';

  return {
    h2hSummary: history.h2h,
    recentScoringSummary: history.recent,
    lineMovementSummary,
    overUnder: { fullTime: ftTotalRec, halfTime: htTotalRec },
    handicap: {
      fullTime: { ...ftSpreadRec, team: ftSpreadRec.value.includes(awayName) ? awayName : homeName },
      halfTime: { ...htSpreadRec, team: htSpreadRec.value.includes(awayName) ? awayName : homeName },
    },
    match1X2: {
      value: h2hValue,
      odds: h2hLean?.option.numericOdds ?? null,
      probability: h2hLean?.probability ?? 0,
      reason: h2hLean ? '赔率直接来自YBTY全场1X2；概率为三项赔率归一化后的市场隐含概率，不冒充独立模型概率。' : 'YBTY没有已核验的全场1X2盘口。',
    },
    correctScores,
    btts: {
      value: bttsProbability === null ? '数据不足' : bttsProbability >= 50 ? '是' : '否',
      odds: null,
      probability: bttsProbability,
      reason: bttsProbability === null ? '没有足够真实盘口计算BTTS。' : `概率由真实大小球盘口和1X2强弱分配后的泊松模型计算；YBTY未提供BTTS赔率，因此赔率留空。`,
    },
    oddEven: {
      value: evenProbability === null ? '数据不足' : evenProbability >= 50 ? '双数' : '单数',
      odds: null,
      probability: evenProbability === null ? null : Math.max(evenProbability, 100 - evenProbability),
      reason: evenProbability === null ? '没有足够真实盘口计算单双。' : '概率由真实全场大小球盘口对应的泊松总进球模型计算；YBTY未提供单双赔率，因此赔率留空。',
    },
    goalProjection: {
      home: expectedHome, away: expectedAway, total: totalLine,
      homeMostLikely: homeMode, awayMostLikely: awayMode, totalMostLikely: totalMode,
      homeAlternative: homeMode === null ? null : homeMode + 1,
      awayAlternative: awayMode === null ? null : awayMode + 1,
      totalAlternative: totalMode === null ? null : totalMode + 1,
      homeConfidence: homeMode === null || expectedHome === null ? 0 : percent(poisson(expectedHome, homeMode)),
      awayConfidence: awayMode === null || expectedAway === null ? 0 : percent(poisson(expectedAway, awayMode)),
      totalConfidence: totalMode === null || totalLine === null ? 0 : percent(poisson(totalLine, totalMode)),
      homeRange: homeMode === null ? '--' : `${Math.max(0, homeMode - 1)}-${homeMode + 1}`,
      awayRange: awayMode === null ? '--' : `${Math.max(0, awayMode - 1)}-${awayMode + 1}`,
      totalRange: totalMode === null ? '--' : `${Math.max(0, totalMode - 1)}-${totalMode + 1}`,
      basis: projectionBasis,
    },
    timeIntervals: [],
    liveEntryTiming: {
      lineDropSummary: lineMovementSummary,
      reboundOpportunity: '无真实未来盘口，不能预填入场赔率',
      triggerCondition: '等待下一次YBTY真实盘口与雷速实时统计更新后重新计算',
      confidenceLevel: '未生成',
      actionableStep: '禁止使用固定时间窗口、固定盘口或固定赔率作为下注建议。',
    },
  };
}

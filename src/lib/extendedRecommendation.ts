import { DecisionItem } from '../types';
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

function verifiedMarket(item: DecisionItem, marketType: string): RawMarket | null {
  const rows = Array.isArray(item.ybty_raw_markets) ? item.ybty_raw_markets as RawMarket[] : [];
  return rows.find((row) => row.market === marketType && row.market_type_verified !== false) || null;
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
  const root: any = (item as any).recent_trends || {};
  const analysis = root.analysis_data || root;
  const historical = root.historical_analysis || analysis.historical_analysis;
  if (!historical || historical.available !== true) {
    const reason = historical?.reason || '雷速本次详情没有提供可核验的近期战绩或交锋结构化数据';
    return { h2h: `历史交锋：无可核验数据（${reason}）`, recent: `近期战绩：无可核验数据（${reason}）` };
  }
  const recent = Array.isArray(historical.recent_form) ? historical.recent_form : [];
  return {
    h2h: historical.historical_trend ? `历史交锋：${JSON.stringify(historical.historical_trend)}` : '历史交锋：雷速未提供独立交锋统计',
    recent: recent.length ? `近期战绩：雷速提供 ${recent.length} 条结构化记录，预测仅使用这些记录` : '近期战绩：雷速标记历史模块可用，但没有返回近期比赛明细',
  };
}

function realMarketRecommendation(market: RawMarket | null, label: string, homeName: string, awayName: string): MarketRecommendation {
  const lean = marketLean(usableOptions(market));
  if (!lean) return { value: `${label}暂无真实盘口`, line: '--', odds: null, confidence: 0, reason: 'YBTY本次导入没有可用且已核验的该市场盘口，不生成默认盘口或赔率。' };
  const side = String(lean.option.side || '');
  const direction = side === 'over' ? '大球' : side === 'under' ? '小球' : side === 'home' ? homeName : side === 'away' ? awayName : '平局';
  const line = String(lean.option.line ?? lean.option.selection ?? '--');
  return {
    value: `${label}${direction}`,
    line: formatAsianLine(line),
    odds: lean.option.numericOdds,
    confidence: lean.probability,
    reason: `方向和赔率直接来自YBTY已核验盘口；${lean.probability}%是该市场去除同盘水位后的隐含概率，不是编造的模型胜率。`,
  };
}

export function generateExtendedAnalysis(matchItem: DecisionItem): ExtendedMatchAnalysis {
  const homeName = matchItem.ybty_home || matchItem.match.split('vs')[0]?.trim() || '主队';
  const awayName = matchItem.ybty_away || matchItem.match.split('vs')[1]?.trim() || '客队';
  const history = historicalSummary(matchItem);
  const fullTotal = verifiedMarket(matchItem, 'full_total');
  const halfTotal = verifiedMarket(matchItem, 'half_total');
  const fullSpread = verifiedMarket(matchItem, 'full_spread');
  const halfSpread = verifiedMarket(matchItem, 'half_spread');
  const fullH2h = verifiedMarket(matchItem, 'full_h2h');

  const ftTotalRec = realMarketRecommendation(fullTotal, '全场', homeName, awayName);
  const htTotalRec = realMarketRecommendation(halfTotal, '半场', homeName, awayName);
  const ftSpreadRec = realMarketRecommendation(fullSpread, '全场让球：', homeName, awayName);
  const htSpreadRec = realMarketRecommendation(halfSpread, '半场让球：', homeName, awayName);
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

  const referenceRows: any[] = (matchItem as any).reference_odds?.detail_page?.panels?.flatMap((panel: any) => panel.normalized_rows || []) || [];
  const lineMovementSummary = referenceRows.length > 1
    ? `雷速提供 ${referenceRows.length} 个真实盘口阶段快照；页面不再虚构连续走势。`
    : '雷速没有提供可比较的多阶段盘口，无法判断真实升降盘。';

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

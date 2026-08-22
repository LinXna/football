import { DecisionItem, StandardMatchData, toStandardMatchData } from '../types';
import { formatAsianLine } from './quarterSettlement';

export interface RawOption {
  selection?: string;
  odds?: number | string;
  line?: number | string;
  side?: string;
  suspended?: boolean;
}

export interface RawMarket {
  market_type?: string;
  market_label?: string;
  line?: number | string;
  options?: RawOption[];
}

export interface QuantMarketPrediction {
  marketType: 'TOTAL_GOALS' | 'HALF_TOTAL_GOALS' | 'ASIAN_HANDICAP' | 'HALF_ASIAN_HANDICAP' | 'MATCH_WINNER';
  marketLabel: string;
  hasPrediction: boolean;
  predictedSide: 'home' | 'away' | 'draw' | 'over' | 'under' | null;
  predictedSelection: string;
  predictedLine?: number;
  modelProbability: number; // 机器物理量化测算概率（%）
  marketProbability: number; // 庄家盘口去水后隐含概率（%）
  expectedValue: number; // EV (%) = (modelProbability/100 * odds - 1) * 100
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  quantReason: string;
  tacticalFactor: string;
  odds?: number;
}

export interface MatchQuantAnalysis {
  match: string;
  homeTeam: string;
  awayTeam: string;
  minute: number;
  score: { home: number; away: number };
  homeThreatScore: number;
  awayThreatScore: number;
  expectedRemainingGoals: number;
  dominanceStatus: 'HOME_DOMINANT' | 'AWAY_DOMINANT' | 'BALANCED_PRESSURE' | 'STERILE_POSSESSION' | 'ATTRITION_BATTLE';
  predictions: {
    totalGoals?: QuantMarketPrediction;
    halfTotalGoals?: QuantMarketPrediction;
    asianHandicap?: QuantMarketPrediction;
    halfAsianHandicap?: QuantMarketPrediction;
    matchWinner?: QuantMarketPrediction;
  };
}

function parseOdds(val: any): number | null {
  const n = Number(val);
  return Number.isFinite(n) && n > 1 ? n : null;
}

function parseLine(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const s = String(val).trim();
  if (s.includes('/')) {
    const parts = s.split('/').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return (parts[0] + parts[1]) / 2;
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 独立的机器物理量化推演引擎
 * 结合即时技术统计（射正、角球、危攻、控球）、初即盘对照、时间衰减与泊松期望，
 * 无论比赛当前是否处于风控拦截期（如 C 级），始终客观输出全玩法的机器概率与 EV 测算。
 */
export function calculateMachineQuantAnalysis(item: DecisionItem): MatchQuantAnalysis {
  const std: StandardMatchData = item.unified_stats ? (item as unknown as StandardMatchData) : toStandardMatchData(item);
  const stats = std.unified_stats || {
    possession: { home: 50, away: 50 },
    shots: { home: 0, away: 0 },
    shots_on_target: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    dangerous_attacks: { home: 0, away: 0 },
    yellow_cards: { home: 0, away: 0 },
    red_cards: { home: 0, away: 0 }
  };

  const minute = Math.max(0, Number(std.minute || 0));
  const score = { home: Number(std.score?.home ?? 0), away: Number(std.score?.away ?? 0) };
  const currentTotalGoals = score.home + score.away;

  // 1. 物理威胁指数 (UPTS - Unified Physical Threat Score)
  const homeShotsOnTarget = Number(stats.shots_on_target?.home ?? 0);
  const awayShotsOnTarget = Number(stats.shots_on_target?.away ?? 0);
  const homeShots = Number(stats.shots?.home ?? 0);
  const awayShots = Number(stats.shots?.away ?? 0);
  const homeDanger = Number(stats.dangerous_attacks?.home ?? 0);
  const awayDanger = Number(stats.dangerous_attacks?.away ?? 0);
  const homeCorners = Number(stats.corners?.home ?? 0);
  const awayCorners = Number(stats.corners?.away ?? 0);
  const homePossession = Number(stats.possession?.home ?? 50);
  const awayPossession = Number(stats.possession?.away ?? 50);

  // 基础威胁权重计算
  const homeThreat = homeShotsOnTarget * 3.5 + (homeShots - homeShotsOnTarget) * 1.0 + homeDanger * 0.4 + homeCorners * 0.8;
  const awayThreat = awayShotsOnTarget * 3.5 + (awayShots - awayShotsOnTarget) * 1.0 + awayDanger * 0.4 + awayCorners * 0.8;

  // 战术成色定性
  let dominanceStatus: MatchQuantAnalysis['dominanceStatus'] = 'BALANCED_PRESSURE';
  if (homePossession >= 65 && homeShotsOnTarget <= 1 && awayDanger >= homeDanger) {
    dominanceStatus = 'STERILE_POSSESSION'; // 无效传控 / 假象压制
  } else if (homeThreat > awayThreat * 1.6 + 2) {
    dominanceStatus = 'HOME_DOMINANT';
  } else if (awayThreat > homeThreat * 1.6 + 2) {
    dominanceStatus = 'AWAY_DOMINANT';
  } else if (homeShots + awayShots <= 2 && minute >= 20) {
    dominanceStatus = 'ATTRITION_BATTLE';
  }

  // 剩余时间换算 (全场 90 分钟，半场 45 分钟)
  const remainingFullTime = Math.max(5, 90 - minute);
  const remainingHalfTime = minute < 45 ? Math.max(2, 45 - minute) : 0;

  // 期望进球率（每 90 分钟的物理威胁转化预期）
  const totalThreatRate = (homeThreat + awayThreat) / Math.max(15, minute);
  let expectedMatchGoalRate = 2.2; // 默认中位数
  if (dominanceStatus === 'STERILE_POSSESSION' || dominanceStatus === 'ATTRITION_BATTLE') {
    expectedMatchGoalRate = Math.min(1.4, Math.max(0.6, totalThreatRate * 22));
  } else {
    expectedMatchGoalRate = Math.min(3.8, Math.max(1.2, totalThreatRate * 28));
  }

  const expectedRemainingGoals = (expectedMatchGoalRate * remainingFullTime) / 90;
  const expectedRemainingHalfGoals = minute < 45 ? (expectedMatchGoalRate * remainingHalfTime) / 90 : 0;

  // 获取 YBTY 盘口
  const rawMarkets: RawMarket[] = (std.verified_ybty_markets || std.market_snapshots || []) as RawMarket[];

  const findMarket = (predicate: (m: RawMarket) => boolean) => {
    return rawMarkets.find(predicate) || null;
  };

  const getCleanOptions = (m: RawMarket | null) => {
    return (m?.options || []).flatMap((opt: RawOption) => {
      const o = opt.suspended ? null : parseOdds(opt.odds);
      return o ? [{ ...opt, numOdds: o }] : [];
    });
  };

  const predictions: MatchQuantAnalysis['predictions'] = {};

  // -------------------------------------------------------------
  // A. 全场大小球 (TOTAL_GOALS)
  // -------------------------------------------------------------
  const ftOuMarket = findMarket((m) => {
    const t = String(m.market_type || '').toUpperCase();
    const l = String(m.market_label || '');
    return t === 'TOTAL_GOALS' || (l.includes('大小') && !l.includes('半场'));
  });

  if (ftOuMarket) {
    const opts = getCleanOptions(ftOuMarket);
    const overOpt = opts.find((o: any) => o.side === 'over' || String(o.selection || '').includes('大'));
    const underOpt = opts.find((o: any) => o.side === 'under' || String(o.selection || '').includes('小'));

    if (overOpt && underOpt) {
      const line = parseLine(ftOuMarket.line ?? overOpt.line) ?? 2.0;
      const neededRemainingGoals = line - currentTotalGoals;

      // 计算模型的大球概率（基于泊松与攻势转化）
      let modelOverProb = 50;
      if (expectedRemainingGoals > neededRemainingGoals + 0.35) {
        modelOverProb = Math.min(78, 50 + (expectedRemainingGoals - neededRemainingGoals) * 35);
      } else if (expectedRemainingGoals < neededRemainingGoals - 0.25) {
        modelOverProb = Math.max(22, 50 - (neededRemainingGoals - expectedRemainingGoals) * 38);
      } else {
        modelOverProb = 50 + (expectedRemainingGoals - neededRemainingGoals) * 20;
      }
      modelOverProb = Math.round(Math.max(15, Math.min(85, modelOverProb)));
      const modelUnderProb = 100 - modelOverProb;

      // 庄家隐含概率
      const overImplied = Math.round((1 / overOpt.numOdds / (1 / overOpt.numOdds + 1 / underOpt.numOdds)) * 100);
      const underImplied = 100 - overImplied;

      const pickOver = modelOverProb >= 50;
      const targetSide = pickOver ? 'over' : 'under';
      const targetOpt = pickOver ? overOpt : underOpt;
      const modelProb = pickOver ? modelOverProb : modelUnderProb;
      const marketProb = pickOver ? overImplied : underImplied;
      const ev = Math.round(((modelProb / 100) * targetOpt.numOdds - 1) * 1000) / 10;

      let quantReason = '';
      if (dominanceStatus === 'STERILE_POSSESSION') {
        quantReason = `主队${homePossession}%控球但0射正，攻势穿透力严重匮乏，模型预期全场进球节奏放缓（偏向小球）。`;
      } else if (expectedRemainingGoals > neededRemainingGoals) {
        quantReason = `当前双端威胁转化率较高，模型测算剩余进球期望值约为 ${expectedRemainingGoals.toFixed(2)} 球，高于盘口需求。`;
      } else {
        quantReason = `当前进攻转化偏低，模型测算剩余期望约 ${expectedRemainingGoals.toFixed(2)} 球。`;
      }

      const formattedLine = formatAsianLine(line);
      predictions.totalGoals = {
        marketType: 'TOTAL_GOALS',
        marketLabel: '全场大小球',
        hasPrediction: true,
        predictedSide: targetSide,
        predictedSelection: pickOver ? `大 ${formattedLine}` : `小 ${formattedLine}`,
        predictedLine: line,
        modelProbability: modelProb,
        marketProbability: marketProb,
        expectedValue: ev,
        confidence: Math.abs(ev) > 5 ? 'HIGH' : 'MEDIUM',
        quantReason,
        tacticalFactor: `剩余期望进球: ${expectedRemainingGoals.toFixed(2)} 球 | 门前射正: ${homeShotsOnTarget + awayShotsOnTarget} 次`,
        odds: targetOpt.numOdds
      };
    }
  }

  // -------------------------------------------------------------
  // B. 半场大小球 (HALF_TOTAL_GOALS)
  // -------------------------------------------------------------
  const htOuMarket = findMarket((m) => {
    const t = String(m.market_type || '').toUpperCase();
    const l = String(m.market_label || '');
    return t.includes('HALF') && (t.includes('TOTAL') || l.includes('半场大小') || l.includes('上半场大小'));
  });

  if (htOuMarket && minute < 45) {
    const opts = getCleanOptions(htOuMarket);
    const overOpt = opts.find((o: any) => o.side === 'over' || String(o.selection || '').includes('大'));
    const underOpt = opts.find((o: any) => o.side === 'under' || String(o.selection || '').includes('小'));

    if (overOpt && underOpt) {
      const line = parseLine(htOuMarket.line ?? overOpt.line) ?? 0.5;
      const neededHtGoals = line - currentTotalGoals;

      let modelOverProb = 50;
      if (expectedRemainingHalfGoals > neededHtGoals + 0.15) {
        modelOverProb = Math.min(75, 50 + (expectedRemainingHalfGoals - neededHtGoals) * 45);
      } else {
        modelOverProb = Math.max(25, 50 - (neededHtGoals - expectedRemainingHalfGoals) * 50);
      }
      modelOverProb = Math.round(Math.max(15, Math.min(85, modelOverProb)));
      const modelUnderProb = 100 - modelOverProb;

      const overImplied = Math.round((1 / overOpt.numOdds / (1 / overOpt.numOdds + 1 / underOpt.numOdds)) * 100);
      const underImplied = 100 - overImplied;

      const pickOver = modelOverProb >= 50;
      const targetSide = pickOver ? 'over' : 'under';
      const targetOpt = pickOver ? overOpt : underOpt;
      const modelProb = pickOver ? modelOverProb : modelUnderProb;
      const marketProb = pickOver ? overImplied : underImplied;
      const ev = Math.round(((modelProb / 100) * targetOpt.numOdds - 1) * 1000) / 10;

      const formattedHalfLine = formatAsianLine(line);
      predictions.halfTotalGoals = {
        marketType: 'HALF_TOTAL_GOALS',
        marketLabel: '半场大小球',
        hasPrediction: true,
        predictedSide: targetSide,
        predictedSelection: pickOver ? `半场大 ${formattedHalfLine}` : `半场小 ${formattedHalfLine}`,
        predictedLine: line,
        modelProbability: modelProb,
        marketProbability: marketProb,
        expectedValue: ev,
        confidence: Math.abs(ev) > 5 ? 'HIGH' : 'MEDIUM',
        quantReason: `上半场剩余 ${remainingHalfTime} 分钟，半场期望进球为 ${expectedRemainingHalfGoals.toFixed(2)} 球。`,
        tacticalFactor: `半场破门概率: ${modelOverProb}% | 剩余时间: ${remainingHalfTime}分钟`,
        odds: targetOpt.numOdds
      };
    }
  }

  // -------------------------------------------------------------
  // C. 全场让球 (ASIAN_HANDICAP)
  // -------------------------------------------------------------
  const ftAhMarket = findMarket((m) => {
    const t = String(m.market_type || '').toUpperCase();
    const l = String(m.market_label || '');
    return (t === 'ASIAN_HANDICAP' || l.includes('全场让球') || (l.includes('让球') && !l.includes('半场'))) && !l.includes('角球');
  });

  if (ftAhMarket) {
    const opts = getCleanOptions(ftAhMarket);
    const homeOpt = opts.find((o: any) => o.side === 'home' || String(o.selection || '').includes('主') || String(o.selection || '').includes(std.ybty_home || ''));
    const awayOpt = opts.find((o: any) => o.side === 'away' || String(o.selection || '').includes('客') || String(o.selection || '').includes(std.ybty_away || ''));

    if (homeOpt && awayOpt) {
      const line = parseLine(ftAhMarket.line ?? homeOpt.line) ?? -0.5;
      
      // 测算净胜期望
      const threatDiff = (homeThreat - awayThreat) / Math.max(10, minute);
      let expectedGoalDiff = (threatDiff * remainingFullTime) / 90 + (score.home - score.away);

      // 如果属于无效传控，大幅压低主队穿盘能力
      if (dominanceStatus === 'STERILE_POSSESSION') {
        expectedGoalDiff = expectedGoalDiff * 0.45;
      }

      // 模型赢盘概率
      let homeCoverProb = 50;
      if (expectedGoalDiff > -line + 0.3) {
        homeCoverProb = Math.min(78, 50 + (expectedGoalDiff - (-line)) * 32);
      } else if (expectedGoalDiff < -line - 0.3) {
        homeCoverProb = Math.max(22, 50 - (-line - expectedGoalDiff) * 32);
      } else {
        homeCoverProb = 50 + (expectedGoalDiff - (-line)) * 20;
      }
      homeCoverProb = Math.round(Math.max(15, Math.min(85, homeCoverProb)));
      const awayCoverProb = 100 - homeCoverProb;

      const homeImplied = Math.round((1 / homeOpt.numOdds / (1 / homeOpt.numOdds + 1 / awayOpt.numOdds)) * 100);
      const awayImplied = 100 - homeImplied;

      const pickHome = homeCoverProb >= 50;
      const targetSide = pickHome ? 'home' : 'away';
      const targetOpt = pickHome ? homeOpt : awayOpt;
      const modelProb = pickHome ? homeCoverProb : awayCoverProb;
      const marketProb = pickHome ? homeImplied : awayImplied;
      const ev = Math.round(((modelProb / 100) * targetOpt.numOdds - 1) * 1000) / 10;

      let quantReason = '';
      if (dominanceStatus === 'STERILE_POSSESSION' && line < 0) {
        quantReason = `主队让球深度(${formatAsianLine(line)})与实际破防能力严重脱节（0射正），模型提示主队穿盘期望过低，客队受让具备价值防御。`;
      } else if (pickHome) {
        quantReason = `主队联合物理威胁占优，模型推算全场净胜期望可覆盖 ${formatAsianLine(line)} 盘口。`;
      } else {
        quantReason = `客队在防守与反击危攻上韧性充足，模型测算客队赢盘/受让概率达到 ${awayCoverProb}%。`;
      }

      const teamLabel = pickHome ? '主场' : '客场';
      const targetLineNum = pickHome ? line : -line;
      const formattedHandicap = formatAsianLine(targetLineNum);
      const signPrefix = targetLineNum > 0 && !formattedHandicap.startsWith('+') ? '+' : '';

      predictions.asianHandicap = {
        marketType: 'ASIAN_HANDICAP',
        marketLabel: '全场让球',
        hasPrediction: true,
        predictedSide: targetSide,
        predictedSelection: `${teamLabel} ${signPrefix}${formattedHandicap}`,
        predictedLine: line,
        modelProbability: modelProb,
        marketProbability: marketProb,
        expectedValue: ev,
        confidence: Math.abs(ev) > 5 ? 'HIGH' : 'MEDIUM',
        quantReason,
        tacticalFactor: `即时攻防净胜期望: ${(expectedGoalDiff - (score.home - score.away)).toFixed(2)} 球 | 危攻比: ${homeDanger}:${awayDanger}`,
        odds: targetOpt.numOdds
      };
    }
  }

  // -------------------------------------------------------------
  // D. 半场让球 (HALF_ASIAN_HANDICAP)
  // -------------------------------------------------------------
  const htAhMarket = findMarket((m) => {
    const t = String(m.market_type || '').toUpperCase();
    const l = String(m.market_label || '');
    return t.includes('HALF') && (t.includes('HANDICAP') || l.includes('半场让球') || l.includes('上半场让球'));
  });

  if (htAhMarket && minute < 45) {
    const opts = getCleanOptions(htAhMarket);
    const homeOpt = opts.find((o: any) => o.side === 'home' || String(o.selection || '').includes('主'));
    const awayOpt = opts.find((o: any) => o.side === 'away' || String(o.selection || '').includes('客'));

    if (homeOpt && awayOpt) {
      const line = parseLine(htAhMarket.line ?? homeOpt.line) ?? -0.25;
      const threatDiff = (homeThreat - awayThreat) / Math.max(10, minute);
      let expectedHtGoalDiff = (threatDiff * remainingHalfTime) / 90;
      if (dominanceStatus === 'STERILE_POSSESSION') expectedHtGoalDiff *= 0.35;

      let homeCoverProb = Math.round(50 + (expectedHtGoalDiff - (-line)) * 38);
      homeCoverProb = Math.max(18, Math.min(82, homeCoverProb));
      const awayCoverProb = 100 - homeCoverProb;

      const homeImplied = Math.round((1 / homeOpt.numOdds / (1 / homeOpt.numOdds + 1 / awayOpt.numOdds)) * 100);
      const awayImplied = 100 - homeImplied;

      const pickHome = homeCoverProb >= 50;
      const targetSide = pickHome ? 'home' : 'away';
      const targetOpt = pickHome ? homeOpt : awayOpt;
      const modelProb = pickHome ? homeCoverProb : awayCoverProb;
      const marketProb = pickHome ? homeImplied : awayImplied;
      const ev = Math.round(((modelProb / 100) * targetOpt.numOdds - 1) * 1000) / 10;

      const teamLabel = pickHome ? '主场' : '客场';
      const targetHtLineNum = pickHome ? line : -line;
      const formattedHtHandicap = formatAsianLine(targetHtLineNum);
      const signPrefix = targetHtLineNum > 0 && !formattedHtHandicap.startsWith('+') ? '+' : '';

      predictions.halfAsianHandicap = {
        marketType: 'HALF_ASIAN_HANDICAP',
        marketLabel: '半场让球',
        hasPrediction: true,
        predictedSide: targetSide,
        predictedSelection: `半场 ${teamLabel} ${signPrefix}${formattedHtHandicap}`,
        predictedLine: line,
        modelProbability: modelProb,
        marketProbability: marketProb,
        expectedValue: ev,
        confidence: Math.abs(ev) > 5 ? 'HIGH' : 'MEDIUM',
        quantReason: `上半场剩余 ${remainingHalfTime} 分钟，半场攻守对抗均衡度测算主队净胜概率为 ${homeCoverProb}%。`,
        tacticalFactor: `半场净胜期望: ${expectedHtGoalDiff.toFixed(2)} 球`,
        odds: targetOpt.numOdds
      };
    }
  }

  // -------------------------------------------------------------
  // E. 全场独赢 1X2 (MATCH_WINNER)
  // -------------------------------------------------------------
  const winMarket = findMarket((m) => {
    const t = String(m.market_type || '').toUpperCase();
    const l = String(m.market_label || '');
    return t === 'MATCH_WINNER' || t === '1X2' || l.includes('独赢') || l.includes('胜平负');
  });

  if (winMarket) {
    const opts = getCleanOptions(winMarket);
    const homeOpt = opts.find((o: any) => o.side === 'home' || String(o.selection || '').includes('主') || String(o.selection || '') === '1');
    const drawOpt = opts.find((o: any) => o.side === 'draw' || String(o.selection || '').includes('平') || String(o.selection || '') === 'x' || String(o.selection || '') === 'X');
    const awayOpt = opts.find((o: any) => o.side === 'away' || String(o.selection || '').includes('客') || String(o.selection || '') === '2');

    if (homeOpt && drawOpt && awayOpt) {
      const sumInv = 1 / homeOpt.numOdds + 1 / drawOpt.numOdds + 1 / awayOpt.numOdds;
      const homeImplied = Math.round(((1 / homeOpt.numOdds) / sumInv) * 100);
      const drawImplied = Math.round(((1 / drawOpt.numOdds) / sumInv) * 100);
      const awayImplied = 100 - homeImplied - drawImplied;

      // 量化模型推演 1X2 分布
      let modelHomeProb = homeImplied;
      let modelDrawProb = drawImplied;
      let modelAwayProb = awayImplied;

      if (dominanceStatus === 'STERILE_POSSESSION') {
        // 主队空有控球无射正，调低主胜，调高平局与客胜
        const shift = Math.min(18, homeImplied * 0.32);
        modelHomeProb = Math.round(homeImplied - shift);
        modelDrawProb = Math.round(drawImplied + shift * 0.65);
        modelAwayProb = 100 - modelHomeProb - modelDrawProb;
      } else if (dominanceStatus === 'HOME_DOMINANT') {
        const boost = Math.min(15, (100 - homeImplied) * 0.25);
        modelHomeProb = Math.round(homeImplied + boost);
        modelDrawProb = Math.round(drawImplied - boost * 0.6);
        modelAwayProb = 100 - modelHomeProb - modelDrawProb;
      } else if (dominanceStatus === 'AWAY_DOMINANT') {
        const boost = Math.min(15, (100 - awayImplied) * 0.3);
        modelAwayProb = Math.round(awayImplied + boost);
        modelHomeProb = Math.round(homeImplied - boost * 0.7);
        modelDrawProb = 100 - modelHomeProb - modelAwayProb;
      }

      // 选择模型最看好或最具 EV 的选项
      const evHome = ((modelHomeProb / 100) * homeOpt.numOdds - 1) * 100;
      const evDraw = ((modelDrawProb / 100) * drawOpt.numOdds - 1) * 100;
      const evAway = ((modelAwayProb / 100) * awayOpt.numOdds - 1) * 100;

      // 寻找模型胜率最高项
      let bestSide: 'home' | 'draw' | 'away' = 'home';
      let bestModelProb = modelHomeProb;
      let bestMarketProb = homeImplied;
      let bestOpt = homeOpt;
      let bestEv = evHome;

      if (modelDrawProb > bestModelProb) {
        bestSide = 'draw';
        bestModelProb = modelDrawProb;
        bestMarketProb = drawImplied;
        bestOpt = drawOpt;
        bestEv = evDraw;
      }
      if (modelAwayProb > bestModelProb) {
        bestSide = 'away';
        bestModelProb = modelAwayProb;
        bestMarketProb = awayImplied;
        bestOpt = awayOpt;
        bestEv = evAway;
      }

      let quantReason = '';
      if (dominanceStatus === 'STERILE_POSSESSION') {
        quantReason = `庄家盘口给主胜开出 ${homeImplied}% 隐含概率（${homeOpt.numOdds}），但模型结合0射正与7次危攻落后，将主胜调降至 ${modelHomeProb}%，平局期望上升至 ${modelDrawProb}%。`;
      } else {
        quantReason = `模型推演 1X2 真实概率分布：主胜 ${modelHomeProb}% | 平局 ${modelDrawProb}% | 客胜 ${modelAwayProb}%。`;
      }

      const sideLabel = bestSide === 'home' ? '主胜' : bestSide === 'draw' ? '平局' : '客胜';

      predictions.matchWinner = {
        marketType: 'MATCH_WINNER',
        marketLabel: '全场独赢 (1X2)',
        hasPrediction: true,
        predictedSide: bestSide,
        predictedSelection: sideLabel,
        modelProbability: bestModelProb,
        marketProbability: bestMarketProb,
        expectedValue: Math.round(bestEv * 10) / 10,
        confidence: Math.abs(bestEv) > 5 ? 'HIGH' : 'MEDIUM',
        quantReason,
        tacticalFactor: `胜平负模型分布: 主 ${modelHomeProb}% / 平 ${modelDrawProb}% / 客 ${modelAwayProb}%`,
        odds: bestOpt.numOdds
      };
    }
  }

  return {
    match: std.match,
    homeTeam: std.ybty_home || '主队',
    awayTeam: std.ybty_away || '客队',
    minute,
    score,
    homeThreatScore: Math.round(homeThreat * 10) / 10,
    awayThreatScore: Math.round(awayThreat * 10) / 10,
    expectedRemainingGoals: Math.round(expectedRemainingGoals * 100) / 100,
    dominanceStatus,
    predictions
  };
}

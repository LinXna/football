// Complete Attack Momentum Analytics & Odds Divergence Engine
import { DecisionItem } from '../types';
import { ParsedIncidentItem, TimelinePoint, SegmentData, ParsedTimelineData } from '../components/AttackMomentumTimelineWidget';

export type MomentumPatternType = 
  | 'WAVE_TIT_FOR_TAT'      // 潮汐对攻型 🌊
  | 'SINGLE_SIDE_CHOKE'     // 单边窒息型 🥊
  | 'MIDFIELD_MUD'          // 中场泥潭型 🪵
  | 'STEALTH_COUNTER';      // 偷袭反击型 ⚡

export interface Recent15mAnalysis {
  slope: number; // Slope per minute (+ = Home surging, - = Away surging)
  homeAvg: number;
  awayAvg: number;
  netScore: number;
  direction: 'HOME_SURGING' | 'AWAY_SURGING' | 'HOME_DOMINATING' | 'AWAY_DOMINATING' | 'STALEMATE' | 'SLOW_PACE';
  directionZh: string;
  summaryZh: string;
}

export interface PeakPressurePeriod {
  side: 'home' | 'away';
  sideName: string;
  startLabel: string;
  endLabel: string;
  durationMins: number;
  peakScore: number;
  avgScore: number;
  correlatedIncidents: string[];
  conversionType: 'LETHAL' | 'HIGH_DANGER' | 'CARD_FORCED' | 'STERILE';
  conversionZh: string;
  summaryZh: string;
}

export interface ConversionEfficiency {
  side: 'home' | 'away';
  sideName: string;
  totalMomentumSum: number;
  goals: number;
  corners: number;
  cardsForced: number;
  dangerousEventCount: number;
  efficiencyRating: 'HIGHLY_EFFICIENT' | 'MODERATE' | 'STERILE';
  efficiencyZh: string;
  explanationZh: string;
}

export interface TacticalEventShift {
  eventType: 'SUB' | 'RED_CARD' | 'GOAL';
  eventIcon: string;
  min: number;
  displayMin: string;
  side: 'home' | 'away' | 'neutral';
  sideName: string;
  text: string;
  momentumBefore10: number; // Net score [-100, 100]
  momentumAfter10: number;  // Net score [-100, 100]
  shiftMagnitude: number;   // Delta
  shiftType: 
    | 'SUB_SURGE'          // 换人立竿见影 🔄 提速反扑
    | 'SUB_COLLAPSE'       // 换人失控 ⚠️ 防线失守
    | 'SUB_NEUTRAL'        // 换人保持原状
    | 'RED_CARD_COLLAPSE'  // 红牌崩盘 🟥
    | 'RED_CARD_RESILIENT' // 少打一人顽强抵抗 🛡️
    | 'GOAL_PARK_BUS'      // 领先后收缩大巴 🚌
    | 'GOAL_PRESS_ON'      // 领先后乘胜追击 🔥
    | 'GOAL_TRAIL_SURGE';  // 落后方倾巢反扑 ⚡
  summaryZh: string;
}

export interface OddsDivergenceSignal {
  level: 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';
  tag: string; // e.g. 【持续围攻-破门高危】
  type: 
    | 'DANGER_ATTACK_SURGE'      // 持续围攻-破门高危
    | 'STERILE_PRESSURE_TRAP'    // 雷声大雨点小-无效压制
    | 'COUNTER_THREAT_ALERT'     // 反击起势-警惕冷门
    | 'ODDS_DIVERGENCE_TRAP'     // 盘口异常-虚假受热/机构防下盘
    | 'ODDS_LAG_OPPORTUNITY';    // 攻势起势-赔率滞后窗口
  color: 'emerald' | 'amber' | 'rose' | 'indigo' | 'purple';
  title: string;
  desc: string;
  basis: string;
}

export interface PostMatchAttribution {
  verdict: 'TACTICAL_SUCCESS_BAD_LUCK' | 'TACTICAL_MISJUDGMENT' | 'MOMENTUM_CONFIRMED_WIN' | 'PENDING';
  verdictZh: string;
  analysisZh: string;
  dominanceShareHome: number;
  dominanceShareAway: number;
}

export interface ComprehensiveMomentumReport {
  hasData: boolean;
  totalPoints: number;
  currentMinute: number;
  patternType: MomentumPatternType;
  patternZh: string;
  patternDesc: string;
  recent15m: Recent15mAnalysis;
  peakPeriods: PeakPressurePeriod[];
  homeConversion: ConversionEfficiency;
  awayConversion: ConversionEfficiency;
  tacticalShifts: TacticalEventShift[];
  criticalWindowLateH1: { index: number; desc: string };
  criticalWindowLateH2: { index: number; desc: string };
  divergenceSignals: OddsDivergenceSignal[];
  postMatchAttribution: PostMatchAttribution;
  aiPromptSnippet: string; // Ready to inject into AI Decision Prompts & Briefs
}

/**
 * Analyzes full timeline points and match context to generate comprehensive momentum intelligence
 */
export function analyzeAttackMomentum(
  timeline: ParsedTimelineData,
  match?: DecisionItem
): ComprehensiveMomentumReport {
  if (!timeline.hasTimeline || timeline.points.length === 0) {
    return createEmptyMomentumReport();
  }

  const points = timeline.points;
  const totalPoints = points.length;
  const homeName = match?.ybty_home || match?.leisu_home || '主队';
  const awayName = match?.ybty_away || match?.leisu_away || '客队';
  const incidents = timeline.allIncidents;

  // 1. Calculate Recent 15m Momentum Trend
  const recent15Points = points.slice(Math.max(0, points.length - 15));
  let homeSum15 = 0;
  let awaySum15 = 0;
  let netSum15 = 0;
  
  recent15Points.forEach((p) => {
    homeSum15 += p.h;
    awaySum15 += p.a;
    netSum15 += p.score;
  });

  const count15 = Math.max(1, recent15Points.length);
  const homeAvg15 = Math.round(homeSum15 / count15);
  const awayAvg15 = Math.round(awaySum15 / count15);
  const netAvg15 = Math.round(netSum15 / count15);

  // Compute slope (linear regression) of net scores
  let slope = 0;
  if (count15 >= 3) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    recent15Points.forEach((p, idx) => {
      sumX += idx;
      sumY += p.score;
      sumXY += idx * p.score;
      sumXX += idx * idx;
    });
    const denominator = count15 * sumXX - sumX * sumX;
    if (denominator !== 0) {
      slope = Number(((count15 * sumXY - sumX * sumY) / denominator).toFixed(2));
    }
  }

  let direction: Recent15mAnalysis['direction'] = 'STALEMATE';
  let directionZh = '势均力敌/中场胶着';
  let summaryZh = '';

  if (slope > 2.5 && netAvg15 > 25) {
    direction = 'HOME_SURGING';
    directionZh = '主队攻势极速攀升 ⚡';
    summaryZh = `近${count15}分钟主队攻势斜率陡增(+${slope}/分)，平均压制分达+${homeAvg15}，形成高频围攻态势`;
  } else if (slope < -2.5 && netAvg15 < -25) {
    direction = 'AWAY_SURGING';
    directionZh = '客队攻势极速攀升 ⚡';
    summaryZh = `近${count15}分钟客队攻势斜率大幅下探(-${Math.abs(slope)}/分)，平均压制分达-${awayAvg15}，客队前压猛烈`;
  } else if (netAvg15 >= 45) {
    direction = 'HOME_DOMINATING';
    directionZh = '主队持续高位压制 🥊';
    summaryZh = `近${count15}分钟主队牢牢掌控场面主动权(均值+${homeAvg15})，客队防线全面后撤`;
  } else if (netAvg15 <= -45) {
    direction = 'AWAY_DOMINATING';
    directionZh = '客队持续高位压制 🥊';
    summaryZh = `近${count15}分钟客队牢牢掌控场面主动权(均值-${awayAvg15})，主队陷入被动防守`;
  } else if (homeAvg15 < 25 && awayAvg15 < 25) {
    direction = 'SLOW_PACE';
    directionZh = '低节奏沉闷倒脚 🪵';
    summaryZh = `近${count15}分钟双方攻势均值偏低(主${homeAvg15} / 客${awayAvg15})，球权大多停留在中后场，缺乏实质威胁`;
  } else {
    direction = 'STALEMATE';
    directionZh = '攻守互有往来 ⚖️';
    summaryZh = `近${count15}分钟双方交替冲击(主${homeAvg15} vs 客${awayAvg15})，场面处于动态拉锯阶段`;
  }

  const recent15m: Recent15mAnalysis = {
    slope,
    homeAvg: homeAvg15,
    awayAvg: awayAvg15,
    netScore: netAvg15,
    direction,
    directionZh,
    summaryZh
  };

  // 2. Extract Peak Pressure Periods (|score| >= 65 for >= 3 mins or single peak >= 85)
  const peakPeriods: PeakPressurePeriod[] = [];
  let curSide: 'home' | 'away' | null = null;
  let curStartIdx = -1;
  let curScores: number[] = [];

  points.forEach((p, idx) => {
    const isHomeHigh = p.score >= 60;
    const isAwayHigh = p.score <= -60;

    if (isHomeHigh) {
      if (curSide === 'home') {
        curScores.push(p.score);
      } else {
        if (curSide && curScores.length >= 3) {
          commitPeak(curSide, curStartIdx, idx - 1, curScores);
        }
        curSide = 'home';
        curStartIdx = idx;
        curScores = [p.score];
      }
    } else if (isAwayHigh) {
      if (curSide === 'away') {
        curScores.push(Math.abs(p.score));
      } else {
        if (curSide && curScores.length >= 3) {
          commitPeak(curSide, curStartIdx, idx - 1, curScores);
        }
        curSide = 'away';
        curStartIdx = idx;
        curScores = [Math.abs(p.score)];
      }
    } else {
      if (curSide && curScores.length >= 3) {
        commitPeak(curSide, curStartIdx, idx - 1, curScores);
      }
      curSide = null;
      curScores = [];
    }
  });

  if (curSide && curScores.length >= 3) {
    commitPeak(curSide, curStartIdx, points.length - 1, curScores);
  }

  function commitPeak(side: 'home' | 'away', startI: number, endI: number, scores: number[]) {
    const pStart = points[startI];
    const pEnd = points[endI];
    const sideName = side === 'home' ? homeName : awayName;
    const maxScore = Math.max(...scores);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const duration = endI - startI + 1;

    // Correlate with incidents during this window
    const correlated = incidents
      .filter((inc) => {
        const incIdx = inc.half === 1 ? (inc.stoppageExtra > 0 ? 44 + inc.stoppageExtra : inc.min - 1)
          : (inc.stoppageExtra > 0 ? 44 + inc.stoppageExtra + 45 : inc.min - 1);
        return incIdx >= Math.max(0, startI - 1) && incIdx <= endI + 1;
      })
      .map((inc) => `${inc.displayMin} ${inc.icon} ${inc.text}`);

    let convType: PeakPressurePeriod['conversionType'] = 'STERILE';
    let convZh = '无实质转化/无效围攻';

    const hasGoal = correlated.some(c => c.includes('⚽') || c.includes('进球'));
    const hasCorner = correlated.some(c => c.includes('🚩') || c.includes('角球') || c.includes('射门'));
    const hasCard = correlated.some(c => c.includes('🟨') || c.includes('🟥') || c.includes('黄牌') || c.includes('红牌'));

    if (hasGoal) {
      convType = 'LETHAL';
      convZh = '破门建功 ⚽ 致命压制';
    } else if (hasCorner) {
      convType = 'HIGH_DANGER';
      convZh = '造角/造险 🚩 高危围攻';
    } else if (hasCard) {
      convType = 'CARD_FORCED';
      convZh = '造牌/犯规受压 🟨';
    }

    const summary = `${pStart?.displayLabel || `${startI + 1}'`}-${pEnd?.displayLabel || `${endI + 1}'`} ${sideName}持续极强压迫(峰值${maxScore}分/持续${duration}分钟) → ${convZh}`;

    peakPeriods.push({
      side,
      sideName,
      startLabel: pStart?.displayLabel || `${startI + 1}'`,
      endLabel: pEnd?.displayLabel || `${endI + 1}'`,
      durationMins: duration,
      peakScore: maxScore,
      avgScore,
      correlatedIncidents: correlated,
      conversionType: convType,
      conversionZh: convZh,
      summaryZh: summary
    });
  }

  // 3. Conversion Efficiency Calculation
  let homePressureSum = 0;
  let awayPressureSum = 0;
  points.forEach(p => {
    homePressureSum += p.h;
    awayPressureSum += p.a;
  });

  const homeGoals = incidents.filter(i => i.isGoal && (i.side === 'home' || i.text.includes(homeName))).length;
  const awayGoals = incidents.filter(i => i.isGoal && (i.side === 'away' || i.text.includes(awayName))).length;
  const homeCorners = incidents.filter(i => i.isCorner && (i.side === 'home' || i.text.includes(homeName))).length;
  const awayCorners = incidents.filter(i => i.isCorner && (i.side === 'away' || i.text.includes(awayName))).length;
  const homeCardsForced = incidents.filter(i => i.isCard && (i.side === 'away' || i.text.includes(awayName))).length;
  const awayCardsForced = incidents.filter(i => i.isCard && (i.side === 'home' || i.text.includes(homeName))).length;

  const homeDangerCount = homeGoals * 4 + homeCorners * 1.5 + homeCardsForced * 1;
  const awayDangerCount = awayGoals * 4 + awayCorners * 1.5 + awayCardsForced * 1;

  const calcConversion = (
    side: 'home' | 'away',
    sideName: string,
    sum: number,
    goals: number,
    corners: number,
    cardsForced: number,
    dangerCount: number
  ): ConversionEfficiency => {
    const ratio = sum > 0 ? (dangerCount / (sum / 100)) : 0;
    let rating: ConversionEfficiency['efficiencyRating'] = 'MODERATE';
    let efficiencyZh = '中规中矩';
    let explanationZh = '';

    if (goals > 0 || ratio >= 1.2) {
      rating = 'HIGHLY_EFFICIENT';
      efficiencyZh = '刀刀见血/极高转化 ⚡';
      explanationZh = `${sideName}攻势质量极高，在累积攻势下高效斩获${goals}球与${corners}个角球`;
    } else if (sum > 1200 && goals === 0 && corners <= 1) {
      rating = 'STERILE';
      efficiencyZh = '雷声大雨点小/低效控球 ⚠️';
      explanationZh = `${sideName}虽占用较多攻势波形(${sum}分)，但未转化为有效射门或角球，属于外围倒脚无效压制`;
    } else {
      rating = 'MODERATE';
      efficiencyZh = '常规推进转化';
      explanationZh = `${sideName}攻势转化率平稳，产出${corners}个角球与${cardsForced}张犯规受罚`;
    }

    return {
      side,
      sideName,
      totalMomentumSum: sum,
      goals,
      corners,
      cardsForced,
      dangerousEventCount: Math.round(dangerCount),
      efficiencyRating: rating,
      efficiencyZh,
      explanationZh
    };
  };

  const homeConversion = calcConversion('home', homeName, homePressureSum, homeGoals, homeCorners, homeCardsForced, homeDangerCount);
  const awayConversion = calcConversion('away', awayName, awayPressureSum, awayGoals, awayCorners, awayCardsForced, awayDangerCount);

  // 4. Tactical Event Response (Substitutions, Red Cards, Goals)
  const tacticalShifts: TacticalEventShift[] = [];
  incidents.forEach((inc) => {
    if (!inc.isSub && !inc.isCard && !inc.isGoal) return;
    
    // Find point index for this incident
    let targetIdx = -1;
    if (inc.half === 1) {
      targetIdx = inc.stoppageExtra > 0 ? 44 + inc.stoppageExtra : inc.min - 1;
    } else if (inc.half === 2) {
      targetIdx = inc.stoppageExtra > 0 ? 44 + inc.stoppageExtra + 45 : inc.min - 1;
    } else {
      targetIdx = inc.min - 1;
    }

    if (targetIdx < 0 || targetIdx >= points.length) return;

    // Window: 10 mins before vs 10 mins after
    const beforePoints = points.slice(Math.max(0, targetIdx - 10), targetIdx);
    const afterPoints = points.slice(targetIdx + 1, Math.min(points.length, targetIdx + 11));

    if (beforePoints.length < 2 || afterPoints.length < 2) return;

    const avgBefore = Math.round(beforePoints.reduce((acc, p) => acc + p.score, 0) / beforePoints.length);
    const avgAfter = Math.round(afterPoints.reduce((acc, p) => acc + p.score, 0) / afterPoints.length);
    const delta = avgAfter - avgBefore;

    const sideName = inc.side === 'home' ? homeName : inc.side === 'away' ? awayName : '中立';

    if (inc.isSub) {
      let shiftType: TacticalEventShift['shiftType'] = 'SUB_NEUTRAL';
      let summary = '';
      if ((inc.side === 'home' && delta >= 30) || (inc.side === 'away' && delta <= -30)) {
        shiftType = 'SUB_SURGE';
        summary = `${inc.displayMin} ${sideName}换人调整立竿见影！替补登场后10分钟攻势大幅攀升(净变化${Math.abs(delta)}分)`;
      } else if ((inc.side === 'home' && delta <= -30) || (inc.side === 'away' && delta >= 30)) {
        shiftType = 'SUB_COLLAPSE';
        summary = `${inc.displayMin} ${sideName}换人后场面失控，中场失势被对手迅速反扑(净变化${Math.abs(delta)}分)`;
      } else {
        shiftType = 'SUB_NEUTRAL';
        summary = `${inc.displayMin} ${sideName}常规换人调配，攻势波形平稳过渡`;
      }
      tacticalShifts.push({
        eventType: 'SUB',
        eventIcon: '🔄',
        min: inc.min,
        displayMin: inc.displayMin,
        side: inc.side,
        sideName,
        text: inc.shortText || inc.text,
        momentumBefore10: avgBefore,
        momentumAfter10: avgAfter,
        shiftMagnitude: delta,
        shiftType,
        summaryZh: summary
      });
    } else if (inc.isCard && inc.icon === '🟥') {
      const isHomeRed = inc.side === 'home';
      let shiftType: TacticalEventShift['shiftType'] = 'RED_CARD_COLLAPSE';
      let summary = '';
      if ((isHomeRed && avgAfter <= -20) || (!isHomeRed && avgAfter >= 20)) {
        shiftType = 'RED_CARD_COLLAPSE';
        summary = `${inc.displayMin} ${sideName}吃到红牌后防线溃缩，陷入被动防守泥潭`;
      } else {
        shiftType = 'RED_CARD_RESILIENT';
        summary = `${inc.displayMin} ${sideName}少打一人但防守韧性极强，攻势波形并未完全崩溃`;
      }
      tacticalShifts.push({
        eventType: 'RED_CARD',
        eventIcon: '🟥',
        min: inc.min,
        displayMin: inc.displayMin,
        side: inc.side,
        sideName,
        text: inc.shortText || inc.text,
        momentumBefore10: avgBefore,
        momentumAfter10: avgAfter,
        shiftMagnitude: delta,
        shiftType,
        summaryZh: summary
      });
    } else if (inc.isGoal) {
      const isHomeScored = inc.side === 'home';
      let shiftType: TacticalEventShift['shiftType'] = 'GOAL_PRESS_ON';
      let summary = '';

      if ((isHomeScored && avgAfter >= 30) || (!isHomeScored && avgAfter <= -30)) {
        shiftType = 'GOAL_PRESS_ON';
        summary = `${inc.displayMin} ${sideName}破门后乘胜追击，攻势持续前压不松懈`;
      } else if ((isHomeScored && avgAfter <= -20) || (!isHomeScored && avgAfter >= 20)) {
        shiftType = 'GOAL_PARK_BUS';
        summary = `${inc.displayMin} ${sideName}取得领先后主动后撤摆大巴收缩防守，由攻转守`;
      } else {
        shiftType = 'GOAL_TRAIL_SURGE';
        summary = `${inc.displayMin} 进球打破僵局，落后方发动倾巢反扑`;
      }
      tacticalShifts.push({
        eventType: 'GOAL',
        eventIcon: '⚽',
        min: inc.min,
        displayMin: inc.displayMin,
        side: inc.side,
        sideName,
        text: inc.shortText || inc.text,
        momentumBefore10: avgBefore,
        momentumAfter10: avgAfter,
        shiftMagnitude: delta,
        shiftType,
        summaryZh: summary
      });
    }
  });

  // 5. Pattern Classification (Wave Tit-for-Tat vs Choke vs Mud vs Counter)
  let patternType: MomentumPatternType = 'MIDFIELD_MUD';
  let patternZh = '中场泥潭型 🪵';
  let patternDesc = '双方在中场频繁肉搏倒脚，深入禁区高危波峰极少，属于典型沉闷防守格局';

  // Compute standard deviation and choke counts
  const allScores = points.map(p => p.score);
  const mean = allScores.reduce((a, b) => a + b, 0) / (allScores.length || 1);
  const variance = allScores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (allScores.length || 1);
  const stdDev = Math.sqrt(variance);

  const homeChokeCount = points.filter(p => p.score >= 70).length;
  const awayChokeCount = points.filter(p => p.score <= -70).length;
  const mudCount = points.filter(p => Math.abs(p.score) <= 25).length;

  if (homeChokeCount >= 10 || awayChokeCount >= 10) {
    patternType = 'SINGLE_SIDE_CHOKE';
    const dominant = homeChokeCount >= awayChokeCount ? homeName : awayName;
    patternZh = '单边窒息围攻型 🥊';
    patternDesc = `${dominant}长时间占据高压顶格(>70分)，半场攻防完全倾斜，极易产生持续角球与犯规造牌`;
  } else if (stdDev >= 45 && (homePressureSum > 1000 && awayPressureSum > 1000)) {
    patternType = 'WAVE_TIT_FOR_TAT';
    patternZh = '潮汐大开大合型 🌊';
    patternDesc = '双方攻防转换节奏极快，波形在正负两端高频大幅震荡，具备极高破门与大球穿盘潜质';
  } else if (mudCount / points.length >= 0.65) {
    patternType = 'MIDFIELD_MUD';
    patternZh = '中场泥潭胶着型 🪵';
    patternDesc = '双方超过65%时间处于中场均势倒脚([ -25, +25 ])，缺乏纵深突破，小球与沉闷走势明显';
  } else {
    // Check stealth counter
    patternType = 'STEALTH_COUNTER';
    patternZh = '突袭反击锋芒型 ⚡';
    patternDesc = '阵地战波形平稳，但间歇性爆发单分钟极速突袭峰值，反击成功率高，需警惕受让冷门';
  }

  // 6. Critical Window Indices (Late H1: 35'-45+', Late H2: 75'-90+')
  const lateH1Points = points.filter(p => p.segmentIndex === 0 && p.idxInSeg >= 34);
  const lateH1Heat = lateH1Points.length > 0 ? Math.round(lateH1Points.reduce((acc, p) => acc + (p.h + p.a), 0) / lateH1Points.length) : 0;
  const criticalWindowLateH1 = {
    index: lateH1Heat,
    desc: lateH1Heat >= 65 ? '【半场补时高危压制】半场末段双方搏杀热度飙升' : '半场末段攻防节奏平缓'
  };

  const lateH2Points = points.filter(p => p.segmentIndex === 1 && p.idxInSeg >= 29);
  const lateH2Heat = lateH2Points.length > 0 ? Math.round(lateH2Points.reduce((acc, p) => acc + (p.h + p.a), 0) / lateH2Points.length) : 0;
  const criticalWindowLateH2 = {
    index: lateH2Heat,
    desc: lateH2Heat >= 70 ? '【75+绝杀搏杀高危】终局阶段攻势全面大爆发，剩余进球预期极强' : '终局阶段体能受限，节奏放缓'
  };

  // 7. Odds & Momentum Divergence Traps
  const divergenceSignals: OddsDivergenceSignal[] = [];

  // Signal 1: 【持续围攻-破门高危】
  if (recent15m.homeAvg >= 65 || recent15m.awayAvg >= 65) {
    const activeSide = recent15m.homeAvg >= 65 ? homeName : awayName;
    divergenceSignals.push({
      level: 'CRITICAL',
      tag: '【持续围攻-破门高危】',
      type: 'DANGER_ATTACK_SURGE',
      color: 'emerald',
      title: `${activeSide}进入持续狂攻破僵窗口`,
      desc: `近15分钟平均压制强度突破${Math.max(recent15m.homeAvg, recent15m.awayAvg)}分，禁区内防守负荷濒临极限。`,
      basis: `近15m攻势斜率: ${recent15m.slope} | 峰值高潮区间: ${peakPeriods.length}次`
    });
  }

  // Signal 2: 【雷声大雨点小-无效压制】
  if (homeConversion.efficiencyRating === 'STERILE' || awayConversion.efficiencyRating === 'STERILE') {
    const sterileSide = homeConversion.efficiencyRating === 'STERILE' ? homeName : awayName;
    divergenceSignals.push({
      level: 'WARNING',
      tag: '【雷声大雨点小-无效压制】',
      type: 'STERILE_PRESSURE_TRAP',
      color: 'amber',
      title: `${sterileSide}攻势虚高/缺乏实质破门杀伤力`,
      desc: `波形总压制积分极高但未产生有效射正或绝对良机，谨防盲目追捧让球深盘。`,
      basis: `总压制积分高达${Math.max(homePressureSum, awayPressureSum)}，但进球0、角球稀缺`
    });
  }

  // Signal 3: 【反击起势-警惕冷门】
  if (patternType === 'STEALTH_COUNTER' || (recent15m.awayAvg >= 55 && (match?.model_score || 0) > 80)) {
    divergenceSignals.push({
      level: 'WARNING',
      tag: '【反击起势-警惕冷门】',
      type: 'COUNTER_THREAT_ALERT',
      color: 'purple',
      title: `弱势方具备极强偷袭爆发力`,
      desc: `波形显示弱势方反击转化效率极高，每次前压均形成有效杀伤，提防热门爆冷或受让穿盘。`,
      basis: `攻势形态判定为【突袭反击锋芒型】，多次在被动局势下瞬时打出峰值`
    });
  }

  // Signal 4: 盘口背离与滞后机会检测 (Odds Divergence)
  const spreadSnap = match?.market_snapshots?.find((s) => /spread|让球|handicap/i.test(s.market_type || s.market_label || ''));
  if (spreadSnap) {
    const homeOdds = Number(
      spreadSnap.home_or_over_odds ??
      spreadSnap.options?.find((o: any) => o.side === 'home' || String(o.selection || '').includes('主'))?.odds ??
      0
    );

    // If home is heavily dominating (net >= 50) but odds are rising (water >= 2.05) or line shrinking
    if (recent15m.netScore >= 50 && homeOdds >= 2.05 && spreadSnap.is_verified) {
      divergenceSignals.push({
        level: 'CRITICAL',
        tag: '【盘口异常-虚假受热/机构防下盘】',
        type: 'ODDS_DIVERGENCE_TRAP',
        color: 'rose',
        title: `场面极热但机构水位异常高企`,
        desc: `主队近15分钟攻势高达+${recent15m.homeAvg}分，但让球盘水位反向升水至${homeOdds}，机构可能在控制下盘赔付。`,
        basis: `攻势积分(+${recent15m.netScore}) vs 让球水位(${homeOdds})形成显著负背离`
      });
    }

    // If home is surging fast (slope > 3) but odds have not moved significantly yet
    if (recent15m.slope >= 3.0 && homeOdds >= 1.85 && spreadSnap.is_verified) {
      divergenceSignals.push({
        level: 'OPPORTUNITY',
        tag: '【攻势起势-赔率滞后窗口】',
        type: 'ODDS_LAG_OPPORTUNITY',
        color: 'indigo',
        title: `攻势暴涨但盘口尚未完全调价`,
        desc: `主队攻势斜率急剧拉升，场面正在发生结构性前压，目前赔率尚未迅速跳水，存在时间差窗口。`,
        basis: `攻势斜率+${recent15m.slope}/分，机构风控尚处在滞后反应期`
      });
    }
  }

  // 8. Post Match Attribution
  const homeRatio = Math.round((homePressureSum / (homePressureSum + awayPressureSum || 1)) * 100);
  const awayRatio = 100 - homeRatio;
  let postMatchVerdict: PostMatchAttribution['verdict'] = 'PENDING';
  let postMatchVerdictZh = '比赛进行中/待终局结算';
  let postMatchAnalysisZh = `主队攻势占比 ${homeRatio}% vs 客队 ${awayRatio}%`;

  if (match?.score) {
    const isHomeWin = match.score.home > match.score.away;
    const isAwayWin = match.score.away > match.score.home;
    const isDraw = match.score.home === match.score.away;

    if (homeRatio >= 70 && !isHomeWin) {
      postMatchVerdict = 'TACTICAL_SUCCESS_BAD_LUCK';
      postMatchVerdictZh = '战术碾压但运气欠佳 (Bad Luck)';
      postMatchAnalysisZh = `主队全场占据${homeRatio}%窒息压制，产出${homeConversion.corners}角球，但因临门一脚运气或对手偷袭失利。`;
    } else if (homeRatio >= 60 && isHomeWin) {
      postMatchVerdict = 'MOMENTUM_CONFIRMED_WIN';
      postMatchVerdictZh = '攻势碾压且顺利打出 (Confirmed Win)';
      postMatchAnalysisZh = `主队从始至终牢牢控制局面(${homeRatio}%压制)，攻势与赛果高度契合。`;
    } else if (homeRatio <= 40 && isHomeWin) {
      postMatchVerdict = 'TACTICAL_MISJUDGMENT';
      postMatchVerdictZh = '场面被动但侥幸获胜';
      postMatchAnalysisZh = `主队全场场面被动(仅占${homeRatio}%攻势)，依靠定位球或反击偷分。`;
    }
  }

  const postMatchAttribution: PostMatchAttribution = {
    verdict: postMatchVerdict,
    verdictZh: postMatchVerdictZh,
    analysisZh: postMatchAnalysisZh,
    dominanceShareHome: homeRatio,
    dominanceShareAway: awayRatio
  };

  // 9. Generate AI Prompt Snippet for LLM Briefs
  const aiPromptSnippet = `
【雷速高频攻势时序深度特征量化】
- 攻势形态分型: ${patternZh} (${patternDesc})
- 近15分钟攻势趋势: ${recent15m.directionZh} (斜率: ${recent15m.slope > 0 ? '+' : ''}${recent15m.slope}/分, 均值: 主${recent15m.homeAvg} vs 客${recent15m.awayAvg})
- 极强压制高潮(≥65分): 共触发 ${peakPeriods.length} 次
${peakPeriods.slice(0, 3).map(p => `  * ${p.summaryZh}`).join('\n')}
- 攻势转化质量: 
  * ${homeName}: ${homeConversion.efficiencyZh} (总积分${homeConversion.totalMomentumSum}, 转化${homeConversion.goals}球/${homeConversion.corners}角)
  * ${awayName}: ${awayConversion.efficiencyZh} (总积分${awayConversion.totalMomentumSum}, 转化${awayConversion.goals}球/${awayConversion.corners}角)
- 战术突变响应(换人/红牌/进球): ${tacticalShifts.length > 0 ? tacticalShifts.map(s => s.summaryZh).join(' | ') : '暂无重大战术突变'}
- 决胜关键时段: ${criticalWindowLateH1.desc} | ${criticalWindowLateH2.desc}
- 盘口背离与陷阱警示: ${divergenceSignals.length > 0 ? divergenceSignals.map(d => `${d.tag} ${d.title}`).join('; ') : '盘口与攻势暂未出现显著负背离'}
`.trim();

  return {
    hasData: true,
    totalPoints,
    currentMinute: timeline.currentMinute,
    patternType,
    patternZh,
    patternDesc,
    recent15m,
    peakPeriods,
    homeConversion,
    awayConversion,
    tacticalShifts,
    criticalWindowLateH1,
    criticalWindowLateH2,
    divergenceSignals,
    postMatchAttribution,
    aiPromptSnippet
  };
}

function createEmptyMomentumReport(): ComprehensiveMomentumReport {
  return {
    hasData: false,
    totalPoints: 0,
    currentMinute: 0,
    patternType: 'MIDFIELD_MUD',
    patternZh: '暂无波形数据',
    patternDesc: '雷速未返回有效的攻势时序流',
    recent15m: {
      slope: 0,
      homeAvg: 0,
      awayAvg: 0,
      netScore: 0,
      direction: 'STALEMATE',
      directionZh: '暂无趋势',
      summaryZh: '暂无近15分钟攻势数据'
    },
    peakPeriods: [],
    homeConversion: {
      side: 'home',
      sideName: '主队',
      totalMomentumSum: 0,
      goals: 0,
      corners: 0,
      cardsForced: 0,
      dangerousEventCount: 0,
      efficiencyRating: 'MODERATE',
      efficiencyZh: '暂无数据',
      explanationZh: ''
    },
    awayConversion: {
      side: 'away',
      sideName: '客队',
      totalMomentumSum: 0,
      goals: 0,
      corners: 0,
      cardsForced: 0,
      dangerousEventCount: 0,
      efficiencyRating: 'MODERATE',
      efficiencyZh: '暂无数据',
      explanationZh: ''
    },
    tacticalShifts: [],
    criticalWindowLateH1: { index: 0, desc: '暂无数据' },
    criticalWindowLateH2: { index: 0, desc: '暂无数据' },
    divergenceSignals: [],
    postMatchAttribution: {
      verdict: 'PENDING',
      verdictZh: '未结算',
      analysisZh: '暂无赛后归因数据',
      dominanceShareHome: 50,
      dominanceShareAway: 50
    },
    aiPromptSnippet: '【攻势时序】暂无可用波形数据'
  };
}

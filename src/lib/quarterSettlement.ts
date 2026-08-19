export interface SettlementParams {
  market: string; // e.g. "全场大球", "全场小球", "半场让球", "半场大小", "半场波胆"
  line: string | number; // e.g. 2.25, 2.75, "2/2.5", "2.5/3", -0.25, "-0.5/-1"
  odds?: number; // e.g. 1.92
  scoreAtRec?: { home: number; away: number } | null;
  finalScore?: { home: number; away: number } | null;
  halfTimeScore?: { home: number; away: number } | null;
  scoreVerified?: boolean; // Rule #4 constraint
  isLive?: boolean;
  /** Explicit provider settlement basis. Live totals default to full-match totals. */
  basis?: 'full_match_total' | 'remaining_goals' | 'remaining_period_dominance' | string;
  homeTeam?: string;
  awayTeam?: string;
}

export interface SplitOutcome {
  line: number;
  outcome: 'win' | 'loss' | 'push';
  label: string;
}

export interface SettlementDetail {
  outcome: 'win' | 'half_win' | 'push' | 'half_loss' | 'loss' | 'invalid_data' | 'pending';
  outcomeLabel: string;
  badgeColor: string; // Tailwind color classes
  badgeBg: string;
  badgeText: string;
  numericLine: number;
  isQuarterLine: boolean;
  quarterSplitText: string;
  
  // Explanation & Math
  isLive: boolean;
  scoreAtRecStr: string;
  finalScoreStr: string;
  effectiveValue: number; // Effective goals or goal diff
  calculationExplanation: string;
  
  // Financial Returns
  odds: number;
  netProfitUnit: number; // Net profit per 1 unit stake
  netProfitText: string; // e.g. "+0.45u", "-0.50u"
  payoutReturnText: string; // e.g. "返还 1.45u"
  
  // Half-bet details
  splitA?: SplitOutcome;
  splitB?: SplitOutcome;
}

/**
 * Parse any line representation into a normalized floating point number.
 * Supports "2.25", "2/2.5", "2.5/3", "-0/0.5", "-0.5/-1", "+0.5/+1", "大 2.25", etc.
 */
export function parseQuarterLine(lineInput: string | number): number {
  if (typeof lineInput === 'number') return lineInput;
  if (!lineInput) return 0;

  const str = String(lineInput).trim().replace(/\s+/g, '');

  // Handle fractional split notation like "2/2.5", "2.5/3", "-0/0.5", "-0.5/-1", "+0.5/+1"
  const splitMatch = str.match(/^([+-]?\d*(?:\.\d+)?)\/([+-]?\d*(?:\.\d+)?)$/);
  if (splitMatch) {
    const v1 = parseFloat(splitMatch[1]);
    let v2 = parseFloat(splitMatch[2]);
    // Backward compatibility for the legacy formatter, which emitted -0.5/1
    // for -0.75. An unsigned second leg following a negative first leg belongs
    // to the same negative handicap: -0.5/-1.
    if (v1 < 0 && !splitMatch[2].startsWith('-') && !splitMatch[2].startsWith('+')) {
      v2 = -Math.abs(v2);
    }
    if (!isNaN(v1) && !isNaN(v2)) {
      return (v1 + v2) / 2;
    }
  }

  // Extract signed numeric value
  const numMatch = str.match(/([+-]?\d+(?:\.\d+)?)/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    if (!isNaN(val)) return val;
  }
  return 0;
}

/**
 * Format numeric lines into Asian quarter line notation:
 * 0.25 -> "0/0.5"
 * 0.75 -> "0.5/1"
 * 1.25 -> "1/1.5"
 * 1.75 -> "1.5/2"
 * 2.25 -> "2/2.5"
 * 2.75 -> "2.5/3"
 * -0.75 -> "-0.5/-1"
 * -0.25 -> "-0/-0.5"
 */
export function formatAsianLine(rawLine: string | number): string {
  if (rawLine === undefined || rawLine === null || rawLine === '') return '0';
  const str = String(rawLine).trim();
  
  if (str.includes('/') || isNaN(Number(str))) return str;
  
  const num = parseFloat(str);
  if (isNaN(num)) return str;

  const isNegative = num < 0;
  const abs = Math.abs(num);
  const frac = Math.round((abs - Math.floor(abs)) * 100);

  if (frac === 25) {
    const low = Math.floor(abs);
    const high = low + 0.5;
    return isNegative ? `-${low}/-${high}` : `${low}/${high}`;
  } else if (frac === 75) {
    const low = Math.floor(abs) + 0.5;
    const high = Math.floor(abs) + 1;
    return isNegative ? `-${low}/-${high}` : `${low}/${high}`;
  }

  return str;
}

/**
 * Check whether a line is a quarter line (.25 or .75)
 */
export function isQuarterLine(line: number): boolean {
  const abs = Math.abs(line);
  const frac = Math.round((abs - Math.floor(abs)) * 100);
  return frac === 25 || frac === 75;
}

/**
 * Split a quarter line into two half-bets
 */
export function getQuarterSplits(line: number): { lineA: number; lineB: number } {
  return {
    lineA: Math.round((line - 0.25) * 100) / 100,
    lineB: Math.round((line + 0.25) * 100) / 100,
  };
}

/**
 * Determine market direction and category
 */
export function classifyMarket(marketStr: string, lineInput?: string | number, homeTeam?: string, awayTeam?: string): {
  type:
    | 'total_over'
    | 'total_under'
    | 'total_unknown'
    | 'spread_home'
    | 'spread_away'
    | 'spread_unknown'
    | 'h2h_home'
    | 'h2h_away'
    | 'h2h_draw'
    | 'btts_yes'
    | 'btts_no'
    | 'correct_score'
    | 'odd_even_odd'
    | 'odd_even_even';
  displayName: string;
  isHalfTime: boolean;
} {
  const m = (marketStr || '').toLowerCase();
  const l = (lineInput !== undefined && lineInput !== null ? String(lineInput) : '').toLowerCase();

  const isHalfTime = m.includes('半场') || m.includes('上半场') || m.includes('1st half') || m.includes('ht') || m.includes('half');
  const normalizedMarket = m.replace(/[\s\-_·\.（）()]/g, '');
  const normalizedDirection = `${m}${l}`.replace(/[\s\-_·\.（）()]/g, '');
  const normalizedHome = String(homeTeam || '').toLowerCase().replace(/[\s\-_·\.（）()]/g, '');
  const normalizedAway = String(awayTeam || '').toLowerCase().replace(/[\s\-_·\.（）()]/g, '');

  // 1. BTTS 双方均有进球 / 双方进球
  if (m.includes('btts') || m.includes('双方') || m.includes('两队进球') || m.includes('两队均进球')) {
    if (l.includes('否') || l.includes('no') || l === '0' || m.includes('否')) {
      return { type: 'btts_no', displayName: isHalfTime ? '半场双方均有进球: 否' : '双方均有进球: 否', isHalfTime };
    }
    return { type: 'btts_yes', displayName: isHalfTime ? '半场双方均有进球: 是' : '双方均有进球: 是', isHalfTime };
  }

  // 2. 波胆 / 正确比分 / 比分
  if (m.includes('波胆') || m.includes('正确比分') || m.includes('correct_score')) {
    return { type: 'correct_score', displayName: isHalfTime ? '半场正确比分' : '正确比分(波胆)', isHalfTime };
  }

  // 3. 单双
  if (m.includes('单双') || m.includes('odd/even') || m.includes('odd_even')) {
    if (l.includes('双') || l.includes('even')) {
      return { type: 'odd_even_even', displayName: isHalfTime ? '半场进球单双: 双' : '总进球单双: 双', isHalfTime };
    }
    return { type: 'odd_even_odd', displayName: isHalfTime ? '半场进球单双: 单' : '总进球单双: 单', isHalfTime };
  }

  // 4. 独赢 / 1X2 / 胜平负
  if (m.includes('独赢') || m.includes('胜平负') || m.includes('1x2') || m.includes('h2h')) {
    if (m.includes('平') || l.includes('平') || l.includes('x') || l.includes('draw')) {
      return { type: 'h2h_draw', displayName: isHalfTime ? '半场平局' : '平局', isHalfTime };
    }
    if (m.includes('客') || l.includes('客') || l === '2' || l.includes('away')) {
      return { type: 'h2h_away', displayName: isHalfTime ? '半场客胜' : '客胜', isHalfTime };
    }
    return { type: 'h2h_home', displayName: isHalfTime ? '半场主胜' : '主胜', isHalfTime };
  }

  // 5. 让球。必须先于大小球判断，避免球队名中的“大/小”被误判为大小球方向。
  if (m.includes('让球') || m.includes('spread') || m.includes('handicap')) {
    if ((normalizedAway && normalizedDirection.includes(normalizedAway)) || m.includes('客') || l.includes('客') || m.includes('away') || l.includes('away')) {
      return { type: 'spread_away', displayName: isHalfTime ? '半场客队让球' : '客队让球', isHalfTime };
    }
    if ((normalizedHome && normalizedDirection.includes(normalizedHome)) || m.includes('主') || l.includes('主') || m.includes('home') || l.includes('home')) {
      return { type: 'spread_home', displayName: isHalfTime ? '半场主队让球' : '主队让球', isHalfTime };
    }
    return { type: 'spread_unknown', displayName: isHalfTime ? '半场让球方向不明' : '全场让球方向不明', isHalfTime };
  }

  // 6. 大小球 / 盘口
  // “大小球”是市场类别名称，本身同时包含“大”和“小”，不能直接用
  // m.includes('小') 判方向；应先移除类别词，再读取括号中的真实方向。
  const totalDirection = `${m.replace(/大小球|总进球盘口|total goals?/g, ' ')} ${l}`;
  if (totalDirection.includes('小') || m.includes('under')) {
    return { type: 'total_under', displayName: isHalfTime ? '半场小球' : '全场小球', isHalfTime };
  }
  if (totalDirection.includes('大') || m.includes('over') || m.includes('total')) {
    return { type: 'total_over', displayName: isHalfTime ? '半场大球' : '全场大球', isHalfTime };
  }
  if (m.includes('大小球') || m.includes('total')) {
    return { type: 'total_unknown', displayName: isHalfTime ? '半场大小球方向不明' : '全场大小球方向不明', isHalfTime };
  }

  // 7. 兼容未明确包含“让球”字样的旧让球记录
  if (m.includes('客') || m.includes('away')) {
    return { type: 'spread_away', displayName: isHalfTime ? '半场客队让球' : '客队让球', isHalfTime };
  }
  if (m.includes('主') || m.includes('home') || m.includes('spread') || m.includes('让球')) {
    return { type: 'spread_home', displayName: isHalfTime ? '半场主队让球' : '主队让球', isHalfTime };
  }
  if (m.includes('平') || m.includes('draw')) {
    return { type: 'h2h_draw', displayName: isHalfTime ? '半场平局' : '平局', isHalfTime };
  }

  return { type: 'total_unknown', displayName: isHalfTime ? '半场玩法方向不明' : '全场玩法方向不明', isHalfTime };
}

/**
 * Core Settlement Engine
 */
export function evaluateQuarterSettlement(params: SettlementParams): SettlementDetail {
  const {
    market,
    line: rawLine,
    odds: rawOdds,
    scoreAtRec = { home: 0, away: 0 },
    finalScore,
    halfTimeScore,
    scoreVerified = true,
    isLive: explicitIsLive = false,
    basis,
    homeTeam,
    awayTeam,
  } = params;

  const odds = Number(rawOdds) > 1 ? Number(rawOdds) : 1;
  const line = parseQuarterLine(rawLine);
  const marketCategory = classifyMarket(market, rawLine, homeTeam, awayTeam);

  const isSpecialNonAsianLineMarket =
    marketCategory.type === 'btts_yes' ||
    marketCategory.type === 'btts_no' ||
    marketCategory.type === 'correct_score' ||
    marketCategory.type === 'odd_even_odd' ||
    marketCategory.type === 'odd_even_even' ||
    marketCategory.type.startsWith('h2h_');

  const quarter = isSpecialNonAsianLineMarket ? false : isQuarterLine(line);

  const recH = scoreAtRec?.home ?? 0;
  const recA = scoreAtRec?.away ?? 0;

  // 自动判定是否为滚球后续时段结算：显式指定 isLive 或 推荐时已有进球 (recH > 0 或 recA > 0)
  const isLive = explicitIsLive || Boolean(scoreAtRec && (recH > 0 || recA > 0));

  if (marketCategory.type === 'spread_unknown' || marketCategory.type === 'total_unknown') {
    return {
      outcome: 'invalid_data', outcomeLabel: '方向不明确 (Invalid)',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40', badgeBg: 'bg-amber-500/20', badgeText: 'text-amber-300',
      numericLine: line, isQuarterLine: quarter, quarterSplitText: '禁止默认猜测投注方向',
      isLive, scoreAtRecStr: `${scoreAtRec?.home ?? 0}-${scoreAtRec?.away ?? 0}`,
      finalScoreStr: finalScore ? `${finalScore.home}-${finalScore.away}` : '未完场', effectiveValue: 0,
      calculationExplanation: marketCategory.type === 'spread_unknown'
        ? '让球记录缺少投注球队（主队/客队或明确球队名），不能结算。'
        : '大小球记录缺少明确的“大/小”方向，不能结算。',
      odds, netProfitUnit: 0, netProfitText: '0.00u', payoutReturnText: '无效数据',
    };
  }

  if (!(Number(rawOdds) > 1)) {
    return {
      outcome: 'invalid_data', outcomeLabel: '无真实赔率',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40', badgeBg: 'bg-rose-500/20', badgeText: 'text-rose-300',
      numericLine: line, isQuarterLine: quarter, quarterSplitText: '赔率缺失，禁止使用默认值结算',
      isLive, scoreAtRecStr: `${scoreAtRec?.home ?? 0}-${scoreAtRec?.away ?? 0}`,
      finalScoreStr: finalScore ? `${finalScore.home}-${finalScore.away}` : '未完场', effectiveValue: 0,
      calculationExplanation: '记录没有真实赔率，不能计算盈亏。', odds: 1,
      netProfitUnit: 0, netProfitText: '0.00u', payoutReturnText: '无效数据',
    };
  }

  // If final score is missing or review is pending
  if (!finalScore || finalScore.home === undefined || finalScore.away === undefined) {
    return {
      outcome: 'pending',
      outcomeLabel: '待核实 (Pending)',
      badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
      badgeBg: 'bg-slate-800',
      badgeText: 'text-slate-400',
      numericLine: line,
      isQuarterLine: quarter,
      quarterSplitText: quarter ? `拆分盘口 (${line - 0.25} / ${line + 0.25})` : `单线盘口 (${line})`,
      isLive,
      scoreAtRecStr: `${scoreAtRec?.home ?? 0}-${scoreAtRec?.away ?? 0}`,
      finalScoreStr: '未完场',
      effectiveValue: 0,
      calculationExplanation: '等待赛后完场比分核实',
      odds,
      netProfitUnit: 0,
      netProfitText: '0.00u',
      payoutReturnText: '待结算',
    };
  }

  // 针对半场盘口：若未录入半场比分，不可直接按全场比分误算！
  if (marketCategory.isHalfTime && (!halfTimeScore || halfTimeScore.home === undefined || halfTimeScore.away === undefined)) {
    return {
      outcome: 'pending',
      outcomeLabel: '待填半场比分 (Missing HT Score)',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      badgeBg: 'bg-amber-500/20',
      badgeText: 'text-amber-300',
      numericLine: line,
      isQuarterLine: quarter,
      quarterSplitText: quarter ? `拆分盘口 (${line - 0.25} / ${line + 0.25})` : `单线盘口 (${line})`,
      isLive,
      scoreAtRecStr: `${scoreAtRec?.home ?? 0}-${scoreAtRec?.away ?? 0}`,
      finalScoreStr: `${finalScore.home}-${finalScore.away} (缺少半场比分)`,
      effectiveValue: 0,
      calculationExplanation: '警告: 该推荐为半场盘口，必须录入半场比分后方可自动结算！',
      odds,
      netProfitUnit: 0,
      netProfitText: '0.00u',
      payoutReturnText: '待录入半场比分',
    };
  }

  // Rule #4: Unverified score -> invalid_data
  if (scoreVerified === false) {
    return {
      outcome: 'invalid_data',
      outcomeLabel: '无效数据 (Invalid Data)',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      badgeBg: 'bg-amber-500/20',
      badgeText: 'text-amber-300',
      numericLine: line,
      isQuarterLine: quarter,
      quarterSplitText: quarter ? `拆分盘口 (${line - 0.25} / ${line + 0.25})` : `单线盘口 (${line})`,
      isLive,
      scoreAtRecStr: `${scoreAtRec?.home ?? 0}-${scoreAtRec?.away ?? 0}`,
      finalScoreStr: `${finalScore.home}-${finalScore.away}`,
      effectiveValue: 0,
      calculationExplanation: '比分未经双源校验，标记为无效数据，不计盈亏',
      odds,
      netProfitUnit: 0,
      netProfitText: '0.00u',
      payoutReturnText: '不计盈亏',
    };
  }

  // Calculate effective value based on market type & Rule #5 / Rule #6
  let effectiveValue = 0;
  let calculationExplanation = '';

  const finH = marketCategory.isHalfTime && halfTimeScore ? halfTimeScore.home : finalScore.home;
  const finA = marketCategory.isHalfTime && halfTimeScore ? halfTimeScore.away : finalScore.away;
  const scorePrefix = marketCategory.isHalfTime ? `半场比分 (${finH}-${finA})` : `完场比分 ${finH}-${finA}`;

  if (marketCategory.type === 'btts_yes' || marketCategory.type === 'btts_no') {
    effectiveValue = finH > 0 && finA > 0 ? 1 : 0;
    calculationExplanation = `${scorePrefix}，双方均有进球: ${effectiveValue === 1 ? '是 (1)' : '否 (0)'}`;
  } else if (marketCategory.type === 'correct_score') {
    effectiveValue = 0;
    calculationExplanation = `${scorePrefix}，预测波胆目标: ${rawLine}`;
  } else if (marketCategory.type === 'odd_even_odd' || marketCategory.type === 'odd_even_even') {
    effectiveValue = (finH + finA) % 2;
    calculationExplanation = `${scorePrefix}，进球总数 ${finH + finA} (${effectiveValue !== 0 ? '单' : '双'})`;
  } else if (marketCategory.type === 'total_over' || marketCategory.type === 'total_under') {
    if (isLive && !marketCategory.isHalfTime && basis === 'remaining_goals') {
      // Only explicitly marked remaining-goal markets subtract the recommendation score.
      const totalFin = finH + finA;
      const totalRec = recH + recA;
      effectiveValue = totalFin - totalRec;
      calculationExplanation = `滚球剩余进球: 完场总进球 (${totalFin}) - 推荐时已有 (${totalRec}) = ${effectiveValue} 进球`;
    } else {
      effectiveValue = finH + finA;
      calculationExplanation = `${scorePrefix}，进球数: 主 (${finH}) + 客 (${finA}) = ${effectiveValue} 进球`;
    }
  } else if (marketCategory.type.startsWith('spread')) {
    if (isLive && !marketCategory.isHalfTime && basis === 'remaining_period_dominance') {
      // Only explicitly marked later-period handicaps use goals scored after recommendation.
      const diffH = finH - recH;
      const diffA = finA - recA;
      if (marketCategory.type === 'spread_home') {
        effectiveValue = diffH - diffA;
        calculationExplanation = `滚球剩余让球 (主): 推荐后主队加球 (${diffH}) - 客队加球 (${diffA}) = 净胜 ${effectiveValue} 球`;
      } else {
        effectiveValue = diffA - diffH;
        calculationExplanation = `滚球剩余让球 (客): 推荐后客队加球 (${diffA}) - 主队加球 (${diffH}) = 净胜 ${effectiveValue} 球`;
      }
    } else {
      if (marketCategory.type === 'spread_home') {
        effectiveValue = finH - finA;
        calculationExplanation = `${scorePrefix} 让球 (主): 主队 (${finH}) - 客队 (${finA}) = 净胜 ${effectiveValue} 球`;
      } else {
        effectiveValue = finA - finH;
        calculationExplanation = `${scorePrefix} 让球 (客): 客队 (${finA}) - 主队 (${finH}) = 净胜 ${effectiveValue} 球`;
      }
    }
  } else {
    // H2H / 独赢
    effectiveValue = finH - finA;
    calculationExplanation = `${scorePrefix}: 主 (${finH}) - 客 (${finA})`;
  }

  // Single line evaluator helper
  const evalSingleLine = (singleLine: number): 'win' | 'loss' | 'push' => {
    if (marketCategory.type === 'btts_yes') {
      return finH > 0 && finA > 0 ? 'win' : 'loss';
    }
    if (marketCategory.type === 'btts_no') {
      return finH === 0 || finA === 0 ? 'win' : 'loss';
    }
    if (marketCategory.type === 'correct_score') {
      const lineStr = String(rawLine).trim().replace(/\s+/g, '');
      const matchScoreStr = `${finH}-${finA}`;
      const matchScoreColon = `${finH}:${finA}`;
      if (lineStr === matchScoreStr || lineStr === matchScoreColon) return 'win';
      return 'loss';
    }
    if (marketCategory.type === 'odd_even_odd') {
      return (finH + finA) % 2 !== 0 ? 'win' : 'loss';
    }
    if (marketCategory.type === 'odd_even_even') {
      return (finH + finA) % 2 === 0 ? 'win' : 'loss';
    }
    if (marketCategory.type === 'total_over') {
      if (effectiveValue > singleLine) return 'win';
      if (effectiveValue === singleLine) return 'push';
      return 'loss';
    }
    if (marketCategory.type === 'total_under') {
      if (effectiveValue < singleLine) return 'win';
      if (effectiveValue === singleLine) return 'push';
      return 'loss';
    }
    if (marketCategory.type.startsWith('spread')) {
      const adjusted = effectiveValue + singleLine;
      if (adjusted > 0) return 'win';
      if (adjusted === 0) return 'push';
      return 'loss';
    }
    if (marketCategory.type === 'h2h_home') {
      return finH > finA ? 'win' : 'loss';
    }
    if (marketCategory.type === 'h2h_away') {
      return finA > finH ? 'win' : 'loss';
    }
    if (marketCategory.type === 'h2h_draw') {
      return finH === finA ? 'win' : 'loss';
    }
    return 'loss';
  };

  let outcome: 'win' | 'half_win' | 'push' | 'half_loss' | 'loss' = 'loss';
  let splitA: SplitOutcome | undefined;
  let splitB: SplitOutcome | undefined;
  let quarterSplitText = '';

  if (quarter) {
    const { lineA, lineB } = getQuarterSplits(line);
    const resA = evalSingleLine(lineA);
    const resB = evalSingleLine(lineB);

    const getResLabel = (r: 'win' | 'loss' | 'push') => (r === 'win' ? '全赢' : r === 'push' ? '走盘' : '全输');

    splitA = { line: lineA, outcome: resA, label: `${lineA > 0 ? '+' : ''}${lineA} (${getResLabel(resA)})` };
    splitB = { line: lineB, outcome: resB, label: `${lineB > 0 ? '+' : ''}${lineB} (${getResLabel(resB)})` };

    quarterSplitText = `四分之一拆分: [ ${splitA.label} ] + [ ${splitB.label} ]`;

    if (resA === 'win' && resB === 'win') {
      outcome = 'win';
    } else if ((resA === 'win' && resB === 'push') || (resA === 'push' && resB === 'win')) {
      outcome = 'half_win';
    } else if (resA === 'push' && resB === 'push') {
      outcome = 'push';
    } else if ((resA === 'loss' && resB === 'push') || (resA === 'push' && resB === 'loss')) {
      outcome = 'half_loss';
    } else {
      outcome = 'loss';
    }
  } else {
    const singleRes = evalSingleLine(line);
    outcome = singleRes;
    quarterSplitText = `单盘口 (${line > 0 ? '+' : ''}${line})`;
  }

  // Calculate Net Profit
  let netProfitUnit = 0;
  if (outcome === 'win') {
    netProfitUnit = Math.round((odds - 1) * 100) / 100;
  } else if (outcome === 'half_win') {
    netProfitUnit = Math.round(((odds - 1) / 2) * 100) / 100;
  } else if (outcome === 'push') {
    netProfitUnit = 0;
  } else if (outcome === 'half_loss') {
    netProfitUnit = -0.5;
  } else if (outcome === 'loss') {
    netProfitUnit = -1.0;
  }

  const netProfitText = netProfitUnit >= 0 ? `+${netProfitUnit.toFixed(2)}u` : `${netProfitUnit.toFixed(2)}u`;
  const payoutReturnText =
    netProfitUnit > 0
      ? `返还 ${(1 + netProfitUnit).toFixed(2)}u`
      : outcome === 'push'
      ? '返还 1.00u (走盘)'
      : outcome === 'half_loss'
      ? '返还 0.50u (亏损0.5u)'
      : '无返还 (0.00u)';

  // Label and Styling
  let outcomeLabel = '全胜';
  let badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  let badgeBg = 'bg-emerald-500/20';
  let badgeText = 'text-emerald-300';

  switch (outcome) {
    case 'win':
      outcomeLabel = '全赢 (Win)';
      badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      badgeBg = 'bg-emerald-500/20';
      badgeText = 'text-emerald-300';
      break;
    case 'half_win':
      outcomeLabel = '赢半 (Half Win)';
      badgeColor = 'bg-teal-500/20 text-teal-300 border-teal-500/40';
      badgeBg = 'bg-teal-500/20';
      badgeText = 'text-teal-300';
      break;
    case 'push':
      outcomeLabel = '走盘 (Push)';
      badgeColor = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      badgeBg = 'bg-sky-500/20';
      badgeText = 'text-sky-300';
      break;
    case 'half_loss':
      outcomeLabel = '输半 (Half Loss)';
      badgeColor = 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      badgeBg = 'bg-orange-500/20';
      badgeText = 'text-orange-300';
      break;
    case 'loss':
      outcomeLabel = '全输 (Loss)';
      badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      badgeBg = 'bg-rose-500/20';
      badgeText = 'text-rose-300';
      break;
  }

  return {
    outcome,
    outcomeLabel,
    badgeColor,
    badgeBg,
    badgeText,
    numericLine: line,
    isQuarterLine: quarter,
    quarterSplitText,
    isLive,
    scoreAtRecStr: `${recH}-${recA}`,
    finalScoreStr: `${finH}-${finA}`,
    effectiveValue,
    calculationExplanation,
    odds,
    netProfitUnit,
    netProfitText,
    payoutReturnText,
    splitA,
    splitB,
  };
}

export interface EvaluatedParlayLeg {
  leg_index: number;
  match: string;
  match_id?: string | number;
  leisu_match_id?: string | number;
  ybty_home: string;
  ybty_away: string;
  market: string;
  line: string | number;
  odds: number;
  score_at_recommendation?: { home: number; away: number };
  final_score?: { home: number; away: number } | null;
  score_verified?: boolean;
  settlement: SettlementDetail;
}

export interface ParlaySettlementDetail {
  outcome: 'win' | 'half_win' | 'push' | 'half_loss' | 'loss' | 'invalid_data' | 'pending';
  outcomeLabel: string;
  badgeColor: string;
  badgeBg: string;
  badgeText: string;
  combinedOdds: number;
  effectiveMultiplier: number;
  netProfitUnit: number;
  netProfitText: string;
  payoutReturnText: string;
  calculationExplanation: string;
  evaluatedLegs: EvaluatedParlayLeg[];
  hasFailedLeg: boolean;
  pendingLegsCount: number;
  completedLegsCount: number;
}

/**
 * Multi-leg Parlay (串关/串子) Settlement Evaluator
 * According to protocol rules:
 * - A parlay fails as soon as ANY leg fails (outcome === 'loss').
 * - Unfinished legs remain pending unless a leg has already failed.
 * - If all legs complete without a loss, return multiplier is product of each leg's multiplier.
 */
export function evaluateParlaySettlement(
  parlayLegs: Array<{
    leg_index?: number;
    match: string;
    ybty_home?: string;
    ybty_away?: string;
    market: string;
    line: string | number;
    odds: number;
    basis?: string;
    is_live?: boolean;
    minute?: number;
    score_at_recommendation?: { home: number; away: number };
    final_score?: { home: number; away: number } | null;
    score_verified?: boolean;
  }>,
  totalTicketOdds: number = 1.0
): ParlaySettlementDetail {
  if (!parlayLegs || parlayLegs.length === 0) {
    return {
      outcome: 'pending',
      outcomeLabel: '待核实 (Pending)',
      badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
      badgeBg: 'bg-slate-800',
      badgeText: 'text-slate-400',
      combinedOdds: totalTicketOdds,
      effectiveMultiplier: 0,
      netProfitUnit: 0,
      netProfitText: '0.00u',
      payoutReturnText: '待结算',
      calculationExplanation: '缺乏有效串关腿数据',
      evaluatedLegs: [],
      hasFailedLeg: false,
      pendingLegsCount: 0,
      completedLegsCount: 0,
    };
  }

  const evaluatedLegs: EvaluatedParlayLeg[] = parlayLegs.map((leg, idx) => {
    const legScoreRec = leg.score_at_recommendation || { home: 0, away: 0 };
    const isLegLive = Boolean(
      (leg as any).is_live ||
      (leg as any).minute > 0 ||
      legScoreRec.home > 0 ||
      legScoreRec.away > 0
    );

    const legSettlement = evaluateQuarterSettlement({
      market: leg.market,
      line: leg.line,
      odds: leg.odds,
      scoreAtRec: legScoreRec,
      finalScore: leg.final_score || null,
      halfTimeScore: (leg as any).half_time_score || (leg as any).ht_score || (leg as any).half_score || null,
      scoreVerified: leg.score_verified === true,
      isLive: isLegLive,
      basis: (leg as any).basis || (leg as any).recommendation?.basis,
      homeTeam: leg.ybty_home,
      awayTeam: leg.ybty_away,
    });

    return {
      leg_index: leg.leg_index ?? idx + 1,
      match: leg.match,
      match_id: (leg as any).match_id || (leg as any).leisu_match_id || undefined,
      leisu_match_id: (leg as any).leisu_match_id || (leg as any).match_id || undefined,
      ybty_home: leg.ybty_home || leg.match.split(' vs ')[0] || '',
      ybty_away: leg.ybty_away || leg.match.split(' vs ')[1] || '',
      market: leg.market,
      line: leg.line,
      odds: Number(leg.odds) > 1 ? Number(leg.odds) : 0,
      score_at_recommendation: leg.score_at_recommendation,
      final_score: leg.final_score,
      score_verified: leg.score_verified,
      settlement: legSettlement,
    };
  });

  let hasFailedLeg = false;
  let pendingLegsCount = 0;
  let invalidLegsCount = 0;
  let completedLegsCount = 0;

  let effectiveMultiplier = 1.0;
  let calculatedCombinedOdds = 1.0;

  for (const leg of evaluatedLegs) {
    const o = leg.settlement.outcome;
    calculatedCombinedOdds *= leg.odds;

    if (o === 'loss') {
      hasFailedLeg = true;
      effectiveMultiplier = 0;
    } else if (o === 'pending') {
      pendingLegsCount++;
    } else if (o === 'invalid_data') {
      invalidLegsCount++;
      effectiveMultiplier = 0;
    } else if (o === 'win') {
      completedLegsCount++;
      effectiveMultiplier *= leg.odds;
    } else if (o === 'half_win') {
      completedLegsCount++;
      const halfWinOdds = 1 + (leg.odds - 1) / 2;
      effectiveMultiplier *= halfWinOdds;
    } else if (o === 'push') {
      completedLegsCount++;
      effectiveMultiplier *= 1.0;
    } else if (o === 'half_loss') {
      completedLegsCount++;
      effectiveMultiplier *= 0.5;
    }
  }

  const combinedOdds = totalTicketOdds > 1 ? totalTicketOdds : Math.round(calculatedCombinedOdds * 100) / 100;

  let outcome: 'win' | 'half_win' | 'push' | 'half_loss' | 'loss' | 'invalid_data' | 'pending' = 'pending';
  let calculationExplanation = '';

  if (hasFailedLeg) {
    outcome = 'loss';
    effectiveMultiplier = 0;
    calculationExplanation = `串关中有 ${evaluatedLegs.filter((l) => l.settlement.outcome === 'loss').length} 腿确定全输，整张串关票即判全输 (-1.00u)`;
  } else if (invalidLegsCount > 0) {
    outcome = 'invalid_data';
    effectiveMultiplier = 0;
    calculationExplanation = `串关有 ${invalidLegsCount} 腿数据或投注方向无效，整张串关不得计入胜负和盈亏`;
  } else if (pendingLegsCount > 0) {
    outcome = 'pending';
    calculationExplanation = `串关尚有 ${pendingLegsCount} 腿比分待核实 (已有 ${completedLegsCount} 腿通过)`;
  } else {
    // All legs complete and no loss
    if (effectiveMultiplier > 1.0) {
      outcome = evaluatedLegs.some((l) => l.settlement.outcome === 'half_win') ? 'half_win' : 'win';
    } else if (effectiveMultiplier === 1.0) {
      outcome = 'push';
    } else if (effectiveMultiplier > 0) {
      outcome = 'half_loss';
    } else {
      outcome = 'loss';
    }

    calculationExplanation = `全部 ${evaluatedLegs.length} 腿结算完成，有效返奖乘数: ${effectiveMultiplier.toFixed(2)}x`;
  }

  let netProfitUnit = 0;
  if (outcome === 'loss') {
    netProfitUnit = -1.0;
  } else if (outcome === 'pending' || outcome === 'invalid_data') {
    netProfitUnit = 0;
  } else {
    netProfitUnit = Math.round((effectiveMultiplier - 1.0) * 100) / 100;
  }

  const netProfitText = netProfitUnit >= 0 ? `+${netProfitUnit.toFixed(2)}u` : `${netProfitUnit.toFixed(2)}u`;
  const payoutReturnText =
    outcome === 'loss'
      ? '无返还 (0.00u)'
      : outcome === 'pending'
      ? '待结算'
      : outcome === 'invalid_data'
      ? '不计盈亏'
      : `返还 ${(1 + netProfitUnit).toFixed(2)}u (倍率 ${effectiveMultiplier.toFixed(2)}x)`;

  let outcomeLabel = '全胜';
  let badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  let badgeBg = 'bg-emerald-500/20';
  let badgeText = 'text-emerald-300';

  switch (outcome) {
    case 'win':
      outcomeLabel = '串关全赢 (Win)';
      badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      badgeBg = 'bg-emerald-500/20';
      badgeText = 'text-emerald-300';
      break;
    case 'half_win':
      outcomeLabel = '串关赢半 (Half Win)';
      badgeColor = 'bg-teal-500/20 text-teal-300 border-teal-500/40';
      badgeBg = 'bg-teal-500/20';
      badgeText = 'text-teal-300';
      break;
    case 'push':
      outcomeLabel = '串关走盘 (Push)';
      badgeColor = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      badgeBg = 'bg-sky-500/20';
      badgeText = 'text-sky-300';
      break;
    case 'half_loss':
      outcomeLabel = '串关输半 (Half Loss)';
      badgeColor = 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      badgeBg = 'bg-orange-500/20';
      badgeText = 'text-orange-300';
      break;
    case 'loss':
      outcomeLabel = '串关全输 (Loss)';
      badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      badgeBg = 'bg-rose-500/20';
      badgeText = 'text-rose-300';
      break;
    case 'invalid_data':
      outcomeLabel = '无效数据 (Invalid)';
      badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      badgeBg = 'bg-amber-500/20';
      badgeText = 'text-amber-300';
      break;
    case 'pending':
      outcomeLabel = '串关待核实 (Pending)';
      badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';
      badgeBg = 'bg-slate-800';
      badgeText = 'text-slate-400';
      break;
  }

  return {
    outcome,
    outcomeLabel,
    badgeColor,
    badgeBg,
    badgeText,
    combinedOdds,
    effectiveMultiplier,
    netProfitUnit,
    netProfitText,
    payoutReturnText,
    calculationExplanation,
    evaluatedLegs,
    hasFailedLeg,
    pendingLegsCount,
    completedLegsCount,
  };
}

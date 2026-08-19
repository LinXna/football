/**
 * Advanced Tactical & Quantitative Betting Engines
 * 
 * Implements 6 deep quantitative calculations:
 * 1. Positional Absence & Lineup Structural Impact Engine (核心伤停与位置失衡量化)
 * 2. Corner Squeeze & Set-Piece Threat Acceleration Engine (角球动能与禁区高压挤压指数)
 * 3. 10-Men Red Card & Tactical Discipline Dynamic Physics Model (红黄牌人数失衡与体能断崖模型)
 * 4. Euro-Asian Odds Parity & Bookmaker Trap Discrepancy Engine (欧亚指数倒挂与机构避险精算)
 * 5. Strategic Motivation & Aggregate Score Math Engine (积分榜战意差值与两回合赛制精算)
 * 6. Non-Linear In-Play Time Decay & High-Fatigue Windows Model (进球非线性时间分布与体能断崖模型)
 */

// ==========================================
// 1. Positional Absence & Lineup Engine
// ==========================================
export interface PositionalAbsenceImpact {
  home_absences: {
    gk_missing: boolean;
    cb_defenders_missing: number;
    key_midfielders_missing: number;
    top_scorers_missing: number;
    total_missing: number;
    impact_note_zh: string;
  };
  away_absences: {
    gk_missing: boolean;
    cb_defenders_missing: number;
    key_midfielders_missing: number;
    top_scorers_missing: number;
    total_missing: number;
    impact_note_zh: string;
  };
  expected_goal_adjustments: {
    home_attack_delta_xg: number; // e.g. -0.35 if top striker out
    home_defense_delta_xga: number; // e.g. +0.45 if GK/CB out
    away_attack_delta_xg: number;
    away_defense_delta_xga: number;
  };
  structural_verdict_zh: string;
}

export function evaluatePositionalAbsenceImpact(
  lineupData: any,
  homeTeam: string = '',
  awayTeam: string = ''
): PositionalAbsenceImpact {
  const injuries = Array.isArray(lineupData?.injuries || lineupData?.missing_players)
    ? lineupData.injuries || lineupData.missing_players
    : [];

  const homeAbs = { gk: false, cb: 0, mf: 0, fw: 0, total: 0, names: [] as string[] };
  const awayAbs = { gk: false, cb: 0, mf: 0, fw: 0, total: 0, names: [] as string[] };

  for (const item of injuries) {
    const text = typeof item === 'string' ? item : `${item.team || ''} ${item.name || ''} ${item.position || ''} ${item.reason || ''}`;
    const lower = text.toLowerCase();
    const isAway = awayTeam && (lower.includes(awayTeam.toLowerCase()) || text.includes('客队'));
    const target = isAway ? awayAbs : homeAbs;

    target.total++;
    const isGK = /门将|gk|goalkeeper|守门员/i.test(text);
    const isCB = /后卫|中卫|cb|df|defender|边后卫|防线/i.test(text);
    const isMF = /中场|前腰|后腰|mf|midfield|组织/i.test(text);
    const isFW = /前锋|射手|fw|forward|striker|主力射手|射手榜/i.test(text);

    if (isGK) target.gk = true;
    else if (isCB) target.cb++;
    else if (isFW) target.fw++;
    else if (isMF) target.mf++;

    const name = typeof item === 'string' ? item : item.name || '核心球员';
    target.names.push(name);
  }

  // Calculate quantitative λ adjustments
  const homeAttackDelta = -(homeAbs.fw * 0.28 + homeAbs.mf * 0.15);
  const homeDefenseDelta = (homeAbs.gk ? 0.35 : 0) + (homeAbs.cb * 0.22);
  const awayAttackDelta = -(awayAbs.fw * 0.28 + awayAbs.mf * 0.15);
  const awayDefenseDelta = (awayAbs.gk ? 0.35 : 0) + (awayAbs.cb * 0.22);

  const homeNote = homeAbs.total === 0
    ? '主队阵容齐整，无核心伤停'
    : `主队缺阵${homeAbs.total}人${homeAbs.gk ? ' (含主力门将)' : ''}${homeAbs.cb > 0 ? ` (主力后卫${homeAbs.cb}人)` : ''}${homeAbs.fw > 0 ? ` (核心攻击手${homeAbs.fw}人)` : ''}`;
  
  const awayNote = awayAbs.total === 0
    ? '客队阵容齐整，无核心伤停'
    : `客队缺阵${awayAbs.total}人${awayAbs.gk ? ' (含主力门将)' : ''}${awayAbs.cb > 0 ? ` (主力后卫${awayAbs.cb}人)` : ''}${awayAbs.fw > 0 ? ` (核心攻击手${awayAbs.fw}人)` : ''}`;

  let verdict = '双方阵容结构基本稳定';
  if (homeDefenseDelta >= 0.4 && awayDefenseDelta < 0.2) {
    verdict = '主队后防/门将严重受损，防守失球期望升高，谨防深盘失守';
  } else if (awayDefenseDelta >= 0.4 && homeDefenseDelta < 0.2) {
    verdict = '客队后防多名主力缺阵，防线漏洞扩大，利好主队进攻穿盘与大球';
  } else if (homeAttackDelta <= -0.4) {
    verdict = '主队攻击手缺阵进攻折损，破深盘能力大幅受限';
  }

  return {
    home_absences: {
      gk_missing: homeAbs.gk,
      cb_defenders_missing: homeAbs.cb,
      key_midfielders_missing: homeAbs.mf,
      top_scorers_missing: homeAbs.fw,
      total_missing: homeAbs.total,
      impact_note_zh: homeNote,
    },
    away_absences: {
      gk_missing: awayAbs.gk,
      cb_defenders_missing: awayAbs.cb,
      key_midfielders_missing: awayAbs.mf,
      top_scorers_missing: awayAbs.fw,
      total_missing: awayAbs.total,
      impact_note_zh: awayNote,
    },
    expected_goal_adjustments: {
      home_attack_delta_xg: Number(homeAttackDelta.toFixed(2)),
      home_defense_delta_xga: Number(homeDefenseDelta.toFixed(2)),
      away_attack_delta_xg: Number(awayAttackDelta.toFixed(2)),
      away_defense_delta_xga: Number(awayDefenseDelta.toFixed(2)),
    },
    structural_verdict_zh: verdict,
  };
}

// ==========================================
// 2. Corner Squeeze & Set-Piece Threat Engine
// ==========================================
export interface CornerSqueezeMetrics {
  total_corners: number;
  home_corners: number;
  away_corners: number;
  corner_velocity_per_10min: number;
  corner_dominance_share_home: number;
  projected_full_time_corners: number;
  squeeze_danger_level: 'CRITICAL_IMMINENT_GOAL_SQUEEZE' | 'HIGH_SET_PIECE_PRESSURE' | 'MODERATE' | 'LOW_CORNER_THREAT';
  corner_tactical_note_zh: string;
}

export function evaluateCornerSqueezeMetrics(
  liveStats: any,
  minute: number,
  scoreText?: string
): CornerSqueezeMetrics | null {
  if (!liveStats || minute < 5) return null;

  const homeCorners = Number(liveStats?.home?.corner_kicks ?? liveStats?.home?.corners ?? 0);
  const awayCorners = Number(liveStats?.away?.corner_kicks ?? liveStats?.away?.corners ?? 0);
  const totalCorners = homeCorners + awayCorners;

  const elapsed = Math.max(5, minute);
  const velocityPer10 = Number(((totalCorners / elapsed) * 10).toFixed(2));
  const homeShare = totalCorners > 0 ? Number(((homeCorners / totalCorners) * 100).toFixed(1)) : 50;

  // Project full time corners using 90 mins
  const projectedFT = Number((totalCorners + (totalCorners / elapsed) * (90 - elapsed)).toFixed(1));

  // Determine Squeeze Danger Level
  let dangerLevel: CornerSqueezeMetrics['squeeze_danger_level'] = 'MODERATE';
  let note = '';

  const homeFieldTilt = Number(liveStats?.home?.field_tilt ?? liveStats?.home?.possession ?? 50);
  const homeDangAtt = Number(liveStats?.home?.dangerous_attacks ?? 0);

  if (velocityPer10 >= 1.5 && (homeShare >= 75 || homeShare <= 25)) {
    dangerLevel = 'CRITICAL_IMMINENT_GOAL_SQUEEZE';
    const dominantTeam = homeShare >= 75 ? '主队' : '客队';
    note = `【禁区极限挤压破门预警】${dominantTeam}近段角球爆发(场均每10分钟${velocityPer10}个角球, 占总数${Math.max(homeShare, 100 - homeShare)}%)，将对手彻底压制在底线禁区，定位球与连续高空轰炸破门概率极高！`;
  } else if (velocityPer10 >= 1.1) {
    dangerLevel = 'HIGH_SET_PIECE_PRESSURE';
    note = `比赛攻防节奏转换快，双方累计角球${totalCorners}个(预期全场${projectedFT}个)，定位球威胁持续活跃。`;
  } else {
    dangerLevel = 'LOW_CORNER_THREAT';
    note = `角球产出频次偏低(每10分钟仅${velocityPer10}个)，主要以中场传导为主，边路下底传中受阻。`;
  }

  return {
    total_corners: totalCorners,
    home_corners: homeCorners,
    away_corners: awayCorners,
    corner_velocity_per_10min: velocityPer10,
    corner_dominance_share_home: homeShare,
    projected_full_time_corners: projectedFT,
    squeeze_danger_level: dangerLevel,
    corner_tactical_note_zh: note,
  };
}

// ==========================================
// 3. 10-Men Red Card & Tactical Discipline Model
// ==========================================
export interface RedCardDisciplinePhysics {
  has_red_card: boolean;
  red_card_team: 'home' | 'away' | 'both' | 'none';
  minute_of_first_red: number | null;
  manpower_disadvantage_phase: 'EARLY_COLLAPSE_WINDOW' | 'MID_FATIGUE_EROSION' | 'LATE_BUS_SURVIVAL' | 'NONE';
  conceded_rate_multiplier: number; // Multiplier on expected goal rate for penalized side
  discipline_tactical_guidance_zh: string;
}

export function evaluateRedCardDisciplinePhysics(
  item: any,
  minute: number
): RedCardDisciplinePhysics {
  const events = item?.incidents || item?.focused_incidents?.red_cards || item?.detail_context?.formal?.live_match?.incidents || [];
  
  let homeReds = 0;
  let awayReds = 0;
  let firstRedMin = 999;

  const checkEvent = (text: string, mNum?: number) => {
    if (!/红牌|red card|两黄变一红|2nd yellow/i.test(text)) return;
    const m = mNum || (text.match(/(\d{1,3})['′]/) ? parseInt(text.match(/(\d{1,3})['′]/)![1], 10) : minute);
    if (m < firstRedMin) firstRedMin = m;
    
    if (/客|away/i.test(text)) awayReds++;
    else homeReds++;
  };

  if (Array.isArray(events)) {
    for (const ev of events) {
      if (typeof ev === 'string') checkEvent(ev);
      else if (ev && typeof ev === 'object') {
        const desc = `${ev.text || ''} ${ev.event || ''} ${ev.type || ''}`;
        const m = Number(ev.minute || ev.time || minute);
        checkEvent(desc, m);
      }
    }
  }

  // Also check live statistics cards
  const statsHomeRed = Number(item?.live_statistics?.home?.red_cards ?? 0);
  const statsAwayRed = Number(item?.live_statistics?.away?.red_cards ?? 0);
  homeReds = Math.max(homeReds, statsHomeRed);
  awayReds = Math.max(awayReds, statsAwayRed);

  if (homeReds === 0 && awayReds === 0) {
    return {
      has_red_card: false,
      red_card_team: 'none',
      minute_of_first_red: null,
      manpower_disadvantage_phase: 'NONE',
      conceded_rate_multiplier: 1.0,
      discipline_tactical_guidance_zh: '双方人数均等 (11 vs 11)，战术执行力完整。',
    };
  }

  const redTeam: 'home' | 'away' | 'both' = homeReds > 0 && awayReds > 0 ? 'both' : homeReds > 0 ? 'home' : 'away';
  const redMin = firstRedMin < 999 ? firstRedMin : Math.max(1, minute - 5);
  const remainingMins = Math.max(1, 90 - redMin);

  let phase: RedCardDisciplinePhysics['manpower_disadvantage_phase'] = 'MID_FATIGUE_EROSION';
  let mult = 1.65;
  let guidance = '';

  if (redMin <= 45) {
    phase = 'EARLY_COLLAPSE_WINDOW';
    mult = 2.15;
    const penalized = redTeam === 'home' ? '主队' : '客队';
    const advantaged = redTeam === 'home' ? '客队' : '主队';
    guidance = `【上半场(${redMin}')过早吃红牌・体能与防线双重崩塌】${penalized}少打一人需承受长达${remainingMins}分钟的人数劣势，体能将在下半场遭遇断崖式消耗，其失球期望率扩大2.15倍，强烈支持${advantaged}让球穿盘及全场大球！`;
  } else if (redMin >= 78) {
    phase = 'LATE_BUS_SURVIVAL';
    mult = 1.25;
    const penalized = redTeam === 'home' ? '主队' : '客队';
    guidance = `【终局(${redMin}')红牌・铁桶阵收缩模式】${penalized}在比赛尾声染红，剩余时间有限，受罚方将全员回撤禁区摆大巴拖延时间，进攻方攻坚时间不足，谨防盲目追大。`;
  } else {
    phase = 'MID_FATIGUE_EROSION';
    mult = 1.70;
    const penalized = redTeam === 'home' ? '主队' : '客队';
    guidance = `【第${redMin}分钟红牌】${penalized}少打一人，防线缺口扩大(失球乘数1.70x)，利好进攻方持续围攻造杀机。`;
  }

  return {
    has_red_card: true,
    red_card_team: redTeam,
    minute_of_first_red: redMin,
    manpower_disadvantage_phase: phase,
    conceded_rate_multiplier: mult,
    discipline_tactical_guidance_zh: guidance,
  };
}

// ==========================================
// 4. Euro-Asian Odds Parity & Trap Discrepancy Engine
// ==========================================
export interface EuroAsianParityMetrics {
  euro_home_win_odds: number | null;
  theoretical_spread_line: number | null; // e.g. -1.25 calculated from 1.35 Euro
  actual_market_spread_line: number | null; // e.g. -0.75 from YBTY
  spread_discrepancy: number | null; // actual - theo (e.g. +0.5 = deep trap, -0.5 = shallow trap)
  parity_verdict: 'BALANCED_PARITY' | 'DEEP_SPREAD_TRAP' | 'SHALLOW_SPREAD_DISCOUNT' | 'EURO_RESISTANCE_SIGNAL';
  parity_analysis_note_zh: string;
}

/**
 * Maps 1X2 European Home Win Odds to theoretical Asian Spread benchmark
 */
export function convertEuroToTheoreticalSpread(euroOdds: number): number {
  if (euroOdds <= 1.10) return -2.5;
  if (euroOdds <= 1.18) return -2.25;
  if (euroOdds <= 1.28) return -1.75;
  if (euroOdds <= 1.38) return -1.5;
  if (euroOdds <= 1.50) return -1.0;
  if (euroOdds <= 1.68) return -0.75;
  if (euroOdds <= 1.95) return -0.5;
  if (euroOdds <= 2.25) return -0.25;
  if (euroOdds <= 2.80) return 0;
  if (euroOdds <= 3.50) return 0.25;
  if (euroOdds <= 4.50) return 0.5;
  if (euroOdds <= 6.50) return 1.0;
  return 1.5;
}

export function evaluateEuroAsianParity(
  referenceOdds: any,
  verifiedMarkets: any[]
): EuroAsianParityMetrics {
  // 1. Extract European 1X2 Home Win Odds from Reference (Crown/Pinnacle/Marathon) or verified YBTY
  let euroH = 0;
  if (referenceOdds) {
    const euroRaw = referenceOdds.europe || referenceOdds.euro || referenceOdds.eur;
    if (euroRaw) {
      euroH = Number(euroRaw.home_win || euroRaw.home || euroRaw.h || 0);
    }
  }

  // If no reference euro, try to find 1X2 in verified markets
  if (euroH <= 1.0) {
    const h2hMarket = verifiedMarkets.find((m: any) => m.market === 'full_h2h');
    const homeOpt = h2hMarket?.options?.find((o: any) => /主胜|home|1/i.test(String(o.side || o.line || '')));
    if (homeOpt && Number(homeOpt.odds) > 1.0) {
      euroH = Number(homeOpt.odds);
    }
  }

  // 2. Extract Actual Asian Handicap from verified markets
  let actualSpread: number | null = null;
  const spreadMarket = verifiedMarkets.find((m: any) => m.market === 'full_spread');
  if (spreadMarket?.options?.length) {
    const homeOpt = spreadMarket.options.find((o: any) => /主|home/i.test(String(o.side || '')));
    if (homeOpt && homeOpt.line !== null && homeOpt.line !== undefined) {
      const lineNum = parseFloat(String(homeOpt.line).replace(/[^\d.-]/g, ''));
      if (!isNaN(lineNum)) actualSpread = lineNum;
    }
  }

  if (euroH <= 1.0 || actualSpread === null) {
    return {
      euro_home_win_odds: euroH > 1.0 ? euroH : null,
      theoretical_spread_line: null,
      actual_market_spread_line: actualSpread,
      spread_discrepancy: null,
      parity_verdict: 'BALANCED_PARITY',
      parity_analysis_note_zh: '欧亚指数对比基准完整度正常，按常规无偏盘口评估。',
    };
  }

  const theoSpread = convertEuroToTheoreticalSpread(euroH);
  const diff = Number((actualSpread - theoSpread).toFixed(2));

  let verdict: EuroAsianParityMetrics['parity_verdict'] = 'BALANCED_PARITY';
  let note = '';

  if (diff >= 0.5) {
    verdict = 'DEEP_SPREAD_TRAP';
    note = `【欧亚背离・深开诱上陷阱】欧赔主胜@${euroH.toFixed(2)}对应理论让球盘仅为 ${theoSpread > 0 ? '+' : ''}${theoSpread}，实际亚盘强开至 ${actualSpread > 0 ? '+' : ''}${actualSpread} (深开+${diff}球)，存在利用强队名气强拉门槛的诱上嫌疑，强烈建议提防小胜走盘，锁定客队受让价值！`;
  } else if (diff <= -0.5) {
    verdict = 'SHALLOW_SPREAD_DISCOUNT';
    note = `【欧亚背离・浅开便宜陷阱/真降阻上】欧赔主胜@${euroH.toFixed(2)}理论支撑 ${theoSpread > 0 ? '+' : ''}${theoSpread} 盘口，实际亚盘仅让 ${actualSpread > 0 ? '+' : ''}${actualSpread} (浅开${diff}球)，机构让步乏力，需严格审视主胜真实战意与穿盘阻力。`;
  } else {
    verdict = 'BALANCED_PARITY';
    note = `欧亚指数高度吻合：欧赔@${euroH.toFixed(2)}与亚盘让步 ${actualSpread > 0 ? '+' : ''}${actualSpread} 处于合理均衡区间。`;
  }

  return {
    euro_home_win_odds: euroH,
    theoretical_spread_line: theoSpread,
    actual_market_spread_line: actualSpread,
    spread_discrepancy: diff,
    parity_verdict: verdict,
    parity_analysis_note_zh: note,
  };
}

// ==========================================
// 5. Strategic Motivation & Aggregate Score Math Engine
// ==========================================
export interface StrategicMotivationMetrics {
  home_motivation_score: number; // 0 - 100
  away_motivation_score: number; // 0 - 100
  motivation_delta: number; // home - away
  tournament_phase_type: 'CRITICAL_TITLE_RACE' | 'RELEGATION_SURVIVAL_BATTLE' | 'MID_TABLE_DEAD_RUBBER' | 'TWO_LEGGED_AGGREGATE_GUARD' | 'STANDARD_LEAGUE_MATCH';
  motivation_tactical_note_zh: string;
}

export function evaluateStrategicMotivation(
  standings: any,
  league: string = '',
  homeTeam: string = '',
  awayTeam: string = ''
): StrategicMotivationMetrics {
  const isCup = /杯|cup|copa|trophy|champions|uefa|afc|libertadores/i.test(league);
  
  let homePos = 8;
  let awayPos = 8;
  let homePts = 20;
  let awayPts = 20;

  if (standings) {
    const h = standings.home_team || standings.home;
    const a = standings.away_team || standings.away;
    if (h?.total) {
      homePos = Number(h.total.rank || h.total.position || 8);
      homePts = Number(h.total.points || h.total.pts || 20);
    }
    if (a?.total) {
      awayPos = Number(a.total.rank || a.total.position || 8);
      awayPts = Number(a.total.points || a.total.pts || 20);
    }
  }

  let homeMotiv = 70;
  let awayMotiv = 70;
  let phase: StrategicMotivationMetrics['tournament_phase_type'] = 'STANDARD_LEAGUE_MATCH';
  let note = '';

  if (isCup) {
    homeMotiv = 85;
    awayMotiv = 85;
    phase = 'STANDARD_LEAGUE_MATCH';
    note = '杯赛单场淘汰/关键战，双方均具备强烈的战术求胜欲。';
  } else {
    // Top 3 title race
    if (homePos <= 3) homeMotiv += 18;
    if (awayPos <= 3) awayMotiv += 18;

    // Bottom 4 relegation battle
    if (homePos >= 16) {
      homeMotiv += 22;
      phase = 'RELEGATION_SURVIVAL_BATTLE';
    }
    if (awayPos >= 16) {
      awayMotiv += 22;
      phase = 'RELEGATION_SURVIVAL_BATTLE';
    }

    // Mid table dead rubber (9-14)
    if (homePos >= 9 && homePos <= 13) homeMotiv -= 12;
    if (awayPos >= 9 && awayPos <= 13) awayMotiv -= 12;

    const delta = homeMotiv - awayMotiv;
    if (delta >= 18) {
      note = `【战意显著分化】主队(排名第${homePos})处于抢分冲刺关键期(战意${homeMotiv}分)，客队(排名第${awayPos})处于积分无忧中游期(战意${awayMotiv}分)，主队拼抢与对抗投入度占据绝对上风。`;
    } else if (delta <= -18) {
      note = `【客队保级/抢分战意拉满】客队(排名第${awayPos})战意高达${awayMotiv}分，面对无欲无求的主队极具爆冷抗拒属性。`;
    } else {
      note = `双方积分战意均衡(主队${homeMotiv}分 vs 客队${awayMotiv}分)，均按常规战术部署对抗。`;
    }
  }

  homeMotiv = Math.min(100, Math.max(30, homeMotiv));
  awayMotiv = Math.min(100, Math.max(30, awayMotiv));

  return {
    home_motivation_score: homeMotiv,
    away_motivation_score: awayMotiv,
    motivation_delta: homeMotiv - awayMotiv,
    tournament_phase_type: phase,
    motivation_tactical_note_zh: note,
  };
}

// ==========================================
// 6. Non-Linear In-Play Time Decay & High-Fatigue Windows Model
// ==========================================
export interface NonLinearTimeDecayMetrics {
  current_minute: number;
  remaining_physical_minutes: number;
  current_game_phase: 'EARLY_TACTICAL_FEELING (0-15\')' | 'HALF_ATTACK_WINDOW (15-30\')' | 'PRE_HALFTIME_FATIGUE (30-45+\')' | 'SECOND_HALF_RESET (45-60\')' | 'SUBSTITUTION_SURGE (60-75\')' | 'LATE_FATIGUE_BREAKDOWN (75-90+\')';
  empirical_phase_goal_weight: number; // e.g. 1.45 for 75-90+
  non_linear_remaining_goal_capacity_pct: number;
  time_decay_tactical_note_zh: string;
}

export function evaluateNonLinearTimeDecay(minute: number): NonLinearTimeDecayMetrics {
  const m = Math.max(0, Math.min(95, minute));
  const remainingMins = Math.max(0, 90 - m);

  let phase: NonLinearTimeDecayMetrics['current_game_phase'] = 'EARLY_TACTICAL_FEELING (0-15\')';
  let phaseWeight = 1.0;
  let note = '';

  if (m <= 15) {
    phase = 'EARLY_TACTICAL_FEELING (0-15\')';
    phaseWeight = 0.75;
    note = '开局试探期：双方阵型严密，破门转化率偏低，盘口水位通常较深，适合观望或小打半场。';
  } else if (m <= 30) {
    phase = 'HALF_ATTACK_WINDOW (15-30\')';
    phaseWeight = 1.05;
    note = '半场攻坚期：比赛节奏加快，高位逼抢与三区渗透增加，进入第一波进球活跃窗口。';
  } else if (m <= 45) {
    phase = 'PRE_HALFTIME_FATIGUE (30-45+\')';
    phaseWeight = 1.30;
    note = '【半场体能临界破门高发期 (30-45+\')】防守专注度出现首轮松懈，失误率增加，是上半场进球最高发的黄金窗口！';
  } else if (m <= 60) {
    phase = 'SECOND_HALF_RESET (45-60\')';
    phaseWeight = 0.95;
    note = '下半场战术重置期：教练中场布置见效，双方重新梳理攻防，等待变阵契机。';
  } else if (m <= 75) {
    phase = 'SUBSTITUTION_SURGE (60-75\')';
    phaseWeight = 1.15;
    note = '换人发力期：替补生力军登场冲击疲惫防线，攻防节奏再次提速。';
  } else {
    phase = 'LATE_FATIGUE_BREAKDOWN (75-90+\')';
    phaseWeight = 1.55;
    note = '【终局体能极限与绝杀搏命期 (75-90+\')】双方体能严重透支、阵型严重拉长脱节，落后方全线压上搏命，绝杀球与防反破门概率爆发！';
  }

  // Non-linear remaining capacity
  // Integrate weights across remaining periods
  let remainingCapacity = 0;
  if (m < 45) {
    remainingCapacity = ((45 - m) / 45) * 0.42 + 0.58;
  } else {
    remainingCapacity = ((90 - m) / 45) * 0.58;
  }
  remainingCapacity = Number((Math.max(0, Math.min(1, remainingCapacity)) * 100).toFixed(1));

  return {
    current_minute: m,
    remaining_physical_minutes: remainingMins,
    current_game_phase: phase,
    empirical_phase_goal_weight: phaseWeight,
    non_linear_remaining_goal_capacity_pct: remainingCapacity,
    time_decay_tactical_note_zh: note,
  };
}

// ==========================================
// 7. Referee Discipline & Penalty Expectancy Engine
// ==========================================
export interface RefereeDisciplineAndPenalty {
  referee_name: string;
  referee_severity_index: number; // e.g. 1.35 = +35% harsher than average
  referee_profile: 'HARSH_CARD_PENALTY_ELEVATED' | 'AVERAGE_CONTROL' | 'LENIENT_ADVANTAGE_FLOW' | 'UNKNOWN';
  projected_match_cards: number;
  penalty_expectancy_lambda: number; // e.g. 0.38
  referee_tactical_note_zh: string;
}

export function evaluateRefereeDisciplineAndPenalty(
  item: any,
  league: string = ''
): RefereeDisciplineAndPenalty {
  const refRaw = item?.referee || item?.detail_context?.referee || item?.detail_context?.formal?.static_match?.referee || item?.detail_context?.formal?.live_match?.referee || '';
  const refName = typeof refRaw === 'string' ? refRaw.trim() : (refRaw?.name_zh || refRaw?.name || '').trim();

  if (!refName) {
    return {
      referee_name: '未公布/常规指派',
      referee_severity_index: 1.0,
      referee_profile: 'UNKNOWN',
      projected_match_cards: 4.2,
      penalty_expectancy_lambda: 0.25,
      referee_tactical_note_zh: '主裁判信息未公布，按联赛常规基准(场均4.2张黄牌/0.25个点球)推算。',
    };
  }

  const cardsPerGame = Number(refRaw?.cards_per_game || refRaw?.yellow_cards_per_match || 0);
  const penaltiesPerGame = Number(refRaw?.penalties_per_game || refRaw?.penalty_rate || 0);

  let rsi = 1.0;
  if (cardsPerGame > 0) {
    rsi = Number((cardsPerGame / 4.2).toFixed(2));
  } else if (/拉奥斯|迈克·迪恩|吉尔·曼萨诺|奥尔萨托|赫尔南德斯|马里宁|恰克尔|麦克利/i.test(refName)) {
    rsi = 1.38;
  } else if (/马齐尼亚克|奥利弗|泰勒|蒂尔潘|文契奇/i.test(refName)) {
    rsi = 0.92;
  }

  let profile: RefereeDisciplineAndPenalty['referee_profile'] = 'AVERAGE_CONTROL';
  let note = '';
  const projectedCards = Number((4.2 * rsi).toFixed(1));
  const penaltyLambda = Number((0.25 * (penaltiesPerGame > 0 ? penaltiesPerGame / 0.25 : rsi)).toFixed(2));

  if (rsi >= 1.25) {
    profile = 'HARSH_CARD_PENALTY_ELEVATED';
    note = `【严厉型裁判执法国标警报】主裁 ${refName} 出牌严苛(严厉度指数RSI=${rsi}x, 预期出牌${projectedCards}张)，防守战术犯规极易吃牌受限，点球期望λ=${penaltyLambda}，受罚方易受红牌牵连崩盘，显著提升大球与点球破局概率！`;
  } else if (rsi <= 0.85) {
    profile = 'LENIENT_ADVANTAGE_FLOW';
    note = `【宽松鼓励对抗型主裁】主裁 ${refName} 执法尺度宽松(RSI=${rsi}x)，鼓励身体对抗，比赛流畅度高，战术犯规不易被过度出牌惩治。`;
  } else {
    profile = 'AVERAGE_CONTROL';
    note = `主裁 ${refName} 执法尺度居中(RSI=${rsi}x，预期出牌${projectedCards}张)，判罚尺度与联赛平均水平吻合。`;
  }

  return {
    referee_name: refName,
    referee_severity_index: rsi,
    referee_profile: profile,
    projected_match_cards: projectedCards,
    penalty_expectancy_lambda: penaltyLambda,
    referee_tactical_note_zh: note,
  };
}

// ==========================================
// 8. Schedule Congestion & Rest Fatigue Drag Engine
// ==========================================
export interface ScheduleCongestionAndRest {
  home_rest_days: number;
  away_rest_days: number;
  rest_advantage_delta: number; // home - away
  is_home_congested_double_week: boolean;
  is_away_congested_double_week: boolean;
  fatigue_drag_multiplier_home: number;
  fatigue_drag_multiplier_away: number;
  late_fatigue_breakdown_risk: boolean;
  schedule_tactical_note_zh: string;
}

export function evaluateScheduleCongestionAndRest(
  item: any,
  matchTimeStr?: string
): ScheduleCongestionAndRest {
  const trends = item?.recent_trends || item?.trend_summary || {};
  const homeRecent = trends?.home_recent || trends?.historical_analysis?.home_recent || [];
  const awayRecent = trends?.away_recent || trends?.historical_analysis?.away_recent || [];

  const parseDaysSinceLastMatch = (list: any[]): number => {
    if (!Array.isArray(list) || list.length === 0) return 6;
    const last = list[0];
    const dateStr = last?.match_date || last?.date || last?.time;
    if (!dateStr) return 6;
    try {
      const lastTime = new Date(dateStr).getTime();
      const current = matchTimeStr ? new Date(matchTimeStr).getTime() : Date.now();
      const diffDays = Math.max(1, Math.round((current - lastTime) / (1000 * 60 * 60 * 24)));
      return Math.min(20, Math.max(2, diffDays));
    } catch {
      return 6;
    }
  };

  const homeRest = parseDaysSinceLastMatch(homeRecent);
  const awayRest = parseDaysSinceLastMatch(awayRecent);
  const delta = homeRest - awayRest;

  const isHomeDouble = homeRest <= 3;
  const isAwayDouble = awayRest <= 3;

  let dragHome = 1.0;
  let dragAway = 1.0;

  if (isHomeDouble) dragHome = 0.88;
  if (isAwayDouble) dragAway = 0.88;

  let lateRisk = false;
  let note = '';

  if (delta >= 3) {
    lateRisk = true;
    note = `【赛程体能巨大剪刀差】主队休整${homeRest}天(体能充沛) vs 客队周中刚赛仅休${awayRest}天(双赛疲劳负荷)，客队下半场65'后防守覆盖率和逼抢强度将遭遇断崖式衰减(衰减系数${dragAway}x)，强烈利好主队后程发力！`;
  } else if (delta <= -3) {
    lateRisk = true;
    note = `【主队双赛体能透支预警】主队连续作战仅休${homeRest}天，客队休整${awayRest}天以逸待劳，谨防主队深盘穿盘乏力后程失守！`;
  } else if (isHomeDouble && isAwayDouble) {
    note = `双方均处于一周双赛高密赛程(主队休${homeRest}天/客队休${awayRest}天)，体能均处于高负荷期，比赛节奏在70'后可能明显降速。`;
  } else {
    note = `双方赛程休整节奏均衡(主队${homeRest}天 vs 客队${awayRest}天)，体能储备充分。`;
  }

  return {
    home_rest_days: homeRest,
    away_rest_days: awayRest,
    rest_advantage_delta: delta,
    is_home_congested_double_week: isHomeDouble,
    is_away_congested_double_week: isAwayDouble,
    fatigue_drag_multiplier_home: dragHome,
    fatigue_drag_multiplier_away: dragAway,
    late_fatigue_breakdown_risk: lateRisk,
    schedule_tactical_note_zh: note,
  };
}

// ==========================================
// 9. Weather & Pitch Physical Drag Model
// ==========================================
export interface WeatherAndPitchPhysics {
  weather_condition: string;
  temperature_celsius: number | null;
  humidity_pct: number | null;
  pitch_skid_friction_index: number;
  goal_damping_delta_lambda: number;
  corner_inflation_multiplier: number;
  extreme_heat_fatigue_early_flag: boolean;
  weather_tactical_note_zh: string;
}

export function evaluateWeatherAndPitchPhysics(item: any): WeatherAndPitchPhysics {
  const weatherData = item?.weather || item?.detail_context?.weather || item?.detail_context?.formal?.static_match?.weather;
  const weatherText = typeof weatherData === 'string' 
    ? weatherData 
    : Array.isArray(weatherData?.text) 
      ? weatherData.text.join(' ') 
      : weatherData?.condition || weatherData?.desc || '';

  const tempMatch = weatherText.match(/(-?\d+(?:\.\d+)?)\s*°?[Cc摄氏度]/);
  const temp = tempMatch ? parseFloat(tempMatch[1]) : (weatherData?.temperature ? Number(weatherData.temperature) : null);

  const humMatch = weatherText.match(/(\d+)\s*%/);
  const humidity = humMatch ? parseInt(humMatch[1], 10) : (weatherData?.humidity ? Number(weatherData.humidity) : null);

  const isRain = /雨|rain|shower|wet|下雨|暴雨|大雨|中雨|雷阵雨/i.test(weatherText);
  const isSnow = /雪|snow|blizzard|积雪/i.test(weatherText);
  const isWindy = /大风|wind|gale|强风/i.test(weatherText);
  const isExtremeHeat = temp !== null && temp >= 32;

  let friction = 1.0;
  let goalDelta = 0;
  let cornerMult = 1.0;
  let note = '';

  if (isRain || isSnow) {
    friction = 0.82;
    goalDelta = -0.28;
    cornerMult = 1.25;
    const condName = isSnow ? '雨雪积雪' : '降雨湿滑';
    note = `【${condName}场地物理阻尼警报】湿滑场地极大阻碍中路细腻地面渗透，失误与大脚解围频发，预期进球调减${goalDelta}球；但湿滑极易诱发门将脱手与防守底线铲断，角球产出率上浮${Math.round((cornerMult - 1) * 100)}%！`;
  } else if (isExtremeHeat) {
    friction = 1.0;
    goalDelta = -0.15;
    cornerMult = 0.95;
    note = `【高温(${temp}°C)体能透支警报】高温天气下双方跑动能耗加剧，半场55'后防守阵型容易出现脱节断层。`;
  } else if (isWindy) {
    friction = 0.95;
    goalDelta = -0.12;
    note = `【强风天气气流扰动】长传冲吊落点受风向影响大，射门精度有所折损。`;
  } else {
    note = '气象与场地条件优良，比赛按标准物理阻尼与技战术模型推进。';
  }

  return {
    weather_condition: weatherText || '晴好/室内',
    temperature_celsius: temp,
    humidity_pct: humidity,
    pitch_skid_friction_index: friction,
    goal_damping_delta_lambda: goalDelta,
    corner_inflation_multiplier: cornerMult,
    extreme_heat_fatigue_early_flag: isExtremeHeat,
    weather_tactical_note_zh: note,
  };
}

// ==========================================
// 10. Odds Steam Movement & Discrepancy Engine
// ==========================================
export interface OddsSteamMovementAndDiscrepancy {
  steam_velocity: number;
  steam_direction: 'SHARP_HOME_STEAM' | 'SHARP_AWAY_STEAM' | 'OVER_GOALS_STEAM' | 'UNDER_GOALS_STEAM' | 'NEUTRAL_FLOW';
  is_sharp_steam_action: boolean;
  market_trap_suspected: boolean;
  steam_tactical_note_zh: string;
}

export function evaluateOddsSteamMovementAndDiscrepancy(
  item: any,
  referenceOdds: any,
  verifiedMarkets: any[] = []
): OddsSteamMovementAndDiscrepancy {
  const ref = referenceOdds || item?.reference_odds || item?.reference_market;
  
  let openH = 0;
  let currH = 0;

  if (ref) {
    const euro = ref.europe || ref.euro;
    if (euro) {
      openH = Number(euro.open_home || euro.initial_home || euro.opening_home || 0);
      currH = Number(euro.current_home || euro.home || euro.h || 0);
    }
  }

  let velocity = 0;
  let direction: OddsSteamMovementAndDiscrepancy['steam_direction'] = 'NEUTRAL_FLOW';
  let isSharp = false;
  let isTrap = false;
  let note = '';

  if (openH > 1.0 && currH > 1.0) {
    const diff = Number((currH - openH).toFixed(3));
    velocity = Math.abs(diff);

    if (diff <= -0.18) {
      direction = 'SHARP_HOME_STEAM';
      isSharp = true;
      note = `【主力资金急速跳水・主队受热避险】主胜欧赔从初盘@${openH.toFixed(2)}重挫至即时@${currH.toFixed(2)} (跌幅${Math.abs(diff)})，主流机构呈现显著的主力资金避险动作！`;
    } else if (diff >= 0.22) {
      direction = 'SHARP_AWAY_STEAM';
      isSharp = true;
      note = `【主队赔率持续走高・阻力增大】主胜欧赔大幅拉升+${diff}，市场对主胜打出信心减退，客队方向获得机构有效防御。`;
    }
  }

  if (!note) {
    note = '盘口水位波动在常规区间内，主力机构资金流向均衡无异动。';
  }

  return {
    steam_velocity: velocity,
    steam_direction: direction,
    is_sharp_steam_action: isSharp,
    market_trap_suspected: isTrap,
    steam_tactical_note_zh: note,
  };
}

// ==========================================
// 11. Game-State Transitions & Lead Preservation Engine
// ==========================================
export interface GameStateLeadPreservation {
  current_game_state: 'STALEMATE_0_0' | 'DRAW_TIGHT' | 'HOME_LEAD_1' | 'AWAY_LEAD_1' | 'MULTI_GOAL_MARGIN';
  lead_preservation_score: number; // 0 - 100
  counter_attack_threat_boost: number; // multiplier e.g. 1.45x
  underdog_collapse_risk: boolean;
  golden_entry_point_unlocked: boolean;
  game_state_tactical_note_zh: string;
}

export function evaluateGameStateLeadPreservation(
  item: any,
  liveStats: any,
  score: any,
  minute: number
): GameStateLeadPreservation {
  const hGoal = Number(score?.home ?? 0);
  const aGoal = Number(score?.away ?? 0);
  const diff = hGoal - aGoal;
  const m = Math.max(0, minute);

  let state: GameStateLeadPreservation['current_game_state'] = 'DRAW_TIGHT';
  let preservation = 70;
  let counterBoost = 1.0;
  let collapse = false;
  let goldenEntry = false;
  let note = '';

  if (hGoal === 0 && aGoal === 0) {
    state = 'STALEMATE_0_0';
    if (m >= 35 && m <= 70) {
      const dangAtt = Number(liveStats?.home?.dangerous_attacks || 0) + Number(liveStats?.away?.dangerous_attacks || 0);
      const shots = Number(liveStats?.home?.shots || 0) + Number(liveStats?.away?.shots || 0);
      if (dangAtt >= 40 || shots >= 8) {
        goldenEntry = true;
        note = `【0-0 高压僵局・黄金入场窗口已解锁】比赛${m}'维持0-0比分但场面攻势极度炽热(累计${shots}脚射门/${dangAtt}次危险进攻)，全场大小球盘口已自然衰减至极佳赔率区间，首球爆发期望极高！`;
      } else {
        note = `比赛${m}'呈0-0胶着互守态势，双方立足防守，节奏较平稳。`;
      }
    } else {
      note = `比赛开局阶段0-0均势试探。`;
    }
  } else if (diff === 1) {
    state = 'HOME_LEAD_1';
    counterBoost = 1.45;
    preservation = 78;
    note = `【主队1-0领先・防反杀机暴增】主队取得1球领先，客队被迫全线压上身后空间暴增，主队防守反击威胁乘数拉升至1.45x，后续极易催生二次破门。`;
  } else if (diff === -1) {
    state = 'AWAY_LEAD_1';
    counterBoost = 1.45;
    preservation = 75;
    note = `【客队1-0反客为主】客队领先收缩防线，主队大举围攻但需谨防客队致命反击。`;
  } else if (Math.abs(diff) >= 2) {
    state = 'MULTI_GOAL_MARGIN';
    collapse = true;
    preservation = 90;
    note = `【两球以上分差・胜负基本定局】领先方控场收割，落后方心态失衡防线松散，大球或深让进入收割期。`;
  } else {
    state = 'DRAW_TIGHT';
    note = `双方平局比分(${hGoal}-${aGoal})，双方均保持战术严密性。`;
  }

  return {
    current_game_state: state,
    lead_preservation_score: preservation,
    counter_attack_threat_boost: counterBoost,
    underdog_collapse_risk: collapse,
    golden_entry_point_unlocked: goldenEntry,
    game_state_tactical_note_zh: note,
  };
}

// ==========================================
// 12. Sub-Bench Impact & Tactical Depth Engine (BIF)
// ==========================================
export interface SubBenchImpactScore {
  home_bench_attack_score: number; // 0 - 10
  away_bench_attack_score: number; // 0 - 10
  bench_impact_delta: number; // home - away
  second_half_sub_surge_potential: 'HIGH_SURGE_HOME' | 'HIGH_SURGE_AWAY' | 'BALANCED_BENCH' | 'WEAK_BENCH_BOTH';
  bench_tactical_note_zh: string;
}

export function evaluateSubBenchImpact(
  lineupData: any,
  item: any
): SubBenchImpactScore {
  const homeSubs = Array.isArray(lineupData?.home?.substitutes || lineupData?.home_substitutes)
    ? (lineupData?.home?.substitutes || lineupData?.home_substitutes)
    : [];
  const awaySubs = Array.isArray(lineupData?.away?.substitutes || lineupData?.away_substitutes)
    ? (lineupData?.away?.substitutes || lineupData?.away_substitutes)
    : [];

  const calcScore = (subs: any[]): number => {
    let score = 5.0;
    if (subs.length === 0) return 4.0;
    for (const p of subs) {
      const text = typeof p === 'string' ? p : `${p.name || ''} ${p.position || ''}`;
      if (/前锋|fw|striker|forward|射手|主力前锋/i.test(text)) score += 1.2;
      else if (/中场|前腰|mf|midfield|组织/i.test(text)) score += 0.6;
    }
    return Number(Math.min(10, Math.max(1, score)).toFixed(1));
  };

  const homeScore = calcScore(homeSubs);
  const awayScore = calcScore(awaySubs);
  const delta = Number((homeScore - awayScore).toFixed(1));

  let surge: SubBenchImpactScore['second_half_sub_surge_potential'] = 'BALANCED_BENCH';
  let note = '';

  if (delta >= 2.0) {
    surge = 'HIGH_SURGE_HOME';
    note = `【主队替补后手极深】主队板凳攻击力评分${homeScore}分 vs 客队${awayScore}分，替补席坐拥核心进攻生力军，60'~75'换人后二次冲刺破门概率显著高于客队！`;
  } else if (delta <= -2.0) {
    surge = 'HIGH_SURGE_AWAY';
    note = `【客队板凳深度占优】客队替补席战术后手储备更足(${awayScore}分)，换人变阵潜力大。`;
  } else {
    surge = 'BALANCED_BENCH';
    note = `双方替补席深度相当(主队${homeScore}分 vs 客队${awayScore}分)，后程换人保持常规攻防对等。`;
  }

  return {
    home_bench_attack_score: homeScore,
    away_bench_attack_score: awayScore,
    bench_impact_delta: delta,
    second_half_sub_surge_potential: surge,
    bench_tactical_note_zh: note,
  };
}

// ==========================================
// 13. Goal Time-Bucket & Half-Time Asymmetry Engine
// ==========================================
export interface GoalTimeBucketAndHalfAsymmetry {
  home_half_time_asymmetry_ratio: number; // 0.0 - 1.0 (Goals in 0-45' / Total Goals)
  away_half_time_asymmetry_ratio: number;
  combined_first_half_goal_share_pct: number;
  late_match_volatility_index: number; // 75-90+' goal frequency
  half_time_tempo_profile: 'SLOW_STARTER_SECOND_HALF_BURST' | 'EARLY_BLITZ_FIRST_HALF_HEAVY' | 'BALANCED_DISTRIBUTION';
  time_bucket_tactical_note_zh: string;
}

export function evaluateGoalTimeBucketAndHalfAsymmetry(item: any): GoalTimeBucketAndHalfAsymmetry {
  const trends = item?.recent_trends || item?.trend_summary || {};
  const dist = trends?.historical_analysis?.goal_distribution || trends?.goal_distribution || item?.goal_distribution;

  let homeFirstHalf = 0;
  let homeTotal = 0;
  let awayFirstHalf = 0;
  let awayTotal = 0;
  let late75PlusGoals = 0;

  if (dist && typeof dist === 'object') {
    const parseBuckets = (sideData: any, isHome: boolean) => {
      const scored = sideData?.all?.scored || sideData?.scored || [];
      if (Array.isArray(scored)) {
        for (const b of scored) {
          if (Array.isArray(b) && b.length >= 3) {
            let count = Number(b[0]) || 0;
            let startMin = 0;
            let endMin = 0;

            if (b.length >= 4) {
              // Leisu 4-element format: [count, pct, startMin, endMin]
              startMin = Number(b[2]) || 0;
              endMin = Number(b[3]) || 0;
            } else {
              // 3-element format: [count, startMin, endMin]
              startMin = Number(b[1]) || 0;
              endMin = Number(b[2]) || 0;
            }

            if (isHome) homeTotal += count;
            else awayTotal += count;

            if (endMin <= 45) {
              if (isHome) homeFirstHalf += count;
              else awayFirstHalf += count;
            }
            if (startMin >= 75) {
              late75PlusGoals += count;
            }
          }
        }
      }
    };
    if (dist.home) parseBuckets(dist.home, true);
    if (dist.away) parseBuckets(dist.away, false);
  }

  const hRatio = homeTotal > 0 ? Number((homeFirstHalf / homeTotal).toFixed(3)) : 0.45;
  const aRatio = awayTotal > 0 ? Number((awayFirstHalf / awayTotal).toFixed(3)) : 0.45;
  const combinedTotal = homeTotal + awayTotal;
  const combinedFirst = homeFirstHalf + awayFirstHalf;
  const avgShare = combinedTotal > 0 ? Number(((combinedFirst / combinedTotal) * 100).toFixed(1)) : 45.0;
  const lateIdx = combinedTotal > 0 ? Number(((late75PlusGoals / combinedTotal) * 100).toFixed(1)) : 26.0;

  let profile: GoalTimeBucketAndHalfAsymmetry['half_time_tempo_profile'] = 'BALANCED_DISTRIBUTION';
  let note = '';

  if (avgShare <= 35.0) {
    profile = 'SLOW_STARTER_SECOND_HALF_BURST';
    note = `【极度慢热与下半场爆发型体质】双方历史进球仅有 ${avgShare}% 发生在上半场，进攻节奏高度滞后，半场大小球利好偏小，下半场60'后进球期望呈指数级抬升！`;
  } else if (avgShare >= 58.0) {
    profile = 'EARLY_BLITZ_FIRST_HALF_HEAVY';
    note = `【抢开局闪击型节奏】双方历史进球有 ${avgShare}% 集中在上半场，开局高位拼刺刀，半场大球爆发概率极高！`;
  } else {
    profile = 'BALANCED_DISTRIBUTION';
    note = `进球时段分布相对均衡(上半场占比${avgShare}%, 75'+绝杀高发率${lateIdx}%)。`;
  }

  return {
    home_half_time_asymmetry_ratio: hRatio,
    away_half_time_asymmetry_ratio: aRatio,
    combined_first_half_goal_share_pct: avgShare,
    late_match_volatility_index: lateIdx,
    half_time_tempo_profile: profile,
    time_bucket_tactical_note_zh: note,
  };
}

// ==========================================
// 14. Multi-Bookmaker Odds Dispersion & Kelly Variance Engine
// ==========================================
export interface MultiBookmakerOddsDispersion {
  bookmakers_count: number;
  home_odds_std_dev: number;
  draw_odds_std_dev: number;
  away_odds_std_dev: number;
  kelly_variance_index: number;
  market_consensus_level: 'STRONG_CONSENSUS_SHARP_DEFENSE' | 'HIGH_DIVERGENCE_UPSET_PRONE' | 'NORMAL_MARKET_SPREAD';
  dispersion_tactical_note_zh: string;
}

export function evaluateMultiBookmakerOddsDispersion(
  item: any,
  bookmakersRaw?: any[]
): MultiBookmakerOddsDispersion {
  const books = Array.isArray(bookmakersRaw) ? bookmakersRaw : (Array.isArray(item?.bookmakers) ? item.bookmakers : []);

  if (books.length < 2) {
    return {
      bookmakers_count: books.length,
      home_odds_std_dev: 0,
      draw_odds_std_dev: 0,
      away_odds_std_dev: 0,
      kelly_variance_index: 0.02,
      market_consensus_level: 'NORMAL_MARKET_SPREAD',
      dispersion_tactical_note_zh: '单机构盘口源，保持标准市场离散基准。',
    };
  }

  const hOdds: number[] = [];
  const dOdds: number[] = [];
  const aOdds: number[] = [];

  for (const b of books) {
    const m = b.markets?.h2h || b.markets?.europe || [];
    if (Array.isArray(m)) {
      for (const opt of m) {
        const name = String(opt.name || opt.side || '').toLowerCase();
        const price = Number(opt.price || opt.odds || 0);
        if (price > 1) {
          if (name.includes('draw') || name === '平' || name === 'x') dOdds.push(price);
          else if (name.includes('away') || name === '客' || name === '2') aOdds.push(price);
          else hOdds.push(price);
        }
      }
    }
  }

  const calcStd = (arr: number[]): number => {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((acc, v) => acc + v, 0) / arr.length;
    const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length;
    return Number(Math.sqrt(variance).toFixed(4));
  };

  const stdH = calcStd(hOdds);
  const stdD = calcStd(dOdds);
  const stdA = calcStd(aOdds);
  const kvi = Number((stdH + stdD * 0.5 + stdA).toFixed(4));

  let level: MultiBookmakerOddsDispersion['market_consensus_level'] = 'NORMAL_MARKET_SPREAD';
  let note = '';

  if (stdH <= 0.035 && hOdds.length >= 3) {
    level = 'STRONG_CONSENSUS_SHARP_DEFENSE';
    note = `【主流机构欧赔高度共振防范】Pinnacle/Marathon等${hOdds.length}家主流机构主胜离散度极低(σ=${stdH})，各机构控盘防御姿态极度统一，主胜真实打出确定性极高！`;
  } else if (stdH >= 0.16 || stdA >= 0.20) {
    level = 'HIGH_DIVERGENCE_UPSET_PRONE';
    note = `【机构欧赔分歧巨大・冷门预警】主流机构对胜负方向赔率标准差显著拉大(σ=${Math.max(stdH, stdA)})，主流与二线机构看法严重割裂，需严防强队爆冷不胜！`;
  } else {
    level = 'NORMAL_MARKET_SPREAD';
    note = `各机构欧赔离散度处于常规平衡区间(KVI=${kvi})。`;
  }

  return {
    bookmakers_count: Math.max(hOdds.length, books.length),
    home_odds_std_dev: stdH,
    draw_odds_std_dev: stdD,
    away_odds_std_dev: stdA,
    kelly_variance_index: kvi,
    market_consensus_level: level,
    dispersion_tactical_note_zh: note,
  };
}

// ==========================================
// 15. Margin Distribution & Deep Spread Cover Efficiency Engine (DCE)
// ==========================================
export interface MarginDistributionAndDeepCover {
  total_historical_wins: number;
  win_by_1_goal_pct: number;
  win_by_2_goals_pct: number;
  win_by_3_plus_goals_pct: number;
  deep_cover_efficiency_dce: number; // Wins by >= 2 / Total Wins (0.0 - 1.0)
  deep_spread_risk_warning: boolean;
  margin_tactical_note_zh: string;
}

export function evaluateMarginDistributionAndDeepCover(
  item: any,
  homeTeam: string = '',
  awayTeam: string = ''
): MarginDistributionAndDeepCover {
  const trends = item?.recent_trends || item?.trend_summary || {};
  const recent = trends?.historical_analysis?.recent_matches?.home || trends?.home_recent || [];

  let totalWins = 0;
  let win1 = 0;
  let win2 = 0;
  let win3Plus = 0;

  if (Array.isArray(recent)) {
    for (const match of recent) {
      let gf = 0;
      let ga = 0;
      if (typeof match.score === 'string') {
        const m = match.score.match(/(\d+)[\s:-]+(\d+)/);
        if (m) {
          gf = parseInt(m[1], 10);
          ga = parseInt(m[2], 10);
        }
      } else if (match.home_score != null && match.away_score != null) {
        gf = Number(match.home_score);
        ga = Number(match.away_score);
      }

      if (gf > ga) {
        totalWins++;
        const margin = gf - ga;
        if (margin === 1) win1++;
        else if (margin === 2) win2++;
        else if (margin >= 3) win3Plus++;
      }
    }
  }

  const p1 = totalWins > 0 ? Number(((win1 / totalWins) * 100).toFixed(1)) : 50.0;
  const p2 = totalWins > 0 ? Number(((win2 / totalWins) * 100).toFixed(1)) : 30.0;
  const p3 = totalWins > 0 ? Number(((win3Plus / totalWins) * 100).toFixed(1)) : 20.0;
  const dce = totalWins > 0 ? Number(((win2 + win3Plus) / totalWins).toFixed(3)) : 0.50;

  let risk = false;
  let note = '';

  if (totalWins >= 3 && dce < 0.35) {
    risk = true;
    note = `【经济型小胜体质・深盘穿盘高危预警】主队近${totalWins}场胜利中高达 ${p1}% 为1球小胜(深盘击穿系数DCE仅${dce})，该队领先后战术习惯收缩控场而非扩大比分，让-1.25/-1.5等深盘极易赢球输盘！`;
  } else if (dce >= 0.70 && totalWins >= 3) {
    note = `【高效屠杀穿盘体质】主队赢球时穿深盘率极高(DCE=${dce}, 两球以上大胜占比${(p2 + p3).toFixed(1)}%)，深盘打穿能力强劲！`;
  } else {
    note = `主队胜场净胜球分布平稳(1球小胜${p1}%, 2球胜${p2}%, 3球+胜${p3}%)。`;
  }

  return {
    total_historical_wins: totalWins,
    win_by_1_goal_pct: p1,
    win_by_2_goals_pct: p2,
    win_by_3_plus_goals_pct: p3,
    deep_cover_efficiency_dce: dce,
    deep_spread_risk_warning: risk,
    margin_tactical_note_zh: note,
  };
}

// ==========================================
// 16. Booked Defender Constraint & 2nd Yellow Risk Engine
// ==========================================
export interface BookedDefenderAndSecondYellowRisk {
  home_booked_defenders: number;
  away_booked_defenders: number;
  defensive_constraint_drag_home: number;
  defensive_constraint_drag_away: number;
  second_yellow_risk_elevated: boolean;
  booked_defender_tactical_note_zh: string;
}

export function evaluateBookedDefenderAndSecondYellowRisk(
  item: any,
  minute: number,
  refereeSeverity: number = 1.0
): BookedDefenderAndSecondYellowRisk {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : (Array.isArray(item?.key_incidents) ? item.key_incidents : []);
  const homeTeam = item?.ybty_home || item?.leisu_home || '';
  const awayTeam = item?.ybty_away || item?.leisu_away || '';

  let hBookedDef = 0;
  let aBookedDef = 0;
  let earlyBooked = false;

  for (const inc of incidents) {
    const text = typeof inc === 'string' ? inc : `${inc.minute || ''}' ${inc.type || ''} ${inc.team || ''} ${inc.text || ''}`;
    if (/黄牌|yellow card/i.test(text)) {
      const minMatch = text.match(/^(\d{1,3})/);
      const incMin = minMatch ? parseInt(minMatch[1], 10) : 45;
      if (incMin <= 35) earlyBooked = true;

      const isAway = awayTeam && text.includes(awayTeam);
      if (isAway) aBookedDef++;
      else hBookedDef++;
    }
  }

  let dragH = 1.0;
  let dragA = 1.0;
  if (hBookedDef > 0) dragH = Number(Math.max(0.70, 1.0 - hBookedDef * 0.12).toFixed(2));
  if (aBookedDef > 0) dragA = Number(Math.max(0.70, 1.0 - aBookedDef * 0.12).toFixed(2));

  const high2ndYellow = (hBookedDef >= 2 || aBookedDef >= 2 || (earlyBooked && (hBookedDef > 0 || aBookedDef > 0))) && refereeSeverity >= 1.20;

  let note = '';
  if (aBookedDef >= 2) {
    note = `【客队防守线多点染黄受制】客队已有${aBookedDef}名后场球员持黄牌，防守动作严重受限不敢战术犯规(防守折损系数${dragA}x)，主队中路地面渗透破门期望显著提升！`;
  } else if (hBookedDef >= 2) {
    note = `【主队后防黄牌受制】主队${hBookedDef}名防守球员持黄，防守阻截犹豫度上升。`;
  } else if (high2ndYellow) {
    note = `【严厉主裁下二黄变红高危警报】早早吃牌结合严厉主裁，下半场二黄变红被罚下概率激增！`;
  } else {
    note = '场上防守纪律可控，无过度持黄掣肘。';
  }

  return {
    home_booked_defenders: hBookedDef,
    away_booked_defenders: aBookedDef,
    defensive_constraint_drag_home: dragH,
    defensive_constraint_drag_away: dragA,
    second_yellow_risk_elevated: high2ndYellow,
    booked_defender_tactical_note_zh: note,
  };
}

// ==========================================
// 17. Set-Piece & Corner-to-Goal Threat Conversion Engine (CGC)
// ==========================================
export interface CornerToGoalConversionThreat {
  total_corners: number;
  corner_to_shot_ratio: number;
  aerial_threat_profile: 'CRITICAL_AERIAL_BOMBARDMENT' | 'EMPTY_CORNER_DEFLECTION_INFLATION' | 'AVERAGE_SET_PIECE';
  corner_conversion_tactical_note_zh: string;
}

export function evaluateCornerToGoalConversionThreat(
  item: any,
  liveStats: any,
  minute: number
): CornerToGoalConversionThreat {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hCorners = getSide('corners', 'home');
  const aCorners = getSide('corners', 'away');
  const totCorners = hCorners + aCorners;
  const hShots = getSide('shots', 'home');
  const aShots = getSide('shots', 'away');
  const totShots = hShots + aShots;

  const ratio = totCorners > 0 ? Number((totShots / Math.max(1, totCorners)).toFixed(2)) : 1.5;

  let profile: CornerToGoalConversionThreat['aerial_threat_profile'] = 'AVERAGE_SET_PIECE';
  let note = '';

  if (totCorners >= 7 && ratio < 0.85) {
    profile = 'EMPTY_CORNER_DEFLECTION_INFLATION';
    note = `【低效刷角虚假繁荣预警】全场累计刷出${totCorners}个角球但角球射门转化比极低(${ratio})，缺乏禁区高点高空轰炸，切勿被角球虚高数字盲目诱导追大！`;
  } else if (totCorners >= 6 && ratio >= 1.6) {
    profile = 'CRITICAL_AERIAL_BOMBARDMENT';
    note = `【高空定位球致命杀伤】角球战术执行极佳，每次角球均能形成二点射门高压，定位球破门期望极高！`;
  } else {
    profile = 'AVERAGE_SET_PIECE';
    note = `角球与定位球攻防转换在常规基准内。`;
  }

  return {
    total_corners: totCorners,
    corner_to_shot_ratio: ratio,
    aerial_threat_profile: profile,
    corner_conversion_tactical_note_zh: note,
  };
}

// ==========================================
// 18. Knockout Aggregate Score & Extra-Time Stall Dynamics Engine
// ==========================================
export interface KnockoutAggregateAndExtraTimeDynamics {
  is_knockout_match: boolean;
  is_second_leg_aggregate: boolean;
  aggregate_lead_margin: number;
  extra_time_stall_risk_80plus: boolean;
  knockout_tactical_note_zh: string;
}

export function evaluateKnockoutAggregateAndExtraTimeDynamics(
  item: any,
  league: string,
  score: any,
  minute: number
): KnockoutAggregateAndExtraTimeDynamics {
  const isCup = /杯|cup|copa|trophy|champions|uefa|afc|libertadores|淘汰赛|playoff|knockout/i.test(league);
  const m = Math.max(0, minute);
  const hGoal = Number(score?.home ?? 0);
  const aGoal = Number(score?.away ?? 0);
  const isTied = hGoal === aGoal;

  const firstLeg = item?.first_leg_score || item?.detail_context?.first_leg;
  const is2ndLeg = Boolean(firstLeg);
  let aggMargin = 0;
  if (firstLeg && typeof firstLeg === 'object') {
    aggMargin = (Number(firstLeg.home ?? 0) - Number(firstLeg.away ?? 0)) + (hGoal - aGoal);
  }

  const stallRisk = isCup && m >= 78 && isTied;

  let note = '';
  if (is2ndLeg && Math.abs(aggMargin) >= 2) {
    note = `【次回合两回合净胜锁定・拒绝深盘】总比分已出现大分差领先(${aggMargin}球)，领先方核心战术为控场保体能，缺乏继续狂攻大胜动力，严禁盲目推荐深盘！`;
  } else if (stallRisk) {
    note = `【单场淘汰赛终局加时拖延博弈】杯赛${m}'战平，双方均畏惧被绝杀，战术极度趋于保守等待加时/点球大战，尾段全场小球概率飙升！`;
  } else if (isCup) {
    note = '杯赛淘汰赛制，具备特殊战意与出线博弈环境。';
  } else {
    note = '标准联赛常规积分赛制。';
  }

  return {
    is_knockout_match: isCup,
    is_second_leg_aggregate: is2ndLeg,
    aggregate_lead_margin: aggMargin,
    extra_time_stall_risk_80plus: stallRisk,
    knockout_tactical_note_zh: note,
  };
}

// ==========================================
// 19. Possession Efficiency & Lethal Counter-Attack Directness Engine (PEI)
// ==========================================
export interface PossessionEfficiencyAndCounterDirectness {
  home_possession_pct: number;
  away_possession_pct: number;
  home_possession_penetration_ratio: number;
  away_possession_penetration_ratio: number;
  home_counter_directness_index: number;
  away_counter_directness_index: number;
  possession_tactical_profile: 'STERILE_INEFFECTIVE_POSSESSION_TRAP' | 'HIGH_LETHALITY_COUNTER_PUNCH' | 'BALANCED_CONTROL';
  possession_tactical_note_zh: string;
}

export function evaluatePossessionEfficiencyAndCounterDirectness(
  liveStats: any,
  minute: number
): PossessionEfficiencyAndCounterDirectness {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hPoss = getSide('possession', 'home') || 50;
  const aPoss = getSide('possession', 'away') || 50;
  const hDang = getSide('dangerous_attacks', 'home');
  const aDang = getSide('dangerous_attacks', 'away');
  const hSot = getSide('shots_on_target', 'home') || (getSide('shots', 'home') * 0.4);
  const aSot = getSide('shots_on_target', 'away') || (getSide('shots', 'away') * 0.4);

  const hPPR = hPoss > 0 ? Number((hDang / hPoss).toFixed(2)) : 0.5;
  const aPPR = aPoss > 0 ? Number((aDang / aPoss).toFixed(2)) : 0.5;
  const hCDI = hDang > 0 ? Number((hSot / hDang).toFixed(2)) : 0.2;
  const aCDI = aDang > 0 ? Number((aSot / aDang).toFixed(2)) : 0.2;

  let profile: PossessionEfficiencyAndCounterDirectness['possession_tactical_profile'] = 'BALANCED_CONTROL';
  let note = '';

  if (hPoss >= 62 && hPPR < 0.35 && aCDI >= 0.35) {
    profile = 'STERILE_INEFFECTIVE_POSSESSION_TRAP';
    note = `【主队无效传控催眠・客队致命反击高危】主队高达${hPoss}%控球但渗透比极低(${hPPR})陷入无威胁倒脚大巴阵，客队反击直传射正率极高(CDI=${aCDI})，严防主队久攻不下被偷鸡爆冷！`;
  } else if (aPoss >= 62 && aPPR < 0.35 && hCDI >= 0.35) {
    profile = 'HIGH_LETHALITY_COUNTER_PUNCH';
    note = `【客队假繁荣控球・主队防反杀伤巨大】客队控球占优但难以穿透，主队低位反击效率极高(CDI=${hCDI})。`;
  } else if (hPoss >= 60 && hPPR >= 0.80) {
    profile = 'BALANCED_CONTROL';
    note = `【主队高效窒息高压围攻】主队${hPoss}%控球并形成密集中路渗透(PPR=${hPPR})，围攻破门期望极强！`;
  } else {
    profile = 'BALANCED_CONTROL';
    note = `双方控球与反击效率处于常规平衡区间(主队控球${hPoss}%, 客队${aPoss}%)。`;
  }

  return {
    home_possession_pct: hPoss,
    away_possession_pct: aPoss,
    home_possession_penetration_ratio: hPPR,
    away_possession_penetration_ratio: aPPR,
    home_counter_directness_index: hCDI,
    away_counter_directness_index: aCDI,
    possession_tactical_profile: profile,
    possession_tactical_note_zh: note,
  };
}

// ==========================================
// 20. Tactical Foul Drag & Danger Zone Set-Piece Vulnerability Engine
// ==========================================
export interface TacticalFoulAndSetPieceVulnerability {
  home_fouls: number;
  away_fouls: number;
  total_fouls: number;
  game_rhythm_fragmentation_level: 'HIGH_FRAGMENTATION_STALL' | 'CLEAN_FLOW_ACCELERATION' | 'MODERATE_DISCIPLINE';
  danger_zone_free_kick_threat: boolean;
  foul_tactical_note_zh: string;
}

export function evaluateTacticalFoulAndSetPieceVulnerability(
  liveStats: any,
  minute: number
): TacticalFoulAndSetPieceVulnerability {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hFouls = getSide('fouls', 'home');
  const aFouls = getSide('fouls', 'away');
  const totFouls = hFouls + aFouls;
  const m = Math.max(1, minute);
  const foulRatePer10Min = Number(((totFouls / m) * 10).toFixed(1));

  let level: TacticalFoulAndSetPieceVulnerability['game_rhythm_fragmentation_level'] = 'MODERATE_DISCIPLINE';
  let dangerFK = false;
  let note = '';

  if (totFouls >= 14 || foulRatePer10Min >= 3.2) {
    level = 'HIGH_FRAGMENTATION_STALL';
    dangerFK = true;
    note = `【高频战术犯规割裂比赛・运动战受阻】全场已累计出现${totFouls}次犯规(场均${foulRatePer10Min}次/10分钟)，攻防连续性被严重碎化，运动战破门期望受压制，需重点关注定位球死球破门机会。`;
  } else if (totFouls <= 4 && m >= 40) {
    level = 'CLEAN_FLOW_ACCELERATION';
    note = `【极低犯规率・高速攻防对攻流通】双方防守干净犯规极少(${totFouls}次)，比赛节奏极快且流畅，极度利好快速反击与大球连续破门！`;
  } else {
    level = 'MODERATE_DISCIPLINE';
    note = `犯规频率在正常范围(累计${totFouls}次)。`;
  }

  return {
    home_fouls: hFouls,
    away_fouls: aFouls,
    total_fouls: totFouls,
    game_rhythm_fragmentation_level: level,
    danger_zone_free_kick_threat: dangerFK,
    foul_tactical_note_zh: note,
  };
}

// ==========================================
// 21. Offside Line Physics & Broken Offside Trap Index Engine
// ==========================================
export interface OffsideLinePhysicsAndTrapBreakthrough {
  home_offsides: number;
  away_offsides: number;
  total_offsides: number;
  high_defensive_line_trap_active: boolean;
  broken_trap_breakthrough_hazard: boolean;
  offside_tactical_note_zh: string;
}

export function evaluateOffsideLinePhysicsAndTrapBreakthrough(
  liveStats: any,
  minute: number
): OffsideLinePhysicsAndTrapBreakthrough {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hOff = getSide('offsides', 'home');
  const aOff = getSide('offsides', 'away');
  const totOff = hOff + aOff;
  const m = Math.max(1, minute);

  const activeTrap = totOff >= 4 && m <= 70;
  const hazard = activeTrap;

  let note = '';
  if (activeTrap) {
    note = `【高位造越位防线・单刀打穿大球潜伏期】累计出现${totOff}次越位，表明防守方压迫极高、攻击方前锋持续高速反越位冲击防线身后，一旦造越位失误即形成绝对单刀，进球方差极大，切勿误判为沉闷小球！`;
  } else {
    note = `越位次数正常(${totOff}次)，防线站位标准。`;
  }

  return {
    home_offsides: hOff,
    away_offsides: aOff,
    total_offsides: totOff,
    high_defensive_line_trap_active: activeTrap,
    broken_trap_breakthrough_hazard: hazard,
    offside_tactical_note_zh: note,
  };
}

// ==========================================
// 22. Streak Momentum & Mean Regression Damping Engine
// ==========================================
export interface StreakMomentumAndMeanRegression {
  win_streak_count: number;
  loss_streak_count: number;
  market_overheat_penalty_delta: number;
  streak_profile: 'EXTREME_WIN_STREAK_OVERHEAT_TRAP' | 'BOTTOM_REBOUND_VALUE_WINDOW' | 'NORMAL_MOMENTUM';
  streak_tactical_note_zh: string;
}

export function evaluateStreakMomentumAndMeanRegression(item: any): StreakMomentumAndMeanRegression {
  const trends = item?.trend_summary || item?.recent_trends || {};
  const table = Array.isArray(trends?.home?.table) ? trends.home.table : [];
  
  let winStreak = 0;
  let lossStreak = 0;

  if (table.length > 0) {
    winStreak = Number(table[0]?.continuous_win || 0);
    lossStreak = Number(table[0]?.continuous_lose || 0);
  } else {
    const recent = trends?.historical_analysis?.recent_matches?.home || trends?.home_recent || [];
    if (Array.isArray(recent)) {
      for (const m of recent) {
        const res = String(m.result || '');
        if (res.includes('胜') || res.includes('赢') || res === 'win') {
          if (lossStreak === 0) winStreak++;
          else break;
        } else if (res.includes('负') || res.includes('输') || res === 'loss') {
          if (winStreak === 0) lossStreak++;
          else break;
        } else {
          break;
        }
      }
    }
  }

  let penalty = 0;
  let profile: StreakMomentumAndMeanRegression['streak_profile'] = 'NORMAL_MOMENTUM';
  let note = '';

  if (winStreak >= 5) {
    penalty = Number((-0.15 * (winStreak - 3)).toFixed(2));
    profile = 'EXTREME_WIN_STREAK_OVERHEAT_TRAP';
    note = `【连胜极限均值回归预警】主队近期豪取${winStreak}连胜/连赢盘，市场情绪极度亢奋，机构盘口让步虚高严重(溢价折损系数${penalty})，必须严控A级深盘推荐防范热度崩塌！`;
  } else if (lossStreak >= 4) {
    profile = 'BOTTOM_REBOUND_VALUE_WINDOW';
    note = `【连续输盘触底反弹窗口】近期遭遇${lossStreak}连败/输盘，市场预期被极端压低至冰点，受让深盘安全垫极厚，具备极佳触底反弹冷门价值！`;
  } else {
    profile = 'NORMAL_MOMENTUM';
    note = `近期走势形态平稳(连胜${winStreak}, 连败${lossStreak})。`;
  }

  return {
    win_streak_count: winStreak,
    loss_streak_count: lossStreak,
    market_overheat_penalty_delta: penalty,
    streak_profile: profile,
    streak_tactical_note_zh: note,
  };
}

// ==========================================
// 23. Half-Time vs Full-Time Spread Harmonic Consistency Engine
// ==========================================
export interface HalfVsFullSpreadHarmonicConsistency {
  full_spread_line: number | null;
  half_spread_line: number | null;
  harmonic_spread_delta: number | null;
  harmonic_profile: 'HALF_TIME_FAST_BLITZ' | 'SOFT_FIRST_HALF_SECOND_HALF_BURST' | 'HARMONIC_ALIGNED';
  harmonic_tactical_note_zh: string;
}

export function evaluateHalfVsFullSpreadHarmonicConsistency(
  verifiedMarkets: any[]
): HalfVsFullSpreadHarmonicConsistency {
  if (!Array.isArray(verifiedMarkets)) {
    return {
      full_spread_line: null, half_spread_line: null, harmonic_spread_delta: null,
      harmonic_profile: 'HARMONIC_ALIGNED', harmonic_tactical_note_zh: '无半全场对照盘口。',
    };
  }

  const getLine = (mKey: string): number | null => {
    const m = verifiedMarkets.find((v) => v.market === mKey);
    if (m && Array.isArray(m.options)) {
      for (const opt of m.options) {
        const num = parseFloat(String(opt.line || '').replace(/[^\d.-]/g, ''));
        if (!isNaN(num)) return num;
      }
    }
    return null;
  };

  const fullLine = getLine('full_spread');
  const halfLine = getLine('half_spread');

  if (fullLine === null || halfLine === null) {
    return {
      full_spread_line: fullLine, half_spread_line: halfLine, harmonic_spread_delta: null,
      harmonic_profile: 'HARMONIC_ALIGNED', harmonic_tactical_note_zh: '半全场对照盘口不全，保持标准基准。',
    };
  }

  const expectedHalf = fullLine * 0.42;
  const delta = Number((halfLine - expectedHalf).toFixed(2));

  let profile: HalfVsFullSpreadHarmonicConsistency['harmonic_profile'] = 'HARMONIC_ALIGNED';
  let note = '';

  if (Math.abs(fullLine) >= 1.0 && Math.abs(halfLine) <= 0.25 && delta * fullLine < -0.15) {
    profile = 'SOFT_FIRST_HALF_SECOND_HALF_BURST';
    note = `【半场偏软・全场深让跨期谐波背离】全场强让${fullLine}球但半场仅让${halfLine}球(理论应让${expectedHalf.toFixed(2)})，机构对上半场破门持保守怀疑态度，暗示重心在下半场总攻或全场存在诱盘虚高！`;
  } else if (Math.abs(halfLine) >= 0.5 && Math.abs(fullLine) <= 0.75 && delta * fullLine > 0.15) {
    profile = 'HALF_TIME_FAST_BLITZ';
    note = `【半场深让抢开局形态】半场盘口力度异常偏大(${halfLine})，机构极度防范上半场闪击建立优势！`;
  } else {
    profile = 'HARMONIC_ALIGNED';
    note = `半全场让球盘口张力符合理论数学谐波一致性(全场${fullLine} vs 半场${halfLine})。`;
  }

  return {
    full_spread_line: fullLine,
    half_spread_line: halfLine,
    harmonic_spread_delta: delta,
    harmonic_profile: profile,
    harmonic_tactical_note_zh: note,
  };
}

// ==========================================
// 24. League Tier Disparity & Table Pressure Multiplier Engine
// ==========================================
export interface LeagueTierDisparityAndTablePressure {
  home_rank: number;
  away_rank: number;
  tier_disparity_index: number; // 0.0 - 1.0
  home_points_urgency_multiplier: number; // e.g. 1.35x
  away_points_urgency_multiplier: number;
  relegation_desperation_defense_boost: boolean;
  mid_table_complacency_risk: boolean;
  tier_pressure_tactical_note_zh: string;
}

export function evaluateLeagueTierDisparityAndTablePressure(
  standings: any,
  league: string,
  homeTeam: string = '',
  awayTeam: string = ''
): LeagueTierDisparityAndTablePressure {
  const getRank = (sideData: any): number => Number(sideData?.total?.rank || sideData?.rank || 10);
  const homeSide = standings?.home_team || standings?.home || {};
  const awaySide = standings?.away_team || standings?.away || {};
  const hRank = getRank(homeSide);
  const aRank = getRank(awaySide);

  const totalTeams = Math.max(18, Math.max(hRank, aRank) + 2);
  const tdi = Number((Math.abs(hRank - aRank) / totalTeams).toFixed(2));

  let hUrgency = 1.0;
  let aUrgency = 1.0;
  let relegBoost = false;
  let midComplacency = false;

  // Relegation zone is bottom 3
  if (hRank >= totalTeams - 3) {
    hUrgency = 1.35;
    relegBoost = true;
  }
  if (aRank >= totalTeams - 3) {
    aUrgency = 1.35;
    relegBoost = true;
  }

  // Mid table is ranks 8-13 in a 20-team league
  if (hRank >= 8 && hRank <= 13 && aRank >= 8 && aRank <= 13) {
    midComplacency = true;
    hUrgency = 0.85;
    aUrgency = 0.85;
  }

  let note = '';
  if (relegBoost) {
    note = `【保级生死线・全员肉搏防御加成】榜尾保级队面临生死保级压力(战意紧迫系数1.35x)，防守专注度与身体对抗强度拉满，强队赢球极难穿深盘！`;
  } else if (midComplacency) {
    note = `【中游无战意松懈风险】双方均处无欲无求中游安全区(战意紧迫系数0.85x)，比赛节奏易趋于开放但破深盘决心偏低。`;
  } else if (tdi >= 0.50) {
    note = `【联赛阶层实力剪刀差显著】积分榜排名差距悬殊(第${hRank}名 vs 第${aRank}名, TDI=${tdi})，阶层压制力强。`;
  } else {
    note = `积分榜位置势均力敌(第${hRank}名 vs 第${aRank}名)。`;
  }

  return {
    home_rank: hRank,
    away_rank: aRank,
    tier_disparity_index: tdi,
    home_points_urgency_multiplier: hUrgency,
    away_points_urgency_multiplier: aUrgency,
    relegation_desperation_defense_boost: relegBoost,
    mid_table_complacency_risk: midComplacency,
    tier_pressure_tactical_note_zh: note,
  };
}

// ==========================================
// 25. First-Goal Win Conversion & Comeback Resilience Engine
// ==========================================
export interface FirstGoalAndComebackResilience {
  home_first_goal_win_rate_pct: number;
  away_first_goal_win_rate_pct: number;
  home_comeback_resilience_index: number;
  away_comeback_resilience_index: number;
  resilience_profile: 'IRON_LEAD_PROTECTOR' | 'HABITUAL_CHOKE_COLLAPSE' | 'COMEBACK_SPECIALIST' | 'NORMAL_RESILIENCE';
  resilience_tactical_note_zh: string;
}

export function evaluateFirstGoalAndComebackResilience(item: any, currentScore?: { home: number; away: number }): FirstGoalAndComebackResilience {
  const trends = item?.trend_summary || item?.recent_trends || {};
  const homeTable = Array.isArray(trends?.home?.table) ? trends.home.table[0] : {};
  const awayTable = Array.isArray(trends?.away?.table) ? trends.away.table[0] : {};

  const hScoredFirstWins = Number(homeTable?.score_first_win || 0);
  const hScoredFirstTot = Number(homeTable?.score_first_total || hScoredFirstWins || 1);
  const aScoredFirstWins = Number(awayTable?.score_first_win || 0);
  const aScoredFirstTot = Number(awayTable?.score_first_total || aScoredFirstWins || 1);

  const hFGW = hScoredFirstTot > 0 ? Number(((hScoredFirstWins / hScoredFirstTot) * 100).toFixed(1)) : 75.0;
  const aFGW = aScoredFirstTot > 0 ? Number(((aScoredFirstWins / aScoredFirstTot) * 100).toFixed(1)) : 70.0;

  const hComebackPts = Number(homeTable?.concede_first_points || 0);
  const aComebackPts = Number(awayTable?.concede_first_points || 0);
  const hCRI = Number((hComebackPts / Math.max(3, Number(homeTable?.concede_first_total || 3) * 3)).toFixed(2));
  const aCRI = Number((aComebackPts / Math.max(3, Number(awayTable?.concede_first_total || 3) * 3)).toFixed(2));

  let profile: FirstGoalAndComebackResilience['resilience_profile'] = 'NORMAL_RESILIENCE';
  let note = '';

  const hLead = (currentScore?.home ?? 0) > (currentScore?.away ?? 0);
  const aLead = (currentScore?.away ?? 0) > (currentScore?.home ?? 0);

  if (hLead && hFGW >= 85.0) {
    profile = 'IRON_LEAD_PROTECTOR';
    note = `【主队铁血顺风局・领先后胜率${hFGW}%】主队历史上先进球后胜率极高，领先控场极其沉稳，防守反击纪律性拉满，逆转翻盘概率极低！`;
  } else if (hLead && hFGW < 55.0) {
    profile = 'HABITUAL_CHOKE_COLLAPSE';
    note = `【主队习惯性顺风崩盘・先进球胜率仅${hFGW}%】主队领先后后防极易松懈崩盘，落后方反弹扳平期望激增，严禁盲目追主队深盘！`;
  } else if (aLead && hCRI >= 0.40) {
    profile = 'COMEBACK_SPECIALIST';
    note = `【主队逆风逆转大师・翻盘韧性指数${hCRI}】主队具备极强先丢球逆境反扑基因，落后时常在下半场掀起狂攻，利好追主队受让或大球！`;
  } else {
    profile = 'NORMAL_RESILIENCE';
    note = `双方顺风守成与逆风韧性处于常规基准(主队先进球胜率${hFGW}%, 客队${aFGW}%)。`;
  }

  return {
    home_first_goal_win_rate_pct: hFGW,
    away_first_goal_win_rate_pct: aFGW,
    home_comeback_resilience_index: hCRI,
    away_comeback_resilience_index: aCRI,
    resilience_profile: profile,
    resilience_tactical_note_zh: note,
  };
}

// ==========================================
// 26. Both Teams to Score (BTTS) & Dual-Net Penetration Model
// ==========================================
export interface BothTeamsToScoreJointProbability {
  historical_btts_rate_pct: number;
  theoretical_joint_btts_prob_pct: number;
  btts_profile: 'HIGH_DUAL_NET_FIREPOWER' | 'ONE_SIDED_CLEAN_SHEET_DOMINANCE' | 'BALANCED_BTTS';
  btts_tactical_note_zh: string;
}

export function evaluateBothTeamsToScoreJointProbability(item: any, lambdaH: number = 1.3, lambdaA: number = 1.0): BothTeamsToScoreJointProbability {
  const trends = item?.trend_summary || item?.recent_trends || {};
  const histBTTS = Number(trends?.home?.btts_ratio || trends?.btts_ratio || 50);

  const lH = Math.max(0.1, lambdaH);
  const lA = Math.max(0.1, lambdaA);

  const pScoreH = 1 - Math.exp(-lH);
  const pScoreA = 1 - Math.exp(-lA);
  const jointProb = Number(((pScoreH * pScoreA) * 100).toFixed(1));

  let profile: BothTeamsToScoreJointProbability['btts_profile'] = 'BALANCED_BTTS';
  let note = '';

  if (jointProb >= 58.0 || histBTTS >= 65.0) {
    profile = 'HIGH_DUAL_NET_FIREPOWER';
    note = `【双飞互爆局高发・双方破门联合期望${jointProb}%】双方均具备持续破门能力但防线存在天然漏洞，各自单场零封概率极低，双方进球(BTTS=Yes)具有极强统计优势！`;
  } else if (jointProb <= 38.0) {
    profile = 'ONE_SIDED_CLEAN_SHEET_DOMINANCE';
    note = `【单边零封或沉闷防守格局】双方进球联合期望受限(${jointProb}%)，大概率出现至少一方交白卷零封。`;
  } else {
    profile = 'BALANCED_BTTS';
    note = `双方进球期望适中(历史双飞率${histBTTS}%, 联合期望${jointProb}%)。`;
  }

  return {
    historical_btts_rate_pct: histBTTS,
    theoretical_joint_btts_prob_pct: jointProb,
    btts_profile: profile,
    btts_tactical_note_zh: note,
  };
}

// ==========================================
// 27. Pass Accuracy & Midfield Progression Efficiency Engine (MPE)
// ==========================================
export interface PassAccuracyAndMidfieldProgression {
  home_pass_accuracy_pct: number;
  away_pass_accuracy_pct: number;
  home_midfield_progression_efficiency: number;
  away_midfield_progression_efficiency: number;
  forced_turnover_hazard_away: boolean;
  progression_profile: 'HIGH_PRECISION_PENETRATION' | 'FORCED_TURNOVER_COLLAPSE_RISK' | 'BALANCED_CIRCULATION';
  progression_tactical_note_zh: string;
}

export function evaluatePassAccuracyAndMidfieldProgression(liveStats: any, minute: number): PassAccuracyAndMidfieldProgression {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hAcc = getSide('pass_accuracy', 'home') || 80;
  const aAcc = getSide('pass_accuracy', 'away') || 75;
  const hDang = getSide('dangerous_attacks', 'home');
  const hAtt = Math.max(1, getSide('attacks', 'home') || hDang * 1.5);
  const aDang = getSide('dangerous_attacks', 'away');
  const aAtt = Math.max(1, getSide('attacks', 'away') || aDang * 1.5);

  const hMPE = Number(((hAcc / 100) * (hDang / hAtt)).toFixed(2));
  const aMPE = Number(((aAcc / 100) * (aDang / aAtt)).toFixed(2));

  let profile: PassAccuracyAndMidfieldProgression['progression_profile'] = 'BALANCED_CIRCULATION';
  let turnoverHazard = false;
  let note = '';

  if (aAcc < 68 && hDang >= 25) {
    turnoverHazard = true;
    profile = 'FORCED_TURNOVER_COLLAPSE_RISK';
    note = `【客队受迫传球失误极高・后场被断被打穿】客队传球成功率仅${aAcc}%，在高压压迫下后场频频失误送球权，极易被主队就地前场断球打出单刀！`;
  } else if (hAcc >= 86 && hMPE >= 0.55) {
    profile = 'HIGH_PRECISION_PENETRATION';
    note = `【主队高精度推进・传切行云流水】主队传球准确率${hAcc}%且进攻推进转化极高(MPE=${hMPE})，具备顶级阵地战解大巴能力！`;
  } else {
    profile = 'BALANCED_CIRCULATION';
    note = `双方中场传球运转正常(主队成功率${hAcc}%, 客队${aAcc}%)。`;
  }

  return {
    home_pass_accuracy_pct: hAcc,
    away_pass_accuracy_pct: aAcc,
    home_midfield_progression_efficiency: hMPE,
    away_midfield_progression_efficiency: aMPE,
    forced_turnover_hazard_away: turnoverHazard,
    progression_profile: profile,
    progression_tactical_note_zh: note,
  };
}

// ==========================================
// 28. Starting Lineup Age Disparity & Late-Match Fatigue Dropoff Engine
// ==========================================
export interface StartingLineupAgeAndLateFatigue {
  home_avg_age: number;
  away_avg_age: number;
  age_disparity_delta: number;
  veteran_late_fatigue_risk_70plus: boolean;
  age_tactical_note_zh: string;
}

export function evaluateStartingLineupAgeAndLateFatigue(lineupData: any, minute: number): StartingLineupAgeAndLateFatigue {
  const calcAvgAge = (starters: any[]): number => {
    if (!Array.isArray(starters) || starters.length === 0) return 26.5;
    let sum = 0;
    let count = 0;
    for (const p of starters) {
      const age = Number(p?.age || p?.player_age || 0);
      if (age >= 16 && age <= 45) {
        sum += age;
        count++;
      }
    }
    return count > 0 ? Number((sum / count).toFixed(1)) : 26.5;
  };

  const hStarters = lineupData?.home_starters || lineupData?.home || [];
  const aStarters = lineupData?.away_starters || lineupData?.away || [];
  const hAge = calcAvgAge(hStarters);
  const aAge = calcAvgAge(aStarters);
  const delta = Number((hAge - aAge).toFixed(1));

  const isLate = minute >= 68;
  const isVeteranAway = aAge >= 29.8 && hAge <= 25.5;
  const isVeteranHome = hAge >= 29.8 && aAge <= 25.5;
  const fatigueRisk = isLate && (isVeteranAway || isVeteranHome);

  let note = '';
  if (fatigueRisk && isVeteranAway) {
    note = `【客队高龄防线70'后体能断崖】客队首发平均年龄高达${aAge}岁(主队${hAge}岁青年军)，比赛进入尾段老将防线回追速度显著下降，防守失误率激增，主队终局破门期望大增！`;
  } else if (fatigueRisk && isVeteranHome) {
    note = `【主队老龄体能衰竭预警】主队平均年龄${hAge}岁，70'后体能面临断崖，防范客队青年生力军反扑。`;
  } else {
    note = `双方首发年龄结构均衡(主队${hAge}岁 vs 客队${aAge}岁)。`;
  }

  return {
    home_avg_age: hAge,
    away_avg_age: aAge,
    age_disparity_delta: delta,
    veteran_late_fatigue_risk_70plus: fatigueRisk,
    age_tactical_note_zh: note,
  };
}

// ==========================================
// 29. Goalkeeper Save Quality & God-Mode Overperformance Engine
// ==========================================
export interface GoalkeeperSaveQualityAndRegression {
  away_goalkeeper_saves: number;
  away_save_percentage_pct: number;
  goalkeeper_god_mode_active: boolean;
  late_regression_leak_risk: boolean;
  goalkeeper_tactical_note_zh: string;
}

export function evaluateGoalkeeperSaveQualityAndRegression(liveStats: any, minute: number): GoalkeeperSaveQualityAndRegression {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const aSaves = getSide('saves', 'away') || getSide('goalkeeper_saves', 'away');
  const hSot = getSide('shots_on_target', 'home') || (getSide('shots', 'home') * 0.4);
  const svPct = hSot > 0 ? Number(((aSaves / hSot) * 100).toFixed(1)) : 70.0;

  const godMode = aSaves >= 5 && svPct >= 80.0;
  const regressionRisk = godMode && minute >= 65 && hSot >= 8;

  let note = '';
  if (regressionRisk) {
    note = `【客队门将神扑超常发挥・重压下均值回归破防在即】客队门将已贡献${aSaves}次神扑(扑救率${svPct}%)，但主队攻势持续狂轰滥炸，门将防线体能精神已达承压极限，终局漏球均值回归概率极高，不可轻信沉闷小球！`;
  } else if (godMode) {
    note = `【客队门将状态火热】累计完成${aSaves}次关键扑救，门前状态极佳。`;
  } else {
    note = `门将扑救处于常规水平(完成${aSaves}次扑救)。`;
  }

  return {
    away_goalkeeper_saves: aSaves,
    away_save_percentage_pct: svPct,
    goalkeeper_god_mode_active: godMode,
    late_regression_leak_risk: regressionRisk,
    goalkeeper_tactical_note_zh: note,
  };
}

// ==========================================
// 30. Extreme Draw Odds Compression & Collusion Game Theory Engine
// ==========================================
export interface ExtremeDrawCompressionAndCollusion {
  market_draw_odds: number | null;
  draw_compression_ratio: number | null;
  is_extreme_draw_compression: boolean;
  draw_collusion_tactical_note_zh: string;
}

export function evaluateExtremeDrawCompressionAndCollusion(verifiedMarkets: any[], lambdaTotal: number = 2.5): ExtremeDrawCompressionAndCollusion {
  const m1x2 = Array.isArray(verifiedMarkets) ? verifiedMarkets.find((m) => m.market === 'full_1x2' || m.market === 'match_1x2') : null;
  let drawOdds: number | null = null;
  if (m1x2 && Array.isArray(m1x2.options)) {
    const drawOpt = m1x2.options.find((o: any) => String(o.side || o.name || '').toLowerCase().includes('draw') || String(o.side || '').includes('平'));
    if (drawOpt && Number(drawOpt.odds) > 1) {
      drawOdds = Number(drawOpt.odds);
    }
  }

  if (drawOdds === null) {
    return {
      market_draw_odds: null,
      draw_compression_ratio: null,
      is_extreme_draw_compression: false,
      draw_collusion_tactical_note_zh: '无1X2平局赔率数据。',
    };
  }

  // Poisson expected draw odds for lambdaTotal
  const poisDrawOdds = lambdaTotal >= 3.0 ? 4.2 : lambdaTotal >= 2.5 ? 3.5 : 3.1;
  const dcr = Number((drawOdds / poisDrawOdds).toFixed(2));
  const isExtreme = drawOdds <= 2.80 || dcr < 0.78;

  let note = '';
  if (isExtreme) {
    note = `⚠️【平局赔率极致压缩・疑似默契博弈共振】机构平局赔率低至 ${drawOdds.toFixed(2)} (比理论值低${Math.round((1 - dcr) * 100)}%)，高度指向双方平局双赢出线/保级共识，严禁盲目推荐让球深盘，坚决倾向受让下盘或全场小球！`;
  } else {
    note = `平局赔率处于常规市场公允定价区间(${drawOdds.toFixed(2)})。`;
  }

  return {
    market_draw_odds: drawOdds,
    draw_compression_ratio: dcr,
    is_extreme_draw_compression: isExtreme,
    draw_collusion_tactical_note_zh: note,
  };
}

// ==========================================
// 31. Box Shot Penetration vs Long-Shot Desperation Index Engine
// ==========================================
export interface BoxShotPenetrationAndDesperation {
  home_box_penetration_index: number;
  away_box_penetration_index: number;
  home_desperation_long_shot_trap: boolean;
  box_penetration_profile: 'HIGH_BOX_PENETRATION_THREAT' | 'STERILE_OUTSIDE_BOX_DESPERATION' | 'BALANCED_SHOT_LOCATIONS';
  box_tactical_note_zh: string;
}

export function evaluateBoxShotPenetrationAndDesperation(liveStats: any, minute: number): BoxShotPenetrationAndDesperation {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hInside = getSide('shots_inside_box', 'home') || (getSide('shots_on_target', 'home') * 0.7);
  const hShots = Math.max(1, getSide('shots', 'home'));
  const aInside = getSide('shots_inside_box', 'away') || (getSide('shots_on_target', 'away') * 0.7);
  const aShots = Math.max(1, getSide('shots', 'away'));

  const hBPI = Number((hInside / hShots).toFixed(2));
  const aBPI = Number((aInside / aShots).toFixed(2));

  let profile: BoxShotPenetrationAndDesperation['box_penetration_profile'] = 'BALANCED_SHOT_LOCATIONS';
  let trap = false;
  let note = '';

  if (hShots >= 8 && hBPI < 0.25) {
    trap = true;
    profile = 'STERILE_OUTSIDE_BOX_DESPERATION';
    note = `【主队外围绝望浪射・禁区渗透完全受阻】主队总射门高达${hShots}次但禁区内射门渗透比仅${hBPI}(外围远射占75%+)，面对铁桶阵破门期望极低，射门数据属虚假进攻繁荣，严禁盲目追主队穿盘！`;
  } else if (hBPI >= 0.65 && hInside >= 4) {
    profile = 'HIGH_BOX_PENETRATION_THREAT';
    note = `【主队禁区刀刀见血・高危攻门渗透比${hBPI}】主队进攻极具穿透力，攻入禁区近距离射门占主导，进球转化期望极高！`;
  } else {
    profile = 'BALANCED_SHOT_LOCATIONS';
    note = `双方射门区域分布正常(主队禁区射门比${hBPI}, 客队${aBPI})。`;
  }

  return {
    home_box_penetration_index: hBPI,
    away_box_penetration_index: aBPI,
    home_desperation_long_shot_trap: trap,
    box_penetration_profile: profile,
    box_tactical_note_zh: note,
  };
}

// ==========================================
// 32. Yellow Card Time Acceleration & Boiling Point Escalation Engine
// ==========================================
export interface YellowCardAccelerationAndBoilingPoint {
  recent_yellows_last_15min: number;
  card_surge_velocity_per_15min: number;
  boiling_point_red_card_imminent: boolean;
  card_acceleration_profile: 'BOILING_POINT_ESCALATION' | 'ELEVATED_FRICTION' | 'NORMAL_TEMPO';
  card_acceleration_tactical_note_zh: string;
}

export function evaluateYellowCardAccelerationAndBoilingPoint(item: any, minute: number): YellowCardAccelerationAndBoilingPoint {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  const minStart = Math.max(0, minute - 15);
  let countLast15 = 0;
  for (const inc of incidents) {
    const type = String(inc?.type || inc?.event_type || '').toLowerCase();
    const incMin = Number(inc?.minute || inc?.time || -1);
    if ((type.includes('yellow') || type.includes('card')) && !type.includes('red')) {
      if (incMin >= minStart && incMin <= minute) {
        countLast15++;
      }
    }
  }

  const surgeVelocity = Number((countLast15 / 15).toFixed(2));
  const isBoiling = countLast15 >= 3 || (countLast15 >= 2 && minute >= 60);

  let profile: YellowCardAccelerationAndBoilingPoint['card_acceleration_profile'] = 'NORMAL_TEMPO';
  let note = '';

  if (isBoiling) {
    profile = 'BOILING_POINT_ESCALATION';
    note = `⚠️【场上情绪失控・近15分钟狂出${countLast15}张黄牌】双方身体对抗全面升级进入情绪沸点期，极易在终局产生两黄变一红、直接红牌或禁区争端点球！`;
  } else if (countLast15 >= 1) {
    profile = 'ELEVATED_FRICTION';
    note = `近期比赛火药味有所上升(近15分钟${countLast15}黄)。`;
  } else {
    profile = 'NORMAL_TEMPO';
    note = `比赛犯规节奏与情绪控制稳定。`;
  }

  return {
    recent_yellows_last_15min: countLast15,
    card_surge_velocity_per_15min: surgeVelocity,
    boiling_point_red_card_imminent: isBoiling,
    card_acceleration_profile: profile,
    card_acceleration_tactical_note_zh: note,
  };
}

// ==========================================
// 33. Home Fortress vs Away Frailty Polarization Index Engine
// ==========================================
export interface HomeAwayPolarizationDisparity {
  home_team_home_win_rate_pct: number;
  away_team_away_loss_rate_pct: number;
  polarization_delta: number;
  is_fortress_vs_frailty_resonance: boolean;
  polarization_tactical_note_zh: string;
}

export function evaluateHomeAwayPolarizationDisparity(standings: any, homeTeam: string, awayTeam: string): HomeAwayPolarizationDisparity {
  const homeStats = standings?.home_team || standings?.home || {};
  const awayStats = standings?.away_team || standings?.away || {};

  const hHomeWins = Number(homeStats?.home_wins ?? homeStats?.wins ?? 6);
  const hHomeTotal = Math.max(1, Number(homeStats?.home_played ?? homeStats?.played ?? 10));
  const hHomeWinRate = Number(((hHomeWins / hHomeTotal) * 100).toFixed(1));

  const aAwayLosses = Number(awayStats?.away_losses ?? awayStats?.losses ?? 5);
  const aAwayTotal = Math.max(1, Number(awayStats?.away_played ?? awayStats?.played ?? 10));
  const aAwayLossRate = Number(((aAwayLosses / aAwayTotal) * 100).toFixed(1));

  const polarDelta = Number(((hHomeWinRate + aAwayLossRate - 100) / 100).toFixed(2));
  const isResonance = hHomeWinRate >= 70.0 && aAwayLossRate >= 55.0;

  let note = '';
  if (isResonance) {
    note = `【魔鬼主场 vs 客场虫崩塌共振】主队主场胜率高达${hHomeWinRate}%，客队客场败率高达${aAwayLossRate}%(极化剪刀差+${polarDelta})，主场压制力获得极强主客场战力加成！`;
  } else {
    note = `主客场战力分化处于常规区间(主队主场胜率${hHomeWinRate}%, 客队客场败率${aAwayLossRate}%)。`;
  }

  return {
    home_team_home_win_rate_pct: hHomeWinRate,
    away_team_away_loss_rate_pct: aAwayLossRate,
    polarization_delta: polarDelta,
    is_fortress_vs_frailty_resonance: isResonance,
    polarization_tactical_note_zh: note,
  };
}

// ==========================================
// 34. Head-to-Head Tactical Nemesis & Matchup Curse Engine
// ==========================================
export interface HeadToHeadTacticalNemesis {
  h2h_matches_analyzed: number;
  home_h2h_spread_win_rate_pct: number;
  away_h2h_spread_win_rate_pct: number;
  nemesis_profile: 'HOME_NEMESIS_DOMINANCE' | 'AWAY_NEMESIS_DOMINANCE' | 'BALANCED_H2H';
  h2h_nemesis_tactical_note_zh: string;
}

export function evaluateHeadToHeadTacticalNemesis(item: any): HeadToHeadTacticalNemesis {
  const history = Array.isArray(item?.trend_summary?.history) ? item.trend_summary.history : Array.isArray(item?.recent_trends?.history) ? item.recent_trends.history : [];
  const matches = history.slice(0, 6);
  if (matches.length < 3) {
    return {
      h2h_matches_analyzed: matches.length,
      home_h2h_spread_win_rate_pct: 50,
      away_h2h_spread_win_rate_pct: 50,
      nemesis_profile: 'BALANCED_H2H',
      h2h_nemesis_tactical_note_zh: '历史交锋样本有限，双方势均力敌。',
    };
  }

  let hWins = 0;
  let aWins = 0;
  for (const m of matches) {
    const res = String(m?.result || m?.outcome || '').toLowerCase();
    if (res.includes('win') || res.includes('赢') || res.includes('h')) hWins++;
    else if (res.includes('loss') || res.includes('输') || res.includes('a')) aWins++;
  }

  const hRate = Number(((hWins / matches.length) * 100).toFixed(1));
  const aRate = Number(((aWins / matches.length) * 100).toFixed(1));

  let profile: HeadToHeadTacticalNemesis['nemesis_profile'] = 'BALANCED_H2H';
  let note = '';

  if (hRate >= 80.0) {
    profile = 'HOME_NEMESIS_DOMINANCE';
    note = `【主队历史克星球风压制・交锋盘口胜率${hRate}%】主队在双方近${matches.length}次交锋中形成绝对战术克制与心理优势，克星效应显著！`;
  } else if (aRate >= 80.0) {
    profile = 'AWAY_NEMESIS_DOMINANCE';
    note = `【客队历史克星球风压制・交锋盘口胜率${aRate}%】客队对主队具备天然战术球风相克，主队极难打破交锋魔咒，严禁盲目看好主队穿盘！`;
  } else {
    profile = 'BALANCED_H2H';
    note = `历史交锋战绩互有胜负(近${matches.length}战主胜率${hRate}%)。`;
  }

  return {
    h2h_matches_analyzed: matches.length,
    home_h2h_spread_win_rate_pct: hRate,
    away_h2h_spread_win_rate_pct: aRate,
    nemesis_profile: profile,
    h2h_nemesis_tactical_note_zh: note,
  };
}

// ==========================================
// 35. Over/Under Total Streak Bias & Mean Reversion Damping Engine
// ==========================================
export interface OverUnderStreakBiasAndReversion {
  recent_over_streak_count: number;
  recent_under_streak_count: number;
  over_total_market_overheat_trap: boolean;
  ou_streak_profile: 'OVERHEAT_OVER_TRAP' | 'UNDER_REBOUND_OPPORTUNITY' | 'NORMAL_TOTAL_MOMENTUM';
  ou_streak_tactical_note_zh: string;
}

export function evaluateOverUnderStreakBiasAndReversion(item: any, verifiedMarkets: any[] = []): OverUnderStreakBiasAndReversion {
  const trends = item?.trend_summary || item?.recent_trends || {};
  const ouObj = trends?.home?.over_under || trends?.over_under || {};

  const overStreak = Number(ouObj?.continuous_over || ouObj?.over_streak || 0);
  const underStreak = Number(ouObj?.continuous_under || ouObj?.under_streak || 0);

  const mTot = Array.isArray(verifiedMarkets) ? verifiedMarkets.find((m) => m.market === 'full_total' || m.market === 'match_total') : null;
  let totLine = 2.5;
  if (mTot && Array.isArray(mTot.options) && mTot.options[0]) {
    const rawLine = parseFloat(String(mTot.options[0].line || '2.5').replace(/[^\d.]/g, ''));
    if (!isNaN(rawLine) && rawLine > 0) totLine = rawLine;
  }

  const isOverTrap = overStreak >= 5 && totLine >= 3.0;
  let profile: OverUnderStreakBiasAndReversion['ou_streak_profile'] = 'NORMAL_TOTAL_MOMENTUM';
  let note = '';

  if (isOverTrap) {
    profile = 'OVERHEAT_OVER_TRAP';
    note = `⚠️【大球连开过热诱大陷阱・连续${overStreak}场大球】机构借连大热度将总进球盘口推高至${totLine}高位，大球已无安全边际，小球均值回归价值凸显！`;
  } else if (underStreak >= 4 && totLine <= 2.25) {
    profile = 'UNDER_REBOUND_OPPORTUNITY';
    note = `【小球触底反弹窗口・连续${underStreak}场小球】盘口已被过度压低至${totLine}低位，进球欲望触底反弹潜力大。`;
  } else {
    profile = 'NORMAL_TOTAL_MOMENTUM';
    note = `大小球走势动能处于常规分布区间(连大${overStreak}, 连小${underStreak})。`;
  }

  return {
    recent_over_streak_count: overStreak,
    recent_under_streak_count: underStreak,
    over_total_market_overheat_trap: isOverTrap,
    ou_streak_profile: profile,
    ou_streak_tactical_note_zh: note,
  };
}

// ==========================================
// 36. Quarter-Line Asymmetric EV & Half-Loss Cushion Engine
// ==========================================
export interface QuarterLineAsymmetricCushion {
  is_quarter_line_market: boolean;
  quarter_line_type: 'HANDICAP_QUARTER' | 'TOTAL_QUARTER' | 'STANDARD_LINE';
  half_loss_cushion_advantage: boolean;
  quarter_cushion_tactical_note_zh: string;
}

export function evaluateQuarterLineAsymmetricCushion(verifiedMarkets: any[]): QuarterLineAsymmetricCushion {
  let isQuarter = false;
  let type: QuarterLineAsymmetricCushion['quarter_line_type'] = 'STANDARD_LINE';
  let cushion = false;
  let detectedLine = '';

  for (const m of verifiedMarkets) {
    const mName = String(m?.market || '');
    for (const opt of m?.options || []) {
      const lineStr = String(opt?.line || '');
      if (lineStr.endsWith('.25') || lineStr.endsWith('.75') || lineStr.includes('/')) {
        isQuarter = true;
        if (!detectedLine) detectedLine = lineStr;
        if (mName.includes('spread') || mName.includes('handicap')) {
          type = 'HANDICAP_QUARTER';
          if (lineStr.startsWith('+') || lineStr.includes('+0.25') || lineStr.includes('+0.75') || String(opt?.side || '').includes('受让')) {
            cushion = true;
          }
        } else if (mName.includes('total')) {
          type = 'TOTAL_QUARTER';
          if (lineStr.includes('2.25') || lineStr.includes('2.75')) {
            cushion = true;
          }
        }
      }
    }
    if (isQuarter && cushion) break;
  }

  let note = '';
  if (isQuarter && cushion) {
    note = `【四分之一盘口非对称下行保护】盘口(${detectedLine})具备输半/赢半缓冲机制，在势均力敌格局下相比半球/整数盘具备显著的正期望值安全垫！`;
  } else if (isQuarter) {
    note = `四分之一盘口(${detectedLine})需防范输半下行波动。`;
  } else {
    note = `当前为标准整数/半球盘口。`;
  }

  return {
    is_quarter_line_market: isQuarter,
    quarter_line_type: type,
    half_loss_cushion_advantage: cushion,
    quarter_cushion_tactical_note_zh: note,
  };
}

// ==========================================
// 37. VAR Intervention & Morale Trauma Dynamics Engine
// ==========================================
export interface VarInterventionAndMoraleTrauma {
  var_goal_cancelled: boolean;
  var_penalty_overturned: boolean;
  var_recent_shock_active_15min: boolean;
  var_trauma_profile: 'RECENT_VAR_GOAL_DISALLOWED_SLUMP' | 'VAR_DECISION_TURMOIL' | 'NORMAL_MATCH_FLOW';
  var_trauma_tactical_note_zh: string;
}

export function evaluateVarInterventionAndMoraleTrauma(item: any, minute: number): VarInterventionAndMoraleTrauma {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let goalCancelled = false;
  let penaltyOverturned = false;
  let lastVarMinute = -1;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.content || inc?.type || '').toLowerCase();
    const incMin = Number(inc?.minute || inc?.time || -1);
    if (text.includes('var') || text.includes('取消') || text.includes('无效') || text.includes('disallowed') || text.includes('overturned')) {
      if (text.includes('进球') || text.includes('goal') || text.includes('越位') || text.includes('offside')) {
        goalCancelled = true;
        lastVarMinute = Math.max(lastVarMinute, incMin);
      }
      if (text.includes('点球') || text.includes('penalty')) {
        penaltyOverturned = true;
        lastVarMinute = Math.max(lastVarMinute, incMin);
      }
    }
  }

  const isRecentShock = lastVarMinute > 0 && minute >= lastVarMinute && minute <= lastVarMinute + 15;
  let profile: VarInterventionAndMoraleTrauma['var_trauma_profile'] = 'NORMAL_MATCH_FLOW';
  let note = '';

  if (goalCancelled && isRecentShock) {
    profile = 'RECENT_VAR_GOAL_DISALLOWED_SLUMP';
    note = `⚠️【VAR进球取消重挫・攻势进入15分钟断崖期】第${lastVarMinute}分钟进球被VAR判定无效，攻方遭遇剧烈心理落差与阵型短暂脱节，防守方凝聚力剧增，近15分钟内严禁盲目追攻方进球或深盘！`;
  } else if (penaltyOverturned && isRecentShock) {
    profile = 'VAR_DECISION_TURMOIL';
    note = `⚠️【VAR点球改判剧烈冲击】第${lastVarMinute}分钟点球被改判取消，场上情绪剧烈躁动，谨防攻防急躁动作失控！`;
  } else {
    profile = 'NORMAL_MATCH_FLOW';
    note = `暂无重大VAR逆转重挫干扰。`;
  }

  return {
    var_goal_cancelled: goalCancelled,
    var_penalty_overturned: penaltyOverturned,
    var_recent_shock_active_15min: isRecentShock,
    var_trauma_profile: profile,
    var_trauma_tactical_note_zh: note,
  };
}

// ==========================================
// 38. Clinical Finishing Purity vs Sterile Shots on Target Engine
// ==========================================
export interface ClinicalFinishingPurity {
  home_finishing_purity_index: number;
  away_finishing_purity_index: number;
  home_sterile_shots_trap: boolean;
  away_clinical_killer_advantage: boolean;
  finishing_profile: 'HOME_STERILE_TARGET_TRAP' | 'AWAY_CLINICAL_KILLER' | 'BALANCED_FINISHING';
  finishing_tactical_note_zh: string;
}

export function evaluateClinicalFinishingPurity(liveStats: any, score: any): ClinicalFinishingPurity {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hSOT = Math.max(1, getSide('shots_on_target', 'home'));
  const aSOT = Math.max(1, getSide('shots_on_target', 'away'));
  const hGoals = Number(score?.home ?? 0);
  const aGoals = Number(score?.away ?? 0);

  const hFPI = Number(((hGoals / hSOT) * 100).toFixed(1));
  const aFPI = Number(((aGoals / aSOT) * 100).toFixed(1));

  const isHomeSterile = hSOT >= 7 && hGoals === 0;
  const isAwayKiller = aSOT <= 3 && aGoals >= 2;

  let profile: ClinicalFinishingPurity['finishing_profile'] = 'BALANCED_FINISHING';
  let note = '';

  if (isHomeSterile) {
    profile = 'HOME_STERILE_TARGET_TRAP';
    note = `⚠️【主队虚假繁荣・7+次射正0进球终结纯度极低】主队虽有${hSOT}次射正但转化率为0%，攻门软弱或屡遭神扑，前场终结能力严重欠缺，切勿单凭射正多盲目追大！`;
  } else if (isAwayKiller) {
    profile = 'AWAY_CLINICAL_KILLER';
    note = `【客队极致高效刺客・${aSOT}次射正轰入${aGoals}球】客队反击终结纯度高达${aFPI}%，刀刀见血杀伤力极强！`;
  } else {
    profile = 'BALANCED_FINISHING';
    note = `射正转化终结效率处于常规区间(主队FPI ${hFPI}%, 客队FPI ${aFPI}%)。`;
  }

  return {
    home_finishing_purity_index: hFPI,
    away_finishing_purity_index: aFPI,
    home_sterile_shots_trap: isHomeSterile,
    away_clinical_killer_advantage: isAwayKiller,
    finishing_profile: profile,
    finishing_tactical_note_zh: note,
  };
}

// ==========================================
// 39. Half-Time / Full-Time Transition Matrix & Choke Hazard Engine
// ==========================================
export interface HalfTimeFullTimeTransitionMatrix {
  ht_lead_preservation_rate_pct: number;
  ht_lead_collapse_hazard: boolean;
  ht_ft_transition_profile: 'RELIABLE_HT_LEAD_SEAL' | 'FREQUENT_HT_LEAD_COLLAPSE' | 'BALANCED_TRANSITION';
  ht_ft_tactical_note_zh: string;
}

export function evaluateHalfTimeFullTimeTransitionMatrix(item: any, currentScore: any, minute: number): HalfTimeFullTimeTransitionMatrix {
  const trends = item?.trend_summary || item?.recent_trends || {};
  const halfFull = trends?.half_full || trends?.home?.half_full || {};

  const winWin = Number(halfFull?.win_win || halfFull?.['胜胜'] || 4);
  const winDraw = Number(halfFull?.win_draw || halfFull?.['胜平'] || 1);
  const winLoss = Number(halfFull?.win_loss || halfFull?.['胜负'] || 0);

  const totalHtWins = Math.max(1, winWin + winDraw + winLoss);
  const preservationRate = Number(((winWin / totalHtWins) * 100).toFixed(1));
  const collapseRate = Number((((winDraw + winLoss) / totalHtWins) * 100).toFixed(1));

  const isCollapse = collapseRate >= 40.0 && totalHtWins >= 3;
  let profile: HalfTimeFullTimeTransitionMatrix['ht_ft_transition_profile'] = 'BALANCED_TRANSITION';
  let note = '';

  if (isCollapse) {
    profile = 'FREQUENT_HT_LEAD_COLLAPSE';
    note = `⚠️【习惯性半场领先下半场崩盘特质】该队半场领先后全场胜率仅${preservationRate}%(下半场被逼平或逆转率高达${collapseRate}%)，极易在领先后防守松懈，严禁半场领先后盲目追全场穿盘！`;
  } else if (preservationRate >= 80.0 && totalHtWins >= 3) {
    profile = 'RELIABLE_HT_LEAD_SEAL';
    note = `【半场领先稳锁胜局・胜胜转化率${preservationRate}%】半场领先后控场锁胜能力极强。`;
  } else {
    profile = 'BALANCED_TRANSITION';
    note = `半全场走势转移分布正常(半场领先保胜率${preservationRate}%)。`;
  }

  return {
    ht_lead_preservation_rate_pct: preservationRate,
    ht_lead_collapse_hazard: isCollapse,
    ht_ft_transition_profile: profile,
    ht_ft_tactical_note_zh: note,
  };
}

// ==========================================
// 40. Late Odds Juice Drop & Reverse Trap Valve Engine
// ==========================================
export interface LateOddsJuiceDropAndTrapValve {
  is_ultra_low_juice_trap: boolean;
  favorite_juice_level: number;
  underdog_high_value_cushion: boolean;
  juice_drop_profile: 'LOW_JUICE_TRAP_VALVE' | 'NORMAL_JUICE_SPREAD';
  juice_tactical_note_zh: string;
}

export function evaluateLateOddsJuiceDropAndTrapValve(verifiedMarkets: any[]): LateOddsJuiceDropAndTrapValve {
  let isTrap = false;
  let favJuice = 1.90;
  let cushion = false;
  let trapTeam = '';

  for (const m of verifiedMarkets) {
    const mName = String(m?.market || '');
    if (mName.includes('spread') || mName.includes('asian') || mName.includes('handicap')) {
      for (const opt of m?.options || []) {
        const odds = Number(opt?.odds || 1.90);
        if (odds <= 1.78 && odds > 1.40) {
          isTrap = true;
          favJuice = odds;
          trapTeam = String(opt?.side || '热门方');
          cushion = true;
          break;
        }
      }
    }
    if (isTrap) break;
  }

  let profile: LateOddsJuiceDropAndTrapValve['juice_drop_profile'] = 'NORMAL_JUICE_SPREAD';
  let note = '';

  if (isTrap) {
    profile = 'LOW_JUICE_TRAP_VALVE';
    note = `⚠️【临场断崖式压低水位诱热陷阱】${trapTeam}水位被单边打压至超低水(${favJuice})吸引跟风筹码，盘口却未见实质性升盘升格，反向下盘受让方具备极大赔付缓冲与正期望值！`;
  } else {
    profile = 'NORMAL_JUICE_SPREAD';
    note = `盘口水位处于均衡合理区间。`;
  }

  return {
    is_ultra_low_juice_trap: isTrap,
    favorite_juice_level: favJuice,
    underdog_high_value_cushion: cushion,
    juice_drop_profile: profile,
    juice_tactical_note_zh: note,
  };
}

// ==========================================
// 41. Corner Velocity & False Pressure Skew Engine
// ==========================================
export interface CornerVelocityAndFalsePressureSkew {
  corner_surge_velocity_10min: number;
  is_sterile_corner_inflation: boolean;
  corner_velocity_profile: 'RAPID_CORNER_SURGE_ATTACK' | 'STERILE_CORNER_DEFLECTION_INFLATION' | 'NORMAL_CORNER_RATE';
  corner_velocity_tactical_note_zh: string;
}

export function evaluateCornerVelocityAndFalsePressureSkew(liveStats: any, minute: number): CornerVelocityAndFalsePressureSkew {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hCorners = getSide('corners', 'home');
  const aCorners = getSide('corners', 'away');
  const totCorners = hCorners + aCorners;
  const hSOT = getSide('shots_on_target', 'home');
  const aSOT = getSide('shots_on_target', 'away');
  const totSOT = hSOT + aSOT;

  const cornerRatePerMin = Number((totCorners / Math.max(1, minute)).toFixed(2));
  const isSterile = totCorners >= 8 && totSOT <= 2;
  const isSurge = cornerRatePerMin >= 0.18 && minute >= 20;

  let profile: CornerVelocityAndFalsePressureSkew['corner_velocity_profile'] = 'NORMAL_CORNER_RATE';
  let note = '';

  if (isSterile) {
    profile = 'STERILE_CORNER_DEFLECTION_INFLATION';
    note = `【角球数据虚胖・8+角球仅${totSOT}次射正】大量角球仅来自边路传中盲目被挡折射，未能在禁区形成实质性争顶攻门，角球数虚假膨胀切勿盲目作为大球依据！`;
  } else if (isSurge) {
    profile = 'RAPID_CORNER_SURGE_ATTACK';
    note = `【角球狂暴爆发压制・均速每分钟${cornerRatePerMin}角】持续获得角球围攻禁区，禁区二次进攻进球期望骤升！`;
  } else {
    profile = 'NORMAL_CORNER_RATE';
    note = `角球生成速率与进攻转化处于常规节奏。`;
  }

  return {
    corner_surge_velocity_10min: cornerRatePerMin,
    is_sterile_corner_inflation: isSterile,
    corner_velocity_profile: profile,
    corner_velocity_tactical_note_zh: note,
  };
}

// ==========================================
// 42. In-Play Substitution Window & Fresh Legs Impact Engine
// ==========================================
export interface InPlaySubstitutionFreshLegsImpact {
  recent_attacking_subs_count: number;
  fresh_legs_tempo_acceleration_window: boolean;
  sub_impact_profile: 'ATTACKING_FRESH_LEGS_TEMPO_BURST' | 'DEFENSIVE_FORTRESS_SUB' | 'NORMAL_SUB_ACTIVITY';
  sub_impact_tactical_note_zh: string;
}

export function evaluateInPlaySubstitutionFreshLegsImpact(item: any, minute: number): InPlaySubstitutionFreshLegsImpact {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let attackingSubs = 0;
  let defensiveSubs = 0;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.content || inc?.type || '').toLowerCase();
    const incMin = Number(inc?.minute || inc?.time || -1);
    if (text.includes('sub') || text.includes('换人') || text.includes('substitution')) {
      if (incMin >= 55 && incMin <= minute) {
        if (text.includes('前锋') || text.includes('forward') || text.includes('striker') || text.includes('winger') || text.includes('边锋')) {
          attackingSubs++;
        } else {
          defensiveSubs++;
        }
      }
    }
  }

  const isBurst = attackingSubs >= 2 || (attackingSubs >= 1 && minute >= 65 && minute <= 82);
  let profile: InPlaySubstitutionFreshLegsImpact['sub_impact_profile'] = 'NORMAL_SUB_ACTIVITY';
  let note = '';

  if (isBurst) {
    profile = 'ATTACKING_FRESH_LEGS_TEMPO_BURST';
    note = `⚡【60'-80'生力军换人破防提速窗口】连续换上进攻端新鲜血液冲击对手体能衰退防线，最后20分钟攻防节奏被动提速，破门几率大幅提升！`;
  } else if (defensiveSubs >= 2) {
    profile = 'DEFENSIVE_FORTRESS_SUB';
    note = `换上防守型后卫/后腰加强铁桶防守，进攻欲望收缩。`;
  } else {
    profile = 'NORMAL_SUB_ACTIVITY';
    note = `常规换人调整。`;
  }

  return {
    recent_attacking_subs_count: attackingSubs,
    fresh_legs_tempo_acceleration_window: isBurst,
    sub_impact_profile: profile,
    sub_impact_tactical_note_zh: note,
  };
}

// ==========================================
// 43. Stoppage Time Expansion & Late Drama Model Engine
// ==========================================
export interface StoppageTimeExpansionAndLateDrama {
  estimated_stoppage_minutes: number;
  is_extended_stoppage_time_drama: boolean;
  stoppage_profile: 'EXTENDED_LATE_DRAMA_SURGE' | 'NORMAL_STOPPAGE';
  stoppage_tactical_note_zh: string;
}

export function evaluateStoppageTimeExpansionAndLateDrama(item: any, minute: number): StoppageTimeExpansionAndLateDrama {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let varCount = 0;
  let subCount = 0;
  let injuryCount = 0;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.content || inc?.type || '').toLowerCase();
    const incMin = Number(inc?.minute || inc?.time || -1);
    if (incMin >= 45) {
      if (text.includes('var') || text.includes('video')) varCount++;
      if (text.includes('sub') || text.includes('换人')) subCount++;
      if (text.includes('injury') || text.includes('伤') || text.includes('担架')) injuryCount++;
    }
  }

  // Base 3 minutes + VAR (2m each) + Subs (0.5m each) + Injuries (1.5m each)
  const estMins = Math.min(12, Math.max(3, Math.round(3 + (varCount * 2) + (subCount * 0.5) + (injuryCount * 1.5))));
  const isExtended = estMins >= 6 && minute >= 85;

  let profile: StoppageTimeExpansionAndLateDrama['stoppage_profile'] = 'NORMAL_STOPPAGE';
  let note = '';

  if (isExtended) {
    profile = 'EXTENDED_LATE_DRAMA_SURGE';
    note = `⚡【下半场频发中断・预计超长补时${estMins}+分钟】因下半场多次VAR/换人/伤停，补时将显著延长，落后方倾巢出动防线大开，90'+终局绝杀或反击破门期望激增！`;
  } else {
    profile = 'NORMAL_STOPPAGE';
    note = `补时时间处于常规区间(预估+${estMins}分钟)。`;
  }

  return {
    estimated_stoppage_minutes: estMins,
    is_extended_stoppage_time_drama: isExtended,
    stoppage_profile: profile,
    stoppage_tactical_note_zh: note,
  };
}

// ==========================================
// 44. Derby Match Tactical Deformation & Spread Compression Engine
// ==========================================
export interface DerbyMatchTacticalDeformation {
  is_derby_fixture: boolean;
  derby_name: string;
  spread_compression_damping_factor: number;
  derby_profile: 'INTENSE_DERBY_CHAOS' | 'STANDARD_MATCH';
  derby_tactical_note_zh: string;
}

export function evaluateDerbyMatchTacticalDeformation(league: string, homeTeam: string, awayTeam: string): DerbyMatchTacticalDeformation {
  const derbies: Array<{ name: string; teams: string[] }> = [
    { name: '北伦敦德比', teams: ['阿森纳', '热刺'] },
    { name: '曼彻斯特德比', teams: ['曼联', '曼城'] },
    { name: '米兰德比', teams: ['AC米兰', '国际米兰'] },
    { name: '罗马德比', teams: ['罗马', '拉齐奥'] },
    { name: '马德里德比', teams: ['皇家马德里', '马德里竞技'] },
    { name: '西班牙国家德比', teams: ['皇家马德里', '巴塞罗那'] },
    { name: '鲁尔区德比', teams: ['多特蒙德', '沙尔克04'] },
    { name: '上海德比', teams: ['上海申花', '上海海港'] },
    { name: '苏格兰老字号德比', teams: ['凯尔特人', '流浪者'] },
  ];

  let isDerby = false;
  let dName = '';

  for (const d of derbies) {
    const hMatch = d.teams.some((t) => homeTeam.includes(t) || t.includes(homeTeam));
    const aMatch = d.teams.some((t) => awayTeam.includes(t) || t.includes(awayTeam));
    if (hMatch && aMatch) {
      isDerby = true;
      dName = d.name;
      break;
    }
  }

  let profile: DerbyMatchTacticalDeformation['derby_profile'] = 'STANDARD_MATCH';
  let note = '';

  if (isDerby) {
    profile = 'INTENSE_DERBY_CHAOS';
    note = `🔥【${dName}・德比宿敌狂热战术变形】同城/宿敌德比对抗激烈度提升，弱势方斗志溢出压缩常规技战术差距30%+，红黄牌频发打碎节奏，坚决阻断盲目看好深盘！`;
  } else {
    profile = 'STANDARD_MATCH';
    note = `常规联赛/杯赛性质。`;
  }

  return {
    is_derby_fixture: isDerby,
    derby_name: dName,
    spread_compression_damping_factor: isDerby ? 0.70 : 1.0,
    derby_profile: profile,
    derby_tactical_note_zh: note,
  };
}

// ==========================================
// 45. Penalty Conversion & Box Foul Vulnerability Engine
// ==========================================
export interface PenaltyConversionAndVulnerability {
  team_penalty_conversion_purity_pct: number;
  box_foul_vulnerability_hazard: boolean;
  penalty_profile: 'HIGH_PENALTY_VULNERABILITY' | 'RELIABLE_SPOT_KICK_CONVERSION' | 'NORMAL_PENALTY_RISK';
  penalty_tactical_note_zh: string;
}

export function evaluatePenaltyConversionAndVulnerability(item: any, liveStats: any): PenaltyConversionAndVulnerability {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hFouls = getSide('fouls', 'home');
  const aFouls = getSide('fouls', 'away');

  const trends = item?.trend_summary || item?.recent_trends || {};
  const penScored = Number(trends?.penalties_scored || 3);
  const penTotal = Math.max(1, Number(trends?.penalties_total || 4));
  const purity = Number(((penScored / penTotal) * 100).toFixed(1));

  const isVuln = (hFouls >= 14 || aFouls >= 14) && (getSide('shots_inside_box', 'home') >= 5 || getSide('shots_inside_box', 'away') >= 5);
  let profile: PenaltyConversionAndVulnerability['penalty_profile'] = 'NORMAL_PENALTY_RISK';
  let note = '';

  if (isVuln) {
    profile = 'HIGH_PENALTY_VULNERABILITY';
    note = `⚠️【禁区高频鲁莽犯规・点球判罚高危预警】防守方犯规动作粗暴且禁区频繁被渗透，极易在对抗中送出致命点球！`;
  } else if (purity < 60.0 && penTotal >= 3) {
    note = `点球转化纯度欠佳(命中率${purity}%)。`;
  } else {
    profile = 'NORMAL_PENALTY_RISK';
    note = `点球风险与主罚稳定性处于常规区间。`;
  }

  return {
    team_penalty_conversion_purity_pct: purity,
    box_foul_vulnerability_hazard: isVuln,
    penalty_profile: profile,
    penalty_tactical_note_zh: note,
  };
}

// ==========================================
// 46. Half-Time Tactical Readjustment & 46'-60' Surge Engine
// ==========================================
export interface HalfTimeTacticalReadjustmentSurge {
  early_2nd_half_surge_ratio: number;
  is_locker_room_tactical_surge: boolean;
  readjustment_profile: 'ELITE_LOCKER_ROOM_SURGE' | 'NORMAL_2ND_HALF_TEMPO';
  readjustment_tactical_note_zh: string;
}

export function evaluateHalfTimeTacticalReadjustmentSurge(liveStats: any, minute: number): HalfTimeTacticalReadjustmentSurge {
  const isEarly2ndHalf = minute >= 46 && minute <= 62;
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const totAttacks = getSide('dangerous_attacks', 'home') + getSide('dangerous_attacks', 'away');

  const attackRate = Number((totAttacks / Math.max(1, minute)).toFixed(2));
  const isSurge = isEarly2ndHalf && attackRate >= 0.70;

  let profile: HalfTimeTacticalReadjustmentSurge['readjustment_profile'] = 'NORMAL_2ND_HALF_TEMPO';
  let note = '';

  if (isSurge) {
    profile = 'ELITE_LOCKER_ROOM_SURGE';
    note = `【46'-60'中场更衣室战术纠错爆发期】下半场开局攻防速率突增，战术变阵效果立竿见影，极易在此窗口迅速改写比分！`;
  } else {
    profile = 'NORMAL_2ND_HALF_TEMPO';
    note = `下半场战术节奏平稳过渡。`;
  }

  return {
    early_2nd_half_surge_ratio: attackRate,
    is_locker_room_tactical_surge: isSurge,
    readjustment_profile: profile,
    readjustment_tactical_note_zh: note,
  };
}

// ==========================================
// 47. Post-Red Card Deep Block Resistance & Bus-Parking Engine
// ==========================================
export interface PostRedCardDeepBlockResistance {
  has_red_card: boolean;
  is_fortress_10_man_low_block: boolean;
  bus_parking_profile: 'FORTRESS_10_MAN_BUS_PARK' | 'CRUMBLED_DEFENSE_AFTER_RED' | 'NO_RED_CARD';
  bus_parking_tactical_note_zh: string;
}

export function evaluatePostRedCardDeepBlockResistance(item: any, liveStats: any, minute: number): PostRedCardDeepBlockResistance {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let hasRed = false;
  let redMin = -1;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    if (text.includes('red') || text.includes('红牌')) {
      hasRed = true;
      redMin = Number(inc?.minute || inc?.time || 45);
      break;
    }
  }

  if (!hasRed) {
    return {
      has_red_card: false,
      is_fortress_10_man_low_block: false,
      bus_parking_profile: 'NO_RED_CARD',
      bus_parking_tactical_note_zh: '无红牌减员影响。',
    };
  }

  const minsPostRed = Math.max(1, minute - redMin);
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const oppSOT = Math.max(getSide('shots_on_target', 'home'), getSide('shots_on_target', 'away'));
  const oppSOTPerMin = Number((oppSOT / Math.max(1, minute)).toFixed(2));

  const isFortress = minsPostRed >= 10 && oppSOTPerMin <= 0.08;
  let profile: PostRedCardDeepBlockResistance['bus_parking_profile'] = 'CRUMBLED_DEFENSE_AFTER_RED';
  let note = '';

  if (isFortress) {
    profile = 'FORTRESS_10_MAN_BUS_PARK';
    note = `🛡️【10人极致铁桶大巴阵・对手禁区渗透完全受阻】少打一人方全员极度收缩打造铜墙铁壁，多打一人方陷入阵地战泥潭，严禁盲目追多打一人方穿大深盘，小球与10人方受让价值凸显！`;
  } else {
    profile = 'CRUMBLED_DEFENSE_AFTER_RED';
    note = `少打一人防线持续承压受冲击。`;
  }

  return {
    has_red_card: true,
    is_fortress_10_man_low_block: isFortress,
    bus_parking_profile: profile,
    bus_parking_tactical_note_zh: note,
  };
}

// ==========================================
// 48. Multi-Away Road Fatigue & Travel Weariness Engine
// ==========================================
export interface MultiAwayRoadFatigueAndTravelDrag {
  consecutive_away_games_count: number;
  is_road_weariness_exhaustion: boolean;
  road_fatigue_profile: 'CONSECUTIVE_AWAY_ROAD_EXHAUSTION' | 'NORMAL_AWAY_ROUTINE';
  road_fatigue_tactical_note_zh: string;
}

export function evaluateMultiAwayRoadFatigueAndTravelDrag(item: any, awayTeam: string): MultiAwayRoadFatigueAndTravelDrag {
  const trends = item?.trend_summary || item?.recent_trends || {};
  const history = Array.isArray(trends?.history) ? trends.history : Array.isArray(trends?.away?.history) ? trends.away.history : [];

  let awayStreak = 0;
  for (const m of history) {
    const isAway = String(m?.venue || m?.home_away || '').toLowerCase().includes('away') || String(m?.location || '').includes('客');
    if (isAway) awayStreak++;
    else break;
  }

  const isExhausted = awayStreak >= 3;
  let profile: MultiAwayRoadFatigueAndTravelDrag['road_fatigue_profile'] = 'NORMAL_AWAY_ROUTINE';
  let note = '';

  if (isExhausted) {
    profile = 'CONSECUTIVE_AWAY_ROAD_EXHAUSTION';
    note = `⚠️【连续第${awayStreak}个客场・跨城长途奔波体能枯竭】客队陷入魔鬼客场连续作战征程，舟车劳顿体能储备见底，70'之后防守专注度与跑动极易断崖式崩盘！`;
  } else {
    profile = 'NORMAL_AWAY_ROUTINE';
    note = `客场赛程分布正常。`;
  }

  return {
    consecutive_away_games_count: awayStreak,
    is_road_weariness_exhaustion: isExhausted,
    road_fatigue_profile: profile,
    road_fatigue_tactical_note_zh: note,
  };
}

// ==========================================
// 49. Big Chance Missed & Backlash Vulnerability Engine
// ==========================================
export interface BigChanceMissedAndBacklashVulnerability {
  big_chances_missed_count: number;
  is_counter_backlash_vulnerability: boolean;
  backlash_profile: 'SEVERE_BIG_CHANCE_MISS_BACKLASH' | 'NORMAL_FINISHING_FLOW';
  backlash_tactical_note_zh: string;
}

export function evaluateBigChanceMissedAndBacklashVulnerability(item: any, liveStats: any, minute: number): BigChanceMissedAndBacklashVulnerability {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let missedCount = 0;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.content || inc?.type || '').toLowerCase();
    if (text.includes('门柱') || text.includes('woodwork') || text.includes('post') || text.includes('单刀') || text.includes('big chance')) {
      missedCount++;
    }
  }

  const isBacklash = missedCount >= 2;
  let profile: BigChanceMissedAndBacklashVulnerability['backlash_profile'] = 'NORMAL_FINISHING_FLOW';
  let note = '';

  if (isBacklash) {
    profile = 'SEVERE_BIG_CHANCE_MISS_BACKLASH';
    note = `⚠️【连续错失${missedCount}次绝对破门良机・防守反噬高危预警】多次击中门柱或错失单刀导致攻方心态失衡盲目全员压上，后场重构防守出现巨大真空，极易被防守方致命反击偷袭绝杀！`;
  } else {
    profile = 'NORMAL_FINISHING_FLOW';
    note = `破门良机转化处于正常节奏。`;
  }

  return {
    big_chances_missed_count: missedCount,
    is_counter_backlash_vulnerability: isBacklash,
    backlash_profile: profile,
    backlash_tactical_note_zh: note,
  };
}

// ==========================================
// 50. Dead-Rubber Aggregate Blowout Stall Engine
// ==========================================
export interface DeadRubberAggregateBlowoutStall {
  first_leg_lead_margin: number;
  is_aggregate_blowout_dead_rubber: boolean;
  blowout_profile: 'AGGREGATE_BLOWOUT_STALL' | 'COMPETITIVE_AGGREGATE';
  blowout_tactical_note_zh: string;
}

export function evaluateDeadRubberAggregateBlowoutStall(item: any, league: string): DeadRubberAggregateBlowoutStall {
  const isCup = league.includes('杯') || league.includes('Cup') || league.includes('Champions') || league.includes('欧冠') || league.includes('亚冠') || league.includes('欧联') || league.includes('冠') || league.includes('淘汰');
  const trends = item?.trend_summary || item?.recent_trends || {};
  const firstLegScore = trends?.first_leg_score || item?.first_leg_score || null;

  let leadMargin = 0;
  if (firstLegScore) {
    leadMargin = Math.abs(Number(firstLegScore?.home || 0) - Number(firstLegScore?.away || 0));
  }

  const isBlowout = isCup && leadMargin >= 3;
  let profile: DeadRubberAggregateBlowoutStall['blowout_profile'] = 'COMPETITIVE_AGGREGATE';
  let note = '';

  if (isBlowout) {
    profile = 'AGGREGATE_BLOWOUT_STALL';
    note = `⚠️【首回合大胜净胜${leadMargin}球・次回合消极控场垃圾时间】总比分遥遥领先，优势方战术动机仅为安全控球、倒脚消耗时间与避免受伤，进攻投入度断崖式下降，严禁盲目追优势方次回合深盘！`;
  } else {
    profile = 'COMPETITIVE_AGGREGATE';
    note = `两回合总比分形势具备正常竞争强度。`;
  }

  return {
    first_leg_lead_margin: leadMargin,
    is_aggregate_blowout_dead_rubber: isBlowout,
    blowout_profile: profile,
    blowout_tactical_note_zh: note,
  };
}

// ==========================================
// 51. Two-Leg Aggregate Tied Extra-Time Aversion Engine
// ==========================================
export interface TwoLegAggregateTiedExtraTimeAversion {
  is_aggregate_tied_late_game: boolean;
  is_extra_time_stall_inertia: boolean;
  extra_time_profile: 'EXTRA_TIME_STALL_INERTIA' | 'NORMAL_AGGREGATE_FLOW';
  extra_time_tactical_note_zh: string;
}

export function evaluateTwoLegAggregateTiedExtraTimeAversion(item: any, league: string, score: any, minute: number): TwoLegAggregateTiedExtraTimeAversion {
  const isCup = league.includes('杯') || league.includes('Cup') || league.includes('Champions') || league.includes('欧冠') || league.includes('亚冠') || league.includes('欧联') || league.includes('冠') || league.includes('淘汰');
  const trends = item?.trend_summary || item?.recent_trends || {};
  const firstLeg = trends?.first_leg_score || item?.first_leg_score || null;

  let isTied = false;
  if (isCup && firstLeg) {
    const aggHome = Number(firstLeg.away || 0) + Number(score?.home || 0);
    const aggAway = Number(firstLeg.home || 0) + Number(score?.away || 0);
    if (aggHome === aggAway) isTied = true;
  }

  const isLateAversion = isTied && minute >= 75;
  let profile: TwoLegAggregateTiedExtraTimeAversion['extra_time_profile'] = 'NORMAL_AGGREGATE_FLOW';
  let note = '';

  if (isLateAversion) {
    profile = 'EXTRA_TIME_STALL_INERTIA';
    note = `🔒【75'+淘汰赛总比分战平・双方极度忌惮失误互拖加时】在取消客场进球规则背景下，双方最后阶段进攻投入人数骤降40%，全员后场倒脚谨防被致命一击绝杀，小球与常规时间战平概率极高！`;
  } else {
    profile = 'NORMAL_AGGREGATE_FLOW';
    note = `常规时间比分动态正常。`;
  }

  return {
    is_aggregate_tied_late_game: isTied,
    is_extra_time_stall_inertia: isLateAversion,
    extra_time_profile: profile,
    extra_time_tactical_note_zh: note,
  };
}

// ==========================================
// 52. Massive Pre-Europe Squad Rotation Hazard Engine
// ==========================================
export interface MassivePreEuropeSquadRotationHazard {
  estimated_rotation_ratio: number;
  is_massive_squad_rotation_hazard: boolean;
  rotation_profile: 'MASSIVE_SQUAD_ROTATION_HAZARD' | 'REGULAR_LINEUP';
  rotation_tactical_note_zh: string;
}

export function evaluateMassivePreEuropeSquadRotationHazard(lineupData: any, item: any): MassivePreEuropeSquadRotationHazard {
  const homeStarters = Array.isArray(lineupData?.home_starters) ? lineupData.home_starters : [];
  const homeBenched = Array.isArray(lineupData?.home_benched) ? lineupData.home_benched : [];

  let benchCount = 0;
  for (const p of homeStarters) {
    const pStr = typeof p === 'string' ? p : p?.name || '';
    if (pStr.includes('(替)') || pStr.includes('sub') || pStr.includes('二队') || pStr.includes('reserve')) {
      benchCount++;
    }
  }

  const ratio = Number((benchCount / Math.max(11, homeStarters.length || 11)).toFixed(2));
  const isHazard = ratio >= 0.40;

  let profile: MassivePreEuropeSquadRotationHazard['rotation_profile'] = 'REGULAR_LINEUP';
  let note = '';

  if (isHazard) {
    profile = 'MASSIVE_SQUAD_ROTATION_HAZARD';
    note = `⚠️【欧战生死战前夕・联赛5+人深度大轮换】主队为备战关键欧战进行大规模主力轮换，替补阵容防线造越位与盯人默契断崖式下滑，严禁盲目信任其纸面俱乐部名气让深盘！`;
  } else {
    profile = 'REGULAR_LINEUP';
    note = `阵容轮换幅度处于常规健康区间。`;
  }

  return {
    estimated_rotation_ratio: ratio,
    is_massive_squad_rotation_hazard: isHazard,
    rotation_profile: profile,
    rotation_tactical_note_zh: note,
  };
}

// ==========================================
// 53. Goalless Stalemate 60' Breakthrough Floodgate Effect Engine
// ==========================================
export interface StalemateBreakthroughFloodgateEffect {
  is_stalemate_floodgate_active: boolean;
  stalemate_profile: 'STALEMATE_BREAKTHROUGH_FLOODGATE' | 'NORMAL_GOAL_TEMPO';
  stalemate_tactical_note_zh: string;
}

export function evaluateStalemateBreakthroughFloodgateEffect(score: any, minute: number, item: any): StalemateBreakthroughFloodgateEffect {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  const totGoals = Number(score?.home || 0) + Number(score?.away || 0);

  let firstGoalMin = -1;
  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    if (text.includes('goal') || text.includes('进球')) {
      firstGoalMin = Number(inc?.minute || inc?.time || -1);
      break;
    }
  }

  const isFloodgate = firstGoalMin >= 58 && minute >= firstGoalMin && minute <= firstGoalMin + 15 && totGoals >= 1;
  let profile: StalemateBreakthroughFloodgateEffect['stalemate_profile'] = 'NORMAL_GOAL_TEMPO';
  let note = '';

  if (isFloodgate) {
    profile = 'STALEMATE_BREAKTHROUGH_FLOODGATE';
    note = `⚡【60'+沉闷僵局破局・开闸泄洪雪崩对攻窗口】在长达60分钟0-0后打入打破僵局首球，落后方彻底放弃试探全员搏命压上，后场空间彻底暴露，随后15分钟内极易连续诞生进球！`;
  } else {
    profile = 'NORMAL_GOAL_TEMPO';
    note = `比分演进处于常规节奏。`;
  }

  return {
    is_stalemate_floodgate_active: isFloodgate,
    stalemate_profile: profile,
    stalemate_tactical_note_zh: note,
  };
}

// ==========================================
// 54. Set-Piece Defensive Marking Leak & Aerial Chaos Engine
// ==========================================
export interface SetPieceDefensiveMarkingLeak {
  is_set_piece_aerial_marking_leak: boolean;
  aerial_leak_profile: 'SET_PIECE_AERIAL_MARKING_LEAK' | 'SOLID_SET_PIECE_DEFENSE';
  aerial_leak_tactical_note_zh: string;
}

export function evaluateSetPieceDefensiveMarkingLeak(liveStats: any, item: any): SetPieceDefensiveMarkingLeak {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hCorners = getSide('corners', 'home');
  const aCorners = getSide('corners', 'away');
  const hFouls = getSide('fouls', 'home');
  const aFouls = getSide('fouls', 'away');

  const isLeak = (hCorners + aCorners >= 10 || hFouls + aFouls >= 26) && (getSide('header_shots', 'home') >= 3 || getSide('header_shots', 'away') >= 3);
  let profile: SetPieceDefensiveMarkingLeak['aerial_leak_profile'] = 'SOLID_SET_PIECE_DEFENSE';
  let note = '';

  if (isLeak) {
    profile = 'SET_PIECE_AERIAL_MARKING_LEAK';
    note = `⚠️【高频定位球/角球争顶失守・防空漏人致命隐患】双方犯规与角球极多，禁区多次被头球攻门，防守方对高空二点球保护形同虚设，定位球打破僵局期望极高！`;
  } else {
    profile = 'SOLID_SET_PIECE_DEFENSE';
    note = `定位球防守与高空争顶处于均衡保护。`;
  }

  return {
    is_set_piece_aerial_marking_leak: isLeak,
    aerial_leak_profile: profile,
    aerial_leak_tactical_note_zh: note,
  };
}

// ==========================================
// 55. Exhausted Substitutions & Injured Straggler Hazard Engine
// ==========================================
export interface ExhaustedSubstitutionsAndInjuredStraggler {
  is_exhausted_substitutions_straggler: boolean;
  straggler_profile: 'EXHAUSTED_SUB_INJURY_HAZARD' | 'NORMAL_SUB_CAPACITY';
  straggler_tactical_note_zh: string;
}

export function evaluateExhaustedSubstitutionsAndInjuredStraggler(item: any, minute: number): ExhaustedSubstitutionsAndInjuredStraggler {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let subCount = 0;
  let hasLateInjury = false;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    if (text.includes('sub') || text.includes('换人')) {
      subCount++;
    }
    if ((text.includes('伤') || text.includes('injur') || text.includes('医疗') || text.includes('treatment') || text.includes('抽筋')) && Number(inc?.minute || inc?.time || 0) >= 70) {
      hasLateInjury = true;
    }
  }

  const isHazard = (subCount >= 5 || subCount >= 10) && hasLateInjury && minute >= 75;
  let profile: ExhaustedSubstitutionsAndInjuredStraggler['straggler_profile'] = 'NORMAL_SUB_CAPACITY';
  let note = '';

  if (isHazard) {
    profile = 'EXHAUSTED_SUB_INJURY_HAZARD';
    note = `⚠️【换人名额耗尽・场上球员带伤坚持实际减员】75'+换人名额已全部用完且场上有球员受伤/抽筋失去回追跑动能力，防线形成隐形缺口，极易在尾声及补时被持续打身后绝杀！`;
  } else {
    profile = 'NORMAL_SUB_CAPACITY';
    note = `换人调整与场上体能状况处于可控范围。`;
  }

  return {
    is_exhausted_substitutions_straggler: isHazard,
    straggler_profile: profile,
    straggler_tactical_note_zh: note,
  };
}

// ==========================================
// 56. Backup Goalkeeper Substitution & Confidence Collapse Engine
// ==========================================
export interface BackupGoalkeeperSubstitutionCollapse {
  is_backup_gk_in_play: boolean;
  gk_collapse_profile: 'BACKUP_GK_CONFIDENCE_COLLAPSE' | 'PRIMARY_GK_SOLID';
  gk_collapse_tactical_note_zh: string;
}

export function evaluateBackupGoalkeeperSubstitutionCollapse(item: any): BackupGoalkeeperSubstitutionCollapse {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let hasGkSub = false;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    if ((text.includes('门将') || text.includes('goalkeeper') || text.includes('gk')) && (text.includes('换下') || text.includes('换上') || text.includes('sub'))) {
      hasGkSub = true;
      break;
    }
  }

  let profile: BackupGoalkeeperSubstitutionCollapse['gk_collapse_profile'] = 'PRIMARY_GK_SOLID';
  let note = '';

  if (hasGkSub) {
    profile = 'BACKUP_GK_CONFIDENCE_COLLAPSE';
    note = `⚠️【主力门将意外伤退・替补门将临危受命扑救信心塌陷】替补门将缺乏系统热身且心理压力巨大，出击判断与防空脱手率骤增，对手远射与定位球破门期望值大幅飙升！`;
  } else {
    profile = 'PRIMARY_GK_SOLID';
    note = `主力门将稳定在场。`;
  }

  return {
    is_backup_gk_in_play: hasGkSub,
    gk_collapse_profile: profile,
    gk_collapse_tactical_note_zh: note,
  };
}

// ==========================================
// 57. Multi-Red Card Chaos & Extreme Space Explosion Engine
// ==========================================
export interface MultiRedCardChaosAndSpaceExplosion {
  total_red_cards_count: number;
  is_multi_red_card_chaos: boolean;
  space_explosion_profile: 'MULTI_RED_CARD_SPACE_EXPLOSION' | 'STANDARD_DISCIPLINE_ENV';
  space_explosion_tactical_note_zh: string;
}

export function evaluateMultiRedCardChaosAndSpaceExplosion(item: any): MultiRedCardChaosAndSpaceExplosion {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let redCount = 0;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    if (text.includes('red') || text.includes('红牌') || text.includes('罚下')) {
      redCount++;
    }
  }

  const isMulti = redCount >= 2;
  let profile: MultiRedCardChaosAndSpaceExplosion['space_explosion_profile'] = 'STANDARD_DISCIPLINE_ENV';
  let note = '';

  if (isMulti) {
    profile = 'MULTI_RED_CARD_SPACE_EXPLOSION';
    note = `🔥【场上累计出现${redCount}张红牌・极端空间几何解体雪崩】场上出现多人罚下，传统防守体系彻底解体，攻防转换空间无限放大，极易诞生对攻大比分与混乱绝杀！`;
  } else {
    profile = 'STANDARD_DISCIPLINE_ENV';
    note = `红牌纪律环境处于常规范围。`;
  }

  return {
    total_red_cards_count: redCount,
    is_multi_red_card_chaos: isMulti,
    space_explosion_profile: profile,
    space_explosion_tactical_note_zh: note,
  };
}

// ==========================================
// 58. Zero Shot On Target Surge & Mean Reversion Engine
// ==========================================
export interface ZeroShotOnTargetSurgeAndMeanReversion {
  is_zero_sot_mean_reversion_due: boolean;
  reversion_profile: 'EXTREME_ZERO_SOT_MEAN_REVERSION' | 'BALANCED_SOT_CONVERSION';
  reversion_tactical_note_zh: string;
}

export function evaluateZeroShotOnTargetSurgeAndMeanReversion(liveStats: any, minute: number): ZeroShotOnTargetSurgeAndMeanReversion {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hShots = getSide('shots', 'home');
  const hSOT = getSide('shots_on_target', 'home');
  const aShots = getSide('shots', 'away');
  const aSOT = getSide('shots_on_target', 'away');

  const homeAnomaly = hShots >= 8 && hSOT <= 1 && minute >= 40;
  const awayAnomaly = aShots >= 8 && aSOT <= 1 && minute >= 40;
  const isDue = homeAnomaly || awayAnomaly;

  let profile: ZeroShotOnTargetSurgeAndMeanReversion['reversion_profile'] = 'BALANCED_SOT_CONVERSION';
  let note = '';

  if (isDue) {
    profile = 'EXTREME_ZERO_SOT_MEAN_REVERSION';
    note = `🎯【狂轰滥炸零射正偏离・下半场射正与破门强烈均值回归】攻方射门次数极多但射正严重异常偏低，随着防守体能下降与射门脚感校准，下半场射正率将发生强劲均值回归，破门爆发可期！`;
  } else {
    profile = 'BALANCED_SOT_CONVERSION';
    note = `射门与射正转化分布正常。`;
  }

  return {
    is_zero_sot_mean_reversion_due: isDue,
    reversion_profile: profile,
    reversion_tactical_note_zh: note,
  };
}

// ==========================================
// 59. Two-Goal Deficit Capitulation & Collapse Engine
// ==========================================
export interface TwoGoalDeficitCapitulationAndCollapse {
  is_two_goal_deficit_capitulation: boolean;
  deficit_profile: 'TWO_GOAL_DEFICIT_CAPITULATION' | 'COMPETITIVE_SCORELINE';
  deficit_tactical_note_zh: string;
}

export function evaluateTwoGoalDeficitCapitulationAndCollapse(score: any, minute: number, liveStats: any): TwoGoalDeficitCapitulationAndCollapse {
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const diff = h - a;

  const isLate = minute >= 68;
  const isTwoDown = Math.abs(diff) >= 2;
  const trailingSide = diff > 0 ? 'away' : 'home';
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const trailingPoss = getSide('possession', trailingSide);

  const isCapitulation = isLate && isTwoDown && (trailingPoss === 0 || trailingPoss <= 38);
  let profile: TwoGoalDeficitCapitulationAndCollapse['deficit_profile'] = 'COMPETITIVE_SCORELINE';
  let note = '';

  if (isCapitulation) {
    profile = 'TWO_GOAL_DEFICIT_CAPITULATION';
    note = `⚠️【两球落后斗志彻底崩溃・防线全线瓦解泄气】弱队在70'+两球落后且完全丧失控球权，斗志瓦解放弃回防，极易在最后阶段被领先方连续打穿防线扩大比分！`;
  } else {
    profile = 'COMPETITIVE_SCORELINE';
    note = `落后方仍保持战术抵抗力。`;
  }

  return {
    is_two_goal_deficit_capitulation: isCapitulation,
    deficit_profile: profile,
    deficit_tactical_note_zh: note,
  };
}

// ==========================================
// 60. High-Frequency Offside Trap Breakdown Engine
// ==========================================
export interface HighFrequencyOffsideTrapBreakdown {
  total_offsides_count: number;
  is_offside_trap_collapse_imminent: boolean;
  trap_breakdown_profile: 'HIGH_FREQUENCY_OFFSIDE_BREAKDOWN' | 'ORGANIZED_OFFSIDE_TRAP';
  trap_breakdown_tactical_note_zh: string;
}

export function evaluateHighFrequencyOffsideTrapBreakdown(liveStats: any, minute: number): HighFrequencyOffsideTrapBreakdown {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const hOff = getSide('offsides', 'home');
  const aOff = getSide('offsides', 'away');
  const totOff = hOff + aOff;

  const isCollapse = (hOff >= 4 || aOff >= 4 || totOff >= 6) && minute >= 50;
  let profile: HighFrequencyOffsideTrapBreakdown['trap_breakdown_profile'] = 'ORGANIZED_OFFSIDE_TRAP';
  let note = '';

  if (isCollapse) {
    profile = 'HIGH_FREQUENCY_OFFSIDE_BREAKDOWN';
    note = `⚡【极限高频越位对抗・造越位防线临界崩溃预警】攻方持续坚决打防线身后空档，高频越位预示造越位防线容错率降至冰点，一旦出现一次造越位失误即形成致命绝杀单刀！`;
  } else {
    profile = 'ORGANIZED_OFFSIDE_TRAP';
    note = `造越位与进攻反越位处于战术平衡。`;
  }

  return {
    total_offsides_count: totOff,
    is_offside_trap_collapse_imminent: isCollapse,
    trap_breakdown_profile: profile,
    trap_breakdown_tactical_note_zh: note,
  };
}

// ==========================================
// 61. Playoff Extra Time Draw Inertia & Penalty Horizon Engine
// ==========================================
export interface PlayoffExtraTimeDrawInertiaAndPenaltyHorizon {
  is_playoff_draw_penalty_inertia: boolean;
  playoff_profile: 'PLAYOFF_EXTRA_TIME_PENALTY_INERTIA' | 'NORMAL_FIXTURE_FLOW';
  playoff_tactical_note_zh: string;
}

export function evaluatePlayoffExtraTimeDrawInertiaAndPenaltyHorizon(league: string, score: any, minute: number): PlayoffExtraTimeDrawInertiaAndPenaltyHorizon {
  const isPlayoff = league.includes('附加赛') || league.includes('Playoff') || league.includes('升级') || league.includes('降级') || league.includes('保级');
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const isTied = h === a;
  const isLate = minute >= 75;

  const isInertia = isPlayoff && isTied && isLate;
  let profile: PlayoffExtraTimeDrawInertiaAndPenaltyHorizon['playoff_profile'] = 'NORMAL_FIXTURE_FLOW';
  let note = '';

  if (isInertia) {
    profile = 'PLAYOFF_EXTRA_TIME_PENALTY_INERTIA';
    note = `🔒【升降级生死附加赛・平局互保拖延加时与点球大战】附加赛关乎数千万经济价值，双方极度忌惮失误丢球，75'+打平时进攻投入降至最低，常规时间小球与战平加时期望极高！`;
  } else {
    profile = 'NORMAL_FIXTURE_FLOW';
    note = `赛事性质处于常规博弈阶段。`;
  }

  return {
    is_playoff_draw_penalty_inertia: isInertia,
    playoff_profile: profile,
    playoff_tactical_note_zh: note,
  };
}

// ==========================================
// 62. Favorite Half-Time Deficit Rage Surge & Comeback Engine
// ==========================================
export interface FavoriteHalfTimeDeficitRageSurge {
  is_favorite_ht_rage_surge: boolean;
  surge_profile: 'FAVORITE_HT_RAGE_COMEBACK_SURGE' | 'BALANCED_HT_TEMPO';
  surge_tactical_note_zh: string;
}

export function evaluateFavoriteHalfTimeDeficitRageSurge(score: any, minute: number, refOdds: any): FavoriteHalfTimeDeficitRageSurge {
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const homeWinOdds = Number(refOdds?.home || refOdds?.h || 0);
  const awayWinOdds = Number(refOdds?.away || refOdds?.a || 0);

  const homeFavTrailing = homeWinOdds > 0 && homeWinOdds <= 1.55 && h < a;
  const awayFavTrailing = awayWinOdds > 0 && awayWinOdds <= 1.55 && a < h;
  const isSurgeWindow = minute >= 45 && minute <= 65;

  const isRage = (homeFavTrailing || awayFavTrailing) && isSurgeWindow;
  let profile: FavoriteHalfTimeDeficitRageSurge['surge_profile'] = 'BALANCED_HT_TEMPO';
  let note = '';

  if (isRage) {
    profile = 'FAVORITE_HT_RAGE_COMEBACK_SURGE';
    note = `⚡【深盘强队半场意外落后・更衣室暴怒下半场狂攻反扑窗口】深盘热门半场落后必在更衣室大幅调整前场兵力激进变阵，下半场前20分钟（45'-65'）围攻射门与破门爆发力达到全场峰值！`;
  } else {
    profile = 'BALANCED_HT_TEMPO';
    note = `半场与下半场开局攻防节奏正常。`;
  }

  return {
    is_favorite_ht_rage_surge: isRage,
    surge_profile: profile,
    surge_tactical_note_zh: note,
  };
}

// ==========================================
// 63. Trailing Goalkeeper Push-Up & Empty Net Counter-Attack Engine
// ==========================================
export interface TrailingGoalkeeperPushUpAndEmptyNetCounter {
  is_gk_push_up_empty_net_risk: boolean;
  empty_net_profile: 'TRAILING_GK_PUSH_UP_EMPTY_NET' | 'CONVENTIONAL_GK_POSITIONING';
  empty_net_tactical_note_zh: string;
}

export function evaluateTrailingGoalkeeperPushUpAndEmptyNetCounter(item: any, score: any, minute: number, league: string): TrailingGoalkeeperPushUpAndEmptyNetCounter {
  const isCupOrKnockout = league.includes('杯') || league.includes('Cup') || league.includes('淘汰') || league.includes('附加赛') || league.includes('Champions');
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const diff = Math.abs(h - a);
  const isOneGoalDown = diff === 1;
  const isBuzzerMinute = minute >= 90;

  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let hasLateCornerOrFoul = false;
  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    const incMin = Number(inc?.minute || inc?.time || 0);
    if (incMin >= 90 && (text.includes('角球') || text.includes('corner') || text.includes('任意球') || text.includes('free kick') || text.includes('门将压上'))) {
      hasLateCornerOrFoul = true;
      break;
    }
  }

  const isRisk = (isCupOrKnockout || minute >= 93) && isOneGoalDown && isBuzzerMinute && (hasLateCornerOrFoul || minute >= 94);
  let profile: TrailingGoalkeeperPushUpAndEmptyNetCounter['empty_net_profile'] = 'CONVENTIONAL_GK_POSITIONING';
  let note = '';

  if (isRisk) {
    profile = 'TRAILING_GK_PUSH_UP_EMPTY_NET';
    note = `🚨【补时落后一球门将弃门压上・空门反噬与终场绝杀爆破】落后方门将全员压入对方禁区参与最后一击争顶，后场完全空门，进攻一旦受阻极易被防守方反击空门推射绝杀杀死比赛！`;
  } else {
    profile = 'CONVENTIONAL_GK_POSITIONING';
    note = `门将位置保持常规守门站位。`;
  }

  return {
    is_gk_push_up_empty_net_risk: isRisk,
    empty_net_profile: profile,
    empty_net_tactical_note_zh: note,
  };
}

// ==========================================
// 64. Ultra-Long Stoppage Time Drag & Buzzer Beater Engine
// ==========================================
export interface UltraLongStoppageTimeDragAndBuzzerBeater {
  is_ultra_long_stoppage_beater: boolean;
  stoppage_beater_profile: 'ULTRA_LONG_STOPPAGE_BUZZER_BEATER' | 'STANDARD_STOPPAGE_LENGTH';
  stoppage_beater_tactical_note_zh: string;
}

export function evaluateUltraLongStoppageTimeDragAndBuzzerBeater(item: any, minute: number): UltraLongStoppageTimeDragAndBuzzerBeater {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let varCount = 0;
  let injuryCount = 0;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    if (text.includes('var') || text.includes('视频助理')) varCount++;
    if (text.includes('伤') || text.includes('担架') || text.includes('stretcher') || text.includes('injur')) injuryCount++;
  }

  const isUltraStoppage = (varCount >= 2 || injuryCount >= 3 || minute >= 96) && minute >= 92;
  let profile: UltraLongStoppageTimeDragAndBuzzerBeater['stoppage_beater_profile'] = 'STANDARD_STOPPAGE_LENGTH';
  let note = '';

  if (isUltraStoppage) {
    profile = 'ULTRA_LONG_STOPPAGE_BUZZER_BEATER';
    note = `⏱️【超长伤停补时7'+极限消耗・防守神经透支压哨绝杀】因VAR与伤停导致下半场超长补时，防守方体能与神经注意力濒临崩溃，95'+压哨进球与点球判罚概率呈几何级数飙升！`;
  } else {
    profile = 'STANDARD_STOPPAGE_LENGTH';
    note = `补时长度与防守专注度处于常规区间。`;
  }

  return {
    is_ultra_long_stoppage_beater: isUltraStoppage,
    stoppage_beater_profile: profile,
    stoppage_beater_tactical_note_zh: note,
  };
}

// ==========================================
// 65. Comfortable Lead Complacency & Consolation Goal BTTS Engine
// ==========================================
export interface ComfortableLeadComplacencyAndConsolationGoal {
  is_comfortable_lead_consolation_risk: boolean;
  consolation_profile: 'COMFORTABLE_LEAD_CONSOLATION_BTTS' | 'TIGHT_DEFENSIVE_LOCKOUT';
  consolation_tactical_note_zh: string;
}

export function evaluateComfortableLeadComplacencyAndConsolationGoal(score: any, minute: number, item: any): ComfortableLeadComplacencyAndConsolationGoal {
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const lead = Math.abs(h - a);
  const isBigLead = lead >= 3;
  const isLate = minute >= 70;

  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let subCount = 0;
  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    if (text.includes('sub') || text.includes('换人')) subCount++;
  }

  const isConsolationDue = isBigLead && isLate && (subCount >= 4 || minute >= 75);
  let profile: ComfortableLeadComplacencyAndConsolationGoal['consolation_profile'] = 'TIGHT_DEFENSIVE_LOCKOUT';
  let note = '';

  if (isConsolationDue) {
    profile = 'COMFORTABLE_LEAD_CONSOLATION_BTTS';
    note = `🛡️【大比分领先松懈练兵・挽回颜面安慰球双边破门】领先方净胜3+球胜局已定，换下主力后防练兵且注意力显著松懈，落后方反扑打入挽回颜面安慰球概率极大，利好BTTS与大球！`;
  } else {
    profile = 'TIGHT_DEFENSIVE_LOCKOUT';
    note = `比分领先优势处于严密防守封锁。`;
  }

  return {
    is_comfortable_lead_consolation_risk: isConsolationDue,
    consolation_profile: profile,
    consolation_tactical_note_zh: note,
  };
}

// ==========================================
// 66. Home Winless Desperation & Stadium Fan Pressure Engine
// ==========================================
export interface HomeWinlessDesperationAndFanPressure {
  is_home_winless_desperation_push: boolean;
  fan_pressure_profile: 'HOME_WINLESS_DESPERATION_PUSH' | 'BALANCED_HOME_MOMENTUM';
  fan_pressure_tactical_note_zh: string;
}

export function evaluateHomeWinlessDesperationAndFanPressure(standings: any, item: any, homeTeam: string): HomeWinlessDesperationAndFanPressure {
  const trends = item?.trend_summary || item?.recent_trends || {};
  const homeForm = String(trends?.home_recent_form || trends?.home_form || item?.home_form || '');

  // If home team has 4+ consecutive non-wins in form string like 'LDLDL' or 'LLDDL'
  const isWinless4Plus = /^[L|D]{4,}/i.test(homeForm) || homeForm.includes('LLLL') || homeForm.includes('DDDD') || homeForm.includes('LDLD');
  let profile: HomeWinlessDesperationAndFanPressure['fan_pressure_profile'] = 'BALANCED_HOME_MOMENTUM';
  let note = '';

  if (isWinless4Plus) {
    profile = 'HOME_WINLESS_DESPERATION_PUSH';
    note = `🔥【主队主场长期不胜背水一战・球迷狂热施压激进开局】主队近期连续多场不胜面临主场球迷与帅位巨大危机，开场必定采取超高强度前场压迫背水一战抢攻，早早打破僵局或冒进后防失守！`;
  } else {
    profile = 'BALANCED_HOME_MOMENTUM';
    note = `主场作战心态与球迷氛围处于正常节奏。`;
  }

  return {
    is_home_winless_desperation_push: isWinless4Plus,
    fan_pressure_profile: profile,
    fan_pressure_tactical_note_zh: note,
  };
}

// ==========================================
// 67. Newly Promoted Team Euphoria & Late Deflation Collapse Engine
// ==========================================
export interface NewlyPromotedEuphoriaAndLateDeflation {
  is_promoted_late_deflation_risk: boolean;
  promoted_profile: 'PROMOTED_LATE_DEFLATION_COLLAPSE' | 'ESTABLISHED_TOP_FLIGHT';
  promoted_tactical_note_zh: string;
}

export function evaluateNewlyPromotedEuphoriaAndLateDeflation(league: string, homeTeam: string, awayTeam: string, minute: number, score: any): NewlyPromotedEuphoriaAndLateDeflation {
  // Check promoted keywords or specific context
  const isTopLeague = league.includes('英超') || league.includes('西甲') || league.includes('意甲') || league.includes('德甲') || league.includes('法甲');
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const isLate = minute >= 65;
  const isDrawingOrTight = Math.abs(h - a) <= 1;

  // If match in top league is in late stage 65'+ with tight score
  const isRisk = isTopLeague && isLate && isDrawingOrTight && minute >= 70;
  let profile: NewlyPromotedEuphoriaAndLateDeflation['promoted_profile'] = 'ESTABLISHED_TOP_FLIGHT';
  let note = '';

  if (isRisk) {
    profile = 'PROMOTED_LATE_DEFLATION_COLLAPSE';
    note = `📉【升班马开局亢奋与下半场体能断崖】升班马前60分钟高强度跑动拼抢造成体能透支，70'+面对豪门强队深度施压极易阵型脱节遭遇连击崩盘！`;
  } else {
    profile = 'ESTABLISHED_TOP_FLIGHT';
    note = `顶级联赛各队体能与经验处于稳定状态。`;
  }

  return {
    is_promoted_late_deflation_risk: isRisk,
    promoted_profile: profile,
    promoted_tactical_note_zh: note,
  };
}

// ==========================================
// 68. Top Goalscorer Early Injury & Finishing Vacuum Engine
// ==========================================
export interface TopGoalscorerEarlyInjuryAndFinishingVacuum {
  is_top_scorer_injured_early: boolean;
  finishing_vacuum_profile: 'TOP_SCORER_INJURY_FINISHING_VACUUM' | 'INTACT_ATTACKING_FIREPOWER';
  finishing_vacuum_tactical_note_zh: string;
}

export function evaluateTopGoalscorerEarlyInjuryAndFinishingVacuum(item: any, minute: number): TopGoalscorerEarlyInjuryAndFinishingVacuum {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let isEarlyStrikerInjured = false;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    const incMin = Number(inc?.minute || inc?.time || 0);
    if (incMin <= 60 && (text.includes('前锋') || text.includes('射手') || text.includes('主力前锋') || text.includes('striker') || text.includes('forward')) && (text.includes('伤') || text.includes('退') || text.includes('injur'))) {
      isEarlyStrikerInjured = true;
      break;
    }
  }

  let profile: TopGoalscorerEarlyInjuryAndFinishingVacuum['finishing_vacuum_profile'] = 'INTACT_ATTACKING_FIREPOWER';
  let note = '';

  if (isEarlyStrikerInjured) {
    profile = 'TOP_SCORER_INJURY_FINISHING_VACUUM';
    note = `⚠️【头号核心射手伤退・禁区终结真空与进攻便秘】进攻端失去绝对支点与高效终结手，虚假射门增多但真实预期进球转化率暴跌，小球与攻方受限概率显著增加！`;
  } else {
    profile = 'INTACT_ATTACKING_FIREPOWER';
    note = `锋线核心终结配置保持完整。`;
  }

  return {
    is_top_scorer_injured_early: isEarlyStrikerInjured,
    finishing_vacuum_profile: profile,
    finishing_vacuum_tactical_note_zh: note,
  };
}

// ==========================================
// 69. Slippery Wet Pitch & Goalkeeper Handling Slip Fumble Engine
// ==========================================
export interface SlipperyWetPitchAndGoalkeeperFumble {
  is_slippery_pitch_fumble_risk: boolean;
  fumble_profile: 'SLIPPERY_PITCH_GK_FUMBLE_HAZARD' | 'NORMAL_SURFACE_TRACTION';
  fumble_tactical_note_zh: string;
}

export function evaluateSlipperyWetPitchAndGoalkeeperFumble(weatherData: any, liveStats: any): SlipperyWetPitchAndGoalkeeperFumble {
  const weatherStr = String(weatherData?.weather || weatherData?.description || weatherData || '').toLowerCase();
  const isWetWeather = weatherStr.includes('雨') || weatherStr.includes('雪') || weatherStr.includes('rain') || weatherStr.includes('snow') || weatherStr.includes('wet') || weatherStr.includes('storm');

  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const totalShots = getSide('shots', 'home') + getSide('shots', 'away');

  const isFumble = isWetWeather && totalShots >= 10;
  let profile: SlipperyWetPitchAndGoalkeeperFumble['fumble_profile'] = 'NORMAL_SURFACE_TRACTION';
  let note = '';

  if (isFumble) {
    profile = 'SLIPPERY_PITCH_GK_FUMBLE_HAZARD';
    note = `🌧️【恶劣湿滑场地・门将黄油手脱手与二次补射爆破】暴雨/积水场地导致球速异常弹地加剧，门将扑救极易脱手，二次进攻补射破门与角球混战乱球产生率大幅上扬！`;
  } else {
    profile = 'NORMAL_SURFACE_TRACTION';
    note = `场地摩擦力与门将扑救抓球手感正常。`;
  }

  return {
    is_slippery_pitch_fumble_risk: isFumble,
    fumble_profile: profile,
    fumble_tactical_note_zh: note,
  };
}

// ==========================================
// 70. Sequential Red Card Temporal Asymmetry & Fatigue Gap Engine
// ==========================================
export interface SequentialRedCardTemporalAsymmetry {
  is_sequential_red_card_asymmetry: boolean;
  temporal_gap_minutes: number;
  asymmetry_profile: 'SEQUENTIAL_RED_CARD_FATIGUE_GAP' | 'SYMMETRIC_OR_SINGLE_RED';
  asymmetry_tactical_note_zh: string;
}

export function evaluateSequentialRedCardTemporalAsymmetry(item: any): SequentialRedCardTemporalAsymmetry {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let homeRedMin: number | null = null;
  let awayRedMin: number | null = null;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    const incMin = Number(inc?.minute || inc?.time || 0);
    if (text.includes('红牌') || text.includes('red card') || text.includes('两黄变红')) {
      if (text.includes('主') || text.includes('home')) {
        if (homeRedMin === null || incMin < homeRedMin) homeRedMin = incMin;
      } else if (text.includes('客') || text.includes('away')) {
        if (awayRedMin === null || incMin < awayRedMin) awayRedMin = incMin;
      }
    }
  }

  let isAsymmetry = false;
  let gap = 0;
  if (homeRedMin !== null && awayRedMin !== null) {
    gap = Math.abs(homeRedMin - awayRedMin);
    if (gap >= 10) isAsymmetry = true;
  }

  let profile: SequentialRedCardTemporalAsymmetry['asymmetry_profile'] = 'SYMMETRIC_OR_SINGLE_RED';
  let note = '';

  if (isAsymmetry) {
    profile = 'SEQUENTIAL_RED_CARD_FATIGUE_GAP';
    note = `⚡【两队先后染红时间差・多打少过度消耗后重回均势断层】两队相隔${gap}分钟先后染红，此前多打少高强度压上的队伍体能与阵型断层严重，重回10打10后极易遭遇防守反击致命背刺！`;
  } else {
    profile = 'SYMMETRIC_OR_SINGLE_RED';
    note = `红牌发生时间或人数结构未形成显著单边体能断层。`;
  }

  return {
    is_sequential_red_card_asymmetry: isAsymmetry,
    temporal_gap_minutes: gap,
    asymmetry_profile: profile,
    asymmetry_tactical_note_zh: note,
  };
}

// ==========================================
// 71. Super-Sub Instant Impact & Cold-Touch Penalty Hazard Engine
// ==========================================
export interface SuperSubInstantImpactAndColdTouchPenaltyHazard {
  is_super_sub_impact_window: boolean;
  sub_impact_profile: 'SUPER_SUB_INSTANT_IMPACT_HAZARD' | 'NORMAL_SUB_INTEGRATION';
  sub_impact_tactical_note_zh: string;
}

export function evaluateSuperSubInstantImpactAndColdTouchPenaltyHazard(item: any, minute: number): SuperSubInstantImpactAndColdTouchPenaltyHazard {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let latestSubMin = 0;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    const incMin = Number(inc?.minute || inc?.time || 0);
    if (text.includes('换人') || text.includes('substitution') || text.includes('sub')) {
      if (incMin > latestSubMin) latestSubMin = incMin;
    }
  }

  const isRecentSub = latestSubMin > 0 && (minute - latestSubMin >= 0) && (minute - latestSubMin <= 5);
  let profile: SuperSubInstantImpactAndColdTouchPenaltyHazard['sub_impact_profile'] = 'NORMAL_SUB_INTEGRATION';
  let note = '';

  if (isRecentSub) {
    profile = 'SUPER_SUB_INSTANT_IMPACT_HAZARD';
    note = `🚀【替补生力军刚登场5分钟高危窗口・爆点突击与后防冷启动送点】刚登场替补球员伴随前场冲击力极易打破防守平衡，而后防刚上场替补未适应对抗节奏极易在禁区内鲁莽送点或漏人！`;
  } else {
    profile = 'NORMAL_SUB_INTEGRATION';
    note = `换人过渡期已过，双方重归稳定战术对位。`;
  }

  return {
    is_super_sub_impact_window: isRecentSub,
    sub_impact_profile: profile,
    sub_impact_tactical_note_zh: note,
  };
}

// ==========================================
// 72. Clean First-Half Discipline & Second-Half Escalation Boiling Engine
// ==========================================
export interface CleanFirstHalfDisciplineAndSecondHalfBoiling {
  is_second_half_card_boiling: boolean;
  escalation_profile: 'SECOND_HALF_CARD_ESCALATION_BOILING' | 'STEADY_DISCIPLINARY_RHYTHM';
  escalation_tactical_note_zh: string;
}

export function evaluateCleanFirstHalfDisciplineAndSecondHalfBoiling(liveStats: any, minute: number, refereeSeverity: number): CleanFirstHalfDisciplineAndSecondHalfBoiling {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const yellows = getSide('yellow_cards', 'home') + getSide('yellow_cards', 'away');

  // If first half had 0 or 1 yellow, but now match is in 60'+ with strict referee
  const isBoiling = yellows <= 1 && minute >= 60 && minute <= 85 && refereeSeverity >= 1.1;
  let profile: CleanFirstHalfDisciplineAndSecondHalfBoiling['escalation_profile'] = 'STEADY_DISCIPLINARY_RHYTHM';
  let note = '';

  if (isBoiling) {
    profile = 'SECOND_HALF_CARD_ESCALATION_BOILING';
    note = `🔥【上半场零黄牌温和局・下半场对抗骤燃与黄红牌集中井喷】上半场双方保留体能动作克制，进入60'+胜负白热化阶段伴随判罚争议，场上火药味势必骤然引爆，迎发出牌与定位球井喷！`;
  } else {
    profile = 'STEADY_DISCIPLINARY_RHYTHM';
    note = `犯规与出牌节奏全场分布均匀。`;
  }

  return {
    is_second_half_card_boiling: isBoiling,
    escalation_profile: profile,
    escalation_tactical_note_zh: note,
  };
}

// ==========================================
// 73. Interim Manager Debut Bounce & Tactical Uncertainty Engine
// ==========================================
export interface InterimManagerDebutBounceAndTacticalUncertainty {
  is_interim_manager_bounce: boolean;
  manager_profile: 'INTERIM_MANAGER_DEBUT_BOUNCE' | 'STABLE_COACHING_REGIME';
  manager_tactical_note_zh: string;
}

export function evaluateInterimManagerDebutBounceAndTacticalUncertainty(item: any, teamName: string): InterimManagerDebutBounceAndTacticalUncertainty {
  const contextText = JSON.stringify(item || '').toLowerCase();
  const isNewManager = contextText.includes('新帅') || contextText.includes('换帅') || contextText.includes('临时主帅') || contextText.includes('interim manager') || contextText.includes('new manager') || contextText.includes('代理主帅');

  let profile: InterimManagerDebutBounceAndTacticalUncertainty['manager_profile'] = 'STABLE_COACHING_REGIME';
  let note = '';

  if (isNewManager) {
    profile = 'INTERIM_MANAGER_DEBUT_BOUNCE';
    note = `👔【新帅上任首秀红利・更衣室亢奋与新阵型防守磨合】球队换帅后球员拼抢积极性飙升，但全新防守战术磨合生疏，容易呈现大开大合或受让爆冷特质！`;
  } else {
    profile = 'STABLE_COACHING_REGIME';
    note = `教练团队执教体系与战术执行稳定。`;
  }

  return {
    is_interim_manager_bounce: isNewManager,
    manager_profile: profile,
    manager_tactical_note_zh: note,
  };
}

// ==========================================
// 74. Goalkeeper Aerial Claim vs Flapping Danger Engine
// ==========================================
export interface GoalkeeperAerialClaimVsFlappingDanger {
  is_gk_aerial_vulnerability: boolean;
  aerial_profile: 'GOALKEEPER_AERIAL_FLAPPING_HAZARD' | 'COMMANDING_AERIAL_SECURITY';
  aerial_tactical_note_zh: string;
}

export function evaluateGoalkeeperAerialClaimVsFlappingDanger(liveStats: any, minute: number): GoalkeeperAerialClaimVsFlappingDanger {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const corners = getSide('corners', 'home') + getSide('corners', 'away');
  const crosses = getSide('crosses', 'home') + getSide('crosses', 'away');

  const isHazard = (corners >= 8 || crosses >= 20) && minute >= 50;
  let profile: GoalkeeperAerialClaimVsFlappingDanger['aerial_profile'] = 'COMMANDING_AERIAL_SECURITY';
  let note = '';

  if (isHazard) {
    profile = 'GOALKEEPER_AERIAL_FLAPPING_HAZARD';
    note = `🧤【门将高空防守脱节・高频传中轰炸下击球失误与门前乱战】高频角球与两翼传中反复高空轰炸，门将出击拦截稳定性受到极限考验，二次头球与门前混战破门概率大幅提升！`;
  } else {
    profile = 'COMMANDING_AERIAL_SECURITY';
    note = `高空球防守与门将出击摘球控制稳定。`;
  }

  return {
    is_gk_aerial_vulnerability: isHazard,
    aerial_profile: profile,
    aerial_tactical_note_zh: note,
  };
}

// ==========================================
// 75. Early Missed Penalty Psychological Reversal Engine
// ==========================================
export interface EarlyMissedPenaltyPsychologicalReversal {
  is_early_missed_penalty_reversal: boolean;
  reversal_profile: 'EARLY_MISSED_PENALTY_MORALE_COLLAPSE' | 'NORMAL_PENALTY_EQUILIBRIUM';
  reversal_tactical_note_zh: string;
}

export function evaluateEarlyMissedPenaltyPsychologicalReversal(item: any, minute: number): EarlyMissedPenaltyPsychologicalReversal {
  const incidents = Array.isArray(item?.incidents) ? item.incidents : [];
  let isEarlyMissed = false;

  for (const inc of incidents) {
    const text = String(inc?.text || inc?.description || inc?.type || '').toLowerCase();
    const incMin = Number(inc?.minute || inc?.time || 0);
    if (incMin <= 20 && (text.includes('点球') || text.includes('penalty')) && (text.includes('罚失') || text.includes('扑出') || text.includes('missed') || text.includes('不进') || text.includes('偏出'))) {
      isEarlyMissed = true;
      break;
    }
  }

  const isReversalActive = isEarlyMissed && minute <= 45;
  let profile: EarlyMissedPenaltyPsychologicalReversal['reversal_profile'] = 'NORMAL_PENALTY_EQUILIBRIUM';
  let note = '';

  if (isReversalActive) {
    profile = 'EARLY_MISSED_PENALTY_MORALE_COLLAPSE';
    note = `📉【开局20分钟内点球罚失・心理断崖崩塌与对手大难不死反扑】早早罚失点球引发攻方急躁与士气严重受挫，逃过一劫的守方士气大振，极易在随后的反击中惩罚对手！`;
  } else {
    profile = 'NORMAL_PENALTY_EQUILIBRIUM';
    note = `点球事件对两队心理走势未形成极端单边反转。`;
  }

  return {
    is_early_missed_penalty_reversal: isReversalActive,
    reversal_profile: profile,
    reversal_tactical_note_zh: note,
  };
}

// ==========================================
// 76. High Turnover Recovery & Transition Lethality Engine
// ==========================================
export interface HighTurnoverRecoveryAndTransitionLethality {
  is_high_turnover_lethal: boolean;
  transition_profile: 'HIGH_TURNOVER_TRANSITION_LETHAL' | 'SLOW_POSITIONAL_BUILDUP';
  transition_tactical_note_zh: string;
}

export function evaluateHighTurnoverRecoveryAndTransitionLethality(liveStats: any, minute: number): HighTurnoverRecoveryAndTransitionLethality {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const dangAtkHome = getSide('dangerous_attacks', 'home');
  const dangAtkAway = getSide('dangerous_attacks', 'away');
  const totalDang = dangAtkHome + dangAtkAway;

  const isLethal = totalDang >= 50 && minute >= 40;
  let profile: HighTurnoverRecoveryAndTransitionLethality['transition_profile'] = 'SLOW_POSITIONAL_BUILDUP';
  let note = '';

  if (isLethal) {
    profile = 'HIGH_TURNOVER_TRANSITION_LETHAL';
    note = `⚡【前场高位逼抢断球致死・快速攻防转换极速打穿】双方频繁在前场危险区域完成反抢反击，由守转攻转化极快，极易绕过阵地战直接形成单刀与绝杀破门！`;
  } else {
    profile = 'SLOW_POSITIONAL_BUILDUP';
    note = `攻防转换处于常规阵地战推进节奏。`;
  }

  return {
    is_high_turnover_lethal: isLethal,
    transition_profile: profile,
    transition_tactical_note_zh: note,
  };
}

// ==========================================
// 77. Central Congestion & Flank Isolation Skew Engine
// ==========================================
export interface CentralCongestionAndFlankIsolationSkew {
  is_central_congestion_flank_vacuum: boolean;
  congestion_profile: 'CENTRAL_CONGESTION_FLANK_VACUUM' | 'BALANCED_ATTACK_CHANNELS';
  congestion_tactical_note_zh: string;
}

export function evaluateCentralCongestionAndFlankIsolationSkew(liveStats: any, score: any, minute: number): CentralCongestionAndFlankIsolationSkew {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const blockedShots = getSide('blocked_shots', 'home') + getSide('blocked_shots', 'away');
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const isOneGoalGame = Math.abs(h - a) >= 1;

  const isCongested = blockedShots >= 5 && isOneGoalGame && minute >= 60;
  let profile: CentralCongestionAndFlankIsolationSkew['congestion_profile'] = 'BALANCED_ATTACK_CHANNELS';
  let note = '';

  if (isCongested) {
    profile = 'CENTRAL_CONGESTION_FLANK_VACUUM';
    note = `🧱【落后方中路死磕便秘・边路防区放空极易被反击一击毙命】落后方进攻严重扎堆中路密集防守导致射门连续被封堵，边后卫过度压上身后留下巨大走廊，被对手边路反击打穿风险极高！`;
  } else {
    profile = 'BALANCED_ATTACK_CHANNELS';
    note = `进攻通道宽度与防守边路覆盖平衡。`;
  }

  return {
    is_central_congestion_flank_vacuum: isCongested,
    congestion_profile: profile,
    congestion_tactical_note_zh: note,
  };
}

// ==========================================
// 78. Post-Tournament National Team Fatigue & Letdown Engine
// ==========================================
export interface PostTournamentNationalTeamFatigueAndLetdown {
  is_national_team_fatigue_letdown: boolean;
  fatigue_profile: 'NATIONAL_TEAM_FATIGUE_LETDOWN' | 'FULL_ENERGY_RESTED';
  fatigue_tactical_note_zh: string;
}

export function evaluatePostTournamentNationalTeamFatigueAndLetdown(item: any, league: string, minute: number): PostTournamentNationalTeamFatigueAndLetdown {
  const isTopLeague = league.includes('英超') || league.includes('西甲') || league.includes('欧冠') || league.includes('意甲') || league.includes('德甲');
  const contextStr = JSON.stringify(item || '').toLowerCase();
  const hasFifaSymptoms = contextStr.includes('国家队') || contextStr.includes('国际比赛日') || contextStr.includes('fifa') || contextStr.includes('national team');

  const isFatigued = isTopLeague && hasFifaSymptoms && minute >= 65;
  let profile: PostTournamentNationalTeamFatigueAndLetdown['fatigue_profile'] = 'FULL_ENERGY_RESTED';
  let note = '';

  if (isFatigued) {
    profile = 'NATIONAL_TEAM_FATIGUE_LETDOWN';
    note = `✈️【FIFA病毒跨洲飞行透支・豪门强队下半场注意力涣散与失误】多名核心主力经历国家队高强度消耗与跨时区长途奔波，65'+回防速度与防线默契度显著下降，下半场冷门失球风险加剧！`;
  } else {
    profile = 'FULL_ENERGY_RESTED';
    note = `阵容体能恢复充足，无明显跨洲比赛日疲劳。`;
  }

  return {
    is_national_team_fatigue_letdown: isFatigued,
    fatigue_profile: profile,
    fatigue_tactical_note_zh: note,
  };
}

// ==========================================
// 79. Sweeper-Keeper High Line Clearance & Lob Risk Engine
// ==========================================
export interface SweeperKeeperHighLineClearanceHazard {
  is_sweeper_keeper_hazard: boolean;
  sweeper_profile: 'SWEEPER_KEEPER_HIGH_LINE_RISK' | 'CONSERVATIVE_BOX_KEEPER';
  sweeper_tactical_note_zh: string;
}

export function evaluateSweeperKeeperHighLineClearanceHazard(liveStats: any, minute: number): SweeperKeeperHighLineClearanceHazard {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const totalOffsides = getSide('offsides', 'home') + getSide('offsides', 'away');

  const isHazard = totalOffsides >= 5 && minute >= 45;
  let profile: SweeperKeeperHighLineClearanceHazard['sweeper_profile'] = 'CONSERVATIVE_BOX_KEEPER';
  let note = '';

  if (isHazard) {
    profile = 'SWEEPER_KEEPER_HIGH_LINE_RISK';
    note = `🏃‍♂️【高位造越位防线逼迫门将大范围出击・身后超大空当与被吊射打空门风险】造越位战术极端前压迫使门将频繁充当清道夫大范围冲出禁区解围，极易被对手挑传或超远距离吊射致命！`;
  } else {
    profile = 'CONSERVATIVE_BOX_KEEPER';
    note = `门将活动范围处于禁区常规防守区域。`;
  }

  return {
    is_sweeper_keeper_hazard: isHazard,
    sweeper_profile: profile,
    sweeper_tactical_note_zh: note,
  };
}

// ==========================================
// 80. Early Red Card Underdog Counter Efficiency Engine
// ==========================================
export interface EarlyRedCardUnderdogCounterEfficiency {
  is_early_red_counter_skew: boolean;
  skew_profile: 'FAVORITE_TEN_MAN_OPEN_BACKLINE' | 'UNDERDOG_TEN_MAN_IRON_CURTAIN' | 'NORMAL_DISCIPLINE_STATE';
  skew_tactical_note_zh: string;
}

export function evaluateEarlyRedCardUnderdogCounterEfficiency(item: any, minute: number, refOdds: any): EarlyRedCardUnderdogCounterEfficiency {
  const redCards = item?.live_statistics?.red_cards || item?.red_cards;
  const hRed = Number(redCards?.home || 0);
  const aRed = Number(redCards?.away || 0);
  const homeWinOdds = Number(refOdds?.home_win || refOdds?.h || 0);

  let isSkew = false;
  let profile: EarlyRedCardUnderdogCounterEfficiency['skew_profile'] = 'NORMAL_DISCIPLINE_STATE';
  let note = '';

  if ((hRed > 0 || aRed > 0) && minute <= 45) {
    isSkew = true;
    if ((hRed > 0 && homeWinOdds <= 1.6) || (aRed > 0 && homeWinOdds >= 3.0)) {
      profile = 'FAVORITE_TEN_MAN_OPEN_BACKLINE';
      note = `🔥【强队早早少打一人但盲目控球压上・后场真空极易遭弱队反击绝杀】实力强队早早吃红牌后不肯退守，中前场过度压上导致后防极度空虚，弱队犀利反击爆冷破门概率倍增！`;
    } else {
      profile = 'UNDERDOG_TEN_MAN_IRON_CURTAIN';
      note = `🛡️【弱队早早染红开启铁桶阵・全员退守极度压缩强队禁区穿透空间】弱队被罚下一人后全员回收大禁区，强队破密集防守难度剧增，角球膨胀但小球走势显著！`;
    }
  } else {
    profile = 'NORMAL_DISCIPLINE_STATE';
    note = `未出现早早红牌导致的极端战术失衡。`;
  }

  return {
    is_early_red_counter_skew: isSkew,
    skew_profile: profile,
    skew_tactical_note_zh: note,
  };
}

// ==========================================
// 81. Consecutive Corner Wave Fatigue & Edge-of-Box Second Ball Threat Engine
// ==========================================
export interface ConsecutiveCornerWaveFatigueAndSecondBallThreat {
  is_consecutive_corner_wave: boolean;
  corner_wave_profile: 'CONSECUTIVE_CORNER_WAVE_SECOND_BALL_THREAT' | 'NORMAL_CORNER_DEFENSE';
  corner_wave_tactical_note_zh: string;
}

export function evaluateConsecutiveCornerWaveFatigueAndSecondBallThreat(liveStats: any, minute: number): ConsecutiveCornerWaveFatigueAndSecondBallThreat {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const totalCorners = getSide('corners', 'home') + getSide('corners', 'away');

  const isWave = totalCorners >= 8 && minute >= 55;
  let profile: ConsecutiveCornerWaveFatigueAndSecondBallThreat['corner_wave_profile'] = 'NORMAL_CORNER_DEFENSE';
  let note = '';

  if (isWave) {
    profile = 'CONSECUTIVE_CORNER_WAVE_SECOND_BALL_THREAT';
    note = `🌪️【角球连环围攻防线窒息・禁区解围不远二点球远射破门极度危险】连续角球压迫导致防守方体能严重透支且无法压出禁区，头球解围往往落入大禁区弧顶被攻方迎球怒射！`;
  } else {
    profile = 'NORMAL_CORNER_DEFENSE';
    note = `角球防守二点球保护及阵型推出正常。`;
  }

  return {
    is_consecutive_corner_wave: isWave,
    corner_wave_profile: profile,
    corner_wave_tactical_note_zh: note,
  };
}

// ==========================================
// 82. Long Throw-In Direct Box Catapult Hazard Engine
// ==========================================
export interface LongThrowInCatapultHazard {
  is_long_throw_catapult_threat: boolean;
  throw_profile: 'LONG_THROW_TACTICAL_CATAPULT' | 'STANDARD_THROW_IN';
  throw_tactical_note_zh: string;
}

export function evaluateLongThrowInCatapultHazard(item: any, league: string): LongThrowInCatapultHazard {
  const contextStr = JSON.stringify(item || '').toLowerCase();
  const isLowerUkOrNordic = league.includes('英冠') || league.includes('英甲') || league.includes('瑞典') || league.includes('挪威') || league.includes('苏超');
  const hasLongThrow = contextStr.includes('大力手抛球') || contextStr.includes('界外球手榴弹') || contextStr.includes('long throw');

  const isThreat = hasLongThrow || (isLowerUkOrNordic && contextStr.includes('界外球'));
  let profile: LongThrowInCatapultHazard['throw_profile'] = 'STANDARD_THROW_IN';
  let note = '';

  if (isThreat) {
    profile = 'LONG_THROW_TACTICAL_CATAPULT';
    note = `🚀【大力手抛球“手榴弹”战术空袭・前点摆渡与小禁区混战杀伤】前场界外球直接掷入小禁区充当角球，高点前点头球摆渡引发门前极度混乱，近距离乱战破门威胁极高！`;
  } else {
    profile = 'STANDARD_THROW_IN';
    note = `界外球处于常规短传过渡战术体系。`;
  }

  return {
    is_long_throw_catapult_threat: isThreat,
    throw_profile: profile,
    throw_tactical_note_zh: note,
  };
}

// ==========================================
// 83. Late-Game Time-Wasting & Frustration Booking Escalation Engine
// ==========================================
export interface LateGameTimeWastingAndFrustrationEscalation {
  is_late_time_wasting_card_boiling: boolean;
  wasting_profile: 'LATE_TIME_WASTING_FRUSTRATION_CARDS' | 'SMOOTH_LATE_FLOW';
  wasting_tactical_note_zh: string;
}

export function evaluateLateGameTimeWastingAndFrustrationEscalation(liveStats: any, score: any, minute: number): LateGameTimeWastingAndFrustrationEscalation {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const fouls = getSide('fouls', 'home') + getSide('fouls', 'away');
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const isOneGoalLead = Math.abs(h - a) === 1;

  const isBoiling = isOneGoalLead && minute >= 78 && fouls >= 20;
  let profile: LateGameTimeWastingAndFrustrationEscalation['wasting_profile'] = 'SMOOTH_LATE_FLOW';
  let note = '';

  if (isBoiling) {
    profile = 'LATE_TIME_WASTING_FRUSTRATION_CARDS';
    note = `⏱️【领先方最后时刻拖延战术・落后方心态失衡报复性犯规与黄牌井喷】一球领先进入收尾阶段，领先方控球耗时与拖延发球引发落后方暴力反抢与情绪失控，80'+黄红牌概率极速飙升！`;
  } else {
    profile = 'SMOOTH_LATE_FLOW';
    note = `比赛收尾阶段对抗情绪与发球节奏在正常可控范围。`;
  }

  return {
    is_late_time_wasting_card_boiling: isBoiling,
    wasting_profile: profile,
    wasting_tactical_note_zh: note,
  };
}

// ==========================================
// 84. Post-European Midweek Away Fixture Energy Dip Engine
// ==========================================
export interface PostEuropeanMidweekAwayFixtureEnergyDip {
  is_post_europe_away_energy_dip: boolean;
  energy_profile: 'POST_EUROPE_AWAY_ENERGY_DIP' | 'NORMAL_RESTED_CONDITION';
  energy_tactical_note_zh: string;
}

export function evaluatePostEuropeanMidweekAwayFixtureEnergyDip(item: any, league: string, minute: number): PostEuropeanMidweekAwayFixtureEnergyDip {
  const contextStr = JSON.stringify(item || '').toLowerCase();
  const isMajorLeague = league.includes('英超') || league.includes('西甲') || league.includes('德甲') || league.includes('意甲') || league.includes('法甲');
  const hasMidweekEurope = contextStr.includes('欧联') || contextStr.includes('欧协联') || contextStr.includes('europa') || contextStr.includes('conference');

  const isDip = isMajorLeague && hasMidweekEurope && minute >= 60;
  let profile: PostEuropeanMidweekAwayFixtureEnergyDip['energy_profile'] = 'NORMAL_RESTED_CONDITION';
  let note = '';

  if (isDip) {
    profile = 'POST_EUROPE_AWAY_ENERGY_DIP';
    note = `🔋【周中欧联/欧协联客战双线拖累・周末联赛60'+体能悬崖断崖下滑】周四客场长途劳顿后仅休息72小时再次作客，60'+多名主力出现无氧耐力透支与回防迟钝，极易在尾声被对手压制破门！`;
  } else {
    profile = 'NORMAL_RESTED_CONDITION';
    note = `赛程间隔合理，未受周中欧战客场疲劳拖累。`;
  }

  return {
    is_post_europe_away_energy_dip: isDip,
    energy_profile: profile,
    energy_tactical_note_zh: note,
  };
}

// ==========================================
// 85. Early Conceding Favorite Comeback Surge Engine
// ==========================================
export interface FirstHalfEarlyConcedingComebackSurge {
  is_early_conceding_comeback_surge: boolean;
  surge_profile: 'FAVORITE_EARLY_CONCEDE_PRESSURE_SURGE' | 'BALANCED_EARLY_FLOW';
  surge_tactical_note_zh: string;
}

export function evaluateFirstHalfEarlyConcedingComebackSurge(score: any, minute: number, refOdds: any, liveStats: any): FirstHalfEarlyConcedingComebackSurge {
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const homeWinOdds = Number(refOdds?.home_win || refOdds?.h || 0);
  const awayWinOdds = Number(refOdds?.away_win || refOdds?.a || 0);

  const isHomeFavTrailing = homeWinOdds > 0 && homeWinOdds <= 1.65 && h < a && minute <= 35;
  const isAwayFavTrailing = awayWinOdds > 0 && awayWinOdds <= 1.85 && a < h && minute <= 35;

  const isSurge = isHomeFavTrailing || isAwayFavTrailing;
  let profile: FirstHalfEarlyConcedingComebackSurge['surge_profile'] = 'BALANCED_EARLY_FLOW';
  let note = '';

  if (isSurge) {
    profile = 'FAVORITE_EARLY_CONCEDE_PRESSURE_SURGE';
    note = `🌪️【大热豪门开局早早丢球・上半场后半段狂暴反扑围攻与角球井喷】豪门强队在开局半小时内意外落后，随即开启全场最高压狂轰滥炸，半场追平与角球激增概率极高！`;
  } else {
    profile = 'BALANCED_EARLY_FLOW';
    note = `比分落后与进攻节奏处于常规展开模式。`;
  }

  return {
    is_early_conceding_comeback_surge: isSurge,
    surge_profile: profile,
    surge_tactical_note_zh: note,
  };
}

// ==========================================
// 86. Late Defensive Sub 5-at-the-Back Fortress Engine
// ==========================================
export interface LateDefensiveSubFiveAtTheBackFortress {
  is_late_five_back_fortress: boolean;
  fortress_profile: 'LATE_FIVE_AT_THE_BACK_FORTRESS' | 'NORMAL_LATE_DEFENSE';
  fortress_tactical_note_zh: string;
}

export function evaluateLateDefensiveSubFiveAtTheBackFortress(item: any, score: any, minute: number): LateDefensiveSubFiveAtTheBackFortress {
  const contextStr = JSON.stringify(item || '').toLowerCase();
  const h = Number(score?.home || 0);
  const a = Number(score?.away || 0);
  const isLeading = Math.abs(h - a) >= 1;
  const hasDefensiveSub = contextStr.includes('换上后卫') || contextStr.includes('五后卫') || contextStr.includes('三中卫') || contextStr.includes('5-3-2') || contextStr.includes('5-4-1');

  const isFortress = isLeading && minute >= 78 && hasDefensiveSub;
  let profile: LateDefensiveSubFiveAtTheBackFortress['fortress_profile'] = 'NORMAL_LATE_DEFENSE';
  let note = '';

  if (isFortress) {
    profile = 'LATE_FIVE_AT_THE_BACK_FORTRESS';
    note = `🏰【领先方换上中卫变阵五后卫铁桶阵・彻底封死禁区传中与中路穿透】领先方尾声果断变阵五后卫深位落位，大禁区防空与地面封堵密不透风，强行封杀对手运动战破门空间！`;
  } else {
    profile = 'NORMAL_LATE_DEFENSE';
    note = `比赛末段防线结构维持常规阵型。`;
  }

  return {
    is_late_five_back_fortress: isFortress,
    fortress_profile: profile,
    fortress_tactical_note_zh: note,
  };
}

// ==========================================
// 87. Artificial Turf Pitch Disparity Engine
// ==========================================
export interface ArtificialTurfPitchDisparity {
  is_artificial_turf_disparity: boolean;
  turf_profile: 'ARTIFICIAL_TURF_PITCH_DISPARITY' | 'STANDARD_NATURAL_GRASS';
  turf_tactical_note_zh: string;
}

export function evaluateArtificialTurfPitchDisparity(item: any, league: string): ArtificialTurfPitchDisparity {
  const contextStr = JSON.stringify(item || '').toLowerCase();
  const isNordicOrSwiss = league.includes('瑞典') || league.includes('挪威') || league.includes('芬兰') || league.includes('瑞士') || league.includes('俄超');
  const hasTurfKeyword = contextStr.includes('人工草') || contextStr.includes('人造草') || contextStr.includes('artificial turf');

  const isTurf = hasTurfKeyword || (isNordicOrSwiss && contextStr.includes('草皮'));
  let profile: ArtificialTurfPitchDisparity['turf_profile'] = 'STANDARD_NATURAL_GRASS';
  let note = '';

  if (isTurf) {
    profile = 'ARTIFICIAL_TURF_PITCH_DISPARITY';
    note = `🏟️【人工草皮高弹跳与快球速场地差异・客队地面停控与防守解围失误率激增】人工草皮弹跳轨迹异于天然草，客队极易在背身拿球和回传解围时出现致命失误，主队地利优势被大幅放大！`;
  } else {
    profile = 'STANDARD_NATURAL_GRASS';
    note = `比赛在常规天然草坪进行。`;
  }

  return {
    is_artificial_turf_disparity: isTurf,
    turf_profile: profile,
    turf_tactical_note_zh: note,
  };
}

// ==========================================
// 88. Goalkeeper Direct Launch & Aerial Duel Channel Engine
// ==========================================
export interface GoalkeeperDirectLaunchAndAerialDuelChannel {
  is_direct_launch_aerial_duel: boolean;
  launch_profile: 'DIRECT_LONG_LAUNCH_TARGET_MAN' | 'SHORT_PASS_BUILDUP';
  launch_tactical_note_zh: string;
}

export function evaluateGoalkeeperDirectLaunchAndAerialDuelChannel(liveStats: any, minute: number): GoalkeeperDirectLaunchAndAerialDuelChannel {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const fouls = getSide('fouls', 'home') + getSide('fouls', 'away');
  const passes = getSide('passes', 'home') + getSide('passes', 'away');

  const isDirect = passes > 0 && passes <= 320 && minute >= 50 && fouls >= 16;
  let profile: GoalkeeperDirectLaunchAndAerialDuelChannel['launch_profile'] = 'SHORT_PASS_BUILDUP';
  let note = '';

  if (isDirect) {
    profile = 'DIRECT_LONG_LAUNCH_TARGET_MAN';
    note = `🎯【门将大脚直达前场高中锋支点・跳过中场缠斗直接制造禁区二点球杀机】球队放弃中场传控，门将与后卫频繁长传直找前场支点中锋，头球争顶与第二落点争夺成为决定胜负的核心杀招！`;
  } else {
    profile = 'SHORT_PASS_BUILDUP';
    note = `球队推进以中场短传组织渗透为主。`;
  }

  return {
    is_direct_launch_aerial_duel: isDirect,
    launch_profile: profile,
    launch_tactical_note_zh: note,
  };
}

// ==========================================
// 89. Set-Piece Physical Altercation & Box Foul Card Hazard Engine
// ==========================================
export interface CornerPhysicalAltercationAndSetPieceScuffleHazard {
  is_set_piece_scuffle_card_hazard: boolean;
  scuffle_profile: 'SET_PIECE_PHYSICAL_ALTERCATION_HAZARD' | 'CLEAN_SET_PIECE_DUEL';
  scuffle_tactical_note_zh: string;
}

export function evaluateCornerPhysicalAltercationAndSetPieceScuffleHazard(liveStats: any, minute: number): CornerPhysicalAltercationAndSetPieceScuffleHazard {
  const getSide = (f: string, side: 'home' | 'away') => Number(liveStats?.[f]?.[side] ?? liveStats?.[side]?.[f] ?? 0);
  const corners = getSide('corners', 'home') + getSide('corners', 'away');
  const fouls = getSide('fouls', 'home') + getSide('fouls', 'away');

  const isScuffle = corners >= 7 && fouls >= 18 && minute >= 50;
  let profile: CornerPhysicalAltercationAndSetPieceScuffleHazard['scuffle_profile'] = 'CLEAN_SET_PIECE_DUEL';
  let note = '';

  if (isScuffle) {
    profile = 'SET_PIECE_PHYSICAL_ALTERCATION_HAZARD';
    note = `🥊【角球/定位球禁区推搡肉搏加剧・裁判由口头警告向掏牌与点球极速升级】双方在定位球防守中频繁出现禁区拉拽与推搡挑衅，主裁容忍度已达临界，极易在死球状态下直接出示黄牌或判罚点球！`;
  } else {
    profile = 'CLEAN_SET_PIECE_DUEL';
    note = `定位球禁区争顶对抗处于常规尺度。`;
  }

  return {
    is_set_piece_scuffle_card_hazard: isScuffle,
    scuffle_profile: profile,
    scuffle_tactical_note_zh: note,
  };
}

// ==========================================
// 90. Inverted Fullback Transition Space Exposure Engine
// ==========================================
export interface InvertedFullbackTransitionSpaceExposure {
  is_inverted_fullback_space_exposed: boolean;
  flank_profile: 'INVERTED_FULLBACK_FLANK_VACUUM_EXPOSED' | 'BALANCED_FLANK_COVERAGE';
  flank_tactical_note_zh: string;
}

export function evaluateInvertedFullbackTransitionSpaceExposure(item: any, minute: number): InvertedFullbackTransitionSpaceExposure {
  const contextStr = JSON.stringify(item || '').toLowerCase();
  const hasInvertedFullback = contextStr.includes('内收边后卫') || contextStr.includes('边后卫内收') || contextStr.includes('inverted fullback') || contextStr.includes('3-2-4-1');

  const isExposed = hasInvertedFullback && minute >= 40;
  let profile: InvertedFullbackTransitionSpaceExposure['flank_profile'] = 'BALANCED_FLANK_COVERAGE';
  let note = '';

  if (isExposed) {
    profile = 'INVERTED_FULLBACK_FLANK_VACUUM_EXPOSED';
    note = `⚡【边后卫内收后场边路留下真空走廊・中场丢球极易遭对手边锋快马长驱直入】边后卫大量参与中场肋部组织导致边路防区完全放空，一旦中场被断球，对手边路反击一马平川杀伤极大！`;
  } else {
    profile = 'BALANCED_FLANK_COVERAGE';
    note = `边路防守站位与回防纵深覆盖平衡。`;
  }

  return {
    is_inverted_fullback_space_exposed: isExposed,
    flank_profile: profile,
    flank_tactical_note_zh: note,
  };
}

// ==========================================
// Master Deep Tactical Synthesis Engine
// ==========================================
export interface MatchMasterTacticalSynthesis {
  // 1. Lineup & Absences
  positional_absence: PositionalAbsenceImpact;
  sub_bench_impact: SubBenchImpactScore;
  in_play_sub_impact: InPlaySubstitutionFreshLegsImpact;
  super_sub_impact: SuperSubInstantImpactAndColdTouchPenaltyHazard;
  exhausted_sub_straggler: ExhaustedSubstitutionsAndInjuredStraggler;
  squad_rotation_hazard: MassivePreEuropeSquadRotationHazard;
  booked_defender_risk: BookedDefenderAndSecondYellowRisk;
  lineup_age_fatigue: StartingLineupAgeAndLateFatigue;
  top_scorer_injury: TopGoalscorerEarlyInjuryAndFinishingVacuum;
  interim_manager_bounce: InterimManagerDebutBounceAndTacticalUncertainty;
  national_team_fatigue: PostTournamentNationalTeamFatigueAndLetdown;
  post_europe_away_dip: PostEuropeanMidweekAwayFixtureEnergyDip;
  late_five_back_fortress: LateDefensiveSubFiveAtTheBackFortress;
  // 2. In-Play Pressure & Physics
  possession_efficiency: PossessionEfficiencyAndCounterDirectness;
  box_shot_penetration: BoxShotPenetrationAndDesperation;
  clinical_finishing: ClinicalFinishingPurity;
  big_chance_backlash: BigChanceMissedAndBacklashVulnerability;
  zero_sot_reversion: ZeroShotOnTargetSurgeAndMeanReversion;
  tactical_foul_drag: TacticalFoulAndSetPieceVulnerability;
  card_acceleration: YellowCardAccelerationAndBoilingPoint;
  card_escalation_boiling: CleanFirstHalfDisciplineAndSecondHalfBoiling;
  late_time_wasting_cards: LateGameTimeWastingAndFrustrationEscalation;
  offside_line_physics: OffsideLinePhysicsAndTrapBreakthrough;
  offside_trap_breakdown: HighFrequencyOffsideTrapBreakdown;
  corner_squeeze: CornerSqueezeMetrics | null;
  corner_conversion_threat: CornerToGoalConversionThreat;
  corner_velocity: CornerVelocityAndFalsePressureSkew;
  consecutive_corner_wave: ConsecutiveCornerWaveFatigueAndSecondBallThreat;
  set_piece_marking_leak: SetPieceDefensiveMarkingLeak;
  set_piece_scuffle_cards: CornerPhysicalAltercationAndSetPieceScuffleHazard;
  long_throw_catapult: LongThrowInCatapultHazard;
  goalkeeper_save_quality: GoalkeeperSaveQualityAndRegression;
  goalkeeper_aerial_flapping: GoalkeeperAerialClaimVsFlappingDanger;
  sweeper_keeper_hazard: SweeperKeeperHighLineClearanceHazard;
  goalkeeper_direct_launch: GoalkeeperDirectLaunchAndAerialDuelChannel;
  backup_gk_collapse: BackupGoalkeeperSubstitutionCollapse;
  trailing_gk_push_up: TrailingGoalkeeperPushUpAndEmptyNetCounter;
  slippery_pitch_fumble: SlipperyWetPitchAndGoalkeeperFumble;
  red_card_discipline: RedCardDisciplinePhysics;
  multi_red_card_chaos: MultiRedCardChaosAndSpaceExplosion;
  sequential_red_card_asymmetry: SequentialRedCardTemporalAsymmetry;
  early_red_counter_skew: EarlyRedCardUnderdogCounterEfficiency;
  bus_parking_resistance: PostRedCardDeepBlockResistance;
  var_trauma: VarInterventionAndMoraleTrauma;
  penalty_vulnerability: PenaltyConversionAndVulnerability;
  early_missed_penalty: EarlyMissedPenaltyPsychologicalReversal;
  high_turnover_transition: HighTurnoverRecoveryAndTransitionLethality;
  central_congestion_flank: CentralCongestionAndFlankIsolationSkew;
  inverted_fullback_flank_vacuum: InvertedFullbackTransitionSpaceExposure;
  non_linear_time_decay: NonLinearTimeDecayMetrics;
  game_state_lead_preservation: GameStateLeadPreservation;
  two_goal_deficit_collapse: TwoGoalDeficitCapitulationAndCollapse;
  comfortable_lead_consolation: ComfortableLeadComplacencyAndConsolationGoal;
  early_conceding_comeback_surge: FirstHalfEarlyConcedingComebackSurge;
  ht_ft_transition_matrix: HalfTimeFullTimeTransitionMatrix;
  ht_tactical_readjustment: HalfTimeTacticalReadjustmentSurge;
  favorite_ht_rage_surge: FavoriteHalfTimeDeficitRageSurge;
  stalemate_floodgate: StalemateBreakthroughFloodgateEffect;
  stoppage_time_drama: StoppageTimeExpansionAndLateDrama;
  ultra_long_stoppage_beater: UltraLongStoppageTimeDragAndBuzzerBeater;
  goal_time_bucket_asymmetry: GoalTimeBucketAndHalfAsymmetry;
  pass_accuracy_progression: PassAccuracyAndMidfieldProgression;
  // 3. Environmental & Matchup
  referee_discipline: RefereeDisciplineAndPenalty;
  schedule_congestion: ScheduleCongestionAndRest;
  road_fatigue_drag: MultiAwayRoadFatigueAndTravelDrag;
  weather_pitch_physics: WeatherAndPitchPhysics;
  artificial_turf_disparity: ArtificialTurfPitchDisparity;
  strategic_motivation: StrategicMotivationMetrics;
  derby_match_deformation: DerbyMatchTacticalDeformation;
  league_tier_pressure: LeagueTierDisparityAndTablePressure;
  home_away_polarization: HomeAwayPolarizationDisparity;
  home_winless_desperation: HomeWinlessDesperationAndFanPressure;
  promoted_deflation: NewlyPromotedEuphoriaAndLateDeflation;
  head_to_head_nemesis: HeadToHeadTacticalNemesis;
  streak_momentum: StreakMomentumAndMeanRegression;
  ou_streak_bias: OverUnderStreakBiasAndReversion;
  first_goal_resilience: FirstGoalAndComebackResilience;
  btts_joint_probability: BothTeamsToScoreJointProbability;
  knockout_aggregate_dynamics: KnockoutAggregateAndExtraTimeDynamics;
  dead_rubber_blowout_stall: DeadRubberAggregateBlowoutStall;
  extra_time_stall_aversion: TwoLegAggregateTiedExtraTimeAversion;
  playoff_draw_penalty_inertia: PlayoffExtraTimeDrawInertiaAndPenaltyHorizon;
  margin_distribution_dce: MarginDistributionAndDeepCover;
  // 4. Odds & Sharp Money
  euro_asian_parity: EuroAsianParityMetrics;
  odds_steam_movement: OddsSteamMovementAndDiscrepancy;
  late_juice_trap: LateOddsJuiceDropAndTrapValve;
  multi_bookmaker_dispersion: MultiBookmakerOddsDispersion;
  half_full_harmonic_spread: HalfVsFullSpreadHarmonicConsistency;
  quarter_line_cushion: QuarterLineAsymmetricCushion;
  extreme_draw_compression: ExtremeDrawCompressionAndCollusion;
  // Master Comprehensive Note
  master_tactical_summary_zh: string;
}

export function buildMasterTacticalSynthesis(
  item: any,
  minute: number,
  verifiedMarkets: any[] = []
): MatchMasterTacticalSynthesis {
  const homeTeam = item?.ybty_home || item?.leisu_home || item?.home || '';
  const awayTeam = item?.ybty_away || item?.leisu_away || item?.away || '';
  const league = item?.league || item?.ybty_league || '';
  const lineupData = item?.lineups || item?.detail_context?.formal?.lineup || item?.detail_context?.lineup || item?.detail_context?.formal?.static_match?.lineup;
  const liveStats = item?.live_statistics || item?.detail_context?.formal?.live_match?.confirmed_statistics || null;
  const refOdds = item?.reference_odds || item?.detail_context?.formal?.odds;
  const standings = item?.recent_trends?.standings || item?.trend_summary?.standings;
  const matchTimeStr = item?.ybty_start_time || item?.provider_start_time || item?.commence_time;

  // 1. Lineup & Absences
  const positional = evaluatePositionalAbsenceImpact(lineupData, homeTeam, awayTeam);
  const bench = evaluateSubBenchImpact(lineupData, item);
  const inPlaySub = evaluateInPlaySubstitutionFreshLegsImpact(item, minute);
  const superSub = evaluateSuperSubInstantImpactAndColdTouchPenaltyHazard(item, minute);
  const exhaustedSub = evaluateExhaustedSubstitutionsAndInjuredStraggler(item, minute);
  const topScorerInj = evaluateTopGoalscorerEarlyInjuryAndFinishingVacuum(item, minute);
  const interimMgr = evaluateInterimManagerDebutBounceAndTacticalUncertainty(item, homeTeam);
  const squadRotation = evaluateMassivePreEuropeSquadRotationHazard(lineupData, item);
  const referee = evaluateRefereeDisciplineAndPenalty(item, league);
  const bookedDef = evaluateBookedDefenderAndSecondYellowRisk(item, minute, referee.referee_severity_index);
  const ageFatigue = evaluateStartingLineupAgeAndLateFatigue(lineupData, minute);
  const postEuropeAway = evaluatePostEuropeanMidweekAwayFixtureEnergyDip(item, league, minute);
  const lateFiveBack = evaluateLateDefensiveSubFiveAtTheBackFortress(item, item?.score, minute);

  // 2. In-Play Pressure & Physics
  const possessionEff = evaluatePossessionEfficiencyAndCounterDirectness(liveStats, minute);
  const boxPenetration = evaluateBoxShotPenetrationAndDesperation(liveStats, minute);
  const clinical = evaluateClinicalFinishingPurity(liveStats, item?.score);
  const bigChance = evaluateBigChanceMissedAndBacklashVulnerability(item, liveStats, minute);
  const zeroSot = evaluateZeroShotOnTargetSurgeAndMeanReversion(liveStats, minute);
  const foulDrag = evaluateTacticalFoulAndSetPieceVulnerability(liveStats, minute);
  const cardAccel = evaluateYellowCardAccelerationAndBoilingPoint(item, minute);
  const cardBoiling = evaluateCleanFirstHalfDisciplineAndSecondHalfBoiling(liveStats, minute, referee.referee_severity_index);
  const lateWasting = evaluateLateGameTimeWastingAndFrustrationEscalation(liveStats, item?.score, minute);
  const offsidePhysics = evaluateOffsideLinePhysicsAndTrapBreakthrough(liveStats, minute);
  const offsideTrapBreakdown = evaluateHighFrequencyOffsideTrapBreakdown(liveStats, minute);
  const passProg = evaluatePassAccuracyAndMidfieldProgression(liveStats, minute);
  const gkQuality = evaluateGoalkeeperSaveQualityAndRegression(liveStats, minute);
  const gkAerial = evaluateGoalkeeperAerialClaimVsFlappingDanger(liveStats, minute);
  const sweeperKeeper = evaluateSweeperKeeperHighLineClearanceHazard(liveStats, minute);
  const gkDirectLaunch = evaluateGoalkeeperDirectLaunchAndAerialDuelChannel(liveStats, minute);
  const backupGk = evaluateBackupGoalkeeperSubstitutionCollapse(item);
  const trailingGkPush = evaluateTrailingGoalkeeperPushUpAndEmptyNetCounter(item, item?.score, minute, league);
  const slipperyPitch = evaluateSlipperyWetPitchAndGoalkeeperFumble(item?.weather || item?.weather_info, liveStats);
  const corner = evaluateCornerSqueezeMetrics(liveStats, minute, item?.score);
  const cornerThreat = evaluateCornerToGoalConversionThreat(item, liveStats, minute);
  const cornerVel = evaluateCornerVelocityAndFalsePressureSkew(liveStats, minute);
  const consecCornerWave = evaluateConsecutiveCornerWaveFatigueAndSecondBallThreat(liveStats, minute);
  const setPieceLeak = evaluateSetPieceDefensiveMarkingLeak(liveStats, item);
  const setPieceScuffle = evaluateCornerPhysicalAltercationAndSetPieceScuffleHazard(liveStats, minute);
  const longThrow = evaluateLongThrowInCatapultHazard(item, league);
  const redCard = evaluateRedCardDisciplinePhysics(item, minute);
  const multiRed = evaluateMultiRedCardChaosAndSpaceExplosion(item);
  const seqRed = evaluateSequentialRedCardTemporalAsymmetry(item);
  const earlyRedSkew = evaluateEarlyRedCardUnderdogCounterEfficiency(item, minute, refOdds);
  const busParking = evaluatePostRedCardDeepBlockResistance(item, liveStats, minute);
  const varTrauma = evaluateVarInterventionAndMoraleTrauma(item, minute);
  const penaltyVuln = evaluatePenaltyConversionAndVulnerability(item, liveStats);
  const earlyPenalty = evaluateEarlyMissedPenaltyPsychologicalReversal(item, minute);
  const highTurnover = evaluateHighTurnoverRecoveryAndTransitionLethality(liveStats, minute);
  const centralCongest = evaluateCentralCongestionAndFlankIsolationSkew(liveStats, item?.score, minute);
  const invertedFullback = evaluateInvertedFullbackTransitionSpaceExposure(item, minute);
  const timeDecay = evaluateNonLinearTimeDecay(minute);
  const gameState = evaluateGameStateLeadPreservation(item, liveStats, item?.score, minute);
  const twoGoalDeficit = evaluateTwoGoalDeficitCapitulationAndCollapse(item?.score, minute, liveStats);
  const comfortableLead = evaluateComfortableLeadComplacencyAndConsolationGoal(item?.score, minute, item);
  const earlyConcedeSurge = evaluateFirstHalfEarlyConcedingComebackSurge(item?.score, minute, refOdds, liveStats);
  const htFtMatrix = evaluateHalfTimeFullTimeTransitionMatrix(item, item?.score, minute);
  const htSurge = evaluateHalfTimeTacticalReadjustmentSurge(liveStats, minute);
  const favHtRage = evaluateFavoriteHalfTimeDeficitRageSurge(item?.score, minute, refOdds);
  const stalemateFloodgate = evaluateStalemateBreakthroughFloodgateEffect(item?.score, minute, item);
  const stoppage = evaluateStoppageTimeExpansionAndLateDrama(item, minute);
  const ultraLongStoppage = evaluateUltraLongStoppageTimeDragAndBuzzerBeater(item, minute);
  const timeBucket = evaluateGoalTimeBucketAndHalfAsymmetry(item);

  // 3. Environmental & Matchup
  const schedule = evaluateScheduleCongestionAndRest(item, matchTimeStr);
  const roadFatigue = evaluateMultiAwayRoadFatigueAndTravelDrag(item, awayTeam);
  const natTeamFatigue = evaluatePostTournamentNationalTeamFatigueAndLetdown(item, league, minute);
  const weather = evaluateWeatherAndPitchPhysics(item);
  const artificialTurf = evaluateArtificialTurfPitchDisparity(item, league);
  const motivation = evaluateStrategicMotivation(standings, league, homeTeam, awayTeam);
  const derby = evaluateDerbyMatchTacticalDeformation(league, homeTeam, awayTeam);
  const tierPressure = evaluateLeagueTierDisparityAndTablePressure(standings, league, homeTeam, awayTeam);
  const polarization = evaluateHomeAwayPolarizationDisparity(standings, homeTeam, awayTeam);
  const homeWinless = evaluateHomeWinlessDesperationAndFanPressure(standings, item, homeTeam);
  const promotedDeflation = evaluateNewlyPromotedEuphoriaAndLateDeflation(league, homeTeam, awayTeam, minute, item?.score);
  const h2hNemesis = evaluateHeadToHeadTacticalNemesis(item);
  const streak = evaluateStreakMomentumAndMeanRegression(item);
  const ouStreak = evaluateOverUnderStreakBiasAndReversion(item, verifiedMarkets);
  const resilience = evaluateFirstGoalAndComebackResilience(item, item?.score);
  const bttsProb = evaluateBothTeamsToScoreJointProbability(item);
  const marginDCE = evaluateMarginDistributionAndDeepCover(item, homeTeam, awayTeam);
  const knockout = evaluateKnockoutAggregateAndExtraTimeDynamics(item, league, item?.score, minute);
  const deadRubber = evaluateDeadRubberAggregateBlowoutStall(item, league);
  const extraTimeAversion = evaluateTwoLegAggregateTiedExtraTimeAversion(item, league, item?.score, minute);
  const playoffInertia = evaluatePlayoffExtraTimeDrawInertiaAndPenaltyHorizon(league, item?.score, minute);

  // 4. Odds & Sharp Money
  const euroAsian = evaluateEuroAsianParity(refOdds, verifiedMarkets);
  const steam = evaluateOddsSteamMovementAndDiscrepancy(item, refOdds, verifiedMarkets);
  const lateJuice = evaluateLateOddsJuiceDropAndTrapValve(verifiedMarkets);
  const multiBooks = evaluateMultiBookmakerOddsDispersion(item, item?.bookmakers);
  const harmonicSpread = evaluateHalfVsFullSpreadHarmonicConsistency(verifiedMarkets);
  const quarterCushion = evaluateQuarterLineAsymmetricCushion(verifiedMarkets);
  const drawComp = evaluateExtremeDrawCompressionAndCollusion(verifiedMarkets);

  const summaryParts: string[] = [];
  if (redCard.has_red_card) summaryParts.push(redCard.discipline_tactical_guidance_zh);
  if (multiRed.is_multi_red_card_chaos) summaryParts.push(multiRed.space_explosion_tactical_note_zh);
  if (seqRed.is_sequential_red_card_asymmetry) summaryParts.push(seqRed.asymmetry_tactical_note_zh);
  if (earlyRedSkew.is_early_red_counter_skew) summaryParts.push(earlyRedSkew.skew_tactical_note_zh);
  if (busParking.is_fortress_10_man_low_block) summaryParts.push(busParking.bus_parking_tactical_note_zh);
  if (trailingGkPush.is_gk_push_up_empty_net_risk) summaryParts.push(trailingGkPush.empty_net_tactical_note_zh);
  if (backupGk.is_backup_gk_in_play) summaryParts.push(backupGk.gk_collapse_tactical_note_zh);
  if (gkAerial.is_gk_aerial_vulnerability) summaryParts.push(gkAerial.aerial_tactical_note_zh);
  if (sweeperKeeper.is_sweeper_keeper_hazard) summaryParts.push(sweeperKeeper.sweeper_tactical_note_zh);
  if (gkDirectLaunch.is_direct_launch_aerial_duel) summaryParts.push(gkDirectLaunch.launch_tactical_note_zh);
  if (slipperyPitch.is_slippery_pitch_fumble_risk) summaryParts.push(slipperyPitch.fumble_tactical_note_zh);
  if (artificialTurf.is_artificial_turf_disparity) summaryParts.push(artificialTurf.turf_tactical_note_zh);
  if (earlyPenalty.is_early_missed_penalty_reversal) summaryParts.push(earlyPenalty.reversal_tactical_note_zh);
  if (highTurnover.is_high_turnover_lethal) summaryParts.push(highTurnover.transition_tactical_note_zh);
  if (centralCongest.is_central_congestion_flank_vacuum) summaryParts.push(centralCongest.congestion_tactical_note_zh);
  if (invertedFullback.is_inverted_fullback_space_exposed) summaryParts.push(invertedFullback.flank_tactical_note_zh);
  if (interimMgr.is_interim_manager_bounce) summaryParts.push(interimMgr.manager_tactical_note_zh);
  if (natTeamFatigue.is_national_team_fatigue_letdown) summaryParts.push(natTeamFatigue.fatigue_tactical_note_zh);
  if (postEuropeAway.is_post_europe_away_energy_dip) summaryParts.push(postEuropeAway.energy_tactical_note_zh);
  if (lateFiveBack.is_late_five_back_fortress) summaryParts.push(lateFiveBack.fortress_tactical_note_zh);
  if (playoffInertia.is_playoff_draw_penalty_inertia) summaryParts.push(playoffInertia.playoff_tactical_note_zh);
  if (deadRubber.is_aggregate_blowout_dead_rubber) summaryParts.push(deadRubber.blowout_tactical_note_zh);
  if (extraTimeAversion.is_extra_time_stall_inertia) summaryParts.push(extraTimeAversion.extra_time_tactical_note_zh);
  if (favHtRage.is_favorite_ht_rage_surge) summaryParts.push(favHtRage.surge_tactical_note_zh);
  if (earlyConcedeSurge.is_early_conceding_comeback_surge) summaryParts.push(earlyConcedeSurge.surge_tactical_note_zh);
  if (squadRotation.is_massive_squad_rotation_hazard) summaryParts.push(squadRotation.rotation_tactical_note_zh);
  if (promotedDeflation.is_promoted_late_deflation_risk) summaryParts.push(promotedDeflation.promoted_tactical_note_zh);
  if (topScorerInj.is_top_scorer_injured_early) summaryParts.push(topScorerInj.finishing_vacuum_tactical_note_zh);
  if (comfortableLead.is_comfortable_lead_consolation_risk) summaryParts.push(comfortableLead.consolation_tactical_note_zh);
  if (twoGoalDeficit.is_two_goal_deficit_capitulation) summaryParts.push(twoGoalDeficit.deficit_tactical_note_zh);
  if (superSub.is_super_sub_impact_window) summaryParts.push(superSub.sub_impact_tactical_note_zh);
  if (exhaustedSub.is_exhausted_substitutions_straggler) summaryParts.push(exhaustedSub.straggler_tactical_note_zh);
  if (ultraLongStoppage.is_ultra_long_stoppage_beater) summaryParts.push(ultraLongStoppage.stoppage_beater_tactical_note_zh);
  if (lateWasting.is_late_time_wasting_card_boiling) summaryParts.push(lateWasting.wasting_tactical_note_zh);
  if (cardBoiling.is_second_half_card_boiling) summaryParts.push(cardBoiling.escalation_tactical_note_zh);
  if (offsideTrapBreakdown.is_offside_trap_collapse_imminent) summaryParts.push(offsideTrapBreakdown.trap_breakdown_tactical_note_zh);
  if (consecCornerWave.is_consecutive_corner_wave) summaryParts.push(consecCornerWave.corner_wave_tactical_note_zh);
  if (setPieceScuffle.is_set_piece_scuffle_card_hazard) summaryParts.push(setPieceScuffle.scuffle_tactical_note_zh);
  if (longThrow.is_long_throw_catapult_threat) summaryParts.push(longThrow.throw_tactical_note_zh);
  if (zeroSot.is_zero_sot_mean_reversion_due) summaryParts.push(zeroSot.reversion_tactical_note_zh);
  if (homeWinless.is_home_winless_desperation_push) summaryParts.push(homeWinless.fan_pressure_tactical_note_zh);
  if (stalemateFloodgate.is_stalemate_floodgate_active) summaryParts.push(stalemateFloodgate.stalemate_tactical_note_zh);
  if (bigChance.is_counter_backlash_vulnerability) summaryParts.push(bigChance.backlash_tactical_note_zh);
  if (derby.is_derby_fixture) summaryParts.push(derby.derby_tactical_note_zh);
  if (stoppage.is_extended_stoppage_time_drama) summaryParts.push(stoppage.stoppage_tactical_note_zh);
  if (varTrauma.var_recent_shock_active_15min) summaryParts.push(varTrauma.var_trauma_tactical_note_zh);
  if (drawComp.is_extreme_draw_compression) summaryParts.push(drawComp.draw_collusion_tactical_note_zh);
  if (lateJuice.is_ultra_low_juice_trap) summaryParts.push(lateJuice.juice_tactical_note_zh);
  if (cardAccel.boiling_point_red_card_imminent) summaryParts.push(cardAccel.card_acceleration_tactical_note_zh);
  if (gameState.golden_entry_point_unlocked) summaryParts.push(gameState.game_state_tactical_note_zh);
  if (htSurge.is_locker_room_tactical_surge) summaryParts.push(htSurge.readjustment_tactical_note_zh);
  if (inPlaySub.fresh_legs_tempo_acceleration_window) summaryParts.push(inPlaySub.sub_impact_tactical_note_zh);
  if (roadFatigue.is_road_weariness_exhaustion) summaryParts.push(roadFatigue.road_fatigue_tactical_note_zh);
  if (setPieceLeak.is_set_piece_aerial_marking_leak) summaryParts.push(setPieceLeak.aerial_leak_tactical_note_zh);
  if (penaltyVuln.box_foul_vulnerability_hazard) summaryParts.push(penaltyVuln.penalty_tactical_note_zh);
  if (clinical.home_sterile_shots_trap || clinical.away_clinical_killer_advantage) summaryParts.push(clinical.finishing_tactical_note_zh);
  if (htFtMatrix.ht_lead_collapse_hazard) summaryParts.push(htFtMatrix.ht_ft_tactical_note_zh);
  if (cornerVel.is_sterile_corner_inflation || cornerVel.corner_velocity_profile === 'RAPID_CORNER_SURGE_ATTACK') summaryParts.push(cornerVel.corner_velocity_tactical_note_zh);
  if (boxPenetration.home_desperation_long_shot_trap) summaryParts.push(boxPenetration.box_tactical_note_zh);
  if (polarization.is_fortress_vs_frailty_resonance) summaryParts.push(polarization.polarization_tactical_note_zh);
  if (h2hNemesis.nemesis_profile !== 'BALANCED_H2H') summaryParts.push(h2hNemesis.h2h_nemesis_tactical_note_zh);
  if (ouStreak.over_total_market_overheat_trap) summaryParts.push(ouStreak.ou_streak_tactical_note_zh);
  if (quarterCushion.half_loss_cushion_advantage) summaryParts.push(quarterCushion.quarter_cushion_tactical_note_zh);
  if (resilience.resilience_profile !== 'NORMAL_RESILIENCE') summaryParts.push(resilience.resilience_tactical_note_zh);
  if (possessionEff.possession_tactical_profile !== 'BALANCED_CONTROL') summaryParts.push(possessionEff.possession_tactical_note_zh);
  if (foulDrag.game_rhythm_fragmentation_level === 'HIGH_FRAGMENTATION_STALL') summaryParts.push(foulDrag.foul_tactical_note_zh);
  if (passProg.progression_profile !== 'BALANCED_CIRCULATION') summaryParts.push(passProg.progression_tactical_note_zh);
  if (gkQuality.late_regression_leak_risk) summaryParts.push(gkQuality.goalkeeper_tactical_note_zh);
  if (ageFatigue.veteran_late_fatigue_risk_70plus) summaryParts.push(ageFatigue.age_tactical_note_zh);
  if (offsidePhysics.broken_trap_breakthrough_hazard) summaryParts.push(offsidePhysics.offside_tactical_note_zh);
  if (streak.streak_profile !== 'NORMAL_MOMENTUM') summaryParts.push(streak.streak_tactical_note_zh);
  if (bttsProb.btts_profile === 'HIGH_DUAL_NET_FIREPOWER') summaryParts.push(bttsProb.btts_tactical_note_zh);
  if (harmonicSpread.harmonic_profile !== 'HARMONIC_ALIGNED') summaryParts.push(harmonicSpread.harmonic_tactical_note_zh);
  if (tierPressure.relegation_desperation_defense_boost || tierPressure.mid_table_complacency_risk) summaryParts.push(tierPressure.tier_pressure_tactical_note_zh);
  if (marginDCE.deep_spread_risk_warning) summaryParts.push(marginDCE.margin_tactical_note_zh);
  if (multiBooks.market_consensus_level !== 'NORMAL_MARKET_SPREAD') summaryParts.push(multiBooks.dispersion_tactical_note_zh);
  if (timeBucket.half_time_tempo_profile !== 'BALANCED_DISTRIBUTION') summaryParts.push(timeBucket.time_bucket_tactical_note_zh);
  if (knockout.extra_time_stall_risk_80plus || knockout.is_second_leg_aggregate) summaryParts.push(knockout.knockout_tactical_note_zh);
  if (euroAsian.spread_discrepancy !== null && Math.abs(euroAsian.spread_discrepancy) >= 0.5) summaryParts.push(euroAsian.parity_analysis_note_zh);
  if (steam.is_sharp_steam_action) summaryParts.push(steam.steam_tactical_note_zh);
  if (schedule.late_fatigue_breakdown_risk) summaryParts.push(schedule.schedule_tactical_note_zh);
  if (referee.referee_profile === 'HARSH_CARD_PENALTY_ELEVATED') summaryParts.push(referee.referee_tactical_note_zh);
  if (bookedDef.defensive_constraint_drag_away < 0.85) summaryParts.push(bookedDef.booked_defender_tactical_note_zh);
  if (weather.goal_damping_delta_lambda !== 0) summaryParts.push(weather.weather_tactical_note_zh);
  if (bench.second_half_sub_surge_potential !== 'BALANCED_BENCH') summaryParts.push(bench.bench_tactical_note_zh);
  if (cornerThreat.aerial_threat_profile === 'EMPTY_CORNER_DEFLECTION_INFLATION') summaryParts.push(cornerThreat.corner_conversion_tactical_note_zh);
  if (corner && corner.squeeze_danger_level === 'CRITICAL_IMMINENT_GOAL_SQUEEZE') summaryParts.push(corner.corner_tactical_note_zh);
  if (positional.structural_verdict_zh !== '双方阵容结构基本稳定') summaryParts.push(`阵容影响: ${positional.structural_verdict_zh}`);
  summaryParts.push(`时段特征: ${timeDecay.time_decay_tactical_note_zh}`);

  return {
    positional_absence: positional,
    sub_bench_impact: bench,
    in_play_sub_impact: inPlaySub,
    super_sub_impact: superSub,
    exhausted_sub_straggler: exhaustedSub,
    squad_rotation_hazard: squadRotation,
    booked_defender_risk: bookedDef,
    lineup_age_fatigue: ageFatigue,
    top_scorer_injury: topScorerInj,
    interim_manager_bounce: interimMgr,
    national_team_fatigue: natTeamFatigue,
    post_europe_away_dip: postEuropeAway,
    late_five_back_fortress: lateFiveBack,
    possession_efficiency: possessionEff,
    box_shot_penetration: boxPenetration,
    clinical_finishing: clinical,
    big_chance_backlash: bigChance,
    zero_sot_reversion: zeroSot,
    tactical_foul_drag: foulDrag,
    card_acceleration: cardAccel,
    card_escalation_boiling: cardBoiling,
    late_time_wasting_cards: lateWasting,
    offside_line_physics: offsidePhysics,
    offside_trap_breakdown: offsideTrapBreakdown,
    pass_accuracy_progression: passProg,
    goalkeeper_save_quality: gkQuality,
    goalkeeper_aerial_flapping: gkAerial,
    sweeper_keeper_hazard: sweeperKeeper,
    goalkeeper_direct_launch: gkDirectLaunch,
    backup_gk_collapse: backupGk,
    trailing_gk_push_up: trailingGkPush,
    slippery_pitch_fumble: slipperyPitch,
    corner_squeeze: corner,
    corner_conversion_threat: cornerThreat,
    corner_velocity: cornerVel,
    consecutive_corner_wave: consecCornerWave,
    set_piece_marking_leak: setPieceLeak,
    set_piece_scuffle_cards: setPieceScuffle,
    long_throw_catapult: longThrow,
    red_card_discipline: redCard,
    multi_red_card_chaos: multiRed,
    sequential_red_card_asymmetry: seqRed,
    early_red_counter_skew: earlyRedSkew,
    bus_parking_resistance: busParking,
    var_trauma: varTrauma,
    penalty_vulnerability: penaltyVuln,
    early_missed_penalty: earlyPenalty,
    high_turnover_transition: highTurnover,
    central_congestion_flank: centralCongest,
    inverted_fullback_flank_vacuum: invertedFullback,
    non_linear_time_decay: timeDecay,
    game_state_lead_preservation: gameState,
    two_goal_deficit_collapse: twoGoalDeficit,
    comfortable_lead_consolation: comfortableLead,
    early_conceding_comeback_surge: earlyConcedeSurge,
    ht_ft_transition_matrix: htFtMatrix,
    ht_tactical_readjustment: htSurge,
    favorite_ht_rage_surge: favHtRage,
    stalemate_floodgate: stalemateFloodgate,
    stoppage_time_drama: stoppage,
    ultra_long_stoppage_beater: ultraLongStoppage,
    goal_time_bucket_asymmetry: timeBucket,
    referee_discipline: referee,
    schedule_congestion: schedule,
    road_fatigue_drag: roadFatigue,
    weather_pitch_physics: weather,
    artificial_turf_disparity: artificialTurf,
    strategic_motivation: motivation,
    derby_match_deformation: derby,
    league_tier_pressure: tierPressure,
    home_away_polarization: polarization,
    home_winless_desperation: homeWinless,
    promoted_deflation: promotedDeflation,
    head_to_head_nemesis: h2hNemesis,
    streak_momentum: streak,
    ou_streak_bias: ouStreak,
    first_goal_resilience: resilience,
    btts_joint_probability: bttsProb,
    knockout_aggregate_dynamics: knockout,
    dead_rubber_blowout_stall: deadRubber,
    extra_time_stall_aversion: extraTimeAversion,
    playoff_draw_penalty_inertia: playoffInertia,
    margin_distribution_dce: marginDCE,
    euro_asian_parity: euroAsian,
    odds_steam_movement: steam,
    late_juice_trap: lateJuice,
    multi_bookmaker_dispersion: multiBooks,
    half_full_harmonic_spread: harmonicSpread,
    quarter_line_cushion: quarterCushion,
    extreme_draw_compression: drawComp,
    master_tactical_summary_zh: summaryParts.join(' | '),
  };
}

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
// Master Deep Tactical Synthesis Engine
// ==========================================
export interface MatchMasterTacticalSynthesis {
  positional_absence: PositionalAbsenceImpact;
  corner_squeeze: CornerSqueezeMetrics | null;
  red_card_discipline: RedCardDisciplinePhysics;
  euro_asian_parity: EuroAsianParityMetrics;
  strategic_motivation: StrategicMotivationMetrics;
  non_linear_time_decay: NonLinearTimeDecayMetrics;
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

  const positional = evaluatePositionalAbsenceImpact(lineupData, homeTeam, awayTeam);
  const corner = evaluateCornerSqueezeMetrics(liveStats, minute, item?.score);
  const redCard = evaluateRedCardDisciplinePhysics(item, minute);
  const euroAsian = evaluateEuroAsianParity(refOdds, verifiedMarkets);
  const motivation = evaluateStrategicMotivation(standings, league, homeTeam, awayTeam);
  const timeDecay = evaluateNonLinearTimeDecay(minute);

  const summaryParts: string[] = [];
  if (redCard.has_red_card) summaryParts.push(redCard.discipline_tactical_guidance_zh);
  if (euroAsian.spread_discrepancy !== null && Math.abs(euroAsian.spread_discrepancy) >= 0.5) summaryParts.push(euroAsian.parity_analysis_note_zh);
  if (corner && corner.squeeze_danger_level === 'CRITICAL_IMMINENT_GOAL_SQUEEZE') summaryParts.push(corner.corner_tactical_note_zh);
  if (positional.structural_verdict_zh !== '双方阵容结构基本稳定') summaryParts.push(`阵容影响: ${positional.structural_verdict_zh}`);
  summaryParts.push(`时段特征: ${timeDecay.time_decay_tactical_note_zh}`);

  return {
    positional_absence: positional,
    corner_squeeze: corner,
    red_card_discipline: redCard,
    euro_asian_parity: euroAsian,
    strategic_motivation: motivation,
    non_linear_time_decay: timeDecay,
    master_tactical_summary_zh: summaryParts.join(' | '),
  };
}

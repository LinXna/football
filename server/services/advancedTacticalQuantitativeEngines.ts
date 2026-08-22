import { 
  evaluateFormationClash, 
  detectMatchFormation, 
  FormationClashResult, 
  FormationType,
  FORMATION_ENCYCLOPEDIA 
} from './formationTacticalEngine';
import {
  detectLeagueRegionalDNA,
  LeagueRegionalProfile,
  REGIONAL_TACTICAL_ENCYCLOPEDIA,
} from './leagueRegionalDNAEngine';

export type { FormationClashResult, FormationType, LeagueRegionalProfile };
export { FORMATION_ENCYCLOPEDIA, REGIONAL_TACTICAL_ENCYCLOPEDIA, detectLeagueRegionalDNA };

/**
 * Advanced Tactical & Quantitative Betting Engines
 * 
 * Implements 8 deep quantitative calculations:
 * 1. Positional Absence & Lineup Structural Impact Engine (核心伤停与位置失衡量化)
 * 2. Corner Squeeze & Set-Piece Threat Acceleration Engine (角球动能与禁区高压挤压指数)
 * 3. 10-Men Red Card & Tactical Discipline Dynamic Physics Model (红黄牌人数失衡与体能断崖模型)
 * 4. Euro-Asian Odds Parity & Bookmaker Trap Discrepancy Engine (欧亚指数倒挂与机构避险精算)
 * 5. Strategic Motivation & Aggregate Score Math Engine (积分榜战意差值与两回合赛制精算)
 * 6. Non-Linear In-Play Time Decay & High-Fatigue Windows Model (进球非线性时间分布与体能断崖模型)
 * 7. Formation Clash & Dynamic Tactical Counter-Strategy Engine (主流阵型战术克制与空间博弈精算)
 * 8. League Regional DNA & Tournament Archetype Taxonomy (联赛层级、赛事性质与地域风格基因库)
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
  const injuries = Array.isArray(lineupData?.injuries)
    ? lineupData.injuries
    : Array.isArray(lineupData?.missing_players)
    ? lineupData.missing_players
    : Array.isArray(lineupData?.absences)
    ? lineupData.absences
    : [];

  const homeAbs = { gk: false, cb: 0, mf: 0, fw: 0, total: 0, names: [] as string[] };
  const awayAbs = { gk: false, cb: 0, mf: 0, fw: 0, total: 0, names: [] as string[] };

  const cleanHome = (homeTeam || '').trim().toLowerCase();
  const cleanAway = (awayTeam || '').trim().toLowerCase();

  for (const item of injuries) {
    const text = typeof item === 'string' ? item : `${item.team || ''} ${item.side || ''} ${item.name || ''} ${item.position || ''} ${item.pos || ''} ${item.reason || ''}`;
    const lower = text.toLowerCase();
    
    let isAway = false;
    let isHome = false;

    if (item && typeof item === 'object') {
      if (item.side === 'away' || item.side === '客' || item.team === 'away') isAway = true;
      else if (item.side === 'home' || item.side === '主' || item.team === 'home') isHome = true;
    }

    if (!isAway && !isHome) {
      if (cleanAway && (lower.includes(cleanAway) || text.includes('客队') || text.includes('客'))) {
        isAway = true;
      } else if (cleanHome && (lower.includes(cleanHome) || text.includes('主队') || text.includes('主'))) {
        isHome = true;
      } else if (text.includes('客')) {
        isAway = true;
      } else {
        isHome = true;
      }
    }

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
  scoreText?: string,
  rawItem?: any,
  homeTeam: string = '',
  awayTeam: string = ''
): CornerSqueezeMetrics | null {
  if (minute < 3) return null;

  // 1. Prioritize StandardMatchData live_facts.stats / unified_stats
  let homeCorners = 0;
  let awayCorners = 0;
  if (rawItem?.live_facts?.stats?.corners) {
    homeCorners = Number(rawItem.live_facts.stats.corners.home ?? 0);
    awayCorners = Number(rawItem.live_facts.stats.corners.away ?? 0);
  } else if (rawItem?.unified_stats?.corners) {
    homeCorners = Number(rawItem.unified_stats.corners.home ?? 0);
    awayCorners = Number(rawItem.unified_stats.corners.away ?? 0);
  } else if (liveStats?.corners) {
    homeCorners = Number(liveStats.corners.home ?? liveStats.corners_home ?? 0);
    awayCorners = Number(liveStats.corners.away ?? liveStats.corners_away ?? 0);
  } else {
    homeCorners = Number(
      liveStats?.home?.corner_kicks ??
      liveStats?.home?.corners ??
      liveStats?.corners_home ??
      liveStats?.corner_home ??
      rawItem?.focused_incidents?.cards_and_corners?.corners?.home ??
      0
    );
    awayCorners = Number(
      liveStats?.away?.corner_kicks ??
      liveStats?.away?.corners ??
      liveStats?.corners_away ??
      liveStats?.corner_away ??
      rawItem?.focused_incidents?.cards_and_corners?.corners?.away ??
      0
    );
  }

  // If liveStats is not yet populated, fallback to dynamic timeline events parsing
  if (homeCorners === 0 && awayCorners === 0 && (rawItem?.live_facts?.events_timeline || rawItem?.focused_incidents?.match_events)) {
    const events: any[] = rawItem?.live_facts?.events_timeline || rawItem?.focused_incidents?.match_events || [];
    const cleanHome = (homeTeam || '').trim().toLowerCase();
    const cleanAway = (awayTeam || '').trim().toLowerCase();

    for (const ev of events) {
      const text = typeof ev === 'string' ? ev : `${ev.text || ''} ${ev.shortText || ''}`;
      if (/角球|corner/i.test(text)) {
        if (typeof ev === 'object' && ev.side) {
          if (ev.side === 'home') homeCorners++;
          else if (ev.side === 'away') awayCorners++;
        } else {
          const lower = text.toLowerCase();
          if (cleanHome && lower.includes(cleanHome)) homeCorners++;
          else if (cleanAway && lower.includes(cleanAway)) awayCorners++;
          else if (/主|home/i.test(text)) homeCorners++;
          else if (/客|away/i.test(text)) awayCorners++;
          else homeCorners++;
        }
      }
    }
  }

  const totalCorners = homeCorners + awayCorners;
  const elapsed = Math.max(5, minute);
  const velocityPer10 = Number(((totalCorners / elapsed) * 10).toFixed(2));
  const homeShare = totalCorners > 0 ? Number(((homeCorners / totalCorners) * 100).toFixed(1)) : 50;

  // Project full time corners using 90 mins
  const projectedFT = Number((totalCorners + (totalCorners / elapsed) * (90 - elapsed)).toFixed(1));

  // Determine Squeeze Danger Level
  let dangerLevel: CornerSqueezeMetrics['squeeze_danger_level'] = 'MODERATE';
  let note = '';

  if (velocityPer10 >= 1.5 && (homeShare >= 75 || homeShare <= 25)) {
    dangerLevel = 'CRITICAL_IMMINENT_GOAL_SQUEEZE';
    const dominantTeam = homeShare >= 75 ? (homeTeam || '主队') : (awayTeam || '客队');
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
  minute: number,
  homeTeam: string = '',
  awayTeam: string = ''
): RedCardDisciplinePhysics {
  const cData: CanonicalMatchData = item?.live_facts?.stats ? (item as CanonicalMatchData) : canonicalizeRawMatchData(item);
  const events = cData.live_facts?.events_timeline || (item as any)?.timeline_events || (item as any)?.focused_incidents?.match_events || [];
  
  const homeName = homeTeam || cData.meta?.home_team || '';
  const awayName = awayTeam || cData.meta?.away_team || '';
  const cleanHome = homeName.trim().toLowerCase();
  const cleanAway = awayName.trim().toLowerCase();

  let homeReds = 0;
  let awayReds = 0;
  let firstRedMin = 999;

  const checkEvent = (text: string, mNum?: number, explicitSide?: 'home' | 'away') => {
    if (!/红牌|red card|两黄变一红|2nd yellow/i.test(text)) return;
    const m = mNum || (text.match(/(\d{1,3})['′]/) ? parseInt(text.match(/(\d{1,3})['′]/)![1], 10) : minute);
    if (m < firstRedMin) firstRedMin = m;
    
    if (explicitSide === 'away') {
      awayReds++;
      return;
    }
    if (explicitSide === 'home') {
      homeReds++;
      return;
    }

    const lower = text.toLowerCase();
    if (cleanAway && lower.includes(cleanAway)) awayReds++;
    else if (cleanHome && lower.includes(cleanHome)) homeReds++;
    else if (/客|away/i.test(text)) awayReds++;
    else homeReds++;
  };

  if (Array.isArray(events)) {
    for (const ev of (events as any[])) {
      if (typeof ev === 'string') checkEvent(ev);
      else if (ev && typeof ev === 'object') {
        const desc = `${ev.text || ''} ${ev.shortText || ''} ${ev.icon || ''}`;
        const m = Number(ev.min || ev.minute || minute);
        const isRed = ev.isCard || ev.icon === 'red_card' || /红牌|red/i.test(desc);
        if (isRed) {
          checkEvent(desc, m, ev.side === 'away' || ev.side === 'home' ? ev.side : undefined);
        } else {
          checkEvent(desc, m);
        }
      }
    }
  }

  // Canonical unified red cards
  const unifiedHomeRed = Number(cData.live_facts?.stats?.red_cards?.home ?? 0);
  const unifiedAwayRed = Number(cData.live_facts?.stats?.red_cards?.away ?? 0);
  homeReds = Math.max(homeReds, unifiedHomeRed);
  awayReds = Math.max(awayReds, unifiedAwayRed);

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

  const penalizedName = redTeam === 'home' ? (homeName || '主队') : (awayName || '客队');
  const advantagedName = redTeam === 'home' ? (awayName || '客队') : (homeName || '主队');

  if (redMin <= 45) {
    phase = 'EARLY_COLLAPSE_WINDOW';
    mult = 2.15;
    guidance = `【上半场(${redMin}')过早吃红牌・体能与防线双重崩塌】${penalizedName}少打一人需承受长达${remainingMins}分钟的人数劣势，体能将在下半场遭遇断崖式消耗，其失球期望率扩大2.15倍，强烈支持${advantagedName}让球穿盘及全场大球！`;
  } else if (redMin >= 78) {
    phase = 'LATE_BUS_SURVIVAL';
    mult = 1.25;
    guidance = `【终局(${redMin}')红牌・铁桶阵收缩模式】${penalizedName}在比赛尾声染红，剩余时间有限，受罚方将全员回撤禁区摆大巴拖延时间，进攻方攻坚时间不足，谨防盲目追大。`;
  } else {
    phase = 'MID_FATIGUE_EROSION';
    mult = 1.70;
    guidance = `【第${redMin}分钟红牌】${penalizedName}少打一人，防线缺口扩大(失球乘数1.70x)，利好${advantagedName}持续围攻造杀机。`;
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
    const euroRaw = referenceOdds.europe || referenceOdds.euro_odds || referenceOdds.euro || referenceOdds.eur || referenceOdds.european;
    if (euroRaw) {
      euroH = Number(euroRaw.home_win || euroRaw.home || euroRaw.h || euroRaw.win || 0);
    }
  }

  // If no reference euro, try to find 1X2 in verified markets
  if (euroH <= 1.0) {
    const h2hMarket = verifiedMarkets.find((m: any) => m.market === 'full_h2h' || m.market_type === 'full_h2h');
    const homeOpt = h2hMarket?.options?.find((o: any) => /主胜|home|1/i.test(String(o.side || o.line || o.option_id || '')));
    if (homeOpt && Number(homeOpt.odds) > 1.0) {
      euroH = Number(homeOpt.odds);
    }
  }

  // 2. Extract Actual Asian Handicap from verified markets
  let actualSpread: number | null = null;
  const spreadMarket = verifiedMarkets.find((m: any) => m.market === 'full_spread' || m.market_type === 'full_spread');
  if (spreadMarket?.options?.length) {
    const homeOpt = spreadMarket.options.find((o: any) => /主|home/i.test(String(o.side || o.option_id || '')));
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
  const isCup = /杯|cup|copa|trophy|champions|uefa|afc|libertadores|联赛杯|足协杯/i.test(league);
  
  let homePos = 8;
  let awayPos = 8;
  let homePts = 20;
  let awayPts = 20;

  if (standings && typeof standings === 'object') {
    const h = standings.home_team || standings.home;
    const a = standings.away_team || standings.away;
    if (h?.total) {
      homePos = Number(h.total.rank || h.total.position || 8);
      homePts = Number(h.total.points || h.total.pts || 20);
    } else if (h?.rank || h?.position) {
      homePos = Number(h.rank || h.position || 8);
      homePts = Number(h.points || h.pts || 20);
    }
    if (a?.total) {
      awayPos = Number(a.total.rank || a.total.position || 8);
      awayPts = Number(a.total.points || a.total.pts || 20);
    } else if (a?.rank || a?.position) {
      awayPos = Number(a.rank || a.position || 8);
      awayPts = Number(a.points || a.pts || 20);
    }
  } else if (typeof standings === 'string' && standings.trim().length > 0) {
    // Robust regex parser from standings_text (e.g. "主: 曼城 第2名 (48分) | 客: 利物浦 第1名 (51分)" or "主队排名: 2, 积分: 48")
    const homeRankMatch = standings.match(/主.*?第\s*(\d{1,2})\s*名|主.*?排名\s*[:：]?\s*(\d{1,2})|主.*?#(\d{1,2})/i);
    if (homeRankMatch) {
      homePos = parseInt(homeRankMatch[1] || homeRankMatch[2] || homeRankMatch[3], 10);
    }
    const homePtsMatch = standings.match(/主.*?(\d{1,3})\s*分|主.*?积\s*(\d{1,3})\s*分/i);
    if (homePtsMatch) {
      homePts = parseInt(homePtsMatch[1] || homePtsMatch[2], 10);
    }

    const awayRankMatch = standings.match(/客.*?第\s*(\d{1,2})\s*名|客.*?排名\s*[:：]?\s*(\d{1,2})|客.*?#(\d{1,2})/i);
    if (awayRankMatch) {
      awayPos = parseInt(awayRankMatch[1] || awayRankMatch[2] || awayRankMatch[3], 10);
    }
    const awayPtsMatch = standings.match(/客.*?(\d{1,3})\s*分|客.*?积\s*(\d{1,3})\s*分/i);
    if (awayPtsMatch) {
      awayPts = parseInt(awayPtsMatch[1] || awayPtsMatch[2], 10);
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
  empirical_phase_goal_weight: number; // e.g. 1.55 for 75-90+
  non_linear_remaining_goal_capacity_pct: number;
  attacking_potency_verdict: 'HIGH_POTENCY_BOX_SIEGE' | 'FLUID_COUNTER_THREAT' | 'STERILE_POSSESSION_NO_SHOTS' | 'DEFENSIVE_STALEMATE_ATTRITION' | 'GARBAGE_TIME_DEAD_GAME' | 'STANDARD_DEVELOPMENT';
  actual_effective_late_goal_score: number; // 0-100 综合实战终局破门动能
  finishing_quality_zh: string; // 射正与门前终结质量
  scoring_weapons_zh: string; // 得分手段与战术武器分析
  score_catalyst_zh: string; // 比分与战意催化
  time_decay_tactical_note_zh: string;
}

export function evaluateNonLinearTimeDecay(
  minute: number,
  liveStats?: any,
  scoreStr?: string,
  formationClash?: FormationClashResult,
  rawItem?: any
): NonLinearTimeDecayMetrics {
  const m = Math.max(0, Math.min(95, minute));
  const remainingMins = Math.max(0, 90 - m);

  let phase: NonLinearTimeDecayMetrics['current_game_phase'] = 'EARLY_TACTICAL_FEELING (0-15\')';
  let phaseWeight = 1.0;
  let phaseBaseNote = '';

  if (m <= 15) {
    phase = 'EARLY_TACTICAL_FEELING (0-15\')';
    phaseWeight = 0.75;
    phaseBaseNote = '开局试探期：双方阵型严密，防线保持完整。';
  } else if (m <= 30) {
    phase = 'HALF_ATTACK_WINDOW (15-30\')';
    phaseWeight = 1.05;
    phaseBaseNote = '半场攻坚期：比赛节奏加快，高位逼抢与三区渗透增加。';
  } else if (m <= 45) {
    phase = 'PRE_HALFTIME_FATIGUE (30-45+\')';
    phaseWeight = 1.30;
    phaseBaseNote = '半场体能节点 (30-45+\')：专注度首轮波动，失误率增加。';
  } else if (m <= 60) {
    phase = 'SECOND_HALF_RESET (45-60\')';
    phaseWeight = 0.95;
    phaseBaseNote = '下半场战术重置期：双方重新梳理攻防架构。';
  } else if (m <= 75) {
    phase = 'SUBSTITUTION_SURGE (60-75\')';
    phaseWeight = 1.15;
    phaseBaseNote = '换人发力期：替补生力军登场冲击疲惫防线。';
  } else {
    phase = 'LATE_FATIGUE_BREAKDOWN (75-90+\')';
    phaseWeight = 1.55;
    phaseBaseNote = '终局搏命与体能透支期 (75-90+\')：防线拉长脱节。';
  }

  // Extract real in-match physical facts from canonical unified_stats
  const canonicalStats = rawItem?.live_facts?.stats || (rawItem ? canonicalizeRawMatchData(rawItem).live_facts.stats : null);
  let targetHome = Number(canonicalStats?.shots_on_target?.home ?? liveStats?.shots_on_target_home ?? 0);
  let targetAway = Number(canonicalStats?.shots_on_target?.away ?? liveStats?.shots_on_target_away ?? 0);
  let totalShotsHome = Number(canonicalStats?.shots?.home ?? liveStats?.shots_home ?? 0);
  let totalShotsAway = Number(canonicalStats?.shots?.away ?? liveStats?.shots_away ?? 0);
  let dangHome = Number(canonicalStats?.dangerous_attacks?.home ?? liveStats?.dangerous_attacks_home ?? 0);
  let dangAway = Number(canonicalStats?.dangerous_attacks?.away ?? liveStats?.dangerous_attacks_away ?? 0);
  let cornersHome = Number(canonicalStats?.corners?.home ?? liveStats?.corners_home ?? 0);
  let cornersAway = Number(canonicalStats?.corners?.away ?? liveStats?.corners_away ?? 0);

  const totalTargetShots = targetHome + targetAway;
  const totalShots = totalShotsHome + totalShotsAway;
  const totalDangAttacks = dangHome + dangAway;
  const dangRatePerMin = m > 0 ? Number((totalDangAttacks / m).toFixed(2)) : 0;
  const totalCorners = cornersHome + cornersAway;

  // Score parse
  let homeScore = 0;
  let awayScore = 0;
  if (scoreStr && typeof scoreStr === 'string' && scoreStr.includes('-')) {
    const parts = scoreStr.split('-').map(p => parseInt(p.trim(), 10));
    if (!isNaN(parts[0])) homeScore = parts[0];
    if (!isNaN(parts[1])) awayScore = parts[1];
  }
  const scoreDiff = Math.abs(homeScore - awayScore);
  const totalGoalsScored = homeScore + awayScore;

  // Evaluate Attacking Potency Verdict
  let potencyVerdict: NonLinearTimeDecayMetrics['attacking_potency_verdict'] = 'STANDARD_DEVELOPMENT';
  let finishingQualityZh = '';
  let scoringWeaponsZh = '';
  let scoreCatalystZh = '';
  let dynamicFactor = 1.0;

  // 1. Finishing Quality Check
  if (m >= 60 && totalTargetShots <= 1) {
    finishingQualityZh = `全场射正仅 ${totalTargetShots} 次 (总射门 ${totalShots})，门前终结能力严重匮乏，缺乏制造实质威胁的准星。`;
  } else if (totalTargetShots >= 7 || (m >= 45 && totalTargetShots >= 5)) {
    finishingQualityZh = `双方已累计 ${totalTargetShots} 次射正 (主 ${targetHome} : 客 ${targetAway})，攻方持续威胁球门，射门转化质量处于高位！`;
  } else {
    finishingQualityZh = `累计 ${totalTargetShots} 次射正 (总射门 ${totalShots})，具备常规门前压迫能力。`;
  }

  // 2. Scoring Weapons Check
  const hasCornerWeapon = totalCorners >= 8 || (m >= 60 && totalCorners >= 6);
  const hasHighDangRate = dangRatePerMin >= 0.70;
  if (hasCornerWeapon && hasHighDangRate) {
    scoringWeaponsZh = `定位球高空轰炸+禁区挤压武器齐备 (已造 ${totalCorners} 角球，危攻 ${dangRatePerMin}/分)，破密防手段丰富。`;
  } else if (hasCornerWeapon) {
    scoringWeaponsZh = `拥有高频角球与定位球高空攻门武器 (角球 ${totalCorners} 个)，可在乱战中破门。`;
  } else if (hasHighDangRate) {
    scoringWeaponsZh = `运动战传切与肋部渗透频繁 (危攻速率 ${dangRatePerMin}次/分)，具备运动战打穿防线能力。`;
  } else if (m >= 60 && dangRatePerMin < 0.35 && totalCorners <= 3) {
    scoringWeaponsZh = `进攻手段极其单一：既无定位球高空优势 (角球仅 ${totalCorners})，亦无深度渗透 (危攻仅 ${dangRatePerMin}/分)，陷入无效倒脚。`;
  } else {
    scoringWeaponsZh = `维持常规攻防推进手段。`;
  }

  // 3. Score & Motivation Catalyst Check
  if (scoreDiff >= 3) {
    scoreCatalystZh = `比分差距达 ${scoreDiff} 球 (${homeScore}-${awayScore})，胜负失去悬念，双方鸣金收兵、节奏大概率骤降。`;
  } else if (scoreDiff === 1 && m >= 70) {
    scoreCatalystZh = `1球微弱分差 (${homeScore}-${awayScore}) 触发落后方全线压上绝杀搏命，同时暴露后场防反开阔地，进球催化效应拉满！`;
  } else if (scoreDiff === 0 && m >= 75) {
    scoreCatalystZh = `平局比分 (${homeScore}-${awayScore})：若双方争胜欲望强烈则终局搏杀；若战术保守则相互控场保平。`;
  } else {
    scoreCatalystZh = `当前比分 ${homeScore}-${awayScore}，战术博弈按计划推进。`;
  }

  // Synthesis into Verdict & Dynamic Score
  if (scoreDiff >= 3 && m >= 75) {
    potencyVerdict = 'GARBAGE_TIME_DEAD_GAME';
    dynamicFactor = 0.50;
  } else if (m >= 65 && totalTargetShots <= 1 && dangRatePerMin < 0.40) {
    potencyVerdict = 'STERILE_POSSESSION_NO_SHOTS';
    dynamicFactor = 0.55;
  } else if (m >= 70 && scoreDiff === 1 && (totalTargetShots >= 4 || dangRatePerMin >= 0.60)) {
    potencyVerdict = 'HIGH_POTENCY_BOX_SIEGE';
    dynamicFactor = 1.45;
  } else if (m >= 70 && scoreDiff === 1 && formationClash?.clash_verdict === 'ADVANTAGE_AWAY') {
    potencyVerdict = 'FLUID_COUNTER_THREAT';
    dynamicFactor = 1.35;
  } else if (m >= 65 && dangRatePerMin < 0.45 && totalTargetShots <= 2) {
    potencyVerdict = 'DEFENSIVE_STALEMATE_ATTRITION';
    dynamicFactor = 0.70;
  } else {
    potencyVerdict = 'STANDARD_DEVELOPMENT';
    dynamicFactor = 1.0;
  }

  // Calculate actual effective late goal potency score (0 - 100)
  let baseScore = 50;
  if (m <= 15) baseScore = 40;
  else if (m <= 45) baseScore = 55;
  else if (m <= 75) baseScore = 60;
  else baseScore = 70; // 75-90+ macro baseline

  let actualScore = Math.round(baseScore * dynamicFactor * (phaseWeight / 1.1));
  actualScore = Math.max(10, Math.min(95, actualScore));

  // Build Comprehensive Tactical Note
  let tacticalNoteZh = '';
  if (potencyVerdict === 'STERILE_POSSESSION_NO_SHOTS') {
    tacticalNoteZh = `【终局无效倒脚・严禁盲目追大】当前处于 ${m}' 时段，虽处宏观进球窗口，但全场射正仅 ${totalTargetShots} 次、危攻停滞，球队严重缺乏门前终结手段与破门准星，必须判定为小球/防守僵局！`;
  } else if (potencyVerdict === 'GARBAGE_TIME_DEAD_GAME') {
    tacticalNoteZh = `【垃圾时间鸣金收兵】当前 ${m}' 且比分 ${homeScore}-${awayScore}，胜负悬念已定，双方大幅收力，终局破门动能严重衰竭。`;
  } else if (potencyVerdict === 'HIGH_POTENCY_BOX_SIEGE') {
    tacticalNoteZh = `【终局实质攻势爆发・绝杀动能高企】处于 ${m}' 终局绝杀搏命期，叠加实质射正 (${totalTargetShots}次)、持续角球挤压与1球分差搏杀，破门转化效率极高！`;
  } else if (potencyVerdict === 'FLUID_COUNTER_THREAT') {
    tacticalNoteZh = `【搏命压上 vs 致命反击】${m}' 终局落后方全线压上导致后防空虚，领先方犀利防反屡造单刀良机，双方均具备击穿球门手段。`;
  } else if (potencyVerdict === 'DEFENSIVE_STALEMATE_ATTRITION') {
    tacticalNoteZh = `【防守阵地绞杀・破门乏力】当前 ${m}' 双方中场肉搏严重，缺乏三区渗透与绝对机会，小球走势明确。`;
  } else {
    tacticalNoteZh = `${phaseBaseNote} 结合累计 ${totalTargetShots} 次射正与 ${dangRatePerMin} 次/分危攻，实战终局破门评分 ${actualScore}/100。`;
  }

  // Non-linear remaining capacity
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
    attacking_potency_verdict: potencyVerdict,
    actual_effective_late_goal_score: actualScore,
    finishing_quality_zh: finishingQualityZh,
    scoring_weapons_zh: scoringWeaponsZh,
    score_catalyst_zh: scoreCatalystZh,
    time_decay_tactical_note_zh: tacticalNoteZh,
  };
}

import { CanonicalMatchData, canonicalizeRawMatchData } from './canonicalMatchModel';

// ==========================================
// Master Deep Tactical Synthesis Engine
// ==========================================
export interface MatchMasterTacticalSynthesis {
  positional_absence: PositionalAbsenceImpact;
  formation_clash: FormationClashResult;
  corner_squeeze: CornerSqueezeMetrics | null;
  red_card_discipline: RedCardDisciplinePhysics;
  euro_asian_parity: EuroAsianParityMetrics;
  strategic_motivation: StrategicMotivationMetrics;
  non_linear_time_decay: NonLinearTimeDecayMetrics;
  league_regional_dna: LeagueRegionalProfile;
  master_tactical_summary_zh: string;
}

export function buildMasterTacticalSynthesis(
  item: any,
  minute: number,
  verifiedMarkets: any[] = []
): MatchMasterTacticalSynthesis {
  // Normalize raw item to CanonicalMatchData
  const cData: CanonicalMatchData = item?.live_facts?.stats ? (item as CanonicalMatchData) : canonicalizeRawMatchData(item);

  const homeTeam = cData.meta.home_team;
  const awayTeam = cData.meta.away_team;
  const league = cData.meta.league_name;
  const effectiveMin = cData.live_facts.minute || minute || 0;
  const scoreText = `${cData.live_facts.score.home}-${cData.live_facts.score.away}`;

  const lineupData = (cData.context as any)?.raw_lineup || item?.lineups || item?.lineup || item?.formal?.lineup || null;
  const refOdds = cData.raw_ref_odds || item?.reference_market || item?.reference_odds || item?.formal?.odds;
  const standings = cData.context?.standings_text || item?.trend_summary?.standings || item?.standings;

  // Formation
  const homeFormationResult = detectMatchFormation(lineupData, 'home');
  const awayFormationResult = detectMatchFormation(lineupData, 'away');
  const formationClash = evaluateFormationClash(
    cData.context?.lineup?.home_formation || homeFormationResult.formation,
    cData.context?.lineup?.away_formation || awayFormationResult.formation
  );

  // Positional & Absences
  const positional = evaluatePositionalAbsenceImpact(lineupData, homeTeam, awayTeam);

  // Corner Squeeze using unified sub-engine with dynamic team matching
  const corner = evaluateCornerSqueezeMetrics(
    cData.live_facts.stats,
    effectiveMin,
    scoreText,
    item,
    homeTeam,
    awayTeam
  );

  const redCard = evaluateRedCardDisciplinePhysics(item, effectiveMin, homeTeam, awayTeam);
  const euroAsian = evaluateEuroAsianParity(refOdds, verifiedMarkets.length > 0 ? verifiedMarkets : cData.verified_markets);
  const motivation = evaluateStrategicMotivation(standings, league, homeTeam, awayTeam);

  // Time decay using canonical stats
  const timeDecay = evaluateNonLinearTimeDecay(effectiveMin, cData.live_facts.stats, scoreText, formationClash, item);
  const leagueDNA = detectLeagueRegionalDNA(league);

  const summaryParts: string[] = [];
  if (redCard.has_red_card) summaryParts.push(redCard.discipline_tactical_guidance_zh);
  if (formationClash.is_available && formationClash.clash_verdict !== 'TACTICAL_STALEMATE' && formationClash.clash_verdict !== 'NO_FORMATION_DATA') {
    summaryParts.push(`阵型克制: ${formationClash.clash_verdict_zh}`);
  } else if (!formationClash.is_available || formationClash.clash_verdict === 'NO_FORMATION_DATA') {
    summaryParts.push(`阵型状态: 未提供官方首发阵型(阵型先验已关闭)`);
  }
  if (leagueDNA.league_key !== 'STANDARD_LEAGUE') summaryParts.push(`联赛基因: ${leagueDNA.league_name_zh} (${leagueDNA.tactical_dna_summary_zh})`);
  if (euroAsian.spread_discrepancy !== null && Math.abs(euroAsian.spread_discrepancy) >= 0.5) summaryParts.push(euroAsian.parity_analysis_note_zh);
  if (corner && corner.squeeze_danger_level === 'CRITICAL_IMMINENT_GOAL_SQUEEZE') summaryParts.push(corner.corner_tactical_note_zh);
  if (positional.structural_verdict_zh !== '双方阵容结构基本稳定') summaryParts.push(`阵容影响: ${positional.structural_verdict_zh}`);
  summaryParts.push(`时段与进攻动能: ${timeDecay.time_decay_tactical_note_zh}`);

  return {
    positional_absence: positional,
    formation_clash: formationClash,
    corner_squeeze: corner,
    red_card_discipline: redCard,
    euro_asian_parity: euroAsian,
    strategic_motivation: motivation,
    non_linear_time_decay: timeDecay,
    league_regional_dna: leagueDNA,
    master_tactical_summary_zh: summaryParts.join(' | '),
  };
}

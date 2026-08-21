/**
 * Canonical Football Match Data Models & Normalization Pipeline
 * 统一标准足球赛事模型与数据归一化转换层
 * 彻底消除数据异构、字段重名与多源解析混乱
 */

import { analyzeAttackMomentumTimeline } from './quantitativeFeatures';

export interface CanonicalMatchStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shots_on_target: { home: number; away: number };
  corners: { home: number; away: number };
  dangerous_attacks: { home: number; away: number };
  yellow_cards: { home: number; away: number };
  red_cards: { home: number; away: number };
}

export interface CanonicalMarketOption {
  option_id: string;
  side: 'home' | 'away' | 'draw' | 'over' | 'under';
  line: string | null;
  odds: number;
}

export interface CanonicalMatchData {
  meta: {
    match_id: string;
    leisu_match_id: string;
    league_name: string;
    home_team: string;          // YBTY 原始队名（不可篡改）
    away_team: string;          // YBTY 原始队名（不可篡改）
    start_time_beijing: string;
    match_status: 'IN_PLAY' | 'PRE_MATCH' | 'FINISHED';
  };
  live_facts: {
    minute: number;
    score: { home: number; away: number };
    score_verified: boolean;
    score_source: string;
    stats: CanonicalMatchStats;
    momentum: {
      recent_5min_share: { home: number; away: number };
      recent_15min_share: { home: number; away: number };
      dominance_windows: Array<{
        segment_name: string;
        start_min: number;
        end_min: number;
        duration_mins: number;
        dominant_side: 'home' | 'away';
        summary_zh: string;
        conversion_type?: string;
        correlated_incidents?: string[];
      }>;
      momentum_trend?: string;
      tactical_conversion_verdict?: string;
    };
    attack_momentum_timeline?: any;
    attack_conversion: {
      field_tilt_share: { home: number; away: number };
      dangerous_attack_to_shot_ratio: { home: number; away: number };
      shot_on_target_accuracy: { home: number; away: number };
      finishing_conversion: { home: number; away: number };
    };
    events_timeline: string[];
  };
  context: {
    standings_text?: string;
    home_recent_form?: string;
    away_recent_form?: string;
    h2h_summary?: string;
    lineup: {
      status: 'CONFIRMED' | 'PROJECTED' | 'UNKNOWN';
      home_formation: string;
      away_formation: string;
      home_starters_count: number;
      away_starters_count: number;
      home_absences: { missing_gk: boolean; missing_cbs: number; key_midfielders_missing: number; top_scorers_missing: number };
      away_absences: { missing_gk: boolean; missing_cbs: number; key_midfielders_missing: number; top_scorers_missing: number };
    };
  };
  attack_momentum_timeline?: any;
  verified_markets: CanonicalMarketOption[];
  raw_ref_odds?: any;
}

/**
 * 将多源、异构的原始雷速/YBTY合并数据清洗为纯净的标准模型
 */
export function canonicalizeRawMatchData(raw: any): CanonicalMatchData {
  const matchInfo = raw?.match_info || raw || {};
  const livePhysical = raw?.live_match_physical_facts || {};
  const quant = raw?.quantitative_analysis || {};
  const liveStatsRaw = raw?.unified_stats || raw?.liveStats || raw?.live_facts?.stats || {};
  const incidents = raw?.focused_incidents || livePhysical?.focused_incidents || {};

  // 1. Meta (雷速 match_id 作为合并赛事的唯一主键)
  const match_id = String(raw.match_id || raw.id || '');
  const leisu_match_id = match_id;
  const league_name = String(matchInfo.league || raw.league || raw.league_name || '常规职业联赛');
  const home_team = String(matchInfo.ybty_home || raw.ybty_home || matchInfo.home || raw.home || '主队');
  const away_team = String(matchInfo.ybty_away || raw.ybty_away || matchInfo.away || raw.away || '客队');
  const start_time_beijing = String(matchInfo.start_time_beijing || raw.start_time_beijing || raw.time || '');

  // 2. Minute & Score
  let minute = Number(matchInfo.minute ?? raw.minute ?? 0);
  if (isNaN(minute) || minute < 0) minute = 0;

  let scoreHome = 0;
  let scoreAway = 0;
  if (typeof matchInfo.score === 'object' && matchInfo.score !== null) {
    scoreHome = Number(matchInfo.score.home ?? 0);
    scoreAway = Number(matchInfo.score.away ?? 0);
  } else if (typeof raw.score === 'object' && raw.score !== null) {
    scoreHome = Number(raw.score.home ?? 0);
    scoreAway = Number(raw.score.away ?? 0);
  } else if (typeof raw.score === 'string' && raw.score.includes('-')) {
    const parts = raw.score.split('-');
    scoreHome = parseInt(parts[0], 10) || 0;
    scoreAway = parseInt(parts[1], 10) || 0;
  }

  const score_verified = Boolean(matchInfo.score_verified ?? raw.score_verified ?? true);
  const score_source = String(matchInfo.score_source ?? raw.score_source ?? 'ybty+leisu_api');

  // 3. Normalized Technical Stats Extraction (With robust regex & event fallback)
  const parseSideStat = (statVal: any, side: 'home' | 'away', fallback = 0): number => {
    if (statVal === null || statVal === undefined) return fallback;
    if (typeof statVal === 'number') return isNaN(statVal) ? fallback : statVal;
    if (typeof statVal === 'object') {
      const v = statVal[side] ?? (side === 'home' ? statVal.home_team : statVal.away_team);
      const num = Number(v);
      return isNaN(num) ? fallback : num;
    }
    if (typeof statVal === 'string') {
      if (statVal.includes('-') || statVal.includes(':') || statVal.includes('/')) {
        const parts = statVal.split(/[-:\/]/);
        const num = parseInt(side === 'home' ? parts[0] : parts[1], 10);
        return isNaN(num) ? fallback : num;
      }
      const num = Number(statVal);
      return isNaN(num) ? fallback : num;
    }
    return fallback;
  };

  let posHome = parseSideStat(liveStatsRaw?.possession, 'home',
    Number(liveStatsRaw?.possession_home ?? liveStatsRaw?.home?.possession ?? 50)
  );
  let posAway = parseSideStat(liveStatsRaw?.possession, 'away',
    Number(liveStatsRaw?.possession_away ?? liveStatsRaw?.away?.possession ?? 50)
  );
  let shotsHome = parseSideStat(liveStatsRaw?.shots, 'home',
    Number(liveStatsRaw?.shots_home ?? liveStatsRaw?.home?.shots ?? 0)
  );
  let shotsAway = parseSideStat(liveStatsRaw?.shots, 'away',
    Number(liveStatsRaw?.shots_away ?? liveStatsRaw?.away?.shots ?? 0)
  );
  let targetHome = parseSideStat(liveStatsRaw?.shots_on_target, 'home',
    Number(liveStatsRaw?.shots_on_target_home ?? liveStatsRaw?.home?.shots_on_target ?? 0)
  );
  let targetAway = parseSideStat(liveStatsRaw?.shots_on_target, 'away',
    Number(liveStatsRaw?.shots_on_target_away ?? liveStatsRaw?.away?.shots_on_target ?? 0)
  );
  let cornersHome = parseSideStat(incidents?.cards_and_corners?.corners, 'home',
    parseSideStat(liveStatsRaw?.corners, 'home',
      Number(liveStatsRaw?.corners_home ?? liveStatsRaw?.home?.corners ?? liveStatsRaw?.home?.corner_kicks ?? 0)
    )
  );
  let cornersAway = parseSideStat(incidents?.cards_and_corners?.corners, 'away',
    parseSideStat(liveStatsRaw?.corners, 'away',
      Number(liveStatsRaw?.corners_away ?? liveStatsRaw?.away?.corners ?? liveStatsRaw?.away?.corner_kicks ?? 0)
    )
  );
  let dangHome = parseSideStat(liveStatsRaw?.dangerous_attacks, 'home',
    Number(liveStatsRaw?.dangerous_attacks_home ?? liveStatsRaw?.home?.dangerous_attacks ?? 0)
  );
  let dangAway = parseSideStat(liveStatsRaw?.dangerous_attacks, 'away',
    Number(liveStatsRaw?.dangerous_attacks_away ?? liveStatsRaw?.away?.dangerous_attacks ?? 0)
  );
  let yellowHome = parseSideStat(incidents?.cards_and_corners?.yellow_cards, 'home',
    parseSideStat(liveStatsRaw?.yellow_cards, 'home',
      Number(liveStatsRaw?.yellow_cards_home ?? liveStatsRaw?.home?.yellow_cards ?? 0)
    )
  );
  let yellowAway = parseSideStat(incidents?.cards_and_corners?.yellow_cards, 'away',
    parseSideStat(liveStatsRaw?.yellow_cards, 'away',
      Number(liveStatsRaw?.yellow_cards_away ?? liveStatsRaw?.away?.yellow_cards ?? 0)
    )
  );
  let redHome = parseSideStat(incidents?.cards_and_corners?.red_cards, 'home',
    parseSideStat(liveStatsRaw?.red_cards, 'home',
      Number(liveStatsRaw?.red_cards_home ?? liveStatsRaw?.home?.red_cards ?? 0)
    )
  );
  let redAway = parseSideStat(incidents?.cards_and_corners?.red_cards, 'away',
    parseSideStat(liveStatsRaw?.red_cards, 'away',
      Number(liveStatsRaw?.red_cards_away ?? liveStatsRaw?.away?.red_cards ?? 0)
    )
  );

  // Fallback to text parsing if attack_pressure_summary exists
  const summaryStr = String(livePhysical.attack_pressure_summary || raw.attack_pressure_summary || '');
  if (summaryStr) {
    const mPos = summaryStr.match(/控球:\s*(\d+)%?\s*vs\s*(\d+)%?/);
    if (mPos) { posHome = parseInt(mPos[1], 10); posAway = parseInt(mPos[2], 10); }
    const mShots = summaryStr.match(/射门:\s*(\d+)-(\d+)/);
    if (mShots && shotsHome === 0 && shotsAway === 0) { shotsHome = parseInt(mShots[1], 10); shotsAway = parseInt(mShots[2], 10); }
    const mTarget = summaryStr.match(/射正:\s*(\d+)-(\d+)/);
    if (mTarget && targetHome === 0 && targetAway === 0) { targetHome = parseInt(mTarget[1], 10); targetAway = parseInt(mTarget[2], 10); }
    const mDang = summaryStr.match(/危险进攻:\s*(\d+)-(\d+)/);
    if (mDang && dangHome === 0 && dangAway === 0) { dangHome = parseInt(mDang[1], 10); dangAway = parseInt(mDang[2], 10); }
    const mCorn = summaryStr.match(/角球:\s*(\d+)-(\d+)/);
    if (mCorn && cornersHome === 0 && cornersAway === 0) { cornersHome = parseInt(mCorn[1], 10); cornersAway = parseInt(mCorn[2], 10); }
    const mYellow = summaryStr.match(/黄牌:\s*(\d+)-(\d+)/);
    if (mYellow && yellowHome === 0 && yellowAway === 0) { yellowHome = parseInt(mYellow[1], 10); yellowAway = parseInt(mYellow[2], 10); }
  }

  // Fallback to events timeline count
  const eventsList: string[] = (Array.isArray(raw.timeline_events) ? raw.timeline_events : null) || incidents?.match_events || livePhysical?.focused_incidents?.match_events || [];
  if (cornersHome === 0 && cornersAway === 0 && eventsList.length > 0) {
    for (const ev of eventsList) {
      if (/角球/i.test(ev)) {
        if (ev.includes(home_team) || /主队/i.test(ev)) cornersHome++;
        else cornersAway++;
      }
    }
  }

  // 4. Attack Conversion / Momentum
  const attack_momentum_timeline =
    raw?.attack_momentum_timeline ||
    livePhysical?.attack_momentum_timeline ||
    raw?.live_facts?.attack_momentum_timeline ||
    raw?.live_match?.attack_momentum_timeline ||
    raw?.formal?.live_match?.attack_momentum_timeline ||
    raw?.formal?.attack_momentum_timeline ||
    raw?.result?.attack_momentum_timeline ||
    (raw?.formal?.trend?.data ? { available: true, source: 'LIVE_DETAIL_VUE.trend.data', data: raw.formal.trend.data, raw: raw.formal.trend } : null) ||
    (raw?.trend?.data ? { available: true, source: 'LIVE_DETAIL_VUE.trend.data', data: raw.trend.data, raw: raw.trend } : null) ||
    (raw?.live_match?.trend?.data ? { available: true, source: 'LIVE_DETAIL_VUE.trend.data', data: raw.live_match.trend.data, raw: raw.live_match.trend } : null) ||
    null;

  const momTimeline = attack_momentum_timeline || livePhysical.attack_momentum_timeline || {};
  const analyzedMom = attack_momentum_timeline ? analyzeAttackMomentumTimeline(attack_momentum_timeline, minute, eventsList, home_team, away_team) : null;

  const rec5Home = Number(analyzedMom?.recent_5min_momentum?.home ?? momTimeline?.recent_5min_momentum?.home ?? momTimeline?.recent_5min_share?.home ?? 50);
  const rec5Away = Number(analyzedMom?.recent_5min_momentum?.away ?? momTimeline?.recent_5min_momentum?.away ?? momTimeline?.recent_5min_share?.away ?? 50);
  const rec15Home = Number(analyzedMom?.recent_15min_pressure_share?.home ?? momTimeline?.recent_15min_pressure_share?.home ?? momTimeline?.recent_15min_share?.home ?? 50);
  const rec15Away = Number(analyzedMom?.recent_15min_pressure_share?.away ?? momTimeline?.recent_15min_pressure_share?.away ?? momTimeline?.recent_15min_share?.away ?? 50);
  const dominanceWindows = analyzedMom?.continuous_dominance_windows ?? (Array.isArray(momTimeline?.continuous_dominance_windows) ? momTimeline.continuous_dominance_windows : (Array.isArray(momTimeline?.dominance_windows) ? momTimeline.dominance_windows : []));
  const momTrend = analyzedMom?.momentum_trend ?? momTimeline.momentum_trend;
  const tacticalVerdict = analyzedMom?.tactical_conversion_verdict ?? momTimeline.tactical_conversion_verdict;

  const rawConv = livePhysical.attack_conversion || {};
  const fieldTiltHome = Number(rawConv.field_tilt_share?.home ?? (dangHome + dangAway > 0 ? dangHome / (dangHome + dangAway) : 0.5));
  const fieldTiltAway = Number(rawConv.field_tilt_share?.away ?? (1 - fieldTiltHome));
  const dangToShotHome = Number(rawConv.dangerous_attack_to_shot_ratio?.home ?? (dangHome > 0 ? shotsHome / dangHome : 0));
  const dangToShotAway = Number(rawConv.dangerous_attack_to_shot_ratio?.away ?? (dangAway > 0 ? shotsAway / dangAway : 0));
  const shotAccHome = Number(rawConv.shot_on_target_accuracy?.home ?? (shotsHome > 0 ? targetHome / shotsHome : 0));
  const shotAccAway = Number(rawConv.shot_on_target_accuracy?.away ?? (shotsAway > 0 ? targetAway / shotsAway : 0));
  const finishConvHome = Number(rawConv.finishing_conversion?.home ?? (targetHome > 0 ? scoreHome / targetHome : 0));
  const finishConvAway = Number(rawConv.finishing_conversion?.away ?? (targetAway > 0 ? scoreAway / targetAway : 0));

  // 5. Lineup & Context
  const lineupRaw = quant.lineup_transparency || raw.lineup || {};
  const formationClashRaw = quant.master_tactical_synthesis?.formation_clash || {};
  const homeFormation = String(formationClashRaw.home_formation || raw.home_formation || '4-2-3-1');
  const awayFormation = String(formationClashRaw.away_formation || raw.away_formation || '4-2-3-1');
  const absencesRaw = quant.master_tactical_synthesis?.positional_absence || {};

  // 6. Markets extraction
  const verifiedMarketsList: CanonicalMarketOption[] = [];
  const rawMarkets = raw.market_snapshots || raw.verified_ybty_markets || [];
  if (Array.isArray(rawMarkets)) {
    for (const mkt of rawMarkets) {
      if (Array.isArray(mkt.options)) {
        for (const opt of mkt.options) {
          verifiedMarketsList.push({
            option_id: String(opt.option_id || ''),
            side: opt.side || 'home',
            line: opt.line !== undefined ? String(opt.line) : null,
            odds: Number(opt.odds || 0),
          });
        }
      } else if (mkt.option_id) {
        verifiedMarketsList.push({
          option_id: String(mkt.option_id || ''),
          side: mkt.side || 'home',
          line: mkt.line !== undefined ? String(mkt.line) : null,
          odds: Number(mkt.odds || 0),
        });
      }
    }
  }

  return {
    meta: {
      match_id,
      leisu_match_id,
      league_name,
      home_team,
      away_team,
      start_time_beijing,
      match_status: minute > 0 ? 'IN_PLAY' : 'PRE_MATCH',
    },
    live_facts: {
      minute,
      score: { home: scoreHome, away: scoreAway },
      score_verified,
      score_source,
      stats: {
        possession: { home: posHome, away: posAway },
        shots: { home: shotsHome, away: shotsAway },
        shots_on_target: { home: targetHome, away: targetAway },
        corners: { home: cornersHome, away: cornersAway },
        dangerous_attacks: { home: dangHome, away: dangAway },
        yellow_cards: { home: yellowHome, away: yellowAway },
        red_cards: { home: redHome, away: redAway },
      },
      momentum: {
        recent_5min_share: { home: rec5Home, away: rec5Away },
        recent_15min_share: { home: rec15Home, away: rec15Away },
        dominance_windows: dominanceWindows,
        momentum_trend: momTrend,
        tactical_conversion_verdict: tacticalVerdict,
      },
      attack_momentum_timeline: attack_momentum_timeline || undefined,
      attack_conversion: {
        field_tilt_share: { home: Number(fieldTiltHome.toFixed(4)), away: Number(fieldTiltAway.toFixed(4)) },
        dangerous_attack_to_shot_ratio: { home: Number(dangToShotHome.toFixed(4)), away: Number(dangToShotAway.toFixed(4)) },
        shot_on_target_accuracy: { home: Number(shotAccHome.toFixed(4)), away: Number(shotAccAway.toFixed(4)) },
        finishing_conversion: { home: Number(finishConvHome.toFixed(4)), away: Number(finishConvAway.toFixed(4)) },
      },
      events_timeline: eventsList,
    },
    context: {
      standings_text: raw?.trend_summary?.standings || quant?.form_and_h2h_deep_metrics?.standings_text,
      home_recent_form: raw?.trend_summary?.home_form,
      away_recent_form: raw?.trend_summary?.away_form,
      h2h_summary: quant?.form_and_h2h_deep_metrics?.head_to_head_deep?.tactical_matchup_note_zh,
      lineup: {
        status: lineupRaw.tier === 'confirmed_official_lineup' ? 'CONFIRMED' : 'PROJECTED',
        home_formation: homeFormation,
        away_formation: awayFormation,
        home_starters_count: Number(lineupRaw.home_starters_count || 11),
        away_starters_count: Number(lineupRaw.away_starters_count || 11),
        home_absences: {
          missing_gk: Boolean(absencesRaw?.home_absences?.gk_missing),
          missing_cbs: Number(absencesRaw?.home_absences?.cb_defenders_missing || 0),
          key_midfielders_missing: Number(absencesRaw?.home_absences?.key_midfielders_missing || 0),
          top_scorers_missing: Number(absencesRaw?.home_absences?.top_scorers_missing || 0),
        },
        away_absences: {
          missing_gk: Boolean(absencesRaw?.away_absences?.gk_missing),
          missing_cbs: Number(absencesRaw?.away_absences?.cb_defenders_missing || 0),
          key_midfielders_missing: Number(absencesRaw?.away_absences?.key_midfielders_missing || 0),
          top_scorers_missing: Number(absencesRaw?.away_absences?.top_scorers_missing || 0),
        },
      },
    },
    attack_momentum_timeline: attack_momentum_timeline || undefined,
    verified_markets: verifiedMarketsList,
    raw_ref_odds: raw.reference_market || raw.reference_odds,
  };
}

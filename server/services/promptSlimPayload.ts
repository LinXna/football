import { normalizeYbtyMarketTypes } from './marketTypeNormalizer';
import { withVerifiedYbtyOptionIds } from './verifiedMarketAssessment';
import { resolveScoreVerification } from './scoreValidation';
import {
  calculateAttackConversion,
  calculateHandicapExpectancyMetrics,
  calculateMarketOverroundAndFairOdds,
  classifyLineupTransparency,
  detectTournamentRisk,
  analyzeH2HRecency,
  evaluateFiveMarketsSanityAndCoupling,
  computeIndependentPoissonDistribution,
  calculatePurePhysicalMatchModel,
  analyzeAttackMomentumTimeline,
  analyzeGoalDistribution,
} from './quantitativeFeatures';
import { deepMineFormAndH2H } from './formAndH2HDeepMining';
import { buildMasterTacticalSynthesis } from './advancedTacticalQuantitativeEngines';
import { evaluateLeisuCornerQuantitativePricing } from './leisuCornerMarket';

const BETTABLE_MARKET = /^(full|half)_(h2h|spread|total)$/;
const KEY_EVENT = /进球|破门|goal|红牌|red card|黄牌|yellow card|角球|corner|半场结束|中场|half.?time|下半场开始|second half|点球|penalty|var|取消进球|伤退|受伤|injur|换人|substitut|中断|暂停/i;

const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const nonEmptyObject = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length);

/** Clean text: format "01' - 1' - 1分钟，塔格拉诺联女足获得本场第1个角球" -> "01' - 角球 - 塔格拉诺联女足" */
export function formatCleanIncident(event: any, homeTeam = '', awayTeam = ''): string | null {
  let raw = '';
  let minuteStr = '';
  if (typeof event === 'string') {
    raw = event.trim();
  } else if (event && typeof event === 'object') {
    minuteStr = String(event.time || event.minute || event.clock || '').trim();
    const body = String(event.text || event.data || event.description || event.event || event.type_name || '').trim();
    raw = `${minuteStr}${minuteStr && body ? ' - ' : ''}${body}`.trim();
  }
  if (!raw) return null;

  // Extract minute if at start
  const minMatch = raw.match(/^(\d{1,3}(?:\+\d{1,2})?['′]?)/);
  if (minMatch) {
    let cleanMin = minMatch[1].replace('′', "'").replace(/^0+(\d)/, '$1');
    if (!cleanMin.endsWith("'")) cleanMin += "'";
    minuteStr = cleanMin;
    // Remove repeated minute prefixes, e.g. "01' - 1' - 1分钟，" or "62' - "
    raw = raw.replace(/^(\d{1,3}(?:\+\d{1,2})?['′]?\s*-\s*)+(\d{1,3}分钟[，,]?\s*)?/, '').trim();
  } else if (minuteStr) {
    minuteStr = minuteStr.replace(/^0+(\d)/, '$1');
    if (!minuteStr.endsWith("'")) minuteStr += "'";
  } else {
    minuteStr = "0'";
  }

  // Detect event type
  let eventType = '';
  if (/VAR|取消进球/i.test(raw)) eventType = 'VAR';
  else if (/红牌|red card/i.test(raw)) eventType = '红牌';
  else if (/黄牌|yellow card/i.test(raw)) eventType = '黄牌';
  else if (/点球|penalty/i.test(raw)) eventType = '点球';
  else if (/进球|破门|球进啦|goal/i.test(raw)) eventType = '进球';
  else if (/角球|corner/i.test(raw)) eventType = '角球';
  else if (/换人|substitut/i.test(raw)) eventType = '换人';
  else if (/伤退|受伤|injur/i.test(raw)) eventType = '伤退';
  else if (/半场结束|中场|half.?time/i.test(raw)) eventType = '半场结束';
  else if (/下半场开始|second half/i.test(raw)) eventType = '下半场开始';
  else return null;

  // Detect team/actor
  let targetTeam = '';
  if (/VAR\s*取消进球/i.test(raw)) {
    eventType = 'VAR';
    targetTeam = '取消进球';
  } else if (homeTeam && raw.includes(homeTeam)) {
    targetTeam = homeTeam;
  } else if (awayTeam && raw.includes(awayTeam)) {
    targetTeam = awayTeam;
  } else {
    // Check bracketed team name like (塔格拉诺联女足) or (西堪培拉流浪者女足)
    const bracketMatch = raw.match(/[（(]([^()（）]+)[)）]/);
    if (bracketMatch) {
      targetTeam = bracketMatch[1].trim();
    } else {
      // Clean up punctuation and strip leading event type words if already extracted
      let cleanBody = raw.replace(/^[，,\s\-\.\!！]+|[，,\s\-\.\!！]+$/g, '');
      cleanBody = cleanBody.replace(new RegExp(`^(?:${eventType}|第\\d+个${eventType}|第\\d+张${eventType})[！!，,\\s\\-]*`, 'i'), '');
      // Strip trailing punctuation
      cleanBody = cleanBody.replace(/[，,\s\-\.\!！]+$/g, '');
      targetTeam = cleanBody.trim();
    }
  }

  if (eventType === '半场结束' || eventType === '下半场开始') {
    return `${minuteStr} - ${eventType}`;
  }

  return targetTeam ? `${minuteStr} - ${eventType} - ${targetTeam}` : `${minuteStr} - ${eventType}`;
}

export function filterPromptKeyIncidents(item: any, limit = 50): string[] {
  const candidates = [
    ...asArray(item?.timeline_events),
    ...asArray(item?.incidents),
    ...asArray(item?.key_incidents),
    ...asArray(item?.text_live),
    ...asArray(item?.live_text?.entries),
  ];
  
  const home = item?.leisu_home || item?.ybty_home || '';
  const away = item?.leisu_away || item?.ybty_away || '';

  const seen = new Set<string>();
  const results: string[] = [];

  for (const cand of candidates) {
    const formatted = formatCleanIncident(cand, home, away);
    if (formatted && !seen.has(formatted)) {
      seen.add(formatted);
      results.push(formatted);
    }
  }

  // Sort chronologically by minute
  results.sort((a, b) => {
    const minA = parseInt(a.match(/^(\d{1,3})/)?.[1] || '0', 10);
    const minB = parseInt(b.match(/^(\d{1,3})/)?.[1] || '0', 10);
    return minA - minB;
  });

  return results.slice(-limit);
}

/** Extract clean, focused incidents: all red cards, cards/corners tally, and complete chronological event list */
export function extractFocusedIncidents(item: any): {
  red_cards?: string[];
  cards_and_corners?: { yellow_cards?: { home: number; away: number }; red_cards?: { home: number; away: number }; corners?: { home: number; away: number } };
  match_events?: string[];
} {
  const allIncidents = filterPromptKeyIncidents(item, 50);
  const redCards = allIncidents.filter((text) => /红牌/i.test(text));

  const stats = item?.unified_stats || item?.live_facts?.stats || item?.live_statistics || {};
  const getPair = (field: string) => {
    const val = stats[field];
    if (val && typeof val === 'object') {
      const h = Number(val.home ?? val.h ?? 0);
      const a = Number(val.away ?? val.a ?? 0);
      if (h > 0 || a > 0) return { home: h, away: a };
    }
    return undefined;
  };

  const corners = getPair('corners') || getPair('corner_kicks');
  const yellowCards = getPair('yellow_cards') || getPair('yellows');
  const redPair = getPair('red_cards') || getPair('reds');

  const cardsAndCorners: any = {};
  if (corners) cardsAndCorners.corners = corners;
  if (yellowCards) cardsAndCorners.yellow_cards = yellowCards;
  if (redPair) cardsAndCorners.red_cards = redPair;

  return {
    red_cards: redCards.length > 0 ? redCards : undefined,
    cards_and_corners: Object.keys(cardsAndCorners).length > 0 ? cardsAndCorners : undefined,
    match_events: allIncidents.length > 0 ? allIncidents : undefined,
  };
}

/** Summarize attack dominance and pressure metrics into a single concise line */
export function buildAttackPressureSummary(stats: any, score?: any): string | null {
  if (!nonEmptyObject(stats)) return null;
  const getVal = (field: string) => {
    const v = stats[field];
    if (v && typeof v === 'object') {
      const h = v.home ?? v.h;
      const a = v.away ?? v.a;
      if (h != null && a != null) return `${h}-${a}`;
    }
    return null;
  };

  const pos = stats.possession || stats.ball_possession;
  const posText = pos && typeof pos === 'object' ? `${pos.home ?? pos.h ?? ''}% vs ${pos.away ?? pos.a ?? ''}%` : null;
  const shots = getVal('shots') || getVal('total_shots');
  const onTarget = getVal('shots_on_target') || getVal('on_target');
  const danger = getVal('dangerous_attacks') || getVal('danger_attacks');
  const corners = getVal('corners') || getVal('corner_kicks');
  const yellows = getVal('yellow_cards') || getVal('yellows');

  const parts: string[] = [];
  if (posText && posText !== '% vs %') parts.push(`控球: ${posText}`);
  if (shots) parts.push(`射门: ${shots}`);
  if (onTarget) parts.push(`射正: ${onTarget}`);
  if (danger) parts.push(`危险进攻: ${danger}`);
  if (corners) parts.push(`角球: ${corners}`);
  if (yellows) parts.push(`黄牌: ${yellows}`);

  return parts.length > 0 ? parts.join(', ') : null;
}

function slimReferenceOdds(value: any): any {
  if (!nonEmptyObject(value)) return null;
  if (value.company || value.asian_handicap || value.match_winner || value.total_goals) {
    return {
      company: value.company || value.source || null,
      asian_handicap: value.asian_handicap || null,
      match_winner: value.match_winner || null,
      total_goals: value.total_goals || null,
    };
  }
  if (value.opening || value.current) {
    return {
      company: value.company_name || value.company || 'leisu_ref',
      opening: value.opening || null,
      current: value.current || null,
    };
  }
  const rows = value.normalized_rows || value.detail_page?.panels?.flatMap((panel: any) => panel?.normalized_rows || []) || [];
  return rows.length ? { source: value.source || 'leisu_reference', rows: rows.slice(0, 6) } : null;
}

function scoreText(row: any): string | null {
  if (typeof row === 'string') return row;
  if (!row || typeof row !== 'object') return null;
  const home = row.home_name || row.home || row.home_team;
  const away = row.away_name || row.away || row.away_team;
  const score = row.score || (row.home_score != null && row.away_score != null ? `${row.home_score}-${row.away_score}` : null);
  if (!home && !away && !score) return null;

  // Extract match date/year to evaluate time decay
  let dateStr = '';
  const rawDate = row.match_date || row.date || row.match_time || row.time || row.commence_time || row.start_time;
  if (rawDate) {
    if (typeof rawDate === 'number' || (typeof rawDate === 'string' && /^\d{10,13}$/.test(rawDate))) {
      const ts = Number(rawDate) > 1e11 ? Number(rawDate) : Number(rawDate) * 1000;
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    } else if (typeof rawDate === 'string') {
      const m = rawDate.match(/(\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?)/);
      if (m) {
        dateStr = m[1].replace(/[\/.]/g, '-');
      }
    }
  }

  let recencyTag = '';
  if (dateStr) {
    const matchYear = parseInt(dateStr.slice(0, 4), 10);
    const currentYear = new Date().getFullYear();
    const diffYears = currentYear - matchYear;
    if (diffYears <= 1) {
      recencyTag = `[${dateStr}·近1年]`;
    } else if (diffYears === 2) {
      recencyTag = `[${dateStr}·2年前]`;
    } else {
      recencyTag = `[${dateStr}·${diffYears}年前]`;
    }
  }

  const league = row.league_name || row.competition_name || row.league || '';
  const leagueTag = league ? `[${league}]` : '';

  const mainText = [home, score, away].filter(Boolean).join(' ');
  return [recencyTag || null, leagueTag || null, mainText].filter(Boolean).join(' ') || null;
}

/** Compress 60+ lines of recent form arrays into compact strings */
function slimRecentForm(form: any): string | undefined {
  if (!form) return undefined;
  if (typeof form === 'string') return form;
  if (typeof form === 'object') {
    const parts: string[] = [];
    if (form.recent6 && typeof form.recent6 === 'object') {
      const asia = Array.isArray(form.recent6.asia)
        ? form.recent6.asia.map((r: any) => typeof r === 'string' ? r : r.result || '-').join(' ')
        : '';
      const bs = Array.isArray(form.recent6.bs)
        ? form.recent6.bs.map((r: any) => typeof r === 'string' ? r : r.result || '-').join(' ')
        : '';
      if (asia) parts.push(`亚盘:[${asia}]`);
      if (bs) parts.push(`大小:[${bs}]`);
    }
    if (Array.isArray(form.summary_table)) {
      const tableSummary = form.summary_table.join('; ');
      if (tableSummary) parts.push(tableSummary);
    } else if (Array.isArray(form.table)) {
      const tableSummary = form.table.map((row: any) => {
        if (typeof row === 'string') return row;
        const title = row.row_title || row.title || '';
        const win = row.win ?? row.w ?? 0;
        const draw = row.draw ?? row.d ?? 0;
        const loss = row.loss ?? row.l ?? 0;
        const ratio = row.win_ratio || '';
        return [title, `胜:${win}`, `平:${draw}`, `负:${loss}`, ratio].filter(Boolean).join(' ');
      }).join('; ');
      if (tableSummary) parts.push(tableSummary);
    }
    return parts.length > 0 ? parts.join(' | ') : undefined;
  }
  return undefined;
}

function slimStandings(standings: any): string | undefined {
  if (!standings || typeof standings !== 'object') return undefined;
  const home = standings.home_team || standings.home;
  const away = standings.away_team || standings.away;
  if (!home && !away) return undefined;

  const formatTeam = (t: any, label: string) => {
    if (!t || typeof t !== 'object') return null;
    const name = t.team_name || t.name || '';
    const pos = t.total?.position ?? t.position ?? '';
    const played = t.total?.total ?? t.total_matches ?? '';
    const won = t.total?.won ?? t.w ?? 0;
    const draw = t.total?.draw ?? t.d ?? 0;
    const loss = t.total?.loss ?? t.l ?? 0;
    const pts = t.total?.points ?? t.points ?? '';
    const gf = t.total?.goals ?? t.goals_for ?? '';
    const ga = t.total?.goals_against ?? t.goals_against ?? '';

    let res = `${label}: ${name || label}`;
    if (pos) res += ` 第${pos}名`;
    if (played !== '') res += ` (${played}战 ${won}胜${draw}平${loss}负`;
    if (gf !== '' && ga !== '') res += ` 进${gf}失${ga}`;
    if (pts !== '') res += ` 积${pts}分`;
    if (played !== '') res += `)`;
    return res;
  };

  const hText = formatTeam(home, '主');
  const aText = formatTeam(away, '客');
  const league = home?.competition_name || away?.competition_name || '';
  const parts = [league ? `[${league}]` : null, hText, aText].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

function trendSummary(item: any): any {
  const tc = item?.tactical_context || item?.context || {};
  const rawH2H = asArray(tc.h2h_matches || tc.h2h_summary || item?.head_to_head);
  const h2h = rawH2H.map(scoreText).filter(Boolean).slice(0, 6);
  const homeForm = slimRecentForm(tc.home_recent_matches || tc.home_form || tc.home_recent_form);
  const awayForm = slimRecentForm(tc.away_recent_matches || tc.away_form || tc.away_recent_form);
  const standings = slimStandings(tc.standings || tc.standings_summary || tc.standings_text);

  if (!h2h.length && !homeForm && !awayForm && !standings) return null;
  return {
    h2h_recent: h2h.length ? h2h : undefined,
    standings: standings || undefined,
    home_form: homeForm,
    away_form: awayForm,
  };
}

function slimLineupDetails(lineupInput: any): any {
  if (!lineupInput || typeof lineupInput !== 'object') return null;
  const isConfirmed = lineupInput.confirmed === true || lineupInput.status === 'confirmed';

  const extractPlayerList = (val: any): string[] => {
    if (!Array.isArray(val)) return [];
    return val
      .map((p: any) => {
        if (typeof p === 'string') return p;
        if (!p || typeof p !== 'object') return '';
        const name = p.name || p.person_name || p.player_name || '';
        const num = p.shirt_number || p.number || '';
        const pos = p.position || '';
        const numStr = num ? `#${num}` : '';
        const posStr = pos ? `(${pos})` : '';
        return [numStr, name, posStr].filter(Boolean).join('');
      })
      .filter(Boolean);
  };

  const homeStarters = extractPlayerList(lineupInput.home?.starters || lineupInput.home_starters || lineupInput.home_starter_details);
  const awayStarters = extractPlayerList(lineupInput.away?.starters || lineupInput.away_starters || lineupInput.away_starter_details);
  const homeSubs = extractPlayerList(lineupInput.home?.substitutes || lineupInput.home_substitutes).slice(0, 7);
  const awaySubs = extractPlayerList(lineupInput.away?.substitutes || lineupInput.away_substitutes).slice(0, 7);
  const injuries = Array.isArray(lineupInput.injuries || lineupInput.missing_players)
    ? (lineupInput.injuries || lineupInput.missing_players).map((item: any) => typeof item === 'string' ? item : `${item.team || ''}:${item.name || ''}(${item.reason || '缺阵'})`).filter(Boolean)
    : [];

  if (homeStarters.length === 0 && awayStarters.length === 0 && injuries.length === 0) {
    if (Array.isArray(lineupInput.home) || Array.isArray(lineupInput.players)) {
      const homeCount = Array.isArray(lineupInput.home) ? lineupInput.home.length : 0;
      const awayCount = Array.isArray(lineupInput.away) ? lineupInput.away.length : 0;
      return {
        status: 'squad_pool_only',
        note: `大名单(主队${homeCount}人/客队${awayCount}人)，首发11人未公布`,
      };
    }
    return null;
  }

  return {
    confirmed: isConfirmed || (homeStarters.length >= 10 && awayStarters.length >= 10),
    home_starters: homeStarters.length > 0 ? homeStarters : undefined,
    away_starters: awayStarters.length > 0 ? awayStarters : undefined,
    home_substitutes: homeSubs.length > 0 ? homeSubs : undefined,
    away_substitutes: awaySubs.length > 0 ? awaySubs : undefined,
    missing_injuries: injuries.length > 0 ? injuries : undefined,
  };
}

export function stripNullsAndEmpty(obj: any): any {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    const cleaned = obj.map(stripNullsAndEmpty).filter((item) => item !== undefined);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof obj === 'object') {
    const res: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'definitions' || key === 'shot_total_note') continue;
      const cleaned = stripNullsAndEmpty(value);
      if (cleaned !== undefined) {
        res[key] = cleaned;
      }
    }
    return Object.keys(res).length > 0 ? res : undefined;
  }
  return obj;
}

import { CanonicalMatchData, canonicalizeRawMatchData } from './canonicalMatchModel';

export function buildSlimPromptMatch(item: any, mode: string): any {
  // 1. Convert any input to CanonicalMatchData single source of truth
  const cData: CanonicalMatchData = item?.live_facts?.stats ? (item as CanonicalMatchData) : canonicalizeRawMatchData(item);

  // Extract markets from market_snapshots, verified_ybty_markets, ybty_raw_markets, or markets
  const rawInputMarkets = Array.isArray(item?.market_snapshots) && item.market_snapshots.length > 0
    ? item.market_snapshots
    : (Array.isArray(item?.verified_ybty_markets) && item.verified_ybty_markets.length > 0
        ? item.verified_ybty_markets
        : (Array.isArray(item?.ybty_raw_markets) && item.ybty_raw_markets.length > 0
            ? item.ybty_raw_markets
            : (Array.isArray(item?.markets) ? item.markets : [])));

  const normalizedMarkets = normalizeYbtyMarketTypes(rawInputMarkets);
  const verifiedMarkets = withVerifiedYbtyOptionIds(normalizedMarkets
    .filter((market: any) => BETTABLE_MARKET.test(String(market?.market || '')) && market?.market_type_verified !== false)
    .map((market: any) => ({
      market: market.market,
      options: asArray(market.options)
        .filter((option) => option?.suspended !== true && option?.side_verified !== false && Number(option?.odds) > 1.05)
        .map((option) => ({
          side: option.side || null,
          line: option.line ?? option.selection ?? null,
          odds: Number(option.odds),
          option_id: option.option_id,
        })),
    }))
    .filter((market: any) => market.options.length));

  const scoreVerification = resolveScoreVerification(item, mode === 'prematch_eval');
  
  // Use canonical stats object directly
  const liveStatsObj = cData.live_facts.stats;

  const minute = cData.live_facts.minute || Number(item?.minute || 0);
  const scoreObj = cData.live_facts.score;
  const focusedIncidents = mode === 'prematch_eval' ? null : extractFocusedIncidents(item);
  const pressureSummary = buildAttackPressureSummary(liveStatsObj, scoreObj);

  const league = cData.meta.league_name;
  const homeTeam = cData.meta.home_team;
  const awayTeam = cData.meta.away_team;
  const attackConversion = calculateAttackConversion(liveStatsObj, scoreObj);
  const formAndH2HDeep = deepMineFormAndH2H(item);
  let handicapCalibration = mode === 'prematch_eval' ? null : calculateHandicapExpectancyMetrics(liveStatsObj, scoreObj, minute);

  // If live handicap calibration is absent (e.g. pre-match or before in-play statistics), calibrate baseline Poisson via Form & H2H Deep Mining
  if (!handicapCalibration && formAndH2HDeep?.form_weighted_poisson_prior) {
    const prior = formAndH2HDeep.form_weighted_poisson_prior;
    const poissonSim = computeIndependentPoissonDistribution(prior.lambda_home_prior, prior.lambda_away_prior);
    handicapCalibration = {
      projected_net_goal_margin: {
        home_minus_away: prior.projected_baseline_margin,
        favored_side: prior.projected_baseline_margin > 0.2 ? 'home' : prior.projected_baseline_margin < -0.2 ? 'away' : 'even',
      },
      independent_poisson_distribution: poissonSim,
      attack_dominance_ratio: {
        home: Number(((prior.lambda_home_prior / Math.max(0.1, prior.lambda_total_prior)) * 100).toFixed(1)),
        away: Number(((prior.lambda_away_prior / Math.max(0.1, prior.lambda_total_prior)) * 100).toFixed(1)),
      },
      handicap_sanity_notes: [
        `【主客场与战绩深度先验】主场进球期望λ=${prior.lambda_home_prior}，客场进球期望λ=${prior.lambda_away_prior}，基准净胜期望 ${prior.projected_baseline_margin > 0 ? '+' : ''}${prior.projected_baseline_margin} 球。`,
        prior.venue_impact_note_zh,
        formAndH2HDeep.head_to_head_deep.tactical_matchup_note_zh,
      ],
    };
  }

  const fiveMarketsCoupling = evaluateFiveMarketsSanityAndCoupling(verifiedMarkets, liveStatsObj, scoreObj);
  const lineupData = item?.lineups || item?.tactical_context?.lineups || null;
  const lineupTransparency = classifyLineupTransparency(lineupData);
  const tournamentRisk = detectTournamentRisk(league, lineupTransparency, homeTeam, awayTeam);
  const historicalH2HList = asArray(item?.tactical_context?.h2h_matches || item?.head_to_head || item?.trend_summary?.h2h);
  const h2hRecencyAnalysis = analyzeH2HRecency(historicalH2HList);

  const fairPricing = verifiedMarkets.map((m: any) => {
    const analysis = calculateMarketOverroundAndFairOdds(m.options);
    if (!analysis) return null;
    return {
      market: m.market,
      overround_pct: analysis.overround_pct,
      fair_options: analysis.fair_options.map((opt) => ({
        option_id: opt.option_id,
        line: opt.line,
        side: opt.side,
        odds: opt.odds,
        fair_odds: opt.fair_odds,
        fair_prob_pct: opt.fair_prob_pct,
      })),
    };
  }).filter(Boolean);

  const matchId = cData.meta.match_id || undefined;

  const purePhysicalModel = calculatePurePhysicalMatchModel(
    liveStatsObj,
    scoreObj,
    minute,
    verifiedMarkets,
    formAndH2HDeep?.form_weighted_poisson_prior,
    {
      goal_distribution: item?.goal_distribution || item?.tactical_context?.goal_distribution || cData.context?.goal_distribution,
      trend_summary: item?.trend_summary || item?.tactical_context?.trend_summary || cData.context?.trend_summary,
      league_standings: item?.league_standings || item?.tactical_context?.league_standings || cData.context?.league_standings,
    }
  );

  const rawIncidents = filterPromptKeyIncidents(item, 50);
  const attackMomentumTimeline = mode === 'prematch_eval' ? null : analyzeAttackMomentumTimeline(
    item?.attack_momentum_timeline || item?.live_facts?.attack_momentum_timeline || item?.live_match_physical_facts?.attack_momentum_timeline || cData.attack_momentum_timeline || cData.live_facts?.attack_momentum_timeline,
    minute,
    rawIncidents,
    homeTeam,
    awayTeam
  );

  const goalDistribution = analyzeGoalDistribution(
    item?.goal_distribution || item?.tactical_context?.goal_distribution
  );

  const rawPayload = {
    match_info: {
      match: `${homeTeam} vs ${awayTeam}`,
      match_id: matchId,
      leisu_match_id: cData.meta.leisu_match_id || matchId,
      league,
      ybty_home: homeTeam,
      ybty_away: awayTeam,
      start_time_beijing: cData.meta.start_time_beijing || item?.ybty_start_time_beijing || item?.provider_start_time || '',
      minute: minute > 0 ? minute : undefined,
      score: scoreObj,
      score_verified: scoreVerification.verified,
      score_source: scoreVerification.source,
      score_unverified_warning: (mode !== 'prematch_eval' && !scoreVerification.verified) ? '比分未交叉核验，严禁A/B级正式推荐' : undefined,
      preservation_instruction: 'CRITICAL: You must preserve match_id, match, ybty_home, and ybty_away verbatim. Do not alter or translate them.',
    },
    live_match_physical_facts: {
      attack_pressure_summary: pressureSummary || undefined,
      attack_conversion: attackConversion || undefined,
      attack_momentum_timeline: attackMomentumTimeline || undefined,
      focused_incidents: focusedIncidents && (focusedIncidents.red_cards || focusedIncidents.cards_and_corners || focusedIncidents.match_events) ? focusedIncidents : undefined,
      pure_physical_match_model: purePhysicalModel || undefined,
    },
    quantitative_analysis: {
      handicap_calibration: handicapCalibration || undefined,
      five_markets_coupling_audit: fiveMarketsCoupling || undefined,
      form_and_h2h_deep_metrics: {
        ...formAndH2HDeep,
        goal_distribution: goalDistribution || undefined,
      },
      master_tactical_synthesis: buildMasterTacticalSynthesis(cData, minute, verifiedMarkets) || undefined,
      leisu_corner_pricing: evaluateLeisuCornerQuantitativePricing(item, minute),
      lineup_transparency: lineupTransparency.tier !== 'unknown_or_unannounced' ? lineupTransparency : undefined,
      fair_market_pricing: fairPricing.length > 0 ? fairPricing : undefined,
    },
    reference_odds: slimReferenceOdds(item?.reference_odds),
    trend_summary: trendSummary(item),
    verified_ybty_markets: verifiedMarkets,
  };

  return stripNullsAndEmpty(rawPayload) || {};
}


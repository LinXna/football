import { normalizeYbtyMarketTypes } from './marketTypeNormalizer';
import { withVerifiedYbtyOptionIds } from './verifiedMarketAssessment';
import { resolveScoreVerification } from './scoreValidation';

const BETTABLE_MARKET = /^(full|half)_(h2h|spread|total)$/;
const KEY_EVENT = /进球|破门|goal|红牌|red card|黄牌|yellow card|半场结束|中场|half.?time|下半场开始|second half|点球|penalty|var|取消进球|伤退|受伤|injur|换人|substitut|中断|暂停/i;

const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const nonEmptyObject = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length);

function eventText(event: any): string {
  let text = '';
  if (typeof event === 'string') text = event.trim();
  else if (event && typeof event === 'object') {
    const time = event.time || event.minute || event.clock || '';
    const body = event.text || event.data || event.description || event.event || event.type_name || '';
    text = `${time}${time && body ? ' - ' : ''}${body}`.trim();
  }
  const duplicatedMinute = text.match(/^(\d{1,3}(?:\+\d{1,2})?['′]?)\s*-\s*(\d{1,3}(?:\+\d{1,2})?['′]?)\s*-\s*(.+)$/);
  if (duplicatedMinute && duplicatedMinute[1].replace('′', "'") === duplicatedMinute[2].replace('′', "'")) {
    return `${duplicatedMinute[1]} - ${duplicatedMinute[3]}`.trim();
  }
  return text;
}

export function filterPromptKeyIncidents(item: any, limit = 12): string[] {
  const formalEvents = item?.detail_context?.formal?.live_match?.text_live;
  const candidates = [
    ...asArray(item?.incidents),
    ...asArray(item?.key_incidents),
    ...asArray(item?.live_text?.entries),
    ...asArray(item?.live_text),
    ...asArray(formalEvents),
  ];
  return Array.from(new Set(candidates.map(eventText).filter((text) => text && KEY_EVENT.test(text)))).slice(-limit);
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
  const rows = value.normalized_rows || value.detail_page?.panels?.flatMap((panel: any) => panel?.normalized_rows || []) || [];
  return rows.length ? { source: value.source || 'reference_company', rows: rows.slice(0, 6) } : null;
}

function scoreText(row: any): string | null {
  if (typeof row === 'string') return row;
  if (!row || typeof row !== 'object') return null;
  const home = row.home_name || row.home || row.home_team;
  const away = row.away_name || row.away || row.away_team;
  const score = row.score || (row.home_score != null && row.away_score != null ? `${row.home_score}-${row.away_score}` : null);
  return [home, score, away].filter(Boolean).join(' ') || null;
}

function trendSummary(item: any): any {
  const historical = item?.recent_trends?.historical_analysis || item?.detail_context?.formal || {};
  const existing = item?.trend_summary || historical?.trend_summary;
  const h2h = asArray(historical?.head_to_head || item?.head_to_head).map(scoreText).filter(Boolean).slice(0, 3);
  if (!existing && !h2h.length) return null;
  return {
    h2h_recent_3: h2h,
    home_recent_form: existing?.home_recent_form || existing?.home || null,
    away_recent_form: existing?.away_recent_form || existing?.away || null,
  };
}

export function buildSlimPromptMatch(item: any, mode: string): any {
  const normalizedMarkets = normalizeYbtyMarketTypes(item?.ybty_raw_markets || item?.verified_ybty_markets || []);
  const verifiedMarkets = withVerifiedYbtyOptionIds(normalizedMarkets
    .filter((market: any) => BETTABLE_MARKET.test(String(market?.market || '')) && market?.market_type_verified !== false)
    .map((market: any) => ({
      market: market.market,
      options: asArray(market.options)
        .filter((option) => option?.suspended !== true && option?.side_verified !== false && Number(option?.odds) > 1)
        .map((option) => ({
          side: option.side || null,
          line: option.line ?? option.selection ?? null,
          odds: Number(option.odds),
          option_id: option.option_id,
        })),
    }))
    .filter((market: any) => market.options.length));

  const scoreVerification = resolveScoreVerification(item, mode === 'prematch_eval');
  const liveStatistics = item?.live_statistics || item?.detail_context?.formal?.live_match?.confirmed_statistics || null;
  return {
    match_info: {
      match: item?.match || `${item?.ybty_home || ''} vs ${item?.ybty_away || ''}`,
      league: item?.league || item?.ybty_league || item?.leisu_league || '',
      ybty_home: item?.ybty_home || '',
      ybty_away: item?.ybty_away || '',
      start_time_beijing: item?.ybty_start_time_beijing || item?.provider_start_time || '',
      minute: Number(item?.minute || 0),
      score: item?.score || null,
      score_verified: scoreVerification.verified,
      score_source: scoreVerification.source,
    },
    live_statistics: nonEmptyObject(liveStatistics) ? liveStatistics : null,
    key_incidents: filterPromptKeyIncidents(item),
    reference_odds: slimReferenceOdds(item?.reference_odds),
    trend_summary: trendSummary(item),
    verified_ybty_markets: verifiedMarkets,
  };
}

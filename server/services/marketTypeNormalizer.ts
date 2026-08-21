const PRIMARY_MARKET_SEQUENCE = ['full_h2h', 'full_spread', 'full_total', 'half_h2h', 'half_spread', 'half_total'];

const MARKET_TYPE_MAP: Record<string, string> = {
  'full_spread': 'full_spread',
  'spread': 'full_spread',
  '全场让球': 'full_spread',
  '让球': 'full_spread',
  'half_spread': 'half_spread',
  '半场让球': 'half_spread',
  'full_total': 'full_total',
  'total': 'full_total',
  'over_under': 'full_total',
  '全场大小球': 'full_total',
  '全场大小': 'full_total',
  '大小球': 'full_total',
  'half_total': 'half_total',
  '半场大小球': 'half_total',
  '半场大小': 'half_total',
  'full_h2h': 'full_h2h',
  'h2h': 'full_h2h',
  'moneyline': 'full_h2h',
  '全场独赢1x2': 'full_h2h',
  '全场独赢': 'full_h2h',
  '独赢': 'full_h2h',
  'half_h2h': 'half_h2h',
  '半场独赢': 'half_h2h',
};

/** Restores the verified market sequence and standardizes market types */
export function normalizeYbtyMarketTypes(rawMarkets: any): any[] {
  const markets = Array.isArray(rawMarkets) ? rawMarkets.map((market: any) => ({ ...market })) : [];
  if (markets.length === 0) return [];

  // Check if already contains normalized market types or standard snapshot structure
  const formattedMarkets = markets.map((m: any) => {
    const rawKey = String(m.market_type || m.market || m.category || '').toLowerCase().trim();
    const mapped = MARKET_TYPE_MAP[rawKey];
    if (mapped) {
      return {
        ...m,
        market: mapped,
        market_type: mapped,
        market_type_verified: true,
        market_type_source: m.market_type_source || 'canonical_market_snapshot',
        market_type_confidence: 1,
      };
    }
    return m;
  });

  if (formattedMarkets.length < PRIMARY_MARKET_SEQUENCE.length) {
    return formattedMarkets;
  }

  const primary = formattedMarkets.slice(0, PRIMARY_MARKET_SEQUENCE.length);
  const semanticTypes = primary.map((market: any) => String(market.market || '').replace(/^unclassified_/, ''));
  const hasPrimaryLayout = primary.every((market: any) => String(market.market_title_raw || '').includes('handicap-col-3'));
  const hasExpectedSemantics = semanticTypes.join('|') === 'h2h|spread|total|h2h|spread|total';
  const hasExpectedIndexes = primary.map((market: any) => Number(market.line_index)).join('|') === '0|0|0|1|1|1';
  if (!hasPrimaryLayout || !hasExpectedSemantics || !hasExpectedIndexes) return formattedMarkets;
  return formattedMarkets.map((market: any, index: number) => index < PRIMARY_MARKET_SEQUENCE.length ? {
    ...market,
    market: PRIMARY_MARKET_SEQUENCE[index],
    market_type: PRIMARY_MARKET_SEQUENCE[index],
    market_type_verified: true,
    market_type_source: 'verified_dom_primary_six_column_layout',
    market_type_confidence: 1,
  } : market);
}

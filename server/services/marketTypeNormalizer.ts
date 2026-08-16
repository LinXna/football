const PRIMARY_MARKET_SEQUENCE = ['full_h2h', 'full_spread', 'full_total', 'half_h2h', 'half_spread', 'half_total'];

/** Restores the verified six-column market sequence emitted by the provider DOM. */
export function normalizeYbtyMarketTypes(rawMarkets: any): any[] {
  const markets = Array.isArray(rawMarkets) ? rawMarkets.map((market: any) => ({ ...market })) : [];
  if (markets.length < PRIMARY_MARKET_SEQUENCE.length) return markets;
  const primary = markets.slice(0, PRIMARY_MARKET_SEQUENCE.length);
  const semanticTypes = primary.map((market: any) => String(market.market || '').replace(/^unclassified_/, ''));
  const hasPrimaryLayout = primary.every((market: any) => String(market.market_title_raw || '').includes('handicap-col-3'));
  const hasExpectedSemantics = semanticTypes.join('|') === 'h2h|spread|total|h2h|spread|total';
  const hasExpectedIndexes = primary.map((market: any) => Number(market.line_index)).join('|') === '0|0|0|1|1|1';
  if (!hasPrimaryLayout || !hasExpectedSemantics || !hasExpectedIndexes) return markets;
  return markets.map((market: any, index: number) => index < PRIMARY_MARKET_SEQUENCE.length ? {
    ...market,
    market: PRIMARY_MARKET_SEQUENCE[index],
    market_type_verified: true,
    market_type_source: 'verified_dom_primary_six_column_layout',
    market_type_confidence: 1,
  } : market);
}

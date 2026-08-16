const MARKET_LABELS: Record<string, string> = {
  full_total: '全场大小球', half_total: '半场大小球', total: '全场大小球',
  full_spread: '全场让球', half_spread: '半场让球', spread: '全场让球',
  full_h2h: '全场独赢1X2', half_h2h: '半场独赢1X2', h2h: '全场独赢1X2',
};

export function normalizeMarketLabel(value: unknown): string {
  const market = String(value || '').trim();
  return MARKET_LABELS[market.toLowerCase()] || market;
}

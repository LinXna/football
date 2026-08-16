export function scoreDisplay(value: unknown, fallback = '0-0'): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (Array.isArray(value) && value.length >= 2) return `${value[0]}-${value[1]}`;
  if (value && typeof value === 'object') {
    const score = value as Record<string, unknown>;
    const home = score.home ?? score.home_score ?? score.h;
    const away = score.away ?? score.away_score ?? score.a;
    if (home !== undefined && away !== undefined) return `${home}-${away}`;
  }
  return fallback;
}

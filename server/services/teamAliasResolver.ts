import { matchSequentialName } from '../../src/lib/sequentialNameMatcher';

export function createTeamAliasResolver(
  manual: Record<string, string[]>,
  automatic: Record<string, string[]>,
  normalize: (name: string) => string,
) {
  const aliases = new Map<string, string>();
  for (const dictionary of [manual, automatic]) for (const [canonical, values] of Object.entries(dictionary)) {
    const normalizedCanonical = normalize(canonical);
    if (normalizedCanonical) aliases.set(normalizedCanonical, canonical);
    for (const value of Array.isArray(values) ? values : []) {
      const normalized = normalize(value);
      if (normalized) aliases.set(normalized, canonical);
    }
  }
  return (left: string, right: string): boolean => {
    const a = normalize(left); const b = normalize(right);
    if (!a || !b) return false;
    if (a === b || (aliases.get(a) || a) === (aliases.get(b) || b)) return true;
    if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
    if (matchSequentialName(left, right)) return true;
    const canLeft = aliases.get(a);
    const canRight = aliases.get(b);
    if (canLeft && matchSequentialName(canLeft, right)) return true;
    if (canRight && matchSequentialName(left, canRight)) return true;
    return false;
  };
}

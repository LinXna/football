import { DATA_FILES } from '../dataFiles';
import { readJsonFile, requireJsonWrites } from '../jsonStore';

type NormalizeTeamName = (value: string) => string;

const isUnresolvedProviderName = (value: unknown): boolean => {
  const text = String(value || '').trim().toLowerCase();
  return !text || text === 'unmatched' || text === 'not matched' || text.includes('未匹配');
};

/** Applies the current alias dictionary to decision files without changing recommendation content. */
export function synchronizeDecisionAliases(normalizeTeamName: NormalizeTeamName): void {
  const manual = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.manual, {});
  const automatic = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.automatic, {});
  const aliases = new Map<string, string>();

  for (const dictionary of [manual, automatic]) {
    for (const [canonical, values] of Object.entries(dictionary)) {
      const canonicalKey = normalizeTeamName(canonical);
      if (canonicalKey) aliases.set(canonicalKey, canonical);
      for (const alias of Array.isArray(values) ? values : []) {
        const aliasKey = normalizeTeamName(alias);
        if (aliasKey) aliases.set(aliasKey, canonical);
      }
    }
  }

  const resolveName = (ybtyName: unknown, existingName: unknown): string => {
    const source = String(ybtyName || '').trim();
    const existing = String(existingName || '').trim();
    if (existing && existing !== source && !isUnresolvedProviderName(existing)) return existing;
    return aliases.get(normalizeTeamName(source)) || existing || source;
  };

  const updateFile = (filePath: string): void => {
    const payload = readJsonFile<any>(filePath, { decisions: [], research_queue: [] });
    const collections = [payload.decisions, payload.research_queue].filter(Array.isArray);
    let changed = false;
    for (const decision of collections.flat()) {
      const [matchHome = '', matchAway = ''] = String(decision?.match || '').split(/\s+vs\s+/i);
      const nextHome = resolveName(decision?.ybty_home || matchHome, decision?.leisu_home);
      const nextAway = resolveName(decision?.ybty_away || matchAway, decision?.leisu_away);
      if (nextHome !== decision?.leisu_home || nextAway !== decision?.leisu_away) {
        decision.leisu_home = nextHome;
        decision.leisu_away = nextAway;
        changed = true;
      }
    }
    if (changed) requireJsonWrites([[filePath, payload]]);
  };

  updateFile(DATA_FILES.live.decisions);
  updateFile(DATA_FILES.prematch.decisions);
}

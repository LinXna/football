import type express from 'express';
import { DATA_FILES } from '../dataFiles';
import { readJsonFile, requireJsonWrites } from '../jsonStore';

/** Read-only aliases API. Mutations remain in server.ts until their cross-file rules are fully isolated. */
export function registerAliasReadRoutes(app: express.Express): void {
  app.get('/api/aliases', (_req, res) => {
    const manual = readJsonFile(DATA_FILES.aliases.manual, {});
    const auto = readJsonFile(DATA_FILES.aliases.automatic, {});
    res.json({ manual, auto });
  });
}

export interface AliasMutationDependencies {
  normalizeTeamName(name: string): string;
  synchronizeDecisions(): void;
}

/** Alias writes update the three alias stores, then refresh decision aliases once. */
export function registerAliasMutationRoutes(app: express.Express, deps: AliasMutationDependencies): void {
  const normalize = deps.normalizeTeamName;
  const removeSuppression = (canonicalName: string) => {
    const suppressed = readJsonFile<string[]>(DATA_FILES.aliases.suppressed, []);
    const normalized = normalize(canonicalName);
    const next = suppressed.filter((value) => normalize(value) !== normalized);
    if (next.length !== suppressed.length) requireJsonWrites([[DATA_FILES.aliases.suppressed, next]]);
  };

  app.post('/api/aliases', (req, res) => {
    try {
      const canonicalName = String(req.body?.canonical_name || '').trim();
      const alias = String(req.body?.alias || '').trim();
      if (!canonicalName || !alias) return res.status(400).json({ error: 'canonical_name and alias are required' });
      if (normalize(canonicalName) === normalize(alias)) return res.status(400).json({ error: 'An alias must differ from its canonical team name' });

      const manual = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.manual, {});
      const removed_from: string[] = [];
      for (const [existingCanonical, aliases] of Object.entries(manual)) {
        if (existingCanonical === canonicalName || !Array.isArray(aliases)) continue;
        const filtered = aliases.filter((value) => value !== alias);
        if (filtered.length !== aliases.length) {
          manual[existingCanonical] = filtered;
          removed_from.push(existingCanonical);
        }
      }
      if (Array.isArray(manual[alias])) {
        manual[alias] = manual[alias].filter((value) => value !== canonicalName);
        if (manual[alias].length === 0) delete manual[alias];
      }
      manual[canonicalName] = Array.from(new Set([...(manual[canonicalName] || []), alias]));
      requireJsonWrites([[DATA_FILES.aliases.manual, manual]]);
      removeSuppression(canonicalName);
      deps.synchronizeDecisions();
      res.json({ success: true, aliases: manual, removed_from });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to save alias' });
    }
  });

  app.put('/api/aliases', (req, res) => {
    try {
      const oldCanonical = String(req.body?.old_canonical_name || '').trim();
      const newCanonical = String(req.body?.canonical_name || '').trim();
      const aliases = Array.from(new Set((Array.isArray(req.body?.aliases) ? req.body.aliases : []).map((value: unknown) => String(value || '').trim()).filter(Boolean))) as string[];
      if (!oldCanonical || !newCanonical) return res.status(400).json({ error: 'Both old_canonical_name and canonical_name are required' });
      if (aliases.some((alias) => normalize(alias) === normalize(newCanonical))) return res.status(400).json({ error: 'An alias must differ from its canonical team name' });

      const manual = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.manual, {});
      const automatic = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.automatic, {});
      if (!(oldCanonical in manual) && !(oldCanonical in automatic)) return res.status(404).json({ error: 'Alias mapping not found' });
      const allCanonicals = Array.from(new Set([...Object.keys(manual), ...Object.keys(automatic)]));
      const occupied = allCanonicals.find((value) => value !== oldCanonical && normalize(value) === normalize(newCanonical));
      if (occupied) return res.status(409).json({ error: 'Canonical name conflicts with an existing mapping', conflict: occupied });
      const conflicts = aliases.filter((alias) => allCanonicals.some((canonical) => canonical !== oldCanonical && canonical !== newCanonical && (normalize(canonical) === normalize(alias) || [...(manual[canonical] || []), ...(automatic[canonical] || [])].some((value) => normalize(value) === normalize(alias)))));
      if (conflicts.length) return res.status(409).json({ error: 'One or more aliases are already in use', conflicts: Array.from(new Set(conflicts)) });

      const existingAuto = Array.isArray(automatic[oldCanonical]) ? automatic[oldCanonical] : [];
      if (newCanonical !== oldCanonical) { delete manual[oldCanonical]; delete automatic[oldCanonical]; }
      manual[newCanonical] = aliases;
      if (existingAuto.length) automatic[newCanonical] = existingAuto;
      requireJsonWrites([[DATA_FILES.aliases.manual, manual], [DATA_FILES.aliases.automatic, automatic]]);
      removeSuppression(newCanonical);
      if (newCanonical !== oldCanonical) {
        for (const decisionPath of [DATA_FILES.live.decisions, DATA_FILES.prematch.decisions]) {
          const file = readJsonFile<any>(decisionPath, { decisions: [], research_queue: [] });
          let changed = false;
          for (const collection of [file.decisions, file.research_queue].filter(Array.isArray)) for (const item of collection) {
            if (item.leisu_home === oldCanonical) { item.leisu_home = newCanonical; changed = true; }
            if (item.leisu_away === oldCanonical) { item.leisu_away = newCanonical; changed = true; }
          }
          if (changed) requireJsonWrites([[decisionPath, file]]);
        }
      }
      deps.synchronizeDecisions();
      res.json({ success: true, canonical_name: newCanonical, aliases, automatic_aliases: existingAuto });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to update alias' });
    }
  });

  app.delete('/api/aliases', (req, res) => {
    try {
      const canonical = String(req.body?.canonical_name || '').trim();
      if (!canonical) return res.status(400).json({ error: 'canonical_name is required' });
      const manual = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.manual, {});
      const automatic = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.automatic, {});
      if (!(canonical in manual) && !(canonical in automatic)) return res.status(404).json({ error: 'Alias mapping not found' });
      const removed_aliases = [...(manual[canonical] || []), ...(automatic[canonical] || [])];
      delete manual[canonical]; delete automatic[canonical];
      const suppressed = readJsonFile<string[]>(DATA_FILES.aliases.suppressed, []);
      if (!suppressed.some((value) => normalize(value) === normalize(canonical))) suppressed.push(canonical);
      requireJsonWrites([[DATA_FILES.aliases.manual, manual], [DATA_FILES.aliases.automatic, automatic], [DATA_FILES.aliases.suppressed, suppressed]]);
      deps.synchronizeDecisions();
      res.json({ success: true, canonical_name: canonical, removed_aliases });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to delete alias' });
    }
  });
}

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

  // 防投毒常识校验：防止把毫无字面关联的对阵双方（如门兴 vs 皇家社会）误录入别名库
  function isAliasSanityAcceptable(canonicalName: string, alias: string): boolean {
    const c = canonicalName.trim().toLowerCase();
    const a = alias.trim().toLowerCase();
    if (c === a) return true;
    const genericTokens = new Set(['fc', 'sc', 'cf', 'ac', 'cd', 'as', '联', '队', '竞技', '体育', '城', '俱乐部', '联合', '联队', '足球', '运动']);
    const cChars = new Set(c.split('').filter((ch) => !genericTokens.has(ch) && !/[\s\-_·.()（）]/.test(ch)));
    let commonCount = 0;
    for (const ch of a) {
      if (cChars.has(ch)) commonCount++;
    }
    if (commonCount > 0 || c.includes(a) || a.includes(c)) {
      return true;
    }
    return false;
  }

  app.post('/api/aliases', (req, res) => {
    try {
      const canonicalName = String(req.body?.canonical_name || '').trim();
      const alias = String(req.body?.alias || '').trim();
      const force = req.body?.force === true;
      if (!canonicalName || !alias) return res.status(400).json({ error: 'canonical_name and alias are required' });
      if (normalize(canonicalName) === normalize(alias)) {
        return res.json({ success: true, skipped: true, reason: 'Alias matches canonical team name after normalization' });
      }

      // 常识门禁校验：拦截零相似度且无公共字符的错误绑定
      if (!force && !isAliasSanityAcceptable(canonicalName, alias)) {
        return res.status(400).json({
          error: `拒绝录入错误别名：[${canonicalName}] 与 [${alias}] 毫无共有字根且字面无关，疑似对阵双方错配！`,
          code: 'CORRUPTED_ALIAS_REJECTED',
        });
      }

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

  app.post('/api/aliases/batch', (req, res) => {
    try {
      const items: Array<{ canonical_name: string; alias: string }> = Array.isArray(req.body?.aliases)
        ? req.body.aliases
        : Array.isArray(req.body)
        ? req.body
        : [];
      if (items.length === 0) {
        return res.json({ success: true, count: 0, message: 'No aliases provided' });
      }

      const manual = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.manual, {});
      let modified = false;
      let addedCount = 0;

      for (const item of items) {
        const canonicalName = String(item.canonical_name || '').trim();
        const alias = String(item.alias || '').trim();
        if (!canonicalName || !alias) continue;
        if (normalize(canonicalName) === normalize(alias)) continue;
        // 防投毒常识校验：零共有字根且字面无关者直接跳过，杜绝批量沉淀将对阵双方写入
        if (!isAliasSanityAcceptable(canonicalName, alias)) continue;

        // 清理已有别名中占用该 alias 的其他实体
        for (const [existingCanonical, aliases] of Object.entries(manual)) {
          if (existingCanonical === canonicalName || !Array.isArray(aliases)) continue;
          const filtered = aliases.filter((value) => value !== alias);
          if (filtered.length !== aliases.length) {
            manual[existingCanonical] = filtered;
            modified = true;
          }
        }
        if (Array.isArray(manual[alias])) {
          manual[alias] = manual[alias].filter((value) => value !== canonicalName);
          if (manual[alias].length === 0) delete manual[alias];
          modified = true;
        }

        const currentList = manual[canonicalName] || [];
        if (!currentList.includes(alias)) {
          manual[canonicalName] = Array.from(new Set([...currentList, alias]));
          modified = true;
          addedCount++;
        }
        removeSuppression(canonicalName);
      }

      if (modified) {
        requireJsonWrites([[DATA_FILES.aliases.manual, manual]]);
        deps.synchronizeDecisions();
      }

      res.json({ success: true, count: addedCount, total_processed: items.length });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to save batch aliases' });
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
      const specificAlias = req.body?.alias ? String(req.body.alias).trim() : null;
      if (!canonical) return res.status(400).json({ error: 'canonical_name is required' });
      const manual = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.manual, {});
      const automatic = readJsonFile<Record<string, string[]>>(DATA_FILES.aliases.automatic, {});

      let modified = false;
      const removed_aliases: string[] = [];

      // 1. 如果指定了单个要删除的 alias，精准物理剥离该映射 (双向检查)
      if (specificAlias) {
        // 正向以 canonical 为 key
        if (Array.isArray(manual[canonical])) {
          const beforeLen = manual[canonical].length;
          manual[canonical] = manual[canonical].filter((al) => normalize(al) !== normalize(specificAlias));
          if (manual[canonical].length !== beforeLen) {
            removed_aliases.push(specificAlias);
            modified = true;
          }
          if (manual[canonical].length === 0) delete manual[canonical];
        }
        if (Array.isArray(automatic[canonical])) {
          const beforeLen = automatic[canonical].length;
          automatic[canonical] = automatic[canonical].filter((al) => normalize(al) !== normalize(specificAlias));
          if (automatic[canonical].length !== beforeLen) {
            removed_aliases.push(specificAlias);
            modified = true;
          }
          if (automatic[canonical].length === 0) delete automatic[canonical];
        }

        // 反向以 specificAlias 为 key
        if (Array.isArray(manual[specificAlias])) {
          const beforeLen = manual[specificAlias].length;
          manual[specificAlias] = manual[specificAlias].filter((al) => normalize(al) !== normalize(canonical));
          if (manual[specificAlias].length !== beforeLen) {
            removed_aliases.push(canonical);
            modified = true;
          }
          if (manual[specificAlias].length === 0) delete manual[specificAlias];
        }
        if (Array.isArray(automatic[specificAlias])) {
          const beforeLen = automatic[specificAlias].length;
          automatic[specificAlias] = automatic[specificAlias].filter((al) => normalize(al) !== normalize(canonical));
          if (automatic[specificAlias].length !== beforeLen) {
            removed_aliases.push(canonical);
            modified = true;
          }
          if (automatic[specificAlias].length === 0) delete automatic[specificAlias];
        }

        if (modified) {
          requireJsonWrites([
            [DATA_FILES.aliases.manual, manual],
            [DATA_FILES.aliases.automatic, automatic],
          ]);
          deps.synchronizeDecisions();
        }
        return res.json({
          success: true,
          canonical_name: canonical,
          alias: specificAlias,
          removed_aliases,
          modified,
          message: modified
            ? `已成功从别名库中彻底抹除 [${canonical} ↔ ${specificAlias}] 的映射`
            : `别名库中未发现 [${canonical} ↔ ${specificAlias}] 映射`,
        });
      }

      // 2. 未指定特定 alias 时，删除该 canonical 的所有别名
      if (!(canonical in manual) && !(canonical in automatic)) {
        return res.status(404).json({ error: 'Alias mapping not found' });
      }
      removed_aliases.push(...(manual[canonical] || []), ...(automatic[canonical] || []));
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

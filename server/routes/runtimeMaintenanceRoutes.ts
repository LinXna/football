import type express from 'express';
import { DATA_FILES } from '../dataFiles';
import { readJsonFile, requireJsonWrites } from '../jsonStore';

const summary = (items: any[]) => ({
  total: items.length,
  a_grade: items.filter((item) => item.grade === 'A').length,
  b_grade: items.filter((item) => item.grade === 'B').length,
  watch: items.filter((item) => item.status === 'WATCH').length,
  updated_at: new Date().toISOString(),
});

/** Clears only re-generable analysis state; never touches ledgers, aliases, or sources. */
export function registerRuntimeMaintenanceRoutes(app: express.Express): void {
  app.post('/api/clear-outdated-matches', (req, res) => {
    try {
      const { target, clear_mode, match_names } = req.body || {};
      if (!['live', 'prematch', 'all'].includes(String(target))) return res.status(400).json({ error: 'target must be live, prematch, or all' });
      if (!['selected', 'all'].includes(String(clear_mode))) return res.status(400).json({ error: 'clear_mode must be selected or all' });
      const selected = new Set((Array.isArray(match_names) ? match_names : []).map((value: unknown) => String(value || '').trim()).filter(Boolean));
      const selective = clear_mode === 'selected';
      if (selective && selected.size === 0) return res.status(400).json({ error: 'Selected clear requires one or more match names' });
      const keep = (item: any) => !selected.has(String(item?.match || '').trim());
      let clearedLive = 0;
      let clearedPrematch = 0;

      if (target === 'live' || target === 'all') {
        const decisions = readJsonFile<any>(DATA_FILES.live.decisions, { decisions: [], summary: {} });
        const decisionItems = Array.isArray(decisions.decisions) ? decisions.decisions : [];
        clearedLive = selective ? decisionItems.filter((item: any) => !keep(item)).length : decisionItems.length;
        decisions.decisions = selective ? decisionItems.filter(keep) : [];
        decisions.single_best = null; decisions.parlay_5x = null; decisions.summary = summary(decisions.decisions);
        const candidates = readJsonFile<any>(DATA_FILES.live.candidates, { candidates: [] });
        candidates.candidates = selective ? (candidates.candidates || []).filter(keep) : [];
        candidates.summary = { total: candidates.candidates.length, updated_at: new Date().toISOString() };
        const status = readJsonFile<any>(DATA_FILES.live.status, {});
        status.last_updated = new Date().toISOString(); status.total_matches = decisions.decisions.length;
        const writes: Array<[string, unknown]> = [[DATA_FILES.live.decisions, decisions], [DATA_FILES.live.candidates, candidates], [DATA_FILES.live.status, status]];
        if (!selective) {
          const ybty = readJsonFile<any>(DATA_FILES.live.ybtySnapshot, { matches: [] }); ybty.matches = [];
          const leisu = readJsonFile<any>(DATA_FILES.live.leisuSnapshot, { events: [] }); leisu.events = [];
          writes.push([DATA_FILES.live.ybtySnapshot, ybty], [DATA_FILES.live.leisuSnapshot, leisu]);
        }
        requireJsonWrites(writes);
      }
      if (target === 'prematch' || target === 'all') {
        const decisions = readJsonFile<any>(DATA_FILES.prematch.decisions, { decisions: [], research_queue: [], summary: {} });
        const decisionItems = Array.isArray(decisions.decisions) ? decisions.decisions : [];
        const research = Array.isArray(decisions.research_queue) ? decisions.research_queue : [];
        clearedPrematch = selective ? [...decisionItems, ...research].filter((item) => !keep(item)).length : decisionItems.length + research.length;
        decisions.decisions = selective ? decisionItems.filter(keep) : [];
        decisions.research_queue = selective ? research.filter(keep) : [];
        decisions.single_best = null; decisions.parlay_5x = null;
        decisions.summary = { ...summary([...decisions.decisions, ...decisions.research_queue]), research: decisions.research_queue.length, pass: [...decisions.decisions, ...decisions.research_queue].filter((item) => item.status === 'PASS').length };
        const candidates = readJsonFile<any>(DATA_FILES.prematch.candidates, { candidates: [], live_events: [] });
        candidates.candidates = selective ? (candidates.candidates || []).filter(keep) : [];
        candidates.live_events = selective ? (candidates.live_events || []).filter(keep) : [];
        if (!selective) candidates.unmatched_markets = [];
        const brief = readJsonFile<any>(DATA_FILES.prematch.aiBrief, {});
        brief.candidates = selective ? (brief.candidates || []).filter(keep) : [];
        brief.highlights = selective ? (brief.highlights || []).filter(keep) : [];
        brief.summary = selective ? `Removed ${clearedPrematch} selected prematch matches` : 'Prematch analysis library cleared; awaiting the next run.';
        const status = readJsonFile<any>(DATA_FILES.prematch.status, {});
        status.last_updated = new Date().toISOString(); status.total_matches = decisions.decisions.length + decisions.research_queue.length;
        status.research = decisions.research_queue.length;
        status.pass = [...decisions.decisions, ...decisions.research_queue].filter((item) => item.status === 'PASS').length;
        if (!selective) Object.assign(status, { market_events: 0, prematch_events: 0, matched: 0, unmatched: 0 });
        const writes: Array<[string, unknown]> = [[DATA_FILES.prematch.decisions, decisions], [DATA_FILES.prematch.candidates, candidates], [DATA_FILES.prematch.aiBrief, brief], [DATA_FILES.prematch.status, status]];
        if (!selective) {
          const ybty = readJsonFile<any>(DATA_FILES.prematch.ybtySnapshot, { matches: [] }); ybty.matches = [];
          const leisu = readJsonFile<any>(DATA_FILES.prematch.leisuSnapshot, { events: [] }); leisu.events = [];
          writes.push([DATA_FILES.prematch.ybtySnapshot, ybty], [DATA_FILES.prematch.leisuSnapshot, leisu]);
        }
        requireJsonWrites(writes);
      }
      res.json({ success: true, cleared_live: clearedLive, cleared_prematch: clearedPrematch, total_cleared: clearedLive + clearedPrematch, selective });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to clear analysis data' });
    }
  });
}

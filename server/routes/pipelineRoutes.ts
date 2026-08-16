import type express from 'express';
import { DATA_FILES } from '../dataFiles';
import { readJsonFile } from '../jsonStore';

type PipelineDependencies = {
  cleanTeamName: (value: unknown) => string;
  matchIdentity: (item: unknown) => string;
  normalizeYbtyMarketTypes: (markets: unknown) => unknown[];
  hideInvalidRecommendation: (item: any) => any;
};

export function registerPipelineRoutes(app: express.Express, deps: PipelineDependencies): void {
  app.get('/api/pipeline/live', (_req, res) => {
    const status = readJsonFile(DATA_FILES.live.status, {});
    const decisions = readJsonFile<any>(DATA_FILES.live.decisions, { decisions: [], summary: {} });
    const candidates = readJsonFile<any>(DATA_FILES.live.candidates, { candidates: [] });
    const ybtyLatest = readJsonFile<any>(DATA_FILES.live.ybtySnapshot, { matches: [] });
    const rawMarketByMatch = new Map<string, unknown[]>();
    for (const match of Array.isArray(ybtyLatest.matches) ? ybtyLatest.matches : []) {
      rawMarketByMatch.set(
        `${deps.cleanTeamName(match.home)}|${deps.cleanTeamName(match.away)}`,
        deps.normalizeYbtyMarketTypes(match.markets),
      );
    }
    const visibleDecisions = (Array.isArray(decisions.decisions) ? decisions.decisions : []).map((item: any) => deps.hideInvalidRecommendation({
      ...item,
      ybty_raw_markets: rawMarketByMatch.get(deps.matchIdentity(item)) || deps.normalizeYbtyMarketTypes(item.ybty_raw_markets),
    }));

    res.json({
      status,
      decisions: visibleDecisions,
      summary: decisions.summary || {},
      single_best: decisions.single_best || null,
      parlay_5x: decisions.parlay_5x || null,
      candidates: candidates.candidates || [],
    });
  });

  app.get('/api/pipeline/prematch', (_req, res) => {
    const status = readJsonFile(DATA_FILES.prematch.status, {});
    const decisions = readJsonFile<any>(DATA_FILES.prematch.decisions, { decisions: [], summary: {} });
    const candidates = readJsonFile<any>(DATA_FILES.prematch.candidates, { candidates: [] });
    const brief = readJsonFile(DATA_FILES.prematch.aiBrief, {});
    const formalDecisions = Array.isArray(decisions.decisions) ? decisions.decisions : [];
    const researchQueue = Array.isArray(decisions.research_queue) ? decisions.research_queue : [];
    const formalMatches = new Set(formalDecisions.map((item: any) => String(item?.match || '')));
    const visibleDecisions = [
      ...formalDecisions,
      ...researchQueue.filter((item: any) => !formalMatches.has(String(item?.match || ''))),
    ].map((item: any) => deps.hideInvalidRecommendation({
      ...item,
      ybty_raw_markets: deps.normalizeYbtyMarketTypes(item.ybty_raw_markets),
    }));

    res.json({
      status,
      decisions: visibleDecisions,
      formal_decisions: formalDecisions,
      research_queue: researchQueue,
      summary: decisions.summary || {},
      candidates: candidates.candidates || [],
      brief,
    });
  });
}

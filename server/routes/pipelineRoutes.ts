import type express from 'express';
import { DATA_FILES } from '../dataFiles';
import { readJsonFile } from '../jsonStore';
import { recordMatchSnapshots, computeMatchSnapshotDelta } from '../services/snapshotDeltaEngine';
import { resolveScoreVerification } from '../services/scoreValidation';

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
    const leisuLatest = readJsonFile<any>(DATA_FILES.live.leisuSnapshot, { events: [] });
    const leisuScoresByMatch = new Map<string, { home: number; away: number; source: string }>();
    for (const event of Array.isArray(leisuLatest.events) ? leisuLatest.events : []) {
      const home = event.homeTeam?.name || event.home || event.home_team;
      const away = event.awayTeam?.name || event.away || event.away_team;
      const homeScore = event.homeScore?.current ?? event.home_score ?? event.score?.home;
      const awayScore = event.awayScore?.current ?? event.away_score ?? event.score?.away;
      if (!home || !away || !Number.isInteger(Number(homeScore)) || !Number.isInteger(Number(awayScore))) continue;
      leisuScoresByMatch.set(
        `${deps.cleanTeamName(home)}|${deps.cleanTeamName(away)}`,
        { home: Number(homeScore), away: Number(awayScore), source: String(event._score_source || 'leisu_export') },
      );
    }
    const rawMarketByMatch = new Map<string, unknown[]>();
    const leagueByMatch = new Map<string, string>();
    for (const match of Array.isArray(ybtyLatest.matches) ? ybtyLatest.matches : []) {
      const id = `${deps.cleanTeamName(match.home)}|${deps.cleanTeamName(match.away)}`;
      rawMarketByMatch.set(
        id,
        deps.normalizeYbtyMarketTypes(match.markets),
      );
      const l = match.league || match.league_title || match.tournament;
      if (l) leagueByMatch.set(id, String(l).trim());
    }
    for (const cand of Array.isArray(candidates.candidates) ? candidates.candidates : []) {
      const id = `${deps.cleanTeamName(cand.match?.home || cand.market_source?.home)}|${deps.cleanTeamName(cand.match?.away || cand.market_source?.away)}`;
      const l = cand.match?.league || cand.market_source?.league || cand.league || cand.ybty_league;
      if (l && !leagueByMatch.has(id)) leagueByMatch.set(id, String(l).trim());
    }

    const rawDecisions = Array.isArray(decisions.decisions) ? decisions.decisions : [];
    // Record current match snapshots into persistent timeline
    recordMatchSnapshots([...rawDecisions, ...(Array.isArray(candidates.candidates) ? candidates.candidates : [])]);

    const visibleDecisions = rawDecisions.map((item: any) => {
      const id = deps.matchIdentity(item);
      const fallbackLeague = leagueByMatch.get(id);
      const snapshotDelta = computeMatchSnapshotDelta(item);
      const leisuScore = leisuScoresByMatch.get(
        `${deps.cleanTeamName(item.leisu_home)}|${deps.cleanTeamName(item.leisu_away)}`,
      );
      const scoreVerification = resolveScoreVerification(
        leisuScore ? { ...item, leisu_score: leisuScore } : item,
      );
      return deps.hideInvalidRecommendation({
        ...item,
        score_verified: scoreVerification.verified,
        score_source: scoreVerification.source,
        league: item.league || fallbackLeague,
        ybty_league: item.ybty_league || fallbackLeague,
        ybty_raw_markets: rawMarketByMatch.get(id) || deps.normalizeYbtyMarketTypes(item.ybty_raw_markets),
        snapshot_delta: snapshotDelta,
      });
    });

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

    const leagueByMatch = new Map<string, string>();
    for (const cand of Array.isArray(candidates.candidates) ? candidates.candidates : []) {
      const id = `${deps.cleanTeamName(cand.match?.home || cand.market_source?.home)}|${deps.cleanTeamName(cand.match?.away || cand.market_source?.away)}`;
      const l = cand.match?.league || cand.market_source?.league || cand.league || cand.ybty_league;
      if (l && !leagueByMatch.has(id)) leagueByMatch.set(id, String(l).trim());
    }

    recordMatchSnapshots([...formalDecisions, ...researchQueue, ...(Array.isArray(candidates.candidates) ? candidates.candidates : [])]);

    const visibleDecisions = [
      ...formalDecisions,
      ...researchQueue.filter((item: any) => !formalMatches.has(String(item?.match || ''))),
    ].map((item: any) => {
      const id = deps.matchIdentity(item);
      const fallbackLeague = leagueByMatch.get(id);
      const snapshotDelta = computeMatchSnapshotDelta(item);
      return deps.hideInvalidRecommendation({
        ...item,
        league: item.league || fallbackLeague,
        ybty_league: item.ybty_league || fallbackLeague,
        ybty_raw_markets: deps.normalizeYbtyMarketTypes(item.ybty_raw_markets),
        snapshot_delta: snapshotDelta,
      });
    });

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

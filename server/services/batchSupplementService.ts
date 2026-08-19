import type express from 'express';
import { readJsonFile, requireJsonWrites } from '../jsonStore';
import { normalizeYbtyMarketTypes } from './marketTypeNormalizer';
import { calculateExactBeijingTime as calculateBatchBeijingTime } from './beijingTime';
import { summarizeDecisions } from './decisionSummary';
import { createTeamAliasResolver } from './teamAliasResolver';
import { isPrematchScorePlaceholder, parseScoreFields, parseValidScore } from './scoreValidation';

export function createBatchSupplementHandler(normalizeTeamName: (name: string) => string): express.RequestHandler {
  return (req, res) => {
  try {
    const { items, mode: importMode = 'overwrite' } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for batch update' });
    }
    if (items.length > 5000) return res.status(413).json({ error: 'A single import cannot exceed 5000 matches' });
    if (!['overwrite', 'merge'].includes(String(importMode))) {
      return res.status(400).json({ error: 'Import mode must be overwrite or merge' });
    }

    const manualAliases = readJsonFile<Record<string, string[]>>('team_aliases.json', {});
    const autoAliases = readJsonFile<Record<string, string[]>>('team_aliases_auto.json', {});

    let aliasUpdated = false;

    const matchTeamNames = createTeamAliasResolver(manualAliases, autoAliases, normalizeTeamName);

    const liveFile = readJsonFile<any>('output/ybty_leisu_decisions.json', { decisions: [], summary: {} });
    const prematchFile = readJsonFile<any>('output/ybty_leisu_prematch_decisions.json', { decisions: [], summary: {} });

    let liveUpdatedCount = 0;
    let prematchUpdatedCount = 0;

    let liveDecisions = importMode === 'overwrite' ? [] : (liveFile.decisions || []);
    let prematchDecisions = importMode === 'overwrite' ? [] : (prematchFile.decisions || []);

    for (const item of items) {
      const homeTeam = item.ybty_home || item.home || item.homeTeam?.name || item.home_team || item.host || '';
      const awayTeam = item.ybty_away || item.away || item.awayTeam?.name || item.away_team || item.guest || '';
      if (!String(homeTeam).trim() || !String(awayTeam).trim()) {
        return res.status(400).json({ error: 'Every imported match requires both home and away team names', match: item.match || null });
      }
      const declaredImportMode = String(item.export_mode || '').toLowerCase();
      const prematchScorePlaceholder = declaredImportMode === 'prematch'
        && isPrematchScorePlaceholder(item.score);
      const scoreWasProvided = (item.score !== undefined && item.score !== null && !prematchScorePlaceholder)
        || (item.home_score !== undefined && item.home_score !== null && item.away_score !== undefined && item.away_score !== null)
        || (item.homeScore?.current !== undefined && item.homeScore?.current !== null
          && item.awayScore?.current !== undefined && item.awayScore?.current !== null);
      let importedScore = parseValidScore(item.score)
        || parseScoreFields(item.home_score, item.away_score)
        || parseScoreFields(item.homeScore?.current, item.awayScore?.current);
      if (!importedScore && typeof item.score === 'string') {
        const scoreMatch = item.score.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
        importedScore = scoreMatch ? parseScoreFields(scoreMatch[1], scoreMatch[2]) : null;
      }
      if (scoreWasProvided && !importedScore) {
        return res.status(400).json({ error: 'Imported score must contain non-negative integer home and away values', match: item.match || `${homeTeam} vs ${awayTeam}` });
      }
      
      let leisuHome = item.leisu_home || item.leisu_home_team || item.matched_leisu_home || item.matched_leisu?.leisu_home || item.candidate?.match?.home || item.match_info?.leisu_home || item.leisu_raw?.home || '';
      let leisuAway = item.leisu_away || item.leisu_away_team || item.matched_leisu_away || item.matched_leisu?.leisu_away || item.candidate?.match?.away || item.match_info?.leisu_away || item.leisu_raw?.away || '';
      
      const rawMatch = item.match || `${homeTeam} vs ${awayTeam}`.trim();
      const matchName = rawMatch === 'vs' || !rawMatch ? '未知赛事' : rawMatch;

      if ((!leisuHome || !leisuAway) && item.leisu_match && typeof item.leisu_match === 'string') {
        const lParts = item.leisu_match.split(/\s+vs\s+/i);
        if (lParts.length >= 2) {
          if (!leisuHome) leisuHome = lParts[0].replace(/^\[.*?\]\s*/, '').trim();
          if (!leisuAway) leisuAway = lParts[1].trim();
        }
      }

      // Alias dictionaries are canonical -> aliases. Leisu is the canonical
      // display name for cross-provider matching; writing the reverse direction
      // creates cycles and lets YBTY names overwrite Leisu raw names.
      if (homeTeam && leisuHome && homeTeam !== leisuHome) {
        if (!manualAliases[leisuHome]) manualAliases[leisuHome] = [];
        if (!manualAliases[leisuHome].includes(homeTeam)) {
          manualAliases[leisuHome].push(homeTeam);
          aliasUpdated = true;
        }
      }
      if (awayTeam && leisuAway && awayTeam !== leisuAway) {
        if (!manualAliases[leisuAway]) manualAliases[leisuAway] = [];
        if (!manualAliases[leisuAway].includes(awayTeam)) {
          manualAliases[leisuAway].push(awayTeam);
          aliasUpdated = true;
        }
      }

      const calculatedBeijingTime = calculateBatchBeijingTime({
        ...item,
        start_time: item.countdown || item.commence_time || item.start_time || item.ybty_start_time || item.clock_status,
      });

      // The parser's explicit mode decision is authoritative. Prematch records
      // can carry provider minute/score fields from a contaminated reference
      // export; those fields must not silently turn the imported match live.
      const hasExplicitLiveFlag = typeof item.is_live === 'boolean';
      const isLive = declaredImportMode === 'prematch'
        ? false
        : declaredImportMode === 'live'
          ? true
          : hasExplicitLiveFlag
            ? item.is_live === true
            : item.source_type === 'live' || Boolean(item.minute && item.minute > 0);

      let matchedInLive = false;
      let matchedInPrematch = false;

      if (importMode !== 'overwrite') {
        // Check in existing live decisions
        liveDecisions.forEach((d: any, idx: number) => {
          const homeMatches = matchTeamNames(d.ybty_home || d.match?.split(' vs ')[0] || '', homeTeam);
          const awayMatches = matchTeamNames(d.ybty_away || d.match?.split(' vs ')[1] || '', awayTeam);
          const nameMatches = d.match && matchName && d.match === matchName;

          if (nameMatches || (homeMatches && awayMatches)) {
            matchedInLive = true;
            let hScore = d.score?.home ?? 0;
            let aScore = d.score?.away ?? 0;

            if (importedScore) { hScore = importedScore.home; aScore = importedScore.away; }

            const importedLeague = item.league || item.league_name || item.league_title || item.tournament || item.detail_context?.tournament || item.detail_context?.league_name || '';
            const existingLeague = d.league || d.ybty_league || d.leisu_league || '';
            const resolvedLeague = importedLeague || existingLeague || '';

            liveDecisions[idx] = {
              ...d,
              league: resolvedLeague,
              ybty_league: item.ybty_league || importedLeague || d.ybty_league || resolvedLeague,
              leisu_league: item.leisu_league || item.leisu_raw?.league || d.leisu_league || '',
              ybty_raw_markets: normalizeYbtyMarketTypes(item.ybty_raw_markets || item.markets || d.ybty_raw_markets),
              live_statistics: item.live_statistics || d.live_statistics || null,
              reference_odds: item.reference_odds || d.reference_odds || null,
              recent_trends: item.recent_trends || d.recent_trends || null,
              incidents: item.incidents || d.incidents || [],
              weather: item.weather || d.weather || null,
              lineups: item.lineups || d.lineups || null,
              player_candidates: item.player_candidates || d.player_candidates || [],
              live_text: item.live_text || d.live_text || null,
              detail_context: item.detail_context || d.detail_context || null,
              leisu_home: leisuHome || d.leisu_home || '',
              leisu_away: leisuAway || d.leisu_away || '',
              score: { home: hScore, away: aScore },
              score_verified: item.score_verified === true,
              score_source: item.score_source || 'batch_file_supplement',
              commence_time: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.commence_time || d.ybty_start_time_beijing || calculatedBeijingTime),
              ybty_start_time_beijing: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.ybty_start_time_beijing || calculatedBeijingTime),
              provider_start_time: item.provider_start_time || d.provider_start_time || null,
              status: d.status,
              grade: d.grade || 'C',
              recommendation: (() => {
                const market = item.market || item.recommendation?.market;
                const line = item.line ?? item.recommendation?.line;
                const odds = Number(item.odds ?? item.recommendation?.odds);
                return market && line !== undefined && line !== '' && Number.isFinite(odds) && odds > 1
                  ? { market, line, odds, basis: item.recommendation?.basis, scope: item.recommendation?.scope }
                  : d.recommendation || null;
              })(),
              risks: (d.risks || []).filter((r: string) => !r.includes('盘口水位缺失') && (item.score_verified !== true || !r.includes('比分未经校验')) && !r.includes('开赛时间缺失')),
              evidence: Array.from(new Set([...(d.evidence || []), `[数据补充/刷盘] 水位盘口与时间已补全 (${calculatedBeijingTime})`])),
            };
            liveUpdatedCount++;
          }
        });

        // Check in existing prematch decisions
        prematchDecisions.forEach((d: any, idx: number) => {
          const homeMatches = matchTeamNames(d.ybty_home || d.match?.split(' vs ')[0] || '', homeTeam);
          const awayMatches = matchTeamNames(d.ybty_away || d.match?.split(' vs ')[1] || '', awayTeam);
          const nameMatches = d.match && matchName && d.match === matchName;

          if (nameMatches || (homeMatches && awayMatches)) {
            matchedInPrematch = true;
            let hScore = d.score?.home ?? 0;
            let aScore = d.score?.away ?? 0;

            if (importedScore) { hScore = importedScore.home; aScore = importedScore.away; }

            const importedLeague = item.league || item.league_name || item.league_title || item.tournament || item.detail_context?.tournament || item.detail_context?.league_name || '';
            const existingLeague = d.league || d.ybty_league || d.leisu_league || '';
            const resolvedLeague = importedLeague || existingLeague || '';

            prematchDecisions[idx] = {
              ...d,
              league: resolvedLeague,
              ybty_league: item.ybty_league || importedLeague || d.ybty_league || resolvedLeague,
              leisu_league: item.leisu_league || item.leisu_raw?.league || d.leisu_league || '',
              ybty_raw_markets: normalizeYbtyMarketTypes(item.ybty_raw_markets || item.markets || d.ybty_raw_markets),
              live_statistics: item.live_statistics || d.live_statistics || null,
              reference_odds: item.reference_odds || d.reference_odds || null,
              recent_trends: item.recent_trends || d.recent_trends || null,
              incidents: item.incidents || d.incidents || [],
              weather: item.weather || d.weather || null,
              lineups: item.lineups || d.lineups || null,
              player_candidates: item.player_candidates || d.player_candidates || [],
              live_text: item.live_text || d.live_text || null,
              detail_context: item.detail_context || d.detail_context || null,
              leisu_home: leisuHome || d.leisu_home || '',
              leisu_away: leisuAway || d.leisu_away || '',
              score: { home: hScore, away: aScore },
              score_verified: item.score_verified === true,
              score_source: item.score_source || 'batch_file_supplement',
              commence_time: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.commence_time || d.ybty_start_time_beijing || calculatedBeijingTime),
              ybty_start_time_beijing: calculatedBeijingTime !== '推算时间' ? calculatedBeijingTime : (d.ybty_start_time_beijing || calculatedBeijingTime),
              provider_start_time: item.provider_start_time || d.provider_start_time || null,
              status: d.status,
              grade: d.grade || 'C',
              recommendation: (() => {
                const market = item.market || item.recommendation?.market;
                const line = item.line ?? item.recommendation?.line;
                const odds = Number(item.odds ?? item.recommendation?.odds);
                return market && line !== undefined && line !== '' && Number.isFinite(odds) && odds > 1
                  ? { market, line, odds, basis: item.recommendation?.basis, scope: item.recommendation?.scope }
                  : d.recommendation || null;
              })(),
              risks: (d.risks || []).filter((r: string) => !r.includes('盘口水位缺失') && (item.score_verified !== true || !r.includes('比分未经校验')) && !r.includes('开赛时间缺失')),
              evidence: Array.from(new Set([...(d.evidence || []), `[数据补充/刷盘] 水位盘口与时间已补全 (${calculatedBeijingTime})`])),
            };
            prematchUpdatedCount++;
          }
        });
      }

      // If item was not matched or in overwrite mode, append new Decision record
      if (!matchedInLive && !matchedInPrematch) {
        let hScore = 0;
        let aScore = 0;
        if (importedScore) { hScore = importedScore.home; aScore = importedScore.away; }

        const importedLeague = item.league || item.league_name || item.league_title || item.tournament || item.detail_context?.tournament || item.detail_context?.league_name || '';

        const newRecord = {
          match: matchName,
          ybty_home: homeTeam || (matchName.includes(' vs ') ? matchName.split(' vs ')[0] : matchName),
          ybty_away: awayTeam || (matchName.includes(' vs ') ? matchName.split(' vs ')[1] : ''),
          league: importedLeague || '',
          ybty_league: item.ybty_league || importedLeague || '',
          leisu_league: item.leisu_league || item.leisu_raw?.league || '',
          leisu_home: leisuHome || '',
          leisu_away: leisuAway || '',
          status: 'RESEARCH',
          grade: 'C',
          minute: item.minute || 0,
          score: { home: hScore, away: aScore },
          score_verified: item.score_verified === true,
          score_source: item.score_source || 'import_file',
          commence_time: calculatedBeijingTime,
          ybty_start_time_beijing: calculatedBeijingTime,
          provider_start_time: item.provider_start_time || null,
          recommendation: (() => {
            const market = item.market || item.recommendation?.market;
            const line = item.line ?? item.recommendation?.line;
            const odds = Number(item.odds ?? item.recommendation?.odds);
            return market && line !== undefined && line !== '' && Number.isFinite(odds) && odds > 1
              ? { market, line, odds, basis: item.recommendation?.basis, scope: item.recommendation?.scope }
              : null;
          })(),
          evidence: [`[最新导入] 数据来源: ${item.source_type || '整合导入'}，已计算准确开赛与已进行时间`],
          risks: [],
          ybty_raw_markets: normalizeYbtyMarketTypes(item.ybty_raw_markets || item.markets),
          live_statistics: item.live_statistics || null,
          reference_odds: item.reference_odds || null,
          recent_trends: item.recent_trends || null,
          incidents: item.incidents || [],
          weather: item.weather || null,
          lineups: item.lineups || null,
          player_candidates: item.player_candidates || [],
          live_text: item.live_text || null,
          detail_context: item.detail_context || null,
        };

        if (isLive) {
          liveDecisions.push(newRecord);
          liveUpdatedCount++;
        } else {
          prematchDecisions.push(newRecord);
          prematchUpdatedCount++;
        }
      }
    }

    // Save live decisions
    liveFile.decisions = liveDecisions;
    liveFile.summary = summarizeDecisions(liveDecisions);
    // Save prematch decisions
    prematchFile.decisions = prematchDecisions;
    prematchFile.summary = summarizeDecisions(prematchDecisions);
    // Also update pipeline status files
    const liveStatus = readJsonFile<any>('output/pipeline_status.json', {});
    liveStatus.last_updated = new Date().toISOString();
    liveStatus.total_matches = liveDecisions.length;
    const prematchStatus = readJsonFile<any>('output/prematch_pipeline_status.json', {});
    prematchStatus.last_updated = new Date().toISOString();
    prematchStatus.total_matches = prematchDecisions.length;
    // Persist the whole import in one transaction. Previously each file was
    // serialized/copied/renamed separately and the alias synchronizer then read
    // and sometimes rewrote the same large decision files a second time.
    const writes: Array<[string, any]> = [
      ['output/ybty_leisu_decisions.json', liveFile],
      ['output/ybty_leisu_prematch_decisions.json', prematchFile],
      ['output/pipeline_status.json', liveStatus],
      ['output/prematch_pipeline_status.json', prematchStatus],
    ];
    if (aliasUpdated) writes.push(['team_aliases.json', manualAliases]);
    requireJsonWrites(writes);

    res.json({
      success: true,
      import_mode: importMode,
      live_count: liveDecisions.length,
      prematch_count: prematchDecisions.length,
      total_updated: liveDecisions.length + prematchDecisions.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
  };
}

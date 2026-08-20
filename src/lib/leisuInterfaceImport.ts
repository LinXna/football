type JsonRecord = Record<string, any>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const scoreValue = (scores: JsonRecord): number => {
  const value = Number(scores.score ?? scores.current ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const latestMinute = (entries: unknown): number => {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((latest, entry) => {
    const match = String(asRecord(entry).time || '').match(/(\d{1,3})/);
    return match ? Math.max(latest, Number(match[1])) : latest;
  }, 0);
};

const observedRate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;

/** Convert the extension's results[].formal contract into CODEX's Leisu import contract. */
export function normalizeLeisuInterfaceExport(payload: unknown): JsonRecord[] | null {
  const root = asRecord(payload);
  if (!Array.isArray(root.results) || !String(root.export_type || '').startsWith('leisu_interface_')) {
    return null;
  }

  return root.results.map((rawResult: unknown) => {
    const result = asRecord(rawResult);
    const formal = asRecord(result.formal);
    const staticMatch = asRecord(formal.static_match);
    const liveMatch = asRecord(formal.live_match);
    const homeScores = asRecord(liveMatch.home_scores);
    const awayScores = asRecord(liveMatch.away_scores);
    const homeTeam = asRecord(staticMatch.homeTeam);
    const awayTeam = asRecord(staticMatch.awayTeam);
    const competition = asRecord(staticMatch.competition);
    const statusId = Number(liveMatch.status_id ?? asRecord(formal.analysis_match_context).record?.status_id ?? 0);
    const isLive = statusId > 1 && statusId < 8;
    const matchTime = Number(staticMatch.matchTime);
    const commenceTime = Number.isFinite(matchTime) && matchTime > 0
      ? new Date(matchTime * 1000).toISOString()
      : undefined;
    const minute = latestMinute(liveMatch.text_live);
    const lineup = formal.lineup || null;
    const lineupRecord = asRecord(lineup);
    const confirmedStatistics = asRecord(liveMatch.confirmed_statistics);
    const shotsOnTarget = asRecord(confirmedStatistics.shots_on_target);
    const shotsOffTarget = asRecord(confirmedStatistics.shots_off_target);
    const normalizedStatistics: JsonRecord = {
      ...confirmedStatistics,
      shots: {
        home: (Number(shotsOnTarget.home) || 0) + (Number(shotsOffTarget.home) || 0),
        away: (Number(shotsOnTarget.away) || 0) + (Number(shotsOffTarget.away) || 0),
      },
      shots_on_target: shotsOnTarget,
      shots_off_target: shotsOffTarget,
      shot_total_complete: false,
      shot_total_note: '射正+射偏，不含数据源未单列的封堵射门',
    };
    const scoreBySide = { home: scoreValue(homeScores), away: scoreValue(awayScores) };
    const efficiencyBySide = Object.fromEntries((['home', 'away'] as const).map((side) => {
      const opponent = side === 'home' ? 'away' : 'home';
      const onTarget = Number(shotsOnTarget[side]) || 0;
      const offTarget = Number(shotsOffTarget[side]) || 0;
      const recordedShots = onTarget + offTarget;
      const goals = scoreBySide[side];
      const consistent = onTarget >= goals;
      const saves = consistent ? onTarget - goals : null;
      return [side, {
        attack: {
          recorded_shots: recordedShots,
          shots_on_target: onTarget,
          shots_off_target: offTarget,
          shot_accuracy: observedRate(onTarget, recordedShots),
          goal_conversion_per_recorded_shot: observedRate(goals, recordedShots),
          goal_conversion_per_shot_on_target: consistent ? observedRate(goals, onTarget) : null,
          sample_reliable: recordedShots >= 5 && onTarget >= 3,
          data_consistent: consistent,
        },
        opposing_goalkeeper: {
          side: opponent,
          shots_on_target_faced: onTarget,
          goals_conceded: goals,
          saves,
          save_rate: saves == null ? null : observedRate(saves, onTarget),
          sample_reliable: onTarget >= 3,
          data_consistent: consistent,
        },
      }];
    }));
    normalizedStatistics.efficiency = {
      by_attacking_side: efficiencyBySide,
      definitions: {
        recorded_shots: '射正+射偏；不冒充包含封堵射门的完整射门数',
        shot_accuracy: '射正/当前可记录射门',
        goal_conversion_per_recorded_shot: '进球/当前可记录射门',
        goal_conversion_per_shot_on_target: '进球/射正',
        goalkeeper_save_rate: '(面对射正-失球)/面对射正；未经PSxG校正',
      },
    };
    const odds = asRecord(formal.odds);
    const markets = asRecord(odds.markets);
    const marketPhase = (phase: 'initial' | 'pregame' | 'live') => ({
      asian_handicap: asRecord(markets.asian_handicap)[phase] || null,
      match_winner: asRecord(markets.match_winner)[phase] || null,
      total_goals: asRecord(markets.total_goals)[phase] || null,
      corners: asRecord(markets.corners)[phase] || null,
    });
    const initialMarkets = marketPhase('initial');
    const currentMarkets = marketPhase(isLive ? 'live' : 'pregame');
    const environment = asRecord(staticMatch.environment);
    const homePlayers = Array.isArray(lineupRecord.home) ? lineupRecord.home : [];
    const awayPlayers = Array.isArray(lineupRecord.away) ? lineupRecord.away : [];
    const normalizedLineups = {
      ...lineupRecord,
      available: Boolean(lineupRecord.confirmed),
      home: {
        starters: homePlayers.filter((player) => asRecord(player).starter === true || Number(asRecord(player).status) === 1),
        substitutes: homePlayers.filter((player) => asRecord(player).starter !== true && Number(asRecord(player).status) !== 1),
      },
      away: {
        starters: awayPlayers.filter((player) => asRecord(player).starter === true || Number(asRecord(player).status) === 1),
        substitutes: awayPlayers.filter((player) => asRecord(player).starter !== true && Number(asRecord(player).status) !== 1),
      },
      raw: lineupRecord,
    };
    const textLiveEntries = Array.isArray(liveMatch.text_live) ? liveMatch.text_live : [];
    const attackMomentum =
      liveMatch.attack_momentum_timeline ||
      formal.live_match?.attack_momentum_timeline ||
      formal.attack_momentum_timeline ||
      result.attack_momentum_timeline ||
      (formal.trend?.data ? { available: true, source: 'LIVE_DETAIL_VUE.trend.data', data: formal.trend.data, raw: formal.trend } : null) ||
      (liveMatch.trend?.data ? { available: true, source: 'LIVE_DETAIL_VUE.trend.data', data: liveMatch.trend.data, raw: liveMatch.trend } : null) ||
      null;

    return {
      id: result.match_id ?? staticMatch.id,
      match_id: String(result.match_id ?? staticMatch.id ?? ''),
      home: homeTeam.name || homeTeam.shortName || '',
      away: awayTeam.name || awayTeam.shortName || '',
      home_team: homeTeam.name || homeTeam.shortName || '',
      away_team: awayTeam.name || awayTeam.shortName || '',
      league: competition.name || competition.shortName || '',
      competition: competition.name || competition.shortName || '',
      score: { home: scoreValue(homeScores), away: scoreValue(awayScores) },
      home_score: scoreValue(homeScores),
      away_score: scoreValue(awayScores),
      minute,
      clock_status: minute ? `${minute}'` : '',
      status: isLive ? 'inprogress' : 'notstarted',
      is_live: isLive,
      export_mode: isLive ? 'live' : 'prematch',
      commence_time: commenceTime,
      start_time: commenceTime,
      provider_start_time: commenceTime,
      captured_at: root.captured_at,
      export_time: root.captured_at,
      source_type: 'leisu',
      score_source: liveMatch.source || 'leisu_interface_api',
      score_verified: Boolean(liveMatch.match_id && Number.isFinite(Number(homeScores.score)) && Number.isFinite(Number(awayScores.score))),
      live_statistics: normalizedStatistics,
      attack_momentum_timeline: attackMomentum,
      reference_odds: {
        ...odds,
        opening: initialMarkets,
        current: currentMarkets,
        detail: {
          normalized: {
            companies: [{
              company_id: odds.company_id,
              company_name: odds.company_name,
              total_goals: {
                opening: initialMarkets.total_goals,
                current: currentMarkets.total_goals,
              },
            }],
          },
        },
      },
      recent_trends: {
        recent: formal.trend_summary || null,
        historical_analysis: {
          analysis_match_context: formal.analysis_match_context || null,
          head_to_head: formal.head_to_head || [],
          future_schedule: formal.future_schedule || null,
          recent_matches: formal.recent_matches || { home: [], away: [] },
          league_standings: formal.league_standings || null,
          goal_distribution: formal.goal_distribution || null,
          trend_summary: formal.trend_summary || null,
        },
        analysis_data: formal.analysis_match_context || null,
      },
      incidents: textLiveEntries,
      weather: {
        ...environment,
        available: Object.keys(environment).length > 0,
        text: Object.values(environment).filter((value) => value !== null && value !== ''),
      },
      lineups: normalizedLineups,
      player_candidates: [
        ...(Array.isArray(lineupRecord.home) ? lineupRecord.home : []),
        ...(Array.isArray(lineupRecord.away) ? lineupRecord.away : []),
      ],
      live_text: {
        available: textLiveEntries.length > 0,
        entries: textLiveEntries.map((entry) => asRecord(entry).data || asRecord(entry).text || '').filter(Boolean),
        raw_entries: textLiveEntries,
      },
      detail_context: {
        export_type: root.export_type,
        export_version: root.export_version,
        available: result.available === true,
        complete: result.complete === true,
        completeness: result.completeness || null,
        formal,
      },
    };
  });
}

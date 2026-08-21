type JsonRecord = Record<string, any>;

const object = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;

export function buildPromptLiveEfficiency(statistics: unknown, score: unknown): JsonRecord | null {
  const stats = object(statistics);
  const currentScore = object(score);
  const onTarget = object(stats.shots_on_target);
  const offTarget = object(stats.shots_off_target);
  if (Object.keys(onTarget).length === 0 && Object.keys(offTarget).length === 0) return null;

  const teams = Object.fromEntries((['home', 'away'] as const).map((side) => {
    const opponent = side === 'home' ? 'away' : 'home';
    const sot = number(onTarget[side]);
    const off = number(offTarget[side]);
    const shots = sot + off;
    const goals = number(currentScore[side]);
    const consistent = goals <= sot;
    const saves = consistent ? sot - goals : null;
    return [side, {
      attack: {
        recorded_shots: shots,
        shots_on_target: sot,
        shots_off_target: off,
        shot_accuracy: rate(sot, shots),
        goal_conversion_per_recorded_shot: rate(goals, shots),
        goal_conversion_per_shot_on_target: consistent ? rate(goals, sot) : null,
        sample_reliable: shots >= 5 && sot >= 3,
        data_consistent: consistent,
      },
      opposing_goalkeeper: {
        side: opponent,
        shots_on_target_faced: sot,
        goals_conceded: goals,
        saves,
        save_rate: saves == null ? null : rate(saves, sot),
        sample_reliable: sot >= 3,
        data_consistent: consistent,
      },
    }];
  }));

  return {
    schema_version: 'leisu_live_efficiency_v1',
    by_attacking_side: teams,
    limitations: {
      recorded_shots: 'shots_on_target + shots_off_target; blocked shots are unavailable and are not fabricated',
      goalkeeper_save_rate: 'simple observed save rate, not PSxG-adjusted',
      usage: 'descriptive evidence only unless a chronologically validated calibration model is active',
    },
  };
}

export function buildPromptInterfaceContext(item: unknown, compact = false): JsonRecord {
  const match = object(item);
  const tactical = object(match.tactical_context || match.context);
  const statistics = object(match.unified_stats || match.live_facts?.stats || match.live_statistics);
  const lineup = match.lineups || match.context?.lineup || null;
  const lineupRecord = object(lineup);
  const extractPlayers = (val: unknown): any[] => {
    if (Array.isArray(val)) return val;
    const rec = object(val);
    if (Array.isArray(rec.starters) || Array.isArray(rec.substitutes)) {
      return [...(Array.isArray(rec.starters) ? rec.starters : []), ...(Array.isArray(rec.substitutes) ? rec.substitutes : [])];
    }
    return [];
  };
  const lineupPlayers = [
    ...extractPlayers(lineupRecord.home),
    ...extractPlayers(lineupRecord.away),
  ];
  const detailContext = object(match.detail_context);
  const formal = object(detailContext.formal);
  const formalKeys = Object.keys(formal);

  const rawCommentary = [
    ...(Array.isArray(match.timeline_events) ? match.timeline_events : []),
    ...(Array.isArray(match.live_facts?.events_timeline) ? match.live_facts.events_timeline : []),
    ...(Array.isArray(formal.live_match?.text_live) ? formal.live_match.text_live : []),
  ];
  const liveCommentary = rawCommentary.map((entry: unknown) => {
    if (typeof entry === 'string') return { time: null, type: null, position: null, text: entry };
    const event = object(entry);
    return {
      time: event.time ?? null,
      type: event.type ?? null,
      position: event.position ?? null,
      main: event.main ?? null,
      text: event.data ?? event.text ?? '',
    };
  }).filter((entry: JsonRecord) => entry.text || entry.time != null || entry.type != null);


  const fullContext = {
    schema_version: '2.0',
    source_formal_field_manifest: formalKeys,
    source_formal_payload: formalKeys.length > 0 ? formal : null,
    head_to_head: tactical.h2h_matches || tactical.h2h_summary || formal.head_to_head || match.recent_trends?.historical_analysis?.head_to_head || [],
    recent_matches: { 
      home: tactical.home_recent_matches || tactical.home_recent_form || formal.recent_matches?.home || match.recent_trends?.historical_analysis?.recent_matches?.home || [], 
      away: tactical.away_recent_matches || tactical.away_recent_form || formal.recent_matches?.away || match.recent_trends?.historical_analysis?.recent_matches?.away || [] 
    },
    league_standings: tactical.standings || tactical.standings_summary || tactical.standings_text || formal.league_standings || null,
    future_schedule: formal.future_schedule || null,
    goal_distribution: formal.goal_distribution || null,
    trend_summary: formal.trend_summary || null,
    match_statistics: {
      corners: statistics.corners || null,
      yellow_cards: statistics.yellow_cards || null,
      red_cards: statistics.red_cards || null,
      attacks: statistics.attacks || null,
      dangerous_attacks: statistics.dangerous_attacks || null,
      possession: statistics.possession || null,
      shots_on_target: statistics.shots_on_target || null,
      shots_off_target: statistics.shots_off_target || null,
      all_available_statistics: statistics,
    },
    squad_and_lineup: lineup || formal.lineup || null,
    player_candidates: Array.isArray(match.player_candidates) && match.player_candidates.length > 0
      ? match.player_candidates
      : lineupPlayers,
    reference_company_odds: match.reference_market || match.raw_ref_odds || match.reference_odds || formal.odds || null,
    opening_odds: formal.opening_odds || null,
    match_environment: match.weather || null,
    live_commentary: {
      captured_snapshot_only: true,
      complete_continuous_stream: false,
      event_count: liveCommentary.length,
      events: liveCommentary,
      limitation: 'Standard timeline events snapshot captured at export time.',
    },
    live_efficiency: object(statistics.efficiency).by_attacking_side
      ? statistics.efficiency
      : buildPromptLiveEfficiency(statistics, match.score || match.live_facts?.score),
    snapshot_delta_and_momentum: match.snapshot_delta || match.live_facts?.momentum || null,
    calibration_policy: 'Do not invent field weights or modify the score. Use as evidence; numerical scoring is allowed only after real settled samples pass chronological holdout validation.',
  };

  if (compact && fullContext.source_formal_payload) {
    const fc = fullContext as any;
    if (formal.recent_matches) delete fc.recent_matches;
    if (formal.lineup) delete fc.squad_and_lineup;
    if (formal.live_match) delete fc.live_commentary;
    fc.source_field_paths = {
      recent_matches: 'source_formal_payload.recent_matches',
      squad_and_lineup: 'source_formal_payload.lineup',
      live_commentary: 'source_formal_payload.live_match',
    };
  }

  return fullContext;
}

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
  const statistics = object(match.unified_stats || match.live_facts?.stats);
  const lineup = match.lineups || match.context?.lineup || null;
  const lineupRecord = object(lineup);
  const lineupPlayers = [
    ...(Array.isArray(lineupRecord.home) ? lineupRecord.home : []),
    ...(Array.isArray(lineupRecord.away) ? lineupRecord.away : []),
  ];
  const rawCommentary = Array.isArray(match.timeline_events)
    ? match.timeline_events
    : Array.isArray(match.live_facts?.events_timeline)
      ? match.live_facts.events_timeline
      : [];
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
    schema_version: 'standard_prompt_fields_v2',
    head_to_head: tactical.h2h_matches || tactical.h2h_summary || [],
    recent_matches: { home: tactical.home_recent_matches || tactical.home_recent_form || [], away: tactical.away_recent_matches || tactical.away_recent_form || [] },
    league_standings: tactical.standings || tactical.standings_summary || tactical.standings_text || null,
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
    squad_and_lineup: lineup,
    player_candidates: Array.isArray(match.player_candidates) && match.player_candidates.length > 0
      ? match.player_candidates
      : lineupPlayers,
    reference_company_odds: match.reference_market || match.raw_ref_odds || null,
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
  return fullContext;
}

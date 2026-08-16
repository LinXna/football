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
  const detail = object(match.detail_context);
  const formal = object(detail.formal);
  const historical = object(object(match.recent_trends).historical_analysis);
  const importedStatistics = object(match.live_statistics);
  const formalStatistics = object(object(formal.live_match).confirmed_statistics);
  const statistics = Object.keys(importedStatistics).length > 0 ? importedStatistics : formalStatistics;
  const lineup = Object.keys(object(formal.lineup)).length > 0 ? formal.lineup : match.lineups || null;
  const lineupRecord = object(lineup);
  const lineupPlayers = [
    ...(Array.isArray(lineupRecord.home) ? lineupRecord.home : []),
    ...(Array.isArray(lineupRecord.away) ? lineupRecord.away : []),
  ];
  const formalTextLive = object(formal.live_match).text_live;
  const importedTextLive = object(match.live_text);
  const rawCommentary = Array.isArray(formalTextLive)
    ? formalTextLive
    : Array.isArray(importedTextLive.raw_entries)
      ? importedTextLive.raw_entries
      : Array.isArray(match.live_text)
        ? match.live_text
        : Array.isArray(importedTextLive.entries)
          ? importedTextLive.entries
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
  const hasFormalPayload = Object.keys(formal).length > 0;
  const fullContext = {
    schema_version: detail.export_version || 'leisu_prompt_fields_v1',
    source_formal_field_manifest: Object.keys(formal),
    source_formal_payload: Object.keys(formal).length > 0 ? formal : null,
    source_payload_policy: 'This is the complete extension results[].formal payload. Indexed fields below are conveniences and must not replace or silently discard fields from this payload.',
    completeness: detail.completeness || null,
    analysis_match_context: historical.analysis_match_context || formal.analysis_match_context || null,
    head_to_head: historical.head_to_head || formal.head_to_head || [],
    recent_matches: historical.recent_matches || formal.recent_matches || null,
    league_standings: historical.league_standings || formal.league_standings || null,
    goal_distribution: historical.goal_distribution || formal.goal_distribution || null,
    trend_summary: historical.trend_summary || formal.trend_summary || null,
    future_schedule: historical.future_schedule || formal.future_schedule || null,
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
    reference_company_odds: match.reference_odds || formal.odds || null,
    opening_odds: formal.opening_odds || null,
    match_environment: object(formal.static_match).environment || match.weather || null,
    live_commentary: {
      captured_snapshot_only: true,
      complete_continuous_stream: false,
      event_count: liveCommentary.length,
      events: liveCommentary,
      limitation: 'This is the detail-page API snapshot captured at export time, not a guaranteed complete long-connection event stream.',
    },
    live_efficiency: object(statistics.efficiency).by_attacking_side
      ? statistics.efficiency
      : buildPromptLiveEfficiency(statistics, match.score),
    calibration_policy: 'Do not invent field weights or modify the score. Use as evidence; numerical scoring is allowed only after real settled samples pass chronological holdout validation.',
  };
  if (!compact || !hasFormalPayload) return fullContext;

  return {
    schema_version: fullContext.schema_version,
    source_formal_field_manifest: fullContext.source_formal_field_manifest,
    source_formal_payload: formal,
    source_payload_policy: 'Complete source data is carried exactly once. Read indexed modules from source_formal_payload using source_field_paths; no source field has been removed.',
    source_field_paths: {
      match: 'source_formal_payload.static_match',
      live_match_and_statistics: 'source_formal_payload.live_match',
      opening_odds: 'source_formal_payload.opening_odds',
      phased_odds: 'source_formal_payload.odds',
      analysis_match_context: 'source_formal_payload.analysis_match_context',
      head_to_head: 'source_formal_payload.head_to_head',
      future_schedule: 'source_formal_payload.future_schedule',
      recent_matches: 'source_formal_payload.recent_matches',
      league_standings: 'source_formal_payload.league_standings',
      goal_distribution: 'source_formal_payload.goal_distribution',
      trend_summary: 'source_formal_payload.trend_summary',
      lineup_players_injuries_values: 'source_formal_payload.lineup',
      live_commentary: 'source_formal_payload.live_match.text_live',
    },
    completeness: fullContext.completeness,
    live_efficiency: fullContext.live_efficiency,
    calibration_policy: fullContext.calibration_policy,
  };
}

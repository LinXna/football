export interface MatchLiveStats {
  hasStats: boolean;
  isPrematch: boolean;
  yellowCards: { home: number; away: number; text: string };
  redCards: { home: number; away: number; text: string; hasRed: boolean };
  corners: { home: number; away: number; text: string };
  shots: { home: number; away: number; text: string };
  shotsOnTarget: { home: number; away: number; text: string };
  shotsCombined: { home: string; away: string; text: string };
  possession: { home: number; away: number; text: string; valid: boolean };
  dangerousAttacks: { home: number; away: number; text: string; valid: boolean };
  attacks: { home: number; away: number; text: string; valid: boolean };
}

function parsePair(val: unknown): { home: number; away: number; valid: boolean } {
  if (val === undefined || val === null || val === '') return { home: 0, away: 0, valid: false };
  if (Array.isArray(val) && val.length >= 2) {
    const h = Number(String(val[0]).replace(/[%'"]/g, '').trim());
    const a = Number(String(val[1]).replace(/[%'"]/g, '').trim());
    return {
      home: Number.isFinite(h) ? h : 0,
      away: Number.isFinite(a) ? a : 0,
      valid: Number.isFinite(h) || Number.isFinite(a),
    };
  }
  if (typeof val === 'number') {
    return { home: val, away: Math.max(0, 100 - val), valid: true };
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const hRaw = obj.home ?? obj.h ?? obj.homeTeam ?? obj.home_count ?? obj.home_score ?? obj.home_percent ?? obj.home_val;
    const aRaw = obj.away ?? obj.a ?? obj.awayTeam ?? obj.away_count ?? obj.away_score ?? obj.away_percent ?? obj.away_val;
    const h = Number(String(hRaw ?? '').replace(/[%'"]/g, '').trim());
    const a = Number(String(aRaw ?? '').replace(/[%'"]/g, '').trim());
    if (Number.isFinite(h) && Number.isFinite(a) && (hRaw !== undefined || aRaw !== undefined)) {
      return { home: h, away: a, valid: true };
    }
    if (Number.isFinite(h) && hRaw !== undefined) {
      return { home: h, away: Math.max(0, 100 - h), valid: true };
    }
  }
  if (typeof val === 'string') {
    const clean = val.replace(/[%'"]/g, '').trim();
    if (clean.includes('-') || clean.includes(':')) {
      const sep = clean.includes('-') ? '-' : ':';
      const parts = clean.split(sep).map((s) => Number(s.trim()));
      if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        return { home: parts[0], away: parts[1], valid: true };
      }
    }
    const num = Number(clean);
    if (Number.isFinite(num) && clean.length > 0) {
      return { home: num, away: Math.max(0, 100 - num), valid: true };
    }
  }
  return { home: 0, away: 0, valid: false };
}

export function extractMatchLiveStats(matchItem?: any, leg?: any): MatchLiveStats {
  const item = matchItem || leg || {};
  const isPrematch = (item.minute === undefined || Number(item.minute) === 0) &&
    (item.export_mode === 'prematch' || item.status === 'notstarted' || item.status === 'PREMATCH' || String(item.status || '').toLowerCase().includes('pre'));

  // 0. Prioritize standard unified_stats from StandardMatchData if present
  if (item.unified_stats) {
    const u = item.unified_stats;
    const corners = { home: u.corners?.home ?? 0, away: u.corners?.away ?? 0 };
    const yellow = { home: u.yellow_cards?.home ?? 0, away: u.yellow_cards?.away ?? 0 };
    const red = { home: u.red_cards?.home ?? 0, away: u.red_cards?.away ?? 0 };
    const shots = { home: u.shots?.home ?? 0, away: u.shots?.away ?? 0 };
    const onTarget = { home: u.shots_on_target?.home ?? 0, away: u.shots_on_target?.away ?? 0 };
    const pos = { home: u.possession?.home ?? 50, away: u.possession?.away ?? 50 };
    const dang = { home: u.dangerous_attacks?.home ?? 0, away: u.dangerous_attacks?.away ?? 0 };
    const hasStats = Boolean(corners.home || corners.away || shots.home || shots.away || dang.home || dang.away || pos.home !== 50);

    return {
      hasStats,
      isPrematch,
      yellowCards: { home: yellow.home, away: yellow.away, text: `${yellow.home}-${yellow.away}` },
      redCards: { home: red.home, away: red.away, text: `${red.home}-${red.away}`, hasRed: red.home > 0 || red.away > 0 },
      corners: { home: corners.home, away: corners.away, text: `${corners.home}-${corners.away}` },
      shots: { home: shots.home, away: shots.away, text: `${shots.home}-${shots.away}` },
      shotsOnTarget: { home: onTarget.home, away: onTarget.away, text: `${onTarget.home}-${onTarget.away}` },
      shotsCombined: { home: `${onTarget.home}/${shots.home}`, away: `${onTarget.away}/${shots.away}`, text: `${onTarget.home}/${shots.home} - ${onTarget.away}/${shots.away}` },
      possession: { home: pos.home, away: pos.away, text: `${pos.home}%-${pos.away}%`, valid: true },
      dangerousAttacks: { home: dang.home, away: dang.away, text: `${dang.home}-${dang.away}`, valid: dang.home > 0 || dang.away > 0 },
      attacks: { home: dang.home, away: dang.away, text: `${dang.home}-${dang.away}`, valid: dang.home > 0 || dang.away > 0 },
    };
  }

  // Look for stats across common data contract paths
  const statsObj = item.live_statistics ||
    item._statistics ||
    item.confirmed_statistics ||
    item.detail_context?.formal?.live_match?.confirmed_statistics ||
    item.detail_context?.live_match?.confirmed_statistics ||
    item.detail_context?.statistics ||
    item.stats ||
    item.statistics ||
    {};

  // 1. Corners
  const rawCorners = statsObj.corners || statsObj.corner_kicks || statsObj.corner || statsObj.corner_count || item.corners;
  const cornersPair = parsePair(rawCorners);

  // 2. Yellow Cards
  const rawYellow = statsObj.yellow_cards || statsObj.yellow_card || statsObj.yellow || statsObj.yellowCards || item.yellow_cards;
  const yellowPair = parsePair(rawYellow);

  // 3. Red Cards
  const rawRed = statsObj.red_cards || statsObj.red_card || statsObj.red || statsObj.redCards || item.red_cards;
  const redPair = parsePair(rawRed);

  // 4. Shots
  const rawShots = statsObj.shots || statsObj.total_shots || statsObj.shots_total || statsObj.recorded_shots || item.shots;
  const shotsPair = parsePair(rawShots);

  // 5. Shots on Target
  const rawShotsOnTarget = statsObj.shots_on_target || statsObj.shotsOnTarget || statsObj.on_target || item.shots_on_target;
  const shotsOnTargetPair = parsePair(rawShotsOnTarget);

  // 6. Possession (控球率)
  const rawPossession = statsObj.possession || statsObj.ball_possession || statsObj.possession_percentage || statsObj.possession_rate || statsObj.control || statsObj.possession_percent || item.possession;
  const possessionPair = parsePair(rawPossession);

  // 7. Dangerous Attacks (危险进攻)
  const rawDangerous = statsObj.dangerous_attacks || statsObj.dangerous_attacks_count || statsObj.danger_attacks || statsObj.dangerous_attack || statsObj.dangerousAttacks || statsObj.danger_attack || item.dangerous_attacks;
  const dangerousPair = parsePair(rawDangerous);

  // 8. Normal Attacks (进攻)
  const rawAttacks = statsObj.attacks || statsObj.attack_count || statsObj.total_attacks || item.attacks;
  const attacksPair = parsePair(rawAttacks);

  // Count incidents if stats are missing but incidents array exists
  const incidents = Array.isArray(item.incidents) ? item.incidents :
    Array.isArray(item._incidents) ? item._incidents : [];
  if (incidents.length > 0) {
    if (!yellowPair.valid) {
      incidents.forEach((inc: any) => {
        const type = String(inc?.type || inc?.event_type || '').toLowerCase();
        if (type.includes('yellow')) {
          if (inc?.team === 'home' || inc?.is_home) yellowPair.home++;
          else if (inc?.team === 'away' || inc?.is_away) yellowPair.away++;
        }
      });
      if (yellowPair.home > 0 || yellowPair.away > 0) yellowPair.valid = true;
    }
    if (!redPair.valid) {
      incidents.forEach((inc: any) => {
        const type = String(inc?.type || inc?.event_type || '').toLowerCase();
        if (type.includes('red')) {
          if (inc?.team === 'home' || inc?.is_home) redPair.home++;
          else if (inc?.team === 'away' || inc?.is_away) redPair.away++;
        }
      });
      if (redPair.home > 0 || redPair.away > 0) redPair.valid = true;
    }
  }

  // If shots total is 0 or unrecorded but shots on target exists, estimate/fallback
  if (shotsPair.home < shotsOnTargetPair.home) shotsPair.home = shotsOnTargetPair.home;
  if (shotsPair.away < shotsOnTargetPair.away) shotsPair.away = shotsOnTargetPair.away;

  const hasStats = cornersPair.valid || yellowPair.valid || redPair.valid || shotsPair.valid || shotsOnTargetPair.valid || possessionPair.valid || dangerousPair.valid || attacksPair.valid;

  const homeShotsText = (shotsPair.valid || shotsOnTargetPair.valid)
    ? `${shotsPair.home}(${shotsOnTargetPair.home})`
    : isPrematch ? '待开赛' : '0(0)';
  const awayShotsText = (shotsPair.valid || shotsOnTargetPair.valid)
    ? `${shotsPair.away}(${shotsOnTargetPair.away})`
    : isPrematch ? '待开赛' : '0(0)';

  const shotsCombinedText = (shotsPair.valid || shotsOnTargetPair.valid)
    ? `${homeShotsText} - ${awayShotsText}`
    : isPrematch ? '待开赛' : '--';

  const possessionText = possessionPair.valid
    ? `${possessionPair.home}% - ${possessionPair.away}%`
    : isPrematch
    ? '待开赛'
    : '--';

  const dangerousText = dangerousPair.valid
    ? `${dangerousPair.home}-${dangerousPair.away}`
    : attacksPair.valid
    ? `${attacksPair.home}-${attacksPair.away}`
    : isPrematch
    ? '待开赛'
    : '0-0';

  const attacksText = attacksPair.valid
    ? `${attacksPair.home}-${attacksPair.away}`
    : isPrematch
    ? '待开赛'
    : '0-0';

  return {
    hasStats,
    isPrematch,
    yellowCards: {
      home: yellowPair.home,
      away: yellowPair.away,
      text: `${yellowPair.home}-${yellowPair.away}`,
    },
    redCards: {
      home: redPair.home,
      away: redPair.away,
      text: `${redPair.home}-${redPair.away}`,
      hasRed: redPair.home > 0 || redPair.away > 0,
    },
    corners: {
      home: cornersPair.home,
      away: cornersPair.away,
      text: `${cornersPair.home}-${cornersPair.away}`,
    },
    shots: {
      home: shotsPair.home,
      away: shotsPair.away,
      text: `${shotsPair.home}-${shotsPair.away}`,
    },
    shotsOnTarget: {
      home: shotsOnTargetPair.home,
      away: shotsOnTargetPair.away,
      text: `${shotsOnTargetPair.home}-${shotsOnTargetPair.away}`,
    },
    shotsCombined: {
      home: homeShotsText,
      away: awayShotsText,
      text: shotsCombinedText,
    },
    possession: {
      home: possessionPair.home,
      away: possessionPair.away,
      text: possessionText,
      valid: possessionPair.valid,
    },
    dangerousAttacks: {
      home: dangerousPair.home,
      away: dangerousPair.away,
      text: dangerousText,
      valid: dangerousPair.valid,
    },
    attacks: {
      home: attacksPair.home,
      away: attacksPair.away,
      text: attacksText,
      valid: attacksPair.valid,
    },
  };
}

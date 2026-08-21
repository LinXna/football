import { toStandardMatchData } from '../types';

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

/**
 * 提取比赛实况统计数据 (100% 基于 StandardMatchData / unified_stats 事实源)
 */
export function extractMatchLiveStats(matchItem?: any, leg?: any): MatchLiveStats {
  const item = matchItem || leg || {};
  const isPrematch = (item.minute === undefined || Number(item.minute) === 0) &&
    (item.export_mode === 'prematch' || item.status === 'notstarted' || item.status === 'PREMATCH' || String(item.status || '').toLowerCase().includes('pre'));

  // 统一通过 StandardMatchData / unified_stats 提取事实数据
  const std = item.unified_stats ? item : toStandardMatchData(item);
  const u = std.unified_stats;
  
  const corners = { home: u.corners?.home ?? 0, away: u.corners?.away ?? 0 };
  const yellow = { home: u.yellow_cards?.home ?? 0, away: u.yellow_cards?.away ?? 0 };
  const red = { home: u.red_cards?.home ?? 0, away: u.red_cards?.away ?? 0 };
  const shots = { home: u.shots?.home ?? 0, away: u.shots?.away ?? 0 };
  const onTarget = { home: u.shots_on_target?.home ?? 0, away: u.shots_on_target?.away ?? 0 };
  const pos = { home: u.possession?.home ?? 50, away: u.possession?.away ?? 50 };
  const dang = { home: u.dangerous_attacks?.home ?? 0, away: u.dangerous_attacks?.away ?? 0 };
  const hasStats = Boolean(corners.home || corners.away || shots.home || shots.away || dang.home || dang.away || (pos.home !== 50 && pos.home !== 0));

  return {
    hasStats,
    isPrematch,
    yellowCards: { home: yellow.home, away: yellow.away, text: `${yellow.home}-${yellow.away}` },
    redCards: { home: red.home, away: red.away, text: `${red.home}-${red.away}`, hasRed: red.home > 0 || red.away > 0 },
    corners: { home: corners.home, away: corners.away, text: `${corners.home}-${corners.away}` },
    shots: { home: shots.home, away: shots.away, text: `${shots.home}-${shots.away}` },
    shotsOnTarget: { home: onTarget.home, away: onTarget.away, text: `${onTarget.home}-${onTarget.away}` },
    shotsCombined: {
      home: `${onTarget.home}/${shots.home}`,
      away: `${onTarget.away}/${shots.away}`,
      text: `${onTarget.home}/${shots.home} - ${onTarget.away}/${shots.away}`,
    },
    possession: { home: pos.home, away: pos.away, text: `${pos.home}%-${pos.away}%`, valid: true },
    dangerousAttacks: { home: dang.home, away: dang.away, text: `${dang.home}-${dang.away}`, valid: dang.home > 0 || dang.away > 0 },
    attacks: { home: dang.home, away: dang.away, text: `${dang.home}-${dang.away}`, valid: dang.home > 0 || dang.away > 0 },
  };
}

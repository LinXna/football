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

  // 统一通过 toStandardMatchData 规整，确保全字段深度解析与结构对齐
  const std = toStandardMatchData(item);
  const u = std.unified_stats || {};
  
  const corners = { home: Number(u.corners?.home ?? 0), away: Number(u.corners?.away ?? 0) };
  const yellow = { home: Number(u.yellow_cards?.home ?? 0), away: Number(u.yellow_cards?.away ?? 0) };
  const red = { home: Number(u.red_cards?.home ?? 0), away: Number(u.red_cards?.away ?? 0) };
  const shots = { home: Number(u.shots?.home ?? 0), away: Number(u.shots?.away ?? 0) };
  const onTarget = { home: Number(u.shots_on_target?.home ?? 0), away: Number(u.shots_on_target?.away ?? 0) };
  const pos = { home: Number(u.possession?.home ?? 50), away: Number(u.possession?.away ?? 50) };
  const dang = { home: Number(u.dangerous_attacks?.home ?? 0), away: Number(u.dangerous_attacks?.away ?? 0) };
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

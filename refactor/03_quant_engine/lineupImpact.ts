/**
 * @file lineupImpact.ts
 * @description Layer 03 M2 子模块：阵容首发与主力伤停战力折损（LIS）、同构独立战绩（Iso-Venue）、战术阵型特征
 *
 * 从 contextEngine.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

import { CanonicalMatch } from '../02_canonical_model/types.js';
import { ParsedStandingRecord, ParsedPlayer } from '../01_data_ingestion/leisu/types.js';
import {
  IsoVenueStandingRecord,
  TacticalFormationFeatures,
  LineupStatus,
  LineupImpactFeatures
} from './types.js';

/**
 * 解析身价数值 (如 "1.2亿", "850万", "€15.5M")
 */
export function parseMarketValueToNumber(mvText: string | null | undefined): number {
  if (!mvText) return 0;
  const cleaned = mvText.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  if (isNaN(val)) return 0;
  if (mvText.includes('亿') || mvText.toUpperCase().includes('B')) return val * 10000;
  if (mvText.includes('万') || mvText.toUpperCase().includes('M')) return val;
  return val;
}

/**
 * 提取主客场同构独立战绩 (Iso-Venue Standings)
 */
export function extractIsoVenueStandings(
  match: CanonicalMatch
): { home_at_home: IsoVenueStandingRecord | null; away_at_away: IsoVenueStandingRecord | null } {
  const standings = match.reference?.league_standings;
  if (!standings || !standings.has_data) {
    return { home_at_home: null, away_at_away: null };
  }

  const mapStanding = (record: ParsedStandingRecord | null): IsoVenueStandingRecord | null => {
    if (!record || !Number.isFinite(record.matches_played) || record.matches_played <= 0) return null;
    const nonNegativeValues = [
      record.won, record.draw, record.loss, record.goals_scored,
      record.goals_conceded, record.points
    ];
    if (nonNegativeValues.some((value) => !Number.isFinite(value) || value < 0) ||
        !Number.isFinite(record.goal_difference) ||
        record.won + record.draw + record.loss > record.matches_played ||
        record.goal_difference !== record.goals_scored - record.goals_conceded) {
      return null;
    }
    const mp = record.matches_played;
    return Object.freeze({
      matches_played: record.matches_played,
      won: record.won,
      draw: record.draw,
      loss: record.loss,
      goals_scored: record.goals_scored,
      goals_conceded: record.goals_conceded,
      goal_difference: record.goal_difference,
      points: record.points,
      goals_per_game_scored: Number((record.goals_scored / mp).toFixed(2)),
      goals_per_game_conceded: Number((record.goals_conceded / mp).toFixed(2))
    });
  };

  const homeHome = standings.home_team?.home || standings.home_team?.overall ? mapStanding((standings.home_team.home || standings.home_team.overall)!) : null;
  const awayAway = standings.away_team?.away || standings.away_team?.overall ? mapStanding((standings.away_team.away || standings.away_team.overall)!) : null;

  return {
    home_at_home: homeHome,
    away_at_away: awayAway
  };
}

/**
 * 提取战术阵型与空间张力特征 (Tactical Formation Dynamics)
 */
export function extractTacticalFormationFeatures(
  match: CanonicalMatch
): TacticalFormationFeatures {
  const lineup = match.reference?.lineups;
  const homeFormation = lineup?.home_formation || 'UNKNOWN';
  const awayFormation = lineup?.away_formation || 'UNKNOWN';

  let wingVulnerabilityHome = 0.30;
  let wingVulnerabilityAway = 0.30;
  let midfieldCongestion = 0.50;
  let desc = '双方阵型处于常规对称攻防';

  if (homeFormation !== 'UNKNOWN' && awayFormation !== 'UNKNOWN') {
    // 识别 3 后卫/5 后卫阵型 (如 3-5-2, 5-3-2, 3-4-3)
    const is3Back = (f: string) => f.startsWith('3-') || f.startsWith('5-');
    // 识别 3 前锋高位压迫阵型 (如 4-3-3, 3-4-3)
    const is3Front = (f: string) => f.endsWith('-3') || f.endsWith('-3-3');

    if (is3Front(homeFormation) && is3Back(awayFormation)) {
      wingVulnerabilityAway = 0.75;
      desc = `主队 ${homeFormation} 三前锋高位压迫，客队 ${awayFormation} 边翼卫身后肋部空档承压极大`;
    } else if (is3Front(awayFormation) && is3Back(homeFormation)) {
      wingVulnerabilityHome = 0.75;
      desc = `客队 ${awayFormation} 三前锋反击冲击，主队 ${homeFormation} 边路防守面临单挑过载`;
    } else if (homeFormation.includes('4-2-3-1') && awayFormation.includes('4-2-3-1')) {
      midfieldCongestion = 0.85;
      desc = '双方均采用 4-2-3-1 双后腰绞杀阵型，中路渗透空间极度压缩';
    }
  }

  const bothKnown = homeFormation !== 'UNKNOWN' && awayFormation !== 'UNKNOWN';
  const formationMatched = bothKnown && (homeFormation === awayFormation);

  return Object.freeze({
    home_formation: homeFormation,
    away_formation: awayFormation,
    both_formations_known: bothKnown,
    formation_matched: formationMatched,
    wing_space_vulnerability_home: wingVulnerabilityHome,
    wing_space_vulnerability_away: wingVulnerabilityAway,
    midfield_congestion_index: midfieldCongestion,
    formation_tactical_description: desc
  });
}

/**
 * 计算阵容首发与主力伤停战力折损率 (Lineup Impact Score, LIS)
 * 方案 4：阵容首发三态化门禁 (CONFIRMED / PROJECTED / NOT_ANNOUNCED)
 */
export function calculateLineupImpactScores(
  match: CanonicalMatch
): LineupImpactFeatures {
  const lineup = match.reference?.lineups;
  let homeMv = parseMarketValueToNumber(lineup?.home_market_value);
  let awayMv = parseMarketValueToNumber(lineup?.away_market_value);

  // 兜底回退：若 lineups 未提供身价文本，尝试从 tactical_context.squad_market_value 提取
  const tacticalSquadMv = match.reference?.tactical_context?.squad_market_value;
  if (homeMv === 0 && tacticalSquadMv?.home_total_market_value_eur) {
    homeMv = Number(tacticalSquadMv.home_total_market_value_eur) / 10000; // 换算为万欧元
  }
  if (awayMv === 0 && tacticalSquadMv?.away_total_market_value_eur) {
    awayMv = Number(tacticalSquadMv.away_total_market_value_eur) / 10000;
  }

  const homeStarters = lineup?.home_starters || [];
  const awayStarters = lineup?.away_starters || [];
  const hasBothStarters = homeStarters.length > 0 && awayStarters.length > 0;

  let lineupStatus: LineupStatus = 'NOT_ANNOUNCED';
  let isLineupConfirmed = false;

  if (lineup && hasBothStarters) {
    if (lineup.confirmed === true) {
      lineupStatus = 'CONFIRMED';
      isLineupConfirmed = true;
    } else {
      lineupStatus = 'PROJECTED';
      isLineupConfirmed = false;
    }
  } else {
    lineupStatus = 'NOT_ANNOUNCED';
    isLineupConfirmed = false;
  }

  // 若赛前未公布首发（starters 为空），LIS 维持基准 1.0，禁止误判为核心缺席扣分
  if (lineupStatus === 'NOT_ANNOUNCED') {
    return {
      home_lis: 1.0,
      away_lis: 1.0,
      lineup_status: 'NOT_ANNOUNCED',
      is_lineup_confirmed: false,
      home_missing_core_players: [],
      away_missing_core_players: [],
      home_striker_missing: false,
      away_striker_missing: false,
      home_defender_missing: false,
      away_defender_missing: false,
      home_attack_injury_factor: 1.0,
      away_attack_injury_factor: 1.0,
      home_defense_leak_factor: 1.0,
      away_defense_leak_factor: 1.0,
      home_talisman_missing: false,
      away_talisman_missing: false,
      home_market_value_num: homeMv,
      away_market_value_num: awayMv,
      home_best_player_active: true,
      away_best_player_active: true
    };
  }

  const normalizePositionZone = (posStr?: string | null): 'FW' | 'MF' | 'DF' | 'GK' => {
    const s = String(posStr || '').toUpperCase();
    if (s.includes('FW') || s.includes('ST') || s.includes('CF') || s.includes('LW') || s.includes('RW') || s.includes('前锋')) return 'FW';
    if (s.includes('DF') || s.includes('CB') || s.includes('LB') || s.includes('RB') || s.includes('后卫')) return 'DF';
    if (s.includes('GK') || s.includes('门将') || s.includes('守门员')) return 'GK';
    return 'MF'; // 默认中场
  };

  const getPlayerMv = (p: ParsedPlayer): number => {
    if (typeof p.market_value === 'number' && p.market_value > 0) return p.market_value;
    const mvStr = p.market_value_text || (typeof p.market_value === 'string' ? p.market_value : null);
    if (mvStr) {
      const parsed = parseMarketValueToNumber(mvStr);
      if (parsed > 0) return parsed * 10000; // 换算为欧元
    }
    return 0;
  };

  const evaluateAbsences = (
    injuries: ParsedPlayer[],
    starters: ParsedPlayer[],
    teamSquadMvTenK: number
  ): {
    lis: number;
    missing: string[];
    strikerMissing: boolean;
    defenderMissing: boolean;
    attackInjuryFactor: number;
    defenseLeakFactor: number;
    talismanMissing: boolean;
    talismanName?: string;
    bestPlayerActive: boolean;
  } => {
    const missing: string[] = [];
    let strikerMissing = false;
    let defenderMissing = false;

    const hasBestInStarters = starters.some((p: ParsedPlayer) => p.best_player === true);

    // 1. 统计首发阵容各战术位置身价总额、人均身价以及找出全队（首发+伤停）大腿球员 (Talisman)
    const posStartersMv: Record<'FW' | 'MF' | 'DF' | 'GK', { total: number; count: number }> = {
      FW: { total: 0, count: 0 },
      MF: { total: 0, count: 0 },
      DF: { total: 0, count: 0 },
      GK: { total: 0, count: 0 }
    };
    let startersTotalMvEur = 0;

    for (const s of starters) {
      const zone = normalizePositionZone(s.position || s.position_name || s.position_code);
      const mv = getPlayerMv(s);
      posStartersMv[zone].total += mv;
      posStartersMv[zone].count += 1;
      startersTotalMvEur += mv;
    }

    // 全队身价基准 (欧元)
    const teamSquadMvEur = teamSquadMvTenK > 0 ? teamSquadMvTenK * 10000 : startersTotalMvEur * 1.35;
    const effectiveSquadMvEur = Math.max(100000, teamSquadMvEur);

    // 2. 识别全队“大腿球员” (Talisman)
    // 依据真实客观标准：在全队所有可统计身价人员中，身价第一且超第二名 1.5 倍以上，且占总身价 >= 20%
    const allKnownPlayers = [...starters, ...injuries].map(p => ({
      name: p.name || 'Unknown',
      zone: normalizePositionZone(p.position || p.position_name || p.position_code),
      mv: getPlayerMv(p),
      isInjury: injuries.includes(p),
      raw: p
    })).filter(p => p.mv > 0).sort((a, b) => b.mv - a.mv);

    let talismanName: string | undefined = undefined;
    let isTalismanMissing = false;
    let talismanZone: 'FW' | 'MF' | 'DF' | 'GK' | undefined = undefined;

    if (allKnownPlayers.length >= 1) {
      const top1 = allKnownPlayers[0];
      const top2 = allKnownPlayers[1];
      const dominanceOverSecond = top2 ? (top1.mv / Math.max(1, top2.mv)) : 2.5;
      const shareOfTotal = top1.mv / effectiveSquadMvEur;

      // 满足大腿条件，或雷速标注为最佳球员
      if ((dominanceOverSecond >= 1.45 && shareOfTotal >= 0.18) || (top1.raw.best_player === true && top1.mv > 0)) {
        talismanName = top1.name;
        talismanZone = top1.zone;
        if (top1.isInjury) {
          isTalismanMissing = true;
        }
      }
    }

    let totalWeightedInjuryLoss = 0.0;
    let totalAttackLoss = 0.0;
    let totalDefenseLoss = 0.0;

    // 3. 逐一遍历伤停名单：基于客观真实数据（同位置比对、停赛性质、核心标签）过滤边缘杂鱼并量化战力折损
    for (const p of injuries) {
      const name = p.name || 'Unknown';
      const zone = normalizePositionZone(p.position || p.position_name || p.position_code);
      missing.push(name);

      const pMv = getPlayerMv(p);
      const posStat = posStartersMv[zone];
      const posStarterAvgMv = posStat.count > 0 ? posStat.total / posStat.count : (startersTotalMvEur / 11);

      // 客观事实印证：是否为停赛/红黄牌事件（通过 incidents 数组或扩展字段排查）
      const hasSuspensionIncident = Array.isArray(p.incidents) && p.incidents.some(inc => {
        const desc = String(inc.reason_desc || inc.reason_type || inc.type_name || '').toLowerCase();
        return desc.includes('停赛') || desc.includes('红牌') || desc.includes('黄牌') || desc.includes('suspended');
      });
      const reasonStr = String(p.reason || p.injury_reason || '').toLowerCase();
      const isSuspended = hasSuspensionIncident || reasonStr.includes('停赛') || reasonStr.includes('suspended') || reasonStr.includes('red card') || reasonStr.includes('yellow');
      const isCurrentTalisman = Boolean(talismanName && talismanName === name && isTalismanMissing);

      let singlePlayerLoss = 0.0;
      let isSubstantialKeyPlayer = false;

      if (pMv > 0) {
        const valRatio = posStarterAvgMv > 0 ? (pMv / posStarterAvgMv) : (pMv / Math.max(1, startersTotalMvEur / 11));
        const isCoreRole = Boolean(p.best_player || p.captain || p.starter || isSuspended || isCurrentTalisman);

        // 真实足球物理门禁：若伤员身价连首发同位置均价的三成都不及，且无核心主力/停赛标签，严格作为边缘人员滤除 (Loss = 0)
        if (valRatio < 0.30 && !isCoreRole) {
          singlePlayerLoss = 0.0;
          isSubstantialKeyPlayer = false;
        } else {
          // 产生实质战力空洞的主力/核心/重要轮换
          isSubstantialKeyPlayer = true;
          // 位置替代落差
          const posDropRatio = valRatio >= 1.0 ? Math.min(2.2, valRatio) : Math.max(0.20, valRatio);
          const squadValueShare = Math.max(0.01, Math.min(0.30, pMv / effectiveSquadMvEur));
          let roleMultiplier = 1.0;
          if (p.best_player === true || isCurrentTalisman) roleMultiplier *= 1.35;
          if (p.captain === true) roleMultiplier *= 1.15;
          if (p.starter === true || isSuspended) roleMultiplier *= 1.10;

          singlePlayerLoss = posDropRatio * squadValueShare * roleMultiplier * 3.5;
        }
      } else {
        // 无身价数据联赛优雅退化：依据客观标签与停赛判定，绝不无脑平摊
        if (p.best_player === true || isCurrentTalisman) {
          singlePlayerLoss = 0.35;
          isSubstantialKeyPlayer = true;
        } else if (p.captain === true) {
          singlePlayerLoss = 0.25;
          isSubstantialKeyPlayer = true;
        } else if (p.starter === true || isSuspended) {
          singlePlayerLoss = 0.15;
          isSubstantialKeyPlayer = true;
        } else if (startersTotalMvEur === 0) {
          // 无身价联赛：按伤员序号阶梯赋予平滑折损，杜绝超过2人时断崖跌入 0.0
          const injuryIdx = injuries.indexOf(p);
          if (injuryIdx < 2) {
            singlePlayerLoss = 0.10;
            isSubstantialKeyPlayer = true;
          } else if (injuryIdx < 5) {
            singlePlayerLoss = 0.06;
            isSubstantialKeyPlayer = true;
          } else {
            singlePlayerLoss = 0.02;
            isSubstantialKeyPlayer = false;
          }
        } else {
          // 边缘人员噪声，战力折损严格为 0.0
          singlePlayerLoss = 0.0;
          isSubstantialKeyPlayer = false;
        }
      }

      // 注：身价大腿/核心球员战术加权已在 roleMultiplier 及无身价分支统一单次赋权 (1.35x)，杜绝二次复合乘算
      totalWeightedInjuryLoss += singlePlayerLoss;

      // 分位置解耦：进攻端折损 vs 防守端漏洞加剧
      if (isSubstantialKeyPlayer) {
        if (zone === 'FW') {
          strikerMissing = true;
          totalAttackLoss += singlePlayerLoss * 1.25;
        } else if (zone === 'DF') {
          defenderMissing = true;
          totalDefenseLoss += singlePlayerLoss * 1.25;
        } else if (zone === 'GK') {
          defenderMissing = true;
          // 主力门将缺阵是系统级防守漏洞，赋予高权重防守恶化
          totalDefenseLoss += Math.max(0.30, singlePlayerLoss * 1.50);
        } else {
          // 中场攻防均担
          totalAttackLoss += singlePlayerLoss * 0.50;
          totalDefenseLoss += singlePlayerLoss * 0.50;
        }
      }
    }

    // 4. 严格指数饱和保底模型：LIS = 0.75 + 0.25 * exp(-0.40 * totalWeightedInjuryLoss)
    const lis = totalWeightedInjuryLoss > 0
      ? Math.max(0.75, Number((0.75 + 0.25 * Math.exp(-0.40 * totalWeightedInjuryLoss)).toFixed(3)))
      : 1.0;

    // 进攻战力保持率 [0.65, 1.00]
    const attackInjuryFactor = totalAttackLoss > 0
      ? Math.max(0.65, Number((0.65 + 0.35 * Math.exp(-0.45 * totalAttackLoss)).toFixed(3)))
      : 1.0;

    // 防守漏洞恶化乘子 [1.00, 1.50]
    const defenseLeakFactor = totalDefenseLoss > 0
      ? Math.min(1.50, Number((1.0 + 0.50 * (1.0 - Math.exp(-0.45 * totalDefenseLoss))).toFixed(3)))
      : 1.0;

    return {
      lis,
      missing,
      strikerMissing,
      defenderMissing,
      attackInjuryFactor,
      defenseLeakFactor,
      talismanMissing: isTalismanMissing,
      talismanName,
      bestPlayerActive: hasBestInStarters
    };
  };

  const homeInjuries = lineup?.home_injuries || [];
  const awayInjuries = lineup?.away_injuries || [];

  const homeRes = evaluateAbsences(homeInjuries, homeStarters, homeMv);
  const awayRes = evaluateAbsences(awayInjuries, awayStarters, awayMv);

  // 战术中轴骨干身价 (Spine: GK - CB - CM/DM - CF)
  const calcSpineMv = (starters: ParsedPlayer[]): number => {
    let sum = 0;
    for (const s of starters) {
      const pos = String(s.position || s.position_name || s.position_code || '').toUpperCase();
      const isSpine = pos.includes('GK') || pos.includes('CB') || pos.includes('DM') || pos.includes('CM') || pos.includes('CF') || pos.includes('ST') || pos.includes('门将') || pos.includes('中卫') || pos.includes('后腰') || pos.includes('中锋');
      if (isSpine) {
        sum += getPlayerMv(s);
      }
    }
    return sum;
  };
  const homeSpineMv = calcSpineMv(homeStarters);
  const awaySpineMv = calcSpineMv(awayStarters);

  // 平均年龄与体能/经验差
  const calcAvgAge = (starters: ParsedPlayer[], fallbackAge?: number): number | undefined => {
    if (typeof fallbackAge === 'number' && fallbackAge > 15 && fallbackAge < 50) return fallbackAge;
    const ages = starters.map(p => typeof p.age === 'number' && p.age > 15 && p.age < 50 ? p.age : 0).filter(a => a > 0);
    if (ages.length >= 5) {
      return Number((ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1));
    }
    return undefined;
  };
  // home_average_age/away_average_age 为字符串类型，与 calcAvgAge 的 number 兜底参数不匹配（原 as any 掩盖类型不匹配，兜底实际从未生效），故省略兜底参数。
  const homeAvgAge = calcAvgAge(homeStarters);
  const awayAvgAge = calcAvgAge(awayStarters);
  const ageGap = (homeAvgAge && awayAvgAge) ? Number(Math.abs(homeAvgAge - awayAvgAge).toFixed(1)) : undefined;

  // 阵型相克风险 (如 4-1-4-1 单后腰遭遇 3 中场绞杀)
  const homeFormationStr = String(lineup?.home_formation || '').trim();
  const awayFormationStr = String(lineup?.away_formation || '').trim();
  const formationClashRisk = Boolean(
    (homeFormationStr === '4-1-4-1' && (awayFormationStr === '4-3-3' || awayFormationStr === '4-2-3-1')) ||
    (awayFormationStr === '4-1-4-1' && (homeFormationStr === '4-3-3' || homeFormationStr === '4-2-3-1'))
  );

  return {
    home_lis: homeRes.lis,
    away_lis: awayRes.lis,
    lineup_status: lineupStatus,
    is_lineup_confirmed: isLineupConfirmed,
    home_missing_core_players: homeRes.missing,
    away_missing_core_players: awayRes.missing,
    home_striker_missing: homeRes.strikerMissing,
    away_striker_missing: awayRes.strikerMissing,
    home_defender_missing: homeRes.defenderMissing,
    away_defender_missing: awayRes.defenderMissing,
    home_attack_injury_factor: homeRes.attackInjuryFactor,
    away_attack_injury_factor: awayRes.attackInjuryFactor,
    home_defense_leak_factor: homeRes.defenseLeakFactor,
    away_defense_leak_factor: awayRes.defenseLeakFactor,
    home_talisman_missing: homeRes.talismanMissing,
    away_talisman_missing: awayRes.talismanMissing,
    home_talisman_name: homeRes.talismanName,
    away_talisman_name: awayRes.talismanName,
    home_market_value_num: homeMv,
    away_market_value_num: awayMv,
    home_best_player_active: homeRes.bestPlayerActive,
    away_best_player_active: awayRes.bestPlayerActive,
    home_spine_market_value: homeSpineMv,
    away_spine_market_value: awaySpineMv,
    home_average_age: homeAvgAge,
    away_average_age: awayAvgAge,
    age_gap: ageGap,
    formation_clash_risk: formationClashRisk
  };
}


import React, { useState } from 'react';
import { 
  Activity, 
  Flame, 
  TrendingUp, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  Flag, 
  Award, 
  AlertCircle, 
  ShieldAlert,
  AlertTriangle,
  Layers,
  Compass,
  Repeat,
  Crosshair,
  Copy,
  Check,
  Radar,
  BarChart2,
  ListOrdered,
  Filter
} from 'lucide-react';
import { DecisionItem, toStandardMatchData } from '../types';
import { renderIncidentIcons } from './IncidentIconsHelper';
import { analyzeAttackMomentum } from '../utils/momentumAnalytics';

export interface ParsedIncidentItem {
  min: number;
  half: 1 | 2 | 0; // 1 = first half, 2 = second half, 0 = unknown
  stoppageExtra: number; // e.g. 1, 2 for 45+1 or 90+2
  displayMin: string;
  text: string;
  shortText: string;
  icon: string;
  side: 'home' | 'away' | 'neutral';
  sideName?: string;
  isGoal: boolean;
  isCorner: boolean;
  isCard: boolean;
  isSub: boolean;
}

export interface TimelinePoint {
  segmentIndex: number;
  segmentName: string;
  idxInSeg: number;
  min: number;
  displayLabel: string;
  h: number;
  a: number;
  score: number; // Positive = Home (+1~+100), Negative = Away (-1~-100)
  eventIcon?: string;
  eventText?: string;
  eventSide?: 'home' | 'away' | 'neutral';
  homeIncidents?: ParsedIncidentItem[];
  awayIncidents?: ParsedIncidentItem[];
  neutralIncidents?: ParsedIncidentItem[];
  matchedIncidents?: ParsedIncidentItem[];
}

export interface DominanceWindowDetail {
  segmentName: string;
  startMin: number;
  endMin: number;
  durationMins: number;
  dominantSide: 'home' | 'away';
  sideName: string;
  summaryZh: string;
  correlatedIncidents: string[];
  conversionType: 'GOAL_CONVERTED' | 'DANGER_CONVERTED' | 'CARD_FORCED' | 'STERILE_PRESSURE';
}

export interface SegmentData {
  segmentIndex: number;
  segmentName: string;
  points: TimelinePoint[];
  segmentIncidents: ParsedIncidentItem[];
}

export interface ParsedTimelineData {
  hasTimeline: boolean;
  isPrematch: boolean;
  segmentCount: number;
  nominalMinutes: number;
  segments: SegmentData[];
  points: TimelinePoint[];
  allIncidents: ParsedIncidentItem[];
  currentMinute: number;
  recent5Share: { home: number; away: number; dominantSide: 'home' | 'away' | 'balanced' };
  recentShare: { home: number; away: number };
  dominanceWindows: DominanceWindowDetail[];
  trend: 'HOME_HEAVY_PRESSURE' | 'AWAY_HEAVY_PRESSURE' | 'BALANCED_CONTEST';
  tacticalConversionZh: string;
  verdictZh: string;
}

/**
 * Extracts and cleans minute integer and display label from any format:
 * "12'", "45+1'", "45+2", 50, "53' - 第4个角球", "[53, 1, 2]"
 */
function parseMinuteVal(
  rawTime: any,
  rawDataStr?: string
): { min: number; half: 1 | 2 | 0; stoppageExtra: number; displayMin: string } {
  let str = String(rawTime ?? '').trim();
  if (!str && rawDataStr) {
    const matchLead = String(rawDataStr).match(/^(\d{1,3})(?:\+(\d{1,2}))?[']?/);
    if (matchLead) {
      str = matchLead[0];
    }
  }

  const rawContext = `${str} ${rawDataStr || ''}`;
  const isExplicitHalf1 = /上半场|H1|1st/i.test(rawContext);
  const isExplicitHalf2 = /下半场|H2|2nd/i.test(rawContext);

  if (!str) return { min: -1, half: 0, stoppageExtra: 0, displayMin: '' };

  // 1. Check stoppage format e.g. 45+2' or 90+4'
  const plusMatch = str.match(/^(\d{1,3})\+(\d{1,2})/);
  if (plusMatch) {
    const base = parseInt(plusMatch[1], 10);
    const extra = parseInt(plusMatch[2], 10);
    if (base <= 45) {
      return { min: 45, half: 1, stoppageExtra: extra, displayMin: `${base}+${extra}'` };
    } else {
      return { min: 90, half: 2, stoppageExtra: extra, displayMin: `${base}+${extra}'` };
    }
  }

  // 2. Regular integer minute
  const numMatch = str.match(/^(\d{1,3})/);
  if (numMatch) {
    const m = parseInt(numMatch[1], 10);
    let half: 1 | 2 | 0 = 0;
    if (isExplicitHalf1) half = 1;
    else if (isExplicitHalf2) half = 2;
    else {
      half = m <= 45 ? 1 : 2;
    }
    return { min: m, half, stoppageExtra: 0, displayMin: `${m}'` };
  }

  const directNum = Number(rawTime);
  if (Number.isFinite(directNum) && directNum >= 0 && directNum <= 130) {
    const half: 1 | 2 | 0 = isExplicitHalf1 ? 1 : isExplicitHalf2 ? 2 : directNum <= 45 ? 1 : 2;
    return { min: directNum, half, stoppageExtra: 0, displayMin: `${directNum}'` };
  }

  return { min: -1, half: 0, stoppageExtra: 0, displayMin: '' };
}

export function parseMatchIncidents(match?: any): ParsedIncidentItem[] {
  if (!match) return [];
  const std = match.unified_stats ? match : toStandardMatchData(match);
  const rawList = Array.isArray(std.timeline_events) ? std.timeline_events : [];

  const homeName = String(std.home_team || std.ybty_home || '').trim();
  const awayName = String(std.away_team || std.ybty_away || '').trim();
  const homeLeisu = String(std.leisu_home || '').trim();
  const awayLeisu = String(std.leisu_away || '').trim();

  const results: ParsedIncidentItem[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    if (!item) continue;

    let rawTime: any = '';
    let rawText = '';
    let rawType = 0;
    let position = 0; // 1 = home, 2 = away, 0 = neutral

    if (typeof item === 'string') {
      rawText = item;
      rawTime = item;
    } else if (Array.isArray(item)) {
      // [min, position, type_id, text, player]
      rawTime = item[0];
      position = Number(item[1] || 0);
      rawType = Number(item[2] || 0);
      rawText = String(item[3] || item[4] || '');
    } else if (typeof item === 'object') {
      rawTime = item.time ?? item.minute ?? item.min ?? item.t ?? item.m ?? '';
      rawText = String(item.data ?? item.text ?? item.content ?? item.type_name ?? item.desc ?? item.name ?? '');
      rawType = Number(item.type ?? item.type_id ?? item.incident_type ?? 0);
      position = Number(item.position ?? item.team ?? item.side ?? 0);
    }

    const { min, half, stoppageExtra, displayMin } = parseMinuteVal(rawTime, rawText);
    if (min < 0 && !rawText) continue;

    // Filter out generic commentary / weather / match start / half whistle
    if (rawType === 10 || rawType === 11 || /上半场开始|下半场开始|上半场结束|全场结束|比赛即将开始|场地情况|天气情况|欢迎收看/i.test(rawText)) {
      continue;
    }

    // Accurately determine incident type based on keywords and schema
    const isSubText = /换人|替补|换下|换上|[↑↓]|substitution/i.test(rawText);
    const isCornerText = /角球|获得角球|第\d+个角球|corner/i.test(rawText);
    const isRedText = /红牌|两黄变红|被罚下|red card/i.test(rawText);
    const isYellowText = /黄牌|吃到黄牌|yellow card/i.test(rawText);
    const isGoalText = /进球|破门|点球进|球进了|自摆乌龙|乌龙球|goal/i.test(rawText) && !/球门球|进球无效|越位/i.test(rawText);
    const isDangerText = /中框|门柱|横梁|扑救|险情|射正/i.test(rawText);

    let isSub = false;
    let isCorner = false;
    let isRed = false;
    let isYellow = false;
    let isGoal = false;
    let isDanger = false;

    if (isSubText || rawType === 8 || (rawType === 9 && !isGoalText)) {
      isSub = true;
    } else if (isCornerText || rawType === 2) {
      isCorner = true;
    } else if (isRedText || rawType === 4) {
      isRed = true;
    } else if (isYellowText || rawType === 3) {
      isYellow = true;
    } else if (isGoalText || (rawType === 1 && /进球|球进|破门/i.test(rawText))) {
      isGoal = true;
    } else if (isDangerText) {
      isDanger = true;
    } else {
      continue;
    }

    const icon = isGoal ? '⚽' : isRed ? '🟥' : isYellow ? '🟨' : isCorner ? '🚩' : isSub ? '🔄' : '⚡';

    // Determine side (Home vs Away)
    let side: 'home' | 'away' | 'neutral' = 'neutral';
    if (position === 1) {
      side = 'home';
    } else if (position === 2) {
      side = 'away';
    } else {
      if ((homeName && rawText.includes(homeName)) || (homeLeisu && rawText.includes(homeLeisu)) || rawText.includes('(主') || rawText.includes('主队')) {
        side = 'home';
      } else if ((awayName && rawText.includes(awayName)) || (awayLeisu && rawText.includes(awayLeisu)) || rawText.includes('(客') || rawText.includes('客队')) {
        side = 'away';
      }
    }

    const sideTeamName = side === 'home' ? (homeName || homeLeisu || '主队') : side === 'away' ? (awayName || awayLeisu || '客队') : '';

    // Extract detail parameters for precise deduplication:
    const cornerNumMatch = rawText.match(/第(\d+)个角球/);
    const cornerNum = cornerNumMatch ? cornerNumMatch[1] : '';

    const cardNumMatch = rawText.match(/第(\d+)张黄牌/);
    const cardNum = cardNumMatch ? cardNumMatch[1] : '';

    // Extract substitution player swaps, e.g. "科纳特↑ 维特森↓" or "贾尔加德↑ 马祖雷克↓"
    const subPlayersMatch = rawText.match(/([\u4e00-\u9fa5\w·•\s]+[↑])\s*([\u4e00-\u9fa5\w·•\s]+[↓])/);
    const subPlayers = subPlayersMatch ? `${subPlayersMatch[1].trim()} ${subPlayersMatch[2].trim()}` : '';

    // Create concise shortText
    let shortText = rawText;
    if (isGoal) {
      const goalScorerMatch = rawText.match(/[-–]\s*([\u4e00-\u9fa5\w·•\s]+)(?:\(|\s*进球|\s*破门|$)/);
      const scorer = goalScorerMatch ? goalScorerMatch[1].trim() : '';
      shortText = `进球 ⚽ ${scorer || sideTeamName ? `(${scorer || sideTeamName})` : ''}`;
    } else if (isCorner) {
      shortText = cornerNum ? `第${cornerNum}角球 🚩 ${sideTeamName ? `(${sideTeamName})` : ''}` : `角球 🚩 ${sideTeamName ? `(${sideTeamName})` : ''}`;
    } else if (isRed) {
      shortText = `红牌 🟥 ${sideTeamName ? `(${sideTeamName})` : ''}`;
    } else if (isYellow) {
      shortText = cardNum ? `第${cardNum}张黄牌 🟨 ${sideTeamName ? `(${sideTeamName})` : ''}` : `黄牌 🟨 ${sideTeamName ? `(${sideTeamName})` : ''}`;
    } else if (isSub) {
      shortText = subPlayers ? `换人 🔄 ${subPlayers}` : `换人 🔄 ${sideTeamName}`;
    }

    // Precise deduplication keys with half prefix to eliminate duplicate corners, cards, substitutions and text duplicates:
    const halfKey = half === 1 ? 'H1' : half === 2 ? 'H2' : 'HX';
    let dedupeKey = '';
    if (isCorner) {
      // Allow multiple distinct corners in the same minute (e.g. 13' 第2个角球 vs 13' 第3个角球, or distinct rawText)
      const cornerId = cornerNum ? `num_${cornerNum}` : rawText.replace(/\s+/g, '').slice(0, 30);
      dedupeKey = `${halfKey}_${min}_${stoppageExtra}_corner_${side}_${cornerId}`;
    } else if (isYellow) {
      const cardId = cardNum ? `num_${cardNum}` : rawText.replace(/\s+/g, '').slice(0, 30);
      dedupeKey = `${halfKey}_${min}_${stoppageExtra}_yellow_${side}_${cardId}`;
    } else if (isRed) {
      dedupeKey = `${halfKey}_${min}_${stoppageExtra}_red_${side}_${rawText.replace(/\s+/g, '').slice(0, 20)}`;
    } else if (isSub) {
      const normSub = subPlayers.replace(/[\s↑↓]/g, '') || rawText.replace(/\d+[']?\s*[-–]?\s*/, '').slice(0, 20);
      dedupeKey = `${halfKey}_${min}_${stoppageExtra}_sub_${side}_${normSub}`;
    } else if (isGoal) {
      dedupeKey = `${halfKey}_${min}_${stoppageExtra}_goal_${side}_${rawText.replace(/\s+/g, '').slice(0, 20)}`;
    } else {
      dedupeKey = `${halfKey}_${min}_${stoppageExtra}_${icon}_${side}_${rawText.slice(0, 15)}`;
    }

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      results.push({
        min,
        half,
        stoppageExtra,
        displayMin: displayMin || `${min}'`,
        text: rawText,
        shortText,
        icon,
        side,
        sideName: sideTeamName,
        isGoal,
        isCorner,
        isCard: isRed || isYellow,
        isSub,
      });
    }
  }

  return results.sort((a, b) => a.min - b.min);
}

export function extractAttackMomentumTimeline(match?: DecisionItem | any): ParsedTimelineData {
  if (!match) {
    return {
      hasTimeline: false,
      isPrematch: false,
      segmentCount: 0,
      nominalMinutes: 45,
      segments: [],
      points: [],
      allIncidents: [],
      currentMinute: 0,
      recent5Share: { home: 50, away: 50, dominantSide: 'balanced' },
      recentShare: { home: 50, away: 50 },
      dominanceWindows: [],
      trend: 'BALANCED_CONTEST',
      tacticalConversionZh: '',
      verdictZh: '暂无数据',
    };
  }

  const isPrematch = !match?.minute || match.minute === 0 ||
    match.export_mode === 'prematch' || match.status === 'PREMATCH' ||
    String(match?.status || '').toLowerCase().includes('pre');

  // Comprehensive multi-source resolution for raw timeline
  let rawTimeline =
    match.attack_momentum_timeline ||
    match.live_match_physical_facts?.attack_momentum_timeline ||
    match.live_facts?.attack_momentum_timeline ||
    match.live_match?.attack_momentum_timeline ||
    match.formal?.live_match?.attack_momentum_timeline ||
    match.formal?.attack_momentum_timeline ||
    match.result?.attack_momentum_timeline ||
    match.match_info?.attack_momentum_timeline ||
    match.trend ||
    match.live_match_physical_facts?.trend ||
    match.live_facts?.trend ||
    match.live_match?.trend ||
    match.formal?.live_match?.trend ||
    match.formal?.trend ||
    match.result?.trend ||
    match.match_info?.trend ||
    null;

  if (typeof rawTimeline === 'string') {
    try {
      rawTimeline = JSON.parse(rawTimeline);
    } catch (e) {
      // unparseable string fallback
    }
  }

  const std = match?.unified_stats ? match : toStandardMatchData(match);
  if (!rawTimeline && std?.attack_momentum_timeline) {
    rawTimeline = std.attack_momentum_timeline;
  }

  const incidents = parseMatchIncidents(std);
  const homeName = std?.ybty_home || std?.home_team || match?.home_team || match?.home || '主队';
  const awayName = std?.ybty_away || std?.away_team || match?.away_team || match?.away || '客队';

  // Normalize into 2D segments: Array<Array<number>>
  let rawSegments: number[][] = [];
  let nominalMinutes = 45;
  let reportedSegmentCount = 2;

  if (rawTimeline && typeof rawTimeline === 'object') {
    nominalMinutes = Number(rawTimeline.nominal_segment_minutes) || 45;
    reportedSegmentCount = Number(rawTimeline.segment_count) || 2;

    const rawData =
      rawTimeline.data !== undefined
        ? rawTimeline.data
        : rawTimeline.trend?.data !== undefined
        ? rawTimeline.trend.data
        : rawTimeline.trend;

    if (Array.isArray(rawTimeline) && rawTimeline.length > 0) {
      // Direct array passed as timeline
      if (Array.isArray(rawTimeline[0])) {
        rawSegments = rawTimeline.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
      } else if (typeof rawTimeline[0] === 'number') {
        rawSegments = [rawTimeline.map(Number)];
      }
    } else if (Array.isArray(rawData) && rawData.length > 0) {
      if (Array.isArray(rawData[0])) {
        // Standard 2D array: data: [ [-90, 100, ...], [22, 20, ...] ]
        rawSegments = rawData.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
      } else if (typeof rawData[0] === 'number') {
        // 1D fallback
        rawSegments = [rawData.map(Number)];
      }
    } else if (Array.isArray(rawTimeline.periods) && rawTimeline.periods.length > 0) {
      rawSegments = rawTimeline.periods.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
    } else if (Array.isArray(rawTimeline.segments) && rawTimeline.segments.length > 0) {
      rawSegments = rawTimeline.segments.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
    } else if (Array.isArray(rawTimeline.raw?.data) && rawTimeline.raw.data.length > 0) {
      rawSegments = rawTimeline.raw.data.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
    } else if (Array.isArray(rawTimeline.home) && Array.isArray(rawTimeline.away)) {
      // Parallel arrays
      const len = Math.max(rawTimeline.home.length, rawTimeline.away.length);
      const diffs: number[] = [];
      for (let i = 0; i < len; i++) {
        const hVal = Number(rawTimeline.home[i]) || 0;
        const aVal = Number(rawTimeline.away[i]) || 0;
        diffs.push(hVal - aVal);
      }
      rawSegments = [diffs];
    }
  }

  rawSegments = rawSegments.filter((s) => s.length > 0);

  // Strictly use raw trend segments from Leisu/data source. Never fabricate/synthesize future or fake minute points.
  if (rawSegments.length === 0) {
    // In-play stat-derived baseline estimation when waveform is pending
    const uStats = std?.unified_stats;
    const hDang = uStats?.dangerous_attacks?.home ?? 0;
    const aDang = uStats?.dangerous_attacks?.away ?? 0;
    const totDang = hDang + aDang;
    const dangHShare = totDang > 0 ? Number(((hDang / totDang) * 100).toFixed(1)) : 50;
    const dangAShare = totDang > 0 ? Number(((aDang / totDang) * 100).toFixed(1)) : 50;

    const trend =
      dangHShare >= 65
        ? 'HOME_HEAVY_PRESSURE'
        : dangAShare >= 65
        ? 'AWAY_HEAVY_PRESSURE'
        : 'BALANCED_CONTEST';

    return {
      hasTimeline: false,
      isPrematch,
      segmentCount: reportedSegmentCount,
      nominalMinutes,
      segments: [],
      points: [],
      allIncidents: incidents,
      currentMinute: match?.minute || 0,
      recent5Share: { home: dangHShare, away: dangAShare, dominantSide: dangHShare >= 65 ? 'home' : dangAShare >= 65 ? 'away' : 'balanced' },
      recentShare: { home: dangHShare, away: dangAShare },
      dominanceWindows: [],
      trend,
      tacticalConversionZh: '',
      verdictZh: isPrematch ? '赛前待开赛，攻势曲线尚未生成' : '雷速暂未返回分分钟动能打分点阵（已展示即时技术统计与事件流）',
    };
  }

  const segments: SegmentData[] = [];
  const allPoints: TimelinePoint[] = [];
  const dominanceWindows: DominanceWindowDetail[] = [];

  rawSegments.forEach((segScores, segIdx) => {
    const segName = segIdx === 0 ? '上半场' : segIdx === 1 ? '下半场' : segIdx === 2 ? '加时上半场' : segIdx === 3 ? '加时下半场' : `第${segIdx + 1}节`;
    const segPoints: TimelinePoint[] = [];
    const baseOffset = segIdx === 0 ? 0 : segIdx * nominalMinutes + 1;

    let currentSide: 'home' | 'away' | null = null;
    let windowStartIdx = 0;
    let streak = 0;

    const commitWindow = (side: 'home' | 'away', startIdx: number, endIdx: number, streakCount: number) => {
      if (streakCount < 4) return;
      const startMin = segIdx === 0 ? (startIdx <= 45 ? startIdx : 45) : (startIdx <= 44 ? 46 + startIdx : 90);
      const endMin = segIdx === 0 ? (endIdx <= 45 ? endIdx : 45) : (endIdx <= 44 ? 46 + endIdx : 90);
      const sideTeamName = side === 'home' ? homeName : awayName;

      let startLabel = '';
      let endLabel = '';
      if (segIdx === 0) {
        const sM = startIdx + 1;
        const eM = endIdx + 1;
        startLabel = sM <= 45 ? `${sM}'` : `45+${sM - 45}'`;
        endLabel = eM <= 45 ? `${eM}'` : `45+${eM - 45}'`;
      } else if (segIdx === 1) {
        startLabel = startIdx <= 44 ? `${46 + startIdx}'` : `90+${startIdx - 44}'`;
        endLabel = endIdx <= 44 ? `${46 + endIdx}'` : `90+${endIdx - 44}'`;
      } else {
        startLabel = `${baseOffset + startIdx}'`;
        endLabel = `${baseOffset + endIdx}'`;
      }

      // Correlate with incidents occurring in this segment window
      const correlated = incidents
        .filter((inc) => {
          if (segIdx === 0) {
            if (inc.half === 2) return false;
            const incIdx = inc.stoppageExtra > 0 ? 44 + inc.stoppageExtra : inc.min - 1;
            return incIdx >= Math.max(0, startIdx - 1) && incIdx <= endIdx + 1;
          } else if (segIdx === 1) {
            if (inc.half === 1) return false;
            const incIdx = inc.stoppageExtra > 0 ? 44 + inc.stoppageExtra : inc.min - 46;
            return incIdx >= Math.max(0, startIdx - 1) && incIdx <= endIdx + 1;
          }
          return inc.min >= Math.max(0, startMin - 1) && inc.min <= endMin + 1;
        })
        .map((inc) => `${inc.displayMin} ${inc.icon} ${inc.text}`);

      let convType: DominanceWindowDetail['conversionType'] = 'STERILE_PRESSURE';
      const corrStr = correlated.join(' ');
      if (/进球|破门|点球进|得分|goal/i.test(corrStr)) {
        convType = 'GOAL_CONVERTED';
      } else if (/角球|射正|中框|扑救|险情|corner/i.test(corrStr)) {
        convType = 'DANGER_CONVERTED';
      } else if (/红牌|黄牌|造牌|card/i.test(corrStr)) {
        convType = 'CARD_FORCED';
      }

      const convNote =
        convType === 'GOAL_CONVERTED' ? '【转化破门 ⚽】' :
        convType === 'DANGER_CONVERTED' ? '【造角球/险情 🚩】' :
        convType === 'CARD_FORCED' ? '【造牌/犯规受压 🟨】' : '【持续压迫/无关键转化】';

      const windowDesc = `[${segName}] ${startLabel}-${endLabel} ${side === 'home' ? '主队' : '客队'}(${sideTeamName})持续压制高潮(连续${streakCount}分钟攻势占优) ${convNote}`;

      dominanceWindows.push({
        segmentName: segName,
        startMin,
        endMin,
        durationMins: streakCount,
        dominantSide: side,
        sideName: sideTeamName,
        summaryZh: windowDesc,
        correlatedIncidents: correlated,
        conversionType: convType,
      });
    };

    segScores.forEach((scoreVal, idx) => {
      const score = Number(scoreVal) || 0;
      const h = score > 0 ? score : 0;
      const a = score < 0 ? Math.abs(score) : 0;

      let displayLabel = '';
      let approxMin = 0;

      if (segIdx === 0) {
        const curM = idx + 1;
        if (curM <= 45) {
          displayLabel = `${curM}'`;
          approxMin = curM;
        } else {
          const extra = curM - 45;
          displayLabel = `45+${extra}'`;
          approxMin = 45;
        }
      } else if (segIdx === 1) {
        if (idx <= 44) {
          const curM = 46 + idx;
          displayLabel = `${curM}'`;
          approxMin = curM;
        } else {
          const extra = idx - 44;
          displayLabel = `90+${extra}'`;
          approxMin = 90;
        }
      } else {
        approxMin = baseOffset + idx;
        displayLabel = `${approxMin}'`;
      }

      // Check if any key incident occurred strictly on this minute/stoppage slot in this half
      const matched = incidents.filter((inc) => {
        if (segIdx === 0) {
          if (inc.half === 2) return false;
          if (inc.stoppageExtra > 0) {
            const targetIdx = 44 + inc.stoppageExtra; // e.g. 45+1 is targetIdx 45 (which is 46th item, idx 45)
            if (targetIdx < segScores.length) {
              return idx === targetIdx;
            } else {
              return idx === segScores.length - 1;
            }
          }
          return idx === (inc.min - 1);
        } else if (segIdx === 1) {
          if (inc.half === 1) return false;
          if (inc.stoppageExtra > 0) {
            const targetIdx = 44 + inc.stoppageExtra; // e.g. 90+1 is targetIdx 45 (which is 46th item in H2, idx 45)
            if (targetIdx < segScores.length) {
              return idx === targetIdx;
            } else {
              return idx === segScores.length - 1;
            }
          }
          return idx === (inc.min - 46);
        }
        return inc.min === approxMin;
      });

      const homeIncs = matched.filter(inc => inc.side === 'home');
      const awayIncs = matched.filter(inc => inc.side === 'away');
      const neutralIncs = matched.filter(inc => inc.side === 'neutral');
      const firstIncident = matched[0];

      const point: TimelinePoint = {
        segmentIndex: segIdx,
        segmentName: segName,
        idxInSeg: idx,
        min: approxMin,
        displayLabel,
        h,
        a,
        score,
        eventIcon: firstIncident?.icon,
        eventText: firstIncident ? `${firstIncident.displayMin} ${firstIncident.text}` : undefined,
        eventSide: firstIncident?.side,
        homeIncidents: homeIncs,
        awayIncidents: awayIncs,
        neutralIncidents: neutralIncs,
        matchedIncidents: matched,
      };

      segPoints.push(point);
      allPoints.push(point);

      // Detect single-segment continuous pressure
      const side = h >= 30 && h > a ? 'home' : a >= 30 && a > h ? 'away' : null;
      if (side && side === currentSide) {
        streak++;
      } else {
        if (currentSide && streak >= 4) {
          commitWindow(currentSide, windowStartIdx, idx - 1, streak);
        }
        currentSide = side;
        windowStartIdx = idx;
        streak = side ? 1 : 0;
      }
    });

    if (currentSide && streak >= 4) {
      commitWindow(currentSide, windowStartIdx, segScores.length - 1, streak);
    }

    // Segment specific incidents
    const segIncidents = incidents.filter((inc) => {
      if (segIdx === 0) return inc.half === 1 || (inc.half === 0 && inc.min <= 45);
      if (segIdx === 1) return inc.half === 2 || (inc.half === 0 && inc.min >= 46);
      return true;
    });

    segments.push({
      segmentIndex: segIdx,
      segmentName: segName,
      points: segPoints,
      segmentIncidents: segIncidents,
    });
  });

  // Calculate recent 15 minutes pressure share
  const activeSeg = rawSegments[rawSegments.length - 1] || [];
  let recent15Slice: number[] = [];

  if (activeSeg.length >= 15) {
    recent15Slice = activeSeg.slice(-15);
  } else {
    const prevSeg = rawSegments.length > 1 ? rawSegments[rawSegments.length - 2] : [];
    const needed = 15 - activeSeg.length;
    recent15Slice = [...prevSeg.slice(-needed), ...activeSeg];
  }

  let recentHSum = 0;
  let recentASum = 0;
  for (const score of recent15Slice) {
    if (score > 0) recentHSum += score;
    else if (score < 0) recentASum += Math.abs(score);
  }

  const totalRecent = recentHSum + recentASum;
  const homeShare = totalRecent > 0 ? Number(((recentHSum / totalRecent) * 100).toFixed(1)) : 50;
  const awayShare = totalRecent > 0 ? Number(((recentASum / totalRecent) * 100).toFixed(1)) : 50;

  // Calculate recent 5 minutes immediate momentum
  const recent5Slice = activeSeg.length >= 5 ? activeSeg.slice(-5) : recent15Slice.slice(-5);
  let imm5H = 0;
  let imm5A = 0;
  for (const score of recent5Slice) {
    if (score > 0) imm5H += score;
    else if (score < 0) imm5A += Math.abs(score);
  }
  const total5 = imm5H + imm5A;
  const imm5HShare = total5 > 0 ? Number(((imm5H / total5) * 100).toFixed(1)) : 50;
  const imm5AShare = total5 > 0 ? Number(((imm5A / total5) * 100).toFixed(1)) : 50;
  const dominantSide5: 'home' | 'away' | 'balanced' =
    imm5HShare >= 65 ? 'home' : imm5AShare >= 65 ? 'away' : 'balanced';

  let trend: 'HOME_HEAVY_PRESSURE' | 'AWAY_HEAVY_PRESSURE' | 'BALANCED_CONTEST' = 'BALANCED_CONTEST';
  let verdictZh = `攻势曲线相对胶着，近15分钟攻势占比 ${homeShare}% vs ${awayShare}%，近5分钟处于${dominantSide5 === 'home' ? '主队提速' : dominantSide5 === 'away' ? '客队提速' : '均势对抗'}。`;

  if (homeShare >= 65) {
    trend = 'HOME_HEAVY_PRESSURE';
    verdictZh = `主队近15分钟攻势评分持续压制(${homeShare}% vs ${awayShare}%)，近5分钟保持强力压迫(${imm5HShare}%)，围攻态势明显。`;
  } else if (awayShare >= 65) {
    trend = 'AWAY_HEAVY_PRESSURE';
    verdictZh = `客队近15分钟攻势评分持续压制(${awayShare}% vs ${homeShare}%)，近5分钟反客为主高压推进(${imm5AShare}%)。`;
  }

  // Tactical conversion synthesis
  const goalConvertedWins = dominanceWindows.filter((w) => w.conversionType === 'GOAL_CONVERTED');
  const sterileWins = dominanceWindows.filter((w) => w.conversionType === 'STERILE_PRESSURE');
  let tacticalConversion = '攻守对抗推进中';
  if (goalConvertedWins.length > 0) {
    tacticalConversion = `高压波次转化为实际破门 ⚽：${goalConvertedWins.map(w => `${w.sideName}在${w.startMin}'-${w.endMin}'强势期破门`).join('；')}`;
  } else if (sterileWins.length >= 2) {
    tacticalConversion = '攻势波次虽多但雷声大雨点小，转化为绝对破门机会偏少，需警惕虚火与后防反击。';
  } else if (dominanceWindows.length > 0) {
    tacticalConversion = '攻势窗口期伴随角球与持续定位球威胁，不断向对方禁区施压。';
  }

  const currentMin = match?.minute && match.minute > 0 ? match.minute : (allPoints[allPoints.length - 1]?.min || 0);

  return {
    hasTimeline: true,
    isPrematch: false,
    segmentCount: segments.length,
    nominalMinutes,
    segments,
    points: allPoints,
    allIncidents: incidents,
    currentMinute: currentMin,
    recent5Share: { home: imm5HShare, away: imm5AShare, dominantSide: dominantSide5 },
    recentShare: { home: homeShare, away: awayShare },
    dominanceWindows: dominanceWindows.slice(-4),
    trend,
    tacticalConversionZh: tacticalConversion,
    verdictZh,
  };
}

export const parseAttackMomentumData = extractAttackMomentumTimeline;

interface WidgetProps {
  match: DecisionItem;
  compact?: boolean;
}

export const AttackMomentumTimelineWidget: React.FC<WidgetProps> = ({ match, compact = false }) => {
  const [showFullTimeline, setShowFullTimeline] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'events' | 'analytics' | 'shifts' | 'divergence' | 'ai_brief'>('timeline');
  const [incidentFilter, setIncidentFilter] = useState<'all' | 'goal' | 'corner' | 'card' | 'sub' | 'danger'>('all');
  const [selectedSegIdx, setSelectedSegIdx] = useState<number | null>(null); // null = all segments side-by-side
  const [hoveredPoint, setHoveredPoint] = useState<TimelinePoint | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const parsed = extractAttackMomentumTimeline(match);
  const std = match?.unified_stats ? match : toStandardMatchData(match);

  if (parsed.isPrematch) {
    return null;
  }

  // Handle Compact Mode (used in parlay leg cards and compact containers)
  if (compact) {
    if (!parsed.hasTimeline) {
      const uStats = std?.unified_stats;
      const hDang = uStats?.dangerous_attacks?.home ?? 0;
      const aDang = uStats?.dangerous_attacks?.away ?? 0;
      const hPoss = uStats?.possession?.home ?? 50;
      const aPoss = uStats?.possession?.away ?? 50;
      const hasAnyStats = hDang > 0 || aDang > 0 || (uStats?.shots?.home ?? 0) > 0;

      return (
        <div className="bg-slate-950/80 border border-slate-800/80 rounded px-2.5 py-1.5 font-mono text-[10px] space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1 text-slate-300 font-bold">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>即时攻势态势</span>
            </span>
            <span className="text-[9px] text-slate-500">
              {hasAnyStats ? `危攻 ${hDang}-${aDang}` : '待雷速时序同步'}
            </span>
          </div>
          {hasAnyStats ? (
            <div className="flex items-center justify-between text-[9px] text-slate-400">
              <span className="text-emerald-400 font-semibold">主控 {hPoss}%</span>
              <div className="w-24 h-1.5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800 mx-1.5">
                <div className="h-full bg-emerald-500" style={{ width: `${hPoss}%` }} />
                <div className="h-full bg-purple-500" style={{ width: `${aPoss}%` }} />
              </div>
              <span className="text-purple-400 font-semibold">客控 {aPoss}%</span>
            </div>
          ) : (
            <div className="text-[9px] text-slate-500">暂无即时攻势波形</div>
          )}
        </div>
      );
    }

    const analysis = analyzeAttackMomentum(parsed, match);
    const { recent5Share, recentShare, trend } = parsed;

    const trendBadge =
      trend === 'HOME_HEAVY_PRESSURE'
        ? { label: '主队高压围攻', color: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' }
        : trend === 'AWAY_HEAVY_PRESSURE'
        ? { label: '客队高压围攻', color: 'bg-purple-950/80 border-purple-500/50 text-purple-300' }
        : { label: '攻势相对胶着', color: 'bg-slate-900 border-slate-700 text-slate-400' };

    return (
      <div className="bg-slate-950/90 border border-indigo-900/40 rounded px-2.5 py-2 font-mono text-[10px] space-y-1.5 shadow-sm">
        {/* Compact Top Row: Title + Pattern + Trend Badge */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 font-bold text-slate-200">
            <Zap className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-[10.5px] font-sans">攻势动能</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-950/90 border border-indigo-700/60 text-indigo-300 font-bold">
              {analysis.patternZh}
            </span>
          </div>
          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${trendBadge.color} flex items-center gap-0.5`}>
            {trend !== 'BALANCED_CONTEST' && <Flame className="w-2.5 h-2.5" />}
            {trendBadge.label}
          </span>
        </div>

        {/* Compact Gauges: 5m & 15m */}
        <div className="grid grid-cols-2 gap-1.5 text-[9px]">
          <div className="bg-slate-900/90 rounded px-1.5 py-0.5 border border-slate-800 flex items-center justify-between">
            <span className="text-amber-300 font-medium">⚡近5分</span>
            <span className="text-slate-300 font-mono">
              <span className="text-emerald-400 font-bold">{recent5Share.home}%</span>
              <span className="text-slate-500 mx-0.5">:</span>
              <span className="text-purple-400 font-bold">{recent5Share.away}%</span>
            </span>
          </div>
          <div className="bg-slate-900/90 rounded px-1.5 py-0.5 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 font-medium">近15分</span>
            <span className="text-slate-300 font-mono">
              <span className="text-emerald-400 font-bold">{recentShare.home}%</span>
              <span className="text-slate-500 mx-0.5">:</span>
              <span className="text-purple-400 font-bold">{recentShare.away}%</span>
            </span>
          </div>
        </div>

        {/* Divergence Warning Alert if any active */}
        {analysis.divergenceSignals.length > 0 && (
          <div className="text-[8.5px] px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 font-medium flex items-center gap-1">
            <Radar className="w-2.5 h-2.5 text-rose-400 shrink-0" />
            <span className="truncate">{analysis.divergenceSignals[0].tag}: {analysis.divergenceSignals[0].title}</span>
          </div>
        )}
      </div>
    );
  }

  // Full Widget Mode: If no waveform, render informative stat-derived panel
  if (!parsed.hasTimeline) {
    const uStats = std?.unified_stats;
    const hDang = uStats?.dangerous_attacks?.home ?? 0;
    const aDang = uStats?.dangerous_attacks?.away ?? 0;
    const hPoss = uStats?.possession?.home ?? 50;
    const aPoss = uStats?.possession?.away ?? 50;
    const hShots = uStats?.shots?.home ?? 0;
    const aShots = uStats?.shots?.away ?? 0;
    const hasStats = hDang > 0 || aDang > 0 || hShots > 0 || aShots > 0;

    return (
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 font-mono text-[11px] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-300">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span>攻势动能与事件流</span>
            <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-400">
              即时数据概览
            </span>
          </div>
          <span className="text-[9.5px] text-slate-500">待雷速时序同步</span>
        </div>

        {hasStats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-900/60 rounded p-2 border border-slate-800/60">
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-emerald-400 font-semibold">主队控球 {hPoss}%</span>
                <span className="text-purple-400 font-semibold">客队控球 {aPoss}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                <div className="h-full bg-emerald-500" style={{ width: `${hPoss}%` }} />
                <div className="h-full bg-purple-500" style={{ width: `${aPoss}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-around text-[10px] text-slate-300">
              <span>危险进攻: <strong className="text-emerald-400">{hDang}</strong> - <strong className="text-purple-400">{aDang}</strong></span>
              <span>射门: <strong className="text-emerald-400">{hShots}</strong> - <strong className="text-purple-400">{aShots}</strong></span>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-slate-400 py-1 text-center">
            暂无即时攻势波形打分（比赛进行至第 {match?.minute || 0} 分钟）
          </div>
        )}
      </div>
    );
  }

  const analysis = analyzeAttackMomentum(parsed, match);
  const { recent5Share, recentShare, dominanceWindows, trend, segments, allIncidents, tacticalConversionZh } = parsed;

  const trendBadge =
    trend === 'HOME_HEAVY_PRESSURE'
      ? { label: '主队高压围攻', color: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' }
      : trend === 'AWAY_HEAVY_PRESSURE'
      ? { label: '客队高压围攻', color: 'bg-purple-950/80 border-purple-500/50 text-purple-300' }
      : { label: '攻势相对胶着', color: 'bg-slate-900 border-slate-700 text-slate-400' };

  const handleCopyAiSnippet = () => {
    navigator.clipboard.writeText(analysis.aiPromptSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="bg-slate-950/95 border border-indigo-900/40 rounded-lg p-3 space-y-2.5 font-mono text-[11px] shadow-sm">
      {/* Header bar: Title, Share & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-200">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11.5px] font-sans">高频攻势时序与战术决策罗盘</span>
          <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-indigo-950/90 border border-indigo-700/60 text-indigo-300 font-bold" title={analysis.patternDesc}>
            {analysis.patternZh}
          </span>
          {allIncidents.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-600/50 text-amber-300 font-bold">
              {allIncidents.length}项事件
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${trendBadge.color} flex items-center gap-1`}>
            {trend !== 'BALANCED_CONTEST' && <Flame className="w-3 h-3" />}
            {trendBadge.label}
          </span>
          <button
            onClick={() => setShowFullTimeline(!showFullTimeline)}
            className="text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
            title={showFullTimeline ? '收起时序图' : '展开完整时序波形'}
          >
            {showFullTimeline ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 5-Minute Immediate Momentum + 15-Minute Pressure Share Dual Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-900/80 border border-slate-800 rounded-md p-2">
        {/* Gauge 1: Recent 5 Min Momentum */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-emerald-400 font-semibold">主 {recent5Share.home}%</span>
            <span className="text-[9px] text-amber-300 font-medium">⚡ 近5分钟即时势头</span>
            <span className="text-purple-400 font-semibold">客 {recent5Share.away}%</span>
          </div>
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-500"
              style={{ width: `${recent5Share.home}%` }}
              title={`主队近5分钟攻势占比 ${recent5Share.home}%`}
            />
            <div
              className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 transition-all duration-500"
              style={{ width: `${recent5Share.away}%` }}
              title={`客队近5分钟攻势占比 ${recent5Share.away}%`}
            />
          </div>
        </div>

        {/* Gauge 2: Recent 15 Min Pressure Share */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-emerald-400 font-semibold">主 {recentShare.home}%</span>
            <span className="text-[9px] text-slate-300 font-medium">近15分钟攻势占比 (斜率: {analysis.recent15m.slope > 0 ? '+' : ''}{analysis.recent15m.slope})</span>
            <span className="text-purple-400 font-semibold">客 {recentShare.away}%</span>
          </div>
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-500"
              style={{ width: `${recentShare.home}%` }}
              title={`主队近15分钟攻势占比 ${recentShare.home}%`}
            />
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
              style={{ width: `${recentShare.away}%` }}
              title={`客队近15分钟攻势占比 ${recentShare.away}%`}
            />
          </div>
        </div>
      </div>

      {/* Navigation Tabs for In-depth Tactical Exploration */}
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-800 pb-1 text-[10px]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-2 py-1 rounded font-medium flex items-center gap-1 transition-all ${
              activeTab === 'timeline'
                ? 'bg-indigo-600 text-white font-bold shadow'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>时序波形与事件</span>
          </button>

          <button
            onClick={() => setActiveTab('events')}
            className={`px-2 py-1 rounded font-medium flex items-center gap-1 transition-all ${
              activeTab === 'events'
                ? 'bg-indigo-600 text-white font-bold shadow'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListOrdered className="w-3 h-3" />
            <span>全场事件流</span>
            {allIncidents.length > 0 && (
              <span className="px-1 py-0.2 rounded-full text-[8.5px] bg-amber-500 text-slate-950 font-black">
                {allIncidents.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-2 py-1 rounded font-medium flex items-center gap-1 transition-all ${
              activeTab === 'analytics'
                ? 'bg-indigo-600 text-white font-bold shadow'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3 h-3" />
            <span>战术量化与形态分型</span>
          </button>

          <button
            onClick={() => setActiveTab('shifts')}
            className={`px-2 py-1 rounded font-medium flex items-center gap-1 transition-all ${
              activeTab === 'shifts'
                ? 'bg-indigo-600 text-white font-bold shadow'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="w-3 h-3" />
            <span>战术突变响应</span>
            {analysis.tacticalShifts.length > 0 && (
              <span className="px-1 py-0.2 rounded-full text-[8.5px] bg-amber-500 text-slate-950 font-black">
                {analysis.tacticalShifts.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('divergence')}
            className={`px-2 py-1 rounded font-medium flex items-center gap-1 transition-all ${
              activeTab === 'divergence'
                ? 'bg-indigo-600 text-white font-bold shadow'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radar className="w-3 h-3" />
            <span>盘口背离与陷阱</span>
            {analysis.divergenceSignals.length > 0 && (
              <span className="px-1 py-0.2 rounded-full text-[8.5px] bg-rose-500 text-white font-black animate-pulse">
                {analysis.divergenceSignals.length}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={() => setActiveTab('ai_brief')}
          className={`px-2 py-1 rounded font-medium flex items-center gap-1 transition-all text-emerald-300 border border-emerald-500/30 ${
            activeTab === 'ai_brief' ? 'bg-emerald-950 text-emerald-200 font-bold border-emerald-400' : 'bg-slate-900/60 hover:bg-slate-800'
          }`}
        >
          <Crosshair className="w-3 h-3 text-emerald-400" />
          <span>AI 量化简报</span>
        </button>
      </div>

      {/* TAB 1: Minute-by-Minute Waveform & Dominance Windows */}
      {activeTab === 'timeline' && (
        <div className="space-y-2 animate-fadeIn">
          {/* Segment Selector Tabs if multiple segments */}
          {segments.length > 1 && (
            <div className="flex items-center gap-1.5 text-[9.5px]">
              <button
                onClick={() => setSelectedSegIdx(null)}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  selectedSegIdx === null ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                上下半场并排 ({parsed.points.length}分钟)
              </button>
              {segments.map((seg) => (
                <button
                  key={seg.segmentIndex}
                  onClick={() => setSelectedSegIdx(seg.segmentIndex)}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    selectedSegIdx === seg.segmentIndex ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {seg.segmentName} ({seg.points.length}分)
                </button>
              ))}
            </div>
          )}

          {/* Render Segments: 2 halves side-by-side in a 2-column grid */}
          <div className={selectedSegIdx === null && segments.length >= 2 ? "grid grid-cols-1 md:grid-cols-2 gap-2.5" : "space-y-2"}>
            {segments
              .filter((seg) => selectedSegIdx === null || seg.segmentIndex === selectedSegIdx)
              .map((seg) => {
                const firstLabel = seg.points[0]?.displayLabel || (seg.segmentIndex === 0 ? "1'" : "46'");
                const lastLabel = seg.points[seg.points.length - 1]?.displayLabel || `${seg.points.length}'`;

                // 计算段内相邻事件图钉的垂直错位
                let lastHomeIdx = -10;
                let lastHomeLevel = 0;
                let lastAwayIdx = -10;
                let lastAwayLevel = 0;

                const staggerConfig = seg.points.map((p, pIdx) => {
                  const hasHome = (p.homeIncidents && p.homeIncidents.length > 0) || (p.neutralIncidents && p.neutralIncidents.length > 0 && p.score >= 0);
                  const hasAway = (p.awayIncidents && p.awayIncidents.length > 0) || (p.neutralIncidents && p.neutralIncidents.length > 0 && p.score < 0);

                  let homeLevel = 0;
                  if (hasHome) {
                    homeLevel = pIdx - lastHomeIdx <= 2 ? (lastHomeLevel === 0 ? 1 : 0) : 0;
                    lastHomeIdx = pIdx;
                    lastHomeLevel = homeLevel;
                  }

                  let awayLevel = 0;
                  if (hasAway) {
                    awayLevel = pIdx - lastAwayIdx <= 2 ? (lastAwayLevel === 0 ? 1 : 0) : 0;
                    lastAwayIdx = pIdx;
                    lastAwayLevel = awayLevel;
                  }

                  return { homeLevel, awayLevel };
                });

                return (
                  <div key={seg.segmentIndex} className="bg-slate-900/80 border border-slate-800 rounded-md p-2 space-y-1.5 flex flex-col justify-between">
                    <div className="text-[9.5px] text-slate-400 flex items-center justify-between pb-0.5 font-sans">
                      <span className="text-indigo-300 font-bold">【{seg.segmentName}】{firstLabel}</span>
                      <span className="text-slate-400 text-[9px] flex items-center gap-2">
                        <span className="text-emerald-400 font-medium">主队攻势 (上方)</span>
                        <span className="text-indigo-400 font-medium">客队攻势 (下方)</span>
                      </span>
                      <span className="text-indigo-300 font-bold">{lastLabel}</span>
                    </div>

                    {/* Waveform 3-Track Container: Top Home Lane, Middle Waveform, Bottom Away Lane */}
                    <div className="w-full bg-slate-950 rounded-lg border border-slate-800/80 p-1.5 space-y-1 select-none">
                      {/* Top Track: Home Incidents Only */}
                      <div className="h-5.5 w-full bg-slate-900/40 rounded border border-slate-800/50 flex items-stretch px-1 gap-[1px] relative">
                        {seg.points.map((p, idx) => {
                          const hasHomeEvent =
                            (p.homeIncidents && p.homeIncidents.length > 0) ||
                            (p.neutralIncidents && p.neutralIncidents.length > 0 && p.score >= 0);
                          return (
                            <div key={idx} className="flex-1 relative flex items-center justify-center">
                              {hasHomeEvent &&
                                renderIncidentIcons(p.homeIncidents || p.neutralIncidents, true, p.h, p.a)}
                            </div>
                          );
                        })}
                      </div>

                      {/* Middle Track: Pure Attack Momentum Bars (Clean & Unobstructed) */}
                      <div className="h-20 w-full bg-slate-950 rounded border border-slate-800/60 flex items-stretch justify-between px-1 gap-[1px] relative">
                        {seg.points.map((p, idx) => {
                          const hHeight = Math.min(100, (p.h / 100) * 100);
                          const aHeight = Math.min(100, (p.a / 100) * 100);
                          const isDominantHome = p.score > 0;
                          const isDominantAway = p.score < 0;

                          return (
                            <div
                              key={idx}
                              className="flex-1 flex flex-col justify-between items-center h-full group relative cursor-pointer"
                            >
                              {/* Upper Half: Home Attack Bar */}
                              <div className="w-full flex flex-col items-center justify-end h-1/2">
                                <div
                                  style={{ height: `${p.h > 0 ? Math.max(12, hHeight) : 0}%` }}
                                  className={`w-full max-w-[5px] rounded-t-xs transition-all ${
                                    isDominantHome
                                      ? 'bg-emerald-400 group-hover:bg-emerald-300'
                                      : 'bg-transparent'
                                  }`}
                                />
                              </div>

                              {/* Center Zero Line */}
                              <div className="w-full h-[1px] bg-slate-800 group-hover:bg-slate-600" />

                              {/* Lower Half: Away Attack Bar */}
                              <div className="w-full flex flex-col items-center justify-start h-1/2">
                                <div
                                  style={{ height: `${p.a > 0 ? Math.max(12, aHeight) : 0}%` }}
                                  className={`w-full max-w-[5px] rounded-b-xs transition-all ${
                                    isDominantAway
                                      ? 'bg-indigo-400 group-hover:bg-indigo-300'
                                      : 'bg-transparent'
                                  }`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Bottom Track: Away Incidents Only */}
                      <div className="h-5.5 w-full bg-slate-900/40 rounded border border-slate-800/50 flex items-stretch px-1 gap-[1px] relative">
                        {seg.points.map((p, idx) => {
                          const hasAwayEvent =
                            (p.awayIncidents && p.awayIncidents.length > 0) ||
                            (p.neutralIncidents && p.neutralIncidents.length > 0 && p.score < 0);
                          return (
                            <div key={idx} className="flex-1 relative flex items-center justify-center">
                              {hasAwayEvent &&
                                renderIncidentIcons(p.awayIncidents || p.neutralIncidents, false, p.h, p.a)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Continuous Dominance Windows */}
          {dominanceWindows.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] text-slate-300 flex items-center gap-1 font-semibold font-sans">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                <span>连续强势压制区间与事件流核验：</span>
              </div>

              <div className="space-y-1">
                {dominanceWindows.map((win, wIdx) => {
                  const badgeStyle =
                    win.conversionType === 'GOAL_CONVERTED'
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                      : win.conversionType === 'DANGER_CONVERTED'
                      ? 'bg-sky-950/60 border-sky-500/50 text-sky-200'
                      : win.conversionType === 'CARD_FORCED'
                      ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                      : 'bg-slate-900/70 border-slate-800 text-slate-300';

                  return (
                    <div
                      key={wIdx}
                      className={`text-[9.5px] border rounded p-1.5 space-y-0.5 ${badgeStyle}`}
                    >
                      <div className="flex items-center justify-between gap-1 font-medium">
                        <span className="flex items-center gap-1">
                          {win.conversionType === 'GOAL_CONVERTED' && <span>⚽</span>}
                          {win.conversionType === 'DANGER_CONVERTED' && <span>🚩</span>}
                          {win.conversionType === 'CARD_FORCED' && <span>🟨</span>}
                          {win.conversionType === 'STERILE_PRESSURE' && <span>⚡</span>}
                          <span>{win.summaryZh}</span>
                        </span>
                        <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-slate-950/60 border border-slate-700/50">
                          {win.dominantSide === 'home' ? '主势能' : '客势能'}
                        </span>
                      </div>

                      {/* Correlated Incidents List */}
                      {win.correlatedIncidents.length > 0 && (
                        <div className="text-[8.5px] text-slate-300 pl-3 border-l border-slate-700/60 space-y-0.2">
                          <span className="text-slate-400">➔ 同期事件: </span>
                          {win.correlatedIncidents.map((inc, iIdx) => (
                            <span key={iIdx} className="mr-1.5 text-amber-200/90 font-mono">
                              [{inc}]
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Incidents Flow Highlights */}
          {allIncidents.length > 0 && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-md p-2 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-300 font-semibold flex items-center gap-1">
                  <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
                  <span>实况关键事件时序流 ({allIncidents.length} 项)</span>
                </span>
                <button
                  onClick={() => setActiveTab('events')}
                  className="text-indigo-400 hover:text-indigo-300 text-[9px] underline cursor-pointer"
                >
                  查看全部完整事件详情 &gt;
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {allIncidents.slice(0, 10).map((inc, idx) => {
                  const sideClass =
                    inc.side === 'home'
                      ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-200'
                      : inc.side === 'away'
                      ? 'bg-purple-950/80 border-purple-700/60 text-purple-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300';

                  return (
                    <div
                      key={idx}
                      className={`text-[9.5px] px-2 py-0.5 rounded border flex items-center gap-1 ${sideClass}`}
                    >
                      <span className="font-mono font-bold text-amber-300">{inc.displayMin}</span>
                      <span>{inc.icon}</span>
                      <span className="font-medium truncate max-w-[200px]" title={inc.text}>
                        {inc.shortText || inc.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Full Incident Stream with Category Filters */}
      {activeTab === 'events' && (
        <div className="space-y-2 animate-fadeIn font-sans">
          {/* Incident Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-1 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800 text-[10px]">
            <div className="flex items-center gap-1">
              <span className="text-slate-400 flex items-center gap-0.5 mr-1">
                <Filter className="w-3 h-3 text-slate-400" /> 筛选:
              </span>
              <button
                onClick={() => setIncidentFilter('all')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  incidentFilter === 'all' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                全部 ({allIncidents.length})
              </button>
              <button
                onClick={() => setIncidentFilter('goal')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  incidentFilter === 'goal' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                进球 ⚽ ({allIncidents.filter(i => i.isGoal).length})
              </button>
              <button
                onClick={() => setIncidentFilter('corner')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  incidentFilter === 'corner' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                角球 🚩 ({allIncidents.filter(i => i.isCorner).length})
              </button>
              <button
                onClick={() => setIncidentFilter('card')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  incidentFilter === 'card' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                红黄牌 🟨🟥 ({allIncidents.filter(i => i.isCard).length})
              </button>
              <button
                onClick={() => setIncidentFilter('sub')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  incidentFilter === 'sub' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                换人 🔄 ({allIncidents.filter(i => i.isSub).length})
              </button>
              <button
                onClick={() => setIncidentFilter('danger')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  incidentFilter === 'danger' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                关键攻防 ⚡ ({allIncidents.filter(i => !i.isGoal && !i.isCorner && !i.isCard && !i.isSub).length})
              </button>
            </div>

            <div className="text-[9px] text-slate-400 font-mono">
              主队: <span className="text-emerald-400 font-bold">{allIncidents.filter(i => i.side === 'home').length}</span> 项 | 客队: <span className="text-purple-400 font-bold">{allIncidents.filter(i => i.side === 'away').length}</span> 项
            </div>
          </div>

          {/* Incidents Chronological Card List */}
          {allIncidents.length === 0 ? (
            <div className="text-center py-6 bg-slate-900/60 rounded-lg border border-slate-800 text-slate-400 text-xs">
              <ListOrdered className="w-5 h-5 text-slate-500 mx-auto mb-1" />
              <span>暂无本场比赛事件流数据</span>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {allIncidents
                .filter((inc) => {
                  if (incidentFilter === 'goal') return inc.isGoal;
                  if (incidentFilter === 'corner') return inc.isCorner;
                  if (incidentFilter === 'card') return inc.isCard;
                  if (incidentFilter === 'sub') return inc.isSub;
                  if (incidentFilter === 'danger') return !inc.isGoal && !inc.isCorner && !inc.isCard && !inc.isSub;
                  return true;
                })
                .map((inc, idx) => {
                  const isHome = inc.side === 'home';
                  const isAway = inc.side === 'away';

                  const badgeBorder = isHome
                    ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200'
                    : isAway
                    ? 'border-purple-700/60 bg-purple-950/40 text-purple-200'
                    : 'border-slate-800 bg-slate-950 text-slate-300';

                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-lg border flex items-center justify-between gap-2 transition-all ${badgeBorder}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Minute Bubble */}
                        <div className="w-9 h-6 rounded bg-slate-950 border border-slate-800 flex items-center justify-center font-mono font-bold text-amber-300 text-[10px] shrink-0 shadow-xs">
                          {inc.displayMin}
                        </div>

                        {/* Icon */}
                        <span className="text-base shrink-0">{inc.icon}</span>

                        {/* Event Text & Team Name */}
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5 truncate">
                            <span>{inc.shortText || inc.text}</span>
                            {inc.sideName && (
                              <span className={`text-[9px] px-1 py-0.2 rounded border font-normal ${
                                isHome ? 'bg-emerald-950 border-emerald-600 text-emerald-300' : 'bg-purple-950 border-purple-600 text-purple-300'
                              }`}>
                                {inc.sideName}
                              </span>
                            )}
                          </div>
                          {inc.text !== inc.shortText && (
                            <div className="text-[9.5px] text-slate-400 truncate">
                              {inc.text}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Half & Side Tag */}
                      <div className="text-right shrink-0">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                          isHome ? 'bg-emerald-900/60 text-emerald-300' : isAway ? 'bg-purple-900/60 text-purple-300' : 'bg-slate-900 text-slate-400'
                        }`}>
                          {isHome ? '主队' : isAway ? '客队' : '中立'} · {inc.half === 1 ? '上半场' : inc.half === 2 ? '下半场' : '常规'}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Tactical Analytics & Archetypes 4-Quadrant KPIs */}
      {activeTab === 'analytics' && (
        <div className="space-y-2.5 animate-fadeIn">
          {/* 4 Quadrants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* KPI 1: Pattern Archetype */}
            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-sans flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5 text-indigo-400" /> 攻势形态学分型
                </span>
                <span className="font-bold text-indigo-300 px-2 py-0.5 bg-indigo-950/80 rounded border border-indigo-800/60">
                  {analysis.patternZh}
                </span>
              </div>
              <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                {analysis.patternDesc}
              </p>
            </div>

            {/* KPI 2: Recent 15m Momentum & Slope */}
            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-sans flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" /> 近15分钟攻势斜率
                </span>
                <span className={`font-bold px-2 py-0.5 rounded border ${
                  analysis.recent15m.direction === 'HOME_SURGING' ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                  : analysis.recent15m.direction === 'AWAY_SURGING' ? 'bg-purple-950 text-purple-300 border-purple-600'
                  : 'bg-slate-950 text-slate-300 border-slate-700'
                }`}>
                  {analysis.recent15m.directionZh}
                </span>
              </div>
              <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
                {analysis.recent15m.summaryZh}
              </p>
            </div>

            {/* KPI 3: Home & Away Conversion Efficiency */}
            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg space-y-1.5">
              <div className="text-xs font-sans text-slate-400 flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-emerald-400" /> 攻势实际转化效率 (Conversion)
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-slate-950 p-1.5 rounded border border-emerald-900/40 space-y-0.5">
                  <div className="text-emerald-400 font-bold flex items-center justify-between">
                    <span>{analysis.homeConversion.sideName}</span>
                    <span className="text-[9px] px-1 rounded bg-emerald-950 border border-emerald-700">{analysis.homeConversion.efficiencyZh}</span>
                  </div>
                  <div className="text-slate-400 text-[9px]">
                    进球: {analysis.homeConversion.goals} | 角球: {analysis.homeConversion.corners} | 造牌: {analysis.homeConversion.cardsForced}
                  </div>
                </div>

                <div className="bg-slate-950 p-1.5 rounded border border-purple-900/40 space-y-0.5">
                  <div className="text-purple-400 font-bold flex items-center justify-between">
                    <span>{analysis.awayConversion.sideName}</span>
                    <span className="text-[9px] px-1 rounded bg-purple-950 border border-purple-700">{analysis.awayConversion.efficiencyZh}</span>
                  </div>
                  <div className="text-slate-400 text-[9px]">
                    进球: {analysis.awayConversion.goals} | 角球: {analysis.awayConversion.corners} | 造牌: {analysis.awayConversion.cardsForced}
                  </div>
                </div>
              </div>
            </div>

            {/* KPI 4: Crunch Time & Critical Window Indices */}
            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg space-y-1">
              <div className="text-xs font-sans text-slate-400 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-rose-400" /> 决胜时段加权热度 (Critical Windows)
              </div>
              <div className="space-y-1 text-[10px] text-slate-300">
                <div className="flex items-center justify-between bg-slate-950 px-2 py-1 rounded border border-slate-800">
                  <span className="text-slate-400">半场末段(35'-45+')</span>
                  <span className="font-bold text-amber-300">{analysis.criticalWindowLateH1.desc}</span>
                </div>
                <div className="flex items-center justify-between bg-slate-950 px-2 py-1 rounded border border-slate-800">
                  <span className="text-slate-400">全场末段(75'-90+')</span>
                  <span className="font-bold text-rose-300">{analysis.criticalWindowLateH2.desc}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Peak Periods Detailed Timeline List */}
          {analysis.peakPeriods.length > 0 && (
            <div className="bg-slate-900/70 border border-slate-800 p-2 rounded-lg space-y-1">
              <div className="text-[10px] font-bold text-slate-300 flex items-center gap-1 font-sans">
                <Zap className="w-3 h-3 text-amber-400" /> 极强压制高潮(≥65分) 详细记录：
              </div>
              <div className="space-y-1 text-[9.5px]">
                {analysis.peakPeriods.map((peak, idx) => (
                  <div key={idx} className="bg-slate-950/80 px-2 py-1 rounded border border-slate-800 flex items-center justify-between gap-1">
                    <span className="text-slate-200 font-sans">{peak.summaryZh}</span>
                    <span className="text-amber-400 font-mono font-bold shrink-0">{peak.peakScore}分</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Tactical Event Response (Substitutions, Cards, Goals) */}
      {activeTab === 'shifts' && (
        <div className="space-y-2 animate-fadeIn">
          {analysis.tacticalShifts.length === 0 ? (
            <div className="text-center py-6 bg-slate-900/60 rounded border border-slate-800 text-slate-400 text-xs font-sans">
              <Repeat className="w-5 h-5 text-slate-500 mx-auto mb-1" />
              <span>暂无已识别的换人或红牌战术突变记录</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {analysis.tacticalShifts.map((shift, idx) => {
                const isPositive = shift.shiftMagnitude > 0;
                return (
                  <div
                    key={idx}
                    className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1 font-sans"
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-slate-200">
                        <span className="text-sm">{shift.eventIcon}</span>
                        <span>{shift.displayMin} {shift.sideName} ({shift.text})</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                        前10分均值: {shift.momentumBefore10} ➔ 后10分: {shift.momentumAfter10} (Δ{isPositive ? `+${shift.shiftMagnitude}` : shift.shiftMagnitude})
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-300 leading-relaxed">
                      {shift.summaryZh}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Odds Traps & Divergence Signals */}
      {activeTab === 'divergence' && (
        <div className="space-y-2 animate-fadeIn">
          {analysis.divergenceSignals.length === 0 ? (
            <div className="text-center py-6 bg-slate-900/60 rounded border border-slate-800 text-slate-400 text-xs font-sans">
              <Radar className="w-5 h-5 text-slate-500 mx-auto mb-1" />
              <span>攻势走势与当前盘口水位暂未出现显著负背离，场面平稳。</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {analysis.divergenceSignals.map((sig, idx) => {
                const colorMap = {
                  emerald: 'bg-emerald-950/70 border-emerald-600/60 text-emerald-200',
                  amber: 'bg-amber-950/70 border-amber-600/60 text-amber-200',
                  rose: 'bg-rose-950/70 border-rose-600/60 text-rose-200',
                  indigo: 'bg-indigo-950/70 border-indigo-600/60 text-indigo-200',
                  purple: 'bg-purple-950/70 border-purple-600/60 text-purple-200'
                };

                return (
                  <div
                    key={idx}
                    className={`border rounded-lg p-2.5 space-y-1 font-sans ${colorMap[sig.color]}`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{sig.tag} {sig.title}</span>
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-950/80 border border-slate-700 uppercase">
                        {sig.level}
                      </span>
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-slate-100">
                      {sig.desc}
                    </p>
                    <div className="text-[9.5px] text-slate-300 font-mono pt-0.5 border-t border-slate-800/60">
                      依据: {sig.basis}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: AI Quant Brief Snippet */}
      {activeTab === 'ai_brief' && (
        <div className="space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-sans font-bold flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
              <span>AI 决策引擎注入特征简报</span>
            </span>
            <button
              onClick={handleCopyAiSnippet}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow"
            >
              {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedSnippet ? '已复制到剪贴板' : '一键复制特征'}</span>
            </button>
          </div>

          <pre className="text-[10px] bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
            {analysis.aiPromptSnippet}
          </pre>
        </div>
      )}

      {/* Tactical Conversion & Valuation Verdict Footer */}
      {tacticalConversionZh && (
        <div className="text-[9.5px] text-indigo-200 bg-indigo-950/40 border border-indigo-800/40 rounded px-2 py-1.5 flex items-start gap-1.5 font-sans">
          <Award className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
          <span>{tacticalConversionZh}</span>
        </div>
      )}
    </div>
  );
};



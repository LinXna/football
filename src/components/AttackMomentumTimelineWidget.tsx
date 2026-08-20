import React, { useState } from 'react';
import { Activity, Flame, TrendingUp, ChevronDown, ChevronUp, Zap, Flag, Award, AlertCircle, ShieldAlert } from 'lucide-react';
import { DecisionItem } from '../types';

export interface ParsedIncidentItem {
  min: number;
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
function parseMinuteVal(rawTime: any, rawDataStr?: string): { min: number; displayMin: string } {
  let str = String(rawTime ?? '').trim();
  if (!str && rawDataStr) {
    const matchLead = String(rawDataStr).match(/^(\d{1,3})(?:\+(\d{1,2}))?[']?/);
    if (matchLead) {
      str = matchLead[0];
    }
  }

  if (!str) return { min: -1, displayMin: '' };

  // Check stoppage format e.g. 45+2' or 90+4'
  const plusMatch = str.match(/^(\d{1,3})\+(\d{1,2})/);
  if (plusMatch) {
    const base = parseInt(plusMatch[1], 10);
    const extra = parseInt(plusMatch[2], 10);
    return { min: base + extra, displayMin: `${base}+${extra}'` };
  }

  const numMatch = str.match(/^(\d{1,3})/);
  if (numMatch) {
    const m = parseInt(numMatch[1], 10);
    return { min: m, displayMin: `${m}'` };
  }

  const directNum = Number(rawTime);
  if (Number.isFinite(directNum) && directNum >= 0 && directNum <= 130) {
    return { min: directNum, displayMin: `${directNum}'` };
  }

  return { min: -1, displayMin: '' };
}

export function parseMatchIncidents(match?: any): ParsedIncidentItem[] {
  if (!match) return [];
  const rawList = [
    ...(Array.isArray(match.incidents) ? match.incidents : []),
    ...(Array.isArray(match.key_incidents) ? match.key_incidents : []),
    ...(Array.isArray(match.text_live) ? match.text_live : []),
    ...(Array.isArray(match.events) ? match.events : []),
    ...(Array.isArray(match.live_events) ? match.live_events : []),
    ...(Array.isArray(match.focused_incidents?.match_events) ? match.focused_incidents.match_events : []),
    ...(Array.isArray(match.focused_incidents?.key_events) ? match.focused_incidents.key_events : []),
    ...(Array.isArray(match.detail_context?.formal?.live_match?.text_live) ? match.detail_context.formal.live_match.text_live : []),
    ...(Array.isArray(match.detail_context?.formal?.live_match?.incidents) ? match.detail_context.formal.live_match.incidents : []),
    ...(Array.isArray(match.detail_context?.live_match?.text_live) ? match.detail_context.live_match.text_live : []),
    ...(Array.isArray(match.detail_context?.live_match?.incidents) ? match.detail_context.live_match.incidents : []),
    ...(Array.isArray(match.detail_context?.text_live) ? match.detail_context.text_live : []),
    ...(Array.isArray(match.detail_context?.incidents) ? match.detail_context.incidents : []),
    ...(Array.isArray(match.candidate?.detail_context?.formal?.live_match?.text_live) ? match.candidate.detail_context.formal.live_match.text_live : []),
    ...(Array.isArray(match.candidate?.detail_context?.formal?.live_match?.incidents) ? match.candidate.detail_context.formal.live_match.incidents : []),
    ...(Array.isArray(match.candidate?.incidents) ? match.candidate.incidents : []),
    ...(Array.isArray(match.candidate?.text_live) ? match.candidate.text_live : []),
    ...(Array.isArray(match.raw_data?.incidents) ? match.raw_data.incidents : []),
    ...(Array.isArray(match.raw_data?.text_live) ? match.raw_data.text_live : []),
    ...(Array.isArray(match._incidents) ? match._incidents : []),
  ];

  const homeName = String(match?.ybty_home || match?.home || match?.home_team || '').trim();
  const awayName = String(match?.ybty_away || match?.away || match?.away_team || '').trim();
  const homeLeisu = String(match?.leisu_home || match?.detail_context?.formal?.live_match?.home || '').trim();
  const awayLeisu = String(match?.leisu_away || match?.detail_context?.formal?.live_match?.away || '').trim();

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

    const { min, displayMin } = parseMinuteVal(rawTime, rawText);
    if (min < 0 && !rawText) continue;

    // Filter out generic boilerplate like "大家好，欢迎收看" or "比赛即将开始"
    if (rawType === 0 && (/大家好|欢迎收看|热身|天气|良好|多云|晴/i.test(rawText) && !/角球|进球|黄牌|红牌|点球/i.test(rawText))) {
      continue;
    }
    // Half time whistle / match start
    if (rawType === 10 || rawType === 11 || /上半场开始|下半场开始|上半场结束|全场结束/i.test(rawText)) {
      continue;
    }

    const isGoal = rawType === 1 || rawType === 9 || /进球|破门|点球进|得分|球进了|自摆乌龙|乌龙球|goal/i.test(rawText);
    const isCorner = rawType === 2 || /角球|获得角球|第\d+个角球|corner/i.test(rawText);
    const isRed = rawType === 4 || /红牌|两黄变红|被罚下|red card/i.test(rawText);
    const isYellow = rawType === 3 || /黄牌|吃到黄牌|yellow card/i.test(rawText);
    const isSub = rawType === 8 || /换人|替补登场|换下|substitution/i.test(rawText);
    const isDanger = /中框|门柱|横梁|扑救|险情|射正/i.test(rawText);

    // Only keep real, valuable football incidents
    if (!isGoal && !isCorner && !isRed && !isYellow && !isSub && !isDanger) {
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

    // Create concise summary text
    let shortText = rawText;
    if (isGoal) shortText = `进球 ⚽ ${sideTeamName ? `(${sideTeamName})` : ''}`;
    else if (isCorner) shortText = `角球 🚩 ${sideTeamName ? `(${sideTeamName})` : ''}`;
    else if (isRed) shortText = `红牌 🟥 ${sideTeamName ? `(${sideTeamName})` : ''}`;
    else if (isYellow) shortText = `黄牌 🟨 ${sideTeamName ? `(${sideTeamName})` : ''}`;
    else if (isSub) shortText = `换人 🔄 ${sideTeamName ? `(${sideTeamName})` : ''}`;

    const dedupeKey = `${min}_${icon}_${side}_${rawText.slice(0, 15)}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      results.push({
        min,
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
  const isPrematch = !match?.minute || match.minute === 0 ||
    match.export_mode === 'prematch' || match.status === 'PREMATCH' ||
    String(match?.status || '').toLowerCase().includes('pre');

  const rawTimeline =
    match?.attack_momentum_timeline ||
    match?.live_match_physical_facts?.attack_momentum_timeline ||
    match?.detail_context?.formal?.live_match?.attack_momentum_timeline ||
    match?.detail_context?.formal?.attack_momentum_timeline ||
    match?.detail_context?.live_match?.attack_momentum_timeline ||
    match?.detail_context?.attack_momentum_timeline ||
    match?.recent_trends?.attack_momentum_timeline ||
    match?.live_statistics?.attack_momentum_timeline ||
    match?.candidate?.attack_momentum_timeline ||
    match?.candidate?.detail_context?.formal?.live_match?.attack_momentum_timeline ||
    match?.raw?.attack_momentum_timeline ||
    match?.raw_data?.attack_momentum_timeline ||
    match?._detail_context?.formal?.live_match?.attack_momentum_timeline ||
    null;

  const incidents = parseMatchIncidents(match);
  const homeName = match?.ybty_home || match?.home || match?.home_team || '主队';
  const awayName = match?.ybty_away || match?.away || match?.away_team || '客队';

  if (!rawTimeline || typeof rawTimeline !== 'object') {
    return {
      hasTimeline: false,
      isPrematch,
      segmentCount: 0,
      nominalMinutes: 45,
      segments: [],
      points: [],
      allIncidents: incidents,
      currentMinute: match?.minute || 0,
      recent5Share: { home: 50, away: 50, dominantSide: 'balanced' },
      recentShare: { home: 50, away: 50 },
      dominanceWindows: [],
      trend: 'BALANCED_CONTEST',
      tacticalConversionZh: '',
      verdictZh: isPrematch ? '赛前待开赛，攻势曲线尚未生成' : '暂无即时攻势时序数据',
    };
  }

  const rawData = rawTimeline.data;
  const nominalMinutes = Number(rawTimeline.nominal_segment_minutes) || 45;
  const reportedSegmentCount = Number(rawTimeline.segment_count) || 2;

  // Normalize into 2D segments: Array<Array<number>>
  let rawSegments: number[][] = [];

  if (Array.isArray(rawData) && rawData.length > 0) {
    if (Array.isArray(rawData[0])) {
      // Standard 2D array: data: [ [-90, 100, ...], [22, 20, ...] ]
      rawSegments = rawData.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
    } else if (typeof rawData[0] === 'number') {
      // 1D fallback
      rawSegments = [rawData.map(Number)];
    }
  } else if (Array.isArray(rawTimeline.periods) && rawTimeline.periods.length > 0) {
    rawSegments = rawTimeline.periods.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
  } else if (Array.isArray(rawTimeline.raw?.data) && rawTimeline.raw.data.length > 0) {
    rawSegments = rawTimeline.raw.data.map((seg: any) => (Array.isArray(seg) ? seg.map(Number) : []));
  }

  rawSegments = rawSegments.filter((s) => s.length > 0);

  if (rawSegments.length === 0) {
    return {
      hasTimeline: false,
      isPrematch,
      segmentCount: reportedSegmentCount,
      nominalMinutes,
      segments: [],
      points: [],
      allIncidents: incidents,
      currentMinute: match?.minute || 0,
      recent5Share: { home: 50, away: 50, dominantSide: 'balanced' },
      recentShare: { home: 50, away: 50 },
      dominanceWindows: [],
      trend: 'BALANCED_CONTEST',
      tacticalConversionZh: '',
      verdictZh: '暂无即时攻势打分时序',
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
      const startMin = segIdx === 0 ? startIdx : nominalMinutes + 1 + startIdx;
      const endMin = segIdx === 0 ? endIdx : nominalMinutes + 1 + endIdx;
      const sideTeamName = side === 'home' ? homeName : awayName;

      // Correlate with incidents occurring in [startMin - 1, endMin + 1]
      const correlated = incidents
        .filter((inc) => inc.min >= Math.max(0, startMin - 1) && inc.min <= endMin + 1)
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

      const windowDesc = `[${segName}] ${startMin}'-${endMin}' ${side === 'home' ? '主队' : '客队'}(${sideTeamName})持续压制高潮(连续${streakCount}分钟攻势占优) ${convNote}`;

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
      const approxMin = baseOffset + idx;

      let displayLabel = '';
      if (segIdx === 0) {
        displayLabel = idx > nominalMinutes ? `${nominalMinutes}+${idx - nominalMinutes}'` : `${idx}'`;
      } else if (segIdx === 1) {
        const standardMin = nominalMinutes + idx + 1;
        displayLabel = standardMin > 90 ? `90+${standardMin - 90}'` : `${standardMin}'`;
      } else {
        displayLabel = `${approxMin}'`;
      }

      // Check if any key incident occurred on this minute (matching both absolute minute and segment relative minute)
      const matched = incidents.filter((inc) => {
        if (segIdx === 0) {
          return inc.min === approxMin || inc.min === idx || Math.abs(inc.min - approxMin) <= 0.5;
        } else if (segIdx === 1) {
          const standardMin = nominalMinutes + 1 + idx;
          return inc.min === approxMin || inc.min === standardMin || (inc.min > 45 && inc.min - 45 === idx) || Math.abs(inc.min - standardMin) <= 0.5;
        }
        return inc.min === approxMin;
      });

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
      if (segIdx === 0) return inc.min <= nominalMinutes + 5;
      if (segIdx === 1) return inc.min > nominalMinutes;
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

interface WidgetProps {
  match: DecisionItem;
  compact?: boolean;
}

export const AttackMomentumTimelineWidget: React.FC<WidgetProps> = ({ match, compact = false }) => {
  const [showFullTimeline, setShowFullTimeline] = useState(true);
  const [selectedSegIdx, setSelectedSegIdx] = useState<number | null>(null); // null = all segments
  const [hoveredPoint, setHoveredPoint] = useState<TimelinePoint | null>(null);
  const parsed = extractAttackMomentumTimeline(match);

  if (parsed.isPrematch) {
    return null;
  }

  if (!parsed.hasTimeline) {
    return (
      <div className="flex items-center justify-between text-[10px] bg-slate-900/60 rounded px-2 py-1 border border-slate-800/80 text-slate-400 font-mono">
        <span className="flex items-center gap-1 text-slate-400">
          <Activity className="w-3 h-3 text-slate-500" />
          <span>攻势评分曲线: 暂无即时数据</span>
        </span>
        <span className="text-[9px] text-slate-500">待雷速时序同步</span>
      </div>
    );
  }

  const { recent5Share, recentShare, dominanceWindows, trend, segments, allIncidents, tacticalConversionZh } = parsed;

  const trendBadge =
    trend === 'HOME_HEAVY_PRESSURE'
      ? { label: '主队高压围攻', color: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' }
      : trend === 'AWAY_HEAVY_PRESSURE'
      ? { label: '客队高压围攻', color: 'bg-purple-950/80 border-purple-500/50 text-purple-300' }
      : { label: '攻势相对胶着', color: 'bg-slate-900 border-slate-700 text-slate-400' };

  return (
    <div className="bg-slate-950/95 border border-indigo-900/40 rounded-lg p-3 space-y-2.5 font-mono text-[11px] shadow-sm">
      {/* Header bar: Title, Share & Status */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 font-bold text-slate-200">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11.5px] font-sans">攻势时序波形与事件标记 (Attack Momentum & Events)</span>
          {segments.length > 1 && (
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 border border-indigo-700/50 text-indigo-300">
              {segments.length}个半场分段
            </span>
          )}
          {allIncidents.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-600/50 text-amber-300 font-bold">
              {allIncidents.length}个事件标记
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
            <span className="text-[9px] text-slate-300 font-medium">近15分钟攻势占比</span>
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

      {/* Segmented Minute-by-Minute Waveform with Half-Time Dividing Boundaries & Clear Event Markers */}
      {segments.length > 0 && showFullTimeline && (
        <div className="mt-1 pt-1 border-t border-slate-800/80 space-y-2">
          {/* Segment Selector Tabs if multiple segments */}
          {segments.length > 1 && (
            <div className="flex items-center gap-1.5 text-[9.5px]">
              <button
                onClick={() => setSelectedSegIdx(null)}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  selectedSegIdx === null ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                全场全景 ({parsed.points.length}分钟)
              </button>
              {segments.map((seg) => (
                <button
                  key={seg.segmentIndex}
                  onClick={() => setSelectedSegIdx(seg.segmentIndex)}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    selectedSegIdx === seg.segmentIndex ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {seg.segmentName} ({seg.points.length}分 · {seg.segmentIncidents.length}事件)
                </button>
              ))}
            </div>
          )}

          {/* Render Segments */}
          <div className="space-y-2">
            {segments
              .filter((seg) => selectedSegIdx === null || seg.segmentIndex === selectedSegIdx)
              .map((seg) => {
                const firstLabel = seg.points[0]?.displayLabel || "0'";
                const lastLabel = seg.points[seg.points.length - 1]?.displayLabel || `${seg.points.length}'`;

                return (
                  <div key={seg.segmentIndex} className="bg-slate-900/80 border border-slate-800 rounded-md p-2 space-y-1">
                    <div className="text-[9.5px] text-slate-400 flex items-center justify-between pb-1 font-sans">
                      <span className="text-indigo-300 font-bold">【{seg.segmentName}】{firstLabel}</span>
                      <span className="text-slate-400 text-[9px] flex items-center gap-2">
                        <span>主攻势 🟢</span>
                        <span>客攻势 🟣</span>
                        <span className="text-amber-300">事件 ⚽/🚩/🟨/🟥/🔄</span>
                      </span>
                      <span className="text-indigo-300 font-bold">{lastLabel}</span>
                    </div>

                    {/* Waveform Track + Pins: Height increased for clear event markers */}
                    <div className="h-14 w-full bg-slate-950 rounded border border-slate-800/80 flex items-stretch justify-between px-1 gap-[1px] relative pt-3.5 pb-0.5">
                      {seg.points.map((p, idx) => {
                        const hHeight = Math.min(100, (p.h / 100) * 100);
                        const aHeight = Math.min(100, (p.a / 100) * 100);
                        const isDominantHome = p.score > 0;
                        const isDominantAway = p.score < 0;
                        const hasEvent = !!p.eventIcon;

                        return (
                          <div
                            key={idx}
                            onMouseEnter={() => setHoveredPoint(p)}
                            onMouseLeave={() => setHoveredPoint(null)}
                            className={`flex-1 flex flex-col justify-between items-center h-full group relative cursor-pointer ${
                              hasEvent ? 'z-20' : 'hover:z-10'
                            }`}
                          >
                            {/* Incident Icon Marker at top of the bar column */}
                            {p.eventIcon && (
                              <div
                                className="absolute -top-3.5 flex flex-col items-center animate-bounce duration-1000"
                                title={p.eventText || `${p.displayLabel} 事件`}
                              >
                                <span className="text-[11px] leading-none drop-shadow-md select-none">
                                  {p.eventIcon}
                                </span>
                              </div>
                            )}

                            {/* Upper Half: Home Attack Bar */}
                            <div className="w-full flex flex-col items-center justify-end h-1/2">
                              <div
                                style={{ height: `${p.h > 0 ? Math.max(12, hHeight) : 0}%` }}
                                className={`w-full max-w-[5px] rounded-t-xs transition-all ${
                                  isDominantHome
                                    ? hasEvent
                                      ? 'bg-emerald-300 ring-1 ring-amber-400'
                                      : 'bg-emerald-400 group-hover:bg-emerald-300'
                                    : 'bg-transparent'
                                }`}
                              />
                            </div>

                            {/* Center Line */}
                            <div className="w-full h-[1px] bg-slate-800 group-hover:bg-slate-600" />

                            {/* Lower Half: Away Attack Bar */}
                            <div className="w-full flex flex-col items-center justify-start h-1/2">
                              <div
                                style={{ height: `${p.a > 0 ? Math.max(12, aHeight) : 0}%` }}
                                className={`w-full max-w-[5px] rounded-b-xs transition-all ${
                                  isDominantAway
                                    ? hasEvent
                                      ? 'bg-purple-300 ring-1 ring-amber-400'
                                      : 'bg-purple-400 group-hover:bg-purple-300'
                                    : 'bg-transparent'
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Hover Info Tooltip Bar */}
                    {hoveredPoint && hoveredPoint.segmentIndex === seg.segmentIndex && (
                      <div className="text-[9.5px] bg-slate-950 border border-indigo-700/60 rounded px-2 py-0.5 text-slate-200 flex items-center justify-between animate-fadeIn">
                        <span className="font-bold text-indigo-300">{seg.segmentName} {hoveredPoint.displayLabel}</span>
                        <span className="font-mono">
                          主队攻势: <strong className="text-emerald-400">+{hoveredPoint.h}</strong> | 客队攻势: <strong className="text-purple-400">-{hoveredPoint.a}</strong>
                        </span>
                        {hoveredPoint.eventText && (
                          <span className="text-amber-300 font-medium">
                            【事件】{hoveredPoint.eventText}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Explicit Key Incidents Stream / Badges */}
          {allIncidents.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-md p-2 space-y-1.5">
              <div className="text-[10px] text-slate-300 flex items-center justify-between font-sans">
                <span className="font-semibold text-amber-300 flex items-center gap-1">
                  <Flag className="w-3 h-3 text-amber-400" />
                  <span>比赛关键事件轴 (Key Incidents Stream)</span>
                </span>
                <span className="text-[9px] text-slate-500">共 {allIncidents.length} 项核验事件</span>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {allIncidents.map((inc, iIdx) => {
                  const sideStyle =
                    inc.side === 'home'
                      ? 'bg-emerald-950/70 border-emerald-600/40 text-emerald-200'
                      : inc.side === 'away'
                      ? 'bg-purple-950/70 border-purple-600/40 text-purple-200'
                      : 'bg-slate-950 border-slate-700 text-slate-300';

                  const isImportant = inc.isGoal || inc.isCard;

                  return (
                    <div
                      key={iIdx}
                      className={`text-[9px] px-2 py-0.5 rounded border flex items-center gap-1 shadow-xs transition-colors ${sideStyle} ${
                        isImportant ? 'ring-1 ring-amber-500/40 font-bold' : ''
                      }`}
                      title={inc.text}
                    >
                      <span className="font-mono text-amber-300 font-bold">{inc.displayMin}</span>
                      <span className="text-[11px]">{inc.icon}</span>
                      <span className="truncate max-w-[180px]">{inc.shortText || inc.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Continuous Dominance Windows Aligned with Text Live Incidents */}
      {dominanceWindows.length > 0 ? (
        <div className="space-y-1.5">
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
      ) : (
        <div className="text-[9.5px] text-slate-400 truncate" title={parsed.verdictZh}>
          {parsed.verdictZh}
        </div>
      )}

      {/* Tactical Conversion & Valuation Verdict Footer */}
      {tacticalConversionZh && (
        <div className="text-[9.5px] text-indigo-200 bg-indigo-950/40 border border-indigo-800/40 rounded px-2 py-1.5 flex items-start gap-1.5">
          <Award className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
          <span>{tacticalConversionZh}</span>
        </div>
      )}
    </div>
  );
};

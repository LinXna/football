import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  FileJson, 
  CheckCircle2, 
  ShieldAlert, 
  FileSpreadsheet, 
  Upload, 
  Zap, 
  Sparkles, 
  Clock, 
  Check, 
  AlertCircle,
  AlertTriangle,
  Plus,
  RefreshCw,
  Tag,
  Timer,
  Edit2,
  X
} from 'lucide-react';
import { buildAliasLookup, getCanonicalName, normalizeTeamName, isSameTeam } from '../lib/teamAliasMatcher';
import { matchSequentialName } from '../lib/sequentialNameMatcher';
import { normalizeLeisuInterfaceExport } from '../lib/leisuInterfaceImport';
import { scoreDisplay } from '../lib/scoreDisplay';

interface ExportDataViewProps {
  onRefreshAll?: () => void;
}

interface ParsedMatchItem {
  league?: string;
  match: string;
  commence_time: string;
  ybty_home: string;
  ybty_away: string;
  leisu_home?: string;
  leisu_away?: string;
  score: string | null;
  market: string;
  line: string;
  odds: number | null;
  start_time_beijing: string;
  provider_start_time?: string;
  elapsed_time_text?: string;
  score_verified: boolean;
  score_source: string;
  source_type: 'ybty' | 'leisu' | 'combined' | 'live' | string;
  captured_at: string;
  minute?: number;
  is_live?: boolean;
  export_mode?: 'live' | 'prematch';
  conflicts?: string[];
  canonical_home?: string;
  canonical_away?: string;

  // Extended fields for Leisu Integration
  matched_leisu?: {
    match_id?: string;
    league?: string;
    leisu_home: string;
    leisu_away: string;
    score: string;
    minute?: number;
    score_verified?: boolean;
    confidence: number;
  } | null;
  unmatch_reason?: string;
  candidate_leisu_matches?: Array<{
    leisu_home: string;
    leisu_away: string;
    league?: string;
    score?: string;
    minute?: number;
  }>;
  all_leisu_teams?: string[];
  ybty_raw_markets?: any[];
  live_statistics?: any;
  reference_odds?: any;
  recent_trends?: any;
  incidents?: any[];
  weather?: any;
  lineups?: any;
  player_candidates?: any[];
  live_text?: any;
  detail_context?: any;
}

export const ExportDataView: React.FC<ExportDataViewProps> = ({ onRefreshAll }) => {
  const [pastedData, setPastedData] = useState<string>('');
  const uploadedRawDataRef = useRef<string>('');
  const [uploadedFileSummary, setUploadedFileSummary] = useState<string>('');
  const [exportBaseTime, setExportBaseTime] = useState<string>(
    new Date().toISOString().replace('T', ' ').substring(0, 19)
  );
  const [parsedItems, setParsedItems] = useState<ParsedMatchItem[]>([]);
  const [selectedImportIndexes, setSelectedImportIndexes] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [importMode, setImportMode] = useState<'overwrite' | 'merge'>('overwrite');
  const [isClearing, setIsClearing] = useState(false);
  const [snapshotFiles, setSnapshotFiles] = useState<{ live: { name: string; text: string } | null; prematch: { name: string; text: string } | null }>({ live: null, prematch: null });
  const selectedImportItems = parsedItems.filter((_, index) => selectedImportIndexes.has(index));
  const activeRawData = () => uploadedRawDataRef.current || pastedData;

  useEffect(() => {
    setSelectedImportIndexes(new Set(parsedItems.map((_, index) => index)));
  }, [parsedItems]);

  const toggleImportItem = (index: number) => {
    setSelectedImportIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Alias management state
  const [aliases, setAliases] = useState<{ manual: Record<string, string[]>; auto: Record<string, string[]> }>({
    manual: {},
    auto: {},
  });
  const [newCanonical, setNewCanonical] = useState<string>('');
  const [newAlias, setNewAlias] = useState<string>('');
  const [aliasMsg, setAliasMsg] = useState<string | null>(null);
  const [editingMatchedIndex, setEditingMatchedIndex] = useState<number | null>(null);

  // Unbind or rebind a matched match
  const handleUnbindMatch = (idx: number) => {
    setEditingMatchedIndex((cur) => (cur === idx ? null : idx));
  };

  // Fetch aliases on mount
  const loadAliases = async () => {
    try {
      const res = await fetch('/api/aliases');
      if (res.ok) {
        const data = await res.json();
        setAliases(data);
        return data;
      }
    } catch (e) {
      console.warn('Could not fetch aliases', e);
    }
    return null;
  };

  useEffect(() => {
    loadAliases();
  }, []);

  const handleExport = async (type: 'live' | 'prematch') => {
    const response = await fetch(`/api/export-combined?type=${type}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setSubmitResult({ success: false, msg: data.error || '整合数据导出失败' });
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `ybty_leisu_${type}_combined.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  // Safe helper to extract string from potential object or primitive
  const safeExtractString = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
      if (typeof val.beijing_time === 'string') return val.beijing_time;
      if (typeof val.datetime === 'string') return val.datetime;
      if (typeof val.time === 'string') return val.time;
      if (typeof val.date === 'string') return val.date;
      if (typeof val.name === 'string') return val.name;
      if (typeof val.zh_name === 'string') return val.zh_name;
      if (typeof val.name_zh === 'string') return val.name_zh;
      if (typeof val.status === 'string') return val.status;
    }
    return '';
  };

  // Helper to normalize league names for fuzzy comparison
  const normalizeLeagueName = (league: string): string => {
    if (!league) return '';
    return league
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
      .replace(/(足球|联赛|锦标赛|杯赛|常规赛|甲级|乙级|超级|女子|女足|公开赛|杯|甲|乙|超)/g, '');
  };

  // Check if two league names match
  const checkLeagueMatch = (leagueA: string, leagueB: string): boolean => {
    if (!leagueA || !leagueB) return false;
    const rawA = leagueA.trim().toLowerCase();
    const rawB = leagueB.trim().toLowerCase();
    if (rawA === rawB) return true;

    const normA = normalizeLeagueName(leagueA);
    const normB = normalizeLeagueName(leagueB);

    if (normA && normB) {
      if (normA === normB) return true;
      if (normA.length >= 2 && normB.length >= 2) {
        if (normA.includes(normB) || normB.includes(normA)) return true;
      }
      if (matchSequentialName(normA, normB)) return true;
    }
    if (matchSequentialName(leagueA, leagueB)) return true;
    return false;
  };

  // Helper to extract Elapsed Live Time / Clock Status (已进行时间 / 比赛进度)
  const parseElapsedTimeText = (item: any, isLive: boolean): { elapsedText: string; elapsedMinutes: number } => {
    if (!isLive) {
      return { elapsedText: '未开赛 (初盘)', elapsedMinutes: 0 };
    }

    let minuteNum = typeof item.minute === 'number' && item.minute > 0 ? item.minute : 0;
    const rawClock = safeExtractString(item.clock_status || item.countdown || item.minute_text || item.time_str || item.relative_time);

    // MM:SS format (e.g., "21:27")
    const mmssMatch = rawClock.match(/^(\d{1,3}):(\d{2})$/);
    if (mmssMatch) {
      const mins = parseInt(mmssMatch[1], 10);
      const secs = parseInt(mmssMatch[2], 10);
      if (!minuteNum) minuteNum = mins;
      return {
        elapsedText: `已进行 ${mins}分${secs}秒 (第 ${mins + 1}' 分钟)`,
        elapsedMinutes: mins,
      };
    }

    // Single digit or minute format like "21'" or "21分"
    const minMatch = rawClock.match(/(\d+)/);
    if (minMatch) {
      const mins = parseInt(minMatch[1], 10);
      if (!minuteNum) minuteNum = mins;
      return {
        elapsedText: `已进行第 ${mins}' 分钟`,
        elapsedMinutes: mins,
      };
    }

    if (rawClock.includes('半场') || rawClock.includes('中场')) {
      return { elapsedText: '中场休息 (半场 45\')', elapsedMinutes: 45 };
    }

    if (minuteNum > 0) {
      return { elapsedText: `已进行第 ${minuteNum}' 分钟`, elapsedMinutes: minuteNum };
    }

    return { elapsedText: '滚球进行中', elapsedMinutes: 0 };
  };

  // Helper to calculate actual Beijing start time (开赛时间 - 北京时间)
  const parseBeijingStartTime = (item: any, elapsedMinutes: number, exportBaseTime: string, isLive: boolean): string => {
    const rawBaseTime = safeExtractString(item.captured_at || item.export_time || exportBaseTime);
    const parsedBaseMs = Date.parse(rawBaseTime.includes('T') ? rawBaseTime : rawBaseTime.replace(' ', 'T'));
    const baseMs = Number.isFinite(parsedBaseMs) ? parsedBaseMs : Date.now();
    const formatBeijing = (value: number) => {
      const date = new Date(value);
      const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(date);
      const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
      return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
    };

    // 1. Explicit candidates
    const explicitCandidates = [
      item.commence_time,
      item.start_time_beijing,
      item.ybty_start_time,
      item.beijing_time,
      item.start_time,
      item.provider_start_time,
      item._start_time_text,
      item.开赛时间,
    ];

    for (const cand of explicitCandidates) {
      const str = safeExtractString(cand);
      if (!str || str === '[object Object]') continue;

      // Full YYYY-MM-DD HH:mm
      const fullMatch = str.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:?\d{2})?/);
      if (fullMatch) {
        const parsed = Date.parse(str);
        return Number.isFinite(parsed) ? `${formatBeijing(parsed)} (明确时间)` : `${fullMatch[1]} ${fullMatch[2].slice(0, 5)} (明确时间)`;
      }

      // HH:mm format (e.g. 21:00 or 10:00)
      const hhmmMatch = str.match(/^(\d{1,2}):(\d{2})$/);
      if (hhmmMatch) {
        const base = new Date(baseMs);
        const beijingDate = new Date(base.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        beijingDate.setHours(parseInt(hhmmMatch[1], 10), parseInt(hhmmMatch[2], 10), 0, 0);
        if (!isLive && beijingDate.getTime() < baseMs - 6 * 60 * 60 * 1000) beijingDate.setDate(beijingDate.getDate() + 1);
        return `${formatBeijing(beijingDate.getTime())} (${isLive ? '雷速计划时间' : '雷速补充'})`;
      }
    }

    // 2. Relative offset for prematch
    if (!isLive) {
      let forwardMins: number | null = null;
      if (item.mins_until_start !== undefined && !isNaN(Number(item.mins_until_start))) {
        forwardMins = Number(item.mins_until_start);
      } else {
        const rawTimeVal = safeExtractString(item.clock || item.clock_status || item.start_time || item.relative_time || item.countdown);
        if (rawTimeVal.includes('后开赛') || rawTimeVal.includes('分钟后')) {
          const matchMins = rawTimeVal.match(/(\d+)/);
          if (matchMins) forwardMins = parseInt(matchMins[1], 10);
        }
      }

      if (forwardMins !== null) {
        const startMs = baseMs + forwardMins * 60 * 1000;
        return `${formatBeijing(startMs)} (按导出时间+倒计时推算)`;
      }
    }

    // 3. For live match, calculate start time from export Base Time - elapsed Minutes
    if (isLive && elapsedMinutes > 0) {
      const startMs = baseMs - elapsedMinutes * 60 * 1000;
      return `${formatBeijing(startMs)} (按导出时间-已进行分钟推算)`;
    }

    return '开赛时间未知（源文件未提供，不能用录入基准冒充）';
  };

  // Helper to parse CSV string into array of objects
  const parseCSV = (csvText: string) => {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const items: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
      const obj: any = {};

      headers.forEach((h, index) => {
        const val = values[index] || '';
        if (h === 'match' || h === '赛事' || h === '比赛') obj.match = val;
        else if (h === 'ybty_home' || h === 'home' || h === '主队') obj.ybty_home = val;
        else if (h === 'ybty_away' || h === 'away' || h === '客队') obj.ybty_away = val;
        else if (h === 'score' || h === '比分') obj.score = val;
        else if (h === 'market' || h === '盘口' || h === '玩法') obj.market = val;
        else if (h === 'line' || h === '让球' || h === '大小球') obj.line = val;
        else if (h === 'odds' || h === '水位' || h === '赔率') obj.odds = Number(val) || val;
        else if (h === 'start_time_beijing' || h === 'beijing_time' || h === '开赛时间') obj.start_time_beijing = val;
        else if (h === 'mins_until_start' || h === 'minutes' || h === 'x分钟后开赛') obj.mins_until_start = Number(val);
        else if (h === 'source' || h === '数据来源') obj.source_type = val;
      });

      if (obj.match || obj.ybty_home) {
        items.push(obj);
      }
    }
    return items;
  };

  // Helper to parse a single JSON/CSV text segment
  const parseSingleTextSegment = (textSegment: string): any[] => {
    const trimmed = textSegment.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        const interfaceItems = normalizeLeisuInterfaceExport(parsed);
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (interfaceItems) {
          return interfaceItems;
        } else if (parsed.data && typeof parsed.data === 'object') {
          const ybtyMatches = Array.isArray(parsed.data.ybty?.matches) ? parsed.data.ybty.matches : [];
          const leisuEvents = Array.isArray(parsed.data.leisu?.events) ? parsed.data.leisu.events : [];
          return [
            ...ybtyMatches.map((item: any) => ({ ...item, source_type: 'ybty', export_mode: item.export_mode || parsed.bundle_type || parsed.export_mode, export_time: item.captured_at || parsed.generated_at })),
            ...leisuEvents.map((item: any) => ({ ...item, source_type: 'leisu', export_mode: item.export_mode || parsed.bundle_type || parsed.export_mode, export_time: item.captured_at || parsed.generated_at })),
          ];
        } else if (parsed.matches && Array.isArray(parsed.matches)) {
          return parsed.matches.map((m: any) => ({
            ...m,
            export_time: m.captured_at || parsed.captured_at,
            export_mode: m.export_mode || parsed.export_mode,
            source_type: m.source_type || parsed.source_type || 'ybty',
          }));
        } else if (parsed.events && Array.isArray(parsed.events)) {
          return parsed.events.map((e: any) => ({
            ...e,
            export_time: e.captured_at || parsed.captured_at,
            export_mode: e.export_mode || parsed.export_mode,
            source_type: e.source_type || parsed.source_type || 'leisu',
          }));
        } else if (parsed.decisions && Array.isArray(parsed.decisions)) {
          return parsed.decisions.map((d: any) => ({
            ...d,
            source_type: 'combined',
          }));
        } else if (parsed.items && Array.isArray(parsed.items)) {
          return parsed.items;
        } else {
          return [parsed];
        }
      } catch {
        return parseCSV(trimmed);
      }
    } else {
      return parseCSV(trimmed);
    }
  };

  // Process raw text input
  const handleParseInput = (
    rawText: string,
    customAliases?: { manual: Record<string, string[]>; auto: Record<string, string[]> }
  ) => {
    setParseError(null);
    setSubmitResult(null);
    if (!rawText.trim()) {
      setParsedItems([]);
      return;
    }

    try {
      const activeAliases = customAliases || aliases;
      const aliasLookup = buildAliasLookup(activeAliases.manual, activeAliases.auto);
      const segments = rawText.split(/\/\*\s*--- FILE SPLIT ---\s*\*\//g);
      let list: any[] = [];

      for (const seg of segments) {
        if (seg.trim()) {
          const items = parseSingleTextSegment(seg);
          list.push(...items);
        }
      }

      // 1. Separate raw items into YBTY items, Leisu items, and pre-combined items
      const ybtyRawList: any[] = [];
      const leisuRawList: any[] = [];
      const combinedRawList: any[] = [];

      for (const item of list) {
        const rawSource = safeExtractString(item.source_type || item.provider || item.score_source).toLowerCase();
        if (rawSource.includes('combined') || rawSource.includes('decision') || item.decisions) {
          combinedRawList.push(item);
        } else if (rawSource.includes('leisu') || item.homeTeam || item.events || item.detail_context) {
          leisuRawList.push(item);
        } else {
          ybtyRawList.push(item);
        }
      }

      // Build candidate Leisu match list & unique Leisu team names list
      const candidateLeisuMatches = leisuRawList.map((l) => {
        const lHome = safeExtractString(l.ybty_home || l.home || l.homeTeam || l.home_team || l.host);
        const lAway = safeExtractString(l.ybty_away || l.away || l.awayTeam || l.away_team || l.guest);
        const lLeague = safeExtractString(l.league || l.league_name || l.tournament || l.competition);
        const lScore = scoreDisplay(l.score, '0-0');
        return { leisu_home: lHome, leisu_away: lAway, league: lLeague, score: lScore, minute: l.minute };
      }).filter((cand) => cand.leisu_home || cand.leisu_away);

      const allLeisuTeamsSet = new Set<string>();
      candidateLeisuMatches.forEach((cand) => {
        if (cand.leisu_home) allLeisuTeamsSet.add(cand.leisu_home);
        if (cand.leisu_away) allLeisuTeamsSet.add(cand.leisu_away);
      });
      const allLeisuTeams = Array.from(allLeisuTeamsSet);

      // Helper to process raw items into ParsedMatchItem
      const formatItem = (item: any, sourceTag: 'ybty' | 'leisu' | 'combined'): ParsedMatchItem => {
        const homeName = safeExtractString(item.ybty_home || item.home || item.homeTeam || item.home_team || item.host);
        const awayName = safeExtractString(item.ybty_away || item.away || item.awayTeam || item.away_team || item.guest);
        const leagueName = safeExtractString(item.league || item.league_name || item.tournament || item.competition || item.leagueName || '常规足球联赛');

        let matchStr = safeExtractString(item.match);
        if (!matchStr || matchStr === 'vs') {
          matchStr = homeName && awayName ? `${homeName} vs ${awayName}` : '未知赛事';
        }

        // Extract score
        let scoreStr = '0-0';
        if (typeof item.score === 'string' && item.score.trim() && item.score !== '[object Object]') {
          scoreStr = item.score.trim();
        } else if (typeof item.score === 'object' && item.score !== null) {
          const h = item.score.home ?? item.score.home_score ?? item.score.h ?? 0;
          const a = item.score.away ?? item.score.away_score ?? item.score.a ?? 0;
          scoreStr = `${h}-${a}`;
        } else if (item.home_score !== undefined && item.home_score !== null && item.away_score !== undefined && item.away_score !== null) {
          scoreStr = `${item.home_score}-${item.away_score}`;
        } else if (item.homeScore?.current !== undefined && item.homeScore?.current !== null && item.awayScore?.current !== undefined && item.awayScore?.current !== null) {
          scoreStr = `${item.homeScore.current}-${item.awayScore.current}`;
        }

        // Extract market, line, odds
        const market = safeExtractString(item.market || item.recommendation?.market || '');

        let rawLine = item.line ?? item.recommendation?.line;
        let line = rawLine !== undefined && rawLine !== null ? safeExtractString(rawLine) : '';

        const rawOdds = Number(item.odds ?? item.recommendation?.odds ?? item.price);
        const odds = Number.isFinite(rawOdds) && rawOdds > 1 ? rawOdds : null;

        // Determine Export Mode & Live Status strictly per protocol:
        const rawExportMode = safeExtractString(item.export_mode || item.mode || item.pipeline_type || item.type).toLowerCase();
        const rawStatus = safeExtractString(item.status?.type || item.status || item.match_status || item.clock_status).toLowerCase();
        const rawTitle = safeExtractString(item.page_title || item.title || item.header_title);
        const fileName = safeExtractString(item.file_name || item.filename).toLowerCase();

        let isMatchLive = false;
        let detectedMode: 'live' | 'prematch' = 'prematch';

        if (
          rawExportMode === 'prematch' ||
          rawStatus === 'notstarted' ||
          rawTitle.includes('未开始') ||
          fileName.includes('prematch')
        ) {
          detectedMode = 'prematch';
          isMatchLive = false;
          if (scoreStr === '' || scoreStr === '0-0') {
            scoreStr = '0-0 (未开赛)';
          }
        } else if (
          rawExportMode === 'live' ||
          rawStatus === 'inprogress' ||
          rawStatus === 'halftime' ||
          rawTitle.includes('正在进行') ||
          fileName.includes('live') ||
          Boolean(item.minute && item.minute > 0) ||
          /^(?:[\d\+\']|半场|下半场|上半场|进行中|中场)/.test(safeExtractString(item.clock_status || item.countdown || item.start_time))
        ) {
          detectedMode = 'live';
          isMatchLive = true;
        } else {
          if (Boolean(item.minute && item.minute > 0) || (scoreStr !== '0-0' && scoreStr !== '0:0' && scoreStr !== '')) {
            detectedMode = 'live';
            isMatchLive = true;
          } else {
            detectedMode = 'prematch';
            isMatchLive = false;
            scoreStr = '0-0 (未开赛)';
          }
        }
        if (!isMatchLive) scoreStr = '未开始';

        // Extract Elapsed Time & Beijing Start Time cleanly
        const { elapsedText, elapsedMinutes } = parseElapsedTimeText(item, isMatchLive);
        let startTime = parseBeijingStartTime(item, elapsedMinutes, exportBaseTime, isMatchLive);

        // Check conflicts & canonical names
        const conflicts: string[] = [];
        const normHome = normalizeTeamName(homeName);
        const normAway = normalizeTeamName(awayName);

        const canonHome = getCanonicalName(homeName, aliasLookup);
        const canonAway = getCanonicalName(awayName, aliasLookup);

        if (normHome && canonHome !== homeName) {
          conflicts.push(`主队别名已对齐: [${homeName}] -> [${canonHome}]`);
        } else if (normHome && canonHome === homeName) {
          conflicts.push(`主队暂未建立别名: [${homeName}]`);
        }

        if (normAway && canonAway !== awayName) {
          conflicts.push(`客队别名已对齐: [${awayName}] -> [${canonAway}]`);
        } else if (normAway && canonAway === awayName) {
          conflicts.push(`客队暂未建立别名: [${awayName}]`);
        }

        // Cross-match against Leisu data pool: PRIORITIZE LEAGUE MATCH FIRST
        let matchedLeisuObj: ParsedMatchItem['matched_leisu'] = null;
        let matchedLeisuRaw: any = null;
        let unmatchReason = '';

        if (sourceTag === 'ybty') {
          // Filter Leisu candidates that belong to the SAME or matching league
          const sameLeagueLeisuList = leisuRawList.filter((l) => {
            const lLeague = safeExtractString(l.league || l.league_name || l.tournament || l.competition || l.leagueName);
            return checkLeagueMatch(leagueName, lLeague);
          });

          // 1. Try matching within same league first
          let foundLeisu = sameLeagueLeisuList.find((l) => {
            const lHome = safeExtractString(l.ybty_home || l.home || l.homeTeam || l.home_team || l.host);
            const lAway = safeExtractString(l.ybty_away || l.away || l.awayTeam || l.away_team || l.guest);
            const lCanonHome = getCanonicalName(lHome, aliasLookup);
            const lCanonAway = getCanonicalName(lAway, aliasLookup);

            const matchHome = (canonHome && canonHome === lCanonHome) || 
                              (canonHome && canonHome === lHome) ||
                              (homeName && homeName === lCanonHome) ||
                              (normHome && normHome === normalizeTeamName(lHome)) ||
                              isSameTeam(homeName, lHome, aliasLookup) ||
                              matchSequentialName(homeName, lHome) ||
                              (canonHome && matchSequentialName(canonHome, lHome));
            const matchAway = (canonAway && canonAway === lCanonAway) || 
                              (canonAway && canonAway === lAway) ||
                              (awayName && awayName === lCanonAway) ||
                              (normAway && normAway === normalizeTeamName(lAway)) ||
                              isSameTeam(awayName, lAway, aliasLookup) ||
                              matchSequentialName(awayName, lAway) ||
                              (canonAway && matchSequentialName(canonAway, lAway));
            return matchHome && matchAway;
          });

          // 2. Fallback to searching all Leisu items if not found in same league
          if (!foundLeisu) {
            foundLeisu = leisuRawList.find((l) => {
              const lHome = safeExtractString(l.ybty_home || l.home || l.homeTeam || l.home_team || l.host);
              const lAway = safeExtractString(l.ybty_away || l.away || l.awayTeam || l.away_team || l.guest);
              const lCanonHome = getCanonicalName(lHome, aliasLookup);
              const lCanonAway = getCanonicalName(lAway, aliasLookup);

              const matchHome = (canonHome && canonHome === lCanonHome) || 
                                (canonHome && canonHome === lHome) ||
                                (homeName && homeName === lCanonHome) ||
                                (normHome && normHome === normalizeTeamName(lHome)) ||
                                isSameTeam(homeName, lHome, aliasLookup) ||
                                matchSequentialName(homeName, lHome) ||
                                (canonHome && matchSequentialName(canonHome, lHome));
              const matchAway = (canonAway && canonAway === lCanonAway) || 
                                (canonAway && canonAway === lAway) ||
                                (awayName && awayName === lCanonAway) ||
                                (normAway && normAway === normalizeTeamName(lAway)) ||
                                isSameTeam(awayName, lAway, aliasLookup) ||
                                matchSequentialName(awayName, lAway) ||
                                (canonAway && matchSequentialName(canonAway, lAway));
              return matchHome && matchAway;
            });
          }

          if (foundLeisu) {
            matchedLeisuRaw = foundLeisu;
            const leisuStartTime = parseBeijingStartTime(foundLeisu, elapsedMinutes, exportBaseTime, isMatchLive);
            if (!leisuStartTime.startsWith('开赛时间未知')) startTime = leisuStartTime;
            const lHome = safeExtractString(foundLeisu.ybty_home || foundLeisu.home || foundLeisu.homeTeam || foundLeisu.home_team || foundLeisu.host);
            const lAway = safeExtractString(foundLeisu.ybty_away || foundLeisu.away || foundLeisu.awayTeam || foundLeisu.away_team || foundLeisu.guest);
            const lLeague = safeExtractString(foundLeisu.league || foundLeisu.league_name);
            matchedLeisuObj = {
              leisu_home: lHome,
              leisu_away: lAway,
              league: lLeague,
              score: scoreDisplay(foundLeisu.score, isMatchLive ? '0-0' : '0-0 (未开赛)'),
              minute: foundLeisu.minute || elapsedMinutes,
              confidence: checkLeagueMatch(leagueName, lLeague) ? 0.98 : 0.90,
              score_verified: foundLeisu.score_verified === true,
            };
          } else {
            if (leisuRawList.length === 0) {
              unmatchReason = '【原因 1：未导入雷速数据】您当前仅导入了 YBTY 投注盘口导出，尚未同时导入雷速比分数据文件 (leisu_live_*.json 或 leisu_prematch_*.json)。请将雷速文件一起粘贴或追加导入。';
            } else {
              unmatchReason = `【原因 2：队名译名未对齐】已优先对比同联赛 (${leagueName}) 及全池 ${leisuRawList.length} 场雷速比赛。请在下方点击“一键关联此雷速比赛”建立别名。`;
            }
          }
        } else if (sourceTag === 'combined' && item.match) {
          matchedLeisuObj = {
            leisu_home: item.match.leisu_home || homeName,
            leisu_away: item.match.leisu_away || awayName,
            league: item.match.league || leagueName,
            score: item.match.score || scoreStr,
            minute: item.match.minute || elapsedMinutes,
            confidence: item.match_confidence || 0.9,
            score_verified: item.match.score_verified === true,
          };
        }

        // Sort candidate matches so that matches in the SAME LEAGUE appear first
        const sortedCandidateMatches = [...candidateLeisuMatches].sort((a, b) => {
          const aSame = checkLeagueMatch(leagueName, a.league || '');
          const bSame = checkLeagueMatch(leagueName, b.league || '');
          if (aSame && !bSame) return -1;
          if (!aSame && bSame) return 1;
          return 0;
        });

        return {
          league: leagueName,
          match: matchStr,
          commence_time: startTime,
          ybty_home: homeName || (matchStr.includes(' vs ') ? matchStr.split(' vs ')[0] : matchStr),
          ybty_away: awayName || (matchStr.includes(' vs ') ? matchStr.split(' vs ')[1] : ''),
          leisu_home: matchedLeisuObj?.leisu_home || '',
          leisu_away: matchedLeisuObj?.leisu_away || '',
          score: isMatchLive ? scoreStr : null,
          market,
          line,
          odds,
          start_time_beijing: startTime,
          provider_start_time: matchedLeisuRaw?._start_time_text || item.provider_start_time || undefined,
          elapsed_time_text: elapsedText,
          score_verified: item.score_verified === true,
          score_source: item.score_source || `${sourceTag}_export`,
          source_type: sourceTag,
          captured_at: item.captured_at || item.export_time || exportBaseTime,
          minute: elapsedMinutes || item.minute,
          is_live: isMatchLive,
          export_mode: detectedMode,
          conflicts,
          canonical_home: canonHome,
          canonical_away: canonAway,
          matched_leisu: matchedLeisuObj,
          unmatch_reason: unmatchReason,
          candidate_leisu_matches: sortedCandidateMatches,
          all_leisu_teams: allLeisuTeams,
          ybty_raw_markets: Array.isArray(item.ybty_raw_markets)
            ? item.ybty_raw_markets
            : Array.isArray(item.markets)
              ? item.markets
              : Array.isArray(item.market_source?.markets)
                ? item.market_source.markets
                : [],
          live_statistics: item.live_statistics || matchedLeisuRaw?._statistics || matchedLeisuRaw?.live_statistics || null,
          reference_odds: item.reference_odds || matchedLeisuRaw?.reference_odds || matchedLeisuRaw?.odds || null,
          recent_trends: item.recent_trends || matchedLeisuRaw?._recent_trends || matchedLeisuRaw?.recent_trends || (
            matchedLeisuRaw && (matchedLeisuRaw._historical_analysis || matchedLeisuRaw.analysis_data)
              ? {
                  recent: matchedLeisuRaw._recent_trends || null,
                  historical_analysis: matchedLeisuRaw._historical_analysis || null,
                  analysis_data: matchedLeisuRaw.analysis_data || null,
                }
              : null
          ),
          incidents: item.incidents || matchedLeisuRaw?._incidents || matchedLeisuRaw?.incidents || [],
          weather: item.weather || matchedLeisuRaw?._weather || matchedLeisuRaw?.weather || null,
          lineups: item.lineups || matchedLeisuRaw?._lineups || matchedLeisuRaw?.lineups || null,
          player_candidates: item.player_candidates || matchedLeisuRaw?._player_candidates || matchedLeisuRaw?.player_candidates || [],
          live_text: item.live_text || matchedLeisuRaw?._live_text || matchedLeisuRaw?.live_text || null,
          detail_context: item.detail_context || matchedLeisuRaw?.detail_context || matchedLeisuRaw?._detail_context || null,
        };
      };

      // Create primary list from YBTY items first, then combined, then standalone Leisu items
      const primaryList: any[] = [];

      if (ybtyRawList.length > 0) {
        ybtyRawList.forEach((it) => primaryList.push(formatItem(it, 'ybty')));
      }

      combinedRawList.forEach((it) => primaryList.push(formatItem(it, 'combined')));

      if (ybtyRawList.length === 0 && combinedRawList.length === 0) {
        // Only Leisu items uploaded
        leisuRawList.forEach((it) => primaryList.push(formatItem(it, 'leisu')));
      }

      if (primaryList.length === 0) {
        setParseError('未识别到有效的赛事记录，请检查 CSV 标题或 JSON 格式。');
      } else {
        setParsedItems(primaryList);
      }
    } catch (e: any) {
      setParseError(`解析失败: ${e.message}。请确保为标准 JSON 或包含 Header 头的 CSV 文件`);
    }
  };

  const handleSnapshotUpload = async (type: 'live' | 'prematch', file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const declaredType = String(parsed.bundle_type || parsed.export_mode || '').toLowerCase();
      if (declaredType && declaredType !== type) {
        setParseError(`文件类型不匹配：这里需要${type === 'live' ? '滚球' : '非滚球'}整合快照，但文件声明为 ${declaredType}。`);
        return;
      }
    } catch {
      setParseError('整合快照必须是有效的 JSON 文件。');
      return;
    }
    const nextFiles = { ...snapshotFiles, [type]: { name: file.name, text } };
    setSnapshotFiles(nextFiles);
    const combinedText = [nextFiles.live?.text, nextFiles.prematch?.text].filter(Boolean).join('\n\n/* --- FILE SPLIT --- */\n\n');
    uploadedRawDataRef.current = combinedText;
    setPastedData('');
    setUploadedFileSummary(`已加载 ${Object.values(nextFiles).filter(Boolean).length} 个文件，共 ${(combinedText.length / 1024 / 1024).toFixed(2)} MB`);
    handleParseInput(combinedText);
  };

  // Handle Multi-File Upload (.json / .csv)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const fileContents = await Promise.all(
      fileList.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve((event.target?.result as string) || '');
            reader.onerror = () => resolve('');
            reader.readAsText(file);
          })
      )
    );

    const validContents = fileContents.filter((c) => c.trim().length > 0);
    const combinedText = validContents.join('\n\n/* --- FILE SPLIT --- */\n\n');
    uploadedRawDataRef.current = combinedText;
    setPastedData('');
    setUploadedFileSummary(`已加载 ${validContents.length} 个文件，共 ${(combinedText.length / 1024 / 1024).toFixed(2)} MB`);
    handleParseInput(combinedText);
  };

  // Handle Drag & Drop Multiple Files
  const handleDropFiles = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileList = Array.from(e.dataTransfer.files);
      const fileContents = await Promise.all(
        fileList.map(
          (file) =>
            new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve((event.target?.result as string) || '');
              reader.onerror = () => resolve('');
              reader.readAsText(file);
            })
        )
      );

      const validContents = fileContents.filter((c) => c.trim().length > 0);
      const combinedText = validContents.join('\n\n/* --- FILE SPLIT --- */\n\n');
      uploadedRawDataRef.current = combinedText;
      setPastedData('');
      setUploadedFileSummary(`已加载 ${validContents.length} 个文件，共 ${(combinedText.length / 1024 / 1024).toFixed(2)} MB`);
      handleParseInput(combinedText);
    }
  };

  // Add Alias via API and re-parse
  const handleAddAliasSubmit = async () => {
    if (!newCanonical.trim() || !newAlias.trim()) return;
    try {
      const resp = await fetch('/api/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_name: newCanonical.trim(),
          alias: newAlias.trim(),
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setAliasMsg(`成功保存别名 [${newAlias.trim()}] 对应标准名 [${newCanonical.trim()}]！`);
        setNewAlias('');
        await loadAliases();
        if (activeRawData()) handleParseInput(activeRawData());
      }
    } catch (e: any) {
      setAliasMsg(`添加别名失败: ${e.message}`);
    }
  };

  // Add Quick Alias for a specific match team
  const handleAddQuickAlias = async (canonical: string, alias: string) => {
    if (!canonical.trim() || !alias.trim()) return;
    try {
      const resp = await fetch('/api/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_name: canonical.trim(),
          alias: alias.trim(),
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setAliasMsg(`已成功将别名 [${alias.trim()}] 绑定至标准队名 [${canonical.trim()}]，全表已自动重新对齐！`);
        setEditingMatchedIndex(null);
        const fresh = await loadAliases();
        if (activeRawData()) handleParseInput(activeRawData(), fresh || undefined);
      } else {
        setAliasMsg(`添加别名失败: ${data.error || '无法保存'}`);
      }
    } catch (e: any) {
      setAliasMsg(`添加别名失败: ${e.message}`);
    }
  };

  // Pair both home and away team aliases for a match in one click
  const handlePairMatchAliases = async (
    ybtyHome: string,
    leisuHome: string,
    ybtyAway: string,
    leisuAway: string
  ) => {
    try {
      setAliasMsg(`正在关联映射: [${ybtyHome}] ➔ [${leisuHome}] & [${ybtyAway}] ➔ [${leisuAway}] ...`);
      if (ybtyHome && leisuHome && ybtyHome !== leisuHome) {
        await fetch('/api/aliases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canonical_name: leisuHome.trim(), alias: ybtyHome.trim() }),
        });
      }
      if (ybtyAway && leisuAway && ybtyAway !== leisuAway) {
        await fetch('/api/aliases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canonical_name: leisuAway.trim(), alias: ybtyAway.trim() }),
        });
      }
      setAliasMsg(`成功与雷速对齐！[${ybtyHome}] / [${ybtyAway}] 已自动关联至雷速队名 [${leisuHome}] / [${leisuAway}]。`);
      setEditingMatchedIndex(null);
      const fresh = await loadAliases();
      if (activeRawData()) handleParseInput(activeRawData(), fresh || undefined);
    } catch (e: any) {
      setAliasMsg(`对齐关联失败: ${e.message}`);
    }
  };
  const loadPresetJson = () => {
    const jsonSample = JSON.stringify(
      [
        {
          match: "东方俱乐部 vs 卡巴列罗ZC",
          score: "0-0",
          market: "全场大球",
          line: "2.25",
          odds: 1.95,
          mins_until_start: 25,
          source_type: "ybty"
        },
        {
          match: "丹佛峰会(女) vs 北卡罗莱纳(女)",
          score: "0-0",
          market: "全场独赢 (主)",
          line: "",
          odds: 2.19,
          start_time_beijing: "2026-08-05 21:27",
          source_type: "ybty"
        },
        {
          match: "丹佛峰会女足 vs 北卡罗来纳勇气女足",
          score: "0-0",
          market: "全场大球",
          line: "2.25",
          odds: 1.92,
          start_time_beijing: "2026-08-05 21:27",
          source_type: "leisu"
        }
      ],
      null,
      2
    );
    setPastedData(jsonSample);
    handleParseInput(jsonSample);
  };

  const loadPresetCsv = () => {
    const csvSample = `赛事,比分,盘口,让球,水位,开赛时间,数据来源
丹佛峰会(女) vs 北卡罗莱纳(女),0-0,全场独赢 (主),,2.19,2026-08-05 21:27,YBTY
丹佛峰会女足 vs 北卡罗来纳勇气女足,0-0,全场大球,2.25,1.92,2026-08-05 21:27,雷速
托卢卡体育 vs 西雅图海湾人,1-0,全场独赢 (主),,1.06,2026-08-05 16:26,YBTY`;
    setPastedData(csvSample);
    handleParseInput(csvSample);
  };

  // Clear Outdated / Reset Analysis Matches endpoint caller
  const handleClearOutdatedMatches = async () => {
    setIsClearing(true);
    try {
      const res = await fetch('/api/clear-outdated-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'all', clear_mode: 'all' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitResult({
          success: true,
          msg: `🧹 已成功一键清空分析库！共清空 ${data.total_cleared} 场旧比赛 (滚球: ${data.cleared_live} 场, 非滚球: ${data.cleared_prematch} 场)。推荐台账与复盘记录完好无损！`,
        });
        if (onRefreshAll) onRefreshAll();
      } else {
        setSubmitResult({ success: false, msg: data.error || '清空失败' });
      }
    } catch (err: any) {
      setSubmitResult({ success: false, msg: `清空请求异常: ${err.message}` });
    } finally {
      setIsClearing(false);
    }
  };

  // Batch Submit to Backend Endpoint
  const handleBatchSubmit = async () => {
    if (selectedImportItems.length === 0) return;
    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      const importPayload = selectedImportItems.map((item) => {
        const {
          candidate_leisu_matches: _candidateMatches,
          all_leisu_teams: _allLeisuTeams,
          conflicts: _conflicts,
          canonical_home: _canonicalHome,
          canonical_away: _canonicalAway,
          unmatch_reason: _unmatchReason,
          ...persistentItem
        } = item;
        return persistentItem;
      });
      const res = await fetch('/api/batch-supplement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importPayload, mode: importMode }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSubmitResult({
          success: true,
          msg: importMode === 'overwrite'
            ? `✅ 已成功使用勾选的 ${selectedImportItems.length} 场赛事【完全覆盖并更新】分析库！已自动清空旧批次过时赛事。(当前分析库: 滚球 ${data.live_count} 场, 非滚球 ${data.prematch_count} 场)`
            : `✅ 已成功增量匹配更新 ${data.total_updated} 场赛事！`,
        });
        if (onRefreshAll) {
          onRefreshAll();
        }
      } else {
        setSubmitResult({
          success: false,
          msg: data.error || '批量同步更新失败',
        });
      }
    } catch (err: any) {
      setSubmitResult({
        success: false,
        msg: `请求异常: ${err.message}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemsWithConflicts = parsedItems.filter((i) => i.conflicts && i.conflicts.length > 0);

  return (
    <div className="space-y-6">
      {/* Page Title Header */}
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl space-y-2">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">整合数据快照导出 & CSV/JSON 批量数据补充</h2>
            <p className="text-xs text-slate-400">
              遵循《export_combined_data.py》整合规范：导出 YBTY×雷速全量底层快照，或通过 CSV/JSON 批量补全水位盘口与北京开赛时间。
            </p>
          </div>
        </div>
      </div>

      {/* CSV / JSON Batch Data Supplement Module */}
      <div className="bg-slate-900/90 border border-emerald-500/30 p-5 rounded-xl space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                📥 CSV / JSON 批量数据补充与交叉融合引擎
                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded font-mono">
                  AUTO MATCH & MERGE
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                支持拖拽/粘贴多个 YBTY 及雷速导出文件！系统自动区分来源（YBTY / 雷速）、自动匹配别名，一键全量刷盘补全盘口水位与精确时间。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadPresetJson}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded transition-colors"
            >
              示例 JSON
            </button>
            <button
              onClick={loadPresetCsv}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded transition-colors"
            >
              示例 CSV
            </button>
          </div>
        </div>

        {/* Input & File Upload Area */}
        <div className="space-y-3">
          {/* Relative Time Calculation Base Bar */}
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span className="flex items-center gap-1.5 text-amber-300">
                <Clock className="w-4 h-4 text-amber-400" />
                ⏱️ YBTY 导出基准时间设置 (用于自动推算 “X分钟后开赛” 相对时间)
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                符合项目协议 Rule #6: X分钟后开赛 + 导出时间推算北京精确时间
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={exportBaseTime}
                onChange={(e) => {
                  setExportBaseTime(e.target.value);
                  if (activeRawData()) handleParseInput(activeRawData());
                }}
                className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs font-mono w-60"
                placeholder="2026-08-05 18:00:00"
              />
              <button
                type="button"
                onClick={() => {
                  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
                  setExportBaseTime(nowStr);
                  if (activeRawData()) handleParseInput(activeRawData());
                }}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-xs border border-slate-700 transition-colors"
              >
                设置为当前时间
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            <label className="font-semibold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              粘贴 CSV/JSON，或按住 Ctrl/Cmd 选择多个文件 (支持多文件拖拽)：
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".csv,.json,.txt"
                onChange={handleFileUpload}
                multiple
                className="hidden"
                id="batch-file-input"
              />
              <label
                htmlFor="batch-file-input"
                className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-slate-100 border border-emerald-600 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-colors shadow-md"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-300" />
                <span>多选本地文件 (按 Ctrl/Shift 多选上传)</span>
              </label>
            </div>
          </div>

          <textarea
            rows={4}
            value={pastedData}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropFiles}
            onChange={(e) => {
              uploadedRawDataRef.current = '';
              setUploadedFileSummary('');
              setPastedData(e.target.value);
              handleParseInput(e.target.value);
            }}
            placeholder={`支持以下格式：\n1. 多文件混合 JSON: 拖拽/全选 leisu_latest.json 与 ybty_latest.json\n2. 含相对时间文本或比分格式\n3. CSV 文本: 赛事,比分,盘口,让球,水位,开赛时间,数据来源`}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
          />
          {uploadedFileSummary && (
            <div className="text-xs text-emerald-300">{uploadedFileSummary}；原始大文件保存在内存引用中，不再塞入文本框渲染。</div>
          )}

          {parseError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>

        {/* Alias Quick Add Bar for Custom Global Resolution */}
        <div className="bg-slate-950/90 border border-indigo-500/30 p-3 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
            <span className="flex items-center gap-1.5 text-indigo-300">
              <Tag className="w-4 h-4 text-indigo-400" />
              🔗 球队别名通用快捷录入 (解决跨平台名称不一致)
            </span>
            <span className="text-[10px] text-slate-400">
              提示：下方“解析列表”针对每场具体比赛已显示对应的联赛名、比分、开赛时间及一键绑定按钮
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="标准队名 (如: 丹佛峰会女足)"
              value={newCanonical}
              onChange={(e) => setNewCanonical(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs w-44 focus:outline-none focus:border-indigo-500"
            />
            <span className="text-slate-500">←</span>
            <input
              type="text"
              placeholder="YBTY/雷速别名 (如: 丹佛峰会(女))"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs w-48 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleAddAliasSubmit}
              disabled={!newCanonical.trim() || !newAlias.trim()}
              className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold rounded text-xs flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              保存别名
            </button>
          </div>

          {aliasMsg && (
            <p className="text-[11px] text-emerald-400 font-mono font-bold animate-pulse">{aliasMsg}</p>
          )}
        </div>

        {/* Detailed Match-by-Match Alignment Cards with League, Time, Status, Score */}
        {parsedItems.length > 0 && (
          <div className="bg-slate-950/80 border border-indigo-500/40 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-indigo-400" />
                📋 导入比赛明细 & 逐场别名精准映射 ({parsedItems.length} 场)
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                包含联赛、主客队、开赛状态/分钟、比分、北京时间与一键对齐
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-300">已勾选 {selectedImportItems.length}/{parsedItems.length} 场，提交时只导入勾选比赛</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setSelectedImportIndexes(new Set(parsedItems.map((_, index) => index)))} className="font-bold text-emerald-400 hover:text-emerald-300">全选</button>
                <button type="button" onClick={() => setSelectedImportIndexes(new Set())} className="font-bold text-slate-400 hover:text-slate-200">全不选</button>
              </div>
            </div>

            <div className="space-y-3 min-h-[560px] max-h-[72vh] overflow-y-auto pr-1">
              {parsedItems.map((item, idx) => {
                const isMatchLive = item.is_live === true;
                return (
                  <div key={idx} className={`bg-slate-900/90 border p-3.5 rounded-xl space-y-3 transition-all shadow-md ${selectedImportIndexes.has(idx) ? 'border-emerald-600/60' : 'border-slate-800 opacity-60'}`}>
                    {/* Header: Source Badge + League + Live Status + Beijing Time */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedImportIndexes.has(idx)}
                          onChange={() => toggleImportItem(idx)}
                          aria-label={`选择导入 ${item.match}`}
                          className="h-4 w-4 rounded border-slate-600 text-emerald-600 focus:ring-emerald-500"
                        />
                        {item.source_type === 'ybty' && (
                          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-mono">
                            🏷️ YBTY 投注主体
                          </span>
                        )}
                        {item.source_type === 'leisu' && (
                          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800 rounded font-mono">
                            📊 雷速情报数据
                          </span>
                        )}
                        {item.source_type === 'combined' && (
                          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800 rounded font-mono">
                            🟣 YBTY+雷速整合
                          </span>
                        )}

                        <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/80 rounded font-mono">
                          🏆 {item.league || '常规足球联赛'}
                        </span>

                        {isMatchLive ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 rounded flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            🔴 滚球进行中 ({item.elapsed_time_text || '已开赛'})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 rounded flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-400" />
                            ⏳ 预备开赛 (初盘)
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3 text-xs font-mono">
                        <span className="text-amber-300 font-bold bg-amber-950/60 px-2.5 py-1 rounded border border-amber-800/60 self-center">
                          {isMatchLive ? `⚽ 实时比分: ${item.score}` : '⏳ 比赛状态: 未开始'}
                        </span>
                        <div className="flex flex-col text-right text-[11px] font-mono leading-tight space-y-0.5">
                          <span className="text-amber-300 flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                            开赛时间 (北京时间): <strong>{item.start_time_beijing}</strong>
                          </span>
                          <span className="text-rose-300 flex items-center justify-end gap-1">
                            <Timer className="w-3 h-3 text-rose-400 shrink-0" />
                            已进行时间/进度: <strong>{item.elapsed_time_text || '未开赛'}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* YBTY Primary Match Info */}
                    <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between text-[11px] font-semibold text-slate-300">
                        <span className="text-indigo-300 font-bold">🎯 YBTY 原始队名与盘口信息:</span>
                        <span className="text-emerald-400 font-mono">
                          盘口: {item.market} {item.line} @ {item.odds}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                        <div className="bg-slate-900/80 p-2 rounded border border-slate-800 flex items-center justify-between">
                          <span className="text-slate-400">YBTY 原始主队:</span>
                          <span className="font-bold text-slate-100">{item.ybty_home}</span>
                          <span className="text-[10px] text-emerald-400">({item.canonical_home})</span>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded border border-slate-800 flex items-center justify-between">
                          <span className="text-slate-400">YBTY 原始客队:</span>
                          <span className="font-bold text-slate-100">{item.ybty_away}</span>
                          <span className="text-[10px] text-emerald-400">({item.canonical_away})</span>
                        </div>
                      </div>
                    </div>

                    {/* Leisu Cross-Match Data Status */}
                    {item.matched_leisu && editingMatchedIndex !== idx ? (
                      <div className="bg-emerald-950/30 border border-emerald-800/60 p-2.5 rounded-lg space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-emerald-300 font-bold">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ✅ 已成功对接雷速分析数据 (匹配置信度: {Math.round(item.matched_leisu.confidence * 100)}%)
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-emerald-400 font-mono">
                              雷速即时比分: {item.matched_leisu.score} {item.matched_leisu.minute ? `(${item.matched_leisu.minute}')` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUnbindMatch(idx)}
                              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 rounded text-[10px] font-semibold flex items-center gap-1 border border-slate-700 transition-colors"
                              title="如果匹配错误，可点击直接重新选择雷速比赛或修正别名"
                            >
                              <Edit2 className="w-3 h-3" />
                              修改匹配
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-300">
                          <div>雷速对应主队: <span className="font-bold text-white">{item.matched_leisu.leisu_home}</span></div>
                          <div>雷速对应客队: <span className="font-bold text-white">{item.matched_leisu.leisu_away}</span></div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-950/20 border border-amber-800/60 p-3 rounded-lg space-y-2.5 text-xs">
                        <div className="flex items-center justify-between text-amber-300 font-bold">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            {item.matched_leisu ? '🔄 正在修改匹配关系 (请选择或输入雷速对应比赛/别名)' : '⚠️ 尚未匹配到雷速比分/分析数据'}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-amber-200/80">
                              {item.matched_leisu ? '可重新选择候选或单独改绑' : '未匹配原因说明'}
                            </span>
                            {item.matched_leisu && (
                              <button
                                type="button"
                                onClick={() => setEditingMatchedIndex(null)}
                                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] flex items-center gap-1 border border-slate-700"
                              >
                                <X className="w-3 h-3" />
                                取消修改
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-amber-200/90 leading-relaxed font-mono">
                          {item.unmatch_reason || '雷速数据池中未匹配到此比赛。请在下方直接点击绑定主客队别名。'}
                        </p>

                        {/* 1. Quick Match Candidates List from imported Leisu data */}
                        {item.candidate_leisu_matches && item.candidate_leisu_matches.length > 0 && (
                          <div className="bg-slate-950/90 p-2.5 rounded-lg border border-amber-700/50 space-y-2">
                            <div className="text-[11px] font-bold text-amber-300 flex items-center justify-between">
                              <span>⚡ 已导入的雷速比赛候选列表 (按联赛 [{item.league}] 优先匹配排列):</span>
                              <span className="text-[10px] text-amber-400 font-mono">共 {item.candidate_leisu_matches.length} 场雷速比赛</span>
                            </div>
                            <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                              {item.candidate_leisu_matches.map((cand, candIdx) => {
                                const isSameLeague = checkLeagueMatch(item.league || '', cand.league || '');
                                return (
                                  <div
                                    key={candIdx}
                                    className={`bg-slate-900 p-2 rounded border flex flex-wrap items-center justify-between gap-2 transition-colors ${
                                      isSameLeague
                                        ? 'border-indigo-500/90 bg-indigo-950/30'
                                        : 'border-slate-700/80 hover:border-amber-500/80'
                                    }`}
                                  >
                                    <div className="text-xs font-mono flex items-center gap-1.5 flex-wrap">
                                      {isSameLeague && (
                                        <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                          🏆 同联赛
                                        </span>
                                      )}
                                      <span className="text-indigo-300 font-bold">[{cand.league || '常规联赛'}]</span>
                                      <span className="text-white font-bold">{cand.leisu_home} vs {cand.leisu_away}</span>
                                      <span className="text-amber-400 text-[11px]">(比分: {cand.score})</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handlePairMatchAliases(item.ybty_home, cand.leisu_home, item.ybty_away, cand.leisu_away)}
                                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors shadow-sm shrink-0"
                                    >
                                      ⚡ 一键关联此雷速比赛
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 2. Direct Manual Alias Binding with Leisu Team Datalist Suggestions */}
                        <div className="pt-2 border-t border-amber-900/40 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          {/* Datalist for Leisu Team Suggestions */}
                          {item.all_leisu_teams && item.all_leisu_teams.length > 0 && (
                            <datalist id={`leisu-teams-list-${idx}`}>
                              {item.all_leisu_teams.map((tName, tIdx) => (
                                <option key={tIdx} value={tName} />
                              ))}
                            </datalist>
                          )}

                          {/* Home Team Binding */}
                          <div className="bg-slate-950/80 p-2 rounded border border-amber-900/40 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] text-slate-300 font-semibold">
                              <span>关联 YBTY 主队: <strong className="text-amber-300">[{item.ybty_home}]</strong></span>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                id={`home-alias-input-${idx}`}
                                list={`leisu-teams-list-${idx}`}
                                placeholder="输入或选择雷速对应主队名"
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 flex-1 focus:outline-none focus:border-amber-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const el = document.getElementById(`home-alias-input-${idx}`) as HTMLInputElement;
                                  if (el && el.value.trim()) {
                                    handleAddQuickAlias(el.value.trim(), item.ybty_home);
                                  } else {
                                    setAliasMsg('请先输入或选择雷速对应的标准主队名');
                                  }
                                }}
                                className="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] font-semibold shrink-0 transition-colors"
                              >
                                绑定主队
                              </button>
                            </div>
                          </div>

                          {/* Away Team Binding */}
                          <div className="bg-slate-950/80 p-2 rounded border border-amber-900/40 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] text-slate-300 font-semibold">
                              <span>关联 YBTY 客队: <strong className="text-amber-300">[{item.ybty_away}]</strong></span>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                id={`away-alias-input-${idx}`}
                                list={`leisu-teams-list-${idx}`}
                                placeholder="输入或选择雷速对应客队名"
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 flex-1 focus:outline-none focus:border-amber-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const el = document.getElementById(`away-alias-input-${idx}`) as HTMLInputElement;
                                  if (el && el.value.trim()) {
                                    handleAddQuickAlias(el.value.trim(), item.ybty_away);
                                  } else {
                                    setAliasMsg('请先输入或选择雷速对应的标准客队名');
                                  }
                                }}
                                className="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-[10px] font-semibold shrink-0 transition-colors"
                              >
                                绑定客队
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Parsed Items Preview Table */}
        {parsedItems.length > 0 && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                已成功解析 {parsedItems.length} 场赛事的数据补全预览：
              </span>
              <span className="text-[11px] text-slate-400">包含来源标注、水位盘口与推算北京时间</span>
            </div>

            <div className="max-h-72 overflow-y-auto border border-slate-800 rounded-lg bg-slate-950/80">
              <table className="w-full text-left text-[11px] text-slate-300">
                <thead className="bg-slate-900/90 border-b border-slate-800 text-slate-400 sticky top-0 font-semibold">
                  <tr>
                    <th className="p-2">序号</th>
                    <th className="p-2">数据来源</th>
                    <th className="p-2">赛事名称 (YBTY/雷速)</th>
                    <th className="p-2">比分</th>
                    <th className="p-2">推荐玩法 / 盘口</th>
                    <th className="p-2">水位赔率</th>
                    <th className="p-2">北京开赛时间 (推算/补全)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {parsedItems.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-900/50 transition-colors">
                      <td className="p-2 text-slate-500">{index + 1}</td>
                      <td className="p-2">
                        {item.source_type === 'ybty' && (
                          <span className="px-2 py-0.5 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-bold">
                            YBTY 体育
                          </span>
                        )}
                        {item.source_type === 'leisu' && (
                          <span className="px-2 py-0.5 text-[10px] bg-sky-950 text-sky-300 border border-sky-800 rounded font-bold">
                            雷速 比分
                          </span>
                        )}
                        {item.source_type === 'combined' && (
                          <span className="px-2 py-0.5 text-[10px] bg-purple-950 text-purple-300 border border-purple-800 rounded font-bold">
                            YBTY+雷速
                          </span>
                        )}
                      </td>
                      <td className="p-2 font-bold text-slate-200">
                        {item.match}
                        {item.canonical_home && item.canonical_home !== item.ybty_home && (
                          <span className="ml-1 text-[10px] text-indigo-300 font-normal">
                            (别名对齐: {item.canonical_home})
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-amber-300 font-bold">{item.score}</td>
                      <td className="p-2 text-emerald-300">
                        {item.market} {item.line ? `(${item.line})` : ''}
                      </td>
                      <td className="p-2 font-bold text-slate-100">{item.odds}</td>
                      <td className="p-2 text-slate-300 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>{item.start_time_beijing}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {submitResult && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 font-semibold ${
                  submitResult.success
                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                    : 'bg-rose-950/80 border-rose-700 text-rose-300'
                }`}
              >
                {submitResult.success ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{submitResult.msg}</span>
              </div>
            )}

            {/* Import Mode Switcher & Purge Control */}
            <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-indigo-400" />
                  导入与数据库同步模式选择:
                </span>
                <button
                  type="button"
                  onClick={handleClearOutdatedMatches}
                  disabled={isClearing}
                  className="px-3 py-1 bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 rounded font-bold text-[11px] flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isClearing ? 'animate-spin' : ''}`} />
                  <span>{isClearing ? '清空中...' : '🧹 一键清空分析库旧比赛'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <label className={`p-2.5 rounded-lg border cursor-pointer flex items-start gap-2 transition-colors ${
                  importMode === 'overwrite'
                    ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-200'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'overwrite'}
                    onChange={() => setImportMode('overwrite')}
                    className="mt-0.5 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div>
                    <strong className="block text-emerald-300 font-bold">全新批次覆盖更新 (推荐)</strong>
                    <span className="text-[10px] text-slate-400 leading-tight block mt-0.5">
                      用当前勾选的 {selectedImportItems.length} 场比赛完全替代数据库中的旧滚球/非滚球决策列表，未勾选比赛不会导入。
                    </span>
                  </div>
                </label>

                <label className={`p-2.5 rounded-lg border cursor-pointer flex items-start gap-2 transition-colors ${
                  importMode === 'merge'
                    ? 'bg-indigo-950/40 border-indigo-500/80 text-indigo-200'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                    className="mt-0.5 text-indigo-500 focus:ring-indigo-500"
                  />
                  <div>
                    <strong className="block text-indigo-300 font-bold">增量合并更新</strong>
                    <span className="text-[10px] text-slate-400 leading-tight block mt-0.5">
                      保留数据库中已有比赛，仅对同名/别名比赛进行比分、盘口与时间补充。
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={handleBatchSubmit}
              disabled={isSubmitting || selectedImportItems.length === 0}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>
                {isSubmitting
                  ? '正在同步刷盘更新中...'
                  : importMode === 'overwrite'
                  ? `⚡ 确认用已勾选的 ${selectedImportItems.length} 场比赛【完全覆盖并同步】分析库`
                  : `⚡ 确认增量融合已勾选的 ${selectedImportItems.length} 场比赛`}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Export Snapshot Downloads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Live Combined Export Card */}
        <div className="bg-slate-900/70 border border-slate-800 hover:border-emerald-500/50 p-5 rounded-xl space-y-4 transition-all shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-100">滚球整合数据快照 (Live Combined)</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              LIVE_COMBINED
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            包含 YBTY 滚球已展开盘口、雷速即时比分与实时统计、双方数据延迟差、匹配置信度、决策记录及 WATCH 观察候选名单。
          </p>

          <div className="text-[11px] text-slate-500 space-y-1 bg-slate-950/60 p-3 rounded-lg">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 保留完整原始赛事与字段，不删减未匹配记录
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 包含比分来源及校验状态 (score_verified)
            </div>
          </div>

          <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 text-xs">
            <div className="mb-2 font-bold text-emerald-300">上传滚球整合快照</div>
            <input id="live-combined-upload" type="file" accept=".json,application/json" className="hidden" onChange={(event) => handleSnapshotUpload('live', event.target.files?.[0])} />
            <label htmlFor="live-combined-upload" className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-emerald-800 px-3 py-2 font-bold text-white hover:bg-emerald-700">
              <Upload className="h-4 w-4" /> {snapshotFiles.live?.name || '选择滚球 Combined JSON'}
            </label>
          </div>

          <button
            onClick={() => handleExport('live')}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <Download className="w-4 h-4" /> 导出滚球整合 JSON 文件
          </button>
        </div>

        {/* Prematch Combined Export Card */}
        <div className="bg-slate-900/70 border border-slate-800 hover:border-sky-500/50 p-5 rounded-xl space-y-4 transition-all shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-sky-400" />
              <h3 className="text-sm font-bold text-slate-100">非滚球整合数据快照 (Prematch Combined)</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
              PREMATCH_COMBINED
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            包含 YBTY 赛前多玩法初盘/即时盘、雷速非滚球赛程与阵营情报、赛前 AI 简报 (`prematch_ai_brief.json`) 及研究队列明细。
          </p>

          <div className="text-[11px] text-slate-500 space-y-1 bg-slate-950/60 p-3 rounded-lg">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" /> 包含 prematch_ai_brief.json 研判摘要
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" /> 保留初盘至即时盘变动与水位差
            </div>
          </div>

          <div className="rounded-lg border border-sky-700/50 bg-sky-950/20 p-3 text-xs">
            <div className="mb-2 font-bold text-sky-300">上传非滚球整合快照</div>
            <input id="prematch-combined-upload" type="file" accept=".json,application/json" className="hidden" onChange={(event) => handleSnapshotUpload('prematch', event.target.files?.[0])} />
            <label htmlFor="prematch-combined-upload" className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-800 px-3 py-2 font-bold text-white hover:bg-sky-700">
              <Upload className="h-4 w-4" /> {snapshotFiles.prematch?.name || '选择非滚球 Combined JSON'}
            </label>
          </div>

          <button
            onClick={() => handleExport('prematch')}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <Download className="w-4 h-4" /> 导出非滚球整合 JSON 文件
          </button>
        </div>
      </div>

      <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs text-amber-300 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">完整性校验保证: </span>
          导出程序锁定本次分析实际输入的底层快照，严禁混入不同批次快照数据。导出的 JSON 文件可直接用于本地深度建模、归档与第三方分析软件导入。
        </div>
      </div>
    </div>
  );
};

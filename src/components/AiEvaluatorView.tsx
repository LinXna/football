import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DecisionItem, AIAnalysisResponse, getLeagueName, getTeamDisplay } from '../types';
import { generateExtendedAnalysis } from '../lib/extendedRecommendation';
import { scoreDisplay } from '../lib/scoreDisplay';
import { extractMatchLiveStats } from '../lib/matchStats';
import { RecentFormModal } from './RecentFormModal';
import { ErrorBoundary } from './ErrorBoundary';
import { 
  Sparkles, 
  ShieldCheck, 
  AlertTriangle, 
  Layers, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  BookOpen, 
  Info, 
  Send, 
  Trophy, 
  Copy, 
  Upload, 
  FileText, 
  ExternalLink, 
  Check, 
  Trash2,
  Cpu,
  CheckSquare,
  Square,
  Flame,
  PlusCircle,
  Shuffle,
  Clock,
  Activity,
  BarChart3
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { displayText } from '../lib/displayValue';
import { buildValidParlayRequests } from '../lib/parlayRequests';

export interface CustomSelectedLeg {
  id: string;
  match: string;
  ybty_home: string;
  ybty_away: string;
  source: 'machine' | 'ai';
  market: string;
  line: string | number;
  odds: number;
  grade?: string;
  probability?: number;
  score?: any;
  minute?: number;
  score_verified?: boolean;
  score_source?: string;
  start_time_beijing?: string | null;
  pro_strategy?: string;
  reason?: string;
}

interface Props {
  selectedMatch: DecisionItem | null;
  allMatches: DecisionItem[];
  liveMatches: DecisionItem[];
  prematchMatches: DecisionItem[];
  onRefreshLedger?: () => void;
}

const hasUsableRecommendation = (item: DecisionItem): boolean => {
  const recommendation = item.recommendation;
  if (!recommendation) return false;
  return String(recommendation.market ?? '').trim().length > 0
    && String(recommendation.line ?? '').trim().length > 0
    && Number.isFinite(Number(recommendation.odds))
    && Number(recommendation.odds) > 1;
};

function formatMarketName(market?: string): string {
  if (!market) return '未知玩法';
  const m = String(market).trim();
  if (/^full_total$/i.test(m)) return '全场大小球';
  if (/^half_total$/i.test(m)) return '半场大小球';
  if (/^full_spread$/i.test(m)) return '全场让球';
  if (/^half_spread$/i.test(m)) return '半场让球';
  if (/^full_h2h$/i.test(m)) return '全场独赢1X2';
  if (/^half_h2h$/i.test(m)) return '半场独赢1X2';
  if (/^total$/i.test(m)) return '全场大小球';
  if (/^spread$/i.test(m)) return '全场让球';
  if (/^h2h$/i.test(m)) return '全场独赢1X2';
  return m;
}

function formatLineText(market?: string, line?: string | number | null, home?: string, away?: string): string {
  const m = formatMarketName(market);
  let l = line != null && line !== '' && line !== 'null' ? String(line).trim() : '';
  const h = home || '';
  const a = away || '';

  if (/大小球/i.test(m)) {
    if (!/大|小|over|under/i.test(l)) {
      l = `大 ${l}`.trim();
    } else {
      l = l.replace(/^over\s*/i, '大 ').replace(/^under\s*/i, '小 ');
    }
  } else if (/让球/i.test(m)) {
    const normalize = (v: any) => String(v || '').toLowerCase().replace(/[\s\-_·\.（）()]/g, '');
    const normH = normalize(h);
    const normA = normalize(a);
    const normL = normalize(l);
    const hasHomeOrAway = /主|客|home|away/i.test(l) || (normH && normL.includes(normH)) || (normA && normL.includes(normA));
    if (!hasHomeOrAway && h) {
      l = `${h} ${l}`.trim();
    }
  } else if (/独赢/i.test(m)) {
    if (!/胜|平|draw|home|away/i.test(l)) {
      if (l === '1' || /home/i.test(l)) l = `${h || '主队'}胜`;
      else if (l === '2' || /away/i.test(l)) l = `${a || '客队'}胜`;
      else if (l === 'x' || /draw/i.test(l)) l = '平局';
      else if (h) l = `${h}胜`;
    }
  }
  return l;
}

export const AiEvaluatorView: React.FC<Props> = ({ selectedMatch, allMatches, liveMatches, prematchMatches, onRefreshLedger }) => {
  const [matchName, setMatchName] = useState(selectedMatch?.match || '');
  const [ybtyHome, setYbtyHome] = useState(selectedMatch?.ybty_home || '');
  const [ybtyAway, setYbtyAway] = useState(selectedMatch?.ybty_away || '');
  const [minute, setMinute] = useState<number>(selectedMatch?.minute || 0);
  const [scoreHome, setScoreHome] = useState<number>(selectedMatch?.score?.home || 0);
  const [scoreAway, setScoreAway] = useState<number>(selectedMatch?.score?.away || 0);
  const [oddsInfo, setOddsInfo] = useState('');
  const [mode, setMode] = useState<'live_eval' | 'prematch_eval' | 'parlay_check'>('live_eval');

  const [parlaySelected, setParlaySelected] = useState<DecisionItem[]>([]);
  const [parlayConfigOpen, setParlayConfigOpen] = useState(false);
  const [parlayRequests, setParlayRequests] = useState<Record<number, number>>({ 2: 1 });
  const [evaluationScope, setEvaluationScope] = useState<'single' | 'batch'>('batch');
  const [batchSelected, setBatchSelected] = useState<DecisionItem[]>([]);
  const [batchChunkSize, setBatchChunkSize] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIAnalysisResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedToLedger, setSavedToLedger] = useState(false);
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [savedParlayTickets, setSavedParlayTickets] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  // Export Prompt and Manual Web Gemini Import states
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportPromptStyle, setExportPromptStyle] = useState<'standard' | 'objective'>('standard');
  const [exportedStandardPrompts, setExportedStandardPrompts] = useState<string[]>([]);
  const [exportedObjectivePrompts, setExportedObjectivePrompts] = useState<string[]>([]);
  const [exportedPrompt, setExportedPrompt] = useState<string>('');
  const [exportedCombinedPrompt, setExportedCombinedPrompt] = useState<string>('');
  const [exportedPrompts, setExportedPrompts] = useState<string[]>([]);
  const [activeExportPromptIndex, setActiveExportPromptIndex] = useState(0);
  const [exportInfo, setExportInfo] = useState<{ match_count: number; prompt_count: number; instructions: string } | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  const [showClearHistoryConfirmModal, setShowClearHistoryConfirmModal] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [selectedFormMatch, setSelectedFormMatch] = useState<DecisionItem | null>(null);

  // Hover Popover State for Machine 5 vs AI 5
  const [hoveredLeg, setHoveredLeg] = useState<{
    leg: any;
    matchItem?: DecisionItem;
    ticket: NonNullable<AIAnalysisResponse['parlay_recommendations']>[number];
    legIndex: number;
    anchorRect?: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const evaluationMatches = mode === 'live_eval' ? liveMatches : prematchMatches;
  const parlayEligibleMatches = allMatches.filter((match, index, source) =>
    source.findIndex((item) => item.match === match.match) === index
  );
  const loadEvaluationHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const resp = await fetch('/api/ai/evaluations');
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setEvaluationHistory(Array.isArray(data.evaluations) ? data.evaluations : []);
    } catch (err: any) {
      setSaveMessage(`读取评估历史失败：${err.message || '未知错误'}`);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleClearEvaluationHistory = () => {
    setShowClearHistoryConfirmModal(true);
  };

  const executeClearEvaluationHistory = async () => {
    setIsClearingHistory(true);
    try {
      let resp = await fetch('/api/ai/evaluations/clear', { method: 'POST' });
      if (resp.status === 404) {
        resp = await fetch('/api/ai/evaluations/clear', { method: 'DELETE' });
      }
      if (resp.status === 404) {
        resp = await fetch('/api/ai/evaluations', { method: 'DELETE' });
      }
      if (!resp.ok) {
        const text = await resp.text();
        let errMsg = `HTTP ${resp.status}`;
        try {
          const errJson = JSON.parse(text);
          errMsg = errJson.error || errMsg;
        } catch { /* empty */ }
        if (resp.status === 404) {
          throw new Error('本地后端未检测到该接口。请确保使用 npm run dev 启动，或者在 npm start 前先执行 npm run build 重新编译 backend 后端代码！');
        }
        throw new Error(errMsg);
      }
      const data = await resp.json();
      if (data.success) {
        setEvaluationHistory([]);
        setSaveMessage('已成功清空 AI 评估历史！');
        setShowClearHistoryConfirmModal(false);
      } else {
        setSaveMessage(`清空失败：${data.error || '未知错误'}`);
      }
    } catch (err: any) {
      setSaveMessage(`清空历史异常：${err.message}`);
    } finally {
      setIsClearingHistory(false);
    }
  };

  useEffect(() => {
    loadEvaluationHistory();
  }, [loadEvaluationHistory]);

  const populateFromMatch = (m: DecisionItem) => {
    setMatchName(m.match);
    setYbtyHome(m.ybty_home || m.match.split('vs')[0]?.trim() || '');
    setYbtyAway(m.ybty_away || m.match.split('vs')[1]?.trim() || '');
    setMinute(m.minute || 0);
    setScoreHome(m.score?.home || 0);
    setScoreAway(m.score?.away || 0);
    setOddsInfo(
      m.recommendation
        ? `${m.recommendation.market || ''} ${m.recommendation.line ?? ''} @ ${m.recommendation.odds ?? ''}`
        : ''
    );
    setSavedToLedger(false);
    setSnapshotSaved(false);
    setSaveMessage(null);
  };

  // Sync state when selectedMatch changes from parent
  useEffect(() => {
    if (selectedMatch) {
      populateFromMatch(selectedMatch);
      if (prematchMatches.includes(selectedMatch)) setMode('prematch_eval');
      else if (liveMatches.includes(selectedMatch)) setMode('live_eval');
    }
  }, [selectedMatch, liveMatches, prematchMatches]);

  useEffect(() => {
    if (mode !== 'parlay_check') setBatchSelected(evaluationMatches);
  }, [mode, liveMatches, prematchMatches]);

  useEffect(() => {
    const availableMatches = new Set(parlayEligibleMatches.map((item) => item.match));
    setParlaySelected((current) => current.filter((selected) => availableMatches.has(selected.match)));
  }, [allMatches, evaluationHistory]);

  const toggleBatchMatch = (match: DecisionItem) => {
    setBatchSelected((current) => current.some((item) => item.match === match.match)
      ? current.filter((item) => item.match !== match.match)
      : [...current, match]);
  };

  const toggleParlayMatch = (match: DecisionItem) => {
    setParlaySelected((current) => {
      if (current.some((item) => item.match === match.match)) return current.filter((item) => item.match !== match.match);
      return [...current, match];
    });
  };

  const handlePromoteCurrentToLedger = async () => {
    if (
      !result
      || String(result.recommendation?.market ?? '').trim() === ''
      || String(result.recommendation?.line ?? '').trim() === ''
      || !Number.isFinite(Number(result.recommendation?.odds))
      || Number(result.recommendation?.odds) <= 1
    ) {
      setSaveMessage('当前评估没有具备明确玩法、非空盘口和真实赔率的正式主选；可以保存完整评估快照，但不能写入正式推荐台账。');
      return;
    }
    try {
      const evaluatedRecommendation = result.recommendation!;
      let payloadMatch = matchName || `${ybtyHome} vs ${ybtyAway}`;
      let payloadHome = ybtyHome;
      let payloadAway = ybtyAway;
      let payloadMarket = evaluatedRecommendation.market;
      let payloadLine = evaluatedRecommendation.line ?? null;
      let payloadOdds = Number(evaluatedRecommendation.odds);
      const currentMatch = allMatches.find((item) => item.match === matchName) || selectedMatch;
      let payloadStartTime = currentMatch?.ybty_start_time_beijing || currentMatch?.provider_start_time || '';
      let parlayLegs: any[] = [];

      if (mode === 'parlay_check' && parlaySelected.length > 0) {
        if (parlaySelected.some((item) => !hasUsableRecommendation(item))) return;
        payloadMatch = `【AI 精选 ${parlaySelected.length}串1】${parlaySelected[0].ybty_home || parlaySelected[0].match} 等 ${parlaySelected.length} 场`;
        payloadHome = parlaySelected[0].ybty_home || '多场串关';
        payloadAway = parlaySelected[0].ybty_away || '';
        const legsSummary = parlaySelected
          .map((p, i) => `腿${i + 1}: [${p.match}] ${p.recommendation!.market} ${p.recommendation!.line} @${p.recommendation!.odds}`)
          .join(' | ');
        payloadMarket = `【${parlaySelected.length}串1精选彩票】${legsSummary}`;
        
        const calcTotalOdds = parlaySelected.reduce((acc, p) => acc * Number(p.recommendation!.odds), 1).toFixed(2);
        payloadLine = `总赔率 @${calcTotalOdds}`;
        payloadOdds = Number(calcTotalOdds);
        payloadStartTime = parlaySelected[0].ybty_start_time_beijing || parlaySelected[0].provider_start_time || '';
        parlayLegs = parlaySelected.map((p, index) => ({
          leg_index: index + 1,
          match: p.match,
          ybty_home: p.ybty_home,
          ybty_away: p.ybty_away,
          market: p.recommendation?.market,
          line: p.recommendation?.line,
          odds: p.recommendation?.odds,
          minute: p.minute || 0,
          score_at_recommendation: p.score || { home: 0, away: 0 },
          score_verified: p.score_verified === true,
          score_source: p.score_source || 'unverified',
          grade: p.grade,
          model_score: p.model_score || 0,
          start_time_beijing: p.ybty_start_time_beijing || p.provider_start_time || '',
        }));
      }

      const resp = await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match: payloadMatch,
          ybty_home: payloadHome,
          ybty_away: payloadAway,
          minute,
          score_at_recommendation: { home: scoreHome, away: scoreAway },
          score_source: result.score_source || 'ybty_market',
          score_verified: result.score_verified === true,
          grade: result.grade || 'B',
          model_score: result.grade === 'A' ? 88.0 : 78.0,
          recommendation: {
            market: payloadMarket,
            line: payloadLine,
            odds: payloadOdds,
          },
          evidence: result.evidence || [],
          risks: result.risks || [],
          start_time_beijing: payloadStartTime,
          is_parlay: mode === 'parlay_check',
          parlay_legs: parlayLegs,
        }),
      });

      if (resp.ok) {
        setSavedToLedger(true);
        setSaveMessage('正式主选已写入推荐台账。');
        if (onRefreshLedger) onRefreshLedger();
      } else {
        const data = await resp.json().catch(() => ({}));
        setSaveMessage(`正式台账写入失败：${data.error || `HTTP ${resp.status}`}`);
      }
    } catch (err: any) {
      console.error('Failed to add to ledger', err);
      setSaveMessage(`正式台账写入失败：${err.message || '未知错误'}`);
    }
  };

  const handleSaveEvaluationSnapshot = async () => {
    if (!result) return;
    setSaveMessage(null);
    try {
      const evaluatedMatches = Array.isArray(result.matches)
        ? result.matches.map((item) => item.match || `${item.ybty_home || ''} vs ${item.ybty_away || ''}`)
        : [result.match || matchName || `${ybtyHome} vs ${ybtyAway}`];
      const resp = await fetch('/api/ai/evaluations/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, scope: Array.isArray(result.matches) ? 'batch' : 'single', evaluated_matches: evaluatedMatches, result }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setSnapshotSaved(true);
      setSaveMessage(`完整评估内容已保存（${data.snapshot_id}），不会计入正式命中率。`);
      await loadEvaluationHistory();
    } catch (err: any) {
      setSaveMessage(`评估快照保存失败：${err.message || '未知错误'}`);
    }
  };

  const handleSaveParlayTicket = async (ticket: NonNullable<AIAnalysisResponse['parlay_recommendations']>[number]) => {
    const ticketKey = `${ticket.size}-${ticket.ticket_index}`;
    if ((ticket as any).verification_passed !== true || ticket.legs.some((leg: any) => leg.ybty_market_verified !== true || leg.odds_source !== 'ybty_verified')) {
      setSaveMessage('串关包含未通过YBTY真实盘口核验的腿，已禁止保存。请重新生成串关。');
      return;
    }
    try {
      const firstLeg = ticket.legs[0];
      const resp = await fetch('/api/ledger/add-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match: `【AI串关候选 ${ticket.size}串1·第${ticket.ticket_index}组】${firstLeg?.match || ''} 等 ${ticket.size} 场`,
          ybty_home: firstLeg?.ybty_home || '多场串关',
          ybty_away: firstLeg?.ybty_away || '',
          recommendation: {
            market: `AI串关候选 ${ticket.size}串1`,
            line: `${ticket.size}腿`,
            odds: ticket.estimated_total_odds,
          },
          grade: ticket.grade,
          model_score: ticket.legs.length ? Math.round(ticket.legs.reduce((sum, leg) => sum + Number(leg.probability || 0), 0) / ticket.legs.length) : 0,
          evidence: [ticket.reason],
          risks: result?.risks || [],
          is_parlay: true,
          selection_method: 'ai_multi_market_parlay_generation',
          parlay_legs: ticket.legs.map((leg, index) => ({
            leg_index: index + 1,
            match: leg.match,
            ybty_home: leg.ybty_home,
            ybty_away: leg.ybty_away,
            market: formatMarketName(leg.market),
            line: formatLineText(leg.market, leg.line, leg.ybty_home, leg.ybty_away),
            odds: leg.odds,
            grade: leg.grade,
            model_score: leg.probability,
          })),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setSavedParlayTickets((current) => new Set(current).add(ticketKey));
      setSaveMessage(`${ticket.size}串1第${ticket.ticket_index}组已保存到投注台账的“回测候选”，不会计入正式命中率。`);
      onRefreshLedger?.();
    } catch (err: any) {
      setSaveMessage(`串关保存失败：${err.message || '未知错误'}`);
    }
  };

  const handleSaveAllAiBettingAdvice = async () => {
    if (!result) return;
    const evaluated = Array.isArray(result.matches) ? result.matches : [result];
    const entries = evaluated.flatMap((matchResult) => {
      const source = allMatches.find((item) => item.match === matchResult.match)
        || allMatches.find((item) => item.ybty_home === matchResult.ybty_home && item.ybty_away === matchResult.ybty_away);
      return (matchResult.market_assessments || [])
        .filter((assessment) => ['recommend', 'watch'].includes(assessment.status) && assessment.line !== null && assessment.line !== '' && Number(assessment.odds) > 1)
        .map((assessment) => ({
          match: matchResult.match || source?.match || `${matchResult.ybty_home || ''} vs ${matchResult.ybty_away || ''}`,
          ybty_home: matchResult.ybty_home || source?.ybty_home,
          ybty_away: matchResult.ybty_away || source?.ybty_away,
          minute: source?.minute || 0,
          score_at_recommendation: source?.score || { home: 0, away: 0 },
          score_source: source?.score_source || matchResult.score_source || 'unverified',
          score_verified: source?.score_verified === true || matchResult.score_verified === true,
          grade: assessment.grade === 'NO_BET' ? 'C' : assessment.grade,
          model_score: assessment.probability || 0,
          prediction_probability: assessment.probability || 0,
          recommendation: {
            market: assessment.category.includes('独赢') ? '全场独赢' : `${assessment.category}（${assessment.direction}）`,
            line: assessment.line,
            odds: assessment.odds,
          },
          evidence: [assessment.reason, ...(matchResult.evidence || [])],
          risks: matchResult.risks || [],
          start_time_beijing: source?.ybty_start_time_beijing || source?.provider_start_time || null,
        }));
    });
    if (entries.length === 0) {
      setSaveMessage('当前AI评估没有具备真实盘口和赔率的推荐/观察方向可写入台账。');
      return;
    }
    try {
      const resp = await fetch('/api/ledger/add-ai-assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setSaveMessage(`AI投注建议已写入台账：新增 ${data.saved} 条，重复跳过 ${data.duplicates} 条，拒绝 ${data.rejected?.length || 0} 条。`);
      onRefreshLedger?.();
    } catch (err: any) {
      setSaveMessage(`AI投注建议写入失败：${err.message || '未知错误'}`);
    }
  };



  const switchExportPromptStyle = (style: 'standard' | 'objective') => {
    setExportPromptStyle(style);
    const sourcePrompts = style === 'objective' ? exportedObjectivePrompts : exportedStandardPrompts;
    if (sourcePrompts && sourcePrompts.length > 0) {
      const segmentCount = sourcePrompts.length;
      const matchManifest = exportInfo?.match_count ? `[${exportInfo.match_count} 场比赛]` : '';
      const deliveryPrompts = mode === 'parlay_check' || segmentCount <= 1
        ? sourcePrompts
        : sourcePrompts.map((prompt: string, index: number) => index < segmentCount - 1
          ? `[Segment Evaluation ${index + 1}/${segmentCount}]\nPlease evaluate this segment fully and output the complete JSON for this segment. Do not respond with "Received". After output, retain this structured result in the conversation for the next segment; the final merge should use these smaller JSON results without re-reading the original long data.\n\n${prompt}\n\n[End of Segment Control · Highest Priority] Now output the full JSON for all matches in this segment, each must include the 12 market assessments. Verify markets against the YBTY whitelist provided above; do not output any line or odds outside the whitelist.`
          : `[Segment Evaluation ${index + 1}/${segmentCount} · Final Segment]\nFirst fully evaluate this segment; then merge the previously output JSON results from segments 1 to ${index} with the current segment results directly.\n\n${prompt}\n\n[Final Merge Control · Highest Priority]\nDo not re-summarize or use placeholder objects for prior results; retain the exact 12 market assessments for each prior match, then add the current segment results. The final output must contain exactly ${exportInfo?.match_count || 1} matches objects. Output a single valid merged JSON.`);
      const combined = segmentCount > 1
        ? `[Segment Reading Instruction]\nThe following ${segmentCount} data segments belong to the same evaluation task. Please read them in order from segment 1 to ${segmentCount}; do not answer prematurely when you see "Next data segment". After reading everything, return only one merged final JSON. Matches must cover all matches from all segments; do not return separate JSONs for each segment.\n\n${sourcePrompts.map((prompt: string, index: number) => `==================== [ Data Segment ${index + 1}/${segmentCount} Start ] ====================\n${prompt}\n==================== [ Data Segment ${index + 1}/${segmentCount} End ] ====================`).join('\n\n==================== [ Next data segment, please continue reading, do not answer ] ====================\n\n')}\n\n[All Data Segments End] Now perform a unified analysis and output only one merged JSON.`
        : sourcePrompts[0] || '';
      setExportedPrompts(deliveryPrompts);
      setExportedCombinedPrompt(combined);
      setActiveExportPromptIndex(segmentCount > 1 ? -1 : 0);
      setExportedPrompt(combined);
      setCopiedPrompt(false);
    } else {
      void handleExportPrompt(style);
    }
  };

  const handleExportPrompt = async (targetStyle?: 'standard' | 'objective') => {
    const activeStyle = targetStyle || exportPromptStyle;
    const requestedParlays = buildValidParlayRequests(parlayRequests, parlaySelected.length);
    if (mode === 'parlay_check' && (parlaySelected.length < 2 || requestedParlays.length === 0)) {
      setErrorMsg('请至少选择两场比赛，并选择至少一种串关长度和生成数量。');
      return;
    }

    setExportLoading(true);
    setErrorMsg(null);
    setExportedPrompt('');
    setCopiedPrompt(false);
    const storedSingleMatch = allMatches.find((item) => item.match === matchName);

    try {
      const resp = await fetch('/api/ai/export-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_name: matchName,
          ybty_home: ybtyHome,
          ybty_away: ybtyAway,
          minute,
          score: { home: scoreHome, away: scoreAway },
          odds_info: oddsInfo,
          mode,
          prompt_style: activeStyle,
          selected_match_refs: mode === 'parlay_check' ? parlaySelected.map((item) => ({
            match: item.match,
            ybty_home: item.ybty_home,
            ybty_away: item.ybty_away,
            score_verified: item.score_verified === true,
            score_source: item.score_source || (item.score_verified ? 'verified' : 'unverified'),
            score: item.score || null,
            minute: item.minute,
          })) : undefined,
          parlay_requests: mode === 'parlay_check' ? requestedParlays : undefined,
          batch_match_refs: mode !== 'parlay_check'
            ? (evaluationScope === 'batch'
              ? batchSelected.map((item) => ({
                  match: item.match,
                  ybty_home: item.ybty_home,
                  ybty_away: item.ybty_away,
                  score_verified: item.score_verified === true,
                  score_source: item.score_source || (item.score_verified ? 'verified' : 'unverified'),
                  score: item.score || null,
                  minute: item.minute,
                }))
              : storedSingleMatch
                ? [{
                    match: storedSingleMatch.match,
                    ybty_home: storedSingleMatch.ybty_home,
                    ybty_away: storedSingleMatch.ybty_away,
                    score_verified: storedSingleMatch.score_verified === true,
                    score_source: storedSingleMatch.score_source || (storedSingleMatch.score_verified ? 'verified' : 'unverified'),
                    score: { home: scoreHome, away: scoreAway },
                    minute,
                  }]
                : undefined)
            : undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '导出 Prompt 失败');

      setExportPromptStyle(data.prompt_style || activeStyle);
      setExportedStandardPrompts(data.standard_prompts || []);
      setExportedObjectivePrompts(data.objective_prompts || []);

      const promptSegments = Array.isArray(data.prompts) ? data.prompts : [];
      setExportedPrompts(promptSegments);
      setExportedCombinedPrompt(data.combined_prompt || promptSegments[0] || '');
      setActiveExportPromptIndex(promptSegments.length > 1 ? -1 : 0);
      // Default to one-copy delivery. Segments remain available as a fallback for
      // chat clients with unusually small input limits.
      setExportedPrompt(data.combined_prompt || promptSegments[0] || '');
      setExportInfo({
        match_count: data.match_count || 1,
        prompt_count: data.prompt_count || 1,
        instructions: data.instructions || '请复制此 Prompt 粘贴至网页版 Gemini。',
      });
      setExportModalOpen(true);
    } catch (err: any) {
      setErrorMsg(`导出 Prompt 失败: ${err.message || '未知错误'}`);
    } finally {
      setExportLoading(false);
    }
  };

  const handleCopyPrompt = () => {
    if (!exportedPrompt) return;
    navigator.clipboard.writeText(exportedPrompt);
    setCopiedPrompt(true);
    setTimeout(() => {
      setCopiedPrompt(false);
      if (activeExportPromptIndex >= 0 && exportedPrompts.length > 1 && activeExportPromptIndex < exportedPrompts.length - 1) {
        showExportPromptSegment(activeExportPromptIndex + 1);
      }
    }, 1200);
  };

  const showExportPromptSegment = (index: number) => {
    const bounded = Math.max(0, Math.min(exportedPrompts.length - 1, index));
    setActiveExportPromptIndex(bounded);
    setExportedPrompt(exportedPrompts[bounded] || '');
    setCopiedPrompt(false);
  };

  const showCombinedExportPrompt = () => {
    setActiveExportPromptIndex(-1);
    setExportedPrompt(exportedCombinedPrompt);
    setCopiedPrompt(false);
  };

  const handleImportEvaluation = async () => {
    if (!importText.trim()) {
      setImportError('请输入或粘贴网页版 Gemini 返回的 JSON 文本！');
      return;
    }
    setImportLoading(true);
    setImportError(null);
    try {
      const resp = await fetch('/api/ai/import-evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: importText, mode, expected_match_count: exportInfo?.match_count }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '解析导入失败');

      setResult(data.result);
      setImportSuccessMsg('✅ 成功导入网页版 Gemini 评估结果！已自动载入下方评估视图并保存到历史台账中。');
      setImportModalOpen(false);
      setImportText('');
      loadEvaluationHistory();
    } catch (err: any) {
      setImportError(err.message || '解析导入失败，请确认文本格式包含标准的 JSON 结构。');
    } finally {
      setImportLoading(false);
    }
  };

  const handleEvaluate = async () => {
    const requestedParlays = buildValidParlayRequests(parlayRequests, parlaySelected.length);
    if (mode === 'parlay_check' && (parlaySelected.length < 2 || requestedParlays.length === 0)) {
      setErrorMsg('请至少选择两场比赛，并选择至少一种串关长度和生成数量。');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setSavedToLedger(false);
    setSnapshotSaved(false);
    setSaveMessage(null);
    setBatchProgress(null);

    try {
      const storedSingleMatch = allMatches.find((item) => item.match === matchName);
      const evaluateChunk = async (batchRefs?: Array<{ match: string; ybty_home?: string; ybty_away?: string }>) => {
        const resp = await fetch('/api/ai/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
          match_name: matchName,
          ybty_home: ybtyHome,
          ybty_away: ybtyAway,
          minute,
          score: { home: scoreHome, away: scoreAway },
          odds_info: oddsInfo,
          mode,
          selected_match_refs: mode === 'parlay_check' ? parlaySelected.map((item) => ({
            match: item.match,
            ybty_home: item.ybty_home,
            ybty_away: item.ybty_away,
            score_verified: item.score_verified === true,
            score_source: item.score_source || (item.score_verified ? 'verified' : 'unverified'),
            score: item.score || null,
            minute: item.minute,
          })) : undefined,
          parlay_requests: mode === 'parlay_check' ? requestedParlays : undefined,
          batch_match_refs: mode !== 'parlay_check'
            ? (evaluationScope === 'batch'
              ? batchRefs
              : storedSingleMatch
                ? [{
                    match: storedSingleMatch.match,
                    ybty_home: storedSingleMatch.ybty_home,
                    ybty_away: storedSingleMatch.ybty_away,
                    score_verified: storedSingleMatch.score_verified === true,
                    score_source: storedSingleMatch.score_source || (storedSingleMatch.score_verified ? 'verified' : 'unverified'),
                    score: { home: scoreHome, away: scoreAway },
                    minute,
                  }]
                : undefined)
            : undefined,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          const missingMarkets = Array.isArray(data.missing_markets) && data.missing_markets.length > 0 ? `\n缺少完整盘口：${data.missing_markets.join('、')}` : '';
          const missingDetails = Array.isArray(data.missing_details) && data.missing_details.length > 0 ? `\n缺少比赛详情：${data.missing_details.join('、')}` : '';
          throw new Error(`${data.error || 'AI评估请求失败'}${missingMarkets}${missingDetails}${data.instructions ? `\n${data.instructions}` : ''}`);
        }
        return data as AIAnalysisResponse;
      };

      const evaluateChunkWithFallback = async (refs: Array<{ match: string; ybty_home?: string; ybty_away?: string }>): Promise<AIAnalysisResponse[]> => {
        try {
          const chunkResult = await evaluateChunk(refs);
          return Array.isArray(chunkResult.matches) ? chunkResult.matches : [chunkResult];
        } catch (error: any) {
          const message = String(error?.message || '');
          // 配额耗尽/429 时拆分无济于事（所有 Key 都被限速），直接抛错，不再递归拆分
          const isQuotaExhausted = /429|RESOURCE_EXHAUSTED|quota|额度/i.test(message)
            || message.includes('所有已配置的 AI 服务均不可用');
          // 只有 JSON 解析失败或临时 5xx 才值得拆分重试
          const canRetryWithSmallerBatch = !isQuotaExhausted && (
            message.includes('无效JSON') || /HTTP\s*(500|502|503|504)/i.test(message)
          );
          if (!canRetryWithSmallerBatch || refs.length <= 1) throw error;
          const midpoint = Math.ceil(refs.length / 2);
          setBatchProgress(`当前批次解析失败，正在自动拆分 ${refs.length} 场后重试（非配额问题）`);
          const left = await evaluateChunkWithFallback(refs.slice(0, midpoint));
          const right = await evaluateChunkWithFallback(refs.slice(midpoint));
          return [...left, ...right];
        }
      };

      if (mode !== 'parlay_check' && evaluationScope === 'batch') {
        const refs = batchSelected.map((item) => ({ match: item.match, ybty_home: item.ybty_home, ybty_away: item.ybty_away }));
        if (Number(batchChunkSize) === 0) {
          setBatchProgress(`已全量提交 ${refs.length} 场比赛，由服务端智能并发分批深挖中...`);
          const fullMatches = await evaluateChunkWithFallback(refs);
          setResult({
            summary: `已完成全量 ${fullMatches.length} 场比赛的智能并发评估。`,
            grade: fullMatches.some((item) => item.grade === 'A') ? 'A' : fullMatches.some((item) => item.grade === 'B') ? 'B' : 'C',
            recommendation: null,
            score_verified: fullMatches.every((item) => item.score_verified === true),
            score_source: 'batched_server_hydration',
            verification_passed: fullMatches.every((item) => item.verification_passed === true),
            evidence: [`全量一次性提交给服务端，由服务端切片驱动 Gemini 并行 Worker 评估。`],
            risks: fullMatches.flatMap((item) => item.risks || []),
            matches: fullMatches,
          });
        } else {
          const chunkSize = Math.max(1, Math.min(5, Number(batchChunkSize) || 1));
          const chunks = Array.from({ length: Math.ceil(refs.length / chunkSize) }, (_, index) => refs.slice(index * chunkSize, (index + 1) * chunkSize));
          setBatchProgress(`正在并行处理 ${chunks.length} 组请求（每组 ${chunkSize} 场）...`);
          const chunkMatchesResults = await Promise.all(chunks.map((chunk) => evaluateChunkWithFallback(chunk)));
          const mergedMatches = chunkMatchesResults.flat();
          setResult({
            summary: `已分 ${chunks.length} 组并行完成 ${mergedMatches.length} 场评估。`,
            grade: mergedMatches.some((item) => item.grade === 'A') ? 'A' : mergedMatches.some((item) => item.grade === 'B') ? 'B' : 'C',
            recommendation: null,
            score_verified: mergedMatches.every((item) => item.score_verified === true),
            score_source: 'batched_server_hydration',
            verification_passed: mergedMatches.every((item) => item.verification_passed === true),
            evidence: [`已分 ${chunks.length} 组并行完成评估。`],
            risks: mergedMatches.flatMap((item) => item.risks || []),
            matches: mergedMatches,
          });
        }
      } else {
        setResult(await evaluateChunk());
      }
    } catch (err: any) {
      setErrorMsg(err.message || '评估失败');
    } finally {
      setLoading(false);
      setBatchProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info Banner */}
      <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 border border-emerald-800/40 rounded-xl p-5 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              AI 智能评估与串关硬性风控引擎
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              严格根据《CUSTOM_INSTRUCTIONS_COMPLETE.md》足球分析协议执行基本面、比分校验、团队轮换与串关暴露风控。
            </p>
          </div>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-3 gap-3 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 text-xs">
        <button
          onClick={() => setMode('live_eval')}
          className={`py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
            mode === 'live_eval'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> 滚球单场评估
        </button>

        <button
          onClick={() => setMode('prematch_eval')}
          className={`py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
            mode === 'prematch_eval'
              ? 'bg-sky-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" /> 赛前基本面深挖
        </button>

        <button
          onClick={() => setMode('parlay_check')}
          className={`py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
            mode === 'parlay_check'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> 串关风控核对
        </button>
      </div>

      {/* Mode Forms */}
      {mode === 'parlay_check' ? (
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" /> 选择比赛（已选 {parlaySelected.length}/{parlayEligibleMatches.length} 场）
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => setParlaySelected(parlayEligibleMatches)} className="text-emerald-400 hover:text-emerald-300">全选</button>
              <button onClick={() => setParlaySelected([])} className="text-rose-400 hover:text-rose-300">取消全部</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
            {parlayEligibleMatches.map((m, idx) => {
              const isSelected = parlaySelected.some((p) => p.match === m.match);
              return (
                <div
                  key={`${m.match}|${idx}`}
                  onClick={() => toggleParlayMatch(m)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-indigo-950/60 border-indigo-500 text-slate-100 shadow'
                      : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {(() => {
                    const teams = getTeamDisplay(m);
                    return (
                      <>
                        <div className="flex items-center justify-between font-semibold">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-0.5">
                              <Trophy className="w-3 h-3 text-purple-400 shrink-0" />
                              {getLeagueName(m)}
                            </span>
                            <span className="text-slate-100">{teams.homeYbty} vs {teams.awayYbty}</span>
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                            {m.grade || 'C'}级
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-purple-300 mt-0.5">
                          {teams.homeLeisu} vs {teams.awayLeisu}
                        </div>
                      </>
                    );
                  })()}
                  <div className="mt-1 text-[11px] text-slate-500 flex justify-between">
                    <span>分钟: {m.minute ? `${m.minute}'` : '赛前'}</span>
                    <span>比分: {m.score ? `${m.score.home}-${m.score.away}` : '0-0'}</span>
                  </div>
                  <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-500">选择比赛即可；具体玩法由系统从该场全部真实盘口中筛选。</div>
                </div>
              );
            })}
            {parlayEligibleMatches.length === 0 && (
              <div className="md:col-span-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-center text-xs text-amber-300">
                当前系统没有可供选择的比赛。
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              onClick={() => setParlayConfigOpen(true)}
              disabled={loading || parlaySelected.length < 2}
              className="py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              下一步：选择串关规格
            </button>

            <button
              onClick={() => setParlayConfigOpen(true)}
              disabled={exportLoading || parlaySelected.length < 2}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-md"
            >
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <FileText className="w-4 h-4 text-amber-400" />}
              📋 导出串关 Prompt (网页版)
            </button>

            <button
              onClick={() => { setImportModalOpen(true); setImportError(null); }}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 border border-sky-500/40 text-sky-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md"
            >
              <Upload className="w-4 h-4 text-sky-400" />
              📥 导入网页版 Gemini 评估
            </button>
          </div>

          {parlayConfigOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setParlayConfigOpen(false)}>
              <div className="w-full max-w-lg rounded-xl border border-indigo-500/40 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <h3 className="text-base font-bold text-white">选择串关长度和推荐组数</h3>
                <p className="mt-1 text-xs text-slate-400">可多选。系统会在已选 {parlaySelected.length} 场比赛的全部玩法中，优先选择胜率较高且赔率合理的方向。</p>
                <div className="mt-4 space-y-2">
                  {[10, 9, 8, 7, 6, 5, 4, 3, 2].filter((size) => size <= parlaySelected.length).map((size) => {
                    const enabled = Number(parlayRequests[size] || 0) > 0;
                    return (
                      <div key={size} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
                        <label className="flex items-center gap-2 text-slate-200">
                          <input type="checkbox" checked={enabled} onChange={(event) => setParlayRequests((current) => ({ ...current, [size]: event.target.checked ? Math.max(1, current[size] || 1) : 0 }))} />
                          {size} 串 1
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                          推荐
                          <input type="number" min={1} max={10} disabled={!enabled} value={enabled ? parlayRequests[size] : 1} onChange={(event) => setParlayRequests((current) => ({ ...current, [size]: Math.max(1, Math.min(10, Number(event.target.value) || 1)) }))} className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-center text-white disabled:opacity-40" />
                          组
                        </label>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button onClick={() => setParlayConfigOpen(false)} className="rounded bg-slate-800 px-4 py-2 text-xs text-slate-300">取消</button>
                  <button
                    onClick={() => { setParlayConfigOpen(false); void handleExportPrompt(); }}
                    disabled={buildValidParlayRequests(parlayRequests, parlaySelected.length).length === 0}
                    className="rounded bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40 flex items-center gap-1"
                  >
                    📋 导出 Prompt (网页版)
                  </button>
                  <button onClick={() => { setParlayConfigOpen(false); void handleEvaluate(); }} disabled={buildValidParlayRequests(parlayRequests, parlaySelected.length).length === 0} className="rounded bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40 flex items-center gap-1">
                    ⚡ API 直连评估
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs">
            <div className="flex items-center gap-2">
              <button onClick={() => setEvaluationScope('batch')} className={`rounded px-3 py-1.5 font-bold ${evaluationScope === 'batch' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>批量评估</button>
              <button onClick={() => setEvaluationScope('single')} className={`rounded px-3 py-1.5 font-bold ${evaluationScope === 'single' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}`}>单场评估</button>
            </div>
            {evaluationScope === 'batch' && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-300">已选 {batchSelected.length}/{evaluationMatches.length} 场</span>
                <button onClick={() => setBatchSelected(evaluationMatches)} className="text-emerald-400">全选</button>
                <button onClick={() => setBatchSelected([])} className="text-slate-400">清空</button>
                <label className="ml-2 flex items-center gap-1.5 text-slate-300">
                  提交模式
                  <select
                    value={batchChunkSize}
                    onChange={(event) => setBatchChunkSize(Number(event.target.value))}
                    disabled={loading}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    <option value={0}>全量一次性提交（推荐：服务端智能并发）</option>
                    <option value={2}>前端分批：2 场/批</option>
                    <option value={3}>前端分批：3 场/批</option>
                    <option value={5}>前端分批：5 场/批</option>
                  </select>
                </label>
              </div>
            )}
          </div>
          {evaluationScope === 'batch' && (
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
              {evaluationMatches.map((item, index) => {
                const checked = batchSelected.some((selected) => selected.match === item.match);
                const teams = getTeamDisplay(item);
                return (
                  <label key={`${item.match}-${index}`} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs ${checked ? 'border-emerald-600/60 bg-emerald-950/30' : 'border-slate-800 bg-slate-950/60'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleBatchMatch(item)} className="mt-0.5" />
                    <span><strong className="text-slate-100">{teams.homeYbty} vs {teams.awayYbty}</strong><span className="mt-1 block text-slate-500">{getLeagueName(item)} · {item.minute ? `${item.minute}' ${item.score?.home ?? 0}-${item.score?.away ?? 0}` : '赛前'}</span></span>
                  </label>
                );
              })}
            </div>
          )}
          <div className={evaluationScope === 'batch' ? 'hidden' : 'contents'}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-200">待评估单场数据</h3>
            
            {/* Quick Match Selector Dropdown */}
            {evaluationMatches.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">⚡ 快速载入赛事:</span>
                <select
                  onChange={(e) => {
                    const found = evaluationMatches.find((m) => m.match === e.target.value);
                    if (found) populateFromMatch(found);
                  }}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 max-w-xs"
                >
                  <option value="">-- 选择实时/赛前比赛 --</option>
                  {evaluationMatches.map((m, idx) => {
                    const t = getTeamDisplay(m);
                    return (
                      <option key={m.match + idx} value={m.match}>
                        [{getLeagueName(m)}] [{m.grade || 'C'}级] {t.homeYbty} vs {t.awayYbty} ({m.minute ? `${m.minute}'` : '赛前'})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">YBTY 原始主队名称</label>
              <input
                type="text"
                value={ybtyHome}
                onChange={(e) => setYbtyHome(e.target.value)}
                placeholder="例如: 蔚山市民"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">YBTY 原始客队名称</label>
              <input
                type="text"
                value={ybtyAway}
                onChange={(e) => setYbtyAway(e.target.value)}
                placeholder="例如: 蔚山HD"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {mode === 'live_eval' && (
              <>
                <div>
                  <label className="block text-slate-400 mb-1">比赛分钟</label>
                  <input
                    type="number"
                    value={isNaN(minute) ? '' : minute}
                    onChange={(e) => setMinute(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">当前比分 (主队 - 客队)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={isNaN(scoreHome) ? '' : scoreHome}
                      onChange={(e) => setScoreHome(e.target.value === '' ? 0 : Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="self-center font-bold text-slate-400">-</span>
                    <input
                      type="number"
                      value={isNaN(scoreAway) ? '' : scoreAway}
                      onChange={(e) => setScoreAway(e.target.value === '' ? 0 : Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="col-span-2">
              <label className="block text-slate-400 mb-1">盘口、赔率与初盘至即时盘变动</label>
              <input
                type="text"
                value={oddsInfo}
                onChange={(e) => setOddsInfo(e.target.value)}
                placeholder="例如: 全场小球 2.0 @ 1.84 | 初盘 2.5 降至 2.0"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2">
            <button
              onClick={handleEvaluate}
              disabled={loading || (evaluationScope === 'batch' ? batchSelected.length === 0 : (!ybtyHome || !ybtyAway))}
              className="py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {evaluationScope === 'batch' ? `API 评估 (${batchSelected.length} 场)` : 'API 单场评估'}
            </button>

            <button
              onClick={() => void handleExportPrompt()}
              disabled={exportLoading || (evaluationScope === 'batch' ? batchSelected.length === 0 : (!ybtyHome || !ybtyAway))}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-md"
            >
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <FileText className="w-4 h-4 text-amber-400" />}
              📋 导出 Prompt (网页版)
            </button>

            <button
              onClick={() => { setImportModalOpen(true); setImportError(null); }}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 border border-sky-500/40 text-sky-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md"
            >
              <Upload className="w-4 h-4 text-sky-400" />
              📥 导入网页版 Gemini 评估
            </button>
          </div>

          {batchProgress && <div className="text-center text-xs font-semibold text-sky-300">{batchProgress}</div>}
        </div>
      )}

      {/* Export Prompt Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setExportModalOpen(false)}>
          <div className="w-full max-w-3xl rounded-2xl border border-amber-500/40 bg-slate-950 p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-amber-300 flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                导出 Prompt（无需 API Key 额度，供网页版 Gemini 使用）
              </h3>
              <button onClick={() => setExportModalOpen(false)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            {/* Prompt Mode Switcher Tabs */}
            {mode === 'parlay_check' ? (
              <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-3.5 text-xs text-indigo-200/90 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-indigo-300">
                  <Layers className="w-4 h-4 shrink-0 text-indigo-400" /> 🏆 职业辛迪加多规格串关与反脆弱风控模式：
                </div>
                <p>1. <strong>全盘口动态协同</strong>：覆盖 {exportInfo?.match_count || 1} 场比赛的 5 大真实盘口（verified_ybty_markets），结合技术统计与初评参考挑选具备正期望值 (+EV) 的最优组合。</p>
                <p>2. <strong>反脆弱与独立性审查</strong>：强制计算联合胜率、整单 EV、1/4 凯利注码及剧本独立性评分，严防同质化爆仓风险。</p>
                <p>3. <strong>一键导入与台账归档</strong>：复制下方 Prompt 粘贴至 Gemini 网页版，获取结果后在主界面直接一键解析并导入系统台账。</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => switchExportPromptStyle('standard')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      exportPromptStyle === 'standard'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <span>🎯 标准操盘手模式（原网页版）</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchExportPromptStyle('objective')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      exportPromptStyle === 'objective'
                        ? 'bg-sky-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <span>⚡ 客观纯量化模式（无主观策略 · 5大硬性盘口）</span>
                  </button>
                </div>

                {exportPromptStyle === 'objective' ? (
                  <div className="bg-sky-950/40 border border-sky-800/50 rounded-xl p-3.5 text-xs text-sky-200/90 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-sky-300">
                      <Sparkles className="w-4 h-4 shrink-0 text-sky-400" /> 客观纯量化模式规范：
                    </div>
                    <p>1. <strong>无主观偏见</strong>：剔除所有策略引导与主观倾向，纯粹按真实数据与数学期望值评估。</p>
                    <p>2. <strong>5大强制实战盘口</strong>：强制覆盖全场/半场大小球、全场/半场让球、全场独赢1X2，原样复制 option_id。</p>
                    <p>3. <strong>最佳主选提炼 & 门禁</strong>：单场提炼1项A/B级最优，未核验比分强制降级为 NO_BET / avoid，且必须输出完整 {exportInfo?.match_count || 1} 场 JSON。</p>
                  </div>
                ) : (
                  <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3.5 text-xs text-amber-200/90 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-amber-300">
                      <Info className="w-4 h-4 shrink-0" /> 标准模式使用说明：
                    </div>
                    <p>1. 点击下方【一键复制 Prompt】（已包含 {exportInfo?.match_count || 1} 场比赛盘口、职业操盘手策略与完整分析规则）。</p>
                    <p>2. 打开 <a href="https://gemini.google.com" target="_blank" rel="noreferrer" className="underline text-sky-400 hover:text-sky-300 font-bold inline-flex items-center gap-0.5">Google Gemini 网页版 <ExternalLink className="w-3 h-3" /></a> 并粘贴发送给 Gemini。</p>
                    <p>3. 复制 Gemini 网页版返回的输出，点击主界面【导入网页版 Gemini 评估】按钮粘贴导入！</p>
                  </div>
                )}
              </>
            )}

            <div className="flex-1 min-h-[280px] relative">
              <textarea
                readOnly
                value={exportedPrompt}
                className="w-full h-full min-h-[280px] bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono p-3.5 rounded-xl focus:outline-none focus:border-amber-500/50 resize-none selection:bg-amber-500/30"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                {activeExportPromptIndex < 0 ? `一次复制全部 ${exportInfo?.match_count || 1} 场 (${exportPromptStyle === 'objective' ? '客观纯量化' : '标准模式'})` : exportInfo?.prompt_count && exportInfo.prompt_count > 1 ? `备用分段：当前第 ${activeExportPromptIndex + 1}/${exportInfo.prompt_count} 段` : `全量 Prompt 数据已就绪 (${exportPromptStyle === 'objective' ? '客观纯量化' : '标准模式'})`}
              </span>
              <div className="flex gap-2">
                {exportedPrompts.length > 1 && activeExportPromptIndex >= 0 && <button onClick={showCombinedExportPrompt} className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs">一次复制全部</button>}
                {exportedPrompts.length > 1 && activeExportPromptIndex < 0 && <button onClick={() => showExportPromptSegment(0)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs">改用分段备用</button>}
                {exportedPrompts.length > 1 && activeExportPromptIndex >= 0 && <button disabled={activeExportPromptIndex === 0} onClick={() => showExportPromptSegment(activeExportPromptIndex - 1)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs disabled:opacity-40">上一段</button>}
                {exportedPrompts.length > 1 && activeExportPromptIndex >= 0 && <button disabled={activeExportPromptIndex >= exportedPrompts.length - 1} onClick={() => showExportPromptSegment(activeExportPromptIndex + 1)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs disabled:opacity-40">下一段</button>}
                <button onClick={() => setExportModalOpen(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700">
                  关闭
                </button>
                <button onClick={handleCopyPrompt} className={`px-5 py-2 rounded-lg text-white text-xs font-bold flex items-center gap-1.5 shadow-lg ${exportPromptStyle === 'objective' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
                  {copiedPrompt ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  {copiedPrompt ? '✅ 已复制！' : activeExportPromptIndex < 0 ? '一键复制全部 Prompt' : exportedPrompts.length > 1 ? `复制第 ${activeExportPromptIndex + 1} 段` : '一键复制 Prompt'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Evaluation Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setImportModalOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-sky-500/40 bg-slate-950 p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-sky-300 flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-400" />
                导入网页版 Gemini 评估结果
              </h3>
              <button onClick={() => setImportModalOpen(false)} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-300">
              请将网页版 Gemini 返回的完整回答粘贴至下方框内，系统会自动解析 JSON 并自动执行规则校验与防套利过滤：
            </p>

            <div className="flex-1 min-h-[220px]">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="在此粘贴网页版 Gemini 输出的 JSON 内容..."
                className="w-full h-full min-h-[220px] bg-slate-900 border border-slate-800 text-slate-100 text-xs font-mono p-3.5 rounded-xl focus:outline-none focus:border-sky-500 resize-none"
              />
            </div>

            {importError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setImportModalOpen(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700">
                取消
              </button>
              <button
                onClick={handleImportEvaluation}
                disabled={importLoading || !importText.trim()}
                className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg"
              >
                {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                解析并导入系统
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {importSuccessMsg && (
        <div className="p-4 bg-emerald-950/50 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{importSuccessMsg}</span>
          </div>
          <button onClick={() => setImportSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 font-bold">✕</button>
        </div>
      )}

      {/* Error Output */}
      {errorMsg && (
        <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="whitespace-pre-line">{errorMsg}</span>
        </div>
      )}

      {/* AI Output Result */}
      {result && (
        <div className="bg-slate-900/90 border border-emerald-800/40 p-5 rounded-xl space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-800/50 bg-sky-950/20 p-3">
            <div className="text-xs text-slate-300">
              完整评估快照保存所有比赛、全部玩法、概率、依据和风险；不会自动算作正式推荐。
            </div>
            <button
              onClick={handleSaveEvaluationSnapshot}
              disabled={snapshotSaved}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${snapshotSaved ? 'border border-sky-700 bg-sky-950 text-sky-300' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
            >
              {snapshotSaved ? '完整评估已保存' : '保存完整评估快照'}
            </button>
            <button onClick={() => void handleSaveAllAiBettingAdvice()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">
              保存全部AI投注建议到台账
            </button>
          </div>
          {saveMessage && (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
              {saveMessage}
            </div>
          )}
          {Array.isArray(result.matches) && result.matches.length > 0 && (
            <div className="space-y-4">
              <div className="text-sm font-bold text-emerald-300">批量评估完成：{result.matches.length} 场</div>
              {result.matches.map((matchResult, matchIndex) => (
                <div key={`${matchResult.match}-${matchIndex}`} className="rounded-xl border border-slate-700 bg-slate-950/70 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <strong className="text-sm text-slate-100">{matchResult.match || `${matchResult.ybty_home} vs ${matchResult.ybty_away}`}</strong>
                      {matchResult.score != null && (
                        <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-300 font-mono font-bold text-xs">
                          {scoreDisplay(matchResult.score)}
                        </span>
                      )}
                      {matchResult.minute !== undefined && Number(matchResult.minute) > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                          {matchResult.minute}'
                        </span>
                      )}
                    </div>
                    <span className={`rounded px-2.5 py-1 text-xs font-bold ${matchResult.grade === 'A' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : matchResult.grade === 'B' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>{matchResult.grade}级</span>
                  </div>

                  {/* Match Live Statistics Badges (黄牌, 红牌, 角球, 射门/射正) */}
                  {(() => {
                    const stats = extractMatchLiveStats(matchResult);
                    return (
                      <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-900/80 border border-slate-800 rounded-lg p-2">
                        <span className="text-slate-400 font-semibold flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-indigo-400" /> 现场实况统计:
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200 flex items-center gap-1 font-mono">
                          <span>🚩 角球</span>
                          <strong className="text-sky-300">{stats.corners.text}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-amber-800/60 text-slate-200 flex items-center gap-1 font-mono">
                          <span>🟨 黄牌</span>
                          <strong className="text-amber-300">{stats.yellowCards.text}</strong>
                        </span>
                        <span className={`px-2 py-0.5 rounded border flex items-center gap-1 font-mono ${
                          stats.redCards.hasRed 
                            ? 'bg-rose-950 border-rose-600 text-rose-200 font-bold animate-pulse' 
                            : 'bg-slate-950 border-slate-700 text-slate-200'
                        }`}>
                          <span>🟥 红牌</span>
                          <strong className={stats.redCards.hasRed ? 'text-rose-300' : 'text-slate-300'}>{stats.redCards.text}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200 flex items-center gap-1 font-mono">
                          <span>🎯 射门/射正</span>
                          <strong className="text-emerald-300">{stats.shotsCombined.text}</strong>
                        </span>
                        {stats.isPrematch && (
                          <span className="text-[11px] text-slate-500 font-normal">
                            (赛前赛事，实况数据随开赛实时采集)
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Pro Trader Strategy & Action Guide Banner */}
                  {matchResult.pro_strategy_guide && (
                    <div className="rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-indigo-950/30 p-3 text-xs space-y-1">
                      <div className="flex items-center gap-2 text-indigo-300 font-bold">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>🎯 专业操盘策略：{matchResult.pro_strategy_guide.strategy_name}</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed font-medium">
                        👉 操盘路径：{matchResult.pro_strategy_guide.action_path}
                      </p>
                      {matchResult.pro_strategy_guide.trigger_conditions && (
                        <div className="text-[11px] text-slate-400">
                          ⚡ 关键触发/止损信号：{matchResult.pro_strategy_guide.trigger_conditions}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bankroll Sizing & Risk Management Banner */}
                  {matchResult.bankroll_guidance && matchResult.bankroll_guidance.stake_sizing_tier !== 'NO_STAKE' && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-emerald-300 font-bold">
                        <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                        <span>💰 建议仓位配比：{matchResult.bankroll_guidance.recommended_stake_pct}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{matchResult.bankroll_guidance.guidance_text}</span>
                    </div>
                  )}

                  <p className="text-xs text-slate-300">{displayText(matchResult.summary, '未提供总结')}</p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {(matchResult.market_assessments || []).map((market, marketIndex) => (
                      <div key={`${market.category}-${marketIndex}`} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2"><strong className="text-slate-200">{market.category}</strong><span className={market.status === 'recommend' ? 'text-emerald-400 font-bold' : market.status === 'watch' || market.status === 'prediction' ? 'text-sky-400' : 'text-amber-400'}>{market.status === 'recommend' ? '🔥 推荐' : market.status === 'watch' ? '观察' : market.status === 'prediction' ? '模型预测' : market.status === 'unavailable' ? '数据不足' : '不建议'}</span></div>
                        <div className="mt-2 font-semibold text-emerald-300">
                          {(() => {
                            let dir = String(market.direction || '--').trim();
                            let line = market.line != null && market.line !== '' && market.line !== 'null' ? String(market.line).trim() : '';
                            if (line && dir.includes(line)) {
                              return `${dir} ${market.odds ? `@${market.odds}` : ''}`.trim();
                            }
                            return `${dir} ${line} ${market.odds ? `@${market.odds}` : ''}`.replace(/\s+/g, ' ').trim();
                          })()}
                        </div>
                        <div className="mt-1 text-slate-400">概率：{market.probability ?? '--'}%{market.status === 'prediction' ? ' · 预测项（非投注评级）' : ` · 等级：${market.grade}`}{market.value_edge !== null && market.value_edge !== undefined ? ` · 价值差：${market.value_edge > 0 ? '+' : ''}${market.value_edge}%` : ''}</div>
                        {market.probability_scope && <div className="mt-1 text-[10px] text-slate-500">概率对象：{market.probability_scope}</div>}
                        {market.pro_trader_tip && <div className="mt-1 text-[11px] text-indigo-300 font-medium">💡 操盘时机：{market.pro_trader_tip}</div>}
                        {Array.isArray(market.alternatives) && market.alternatives.length > 0 && (
                          <div className="mt-1 text-[10px] text-slate-500">备选：{market.alternatives.map((item) => `${item.direction} ${item.probability}%`).join('；')}</div>
                        )}
                        <p className="mt-2 text-slate-500">{market.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!Array.isArray(result.matches) && (
          <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-lg text-xs font-bold ${
                  result.grade === 'A'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : result.grade === 'B'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                推荐等级: {result.grade} 级
              </span>

              {result.score_verified ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-800/50">
                  <ShieldCheck className="w-3.5 h-3.5" /> 比分来源已核验 ({result.score_source || 'ybty'})
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-950/60 px-2.5 py-1 rounded border border-amber-800/50">
                  <AlertTriangle className="w-3.5 h-3.5" /> 比分未经核验 (降为C级)
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {result.recommendation && (
                <div className="text-right text-xs">
                  <span className="text-slate-400">建议玩法: </span>
                  <span className="font-bold text-emerald-400">
                    {result.recommendation.market} ({result.recommendation.line}) @ {result.recommendation.odds}
                  </span>
                </div>
              )}

              <button
                onClick={handlePromoteCurrentToLedger}
                disabled={savedToLedger}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow transition-all ${
                  savedToLedger
                    ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {savedToLedger ? '已提报至正式台账' : '📥 写入正式推荐台账'}
              </button>
            </div>
          </div>

          {/* Pro Trader Strategy & Action Path (Single Match) */}
          {result.pro_strategy_guide && (
            <div className="rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-indigo-950/30 p-3.5 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-indigo-300 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>🎯 职业操盘策略：{result.pro_strategy_guide.strategy_name}</span>
              </div>
              <p className="text-slate-200 leading-relaxed font-medium">
                👉 操盘路径：{result.pro_strategy_guide.action_path}
              </p>
              {result.pro_strategy_guide.trigger_conditions && (
                <div className="text-[11px] text-slate-400">
                  ⚡ 关键触发/止损信号：{result.pro_strategy_guide.trigger_conditions}
                </div>
              )}
            </div>
          )}

          {/* Bankroll Sizing & Risk Management (Single Match) */}
          {result.bankroll_guidance && result.bankroll_guidance.stake_sizing_tier !== 'NO_STAKE' && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <span>💰 建议仓位配比：{result.bankroll_guidance.recommended_stake_pct}</span>
              </div>
              <span className="text-[11px] text-slate-400">{result.bankroll_guidance.guidance_text}</span>
            </div>
          )}

          <div className="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
            <ReactMarkdown>{displayText(result.summary, '未提供总结')}</ReactMarkdown>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {result.evidence && result.evidence.length > 0 && (
              <div className="bg-emerald-950/20 border border-emerald-800/30 p-3 rounded-lg">
                <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 逻辑与依据 (Evidence)
                </div>
                <ul className="list-disc list-inside text-slate-300 space-y-1">
                  {result.evidence.map((e, i) => (
                    <li key={i}>{displayText(e, '未提供内容')}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.risks && result.risks.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-800/30 p-3 rounded-lg">
                <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> 拦截与风险 (Risks)
                </div>
                <ul className="list-disc list-inside text-slate-300 space-y-1">
                  {result.risks.map((r, i) => (
                    <li key={i}>{displayText(r, '未提供内容')}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {result.parlay_safety_check && (
            <div className="bg-indigo-950/30 border border-indigo-800/40 p-3 rounded-lg text-xs space-y-2">
              <div className="font-semibold text-indigo-300 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> 串关安全与风控判定 (Parlay Safety)
              </div>
              <div className="text-slate-300">
                {result.parlay_safety_check.is_valid_parlay ? (
                  <span className="text-emerald-400 font-bold">✅ 符合串关独立性风控标准</span>
                ) : (
                  <span className="text-amber-400 font-bold">⚠️ 不符合串关标准 (被硬性拦截)</span>
                )}
                <ul className="list-disc list-inside mt-1 text-slate-400 space-y-0.5">
                  {result.parlay_safety_check.reasons?.map((res, idx) => (
                    <li key={idx}>{displayText(res, '未提供原因')}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Generated multi-spec parlay recommendations */}
          {mode === 'parlay_check' && Array.isArray(result.parlay_recommendations) && result.parlay_recommendations.length > 0 && (
            <div className="bg-gradient-to-r from-slate-950 via-indigo-950/40 to-slate-950 border border-indigo-500/40 p-4 rounded-xl space-y-3">
              <div className="border-b border-slate-800 pb-2.5 text-sm font-bold text-indigo-200">已生成 {result.parlay_recommendations.length} 组串关</div>
              <div className="space-y-3">
                {result.parlay_recommendations.map((ticket) => (
                  <div key={`${ticket.size}-${ticket.ticket_index}`} className="rounded-lg border border-slate-700 bg-slate-900/90 p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-800 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-indigo-300">{ticket.size} 串 1 · 第 {ticket.ticket_index} 组</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ticket.grade === 'A' ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300' : 'bg-sky-950/80 border border-sky-700 text-sky-300'}`}>{ticket.grade}级组合</span>
                        {ticket.sharpe_assessment && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-700 text-indigo-300 text-[10px] font-bold">
                            {ticket.sharpe_assessment === 'HIGH_EDGE_CORE' ? '💎 核心价值组合' : ticket.sharpe_assessment === 'BALANCED_GROWTH' ? '📈 稳健增长组合' : '🎯 价值博弈单'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">总赔率 @{Number(ticket.estimated_total_odds).toFixed(2)}</span>
                        <button
                          onClick={() => void handleSaveParlayTicket(ticket)}
                          disabled={savedParlayTickets.has(`${ticket.size}-${ticket.ticket_index}`) || (ticket as any).verification_passed !== true}
                          className="rounded bg-emerald-600 px-2.5 py-1 font-bold text-white hover:bg-emerald-500 disabled:bg-emerald-950 disabled:text-emerald-400 text-xs"
                        >
                          {savedParlayTickets.has(`${ticket.size}-${ticket.ticket_index}`) ? '已保存到投注台账' : '保存此串关'}
                        </button>
                      </div>
                    </div>

                    {/* Quantitative Edge & Kelly Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/80 border border-slate-800 rounded p-2 text-xs">
                      <div>
                        <div className="text-[10px] text-slate-500">联合理论胜率</div>
                        <div className="font-mono font-bold text-sky-300">{ticket.joint_probability ?? '--'}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">整单价值边际 (EV)</div>
                        <div className={`font-mono font-bold ${(ticket.combined_ev_pct ?? 0) > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {(ticket.combined_ev_pct ?? 0) > 0 ? `+${ticket.combined_ev_pct}%` : `${ticket.combined_ev_pct ?? '--'}%`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">1/4 凯利建议注码</div>
                        <div className="font-mono font-bold text-indigo-300">{ticket.kelly_fraction_pct ? `${ticket.kelly_fraction_pct}%` : (ticket.bankroll_guidance?.recommended_stake_pct || '0.8%')}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">反脆弱独立性</div>
                        <div className="font-mono font-bold text-emerald-400 flex items-center gap-1">
                          <span>{ticket.correlation_audit?.independence_score ?? 90}/100</span>
                          <span className="text-[10px] text-emerald-500 font-normal">({ticket.correlation_audit?.correlation_risk_check === 'passed' ? '已过审' : '提醒'})</span>
                        </div>
                      </div>
                    </div>

                    {/* Legs Grid */}
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {ticket.legs.map((leg, index) => {
                        const mName = formatMarketName(leg.market);
                        const lText = formatLineText(leg.market, leg.line, leg.ybty_home, leg.ybty_away);
                        const matchItem = allMatches.find(
                          (m) =>
                            m.match === leg.match ||
                            (m.ybty_home && leg.ybty_home && m.ybty_home === leg.ybty_home && m.ybty_away === leg.ybty_away) ||
                            (m.match && leg.match && (m.match.includes(leg.match) || leg.match.includes(m.match))) ||
                            (m.ybty_home && leg.ybty_home && (m.ybty_home.includes(leg.ybty_home) || leg.ybty_home.includes(m.ybty_home)))
                        );
                        return (
                          <div
                            key={`${leg.match}-${index}`}
                            onMouseEnter={(e) => {
                              if (hoverTimeoutRef.current) {
                                clearTimeout(hoverTimeoutRef.current);
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredLeg({
                                leg,
                                matchItem,
                                ticket,
                                legIndex: index + 1,
                                anchorRect: {
                                  top: rect.top,
                                  left: rect.left,
                                  right: rect.right,
                                  bottom: rect.bottom,
                                  width: rect.width,
                                  height: rect.height,
                                },
                              });
                            }}
                            onMouseLeave={() => {
                              hoverTimeoutRef.current = setTimeout(() => {
                                setHoveredLeg(null);
                              }, 120);
                            }}
                            className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-xs space-y-1.5 flex flex-col justify-between hover:border-indigo-500/80 hover:bg-slate-900/90 transition-all cursor-pointer group/leg shadow-sm"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-1 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-0.5" title="赛事联赛名称">
                                    <Trophy className="w-3 h-3 text-purple-400 shrink-0" />
                                    {getLeagueName(matchItem || leg)}
                                  </span>
                                  <span className="font-bold text-slate-200">腿 #{index + 1} · {leg.ybty_home || leg.match} vs {leg.ybty_away || ''}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  {leg.score != null && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/50 text-amber-300 font-mono font-bold text-[10px]">
                                      {scoreDisplay(leg.score)}
                                    </span>
                                  )}
                                  {leg.minute !== undefined && Number(leg.minute) > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">
                                      {leg.minute}'
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-emerald-300 font-semibold">{mName} {lText} <span className="text-amber-300 font-mono font-bold">@{leg.odds}</span></div>
                              <div className="text-slate-400 text-[11px]">AI研判胜率 {leg.probability}% · <span className={leg.grade === 'A' ? 'text-emerald-400 font-bold' : leg.grade === 'B' ? 'text-sky-400 font-bold' : 'text-amber-400'}>{leg.grade}级</span></div>
                              
                              {/* Compact Live Match Statistics (控球率, 危险进攻, 角球, 射门/射正, 黄牌, 红牌) */}
                              {(() => {
                                const legStats = extractMatchLiveStats(matchItem, leg);
                                return (
                                  <div className="flex flex-wrap items-center gap-2 text-[10px] bg-slate-900/90 rounded px-2 py-1 border border-slate-800/80 text-slate-300 font-mono">
                                    <span className="text-amber-300" title="控球率 (主-客)">⏱️ {legStats.possession.text}</span>
                                    <span className="text-rose-300" title="危险进攻 (主-客)">⚡ {legStats.dangerousAttacks.text}</span>
                                    <span className="text-sky-300" title="角球 (主-客)">🚩 {legStats.corners.text}</span>
                                    <span className="text-emerald-300" title="射门(射正) (主-客)">🎯 {legStats.shotsCombined.text}</span>
                                    <span className="text-amber-400" title="黄牌 (主-客)">🟨 {legStats.yellowCards.text}</span>
                                    <span className={legStats.redCards.hasRed ? 'text-rose-400 font-bold' : 'text-slate-400'} title="红牌 (主-客)">🟥 {legStats.redCards.text}</span>
                                  </div>
                                );
                              })()}

                              {leg.pro_strategy && (
                                <div className="text-[10px] text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 rounded px-1.5 py-0.5 mt-1">
                                  🎯 操盘思维：{leg.pro_strategy}
                                </div>
                              )}
                            </div>

                            {/* Hover Indicator Strip */}
                            <div className="mt-2 flex items-center justify-between gap-1.5 rounded-md bg-indigo-950/60 group-hover/leg:bg-indigo-900/80 border border-indigo-800/40 group-hover/leg:border-indigo-600/70 px-2.5 py-1.5 text-xs text-indigo-300 group-hover/leg:text-indigo-100 transition-all">
                              <span className="flex items-center gap-1.5 font-medium">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400 group-hover/leg:text-indigo-300" />
                                <span>机选核心5项 vs AI核心5项</span>
                              </span>
                              <span className="text-[10px] text-indigo-400 group-hover/leg:text-indigo-200 bg-indigo-900/60 px-1.5 py-0.5 rounded font-mono">
                                鼠标悬停浮出
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Correlation & Synergy Audit */}
                    {ticket.correlation_audit && (
                      <div className="rounded border border-indigo-900/40 bg-indigo-950/20 px-3 py-2 text-xs space-y-1">
                        <div className="flex items-center justify-between text-indigo-300 font-semibold text-[11px]">
                          <span>🛡️ 相关性与剧本独立性审查：{ticket.correlation_audit.tactical_synergy}</span>
                          <span className="text-slate-400 font-mono text-[10px]">评分: {ticket.correlation_audit.independence_score}分</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{ticket.correlation_audit.notes}</div>
                      </div>
                    )}

                    {ticket.bankroll_guidance && (
                      <div className="rounded border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 text-emerald-300">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                          <span>💰 凯利资金建议：{ticket.bankroll_guidance.recommended_stake_pct}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">{ticket.bankroll_guidance.guidance_text}</span>
                      </div>
                    )}
                    <div className="text-xs text-slate-400 bg-slate-950/40 p-2 rounded border border-slate-800/60">{ticket.reason}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-slate-500">保存位置：投注建议中心 → 推荐台账 → 回测候选。完整生成结果可使用上方“保存完整评估快照”，并在本页“已保存的 AI 评估历史”查看。</div>
            </div>
          )}

          {/* Floating Hover Popover for Machine 5 vs AI 5 */}
          {hoveredLeg && hoveredLeg.anchorRect && (
            <ErrorBoundary fallbackRender={() => null}>
              {(() => {
                const rect = hoveredLeg.anchorRect;
                const popoverWidth = typeof window !== 'undefined' ? Math.min(880, Math.max(340, window.innerWidth - 32)) : 880;
                const popoverHeight = 480;
                
                // Try placing below the card
                let top = rect.bottom + 8;
                // If it goes past bottom of viewport, place above
                if (typeof window !== 'undefined' && top + popoverHeight > window.innerHeight - 16) {
                  top = Math.max(16, rect.top - popoverHeight - 8);
                }
                
                // Center horizontally relative to card or clamp within screen bounds
                let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
                if (left < 16) left = 16;
                if (typeof window !== 'undefined' && left + popoverWidth > window.innerWidth - 16) {
                  left = window.innerWidth - popoverWidth - 16;
                }

                // Integer rounding prevents sub-pixel anti-aliasing text blur
                const roundedTop = Math.round(top);
                const roundedLeft = Math.round(left);
                const roundedWidth = Math.round(popoverWidth);

                const leg = hoveredLeg.leg || ({} as any);
                const ticket = hoveredLeg.ticket || ({} as any);
                const matchItem = hoveredLeg.matchItem;
                const stats = extractMatchLiveStats(matchItem, leg);

                return (
                  <div
                    style={{ 
                      top: `${roundedTop}px`, 
                      left: `${roundedLeft}px`, 
                      width: `${roundedWidth}px`,
                      backgroundColor: '#090d16',
                      transform: 'translateZ(0)',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale',
                      textRendering: 'optimizeLegibility',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(99, 102, 241, 0.5)'
                    }}
                    className="fixed z-50 rounded-2xl border-2 border-indigo-500 bg-[#090d16] p-4 space-y-3 max-h-[88vh] overflow-y-auto pointer-events-auto text-slate-100"
                    onMouseEnter={() => {
                      if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                      }
                    }}
                    onMouseLeave={() => {
                      hoverTimeoutRef.current = setTimeout(() => {
                        setHoveredLeg(null);
                      }, 120);
                    }}
                  >
                    {/* Header (Compact: 开赛时间在赛事旁，比分、赛前/滚球状态与球队名在同一行) */}
                    <div className="border-b border-slate-700/80 pb-2.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-indigo-950 border border-indigo-600 px-2.5 py-0.5 text-xs font-bold text-indigo-200">
                            {ticket?.size || ticket?.legs?.length || 2} 串 1 · 第 {ticket?.ticket_index || 1} 组 · 腿 #{hoveredLeg.legIndex}
                          </span>
                          <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-purple-950 text-purple-200 border border-purple-700 flex items-center gap-1 shadow-sm">
                            <Trophy className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                            {getLeagueName(matchItem || leg)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedFormMatch(matchItem || ({
                              match: leg.match,
                              ybty_home: leg.ybty_home,
                              ybty_away: leg.ybty_away,
                              league: leg.league,
                              status: 'WATCH'
                            } as any))}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/40 rounded text-xs font-semibold flex items-center gap-1 transition-all shadow"
                            title="查看本场近期战绩、历史交锋与胜率走势 (点击弹出)"
                          >
                            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                            <span>近期战绩</span>
                          </button>
                          <span className="text-slate-200 font-mono text-xs flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-700">
                            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            {matchItem?.ybty_start_time_beijing || matchItem?.provider_start_time || matchItem?.commence_time || '即时/待定'} (北京时间)
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 text-sm sm:text-base font-bold text-slate-100">
                        <span className="text-white font-extrabold">{leg.ybty_home || matchItem?.ybty_home || leg.match || '主队'}</span>
                        <span className="text-slate-400 text-xs font-semibold">VS</span>
                        <span className="text-white font-extrabold">{leg.ybty_away || matchItem?.ybty_away || '客队'}</span>
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-950 border border-amber-600/80 text-amber-200 font-mono font-bold text-xs flex items-center gap-1.5">
                          <span>⚽ {scoreDisplay(leg.score ?? matchItem?.score, '0-0')}</span>
                          <span className="text-[11px] font-medium text-amber-300">
                            {leg.minute !== undefined && Number(leg.minute) > 0 ? `(${leg.minute}')` : '(赛前)'}
                          </span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${leg.score_verified ? 'bg-emerald-950 border border-emerald-600 text-emerald-200' : 'bg-slate-800 border border-slate-600 text-slate-300'}`}>
                          {leg.score_verified ? '✅ 已核验比分' : '⚠️ 比分待核验'}
                        </span>
                      </div>

                      {/* 🚩 现场实况统计 Badge Strip (控球率, 危险进攻, 角球, 射门/射正, 黄牌, 红牌) */}
                      <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-950/90 border border-slate-700/80 rounded-lg p-2">
                        <span className="text-slate-400 font-semibold flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-indigo-400" /> 现场实况统计:
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 flex items-center gap-1 font-mono">
                          <span>⏱️ 控球率</span>
                          <strong className="text-amber-300">{stats.possession.text}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 flex items-center gap-1 font-mono">
                          <span>⚡ 危险进攻</span>
                          <strong className="text-rose-300">{stats.dangerousAttacks.text}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 flex items-center gap-1 font-mono">
                          <span>🚩 角球</span>
                          <strong className="text-sky-300">{stats.corners.text}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 flex items-center gap-1 font-mono">
                          <span>🎯 射门/射正</span>
                          <strong className="text-emerald-300">{stats.shotsCombined.text}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-amber-800/60 text-slate-200 flex items-center gap-1 font-mono">
                          <span>🟨 黄牌</span>
                          <strong className="text-amber-300">{stats.yellowCards.text}</strong>
                        </span>
                        <span className={`px-2 py-0.5 rounded border flex items-center gap-1 font-mono ${
                          stats.redCards.hasRed 
                            ? 'bg-rose-950 border-rose-600 text-rose-200 font-bold animate-pulse' 
                            : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}>
                          <span>🟥 红牌</span>
                          <strong className={stats.redCards.hasRed ? 'text-rose-300' : 'text-slate-300'}>{stats.redCards.text}</strong>
                        </span>
                        {stats.isPrematch && (
                          <span className="text-[11px] text-slate-400 font-normal">
                            (赛前赛事，实况数据随开赛实时采集)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 2-Column Comparison: 机选核心投注 5 项 vs AI 核心投注 5 项 (大小球、让球、独赢) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {/* Left: 🤖 机选核心投注 5 项 */}
                      {(() => {
                        const effectiveMatchItem = (matchItem || {
                          match: leg.match,
                          ybty_home: leg.ybty_home,
                          ybty_away: leg.ybty_away,
                          league: leg.league,
                          ybty_league: leg.ybty_league,
                          score: leg.score,
                          score_verified: leg.score_verified,
                          minute: leg.minute,
                          recommendation: {
                            market: leg.market,
                            line: leg.line,
                            odds: leg.odds,
                            selection: leg.selection || leg.market,
                          },
                          ybty_raw_markets: (leg as any)?.ybty_raw_markets || (leg as any)?.raw_markets,
                          ybty_markets: (leg as any)?.ybty_markets,
                        }) as DecisionItem;

                        const ext = generateExtendedAnalysis(effectiveMatchItem);
                        const machineRecMarket = String(effectiveMatchItem?.recommendation?.market || leg?.market || '');

                        const getMachineDisplay = (rec: any, defaultText: string) => {
                          if (!rec || !rec.odds || String(rec.value || '').includes('暂无')) return defaultText;
                          const val = String(rec.value || '').trim();
                          const line = String(rec.line || '').trim();
                          if (line && line !== '--' && !val.includes(line)) {
                            return `${val} ${line}`.trim();
                          }
                          return val;
                        };

                        const machine5Markets = [
                          {
                            key: 'full_total',
                            label: '① 全场大小球',
                            direction: getMachineDisplay(ext?.overUnder?.fullTime, '暂无全场大小球盘口'),
                            odds: ext?.overUnder?.fullTime?.odds ? `@${ext.overUnder.fullTime.odds}` : '--',
                            prob: ext?.overUnder?.fullTime?.confidence ? `${ext.overUnder.fullTime.confidence}%` : '--',
                            isPrimary: /full_total|全场大小球/i.test(machineRecMarket),
                          },
                          {
                            key: 'half_total',
                            label: '② 半场大小球',
                            direction: getMachineDisplay(ext?.overUnder?.halfTime, '暂无半场大小球盘口'),
                            odds: ext?.overUnder?.halfTime?.odds ? `@${ext.overUnder.halfTime.odds}` : '--',
                            prob: ext?.overUnder?.halfTime?.confidence ? `${ext.overUnder.halfTime.confidence}%` : '--',
                            isPrimary: /half_total|半场大小球/i.test(machineRecMarket),
                          },
                          {
                            key: 'full_spread',
                            label: '③ 全场让球',
                            direction: getMachineDisplay(ext?.handicap?.fullTime, '暂无全场让球盘口'),
                            odds: ext?.handicap?.fullTime?.odds ? `@${ext.handicap.fullTime.odds}` : '--',
                            prob: ext?.handicap?.fullTime?.confidence ? `${ext.handicap.fullTime.confidence}%` : '--',
                            isPrimary: /full_spread|全场让球/i.test(machineRecMarket),
                          },
                          {
                            key: 'half_spread',
                            label: '④ 半场让球',
                            direction: getMachineDisplay(ext?.handicap?.halfTime, '暂无半场让球盘口'),
                            odds: ext?.handicap?.halfTime?.odds ? `@${ext.handicap.halfTime.odds}` : '--',
                            prob: ext?.handicap?.halfTime?.confidence ? `${ext.handicap.halfTime.confidence}%` : '--',
                            isPrimary: /half_spread|半场让球/i.test(machineRecMarket),
                          },
                          {
                            key: 'full_h2h',
                            label: '⑤ 全场独赢1X2',
                            direction: ext?.match1X2?.value || '暂无全场独赢盘口',
                            odds: ext?.match1X2?.odds ? `@${ext.match1X2.odds}` : '--',
                            prob: ext?.match1X2?.probability ? `${ext.match1X2.probability}%` : '--',
                            isPrimary: /full_h2h|独赢|1x2/i.test(machineRecMarket),
                          },
                        ];

                        return (
                          <div className="rounded-xl border border-sky-700/80 bg-sky-950/40 p-3 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-sky-800/80 pb-1.5">
                              <div className="flex items-center gap-1.5">
                                <div className="p-1 rounded bg-sky-900 text-sky-200">
                                  <Cpu className="w-3.5 h-3.5" />
                                </div>
                                <span className="font-bold text-xs sm:text-sm text-sky-200">🤖 机选核心投注 5 项</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${effectiveMatchItem?.grade === 'A' ? 'bg-emerald-950 border border-emerald-600 text-emerald-300' : effectiveMatchItem?.grade === 'B' ? 'bg-sky-950 border border-sky-600 text-sky-300' : 'bg-slate-800 text-slate-300'}`}>
                                {effectiveMatchItem?.grade ? `${effectiveMatchItem.grade}级初筛` : '观察'}
                              </span>
                            </div>

                            <div className="space-y-2 text-xs">
                              {machine5Markets.map((m) => (
                                <div
                                  key={m.key}
                                  className={`rounded-lg p-2.5 space-y-1.5 border transition-all ${
                                    m.isPrimary
                                      ? 'bg-sky-950 border-sky-400 ring-1 ring-sky-400/40 shadow-sm'
                                      : 'bg-slate-950/90 border-sky-900/60'
                                  }`}
                                >
                                  {/* Row 1: Label + Badge (Left) vs Odds + Prob (Right) */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-xs text-sky-300 font-bold">{m.label}</span>
                                      {m.isPrimary && (
                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 shrink-0">
                                          ★ 主选
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 font-mono text-xs shrink-0">
                                      <span className="text-amber-300 font-bold bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-800/80">{m.odds}</span>
                                      <span className="text-sky-300 font-medium text-[11px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">{m.prob}</span>
                                    </div>
                                  </div>

                                  {/* Row 2: Full Direction & Line with NO truncation and zero overflow */}
                                  <div className="text-slate-100 font-bold text-xs sm:text-sm break-words leading-relaxed pl-0.5">
                                    {m.direction}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Right: ✨ AI 核心投注 5 项 */}
                      {(() => {
                        const targetHome = leg.ybty_home || matchItem?.ybty_home || '';
                        const targetAway = leg.ybty_away || matchItem?.ybty_away || '';
                        const targetMatch = leg.match || matchItem?.match || '';

                        const isSameMatch = (m: any) => {
                          if (!m) return false;
                          if (m.match && targetMatch && (m.match === targetMatch || m.match.includes(targetMatch) || targetMatch.includes(m.match))) return true;
                          if (m.ybty_home && targetHome && m.ybty_home === targetHome && m.ybty_away === targetAway) return true;
                          return false;
                        };

                        let matchedAi: any = null;
                        const resMatches = result?.matches;
                        if (Array.isArray(resMatches)) {
                          matchedAi = (resMatches as any[]).find(isSameMatch);
                        }
                        if (!matchedAi) {
                          for (const hist of evaluationHistory) {
                            const arr = Array.isArray(hist?.result?.matches) ? hist.result.matches : [hist?.result];
                            matchedAi = arr.find(isSameMatch);
                            if (matchedAi) break;
                          }
                        }

                        const findAiAssessment = (catKey: string, mktKey: string) => {
                          if (!matchedAi?.market_assessments || !Array.isArray(matchedAi.market_assessments)) return null;
                          return matchedAi.market_assessments.find((item: any) =>
                            String(item?.category || '').includes(catKey) ||
                            String(item?.market || '') === mktKey
                          );
                        };

                        const legMarket = String(leg.market || '');

                        const ai5Markets = [
                          {
                            key: 'full_total',
                            label: '① 全场大小球',
                            assessment: findAiAssessment('全场大小球', 'full_total'),
                            isLegPick: /全场大小球|full_total/i.test(legMarket),
                          },
                          {
                            key: 'half_total',
                            label: '② 半场大小球',
                            assessment: findAiAssessment('半场大小球', 'half_total'),
                            isLegPick: /半场大小球|half_total/i.test(legMarket),
                          },
                          {
                            key: 'full_spread',
                            label: '③ 全场让球',
                            assessment: findAiAssessment('全场让球', 'full_spread'),
                            isLegPick: /全场让球|full_spread/i.test(legMarket),
                          },
                          {
                            key: 'half_spread',
                            label: '④ 半场让球',
                            assessment: findAiAssessment('半场让球', 'half_spread'),
                            isLegPick: /半场让球|half_spread/i.test(legMarket),
                          },
                          {
                            key: 'full_h2h',
                            label: '⑤ 全场独赢1X2',
                            assessment: findAiAssessment('独赢', 'full_h2h'),
                            isLegPick: /独赢|1x2|full_h2h|h2h/i.test(legMarket),
                          },
                        ];

                        return (
                          <div className="rounded-xl border border-indigo-700/80 bg-indigo-950/40 p-3 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-indigo-800/80 pb-1.5">
                              <div className="flex items-center gap-1.5">
                                <div className="p-1 rounded bg-indigo-900 text-indigo-200">
                                  <Sparkles className="w-3.5 h-3.5" />
                                </div>
                                <span className="font-bold text-xs sm:text-sm text-indigo-200">✨ AI 核心投注 5 项</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${leg.grade === 'A' ? 'bg-emerald-950 border border-emerald-600 text-emerald-300' : 'bg-sky-950 border border-sky-600 text-sky-300'}`}>
                                {leg.grade || 'B'}级研判
                              </span>
                            </div>

                            <div className="space-y-2 text-xs">
                              {ai5Markets.map((m) => {
                                const ass = m.assessment;
                                let dirText = '--';
                                let oddsText = '--';
                                let probText = '--';
                                let badgeText = '';
                                let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';

                                if (ass) {
                                  const lineStr = String(ass.line ?? '').trim();
                                  const rawDir = String(ass.direction || '--');
                                  dirText = lineStr && !rawDir.includes(lineStr) ? `${rawDir} ${lineStr}` : rawDir;
                                  oddsText = Number(ass.odds) > 1 ? `@${ass.odds}` : (ass.status === 'unavailable' ? '封盘/未开' : '--');
                                  probText = ass.probability ? `${ass.probability}%` : '--';
                                  if (ass.status === 'recommend') {
                                    badgeText = `推荐·${ass.grade || 'B'}`;
                                    badgeClass = 'bg-emerald-950 border-emerald-600 text-emerald-200 font-bold';
                                  } else if (ass.status === 'watch') {
                                    badgeText = `观察·${ass.grade || 'C'}`;
                                    badgeClass = 'bg-sky-950 border-sky-600 text-sky-200 font-bold';
                                  } else if (ass.status === 'avoid') {
                                    badgeText = '回避';
                                    badgeClass = 'bg-rose-950 border-rose-700 text-rose-200 font-bold';
                                  } else if (ass.status === 'unavailable') {
                                    badgeText = '未提供';
                                    badgeClass = 'bg-slate-900 border-slate-700 text-slate-400';
                                  }
                                } else if (m.isLegPick) {
                                  const mName = formatMarketName(leg.market);
                                  const lText = formatLineText(leg.market, leg.line, leg.ybty_home, leg.ybty_away);
                                  dirText = `${mName} ${lText}`.trim();
                                  oddsText = leg.odds ? `@${leg.odds}` : '--';
                                  probText = leg.probability ? `${leg.probability}%` : '--';
                                  badgeText = `${leg.grade || 'B'}级选单`;
                                  badgeClass = 'bg-emerald-950 border-emerald-600 text-emerald-200 font-bold';
                                } else {
                                  dirText = '盘口未提供 / 待研判';
                                  oddsText = '--';
                                  probText = '--';
                                  badgeText = '待研判';
                                  badgeClass = 'bg-slate-900 border-slate-800 text-slate-400';
                                }

                                return (
                                  <div
                                    key={m.key}
                                    className={`rounded-lg p-2.5 space-y-1.5 border transition-all ${
                                      m.isLegPick
                                        ? 'bg-indigo-950 border-indigo-400 ring-1 ring-indigo-400/40 shadow-sm'
                                        : 'bg-slate-950/90 border-indigo-900/60'
                                    }`}
                                  >
                                    {/* Row 1: Label + Badge (Left) vs Odds + Prob + Status (Right) */}
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-xs text-indigo-300 font-bold">{m.label}</span>
                                        {m.isLegPick && (
                                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400 shrink-0">
                                            ★ 串关选腿
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 font-mono text-xs shrink-0">
                                        <span className="text-amber-300 font-bold bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-800/80">{oddsText}</span>
                                        <span className="text-sky-300 font-medium text-[11px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">{probText}</span>
                                        {badgeText && (
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${badgeClass}`}>
                                            {badgeText}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Row 2: Full Direction & Line with NO truncation and zero overflow */}
                                    <div className="text-slate-100 font-bold text-xs sm:text-sm break-words leading-relaxed pl-0.5">
                                      {dirText}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Bottom Row: 操盘策略与反脆弱研判依据 */}
                    <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                        <span className="text-indigo-300 font-bold flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-indigo-400" />
                          本腿操盘策略：
                          <span className="text-slate-100 font-semibold">
                            {leg.pro_strategy || `${leg.grade || 'B'}级风控 / 正期望值(+EV)驱动`}
                          </span>
                        </span>
                      </div>
                      <div className="text-slate-200 text-xs leading-relaxed">
                        <strong className="text-slate-400">研判依据：</strong>
                        {leg.reason || ticket?.reason || '主力首发与核心数据支持，跨场次剧本独立过审。'}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </ErrorBoundary>
          )}
          </>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100">已保存的 AI 评估历史</h3>
            <p className="mt-1 text-xs text-slate-400">用于复查当时的完整分析，不计入正式推荐命中率。</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadEvaluationHistory} disabled={historyLoading} className="rounded bg-slate-800 px-3 py-1.5 text-xs text-sky-300 hover:bg-slate-700 disabled:opacity-50">
              {historyLoading ? '读取中…' : '刷新历史'}
            </button>
            {evaluationHistory.length > 0 && (
              <button onClick={handleClearEvaluationHistory} className="rounded bg-rose-950/80 hover:bg-rose-900/80 border border-rose-800/80 px-3 py-1.5 text-xs text-rose-300">
                🧹 清空历史 ({evaluationHistory.length})
              </button>
            )}
          </div>
        </div>
        {evaluationHistory.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-center text-xs text-slate-500">暂无已保存评估</div>
        ) : (
          <div className="space-y-2">
            {evaluationHistory.map((snapshot) => {
              const snapshotMatches = Array.isArray(snapshot.result?.matches) ? snapshot.result.matches : [snapshot.result];
              const expanded = expandedHistoryId === snapshot.id;
              return (
                <div key={snapshot.id} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70">
                  <button onClick={() => setExpandedHistoryId(expanded ? null : snapshot.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-900">
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{snapshotMatches.length} 场 · {snapshot.mode === 'live_eval' ? '滚球评估' : snapshot.mode === 'prematch_eval' ? '赛前评估' : '串关评估'}</div>
                      <div className="mt-1 text-[10px] text-slate-500">{snapshot.id} · {snapshot.saved_at ? new Date(snapshot.saved_at).toLocaleString('zh-CN') : '时间未知'}</div>
                    </div>
                    <span className="text-xs text-sky-400">{expanded ? '收起' : '查看完整内容'}</span>
                  </button>
                  {expanded && (
                    <div className="space-y-3 border-t border-slate-800 p-3">
                      {snapshotMatches.map((matchResult: AIAnalysisResponse, index: number) => (
                        <div key={`${matchResult?.match || index}`} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-slate-100">{matchResult?.match || `${matchResult?.ybty_home || ''} vs ${matchResult?.ybty_away || ''}`}</strong>
                            <span className="text-sky-300">{matchResult?.grade || '--'}级</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-slate-300">{matchResult?.summary || '无摘要'}</p>
                          {matchResult?.recommendation && (
                            <div className="mt-2 text-emerald-300">主选：{matchResult.recommendation.market} {matchResult.recommendation.line} @{matchResult.recommendation.odds}</div>
                          )}
                          {Array.isArray(matchResult?.market_assessments) && matchResult.market_assessments.length > 0 && (
                            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {matchResult.market_assessments.map((assessment, assessmentIndex) => (
                                <div key={`${assessment.category}-${assessmentIndex}`} className="rounded border border-slate-700 bg-slate-950 p-2">
                                  <div className="font-semibold text-slate-200">{assessment.category}</div>
                                  <div className="mt-1 text-emerald-300">{assessment.direction || '--'} {assessment.line ?? ''} {assessment.odds ? `@${assessment.odds}` : ''}</div>
                                  <div className="mt-1 text-slate-500">概率 {assessment.probability ?? '--'}% · {assessment.grade} · {assessment.status}</div>
                                  <div className="mt-1 text-slate-400">{assessment.reason}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Form Popup Modal */}
      <RecentFormModal
        match={selectedFormMatch}
        isOpen={!!selectedFormMatch}
        onClose={() => setSelectedFormMatch(null)}
      />

      {/* Clear Evaluation History Confirm Modal */}
      {showClearHistoryConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setShowClearHistoryConfirmModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-rose-800/60 bg-slate-900 p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-amber-400 font-bold text-base">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              <h3>确认清空 AI 评估历史记录？</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              您即将彻底清空所有已保存的 {evaluationHistory.length} 条 AI 评估历史快照。此操作不影响正式推荐台账，但历史快照清除后不可恢复。是否确定继续？
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearHistoryConfirmModal(false)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                取消
              </button>
              <button
                onClick={() => void executeClearEvaluationHistory()}
                disabled={isClearingHistory}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-40 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                {isClearingHistory ? '清空中…' : '确定清空'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

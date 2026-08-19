import React, { useEffect, useState } from 'react';
import { DecisionItem, getLeagueName, getTeamDisplay } from '../types';
import { DataSupplementModal } from './DataSupplementModal';
import { BatchSupplementModal } from './BatchSupplementModal';
import { isQuarterLine, parseQuarterLine, getQuarterSplits, formatAsianLine } from '../lib/quarterSettlement';
import { generateExtendedAnalysis } from '../lib/extendedRecommendation';
import { analyzeDualConsensus, DualConsensusAnalysis, formatMarketLabel, formatBetOption } from '../lib/consensusArbitration';
import { displayText } from '../lib/displayValue';
import { 
  Trophy, 
  ShieldCheck, 
  ShieldAlert, 
  Sparkles, 
  Clock, 
  Layers, 
  HelpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  Activity, 
  Calendar, 
  Check, 
  Filter, 
  Search,
  Eye,
  XCircle,
  Edit3,
  CheckSquare,
  Square,
  Target,
  Clock3,
  TrendingDown,
  Zap,
  BarChart3,
  Crosshair,
  Divide,
  BookOpen,
  Scale,
  ShieldX,
  Flame,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface Props {
  liveMatches: DecisionItem[];
  prematchMatches: DecisionItem[];
  onSelectForAi: (match: DecisionItem) => void;
  onRefreshLedger: () => void;
}

const hasUsableRecommendation = (recommendation: DecisionItem['recommendation'] | null | undefined): boolean => {
  if (!recommendation) return false;
  const market = String(recommendation.market ?? '').trim();
  const line = String(recommendation.line ?? '').trim();
  const odds = Number(recommendation.odds);
  return market.length > 0 && line.length > 0 && Number.isFinite(odds) && odds > 1;
};

const aiAssessmentStatus = (status: string): { label: string; className: string } => {
  if (status === 'recommend') return { label: '正式推荐', className: 'border-emerald-600/50 bg-emerald-950/30 text-emerald-300' };
  if (status === 'watch') return { label: '建议观察', className: 'border-sky-600/50 bg-sky-950/30 text-sky-300' };
  if (status === 'prediction') return { label: '模型预测', className: 'border-purple-600/50 bg-purple-950/30 text-purple-300' };
  if (status === 'avoid') return { label: '不建议投注', className: 'border-rose-700/50 bg-rose-950/20 text-rose-300' };
  return { label: '数据不足', className: 'border-slate-700 bg-slate-900 text-slate-400' };
};

const parlaySourceMeta = (source: string): { label: string; className: string } => {
  if (source === 'formal_primary') return { label: '原系统正式主选', className: 'border-emerald-600/50 bg-emerald-950/60 text-emerald-300' };
  if (source === 'ai_market_assessment') return { label: 'AI评估', className: 'border-sky-600/50 bg-sky-950/60 text-sky-300' };
  if (source.startsWith('extended_')) return { label: '原系统扩展模型', className: 'border-amber-600/50 bg-amber-950/50 text-amber-300' };
  return { label: '来源未标记', className: 'border-slate-600 bg-slate-900 text-slate-400' };
};

export const BettingRecommendationsView: React.FC<Props> = ({
  liveMatches,
  prematchMatches,
  onSelectForAi,
  onRefreshLedger,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'DUAL_CONSENSUS' | 'AI_UPGRADE' | 'AVOID_RISK' | 'GRADE_AB' | 'GRADE_B' | 'GRADE_C' | 'LIVE' | 'PREMATCH' | 'PARLAY'>('ALL');
  const [marketViewTab, setMarketViewTab] = useState<'PARLAY_TICKETS' | 'ALL_MARKETS' | 'OU_HANDICAP' | 'GOAL_PREDICTIONS' | 'INTERVALS' | 'LIVE_TIMING'>('ALL_MARKETS');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitSuccessId, setSubmitSuccessId] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(true);
  const [aiEvaluationHistory, setAiEvaluationHistory] = useState<any[]>([]);
  const [expanded12MarketsMatch, setExpanded12MarketsMatch] = useState<string | null>(null);

  // Single Modal State
  const [supplementMatch, setSupplementMatch] = useState<DecisionItem | null>(null);
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [customUpdatedMatches, setCustomUpdatedMatches] = useState<Record<string, DecisionItem>>({});

  // Batch Operations State
  const [selectedMatchNames, setSelectedMatchNames] = useState<string[]>([]);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);

  // Parlay Promotion States
  const [parlaySubmittingId, setParlaySubmittingId] = useState<string | null>(null);
  const [isBatchSubmittingParlays, setIsBatchSubmittingParlays] = useState<boolean>(false);
  const [parlaySuccessMsg, setParlaySuccessMsg] = useState<string | null>(null);

  const allCombined = [
    ...liveMatches.map((m) => ({ ...m, source_type: 'live' as const })),
    ...prematchMatches.map((m) => ({ ...m, source_type: 'prematch' as const })),
  ].map((m) => (customUpdatedMatches[m.match] ? { ...customUpdatedMatches[m.match], source_type: m.source_type } : m));

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/evaluations')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (!cancelled) setAiEvaluationHistory(Array.isArray(data.evaluations) ? data.evaluations : []);
      })
      .catch((error) => console.error('Failed to load AI evaluation history', error));
    return () => { cancelled = true; };
  }, []);

  const findLatestAiEvaluation = (match: DecisionItem): any | null => {
    const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[\s_-]/g, '');
    const targetMatch = normalize(match.match);
    const targetHome = normalize(match.ybty_home);
    const targetAway = normalize(match.ybty_away);
    for (const snapshot of aiEvaluationHistory) {
      const results = Array.isArray(snapshot?.result?.matches) ? snapshot.result.matches : [snapshot?.result];
      const found = results.find((item: any) => {
        if (!item) return false;
        if (normalize(item.match) === targetMatch) return true;
        return normalize(item.ybty_home) === targetHome && normalize(item.ybty_away) === targetAway;
      });
      if (found) return { ...found, snapshot_id: snapshot.id, saved_at: snapshot.saved_at };
    }
    return null;
  };

  const filtered = allCombined.filter((m) => {
    const nameMatch =
      m.match.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.ybty_home && m.ybty_home.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.ybty_away && m.ybty_away.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!nameMatch) return false;

    const latestAiEvaluation = findLatestAiEvaluation(m);
    const consensus = analyzeDualConsensus(m, latestAiEvaluation);

    if (filterType === 'DUAL_CONSENSUS') {
      return consensus.tier === 'DUAL_STRONG_CONSENSUS';
    }
    if (filterType === 'AI_UPGRADE') {
      return consensus.tier === 'AI_VALUE_UPGRADE';
    }
    if (filterType === 'AVOID_RISK') {
      return consensus.isHighRisk || consensus.tier === 'DIVERGENCE_AVOID' || consensus.tier === 'HIGH_RISK_AVOID';
    }
    if (filterType === 'GRADE_AB') {
      return m.grade === 'A' || m.grade === 'B' || m.status === 'WATCH' || consensus.isBetWorthy;
    }
    if (filterType === 'GRADE_B') return m.grade === 'B';
    if (filterType === 'GRADE_C') return m.grade === 'C' || !m.grade;
    if (filterType === 'LIVE') return m.source_type === 'live';
    if (filterType === 'PREMATCH') return m.source_type === 'prematch';
    if (filterType === 'PARLAY') return m.grade === 'A' || m.grade === 'B' || consensus.isBetWorthy;

    return true;
  });

  // Batch selection helpers
  const toggleSelectMatch = (matchName: string) => {
    if (selectedMatchNames.includes(matchName)) {
      setSelectedMatchNames(selectedMatchNames.filter((name) => name !== matchName));
    } else {
      setSelectedMatchNames([...selectedMatchNames, matchName]);
    }
  };

  const toggleSelectAllFiltered = () => {
    if (selectedMatchNames.length === filtered.length && filtered.length > 0) {
      setSelectedMatchNames([]);
    } else {
      setSelectedMatchNames(filtered.map((m) => m.match));
    }
  };

  const handleOpenSupplement = (m: DecisionItem) => {
    setSupplementMatch(m);
    setIsSingleModalOpen(true);
  };

  const handleSaveSupplement = (updatedMatch: DecisionItem) => {
    setCustomUpdatedMatches((prev) => ({
      ...prev,
      [updatedMatch.match]: updatedMatch,
    }));
  };

  const handleApplyBatchUpdates = (updatedMatches: DecisionItem[]) => {
    const newCustoms = { ...customUpdatedMatches };
    updatedMatches.forEach((m) => {
      newCustoms[m.match] = m;
    });
    setCustomUpdatedMatches(newCustoms);
  };

  const handleQuickBatchVerifyScore = () => {
    const newCustoms = { ...customUpdatedMatches };
    filtered.forEach((m) => {
      if (selectedMatchNames.includes(m.match)) {
        newCustoms[m.match] = {
          ...m,
          score_verified: true,
          score_source: 'user_quick_batch_verified',
          status: 'WATCH',
          grade: m.grade === 'C' || !m.grade ? 'B' : m.grade,
          evidence: [...(m.evidence || []), '[批量一键核验] 比分已手动核验'],
          risks: (m.risks || []).filter((r) => !r.includes('比分未经校验')),
        };
      }
    });
    setCustomUpdatedMatches(newCustoms);
    setBatchSuccessMsg(`已成功批量核验 ${selectedMatchNames.length} 场比赛比分！`);
    setTimeout(() => setBatchSuccessMsg(null), 3000);
  };

  const predictionFeaturesFor = (m: DecisionItem) => ({
    schema_version: 'leisu_prediction_features_v1',
    captured_at: m.captured_at || new Date().toISOString(),
    mode: Number(m.minute || 0) > 0 ? 'live' : 'prematch',
    minute: Number(m.minute || 0),
    score: m.score || { home: 0, away: 0 },
    live_statistics: m.live_statistics || null,
    recent_trends: m.recent_trends || null,
    reference_odds: m.reference_odds || null,
    weather: m.weather || null,
    lineups: m.lineups || null,
    detail_completeness: (m.detail_context as any)?.completeness || null,
  });

  const buildLedgerItemsForMatch = (m: DecisionItem, includeAllExtended: boolean = true) => {
    const items = [];

    // 1. Primary Recommendation
    const hasFormalPrimary = hasUsableRecommendation(m.recommendation);
    if (hasFormalPrimary) {
      items.push({
        match: m.match,
        ybty_home: m.ybty_home,
        ybty_away: m.ybty_away,
        minute: m.minute || 0,
        score_at_recommendation: m.score || { home: 0, away: 0 },
        score_source: m.score_source || 'unverified',
        score_verified: m.score_verified === true,
        grade: m.grade || 'B',
        model_score: m.model_score || 75.0,
        recommendation: m.recommendation,
        evidence: m.evidence || [],
        risks: m.risks || [],
        start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || m.commence_time || '',
        prediction_features: predictionFeaturesFor(m),
      });
    }

    // Extended analysis is a display-only exploration. Synthetic alternatives must never become formal bets.
    if (false && includeAllExtended) {
      const ext = generateExtendedAnalysis(m);

      // Full-time Handicap
      if (ext.handicap?.fullTime) {
        items.push({
          match: m.match,
          ybty_home: m.ybty_home,
          ybty_away: m.ybty_away,
          minute: m.minute || 0,
          score_at_recommendation: m.score || { home: 0, away: 0 },
          score_source: m.score_source || 'ybty_market',
          score_verified: m.score_verified === true,
          grade: m.grade || 'B',
          model_score: m.model_score || 75.0,
          recommendation: {
            market: `全场让球 (${ext.handicap.fullTime.team})`,
            line: ext.handicap.fullTime.line,
            odds: ext.handicap.fullTime.odds,
          },
          evidence: [ext.handicap.fullTime.reason],
          risks: m.risks || [],
          start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
        });
      }

      // Half-time Handicap
      if (ext.handicap?.halfTime) {
        items.push({
          match: m.match,
          ybty_home: m.ybty_home,
          ybty_away: m.ybty_away,
          minute: m.minute || 0,
          score_at_recommendation: m.score || { home: 0, away: 0 },
          score_source: m.score_source || 'ybty_market',
          score_verified: m.score_verified === true,
          grade: m.grade || 'B',
          model_score: m.model_score || 75.0,
          recommendation: {
            market: `半场让球 (${ext.handicap.halfTime.team})`,
            line: ext.handicap.halfTime.line,
            odds: ext.handicap.halfTime.odds,
          },
          evidence: [ext.handicap.halfTime.reason],
          risks: m.risks || [],
          start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
        });
      }

      // 1X2 Match Winner
      if (ext.match1X2) {
        items.push({
          match: m.match,
          ybty_home: m.ybty_home,
          ybty_away: m.ybty_away,
          minute: m.minute || 0,
          score_at_recommendation: m.score || { home: 0, away: 0 },
          score_source: m.score_source || 'ybty_market',
          score_verified: m.score_verified === true,
          grade: m.grade || 'B',
          model_score: m.model_score || 75.0,
          recommendation: {
            market: `全场独赢 (1X2)`,
            line: ext.match1X2.value,
            odds: ext.match1X2.odds,
          },
          evidence: [ext.match1X2.reason],
          risks: m.risks || [],
          start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
        });
      }

      // Correct Score Top Pick
      if (ext.correctScores && ext.correctScores.length > 0) {
        const csTop = ext.correctScores[0];
        items.push({
          match: m.match,
          ybty_home: m.ybty_home,
          ybty_away: m.ybty_away,
          minute: m.minute || 0,
          score_at_recommendation: m.score || { home: 0, away: 0 },
          score_source: m.score_source || 'ybty_market',
          score_verified: m.score_verified === true,
          grade: m.grade || 'B',
          model_score: m.model_score || 75.0,
          recommendation: {
            market: `波胆首选`,
            line: csTop.score,
            odds: csTop.odds,
          },
          evidence: [`模型预测波胆胜率 ${csTop.probPercent}%`],
          risks: m.risks || [],
          start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
        });
      }

      // BTTS
      if (ext.btts) {
        items.push({
          match: m.match,
          ybty_home: m.ybty_home,
          ybty_away: m.ybty_away,
          minute: m.minute || 0,
          score_at_recommendation: m.score || { home: 0, away: 0 },
          score_source: m.score_source || 'ybty_market',
          score_verified: m.score_verified === true,
          grade: m.grade || 'B',
          model_score: m.model_score || 75.0,
          recommendation: {
            market: `双方进球 (BTTS)`,
            line: ext.btts.value,
            odds: ext.btts.odds,
          },
          evidence: [ext.btts.reason],
          risks: m.risks || [],
          start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
        });
      }
    }

    return items;
  };

  const buildBacktestCandidatesForMatch = (m: DecisionItem) => {
    const base = {
      match: m.match,
      ybty_home: m.ybty_home,
      ybty_away: m.ybty_away,
      minute: m.minute || 0,
      score_at_recommendation: m.score || { home: 0, away: 0 },
      score_source: m.score_source || 'unverified',
      score_verified: m.score_verified === true,
      grade: m.grade || 'C',
      model_score: m.model_score || 0,
      risks: m.risks || [],
      start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || m.commence_time || null,
      candidate_source: 'ybty_market_snapshot_v1',
      prediction_features: predictionFeaturesFor(m),
      selection_method: '同一市场中取实际赔率最低方向，作为市场基准候选；不等同于正式AI主选',
    };
    const rows: any[] = [];
    const addRow = (market: string, line: string | number, odds: unknown, evidence: string) => {
      const numericOdds = Number(odds);
      if (!Number.isFinite(numericOdds) || numericOdds <= 1) return;
      rows.push({
        ...base,
        recommendation: { market, line, odds: numericOdds },
        implied_probability: Number((100 / numericOdds).toFixed(2)),
        evidence: [...(m.evidence || []), evidence],
      });
    };

    // This entry deliberately excludes m.recommendation: the formal primary has
    // its own ledger path and must not be duplicated as an all-market candidate.

    for (const rawMarket of m.ybty_raw_markets || []) {
      const marketCode = String(rawMarket.market || '');
      const activeOptions = (rawMarket.options || [])
        .map((option, index) => ({ ...option, index, numericOdds: Number(option.odds) }))
        .filter((option) => !option.suspended && Number.isFinite(option.numericOdds) && option.numericOdds > 1);
      activeOptions.sort((a, b) => a.numericOdds - b.numericOdds);
      const selected = activeOptions[0];
      if (!selected) continue;
      const isHalf = marketCode.startsWith('half_');
      const period = isHalf ? '半场' : '全场';
      const lineIndex = Number(rawMarket.line_index || 0);
      const suffix = lineIndex > 0 ? ` 第${lineIndex + 1}盘口` : '';
      if (marketCode.endsWith('_h2h')) {
        const selectionText = String(selected.selection || selected.text || '');
        const side = selectionText.includes('主')
          ? '主胜'
          : selectionText.includes('平')
            ? '平局'
            : selectionText.includes('客')
              ? '客胜'
              : selected.index === 0 ? '主胜' : selected.index === 1 && activeOptions.length >= 3 ? '客胜' : '平局';
        addRow(`${period}独赢（市场基准）${suffix}`, side, selected.numericOdds, `取自本次YBTY ${marketCode} 原始真实赔率`);
      } else if (marketCode.endsWith('_spread')) {
        const side = selected.index === 0 ? '主队' : '客队';
        addRow(`${period}让球（市场基准）${suffix}`, `${side} ${formatAsianLine(selected.selection || '0')}`, selected.numericOdds, `取自本次YBTY ${marketCode} 原始真实盘口和赔率`);
      } else if (marketCode.endsWith('_total')) {
        const side = selected.index === 0 ? '大球' : '小球';
        addRow(`${period}${side}（市场基准）${suffix}`, formatAsianLine(selected.selection || '0'), selected.numericOdds, `取自本次YBTY ${marketCode} 原始真实盘口和赔率`);
      }
    }

    const h2h = m.ybty_markets?.h2h;
    if (h2h) {
      const options = [
        { line: '主胜', odds: h2h.home_odds, suspended: h2h.home_suspended },
        { line: '平局', odds: h2h.draw_odds, suspended: h2h.draw_suspended },
        { line: '客胜', odds: h2h.away_odds, suspended: h2h.away_suspended },
      ].filter((option) => !option.suspended && Number(option.odds) > 1);
      options.sort((a, b) => Number(a.odds) - Number(b.odds));
      if (options[0]) addRow('全场独赢（市场基准）', options[0].line, options[0].odds, '取自本次YBTY独赢盘真实赔率的最低赔率方向');
    }

    const spread = m.ybty_markets?.spread;
    if (spread) {
      const options = [
        { side: '主队', line: spread.home_line, odds: spread.home_odds, suspended: spread.home_suspended },
        { side: '客队', line: spread.away_line, odds: spread.away_odds, suspended: spread.away_suspended },
      ].filter((option) => !option.suspended && option.line !== undefined && Number(option.odds) > 1);
      options.sort((a, b) => Number(a.odds) - Number(b.odds));
      if (options[0]) addRow('全场让球（市场基准）', `${options[0].side} ${formatAsianLine(options[0].line!)}`, options[0].odds, '取自本次YBTY让球盘真实盘口和赔率');
    }

    const total = m.ybty_markets?.total;
    if (total?.line !== undefined) {
      const options = [
        { side: '大球', odds: total.over_odds, suspended: total.over_suspended },
        { side: '小球', odds: total.under_odds, suspended: total.under_suspended },
      ].filter((option) => !option.suspended && Number(option.odds) > 1);
      options.sort((a, b) => Number(a.odds) - Number(b.odds));
      if (options[0]) addRow(`全场${options[0].side}（市场基准）`, formatAsianLine(total.line), options[0].odds, '取自本次YBTY大小球盘真实盘口和赔率');
    }

    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = `${row.recommendation.market}|${row.recommendation.line}|${row.recommendation.odds}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const buildProjectionRecordsForMatch = (m: DecisionItem) => {
    const ext = generateExtendedAnalysis(m);
    const base = {
      match: m.match,
      ybty_home: m.ybty_home,
      ybty_away: m.ybty_away,
      minute: m.minute || 0,
      score_at_recommendation: m.score || { home: 0, away: 0 },
      score_source: m.score_source || 'unverified',
      score_verified: m.score_verified === true,
      grade: m.grade || 'C',
      model_score: m.model_score || 0,
      risks: m.risks || [],
      start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || m.commence_time || null,
      candidate_source: 'extended_projection_snapshot',
      selection_method: '保存分析页面当时展示的预测值，仅用于赛后准确率比较',
      prediction_only: true,
      model_version: 'extended_projection_v1',
    };
    const records: any[] = [];
    const addProjection = (predictionType: string, market: string, line: string | number | null, probability = 0, evidence = '') => {
      if (line === null || line === undefined || line === '数据不足') return;
      records.push({
        ...base,
        prediction_type: predictionType,
        prediction_probability: probability,
        recommendation: { market, line, odds: 1 },
        evidence: evidence ? [evidence] : [],
      });
    };

    const topScore = ext.correctScores?.[0];
    if (topScore) addProjection('correct_score', '波胆预测', topScore.score, topScore.probPercent, '保存当时排名第一的波胆预测');
    if (ext.btts) addProjection('btts', '双方是否进球预测', ext.btts.value, ext.btts.probability || 0, ext.btts.reason);
    if (ext.oddEven) addProjection('odd_even', '总进球数单双预测', ext.oddEven.value, ext.oddEven.probability || 0, ext.oddEven.reason);
    if (ext.goalProjection) {
      addProjection('home_goals', '主队进球数预测', ext.goalProjection.homeMostLikely, ext.goalProjection.homeConfidence);
      addProjection('away_goals', '客队进球数预测', ext.goalProjection.awayMostLikely, ext.goalProjection.awayConfidence);
      addProjection('total_goals', '总进球数预测', ext.goalProjection.totalMostLikely, ext.goalProjection.totalConfidence);
    }
    return records;
  };

  const buildExtendedBettingRecordsForMatch = (m: DecisionItem) => {
    const ext = generateExtendedAnalysis(m);
    const base = {
      match: m.match,
      ybty_home: m.ybty_home,
      ybty_away: m.ybty_away,
      minute: m.minute || 0,
      score_at_recommendation: m.score || { home: 0, away: 0 },
      score_source: m.score_source || 'unverified',
      score_verified: m.score_verified === true,
      grade: m.grade || 'C',
      model_score: m.model_score || 0,
      risks: m.risks || [],
      start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || m.commence_time || null,
      candidate_source: 'extended_betting_snapshot_v1',
      selection_method: '保存分析页面当时展示的结构化投注建议，用于候选回测，不计入正式表现',
      prediction_only: false,
    };
    const records: any[] = [];
    const add = (market: string, line: string | number, odds: number | null, confidence: number, evidence: string) => {
      if (!market || line === undefined || !Number.isFinite(Number(odds)) || Number(odds) <= 1) return;
      records.push({
        ...base,
        model_score: confidence,
        implied_probability: Number((100 / Number(odds)).toFixed(2)),
        recommendation: { market, line, odds: Number(odds) },
        evidence: evidence ? [evidence] : [],
      });
    };

    add(ext.overUnder.fullTime.value, ext.overUnder.fullTime.line, ext.overUnder.fullTime.odds, ext.overUnder.fullTime.confidence, ext.overUnder.fullTime.reason);
    if (Number(m.minute || 0) < 45 && !String(ext.overUnder.halfTime.line).includes('已完')) {
      add(ext.overUnder.halfTime.value, ext.overUnder.halfTime.line, ext.overUnder.halfTime.odds, ext.overUnder.halfTime.confidence, ext.overUnder.halfTime.reason);
      add(`半场让球（${ext.handicap.halfTime.team}）`, ext.handicap.halfTime.line, ext.handicap.halfTime.odds, ext.handicap.halfTime.confidence, ext.handicap.halfTime.reason);
    }
    add(`全场让球（${ext.handicap.fullTime.team}）`, ext.handicap.fullTime.line, ext.handicap.fullTime.odds, ext.handicap.fullTime.confidence, ext.handicap.fullTime.reason);
    add('全场独赢（1X2扩展建议）', ext.match1X2.value, ext.match1X2.odds, ext.match1X2.probability, ext.match1X2.reason);
    return records;
  };

  const handleSaveCompleteAnalysisSnapshot = async () => {
    const list = filtered.filter((m) => selectedMatchNames.includes(m.match));
    if (list.length === 0) return;
    setIsBatchSubmitting(true);
    const counts = { formal: 0, candidate: 0, projection: 0, duplicate: 0, skipped: 0, rejected: 0 };
    try {
      for (const match of list) {
        const formalPayload = buildLedgerItemsForMatch(match, false)[0];
        if (
          formalPayload &&
          ['A', 'B'].includes(String(formalPayload.grade || '')) &&
          /^\d{4}-\d{2}-\d{2}/.test(String(formalPayload.start_time_beijing || '')) &&
          (Number(formalPayload.minute || 0) <= 0 || (formalPayload.score_verified === true && formalPayload.score_source !== 'unverified'))
        ) {
          const response = await fetch('/api/ledger/add', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formalPayload),
          });
          if (response.ok) counts.formal++;
          else if (response.status === 409) counts.duplicate++;
          else counts.rejected++;
        } else {
          counts.skipped++;
        }

        const backtestRecords = [
          ...buildBacktestCandidatesForMatch(match).map((record) => ({ ...record, prediction_only: false })),
          ...buildExtendedBettingRecordsForMatch(match),
          ...buildProjectionRecordsForMatch(match),
        ];
        for (const record of backtestRecords) {
          const response = await fetch('/api/ledger/add-candidate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record),
          });
          if (response.ok) {
            if (record.prediction_only) counts.projection++;
            else counts.candidate++;
          } else if (response.status === 409) counts.duplicate++;
          else counts.rejected++;
        }
      }
      onRefreshLedger();
      setBatchSuccessMsg(
        `本次分析快照已保存：正式主选 ${counts.formal} 条，盘口候选 ${counts.candidate} 条，扩展预测 ${counts.projection} 条；重复 ${counts.duplicate} 条，正式条件不足 ${counts.skipped} 场，失败 ${counts.rejected} 条。`,
      );
      if (counts.formal + counts.candidate + counts.projection > 0) setSelectedMatchNames([]);
      setTimeout(() => setBatchSuccessMsg(null), 6000);
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  const handleBatchSaveBacktestCandidates = async () => {
    const list = filtered.filter((m) => selectedMatchNames.includes(m.match));
    if (list.length === 0) return;
    setIsBatchSubmitting(true);
    let saved = 0;
    let duplicates = 0;
    let noMarkets = 0;
    let rejected = 0;
    let serverNotRestarted = false;
    try {
      for (const match of list) {
        const candidates = buildBacktestCandidatesForMatch(match);
        if (candidates.length === 0) {
          noMarkets++;
          continue;
        }
        for (const candidate of candidates) {
          const response = await fetch('/api/ledger/add-candidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(candidate),
          });
          if (response.ok) saved++;
          else if (response.status === 409) duplicates++;
          else {
            if (response.status === 404) serverNotRestarted = true;
            rejected++;
          }
        }
      }
      onRefreshLedger();
      setBatchSuccessMsg(
        serverNotRestarted
          ? '回测候选接口不存在（404）：当前 Node 服务仍是旧进程，请重启本地项目后再提交。'
          : `回测候选写入 ${saved} 条；重复跳过 ${duplicates} 条；无真实盘口 ${noMarkets} 场；接口拒绝 ${rejected} 条。候选不计入正式命中率。`,
      );
      if (saved > 0) setSelectedMatchNames([]);
      setTimeout(() => setBatchSuccessMsg(null), 5000);
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  const handleBatchSubmitToLedger = async (
    itemsToSubmit?: DecisionItem[],
    includeAllExtended: boolean = true
  ) => {
    const list = itemsToSubmit || filtered.filter((m) => selectedMatchNames.includes(m.match));
    if (list.length === 0) return;

    setIsBatchSubmitting(true);
    let totalItemsSaved = 0;
    const skippedReasons = new Map<string, number>();
    const addSkippedReason = (reason: string) => skippedReasons.set(reason, (skippedReasons.get(reason) || 0) + 1);

    try {
      for (const m of list) {
        const payloadList = buildLedgerItemsForMatch(m, includeAllExtended);
        if (payloadList.length === 0) {
          addSkippedReason('尚无经过研究的具体主选');
          continue;
        }
        for (const payload of payloadList) {
          if (!['A', 'B'].includes(String(payload.grade || ''))) {
            addSkippedReason('低于B级');
            continue;
          }
          if (!/^\d{4}-\d{2}-\d{2}/.test(String(payload.start_time_beijing || ''))) {
            addSkippedReason('缺少明确开赛时间');
            continue;
          }
          if (Number(payload.minute || 0) > 0 && (payload.score_verified !== true || payload.score_source === 'unverified')) {
            addSkippedReason('滚球比分未核验');
            continue;
          }
          const response = await fetch('/api/ledger/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            totalItemsSaved++;
          } else {
            const errorBody = await response.json().catch(() => ({}));
            addSkippedReason(
              response.status === 409 && errorBody.error === 'Duplicate formal recommendation'
                ? '台账已存在'
                : errorBody.error || `接口拒绝 (${response.status})`,
            );
          }
        }
      }

      onRefreshLedger();
      const skippedSummary = Array.from(skippedReasons.entries())
        .map(([reason, count]) => `${reason} ${count} 条`)
        .join('；');
      setBatchSuccessMsg(
        `正式主选写入 ${totalItemsSaved} 条${skippedSummary ? `；跳过：${skippedSummary}` : ''}`,
      );
      if (totalItemsSaved > 0) setSelectedMatchNames([]);
      setTimeout(() => setBatchSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Batch submit to ledger failed', err);
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  const handlePromoteToFormalLedger = async (m: any, includeAllExtended: boolean = true) => {
    setSubmittingId(m.match);
    try {
      const payloadList = buildLedgerItemsForMatch(m, includeAllExtended);
      let successCount = 0;

      for (const payload of payloadList) {
        const resp = await fetch('/api/ledger/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (resp.ok) successCount++;
      }

      if (successCount > 0) {
        setSubmitSuccessId(m.match);
        onRefreshLedger();
        setTimeout(() => setSubmitSuccessId(null), 3000);
      }
    } catch (err) {
      console.error('Failed to promote to formal ledger', err);
    } finally {
      setSubmittingId(null);
    }
  };

  // AI Multi-Style Parlay Tickets Generator
  const generateAiParlayTickets = () => {
    const parlayDirectionCandidates = allCombined.flatMap((match) => {
      const directions: any[] = [];
      if (hasUsableRecommendation(match.recommendation)) {
        directions.push({ ...match, parlay_direction_source: 'formal_primary', parlay_formal_eligible: true });
      }
      const latestAi = findLatestAiEvaluation(match);
      for (const assessment of Array.isArray(latestAi?.market_assessments) ? latestAi.market_assessments : []) {
        const status = String(assessment.status || '');
        if (status !== 'recommend' && status !== 'watch') continue;
        const odds = Number(assessment.odds);
        const direction = String(assessment.direction || '').trim();
        const category = String(assessment.category || assessment.market || '').trim();
        const line = String(assessment.line ?? (category.includes('独赢') ? direction : '')).trim();
        if (!category || !direction || !line || !Number.isFinite(odds) || odds < 1.3) continue;
        const assessmentGrade = ['A', 'B', 'C'].includes(String(assessment.grade)) ? String(assessment.grade) : 'C';
        const isPrematch = (match as any).source_type === 'prematch' || Number(match.minute || 0) <= 0;
        const formalEligible = status === 'recommend'
          && (assessmentGrade === 'A' || assessmentGrade === 'B')
          && (isPrematch || match.score_verified === true);
        directions.push({
          ...match,
          grade: assessmentGrade,
          recommendation: {
            market: category.includes('独赢') ? '全场独赢' : `${category}（${direction}）`,
            line,
            odds,
          },
          model_score: Number(assessment.probability || 0),
          parlay_direction_source: 'ai_market_assessment',
          parlay_formal_eligible: formalEligible,
          parlay_reference_eligible: true,
          ai_assessment_status: status,
        });
      }
      if (match.grade === 'A' || match.grade === 'B') {
        const ext = generateExtendedAnalysis(match);
        const addCandidateDirection = (market: string, line: string | number, odds: number | null, confidence: number, source: string) => {
          if (!market || String(line ?? '').trim() === '' || !Number.isFinite(Number(odds)) || Number(odds) < 1.3 || confidence < 70) return;
          directions.push({
            ...match,
            recommendation: { market, line, odds: Number(odds) },
            model_score: confidence,
            parlay_direction_source: source,
            parlay_formal_eligible: false,
          });
        };
        addCandidateDirection(ext.overUnder.fullTime.value, ext.overUnder.fullTime.line, ext.overUnder.fullTime.odds, ext.overUnder.fullTime.confidence, 'extended_over_under');
        addCandidateDirection(`全场让球（${ext.handicap.fullTime.team}）`, ext.handicap.fullTime.line, ext.handicap.fullTime.odds, ext.handicap.fullTime.confidence, 'extended_handicap');
        addCandidateDirection('双方是否进球（BTTS）', ext.btts.value, ext.btts.odds, Math.max(70, Number(match.model_score || 70)), 'extended_btts');
      }
      return directions;
    });
    // Formal legs require A/B and verified live scores. AI watch/C directions with
    // real YBTY odds remain visible only as observation/backtest legs.
    const validCandidates = parlayDirectionCandidates.filter((m: DecisionItem) => {
      const odds = Number(m.recommendation?.odds);
      const isSolid = m.grade === 'A' || m.grade === 'B';
      const isReferenceAiDirection = (m as any).parlay_reference_eligible === true;
      const hasMarket = hasUsableRecommendation(m.recommendation);
      const liveScoreIsVerified = !m.minute || m.minute <= 0 || m.score_verified === true;
      const hasConcreteTime = /^\d{4}-\d{2}-\d{2}/.test(String(m.ybty_start_time_beijing || m.provider_start_time || ''));
      const formalPath = isSolid && liveScoreIsVerified;
      const referencePath = isReferenceAiDirection;
      return (formalPath || referencePath) && hasMarket && Number.isFinite(odds) && odds >= 1.30 && hasConcreteTime;
    });

    // Keep independently researched directions. The same match may contribute different markets across tickets.
    const uniqueCandidates: DecisionItem[] = [];
    const seen = new Set<string>();
    for (const c of validCandidates) {
      const directionKey = `${c.match}|${c.recommendation?.market}|${c.recommendation?.line}`;
      if (!seen.has(directionKey)) {
        seen.add(directionKey);
        uniqueCandidates.push(c);
      }
    }

    const isMoneyline = (item: DecisionItem) => /独赢|1x2|moneyline|主胜|客胜/i.test(String(item.recommendation?.market || ''));
    // Handicap and totals carry more information than a pure favourite accumulator.
    // Prefer them first and never publish an all-moneyline ticket.
    uniqueCandidates.sort((a, b) => Number(isMoneyline(a)) - Number(isMoneyline(b)) || Number(b.model_score || 0) - Number(a.model_score || 0));

    if (uniqueCandidates.length < 2) return [];

    // Preserve the researched market exactly; never invent a different market for parlay variety.
    const formatLegMarket = (leg: DecisionItem) => {
      return {
        match: leg.match,
        ybty_home: leg.ybty_home,
        ybty_away: leg.ybty_away,
        league: getLeagueName(leg),
        grade: leg.grade || 'B',
        model_score: leg.model_score || 0,
        startTime: leg.ybty_start_time_beijing || leg.provider_start_time || '推算时间',
        minute: leg.minute || 0,
        score: leg.score || { home: 0, away: 0 },
        market: leg.recommendation!.market!,
        line: formatAsianLine(leg.recommendation!.line!),
        odds: Number(leg.recommendation!.odds),
        score_verified: leg.score_verified === true,
        score_source: leg.score_source || 'unverified',
        directionSource: (leg as any).parlay_direction_source || 'formal_primary',
        formalEligible: (leg as any).parlay_formal_eligible === true,
      };
    };

    const tickets = [];
    const computeParlayQuantMetrics = (legs: any[], totalOdds: number) => {
      const rawJointProb = legs.length > 0
        ? legs.reduce((acc, l) => {
            const prob = l.model_score ? Math.min(80, Math.max(45, l.model_score * 0.8)) : (l.grade === 'A' ? 68 : 58);
            return acc * (prob / 100);
          }, 1) * 100
        : 0;
      const jointProbability = Number(rawJointProb.toFixed(1));
      const combinedEvPct = Number(((jointProbability / 100 * totalOdds - 1) * 100).toFixed(1));
      const b = Math.max(0.01, totalOdds - 1);
      const p = jointProbability / 100;
      const q = 1 - p;
      const fullKelly = Math.max(0, (b * p - q) / b);
      const kellyFractionPct = Number((fullKelly * 0.25 * 100).toFixed(2));

      const leagueSet = new Set(legs.map((l) => l.league).filter(Boolean));
      let independenceScore = 92;
      if (legs.length > 1 && leagueSet.size === 1) independenceScore -= 12;
      const correlationRiskCheck = independenceScore >= 70 ? 'passed' : 'warning';

      let sharpeAssessment: 'HIGH_EDGE_CORE' | 'BALANCED_GROWTH' | 'SPECULATIVE_VALUE' = 'SPECULATIVE_VALUE';
      if (combinedEvPct >= 12 && jointProbability >= 25) {
        sharpeAssessment = 'HIGH_EDGE_CORE';
      } else if (combinedEvPct >= 4 && jointProbability >= 15) {
        sharpeAssessment = 'BALANCED_GROWTH';
      }

      return {
        jointProbability,
        combinedEvPct,
        kellyFractionPct,
        sharpeAssessment,
        independenceScore,
        correlationRiskCheck,
      };
    };

    const selectDistinctMatches = (pool: DecisionItem[], count: number, offset = 0) => {
      const selected: DecisionItem[] = [];
      const usedMatches = new Set<string>();
      for (let i = 0; i < pool.length && selected.length < count; i++) {
        const candidate = pool[(i + offset) % pool.length];
        if (!usedMatches.has(candidate.match)) {
          usedMatches.add(candidate.match);
          selected.push(candidate);
        }
      }
      return selected;
    };

    // Ticket 1: 2-Leg High-Value Balanced Ticket (2串1 强推荐)
    const ticket1Legs = selectDistinctMatches(uniqueCandidates, 2).map(formatLegMarket);
    if (ticket1Legs.length < 2) return [];
    const ticket1IsMoneylineOnly = ticket1Legs.every((leg) => /独赢|1x2|moneyline|主胜|客胜/i.test(leg.market));
    const ticket1Formal = ticket1Legs.every((leg) => leg.formalEligible);
    const t1Odds = Number(ticket1Legs.reduce((acc, l) => acc * l.odds, 1).toFixed(2));
    const t1Quant = computeParlayQuantMetrics(ticket1Legs, t1Odds);
    tickets.push({
      ticketId: 'PARLAY_2LEG_BALANCED',
      title: ticket1Formal ? (ticket1IsMoneylineOnly ? '⚠️ 2串1 独赢备用组合' : '🎯 2串1 多市场价值组合') : '🔎 2串1 AI观察/回测组合',
      tag: ticket1Formal ? (ticket1IsMoneylineOnly ? '低信息量备选' : '非纯独赢') : '非正式候选',
      legsCount: 2,
      totalOdds: t1Odds,
      hasAGrade: ticket1Legs.some((l) => l.grade === 'A'),
      formalEligible: ticket1Formal,
      legs: ticket1Legs,
      quantMetrics: t1Quant,
      strategyReason: ticket1IsMoneylineOnly
        ? '当前没有已研究成立的让球或大小球方向，仅保留一组独赢参考串；不视为高安全边际方案，不扩展更多纯独赢组合'
        : '至少包含一条已独立研究成立的让球或大小球方向；优先采用多市场结构',
    });

    // Ticket 2: 3-Leg Multi-Market High Yield Ticket (3串1 丰富玩法)
    if (uniqueCandidates.length >= 5) {
      const ticket2Legs = selectDistinctMatches(uniqueCandidates.slice(2), 3).map(formatLegMarket);
      if (ticket2Legs.length < 3 || ticket2Legs.every((leg) => /独赢|1x2|moneyline|主胜|客胜/i.test(leg.market))) return tickets;
      const t2Odds = Number(ticket2Legs.reduce((acc, l) => acc * l.odds, 1).toFixed(2));
      const t2Quant = computeParlayQuantMetrics(ticket2Legs, t2Odds);
      tickets.push({
        ticketId: 'PARLAY_3LEG_DIVERSE',
        title: ticket2Legs.every((leg) => leg.formalEligible) ? '🚀 3串1 全胜率多玩法彩票' : '🔎 3串1 AI观察/回测组合',
        tag: ticket2Legs.every((leg) => leg.formalEligible) ? '高回报型' : '非正式候选',
        legsCount: 3,
        totalOdds: t2Odds,
        hasAGrade: ticket2Legs.some((l) => l.grade === 'A'),
        formalEligible: ticket2Legs.every((l) => l.formalEligible),
        legs: ticket2Legs,
        quantMetrics: t2Quant,
        strategyReason: '从已独立研究的方向中组合多种玩法；仍需计入赛事、杯赛轮换与市场相关风险',
      });
    }

    // Ticket 3: Over/Under Goal-Rush Ticket (2串1 进球大战/大小球)
    if (uniqueCandidates.length >= 2) {
      const alreadyUsedDirections = new Set(
        tickets.flatMap((ticket) => ticket.legs.map((leg) => `${leg.match}|${leg.market}|${leg.line}`)),
      );
      const ouLegs = selectDistinctMatches(
        uniqueCandidates.filter((leg) => {
          const direction = `${leg.match}|${leg.recommendation?.market}|${formatAsianLine(leg.recommendation?.line ?? '')}`;
          return /大球|over/i.test(leg.recommendation?.market || '') && !alreadyUsedDirections.has(direction);
        }),
        2,
      ).map(formatLegMarket);
      if (ouLegs.length < 2) return tickets;
      const ouOdds = Number(ouLegs.reduce((acc, l) => acc * l.odds, 1).toFixed(2));
      const ouQuant = computeParlayQuantMetrics(ouLegs, ouOdds);
      tickets.push({
        ticketId: 'PARLAY_OU_SPECIAL',
        title: ouLegs.every((leg) => leg.formalEligible) ? '⚽ 2串1 全场大球/进球大战专项' : '🔎 2串1 AI进球观察/回测组合',
        tag: ouLegs.every((leg) => leg.formalEligible) ? '进球专项' : '非正式候选',
        legsCount: 2,
        totalOdds: ouOdds,
        hasAGrade: ouLegs.some((l) => l.grade === 'A'),
        formalEligible: ouLegs.every((l) => l.formalEligible),
        legs: ouLegs,
        quantMetrics: ouQuant,
        strategyReason: '只组合已独立研究成立的全场大球方向，不临时改写盘口或赔率',
      });
    }

    return tickets;
  };

  const aiParlayTickets = generateAiParlayTickets();
  const parlayEligibility = allCombined.reduce(
    (stats, match) => {
      const isGradeEligible = match.grade === 'A' || match.grade === 'B';
      const hasResearchedMarket = hasUsableRecommendation(match.recommendation);
      const odds = Number(match.recommendation?.odds);
      const hasEligibleOdds = Number.isFinite(odds) && odds >= 1.3;
      const hasConcreteTime = /^\d{4}-\d{2}-\d{2}/.test(String(match.ybty_start_time_beijing || match.provider_start_time || ''));
      const hasVerifiedScore = !match.minute || match.minute <= 0 || match.score_verified === true;

      if (isGradeEligible) stats.gradeEligible += 1;
      if (isGradeEligible && hasResearchedMarket && !/独赢|1x2|moneyline|主胜|客胜/i.test(String(match.recommendation?.market || ''))) stats.nonMoneylineEligible += 1;
      if (isGradeEligible && !hasResearchedMarket) stats.awaitingResearch += 1;
      if (isGradeEligible && hasResearchedMarket && !hasEligibleOdds) stats.invalidOdds += 1;
      if (isGradeEligible && hasResearchedMarket && hasEligibleOdds && !hasConcreteTime) stats.missingTime += 1;
      if (isGradeEligible && hasResearchedMarket && hasEligibleOdds && hasConcreteTime && !hasVerifiedScore) stats.unverifiedLiveScore += 1;
      if (isGradeEligible && hasResearchedMarket && hasEligibleOdds && hasConcreteTime && hasVerifiedScore) stats.eligibleLegs += 1;
      return stats;
    },
    { gradeEligible: 0, awaitingResearch: 0, invalidOdds: 0, missingTime: 0, unverifiedLiveScore: 0, eligibleLegs: 0, nonMoneylineEligible: 0 },
  );

  const handlePromoteParlayToLedger = async (ticket: ReturnType<typeof generateAiParlayTickets>[0]) => {
    setParlaySubmittingId(ticket.ticketId);
    try {
      const legSummary = ticket.legs
        .map((l, i) => `腿${i + 1}: [${l.ybty_home} vs ${l.ybty_away}] ${l.market} ${l.line} @${l.odds}`)
        .join(' | ');

      const parlayLedgerItem = {
        match: `【AI 精选 ${ticket.legsCount}串1】${ticket.legs[0].ybty_home} 等 ${ticket.legsCount} 场串关`,
        ybty_home: ticket.legs[0].ybty_home,
        ybty_away: ticket.legs[0].ybty_away,
        minute: 0,
        score_at_recommendation: { home: 0, away: 0 },
        score_source: 'ybty_market',
        score_verified: ticket.legs.every((leg) => leg.score_verified === true),
        grade: ticket.hasAGrade ? 'A' : 'B',
        model_score: ticket.hasAGrade ? 88.0 : 79.5,
        recommendation: {
          market: `【${ticket.legsCount}串1${ticket.formalEligible ? '正式串关' : '候选串关'}】${legSummary}`,
          line: `总赔率 @${ticket.totalOdds}`,
          odds: ticket.totalOdds,
        },
        evidence: [
          `[AI 串关风控] ${ticket.strategyReason}`,
          ...ticket.legs.map((l) => `${l.match}: ${l.market} ${l.line} (赔率 ${l.odds})`),
        ],
        risks: ['串关多腿独立，任意单腿未命中即全单未命中，请严格管控注码占比 (建议单注 1-2%)'],
        start_time_beijing: ticket.legs[0].startTime,
        is_parlay: true,
        parlay_legs: ticket.legs.map((l, i) => ({
          leg_index: i + 1,
          match: l.match,
          ybty_home: l.ybty_home,
          ybty_away: l.ybty_away,
          market: l.market,
          line: l.line,
          odds: l.odds,
          score_at_recommendation: l.score || { home: 0, away: 0 },
          final_score: null,
          score_verified: l.score_verified === true,
          score_source: l.score_source || 'unverified',
          start_time_beijing: l.startTime,
          minute: l.minute,
          grade: l.grade,
          model_score: l.model_score,
        })),
        candidate_source: ticket.formalEligible ? undefined : 'multi_market_candidate_parlay',
        selection_method: ticket.formalEligible ? undefined : '由结构化扩展投注建议组合，保存用于观察与回测',
      };

      const response = await fetch(ticket.formalEligible ? '/api/ledger/add' : '/api/ledger/add-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parlayLedgerItem),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || '串关写入失败');
      }

      onRefreshLedger();
      setParlaySuccessMsg(`成功将【${ticket.title} (总赔率 @${ticket.totalOdds})】写入${ticket.formalEligible ? '正式推荐' : '候选回测'}台账！`);
      setTimeout(() => setParlaySuccessMsg(null), 4000);
    } catch (err) {
      console.error('Submit parlay ticket to ledger failed', err);
    } finally {
      setParlaySubmittingId(null);
    }
  };

  const handleBatchPromoteAllParlaysToLedger = async () => {
    if (aiParlayTickets.length === 0) return;
    setIsBatchSubmittingParlays(true);
    let count = 0;
    try {
      for (const ticket of aiParlayTickets) {
        const legSummary = ticket.legs
          .map((l, i) => `腿${i + 1}: [${l.ybty_home} vs ${l.ybty_away}] ${l.market} ${l.line} @${l.odds}`)
          .join(' | ');

        const parlayLedgerItem = {
          match: `【AI 精选 ${ticket.legsCount}串1】${ticket.legs[0].ybty_home} 等 ${ticket.legsCount} 场串关`,
          ybty_home: ticket.legs[0].ybty_home,
          ybty_away: ticket.legs[0].ybty_away,
          minute: 0,
          score_at_recommendation: { home: 0, away: 0 },
          score_source: 'ybty_market',
          score_verified: ticket.legs.every((leg) => leg.score_verified === true),
          grade: ticket.hasAGrade ? 'A' : 'B',
          model_score: ticket.hasAGrade ? 88.0 : 79.5,
          recommendation: {
            market: `【${ticket.legsCount}串1${ticket.formalEligible ? '正式串关' : '候选串关'}】${legSummary}`,
            line: `总赔率 @${ticket.totalOdds}`,
            odds: ticket.totalOdds,
          },
          evidence: [
            `[AI 串关风控] ${ticket.strategyReason}`,
            ...ticket.legs.map((l) => `${l.match}: ${l.market} ${l.line} (赔率 ${l.odds})`),
          ],
          risks: ['串关多腿独立，任意单腿未命中即全单未命中，请严格管控注码占比 (建议单注 1-2%)'],
          start_time_beijing: ticket.legs[0].startTime,
          is_parlay: true,
          parlay_legs: ticket.legs.map((l, i) => ({
            leg_index: i + 1,
            match: l.match,
            ybty_home: l.ybty_home,
            ybty_away: l.ybty_away,
            market: l.market,
            line: l.line,
            odds: l.odds,
            score_at_recommendation: l.score || { home: 0, away: 0 },
            final_score: null,
            score_verified: l.score_verified === true,
            score_source: l.score_source || 'unverified',
            start_time_beijing: l.startTime,
            minute: l.minute,
            grade: l.grade,
            model_score: l.model_score,
          })),
          candidate_source: ticket.formalEligible ? undefined : 'multi_market_candidate_parlay',
          selection_method: ticket.formalEligible ? undefined : '由结构化扩展投注建议组合，保存用于观察与回测',
        };

        const response = await fetch(ticket.formalEligible ? '/api/ledger/add' : '/api/ledger/add-candidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parlayLedgerItem),
        });
        if (response.ok) count++;
      }

      onRefreshLedger();
      setParlaySuccessMsg(`成功写入 ${count} 套串关；正式串进入正式统计，候选串进入回测候选统计。`);
      setTimeout(() => setParlaySuccessMsg(null), 4000);
    } catch (err) {
      console.error('Batch submit parlay tickets failed', err);
    } finally {
      setIsBatchSubmittingParlays(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/60 to-slate-900 border border-emerald-800/40 rounded-xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                专业投注建议面板 (Betting Recommendation Dashboard)
              </h2>
              <p className="text-xs text-slate-300">
                双源数据支持 · 严禁凭感觉下注 · 规则契合《CUSTOM_INSTRUCTIONS_COMPLETE.md》
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>{showExplanation ? '隐藏协议解析' : '显示 WATCH / PASS 解析'}</span>
          </button>
        </div>

        {/* WATCH & PASS Protocol Explanation Box */}
        {showExplanation && (
          <div className="space-y-3 pt-2 border-t border-slate-800/80 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-950/90 p-3 rounded-lg border border-emerald-800/40 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-emerald-400" />
                  <span>大小球 vs 滚球让球 结算铁律</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  • <strong className="text-emerald-300">全场大小球</strong>：结算绝对只看完场终场总进球数！无论下注时比分是多少，完场 2-1 (3球) 对比 2.25 盘口即判【全赢】。<br />
                  • <strong className="text-amber-300">滚球让球盘</strong>：从下注瞬间起比分基准重置为 0:0，只按下注后【新增进球数】结算！
                </p>
              </div>

              <div className="bg-slate-950/90 p-3 rounded-lg border border-sky-800/40 space-y-1">
                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>最佳投注时机与分段/波胆策略</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  • <strong className="text-sky-300">降水观望</strong>：若预测半场有球但初盘开大 1/1.5，建议观望 5-10 分钟，待盘口掉至大 0.5/1 时重仓买入。<br />
                  • <strong className="text-sky-300">多元玩法</strong>：覆盖波胆、双方进球(BTTS)、角球及 0-15m/16-30m 分段下注。
                </p>
              </div>

              <div className="bg-slate-950/90 p-3 rounded-lg border border-indigo-800/40 space-y-1">
                <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>串关风控与 A级 高信心例外</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  • <strong className="text-indigo-300">标准约束</strong>：同场不同玩法可跨串使用，但每个方向必须独立研究；B级同方向最多进入 1 组。<br />
                  • <strong className="text-indigo-300">A级高信心例外</strong>：若评估达到 A级 (评分 ≥ 85 分、首发战意双确认)，同一方向允许进入【最多 2 组独立串关】。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-950/80 p-3 rounded-lg border border-emerald-800/40 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span>WATCH 观察机制</span>
                </div>
                <p className="text-slate-300 text-[11px]">
                  机器初筛信号，提取即时水位与进攻统计。必须经比分核验与 AI 基本面审查后升级入选台账。
                </p>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-amber-800/40 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-amber-400" />
                  <span>PASS 缺口提示与一键升级</span>
                </div>
                <p className="text-slate-300 text-[11px]">
                  代表开赛时间或盘口缺失。点击【🔧 缺口修补/补充数据】补全后，系统立即升级为 WATCH 或 A/B 级精选建议。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Batch Success Feedback Banner */}
      {batchSuccessMsg && (
        <div className="bg-emerald-950/90 border border-emerald-500 text-emerald-200 p-4 rounded-xl shadow-xl flex items-center justify-between text-xs font-semibold animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{batchSuccessMsg}</span>
          </div>
          <button onClick={() => setBatchSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            关闭
          </button>
        </div>
      )}

      {/* Filter and Search Bar with Batch Select All */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={toggleSelectAllFiltered}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 rounded-lg transition-colors shrink-0"
          >
            {selectedMatchNames.length > 0 && selectedMatchNames.length === filtered.length ? (
              <CheckSquare className="w-4 h-4 text-emerald-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-500" />
            )}
            <span>
              {selectedMatchNames.length > 0 && selectedMatchNames.length === filtered.length
                ? '取消全选'
                : `全选 (${filtered.length})`}
            </span>
          </button>

          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索推荐赛事、YBTY 队名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs">
          <span className="text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> 建议类型:
          </span>
          {[
            { id: 'ALL', label: '全部比赛' },
            { id: 'DUAL_CONSENSUS', label: '🏆 双重强共识 (最佳优选)' },
            { id: 'AI_UPGRADE', label: '💡 AI量化升级' },
            { id: 'AVOID_RISK', label: '⛔ 风险/分歧规避' },
            { id: 'GRADE_AB', label: 'A/B级精选' },
            { id: 'GRADE_B', label: 'B级研究候选' },
            { id: 'GRADE_C', label: 'C级观察候选' },
            { id: 'LIVE', label: '滚球实时' },
            { id: 'PREMATCH', label: '非滚球赛前' },
            { id: 'PARLAY', label: '🎯 智能串关方案' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setFilterType(tab.id as any);
                if (tab.id === 'PARLAY') setMarketViewTab('PARLAY_TICKETS');
                else if (marketViewTab === 'PARLAY_TICKETS') setMarketViewTab('ALL_MARKETS');
              }}
              className={`px-3 py-1 rounded-lg border font-medium transition-all ${
                filterType === tab.id
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Extended Recommendation Markets Sub-Bar */}
      <div className="flex items-center justify-between bg-slate-950/80 p-2 rounded-xl border border-slate-800 text-xs overflow-x-auto gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-emerald-400 font-bold px-2 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" /> 扩展推荐视角:
          </span>
          {[
            { id: 'PARLAY_TICKETS', label: '🎯 智能串关与风控方案', icon: Layers },
            { id: 'ALL_MARKETS', label: '全维度看板', icon: BarChart3 },
            { id: 'OU_HANDICAP', label: '⚽ 让球/大小球 (全场+半场)', icon: Trophy },
            { id: 'GOAL_PREDICTIONS', label: '🎯 进球综合预测', icon: Target },
            { id: 'INTERVALS', label: '⏱️ 时间区间投注', icon: Clock3 },
            { id: 'LIVE_TIMING', label: '📉 盘口掉落/反弹最佳入场', icon: TrendingDown },
          ].map((mTab) => {
            const Icon = mTab.icon;
            return (
              <button
                key={mTab.id}
                onClick={() => {
                  setMarketViewTab(mTab.id as any);
                  if (mTab.id === 'PARLAY_TICKETS') setFilterType('PARLAY');
                  else if (filterType === 'PARLAY') setFilterType('ALL');
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  marketViewTab === mTab.id
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-indigo-400" />
                <span>{mTab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate-400">
        <span className="font-semibold text-slate-300">等级颜色：</span>
        <span className="rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-emerald-300">A级重点</span>
        <span className="rounded border border-sky-500/40 bg-sky-500/20 px-2 py-0.5 text-sky-300">B级研究候选</span>
        <span className="rounded border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-amber-300">C级观察候选</span>
        <span>模型置信度用于候选排序，不等同于历史命中率。</span>
      </div>

      {/* Floating / Sticky Batch Action Bar */}
      {selectedMatchNames.length > 0 && (
        <div className="sticky top-4 z-40 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 border-2 border-emerald-500/80 rounded-xl p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center space-x-2 text-xs text-slate-100 font-bold">
            <span className="px-2.5 py-1 bg-emerald-500 text-slate-950 rounded-lg font-mono text-sm font-extrabold">
              {selectedMatchNames.length}
            </span>
            <span>已选择 场待修补或提报比赛</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={handleQuickBatchVerifyScore}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 rounded-lg font-medium flex items-center gap-1.5 transition-all shadow"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>⚡ 一键批量标记比分已核验</span>
            </button>

            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-md"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>🔧 批量配置修补参数</span>
            </button>

            <button
              onClick={handleSaveCompleteAnalysisSnapshot}
              disabled={isBatchSubmitting}
              className="px-3.5 py-1.5 bg-gradient-to-r from-sky-700 to-emerald-700 hover:from-sky-600 hover:to-emerald-600 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-lg transition-all"
              title="一次保存正式主选、真实盘口候选和扩展预测，并按不同统计口径分类"
            >
              {isBatchSubmitting ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-spin" /> 写入中...
                </>
              ) : (
                <>
                  <BookOpen className="w-3.5 h-3.5" /> 📚 保存本次全部分析快照
                </>
              )}
            </button>

          </div>
        </div>
      )}

      {/* AI Featured Parlay Tickets Center */}
      {(marketViewTab === 'PARLAY_TICKETS' || filterType === 'PARLAY') ? (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border border-indigo-500/50 p-4 rounded-xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-lg border border-indigo-500/30">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  🎯 智能串关与风控方案中心 (AI Verified Parlay Center)
                </h3>
                <p className="text-xs text-slate-400">
                  基于《CUSTOM_INSTRUCTIONS_COMPLETE.md》协议，从已独立研究的让球、大小球、BTTS、独赢等方向组合；同场可跨串采用不同玩法，但控制相关暴露。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-xs text-indigo-300 font-mono font-bold bg-indigo-900/40 px-2.5 py-1.5 rounded border border-indigo-800">
                共生成 {aiParlayTickets.length} 套方案
              </span>

              {aiParlayTickets.length > 0 && (
                <button
                  onClick={handleBatchPromoteAllParlaysToLedger}
                  disabled={isBatchSubmittingParlays}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-lg transition-all"
                  title="将当前生成的所有串关方案一次性全部写入正式推荐台账"
                >
                  {isBatchSubmittingParlays ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin text-white" /> 批量提交中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 text-emerald-300" /> 📥 批量写入全部串关 ({aiParlayTickets.length}套)
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {parlaySuccessMsg && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs rounded-xl flex items-center justify-between font-medium shadow-md">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{parlaySuccessMsg}</span>
              </div>
              <button onClick={() => setParlaySuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 font-bold">
                关闭
              </button>
            </div>
          )}

          {aiParlayTickets.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 border border-slate-800/60 rounded-xl">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-bold">暂无满足安全风控要求的串关组合</p>
              <p className="text-xs text-slate-400 mt-1">
                当前可组成串关的正式腿 {parlayEligibility.eligibleLegs} 条；至少需要 2 条已研究并明确玩法、盘口、赔率和开赛时间的 A/B 级方向。
              </p>
              {parlayEligibility.eligibleLegs >= 2 && parlayEligibility.nonMoneylineEligible === 0 && (
                <p className="text-[11px] text-amber-300 mt-2">当前合格方向全部是独赢；纯独赢串已被拦截，需要至少一条已研究成立的让球或大小球方向。</p>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300">
                  A/B 候选 {parlayEligibility.gradeEligible}
                </span>
                <span className="px-2.5 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">
                  待完成玩法研究 {parlayEligibility.awaitingResearch}
                </span>
                {parlayEligibility.invalidOdds > 0 && (
                  <span className="px-2.5 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300">
                    赔率不合格 {parlayEligibility.invalidOdds}
                  </span>
                )}
                {parlayEligibility.missingTime > 0 && (
                  <span className="px-2.5 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300">
                    时间缺失 {parlayEligibility.missingTime}
                  </span>
                )}
                {parlayEligibility.unverifiedLiveScore > 0 && (
                  <span className="px-2.5 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300">
                    滚球比分未核验 {parlayEligibility.unverifiedLiveScore}
                  </span>
                )}
              </div>
              {parlayEligibility.awaitingResearch > 0 && (
                <p className="text-[11px] text-amber-300/90 mt-3">
                  这些赛事目前只是机器初筛候选，尚未选定具体投注方向；系统不会把未研究的独赢、让球或大小球自动包装成正式串关。
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {aiParlayTickets.map((ticket) => {
                const sourceLabels = Array.from(new Set(ticket.legs.map((leg) => parlaySourceMeta(leg.directionSource).label)));
                const ticketSourceLabel = sourceLabels.length === 1 ? sourceLabels[0] : `混合组合：${sourceLabels.join(' + ')}`;
                return (
                <div key={ticket.ticketId} className="bg-gradient-to-br from-indigo-950/80 via-slate-900 to-indigo-950/60 border-2 border-indigo-500/60 rounded-xl p-4 shadow-2xl space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-500/30 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg text-xs font-black tracking-wider flex items-center gap-1 shadow">
                        <Layers className="w-4 h-4" /> {ticket.title} ({ticket.legsCount}串1)
                      </span>
                      <span className="text-xs font-bold text-amber-300 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        估算综合赔率 @{ticket.totalOdds}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-bold border border-indigo-500/30">
                        {ticket.tag}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${ticket.formalEligible ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-purple-500/15 text-purple-300 border-purple-500/30'}`}>
                        {ticket.formalEligible ? '正式串关' : '候选串关·用于回测'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold border border-sky-500/30 bg-sky-950/50 text-sky-300">
                        来源：{ticketSourceLabel}
                      </span>
                    </div>

                    <button
                      onClick={() => handlePromoteParlayToLedger(ticket)}
                      disabled={parlaySubmittingId === ticket.ticketId}
                      className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-lg transition-all"
                    >
                      {parlaySubmittingId === ticket.ticketId ? (
                        <>
                          <Sparkles className="w-4 h-4 animate-spin text-white" /> 提交台账中...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 text-emerald-300" /> 📥 写入{ticket.formalEligible ? '正式推荐' : '候选回测'}台账
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quantitative Edge & Kelly Calculation Bar */}
                  {(ticket as any).quantMetrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/80 border border-indigo-900/40 rounded-lg p-2.5 text-xs">
                      <div>
                        <div className="text-[10px] text-slate-500">联合理论胜率</div>
                        <div className="font-mono font-bold text-sky-300">{(ticket as any).quantMetrics.jointProbability}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">整单价值边际 (EV)</div>
                        <div className={`font-mono font-bold ${(ticket as any).quantMetrics.combinedEvPct > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {(ticket as any).quantMetrics.combinedEvPct > 0 ? `+${(ticket as any).quantMetrics.combinedEvPct}%` : `${(ticket as any).quantMetrics.combinedEvPct}%`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">1/4 凯利建议注码</div>
                        <div className="font-mono font-bold text-indigo-300">{(ticket as any).quantMetrics.kellyFractionPct}% (仓位控制)</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">反脆弱独立性</div>
                        <div className="font-mono font-bold text-emerald-400 flex items-center gap-1">
                          <span>{(ticket as any).quantMetrics.independenceScore}/100</span>
                          <span className="text-[10px] text-emerald-500 font-normal">({(ticket as any).quantMetrics.correlationRiskCheck === 'passed' ? '已过审' : '提醒'})</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                    {ticket.legs.map((leg, idx) => {
                      const teams = getTeamDisplay(leg);
                      const sourceMeta = parlaySourceMeta(leg.directionSource);
                      return (
                        <div key={leg.match + idx} className="bg-slate-950/90 p-3 rounded-lg border border-indigo-900/50 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-bold text-indigo-300 flex items-center gap-1">
                              腿 #{idx + 1} ({leg.grade}级)
                            </span>
                            <span className="font-mono text-slate-400">{leg.startTime}</span>
                          </div>
                          <div>
                            <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold ${sourceMeta.className}`}>
                              来源：{sourceMeta.label}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-0.5">
                                <Trophy className="w-3 h-3 text-purple-400 shrink-0" />
                                {leg.league}
                              </span>
                            </div>
                            <div className="font-bold text-slate-100 text-xs">
                              {teams.homeYbty} <span className="text-slate-400 font-normal">vs</span> {teams.awayYbty}
                            </div>
                            <div className="text-[11px] font-semibold text-purple-300">
                              {teams.homeLeisu} <span className="text-purple-400 font-normal">vs</span> {teams.awayLeisu}
                            </div>
                            <div className="mt-1 flex items-center justify-between font-mono text-xs">
                              <span className="text-emerald-400 font-bold">{leg.market} ({leg.line})</span>
                              <span className="text-amber-300 font-bold">@{leg.odds}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-200">串关硬性风控核验结论：</span>
                      <span> {ticket.strategyReason}。独立赛事无同场暴露，完全契合台账规程。</span>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Recommendation Cards List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/40 border border-slate-800/60 rounded-xl">
          <AlertTriangle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">暂无符合当前筛选条件的投注建议</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((m, idx) => {
            const isLive = m.source_type === 'live';
            const isSubmitted = submitSuccessId === m.match;
            const isSelected = selectedMatchNames.includes(m.match);
            const hasPrimaryRecommendation = hasUsableRecommendation(m.recommendation);
            const latestAiEvaluation = findLatestAiEvaluation(m);
            const aiRecommendation = latestAiEvaluation?.recommendation;
            const hasAiRecommendation = Boolean(
              aiRecommendation
              && String(aiRecommendation.market ?? '').trim()
              && String(aiRecommendation.line ?? '').trim()
              && Number.isFinite(Number(aiRecommendation.odds))
              && Number(aiRecommendation.odds) > 1,
            );
            const aiRecommendedAssessment = Array.isArray(latestAiEvaluation?.market_assessments)
              ? latestAiEvaluation.market_assessments.find((assessment: any) =>
                  assessment.status === 'recommend'
                  && String(assessment.line ?? '').trim() === String(aiRecommendation?.line ?? '').trim()
                  && Number(assessment.odds) === Number(aiRecommendation?.odds),
                ) || latestAiEvaluation.market_assessments.find((assessment: any) => assessment.status === 'recommend')
              : null;
            const confidenceScore = Math.max(0, Math.min(100, Number(m.model_score || 0)));
            const canPromoteToFormal = (m.grade === 'A' || m.grade === 'B') && hasPrimaryRecommendation;
            const ext = generateExtendedAnalysis(m);
            const strongestTimeInterval = [...(ext.timeIntervals || [])].sort((a, b) => b.confidence - a.confidence)[0];
            const topCorrectScore = ext.correctScores?.[0];
            const systemAssessments: Record<string, any> = {
              '全场大小球': { direction: ext.overUnder.fullTime.value, line: ext.overUnder.fullTime.line, odds: ext.overUnder.fullTime.odds, probability: ext.overUnder.fullTime.confidence, reason: ext.overUnder.fullTime.reason },
              '半场大小球': { direction: ext.overUnder.halfTime.value, line: ext.overUnder.halfTime.line, odds: ext.overUnder.halfTime.odds, probability: ext.overUnder.halfTime.confidence, reason: ext.overUnder.halfTime.reason },
              '全场让球': { direction: `${ext.handicap.fullTime.team} ${ext.handicap.fullTime.value}`, line: ext.handicap.fullTime.line, odds: ext.handicap.fullTime.odds, probability: ext.handicap.fullTime.confidence, reason: ext.handicap.fullTime.reason },
              '半场让球': { direction: `${ext.handicap.halfTime.team} ${ext.handicap.halfTime.value}`, line: ext.handicap.halfTime.line, odds: ext.handicap.halfTime.odds, probability: ext.handicap.halfTime.confidence, reason: ext.handicap.halfTime.reason },
              '全场独赢1X2': { direction: ext.match1X2.value, line: null, odds: ext.match1X2.odds, probability: ext.match1X2.probability, reason: ext.match1X2.reason },
              '波胆': { direction: topCorrectScore?.score || '数据不足', line: null, odds: topCorrectScore?.odds ?? null, probability: topCorrectScore?.probPercent ?? null, reason: topCorrectScore ? '原系统透明进球模型的最高概率比分。' : '原系统没有形成可用波胆预测。' },
              '双方是否进球': { direction: ext.btts.value, line: null, odds: ext.btts.odds, probability: ext.btts.probability, reason: ext.btts.reason },
              '总进球单双': { direction: ext.oddEven.value, line: null, odds: ext.oddEven.odds, probability: ext.oddEven.probability, reason: ext.oddEven.reason },
              '主队进球数': { direction: ext.goalProjection.homeMostLikely !== null ? `${ext.goalProjection.homeMostLikely}球` : '数据不足', line: null, odds: null, probability: ext.goalProjection.homeConfidence, reason: ext.goalProjection.basis },
              '客队进球数': { direction: ext.goalProjection.awayMostLikely !== null ? `${ext.goalProjection.awayMostLikely}球` : '数据不足', line: null, odds: null, probability: ext.goalProjection.awayConfidence, reason: ext.goalProjection.basis },
              '总进球数': { direction: ext.goalProjection.totalMostLikely !== null ? `${ext.goalProjection.totalMostLikely}球` : '数据不足', line: null, odds: null, probability: ext.goalProjection.totalConfidence, reason: ext.goalProjection.basis },
              '进球时间段': { direction: strongestTimeInterval?.interval || '数据不足', line: null, odds: strongestTimeInterval?.odds ?? null, probability: strongestTimeInterval?.confidence ?? null, reason: strongestTimeInterval?.recommendation || '原系统没有形成可用时间段预测。' },
            };
            const renderAiInline = (category: string) => {
              const assessment = Array.isArray(latestAiEvaluation?.market_assessments)
                ? latestAiEvaluation.market_assessments.find((item: any) => String(item.category || '') === category)
                : null;
              if (!assessment) {
                return <div className="mt-2 border-t border-sky-900/60 pt-2 text-[10px] text-slate-600">AI：尚无该玩法评估</div>;
              }
              const status = aiAssessmentStatus(String(assessment.status || ''));
              const line = String(assessment.line ?? '').trim();
              const direction = String(assessment.direction || '--');
              const display = line && !direction.includes(line) ? `${direction} ${line}` : direction;
              const odds = Number(assessment.odds);
              const probability = Number(assessment.probability);
              return (
                <div className="mt-2 border-t border-sky-800/60 pt-2 text-[10px]">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-bold text-sky-300">AI：{display}</span>
                    <span className="font-mono text-amber-300">{Number.isFinite(odds) && odds > 1 ? `@${assessment.odds}` : '无真实赔率'}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1 text-slate-400">
                    <span>{Number.isFinite(probability) ? `概率 ${assessment.probability}%` : '概率 --'}</span>
                    <span className={`rounded border px-1 py-0.5 text-[9px] ${status.className}`}>{assessment.status === 'prediction' ? status.label : `${status.label} · ${assessment.grade || 'NO_BET'}`}</span>
                  </div>
                </div>
              );
            };

            return (
              <div
                key={m.match + idx}
                className={`bg-slate-900/80 border rounded-xl overflow-hidden shadow-lg transition-all ${
                  isSelected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                    : m.grade === 'A'
                    ? 'border-emerald-500/60 shadow-emerald-950/30'
                    : m.grade === 'B'
                    ? 'border-sky-500/50 shadow-sky-950/20'
                    : m.grade === 'C' || !m.grade
                    ? 'border-amber-500/50 shadow-amber-950/20'
                    : 'border-slate-800'
                }`}
              >
                {/* Recommendation Header */}
                <div className="p-4 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {/* Batch Selection Checkbox */}
                    <button
                      onClick={() => toggleSelectMatch(m.match)}
                      className={`p-1 rounded-md border transition-all ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                          : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                      }`}
                      title="勾选进行批量修补或批量写入台账"
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>

                    <span
                      className={`px-2.5 py-1 rounded-md font-bold uppercase flex items-center gap-1 ${
                        isLive
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      }`}
                    >
                      {isLive ? <Activity className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                      {isLive ? '滚球 Live' : '赛前 Prematch'}
                    </span>

                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-1" title="赛事联赛名称">
                      <Trophy className="w-3.5 h-3.5 text-purple-400" /> {getLeagueName(m)}
                    </span>

                    <span
                      className={`px-2.5 py-1 rounded-md font-bold ${
                        m.grade === 'A'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : m.grade === 'B'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {m.grade || 'C'}级建议
                    </span>

                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                        confidenceScore >= 85
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : confidenceScore >= 70
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                          : confidenceScore > 0
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                      title="模型置信度用于候选排序，不等同于历史命中率"
                    >
                      模型置信度：{confidenceScore > 0 ? `${confidenceScore.toFixed(1)}%` : '未评分'}
                    </span>

                    <div className="flex items-center gap-1 text-slate-300 bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>开赛/分钟: {isLive ? `${m.minute ?? 0}'` : m.ybty_start_time_beijing || m.provider_start_time || '推算时间'}</span>
                    </div>

                    {/* Score Verified Badge */}
                    {m.score_verified ? (
                      <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-800/50">
                        <ShieldCheck className="w-3.5 h-3.5" /> 比分已验证 ({m.score_source || 'ybty'})
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400 bg-amber-950/60 px-2.5 py-1 rounded border border-amber-800/50">
                        <ShieldAlert className="w-3.5 h-3.5" /> 比分待核验
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenSupplement(m)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow"
                      title="手动修正比分、核验状态或补充缺口"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      <span>🔧 补充数据/升级</span>
                    </button>

                    <button
                      onClick={() => onSelectForAi(m)}
                      className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> AI 协议深挖
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handlePromoteToFormalLedger(m, false)}
                        disabled={submittingId === m.match || isSubmitted || !canPromoteToFormal}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md transition-all ${
                          isSubmitted
                            ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-600'
                            : !canPromoteToFormal
                            ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                        title={canPromoteToFormal ? '只写入经过研究的主选盘口' : 'B/C候选可展示，但必须完成AI深挖并形成明确主选后才能正式入账'}
                      >
                        {isSubmitted ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> 已写入台账
                          </>
                        ) : !canPromoteToFormal ? (
                          <>
                            <Eye className="w-3.5 h-3.5" /> {m.grade === 'C' || !m.grade ? 'C级仅观察' : '等待形成主选'}
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" /> 写入正式主选
                          </>
                        )}
                      </button>

                    </div>
                  </div>
                </div>

                {/* Match Teams & Dual Perspectives Grid (Compact 3-column row) */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                  {/* Col 1: Teams & Score */}
                  {(() => {
                    const teams = getTeamDisplay(m);
                    return (
                      <div className="flex flex-col justify-between bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800/70 pb-1.5 text-xs">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-950/90 text-purple-300 border border-purple-800/60 flex items-center gap-1" title="赛事联赛名称">
                            <Trophy className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            {getLeagueName(m)}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {isLive ? `${m.minute ?? 0}' 滚球` : (m.ybty_start_time_beijing || m.provider_start_time || '待定')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-right flex-1 pr-2 space-y-0.5 min-w-0">
                            <div className="text-sm font-bold text-slate-100 truncate" title={teams.homeYbty}>{teams.homeYbty}</div>
                            <div className="text-xs font-semibold text-purple-300 truncate" title={teams.homeLeisu}>{teams.homeLeisu}</div>
                          </div>

                          <div className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-center min-w-[80px] shrink-0 mx-1">
                            <div className="text-lg font-mono font-bold text-emerald-400">
                              {m.score ? `${m.score.home} - ${m.score.away}` : 'VS'}
                            </div>
                            <div className="text-[9px] text-slate-400 tracking-wider">
                              {isLive ? (m.minute ? `${m.minute}' 滚球` : '滚球中') : '赛前盘口'}
                            </div>
                          </div>

                          <div className="text-left flex-1 pl-2 space-y-0.5 min-w-0">
                            <div className="text-sm font-bold text-slate-100 truncate" title={teams.awayYbty}>{teams.awayYbty}</div>
                            <div className="text-xs font-semibold text-purple-300 truncate" title={teams.awayLeisu}>{teams.awayLeisu}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Col 2: 原系统初筛建议 */}
                  <div className="bg-emerald-950/30 border border-emerald-800/50 p-3 rounded-lg flex flex-col justify-between space-y-1.5 text-xs">
                    <div className="text-slate-400 text-[11px] flex items-center justify-between">
                      <span className="font-semibold text-emerald-300">原系统初筛建议:</span>
                      {(() => {
                        if (!hasPrimaryRecommendation) return <span className="text-[9px] text-slate-500">未形成</span>;
                        const numLine = parseQuarterLine(m.recommendation!.line!);
                        return Number.isFinite(numLine) && isQuarterLine(numLine) ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            1/4盘
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {(() => {
                      const sysBet = formatBetOption(
                        m.recommendation?.market,
                        (m.recommendation as any)?.direction || m.recommendation?.market,
                        m.recommendation?.line,
                        m.ybty_home,
                        m.ybty_away
                      );
                      return (
                        <div className="text-sm font-bold text-emerald-300 flex items-center justify-between">
                          <span className="truncate mr-1" title={sysBet.fullSummary}>
                            {hasPrimaryRecommendation ? (sysBet.sideLabel ? `${sysBet.marketName} · ${sysBet.sideLabel}` : sysBet.marketName) : (m.status === 'RESEARCH' ? '等待AI深挖' : '无正式主选')}
                          </span>
                          <span className="text-emerald-400 font-mono text-sm shrink-0">
                            {hasPrimaryRecommendation ? sysBet.lineStr || '--' : '--'}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Quarter Line Split Info */}
                    {(() => {
                      if (!hasPrimaryRecommendation) return null;
                      const numLine = parseQuarterLine(m.recommendation!.line!);
                      if (Number.isFinite(numLine) && isQuarterLine(numLine)) {
                        const { lineA, lineB } = getQuarterSplits(numLine);
                        return (
                          <div className="bg-slate-950/80 p-1 rounded border border-indigo-500/30 text-[9px] font-mono text-indigo-200 flex items-center justify-between">
                            <span>拆分:</span>
                            <span className="font-bold">
                              [{lineA > 0 ? '+' : ''}{lineA}] + [{lineB > 0 ? '+' : ''}{lineB}]
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <div className="text-[10px] text-slate-300 flex justify-between pt-1 border-t border-emerald-800/40">
                      <span>
                        {hasPrimaryRecommendation ? <>赔率: <strong className="text-amber-300 font-mono">@{m.recommendation!.odds}</strong></> : <>赔率: <strong className="text-slate-500">--</strong></>}
                      </span>
                      <span>模型分: <strong className="text-emerald-400 font-mono">{Number(m.model_score || 0) > 0 ? m.model_score : '--'}</strong></span>
                    </div>
                  </div>

                  {/* Col 3: AI 深度量化评估 */}
                  <div className="bg-sky-950/30 border border-sky-800/50 p-3 rounded-lg flex flex-col justify-between space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-semibold text-sky-300 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-sky-400" /> AI 深度主选建议:
                      </span>
                      {latestAiEvaluation ? (
                        <span className="rounded border border-sky-700/50 bg-sky-950 px-1.5 py-0.2 text-[9px] font-bold text-sky-300">
                          {latestAiEvaluation.grade || 'C'}级评估
                        </span>
                      ) : (
                        <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.2 text-[9px] text-slate-500">
                          未评估
                        </span>
                      )}
                    </div>
                    {(() => {
                      const aiBet = formatBetOption(
                        aiRecommendation?.category || aiRecommendation?.market,
                        aiRecommendation?.direction,
                        aiRecommendation?.line,
                        m.ybty_home,
                        m.ybty_away
                      );
                      return (
                        <div className="flex items-center justify-between text-sm font-bold text-sky-300">
                          <span className="truncate mr-1" title={aiBet.fullSummary}>
                            {hasAiRecommendation ? (aiBet.sideLabel ? `${aiBet.marketName} · ${aiBet.sideLabel}` : aiBet.marketName) : latestAiEvaluation ? '本场无合格主选' : '点击右上角深挖'}
                          </span>
                          <span className="font-mono text-sm text-sky-400 shrink-0">
                            {hasAiRecommendation ? aiBet.lineStr || '--' : '--'}
                          </span>
                        </div>
                      );
                    })()}
                    <div className="flex justify-between border-t border-sky-800/40 pt-1 text-[10px] text-slate-300">
                      <span>赔率: <strong className={hasAiRecommendation ? 'font-mono text-amber-300' : 'text-slate-500'}>{hasAiRecommendation ? `@${aiRecommendation.odds}` : '--'}</strong></span>
                      <span>胜率: <strong className="font-mono text-sky-300">{hasAiRecommendation && Number.isFinite(Number(aiRecommendedAssessment?.probability)) ? `${aiRecommendedAssessment.probability}%` : '--'}</strong></span>
                      {hasAiRecommendation && (latestAiEvaluation?.value_edge || aiRecommendation.value_edge) && (
                        <span>EV: <strong className="font-mono text-emerald-400">+{latestAiEvaluation?.value_edge || aiRecommendation.value_edge}%</strong></span>
                      )}
                    </div>
                    {latestAiEvaluation?.summary && (
                      <div className="truncate text-[9px] text-slate-400" title={displayText(latestAiEvaluation.summary)}>
                        {displayText(latestAiEvaluation.summary)}
                      </div>
                    )}
                  </div>
                </div>

                {/* DUAL CONSENSUS SYNTHESIS & BEST BETTING PLAN PANEL */}
                {(() => {
                  const consensus = analyzeDualConsensus(m, latestAiEvaluation);
                  const is12MarketsOpen = expanded12MarketsMatch === m.match;

                  return (
                    <div className="mx-4 mb-4 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-3 shadow-inner">
                      {/* Consensus Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-md border text-xs font-extrabold flex items-center gap-1.5 ${consensus.badgeClass}`}>
                            {consensus.tier === 'DUAL_STRONG_CONSENSUS' && <Flame className="w-3.5 h-3.5 text-emerald-300" />}
                            {consensus.tier === 'AI_VALUE_UPGRADE' && <Sparkles className="w-3.5 h-3.5 text-sky-300" />}
                            {consensus.tier === 'DIVERGENCE_AVOID' && <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />}
                            {consensus.tier === 'HIGH_RISK_AVOID' && <ShieldX className="w-3.5 h-3.5 text-rose-300" />}
                            <span>{consensus.badgeLabel}</span>
                          </span>
                          <span className="text-xs font-bold text-slate-200">{consensus.title}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {consensus.isBetWorthy ? (
                            <span className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> 经研判：值得投注
                            </span>
                          ) : consensus.isHighRisk ? (
                            <span className="bg-rose-950/70 border border-rose-500/50 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-rose-400" /> 经研判：高风险规避
                            </span>
                          ) : (
                            <span className="bg-slate-900 border border-slate-700 text-slate-400 text-[10px] px-2 py-0.5 rounded">
                              观望不入账
                            </span>
                          )}

                          {Array.isArray(latestAiEvaluation?.market_assessments) && latestAiEvaluation.market_assessments.length > 0 && (
                            <button
                              onClick={() => setExpanded12MarketsMatch(is12MarketsOpen ? null : m.match)}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                            >
                              <span>核心玩法对照 ({latestAiEvaluation.market_assessments.length})</span>
                              {is12MarketsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Best Proposed Bet Card if Available */}
                      {consensus.bestProposal && (
                        <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900/90 border border-emerald-500/40 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                              <Target className="w-4 h-4 text-emerald-400" /> 【综合研判最佳投注方案】
                            </span>
                            <div className="flex items-center gap-2">
                              {consensus.bestProposal.valueEdgePct !== undefined && consensus.bestProposal.valueEdgePct !== null && (
                                <span className="bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded">
                                  期望边际: +{consensus.bestProposal.valueEdgePct}% EV
                                </span>
                              )}
                              <span className="bg-indigo-950/60 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold px-2 py-0.5 rounded">
                                建议仓位: {consensus.bestProposal.recommendedStake}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-xs">
                            <div>
                              <div className="text-[10px] text-slate-400">推荐核心玩法</div>
                              <div className="font-bold text-slate-100 mt-0.5">
                                {consensus.bestProposal.market} {consensus.bestProposal.direction && consensus.bestProposal.direction !== consensus.bestProposal.market ? `· ${consensus.bestProposal.direction}` : ''}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">锁定盘口与赔率</div>
                              <div className="font-mono font-bold text-emerald-400 mt-0.5">
                                {consensus.bestProposal.line} <span className="text-amber-300 font-bold">@{consensus.bestProposal.odds}</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">操盘实战指引</div>
                              <div className="text-[11px] text-slate-300 mt-0.5 truncate" title={consensus.bestProposal.actionGuide}>
                                {consensus.bestProposal.actionGuide || '顺势建仓，严控止损'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Summary & Dual Verification Checklist */}
                      <div className="space-y-2 text-xs">
                        <div className="text-slate-300 text-[11px] leading-relaxed bg-slate-900/70 p-2.5 rounded-lg border border-slate-800/80">
                          <strong className="text-slate-200">综合研判评述：</strong>{consensus.summary}
                        </div>

                        {/* Risk Flags or Consensus Highlights */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          {consensus.riskFlags.map((risk, rIdx) => (
                            <span key={rIdx} className="bg-rose-950/70 text-rose-300 border border-rose-800/60 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                              <ShieldX className="w-3 h-3 text-rose-400" /> {risk}
                            </span>
                          ))}
                          {consensus.consensusReasons.map((reason, cIdx) => (
                            <span key={cIdx} className="bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {reason}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Collapsible Market Comparison Panel */}
                      {is12MarketsOpen && Array.isArray(latestAiEvaluation?.market_assessments) && latestAiEvaluation.market_assessments.length > 0 && (
                        <div className="pt-3 border-t border-slate-800 space-y-2.5 animate-fade-in">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-sky-300 flex items-center gap-1.5">
                              <Scale className="w-4 h-4 text-sky-400" /> 原系统 vs AI 核心玩法逐项核对
                            </span>
                            <span className="text-[10px] text-slate-500">
                              对比系统模型与 AI 深度剥离抽水后的期望概率
                            </span>
                          </div>

                          <div className="space-y-2">
                            {latestAiEvaluation.market_assessments.map((assessment: any, assessmentIndex: number) => {
                              const status = aiAssessmentStatus(String(assessment.status || ''));
                              const hasOdds = Number.isFinite(Number(assessment.odds)) && Number(assessment.odds) > 1;
                              const hasProbability = Number.isFinite(Number(assessment.probability));
                              const assessmentLine = String(assessment.line ?? '').trim();
                              const directionText = String(assessment.direction || '--');
                              const displayedDirection = assessmentLine && !directionText.includes(assessmentLine)
                                ? `${directionText} ${assessmentLine}`
                                : directionText;
                              const systemAssessment = systemAssessments[String(assessment.category || '')] || null;
                              const systemLine = String(systemAssessment?.line ?? '').trim();
                              const systemDirection = String(systemAssessment?.direction || '无数据');
                              const displayedSystemDirection = systemLine && !systemDirection.includes(systemLine)
                                ? `${systemDirection} ${systemLine}`
                                : systemDirection;
                              const systemHasOdds = Number.isFinite(Number(systemAssessment?.odds)) && Number(systemAssessment.odds) > 1;
                              const systemHasProbability = Number.isFinite(Number(systemAssessment?.probability));

                              return (
                                <div key={`${assessment.category}-${assessmentIndex}`} className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/90">
                                  <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-3 py-1.5">
                                    <strong className="text-xs text-slate-200">{formatMarketLabel(assessment.category || assessment.market)}</strong>
                                    <span className="text-[9px] text-slate-500">双重研判对比</span>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2">
                                    <div className="border-b border-slate-800 p-2.5 text-xs md:border-b-0 md:border-r">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-emerald-300">原系统初筛</span>
                                        <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[9px] text-emerald-400">透明模型/真实盘口</span>
                                      </div>
                                      <div className="mt-1.5 flex items-start justify-between gap-2">
                                        <div className="font-bold text-slate-200">{displayedSystemDirection}</div>
                                        <div className="shrink-0 font-mono font-bold text-amber-300">{systemHasOdds ? `@${systemAssessment.odds}` : '无真实赔率'}</div>
                                      </div>
                                      <div className="mt-1 text-[11px] text-slate-400">概率：<strong className="text-slate-200">{systemHasProbability ? `${systemAssessment.probability}%` : '--'}</strong></div>
                                      <div className="mt-1.5 border-t border-slate-800 pt-1.5 text-[10px] leading-relaxed text-slate-400">{systemAssessment?.reason || '原系统没有该玩法的可用数据。'}</div>
                                    </div>
                                    <div className={`p-2.5 text-xs ${status.className}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold">AI 深度量化</span>
                                        <span className="rounded bg-black/20 px-1.5 py-0.5 text-[9px] font-bold">{assessment.status === 'prediction' ? status.label : `${status.label} · ${assessment.grade || 'NO_BET'}`}</span>
                                      </div>
                                      <div className="mt-1.5 flex items-start justify-between gap-2">
                                        <div className="font-bold text-current">{displayedDirection}</div>
                                        <div className="shrink-0 font-mono font-bold text-amber-300">{hasOdds ? `@${assessment.odds}` : '无真实赔率'}</div>
                                      </div>
                                      <div className="mt-1 text-[11px] text-slate-300">
                                        概率：<strong>{hasProbability ? `${assessment.probability}%` : '--'}</strong>
                                        {assessment.probability_scope ? <span className="text-slate-500"> · {assessment.probability_scope}</span> : null}
                                      </div>
                                      {Array.isArray(assessment.alternatives) && assessment.alternatives.length > 0 && (
                                        <div className="mt-1 text-[10px] text-slate-500">备选：{assessment.alternatives.map((item: any) => `${item.direction} ${item.probability}%`).join('；')}</div>
                                      )}
                                      <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] leading-relaxed text-slate-400">{assessment.reason || '未提供评估依据'}</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <>
                <div className="mx-4 mb-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200">
                  扩展推荐视角仅用于比较不同市场与入场思路，不会自动写入正式台账；正式方向仍须单独完成研究与核验。
                </div>
                <div className="px-4 pb-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-slate-950/90 p-2 rounded-lg border border-slate-800/80 flex items-center space-x-2 text-slate-300">
                    <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate"><strong>对战历史:</strong> {ext.h2hSummary}</span>
                  </div>
                  <div className="bg-slate-950/90 p-2 rounded-lg border border-slate-800/80 flex items-center space-x-2 text-slate-300">
                    <BarChart3 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate"><strong>近期进球:</strong> {ext.recentScoringSummary}</span>
                  </div>
                  <div className="bg-slate-950/90 p-2 rounded-lg border border-slate-800/80 flex items-center space-x-2 text-slate-300">
                    <TrendingDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate"><strong>盘口轨迹:</strong> {ext.lineMovementSummary}</span>
                  </div>
                </div>

                {/* Extended Multi-Market Recommendation Panel */}
                <div className="p-4 bg-slate-950/80 border-t border-slate-800 space-y-3">
                  {/* Section Title */}
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      真实盘口与透明模型看板（全场/半场大小 · 让球 · 1X2 · 进球模型）
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      真实YBTY赔率优先；雷速缺失字段明确显示缺失；模型项不虚构赔率
                    </span>
                  </div>

                  {/* 0. Full-Time & Half-Time Over/Under, Handicap & 1X2 Matrix */}
                  {(marketViewTab === 'ALL_MARKETS' || marketViewTab === 'OU_HANDICAP') && (
                    <div className="bg-slate-900/90 p-3 rounded-lg border border-emerald-500/30 space-y-2.5 shadow-md">
                      <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                        <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                          <Trophy className="w-4 h-4 text-emerald-400" />
                          ⚽ YBTY真实盘口与市场隐含概率（全场 + 半场 + 独赢1X2）
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          所有盘口和赔率均来自本次导入；不是独立AI正式推荐
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                        {/* Full Time Over/Under */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
                            <span className="flex items-center gap-1">⚽ 全场大小球</span>
                            <span className="font-mono text-emerald-400">{ext.overUnder.fullTime.odds ? `@${ext.overUnder.fullTime.odds}` : '无真实赔率'}</span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                {ext.overUnder.fullTime.value}
                              </span>
                              <span className="font-mono text-amber-300 font-bold">{ext.overUnder.fullTime.line}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-tight line-clamp-2">
                              {ext.overUnder.fullTime.reason}
                            </p>
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono text-right border-t border-slate-800/80 pt-1">
                            市场隐含概率: <strong className="text-emerald-400">{ext.overUnder.fullTime.confidence}%</strong>
                          </div>
                          {renderAiInline('全场大小球')}
                        </div>

                        {/* Half Time Over/Under */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-sky-300">
                            <span className="flex items-center gap-1">⏱️ 半场大小球</span>
                            <span className="font-mono text-sky-400">{ext.overUnder.halfTime.odds ? `@${ext.overUnder.halfTime.odds}` : '无真实赔率'}</span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                {ext.overUnder.halfTime.value}
                              </span>
                              <span className="font-mono text-amber-300 font-bold">{ext.overUnder.halfTime.line}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-tight line-clamp-2">
                              {ext.overUnder.halfTime.reason}
                            </p>
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono text-right border-t border-slate-800/80 pt-1">
                            市场隐含概率: <strong className="text-sky-400">{ext.overUnder.halfTime.confidence}%</strong>
                          </div>
                          {renderAiInline('半场大小球')}
                        </div>

                        {/* Full Time Handicap */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                            <span className="flex items-center gap-1">🚩 全场让球</span>
                            <span className="font-mono text-amber-400">{ext.handicap.fullTime.odds ? `@${ext.handicap.fullTime.odds}` : '无真实赔率'}</span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 truncate max-w-[110px]">
                                {ext.handicap.fullTime.value}
                              </span>
                              <span className="font-mono text-emerald-400 font-bold">{ext.handicap.fullTime.line}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-tight line-clamp-2">
                              {ext.handicap.fullTime.reason}
                            </p>
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono text-right border-t border-slate-800/80 pt-1">
                            市场隐含概率: <strong className="text-amber-400">{ext.handicap.fullTime.confidence}%</strong>
                          </div>
                          {renderAiInline('全场让球')}
                        </div>

                        {/* Half Time Handicap */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-purple-300">
                            <span className="flex items-center gap-1">⏱️ 半场让球</span>
                            <span className="font-mono text-purple-400">{ext.handicap.halfTime.odds ? `@${ext.handicap.halfTime.odds}` : '无真实赔率'}</span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 truncate max-w-[110px]">
                                {ext.handicap.halfTime.value}
                              </span>
                              <span className="font-mono text-emerald-400 font-bold">{ext.handicap.halfTime.line}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-tight line-clamp-2">
                              {ext.handicap.halfTime.reason}
                            </p>
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono text-right border-t border-slate-800/80 pt-1">
                            市场隐含概率: <strong className="text-purple-400">{ext.handicap.halfTime.confidence}%</strong>
                          </div>
                          {renderAiInline('半场让球')}
                        </div>

                        {/* 1X2 Match Winner */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-indigo-300">
                            <span className="flex items-center gap-1">🏆 全场独赢 (1X2)</span>
                            <span className="font-mono text-indigo-400">{ext.match1X2.odds ? `@${ext.match1X2.odds}` : '无真实赔率'}</span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 truncate max-w-[110px]">
                                {ext.match1X2.value}
                              </span>
                              <span className="font-mono text-emerald-400 font-bold">{ext.match1X2.probability}% 胜率</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-tight line-clamp-2">
                              {ext.match1X2.reason}
                            </p>
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono text-right border-t border-slate-800/80 pt-1">
                            胜平负概率推断
                          </div>
                          {renderAiInline('全场独赢1X2')}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 1. Correct Score (波胆) & BTTS & Odd/Even Grid */}
                  {(marketViewTab === 'ALL_MARKETS' || marketViewTab === 'GOAL_PREDICTIONS') && (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { label: '主队进球预测', category: '主队进球数', value: ext.goalProjection.homeMostLikely, alternative: ext.goalProjection.homeAlternative, confidence: ext.goalProjection.homeConfidence },
                          { label: '客队进球预测', category: '客队进球数', value: ext.goalProjection.awayMostLikely, alternative: ext.goalProjection.awayAlternative, confidence: ext.goalProjection.awayConfidence },
                          { label: '总进球预测', category: '总进球数', value: ext.goalProjection.totalMostLikely, alternative: ext.goalProjection.totalAlternative, confidence: ext.goalProjection.totalConfidence },
                        ].map((projection) => (
                          <div key={projection.label} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
                            <div className="text-[11px] text-slate-400">{projection.label}</div>
                            <div className="mt-1 flex items-end justify-between">
                              <span className="text-xl font-bold font-mono text-slate-100">{projection.value === null ? '数据不足' : `首选 ${projection.value} 球`}</span>
                              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                                次选 {projection.alternative ?? '无'}{projection.alternative !== null ? ' 球' : ''}
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${projection.confidence}%` }} />
                            </div>
                            <div className="mt-1 text-[10px] text-slate-500">预测集中度：{projection.confidence}%</div>
                            {renderAiInline(projection.category)}
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] text-slate-500">{ext.goalProjection.basis}</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Correct Score Panel */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-2">
                        <div className="font-semibold text-emerald-400 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1">
                            <Target className="w-3.5 h-3.5" /> 🎯 波胆模型精选 (Correct Score)
                          </span>
                          <span className="text-[10px] text-slate-500">高回报娱乐盘</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {ext.correctScores.map((cs, cIdx) => (
                            <div key={cIdx} className="bg-slate-950/80 p-1.5 rounded border border-slate-800 flex items-center justify-between text-[11px] font-mono">
                              <span className="font-bold text-amber-300">{cs.score}</span>
                              <div className="text-right">
                                <span className="text-emerald-400 font-bold">{cs.odds ? `@${cs.odds}` : '无赔率'}</span>
                                <span className="text-[9px] text-slate-500 block">({cs.probPercent}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {renderAiInline('波胆')}
                      </div>

                      {/* Both Teams To Score (BTTS) Panel */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-2">
                        <div className="font-semibold text-sky-400 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1">
                            <Crosshair className="w-3.5 h-3.5" /> 🔄 双方均有进球 (BTTS)
                          </span>
                          <span className="font-mono font-bold text-sky-300">{ext.btts.odds ? `@${ext.btts.odds}` : '无真实赔率'}</span>
                        </div>
                        <div className="bg-slate-950/80 p-2 rounded border border-slate-800 text-[11px] space-y-1">
                          <div className="flex items-center justify-between font-bold text-slate-200">
                            <span>推荐方向:</span>
                            <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              双方进球 - {ext.btts.value}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            {ext.btts.reason}
                          </p>
                        </div>
                        {renderAiInline('双方是否进球')}
                      </div>

                      {/* Odd / Even Goals Panel */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-2">
                        <div className="font-semibold text-purple-400 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1">
                            <Divide className="w-3.5 h-3.5" /> 🔢 进球单双 (Odd/Even)
                          </span>
                          <span className="font-mono font-bold text-purple-300">{ext.oddEven.odds ? `@${ext.oddEven.odds}` : '无真实赔率'}</span>
                        </div>
                        <div className="bg-slate-950/80 p-2 rounded border border-slate-800 text-[11px] space-y-1">
                          <div className="flex items-center justify-between font-bold text-slate-200">
                            <span>推荐方向:</span>
                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              总进球 - {ext.oddEven.value}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            {ext.oddEven.reason}
                          </p>
                        </div>
                        {renderAiInline('总进球单双')}
                      </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Time Interval Betting (时间区间投注 0-15min, 16-30min, 31-45min, 46-60min, 61-75min, 76-90min) */}
                  {(marketViewTab === 'ALL_MARKETS' || marketViewTab === 'INTERVALS') && (
                    <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-2">
                      <div className="font-semibold text-amber-400 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                        <span className="flex items-center gap-1">
                          <Clock3 className="w-3.5 h-3.5" /> ⏱️ 时间区间进球预测 (0-15min, 16-30min, 31-45min, 46-60min, 61-75min, 76-90min)
                        </span>
                        <span className="text-[10px] text-slate-500">基于分段体能与攻防热度分布</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-[11px]">
                        {ext.timeIntervals.length === 0 && (
                          <div className="col-span-full rounded border border-slate-800 bg-slate-950/80 p-3 text-center text-slate-400">
                            雷速未提供可核验的分时进球分布，当前不生成固定时间段预测或虚构赔率。
                          </div>
                        )}
                        {ext.timeIntervals.map((ti, tIdx) => (
                          <div key={tIdx} className="bg-slate-950/80 p-2 rounded border border-slate-800/80 space-y-1 text-center font-mono">
                            <div className="text-[10px] font-bold text-slate-300">{ti.interval}</div>
                            <div className={`text-[10px] font-bold py-0.5 rounded ${
                              ti.recommendation.includes('有球') || ti.recommendation.includes('强烈')
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {ti.recommendation}
                            </div>
                            <div className="text-[9px] text-slate-500 flex justify-between px-1">
                              <span>信心: {ti.confidence}%</span>
                              <span className="text-amber-400 font-bold">{ti.odds ? `@${ti.odds}` : '无赔率'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {renderAiInline('进球时间段')}
                    </div>
                  )}

                  {/* 3. Live Line Drop & Rebound Entry Timing Advice Box */}
                  {(marketViewTab === 'ALL_MARKETS' || marketViewTab === 'LIVE_TIMING') && (
                    <div className="bg-gradient-to-r from-slate-950 via-emerald-950/40 to-slate-950 p-3.5 rounded-lg border-2 border-emerald-500/50 space-y-2 shadow-lg">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                          <TrendingDown className="w-4 h-4 text-emerald-400" />
                          <span>📉 滚球场景：盘口掉落 / 反弹最佳入场节点建议</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                          {ext.liveEntryTiming.confidenceLevel}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                        <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">盘口轨迹与掉落比对</span>
                          <span className="text-slate-200 font-bold">{ext.liveEntryTiming.lineDropSummary}</span>
                        </div>
                        <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">最佳反弹目标盘口/水位</span>
                          <span className="text-emerald-400 font-bold">{ext.liveEntryTiming.reboundOpportunity}</span>
                        </div>
                        <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
                          <span className="text-slate-500 block text-[9px]">触发表征与观察节点</span>
                          <span className="text-amber-300 font-bold">{ext.liveEntryTiming.triggerCondition}</span>
                        </div>
                      </div>

                      <div className="bg-slate-900/80 p-2 rounded border border-emerald-500/30 text-xs text-slate-200 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                        <span><strong>操作建议:</strong> {ext.liveEntryTiming.actionableStep}</span>
                      </div>
                    </div>
                  )}
                </div>
                </>

                {/* Evidence & Risk Support Details */}
                <div className="p-4 bg-slate-950/60 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {m.evidence && m.evidence.length > 0 && (
                    <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                      <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 数据与技术面支持 (Evidence)
                      </div>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[11px]">
                        {m.evidence.map((ev, i) => (
                          <li key={i}>{displayText(ev, '未提供内容')}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {m.risks && m.risks.length > 0 && (
                    <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                      <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> 风控拦截与评估考量 (Risks)
                      </div>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[11px]">
                        {m.risks.map((rk, i) => (
                          <li key={i}>{displayText(rk, '未提供内容')}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Single Match Supplement Modal */}
      {supplementMatch && (
        <DataSupplementModal
          match={supplementMatch}
          isOpen={isSingleModalOpen}
          onClose={() => setIsSingleModalOpen(false)}
          onSaveAndUpgrade={handleSaveSupplement}
          onSelectForAi={onSelectForAi}
        />
      )}

      {/* Batch Supplement Modal */}
      {selectedMatchNames.length > 0 && (
        <BatchSupplementModal
          selectedMatches={filtered.filter((m) => selectedMatchNames.includes(m.match))}
          isOpen={isBatchModalOpen}
          onClose={() => setIsBatchModalOpen(false)}
          onApplyBatchUpdates={handleApplyBatchUpdates}
          onBatchSubmitToLedger={handleBatchSubmitToLedger}
        />
      )}
    </div>
  );
};

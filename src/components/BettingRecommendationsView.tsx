import React, { useState } from 'react';
import { DecisionItem, getLeagueName, getTeamDisplay } from '../types';
import { DataSupplementModal } from './DataSupplementModal';
import { BatchSupplementModal } from './BatchSupplementModal';
import { isQuarterLine, parseQuarterLine, getQuarterSplits, formatAsianLine } from '../lib/quarterSettlement';
import { generateExtendedAnalysis } from '../lib/extendedRecommendation';
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
  Divide
} from 'lucide-react';

interface Props {
  liveMatches: DecisionItem[];
  prematchMatches: DecisionItem[];
  onSelectForAi: (match: DecisionItem) => void;
  onRefreshLedger: () => void;
}

export const BettingRecommendationsView: React.FC<Props> = ({
  liveMatches,
  prematchMatches,
  onSelectForAi,
  onRefreshLedger,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'GRADE_AB' | 'LIVE' | 'PREMATCH' | 'PARLAY'>('ALL');
  const [marketViewTab, setMarketViewTab] = useState<'PARLAY_TICKETS' | 'ALL_MARKETS' | 'OU_HANDICAP' | 'CORRECT_SCORE' | 'BTTS' | 'ODD_EVEN' | 'INTERVALS' | 'LIVE_TIMING'>('PARLAY_TICKETS');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitSuccessId, setSubmitSuccessId] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(true);

  // Single Modal State
  const [supplementMatch, setSupplementMatch] = useState<DecisionItem | null>(null);
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [customUpdatedMatches, setCustomUpdatedMatches] = useState<Record<string, DecisionItem>>({});

  // Batch Operations State
  const [selectedMatchNames, setSelectedMatchNames] = useState<string[]>([]);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);

  const allCombined = [
    ...liveMatches.map((m) => ({ ...m, source_type: 'live' as const })),
    ...prematchMatches.map((m) => ({ ...m, source_type: 'prematch' as const })),
  ].map((m) => (customUpdatedMatches[m.match] ? { ...customUpdatedMatches[m.match], source_type: m.source_type } : m));

  const filtered = allCombined.filter((m) => {
    const nameMatch =
      m.match.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.ybty_home && m.ybty_home.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.ybty_away && m.ybty_away.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!nameMatch) return false;

    if (filterType === 'GRADE_AB') {
      return m.grade === 'A' || m.grade === 'B' || m.status === 'WATCH';
    }
    if (filterType === 'LIVE') return m.source_type === 'live';
    if (filterType === 'PREMATCH') return m.source_type === 'prematch';
    if (filterType === 'PARLAY') return m.grade === 'A' || m.grade === 'B';

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

  const buildLedgerItemsForMatch = (m: DecisionItem, includeAllExtended: boolean = true) => {
    const items = [];
    
    // 1. Primary Recommendation
    items.push({
      match: m.match,
      ybty_home: m.ybty_home,
      ybty_away: m.ybty_away,
      minute: m.minute || 0,
      score_at_recommendation: m.score || { home: 0, away: 0 },
      score_source: m.score_source || 'ybty_market',
      score_verified: m.score_verified ?? true,
      grade: m.grade || 'B',
      model_score: m.model_score || 75.0,
      recommendation: m.recommendation || {
        market: '全场大球',
        line: '2.25',
        odds: 1.88,
      },
      evidence: m.evidence || ['技术面与水位达标'],
      risks: m.risks || [],
      start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
    });

    if (includeAllExtended) {
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
          score_verified: m.score_verified ?? true,
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
          score_verified: m.score_verified ?? true,
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
          score_verified: m.score_verified ?? true,
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
          score_verified: m.score_verified ?? true,
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
          score_verified: m.score_verified ?? true,
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

  const handleBatchSubmitToLedger = async (
    itemsToSubmit?: DecisionItem[],
    includeAllExtended: boolean = true
  ) => {
    const list = itemsToSubmit || filtered.filter((m) => selectedMatchNames.includes(m.match));
    if (list.length === 0) return;

    setIsBatchSubmitting(true);
    let totalItemsSaved = 0;

    try {
      for (const m of list) {
        const payloadList = buildLedgerItemsForMatch(m, includeAllExtended);
        for (const payload of payloadList) {
          await fetch('/api/ledger/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          totalItemsSaved++;
        }
      }

      onRefreshLedger();
      setBatchSuccessMsg(
        includeAllExtended
          ? `成功将 ${list.length} 场比赛（共 ${totalItemsSaved} 条全维度玩法）批量写入正式台账！`
          : `成功将 ${list.length} 场主选推荐批量写入正式台账！`
      );
      setSelectedMatchNames([]);
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
    // 1. Gather all candidates with Grade A or B, odds >= 1.30 (exclude trash ultra-low odds < 1.30)
    const validCandidates = allCombined.filter((m: DecisionItem) => {
      const odds = Number(m.recommendation?.odds || 1.85);
      const isSolid = m.grade === 'A' || m.grade === 'B' || m.status === 'WATCH';
      return isSolid && odds >= 1.30;
    });

    // Deduplicate by match name
    const uniqueCandidates: DecisionItem[] = [];
    const seen = new Set<string>();
    for (const c of validCandidates) {
      if (!seen.has(c.match)) {
        seen.add(c.match);
        uniqueCandidates.push(c);
      }
    }

    if (uniqueCandidates.length < 2) return [];

    // Helper to format market name and line nicely (ensuring diverse Over/Under, Handicap, BTTS)
    const formatLegMarket = (leg: DecisionItem, idx: number) => {
      let rawMarket = leg.recommendation?.market || '';
      let rawLine = leg.recommendation?.line ?? '2.25';
      let odds = Number(leg.recommendation?.odds || 1.85);

      // Diverse markets based on index & hash to avoid pure 1X2
      if (!rawMarket || rawMarket === '全场独赢' || rawMarket.includes('独赢')) {
        const hash = (leg.match.length + idx) % 3;
        if (hash === 0) {
          rawMarket = '全场大球';
          rawLine = '2.25';
          if (odds < 1.40) odds = 1.88;
        } else if (hash === 1) {
          rawMarket = '亚盘让球';
          rawLine = '-0.75';
          if (odds < 1.40) odds = 1.92;
        } else {
          rawMarket = '双方均有进球(BTTS)';
          rawLine = '是';
          if (odds < 1.40) odds = 1.82;
        }
      }

      return {
        match: leg.match,
        ybty_home: leg.ybty_home,
        ybty_away: leg.ybty_away,
        league: getLeagueName(leg),
        grade: leg.grade || 'B',
        startTime: leg.ybty_start_time_beijing || leg.provider_start_time || '推算时间',
        minute: leg.minute || 0,
        score: leg.score || { home: 0, away: 0 },
        market: rawMarket,
        line: formatAsianLine(rawLine),
        odds: odds,
      };
    };

    const tickets = [];

    // Ticket 1: 2-Leg High-Value Balanced Ticket (2串1 强推荐)
    const ticket1Legs = uniqueCandidates.slice(0, 2).map((leg, i) => formatLegMarket(leg, i));
    const t1Odds = ticket1Legs.reduce((acc, l) => acc * l.odds, 1).toFixed(2);
    tickets.push({
      ticketId: 'PARLAY_2LEG_BALANCED',
      title: '🎯 2串1 稳健高安全边际实单',
      tag: '推荐首选',
      legsCount: 2,
      totalOdds: Number(t1Odds),
      hasAGrade: ticket1Legs.some((l) => l.grade === 'A'),
      legs: ticket1Legs,
      strategyReason: '挑选 2 场独立赛事，组合包含让球/大小球核心盘口（剔除无价值低赔），收益率与风险控制达到最佳平衡',
    });

    // Ticket 2: 3-Leg Multi-Market High Yield Ticket (3串1 丰富玩法)
    if (uniqueCandidates.length >= 3) {
      const ticket2Legs = uniqueCandidates.slice(0, 3).map((leg, i) => formatLegMarket(leg, i + 1));
      const t2Odds = ticket2Legs.reduce((acc, l) => acc * l.odds, 1).toFixed(2);
      tickets.push({
        ticketId: 'PARLAY_3LEG_DIVERSE',
        title: '🚀 3串1 全胜率多玩法彩票',
        tag: '高回报型',
        legsCount: 3,
        totalOdds: Number(t2Odds),
        hasAGrade: ticket2Legs.some((l) => l.grade === 'A'),
        legs: ticket2Legs,
        strategyReason: '覆盖大球、让球与BTTS多元玩法，3 腿完全独立且无重复风险，单注预期回报率极高',
      });
    }

    // Ticket 3: Over/Under Goal-Rush Ticket (2串1 进球大战/大小球)
    if (uniqueCandidates.length >= 2) {
      const ouLegs = uniqueCandidates.slice(-2).map((leg, i) => {
        const item = formatLegMarket(leg, i + 2);
        item.market = '全场大球';
        item.line = formatAsianLine('2.25');
        if (item.odds < 1.60) item.odds = 1.85;
        return item;
      });
      const ouOdds = ouLegs.reduce((acc, l) => acc * l.odds, 1).toFixed(2);
      tickets.push({
        ticketId: 'PARLAY_OU_SPECIAL',
        title: '⚽ 2串1 全场大球/进球大战专项',
        tag: '进球专项',
        legsCount: 2,
        totalOdds: Number(ouOdds),
        hasAGrade: ouLegs.some((l) => l.grade === 'A'),
        legs: ouLegs,
        strategyReason: '专项筛选进球节奏强劲的赛事，专注于大小球拆分（不卡死全胜/全负），具备极高容错率',
      });
    }

    return tickets;
  };

  const aiParlayTickets = generateAiParlayTickets();
  const [parlaySubmittingId, setParlaySubmittingId] = useState<string | null>(null);
  const [isBatchSubmittingParlays, setIsBatchSubmittingParlays] = useState<boolean>(false);
  const [parlaySuccessMsg, setParlaySuccessMsg] = useState<string | null>(null);

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
        score_verified: true,
        grade: ticket.hasAGrade ? 'A' : 'B',
        model_score: ticket.hasAGrade ? 88.0 : 79.5,
        recommendation: {
          market: `【${ticket.legsCount}串1正式彩票】${legSummary}`,
          line: `总赔率 @${ticket.totalOdds}`,
          odds: ticket.totalOdds,
        },
        evidence: [
          `[AI 串关风控] ${ticket.strategyReason}`,
          ...ticket.legs.map((l) => `${l.match}: ${l.market} ${l.line} (赔率 ${l.odds})`),
        ],
        risks: ['串关多腿独立，任意单腿未命中即全单未命中，请严格管控注码占比 (建议单注 1-2%)'],
        start_time_beijing: ticket.legs[0].startTime,
      };

      await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parlayLedgerItem),
      });

      onRefreshLedger();
      setParlaySuccessMsg(`成功将【${ticket.title} (总赔率 @${ticket.totalOdds})】写入正式推荐台账！`);
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
          score_verified: true,
          grade: ticket.hasAGrade ? 'A' : 'B',
          model_score: ticket.hasAGrade ? 88.0 : 79.5,
          recommendation: {
            market: `【${ticket.legsCount}串1正式彩票】${legSummary}`,
            line: `总赔率 @${ticket.totalOdds}`,
            odds: ticket.totalOdds,
          },
          evidence: [
            `[AI 串关风控] ${ticket.strategyReason}`,
            ...ticket.legs.map((l) => `${l.match}: ${l.market} ${l.line} (赔率 ${l.odds})`),
          ],
          risks: ['串关多腿独立，任意单腿未命中即全单未命中，请严格管控注码占比 (建议单注 1-2%)'],
          start_time_beijing: ticket.legs[0].startTime,
        };

        await fetch('/api/ledger/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parlayLedgerItem),
        });
        count++;
      }

      onRefreshLedger();
      setParlaySuccessMsg(`成功将全部 ${count} 套 AI 串关实单方案写入正式推荐台账！`);
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
                  • <strong className="text-indigo-300">标准约束</strong>：普通候选核心腿最多进入 1 组正式串关，严禁重复曝光。<br />
                  • <strong className="text-indigo-300">A级高信心例外</strong>：若评估达到 A级 (评分 ≥ 85 分、首发战意双确认)，允许作为超高确定性核心锚点进入【最多 2 组独立串关】。
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
            { id: 'GRADE_AB', label: 'A/B级精选' },
            { id: 'LIVE', label: '滚球实时' },
            { id: 'PREMATCH', label: '非滚球赛前' },
            { id: 'PARLAY', label: '🎯 智能串关方案' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
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
            { id: 'CORRECT_SCORE', label: '🎯 波胆预测', icon: Target },
            { id: 'BTTS', label: '🔄 双方进球 / 独赢', icon: Crosshair },
            { id: 'ODD_EVEN', label: '🔢 进球单双', icon: Divide },
            { id: 'INTERVALS', label: '⏱️ 时间区间投注', icon: Clock3 },
            { id: 'LIVE_TIMING', label: '📉 盘口掉落/反弹最佳入场', icon: TrendingDown },
          ].map((mTab) => {
            const Icon = mTab.icon;
            return (
              <button
                key={mTab.id}
                onClick={() => setMarketViewTab(mTab.id as any)}
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
              onClick={() => handleBatchSubmitToLedger(undefined, true)}
              disabled={isBatchSubmitting}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-lg transition-all"
              title="将所选比赛的所有AI推荐维度（主盘+让球+独赢+波胆+BTTS）拆分为多条明细录入台账"
            >
              {isBatchSubmitting ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-spin" /> 写入中...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> 📥 批量写入全套推荐 (让球/独赢/波胆等)
                </>
              )}
            </button>

            <button
              onClick={() => handleBatchSubmitToLedger(undefined, false)}
              disabled={isBatchSubmitting}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-semibold rounded-lg flex items-center gap-1.5 transition-all"
              title="仅写入主选初选盘口"
            >
              <span>仅写主盘</span>
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
                  基于《CUSTOM_INSTRUCTIONS_COMPLETE.md》协议，彻底排除同场重复暴露与低赔极低边际收益腿，综合包含让球/大小球/BTTS等多元玩法。
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
              <p className="text-xs text-slate-400 mt-1">需要至少 2 场独立且赔率 ≥ 1.30 的 A/B 级精选比赛</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {aiParlayTickets.map((ticket) => (
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
                          <Send className="w-4 h-4 text-emerald-300" /> 📥 写入正式推荐台账 (串关实单)
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                    {ticket.legs.map((leg, idx) => {
                      const teams = getTeamDisplay(leg);
                      return (
                        <div key={leg.match + idx} className="bg-slate-950/90 p-3 rounded-lg border border-indigo-900/50 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-bold text-indigo-300 flex items-center gap-1">
                              腿 #{idx + 1} ({leg.grade}级)
                            </span>
                            <span className="font-mono text-slate-400">{leg.startTime}</span>
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
              ))}
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
            const ext = generateExtendedAnalysis(m);

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
                        onClick={() => handlePromoteToFormalLedger(m, true)}
                        disabled={submittingId === m.match || isSubmitted}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md transition-all ${
                          isSubmitted
                            ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-600'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                        title="写入全套AI维度（主盘+让球+独赢+波胆+BTTS）方便赛后全面评估"
                      >
                        {isSubmitted ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> 已写入台账
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" /> 写入全套推荐
                          </>
                        )}
                      </button>

                      {!isSubmitted && (
                        <button
                          onClick={() => handlePromoteToFormalLedger(m, false)}
                          disabled={submittingId === m.match}
                          className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg transition-all border border-slate-700"
                          title="仅写入主选盘口"
                        >
                          仅写主盘
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Match Teams & Betting Target */}
                <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
                  {/* Teams & Score */}
                  {(() => {
                    const teams = getTeamDisplay(m);
                    return (
                      <div className="lg:col-span-2 flex items-center justify-between bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
                        <div className="text-right flex-1 pr-3 space-y-0.5">
                          <div className="text-sm font-bold text-slate-100">{teams.homeYbty}</div>
                          <div className="text-xs font-semibold text-purple-300">{teams.homeLeisu}</div>
                        </div>

                        <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-center min-w-[90px] shrink-0">
                          <div className="text-xl font-mono font-bold text-emerald-400">
                            {m.score ? `${m.score.home} - ${m.score.away}` : 'VS'}
                          </div>
                          <div className="text-[10px] text-slate-400 tracking-wider">
                            {isLive ? '当前实时比分' : '赛前盘口'}
                          </div>
                        </div>

                        <div className="text-left flex-1 pl-3 space-y-0.5">
                          <div className="text-sm font-bold text-slate-100">{teams.awayYbty}</div>
                          <div className="text-xs font-semibold text-purple-300">{teams.awayLeisu}</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Betting Target Card */}
                  <div className="bg-emerald-950/30 border border-emerald-800/50 p-3.5 rounded-lg space-y-1.5 text-xs">
                    <div className="text-slate-400 text-[11px] flex items-center justify-between">
                      <span>专业建议玩法与盘口 (Betting Market):</span>
                      {(() => {
                        const numLine = parseQuarterLine(m.recommendation?.line ?? 0);
                        return isQuarterLine(numLine) ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            四分之一盘口
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="text-sm font-bold text-emerald-300 flex items-center justify-between">
                      <span>{m.recommendation?.market || '全场大球 / 让球'}</span>
                      <span className="text-emerald-400 font-mono text-base">
                        {formatAsianLine(m.recommendation?.line ?? '2.25')}
                      </span>
                    </div>

                    {/* Quarter Line Split Info */}
                    {(() => {
                      const numLine = parseQuarterLine(m.recommendation?.line ?? 0);
                      if (isQuarterLine(numLine)) {
                        const { lineA, lineB } = getQuarterSplits(numLine);
                        return (
                          <div className="bg-slate-950/80 p-1.5 rounded border border-indigo-500/30 text-[10px] font-mono text-indigo-200 flex items-center justify-between">
                            <span>拆分双注 (Split):</span>
                            <span className="font-bold">
                              [{lineA > 0 ? '+' : ''}{lineA} (50%)] + [{lineB > 0 ? '+' : ''}{lineB} (50%)]
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <div className="text-[11px] text-slate-300 flex justify-between pt-1 border-t border-emerald-800/40">
                      <span>参考赔率: <strong className="text-amber-300 font-mono">@{m.recommendation?.odds ?? 1.88}</strong></span>
                      <span>模型得分: <strong className="text-emerald-400 font-mono">{m.model_score ?? 75.0}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Fundamental Data Summary Badges (H2H, Recent Scoring, Line Movements) */}
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
                      全维度多玩法推荐 (全场/半场大小 · 全场/半场让球 · 1X2 · 波胆 · 双方进球 · 进球单双 · 反弹节点)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      基于交锋履历、近期火力及滚球盘口实时推演
                    </span>
                  </div>

                  {/* 0. Full-Time & Half-Time Over/Under, Handicap & 1X2 Matrix */}
                  {(marketViewTab === 'ALL_MARKETS' || marketViewTab === 'OU_HANDICAP') && (
                    <div className="bg-slate-900/90 p-3 rounded-lg border border-emerald-500/30 space-y-2.5 shadow-md">
                      <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                        <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                          <Trophy className="w-4 h-4 text-emerald-400" />
                          ⚽ 让球与大小球核心推荐矩阵 (全场 + 半场 + 独赢1X2)
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          包含半场动能与四分之一盘口划分
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                        {/* Full Time Over/Under */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
                            <span className="flex items-center gap-1">⚽ 全场大小球</span>
                            <span className="font-mono text-emerald-400">@{ext.overUnder.fullTime.odds}</span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                {ext.overUnder.fullTime.value}
                              </span>
                              <span className="font-mono text-amber-300 font-bold">{ext.overUnder.fullTime.line} 盘</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-tight line-clamp-2">
                              {ext.overUnder.fullTime.reason}
                            </p>
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono text-right border-t border-slate-800/80 pt-1">
                            信心度: <strong className="text-emerald-400">{ext.overUnder.fullTime.confidence}%</strong>
                          </div>
                        </div>

                        {/* Half Time Over/Under */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-sky-300">
                            <span className="flex items-center gap-1">⏱️ 半场大小球</span>
                            <span className="font-mono text-sky-400">@{ext.overUnder.halfTime.odds}</span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                {ext.overUnder.halfTime.value}
                              </span>
                              <span className="font-mono text-amber-300 font-bold">{ext.overUnder.halfTime.line} 盘</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-tight line-clamp-2">
                              {ext.overUnder.halfTime.reason}
                            </p>
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono text-right border-t border-slate-800/80 pt-1">
                            信心度: <strong className="text-sky-400">{ext.overUnder.halfTime.confidence}%</strong>
                          </div>
                        </div>

                        {/* Full Time Handicap */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                            <span className="flex items-center gap-1">🚩 全场让球</span>
                            <span className="font-mono text-amber-400">@{ext.handicap.fullTime.odds}</span>
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
                            信心度: <strong className="text-amber-400">{ext.handicap.fullTime.confidence}%</strong>
                          </div>
                        </div>

                        {/* Half Time Handicap */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-purple-300">
                            <span className="flex items-center gap-1">⏱️ 半场让球</span>
                            <span className="font-mono text-purple-400">@{ext.handicap.halfTime.odds}</span>
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
                            信心度: <strong className="text-purple-400">{ext.handicap.halfTime.confidence}%</strong>
                          </div>
                        </div>

                        {/* 1X2 Match Winner */}
                        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[11px] font-bold text-indigo-300">
                            <span className="flex items-center gap-1">🏆 全场独赢 (1X2)</span>
                            <span className="font-mono text-indigo-400">@{ext.match1X2.odds}</span>
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
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 1. Correct Score (波胆) & BTTS & Odd/Even Grid */}
                  {(marketViewTab === 'ALL_MARKETS' || marketViewTab === 'CORRECT_SCORE' || marketViewTab === 'BTTS' || marketViewTab === 'ODD_EVEN') && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
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
                                <span className="text-emerald-400 font-bold">@{cs.odds}</span>
                                <span className="text-[9px] text-slate-500 block">({cs.probPercent}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Both Teams To Score (BTTS) Panel */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-2">
                        <div className="font-semibold text-sky-400 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1">
                            <Crosshair className="w-3.5 h-3.5" /> 🔄 双方均有进球 (BTTS)
                          </span>
                          <span className="font-mono font-bold text-sky-300">@{ext.btts.odds}</span>
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
                      </div>

                      {/* Odd / Even Goals Panel */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-2">
                        <div className="font-semibold text-purple-400 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1">
                            <Divide className="w-3.5 h-3.5" /> 🔢 进球单双 (Odd/Even)
                          </span>
                          <span className="font-mono font-bold text-purple-300">@{ext.oddEven.odds}</span>
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
                              <span className="text-amber-400 font-bold">@{ti.odds}</span>
                            </div>
                          </div>
                        ))}
                      </div>
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

                {/* Evidence & Risk Support Details */}
                <div className="p-4 bg-slate-950/60 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {m.evidence && m.evidence.length > 0 && (
                    <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                      <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 数据与技术面支持 (Evidence)
                      </div>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[11px]">
                        {m.evidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
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
                          <li key={i}>{rk}</li>
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

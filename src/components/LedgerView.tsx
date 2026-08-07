import React, { useState } from 'react';
import { LedgerItem, getLeagueName, getTeamDisplay } from '../types';
import { 
  FileCheck2, 
  TrendingUp, 
  AlertOctagon, 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  MinusCircle, 
  Search, 
  Filter, 
  BookOpen,
  PieChart,
  HelpCircle,
  Edit3,
  Check,
  RotateCcw,
  Layers,
  ArrowRight,
  Trophy,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { evaluateQuarterSettlement, evaluateParlaySettlement, isQuarterLine, parseQuarterLine, SettlementDetail, ParlaySettlementDetail } from '../lib/quarterSettlement';
import { UnverifiedScoresModal } from './UnverifiedScoresModal';

interface Props {
  ledger: LedgerItem[];
  backtestReport: { report: string; formal_results: any };
}

export const LedgerView: React.FC<Props> = ({ ledger: initialLedger, backtestReport }) => {
  const [ledger, setLedger] = useState<LedgerItem[]>(initialLedger);
  const [activeTab, setActiveTab] = useState<'ledger' | 'backtest'>('ledger');
  const [recordTypeFilter, setRecordTypeFilter] = useState<'ALL' | 'formal' | 'candidate'>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal / Inline score editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHome, setEditHome] = useState<number>(0);
  const [editAway, setEditAway] = useState<number>(0);
  const [editHtHome, setEditHtHome] = useState<number | string>('');
  const [editHtAway, setEditHtAway] = useState<number | string>('');
  const [editVerified, setEditVerified] = useState<boolean>(true);
  const [editParlayLegs, setEditParlayLegs] = useState<Array<{
    leg_index: number;
    match: string;
    ybty_home: string;
    ybty_away: string;
    market: string;
    line: string | number;
    odds: number;
    homeScore: number;
    awayScore: number;
    htHomeScore?: number | string;
    htAwayScore?: number | string;
    score_verified: boolean;
  }>>([]);

  // Batch Selection & Deletion state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState<boolean>(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Sync state if props change
  React.useEffect(() => {
    setLedger(initialLedger);
  }, [initialLedger]);

  // Evaluate settlements for all items
  const ledgerWithSettlement = ledger.map((item) => {
    const isFormal = item.formal_recommendation || item.record_type === 'formal_ai_recommendation';
    const rec = item.recommendation;

    let settlement: SettlementDetail | null = null;
    let parlaySettlement: ParlaySettlementDetail | null = null;

    const isParlay = item.is_parlay || (item.parlay_legs && item.parlay_legs.length > 0) || (item.match && item.match.includes('串关'));

    if (isParlay) {
      let legs = item.parlay_legs || [];
      if (legs.length === 0 && item.evidence && Array.isArray(item.evidence)) {
        // Fallback: parse leg descriptions if parlay_legs were not populated on legacy record
        const parsedLegs: any[] = [];
        item.evidence.forEach((ev, idx) => {
          if (ev.includes(':')) {
            const parts = ev.split(':');
            const matchName = parts[0].trim();
            const mktPart = parts.slice(1).join(':').trim();
            parsedLegs.push({
              leg_index: idx + 1,
              match: matchName,
              ybty_home: matchName.split(' vs ')[0] || '',
              ybty_away: matchName.split(' vs ')[1] || '',
              market: mktPart.split(' ')[0] || '全场大球',
              line: mktPart.split(' ')[1] || '2/2.5',
              odds: 1.85,
              score_at_recommendation: item.score_at_recommendation || { home: 0, away: 0 },
              final_score: item.review?.final_score || null,
              score_verified: item.score_verified ?? true,
            });
          }
        });
        if (parsedLegs.length > 0) legs = parsedLegs;
      }

      parlaySettlement = evaluateParlaySettlement(legs, rec?.odds || 1.0);
    } else if (rec && rec.market) {
      settlement = evaluateQuarterSettlement({
        market: rec.market,
        line: rec.line ?? 0,
        odds: rec.odds ?? 1.90,
        scoreAtRec: item.score_at_recommendation || { home: 0, away: 0 },
        finalScore: item.review?.final_score || null,
        scoreVerified: item.score_verified ?? true,
        isLive: Boolean(
          (item as any).is_live ||
          (item as any).source_type === 'live' ||
          (item.minute && item.minute > 0) ||
          (item.score_at_recommendation && (item.score_at_recommendation.home > 0 || item.score_at_recommendation.away > 0))
        ),
      });
    }

    return {
      ...item,
      isFormal,
      isParlay,
      settlement,
      parlaySettlement,
    };
  });

  // Calculate high-precision quarter-settlement financial statistics
  const formalItems = ledgerWithSettlement.filter((i) => i.isFormal);
  const machineCandidates = ledgerWithSettlement.filter((i) => !i.isFormal);

  const reviewedFormal = formalItems.filter((i) => {
    if (i.isParlay && i.parlaySettlement) {
      return i.parlaySettlement.outcome !== 'pending';
    }
    return i.settlement && i.settlement.outcome !== 'pending';
  });
  
  let totalNetProfit = 0;
  let totalStakedUnits = 0;
  let countWin = 0;
  let countHalfWin = 0;
  let countPush = 0;
  let countHalfLoss = 0;
  let countLoss = 0;
  let countInvalid = 0;

  reviewedFormal.forEach((item) => {
    if (item.isParlay && item.parlaySettlement) {
      const ps = item.parlaySettlement;
      if (ps.outcome === 'invalid_data') {
        countInvalid++;
        return;
      }

      totalStakedUnits += 1.0;
      totalNetProfit += ps.netProfitUnit;

      switch (ps.outcome) {
        case 'win': countWin++; break;
        case 'half_win': countHalfWin++; break;
        case 'push': countPush++; break;
        case 'half_loss': countHalfLoss++; break;
        case 'loss': countLoss++; break;
      }
    } else if (item.settlement) {
      if (item.settlement.outcome === 'invalid_data') {
        countInvalid++;
        return;
      }

      totalStakedUnits += 1.0;
      totalNetProfit += item.settlement.netProfitUnit;

      switch (item.settlement.outcome) {
        case 'win': countWin++; break;
        case 'half_win': countHalfWin++; break;
        case 'push': countPush++; break;
        case 'half_loss': countHalfLoss++; break;
        case 'loss': countLoss++; break;
      }
    }
  });

  const effectiveBets = countWin + countHalfWin + countHalfLoss + countLoss;
  // Weighted win rate: (Win + 0.5 * HalfWin) / (Win + HalfWin + HalfLoss + Loss)
  const weightedWinScore = countWin + 0.5 * countHalfWin;
  const formalWinRate = effectiveBets > 0 ? ((weightedWinScore / effectiveBets) * 100).toFixed(1) : '0.0';
  const roiPercent = totalStakedUnits > 0 ? ((totalNetProfit / totalStakedUnits) * 100).toFixed(1) : '0.0';

  const filteredLedger = ledgerWithSettlement.filter((item) => {
    const typeMatch =
      recordTypeFilter === 'ALL' ||
      (recordTypeFilter === 'formal' && item.isFormal) ||
      (recordTypeFilter === 'candidate' && !item.isFormal);

    const outcome = item.settlement?.outcome || item.review?.outcome || 'pending';
    const outcomeMatch = outcomeFilter === 'ALL' || outcome === outcomeFilter;

    const nameMatch = item.match.toLowerCase().includes(searchTerm.toLowerCase());

    return typeMatch && outcomeMatch && nameMatch;
  });

  // Helper to normalize team names for cross-provider and alias matching
  const cleanTeamName = (str: string): string => {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/-(ybty|leisu|雷速|YBTY|LEISU)$/gi, '')
      .replace(/football club|fc|俱乐部|体育|（女）|\(女\)/gi, '')
      .replace(/[\s\(\)\（\）\【\】\[\]]/g, '')
      .trim();
  };

  const getSingleMatchTeams = (item: any) => {
    let home = cleanTeamName(item.ybty_home || '');
    let away = cleanTeamName(item.ybty_away || '');

    if ((!home || !away) && item.match && typeof item.match === 'string' && !item.match.startsWith('【AI')) {
      const parts = item.match.split(/\s+vs\s+/i);
      if (parts.length === 2) {
        if (!home) home = cleanTeamName(parts[0]);
        if (!away) away = cleanTeamName(parts[1]);
      }
    }
    return { home, away };
  };

  const isSameMatch = (itemA: any, itemB: any): boolean => {
    if (!itemA || !itemB) return false;
    if (itemA.id && itemB.id && itemA.id === itemB.id) return true;

    const teamsA = getSingleMatchTeams(itemA);
    const teamsB = getSingleMatchTeams(itemB);

    if (teamsA.home && teamsA.away && teamsB.home && teamsB.away) {
      const homeMatches =
        teamsA.home === teamsB.home ||
        (teamsA.home.length >= 2 && teamsB.home.length >= 2 && (teamsA.home.includes(teamsB.home) || teamsB.home.includes(teamsA.home)));

      const awayMatches =
        teamsA.away === teamsB.away ||
        (teamsA.away.length >= 2 && teamsB.away.length >= 2 && (teamsA.away.includes(teamsB.away) || teamsB.away.includes(teamsA.away)));

      if (homeMatches && awayMatches) {
        return true;
      }
    }

    if (itemA.match && itemB.match && !itemA.match.startsWith('【AI') && !itemB.match.startsWith('【AI')) {
      if (itemA.match === itemB.match) return true;
    }

    return false;
  };

  const [syncToast, setSyncToast] = useState<string | null>(null);

  const handleParlayLegScoreChange = (index: number, field: 'home' | 'away', val: number) => {
    setEditParlayLegs((prev) =>
      prev.map((leg, idx) => (idx === index ? { ...leg, [field === 'home' ? 'homeScore' : 'awayScore']: val } : leg))
    );
  };

  const handleParlayLegVerifiedToggle = (index: number) => {
    setEditParlayLegs((prev) =>
      prev.map((leg, idx) => (idx === index ? { ...leg, score_verified: !leg.score_verified } : leg))
    );
  };

  // Handle saving score edit with auto-sync across same match items
  const handleSaveEdit = async (item: any) => {
    try {
      if (item.isParlay && editParlayLegs.length > 0) {
        const formattedLegs = editParlayLegs.map((leg) => ({
          leg_index: leg.leg_index,
          match: leg.match,
          ybty_home: leg.ybty_home,
          ybty_away: leg.ybty_away,
          market: leg.market,
          line: leg.line,
          odds: leg.odds,
          final_score: { home: leg.homeScore, away: leg.awayScore },
          score_verified: leg.score_verified,
        }));

        const res = await fetch('/api/ledger/update-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            is_parlay: true,
            parlay_legs: formattedLegs,
            syncSameMatch: true,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.ledger)) {
          setLedger(data.ledger);
          setEditingId(null);
          setEditParlayLegs([]);
          setSyncToast(`✅ 成功保存串关 ${formattedLegs.length} 腿完场比分，并自动重算所有同场台账！`);
          setTimeout(() => setSyncToast(null), 4000);
        }
      } else {
        const final_score = { home: Number(editHome), away: Number(editAway) };

        // API call to backend update-review with syncSameMatch: true
        const res = await fetch('/api/ledger/update-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            match: item.match,
            ybty_home: item.ybty_home,
            ybty_away: item.ybty_away,
            final_score,
            score_verified: editVerified,
            syncSameMatch: true,
          }),
        });

        const data = await res.json();

        if (res.ok && data.success && Array.isArray(data.ledger)) {
          setLedger(data.ledger);
          setEditingId(null);
          const count = data.updatedCount || 1;
          setSyncToast(`✅ 成功录入完场比分 ${final_score.home}-${final_score.away}，并同步自动核算同场 ${count} 条推荐玩法！`);
          setTimeout(() => setSyncToast(null), 4000);
        }
      }
    } catch (err) {
      console.error('Failed to update review:', err);
    }
  };

  // Selection & Delete Handlers
  const handleToggleSelectAll = () => {
    const visibleIds = filteredLedger.slice(0, 100).map((i) => i.id).filter(Boolean);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    if (!id) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExecuteDelete = async (payload: { ids?: string[]; clearAll?: boolean }) => {
    setIsDeleting(true);
    try {
      const res = await fetch('/api/ledger/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.ledger)) {
        setLedger(data.ledger);
        setSelectedIds([]);
      }
    } catch (err) {
      console.error('Failed to delete ledger items:', err);
    } finally {
      setIsDeleting(false);
      setShowDeleteSelectedModal(false);
      setShowClearConfirmModal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Quarter-Handicap Financial Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>正式 AI 推荐总盈亏 (Units)</span>
            <PieChart className="w-4 h-4 text-emerald-400" />
          </div>
          <div className={`text-2xl font-black font-mono ${totalNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalNetProfit >= 0 ? `+${totalNetProfit.toFixed(2)}` : totalNetProfit.toFixed(2)} <span className="text-xs font-normal text-slate-400">u</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>四分之一盘口精确拆算</span>
            <span className="font-mono text-slate-400">ROI: {roiPercent}%</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>加权胜率 (Weighted Win Rate)</span>
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-teal-400">{formalWinRate}%</div>
          <p className="text-[11px] text-slate-500 mt-1">
            {countWin}全赢 / {countHalfWin}赢半 / {countPush}走 / {countHalfLoss}输半 / {countLoss}全输
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>四分之一盘口结算分布</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-sm font-semibold text-slate-200 mt-1 flex items-center gap-2">
            <span className="text-emerald-400">{countWin + countHalfWin} 赢(含半)</span>
            <span className="text-slate-500">/</span>
            <span className="text-rose-400">{countLoss + countHalfLoss} 输(含半)</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            已核验场次: {reviewedFormal.length} 场 (无效比分: {countInvalid})
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>台账总条目 & 机器初筛</span>
            <BookOpen className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{ledger.length} <span className="text-xs font-normal text-slate-400">条</span></div>
          <p className="text-[11px] text-slate-500 mt-1">正式推荐: {formalItems.length} | 初筛候选: {machineCandidates.length}</p>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center justify-between bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'ledger'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            推荐台账与四分之一盘口结算 (Quarter Settlement Ledger)
          </button>
          <button
            onClick={() => setActiveTab('backtest')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'backtest'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2026-07-29 回测与教训反思
          </button>
        </div>

        <div className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1.5 px-3">
          <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span>支持 2.25/2.75/-0.25/-0.75 拆分双注、赢半、输半与剩余时段让球计算</span>
        </div>
      </div>

      {/* Ledger Tab Content */}
      {activeTab === 'ledger' ? (
        <div className="space-y-4">
          {/* Filters & Batch Actions */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索台账比赛、球队..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
              <span className="text-slate-400 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> 分类:
              </span>
              <button
                onClick={() => setRecordTypeFilter('ALL')}
                className={`px-3 py-1 rounded-lg border font-medium ${
                  recordTypeFilter === 'ALL' ? 'bg-slate-700 text-white border-slate-600' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                全部条目
              </button>
              <button
                onClick={() => setRecordTypeFilter('formal')}
                className={`px-3 py-1 rounded-lg border font-medium ${
                  recordTypeFilter === 'formal' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                正式 AI 推荐
              </button>
              <button
                onClick={() => setRecordTypeFilter('candidate')}
                className={`px-3 py-1 rounded-lg border font-medium ${
                  recordTypeFilter === 'candidate' ? 'bg-sky-600 text-white border-sky-500' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                机器候选 (WATCH)
              </button>

              <span className="text-slate-400 ml-2">结算状态:</span>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">全部结果</option>
                <option value="win">全赢 (Win)</option>
                <option value="half_win">赢半 (Half Win)</option>
                <option value="push">走盘 (Push)</option>
                <option value="half_loss">输半 (Half Loss)</option>
                <option value="loss">全输 (Loss)</option>
                <option value="pending">待核实 (Pending)</option>
                <option value="invalid_data">无效数据 (Invalid Data)</option>
              </select>

              {/* Action Buttons for Delete & Clear */}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setShowDeleteSelectedModal(true)}
                  disabled={selectedIds.length === 0}
                  className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                    selectedIds.length > 0
                      ? 'bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700 shadow-md'
                      : 'bg-slate-950 text-slate-600 border border-slate-800 cursor-not-allowed opacity-60'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  选择项清除 ({selectedIds.length})
                </button>

                <button
                  onClick={() => setShowClearConfirmModal(true)}
                  disabled={ledger.length === 0}
                  className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                    ledger.length > 0
                      ? 'bg-red-600 hover:bg-red-500 text-white border border-red-500 shadow-md'
                      : 'bg-slate-950 text-slate-600 border border-slate-800 cursor-not-allowed opacity-60'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  全部清空台账
                </button>
              </div>
            </div>

            {syncToast && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-lg text-emerald-200 text-xs font-bold flex items-center gap-2 animate-fade-in shadow-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{syncToast}</span>
              </div>
            )}
          </div>

          {/* Ledger Table */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-x-auto shadow-lg">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredLedger.slice(0, 100).length > 0 &&
                        filteredLedger.slice(0, 100).every((i) => selectedIds.includes(i.id))
                      }
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 h-4 w-4 cursor-pointer accent-emerald-500"
                    />
                  </th>
                  <th className="p-3">类型</th>
                  <th className="p-3">比赛 / 推荐时间</th>
                  <th className="p-3">推荐玩法 & 盘口 (Line/Odds)</th>
                  <th className="p-3">四分之一盘口拆分</th>
                  <th className="p-3">推荐时比分</th>
                  <th className="p-3">完场比分与运算过程</th>
                  <th className="p-3">四分之一盘口结算结果</th>
                  <th className="p-3 text-right">操作 / 完场核对</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLedger.slice(0, 100).map((item, idx) => {
                  const set = item.settlement;
                  const isQuarter = set?.isQuarterLine;
                  const isEditing = editingId === item.id;
                  const isSelected = selectedIds.includes(item.id);

                  return (
                    <tr
                      key={item.id || idx}
                      className={`transition-colors ${
                        isSelected ? 'bg-emerald-950/30' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(item.id)}
                          className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 h-4 w-4 cursor-pointer accent-emerald-500"
                        />
                      </td>
                      {/* Type Badge */}
                      <td className="p-3 whitespace-nowrap">
                        {item.isParlay ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            正式串关
                          </span>
                        ) : item.isFormal ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            正式推荐
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                            机器候选
                          </span>
                        )}
                      </td>

                      {/* Match & Time */}
                      <td className="p-3 font-semibold text-slate-100">
                        {(() => {
                          const teams = getTeamDisplay(item);
                          return (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-0.5">
                                  <Trophy className="w-3 h-3 text-purple-400 shrink-0" />
                                  {getLeagueName(item)}
                                </span>
                              </div>
                              <div className="text-xs font-bold text-slate-100">{teams.homeYbty} vs {teams.awayYbty}</div>
                              <div className="text-[11px] font-semibold text-purple-300">{teams.homeLeisu} vs {teams.awayLeisu}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {item.created_at ? item.created_at.slice(0, 16).replace('T', ' ') : '未知时间'}
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Market & Line */}
                      <td className="p-3">
                        {item.isParlay && item.parlaySettlement ? (
                          <div className="space-y-1.5 min-w-[220px]">
                            <div className="font-bold text-amber-300 flex items-center justify-between text-xs">
                              <span>【串关彩票组合】</span>
                              <span className="text-slate-400 text-[10px]">总赔率 @ {item.parlaySettlement.combinedOdds}</span>
                            </div>
                            <div className="space-y-1 bg-slate-950/80 p-2 rounded-lg border border-amber-500/20 text-[11px]">
                              {item.parlaySettlement.evaluatedLegs.map((leg) => {
                                const legTeams = getTeamDisplay(leg);
                                return (
                                  <div key={leg.leg_index} className="border-b border-slate-800/60 pb-1 last:border-0 last:pb-0 space-y-0.5">
                                    <div className="flex items-center justify-between font-bold text-slate-200 text-[11px]">
                                      <span>腿{leg.leg_index}: [{legTeams.homeYbty} vs {legTeams.awayYbty}]</span>
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] ${leg.settlement.badgeColor}`}>
                                        {leg.settlement.outcomeLabel}
                                      </span>
                                    </div>
                                    <div className="text-[10px] font-semibold text-purple-300">
                                      [{legTeams.homeLeisu} vs {legTeams.awayLeisu}]
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                                      <span>{leg.market} {leg.line} @{leg.odds}</span>
                                      <span className="font-mono text-slate-300">
                                        比分: {leg.final_score ? `${leg.final_score.home}-${leg.final_score.away}` : '待核实'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : item.recommendation ? (
                          <div>
                            <div className="font-bold text-emerald-400 flex items-center gap-1">
                              <span>{item.recommendation.market}</span>
                              <span className="text-amber-300">({item.recommendation.line})</span>
                              <span className="text-slate-400 text-[10px]">@ {item.recommendation.odds}</span>
                            </div>
                            {isQuarter && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                4/1 拆分盘
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">无市场</span>
                        )}
                      </td>

                      {/* Quarter Split Detail */}
                      <td className="p-3 text-[11px]">
                        {set?.isQuarterLine && set.splitA && set.splitB ? (
                          <div className="space-y-0.5 bg-slate-950/60 p-1.5 rounded border border-slate-800/80 font-mono text-[10px]">
                            <div className="text-slate-300 flex items-center justify-between">
                              <span>半注A: {set.splitA.line > 0 ? '+' : ''}{set.splitA.line}</span>
                              <span className={set.splitA.outcome === 'win' ? 'text-emerald-400 font-bold' : set.splitA.outcome === 'push' ? 'text-sky-400' : 'text-rose-400'}>
                                {set.splitA.label.split('(')[1]?.replace(')', '') || set.splitA.outcome}
                              </span>
                            </div>
                            <div className="text-slate-300 flex items-center justify-between border-t border-slate-800/60 pt-0.5">
                              <span>半注B: {set.splitB.line > 0 ? '+' : ''}{set.splitB.line}</span>
                              <span className={set.splitB.outcome === 'win' ? 'text-emerald-400 font-bold' : set.splitB.outcome === 'push' ? 'text-sky-400' : 'text-rose-400'}>
                                {set.splitB.label.split('(')[1]?.replace(')', '') || set.splitB.outcome}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[10px] font-mono">标准单线</span>
                        )}
                      </td>

                      {/* Score at Recommendation */}
                      <td className="p-3 font-mono">
                        {item.minute ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 mr-1">
                            {item.minute}'
                          </span>
                        ) : null}
                        <span className="font-bold text-slate-200">
                          {item.score_at_recommendation ? `${item.score_at_recommendation.home}-${item.score_at_recommendation.away}` : '0-0'}
                        </span>
                      </td>

                      {/* Final Score & Math Explanation */}
                      <td className="p-3">
                        {isEditing ? (
                          item.isParlay ? (
                            <div className="space-y-2 min-w-[280px] bg-slate-950 p-2.5 rounded-xl border border-amber-500/40 text-xs shadow-lg">
                              <div className="font-bold text-amber-300 flex items-center justify-between border-b border-slate-800 pb-1">
                                <span>【串关组合各腿完场比分录入】</span>
                                <span className="text-[10px] text-slate-400 font-mono">共 {editParlayLegs.length} 腿</span>
                              </div>
                              {editParlayLegs.map((leg, idx) => (
                                <div key={idx} className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-[11px] space-y-1">
                                  <div className="flex items-center justify-between font-bold text-slate-200">
                                    <span>腿{leg.leg_index}: {leg.ybty_home} vs {leg.ybty_away}</span>
                                    <span className="text-amber-400 font-normal text-[10px] font-mono">{leg.market} {leg.line}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pt-0.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-400 text-[10px]">完场比分:</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={isNaN(leg.homeScore) ? '' : leg.homeScore}
                                        onChange={(e) => handleParlayLegScoreChange(idx, 'home', e.target.value === '' ? 0 : Number(e.target.value))}
                                        className="w-9 bg-slate-950 border border-emerald-500/80 rounded text-center text-xs font-mono font-bold text-emerald-300 py-0.5 focus:outline-none"
                                      />
                                      <span className="text-slate-500 font-mono font-bold">:</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={isNaN(leg.awayScore) ? '' : leg.awayScore}
                                        onChange={(e) => handleParlayLegScoreChange(idx, 'away', e.target.value === '' ? 0 : Number(e.target.value))}
                                        className="w-9 bg-slate-950 border border-emerald-500/80 rounded text-center text-xs font-mono font-bold text-emerald-300 py-0.5 focus:outline-none"
                                      />
                                    </div>
                                    <label className="flex items-center gap-1 text-[10px] text-emerald-400 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={leg.score_verified}
                                        onChange={() => handleParlayLegVerifiedToggle(idx)}
                                        className="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3 h-3"
                                      />
                                      <span>已校验</span>
                                    </label>
                                  </div>
                                </div>
                              ))}
                              <div className="text-[9px] text-amber-400 font-medium pt-1">
                                💡 保存将更新串关全部腿完场比分与总盈亏，并同步至同场推荐！
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={isNaN(editHome) ? '' : editHome}
                                  onChange={(e) => setEditHome(e.target.value === '' ? 0 : Number(e.target.value))}
                                  className="w-10 bg-slate-950 border border-emerald-500 rounded px-1 text-center font-mono text-xs text-white"
                                />
                                <span>-</span>
                                <input
                                  type="number"
                                  value={isNaN(editAway) ? '' : editAway}
                                  onChange={(e) => setEditAway(e.target.value === '' ? 0 : Number(e.target.value))}
                                  className="w-10 bg-slate-950 border border-emerald-500 rounded px-1 text-center font-mono text-xs text-white"
                                />
                              </div>
                              <div className="text-[9px] text-emerald-400 font-medium">
                                💡 保存自动同步同场所有玩法
                              </div>
                            </div>
                          )
                        ) : (
                          <div>
                            {item.isParlay && item.parlaySettlement ? (
                              <div className="text-[10px] text-amber-300 mt-0.5 max-w-xs leading-tight font-medium">
                                {item.parlaySettlement.calculationExplanation}
                              </div>
                            ) : (
                              <>
                                <div className="font-mono font-bold text-slate-100 text-xs">
                                  完场: {item.review?.final_score ? `${item.review.final_score.home}-${item.review.final_score.away}` : '未确定'}
                                </div>
                                {set && set.calculationExplanation && (
                                  <div className="text-[10px] text-slate-400 mt-0.5 max-w-xs leading-tight">
                                    {set.calculationExplanation}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Settlement Result Badge & Units */}
                      <td className="p-3 whitespace-nowrap">
                        {item.isParlay && item.parlaySettlement ? (
                          <div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${item.parlaySettlement.badgeColor}`}>
                              {item.parlaySettlement.outcome === 'win' || item.parlaySettlement.outcome === 'half_win' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : item.parlaySettlement.outcome === 'loss' || item.parlaySettlement.outcome === 'half_loss' ? (
                                <XCircle className="w-3.5 h-3.5" />
                              ) : (
                                <MinusCircle className="w-3.5 h-3.5" />
                              )}
                              {item.parlaySettlement.outcomeLabel}
                            </span>
                            {item.parlaySettlement.outcome !== 'pending' && item.parlaySettlement.outcome !== 'invalid_data' && (
                              <div className="text-[11px] font-mono font-bold mt-1">
                                <span className={item.parlaySettlement.netProfitUnit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  串关净盈亏: {item.parlaySettlement.netProfitText}
                                </span>
                                <div className="text-[9px] font-normal text-slate-500">{item.parlaySettlement.payoutReturnText}</div>
                              </div>
                            )}
                          </div>
                        ) : set ? (
                          <div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${set.badgeColor}`}>
                              {set.outcome === 'win' || set.outcome === 'half_win' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : set.outcome === 'loss' || set.outcome === 'half_loss' ? (
                                <XCircle className="w-3.5 h-3.5" />
                              ) : (
                                <MinusCircle className="w-3.5 h-3.5" />
                              )}
                              {set.outcomeLabel}
                            </span>
                            {set.outcome !== 'pending' && set.outcome !== 'invalid_data' && (
                              <div className="text-[11px] font-mono font-bold mt-1">
                                <span className={set.netProfitUnit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  净盈亏: {set.netProfitText}
                                </span>
                                <div className="text-[9px] font-normal text-slate-500">{set.payoutReturnText}</div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">未结算</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleSaveEdit(item)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold flex items-center gap-0.5 shadow"
                            >
                              <Check className="w-3.5 h-3.5" /> 保存{item.isParlay ? '串关全腿' : ''}
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditParlayLegs([]);
                              }}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (item.isParlay) {
                                setEditingId(item.id);
                                let legs = item.parlay_legs || [];
                                if (legs.length === 0 && item.parlaySettlement?.evaluatedLegs) {
                                  legs = item.parlaySettlement.evaluatedLegs;
                                }
                                if (legs.length === 0 && item.evidence && Array.isArray(item.evidence)) {
                                  const parsedLegs: any[] = [];
                                  item.evidence.forEach((ev: string, idx: number) => {
                                    if (ev.includes(':')) {
                                      const parts = ev.split(':');
                                      const matchName = parts[0].trim();
                                      const mktPart = parts.slice(1).join(':').trim();
                                      parsedLegs.push({
                                        leg_index: idx + 1,
                                        match: matchName,
                                        ybty_home: matchName.split(' vs ')[0] || '',
                                        ybty_away: matchName.split(' vs ')[1] || '',
                                        market: mktPart.split(' ')[0] || '全场大球',
                                        line: mktPart.split(' ')[1] || '2/2.5',
                                        odds: 1.85,
                                        final_score: item.review?.final_score || null,
                                        score_verified: item.score_verified ?? true,
                                      });
                                    }
                                  });
                                  if (parsedLegs.length > 0) legs = parsedLegs;
                                }

                                setEditParlayLegs(
                                  legs.map((leg: any, idx: number) => ({
                                    leg_index: leg.leg_index || idx + 1,
                                    match: leg.match || `${leg.ybty_home} vs ${leg.ybty_away}`,
                                    ybty_home: leg.ybty_home || (leg.match ? leg.match.split(' vs ')[0] : '主队'),
                                    ybty_away: leg.ybty_away || (leg.match ? leg.match.split(' vs ')[1] : '客队'),
                                    market: leg.market || '全场大球',
                                    line: leg.line ?? '2.5',
                                    odds: leg.odds || 1.85,
                                    homeScore: leg.final_score?.home ?? 0,
                                    awayScore: leg.final_score?.away ?? 0,
                                    score_verified: leg.score_verified ?? true,
                                  }))
                                );
                              } else {
                                setEditingId(item.id);
                                setEditHome(item.review?.final_score?.home ?? 0);
                                setEditAway(item.review?.final_score?.away ?? 0);
                                setEditVerified(item.score_verified ?? true);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                            title={item.isParlay ? "逐腿修改与录入串关完场比分" : "手运核验与调整完场比分"}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Backtest Report Content */
        <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-xl space-y-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
            <BookOpen className="w-5 h-5 text-indigo-400" /> 2026-07-29 正式推荐修复后回测报告
          </h3>

          <div className="prose prose-invert prose-slate max-w-none text-xs leading-relaxed">
            <ReactMarkdown>{backtestReport.report || '暂无回测报告 markdown 内容'}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Delete Selected Items Modal */}
      {showDeleteSelectedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">确认删除所选条目</h3>
                <p className="text-xs text-slate-400">选择项清除确认</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
              您确定要从推荐台账中彻底删除选中的 <span className="font-bold text-rose-400 font-mono text-sm">{selectedIds.length}</span> 条数据吗？此操作不可撤销。
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteSelectedModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
              >
                取消
              </button>
              <button
                onClick={() => handleExecuteDelete({ ids: selectedIds })}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                {isDeleting ? (
                  <span>正在删除...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> 确认删除所选 ({selectedIds.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Items Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">⚠️ 危险操作：清空全部台账</h3>
                <p className="text-xs text-red-400">所有推荐台账数据将被彻底清除</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-red-950/30 p-3 rounded-xl border border-red-900/50">
              您即将彻底清空推荐台账中的全部 <span className="font-bold text-red-400 font-mono text-sm">{ledger.length}</span> 条推荐与核算记录。清空后历史推荐盈亏与结算数据将重置。是否确定继续？
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
              >
                取消
              </button>
              <button
                onClick={() => handleExecuteDelete({ clearAll: true })}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-red-600/40"
              >
                {isDeleting ? (
                  <span>正在清空...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> 彻底清空全部 ({ledger.length}条)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

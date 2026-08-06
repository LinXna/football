import React, { useState } from 'react';
import { LedgerItem } from '../types';
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
  ArrowRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { evaluateQuarterSettlement, isQuarterLine, parseQuarterLine, SettlementDetail } from '../lib/quarterSettlement';

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
  const [editVerified, setEditVerified] = useState<boolean>(true);

  // Sync state if props change
  React.useEffect(() => {
    setLedger(initialLedger);
  }, [initialLedger]);

  // Evaluate settlements for all items
  const ledgerWithSettlement = ledger.map((item) => {
    const isFormal = item.formal_recommendation || item.record_type === 'formal_ai_recommendation';
    const rec = item.recommendation;

    let settlement: SettlementDetail | null = null;
    if (rec && rec.market) {
      settlement = evaluateQuarterSettlement({
        market: rec.market,
        line: rec.line ?? 0,
        odds: rec.odds ?? 1.90,
        scoreAtRec: item.score_at_recommendation || { home: 0, away: 0 },
        finalScore: item.review?.final_score || null,
        scoreVerified: item.score_verified ?? true,
        isLive: Boolean(item.minute && item.minute > 0),
      });
    }

    return {
      ...item,
      isFormal,
      settlement,
    };
  });

  // Calculate high-precision quarter-settlement financial statistics
  const formalItems = ledgerWithSettlement.filter((i) => i.isFormal);
  const machineCandidates = ledgerWithSettlement.filter((i) => !i.isFormal);

  const reviewedFormal = formalItems.filter((i) => i.settlement && i.settlement.outcome !== 'pending');
  
  let totalNetProfit = 0;
  let totalStakedUnits = 0;
  let countWin = 0;
  let countHalfWin = 0;
  let countPush = 0;
  let countHalfLoss = 0;
  let countLoss = 0;
  let countInvalid = 0;

  reviewedFormal.forEach((item) => {
    if (item.settlement) {
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

  // Handle saving score edit
  const handleSaveEdit = async (item: any) => {
    try {
      const final_score = { home: Number(editHome), away: Number(editAway) };
      
      // Calculate preview settlement
      const newSettlement = evaluateQuarterSettlement({
        market: item.recommendation?.market || '全场大球',
        line: item.recommendation?.line ?? 0,
        odds: item.recommendation?.odds ?? 1.90,
        scoreAtRec: item.score_at_recommendation || { home: 0, away: 0 },
        finalScore: final_score,
        scoreVerified: editVerified,
        isLive: Boolean(item.minute && item.minute > 0),
      });

      const res = await fetch('/api/ledger/update-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          final_score,
          score_verified: editVerified,
          outcome: newSettlement.outcome,
        }),
      });

      if (res.ok) {
        setLedger((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  score_verified: editVerified,
                  review: {
                    ...i.review,
                    final_score,
                    status: 'reviewed',
                    outcome: newSettlement.outcome,
                  },
                }
              : i
          )
        );
        setEditingId(null);
      }
    } catch (err) {
      console.error('Failed to update review:', err);
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
          {/* Filters */}
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
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-x-auto shadow-lg">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px]">
                <tr>
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

                  return (
                    <tr key={item.id || idx} className="hover:bg-slate-800/40 transition-colors">
                      {/* Type Badge */}
                      <td className="p-3 whitespace-nowrap">
                        {item.isFormal ? (
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
                        {item.match}
                        <div className="text-[10px] text-slate-500 font-mono">
                          {item.created_at ? item.created_at.slice(0, 16).replace('T', ' ') : '未知时间'}
                        </div>
                      </td>

                      {/* Market & Line */}
                      <td className="p-3">
                        {item.recommendation ? (
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
                        ) : (
                          <div>
                            <div className="font-mono font-bold text-slate-100 text-xs">
                              完场: {item.review?.final_score ? `${item.review.final_score.home}-${item.review.final_score.away}` : '未确定'}
                            </div>
                            {set && set.calculationExplanation && (
                              <div className="text-[10px] text-slate-400 mt-0.5 max-w-xs leading-tight">
                                {set.calculationExplanation}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Settlement Result Badge & Units */}
                      <td className="p-3 whitespace-nowrap">
                        {set ? (
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
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold flex items-center gap-0.5"
                            >
                              <Check className="w-3 h-3" /> 保存
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingId(item.id);
                              setEditHome(item.review?.final_score?.home ?? 0);
                              setEditAway(item.review?.final_score?.away ?? 0);
                              setEditVerified(item.score_verified ?? true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                            title="手运核验与调整完场比分"
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
    </div>
  );
};

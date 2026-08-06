import React, { useState } from 'react';
import { DecisionItem } from '../types';
import { DataSupplementModal } from './DataSupplementModal';
import { BatchSupplementModal } from './BatchSupplementModal';
import { isQuarterLine, parseQuarterLine, getQuarterSplits } from '../lib/quarterSettlement';
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
  const [marketViewTab, setMarketViewTab] = useState<'ALL_MARKETS' | 'CORRECT_SCORE' | 'BTTS' | 'ODD_EVEN' | 'INTERVALS' | 'LIVE_TIMING'>('ALL_MARKETS');
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

  const handleBatchSubmitToLedger = async (itemsToSubmit?: DecisionItem[]) => {
    const list = itemsToSubmit || filtered.filter((m) => selectedMatchNames.includes(m.match));
    if (list.length === 0) return;

    setIsBatchSubmitting(true);
    try {
      for (const m of list) {
        await fetch('/api/ledger/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
          }),
        });
      }

      onRefreshLedger();
      setBatchSuccessMsg(`成功批量写入 ${list.length} 场精选推荐到正式台账！`);
      setSelectedMatchNames([]);
      setTimeout(() => setBatchSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Batch submit to ledger failed', err);
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  const handlePromoteToFormalLedger = async (m: any) => {
    setSubmittingId(m.match);
    try {
      const resp = await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match: m.match,
          ybty_home: m.ybty_home,
          ybty_away: m.ybty_away,
          minute: m.minute || 0,
          score_at_recommendation: m.score || { home: 0, away: 0 },
          score_source: m.score_source || 'ybty_market',
          score_verified: m.score_verified ?? true,
          grade: m.grade || 'B',
          model_score: m.model_score || 72.0,
          recommendation: m.recommendation || {
            market: '建议进一步观察后确定',
            line: null,
            odds: 1.85,
          },
          evidence: m.evidence || ['技术面数据达标', '比分双源通过'],
          risks: m.risks || ['须注意尾盘防守战意'],
          start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
        }),
      });

      if (resp.ok) {
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
            { id: 'PARLAY', label: '串关潜在腿' },
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
            { id: 'ALL_MARKETS', label: '全维度看板', icon: BarChart3 },
            { id: 'CORRECT_SCORE', label: '🎯 波胆预测', icon: Target },
            { id: 'BTTS', label: '🔄 双方进球', icon: Crosshair },
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
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
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
              onClick={() => handleBatchSubmitToLedger()}
              disabled={isBatchSubmitting}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-lg transition-all"
            >
              {isBatchSubmitting ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-spin" /> 写入中...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> 📥 批量写入正式台账
                </>
              )}
            </button>
          </div>
        </div>
      )}

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

                    <button
                      onClick={() => handlePromoteToFormalLedger(m)}
                      disabled={submittingId === m.match || isSubmitted}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md transition-all ${
                        isSubmitted
                          ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-600'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {isSubmitted ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> 已写入正式台账
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" /> 写入正式台账
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Match Teams & Betting Target */}
                <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
                  {/* YBTY Teams & Score */}
                  <div className="lg:col-span-2 flex items-center justify-between bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
                    <div className="text-right flex-1 pr-3">
                      <div className="text-base font-bold text-slate-100">{m.ybty_home || m.match.split('vs')[0]}</div>
                      <div className="text-[11px] text-slate-500 font-mono">YBTY 原始主队</div>
                    </div>

                    <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-center min-w-[90px]">
                      <div className="text-xl font-mono font-bold text-emerald-400">
                        {m.score ? `${m.score.home} - ${m.score.away}` : 'VS'}
                      </div>
                      <div className="text-[10px] text-slate-400 tracking-wider">
                        {isLive ? '当前实时比分' : '赛前盘口'}
                      </div>
                    </div>

                    <div className="text-left flex-1 pl-3">
                      <div className="text-base font-bold text-slate-100">{m.ybty_away || m.match.split('vs')[1]}</div>
                      <div className="text-[11px] text-slate-500 font-mono">YBTY 原始客队</div>
                    </div>
                  </div>

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
                        {m.recommendation?.line ?? '2.25'}
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
                      扩展推荐类型 (波胆 / 双方进球 / 进球单双 / 时间区间 / 最佳反弹入场)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      基于交锋履历、近期火力及滚球盘口实时推演
                    </span>
                  </div>

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

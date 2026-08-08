import React, { useState } from 'react';
import { DecisionItem, PipelineStatus, getLeagueName, getTeamDisplay } from '../types';
import { DataSupplementModal } from './DataSupplementModal';
import { BatchSupplementModal } from './BatchSupplementModal';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  CloudSun, 
  Users, 
  Clock, 
  Calendar,
  Search, 
  Filter, 
  Eye, 
  XCircle, 
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Edit3,
  CheckSquare,
  Square,
  CheckCircle2,
  Send,
  Trophy
} from 'lucide-react';

interface Props {
  decisions: DecisionItem[];
  pipelineStatus: PipelineStatus;
  summary: any;
  onSelectForAi: (match: DecisionItem) => void;
}

export const LiveMatchesView: React.FC<Props> = ({
  decisions,
  pipelineStatus,
  summary,
  onSelectForAi,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WATCH' | 'PASS'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  // Supplement Modal state
  const [supplementMatch, setSupplementMatch] = useState<DecisionItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customUpdatedMatches, setCustomUpdatedMatches] = useState<Record<string, DecisionItem>>({});

  // Batch Selection State
  const [selectedMatchNames, setSelectedMatchNames] = useState<string[]>([]);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);

  const matchesWithCustom = decisions.map((m) => customUpdatedMatches[m.match] || m);

  const filteredMatches = matchesWithCustom.filter((match) => {
    const nameMatch =
      match.match.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (match.ybty_home && match.ybty_home.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (match.ybty_away && match.ybty_away.toLowerCase().includes(searchTerm.toLowerCase()));

    const statusMatch = statusFilter === 'ALL' || match.status === statusFilter;
    const gradeMatch = gradeFilter === 'ALL' || match.grade === gradeFilter;

    return nameMatch && statusMatch && gradeMatch;
  });

  const toggleExpand = (matchId: string) => {
    setExpandedMatch(expandedMatch === matchId ? null : matchId);
  };

  const toggleSelectMatch = (matchName: string) => {
    if (selectedMatchNames.includes(matchName)) {
      setSelectedMatchNames(selectedMatchNames.filter((n) => n !== matchName));
    } else {
      setSelectedMatchNames([...selectedMatchNames, matchName]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedMatchNames.length === filteredMatches.length && filteredMatches.length > 0) {
      setSelectedMatchNames([]);
    } else {
      setSelectedMatchNames(filteredMatches.map((m) => m.match));
    }
  };

  const handleOpenSupplement = (m: DecisionItem) => {
    setSupplementMatch(m);
    setIsModalOpen(true);
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

  const handleQuickBatchVerify = () => {
    const newCustoms = { ...customUpdatedMatches };
    filteredMatches.forEach((m) => {
      if (selectedMatchNames.includes(m.match)) {
        newCustoms[m.match] = {
          ...m,
          score_verified: true,
          score_source: 'user_quick_live_batch',
          status: 'WATCH',
          grade: m.grade === 'C' || !m.grade ? 'B' : m.grade,
          evidence: [...(m.evidence || []), '[滚球批量核验] 比分与盘口双源手动修补完成'],
          risks: (m.risks || []).filter((r) => !r.includes('比分未经校验')),
        };
      }
    });
    setCustomUpdatedMatches(newCustoms);
    setBatchMsg(`已成功批量修补 ${selectedMatchNames.length} 场滚球赛事比分！`);
    setTimeout(() => setBatchMsg(null), 3000);
  };

  const handleClearOutdated = async (selectedOnly = false) => {
    if (selectedOnly && selectedMatchNames.length === 0) return;
    if (!window.confirm(selectedOnly ? `确定只清空已勾选的 ${selectedMatchNames.length} 场滚球比赛吗？` : '确定清空整个滚球分析库吗？')) return;
    try {
      const res = await fetch('/api/clear-outdated-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'live', clear_mode: selectedOnly ? 'selected' : 'all', match_names: selectedOnly ? selectedMatchNames : undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBatchMsg(`🧹 已成功${selectedOnly ? '清空所选滚球比赛' : '清空滚球分析库'}！(共清空 ${data.cleared_live} 场，推荐台账与复盘数据完好无损)。系统正在刷新...`);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        setBatchMsg(`清空失败：${data.error || `HTTP ${res.status}`}`);
      }
    } catch (e: any) {
      setBatchMsg(`清空失败: ${e.message}`);
    }
  };

  const handleBatchSubmitToLedger = async (itemsToSubmit?: DecisionItem[]) => {
    const list = itemsToSubmit || filteredMatches.filter((m) => selectedMatchNames.includes(m.match));
    if (list.length === 0) return;

    let savedCount = 0;
    for (const m of list) {
      if (!m.recommendation?.market || m.recommendation.line === undefined || !Number.isFinite(Number(m.recommendation.odds))) continue;
      const response = await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match: m.match,
          ybty_home: m.ybty_home,
          ybty_away: m.ybty_away,
          minute: m.minute || 0,
          score_at_recommendation: m.score || { home: 0, away: 0 },
          score_source: m.score_source || 'ybty_market',
          score_verified: m.score_verified === true,
          grade: m.grade || 'B',
          model_score: m.model_score || 75.0,
          recommendation: m.recommendation,
          evidence: m.evidence || ['技术面达标'],
          risks: m.risks || [],
          start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
        }),
      });
      if (response.ok) savedCount++;
    }

    setBatchMsg(`已成功将 ${savedCount} 场滚球精选写入正式推荐台账！`);
    setSelectedMatchNames([]);
    setTimeout(() => setBatchMsg(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Pipeline Status Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 backdrop-blur shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                滚球数据流程状态 (Live Pipeline)
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                  实时监控中
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                双源更新时间: YBTY 快照 ({pipelineStatus.ybty_age_seconds ?? 0}s 前) | 雷速快照 ({pipelineStatus.leisu_age_seconds ?? 0}s 前) | 延迟差: {pipelineStatus.snapshot_gap_seconds ?? 0}s
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-slate-300">
              匹配赛事: <span className="font-bold text-emerald-400">{pipelineStatus.matched ?? 0}</span> 场
            </div>
            <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-slate-300">
              观察列表 (WATCH): <span className="font-bold text-emerald-400">{summary.watch ?? 0}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-slate-300">
              拦截/通过 (PASS): <span className="font-bold text-amber-400">{summary.pass ?? 0}</span>
            </div>
            <button
              onClick={() => void handleClearOutdated(false)}
              className="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 rounded-lg font-bold flex items-center gap-1 transition-colors shadow-sm"
              title="一键清空滚球分析库比赛（不影响历史推荐台账与复盘数据）"
            >
              🧹 清空滚球分析库
            </button>
            <button
              onClick={() => void handleClearOutdated(true)}
              disabled={selectedMatchNames.length === 0}
              className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900/80 disabled:opacity-40 text-rose-300 border border-rose-800/80 rounded-lg font-bold"
            >
              🗑️ 清空所选 ({selectedMatchNames.length})
            </button>
          </div>
        </div>
      </div>

      {/* Batch Msg Banner */}
      {batchMsg && (
        <div className="bg-emerald-950/90 border border-emerald-500 text-emerald-200 p-4 rounded-xl shadow-xl flex items-center justify-between text-xs font-semibold animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{batchMsg}</span>
          </div>
          <button onClick={() => setBatchMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            关闭
          </button>
        </div>
      )}

      {/* Filter Bar with Select All */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 rounded-lg transition-colors shrink-0"
          >
            {selectedMatchNames.length > 0 && selectedMatchNames.length === filteredMatches.length ? (
              <CheckSquare className="w-4 h-4 text-emerald-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-500" />
            )}
            <span>
              {selectedMatchNames.length > 0 && selectedMatchNames.length === filteredMatches.length
                ? '取消全选'
                : `全选 (${filteredMatches.length})`}
            </span>
          </button>

          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索球队、比赛..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs">
          <span className="text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> 状态筛选:
          </span>
          {(['ALL', 'WATCH', 'PASS'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg border font-medium transition-all ${
                statusFilter === st
                  ? st === 'WATCH'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : st === 'PASS'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {st === 'ALL' ? '全部状态' : st === 'WATCH' ? 'WATCH 观察' : 'PASS 拦截/旁观'}
            </button>
          ))}

          <span className="text-slate-400 ml-2">评级:</span>
          {['ALL', 'A', 'B', 'C'].map((g) => (
            <button
              key={g}
              onClick={() => setGradeFilter(g)}
              className={`px-2.5 py-1 rounded-lg border font-medium transition-all ${
                gradeFilter === g
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {g === 'ALL' ? '全部' : `${g}级`}
            </button>
          ))}
        </div>
      </div>

      {/* Floating Batch Action Bar */}
      {selectedMatchNames.length > 0 && (
        <div className="sticky top-4 z-40 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 border-2 border-emerald-500/80 rounded-xl p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center space-x-2 text-xs text-slate-100 font-bold">
            <span className="px-2.5 py-1 bg-emerald-500 text-slate-950 rounded-lg font-mono text-sm font-extrabold">
              {selectedMatchNames.length}
            </span>
            <span>已选择 场滚球赛事</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={handleQuickBatchVerify}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 rounded-lg font-medium flex items-center gap-1.5 transition-all shadow"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>⚡ 批量标记比分已双源校验</span>
            </button>

            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-md"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>🔧 批量修补盘口参数</span>
            </button>

            <button
              onClick={() => handleBatchSubmitToLedger()}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-lg transition-all"
            >
              <Send className="w-3.5 h-3.5" /> 批量写入推荐台账
            </button>
          </div>
        </div>
      )}

      {/* Match Cards List */}
      {filteredMatches.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/40 border border-slate-800/60 rounded-xl">
          <AlertTriangle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">没有符合筛选条件的滚球比赛</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredMatches.map((m, idx) => {
            const isExpanded = expandedMatch === m.match;
            const isSelected = selectedMatchNames.includes(m.match);

            return (
              <div
                key={m.match + idx}
                className={`bg-slate-900/80 border rounded-xl overflow-hidden shadow-lg transition-all ${
                  isSelected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                    : m.status === 'WATCH'
                    ? 'border-emerald-500/60 shadow-emerald-950/20'
                    : 'border-slate-800'
                }`}
              >
                {/* Match Header */}
                <div className="p-4 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleSelectMatch(m.match)}
                      className={`p-1 rounded-md border transition-all ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                          : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                      }`}
                      title="勾选进行批量修补数据"
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>

                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
                        m.status === 'WATCH'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {m.status === 'WATCH' ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-slate-400" />}
                      {m.status}
                    </span>

                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-1" title="赛事联赛名称">
                      <Trophy className="w-3.5 h-3.5 text-purple-400" /> {getLeagueName(m)}
                    </span>

                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300">
                      {m.grade || 'C'}级候选
                    </span>

                    <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20" title="滚球进行中分钟">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span className="font-bold">{m.minute ? `${m.minute}'` : '进行中'}</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60" title="比赛开赛时间（北京时间）">
                      <Calendar className="w-3 h-3 text-indigo-400" />
                      <span>开赛: <strong className="text-indigo-200">{m.provider_start_time ? `${m.provider_start_time}（雷速）` : (m.ybty_start_time_beijing || m.commence_time || '时间未确认')}</strong></span>
                    </div>

                    {/* Score Verification */}
                    {m.score_verified ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50" title="比分已通过双源/市场校验">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 比分已核验 ({m.score_source || 'ybty'})
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50" title="比分未经充分双源校验">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> 比分待核验
                      </span>
                    )}
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenSupplement(m)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center gap-1 transition-all"
                      title="手动修补比分、补充数据与突破PASS"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      <span>补充数据/升级</span>
                    </button>

                    <button
                      onClick={() => onSelectForAi(m)}
                      className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> AI 协议核验
                    </button>

                    <button
                      onClick={() => toggleExpand(m.match)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Match Teams & Score Line */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                  {(() => {
                    const teams = getTeamDisplay(m);
                    return (
                      <div className="col-span-2 flex items-center justify-between bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                        <div className="text-right flex-1 pr-4 space-y-0.5">
                          <div className="text-sm font-bold text-slate-100">{teams.homeYbty}</div>
                          <div className="text-xs font-semibold text-purple-300">{teams.homeLeisu}</div>
                        </div>

                        <div className="px-4 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-center min-w-[80px] shrink-0">
                          <div className="text-xl font-mono font-bold text-emerald-400">
                            {m.score ? `${m.score.home} - ${m.score.away}` : '0 - 0'}
                          </div>
                          <div className="text-[10px] text-slate-400 tracking-wider">
                            当前比分 {m.commence_time || m.ybty_start_time_beijing ? `(${m.commence_time || m.ybty_start_time_beijing})` : ''}
                          </div>
                        </div>

                        <div className="text-left flex-1 pl-4 space-y-0.5">
                          <div className="text-sm font-bold text-slate-100">{teams.awayYbty}</div>
                          <div className="text-xs font-semibold text-purple-300">{teams.awayLeisu}</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Recommendation Preview / Risk */}
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 text-xs space-y-1">
                    <div className="text-slate-400 flex justify-between">
                      <span>市场与盘口:</span>
                      <span className="font-semibold text-slate-200">
                        {m.recommendation ? `${m.recommendation.market || '未指定'} (${m.recommendation.line ?? ''}) @ ${m.recommendation.odds ?? ''}` : '观察模式 (无直接市场)'}
                      </span>
                    </div>
                    {m.intercept_reason && (
                      <div className="text-amber-400 text-[11px] flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{m.intercept_reason}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-4 bg-slate-950/80 border-t border-slate-800 space-y-4 text-xs">
                    {/* Weather Info */}
                    {m.weather?.available && m.weather.text && (
                      <div className="flex items-center gap-2 text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                        <CloudSun className="w-4 h-4 text-sky-400 shrink-0" />
                        <span>场地与天气: {m.weather.text.join(' | ')}</span>
                      </div>
                    )}

                    {/* Evidence & Risks */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {m.evidence && m.evidence.length > 0 && (
                        <div className="bg-emerald-950/20 border border-emerald-800/30 p-3 rounded-lg">
                          <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> 机器初筛依据 (Evidence)
                          </div>
                          <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                            {m.evidence.map((ev, i) => (
                              <li key={i}>{ev}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {m.risks && m.risks.length > 0 && (
                        <div className="bg-amber-950/20 border border-amber-800/30 p-3 rounded-lg">
                          <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> 风险提示 (Risks)
                          </div>
                          <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                            {m.risks.map((rk, i) => (
                              <li key={i}>{rk}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Lineup Section */}
                    {m.lineups && (
                      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg">
                        <div className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-indigo-400" /> 阵容与球员完整度 ({m.lineups.status || '信息'})
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px]">
                          <div>
                            <span className="text-slate-200 font-medium">{m.lineups.home?.team}:</span>{' '}
                            {m.lineups.home?.players?.slice(0, 5).join('、') || '暂无球员名单'}
                          </div>
                          <div>
                            <span className="text-slate-200 font-medium">{m.lineups.away?.team}:</span>{' '}
                            {m.lineups.away?.players?.slice(0, 5).join('、') || '暂无球员名单'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Live Text Timeline */}
                    {m.live_text?.entries && m.live_text.entries.length > 0 && (
                      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg">
                        <div className="font-semibold text-slate-300 mb-1">实况文字时间线 (Live Timeline)</div>
                        <div className="text-slate-400 text-[11px] max-h-24 overflow-y-auto space-y-1">
                          {m.live_text.entries.map((item, i) => (
                            <div key={i} className="border-b border-slate-800/40 pb-0.5">{item}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Supplement Modal */}
      {supplementMatch && (
        <DataSupplementModal
          match={supplementMatch}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSaveAndUpgrade={handleSaveSupplement}
          onSelectForAi={onSelectForAi}
        />
      )}

      {/* Batch Supplement Modal */}
      {selectedMatchNames.length > 0 && (
        <BatchSupplementModal
          selectedMatches={filteredMatches.filter((m) => selectedMatchNames.includes(m.match))}
          isOpen={isBatchModalOpen}
          onClose={() => setIsBatchModalOpen(false)}
          onApplyBatchUpdates={handleApplyBatchUpdates}
          onBatchSubmitToLedger={handleBatchSubmitToLedger}
        />
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { DecisionItem, PipelineStatus, getLeagueName, getTeamDisplay } from '../types';
import { DataSupplementModal } from './DataSupplementModal';
import { BatchSupplementModal } from './BatchSupplementModal';
import { 
  Calendar, 
  Clock, 
  Search, 
  Filter, 
  Sparkles, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  Edit3,
  CheckSquare,
  Square,
  CheckCircle2,
  ShieldCheck,
  Send,
  Trophy
} from 'lucide-react';

interface Props {
  decisions: DecisionItem[];
  pipelineStatus: PipelineStatus;
  summary: any;
  brief: any;
  onSelectForAi: (match: DecisionItem) => void;
}

export const PrematchMatchesView: React.FC<Props> = ({
  decisions,
  pipelineStatus,
  summary,
  brief,
  onSelectForAi,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
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

    const gradeMatch = gradeFilter === 'ALL' || match.grade === gradeFilter;

    return nameMatch && gradeMatch;
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
          score_source: 'user_quick_prematch_batch',
          status: 'WATCH',
          grade: m.grade === 'C' || !m.grade ? 'B' : m.grade,
          evidence: [...(m.evidence || []), '[赛前批量修补] 开赛时间与初盘数据补充完成'],
          risks: (m.risks || []).filter((r) => !r.includes('比分未经校验')),
        };
      }
    });
    setCustomUpdatedMatches(newCustoms);
    setBatchMsg(`已成功批量修补 ${selectedMatchNames.length} 场赛前赛事！`);
    setTimeout(() => setBatchMsg(null), 3000);
  };

  const handleClearOutdated = async () => {
    try {
      const res = await fetch('/api/clear-outdated-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'prematch' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBatchMsg(`🧹 已成功清空非滚球分析库！(共清空 ${data.cleared_prematch} 场旧比赛，推荐台账与复盘数据完好无损)。系统正在刷新...`);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      }
    } catch (e: any) {
      setBatchMsg(`清空失败: ${e.message}`);
    }
  };

  const handleBatchSubmitToLedger = async (itemsToSubmit?: DecisionItem[]) => {
    const list = itemsToSubmit || filteredMatches.filter((m) => selectedMatchNames.includes(m.match));
    if (list.length === 0) return;

    for (const m of list) {
      await fetch('/api/ledger/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match: m.match,
          ybty_home: m.ybty_home,
          ybty_away: m.ybty_away,
          minute: 0,
          score_at_recommendation: m.score || { home: 0, away: 0 },
          score_source: m.score_source || 'ybty_prematch',
          score_verified: true,
          grade: m.grade || 'B',
          model_score: m.model_score || 72.0,
          recommendation: m.recommendation || { market: '主胜 / 让球', line: '-0.5', odds: 1.85 },
          evidence: m.evidence || ['赛前基本面达标'],
          risks: m.risks || [],
          start_time_beijing: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
        }),
      });
    }

    setBatchMsg(`已成功将 ${list.length} 场赛前精选写入正式推荐台账！`);
    setSelectedMatchNames([]);
    setTimeout(() => setBatchMsg(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Pipeline Status Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 backdrop-blur shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg border border-sky-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                非滚球赛事库与研究队列 (Prematch Analysis)
              </h2>
              <p className="text-xs text-slate-400">
                初盘/赛前盘状态 | 涵盖近 24 小时待开赛事研究简报
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-slate-300">
              评估赛事: <span className="font-bold text-sky-400">{decisions.length}</span> 场
            </div>
            <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-slate-300">
              A/B 级研究队列: <span className="font-bold text-emerald-400">{summary.b_grade ?? 0}</span> 场
            </div>
            <button
              onClick={handleClearOutdated}
              className="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 rounded-lg font-bold flex items-center gap-1 transition-colors shadow-sm"
              title="一键清空非滚球分析库比赛（不影响历史推荐台账与复盘数据）"
            >
              🧹 清空非滚球分析库
            </button>
          </div>
        </div>
      </div>

      {/* AI Prematch Brief Highlights (if available) */}
      {brief && brief.highlights && (
        <div className="bg-gradient-to-r from-sky-950/40 to-slate-900/80 border border-sky-800/30 p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
            <FileText className="w-4 h-4" /> 赛前 AI 研判简报 (Prematch Intelligence Brief)
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{brief.summary || '已汇总赛前初盘变动、伤停与战意。'}</p>
        </div>
      )}

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
              <CheckSquare className="w-4 h-4 text-sky-400" />
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
              placeholder="搜索赛前赛事、球队..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> 评级筛选:
          </span>
          {['ALL', 'A', 'B', 'C'].map((g) => (
            <button
              key={g}
              onClick={() => setGradeFilter(g)}
              className={`px-3 py-1 rounded-lg border font-medium transition-all ${
                gradeFilter === g
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {g === 'ALL' ? '全部' : `${g}级`}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky Batch Action Bar */}
      {selectedMatchNames.length > 0 && (
        <div className="sticky top-4 z-40 bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 border-2 border-sky-500/80 rounded-xl p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center space-x-2 text-xs text-slate-100 font-bold">
            <span className="px-2.5 py-1 bg-sky-500 text-slate-950 rounded-lg font-mono text-sm font-extrabold">
              {selectedMatchNames.length}
            </span>
            <span>已选择 场赛前赛事</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={handleQuickBatchVerify}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/40 rounded-lg font-medium flex items-center gap-1.5 transition-all shadow"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>⚡ 批量标记时间/盘口修补完成</span>
            </button>

            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-md"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>🔧 批量配置修补参数</span>
            </button>

            <button
              onClick={() => handleBatchSubmitToLedger()}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-lg transition-all"
            >
              <Send className="w-3.5 h-3.5" /> 批量写入推荐台账
            </button>
          </div>
        </div>
      )}

      {/* Matches List */}
      {filteredMatches.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/40 border border-slate-800/60 rounded-xl">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">暂无符合条件的非滚球赛事数据</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredMatches.map((m, idx) => {
            const isExpanded = expandedMatch === m.match;
            const isSelected = selectedMatchNames.includes(m.match);

            return (
              <div
                key={m.match + idx}
                className={`bg-slate-900/70 border rounded-xl overflow-hidden transition-all ${
                  isSelected
                    ? 'border-sky-500 ring-2 ring-sky-500/30'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="p-4 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleSelectMatch(m.match)}
                      className={`p-1 rounded-md border transition-all ${
                        isSelected
                          ? 'bg-sky-500/20 text-sky-400 border-sky-500'
                          : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                      }`}
                      title="勾选进行批量修补数据"
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>

                    <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      非滚球 PREMATCH
                    </span>

                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-1" title="赛事联赛名称">
                      <Trophy className="w-3.5 h-3.5 text-purple-400" /> {getLeagueName(m)}
                    </span>

                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300">
                      {m.grade || 'C'}级
                    </span>

                    <div className="flex items-center gap-1 text-xs text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      <Clock className="w-3 h-3 text-sky-400" />
                      <span>{m.ybty_start_time_beijing || m.provider_start_time || '待定开赛'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenSupplement(m)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center gap-1 transition-all"
                      title="手动修补数据与时间"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      <span>补充数据</span>
                    </button>

                    <button
                      onClick={() => onSelectForAi(m)}
                      className="px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> 赛前基本面深挖
                    </button>

                    <button
                      onClick={() => toggleExpand(m.match)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                  {(() => {
                    const teams = getTeamDisplay(m);
                    return (
                      <div className="col-span-2 flex items-center justify-between bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                        <div className="text-right flex-1 pr-4 space-y-0.5">
                          <div className="text-sm font-bold text-slate-100">{teams.homeYbty}</div>
                          <div className="text-xs font-semibold text-purple-300">{teams.homeLeisu}</div>
                        </div>

                        <div className="px-3 py-1 bg-slate-900 border border-slate-700 rounded text-center shrink-0">
                          <div className="text-xs font-mono font-bold text-sky-400">VS</div>
                        </div>

                        <div className="text-left flex-1 pl-4 space-y-0.5">
                          <div className="text-sm font-bold text-slate-100">{teams.awayYbty}</div>
                          <div className="text-xs font-semibold text-purple-300">{teams.awayLeisu}</div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 text-xs space-y-1">
                    <div className="text-slate-400 flex justify-between">
                      <span>初始参考盘:</span>
                      <span className="font-semibold text-slate-200">
                        {m.reference_market?.opening_line ? JSON.stringify(m.reference_market.opening_line) : '水盘待查'}
                      </span>
                    </div>
                    <div className="text-slate-400 flex justify-between">
                      <span>即时水位:</span>
                      <span className="font-semibold text-sky-300">
                        {m.reference_market?.current_line ? JSON.stringify(m.reference_market.current_line) : '未变化'}
                      </span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 bg-slate-950/80 border-t border-slate-800 space-y-3 text-xs">
                    {m.evidence && m.evidence.length > 0 && (
                      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg">
                        <div className="font-semibold text-sky-400 mb-1">机器搜集考据 (Evidence)</div>
                        <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                          {m.evidence.map((ev, i) => (
                            <li key={i}>{ev}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {m.risks && m.risks.length > 0 && (
                      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg">
                        <div className="font-semibold text-amber-400 mb-1">风险拦截因素 (Risks)</div>
                        <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                          {m.risks.map((rk, i) => (
                            <li key={i}>{rk}</li>
                          ))}
                        </ul>
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

import React, { useState } from 'react';
import { DecisionItem } from '../types';
import { 
  X, 
  ShieldCheck, 
  CheckCircle2, 
  Layers, 
  Send, 
  Tag, 
  Save, 
  Edit3, 
  CheckSquare, 
  Square,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

interface Props {
  selectedMatches: DecisionItem[];
  isOpen: boolean;
  onClose: () => void;
  onApplyBatchUpdates: (updatedMatches: DecisionItem[]) => void;
  onBatchSubmitToLedger: (matchesToSubmit: DecisionItem[]) => Promise<void>;
}

export const BatchSupplementModal: React.FC<Props> = ({
  selectedMatches,
  isOpen,
  onClose,
  onApplyBatchUpdates,
  onBatchSubmitToLedger,
}) => {
  if (!isOpen || selectedMatches.length === 0) return null;

  // Batch Form Parameters
  const [markScoreVerified, setMarkScoreVerified] = useState(true);
  const [scoreSource, setScoreSource] = useState('user_manual_batch_verified');
  const [defaultMarket, setDefaultMarket] = useState('全场大球');
  const [defaultLine, setDefaultLine] = useState('2.25');
  const [defaultOdds, setDefaultOdds] = useState(1.88);
  const [batchNote, setBatchNote] = useState('批量补充核验数据，激活比分与盘口');

  // Multi-item selection within the modal
  const [selectedIds, setSelectedIds] = useState<string[]>(
    selectedMatches.map((m) => m.match)
  );

  // Batch JSON Import State
  const [batchPastedJson, setBatchPastedJson] = useState('');
  const [batchJsonMsg, setBatchJsonMsg] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Helper to parse batch JSON array and match against selectedMatches
  const handleBatchJsonParseAndApply = () => {
    if (!batchPastedJson.trim()) return;
    try {
      const parsed = JSON.parse(batchPastedJson.trim());
      let list: any[] = [];
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed.matches && Array.isArray(parsed.matches)) {
        list = parsed.matches.map((m: any) => ({ ...m, export_time: m.captured_at || parsed.captured_at }));
      } else if (parsed.events && Array.isArray(parsed.events)) {
        list = parsed.events.map((e: any) => ({ ...e, export_time: e.captured_at || parsed.captured_at }));
      } else if (parsed.decisions && Array.isArray(parsed.decisions)) {
        list = parsed.decisions;
      } else if (parsed.items && Array.isArray(parsed.items)) {
        list = parsed.items;
      } else {
        list = [parsed];
      }

      let matchCount = 0;
      // Map through selected matches and update those that match in the pasted JSON
      const updatedList = selectedMatches.map((m) => {
        const found = list.find((item) => {
          const itemHome = item.ybty_home || item.home || item.homeTeam?.name || item.home_team || '';
          const itemAway = item.ybty_away || item.away || item.awayTeam?.name || item.away_team || '';
          const itemMatch = item.match || `${itemHome} vs ${itemAway}`.trim();

          return (
            (itemMatch && m.match && itemMatch === m.match) ||
            (itemHome && m.ybty_home && (itemHome === m.ybty_home || m.ybty_home.includes(itemHome) || itemHome.includes(m.ybty_home))) ||
            (itemAway && m.ybty_away && (itemAway === m.ybty_away || m.ybty_away.includes(itemAway) || itemAway.includes(m.ybty_away)))
          );
        });

        if (found) {
          matchCount++;
          let hScore = m.score?.home ?? 0;
          let aScore = m.score?.away ?? 0;

          if (found.score) {
            if (typeof found.score === 'object') {
              hScore = found.score.home ?? hScore;
              aScore = found.score.away ?? aScore;
            } else if (typeof found.score === 'string' && found.score.includes('-')) {
              const [h, a] = found.score.split('-').map(Number);
              if (!isNaN(h)) hScore = h;
              if (!isNaN(a)) aScore = a;
            }
          }

          if (isNaN(hScore)) hScore = 0;
          if (isNaN(aScore)) aScore = 0;

          // Relative time calculation
          let calculatedTime = found.start_time_beijing || found.ybty_start_time_beijing || found.beijing_time;
          if (!calculatedTime) {
            const rawStr = String(
              found.commence_time ||
              found.start_time ||
              found.ybty_start_time ||
              found.countdown ||
              found.clock_status ||
              found.time_str ||
              found.time ||
              ''
            ).trim();

            if (/^\d{4}-\d{2}-\d{2}/.test(rawStr)) {
              calculatedTime = rawStr;
            } else if (/^\d{1,2}:\d{2}$/.test(rawStr) && !found.source_type?.includes('live') && !found.minute) {
              calculatedTime = rawStr;
            } else {
              const baseRaw = found.captured_at || found.export_time;
              const baseDate = baseRaw ? new Date(String(baseRaw).replace(' ', 'T')) : new Date();
              const validBase = isNaN(baseDate.getTime()) ? new Date() : baseDate;

              const isLive =
                found.source_type === 'live' ||
                found.is_live ||
                Boolean(found.minute && found.minute > 0) ||
                /^(?:[\d\+\']|半场|下半场|上半场)/.test(rawStr);

              if (isLive) {
                let elapsedMins = typeof found.minute === 'number' && found.minute > 0 ? found.minute : 0;
                if (!elapsedMins && rawStr) {
                  const mMatch = rawStr.match(/(\d+)/);
                  if (mMatch) elapsedMins = parseInt(mMatch[1], 10);
                }
                if (elapsedMins > 0) {
                  const startMs = validBase.getTime() - elapsedMins * 60 * 1000;
                  const calc = new Date(startMs);
                  const y = calc.getFullYear();
                  const month = String(calc.getMonth() + 1).padStart(2, '0');
                  const d = String(calc.getDate()).padStart(2, '0');
                  const hh = String(calc.getHours()).padStart(2, '0');
                  const mm = String(calc.getMinutes()).padStart(2, '0');
                  calculatedTime = `${y}-${month}-${d} ${hh}:${mm} (推算时间)`;
                }
              } else {
                let forwardMins: number | null = null;
                if (found.mins_until_start !== undefined && !isNaN(Number(found.mins_until_start))) {
                  forwardMins = Number(found.mins_until_start);
                } else if (rawStr.includes('后开赛') || rawStr.includes('分钟后')) {
                  const mMatch = rawStr.match(/(\d+)/);
                  if (mMatch) forwardMins = parseInt(mMatch[1], 10);
                }
                if (forwardMins !== null) {
                  const startMs = validBase.getTime() + forwardMins * 60 * 1000;
                  const calc = new Date(startMs);
                  const y = calc.getFullYear();
                  const month = String(calc.getMonth() + 1).padStart(2, '0');
                  const d = String(calc.getDate()).padStart(2, '0');
                  const hh = String(calc.getHours()).padStart(2, '0');
                  const mm = String(calc.getMinutes()).padStart(2, '0');
                  calculatedTime = `${y}-${month}-${d} ${hh}:${mm} (推算时间)`;
                }
              }
            }
          }

          return {
            ...m,
            score: { home: hScore, away: aScore },
            score_verified: true,
            score_source: 'batch_json_import',
            commence_time: calculatedTime || m.commence_time || m.ybty_start_time_beijing || '推算时间',
            ybty_start_time_beijing: calculatedTime || m.ybty_start_time_beijing || '推算时间',
            status: 'WATCH' as const,
            grade: m.grade === 'C' || !m.grade ? 'B' as const : m.grade,
            recommendation: {
              market: found.market || found.recommendation?.market || m.recommendation?.market || defaultMarket,
              line: found.line ?? found.recommendation?.line ?? m.recommendation?.line ?? defaultLine,
              odds: (() => {
                const val = Number(found.odds ?? found.recommendation?.odds ?? m.recommendation?.odds ?? defaultOdds);
                return isNaN(val) || val <= 0 ? 1.85 : val;
              })(),
            },
            evidence: [...(m.evidence || []), `[批量JSON导入刷盘成功] 已同步最新比分与水位 (${calculatedTime || '自动推算'})`],
            risks: (m.risks || []).filter((r) => !r.includes('比分未经校验') && !r.includes('开赛时间缺失')),
          };
        }
        return m;
      });

      onApplyBatchUpdates(updatedList);
      setBatchJsonMsg(`已自动比对并刷盘更新 ${matchCount} 场赛事的盘口与比分！`);
      setTimeout(() => setBatchJsonMsg(null), 3500);
    } catch (e) {
      alert('批量 JSON 解析失败！请输入包含赛事数组的标准 JSON');
    }
  };

  const toggleSelect = (matchName: string) => {
    if (selectedIds.includes(matchName)) {
      setSelectedIds(selectedIds.filter((id) => id !== matchName));
    } else {
      setSelectedIds([...selectedIds, matchName]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === selectedMatches.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectedMatches.map((m) => m.match));
    }
  };

  const generateUpdatedMatches = (): DecisionItem[] => {
    return selectedMatches.map((m) => {
      if (!selectedIds.includes(m.match)) return m;

      return {
        ...m,
        score_verified: markScoreVerified ? true : m.score_verified,
        score_source: markScoreVerified ? scoreSource : m.score_source,
        status: markScoreVerified ? 'WATCH' : m.status,
        grade: markScoreVerified ? (m.grade === 'C' || !m.grade ? 'B' : m.grade) : m.grade,
        recommendation: {
          market: m.recommendation?.market || defaultMarket,
          line: m.recommendation?.line ?? defaultLine,
          odds: m.recommendation?.odds ?? defaultOdds,
        },
        evidence: [
          ...(m.evidence || []),
          `[批量修补] ${batchNote}`,
          markScoreVerified ? `比分已批量核验: ${scoreSource}` : '比分未修补',
        ],
        risks: (m.risks || []).filter((r) => !r.includes('比分未经校验')),
      };
    });
  };

  const handleApplyOnly = () => {
    const updated = generateUpdatedMatches();
    onApplyBatchUpdates(updated);
    onClose();
  };

  const handleApplyAndLedgerSubmit = async () => {
    setIsSubmitting(true);
    const updated = generateUpdatedMatches();
    onApplyBatchUpdates(updated);
    
    // Filter only items that are selected to submit
    const itemsToSubmit = updated.filter((m) => selectedIds.includes(m.match));
    await onBatchSubmitToLedger(itemsToSubmit);
    
    setIsSubmitting(false);
    setSubmitSuccess(true);
    setTimeout(() => {
      setSubmitSuccess(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-emerald-800/60 rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                批量修补数据与一键激活台账 ({selectedMatches.length} 场比赛)
              </h3>
              <p className="text-xs text-slate-400">
                支持批量标记比分已校验、填充缺口盘口与参考赔率，直接升级为 WATCH / B级正式推荐。
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Batch Settings Form */}
        <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl space-y-4 text-xs">
          <div className="font-bold text-emerald-400 flex items-center gap-1.5 border-b border-slate-800/80 pb-2">
            <Edit3 className="w-4 h-4 text-emerald-400" />
            <span>统一修补参数配置 (Batch Application Parameters)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Score Verification Switch */}
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={markScoreVerified}
                  onChange={(e) => setMarkScoreVerified(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-bold text-slate-200">一键标记比分已核验 (score_verified = true)</span>
              </label>
              <p className="text-[11px] text-slate-400">
                自动清除“比分未经校验”风控标签，并将硬性拦截状态升级为 WATCH 观察。
              </p>
            </div>

            {/* Score Source Identifier */}
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
              <label className="block text-slate-400">比分核验来源标记 (score_source)</label>
              <input
                type="text"
                value={scoreSource}
                onChange={(e) => setScoreSource(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200"
              />
            </div>
          </div>

          {/* Default Recommendations */}
          <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-sky-400" /> 缺口盘口默认填充配置
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400">推荐玩法 (Market)</label>
                <input
                  type="text"
                  value={defaultMarket}
                  onChange={(e) => setDefaultMarket(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400">盘口 (Line)</label>
                <input
                  type="text"
                  value={defaultLine}
                  onChange={(e) => setDefaultLine(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400">参考赔率 (Odds)</label>
                <input
                  type="number"
                  step="0.01"
                  value={isNaN(defaultOdds) ? '' : defaultOdds}
                  onChange={(e) => setDefaultOdds(e.target.value === '' ? 1.85 : Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-slate-200 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Batch JSON Import & Auto-Matching Box */}
          <div className="bg-slate-900/90 p-3 rounded-lg border border-emerald-500/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                📋 批量粘贴最新 YBTY/雷速 导出数据 JSON (系统自动按队名自动匹配刷盘)
              </span>
            </div>
            <textarea
              rows={2}
              value={batchPastedJson}
              onChange={(e) => setBatchPastedJson(e.target.value)}
              placeholder='粘贴从 export_combined_data.py 或 JSON 导出的数组，如: [{ "match": "蔚山HD vs 全北现代", "score": "1-0", "market": "全场大球", "odds": 1.95 }, ...]'
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            {batchJsonMsg && (
              <div className="text-[11px] text-emerald-300 bg-emerald-950/90 p-1.5 rounded border border-emerald-700 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{batchJsonMsg}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleBatchJsonParseAndApply}
              className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded text-xs flex items-center justify-center gap-1.5 transition-colors shadow"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>⚡ 自动解析比对 JSON 并一键修补选中的 {selectedMatches.length} 场赛事</span>
            </button>
          </div>
        </div>

        {/* Selected Matches List with Checkboxes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold"
            >
              {selectedIds.length === selectedMatches.length ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />)}
              <span>{selectedIds.length === selectedMatches.length ? '取消全选' : '全选所有选定赛事'}</span>
            </button>

            <span>已应用勾选: {selectedIds.length} / {selectedMatches.length} 场</span>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-2 pr-1 text-xs">
            {selectedMatches.map((m, idx) => {
              const isChecked = selectedIds.includes(m.match);

              return (
                <div
                  key={m.match + idx}
                  onClick={() => toggleSelect(m.match)}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isChecked
                      ? 'bg-slate-900 border-emerald-500/50 text-slate-100'
                      : 'bg-slate-950/60 border-slate-800 text-slate-500 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={isChecked ? 'text-emerald-400' : 'text-slate-600'}>
                      {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-200">{m.match}</div>
                      <div className="text-[11px] text-slate-400">
                        YBTY: {m.ybty_home || '主队'} vs {m.ybty_away || '客队'} | 状态: {m.status || 'WATCH'} | 比分: {m.score ? `${m.score.home}-${m.score.away}` : '0-0'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 font-mono text-[11px]">
                    {m.score_verified ? (
                      <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                        比分已核验
                      </span>
                    ) : (
                      <span className="text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                        修补后为核验
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
          >
            取消关闭
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleApplyOnly}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
            >
              仅应用到列表更新 (仅页面预览)
            </button>

            <button
              onClick={handleApplyAndLedgerSubmit}
              disabled={isSubmitting || selectedIds.length === 0}
              className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg transition-all ${
                submitSuccess
                  ? 'bg-emerald-900 text-emerald-200 border border-emerald-600'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> 批量写入台账中...
                </>
              ) : submitSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> 批量写入完成！
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> 批量修补并一键写入正式台账
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { DecisionItem } from '../types';
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Edit3, 
  Save, 
  Clock, 
  Tag, 
  Zap,
  HelpCircle
} from 'lucide-react';

interface Props {
  match: DecisionItem;
  isOpen: boolean;
  onClose: () => void;
  onSaveAndUpgrade: (updatedMatch: DecisionItem) => void;
  onSelectForAi?: (updatedMatch: DecisionItem) => void;
}

export const DataSupplementModal: React.FC<Props> = ({
  match,
  isOpen,
  onClose,
  onSaveAndUpgrade,
  onSelectForAi,
}) => {
  if (!isOpen) return null;

  // Form State initialized from match
  const [ybtyHome, setYbtyHome] = useState(match.ybty_home || match.match.split('vs')[0]?.trim() || '');
  const [ybtyAway, setYbtyAway] = useState(match.ybty_away || match.match.split('vs')[1]?.trim() || '');
  const [scoreHome, setScoreHome] = useState<number>(match.score?.home ?? 0);
  const [scoreAway, setScoreAway] = useState<number>(match.score?.away ?? 0);
  const [scoreVerified, setScoreVerified] = useState<boolean>(match.score_verified ?? true);
  const [scoreSource, setScoreSource] = useState<string>(match.score_source || 'user_manual_verified');
  const [minute, setMinute] = useState<number>(match.minute ?? 0);
  const [startTimeBeijing, setStartTimeBeijing] = useState<string>(
    match.ybty_start_time_beijing || match.provider_start_time || '推算时间'
  );

  // Time Calculation Helper
  const [minsUntilStart, setMinsUntilStart] = useState<number>(20);
  const [exportTimeInput, setExportTimeInput] = useState<string>(
    new Date().toISOString().replace('T', ' ').substring(0, 19)
  );

  // JSON Import State
  const [rawPastedJson, setRawPastedJson] = useState<string>('');
  const [jsonImportSuccess, setJsonImportSuccess] = useState<string | null>(null);
  
  const [market, setMarket] = useState<string>(match.recommendation?.market || '全场大球');
  const [line, setLine] = useState<string | number>(match.recommendation?.line ?? '2.25');
  const [odds, setOdds] = useState<number>(match.recommendation?.odds ?? 1.88);
  const [userNote, setUserNote] = useState<string>('手动/导入补充缺失数据，确认比分与盘口无误');

  // Helper function to calculate exact Beijing time from export time + X mins
  const handleCalcExactBeijingTime = () => {
    try {
      const baseTime = exportTimeInput ? new Date(exportTimeInput) : new Date();
      if (isNaN(baseTime.getTime())) {
        alert('导出时间格式无效，请输入有效时间 (如: 2026-08-05 03:00:00)');
        return;
      }
      const calculated = new Date(baseTime.getTime() + minsUntilStart * 60 * 1000);
      const year = calculated.getFullYear();
      const month = String(calculated.getMonth() + 1).padStart(2, '0');
      const day = String(calculated.getDate()).padStart(2, '0');
      const hours = String(calculated.getHours()).padStart(2, '0');
      const minutes = String(calculated.getMinutes()).padStart(2, '0');

      const result = `${year}-${month}-${day} ${hours}:${minutes} (推算时间)`;
      setStartTimeBeijing(result);
    } catch (e) {
      console.error(e);
    }
  };

  // Helper function to auto-parse pasted JSON or export text
  const handleParseAndAutoFill = () => {
    if (!rawPastedJson.trim()) return;
    try {
      const parsed = JSON.parse(rawPastedJson.trim());
      // Support object or array item
      const item = Array.isArray(parsed) ? parsed[0] : parsed;

      let filledCount = 0;
      if (item.score || item.home_score !== undefined) {
        if (typeof item.score === 'object') {
          setScoreHome(item.score.home ?? 0);
          setScoreAway(item.score.away ?? 0);
        } else if (typeof item.score === 'string' && item.score.includes('-')) {
          const [h, a] = item.score.split('-').map(Number);
          setScoreHome(h || 0);
          setScoreAway(a || 0);
        } else if (item.home_score !== undefined && item.away_score !== undefined) {
          setScoreHome(item.home_score);
          setScoreAway(item.away_score);
        }
        setScoreVerified(true);
        setScoreSource('pasted_json_verified');
        filledCount++;
      }

      if (item.market || item.recommendation?.market || item.play_type) {
        setMarket(item.market || item.recommendation?.market || item.play_type);
        filledCount++;
      }
      if (item.line !== undefined || item.recommendation?.line !== undefined || item.handicap !== undefined) {
        setLine(item.line ?? item.recommendation?.line ?? item.handicap);
        filledCount++;
      }
      if (item.odds !== undefined || item.recommendation?.odds !== undefined) {
        setOdds(Number(item.odds ?? item.recommendation?.odds));
        filledCount++;
      }

      if (item.mins_until_start !== undefined || item.minutes_to_start !== undefined) {
        const mins = Number(item.mins_until_start ?? item.minutes_to_start);
        setMinsUntilStart(mins);
        const exportTime = item.export_time || exportTimeInput;
        const baseTime = new Date(exportTime);
        if (!isNaN(baseTime.getTime())) {
          const calculated = new Date(baseTime.getTime() + mins * 60 * 1000);
          const year = calculated.getFullYear();
          const month = String(calculated.getMonth() + 1).padStart(2, '0');
          const day = String(calculated.getDate()).padStart(2, '0');
          const hours = String(calculated.getHours()).padStart(2, '0');
          const minutes = String(calculated.getMinutes()).padStart(2, '0');
          setStartTimeBeijing(`${year}-${month}-${day} ${hours}:${minutes} (推算时间)`);
        }
        filledCount++;
      } else if (item.start_time_beijing || item.start_time) {
        setStartTimeBeijing(item.start_time_beijing || item.start_time);
        filledCount++;
      }

      setUserNote(`已成功从粘贴数据自动刷新盘口与比分 (${filledCount} 项)`);
      setJsonImportSuccess(`解析成功！已自动填充 ${filledCount} 处数据与盘口水位。`);
      setTimeout(() => setJsonImportSuccess(null), 3000);
    } catch (e) {
      alert('解析粘贴文本失败，请确保格式为标准 JSON 对象或包含 score/market/odds 字典');
    }
  };

  // Diagnose why it was PASS or incomplete
  const dataGaps = [];
  if (!match.score_verified) {
    dataGaps.push({ title: '比分待双源校验', desc: '雷速或YBTY比分接口未完成校验，无法直接升级为A/B级推荐。' });
  }
  if (!match.ybty_start_time_beijing && !match.provider_start_time) {
    dataGaps.push({ title: '开赛时间缺失', desc: '需要推算或手动补充准确开赛时间（北京时间）。' });
  }
  if (!match.recommendation || !match.recommendation.market) {
    dataGaps.push({ title: '盘口水位缺失', desc: '未抓取到已展开的关键大小球/让球盘口。' });
  }
  if (match.intercept_reason) {
    dataGaps.push({ title: '拦截规则触发', desc: match.intercept_reason });
  }

  const handleSave = () => {
    const updated: DecisionItem = {
      ...match,
      ybty_home: ybtyHome,
      ybty_away: ybtyAway,
      score: { home: Number(scoreHome), away: Number(scoreAway) },
      score_verified: scoreVerified,
      score_source: scoreSource,
      minute: Number(minute),
      ybty_start_time_beijing: startTimeBeijing,
      status: scoreVerified ? 'WATCH' : match.status,
      grade: scoreVerified ? (match.grade === 'C' || !match.grade ? 'B' : match.grade) : match.grade,
      recommendation: {
        market,
        line,
        odds: Number(odds),
      },
      evidence: [
        ...(match.evidence || []),
        `[人工修补] ${userNote}`,
        scoreVerified ? `比分已手动校验: ${scoreHome}-${scoreAway} (${scoreSource})` : '比分待继续核验',
      ],
      risks: (match.risks || []).filter((r) => !r.includes('比分未经校验')),
    };

    onSaveAndUpgrade(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-emerald-800/60 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                人工补充数据与突破 PASS 拦截
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  HUMAN IN THE LOOP
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                赛事: <strong className="text-slate-200">{match.match}</strong>
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

        {/* Data Gap Diagnosis Banner */}
        <div className="bg-slate-950/80 border border-amber-800/40 rounded-xl p-4 space-y-2">
          <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>拦截与缺口诊断 (Data Gap Diagnosis):</span>
          </div>
          {dataGaps.length === 0 ? (
            <p className="text-xs text-slate-300">本场比赛数据基本完备，可通过下方修改调整细节。</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {dataGaps.map((gap, idx) => (
                <div key={idx} className="bg-slate-900/60 p-2 rounded border border-slate-800 text-slate-300">
                  <span className="font-semibold text-amber-300">{gap.title}: </span>
                  <span className="text-slate-400">{gap.desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form Controls */}
        <div className="space-y-4 text-xs">
          {/* Team Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">YBTY 原始主队名称</label>
              <input
                type="text"
                value={ybtyHome}
                onChange={(e) => setYbtyHome(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">YBTY 原始客队名称</label>
              <input
                type="text"
                value={ybtyAway}
                onChange={(e) => setYbtyAway(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Scores & Score Verification */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                比分与双源核验标记
              </span>
              <label className="flex items-center gap-2 cursor-pointer bg-emerald-950/40 px-3 py-1 rounded-lg border border-emerald-800/50">
                <input
                  type="checkbox"
                  checked={scoreVerified}
                  onChange={(e) => setScoreVerified(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-emerald-300 font-semibold">标记为比分已手动核验 (score_verified = true)</span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">主队比分</label>
                <input
                  type="number"
                  min="0"
                  value={isNaN(scoreHome) ? '' : scoreHome}
                  onChange={(e) => setScoreHome(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-center font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">客队比分</label>
                <input
                  type="number"
                  min="0"
                  value={isNaN(scoreAway) ? '' : scoreAway}
                  onChange={(e) => setScoreAway(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-center font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">进行分钟 / 状态</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={isNaN(minute) ? '' : minute}
                  onChange={(e) => setMinute(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-center font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">开赛时间 (北京时间 / 雷速补充时间)</label>
              <input
                type="text"
                value={startTimeBeijing}
                onChange={(e) => setStartTimeBeijing(e.target.value)}
                placeholder="例如: 2026-08-05 03:00 (雷速补充)"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
              />
            </div>

            {/* Quick Time Calculator from "X mins to start" + Export Time */}
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-2 mt-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  YBTY “X分钟后开赛” 精确北京时间自动推算器
                </span>
                <span className="text-[10px] text-amber-400/80">符合协议 Rule #6</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div>
                  <label className="block text-[11px] text-slate-400">YBTY 导出基准时间</label>
                  <input
                    type="text"
                    value={exportTimeInput}
                    onChange={(e) => setExportTimeInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-[11px] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400">“X分钟后开赛” 分钟数</label>
                  <input
                    type="number"
                    value={isNaN(minsUntilStart) ? '' : minsUntilStart}
                    onChange={(e) => setMinsUntilStart(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-[11px] font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCalcExactBeijingTime}
                  className="px-3 py-1 bg-amber-600/80 hover:bg-amber-500 text-white rounded text-[11px] font-bold flex items-center justify-center gap-1 transition-all h-[28px]"
                >
                  <Zap className="w-3 h-3" />
                  <span>自动推算并应用时间</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Paste JSON / Export File Data Import Tool */}
          <div className="bg-slate-950/80 p-4 rounded-xl border border-emerald-800/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                📥 快捷导入 JSON / 导出的最新盘口与比分 (不用手动敲字)
              </span>
              <span className="text-[10px] text-slate-400">粘贴直接自动刷盘</span>
            </div>
            <p className="text-[11px] text-slate-400">
              直接粘贴您导出的 YBTY/雷速 JSON 片段或文本对象，系统将自动识别并更新盘口水位、比分与开赛时间：
            </p>
            <textarea
              rows={2}
              value={rawPastedJson}
              onChange={(e) => setRawPastedJson(e.target.value)}
              placeholder='例如: { "score": "2-1", "market": "全场大球", "line": "2.25", "odds": 1.92, "mins_until_start": 20 }'
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            {jsonImportSuccess && (
              <div className="text-[11px] text-emerald-300 bg-emerald-950/80 p-2 rounded border border-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{jsonImportSuccess}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleParseAndAutoFill}
              className="w-full py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>⚡ 一键解析并自动填充以上所有缺口</span>
            </button>
          </div>

          {/* Recommendation Market, Line & Odds */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-sky-400" />
              推荐玩法、盘口与参考赔率
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">推荐玩法 (Market)</label>
                <input
                  type="text"
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  placeholder="如: 全场大球 / 波胆 / 双方进球"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">盘口 (Line)</label>
                <input
                  type="text"
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                  placeholder="如: 2.25 / 2-1 / 双方进球-是"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">参考赔率 (Odds)</label>
                <input
                  type="number"
                  step="0.01"
                  value={isNaN(odds) ? '' : odds}
                  onChange={(e) => setOdds(e.target.value === '' ? 1.85 : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono"
                />
              </div>
            </div>

            {/* Quick Market Presets for Extended Types */}
            <div className="pt-2 border-t border-slate-800">
              <label className="block text-[11px] text-slate-400 mb-1.5">⚡ 快捷预设多维度玩法:</label>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {[
                  { m: '全场大球', l: '2.25', o: 1.90 },
                  { m: '滚球让球', l: '-0.5', o: 1.88 },
                  { m: '波胆预测', l: '2 - 1', o: 8.50 },
                  { m: '双方进球', l: '双方进球-是', o: 1.83 },
                  { m: '进球单双', l: '单数', o: 1.93 },
                  { m: '时间区间', l: '31-45min 有球', o: 2.10 },
                  { m: '反弹抄底节点', l: '32-35min 大0.75', o: 1.85 },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setMarket(preset.m);
                      setLine(preset.l);
                      setOdds(preset.o);
                    }}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded font-mono text-[10px] transition-colors"
                  >
                    {preset.m}: {preset.l} (@{preset.o})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* User Notes */}
          <div>
            <label className="block text-slate-400 mb-1">人工核验说明 / 证据补充</label>
            <input
              type="text"
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
            />
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

          <div className="flex items-center gap-2">
            {onSelectForAi && (
              <button
                onClick={() => {
                  handleSave();
                  onSelectForAi({
                    ...match,
                    ybty_home: ybtyHome,
                    ybty_away: ybtyAway,
                    score: { home: Number(scoreHome), away: Number(scoreAway) },
                    score_verified: scoreVerified,
                    minute: Number(minute),
                    recommendation: { market, line, odds: Number(odds) },
                  });
                  onClose();
                }}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg transition-all"
              >
                <Sparkles className="w-4 h-4" /> 补充并立即 AI 深度评估
              </button>
            )}

            <button
              onClick={() => {
                handleSave();
                onClose();
              }}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-all"
            >
              <Save className="w-4 h-4" /> 保存并升级为 WATCH / 可推荐
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

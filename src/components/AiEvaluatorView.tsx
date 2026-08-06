import React, { useState } from 'react';
import { DecisionItem, AIAnalysisResponse, getLeagueName, getTeamDisplay } from '../types';
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
  Trophy
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Props {
  selectedMatch: DecisionItem | null;
  allMatches: DecisionItem[];
  onRefreshLedger?: () => void;
}

export const AiEvaluatorView: React.FC<Props> = ({ selectedMatch, allMatches, onRefreshLedger }) => {
  const [matchName, setMatchName] = useState(selectedMatch?.match || '');
  const [ybtyHome, setYbtyHome] = useState(selectedMatch?.ybty_home || '');
  const [ybtyAway, setYbtyAway] = useState(selectedMatch?.ybty_away || '');
  const [minute, setMinute] = useState<number>(selectedMatch?.minute || 0);
  const [scoreHome, setScoreHome] = useState<number>(selectedMatch?.score?.home || 0);
  const [scoreAway, setScoreAway] = useState<number>(selectedMatch?.score?.away || 0);
  const [oddsInfo, setOddsInfo] = useState('');
  const [mode, setMode] = useState<'live_eval' | 'prematch_eval' | 'parlay_check'>('live_eval');

  const [parlaySelected, setParlaySelected] = useState<DecisionItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIAnalysisResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedToLedger, setSavedToLedger] = useState(false);

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
  };

  // Sync state when selectedMatch changes from parent
  React.useEffect(() => {
    if (selectedMatch) {
      populateFromMatch(selectedMatch);
    }
  }, [selectedMatch]);

  const toggleParlayMatch = (match: DecisionItem) => {
    if (parlaySelected.some((m) => m.match === match.match)) {
      setParlaySelected(parlaySelected.filter((m) => m.match !== match.match));
    } else {
      setParlaySelected([...parlaySelected, match]);
    }
  };

  const handlePromoteCurrentToLedger = async () => {
    if (!result) return;
    try {
      let payloadMatch = matchName || `${ybtyHome} vs ${ybtyAway}`;
      let payloadHome = ybtyHome;
      let payloadAway = ybtyAway;
      let payloadMarket = result.recommendation?.market || 'AI精选建议';
      let payloadLine = result.recommendation?.line ?? null;
      let payloadOdds = Number(result.recommendation?.odds || 1.85);

      if (mode === 'parlay_check' && parlaySelected.length > 0) {
        payloadMatch = `【AI 精选 ${parlaySelected.length}串1】${parlaySelected[0].ybty_home || parlaySelected[0].match} 等 ${parlaySelected.length} 场`;
        payloadHome = parlaySelected[0].ybty_home || '多场串关';
        payloadAway = parlaySelected[0].ybty_away || '';
        const legsSummary = parlaySelected
          .map((p, i) => `腿${i + 1}: [${p.match}] ${p.recommendation?.market || '独赢'} ${p.recommendation?.line || ''} @${p.recommendation?.odds || 1.85}`)
          .join(' | ');
        payloadMarket = `【${parlaySelected.length}串1精选彩票】${legsSummary}`;
        
        const calcTotalOdds = parlaySelected.reduce((acc, p) => acc * Number(p.recommendation?.odds || 1.85), 1).toFixed(2);
        payloadLine = `总赔率 @${calcTotalOdds}`;
        payloadOdds = Number(calcTotalOdds);
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
          score_verified: result.score_verified ?? true,
          grade: result.grade || 'B',
          model_score: result.grade === 'A' ? 88.0 : 78.0,
          recommendation: {
            market: payloadMarket,
            line: payloadLine,
            odds: payloadOdds,
          },
          evidence: result.evidence || [],
          risks: result.risks || [],
        }),
      });

      if (resp.ok) {
        setSavedToLedger(true);
        if (onRefreshLedger) onRefreshLedger();
      }
    } catch (err) {
      console.error('Failed to add to ledger', err);
    }
  };

  const handleEvaluate = async () => {
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setSavedToLedger(false);

    try {
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
          selected_candidates: mode === 'parlay_check' ? parlaySelected : undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'AI 评估请求失败');
      }

      setResult(data);
    } catch (err: any) {
      setErrorMsg(err.message || '评估失败');
    } finally {
      setLoading(false);
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
              <Layers className="w-4 h-4 text-indigo-400" /> 选择串关腿 (已选 {parlaySelected.length} 腿)
            </h3>
            <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
              风控规则: 同一核心腿最多进入一组串关，杯赛轮换未确认最高C级
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
            {allMatches.map((m, idx) => {
              const isSelected = parlaySelected.some((p) => p.match === m.match);
              return (
                <div
                  key={m.match + idx}
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
                </div>
              );
            })}
          </div>

          <button
            onClick={handleEvaluate}
            disabled={loading || parlaySelected.length < 2}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            运行串关硬性风控与相关性审查
          </button>
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-200">待评估单场数据</h3>
            
            {/* Quick Match Selector Dropdown */}
            {allMatches.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">⚡ 快速载入赛事:</span>
                <select
                  onChange={(e) => {
                    const found = allMatches.find((m) => m.match === e.target.value);
                    if (found) populateFromMatch(found);
                  }}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 max-w-xs"
                >
                  <option value="">-- 选择实时/赛前比赛 --</option>
                  {allMatches.map((m, idx) => {
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

          <button
            onClick={handleEvaluate}
            disabled={loading || !ybtyHome || !ybtyAway}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            开始 AI 协议深挖与等级判定
          </button>
        </div>
      )}

      {/* Error Output */}
      {errorMsg && (
        <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* AI Output Result */}
      {result && (
        <div className="bg-slate-900/90 border border-emerald-800/40 p-5 rounded-xl space-y-4 shadow-xl">
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

          <div className="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
            <ReactMarkdown>{result.summary}</ReactMarkdown>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {result.evidence && result.evidence.length > 0 && (
              <div className="bg-emerald-950/20 border border-emerald-800/30 p-3 rounded-lg">
                <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 逻辑与依据 (Evidence)
                </div>
                <ul className="list-disc list-inside text-slate-300 space-y-1">
                  {result.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
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
                    <li key={i}>{r}</li>
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
                    <li key={idx}>{res}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Detailed Ticket preview for Parlay Check */}
          {mode === 'parlay_check' && parlaySelected.length > 0 && (
            <div className="bg-gradient-to-r from-slate-950 via-indigo-950/40 to-slate-950 border border-indigo-500/40 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded font-bold text-xs">
                    精选 {parlaySelected.length} 串 1 实单
                  </span>
                  <span className="text-xs text-amber-300 font-mono font-bold">
                    组合估算总赔率 @{parlaySelected.reduce((acc, p) => acc * Number(p.recommendation?.odds || 1.85), 1).toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={handlePromoteCurrentToLedger}
                  disabled={savedToLedger}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md transition-all ${
                    savedToLedger
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  {savedToLedger ? '已将该串关单写入正式台账' : '📥 一键将该串关单写入正式推荐台账'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                {parlaySelected.map((leg, idx) => (
                  <div key={leg.match + idx} className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>腿 #{idx + 1}</span>
                      <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded">{leg.grade || 'B'}级</span>
                    </div>
                    <div className="font-bold text-slate-200 text-xs truncate">
                      {leg.ybty_home || leg.match} vs {leg.ybty_away || ''}
                    </div>
                    <div className="flex justify-between text-[11px] font-mono text-emerald-400">
                      <span>{leg.recommendation?.market || '全场独赢'} ({leg.recommendation?.line || '盘'})</span>
                      <span className="text-amber-300 font-bold">@{leg.recommendation?.odds || 1.85}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

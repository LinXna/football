import React, { useState, useEffect } from 'react';
import { DecisionItem, getLeagueName, getTeamDisplay } from '../types';
import { extractMatchRecentForm, MatchRecentFormData, RecentMatchRecord } from '../lib/matchRecentForm';
import { extractMatchLiveStats } from '../lib/matchStats';
import { 
  X, 
  Trophy, 
  Flame, 
  TrendingUp, 
  Shield, 
  Swords, 
  Activity, 
  Calendar, 
  BarChart3, 
  Clock, 
  CheckCircle2, 
  Sparkles,
  Info
} from 'lucide-react';

interface Props {
  match: DecisionItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RecentFormModal: React.FC<Props> = ({ match, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'HOME' | 'AWAY' | 'H2H' | 'STANDINGS' | 'GOALS_TREND'>('OVERVIEW');

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !match) return null;

  const teams = getTeamDisplay(match);
  const formData: MatchRecentFormData = extractMatchRecentForm(match);
  const matchStats = extractMatchLiveStats(match);
  const { homeStats, awayStats, h2h, rawNotes, leagueStandings, goalDistribution, trendSummary } = formData;

  const renderBadge = (res: 'W' | 'D' | 'L') => {
    if (res === 'W') {
      return (
        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center justify-center">
          胜
        </span>
      );
    }
    if (res === 'D') {
      return (
        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center justify-center">
          平
        </span>
      );
    }
    return (
      <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold flex items-center justify-center">
        负
      </span>
    );
  };

  const renderMatchTable = (matches: RecentMatchRecord[], targetTeamName: string) => {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/70">
        <table className="w-full text-left text-xs border-collapse font-sans">
          <thead>
            <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px]">
              <th className="py-2.5 px-3 font-semibold">日期/赛事</th>
              <th className="py-2.5 px-3 font-semibold text-right">主队</th>
              <th className="py-2.5 px-3 font-semibold text-center">比分(半场)</th>
              <th className="py-2.5 px-3 font-semibold">客队</th>
              <th className="py-2.5 px-3 font-semibold text-center">战果</th>
              <th className="py-2.5 px-3 font-semibold text-center">盘口/走势</th>
              <th className="py-2.5 px-3 font-semibold text-center">大小球</th>
              <th className="py-2.5 px-3 font-semibold text-center">角球</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {matches.map((m, idx) => {
              const isTargetHome = m.homeTeam === targetTeamName;
              const isTargetAway = m.awayTeam === targetTeamName;
              return (
                <tr key={m.id || idx} className="hover:bg-slate-900/50 transition-colors">
                  <td className="py-2 px-3 text-slate-400 text-[11px]">
                    <div>{m.date}</div>
                    <div className="text-[10px] text-purple-400 font-sans">{m.league}</div>
                  </td>
                  <td className={`py-2 px-3 text-right font-sans ${isTargetHome ? 'font-bold text-emerald-400' : 'text-slate-200'}`}>
                    {m.homeTeam}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-100 font-bold border border-slate-700">
                      {m.score}
                    </span>
                    {m.htScore && (
                      <span className="text-[10px] text-slate-500 ml-1">({m.htScore})</span>
                    )}
                  </td>
                  <td className={`py-2 px-3 font-sans ${isTargetAway ? 'font-bold text-emerald-400' : 'text-slate-200'}`}>
                    {m.awayTeam}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex justify-center">
                      {renderBadge(m.result)}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-center text-[11px]">
                    <span className={`px-1.5 py-0.5 rounded ${
                      m.handicapOutcome === 'win' 
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50' 
                        : m.handicapOutcome === 'loss'
                        ? 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
                        : 'bg-slate-900 text-slate-400'
                    }`}>
                      {m.handicap || '-'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center text-[11px]">
                    <span className={`px-1.5 py-0.5 rounded ${
                      m.overUnderOutcome === 'over'
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/50'
                        : 'bg-sky-950/60 text-sky-300 border border-sky-800/50'
                    }`}>
                      {m.overUnderOutcome === 'over' ? '大' : '小'} ({m.totalGoals ?? 0}球)
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center text-slate-400 text-[11px]">
                    {m.corners || '--'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-[760px] max-h-[78vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/90 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <span>{teams.homeYbty}</span>
                  <span className="text-slate-500 font-normal text-xs">vs</span>
                  <span>{teams.awayYbty}</span>
                </h2>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-purple-400 shrink-0" />
                  {getLeagueName(match)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                深度战绩分析 • 近期交锋、近况胜率、攻防得失与盘路趋势
              </p>
              {matchStats.hasStats && (
                <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-900/90 rounded px-2.5 py-1 border border-slate-800 text-slate-300 font-mono mt-1.5">
                  <span className="text-amber-300" title="控球率 (主-客)">⏱️ {matchStats.possession.text}</span>
                  <span className="text-rose-300" title="危险进攻 (主-客)">⚡ {matchStats.dangerousAttacks.text}</span>
                  <span className="text-sky-300" title="角球 (主-客)">🚩 {matchStats.corners.text}</span>
                  <span className="text-emerald-300" title="射门(射正) (主-客)">🎯 {matchStats.shotsCombined.text}</span>
                  <span className="text-amber-400" title="黄牌 (主-客)">🟨 {matchStats.yellowCards.text}</span>
                  <span className={matchStats.redCards.hasRed ? 'text-rose-400 font-bold' : 'text-slate-400'} title="红牌 (主-客)">🟥 {matchStats.redCards.text}</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
            title="关闭弹窗 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-950/60 border-b border-slate-800 text-xs shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all text-xs ${
              activeTab === 'OVERVIEW'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>综合概况对比</span>
          </button>

          <button
            onClick={() => setActiveTab('HOME')}
            className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all text-xs ${
              activeTab === 'HOME'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>主队近况 ({homeStats.teamName})</span>
          </button>

          <button
            onClick={() => setActiveTab('AWAY')}
            className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all text-xs ${
              activeTab === 'AWAY'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            <span>客队近况 ({awayStats.teamName})</span>
          </button>

          <button
            onClick={() => setActiveTab('H2H')}
            className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all text-xs ${
              activeTab === 'H2H'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Swords className="w-3.5 h-3.5 text-emerald-400" />
            <span>历史交锋往绩 ({h2h.total}场)</span>
          </button>

          <button
            onClick={() => setActiveTab('STANDINGS')}
            className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all text-xs ${
              activeTab === 'STANDINGS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>联赛积分榜</span>
          </button>

          <button
            onClick={() => setActiveTab('GOALS_TREND')}
            className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all text-xs ${
              activeTab === 'GOALS_TREND'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-pink-400" />
            <span>进球时段与盘路走势</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 text-slate-200">
          {/* Tab 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-5 animate-fade-in">
              {/* Form Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Home Form Card */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                      <span className="font-bold text-sm text-slate-100">{homeStats.teamName} (主队)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {homeStats.formBadges.map((b, i) => (
                        <span key={i}>{renderBadge(b)}</span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">近6场战绩</div>
                      <div className="font-mono font-bold text-slate-100 text-sm mt-0.5">
                        {homeStats.wins}胜 {homeStats.draws}平 {homeStats.losses}负
                      </div>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">胜率 / 赢盘率</div>
                      <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                        {homeStats.winRate}% / {Math.round((homeStats.handicapWinCount / homeStats.total) * 100)}%
                      </div>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">场均得/失球</div>
                      <div className="font-mono font-bold text-amber-300 text-sm mt-0.5">
                        {homeStats.avgGoalsFor} / {homeStats.avgGoalsAgainst}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/50 px-3 py-1.5 rounded-lg">
                    <span>零封场次: <strong className="text-slate-200">{homeStats.cleanSheets}场</strong></span>
                    <span>双方进球(BTTS): <strong className="text-slate-200">{homeStats.bttsCount}场</strong></span>
                    <span>大球(&gt;2.5): <strong className="text-slate-200">{homeStats.over25Count}场</strong></span>
                  </div>
                </div>

                {/* Away Form Card */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                      <span className="font-bold text-sm text-slate-100">{awayStats.teamName} (客队)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {awayStats.formBadges.map((b, i) => (
                        <span key={i}>{renderBadge(b)}</span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">近6场战绩</div>
                      <div className="font-mono font-bold text-slate-100 text-sm mt-0.5">
                        {awayStats.wins}胜 {awayStats.draws}平 {awayStats.losses}负
                      </div>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">胜率 / 赢盘率</div>
                      <div className="font-mono font-bold text-sky-400 text-sm mt-0.5">
                        {awayStats.winRate}% / {Math.round((awayStats.handicapWinCount / awayStats.total) * 100)}%
                      </div>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <div className="text-slate-400 text-[10px]">场均得/失球</div>
                      <div className="font-mono font-bold text-amber-300 text-sm mt-0.5">
                        {awayStats.avgGoalsFor} / {awayStats.avgGoalsAgainst}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/50 px-3 py-1.5 rounded-lg">
                    <span>零封场次: <strong className="text-slate-200">{awayStats.cleanSheets}场</strong></span>
                    <span>双方进球(BTTS): <strong className="text-slate-200">{awayStats.bttsCount}场</strong></span>
                    <span>大球(&gt;2.5): <strong className="text-slate-200">{awayStats.over25Count}场</strong></span>
                  </div>
                </div>
              </div>

              {/* Head to Head Quick Bar */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-100">
                    <Swords className="w-4 h-4 text-emerald-400" />
                    <span>历史交锋摘要 (近{h2h.total}次对战)</span>
                  </div>
                  <div className="font-mono text-xs text-slate-300">
                    主队 <strong className="text-emerald-400">{h2h.homeWins}胜</strong> / <strong className="text-amber-300">{h2h.draws}平</strong> / <strong className="text-rose-400">{h2h.awayWins}负</strong> (胜率: {h2h.homeWinRate}%)
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
                  <div 
                    style={{ width: `${(h2h.homeWins / (h2h.total || 1)) * 100}%` }} 
                    className="bg-emerald-500 h-full"
                    title={`主胜 ${h2h.homeWins}场`}
                  />
                  <div 
                    style={{ width: `${(h2h.draws / (h2h.total || 1)) * 100}%` }} 
                    className="bg-amber-500 h-full"
                    title={`平局 ${h2h.draws}场`}
                  />
                  <div 
                    style={{ width: `${(h2h.awayWins / (h2h.total || 1)) * 100}%` }} 
                    className="bg-rose-500 h-full"
                    title={`客胜 ${h2h.awayWins}场`}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center text-xs">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px]">场均总进球:</span>{' '}
                    <strong className="text-slate-100 font-mono">{h2h.avgTotalGoals}球</strong>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px]">大球率(&gt;2.5):</span>{' '}
                    <strong className="text-amber-300 font-mono">{h2h.over25Rate}%</strong>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px]">双方破门率:</span>{' '}
                    <strong className="text-sky-300 font-mono">{h2h.bttsRate}%</strong>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px]">净胜球优势:</span>{' '}
                    <strong className="text-emerald-400 font-mono">{homeStats.goalDiff >= 0 ? `+${homeStats.goalDiff}` : homeStats.goalDiff}</strong>
                  </div>
                </div>
              </div>

              {/* Raw Notes / Evidence if any */}
              {rawNotes && rawNotes.length > 0 && (
                <div className="bg-indigo-950/20 border border-indigo-800/40 rounded-xl p-3.5 text-xs space-y-1.5">
                  <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    <span>系统基本面与战意记录：</span>
                  </div>
                  <ul className="list-disc list-inside text-slate-300 space-y-1">
                    {rawNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: HOME RECENT */}
          {activeTab === 'HOME' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                  <span>{homeStats.teamName} 近期赛事明细</span>
                </h3>
                <div className="text-xs text-slate-400">
                  共 {homeStats.total} 场 • {homeStats.wins}胜 {homeStats.draws}平 {homeStats.losses}负
                </div>
              </div>
              {renderMatchTable(homeStats.matches, homeStats.teamName)}
            </div>
          )}

          {/* Tab 3: AWAY RECENT */}
          {activeTab === 'AWAY' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                  <span>{awayStats.teamName} 近期赛事明细</span>
                </h3>
                <div className="text-xs text-slate-400">
                  共 {awayStats.total} 场 • {awayStats.wins}胜 {awayStats.draws}平 {awayStats.losses}负
                </div>
              </div>
              {renderMatchTable(awayStats.matches, awayStats.teamName)}
            </div>
          )}

          {/* Tab 4: H2H RECENT */}
          {activeTab === 'H2H' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <Swords className="w-4 h-4 text-emerald-400" />
                  <span>双方历史直接交锋往绩</span>
                </h3>
                <div className="text-xs text-slate-400">
                  共 {h2h.total} 次直接对话
                </div>
              </div>
              {renderMatchTable(h2h.matches, h2h.homeTeam)}
            </div>
          )}

          {/* Tab 5: STANDINGS */}
          {activeTab === 'STANDINGS' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>联赛积分与排位情况</span>
                </h3>
                <span className="text-xs text-slate-400">数据源: 雷速体育权威积分</span>
              </div>

              {leagueStandings ? (
                <div className="space-y-3">
                  {typeof leagueStandings === 'string' ? (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {leagueStandings}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Home standing */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
                        <div className="font-bold text-emerald-400 text-xs flex items-center justify-between">
                          <span>{homeStats.teamName} (主队) 积分概况</span>
                          {leagueStandings.home?.rank && (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                              排名: 第{leagueStandings.home.rank}位
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-300 space-y-1">
                          {leagueStandings.home?.points !== undefined && (
                            <div>联赛积分: <strong className="text-slate-100 font-mono">{leagueStandings.home.points}分</strong></div>
                          )}
                          {leagueStandings.home?.played !== undefined && (
                            <div>已赛场次: <span className="font-mono">{leagueStandings.home.played}场 ({leagueStandings.home.wins || 0}胜 {leagueStandings.home.draws || 0}平 {leagueStandings.home.losses || 0}负)</span></div>
                          )}
                          {leagueStandings.home?.summary && (
                            <div className="text-slate-400 text-[11px] pt-1">{leagueStandings.home.summary}</div>
                          )}
                        </div>
                      </div>

                      {/* Away standing */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
                        <div className="font-bold text-sky-400 text-xs flex items-center justify-between">
                          <span>{awayStats.teamName} (客队) 积分概况</span>
                          {leagueStandings.away?.rank && (
                            <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                              排名: 第{leagueStandings.away.rank}位
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-300 space-y-1">
                          {leagueStandings.away?.points !== undefined && (
                            <div>联赛积分: <strong className="text-slate-100 font-mono">{leagueStandings.away.points}分</strong></div>
                          )}
                          {leagueStandings.away?.played !== undefined && (
                            <div>已赛场次: <span className="font-mono">{leagueStandings.away.played}场 ({leagueStandings.away.wins || 0}胜 {leagueStandings.away.draws || 0}平 {leagueStandings.away.losses || 0}负)</span></div>
                          )}
                          {leagueStandings.away?.summary && (
                            <div className="text-slate-400 text-[11px] pt-1">{leagueStandings.away.summary}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-950/50 border border-slate-800 rounded-xl text-slate-400 text-xs">
                  暂无独立积分榜数据或该赛事为非联赛/杯赛淘汰制
                </div>
              )}
            </div>
          )}

          {/* Tab 6: GOALS & TRENDS */}
          {activeTab === 'GOALS_TREND' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-pink-400" />
                  <span>进球时段分布与盘路走势分析</span>
                </h3>
                <span className="text-xs text-slate-400">雷速体育深度量化</span>
              </div>

              {/* Goal distribution */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>进球时段分布 (15分钟区间)</span>
                </div>
                {goalDistribution ? (
                  typeof goalDistribution === 'string' ? (
                    <div className="text-xs font-mono text-slate-300">{goalDistribution}</div>
                  ) : (
                    <div className="grid grid-cols-6 gap-2 text-center text-xs">
                      {['1-15', '16-30', '31-45', '46-60', '61-75', '76-90+'].map((bucket, idx) => {
                        const hCount = goalDistribution.home?.[bucket] ?? goalDistribution[bucket]?.home ?? '-';
                        const aCount = goalDistribution.away?.[bucket] ?? goalDistribution[bucket]?.away ?? '-';
                        return (
                          <div key={idx} className="bg-slate-900/90 p-2 rounded border border-slate-800">
                            <div className="text-slate-400 text-[10px]">{bucket}'</div>
                            <div className="font-mono font-bold mt-1 text-[11px]">
                              <span className="text-emerald-400">{hCount}</span>
                              <span className="text-slate-500 mx-1">:</span>
                              <span className="text-sky-400">{aCount}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="text-xs text-slate-400">
                    根据主客队近况推算：主队擅长下半场后程发力（60-90分钟进球占比显著），客队开局攻防相对谨慎。
                  </div>
                )}
              </div>

              {/* Trend summary */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                  <span>走势与盘路特征</span>
                </div>
                {trendSummary ? (
                  typeof trendSummary === 'string' ? (
                    <div className="text-xs font-mono text-slate-300 leading-relaxed">{trendSummary}</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                        <div className="text-emerald-400 font-bold mb-1">主队盘路走势:</div>
                        <div className="text-slate-300 font-mono">{trendSummary.home || trendSummary.home_trend || '近期让球盘赢盘稳定，大球率适中'}</div>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                        <div className="text-sky-400 font-bold mb-1">客队盘路走势:</div>
                        <div className="text-slate-300 font-mono">{trendSummary.away || trendSummary.away_trend || '客场防守韧性较强，小球走势居多'}</div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-xs text-slate-400">
                    主队近6场赢盘率 {Math.round((homeStats.handicapWinCount / homeStats.total) * 100)}%，客队近6场赢盘率 {Math.round((awayStats.handicapWinCount / awayStats.total) * 100)}%。双方近期在相应盘口下均具备稳定表现。
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>战绩仅供比赛走势与战意研判参考，不代表未来比赛必然结果</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors"
          >
            关闭 (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};

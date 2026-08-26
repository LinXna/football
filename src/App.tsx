import React, { lazy, Suspense, useEffect, useState, useMemo } from 'react';
import { 
  StandardMatchData,
  DecisionItem, 
  PipelineStatus, 
  LedgerItem, 
  TeamAliasMap,
  toStandardMatchData 
} from './types';
import { BettingRecommendationsView } from './components/BettingRecommendationsView';
import { CanonicalMatchCenter } from './components/CanonicalMatchCenter';
import { SystemAlertHubModal } from './components/SystemAlertHubModal';
import { requestJson } from './lib/apiClient';
import { SystemAlertEvent, UnknownEnumReport } from '../refactor/00_common/errors';

import { 
  Activity, 
  Calendar, 
  Sparkles, 
  FileCheck2, 
  Users, 
  Download, 
  RefreshCw, 
  ShieldCheck,
  Trophy,
  CheckSquare,
  AlertCircle,
  Layers,
  ShieldAlert
} from 'lucide-react';
import { UnverifiedScoresModal } from './components/UnverifiedScoresModal';
import { ErrorBoundary } from './components/ErrorBoundary';

const LiveMatchesView = lazy(() => import('./components/LiveMatchesView').then(({ LiveMatchesView }) => ({ default: LiveMatchesView })));
const PrematchMatchesView = lazy(() => import('./components/PrematchMatchesView').then(({ PrematchMatchesView }) => ({ default: PrematchMatchesView })));
const AiEvaluatorView = lazy(() => import('./components/AiEvaluatorView').then(({ AiEvaluatorView }) => ({ default: AiEvaluatorView })));
const LedgerView = lazy(() => import('./components/LedgerView').then(({ LedgerView }) => ({ default: LedgerView })));
const TeamAliasesView = lazy(() => import('./components/TeamAliasesView').then(({ TeamAliasesView }) => ({ default: TeamAliasesView })));
const ExportDataView = lazy(() => import('./components/ExportDataView').then(({ ExportDataView }) => ({ default: ExportDataView })));

export default function App() {
  const [activeTab, setActiveTab] = useState<'canonical' | 'recommendations' | 'live' | 'prematch' | 'ai' | 'ledger' | 'aliases' | 'export'>('canonical');

  // Live Data
  const [livePipeline, setLivePipeline] = useState<PipelineStatus>({});
  const [liveDecisions, setLiveDecisions] = useState<DecisionItem[]>([]);
  const [liveSummary, setLiveSummary] = useState<any>({});

  // Prematch Data
  const [prematchPipeline, setPrematchPipeline] = useState<PipelineStatus>({});
  const [prematchDecisions, setPrematchDecisions] = useState<DecisionItem[]>([]);
  const [prematchSummary, setPrematchSummary] = useState<any>({});
  const [prematchBrief, setPrematchBrief] = useState<any>({});

  // Ledger Data
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [backtestReport, setBacktestReport] = useState<{ report: string; formal_results: any }>({ report: '', formal_results: {} });

  // Team Aliases
  const [manualAliases, setManualAliases] = useState<TeamAliasMap>({});
  const [autoAliases, setAutoAliases] = useState<TeamAliasMap>({});

  // Selected Match for AI Evaluator
  const [selectedMatchForAi, setSelectedMatchForAi] = useState<DecisionItem | null>(null);

  // Modals
  const [showUnverifiedModal, setShowUnverifiedModal] = useState<boolean>(false);
  const [isAlertHubOpen, setIsAlertHubOpen] = useState<boolean>(false);

  // System Alerts & Unknown Enums
  const [systemAlerts, setSystemAlerts] = useState<SystemAlertEvent[]>([]);
  const [unknownEnums, setUnknownEnums] = useState<UnknownEnumReport[]>([]);

  const [loading, setLoading] = useState(true);

  const fetchAlertsData = async () => {
    try {
      const data = await requestJson<{ success: boolean; alerts: SystemAlertEvent[]; unknown_enums: UnknownEnumReport[] }>('/api/refactor/alerts');
      if (data && data.success) {
        setSystemAlerts(data.alerts || []);
        setUnknownEnums(data.unknown_enums || []);
      }
    } catch (err) {
      // 静默
    }
  };

  const handleClearSystemAlerts = async () => {
    try {
      await fetch('/api/refactor/alerts/clear', { method: 'POST' });
      setSystemAlerts([]);
      setUnknownEnums([]);
    } catch (err) {
      console.error('清空告警失败', err);
    }
  };

  const fetchLiveData = async () => {
    try {
      const data = await requestJson<any>('/api/pipeline/live');
      setLivePipeline(data.status || {});
      setLiveDecisions((data.decisions || []).map(toStandardMatchData));
      setLiveSummary(data.summary || {});
    } catch (err) {
      console.error('Failed to fetch live data', err);
    }
  };

  const fetchPrematchData = async () => {
    try {
      const data = await requestJson<any>('/api/pipeline/prematch');
      setPrematchPipeline(data.status || {});
      setPrematchDecisions((data.decisions || []).map(toStandardMatchData));
      setPrematchSummary(data.summary || {});
      setPrematchBrief(data.brief || {});
    } catch (err) {
      console.error('Failed to fetch prematch data', err);
    }
  };

  const fetchLedgerData = async () => {
    try {
      const data = await requestJson<LedgerItem[]>('/api/ledger');
      setLedger(data || []);
    } catch (err) {
      console.error('Failed to fetch ledger data', err);
    }
  };

  const fetchBacktestData = async () => {
    try {
      const data = await requestJson<{ report: string; formal_results: any }>('/api/backtest');
      setBacktestReport(data || { report: '', formal_results: {} });
    } catch (err) {
      console.error('Failed to fetch backtest report', err);
    }
  };

  const fetchAliasesData = async () => {
    try {
      const data = await requestJson<{ manual: TeamAliasMap; auto: TeamAliasMap }>('/api/aliases');
      setManualAliases(data.manual || {});
      setAutoAliases(data.auto || {});
    } catch (err) {
      console.error('Failed to fetch aliases', err);
    }
  };

  const reloadAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchAlertsData(),
      fetchLiveData(),
      fetchPrematchData(),
      fetchLedgerData(),
      fetchBacktestData(),
      fetchAliasesData(),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    reloadAll();
    const interval = setInterval(fetchAlertsData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectForAi = (match: DecisionItem) => {
    setSelectedMatchForAi(match);
    setActiveTab('ai');
  };

  const allMatchesForParlay = [...liveDecisions, ...prematchDecisions];

  // Calculate total unverified matches count
  const unverifiedMatchesCount = useMemo(() => {
    const keys = new Set<string>();
    const clean = (s: string) => (s || '').trim().toLowerCase().replace(/[\s\-_]/g, '');

    ledger.forEach((item) => {
      if (item.parlay_legs && item.parlay_legs.length > 0) {
        item.parlay_legs.forEach((leg) => {
          if (!leg.score_verified || leg.final_score === undefined || leg.final_score === null) {
            keys.add(clean(leg.match || `${leg.ybty_home}_vs_${leg.ybty_away}`));
          }
        });
      } else {
        if (!item.score_verified || !item.review?.final_score) {
          keys.add(clean(item.match || `${item.ybty_home}_vs_${item.ybty_away}`));
        }
      }
    });

    liveDecisions.forEach((m) => {
      if (m.score_verified === false || !m.score) {
        keys.add(clean(m.match || `${m.ybty_home}_vs_${m.ybty_away}`));
      }
    });

    prematchDecisions.forEach((m) => {
      if (m.score_verified === false || !m.score) {
        keys.add(clean(m.match || `${m.ybty_home}_vs_${m.ybty_away}`));
      }
    });

    return keys.size;
  }, [ledger, liveDecisions, prematchDecisions]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-xl shadow-lg shadow-emerald-950/40">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100 tracking-tight flex items-center gap-2">
                足球比赛分析系统
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  LX v2026
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                YBTY × 雷速双源交叉验证 · 硬性风控 · 推荐台账
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 系统告警与数据质量审计中心入口按钮 */}
            <button
              id="btn-open-alert-hub"
              onClick={() => setIsAlertHubOpen(true)}
              className={`px-3 py-1.5 rounded-lg transition-all border flex items-center gap-1.5 text-xs font-semibold shadow-sm ${
                systemAlerts.length > 0 || unknownEnums.length > 0
                  ? "bg-amber-950/70 border-amber-700/80 text-amber-300 hover:bg-amber-900/80"
                  : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
              title="打开统一系统告警与数据质量审计中心"
            >
              <ShieldAlert className={`w-3.5 h-3.5 ${systemAlerts.length > 0 ? "text-amber-400 animate-pulse" : "text-slate-500"}`} />
              <span>系统审计与告警</span>
              {(systemAlerts.length > 0 || unknownEnums.length > 0) && (
                <span className="px-1.5 py-0.2 text-[10px] bg-amber-600 text-white font-mono rounded-full">
                  {systemAlerts.length || unknownEnums.length}
                </span>
              )}
            </button>

            {/* Unified Unverified Scores Center Header Entry Point */}
            <button
              onClick={() => setShowUnverifiedModal(true)}
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg transition-colors border border-amber-500/30 flex items-center gap-1.5 text-xs font-semibold shadow-sm"
              title="按比赛统一录入台账中的半场与完场比分，并同步所有玩法和串关腿"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>统一录入比赛比分</span>
            </button>

            <span className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              严禁重复核心腿暴露 · 必须保存比分验证
            </span>

            <button
              onClick={reloadAll}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700 flex items-center gap-1.5 text-xs font-medium"
              title="刷新全部数据"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">刷新数据</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto border-t border-slate-800/60 pt-1 pb-1">
          <button
            id="tab-canonical-center"
            onClick={() => setActiveTab('canonical')}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'canonical'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-blue-400 hover:text-blue-200 hover:bg-blue-950/40 border border-blue-800/40'
            }`}
          >
            <Layers className="w-4 h-4 text-blue-400" /> 标准赛事数据中心 (SSOT)
          </button>

          <button
            onClick={() => setActiveTab('recommendations')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'recommendations'
                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <CheckSquare className="w-4 h-4 text-emerald-400" /> 投注建议中心 ({liveDecisions.length + prematchDecisions.length})
          </button>

          <button
            onClick={() => setActiveTab('live')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'live'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-4 h-4 text-rose-400" /> 滚球决策 ({liveDecisions.length})
          </button>

          <button
            onClick={() => setActiveTab('prematch')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'prematch'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Calendar className="w-4 h-4 text-blue-400" /> 赛前决策 ({prematchDecisions.length})
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'ai'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" /> AI 决策与研判
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'ledger'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileCheck2 className="w-4 h-4 text-emerald-400" /> 推荐台账 ({ledger.length})
          </button>

          <button
            onClick={() => setActiveTab('aliases')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'aliases'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Users className="w-4 h-4 text-amber-400" /> 球队别名库 ({Object.keys(manualAliases).length + Object.keys(autoAliases).length})
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'export'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Download className="w-4 h-4 text-cyan-400" /> 整合数据导出
          </button>
        </div>
      </header>

      {/* Main Content View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        }>
          <ErrorBoundary>
            {activeTab === 'canonical' && (
              <CanonicalMatchCenter />
            )}

            {activeTab === 'recommendations' && (
              <BettingRecommendationsView
                liveMatches={liveDecisions}
                prematchMatches={prematchDecisions}
                onSelectForAi={handleSelectForAi}
                onRefreshLedger={fetchLedgerData}
              />
            )}

            {activeTab === 'live' && (
              <LiveMatchesView
                pipelineStatus={livePipeline}
                decisions={liveDecisions}
                summary={liveSummary}
                onSelectForAi={handleSelectForAi}
                onRefreshAll={reloadAll}
              />
            )}

            {activeTab === 'prematch' && (
              <PrematchMatchesView
                pipelineStatus={prematchPipeline}
                decisions={prematchDecisions}
                summary={prematchSummary}
                brief={prematchBrief}
                onSelectForAi={handleSelectForAi}
                onRefreshAll={reloadAll}
              />
            )}

            {activeTab === 'ai' && (
              <AiEvaluatorView
                selectedMatch={selectedMatchForAi}
                allMatches={allMatchesForParlay}
                liveMatches={liveDecisions}
                prematchMatches={prematchDecisions}
                onRefreshLedger={fetchLedgerData}
              />
            )}

            {activeTab === 'ledger' && (
              <LedgerView
                ledger={ledger}
                backtestReport={backtestReport}
              />
            )}

            {activeTab === 'aliases' && (
              <TeamAliasesView
                manualAliases={manualAliases}
                autoAliases={autoAliases}
                onRefresh={fetchAliasesData}
              />
            )}

            {activeTab === 'export' && (
              <ExportDataView onRefreshAll={reloadAll} />
            )}
          </ErrorBoundary>
        </Suspense>
      </main>

      {/* Unverified Scores Center Modal */}
      <UnverifiedScoresModal
        isOpen={showUnverifiedModal}
        onClose={() => setShowUnverifiedModal(false)}
        ledger={ledger}
        liveMatches={liveDecisions}
        prematchMatches={prematchDecisions}
        onRefreshAll={reloadAll}
      />

      {/* Unified System Alert Hub Modal */}
      <SystemAlertHubModal
        isOpen={isAlertHubOpen}
        onClose={() => setIsAlertHubOpen(false)}
        alerts={systemAlerts}
        unknownEnums={unknownEnums}
        onClearAlerts={handleClearSystemAlerts}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-[11px] text-slate-500">
        <p>足球比赛分析系统 · 遵循 CUSTOM_INSTRUCTIONS_COMPLETE.md 分析协议 · YBTY × 雷速实时匹配与核验</p>
      </footer>
    </div>
  );
}

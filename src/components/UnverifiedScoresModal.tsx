import React, { useState, useEffect } from 'react';
import { LedgerItem, DecisionItem, getLeagueName, getTeamDisplay } from '../types';
import { isSameTeamName, parseMatchTeams, areQualifiersCompatible, normalizeTeamName, getUnifiedTeamDisplay } from '../utils/teamUtils';
import { 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Check, 
  Search, 
  Sparkles, 
  ClipboardCheck, 
  ShieldCheck, 
  Layers, 
  Save, 
  RefreshCw,
  Filter,
  CheckSquare,
  Square
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ledger: LedgerItem[];
  liveMatches: DecisionItem[];
  prematchMatches: DecisionItem[];
  onRefreshAll: () => void;
}

export interface UnverifiedMatchItem {
  key: string;
  match: string;
  ybty_home: string;
  ybty_away: string;
  leisu_home?: string;
  leisu_away?: string;
  league: string;
  sourceType: 'ledger_single' | 'ledger_parlay_leg' | 'live' | 'prematch';
  sourceLabel: string;
  commence_time: string;
  homeScore: number;
  awayScore: number;
  htHomeScore: number | string;
  htAwayScore: number | string;
  scoreVerified: boolean;
  selected: boolean;
  hasScoreEntered: boolean;
  aliases?: string[];
}

export const UnverifiedScoresModal: React.FC<Props> = ({
  isOpen,
  onClose,
  ledger,
  liveMatches,
  prematchMatches,
  onRefreshAll,
}) => {
  const [items, setItems] = useState<UnverifiedMatchItem[]>([]);
  const [filterSource, setFilterSource] = useState<'ALL' | 'ledger' | 'live' | 'prematch'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [quickPasteText, setQuickPasteText] = useState('');
  const [showQuickPaste, setShowQuickPaste] = useState(false);
  const [aliasMap, setAliasMap] = useState<Record<string, string[]>>({});
  const [candidatesList, setCandidatesList] = useState<any[]>([]);

  // Fetch aliases dictionary and pipeline candidates
  useEffect(() => {
    if (isOpen) {
      Promise.all([
        fetch('/api/aliases').then((r) => r.json()).catch(() => ({})),
        fetch('/api/pipeline/live').then((r) => r.json()).catch(() => ({})),
        fetch('/api/pipeline/prematch').then((r) => r.json()).catch(() => ({})),
      ]).then(([aliasData, liveData, prematchData]) => {
        const combined: Record<string, string[]> = {};
        if (aliasData.manual) {
          Object.entries(aliasData.manual).forEach(([k, v]) => {
            combined[k.toLowerCase()] = Array.isArray(v) ? (v as string[]) : [String(v)];
          });
        }
        if (aliasData.auto) {
          Object.entries(aliasData.auto).forEach(([k, v]) => {
            const key = k.toLowerCase();
            const arr = Array.isArray(v) ? (v as string[]) : [String(v)];
            combined[key] = combined[key] ? Array.from(new Set([...combined[key], ...arr])) : arr;
          });
        }
        setAliasMap(combined);

        const allCandidates = [
          ...(liveData.candidates || []),
          ...(prematchData.candidates || []),
        ];
        setCandidatesList(allCandidates);
      });
    }
  }, [isOpen]);

  // Scan and build unverified list using unified team display logic
  const scanUnverifiedMatches = () => {
    const map = new Map<string, UnverifiedMatchItem>();
    const cleanName = (str: string) => normalizeTeamName(str);
    const mergeMatchItem = (candidate: UnverifiedMatchItem) => {
      const existing = map.get(candidate.key);
      if (!existing) {
        map.set(candidate.key, candidate);
        return;
      }
      const candidateHasHt = candidate.htHomeScore !== '' && candidate.htAwayScore !== '';
      const existingHasHt = existing.htHomeScore !== '' && existing.htAwayScore !== '';
      map.set(candidate.key, {
        ...existing,
        homeScore: candidate.hasScoreEntered ? candidate.homeScore : existing.homeScore,
        awayScore: candidate.hasScoreEntered ? candidate.awayScore : existing.awayScore,
        htHomeScore: candidateHasHt ? candidate.htHomeScore : existing.htHomeScore,
        htAwayScore: candidateHasHt ? candidate.htAwayScore : existing.htAwayScore,
        hasScoreEntered: existing.hasScoreEntered || candidate.hasScoreEntered,
        scoreVerified: existing.scoreVerified || candidate.scoreVerified,
        sourceLabel: candidateHasHt && !existingHasHt ? candidate.sourceLabel : existing.sourceLabel,
      });
    };

    // 1. Scan Ledger items
    ledger.forEach((item) => {
      // Check parlay legs
      if (item.parlay_legs && item.parlay_legs.length > 0) {
        item.parlay_legs.forEach((leg) => {
          const isVerified = leg.score_verified === true;
          const hasFinalScore = leg.final_score !== undefined && leg.final_score !== null;

          {
            const teams = getUnifiedTeamDisplay(leg);
            const h = teams.ybtyHome;
            const a = teams.ybtyAway;
            const key = `${cleanName(h)}_vs_${cleanName(a)}`;

            mergeMatchItem({
                key,
                match: leg.match || `${h} vs ${a}`,
                ybty_home: h,
                ybty_away: a,
                leisu_home: teams.leisuHome,
                leisu_away: teams.leisuAway,
                league: getLeagueName(leg),
                sourceType: 'ledger_parlay_leg',
                sourceLabel: '台账串关腿',
                commence_time: item.start_time_beijing || '推算时间',
                homeScore: leg.final_score?.home ?? 0,
                awayScore: leg.final_score?.away ?? 0,
                htHomeScore: leg.ht_score?.home ?? '',
                htAwayScore: leg.ht_score?.away ?? '',
                scoreVerified: true,
                selected: true,
                hasScoreEntered: hasFinalScore,
                aliases: [],
              });
          }
        });
      } else {
        // Single ledger item
        const isVerified = item.score_verified === true;
        const hasFinalScore = item.review?.final_score !== undefined && item.review?.final_score !== null;

        {
          const teams = getUnifiedTeamDisplay(item);
          const h = teams.ybtyHome;
          const a = teams.ybtyAway;
          const key = `${cleanName(h)}_vs_${cleanName(a)}`;

          mergeMatchItem({
              key,
              match: item.match || `${h} vs ${a}`,
              ybty_home: h,
              ybty_away: a,
              leisu_home: teams.leisuHome,
              leisu_away: teams.leisuAway,
              league: getLeagueName(item),
              sourceType: 'ledger_single',
              sourceLabel: '台账单场推荐',
              commence_time: item.start_time_beijing || '推算时间',
              homeScore: item.review?.final_score?.home ?? 0,
              awayScore: item.review?.final_score?.away ?? 0,
              htHomeScore: item.review?.ht_score?.home ?? item.ht_score?.home ?? '',
              htAwayScore: item.review?.ht_score?.away ?? item.ht_score?.away ?? '',
              scoreVerified: true,
              selected: true,
              hasScoreEntered: hasFinalScore,
              aliases: [],
            });
        }
      }
    });

    // 2. Scan Live Decisions
    liveMatches.forEach((m) => {
      if (m.score_verified === false || !m.score) {
        const teams = getUnifiedTeamDisplay(m);
        const h = teams.ybtyHome;
        const a = teams.ybtyAway;
        const key = `${cleanName(h)}_vs_${cleanName(a)}`;

        mergeMatchItem({
            key,
            match: m.match || `${h} vs ${a}`,
            ybty_home: h,
            ybty_away: a,
            leisu_home: teams.leisuHome,
            leisu_away: teams.leisuAway,
            league: getLeagueName(m),
            sourceType: 'live',
            sourceLabel: '滚球数据库',
            commence_time: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
            homeScore: m.score?.home ?? 0,
            awayScore: m.score?.away ?? 0,
            htHomeScore: m.ht_score?.home ?? '',
            htAwayScore: m.ht_score?.away ?? '',
            scoreVerified: true,
            selected: true,
            hasScoreEntered: false,
            aliases: [],
          });
      }
    });

    // 3. Scan Prematch Decisions
    prematchMatches.forEach((m) => {
      if (m.score_verified === false || !m.score) {
        const teams = getUnifiedTeamDisplay(m);
        const h = teams.ybtyHome;
        const a = teams.ybtyAway;
        const key = `${cleanName(h)}_vs_${cleanName(a)}`;

        mergeMatchItem({
            key,
            match: m.match || `${h} vs ${a}`,
            ybty_home: h,
            ybty_away: a,
            leisu_home: teams.leisuHome,
            leisu_away: teams.leisuAway,
            league: getLeagueName(m),
            sourceType: 'prematch',
            sourceLabel: '非滚球数据库',
            commence_time: m.ybty_start_time_beijing || m.provider_start_time || '推算时间',
            homeScore: m.score?.home ?? 0,
            awayScore: m.score?.away ?? 0,
            htHomeScore: m.ht_score?.home ?? '',
            htAwayScore: m.ht_score?.away ?? '',
            scoreVerified: true,
            selected: true,
            hasScoreEntered: false,
            aliases: [],
          });
      }
    });

    setItems(Array.from(map.values()));
  };

  useEffect(() => {
    if (isOpen) {
      scanUnverifiedMatches();
    }
  }, [isOpen, ledger, liveMatches, prematchMatches, aliasMap, candidatesList]);

  if (!isOpen) return null;

  const filteredItems = items.filter((item) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return filterSource === 'ALL' || (filterSource === 'ledger' ? item.sourceType.startsWith('ledger') : item.sourceType === filterSource);

    const matchesSearch =
      item.match.toLowerCase().includes(term) ||
      item.ybty_home.toLowerCase().includes(term) ||
      item.ybty_away.toLowerCase().includes(term) ||
      (item.leisu_home && item.leisu_home.toLowerCase().includes(term)) ||
      (item.leisu_away && item.leisu_away.toLowerCase().includes(term)) ||
      item.league.toLowerCase().includes(term) ||
      (item.aliases && item.aliases.some((a) => a.toLowerCase().includes(term)));

    if (!matchesSearch) return false;

    if (filterSource === 'ledger') return item.sourceType.startsWith('ledger');
    if (filterSource === 'live') return item.sourceType === 'live';
    if (filterSource === 'prematch') return item.sourceType === 'prematch';

    return true;
  });

  const selectedCount = filteredItems.filter((i) => i.selected).length;

  const handleToggleSelect = (key: string) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, selected: !i.selected } : i))
    );
  };

  const handleToggleSelectAll = () => {
    const allSelected = filteredItems.every((i) => i.selected);
    const filteredKeys = new Set(filteredItems.map((i) => i.key));

    setItems((prev) =>
      prev.map((i) => (filteredKeys.has(i.key) ? { ...i, selected: !allSelected } : i))
    );
  };

  const handleScoreChange = (key: string, field: 'home' | 'away', val: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.key === key) {
          const newHome = field === 'home' ? val : i.homeScore;
          const newAway = field === 'away' ? val : i.awayScore;
          return {
            ...i,
            homeScore: newHome,
            awayScore: newAway,
            hasScoreEntered: true,
          };
        }
        return i;
      })
    );
  };

  const handleHtScoreChange = (key: string, field: 'home' | 'away', val: number | string) => {
    setItems((prev) => prev.map((item) => item.key === key
      ? { ...item, [field === 'home' ? 'htHomeScore' : 'htAwayScore']: val, hasScoreEntered: true }
      : item));
  };

  const handleToggleVerified = (key: string) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, scoreVerified: !i.scoreVerified } : i))
    );
  };

  // Quick Paste Parsing Logic
  const handleApplyQuickPaste = () => {
    if (!quickPasteText.trim()) return;

    const lines = quickPasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    let matchedCount = 0;

    setItems((prev) =>
      prev.map((item) => {
        for (const line of lines) {
          // Look for score pattern e.g. "2-1" or "2 : 1"
          const scoreMatch = line.match(/(\d+)\s*[:\-\—\s]\s*(\d+)/);
          if (!scoreMatch) continue;

          const hVal = parseInt(scoreMatch[1], 10);
          const aVal = parseInt(scoreMatch[2], 10);

          // Check if line mentions team name or matches order
          if (
            line.includes(item.ybty_home) ||
            line.includes(item.ybty_away) ||
            (item.leisu_home && line.includes(item.leisu_home)) ||
            (item.leisu_away && line.includes(item.leisu_away)) ||
            (item.aliases && item.aliases.some((a) => line.includes(a))) ||
            line.includes(item.match) ||
            lines.length === prev.length
          ) {
            matchedCount++;
            return {
              ...item,
              homeScore: hVal,
              awayScore: aVal,
              hasScoreEntered: true,
              selected: true,
            };
          }
        }
        return item;
      })
    );

    setSuccessMsg(`已根据文本模式比分匹配并填充 ${matchedCount} 场比赛！`);
    setShowQuickPaste(false);
    setQuickPasteText('');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Submit Batch Updates to Server
  const handleSubmitBatch = async (itemsToSubmit?: UnverifiedMatchItem[]) => {
    const list = itemsToSubmit || filteredItems.filter((i) => i.selected);
    if (list.length === 0) return;

    setIsSubmitting(true);
    try {
      const payload = list.filter((i) => i.hasScoreEntered).map((i) => ({
        match: i.match,
        ybty_home: i.ybty_home,
        ybty_away: i.ybty_away,
        final_score: { home: i.homeScore, away: i.awayScore },
        ht_score: i.htHomeScore !== '' && i.htAwayScore !== ''
          ? { home: Number(i.htHomeScore), away: Number(i.htAwayScore) }
          : undefined,
        score: { home: i.homeScore, away: i.awayScore },
        score_verified: i.scoreVerified,
        score_source: 'unified_unverified_center',
      }));

      let savedMatches = 0;
      let updatedRecords = 0;
      const errors: string[] = [];
      for (const item of payload) {
        const res = await fetch('/api/ledger/update-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            match: item.match,
            ybty_home: item.ybty_home,
            ybty_away: item.ybty_away,
            final_score: item.final_score,
            ht_score: item.ht_score,
            score_verified: item.score_verified,
            syncSameMatch: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          savedMatches++;
          updatedRecords += Number(data.updatedCount || 0);
        } else {
          errors.push(`${item.match}: ${data.error || `HTTP ${res.status}`}`);
        }
      }

      if (savedMatches > 0) {
        setSuccessMsg(
          `统一保存成功：${savedMatches} 场比赛已持久化，共同步 ${updatedRecords} 条台账/串关记录${errors.length ? `；失败 ${errors.length} 场` : ''}。`
        );
        onRefreshAll();
        setTimeout(() => {
          setSuccessMsg(null);
          scanUnverifiedMatches();
        }, 2000);
      } else {
        setSuccessMsg(errors.length ? `保存失败：${errors.slice(0, 2).join('；')}` : '没有填写需要保存的比分。');
      }
    } catch (err) {
      console.error('Batch score submit error', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                台账比赛统一比分录入中心
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  共 {items.length} 场待补全
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                按比赛去重统一填写半场与完场比分，一次保存后同步全部单场玩法及串关腿
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Quick Action Banner */}
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setFilterSource('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterSource === 'ALL'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                台账全部比赛 ({items.length})
              </button>
              <button
                onClick={() => setFilterSource('ledger')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterSource === 'ledger'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                仅台账/串关腿 ({items.filter((i) => i.sourceType.startsWith('ledger')).length})
              </button>
              <button
                onClick={() => setFilterSource('live')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterSource === 'live'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                滚球库 ({items.filter((i) => i.sourceType === 'live').length})
              </button>
              <button
                onClick={() => setFilterSource('prematch')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterSource === 'prematch'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                非滚球库 ({items.filter((i) => i.sourceType === 'prematch').length})
              </button>
            </div>

            {/* Quick Paste Toggle */}
            <button
              onClick={() => setShowQuickPaste(!showQuickPaste)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-teal-400" />
              文本极速匹配比分
            </button>
          </div>

          {/* Quick Paste Textarea */}
          {showQuickPaste && (
            <div className="p-3 bg-slate-950 rounded-xl border border-teal-500/30 space-y-2 animate-in fade-in duration-150">
              <label className="text-xs font-medium text-teal-300 flex items-center justify-between">
                <span>粘贴完场比分文本 (每行一场，支持 "主队 vs 客队 2-1" 或纯数字 "2-1"):</span>
                <button
                  onClick={() => setShowQuickPaste(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs"
                >
                  关闭
                </button>
              </label>
              <textarea
                value={quickPasteText}
                onChange={(e) => setQuickPasteText(e.target.value)}
                placeholder={`例如:\n联盟FC vs 埃雷迪亚诺 1-0\n墨西哥U20 vs 巴拿马U20 2-1`}
                className="w-full h-20 bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500/50"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleApplyQuickPaste}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg shadow flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  解析并填入上面列表
                </button>
              </div>
            </div>
          )}

          {/* Search bar & Select All Controls */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索赛事或队名..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleSelectAll}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5"
              >
                {filteredItems.every((i) => i.selected) ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                全选 / 取消全选
              </button>

              <button
                onClick={scanUnverifiedMatches}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg border border-slate-700"
                title="重新扫描"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="m-4 mb-0 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Matches List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto opacity-60" />
              <p className="text-slate-300 text-sm font-semibold">
                当前筛选条件下暂无比赛！
              </p>
              <p className="text-slate-500 text-xs">
                可调整筛选条件查看其他台账比赛
              </p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.key}
                className={`p-3.5 rounded-xl border transition-all ${
                  item.selected
                    ? 'bg-slate-900/90 border-emerald-500/40 shadow-md shadow-emerald-950/20'
                    : 'bg-slate-950/50 border-slate-800 opacity-60'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left: Selection & Info */}
                  <div className="flex items-center space-x-3 min-w-[240px]">
                    <button
                      onClick={() => handleToggleSelect(item.key)}
                      className="text-slate-400 hover:text-emerald-400"
                    >
                      {item.selected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* YBTY Badge & Team Name */}
                        <span className="text-xs font-bold text-slate-100 flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                          <span className="text-[9px] px-1 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-bold">YBTY</span>
                          {item.ybty_home} <span className="text-slate-500 font-normal">vs</span> {item.ybty_away}
                        </span>

                        {/* Leisu Badge & Team Name */}
                        <span className="text-xs font-semibold text-sky-300 flex items-center gap-1 bg-sky-950/50 px-2 py-0.5 rounded border border-sky-500/30">
                          <span className="text-[9px] px-1 py-0.2 bg-sky-500/20 text-sky-300 rounded font-bold">雷速</span>
                          {item.leisu_home || item.ybty_home} <span className="text-sky-500/70 font-normal">vs</span> {item.leisu_away || item.ybty_away}
                        </span>

                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {item.league}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {item.sourceLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        开赛时间: {item.commence_time}
                      </p>
                    </div>
                  </div>

                  {/* Right: Score Inputs & Verification Checkbox */}
                  <div className="flex items-center space-x-4">
                    <div className="space-y-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                      <div className="flex items-center space-x-1">
                        <span className="text-[10px] text-emerald-400 font-medium w-9">完场</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={item.homeScore}
                          onChange={(e) =>
                            handleScoreChange(item.key, 'home', parseInt(e.target.value, 10) || 0)
                          }
                          className="w-10 bg-slate-900 border border-slate-700 rounded text-center text-xs font-bold font-mono text-emerald-300 py-1 focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-slate-500 font-mono font-bold">:</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={item.awayScore}
                          onChange={(e) =>
                            handleScoreChange(item.key, 'away', parseInt(e.target.value, 10) || 0)
                          }
                          className="w-10 bg-slate-900 border border-slate-700 rounded text-center text-xs font-bold font-mono text-emerald-300 py-1 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="text-[10px] text-sky-400 font-medium w-9">半场</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={item.htHomeScore}
                          placeholder="主"
                          onChange={(e) => handleHtScoreChange(item.key, 'home', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-10 bg-slate-900 border border-sky-700 rounded text-center text-xs font-bold font-mono text-sky-300 py-1 focus:outline-none focus:border-sky-500"
                        />
                        <span className="text-slate-500 font-mono font-bold">:</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={item.htAwayScore}
                          placeholder="客"
                          onChange={(e) => handleHtScoreChange(item.key, 'away', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-10 bg-slate-900 border border-sky-700 rounded text-center text-xs font-bold font-mono text-sky-300 py-1 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    <label className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={item.scoreVerified}
                        onChange={() => handleToggleVerified(item.key)}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                      />
                      <span className="text-[11px] text-emerald-400 font-medium">标记已校验</span>
                    </label>

                    <button
                      onClick={() => handleSubmitBatch([item])}
                      disabled={isSubmitting}
                      className="px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs rounded-lg transition-colors flex items-center gap-1 font-medium"
                      title="保存该场比赛"
                    >
                      <Save className="w-3.5 h-3.5" />
                      保存
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            已勾选 <span className="font-bold text-emerald-400">{selectedCount}</span> / {filteredItems.length} 场待保存赛事
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
            >
              取消/返回
            </button>

            <button
              onClick={() => handleSubmitBatch()}
              disabled={isSubmitting || selectedCount === 0}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-950/40 flex items-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? '保存核查中...' : `一键保存勾选的 ${selectedCount} 场比赛比分`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

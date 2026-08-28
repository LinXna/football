import React, { useState, useMemo } from "react";
import { Filter, Calendar, Layers } from "lucide-react";
import { LeisuRawRecentMatch } from "../../refactor/01_data_ingestion/leisu/types";

interface RecentFormComparatorProps {
  homeTeamName: string;
  awayTeamName: string;
  homeRecentMatches: LeisuRawRecentMatch[];
  awayRecentMatches: LeisuRawRecentMatch[];
}

type VenueFilter = "ALL" | "HOME" | "AWAY";
type LimitCount = 10 | 15 | 20 | 30;

export const RecentFormComparator: React.FC<RecentFormComparatorProps> = ({
  homeTeamName,
  awayTeamName,
  homeRecentMatches = [],
  awayRecentMatches = [],
}) => {
  // 数量限制: 10, 15, 20, 30 (默认 10)
  const [limitCount, setLimitCount] = useState<LimitCount>(10);

  // 主队独立筛选: 全部/主场/客场, 联赛
  const [homeVenueFilter, setHomeVenueFilter] = useState<VenueFilter>("ALL");
  const [homeLeagueFilter, setHomeLeagueFilter] = useState<string>("ALL");

  // 客队独立筛选: 全部/主场/客场, 联赛
  const [awayVenueFilter, setAwayVenueFilter] = useState<VenueFilter>("ALL");
  const [awayLeagueFilter, setAwayLeagueFilter] = useState<string>("ALL");

  // 提取主队参与过的所有联赛列表
  const homeLeagues = useMemo(() => {
    const set = new Set<string>();
    homeRecentMatches.forEach((m) => {
      if (m.league_name && m.league_name.trim()) {
        set.add(m.league_name.trim());
      }
    });
    return Array.from(set);
  }, [homeRecentMatches]);

  // 提取客队参与过的所有联赛列表
  const awayLeagues = useMemo(() => {
    const set = new Set<string>();
    awayRecentMatches.forEach((m) => {
      if (m.league_name && m.league_name.trim()) {
        set.add(m.league_name.trim());
      }
    });
    return Array.from(set);
  }, [awayRecentMatches]);

  // 主队过滤与截取
  const filteredHomeMatches = useMemo(() => {
    return homeRecentMatches
      .filter((m) => {
        // 主客场过滤 (判断目标球队在比赛中是主场还是客场)
        const isTargetHome = m.home_team_name === homeTeamName;
        if (homeVenueFilter === "HOME" && !isTargetHome) return false;
        if (homeVenueFilter === "AWAY" && isTargetHome) return false;

        // 联赛过滤
        if (homeLeagueFilter !== "ALL" && (m.league_name || "").trim() !== homeLeagueFilter) {
          return false;
        }
        return true;
      })
      .slice(0, limitCount);
  }, [homeRecentMatches, homeTeamName, homeVenueFilter, homeLeagueFilter, limitCount]);

  // 客队过滤与截取
  const filteredAwayMatches = useMemo(() => {
    return awayRecentMatches
      .filter((m) => {
        // 主客场过滤 (判断目标球队在比赛中是主场还是客场)
        const isTargetHome = m.home_team_name === awayTeamName;
        if (awayVenueFilter === "HOME" && !isTargetHome) return false;
        if (awayVenueFilter === "AWAY" && isTargetHome) return false;

        // 联赛过滤
        if (awayLeagueFilter !== "ALL" && (m.league_name || "").trim() !== awayLeagueFilter) {
          return false;
        }
        return true;
      })
      .slice(0, limitCount);
  }, [awayRecentMatches, awayTeamName, awayVenueFilter, awayLeagueFilter, limitCount]);

  // 胜平负结果计算
  const getMatchOutcome = (match: LeisuRawRecentMatch, targetTeamName: string) => {
    const hScore = match.fulltime_score?.home;
    const aScore = match.fulltime_score?.away;
    if (hScore === null || hScore === undefined || aScore === null || aScore === undefined) {
      return { tag: "—", color: "bg-slate-800 text-slate-400 border-slate-700" };
    }
    const isTargetHome = match.home_team_name === targetTeamName;
    const targetGoals = isTargetHome ? hScore : aScore;
    const oppGoals = isTargetHome ? aScore : hScore;

    if (targetGoals > oppGoals) {
      return { tag: "胜", color: "bg-emerald-950/80 text-emerald-300 border-emerald-700/60 font-bold" };
    } else if (targetGoals === oppGoals) {
      return { tag: "平", color: "bg-blue-950/80 text-blue-300 border-blue-700/60 font-bold" };
    } else {
      return { tag: "负", color: "bg-rose-950/80 text-rose-300 border-rose-700/60 font-bold" };
    }
  };

  const renderMatchRow = (match: LeisuRawRecentMatch, idx: number, targetTeam: string, isHomeSide: boolean) => {
    const outcome = getMatchOutcome(match, targetTeam);
    const dateStr = match.match_date || (match.match_time ? new Date(Number(match.match_time) * 1000).toISOString().slice(0, 10) : "-");
    const hScore = match.fulltime_score?.home !== undefined && match.fulltime_score?.home !== null ? match.fulltime_score.home : "-";
    const aScore = match.fulltime_score?.away !== undefined && match.fulltime_score?.away !== null ? match.fulltime_score.away : "-";
    const hHalf = match.halftime_score?.home !== undefined && match.halftime_score?.home !== null ? match.halftime_score.home : "-";
    const aHalf = match.halftime_score?.away !== undefined && match.halftime_score?.away !== null ? match.halftime_score.away : "-";

    const isCurrentTeamHome = match.home_team_name === targetTeam;
    const isCurrentTeamAway = match.away_team_name === targetTeam;

    return (
      <div
        key={idx}
        className="bg-slate-900/90 hover:bg-slate-850 p-2 rounded-lg text-xs grid grid-cols-12 items-center font-mono border border-slate-800/80 transition-colors gap-1"
      >
        {/* 胜负标签与时间: 3列 */}
        <div className="col-span-3 flex items-center gap-1.5 min-w-0">
          <span className={`px-1.5 py-0.5 rounded text-[10px] border shrink-0 ${outcome.color}`}>
            {outcome.tag}
          </span>
          <span className="text-slate-400 text-[11px] truncate" title={dateStr}>
            {dateStr}
          </span>
        </div>

        {/* 联赛名: 2列 */}
        <div className="col-span-2 text-slate-400 truncate text-[11px]" title={match.league_name || "-"}>
          {match.league_name || "-"}
        </div>

        {/* 对阵队伍与比分: 7列 */}
        <div className="col-span-7 flex items-center justify-between min-w-0 gap-1">
          {/* 主队 */}
          <span
            className={`truncate text-right flex-1 text-[11px] ${
              isCurrentTeamHome
                ? isHomeSide ? "text-cyan-200 font-bold" : "text-amber-300 font-bold"
                : "text-slate-300"
            }`}
            title={match.home_team_name || "-"}
          >
            {match.home_team_name || "-"}
          </span>

          {/* 全场与半场比分 */}
          <div className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-center shrink-0 flex items-center gap-1">
            <span className="text-slate-100 font-bold text-xs">
              {hScore}:{aScore}
            </span>
            <span className="text-slate-500 text-[10px]">
              ({hHalf}:{aHalf})
            </span>
          </div>

          {/* 客队 */}
          <span
            className={`truncate text-left flex-1 text-[11px] ${
              isCurrentTeamAway
                ? isHomeSide ? "text-cyan-200 font-bold" : "text-amber-300 font-bold"
                : "text-slate-300"
            }`}
            title={match.away_team_name || "-"}
          >
            {match.away_team_name || "-"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-3">
      {/* 顶部全局控制栏：标题与条数切换 */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            双方近期战绩比对 (Recent Form)
          </span>
          <span className="text-[11px] text-slate-500">
            左侧主队 · 右侧客队
          </span>
        </div>

        {/* 条数选择器: 10 / 15 / 20 / 30 */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-md border border-slate-800 text-xs">
          <span className="text-[11px] text-slate-400 px-1.5">显示场数:</span>
          {([10, 15, 20, 30] as LimitCount[]).map((count) => (
            <button
              key={count}
              id={`btn-recent-limit-${count}`}
              onClick={() => setLimitCount(count)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                limitCount === count
                  ? "bg-blue-600 text-white font-bold shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {count}条
            </button>
          ))}
        </div>
      </div>

      {/* 左右分栏：左主队 / 右客队 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左侧：主队近期战绩 */}
        <div className="space-y-2 bg-slate-900/40 p-3 rounded-lg border border-slate-800/70">
          {/* 主队头部与独立筛选器 */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="text-xs font-bold text-cyan-200">{homeTeamName}</span>
              <span className="text-[11px] text-slate-500 font-mono">
                ({filteredHomeMatches.length}/{homeRecentMatches.length}场)
              </span>
            </div>

            {/* 条件选项 1: 全部/主场/客场 + 条件选项 2: 联赛名 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 主客场过滤 */}
              <div className="flex items-center bg-slate-950 rounded border border-slate-800 p-0.5 text-[11px]">
                {(["ALL", "HOME", "AWAY"] as VenueFilter[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setHomeVenueFilter(v)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      homeVenueFilter === v
                        ? "bg-blue-700 text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {v === "ALL" ? "全部" : v === "HOME" ? "主场" : "客场"}
                  </button>
                ))}
              </div>

              {/* 联赛名过滤 */}
              {homeLeagues.length > 0 && (
                <div className="flex items-center gap-1">
                  <Filter className="w-3 h-3 text-slate-500" />
                  <select
                    value={homeLeagueFilter}
                    onChange={(e) => setHomeLeagueFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[11px] rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500 max-w-[110px] truncate"
                  >
                    <option value="ALL">全联赛</option>
                    {homeLeagues.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* 列表渲染 */}
          {filteredHomeMatches.length > 0 ? (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {filteredHomeMatches.map((m, idx) => renderMatchRow(m, idx, homeTeamName, true))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic py-6 text-center">
              暂无匹配的近期战绩数据
            </div>
          )}
        </div>

        {/* 右侧：客队近期战绩 */}
        <div className="space-y-2 bg-slate-900/40 p-3 rounded-lg border border-slate-800/70">
          {/* 客队头部与独立筛选器 */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span className="text-xs font-bold text-amber-300">{awayTeamName}</span>
              <span className="text-[11px] text-slate-500 font-mono">
                ({filteredAwayMatches.length}/{awayRecentMatches.length}场)
              </span>
            </div>

            {/* 条件选项 1: 全部/主场/客场 + 条件选项 2: 联赛名 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 主客场过滤 */}
              <div className="flex items-center bg-slate-950 rounded border border-slate-800 p-0.5 text-[11px]">
                {(["ALL", "HOME", "AWAY"] as VenueFilter[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setAwayVenueFilter(v)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      awayVenueFilter === v
                        ? "bg-blue-700 text-white font-medium"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {v === "ALL" ? "全部" : v === "HOME" ? "主场" : "客场"}
                  </button>
                ))}
              </div>

              {/* 联赛名过滤 */}
              {awayLeagues.length > 0 && (
                <div className="flex items-center gap-1">
                  <Filter className="w-3 h-3 text-slate-500" />
                  <select
                    value={awayLeagueFilter}
                    onChange={(e) => setAwayLeagueFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-[11px] rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500 max-w-[110px] truncate"
                  >
                    <option value="ALL">全联赛</option>
                    {awayLeagues.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* 列表渲染 */}
          {filteredAwayMatches.length > 0 ? (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {filteredAwayMatches.map((m, idx) => renderMatchRow(m, idx, awayTeamName, false))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic py-6 text-center">
              暂无匹配的近期战绩数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

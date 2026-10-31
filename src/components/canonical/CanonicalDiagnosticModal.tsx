import React from "react";
import {
  Shield,
  X,
  TrendingUp,
  BarChart2,
  Activity,
  Users,
  Trophy,
  Target,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { CanonicalMatch } from "../../../refactor/02_canonical_model/types";
import { DataCompletenessTier } from "../../../refactor/02_canonical_model/enums";
import { getMarketsSummary } from "./types";

interface CanonicalDiagnosticModalProps {
  match: CanonicalMatch | null;
  onClose: () => void;
}

export const getTierBadge = (tier: DataCompletenessTier) => {
  switch (tier) {
    case DataCompletenessTier.TIER_1_FULL:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/50">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          TIER 1 (全维度)
        </span>
      );
    case DataCompletenessTier.TIER_2_BASIC:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/50">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          TIER 2 (基础)
        </span>
      );
    case DataCompletenessTier.TIER_3_SPARSE:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-950/60 text-orange-300 border border-orange-500/50">
          <Clock className="w-3.5 h-3.5 text-orange-400" />
          TIER 3 (稀疏)
        </span>
      );
    case DataCompletenessTier.TIER_INVALID:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-500/50">
          <XCircle className="w-3.5 h-3.5 text-rose-400" />
          TIER INVALID (冲突熔断)
        </span>
      );
    default:
      return null;
  }
};

export const CanonicalDiagnosticModal: React.FC<CanonicalDiagnosticModalProps> = ({
  match,
  onClose,
}) => {
  if (!match) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-slate-900 rounded-2xl w-full max-w-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="font-bold text-slate-100 text-sm">
                赛事数据完整度 11 维全景体检报告
              </h3>
              <p className="text-[11px] text-slate-400">
                {match.league_name} · {match.home_team_name} vs {match.away_team_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* 核心状态摘要 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-500">数据定级 (Completeness Tier)</div>
              <div className="mt-1">{getTierBadge(match.completeness_tier)}</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-500">盘口覆盖与深度</div>
              <div className="mt-1 text-sm font-bold text-blue-400 font-mono">
                {getMarketsSummary(match.markets).count} 个玩法 ({getMarketsSummary(match.markets).text})
              </div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-500">比分校验真实度</div>
              <div className="mt-1 text-sm font-bold font-mono">
                {match.score.score_verified ? (
                  <span className="text-emerald-400">🛡️ 画布/接口已校验</span>
                ) : (
                  <span className="text-amber-400">⚠️ 未经画布校验</span>
                )}
              </div>
            </div>
          </div>

          {/* 11 维度全面清单 */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 font-semibold text-xs text-slate-200 flex items-center justify-between">
              <span>11 维核心数据特征就绪状态检查</span>
              <span className="text-[11px] text-slate-400 font-mono">
                {match.missing_reasons.length === 0 ? "11/11 项特征全齐备" : `存在 ${match.missing_reasons.length} 项数据缺口`}
              </span>
            </div>
            <div className="divide-y divide-slate-800/80 text-xs">
              {/* 1. 实时危攻时序走势 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                    <span>1. 实时危攻时序走势 (Attack Momentum Timeline)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    提供逐分钟攻防差值走势、危攻积分与动量斜率
                  </div>
                </div>
                <div>
                  {match.reference?.attack_momentum?.available ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 完整具备 ({match.reference.attack_momentum.segment_count}段)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                      ❌ 缺失 (NO_ATTACK_MOMENTUM)
                    </span>
                  )}
                </div>
              </div>

              {/* 2. 实时攻防技术统计 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <BarChart2 className="w-4 h-4 text-blue-400" />
                    <span>2. 实时攻防技术统计 (Live Technical Stats)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    涵盖射门、射正、危攻、总攻、控球率、角球、红黄牌等 9 项指标
                  </div>
                </div>
                <div>
                  {match.reference?.stats && match.reference.stats.possession ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 具备统计 (控球 {match.reference.stats.possession.home ?? '-'}% : {match.reference.stats.possession.away ?? '-'}%)
                    </span>
                  ) : match.reference?.stats ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 具备统计
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                      ❌ 缺失 (NO_STATS)
                    </span>
                  )}
                </div>
              </div>

              {/* 3. 实时文字直播事件 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-400" />
                    <span>3. 实时文字直播事件 (Timeline Events)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    提供进球、红黄牌、点球、换人、角球等关键时点事件记录
                  </div>
                </div>
                <div>
                  {(match.reference?.timeline_events?.length || 0) > 0 ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 具备 ({match.reference?.timeline_events?.length}个事件)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                      ❌ 缺失 (NO_TIMELINE_EVENTS)
                    </span>
                  )}
                </div>
              </div>

              {/* 4. 首发与阵型架构 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>4. 首发与阵型架构 (Confirmed Lineups)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    首发阵容名单、阵型对抗（如 4-2-3-1 vs 3-4-2-1）与主教练
                  </div>
                </div>
                <div>
                  {match.reference?.lineups?.confirmed ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 官方首发已确认 ({match.reference.lineups.home_formation || "未知"} vs {match.reference.lineups.away_formation || "未知"})
                    </span>
                  ) : (match.reference?.lineups?.home_starters?.length || 0) > 0 ? (
                    <span className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 border border-amber-800 font-medium">
                      ⚠️ 具备部分名单 (尚未确认)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 font-medium">
                      ⚪ 未提供阵容 (NO_LINEUPS)
                    </span>
                  )}
                </div>
              </div>

              {/* 5. 历史往绩交锋 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-blue-400" />
                    <span>5. 历史往绩交锋 (Head-to-Head History)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    两队近几年历史正赛交手记录、胜平负概率与盘路走势
                  </div>
                </div>
                <div>
                  {(match.reference?.tactical_context?.head_to_head_count || 0) > 0 ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 具备 ({match.reference?.tactical_context?.head_to_head_count}场往绩)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 font-medium">
                      ⚪ 无往绩记录 (NO_H2H)
                    </span>
                  )}
                </div>
              </div>

              {/* 6. 近期十场战绩 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-400" />
                    <span>6. 近期正赛战绩 (Recent Matches Form)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    主客队各近期 10 场胜负走势、得失球与攻防效率
                  </div>
                </div>
                <div>
                  {(match.reference?.tactical_context?.home_recent_matches_count || 0) > 0 ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 具备 (主{match.reference?.tactical_context?.home_recent_matches_count}场/客{match.reference?.tactical_context?.away_recent_matches_count || 0}场)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 font-medium">
                      ⚪ 无近期战绩 (NO_RECENT_MATCHES)
                    </span>
                  )}
                </div>
              </div>

              {/* 7. 联赛积分榜与排名 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-blue-400" />
                    <span>7. 联赛积分与积分榜 (League Standings)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    涵盖联赛积分、总场次、胜平负、得失球与排名
                  </div>
                </div>
                <div>
                  {match.reference?.league_standings?.has_data ? (
                    match.reference.league_standings.home_team?.overall?.matches_played === 0 ? (
                      <span className="px-2.5 py-1 rounded bg-blue-950 text-blue-300 border border-blue-800 font-medium">
                        🆕 赛季初/新赛程 (0场记录)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                        ✅ 完整具备 (主#{match.reference.league_standings.home_team?.overall?.position ?? "-"} vs 客#{match.reference.league_standings.away_team?.overall?.position ?? "-"})
                      </span>
                    )
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 font-medium">
                      ⚪ 杯赛/无积分榜 (NO_STANDINGS)
                    </span>
                  )}
                </div>
              </div>

              {/* 8. 进球时段分布 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span>8. 进球时段分布 (Goal Distribution)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    主客队在 1-15'、16-30'、31-45' 等 6 个 15 分钟区间的进球/失球分布
                  </div>
                </div>
                <div>
                  {match.reference?.goal_distribution?.has_data ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 具备时段分布统计
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 font-medium">
                      ⚪ 无时段分布 (NO_GOAL_DISTRIBUTION)
                    </span>
                  )}
                </div>
              </div>

              {/* 9. 欧亚历史指数矩阵 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-blue-400" />
                    <span>9. 欧亚历史指数矩阵 (Historical Odds Matrix)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    初盘、即时盘与滚球让球、欧赔、大小球盘口矩阵
                  </div>
                </div>
                <div>
                  {match.reference?.odds_matrix?.initial?.asian_handicap || match.reference?.odds_matrix?.pregame?.asian_handicap || match.reference?.odds_matrix?.live?.asian_handicap ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 具备多阶段盘口比对矩阵
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 font-medium">
                      ⚪ 无历史盘口矩阵
                    </span>
                  )}
                </div>
              </div>

              {/* 10. 比赛球场与环境属性 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <span>10. 比赛球场属性 (Venue & Pitch Environment)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    主场球场名称、容量等硬件环境物理属性
                  </div>
                </div>
                <div>
                  {match.reference?.lineups?.venue?.name ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 具备 ({match.reference.lineups.venue.name})
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 font-medium">
                      ⚪ 未提供球场信息
                    </span>
                  )}
                </div>
              </div>

              {/* 11. 比分画布双源交叉对账 */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <span>11. 比分画布校验 (Canvas Score Verification)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    雷速官方前端比分画布抓取数据与 YBTY 比分交叉对账
                  </div>
                </div>
                <div>
                  {match.score.score_verified ? (
                    <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                      ✅ 通过画布校验 ({match.score.score_source})
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-medium">
                      ❌ 未通过校验 (SCORE_NOT_VERIFIED)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 缺口代码列表与风控说明 */}
          {match.missing_reasons.length > 0 && (
            <div className="p-4 bg-amber-950/40 border border-amber-900/60 rounded-xl space-y-2">
              <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                当前赛事识别出的具体缺口清单 ({match.missing_reasons.length}项)
              </h4>
              <div className="flex flex-wrap gap-2 pt-1">
                {match.missing_reasons.map((r, i) => (
                  <span key={i} className="px-2.5 py-1 bg-amber-900/50 border border-amber-700/60 text-amber-200 rounded font-mono text-[11px]">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition-colors border border-slate-700"
          >
            关闭体检报告
          </button>
        </div>
      </div>
    </div>
  );
};

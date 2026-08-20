import React from 'react';
import { DecisionItem } from '../types';
import { parseAttackMomentumData } from './AttackMomentumTimelineWidget';
import { analyzeAttackMomentum } from '../utils/momentumAnalytics';
import { Flame, Zap, AlertTriangle, TrendingUp } from 'lucide-react';

interface Props {
  match: DecisionItem;
  height?: number;
  width?: number | string;
  showBadges?: boolean;
}

export const MiniMomentumSparkline: React.FC<Props> = ({
  match,
  height = 28,
  width = '100%',
  showBadges = true
}) => {
  const timeline = parseAttackMomentumData(match);
  if (!timeline.hasTimeline || timeline.points.length === 0) {
    return null;
  }

  const analysis = analyzeAttackMomentum(timeline, match);
  const points = timeline.points;
  const maxScore = 100;
  const numPoints = points.length;

  return (
    <div className="w-full space-y-1 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
      {/* Top Header info */}
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="flex items-center gap-0.5 text-amber-400 font-bold">
            <Flame className="w-3 h-3 text-amber-400" />
            <span>主 {timeline.recent5Share.home}%</span>
          </span>
          <span className="text-slate-600">vs</span>
          <span className="flex items-center gap-0.5 text-purple-400 font-bold">
            <span>客 {timeline.recent5Share.away}%</span>
          </span>
        </div>

        {showBadges && (
          <div className="flex items-center gap-1">
            <span
              className="px-1.5 py-0.2 text-[9.5px] rounded font-semibold bg-slate-800 text-slate-200 border border-slate-700"
              title={analysis.patternDesc}
            >
              {analysis.patternZh.split(' ')[0]}
            </span>

            {analysis.recent15m.direction === 'HOME_SURGING' && (
              <span className="px-1.5 py-0.2 text-[9px] rounded font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60 flex items-center gap-0.5">
                <TrendingUp className="w-2.5 h-2.5 text-amber-400" /> 主队起势
              </span>
            )}
            {analysis.recent15m.direction === 'AWAY_SURGING' && (
              <span className="px-1.5 py-0.2 text-[9px] rounded font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-0.5">
                <TrendingUp className="w-2.5 h-2.5 text-purple-400" /> 客队起势
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mini SVG Sparkline */}
      <div className="relative w-full overflow-hidden rounded bg-slate-900/90 border border-slate-800/50">
        <svg
          viewBox={`0 0 ${Math.max(60, numPoints * 3)} ${height}`}
          className="w-full overflow-visible"
          style={{ height: `${height}px` }}
          preserveAspectRatio="none"
        >
          {/* Baseline (Center Line) */}
          <line
            x1="0"
            y1={height / 2}
            x2={Math.max(60, numPoints * 3)}
            y2={height / 2}
            stroke="#475569"
            strokeWidth="0.75"
            strokeDasharray="2 2"
          />

          {/* Half-time divider */}
          {timeline.segments.length > 1 && (
            <line
              x1={timeline.segments[0].points.length * 3}
              y1="0"
              x2={timeline.segments[0].points.length * 3}
              y2={height}
              stroke="#64748b"
              strokeWidth="1"
              strokeDasharray="1 1"
            />
          )}

          {/* Sparkline Bars */}
          {points.map((p, idx) => {
            const x = idx * 3 + 0.5;
            const barW = 2;
            const isHome = p.score > 0;
            const isAway = p.score < 0;
            const absRatio = Math.min(1, Math.abs(p.score) / maxScore);
            const barH = Math.max(1, absRatio * (height / 2));

            let y = height / 2;
            if (isHome) {
              y = height / 2 - barH;
            }

            const fill = isHome
              ? p.score >= 70 ? '#f59e0b' : '#fbbf24'
              : isAway
              ? Math.abs(p.score) >= 70 ? '#c084fc' : '#a855f7'
              : '#64748b';

            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width={barW}
                height={barH}
                fill={fill}
                rx="0.5"
                opacity={idx >= points.length - 15 ? 1 : 0.75}
              >
                <title>{`${p.displayLabel}: ${isHome ? `主队 +${p.score}` : isAway ? `客队 ${p.score}` : '均势 0'}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      {/* Optional Divergence Badge if critical */}
      {analysis.divergenceSignals.length > 0 && (
        <div className="flex items-center gap-1 text-[9.5px]">
          {analysis.divergenceSignals.slice(0, 1).map((sig, i) => (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 truncate ${
                sig.level === 'CRITICAL'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                  : 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
              }`}
              title={sig.desc}
            >
              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{sig.tag} {sig.title}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

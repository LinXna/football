import React from "react";
import { ParsedIncidentItem } from "./AttackMomentumTimelineWidget";
import { parseIncidentMeta, ProMatchEventIcon } from "./TimelineIncidentBadge";

/**
 * 经典清爽比赛事件图钉渲染器 (Clean & Classic Incident Pin Renderer)
 * 严格遵循专业赛事级（Sofascore / FlashScore / Opta / 雷速）标准：
 * 1. 全矢量高清 SVG (ProMatchEventIcon)，彻底根治系统 Emoji 位图在小尺寸、高分屏下的模糊、发虚、渲染不一致问题；
 * 2. 主客队事件上下物理分行隔离，绝不混杂；
 * 3. 图标静止不跳动 (无 bounce、无晃动)；
 * 4. 同一时间段默认【只展示 1 个】最高优先级图标（进球 > 点球 > 红牌 > 黄牌 > 角球 > 换人...）；
 *    若同一时间段发生 >1 个事件（例如同分钟有2个事件，或1个进球+1个黄牌），在右上角以醒目微型角标展示总数（如 2、3 或 +N），鼠标悬停平滑展开完整事件清单；
 * 5. 彻底移除原生 title 属性，避免浏览器丑陋默认黑框提示干扰。
 */

export function renderIncidentIcons(
  incidents: ParsedIncidentItem[] | undefined,
  isTop: boolean,
  homeAttackScore?: number,
  awayAttackScore?: number
) {
  if (!incidents || incidents.length === 0) return null;

  // 1. 解析并按优先级排序 (进球 > 红牌 > 点球 > 黄牌 > 角球 > 换人...)
  const parsedItems = incidents.map((inc) => {
    const meta = parseIncidentMeta(0, inc.text || inc.shortText, inc.text);
    return {
      inc,
      meta,
    };
  });

  parsedItems.sort((a, b) => b.meta.priority - a.meta.priority);

  // 2. 选取最高优先级的唯一主展示图标 (进球、红牌等最先)
  const primaryItem = parsedItems[0];
  const totalCount = parsedItems.length;

  const posClass = isTop ? "top-0.5" : "bottom-0.5";

  return (
    <div
      className={`absolute ${posClass} -translate-x-1/2 flex items-center justify-center z-30 select-none cursor-pointer group`}
    >
      {/* 默认紧凑展示：只展示 1 个专业高清矢量主图标 + 右上角微型角标 */}
      <div className="relative flex items-center justify-center leading-none">
        <ProMatchEventIcon typeKey={primaryItem.meta.key} size={14} />

        {/* 超过 1 个事件时在右上角展示微型角标 (如 2, 3...) */}
        {totalCount > 1 && (
          <span className="absolute -top-1.5 -right-2 text-[8px] font-black text-amber-300 bg-slate-950 px-1 py-0.2 rounded-full border border-amber-500/80 leading-none shadow-sm z-10 font-mono">
            {totalCount}
          </span>
        )}
      </div>

      {/* 悬停平滑展开全部详情浮层 (保留鼠标悬停附近的唯一浮层，并包含主客队危攻加分，完全去除冗余远端条) */}
      <div
        className={`absolute ${
          isTop ? "top-full mt-1.5" : "bottom-full mb-1.5"
        } left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col gap-1.5 bg-slate-950/95 border border-slate-700/90 rounded-lg p-2.5 shadow-2xl text-[11px] min-w-max z-50 pointer-events-none backdrop-blur-md`}
      >
        <div className="font-bold text-slate-200 border-b border-slate-800/80 pb-1 flex items-center justify-between gap-3 font-mono">
          <span className="text-amber-300">{incidents[0]?.displayMin || ""} 比赛事件</span>
          {totalCount > 1 && (
            <span className="text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/50">
              共 {totalCount} 项
            </span>
          )}
        </div>

        {/* 主客队危攻分动态呈现 */}
        {(homeAttackScore !== undefined || awayAttackScore !== undefined) && (
          <div className="flex items-center gap-2 py-0.5 px-1.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] font-mono">
            <span className="text-slate-400">危攻分:</span>
            <span className="text-emerald-400 font-bold">主队 +{homeAttackScore || 0}</span>
            <span className="text-slate-600">|</span>
            <span className="text-indigo-400 font-bold">客队 +{awayAttackScore || 0}</span>
          </div>
        )}

        <div className="flex flex-col gap-1 pt-0.5">
          {parsedItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-slate-200 whitespace-nowrap">
              <ProMatchEventIcon typeKey={item.meta.key} size={13} />
              <span className="font-medium">
                {item.inc.text || item.inc.shortText || item.meta.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 针对通用事件列表 (Raw Event List) 的专业高清矢量事件图钉组件
 * 严格支持：默认展示 1 个专业矢量图标 + 超出数量右上角角标 + 悬停展开完整清单 + 包含主客危攻分 + 无跳动 + 无原生 title
 */
export interface GenericTimelineEventPinProps {
  minute: number;
  maxMinute: number;
  events: Array<{
    minute: number;
    type: number | string;
    type_name?: string;
    text?: string;
    side?: "home" | "away" | "neutral";
  }>;
  teamName: string;
  side: "home" | "away" | "neutral";
  momentumVal?: number;
  onHover?: (minute: number, events: any[]) => void;
}

export const GenericTimelineEventPin: React.FC<GenericTimelineEventPinProps> = ({
  minute,
  maxMinute,
  events,
  teamName,
  side,
  momentumVal = 0,
  onHover,
}) => {
  if (!events || events.length === 0) return null;

  // 1. 计算时间轴水平位置 (百分比，限制在 2% ~ 98%)
  const leftPct = Math.min(98, Math.max(2, (minute / Math.max(90, maxMinute)) * 100));

  // 2. 解析事件并按优先级排序 (进球 > 红牌 > 点球 > 黄牌 > 角球 > 换人...)
  const parsed = events.map((ev) => ({
    ev,
    meta: parseIncidentMeta(ev.type, ev.type_name, ev.text),
  }));

  parsed.sort((a, b) => b.meta.priority - a.meta.priority);

  // 3. 取出最高优先级的唯一主图标与总数
  const primary = parsed[0];
  const totalCount = parsed.length;

  const isHome = side === "home";
  const posStyle: React.CSSProperties = { left: `${leftPct}%` };

  return (
    <div
      style={posStyle}
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center z-20 cursor-pointer select-none group"
      onMouseEnter={() => onHover && onHover(minute, events)}
    >
      {/* 紧凑图标区：只展示 1 个专业高清矢量主图标 + 右上角微型角标 */}
      <div className="relative flex items-center justify-center leading-none">
        <ProMatchEventIcon typeKey={primary.meta.key} size={14} />

        {/* 超过 1 个事件时显示右上角角标 */}
        {totalCount > 1 && (
          <span className="absolute -top-1.5 -right-2 text-[8px] font-black text-amber-300 bg-slate-950 px-1 py-0.2 rounded-full border border-amber-500/80 leading-none shadow-sm z-10 font-mono">
            {totalCount}
          </span>
        )}
      </div>

      {/* 悬停展开完整事件清单浮层 (保留鼠标附近的独立紧凑浮层，包含危攻加分，完全取代远端重复栏) */}
      <div
        className={`absolute ${
          isHome ? "top-full mt-1.5" : "bottom-full mb-1.5"
        } left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col gap-1.5 bg-slate-950/95 border border-slate-700/90 rounded-lg p-2.5 shadow-2xl text-[11px] min-w-max z-50 pointer-events-none backdrop-blur-md`}
      >
        <div className="font-bold text-slate-200 border-b border-slate-800/80 pb-1 flex items-center justify-between gap-3">
          <span className={isHome ? "text-emerald-400" : "text-indigo-400"}>
            【{isHome ? "主队" : "客队"}】{teamName}
          </span>
          <span className="text-slate-400 font-mono">
            {minute}' ({totalCount}项)
          </span>
        </div>

        {/* 危攻加分即时呈现 */}
        <div className="flex items-center gap-2 py-0.5 px-1.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] font-mono">
          <span className="text-slate-400">危攻态势:</span>
          {momentumVal > 0 ? (
            <span className="text-emerald-400 font-bold">主队危攻 +{momentumVal}</span>
          ) : momentumVal < 0 ? (
            <span className="text-indigo-400 font-bold">客队危攻 {momentumVal}</span>
          ) : (
            <span className="text-slate-400">攻守均势 0</span>
          )}
        </div>

        <div className="flex flex-col gap-1 pt-0.5">
          {parsed.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-slate-200 whitespace-nowrap">
              <ProMatchEventIcon typeKey={item.meta.key} size={13} />
              <span className="text-slate-400 font-medium">[{item.meta.label}]</span>
              <span className="text-slate-100">{item.ev.text || item.meta.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

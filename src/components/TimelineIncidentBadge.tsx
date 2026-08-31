import React from "react";

// ==========================================
// 1. 专业赛事级高清矢量图标 (Ultra-Crisp Pro Sports Match SVG Icons)
// 借鉴 Sofascore / FlashScore / Opta / 雷速 等专业赛事的清晰矢量图例
// 100% 纯矢量几何图形，亚像素级对齐，在高分辨率与小字号下始终清晰锐利、绝不模糊
// ==========================================

export interface ProMatchEventIconProps {
  typeKey: string;
  size?: number;
  className?: string;
}

export const ProMatchEventIcon: React.FC<ProMatchEventIconProps> = ({
  typeKey,
  size = 14,
  className = "",
}) => {
  switch (typeKey) {
    case "goal":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 足球外圆与白底 */}
          <circle cx="8" cy="8" r="7" fill="#F8FAFC" stroke="#0F172A" strokeWidth="0.9" />
          {/* 中心黑色五边形 */}
          <polygon points="8,5.2 9.8,6.5 9.1,8.6 6.9,8.6 6.2,6.5" fill="#0F172A" />
          {/* 边缘五边形连线花纹 */}
          <path
            d="M8 5.2 L8 2.2 M9.8 6.5 L12.5 5.5 M9.1 8.6 L11.2 11.2 M6.9 8.6 L4.8 11.2 M6.2 6.5 L3.5 5.5"
            stroke="#0F172A"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          {/* 顶部黑色小块 */}
          <polygon points="7,1.3 9,1.3 9.6,2.3 6.4,2.3" fill="#0F172A" />
          {/* 右上小块 */}
          <polygon points="13.2,4.5 14.5,5.8 13.8,7.2 12.6,6.2" fill="#0F172A" />
          {/* 右下小块 */}
          <polygon points="12.2,11.8 11.2,13.2 9.8,12.5 10.8,11" fill="#0F172A" />
          {/* 左下小块 */}
          <polygon points="3.8,11.8 4.8,13.2 6.2,12.5 5.2,11" fill="#0F172A" />
          {/* 左上小块 */}
          <polygon points="2.8,4.5 1.5,5.8 2.2,7.2 3.4,6.2" fill="#0F172A" />
        </svg>
      );

    case "penalty_goal":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 进球点球 (带绿底或P字标) */}
          <circle cx="8" cy="8" r="7" fill="#10B981" stroke="#047857" strokeWidth="0.9" />
          <circle cx="8" cy="8" r="5" fill="#FFFFFF" stroke="#0F172A" strokeWidth="0.7" />
          <polygon points="8,5.8 9.3,6.8 8.8,8.2 7.2,8.2 6.7,6.8" fill="#0F172A" />
          <text
            x="13.5"
            y="7.5"
            fontSize="6.5"
            fontWeight="bold"
            fill="#34D399"
            className="font-mono"
          >
            P
          </text>
        </svg>
      );

    case "penalty_miss":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 点球射失：准心加红色 X */}
          <circle cx="8" cy="8" r="7" fill="#1E293B" stroke="#EF4444" strokeWidth="1" />
          <line x1="8" y1="2" x2="8" y2="14" stroke="#64748B" strokeWidth="0.7" strokeDasharray="1,1" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="#64748B" strokeWidth="0.7" strokeDasharray="1,1" />
          <circle cx="8" cy="8" r="4" fill="none" stroke="#EF4444" strokeWidth="0.8" />
          <line x1="5" y1="5" x2="11" y2="11" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="11" y1="5" x2="5" y2="11" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );

    case "own_goal":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 乌龙球：红色足球标志 */}
          <circle cx="8" cy="8" r="7" fill="#FEE2E2" stroke="#DC2626" strokeWidth="1" />
          <polygon points="8,5.2 9.8,6.5 9.1,8.6 6.9,8.6 6.2,6.5" fill="#DC2626" />
          <path
            d="M8 5.2 L8 2.2 M9.8 6.5 L12.5 5.5 M9.1 8.6 L11.2 11.2 M6.9 8.6 L4.8 11.2 M6.2 6.5 L3.5 5.5"
            stroke="#DC2626"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        </svg>
      );

    case "yellow_card":
      return (
        <svg
          viewBox="0 0 14 16"
          width={size * 0.9}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 专业立体黄牌 */}
          <rect
            x="2"
            y="1"
            width="10"
            height="14"
            rx="1.6"
            fill="#EAB308"
            stroke="#FEF08A"
            strokeWidth="0.8"
          />
          <path
            d="M3.5 3 L10.5 3"
            stroke="#FEF9C3"
            strokeWidth="0.8"
            strokeLinecap="round"
            opacity="0.75"
          />
        </svg>
      );

    case "red_card":
      return (
        <svg
          viewBox="0 0 14 16"
          width={size * 0.9}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 专业立体红牌 */}
          <rect
            x="2"
            y="1"
            width="10"
            height="14"
            rx="1.6"
            fill="#DC2626"
            stroke="#FECACA"
            strokeWidth="0.8"
          />
          <path
            d="M3.5 3 L10.5 3"
            stroke="#FEE2E2"
            strokeWidth="0.8"
            strokeLinecap="round"
            opacity="0.75"
          />
        </svg>
      );

    case "second_yellow":
      return (
        <svg
          viewBox="0 0 18 16"
          width={size * 1.15}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 两黄变红：黄牌与红牌双重叠 */}
          {/* 底层红牌 */}
          <rect
            x="6"
            y="1"
            width="9"
            height="13.5"
            rx="1.5"
            fill="#DC2626"
            stroke="#FECACA"
            strokeWidth="0.8"
          />
          {/* 上层黄牌 */}
          <rect
            x="2"
            y="3"
            width="9"
            height="12.5"
            rx="1.5"
            fill="#EAB308"
            stroke="#FEF08A"
            strokeWidth="0.8"
          />
        </svg>
      );

    case "substitution":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 经典换人箭头：绿色上场 ⬆ + 红色下场 ⬇ */}
          {/* 绿色上箭头 (上场) */}
          <path
            d="M4.5 12 L4.5 5 M4.5 5 L2 7.5 M4.5 5 L7 7.5"
            stroke="#22C55E"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 红色下箭头 (下场) */}
          <path
            d="M11.5 4 L11.5 11 M11.5 11 L9 8.5 M11.5 11 L14 8.5"
            stroke="#EF4444"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "corner":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 经典红色角旗：金属旗杆与鲜红三角旗帜 */}
          {/* 旗杆 */}
          <line x1="4" y1="2" x2="4" y2="15" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round" />
          {/* 红色三角角旗 */}
          <polygon points="4.5,2.5 13.5,6 4.5,9.5" fill="#EF4444" stroke="#DC2626" strokeWidth="0.7" />
          {/* 底座 */}
          <path d="M2.5 15 L5.5 15" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case "offside":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 越位：警示旗与禁止标 */}
          <circle cx="8" cy="8" r="6.5" fill="#1E293B" stroke="#F97316" strokeWidth="1" />
          <line x1="3.5" y1="12.5" x2="12.5" y2="3.5" stroke="#F97316" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="4" y1="4" x2="12" y2="12" stroke="#F97316" strokeWidth="1" strokeDasharray="1,1" />
        </svg>
      );

    case "var":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* VAR 视频助理裁判显示屏 */}
          <rect x="1.5" y="2.5" width="13" height="9.5" rx="1.5" fill="#475569" stroke="#C084FC" strokeWidth="0.9" />
          <rect x="2.8" y="3.8" width="10.4" height="6.9" rx="0.8" fill="#0F172A" />
          <text
            x="8"
            y="9"
            textAnchor="middle"
            fontSize="5.2"
            fontWeight="900"
            fill="#E9D5FF"
            className="font-mono"
            letterSpacing="-0.2"
          >
            VAR
          </text>
          {/* 支架 */}
          <line x1="8" y1="12" x2="8" y2="14.5" stroke="#C084FC" strokeWidth="1" />
          <line x1="5" y1="14.5" x2="11" y2="14.5" stroke="#C084FC" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );

    case "shot_on_target":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 射正：绿色同心准心 */}
          <circle cx="8" cy="8" r="6.5" fill="#0F172A" stroke="#10B981" strokeWidth="1" />
          <circle cx="8" cy="8" r="3.8" fill="none" stroke="#34D399" strokeWidth="0.9" />
          <circle cx="8" cy="8" r="1.5" fill="#10B981" />
          <line x1="8" y1="1.5" x2="8" y2="3.5" stroke="#10B981" strokeWidth="1" strokeLinecap="round" />
          <line x1="8" y1="12.5" x2="8" y2="14.5" stroke="#10B981" strokeWidth="1" strokeLinecap="round" />
          <line x1="1.5" y1="8" x2="3.5" y2="8" stroke="#10B981" strokeWidth="1" strokeLinecap="round" />
          <line x1="12.5" y1="8" x2="14.5" y2="8" stroke="#10B981" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );

    case "shot_off_target":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 射偏：偏出箭头 */}
          <circle cx="8" cy="8" r="6.5" fill="#0F172A" stroke="#64748B" strokeWidth="1" />
          <path
            d="M4 12 L11 5 M11 5 L7 5 M11 5 L11 9"
            stroke="#F97316"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "save":
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          {/* 门将扑救：守门员手套护盾 */}
          <path
            d="M8 2 L13 4.5 L13 9 C13 12.2 10.8 14.2 8 15 C5.2 14.2 3 12.2 3 9 L3 4.5 Z"
            fill="#0284C7"
            stroke="#38BDF8"
            strokeWidth="0.9"
          />
          <circle cx="8" cy="8" r="2.2" fill="#FFFFFF" />
        </svg>
      );

    default:
      return (
        <svg
          viewBox="0 0 16 16"
          width={size}
          height={size}
          className={`shrink-0 overflow-visible select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${className}`}
        >
          <circle cx="8" cy="8" r="5.5" fill="#F59E0B" stroke="#FEF08A" strokeWidth="0.8" />
          <circle cx="8" cy="8" r="2" fill="#FFFFFF" />
        </svg>
      );
  }
};

// ==========================================
// 2. 经典比赛事件元数据解析 (优先识别专业级矢量 key)
// ==========================================

export interface IncidentMeta {
  key: string;
  label: string;
  colorClass: string;
  priority: number; // 优先级从高到低 (进球 > 红牌 > 点球 > 黄牌 > 角球 > 换人...)
}

export function parseIncidentMeta(
  type: number | string,
  typeName?: string,
  text?: string
): IncidentMeta {
  const tStr = String(type || "").trim();
  const name = String(typeName || "").trim();
  const txt = String(text || "").trim();

  // 1. 乌龙球
  if (name.includes("乌龙") || txt.includes("乌龙")) {
    return {
      key: "own_goal",
      label: "乌龙",
      colorClass: "text-rose-400",
      priority: 95,
    };
  }

  // 2. 点球射失
  if (
    tStr === "16" ||
    (name.includes("点球") && (name.includes("失") || txt.includes("失") || name.includes("偏")))
  ) {
    return {
      key: "penalty_miss",
      label: "射失",
      colorClass: "text-rose-400",
      priority: 90,
    };
  }

  // 3. 点球破门
  if (name.includes("点球进") || (name.includes("点球") && !name.includes("失"))) {
    return {
      key: "penalty_goal",
      label: "点球",
      colorClass: "text-emerald-300",
      priority: 98,
    };
  }

  // 4. 普通常规进球
  if (tStr === "1" || name.includes("进球") || txt.includes("进球")) {
    return {
      key: "goal",
      label: "进球",
      colorClass: "text-emerald-300",
      priority: 100,
    };
  }

  // 5. 两黄变红
  if (tStr === "23" || name.includes("两黄变红") || txt.includes("两黄变红")) {
    return {
      key: "second_yellow",
      label: "两黄变红",
      colorClass: "text-amber-300",
      priority: 85,
    };
  }

  // 6. 直红
  if (tStr === "4" || name.includes("红牌") || txt.includes("红牌")) {
    return {
      key: "red_card",
      label: "红牌",
      colorClass: "text-rose-400",
      priority: 88,
    };
  }

  // 7. 黄牌
  if (tStr === "3" || name.includes("黄牌") || txt.includes("黄牌")) {
    return {
      key: "yellow_card",
      label: "黄牌",
      colorClass: "text-amber-300",
      priority: 70,
    };
  }

  // 8. 换人
  if (tStr === "6" || tStr === "9" || name.includes("换人") || txt.includes("换人")) {
    return {
      key: "substitution",
      label: "换人",
      colorClass: "text-slate-200",
      priority: 50,
    };
  }

  // 9. 角球
  if (tStr === "2" || name.includes("角球") || txt.includes("角球")) {
    return {
      key: "corner",
      label: "角球",
      colorClass: "text-sky-300",
      priority: 60,
    };
  }

  // 10. 越位
  if (tStr === "5" || name.includes("越位") || txt.includes("越位")) {
    return {
      key: "offside",
      label: "越位",
      colorClass: "text-orange-300",
      priority: 45,
    };
  }

  // 11. VAR
  if (tStr === "28" || name.includes("VAR") || txt.includes("VAR")) {
    return {
      key: "var",
      label: "VAR",
      colorClass: "text-purple-300",
      priority: 75,
    };
  }

  // 12. 射正
  if (tStr === "21" || name.includes("射正") || txt.includes("射正")) {
    return {
      key: "shot_on_target",
      label: "射正",
      colorClass: "text-emerald-300",
      priority: 40,
    };
  }

  // 13. 射偏
  if (tStr === "22" || name.includes("射偏") || txt.includes("射偏")) {
    return {
      key: "shot_off_target",
      label: "射偏",
      colorClass: "text-orange-300",
      priority: 30,
    };
  }

  // 14. 扑救
  if (tStr === "8" || name.includes("扑救") || txt.includes("扑救")) {
    return {
      key: "save",
      label: "扑救",
      colorClass: "text-blue-300",
      priority: 55,
    };
  }

  // 默认通用事件
  return {
    key: "generic",
    label: name || "事件",
    colorClass: "text-amber-300",
    priority: 20,
  };
}

// ==========================================
// 3. 极简轻量高清图例标尺 (清爽不占版面，一目了然)
// ==========================================

export const TimelineIncidentLegend: React.FC<{
  homeName?: string;
  awayName?: string;
}> = ({ homeName = "主队", awayName = "客队" }) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 px-1 py-0.5 select-none font-sans">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block shadow-xs shadow-emerald-500/50"></span>
          <span>{homeName}攻势 (上方)</span>
        </span>
        <span className="flex items-center gap-1.5 font-semibold text-indigo-400">
          <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 inline-block shadow-xs shadow-indigo-500/50"></span>
          <span>{awayName}攻势 (下方)</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-300">
        <span className="inline-flex items-center gap-1">
          <ProMatchEventIcon typeKey="goal" size={13} /> 进球
        </span>
        <span className="inline-flex items-center gap-1">
          <ProMatchEventIcon typeKey="yellow_card" size={13} /> 黄牌
        </span>
        <span className="inline-flex items-center gap-1">
          <ProMatchEventIcon typeKey="red_card" size={13} /> 红牌
        </span>
        <span className="inline-flex items-center gap-1">
          <ProMatchEventIcon typeKey="corner" size={13} /> 角球
        </span>
        <span className="inline-flex items-center gap-1">
          <ProMatchEventIcon typeKey="substitution" size={13} /> 换人
        </span>
        <span className="inline-flex items-center gap-1">
          <ProMatchEventIcon typeKey="shot_on_target" size={13} /> 射门
        </span>
      </div>
    </div>
  );
};

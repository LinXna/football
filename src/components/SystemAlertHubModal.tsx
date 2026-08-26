import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  XCircle,
  Info,
  CheckCircle2,
  Copy,
  Trash2,
  Download,
  X,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Code2,
  Check,
  Search,
} from "lucide-react";
import {
  SystemAlertEvent,
  UnknownEnumReport,
} from "../../refactor/00_common/errors";

export interface SystemAlertHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: SystemAlertEvent[];
  unknownEnums: UnknownEnumReport[];
  onClearAlerts: () => void;
}

export const SystemAlertHubModal: React.FC<SystemAlertHubModalProps> = ({
  isOpen,
  onClose,
  alerts,
  unknownEnums,
  onClearAlerts,
}) => {
  const [activeTab, setActiveTab] = useState<"all" | "enums" | "deficits" | "critical">("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    unknown_enums: true,
    data_deficits: true,
    critical_errors: true,
  });
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // 1. 统计数据与分类聚合
  const stats = useMemo(() => {
    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    alerts.forEach((alert) => {
      if (alert.severity === "critical" || alert.severity === "error") criticalCount++;
      else if (alert.severity === "warning") warningCount++;
      else infoCount++;
    });

    return {
      total: alerts.length,
      critical: criticalCount,
      warning: warningCount,
      info: infoCount,
      unknownEnums: unknownEnums.length,
    };
  }, [alerts, unknownEnums]);

  // 2. 生成可直接复制的 TypeScript 枚举/字典补全代码
  const generatedTsSnippet = useMemo(() => {
    if (unknownEnums.length === 0) return "// 暂无待补全的未知枚举代码";
    
    // 按类别分组
    const byCategory: Record<string, UnknownEnumReport[]> = {};
    unknownEnums.forEach((item) => {
      if (!byCategory[item.category]) byCategory[item.category] = [];
      byCategory[item.category].push(item);
    });

    let snippet = `/**\n * 自动生成的未知枚举补充定义\n * 生成时间: ${new Date().toLocaleString()}\n */\n\n`;
    for (const [category, items] of Object.entries(byCategory)) {
      snippet += `export const NEW_${category.toUpperCase()}_DICTIONARY: Record<string | number, string> = {\n`;
      items.forEach((item) => {
        const keyRepr = typeof item.raw_code === "number" ? item.raw_code : `'${item.raw_code}'`;
        snippet += `  ${keyRepr}: '${item.sample_context || ""}', // 出现频次: ${item.count}次\n`;
      });
      snippet += `};\n\n`;
    }
    return snippet;
  }, [unknownEnums]);

  // 3. 过滤报警条目
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (activeTab === "critical" && alert.severity !== "critical" && alert.severity !== "error") return false;
      if (activeTab === "enums" && alert.code !== 1001) return false;
      if (activeTab === "deficits" && !alert.message.includes("缺口") && !alert.message.includes("未匹配") && !alert.message.includes("未校验")) return false;

      if (!searchKeyword.trim()) return true;
      const kw = searchKeyword.toLowerCase();
      return (
        alert.message.toLowerCase().includes(kw) ||
        alert.module.toLowerCase().includes(kw) ||
        alert.title.toLowerCase().includes(kw)
      );
    });
  }, [alerts, activeTab, searchKeyword]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedTsSnippet);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (e) {
      console.error("复制失败", e);
    }
  };

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ alerts, unknownEnums }, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `system_alerts_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-slate-900 rounded-2xl w-full max-w-4xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* 顶部 Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-950/80 rounded-lg text-amber-400 border border-amber-800/50">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-sm">
                  系统告警与数据质量审计中心
                </h3>
                <span className="text-[11px] px-2 py-0.5 bg-blue-950 text-blue-300 rounded font-mono border border-blue-800/50">
                  System Alert Hub
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                全链路事件总线聚合监控 · 同类错误去重合并 · 零弹窗轰炸
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(alerts.length > 0 || unknownEnums.length > 0) && (
              <button
                onClick={onClearAlerts}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700"
                title="一键清空全部告警记录"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                <span>一键已读清空</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 统计指标面板 Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-950/70 border-b border-slate-800 text-xs">
          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">总告警/事件</span>
            <span className="font-mono font-bold text-slate-200 text-sm">{stats.total}</span>
          </div>
          <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-900/40 flex items-center justify-between">
            <span className="text-rose-400 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> 阻断性异常
            </span>
            <span className="font-mono font-bold text-rose-300 text-sm">{stats.critical}</span>
          </div>
          <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/40 flex items-center justify-between">
            <span className="text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> 告警与缺口
            </span>
            <span className="font-mono font-bold text-amber-300 text-sm">{stats.warning}</span>
          </div>
          <div className="bg-purple-950/30 p-2.5 rounded-xl border border-purple-900/40 flex items-center justify-between">
            <span className="text-purple-400 flex items-center gap-1">
              <Code2 className="w-3.5 h-3.5" /> 未知枚举代码
            </span>
            <span className="font-mono font-bold text-purple-300 text-sm">{unknownEnums.length} 类</span>
          </div>
        </div>

        {/* 过滤筛选与切换 Tab */}
        <div className="p-3 bg-slate-950 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === "all"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              全部 ({stats.total})
            </button>
            <button
              onClick={() => setActiveTab("enums")}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === "enums"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              未知枚举收集箱 ({unknownEnums.length})
            </button>
            <button
              onClick={() => setActiveTab("critical")}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                activeTab === "critical"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              阻断异常 ({stats.critical})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索告警内容、模块名..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 内容展示列表 */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* 未知枚举聚合专区 (当存在未知枚举时置顶展示聚合卡片) */}
          {unknownEnums.length > 0 && (activeTab === "all" || activeTab === "enums") && (
            <div className="bg-slate-950 rounded-xl border border-purple-900/50 overflow-hidden shadow-sm">
              <div
                onClick={() => toggleGroup("unknown_enums")}
                className="p-3 bg-purple-950/40 flex items-center justify-between cursor-pointer hover:bg-purple-950/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedGroups["unknown_enums"] ? (
                    <ChevronDown className="w-4 h-4 text-purple-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-purple-400" />
                  )}
                  <Code2 className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-xs text-purple-200">
                    未知枚举收集箱（已自动聚合 {unknownEnums.length} 个未登记实体代码）
                  </span>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-medium transition-colors"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> 已复制 TypeScript 代码
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> 复制补全代码
                      </>
                    )}
                  </button>
                </div>
              </div>

              {expandedGroups["unknown_enums"] && (
                <div className="p-3 space-y-2 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {unknownEnums.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-mono font-semibold text-purple-300 text-xs">
                            [{item.category}] {item.raw_code}
                          </div>
                          <div className="text-slate-300 text-[11px] truncate max-w-[140px]" title={item.sample_context || ""}>
                            样本: {item.sample_context || "无"}
                          </div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded font-mono">
                          {item.count} 次
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 告警条目明细流 */}
          {filteredAlerts.length === 0 ? (
            <div className="p-12 text-center bg-slate-950/50 rounded-xl border border-slate-800 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
              <p className="text-xs text-slate-400 font-medium">当前无任何未读告警或异常事件，系统运行稳定</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAlerts.map((alert, idx) => {
                const isCritical = alert.severity === "critical" || alert.severity === "error";
                const isWarning = alert.severity === "warning";

                return (
                  <div
                    key={alert.id || idx}
                    className={`p-3 rounded-xl border text-xs transition-all ${
                      isCritical
                        ? "bg-rose-950/30 border-rose-900/60 text-rose-200"
                        : isWarning
                        ? "bg-slate-950 border-slate-800/80 hover:border-amber-500/40 text-slate-300"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        {isCritical ? (
                          <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        ) : isWarning ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        ) : (
                          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-200">
                              [{alert.module}] {alert.title}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : ""}
                            </span>
                          </div>
                          <p className="text-slate-300 leading-relaxed font-mono text-[11px]">
                            {alert.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部 Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="text-slate-500 text-[11px] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>智能聚合引擎：所有非阻断告警已自动静默归档，保障操作流畅</span>
          </div>

          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <button
                onClick={handleExportJson}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出日志 (JSON)</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
            >
              关闭
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

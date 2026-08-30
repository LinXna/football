/**
 * 导入数据特征智能嗅探器 (Ingress File Sniffer)
 * 纯函数无副作用，根据 JSON 内容结构自动识别数据源与模式
 */

export type IngressFileType =
  | "ybty_live"
  | "ybty_prematch"
  | "leisu_interface"
  | "unknown";

export interface SniffedFileInfo {
  fileName: string;
  fileSize: number;
  fileType: IngressFileType;
  label: string;
  source: "ybty" | "leisu" | "unknown";
  mode: "live" | "prematch" | "common";
  matchCount: number;
  rawJson: unknown;
  confidenceDesc: string;
}

export function sniffIngressPayload(fileName: string, fileSize: number, payload: unknown): SniffedFileInfo {
  if (!payload || typeof payload !== "object") {
    return {
      fileName,
      fileSize,
      fileType: "unknown",
      label: "无法识别的格式",
      source: "unknown",
      mode: "common",
      matchCount: 0,
      rawJson: payload,
      confidenceDesc: "数据不是合法的 JSON 对象",
    };
  }

  const obj = payload as Record<string, unknown>;

  // 1. 判断是否为雷速接口数据 (leisu_interface_data)
  const results = Array.isArray(obj.results) ? obj.results : null;
  if (
    obj.export_type === "leisu_interface_data" ||
    (results &&
      results.some((r: unknown) => {
        if (!r || typeof r !== "object") return false;
        const resObj = r as Record<string, unknown>;
        return Boolean(resObj.match_id || resObj.formal);
      }))
  ) {
    const matchCount = results ? results.length : 0;
    return {
      fileName,
      fileSize,
      fileType: "leisu_interface",
      label: "雷速接口数据 (Leisu Interface)",
      source: "leisu",
      mode: "common",
      matchCount,
      rawJson: payload,
      confidenceDesc: `识别到雷速 export_type: leisu_interface_data，包含 ${matchCount} 场赛事`,
    };
  }

  // 2. 判断是否为 YBTY 数据
  const matches = Array.isArray(obj.matches) ? obj.matches : null;
  const isYbtySource =
    obj.source === "ybty" ||
    (typeof obj.source_url === "string" && obj.source_url.includes("zlshelves")) ||
    (matches &&
      matches.some((m: unknown) => {
        if (!m || typeof m !== "object") return false;
        const matchObj = m as Record<string, unknown>;
        return Boolean(matchObj.markets && (matchObj.home || matchObj.away));
      }));

  if (isYbtySource || matches) {
    const matchCount = matches ? matches.length : 0;
    const pageContext = typeof obj.page_context === "object" && obj.page_context !== null
      ? (obj.page_context as Record<string, unknown>)
      : null;

    // 检查是否为滚球 (live)
    const isLive =
      obj.export_mode === "live" ||
      pageContext?.detected_mode === "live" ||
      pageContext?.requested_mode === "live" ||
      (matches &&
        matches.some((m: unknown) => {
          if (!m || typeof m !== "object") return false;
          const matchObj = m as Record<string, unknown>;
          return (
            matchObj.clock_status === "in_play" ||
            matchObj.clock_status === "live" ||
            (typeof matchObj.clock === "string" &&
              matchObj.clock !== "FT" &&
              matchObj.clock !== "NS" &&
              matchObj.clock !== "未开赛") ||
            (matchObj.home_score !== null &&
              matchObj.home_score !== undefined &&
              matchObj.home_score !== "")
          );
        }));

    if (isLive) {
      return {
        fileName,
        fileSize,
        fileType: "ybty_live",
        label: "YBTY 滚球盘口数据 (Live)",
        source: "ybty",
        mode: "live",
        matchCount,
        rawJson: payload,
        confidenceDesc: `识别到 YBTY 滚球特征 (export_mode: live)，包含 ${matchCount} 场比赛`,
      };
    }

    // 否则为赛前 (prematch)
    return {
      fileName,
      fileSize,
      fileType: "ybty_prematch",
      label: "YBTY 赛前盘口数据 (Prematch)",
      source: "ybty",
      mode: "prematch",
      matchCount,
      rawJson: payload,
      confidenceDesc: `识别到 YBTY 赛前特征 (export_mode: prematch)，包含 ${matchCount} 场比赛`,
    };
  }

  return {
    fileName,
    fileSize,
    fileType: "unknown",
    label: "未知数据格式",
    source: "unknown",
    mode: "common",
    matchCount: 0,
    rawJson: payload,
    confidenceDesc: "未匹配到 YBTY 或雷速标准特征字段",
  };
}

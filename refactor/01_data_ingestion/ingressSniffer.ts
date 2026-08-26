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
  rawJson: any;
  confidenceDesc: string;
}

export function sniffIngressPayload(fileName: string, fileSize: number, payload: any): SniffedFileInfo {
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

  // 1. 判断是否为雷速接口数据 (leisu_interface_data)
  if (
    payload.export_type === "leisu_interface_data" ||
    (Array.isArray(payload.results) &&
      payload.results.some((r: any) => r && (r.match_id || r.formal)))
  ) {
    const matchCount = Array.isArray(payload.results) ? payload.results.length : 0;
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
  const isYbtySource =
    payload.source === "ybty" ||
    (payload.source_url && String(payload.source_url).includes("zlshelves")) ||
    (Array.isArray(payload.matches) &&
      payload.matches.some((m: any) => m && m.markets && (m.home || m.away)));

  if (isYbtySource || Array.isArray(payload.matches)) {
    const matchCount = Array.isArray(payload.matches) ? payload.matches.length : 0;

    // 检查是否为滚球 (live)
    const isLive =
      payload.export_mode === "live" ||
      payload.page_context?.detected_mode === "live" ||
      payload.page_context?.requested_mode === "live" ||
      payload.matches?.some(
        (m: any) =>
          m.clock_status === "in_play" ||
          m.clock_status === "live" ||
          (m.clock && m.clock !== "FT" && m.clock !== "NS" && m.clock !== "未开赛") ||
          (m.home_score !== null && m.home_score !== undefined && m.home_score !== "")
      );

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

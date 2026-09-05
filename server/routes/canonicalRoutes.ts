import type express from "express";
import fs from "fs";
import path from "path";
import { readJsonFile, writeJsonFile } from "../jsonStore";
import { parseYbtyLiveRoot } from "../../refactor/01_data_ingestion/ybty/ybtyLiveExtractor";
import { parseYbtyPrematchRoot } from "../../refactor/01_data_ingestion/ybty/ybtyPrematchExtractor";
import { parseLeisuInterfaceExport } from "../../refactor/01_data_ingestion/leisu/leisuInterfaceExtractor";
import { findBestLeisuMatch } from "../../refactor/02_canonical_model/matchAligner";
import {
  assembleCanonicalMatch,
  extractAiEvaluationBrief,
} from "../../refactor/02_canonical_model/canonicalMatchAssembler";
import {
  GenericYbtyMatch,
  CanonicalMatch,
  AiEvaluationBrief,
} from "../../refactor/02_canonical_model/types";
import { ParsedLeisuMatch } from "../../refactor/01_data_ingestion/leisu/types";
import { calculateQuantitativeFeatures } from "../../refactor/03_quant_engine";
import { QuantitativeFeatures } from "../../refactor/03_quant_engine/types";
import {
  systemAlertBus,
  commonEnumRegistry,
  SystemErrorCode,
  SystemAlertEvent,
} from "../../refactor/00_common/errors";

import { sniffIngressPayload } from "../../refactor/01_data_ingestion/ingressSniffer";

// 重构系统专有文件路径（完全物理隔离，零外部 output/ 依赖）
const REFACTOR_STORAGE = {
  runtimeLive: "refactor/runtime/live_batch.json",
  runtimePrematch: "refactor/runtime/prematch_batch.json",
  liveYbtyActive: "refactor/fixtures/active_live_ybty.json",
  liveYbtyDefault: "refactor/fixtures/ybty_v2.8.0_live_2026-08-20T20-20-13-747Z.json",
  liveLeisuActive: "refactor/fixtures/active_live_leisu.json",
  liveLeisuDefault: "refactor/fixtures/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json",
  
  prematchYbtyActive: "refactor/fixtures/active_prematch_ybty.json",
  prematchYbtyDefault: "refactor/fixtures/ybty_v2.8.0_prematch_2026-08-23T01-04-18-978Z.json",
  prematchLeisuActive: "refactor/fixtures/active_prematch_leisu.json",
  prematchLeisuDefault: "refactor/fixtures/leisu_v2.8.0_interface_data_2026-08-23T01-04-37-353Z.json",

  manualAliases: "team_aliases.json",
  leagueAliases: "league_aliases.json",
};

export type RefactorRuntimeBatch = {
  schema_version: 1;
  batch_id: string;
  imported_at: string;
  mode: "live" | "prematch";
  matches: CanonicalMatch[];
  ai_briefs: AiEvaluationBrief[];
  quantitative_features?: Record<string, QuantitativeFeatures>;
  metadata: {
    mode: string;
    ybtySource: string;
    leisuSource: string;
    ybtyMatchCount: number;
    leisuMatchCount: number;
    alignedCount: number;
  };
};

function runtimePath(mode: "live" | "prematch"): string {
  return mode === "live" ? REFACTOR_STORAGE.runtimeLive : REFACTOR_STORAGE.runtimePrematch;
}

function persistRuntimeBatch(
  mode: "live" | "prematch",
  result: {
    canonicalMatches: CanonicalMatch[];
    aiBriefs: AiEvaluationBrief[];
    quantitativeFeatures?: Record<string, QuantitativeFeatures>;
    metadata: RefactorRuntimeBatch["metadata"];
  }
): RefactorRuntimeBatch {
  const quantitativeFeatures: Record<string, QuantitativeFeatures> = {
    ...(result.quantitativeFeatures || {}),
  };

  // 保证每场赛事都有一份服务端预计算的 Layer 03 特征集
  if (Object.keys(quantitativeFeatures).length < result.canonicalMatches.length) {
    for (const match of result.canonicalMatches) {
      if (!quantitativeFeatures[match.canonical_id]) {
        try {
          quantitativeFeatures[match.canonical_id] = calculateQuantitativeFeatures(match);
        } catch (err: any) {
          console.error(`[CanonicalRoutes] Error computing quant for match ${match.canonical_id}:`, err);
        }
      }
    }
  }

  const batch: RefactorRuntimeBatch = {
    schema_version: 1,
    batch_id: `refactor-${mode}-${Date.now()}`,
    imported_at: new Date().toISOString(),
    mode,
    matches: result.canonicalMatches,
    ai_briefs: result.aiBriefs,
    quantitative_features: quantitativeFeatures,
    metadata: result.metadata,
  };
  if (!writeJsonFile(runtimePath(mode), batch)) {
    throw new Error(`Failed to persist refactor ${mode} runtime batch`);
  }
  return batch;
}

/**
 * 辅助函数：装配指定模式下的所有 Canonical 比赛并预计算 Layer 03 特征集
 */
export function assembleMatchesForMode(mode: "live" | "prematch"): {
  canonicalMatches: CanonicalMatch[];
  aiBriefs: AiEvaluationBrief[];
  quantitativeFeatures: Record<string, QuantitativeFeatures>;
  leisuCandidates: Array<{
    match_id: string;
    competition: string;
    home_team: string;
    away_team: string;
    minute: number | null;
    score: { home: number; away: number } | null;
    commence_time: string | null;
    status_text: string;
    is_live: boolean;
  }>;
  metadata: {
    mode: string;
    ybtySource: string;
    leisuSource: string;
    ybtyMatchCount: number;
    leisuMatchCount: number;
    alignedCount: number;
  };
} {
  const isLive = mode === "live";

  // 1. 读取队名与联赛别名库
  const manualAliases = readJsonFile<Record<string, string | string[]>>(REFACTOR_STORAGE.manualAliases, {});
  const leagueAliases = readJsonFile<Record<string, string | string[]>>(REFACTOR_STORAGE.leagueAliases, {});

  // 2. 读取 YBTY 数据
  const ybtyActivePath = isLive ? REFACTOR_STORAGE.liveYbtyActive : REFACTOR_STORAGE.prematchYbtyActive;
  const ybtyDefaultPath = isLive ? REFACTOR_STORAGE.liveYbtyDefault : REFACTOR_STORAGE.prematchYbtyDefault;

  let ybtySource = fs.existsSync(ybtyActivePath) ? ybtyActivePath : ybtyDefaultPath;
  let ybtyRawPayload = readJsonFile<any>(ybtySource, null);

  if (!ybtyRawPayload || !Array.isArray(ybtyRawPayload.matches) || ybtyRawPayload.matches.length === 0) {
    ybtySource = ybtyDefaultPath;
    ybtyRawPayload = readJsonFile<any>(ybtyDefaultPath, null);
  }

  let parsedYbtyMatches: GenericYbtyMatch[] = [];
  if (ybtyRawPayload) {
    try {
      if (isLive) {
        const parsedRoot = parseYbtyLiveRoot(ybtyRawPayload);
        parsedYbtyMatches = parsedRoot.matches.map((m) => ({
          league: m.league,
          home: m.home,
          away: m.away,
          home_score: m.home_score,
          away_score: m.away_score,
          clock: m.clock,
          clock_status: m.clock_status,
          added_time: m.added_time,
          countdown: m.countdown,
          commence_time: m.commence_time,
          _pre_start_text: m._pre_start_text,
          captured_at: m.captured_at,
          is_live: true,
          markets: m.markets,
        }));
      } else {
        const parsedRoot = parseYbtyPrematchRoot(ybtyRawPayload);
        parsedYbtyMatches = parsedRoot.matches.map((m) => ({
          league: m.league,
          home: m.home,
          away: m.away,
          home_score: null,
          away_score: null,
          clock: null,
          clock_status: m.clock_status,
          countdown: m.countdown,
          commence_time: m.commence_time,
          _pre_start_text: m._pre_start_text,
          captured_at: m.captured_at,
          is_live: false,
          markets: m.markets,
        }));
      }
    } catch (parseErr: any) {
      systemAlertBus.publish({
        code: SystemErrorCode.INVALID_JSON_STRUCTURE,
        severity: "critical",
        module: "YbtyExtractor",
        title: "YBTY 数据解析严重异常",
        message: `YBTY 数据解析严重异常: ${parseErr?.message || "格式不合法"}`,
        payload: { error: String(parseErr) },
        requires_ui_popup: true,
      });
    }
  }

  // 3. 读取雷速数据
  const leisuActivePath = isLive ? REFACTOR_STORAGE.liveLeisuActive : REFACTOR_STORAGE.prematchLeisuActive;
  const leisuDefaultPath = isLive ? REFACTOR_STORAGE.liveLeisuDefault : REFACTOR_STORAGE.prematchLeisuDefault;

  let leisuSource = fs.existsSync(leisuActivePath) ? leisuActivePath : leisuDefaultPath;
  let leisuRawPayload = readJsonFile<any>(leisuSource, null);

  if (!leisuRawPayload || !Array.isArray(leisuRawPayload.results) || leisuRawPayload.results.length === 0) {
    leisuSource = leisuDefaultPath;
    leisuRawPayload = readJsonFile<any>(leisuDefaultPath, null);
  }

  let parsedLeisuMatches: ParsedLeisuMatch[] = [];
  if (leisuRawPayload && Array.isArray(leisuRawPayload.results)) {
    try {
      const parsed = parseLeisuInterfaceExport(leisuRawPayload);
      parsedLeisuMatches = parsed.matches;
    } catch (leisuErr: any) {
      systemAlertBus.publish({
        code: SystemErrorCode.INVALID_JSON_STRUCTURE,
        severity: "warning",
        module: "LeisuExtractor",
        title: "雷速数据接口解析警告",
        message: `雷速数据接口解析警告: ${leisuErr?.message || "格式异常"}`,
        payload: { error: String(leisuErr) },
        requires_ui_popup: false,
      });
    }
  }

  // 4. 组装标准赛事 CanonicalMatch 与 AI Brief
  const canonicalMatches: CanonicalMatch[] = [];
  const aiBriefs: AiEvaluationBrief[] = [];
  const availableLeisuMatches = [...parsedLeisuMatches];

  for (const ybtyMatch of parsedYbtyMatches) {
    const { best_match, decision } = findBestLeisuMatch(
      ybtyMatch,
      availableLeisuMatches,
      manualAliases,
      leagueAliases
    );

    if (!decision || !best_match) continue;

    const canonical = assembleCanonicalMatch(
      ybtyMatch,
      best_match,
      decision
    );

    const brief = extractAiEvaluationBrief(canonical);

    canonicalMatches.push(canonical);
    aiBriefs.push(brief);
    const matchedIndex = availableLeisuMatches.findIndex(
      (candidate) => candidate.match_id === best_match.match_id
    );
    if (matchedIndex >= 0) availableLeisuMatches.splice(matchedIndex, 1);
  }

  const leisuCandidates = parsedLeisuMatches.map((m) => ({
    match_id: m.match_id,
    competition: m.competition,
    home_team: m.home_team,
    away_team: m.away_team,
    minute: null as number | null,
    score: m.score,
    commence_time: m.commence_time,
    status_text: m.status_text,
    is_live: m.is_live,
  }));

  // 5. Layer 03: 服务端统一预计算确定性量化特征集 (Precompute Layer 03 Quant Features)
  const quantitativeFeatures: Record<string, QuantitativeFeatures> = {};
  for (const match of canonicalMatches) {
    try {
      quantitativeFeatures[match.canonical_id] = calculateQuantitativeFeatures(match);
    } catch (err: any) {
      console.error(`[CanonicalRoutes] Error computing quant for match ${match.canonical_id}:`, err);
    }
  }

  return {
    canonicalMatches,
    aiBriefs,
    quantitativeFeatures,
    leisuCandidates,
    metadata: {
      mode,
      ybtySource,
      leisuSource,
      ybtyMatchCount: parsedYbtyMatches.length,
      leisuMatchCount: parsedLeisuMatches.length,
      alignedCount: canonicalMatches.length,
    },
  };
}

function readRuntimeBatch(mode: "live" | "prematch"): RefactorRuntimeBatch | null {
  const batch = readJsonFile<RefactorRuntimeBatch | null>(runtimePath(mode), null);
  if (!batch || batch.schema_version !== 1 || batch.mode !== mode || !Array.isArray(batch.matches)) {
    return null;
  }
  return batch;
}

export function registerCanonicalRoutes(app: express.Express): void {
  /**
   * GET /api/refactor/canonical-matches
   * 查询当前重构系统的标准赛事列表与预计算量化特征
   */
  app.get("/api/refactor/canonical-matches", (req, res) => {
    try {
      const mode = (req.query.mode as string) === "prematch" ? "prematch" : "live";
      let runtimeBatch = readRuntimeBatch(mode);

      // 如果 runtimeBatch 不存在，则执行初次懒加载装配
      if (!runtimeBatch) {
        try {
          runtimeBatch = persistRuntimeBatch(mode, assembleMatchesForMode(mode));
        } catch (e) {
          console.warn("[CanonicalRoutes] Initial assemble failed:", e);
        }
      } else if (!runtimeBatch.quantitative_features || Object.keys(runtimeBatch.quantitative_features).length === 0) {
        // 增量自动升级已有历史批次，预计算 Layer 03 特征集并更新磁盘持久化
        const quantitativeFeatures: Record<string, QuantitativeFeatures> = {};
        for (const match of runtimeBatch.matches) {
          try {
            quantitativeFeatures[match.canonical_id] = calculateQuantitativeFeatures(match);
          } catch (err: any) {
            console.error(`[CanonicalRoutes] Upgrade quant error for ${match.canonical_id}:`, err);
          }
        }
        runtimeBatch.quantitative_features = quantitativeFeatures;
        writeJsonFile(runtimePath(mode), runtimeBatch);
      }

      const result = runtimeBatch ?? {
        matches: [],
        ai_briefs: [],
        quantitative_features: {},
        metadata: {
          mode,
          ybtySource: "refactor_runtime",
          leisuSource: "refactor_runtime",
          ybtyMatchCount: 0,
          leisuMatchCount: 0,
          alignedCount: 0,
        },
        batch_id: null,
        imported_at: null,
      };

      res.json({
        success: true,
        mode: result.metadata.mode,
        count: result.matches.length,
        matches: result.matches,
        ai_briefs: result.ai_briefs,
        quantitative_features: result.quantitative_features || {},
        metadata: result.metadata,
        batch_id: "batch_id" in result ? result.batch_id : null,
        imported_at: "imported_at" in result ? result.imported_at : null,
      });
    } catch (error: any) {
      console.error("[CanonicalRoutes] Error assembling canonical matches:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to assemble canonical matches",
      });
    }
  });

  /**
   * GET /api/refactor/alerts
   * 获取系统当前全量告警事件与未知枚举报告
   */
  app.get("/api/refactor/alerts", (_req, res) => {
    res.json({
      success: true,
      alerts: systemAlertBus.getHistory(),
      unknown_enums: commonEnumRegistry.getAllUnknownReports(),
    });
  });

  /**
   * GET /api/league-aliases
   * 获取联赛标准映射与别名库
   */
  app.get("/api/league-aliases", (_req, res) => {
    try {
      const aliases = readJsonFile<Record<string, string | string[]>>(REFACTOR_STORAGE.leagueAliases, {});
      res.json({ success: true, aliases });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/league-aliases
   * 新增或更新联赛别名映射
   */
  app.post("/api/league-aliases", (req, res) => {
    try {
      const { canonical_name, alias } = req.body;
      if (!canonical_name || !alias) {
        return res.status(400).json({ success: false, error: "canonical_name and alias are required" });
      }

      const aliases = readJsonFile<Record<string, string | string[]>>(REFACTOR_STORAGE.leagueAliases, {});
      const existing = aliases[canonical_name];

      if (Array.isArray(existing)) {
        if (!existing.includes(alias)) {
          aliases[canonical_name] = [...existing, alias];
        }
      } else if (typeof existing === "string") {
        if (existing !== alias) {
          aliases[canonical_name] = [existing, alias];
        }
      } else {
        aliases[canonical_name] = [alias];
      }

      writeJsonFile(REFACTOR_STORAGE.leagueAliases, aliases);
      res.json({ success: true, message: `联赛别名已保存: ${canonical_name} -> ${alias}`, aliases });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/refactor/alerts/clear
   * 清空全量告警事件与未知枚举收集箱
   */
  app.post("/api/refactor/alerts/clear", (_req, res) => {
    systemAlertBus.clearHistory();
    commonEnumRegistry.clear();
    res.json({
      success: true,
      message: "告警与枚举审计事件已全部清空",
    });
  });

  /**
   * POST /api/refactor/import-data
   * 重构体系专有原生数据导入接口（零旧系统依赖，直接持久化至 refactor/ 目录）
   */
  app.post("/api/refactor/import-data", (req, res) => {
    try {
      const {
        mode,
        files_payload,
        selected_match_ids,
        ybty_payload,
        leisu_payload,
        reset_to_sample = false,
      } = req.body;

      // 1. 如果请求重置为测试样本
      if (reset_to_sample) {
        const targetMode: "live" | "prematch" = mode === "prematch" ? "prematch" : "live";
        const ybtyActivePath = targetMode === "live" ? REFACTOR_STORAGE.liveYbtyActive : REFACTOR_STORAGE.prematchYbtyActive;
        const leisuActivePath = targetMode === "live" ? REFACTOR_STORAGE.liveLeisuActive : REFACTOR_STORAGE.prematchLeisuActive;

        if (fs.existsSync(ybtyActivePath)) fs.unlinkSync(ybtyActivePath);
        if (fs.existsSync(leisuActivePath)) fs.unlinkSync(leisuActivePath);

        const result = persistRuntimeBatch(targetMode, assembleMatchesForMode(targetMode));
        return res.json({
          success: true,
          message: `已重置为 ${targetMode} 模式内置测试样本`,
          mode: targetMode,
          matches: result.matches,
          ai_briefs: result.ai_briefs,
          quantitative_features: result.quantitative_features || {},
          metadata: result.metadata,
          batch_id: result.batch_id,
          imported_at: result.imported_at,
        });
      }

      let ybtyLiveWritten = false;
      let ybtyPrematchWritten = false;
      let leisuLiveWritten = false;
      let leisuPrematchWritten = false;
      let detectedTargetMode: "live" | "prematch" = mode === "prematch" ? "prematch" : "live";

      // 2. 如果提供了多文件批量导入数组 (files_payload: Array<{ fileName: string; rawJson: any }>)
      if (Array.isArray(files_payload) && files_payload.length > 0) {
        for (const fileItem of files_payload) {
          const rawObj = typeof fileItem.rawJson === "string" ? JSON.parse(fileItem.rawJson) : fileItem.rawJson;
          const sniffResult = sniffIngressPayload(fileItem.fileName || "unknown.json", 0, rawObj);

          if (sniffResult.fileType === "ybty_live") {
            writeJsonFile(REFACTOR_STORAGE.liveYbtyActive, rawObj);
            ybtyLiveWritten = true;
            detectedTargetMode = "live";
          } else if (sniffResult.fileType === "ybty_prematch") {
            writeJsonFile(REFACTOR_STORAGE.prematchYbtyActive, rawObj);
            ybtyPrematchWritten = true;
            detectedTargetMode = "prematch";
          } else if (sniffResult.fileType === "leisu_interface") {
            // 雷速数据同时作用于当前模式与对齐库
            writeJsonFile(REFACTOR_STORAGE.liveLeisuActive, rawObj);
            writeJsonFile(REFACTOR_STORAGE.prematchLeisuActive, rawObj);
            leisuLiveWritten = true;
            leisuPrematchWritten = true;
          }
        }
      }

      // 3. 兼容传统单个参数导入
      if (ybty_payload) {
        const payloadObj = typeof ybty_payload === "string" ? JSON.parse(ybty_payload) : ybty_payload;
        const sniff = sniffIngressPayload("ybty.json", 0, payloadObj);
        const isPrematch = sniff.mode === "prematch" || mode === "prematch";
        const ybtyPath = isPrematch ? REFACTOR_STORAGE.prematchYbtyActive : REFACTOR_STORAGE.liveYbtyActive;
        writeJsonFile(ybtyPath, payloadObj);
        if (isPrematch) {
          ybtyPrematchWritten = true;
          detectedTargetMode = "prematch";
        } else {
          ybtyLiveWritten = true;
          detectedTargetMode = "live";
        }
      }

      if (leisu_payload) {
        const payloadObj = typeof leisu_payload === "string" ? JSON.parse(leisu_payload) : leisu_payload;
        const leisuPath = (mode === "prematch" || detectedTargetMode === "prematch")
          ? REFACTOR_STORAGE.prematchLeisuActive
          : REFACTOR_STORAGE.liveLeisuActive;
        writeJsonFile(leisuPath, payloadObj);
        leisuLiveWritten = true;
      }

      // 4. 立即执行 Layer 01 解析与 Layer 02 对齐
      const assembled = assembleMatchesForMode(detectedTargetMode);
      const selectedIds = Array.isArray(selected_match_ids)
        ? new Set(selected_match_ids.map((id: unknown) => String(id)))
        : null;
      const selectedMatches = selectedIds && selectedIds.size > 0
        ? assembled.canonicalMatches.filter((match) => selectedIds.has(String(match.canonical_id)))
        : assembled.canonicalMatches;
      const selectedBriefs = selectedIds && selectedIds.size > 0
        ? assembled.aiBriefs.filter((brief) => selectedIds.has(String(brief.match_id)))
        : assembled.aiBriefs;
      const selectedQuant: Record<string, QuantitativeFeatures> = {};
      for (const match of selectedMatches) {
        if (assembled.quantitativeFeatures[match.canonical_id]) {
          selectedQuant[match.canonical_id] = assembled.quantitativeFeatures[match.canonical_id];
        } else {
          try {
            selectedQuant[match.canonical_id] = calculateQuantitativeFeatures(match);
          } catch (e) {
            console.error(`[CanonicalRoutes] Error computing quant for ${match.canonical_id}:`, e);
          }
        }
      }

      const result = persistRuntimeBatch(detectedTargetMode, {
        canonicalMatches: selectedMatches,
        aiBriefs: selectedBriefs,
        quantitativeFeatures: selectedQuant,
        metadata: {
          ...assembled.metadata,
          alignedCount: selectedMatches.length,
        },
      });

      const updateLogs: string[] = [];
      if (ybtyLiveWritten) updateLogs.push("YBTY滚球");
      if (ybtyPrematchWritten) updateLogs.push("YBTY赛前");
      if (leisuLiveWritten || leisuPrematchWritten) updateLogs.push("雷速接口数据");

      res.json({
        success: true,
        message: updateLogs.length > 0
          ? `已成功智能识别并导入 ${updateLogs.length} 项数据源: ${updateLogs.join("、")}`
          : "数据已导入",
        mode: detectedTargetMode,
        matches: result.matches,
        ai_briefs: result.ai_briefs,
        quantitative_features: result.quantitative_features || {},
        metadata: result.metadata,
        batch_id: result.batch_id,
        imported_at: result.imported_at,
      });
    } catch (error: any) {
      console.error("[CanonicalRoutes] Error importing data:", error);
      res.status(400).json({
        success: false,
        error: error.message || "Failed to import and parse ingress data",
      });
    }
  });
}

import { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { UniverseLedgerPersistence } from "../../refactor/05_portfolio_risk/universeLedgerPersistence.js";
import { UniverseAuditRecord } from "../../refactor/05_portfolio_risk/types.js";

const REFACTOR_STORAGE = {
  liveLeisuActive: path.resolve(process.cwd(), "refactor/runtime/active_leisu_live.json"),
  prematchLeisuActive: path.resolve(process.cwd(), "refactor/runtime/active_leisu_prematch.json"),
  liveLeisuDefault: path.resolve(process.cwd(), "LYX/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json"),
  prematchLeisuDefault: path.resolve(process.cwd(), "output/leisu_prematch_latest.json"),
};

function mapUniverseToArchivedRecord(r: UniverseAuditRecord) {
  const quant = r.quant_snapshot;
  const isSettled = r.settlement?.is_settled === true;

  return {
    archive_id: r.record_id,
    canonical_id: r.match_id,
    match_slug: `${r.teams.home}_vs_${r.teams.away}`,
    mode: r.stage === "LIVE" ? "live" : "prematch",
    stage: r.stage,
    created_at: r.created_at_utc,
    updated_at: r.settlement?.settled_at || r.created_at_utc,
    league_name: r.league_key,
    home_team_name: r.teams.home,
    away_team_name: r.teams.away,
    commence_time: r.kickoff_time || null,
    calculation_snapshot: {
      minute_or_status: r.minute_or_status,
      score_at_calculation: r.score_at_prediction,
      score_verified: r.score_verified,
      markets: {
        ah_line: quant.ah_line,
        ah_home_odds: quant.markets?.ah_home_odds ?? null,
        ah_away_odds: quant.markets?.ah_away_odds ?? null,
        ou_line: quant.ou_line,
        ou_over_odds: quant.markets?.ou_over_odds ?? null,
        ou_under_odds: quant.markets?.ou_under_odds ?? null,
        h2h_home: quant.markets?.h2h_home ?? null,
        h2h_draw: quant.markets?.h2h_draw ?? null,
        h2h_away: quant.markets?.h2h_away ?? null,
      },
      quant: {
        lambda_home: quant.lambda_home,
        lambda_away: quant.lambda_away,
        forward_goals_expected: quant.forward_goals_expected,
        projected_final_score: quant.projected_final_score,
        top_scores: quant.top_scores || [],
        bdi: quant.bdi,
        candidate_pipeline_state: quant.candidate_pipeline_state,
      },
    },
    settlement_status: isSettled ? "SETTLED" : "PENDING",
    finished_score: r.settlement?.final_score || null,
    finished_score_source: r.settlement?.final_score_source || null,
    settled_at: r.settlement?.settled_at || null,
    reflection: isSettled && r.settlement?.reflection ? {
      actual_total_goals: r.settlement.reflection.actual_total_goals,
      goal_diff_actual: r.settlement.reflection.goal_diff_actual,
      score_hit: r.settlement.reflection.score_hit,
      exact_score_hit: r.settlement.reflection.exact_score_hit,
      ah_outcome: r.settlement.reflection.ah_outcome || null,
      ou_outcome: r.settlement.reflection.ou_outcome || null,
      diagnostic_notes: r.settlement.reflection.diagnostic_notes,
    } : null,
  };
}

export function registerMatchArchiveRoutes(app: Express) {
  /**
   * GET /api/refactor/match-archive
   * 获取所有建档赛事的预测快照、核销状态与赛后反思记录 (直接由底层 UniverseLedgerPersistence 驱动)
   */
  app.get("/api/refactor/match-archive", (req: Request, res: Response) => {
    try {
      const mode = req.query.mode as string | undefined;
      const status = req.query.status as string | undefined;
      const liveRecords = UniverseLedgerPersistence.loadLedger("LIVE");
      const prematchRecords = UniverseLedgerPersistence.loadLedger("PREMATCH");
      let records = [...liveRecords, ...prematchRecords].map(mapUniverseToArchivedRecord);

      if (mode === "live" || mode === "prematch") {
        records = records.filter((r) => r.mode === mode);
      }
      if (status === "SETTLED" || status === "PENDING") {
        records = records.filter((r) => r.settlement_status === status);
      }

      // 计算统计指标
      const total = records.length;
      const settled = records.filter((r) => r.settlement_status === "SETTLED");
      const pending = total - settled.length;
      const scoreHits = settled.filter((r) => r.reflection?.score_hit).length;
      const exactScoreHits = settled.filter((r) => r.reflection?.exact_score_hit).length;
      const scoreHitRate = settled.length > 0 ? (scoreHits / settled.length) : 0;
      const exactHitRate = settled.length > 0 ? (exactScoreHits / settled.length) : 0;

      res.json({
        success: true,
        summary: {
          total_archived: total,
          settled_count: settled.length,
          pending_count: pending,
          score_hits: scoreHits,
          exact_score_hits: exactScoreHits,
          score_hit_rate: Number((scoreHitRate * 100).toFixed(1)),
          exact_hit_rate: Number((exactHitRate * 100).toFixed(1)),
        },
        records: records.reverse(), // 最近建档的居前
      });
    } catch (e: any) {
      console.error("[MatchArchiveRoutes] Error fetching archive:", e);
      res.status(500).json({ success: false, error: e?.message || "获取赛事档案失败" });
    }
  });

  /**
   * POST /api/refactor/match-archive/settle-leisu
   * 读取雷速完场数据或传入的雷速 JSON，执行全自动赛果核销与赛后反思梳理
   */
  app.post("/api/refactor/match-archive/settle-leisu", (req: Request, res: Response) => {
    try {
      const { leisu_payload } = req.body;
      let payloadToUse = leisu_payload;

      if (!payloadToUse) {
        const candidates = [
          REFACTOR_STORAGE.liveLeisuActive,
          REFACTOR_STORAGE.prematchLeisuActive,
          REFACTOR_STORAGE.liveLeisuDefault,
          REFACTOR_STORAGE.prematchLeisuDefault,
        ];
        for (const filePath of candidates) {
          if (fs.existsSync(filePath)) {
            try {
              const content = fs.readFileSync(filePath, "utf-8");
              const parsed = JSON.parse(content);
              if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
                payloadToUse = parsed;
                break;
              }
            } catch {
              // try next
            }
          }
        }
      }

      if (!payloadToUse) {
        return res.status(400).json({
          success: false,
          error: "未检测到可用的雷速完场数据，请先在导入向导中上传包含完场比分的雷速数据",
        });
      }

      const rawMatches = Array.isArray(payloadToUse)
        ? payloadToUse
        : (Array.isArray(payloadToUse?.results) ? payloadToUse.results : []);

      const leisuFinishedList = rawMatches.map((m: any) => ({
        home_team: m.home_team_name || m.home_team || m.home || "",
        away_team: m.away_team_name || m.away_team || m.away || "",
        score: m.score || (m.home_score != null && m.away_score != null ? { home: Number(m.home_score), away: Number(m.away_score) } : null),
      })).filter((m: any) => m.score && typeof m.score.home === "number" && typeof m.score.away === "number");

      const result = UniverseLedgerPersistence.settleWithLeisuFinished(leisuFinishedList);

      res.json({
        success: true,
        message: `雷速完场反思核销完成: 已结算 ${result.settled_count} 场建档赛事！`,
        settled_count: result.settled_count,
        avoidance_count: result.avoidance_count,
        false_negative_count: result.false_negative_count,
      });
    } catch (e: any) {
      console.error("[MatchArchiveRoutes] Error in settle-leisu:", e);
      res.status(500).json({ success: false, error: e?.message || "雷速核销反思异常" });
    }
  });

  /**
   * POST /api/refactor/match-archive/settle-single
   * 人工录入单场完场赛果并触发确定性反思生成
   */
  app.post("/api/refactor/match-archive/settle-single", (req: Request, res: Response) => {
    try {
      const { archive_id, final_score, source = "人工核实" } = req.body;
      if (!archive_id || !final_score || typeof final_score.home !== "number" || typeof final_score.away !== "number") {
        return res.status(400).json({ success: false, error: "缺少有效 archive_id 或 final_score (home/away)" });
      }

      const validFinalScore = { home: Number(final_score.home), away: Number(final_score.away) };
      let settled = UniverseLedgerPersistence.settleSingleRecord("LIVE", archive_id, validFinalScore, source);
      if (!settled) {
        settled = UniverseLedgerPersistence.settleSingleRecord("PREMATCH", archive_id, validFinalScore, source);
      }
      if (!settled) {
        return res.status(404).json({ success: false, error: `未找到档案记录: ${archive_id}` });
      }

      const updated = mapUniverseToArchivedRecord(settled);
      res.json({
        success: true,
        message: `成功为 ${updated.home_team_name} vs ${updated.away_team_name} 录入完场比分并生成反思分析`,
        record: updated,
      });
    } catch (e: any) {
      console.error("[MatchArchiveRoutes] Error in settle-single:", e);
      res.status(500).json({ success: false, error: e?.message || "单场核销反思异常" });
    }
  });
}

import { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { MatchArchiveStore } from "../services/matchArchiveStore";

const REFACTOR_STORAGE = {
  liveLeisuActive: path.resolve(process.cwd(), "refactor/runtime/active_leisu_live.json"),
  prematchLeisuActive: path.resolve(process.cwd(), "refactor/runtime/active_leisu_prematch.json"),
  liveLeisuDefault: path.resolve(process.cwd(), "LYX/leisu_v2.8.0_interface_data_2026-08-20T20-20-34-708Z.json"),
  prematchLeisuDefault: path.resolve(process.cwd(), "output/leisu_prematch_latest.json"),
};

export function registerMatchArchiveRoutes(app: Express) {
  /**
   * GET /api/refactor/match-archive
   * 获取所有建档赛事的预测快照、核销状态与赛后反思记录
   */
  app.get("/api/refactor/match-archive", (req: Request, res: Response) => {
    try {
      const mode = req.query.mode as string | undefined;
      const status = req.query.status as string | undefined;
      let records = MatchArchiveStore.loadArchive();

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
        // 依次尝试读取活跃与预置雷速数据文件
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

      const result = MatchArchiveStore.settleWithLeisuFinished(payloadToUse);

      res.json({
        success: true,
        message: `雷速完场反思核销完成: 已结算 ${result.settled_count} 场建档赛事，联动核销 ${result.ledger_settled_count} 条正式推荐，沉淀 ${result.oos_samples_count} 条真实 OOS 校准样本！`,
        settled_count: result.settled_count,
        settled_matches: result.settled_matches,
        ledger_settled_count: result.ledger_settled_count,
        oos_samples_count: result.oos_samples_count,
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

      const updated = MatchArchiveStore.settleSingle(archive_id, final_score, source);
      if (!updated) {
        return res.status(404).json({ success: false, error: `未找到档案记录: ${archive_id}` });
      }

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

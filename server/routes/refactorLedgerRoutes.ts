import type express from "express";
import * as fsPath from "fs";
import * as path from "path";
import { LedgerPersistence } from "../../refactor/05_portfolio_risk/ledgerPersistence.js";
import { evaluateQuarterSettlement, parseAsianLine, QuarterMarketCategory } from "../../refactor/06_settlement_audit/settlementEngine.js";
import { appendSampleAndRebuildArchive, getOosStatus } from "../services/oosArchiveService.js";
import { OosCalibrationSample } from "../../refactor/03_quant_engine/types.js";
import { BettingStage, FormalRecommendation } from "../../refactor/05_portfolio_risk/types.js";

function detectRefactorQuarterCategory(record: FormalRecommendation): QuarterMarketCategory {
  const legDir = String(record.leg?.direction || "").toUpperCase();
  if (legDir === "OVER") return "TOTAL_OVER";
  if (legDir === "UNDER") return "TOTAL_UNDER";
  if (legDir === "DRAW") return "H2H_DRAW";
  if (legDir === "AWAY") {
    const market = String(record.prediction_snapshot?.market || record.leg?.market || "").toLowerCase();
    if (market.includes("让") || market.includes("handicap") || market.includes("ah")) return "SPREAD_AWAY";
    return "H2H_AWAY";
  }
  if (legDir === "HOME") {
    const market = String(record.prediction_snapshot?.market || record.leg?.market || "").toLowerCase();
    if (market.includes("让") || market.includes("handicap") || market.includes("ah")) return "SPREAD_HOME";
    return "H2H_HOME";
  }

  const market = String(record.prediction_snapshot?.market || record.leg?.market || "").toLowerCase();
  const rawDirection = String(record.prediction_snapshot?.line || record.leg?.selected_line || "").toLowerCase();

  if (market.includes("大") || market.includes("over") || rawDirection.includes("over")) {
    return "TOTAL_OVER";
  }
  if (market.includes("小") || market.includes("under") || rawDirection.includes("under")) {
    return "TOTAL_UNDER";
  }
  if (market.includes("平") || market.includes("draw") || rawDirection.includes("draw")) {
    return "H2H_DRAW";
  }
  if (market.includes("让") || market.includes("handicap") || market.includes("ah")) {
    if (market.includes("客") || market.includes("away") || rawDirection.includes("away") || rawDirection.includes("客")) {
      return "SPREAD_AWAY";
    }
    return "SPREAD_HOME";
  }
  if (market.includes("客") || market.includes("away") || rawDirection.includes("away") || rawDirection.includes("客")) {
    return "H2H_AWAY";
  }
  if (market.includes("主") || market.includes("home") || rawDirection.includes("home") || rawDirection.includes("主")) {
    return "H2H_HOME";
  }
  return "UNKNOWN_DIRECTION";
}

export function registerRefactorLedgerRoutes(app: express.Express): void {
  app.get("/api/refactor/formal-ledger", (_req, res) => {
    const live = LedgerPersistence.loadLedger("LIVE");
    const prematch = LedgerPersistence.loadLedger("PREMATCH");
    res.json({ success: true, live, prematch, count: live.length + prematch.length, oos_status: getOosStatus() });
  });

  app.post("/api/refactor/formal-ledger/settle", (req, res) => {
    try {
      const { record_id, stage = "LIVE", final_score, score_verified = true } = req.body;
      if (!record_id || !final_score || typeof final_score.home !== "number" || typeof final_score.away !== "number") {
        return res.status(400).json({ success: false, error: "缺少有效 record_id 或 final_score (home/away)" });
      }

      const bettingStage = (stage === "PREMATCH" ? "PREMATCH" : "LIVE") as BettingStage;
      const ledger = LedgerPersistence.loadLedger(bettingStage);
      const targetRecord = ledger.find((r) => r.record_id === record_id);

      if (!targetRecord) {
        return res.status(404).json({ success: false, error: `未找到重构台账记录: ${record_id}` });
      }

      const validFinalScore = { home: Number(final_score.home), away: Number(final_score.away) };
      const marketCategory = detectRefactorQuarterCategory(targetRecord);
      const rawLine = targetRecord.prediction_snapshot?.line || targetRecord.leg?.selected_line || 0;
      const numericLine = parseAsianLine(rawLine);
      const numericOdds = Number(targetRecord.prediction_snapshot?.odds || targetRecord.leg?.current_odds || 1.90);
      
      let recScore = { home: 0, away: 0 };
      if (targetRecord.prediction_snapshot?.score_at_recommendation) {
        const parts = targetRecord.prediction_snapshot.score_at_recommendation.split(/[-:]/);
        if (parts.length >= 2) {
          recScore = { home: parseInt(parts[0], 10) || 0, away: parseInt(parts[1], 10) || 0 };
        }
      }

      const isLive = bettingStage === "LIVE";
      const settlementRes = evaluateQuarterSettlement({
        market_category: marketCategory,
        line: numericLine,
        odds: numericOdds,
        is_live: isLive,
        basis: isLive ? "REMAINING_GOALS" : "FULL_MATCH",
        score_at_rec: recScore,
        final_score: validFinalScore,
        score_verified: score_verified !== false
      });

      targetRecord.settlement = {
        is_settled: true,
        settled_at: new Date().toISOString(),
        outcome: settlementRes.outcome as any,
        final_score_verified: `${validFinalScore.home}-${validFinalScore.away}`,
        final_score_source: "manual_user_verification",
        final_score_verified_at: new Date().toISOString(),
        profit_loss: settlementRes.net_profit_unit,
        explanation: settlementRes.explanation
      } as any;

      // 保存更新后的台账
      const filePath = path.join(process.cwd(), "refactor", "runtime", bettingStage === "LIVE" ? "formal_ledger_live.json" : "formal_ledger_prematch.json");
      fsPath.writeFileSync(filePath, JSON.stringify(ledger, null, 2), "utf8");

      // 若结果为 WIN 或 LOSE，自动增量沉淀至 OOS 校准样本库
      if ((settlementRes.outcome === "WIN" || settlementRes.outcome === "LOSE") && score_verified !== false) {
        const oosMarket = (marketCategory === "TOTAL_OVER" || marketCategory === "TOTAL_UNDER")
          ? "TOTAL_GOALS_MAIN"
          : "ASIAN_HANDICAP_MAIN";
        const prob = targetRecord.prediction_snapshot?.model_probability || 0.505;

        const oosSample: OosCalibrationSample = {
          sample_id: `refactor-oos-${targetRecord.record_id}`,
          model_version: targetRecord.prediction_snapshot?.model_version || "layer03-v1",
          prediction_at: targetRecord.created_at_utc || new Date().toISOString(),
          league_key: targetRecord.league_key || "GLOBAL",
          home_team_key: targetRecord.teams?.home || "Home",
          away_team_key: targetRecord.teams?.away || "Away",
          stage: bettingStage,
          minute: targetRecord.prediction_snapshot?.minute ?? (isLive ? 60 : null),
          score_state: `${recScore.home}-${recScore.away}`,
          red_card_state: targetRecord.prediction_snapshot?.red_card_state || "0-0",
          market: oosMarket,
          model_probability: prob,
          outcome: settlementRes.outcome === "WIN" ? 1 : 0,
          predicted_lambda: 2.50,
          observed_goals: validFinalScore.home + validFinalScore.away
        };

        appendSampleAndRebuildArchive(oosSample);
      }

      res.json({
        success: true,
        record: targetRecord,
        settlement: targetRecord.settlement,
        oos_status: getOosStatus()
      });
    } catch (e: any) {
      console.error("Refactor settle error:", e);
      res.status(500).json({ success: false, error: e?.message || "结算核销异常" });
    }
  });
}

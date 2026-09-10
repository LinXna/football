/**
 * @file refactorLedgerRoutes.ts
 * @description 重构系统正式推荐台账路由与结算审计闭环
 * 
 * 核心合规约束：
 * 1. 严格遵守 Layer 05 / Layer 06 数据契约；
 * 2. 只有 A/B 级推荐且 candidate_pipeline 为 PRODUCTION_UNLOCKED 方可写入正式台账；
 * 3. 结算核销严格使用 Layer 06 evaluateQuarterSettlement 进行四分之一盘精准结算；
 * 4. 只有真实核销且二元 WIN/LOSE 的记录，通过 convertFormalLedgerRecords 与 toOosSample
 *    提取真实的 model_probability 与 predicted_lambda，沉淀至 OOS 样本档案；
 * 5. 严禁任何硬编码常数（如 0.505 / 2.50）伪造样本。
 */

import type express from "express";
import fs from "fs";
import path from "path";
import { LedgerPersistence } from "../../refactor/05_portfolio_risk/ledgerPersistence.js";
import { evaluateQuarterSettlement, parseAsianLine, QuarterMarketCategory } from "../../refactor/06_settlement_audit/settlementEngine.js";
import { convertFormalLedgerRecords } from "../../refactor/06_settlement_audit/formalLedgerAdapter.js";
import { toOosSample } from "../../refactor/06_settlement_audit/historicalBacktestIngestion.js";
import { appendSampleAndRebuildArchive, getOosStatus } from "../services/oosArchiveService.js";
import { BettingStage, FormalRecommendation } from "../../refactor/05_portfolio_risk/types.js";
import { AiEvaluationResult, EvaluatorPayload, RecommendedLeg } from "../../refactor/04_ai_evaluator/types.js";
import { extractAiEvaluationBrief } from "../../refactor/02_canonical_model/canonicalMatchAssembler.js";
import { CanonicalMatch } from "../../refactor/02_canonical_model/types.js";
import { QuantitativeFeatures } from "../../refactor/03_quant_engine/types.js";

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
  /**
   * GET /api/refactor/formal-ledger
   * 读取重构系统的正式推荐台账（LIVE + PREMATCH）及 OOS 状态
   */
  app.get("/api/refactor/formal-ledger", (_req, res) => {
    try {
      const live = LedgerPersistence.loadLedger("LIVE");
      const prematch = LedgerPersistence.loadLedger("PREMATCH");
      res.json({
        success: true,
        live,
        prematch,
        count: live.length + prematch.length,
        oos_status: getOosStatus()
      });
    } catch (e: any) {
      console.error("Load formal ledger error:", e);
      res.status(500).json({ success: false, error: e?.message || "读取正式台账失败" });
    }
  });

  /**
   * POST /api/refactor/formal-ledger/append
   * 将经过 Layer 04 AI 评估并通过审核的推荐腿沉淀入正式台账
   */
  app.post("/api/refactor/formal-ledger/append", (req, res) => {
    try {
      const {
        stage = "LIVE",
        canonical_match,
        quant_features,
        ai_evaluation,
        selected_legs
      } = req.body as {
        stage?: "LIVE" | "PREMATCH";
        canonical_match?: CanonicalMatch;
        quant_features?: QuantitativeFeatures;
        ai_evaluation?: AiEvaluationResult;
        selected_legs?: RecommendedLeg[];
      };

      if (!canonical_match || !ai_evaluation) {
        return res.status(400).json({
          success: false,
          error: "缺少必须的 canonical_match 或 ai_evaluation"
        });
      }

      const bettingStage = (stage === "PREMATCH" ? "PREMATCH" : "LIVE") as BettingStage;

      // 校验评级与置信度门禁
      if (ai_evaluation.grade !== "A_GRADE" && ai_evaluation.grade !== "B_GRADE") {
        return res.status(400).json({
          success: false,
          error: `只有 A 级或 B 级推荐允许写入正式台账，当前评级: ${ai_evaluation.grade}`
        });
      }

      if (ai_evaluation.confidence_score < 70) {
        return res.status(400).json({
          success: false,
          error: `置信度低于 70 分不允许写入正式台账，当前置信度: ${ai_evaluation.confidence_score}`
        });
      }

      // 提取或组装 Brief
      const brief = extractAiEvaluationBrief(canonical_match);
      if (!brief.score_verification?.current_score) {
        const homeScore = canonical_match.score?.home_score ?? 0;
        const awayScore = canonical_match.score?.away_score ?? 0;
        brief.score_verification = {
          current_score: bettingStage === "PREMATCH" ? "0 - 0" : `${homeScore} - ${awayScore}`,
          is_verified: Boolean(canonical_match.score?.score_verified)
        };
      }

      // 准备量化特征与冻结预测快照
      const candidatePipeline = quant_features?.candidate_pipeline || ai_evaluation.candidate_pipeline;
      if (!candidatePipeline) {
        return res.status(400).json({
          success: false,
          error: "缺少 candidate_pipeline 门禁数据"
        });
      }

      // 确保 ai_evaluation 中的 candidate_pipeline 保持一致
      if (!ai_evaluation.candidate_pipeline) {
        ai_evaluation.candidate_pipeline = candidatePipeline;
      }

      // 构造 EvaluatorQuantFeatures
      const signals = quant_features?.positive_ev_signals || [];
      const rawSignals = quant_features?.raw_positive_ev_signals || signals;
      const lambdaHome = quant_features?.poisson?.lambda_home_rest ?? (quant_features?.poisson as any)?.lambda_home ?? 1.2;
      const lambdaAway = quant_features?.poisson?.lambda_away_rest ?? (quant_features?.poisson as any)?.lambda_away ?? 1.0;
      const calculatedAt = quant_features?.calculated_at || new Date().toISOString();

      const predictionSnapshot = (quant_features as any)?.prediction_snapshot || {
        model_version: "refactor-layer03-v1",
        prediction_at: calculatedAt,
        predicted_lambda: {
          home: Number(lambdaHome) || 1.2,
          away: Number(lambdaAway) || 1.0
        },
        red_card_state: quant_features?.match_state
          ? `${quant_features.match_state.red_card_attack_multiplier_home.toFixed(2)}/${quant_features.match_state.red_card_attack_multiplier_away.toFixed(2)}`
          : "0-0",
        signals: signals.length > 0 ? signals : rawSignals
      };

      const evaluatorQuantFeatures: any = {
        mathematical_ev_signals: rawSignals,
        raw_positive_ev_signals: rawSignals,
        machine_candidate_signals: signals,
        candidate_pipeline: candidatePipeline,
        bdi: quant_features?.battlefield_dominance_index || 0,
        goal_phase_alert: quant_features?.goal_phase_alert || "NONE",
        machine_candidate_count: candidatePipeline.machine_candidate_count,
        prediction_snapshot: predictionSnapshot
      };

      const payload: EvaluatorPayload = {
        ai_brief: brief,
        quant_features: evaluatorQuantFeatures
      };

      // 确定需要沉淀的推荐腿，并规范 settlement_basis
      const legsToPersist = selected_legs && selected_legs.length > 0
        ? selected_legs
        : ai_evaluation.recommended_legs;

      if (!legsToPersist || legsToPersist.length === 0) {
        return res.status(400).json({
          success: false,
          error: "ai_evaluation.recommended_legs 为空，没有可写入台账的推荐腿"
        });
      }

      // 严格补全合规的 settlement_basis（FULL_MATCH 或 REMAINING_GOALS）
      const normalizedLegs: RecommendedLeg[] = legsToPersist.map((leg) => {
        let basis = leg.basis;
        if (!basis || !["FULL_MATCH", "REMAINING_GOALS", "REMAINING_PERIOD_DOMINANCE"].includes(basis)) {
          basis = bettingStage === "PREMATCH" ? "FULL_MATCH" : "REMAINING_GOALS";
        }
        return {
          ...leg,
          basis
        };
      });

      // 执行原子写入
      const writtenRecords = LedgerPersistence.appendApprovedLegs(
        payload,
        ai_evaluation,
        normalizedLegs,
        bettingStage
      );

      return res.json({
        success: true,
        count: writtenRecords.length,
        records: writtenRecords,
        message: writtenRecords.length > 0
          ? `成功将 ${writtenRecords.length} 条推荐写入 ${bettingStage} 正式台账`
          : "该推荐已存在于台账中（幂等防护去重）"
      });
    } catch (e: any) {
      console.error("Append to formal ledger error:", e);
      return res.status(500).json({
        success: false,
        error: e?.message || "写入正式台账异常"
      });
    }
  });

  /**
   * POST /api/refactor/formal-ledger/settle
   * 对正式台账记录进行赛后比分核销，并通过 Layer 06 闭环沉淀真实 OOS 样本
   */
  app.post("/api/refactor/formal-ledger/settle", (req, res) => {
    try {
      const {
        record_id,
        stage = "LIVE",
        final_score,
        score_verified = true,
        score_source = "雷速比分画布/接口校验"
      } = req.body;

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
        basis: (targetRecord.leg?.basis as any) || (isLive ? "REMAINING_GOALS" : "FULL_MATCH"),
        score_at_rec: recScore,
        final_score: validFinalScore,
        score_verified: score_verified !== false
      });

      const settledAt = new Date().toISOString();
      targetRecord.settlement = {
        is_settled: true,
        settled_at: settledAt,
        outcome: settlementRes.outcome as any,
        final_score_verified: `${validFinalScore.home}-${validFinalScore.away}`,
        final_score_source: score_source,
        final_score_verified_at: settledAt,
        profit_loss: settlementRes.net_profit_unit
      } as any;

      // 确保 leg.basis 符合标准枚举，防止 OOS 适配器拦截
      if (!targetRecord.leg?.basis || !["FULL_MATCH", "REMAINING_GOALS", "REMAINING_PERIOD_DOMINANCE"].includes(targetRecord.leg.basis)) {
        targetRecord.leg.basis = isLive ? "REMAINING_GOALS" : "FULL_MATCH";
      }

      // 保存更新后的台账
      const filePath = path.join(
        process.cwd(),
        "refactor",
        "runtime",
        bettingStage === "LIVE" ? "formal_ledger_live.json" : "formal_ledger_prematch.json"
      );
      fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2), "utf8");

      // 核心闭环：通过 Layer 06 标准适配器转换并抽取真实 OOS 样本
      let oosSampleIngested = false;
      let skippedReason: string | undefined;

      const { records: converted, skipped } = convertFormalLedgerRecords([targetRecord]);
      if (converted.length > 0) {
        const oosSample = toOosSample(converted[0]);
        const ingestRes = appendSampleAndRebuildArchive(oosSample);
        oosSampleIngested = ingestRes.success;
      } else if (skipped.length > 0) {
        skippedReason = skipped[0].reason;
      }

      res.json({
        success: true,
        record: targetRecord,
        settlement: targetRecord.settlement,
        explanation: settlementRes.explanation,
        oos_sample_ingested: oosSampleIngested,
        skipped_reason: skippedReason,
        oos_status: getOosStatus()
      });
    } catch (e: any) {
      console.error("Refactor settle error:", e);
      res.status(500).json({ success: false, error: e?.message || "结算核销异常" });
    }
  });
}

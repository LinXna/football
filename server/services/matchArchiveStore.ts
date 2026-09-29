/**
 * 赛事档案与赛后反思中枢门面 (MatchArchiveStore Facade)
 * 
 * 架构重构收敛说明 (SSOT Convergence):
 * 1. 彻底淘汰独立的 output/refactor_match_archive.json 与 match_archive_store.json；
 * 2. 所有数据存储与核销计算 100% 委托给底层唯一事实来源：UniverseLedgerPersistence 与 LedgerPersistence；
 * 3. 对外保持纯净的门面接口，为现有调用端与 API 提供无缝向后兼容，杜绝任何双重状态。
 */

import fs from "fs";
import path from "path";
import { CanonicalMatch } from "../../refactor/02_canonical_model/types.js";
import { QuantitativeFeatures } from "../../refactor/03_quant_engine/types.js";
import { calculateStrictRawTextSimilarity } from "../../refactor/02_canonical_model/matchAligner";
import { LedgerPersistence } from "../../refactor/05_portfolio_risk/ledgerPersistence";
import { UniverseLedgerPersistence } from "../../refactor/05_portfolio_risk/universeLedgerPersistence.js";
import { UniverseAuditRecord } from "../../refactor/05_portfolio_risk/types.js";
import { evaluateQuarterSettlement, parseAsianLine } from "../../refactor/06_settlement_audit/settlementEngine.js";
import { convertFormalLedgerRecords } from "../../refactor/06_settlement_audit/formalLedgerAdapter.js";
import { ingestSettledRecordsAndPersist } from "../../refactor/06_settlement_audit/oosArchiveService.js";

export interface ArchivedMatchRecord {
  archive_id: string;
  canonical_id: string;
  match_slug: string;
  mode: "live" | "prematch";
  stage: "LIVE" | "PREMATCH";
  created_at: string;
  updated_at: string;
  league_name: string;
  home_team_name: string;
  away_team_name: string;
  commence_time: string | null;
  calculation_snapshot: {
    minute_or_status: string;
    score_at_calculation: { home: number; away: number } | null;
    score_verified: boolean;
    markets: {
      ah_line: number | null;
      ah_home_odds: number | null;
      ah_away_odds: number | null;
      ou_line: number | null;
      ou_over_odds: number | null;
      ou_under_odds: number | null;
      h2h_home: number | null;
      h2h_draw: number | null;
      h2h_away: number | null;
    };
    quant: {
      lambda_home: number;
      lambda_away: number;
      forward_goals_expected: number;
      projected_final_score: string;
      top_scores: Array<{ score: string; probability: number }>;
      bdi: number;
      candidate_pipeline_state: string;
    };
  };
  settlement_status: "PENDING" | "SETTLED" | "VOID";
  finished_score: { home: number; away: number } | null;
  finished_score_source: string | null;
  settled_at: string | null;
  reflection: {
    actual_total_goals: number;
    goal_diff_actual: number;
    score_hit: boolean;
    exact_score_hit: boolean;
    ah_outcome: "WIN" | "LOSE" | "PUSH" | "HALF_WIN" | "HALF_LOSE" | null;
    ou_outcome: "WIN" | "LOSE" | "PUSH" | "HALF_WIN" | "HALF_LOSE" | null;
    diagnostic_notes: string;
  } | null;
}

/**
 * 转换 UniverseAuditRecord 为统一的 ArchivedMatchRecord 视图结构
 */
function mapUniverseToArchivedRecord(r: UniverseAuditRecord): ArchivedMatchRecord {
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
    reflection: r.settlement?.reflection ? {
      actual_total_goals: r.settlement.reflection.actual_total_goals,
      goal_diff_actual: r.settlement.reflection.goal_diff_actual,
      score_hit: r.settlement.reflection.score_hit,
      exact_score_hit: r.settlement.reflection.exact_score_hit,
      ah_outcome: r.settlement.reflection.ah_outcome ?? null,
      ou_outcome: r.settlement.reflection.ou_outcome ?? null,
      diagnostic_notes: r.settlement.reflection.diagnostic_notes,
    } : null,
  };
}

export class MatchArchiveStore {
  /**
   * 加载档案数据 (SSOT: 直接委托给底层全量台账)
   */
  public static loadArchive(): ArchivedMatchRecord[] {
    const liveRecords = UniverseLedgerPersistence.loadLedger("LIVE");
    const prematchRecords = UniverseLedgerPersistence.loadLedger("PREMATCH");
    return [...liveRecords, ...prematchRecords].map(mapUniverseToArchivedRecord);
  }

  /**
   * 保存归档数据（已废弃独立物理文件写入，底层由 UniverseLedgerPersistence 原子自管理）
   */
  public static saveArchive(_records: ArchivedMatchRecord[]): boolean {
    return true;
  }

  /**
   * 自动为当前批次赛事建档 (SSOT: 委托给 UniverseLedgerPersistence)
   */
  public static archiveCanonicalMatches(
    matches: CanonicalMatch[],
    quantFeaturesMap: Record<string, QuantitativeFeatures>,
    mode: "live" | "prematch"
  ): number {
    const stage = mode === "live" ? "LIVE" : "PREMATCH";
    const res = UniverseLedgerPersistence.autoIngestFromCanonicalBatch(stage, matches, quantFeaturesMap);
    return res.added + res.updated;
  }

  /**
   * 单场人工/自动化赛果核销与反思梳理 (SSOT 联动核销)
   */
  public static settleSingle(
    archiveIdOrCanonicalId: string,
    finalScore: { home: number; away: number },
    source = "人工核实录入"
  ): ArchivedMatchRecord | null {
    const finHome = Number(finalScore.home);
    const finAway = Number(finalScore.away);
    const validFinalScore = { home: finHome, away: finAway };

    // 1. 在 UniverseLedgerPersistence 中寻找记录并核销
    let targetStage: "LIVE" | "PREMATCH" = "LIVE";
    let settledUniverse = UniverseLedgerPersistence.settleSingleRecord("LIVE", archiveIdOrCanonicalId, validFinalScore, source);
    if (!settledUniverse) {
      targetStage = "PREMATCH";
      settledUniverse = UniverseLedgerPersistence.settleSingleRecord("PREMATCH", archiveIdOrCanonicalId, validFinalScore, source);
    }

    if (!settledUniverse) {
      return null;
    }

    // 2. 联动核销轨道一正式推荐台账 (若存在对应记录且未结算，同步沉淀真实 OOS 样本)
    try {
      const formalLedger = LedgerPersistence.loadLedger(targetStage);
      const rec = formalLedger.find((r) => 
        r.match_id === settledUniverse!.match_id || 
        r.record_id === archiveIdOrCanonicalId ||
        r.match_id === archiveIdOrCanonicalId ||
        (r.teams?.home === settledUniverse!.teams.home && r.teams?.away === settledUniverse!.teams.away)
      );

      if (rec && !rec.settlement?.is_settled) {
        const rawLine = rec.prediction_snapshot?.line || rec.leg?.selected_line || 0;
        const numericLine = parseAsianLine(rawLine);
        const numericOdds = Number(rec.prediction_snapshot?.odds || rec.leg?.current_odds || 1.95);

        let recScore = { home: 0, away: 0 };
        if (rec.prediction_snapshot?.score_at_recommendation) {
          const parts = rec.prediction_snapshot.score_at_recommendation.split(/[-:]/);
          if (parts.length >= 2) {
            recScore = { home: parseInt(parts[0], 10) || 0, away: parseInt(parts[1], 10) || 0 };
          }
        }

        const isAh = rec.prediction_snapshot?.market?.toUpperCase().includes("HANDICAP") || rec.prediction_snapshot?.market?.toUpperCase().includes("SPREAD");
        const settlementRes = evaluateQuarterSettlement({
          market_category: isAh ? "SPREAD_HOME" : "TOTAL_OVER",
          line: numericLine,
          odds: numericOdds,
          is_live: targetStage === "LIVE",
          basis: (rec.leg?.basis as any) || (targetStage === "LIVE" ? "REMAINING_GOALS" : "FULL_MATCH"),
          score_at_rec: recScore,
          final_score: validFinalScore,
          score_verified: true,
        });

        const now = new Date().toISOString();
        rec.settlement = {
          is_settled: true,
          settled_at: now,
          outcome: settlementRes.outcome as any,
          final_score_verified: `${finHome}-${finAway}`,
          final_score_source: source,
          final_score_verified_at: now,
          profit_loss: settlementRes.net_profit_unit,
        };

        if (!rec.leg?.basis || !["FULL_MATCH", "REMAINING_GOALS", "REMAINING_PERIOD_DOMINANCE"].includes(rec.leg.basis)) {
          rec.leg.basis = targetStage === "LIVE" ? "REMAINING_GOALS" : "FULL_MATCH";
        }

        const filePath = path.join(
          process.cwd(),
          "refactor",
          "runtime",
          targetStage === "LIVE" ? "formal_ledger_live.json" : "formal_ledger_prematch.json"
        );
        fs.writeFileSync(filePath, JSON.stringify(formalLedger, null, 2), "utf8");

        const { records: converted } = convertFormalLedgerRecords([rec]);
        if (converted.length > 0) {
          ingestSettledRecordsAndPersist(converted);
        }
      }
    } catch (formalErr) {
      console.warn("[MatchArchiveStore] Formal ledger settle error:", formalErr);
    }

    return mapUniverseToArchivedRecord(settledUniverse);
  }

  /**
   * 雷速完场自动核销与赛后反思梳理
   */
  public static settleWithLeisuFinished(payload: any): {
    settled_count: number;
    settled_matches: Array<{ archive_id: string; match_name: string; score: string }>;
    ledger_settled_count: number;
    oos_samples_count: number;
  } {
    const rawMatches = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.results) ? payload.results : []);

    if (rawMatches.length === 0) {
      return { settled_count: 0, settled_matches: [], ledger_settled_count: 0, oos_samples_count: 0 };
    }

    const leisuFinishedList = rawMatches.map((m: any) => ({
      home_team: m.home_team_name || m.home_team || m.home || "",
      away_team: m.away_team_name || m.away_team || m.away || "",
      score: m.score || (m.home_score != null && m.away_score != null ? { home: Number(m.home_score), away: Number(m.away_score) } : null),
    })).filter((m: any) => m.score && typeof m.score.home === "number" && typeof m.score.away === "number");

    // 1. 全量归因与反思核销
    const uniRes = UniverseLedgerPersistence.settleWithLeisuFinished(leisuFinishedList);

    // 2. 联动正式推荐台账并沉淀真实 OOS
    let ledgerSettled = 0;
    let oosCount = 0;
    const now = new Date().toISOString();

    for (const stage of ["LIVE", "PREMATCH"] as const) {
      const formalLedger = LedgerPersistence.loadLedger(stage);
      let changed = false;

      for (const rec of formalLedger) {
        if (rec.settlement?.is_settled) continue;

        const matchedLeisu = leisuFinishedList.find((m: any) => {
          const homeSim = calculateStrictRawTextSimilarity(m.home_team, rec.teams.home);
          const awaySim = calculateStrictRawTextSimilarity(m.away_team, rec.teams.away);
          return homeSim >= 0.70 && awaySim >= 0.70;
        });

        if (matchedLeisu && matchedLeisu.score) {
          const finScore = matchedLeisu.score;
          const rawLine = rec.prediction_snapshot?.line || rec.leg?.selected_line || 0;
          const numericLine = parseAsianLine(rawLine);
          const numericOdds = Number(rec.prediction_snapshot?.odds || rec.leg?.current_odds || 1.95);

          let recScore = { home: 0, away: 0 };
          if (rec.prediction_snapshot?.score_at_recommendation) {
            const parts = rec.prediction_snapshot.score_at_recommendation.split(/[-:]/);
            if (parts.length >= 2) {
              recScore = { home: parseInt(parts[0], 10) || 0, away: parseInt(parts[1], 10) || 0 };
            }
          }

          const isAh = rec.prediction_snapshot?.market?.toUpperCase().includes("HANDICAP") || rec.prediction_snapshot?.market?.toUpperCase().includes("SPREAD");
          const settlementRes = evaluateQuarterSettlement({
            market_category: isAh ? "SPREAD_HOME" : "TOTAL_OVER",
            line: numericLine,
            odds: numericOdds,
            is_live: stage === "LIVE",
            basis: (rec.leg?.basis as any) || (stage === "LIVE" ? "REMAINING_GOALS" : "FULL_MATCH"),
            score_at_rec: recScore,
            final_score: finScore,
            score_verified: true,
          });

          rec.settlement = {
            is_settled: true,
            settled_at: now,
            outcome: settlementRes.outcome as any,
            final_score_verified: `${finScore.home}-${finScore.away}`,
            final_score_source: "雷速完场交叉核销",
            final_score_verified_at: now,
            profit_loss: settlementRes.net_profit_unit,
          };

          if (!rec.leg?.basis || !["FULL_MATCH", "REMAINING_GOALS", "REMAINING_PERIOD_DOMINANCE"].includes(rec.leg.basis)) {
            rec.leg.basis = stage === "LIVE" ? "REMAINING_GOALS" : "FULL_MATCH";
          }

          changed = true;
          ledgerSettled++;

          const { records: converted } = convertFormalLedgerRecords([rec]);
          if (converted.length > 0) {
            const res = ingestSettledRecordsAndPersist(converted);
            if (res.accepted_count > 0) oosCount++;
          }
        }
      }

      if (changed) {
        const filePath = path.join(
          process.cwd(),
          "refactor",
          "runtime",
          stage === "LIVE" ? "formal_ledger_live.json" : "formal_ledger_prematch.json"
        );
        fs.writeFileSync(filePath, JSON.stringify(formalLedger, null, 2), "utf8");
      }
    }

    return {
      settled_count: uniRes.settled_count,
      settled_matches: [],
      ledger_settled_count: ledgerSettled,
      oos_samples_count: oosCount,
    };
  }
}

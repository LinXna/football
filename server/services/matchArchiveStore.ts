import fs from "fs";
import path from "path";
import { CanonicalMatch, AiEvaluationBrief } from "../../refactor/02_canonical_model/types.js";
import { QuantitativeFeatures } from "../../refactor/03_quant_engine/types.js";
import { parseLeisuInterfaceExport } from "../../refactor/01_data_ingestion/leisu/leisuInterfaceExtractor";
import { calculateStrictRawTextSimilarity } from "../../refactor/02_canonical_model/matchAligner";
import { LedgerPersistence } from "../../refactor/05_portfolio_risk/ledgerPersistence";
import { evaluateQuarterSettlement, parseAsianLine } from "../../refactor/06_settlement_audit/settlementEngine.js";
import { convertFormalLedgerRecords } from "../../refactor/06_settlement_audit/formalLedgerAdapter.js";
import { toOosSample } from "../../refactor/06_settlement_audit/historicalBacktestIngestion.js";
import { appendSampleAndRebuildArchive } from "./oosArchiveService";

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

const PRIMARY_ARCHIVE_PATH = path.resolve(process.cwd(), "output/refactor_match_archive.json");
const BACKUP_ARCHIVE_PATH = path.resolve(process.cwd(), "refactor/runtime/match_archive_store.json");

export class MatchArchiveStore {
  /**
   * 加载档案数据
   */
  public static loadArchive(): ArchivedMatchRecord[] {
    try {
      if (fs.existsSync(PRIMARY_ARCHIVE_PATH)) {
        const raw = fs.readFileSync(PRIMARY_ARCHIVE_PATH, "utf-8");
        return JSON.parse(raw);
      }
      if (fs.existsSync(BACKUP_ARCHIVE_PATH)) {
        const raw = fs.readFileSync(BACKUP_ARCHIVE_PATH, "utf-8");
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn("[MatchArchiveStore] Load archive error:", err);
    }
    return [];
  }

  /**
   * 原子持久化归档数据 (Temp Write + Parse Check + Safe Rename)
   */
  public static saveArchive(records: ArchivedMatchRecord[]): boolean {
    try {
      const dataStr = JSON.stringify(records, null, 2);
      const tempPath = `${PRIMARY_ARCHIVE_PATH}.${process.pid}.${Date.now()}.tmp`;
      
      fs.mkdirSync(path.dirname(PRIMARY_ARCHIVE_PATH), { recursive: true });
      fs.writeFileSync(tempPath, dataStr, "utf-8");

      // 验证写入文件有效性
      JSON.parse(fs.readFileSync(tempPath, "utf-8"));

      // 备份现有旧文件
      if (fs.existsSync(PRIMARY_ARCHIVE_PATH)) {
        fs.mkdirSync(path.dirname(BACKUP_ARCHIVE_PATH), { recursive: true });
        fs.copyFileSync(PRIMARY_ARCHIVE_PATH, BACKUP_ARCHIVE_PATH);
      }

      // 原子重命名
      fs.renameSync(tempPath, PRIMARY_ARCHIVE_PATH);
      return true;
    } catch (err) {
      console.error("[MatchArchiveStore] Save archive error:", err);
      return false;
    }
  }

  /**
   * 自动将当前批次计算的赛事与特征建立档案 (Idempotent upsert)
   */
  public static archiveCanonicalMatches(
    matches: CanonicalMatch[],
    quantFeaturesMap: Record<string, QuantitativeFeatures>,
    mode: "live" | "prematch"
  ): number {
    if (!matches || matches.length === 0) return 0;
    const existing = this.loadArchive();
    const existingMap = new Map<string, ArchivedMatchRecord>();
    for (const rec of existing) {
      existingMap.set(rec.archive_id, rec);
    }

    let newlyArchived = 0;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    for (const match of matches) {
      const quant = quantFeaturesMap[match.canonical_id];
      // 仅对具备有效量化计算结果的赛事进行建档分析
      if (!quant) continue;

      const slug = match.match_slug || `${match.league_name}_${match.home_team_name}_vs_${match.away_team_name}`;
      const cleanSlug = slug.replace(/[^\w\u4e00-\u9fa5]/g, "_");
      const startTimeStr = match.timing?.beijing_start_time || "";
      const archiveId = `arc_${cleanSlug}_${startTimeStr.slice(0, 10) || today}`;

      // 提取市场盘口
      const mk = match.markets;
      const ahLine = mk?.full_spread_main?.home_selection ? parseAsianLine(mk.full_spread_main.home_selection) : null;
      const ahHomeOdds = mk?.full_spread_main?.home_odds != null ? Number(mk.full_spread_main.home_odds) : null;
      const ahAwayOdds = mk?.full_spread_main?.away_odds != null ? Number(mk.full_spread_main.away_odds) : null;
      const ouLine = mk?.full_total_main?.line != null ? Number(mk.full_total_main.line) : null;
      const ouOverOdds = mk?.full_total_main?.over_odds != null ? Number(mk.full_total_main.over_odds) : null;
      const ouUnderOdds = mk?.full_total_main?.under_odds != null ? Number(mk.full_total_main.under_odds) : null;

      // 提取比分
      const scoreObj = (match.score.home_score != null && match.score.away_score != null)
        ? { home: match.score.home_score, away: match.score.away_score }
        : null;

      // 提取 top 预测比分
      const topScores = (quant.poisson?.top_final_scores || []).map((s) => ({
        score: `${s.home}-${s.away}`,
        probability: Number(s.probability.toFixed(4)),
      }));

      const candidateState = (quant as any).candidate_pipeline?.state || "INITIAL_ASSESSMENT";

      const topFirst = quant.poisson?.top_final_scores?.[0];
      const projectedScore = topFirst ? `${topFirst.home}-${topFirst.away}` : "0-0";

      const calculationSnapshot = {
        minute_or_status: match.timing.ybty_display_clock || (match.timing.stage === "LIVE" ? `${match.timing.minute || 0}'` : "PREMATCH"),
        score_at_calculation: scoreObj,
        score_verified: match.score.score_verified,
        markets: {
          ah_line: ahLine,
          ah_home_odds: ahHomeOdds,
          ah_away_odds: ahAwayOdds,
          ou_line: ouLine,
          ou_over_odds: ouOverOdds,
          ou_under_odds: ouUnderOdds,
          h2h_home: mk?.full_h2h?.home_odds != null ? Number(mk.full_h2h.home_odds) : null,
          h2h_draw: mk?.full_h2h?.draw_odds != null ? Number(mk.full_h2h.draw_odds) : null,
          h2h_away: mk?.full_h2h?.away_odds != null ? Number(mk.full_h2h.away_odds) : null,
        },
        quant: {
          lambda_home: Number((quant.poisson?.lambda_home_rest || 0).toFixed(4)),
          lambda_away: Number((quant.poisson?.lambda_away_rest || 0).toFixed(4)),
          forward_goals_expected: Number((quant.poisson?.expected_goals_rest || 0).toFixed(4)),
          projected_final_score: projectedScore,
          top_scores: topScores,
          bdi: Number((quant.battlefield_dominance_index || 0).toFixed(2)),
          candidate_pipeline_state: candidateState,
        },
      };

      const existingRecord = existingMap.get(archiveId);
      if (existingRecord) {
        // 如果未结算，更新最新的计算快照
        if (existingRecord.settlement_status === "PENDING") {
          existingRecord.calculation_snapshot = calculationSnapshot;
          existingRecord.updated_at = now;
        }
      } else {
        const newRecord: ArchivedMatchRecord = {
          archive_id: archiveId,
          canonical_id: match.canonical_id,
          match_slug: slug,
          mode,
          stage: match.timing.stage === "LIVE" ? "LIVE" : "PREMATCH",
          created_at: now,
          updated_at: now,
          league_name: match.league_name,
          home_team_name: match.home_team_name,
          away_team_name: match.away_team_name,
          commence_time: match.timing.beijing_start_time || null,
          calculation_snapshot: calculationSnapshot,
          settlement_status: "PENDING",
          finished_score: null,
          finished_score_source: null,
          settled_at: null,
          reflection: null,
        };
        existingMap.set(archiveId, newRecord);
        newlyArchived++;
      }
    }

    const updatedList = Array.from(existingMap.values());
    this.saveArchive(updatedList);
    console.log(`[MatchArchiveStore] Archived ${newlyArchived} new matches, total ${updatedList.length} in archive.`);
    return newlyArchived;
  }

  /**
   * 利用雷速完场数据自动进行批量核销与赛后反思梳理
   */
  public static settleWithLeisuFinished(leisuPayload: any): {
    settled_count: number;
    settled_matches: Array<{ archive_id: string; match_name: string; score: string }>;
    ledger_settled_count: number;
    oos_samples_count: number;
  } {
    let parsedFinishedMatches: any[] = [];
    try {
      const parsed = parseLeisuInterfaceExport(leisuPayload);
      // 提取雷速接口中 status_id === 8 (完场) 的赛事
      parsedFinishedMatches = parsed.matches.filter((m) => {
        return m.status_id === 8 || m.status_text === "完场" || (m.score?.home != null && m.score?.away != null && !m.is_live);
      });
    } catch (e) {
      console.error("[MatchArchiveStore] Parse Leisu payload failed:", e);
      return { settled_count: 0, settled_matches: [], ledger_settled_count: 0, oos_samples_count: 0 };
    }

    if (parsedFinishedMatches.length === 0) {
      return { settled_count: 0, settled_matches: [], ledger_settled_count: 0, oos_samples_count: 0 };
    }

    const archive = this.loadArchive();
    let settledCount = 0;
    const settledMatches: Array<{ archive_id: string; match_name: string; score: string }> = [];
    const now = new Date().toISOString();

    for (const record of archive) {
      if (record.settlement_status === "SETTLED") continue;

      // 在完场雷速赛事中寻找匹配
      let bestMatch: any = null;
      let highestSim = 0;

      for (const leisuM of parsedFinishedMatches) {
        const homeSim = calculateStrictRawTextSimilarity(record.home_team_name, leisuM.home_team);
        const awaySim = calculateStrictRawTextSimilarity(record.away_team_name, leisuM.away_team);
        if (homeSim >= 0.65 && awaySim >= 0.65) {
          const avg = (homeSim + awaySim) / 2;
          if (avg > highestSim) {
            highestSim = avg;
            bestMatch = leisuM;
          }
        }
      }

      if (bestMatch && bestMatch.score?.home != null && bestMatch.score?.away != null) {
        const finHome = bestMatch.score.home;
        const finAway = bestMatch.score.away;
        const totalGoals = finHome + finAway;
        const goalDiff = finHome - finAway;

        // 生成反思指标
        const topScores = record.calculation_snapshot.quant.top_scores.map((s) => s.score);
        const actualScoreStr = `${finHome}-${finAway}`;
        const scoreHit = topScores.includes(actualScoreStr);
        const exactScoreHit = record.calculation_snapshot.quant.projected_final_score === actualScoreStr;

        // 模拟亚盘与大小球结果
        let ahOutcome: "WIN" | "LOSE" | "PUSH" | "HALF_WIN" | "HALF_LOSE" | null = null;
        let ouOutcome: "WIN" | "LOSE" | "PUSH" | "HALF_WIN" | "HALF_LOSE" | null = null;

        const ahLine = record.calculation_snapshot.markets.ah_line;
        if (ahLine != null) {
          const evalRes = evaluateQuarterSettlement({
            market_category: "SPREAD_HOME",
            line: ahLine,
            odds: 1.95,
            is_live: record.stage === "LIVE",
            basis: record.stage === "LIVE" ? "REMAINING_GOALS" : "FULL_MATCH",
            score_at_rec: record.calculation_snapshot.score_at_calculation || { home: 0, away: 0 },
            final_score: { home: finHome, away: finAway },
            score_verified: true,
          });
          ahOutcome = evalRes.outcome as any;
        }

        const ouLine = record.calculation_snapshot.markets.ou_line;
        if (ouLine != null) {
          const evalRes = evaluateQuarterSettlement({
            market_category: "TOTAL_OVER",
            line: ouLine,
            odds: 1.95,
            is_live: record.stage === "LIVE",
            basis: record.stage === "LIVE" ? "REMAINING_GOALS" : "FULL_MATCH",
            score_at_rec: record.calculation_snapshot.score_at_calculation || { home: 0, away: 0 },
            final_score: { home: finHome, away: finAway },
            score_verified: true,
          });
          ouOutcome = evalRes.outcome as any;
        }

        // 组织反思评语
        const diagnosticParts: string[] = [];
        if (exactScoreHit) {
          diagnosticParts.push(`🎯 极高精度：实际赛果 ${actualScoreStr} 完全命中模型最高概率预测！`);
        } else if (scoreHit) {
          diagnosticParts.push(`✅ 命中预期：实际赛果 ${actualScoreStr} 落入模型 Top 3 预测分布。`);
        } else {
          diagnosticParts.push(`⚠️ 偏差反思：实际赛果 ${actualScoreStr} 未进入前三预测概率区 (模型首选 ${record.calculation_snapshot.quant.projected_final_score})。`);
        }

        const expGoals = record.calculation_snapshot.quant.forward_goals_expected;
        if (record.stage === "PREMATCH") {
          const dev = totalGoals - (record.calculation_snapshot.quant.lambda_home + record.calculation_snapshot.quant.lambda_away);
          diagnosticParts.push(`总进球数 ${totalGoals} 个（模型泊松期望总和 ${(record.calculation_snapshot.quant.lambda_home + record.calculation_snapshot.quant.lambda_away).toFixed(2)}，离差 ${dev > 0 ? "+" : ""}${dev.toFixed(2)}）。`);
        } else {
          diagnosticParts.push(`下半时/后续产生 ${totalGoals - ((record.calculation_snapshot.score_at_calculation?.home || 0) + (record.calculation_snapshot.score_at_calculation?.away || 0))} 个新增进球（模型前瞻期望: ${expGoals.toFixed(2)}）。`);
        }

        if (ahOutcome) diagnosticParts.push(`主让球盘核销: [${ahOutcome}]。`);
        if (ouOutcome) diagnosticParts.push(`大小球盘核销: [${ouOutcome}]。`);

        record.settlement_status = "SETTLED";
        record.finished_score = { home: finHome, away: finAway };
        record.finished_score_source = "雷速完场接口";
        record.settled_at = now;
        record.updated_at = now;
        record.reflection = {
          actual_total_goals: totalGoals,
          goal_diff_actual: goalDiff,
          score_hit: scoreHit,
          exact_score_hit: exactScoreHit,
          ah_outcome: ahOutcome,
          ou_outcome: ouOutcome,
          diagnostic_notes: diagnosticParts.join(" "),
        };

        settledCount++;
        settledMatches.push({
          archive_id: record.archive_id,
          match_name: `${record.home_team_name} vs ${record.away_team_name}`,
          score: actualScoreStr,
        });
      }
    }

    if (settledCount > 0) {
      this.saveArchive(archive);
    }

    // 核心联动：自动扫描正式推荐台账中待核销的记录并同步结算
    let ledgerSettledCount = 0;
    let oosSamplesCount = 0;

    for (const stage of ["LIVE", "PREMATCH"] as const) {
      const ledger = LedgerPersistence.loadLedger(stage);
      let ledgerChanged = false;

      for (const rec of ledger) {
        if (rec.settlement && rec.settlement.is_settled) continue;

        // 匹配已完场的归档赛事
        const matchInArchive = archive.find((a) => {
          if (a.settlement_status !== "SETTLED" || !a.finished_score) return false;
          const homeSim = calculateStrictRawTextSimilarity(a.home_team_name, rec.teams.home);
          const awaySim = calculateStrictRawTextSimilarity(a.away_team_name, rec.teams.away);
          return homeSim >= 0.70 && awaySim >= 0.70;
        });

        if (matchInArchive && matchInArchive.finished_score) {
          const finScore = matchInArchive.finished_score;
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

          const settlementRes = evaluateQuarterSettlement({
            market_category: (rec.prediction_snapshot?.market?.toUpperCase().includes("HANDICAP") || rec.prediction_snapshot?.market?.toUpperCase().includes("SPREAD")) ? "SPREAD_HOME" : "TOTAL_OVER",
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

          ledgerChanged = true;
          ledgerSettledCount++;

          // 尝试转换为真实 OOS 样本写入校准库
          const { records: converted } = convertFormalLedgerRecords([rec]);
          if (converted.length > 0) {
            const oosSample = toOosSample(converted[0]);
            const res = appendSampleAndRebuildArchive(oosSample);
            if (res.success) {
              oosSamplesCount++;
            }
          }
        }
      }

      if (ledgerChanged) {
        const filePath = path.join(
          process.cwd(),
          "refactor",
          "runtime",
          stage === "LIVE" ? "formal_ledger_live.json" : "formal_ledger_prematch.json"
        );
        fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2), "utf8");
      }
    }

    return {
      settled_count: settledCount,
      settled_matches: settledMatches,
      ledger_settled_count: ledgerSettledCount,
      oos_samples_count: oosSamplesCount,
    };
  }

  /**
   * 单场手动核销与赛后反思梳理
   */
  public static settleSingle(
    archiveId: string,
    finalScore: { home: number; away: number },
    source = "人工核实录入"
  ): ArchivedMatchRecord | null {
    const archive = this.loadArchive();
    const target = archive.find((r) => r.archive_id === archiveId);
    if (!target) return null;

    const now = new Date().toISOString();
    const finHome = Number(finalScore.home);
    const finAway = Number(finalScore.away);
    const totalGoals = finHome + finAway;
    const goalDiff = finHome - finAway;
    const actualScoreStr = `${finHome}-${finAway}`;

    const topScores = target.calculation_snapshot.quant.top_scores.map((s) => s.score);
    const scoreHit = topScores.includes(actualScoreStr);
    const exactScoreHit = target.calculation_snapshot.quant.projected_final_score === actualScoreStr;

    let ahOutcome: "WIN" | "LOSE" | "PUSH" | "HALF_WIN" | "HALF_LOSE" | null = null;
    let ouOutcome: "WIN" | "LOSE" | "PUSH" | "HALF_WIN" | "HALF_LOSE" | null = null;

    const ahLine = target.calculation_snapshot.markets.ah_line;
    if (ahLine != null) {
      const evalRes = evaluateQuarterSettlement({
        market_category: "SPREAD_HOME",
        line: ahLine,
        odds: 1.95,
        is_live: target.stage === "LIVE",
        basis: target.stage === "LIVE" ? "REMAINING_GOALS" : "FULL_MATCH",
        score_at_rec: target.calculation_snapshot.score_at_calculation || { home: 0, away: 0 },
        final_score: { home: finHome, away: finAway },
        score_verified: true,
      });
      ahOutcome = evalRes.outcome as any;
    }

    const ouLine = target.calculation_snapshot.markets.ou_line;
    if (ouLine != null) {
      const evalRes = evaluateQuarterSettlement({
        market_category: "TOTAL_OVER",
        line: ouLine,
        odds: 1.95,
        is_live: target.stage === "LIVE",
        basis: target.stage === "LIVE" ? "REMAINING_GOALS" : "FULL_MATCH",
        score_at_rec: target.calculation_snapshot.score_at_calculation || { home: 0, away: 0 },
        final_score: { home: finHome, away: finAway },
        score_verified: true,
      });
      ouOutcome = evalRes.outcome as any;
    }

    const diagnosticParts: string[] = [];
    if (exactScoreHit) {
      diagnosticParts.push(`🎯 极高精度：实际赛果 ${actualScoreStr} 完全命中模型最高概率预测！`);
    } else if (scoreHit) {
      diagnosticParts.push(`✅ 命中预期：实际赛果 ${actualScoreStr} 落入模型 Top 3 预测分布。`);
    } else {
      diagnosticParts.push(`⚠️ 偏差反思：实际赛果 ${actualScoreStr} 未进入前三预测概率区 (模型首选 ${target.calculation_snapshot.quant.projected_final_score})。`);
    }

    target.settlement_status = "SETTLED";
    target.finished_score = { home: finHome, away: finAway };
    target.finished_score_source = source;
    target.settled_at = now;
    target.updated_at = now;
    target.reflection = {
      actual_total_goals: totalGoals,
      goal_diff_actual: goalDiff,
      score_hit: scoreHit,
      exact_score_hit: exactScoreHit,
      ah_outcome: ahOutcome,
      ou_outcome: ouOutcome,
      diagnostic_notes: diagnosticParts.join(" "),
    };

    this.saveArchive(archive);
    return target;
  }
}

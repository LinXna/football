import fs from 'fs';
import path from 'path';
import { CanonicalMatch } from '../02_canonical_model/types.js';
import { QuantitativeFeatures } from '../03_quant_engine/types.js';
import { BettingStage, UniverseAuditRecord, GateCategory, AttributionVerdict } from './types.js';
import { evaluateQuarterSettlement, parseAsianLine, QuarterMarketCategory } from '../06_settlement_audit/settlementEngine.js';
import { calculateStrictRawTextSimilarity } from '../02_canonical_model/matchAligner.js';

const RUNTIME_DIR = path.resolve(process.cwd(), 'refactor/runtime');

function getFilePath(stage: BettingStage): string {
  return path.join(
    RUNTIME_DIR,
    stage === 'LIVE' ? 'universe_audit_ledger_live.json' : 'universe_audit_ledger_prematch.json'
  );
}

function atomicWriteJsonSync(targetPath: string, data: unknown): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, targetPath);
}

export class UniverseLedgerPersistence {
  public static loadLedger(stage: BettingStage): UniverseAuditRecord[] {
    const filePath = getFilePath(stage);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn(`[UniverseLedgerPersistence] Failed to read ${filePath}:`, err);
      return [];
    }
  }

  public static saveLedger(stage: BettingStage, records: UniverseAuditRecord[]): void {
    const filePath = getFilePath(stage);
    atomicWriteJsonSync(filePath, records);
  }

  /**
   * 从 Layer 02 规范化赛事、Layer 03 量化特征及可选的 Layer 04 AI 评估，
   * 全量自动构建/增量更新轨道二全量归因记录（Idempotent Upsert）。
   */
  public static autoIngestFromCanonicalBatch(
    stage: BettingStage,
    matches: CanonicalMatch[],
    quantMap: Record<string, QuantitativeFeatures>,
    aiEvals: any[] = []
  ): { added: number; updated: number; total: number } {
    if (!matches || matches.length === 0) {
      return { added: 0, updated: 0, total: 0 };
    }

    const currentRecords = this.loadLedger(stage);
    const recordMap = new Map<string, UniverseAuditRecord>();
    for (const rec of currentRecords) {
      recordMap.set(rec.match_id, rec);
    }

    let added = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const match of matches) {
      const quant = quantMap[match.canonical_id];
      if (!quant) continue; // 仅对具备量化特征的赛事建档

      // 检索该比赛是否有对应的 AI 评估
      const aiEval = this.matchAiEvaluation(match, aiEvals);

      // 计算门禁归因分类
      const { gateCategory, gateDescription, aiGrade, aiConfidence, aiSummary } = this.deriveGateAttribution(quant, aiEval);

      // 提取盘口快照
      const mk = match.markets;
      const ahLine = mk?.full_spread_main?.home_selection ? parseAsianLine(mk.full_spread_main.home_selection) : null;
      const ouLine = mk?.full_total_main?.line != null ? Number(mk.full_total_main.line) : null;

      // 提取首选预测盘口与方向
      const predictedDirection = this.derivePredictedDirection(quant, ahLine, ouLine);

      const topFirst = quant.poisson?.top_final_scores?.[0];
      const projectedScore = topFirst ? `${topFirst.home}-${topFirst.away}` : '0-0';
      const topScores = (quant.poisson?.top_final_scores || []).map(s => ({
        score: `${s.home}-${s.away}`,
        probability: Number(s.probability.toFixed(4)),
      }));
      const marketsSnapshot = {
        ah_home_odds: mk?.full_spread_main?.home_odds != null ? Number(mk.full_spread_main.home_odds) : null,
        ah_away_odds: mk?.full_spread_main?.away_odds != null ? Number(mk.full_spread_main.away_odds) : null,
        ou_over_odds: mk?.full_total_main?.over_odds != null ? Number(mk.full_total_main.over_odds) : null,
        ou_under_odds: mk?.full_total_main?.under_odds != null ? Number(mk.full_total_main.under_odds) : null,
        h2h_home: mk?.full_h2h?.home_odds != null ? Number(mk.full_h2h.home_odds) : null,
        h2h_draw: mk?.full_h2h?.draw_odds != null ? Number(mk.full_h2h.draw_odds) : null,
        h2h_away: mk?.full_h2h?.away_odds != null ? Number(mk.full_h2h.away_odds) : null,
      };
      const minuteStatus = match.timing.ybty_display_clock || (stage === 'LIVE' ? `${match.timing.minute || 0}'` : 'PREMATCH');

      const existing = recordMap.get(match.canonical_id);

      if (existing) {
        // 如果未结算，更新最新盘口与量化快照
        if (!existing.settlement?.is_settled) {
          existing.minute_or_status = minuteStatus;
          existing.gate_category = gateCategory;
          existing.gate_reason_description = gateDescription;
          if (aiGrade) existing.ai_grade = aiGrade;
          if (aiConfidence != null) existing.ai_confidence = aiConfidence;
          if (aiSummary) existing.ai_summary = aiSummary;
          existing.quant_snapshot = {
            lambda_home: Number((quant.poisson?.lambda_home_rest || 0).toFixed(4)),
            lambda_away: Number((quant.poisson?.lambda_away_rest || 0).toFixed(4)),
            forward_goals_expected: Number((quant.poisson?.expected_goals_rest || 0).toFixed(4)),
            projected_final_score: projectedScore,
            top_scores: topScores,
            bdi: Number((quant.battlefield_dominance_index || 0).toFixed(2)),
            ah_line: ahLine,
            ou_line: ouLine,
            markets: marketsSnapshot,
            ev_direction: quant.positive_ev_signals?.[0]?.market || null,
            ev_value: quant.positive_ev_signals?.[0]?.expected_value_percent || null,
            candidate_pipeline_state: quant.candidate_pipeline?.state || 'INITIAL_ASSESSMENT',
          };
          if (predictedDirection) existing.predicted_direction = predictedDirection;
          updated++;
        }
      } else {
        const newRecord: UniverseAuditRecord = {
          record_id: `uni_${stage.toLowerCase()}_${match.canonical_id}_${Date.now()}`,
          stage,
          created_at_utc: now,
          match_id: match.canonical_id,
          kickoff_time: match.timing.beijing_start_time || now,
          league_key: match.league_name || 'UNKNOWN',
          teams: { home: match.home_team_name, away: match.away_team_name },
          minute_or_status: minuteStatus,
          score_at_prediction: {
            home: match.score.home_score ?? 0,
            away: match.score.away_score ?? 0,
          },
          score_verified: match.score.score_verified === true,
          gate_category: gateCategory,
          gate_reason_description: gateDescription,
          ai_grade: aiGrade,
          ai_confidence: aiConfidence,
          ai_summary: aiSummary,
          quant_snapshot: {
            lambda_home: Number((quant.poisson?.lambda_home_rest || 0).toFixed(4)),
            lambda_away: Number((quant.poisson?.lambda_away_rest || 0).toFixed(4)),
            forward_goals_expected: Number((quant.poisson?.expected_goals_rest || 0).toFixed(4)),
            projected_final_score: projectedScore,
            top_scores: topScores,
            bdi: Number((quant.battlefield_dominance_index || 0).toFixed(2)),
            ah_line: ahLine,
            ou_line: ouLine,
            markets: marketsSnapshot,
            ev_direction: quant.positive_ev_signals?.[0]?.market || null,
            ev_value: quant.positive_ev_signals?.[0]?.expected_value_percent || null,
            candidate_pipeline_state: quant.candidate_pipeline?.state || 'INITIAL_ASSESSMENT',
          },
          predicted_direction: predictedDirection,
          settlement: {
            is_settled: false,
            outcome: 'PENDING',
          },
        };
        recordMap.set(match.canonical_id, newRecord);
        added++;
      }
    }

    const nextList = Array.from(recordMap.values());
    this.saveLedger(stage, nextList);
    return { added, updated, total: nextList.length };
  }

  /**
   * 单场核销轨道二全量归因记录，并计算【避坑成功 / 模型误杀】归因指标
   */
  public static settleSingleRecord(
    stage: BettingStage,
    matchIdOrRecordId: string,
    finalScore: { home: number; away: number },
    source = '人工录入核销'
  ): UniverseAuditRecord | null {
    const list = this.loadLedger(stage);
    const target = list.find(r => r.record_id === matchIdOrRecordId || r.match_id === matchIdOrRecordId);
    if (!target) return null;

    const finHome = Number(finalScore.home);
    const finAway = Number(finalScore.away);
    const now = new Date().toISOString();

    let outcome: 'WIN' | 'WIN_HALF' | 'PUSH' | 'LOSE_HALF' | 'LOSE' | 'INVALID_DATA' | 'PENDING' = 'PENDING';
    let profitLoss = 0;
    let explanation = '';

    if (target.predicted_direction) {
      const dir = target.predicted_direction;
      const isAh = dir.market.includes('HANDICAP') || dir.market.includes('SPREAD');
      const category: QuarterMarketCategory = isAh
        ? (dir.selection.includes('HOME') || dir.selection.includes('主') ? 'SPREAD_HOME' : 'SPREAD_AWAY')
        : (dir.selection.includes('OVER') || dir.selection.includes('大') ? 'TOTAL_OVER' : 'TOTAL_UNDER');

      const evalRes = evaluateQuarterSettlement({
        market_category: category,
        line: dir.line,
        odds: dir.odds,
        is_live: stage === 'LIVE',
        basis: stage === 'LIVE' ? 'REMAINING_GOALS' : 'FULL_MATCH',
        score_at_rec: target.score_at_prediction,
        final_score: { home: finHome, away: finAway },
        score_verified: true,
      });

      outcome = evalRes.outcome as any;
      profitLoss = evalRes.net_profit_unit;
      explanation = evalRes.explanation;
    } else {
      // 若无盘口方向，用 projected_final_score 对照
      const actualScoreStr = `${finHome}-${finAway}`;
      const exactHit = target.quant_snapshot.projected_final_score === actualScoreStr;
      outcome = exactHit ? 'WIN' : 'LOSE';
      explanation = exactHit ? `精确命中最高概率预测比分 ${actualScoreStr}` : `实际比分 ${actualScoreStr} (预测比分 ${target.quant_snapshot.projected_final_score})`;
    }

    // 拦截归因核心判定：
    // 若原门禁为拦截态（非 QUALIFIED_FORMAL）：
    //   - 实际赛果 LOSE/LOSE_HALF: 成功避坑 (True Negative)
    //   - 实际赛果 WIN/WIN_HALF: 模型误杀 (False Negative)
    let verdict: AttributionVerdict = 'PENDING';
    let isGateCorrect = false;
    let isFalseNegative = false;
    let notes = '';

    if (target.gate_category === 'QUALIFIED_FORMAL') {
      if (outcome === 'WIN' || outcome === 'WIN_HALF') {
        verdict = 'FORMAL_WIN';
        notes = '✅ 实盘推荐命中：A/B 级可投注方向打出';
      } else if (outcome === 'LOSE' || outcome === 'LOSE_HALF') {
        verdict = 'FORMAL_LOSE';
        notes = '❌ 实盘推荐亏损：A/B 级推荐未打出';
      } else {
        verdict = 'PUSH';
        notes = '⚪ 实盘推荐走盘退款';
      }
    } else {
      if (outcome === 'LOSE' || outcome === 'LOSE_HALF') {
        verdict = 'SUCCESSFUL_AVOIDANCE';
        isGateCorrect = true;
        notes = `🛡️ 避坑成功：门禁【${target.gate_category}】拦截正确，该被拦截比赛实际未打出 (${explanation})`;
      } else if (outcome === 'WIN' || outcome === 'WIN_HALF') {
        verdict = 'MODEL_FALSE_NEGATIVE';
        isFalseNegative = true;
        notes = `⚠️ 模型误杀：门禁【${target.gate_category}】拦截过于保守，该比赛实际打出 (${explanation})`;
      } else {
        verdict = 'PUSH';
        notes = '⚪ 走盘退款';
      }
    }

    // ----------------------------------------------------
    // 模型比分预测与盘口精度赛后反思梳理 (Reflection)
    // ----------------------------------------------------
    const totalGoals = finHome + finAway;
    const goalDiff = finHome - finAway;
    const actualScoreStr = `${finHome}-${finAway}`;
    const exactScoreHit = target.quant_snapshot.projected_final_score === actualScoreStr;
    const top3Scores = (target.quant_snapshot.top_scores || []).slice(0, 3).map(s => s.score);
    const scoreHit = exactScoreHit || top3Scores.includes(actualScoreStr);

    let ahOutcome: 'WIN' | 'LOSE' | 'PUSH' | 'HALF_WIN' | 'HALF_LOSE' | null = null;
    let ouOutcome: 'WIN' | 'LOSE' | 'PUSH' | 'HALF_WIN' | 'HALF_LOSE' | null = null;

    if (target.quant_snapshot.ah_line != null) {
      const evalAh = evaluateQuarterSettlement({
        market_category: 'SPREAD_HOME',
        line: target.quant_snapshot.ah_line,
        odds: 1.95,
        is_live: stage === 'LIVE',
        basis: stage === 'LIVE' ? 'REMAINING_GOALS' : 'FULL_MATCH',
        score_at_rec: target.score_at_prediction,
        final_score: { home: finHome, away: finAway },
        score_verified: true,
      });
      ahOutcome = evalAh.outcome as any;
    }
    if (target.quant_snapshot.ou_line != null) {
      const evalOu = evaluateQuarterSettlement({
        market_category: 'TOTAL_OVER',
        line: target.quant_snapshot.ou_line,
        odds: 1.95,
        is_live: stage === 'LIVE',
        basis: stage === 'LIVE' ? 'REMAINING_GOALS' : 'FULL_MATCH',
        score_at_rec: target.score_at_prediction,
        final_score: { home: finHome, away: finAway },
        score_verified: true,
      });
      ouOutcome = evalOu.outcome as any;
    }

    const diagnosticParts: string[] = [];
    if (exactScoreHit) {
      diagnosticParts.push(`🎯 极高精度：实际赛果 ${actualScoreStr} 完全命中模型最高概率预测！`);
    } else if (scoreHit) {
      diagnosticParts.push(`✅ 命中预期：实际赛果 ${actualScoreStr} 落入模型 Top 3 预测分布。`);
    } else {
      diagnosticParts.push(`⚠️ 偏差反思：实际赛果 ${actualScoreStr} 未进入前三预测概率区 (模型首选 ${target.quant_snapshot.projected_final_score})。`);
    }

    target.settlement = {
      is_settled: true,
      settled_at: now,
      final_score: { home: finHome, away: finAway },
      final_score_source: source,
      outcome,
      profit_loss: profitLoss,
      explanation,
      attribution: {
        is_gate_correct: isGateCorrect,
        is_false_negative: isFalseNegative,
        verdict_label: verdict,
        notes,
      },
      reflection: {
        actual_total_goals: totalGoals,
        goal_diff_actual: goalDiff,
        score_hit: scoreHit,
        exact_score_hit: exactScoreHit,
        ah_outcome: ahOutcome,
        ou_outcome: ouOutcome,
        diagnostic_notes: diagnosticParts.join(' '),
      },
    };

    this.saveLedger(stage, list);
    return target;
  }

  /**
   * 利用雷速完场数据自动进行全量归因核销
   */
  public static settleWithLeisuFinished(finishedMatches: any[]): {
    settled_count: number;
    avoidance_count: number;
    false_negative_count: number;
  } {
    let totalSettled = 0;
    let totalAvoidance = 0;
    let totalFalseNegative = 0;

    for (const stage of ['LIVE', 'PREMATCH'] as const) {
      const records = this.loadLedger(stage);
      let changed = false;

      for (const rec of records) {
        if (rec.settlement?.is_settled) continue;

        // 在雷速完场比赛中寻找匹配
        const matchedLeisu = finishedMatches.find((m) => {
          const homeSim = calculateStrictRawTextSimilarity(rec.teams.home, m.home_team || m.home);
          const awaySim = calculateStrictRawTextSimilarity(rec.teams.away, m.away_team || m.away);
          return homeSim >= 0.70 && awaySim >= 0.70;
        });

        if (matchedLeisu && matchedLeisu.score?.home != null && matchedLeisu.score?.away != null) {
          this.settleSingleRecord(stage, rec.record_id, {
            home: matchedLeisu.score.home,
            away: matchedLeisu.score.away,
          }, '雷速完场接口自动核销');

          changed = true;
          totalSettled++;
        }
      }
    }

    // 统计总体归因
    const summary = this.getUniverseAttributionSummary('ALL');
    return {
      settled_count: totalSettled,
      avoidance_count: summary.avoidance_count,
      false_negative_count: summary.false_negative_count,
    };
  }

  /**
   * 获取全量归因统计大盘
   */
  public static getUniverseAttributionSummary(stage: BettingStage | 'ALL' = 'ALL') {
    const records: UniverseAuditRecord[] = [];
    if (stage === 'ALL' || stage === 'LIVE') {
      records.push(...this.loadLedger('LIVE'));
    }
    if (stage === 'ALL' || stage === 'PREMATCH') {
      records.push(...this.loadLedger('PREMATCH'));
    }

    const total = records.length;
    const settled = records.filter(r => r.settlement?.is_settled);
    const pending = total - settled.length;

    const formalQualified = records.filter(r => r.gate_category === 'QUALIFIED_FORMAL').length;
    const blockedCGrade = records.filter(r => r.gate_category === 'BLOCKED_BY_AI_C_GRADE').length;
    const blockedWatch = records.filter(r => r.gate_category === 'BLOCKED_BY_AI_WATCH').length;
    const blockedTrap = records.filter(r => r.gate_category === 'BLOCKED_BY_AI_TRAP').length;
    const blockedLowConf = records.filter(r => r.gate_category === 'BLOCKED_BY_LOW_CONF').length;
    const blockedNoEv = records.filter(r => r.gate_category === 'BLOCKED_NO_POSITIVE_EV').length;
    const quantMachineOnly = records.filter(r => r.gate_category === 'QUANT_MACHINE_ONLY').length;

    // 结算归因统计
    const settledAvoidance = settled.filter(r => r.settlement?.attribution?.verdict_label === 'SUCCESSFUL_AVOIDANCE').length;
    const settledFalseNegative = settled.filter(r => r.settlement?.attribution?.verdict_label === 'MODEL_FALSE_NEGATIVE').length;
    const settledFormalWin = settled.filter(r => r.settlement?.attribution?.verdict_label === 'FORMAL_WIN').length;
    const settledFormalLose = settled.filter(r => r.settlement?.attribution?.verdict_label === 'FORMAL_LOSE').length;

    const totalBlockedSettled = settledAvoidance + settledFalseNegative;
    const avoidanceRate = totalBlockedSettled > 0 ? (settledAvoidance / totalBlockedSettled) * 100 : 0;

    // 比分预测与反思统计
    const scoreHits = settled.filter(r => r.settlement?.reflection?.score_hit).length;
    const exactScoreHits = settled.filter(r => r.settlement?.reflection?.exact_score_hit).length;
    const scoreHitRate = settled.length > 0 ? (scoreHits / settled.length) * 100 : 0;
    const exactHitRate = settled.length > 0 ? (exactScoreHits / settled.length) * 100 : 0;

    return {
      total_records: total,
      settled_records: settled.length,
      pending_records: pending,
      gate_distribution: {
        formal_qualified: formalQualified,
        blocked_by_c_grade: blockedCGrade,
        blocked_by_watch: blockedWatch,
        blocked_by_trap: blockedTrap,
        blocked_by_low_conf: blockedLowConf,
        blocked_no_ev: blockedNoEv,
        quant_machine_only: quantMachineOnly,
      },
      attribution: {
        avoidance_count: settledAvoidance,
        false_negative_count: settledFalseNegative,
        avoidance_rate: Number(avoidanceRate.toFixed(1)),
        formal_win_count: settledFormalWin,
        formal_lose_count: settledFormalLose,
      },
      reflection: {
        score_hits: scoreHits,
        exact_score_hits: exactScoreHits,
        score_hit_rate: Number(scoreHitRate.toFixed(1)),
        exact_hit_rate: Number(exactHitRate.toFixed(1)),
      },
    };
  }

  // ----------------------------------------------------
  // 私有辅助分析函数
  // ----------------------------------------------------

  private static matchAiEvaluation(match: CanonicalMatch, aiEvals: any[]): any {
    if (!Array.isArray(aiEvals) || aiEvals.length === 0) return null;
    const cleanStr = (s: string) => String(s || '').toLowerCase().replace(/-(ybty|leisu)$/gi, '').replace(/fc|football club|俱乐部|体育/gi, '').replace(/[\s\-_:\.()（）\[\]【】]/g, '').trim();
    const homeClean = cleanStr(match.home_team_name);
    const awayClean = cleanStr(match.away_team_name);

    for (const evalObj of aiEvals) {
      const candidates: any[] = [];
      if (evalObj?.result && Array.isArray(evalObj.result.matches)) {
        candidates.push(...evalObj.result.matches);
      } else if (evalObj?.result && typeof evalObj.result === 'object') {
        candidates.push(evalObj.result);
      } else if (evalObj?.match_id || evalObj?.canonical_id || evalObj?.match) {
        candidates.push(evalObj);
      }

      for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;
        if (item.canonical_id && item.canonical_id === match.canonical_id) return item;
        if (item.match_id && (item.match_id === match.canonical_id || item.match_id === match.reference?.leisu_match_id)) return item;
        if (item.ybty_home && item.ybty_away) {
          if (cleanStr(item.ybty_home) === homeClean && cleanStr(item.ybty_away) === awayClean) return item;
        }
        if (item.match && typeof item.match === 'string') {
          const parts = item.match.split(/\s*(?:vs|对阵|-)\s*/i);
          if (parts.length >= 2 && cleanStr(parts[0]) === homeClean && cleanStr(parts[1]) === awayClean) return item;
        }
      }
    }
    return null;
  }

  private static deriveGateAttribution(
    quant: QuantitativeFeatures,
    aiEval: any
  ): {
    gateCategory: GateCategory;
    gateDescription: string;
    aiGrade?: string;
    aiConfidence?: number;
    aiSummary?: string;
  } {
    if (aiEval) {
      const grade = String(aiEval.grade || aiEval.grade_raw || '').toUpperCase();
      const conf = Number(aiEval.confidence_score ?? 0);
      const summary = aiEval.qualitative_summary || aiEval.analysis || '';

      if ((grade.startsWith('A') || grade.startsWith('B')) && conf >= 70) {
        return {
          gateCategory: 'QUALIFIED_FORMAL',
          gateDescription: `A/B 级可投注审核通过 (AI评级: ${grade}, 置信度: ${conf})`,
          aiGrade: grade,
          aiConfidence: conf,
          aiSummary: summary,
        };
      }
      if (conf < 70 && (grade.startsWith('A') || grade.startsWith('B'))) {
        return {
          gateCategory: 'BLOCKED_BY_LOW_CONF',
          gateDescription: `置信度未达标拦截 (AI评级: ${grade}, 置信度: ${conf} < 70)`,
          aiGrade: grade,
          aiConfidence: conf,
          aiSummary: summary,
        };
      }
      if (grade.includes('TRAP') || grade.includes('REJECT') || grade.includes('F')) {
        return {
          gateCategory: 'BLOCKED_BY_AI_TRAP',
          gateDescription: `大模型判定为陷阱诱盘拦截 (${grade})`,
          aiGrade: grade,
          aiConfidence: conf,
          aiSummary: summary,
        };
      }
      if (grade.includes('WATCH') || grade.includes('RESEARCH')) {
        return {
          gateCategory: 'BLOCKED_BY_AI_WATCH',
          gateDescription: `大模型判定为观望拦截 (${grade})`,
          aiGrade: grade,
          aiConfidence: conf,
          aiSummary: summary,
        };
      }
      return {
        gateCategory: 'BLOCKED_BY_AI_C_GRADE',
        gateDescription: `大模型评估为 C 级拦截：基本面/战意/风险不可控 (${grade})`,
        aiGrade: grade,
        aiConfidence: conf,
        aiSummary: summary,
      };
    }

    // 无大模型报告时，按量化特征判断
    const hasEv = quant.positive_ev_signals && quant.positive_ev_signals.length > 0;
    if (hasEv) {
      const topSignal = quant.positive_ev_signals[0];
      return {
        gateCategory: 'QUANT_MACHINE_ONLY',
        gateDescription: `量化模型产出 +EV 优势信号 (${topSignal.market} EV: +${topSignal.expected_value_percent.toFixed(1)}%)，待大模型核验`,
      };
    }

    return {
      gateCategory: 'BLOCKED_NO_POSITIVE_EV',
      gateDescription: '量化模型无正向价值边际 (EV <= 0)，不具备开仓优势',
    };
  }

  private static derivePredictedDirection(
    quant: QuantitativeFeatures,
    ahLine: number | null,
    ouLine: number | null
  ): UniverseAuditRecord['predicted_direction'] | undefined {
    // 优先取 +EV 信号
    if (quant.positive_ev_signals && quant.positive_ev_signals.length > 0) {
      const sig = quant.positive_ev_signals[0];
      const isAh = sig.market.includes('HANDICAP') || sig.market.includes('SPREAD');
      return {
        market: isAh ? 'ASIAN_HANDICAP_MAIN' : 'TOTAL_GOALS_MAIN',
        selection: `${sig.direction} ${sig.line}`,
        line: sig.line,
        odds: sig.fair_odds || 1.95,
        model_probability: sig.model_probability || 0.5,
      };
    }

    // 次选基于 Lambda 的 Forward 泊松基准
    if (ahLine != null) {
      const lHome = quant.poisson?.lambda_home_rest || 1.0;
      const lAway = quant.poisson?.lambda_away_rest || 1.0;
      const homeDominance = lHome - lAway;
      const isHomeAdv = homeDominance > ahLine;
      return {
        market: 'ASIAN_HANDICAP_MAIN',
        selection: isHomeAdv ? `HOME ${ahLine}` : `AWAY ${-ahLine}`,
        line: ahLine,
        odds: 1.95,
        model_probability: isHomeAdv ? 0.55 : 0.45,
      };
    }

    if (ouLine != null) {
      const expGoals = quant.poisson?.expected_goals_rest || 2.5;
      const isOver = expGoals > ouLine;
      return {
        market: 'TOTAL_GOALS_MAIN',
        selection: isOver ? `OVER ${ouLine}` : `UNDER ${ouLine}`,
        line: ouLine,
        odds: 1.95,
        model_probability: isOver ? 0.55 : 0.45,
      };
    }

    return undefined;
  }
}

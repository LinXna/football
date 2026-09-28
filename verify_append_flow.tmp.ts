import fs from 'fs';
import { LedgerPersistence } from './refactor/05_portfolio_risk/ledgerPersistence.js';
import { extractAiEvaluationBrief } from './refactor/02_canonical_model/canonicalMatchAssembler.js';
import { RecommendationGrade } from './refactor/04_ai_evaluator/enums.js';

const batch = JSON.parse(fs.readFileSync('refactor/runtime/live_batch.json', 'utf8'));
const canonical_match = batch.matches.find((m: any) => m.canonical_id === '4558575');
const quant_features = batch.quantitative_features['4558575'];

const evals = JSON.parse(fs.readFileSync('output/refactor_ai_evaluations.json', 'utf8'));
const ai_evaluation: any = evals.find((x: any) => (x.canonical_id || x.match_id) === '4558575');

console.log('=== 模拟 append 端点完整流程 (4558575 纽卡斯尔联 vs 赫尔城) ===');

// 1. grade 门禁（当前代码）
const normalizedGrade = String(ai_evaluation.grade || '').toUpperCase().replace(/_GRADE$/, '');
console.log(`1. grade 门禁: 原始 grade="${ai_evaluation.grade}" → normalizedGrade="${normalizedGrade}"`);
if (normalizedGrade !== 'A' && normalizedGrade !== 'B') {
  console.log('   ❌ 拦截: 只有 A 级或 B 级推荐允许写入');
  process.exit(1);
}
console.log('   ✅ 通过');

// 2. grade 规范化
ai_evaluation.grade = normalizedGrade === 'A' ? RecommendationGrade.A_GRADE : RecommendationGrade.B_GRADE;
console.log(`2. grade 规范化: "${ai_evaluation.grade}"`);

// 3. confidence 门禁
console.log(`3. confidence 门禁: ${ai_evaluation.confidence_score} (>=70)`);
if (ai_evaluation.confidence_score < 70) {
  console.log('   ❌ 拦截');
  process.exit(1);
}
console.log('   ✅ 通过');

// 4. brief
const brief = extractAiEvaluationBrief(canonical_match);
console.log(`4. brief: league="${brief.league}" match_id="${brief.match_id}" status="${brief.status_summary}" teams="${brief.teams.home} vs ${brief.teams.away}" score="${brief.score_verification.current_score}"`);

// 5. candidatePipeline
const candidatePipeline = quant_features?.candidate_pipeline || ai_evaluation.candidate_pipeline;
console.log(`5. candidatePipeline.state="${candidatePipeline?.state}" (research_candidate_count=${candidatePipeline?.research_candidate_count})`);
if (!ai_evaluation.candidate_pipeline) ai_evaluation.candidate_pipeline = candidatePipeline;

// 6. legsToPersist
const legsToPersist = ai_evaluation.recommended_legs;
console.log(`6. legsToPersist 数量: ${legsToPersist?.length}`);
if (!legsToPersist || legsToPersist.length === 0) {
  console.log('   ❌ 拦截: recommended_legs 为空');
  process.exit(1);
}

const normalizedLegs = legsToPersist.map((leg: any) => {
  let basis = leg.basis;
  if (!basis || !['FULL_MATCH', 'REMAINING_GOALS', 'REMAINING_PERIOD_DOMINANCE'].includes(basis)) {
    basis = 'REMAINING_GOALS';
  }
  return { ...leg, basis };
});

// 完整复现 append 端点的 predictionSnapshot 构造（与 refactorLedgerRoutes.ts 169-182 行一致）
const signals = quant_features?.positive_ev_signals || [];
const rawSignals = quant_features?.raw_positive_ev_signals || signals;
const lambdaHome = (quant_features?.poisson as any)?.lambda_home_rest ?? (quant_features?.poisson as any)?.lambda_home ?? 1.2;
const lambdaAway = (quant_features?.poisson as any)?.lambda_away_rest ?? (quant_features?.poisson as any)?.lambda_away ?? 1.0;
const calculatedAt = quant_features?.calculated_at || new Date().toISOString();
const predictionSnapshot = (quant_features as any)?.prediction_snapshot || {
  model_version: 'refactor-layer03-v1',
  prediction_at: calculatedAt,
  predicted_lambda: { home: Number(lambdaHome) || 1.2, away: Number(lambdaAway) || 1.0 },
  red_card_state: '0-0',
  signals: signals.length > 0 ? signals : rawSignals
};

const evaluatorQuantFeatures: any = {
  mathematical_ev_signals: rawSignals,
  raw_positive_ev_signals: rawSignals,
  machine_candidate_signals: signals,
  candidate_pipeline: candidatePipeline,
  bdi: quant_features?.battlefield_dominance_index || 0,
  goal_phase_alert: quant_features?.goal_phase_alert || 'NONE',
  machine_candidate_count: candidatePipeline.machine_candidate_count,
  prediction_snapshot: predictionSnapshot
};

const payload: any = { ai_brief: brief, quant_features: evaluatorQuantFeatures };

try {
  const written = LedgerPersistence.appendApprovedLegs(payload, ai_evaluation, normalizedLegs, 'LIVE');
  console.log(`7. ✅ appendApprovedLegs 成功！写入 ${written.length} 条记录`);
  console.log('   结论：代码链路正确，仅差服务器重启。');
} catch (e: any) {
  console.log(`7. ❌ appendApprovedLegs 抛错: ${e.message}`);
  console.log(e.stack);
  process.exit(1);
}

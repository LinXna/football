import * as fs from 'fs';
import * as path from 'path';
import { CanonicalMatch } from '../refactor/02_canonical_model/types.js';
import { calculateQuantitativeFeatures } from '../refactor/03_quant_engine/index.js';
import { generateRefactoredPrompt } from '../refactor/04_ai_evaluator/promptExporter.js';

function run() {
  const batchPath = path.resolve(process.cwd(), 'refactor/runtime/live_batch.json');
  const rawBatch = JSON.parse(fs.readFileSync(batchPath, 'utf-8'));
  const matches: CanonicalMatch[] = rawBatch.matches || rawBatch;

  const match = matches.find(m => 
    m.match_slug?.includes('布尔萨体育') ||
    m.home_team_name?.includes('布尔萨体育') ||
    m.canonical_id === '4583529'
  );

  if (!match) {
    console.error('Match not found!');
    process.exit(1);
  }

  console.log(`Found match: ${match.canonical_id} ${match.match_slug}`);

  // 1. 运行修复后的 Layer 03 量化引擎
  const quantFeatures = calculateQuantitativeFeatures(match);

  // 2. 导出面向 AI Evaluator 的真实 Payload
  const promptResult = generateRefactoredPrompt([match], 'live_eval');
  
  // 提取用户 Payload 部分
  const userPayloadStr = promptResult.finalPrompt.split('========== USER PAYLOAD (BATCH OF 1 MATCHES) ==========\n')[1];
  const evaluatorPayload = JSON.parse(userPayloadStr)[0];

  const output = {
    canonical_id: match.canonical_id,
    match_slug: match.match_slug,
    exported_at: new Date().toISOString(),
    match_context: {
      league: match.league_name,
      home: match.home_team_name,
      away: match.away_team_name,
      stage: match.timing?.stage,
      minute: match.timing?.minute,
      score: `${match.score?.home_score}:${match.score?.away_score}`
    },
    layer03_quant_features: quantFeatures,
    ai_evaluator_payload: evaluatorPayload
  };

  const outputPath = path.resolve(process.cwd(), 'output/bursa_istanbul_layer03_real_payload.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`Successfully exported real payload to ${outputPath}`);
  console.log('--- SUMMARY OF QUANT FEATURES ---');
  console.log('Candidate Pipeline State:', quantFeatures.candidate_pipeline.state);
  console.log('Raw Signals Count:', quantFeatures.candidate_pipeline.raw_signal_count);
  console.log('OOS Validated Count:', quantFeatures.candidate_pipeline.oos_validated_count);
  console.log('Machine Candidate Count:', quantFeatures.candidate_pipeline.machine_candidate_count);
  console.log('Positive EV Signals:', JSON.stringify(quantFeatures.positive_ev_signals, null, 2));
  console.log('Devig Bookmaker Posture:', JSON.stringify(quantFeatures.devig.bookmaker_posture, null, 2));
  console.log('Poisson Lambda Rest:', quantFeatures.poisson.lambda_home_rest, quantFeatures.poisson.lambda_away_rest);
  console.log('Line Dispersion:', quantFeatures.devig.line_dispersion);
}

run();

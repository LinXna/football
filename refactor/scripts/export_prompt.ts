import { buildSystemPrompt, buildUserPrompt } from '../04_ai_evaluator/promptBuilder.js';
import { EvaluatorPayload } from '../04_ai_evaluator/types.js';
import * as fs from 'fs';
import * as path from 'path';

// 构造一个演示用的 Payload (你也可以从真实的输出 JSON 中读取)
const mockPayload: EvaluatorPayload = {
  ai_brief: {
    match_id: 'sample-match-001',
    league: 'Premier League',
    kickoff_time: new Date().toISOString(),
    status_summary: "LIVE 75' (0-1, 0红)",
    teams: { home: 'Arsenal', away: 'Chelsea' },
    score_verification: { is_verified: true, current_score: '0 - 1' },
    core_markets: {
      ah_main: { handicap: '-0.5', home_odds: 1.95, away_odds: 1.85 }
    },
    condensed_features: {
      possession: { home: 65, away: 35 },
      shots_on_target: { home: 5, away: 2 },
      dangerous_attacks: { home: 80, away: 40 }
    },
    data_deficits: []
  },
  quant_features: {
    screening_integrity_score: 95,
    data_quality_score: 98,
    model_stability_score: 90,
    edge_confidence_score: 85,
    bdi: 60,
    goal_phase_alert: 'IMMINENT_GOAL',
    raw_positive_ev_count: 1,
    machine_candidate_count: 1
  } as any,
  oos_context: {
    similar_situations_analyzed: 1000,
    historical_win_rate: 0.15,
    average_yield: -0.05,
    insight_note: 'Typical late game scenario.'
  }
};

const systemPrompt = buildSystemPrompt();
const userPrompt = buildUserPrompt(mockPayload);

const finalPrompt = `========== SYSTEM INSTRUCTION ==========
${systemPrompt}

========== USER PAYLOAD ==========
${userPrompt}
`;

const outputPath = path.join(process.cwd(), 'output', 'refactored_prompt_export.txt');
if (!fs.existsSync(path.join(process.cwd(), 'output'))) {
  fs.mkdirSync(path.join(process.cwd(), 'output'));
}

fs.writeFileSync(outputPath, finalPrompt, 'utf-8');
console.log(`✅ 重构版 Prompt 已成功导出至: ${outputPath}`);

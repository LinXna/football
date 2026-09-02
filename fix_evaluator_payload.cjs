const fs = require('fs');

let str = fs.readFileSync('refactor/04_ai_evaluator/types.ts', 'utf8');

const replacement = `export interface EvaluatorPayload {
  ai_brief: Partial<AiEvaluationBrief>;
  time_context: {
    statutory_minute: string;
    expected_remaining_minutes_including_stoppage: number;
  };
  tactical_phase_transitions: string[];
  lineup_value_matrix: any;
  team_profiling: any;
  quant_features: {
    devig: any;
    bdi: number;
    ev_signals: any[];
    risk_flags: any[];
    goal_alert: string;
    confidence: number;
  };
  oos_context?: OosHistoricalContext;
}`;

str = str.replace(/export interface EvaluatorPayload \{[\s\S]*?\}/m, replacement);
fs.writeFileSync('refactor/04_ai_evaluator/types.ts', str);

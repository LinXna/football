const fs = require('fs');
let str = fs.readFileSync('refactor/tests/verify_ai_evaluator.ts', 'utf8');

str = str.replace(/blind_spot_analysis: \{[\s\S]*?lineup_criticality_assessment: "\.\.\."\n  \},/g, 
`blind_spot_analysis: {
    "1_global_motivation": "...",
    "2_asian_handicap_reality": "...",
    "3_total_goals_reality": "...",
    tactical_regime_evaluation: TacticalRegimeEvaluation.BARREN_DOMINANCE,
    trap_detection_result: TrapDetectionResult.POTENTIAL_TRAP
  },`);
  
str = str.replace(/line: '-0.25', \/\/ -0.25 must be equivalent to statutory -0\/0.5\n      odds: 1.85,/g,
`selected_line: '-0.25', // -0.25 must be equivalent to statutory -0/0.5
      current_odds: 1.85,
      minimum_acceptable_odds: 1.70,`);

str = str.replace(/home_current_odds: 1\.95/g, 'home_odds: 1.95');

fs.writeFileSync('refactor/tests/verify_ai_evaluator.ts', str);

const fs = require('fs');

let str = fs.readFileSync('refactor/04_ai_evaluator/promptBuilder.ts', 'utf8');

str = str.replace(
  /You are provided an 'available_markets' matrix\. Do NOT anchor to just the main line\. You must:\n1\. Determine the expected match flow \(Goal Difference or Total Goals\)\.\n2\. Scan ALL available lines in 'available_markets'\./,
`You are provided comprehensive expected value calculations in 'quant_features.devig' (including spread_main_ev, spread_secondary_ev, total_main_ev, total_secondary_ev). Do NOT anchor to just the main line. You must:
1. Determine the expected match flow (Goal Difference or Total Goals).
2. Scan ALL available main and secondary lines in 'quant_features.devig'.`
);

fs.writeFileSync('refactor/04_ai_evaluator/promptBuilder.ts', str);

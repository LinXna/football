const fs = require('fs');
let str = fs.readFileSync('refactor/tests/verify_ai_evaluator.ts', 'utf8');
str = str.replace(/line: '-0\/0\.5'/g, "selected_line: '-0/0.5', current_odds: 1.95, minimum_acceptable_odds: 1.85");
str = str.replace(/odds: 1\.95/g, "current_odds: 1.95");
fs.writeFileSync('refactor/tests/verify_ai_evaluator.ts', str);

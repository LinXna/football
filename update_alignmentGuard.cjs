const fs = require('fs');

let alignStr = fs.readFileSync('refactor/04_ai_evaluator/alignmentGuard.ts', 'utf8');

// Change leg.line to leg.selected_line
alignStr = alignStr.replace(/leg\.line/g, 'leg.selected_line');

// Change leg.odds to leg.current_odds
alignStr = alignStr.replace(/leg\.odds/g, 'leg.current_odds');

// Update hallucination reason
alignStr = alignStr.replace(/Line=\$\{leg\.selected_line\}, Odds=\$\{leg\.current_odds\}/g, 'Line=${leg.selected_line}, Odds=${leg.current_odds}, MAO=${leg.minimum_acceptable_odds}');

fs.writeFileSync('refactor/04_ai_evaluator/alignmentGuard.ts', alignStr);
console.log("Done updating alignmentGuard.ts");

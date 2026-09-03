const fs = require('fs');
const file = 'refactor/03_quant_engine/eventMomentumFusion.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/const energy = timeline\.integral_15m\[side\] \?\? 0;/g, 'const energy = timeline.integral_15m[side] as number;');
code = code.replace(/const currentMinute = match\.timing\.minute \?\? 0;/g, 'const currentMinute = match.timing.minute as number;');
code = code.replace(/const homeScore = match\.score\.home_score \?\? 0;/g, 'const homeScore = match.score.home_score as number;');
code = code.replace(/const awayScore = match\.score\.away_score \?\? 0;/g, 'const awayScore = match.score.away_score as number;');
code = code.replace(/const slope5m = timeline\.slope_5m \?\? 0;/g, 'const slope5m = timeline.slope_5m as number;');
code = code.replace(/const slope15m = timeline\.slope_15m \?\? 0;/g, 'const slope15m = timeline.slope_15m as number;');

fs.writeFileSync(file, code);

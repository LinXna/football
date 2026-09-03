const fs = require('fs');
const file = 'refactor/03_quant_engine/contextEngine.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/const daH = homeStats\.dangerous_attack \?\? 0;/g, 'const daH = homeStats.dangerous_attack;');
code = code.replace(/const daA = awayStats\.dangerous_attack \?\? 0;/g, 'const daA = awayStats.dangerous_attack;');
code = code.replace(/const shotsH = homeStats\.shots \?\? 0;/g, 'const shotsH = homeStats.shots;');
code = code.replace(/const shotsA = awayStats\.shots \?\? 0;/g, 'const shotsA = awayStats.shots;');

code = code.replace(/if \(daH \+ daA > 0\)/g, 'if (daH !== undefined && daA !== undefined && daH + daA > 0)');
code = code.replace(/if \(shotsH \+ shotsA > 0\)/g, 'if (shotsH !== undefined && shotsA !== undefined && shotsH + shotsA > 0)');

code = code.replace(/const ftHome = item\.fulltime_score\?\.home \?\? 0;/g, 'const ftHome = item.fulltime_score?.home;');
code = code.replace(/const ftAway = item\.fulltime_score\?\.away \?\? 0;/g, 'const ftAway = item.fulltime_score?.away;');
code = code.replace(/const htHome = item\.halftime_score\?\.home \?\? 0;/g, 'const htHome = item.halftime_score?.home;');
code = code.replace(/const htAway = item\.halftime_score\?\.away \?\? 0;/g, 'const htAway = item.halftime_score?.away;');

code = code.replace(/const scoredFull = itemIsHome \? ftHome : ftAway;/g, 'if (ftHome === undefined || ftAway === undefined) continue;\n      const scoredFull = itemIsHome ? ftHome : ftAway;');

fs.writeFileSync(file, code);

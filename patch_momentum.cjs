const fs = require('fs');
const file = 'refactor/03_quant_engine/momentumQuantEngine.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/const (home|away)(DA|Attacks|Shots|On|Off|Corners|Yellow|Red) = stats\?\.(.*?)\?\.(home|away) \?\? 0;/g, 'const $1$2 = stats?.$3?.$4;');
code = code.replace(/const (home|away)Possession = stats\?\.possession\?\.(home|away) \?\? 50;/g, 'const $1Possession = stats?.possession?.$2;');

// 替换后续计算使其支持 undefined
code = code.replace(/const homePE = Number\(\(homeDA \/ \(homePossession \+ 1\.0\)\)\.toFixed\(3\)\);/g, 
'const homePE = (homeDA !== undefined && homePossession !== undefined) ? Number((homeDA / (homePossession + 1.0)).toFixed(3)) : undefined;');
code = code.replace(/const awayPE = Number\(\(awayDA \/ \(awayPossession \+ 1\.0\)\)\.toFixed\(3\)\);/g, 
'const awayPE = (awayDA !== undefined && awayPossession !== undefined) ? Number((awayDA / (awayPossession + 1.0)).toFixed(3)) : undefined;');

code = code.replace(/const homePenetration = homeAttacks > 0 \? Number\(\(homeDA \/ homeAttacks\)\.toFixed\(3\)\) : 0\.0;/g,
'const homePenetration = (homeDA !== undefined && homeAttacks !== undefined) ? (homeAttacks > 0 ? Number((homeDA / homeAttacks).toFixed(3)) : 0.0) : undefined;');
code = code.replace(/const awayPenetration = awayAttacks > 0 \? Number\(\(awayDA \/ awayAttacks\)\.toFixed\(3\)\) : 0\.0;/g,
'const awayPenetration = (awayDA !== undefined && awayAttacks !== undefined) ? (awayAttacks > 0 ? Number((awayDA / awayAttacks).toFixed(3)) : 0.0) : undefined;');

code = code.replace(/const homeAccuracy = homeShots > 0 \? Number\(\(homeOn \/ homeShots\)\.toFixed\(3\)\) : 0\.0;/g,
'const homeAccuracy = (homeOn !== undefined && homeShots !== undefined) ? (homeShots > 0 ? Number((homeOn / homeShots).toFixed(3)) : 0.0) : undefined;');
code = code.replace(/const awayAccuracy = awayShots > 0 \? Number\(\(awayOn \/ awayShots\)\.toFixed\(3\)\) : 0\.0;/g,
'const awayAccuracy = (awayOn !== undefined && awayShots !== undefined) ? (awayShots > 0 ? Number((awayOn / awayShots).toFixed(3)) : 0.0) : undefined;');

code = code.replace(/const homeConversion = homeDA > 0 \? Number\(\(homeShots \/ homeDA\)\.toFixed\(3\)\) : 0\.0;/g,
'const homeConversion = (homeShots !== undefined && homeDA !== undefined) ? (homeDA > 0 ? Number((homeShots / homeDA).toFixed(3)) : 0.0) : undefined;');
code = code.replace(/const awayConversion = awayDA > 0 \? Number\(\(awayShots \/ awayDA\)\.toFixed\(3\)\) : 0\.0;/g,
'const awayConversion = (awayShots !== undefined && awayDA !== undefined) ? (awayDA > 0 ? Number((awayShots / awayDA).toFixed(3)) : 0.0) : undefined;');

code = code.replace(/const homeCounterThreat = Number\(\(\(homeOffsides \* 0\.35 \+ homeAccuracy \* 1\.2\) \* \(100\.0 \/ \(homePossession \+ 25\.0\)\)\)\.toFixed\(3\)\);/g,
'const homeCounterThreat = (homePossession !== undefined && homeAccuracy !== undefined) ? Number(((homeOffsides * 0.35 + homeAccuracy * 1.2) * (100.0 / (homePossession + 25.0))).toFixed(3)) : undefined;');
code = code.replace(/const awayCounterThreat = Number\(\(\(awayOffsides \* 0\.35 \+ awayAccuracy \* 1\.2\) \* \(100\.0 \/ \(awayPossession \+ 25\.0\)\)\)\.toFixed\(3\)\);/g,
'const awayCounterThreat = (awayPossession !== undefined && awayAccuracy !== undefined) ? Number(((awayOffsides * 0.35 + awayAccuracy * 1.2) * (100.0 / (awayPossession + 25.0))).toFixed(3)) : undefined;');

code = code.replace(/const homeXT = Number\(\(\(homeDA \* 0\.015\) \+ \(homeCorners \* 0\.035\) \+ \(homeOff \* 0\.040\) \+ \(homeOn \* 0\.280\) \+ \(homeWoodwork \* 0\.15\)\)\.toFixed\(3\)\);/g,
'const homeXT = (homeDA !== undefined && homeCorners !== undefined && homeOff !== undefined && homeOn !== undefined) ? Number(((homeDA * 0.015) + (homeCorners * 0.035) + (homeOff * 0.040) + (homeOn * 0.280) + (homeWoodwork * 0.15)).toFixed(3)) : undefined;');
code = code.replace(/const awayXT = Number\(\(\(awayDA \* 0\.015\) \+ \(awayCorners \* 0\.035\) \+ \(awayOff \* 0\.040\) \+ \(awayOn \* 0\.280\) \+ \(awayWoodwork \* 0\.15\)\)\.toFixed\(3\)\);/g,
'const awayXT = (awayDA !== undefined && awayCorners !== undefined && awayOff !== undefined && awayOn !== undefined) ? Number(((awayDA * 0.015) + (awayCorners * 0.035) + (awayOff * 0.040) + (awayOn * 0.280) + (awayWoodwork * 0.15)).toFixed(3)) : undefined;');

code = code.replace(/const totalXT = homeXT \+ awayXT;/g, 'const totalXT = (homeXT !== undefined && awayXT !== undefined) ? homeXT + awayXT : undefined;');
code = code.replace(/const xtRatio = totalXT > 0 \? Number\(\(homeXT \/ totalXT\)\.toFixed\(3\)\) : 0\.50;/g, 'const xtRatio = (totalXT !== undefined && homeXT !== undefined) ? (totalXT > 0 ? Number((homeXT / totalXT).toFixed(3)) : 0.50) : undefined;');

code = code.replace(/const totalDA = homeDA \+ awayDA;/g, 'const totalDA = (homeDA !== undefined && awayDA !== undefined) ? homeDA + awayDA : undefined;');
code = code.replace(/const pressureIndex = totalDA > 0 \? Number\(\(\(homeDA - awayDA\) \/ totalDA\)\.toFixed\(3\)\) : 0\.0;/g, 'const pressureIndex = (totalDA !== undefined && homeDA !== undefined && awayDA !== undefined) ? (totalDA > 0 ? Number(((homeDA - awayDA) / totalDA).toFixed(3)) : 0.0) : undefined;');

code = code.replace(/const homeBarren = \(homePossession >= 60\) && \(homeOn <= 1\) && \(homePE <= awayPE \* 0\.8\);/g, 'const homeBarren = (homePossession !== undefined && homeOn !== undefined && homePE !== undefined && awayPE !== undefined) ? ((homePossession >= 60) && (homeOn <= 1) && (homePE <= awayPE * 0.8)) : undefined;');
code = code.replace(/const awayBarren = \(awayPossession >= 60\) && \(awayOn <= 1\) && \(awayPE <= homePE \* 0\.8\);/g, 'const awayBarren = (awayPossession !== undefined && awayOn !== undefined && awayPE !== undefined && homePE !== undefined) ? ((awayPossession >= 60) && (awayOn <= 1) && (awayPE <= homePE * 0.8)) : undefined;');

code = code.replace(/const homeLethal = \(homePossession <= 40\) && \(homeOn >= 2 \|\| homeCounterThreat >= 1\.5\);/g, 'const homeLethal = (homePossession !== undefined && homeOn !== undefined && homeCounterThreat !== undefined) ? ((homePossession <= 40) && (homeOn >= 2 || homeCounterThreat >= 1.5)) : undefined;');
code = code.replace(/const awayLethal = \(awayPossession <= 40\) && \(awayOn >= 2 \|\| awayCounterThreat >= 1\.5\);/g, 'const awayLethal = (awayPossession !== undefined && awayOn !== undefined && awayCounterThreat !== undefined) ? ((awayPossession <= 40) && (awayOn >= 2 || awayCounterThreat >= 1.5)) : undefined;');

fs.writeFileSync(file, code);

const fs = require('fs');
const content = fs.readFileSync('refactor/03_quant_engine/devigCalculator.ts', 'utf-8');
const newContent = content.replace(
`export function identifyBookmakerPosture(
  spreadEV: SpreadEVAssessment,
  totalEV: TotalEVAssessment,
  overround: number,
  shinZ: number
): BookmakerPosture {`,
`export function identifyBookmakerPosture(
  spreadEV: SpreadEVAssessment | undefined,
  totalEV: TotalEVAssessment | undefined,
  overround: number,
  shinZ: number
): BookmakerPosture {`
).replace(
`  if ((spreadEV.home_ev < -0.08 && spreadEV.home_odds > 2.20) || (spreadEV.away_ev < -0.08 && spreadEV.away_odds > 2.20)) {`,
`  if (spreadEV && ((spreadEV.home_ev < -0.08 && spreadEV.home_odds > 2.20) || (spreadEV.away_ev < -0.08 && spreadEV.away_odds > 2.20))) {`
).replace(
`  if (overround > 1.10 && !spreadEV.is_positive_ev && !totalEV.is_positive_ev) {`,
`  if (overround > 1.10 && (!spreadEV || !spreadEV.is_positive_ev) && (!totalEV || !totalEV.is_positive_ev)) {`
).replace(
`  const posture = identifyBookmakerPosture(spreadMain, totalMain, h2hDevig.raw_overround, 0.02);`,
`  const posture = identifyBookmakerPosture(spreadMain, totalMain, h2hDevig?.raw_overround ?? 1.05, 0.02);`
);
fs.writeFileSync('refactor/03_quant_engine/devigCalculator.ts', newContent);

const fs = require('fs');

let str = fs.readFileSync('refactor/03_quant_engine/devigCalculator.ts', 'utf8');

const regexSpreadSecondary = /spread_secondary_ev: \[\]/;
const regexTotalSecondary = /total_secondary_ev: \[\]/;

str = str.replace(
  /\/\/ 2\. 亚洲让球盘 EV[\s\S]*?\/\/ 3\. 大小球盘 EV/,
`// 2. 亚洲让球盘 EV
  const spreadMarket = match.markets?.full_spread_main;
  let spreadMain: SpreadEVAssessment;
  if (spreadMarket && spreadMarket.home_selection && spreadMarket.home_odds && spreadMarket.away_odds) {
    spreadMain = calculateAsianHandicapEV(spreadMarket.home_selection, spreadMarket.home_odds, spreadMarket.away_odds, poisson);
  } else {
    spreadMain = { line: '0.0', home_odds: 1.95, away_odds: 1.95, home_ev: 0.0, away_ev: 0.0, preferred_side: 'none', is_positive_ev: false };
  }

  const spreadSecondaryEV: SpreadEVAssessment[] = [];
  if (match.markets?.full_spread_subs) {
    for (const sub of match.markets.full_spread_subs) {
      if (sub.home_selection && sub.home_odds && sub.away_odds) {
        spreadSecondaryEV.push(calculateAsianHandicapEV(sub.home_selection, sub.home_odds, sub.away_odds, poisson));
      }
    }
  }

  // 3. 大小球盘 EV`
);

str = str.replace(
  /\/\/ 4\. 机构姿态识别[\s\S]*/,
`// 4. 机构姿态识别
  const posture = identifyBookmakerPosture(spreadMain, totalMain, h2hDevig.raw_overround, 0.02);

  const activeTracer = tracer ?? Tracer.getInstance();
  activeTracer.log(
    'INFO',
    'QUANT_03_DEVIG_CALCULATION',
    'DEVIG_EV_COMPLETED',
    \`Devig and EV calculated for match \${match.canonical_id}\`,
    {
      posture,
      spread_main: spreadMain,
      total_main: totalMain
    },
    match.canonical_id
  );

  return Object.freeze({
    h2h_devig: h2hDevig,
    spread_main_ev: spreadMain,
    spread_secondary_ev: spreadSecondaryEV,
    total_main_ev: totalMain,
    total_secondary_ev: totalSecondaryEV,
    line_dispersion: {
      spread_variance: 0.0,
      total_variance: 0.0
    },
    bookmaker_posture: posture
  });
}`
);

// We need to also insert the logic for totalSecondaryEV
str = str.replace(
  /\/\/ 3\. 大小球盘 EV[\s\S]*?\/\/ 4\. 机构姿态识别/,
`// 3. 大小球盘 EV
  const totalMarket = match.markets?.full_total_main;
  const currentTotal = (match.score.home_score ?? 0) + (match.score.away_score ?? 0);
  let totalMain: TotalEVAssessment;
  if (totalMarket && totalMarket.line && totalMarket.over_odds && totalMarket.under_odds) {
    totalMain = calculateTotalGoalsEV(totalMarket.line, totalMarket.over_odds, totalMarket.under_odds, currentTotal, poisson);
  } else {
    totalMain = { line: '2.5', over_odds: 1.95, under_odds: 1.95, over_ev: 0.0, under_ev: 0.0, preferred_side: 'none', is_positive_ev: false };
  }

  const totalSecondaryEV: TotalEVAssessment[] = [];
  if (match.markets?.full_total_subs) {
    for (const sub of match.markets.full_total_subs) {
      if (sub.line && sub.over_odds && sub.under_odds) {
        totalSecondaryEV.push(calculateTotalGoalsEV(sub.line, sub.over_odds, sub.under_odds, currentTotal, poisson));
      }
    }
  }

  // 4. 机构姿态识别`
);

fs.writeFileSync('refactor/03_quant_engine/devigCalculator.ts', str);

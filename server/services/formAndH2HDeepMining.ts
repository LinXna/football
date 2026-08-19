/**
 * Form & H2H Deep Mining Engine (近期战绩与历史交锋深度挖掘量化引擎)
 * 
 * Extracts and synthesizes:
 * 1. Home team overall form vs Home Venue Specific attack/defense capabilities.
 * 2. Away team overall form vs Away Venue Specific attack/defense capabilities.
 * 3. Head-to-Head (H2H) confrontation dynamics, home-at-home historical records, and tactical stylistic matchups.
 * 4. Venue-weighted Prior Expected Goals (λ_home_prior, λ_away_prior, λ_total_prior) for Poisson modeling.
 */

export interface FormStatsMatrix {
  matches_count: number;
  record_text: string;
  win_rate_pct: number;
  unbeaten_rate_pct: number;
  goals_scored_avg: number;
  goals_conceded_avg: number;
  clean_sheet_rate_pct: number;
  scoring_rate_pct: number;
  over_2_5_rate_pct: number;
  btts_rate_pct: number;
  handicap_cover_rate_pct?: number;
  rating_tag: string;
  summary_zh: string;
}

export interface H2HDeepMatrix {
  total_matches: number;
  recent_1year_matches: number;
  h2h_record: { home_wins: number; draws: number; away_wins: number; home_win_rate_pct: number };
  avg_total_goals: number;
  home_avg_goals: number;
  away_avg_goals: number;
  over_2_5_rate_pct: number;
  btts_rate_pct: number;
  home_at_home_record?: { matches: number; wins: number; draws: number; losses: number; avg_goal_diff: number };
  tactical_matchup_verdict: string;
  tactical_matchup_note_zh: string;
}

export interface FormAndH2HDeepMiningResult {
  home_overall_form: FormStatsMatrix;
  home_at_home_specific: FormStatsMatrix;
  away_overall_form: FormStatsMatrix;
  away_on_road_specific: FormStatsMatrix;
  head_to_head_deep: H2HDeepMatrix;
  form_weighted_poisson_prior: {
    lambda_home_prior: number;
    lambda_away_prior: number;
    lambda_total_prior: number;
    projected_baseline_margin: number;
    venue_impact_verdict: string;
    venue_impact_note_zh: string;
  };
  executive_analytical_brief_zh: string;
}

function parseMatchGoals(match: any, homeTeamName?: string): { gf: number; ga: number; isHome: boolean; result: 'W' | 'D' | 'L' } | null {
  if (!match || typeof match !== 'object') return null;

  let homeScore: number | null = null;
  let awayScore: number | null = null;

  if (typeof match.score === 'string') {
    const m = match.score.match(/(\d+)[\s:-]+(\d+)/);
    if (m) {
      homeScore = parseInt(m[1], 10);
      awayScore = parseInt(m[2], 10);
    }
  } else if (match.home_score != null && match.away_score != null) {
    homeScore = Number(match.home_score);
    awayScore = Number(match.away_score);
  }

  if (homeScore === null || awayScore === null || isNaN(homeScore) || isNaN(awayScore)) {
    return null;
  }

  const mHome = String(match.home_name || match.home || match.home_team || '');
  const mAway = String(match.away_name || match.away || match.away_team || '');

  let isHome = true;
  if (homeTeamName) {
    const target = homeTeamName.trim();
    if (mAway.includes(target) || (target.length >= 2 && mAway.startsWith(target.slice(0, 2)))) {
      isHome = false;
    }
  }

  const gf = isHome ? homeScore : awayScore;
  const ga = isHome ? awayScore : homeScore;
  const result: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf === ga ? 'D' : 'L';

  return { gf, ga, isHome, result };
}

function computeFormMatrix(
  matches: any[],
  teamName: string,
  venueFilter: 'all' | 'home_only' | 'away_only' = 'all',
  fallbackTable?: any
): FormStatsMatrix {
  let list = Array.isArray(matches) ? matches : [];
  
  // Filter matches by venue if required
  const parsedRows: Array<{ gf: number; ga: number; isHome: boolean; result: 'W' | 'D' | 'L' }> = [];
  for (const m of list) {
    const parsed = parseMatchGoals(m, teamName);
    if (!parsed) continue;
    if (venueFilter === 'home_only' && !parsed.isHome) continue;
    if (venueFilter === 'away_only' && parsed.isHome) continue;
    parsedRows.push(parsed);
  }

  // If match array was empty but summary table exists
  if (parsedRows.length === 0 && fallbackTable && typeof fallbackTable === 'object') {
    const w = Number(fallbackTable.win ?? fallbackTable.won ?? fallbackTable.w ?? 0);
    const d = Number(fallbackTable.draw ?? fallbackTable.d ?? 0);
    const l = Number(fallbackTable.loss ?? fallbackTable.l ?? 0);
    const gf = Number(fallbackTable.goals_for ?? fallbackTable.goals ?? fallbackTable.gf ?? 0);
    const ga = Number(fallbackTable.goals_against ?? fallbackTable.ga ?? 0);
    const total = Number(fallbackTable.total ?? fallbackTable.total_matches ?? (w + d + l));

    if (total > 0) {
      const winRate = Number(((w / total) * 100).toFixed(1));
      const unbeatenRate = Number((((w + d) / total) * 100).toFixed(1));
      const gfAvg = Number((gf / total).toFixed(2));
      const gaAvg = Number((ga / total).toFixed(2));
      
      const rating = winRate >= 65 ? 'DOMINANT' : winRate >= 45 ? 'STRONG' : unbeatenRate >= 65 ? 'RESILIENT' : 'VULNERABLE';
      const venueLabel = venueFilter === 'home_only' ? '主场' : venueFilter === 'away_only' ? '客场' : '近期总体';
      
      return {
        matches_count: total,
        record_text: `${total}战 ${w}胜${d}平${l}负 (进${gf}失${ga})`,
        win_rate_pct: winRate,
        unbeaten_rate_pct: unbeatenRate,
        goals_scored_avg: gfAvg,
        goals_conceded_avg: gaAvg,
        clean_sheet_rate_pct: Number((Math.max(0, 1 - (ga / (total * 1.3))) * 100).toFixed(1)),
        scoring_rate_pct: Number((Math.min(1, gf / total) * 100).toFixed(1)),
        over_2_5_rate_pct: gfAvg + gaAvg > 2.7 ? 60.0 : 40.0,
        btts_rate_pct: gfAvg > 1.0 && gaAvg > 1.0 ? 55.0 : 40.0,
        rating_tag: rating,
        summary_zh: `${venueLabel}${w}胜${d}平${l}负，胜率${winRate}%，场均进${gfAvg}球/失${gaAvg}球`,
      };
    }
  }

  const count = parsedRows.length;
  if (count === 0) {
    const isHome = venueFilter === 'home_only';
    const isAway = venueFilter === 'away_only';
    const defaultGF = isHome ? 1.45 : isAway ? 1.15 : 1.30;
    const defaultGA = isHome ? 1.10 : isAway ? 1.40 : 1.25;
    return {
      matches_count: 0,
      record_text: '暂无详细场次样本',
      win_rate_pct: isHome ? 45.0 : 35.0,
      unbeaten_rate_pct: isHome ? 70.0 : 55.0,
      goals_scored_avg: defaultGF,
      goals_conceded_avg: defaultGA,
      clean_sheet_rate_pct: isHome ? 35.0 : 25.0,
      scoring_rate_pct: isHome ? 75.0 : 65.0,
      over_2_5_rate_pct: 48.0,
      btts_rate_pct: 50.0,
      rating_tag: 'AVERAGE',
      summary_zh: `${venueFilter === 'home_only' ? '主场' : venueFilter === 'away_only' ? '客场' : '总体'}暂无详尽分项，采用基准参数`,
    };
  }

  let wins = 0, draws = 0, losses = 0;
  let totalGF = 0, totalGA = 0;
  let cleanSheets = 0, scoredMatches = 0;
  let over25Count = 0, bttsCount = 0;

  for (const row of parsedRows) {
    if (row.result === 'W') wins++;
    else if (row.result === 'D') draws++;
    else losses++;

    totalGF += row.gf;
    totalGA += row.ga;

    if (row.ga === 0) cleanSheets++;
    if (row.gf > 0) scoredMatches++;
    if (row.gf + row.ga > 2.5) over25Count++;
    if (row.gf > 0 && row.ga > 0) bttsCount++;
  }

  const winRate = Number(((wins / count) * 100).toFixed(1));
  const unbeatenRate = Number((((wins + draws) / count) * 100).toFixed(1));
  const gfAvg = Number((totalGF / count).toFixed(2));
  const gaAvg = Number((totalGA / count).toFixed(2));
  const cleanSheetPct = Number(((cleanSheets / count) * 100).toFixed(1));
  const scoringPct = Number(((scoredMatches / count) * 100).toFixed(1));
  const over25Pct = Number(((over25Count / count) * 100).toFixed(1));
  const bttsPct = Number(((bttsCount / count) * 100).toFixed(1));

  let ratingTag = 'AVERAGE';
  if (venueFilter === 'home_only') {
    if (winRate >= 65 && gfAvg >= 2.0) ratingTag = 'DOMINANT_HOME_BEAST'; // 主场龙
    else if (winRate >= 50 && cleanSheetPct >= 40) ratingTag = 'SOLID_HOME_FORTRESS'; // 主场堡垒
    else if (gfAvg >= 1.8 && gaAvg >= 1.5) ratingTag = 'OPEN_HOME_ATTACK'; // 主场对攻
    else if (winRate <= 25 && gaAvg >= 1.6) ratingTag = 'VULNERABLE_HOME'; // 主场乏力
  } else if (venueFilter === 'away_only') {
    if (unbeatenRate >= 65 && gaAvg <= 1.0) ratingTag = 'RESILIENT_AWAY_BRICK'; // 客场铁血防反
    else if (winRate >= 50 && gfAvg >= 1.8) ratingTag = 'DEADLY_AWAY_ATTACK'; // 客场犀利
    else if (winRate <= 20 && gaAvg >= 1.8) ratingTag = 'VULNERABLE_AWAY_ROAD'; // 客场虫
    else if (cleanSheetPct <= 20) ratingTag = 'LEAKY_AWAY_DEFENSE'; // 客场防线漏勺
  } else {
    if (winRate >= 60) ratingTag = 'EXCELLENT_FORM';
    else if (losses >= count * 0.6) ratingTag = 'POOR_SLUMP';
    else ratingTag = 'STABLE_FORM';
  }

  const venueName = venueFilter === 'home_only' ? '主场' : venueFilter === 'away_only' ? '客场' : '近期';
  const summaryZh = `${venueName}${count}战 ${wins}胜${draws}平${losses}负 (胜率${winRate}%·不败率${unbeatenRate}%) | 场均进${gfAvg}球·失${gaAvg}球 | 零封率${cleanSheetPct}%·破门率${scoringPct}%`;

  return {
    matches_count: count,
    record_text: `${count}战 ${wins}胜${draws}平${losses}负 (进${totalGF}失${totalGA})`,
    win_rate_pct: winRate,
    unbeaten_rate_pct: unbeatenRate,
    goals_scored_avg: gfAvg,
    goals_conceded_avg: gaAvg,
    clean_sheet_rate_pct: cleanSheetPct,
    scoring_rate_pct: scoringPct,
    over_2_5_rate_pct: over25Pct,
    btts_rate_pct: bttsPct,
    rating_tag: ratingTag,
    summary_zh: summaryZh,
  };
}

export function extractH2HDeepConfrontation(
  rawH2H: any[],
  homeTeamName: string,
  awayTeamName: string
): H2HDeepMatrix {
  const list = Array.isArray(rawH2H) ? rawH2H : [];
  const currentYear = new Date().getFullYear();

  let homeWins = 0, draws = 0, awayWins = 0;
  let totalH2HGoals = 0, homeGoals = 0, awayGoals = 0;
  let over25Count = 0, bttsCount = 0;
  let recent1YearCount = 0;

  let homeAtHomeMatches = 0;
  let homeAtHomeWins = 0, homeAtHomeDraws = 0, homeAtHomeLosses = 0;
  let homeAtHomeGoalDiff = 0;

  const validMatches: any[] = [];

  for (const m of list) {
    const parsed = parseMatchGoals(m, homeTeamName);
    if (!parsed) continue;
    validMatches.push({ ...m, parsed });

    // Check year
    let year = 0;
    const dStr = m.match_date || m.date || m.match_time || m.time;
    if (typeof dStr === 'string') {
      const matchYear = dStr.match(/(\d{4})/);
      if (matchYear) year = parseInt(matchYear[1], 10);
    }
    if (year > 0 && currentYear - year <= 1) {
      recent1YearCount++;
    }

    if (parsed.result === 'W') homeWins++;
    else if (parsed.result === 'D') draws++;
    else awayWins++;

    homeGoals += parsed.gf;
    awayGoals += parsed.ga;
    const matchTotal = parsed.gf + parsed.ga;
    totalH2HGoals += matchTotal;

    if (matchTotal > 2.5) over25Count++;
    if (parsed.gf > 0 && parsed.ga > 0) bttsCount++;

    // Check if played specifically at Home's venue
    if (parsed.isHome) {
      homeAtHomeMatches++;
      if (parsed.result === 'W') homeAtHomeWins++;
      else if (parsed.result === 'D') homeAtHomeDraws++;
      else homeAtHomeLosses++;
      homeAtHomeGoalDiff += (parsed.gf - parsed.ga);
    }
  }

  const count = validMatches.length;
  if (count === 0) {
    return {
      total_matches: 0,
      recent_1year_matches: 0,
      h2h_record: { home_wins: 0, draws: 0, away_wins: 0, home_win_rate_pct: 33.3 },
      avg_total_goals: 2.50,
      home_avg_goals: 1.35,
      away_avg_goals: 1.15,
      over_2_5_rate_pct: 48.0,
      btts_rate_pct: 50.0,
      tactical_matchup_verdict: 'NO_H2H_HISTORY',
      tactical_matchup_note_zh: '两队无近期直接交锋记录，主要由即时主客场攻防能力与机构盘口定价定夺。',
    };
  }

  const hWinRate = Number(((homeWins / count) * 100).toFixed(1));
  const avgTotal = Number((totalH2HGoals / count).toFixed(2));
  const homeAvgG = Number((homeGoals / count).toFixed(2));
  const awayAvgG = Number((awayGoals / count).toFixed(2));
  const over25Pct = Number(((over25Count / count).toFixed(1)));
  const bttsPct = Number(((bttsCount / count).toFixed(1)));

  let verdict = 'BALANCED_RIVALRY';
  let noteZh = '';

  if (homeWins >= count * 0.65 && count >= 3) {
    verdict = 'HOME_PSYCHOLOGICAL_EDGE';
    noteZh = `历史对战呈现压倒性心理优势：近${count}次交锋主队取得 ${homeWins}胜${draws}平${awayWins}负 (胜率${hWinRate}%)，场均净胜+${(homeAvgG - awayAvgG).toFixed(2)}球，球风严重克制客队。`;
  } else if (awayWins >= count * 0.55 && count >= 3) {
    verdict = 'AWAY_PSYCHOLOGICAL_EDGE';
    noteZh = `客队历史克星属性明显：近${count}次交锋客队取得 ${awayWins}胜${draws}平${homeWins}负，对主队战术防线穿透力极强。`;
  } else if (avgTotal >= 3.2 && over25Pct >= 65) {
    verdict = 'OPEN_GOAL_FEST';
    noteZh = `交战风格大开大合：近${count}次交锋场均打入 ${avgTotal} 球，大2.5球率达 ${over25Pct}%，双方对攻属性显著。`;
  } else if (avgTotal <= 1.8 && over25Pct <= 30) {
    verdict = 'CAGY_TACTICAL_BATTLE';
    noteZh = `战术相持胶着小球局：近${count}次交锋场均仅 ${avgTotal} 球，小球率高达 ${(100 - over25Pct).toFixed(0)}%，节奏迟缓缺乏渗透。`;
  } else {
    verdict = 'BALANCED_RIVALRY';
    noteZh = `历史交战旗鼓相当：近${count}次交锋 ${homeWins}胜${draws}平${awayWins}负，场均总进球 ${avgTotal} 个。`;
  }

  let homeAtHomeRecord: any = undefined;
  if (homeAtHomeMatches > 0) {
    homeAtHomeRecord = {
      matches: homeAtHomeMatches,
      wins: homeAtHomeWins,
      draws: homeAtHomeDraws,
      losses: homeAtHomeLosses,
      avg_goal_diff: Number((homeAtHomeGoalDiff / homeAtHomeMatches).toFixed(2)),
    };
  }

  return {
    total_matches: count,
    recent_1year_matches: recent1YearCount,
    h2h_record: { home_wins: homeWins, draws: draws, away_wins: awayWins, home_win_rate_pct: hWinRate },
    avg_total_goals: avgTotal,
    home_avg_goals: homeAvgG,
    away_avg_goals: awayAvgG,
    over_2_5_rate_pct: over25Pct,
    btts_rate_pct: bttsPct,
    home_at_home_record: homeAtHomeRecord,
    tactical_matchup_verdict: verdict,
    tactical_matchup_note_zh: noteZh,
  };
}

/**
 * Main deep mining entrypoint for a single match
 */
export function deepMineFormAndH2H(item: any): FormAndH2HDeepMiningResult {
  const homeName = item?.ybty_home || item?.leisu_home || item?.home_team || item?.home || '主队';
  const awayName = item?.ybty_away || item?.leisu_away || item?.away_team || item?.away || '客队';

  const historical = item?.recent_trends?.historical_analysis || item?.detail_context?.formal?.historical_analysis || item?.detail_context?.formal || {};
  const trends = item?.recent_trends || item?.trend_summary || {};

  // Extract raw match lists
  const homeRecentMatches = trends?.home?.matches || trends?.home_recent_form?.matches || historical?.home_recent_form?.matches || [];
  const awayRecentMatches = trends?.away?.matches || trends?.away_recent_form?.matches || historical?.away_recent_form?.matches || [];
  const h2hMatches = historical?.head_to_head || item?.head_to_head || trends?.h2h || [];

  // Standings tables if match lists are slimmed
  const standings = trends?.standings || item?.recent_trends?.standings || historical?.league_standings;
  const homeStandings = standings?.home_team || standings?.home;
  const awayStandings = standings?.away_team || standings?.away;

  // 1. Home Overall & Home-at-Home Specific
  const homeOverall = computeFormMatrix(homeRecentMatches, homeName, 'all', homeStandings?.total);
  const homeAtHome = computeFormMatrix(homeRecentMatches, homeName, 'home_only', homeStandings?.home || homeStandings?.total);

  // 2. Away Overall & Away-on-Road Specific
  const awayOverall = computeFormMatrix(awayRecentMatches, awayName, 'all', awayStandings?.total);
  const awayOnRoad = computeFormMatrix(awayRecentMatches, awayName, 'away_only', awayStandings?.away || awayStandings?.total);

  // 3. Head to Head Confrontation
  const h2hDeep = extractH2HDeepConfrontation(h2hMatches, homeName, awayName);

  // 4. Form-Weighted Poisson Expectancy Prior Calculation
  // League baseline expected goal ~ 1.35
  const LEAGUE_BENCHMARK = 1.35;
  const homeAttack = Math.max(0.4, homeAtHome.goals_scored_avg || homeOverall.goals_scored_avg || 1.4);
  const awayDefense = Math.max(0.4, awayOnRoad.goals_conceded_avg || awayOverall.goals_conceded_avg || 1.3);
  const awayAttack = Math.max(0.3, awayOnRoad.goals_scored_avg || awayOverall.goals_scored_avg || 1.1);
  const homeDefense = Math.max(0.3, homeAtHome.goals_conceded_avg || homeOverall.goals_conceded_avg || 1.1);

  // Cross-multiplying home attack efficiency with away defensive vulnerability
  let lambdaHome = (homeAttack * awayDefense) / LEAGUE_BENCHMARK;
  let lambdaAway = (awayAttack * homeDefense) / LEAGUE_BENCHMARK;

  // Apply H2H stylistic weight if valid encounters >= 2
  if (h2hDeep.total_matches >= 2) {
    const h2hHomeFactor = h2hDeep.home_avg_goals / LEAGUE_BENCHMARK;
    const h2hAwayFactor = h2hDeep.away_avg_goals / LEAGUE_BENCHMARK;
    lambdaHome = lambdaHome * 0.75 + (lambdaHome * h2hHomeFactor) * 0.25;
    lambdaAway = lambdaAway * 0.75 + (lambdaAway * h2hAwayFactor) * 0.25;
  }

  // Constrain within physical bounds
  lambdaHome = Number(Math.max(0.35, Math.min(4.2, lambdaHome)).toFixed(2));
  lambdaAway = Number(Math.max(0.25, Math.min(3.8, lambdaAway)).toFixed(2));
  const lambdaTotal = Number((lambdaHome + lambdaAway).toFixed(2));
  const projectedMargin = Number((lambdaHome - lambdaAway).toFixed(2));

  let venueVerdict = 'NEUTRAL_VENUE_IMPACT';
  let venueNoteZh = '';

  const homeAdvantage = (homeAtHome.goals_scored_avg - homeAtHome.goals_conceded_avg) - (homeOverall.goals_scored_avg - homeOverall.goals_conceded_avg);
  const awayRoadDeficit = awayOnRoad.goals_conceded_avg - awayOverall.goals_conceded_avg;

  if (homeAdvantage > 0.4 || awayRoadDeficit > 0.4) {
    venueVerdict = 'HIGH_HOME_ADVANTAGE_AMPLIFIER';
    venueNoteZh = `主客场特异性显著放大：主队在主场净胜球效能提升 +${homeAdvantage.toFixed(2)}，客队客场失球率增加 +${awayRoadDeficit.toFixed(2)}，显著利好主队让步与破门。`;
  } else if (awayOnRoad.unbeaten_rate_pct >= 65 && awayOnRoad.goals_conceded_avg <= 1.0) {
    venueVerdict = 'AWAY_STRONG_ROAD_RESILIENCE';
    venueNoteZh = `客队具备极强客场抗冷与铁血防守属性 (客场不败率${awayOnRoad.unbeaten_rate_pct}%, 场均仅失${awayOnRoad.goals_conceded_avg}球)，谨防优势方深盘翻车，力挺客队受让。`;
  } else {
    venueVerdict = 'BALANCED_VENUE_PROFILE';
    venueNoteZh = `主客场差异处于常规区间，主场进球期望 λ=${lambdaHome}，客场进球期望 λ=${lambdaAway}。`;
  }

  const executiveBrief = `【战绩与主客场深度挖掘】主队主场能力: [${homeAtHome.rating_tag}] 胜率${homeAtHome.win_rate_pct}%, 场均进${homeAtHome.goals_scored_avg}/失${homeAtHome.goals_conceded_avg}; 客队客场能力: [${awayOnRoad.rating_tag}] 不败率${awayOnRoad.unbeaten_rate_pct}%, 场均进${awayOnRoad.goals_scored_avg}/失${awayOnRoad.goals_conceded_avg}; 交锋特征: ${h2hDeep.tactical_matchup_note_zh}; 战绩加权先验期望进球: 主λ=${lambdaHome}, 客λ=${lambdaAway} (总λ=${lambdaTotal}, 预期净胜=${projectedMargin > 0 ? '+' : ''}${projectedMargin})`;

  return {
    home_overall_form: homeOverall,
    home_at_home_specific: homeAtHome,
    away_overall_form: awayOverall,
    away_on_road_specific: awayOnRoad,
    head_to_head_deep: h2hDeep,
    form_weighted_poisson_prior: {
      lambda_home_prior: lambdaHome,
      lambda_away_prior: lambdaAway,
      lambda_total_prior: lambdaTotal,
      projected_baseline_margin: projectedMargin,
      venue_impact_verdict: venueVerdict,
      venue_impact_note_zh: venueNoteZh,
    },
    executive_analytical_brief_zh: executiveBrief,
  };
}

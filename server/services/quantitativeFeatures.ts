type JsonRecord = Record<string, any>;

const object = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;

/**
 * 1. Attack Efficiency & Dangerous Attack Conversion Matrix
 */
export function calculateAttackConversion(statistics: unknown, score?: unknown): JsonRecord | null {
  const stats = object(statistics);
  if (Object.keys(stats).length === 0) return null;

  const currentScore = object(score);
  const getSideVal = (field: string, side: 'home' | 'away') => {
    const val = stats[field];
    if (val && typeof val === 'object') {
      const v = side === 'home' ? (val.home ?? val.h) : (val.away ?? val.a);
      return number(v);
    }
    return 0;
  };

  const dangerH = getSideVal('dangerous_attacks', 'home') || getSideVal('danger_attacks', 'home');
  const dangerA = getSideVal('dangerous_attacks', 'away') || getSideVal('danger_attacks', 'away');

  const onTargetH = getSideVal('shots_on_target', 'home') || getSideVal('on_target', 'home');
  const onTargetA = getSideVal('shots_on_target', 'away') || getSideVal('on_target', 'away');

  const offTargetH = getSideVal('shots_off_target', 'home') || getSideVal('off_target', 'home');
  const offTargetA = getSideVal('shots_off_target', 'away') || getSideVal('off_target', 'away');

  const shotsH = getSideVal('shots', 'home') || getSideVal('total_shots', 'home') || (onTargetH + offTargetH);
  const shotsA = getSideVal('shots', 'away') || getSideVal('total_shots', 'away') || (onTargetA + offTargetA);

  const goalH = number(currentScore.home);
  const goalA = number(currentScore.away);

  const totalDanger = dangerH + dangerA;
  const fieldTiltH = rate(dangerH, totalDanger);
  const fieldTiltA = rate(dangerA, totalDanger);

  const dangerToShotH = rate(shotsH, dangerH);
  const dangerToShotA = rate(shotsA, dangerA);

  const shotAccuracyH = rate(onTargetH, shotsH);
  const shotAccuracyA = rate(onTargetA, shotsA);

  const finishingH = onTargetH > 0 ? rate(goalH, onTargetH) : null;
  const finishingA = onTargetA > 0 ? rate(goalA, onTargetA) : null;

  if (shotsH === 0 && shotsA === 0 && dangerH === 0 && dangerA === 0) return null;

  return {
    field_tilt_share: { home: fieldTiltH, away: fieldTiltA },
    dangerous_attack_to_shot_ratio: { home: dangerToShotH, away: dangerToShotA },
    shot_on_target_accuracy: { home: shotAccuracyH, away: shotAccuracyA },
    finishing_conversion: { home: finishingH, away: finishingA },
    summary_note: 'Dangerous attack to shot ratio measures penetrative threat vs empty possession. Field tilt measures territorial pressure in attacking third.',
  };
}

/**
 * 2. Bookmaker Overround & Fair Odds (Margined vs Margin-Stripped Fair Probabilities)
 */
export interface FairOptionResult {
  side?: string | null;
  line?: any;
  odds: number;
  implied_prob_pct: number;
  fair_prob_pct: number;
  fair_odds: number;
  option_id?: string;
}

export function calculateMarketOverroundAndFairOdds(options: Array<{ side?: string | null; line?: any; odds?: number; option_id?: string }>): {
  overround_pct: number;
  fair_options: FairOptionResult[];
} | null {
  const valid = (options || []).filter((opt) => Number(opt?.odds) > 1);
  if (valid.length < 2) return null;

  const totalImplied = valid.reduce((sum, opt) => sum + (1 / Number(opt.odds)), 0);
  const overround = totalImplied - 1;

  const fairOptions: FairOptionResult[] = valid.map((opt) => {
    const rawOdds = Number(opt.odds);
    const impliedProb = 1 / rawOdds;
    const fairProb = impliedProb / totalImplied;
    const fairOdds = Number((1 / fairProb).toFixed(3));
    return {
      side: opt.side || null,
      line: opt.line ?? null,
      odds: rawOdds,
      implied_prob_pct: Number((impliedProb * 100).toFixed(2)),
      fair_prob_pct: Number((fairProb * 100).toFixed(2)),
      fair_odds: fairOdds,
      option_id: opt.option_id,
    };
  });

  return {
    overround_pct: Number((overround * 100).toFixed(2)),
    fair_options: fairOptions,
  };
}

/**
 * 3. Lineup & Squad Quality Transparency Indicator
 */
export function classifyLineupTransparency(lineupInput: unknown): {
  tier: 'confirmed_official_lineup' | 'squad_list_only' | 'unknown_or_unannounced';
  home_starters_count: number;
  away_starters_count: number;
  label: string;
} {
  const lineup = object(lineupInput);
  const getStarters = (val: unknown): string[] => {
    if (Array.isArray(val)) return val.map((p) => p?.name || p).filter(Boolean);
    return [];
  };

  const homeStarters = getStarters(lineup.home_starters || lineup.home?.starters || lineup.home_starter_details);
  const awayStarters = getStarters(lineup.away_starters || lineup.away?.starters || lineup.away_starter_details);

  const isConfirmed = lineup.confirmed === true || lineup.status === 'confirmed' || (homeStarters.length >= 11 && awayStarters.length >= 11);
  const isSquadOnly = lineup.status === 'squad_only_no_confirmed_match_lineup' || (homeStarters.length === 0 && awayStarters.length === 0 && (Array.isArray(lineup.home) || Array.isArray(lineup.players)));

  if (isConfirmed || (homeStarters.length >= 10 && awayStarters.length >= 10)) {
    return {
      tier: 'confirmed_official_lineup',
      home_starters_count: homeStarters.length,
      away_starters_count: awayStarters.length,
      label: '官方正式首发已确认',
    };
  }

  if (isSquadOnly || homeStarters.length > 0 || awayStarters.length > 0) {
    return {
      tier: 'squad_list_only',
      home_starters_count: homeStarters.length,
      away_starters_count: awayStarters.length,
      label: '仅大名单/未确认最终11人首发',
    };
  }

  return {
    tier: 'unknown_or_unannounced',
    home_starters_count: 0,
    away_starters_count: 0,
    label: '阵容信息暂未公布',
  };
}

/**
 * 4. Professional Tournament Tier & Strategy Profile Classifier
 */
export type CompetitionCategory =
  | 'TIER_1_ELITE_LEAGUE'      // 五大联赛 / 欧冠欧联正赛 / 顶级国家队正赛
  | 'TIER_2_MID_LEAGUE'        // 瑞典超、荷甲、葡超、英冠、美职联、日职联、巴甲等主流一级联赛
  | 'TIER_3_LOWER_LEAGUE'      // 各国次级/低级别联赛、地区联赛
  | 'CUP_KNOCKOUT'             // 各国国内杯赛、洲际资格赛、淘汰赛
  | 'YOUTH_RESERVES_FRIENDLY'  // 青年队、预备队、球会友谊赛
  | 'WOMEN_FOOTBALL';          // 女足各级别联赛与杯赛

export interface TournamentProfile {
  tier_category: CompetitionCategory;
  tier_name_zh: string;
  market_liquidity: 'ULTRA_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
  expected_overround_range: string;
  variance_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  max_recommended_stake_pct: number;
  rotation_risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  strategic_directives: string[];
}

export function classifyTournamentTier(leagueName: string, homeTeam = '', awayTeam = ''): TournamentProfile {
  const text = `${leagueName} ${homeTeam} ${awayTeam}`.toLowerCase();

  // 1. Women's Football (女足)
  if (/女|women|wom|femini|dam|wsl|nwsl|frauen/i.test(text)) {
    return {
      tier_category: 'WOMEN_FOOTBALL',
      tier_name_zh: '女足赛事 (Women\'s Football)',
      market_liquidity: 'LOW',
      expected_overround_range: '6.5% - 10.0%',
      variance_level: 'HIGH',
      max_recommended_stake_pct: 1.5,
      rotation_risk_level: 'MEDIUM',
      strategic_directives: [
        '女足赛事门将扑救覆盖与球门比例使远射、高空定位球转化率高于男足。',
        '国内女足联赛上下游阶梯差距通常极悬殊，重点核验真实攻防效率与阵容梯队。',
        '防守失误率与角球/定位球产生率较高，单场仓位上限严格限制在 1.5% 以内。',
      ],
    };
  }

  // 2. Youth, Reserves & Friendlies (梯队、预备队、热身友谊赛)
  if (/u\d+|u-\d+|青年|预备|reserve|youth|友谊|friendl|club\s*fr|热身/i.test(text)) {
    return {
      tier_category: 'YOUTH_RESERVES_FRIENDLY',
      tier_name_zh: '青年队/预备队/球会友谊赛 (Youth/Reserves/Friendlies)',
      market_liquidity: 'LOW',
      expected_overround_range: '7.0% - 12.0%',
      variance_level: 'VERY_HIGH',
      max_recommended_stake_pct: 1.0,
      rotation_risk_level: 'HIGH',
      strategic_directives: [
        '战术纪律性与防守稳定性低，友谊赛换人名额多(5~11人)，易导致防线后半程崩塌。',
        '极高比分方差与进球波动，禁止重仓，单场最高下注上限 1.0%，严禁 A 级正式推荐。',
        '深盘让球需极其谨慎，禁止跨串关重复使用同一比赛。',
      ],
    };
  }

  // 3. Domestic & Continental Knockout Cups (杯赛/淘汰制)
  if (/杯|cup|copa|trophy|pokal|coupe|taça|coppa|efl|fa\s*cup|资格赛|qualif|play-off|附加赛|淘汰赛/i.test(text)) {
    return {
      tier_category: 'CUP_KNOCKOUT',
      tier_name_zh: '国内/洲际杯赛淘汰赛 (Cup & Knockout)',
      market_liquidity: 'MEDIUM',
      expected_overround_range: '5.0% - 8.5%',
      variance_level: 'HIGH',
      max_recommended_stake_pct: 2.0,
      rotation_risk_level: 'HIGH',
      strategic_directives: [
        '强队轮换风险极高，豪门往往派出替补/轮换阵容。',
        '【深盘陷阱防范】低独赢赔率绝不等于能打穿 -1.5 / -2.0 深盘，禁止仅凭名气推深盘。',
        '两回合赛制需关注首回合比分(次回合保平即出线)；单回合淘汰需防范常规时间保平拖入点球大战。',
        '首发阵容未公布时最高评级限制为 C 级，严禁给出 A 级正式推荐。',
      ],
    };
  }

  // 4. Tier 1 Elite Leagues (五大联赛 / 欧冠正赛 / 顶级国家队正赛)
  const isTier1 = /英超|西甲|意甲|德甲|法甲|premier\s*league|la\s*liga|serie\s*a|bundesliga|ligue\s*1|欧冠|champions\s*league|世界杯|world\s*cup|欧洲杯|euros/i.test(text);
  if (isTier1) {
    return {
      tier_category: 'TIER_1_ELITE_LEAGUE',
      tier_name_zh: '顶级精英联赛 (Tier 1 Elite)',
      market_liquidity: 'ULTRA_HIGH',
      expected_overround_range: '2.0% - 3.5%',
      variance_level: 'LOW',
      max_recommended_stake_pct: 5.0,
      rotation_risk_level: 'LOW',
      strategic_directives: [
        '市场效率极高，机构抽水仅 2~3.5%，基本面信息高度透明，无简单信息差。',
        '必须基于精细攻防指标 (xG差值、真实射正转化、场面倾角) 与战术对位寻找微弱价格偏差 (+EV)。',
        '滚球分析重点关注 60 分钟后主帅战术换人与体能临界点。',
        '符合 A 级标准且首发明确时，可配置 3.0%~5.0% 主力仓位。',
      ],
    };
  }

  // 5. Tier 2 Mid Leagues (主流竞技一级联赛)
  const isTier2 = /瑞典超|挪超|芬超|丹超|荷甲|葡超|比甲|苏超|英冠|美职联|mls|日职|j1|韩k|k-league|澳超|巴甲|阿甲|墨超|沙特|中超|瑞士超|奥甲|土超|allsvenskan|eliteserien|eredivisie|primeira|championship/i.test(text);
  if (isTier2) {
    return {
      tier_category: 'TIER_2_MID_LEAGUE',
      tier_name_zh: '主流一级联赛 (Tier 2 Mid League)',
      market_liquidity: 'HIGH',
      expected_overround_range: '4.0% - 6.0%',
      variance_level: 'MEDIUM',
      max_recommended_stake_pct: 3.0,
      rotation_risk_level: 'LOW',
      strategic_directives: [
        '主客场环境差异显著 (如北欧人工草皮、南美高原与长途飞行客场)，主场优势加权明显。',
        '需重点排查周中欧战或杯赛造成的一周双赛体能消耗与局部轮换。',
        '积分榜保级与欧战抢分战意分化明显，重点结合真实攻防效率与即时首发评估。',
      ],
    };
  }

  // 6. Tier 3 Lower / Regional Leagues (次级/低级别/地区联赛)
  return {
    tier_category: 'TIER_3_LOWER_LEAGUE',
    tier_name_zh: '次级与低级别联赛 (Tier 3 Lower/Regional)',
    market_liquidity: 'LOW',
    expected_overround_range: '6.0% - 9.5%',
    variance_level: 'HIGH',
    max_recommended_stake_pct: 1.5,
    rotation_risk_level: 'MEDIUM',
    strategic_directives: [
      '机构抽水偏高 (6~9.5%)，数据透明度相对有限，防守失误率与体能断崖显著 (65-90分失球高发)。',
      '避免对低级别联赛做深盘激进追捧，单场仓位硬性上限限制在 1.5% 以内。',
      '重点关注近 6 场联赛主客场即时表现，降低陈旧历史交锋权重。',
    ],
  };
}

/**
 * 4. Cup & Tournament Risk Detector (Enriched with Tier Profile)
 */
export function detectTournamentRisk(
  leagueName: string,
  lineupTransparency: ReturnType<typeof classifyLineupTransparency>,
  homeTeam = '',
  awayTeam = ''
): {
  is_cup_or_friendly: boolean;
  tier_category: CompetitionCategory;
  tier_name_zh: string;
  rotation_risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  tournament_profile: TournamentProfile;
  warning_note?: string;
} {
  const profile = classifyTournamentTier(leagueName, homeTeam, awayTeam);
  const isHighRiskCompetition = profile.tier_category === 'CUP_KNOCKOUT' ||
    profile.tier_category === 'YOUTH_RESERVES_FRIENDLY' ||
    profile.tier_category === 'WOMEN_FOOTBALL';

  if (!isHighRiskCompetition) {
    return {
      is_cup_or_friendly: false,
      tier_category: profile.tier_category,
      tier_name_zh: profile.tier_name_zh,
      rotation_risk_level: 'LOW',
      tournament_profile: profile,
    };
  }

  if (profile.tier_category === 'YOUTH_RESERVES_FRIENDLY') {
    return {
      is_cup_or_friendly: true,
      tier_category: profile.tier_category,
      tier_name_zh: profile.tier_name_zh,
      rotation_risk_level: 'HIGH',
      tournament_profile: profile,
      warning_note: '梯队/友谊赛防守阵型松散且换人随意，比分方差极高，严禁A级正式推荐，仓位上限 1.0%。',
    };
  }

  if (profile.tier_category === 'CUP_KNOCKOUT' && lineupTransparency.tier !== 'confirmed_official_lineup') {
    return {
      is_cup_or_friendly: true,
      tier_category: profile.tier_category,
      tier_name_zh: profile.tier_name_zh,
      rotation_risk_level: 'HIGH',
      tournament_profile: profile,
      warning_note: '杯赛淘汰赛且首发阵容未确认，轮换风险极高，严禁A级正式推荐，最高限制C级观察。',
    };
  }

  return {
    is_cup_or_friendly: true,
    tier_category: profile.tier_category,
    tier_name_zh: profile.tier_name_zh,
    rotation_risk_level: profile.rotation_risk_level,
    tournament_profile: profile,
    warning_note: profile.strategic_directives[0],
  };
}

/**
 * 5. Bankroll Sizing & Kelly Position Guidance
 */
export function calculateBankrollGuidance(params: {
  grade: string;
  isParlay?: boolean;
  legCount?: number;
  valueEdge?: number | null;
}): {
  recommended_stake_pct: string;
  max_stake_pct: number;
  stake_sizing_tier: 'CORE_FOCUS' | 'STANDARD_PLAY' | 'LIGHT_PARLAY' | 'NO_STAKE';
  guidance_text: string;
  fractional_kelly_pct?: number;
} {
  const { grade, isParlay = false, legCount = 1, valueEdge = null } = params;

  if (grade === 'NO_BET' || grade === 'C' || (valueEdge !== null && valueEdge <= 0)) {
    return {
      recommended_stake_pct: '0%',
      max_stake_pct: 0,
      stake_sizing_tier: 'NO_STAKE',
      guidance_text: '无安全边际或数据不足，建议观望，不予下注。',
    };
  }

  if (isParlay) {
    if (legCount === 2) {
      return {
        recommended_stake_pct: '1.0% - 1.5%',
        max_stake_pct: 1.5,
        stake_sizing_tier: 'LIGHT_PARLAY',
        guidance_text: '2串1黄金组合：复合抽水可控，建议轻仓 1.0% - 1.5%。',
      };
    }
    if (legCount === 3) {
      return {
        recommended_stake_pct: '0.5% - 1.0%',
        max_stake_pct: 1.0,
        stake_sizing_tier: 'LIGHT_PARLAY',
        guidance_text: '3串1长线组合：注意复合抽水递增，建议微仓 0.5% - 1.0%。',
      };
    }
    return {
      recommended_stake_pct: '0.25% - 0.5%',
      max_stake_pct: 0.5,
      stake_sizing_tier: 'LIGHT_PARLAY',
      guidance_text: '4腿以上多串关：抽水偏高，仅作娱乐彩票微仓。',
    };
  }

  // Single Match
  if (grade === 'A') {
    return {
      recommended_stake_pct: '3.0% - 5.0%',
      max_stake_pct: 5.0,
      stake_sizing_tier: 'CORE_FOCUS',
      guidance_text: 'A级核心推荐：数据完备、阵容明确且具备正期望边际 (+EV)，建议主力仓位 3% - 5%。',
    };
  }

  return {
    recommended_stake_pct: '1.0% - 2.0%',
    max_stake_pct: 2.0,
    stake_sizing_tier: 'STANDARD_PLAY',
    guidance_text: 'B级标准推荐：数据达标但存在局部不确定性，建议标准防守仓位 1% - 2%。',
  };
}

/**
 * 6. Historical H2H & Recent Form Time-Decay Evaluator (Dixon-Coles & Half-Life Principles)
 */
export function analyzeH2HRecency(h2hList: unknown[]): {
  total_encounters: number;
  recent_1year_count: number;
  recent_2years_count: number;
  stale_over_2years_count: number;
  recency_verdict: 'HIGH_VALIDITY' | 'MODERATE_DECAY' | 'STALE_ZERO_WEIGHT' | 'NO_H2H_DATA';
  guidance_note: string;
} {
  const list = Array.isArray(h2hList) ? h2hList : [];
  if (list.length === 0) {
    return {
      total_encounters: 0,
      recent_1year_count: 0,
      recent_2years_count: 0,
      stale_over_2years_count: 0,
      recency_verdict: 'NO_H2H_DATA',
      guidance_note: '暂无历史交锋数据，需完全依赖近期基本面、阵容与盘口价值。',
    };
  }

  const currentYear = new Date().getFullYear();
  let recent1 = 0;
  let recent2 = 0;
  let stale = 0;

  for (const item of list) {
    let year = 0;
    if (typeof item === 'object' && item !== null) {
      const d = (item as any).match_date || (item as any).date || (item as any).match_time || (item as any).time;
      if (typeof d === 'string') {
        const m = d.match(/(\d{4})/);
        if (m) year = parseInt(m[1], 10);
      } else if (typeof d === 'number') {
        const ts = d > 1e11 ? d : d * 1000;
        year = new Date(ts).getFullYear();
      }
    }
    if (year > 0) {
      const diff = currentYear - year;
      if (diff <= 1) recent1++;
      else if (diff === 2) recent2++;
      else stale++;
    } else {
      // Default assume medium if unstated
      recent2++;
    }
  }

  let verdict: 'HIGH_VALIDITY' | 'MODERATE_DECAY' | 'STALE_ZERO_WEIGHT' | 'NO_H2H_DATA' = 'MODERATE_DECAY';
  let note = '';

  if (stale > 0 && recent1 === 0 && recent2 === 0) {
    verdict = 'STALE_ZERO_WEIGHT';
    note = `历史交锋共${list.length}场，全部发生于2年前。因主帅、球员阵容已彻底更迭，交锋数据已失去统计预测意义，严禁作为让球/大小球核心依据。`;
  } else if (recent1 >= 2) {
    verdict = 'HIGH_VALIDITY';
    note = `近1年内有${recent1}次直接交锋，战术克制与阵容对位延续性高，可作为有效佐证指标。`;
  } else {
    verdict = 'MODERATE_DECAY';
    note = `历史交锋中近1年样本较少(${recent1}场)，历史数据存在时间衰减，必须以近期联赛状态与即时阵容为主。`;
  }

  return {
    total_encounters: list.length,
    recent_1year_count: recent1,
    recent_2years_count: recent2,
    stale_over_2years_count: stale,
    recency_verdict: verdict,
    guidance_note: note,
  };
}

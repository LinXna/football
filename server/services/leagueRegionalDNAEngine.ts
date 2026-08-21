/**
 * Comprehensive League Tier & Regional Tactical DNA Taxonomy
 * 全球五大联赛、美洲联赛、次级联赛、各洲杯赛与赛事性质战术量化基因库
 */

export interface LeagueRegionalProfile {
  league_key: string;
  league_name_zh: string;
  region: 'WESTERN_EUROPE' | 'SOUTHERN_EUROPE' | 'NORTHERN_EUROPE' | 'EASTERN_EUROPE' | 'LATIN_AMERICA' | 'NORTH_AMERICA' | 'ASIA_PACIFIC' | 'AUSTRALIA' | 'INTERNATIONAL_CUP';
  tier_category: 'TIER_1_TOP_LEAGUE' | 'TIER_2_SECOND_DIVISION' | 'LOWER_OR_YOUTH_OR_FRIENDLY' | 'DOMESTIC_CUP_KNOCKOUT' | 'CONTINENTAL_CUP';
  pace_and_goals_tendency: 'HIGH_GOAL_OPEN' | 'LOW_GOAL_ATTRITION' | 'PHYSICAL_HIGH_CORNER' | 'TACTICAL_BALANCED' | 'VOLATILE_ROTATION_HEAVY';
  tactical_dna_summary_zh: string;
  corner_propensity_zh: string;
  rotation_and_motivation_risk_zh: string;
  betting_risk_guard_zh: string;
}

export const REGIONAL_TACTICAL_ENCYCLOPEDIA: Record<string, LeagueRegionalProfile> = {
  // ========================================================
  // 1. 欧洲五大联赛 (Top 5 European Leagues)
  // ========================================================
  'ENG_PR': {
    league_key: 'ENG_PR',
    league_name_zh: '英格兰超级联赛 (英超)',
    region: 'WESTERN_EUROPE',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'TACTICAL_BALANCED',
    tactical_dna_summary_zh: '全球最高强度对抗与快节奏转换，高位逼抢执行度极高，裁判对抗尺度相对宽松，攻防折返频繁。',
    corner_propensity_zh: '两翼下底与倒三角传中多，射门封堵率高，场均角球 10.2+ (高角球倾向)。',
    rotation_and_motivation_risk_zh: '周中欧战多线作战豪门存在轮换疲劳；保级队赛季后半段主场搏命战意极强。',
    betting_risk_guard_zh: '盘口定价极深且极度高效，避开无实质攻防优势的盲目跟热；防范欧战周前后的强队赢球输盘。',
  },
  'ESP_LALIGA': {
    league_key: 'ESP_LALIGA',
    league_name_zh: '西班牙足球甲级联赛 (西甲)',
    region: 'SOUTHERN_EUROPE',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'LOW_GOAL_ATTRITION',
    tactical_dna_summary_zh: '强调脚下控球传导、战术纪律与中低位联防，犯规吹罚严苛哨声较多，有效攻防推进偏慢。中下游球队摆大巴能力极强。',
    corner_propensity_zh: '中场阵地渗透多，起高球传中偏少，角球总体偏中低 (场均 8.8~9.2)。',
    rotation_and_motivation_risk_zh: '皇马/巴萨/马竞三强具有绝对统治力，其余中游梯队实力接近，胜负胶着。',
    betting_risk_guard_zh: '小球与 1-0/2-0/1-1 比分高发；中下游对决谨慎追大球；强队客场让 -1.5 需严防 1 球小胜赢球输盘。',
  },
  'GER_BUN': {
    league_key: 'GER_BUN',
    league_name_zh: '德国足球甲级联赛 (德甲)',
    region: 'WESTERN_EUROPE',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'HIGH_GOAL_OPEN',
    tactical_dna_summary_zh: '全攻全守、大开大合的德式垂直压迫风格，攻防转换速度极快，后防空间开阔，单场期望进球数冠绝五大联赛 (场均 3.1+ 球)。',
    corner_propensity_zh: '高速两翼冲击与反击直塞多，两端射门频率高，角球与进球双高。',
    rotation_and_motivation_risk_zh: '战术风格激进，落后方极少消极保平，往往大举反扑导致比分进一步扩大。',
    betting_risk_guard_zh: '大球盘口基准通常开在 3.0/3.5，必须结合现场射正转化率研判；避免在激进对攻局盲目追小球。',
  },
  'ITA_SERIEA': {
    league_key: 'ITA_SERIEA',
    league_name_zh: '意大利足球甲级联赛 (意甲)',
    region: 'SOUTHERN_EUROPE',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'TACTICAL_BALANCED',
    tactical_dna_summary_zh: '极度注重战术阵型针对性布置，三中卫体系（3-5-2 / 3-4-2-1）广泛应用，中场绞杀与肋部阻截严密。',
    corner_propensity_zh: '战术角球与定位球攻防研判深度极高，角球产出中等。',
    rotation_and_motivation_risk_zh: '领先 1 球后老牌强队极具控场、消磨节奏能力（下半场常陷入催眠控球）。',
    betting_risk_guard_zh: '优势方领先后控节奏保胜倾向明显，滚球 1-0/2-0 时严防进攻节奏骤降。',
  },
  'FRA_LIGUE1': {
    league_key: 'FRA_LIGUE1',
    league_name_zh: '法国足球甲级联赛 (法甲)',
    region: 'WESTERN_EUROPE',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'LOW_GOAL_ATTRITION',
    tactical_dna_summary_zh: '身体素质强悍，中前场单兵爆破多而整体战术配合稍糙，中下游球队防守凶悍，半场进球数偏低。',
    corner_propensity_zh: '单兵突破造角球偏多，但中路抢点转化率一般。',
    rotation_and_motivation_risk_zh: '除大巴黎外各队得分能力均有限，客场进球率偏低。',
    betting_risk_guard_zh: '半场 0-0 (HT Draw) 及全场小球概率高，强弱对话中非巴黎比赛深盘难穿。',
  },

  // ========================================================
  // 2. 北美联赛 (美国大联盟 MLS / 美乙 / 墨联)
  // ========================================================
  'USA_MLS': {
    league_key: 'USA_MLS',
    league_name_zh: '美国职业足球大联盟 (MLS / 美职联)',
    region: 'NORTH_AMERICA',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'HIGH_GOAL_OPEN',
    tactical_dna_summary_zh: '重攻轻守、大开大合，无降级压力，引援集中于明星前场外援而后防多为本土平庸配置，防线漏洞大、互爆进球极多。',
    corner_propensity_zh: '攻防折返频繁，后卫解围失误多，角球数量高。',
    rotation_and_motivation_risk_zh: '主客场跨时区、长途飞行影响极大（主场优势异常显著）；季后赛席位争夺期大比分频出。',
    betting_risk_guard_zh: '全场大球 (Over 2.5/3.0) 与双方进球 (BTTS) 概率高；极少出现 0-0 互交白卷；客场作战强队慎让深盘。',
  },
  'MEX_LIGA_MX': {
    league_key: 'MEX_LIGA_MX',
    league_name_zh: '墨西哥足球超级联赛 (墨超 Liga MX)',
    region: 'NORTH_AMERICA',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'TACTICAL_BALANCED',
    tactical_dna_summary_zh: '高原主场优势巨大，小范围脚下配合精湛，身体对抗与火药味浓厚，主场胜率极高。',
    corner_propensity_zh: '定位球与远射折射角球中等偏高。',
    rotation_and_motivation_risk_zh: '春季/秋季附加赛（Liguilla）赛制下淘汰赛阶段战术趋向保守。',
    betting_risk_guard_zh: '关注海拔与高原客场体能衰竭；常规赛大球、淘汰赛首回合小球。',
  },

  // ========================================================
  // 3. 次级联赛与大开大合欧洲联赛 (荷乙 / 德乙 / 瑞士甲 / 挪超 / 瑞典超)
  // ========================================================
  'NED_D2': {
    league_key: 'NED_D2',
    league_name_zh: '荷兰乙级联赛 / 荷甲荷乙体系',
    region: 'WESTERN_EUROPE',
    tier_category: 'TIER_2_SECOND_DIVISION',
    pace_and_goals_tendency: 'HIGH_GOAL_OPEN',
    tactical_dna_summary_zh: '崇尚全攻全守，后防前压严重、盯人松散，青年军重练兵，大比分对攻互爆极多。',
    corner_propensity_zh: '攻防转换极快，两翼边锋传中频繁，角球动能极高。',
    rotation_and_motivation_risk_zh: '青年队（阿贾克斯/埃因霍温青年等）无升级资格，不控节奏只求刷进攻。',
    betting_risk_guard_zh: '避免盲目追小球；让深盘强队若后防失误易丢球，谨慎单挑让球赢盘。',
  },
  'ENG_CHA': {
    league_key: 'ENG_CHA',
    league_name_zh: '英格兰冠军联赛 (英冠) / 英甲英乙',
    region: 'WESTERN_EUROPE',
    tier_category: 'TIER_2_SECOND_DIVISION',
    pace_and_goals_tendency: 'PHYSICAL_HIGH_CORNER',
    tactical_dna_summary_zh: '46轮魔鬼赛程，高密度肉搏对抗，长传冲吊与二点球拼抢激烈，球员体能消耗极大。',
    corner_propensity_zh: '高空争顶解围与边路折射极多，属于角球高发赛区。',
    rotation_and_motivation_risk_zh: '一周双赛常态化，阵容深度不足球队在下半场 65\'+ 体能崩塌严重。',
    betting_risk_guard_zh: '冷门高发联赛，任何客场深盘均需严防；重视体能透支期的终局进球。',
  },
  'NOR_ALL': {
    league_key: 'NOR_ALL',
    league_name_zh: '挪威超级/甲级 / 瑞典超瑞典甲 (北欧联赛体系)',
    region: 'NORTHERN_EUROPE',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'PHYSICAL_HIGH_CORNER',
    tactical_dna_summary_zh: '身材高大对抗硬朗，长传高空轰炸比例高，人工草皮场地球速快。',
    corner_propensity_zh: '全球角球最高发赛区之一 (场均角球 10.5+)。',
    rotation_and_motivation_risk_zh: '严寒/人工草皮主场对技术型客队抑制极大。',
    betting_risk_guard_zh: '重视角球大盘动能；深盘客场豪门易遭低位反击阻击。',
  },

  // ========================================================
  // 4. 南美联赛 (阿甲 / 哥伦甲 / 巴西甲 / 乌拉甲 / 智利甲)
  // ========================================================
  'LATIN_AMERICA_GENERAL': {
    league_key: 'LATIN_AMERICA_GENERAL',
    league_name_zh: '南美甲级/乙级 (阿甲/哥伦甲/乌拉甲/巴甲/智利甲等)',
    region: 'LATIN_AMERICA',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'LOW_GOAL_ATTRITION',
    tactical_dna_summary_zh: '拼抢激烈、战术犯规多、裁判哨碎、有效比赛净时间低，中后场低位绞杀严重。',
    corner_propensity_zh: '中场阵地肉搏多，进攻推进慢，角球偏中低。',
    rotation_and_motivation_risk_zh: '狂热主场与客场极端拖延保平战术盛行。',
    betting_risk_guard_zh: '小球与半场平局 (HT 0-0) 概率极高；严禁仅凭名气推让深盘 (-1.5 以上极难穿盘)。',
  },

  // ========================================================
  // 5. 东亚与澳洲联赛 (日职 / 日乙 / 韩K联 / 澳超)
  // ========================================================
  'ASIA_J_K_LEAGUES': {
    league_key: 'ASIA_J_K_LEAGUES',
    league_name_zh: '日职联 / 日乙 / 韩K联 / 东亚赛事体系',
    region: 'ASIA_PACIFIC',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'TACTICAL_BALANCED',
    tactical_dna_summary_zh: '战术纪律严明，整体阵型保持极佳；日职强调地面短传控球，韩K强调身体逼抢与边路冲击。',
    corner_propensity_zh: '战术角球比例高，下半场反击角球增加。',
    rotation_and_motivation_risk_zh: '夏令高温战役体能下滑快；领先方普遍具备成熟控节奏保胜能力。',
    betting_risk_guard_zh: '1-0 / 2-0 / 1-1 小比分居多；领先 1 球后优势方常降速收缩，避免盲目追深盘。',
  },
  'AUS_A_LEAGUE': {
    league_key: 'AUS_A_LEAGUE',
    league_name_zh: '澳大利亚超级联赛 (澳超 A-League)',
    region: 'AUSTRALIA',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'HIGH_GOAL_OPEN',
    tactical_dna_summary_zh: '无降级制度，打法奔放不保守，后防盯人粗糙，下半场体能下滑后进球与角球激增。',
    corner_propensity_zh: '边路英式传中多，角球数量常破 11+。',
    rotation_and_motivation_risk_zh: '常规赛末段队伍战意分化严重。',
    betting_risk_guard_zh: '下半场 70\'+ 破门与大球概率高；半场逆转局频出。',
  },

  // ========================================================
  // 6. 杯赛 / 淘汰赛 / 欧战 (欧冠 / 亚冠 / 联赛杯)
  // ========================================================
  'CUP_KNOCKOUT': {
    league_key: 'CUP_KNOCKOUT',
    league_name_zh: '国内杯赛 / 洲际杯赛 / 单场决胜淘汰赛',
    region: 'INTERNATIONAL_CUP',
    tier_category: 'DOMESTIC_CUP_KNOCKOUT',
    pace_and_goals_tendency: 'VOLATILE_ROTATION_HEAVY',
    tactical_dna_summary_zh: '赛制决定战术：总比分落后或单场淘汰制下，下半场落后方必然全线压上搏命，易引发进球潮或后防惨案。',
    corner_propensity_zh: '落后方全员堆积前场，易引发极限角球挤压 (Corner Squeeze)。',
    rotation_and_motivation_risk_zh: '豪门在早轮杯赛常进行 5~8 人轮换，首发阵容未确认前严禁作为正式 A 级推荐！',
    betting_risk_guard_zh: '落后 1 球时严禁追小球；豪门低战意时严防冷门与下盘赢盘。',
  },

  // ========================================================
  // 7. 青年联赛 / 预备队 / 友谊赛
  // ========================================================
  'YOUTH_OR_FRIENDLY': {
    league_key: 'YOUTH_OR_FRIENDLY',
    league_name_zh: '青年联赛 (U19/U21/U23) / 预备队 / 俱乐部友谊赛',
    region: 'INTERNATIONAL_CUP',
    tier_category: 'LOWER_OR_YOUTH_OR_FRIENDLY',
    pace_and_goals_tendency: 'HIGH_GOAL_OPEN',
    tactical_dna_summary_zh: '技战术阵型保持度差，年轻球员防守毛躁易犯低级失误，防线极易崩溃，互爆进球多。',
    corner_propensity_zh: '攻防节奏无拘无束，射门与角球随意性大。',
    rotation_and_motivation_risk_zh: '换人无上限或半场全员更换，胜负战意极其飘忽，缺乏硬性风控安全边际。',
    betting_risk_guard_zh: '系统硬性风控：友谊赛/青年赛最高限制 C 级，严禁进入正式核心串关！',
  },

  // ========================================================
  // 8. 默认常规职业联赛
  // ========================================================
  'STANDARD_LEAGUE': {
    league_key: 'STANDARD_LEAGUE',
    league_name_zh: '常规职业联赛',
    region: 'WESTERN_EUROPE',
    tier_category: 'TIER_1_TOP_LEAGUE',
    pace_and_goals_tendency: 'TACTICAL_BALANCED',
    tactical_dna_summary_zh: '常规职业攻防战术体系，遵循基本面与实时物理攻防推演。',
    corner_propensity_zh: '由双方阵型与三区压迫倾角决定。',
    rotation_and_motivation_risk_zh: '依据积分榜保级/争冠战意差值评估。',
    betting_risk_guard_zh: '严格比对净胜球预期与盘口门槛，寻找正期望值 (+EV)。',
  },
};

/**
 * Match league name against Regional Tactical Encyclopedia
 */
export function detectLeagueRegionalDNA(leagueName: string = ''): LeagueRegionalProfile {
  const l = (leagueName || '').toLowerCase();

  // 1. Youth & Friendly
  if (/u19|u20|u21|u23|youth|青年|预备|友谊|friendly|club friend/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['YOUTH_OR_FRIENDLY'];
  }

  // 2. Cup Knockouts (Domestic & Continental)
  if (/cup|copa|pokal|coppa|coupe|杯|淘汰|champions league|europa|uefa|欧冠|欧联|亚冠|解放者|libertadores|concacaf/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['CUP_KNOCKOUT'];
  }

  // 3. Top 5 European Leagues
  // 3.1 Premier League
  if (/英格兰超级|英超|premier league|epl|premier/i.test(l) && !/women|u21|u18/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['ENG_PR'];
  }
  // 3.2 La Liga
  if (/西班牙甲|西甲|laliga|la liga|primera division/i.test(l) && !/women|u21/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['ESP_LALIGA'];
  }
  // 3.3 Bundesliga
  if (/德国甲|德甲|bundesliga/i.test(l) && !/2\. bundesliga|women/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['GER_BUN'];
  }
  // 3.4 Serie A
  if (/意大利甲|意甲|serie a/i.test(l) && !/women|serie b|brasil/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['ITA_SERIEA'];
  }
  // 3.5 Ligue 1
  if (/法国甲|法甲|ligue 1/i.test(l) && !/women|ligue 2/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['FRA_LIGUE1'];
  }

  // 4. North America (MLS, USL, Liga MX)
  if (/mls|major league soccer|美职|美国职业|usl|美乙/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['USA_MLS'];
  }
  if (/墨超|墨西哥|liga mx|ascenso/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['MEX_LIGA_MX'];
  }

  // 5. Australia A-League
  if (/澳超|a-league|australia/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['AUS_A_LEAGUE'];
  }

  // 6. English Championship / League One
  if (/英冠|英甲|英乙|championship|league one|league two/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['ENG_CHA'];
  }

  // 7. Netherlands / Dutch / Swiss / German 2nd Div
  if (/荷乙|荷甲|eerste|eredivisie|netherlands|holland|瑞士甲|瑞士超|德乙|2\. bundesliga|austria|奥甲|奥乙/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['NED_D2'];
  }

  // 8. Nordic (Norway, Sweden, Finland, Iceland, Denmark)
  if (/挪超|挪甲|norway|eliteserien|obos|瑞典超|瑞典甲|sweden|allsvenskan|superettan|芬超|芬甲|冰岛|丹麦|denmark/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['NOR_ALL'];
  }

  // 9. Latin America (Argentina, Colombia, Brazil, Uruguay, Chile, Peru, Bolivia, Ecuador)
  if (/阿甲|阿乙|argentina|primera nacional|哥伦|colombia|乌拉|uruguay|巴西|brazil|serie b|serie c|智利|chile|秘鲁|peru|玻利维亚|bolivia|巴拉圭|paraguay|厄瓜多尔|ecuador/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['LATIN_AMERICA_GENERAL'];
  }

  // 10. Asia (J-League, K-League, CSL, Thai, Saudi)
  if (/日职|日乙|j1|j2|j3|japan|韩k|k league|k1|k2|korea|中超|中甲|泰超|沙特|saudi|pro league/i.test(l)) {
    return REGIONAL_TACTICAL_ENCYCLOPEDIA['ASIA_J_K_LEAGUES'];
  }

  return REGIONAL_TACTICAL_ENCYCLOPEDIA['STANDARD_LEAGUE'];
}

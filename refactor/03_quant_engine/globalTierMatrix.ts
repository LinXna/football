/**
 * 全球全量联赛与国家队档次矩阵及启发式推断引擎 (Global League & National Team Tier Matrix)
 * 
 * 作用：
 * 1. 覆盖 UEFA / CONMEBOL / AFC / CONCACAF / CAF / OFC 全球六大洲国家队 (Tier 1 ~ Tier 5)；
 * 2. 覆盖全球各级主流、次级与低级别职业/青年联赛 (Tier 1 ~ Tier 5)；
 * 3. 提供 100% 完备的启发式推断引擎 (Heuristic Tier Inference)，确保任意未知对手均能被合理定级；
 * 4. 导出纯函数，提供对战层级归一化攻防基准系数 (Strength-Adjusted Benchmark Multiplier)。
 */

export enum FootballTier {
  TIER_1 = 1, // 世界/洲际顶级豪门 / 五大联赛顶级 / 世界排名前列国家队
  TIER_2 = 2, // 洲际强队 / 欧洲二线主流联赛 / 洲际二档国家队
  TIER_3 = 3, // 洲际中游 / 五大联赛次级 / 洲际三档国家队
  TIER_4 = 4, // 洲际弱旅 / 低级别职业联赛 / 洲际四档国家队
  TIER_5 = 5  // 极弱鱼腩 / 业余/低阶青年/小国国家队
}

export interface TierProfile {
  tier: FootballTier;
  attack_strength_multiplier: number;  // 进攻基础倍率 (T1 ~ 1.45, T5 ~ 0.55)
  defense_toughness_multiplier: number; // 防守坚固倍率 (T1 ~ 1.40, T5 ~ 0.60)
  description: string;
}

export const TIER_PROFILES: Record<FootballTier, TierProfile> = Object.freeze({
  [FootballTier.TIER_1]: Object.freeze({
    tier: FootballTier.TIER_1,
    attack_strength_multiplier: 1.45,
    defense_toughness_multiplier: 1.40,
    description: '世界/洲际顶级'
  }),
  [FootballTier.TIER_2]: Object.freeze({
    tier: FootballTier.TIER_2,
    attack_strength_multiplier: 1.20,
    defense_toughness_multiplier: 1.18,
    description: '洲际强队/主流二线'
  }),
  [FootballTier.TIER_3]: Object.freeze({
    tier: FootballTier.TIER_3,
    attack_strength_multiplier: 1.00,
    defense_toughness_multiplier: 1.00,
    description: '洲际中游/次级标杆'
  }),
  [FootballTier.TIER_4]: Object.freeze({
    tier: FootballTier.TIER_4,
    attack_strength_multiplier: 0.80,
    defense_toughness_multiplier: 0.82,
    description: '洲际弱旅/低级别'
  }),
  [FootballTier.TIER_5]: Object.freeze({
    tier: FootballTier.TIER_5,
    attack_strength_multiplier: 0.55,
    defense_toughness_multiplier: 0.60,
    description: '鱼腩/业余/初级'
  })
});

/**
 * 显式国家队层级表 (涵盖全球六大洲主要国家队及常见译名)
 */
const NATIONAL_TEAM_TIERS: Record<string, FootballTier> = {
  // --- 欧洲 (UEFA) ---
  '法国': FootballTier.TIER_1, '西班牙': FootballTier.TIER_1, '英格兰': FootballTier.TIER_1,
  '德国': FootballTier.TIER_1, '葡萄牙': FootballTier.TIER_1, '荷兰': FootballTier.TIER_1,
  '意大利': FootballTier.TIER_1, '比利时': FootballTier.TIER_2, '克罗地亚': FootballTier.TIER_2,
  '丹麦': FootballTier.TIER_2, '瑞士': FootballTier.TIER_2, '奥地利': FootballTier.TIER_2,
  '土耳其': FootballTier.TIER_2, '波兰': FootballTier.TIER_3, '塞尔维亚': FootballTier.TIER_3,
  '乌克兰': FootballTier.TIER_3, '瑞典': FootballTier.TIER_3, '挪威': FootballTier.TIER_3,
  '捷克': FootballTier.TIER_3, '苏格兰': FootballTier.TIER_3, '匈牙利': FootballTier.TIER_3,
  '斯洛伐克': FootballTier.TIER_3, '罗马尼亚': FootballTier.TIER_3, '斯洛文尼亚': FootballTier.TIER_4,
  '希腊': FootballTier.TIER_4, '爱尔兰': FootballTier.TIER_4, '芬兰': FootballTier.TIER_4,
  '冰岛': FootballTier.TIER_4, '格鲁吉亚': FootballTier.TIER_4, '阿尔巴尼亚': FootballTier.TIER_4,
  '北马其顿': FootballTier.TIER_4, '波黑': FootballTier.TIER_4, '保加利亚': FootballTier.TIER_4,
  '卢森堡': FootballTier.TIER_4, '塞浦路斯': FootballTier.TIER_4, '法罗群岛': FootballTier.TIER_5,
  '直布罗陀': FootballTier.TIER_5, '圣马力诺': FootballTier.TIER_5, '安道尔': FootballTier.TIER_5,
  '列支敦士登': FootballTier.TIER_5, '马耳他': FootballTier.TIER_5, '摩尔多瓦': FootballTier.TIER_5,

  // --- 南美洲 (CONMEBOL) ---
  '阿根廷': FootballTier.TIER_1, '巴西': FootballTier.TIER_1,
  '乌拉圭': FootballTier.TIER_1, '哥伦比亚': FootballTier.TIER_2,
  '厄瓜多尔': FootballTier.TIER_2, '智利': FootballTier.TIER_3,
  '巴拉圭': FootballTier.TIER_3, '秘鲁': FootballTier.TIER_3,
  '委内瑞拉': FootballTier.TIER_3, '玻利维亚': FootballTier.TIER_4,

  // --- 亚洲 (AFC) ---
  '日本': FootballTier.TIER_1, '韩国': FootballTier.TIER_1, '伊朗': FootballTier.TIER_1,
  '沙特阿拉伯': FootballTier.TIER_1, '沙特': FootballTier.TIER_1, '澳大利亚': FootballTier.TIER_1,
  '乌兹别克斯坦': FootballTier.TIER_1, // 亚洲青年/成年新贵，U23 亚洲霸主级别
  '卡塔尔': FootballTier.TIER_2, '阿联酋': FootballTier.TIER_2, '伊拉克': FootballTier.TIER_2,
  '约旦': FootballTier.TIER_2, '阿曼': FootballTier.TIER_2, '巴林': FootballTier.TIER_2,
  '越南': FootballTier.TIER_2, // 东南亚头部 / 亚洲 T2 边缘
  '泰国': FootballTier.TIER_2, // 东南亚头部
  '中国': FootballTier.TIER_3, '叙利亚': FootballTier.TIER_3, '印度尼西亚': FootballTier.TIER_3,
  '印尼': FootballTier.TIER_3, '马来西亚': FootballTier.TIER_3, '塔吉克斯坦': FootballTier.TIER_3,
  '吉尔吉斯斯坦': FootballTier.TIER_3, '科威特': FootballTier.TIER_3, '黎巴嫩': FootballTier.TIER_3,
  '巴勒斯坦': FootballTier.TIER_3, '朝鲜': FootballTier.TIER_3,
  '菲律宾': FootballTier.TIER_4, '印度': FootballTier.TIER_4, '土库曼斯坦': FootballTier.TIER_4,
  '中国香港': FootballTier.TIER_4, '新加坡': FootballTier.TIER_4, '也门': FootballTier.TIER_4,
  '缅甸': FootballTier.TIER_4, '阿富汗': FootballTier.TIER_4, '马尔代夫': FootballTier.TIER_4,
  '中国台北': FootballTier.TIER_5, '尼泊尔': FootballTier.TIER_5, '柬埔寨': FootballTier.TIER_5,
  '老挝': FootballTier.TIER_5, '孟加拉国': FootballTier.TIER_5, '不丹': FootballTier.TIER_5,
  '文莱': FootballTier.TIER_5, '关岛': FootballTier.TIER_5, '东帝汶': FootballTier.TIER_5,
  '斯里兰卡': FootballTier.TIER_5, '蒙古': FootballTier.TIER_5, '巴基斯坦': FootballTier.TIER_5,

  // --- 非洲 (CAF) ---
  '摩洛哥': FootballTier.TIER_1, '塞内加尔': FootballTier.TIER_1, '尼日利亚': FootballTier.TIER_1,
  '埃及': FootballTier.TIER_2, '科特迪瓦': FootballTier.TIER_2, '阿尔及利亚': FootballTier.TIER_2,
  '喀麦隆': FootballTier.TIER_2, '突尼斯': FootballTier.TIER_2, '马里': FootballTier.TIER_2,
  '加纳': FootballTier.TIER_2, '南非': FootballTier.TIER_3, '刚果民主共和国': FootballTier.TIER_3,
  '布基纳法索': FootballTier.TIER_3, '几内亚': FootballTier.TIER_3, '佛得角': FootballTier.TIER_3,
  '赞比亚': FootballTier.TIER_3, '安哥拉': FootballTier.TIER_3, '乌干达': FootballTier.TIER_4,
  '贝宁': FootballTier.TIER_4, '毛里塔尼亚': FootballTier.TIER_4, '肯尼亚': FootballTier.TIER_4,
  '塞舌尔': FootballTier.TIER_5, '吉布提': FootballTier.TIER_5, '索马里': FootballTier.TIER_5,

  // --- 中北美洲 (CONCACAF) ---
  '美国': FootballTier.TIER_1, '墨西哥': FootballTier.TIER_1,
  '加拿大': FootballTier.TIER_2, '巴拿马': FootballTier.TIER_2, '哥斯达黎加': FootballTier.TIER_2,
  '牙买加': FootballTier.TIER_3, '洪都拉斯': FootballTier.TIER_3, '萨尔瓦多': FootballTier.TIER_3,
  '特立尼达和多巴哥': FootballTier.TIER_4, '危地马拉': FootballTier.TIER_4, '海地': FootballTier.TIER_4,
  '巴巴多斯': FootballTier.TIER_5, '开曼群岛': FootballTier.TIER_5, '巴哈马': FootballTier.TIER_5,

  // --- 大洋洲 (OFC) ---
  '新西兰': FootballTier.TIER_2, '新喀里多尼亚': FootballTier.TIER_4, '斐济': FootballTier.TIER_4,
  '所罗门群岛': FootballTier.TIER_4, '瓦努阿图': FootballTier.TIER_4, '塔希提': FootballTier.TIER_5,
  '美属萨摩亚': FootballTier.TIER_5, '汤加': FootballTier.TIER_5
};

/**
 * 显式全球知名俱乐部层级表 (涵盖欧洲五大联赛、洲际主流强队与豪门)
 */
const CLUB_TIERS: Record<string, FootballTier> = {
  // --- 欧洲 T1 超级豪门 ---
  '皇家马德里': FootballTier.TIER_1, '皇马': FootballTier.TIER_1, 'Real Madrid': FootballTier.TIER_1,
  '曼彻斯特城': FootballTier.TIER_1, '曼城': FootballTier.TIER_1, 'Manchester City': FootballTier.TIER_1,
  '阿森纳': FootballTier.TIER_1, 'Arsenal': FootballTier.TIER_1,
  '拜仁慕尼黑': FootballTier.TIER_1, '拜仁': FootballTier.TIER_1, 'Bayern Munich': FootballTier.TIER_1,
  '巴塞罗那': FootballTier.TIER_1, '巴萨': FootballTier.TIER_1, 'Barcelona': FootballTier.TIER_1,
  '利物浦': FootballTier.TIER_1, 'Liverpool': FootballTier.TIER_1,
  '巴黎圣日耳曼': FootballTier.TIER_1, '巴黎': FootballTier.TIER_1, 'PSG': FootballTier.TIER_1,
  '国际米兰': FootballTier.TIER_1, '国米': FootballTier.TIER_1, 'Inter': FootballTier.TIER_1,

  // --- 欧洲/美洲 T2 洲际劲旅 ---
  '马德里竞技': FootballTier.TIER_2, '马竞': FootballTier.TIER_2, 'Atletico Madrid': FootballTier.TIER_2,
  '勒沃库森': FootballTier.TIER_2, 'Leverkusen': FootballTier.TIER_2,
  '多特蒙德': FootballTier.TIER_2, '多特': FootballTier.TIER_2, 'Dortmund': FootballTier.TIER_2,
  '切尔西': FootballTier.TIER_2, 'Chelsea': FootballTier.TIER_2,
  '曼彻斯特联': FootballTier.TIER_2, '曼联': FootballTier.TIER_2, 'Manchester United': FootballTier.TIER_2,
  '托特纳姆热刺': FootballTier.TIER_2, '热刺': FootballTier.TIER_2, 'Tottenham': FootballTier.TIER_2,
  '纽卡斯尔联': FootballTier.TIER_2, '纽卡斯尔': FootballTier.TIER_2, 'Newcastle': FootballTier.TIER_2,
  '阿斯顿维拉': FootballTier.TIER_2, '维拉': FootballTier.TIER_2, 'Aston Villa': FootballTier.TIER_2,
  'AC米兰': FootballTier.TIER_2, '米兰': FootballTier.TIER_2, 'Milan': FootballTier.TIER_2,
  '尤文图斯': FootballTier.TIER_2, '尤文': FootballTier.TIER_2, 'Juventus': FootballTier.TIER_2,
  '亚特兰大': FootballTier.TIER_2, 'Atalanta': FootballTier.TIER_2,
  '那不勒斯': FootballTier.TIER_2, 'Napoli': FootballTier.TIER_2,
  '罗马': FootballTier.TIER_2, 'Roma': FootballTier.TIER_2,
  '拉齐奥': FootballTier.TIER_2, 'Lazio': FootballTier.TIER_2,
  '里斯本竞技': FootballTier.TIER_2, '葡萄牙体育': FootballTier.TIER_2, 'Sporting CP': FootballTier.TIER_2,
  '本菲卡': FootballTier.TIER_2, 'Benfica': FootballTier.TIER_2,
  '波尔图': FootballTier.TIER_2, 'Porto': FootballTier.TIER_2,
  '埃因霍温': FootballTier.TIER_2, 'PSV': FootballTier.TIER_2,
  '阿贾克斯': FootballTier.TIER_2, 'Ajax': FootballTier.TIER_2,
  '费耶诺德': FootballTier.TIER_2, 'Feyenoord': FootballTier.TIER_2,
  '弗拉门戈': FootballTier.TIER_2, '帕尔梅拉斯': FootballTier.TIER_2, '河床': FootballTier.TIER_2, '博卡青年': FootballTier.TIER_2,
  '利雅得新月': FootballTier.TIER_2, '利雅得胜利': FootballTier.TIER_2, '吉达联合': FootballTier.TIER_2,

  // --- 亚洲 T3 强队 ---
  '神户胜利船': FootballTier.TIER_3, '横滨水手': FootballTier.TIER_3, '川崎前锋': FootballTier.TIER_3,
  '蔚山HD': FootballTier.TIER_3, '全北现代': FootballTier.TIER_3, '浦项铁人': FootballTier.TIER_3,
  '上海海港': FootballTier.TIER_3, '上海申花': FootballTier.TIER_3, '山东泰山': FootballTier.TIER_3
};

/**
 * 显式全球联赛/杯赛层级表
 */
const LEAGUE_TIERS: Record<string, FootballTier> = {
  // --- T1: 全球顶级联赛与欧冠 ---
  '欧洲冠军联赛': FootballTier.TIER_1, '欧冠': FootballTier.TIER_1, 'UEFA Champions League': FootballTier.TIER_1,
  '英格兰超级联赛': FootballTier.TIER_1, '英超': FootballTier.TIER_1, 'Premier League': FootballTier.TIER_1,
  '西班牙甲组联赛': FootballTier.TIER_1, '西甲': FootballTier.TIER_1, 'La Liga': FootballTier.TIER_1,
  '德国甲组联赛': FootballTier.TIER_1, '德甲': FootballTier.TIER_1, 'Bundesliga': FootballTier.TIER_1,
  '意大利甲组联赛': FootballTier.TIER_1, '意甲': FootballTier.TIER_1, 'Serie A': FootballTier.TIER_1,
  '世界杯': FootballTier.TIER_1, '欧洲杯': FootballTier.TIER_1, '美洲杯': FootballTier.TIER_1,

  // --- T2: 次顶级联赛、欧联、南美解放者杯 ---
  '法国甲组联赛': FootballTier.TIER_2, '法甲': FootballTier.TIER_2, 'Ligue 1': FootballTier.TIER_2,
  '欧罗巴联赛': FootballTier.TIER_2, '欧联': FootballTier.TIER_2, 'Europa League': FootballTier.TIER_2,
  '葡萄牙超级联赛': FootballTier.TIER_2, '葡超': FootballTier.TIER_2, 'Primeira Liga': FootballTier.TIER_2,
  '荷兰甲组联赛': FootballTier.TIER_2, '荷甲': FootballTier.TIER_2, 'Eredivisie': FootballTier.TIER_2,
  '巴西甲组联赛': FootballTier.TIER_2, '巴甲': FootballTier.TIER_2, 'Brasileirao': FootballTier.TIER_2,
  '阿根廷甲级联赛': FootballTier.TIER_2, '阿甲': FootballTier.TIER_2,
  '南美解放者杯': FootballTier.TIER_2, 'Copa Libertadores': FootballTier.TIER_2,
  '亚洲杯': FootballTier.TIER_2, '非洲国家杯': FootballTier.TIER_2, '中北美金杯赛': FootballTier.TIER_2,
  '奥运男足': FootballTier.TIER_2,

  // --- T3: 欧洲五大联赛次级、主流洲际次级联赛、亚运/U23亚洲杯 ---
  '英格兰冠军联赛': FootballTier.TIER_3, '英冠': FootballTier.TIER_3, 'Championship': FootballTier.TIER_3,
  '德国乙组联赛': FootballTier.TIER_3, '德乙': FootballTier.TIER_3, '2. Bundesliga': FootballTier.TIER_3,
  '西班牙乙级联赛': FootballTier.TIER_3, '西乙': FootballTier.TIER_3, 'Segunda Division': FootballTier.TIER_3,
  '意大利乙组联赛': FootballTier.TIER_3, '意乙': FootballTier.TIER_3, 'Serie B': FootballTier.TIER_3,
  '土耳其超级联赛': FootballTier.TIER_3, '土超': FootballTier.TIER_3,
  '比利时甲组联赛': FootballTier.TIER_3, '比甲': FootballTier.TIER_3,
  '沙特阿拉伯职业联赛': FootballTier.TIER_3, '沙特联': FootballTier.TIER_3,
  '美国职业大联盟': FootballTier.TIER_3, '美职联': FootballTier.TIER_3, 'MLS': FootballTier.TIER_3,
  '日本职业甲级联赛': FootballTier.TIER_3, 'J1联赛': FootballTier.TIER_3, '日职联': FootballTier.TIER_3,
  '韩国职业甲级联赛': FootballTier.TIER_3, 'K联赛': FootballTier.TIER_3, '韩K联': FootballTier.TIER_3,
  'U23亚洲杯': FootballTier.TIER_3, '亚运男足': FootballTier.TIER_3, '欧洲协会联赛': FootballTier.TIER_3,
  '欧协联': FootballTier.TIER_3, '南美杯': FootballTier.TIER_3, '亚洲冠军联赛': FootballTier.TIER_3,
  '亚冠': FootballTier.TIER_3, '亚冠精英联赛': FootballTier.TIER_3,

  // --- T4: 欧洲中小联赛、亚洲/美洲中小联赛、东南亚U23 ---
  '中国足球协会超级联赛': FootballTier.TIER_4, '中超': FootballTier.TIER_4,
  '澳大利亚超级联赛': FootballTier.TIER_4, '澳超': FootballTier.TIER_4, 'A-League': FootballTier.TIER_4,
  '苏格兰超级联赛': FootballTier.TIER_4, '苏超': FootballTier.TIER_4,
  '瑞士超级联赛': FootballTier.TIER_4, '瑞超': FootballTier.TIER_4,
  '奥地利超级联赛': FootballTier.TIER_4, '奥超': FootballTier.TIER_4,
  '丹麦超级联赛': FootballTier.TIER_4, '丹超': FootballTier.TIER_4,
  '挪威超级联赛': FootballTier.TIER_4, '挪超': FootballTier.TIER_4,
  '瑞典超级联赛': FootballTier.TIER_4, '瑞典超': FootballTier.TIER_4,
  '俄罗斯超级联赛': FootballTier.TIER_4, '俄超': FootballTier.TIER_4,
  '墨西哥超级联赛': FootballTier.TIER_4, '墨超': FootballTier.TIER_4,
  '东南亚U23': FootballTier.TIER_4, '东南亚足球锦标赛': FootballTier.TIER_4, '铃木杯': FootballTier.TIER_4,
  '英格兰甲组联赛': FootballTier.TIER_4, '英甲': FootballTier.TIER_4,
  '法国乙组联赛': FootballTier.TIER_4, '法乙': FootballTier.TIER_4,

  // --- T5: 极低级别联赛、业余杯赛、青年预备队 ---
  '英格兰乙组联赛': FootballTier.TIER_5, '英乙': FootballTier.TIER_5,
  '德国丙组联赛': FootballTier.TIER_5, '德丙': FootballTier.TIER_5,
  '国际友谊': FootballTier.TIER_4, '球会友谊': FootballTier.TIER_5,
  '预备队联赛': FootballTier.TIER_5, '青年联赛': FootballTier.TIER_5
};

/**
 * 启发式推断引擎：当名称不在显式字典时，根据多维特征 100% 兜底推断层级
 */
export function resolveTeamTier(teamName: string, leagueName?: string): FootballTier {
  if (!teamName) return FootballTier.TIER_4;
  const cleanTeam = teamName.trim();

  // 1. 显式全字匹配 (俱乐部与国家队)
  if (CLUB_TIERS[cleanTeam]) {
    return CLUB_TIERS[cleanTeam];
  }
  if (NATIONAL_TEAM_TIERS[cleanTeam]) {
    return NATIONAL_TEAM_TIERS[cleanTeam];
  }

  // 2. 青年国字号提取核心国名 (如 "菲律宾U23" -> "菲律宾")
  const youthMatch = cleanTeam.match(/^(.+?)(U\d+|国奥|青年队|二队|预备队)$/i);
  if (youthMatch && youthMatch[1]) {
    const baseCountry = youthMatch[1].trim();
    if (NATIONAL_TEAM_TIERS[baseCountry]) {
      const parentTier = NATIONAL_TEAM_TIERS[baseCountry];
      // 青年队在父级国家队基础上视洲际格局做微调
      if (/乌兹别克/i.test(baseCountry)) return FootballTier.TIER_1; // 乌兹别克 U23 为亚洲霸主
      if (/越南|泰国/i.test(baseCountry)) return FootballTier.TIER_2;   // 越南 U23 东南亚王者
      if (/菲律宾|印尼|马来/i.test(baseCountry)) return FootballTier.TIER_4; // 菲律宾青年队基础弱
      return parentTier;
    }
  }

  // 3. 部分包含匹配 (如 "皇家马德里 [客]" -> "皇家马德里", "西班牙 [中]" -> "西班牙")
  for (const [key, tier] of Object.entries(CLUB_TIERS)) {
    if (cleanTeam.includes(key)) {
      return tier;
    }
  }
  for (const [key, tier] of Object.entries(NATIONAL_TEAM_TIERS)) {
    if (cleanTeam.includes(key)) {
      return tier;
    }
  }

  // 4. 根据所在赛事级别进行回退推断
  if (leagueName) {
    const leagueTier = resolveLeagueTier(leagueName);
    return Math.min(FootballTier.TIER_5, leagueTier + 1) as FootballTier;
  }

  // 5. 绝对保底：中游 TIER_3
  return FootballTier.TIER_3;
}

/**
 * 启发式推断引擎：解析赛事/联赛层级
 */
export function resolveLeagueTier(leagueName: string): FootballTier {
  if (!leagueName) return FootballTier.TIER_4;
  const clean = leagueName.trim();

  // 1. 显式匹配
  if (LEAGUE_TIERS[clean]) {
    return LEAGUE_TIERS[clean];
  }

  // 2. 词缀启发式规则
  for (const [key, tier] of Object.entries(LEAGUE_TIERS)) {
    if (clean.includes(key)) {
      return tier;
    }
  }

  // 3. 关键词模式匹配
  if (/欧冠|Champions League|世界杯|World Cup/i.test(clean)) return FootballTier.TIER_1;
  if (/欧联|Europa|解放者杯|亚冠|AFC Champions|英超|西甲|德甲|意甲|法甲/i.test(clean)) return FootballTier.TIER_2;
  if (/超级|Super|甲级|Primera|Serie A|Championship|英冠|德乙|意乙|西乙/i.test(clean)) return FootballTier.TIER_3;
  if (/乙级|联赛杯|League 1|锦标赛|Tournament|亚运|U23/i.test(clean)) return FootballTier.TIER_4;
  if (/友谊|Friendly|青年|Youth|U19|U21|预备|Reserve|丙级|业余/i.test(clean)) return FootballTier.TIER_5;

  return FootballTier.TIER_3;
}

/**
 * 获取队伍攻防基准配置
 */
export function getTeamStrengthProfile(teamName: string, leagueName?: string): TierProfile {
  const tier = resolveTeamTier(teamName, leagueName);
  return TIER_PROFILES[tier];
}

/**
 * 赛会制/青年队/杯赛 vs 常规联赛自适应时间回溯窗口与半衰期
 * 彻底解决青年队大赛两年一届导致 365 天一刀切物理抹杀历史样本的系统缺陷
 */
export function getAdaptiveLookbackWindow(leagueName?: string, homeName?: string, awayName?: string): { maxDays: number; halfLifeDays: number } {
  const combined = `${leagueName || ''} ${homeName || ''} ${awayName || ''}`;
  if (/U23|U21|U20|U19|杯|Cup|锦标|亚运|奥运|Asian Games|Tournament|国奥|青年|World Cup|Asian Cup|Euro|洲际/i.test(combined)) {
    return { maxDays: 1460, halfLifeDays: 365 };
  }
  return { maxDays: 365, halfLifeDays: 120 };
}


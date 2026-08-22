/**
 * Formation Tactical Analysis & Clash Dynamics Engine
 * 足球比赛常见阵型、战术与克制关系 集中解析与量化博弈引擎
 */

export type FormationType = 
  | '4-3-3'
  | '4-2-3-1'
  | '4-4-2'
  | '4-4-2-diamond'
  | '3-5-2'
  | '3-4-3'
  | '5-3-2'
  | '5-4-1'
  | '4-1-4-1'
  | '3-4-2-1'
  | '5-2-3'
  | '4-2-2-2'
  | 'UNKNOWN';

export interface FormationProfile {
  code: FormationType;
  name_zh: string;
  category: 'FOUR_BACK' | 'THREE_BACK' | 'FIVE_BACK';
  core_philosophy_zh: string;
  attacking_shape_zh: string;
  defensive_shape_zh: string;
  key_strengths_zh: string[];
  key_weaknesses_zh: string[];
  optimal_counters_zh: string[];
  tactical_dna: {
    midfield_count: number;
    forward_count: number;
    defender_count: number;
    flank_width_rating: number; // 1-10
    central_density_rating: number; // 1-10
    high_press_intensity: number; // 1-10
    low_block_resilience: number; // 1-10
    wingback_stamina_dependency: number; // 1-10
  };
  favorable_matchups: FormationType[];
  unfavorable_matchups: FormationType[];
}

export type ClashVerdict = 
  | 'ADVANTAGE_HOME' 
  | 'ADVANTAGE_AWAY' 
  | 'TACTICAL_STALEMATE' 
  | 'OPEN_GOAL_FEST' 
  | 'DEFENSIVE_ATTRITION'
  | 'NO_FORMATION_DATA';

export interface FormationClashResult {
  home_formation: FormationType;
  away_formation: FormationType;
  home_formation_name: string;
  away_formation_name: string;
  is_available: boolean;
  status?: 'ACTIVE' | 'DISABLED_NO_DATA';
  clash_verdict: ClashVerdict;
  clash_verdict_zh: string;
  formation_clash_score: number; // -100 to +100 (>0 favors home, <0 favors away)
  
  // Tactical Battlegrounds
  midfield_battle: {
    winner: 'HOME' | 'AWAY' | 'EVEN';
    home_midfielders: number;
    away_midfielders: number;
    analysis_zh: string;
  };
  flank_battle: {
    winner: 'HOME' | 'AWAY' | 'EVEN';
    analysis_zh: string;
  };
  box_and_backline_battle: {
    home_attack_vs_away_defense_zh: string;
    away_attack_vs_home_defense_zh: string;
  };
  
  // Vulnerabilities & Exploit Points
  home_exploit_points_zh: string[];
  away_exploit_points_zh: string[];
  
  // Dynamic Game State Predictions
  expected_pace_and_goals: 'HIGH_GOAL_TREND' | 'LOW_GOAL_ATTRITION' | 'ONE_SIDED_DOMINANCE' | 'COUNTER_ATTACK_TRAP';
  expected_pace_zh: string;
  
  // Betting Strategy Implications
  betting_implications: {
    handicap_angle_zh: string;
    total_goals_angle_zh: string;
    corner_threat_angle_zh: string;
    recommended_play_focus: string[];
  };
  
  master_tactical_breakdown_zh: string;
}

// Complete Formation Encyclopedia
export const FORMATION_ENCYCLOPEDIA: Record<Exclude<FormationType, 'UNKNOWN'>, FormationProfile> = {
  '4-3-3': {
    code: '4-3-3',
    name_zh: '4-3-3 攻势传控与高位压迫',
    category: 'FOUR_BACK',
    core_philosophy_zh: '通过三前锋拉开场地进攻宽度，边锋为核心攻击轴心；中场单后腰+双中前卫构成三角传控，强调前场就地高位逼抢。',
    attacking_shape_zh: '进攻时边后卫前插或内收，边锋切入肋部半空间，阵型演变为 3-2-5 或 2-3-5 形成前场5人围攻。',
    defensive_shape_zh: '防守时两名边锋回撤落位 4-5-1 或 4-1-4-1，单后腰负责防线前沿横向保护。',
    key_strengths_zh: [
      '进攻火力强大，边中结合极佳，边路宽度拉伸能力顶级',
      '前场就地高位压迫极具侵略性，易造成对手后场出球失误',
      '中场三人组形成天然三角传递网，对双中场阵型具备人数压制'
    ],
    key_weaknesses_zh: [
      '倒三角中场缺少专职前腰，面对密集低位防守时中路渗透易陷入停滞',
      '单后腰身侧（肋部真空）天然是防守软肋，极易被对方前腰穿插',
      '双边后卫大幅压上后身后留有巨大开阔走廊，极易被防反打穿'
    ],
    optimal_counters_zh: [
      '使用 5-3-2 或 5-4-1 密集防守压缩防守纵深，切断边锋内切路线',
      '安排前腰在对方单后腰身侧活动，通过调动单后腰制造致命肋部空当',
      '利用 3-5-2 的 5 名中场对 4-3-3 的 3 中场实施人数绞杀'
    ],
    tactical_dna: {
      midfield_count: 3,
      forward_count: 3,
      defender_count: 4,
      flank_width_rating: 9,
      central_density_rating: 6,
      high_press_intensity: 9,
      low_block_resilience: 5,
      wingback_stamina_dependency: 6
    },
    favorable_matchups: ['4-4-2', '4-2-2-2'],
    unfavorable_matchups: ['5-3-2', '5-4-1', '3-5-2', '4-2-3-1']
  },

  '4-2-3-1': {
    code: '4-2-3-1',
    name_zh: '4-2-3-1 现代攻守平衡体系',
    category: 'FOUR_BACK',
    core_philosophy_zh: '设置双后腰（一防守一组织梳理）提供防线屏障，10号位前腰为战术大脑与枢纽，兼具快速攻防转换与层次感。',
    attacking_shape_zh: '进攻时前腰与双边锋前插支援单中锋，双后腰拖后保护，阵型演变为 4-2-4 或 4-2-1-3。',
    defensive_shape_zh: '防守时前腰与边锋迅速回撤，在双后腰前沿形成双层防线，迅速落位为紧凑的 4-5-1 或 4-4-1-1。',
    key_strengths_zh: [
      '双后腰提供顶级后防保护，能有效卡死对方中路插上与前腰活动',
      '攻守转换极度流畅，对各类阵型适应性强，是现代足坛最均衡阵型之一',
      '前场4名攻击手分工明确，具备立体的直塞与包抄层次'
    ],
    key_weaknesses_zh: [
      '对单前锋要求极高（必须兼备支点做球、抗击打、牵制中卫与终结能力）',
      '前腰若被对手绞杀冻结，中前场进攻极易断层哑火',
      '面对中路堆砌多名中场的阵型（如 3-5-2）时，中路易被围剿'
    ],
    optimal_counters_zh: [
      '使用 4-1-4-1 或 5-3-2 在中场弧顶堆积防守人员，对前腰实施双人包夹',
      '利用 3-5-2 依靠中场多出的人数优势切断双后腰与前腰的传球路线',
      '压缩前场空间使单前锋陷入孤立无援'
    ],
    tactical_dna: {
      midfield_count: 5,
      forward_count: 1,
      defender_count: 4,
      flank_width_rating: 7,
      central_density_rating: 8,
      high_press_intensity: 7,
      low_block_resilience: 8,
      wingback_stamina_dependency: 5
    },
    favorable_matchups: ['4-3-3', '4-4-2'],
    unfavorable_matchups: ['3-5-2', '4-1-4-1', '5-3-2']
  },

  '4-4-2': {
    code: '4-4-2',
    name_zh: '4-4-2 经典平行站位',
    category: 'FOUR_BACK',
    core_philosophy_zh: '两道四人平行防线保持极高横向紧凑度；依靠双前锋牵制双中卫，通过边前卫/边后卫提供边路传中与攻守平衡。',
    attacking_shape_zh: '进攻时边前卫套边传中，双前锋一高一快或双鬼拍门包抄禁区，阵型演变为 4-2-4。',
    defensive_shape_zh: '防守时全员回撤形成严密的 4-4-2 紧凑双层铁索连环防线，双前锋在中圈压迫对手双中卫出球。',
    key_strengths_zh: [
      '阵型极度均衡，职责明确，易于全队执行与保持防线纵深与间距',
      '双箭头直接压制对手双中后卫，极大地破坏对方后场从容出球',
      '边路攻守兼备，反击时可通过边路快速直传打穿防线'
    ],
    key_weaknesses_zh: [
      '中场中路仅有2名球员，面对三中场/五中场体系时中路天然少人，极易失控',
      '战术套路相对固定可预测，两条防线之间的肋部结合部易被前腰钻空子',
      '缺乏专职前腰，阵地战破密集防守时创造力相对单一'
    ],
    optimal_counters_zh: [
      '采用 4-3-3 或 3-5-2 通过中场人数优势（3打2或5打2）彻底掌控中路球权',
      '安排前腰在 4-4-2 的后腰身前与中卫身后（两线之间）自由接球组织',
      '利用 3-5-2 的边翼卫与三中卫体系全面压制其边路起球'
    ],
    tactical_dna: {
      midfield_count: 4,
      forward_count: 2,
      defender_count: 4,
      flank_width_rating: 8,
      central_density_rating: 5,
      high_press_intensity: 7,
      low_block_resilience: 7,
      wingback_stamina_dependency: 5
    },
    favorable_matchups: ['3-4-3', '4-2-2-2'],
    unfavorable_matchups: ['4-3-3', '3-5-2', '4-2-3-1', '4-4-2-diamond']
  },

  '4-4-2-diamond': {
    code: '4-4-2-diamond',
    name_zh: '4-4-2 菱形中场 (4-1-2-1-2 / 钻石体系)',
    category: 'FOUR_BACK',
    core_philosophy_zh: '放弃天然边前卫，中场堆砌4人（1单后腰+2中前卫+1前腰）形成菱形，在中路打造极致控球优势与前腰组织，边路完全依靠双边后卫大范围插上。',
    attacking_shape_zh: '前腰在双前锋身后自由调度，两名边后卫大幅推上充当边锋，阵型演变为 2-1-4-3 或 2-3-1-4。',
    defensive_shape_zh: '防守时单后腰落位中卫身前，双中前卫向两翼拉开补位，前腰后撤，形成紧凑的 4-3-1-2。',
    key_strengths_zh: [
      '中路人数极度密集，在中路形成4打2或4打3的绝对传控优势',
      '双前锋搭配顶级前腰，中路穿透与直塞杀伤力极强',
      '对中路防守薄弱或平行中场的球队具备摧毁级控制力'
    ],
    key_weaknesses_zh: [
      '边路防守天然真空，边后卫压上后身后走廊门户大开',
      '对双边后卫的体能、折返奔跑与传中质量要求达到极致苛刻',
      '面对边路进攻极其犀利的阵型时，中前卫被迫拉边导致中路空虚'
    ],
    optimal_counters_zh: [
      '使用 4-3-3 或 3-4-3，利用速度型边锋疯狂冲击其边后卫身后开阔地',
      '通过快速长传大范围转移球到两翼，打其边后卫回防不及的空当',
      '用 5-3-2 堆积中路防守抵消其前腰穿透力'
    ],
    tactical_dna: {
      midfield_count: 4,
      forward_count: 2,
      defender_count: 4,
      flank_width_rating: 3,
      central_density_rating: 10,
      high_press_intensity: 8,
      low_block_resilience: 6,
      wingback_stamina_dependency: 9
    },
    favorable_matchups: ['4-4-2', '4-2-3-1'],
    unfavorable_matchups: ['4-3-3', '3-4-3', '3-5-2']
  },

  '3-5-2': {
    code: '3-5-2',
    name_zh: '3-5-2 三中卫与边翼卫驱动',
    category: 'THREE_BACK',
    core_philosophy_zh: '3名中后卫构筑中路钢铁纵深，5名中场全面掌控球权与节奏；两名边翼卫覆盖整条边路走廊，进攻变3-5-2，防守变5-3-2。',
    attacking_shape_zh: '双边翼卫大幅压上拉开宽度，三中场前插，双前锋拉扯禁区，阵型演变为 3-3-4 或 3-1-4-2。',
    defensive_shape_zh: '防守时双边翼卫迅速回撤至三中卫两侧，瞬间落位成坚不可摧的 5-3-2 低位防守大巴。',
    key_strengths_zh: [
      '中场人数优势巨大（5人），能轻易压制双中场或单前腰体系掌控比赛球权',
      '3名中后卫对单中锋阵型（如 4-3-3, 4-2-3-1）形成人数绝对压制（3包1）',
      '防守落位 5-3-2 时中路防守极稳固，抗传中与禁区保护能力顶级'
    ],
    key_weaknesses_zh: [
      '对两名边翼卫的体能、折返能力与防守意识要求极高，下半场易体能透支',
      '三中卫与边翼卫之间的肋部结合部存在天然空当',
      '一旦遭遇同侧边路二人组叠跑强吃，单翼卫防守极易瘫痪'
    ],
    optimal_counters_zh: [
      '使用 4-3-3 或 3-4-3 安排边锋与边后卫在同侧形成2打1叠跑强吃其单翼卫',
      '利用 4-4-2 用速度型边锋反复冲击其边翼卫与边中卫的结合部肋部',
      '加快攻防转换速度，趁其边翼卫压上未回防时打其身后'
    ],
    tactical_dna: {
      midfield_count: 5,
      forward_count: 2,
      defender_count: 3,
      flank_width_rating: 7,
      central_density_rating: 9,
      high_press_intensity: 6,
      low_block_resilience: 9,
      wingback_stamina_dependency: 10
    },
    favorable_matchups: ['4-4-2', '4-2-3-1', '4-3-3'],
    unfavorable_matchups: ['3-4-3', '4-4-2-diamond', '5-4-1']
  },

  '3-4-3': {
    code: '3-4-3',
    name_zh: '3-4-3 极致攻势与动态切换',
    category: 'THREE_BACK',
    core_philosophy_zh: '前场三叉戟高位压迫，两名边翼卫提供极致宽度；进攻时5人压上摧毁对手四后卫防线，防守时边翼卫迅速回撤落位 5-4-1。',
    attacking_shape_zh: '边锋内切杀入肋部半空间，翼卫套边下底传中，禁区前沿形成 5 人攻势（3前锋+2翼卫），演变为 3-2-5。',
    defensive_shape_zh: '双翼卫回撤防线成五后卫，双边锋回防中场两侧，迅速落位成紧密的 5-4-1 防守大巴。',
    key_strengths_zh: [
      '前场压迫力极强，进攻点分散，边锋内切加翼卫套边能打穿绝大多数四后卫体系',
      '进攻立体化，前场5通道（两翼+两肋+中路）全覆盖',
      '防守落位 5-4-1 时兼具中场与禁区防守厚度'
    ],
    key_weaknesses_zh: [
      '中路仅有2名中前卫，若前锋与翼卫回防不及时，中路枢纽极易被对手撕开',
      '三后卫体系在边路有天然开阔地，对球员战术执行力与体能要求苛刻',
      '面对中场中路强悍且反击犀利的球队时容易被就地断球打中路直塞'
    ],
    optimal_counters_zh: [
      '使用 4-3-3 或 3-5-2 依靠三中场在中路中圈实施截击与快速纵深反击',
      '利用边后卫前插吸引对方边翼卫，为中路创造直塞与渗透空间',
      '利用 5-4-1 大巴阵消耗其进攻锐气后打长传反击'
    ],
    tactical_dna: {
      midfield_count: 4,
      forward_count: 3,
      defender_count: 3,
      flank_width_rating: 10,
      central_density_rating: 6,
      high_press_intensity: 9,
      low_block_resilience: 7,
      wingback_stamina_dependency: 9
    },
    favorable_matchups: ['4-4-2', '4-2-3-1', '3-5-2'],
    unfavorable_matchups: ['4-3-3', '5-3-2', '5-4-1']
  },

  '5-3-2': {
    code: '5-3-2',
    name_zh: '5-3-2 低位铁桶与防守反击',
    category: 'FIVE_BACK',
    core_philosophy_zh: '后防线5人极度紧凑，压缩禁区空间；中场3人构建第一道绞杀线，依靠双前锋在反击中寻求致命一击。',
    attacking_shape_zh: '由双前锋（一做球一突前）主导快速防反，两名边翼卫适度压上，演变为 3-5-2 或 5-1-2-2。',
    defensive_shape_zh: '全队退守本方半场，5后卫+3中场构成极其密集的双层低位大巴防线（Low Block）。',
    key_strengths_zh: [
      '防守极为稳固，禁区内人数优势巨大，难以被地面渗透或传中打穿',
      '对 4-3-3, 3-4-3 等主打边锋进攻的球队具备天然结构性克制',
      '双前锋反击具备极高牵制力，能直接偷袭对方压上的后卫身后'
    ],
    key_weaknesses_zh: [
      '进攻投入兵力少，控球率通常低迷（35%-45%），场面长期被动',
      '反击质量极度依赖双前锋的单兵突破与把握机会能力',
      '禁区前沿易漏出远射空间，且持续被围攻容易累积大量角球与二次进攻险情'
    ],
    optimal_counters_zh: [
      '保持耐心倒脚传导，边中结合调动其防线，制造禁区弧顶远射机会',
      '通过角球与前场定位球利用高空轰炸打破僵局',
      '采用 3-5-2 同样以中场人数压制，并通过两翼持续施压'
    ],
    tactical_dna: {
      midfield_count: 3,
      forward_count: 2,
      defender_count: 5,
      flank_width_rating: 6,
      central_density_rating: 9,
      high_press_intensity: 3,
      low_block_resilience: 10,
      wingback_stamina_dependency: 7
    },
    favorable_matchups: ['4-3-3', '3-4-3', '4-2-3-1'],
    unfavorable_matchups: ['3-5-2', '4-1-4-1', '5-4-1']
  },

  '5-4-1': {
    code: '5-4-1',
    name_zh: '5-4-1 极致大巴与单箭头反击',
    category: 'FIVE_BACK',
    core_philosophy_zh: '5后卫+4中场构成两道铜墙铁壁，彻底封死禁区内外全部通道，专打1-0或0-0的极致功利防守反击。',
    attacking_shape_zh: '单前锋作为反击支点，边前卫/翼卫快速插上支援，演变为 3-4-3 或 5-2-3 反击。',
    defensive_shape_zh: '标准的 5-4-1 超低位防守大巴，中场4人紧贴5人防线，间距控制在10米以内。',
    key_strengths_zh: [
      '当今足坛最坚固的低位防守阵型，禁区肋部与中路几乎无缝可钻',
      '能有效零封绝大多数强队的阵地战进攻，让高位压迫球队无计可施',
      '边路4人（2翼卫+2边前卫）能形成双人边路绞杀'
    ],
    key_weaknesses_zh: [
      '前场仅留单中锋，反击时常陷入孤立无援，极难维持长时间前场球权',
      '全场被动挨打极耗后卫精神专注度，一旦先失球难以组织有效逆转反扑',
      '送给对手大量角球与边路任意球机会'
    ],
    optimal_counters_zh: [
      '引诱其防线前提，不盲目盲攻，增加禁区外远射制造折射破门',
      '利用强力中锋的高空头球轰炸与角球战术',
      '利用 4-4-2 依靠双前锋在禁区内抢落点'
    ],
    tactical_dna: {
      midfield_count: 4,
      forward_count: 1,
      defender_count: 5,
      flank_width_rating: 8,
      central_density_rating: 9,
      high_press_intensity: 2,
      low_block_resilience: 10,
      wingback_stamina_dependency: 7
    },
    favorable_matchups: ['4-3-3', '4-2-3-1', '3-4-3'],
    unfavorable_matchups: ['4-4-2', '3-5-2']
  },

  '4-1-4-1': {
    code: '4-1-4-1',
    name_zh: '4-1-4-1 单后腰防守绞杀与高密横截面',
    category: 'FOUR_BACK',
    core_philosophy_zh: '专职单后腰扫荡防线前沿，4名中前卫平行横向排布封锁传球通道，极致压缩对手前腰空间并兼顾边路防守。',
    attacking_shape_zh: '两名中前卫交替前插，边前卫内切，阵型演变为 4-3-3 或 4-1-2-3。',
    defensive_shape_zh: '标准的 4-1-4-1 中位防守拦截网，单后腰负责弧顶区域，四中场退守拦截传球路线。',
    key_strengths_zh: [
      '中场横向覆盖面积极大，遏制肋部直塞与中路渗透能力极强',
      '专克依赖前腰的 4-2-3-1 与 3-4-1-2，能将对方10号位完全淹没',
      '双边路有边前卫与边后卫双重保护，防守稳固'
    ],
    key_weaknesses_zh: [
      '单前锋容易在前场被对方双中卫合力孤立',
      '单后腰一旦被对方战术调离或吃牌，防线前沿出现巨大真空',
      '面对多中场大范围拉开宽度的阵型（如 3-5-2）时横向中场顾此失彼'
    ],
    optimal_counters_zh: [
      '使用 3-5-2 大范围调度拉开场地宽度，从边路打穿其横向中场防线',
      '通过快速中前场撞墙配合将单后腰引出防区',
      '用 4-4-2 的双前锋直接攻击其双中卫'
    ],
    tactical_dna: {
      midfield_count: 5,
      forward_count: 1,
      defender_count: 4,
      flank_width_rating: 8,
      central_density_rating: 8,
      high_press_intensity: 6,
      low_block_resilience: 8,
      wingback_stamina_dependency: 5
    },
    favorable_matchups: ['4-2-3-1', '4-3-3', '4-4-2'],
    unfavorable_matchups: ['3-5-2', '3-4-3', '5-3-2']
  },

  '3-4-2-1': {
    code: '3-4-2-1',
    name_zh: '3-4-2-1 双前腰半空间渗透体系',
    category: 'THREE_BACK',
    core_philosophy_zh: '3中卫+双后腰+双前腰（Inside Forwards）+单中锋；两名边翼卫提供纯粹宽度，双前腰在肋部半空间（Half-Space）制造致命杀伤。',
    attacking_shape_zh: '双前腰内收到禁区肋部，边翼卫压上，形成前场 5 人进攻集群（3-2-4-1 或 3-2-5）。',
    defensive_shape_zh: '双翼卫回撤为 5 后卫，双前腰回撤到双后腰两侧，迅速落位为 5-4-1。',
    key_strengths_zh: [
      '肋部半空间杀伤力足坛顶级，双前腰让对手四后卫体系防不胜防',
      '双后腰提供扎实中后场屏障，攻守兼备且阵型层次极度分明',
      '对阵传统 4-4-2 和 4-2-3-1 具备局部的局部人数超载'
    ],
    key_weaknesses_zh: [
      '中场中路仅双后腰，若双前腰回防不及时，中路枢纽易被对手抢断',
      '对双前腰的传切配合与控球摆脱能力要求极高',
      '面对 5-3-2/5-4-1 时肋部空间被五后卫压缩'
    ],
    optimal_counters_zh: [
      '使用 5-3-2 或 5-4-1 用三中卫直接贴身看防双前腰，封死肋部通道',
      '在中场中路利用 4-3-3 的三中场强行冲击其双后腰',
      '打边翼卫身后的快速反击'
    ],
    tactical_dna: {
      midfield_count: 4,
      forward_count: 3,
      defender_count: 3,
      flank_width_rating: 9,
      central_density_rating: 9,
      high_press_intensity: 8,
      low_block_resilience: 8,
      wingback_stamina_dependency: 9
    },
    favorable_matchups: ['4-4-2', '4-2-3-1', '4-3-3'],
    unfavorable_matchups: ['5-3-2', '5-4-1', '3-5-2']
  },

  '5-2-3': {
    code: '5-2-3',
    name_zh: '5-2-3 低位收缩与三叉戟闪电反击',
    category: 'FIVE_BACK',
    core_philosophy_zh: '后场5后卫+2后腰构建铁桶屏障，前场保留3名具备极速突破能力的前锋，专攻对手大举压上后的广阔后场。',
    attacking_shape_zh: '前场三前锋快速分散跑位打反击，边翼卫根据局势后排插上，演变为 3-4-3 或 5-2-3。',
    defensive_shape_zh: '5后卫低位落位，双后腰在禁区前沿扫荡，边锋适度回防形成 5-4-1。',
    key_strengths_zh: [
      '兼具 5 后卫的极致防守硬度与三前锋反击的致命爆发力',
      '专打传控型强队身后开阔地，反击速度与冲击力极强',
      '防守三区极难被对方打穿'
    ],
    key_weaknesses_zh: [
      '中场仅2人，控球率极低，极难在中场组织阵地战',
      '双后腰防守负荷极大，体能消耗剧烈',
      '一旦三前锋被切断与后场的长传连线，进攻容易完全脱节'
    ],
    optimal_counters_zh: [
      '不盲目全线压上，保持 2-3 名防守球员拖后防备快速长传反击',
      '利用 3-5-2 或 4-3-3 在中场实施高位断球并就地远射',
      '通过定位球战术打破僵局'
    ],
    tactical_dna: {
      midfield_count: 2,
      forward_count: 3,
      defender_count: 5,
      flank_width_rating: 8,
      central_density_rating: 7,
      high_press_intensity: 4,
      low_block_resilience: 9,
      wingback_stamina_dependency: 8
    },
    favorable_matchups: ['4-3-3', '3-4-3'],
    unfavorable_matchups: ['3-5-2', '4-4-2', '5-3-2']
  },

  '4-2-2-2': {
    code: '4-2-2-2',
    name_zh: '4-2-2-2 双后腰双前腰 (红牛系狂暴高位反抢)',
    category: 'FOUR_BACK',
    core_philosophy_zh: '无专职边锋，前场4人（2内收前腰+2前锋）在狭小中路区域内实施狂暴的就地反抢（Gegenpressing），主打极速中路穿透。',
    attacking_shape_zh: '前场4人密集在中路渗透，双边后卫高速压上提供全部宽度，演变为 2-2-4-2 或 2-4-4。',
    defensive_shape_zh: '前场4人就地组网反抢，若被突破则迅速退守为 4-4-2 紧凑方阵。',
    key_strengths_zh: [
      '就地反抢效率极高，能在对手后场拿球瞬间形成4人围剿断球',
      '中路进攻人数极多，短传渗透与撞墙配合杀伤力极大',
      '攻防转换节奏极快，容易在短时间内摧毁立足未稳的对手'
    ],
    key_weaknesses_zh: [
      '边路防守天然空虚，极度依赖边后卫的高速上下折返',
      '对球员体能与高强度逼抢纪律性要求达到极限',
      '面对擅长长传大范围转移的球队极易被两翼打爆'
    ],
    optimal_counters_zh: [
      '使用 3-5-2 或 3-4-3 迅速通过两翼大范围长传转移避开其中路逼抢陷阱',
      '利用边路2打1强吃其单边后卫',
      '用 5-3-2 低位大巴化解其中路狂暴冲击'
    ],
    tactical_dna: {
      midfield_count: 4,
      forward_count: 2,
      defender_count: 4,
      flank_width_rating: 4,
      central_density_rating: 10,
      high_press_intensity: 10,
      low_block_resilience: 6,
      wingback_stamina_dependency: 9
    },
    favorable_matchups: ['4-2-3-1', '4-3-3'],
    unfavorable_matchups: ['3-5-2', '3-4-3', '4-4-2']
  }
};

/**
 * Clean & normalize formation text from match data into standard FormationType
 */
export function normalizeFormationCode(rawFormation?: string | null): FormationType {
  if (!rawFormation) return 'UNKNOWN';
  const str = String(rawFormation).trim().toLowerCase().replace(/[\s\-_]/g, '');
  if (!str || str === 'unknown' || str === 'none' || str === 'null' || str === 'undefined' || str === '待定' || str === '未知') {
    return 'UNKNOWN';
  }
  
  if (str.includes('4231')) return '4-2-3-1';
  if (str.includes('433')) return '4-3-3';
  if (str.includes('41212') || str.includes('442diamond') || str.includes('菱形')) return '4-4-2-diamond';
  if (str.includes('442')) return '4-4-2';
  if (str.includes('352')) return '3-5-2';
  if (str.includes('3421')) return '3-4-2-1';
  if (str.includes('3412')) return '3-4-2-1';
  if (str.includes('343')) return '3-4-3';
  if (str.includes('541')) return '5-4-1';
  if (str.includes('532')) return '5-3-2';
  if (str.includes('4141')) return '4-1-4-1';
  if (str.includes('451')) return '4-1-4-1';
  if (str.includes('523')) return '5-2-3';
  if (str.includes('5212')) return '5-3-2';
  if (str.includes('4222')) return '4-2-2-2';
  if (str.includes('4312')) return '4-4-2-diamond';

  return 'UNKNOWN';
}

/**
 * Intelligent Formation Detector: Extracts formation from lineup data or player distributions
 */
export function detectMatchFormation(
  lineupData: any,
  side: 'home' | 'away'
): { formation: FormationType; source: string; confidence: number; is_available: boolean } {
  if (!lineupData) {
    return { formation: 'UNKNOWN', source: 'no_lineup_data', confidence: 0, is_available: false };
  }

  // 1. Direct formation string in lineup data
  const sideRecord = lineupData[side] || (side === 'home' ? lineupData.home_team : lineupData.away_team);
  const directStr = sideRecord?.formation || sideRecord?.array || lineupData[`${side}_formation`];
  if (directStr && typeof directStr === 'string' && directStr.trim()) {
    const norm = normalizeFormationCode(directStr);
    if (norm !== 'UNKNOWN') {
      return {
        formation: norm,
        source: 'official_lineup_formation_field',
        confidence: 0.95,
        is_available: true
      };
    }
  }

  // 2. Count starters by position if available
  const starters = sideRecord?.starters || sideRecord?.players || [];
  if (Array.isArray(starters) && starters.length >= 10) {
    let cb = 0, fb = 0, dm = 0, cm = 0, am = 0, w = 0, st = 0;
    for (const p of starters) {
      const pos = String(p.position || p.pos || '').toUpperCase();
      if (/CB|中卫|中后卫/.test(pos)) cb++;
      else if (/LB|RB|LWB|RWB|边后卫|边卫/.test(pos)) fb++;
      else if (/DM|后腰|防守中场/.test(pos)) dm++;
      else if (/AM|前腰|攻击中场/.test(pos)) am++;
      else if (/CM|中前卫|中场/.test(pos)) cm++;
      else if (/LW|RW|LM|RM|边锋|边前卫/.test(pos)) w++;
      else if (/CF|ST|前锋|中锋/.test(pos)) st++;
    }

    const defenders = cb + fb;
    const midfielders = dm + cm + am;
    const forwards = w + st;

    if (defenders === 5 && midfielders === 3 && forwards === 2) return { formation: '5-3-2', source: 'position_synthesis', confidence: 0.85, is_available: true };
    if (defenders === 5 && midfielders === 4 && forwards === 1) return { formation: '5-4-1', source: 'position_synthesis', confidence: 0.85, is_available: true };
    if (defenders === 3 && midfielders === 5 && forwards === 2) return { formation: '3-5-2', source: 'position_synthesis', confidence: 0.85, is_available: true };
    if (defenders === 3 && midfielders === 4 && forwards === 3) return { formation: '3-4-3', source: 'position_synthesis', confidence: 0.85, is_available: true };
    if (defenders === 4 && midfielders === 5 && forwards === 1) {
      if (dm === 2) return { formation: '4-2-3-1', source: 'position_synthesis', confidence: 0.85, is_available: true };
      return { formation: '4-1-4-1', source: 'position_synthesis', confidence: 0.85, is_available: true };
    }
    if (defenders === 4 && midfielders === 3 && forwards === 3) return { formation: '4-3-3', source: 'position_synthesis', confidence: 0.85, is_available: true };
    if (defenders === 4 && midfielders === 4 && forwards === 2) return { formation: '4-4-2', source: 'position_synthesis', confidence: 0.85, is_available: true };
  }

  return { formation: 'UNKNOWN', source: 'missing_lineup_data', confidence: 0, is_available: false };
}

/**
 * Deep Formation Clash Evaluator
 * Evaluates tactical clash dynamics between Home Formation and Away Formation
 */
export function evaluateFormationClash(
  homeFormationRaw?: string | null,
  awayFormationRaw?: string | null
): FormationClashResult {
  const homeFormation = normalizeFormationCode(homeFormationRaw);
  const awayFormation = normalizeFormationCode(awayFormationRaw);

  // If either team has unknown formation, cleanly bypass and disable formation clash evaluation
  if (homeFormation === 'UNKNOWN' || awayFormation === 'UNKNOWN') {
    return {
      home_formation: homeFormation,
      away_formation: awayFormation,
      home_formation_name: homeFormation === 'UNKNOWN' ? '未提供官方阵型' : (FORMATION_ENCYCLOPEDIA[homeFormation]?.name_zh || homeFormation),
      away_formation_name: awayFormation === 'UNKNOWN' ? '未提供官方阵型' : (FORMATION_ENCYCLOPEDIA[awayFormation]?.name_zh || awayFormation),
      is_available: false,
      status: 'DISABLED_NO_DATA',
      clash_verdict: 'NO_FORMATION_DATA',
      clash_verdict_zh: '暂无官方阵型（阵型评估已关闭）',
      formation_clash_score: 0,
      midfield_battle: {
        winner: 'EVEN',
        home_midfielders: 0,
        away_midfielders: 0,
        analysis_zh: '缺少确切首发阵型数据，中场人数对决与控制力推演已关闭。'
      },
      flank_battle: {
        winner: 'EVEN',
        analysis_zh: '缺少确切首发阵型数据，边路走廊宽度博弈已关闭。'
      },
      box_and_backline_battle: {
        home_attack_vs_away_defense_zh: '阵型数据未提供，禁区攻防推演已关闭',
        away_attack_vs_home_defense_zh: '阵型数据未提供，禁区攻防推演已关闭'
      },
      home_exploit_points_zh: [],
      away_exploit_points_zh: [],
      expected_pace_and_goals: 'LOW_GOAL_ATTRITION',
      expected_pace_zh: '阵型数据缺失，比赛节奏完全取决于现场物理攻防与动能波形',
      betting_implications: {
        handicap_angle_zh: '无阵型先验倾向，不给予任何主客让球加权',
        total_goals_angle_zh: '大小球期望完全由实时渗透率与射门转化率决定',
        corner_threat_angle_zh: '角球威胁根据现场真实角球密度评估',
        recommended_play_focus: ['UNDER']
      },
      master_tactical_breakdown_zh: '本场比赛官方源未提供确切首发阵型（常见于低级别联赛、青年后备队或热身赛），系统已主动关闭静态阵型先验克制推演，不作任何无依据假设，评估全量依托实时攻守物理数据。'
    };
  }

  const homeProf = FORMATION_ENCYCLOPEDIA[homeFormation] || FORMATION_ENCYCLOPEDIA['4-3-3'];
  const awayProf = FORMATION_ENCYCLOPEDIA[awayFormation] || FORMATION_ENCYCLOPEDIA['4-3-3'];

  // Midfield calculation
  const homeMids = homeProf.tactical_dna.midfield_count;
  const awayMids = awayProf.tactical_dna.midfield_count;
  let midWinner: 'HOME' | 'AWAY' | 'EVEN' = 'EVEN';
  let midAnalysis = '双方中场人数均等，中圈控制权处于拉锯状态。';

  if (homeMids > awayMids) {
    midWinner = 'HOME';
    midAnalysis = `主队 (${homeProf.code}) 中场 ${homeMids} 人形成局部人数压制，客队 (${awayProf.code}) 仅 ${awayMids} 人，主队更易掌控中圈球权与三角传递节奏。`;
  } else if (awayMids > homeMids) {
    midWinner = 'AWAY';
    midAnalysis = `客队 (${awayProf.code}) 中场 ${awayMids} 人占优，主队 (${homeProf.code}) 中场 ${homeMids} 人面临被绞杀与传球线路被切割风险。`;
  }

  // Flank calculation
  let flankWinner: 'HOME' | 'AWAY' | 'EVEN' = 'EVEN';
  let flankAnalysis = '双方边路配置均衡。';
  if (homeProf.tactical_dna.flank_width_rating > awayProf.tactical_dna.flank_width_rating + 1) {
    flankWinner = 'HOME';
    flankAnalysis = `主队边路宽度与边锋突击力 (${homeProf.tactical_dna.flank_width_rating}/10) 显著优于客队 (${awayProf.tactical_dna.flank_width_rating}/10)，利好主队走廊套边与下底传中。`;
  } else if (awayProf.tactical_dna.flank_width_rating > homeProf.tactical_dna.flank_width_rating + 1) {
    flankWinner = 'AWAY';
    flankAnalysis = `客队边路冲击力更强，主队边路防守承受较大套边下底压力。`;
  }

  // Calculate Base Clash Score
  let clashScore = 0;

  // Midfield score delta
  clashScore += (homeMids - awayMids) * 12;

  // Profile matchup check
  if (homeProf.favorable_matchups.includes(awayFormation)) clashScore += 25;
  if (homeProf.unfavorable_matchups.includes(awayFormation)) clashScore -= 25;
  if (awayProf.favorable_matchups.includes(homeFormation)) clashScore -= 25;
  if (awayProf.unfavorable_matchups.includes(homeFormation)) clashScore += 25;

  // Specific classic clashes logic
  let verdict: 'ADVANTAGE_HOME' | 'ADVANTAGE_AWAY' | 'TACTICAL_STALEMATE' | 'OPEN_GOAL_FEST' | 'DEFENSIVE_ATTRITION' = 'TACTICAL_STALEMATE';
  let verdictZh = '势均力敌·战术博弈胶着';
  let paceType: 'HIGH_GOAL_TREND' | 'LOW_GOAL_ATTRITION' | 'ONE_SIDED_DOMINANCE' | 'COUNTER_ATTACK_TRAP' = 'LOW_GOAL_ATTRITION';
  let paceZh = '阵地拉锯·防守试探';

  // 1. 4-3-3 vs 4-4-2
  if (homeFormation === '4-3-3' && awayFormation === '4-4-2') {
    clashScore += 20;
    verdict = 'ADVANTAGE_HOME';
    verdictZh = '主队 4-3-3 传控三角天然克制客队平行 4-4-2 双中场';
    paceType = 'ONE_SIDED_DOMINANCE';
    paceZh = '主队掌控中场与边路拉扯，客队双前锋反击牵制';
  } else if (homeFormation === '4-4-2' && awayFormation === '4-3-3') {
    clashScore -= 20;
    verdict = 'ADVANTAGE_AWAY';
    verdictZh = '客队 4-3-3 倒三角中场压制主队平行 4-4-2，主队中路易脱节';
    paceType = 'ONE_SIDED_DOMINANCE';
    paceZh = '客队掌控球权，主队依赖压缩防守反击与定位球';
  }
  // 2. 4-3-3 vs 5-3-2 / 5-4-1 (Low Block Counter Trap)
  else if (homeFormation === '4-3-3' && (awayFormation === '5-3-2' || awayFormation === '5-4-1')) {
    clashScore -= 22;
    verdict = 'ADVANTAGE_AWAY';
    verdictZh = '客队五后卫铁桶阵天然克制主队 4-3-3 边锋内切与高位压迫';
    paceType = 'COUNTER_ATTACK_TRAP';
    paceZh = '主队大量无威胁控球，谨防客队防守反击偷冷门';
  } else if ((homeFormation === '5-3-2' || homeFormation === '5-4-1') && awayFormation === '4-3-3') {
    clashScore += 22;
    verdict = 'ADVANTAGE_HOME';
    verdictZh = '主队五后卫防守纵深阻断客队 4-3-3 渗透，反击空间广阔';
    paceType = 'COUNTER_ATTACK_TRAP';
    paceZh = '主队低位收缩稳健，客队后防身后空当极大';
  }
  // 3. 3-5-2 vs 4-4-2
  else if (homeFormation === '3-5-2' && awayFormation === '4-4-2') {
    clashScore += 26;
    verdict = 'ADVANTAGE_HOME';
    verdictZh = '主队 3-5-2 五中场全面碾压客队平行双中场，且三中卫包夹双前锋';
    paceType = 'ONE_SIDED_DOMINANCE';
    paceZh = '主队绝对控球压制，客队中场易被持续撕扯';
  } else if (homeFormation === '4-4-2' && awayFormation === '3-5-2') {
    clashScore -= 26;
    verdict = 'ADVANTAGE_AWAY';
    verdictZh = '客队 3-5-2 中场人数与前腰空间极大，主队中路面临人数绞杀';
    paceType = 'ONE_SIDED_DOMINANCE';
    paceZh = '客队中路掌控力顶级，主队必须全力主攻边翼卫肋部结合部';
  }
  // 4. 4-2-3-1 vs 4-3-3
  else if (homeFormation === '4-2-3-1' && awayFormation === '4-3-3') {
    clashScore += 16;
    verdict = 'ADVANTAGE_HOME';
    verdictZh = '主队双后腰有效卡死客队中路插上，前腰直接攻击客队单后腰身侧软肋';
    paceType = 'ONE_SIDED_DOMINANCE';
    paceZh = '主队攻守转换更立体，客队单后腰防守压力巨大';
  } else if (homeFormation === '4-3-3' && awayFormation === '4-2-3-1') {
    clashScore -= 16;
    verdict = 'ADVANTAGE_AWAY';
    verdictZh = '客队双后腰封堵中路，主队单后腰身侧易被客队前腰利用';
    paceType = 'ONE_SIDED_DOMINANCE';
    paceZh = '客队防守稳定性更高，主队需依赖两翼撕开宽度';
  }
  // 5. 3-4-3 vs 4-3-3 / 3-5-2 (Open Goal Fest)
  else if ((homeFormation === '3-4-3' && awayFormation === '4-3-3') || (homeFormation === '4-3-3' && awayFormation === '3-4-3')) {
    clashScore += (homeFormation === '3-4-3' ? 5 : -5);
    verdict = 'OPEN_GOAL_FEST';
    verdictZh = '高强度进攻对攻局·双方边路与肋部大开大合';
    paceType = 'HIGH_GOAL_TREND';
    paceZh = '两端攻防转换极快，前场空间充足，大球与角球动能高发';
  }
  // 6. 5-3-2 vs 5-4-1 / 4-1-4-1 (Defensive Attrition)
  else if ((homeFormation === '5-3-2' || homeFormation === '5-4-1') && (awayFormation === '5-3-2' || awayFormation === '5-4-1' || awayFormation === '4-1-4-1')) {
    verdict = 'DEFENSIVE_ATTRITION';
    verdictZh = '窒息低位绞杀局·双方防线严密';
    paceType = 'LOW_GOAL_ATTRITION';
    paceZh = '攻防节奏沉闷，禁区中路极度密集，小球与半场0-0高发';
  } else {
    if (clashScore >= 18) {
      verdict = 'ADVANTAGE_HOME';
      verdictZh = `主队 (${homeProf.name_zh}) 战术结构占优`;
    } else if (clashScore <= -18) {
      verdict = 'ADVANTAGE_AWAY';
      verdictZh = `客队 (${awayProf.name_zh}) 战术结构占优`;
    }
  }

  // Bounds limit
  clashScore = Math.max(-100, Math.min(100, clashScore));

  // Exploit Points
  const homeExploitPoints: string[] = [
    `主攻空间: ${awayProf.key_weaknesses_zh[0] || '对方后防肋部结合部'}`,
    `克制战术: ${awayProf.optimal_counters_zh[0] || '提速中路渗透与边路套边'}`,
  ];
  const awayExploitPoints: string[] = [
    `客攻空间: ${homeProf.key_weaknesses_zh[0] || '主队防线身后空当'}`,
    `克制战术: ${homeProf.optimal_counters_zh[0] || '快速大范围转移球'}`,
  ];

  // Betting Strategy
  let handicapAngle = '双方阵型无绝对相克，盘口遵循基本面实力';
  let totalGoalsAngle = '进球节奏处于正常区间';
  let cornerAngle = '角球产生率处于均值';
  const recommendedFocus: string[] = [];

  if (verdict === 'ADVANTAGE_HOME') {
    handicapAngle = `主队阵型克制明显，中前场战术主动性强，利好主队让球赢盘 (Spread Home) 或独赢`;
    recommendedFocus.push('主队让球/独赢 (+EV)');
  } else if (verdict === 'ADVANTAGE_AWAY') {
    handicapAngle = `客队具备明显阵型克制或大巴防反抗冷优势，严防主队深开诱盘，利好客队受让下盘 (+0.5/+1.0)`;
    recommendedFocus.push('客队受让抗冷 (+EV)');
  }

  if (paceType === 'HIGH_GOAL_TREND') {
    totalGoalsAngle = '双方阵型均重攻轻守且两翼大开大合，极易形成进球互爆，支持大球方向 (Over Goals)';
    cornerAngle = '两翼边锋与翼卫高频套边下底，易产生大量传中封堵，角球大球动能强';
    recommendedFocus.push('全场大球 / 半场大球');
    recommendedFocus.push('角球大盘');
  } else if (paceType === 'LOW_GOAL_ATTRITION') {
    totalGoalsAngle = '双方后场兵力堆积严重，禁区空间极小，破门难度极高，支持小球与半场僵局 (Under Goals / HT Draw)';
    cornerAngle = '阵地战推进缓慢，射门与下底次数偏低';
    recommendedFocus.push('全场小球 / 半场小球');
    recommendedFocus.push('半场平局 (HT 0-0/1-1)');
  } else if (paceType === 'COUNTER_ATTACK_TRAP') {
    totalGoalsAngle = '攻防一方主导无威胁控球，另一方低位防守反击，进球多取决于单兵防反效率，盘口过深时防范小球';
    cornerAngle = '围攻方产生大量禁区解围与封堵射门，往往单边角球奇高 (Corner Squeeze)';
    recommendedFocus.push('让球下盘受让保护');
    recommendedFocus.push('围攻方角球大');
  }

  // Master Summary Note
  const summaryZh = `【阵型克制解析: ${homeProf.code} vs ${awayProf.code}】${verdictZh}。`
    + `中场博弈: ${midAnalysis} `
    + `边路博弈: ${flankAnalysis} `
    + `战术节奏: ${paceZh}。`
    + `博弈重点: ${handicapAngle}；${totalGoalsAngle}。`;

  return {
    home_formation: homeFormation,
    away_formation: awayFormation,
    home_formation_name: homeProf.name_zh,
    away_formation_name: awayProf.name_zh,
    is_available: true,
    status: 'ACTIVE',
    clash_verdict: verdict,
    clash_verdict_zh: verdictZh,
    formation_clash_score: clashScore,
    midfield_battle: {
      winner: midWinner,
      home_midfielders: homeMids,
      away_midfielders: awayMids,
      analysis_zh: midAnalysis
    },
    flank_battle: {
      winner: flankWinner,
      analysis_zh: flankAnalysis
    },
    box_and_backline_battle: {
      home_attack_vs_away_defense_zh: `${homeProf.attacking_shape_zh} vs 客队 ${awayProf.defensive_shape_zh}`,
      away_attack_vs_home_defense_zh: `${awayProf.attacking_shape_zh} vs 主队 ${homeProf.defensive_shape_zh}`
    },
    home_exploit_points_zh: homeExploitPoints,
    away_exploit_points_zh: awayExploitPoints,
    expected_pace_and_goals: paceType,
    expected_pace_zh: paceZh,
    betting_implications: {
      handicap_angle_zh: handicapAngle,
      total_goals_angle_zh: totalGoalsAngle,
      corner_threat_angle_zh: cornerAngle,
      recommended_play_focus: recommendedFocus
    },
    master_tactical_breakdown_zh: summaryZh
  };
}

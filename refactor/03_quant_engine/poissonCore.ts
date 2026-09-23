/**
 * @file poissonCore.ts
 * @description Layer 03 M4 子模块：泊松核心数学基础（联赛 DNA 基准、PMF、盘口解析、支持上界）
 *
 * 从 poissonDecayModel.ts 拆分（原子任务 D / P1-1）。
 * 遵循红线：纯函数无副作用、强类型零 any、完全可测试。
 */

/**
 * 常见联赛历史场均进球基准 (League DNA Base Total Goals)
 */
export const LEAGUE_DNA_MAP: Record<string, number> = {
  // 高进球联赛 (>= 3.0)
  '荷甲': 3.12, '荷乙': 3.25, '德甲': 3.18, '德乙': 3.08, '瑞士超': 3.05,
  '挪超': 3.02, '瑞典超': 2.88, '奥甲': 2.95, '冰岛超': 3.20,
  // 中性主流联赛 (2.5 ~ 2.9)
  '英超': 3.20, '西甲': 2.58, '意甲': 2.62, '法甲': 2.70, '葡超': 2.65,
  '欧冠': 3.05, '欧联': 2.90, '欧协联': 2.92, '中超': 2.95, '韩K联': 2.55, '日职联': 2.52,
  // 防守/低进球联赛 (<= 2.4)
  '西乙': 2.18, '法乙': 2.22, '意乙': 2.32, '阿甲': 2.15, '巴甲': 2.38,
  '日职乙': 2.36, '希腊超': 2.30, '俄超': 2.40,
};

/**
 * 联赛全称 → 简称 别名映射表，用于把实际数据中的全称联赛名（如「俄罗斯超级联赛」）
 * 归一化为 LEAGUE_DNA_MAP 的简称 key，避免子串匹配失败回退到默认值。
 */
const LEAGUE_ALIAS_MAP: ReadonlyArray<readonly [string, string]> = [
  // 五大联赛
  ['英格兰超级联赛', '英超'],
  ['西班牙甲级联赛', '西甲'], ['西班牙甲组联赛', '西甲'],
  ['意大利甲级联赛', '意甲'], ['意大利甲组联赛', '意甲'],
  ['德国甲级联赛', '德甲'], ['德国甲组联赛', '德甲'],
  ['法国甲级联赛', '法甲'], ['法国甲组联赛', '法甲'],
  // 欧洲其他
  ['葡萄牙超级联赛', '葡超'],
  ['荷兰甲级联赛', '荷甲'], ['荷兰乙级联赛', '荷乙'],
  ['德国乙级联赛', '德乙'], ['西班牙乙级联赛', '西乙'],
  ['法国乙级联赛', '法乙'], ['意大利乙级联赛', '意乙'],
  ['俄罗斯超级联赛', '俄超'], ['希腊超级联赛', '希腊超'],
  ['奥地利甲级联赛', '奥甲'], ['瑞士超级联赛', '瑞士超'],
  ['挪威超级联赛', '挪超'], ['瑞典超级联赛', '瑞典超'],
  ['冰岛超级联赛', '冰岛超'],
  // 亚洲
  ['中国超级联赛', '中超'], ['韩国K联赛', '韩K联'], ['韩国K1联赛', '韩K联'],
  ['日本职业联赛', '日职联'], ['日本职业足球联赛', '日职联'],
  ['日本乙级联赛', '日职乙'],
  // 美洲
  ['阿根廷甲级联赛', '阿甲'], ['巴西甲级联赛', '巴甲'],
  // 欧战
  ['欧洲冠军联赛', '欧冠'], ['欧洲联赛', '欧联'], ['欧洲协会联赛', '欧协联'],
];

/**
 * 获取联赛基准进球数 (模糊子串匹配，支持全名与别名)
 */
export function getLeagueBaseGoals(leagueName: string, defaultGoals: number = 2.75): number {
  if (!leagueName) return defaultGoals;
  // 全称别名归一化为简称，提升全称联赛名的匹配覆盖率
  let normalized = leagueName;
  for (const [full, short] of LEAGUE_ALIAS_MAP) {
    if (normalized.includes(full)) {
      normalized = normalized.replace(full, short);
      break;
    }
  }
  for (const [key, val] of Object.entries(LEAGUE_DNA_MAP)) {
    if (normalized.includes(key)) return val;
  }
  return defaultGoals;
}

export function poissonSupportUpperBound(lambda: number): number {
  return Math.max(12, Math.ceil(lambda + 10 * Math.sqrt(lambda + 1)));
}

/**
 * 泊松概率质量函数 (Poisson Probability Mass Function)
 * P(X = k) = (lambda^k * e^(-lambda)) / k!
 */
export function poissonPMF(k: number, lambda: number): number {
  if (lambda <= 0) {
    return k === 0 ? 1.0 : 0.0;
  }
  if (k < 0) {
    return 0.0;
  }

  let factorial = 1.0;
  for (let i = 2; i <= k; i++) {
    factorial *= i;
  }

  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}

export const PREDICTION_CATEGORIES = [
  '波胆',
  '双方是否进球',
  '总进球单双',
  '主队进球数',
  '客队进球数',
  '总进球数',
  '进球时间段',
] as const;

export const BETTABLE_CATEGORIES = [
  '全场大小球',
  '半场大小球',
  '全场让球',
  '半场让球',
  '全场独赢1X2',
] as const;

export const ALL_12_CATEGORIES = [
  ...BETTABLE_CATEGORIES,
  ...PREDICTION_CATEGORIES,
] as const;

/**
 * Normalizes match evaluation output from AI:
 * - Expands compact `predictions` object into standard prediction market assessment items.
 * - Fills in any missing real or prediction market categories with standard defaults.
 */
export function normalizeMatchPredictionsAndAssessments(match: any): any {
  if (!match || typeof match !== 'object') return match;

  const assessments: any[] = Array.isArray(match.market_assessments) ? [...match.market_assessments] : [];
  const existingMap = new Map<string, any>(assessments.map((item) => [String(item?.category || ''), item]));

  // If match has a top-level recommendation with a category not in market_assessments, add it
  if (match.recommendation && match.recommendation.category && !existingMap.has(match.recommendation.category)) {
    const rec = match.recommendation;
    const recAssessment = {
      category: rec.category,
      market: rec.market || rec.category,
      market_option_id: rec.market_option_id || null,
      direction: rec.direction ? `${rec.direction} ${rec.line || ''}`.trim() : '推荐方向',
      line: rec.line || null,
      odds: Number(rec.odds) || null,
      probability: Number(rec.probability) || null,
      grade: rec.grade || 'B',
      status: rec.grade === 'A' || rec.grade === 'B' ? 'recommend' : rec.grade === 'C' ? 'watch' : 'avoid',
      reason: rec.reason || 'AI推荐方向',
      risk: rec.risk || '盘口正常波动风险',
      pro_trader_tip: rec.best_timing_tip || rec.pro_trader_tip || null,
    };
    assessments.push(recAssessment);
    existingMap.set(rec.category, recAssessment);
  }

  // Ensure all 5 bettable market categories exist in market_assessments
  for (const bettableCat of BETTABLE_CATEGORIES) {
    if (!existingMap.has(bettableCat)) {
      const defaultBettable = {
        category: bettableCat,
        market: bettableCat,
        market_option_id: null,
        direction: '暂无可靠方向',
        line: null,
        odds: null,
        probability: null,
        grade: 'NO_BET',
        status: 'unavailable',
        reason: '该玩法当前无明显价值边际或数据不足',
        risk: '暂无投注价值',
        pro_trader_tip: null,
      };
      assessments.push(defaultBettable);
      existingMap.set(bettableCat, defaultBettable);
    }
  }

  const preds = match.predictions && typeof match.predictions === 'object' ? match.predictions : {};

  const getPredictionValue = (keys: string[], defaultValue: string): string => {
    for (const key of keys) {
      if (preds[key] !== undefined && preds[key] !== null && preds[key] !== '') {
        return String(preds[key]).trim();
      }
    }
    return defaultValue;
  };

  const predictionConfigs: Array<{
    category: string;
    keys: string[];
    defaultDirection: string;
    defaultReason: string;
  }> = [
    {
      category: '波胆',
      keys: ['correct_score', 'score', '波胆', 'full_correct_score'],
      defaultDirection: '1-0',
      defaultReason: '模型比分预测',
    },
    {
      category: '双方是否进球',
      keys: ['both_to_score', 'btts', '双方是否进球', '双方进球'],
      defaultDirection: '否',
      defaultReason: '双方进球概率评估',
    },
    {
      category: '总进球单双',
      keys: ['total_goals_odd_even', 'odd_even', '总进球单双', '单双'],
      defaultDirection: '单',
      defaultReason: '进球单双分布',
    },
    {
      category: '主队进球数',
      keys: ['home_goals', '主队进球数', 'home_team_goals'],
      defaultDirection: '1球',
      defaultReason: '主队进球期望',
    },
    {
      category: '客队进球数',
      keys: ['away_goals', '客队进球数', 'away_team_goals'],
      defaultDirection: '0球',
      defaultReason: '客队进球期望',
    },
    {
      category: '总进球数',
      keys: ['total_goals', '总进球数', 'exact_total_goals'],
      defaultDirection: '2球',
      defaultReason: '综合进球数期望',
    },
    {
      category: '进球时间段',
      keys: ['goal_time_window', 'timing', '进球时间段', 'goal_window', 'time_window'],
      defaultDirection: '61-75分钟',
      defaultReason: '进球高发时段分析',
    },
  ];

  for (const config of predictionConfigs) {
    if (!existingMap.has(config.category)) {
      const direction = getPredictionValue(config.keys, config.defaultDirection);
      const newAssessment = {
        category: config.category,
        market: 'prediction',
        market_option_id: null,
        direction,
        line: null,
        odds: null,
        odds_source: null,
        probability: null,
        probability_scope: 'simplified settlement',
        implied_probability: null,
        value_edge: null,
        grade: 'NO_BET',
        status: 'prediction',
        reason: config.defaultReason,
        evidence_refs: ['live_statistics'],
        risk: '随机性与离散度较高',
      };
      assessments.push(newAssessment);
      existingMap.set(config.category, newAssessment);
    }
  }

  // Generate or normalize pro trader strategy guide if not present
  let proStrategy = match.pro_strategy_guide || null;
  if (!proStrategy && match.recommendation && ['A', 'B'].includes(String(match.recommendation.grade || match.grade || ''))) {
    const recMarket = String(match.recommendation.category || match.recommendation.market || '');
    const recLine = String(match.recommendation.line || '');
    const min = Number(match.minute || 0);

    if (min >= 75) {
      proStrategy = {
        strategy_name: '策略 C：终局绝杀与盘口收割 (Late Goal Squeeze)',
        action_path: `比赛进入第 ${min} 分钟尾盘高风险高回报窗口。重点关注 ${recMarket} ${recLine}，捕捉终局防守脱节与补时破门机会。`,
        trigger_conditions: '落后方全线压上、连续制造角球或射门压制',
      };
    } else if (min >= 40 && min <= 60 && recMarket.includes('大小球')) {
      proStrategy = {
        strategy_name: '策略 A：半场测试 + 下半场动态追加 (Probe & Scale-in)',
        action_path: `半场数据验证通过，建议下半场盘口下调或降水后果断追加 ${recMarket} ${recLine}。若下半场前15分钟节奏骤降则停止追加。`,
        trigger_conditions: '半场射门与危险进攻持续高企，下半场换上主力攻击手',
      };
    } else if (recMarket.includes('让球') || recMarket.includes('独赢')) {
      proStrategy = {
        strategy_name: '策略 B：让球盘与大小球联动对冲 (Handicap & Goal Correlation)',
        action_path: `锁定核心优势方向 ${recMarket} ${recLine}。若早早领先且对手反扑无力，可联动锁定全场小球做保护。`,
        trigger_conditions: '取得领先后对手阵型变化与换人反扑力度',
      };
    } else {
      proStrategy = {
        strategy_name: '标准价值投注策略 (Straight Value Execution)',
        action_path: `按单注正期望值模型执行 ${recMarket} ${recLine} @${match.recommendation.odds || '--'}。`,
        trigger_conditions: '盘口水位保持在安全边际内',
      };
    }
  }

  return {
    ...match,
    pro_strategy_guide: proStrategy,
    market_assessments: assessments,
  };
}

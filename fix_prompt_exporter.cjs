const fs = require('fs');

let str = fs.readFileSync('refactor/04_ai_evaluator/promptExporter.ts', 'utf8');

const regexReplace = /const tactical_phase_transitions: string\[\] = \[\];[\s\S]*?const expectedRemaining/m;

const replacement = `const tactical_phase_transitions: string[] = [];
    if (match.timing?.stage === MatchStage.LIVE) {
      tactical_phase_transitions.push(\`[0'-15'] 均衡拉锯 (基于03层宏观数据与先验基础定调)\`);
      if (quantFeatures.timeline) {
        const elapsed = match.timing.minute ?? 0;
        const domSide = quantFeatures.timeline.dominance_side === 'home' ? '主队' : (quantFeatures.timeline.dominance_side === 'away' ? '客队' : '均衡');
        if (elapsed > 15) {
          tactical_phase_transitions.push(\`[16'-\${elapsed}'] 战术相变 (根据当前动量：5分钟短斜率 \${quantFeatures.timeline.slope_5m.toFixed(1)}，15分钟净积分 \${quantFeatures.timeline.integral_15m.net.toFixed(1)}，当前统治方: \${domSide})\`);
        }
        if (quantFeatures.timeline.is_sustained_siege) {
          tactical_phase_transitions.push(\`[当前阶段] 持续围攻态势 (BDI压制指数达到 \${quantFeatures.battlefield_dominance_index.toFixed(2)})\`);
        }
      }
    }

    const lineup_value_matrix = {
      home: { 
        total_value_eur: quantFeatures.context.lineup_impact.home_market_value_num > 0 ? \`\${quantFeatures.context.lineup_impact.home_market_value_num}万欧\` : '未知', 
        lis_score: quantFeatures.context.lineup_impact.home_lis,
        status: quantFeatures.context.lineup_impact.home_lis < 0.75 ? "战意不明/存在轮换可能 (缺失核心)" : "主力框架完整" 
      },
      away: { 
        total_value_eur: quantFeatures.context.lineup_impact.away_market_value_num > 0 ? \`\${quantFeatures.context.lineup_impact.away_market_value_num}万欧\` : '未知', 
        lis_score: quantFeatures.context.lineup_impact.away_lis,
        status: quantFeatures.context.lineup_impact.away_lis < 0.75 ? "战意不明/存在轮换可能 (缺失核心)" : "主力框架完整" 
      }
    };

    const homeAnalytics = quantFeatures.context.recent_form_analytics?.home;
    const awayAnalytics = quantFeatures.context.recent_form_analytics?.away;
    
    // Extract Physical stats if available (Dangerous Attacks, Corners, etc)
    const pStats = quantFeatures.physical_stats;
    const homeDA = pStats.available_metrics.dangerous_attacks ? (match.reference?.stats?.dangerous_attacks?.home ?? '未知') : '未知';
    const awayDA = pStats.available_metrics.dangerous_attacks ? (match.reference?.stats?.dangerous_attacks?.away ?? '未知') : '未知';
    const homeCorners = pStats.available_metrics.corners ? (match.reference?.stats?.corners?.home ?? '未知') : '未知';
    const awayCorners = pStats.available_metrics.corners ? (match.reference?.stats?.corners?.away ?? '未知') : '未知';

    const team_profiling = {
      home: {
        recent_timeline: homeAnalytics ? \`样本数: \${homeAnalytics.sample_count}, 场均得失球: \${homeAnalytics.weighted_scored_per_game.toFixed(2)} / \${homeAnalytics.weighted_conceded_per_game.toFixed(2)}\` : "近期战绩缺失",
        tactical_playstyle: \`危攻: \${homeDA}, 角球: \${homeCorners}, xT威胁代理: \${pStats.xt_proxy.home_xt.toFixed(2)}\`,
        market_performance: homeAnalytics ? \`赢盘率(ATS): \${(homeAnalytics.handicap_win_rate * 100).toFixed(1)}%, 大球率: \${(homeAnalytics.over_goals_rate * 100).toFixed(1)}%\` : "缺乏历史盘路数据"
      },
      away: {
        recent_timeline: awayAnalytics ? \`样本数: \${awayAnalytics.sample_count}, 场均得失球: \${awayAnalytics.weighted_scored_per_game.toFixed(2)} / \${awayAnalytics.weighted_conceded_per_game.toFixed(2)}\` : "近期战绩缺失",
        tactical_playstyle: \`危攻: \${awayDA}, 角球: \${awayCorners}, xT威胁代理: \${pStats.xt_proxy.away_xt.toFixed(2)}\`,
        market_performance: awayAnalytics ? \`赢盘率(ATS): \${(awayAnalytics.handicap_win_rate * 100).toFixed(1)}%, 大球率: \${(awayAnalytics.over_goals_rate * 100).toFixed(1)}%\` : "缺乏历史盘路数据"
      }
    };

    const expectedRemaining`;

str = str.replace(regexReplace, replacement);
fs.writeFileSync('refactor/04_ai_evaluator/promptExporter.ts', str);

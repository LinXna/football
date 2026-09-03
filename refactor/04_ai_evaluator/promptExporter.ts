import { CanonicalMatch } from '../02_canonical_model/types.js';
import { MatchStage } from '../02_canonical_model/enums.js';
import { extractAiEvaluationBrief } from '../02_canonical_model/canonicalMatchAssembler.js';
import { calculateQuantitativeFeatures } from '../03_quant_engine/index.js';
import { buildSystemPrompt } from './promptBuilder.js';

export function generateRefactoredPrompt(
  canonicalMatches: CanonicalMatch[], 
  mode: 'live_eval' | 'prematch_eval' | 'parlay_check' = 'live_eval'
): { finalPrompt: string; matchCount: number } {
  const validPayloads: any[] = [];
  
  for (const match of canonicalMatches) {
    const quantFeatures = calculateQuantitativeFeatures(match);
    const aiBrief = extractAiEvaluationBrief(match);

    

    const tactical_phase_transitions: string[] = [];
    if (match.timing?.stage === MatchStage.LIVE) {
      if (quantFeatures.timeline) {
        const elapsed = match.timing.minute ?? 0;
        const domSide = quantFeatures.timeline.dominance_side === 'home' ? '主队' : (quantFeatures.timeline.dominance_side === 'away' ? '客队' : '均衡');
        if (elapsed <= 15) {
           tactical_phase_transitions.push(`[0'-15'] 比赛初段定调 (当前统治方: ${domSide})`);
        }
        if (elapsed > 15) {
          tactical_phase_transitions.push(`[16'-${elapsed}'] 战术相变 (根据当前动量：5分钟短斜率 ${quantFeatures.timeline.slope_5m.toFixed(1)}，15分钟净积分 ${quantFeatures.timeline.integral_15m.net.toFixed(1)}，当前统治方: ${domSide})`);
        }
        if (quantFeatures.timeline.is_sustained_siege) {
          tactical_phase_transitions.push(`[当前阶段] 持续围攻态势 (BDI压制指数达到 ${quantFeatures.battlefield_dominance_index.toFixed(2)})`);
        }
      } else {
        tactical_phase_transitions.push(`[警告] 缺乏实时战术相变与动量数据`);
      }
    }

    const hasLineupData = !!match.reference?.lineups;
    const pStats = quantFeatures.physical_stats;
    const hasDA = !!pStats.available_metrics.dangerous_attacks;
    const homeAnalytics = quantFeatures.context.recent_form_analytics?.home;
    const awayAnalytics = quantFeatures.context.recent_form_analytics?.away;
    const hasHistoricalForm = !!(homeAnalytics && homeAnalytics.sample_count > 0 && awayAnalytics && awayAnalytics.sample_count > 0);

    const lineup_value_matrix = {
      home: { 
        total_value_eur: (!hasLineupData || quantFeatures.context.lineup_impact.home_market_value_num === 0) ? '未知' : `${quantFeatures.context.lineup_impact.home_market_value_num}万欧`, 
        lis_score: !hasLineupData ? "N/A" : quantFeatures.context.lineup_impact.home_lis,
        status: !hasLineupData ? "数据盲区 / 阵容明细不详 (Lineup Data Unavailable)" : (quantFeatures.context.lineup_impact.home_lis < 0.75 ? "战意不明/存在轮换可能 (缺失核心)" : "主力框架完整") 
      },
      away: { 
        total_value_eur: (!hasLineupData || quantFeatures.context.lineup_impact.away_market_value_num === 0) ? '未知' : `${quantFeatures.context.lineup_impact.away_market_value_num}万欧`, 
        lis_score: !hasLineupData ? "N/A" : quantFeatures.context.lineup_impact.away_lis,
        status: !hasLineupData ? "数据盲区 / 阵容明细不详 (Lineup Data Unavailable)" : (quantFeatures.context.lineup_impact.away_lis < 0.75 ? "战意不明/存在轮换可能 (缺失核心)" : "主力框架完整") 
      }
    };

    // Extract Physical stats if available (Dangerous Attacks, Corners, etc)
    const homeDA = hasDA ? (match.reference?.stats?.dangerous_attacks?.home ?? '未知') : '数据盲区';
    const awayDA = hasDA ? (match.reference?.stats?.dangerous_attacks?.away ?? '未知') : '数据盲区';
    const homeCorners = pStats.available_metrics.corners ? (match.reference?.stats?.corners?.home ?? '未知') : '数据盲区';
    const awayCorners = pStats.available_metrics.corners ? (match.reference?.stats?.corners?.away ?? '未知') : '数据盲区';
    const homeXtStr = hasDA ? pStats.xt_proxy.home_xt.toFixed(2) : "数据缺失(N/A)";
    const awayXtStr = hasDA ? pStats.xt_proxy.away_xt.toFixed(2) : "数据缺失(N/A)";

    const team_profiling = {
      home: {
        recent_timeline: (homeAnalytics && homeAnalytics.sample_count > 0) ? `样本数: ${homeAnalytics.sample_count}, 场均得失球: ${homeAnalytics.weighted_scored_per_game.toFixed(2)} / ${homeAnalytics.weighted_conceded_per_game.toFixed(2)}` : "数据盲区 / 近期战绩样本不足 (Sample Count: 0)",
        tactical_playstyle: `危攻: ${homeDA}, 角球: ${homeCorners}, xT威胁代理: ${homeXtStr}`,
        market_performance: (homeAnalytics && homeAnalytics.sample_count > 0) ? `赢盘率(ATS): ${(homeAnalytics.handicap_win_rate * 100).toFixed(1)}%, 大球率: ${(homeAnalytics.over_goals_rate * 100).toFixed(1)}%` : "缺乏历史盘路数据"
      },
      away: {
        recent_timeline: (awayAnalytics && awayAnalytics.sample_count > 0) ? `样本数: ${awayAnalytics.sample_count}, 场均得失球: ${awayAnalytics.weighted_scored_per_game.toFixed(2)} / ${awayAnalytics.weighted_conceded_per_game.toFixed(2)}` : "数据盲区 / 近期战绩样本不足 (Sample Count: 0)",
        tactical_playstyle: `危攻: ${awayDA}, 角球: ${awayCorners}, xT威胁代理: ${awayXtStr}`,
        market_performance: (awayAnalytics && awayAnalytics.sample_count > 0) ? `赢盘率(ATS): ${(awayAnalytics.handicap_win_rate * 100).toFixed(1)}%, 大球率: ${(awayAnalytics.over_goals_rate * 100).toFixed(1)}%` : "缺乏历史盘路数据"
      }
    };

    // Devig Market Sanitization
    const sanitizedDevig: any = { ...quantFeatures.devig };
    const hasAnyMarket = !!(match.markets?.full_h2h || match.markets?.full_spread_main || match.markets?.full_total_main);
    if (!match.markets?.full_h2h) {
      sanitizedDevig.euro_1x2_devig = "未开盘 (No Market)";
    }
    if (!match.markets?.full_spread_main) {
      sanitizedDevig.spread_main_ev = "未开盘 (No Market)";
    }
    if (!match.markets?.full_total_main) {
      sanitizedDevig.total_main_ev = "未开盘 (No Market)";
    }

    const blindSpots: string[] = [];
    if (!hasLineupData) blindSpots.push("首发阵容不详");
    if (!hasDA && match.timing.stage === MatchStage.LIVE) blindSpots.push("实时危攻射门缺失");
    if (!hasHistoricalForm) blindSpots.push("历史战绩样本不足");
    if (!hasAnyMarket) blindSpots.push("核心盘口完全缺失");

    let data_blind_spot_warning: string | undefined = undefined;
    if (blindSpots.length > 0) {
      data_blind_spot_warning = `【系统最高级别警告】本场比赛存在严重的客观数据盲区: [${blindSpots.join('、')}]。AI 绝对禁止依此凭空捏造实力差距或控场优势。必须将 100% 评估权重转移至已有真实数据 (如可用盘口资金动量)，必须标注 [高波动/盲盒风险]，且最高置信度上限强制锁定在 85 以下，绝对禁止给出 A_GRADE 评级。`;
    }

    const compressedAiBrief = { ...aiBrief, condensed_features: undefined };
    delete compressedAiBrief.condensed_features;

    const expectedRemaining = Math.max(0, 90 - (match.timing?.minute ?? 0)) + (match.timing?.minute && match.timing.minute > 80 ? 6 : 0);

    validPayloads.push({
      ai_brief: compressedAiBrief,
      data_blind_spot_warning,
      time_context: {
        statutory_minute: match.timing?.minute ? `${match.timing.minute}'` : '0',
        expected_remaining_minutes_including_stoppage: expectedRemaining
      },
      tactical_phase_transitions,
      lineup_value_matrix,
      team_profiling,
      quant_features: {
        devig: sanitizedDevig,
        bdi: quantFeatures.battlefield_dominance_index,
        ev_signals: quantFeatures.positive_ev_signals,
        risk_flags: quantFeatures.risk_flags,
        goal_alert: quantFeatures.goal_phase_alert,
        confidence: quantFeatures.confidence_score
      }
    });
  }
  
  if (validPayloads.length === 0) {
    return { finalPrompt: "No valid matches provided.", matchCount: 0 };
  }
  
  const singleSystemPrompt = buildSystemPrompt(mode);
  const batchSystemPrompt = singleSystemPrompt.replace(
    /You must return a valid JSON object matching the following structure EXACTLY:/,
    "You must return a valid JSON ARRAY of objects, matching the following structure EXACTLY for EACH match in the provided payload array:"
  ).replace(
    /DO NOT wrap the JSON in Markdown formatting blocks. Output RAW JSON ONLY./,
    "DO NOT wrap the JSON in Markdown formatting blocks. Output RAW JSON ARRAY ONLY. Return an array containing one object per evaluated match."
  );
  
  const finalPrompt = `========== SYSTEM INSTRUCTION ==========\n${batchSystemPrompt}\n========== USER PAYLOAD (BATCH OF ${validPayloads.length} MATCHES) ==========\n${JSON.stringify(validPayloads, null, 2)}`;
  
  return { finalPrompt, matchCount: validPayloads.length };
}

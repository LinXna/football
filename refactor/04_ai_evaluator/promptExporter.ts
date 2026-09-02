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
      tactical_phase_transitions.push(`[0'-15'] 均衡拉锯 (基于03层宏观数据与先验基础定调)`);
      if (quantFeatures.timeline) {
        const elapsed = match.timing.minute ?? 0;
        const domSide = quantFeatures.timeline.dominance_side === 'home' ? '主队' : (quantFeatures.timeline.dominance_side === 'away' ? '客队' : '均衡');
        if (elapsed > 15) {
          tactical_phase_transitions.push(`[16'-${elapsed}'] 战术相变 (根据当前动量：5分钟短斜率 ${quantFeatures.timeline.slope_5m.toFixed(1)}，15分钟净积分 ${quantFeatures.timeline.integral_15m.net.toFixed(1)}，当前统治方: ${domSide})`);
        }
        if (quantFeatures.timeline.is_sustained_siege) {
          tactical_phase_transitions.push(`[当前阶段] 持续围攻态势 (BDI压制指数达到 ${quantFeatures.battlefield_dominance_index.toFixed(2)})`);
        }
      }
    }

    const lineup_value_matrix = {
      home: { 
        total_value_eur: quantFeatures.context.lineup_impact.home_market_value_num > 0 ? `${quantFeatures.context.lineup_impact.home_market_value_num}万欧` : '未知', 
        lis_score: quantFeatures.context.lineup_impact.home_lis,
        status: quantFeatures.context.lineup_impact.home_lis < 0.75 ? "战意不明/存在轮换可能 (缺失核心)" : "主力框架完整" 
      },
      away: { 
        total_value_eur: quantFeatures.context.lineup_impact.away_market_value_num > 0 ? `${quantFeatures.context.lineup_impact.away_market_value_num}万欧` : '未知', 
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
        recent_timeline: homeAnalytics ? `样本数: ${homeAnalytics.sample_count}, 场均得失球: ${homeAnalytics.weighted_scored_per_game.toFixed(2)} / ${homeAnalytics.weighted_conceded_per_game.toFixed(2)}` : "近期战绩缺失",
        tactical_playstyle: `危攻: ${homeDA}, 角球: ${homeCorners}, xT威胁代理: ${pStats.xt_proxy.home_xt.toFixed(2)}`,
        market_performance: homeAnalytics ? `赢盘率(ATS): ${(homeAnalytics.handicap_win_rate * 100).toFixed(1)}%, 大球率: ${(homeAnalytics.over_goals_rate * 100).toFixed(1)}%` : "缺乏历史盘路数据"
      },
      away: {
        recent_timeline: awayAnalytics ? `样本数: ${awayAnalytics.sample_count}, 场均得失球: ${awayAnalytics.weighted_scored_per_game.toFixed(2)} / ${awayAnalytics.weighted_conceded_per_game.toFixed(2)}` : "近期战绩缺失",
        tactical_playstyle: `危攻: ${awayDA}, 角球: ${awayCorners}, xT威胁代理: ${pStats.xt_proxy.away_xt.toFixed(2)}`,
        market_performance: awayAnalytics ? `赢盘率(ATS): ${(awayAnalytics.handicap_win_rate * 100).toFixed(1)}%, 大球率: ${(awayAnalytics.over_goals_rate * 100).toFixed(1)}%` : "缺乏历史盘路数据"
      }
    };

    const compressedAiBrief = { ...aiBrief, condensed_features: undefined };
    delete compressedAiBrief.condensed_features;

    const expectedRemaining = Math.max(0, 90 - (match.timing?.minute ?? 0)) + (match.timing?.minute && match.timing.minute > 80 ? 6 : 0);

    validPayloads.push({
      ai_brief: compressedAiBrief,
      time_context: {
        statutory_minute: match.timing?.minute ? `${match.timing.minute}'` : '0',
        expected_remaining_minutes_including_stoppage: expectedRemaining
      },
      tactical_phase_transitions,
      lineup_value_matrix,
      team_profiling,
      quant_features: {
        devig: quantFeatures.devig,
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

const fs = require('fs');

const content = `import { CanonicalMatch, MatchStage } from '../02_canonical_model/types.js';
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

    const available_markets: any = { asian_handicap: [], total_goals: [], euro_1x2: [] };
    
    if (aiBrief.core_markets) {
      if (aiBrief.core_markets.ah_main) {
        available_markets.asian_handicap.push({ line: aiBrief.core_markets.ah_main.handicap, home: aiBrief.core_markets.ah_main.home_odds, away: aiBrief.core_markets.ah_main.away_odds });
      }
      if (aiBrief.core_markets.ou_main) {
         available_markets.total_goals.push({ line: aiBrief.core_markets.ou_main.handicap, over: aiBrief.core_markets.ou_main.over_odds, under: aiBrief.core_markets.ou_main.under_odds });
      }
      if (aiBrief.core_markets.euro_1x2) {
         available_markets.euro_1x2.push({ line: "0", home: aiBrief.core_markets.euro_1x2.home_win, draw: aiBrief.core_markets.euro_1x2.draw, away: aiBrief.core_markets.euro_1x2.away_win });
      }
    }

    const tactical_phase_transitions: string[] = [];
    if (match.timing?.stage === MatchStage.LIVE) {
      const elapsed = match.timing.minute ?? 0;
      tactical_phase_transitions.push(\`[0'-15'] 均衡拉锯 (基于03层宏观数据与先验基础定调)\`);
      if (elapsed > 15) {
         tactical_phase_transitions.push(\`[16'-\${elapsed}'] 战术相变 (根据当前动量：15min积分与5min短斜率推演，BDI指数达到 \${quantFeatures.battlefield_dominance_index})\`);
      }
    }

    const lineup_value_matrix = {
      home: { total_value_eur: "从03层LIS映射评估", status: "主力框架完整" },
      away: { total_value_eur: "从03层LIS映射评估", status: "主力框架完整" }
    };
    if (quantFeatures.screening_integrity_score < 70) {
      lineup_value_matrix.home.status = "战意不明/存在轮换可能";
      lineup_value_matrix.away.status = "战意不明/存在轮换可能";
    }

    const team_profiling = {
      home: {
        recent_timeline: "近1个月高优比赛",
        tactical_playstyle: "根据 9项基础数据综合画像提取 (攻防倾向与角球创造力)",
        market_performance: "历史让球盘履历 (ATS胜率)"
      },
      away: {
        recent_timeline: "近1个月高优比赛",
        tactical_playstyle: "结合控球与反击效率画像 (反击刺客属性)",
        market_performance: "受让方抗压能力"
      }
    };

    const compressedAiBrief = { ...aiBrief, condensed_features: undefined };
    delete compressedAiBrief.condensed_features;

    const expectedRemaining = Math.max(0, 90 - (match.timing?.minute ?? 0)) + (match.timing?.minute && match.timing.minute > 80 ? 6 : 0);

    validPayloads.push({
      ai_brief: compressedAiBrief,
      available_markets,
      time_context: {
        statutory_minute: match.timing?.minute ? \`\${match.timing.minute}'\` : '0',
        expected_remaining_minutes_including_stoppage: expectedRemaining
      },
      tactical_phase_transitions,
      lineup_value_matrix,
      team_profiling,
      key_quant_signals: {
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
    /DO NOT wrap the JSON in Markdown formatting blocks\. Output RAW JSON ONLY\./,
    "DO NOT wrap the JSON in Markdown formatting blocks. Output RAW JSON ARRAY ONLY. Return an array containing one object per evaluated match."
  );
  
  const finalPrompt = \`========== SYSTEM INSTRUCTION ==========\\n\${batchSystemPrompt}\\n========== USER PAYLOAD (BATCH OF \${validPayloads.length} MATCHES) ==========\\n\${JSON.stringify(validPayloads, null, 2)}\`;
  
  return { finalPrompt, matchCount: validPayloads.length };
}
`;
fs.writeFileSync('refactor/04_ai_evaluator/promptExporter.ts', content);
console.log("Done updating promptExporter.ts");

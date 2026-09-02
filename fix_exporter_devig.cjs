const fs = require('fs');

let str = fs.readFileSync('refactor/04_ai_evaluator/promptExporter.ts', 'utf8');

// Remove available_markets block entirely
const regexAvailableMarkets = /const available_markets: any = \{ asian_handicap: \[\], total_goals: \[\], euro_1x2: \[\] \};\s*if \(aiBrief\.core_markets\) \{[\s\S]*?\}\s*\}/m;
str = str.replace(regexAvailableMarkets, "");

// Replace validPayloads.push object
const regexPush = /validPayloads\.push\(\{\s*ai_brief: compressedAiBrief,\s*available_markets,\s*time_context/m;
str = str.replace(regexPush, `validPayloads.push({
      ai_brief: compressedAiBrief,
      time_context`);
      
// Replace key_quant_signals with quant_features
const regexSignals = /key_quant_signals: \{\s*bdi: quantFeatures.battlefield_dominance_index,\s*ev_signals: quantFeatures.positive_ev_signals,\s*risk_flags: quantFeatures.risk_flags,\s*goal_alert: quantFeatures.goal_phase_alert,\s*confidence: quantFeatures.confidence_score\s*\}/m;

str = str.replace(regexSignals, `quant_features: {
        devig: quantFeatures.devig,
        bdi: quantFeatures.battlefield_dominance_index,
        ev_signals: quantFeatures.positive_ev_signals,
        risk_flags: quantFeatures.risk_flags,
        goal_alert: quantFeatures.goal_phase_alert,
        confidence: quantFeatures.confidence_score
      }`);

fs.writeFileSync('refactor/04_ai_evaluator/promptExporter.ts', str);

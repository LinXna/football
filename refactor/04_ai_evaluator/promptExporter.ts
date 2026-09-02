
import { CanonicalMatch } from '../02_canonical_model/types.js';
import { extractAiEvaluationBrief } from '../02_canonical_model/canonicalMatchAssembler.js';
import { calculateQuantitativeFeatures } from '../03_quant_engine/index.js';
import { buildSystemPrompt } from './promptBuilder.js';

export function generateRefactoredPrompt(
  canonicalMatches: CanonicalMatch[], 
  mode: 'live_eval' | 'prematch_eval' | 'parlay_check' = 'live_eval'
): { finalPrompt: string; matchCount: number } {
  const validPayloads: any[] = [];
  
  for (const canonicalMatch of canonicalMatches) {
    const quantFeatures = calculateQuantitativeFeatures(canonicalMatch);
    
    // Ignore fatal check here to let AI evaluate all selected.
    const aiBrief = extractAiEvaluationBrief(canonicalMatch);
    
    // 🔥 EXTREME COMPRESSION 🔥
    // We only pass the most critical high-density features to avoid Needle-in-a-Haystack problem
    // and prevent 500K character payloads.
    validPayloads.push({
      ai_brief: aiBrief,
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
    /DO NOT wrap the JSON in Markdown formatting blocks. Output RAW JSON ONLY./,
    "DO NOT wrap the JSON in Markdown formatting blocks. Output RAW JSON ARRAY ONLY. Return an array `[` ... `]` containing one object per evaluated match."
  );
  
  const finalPrompt = `========== SYSTEM INSTRUCTION ==========
${batchSystemPrompt}

========== USER PAYLOAD (BATCH OF ${validPayloads.length} MATCHES) ==========
${JSON.stringify(validPayloads, null, 2)}`;
  
  return { finalPrompt, matchCount: validPayloads.length };
}

import { GoogleGenAI, Type, Schema } from '@google/genai';
import { EvaluatorPayload, AiEvaluationResult } from './types.js';
import { RecommendationGrade, TacticalRegimeEvaluation, TrapDetectionResult } from './enums.js';
import { buildSystemPrompt, buildUserPrompt } from './promptBuilder.js';
import { verifyStatutoryAlignment } from './alignmentGuard.js';

export class AiEvaluatorService {
  private ai: GoogleGenAI;
  
  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for AiEvaluatorService');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  private get responseSchema(): Schema {
    return {
      type: Type.OBJECT,
      properties: {
        blind_spot_analysis: {
          type: Type.OBJECT,
          properties: {
            "1_global_motivation": { type: Type.STRING },
            "2_asian_handicap_reality": { type: Type.STRING },
            "3_total_goals_reality": { type: Type.STRING },
            tactical_regime_evaluation: { 
              type: Type.STRING, 
              enum: ['GENUINE_DOMINANCE', 'BARREN_DOMINANCE', 'RECIPROCAL_CHAOS', 'TACTICAL_STALEMATE'] 
            },
            trap_detection_result: { 
              type: Type.STRING, 
              enum: ['SAFE_VALUE', 'POTENTIAL_TRAP', 'CONFIRMED_TRAP', 'UNCERTAIN'] 
            }
          },
          required: ['1_global_motivation', '2_asian_handicap_reality', '3_total_goals_reality', 'tactical_regime_evaluation', 'trap_detection_result']
        },
        internal_logical_audit: { type: Type.STRING },
        grade: { type: Type.STRING, enum: ['A_GRADE', 'B_GRADE', 'C_GRADE', 'WATCH', 'RESEARCH', 'REJECTED'] },
        confidence_score: { type: Type.INTEGER },
        qualitative_summary: { type: Type.STRING },
        risk_warnings: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        recommended_legs: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              market: { type: Type.STRING, enum: ['ASIAN_HANDICAP_MAIN', 'TOTAL_GOALS_MAIN', 'EURO_1X2'] },
              selected_line: { type: Type.STRING },
              current_odds: { type: Type.NUMBER },
              minimum_acceptable_odds: { type: Type.NUMBER },
              direction: { type: Type.STRING, enum: ['HOME', 'AWAY', 'OVER', 'UNDER', 'DRAW', 'NONE'] },
              basis: { type: Type.STRING }
            },
            required: ['market', 'selected_line', 'current_odds', 'minimum_acceptable_odds', 'direction', 'basis']
          }
        }
      },
      required: ['blind_spot_analysis', 'internal_logical_audit', 'grade', 'confidence_score', 'qualitative_summary', 'risk_warnings', 'recommended_legs']
    };
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async evaluateMatch(payload: EvaluatorPayload, maxRetries = 3): Promise<AiEvaluationResult> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(payload);

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.1, 
            responseMimeType: 'application/json',
            responseSchema: this.responseSchema,
          }
        });

        if (!response.text) {
          throw new Error('Empty response from AI Evaluator');
        }

        const rawResult = JSON.parse(response.text);
        
        const result: AiEvaluationResult = {
          match_id: payload.ai_brief.match_id ?? 'unknown_match',
          evaluation_time: new Date().toISOString(),
          ...rawResult
        };

        // Apply alignment guard
        return verifyStatutoryAlignment(result, payload);

      } catch (error: unknown) {
        attempt++;
        const errMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[AiEvaluatorService] AI Evaluation failed on attempt ${attempt}: ${errMessage}`);
        
        if (attempt >= maxRetries) {
          console.error(`[AiEvaluatorService] Exhausted retries. Returning graceful fallback REJECTED.`);
          return this.createFallbackResult(payload, errMessage);
        }
        
        // Exponential backoff
        await this.sleep(1000 * Math.pow(2, attempt - 1));
      }
    }

    return this.createFallbackResult(payload, 'Unknown Loop Exit');
  }

  private createFallbackResult(payload: EvaluatorPayload, errorMsg: string): AiEvaluationResult {
    return {
      match_id: payload.ai_brief.match_id ?? 'unknown_match',
      evaluation_time: new Date().toISOString(),
      blind_spot_analysis: {
        "1_global_motivation": 'FALLBACK',
        "2_asian_handicap_reality": 'FALLBACK',
        "3_total_goals_reality": 'FALLBACK',
        tactical_regime_evaluation: TacticalRegimeEvaluation.TACTICAL_STALEMATE,
        trap_detection_result: TrapDetectionResult.UNCERTAIN
      },
      internal_logical_audit: 'API request failed completely, fallback triggered.',
      grade: RecommendationGrade.REJECTED,
      confidence_score: 0,
      qualitative_summary: 'Evaluation bypassed due to severe API failure.',
      risk_warnings: [`API_TIMEOUT_FALLBACK: LLM service unavailable or failed (${errorMsg}). Fallback to REJECTED.`],
      recommended_legs: []
    };
  }
}

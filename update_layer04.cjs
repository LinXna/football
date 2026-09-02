const fs = require('fs');

// 1. Update types.ts
let typesStr = fs.readFileSync('refactor/04_ai_evaluator/types.ts', 'utf8');
typesStr = typesStr.replace(
/export interface RecommendedLeg \{[\s\S]*?\}/,
`export interface RecommendedLeg {
  market: string;
  selected_line: string;
  current_odds: number;
  minimum_acceptable_odds: number;
  direction: 'HOME' | 'AWAY' | 'OVER' | 'UNDER' | 'DRAW' | 'NONE';
  basis: string;
}`
);

typesStr = typesStr.replace(
/export interface BlindSpotChecklist \{[\s\S]*?\}/,
`export interface BlindSpotChecklist {
  "1_global_motivation": string;
  "2_asian_handicap_reality": string;
  "3_total_goals_reality": string;
  tactical_regime_evaluation: TacticalRegimeEvaluation;
  trap_detection_result: TrapDetectionResult;
}`
);
fs.writeFileSync('refactor/04_ai_evaluator/types.ts', typesStr);

// 2. Update aiCaller.ts
let aiCallerStr = fs.readFileSync('refactor/04_ai_evaluator/aiCaller.ts', 'utf8');
aiCallerStr = aiCallerStr.replace(
/properties: \{[\s\S]*?late_game_intent_multiplier[\s\S]*?\},[\s\S]*?required: \['late_game_intent_multiplier'.*?\][\s\S]*?\}/,
`properties: {
            "1_global_motivation": { type: Type.STRING },
            "2_asian_handicap_reality": { type: Type.STRING },
            "3_total_goals_reality": { type: Type.STRING },
            tactical_regime_evaluation: { type: Type.STRING, enum: ['GENUINE_DOMINANCE', 'BARREN_DOMINANCE', 'RECIPROCAL_CHAOS', 'TACTICAL_STALEMATE'] },
            trap_detection_result: { type: Type.STRING, enum: ['SAFE_VALUE', 'POTENTIAL_TRAP', 'CONFIRMED_TRAP', 'UNCERTAIN'] }
          },
          required: ['1_global_motivation', '2_asian_handicap_reality', '3_total_goals_reality', 'tactical_regime_evaluation', 'trap_detection_result']
        }`
);

aiCallerStr = aiCallerStr.replace(
/recommended_legs: \{[\s\S]*?required: \['market', 'line', 'odds', 'direction', 'basis'\][\s\S]*?\}/,
`recommended_legs: {
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
        }`
);

aiCallerStr = aiCallerStr.replace(
/blind_spot_analysis: \{[\s\S]*?lineup_criticality_assessment: 'FALLBACK'[\s\S]*?\}/,
`blind_spot_analysis: {
        "1_global_motivation": 'FALLBACK',
        "2_asian_handicap_reality": 'FALLBACK',
        "3_total_goals_reality": 'FALLBACK',
        tactical_regime_evaluation: TacticalRegimeEvaluation.TACTICAL_STALEMATE,
        trap_detection_result: TrapDetectionResult.UNCERTAIN
      }`
);
fs.writeFileSync('refactor/04_ai_evaluator/aiCaller.ts', aiCallerStr);

console.log("Done updating types and aiCaller.");

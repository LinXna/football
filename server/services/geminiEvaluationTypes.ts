/** Dependencies required by the Gemini evaluation orchestration service. */
export interface GeminiEvaluationDependencies {
  buildPromptData(body: any): any;
  sanitizeMarketAssessment(item: any): any;
  sanitizeParlayLeg(item: any, candidates?: any[]): any;
}


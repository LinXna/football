/** Dependencies required by the Gemini evaluation orchestration service. */
export interface GeminiEvaluationDependencies {
  buildPromptData(body: any, isExportPrompt?: boolean): any;
  parseModelJson(text: string): any;
  sanitizeMarketAssessment(item: any): any;
  sanitizeParlayLeg(item: any, candidateMatches?: any[]): any;
  runModel(prompt: string): Promise<string>;
}

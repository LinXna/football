import type express from 'express';

export function registerGeminiEvaluationRoutes(app: express.Express, handler: express.RequestHandler): void {
  app.post('/api/ai/evaluate', handler);
}

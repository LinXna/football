import type express from 'express';

export function registerBatchSupplementRoutes(app: express.Express, handler: express.RequestHandler): void {
  app.post('/api/batch-supplement', handler);
}

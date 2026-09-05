import type express from 'express';
import { LedgerPersistence } from '../../refactor/05_portfolio_risk/ledgerPersistence';

export function registerRefactorLedgerRoutes(app: express.Express): void {
  app.get('/api/refactor/formal-ledger', (_req, res) => {
    const live = LedgerPersistence.loadLedger('LIVE');
    const prematch = LedgerPersistence.loadLedger('PREMATCH');
    res.json({ success: true, live, prematch, count: live.length + prematch.length });
  });
}

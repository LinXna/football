import type express from 'express';
import { DATA_FILES } from '../dataFiles';
import { readJsonFile } from '../jsonStore';

/** Read-only ledger endpoints. Mutating ledger workflows remain together until their transaction rules are isolated. */
export function registerLedgerReadRoutes(app: express.Express): void {
  app.get('/api/ledger', (_req, res) => {
    res.json(readJsonFile<any[]>(DATA_FILES.ledger.current, []));
  });

  app.get('/api/ledger/archives', (_req, res) => {
    res.json({ archives: readJsonFile<any[]>(DATA_FILES.ledger.archives, []) });
  });
}

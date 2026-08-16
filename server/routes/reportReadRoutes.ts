import type express from 'express';
import { DATA_FILES } from '../dataFiles';
import { readJsonFile } from '../jsonStore';
import { findLatestFile, findLatestReport, readTextIfPresent } from '../services/reportRepository';
import { buildCalibrationReport } from '../services/predictionCalibration';
import { buildInterfaceFeatureCalibration } from '../services/interfaceFeatureCalibration';

/** Read-only reports exposed to the local UI. */
export function registerReportReadRoutes(app: express.Express): void {
  app.get('/api/backtest', (_req, res) => {
    const reportPath = findLatestReport('BACKTEST_REPORT_', DATA_FILES.reports.backtest);
    const formalResultsPath = findLatestFile('formal_results_', '.json', DATA_FILES.reports.formalResults);
    res.json({
      report: readTextIfPresent(reportPath),
      report_file: reportPath.split(/[\\/]/).pop() || null,
      formal_results: readJsonFile(formalResultsPath, {}),
      formal_results_file: formalResultsPath.split(/[\\/]/).pop() || null,
    });
  });
  app.get('/api/calibration', (_req, res) => {
    const ledger = readJsonFile<any[]>(DATA_FILES.ledger.current, []);
    const archives = readJsonFile<any[]>(DATA_FILES.ledger.archives, []);
    const archivedItems = archives.flatMap((archive: any) => Array.isArray(archive?.items) ? archive.items : []);
    const allItems = [...archivedItems, ...ledger];
    res.json({ ...buildCalibrationReport(allItems), interface_features: buildInterfaceFeatureCalibration(allItems) });
  });
}

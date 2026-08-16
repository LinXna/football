/** Runtime JSON contracts shared by API routes and background workflows. */
export const DATA_FILES = {
  aliases: {
    manual: 'team_aliases.json',
    automatic: 'team_aliases_auto.json',
    suppressed: 'team_aliases_suppressed.json',
  },
  live: {
    status: 'output/pipeline_status.json',
    decisions: 'output/ybty_leisu_decisions.json',
    candidates: 'output/ybty_leisu_candidates.json',
    ybtySnapshot: 'output/ybty_latest.json',
    leisuSnapshot: 'output/leisu_latest.json',
  },
  prematch: {
    status: 'output/prematch_pipeline_status.json',
    decisions: 'output/ybty_leisu_prematch_decisions.json',
    candidates: 'output/ybty_leisu_prematch_candidates.json',
    aiBrief: 'output/prematch_ai_brief.json',
    ybtySnapshot: 'output/ybty_prematch_latest.json',
    leisuSnapshot: 'output/leisu_prematch_latest.json',
  },
  ledger: {
    current: 'output/recommendation_ledger.json',
    archives: 'output/recommendation_ledger_archives.json',
  },
  ai: {
    evaluations: 'output/ai_evaluation_history.json',
  },
  reports: {
    backtest: 'output/BACKTEST_REPORT_2026-07-29.md',
    formalResults: 'output/formal_results_2026-07-29.json',
  },
} as const;

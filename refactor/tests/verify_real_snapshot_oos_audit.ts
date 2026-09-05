import * as fs from 'fs';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const history = JSON.parse(fs.readFileSync('output/match_snapshot_history.json', 'utf8')) as Record<string, unknown[]>;
const decisionsPayload = JSON.parse(fs.readFileSync('output/ybty_leisu_decisions.json', 'utf8')) as {
  decisions?: Array<Record<string, unknown>>;
};
const decisions = decisionsPayload.decisions ?? [];
const snapshots = Object.values(history).flat();

assert(Object.keys(history).length > 0, 'Historical snapshot audit requires imported match snapshots.');
assert(snapshots.length > 0, 'Historical snapshot audit requires captured snapshots.');
assert(decisions.length > 0, 'Historical snapshot audit requires corresponding decision records.');
assert(
  decisions.every((decision) =>
    decision.status === 'RESEARCH' &&
    decision.grade === 'C' &&
    decision.recommendation === null &&
    decision.score_verified === false
  ),
  'Research or unverified decisions must not be treated as formal OOS records.'
);
assert(
  snapshots.every((snapshot) => {
    const record = snapshot as Record<string, unknown>;
    return !('final_score' in record) &&
      !('settled_at' in record) &&
      !('model_probability' in record) &&
      !('predicted_lambda' in record);
  }),
  'Snapshots without settlement labels must remain non-OOS evidence.'
);

console.log(`Real snapshot OOS audit: ${Object.keys(history).length} matches, ${snapshots.length} snapshots, ${decisions.length} research decisions, 0 accepted OOS samples.`);

import { generateRefactoredPrompt } from '../refactor/04_ai_evaluator/promptExporter.js';
import { CanonicalMatch } from '../refactor/02_canonical_model/types.js';

// Create a dummy CanonicalMatch
const dummyMatch = {
  match_id: '123',
  league: 'Test League',
  kickoff_time: 1234567890,
  teams: { home: { name: 'A' }, away: { name: 'B' } },
  score: { current: { home: 0, away: 0 }, is_verified: true },
  timeline: [],
  live_stats: { possession: { home: 50, away: 50 } },
  core_markets: {},
  system_tier: 'TIER_1_FULL'
} as unknown as CanonicalMatch;

const res = generateRefactoredPrompt([dummyMatch], 'live_eval');
console.log(res.finalPrompt);

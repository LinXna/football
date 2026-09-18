import fs from 'fs';
import { parseYbtyLiveRoot } from '../01_data_ingestion/ybty/ybtyLiveExtractor';
import { parseLeisuInterfaceExport } from '../01_data_ingestion/leisu/leisuInterfaceExtractor';
import { findBestLeisuMatch } from '../02_canonical_model/matchAligner';
import { assembleCanonicalMatch, extractAiEvaluationBrief } from '../02_canonical_model/canonicalMatchAssembler';
import { calculateQuantitativeFeatures, isMatchQuantEligible } from '../03_quant_engine/index';
import { getLoadedOosArchive } from '../../server/services/oosArchiveService';

console.log('--- DETAILED PROFILING OF ASSEMBLE ---');

// Step 1: Read files
console.time('1. Read JSON Files');
const ybtyRaw = JSON.parse(fs.readFileSync('refactor/fixtures/active_live_ybty.json', 'utf8'));
const leisuRaw = JSON.parse(fs.readFileSync('refactor/fixtures/active_live_leisu.json', 'utf8'));
const manualAliases = JSON.parse(fs.readFileSync('team_aliases.json', 'utf8'));
const leagueAliases = JSON.parse(fs.readFileSync('league_aliases.json', 'utf8'));
console.timeEnd('1. Read JSON Files');

// Step 2: Parse YBTY
console.time('2. Parse YBTY');
const parsedYbtyRoot = parseYbtyLiveRoot(ybtyRaw);
console.timeEnd('2. Parse YBTY');

// Step 3: Parse Leisu
console.time('3. Parse Leisu');
const parsedLeisu = parseLeisuInterfaceExport(leisuRaw);
console.timeEnd('3. Parse Leisu');

// Step 4: Alignment
console.time('4. Alignment (findBestLeisuMatch)');
const genericMatches = parsedYbtyRoot.matches.map(m => ({
  league: m.league,
  home: m.home,
  away: m.away,
  home_score: m.home_score,
  away_score: m.away_score,
  clock: m.clock,
  clock_status: m.clock_status,
  added_time: m.added_time,
  countdown: m.countdown,
  commence_time: m.commence_time,
  _pre_start_text: m._pre_start_text,
  captured_at: m.captured_at,
  is_live: true,
  markets: m.markets,
}));

const canonicalMatches = [];
for (const yMatch of genericMatches) {
  const { best_match, decision } = findBestLeisuMatch(yMatch, parsedLeisu.matches, manualAliases, leagueAliases);
  const canonical = assembleCanonicalMatch(yMatch, best_match, decision || {} as any);
  canonicalMatches.push(canonical);
}
console.timeEnd('4. Alignment (findBestLeisuMatch)');

// Step 5: Quant features per match
console.log('--- 5. Profiling Quant Engine per Match ---');
const archive = getLoadedOosArchive();
for (let i = 0; i < canonicalMatches.length; i++) {
  const match = canonicalMatches[i];
  console.time(`Match ${i + 1} (${match.canonical_id} ${match.home_team_name} vs ${match.away_team_name})`);
  const q = calculateQuantitativeFeatures(match, { calibration_archive: archive, permissive_oos_mode: true });
  console.timeEnd(`Match ${i + 1} (${match.canonical_id} ${match.home_team_name} vs ${match.away_team_name})`);
}

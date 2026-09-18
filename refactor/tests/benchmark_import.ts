import { assembleMatchesForMode } from '../../server/routes/canonicalRoutes';

console.log('--- STARTING BENCHMARK OF assembleMatchesForMode("live") ---');
const t0 = performance.now();
const result = assembleMatchesForMode('live');
const t1 = performance.now();
console.log(`Total assembleMatchesForMode time: ${(t1 - t0).toFixed(2)} ms`);
console.log(`Canonical matches assembled: ${result.canonicalMatches.length}`);
console.log(`Quant features calculated: ${Object.keys(result.quantitativeFeatures).length}`);

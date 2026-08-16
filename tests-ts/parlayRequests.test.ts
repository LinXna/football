import assert from 'node:assert/strict';
import test from 'node:test';
import { buildValidParlayRequests } from '../src/lib/parlayRequests';

test('two selected matches only submit a valid 2-leg request', () => {
  assert.deepEqual(
    buildValidParlayRequests({ 2: 1, 3: 1 }, 2),
    [{ size: 2, count: 1 }],
  );
});

test('hidden stale requests cannot enable or reach parlay generation', () => {
  assert.deepEqual(buildValidParlayRequests({ 3: 1 }, 2), []);
});

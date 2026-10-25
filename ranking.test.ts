import test from 'node:test'; import assert from 'node:assert/strict';
import { rankCandidates } from '../src/core/ranking.ts';
import { students, rep } from './helpers.ts';

test('closest available friend first', () => {
  const r = rankCandidates([rep('priya', 4), rep('sam', 9), rep('alex', 6)], students, [], 0, {});
  assert.deepEqual(r.map(x => x.studentId), ['priya', 'alex', 'sam']);
});
test('unavailable friends are never asked', () => {
  const r = rankCandidates([rep('priya', 1, false), rep('sam', 9)], students, [], 0, {});
  assert.deepEqual(r.map(x => x.studentId), ['sam']);
});
test('tie on ETA: car owner wins, then least recently asked', () => {
  assert.equal(rankCandidates([rep('priya', 5), rep('sam', 5)], students, [], 0, {})[0].studentId, 'sam');
  assert.equal(rankCandidates([rep('priya', 5), rep('alex', 5)], students, [], 0, { priya: 100, alex: 50 })[0].studentId, 'alex');
});
test('someone already asked this round is skipped', () => {
  const log = [{ studentId: 'priya', mode: 'go' as const, askedAt: 10, result: 'no' as const }];
  assert.equal(rankCandidates([rep('priya', 1), rep('sam', 9)], students, log, 5, {})[0].studentId, 'sam');
});

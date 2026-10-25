import test from 'node:test'; import assert from 'node:assert/strict';
import { activePlansFor, canViewPlan, deletePlans, groupDetail, isTrackable, toReport } from '../src/core/sharing.ts';
import type { Plan } from '../src/core/models.ts';
import { MIN } from './helpers.ts';

const plan = (o: Partial<Plan> = {}): Plan => ({ id: 'p', ownerId: 'maya', kind: 'event', startsAt: 0, endsAt: 100 * MIN, visibleTo: ['priya'],
  groupVisibility: 'expected_only', detail: 'secret party', ...o });

test('only chosen friends can see a plan', () => {
  assert.ok(canViewPlan(plan(), 'priya')); assert.ok(!canViewPlan(plan(), 'sam'));
  assert.equal(activePlansFor([plan()], 'sam', 'maya', 5 * MIN).length, 0);
  assert.equal(activePlansFor([plan()], 'priya', 'maya', 5 * MIN).length, 1);
  assert.equal(activePlansFor([plan()], 'priya', 'maya', 500 * MIN).length, 0);   // expired
});
test('group sees details only if the owner allowed it', () => {
  assert.equal(groupDetail(plan()), undefined);
  assert.equal(groupDetail(plan({ groupVisibility: 'details' })), 'secret party');
});
test('opt-in, pause, and delete are owner-controlled', () => {
  assert.ok(!isTrackable(undefined, 0)); assert.ok(!isTrackable({ studentId: 'maya', optedIn: false }, 0));
  assert.ok(isTrackable({ studentId: 'maya', optedIn: true }, 0));
  assert.ok(!isTrackable({ studentId: 'maya', optedIn: true, pausedUntil: 10 * MIN }, 5 * MIN));
  assert.ok(isTrackable({ studentId: 'maya', optedIn: true, pausedUntil: 10 * MIN }, 11 * MIN));
  assert.equal(deletePlans([plan(), plan({ id: 'q' })], 'maya').length, 0);
  assert.equal(deletePlans([plan(), plan({ id: 'q' })], 'maya', 'q').length, 1);
  assert.equal(deletePlans([plan()], 'sam').length, 1);                           // only the owner's plans
});
test('a report has exactly three keys', () => {
  assert.deepEqual(Object.keys(toReport('sam', 400, 80, true)).sort(), ['available', 'etaMinutes', 'studentId']);
  assert.equal(toReport('sam', 401, 80, true).etaMinutes, 6);
  assert.equal(toReport('sam', undefined, 80, true).available, false);
});

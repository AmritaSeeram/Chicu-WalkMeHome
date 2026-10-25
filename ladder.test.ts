import test from 'node:test'; import assert from 'node:assert/strict';
import { newIncident, nextAction, reduce, type Action } from '../src/core/ladder.ts';
import { loadConfig } from '../src/core/config.ts';
import { cfg, students, rep, MIN } from './helpers.ts';

const t = (m: number) => m * MIN;
const act = (inc: any, m: number, c = cfg): Action => nextAction(inc, students, c, t(m));

test('ping at 5 min, group alert at 10 min', () => {
  const inc = newIncident('i', 'maya', 0);
  assert.equal(act(inc, 4.9).type, 'wait');
  assert.equal(act(inc, 5).type, 'ping');
  const pinged = reduce(inc, { type: 'ping_sent' }, t(5));
  assert.equal(act(pinged, 9.9).type, 'wait');
  assert.equal(act(pinged, 10).type, 'post_alert');
});

function alerted() {
  let inc = reduce(newIncident('i', 'maya', 0), { type: 'ping_sent' }, t(5));
  return reduce(inc, { type: 'alert_posted' }, t(10));
}
test('poll after the wait window, then ask the closest; No or timeout moves on', () => {
  let inc = alerted();
  assert.equal(act(inc, 14.9).type, 'wait');
  assert.equal(act(inc, 15).type, 'poll');
  inc = reduce(inc, { type: 'polled', reports: [rep('priya', 4), rep('alex', 6), rep('sam', 8)] }, t(15));
  let a = act(inc, 15) as any; assert.equal(a.studentId, 'priya');
  inc = reduce(inc, { type: 'asked', studentId: 'priya', mode: 'go' }, t(15));
  inc = reduce(inc, { type: 'answered', studentId: 'priya', yes: false }, t(15.5));
  a = act(inc, 15.5) as any; assert.equal(a.studentId, 'alex');
  inc = reduce(inc, { type: 'asked', studentId: 'alex', mode: 'go' }, t(15.5));
  assert.equal(act(inc, 17.4).type, 'wait');
  assert.equal(act(inc, 17.5).type, 'expire_ask');
  inc = reduce(inc, { type: 'expired', studentId: 'alex' }, t(17.5));
  assert.equal((act(inc, 17.5) as any).studentId, 'sam');
});
test('accepted: car owner on standby, someone else calls, then it waits', () => {
  let inc = reduce(alerted(), { type: 'polled', reports: [rep('priya', 4), rep('sam', 8), rep('alex', 6)] }, t(15));
  inc = reduce(inc, { type: 'asked', studentId: 'priya', mode: 'go' }, t(15));
  inc = reduce(inc, { type: 'answered', studentId: 'priya', yes: true }, t(16));
  let a = act(inc, 16) as any; assert.deepEqual([a.studentId, a.mode], ['sam', 'standby']);
  inc = reduce(reduce(inc, { type: 'asked', studentId: 'sam', mode: 'standby' }, t(16)), { type: 'answered', studentId: 'sam', yes: true }, t(16));
  a = act(inc, 16) as any; assert.deepEqual([a.studentId, a.mode], ['alex', 'call']);
});
test('"expected" slows the ladder but never stops it, and never moves the police link', () => {
  const slow = reduce(alerted(), { type: 'expected', by: 'priya' }, t(11));
  assert.equal(act(slow, 19.9).type, 'wait');       // wait window doubled: 10 + 10
  assert.equal(act(slow, 20).type, 'poll');         // still polls
  assert.equal(act(slow, 30).type, 'post_police_link'); // T+30 unchanged
  const fast = alerted();
  assert.equal(act(fast, 30).type, 'post_police_link');
});
test('police link is posted at T+30 even mid-ladder', () => {
  let inc = reduce(alerted(), { type: 'polled', reports: [rep('priya', 4)] }, t(15));
  inc = reduce(inc, { type: 'asked', studentId: 'priya', mode: 'go' }, t(29));
  assert.equal(act(inc, 30).type, 'post_police_link');
});
test('everyone tried: re-poll instead of giving up', () => {
  let inc = reduce(alerted(), { type: 'polled', reports: [rep('priya', 4)] }, t(15));
  inc = reduce(reduce(inc, { type: 'asked', studentId: 'priya', mode: 'go' }, t(15)), { type: 'answered', studentId: 'priya', yes: false }, t(16));
  assert.equal(act(inc, 20).type, 'poll');
});
test('a check-in ends the incident', () => {
  assert.equal(act(reduce(alerted(), { type: 'checked_in' }, t(12)), 40).type, 'wait');
});
test('config rejects values that would let the ladder stop or reorder', () => {
  assert.throws(() => loadConfig({ ...cfg, slowdownFactor: 0.5 }));
  assert.throws(() => loadConfig({ ...cfg, slowdownFactor: 50 }));
  assert.throws(() => loadConfig({ ...cfg, pdLinkAtMin: 5 }));
  assert.throws(() => loadConfig({ ...cfg, police: { ...cfg.police, phone: '' } }));
});

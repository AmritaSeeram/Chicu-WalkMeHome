import test from 'node:test'; import assert from 'node:assert/strict';
import { parsePlan } from '../src/llm/parsePlan.ts';
import { makePolisher } from '../src/llm/wording.ts';
import { renderGroupMessage, type GroupMessage } from '../src/core/messages.ts';
import { cfg } from './helpers.ts';

const now = Date.UTC(2026, 9, 25, 12);
const good = JSON.stringify({ kind: 'shift', start: '2026-10-31T08:00:00-07:00', end: '2026-10-31T18:00:00-07:00', detail: '10-hour shift' });
test('plan parsing: valid JSON is accepted, junk and out-of-range plans are rejected in code', async () => {
  assert.equal((await parsePlan('10-hour shift Saturday', { now, timezone: 'America/Phoenix' }, async () => good))?.kind, 'shift');
  assert.equal(await parsePlan('x', { now, timezone: 'x' }, async () => 'not json'), null);
  assert.equal(await parsePlan('x', { now, timezone: 'x' }, async () => good.replace('shift', 'heist')), null);
  assert.equal(await parsePlan('x', { now, timezone: 'x' }, async () => good.replace('2026-10-31T18', '2026-10-31T02')), null);
  assert.equal(await parsePlan('x', { now, timezone: 'x' }, async () => good.replace('2026-10-31T18:00:00-07:00', '2027-10-31T18:00:00-07:00')), null);
  assert.equal(await parsePlan('x', { now, timezone: 'x' }, async () => good.replace('10-hour shift', 'at 33.41950')), null);
});
const m: GroupMessage = { type: 'alert', name: 'Maya', lastSeenTime: '9:40 PM', lastSeenLabel: 'the library' };
const base = renderGroupMessage(m, cfg);
test('wording: a faithful rewrite is used; dropped facts, safety claims and leaks fall back to the template', async () => {
  const ok = `Heads up: Maya hasn't checked in since 9:40 PM. Last seen near the library.\n${base.split('\n')[1]}`;
  assert.equal(await makePolisher(async () => ok)(m, base), ok);
  assert.equal(await makePolisher(async () => 'Maya is probably fine, no worries.')(m, base), base);
  assert.equal(await makePolisher(async () => ok + ' She was at 33.41950, -111.93300.')(m, base), base);
  assert.equal(await makePolisher(async () => ok + ' Her exam ended at six.', () => ['exam'])(m, base), base);
  assert.equal(await makePolisher(async () => { throw new Error('down'); }).call(null, m, base).catch(() => base), base);
});

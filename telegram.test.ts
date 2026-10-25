import test from 'node:test'; import assert from 'node:assert/strict';
import { TelegramApp } from '../src/platform/telegram.ts';
import { cfg, MIN } from './helpers.ts';

// Drives the real bot logic with a fake Telegram API: join, opt in, share locations, then a missed check-in.
test('Telegram app end to end (fake API): join, opt in, plan, missed check-in, ask, accept, outcome', async () => {
  const sent: { chat: number; text: string; buttons?: any }[] = [];
  let t = Date.UTC(2026, 9, 25, 4, 40); // 9:40 PM in Phoenix
  const api = async (method: string, b: any) => { if (method === 'sendMessage') sent.push({ chat: b.chat_id, text: b.text, buttons: b.reply_markup }); return {}; };
  const llm = async () => JSON.stringify({ kind: 'event', start: new Date(t - MIN).toISOString(), end: new Date(t + 120 * MIN).toISOString(), detail: 'launch party' });
  const app = new TelegramApp({ api, cfg, now: () => t, llm, places: [{ label: 'the library', lat: 33.4195, lng: -111.933 }] });
  const GROUP = -100, users: [number, string, number, number][] = [[1, 'Maya', 33.4195, -111.933], [2, 'Priya', 33.4205, -111.933], [3, 'Sam', 33.43, -111.94]];
  let uid = 0;
  const say = (from: number, text: string, chat = from) => app.handle({ update_id: ++uid, message: { from: { id: from, first_name: users.find(u => u[0] === from)![1] }, chat: { id: chat, type: chat === GROUP ? 'group' : 'private' }, text } });
  for (const [id, , lat, lng] of users) {
    await say(id, '/join', GROUP); await say(id, '/optin');
    await app.handle({ update_id: ++uid, message: { from: { id }, chat: { id, type: 'private' }, location: { latitude: lat, longitude: lng } } });
  }
  await say(1, '/plan Priya: launch party tonight');
  assert.ok(sent.some(s => s.chat === 1 && s.text.startsWith('Saved: event')));
  await app.ga.startCheck('1', t, t - 30 * MIN);
  assert.ok(sent.some(s => s.chat === 1 && s.text === 'You good?'));
  for (let i = 0; i < 40; i++) { t += 15_000; await app.tick(); }                    // 10 minutes of silence
  const alert = sent.find(s => s.chat === GROUP && s.text.includes("hasn't checked in"))!;
  assert.match(alert.text, /Last seen near the library/); assert.match(alert.text, /480-965-3456/);
  const prompt = sent.find(s => s.chat === 2 && s.text.includes('launch party'))!;   // Priya's agent got Maya's shared plan
  assert.ok(prompt && !sent.some(s => s.chat === 3 && s.text.includes('launch party')));  // Sam did not
  await app.handle({ update_id: ++uid, callback_query: { id: 'c1', from: { id: 2 }, data: prompt.buttons.inline_keyboard[0][0].callback_data } });
  assert.ok(sent.some(s => s.chat === GROUP && s.text.startsWith('Priya says this is expected')));
  assert.ok(!sent.some(s => s.chat === GROUP && s.text.includes('launch party')));     // detail hidden: owner chose /plan, not /plandetails
  for (let i = 0; i < 120 && !sent.some(s => s.text.startsWith("You're closest")); i++) { t += 15_000; await app.tick(); }  // doubled wait window passes
  const ask = sent.filter(s => s.chat === 2 && s.text.startsWith("You're closest"))[0];
  assert.ok(ask); assert.ok(!sent.some(s => s.chat === 1 && s.text.startsWith("You're closest")));
  await app.handle({ update_id: ++uid, callback_query: { id: 'c2', from: { id: 2 }, data: ask.buttons.inline_keyboard[0][0].callback_data } });
  assert.ok(sent.some(s => s.chat === GROUP && s.text.startsWith('Priya is heading to the library.')));
  for (const s of sent.filter(s => s.chat === GROUP)) assert.doesNotMatch(s.text, /33\.4|111\.9|launch party/);
  await say(1, '/forgetme');
  assert.equal(app.state.plans.length, 0);
});

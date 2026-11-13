import test from 'node:test';
import assert from 'node:assert';
import { appDay, b64u, isAllowedEndpoint, isDue, localParts, validDate, validTime, validTz, vapidHeader } from '../server/src/core.js';
import { handleFetch, runSchedule } from '../server/src/worker.js';
import { makeD1 } from './helpers/d1shim.mjs';

const ORIGIN = 'https://me.github.io', EP = 'https://fcm.googleapis.com/fcm/send/abc123';
async function keys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { pair, publicKey: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)), privateJwk: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)) };
}
async function env(over) {
  const k = await keys();
  return { DB: makeD1(), ALLOWED_ORIGIN: ORIGIN, VAPID_SUBJECT: 'mailto:a@b.co', VAPID_PUBLIC: k.publicKey, VAPID_PRIVATE_JWK: k.privateJwk, _k: k, ...over };
}
const post = (e, path, body, origin = ORIGIN) => handleFetch(new Request('https://w.example' + path, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), e);
const rows = (e) => e.DB.raw.prepare('SELECT * FROM subs').all();
const at = (iso) => Date.parse(iso);

test('endpoint allowlist: real push services only', () => {
  ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Qx', 'https://wns2-par02p.notify.windows.com/w/?token=x'].forEach((u) => assert.ok(isAllowedEndpoint(u), u));
  ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.com/x', 'https://user:pw@fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com:8443/x', 'not a url', '', null, 42].forEach((u) => assert.ok(!isAllowedEndpoint(u), String(u)));
});
test('time, date and zone validation', () => {
  assert.ok(validTime('00:00') && validTime('20:05') && validTime('23:59'));
  ['24:00', '9:30', '20:5', '', null, '20:60'].forEach((t) => assert.ok(!validTime(t), String(t)));
  assert.ok(validDate('2026-11-08')); assert.ok(!validDate('2026-13-45')); assert.ok(!validDate('nope'));
  assert.ok(validTz('Europe/London') && validTz('America/New_York') && validTz('UTC')); assert.ok(!validTz('Mars/Base') && !validTz('') && !validTz(null));
});
test('local time follows the time zone, including daylight saving', () => {
  assert.deepStrictEqual(localParts(at('2026-11-08T20:00:00Z'), 'Europe/London'), { date: '2026-11-08', minutes: 1200 });
  assert.deepStrictEqual(localParts(at('2026-11-08T20:00:00Z'), 'America/New_York'), { date: '2026-11-08', minutes: 900 });   // EST, UTC-5
  assert.deepStrictEqual(localParts(at('2026-07-08T20:00:00Z'), 'Europe/London'), { date: '2026-07-08', minutes: 1260 });     // BST, UTC+1
  assert.deepStrictEqual(localParts(at('2026-11-08T23:30:00Z'), 'Asia/Tokyo'), { date: '2026-11-09', minutes: 510 });
  assert.strictEqual(localParts(at('2026-11-08T00:00:00Z'), 'UTC').minutes, 0);                                                // midnight is 0, not 24
});
test('the app day rolls over at 4 am local time', () => {
  assert.strictEqual(appDay(at('2026-11-08T03:59:00Z'), 'UTC'), '2026-11-07');
  assert.strictEqual(appDay(at('2026-11-08T04:00:00Z'), 'UTC'), '2026-11-08');
  assert.strictEqual(appDay(at('2026-11-08T22:00:00Z'), 'Asia/Tokyo'), '2026-11-09');                                           // 07:00 on the 9th in Tokyo
});
test('isDue: from the chosen time for a 15 minute window, once per app day', () => {
  const s = { time: '20:00', tz: 'Europe/London', last_sent: null, skip_date: null };
  assert.ok(!isDue(s, at('2026-11-08T19:59:00Z'))); assert.ok(isDue(s, at('2026-11-08T20:00:00Z'))); assert.ok(isDue(s, at('2026-11-08T20:14:00Z'))); assert.ok(!isDue(s, at('2026-11-08T20:15:00Z')));
  assert.ok(!isDue({ ...s, last_sent: '2026-11-08' }, at('2026-11-08T20:01:00Z')));
  assert.ok(isDue({ ...s, last_sent: '2026-11-07' }, at('2026-11-08T20:01:00Z')));
  assert.ok(!isDue({ ...s, skip_date: '2026-11-08' }, at('2026-11-08T20:01:00Z')));
  assert.ok(isDue({ ...s, skip_date: '2026-11-07' }, at('2026-11-08T20:01:00Z')));
  assert.ok(!isDue({ ...s, tz: 'America/New_York' }, at('2026-11-08T20:00:00Z')));    // 15:00 there
  assert.ok(isDue({ ...s, tz: 'America/New_York' }, at('2026-11-09T01:00:00Z')));     // 20:00 there
});
test('VAPID header: valid ES256 signature, right audience, short expiry', async () => {
  const k = await keys(), now = at('2026-11-08T20:00:00Z');
  const h = await vapidHeader({ endpoint: EP, publicKey: k.publicKey, privateJwk: k.privateJwk, subject: 'mailto:a@b.co', nowMs: now });
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h); assert.ok(m, h);
  assert.strictEqual(m[4], k.publicKey);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
  assert.deepStrictEqual([claims.aud, claims.sub], ['https://fcm.googleapis.com', 'mailto:a@b.co']); assert.ok(claims.exp > now / 1000 && claims.exp - now / 1000 <= 24 * 3600);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.pair.publicKey, Buffer.from(m[3], 'base64url'), new TextEncoder().encode(m[1] + '.' + m[2]));
  assert.ok(ok, 'signature verifies with the public key');
  assert.strictEqual(Buffer.from(m[3], 'base64url').length, 64);
  assert.strictEqual(Buffer.from(m[4], 'base64url').length, 65);
});

test('subscribe stores only endpoint, time and zone; resubscribing updates instead of duplicating', async () => {
  const e = await env();
  assert.strictEqual((await post(e, '/subscribe', { endpoint: EP, time: '20:00', tz: 'Europe/London' })).status, 200);
  assert.strictEqual((await post(e, '/subscribe', { endpoint: EP, time: '21:30', tz: 'Europe/London' })).status, 200);
  const r = rows(e); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].time, '21:30');
  assert.deepStrictEqual(Object.keys(r[0]).sort(), ['endpoint', 'id', 'last_sent', 'skip_date', 'time', 'tz', 'updated']);
});
test('subscribe rejects bad input', async () => {
  const e = await env(), ok = { endpoint: EP, time: '20:00', tz: 'UTC' };
  for (const bad of [{ ...ok, endpoint: 'https://evil.example/x' }, { ...ok, time: '25:00' }, { ...ok, tz: 'Nowhere/Land' }, null, [], 'x'])
    assert.strictEqual((await post(e, '/subscribe', bad)).status, 400, JSON.stringify(bad));
  assert.strictEqual((await post(e, '/subscribe', '{not json')).status, 400);
  assert.strictEqual((await post(e, '/subscribe', 'x'.repeat(3000))).status, 413);
  assert.strictEqual(rows(e).length, 0);
});
test('only the configured origin may call; others get no CORS and no access', async () => {
  const e = await env();
  assert.strictEqual((await post(e, '/subscribe', { endpoint: EP, time: '20:00', tz: 'UTC' }, 'https://evil.example')).status, 403);
  assert.strictEqual(rows(e).length, 0);
  const good = await post(e, '/subscribe', { endpoint: EP, time: '20:00', tz: 'UTC' }); assert.strictEqual(good.headers.get('access-control-allow-origin'), ORIGIN);
  const pre = await handleFetch(new Request('https://w.example/subscribe', { method: 'OPTIONS', headers: { origin: ORIGIN } }), e); assert.strictEqual(pre.status, 204);
  const bad = await handleFetch(new Request('https://w.example/subscribe', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), e); assert.strictEqual(bad.status, 403);
  assert.strictEqual((await handleFetch(new Request('https://w.example/health'), e)).status, 200);
  assert.strictEqual((await handleFetch(new Request('https://w.example/nothing', { method: 'POST', headers: { origin: ORIGIN }, body: '{}' }), e)).status, 400);
});
test('capacity limit', async () => {
  const e = await env({ MAX_SUBS: '2' });
  for (const n of [1, 2]) assert.strictEqual((await post(e, '/subscribe', { endpoint: EP + n, time: '20:00', tz: 'UTC' })).status, 200);
  assert.strictEqual((await post(e, '/subscribe', { endpoint: EP + 3, time: '20:00', tz: 'UTC' })).status, 503);
  assert.strictEqual((await post(e, '/subscribe', { endpoint: EP + 1, time: '19:00', tz: 'UTC' })).status, 200); // existing can still update
});
test('unsubscribe removes the row; skip records the day', async () => {
  const e = await env(); await post(e, '/subscribe', { endpoint: EP, time: '20:00', tz: 'UTC' });
  assert.strictEqual((await post(e, '/skip', { endpoint: EP, date: 'junk' })).status, 400);
  await post(e, '/skip', { endpoint: EP, date: '2026-11-08' }); assert.strictEqual(rows(e)[0].skip_date, '2026-11-08');
  await post(e, '/unsubscribe', { endpoint: EP }); assert.strictEqual(rows(e).length, 0);
  assert.strictEqual((await post(e, '/unsubscribe', { endpoint: EP })).status, 200);   // already gone is fine
});

function pusher(status = 201) { const calls = []; return { calls, send: async (u, o) => { calls.push({ u, o }); return { status: typeof status === 'function' ? status(u) : status }; } }; }
test('schedule: sends only to people who are due, sets last_sent, never twice in a day', async () => {
  const e = await env(); const A = EP + 'A', B = EP + 'B', C = EP + 'C';
  await post(e, '/subscribe', { endpoint: A, time: '20:00', tz: 'Europe/London' });
  await post(e, '/subscribe', { endpoint: B, time: '20:00', tz: 'America/New_York' });
  await post(e, '/subscribe', { endpoint: C, time: '21:00', tz: 'Europe/London' });
  const p = pusher(), now = Date.now(), t = at('2026-11-08T20:00:30Z');
  e.DB.raw.prepare('UPDATE subs SET updated = ?').run(t);
  const r = await runSchedule(e, t, p.send);
  assert.deepStrictEqual([r.checked, r.sent], [3, 1]); assert.strictEqual(p.calls.length, 1); assert.strictEqual(p.calls[0].u, A);
  assert.match(p.calls[0].o.headers.Authorization, /^vapid t=.+, k=.+$/); assert.strictEqual(p.calls[0].o.method, 'POST');
  assert.strictEqual(e.DB.raw.prepare('SELECT last_sent FROM subs WHERE endpoint = ?').get(A).last_sent, '2026-11-08');
  const again = await runSchedule(e, t + 60e3, p.send); assert.strictEqual(again.sent, 0);
  const later = await runSchedule(e, at('2026-11-09T01:00:30Z'), p.send);               // 20:00 in New York
  assert.strictEqual(later.sent, 1); assert.strictEqual(p.calls[1].u, B);
  void now;
});
test('schedule: a rated day is skipped, and a missed minute is caught up inside the window', async () => {
  const e = await env(); await post(e, '/subscribe', { endpoint: EP, time: '20:00', tz: 'UTC' });
  const t0 = at('2026-11-08T20:00:00Z'); e.DB.raw.prepare('UPDATE subs SET updated = ?').run(t0);
  await post(e, '/skip', { endpoint: EP, date: '2026-11-08' });
  const p = pusher(); assert.strictEqual((await runSchedule(e, t0, p.send)).sent, 0);
  assert.strictEqual((await runSchedule(e, at('2026-11-09T20:09:00Z'), p.send)).sent, 1);  // next day, cron was late by 9 minutes
});
test('schedule: dead endpoints are deleted, temporary failures are retried, errors never crash the run', async () => {
  const e = await env(); const t = at('2026-11-08T20:00:00Z');
  for (const n of ['gone', 'flaky', 'boom']) await post(e, '/subscribe', { endpoint: EP + n, time: '20:00', tz: 'UTC' });
  e.DB.raw.prepare('UPDATE subs SET updated = ?').run(t);
  const send = async (u) => { if (u.endsWith('gone')) return { status: 410 }; if (u.endsWith('flaky')) return { status: 503 }; throw new Error('network'); };
  const r = await runSchedule(e, t, send);
  assert.deepStrictEqual([r.removed, r.failed, r.sent], [1, 2, 0]);
  assert.deepStrictEqual(rows(e).map((x) => x.endpoint).sort(), [EP + 'boom', EP + 'flaky']);
  assert.strictEqual(rows(e).every((x) => x.last_sent === null), true);
  const retry = await runSchedule(e, t + 60e3, async () => ({ status: 201 })); assert.strictEqual(retry.sent, 2);
});
test('schedule: people who have not opened the app for 120 days are removed', async () => {
  const e = await env(); await post(e, '/subscribe', { endpoint: EP, time: '20:00', tz: 'UTC' });
  e.DB.raw.prepare('UPDATE subs SET updated = ?').run(at('2026-01-01T00:00:00Z'));
  const p = pusher(); await runSchedule(e, at('2026-11-08T20:00:00Z'), p.send);
  assert.strictEqual(rows(e).length, 0); assert.strictEqual(p.calls.length, 0);
});

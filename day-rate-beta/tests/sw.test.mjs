import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Runs the real sw.js in a sandbox with a fake service-worker scope.
function load({ windows = [], store = null, now = null } = {}) {
  const handlers = {}, shown = [], opened = [], closed = [];
  const self = {
    registration: { scope: 'https://me.github.io/day-rate/', showNotification: async (t, o) => { shown.push({ t, o }); } },
    addEventListener: (n, f) => { handlers[n] = f; }, skipWaiting() {},
  };
  const clients = { matchAll: async () => windows, openWindow: async (u) => { opened.push(u); } };
  // fake IndexedDB: store = { entries, meta } or null (no database)
  const indexedDB = { open() {
    const r = {};
    setTimeout(() => {
      if (!store) return r.onerror && r.onerror();
      r.result = { close() {}, transaction: () => ({ objectStore: () => ({ get: (k) => { const q = {}; setTimeout(() => { q.result = store[k]; q.onsuccess && q.onsuccess(); }, 0); return q; } }) }) };
      r.onsuccess && r.onsuccess();
    }, 0); return r; } };
  const RealDate = Date, D = now ? class extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return new RealDate(now).getTime(); } } : RealDate;
  const ctx = vm.createContext({ self, clients, caches: {}, URL, Request: class {}, fetch() {}, indexedDB, Date: D, Promise, setTimeout,
    importScripts: (f) => vm.runInContext(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx) });
  vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), ctx);
  const fire = async (name, ev) => { let p; handlers[name]({ ...ev, waitUntil: (x) => { p = x; } }); await p; };
  return { fire, shown, opened, closed, handlers };
}
test('a push shows one notification with the right text, tag and link', async () => {
  const w = load(); await w.fire('push', {});
  assert.strictEqual(w.shown.length, 1); const n = w.shown[0];
  assert.strictEqual(n.t, 'Day Rate'); assert.match(n.o.body, /How was today/); assert.strictEqual(n.o.tag, 'dayrate-daily'); assert.strictEqual(n.o.data.url, './#rate');
  assert.ok(n.o.icon && n.o.badge);
});
test('a push with a payload or without one behaves the same (the server sends none)', async () => {
  const w = load(); await w.fire('push', { data: { text: () => 'ignored' } }); await w.fire('push', { data: null });
  assert.strictEqual(w.shown.length, 2);
});
test('tapping the notification focuses an open window and tells it to start rating', async () => {
  const msgs = []; let focused = 0;
  const w = load({ windows: [{ focus: async () => { focused++; }, postMessage: (m) => msgs.push(m) }] });
  let closed = 0; await w.fire('notificationclick', { notification: { close: () => { closed++; } } });
  assert.deepStrictEqual([closed, focused, msgs, w.opened.length], [1, 1, ['rate'], 0]);
});
test('tapping with the app closed opens it at #rate inside the app scope', async () => {
  const w = load(); await w.fire('notificationclick', { notification: { close() {} } });
  assert.deepStrictEqual(w.opened, ['https://me.github.io/day-rate/#rate']);
});
test('existing behaviour kept: skip message, install and activate handlers', () => {
  const w = load(); ['install', 'activate', 'message', 'fetch', 'push', 'notificationclick'].forEach((n) => assert.ok(w.handlers[n], n));
});

/* weekly grade notification */
const day = (n) => new Date(Date.UTC(2026, 0, 1) + n * 864e5).toISOString().slice(0, 10);
function weeks(nDays, f) { const E = {}; for (let i = 0; i < nDays; i++) E[day(i)] = { m: f(i), p: f(i), c: f(i) }; return E; }
// 2026-02-08 is a Sunday; local clock 20:00 there (app day = date 4 hours earlier)
const SUN = new Date(2026, 1, 8, 20, 0, 0).getTime(), SAT = new Date(2026, 1, 7, 20, 0, 0).getTime();
test('Sunday, rated today, weekly on: the phone builds the week grade message', async () => {
  const E = weeks(39, (i) => 3 + (Math.floor((i + 3) / 7) % 6));   // day 38 = 2026-02-08
  const w = load({ store: { entries: E, meta: { notify: { on: true, weekly: true } } }, now: SUN }); await w.fire('push', {});
  assert.strictEqual(w.shown.length, 1); const n = w.shown[0];
  assert.strictEqual(n.o.tag, 'dayrate-weekly'); assert.match(n.o.body, /^Your week: [A-D][+-]?(, (steady|up from [A-D][+-]?|down from [A-D][+-]?))?\. 7 of 7 days rated\.$/);
  assert.strictEqual(n.o.data.url, './#week');
});
test('weekly notification never contains ratings, only a letter and counts', async () => {
  const E = weeks(39, (i) => 3 + (Math.floor((i + 3) / 7) % 6));
  const w = load({ store: { entries: E, meta: { notify: { weekly: true } } }, now: SUN }); await w.fire('push', {});
  assert.ok(!/\d\.\d/.test(w.shown[0].o.body));
});
test('Sunday but not rated yet: the normal reminder', async () => {
  const E = weeks(38, () => 5);
  const w = load({ store: { entries: E, meta: { notify: { weekly: true } } }, now: SUN }); await w.fire('push', {});
  assert.strictEqual(w.shown[0].o.tag, 'dayrate-daily'); assert.match(w.shown[0].o.body, /How was today/);
});
test('not Sunday: the normal reminder even with weekly on', async () => {
  const w = load({ store: { entries: weeks(38, () => 5), meta: { notify: { weekly: true } } }, now: SAT }); await w.fire('push', {});
  assert.strictEqual(w.shown[0].o.tag, 'dayrate-daily');
});
test('weekly off or grades off: a plain, safe message on a rated Sunday (a push must always show something)', async () => {
  const E = weeks(39, (i) => 3 + (i % 5));
  for (const meta of [{ notify: { weekly: false } }, { notify: { weekly: true }, grades: false }]) {
    const w = load({ store: { entries: E, meta }, now: SUN }); await w.fire('push', {});
    assert.strictEqual(w.shown.length, 1); assert.match(w.shown[0].o.body, /Open Day Rate/); assert.ok(!/Your week: /.test(w.shown[0].o.body));
  }
});
test('storage unreadable: falls back to the normal reminder', async () => {
  const w = load({ store: null, now: SUN }); await w.fire('push', {});
  assert.strictEqual(w.shown[0].o.tag, 'dayrate-daily');
});
test('tapping the weekly notification opens the week, not rating', async () => {
  const msgs = []; const w = load({ windows: [{ focus: async () => {}, postMessage: (m) => msgs.push(m) }] });
  await w.fire('notificationclick', { notification: { close() {}, data: { url: './#week' } } });
  assert.deepStrictEqual(msgs, ['week']);
  const w2 = load(); await w2.fire('notificationclick', { notification: { close() {}, data: { url: './#week' } } });
  assert.deepStrictEqual(w2.opened, ['https://me.github.io/day-rate/#week']);
});

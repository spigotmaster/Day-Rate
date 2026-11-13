import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Runs the real sw.js in a sandbox with a fake service-worker scope.
function load({ windows = [] } = {}) {
  const handlers = {}, shown = [], opened = [], closed = [];
  const self = {
    registration: { scope: 'https://me.github.io/day-rate/', showNotification: async (t, o) => { shown.push({ t, o }); } },
    addEventListener: (n, f) => { handlers[n] = f; }, skipWaiting() {},
  };
  const clients = { matchAll: async () => windows, openWindow: async (u) => { opened.push(u); } };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), { self, clients, caches: {}, URL, Request: class {}, fetch() {} });
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

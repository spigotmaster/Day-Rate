import test from 'node:test';
import assert from 'node:assert';
import { makeDemo } from '../src/demo.js';
import { migrate } from '../src/migrate.js';

const T = '2026-11-08';
test('demo data is deterministic', () => assert.deepStrictEqual(makeDemo(T), makeDemo(T)));
test('42 contiguous days ending yesterday, never today or the future', () => {
  const ks = Object.keys(makeDemo(T).entries).sort();
  assert.strictEqual(ks.length, 42); assert.strictEqual(ks[0], '2026-09-27'); assert.strictEqual(ks[41], '2026-11-07');
  assert.ok(ks.every((k) => k < T));
});
test('ratings are whole numbers 1 to 10 and use a real spread', () => {
  const es = Object.values(makeDemo(T).entries), all = es.flatMap((e) => [e.m, e.p, e.c]);
  assert.ok(all.every((v) => Number.isInteger(v) && v >= 1 && v <= 10));
  assert.ok(Math.max(...all) - Math.min(...all) >= 4);
});
test('weekend connection is higher than weekday connection (a visible pattern)', () => {
  const es = Object.entries(makeDemo(T, 84).entries), avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const wd = (k) => (Math.round(Date.parse(k + 'T00:00:00Z') / 864e5) + 3) % 7;
  assert.ok(avg(es.filter(([k]) => wd(k) >= 5).map(([, e]) => e.c)) > avg(es.filter(([k]) => wd(k) < 5).map(([, e]) => e.c)));
});
test('uses only real tag ids and contains some notes', () => {
  const es = Object.values(makeDemo(T).entries), ok = new Set(['sl', 'ex', 'ou', 'so', 'al', 'ld', 'un']);
  assert.ok(es.every((e) => (e.tags || []).every((t) => ok.has(t))));
  assert.ok(es.some((e) => e.note) && es.some((e) => e.tags));
});
test('passes the migration check cleanly (nothing quarantined) and is flagged as demo', () => {
  const d = makeDemo(T), r = migrate({ entries: d.entries, meta: {} });
  assert.deepStrictEqual(r.db.meta.quarantine, {}); assert.strictEqual(Object.keys(r.db.entries).length, 42); assert.strictEqual(d.meta.demo, true);
});

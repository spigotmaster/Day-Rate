import test from 'node:test';
import assert from 'node:assert';
import { migrate, detectSchema, CURRENT_SCHEMA, MIGRATIONS } from '../src/migrate.js';

const v1 = () => ({
  entries: {
    '2026-01-01': { m: 5, p: 6, c: 7, note: 'hi', created: 1, updated: 2, tags: ['walk', ' walk ', 'gym', 5] },
    '2026-01-02': { m: '8', p: 9, c: 10 },                 // string rating, missing note/timestamps
    '2026-01-03': { m: 11, p: 5, c: 5, note: 'bad' },      // out of range -> quarantine
    'not-a-date': { m: 5, p: 5, c: 5 },                    // bad key -> quarantine
    '2026-01-04': null,                                    // junk -> quarantine
    '2026-01-05': { m: 4, p: 4, c: 4, custom: 'keep me' }, // unknown field survives
  },
  meta: { haptics: true, ach: { 'driven#0': '2026-02-01' } },
});

test('v1 data has schema 1 and migrates to current', () => {
  const r = migrate(v1());
  assert.strictEqual(r.from, 1);
  assert.strictEqual(r.to, CURRENT_SCHEMA);
  assert.strictEqual(r.status, 'migrated');
  assert.strictEqual(detectSchema(r.db), CURRENT_SCHEMA);
});
test('never loses a record: everything is either kept or quarantined', () => {
  const src = v1(), r = migrate(src);
  const total = Object.keys(src.entries).length;
  assert.strictEqual(Object.keys(r.db.entries).length + Object.keys(r.db.meta.quarantine).length, total);
  assert.deepStrictEqual(Object.keys(r.db.meta.quarantine).sort(), ['2026-01-03', '2026-01-04', 'not-a-date']);
});
test('normalises fields but keeps unknown fields and existing meta', () => {
  const r = migrate(v1());
  assert.strictEqual(r.db.entries['2026-01-02'].m, 8);
  assert.strictEqual(r.db.entries['2026-01-02'].note, '');
  assert.ok(Number.isFinite(r.db.entries['2026-01-02'].created));
  assert.deepStrictEqual(r.db.entries['2026-01-01'].tags, ['walk', 'gym']);
  assert.strictEqual(r.db.entries['2026-01-05'].custom, 'keep me');
  assert.deepStrictEqual(r.db.meta.ach, { 'driven#0': '2026-02-01' });
});
test('does not mutate the input and returns a backup equal to it', () => {
  const src = v1(), snap = JSON.stringify(src), r = migrate(src);
  assert.strictEqual(JSON.stringify(src), snap);
  assert.strictEqual(JSON.stringify(r.backup), snap);
});
test('already current data is returned as is, no backup', () => {
  const cur = migrate(v1()).db, r = migrate(cur);
  assert.strictEqual(r.status, 'current');
  assert.strictEqual(r.backup, null);
  assert.strictEqual(r.db, cur);
});
test('migrating twice changes nothing (idempotent)', () => {
  const once = migrate(v1()).db;
  assert.deepStrictEqual(migrate(once).db, once);
});
test('data from a newer app is refused and untouched', () => {
  const newer = { entries: { '2026-01-01': { m: 1, p: 1, c: 1 } }, meta: { schema: 99 } };
  const r = migrate(newer);
  assert.strictEqual(r.status, 'newer');
  assert.strictEqual(r.db, newer);
});
test('a throwing migration returns the original untouched', () => {
  const src = v1();
  const boom = [{ to: 2, name: 'boom', up() { throw new Error('kaboom'); } }];
  const r = migrate(src, boom, 2);
  assert.strictEqual(r.status, 'failed');
  assert.strictEqual(r.error, 'kaboom');
  assert.strictEqual(r.db, src);
});
test('empty and garbage input do not crash', () => {
  assert.strictEqual(migrate(undefined).status, 'migrated');
  assert.strictEqual(migrate({}).db.meta.schema, CURRENT_SCHEMA);
  assert.ok(MIGRATIONS.every((m, i, a) => i === 0 || a[i - 1].to < m.to));
});

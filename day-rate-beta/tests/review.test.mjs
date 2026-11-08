import test from 'node:test';
import assert from 'node:assert';
import { searchDays, periodBounds, shiftAnchor, recap } from '../src/review.js';

const E = {
  '2026-10-01': { m: 8, p: 3, c: 5, note: 'Long walk by the river', tags: ['ou', 'ex'] },
  '2026-10-02': { m: 4, p: 9, c: 6, note: 'Deadline day', tags: ['ld'] },
  '2026-10-03': { m: 6, p: 6, c: 6, note: '' },
  '2026-09-20': { m: 9, p: 9, c: 9, note: 'Party with friends', tags: ['so'] },
};
const L = { ou: 'Outdoors', ex: 'Exercise', ld: 'Heavy workload', so: 'Social' };
const S = (q) => searchDays(E, { today: '2026-10-05', labels: L, ...q });

test('search: newest first, empty query returns everything', () => assert.deepStrictEqual(S({}), ['2026-10-03', '2026-10-02', '2026-10-01', '2026-09-20']));
test('search: text is case-insensitive, all words must match, tag labels count', () => {
  assert.deepStrictEqual(S({ text: 'WALK river' }), ['2026-10-01']);
  assert.deepStrictEqual(S({ text: 'walk party' }), []);
  assert.deepStrictEqual(S({ text: 'workload' }), ['2026-10-02']);
});
test('search: tags are ANDed', () => {
  assert.deepStrictEqual(S({ tags: ['ou', 'ex'] }), ['2026-10-01']);
  assert.deepStrictEqual(S({ tags: ['ou', 'ld'] }), []);
});
test('search: rating bands per category and for any category', () => {
  assert.deepStrictEqual(S({ dim: 'p', band: 'high' }), ['2026-10-02', '2026-09-20']);
  assert.deepStrictEqual(S({ dim: 'm', band: 'low' }), ['2026-10-02']);
  assert.deepStrictEqual(S({ dim: 'c', band: 'mid' }), ['2026-10-03', '2026-10-02', '2026-10-01']);
  assert.deepStrictEqual(S({ dim: 'any', band: 'low' }), ['2026-10-02', '2026-10-01']);
});
test('search: date range is inclusive of today', () => {
  assert.deepStrictEqual(S({ range: '30' }), ['2026-10-03', '2026-10-02', '2026-10-01', '2026-09-20']);
  assert.deepStrictEqual(S({ range: '5' }), ['2026-10-03', '2026-10-02', '2026-10-01']);
  assert.deepStrictEqual(S({ range: '1' }), []);
});
test('search: missing tags and notes never crash', () => assert.doesNotThrow(() => searchDays({ '2026-01-01': { m: 5, p: 5, c: 5 } }, { text: 'x', tags: ['a'], band: 'high' })));

test('periodBounds: current month is month-to-date, compared with the same span of last month', () => {
  const b = periodBounds('month', '2026-10', '2026-10-12');
  assert.deepStrictEqual([b.start, b.end, b.span, b.partial, b.pStart, b.pEnd], ['2026-10-01', '2026-10-12', 12, true, '2026-09-01', '2026-09-12']);
});
test('periodBounds: a finished month uses the whole previous month, capped to its length', () => {
  const b = periodBounds('month', '2026-03', '2026-10-12');
  assert.deepStrictEqual([b.end, b.span, b.partial, b.pStart, b.pEnd], ['2026-03-31', 31, false, '2026-02-01', '2026-02-28']);
});
test('periodBounds: January looks back to December of the year before; future periods are null', () => {
  assert.strictEqual(periodBounds('month', '2026-01', '2026-10-12').pStart, '2025-12-01');
  assert.strictEqual(periodBounds('month', '2026-11', '2026-10-12'), null);
  assert.strictEqual(periodBounds('year', '2027', '2026-10-12'), null);
});
test('periodBounds: year to date and leap years', () => {
  const b = periodBounds('year', '2026', '2026-03-01');
  assert.deepStrictEqual([b.span, b.partial, b.pStart, b.pEnd], [60, true, '2025-01-01', '2025-03-01']);
  assert.strictEqual(periodBounds('month', '2028-02', '2028-12-01').span, 29);
});
test('shiftAnchor moves across year boundaries', () => {
  assert.strictEqual(shiftAnchor('month', '2026-01', -1), '2025-12');
  assert.strictEqual(shiftAnchor('month', '2026-12', 1), '2027-01');
  assert.strictEqual(shiftAnchor('year', '2026', -1), '2025');
});

test('recap: averages, change vs previous, best and lowest day, tags, longest run', () => {
  const D = {};
  for (let i = 1; i <= 10; i++) D['2026-09-' + String(i).padStart(2, '0')] = { m: 5, p: 5, c: 5 };
  for (let i = 1; i <= 10; i++) D['2026-10-' + String(i).padStart(2, '0')] = { m: 7, p: 6, c: 5, tags: i % 2 ? ['so'] : ['so', 'ex'] };
  D['2026-10-04'] = { m: 10, p: 10, c: 10, note: 'peak' }; D['2026-10-07'] = { m: 1, p: 2, c: 3 }; delete D['2026-10-09'];
  const r = recap(D, periodBounds('month', '2026-10', '2026-10-10'));
  assert.strictEqual(r.n, 9); assert.strictEqual(r.span, 10);
  assert.ok(Math.abs(r.avg.m - (7 * 7 + 10 + 1) / 9) < 1e-9);
  assert.ok(r.delta.m > 0 && Math.abs(r.delta.c - ((5 * 7 + 10 + 3) / 9 - 5)) < 1e-9);
  assert.deepStrictEqual([r.best.k, r.best.note, r.worst.k], ['2026-10-04', 'peak', '2026-10-07']);
  assert.strictEqual(r.longestRun, 8);
  assert.strictEqual(r.topTags[0].id, 'so');
});
test('recap: needs 3 days in the previous period before it shows a change; empty period is safe', () => {
  const D = { '2026-10-01': { m: 5, p: 5, c: 5 }, '2026-09-01': { m: 5, p: 5, c: 5 } };
  assert.strictEqual(recap(D, periodBounds('month', '2026-10', '2026-10-05')).delta, null);
  const none = recap({}, periodBounds('month', '2026-10', '2026-10-05'));
  assert.strictEqual(none.n, 0); assert.strictEqual(none.best, null);
});
test('recap: weekday rhythm only with 3+ days on every weekday and a real gap; year gives 12 month slots', () => {
  const D = {};
  for (let i = 0; i < 70; i++) { const d = new Date(Date.UTC(2026, 0, 5 + i)); const wd = (d.getUTCDay() + 6) % 7; D[d.toISOString().slice(0, 10)] = { m: wd === 3 ? 9 : 5, p: wd === 3 ? 9 : 5, c: wd === 3 ? 9 : 5 }; }
  const r = recap(D, periodBounds('year', '2026', '2026-12-31'));
  assert.strictEqual(r.bestWeekday.wd, 3); assert.strictEqual(r.months.length, 12);
  assert.strictEqual(r.months[0] !== null && r.months[11] === null, true);
  const few = recap({ '2026-01-05': { m: 5, p: 5, c: 5 }, '2026-01-06': { m: 5, p: 5, c: 5 } }, periodBounds('year', '2026', '2026-12-31'));
  assert.strictEqual(few.bestWeekday, null);
});

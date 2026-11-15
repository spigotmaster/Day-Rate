import test from 'node:test';
import assert from 'node:assert';
import { monthGrid, shiftMonth, onThisDay, relLabel } from '../src/calendar.js';

test('grid starts on Monday: Jan 2026 begins on a Thursday, Feb 2026 on a Sunday', () => {
  const j = monthGrid('2026-01', '2026-06-01');
  assert.deepStrictEqual([j.lead, j.days, j.weeks, j.cells.length], [3, 31, 5, 35]);
  assert.strictEqual(j.cells[3].k, '2026-01-01');
  const f = monthGrid('2026-02', '2026-06-01');
  assert.deepStrictEqual([f.lead, f.days, f.weeks], [6, 28, 5]);
});
test('a month that fits exactly four weeks has no padding (Feb 2027 starts on a Monday)', () => {
  const g = monthGrid('2027-02', '2027-06-01');
  assert.deepStrictEqual([g.lead, g.weeks, g.cells.every(Boolean)], [0, 4, true]);
});
test('leap February has 29 days; today and future days are flagged', () => {
  assert.strictEqual(monthGrid('2028-02', '2030-01-01').days, 29);
  const g = monthGrid('2026-11', '2026-11-15'), by = (k) => g.cells.find((c) => c && c.k === k);
  assert.strictEqual(by('2026-11-15').today, true);
  assert.strictEqual(by('2026-11-15').future, false);
  assert.strictEqual(by('2026-11-16').future, true);
  assert.strictEqual(by('2026-11-14').future, false);
});
test('shiftMonth wraps across years', () => {
  assert.strictEqual(shiftMonth('2026-01', -1), '2025-12');
  assert.strictEqual(shiftMonth('2026-12', 1), '2027-01');
  assert.strictEqual(shiftMonth('2026-05', 0), '2026-05');
});
test('on this day: earlier years only, nearest first, bad input is safe', () => {
  const E = { '2025-03-04': { m: 5 }, '2023-03-04': { m: 6 }, '2026-03-04': { m: 7 }, '2027-03-04': { m: 8 }, '2025-03-05': { m: 9 }, junk: { m: 1 } };
  const r = onThisDay(E, '2026-03-04');
  assert.deepStrictEqual(r.map((x) => [x.years, x.key]), [[1, '2025-03-04'], [3, '2023-03-04']]);
  assert.deepStrictEqual(onThisDay(E, 'nope'), []);
  assert.deepStrictEqual(onThisDay(undefined, '2026-03-04'), []);
  assert.deepStrictEqual(onThisDay({ '2024-02-29': { m: 5 } }, '2026-02-28'), []);
});
test('labels', () => {
  assert.strictEqual(relLabel(1), 'This day last year');
  assert.strictEqual(relLabel(3), 'This day 3 years ago');
});

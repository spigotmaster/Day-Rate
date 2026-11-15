import test from 'node:test';
import assert from 'node:assert';
import { decide, rerun, pastLabel, DECISIONS } from '../src/experiments.js';

const list = () => [{ start: '2026-03-10', title: 'A', new: true }, { start: '2026-03-01', title: 'B', new: false }];

test('decide marks only the matching result and never mutates the input', () => {
  const a = list(), out = decide(a, '2026-03-10', 'keep', 5);
  assert.deepStrictEqual(out[0], { start: '2026-03-10', title: 'A', new: false, decision: 'keep', decidedAt: 5 });
  assert.deepStrictEqual(out[1], a[1]);
  assert.strictEqual(a[0].decision, undefined);
});
test('all three choices work, anything else is ignored', () => {
  DECISIONS.forEach((c) => assert.strictEqual(decide(list(), '2026-03-10', c)[0].decision, c));
  const a = list();
  assert.strictEqual(decide(a, '2026-03-10', 'pass'), a);
  assert.strictEqual(decide(a, '1999-01-01', 'keep'), a);
  assert.deepStrictEqual(decide(undefined, 'x', 'keep'), []);
});
test('rerun keeps the idea and restarts the clock', () => {
  const r = rerun({ id: 'ex-social', kind: 'social', title: 'T', text: 'x', start: '2026-03-01', nb: 4 }, '2026-03-12');
  assert.deepStrictEqual(r, { id: 'ex-social', kind: 'social', title: 'T', text: 'x', start: '2026-03-12' });
});
test('past label adds the decision in plain words', () => {
  assert.strictEqual(pastLabel({ title: 'T' }, '3 Mar'), 'T (3 Mar)');
  assert.strictEqual(pastLabel({ title: 'T', decision: 'drop' }, '3 Mar'), 'T (3 Mar, set aside)');
});

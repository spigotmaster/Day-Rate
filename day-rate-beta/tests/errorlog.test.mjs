import test from 'node:test';
import assert from 'node:assert';
import { createErrorLog } from '../src/errorlog.js';

const mem = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; }, removeItem: (k) => { delete d[k]; }, d }; };

test('keeps only the last N entries', () => {
  const log = createErrorLog({ storage: mem(), max: 3 });
  for (let i = 0; i < 10; i++) log.add('error', new Error('e' + i));
  assert.deepStrictEqual(log.list().map((x) => x.msg), ['e7', 'e8', 'e9']);
});
test('clips long messages and stacks', () => {
  const log = createErrorLog({ storage: mem() });
  const e = new Error('x'.repeat(5000)); e.stack = 'y'.repeat(5000);
  log.add('error', e);
  const [r] = log.list();
  assert.ok(r.msg.length <= 300 && r.stack.length <= 1200);
});
test('debug text has counts only and no stored content', () => {
  const log = createErrorLog({ storage: mem() });
  log.add('promise', 'oops');
  const t = log.asText({ version: '1.9', schema: 2, entryCount: 42, userAgent: 'UA' });
  assert.match(t, /version: 1.9/); assert.match(t, /days stored: 42/); assert.match(t, /oops/);
});
test('survives corrupt storage and a full disk', () => {
  const s = mem(); s.setItem('dayrate:errors', '{not json');
  const log = createErrorLog({ storage: s });
  assert.deepStrictEqual(log.list(), []);
  const full = { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} };
  assert.doesNotThrow(() => createErrorLog({ storage: full }).add('error', 'x'));
});
test('clear empties the log and empty text says so', () => {
  const log = createErrorLog({ storage: mem() });
  log.add('error', 'a'); log.clear();
  assert.strictEqual(log.list().length, 0);
  assert.match(log.asText(), /No errors logged/);
});

import test from 'node:test';
import assert from 'node:assert';
import { makeLock, checkPin, validPin, validLock, waitMs, recordFail, recordOk, remaining, shouldLock, AWAY_MS } from '../src/lock.js';

test('PINs are 4 to 6 digits', () => {
  ['1234', '123456', '0000'].forEach((p) => assert.ok(validPin(p), p));
  ['123', '1234567', '12a4', '', ' 1234', 1234, null].forEach((p) => assert.ok(!validPin(p), String(p)));
});
test('a lock checks the right PIN, rejects wrong ones, and never stores the PIN', async () => {
  const l = await makeLock('4821');
  assert.ok(validLock(l));
  assert.ok(!JSON.stringify(l).includes('4821'));
  assert.strictEqual(await checkPin(l, '4821'), true);
  for (const bad of ['4822', '482', '48210', 'abcd', '']) assert.strictEqual(await checkPin(l, bad), false, bad);
});
test('same PIN gives different hashes (random salt); fixed salt gives a fixed hash', async () => {
  const a = await makeLock('1111'), b = await makeLock('1111');
  assert.notStrictEqual(a.hash, b.hash);
  const r = () => new Uint8Array(16).fill(7);
  assert.strictEqual((await makeLock('1111', r)).hash, (await makeLock('1111', r)).hash);
});
test('damaged records are ignored rather than locking anyone out', async () => {
  const l = await makeLock('1234');
  [null, {}, { ...l, hash: 'zz' }, { ...l, salt: 'abc' }, { ...l, v: 2 }, { ...l, len: 9 }, { ...l, iter: 5 }].forEach((x) => assert.ok(!validLock(x)));
  assert.strictEqual(await checkPin({ ...l, hash: 'zz' }, '1234'), false);
});
test('waits start after 5 wrong tries, double, and stop at 5 minutes', () => {
  assert.deepStrictEqual([0, 4, 5, 6, 7, 20].map(waitMs), [0, 0, 15000, 30000, 60000, 300000]);
});
test('failures and successes are recorded without touching the hash', async () => {
  let l = await makeLock('1234');
  for (let i = 0; i < 5; i++) l = recordFail(l, 1000);
  assert.deepStrictEqual([l.fails, l.until, remaining(l, 1000), remaining(l, 16000)], [5, 16000, 15000, 0]);
  const ok = recordOk(l);
  assert.deepStrictEqual([ok.fails, ok.until, ok.hash], [0, 0, l.hash]);
});
test('auto-lock after 5 minutes away, on missing record, or if the clock went back', () => {
  const now = 1e12;
  assert.strictEqual(shouldLock(now - AWAY_MS + 1, now), false);
  assert.strictEqual(shouldLock(now - AWAY_MS, now), true);
  [NaN, 0, undefined].forEach((x) => assert.strictEqual(shouldLock(x, now), true));
  assert.strictEqual(shouldLock(now + 5000, now), true);
});

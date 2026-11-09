import test from 'node:test';
import assert from 'node:assert';
import { forecast, backtest, patterns, ridge, CFG, KEYS } from '../src/forecast.js';
import { makeDemo } from '../src/demo.js';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dk = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
const START = Math.round(Date.UTC(2026, 0, 1) / 864e5);
const cl = (v) => Math.max(1, Math.min(10, Math.round(v)));
/* structured: persistence, cross-lags and a weekend effect. noise: independent days. */
function synth(days, seed, structured) {
  const r = rng(seed), g = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return s - 3; }, E = {};
  let m = 0, p = 0, c = 0;
  for (let i = 0; i < days; i++) {
    const n = START + i, we = (n + 3) % 7 >= 5;
    const nm = structured ? 0.55 * m + 0.25 * c + (we ? 0.6 : 0) + g() * 0.9 : g() * 1.5;
    const np = structured ? 0.5 * p + 0.2 * m - 0.15 * c + (we ? -0.9 : 0.3) + g() * 0.9 : g() * 1.5;
    const nc = structured ? 0.5 * c + (we ? 1.2 : 0) + g() * 0.9 : g() * 1.5;
    m = nm; p = np; c = nc;
    E[dk(n)] = { m: cl(6.5 + m), p: cl(6 + p), c: cl(5.5 + c) };
  }
  return E;
}
const lastKeys = (E, n) => Object.keys(E).sort().slice(-n);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

test('needs a minimum number of rated days and says how many more', () => {
  const E = { '2026-01-01': { m: 5, p: 5, c: 5 } }, f = forecast(E, '2026-01-02');
  assert.strictEqual(f.ok, false); assert.strictEqual(f.need, CFG.minDays - 1);
});
test('deterministic, and never mutates its input', () => {
  const E = synth(80, 1, true), copy = JSON.stringify(E);
  assert.deepStrictEqual(forecast(E, dk(START + 80)), forecast(E, dk(START + 80)));
  assert.strictEqual(JSON.stringify(E), copy);
});
test('uses only days before the target: a later entry changes nothing', () => {
  const E = synth(90, 2, true), t = dk(START + 60), a = forecast(E, t), trunc = {};
  for (const k of Object.keys(E)) if (k < t) trunc[k] = E[k];
  assert.deepStrictEqual(a, forecast(trunc, t));
});
test('EV stays on the 1 to 10 scale, inside its own range; every field is a finite number', () => {
  for (const [E, t] of [[synth(120, 3, true), START + 120], [makeDemo('2026-11-08').entries, '2026-11-08']]) {
    const f = forecast(E, t); assert.ok(f.ok);
    for (const k of KEYS) { const m = f.metrics[k]; assert.ok([m.ev, m.lo, m.hi, m.sd, m.conf].every(Number.isFinite)); assert.ok(m.ev >= 1 && m.ev <= 10 && m.lo <= m.ev && m.ev <= m.hi && m.hi <= 10); }
  }
});
test('beats "guess your average" when there is structure to find', () => {
  let a = 0, b = 0, n = 0;
  for (const seed of [3, 4, 5]) { const E = synth(200, seed, true), r = backtest(E, lastKeys(E, 50)); for (const k of KEYS) { a += r[k].mae; b += r[k].naive; n++; } }
  assert.ok(a / n < 0.9 * (b / n), `model ${a / n} vs average ${b / n}`);
});
test('on pure noise it is no worse than guessing the average (within 3%)', () => {
  let a = 0, b = 0, n = 0;
  for (const seed of [3, 4, 5]) { const E = synth(200, seed, false), r = backtest(E, lastKeys(E, 50)); for (const k of KEYS) { a += r[k].mae; b += r[k].naive; n++; } }
  assert.ok(a / n < 1.03 * (b / n), `model ${a / n} vs average ${b / n}`);
});
test('the 80% range is roughly honest (60 to 98% of days inside, ratings being whole numbers)', () => {
  const E = synth(220, 6, true), r = backtest(E, lastKeys(E, 70));
  for (const k of KEYS) assert.ok(r[k].coverage >= 0.6 && r[k].coverage <= 0.98, k + ' ' + r[k].coverage);
});
test('weekday pattern: a weekend-heavy rating is expected higher on Saturday than Tuesday', () => {
  const E = synth(140, 7, true), last = START + 140;
  const sat = [0, 1, 2, 3, 4, 5, 6].map((i) => last + i).find((n) => (n + 3) % 7 === 5), tue = [0, 1, 2, 3, 4, 5, 6].map((i) => last + i).find((n) => (n + 3) % 7 === 1);
  assert.ok(forecast(E, sat).metrics.c.ev > forecast(E, tue).metrics.c.ev + 0.5);
});
test('a day far in the future is less certain and reverts toward the average plus weekday', () => {
  const E = synth(100, 8, true), t1 = START + 100, t5 = START + 104;
  const a = forecast(E, t1), b = forecast(E, t5);
  assert.strictEqual(b.gap, 5);
  for (const k of KEYS) assert.ok(b.metrics[k].sd >= a.metrics[k].sd - 1e-9);
});
test('constant ratings: no NaN, the forecast is that rating', () => {
  const E = {}; for (let i = 0; i < 40; i++) E[dk(START + i)] = { m: 5, p: 5, c: 5 };
  const f = forecast(E, dk(START + 40));
  for (const k of KEYS) { assert.ok(Math.abs(f.metrics[k].ev - 5) < 0.2); assert.ok(Number.isFinite(f.metrics[k].sd)); }
});
test('mean reversion: after an extreme day the expectation sits well below it', () => {
  const E = synth(150, 9, false); const k = dk(START + 149); E[k] = { m: 10, p: 10, c: 10 };
  const f = forecast(E, dk(START + 150));
  for (const key of KEYS) assert.ok(f.metrics[key].ev < 8, key + ' ' + f.metrics[key].ev);
});
test('gaps in the record are treated as unknown, not as zeros', () => {
  const E = synth(120, 10, true); for (let i = 20; i < 120; i += 5) delete E[dk(START + i)];
  const f = forecast(E, dk(START + 120)); assert.ok(f.ok); for (const k of KEYS) assert.ok(f.metrics[k].ev >= 1 && f.metrics[k].ev <= 10);
});
test('steadier ratings give higher confidence than chaotic ones', () => {
  const steady = {}, wild = {}, r = rng(11);
  for (let i = 0; i < 80; i++) { const n = START + i; steady[dk(n)] = { m: cl(7 + (r() - 0.5)), p: cl(7 + (r() - 0.5)), c: cl(7 + (r() - 0.5)) }; wild[dk(n)] = { m: cl(1 + r() * 9), p: cl(1 + r() * 9), c: cl(1 + r() * 9) }; }
  const a = forecast(steady, dk(START + 80)), b = forecast(wild, dk(START + 80));
  for (const k of KEYS) assert.ok(a.metrics[k].conf > b.metrics[k].conf);
});
test('drivers explain the forecast: baseline plus parts adds up to EV (before clipping)', () => {
  const E = synth(150, 12, true), f = forecast(E, dk(START + 150));
  for (const k of KEYS) { const m = f.metrics[k]; const sum = Object.values(m.parts).reduce((a, b) => a + b, 0); assert.ok(Math.abs(sum - m.ev) < 1e-6 || m.ev === 1 || m.ev === 10, k + ' ' + sum + ' ' + m.ev); }
});
test('ridge: recovers a real signal and refuses noise', () => {
  const r = rng(13), X = [], y = [], v = [];
  for (let i = 0; i < 200; i++) { const a = r() - 0.5, b = r() - 0.5; X.push([a, b]); y.push(2 * a + (r() - 0.5) * 0.2); v.push(1); }
  const m = ridge(X, y, v); assert.ok(m.beta[0] > 0 && Math.abs(m.beta[1]) < Math.abs(m.beta[0]) / 5);
  const y2 = y.map(() => r() - 0.5), m2 = ridge(X, y2, v); assert.ok(m2.beta.every((b) => Math.abs(b) < 0.05));
});
test('recovery patterns are probabilities and run lengths are positive', () => {
  const p = patterns(synth(200, 14, true));
  for (const k of KEYS) { assert.ok(p[k].recover == null || (p[k].recover >= 0 && p[k].recover <= 1)); assert.ok(p[k].slumpLen == null || p[k].slumpLen >= 1); }
  assert.strictEqual(patterns({}), null);
});
test('runs on a long record fast enough for a phone', () => {
  const E = synth(900, 15, true), t0 = Date.now(); forecast(E, dk(START + 900)); assert.ok(Date.now() - t0 < 400, 'took ' + (Date.now() - t0));
});

test('rules version: weights are 40/20/15/10/10/5 and sum to 1', () => {
  const w = Object.values(CFG.ruleWeights); assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.deepStrictEqual(CFG.ruleWeights, { similar: 0.4, trajectory: 0.2, streak: 0.15, weekday: 0.1, reversion: 0.1, cross: 0.05 });
});
test('rules version: EV on the 1 to 10 scale, parts explain it, shares sum to 1, text is readable', () => {
  const E = synth(150, 16, true), f = forecast(E, dk(START + 150));
  for (const k of KEYS) {
    const r = f.metrics[k].rules; assert.ok(r && r.ev >= 1 && r.ev <= 10);
    assert.ok(Math.abs(r.parts.reduce((a, x) => a + x.share, 0) - 1) < 1e-9);
    assert.ok(Math.abs(r.parts.reduce((a, x) => a + x.share * x.est, 0) - r.ev) < 1e-6);
    assert.ok(r.because.length > 10 && !/NaN|undefined/.test(r.because), r.because);
  }
});
test('rules version: a Monday has no week-so-far part, and its share goes to the others', () => {
  const E = synth(150, 17, true), mon = [0, 1, 2, 3, 4, 5, 6].map((i) => START + 150 + i).find((n) => (n + 3) % 7 === 0);
  const r = forecast(E, mon).metrics.p.rules; assert.ok(!r.parts.some((x) => x.key === 'trajectory'));
  assert.ok(Math.abs(r.parts.reduce((a, x) => a + x.share, 0) - 1) < 1e-9);
});
test('rules version: no output before there is enough history to fit; backtest reports it', () => {
  const E = synth(15, 18, true), f = forecast(E, dk(START + 15)); assert.strictEqual(f.metrics.p.rules, null);
  const G = synth(200, 3, true), r = backtest(G, lastKeys(G, 30)); for (const k of KEYS) assert.ok(Number.isFinite(r[k].rules));
});
test('rules version beats "guess your average" on structured data, and the learned weights beat the fixed ones', () => {
  let a = 0, b = 0, r = 0, n = 0;
  for (const seed of [3, 4, 5]) { const E = synth(200, seed, true), x = backtest(E, lastKeys(E, 50)); for (const k of KEYS) { a += x[k].mae; b += x[k].naive; r += x[k].rules; n++; } }
  assert.ok(r / n < 0.92 * (b / n), `rules ${r / n} vs average ${b / n}`);
  assert.ok(a / n < r / n, `learned ${a / n} vs rules ${r / n}`);
});

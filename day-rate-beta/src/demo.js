/* Sample data for "Try with sample data". Pure and deterministic: same day in, same days out.
   Shown only in memory; the app never saves it (see status.demo in state.js). */
const dn = (k) => { const [a, b, c] = k.split('-').map(Number); return Math.round(Date.UTC(a, b - 1, c) / 864e5); };
const dk = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const NOTES = ['Coffee with a friend', 'Long walk after lunch', 'Busy day, but the big thing got done', 'Quiet evening at home', 'Slept badly, slow morning',
  'Dinner with family', 'Gym, then an early night', 'Deadline day', 'Lazy morning, good afternoon', 'Called an old friend', 'Rainy day, stayed in', 'Cooked something new'];

export function makeDemo(todayKey, days = 42) {
  const r = rng(7), entries = {}, end = dn(todayKey), clamp = (v) => Math.max(1, Math.min(10, Math.round(v)));
  for (let i = days; i >= 1; i--) {
    const n = end - i, wd = (n + 3) % 7, weekend = wd >= 5, trend = (days - i) * 0.035, jit = () => (r() - 0.5) * 3;
    const m = clamp(6 + trend + (weekend ? 0.8 : 0) + jit());
    const p = clamp(6.2 + trend * 0.8 + (weekend ? -1.4 : wd === 0 ? -0.5 : 0.3) + jit());
    const c = clamp(5.5 + trend * 0.6 + (weekend ? 1.8 : 0) + jit());
    const tags = [];
    if (weekend && r() < 0.7) tags.push('so');
    if (r() < 0.3) tags.push('ex');
    if (r() < 0.2) tags.push('ou');
    if (p <= 4 && r() < 0.6) tags.push('ld');
    if (m >= 8 && r() < 0.4) tags.push('sl');
    const e = { m, p, c, note: r() < 0.55 ? NOTES[Math.floor(r() * NOTES.length)] : '', created: Date.UTC(2000, 0, 1) + n, updated: Date.UTC(2000, 0, 1) + n };
    if (tags.length) e.tags = tags;
    entries[dk(n)] = e;
  }
  return { entries, meta: { haptics: false, sound: false, achInit: true, ach: {}, achNew: [], demo: true } };
}

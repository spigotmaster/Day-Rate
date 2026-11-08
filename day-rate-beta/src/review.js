/* Pure calculations for History > Search and History > Recap. No DOM, no storage.
   Uses raw 1-10 ratings throughout (never the relative 0-15 score) so results do not shift as your range changes. */
const pad = (n) => String(n).padStart(2, '0');
const dn = (k) => { const [a, b, c] = k.split('-').map(Number); return Math.round(Date.UTC(a, b - 1, c) / 864e5); };
const dk = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
const DIMS = ['m', 'p', 'c'];

/* q: { text, tags:[id], dim:'any'|'m'|'p'|'c', band:'any'|'high'|'mid'|'low', range:'all'|'30'|'90'|'365', today, labels:{id:label} }
   high = 8 or more, mid = 5 to 7, low = 4 or less. dim only matters when band is not 'any'. Newest first. */
export function searchDays(E, q) {
  const o = Object.assign({ text: '', tags: [], dim: 'any', band: 'any', range: 'all', today: null, labels: {} }, q);
  const words = String(o.text || '').toLowerCase().split(/\s+/).filter(Boolean);
  const minK = o.range === 'all' || !o.today ? '' : dk(dn(o.today) - (Number(o.range) - 1));
  const inBand = (v) => (o.band === 'high' ? v >= 8 : o.band === 'mid' ? v >= 5 && v <= 7 : o.band === 'low' ? v <= 4 : true);
  return Object.keys(E).filter((k) => {
    const e = E[k];
    if (!e || (minK && k < minK) || (o.today && k > o.today)) return false;
    const tags = e.tags || [];
    if (o.tags.length && !o.tags.every((t) => tags.includes(t))) return false;
    if (o.band !== 'any' && !(o.dim === 'any' ? DIMS : [o.dim]).some((d) => inBand(e[d]))) return false;
    if (words.length) {
      const hay = ((e.note || '') + ' ' + tags.map((t) => o.labels[t] || '').join(' ')).toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  }).sort().reverse();
}

/* kind 'month' (anchor 'YYYY-MM') or 'year' (anchor 'YYYY'). The current period runs up to today and is compared with the
   same number of days at the start of the previous period; a finished period is compared with the whole previous one. */
export function periodBounds(kind, anchor, today) {
  let start, fullEnd, pStart, pFullEnd;
  if (kind === 'month') {
    const [y, m] = anchor.split('-').map(Number);
    start = y + '-' + pad(m) + '-01'; fullEnd = dk(Math.round(Date.UTC(y, m, 0) / 864e5));
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    pStart = py + '-' + pad(pm) + '-01'; pFullEnd = dk(dn(start) - 1);
  } else {
    const y = Number(anchor);
    start = y + '-01-01'; fullEnd = y + '-12-31'; pStart = (y - 1) + '-01-01'; pFullEnd = (y - 1) + '-12-31';
  }
  if (start > today) return null;
  const end = fullEnd < today ? fullEnd : today, span = dn(end) - dn(start) + 1;
  let pEnd = dk(dn(pStart) + span - 1); if (pEnd > pFullEnd) pEnd = pFullEnd;
  return { kind, anchor, start, end, fullEnd, partial: end < fullEnd, span, pStart, pEnd };
}
export function shiftAnchor(kind, anchor, dir) {
  if (kind === 'year') return String(Number(anchor) + dir);
  const [y, m] = anchor.split('-').map(Number), t = y * 12 + (m - 1) + dir;
  return Math.floor(t / 12) + '-' + pad((t % 12) + 1);
}

export function recap(E, b) {
  const pick = (a, z) => Object.keys(E).sort().filter((k) => k >= a && k <= z && E[k]).map((k) => [k, E[k]]);
  const rows = pick(b.start, b.end), prows = pick(b.pStart, b.pEnd);
  const mean = (rs, f) => (rs.length ? rs.reduce((s, x) => s + f(x[1]), 0) / rs.length : null);
  const tri = (rs) => ({ m: mean(rs, (e) => e.m), p: mean(rs, (e) => e.p), c: mean(rs, (e) => e.c) });
  const sum = (e) => e.m + e.p + e.c;
  const out = { n: rows.length, span: b.span, avg: tri(rows), prevN: prows.length, delta: null, best: null, worst: null,
    bestWeekday: null, worstWeekday: null, longestRun: 0, topTags: [], months: null };
  if (!rows.length) return out;
  if (prows.length >= 3) { const p = tri(prows); out.delta = { m: out.avg.m - p.m, p: out.avg.p - p.p, c: out.avg.c - p.c }; }
  let best = rows[0], worst = rows[0];
  for (const r of rows) { if (sum(r[1]) > sum(best[1])) best = r; if (sum(r[1]) < sum(worst[1])) worst = r; }
  out.best = { k: best[0], s: sum(best[1]) / 3, note: best[1].note || '' };
  out.worst = { k: worst[0], s: sum(worst[1]) / 3 };
  // weekday rhythm: Monday = 0, needs 3+ rated days on every weekday
  const ws = Array(7).fill(0), wn = Array(7).fill(0);
  for (const [k, e] of rows) { const w = (dn(k) + 3) % 7; ws[w] += sum(e) / 3; wn[w]++; }
  if (wn.every((x) => x >= 3)) {
    const av = ws.map((v, i) => v / wn[i]), hi = Math.max(...av), lo = Math.min(...av);
    if (hi - lo >= 0.3) {
      if (av.filter((v) => v === hi).length === 1) out.bestWeekday = { wd: av.indexOf(hi), avg: hi };
      if (av.filter((v) => v === lo).length === 1) out.worstWeekday = { wd: av.indexOf(lo), avg: lo };
    }
  }
  let run = 1, longest = 1;
  for (let i = 1; i < rows.length; i++) { run = dn(rows[i][0]) - dn(rows[i - 1][0]) === 1 ? run + 1 : 1; if (run > longest) longest = run; }
  out.longestRun = longest;
  const cnt = {};
  rows.forEach(([, e]) => (e.tags || []).forEach((t) => { cnt[t] = (cnt[t] || 0) + 1; }));
  out.topTags = Object.entries(cnt).filter((x) => x[1] >= 2).sort((a, c) => c[1] - a[1] || (a[0] < c[0] ? -1 : 1)).slice(0, 3).map(([id, n]) => ({ id, n }));
  if (b.kind === 'year') {
    out.months = [];
    for (let m = 1; m <= 12; m++) {
      const mr = rows.filter(([k]) => k.slice(5, 7) === pad(m));
      out.months.push(mr.length >= 3 ? mr.reduce((s, x) => s + sum(x[1]) / 3, 0) / mr.length : null);
    }
  }
  return out;
}

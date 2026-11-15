/* Pure calendar maths for History > Month and "on this day". No DOM, no storage. Weeks start on Monday. */
const pad = (n) => String(n).padStart(2, '0');
const OK = /^\d{4}-\d{2}-\d{2}$/;

/* anchor 'YYYY-MM' -> { y, m, days, lead, weeks, cells }. cells has `lead` nulls first, then one object per day
   { k, day, future, today }, then nulls to fill the last week. */
export function monthGrid(anchor, today) {
  const [y, m] = anchor.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) { const k = y + '-' + pad(m) + '-' + pad(d); cells.push({ k, day: d, future: k > today, today: k === today }); }
  while (cells.length % 7) cells.push(null);
  return { y, m, days, lead, weeks: cells.length / 7, cells };
}
export function shiftMonth(anchor, dir) {
  const [y, m] = anchor.split('-').map(Number), t = y * 12 + (m - 1) + dir;
  return Math.floor(t / 12) + '-' + pad((t % 12) + 1);
}

/* Rated days on the same month and day in earlier years, nearest year first. (29 February only matches leap years.) */
export function onThisDay(E, date) {
  if (typeof date !== 'string' || !OK.test(date)) return [];
  const [y, m, d] = date.split('-').map(Number), out = [];
  for (const k of Object.keys(E || {})) {
    if (!OK.test(k) || !E[k]) continue;
    const [a, b, c] = k.split('-').map(Number);
    if (a < y && b === m && c === d) out.push({ years: y - a, key: k, e: E[k] });
  }
  return out.sort((p, q) => p.years - q.years);
}
export const relLabel = (n) => (n === 1 ? 'This day last year' : 'This day ' + n + ' years ago');

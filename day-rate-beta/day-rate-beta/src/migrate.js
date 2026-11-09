/* Schema versioning and migrations for Day Rate data.
   Pure functions: no DOM, no storage. Input/output shape: { entries: {...}, meta: {...} }.
   Rules: never delete user data (bad records go to meta.quarantine), never mutate the input,
   if any migration throws return the ORIGINAL data untouched, and refuse data from a newer app. */

export const CURRENT_SCHEMA = 2;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function detectSchema(db) {
  const s = db && db.meta && db.meta.schema;
  return Number.isInteger(s) && s >= 1 ? s : 1; // v1 = original data with no schema field
}

const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const noonUTC = (d) => Date.parse(d + 'T12:00:00Z');
const asRating = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
};
function cleanTags(t) {
  if (!Array.isArray(t)) return undefined;
  const out = [];
  for (const x of t) {
    if (typeof x !== 'string') continue;
    const v = x.trim().slice(0, 40);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 20) break;
  }
  return out.length ? out : undefined;
}

/* Each migration: { to, name, up(db) -> db }. up() may mutate the clone it is given. */
export const MIGRATIONS = [
  {
    to: 2,
    name: 'normalise-entries-and-stamp-schema',
    up(db) {
      const q = (db.meta.quarantine = db.meta.quarantine || {});
      const entries = {};
      for (const [date, e] of Object.entries(db.entries || {})) {
        const ok = DATE.test(date) && e && typeof e === 'object' && !Array.isArray(e);
        const m = ok ? asRating(e.m) : null, p = ok ? asRating(e.p) : null, c = ok ? asRating(e.c) : null;
        if (!ok || m == null || p == null || c == null) { q[date] = e; continue; } // keep, never delete
        const out = { m, p, c, note: typeof e.note === 'string' ? e.note : '' };
        out.created = Number.isFinite(e.created) ? e.created : noonUTC(date);
        out.updated = Number.isFinite(e.updated) ? e.updated : out.created;
        const tags = cleanTags(e.tags);
        if (tags) out.tags = tags;
        for (const k of Object.keys(e)) if (!(k in out) && k !== 'tags') out[k] = e[k]; // keep unknown fields
        entries[date] = out;
      }
      db.entries = entries;
      db.meta.schema = 2;
      return db;
    },
  },
];

/* migrate(db) -> { db, from, to, status, ran, backup, error }
   status: 'current' | 'migrated' | 'failed' | 'newer'
   backup: a deep copy of the original data, present only when something ran (save it before writing). */
export function migrate(input, migrations = MIGRATIONS, target = CURRENT_SCHEMA) {
  const original = input && typeof input === 'object' ? input : { entries: {}, meta: {} };
  const from = detectSchema(original);
  const base = { db: original, from, to: from, ran: [], backup: null, error: null };
  if (from > target) return { ...base, status: 'newer' };
  if (from === target) return { ...base, status: 'current' };
  let work = clone({ entries: original.entries || {}, meta: original.meta || {} });
  const ran = [];
  try {
    for (const m of migrations.filter((x) => x.to > from && x.to <= target).sort((a, b) => a.to - b.to)) {
      work = m.up(work);
      work.meta.schema = m.to;
      ran.push(m.name);
    }
  } catch (err) {
    return { ...base, status: 'failed', error: String((err && err.message) || err) };
  }
  return { db: work, from, to: detectSchema(work), status: 'migrated', ran, backup: clone(original), error: null };
}

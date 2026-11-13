// Minimal Cloudflare D1 look-alike on top of Node's built-in SQLite, so the server's real SQL runs in tests.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../server/schema.sql', import.meta.url), 'utf8'));
  const prep = (sql) => {
    let args = [];
    const st = { bind: (...a) => { args = a; return st; },
      run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      first: async () => db.prepare(sql).get(...args) || null };
    return st;
  };
  return { prepare: prep, raw: db };
}

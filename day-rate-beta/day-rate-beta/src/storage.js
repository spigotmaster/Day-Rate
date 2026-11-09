/* Async storage for Day Rate: IndexedDB first, localStorage fallback.
   Two logical keys: 'entries' and 'meta' (objects, not JSON strings).
   While rolling out, writes are mirrored to the legacy localStorage keys so a rollback or an
   older cached copy of the app still sees current data. Set mirror:false once stable. */

const LEGACY = { entries: 'dayrate:v1', meta: 'dayrate:meta' };
const STORE = 'kv';

function openIDB(idb, name) {
  return new Promise((resolve, reject) => {
    if (!idb) return reject(new Error('no indexedDB'));
    let req;
    try { req = idb.open(name, 1); } catch (e) { return reject(e); }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
}
const tx = (db, mode, fn) => new Promise((resolve, reject) => {
  const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
  let req;
  try { req = fn(s); } catch (e) { return reject(e); }
  t.oncomplete = () => resolve(req ? req.result : undefined);
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error || new Error('transaction aborted'));
});
const lsRead = (ls, k) => { try { const v = ls.getItem(LEGACY[k]); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } };
const lsWrite = (ls, k, v) => { try { ls.setItem(LEGACY[k], JSON.stringify(v)); return true; } catch { return false; } };

export async function openStore({ dbName = 'dayrate', idb = globalThis.indexedDB, ls = globalThis.localStorage, mirror = true } = {}) {
  let db = null;
  try { db = await openIDB(idb, dbName); } catch { db = null; }
  const backend = db ? 'idb' : 'localStorage';

  const api = {
    backend,
    async get(k) {
      if (!db) return lsRead(ls, k);
      return tx(db, 'readonly', (s) => s.get(k));
    },
    async set(k, v) {
      if (!db) { if (!lsWrite(ls, k, v)) throw new Error('localStorage write failed'); return; }
      await tx(db, 'readwrite', (s) => s.put(v, k));
      if (mirror) lsWrite(ls, k, v); // best effort; ignore quota errors
    },
    async snapshot() { return { entries: (await api.get('entries')) || {}, meta: (await api.get('meta')) || {} }; },
    async saveAll({ entries, meta }) { await api.set('entries', entries); await api.set('meta', meta); },
    /* One-time copy of existing localStorage data into IndexedDB. Never deletes the original. */
    async importLegacy() {
      if (!db) return { imported: false, reason: 'no-idb' };
      if ((await api.get('entries')) !== undefined) return { imported: false, reason: 'already-has-data' };
      const e = lsRead(ls, 'entries'), m = lsRead(ls, 'meta');
      if (e === undefined && m === undefined) return { imported: false, reason: 'nothing-to-import' };
      await api.saveAll({ entries: e || {}, meta: { ...(m || {}), legacyImportedAt: Date.now() } });
      return { imported: true, days: Object.keys(e || {}).length };
    },
    close() { if (db) db.close(); },
  };
  return api;
}

/* Ask the browser not to evict our data. Returns true/false/null (unsupported). */
export async function requestPersistence(nav = globalThis.navigator) {
  try {
    if (!nav || !nav.storage || !nav.storage.persist) return null;
    if (nav.storage.persisted && (await nav.storage.persisted())) return true;
    return await nav.storage.persist();
  } catch { return null; }
}

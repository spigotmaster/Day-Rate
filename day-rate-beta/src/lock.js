/* Privacy lock maths. Pure apart from Web Crypto: no DOM, no storage.
   The lock is a gate, not encryption: it only keeps casual eyes out. The PIN is stored as a salted PBKDF2 hash. */
export const ITER = 120000, AWAY_MS = 5 * 60e3, FREE_TRIES = 5;
export const validPin = (p) => typeof p === 'string' && /^\d{4,6}$/.test(p);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

async function derive(pin, saltHex, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: iter }, key, 256));
}
/* A stored lock must look exactly right. Anything else is ignored, so a damaged record can never lock someone out of their days. */
export const validLock = (o) => !!o && typeof o === 'object' && o.v === 1 && /^[0-9a-f]{32}$/.test(o.salt) && /^[0-9a-f]{64}$/.test(o.hash)
  && Number.isInteger(o.iter) && o.iter >= 1000 && o.iter <= 1e6 && Number.isInteger(o.len) && o.len >= 4 && o.len <= 6;

export async function makeLock(pin, rand = () => crypto.getRandomValues(new Uint8Array(16))) {
  if (!validPin(pin)) throw new Error('PIN must be 4 to 6 digits');
  const salt = hex(rand());
  return { v: 1, salt, iter: ITER, len: pin.length, hash: await derive(pin, salt, ITER), fails: 0, until: 0 };
}
export async function checkPin(lock, pin) {
  if (!validLock(lock) || !validPin(pin) || pin.length !== lock.len) return false;
  const h = await derive(pin, lock.salt, lock.iter);
  let d = 0; for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ lock.hash.charCodeAt(i);
  return d === 0;
}
/* After FREE_TRIES wrong PINs in a row: 15 s, 30 s, 60 s ... up to 5 minutes. Nothing is ever deleted. */
export const waitMs = (fails) => (fails < FREE_TRIES ? 0 : Math.min(300000, 15000 * 2 ** (fails - FREE_TRIES)));
export const recordFail = (lock, now) => { const fails = (lock.fails || 0) + 1; return { ...lock, fails, until: now + waitMs(fails) }; };
export const recordOk = (lock) => ({ ...lock, fails: 0, until: 0 });
export const remaining = (lock, now) => Math.max(0, ((lock && lock.until) || 0) - now);
/* Lock when away for the set time, when there is no record of last use, or when the clock moved backwards. */
export const shouldLock = (lastActive, now, away = AWAY_MS) => !Number.isFinite(lastActive) || lastActive <= 0 || now < lastActive || now - lastActive >= away;

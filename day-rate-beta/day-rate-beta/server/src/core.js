/* Pure helpers for the reminder server. No Cloudflare APIs here, so Node can test everything.
   The server stores only: the push endpoint, a reminder time (HH:MM), a time zone name, and the last day it sent or was told to skip.
   It never receives ratings, notes, tags or any other app data. */

/* Only real browser push services are allowed, so a caller can never make the server send requests to arbitrary addresses. */
const HOST_OK = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, /^[a-z0-9.-]+\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
export function isAllowedEndpoint(s) {
  let u; try { u = new URL(String(s)); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || String(s).length > 1000) return false;
  return HOST_OK.some((re) => re.test(u.hostname));
}
export const validTime = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
export function validTz(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch { return false; }
}

/* Local calendar date and minutes since midnight at a moment, in a named time zone. */
export function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: p.year + '-' + p.month + '-' + p.day, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
/* The app's day rolls over at 4 am, so "today" for skipping and for once-a-day tracking is the local date 4 hours ago. */
export const appDay = (ms, tz) => localParts(ms - 4 * 3600e3, tz).date;

/* sub: { time:'HH:MM', tz, last_sent, skip_date }. Due from the chosen time until `windowMin` minutes later (covers a missed minute),
   at most once per app day, and not if the app said today is already rated. */
export function isDue(sub, ms, windowMin = 15) {
  const lp = localParts(ms, sub.tz), [h, m] = sub.time.split(':').map(Number), at = h * 60 + m, day = appDay(ms, sub.tz);
  if (lp.minutes < at || lp.minutes >= at + windowMin) return false;
  return sub.last_sent !== day && sub.skip_date !== day;
}

export async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const b64u = (buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64uText = (t) => b64u(new TextEncoder().encode(t));

/* VAPID (RFC 8292): a signed token proving the push comes from this server. privateJwk is the JSON string made by generate-vapid.mjs. */
export async function vapidHeader({ endpoint, publicKey, privateJwk, subject, nowMs = Date.now() }) {
  const key = await crypto.subtle.importKey('jwk', JSON.parse(privateJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64uText(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64uText(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: subject }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head + '.' + body));
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + publicKey;
}

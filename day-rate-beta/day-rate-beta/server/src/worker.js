/* Day Rate reminder server (Cloudflare Worker + D1). Sends an empty "time to rate" push at each person's chosen time.
   Routes: GET /health, POST /subscribe, POST /unsubscribe, POST /skip. A cron trigger runs `scheduled` every minute. */
import { appDay, isAllowedEndpoint, isDue, sha256Hex, validDate, validTime, validTz, vapidHeader } from './core.js';

const json = (o, status, extra) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json', ...(extra || {}) } });
const cors = (req, env) => {
  const o = req.headers.get('origin');
  return o && env.ALLOWED_ORIGIN && o === env.ALLOWED_ORIGIN
    ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' } : {};
};

export async function handleFetch(req, env) {
  const url = new URL(req.url), c = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: c['access-control-allow-origin'] ? 204 : 403, headers: c });
  if (req.method === 'GET' && url.pathname === '/health') return json({ ok: true }, 200, c);
  if (req.method !== 'POST') return json({ error: 'not found' }, 404, c);
  if (!c['access-control-allow-origin']) return json({ error: 'origin not allowed' }, 403);
  const raw = await req.text();
  if (raw.length > 2048) return json({ error: 'too large' }, 413, c);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400, c); }
  if (!b || typeof b !== 'object' || !isAllowedEndpoint(b.endpoint)) return json({ error: 'bad endpoint' }, 400, c);
  const id = await sha256Hex(b.endpoint), now = Date.now();

  if (url.pathname === '/subscribe') {
    if (!validTime(b.time) || !validTz(b.tz)) return json({ error: 'bad time or time zone' }, 400, c);
    const have = await env.DB.prepare('SELECT id FROM subs WHERE id = ?').bind(id).first();
    if (!have) {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM subs').first();
      if (n && n.n >= Number(env.MAX_SUBS || 2000)) return json({ error: 'full' }, 503, c);
      await env.DB.prepare('INSERT INTO subs (id, endpoint, time, tz, updated) VALUES (?, ?, ?, ?, ?)').bind(id, b.endpoint, b.time, b.tz, now).run();
    } else {
      await env.DB.prepare('UPDATE subs SET time = ?, tz = ?, updated = ? WHERE id = ?').bind(b.time, b.tz, now, id).run();
    }
    return json({ ok: true }, 200, c);
  }
  if (url.pathname === '/unsubscribe') { await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(id).run(); return json({ ok: true }, 200, c); }
  if (url.pathname === '/skip') {
    if (!validDate(b.date)) return json({ error: 'bad date' }, 400, c);
    await env.DB.prepare('UPDATE subs SET skip_date = ? WHERE id = ?').bind(b.date, id).run();
    return json({ ok: true }, 200, c);
  }
  return json({ error: 'not found' }, 404, c);
}

export async function runSchedule(env, nowMs = Date.now(), send = fetch) {
  const out = { checked: 0, sent: 0, removed: 0, failed: 0 };
  await env.DB.prepare('DELETE FROM subs WHERE updated < ?').bind(nowMs - 120 * 86400e3).run(); // people who stopped opening the app
  const { results } = await env.DB.prepare('SELECT id, endpoint, time, tz, last_sent, skip_date FROM subs').all();
  for (const s of results || []) {
    out.checked++;
    if (!isDue(s, nowMs)) continue;
    try {
      const auth = await vapidHeader({ endpoint: s.endpoint, publicKey: env.VAPID_PUBLIC, privateJwk: env.VAPID_PRIVATE_JWK, subject: env.VAPID_SUBJECT, nowMs });
      const r = await send(s.endpoint, { method: 'POST', headers: { Authorization: auth, TTL: '7200', Urgency: 'normal', 'Content-Length': '0' } });
      if (r.status >= 200 && r.status < 300) { await env.DB.prepare('UPDATE subs SET last_sent = ? WHERE id = ?').bind(appDay(nowMs, s.tz), s.id).run(); out.sent++; }
      else if (r.status === 404 || r.status === 410) { await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(s.id).run(); out.removed++; }
      else out.failed++; // tried again next minute until the 15 minute window closes
    } catch { out.failed++; }
  }
  return out;
}

export default { fetch: handleFetch, scheduled: (_e, env, ctx) => ctx.waitUntil(runSchedule(env)) };

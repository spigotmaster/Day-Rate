/* On-device error log. Never leaves the phone unless the user taps "Copy debug info".
   Never records notes, tags or ratings. Storage is injected so this is testable. */

export function createErrorLog({ storage, key = 'dayrate:errors', max = 50, now = () => Date.now() } = {}) {
  const read = () => {
    try { const v = JSON.parse(storage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  const write = (list) => { try { storage.setItem(key, JSON.stringify(list.slice(-max))); } catch { /* storage full: drop silently */ } };
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  return {
    add(kind, err, ctx) {
      const list = read();
      list.push({
        t: now(), kind: clip(kind, 30),
        msg: clip(err && err.message ? err.message : err, 300),
        stack: clip(err && err.stack, 1200),
        ctx: clip(ctx, 120),
      });
      write(list);
    },
    list: read,
    clear() { try { storage.removeItem(key); } catch { /* ignore */ } },
    install(win) {
      win.addEventListener('error', (e) => this.add('error', e.error || e.message, (e.filename || '') + ':' + (e.lineno || '')));
      win.addEventListener('unhandledrejection', (e) => this.add('promise', e.reason));
    },
    /* env: { version, schema, entryCount, userAgent } counts only, no content */
    asText(env = {}) {
      const head = ['Day Rate debug info', 'version: ' + (env.version || '?'), 'schema: ' + (env.schema || '?'),
        'days stored: ' + (env.entryCount == null ? '?' : env.entryCount), 'agent: ' + clip(env.userAgent, 200), ''];
      const rows = read().map((r) => new Date(r.t).toISOString() + ' [' + r.kind + '] ' + r.msg + (r.ctx ? ' @ ' + r.ctx : '') + (r.stack ? '\n' + r.stack : ''));
      return head.concat(rows.length ? rows : ['No errors logged.']).join('\n');
    },
  };
}

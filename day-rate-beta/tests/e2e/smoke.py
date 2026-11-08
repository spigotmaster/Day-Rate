"""End-to-end smoke test for Day Rate. Run: python3 tests/e2e/smoke.py [app_dir]
Needs: pip install playwright && playwright install chromium
Split-agnostic on purpose: only uses element ids and localStorage keys, never app globals,
so it must pass identically before and after the index.html split.
Seeding uses the legacy localStorage keys. Once IndexedDB is wired in (mirror:true) these still work
because the app imports legacy data on first run; if mirror is off, change seed() to write IndexedDB."""
import functools, http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

APP = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
PORT = 8791
fails, passes = [], []

def check(name, cond, extra=''):
    (passes if cond else fails).append(name)
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra) if (extra and not cond) else ''))

SEED = """([n, productivity]) => {
  const t = new Date(Date.now() - 4 * 36e5);                      // app day rolls over at 4 am
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const o = {};
  for (let i = n; i >= 1; i--) { const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - i);
    o[fmt(d)] = {m: 6 + (i % 3), p: productivity, c: 5 + (i % 4), note: '', created: 1, updated: 1}; }
  localStorage.clear();
  localStorage.setItem('dayrate:v1', JSON.stringify(o));
  localStorage.setItem('dayrate:meta', JSON.stringify({haptics: true, sound: true, achInit: true, ach: {}, onboarded: 1}));
}"""

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k): pass
    h = functools.partial(Quiet, directory=APP)
    socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.TCPServer(('127.0.0.1', PORT), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

def fresh(pw, **ctx):
    b = pw.chromium.launch()
    c = b.new_context(viewport={'width': 390, 'height': 780}, **ctx)
    pg = c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    return b, pg, errs

def seed(pg, n, p):
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.evaluate(SEED, [n, p]); pg.reload(); pg.wait_for_timeout(400)

def rate_today(pg, plus_clicks=4):
    pg.click('#rateNow'); pg.wait_for_timeout(200)
    for _ in range(3):
        for _ in range(plus_clicks): pg.click('#plus')
        pg.click('#lock'); pg.wait_for_timeout(150)

def close_celebrations(pg):
    for _ in range(12):
        if not pg.is_visible('#cele'): return
        pg.wait_for_timeout(800); pg.click('#celOk'); pg.wait_for_timeout(250)

with sync_playwright() as pw:
    srv = serve()

    # 1. Tabs: each icon tab opens its view, shows its label pill, no console errors
    b, pg, errs = fresh(pw); seed(pg, 30, 6)
    for tab, label in [('#nh','History'),('#ntr','Trends'),('#ni','Insights'),('#na','Achievements'),('#nd','Data'),('#nt','Today')]:
        pg.click(tab); pg.wait_for_timeout(250)
        check(f'tab {label}: pill text', pg.inner_text('#tabtip') == label)
        check(f'tab {label}: marked selected', 'on' in (pg.get_attribute(tab, 'class') or ''))
        check(f'tab {label}: has accessible name', pg.get_attribute(tab, 'aria-label') == label)
    pg.wait_for_timeout(2600)
    check('label pill fades out', float(pg.evaluate("getComputedStyle(document.querySelector('#tabtip')).opacity")) < 0.05)
    check('tabs: no console errors', not errs, errs); b.close()

    # 2. Rating flow ends on the result screen and saves today
    b, pg, errs = fresh(pw); seed(pg, 10, 6)
    before = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('dayrate:v1')||'{}')).length")
    rate_today(pg, 2); pg.wait_for_timeout(1000); close_celebrations(pg)
    after = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('dayrate:v1')||'{}')).length")
    check('rating saves one new day', after == before + 1, (before, after))
    check('rating: no console errors', not errs, errs); b.close()

    # 3. Celebration: a real unlock (50th productivity 8+ day) pops up, queues, closes, leaves the dot
    b, pg, errs = fresh(pw); seed(pg, 49, 9)
    rate_today(pg, 4); pg.wait_for_timeout(1500)
    check('unlock popup appears', pg.is_visible('#cele'))
    check('popup names the achievement', pg.inner_text('#celT') == 'Driven I', pg.inner_text('#celT') if pg.is_visible('#celT') else '')
    pg.wait_for_timeout(1500)
    lit = pg.evaluate("""()=>{const c=document.querySelector('#celCv'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>20)n++;return n}""")
    check('fireworks drew pixels', lit > 500, lit)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('Escape closes popup', not pg.is_visible('#cele'))
    check('new-achievement dot shown', not pg.evaluate("document.querySelector('#achPip').hidden"))
    pg.click('#na'); pg.wait_for_timeout(300)
    check('opening Achievements clears the dot', pg.evaluate("document.querySelector('#achPip').hidden"))
    check('celebration: no console errors', not errs, errs); b.close()

    # 4. Reduced motion: popup still shows, fireworks are skipped
    b, pg, errs = fresh(pw, reduced_motion='reduce'); seed(pg, 49, 9)
    rate_today(pg, 4); pg.wait_for_timeout(1500)
    check('reduced motion: popup still appears', pg.is_visible('#cele'))
    lit = pg.evaluate("""()=>{const c=document.querySelector('#celCv'),d=c.getContext('2d').getImageData(0,0,Math.max(1,c.width),Math.max(1,c.height)).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>20)n++;return n}""")
    check('reduced motion: no fireworks', lit == 0, lit); b.close()

    # 5. Dark mode renders the popup with readable colours (text differs from its background)
    b, pg, errs = fresh(pw, color_scheme='dark'); seed(pg, 49, 9)
    rate_today(pg, 4); pg.wait_for_timeout(1500)
    col = pg.evaluate("(()=>{const c=getComputedStyle(document.querySelector('.celCard'));return [c.color,c.backgroundColor]})()")
    check('dark mode: popup text and background differ', col[0] != col[1], col); b.close()

    # 6. Stored days survive a reload (the real backup/import UI is covered when the split adds file-picker tests)
    b, pg, errs = fresh(pw); seed(pg, 20, 7)
    snap = pg.evaluate("localStorage.getItem('dayrate:v1')")
    pg.evaluate("localStorage.removeItem('dayrate:v1')"); pg.reload(); pg.wait_for_timeout(300)
    pg.evaluate("s=>localStorage.setItem('dayrate:v1', s)", snap); pg.reload(); pg.wait_for_timeout(300)
    n = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('dayrate:v1'))).length")
    check('data survives reload', n == 20, n); b.close()

    # 7. Empty app: first run opens without errors
    b, pg, errs = fresh(pw)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.evaluate("localStorage.clear();localStorage.setItem('dayrate:meta',JSON.stringify({onboarded:1}))"); pg.reload(); pg.wait_for_timeout(500)
    for t in ['#nh', '#ntr', '#ni', '#na', '#nd']: pg.click(t); pg.wait_for_timeout(150)
    check('empty app: every tab opens without errors', not errs, errs); b.close()
    srv.shutdown()

print(f'\n{len(passes)} passed, {len(fails)} failed')
sys.exit(1 if fails else 0)

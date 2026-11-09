"""Onboarding and sample-data mode end-to-end checks. Run: python3 tests/e2e/onboarding.py [app_dir]"""
import functools, http.server, json, os, re, socketserver, sys, threading
from playwright.sync_api import sync_playwright
APP=os.path.abspath(sys.argv[1] if len(sys.argv)>1 else '.'); PORT=8799
passes,fails=[],[]
def check(n,c,x=''):
    (passes if c else fails).append(n); print(('PASS ' if c else 'FAIL ')+n+(' '+str(x) if (x and not c) else ''))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a,**k):pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',PORT),functools.partial(Q,directory=APP)); threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{PORT}/index.html'
SEED="""(n)=>{const t=new Date(Date.now()-4*36e5),f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),o={};
 for(let i=n;i>=1;i--){const d=new Date(t.getFullYear(),t.getMonth(),t.getDate()-i);o[f(d)]={m:6,p:9,c:7,note:'real day '+i,created:1,updated:1}}
 localStorage.clear();localStorage.setItem('dayrate:v1',JSON.stringify(o));localStorage.setItem('dayrate:meta',JSON.stringify({sound:false,achInit:true,ach:{}}))}"""
def new(pw,**ctx):
    b=pw.chromium.launch(); c=b.new_context(viewport={'width':390,'height':780},**ctx); pg=c.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    return b,pg,errs
def fresh(pw,**ctx):
    b,pg,errs=new(pw,**ctx); pg.goto(URL); pg.wait_for_timeout(700); return b,pg,errs
def ls(pg,k): return pg.evaluate("k=>localStorage.getItem(k)",k)
def meta(pg): return json.loads(ls(pg,'dayrate:meta') or '{}')
def days(pg):
    pg.click('#nd'); pg.wait_for_timeout(250); m=re.search(r'(\d+) days',pg.inner_text('#ver')); return int(m.group(1)) if m else -1
def visible(pg,s): return pg.is_visible(s)
with sync_playwright() as pw:
    # --- first launch
    b,pg,errs=fresh(pw)
    check('first launch shows the intro',visible(pg,'#onb') and pg.inner_text('#onbT')=='Three ratings, once a day')
    check('intro is a labelled dialog',pg.get_attribute('#onb','role')=='dialog' and pg.get_attribute('#onb','aria-modal')=='true')
    check('focus moves to the heading',pg.evaluate("document.activeElement.id")=='onbT')
    check('step counter and four dots',pg.inner_text('#onbStep')=='Step 1 of 4' and pg.locator('#onbDots i').count()==4)
    check('Back is disabled on the first step',pg.is_disabled('#onbBack'))
    pg.click('#onbNext'); check('step 2 explains relative scoring',pg.inner_text('#onbT')=='Your score is relative to you')
    pg.click('#onbBack'); check('Back returns to step 1',pg.inner_text('#onbT')=='Three ratings, once a day')
    pg.click('#onbNext'); pg.click('#onbNext'); check('step 3 is about privacy',pg.inner_text('#onbT')=='Private by default' and 'no tracking' in pg.inner_text('#onbBody'))
    check('desktop browser: no iPhone home-screen hint',('Home Screen' not in pg.inner_text('#onbBody')))
    for _ in range(14): pg.keyboard.press('Tab')
    check('Tab stays inside the dialog',pg.evaluate("document.querySelector('#onb').contains(document.activeElement)"))
    pg.click('#onbNext'); check('last step: choices shown, Next and Skip hidden',visible(pg,'#onbGo') and visible(pg,'#onbDemo') and not visible(pg,'#onbNext') and not visible(pg,'#onbSkip'))
    check('last step names the primary action',pg.inner_text('#onbGo')=='Rate my first day')
    pg.click('#onbGo'); pg.wait_for_timeout(400)
    check('"Rate my first day" opens the rating screen',visible(pg,'#vrate') and not visible(pg,'#onb'))
    check('finishing marks the intro as seen',bool(meta(pg).get('onboarded')))
    pg.reload(); pg.wait_for_timeout(600); check('intro does not return after reload',not visible(pg,'#onb'))
    check('first launch: no console errors',not errs,errs); b.close()
    # --- skip and escape
    b,pg,errs=fresh(pw); pg.click('#onbSkip'); pg.wait_for_timeout(300)
    check('Skip closes the intro and shows Today',not visible(pg,'#onb') and visible(pg,'#vtoday') and bool(meta(pg).get('onboarded'))); b.close()
    b,pg,errs=fresh(pw); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('Escape skips the intro',not visible(pg,'#onb') and bool(meta(pg).get('onboarded'))); b.close()
    # --- existing user never sees it
    b,pg,errs=new(pw); pg.goto(URL); pg.evaluate(SEED,6); pg.reload(); pg.wait_for_timeout(700)
    check('existing user: no intro',not visible(pg,'#onb')); check('existing user is marked as done',bool(meta(pg).get('onboarded')))
    # --- replay from Data, then try sample data without touching real days
    real_before=ls(pg,'dayrate:v1'); pg.click('#nd'); pg.wait_for_timeout(200); pg.click('#onbAgain'); pg.wait_for_timeout(300)
    check('Data > Show intro reopens the tour',visible(pg,'#onb'))
    for _ in range(3): pg.click('#onbNext')
    check('replay with data: primary button says Done',pg.inner_text('#onbGo')=='Done')
    pg.click('#onbDemo'); pg.wait_for_timeout(500)
    check('sample mode shows the labelled banner',visible(pg,'#demoBar') and 'Nothing here is saved' in pg.inner_text('#demoBar'))
    check('sample mode loads 42 sample days',days(pg)==42,days(pg))
    check('export and import are switched off in sample mode',all(pg.is_disabled(s) for s in ['#xcsv','#xjson','#xcopy','#ximp']) and visible(pg,'#demoNote'))
    check('Show intro is disabled inside sample mode',pg.is_disabled('#onbAgain'))
    pg.click('#nt'); pg.wait_for_timeout(250); pg.click('#rateNow')
    for _ in range(3):
        for _ in range(5): pg.click('#plus')
        pg.click('#lock'); pg.wait_for_timeout(120)
    pg.wait_for_timeout(1500)
    check('rating inside sample mode shows no celebration',not visible(pg,'#cele'))
    check('sample mode: real data untouched in localStorage',ls(pg,'dayrate:v1')==real_before)
    idb=pg.evaluate("""()=>new Promise(res=>{const r=indexedDB.open('dayrate',1);r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get('entries');g.onsuccess=()=>{r.result.close();res(Object.keys(g.result||{}).length)}}})""")
    check('sample mode: real data untouched in IndexedDB',idb==6,idb)
    pg.click('#nh'); pg.wait_for_timeout(300); pg.click('#hmode [data-m="sr"]'); pg.wait_for_timeout(250)
    check('sample notes are searchable',pg.locator('#srres .srrow').count()>0 and 'real day' not in pg.inner_text('#srres'))
    pg.reload(); pg.wait_for_timeout(700)
    check('reload leaves sample mode and brings real data back',not visible(pg,'#demoBar') and days(pg)==6)
    # exit button path
    pg.click('#nd'); pg.click('#onbAgain'); [pg.click('#onbNext') for _ in range(3)]; pg.click('#onbDemo'); pg.wait_for_timeout(400)
    pg.click('#demoExit'); pg.wait_for_timeout(500)
    check('Exit sample restores real days and hides the banner',not visible(pg,'#demoBar') and days(pg)==6)
    check('real data still byte-identical',ls(pg,'dayrate:v1')==real_before)
    check('sample flow: no console errors',not errs,errs); b.close()
    # --- brand-new user takes the sample route, then exits: nothing saved
    b,pg,errs=fresh(pw); [pg.click('#onbNext') for _ in range(3)]; pg.click('#onbDemo'); pg.wait_for_timeout(500)
    check('new user in sample mode sees data',days(pg)==42)
    pg.click('#demoExit'); pg.wait_for_timeout(500)
    check('after exit a new user has no days and nothing was stored',days(pg)==0 and ls(pg,'dayrate:v1') is None,ls(pg,'dayrate:v1'))
    check('new user marked as having seen the intro',bool(meta(pg).get('onboarded'))); b.close()
    # --- iPhone browser tab gets the Home Screen hint
    b,pg,errs=fresh(pw,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    pg.click('#onbNext'); pg.click('#onbNext'); check('iPhone in Safari: Home Screen hint shown',('Home Screen' in pg.inner_text('#onbBody')))
    pg.screenshot(path='/tmp/onb3.png'); b.close()
    # --- screenshots for review (light and dark)
    for scheme in ['light','dark']:
        b,pg,errs=fresh(pw,color_scheme=scheme); pg.screenshot(path=f'/tmp/onb1_{scheme}.png'); pg.click('#onbNext'); pg.screenshot(path=f'/tmp/onb2_{scheme}.png')
        [pg.click('#onbNext') for _ in range(2)]; pg.screenshot(path=f'/tmp/onb4_{scheme}.png'); b.close()
srv.shutdown(); print(f'\n{len(passes)} passed, {len(fails)} failed'); sys.exit(1 if fails else 0)

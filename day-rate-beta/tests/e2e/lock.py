"""Privacy lock end-to-end checks. Run: python3 tests/e2e/lock.py [app_dir]"""
import functools, http.server, json, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright
APP=os.path.abspath(sys.argv[1] if len(sys.argv)>1 else '.'); PORT=8831
passes,fails=[],[]
def check(n,c,x=''):
    (passes if c else fails).append(n); print(('PASS ' if c else 'FAIL ')+n+(' '+str(x) if (x and not c) else ''))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a,**k):pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',PORT),functools.partial(Q,directory=APP)); threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{PORT}/index.html'
SEED="""(n)=>{const t=new Date(Date.now()-4*36e5),f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),o={};
 for(let i=n;i>=1;i--){const d=new Date(t.getFullYear(),t.getMonth(),t.getDate()-i);o[f(d)]={m:6,p:7,c:8,note:'private note',created:1,updated:1}}
 localStorage.clear();localStorage.setItem('dayrate:v1',JSON.stringify(o));localStorage.setItem('dayrate:meta',JSON.stringify({sound:false,achInit:true,ach:{},onboarded:1}))}"""
AWAY="if(sessionStorage.getItem('__away'))localStorage.setItem('dayrate:active',String(Date.now()-6*60e3))"
def new(pw,**ctx):
    b=pw.chromium.launch(); c=b.new_context(viewport={'width':390,'height':780},**ctx); c.add_init_script(AWAY); pg=c.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.goto(URL); pg.evaluate(SEED,8); pg.reload(); pg.wait_for_timeout(600); return b,pg,errs
def vis(pg,s): return pg.is_visible(s)
def meta(pg): return json.loads(pg.evaluate("localStorage.getItem('dayrate:meta')") or '{}')
def setpin(pg,pin='4821'):
    pg.click('#nd'); pg.wait_for_timeout(200); pg.fill('#lkNew',pin); pg.fill('#lkNew2',pin); pg.click('#lkSet'); pg.wait_for_timeout(500)
def hide(pg): pg.evaluate("Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
def show(pg): pg.evaluate("Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
def away(pg): pg.evaluate("sessionStorage.setItem('__away','1')"); pg.reload(); pg.wait_for_timeout(600)
def unlock(pg,pin):
    pg.fill('#lockPin',pin); pg.click('#lockGo'); pg.wait_for_timeout(500)
with sync_playwright() as pw:
    b,pg,errs=new(pw)
    check('no lock by default: app opens',not vis(pg,'#pgate'))
    pg.click('#nd'); pg.wait_for_timeout(200)
    check('card says lock is off',pg.inner_text('#lkStatus').startswith('Off.') and not vis(pg,'#lkCur') and pg.inner_text('#lkSet')=='Set PIN')
    pg.fill('#lkNew','12'); pg.fill('#lkNew2','12'); pg.click('#lkSet'); check('short PIN refused','4 to 6' in pg.inner_text('#lkMsg'))
    pg.fill('#lkNew','1234'); pg.fill('#lkNew2','1235'); pg.click('#lkSet'); check('mismatched PINs refused','different' in pg.inner_text('#lkMsg'))
    check('nothing stored after refusals','lock' not in meta(pg))
    pg.fill('#lkNew','4821'); pg.fill('#lkNew2','4821'); pg.click('#lkSet'); pg.wait_for_timeout(500)
    m=meta(pg).get('lock',{}); check('PIN saved as a salted hash, not the PIN',bool(m.get('hash')) and len(m.get('salt',''))==32 and '4821' not in json.dumps(meta(pg)))
    check('card now says On and offers Change and Turn off',pg.inner_text('#lkStatus').startswith('On.') and pg.inner_text('#lkSet')=='Change PIN' and vis(pg,'#lkOff') and vis(pg,'#lkCur'))
    pg.reload(); pg.wait_for_timeout(600); check('quick reload does not lock (within 5 minutes)',not vis(pg,'#pgate'))
    hide(pg); check('leaving the app covers it',vis(pg,'#pgate') and 'cover' in pg.get_attribute('#pgate','class') and pg.evaluate("document.querySelector('#app').inert"))
    check('cover hides the keypad and shows only the name',not vis(pg,'#lockPin') and vis(pg,'#lockBrand'))
    show(pg); check('back within 5 minutes: cover lifts, no PIN',not vis(pg,'#pgate') and not pg.evaluate("document.querySelector('#app').inert"))
    hide(pg); pg.evaluate("Date.now=(o=>()=>o()+6*60e3)(Date.now)"); show(pg)
    check('back after 5 minutes: lock screen with PIN field',vis(pg,'#pgate') and vis(pg,'#lockPin') and 'cover' not in pg.get_attribute('#pgate','class'))
    check('locked: app behind is inert and field focused',pg.evaluate("document.querySelector('#app').inert") and pg.evaluate("document.activeElement.id")=='lockPin')
    pg.screenshot(path='/tmp/lock_light.png')
    unlock(pg,'0000'); check('wrong PIN: friendly message, still locked',vis(pg,'#pgate') and 'does not match' in pg.inner_text('#lockMsg'))
    unlock(pg,'4821'); check('right PIN unlocks',not vis(pg,'#pgate') and not pg.evaluate("document.querySelector('#app').inert"))
    check('failure counter reset after success',meta(pg)['lock']['fails']==0)
    away(pg); check('opening after 5 minutes away asks for the PIN',vis(pg,'#pgate') and vis(pg,'#lockPin'))
    for _ in range(5): unlock(pg,'1111')
    check('5 wrong tries: waits, button disabled, says how long',pg.is_disabled('#lockGo') and 'wait' in pg.inner_text('#lockMsg').lower(),pg.inner_text('#lockMsg'))
    check('wait is stored (survives a reload)',meta(pg)['lock']['fails']==5 and meta(pg)['lock']['until']>0)
    pg.click('#lockForgot'); check('Forgot PIN asks first and says days are kept',vis(pg,'#lockAsk') and 'not deleted' in pg.inner_text('#lockAsk') and not vis(pg,'#lockForm'))
    pg.click('#lockKeep'); check('Keep the lock goes back',vis(pg,'#lockForm') and vis(pg,'#pgate') and 'lock' in meta(pg))
    before=pg.evaluate("localStorage.getItem('dayrate:v1')")
    pg.click('#lockForgot'); pg.click('#lockReset'); pg.wait_for_timeout(400)
    check('reset removes the lock and opens the app',not vis(pg,'#pgate') and 'lock' not in meta(pg))
    check('reset keeps every day',pg.evaluate("localStorage.getItem('dayrate:v1')")==before and len(json.loads(before))==8)
    pg.click('#nd'); pg.wait_for_timeout(200); check('card back to Off after reset',pg.inner_text('#lkStatus').startswith('Off.'))
    setpin(pg,'1357'); pg.fill('#lkCur','0000'); pg.fill('#lkNew','2468'); pg.fill('#lkNew2','2468'); pg.click('#lkSet'); pg.wait_for_timeout(400)
    check('change with wrong current PIN refused','current PIN does not match' in pg.inner_text('#lkMsg'))
    pg.fill('#lkCur','1357'); pg.click('#lkSet'); pg.wait_for_timeout(600); check('change with right current PIN works',pg.inner_text('#lkMsg')=='PIN saved.')
    pg.fill('#lkCur','1357'); pg.click('#lkOff'); pg.wait_for_timeout(500); check('turn off with the old PIN refused',vis(pg,'#lkOff') and 'lock' in meta(pg))
    pg.fill('#lkCur','2468'); pg.click('#lkOff'); pg.wait_for_timeout(600); check('turn off with current PIN works',pg.inner_text('#lkStatus').startswith('Off.') and 'lock' not in meta(pg))
    check('no console errors',not errs,errs); b.close()
    b,pg,errs=new(pw); setpin(pg)
    txt=pg.evaluate("""async()=>{const m=await import('./src/data.js');return await m.backupText()}""")
    check('backup file contains no lock data',('"lock"' not in txt) and ('4821' not in txt) and ('salt' not in txt)); b.close()
    b,pg,errs=new(pw); setpin(pg); pg.click('#onbAgain'); [pg.click('#onbNext') for _ in range(3)]; pg.click('#onbDemo'); pg.wait_for_timeout(500)
    pg.click('#nd'); pg.wait_for_timeout(200)
    check('sample mode: lock controls disabled',pg.is_disabled('#lkSet') and 'Sample data' in pg.inner_text('#lkStatus'))
    hide(pg); pg.evaluate("Date.now=(o=>()=>o()+6*60e3)(Date.now)"); show(pg)
    check('sample mode still locks after 5 minutes, and no Forgot PIN there',vis(pg,'#pgate') and not vis(pg,'#lockForgot'))
    unlock(pg,'4821'); check('PIN returns to the sample',not vis(pg,'#pgate'))
    pg.click('#demoExit'); pg.wait_for_timeout(400)
    check('exiting sample keeps the real lock in place',meta(pg).get('lock',{}).get('hash') is not None)
    check('sample mode: no console errors',not errs,errs); b.close()
    b,pg,errs=new(pw,color_scheme='dark'); setpin(pg); away(pg); pg.screenshot(path='/tmp/lock_dark.png')
    check('dark mode: lock screen readable',pg.evaluate("(()=>{const c=getComputedStyle(document.querySelector('#pgate'));return c.color!==c.backgroundColor})()")); b.close()
srv.shutdown(); print(f'\n{len(passes)} passed, {len(fails)} failed'); sys.exit(1 if fails else 0)

"""Storage, migration and error-log end-to-end checks. Run: python3 tests/e2e/storage.py [app_dir]"""
import functools, http.server, json, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright
APP=os.path.abspath(sys.argv[1] if len(sys.argv)>1 else '.'); PORT=8795
passes,fails=[],[]
def check(n,c,x=''):
    (passes if c else fails).append(n); print(('PASS ' if c else 'FAIL ')+n+(' '+str(x) if (x and not c) else ''))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a,**k):pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',PORT),functools.partial(Q,directory=APP)); threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{PORT}/index.html'
SEED="""([n,extra,meta])=>{const t=new Date(Date.now()-4*36e5),f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),o={};
 for(let i=n;i>=1;i--){const d=new Date(t.getFullYear(),t.getMonth(),t.getDate()-i);o[f(d)]={m:6,p:7,c:8,note:'secret note '+i,created:1,updated:1}}
 Object.assign(o,extra||{});localStorage.clear();localStorage.setItem('dayrate:v1',JSON.stringify(o));localStorage.setItem('dayrate:meta',JSON.stringify(Object.assign({onboarded:1},meta||{sound:false})))}"""
IDB="""()=>new Promise(res=>{const r=indexedDB.open('dayrate',1);r.onsuccess=()=>{const db=r.result,s=db.transaction('kv').objectStore('kv'),q=s.getAllKeys(),o={};q.onsuccess=()=>{let n=q.result.length;if(!n){db.close();return res({})}q.result.forEach(k=>{const g=s.get(k);g.onsuccess=()=>{o[k]=g.result;if(--n===0){db.close();res(o)}}})}}})"""
def new(pw,perm=False):
    b=pw.chromium.launch(); c=b.new_context(viewport={'width':390,'height':780},permissions=['clipboard-read','clipboard-write'] if perm else [])
    pg=c.new_page(); errs=[]; msgs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:(msgs.append(d.message),d.dismiss()))
    return b,pg,errs,msgs
def boot(pg,*seedargs):
    pg.goto(URL); pg.evaluate(SEED,list(seedargs)); pg.reload(); pg.wait_for_timeout(700)
def days_shown(pg):
    pg.click('#nd'); pg.wait_for_timeout(250); t=pg.inner_text('#ver'); import re; m=re.search(r'(\d+) days',t); return int(m.group(1)) if m else -1
def rate(pg):
    pg.click('#nt'); pg.wait_for_timeout(150); pg.click('#rateNow')
    for _ in range(3):
        pg.click('#plus'); pg.click('#lock'); pg.wait_for_timeout(120)
    pg.wait_for_timeout(1200)
    for _ in range(8):
        if not pg.is_visible('#cele'):break
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
with sync_playwright() as pw:
    # 1. first run copies old localStorage data into IndexedDB, keeps the original, migrates to schema 2 and keeps a backup
    b,pg,errs,msgs=new(pw); boot(pg,12)
    idb=pg.evaluate(IDB); ls=pg.evaluate("localStorage.getItem('dayrate:v1')")
    check('legacy data copied into IndexedDB',len(idb.get('entries',{}))==12,len(idb.get('entries',{})))
    check('localStorage copy left in place',ls is not None and len(json.loads(ls))==12)
    check('meta stamped with schema 2',idb.get('meta',{}).get('schema')==2)
    check('pre-migration backup stored',len(idb.get('backup-pre-v2',{}).get('entries',{}))==12)
    check('app shows 12 days',days_shown(pg)==12)
    check('first run: no errors',not errs,errs); b.close()
    # 2. new rating lands in both stores
    b,pg,errs,msgs=new(pw); boot(pg,12); rate(pg)
    idb=pg.evaluate(IDB); n_ls=len(json.loads(pg.evaluate("localStorage.getItem('dayrate:v1')")))
    check('rating saved to IndexedDB',len(idb['entries'])==13,len(idb['entries'])); check('rating mirrored to localStorage',n_ls==13,n_ls)
    # 3. localStorage wiped (e.g. cleared by the browser), IndexedDB still has everything
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(700)
    check('data restored from IndexedDB when localStorage is empty',days_shown(pg)==13,days_shown(pg))
    # 4. localStorage newer than IndexedDB (a lost async write) wins
    ent=json.loads(pg.evaluate("localStorage.getItem('dayrate:v1')")); k=sorted(ent)[0]; del ent[k]
    pg.evaluate("([e])=>{localStorage.setItem('dayrate:v1',JSON.stringify(e));localStorage.setItem('dayrate:rev',String(Number(localStorage.getItem('dayrate:rev')||0)+50))}",[ent])
    pg.reload(); pg.wait_for_timeout(700)
    check('newer localStorage wins over stale IndexedDB (deleted day stays deleted)',days_shown(pg)==12,days_shown(pg))
    check('stores in sync after that',len(pg.evaluate(IDB)['entries'])==12)
    check('rating/reload: no errors',not errs,errs); b.close()
    # 5. bad records are quarantined, never deleted
    b,pg,errs,msgs=new(pw); boot(pg,10,{'2026-02-01':{'m':11,'p':5,'c':5,'note':'oops'},'junk':{'m':5,'p':5,'c':5},'2026-02-02':{'m':'8','p':9,'c':10}})
    idb=pg.evaluate(IDB); q=idb['meta'].get('quarantine',{})
    check('invalid records quarantined, not deleted',set(q)=={'2026-02-01','junk'},sorted(q))
    check('string rating repaired and kept',idb['entries'].get('2026-02-02',{}).get('m')==8)
    check('premigrate backup holds the originals',len(json.loads(pg.evaluate("localStorage.getItem('dayrate:premigrate')"))['entries'])==13)
    check('only valid days counted',days_shown(pg)==11,days_shown(pg)); b.close()
    # 6. data from a newer app: warned, read-only, nothing overwritten
    b,pg,errs,msgs=new(pw); boot(pg,9,None,{'schema':99,'sound':False}); before=pg.evaluate("localStorage.getItem('dayrate:v1')")
    check('newer-schema warning shown',any('newer version' in m for m in msgs),msgs)
    try: rate(pg)
    except Exception as e: pass
    check('newer-schema data not overwritten',pg.evaluate("localStorage.getItem('dayrate:v1')")==before); b.close()
    # 7. error log and debug info: captured, no ratings or notes inside
    b,pg,errs,msgs=new(pw,perm=True); boot(pg,5)
    pg.evaluate("setTimeout(()=>{throw new Error('boom-test')},0)"); pg.wait_for_timeout(300)
    pg.click('#nd'); pg.wait_for_timeout(200); pg.click('#xdbg'); pg.wait_for_timeout(300)
    clip=pg.evaluate("navigator.clipboard.readText()")
    check('debug info has the logged error',('boom-test' in clip),clip[:120])
    check('debug info has version and counts',('version: 1.19' in clip and 'days stored: 5' in clip),clip[:160])
    check('debug info never contains notes',('secret note' not in clip))
    pg.click('#xdbgclr'); pg.wait_for_timeout(150); check('error log can be cleared',pg.evaluate("localStorage.getItem('dayrate:errors')")is None); b.close()
srv.shutdown(); print(f'\n{len(passes)} passed, {len(fails)} failed'); sys.exit(1 if fails else 0)

"""Click-everything test: opens every tab, clicks every visible button (twice, with data and without),
walks the rating flow with tags, and reports any page error. Run: python3 tests/e2e/explore.py [app_dir]
Dialogs are dismissed so nothing destructive is confirmed."""
import functools, http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright
APP=os.path.abspath(sys.argv[1] if len(sys.argv)>1 else '.'); PORT=8793
SEED="""(n)=>{const t=new Date(Date.now()-4*36e5);const f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const o={};const notes=['went for a walk','gym session','friends over','tired','slept badly','good day outside'];
 for(let i=n;i>=1;i--){const d=new Date(t.getFullYear(),t.getMonth(),t.getDate()-i);
  o[f(d)]={m:1+(i*7)%10,p:1+(i*3)%10,c:1+(i*5)%10,note:notes[i%6],created:1,updated:1,tags:i%4?['ex','so']:['sl']};}
 localStorage.clear();localStorage.setItem('dayrate:v1',JSON.stringify(o));
 localStorage.setItem('dayrate:meta',JSON.stringify({haptics:true,sound:false,achInit:true,ach:{},onboarded:1}));}"""
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a,**k):pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',PORT),functools.partial(Q,directory=APP)); threading.Thread(target=srv.serve_forever,daemon=True).start()
TABS=['#nh','#ntr','#ni','#na','#nd','#nt']
def run(pw,n,label):
    b=pw.chromium.launch(); pg=b.new_context(viewport={'width':390,'height':780}).new_page(); errs=[]; clicks=0
    pg.on('pageerror',lambda e:errs.append('PAGEERROR '+str(e)[:160])); pg.on('console',lambda m:errs.append('CONSOLE '+m.text[:160]) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.dismiss())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.evaluate(SEED,n); pg.reload(); pg.wait_for_timeout(500)
    def leave_rate():  # a sweep can end on the rate screen, which hides the tab bar
        for _ in range(4):
            if not pg.is_visible('#back'): break
            pg.click('#back'); pg.wait_for_timeout(100)
    def sweep(tab):
        nonlocal clicks
        leave_rate(); pg.click(tab); pg.wait_for_timeout(150)
        count=pg.evaluate("()=>[...document.querySelectorAll('.view.on button, .view.on [data-d], .view.on rect')].filter(e=>e.offsetParent!==null||e.tagName==='rect').length")
        for i in range(min(count,60)):
            try:
                pg.evaluate("i=>{const l=[...document.querySelectorAll('.view.on button, .view.on [data-d], .view.on rect')].filter(e=>e.offsetParent!==null||e.tagName==='rect');const e=l[i];if(e){e.dispatchEvent(new MouseEvent('click',{bubbles:true}))}}",i); clicks+=1
            except Exception as e: errs.append('CLICKFAIL '+str(e)[:100])
            pg.wait_for_timeout(40)
            if pg.is_visible('#cele'): pg.keyboard.press('Escape')
    for rnd in range(2):
        for t in TABS: sweep(t)
    # rating flow with tags if today is unrated
    leave_rate(); pg.click('#nt'); pg.wait_for_timeout(200)
    if pg.is_visible('#rateNow'):
        pg.click('#rateNow')
        for _ in range(3):
            for _ in range(3): pg.click('#plus')
            pg.click('#lock'); pg.wait_for_timeout(100)
        pg.wait_for_timeout(800)
        if pg.is_visible('#cele'):
            for _ in range(8):
                if not pg.is_visible('#cele'):break
                pg.wait_for_timeout(750); pg.click('#celOk'); pg.wait_for_timeout(200)
        for t in TABS: sweep(t)
    pg.wait_for_timeout(300); b.close()
    uniq=sorted(set(errs)); print(f'{label}: {clicks} clicks, {len(uniq)} distinct errors'); [print('   ',e) for e in uniq[:12]]; return uniq
with sync_playwright() as pw:
    bad=[]
    for n,l in [(90,'90 days of data'),(0,'empty app'),(8,'8 days of data')]: bad+=run(pw,n,l)
srv.shutdown(); print('RESULT:', 'CLEAN' if not bad else 'ERRORS'); sys.exit(1 if bad else 0)

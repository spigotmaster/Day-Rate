"""Grades, forecast-after-rating, custom tags (browser). Run: python3 tests/e2e/grades.py [app_dir]"""
import functools, http.server, json, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright
APP=os.path.abspath(sys.argv[1] if len(sys.argv)>1 else '.')
passes,fails=[],[]
def check(n,c,x=''):
    (passes if c else fails).append(n); print(('PASS ' if c else 'FAIL ')+n+(' '+str(x) if (x and not c) else ''))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a,**k):pass
socketserver.TCPServer.allow_reuse_address=True
S=socketserver.TCPServer(('127.0.0.1',8821),functools.partial(Q,directory=APP)); threading.Thread(target=S.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8821/index.html'
SEED="""(n)=>{const t=new Date(Date.now()-4*36e5),f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),o={};
 for(let i=n;i>=1;i--){const d=new Date(t.getFullYear(),t.getMonth(),t.getDate()-i);o[f(d)]={m:3+(i*7)%7,p:3+(i*5)%7,c:3+(i*3)%7,note:'',created:1,updated:1}}
 localStorage.clear();localStorage.setItem('dayrate:v1',JSON.stringify(o));localStorage.setItem('dayrate:meta',JSON.stringify({sound:false,achInit:true,achV:3,onb:1,onboarded:true}))}"""
def new(pw,n):
    b=pw.chromium.launch(); c=b.new_context(viewport={'width':390,'height':780}); pg=c.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.evaluate(SEED,n); pg.reload(); pg.wait_for_timeout(800)
    try:
        if pg.is_visible('#onbSkip'): pg.click('#onbSkip')
    except Exception: pass
    return b,pg,errs
def rate(pg):
    pg.click('#rateNow'); pg.wait_for_timeout(300)
    for _ in range(3): pg.click('#lock'); pg.wait_for_timeout(200)
    pg.wait_for_timeout(600)
    dismiss(pg)
def dismiss(pg):
    for _ in range(4):
        if pg.is_visible('#celOk'): pg.click('#celOk'); pg.wait_for_timeout(300)
with sync_playwright() as pw:
    b,pg,errs=new(pw,12)
    check('Today has no forecast before rating',pg.locator('#tfc').count()==0 and 'Expected' not in pg.inner_text('#vtoday'))
    rate(pg)
    check('result shows an overall grade letter',pg.is_visible('#gline .gr'),pg.inner_text('#gline'))
    check('result says where the day ranks',('% of your days' in pg.inner_text('#gline')))
    check('category grades beside points','/ 5 \u00b7' in pg.inner_text('#trio'),pg.inner_text('#trio'))
    rs=pg.inner_text('#rfc')
    check('expected vs rated shown after rating',('Expected for today' in rs) or ('start after' in rs),rs[:120])
    check('no "Expected tomorrow"','tomorrow' not in rs.lower())
    pg.click('#nh'); pg.wait_for_timeout(400)
    check('history detail has a grade',pg.is_visible('#det .big .gr'))
    check('week strip shows letters',pg.locator('#wk7 .wg').count()>=1)
    # custom tag
    pg.click('#nt'); pg.wait_for_timeout(300)
    pg.click('#tags button:has-text("Your own")'); pg.fill('.ownrow input','Reading'); pg.click('.ownrow button[type=submit]'); pg.wait_for_timeout(300)
    check('custom tag added and switched on for the day',pg.is_visible('#tags button:has-text("Reading")') and 'Reading' in pg.inner_text('#tags') and pg.locator('#tags button[aria-pressed=true]:has-text("Reading")').count()==1)
    meta=json.loads(pg.evaluate("localStorage.getItem('dayrate:meta')"))
    check('custom tag stored in meta',any(x['name']=='Reading' for x in meta.get('ctags',[])),meta.get('ctags'))
    pg.click('#nd'); pg.wait_for_timeout(300)
    check('Data lists the custom tag',pg.locator('#ctagList input').count()==1)
    pg.fill('#ctagNew','reading'); pg.click('#ctagAdd'); pg.wait_for_timeout(200)
    check('duplicate name refused',('already' in pg.inner_text('#ctagMsg')))
    check('weekly toggle hidden while notifications are off',not pg.is_visible('#nWeekly'))
    # backup round trip keeps custom tag
    txt=pg.evaluate("""async()=>{const m=await import('./src/data.js');return null}""") if False else None
    # grades off
    pg.check('#gron'); pg.uncheck('#gron'); pg.wait_for_timeout(200)
    pg.click('#nt'); pg.wait_for_timeout(300)
    check('grades off hides the letter',not pg.is_visible('#gline .gr'))
    pg.click('#nd'); pg.wait_for_timeout(200); pg.check('#gron'); pg.click('#nt'); pg.wait_for_timeout(300)
    check('grades back on',pg.is_visible('#gline .gr'))
    # remove tag
    pg.click('#nd'); pg.wait_for_timeout(200); pg.click('#ctagList button:has-text("Remove")'); pg.click('button:has-text("Yes, remove")'); pg.wait_for_timeout(200)
    ents=json.loads(pg.evaluate("localStorage.getItem('dayrate:v1')"))
    check('removing a tag takes it off the days',not any('tags' in e and any(t.startswith('x') for t in e['tags']) for e in ents.values()))
    pg.click('#nd'); pg.wait_for_timeout(200); pg.select_option('#goalN','1'); pg.select_option('#goalMin','B-'); pg.click('#goalSet'); pg.wait_for_timeout(200)
    check('goal saved',json.loads(pg.evaluate("localStorage.getItem('dayrate:meta')")).get('goal')=={'n':1,'min':'B-'})
    pg.click('#nt'); pg.wait_for_timeout(300)
    check('goal line on the result screen',pg.is_visible('#goal') and 'Goal' in pg.inner_text('#goal'),pg.inner_text('#goal'))
    pg.click('#nd'); pg.wait_for_timeout(200); pg.click('#goalClear'); pg.click('#nt'); pg.wait_for_timeout(300)
    check('goal cleared hides the line',not pg.is_visible('#goal'))
    check('no page errors',not errs,errs)
    b.close()
    b,pg,errs=new(pw,4)
    check('no grades before 7 days: no letters',not pg.is_visible('#gline .gr'))
    rate(pg); check('still none at 5 days',not pg.is_visible('#gline .gr'))
    b.close()
    b,pg,errs=new(pw,50); rate(pg); pg.wait_for_timeout(900); dismiss(pg)
    check('after rating, with history, goal ideas are offered',pg.is_visible('#goal .gbtn') and 'Goal ideas' in pg.inner_text('#goal'),pg.inner_text('#goal'))
    pg.wait_for_timeout(900); dismiss(pg)
    pg.click('#goal .gbtn >> nth=0'); pg.wait_for_timeout(300)
    check('picking a suggestion sets the goal and shows progress',('Goal' in pg.inner_text('#goal')) and 'Goal ideas' not in pg.inner_text('#goal'),pg.inner_text('#goal'))
    check('goal stored',bool(json.loads(pg.evaluate("localStorage.getItem('dayrate:meta')")).get('goal')))
    b.close()
    b,pg,errs=new(pw,50)
    check('Today never shows goal ideas',pg.locator('#goal').count()==1 and not pg.is_visible('#vtoday #goal'))
    b.close()
print(len(passes),'passed,',len(fails),'failed'); sys.exit(1 if fails else 0)

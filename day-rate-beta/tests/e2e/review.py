"""History > Recap and Search end-to-end checks. Run: python3 tests/e2e/review.py [app_dir]"""
import functools, http.server, os, re, socketserver, sys, threading
from playwright.sync_api import sync_playwright
APP=os.path.abspath(sys.argv[1] if len(sys.argv)>1 else '.'); PORT=8797
passes,fails=[],[]
def check(n,c,x=''):
    (passes if c else fails).append(n); print(('PASS ' if c else 'FAIL ')+n+(' '+str(x) if (x and not c) else ''))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a,**k):pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',PORT),functools.partial(Q,directory=APP)); threading.Thread(target=srv.serve_forever,daemon=True).start()
SEED="""(n)=>{const t=new Date(Date.now()-4*36e5),f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),o={};
 const notes=['Long walk by the river','Deadline day, tired','Friends over for dinner','Gym then early night','Quiet day at home','Walk before work'];
 for(let i=n;i>=1;i--){const d=new Date(t.getFullYear(),t.getMonth(),t.getDate()-i);
  o[f(d)]={m:1+(i*7)%10,p:1+(i*3)%10,c:1+(i*5)%10,note:notes[i%6],created:1,updated:1,tags:i%3===0?['ex','ou']:i%3===1?['so']:[]}}
 localStorage.clear();if(n)localStorage.setItem('dayrate:v1',JSON.stringify(o));localStorage.setItem('dayrate:meta',JSON.stringify({sound:false,achInit:true,ach:{},onboarded:1}))}"""
def new(pw,n):
    b=pw.chromium.launch(); c=b.new_context(viewport={'width':390,'height':780},accept_downloads=True); pg=c.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.evaluate(SEED,n); pg.reload(); pg.wait_for_timeout(700)
    pg.click('#nh'); pg.wait_for_timeout(250); return b,pg,errs
def mode(pg,m): pg.click(f'#hmode [data-m="{m}"]'); pg.wait_for_timeout(250)
def vis(pg,s): return pg.is_visible(s)
with sync_playwright() as pw:
    b,pg,errs=new(pw,120)
    # mode switching shows and hides the right panels
    check('weeks mode: week strip + grid visible, recap/search hidden',vis(pg,'#wk7') and vis(pg,'#gw') and not vis(pg,'#rcw') and not vis(pg,'#srw'))
    mode(pg,'rc'); check('recap mode: panel visible, day view hidden',vis(pg,'#rcw') and not vis(pg,'#gw') and not vis(pg,'#det') and not vis(pg,'#wk7'))
    check('recap mode marks its button pressed',pg.get_attribute('#hmode [data-m="rc"]','aria-pressed')=='true')
    t=pg.inner_text('#rcw h2'); check('recap shows a month title',len(t)>5,t)
    check('recap card shows three averages',pg.locator('#rcw .tri b').count()==3)
    check('recap names best day',('Best day' in pg.inner_text('#rcw')))
    check('next month disabled on the current month',pg.is_disabled('#rcw .rcnav button:last-child'))
    pg.click('#rcw .rcnav button:first-child'); pg.wait_for_timeout(250)
    check('previous month changes the title',pg.inner_text('#rcw h2')!=t)
    check('a finished month does not say "so far"',('so far' not in pg.inner_text('#rcw .wkcard h3')))
    pg.click('#rcw .rcnav button:last-child'); pg.wait_for_timeout(200); check('next brings the current month back',pg.inner_text('#rcw h2')==t)
    check('current month says "so far"',('so far' in pg.inner_text('#rcw .wkcard h3')))
    pg.click('#rcw .seg button:nth-child(2)'); pg.wait_for_timeout(300)
    check('year recap shows month bars',pg.locator('#rcw svg.mbars rect').count()==12)
    check('month bars have a text alternative',len(pg.get_attribute('#rcw svg.mbars','aria-label') or '')>20)
    with pg.expect_download() as dl: pg.click('#rcw .wkcard .btn')
    path=dl.value.path(); data=open(path,'rb').read()
    check('share image downloads as a PNG',data[:8]==b'\x89PNG\r\n\x1a\n' and len(data)>20000,len(data))
    open('/tmp/recap_share.png','wb').write(data)
    pg.screenshot(path='/tmp/recap_screen.png')
    # search
    mode(pg,'sr'); check('search mode: panel visible, others hidden',vis(pg,'#srw') and not vis(pg,'#rcw') and not vis(pg,'#gw'))
    total=pg.locator('#srres .srrow').count(); check('empty query lists days (first page of 30)',total==30,total)
    pg.fill('#srq','walk'); pg.wait_for_timeout(400)
    n=pg.locator('#srres .srrow').count(); cnt=pg.inner_text('#srcount')
    found=int(re.search(r'(\d+) day',cnt).group(1)); check('text search narrows results (found fewer than all 120)',0<found<120 and n==min(30,found),(n,cnt)); check('count line reads naturally',('found' in cnt),cnt)
    check('matches are highlighted',pg.locator('#srres mark').count()>0)
    check('every result really contains the word',all('walk' in x.lower() for x in pg.locator('#srres .srrow').all_inner_texts()))
    pg.fill('#srq','walk river zzz'); pg.wait_for_timeout(400); check('all words must match',pg.locator('#srres .srrow').count()==0 and 'No days match' in pg.inner_text('#srcount'))
    pg.fill('#srq',''); pg.wait_for_timeout(300)
    pg.click('#srw .tags button:nth-child(2)'); pg.wait_for_timeout(250)  # Exercise
    check('tag chip filters and shows pressed state',pg.get_attribute('#srw .tags button:nth-child(2)','aria-pressed')=='true' and 0<int(re.search(r'(\d+) day',pg.inner_text('#srcount')).group(1))<120)
    check('tag results all show that tag',all('Exercise' in x for x in pg.locator('#srres .srrow').all_inner_texts()))
    pg.click('#srw .tags button:nth-child(2)'); pg.wait_for_timeout(200)
    pg.select_option('#srw .fsel:nth-child(1) select','high'); pg.select_option('#srw .fsel:nth-child(2) select','m'); pg.wait_for_timeout(300)
    rows=pg.locator('#srres .srrow').all_inner_texts()
    import re
    check('rating filter: every result has mood 8 or more',len(rows)>0 and all(int(re.search(r'Mood (\d+)',x).group(1))>=8 for x in rows),rows[:2])
    pg.select_option('#srw .fsel:nth-child(1) select','any'); pg.wait_for_timeout(200)
    pg.select_option('#srw .fsel:nth-child(3) select','30'); pg.wait_for_timeout(300)
    check('date filter limits to last 30 days',pg.locator('#srres .srrow').count()<=30)
    # tapping a result opens that day in Weeks mode
    first=pg.locator('#srres .srrow').first; lab=first.get_attribute('aria-label'); first.click(); pg.wait_for_timeout(500)
    check('tapping a result returns to Weeks mode with that day open',vis(pg,'#det') and vis(pg,'#gw') and not vis(pg,'#srw'))
    day=lab.split(',')[0] if lab else ''
    check('the open day matches the tapped result',(day.split(' ')[0][:3] in pg.inner_text('#det .rdate')),(lab,pg.inner_text('#det .rdate')))
    pg.screenshot(path='/tmp/search_screen.png')
    check('no console errors with data',not errs,errs); b.close()
    # empty app
    b,pg,errs=new(pw,0); mode(pg,'rc'); check('recap with no data explains itself',('Rate at least' in pg.inner_text('#rcw')))
    check('recap with no data: previous disabled',pg.is_disabled('#rcw .rcnav button:first-child'))
    mode(pg,'sr'); check('search with no data explains itself',('No days yet' in pg.inner_text('#srcount')))
    check('empty app: no console errors',not errs,errs); b.close()
    # dark mode renders
    b=pw.chromium.launch(); c=b.new_context(viewport={'width':390,'height':780},color_scheme='dark'); pg=c.new_page(); pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.evaluate(SEED,60); pg.reload(); pg.wait_for_timeout(600)
    pg.click('#nh'); mode(pg,'sr'); pg.fill('#srq','walk'); pg.wait_for_timeout(400); pg.screenshot(path='/tmp/search_dark.png'); b.close()
srv.shutdown(); print(f'\n{len(passes)} passed, {len(fails)} failed'); sys.exit(1 if fails else 0)

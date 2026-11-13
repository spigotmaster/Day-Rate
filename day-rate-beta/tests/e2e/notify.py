"""Reminder notifications end-to-end (client side). Run: python3 tests/e2e/notify.py [app_dir]
Uses HTTPS with a throwaway certificate so the real service worker runs. Chromium has no real push service offline,
so PushManager is faked and the reminder server is a recording stub. The server itself is tested in tests/server.test.mjs."""
import base64, functools, http.server, json, os, re, shutil, socketserver, ssl, subprocess, sys, tempfile, threading
from playwright.sync_api import sync_playwright
APP=os.path.abspath(sys.argv[1] if len(sys.argv)>1 else '.')
passes,fails=[],[]
def check(n,c,x=''):
    (passes if c else fails).append(n); print(('PASS ' if c else 'FAIL ')+n+(' '+str(x) if (x and not c) else ''))
tmp=tempfile.mkdtemp(); subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',tmp+'/k.pem','-out',tmp+'/c.pem','-days','2','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],check=True,capture_output=True)
KEY=base64.urlsafe_b64encode(bytes([4])+os.urandom(64)).decode().rstrip('=')
def copy_app(cfg):
    d=tempfile.mkdtemp(); dst=d+'/app'; shutil.copytree(APP,dst,ignore=shutil.ignore_patterns('node_modules','tests','server','dist','.git'))
    if cfg: open(dst+'/src/config.js','w').write(f"export const PUSH={{url:'https://reminders.test',key:'{KEY}'}};\n")
    return dst
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a,**k):pass
    def end_headers(self): self.send_header('Cache-Control','no-store'); super().end_headers()
def serve(dirpath,port):
    socketserver.TCPServer.allow_reuse_address=True
    s=socketserver.TCPServer(('127.0.0.1',port),functools.partial(Q,directory=dirpath))
    ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(tmp+'/c.pem',tmp+'/k.pem'); s.socket=ctx.wrap_socket(s.socket,server_side=True)
    threading.Thread(target=s.serve_forever,daemon=True).start(); return s
S_OFF=serve(copy_app(False),8811); S_ON=serve(copy_app(True),8812)
OFF='https://127.0.0.1:8811/index.html'; ON='https://127.0.0.1:8812/index.html'
MOCK="""(()=>{const fake={endpoint:'https://fcm.googleapis.com/fcm/send/test-endpoint-1',unsubscribe:async()=>{window.__unsub=(window.__unsub||0)+1;sessionStorage.removeItem('__sub');window.__sub=null;return true}};
 window.__sub=sessionStorage.getItem('__sub')?fake:null;const P=PushManager.prototype;
 P.subscribe=async function(o){window.__subOpts={uvo:o.userVisibleOnly,keyLen:o.applicationServerKey.length};sessionStorage.setItem('__sub','1');window.__sub=fake;return fake};
 P.getSubscription=async function(){return window.__sub};
 ServiceWorkerRegistration.prototype.showNotification=async function(t,o){(window.__notes=window.__notes||[]).push({t:t,tag:o.tag,url:o.data&&o.data.url,body:o.body})}})()"""
SEED="""(n)=>{const t=new Date(Date.now()-4*36e5),f=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),o={};
 for(let i=n;i>=1;i--){const d=new Date(t.getFullYear(),t.getMonth(),t.getDate()-i);o[f(d)]={m:6,p:7,c:8,note:'',created:1,updated:1}}
 localStorage.clear();if(n)localStorage.setItem('dayrate:v1',JSON.stringify(o));localStorage.setItem('dayrate:meta',JSON.stringify({sound:false,achInit:true,ach:{},onboarded:1}));sessionStorage.removeItem('__sub')}"""
TODAY="()=>{const t=new Date(Date.now()-4*36e5);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')}"
def new(pw,url,grant=True,server='ok',**ctx):
    b=pw.chromium.launch(args=['--ignore-certificate-errors'])
    c=b.new_context(viewport={'width':390,'height':780},ignore_https_errors=True,permissions=['notifications'] if grant else [],**ctx)
    c.add_init_script(MOCK); pg=c.new_page(); errs=[]; calls=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'reminders.test' not in m.text and '500' not in m.text else None)
    cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'POST, OPTIONS'}
    def handler(route):
        r=route.request
        if r.method=='OPTIONS': return route.fulfill(status=204,headers=cors)
        calls.append({'path':r.url.split('reminders.test')[1],'body':json.loads(r.post_data or '{}')})
        if server=='down': return route.fulfill(status=500,headers=cors,body='{}')
        route.fulfill(status=200,headers={**cors,'content-type':'application/json'},body='{"ok":true}')
    pg.route('https://reminders.test/**',handler)
    pg.goto(url); pg.evaluate(SEED,6); pg.reload(); pg.wait_for_timeout(1200); return b,pg,errs,calls
def card(pg): pg.click('#nd'); pg.wait_for_timeout(300)
def status(pg): return pg.inner_text('#nStatus')
def meta(pg): return json.loads(pg.evaluate("localStorage.getItem('dayrate:meta')") or '{}')
with sync_playwright() as pw:
    # 1. not configured (the default for a fresh copy)
    b,pg,errs,calls=new(pw,OFF); card(pg)
    check('unconfigured: explains notifications need a server',('not set up' in status(pg)) and ('server' in status(pg)))
    check('unconfigured: no on/off button',not pg.is_visible('#nOn'))
    pg.click('.calrem summary'); check('calendar reminder stays available',pg.is_visible('#rics'))
    check('unconfigured: nothing sent anywhere',len(calls)==0); check('unconfigured: no errors',not errs,errs); b.close()
    # 2. configured, permission granted
    b,pg,errs,calls=new(pw,ON); card(pg)
    check('configured: starts Off with a Turn on button',status(pg)=='Off.' and pg.inner_text('#nOn')=='Turn on notifications' and not pg.is_visible('#nTest'))
    check('privacy note says what the server learns',('time zone' in pg.inner_text('#nFine')) and ('never' in pg.inner_text('#nFine').lower()))
    pg.click('#nOn'); pg.wait_for_timeout(900)
    sub=[c for c in calls if c['path']=='/subscribe']; tz=pg.evaluate("Intl.DateTimeFormat().resolvedOptions().timeZone")
    check('turning on registers the push address, time and time zone',len(sub)==1 and sub[0]['body']=={'endpoint':'https://fcm.googleapis.com/fcm/send/test-endpoint-1','time':'20:00','tz':tz},sub)
    check('subscription is user-visible with a 65 byte key',pg.evaluate("window.__subOpts")=={'uvo':True,'keyLen':65})
    check('status says On with the time',status(pg).startswith('On.') and '20:00' in status(pg),status(pg)); check('button flips to Turn off',pg.inner_text('#nOn')=='Turn off notifications')
    check('state saved on the device',meta(pg).get('notify',{}).get('on') is True)
    check('server is never sent ratings, notes or tags',all(set(c['body'])<= {'endpoint','time','tz','date'} for c in calls))
    # 3. change time
    n0=len(calls); pg.fill('#rtime','19:30'); pg.dispatch_event('#rtime','change'); pg.wait_for_timeout(700)
    check('changing the time updates the server',[c for c in calls[n0:] if c['path']=='/subscribe' and c['body']['time']=='19:30']!=[]); check('new time shown',('19:30' in status(pg)) or ('updated' in status(pg)),status(pg))
    # 4. relaunch refreshes the server copy
    n0=len(calls); pg.reload(); pg.wait_for_timeout(1500); card(pg)
    check('relaunch keeps reminders on',status(pg).startswith('On.') and '19:30' in status(pg),status(pg))
    check('relaunch re-registers (keeps time zone fresh)',any(c['path']=='/subscribe' and c['body']['tz']==tz and c['body']['time']=='19:30' for c in calls[n0:]))
    # 5. test notification really appears
    pg.click('#nTest'); pg.wait_for_timeout(900)
    shown=pg.evaluate("window.__notes")
    check('Send a test notification asks the browser to show it (headless Chromium cannot display real ones)',shown is not None and len(shown)==1 and shown[0]['tag']=='dayrate-test' and shown[0]['url']=='./#rate' and shown[0]['t']=='Day Rate',shown)
    check('test notification confirms in the card',('Test sent' in status(pg)),status(pg))
    # 6. rating today tells the server to skip today
    td=pg.evaluate(TODAY); n0=len(calls); pg.click('#nt'); pg.wait_for_timeout(200); pg.click('#rateNow')
    for _ in range(3): pg.click('#plus'); pg.click('#lock'); pg.wait_for_timeout(130)
    pg.wait_for_timeout(1200)
    skip=[c for c in calls[n0:] if c['path']=='/skip']
    check('rating today tells the server to skip today',len(skip)==1 and skip[0]['body']['date']==td and skip[0]['body']['endpoint'].endswith('test-endpoint-1'),skip)
    check('skip carries no ratings',set(skip[0]['body'])=={'endpoint','date'} if skip else False)
    # 7. turn off
    for _ in range(6):
        if not pg.is_visible('#cele'):break
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    card(pg); n0=len(calls); pg.click('#nOn'); pg.wait_for_timeout(800)
    check('turning off tells the server and unsubscribes',any(c['path']=='/unsubscribe' for c in calls[n0:]) and pg.evaluate("window.__unsub")==1)
    check('off state shown and saved',status(pg)=='Off.' and pg.inner_text('#nOn')=='Turn on notifications' and meta(pg).get('notify',{}).get('on') is False)
    check('configured flow: no console errors',not errs,errs); b.close()
    # 8. server unreachable
    b,pg,errs,calls=new(pw,ON,server='down'); card(pg); pg.click('#nOn'); pg.wait_for_timeout(1200)
    check('server down: friendly error, reminders not marked on',('Could not turn reminders on' in status(pg)) and not meta(pg).get('notify',{}).get('on')); b.close()
    # 9. permission refused
    b,pg,errs,calls=new(pw,ON,grant=False); card(pg); pg.click('#nOn'); pg.wait_for_timeout(1000)
    check('permission refused: explains how to allow, nothing sent',(('blocked' in status(pg)) or ('not allowed' in status(pg))) and not calls,status(pg)); b.close()
    # 10. subscription lost (permission revoked or browser dropped it)
    b,pg,errs,calls=new(pw,ON); card(pg); pg.click('#nOn'); pg.wait_for_timeout(800)
    pg.evaluate("sessionStorage.removeItem('__sub')"); pg.reload(); pg.wait_for_timeout(1500); card(pg)
    check('lost subscription: asks to turn on again',('no longer set up' in status(pg)) and pg.inner_text('#nOn')=='Turn on notifications',status(pg)); b.close()
    # 11. iPhone in Safari (not installed)
    b,pg,errs,calls=new(pw,ON,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'); card(pg)
    check('iPhone browser tab: says to add to Home Screen, no button',('Home Screen' in status(pg)) and not pg.is_visible('#nOn')); b.close()
    # 12. sample mode
    b,pg,errs,calls=new(pw,ON); pg.click('#nd'); pg.click('#onbAgain'); [pg.click('#onbNext') for _ in range(3)]; pg.click('#onbDemo'); pg.wait_for_timeout(500); card(pg)
    check('sample mode: reminder controls disabled',pg.is_disabled('#nOn') and 'Sample data' in status(pg)); b.close()
    # 13. tapping a notification opens straight into rating
    b,pg,errs,calls=new(pw,ON); base=ON
    pg.goto(base+'#rate'); pg.wait_for_timeout(1200)
    check('#rate opens the rating screen when today is not rated',pg.is_visible('#vrate')); check('#rate link is cleaned from the address',('#rate' not in pg.url))
    pg.evaluate("localStorage.setItem('dayrate:v1',JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('dayrate:v1')),{[(" +TODAY+ ")()]:{m:5,p:5,c:5,note:'',created:1,updated:1}})))")
    pg.evaluate("indexedDB.deleteDatabase('dayrate')"); pg.goto(base); pg.wait_for_timeout(600); pg.goto(base+'#rate'); pg.wait_for_timeout(1200)
    check('#rate does nothing when today is already rated',not pg.is_visible('#vrate'))
    pg.click('#nh'); pg.wait_for_timeout(200)
    pg.evaluate("navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:'rate'}))"); pg.wait_for_timeout(300)
    check('a message from the service worker is also handled safely',not errs,errs); b.close()
for s in (S_OFF,S_ON): s.shutdown()
print(f'\n{len(passes)} passed, {len(fails)} failed'); sys.exit(1 if fails else 0)

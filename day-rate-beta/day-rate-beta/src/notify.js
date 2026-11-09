import {$,today} from './util.js';
import {META,errorLog,saveMeta,status} from './state.js';
import {PUSH} from './config.js';

/* Real notifications: the browser's push service wakes the service worker at the chosen time (see sw.js). The reminder server
   (server/) is told only: the push address, the reminder time, the time zone, and which days were already rated. */
const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
export const configured=()=>!!(PUSH.url&&PUSH.key);
export function support(){
 if(!configured())return {ok:false,why:'unconfigured'};
 if(isiOS&&!standalone())return {ok:false,why:'ios-install'};
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return {ok:false,why:'unsupported'};
 return {ok:true,why:''};
}
const tz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){return 'UTC'}};
const timeVal=()=>($('#rtime')&&$('#rtime').value)||META.remind||'20:00';
function keyBytes(){
 const s=PUSH.key.replace(/-/g,'+').replace(/_/g,'/'),b=atob(s+'='.repeat((4-s.length%4)%4)),a=new Uint8Array(b.length);
 for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;
}
async function post(path,body){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),9000);
 try{
  const r=await fetch(PUSH.url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:c.signal});
  if(!r.ok)throw new Error('server '+r.status);
 }finally{clearTimeout(t)}
}
async function registration(){
 return Promise.race([navigator.serviceWorker.ready,new Promise((_,no)=>setTimeout(()=>no(new Error('service worker not ready')),6000))]);
}
/* Notification.permission is the simple answer, but the Permissions API is more reliable where both exist, so ask it and remember the result. */
let perm='Notification' in window?Notification.permission:'default';
async function syncPerm(){
 try{const q=await navigator.permissions.query({name:'notifications'});perm={granted:'granted',denied:'denied',prompt:'default'}[q.state]||perm;q.onchange=()=>{syncPerm().then(renderNotify)}}catch(e){}
 return perm;
}
let msg='',msgT=0;
function say(t,ms){msg=t;clearTimeout(msgT);if(ms)msgT=setTimeout(()=>{msg='';renderNotify()},ms);renderNotify()}

export async function enable(){
 if(status.demo)return;
 const sp=support();if(!sp.ok)return renderNotify();
 try{
  const res=await Notification.requestPermission();            // first await, so it still counts as the tap
  await syncPerm();
  if(res!=='granted'&&perm!=='granted')return say(res==='denied'||perm==='denied'?'denied':'Notifications were not allowed, so nothing was turned on.',6000);
  const reg=await registration();
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes()});
  await post('/subscribe',{endpoint:sub.endpoint,time:timeVal(),tz:tz()});
  META.notify={on:true,since:Date.now()};saveMeta();say('',0);
 }catch(e){errorLog.add('notify',e,'enable');say('Could not turn reminders on. Check your connection and try again.',8000)}
}
export async function disable(){
 try{
  const reg=await registration(),sub=await reg.pushManager.getSubscription();
  if(sub){try{await post('/unsubscribe',{endpoint:sub.endpoint})}catch(e){errorLog.add('notify',e,'unsubscribe')}await sub.unsubscribe()}
 }catch(e){errorLog.add('notify',e,'disable')}
 META.notify={on:false};saveMeta();say('',0);
}
export async function timeChanged(){
 if(!(META.notify&&META.notify.on)||status.demo)return;
 try{
  const sub=await (await registration()).pushManager.getSubscription();
  if(!sub)return renderNotify();
  await post('/subscribe',{endpoint:sub.endpoint,time:timeVal(),tz:tz()});say('Reminder time updated.',3000);
 }catch(e){errorLog.add('notify',e,'time');say('Could not update the reminder time. It will sync next time the app opens.',6000)}
}
/* Tell the server today is already rated so no reminder goes out. Fire and forget; the reminder just arrives if this fails. */
export async function skipToday(date){
 if(!(META.notify&&META.notify.on)||status.demo||!configured())return;
 try{
  const sub=await (await registration()).pushManager.getSubscription();
  if(sub)await post('/skip',{endpoint:sub.endpoint,date});
 }catch(e){errorLog.add('notify',e,'skip')}
}
/* On every launch: keep the server's copy fresh (time zone changes with travel) and notice if this phone lost its permission. */
export async function refresh(){
 if(!(META.notify&&META.notify.on)||status.demo||!support().ok)return;
 try{
  const sub=await (await registration()).pushManager.getSubscription();
  await syncPerm();
  if(!sub||perm!=='granted'){META.notify={on:true,lost:true};saveMeta();return renderNotify()}
  if(META.notify.lost){META.notify={on:true,since:META.notify.since};saveMeta()}
  await post('/subscribe',{endpoint:sub.endpoint,time:META.remind||'20:00',tz:tz()});
 }catch(e){errorLog.add('notify',e,'refresh')}
}
export async function testNow(){
 if(status.demo)return;
 try{
  await syncPerm();
  if(perm!=='granted'&&(await Notification.requestPermission())!=='granted'&&(await syncPerm())!=='granted')return say('denied');
  const reg=await registration();
  await reg.showNotification('Day Rate',{body:'This is what your reminder looks like. How was today?',tag:'dayrate-test',icon:'icon-192.png',badge:'icon-192.png',data:{url:'./#rate'}});
  say('Test sent. If you did not see it, check your phone\u2019s notification settings for Day Rate.',7000);
 }catch(e){errorLog.add('notify',e,'test');say('Could not show a test notification.',6000)}
}

const FINE_ON='The reminder server only learns your reminder time, your time zone and which days you have rated. It never receives ratings or notes.';
const FINE_OFF='Turning this on sends your reminder time, time zone and which days you have rated to the small reminder server. Never your ratings or notes.';
export function renderNotify(){
 const st=$('#nStatus');if(!st)return;
 const sp=support(),on=!!(META.notify&&META.notify.on),btn=$('#nOn'),test=$('#nTest'),fine=$('#nFine'),dm=status.demo;
 let text='',showBtn=sp.ok;
 if(sp.why==='unconfigured')text='Notifications are not set up for this copy of Day Rate. They need a small free reminder server (see server/README.md). The calendar reminder below works on any phone.';
 else if(sp.why==='ios-install')text='On iPhone, notifications work only from the Home Screen app (iOS 16.4 or later). Add Day Rate to your Home Screen, open it from there, then turn this on.';
 else if(sp.why==='unsupported')text='This browser cannot show notifications from a web app. Use the calendar reminder below.';
 else if(msg==='denied'||(perm==='denied'&&!on))text='Notifications are blocked for Day Rate. Allow them in your phone\u2019s settings for this app (or this site), then try again.';
 else if(on&&META.notify.lost)text='Reminders were on, but this phone is no longer set up for them. Turn them on again.';
 else if(on)text='On. You will get a reminder at '+timeVal()+' each day, and none on days you have already rated.';
 else text='Off.';
 if(msg&&msg!=='denied')text=msg;
 st.textContent=dm?'Sample data is showing, so reminders are switched off.':text.trim();
 const lost=on&&META.notify.lost;
 btn.hidden=!showBtn;btn.textContent=on&&!lost?'Turn off notifications':'Turn on notifications';btn.disabled=dm;
 test.hidden=!(sp.ok&&on&&!lost);test.disabled=dm;
 fine.textContent=sp.ok?(on&&!lost?FINE_ON:FINE_OFF):'';
}
$('#nOn').onclick=()=>{const on=!!(META.notify&&META.notify.on&&!META.notify.lost);return on?disable():enable()};
$('#nTest').onclick=testNow;
syncPerm().then(renderNotify);

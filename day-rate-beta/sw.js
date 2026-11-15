importScripts('grades.js');
const CACHE='dayrate-v35';
const FILES=['./','index.html','styles.css','grades.js','insights.js','achievements.js','src/grade-ui.js','src/tags.js','src/util.js','src/state.js','src/nav.js','src/rate.js','src/result.js','src/history.js','src/trends.js','src/insights-ui.js','src/forecast.js','src/forecast-ui.js','src/celebrate.js','src/ach-ui.js','src/data.js','src/app.js','src/config.js','src/notify.js','src/demo.js','src/onboarding.js','src/review.js','src/review-ui.js','src/experiments.js','src/calendar.js','src/calendar-ui.js','src/lock.js','src/lock-ui.js','src/storage.js','src/migrate.js','src/errorlog.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>c.add(new Request(f,{cache:'reload'}))))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))))});
self.addEventListener('message',e=>{if(e.data==='skip')self.skipWaiting()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});
/* Push: usually the daily "how was today?" nudge. On a Sunday, if the person turned on the weekly grade and today is already rated,
   the phone builds the message itself from the ratings stored here (the server never sees them). */
const ICON={icon:'icon-192.png',badge:'icon-192.png'};
const appDay=()=>{const d=new Date(Date.now()-4*36e5),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())};
function readStore(){
 return new Promise((ok,no)=>{
  try{
   const r=indexedDB.open('dayrate',1);
   r.onerror=()=>no(r.error);r.onsuccess=()=>{
    try{
     const db=r.result,s=db.transaction('kv','readonly').objectStore('kv'),out={};
     const a=s.get('entries');a.onsuccess=()=>{out.entries=a.result||{};const b=s.get('meta');b.onsuccess=()=>{out.meta=b.result||{};db.close();ok(out)};b.onerror=()=>no(b.error)};
     a.onerror=()=>no(a.error);
    }catch(e){no(e)}
   };
  }catch(e){no(e)}
 });
}
async function weeklyNote(){
 const day=appDay();
 if(new Date(day+'T00:00:00Z').getUTCDay()!==0)return null;
 const {entries,meta}=await readStore();
 if(!entries[day])return null;                                   // not rated: the normal reminder is right
 if(!(meta.notify&&meta.notify.weekly)||meta.grades===false)return {body:'Another week logged. Open Day Rate to see it.',url:'./#week'};
 const w=self.DayRateGrades&&self.DayRateGrades.weekSummary(entries,day);
 if(!w)return {body:'Another week logged. Open Day Rate to see it.',url:'./#week'};
 const ch=!w.prev?'':Math.abs(w.gpa-w.prev.gpa)<.15?', steady':(w.gpa>w.prev.gpa?', up from ':', down from ')+w.prev.letter;
 return {body:'Your week: '+w.letter+ch+'. '+w.n+' of 7 days rated.',url:'./#week'};
}
self.addEventListener('push',e=>{
 e.waitUntil((async()=>{
  let note=null;
  try{note=await weeklyNote()}catch(x){note=null}
  if(note)return self.registration.showNotification('Day Rate',{body:note.body,tag:'dayrate-weekly',...ICON,data:{url:note.url}});
  return self.registration.showNotification('Day Rate',{body:'How was today? Rating takes about 20 seconds.',tag:'dayrate-daily',...ICON,data:{url:'./#rate'}});
 })());
});
self.addEventListener('notificationclick',e=>{const wk=!!(e.notification.data&&e.notification.data.url==='./#week'),msg=wk?'week':'rate';e.notification.close();e.waitUntil((async()=>{const all=await clients.matchAll({type:'window',includeUncontrolled:true});for(const c of all){if('focus' in c){await c.focus();try{c.postMessage(msg)}catch(x){}return}}return clients.openWindow(new URL(wk?'./#week':'./#rate',self.registration.scope).href)})())});

const CACHE='dayrate-v26';
const FILES=['./','index.html','styles.css','insights.js','achievements.js','src/util.js','src/state.js','src/nav.js','src/rate.js','src/result.js','src/history.js','src/trends.js','src/insights-ui.js','src/celebrate.js','src/ach-ui.js','src/data.js','src/app.js','src/review.js','src/review-ui.js','src/storage.js','src/migrate.js','src/errorlog.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>c.add(new Request(f,{cache:'reload'}))))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))))});
self.addEventListener('message',e=>{if(e.data==='skip')self.skipWaiting()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});

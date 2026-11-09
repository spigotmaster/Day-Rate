import {$,today} from './util.js';
import {E,curView,errorLog,hooks,initStore,requestPersistence,status} from './state.js';
import {show} from './nav.js';
import {home,setSel} from './history.js';
import {renderInsights} from './insights-ui.js';
import './rate.js';
import './result.js';
import './trends.js';
import './celebrate.js';
import './ach-ui.js';
import './data.js';
import './review-ui.js';
import {maybeOnboard} from './onboarding.js';
import {refresh as refreshNotify} from './notify.js';
import {startRate} from './rate.js';

hooks.renderInsights=renderInsights;
export let tipT=0;
export function tip(t){const el=$('#tabtip');el.textContent=t;el.classList.add('on');clearTimeout(tipT);tipT=setTimeout(()=>el.classList.remove('on'),2400)}
$('#nt').onclick=()=>{tip('Today');home()};
$('#nh').onclick=()=>{tip('History');setSel(null);show('hist')};
$('#ntr').onclick=()=>{tip('Trends');show('tr')};
$('#ni').onclick=()=>{tip('Insights');show('ins')};
$('#na').onclick=()=>{tip('Achievements');show('ach')};
$('#nd').onclick=()=>{tip('Data');show('data')};

/* offline + updates */
export let waiting=null,asked=false;
export function updBanner(){$('#upd').hidden=!(waiting&&curView!=='rate')}
$('#updbtn').onclick=()=>{if(waiting){asked=true;waiting.postMessage('skip')}};
if('serviceWorker' in navigator&&location.protocol==='https:'){
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(asked)location.reload()});
 navigator.serviceWorker.register('sw.js').then(r=>{
  const chk=()=>{if(r.waiting&&navigator.serviceWorker.controller){waiting=r.waiting;updBanner()}};
  chk();
  r.addEventListener('updatefound',()=>{const w=r.installing;w&&w.addEventListener('statechange',()=>{if(w.state==='installed')chk()})});
  r.update().catch(()=>{});
 }).catch(()=>{});
}
/* A tapped reminder opens the app at #rate (or messages an open window): go straight to rating, but never over the intro or sample data. */
function rateLink(){
 if(location.hash!=='#rate')return;
 try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
 openRate();
}
function openRate(){if(status.demo||!status.ready||!$('#onb').hidden||E[today()])return;startRate(today())}
addEventListener('hashchange',rateLink);
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data==='rate')openRate()});
errorLog.install(window);
(async()=>{
 try{await initStore();try{requestPersistence()}catch(e){}if(status.readOnly)alert('This data was saved by a newer version of Day Rate. Update the app. Editing is switched off so nothing is lost.');home();maybeOnboard();rateLink();refreshNotify()}
 catch(e){errorLog.add('boot',e);alert('Day Rate could not load your data, so nothing was changed. Close and reopen the app. If this repeats, use Data > Copy debug info.')}
})();

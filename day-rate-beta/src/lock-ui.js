import {$} from './util.js';
import {META,saveMeta,status} from './state.js';
import {checkPin,makeLock,recordFail,recordOk,remaining,shouldLock,validLock,validPin} from './lock.js';

/* Privacy lock UI. The lock is a gate, not encryption (see lock.js). cfg is the lock for this session; sample mode never changes it. */
let cfg=null,locked=false,hiddenAt=0,timer=0,asking=false;
const KEY='dayrate:active';
const stamp=()=>{try{localStorage.setItem(KEY,String(Date.now()))}catch(e){}};
const lastActive=()=>{try{return Number(localStorage.getItem(KEY))}catch(e){return NaN}};
const persist=()=>{if(status.demo)return;if(cfg)META.lock=cfg;else delete META.lock;saveMeta()};
const mk=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};

function drawLock(){
 const el=$('#pgate'),pin=$('#lockPin'),go=$('#lockGo'),msg=$('#lockMsg'),forgot=$('#lockForgot'),ask=$('#lockAsk'),r=remaining(cfg,Date.now());
 go.disabled=pin.disabled=r>0;forgot.hidden=status.demo||asking;ask.hidden=!asking;$('#lockForm').hidden=asking;
 if(r>0)msg.textContent='Too many tries. Please wait '+Math.ceil(r/1000)+' seconds.';
 else if(msg.dataset.keep!=='1')msg.textContent='';
 clearInterval(timer);if(r>0)timer=setInterval(()=>{msg.dataset.keep='';drawLock();if(!remaining(cfg,Date.now())){clearInterval(timer);pin.focus()}},1000);
 return el;
}
function showLock(){
 locked=true;asking=false;const el=$('#pgate');el.hidden=false;el.classList.remove('cover');$('#app').inert=true;
 $('#lockPin').value='';$('#lockMsg').dataset.keep='';drawLock();try{$('#lockPin').focus()}catch(e){}
}
function showCover(){const el=$('#pgate');el.hidden=false;el.classList.add('cover');$('#app').inert=true}
function hideAll(){locked=false;asking=false;clearInterval(timer);const el=$('#pgate');el.hidden=true;el.classList.remove('cover');$('#app').inert=false;$('#lockPin').value=''}
function resume(){
 if(!cfg||locked)return;
 const since=hiddenAt||lastActive();hiddenAt=0;
 if(shouldLock(since,Date.now()))showLock();else hideAll();
}
export function initLock(){
 cfg=validLock(META.lock)?META.lock:null;
 if(cfg&&shouldLock(lastActive(),Date.now()))showLock();
}
document.addEventListener('visibilitychange',()=>{
 if(!cfg)return;
 if(document.visibilityState==='hidden'){hiddenAt=Date.now();stamp();if(!locked)showCover()}
 else resume();
});
addEventListener('pagehide',()=>{if(cfg){stamp();if(!locked)showCover()}});
addEventListener('pageshow',e=>{if(e.persisted)resume()});

$('#lockForm').onsubmit=async ev=>{
 ev.preventDefault();if(!cfg||remaining(cfg,Date.now())>0)return;
 const pin=$('#lockPin').value,msg=$('#lockMsg');
 if(!validPin(pin)){msg.dataset.keep='1';msg.textContent='Enter your PIN, 4 to 6 digits.';return}
 if(await checkPin(cfg,pin)){cfg=recordOk(cfg);persist();stamp();hideAll();return}
 cfg=recordFail(cfg,Date.now());persist();$('#lockPin').value='';msg.dataset.keep='1';msg.textContent='That PIN does not match.';drawLock();$('#lockPin').focus();
};
$('#lockForgot').onclick=()=>{asking=true;drawLock();$('#lockKeep').focus()};
$('#lockKeep').onclick=()=>{asking=false;drawLock();$('#lockPin').focus()};
$('#lockReset').onclick=()=>{cfg=null;persist();hideAll()};

/* Data > Privacy lock */
const say=t=>{$('#lkMsg').textContent=t};
export function renderLock(){
 const dm=status.demo,on=!!cfg;
 $('#lkStatus').textContent=dm?'Sample data is showing, so the lock cannot be changed.':on?'On. Day Rate locks after 5 minutes away, and hides its contents in the app switcher.':'Off. Anyone who opens this app can see your days.';
 $('#lkCurRow').hidden=!on;$('#lkSet').textContent=on?'Change PIN':'Set PIN';$('#lkOff').hidden=!on;
 ['lkCur','lkNew','lkNew2','lkSet','lkOff'].forEach(id=>{$('#'+id).disabled=dm});
}
$('#lkForm').onsubmit=async ev=>{
 ev.preventDefault();if(status.demo)return;
 const cur=$('#lkCur').value,a=$('#lkNew').value,b=$('#lkNew2').value;
 if(cfg&&!(await checkPin(cfg,cur)))return say('The current PIN does not match.');
 if(!validPin(a))return say('A PIN is 4 to 6 digits, numbers only.');
 if(a!==b)return say('The two new PINs are different.');
 cfg=await makeLock(a);persist();stamp();
 ['lkCur','lkNew','lkNew2'].forEach(id=>{$('#'+id).value=''});renderLock();say('PIN saved.');
};
$('#lkOff').onclick=async()=>{
 if(status.demo||!cfg)return;
 if(!(await checkPin(cfg,$('#lkCur').value)))return say('Enter your current PIN above to turn the lock off.');
 cfg=null;persist();['lkCur','lkNew','lkNew2'].forEach(id=>{$('#'+id).value=''});renderLock();say('Lock turned off.');
};

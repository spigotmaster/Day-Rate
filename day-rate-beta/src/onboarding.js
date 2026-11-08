import {$,today} from './util.js';
import {E,META,recalc,replaceMeta,saveMeta,setE,status} from './state.js';
import {mkEl} from './insights-ui.js';
import {pip} from './ach-ui.js';
import {home} from './history.js';
import {startRate} from './rate.js';
import {makeDemo} from './demo.js';

/* ---------- sample mode: real data is parked in memory, nothing is saved while it is on ---------- */
let parked=null;
export function enterDemo(){
 if(status.demo||status.readOnly)return;
 parked={E,meta:JSON.parse(JSON.stringify(META))};
 const d=makeDemo(today());
 status.demo=true;setE(d.entries);replaceMeta(d.meta);recalc();
 $('#demoBar').hidden=false;pip();home();
}
export function exitDemo(){
 if(!status.demo||!parked)return;
 status.demo=false;setE(parked.E);replaceMeta(parked.meta);parked=null;recalc();
 $('#demoBar').hidden=true;pip();home();
}
$('#demoExit').onclick=exitDemo;

/* ---------- intro ---------- */
const NS='http://www.w3.org/2000/svg';
const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const svg=(vb,inner)=>{const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox',vb);s.setAttribute('class','obsvg');s.setAttribute('aria-hidden','true');s.innerHTML=inner;return s};
const p=t=>mkEl('p',null,t);
const STEPS=[
 {t:'Three ratings, once a day',b:()=>{
  const row=mkEl('div','obrow');
  [['M','Mood','--lm'],['P','Productivity','--lp'],['C','Connection','--lc']].forEach(([l,n,v])=>{
   const d=mkEl('div','obdim');const c=mkEl('span','obdot',l);c.style.background='var('+v+')';c.setAttribute('aria-hidden','true');d.append(c,mkEl('b',null,n));row.appendChild(d)});
  return [row,p('Each evening, rate how the day felt, how productive it was, and how connected you felt to people. Each one is 1 to 10.'),
   p('Drag up or down and hold still to lock it in, or use the + and \u2212 buttons. It takes about 20 seconds.')]}},
 {t:'Your score is relative to you',b:()=>{
  const bar=mkEl('div','obbar');bar.setAttribute('aria-hidden','true');
  const lab=mkEl('div','oblab');lab.append(mkEl('span',null,'Your lowest'),mkEl('span',null,'Your highest'));
  return [bar,lab,p('Each rating turns into 0 to 5 points measured against your own lowest and highest, so a day scores out of 15.'),
   p('That means a 7 can be a great day for one person and an ordinary one for another. As your range grows, older days are rescored. Your raw 1 to 10 ratings are never changed.')]}},
 {t:'Private by default',b:()=>{
  const out=[svg('0 0 64 64','<rect x="14" y="28" width="36" height="26" rx="6" fill="none" stroke="currentColor" stroke-width="3"/><path d="M22 28v-6a10 10 0 0 1 20 0v6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="41" r="3.5" fill="currentColor"/>'),
   p('Everything stays on this phone. There is no account, no server and no tracking.'),
   p('Clearing website data deletes your days, so save a backup file from the Data tab now and then.')];
  if(isiOS&&!standalone())out.push(mkEl('p','obnote','On iPhone, add Day Rate to your Home Screen first (Share, then Add to Home Screen) and enter your real days from that icon. Safari and the Home Screen icon keep separate data.'));
  return out}},
 {t:'Ready when you are',last:true}
];
let at=0,reopen=false,backTo=null;
function finish(action){
 const o=$('#onb');o.hidden=true;document.removeEventListener('keydown',onKey,true);
 if(!status.demo&&!META.onboarded){META.onboarded=Date.now();saveMeta()}
 try{backTo&&backTo.focus&&backTo.focus({preventScroll:true})}catch(e){}
 if(action==='rate')startRate(today());
 else if(action==='demo')enterDemo();
}
function draw(){
 const s=STEPS[at],body=$('#onbBody');body.replaceChildren();
 const h=mkEl('h2',null,s.t);h.id='onbT';h.tabIndex=-1;body.appendChild(h);
 if(s.last){
  const has=Object.keys(E).length>0&&!status.demo;
  body.appendChild(p(has?'That is the whole tour. You can open it again any time from the Data tab.':'Rate today whenever you like, or look around first with sample data.'));
  const a=mkEl('button','btn cta',has?'Done':'Rate my first day');a.type='button';a.id='onbGo';a.onclick=()=>finish(has?'skip':'rate');
  const d=mkEl('button','btn','Try with sample data');d.type='button';d.id='onbDemo';d.onclick=()=>finish('demo');
  body.append(a,d,mkEl('p','obnote','Sample data is clearly labelled, is never saved, and never mixes with your own days. Exit it any time.'));
 }else s.b().forEach(n=>body.appendChild(n));
 $('#onbStep').textContent='Step '+(at+1)+' of '+STEPS.length;
 [...$('#onbDots').children].forEach((d,i)=>d.classList.toggle('on',i===at));
 $('#onbBack').disabled=at===0;$('#onbNext').hidden=!!s.last;$('#onbSkip').hidden=!!s.last;
 h.focus({preventScroll:true});
}
function onKey(e){
 if($('#onb').hidden)return;
 if(e.key==='Escape'){e.preventDefault();finish('skip')}
 else if(e.key==='Tab'){
  const f=[...$('#onb').querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled&&b.offsetParent!==null);
  if(!f.length)return;const i=f.indexOf(document.activeElement);
  if(e.shiftKey&&(i<=0)){e.preventDefault();f[f.length-1].focus()}
  else if(!e.shiftKey&&(i===f.length-1)){e.preventDefault();f[0].focus()}
 }
}
export function openOnboarding(){
 if(status.demo)return;
 at=0;backTo=document.activeElement;$('#onb').hidden=false;draw();
 document.addEventListener('keydown',onKey,true);
}
$('#onbNext').onclick=()=>{if(at<STEPS.length-1){at++;draw()}};
$('#onbBack').onclick=()=>{if(at>0){at--;draw()}};
$('#onbSkip').onclick=()=>finish('skip');
$('#onbDots').replaceChildren(...STEPS.map(()=>document.createElement('i')));
$('#onbAgain').onclick=openOnboarding;

/* Called once after startup. Existing users (any saved day) are marked as done and never see it. */
export function maybeOnboard(){
 if(status.readOnly||status.demo||META.onboarded)return;
 if(Object.keys(E).length){META.onboarded=Date.now();saveMeta();return}
 openOnboarding();
}

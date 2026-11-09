import {$,today} from './util.js';
import {E,H,META,buzz,paint,reduce,save,saveMeta,status,tOf,tick} from './state.js';
import {show} from './nav.js';
import {showResult} from './result.js';
import {home,milestone,setPendingMile} from './history.js';
import {celebrate} from './celebrate.js';
import {skipToday} from './notify.js';
import {achSync} from './ach-ui.js';

/* rating flow */
export const DIM=[
 {k:'m',q:'How did today feel?',d:'How the day felt overall'},
 {k:'p',q:'How productive was today?',d:'Did you get done what mattered?'},
 {k:'c',q:'How connected did you feel?',d:'How close you felt to people, in person or remote'}
];
export let step=0,vals=[5,5,5],target=null,down=false,startY=0,startV=5,lastY=0,holdT=0,raf=0;
export const C=289;
export function startRate(date){target=date;const e=E[date];vals=e?[e.m,e.p,e.c]:[5,5,5];step=0;renderStep();show('rate')}
export function renderStep(){
 const d=DIM[step];
 $('#q').textContent=d.q;$('#def').textContent=d.d;
 $('#back').textContent=step?'Back':'Cancel';
 [...$('#dots').children].forEach((x,i)=>x.classList.toggle('on',i<=step));
 $('#ringc').style.strokeDashoffset=C;
 renderNum();
}
export function renderNum(){
 const v=vals[step];
 $('#num').textContent=v;
 $('#num').setAttribute('aria-valuenow',v);
 $('#num').setAttribute('aria-valuetext',DIM[step].k==='m'?'Mood '+v:DIM[step].k==='p'?'Productivity '+v:'Connection '+v);
 paint($('#st'),(v-1)/9);
}
export function setVal(v){v=Math.max(1,Math.min(10,v));if(v!==vals[step]){vals[step]=v;tick();renderNum()}}
export function loop(t){
 if(!down)return;
 const p=Math.min(1,(t-holdT)/600);
 $('#ringc').style.strokeDashoffset=C*(1-p);
 if(p>=1){down=false;lock();return}
 raf=requestAnimationFrame(loop);
}
export const st=$('#st');
st.addEventListener('pointerdown',e=>{
 if(e.target.closest('button'))return;
 down=true;startY=lastY=e.clientY;startV=vals[step];holdT=performance.now();
 try{st.setPointerCapture(e.pointerId)}catch(x){}
 cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
});
st.addEventListener('pointermove',e=>{
 if(!down)return;
 setVal(Math.round(startV+(startY-e.clientY)/(innerHeight*.08)));
 if(Math.abs(e.clientY-lastY)>3){lastY=e.clientY;holdT=performance.now();$('#ringc').style.strokeDashoffset=C}
});
['pointerup','pointercancel'].forEach(ev=>st.addEventListener(ev,()=>{down=false;$('#ringc').style.strokeDashoffset=C}));
$('#minus').onclick=()=>setVal(vals[step]-1);
$('#plus').onclick=()=>setVal(vals[step]+1);
$('#lock').onclick=()=>lock();
$('#num').addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowRight'){e.preventDefault();setVal(vals[step]+1)}if(e.key==='ArrowDown'||e.key==='ArrowLeft'){e.preventDefault();setVal(vals[step]-1)}});
$('#back').onclick=()=>{if(step>0){step--;renderStep()}else home()};
export const TAGS=[['sl','Slept well'],['ex','Exercise'],['ou','Outdoors'],['so','Social'],['al','Alcohol'],['ld','Heavy workload'],['un','Unwell']];
export const TAGLBL=Object.fromEntries(TAGS);
export const tagList=a=>TAGS.map(x=>x[0]).filter(id=>a.includes(id));
export function renderTags(date,box){
 box=box||$('#tags');box.innerHTML='';
 const l=document.createElement('div');l.className='lbl';l.textContent='What shaped '+(date===today()?'today':'this day')+'? (optional)';box.appendChild(l);
 for(const [id,name] of TAGS){
  const b=document.createElement('button'),set=on=>{b.setAttribute('aria-pressed',on);b.textContent=(on?'\u2713 ':'')+name};
  b.type='button';set((E[date].tags||[]).includes(id));
  b.onclick=()=>{const cur=E[date].tags||[],nx=tagList(cur.includes(id)?cur.filter(x=>x!==id):cur.concat(id));if(nx.length)E[date].tags=nx;else delete E[date].tags;save();set(nx.includes(id));buzz(1)};
  box.appendChild(b);
 }
}
export function lock(){
 down=false;
 if(!reduce)st.animate([{transform:'scale(1)'},{transform:'scale(1.03)'},{transform:'scale(1)'}],{duration:400,easing:'ease-in-out'});
 if(step<2){buzz(1);step++;renderStep();return}
 const old=E[target]||{},isNew=!E[target];
 const e={m:vals[0],p:vals[1],c:vals[2],note:old.note||'',created:old.created||Date.now(),updated:Date.now()};
 if(old.tags&&old.tags.length)e.tags=old.tags.slice();
 E[target]=e;save();
 if(isNew){const m=milestone(Object.keys(E).length);if(m){META.mile=m;saveMeta();setPendingMile(m)}}
 const t=tOf(H(e));buzz(t<.33?1:t<.66?2:3);
 showResult(target);
 if(target===today()&&!status.demo)skipToday(target);
 if(!status.demo)try{const f=achSync();if(f.length)setTimeout(()=>celebrate(f),700)}catch(x){}
}


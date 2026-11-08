import {$,ds,parse,today} from './util.js';
import {E,H,META,col,comp,fmt,label,ls,reduce,save,tOf} from './state.js';
import {show} from './nav.js';
import {C,renderTags,startRate} from './rate.js';
import {addD,dayLines,delControl,fillRings,goalCard,monOf,renderWeek,showResult} from './result.js';
import {insData} from './insights-ui.js';
import {renderRecap,renderSearch} from './review-ui.js';

export let histMode='wk',YG=null;
export function markYear(){const r=$('#yr');if(r)r.querySelectorAll('rect').forEach(x=>x.classList.toggle('ysel',x.dataset.d===sel))}
export function renderYear(){
 const t=today(),start=addD(monOf(t),-364),P=12,C=10,L=2,T=20,W=L+53*P,Hh=T+7*P,svg=$('#yr');
 YG={P,L,T,W,Hh,start};svg.setAttribute('viewBox','0 0 '+W+' '+Hh);
 let g='',lm=-1,n=0,tot=0;
 for(let i=0;i<53;i++){
  const d=parse(addD(start,i*7)),m=d.getMonth();
  if(m!==lm&&d.getDate()<=7){lm=m;g+='<text x="'+(L+i*P)+'" y="13">'+d.toLocaleDateString(undefined,{month:'short'})+'</text>'}
  for(let j=0;j<7;j++){const k=addD(start,i*7+j);if(k>t)continue;tot++;const e=E[k];if(e)n++;
   g+='<rect data-d="'+k+'" x="'+(L+i*P)+'" y="'+(T+j*P)+'" width="'+C+'" height="'+C+'" rx="2" style="fill:'+(e?'rgb('+col(tOf(H(e)))+')':'var(--line)')+(e?'':';opacity:.45')+'"/>'}
 }
 svg.innerHTML=g;markYear();
 $('#ylg').innerHTML='<span>Lower</span><i style="background:linear-gradient(90deg,rgb('+col(0)+'),rgb('+col(.5)+'),rgb('+col(1)+'))"></i><span>Higher</span>';
 $('#yrsum').textContent=n+' of '+tot+' days rated in the last year';
}
export function applyMode(){
 [...$('#hmode').children].forEach(b=>{const on=b.dataset.m===histMode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
 const dayView=histMode==='wk'||histMode==='yr';
 $('#gw').hidden=histMode!=='wk';$('#yrw').hidden=histMode!=='yr';
 ['wk7','wkrecap','hleg','det'].forEach(id=>{$('#'+id).hidden=!dayView});
 $('#rcw').hidden=histMode!=='rc';$('#srw').hidden=histMode!=='sr';
 if(histMode==='yr')renderYear();
 if(histMode==='rc')renderRecap();
 if(histMode==='sr')renderSearch();
}
$('#hmode').onclick=e=>{const b=e.target.closest('button');if(!b)return;histMode=b.dataset.m;applyMode()};
$('#yr').onclick=e=>{
 if(!YG)return;
 const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*YG.W-YG.L,y=(e.clientY-r.top)/r.height*YG.Hh-YG.T,i=Math.floor(x/YG.P),j=Math.floor(y/YG.P);
 if(i<0||i>=53||j<0||j>=7)return;
 const k=addD(YG.start,i*7+j),t=today();if(k>t)return;
 sel=k;renderDet(k,t);renderWeek();markYear();
 $('#det').scrollIntoView({block:'nearest',behavior:reduce?'auto':'smooth'});
};
export const MILES=[7,14,30,50,100,150,200,365],MTITLE={7:'First week logged',14:'Two weeks in',30:'One month of days',50:'Fifty days',100:'One hundred days',150:'150 days',200:'200 days',365:'A full year'};
export let pendingMile=0;
export const milestone=n=>MILES.filter(x=>x<=n&&x>(META.mile||0)).pop()||0;
export const nextMile=n=>{const x=MILES.find(v=>v>n);return x?' \u00b7 '+(x-n)+' to the next milestone ('+x+')':''};
export function momentCard(){
 const box=$('#moment'),m=pendingMile;pendingMile=0;
 box.hidden=!m;box.innerHTML='';
 if(!m)return;
 let sub='';
 try{
  const r=insData(),pl=(n,w)=>n+' '+w+(n===1?'':'s'),solid=r.discover.filter(i=>!i.prelim).length;
  sub=m===7?(r.observe.length?pl(r.observe.length,'observation')+' ready in Insights.':'Insights are now on.')
   :m===14?(r.discover.length?pl(r.discover.length,'pattern')+' found in your days.':'Pattern insights are now on.')
   :r.discover.length?solid+' of '+r.discover.length+' patterns no longer preliminary.':'';
 }catch(x){}
 const b=document.createElement('b');b.textContent='\u2726 '+MTITLE[m];box.appendChild(b);
 if(sub){const t=document.createElement('span');t.textContent=sub;box.appendChild(t)}
 if(!reduce)for(let k=0;k<10;k++){const i=document.createElement('i');i.style.setProperty('--a',k*36+'deg');box.appendChild(i)}
}
export function home(){const t=today();E[t]?showResult(t):showToday()}
export function showToday(){
 const ks=Object.keys(E).sort(),n=ks.length;
 $('#tsum').textContent=n?'Last rated '+parse(ks[n-1]).toLocaleDateString(undefined,{day:'numeric',month:'short'})+': '+fmt(H(E[ks[n-1]]))+' / 15. '+n+(n===1?' day':' days')+' so far, average '+fmt(Math.round(ks.reduce((a,k)=>a+H(E[k]),0)/n))+' / 15.':'No days rated yet. Your first rating takes about five seconds.';
 $('#rateNow').onclick=()=>startRate(today());
 $('#tgoal').replaceChildren(goalCard(today()));
 show('today');
}

/* history */
export let sel=null;
export function renderHist(){
 const t=today(),td=parse(t),keys=Object.keys(E).sort();
 const first=keys.length?parse(keys[0]):td;
 const minD=new Date(td.getFullYear(),td.getMonth(),td.getDate()-77);
 const s0=first<minD?first:minD;
 const start=new Date(s0.getFullYear(),s0.getMonth(),s0.getDate()-((s0.getDay()+6)%7));
 const endMon=new Date(td.getFullYear(),td.getMonth(),td.getDate()-((td.getDay()+6)%7));
 const days=Math.round((endMon-start)/864e5)+7;
 const g=$('#grid');g.innerHTML='';
 for(let i=0;i<days;i++){
  const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i),k=ds(d);
  const b=document.createElement('button');b.className='cell';b.dataset.d=k;
  if(k>t)b.classList.add('f');
  else if(E[k]){b.style.background='rgb('+col(tOf(H(E[k])))+')';b.style.borderColor='transparent';b.setAttribute('aria-label',label(k)+', score '+fmt(H(E[k])))}
  else b.setAttribute('aria-label',label(k)+', not rated');
  if(k===(sel||t))b.classList.add('sel');
  b.onclick=()=>{sel=k;const o=g.querySelector('.sel');if(o)o.classList.remove('sel');b.classList.add('sel');renderDet(k,t);renderWeek();markYear();b.scrollIntoView({inline:'nearest',block:'nearest'})};
  g.appendChild(b);
 }
 const hs=keys.map(k=>H(E[k]));
 $('#sum').textContent=keys.length?keys.length+(keys.length===1?' day':' days')+' rated · average '+fmt(Math.round(hs.reduce((a,b)=>a+b,0)/hs.length))+' / 15':'No days rated yet';
 $('#gw').scrollLeft=1e6;const sc=g.querySelector('.sel');if(sel&&sc)sc.scrollIntoView({inline:'center',block:'nearest'});
 renderDet(sel||t,t);renderWeek();applyMode();
}
export function renderDet(k,t){
 const d=$('#det'),e=E[k],kd=parse(k);d.innerHTML='';
 const nav=(dir,txt,lbl)=>{const nk=ds(new Date(kd.getFullYear(),kd.getMonth(),kd.getDate()+dir)),c=$('#grid').querySelector('[data-d="'+nk+'"]'),b=document.createElement('button');
  b.type='button';b.className='dnav';b.textContent=txt;b.setAttribute('aria-label',lbl);b.disabled=!c||nk>t;b.onclick=()=>c&&c.click();return b};
 const hd=document.createElement('div');hd.className='dhead';
 const h=document.createElement('div');h.className='rdate';h.textContent=label(k);
 hd.append(nav(-1,'\u2039','Previous day'),h,nav(1,'\u203a','Next day'));d.appendChild(hd);
 if(e){
  const top=document.createElement('div');top.className='dtop';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('class','rings dr');svg.setAttribute('aria-hidden','true');
  const side=document.createElement('div');
  const b=document.createElement('div');b.className='big';b.textContent=fmt(H(e))+' / 15';side.appendChild(b);
  const r=document.createElement('div');r.className='row';r.innerHTML='<span>Mood '+e.m+' ('+fmt(comp(e,'m'))+'/5)</span><span>Productivity '+e.p+' ('+fmt(comp(e,'p'))+'/5)</span><span>Connection '+e.c+' ('+fmt(comp(e,'c'))+'/5)</span>';side.appendChild(r);
  top.append(svg,side);d.appendChild(top);
  fillRings(svg,e,'rgb('+col(tOf(H(e)))+')');
  const n=document.createElement('input');n.className='noteIn';n.maxLength=140;n.placeholder='One good thing about this day (optional)';n.value=e.note||'';n.setAttribute('aria-label','Note for this day');n.oninput=()=>{E[k].note=n.value;save()};d.appendChild(n);
  const tb=document.createElement('div');tb.className='tags';tb.setAttribute('role','group');tb.setAttribute('aria-label','What shaped this day');renderTags(k,tb);d.appendChild(tb);
  const ls=dayLines(k,e,false);
  if(ls.length){const c=document.createElement('div');c.className='ctx';ls.forEach(x=>{const q=document.createElement('div');q.textContent=x;c.appendChild(q)});d.appendChild(c)}
 }else{
  const p=document.createElement('p');p.className='note';p.textContent=k>t?'This day has not happened yet.':'Not rated.';d.appendChild(p);
 }
 if(k<=t){const b=document.createElement('button');b.className='btn';b.textContent=e?'Edit ratings':'Rate this day';b.onclick=()=>startRate(k);d.appendChild(b)}
 if(e)d.appendChild(delControl(k,()=>{sel=k;renderHist()}));
}
export const setSel=v=>{sel=v};
export const setPendingMile=v=>{pendingMile=v};
export const setHistMode=v=>{histMode=v};

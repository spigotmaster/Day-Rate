import {$,ds,pad,parse,today} from './util.js';
import {E,H,META,STATS,buzz,col,comp,fmt,label,overdue,paint,reduce,save,tOf} from './state.js';
import {show} from './nav.js';
import {TAGLBL,renderTags,st,startRate} from './rate.js';
import {momentCard,nextMile,sel,setSel,showToday} from './history.js';
import {EXPLEN,expDay,expSync} from './insights-ui.js';
import {expectCard} from './forecast-ui.js';

/* result */
export function remember(date){
 const [y,m,d]=date.split('-').map(Number);
 const ya=y-1+'-'+pad(m)+'-'+pad(d);
 if(E[ya])return ['This day last year',E[ya]];
 const pm=m===1?[y-1,12]:[y,m-1];
 const dt=new Date(pm[0],pm[1]-1,d);
 if(dt.getMonth()===pm[1]-1){const k=ds(dt);if(E[k])return ['This day last month',E[k]]}
 return null;
}
export function showResult(date){
 const e=E[date],h=H(e);
 paint($('#rs'),tOf(h));
 $('#rdate').textContent=date===today()?'Today':label(date);
 $('#score').innerHTML=fmt(h)+' <small>/ 15</small>';
 const pt=d=>fmt(comp(e,d))+' / 5';
 $('#trio').innerHTML='<div><b>'+e.m+'</b>Mood<br><small>'+pt('m')+'</small></div><div><b>'+e.p+'</b>Productivity<br><small>'+pt('p')+'</small></div><div><b>'+e.c+'</b>Connection<br><small>'+pt('c')+'</small></div>';
 const n=$('#note');n.value=e.note||'';
 n.oninput=()=>{E[date].note=n.value;save()};
 const r=remember(date);
 $('#rem').textContent=r?r[0]+': '+fmt(H(r[1]))+(r[1].note?' · '+r[1].note.slice(0,60):''):'';
 $('#bye').textContent=date===today()?'See you tomorrow.':'';
 try{renderTags(date);drawRings(e);dayNotes(date,e)}catch(x){}
 try{momentCard()}catch(x){}
 try{resultWeek(date)}catch(x){}
 const bk=$('#bk');bk.hidden=!overdue();bk.onclick=()=>show('data');
 $('#edit').onclick=()=>startRate(date);
 try{$('#rfc').replaceChildren(expectCard(date))}catch(x){$('#rfc').replaceChildren()}
 $('#rdel').replaceChildren(delControl(date,()=>{if(date===today())showToday();else{setSel(date);show('hist')}}));
 show('res');
}
export function fillRings(svg,e,color){
 const v=[e.m,e.p,e.c];
 svg.innerHTML=[44,34,24].map((r,i)=>'<circle class="bg" cx="50" cy="50" r="'+r+'"/><circle class="fg" pathLength="100" cx="50" cy="50" r="'+r+'" style="opacity:'+[1,.8,.6][i]+(color?';stroke:'+color:'')+'"/>').join('');
 const fg=svg.querySelectorAll('.fg'),go=()=>fg.forEach((c,i)=>{c.style.strokeDashoffset=100-v[i]*10});
 if(reduce)go();else requestAnimationFrame(()=>requestAnimationFrame(go));
}
export function drawRings(e){fillRings($('#rings'),e)}
export function dayLines(date,e,full){
 const ks=Object.keys(E),n=ks.length,out=[],NM={m:'mood',p:'productivity',c:'connection'};
 if(n>=7)for(const d of ['m','p','c']){if(e[d]>=STATS[d][1]&&ks.filter(k=>E[k][d]===e[d]).length===1){out.push('Your highest '+NM[d]+(date===today()?' so far.':' on record.'));break}}
 const t=parse(date),prev=[];
 for(let i=1;i<=7;i++){const x=E[ds(new Date(t.getFullYear(),t.getMonth(),t.getDate()-i))];if(x)prev.push(x)}
 if(prev.length>=3){const a=(e.m+e.p+e.c)/3,b=prev.reduce((s,x)=>s+(x.m+x.p+x.c)/3,0)/prev.length,df=a-b;
  out.push(Math.abs(df)<.5?'In line with the 7 days before.':(Math.round(Math.abs(df)*10)/10).toFixed(1)+(df>0?' above':' below')+' the 7 days before.')}
 if(full){expSync();const x=META.exp;if(x)out.push('Experiment day '+expDay(x)+' of '+EXPLEN+': '+x.title+'.');else if((META.expDone||[]).some(z=>z.new))out.push('Your experiment results are ready in Insights.')}
 if(full)out.push(n<7?(7-n)+(7-n===1?' more day':' more days')+' until Insights switch on.':n<14?(14-n)+(14-n===1?' more day':' more days')+' until pattern insights unlock.':n+' days in your record'+nextMile(n)+'.');
 return out;
}
export function dayNotes(date,e){$('#ctx').replaceChildren(...dayLines(date,e,true).map(x=>{const d=document.createElement('div');d.textContent=x;return d}))}
export const SVGNS='http://www.w3.org/2000/svg',DN=['M','T','W','T','F','S','S'];
export const addD=(k,n)=>{const d=parse(k);return ds(new Date(d.getFullYear(),d.getMonth(),d.getDate()+n))};
export const monOf=k=>addD(k,-((parse(k).getDay()+6)%7));
export const rng=k=>parse(k).toLocaleDateString(undefined,{day:'numeric',month:'short'});
export const sdate=k=>parse(k).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
export const w1=v=>(Math.round(v*10)/10).toFixed(1);
export function weekStrip(box,k,mono,pick,selKey){
 const mon=monOf(k),t=today();box.innerHTML='';
 for(let i=0;i<7;i++){
  const dk=addD(mon,i),e=E[dk],b=document.createElement('button'),svg=document.createElementNS(SVGNS,'svg');
  b.type='button';b.className='wd'+(dk===t?' now':'')+(dk===selKey?' sel':'');b.disabled=dk>t;
  b.setAttribute('aria-label',label(dk)+(e?', score '+fmt(H(e)):dk>t?', not yet':', not rated'));
  svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('aria-hidden','true');
  if(e){const c=mono?'currentColor':'rgb('+col(tOf(H(e)))+')',v=[e.m,e.p,e.c];
   svg.innerHTML=[44,34,24].map((r,j)=>'<circle class="bg" cx="50" cy="50" r="'+r+'"/><circle pathLength="100" cx="50" cy="50" r="'+r+'" style="stroke:'+c+';stroke-dasharray:100;stroke-dashoffset:'+(100-v[j]*10)+';opacity:'+[1,.8,.6][j]+'"/>').join('')}
  else svg.innerHTML='<circle class="empty" cx="50" cy="50" r="40"/>';
  const l=document.createElement('span');l.textContent=DN[i];
  b.append(svg,l);b.onclick=()=>pick(dk);box.appendChild(b);
 }
}
export function renderWeek(){const k=sel||today();weekStrip($('#wk7'),k,false,x=>{const c=$('#grid').querySelector('[data-d="'+x+'"]');if(c)c.click()},k);weekRecap($('#wkrecap'),monOf(k))}
export function weekRecap(box,wk,quiet){
 const t=today(),mon=monOf(t);
 if(!wk)wk=addD(mon,6)===t&&E[t]?mon:addD(mon,-7);
 box.innerHTML='';
 /* current week: Monday up to today, compared with the same span of the week before. Any other week: all 7 days. */
 const cur=wk===mon,span=cur?Math.round((parse(t)-parse(mon))/864e5)+1:7,part=cur&&span<7;
 const days=[],pdays=[];
 for(let i=0;i<span;i++){const k=addD(wk,i),q=addD(wk,i-7);if(E[k])days.push([k,E[k]]);if(E[q])pdays.push([q,E[q]])}
 if(days.length<3&&quiet)return;
 const card=document.createElement('div');card.className='wkcard';
 const h=document.createElement('h3');h.textContent=part?'Week so far \u00b7 '+rng(wk)+' to '+rng(t):'Week recap \u00b7 '+rng(wk)+' to '+rng(addD(wk,6));card.appendChild(h);
 const add=x=>{const p=document.createElement('p');p.textContent=x;card.appendChild(p);return p};
 const of=days.length+' of '+span+(span===1?' day':' days')+' rated'+(part?' so far':'');
 if(days.length<3){add(of+'. Rate at least 3 days in a week to get a recap.');box.appendChild(card);return}
 const avg=(a,d)=>a.reduce((s,x)=>s+x[1][d],0)/a.length,tri=document.createElement('div');tri.className='tri';
 for(const [d,nm] of [['m','Mood'],['p','Productivity'],['c','Connection']]){
  const a=avg(days,d),dl=pdays.length>=3?a-avg(pdays,d):null,c=document.createElement('div');
  c.innerHTML='<b>'+w1(a)+'</b><small>'+nm+(dl==null?'':Math.abs(dl)<.3?' \u00b7 steady':' \u00b7 '+(dl>0?'up ':'down ')+w1(Math.abs(dl)))+'</small>';
  tri.appendChild(c);
 }
 card.appendChild(tri);
 const best=days.reduce((a,b)=>H(b[1])>H(a[1])?b:a);
 add(of+'. Best day: '+sdate(best[0])+' ('+fmt(H(best[1]))+' / 15).');
 if(best[1].note)add('That day: '+best[1].note);
 const cnt={};days.forEach(x=>(x[1].tags||[]).forEach(g=>{cnt[g]=(cnt[g]||0)+1}));
 const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
 if(top&&top[1]>=2&&TAGLBL[top[0]])add('Most tagged: '+TAGLBL[top[0]]+' ('+top[1]+' days).');
 if(part&&pdays.length>=3)add('Changes compare with the same days of the week before.');
 box.appendChild(card);
}
/* delete a day: button, then an inline are-you-sure step. onDone runs after the day is removed. */
export function delControl(date,onDone){
 const box=document.createElement('div');box.className='delrow';
 const nm=date===today()?'today':label(date);
 const mk=(txt,cls,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn '+cls;b.textContent=txt;b.onclick=fn;return b};
 const idle=()=>{box.replaceChildren(mk(date===today()?'Delete today\u2019s ratings':'Delete this day\u2019s ratings','sec',ask));box.removeAttribute('role');box.removeAttribute('aria-label')};
 const ask=()=>{
  const p=document.createElement('p'),a=document.createElement('div');
  p.textContent='Delete the ratings, note and tags for '+nm+'? This cannot be undone.';
  a.className='acts';
  const keep=mk('Keep it','',()=>{idle();const b=box.querySelector('button');if(b)b.focus()});
  const yes=mk('Yes, delete','yes',()=>{delete E[date];save();buzz(1);onDone()});
  a.append(keep,yes);box.replaceChildren(p,a);
  box.setAttribute('role','alertdialog');box.setAttribute('aria-label','Confirm delete');
  keep.focus();
 };
 idle();return box;
}
export function resultWeek(date){
 weekStrip($('#rwk7'),date,true,k=>{setSel(k);show('hist')},date);
 if(date===today()&&addD(monOf(date),6)===date)weekRecap($('#rwk'),monOf(date),true);else $('#rwk').innerHTML='';
}

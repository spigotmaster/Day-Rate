import {$,today} from './util.js';
import {E,H,col,fmt,label,textOn,tOf} from './state.js';
import {dayGrade,spoken} from './grade-ui.js';
import {renderDet,sel,setSel} from './history.js';
import {monthGrid,onThisDay,relLabel,shiftMonth} from './calendar.js';

/* History > Month: a month grid, jump to date, and "on this day" memories. Numbers come from calendar.js; nothing is stored. */
const M={anchor:null};
const mk=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
export function showMonthFor(k){M.anchor=k.slice(0,7);renderMonth()}
function pick(k){setSel(k);renderDet(k,today());renderMonth();const d=$('#det');if(d&&d.scrollIntoView)d.scrollIntoView({block:'nearest'})}
export function renderMonth(){
 const box=$('#mow'),t=today(),curM=t.slice(0,7),keys=Object.keys(E).sort(),firstM=keys.length?keys[0].slice(0,7):curM;
 if(!M.anchor)M.anchor=(sel||t).slice(0,7);
 if(M.anchor>curM)M.anchor=curM;
 box.replaceChildren();
 const nav=mk('div','rcnav'),prev=mk('button',null,'\u2039'),next=mk('button',null,'\u203a'),g=monthGrid(M.anchor,t);
 prev.type=next.type='button';prev.setAttribute('aria-label','Previous month');next.setAttribute('aria-label','Next month');
 prev.disabled=M.anchor<=firstM;next.disabled=M.anchor>=curM;
 prev.onclick=()=>{M.anchor=shiftMonth(M.anchor,-1);renderMonth()};next.onclick=()=>{M.anchor=shiftMonth(M.anchor,1);renderMonth()};
 nav.append(prev,mk('h2',null,new Date(g.y,g.m-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'})),next);box.appendChild(nav);
 const grid=mk('div','mgrid');grid.setAttribute('role','group');grid.setAttribute('aria-label','Days of the month. Tap a day to open it.');
 ['M','T','W','T','F','S','S'].forEach(d=>{const h=mk('div','mhd',d);h.setAttribute('aria-hidden','true');grid.appendChild(h)});
 const cur=sel||t;
 g.cells.forEach(c=>{
  if(!c){grid.appendChild(mk('div','mblank'));return}
  const e=E[c.k],b=mk('button','mcell'+(e?' rated':'')+(c.today?' now':'')+(c.k===cur?' sel':''),String(c.day));
  b.type='button';b.disabled=c.future;
  if(e){const rgb=col(tOf(H(e)));b.style.background='rgb('+rgb+')';b.style.color=textOn(rgb);const gd=dayGrade(e);b.setAttribute('aria-label',label(c.k)+', score '+fmt(H(e))+(gd?', grade '+spoken(gd.l):''))}
  else b.setAttribute('aria-label',label(c.k)+(c.future?', not yet':', not rated'));
  if(c.k===cur)b.setAttribute('aria-current','date');
  b.onclick=()=>pick(c.k);grid.appendChild(b);
 });
 box.appendChild(grid);
 const jl=mk('label','row2','Jump to date '),ji=document.createElement('input');
 ji.type='date';ji.id='mjump';ji.max=t;ji.value=cur<=t?cur:t;ji.setAttribute('aria-label','Jump to a date');
 ji.onchange=()=>{const v=ji.value;if(/^\d{4}-\d\d-\d\d$/.test(v)&&v<=t){M.anchor=v.slice(0,7);pick(v)}};
 jl.appendChild(ji);box.appendChild(jl);
 const mem=onThisDay(E,cur);
 if(mem.length){
  const c=mk('div','wkcard');c.appendChild(mk('h3',null,'On this day'));
  mem.slice(0,5).forEach(x=>c.appendChild(mk('p',null,relLabel(x.years)+': '+fmt(H(x.e))+' / 15'+(x.e.note?' \u00b7 '+x.e.note.slice(0,60):''))));
  box.appendChild(c);
 }
}

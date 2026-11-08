import {$,parse,today} from './util.js';
import {E,META,saveMeta} from './state.js';
import {mkEl,msgCard} from './insights-ui.js';

/* achievements */
export const ROM=['I','II','III','IV','V'];
export const dfmt=k=>parse(k).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
export function achSync(){
 if(typeof DayRateAchievements==='undefined')return [];
 const td=today(),r=DayRateAchievements.evaluate(E,td,{bday:META.bday});
 const first=!META.achInit,from=first?0:(META.achV||1);
 META.ach=META.ach||{};META.achNew=META.achNew||[];
 const fresh=[];
 r.forEach(a=>{
  a.multi=a.tiers.length>1;
  a.tiers.forEach(t=>{
   const key=a.id+'#'+t.i;
   t.label=a.multi?a.name+' '+ROM[t.i]:a.name;
   if(t.date&&!META.ach[key]){META.ach[key]=t.date;/* first run, or an achievement added since the last sync that was earned before today: backfill quietly */if(!(first||((a.v||1)>from&&t.date<td))){META.achNew.push(key);fresh.push({key,title:t.label,desc:t.desc,date:t.date,level:t.i+1,levels:a.tiers.length})}}
   t.date=META.ach[key]||null;
   t.isNew=META.achNew.indexOf(key)>=0;
  });
  a.next=a.tiers.find(t=>!t.date)||null;
 });
 META.achInit=true;META.achV=DayRateAchievements.CFG.v||1;saveMeta();
 achSync.last=r;
 pip();
 return fresh;
}
export function pip(){const p=$('#achPip');if(p)p.hidden=!(META.achNew&&META.achNew.length)}
export let achF='all';
$('#achF').onclick=e=>{const b=e.target.closest('button');if(!b)return;achF=b.dataset.f;renderAch(true)};
export function renderAch(keep){
 const body=$('#achBody');body.innerHTML='';
 if(typeof DayRateAchievements==='undefined'){body.appendChild(msgCard('Achievements could not load','Close and reopen the app to refresh it. Your ratings are safe.'));return}
 let r;try{achSync();r=achSync.last}catch(e){body.appendChild(msgCard('Achievements hit a problem','Your ratings are safe. Try reopening the app.'));return}
 [...$('#achF').children].forEach(b=>{const on=b.dataset.f===achF;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
 const all=r.reduce((n,a)=>n+a.tiers.length,0),got=r.reduce((n,a)=>n+a.tiers.filter(t=>t.date).length,0);
 $('#achSub').textContent=got+' of '+all+' milestones earned \u00b7 long-term, so most take months';
 if(!keep&&achF==='all'){
  const rec=[];r.forEach(a=>a.tiers.forEach(t=>{if(t.date)rec.push({t,a})}));
  rec.sort((x,y)=>x.t.date<y.t.date?1:x.t.date>y.t.date?-1:0);
  if(rec.length){
   body.appendChild(mkEl('h3','grp','Latest'));
   rec.slice(0,3).forEach(x=>{const c=mkEl('div','card ach');const h=mkEl('h2',null,x.t.label+' ');if(x.t.isNew)h.appendChild(mkEl('span','chip new','New'));c.appendChild(h);c.appendChild(mkEl('p',null,x.t.desc));c.appendChild(mkEl('p','meta','Earned '+dfmt(x.t.date)));body.appendChild(c)});
  }
 }
 DayRateAchievements.GROUPS.forEach(g=>{
  const items=r.filter(a=>a.group===g[0]).filter(a=>achF==='all'||(achF==='earned'?a.tiers.some(t=>t.date):!!a.next));
  if(!items.length)return;
  body.appendChild(mkEl('h3','grp',g[1]));
  items.forEach(a=>{
   const earned=a.tiers.filter(t=>t.date),c=mkEl('div','card ach'+(earned.length?'':' lock'));
   const h=mkEl('h2',null,a.name+' ');
   if(a.multi)h.appendChild(mkEl('span','chip'+(a.next?'':' ok'),a.next?'Level '+(a.next.i+1)+' of '+a.tiers.length:'All '+a.tiers.length+' levels'));
   else if(!a.next)h.appendChild(mkEl('span','chip ok','Earned'));
   if(a.tiers.some(t=>t.isNew))h.appendChild(mkEl('span','chip new','New'));
   c.appendChild(h);
   if(a.next){
    c.appendChild(mkEl('p',null,a.next.desc));
    if(a.next.need>1){
     const tr=mkEl('div','track');tr.setAttribute('role','progressbar');tr.setAttribute('aria-valuemin','0');tr.setAttribute('aria-valuemax',a.next.need);tr.setAttribute('aria-valuenow',Math.min(a.have,a.next.need));
     const f=mkEl('div','fill');f.style.width=Math.min(100,a.have/a.next.need*100)+'%';tr.appendChild(f);c.appendChild(tr);
     c.appendChild(mkEl('div','prog',Math.min(a.have,a.next.need)+' of '+a.next.need));
    }
   }
   earned.forEach(t=>{const row=mkEl('div','earned');row.appendChild(mkEl('span',null,(a.multi?ROM[t.i]+' \u00b7 ':'')+t.desc));row.appendChild(mkEl('span',null,dfmt(t.date)));c.appendChild(row)});
   body.appendChild(c);
  });
 });
 if(!body.children.length)body.appendChild(msgCard('Nothing here yet',achF==='earned'?'Your first milestone will show up here.':'Everything in view is complete.'));
 if(!keep&&META.achNew&&META.achNew.length){META.achNew=[];saveMeta();pip()}
}


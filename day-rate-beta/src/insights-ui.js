import {$,parse,today} from './util.js';
import {E,H,META,col,paint,saveMeta} from './state.js';
import {show} from './nav.js';
import {st} from './rate.js';
import {addD,goalStatsCard,rng,w1} from './result.js';
import {home} from './history.js';

/* insights UI: all numbers come from insights.js; this block only draws them */
export let insTab='over',insPer=7;const insMore={obs:false,dis:false},INS_LIMIT=4;
export const mkEl=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
export const n1=v=>v==null?'\u2013':(Math.round(v*10)/10).toFixed(1);
export const sg=v=>v==null?'\u2013':Math.abs(v)<.05?'0.0':(v>0?'+':'\u2212')+n1(Math.abs(v));
export const rate=v=>'rgb('+col((v-1)/9)+')';
export function insData(){return DayRateInsights.analyze(E,today(),{period:insPer,score:r=>E[r.date]?H(E[r.date])/100:null})}
$('#insTabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;insTab=b.dataset.t;renderInsights();$('#vins .pane').scrollTop=0};
$('#insPer').onclick=e=>{const b=e.target.closest('button');if(!b)return;insPer=+b.dataset.p;renderInsights()};
export function msgCard(title,text,extra){const c=mkEl('div','card');c.appendChild(mkEl('h2',null,title));c.appendChild(mkEl('p',null,text));if(extra)c.appendChild(extra);return c}
export function spark(series){
 const L=series.length,X=i=>L>1?i*100/(L-1):50,Y=v=>28-(v-1)/9*26;
 let g='',run=[];
 const flush=()=>{if(run.length>1)g+='<polyline points="'+run.join(' ')+'"/>';else if(run.length===1){const[x,y]=run[0].split(',');g+='<polyline points="'+x+','+y+' '+(+x+.01)+','+y+'"/>'}run=[]};
 series.forEach((p,i)=>{if(p.v==null)flush();else run.push(X(i).toFixed(1)+','+Y(p.v).toFixed(1))});flush();
 const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
 s.setAttribute('viewBox','0 0 100 30');s.setAttribute('preserveAspectRatio','none');s.setAttribute('aria-hidden','true');s.innerHTML=g;return s;
}
export function chartEl(ch){
 if(ch.type==='compare'){
  const g=mkEl('div','cmp');['',...ch.heads].forEach(t=>g.appendChild(mkEl('span','h',t)));
  ch.rows.forEach(r=>{g.appendChild(mkEl('span',null,r.label));g.appendChild(mkEl('b',null,n1(r.a)));g.appendChild(mkEl('span',null,n1(r.b)));g.appendChild(mkEl('span',null,sg(r.delta)))});
  return g;
 }
 if(ch.type==='bars'||ch.type==='corr'){
  const w=mkEl('div');
  ch.rows.forEach(r=>{
   const row=mkEl('div','brow');row.appendChild(mkEl('span',null,r.label));
   const tr=mkEl('div','track'+(ch.type==='corr'?' corr':'')),f=mkEl('div','fill');
   if(ch.type==='corr'){if(r.r!=null){const wd=Math.min(1,Math.abs(r.r))*50;f.style.width=wd+'%';f.style.left=r.r>=0?'50%':(50-wd)+'%'}}
   else f.style.width=Math.max(0,Math.min(100,(r.value||0)/ch.max*100))+'%';
   tr.appendChild(f);row.appendChild(mkEl('span','tx',r.text));row.appendChild(tr);w.appendChild(row);
  });
  return w;
 }
 if(ch.type==='dist'){
  const w=mkEl('div','dist'),mx=Math.max(...ch.rows.map(r=>r.n));
  ch.rows.forEach(r=>{
   const top=mkEl('div','dt',r.label);top.appendChild(mkEl('span',null,r.n+(r.n===1?' day':' days')+' ('+r.pct+'%)'));
   const tr=mkEl('div','track'),f=mkEl('div','fill');f.style.width=(r.n/mx*100)+'%';tr.appendChild(f);
   w.appendChild(top);w.appendChild(tr);w.appendChild(mkEl('div','d',r.desc));
  });
  return w;
 }
 if(ch.type==='days'){
  const w=mkEl('div','dd');
  ch.rows.forEach(r=>{
   const d=mkEl('div');d.appendChild(mkEl('b',null,r.tag));d.appendChild(mkEl('span',null,r.label));
   d.appendChild(mkEl('span',null,'Mood '+r.m+', productivity '+r.p+', connection '+r.c));w.appendChild(d);
  });
  return w;
 }
 if(ch.type==='weekday'){
  const W=340,Hh=150,bw=(W-12)/7;let g='<line class="gl" x1="6" x2="334" y1="108" y2="108"/>';
  ch.rows.forEach((r,i)=>{
   const x=6+i*bw+bw*.15,w=bw*.7;
   if(r.value!=null){const hh=r.value/10*90,y=108-hh;
    g+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+hh.toFixed(1)+'" rx="4" fill="'+rate(r.value)+'" opacity="'+(r.solid?1:.35)+'" stroke="var(--line)" stroke-width="1"/>';
    if(r.solid)g+='<text class="v" x="'+(x+w/2).toFixed(1)+'" y="'+(y-4).toFixed(1)+'" text-anchor="middle">'+n1(r.value)+'</text>';
   }
   g+='<text x="'+(x+w/2).toFixed(1)+'" y="124" text-anchor="middle">'+r.label+'</text><text x="'+(x+w/2).toFixed(1)+'" y="137" text-anchor="middle">'+(r.n?'n='+r.n:'')+'</text>';
  });
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
  s.setAttribute('class','chart wk');s.setAttribute('viewBox','0 0 340 '+Hh);s.setAttribute('role','img');
  s.setAttribute('aria-label','Average overall rating by weekday: '+ch.rows.filter(r=>r.value!=null).map(r=>r.label+' '+n1(r.value)+(r.solid?'':' (too few days)')).join(', '));
  s.innerHTML=g;return s;
 }
 return null;
}
export function insCard(i){
 const c=mkEl('div','card ins');c.id='ins-'+i.id;
 const h=mkEl('h2',null,i.title);if(i.prelim)h.appendChild(mkEl('span','chip','Preliminary'));c.appendChild(h);
 c.appendChild(mkEl('p','find',i.finding));
 (i.lines||[]).forEach(l=>c.appendChild(mkEl('p',null,l)));
 if(i.chart){const ch=chartEl(i.chart);if(ch)c.appendChild(ch)}
 c.appendChild(mkEl('div','meta',[i.period,i.nLabel].filter(Boolean).join(' \u00b7 ')));
 if(i.why){const d=mkEl('details');d.appendChild(mkEl('summary',null,'Why this matters'));d.appendChild(mkEl('p',null,i.why));c.appendChild(d)}
 if(i.actionId){
  const t=mkEl('div','try');t.appendChild(mkEl('p',null,'Optional experiment: '+i.actionText));
  const b=mkEl('button','btn','See experiment');b.onclick=()=>{insTab='act';renderInsights();$('#vins .pane').scrollTop=0};t.appendChild(b);c.appendChild(t);
 }
 return c;
}
export const EXPLEN=7,EXPDIM={social:'c',priority:'p',enjoy:'m'},ovr=e=>(e.m+e.p+e.c)/3;
export const expRows=(from,n)=>{const a=[];for(let i=0;i<n;i++){const e=E[addD(from,i)];if(e)a.push(e)}return a};
export const expDay=x=>Math.min(EXPLEN,Math.round((parse(today())-parse(x.start))/864e5)+1);
export function expResult(x){
 const bs=expRows(addD(x.start,-EXPLEN),EXPLEN),as=expRows(x.start,EXPLEN),r={id:x.id,title:x.title,kind:x.kind,start:x.start,nb:bs.length,na:as.length};
 if(bs.length<3||as.length<3){r.head='Not enough rated days to compare.';r.cav=['Experiments need at least 3 rated days in each week. You had '+bs.length+' before and '+as.length+' during.'];return r}
 const avg=(a,f)=>a.reduce((t,e)=>t+f(e),0)/a.length,pd=EXPDIM[x.kind]||'o',NM={m:'Mood',p:'Productivity',c:'Connection',o:'Overall'};
 r.rows=['m','p','c','o'].map(d=>{const f=d==='o'?ovr:e=>e[d],b=avg(bs,f),a=avg(as,f);return [NM[d],b,a,a-b,d===pd]});
 const dl=r.rows.find(z=>z[4])[3],nm=NM[pd].toLowerCase()+(pd==='o'?' rating':''),all=Object.values(E).map(ovr);
 const mu=all.reduce((t,v)=>t+v,0)/all.length,sdv=all.length>=7?Math.sqrt(all.reduce((t,v)=>t+(v-mu)*(v-mu),0)/(all.length-1)):null;
 r.head=Math.abs(dl)>=.5?'Your '+nm+' averaged '+w1(Math.abs(dl))+' '+(dl>0?'higher':'lower')+' during the experiment.':'Your '+nm+' stayed about the same during the experiment.';
 r.cav=['This compares one week with the week before. It cannot show that the experiment caused any change, and weeks differ for many reasons.'];
 if(sdv!=null&&Math.abs(dl)<sdv)r.cav.push('A change this size is within your normal day-to-day ups and downs.');
 r.cav.push('Rated days: '+bs.length+' before, '+as.length+' during.'+(bs.length<5||as.length<5?' Few rated days make this less reliable.':''));
 return r;
}
export function expSync(){
 const x=META.exp;if(!x||today()<=addD(x.start,EXPLEN-1))return;
 META.expDone=[Object.assign(expResult(x),{new:true})].concat(META.expDone||[]).slice(0,10);META.exp=null;saveMeta();
}
export function expActiveCard(){
 const x=META.exp,n=expDay(x),got=expRows(x.start,EXPLEN).length,c=mkEl('div','card ins'),h=mkEl('h2',null,x.title);
 h.appendChild(mkEl('span','chip','In progress'));c.appendChild(h);c.appendChild(mkEl('p','find',x.text));
 const tr=mkEl('div','track'),f=mkEl('div','fill');f.style.width=(n/EXPLEN*100)+'%';tr.appendChild(f);c.appendChild(tr);
 c.appendChild(mkEl('div','meta','Day '+n+' of '+EXPLEN+' \u00b7 '+got+(got===1?' day':' days')+' rated \u00b7 ends '+rng(addD(x.start,EXPLEN-1))));
 c.appendChild(mkEl('p','fine','Rate each day as usual. After the last day you will get a before-and-after comparison with the week before.'));
 const b=mkEl('button','btn','Stop experiment');b.onclick=()=>{META.exp=null;saveMeta();renderInsights()};c.appendChild(b);
 return c;
}
export function expResultCard(x){
 const c=mkEl('div','card ins'),h=mkEl('h2',null,x.title);h.appendChild(mkEl('span','chip','Result'));c.appendChild(h);c.appendChild(mkEl('p','find',x.head));
 if(x.rows){const g=mkEl('div','expt');['','Before','During','Change'].forEach(t=>g.appendChild(mkEl('span','h',t)));
  x.rows.forEach(r=>[r[0],w1(r[1]),w1(r[2]),(r[3]>0?'+':r[3]<0?'\u2212':'')+w1(Math.abs(r[3]))].forEach(t=>g.appendChild(mkEl('span',r[4]?'pri':null,t))));c.appendChild(g)}
 x.cav.forEach(t=>c.appendChild(mkEl('p','fine',t)));
 c.appendChild(mkEl('div','meta',rng(x.start)+' to '+rng(addD(x.start,EXPLEN-1))));
 const b=mkEl('button','btn','Got it');b.onclick=()=>{x.new=false;saveMeta();renderInsights()};c.appendChild(b);
 return c;
}
export function expCard(e){
 const c=mkEl('div','card ins');const h=mkEl('h2',null,e.title);h.appendChild(mkEl('span','chip',e.starter?'Starter experiment':'Experiment'));c.appendChild(h);
 c.appendChild(mkEl('p','find',e.text));
 c.appendChild(mkEl('p',null,'Why this one: '+e.because));
 c.appendChild(mkEl('div','meta',e.when+' \u00b7 optional'));
 if(!META.exp){const b=mkEl('button','btn','Start 7-day experiment');b.onclick=()=>{META.exp={id:e.id,kind:e.kind,title:e.title,text:e.text,start:today()};saveMeta();renderInsights()};c.appendChild(b)}
 return c;
}
export function cardList(body,items,key){
 const show=insMore[key]?items:items.slice(0,INS_LIMIT);
 show.forEach(i=>body.appendChild(insCard(i)));
 if(items.length>INS_LIMIT){
  const b=mkEl('button','btn more',insMore[key]?'Show fewer':'Show '+(items.length-INS_LIMIT)+' more');
  b.onclick=()=>{insMore[key]=!insMore[key];renderInsights()};body.appendChild(b);
 }
}
export function renderOver(body,r){
 const o=r.overview,sub=mkEl('p','sum',o.label+': '+o.daysRated+' of '+o.len+' days rated');
 if(o.prelim){sub.appendChild(document.createTextNode(' '));sub.appendChild(mkEl('span','chip','Preliminary'))}
 body.appendChild(sub);
 body.appendChild(mkEl('p','lead',o.headline||'Not enough ratings in this period yet. Three rated days are needed to show an average.'));
 const tiles=mkEl('div','tiles');
 o.tiles.forEach(t=>{
  const el=mkEl('div','tile'+(t.mean==null?' none':''));
  if(t.mean!=null)paint(el,(t.mean-1)/9);
  el.appendChild(mkEl('div','nm',t.name));
  el.appendChild(mkEl('div','avg',n1(t.mean)));
  el.appendChild(mkEl('div','chg',t.mean==null?'Needs 3 rated days':t.delta==null?'No earlier period to compare':t.trend==='same'?'About the same as before ('+n1(t.prevMean)+')':(t.delta>0?'Up ':'Down ')+n1(Math.abs(t.delta))+' from '+n1(t.prevMean)));
  el.appendChild(spark(t.series));
  el.appendChild(mkEl('div','sub',t.n+(t.n===1?' rating':' ratings')+' in '+o.len+' days'));
  tiles.appendChild(el);
 });
 body.appendChild(tiles);
 const all=r.observe.concat(r.discover),hl=r.highlights.map(id=>all.find(i=>i.id===id)).filter(Boolean);
 if(hl.length){
  const hh=mkEl('h2',null,'Worth a look');hh.style.cssText='font-size:1.05rem;margin:4px 0 8px';body.appendChild(hh);
  hl.forEach(i=>{
   const b=mkEl('button','hl');b.appendChild(mkEl('b',null,i.title));b.appendChild(mkEl('span',null,i.finding));
   b.onclick=()=>{insTab=i.layer==='observe'?'obs':'dis';renderInsights();const t=document.getElementById('ins-'+i.id);if(t)t.scrollIntoView({block:'start'})};
   body.appendChild(b);
  });
 }
 if(r.empty.discover)body.appendChild(msgCard('Patterns are on their way',r.empty.discover));
 body.appendChild(mkEl('p','fine','Insights compare you with your own history. They describe patterns, not causes.'));
}
export function renderInsights(){
 const body=$('#insBody');body.innerHTML='';
 const tabs=$('#insTabs'),per=$('#insPer');
 let r=null;
 if(typeof DayRateInsights==='undefined'){tabs.style.display=per.style.display='none';$('#insSub').textContent='';body.appendChild(msgCard('Insights could not load','Close and reopen the app to refresh it. Your ratings are safe.'));return}
 try{r=insData()}catch(e){tabs.style.display=per.style.display='none';body.appendChild(msgCard('Insights hit a problem','Your ratings are safe. Try reopening the app.'));return}
 const st=r.status;
 $('#insSub').textContent=st.total?st.total+(st.total===1?' day':' days')+' rated \u00b7 '+st.complete+' with all three ratings'+(st.ready&&r.endsOn&&r.endsOn!==today()?' \u00b7 windows end yesterday until you rate today':'')+(r.adjusted?' \u00b7 weekday-adjusted baselines':''):'No days rated yet';
 if(!st.ready){
  tabs.style.display=per.style.display='none';
  const tr=mkEl('div','track');tr.style.margin='0 0 10px';const f=mkEl('div','fill');f.style.width=Math.min(100,st.total/st.needTotal*100)+'%';tr.appendChild(f);
  const go=mkEl('button','btn','Rate today');go.onclick=home;
  const c=msgCard(st.total+' of '+st.needTotal+' days rated',r.empty.all);c.insertBefore(tr,c.children[1]);c.appendChild(go);body.appendChild(c);return;
 }
 tabs.style.display='flex';
 [...tabs.children].forEach(b=>{const on=b.dataset.t===insTab;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
 per.style.display=(insTab==='over'||insTab==='obs')?'flex':'none';
 [...per.children].forEach(b=>{const on=+b.dataset.p===insPer;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
 if(insTab==='over')renderOver(body,r);
 else if(insTab==='obs'){
  body.appendChild(mkEl('p','fine','What happened in your ratings.'));
  if(r.observe.length)cardList(body,r.observe,'obs');else body.appendChild(msgCard('Not enough in this period','Rate a few more days in this period to see comparisons.'));
  body.appendChild(goalStatsCard(insPer));
 }else if(insTab==='dis'){
  body.appendChild(mkEl('p','fine','Patterns across all your history. These are observations from your own ratings, not proof of cause.'));
  if(r.empty.discover){
   const tr=mkEl('div','track');tr.style.margin='0 0 10px';const f=mkEl('div','fill');f.style.width=Math.min(100,st.complete/st.needPairs*100)+'%';tr.appendChild(f);
   const c=msgCard(st.complete+' of '+st.needPairs+' complete days',r.empty.discover);c.insertBefore(tr,c.children[1]);body.appendChild(c);
  }else cardList(body,r.discover,'dis');
 }else{
  body.appendChild(mkEl('p','fine','Small experiments, based on your ratings. Ideas to explore, not advice or guaranteed ways to improve mood. Skip any that do not suit you.'));
  expSync();
  (META.expDone||[]).filter(x=>x.new).forEach(x=>body.appendChild(expResultCard(x)));
  if(META.exp)body.appendChild(expActiveCard());
  r.act.filter(e=>!META.exp||e.id!==META.exp.id).forEach(e=>body.appendChild(expCard(e)));
  const past=(META.expDone||[]).filter(x=>!x.new).slice(0,5);
  if(past.length)body.appendChild(mkEl('p','fine','Past experiments: '+past.map(x=>x.title+' ('+rng(x.start)+')').join(' \u00b7 ')));
 }
}


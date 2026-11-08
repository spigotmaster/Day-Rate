import {$,parse,today} from './util.js';
import {E,H,META,col,fmt,tOf} from './state.js';
import {TAGS} from './rate.js';
import {w1} from './result.js';
import {mkEl} from './insights-ui.js';
import {ROM} from './ach-ui.js';
import {renderHist,setHistMode,setSel} from './history.js';
import {periodBounds,recap,searchDays,shiftAnchor} from './review.js';

const TAGLB=Object.fromEntries(TAGS);
const WD=['Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays','Sundays'];
const DIMS=[['m','Mood'],['p','Productivity'],['c','Connection']];
const sdate=k=>parse(k).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'});

/* ---------- search ---------- */
const S={text:'',tags:[],dim:'any',band:'any',range:'all',shown:30};
let built=false,timer=0;
function field(text,opts,key,onchange){
 const l=mkEl('label','fsel',text),s=document.createElement('select');
 opts.forEach(o=>{const x=document.createElement('option');x.value=o[0];x.textContent=o[1];s.appendChild(x)});
 s.value=S[key];s.onchange=()=>{S[key]=s.value;S.shown=30;onchange()};l.appendChild(s);return l;
}
function marked(note,words){
 const f=document.createDocumentFragment(),low=note.toLowerCase(),r=[];
 words.forEach(w=>{let i=low.indexOf(w);while(i>=0){r.push([i,i+w.length]);i=low.indexOf(w,i+w.length)}});
 r.sort((a,b)=>a[0]-b[0]);const m=[];
 r.forEach(x=>{const p=m[m.length-1];if(p&&x[0]<=p[1])p[1]=Math.max(p[1],x[1]);else m.push(x.slice())});
 let at=0;m.forEach(([a,b])=>{if(a>at)f.appendChild(document.createTextNode(note.slice(at,a)));f.appendChild(mkEl('mark',null,note.slice(a,b)));at=b});
 if(at<note.length)f.appendChild(document.createTextNode(note.slice(at)));return f;
}
function updateSearch(){
 const words=S.text.toLowerCase().split(/\s+/).filter(Boolean),t=today();
 const keys=searchDays(E,{...S,today:t,labels:TAGLB}),res=$('#srres');
 res.replaceChildren();
 const any=Object.keys(E).length;
 $('#srcount').textContent=!any?'No days yet. Rate a day and it will show up here.':keys.length?keys.length+(keys.length===1?' day found':' days found'):'No days match. Try fewer words or clear a filter.';
 keys.slice(0,S.shown).forEach(k=>{
  const e=E[k],b=mkEl('button','srrow');b.type='button';
  b.setAttribute('aria-label',sdate(k)+', score '+fmt(H(e))+'. Open this day.');
  const h=mkEl('div','sh'),d=mkEl('span',null,sdate(k)),sc=mkEl('span',null,fmt(H(e))+' / 15');
  const dot=mkEl('i','sw');dot.style.background='rgb('+col(tOf(H(e)))+')';d.prepend(dot);h.append(d,sc);b.appendChild(h);
  b.appendChild(mkEl('div','sr3','Mood '+e.m+' \u00b7 Productivity '+e.p+' \u00b7 Connection '+e.c+((e.tags||[]).length?' \u00b7 '+e.tags.map(x=>TAGLB[x]||x).join(', '):'')));
  if(e.note){const n=mkEl('div','sn');n.appendChild(marked(e.note,words));b.appendChild(n)}
  b.onclick=()=>{setSel(k);setHistMode('wk');renderHist()};
  res.appendChild(b);
 });
 if(keys.length>S.shown){const m=mkEl('button','btn','Show more');m.type='button';m.onclick=()=>{S.shown+=30;updateSearch()};res.appendChild(m)}
}
function buildSearch(box){
 box.replaceChildren();
 const q=document.createElement('input');q.type='search';q.id='srq';q.className='noteIn';q.placeholder='Search notes and tags';q.autocomplete='off';q.setAttribute('aria-label','Search notes and tags');q.value=S.text;
 q.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{S.text=q.value;S.shown=30;updateSearch()},150)};
 box.appendChild(q);
 const tg=mkEl('div','tags');tg.setAttribute('role','group');tg.setAttribute('aria-label','Only days with these tags');
 TAGS.forEach(([id,name])=>{const b=mkEl('button',null,name);b.type='button';b.setAttribute('aria-pressed',S.tags.includes(id));
  b.onclick=()=>{S.tags=S.tags.includes(id)?S.tags.filter(x=>x!==id):S.tags.concat(id);b.setAttribute('aria-pressed',S.tags.includes(id));S.shown=30;updateSearch()};tg.appendChild(b)});
 box.appendChild(tg);
 const row=mkEl('div','frow');
 row.append(field('Rating',[['any','Any'],['high','8 or more'],['mid','5 to 7'],['low','4 or less']],'band',updateSearch),
  field('In',[['any','Any category'],...DIMS],'dim',updateSearch),
  field('When',[['all','All time'],['30','Last 30 days'],['90','Last 90 days'],['365','Last year']],'range',updateSearch));
 box.appendChild(row);
 const c=mkEl('p','sum');c.id='srcount';c.setAttribute('aria-live','polite');box.appendChild(c);
 const r=mkEl('div');r.id='srres';box.appendChild(r);
}
export function renderSearch(){const box=$('#srw');if(!built){buildSearch(box);built=true}updateSearch()}

/* ---------- recap ---------- */
const R={kind:'month',anchor:null};
function achIn(a,z){
 try{
  const ev=DayRateAchievements.evaluate(E,today(),{bday:META.bday}),by={};ev.forEach(x=>{by[x.id]=x});
  const out=[];
  Object.entries(META.ach||{}).sort((p,q)=>p[1]<q[1]?-1:1).forEach(([key,d])=>{
   if(d<a||d>z)return;const[id,i]=key.split('#'),x=by[id];if(x)out.push(x.tiers.length>1?x.name+' '+ROM[+i]:x.name);
  });
  return out;
 }catch(e){return []}
}
function title(b){
 const d=parse(b.start);
 return b.kind==='month'?d.toLocaleDateString(undefined,{month:'long',year:'numeric'}):String(d.getFullYear());
}
function monthBars(vals){
 const NS='http://www.w3.org/2000/svg',s=document.createElementNS(NS,'svg');
 s.setAttribute('viewBox','0 0 240 84');s.setAttribute('class','mbars');s.setAttribute('role','img');
 const ok=vals.map((v,i)=>v==null?null:new Date(2000,i,1).toLocaleDateString(undefined,{month:'short'})+' '+w1(v)).filter(Boolean);
 s.setAttribute('aria-label','Average rating by month: '+(ok.join(', ')||'not enough data'));
 vals.forEach((v,i)=>{
  const x=i*20+3,r=document.createElementNS(NS,'rect');
  const h=v==null?3:Math.max(3,(v-1)/9*60);r.setAttribute('x',x);r.setAttribute('width',14);r.setAttribute('y',64-h);r.setAttribute('height',h);r.setAttribute('rx',3);
  r.style.fill=v==null?'var(--line)':'rgb('+col((v-1)/9)+')';s.appendChild(r);
  const t=document.createElementNS(NS,'text');t.setAttribute('x',x+7);t.setAttribute('y',78);t.setAttribute('text-anchor','middle');t.style.fontSize='9px';t.style.fill='var(--mut)';
  t.textContent=new Date(2000,i,1).toLocaleDateString(undefined,{month:'narrow'});s.appendChild(t);
 });
 return s;
}
function shareImage(b,r){
 const W=1080,Hh=1350,c=document.createElement('canvas');c.width=W;c.height=Hh;const x=c.getContext('2d');
 const g=x.createLinearGradient(0,0,W,Hh);g.addColorStop(0,'#2e2a6e');g.addColorStop(.6,'#1f7a8c');g.addColorStop(1,'#e8a23a');x.fillStyle=g;x.fillRect(0,0,W,Hh);
 x.fillStyle='rgba(255,255,255,.08)';x.beginPath();x.arc(W-120,160,260,0,7);x.fill();
 const F='system-ui,-apple-system,"Segoe UI",sans-serif';x.fillStyle='#fff';x.textAlign='left';
 x.font='600 40px '+F;x.globalAlpha=.85;x.fillText('Day Rate',80,120);x.globalAlpha=1;
 x.font='800 110px '+F;x.fillText(title(b),80,330);
 x.font='500 44px '+F;x.globalAlpha=.9;x.fillText(r.n+' of '+b.span+' days rated'+(b.partial?' so far':''),80,400);x.globalAlpha=1;
 DIMS.forEach(([d,nm],i)=>{
  const cx=80+i*320;x.font='800 150px '+F;x.fillText(w1(r.avg[d]),cx,700);
  x.font='600 40px '+F;x.fillText(nm,cx,760);
  if(r.delta){const v=r.delta[d];x.globalAlpha=.85;x.font='500 36px '+F;x.fillText(Math.abs(v)<.3?'steady':(v>0?'up ':'down ')+w1(Math.abs(v)),cx,812);x.globalAlpha=1}
 });
 x.font='600 46px '+F;let y=980;
 if(r.best){x.fillText('Best day: '+parse(r.best.k).toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'}),80,y);y+=74}
 if(r.bestWeekday){x.fillText('Best weekday: '+WD[r.bestWeekday.wd],80,y);y+=74}
 if(r.longestRun>1){x.fillText('Longest run: '+r.longestRun+' days in a row',80,y)}
 x.globalAlpha=.8;x.font='500 36px '+F;x.fillText('Ratings out of 10. Made on my device.',80,1270);
 c.toBlob(async blob=>{
  if(!blob)return;const name='day-rate-'+b.anchor+'.png',f=new File([blob],name,{type:'image/png'});
  try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:'Day Rate '+title(b)});return}}catch(e){if(e&&e.name==='AbortError')return}
  const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);
 },'image/png');
}
export function renderRecap(){
 const box=$('#rcw'),t=today();box.replaceChildren();
 if(!R.anchor)R.anchor=R.kind==='month'?t.slice(0,7):t.slice(0,4);
 const seg=mkEl('div','seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Recap length');
 [['month','Month'],['year','Year']].forEach(([k,n])=>{const b=mkEl('button',null,n);b.type='button';b.classList.toggle('on',R.kind===k);b.setAttribute('aria-pressed',R.kind===k);
  b.onclick=()=>{R.kind=k;R.anchor=null;renderRecap()};seg.appendChild(b)});
 box.appendChild(seg);
 const b=periodBounds(R.kind,R.anchor,t),first=Object.keys(E).sort()[0];
 const nav=mkEl('div','rcnav'),prev=mkEl('button',null,'\u2039'),next=mkEl('button',null,'\u203a'),h=mkEl('h2',null,title(b));
 prev.type=next.type='button';prev.setAttribute('aria-label','Previous '+R.kind);next.setAttribute('aria-label','Next '+R.kind);
 const pb=periodBounds(R.kind,shiftAnchor(R.kind,R.anchor,-1),t);prev.disabled=!first||!pb||pb.fullEnd<first;
 next.disabled=!periodBounds(R.kind,shiftAnchor(R.kind,R.anchor,1),t);
 prev.onclick=()=>{R.anchor=shiftAnchor(R.kind,R.anchor,-1);renderRecap()};next.onclick=()=>{R.anchor=shiftAnchor(R.kind,R.anchor,1);renderRecap()};
 nav.append(prev,h,next);box.appendChild(nav);
 const r=recap(E,b),need=R.kind==='month'?5:14,card=mkEl('div','wkcard');
 card.appendChild(mkEl('h3',null,(b.partial?(R.kind==='month'?'Month':'Year')+' so far':(R.kind==='month'?'Month':'Year')+' recap')+' \u00b7 '+r.n+' of '+b.span+(b.span===1?' day':' days')+' rated'));
 const add=x=>{card.appendChild(mkEl('p',null,x))};
 if(r.n<need){add('Rate at least '+need+' days in a '+R.kind+' to get a recap.');box.appendChild(card);return}
 const tri=mkEl('div','tri');
 DIMS.forEach(([d,nm])=>{const c=document.createElement('div'),v=r.delta?r.delta[d]:null;
  c.appendChild(mkEl('b',null,w1(r.avg[d])));c.appendChild(mkEl('small',null,nm+(v==null?'':Math.abs(v)<.3?' \u00b7 steady':' \u00b7 '+(v>0?'up ':'down ')+w1(Math.abs(v)))));tri.appendChild(c)});
 card.appendChild(tri);
 if(r.months){const wrap=mkEl('div');wrap.appendChild(monthBars(r.months));card.appendChild(wrap)}
 add('Best day: '+sdate(r.best.k)+'. Lowest day: '+sdate(r.worst.k)+'.');
 if(r.best.note)add('Best day note: '+r.best.note);
 if(r.bestWeekday)add('Best weekday: '+WD[r.bestWeekday.wd]+(r.worstWeekday?'. Toughest: '+WD[r.worstWeekday.wd]:'')+'.');
 if(r.longestRun>1)add('Longest run of rated days: '+r.longestRun+'.');
 if(r.topTags.length)add('Most tagged: '+r.topTags.map(x=>(TAGLB[x.id]||x.id)+' ('+x.n+')').join(', ')+'.');
 const ac=achIn(b.start,b.end);
 if(ac.length)add('Achievements earned: '+ac.slice(0,5).join(', ')+(ac.length>5?' and '+(ac.length-5)+' more':'')+'.');
 if(r.delta)add('Changes compare with '+(b.partial?'the same days of the ':'the ')+'previous '+R.kind+'.');
 const sv=mkEl('button','btn','Save as image');sv.type='button';sv.onclick=()=>shareImage(b,r);card.appendChild(sv);
 card.appendChild(mkEl('p','fine','The image shows averages and your best day only. Notes are never included.'));
 box.appendChild(card);
}

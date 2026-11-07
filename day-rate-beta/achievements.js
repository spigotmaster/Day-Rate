/* Day Rate achievements engine.
   Pure functions only: no DOM, no storage, no globals. Works in the browser and in Node (tests).
   evaluate(entries, todayStr) -> [{id, group, name, have, tiers:[{i, need, desc, date}], next}]
   entries : { 'YYYY-MM-DD': {m,p,c,...} }   todayStr: the app's today() (respects the 4am rollover)
   Everything uses RAW ratings (1-10), never the relative 0-15 score, so thresholds stay stable
   as your all-time range changes. "Average" of a day = (mood + productivity + connection) / 3.
   Each achievement produces a "track": [[date, value], ...] where value never decreases.
   A tier is earned on the first date the value reaches its target. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.DayRateAchievements=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';

const EPS=1e-9;
const dnum=s=>{const[a,b,c]=s.split('-').map(Number);return Math.round(Date.UTC(a,b-1,c)/864e5)};
const dstr=n=>new Date(n*864e5).toISOString().slice(0,10);
const mIdx=k=>{const[y,m]=k.split('-').map(Number);return y*12+m-1};
const lastDay=k=>{const[y,m]=k.split('-').map(Number);return dstr(Math.round(Date.UTC(y,m,0)/864e5))};
const dy=n=>n+(n===1?' day':' days');
const mo=n=>n+(n===1?' month':' months');
const wk=n=>n+(n===1?' week':' weeks');
const avg=a=>a.reduce((s,x)=>s+x.a,0)/a.length;

function prep(entries){
 const out=[];
 for(const k of Object.keys(entries||{})){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(k))continue;
  const e=entries[k];
  if(!e||![e.m,e.p,e.c].every(v=>Number.isInteger(v)&&v>=1&&v<=10))continue;
  const n=dnum(k),s=e.m+e.p+e.c;
  out.push({d:k,n,m:e.m,p:e.p,c:e.c,s,a:s/3,wd:(n+3)%7,lo:Math.min(e.m,e.p,e.c),hi:Math.max(e.m,e.p,e.c)});
 }
 return out.sort((x,y)=>x.n-y.n);
}
function build(days,todayStr){
 const byN=new Map(),months=new Map();
 days.forEach(x=>{byN.set(x.n,x);const k=x.d.slice(0,7);if(!months.has(k))months.set(k,[]);months.get(k).push(x)});
 return {days,byN,months,keys:[...months.keys()].sort(),tk:todayStr.slice(0,7),todayN:dnum(todayStr)};
}

/* ---------- track builders ---------- */
const counter=(days,pred)=>{let n=0;const t=[];for(const x of days)if(pred(x)){n++;t.push([x.d,n])}return t};
function streak(days,step){
 let run=0,best=0,prev=null;const t=[];
 for(const x of days){
  const cons=!!prev&&x.n-prev.n===1;
  run=step(x,prev,run,cons);
  if(run>best){best=run;t.push([x.d,best])}
  prev=x;
 }
 return t;
}
function win(c,end,len,key,minN,useMin){
 let s=0,n=0,mn=99;
 for(let i=0;i<len;i++){const x=c.byN.get(end-i);if(x){s+=x[key];n++;if(x[key]<mn)mn=x[key]}}
 if(n<minN)return null;
 return useMin?mn:s/n;
}
const upswing=keys=>c=>{
 for(const x of c.days){
  if(keys.every(k=>{const a=win(c,x.n,14,k,10),b=win(c,x.n-14,14,k,10);return a!=null&&b!=null&&a-b>=0.5-EPS}))return [[x.d,1]];
 }
 return [];
};

/* weekday baselines, built only from days before the one being judged */
function wdState(){
 const s=Array(7).fill(0),n=Array(7).fill(0);
 return {
  add(x){s[x.wd]+=x.a;n[x.wd]++},
  info(minN){
   minN=minN||6;
   if(n.some(v=>v<minN))return null;
   const av=s.map((v,i)=>v/n[i]);let b=0,w=0;
   for(let i=1;i<7;i++){if(av[i]>av[b])b=i;if(av[i]<av[w])w=i}
   const mx=av[b],mn=av[w];
   if(av.filter(v=>Math.abs(v-mx)<EPS).length>1||av.filter(v=>Math.abs(v-mn)<EPS).length>1)return null;
   return {best:b,worst:w,spread:mx-mn};
  }
 };
}
const uniq=(arr,max)=>{
 const t=max?Math.max(...arr):Math.min(...arr);
 const i=arr.map((v,j)=>Math.abs(v-t)<EPS?j:-1).filter(j=>j>=0);
 return i.length===1?i[0]:-1;
};

/* complete calendar months with at least 15 rated days; prior = everything before the month */
function eachMonth(c,fn){
 let ps=0,pn=0;
 for(const k of c.keys){
  const arr=c.months.get(k);
  if(k<c.tk&&arr.length>=15)fn(k,arr,ps,pn);
  for(const x of arr){ps+=x.a;pn++}
 }
}
function monthRun(c,test){
 const t=[];let run=0,best=0,prev=null;
 eachMonth(c,(k,arr,ps,pn)=>{
  const info={k,arr,avg:avg(arr),min:Math.min(...arr.map(x=>x.s)),ps,pn,best:bestWd(arr)};
  const cons=!!prev&&mIdx(k)-mIdx(prev.k)===1;
  const r=test(info,cons?prev:null);
  run=r.ok?((cons&&run>0)?run+1:1):(r.anchor?1:0);
  if(run>best){best=run;t.push([lastDay(k),best])}
  prev=info;
 });
 return t;
}
function bestWd(arr){
 const s=Array(7).fill(0),n=Array(7).fill(0);
 arr.forEach(x=>{s[x.wd]+=x.a;n[x.wd]++});
 const av=s.map((v,i)=>n[i]>=2?v/n[i]:-1);
 const mx=Math.max(...av);
 if(mx<0)return null;
 const hits=av.map((v,i)=>Math.abs(v-mx)<EPS?i:-1).filter(i=>i>=0);
 return hits.length===1?hits[0]:null;
}
function pick(M,P,C){
 for(const a of M)for(const b of P)for(const d of C)if(a!==b&&b!==d&&a!==d)return true;
 return false;
}

/* ---------- the list ---------- */
const A=[];
const add=(id,g,name,desc,tiers,track)=>A.push({id,g,name,desc,tiers,track});

/* Highs */
add('driven','highs','Driven',n=>'Productivity of 8 or more on '+dy(n),[50,150,365],c=>counter(c.days,x=>x.p>=8));
add('bright','highs','Bright',n=>'Mood of 8 or more on '+dy(n),[50,150,365],c=>counter(c.days,x=>x.m>=8));
add('connected','highs','Connected',n=>'Connection of 8 or more on '+dy(n),[50,150,365],c=>counter(c.days,x=>x.c>=8));
add('triple_eight','highs','Triple Eight',()=>'All three ratings at 8 or more on the same day',[1],c=>counter(c.days,x=>x.lo>=8));
add('eight_eights','highs','Eight Eights',n=>'All three ratings at 8 or more on '+dy(n),[8,30,100],c=>counter(c.days,x=>x.lo>=8));
add('perfect_ten','highs','Perfect Ten',n=>'A rating of 10 on '+dy(n),[1,10,30],c=>counter(c.days,x=>x.hi===10));
add('perfect_day','highs','Perfect Day',n=>'All three ratings at 10 on '+dy(n),[1,5],c=>counter(c.days,x=>x.lo===10));

/* Streaks (consecutive calendar days) */
add('good_stretch','streaks','Good Stretch',n=>dy(n)+' in a row with every rating at 7 or more',[5,14,30],
 c=>streak(c.days,(x,p,r,cons)=>x.lo>=7?((cons&&r>0)?r+1:1):0));
add('on_a_roll','streaks','On a Roll',n=>dy(n)+' in a row with mood at 8 or more',[5,10,21],
 c=>streak(c.days,(x,p,r,cons)=>x.m>=8?((cons&&r>0)?r+1:1):0));
add('steady_climb','streaks','Steady Climb',n=>'Your day average rises '+dy(n)+' in a row',[5,8],
 c=>streak(c.days,(x,p,r,cons)=>(cons&&x.s>p.s)?r+1:0));

/* Growth */
add('upswing_m','growth','Upswing: Mood',()=>'Your 14-day mood average beats the 14 days before it by 0.5 or more',[1],upswing(['m']));
add('upswing_p','growth','Upswing: Productivity',()=>'Your 14-day productivity average beats the 14 days before it by 0.5 or more',[1],upswing(['p']));
add('upswing_c','growth','Upswing: Connection',()=>'Your 14-day connection average beats the 14 days before it by 0.5 or more',[1],upswing(['c']));
add('triple_climb','growth','Triple Climb',()=>'Mood, productivity and connection all rise 0.5 or more in the same 14-day window',[1],upswing(['m','p','c']));
add('new_peak','growth','New Peak',n=>'Your 30-day average beats every earlier 30-day window, '+n+(n===1?' time':' times')+' (needs 60 days of history, at least 30 days apart)',[1,3,6],c=>{
 const t=[];let max=-1,cnt=0,last=-1e9;const first=c.days.length?c.days[0].n:0;
 for(const x of c.days){
  const v=win(c,x.n,30,'a',24);if(v==null)continue;
  if(max>=0&&x.n-first>=59&&v>max+EPS&&x.n-last>=30){cnt++;last=x.n;t.push([x.d,cnt])}
  if(v>max)max=v;
 }
 return t;
});
add('raised_floor','growth','Raised the Floor',()=>'Your lowest rating in the last 14 days is higher than in the 14 days before',[1],c=>{
 for(const x of c.days){const a=win(c,x.n,14,'lo',10,true),b=win(c,x.n-14,14,'lo',10,true);if(a!=null&&b!=null&&a>b)return [[x.d,1]]}
 return [];
});
add('higher_baseline','growth','Higher Baseline',n=>'Your monthly average rises for '+mo(n)+' in a row',[3,5],
 c=>monthRun(c,(i,p)=>({ok:!!p&&i.avg>p.avg+EPS,anchor:true})));
add('long_haul','growth','Long Haul',n=>mo(n)+' in a row averaging above everything before them',[3,6,12],
 c=>monthRun(c,i=>({ok:i.pn>=30&&i.avg>i.ps/i.pn+EPS,anchor:false})));

/* Balance and variety */
add('even_keel','balance','Even Keel',n=>'All three ratings within 1 point of each other on '+dy(n),[14,50,150],c=>counter(c.days,x=>x.hi-x.lo<=1));
add('well_rounded','balance','Well Rounded',n=>'All three within 1 point and every one at 7 or more on '+dy(n),[10,40,100],c=>counter(c.days,x=>x.hi-x.lo<=1&&x.lo>=7));
add('monday_win','balance','Monday Win',n=>'All three ratings at 7 or more on '+n+(n===1?' Monday':' Mondays'),[4,12,26],c=>counter(c.days,x=>x.wd===0&&x.lo>=7));
add('every_weekday','balance','Every Weekday',n=>'Mood of 7 or more on at least '+dy(n)+' of every weekday',[5,15,30],c=>{
 const cnt=Array(7).fill(0),t=[];let best=0;
 for(const x of c.days){if(x.m>=7)cnt[x.wd]++;const mn=Math.min(...cnt);if(mn>best){best=mn;t.push([x.d,best])}}
 return t;
});
add('range_finder','balance','Range Finder',()=>'Every rating from 1 to 10 used at least once',[10],c=>{
 const seen=new Set(),t=[];
 for(const x of c.days){let ch=false;[x.m,x.p,x.c].forEach(v=>{if(!seen.has(v)){seen.add(v);ch=true}});if(ch)t.push([x.d,seen.size])}
 return t;
});
add('full_spectrum','balance','Full Spectrum',n=>wk(n)+' with an 8 or more in each category, each on a different day',[1,4,12],c=>{
 const t=[];let n=0,cur=null,done=false,M=[],P=[],C=[];
 for(const x of c.days){
  const w=x.n-x.wd;
  if(w!==cur){cur=w;done=false;M=[];P=[];C=[]}
  if(done)continue;
  if(x.m>=8)M.push(x.n);if(x.p>=8)P.push(x.n);if(x.c>=8)C.push(x.n);
  if(M.length&&P.length&&C.length&&pick(M,P,C)){done=true;n++;t.push([x.d,n])}
 }
 return t;
});
add('four_seasons','balance','Four Seasons',n=>'Five or more mood 7+ days in each of '+n+(n===1?' calendar month':' different calendar months'),[12],c=>{
 const cnt=new Map(),got=new Set(),t=[];
 for(const x of c.days){
  if(x.m<7)continue;
  const k=x.d.slice(0,7),v=(cnt.get(k)||0)+1;cnt.set(k,v);
  if(v===5){const cm=x.d.slice(5,7);if(!got.has(cm)){got.add(cm);t.push([x.d,got.size])}}
 }
 return t;
});
add('switch_hitter','balance','Switch Hitter',n=>'Your best weekday changes every month for '+mo(n)+' in a row',[3,5],
 c=>monthRun(c,(i,p)=>({ok:!!p&&i.best!=null&&p.best!=null&&i.best!==p.best,anchor:i.best!=null})));

/* Best and worst days: breaking the standard. "Usual" worst/best weekday needs 6+ of each weekday before the day. */
add('against_grain','bw','Against the Grain',n=>'A day averaging 8 or more on your usual worst weekday, '+n+(n===1?' time':' times'),[1,5,15],c=>{
 const st=wdState(),t=[];let n=0;
 for(const x of c.days){const b=st.info();if(b&&x.wd===b.worst&&x.s>=24){n++;t.push([x.d,n])}st.add(x)}
 return t;
});
add('plot_twist','bw','Plot Twist',n=>'Your usual worst weekday beats your usual best weekday for a whole month, '+n+(n===1?' time':' times'),[1,3],c=>{
 const st=wdState(),t=[];let n=0,curK=null,bucket=[],snap=null;
 const fin=()=>{
  if(!snap||curK==null||curK>=c.tk)return;
  const w=bucket.filter(x=>x.wd===snap.worst),b=bucket.filter(x=>x.wd===snap.best);
  if(w.length>=3&&b.length>=3&&avg(w)>avg(b)+EPS){n++;t.push([lastDay(curK),n])}
 };
 for(const x of c.days){const k=x.d.slice(0,7);if(k!==curK){fin();curK=k;bucket=[];snap=st.info()}bucket.push(x);st.add(x)}
 fin();
 return t;
});
add('gap_closer','bw','Gap Closer',()=>'The gap between your best and worst weekday average narrows from 1.0 or more to under 0.5',[1],c=>{
 const st=wdState();let wide=false;
 for(const x of c.days){
  st.add(x);const b=st.info(8);if(!b)continue;
  if(b.spread>=1-EPS)wide=true;else if(wide&&b.spread<0.5)return [[x.d,1]];
 }
 return [];
});
add('silver_lining','bw','Silver Lining',n=>'A month whose worst day still beats your average before it, '+n+(n===1?' time':' times'),[1,3,6],c=>{
 const t=[];let n=0;
 eachMonth(c,(k,arr,ps,pn)=>{if(pn>=30&&Math.min(...arr.map(x=>x.s))/3>ps/pn+EPS){n++;t.push([lastDay(k),n])}});
 return t;
});
add('worst_upgraded','bw','Worst Day Upgraded',n=>'Your month\u2019s worst day improves for '+mo(n)+' in a row',[3,5],
 c=>monthRun(c,(i,p)=>({ok:!!p&&i.min>p.min,anchor:true})));
add('slump_slayer','bw','Slump Slayer',n=>'A high day straight after a low day, '+n+(n===1?' time':' times'),[1,5,15],c=>{
 const t=[];let n=0,sum=0,sq=0,cnt=0,prev=null,prevLow=false;
 for(const x of c.days){
  let low=false,high=false;
  if(cnt>=14){const m=sum/cnt,sd=Math.sqrt(Math.max(0,(sq-cnt*m*m)/(cnt-1)));if(sd>0){low=x.a<m-0.4*sd-EPS;high=x.a>m+0.4*sd+EPS}}
  if(prev&&x.n-prev.n===1&&prevLow&&high){n++;t.push([x.d,n])}
  prev=x;prevLow=low;sum+=x.a;sq+=x.a*x.a;cnt++;
 }
 return t;
});
add('record_breaker','bw','Record Breaker',n=>'A new all-time best day (after 30 days of history), '+n+(n===1?' time':' times'),[1,3,6],c=>{
 const t=[];let n=0,max=-1;
 c.days.forEach((x,i)=>{if(i>=30&&x.s>max){n++;t.push([x.d,n])}if(x.s>max)max=x.s});
 return t;
});
add('defying_rhythm','bw','Defying the Rhythm',n=>wk(n)+' in a row where your usual worst weekday beats that week\u2019s average',[3,6],c=>{
 const st=wdState(),t=[];let run=0,best=0,curW=null,bucket=[],snap=null,prevW=null;
 const fin=()=>{
  if(curW==null||curW+6>=c.todayN)return;
  let ok=false;
  if(snap&&bucket.length>=6){
   const w=bucket.find(x=>x.wd===snap.worst);
   if(w)ok=w.a>bucket.reduce((s,x)=>s+x.a,0)/bucket.length+EPS;
  }
  run=ok?((prevW!=null&&curW-prevW===7&&run>0)?run+1:1):0;
  prevW=curW;
  if(run>best){best=run;t.push([dstr(curW+6),best])}
 };
 for(const x of c.days){const w=x.n-x.wd;if(w!==curW){fin();curW=w;bucket=[];snap=st.info()}bucket.push(x);st.add(x)}
 fin();
 return t;
});
add('mirror_day','bw','Mirror Day',n=>'A day where your best and worst category swap places from usual, '+n+(n===1?' time':' times'),[1,5,15],c=>{
 const t=[];let n=0;const s=[0,0,0];let cnt=0;
 for(const x of c.days){
  if(cnt>=21){
   const av=s.map(v=>v/cnt),ub=uniq(av,true),uw=uniq(av,false),v=[x.m,x.p,x.c];
   if(ub>=0&&uw>=0&&Math.max(...av)-Math.min(...av)>=0.3&&uniq(v,true)===uw&&uniq(v,false)===ub&&x.hi-x.lo>=2){n++;t.push([x.d,n])}
  }
  s[0]+=x.m;s[1]+=x.p;s[2]+=x.c;cnt++;
 }
 return t;
});

const GROUPS=[
 ['highs','Highs'],['streaks','Streaks'],['growth','Growth'],['balance','Balance and variety'],['bw','Best and worst days']
];

function evaluate(entries,todayStr){
 const c=build(prep(entries),todayStr);
 return A.map(a=>{
  let tr=[];
  try{tr=a.track(c)}catch(e){tr=[]}
  const have=tr.length?tr[tr.length-1][1]:0;
  const tiers=a.tiers.map((need,i)=>{const hit=tr.find(r=>r[1]>=need);return {i,need,desc:a.desc(need),date:hit?hit[0]:null}});
  return {id:a.id,group:a.g,name:a.name,have,tiers,next:tiers.find(t=>!t.date)||null};
 });
}

return {evaluate,GROUPS,CFG:{count:A.length}};
});

/* Day Rate insights engine.
   Pure functions only: no DOM, no storage, no globals. Works in the browser and in Node (tests).
   analyze(entries, todayStr, opts) -> { status, period, overview, observe[], discover[], act[], highlights[], empty }
   entries : { 'YYYY-MM-DD': {m,p,c,note,updated} }  (the app's own model) or an array of {date,m,p,c,...}
   todayStr: the app's today() string, so the 4am day rollover is respected
   opts    : { period: 7|30, score: row=>0..15 (the app's own daily score, optional) }
   Every insight is derived from stored ratings. Nothing is hardcoded. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.DayRateInsights=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';

/* Starting defaults, not statistical guarantees. */
const CFG={
 MIN_TOTAL:7,      // rated days before any insight is shown
 MIN_PAIRS:14,     // days with all three ratings before pattern insights are shown
 MIN_PERIOD:3,     // rated days inside a window before its average is shown
 MIN_WEEKDAY:3,    // ratings per weekday before that weekday is compared
 PRELIM_N:30,      // pattern insights built on fewer days are labelled preliminary
 SAME:0.3,         // |change| below this (1-10 scale) is "about the same"
 MEANINGFUL:0.5,   // |change| at or above this is called out
 HIGH_Z:0.4,       // z-score for "above/below your usual"
 CORR_NOTABLE:0.3, // |r| needed to describe a relationship
 RECENT:14,        // window for then-vs-now
 NOTE_GROUP:5      // days needed on each side of a note-theme comparison
};
const DIMS=['m','p','c'];
const CAP={m:'Mood',p:'Productivity',c:'Connection'};
const NAME={m:'mood',p:'productivity',c:'connection'};
const WD=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

/* ---------- small helpers ---------- */
const pad=n=>String(n).padStart(2,'0');
const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&ds(parse(s))===s;
const addDays=(s,n)=>{const d=parse(s);return ds(new Date(d.getFullYear(),d.getMonth(),d.getDate()+n))};
const wdOf=s=>(parse(s).getDay()+6)%7; // Monday = 0
const fmtDay=s=>parse(s).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
const fmtShort=s=>parse(s).toLocaleDateString(undefined,{day:'numeric',month:'short'});
const sum=a=>a.reduce((x,y)=>x+y,0);
const mean=a=>a.length?sum(a)/a.length:null;
const sd=a=>{if(a.length<2)return null;const m=mean(a);return Math.sqrt(sum(a.map(v=>(v-m)*(v-m)))/(a.length-1))};
const f1=v=>{const t=Math.round(v*10)/10;return (Math.abs(t)<0.05?0:t).toFixed(1)};
const f2=v=>{const t=Math.round(v*100)/100,a=Math.abs(t)<0.005?0:Math.abs(t);return (t<0&&a?'\u2212':'')+a.toFixed(2)};
const sgn=v=>Math.abs(v)<0.05?'0.0':(v>0?'+':'\u2212')+f1(Math.abs(v));
const list=a=>a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
const trend=d=>d==null?null:Math.abs(d)<CFG.SAME?'same':d>0?'up':'down';
const overallOf=r=>(r.m+r.p+r.c)/3;

function pearson(x,y){
 const n=x.length;if(n<3||y.length!==n)return null;
 const mx=mean(x),my=mean(y);let sxx=0,syy=0,sxy=0;
 for(let i=0;i<n;i++){const a=x[i]-mx,b=y[i]-my;sxx+=a*a;syy+=b*b;sxy+=a*b}
 if(sxx===0||syy===0)return null;
 return sxy/Math.sqrt(sxx*syy);
}
const strengthWord=r=>{const a=Math.abs(r);return a<0.2?'little':a<0.4?'slight':a<0.6?'moderate':'strong'};

/* ---------- cleaning: missing values, duplicates, bad dates, future days ---------- */
function rating(v){
 const n=typeof v==='string'&&v.trim()!==''?Number(v):v;
 return typeof n==='number'&&isFinite(n)&&n>=1&&n<=10?n:null;
}
function clean(input,todayStr){
 let pairs=[];
 if(Array.isArray(input))pairs=input.map(e=>e&&typeof e==='object'?[e.date,e]:[null,null]);
 else if(input&&typeof input==='object')pairs=Object.keys(input).map(k=>[k,input[k]]);
 const dropped={invalidDate:0,future:0,noRating:0,duplicates:0};
 const by={};
 for(const[k,e]of pairs){
  if(!isDate(k)||!e||typeof e!=='object'){dropped.invalidDate++;continue}
  if(todayStr&&k>todayStr){dropped.future++;continue}
  const r={date:k,updated:Number(e.updated)||0,note:typeof e.note==='string'?e.note:''};
  let any=false;
  for(const d of DIMS){r[d]=rating(e[d]);if(r[d]!=null)any=true}
  if(!any){dropped.noRating++;continue}
  r.complete=DIMS.every(d=>r[d]!=null);
  if(by[k]){dropped.duplicates++;if(r.updated>=by[k].updated)by[k]=r}else by[k]=r; // keep the most recently edited
 }
 const rows=Object.keys(by).sort().map(k=>by[k]);
 return {rows,dropped};
}

/* Mirrors the app's 0-5-per-category scoring (README "Scoring") so "best day" agrees with History. */
function makeScorer(rows){
 const rg={};
 for(const d of DIMS){const v=rows.map(r=>r[d]).filter(x=>x!=null);rg[d]=v.length?[Math.min(...v),Math.max(...v)]:[0,0]}
 return r=>{let t=0;for(const d of DIMS){if(r[d]==null)return null;const b=rg[d][1]-rg[d][0];t+=b>0?5*(r[d]-rg[d][0])/b:2.5}return t};
}

/* ---------- windows and period statistics ---------- */
function dimStats(rs,d){
 const v=rs.map(r=>r[d]).filter(x=>x!=null);
 return {n:v.length,mean:mean(v),sd:sd(v),min:v.length?Math.min(...v):null,max:v.length?Math.max(...v):null};
}
function periodStats(rows,today,len,offset){
 const end=addDays(today,-offset),start=addDays(end,-(len-1));
 const rs=rows.filter(r=>r.date>=start&&r.date<=end);
 const dims={};for(const d of DIMS)dims[d]=dimStats(rs,d);
 const per=rs.filter(r=>r.complete).map(overallOf);
 return {start,end,len,rows:rs,days:rs.length,dims,overall:{n:per.length,mean:mean(per),sd:sd(per)}};
}
function comparePeriods(rows,today,len){
 const cur=periodStats(rows,today,len,0),prev=periodStats(rows,today,len,len);
 const delta={};
 for(const d of DIMS)delta[d]=cur.dims[d].n>=CFG.MIN_PERIOD&&prev.dims[d].n>=CFG.MIN_PERIOD?cur.dims[d].mean-prev.dims[d].mean:null;
 const half=Math.ceil(len/2);
 return {len,cur,prev,delta,prelim:cur.days<half||prev.days<half};
}
function series(rows,today,len,d){
 const out=[];
 for(let i=len-1;i>=0;i--){const k=addDays(today,-i);const r=rows.find(x=>x.date===k);out.push({date:k,v:r&&r[d]!=null?r[d]:null})}
 return out;
}

/* ---------- levels relative to the user's own history ---------- */
function levelStats(rows){
 const st={};for(const d of DIMS){const v=rows.map(r=>r[d]);st[d]={mean:mean(v),sd:sd(v)||0}}
 return st;
}
const zOf=(r,d,st)=>st[d].sd>0?(r[d]-st[d].mean)/st[d].sd:0;
const levelOf=(r,d,st)=>{const z=zOf(r,d,st);return z>=CFG.HIGH_Z?'H':z<=-CFG.HIGH_Z?'L':'M'};
const levelsOf=(r,st)=>({m:levelOf(r,'m',st),p:levelOf(r,'p',st),c:levelOf(r,'c',st)});

const ARCH={
 balanced:{name:'The Balanced Day',desc:'All three ratings above your usual'},
 social:{name:'The Social Recharge',desc:'Connection and mood above your usual, productivity not'},
 productive:{name:'The Productive Day',desc:'Productivity and mood above your usual, connection not'},
 together:{name:'The Team-Effort Day',desc:'Productivity and connection above your usual, mood not'},
 headsdown:{name:'The Heads-Down Day',desc:'Productivity stood out; mood and connection did not'},
 easygoing:{name:'The Easy-Going Day',desc:'Mood stood out on its own'},
 connected:{name:'The Connected Day',desc:'Connection stood out on its own'},
 quiet:{name:'The Quiet Day',desc:'All three ratings below your usual'},
 steady:{name:'The Steady Day',desc:'Close to your usual, with nothing standing out'}
};
function classify(lv){
 const H=d=>lv[d]==='H',n=DIMS.filter(H).length;
 if(n===3)return 'balanced';
 if(n===2)return !H('p')?'social':!H('c')?'productive':'together';
 if(n===1)return H('p')?'headsdown':H('m')?'easygoing':'connected';
 return DIMS.every(d=>lv[d]==='L')?'quiet':'steady';
}

/* ---------- insight factory ---------- */
function mk(o){return Object.assign({lines:[],chart:null,why:null,prelim:false,actionId:null,priority:50},o)}
const allLabel=(ctx,n,unit)=>({period:'All history',nLabel:plural(n,unit||'day')+(ctx.status.first?' since '+fmtShort(ctx.status.first):'')});

/* ===================== OBSERVE ===================== */
function insProgress(ctx){
 const pc=ctx.pc,L=pc.len,cur=pc.cur,prev=pc.prev;
 if(cur.overall.n<CFG.MIN_PERIOD||prev.overall.n<CFG.MIN_PERIOD)return null;
 const od=cur.overall.mean-prev.overall.mean,t=trend(od);
 let finding='Overall, your three ratings averaged '+f1(cur.overall.mean)+' over the last '+L+' days'+
  (t==='same'?', about the same as the '+L+' days before ('+f1(prev.overall.mean)+').':', '+t+' '+f1(Math.abs(od))+' from '+f1(prev.overall.mean)+' in the '+L+' days before.');
 const lines=[];
 const moved=DIMS.filter(d=>pc.delta[d]!=null&&Math.abs(pc.delta[d])>=CFG.MEANINGFUL).sort((a,b)=>Math.abs(pc.delta[b])-Math.abs(pc.delta[a]));
 if(moved.length)lines.push(list(moved.map((d,i)=>(i?NAME[d]:CAP[d])+' '+(pc.delta[d]>0?'rose':'dipped')+' '+f1(Math.abs(pc.delta[d]))))+'.');
 else lines.push('No single rating moved much.');
 if(cur.overall.n>=4&&prev.overall.n>=4&&prev.overall.sd>0){
  const ratio=cur.overall.sd/prev.overall.sd;
  lines.push(ratio<=0.75?'Your day-to-day ups and downs were smaller than before.':ratio>=1.33?'Your days varied more than they did before.':'Your day-to-day variation was similar to before.');
 }
 return mk({id:'progress',layer:'observe',priority:90,
  title:'Last '+L+' days compared with the '+L+' before',finding,lines,
  period:'Last '+L+' days vs previous '+L,nLabel:cur.days+' and '+prev.days+' rated days',prelim:pc.prelim,
  chart:{type:'compare',heads:['Now','Before','Change'],rows:DIMS.map(d=>({label:CAP[d],a:pc.delta[d]==null?null:cur.dims[d].mean,b:pc.delta[d]==null?null:prev.dims[d].mean,delta:pc.delta[d]}))},
  why:'Ratings naturally move around from one stretch to the next. Small changes are usually everyday variation, not a sign that anything is going right or wrong.'});
}

function insExtremes(ctx){
 const L=ctx.pc.len,rs=ctx.pc.cur.rows.filter(r=>r.complete);
 if(rs.length<CFG.MIN_PERIOD)return null;
 const sc=rs.map(r=>({r,s:ctx.score(r)})).filter(x=>x.s!=null);
 if(sc.length<CFG.MIN_PERIOD)return null;
 const hi=sc.reduce((a,b)=>b.s>a.s||(b.s===a.s&&b.r.date>a.r.date)?b:a);
 const lo=sc.reduce((a,b)=>b.s<a.s||(b.s===a.s&&b.r.date>a.r.date)?b:a);
 if(hi.s-lo.s<0.01)return null;
 let gapD=DIMS[0],gap=-1;
 for(const d of DIMS){const g=Math.abs(hi.r[d]-lo.r[d]);if(g>gap){gap=g;gapD=d}}
 return mk({id:'extremes',layer:'observe',priority:60,
  title:'Highest and lowest days',
  finding:'Your highest-rated day was '+fmtDay(hi.r.date)+' and your lowest was '+fmtDay(lo.r.date)+'. The widest gap between them was in '+NAME[gapD]+' ('+hi.r[gapD]+' vs '+lo.r[gapD]+').',
  period:'Last '+L+' days',nLabel:plural(sc.length,'complete day'),prelim:sc.length<Math.ceil(L/2),
  chart:{type:'days',rows:[{tag:'Highest',date:hi.r.date,label:fmtDay(hi.r.date),m:hi.r.m,p:hi.r.p,c:hi.r.c},{tag:'Lowest',date:lo.r.date,label:fmtDay(lo.r.date),m:lo.r.m,p:lo.r.p,c:lo.r.c}]},
  why:'Seeing your extremes side by side shows what a stand-out day and a quieter day each look like across all three ratings.'});
}

function insConsistency(ctx){
 const cur=ctx.pc.cur,L=ctx.pc.len;
 if(!DIMS.every(d=>cur.dims[d].n>=5&&cur.dims[d].sd!=null))return null;
 const o=DIMS.slice().sort((a,b)=>cur.dims[a].sd-cur.dims[b].sd),s=o[0],v=o[2];
 const spread=cur.dims[v].sd-cur.dims[s].sd;
 const finding=spread<CFG.SAME?'All three ratings varied by a similar amount over the last '+L+' days.':
  'Your '+NAME[s]+' was your steadiest rating (typically within \u00b1'+f1(cur.dims[s].sd)+' of '+f1(cur.dims[s].mean)+'), while your '+NAME[v]+' varied the most (\u00b1'+f1(cur.dims[v].sd)+').';
 return mk({id:'consistency',layer:'observe',priority:50,title:'Most consistent rating',finding,
  period:'Last '+L+' days',nLabel:plural(Math.min(...DIMS.map(d=>cur.dims[d].n)),'rated day'),
  prelim:Math.min(...DIMS.map(d=>cur.dims[d].n))<Math.ceil(L/2),
  chart:{type:'bars',max:4,rows:DIMS.map(d=>({label:CAP[d],value:cur.dims[d].sd,text:'\u00b1'+f1(cur.dims[d].sd)}))},
  why:'A steadier rating changes less from day to day. A rating that swings more has more room to respond to what happens in your days.'});
}

function insRhythm(ctx){
 const cr=ctx.comp;if(cr.length<CFG.MIN_PAIRS)return null;
 const by=WD.map((name,i)=>{
  const rs=cr.filter(r=>wdOf(r.date)===i);
  const dm={};for(const d of DIMS){dm[d]=mean(rs.map(r=>r[d]))}
  return {i,name,n:rs.length,mean:rs.length?mean(rs.map(overallOf)):null,dm};
 });
 const ok=by.filter(b=>b.n>=CFG.MIN_WEEKDAY);
 const chart={type:'weekday',rows:by.map(b=>({label:b.name.slice(0,3),n:b.n,value:b.mean,solid:b.n>=CFG.MIN_WEEKDAY}))};
 const base=Object.assign({id:'rhythm',layer:'observe',title:'Your weekly rhythm',chart,prelim:cr.length<CFG.PRELIM_N+5,
  why:'If some weekdays reliably feel different, you can protect the good ones and go gently on the harder ones.'},allLabel(ctx,cr.length,'complete day'));
 if(ok.length<4){
  return mk(Object.assign(base,{priority:20,finding:'Not enough ratings per weekday yet. Once most days of the week have at least '+CFG.MIN_WEEKDAY+' ratings, a weekly pattern can appear here.',prelim:true}));
 }
 const so=ok.slice().sort((a,b)=>a.mean-b.mean),lo=so[0],hi=so[so.length-1];
 const sdAll=sd(cr.map(overallOf))||0;
 const se=sdAll*Math.sqrt(1/hi.n+1/lo.n),gap=hi.mean-lo.mean;
 const notable=gap>=0.7&&gap>=1.5*se;
 const lines=[];
 if(notable){
  const cand=DIMS.map(d=>{
   const sd2=sd(cr.map(r=>r[d]))||0,o=ok.slice().sort((x,y)=>x.dm[d]-y.dm[d]),l=o[0],h=o[o.length-1];
   return {d,l,h,g:h.dm[d]-l.dm[d],e:sd2*Math.sqrt(1/h.n+1/l.n)};
  }).filter(x=>x.g>=1&&x.g>=1.5*x.e&&(x.h.i!==hi.i||x.l.i!==lo.i)).sort((x,y)=>y.g-x.g)[0];
  if(cand)lines.push(CAP[cand.d]+' stands out most: highest on '+cand.h.name+'s ('+f1(cand.h.dm[cand.d])+'), lowest on '+cand.l.name+'s ('+f1(cand.l.dm[cand.d])+').');
  ctx.facts.rhythm={hi:hi.name,lo:lo.name,loMean:lo.mean,hiMean:hi.mean,nlo:lo.n};
  return mk(Object.assign(base,{priority:80,
   finding:hi.name+'s tend to be your highest-rated days (average '+f1(hi.mean)+') and '+lo.name+'s your lowest ('+f1(lo.mean)+'), based on '+hi.n+' and '+lo.n+' days. Treat it as a hint rather than a rule.',lines}));
 }
 return mk(Object.assign(base,{priority:30,finding:'No clear weekly pattern yet: your average rating is fairly similar across the days of the week.'}));
}

function insThenNow(ctx){
 const rs=ctx.rows,rs0=addDays(ctx.today,-(CFG.RECENT-1));
 const rec=rs.filter(r=>r.date>=rs0),old=rs.filter(r=>r.date<rs0);
 const ev=[];
 for(const d of DIMS){
  const vr=rec.map(r=>r[d]).filter(x=>x!=null),vb=old.map(r=>r[d]).filter(x=>x!=null);
  if(vr.length<5||vb.length<10)continue;
  const sdB=sd(vb)||0,diff=mean(vr)-mean(vb);
  ev.push({d,now:mean(vr),before:mean(vb),diff,meaningful:Math.abs(diff)>=Math.max(CFG.MEANINGFUL,0.4*sdB)});
 }
 if(!ev.length)return null;
 const big=ev.filter(e=>e.meaningful).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff));
 const meta={period:'Last '+CFG.RECENT+' days vs earlier history',nLabel:rec.length+' recent days vs '+old.length+' earlier',prelim:old.length<CFG.PRELIM_N};
 const chart={type:'compare',heads:['Recent','Earlier','Change'],rows:ev.map(e=>({label:CAP[e.d],a:e.now,b:e.before,delta:e.diff}))};
 ctx.facts.thenNow=big;
 if(big.length){
  const a=big[0];
  let f='Lately your '+NAME[a.d]+' has been running '+(a.diff>0?'higher':'lower')+' than your usual: '+f1(a.now)+' over the last '+CFG.RECENT+' days versus '+f1(a.before)+' before that.';
  if(big[1])f+=' Your '+NAME[big[1].d]+' has also been '+(big[1].diff>0?'higher':'lower')+' ('+f1(big[1].now)+' vs '+f1(big[1].before)+').';
  return mk(Object.assign(meta,{id:'thennow',layer:'observe',priority:75,title:'Then vs now',finding:f,chart,
   why:'Comparing recent days with your own longer history shows whether you are drifting from your usual, in either direction.'}));
 }
 return mk(Object.assign(meta,{id:'thennow',layer:'observe',priority:25,title:'Then vs now',
  finding:'Your last '+CFG.RECENT+' days look much like your earlier history, with no large shift on any rating.',chart,
  why:'Small differences from your average are normal and not worth reading into.'}));
}

function insTradeoff(ctx){
 const pc=ctx.pc,L=pc.len;let best=null;
 for(const U of DIMS){
  if(pc.delta[U]==null||pc.delta[U]<CFG.MEANINGFUL)continue;
  for(const O of DIMS){
   if(O===U||pc.delta[O]==null||pc.delta[O]>=CFG.SAME)continue;
   const c=pc.delta[U]-pc.delta[O];
   if(c>=0.8&&(!best||c>best.c))best={U,O,c};
  }
 }
 if(!best)return null;
 const dU=pc.delta[best.U],dO=pc.delta[best.O],flat=Math.abs(dO)<CFG.SAME;
 ctx.facts.tradeoff={U:best.U,O:best.O,flat};
 return mk({id:'tradeoff',layer:'observe',priority:78,
  title:'Ratings moved in different directions',
  finding:'Your '+NAME[best.U]+' went up '+f1(dU)+' over the last '+L+' days, while your '+NAME[best.O]+(flat?' stayed about the same ('+sgn(dO)+').':' dipped by '+f1(-dO)+'.'),
  period:'Last '+L+' days vs previous '+L,nLabel:pc.cur.days+' and '+pc.prev.days+' rated days',prelim:pc.prelim,
  chart:{type:'compare',heads:['Now','Before','Change'],rows:[best.U,best.O].map(d=>({label:CAP[d],a:pc.cur.dims[d].mean,b:pc.prev.dims[d].mean,delta:pc.delta[d]}))},
  why:'Ratings do not always move together. This is a snapshot of one stretch and cannot say why it happened.'});
}

/* ===================== DISCOVER ===================== */
const PAIRS=[['m','c'],['m','p'],['p','c']];
function insRelationships(ctx){
 const cr=ctx.comp;if(cr.length<CFG.MIN_PAIRS)return null;
 const res=PAIRS.map(([a,b])=>({a,b,r:pearson(cr.map(r=>r[a]),cr.map(r=>r[b]))}));
 res.forEach(x=>{ctx.facts.rel[x.a+x.b]=x.r;ctx.facts.rel[x.b+x.a]=x.r});
 const notable=res.filter(x=>x.r!=null&&Math.abs(x.r)>=CFG.CORR_NOTABLE).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
 const meta=Object.assign({id:'relationships',layer:'discover',prelim:cr.length<CFG.PRELIM_N,
  chart:{type:'corr',rows:res.map(x=>({label:CAP[x.a]+' & '+NAME[x.b],r:x.r,text:x.r==null?'no variation':'r = '+f2(x.r)+' ('+strengthWord(x.r)+')'}))},
  why:'Knowing which ratings travel together helps you see what a good day looks like for you. It shows an association in your own data only. It cannot show whether one affects the other, or whether something else drives both.'},
  allLabel(ctx,cr.length,'complete day'));
 if(!notable.length){
  return mk(Object.assign(meta,{priority:55,title:'Your ratings move fairly independently',
   finding:'A high rating on one measure does not reliably go with high ratings on the others, so each one tells you something different about your day.'}));
 }
 const t=notable[0],pos=t.r>0;
 const lines=notable.slice(1).map(x=>CAP[x.a]+' and '+NAME[x.b]+(x.r>0?' also tend to rise and fall together':' tend to move in opposite directions')+' (r = '+f2(x.r)+').');
 return mk(Object.assign(meta,{priority:90,
  title:CAP[t.a]+' and '+NAME[t.b]+(pos?' tend to move together':' tend to move in opposite directions'),
  finding:'On days when your '+NAME[t.a]+' is higher, your '+NAME[t.b]+' tends to be '+(pos?'higher':'lower')+' too: a '+strengthWord(t.r)+' link (r = '+f2(t.r)+') across '+cr.length+' days.',lines}));
}

function insBest(ctx){
 const cr=ctx.comp;if(cr.length<CFG.MIN_PAIRS)return null;
 const sc=cr.map(r=>({r,s:ctx.score(r)})).filter(x=>x.s!=null).sort((a,b)=>b.s-a.s||(a.r.date<b.r.date?1:-1));
 const n=sc.length;if(n<CFG.MIN_PAIRS)return null;
 const k=Math.max(3,Math.ceil(n*0.2)),thr=sc[k-1].s;
 const best=sc.filter(x=>x.s>=thr-1e-9).map(x=>x.r);
 if(best.length>n*0.5)return null; // too many ties to call any day "best"
 const set=new Set(best.map(r=>r.date)),others=cr.filter(r=>!set.has(r.date));
 if(others.length<3)return null;
 const st=ctx.levels,K=best.length;
 const bm={},om={},zd={},hi={};
 for(const d of DIMS){bm[d]=mean(best.map(r=>r[d]));om[d]=mean(others.map(r=>r[d]));zd[d]=st[d].sd>0?(bm[d]-om[d])/st[d].sd:0;hi[d]=best.filter(r=>levelOf(r,d,st)==='H').length}
 const top=DIMS.slice().sort((a,b)=>zd[b]-zd[a])[0];
 const lines=[];
 const common=DIMS.filter(d=>hi[d]/K>=0.6).sort((a,b)=>hi[b]-hi[a]);
 if(common.length)lines.push('Above your usual on most of these days: '+list(common.map(d=>NAME[d]+' ('+hi[d]+' of '+K+')'))+'.');
 // combinations of two or more ratings that were high together
 const combos=[['m','c'],['m','p'],['p','c'],['m','p','c']];
 let bc=null;
 for(const cb of combos){
  const inB=best.filter(r=>cb.every(d=>levelOf(r,d,st)==='H')).length;
  const inO=others.filter(r=>cb.every(d=>levelOf(r,d,st)==='H')).length;
  const sb=inB/K,so=inO/others.length;
  if(inB>=3&&sb>=0.4&&sb-so>=0.25&&(!bc||sb-so>bc.sb-bc.so))bc={cb,inB,sb,so};
 }
 if(bc){const nm=list(bc.cb.map(d=>NAME[d]));lines.push(nm.charAt(0).toUpperCase()+nm.slice(1)+(bc.cb.length===2?' were both':' were all')+' above your usual on '+bc.inB+' of '+K+' top days, versus '+Math.round(bc.so*100)+'% of your other days.')}
 ctx.facts.best={K,n,top,zTop:zd[top],hi,bc,others:others.length,st};
 ctx.facts.bestRows=best;
 const finding=zd[top]>=0.5?
  'On your '+K+' highest-rated days, '+NAME[top]+' stood out most: '+f1(bm[top])+' on average versus '+f1(om[top])+' on your other days.':
  'Your '+K+' highest-rated days were lifted fairly evenly: no single rating stood out from the rest.';
 return mk(Object.assign({id:'bestdays',layer:'discover',priority:85,title:'What your best days have in common',finding,lines,
  prelim:n<CFG.PRELIM_N,
  chart:{type:'compare',heads:['Best days','Other days','Gap'],rows:DIMS.map(d=>({label:CAP[d],a:bm[d],b:om[d],delta:bm[d]-om[d]}))},
  why:'Your best days are chosen by their ratings, so some overlap is expected. What is useful is which rating stands out most and which combinations keep coming back. These are observed patterns, not definitive causes.'},
  allLabel(ctx,n,'complete day')));
}

function insLagging(ctx){
 const f=ctx.facts.best;if(!f)return null;
 const best=ctx.facts.bestRows,st=f.st,K=best.length;
 const cnt={};for(const d of DIMS)cnt[d]=best.filter(r=>r[d]<st[d].mean).length;
 const o=DIMS.slice().sort((a,b)=>cnt[b]-cnt[a]),d=o[0];
 if(cnt[d]<3||cnt[d]/K<0.35||cnt[d]===cnt[o[1]])return null;
 ctx.facts.lagging={d,cnt:cnt[d],K};
 return mk(Object.assign({id:'lagging',layer:'discover',priority:50,
  title:'The rating that sometimes lags on good days',
  finding:'Even on your highest-rated days, your '+NAME[d]+' was below your own average on '+cnt[d]+' of '+K+'.',
  prelim:f.n<CFG.PRELIM_N,
  chart:{type:'bars',max:K,rows:DIMS.map(x=>({label:CAP[x],value:cnt[x],text:cnt[x]+' of '+K}))},
  why:'A good day does not always lift every rating. Noticing which one tends to trail can show where small changes might matter most to you.'},
  allLabel(ctx,f.n,'complete day')));
}

function insProductiveBest(ctx){
 const f=ctx.facts.best;if(!f)return null;
 const cr=ctx.comp,n=f.n,k=Math.max(3,Math.ceil(n*0.2));
 const bestSet=new Set(ctx.facts.bestRows.map(r=>r.date));
 const byP=cr.slice().sort((a,b)=>b.p-a.p||(a.date<b.date?1:-1));
 const thr=byP[k-1].p,prod=byP.filter(r=>r.p>=thr);
 if(prod.length>n*0.5)return null;
 const overlap=prod.filter(r=>bestSet.has(r.date)).length,exp=prod.length*bestSet.size/n;
 if(!(overlap>=exp+1.5||overlap<=exp-1.5))return null;
 const hi=overlap>exp;
 return mk(Object.assign({id:'productivebest',layer:'discover',priority:hi?58:52,
  title:hi?'Productive days are often your best days':'Productive days are not always your best days',
  finding:overlap+' of your '+prod.length+' most productive days were also among your '+bestSet.size+' highest-rated days (about '+f1(exp)+' would be expected if the two were unrelated).',
  prelim:n<CFG.PRELIM_N,
  why:hi?'For you, getting things done and having a good day seem to go together more often than chance would suggest.':'Getting a lot done and having a high-rated day do not always overlap for you, so they may mean different things in your life.'},
  allLabel(ctx,n,'complete day')));
}

function insArchetypes(ctx){
 const cr=ctx.comp;if(cr.length<CFG.MIN_PAIRS)return null;
 const st=ctx.levels,counts={};
 for(const r of cr){const a=classify(levelsOf(r,st));counts[a]=(counts[a]||0)+1}
 ctx.facts.arch=counts;
 const rows=Object.keys(counts).map(k=>({k,n:counts[k]})).sort((a,b)=>b.n-a.n);
 const named=rows.filter(x=>x.k!=='steady'&&x.k!=='quiet'&&x.n>=2);
 const total=cr.length;
 const common=rows[0],standout=named[0];
 let finding;
 if(standout&&standout.n>=3)finding='Your most common stand-out day is '+ARCH[standout.k].name+' ('+standout.n+' of '+total+' days). '+ARCH[standout.k].desc+'.';
 else finding='Your days do not fall into strong repeating types yet. Most are close to your usual.';
 return mk(Object.assign({id:'archetypes',layer:'discover',priority:70,title:'Your day types',finding,
  prelim:total<CFG.PRELIM_N,
  chart:{type:'dist',total,rows:rows.slice(0,5).map(x=>({label:ARCH[x.k].name,n:x.n,pct:Math.round(100*x.n/total),desc:ARCH[x.k].desc}))},
  why:'High and low are judged against your own average for each rating, so a day type describes what stood out for you, not how any day ought to feel.'},
  allLabel(ctx,total,'complete day')));
}

const THEMES={
 outdoors:{label:'time outdoors',re:/\b(outside|outdoors?|walk(ed|ing|s)?|hik(e|ed|ing)|park|beach|garden|sunshine|fresh air|biking|cycling|bike ride)\b/i},
 exercise:{label:'exercise',re:/\b(gym|work(ed)? ?out|exercis\w*|running|jog\w*|swim\w*|yoga|pilates|lifting|training session)\b/i},
 social:{label:'time with friends or family',re:/\b(friends?|family|parents|party|catch.?up|(dinner|lunch|coffee|drinks|brunch) with|date night|hung out|hang.?out|visit(ed|ors)?)\b/i}
};
function insNoteThemes(ctx){
 const cr=ctx.comp;if(cr.length<CFG.MIN_PAIRS)return null;
 let best=null;
 for(const key of Object.keys(THEMES)){
  const w=cr.filter(r=>THEMES[key].re.test(r.note)),wo=cr.filter(r=>!THEMES[key].re.test(r.note));
  if(w.length<CFG.NOTE_GROUP||wo.length<CFG.NOTE_GROUP)continue;
  const a=mean(w.map(overallOf)),b=mean(wo.map(overallOf)),diff=a-b;
  if(Math.abs(diff)<0.8)continue;
  if(!best||Math.abs(diff)>Math.abs(best.diff))best={key,w,wo,a,b,diff};
 }
 if(!best)return null;
 ctx.facts.theme={key:best.key,label:THEMES[best.key].label,diff:best.diff,nw:best.w.length};
 return mk(Object.assign({id:'notetheme',layer:'discover',priority:78,
  title:'Days where your note mentions '+THEMES[best.key].label,
  finding:'Days where your note mentioned '+THEMES[best.key].label+' averaged '+f1(best.a)+' overall, versus '+f1(best.b)+' on other days ('+best.w.length+' days vs '+best.wo.length+').',
  prelim:best.w.length<10,
  chart:{type:'compare',heads:['With','Without','Gap'],rows:DIMS.map(d=>({label:CAP[d],a:mean(best.w.map(r=>r[d])),b:mean(best.wo.map(r=>r[d])),delta:mean(best.w.map(r=>r[d]))-mean(best.wo.map(r=>r[d]))}))},
  why:'This is based on keywords in your one-line notes. Days you write about something may differ in other ways too, so it is a clue, not a cause.'},
  allLabel(ctx,cr.length,'complete day')));
}

function insDivergence(ctx){
 const cr=ctx.comp;if(cr.length<CFG.MIN_PAIRS)return null;
 const st=ctx.levels,lv=cr.map(r=>levelsOf(r,st));
 let best=null;
 for(const[a,b]of [['p','m'],['m','p'],['c','m'],['m','c'],['p','c'],['c','p']]){
  const cnt=lv.filter(l=>l[a]==='H'&&l[b]==='L').length;
  if(cnt>=3&&cnt/cr.length>=0.1&&(!best||cnt>best.cnt))best={a,b,cnt};
 }
 if(!best)return null;
 const r=ctx.facts.rel[best.a+best.b],tied=r!=null&&r>=0.4;
 return mk(Object.assign({id:'divergence',layer:'discover',priority:45,
  title:CAP[best.a]+' and '+NAME[best.b]+' sometimes pull apart',
  finding:'On '+best.cnt+' days ('+Math.round(100*best.cnt/cr.length)+'%), your '+NAME[best.a]+' was above your usual while your '+NAME[best.b]+' was below it'+(tied?', even though the two usually move together.':'.'),
  prelim:cr.length<CFG.PRELIM_N,
  why:'Days where two ratings disagree can show that they capture different parts of a day.'},
  allLabel(ctx,cr.length,'complete day')));
}

function insLagged(ctx){
 const cr=ctx.comp;
 const next={};cr.forEach(r=>{next[r.date]=r});
 const pairs=cr.filter(r=>next[addDays(r.date,1)]).map(r=>[r,next[addDays(r.date,1)]]);
 if(pairs.length<20)return null;
 let best=null;
 for(const a of DIMS)for(const b of DIMS){
  if(a!==b){const same=ctx.facts.rel[a+b];if(same!=null&&Math.abs(same)>=0.4)continue}
  const r=pearson(pairs.map(p=>p[0][a]),pairs.map(p=>p[1][b]));
  if(r!=null&&Math.abs(r)>=0.45&&(!best||Math.abs(r)>Math.abs(best.r)))best={a,b,r};
 }
 if(!best)return null;
 const same=best.a===best.b;
 return mk(Object.assign({id:'lagged',layer:'discover',priority:40,
  title:same?'Your '+NAME[best.a]+' carries over from day to day':'One day\u2019s '+NAME[best.a]+' lines up with the next day\u2019s '+NAME[best.b],
  finding:(same?'A higher '+NAME[best.a]+' one day tends to be followed by a '+(best.r>0?'higher':'lower')+' '+NAME[best.a]+' the next day':
   'A higher '+NAME[best.a]+' one day tends to be followed by '+(best.r>0?'higher':'lower')+' '+NAME[best.b]+' the next day')+' (r = '+f2(best.r)+', '+pairs.length+' back-to-back pairs).',
  prelim:pairs.length<CFG.PRELIM_N,
  why:'It is an association between neighbouring days only. Something else, such as a busy stretch, could be shaping both.'},
  allLabel(ctx,pairs.length,'pair of days')));
}

/* ===================== ACT ===================== */
function buildExperiments(ctx,have){
 const f=ctx.facts,ex=[];
 const add=(kind,o)=>{if(!ex.some(e=>e.kind===kind))ex.push(Object.assign({kind,starter:false,when:'This week'},o))};
 const rel=f.rel;
 // social
 if(rel.mc!=null&&rel.mc>=CFG.CORR_NOTABLE&&have.relationships)
  add('social',{priority:90,source:'relationships',title:'Plan one social moment',
   text:'Plan one meaningful social moment this week, such as a call, a walk with someone or a coffee, then compare your mood and connection that day with your usual.',
   because:'Your higher-mood days tend to have higher connection (r = '+f2(rel.mc)+').'});
 if(f.best&&f.best.hi.c/f.best.K>=0.6&&have.bestdays)
  add('social',{priority:84,source:'bestdays',title:'Plan one social moment',
   text:'Plan one meaningful social moment this week and see how your connection and mood ratings compare with your usual.',
   because:'Connection was above your usual on '+f.best.hi.c+' of your '+f.best.K+' best days.'});
 if(f.tradeoff&&f.tradeoff.O==='c')
  add('social',{priority:80,source:'tradeoff',title:'Plan one social moment',
   text:'Plan one small social moment this week and see whether your connection rating shifts.',
   because:'Your connection stayed level or dipped while another rating rose lately.'});
 // priority
 if(rel.mp!=null&&rel.mp>=CFG.CORR_NOTABLE&&have.relationships)
  add('priority',{priority:88,source:'relationships',title:'Choose one main priority',
   text:'Tomorrow, choose one main priority instead of a full to-do list, and notice how the day feels when it is done.',
   because:'Your higher-mood days tend to have higher productivity (r = '+f2(rel.mp)+').'});
 if(f.lagging&&f.lagging.d==='p'&&have.lagging)
  add('priority',{priority:70,source:'lagging',title:'Choose one main priority',
   text:'Tomorrow, choose one main priority instead of a full to-do list, and see how your productivity rating compares.',
   because:'Productivity was below your average on '+f.lagging.cnt+' of your '+f.lagging.K+' best days.'});
 if(f.tradeoff&&f.tradeoff.O==='p')
  add('priority',{priority:76,source:'tradeoff',title:'Choose one main priority',
   text:'Tomorrow, choose one main priority instead of a full to-do list, and see how your productivity rating compares.',
   because:'Your productivity stayed level or dipped while another rating rose lately.'});
 // enjoyment
 if(f.lagging&&f.lagging.d==='m'&&have.lagging)
  add('enjoy',{priority:70,source:'lagging',title:'Add one enjoyable thing',
   text:'On one busy day this week, set aside 15 minutes for something you simply enjoy, then compare that day\u2019s mood rating with your usual.',
   because:'Mood was below your average on '+f.lagging.cnt+' of your '+f.lagging.K+' best days.'});
 if(f.tradeoff&&f.tradeoff.O==='m')
  add('enjoy',{priority:76,source:'tradeoff',title:'Add one enjoyable thing',
   text:'On one busy day this week, set aside 15 minutes for something you simply enjoy and see whether your mood rating shifts.',
   because:'Your mood stayed level or dipped while another rating rose lately.'});
 if(f.arch&&f.arch.headsdown>=3&&f.arch.headsdown===Math.max.apply(null,Object.keys(f.arch).filter(k=>k!=='steady'&&k!=='quiet').map(k=>f.arch[k]))&&have.archetypes)
  add('enjoy',{priority:62,source:'archetypes',title:'Add one enjoyable thing',
   text:'On one heads-down day this week, plan a short break for something you enjoy, then compare how the day feels.',
   because:'The Heads-Down Day is your most common stand-out type ('+f.arch.headsdown+' days).'});
 // weekday
 if(f.rhythm&&have.rhythm)
  add('weekday',{priority:72,source:'rhythm',title:'Give '+f.rhythm.lo+' something to look forward to',
   text:'Add one small thing to look forward to on your next '+f.rhythm.lo+', such as a favourite meal or a short walk, and see how the day rates.',
   because:f.rhythm.lo+'s average '+f1(f.rhythm.loMean)+', your lowest weekday ('+f.rhythm.nlo+' days).'});
 // recent shift
 if(f.thenNow&&f.thenNow.length&&have.thennow){
  const a=f.thenNow[0];
  if(a.diff<0)add('shift',{priority:74,source:'thennow',title:'Notice what has changed',
   text:'On a few days this week, add a short note about what felt different. After a week or two, your notes can help you spot what has shifted.',
   because:'Your '+NAME[a.d]+' has been running lower lately ('+f1(a.now)+' vs '+f1(a.before)+').'});
  else add('shift',{priority:66,source:'thennow',title:'Notice what is going well',
   text:'When your '+NAME[a.d]+' feels good this week, jot down what you were doing and who you were with, so you can look back for common threads.',
   because:'Your '+NAME[a.d]+' has been running higher lately ('+f1(a.now)+' vs '+f1(a.before)+').'});
 }
 // note theme
 if(f.theme&&f.theme.diff>0&&have.notetheme)
  add('theme',{priority:80,source:'notetheme',title:'Try more '+f.theme.label,
   text:'Try fitting '+f.theme.label+' into two days this week and mention it in your note, so Insights can keep comparing.',
   because:'Days where your note mentioned '+f.theme.label+' averaged '+f1(f.theme.diff)+' points higher overall ('+f.theme.nw+' days).'});
 // starters: always optional and clearly labelled as experiments
 add('outdoors',{priority:20,starter:true,source:null,title:'Compare days with and without time outdoors',
  text:'For a week, add a word like \u201cwalk\u201d or \u201coutside\u201d to your note on days you get outdoors. Insights will then compare those days with the rest.',
  because:'A starter experiment. It does not rely on a pattern in your ratings.'});
 add('priority',{priority:18,starter:true,source:null,title:'Choose one main priority',
  text:'Tomorrow, choose one main priority instead of overloading your schedule, and notice how the day feels.',
  because:'A starter experiment. It does not rely on a pattern in your ratings.'});
 add('social',{priority:16,starter:true,source:null,title:'Plan one social moment',
  text:'Plan one small social moment this week, then compare that day\u2019s ratings with your usual.',
  because:'A starter experiment. It does not rely on a pattern in your ratings.'});
 return ex.sort((a,b)=>b.priority-a.priority).slice(0,3).map((e,i)=>Object.assign({id:'ex-'+e.kind},e));
}

/* ===================== OVERVIEW ===================== */
function buildOverview(ctx){
 const pc=ctx.pc,L=pc.len,cur=pc.cur,prev=pc.prev;
 const tiles=DIMS.map(d=>{
  const ok=cur.dims[d].n>=CFG.MIN_PERIOD;
  return {k:d,name:CAP[d],n:cur.dims[d].n,mean:ok?cur.dims[d].mean:null,
   prevMean:prev.dims[d].n>=CFG.MIN_PERIOD?prev.dims[d].mean:null,delta:pc.delta[d],trend:trend(pc.delta[d]),
   series:series(ctx.rows,ctx.today,L,d)};
 });
 let headline=null;
 const have=tiles.filter(t=>t.mean!=null);
 if(have.length){
  const cmp=have.filter(t=>t.delta!=null).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  if(cmp.length&&Math.abs(cmp[0].delta)>=CFG.MEANINGFUL){
   const t=cmp[0];
   headline='Your average '+NAME[t.k]+' was '+f1(t.mean)+' over the last '+L+' days, '+(t.delta>0?'up':'down')+' from '+f1(t.prevMean)+' in the '+L+' days before.';
  }else if(cmp.length)headline='Your ratings were steady over the last '+L+' days compared with the '+L+' days before.';
  else headline='Your average '+NAME[have[0].k]+' was '+f1(have[0].mean)+' over the last '+L+' days. More ratings will unlock comparisons.';
 }
 return {len:L,label:'Last '+L+' days',start:cur.start,end:cur.end,daysRated:cur.days,prevDaysRated:prev.days,prelim:pc.prelim,tiles,headline,
  hasData:have.length>0};
}

/* ===================== MAIN ===================== */
function analyze(input,todayStr,opts){
 opts=opts||{};
 const period=opts.period===30?30:7;
 const {rows,dropped}=clean(input,todayStr);
 const comp=rows.filter(r=>r.complete);
 const dflt=makeScorer(rows);
 const score=r=>{if(typeof opts.score==='function'){const s=opts.score(r);if(typeof s==='number'&&isFinite(s))return s}return dflt(r)};
 const status={total:rows.length,complete:comp.length,needTotal:CFG.MIN_TOTAL,needPairs:CFG.MIN_PAIRS,
  ready:rows.length>=CFG.MIN_TOTAL,discoverReady:comp.length>=CFG.MIN_PAIRS,
  first:rows.length?rows[0].date:null,last:rows.length?rows[rows.length-1].date:null,dropped};
 const out={status,period,config:CFG,overview:null,observe:[],discover:[],act:[],highlights:[],empty:{}};
 if(!status.ready){
  out.empty.all='Keep rating your days. As your history grows, you\u2019ll start discovering patterns unique to you.';
  return out;
 }
 const ctx={rows,comp,today:todayStr,score,status,levels:comp.length>=2?levelStats(comp):null,pc:comparePeriods(rows,todayStr,period),
  facts:{rel:{}}};
 out.overview=buildOverview(ctx);

 const obs=[insProgress,insExtremes,insConsistency,insRhythm,insThenNow,insTradeoff].map(f=>f(ctx)).filter(Boolean);
 const dis=status.discoverReady?[insRelationships,insBest,insLagging,insProductiveBest,insArchetypes,insNoteThemes,insDivergence,insLagged].map(f=>f(ctx)).filter(Boolean):[];
 const byPri=(a,b)=>b.priority-a.priority;
 out.observe=obs.sort(byPri);
 out.discover=dis.sort(byPri);
 if(!out.discover.length)out.empty.discover='Pattern insights unlock at '+CFG.MIN_PAIRS+' days with all three ratings. You have '+comp.length+'. Keep going and patterns unique to you will appear here.';
 const have={};out.observe.concat(out.discover).forEach(i=>{have[i.id]=true});
 out.act=buildExperiments(ctx,have);
 out.act.forEach(e=>{const t=out.observe.concat(out.discover).find(i=>i.id===e.source);if(t&&!t.actionId){t.actionId=e.id;t.actionText=e.title}});
 out.highlights=out.observe.concat(out.discover).filter(i=>i.priority>=60).sort(byPri).slice(0,3).map(i=>i.id);
 return out;
}

return {analyze,CFG,_internals:{clean,pearson,periodStats,comparePeriods,classify,levelStats,levelsOf,makeScorer,addDays,wdOf,isDate,ARCH,THEMES}};
});

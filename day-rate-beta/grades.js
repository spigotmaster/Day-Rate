/* Day Rate letter grades. Pure functions only: no DOM, no storage. Works in the page, in the service worker and in Node (tests).

   A grade is where a day sits among YOUR OWN days (a percentile), read through a soft curve:
   the middle of your days is a B, the top quarter is an A range, and F is only the bottom 3%.
     overall grade   rank of the day's 0-15 score among all your days' scores
     category grade  rank of the 1-10 rating among all your ratings in that category
   Ties share a rank (half of the tied days count as below), so a record where every day is the same grades B.
   Grades need MIN_DAYS rated days. They are derived, never stored, and move as your record grows (like the score).

   make(entries)              -> grader { ok, n, score(e), overall(e), cat(e,k), ofScore(h), ofRating(k,v) }
   gpa(list) / letterOfGpa(x) -> average of grades on a 4.3 scale, and back to a letter
   causal(avgs, minDays)      -> grades a day would have had when it was rated (only earlier days count). For achievements.
   weekSummary(entries, day)  -> the Monday to Sunday week containing `day`, graded, with the week before for comparison */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.DayRateGrades=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';

const MIN_DAYS=7;
/* lower edge of each band, as a share of your days that sit below. Soft curve: B is the centre, D and F are rare. */
const BANDS=[[.95,'A+'],[.85,'A'],[.75,'A-'],[.62,'B+'],[.48,'B'],[.36,'B-'],[.25,'C+'],[.15,'C'],[.08,'C-'],[.03,'D'],[0,'F']];
const PTS={'A+':4.3,'A':4,'A-':3.7,'B+':3.3,'B':3,'B-':2.7,'C+':2.3,'C':2,'C-':1.7,'D':1,'F':0};
const GPA_EDGES=[[4.15,'A+'],[3.85,'A'],[3.5,'A-'],[3.15,'B+'],[2.85,'B'],[2.5,'B-'],[2.15,'C+'],[1.85,'C'],[1.5,'C-'],[.5,'D'],[-1,'F']];
const KEYS=['m','p','c'];

const letterFor=p=>{for(const b of BANDS)if(p>=b[0])return b[1];return 'F'};
const letterOfGpa=g=>{for(const b of GPA_EDGES)if(g>=b[0])return b[1];return 'F'};
const ptsOf=l=>PTS[l];
/* top share of days, as a whole percent, never 0 */
const topPct=p=>Math.max(1,Math.min(100,Math.round((1-p)*100)));

/* sorted ascending numbers -> share of values below v, counting half of equal ones (mid-rank) */
function midRank(sorted,v){
 const n=sorted.length;if(!n)return .5;
 let lo=0,hi=n;while(lo<hi){const m=(lo+hi)>>1;if(sorted[m]<v)lo=m+1;else hi=m}
 const below=lo;hi=n;while(lo<hi){const m=(lo+hi)>>1;if(sorted[m]<=v)lo=m+1;else hi=m}
 return (below+(lo-below)/2)/n;
}
const mk=p=>{const l=letterFor(p);return {l,p,pts:PTS[l],top:topPct(p)}};
const okEntry=e=>e&&KEYS.every(k=>Number.isInteger(e[k])&&e[k]>=1&&e[k]<=10);

/* The app's score: each category 0-5 against your all-time min and max. This is the same formula as comp() in src/state.js
   (a test keeps the two identical). */
function statsOf(entries){
 const s={m:[11,0],p:[11,0],c:[11,0]};
 for(const k of Object.keys(entries||{})){const e=entries[k];if(!okEntry(e))continue;for(const d of KEYS){if(e[d]<s[d][0])s[d][0]=e[d];if(e[d]>s[d][1])s[d][1]=e[d]}}
 return s;
}
const comp=(e,d,s)=>{const lo=s[d][0],b=s[d][1]-lo;return b>0?Math.floor((1000*(e[d]-lo)+b)/(2*b)):250};
const scoreOf=(e,s)=>comp(e,'m',s)+comp(e,'p',s)+comp(e,'c',s);

function make(entries){
 const st=statsOf(entries),ks=Object.keys(entries||{}).filter(k=>okEntry(entries[k]));
 const scores=ks.map(k=>scoreOf(entries[k],st)).sort((a,b)=>a-b);
 const cats={};KEYS.forEach(d=>{cats[d]=ks.map(k=>entries[k][d]).sort((a,b)=>a-b)});
 const n=ks.length,ok=n>=MIN_DAYS;
 return {
  n,ok,stats:st,
  score:e=>scoreOf(e,st),
  ofScore:h=>ok?mk(midRank(scores,h)):null,
  ofRating:(d,v)=>ok?mk(midRank(cats[d],v)):null,
  overall(e){return ok&&okEntry(e)?mk(midRank(scores,scoreOf(e,st))):null},
  cat(e,d){return ok&&e&&typeof e[d]==='number'?mk(midRank(cats[d],e[d])):null}
 };
}

/* list of grade objects -> {gpa, letter, n} (null when empty) */
function gpa(list){
 const g=(list||[]).filter(Boolean);
 if(!g.length)return null;
 const v=g.reduce((s,x)=>s+x.pts,0)/g.length;
 return {gpa:v,letter:letterOfGpa(v),n:g.length};
}

/* Grades as they stood when each day was rated: day i is ranked only against days 0..i, and only once minDays earlier days exist.
   avgs: raw day averages in date order. Returns [{l, pts}|null]. Used by achievements, so an earned grade never moves later. */
function causal(avgs,minDays){
 const sorted=[],out=[];
 for(let i=0;i<avgs.length;i++){
  const v=avgs[i];
  let lo=0,hi=sorted.length;while(lo<hi){const m=(lo+hi)>>1;if(sorted[m]<v)lo=m+1;else hi=m}
  sorted.splice(lo,0,v);
  if(i+1<minDays){out.push(null);continue}
  const g=mk(midRank(sorted,v));out.push({l:g.l,pts:g.pts});
 }
 return out;
}

/* Monday to Sunday week containing `day` (YYYY-MM-DD), graded against the whole record. prev is the week before.
   Needs the record to have MIN_DAYS days and the week to have at least 3 rated days. Returns null otherwise. */
const dnum=s=>{const[a,b,c]=s.split('-').map(Number);return Math.round(Date.UTC(a,b-1,c)/864e5)};
const dstr=n=>new Date(n*864e5).toISOString().slice(0,10);
function weekSummary(entries,day){
 const g=make(entries);if(!g.ok||!/^\d{4}-\d\d-\d\d$/.test(day||''))return null;
 const dn=dnum(day),mon=dn-((dn+3)%7);
 const week=start=>{const list=[];for(let i=0;i<7;i++){const e=entries[dstr(start+i)];if(okEntry(e))list.push(g.overall(e))}return {n:list.length,g:gpa(list)}};
 const cur=week(mon),prev=week(mon-7);
 if(cur.n<3)return null;
 return {start:dstr(mon),n:cur.n,gpa:cur.g.gpa,letter:cur.g.letter,prev:prev.n>=3?{n:prev.n,gpa:prev.g.gpa,letter:prev.g.letter}:null};
}

/* Weekly goal: goal = {n: 1..7 days, min: a letter}. Progress for the Monday to Sunday week containing `day`.
   left = days still to come this week (today counts if it is not rated yet). status: met | on (still possible) | out. */
function goalProgress(entries,day,goal){
 const g=make(entries);
 if(!g.ok||!goal||PTS[goal.min]==null||!(goal.n>=1&&goal.n<=7)||!/^\d{4}-\d\d-\d\d$/.test(day||''))return null;
 const dn=dnum(day),mon=dn-((dn+3)%7);let have=0;
 for(let i=0;i<7;i++){const e=entries[dstr(mon+i)];if(okEntry(e)&&g.overall(e).pts>=PTS[goal.min]-1e-9)have++}
 const left=(mon+6-dn)+(okEntry(entries[day])?0:1);
 return {have,need:goal.n,min:goal.min,left,status:have>=goal.n?'met':have+left>=goal.n?'on':'out'};
}

/* Completed weeks before the week containing `day` (newest first, up to 8) that have at least 4 rated days, each as a list of overall grades. */
const SUGGEST_LETTERS=['B-','B','B+','A-','A'];
function pastWeeks(entries,g,day){
 const dn=dnum(day),mon=dn-((dn+3)%7),out=[];
 for(let w=1;w<=16&&out.length<8;w++){
  const list=[];for(let i=0;i<7;i++){const e=entries[dstr(mon-7*w+i)];if(okEntry(e))list.push(g.overall(e))}
  if(list.length>=4)out.push(list);
 }
 return out;
}
/* A goal that you met in about 5 to 7 of every 10 recent weeks: real but not a gimme. Needs 3 completed weeks. */
function suggestGoal(entries,day){
 const g=make(entries);if(!g.ok||!/^\d{4}-\d\d-\d\d$/.test(day||''))return null;
 const weeks=pastWeeks(entries,g,day);if(weeks.length<3)return null;
 const cands=[];
 for(const l of SUGGEST_LETTERS)for(let n=1;n<=7;n++){
  const hit=weeks.filter(w=>w.filter(x=>x.pts>=PTS[l]-1e-9).length>=n).length;
  cands.push({n,min:l,hit,weeks:weeks.length,rate:hit/weeks.length,hard:n*PTS[l]});
 }
 const pool=cands.filter(c=>c.rate>=.5&&c.rate<=.75);
 const best=pool.length?pool.sort((a,b)=>b.hard-a.hard)[0]:cands.sort((a,b)=>Math.abs(a.rate-.6)-Math.abs(b.rate-.6)||b.hard-a.hard)[0];
 return {n:best.n,min:best.min,hit:best.hit,weeks:best.weeks};
}
/* "Average week": this week's average grade so far against the typical completed week (mean of recent weekly GPAs). */
function avgWeek(entries,day){
 const g=make(entries);if(!g.ok||!/^\d{4}-\d\d-\d\d$/.test(day||''))return null;
 const weeks=pastWeeks(entries,g,day);if(weeks.length<3)return null;
 const tg=weeks.reduce((s,w)=>s+gpa(w).gpa,0)/weeks.length;
 const dn=dnum(day),mon=dn-((dn+3)%7),list=[];
 for(let i=0;i<7;i++){const e=entries[dstr(mon+i)];if(okEntry(e))list.push(g.overall(e))}
 const cur=gpa(list);
 return {target:{gpa:tg,letter:letterOfGpa(tg),weeks:weeks.length},cur:cur?{gpa:cur.gpa,letter:cur.letter,n:cur.n}:null,
  status:!cur||cur.n<2?'early':cur.gpa>=tg-.05?'ahead':'behind'};
}

return {MIN_DAYS,BANDS,PTS,suggestGoal,avgWeek,goalProgress,make,gpa,letterFor,letterOfGpa,ptsOf,midRank,causal,weekSummary,statsOf,comp,scoreOf};
});

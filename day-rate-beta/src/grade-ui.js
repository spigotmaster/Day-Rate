import {E,META,gEpoch,saveMeta} from './state.js';
import {today} from './util.js';

/* Letter grades in the UI. The maths is grades.js (a classic script, global DayRateGrades); this file only caches it and draws badges.
   Grades are derived from the ratings every time and never stored. Data > Settings can switch them off (META.grades === false). */
let memo=null,memoE=null,memoEp=-1;
export const gradesOn=()=>META.grades!==false&&typeof DayRateGrades!=='undefined';
export function grader(){
 if(!gradesOn())return null;
 if(!memo||memoE!==E||memoEp!==gEpoch){memo=DayRateGrades.make(E);memoE=E;memoEp=gEpoch}
 return memo.ok?memo:null;
}
export const dayGrade=e=>{const g=grader();return g&&e?g.overall(e):null};
export const catGrade=(e,k)=>{const g=grader();return g&&e?g.cat(e,k):null};
export const spoken=l=>String(l).replace('+',' plus').replace('-',' minus');
export const topLine=g=>g?'Top '+g.top+'% of your days':'';
export function badge(g,cls){
 const s=document.createElement('span');s.className='gr'+(cls?' '+cls:'');s.textContent=g.l;
 s.setAttribute('aria-label','Grade '+spoken(g.l));return s;
}
/* GPA of a list of grade objects, as {gpa, letter, n} (null when empty or grades are off) */
export const gpaOf=list=>gradesOn()?DayRateGrades.gpa(list):null;
export const gpaText=x=>x?x.letter+' ('+x.gpa.toFixed(1)+')':'';
/* average grade of the days in [{e}] rows, using the caller's own list of entries */
export function gpaOfEntries(entries){const g=grader();return g?DayRateGrades.gpa(entries.map(e=>g.overall(e))):null}
/* "up from B", "down from A-", "steady" (null when there is nothing to compare) */
export function gradeChange(cur,prev){
 if(!cur||!prev)return '';
 const d=cur.gpa-prev.gpa;
 return Math.abs(d)<.15?'steady':(d>0?'up from ':'down from ')+prev.letter;
}
/* a stored average of grade points (from review.js) as {gpa, letter} */
export const gpaFrom=v=>v==null||!gradesOn()?null:{gpa:v,letter:DayRateGrades.letterOfGpa(v)};
/* Weekly grade goals. META.goal = {n, min}: N days a week at a grade or better. META.goalAvg: compare each week with your average week.
   Suggestions are worked out from your past weeks. All of it shows only AFTER you rate, so it cannot nudge a rating. */
export const GOAL_LETTERS=['B-','B','B+','A-','A'];
export const goalSuggestion=()=>gradesOn()?DayRateGrades.suggestGoal(E,today()):null;
export const avgInfo=()=>gradesOn()?DayRateGrades.avgWeek(E,today()):null;
export const suggestText=s=>s.n+(s.n===1?' day':' days')+' a week at '+s.min+' or better (you hit that in '+s.hit+' of your last '+s.weeks+' weeks)';
export function goalLines(){
 if(!gradesOn())return [];
 const out=[],g=META.goal;
 if(g){
  const p=DayRateGrades.goalProgress(E,today(),g);
  if(p){
   const base=p.have+' of '+p.need+(p.need===1?' day':' days')+' at '+p.min+' or better this week';
   out.push(p.status==='met'?'Goal met: '+base+'.':p.status==='on'?'Goal: '+base+' \u00b7 '+p.left+(p.left===1?' day':' days')+' left.':'Goal: '+base+'. Out of reach this week; a new week starts Monday.');
  }
 }
 if(META.goalAvg){
  const a=avgInfo();
  if(a){
   const t=a.target.letter+' ('+a.target.gpa.toFixed(1)+')';
   out.push(a.status==='early'?'Average-week goal: your usual week is '+t+'. Rate a few more days to compare.'
    :'Average-week goal: this week is '+a.cur.letter+' ('+a.cur.gpa.toFixed(1)+') so far, your usual week is '+t+' \u00b7 '+(a.status==='ahead'?'on or above it.':'a little below it.'));
  }
 }
 return out;
}
/* Draws goal progress, or (when there is no goal yet) a suggestion with buttons, into el. Result screen, today only. */
export function drawGoal(el,showIt){
 el.replaceChildren();
 const lines=showIt?goalLines():[];
 lines.forEach(t=>{const d=document.createElement('div');d.textContent=t;el.appendChild(d)});
 const sug=showIt&&!META.goal&&!META.goalNo?goalSuggestion():null,avg=showIt&&!META.goalAvg&&!META.goalNo?avgInfo():null;
 if((sug||avg)&&!lines.length){
  const mk=(txt,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn gbtn';b.textContent=txt;b.onclick=()=>{fn();saveMeta();drawGoal(el,true)};return b};
  const p=document.createElement('div');p.textContent='Goal ideas, based on your past weeks:';el.appendChild(p);
  if(sug)el.appendChild(mk('Set: '+suggestText(sug),()=>{META.goal={n:sug.n,min:sug.min}}));
  if(avg)el.appendChild(mk('Beat my average week ('+avg.target.letter+')',()=>{META.goalAvg=true}));
  el.appendChild(mk('Not now',()=>{META.goalNo=true}));
 }
 el.hidden=!el.childNodes.length;
}

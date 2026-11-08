import {today,parse,ds} from './util.js';
import {E,label} from './state.js';
import {KEYS,NAMES,forecast,backtest,patterns,CFG} from './forecast.js';

/* Expected values. The numbers come from forecast.js (an equation over your own history); nothing here is stored. */
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const addD=(k,n)=>{const d=parse(k);return ds(new Date(d.getFullYear(),d.getMonth(),d.getDate()+n))};
const f1=v=>(Math.round(v*10)/10).toFixed(1);
const sg=v=>(v<0?'\u2212':'+')+f1(Math.abs(v));

function block(date,title){
 const f=forecast(E,date),box=el('div','fcb'),e=E[date];
 box.appendChild(el('h3',null,title));
 if(!f.ok){box.appendChild(el('p','fcn','Expected values start after '+f.need+(f.need===1?' more rated day.':' more rated days.')));return box}
 for(const k of KEYS){
  const m=f.metrics[k],row=el('div','fcr');
  row.appendChild(el('span','fcl',NAMES[k]));
  row.appendChild(el('span','fcv',f1(m.ev)));
  row.appendChild(el('span','fcg',f1(m.lo)+' to '+f1(m.hi)));
  if(e){const d=e[k]-m.ev;row.appendChild(el('span','fcs','Rated '+e[k]+' \u00b7 '+(Math.abs(d)<.5?'as expected':f1(Math.abs(d))+(d>0?' above':' below'))))}
  box.appendChild(row);
 }
 box.appendChild(el('p','fcn',(f.prelim?'Preliminary, from '+f.n+' days. ':'From '+f.n+' days. ')+'Confidence: '+KEYS.map(k=>NAMES[k]+' '+f.metrics[k].confLabel.toLowerCase()).join(', ')+'. Range covers about 8 in 10 days.'));
 const why=el('details','fcw'),sm=el('summary',null,'Why these numbers');why.appendChild(sm);
 for(const k of KEYS){
  const m=f.metrics[k],bits=m.drivers.map(d=>sg(d.points)+' from '+d.label);
  why.appendChild(el('p',null,NAMES[k]+': starts from your average of '+f1(m.mean)+(bits.length?', then '+bits.join(', '):', and nothing else moves it much')+'.'));
 }
 if(KEYS.every(k=>f.metrics[k].rules)){
  why.appendChild(el('p','fcw2','Plain-language version (fixed weights)'));
  for(const k of KEYS){const r=f.metrics[k].rules;why.appendChild(el('p',null,NAMES[k]+' is expected at '+f1(r.ev)+' because '+r.because+'.'))}
  why.appendChild(el('p','fcn','Weights: similar days 40%, week so far 20%, streak 15%, weekday 10%, mean reversion 10%, your other ratings 5%. A part that cannot be worked out yet (no streak, or Monday with no week so far) hands its share to the others. The big numbers above use weights learned from your own days instead.'));
 }
 box.appendChild(why);
 return box;
}
export function expectCard(date){
 const box=el('div','fc'),t=today(),rated=!!E[date];
 box.appendChild(block(date,date===t?(rated?'Expected for today':'Expected today'):'Expected for '+label(date)));
 if(date===t&&rated)box.appendChild(block(addD(date,1),'Expected tomorrow'));
 return box;
}

/* Insights card: how the equation has done on the chosen period, and your recovery habits */
let memo=null;
export function forecastStatsCard(per){
 const t=today(),dates=[];for(let i=0;i<per;i++){const k=addD(t,-i);if(E[k])dates.push(k)}
 const ks=Object.keys(E),sig=per+':'+ks.length+':'+ks.reduce((a,k)=>Math.max(a,E[k].updated||0),0)+':'+t;
 if(!memo||memo.sig!==sig)memo={sig,bt:backtest(E,dates),pat:patterns(E)};
 const c=el('div','card');c.appendChild(el('h2',null,'Forecast accuracy'));
 let n=0;
 for(const k of KEYS){
  const b=memo.bt[k];
  if(b.n>=5){n++;c.appendChild(el('p',null,NAMES[k]+': off by '+f1(b.mae)+' on average with the learned weights'+(b.rules!=null?', '+f1(b.rules)+' with the fixed-weight rules':'')+', '+f1(b.naive)+' if you had guessed your overall average; '+Math.round(b.coverage*100)+'% of days landed inside the range ('+b.n+' days).'))}
 }
 if(!n)c.appendChild(el('p',null,'Needs at least 5 rated days in this period, each with '+CFG.minRows+' days of history before it, to compare forecasts with what happened.'));
 const pat=memo.pat,lines=[];
 if(pat)for(const k of KEYS){
  const p=pat[k],nm=NAMES[k].toLowerCase();
  if(p.lowDays>=4)lines.push('After a low '+nm+' day you were back to normal the next day '+Math.round(p.recover*100)+'% of the time.');
  if(p.highDays>=4)lines.push('After an unusually high '+nm+' day you cooled off the next day '+Math.round(p.cooled*100)+'% of the time.');
  if(p.slumps>=3)lines.push('Low '+nm+' stretches last '+f1(p.slumpLen)+' days on average.');
 }
 if(lines.length){const d=el('details','fcw'),s=el('summary',null,'Recovery patterns');d.appendChild(s);lines.forEach(x=>d.appendChild(el('p',null,x)));c.appendChild(d)}
 return c;
}

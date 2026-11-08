import {$,ds,parse,today} from './util.js';
import {E,H,col,fmt,tOf} from './state.js';
import {step} from './rate.js';
import {n1} from './insights-ui.js';

/* trends */
export let range=14,trSel=['s'];
$('#seg').onclick=e=>{const b=e.target.closest('button');if(!b)return;range=+b.dataset.r;renderTrend()};
$('#trs').onclick=e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.s;
 if(k==='s')trSel=['s'];
 else{const r=trSel.filter(x=>x!=='s');trSel=r.includes(k)?r.filter(x=>x!==k):r.concat(k);if(!trSel.length)trSel=['s']}
 renderTrend()};
export const TRS={s:{name:'Score',get:e=>H(e)},m:{name:'Mood',get:e=>e.m},p:{name:'Productivity',get:e=>e.p},c:{name:'Connection',get:e=>e.c}};
export const TRSTY={m:{v:'var(--lm)',dash:'',sh:'circle'},p:{v:'var(--lp)',dash:'7 4',sh:'square'},c:{v:'var(--lc)',dash:'1.5 4.5',sh:'tri'}};
export const r1=v=>Math.round(v*10)/10;
export function mkr(sh,x,y,r,fill){x=r1(x);y=r1(y);const f='style="fill:'+fill+'"';
 return sh==='square'?'<rect class="mk" x="'+r1(x-r)+'" y="'+r1(y-r)+'" width="'+2*r+'" height="'+2*r+'" rx="1" '+f+'/>':
  sh==='tri'?'<polygon class="mk" points="'+x+','+r1(y-r-.5)+' '+r1(x+r+.5)+','+r1(y+r)+' '+r1(x-r-.5)+','+r1(y+r)+'" '+f+'/>':
  '<circle class="mk" cx="'+x+'" cy="'+y+'" r="'+r+'" '+f+'/>';
}
export function renderTrend(){
 [...$('#seg').children].forEach(b=>b.classList.toggle('on',+b.dataset.r===range));
 [...$('#trs').children].forEach(b=>{const on=trSel.includes(b.dataset.s);b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
 const score=trSel[0]==='s',td=parse(today()),W=340,Ht=210,L=28,R=8,T=10,B=26,pw=W-L-R,ph=Ht-T-B;
 const day=i=>ds(new Date(td.getFullYear(),td.getMonth(),td.getDate()-i));
 const step=range>60?7:1,n=Math.ceil(range/step),lo=score?0:1,hi=score?1500:10;
 const X=b=>L+pw*b/(n-1),Y=v=>T+ph*(1-(v-lo)/(hi-lo)),rad=n>31?3:4.5;
 let g='';
 (score?[0,5,10,15]:[1,4,7,10]).forEach(v=>{const y=Y(score?v*100:v);g+='<line class="gl" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(L-5)+'" y="'+(y+3)+'" text-anchor="end">'+v+'</text>'});
 const lab=i=>parse(day(i)).toLocaleDateString(undefined,{day:'numeric',month:'short'});
 g+='<text x="'+L+'" y="'+(Ht-8)+'">'+lab(range-1)+'</text><text x="'+(L+pw/2)+'" y="'+(Ht-8)+'" text-anchor="middle">'+lab(Math.round((range-1)/2))+'</text><text x="'+(W-R)+'" y="'+(Ht-8)+'" text-anchor="end">Today</text>';
 trSel.forEach(k=>{
  const bs=[];for(let b=0;b<n;b++){let sm=0,c=0;for(let j=0;j<step;j++){const i=range-1-(b*step+j);if(i<0)continue;const e=E[day(i)];if(e){sm+=TRS[k].get(e);c++}}bs.push(c?sm/c:null)}
  const sty=TRSTY[k];let d='',dots='',prev=false;
  bs.forEach((v,b)=>{if(v==null){prev=false;return}
   d+=(prev?'L':'M')+X(b).toFixed(1)+' '+Y(v).toFixed(1);prev=true;
   dots+=score?mkr('circle',X(b),Y(v),rad,'rgb('+col(tOf(v))+')'):mkr(sty.sh,X(b),Y(v),rad,sty.v)});
  g+='<path class="ln" d="'+d+'"'+(score?'':' style="stroke:'+sty.v+(sty.dash?';stroke-dasharray:'+sty.dash:'')+'"')+'/>'+dots;
 });
 $('#chart').innerHTML=g;
 $('#chart').setAttribute('aria-label',score?'Score over time':trSel.map(k=>TRS[k].name).join(', ')+' ratings over time');
 $('#tleg').innerHTML=score?'Score out of 15':trSel.map(k=>{const t=TRSTY[k];return '<span class="lk"><svg viewBox="0 0 28 10" aria-hidden="true"><line x1="2" x2="26" y1="5" y2="5" style="stroke:'+t.v+';stroke-width:2;stroke-linecap:round'+(t.dash?';stroke-dasharray:'+t.dash:'')+'"/>'+mkr(t.sh,14,5,3.5,t.v)+'</svg>'+TRS[k].name+'</span>'}).join('')+'<span>Rated 1 to 10</span>';
 const rows=[];for(let i=0;i<range;i++){const e=E[day(i)];if(e)rows.push(e)}
 const avg=a=>a.reduce((x,y)=>x+y,0)/a.length,wk=range>60?'. Weekly averages shown.':'';
 let t;
 if(!rows.length)t='No rated days in this range yet.';
 else if(score){const v=rows.map(H);t=v.length+' of '+range+' days rated · average '+fmt(Math.round(avg(v)))+' / 15 · best '+fmt(Math.max(...v))+' · lowest '+fmt(Math.min(...v))+wk}
 else t=rows.length+' of '+range+' days rated · '+trSel.map(k=>{const v=rows.map(TRS[k].get);return TRS[k].name+' average '+n1(avg(v))+(trSel.length===1?' · best '+Math.max(...v)+' · lowest '+Math.min(...v):'')}).join(' · ')+wk;
 $('#trsum').textContent=t;
}



import {$} from './util.js';
import {H,META,buzz,reduce} from './state.js';
import {C,raf} from './rate.js';
import {dfmt,pip} from './ach-ui.js';

/* celebration: centre popup + fireworks + synthesized sound (no audio files) */
export let AC=null,NZ=null,MG=null;
export function ac(){
 if(META.sound===false)return null;
 try{
  if(!AC){
   const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
   AC=new C();MG=AC.createGain();MG.gain.value=.55;
   const cp=AC.createDynamicsCompressor();MG.connect(cp);cp.connect(AC.destination);
   const n=AC.sampleRate;NZ=AC.createBuffer(1,n,AC.sampleRate);const d=NZ.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
  }
  if(AC.state==='suspended')AC.resume();
  return AC;
 }catch(e){return null}
}
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{ac()},{passive:true}));
export function tone(f,t,dur,type,g,f2){
 const a=ac();if(!a)return;const n=a.currentTime+t,o=a.createOscillator(),v=a.createGain();
 o.type=type||'sine';o.frequency.setValueAtTime(f,n);if(f2)o.frequency.exponentialRampToValueAtTime(f2,n+dur);
 v.gain.setValueAtTime(.0001,n);v.gain.exponentialRampToValueAtTime(g,n+.015);v.gain.exponentialRampToValueAtTime(.0001,n+dur);
 o.connect(v);v.connect(MG);o.start(n);o.stop(n+dur+.05);
}
export function noise(t,dur,fr,q,g){
 const a=ac();if(!a)return;const n=a.currentTime+t,s=a.createBufferSource(),f=a.createBiquadFilter(),v=a.createGain();
 s.buffer=NZ;f.type='bandpass';f.frequency.value=fr;f.Q.value=q;
 v.gain.setValueAtTime(g,n);v.gain.exponentialRampToValueAtTime(.0001,n+dur);
 s.connect(f);f.connect(v);v.connect(MG);s.start(n,Math.random()*.5);s.stop(n+dur+.05);
}
export function sfxFanfare(power){
 [523.25,659.25,783.99,1046.5].forEach((f,i)=>{tone(f,i*.085,.4,'triangle',.22);tone(f*2,i*.085,.25,'sine',.06)});
 [1046.5,1318.5,1568].forEach(f=>{tone(f,.36,1.3,'triangle',.15);tone(f/2,.36,1.3,'sine',.1)});
 if(power>1)[1568,1864.7,2093].forEach((f,i)=>tone(f,.5+i*.08,.9,'sine',.09));
 for(let i=0;i<7;i++)tone(2200+Math.random()*2400,.4+i*.09,.14,'sine',.06);
}
export function sfxLaunch(){tone(380,0,.6,'sine',.05,1700);noise(0,.5,2500,1,.04)}
export function sfxBurst(){
 noise(0,.4,1600,.7,.55);tone(150,0,.32,'sine',.55,42);
 for(let i=0;i<5;i++)noise(.12+Math.random()*.55,.05,3500+Math.random()*3000,2,.2);
}

export const FW={rk:[],pt:[],raf:0,on:false,fin:false,last:0,end:0,next:0,dpr:1,power:1};
export const FWC=['#f5c84c','#ffd98a','#4cc3d9','#b8a2ff','#ff7eb6','#ffffff','#7be3a0'];
export const pickC=()=>FWC[Math.floor(Math.random()*FWC.length)];
export function fwStart(power){
 if(reduce)return;
 const cv=$('#celCv'),dpr=Math.min(2,window.devicePixelRatio||1),now=performance.now();
 cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;
 Object.assign(FW,{rk:[],pt:[],dpr,on:true,fin:false,last:now,end:now+3200+power*1200,next:now+150,power});
 cancelAnimationFrame(FW.raf);FW.raf=requestAnimationFrame(fwLoop);
}
export function fwStop(){FW.on=false;cancelAnimationFrame(FW.raf);const cv=$('#celCv');cv.getContext('2d').clearRect(0,0,cv.width,cv.height)}
export function fwRocket(){
 const W=innerWidth,H=innerHeight,x=W*(.12+Math.random()*.76);
 FW.rk.push({sx:x,tx:x+(Math.random()-.5)*50,ty:H*(.1+Math.random()*.32),t:0,dur:650+Math.random()*350,c:pickC(),x,y:H});
 sfxLaunch();
}
export function fwBurst(x,y,c){
 const n=Math.round(55+FW.power*22),type=Math.random(),pal=[c,pickC()];
 for(let i=0;i<n;i++){
  const a=Math.PI*2*i/n+Math.random()*.2,willow=type>=.7;
  const sp=type<.4?1.5+Math.random()*4.5:type<.7?4.2+Math.random()*.4:1+Math.random()*3.2;
  FW.pt.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:willow?.006+Math.random()*.004:.012+Math.random()*.012,g:willow?.04:.05,c:willow?'#f5c84c':pal[i%2],s:1.5+Math.random()*1.6});
 }
 sfxBurst();
}
export function fwLoop(now){
 if(!FW.on)return;
 const x=$('#celCv').getContext('2d'),k=Math.min(3,(now-FW.last)/16.67);FW.last=now;
 x.setTransform(FW.dpr,0,0,FW.dpr,0,0);
 x.globalCompositeOperation='destination-out';x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,0,innerWidth,innerHeight);
 x.globalCompositeOperation='lighter';
 if(now<FW.end&&now>=FW.next){fwRocket();FW.next=now+380+Math.random()*320}
 if(!FW.fin&&now>=FW.end-200){FW.fin=true;for(let i=0;i<3+FW.power;i++)setTimeout(()=>{if(FW.on)fwRocket()},i*140)}
 FW.rk=FW.rk.filter(r=>{
  r.t+=k*16.67;const p=Math.min(1,r.t/r.dur),e=1-(1-p)*(1-p);
  r.x=r.sx+(r.tx-r.sx)*e;r.y=innerHeight+(r.ty-innerHeight)*e;
  x.globalAlpha=1;x.fillStyle=r.c;x.beginPath();x.arc(r.x,r.y,2.2,0,6.283);x.fill();
  if(p>=1){fwBurst(r.x,r.y,r.c);return false}return true;
 });
 FW.pt=FW.pt.filter(q=>{
  q.vx*=Math.pow(.985,k);q.vy=q.vy*Math.pow(.985,k)+q.g*k;q.x+=q.vx*k;q.y+=q.vy*k;q.life-=q.decay*k;
  if(q.life<=0)return false;
  x.globalAlpha=Math.min(1,q.life*(.7+.3*Math.random()));x.fillStyle=q.c;x.beginPath();x.arc(q.x,q.y,q.s*(.5+q.life*.5),0,6.283);x.fill();return true;
 });
 x.globalAlpha=1;
 if(now>FW.end+1000&&!FW.rk.length&&!FW.pt.length){FW.on=false;return}
 FW.raf=requestAnimationFrame(fwLoop);
}

export let celQ=[],celTotal=0,celIdx=0,celOpen=false,celAt=0,celBack=null;
export function celebrate(list){
 if(!list||!list.length)return;
 if(!celOpen){celQ=list.slice();celTotal=celQ.length;celIdx=0;celNext(true)}
 else{celQ=celQ.concat(list);celTotal+=list.length}
}
export function celNext(first){
 const it=celQ.shift();if(!it){celClose();return}
 celIdx++;
 const o=$('#cele');
 $('#celK').textContent='Achievement unlocked'+(celTotal>1?' \u00b7 '+celIdx+' of '+celTotal:'');
 $('#celT').textContent=it.title;$('#celD').textContent=it.desc;
 $('#celM').textContent=(it.levels>1?'Level '+it.level+' of '+it.levels+' \u00b7 ':'')+'Earned '+dfmt(it.date);
 $('#celOk').textContent=celQ.length?'Next':'Nice!';
 const pw=Math.min(3,it.level||1);
 if(first){celBack=document.activeElement;o.hidden=false;void o.offsetWidth;o.classList.add('on');celOpen=true}
 else{const c=$('.celCard');c.style.animation='none';void c.offsetWidth;c.style.animation=''}
 celAt=Date.now();
 $('#celOk').focus({preventScroll:true});
 fwStop();fwStart(pw);sfxFanfare(pw);buzz(3);
}
export function celClose(){
 const o=$('#cele');o.classList.remove('on');o.hidden=true;celOpen=false;celQ=[];fwStop();
 try{celBack&&celBack.focus&&celBack.focus({preventScroll:true})}catch(e){}
 pip();
}
$('#celOk').onclick=()=>celNext(false);
$('#cele').addEventListener('pointerdown',e=>{if(e.target.id==='cele'&&Date.now()-celAt>700)celNext(false)});
document.addEventListener('keydown',e=>{
 if(!celOpen)return;
 if(e.key==='Escape')celClose();
 else if(e.key==='Tab'){e.preventDefault();$('#celOk').focus()}
});


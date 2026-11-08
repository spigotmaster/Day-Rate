import {$,parse} from './util.js';
import {openStore,requestPersistence} from './storage.js';
import {migrate} from './migrate.js';
import {createErrorLog} from './errorlog.js';

export const VERSION='1.18';
export const KEY='dayrate:v1';
const safeLS=(()=>{try{return localStorage}catch(e){return {getItem:()=>null,setItem(){},removeItem(){}}}})();
export const errorLog=createErrorLog({storage:safeLS});
/* status.ready is false until stored data has loaded; nothing is written before then so an early tap can never overwrite real data.
   readOnly is set when the stored data comes from a newer app version. */
export const status={ready:false,readOnly:false,backend:'localStorage',schema:1,from:'none',demo:false};
let store=null,rev=0;
const lsw=(k,v)=>{try{localStorage.setItem(k,v);return true}catch(e){errorLog.add('save',e,k);return false}};
const touch=()=>{rev++;lsw('dayrate:rev',String(rev))};
function persist(){if(!store)return;Promise.all([store.set('entries',E),store.set('meta',META),store.set('rev',rev)]).catch(e=>errorLog.add('idb',e))}
export let E={};
export function save(){recalc();if(status.ready&&!status.readOnly&&!status.demo){lsw(KEY,JSON.stringify(E));touch();persist()}if(curView==='ins'&&hooks.renderInsights)hooks.renderInsights()}
export const ls=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
export let META={haptics:true,sound:true},curView='res';
export const saveMeta=()=>{if(!status.ready||status.readOnly||status.demo)return;lsw('dayrate:meta',JSON.stringify(META));touch();persist()};
export const overdue=()=>Object.keys(E).length>0&&(!META.lastBackup||Date.now()-META.lastBackup>7*864e5);
/*SCORE*/
export let STATS={};
export function recalc(){const s={m:[11,0],p:[11,0],c:[11,0]};for(const k in E){const e=E[k];for(const d of ['m','p','c']){if(e[d]<s[d][0])s[d][0]=e[d];if(e[d]>s[d][1])s[d][1]=e[d]}}STATS=s}
export const comp=(e,d)=>{const lo=STATS[d][0],b=STATS[d][1]-lo;return b>0?Math.floor((1000*(e[d]-lo)+b)/(2*b)):250};
export const H=e=>comp(e,'m')+comp(e,'p')+comp(e,'c');
recalc();
/*END*/
export const fmt=h=>(Math.floor((h+5)/10)/10).toFixed(1);
export const tOf=h=>h/1500;
export const STOPS=[[0,[46,42,110]],[.35,[31,122,140]],[.7,[232,162,58]],[1,[245,200,76]]];
export function col(t){t=Math.max(0,Math.min(1,t));for(let i=1;i<4;i++){if(t<=STOPS[i][0]){const[a,A]=STOPS[i-1],[b,B]=STOPS[i],f=(t-a)/(b-a);return A.map((v,j)=>Math.round(v+(B[j]-v)*f))}}return STOPS[3][1]}
export function textOn(c){return (.2126*c[0]+.7152*c[1]+.0722*c[2])/255>.55?'#1d1a33':'#ffffff'}
export function paint(el,t){const c=col(t);el.style.background='rgb('+c+')';el.style.color=textOn(c)}
export const label=s=>parse(s).toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
export const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* haptics: unverified on iOS Safari; falls back silently */
export const hap=$('#hap');
export function tick(){if(!META.haptics)return;try{navigator.vibrate&&navigator.vibrate(8)}catch(e){}try{hap.click()}catch(e){}}
export function buzz(n){for(let i=0;i<n;i++)setTimeout(tick,i*70)}

export const hooks={};
export const setE=v=>{E=v};
export const setView=v=>{curView=v};

const lsJSON=k=>{try{const v=localStorage.getItem(k);return v==null?undefined:JSON.parse(v)}catch(e){errorLog.add('read',e,k);return undefined}};
/* Load order: IndexedDB (unless localStorage is newer by revision) -> migrate -> adopt. The first run copies old localStorage data into
   IndexedDB without deleting it. A pre-migration backup is kept in IndexedDB (and localStorage when it fits) before anything is rewritten. */
export async function initStore(){
 const lsE=lsJSON(KEY),lsM=lsJSON('dayrate:meta'),lsRev=Number(ls('dayrate:rev'))||0,had=lsE!==undefined||lsM!==undefined;
 let snap={entries:lsE&&typeof lsE==='object'?lsE:{},meta:lsM&&typeof lsM==='object'?lsM:{}},idbRev=0;
 status.from='localStorage';
 try{
  store=await openStore({mirror:false});status.backend=store.backend;
  if(store.backend==='idb'){
   idbRev=Number(await store.get('rev'))||0;
   if((await store.get('entries'))!==undefined&&idbRev>=lsRev){snap=await store.snapshot();status.from='idb'}
  }
 }catch(e){errorLog.add('init',e,'open');store=null}
 const r=migrate(snap);
 if(r.status==='newer'){status.readOnly=true;errorLog.add('migrate','data is from a newer app (schema '+r.from+')')}
 else if(r.status==='failed'){errorLog.add('migrate',r.error)}
 else if(r.status==='migrated'){
  try{if(store)await store.set('backup-pre-v'+r.to,r.backup)}catch(e){errorLog.add('backup',e)}
  lsw('dayrate:premigrate',JSON.stringify(r.backup));
  snap=r.db;
 }
 E=snap.entries||{};Object.assign(META,snap.meta||{});status.schema=Number(META.schema)||1;
 recalc();rev=Math.max(lsRev,idbRev);status.ready=true;
 if(!status.readOnly&&had&&(status.from!=='idb'||r.status==='migrated')){lsw(KEY,JSON.stringify(E));lsw('dayrate:meta',JSON.stringify(META));touch();persist()}
 else if(!status.readOnly&&status.from==='idb'&&lsE===undefined){lsw(KEY,JSON.stringify(E));lsw('dayrate:meta',JSON.stringify(META));lsw('dayrate:rev',String(rev))} /* refill the localStorage copy if the browser cleared it */
 return status;
}
export {requestPersistence};
export function replaceMeta(o){for(const k of Object.keys(META))delete META[k];Object.assign(META,o)}

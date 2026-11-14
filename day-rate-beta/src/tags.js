import {E,META,save,saveMeta} from './state.js';

/* Tags: seven built in, plus up to 12 of your own (META.ctags = [{id, name}]).
   A day stores tag ids. Built-in ids are two letters; your own are 'x' + letters/digits, so renaming a tag never touches your days.
   This is a leaf module (it imports only state) so every screen can use it without import cycles. */
export const TAGS=[['sl','Slept well'],['ex','Exercise'],['ou','Outdoors'],['so','Social'],['al','Alcohol'],['ld','Heavy workload'],['un','Unwell']];
export const MAX_CUSTOM=12,MAX_LEN=24;
export const CID=/^x[a-z0-9]{1,12}$/;
export const customTags=()=>(Array.isArray(META.ctags)?META.ctags:[]).filter(x=>x&&CID.test(x.id)&&typeof x.name==='string'&&x.name.trim());
export const allTags=()=>TAGS.concat(customTags().map(x=>[x.id,x.name]));
/* live label lookup: TAGLBL[id] works for built-in and custom ids alike */
export const TAGLBL=new Proxy({},{
 get(_,k){if(typeof k!=='string')return undefined;const b=TAGS.find(x=>x[0]===k);if(b)return b[1];const c=customTags().find(x=>x.id===k);return c?c.name:undefined},
 has(_,k){return typeof k==='string'&&(TAGS.some(x=>x[0]===k)||customTags().some(x=>x.id===k))}
});
export const tagList=a=>allTags().map(x=>x[0]).filter(id=>a.includes(id));
export const tagNames=()=>Object.fromEntries(customTags().map(x=>[x.id,x.name]));
export const usesOf=id=>Object.keys(E).filter(k=>(E[k].tags||[]).includes(id)).length;

const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim().slice(0,MAX_LEN);
const taken=(name,exceptId)=>allTags().some(([id,n])=>id!==exceptId&&n.toLowerCase()===name.toLowerCase());
/* each returns {id,name} on success or {err} with words for the person */
export function addCustomTag(raw){
 const name=clean(raw);
 if(!name)return {err:'Type a name first.'};
 if(taken(name))return {err:'You already have a tag called that.'};
 if(customTags().length>=MAX_CUSTOM)return {err:'You can have up to '+MAX_CUSTOM+' tags of your own. Remove one first.'};
 let id='x'+Date.now().toString(36);while(allTags().some(x=>x[0]===id))id+='a';
 id=id.slice(0,13);
 META.ctags=customTags().concat({id,name});saveMeta();
 return {id,name};
}
export function renameCustomTag(id,raw){
 const name=clean(raw),list=customTags(),t=list.find(x=>x.id===id);
 if(!t)return {err:'That tag no longer exists.'};
 if(!name)return {err:'A tag needs a name.'};
 if(taken(name,id))return {err:'You already have a tag called that.'};
 t.name=name;META.ctags=list;saveMeta();
 return {id,name};
}
/* removes the tag and takes it off every day that had it */
export function removeCustomTag(id){
 META.ctags=customTags().filter(x=>x.id!==id);
 for(const k of Object.keys(E)){
  const t=E[k].tags;
  if(t&&t.includes(id)){const nx=t.filter(x=>x!==id);if(nx.length)E[k].tags=nx;else delete E[k].tags}
 }
 save();saveMeta();
}

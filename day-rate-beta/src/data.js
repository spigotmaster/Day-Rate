import {$,today} from './util.js';
import {renderNotify,timeChanged} from './notify.js';
import {E,H,META,VERSION,comp,errorLog,fmt,ls,save,saveMeta,setE,status} from './state.js';
import {TAGLBL} from './rate.js';
import {GOAL_LETTERS,avgInfo,goalSuggestion,gradesOn,suggestText} from './grade-ui.js';
import {CID,MAX_LEN,TAGS,addCustomTag,customTags,removeCustomTag,renameCustomTag,usesOf} from './tags.js';
import {ac,celebrate,tone} from './celebrate.js';
import {achSync} from './ach-ui.js';
import {renderLock} from './lock-ui.js';

/* data: export, backup, import */
export const canonOf=m=>JSON.stringify(Object.keys(m).sort().map(k=>{const a=[k,m[k].m,m[k].p,m[k].c,m[k].note||''],g=m[k].tags;if(g&&g.length)a.push(g.join(','));return a}));
export async function sha(t){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function csv(){
 const q=t=>{t=String(t||'');if(/^[=+\-@\t\r]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'};
 return '\ufeff'+['date,mood,productivity,connection,mood_pts,productivity_pts,connection_pts,score,note,tags'].concat(Object.keys(E).sort().map(k=>{const e=E[k];return [k,e.m,e.p,e.c,fmt(comp(e,'m')),fmt(comp(e,'p')),fmt(comp(e,'c')),fmt(H(e)),q(e.note),q((e.tags||[]).map(x=>TAGLBL[x]).join('; '))].join(',')})).join('\r\n')+'\r\n';
}
export async function backupText(){return JSON.stringify({app:'dayrate',version:1,exported_at:new Date().toISOString(),entries:E,ctags:customTags(),goal:META.goal||null,goalAvg:!!META.goalAvg,ach:META.ach||{},bday:META.bday||null,checksum:await sha(canonOf(E))})}
export function markBackup(){META.lastBackup=Date.now();saveMeta();renderData()}
export async function deliver(name,text,type,after){
 if(status.demo)return alert('Sample data is showing. Exit the sample first.');
 const f=new File([text],name,{type});
 try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});after&&after();return}}catch(e){if(e&&e.name==='AbortError')return}
 const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(a.href),4000);after&&after();
}
$('#xcsv').onclick=()=>deliver('day-rate-'+today()+'.csv',csv(),'text/csv');
$('#rtime').onchange=e=>{META.remind=e.target.value;saveMeta();timeChanged();renderNotify()};
$('#rics').onclick=()=>{
 const tm=($('#rtime').value||'20:00').split(':'),hh=tm[0].padStart(2,'0'),mm=(tm[1]||'00').padStart(2,'0'),d0=today().replace(/-/g,'');
 const url=location.href.split('#')[0].split('?')[0],stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
 const fold=l=>{let o='';while(l.length>74){o+=l.slice(0,74)+'\r\n ';l=l.slice(74)}return o+l};
 const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Day Rate//Reminder//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:dayrate-reminder-'+d0+'@dayrate','DTSTAMP:'+stamp,'DTSTART:'+d0+'T'+hh+mm+'00','DURATION:PT15M','RRULE:FREQ=DAILY','SUMMARY:Rate your day','DESCRIPTION:Open Day Rate: '+url,'URL:'+url,'BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY','DESCRIPTION:Rate your day','END:VALARM','END:VEVENT','END:VCALENDAR'];
 deliver('day-rate-reminder.ics',L.map(fold).join('\r\n')+'\r\n','text/calendar');
};
$('#xjson').onclick=async()=>deliver('day-rate-backup-'+today()+'.json',await backupText(),'application/json',markBackup);
$('#xdbg').onclick=async e=>{const b=e.currentTarget;const t=errorLog.asText({version:VERSION,schema:status.schema,entryCount:Object.keys(E).length,userAgent:navigator.userAgent})+'\nstorage: '+status.backend+' (loaded from '+status.from+')';try{await navigator.clipboard.writeText(t);b.textContent='Copied'}catch(x){b.textContent='Copy failed'}setTimeout(()=>b.textContent='Copy debug info',2000)};
$('#xdbgclr').onclick=e=>{errorLog.clear();const b=e.currentTarget;b.textContent='Cleared';setTimeout(()=>b.textContent='Clear error log',1500)};
$('#xcopy').onclick=async e=>{const b=e.currentTarget;try{await navigator.clipboard.writeText(await backupText());markBackup();b.textContent='Copied'}catch(x){b.textContent='Copy failed'}setTimeout(()=>b.textContent='Copy backup text',2000)};
$('#ximp').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(f)importText(await f.text())};
export async function importText(t){
 if(status.demo)return alert('Sample data is showing. Exit the sample first.');
 let o;try{o=JSON.parse(t)}catch(e){return alert('That file is not valid JSON. Nothing changed.')}
 if(!o||o.app!=='dayrate'||!o.entries||typeof o.entries!=='object')return alert('That is not a Day Rate backup. Nothing changed.');
 if(o.version>1)return alert('This backup is from a newer version. Update the app first. Nothing changed.');
 const imp=Array.isArray(o.ctags)?o.ctags.filter(x=>x&&CID.test(x.id)&&typeof x.name==='string'&&x.name.trim()).map(x=>({id:x.id,name:x.name.trim().slice(0,MAX_LEN)})):[];
 const order=[...new Set(TAGS.map(x=>x[0]).concat(imp.map(x=>x.id),customTags().map(x=>x.id)))],tagsIn=l=>order.filter(id=>l.includes(id));
 const ent={};
 for(const k of Object.keys(o.entries)){const e=o.entries[k];if(!/^\d{4}-\d\d-\d\d$/.test(k)||!e||![e.m,e.p,e.c].every(v=>Number.isInteger(v)&&v>=1&&v<=10))return alert('The backup has an invalid entry. Nothing changed.');ent[k]={m:e.m,p:e.p,c:e.c,note:String(e.note||'').slice(0,140),created:e.created||Date.now(),updated:e.updated||Date.now()};const g=tagsIn(Array.isArray(e.tags)?e.tags:[]);if(g.length)ent[k].tags=g}
 if(await sha(canonOf(ent))!==o.checksum)return alert('Checksum does not match. The file was changed or damaged. Nothing changed.');
 const ks=Object.keys(ent).sort();
 if(!confirm('Replace '+Object.keys(E).length+' days on this device with '+ks.length+' days from the backup'+(ks.length?' ('+ks[0]+' to '+ks[ks.length-1]+')':'')+'? Data is replaced, not merged.'))return;
 try{localStorage.setItem('dayrate:snap',JSON.stringify(E))}catch(e){}
 setE(ent);save();
 if(imp.length){const merged=customTags().slice();imp.forEach(x=>{const f=merged.find(y=>y.id===x.id);if(f)f.name=x.name;else merged.push(x)});META.ctags=merged;saveMeta()}
 if(o.ach&&typeof o.ach==='object'){META.ach=META.ach||{};for(const k of Object.keys(o.ach))if(/^[a-z_0-9]+#\d$/.test(k)&&/^\d{4}-\d\d-\d\d$/.test(o.ach[k])&&!META.ach[k])META.ach[k]=o.ach[k];saveMeta()}
 if(o.goal&&Number.isInteger(o.goal.n)&&o.goal.n>=1&&o.goal.n<=7&&GOAL_LETTERS.includes(o.goal.min)&&!META.goal){META.goal={n:o.goal.n,min:o.goal.min};saveMeta()}
 if(o.goalAvg===true&&META.goalAvg==null){META.goalAvg=true;saveMeta()}
 if(typeof o.bday==='string'&&/^\d\d-\d\d$/.test(o.bday)&&!META.bday){META.bday=o.bday;saveMeta()}
 renderData();alert('Imported '+ks.length+' days.');
}
$('#xundo').onclick=()=>{try{const sn=JSON.parse(ls('dayrate:snap'));if(sn&&confirm('Restore the data from before the last import?')){setE(sn);save();localStorage.removeItem('dayrate:snap');renderData()}}catch(e){}};
$('#gron').onchange=e=>{META.grades=e.target.checked;saveMeta();try{achSync()}catch(x){}};
$('#hapt').onchange=e=>{META.haptics=e.target.checked;saveMeta()};
$('#bday').onchange=e=>{const v=e.target.value;if(/^\d{4}-\d\d-\d\d$/.test(v))META.bday=v.slice(5);else delete META.bday;saveMeta();try{achSync()}catch(x){}};
$('#snd').onchange=e=>{META.sound=e.target.checked;saveMeta();if(e.target.checked){ac();tone(880,0,.2,'sine',.15)}};
$('#celTest').onclick=()=>celebrate([{title:'Driven III',desc:'Productivity of 8 or more on 365 days',date:today(),level:3,levels:3},{title:'Triple Eight',desc:'All three ratings at 8 or more on the same day',date:today(),level:1,levels:1}]);
/* Data > Your tags: rename, remove (with an are-you-sure step), add */
/* Data > Weekly grade goal */
export function renderGoal(){
 const n=$('#goalN'),m=$('#goalMin'),g=META.goal||{n:3,min:'B+'},dm=status.demo;
 if(!n.options.length){for(let i=1;i<=7;i++)n.add(new Option(i,i));GOAL_LETTERS.forEach(l=>m.add(new Option(l,l)))}
 n.value=g.n;m.value=g.min;n.disabled=m.disabled=$('#goalSet').disabled=$('#goalClear').disabled=dm;
 $('#goalAvg').checked=!!META.goalAvg;$('#goalAvg').disabled=dm;
 const sg=$('#goalSuggest'),sug=goalSuggestion(),av=avgInfo();sg.replaceChildren();
 if(sug&&!dm){const p=document.createElement('p'),b=document.createElement('button');p.textContent='Suggested: '+suggestText(sug)+'.';b.type='button';b.className='btn';b.textContent='Use this goal';b.onclick=()=>{n.value=sug.n;m.value=sug.min};sg.append(p,b)}
 if(av&&!dm){const p=document.createElement('p');p.textContent='Your usual week averages '+av.target.letter+' ('+av.target.gpa.toFixed(1)+' GPA), from your last '+av.target.weeks+' weeks.';sg.appendChild(p)}
 $('#goalMsg').textContent=dm?'Sample data is showing, so the goal cannot be changed.':META.goal?'Goal: '+META.goal.n+' days a week at '+META.goal.min+' or better.'+(gradesOn()?'':' Grades are off, so it is hidden.'):'No goal set.';
}
$('#goalSet').onclick=()=>{META.goal={n:+$('#goalN').value,min:$('#goalMin').value};delete META.goalNo;saveMeta();renderGoal()};
$('#goalAvg').onchange=e=>{META.goalAvg=e.target.checked;saveMeta();renderGoal()};
$('#goalClear').onclick=()=>{delete META.goal;saveMeta();renderGoal()};
export function renderCustomTags(){
 const box=$('#ctagList'),dm=status.demo,list=customTags(),msg=$('#ctagMsg');
 box.replaceChildren();
 if(!list.length){const p=document.createElement('p');p.textContent='No tags of your own yet.';box.appendChild(p)}
 const mk=(txt,cls,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn '+cls;b.textContent=txt;b.onclick=fn;return b};
 list.forEach(t=>{
  const row=document.createElement('div'),inp=document.createElement('input'),n=usesOf(t.id);
  row.className='ctrow';inp.type='text';inp.value=t.name;inp.maxLength=MAX_LEN;inp.disabled=dm;inp.setAttribute('aria-label','Name of tag '+t.name);
  inp.onchange=()=>{const r=renameCustomTag(t.id,inp.value);if(r.err){msg.textContent=r.err;inp.value=t.name}else{msg.textContent='Renamed.';t.name=r.name}};
  const rm=mk('Remove','sec',()=>{
   const p=document.createElement('p'),a=document.createElement('div');a.className='acts';
   p.textContent='Remove \u201c'+t.name+'\u201d'+(n?' and take it off '+n+(n===1?' day':' days'):'')+'? This cannot be undone.';
   const keep=mk('Keep it','',()=>renderCustomTags()),yes=mk('Yes, remove','yes',()=>{removeCustomTag(t.id);msg.textContent='Removed.';renderCustomTags()});
   a.append(keep,yes);row.replaceChildren(p,a);row.setAttribute('role','alertdialog');row.setAttribute('aria-label','Confirm remove tag');keep.focus();
  });
  rm.disabled=dm;row.append(inp,rm);box.appendChild(row);
 });
 $('#ctagNew').disabled=$('#ctagAdd').disabled=dm;
 if(dm)msg.textContent='Sample data is showing, so tags cannot be changed. Exit the sample to use them.';
}
$('#ctagForm').onsubmit=ev=>{
 ev.preventDefault();if(status.demo)return;
 const r=addCustomTag($('#ctagNew').value),msg=$('#ctagMsg');
 if(r.err){msg.textContent=r.err;return}
 $('#ctagNew').value='';msg.textContent='Added \u201c'+r.name+'\u201d.';renderCustomTags();
};
export function renderData(){
 const dm=status.demo;['xcsv','xjson','xcopy','ximp','xundo','onbAgain'].forEach(id=>{const e=$('#'+id);if(e)e.disabled=dm});$('#demoNote').hidden=!dm;
 $('#lastbk').textContent=META.lastBackup?'Last backup: '+new Date(META.lastBackup).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'No backup yet. Make one before you trust this app with your days.';
 $('#rtime').value=META.remind||'20:00';renderNotify();
 $('#hapt').checked=META.haptics;
 $('#gron').checked=META.grades!==false;
 renderCustomTags();renderGoal();renderLock();
 $('#bday').value=META.bday?'2000-'+META.bday:'';
 $('#snd').checked=META.sound!==false;
 $('#xundo').hidden=!ls('dayrate:snap');
 $('#ver').textContent='Day Rate beta '+VERSION+' · '+Object.keys(E).length+' days stored on this device only';
 try{navigator.storage.persisted().then(v=>{$('#stor').textContent=v?'Storage protection: on.':'Storage protection: not granted. Back up regularly.'})}catch(e){$('#stor').textContent=''}
}


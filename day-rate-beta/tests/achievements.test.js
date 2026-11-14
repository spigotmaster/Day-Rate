const test=require('node:test'),assert=require('node:assert');
const {evaluate,CFG}=require('../achievements.js');
const ds=n=>new Date(Date.UTC(2026,0,1)+n*864e5).toISOString().slice(0,10);
function make(n,f){const E={};for(let i=0;i<n;i++){const [m,p,c]=f(i);E[ds(i)]={m,p,c}}return E}
const get=(r,id)=>r.find(a=>a.id===id);
let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
const rr=()=>1+Math.floor(rnd()*10);

test('empty data gives all locked, no errors',()=>{
 const r=evaluate({},'2026-06-01');
 assert.strictEqual(r.length,CFG.count);
 r.forEach(a=>{assert.strictEqual(a.have,0);a.tiers.forEach(t=>assert.strictEqual(t.date,null))});
});
test('Driven: 50th productivity 8+ day sets the tier-1 date',()=>{
 const E=make(60,i=>[5,i%2?8:5,5]);            // 8s on odd days: 30 days only
 assert.strictEqual(get(evaluate(E,ds(70)),'driven').tiers[0].date,null);
 const F=make(60,()=>[5,9,5]);                  // every day
 const d=get(evaluate(F,ds(70)),'driven');
 assert.strictEqual(d.tiers[0].date,ds(49));
 assert.strictEqual(d.tiers[1].date,null);
 assert.strictEqual(d.have,60);
});
test('Streaks need consecutive calendar days',()=>{
 const E=make(10,()=>[8,8,8]);delete E[ds(3)];
 assert.strictEqual(get(evaluate(E,ds(20)),'good_stretch').have,6);   // days 4..9
});
test('Eight Eights triggers on the 8th triple-8 day',()=>{
 const E=make(20,i=>i%2?[8,8,8]:[5,5,5]);
 assert.strictEqual(get(evaluate(E,ds(30)),'eight_eights').tiers[0].date,ds(15));
 assert.strictEqual(get(evaluate(E,ds(30)),'triple_eight').tiers[0].date,ds(1));
});
test('Upswing needs 0.5 over the previous 14 days',()=>{
 const E=make(28,i=>i<14?[5,5,5]:[6,5,5]);
 const r=evaluate(E,ds(40));
 assert.strictEqual(get(r,'upswing_m').tiers[0].date,ds(23));
 assert.strictEqual(get(r,'upswing_p').tiers[0].date,null);
});
test('Incomplete current month never counts as complete',()=>{
 const E=make(60,()=>[7,7,7]);
 const r=evaluate(E,ds(59));
 assert.ok(get(r,'long_haul').tiers.every(t=>!t.date));
});
test('Random data: tracks are sane, dates are real and not in the future',()=>{
 const E=make(500,()=>[rr(),rr(),rr()]);
 const today=ds(520),r=evaluate(E,today);
 r.forEach(a=>{
  let last='';
  a.tiers.forEach(t=>{
   if(t.date){assert.match(t.date,/^\d{4}-\d{2}-\d{2}$/);assert.ok(t.date<=today,a.id+' future date');assert.ok(t.date>=last,a.id+' tier order');last=t.date}
  });
 });
});
test('Bad entries are ignored',()=>{
 const r=evaluate({'2026-01-01':{m:11,p:5,c:5},'junk':{m:5,p:5,c:5},'2026-01-02':null},'2026-02-01');
 assert.strictEqual(get(r,'driven').have,0);
});

/* ---------- beta 1.11 achievements ---------- */
const dd=(y,m,d)=>new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10);
const span=(from,n,f)=>{const E={},b=Date.UTC(...from.split('-').map((v,i)=>i===1?v-1:+v));for(let i=0;i<n;i++)E[new Date(b+i*864e5).toISOString().slice(0,10)]=(()=>{const [m,p,c]=f(i);return {m,p,c}})();return E};

test('Habit Formed: consecutive days only, a gap restarts the run',()=>{
 const E=span('2026-01-01',10,()=>[5,5,5]);delete E['2026-01-04'];
 const h=get(evaluate(E,'2026-02-01'),'habit_formed');
 assert.strictEqual(h.have,6);
 const F=span('2026-01-01',30,()=>[5,5,5]);
 assert.strictEqual(get(evaluate(F,'2026-03-01'),'habit_formed').tiers[1].date,'2026-01-30');
});
test('Full Week: needs all 7 days of a Monday to Sunday week, dated on the Sunday',()=>{
 // 2026-01-05 is a Monday
 const E=span('2026-01-05',7,()=>[5,5,5]);
 assert.strictEqual(get(evaluate(E,'2026-02-01'),'full_week').tiers[0].date,'2026-01-11');
 const F=span('2026-01-06',7,()=>[5,5,5]);                       // Tue to Mon: no complete week
 assert.strictEqual(get(evaluate(F,'2026-02-01'),'full_week').have,0);
 delete E['2026-01-08'];
 assert.strictEqual(get(evaluate(E,'2026-02-01'),'full_week').have,0);
});
test('Full Month: every day of a calendar month, dated on its last day',()=>{
 const E=span('2026-01-01',31,()=>[5,5,5]);
 assert.strictEqual(get(evaluate(E,'2026-03-01'),'full_month').tiers[0].date,'2026-01-31');
 delete E['2026-01-15'];
 assert.strictEqual(get(evaluate(E,'2026-03-01'),'full_month').have,0);
 const F=span('2026-02-01',28,()=>[5,5,5]);                      // February 2026 has 28 days
 assert.strictEqual(get(evaluate(F,'2026-03-01'),'full_month').tiers[0].date,'2026-02-28');
 const G=span('2026-03-01',20,()=>[5,5,5]);                      // current month unfinished
 assert.strictEqual(get(evaluate(G,'2026-03-20'),'full_month').have,0);
});
test('Centurion: 100th rated day sets level 1',()=>{
 const E=make(120,()=>[5,5,5]);
 const c=get(evaluate(E,ds(130)),'centurion');
 assert.strictEqual(c.tiers[0].date,ds(99));
 assert.strictEqual(c.tiers[1].date,null);
 assert.strictEqual(c.tiers.length,4);
});
test('Lucky Seven, Staircase and Fresh Start',()=>{
 const E={'2026-01-01':{m:7,p:7,c:7},'2026-01-02':{m:4,p:5,c:6},'2026-01-03':{m:4,p:5,c:7},'2026-02-10':{m:7,p:7,c:6}};
 const r=evaluate(E,'2026-03-01');
 assert.strictEqual(get(r,'lucky_seven').tiers[0].date,'2026-01-01');
 assert.strictEqual(get(r,'staircase').tiers[0].date,'2026-01-02');
 assert.strictEqual(get(r,'staircase').have,1);                  // 4,5,7 is not a staircase
 assert.strictEqual(get(r,'fresh_start').tiers[0].date,'2026-01-01');
 const F=evaluate({'2026-01-02':{m:7,p:7,c:7}},'2026-03-01');
 assert.strictEqual(get(F,'fresh_start').have,0);
});
test('Rough Patch Survivor: 3 low days then a better week, dated 7 days after the patch',()=>{
 const E=span('2026-01-01',20,()=>[7,7,7]);
 Object.assign(E,span('2026-01-21',3,()=>[3,3,3]),span('2026-01-24',7,()=>[8,8,8]));
 const r=get(evaluate(E,'2026-02-15'),'rough_patch');
 assert.strictEqual(r.tiers[0].date,'2026-01-30');               // patch ends 23 Jan, +7 days
 // week after is not better than before: not earned
 const F=span('2026-01-01',20,()=>[7,7,7]);
 Object.assign(F,span('2026-01-21',3,()=>[3,3,3]),span('2026-01-24',7,()=>[6,6,6]));
 assert.strictEqual(get(evaluate(F,'2026-02-15'),'rough_patch').have,0);
 // only 2 low days: not a patch
 const G=span('2026-01-01',20,()=>[7,7,7]);
 Object.assign(G,span('2026-01-21',2,()=>[3,3,3]),span('2026-01-23',7,()=>[8,8,8]));
 assert.strictEqual(get(evaluate(G,'2026-02-15'),'rough_patch').have,0);
 // week not finished yet: not earned
 assert.strictEqual(get(evaluate(E,'2026-01-28'),'rough_patch').have,0);
 // too little history before the patch
 const H=span('2026-01-01',5,()=>[7,7,7]);
 Object.assign(H,span('2026-01-06',3,()=>[3,3,3]),span('2026-01-09',7,()=>[8,8,8]));
 assert.strictEqual(get(evaluate(H,'2026-02-15'),'rough_patch').have,0);
});
test('Engine version and new-achievement flags',()=>{
 const {CFG}=require('../achievements.js');
 assert.strictEqual(CFG.v,3);
 const r=evaluate({},'2026-03-01');
 assert.strictEqual(get(r,'driven').v,1);
 assert.strictEqual(get(r,'centurion').v,2);
 ['honor_roll','straight_as','top_of_class','comeback','deans_list'].forEach(id=>assert.strictEqual(get(r,id).v,3,id));
 assert.ok(r.every(a=>['highs','streaks','growth','balance','bw','grades','habit','fun'].includes(a.group)));
});

test('Fresh Start: birthday counts when set, and only then',()=>{
 const E={'2026-05-17':{m:5,p:5,c:5}};
 assert.strictEqual(get(evaluate(E,'2026-06-01'),'fresh_start').have,0);
 assert.strictEqual(get(evaluate(E,'2026-06-01',{bday:'05-17'}),'fresh_start').tiers[0].date,'2026-05-17');
 assert.strictEqual(get(evaluate(E,'2026-06-01',{bday:'bad'}),'fresh_start').have,0);
});

/* ---- grades (engine v3): graded as rated, against earlier days only, after 14 days of history ---- */
const flat=(n,v)=>make(n,()=>v);
function stepUp(base,extra){ // 14 plain days, then `extra` tens
 return make(base+extra,i=>i<base?[5,5,5]:[10,10,10]);
}
test('Grades: nothing counts before 14 days of history',()=>{
 const r=evaluate(flat(13,[9,9,9]),ds(30));
 ['honor_roll','straight_as','top_of_class','comeback','deans_list'].forEach(id=>assert.strictEqual(get(r,id).have,0,id));
});
test('Grades: Top of the Class is the first day clearly above everything before it',()=>{
 const r=evaluate(stepUp(14,3),ds(40));
 const t=get(r,'top_of_class');
 assert.strictEqual(t.tiers[0].date,ds(14));
 assert.strictEqual(t.have,1); // the second ten only ties with the first, so it grades A, not A+
});
test('Grades: Honor Roll and Straight A\'s count consecutive graded days',()=>{
 const E=stepUp(14,21);
 const hr=get(evaluate(E,ds(60)),'honor_roll'),sa=get(evaluate(E,ds(60)),'straight_as');
 assert.strictEqual(hr.tiers[0].date,ds(18));   // 5th day in a row
 assert.strictEqual(hr.tiers[2].date,ds(34));   // 21st day in a row, still B+ or better
 assert.strictEqual(sa.tiers[2].date,ds(21));   // 8th day in a row at A- or better
 assert.strictEqual(sa.have,14);                // the 15th ten slips to B+
 const gap=stepUp(14,21);delete gap[ds(20)];
 assert.ok(get(evaluate(gap,ds(60)),'honor_roll').have<21);
});
test('Grades: Comeback needs a D or F day, then an A- or better day straight after',()=>{
 const E=make(16,i=>i<14?(i%2?[6,6,6]:[5,5,5]):i===14?[1,1,1]:[10,10,10]);
 assert.strictEqual(get(evaluate(E,ds(40)),'comeback').tiers[0].date,ds(15));
 const F=make(17,i=>i<14?(i%2?[6,6,6]:[5,5,5]):i===14?[1,1,1]:i===15?[5,5,5]:[10,10,10]);
 assert.strictEqual(get(evaluate(F,ds(40)),'comeback').have,0);
});
test('Grades: Dean\'s List needs a complete month, 15 graded days, B+ average',()=>{
 const E=make(31,i=>i<14?[5,5,5]:[10,10,10]);
 const d=get(evaluate(E,'2026-03-01'),'deans_list');
 assert.strictEqual(d.tiers[0].date,'2026-01-31');
 assert.strictEqual(get(evaluate(E,'2026-01-31'),'deans_list').have,0); // the month is not over yet
 assert.strictEqual(get(evaluate(make(31,()=>[6,6,6]),'2026-03-01'),'deans_list').tiers[0].date,null); // all equal days grade B, which is 3.0, under B+
});
test('Grades: earned grades never move when later days are added',()=>{
 const E=stepUp(14,21),G=stepUp(14,21);
 for(let i=35;i<70;i++)G[ds(i)]={m:1,p:1,c:1};
 const a=evaluate(E,ds(80)),b=evaluate(G,ds(80));
 ['honor_roll','straight_as','top_of_class'].forEach(id=>get(a,id).tiers.forEach((t,i)=>assert.strictEqual(get(b,id).tiers[i].date,t.date,id)));
});
